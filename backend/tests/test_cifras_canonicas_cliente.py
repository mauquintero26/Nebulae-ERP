"""B4 T24: las tarjetas del cliente fuera de Ventas que llevan el nombre de un KPI del catálogo dan la cifra canónica.
- B49-b: GET /chat/customer-context (la tarjeta del Asistente): «Pedidos en curso» (active_orders_count) = pven_en_curso
  (estado fuera de ESTADOS_VEN_CERRADOS: sin entregados, facturados, cancelados ni devueltos) y «Total de pedidos»
  (total_orders_count) = pven_total de Ventas (todos los pedidos, cancelados incluidos). Antes contaba los FACTURADO y los
  DEVUELTO_TOTAL como en curso y dejaba fuera los cancelados del total.
- B50-b: GET /crm/customers/{id}/profile-360 (el «Saldo por cobrar» de la Agenda): Σ max(0, saldo_cop) sin cancelados ni
  devueltos, como pven_saldo_por_cobrar. Antes sumaba el saldo de los DEVUELTO_TOTAL y restaba un saldo negativo.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_cifras_canonicas_cliente).
"""
import uuid

from app.models.customers import Customer
from app.models.erp_documents import SaleOrder


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _cliente_con_pedidos(db, extra=()):
    s = uuid.uuid4().hex[:8].upper()
    cliente = Customer(first_name="Cifra", last_name=f"Canonica {s}")
    db.add(cliente)
    db.commit()
    pedidos = [("PENDIENTE_COMPRA", 100, 60), ("EN_PROCESO", 200, 50), ("LISTO_ENTREGA", 300, -20),
               ("FACTURADO", 400, 0), ("ENTREGADO", 500, 30), ("CANCELADO", 600, 600), ("DEVUELTO_TOTAL", 700, 70),
               *extra]
    for i, (estado, total, saldo) in enumerate(pedidos):
        db.add(SaleOrder(numero=f"PV-CC{s}{i}", customer_id=cliente.id, customer_name=cliente.first_name, estado=estado,
                         total_cop=total, saldo_cop=saldo))
    db.commit()
    return cliente


def test_asistente_pedidos_en_curso_y_total_canonicos(app_client, db, admin_token):
    cliente = _cliente_con_pedidos(db)
    resp = app_client.get("/api/v1/chat/customer-context", params={"customer_id": cliente.id}, headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    revenue = resp.json()["data"]["revenue"]
    assert revenue["active_orders_count"] == 3    # PENDIENTE_COMPRA, EN_PROCESO y LISTO_ENTREGA
    assert revenue["total_orders_count"] == 7     # todos, como pven_total de /ventas/stats


def test_perfil_360_saldo_por_cobrar_canonico(app_client, db, admin_token):
    cliente = _cliente_con_pedidos(db)
    resp = app_client.get(f"/api/v1/crm/customers/{cliente.id}/profile-360", headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    resumen = resp.json()["data"]["resumen_financiero"]
    # 60 + 50 + max(0, -20) + 0 + 30; sin el cancelado (600) ni el devuelto (70)
    assert resumen["saldo_pendiente_cop"] == 140.0



def test_asistente_listas_y_ticket_con_la_regla_de_la_tarjeta(app_client, db, admin_token):
    """B4 T24 r1:
    - m7 + m30: «Pedidos en curso» se cuenta en SQL con rv.f_pven_en_curso (no una copia en Python): un estado en
      minúsculas no se pasa a mayúsculas, como en Ventas. (Un estado NULL no puede existir: la columna es NOT NULL.)
    - m36: las pestañas «Activos» y «Entregados» y el ticket promedio usan la MISMA regla que la tarjeta: Activos = los en
      curso; Entregados = ENTREGADO y FACTURADO (los cerrados con dinero); fuera, CANCELADO y DEVUELTO_TOTAL. Antes
      «Activos (5)» al lado de «Pedidos en curso 3»."""
    from sqlalchemy import func, text
    from app.core import resolucion_ventas as rv
    cliente = _cliente_con_pedidos(db, extra=(("entregado", 800, 0),))
    assert db.execute(text("SELECT is_nullable FROM information_schema.columns WHERE table_name = 'sale_orders' "
                           "AND column_name = 'estado'")).scalar() == "NO"
    resp = app_client.get("/api/v1/chat/customer-context", params={"customer_id": cliente.id}, headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    data = resp.json()["data"]
    revenue = data["revenue"]
    en_curso = (db.query(func.count(SaleOrder.id))
                .filter(SaleOrder.customer_id == cliente.id, rv.f_pven_en_curso(SaleOrder)).scalar())
    # PENDIENTE_COMPRA, EN_PROCESO, LISTO_ENTREGA y el 'entregado' en minúsculas (para Ventas está en curso)
    assert revenue["active_orders_count"] == en_curso == 4
    assert len(data["active_orders"]) == revenue["active_orders_count"]
    assert sorted(o["total_cop"] for o in data["active_orders"]) == [100, 200, 300, 800]
    assert sorted(o["total_cop"] for o in data["closed_orders"]) == [400, 500]      # FACTURADO y ENTREGADO
    assert revenue["completed_orders_count"] == len(data["closed_orders"]) == 2
    assert revenue["total_spent_cop"] == 2300.0                                      # Activos + Entregados
    assert abs(revenue["avg_ticket_cop"] - 2300 / 6) < 1e-9                          # sobre los mismos 6
    assert revenue["total_orders_count"] == 8
