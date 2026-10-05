"""H35+H48: la nota de la Solicitud llega a la Cotizacion y al Pedido de Venta, EN VIVO y por separado.

- GET /cotizaciones/{id} trae `sc_notas` (la nota actual de la SC vinculada, o None si no hay SC o esta en blanco).
- GET /pedidos/{id} trae `sc_notas` y `cot_notas` con la misma regla.
- La nota de la SC nunca se escribe en cot.notas ni en pedido.notas (no se copia nada: cambia si la SC cambia).
- Los listados no traen estos campos (para no meter una consulta por fila).

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_notas_solicitud_en_cotizacion_y_pedido
"""
import datetime

from app.models.erp_documents import CustomerRequest, SalesQuotation, SaleOrder

LINEA = {"product_name": "Cuna Colecho", "qty": 1}
VERIFICACION = {"monto": 2000, "metodo_pago": "Transferencia bancaria", "referencia": "BANCOL-NOTA"}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sc(db, numero, user_admin, **campos):
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", advisor_user_id=user_admin.id,
                         advisor_name=user_admin.email, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, sc=None, **campos):
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, sc_id=sc.id if sc else None, sc_numero=sc.numero if sc else None,
                         customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _get(app_client, token, ruta, doc_id):
    resp = app_client.get(f"/api/v1/ventas/{ruta}/{doc_id}", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_la_cotizacion_creada_desde_la_sc_muestra_la_nota_de_la_solicitud_aparte(app_client, db, admin_token,
                                                                                 user_admin):
    sc = _sc(db, "SC-NOTA001", user_admin, estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow(),
             productos=[LINEA], notas="Cliente prefiere color gris")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot_id = resp.json()["data"]["cotizacion"]["id"]
    d = _get(app_client, admin_token, "cotizaciones", cot_id)
    assert d["sc_notas"] == "Cliente prefiere color gris"
    assert d["notas"] is None  # no se mezclan


def test_el_pedido_muestra_la_nota_de_la_solicitud_y_la_de_la_cotizacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-NOTA002", user_admin, notas="Nota SC")
    cot = _cot(db, "COT-NOTA002", sc, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow(),
               total_cop=2000, subtotal_cop=2000, notas="Nota COT",
               productos=[{"product_name": "Cuna", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000}])
    # N1: la SC es de Contado (100% de anticipo), asi que el pedido nace con la verificacion del pago.
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar",
                           json={"user_name": "asesor@test", "verificacion_anticipo": VERIFICACION},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = _get(app_client, admin_token, "pedidos", resp.json()["data"]["sale_order_id"])
    assert d["sc_notas"] == "Nota SC"
    assert d["cot_notas"] == "Nota COT"
    assert d["notas"] == "Nota COT"  # al convertir, el pedido hereda la nota de la cotizacion (no la de la SC)


def test_el_pedido_a_credito_tambien_muestra_las_notas(app_client, db, admin_token, user_admin):
    """Mismo caso que arriba, sin verificar pago: una SC a credito no exige anticipo."""
    sc = _sc(db, "SC-NOTA005", user_admin, notas="Nota SC credito", modalidad_pago="Crédito 30 días")
    cot = _cot(db, "COT-NOTA005", sc, estado="CONFIRMADA", gate2_confirmed_at=datetime.datetime.utcnow(),
               total_cop=2000, subtotal_cop=2000, notas="Nota COT credito",
               productos=[{"product_name": "Cuna", "qty": 2, "unit_price_cop": 1000, "total_cop": 2000}])
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "asesor@test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    d = _get(app_client, admin_token, "pedidos", resp.json()["data"]["sale_order_id"])
    assert (d["sc_notas"], d["cot_notas"]) == ("Nota SC credito", "Nota COT credito")


def test_cotizacion_sin_solicitud_no_trae_nota_de_solicitud(app_client, db, admin_token, user_admin):
    cot = _cot(db, "COT-NOTA003")
    assert _get(app_client, admin_token, "cotizaciones", cot.id)["sc_notas"] is None
    # Una nota en blanco (solo espacios) tampoco cuenta.
    sc = _sc(db, "SC-NOTA003", user_admin, notas="   ")
    cot2 = _cot(db, "COT-NOTA004", sc)
    assert _get(app_client, admin_token, "cotizaciones", cot2.id)["sc_notas"] is None
    # Ni una SC sin nota.
    sc2 = _sc(db, "SC-NOTA004", user_admin, notas=None)
    cot3 = _cot(db, "COT-NOTA006", sc2)
    assert _get(app_client, admin_token, "cotizaciones", cot3.id)["sc_notas"] is None


def test_cotizacion_creada_por_post_con_sc_id_tambien_muestra_la_nota(app_client, db, admin_token, user_admin):
    # C7/R11 (Bloque 2, T3): POST /cotizaciones con sc_id exige la confirmacion vigente del cliente.
    sc = _sc(db, "SC-NOTA006", user_admin, notas="Nota por POST", estado="CONFIRMADA",
             gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post("/api/v1/ventas/cotizaciones",
                           json={"sc_id": sc.id, "total_cop": 1000,
                                 "productos": [{"product_name": "Cuna", "qty": 1, "unit_price_cop": 1000}]},
                           headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    d = _get(app_client, admin_token, "cotizaciones", resp.json()["data"]["id"])
    assert d["sc_notas"] == sc.notas
    assert d["notas"] is None


def test_si_se_edita_la_nota_de_la_solicitud_la_cotizacion_y_el_pedido_muestran_la_nueva(app_client, db, admin_token,
                                                                                         user_admin):
    sc = _sc(db, "SC-NOTA007", user_admin, notas="Nota vieja")
    cot = _cot(db, "COT-NOTA007", sc, notas="Nota COT")
    ven = SaleOrder(numero="PVEN-NOTA007", sc_id=sc.id, cot_id=cot.id, customer_name="Cliente Prueba",
                    estado="PENDIENTE_COMPRA", notas="Nota COT")
    db.add(ven); db.commit(); db.refresh(ven)
    assert _get(app_client, admin_token, "cotizaciones", cot.id)["sc_notas"] == "Nota vieja"
    sc.notas = "Nota nueva"
    db.commit()
    assert _get(app_client, admin_token, "cotizaciones", cot.id)["sc_notas"] == "Nota nueva"
    assert _get(app_client, admin_token, "pedidos", ven.id)["sc_notas"] == "Nota nueva"
    # La nota de la SC nunca se copia a la COT ni al pedido.
    db.expire_all()
    assert db.get(SalesQuotation, cot.id).notas == "Nota COT"
    assert db.get(SaleOrder, ven.id).notas == "Nota COT"


def test_pedido_sin_solicitud_ni_cotizacion_no_trae_notas_ajenas(app_client, db, admin_token, user_admin):
    ven = SaleOrder(numero="PVEN-NOTA008", customer_name="Cliente Web", estado="PENDIENTE_COMPRA", notas="Solo del pedido")
    db.add(ven); db.commit(); db.refresh(ven)
    d = _get(app_client, admin_token, "pedidos", ven.id)
    assert d["sc_notas"] is None and d["cot_notas"] is None and d["notas"] == "Solo del pedido"
    # Un pedido con SC pero sin COT: la nota de la SC si, la de la COT no.
    sc = _sc(db, "SC-NOTA008", user_admin, notas="Nota SC sola")
    ven2 = SaleOrder(numero="PVEN-NOTA009", sc_id=sc.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA")
    db.add(ven2); db.commit(); db.refresh(ven2)
    d = _get(app_client, admin_token, "pedidos", ven2.id)
    assert d["sc_notas"] == "Nota SC sola" and d["cot_notas"] is None
    # Una nota de cotizacion en blanco es None.
    cot = _cot(db, "COT-NOTA008", None, notas="  ")
    ven3 = SaleOrder(numero="PVEN-NOTA010", cot_id=cot.id, customer_name="Cliente Prueba", estado="PENDIENTE_COMPRA")
    db.add(ven3); db.commit(); db.refresh(ven3)
    assert _get(app_client, admin_token, "pedidos", ven3.id)["cot_notas"] is None


def test_los_listados_no_traen_las_notas_de_la_solicitud(app_client, db, admin_token, user_admin):
    """Para no meter una consulta por fila: solo el detalle lee la SC."""
    sc = _sc(db, "SC-NOTA009", user_admin, notas="Nota lista")
    cot = _cot(db, "COT-NOTA009", sc)
    resp = app_client.get("/api/v1/ventas/cotizaciones", params={"search": cot.numero}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert "sc_notas" not in resp.json()["data"][0]


def test_el_detalle_de_la_cotizacion_lee_la_solicitud_una_sola_vez(app_client, db, admin_token, user_admin, contador_sql):
    """El anticipo (modalidad de la SC) y la nota comparten la misma lectura: sin una consulta extra por la nota."""
    sc = _sc(db, "SC-NOTA010", user_admin, notas="Nota SC")
    cot = _cot(db, "COT-NOTA010", sc)
    with contador_sql.ventana() as v:
        d = _get(app_client, admin_token, "cotizaciones", cot.id)
    assert d["sc_notas"] == "Nota SC" and d["sc_modalidad_pago"] == "Contado"
    assert len([s for s in v.sentencias if "FROM customer_requests" in s]) == 1, v.sentencias
