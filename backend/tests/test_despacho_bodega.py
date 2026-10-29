"""B4 T6B (KANBAN-logistica, solo despacho_bodega = «También Bodega, eligiendo la bodega de salida»; R15, RP23, D37):
PATCH /api/v1/ventas/pedidos/{id} acepta el rol BODEGA SOLO para pasar el pedido a ENTREGADO con la bodega de salida.

- BODEGA manda exactamente {estado: 'ENTREGADO', warehouse_id}; updated_by se ignora (no da 403) y el autor sale de la
  sesion (nombre_de_usuario). Otra clave u otro estado -> 403 «Bodega solo puede marcar el pedido como despachado.».
- Sin warehouse_id, o con una bodega que no existe -> 422 «Elige la bodega de salida.», antes de leer el pedido y sus
  lineas. La transicion sigue las reglas del Bloque 1 (TRANSICIONES_VEN_PATCH).
- La Actividad dice quien despacho y desde que bodega: «Estado cambiado a Entregado (despachado desde {bodega})».
- ADMIN y ASESOR siguen igual; BODEGA sigue sin poder usar los demas endpoints que cambian documentos de Ventas.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_despacho_bodega
"""
import uuid
from decimal import Decimal

from tests.usuarios_de_prueba import bodega_token, compras_token  # noqa: F401  (fixtures del runner, por nombre)

SOLO_DESPACHO = "Bodega solo puede marcar el pedido como despachado."
ELIGE_BODEGA = "Elige la bodega de salida."


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _usuario(db, token):
    from app.api.dependencies import usuario_de_token
    return usuario_de_token(token, db)


def _ven(db, estado="LISTO_ENTREGA", **campos):
    from app.models.erp_documents import SaleOrder
    v = SaleOrder(numero=f"PV-BD{uuid.uuid4().hex[:10].upper()}", customer_name="Cliente Despacho", estado=estado,
                  **campos)
    db.add(v)
    db.commit()
    db.refresh(v)
    return v


def _bodega_con_stock(db, sku, cantidad):
    from app.models.inventory import InventoryLevel, Warehouse
    bodega = Warehouse(name=f"Bodega Norte {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    nivel = InventoryLevel(sku_id=sku.id, warehouse_id=bodega.id, quantity=cantidad)
    db.add(nivel)
    db.commit()
    return bodega, nivel


def _patch(app_client, token, ven_id, body):
    return app_client.patch(f"/api/v1/ventas/pedidos/{ven_id}", json=body, headers=_auth(token))


def _logs(db, ven_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == ven_id)
    if accion is not None:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _operaciones(db, ven_id):
    from app.models.inventory import InventoryOperation
    return (db.query(InventoryOperation).filter(InventoryOperation.source_document_type == "PVEN",
                                                InventoryOperation.source_document_id == ven_id).all())


def _rol_no_autorizado(rol, requeridos):
    return (f"Rol '{rol}' (normalizado: '{rol}') no autorizado para esta operación. "
            f"Roles requeridos: {', '.join(sorted(requeridos))}")


# ─── Lo que Bodega SI puede hacer ────────────────────────────────────────────────────────────────────────────────────

def test_bodega_despacha_con_la_bodega_de_salida(app_client, db, bodega_token, sku):
    """BODEGA con warehouse_id pasa un pedido LISTO_ENTREGA a ENTREGADO (200): descuenta el inventario de esa bodega y
    la Actividad dice quien y desde que bodega."""
    from app.core.textos_actividad import nombre_de_usuario
    from app.models.inventory import InventoryMovement
    usuario = _usuario(db, bodega_token)
    bodega, nivel = _bodega_con_stock(db, sku, 10)
    ven = _ven(db, productos=[{"product_name": "Taladro", "qty": 3, "sku_id": sku.id}])
    resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": bodega.id})
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "ENTREGADO"
    db.expire_all()
    db.refresh(ven)
    db.refresh(nivel)
    assert ven.estado == "ENTREGADO"
    assert nivel.quantity == Decimal("7")
    [op] = _operaciones(db, ven.id)
    assert op.source_warehouse_id == bodega.id
    [mov] = db.query(InventoryMovement).filter(InventoryMovement.operation_id == op.id).all()
    assert (mov.quantity, mov.warehouse_id, mov.direction) == (Decimal("3"), bodega.id, "OUT")
    [renglon] = _logs(db, ven.id, "ESTADO_CHANGED")
    assert renglon.description == f"Estado cambiado a Entregado (despachado desde {bodega.name})"
    assert renglon.user_name == nombre_de_usuario(usuario)
    assert (renglon.old_estado, renglon.new_estado) == ("LISTO_ENTREGA", "ENTREGADO")


def test_bodega_despacha_sin_lineas_de_catalogo_y_desde_entregado_parcialmente(app_client, db, bodega_token):
    """La bodega es obligatoria para BODEGA aunque el pedido no tenga lineas de catalogo (no mueve inventario). Desde
    PARCIALMENTE_ENTREGADO tambien se puede (TRANSICIONES_VEN_PATCH). warehouse_id puede llegar como texto."""
    from app.models.inventory import Warehouse
    bodega = Warehouse(name=f"Bodega Sur {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    for estado, valor in (("LISTO_ENTREGA", bodega.id), ("PARCIALMENTE_ENTREGADO", str(bodega.id)),
                          ("DISPONIBLE", bodega.id), ("EN_PROCESO", bodega.id)):
        ven = _ven(db, estado=estado, productos=[{"product_name": "Instalación", "qty": 1}])
        resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": valor})
        assert resp.status_code == 200, (estado, resp.text)
        db.expire_all()
        db.refresh(ven)
        assert ven.estado == "ENTREGADO", estado
        assert _operaciones(db, ven.id) == [], estado
        [renglon] = _logs(db, ven.id, "ESTADO_CHANGED")
        assert renglon.description == f"Estado cambiado a Entregado (despachado desde {bodega.name})", estado


def test_bodega_el_autor_sale_de_la_sesion_y_updated_by_se_ignora(app_client, db, bodega_token):
    """RP23: updated_by no da 403 (Entregas lo manda hoy) pero no cuenta: el autor es el usuario de la sesion."""
    from app.core.textos_actividad import nombre_de_usuario
    from app.models.inventory import Warehouse
    usuario = _usuario(db, bodega_token)
    bodega = Warehouse(name=f"Bodega Centro {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    ven = _ven(db)
    resp = _patch(app_client, bodega_token, ven.id,
                  {"estado": "ENTREGADO", "warehouse_id": bodega.id, "updated_by": "Suplantador"})
    assert resp.status_code == 200, resp.text
    renglones = _logs(db, ven.id)
    assert renglones and all(r.user_name == nombre_de_usuario(usuario) for r in renglones), [
        (r.action, r.user_name) for r in renglones]


def test_bodega_reenviar_entregado_no_hace_nada(app_client, db, bodega_token):
    """Como en el Bloque 1, reenviar el mismo estado no hace nada: ni renglon ni inventario."""
    from app.models.inventory import Warehouse
    bodega = Warehouse(name=f"Bodega Este {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    ven = _ven(db, estado="ENTREGADO")
    resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": bodega.id})
    assert resp.status_code == 200, resp.text
    assert _logs(db, ven.id, "ESTADO_CHANGED") == [] and _operaciones(db, ven.id) == []


# ─── Lo que Bodega NO puede hacer ────────────────────────────────────────────────────────────────────────────────────

def test_bodega_sin_bodega_valida_da_422_antes_de_leer_el_pedido(app_client, db, bodega_token, sku, contador_sql):
    """RP23: sin warehouse_id, o con una bodega que no existe, 422 «Elige la bodega de salida.», sin leer el pedido ni
    sus lineas y sin tocar nada."""
    from sqlalchemy import func
    from app.models.inventory import Warehouse
    _bodega_con_stock(db, sku, 10)
    ven = _ven(db, productos=[{"product_name": "Taladro", "qty": 3, "sku_id": sku.id}])
    no_existe = (db.query(func.max(Warehouse.id)).scalar() or 0) + 1000
    for valor in (None, "", "   ", "abc", True, False, 0, -1, 1.5, [1], {"id": 1}, no_existe, 2 ** 40, "9" * 30):
        with contador_sql.ventana() as v:
            resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": valor})
        assert resp.status_code == 422, (valor, resp.status_code, resp.text)
        assert resp.json()["detail"] == ELIGE_BODEGA, valor
        assert not [s for s in v.sentencias if "FROM sale_orders" in s or "sale_order_lines" in s], (valor, v.sentencias)
        assert v.commits == 0, valor
    resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO"})
    assert resp.status_code == 422 and resp.json()["detail"] == ELIGE_BODEGA, resp.text
    db.expire_all()
    db.refresh(ven)
    assert ven.estado == "LISTO_ENTREGA"
    assert _logs(db, ven.id) == [] and _operaciones(db, ven.id) == []


def test_bodega_no_puede_otro_estado_ni_otros_campos(app_client, db, bodega_token):
    """R15 y RP23: con otro estado, sin estado o con cualquier otra clave (salvo updated_by) -> 403 con el texto exacto, y
    nada cambia."""
    from app.models.inventory import Warehouse
    bodega = Warehouse(name=f"Bodega Oeste {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    ven = _ven(db, notas=None)
    cuerpos = [{"estado": e, "warehouse_id": bodega.id}
               for e in ("EN_PROCESO", "PENDIENTE_COMPRA", "LISTO_ENTREGA", "FACTURADO", "entregado", " ENTREGADO",
                         "", None, 0)]
    cuerpos += [{"estado": "CANCELADO", "cancellation_reason": "El cliente desistió", "warehouse_id": bodega.id},
                {}, {"warehouse_id": bodega.id}, {"notas": "x"}]
    for campo, valor in (("notas", "Despachado"), ("fecha_entrega", "2026-11-01"),
                         ("fecha_entrega_estimada", "2026-11-01T00:00:00"), ("saldo_cop", 0), ("total_cop", 1),
                         ("anticipo_cop", 0), ("productos", []), ("cancellation_reason", "Un motivo largo"),
                         ("customer_name", "Otro cliente"), ("customer_phone", "3001234567"), ("pec_id", 1),
                         ("motivo", "x"), ("iva_cop", 0), ("descuento_pct", 0), ("direccion_entrega", "Calle 1")):
        cuerpos.append({"estado": "ENTREGADO", "warehouse_id": bodega.id, campo: valor})
    for cuerpo in cuerpos:
        resp = _patch(app_client, bodega_token, ven.id, cuerpo)
        assert resp.status_code == 403, (cuerpo, resp.status_code, resp.text)
        assert resp.json()["detail"] == SOLO_DESPACHO, cuerpo
    db.expire_all()
    db.refresh(ven)
    assert (ven.estado, ven.notas, ven.customer_name) == ("LISTO_ENTREGA", None, "Cliente Despacho")
    assert _logs(db, ven.id) == [] and _operaciones(db, ven.id) == []


def test_bodega_sigue_las_transiciones_del_bloque_1(app_client, db, bodega_token):
    """Bodega solo pasa a ENTREGADO desde un estado que lo permita (TRANSICIONES_VEN_PATCH): un pedido cancelado,
    facturado o devuelto da el mismo 422 que a un ADMIN. Un pedido que no existe, 404."""
    from app.models.inventory import Warehouse
    bodega = Warehouse(name=f"Bodega Rio {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(bodega)
    db.commit()
    casos = {
        "CANCELADO": "está cancelado y no se puede reabrir. Si el cliente sigue interesado, ajusta la cotización y "
                     "crea un pedido nuevo.",
        "FACTURADO": "ya está facturado; su estado no se puede cambiar.",
        "DEVUELTO_TOTAL": "está devuelto; su estado no se puede cambiar.",
    }
    for estado, cola in casos.items():
        ven = _ven(db, estado=estado)
        resp = _patch(app_client, bodega_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": bodega.id})
        assert resp.status_code == 422, (estado, resp.text)
        assert resp.json()["detail"] == f"El pedido {ven.numero} {cola}", estado
        db.expire_all()
        db.refresh(ven)
        assert ven.estado == estado
    resp = _patch(app_client, bodega_token, 2_000_000_000, {"estado": "ENTREGADO", "warehouse_id": bodega.id})
    assert resp.status_code == 404, resp.text


def test_bodega_sigue_sin_poder_usar_los_demas_endpoints(app_client, db, bodega_token):
    """El permiso nuevo es solo PATCH /ventas/pedidos/{id} para despachar: los demas endpoints que cambian documentos de
    Ventas siguen respondiendo 403 a BODEGA, con el texto de require_roles. Las listas se siguen leyendo."""
    from app.models.erp_documents import CustomerRequest, PaymentPending, SalesQuotation
    ven = _ven(db, total_cop=1000, saldo_cop=1000)
    sc = CustomerRequest(numero=f"SC-BD{uuid.uuid4().hex[:10].upper()}", customer_name="Cliente Despacho")
    db.add(sc)
    db.commit()
    cot = SalesQuotation(numero=f"COT-BD{uuid.uuid4().hex[:9].upper()}", customer_name="Cliente Despacho")
    db.add(cot)
    db.commit()
    pxp = PaymentPending(numero=f"PXP-BD{uuid.uuid4().hex[:9].upper()}", ven_id=ven.id, monto_total=1000)
    db.add(pxp)
    db.commit()
    llamadas = [
        ("post", "/api/v1/ventas/pedidos", {}, ("ADMIN",)),
        ("post", f"/api/v1/ventas/pedidos/{ven.id}/crear-pxp", {}, ("ADMIN", "ASESOR", "FINANZAS")),
        ("post", f"/api/v1/ventas/pedidos/{ven.id}/enviar-al-cliente", {}, ("ADMIN", "ASESOR")),
        ("post", f"/api/v1/ventas/pedidos/{ven.id}/actividad", {"tipo": "NOTA", "texto": "x"},
         ("ADMIN", "ASESOR", "COMPRAS")),
        ("patch", f"/api/v1/ventas/cotizaciones/{cot.id}", {"notas": "x"}, ("ADMIN", "ASESOR")),
        ("patch", f"/api/v1/ventas/solicitudes/{sc.id}", {"notas": "x"}, ("ADMIN", "ASESOR")),
        ("post", "/api/v1/ventas/solicitudes", {}, ("ADMIN", "ASESOR")),
        ("post", "/api/v1/ventas/cotizaciones", {}, ("ADMIN", "ASESOR")),
        ("patch", f"/api/v1/ventas/pxp/{pxp.id}", {"estado": "PAGADO"}, ("ADMIN", "FINANZAS")),
        ("patch", "/api/v1/ventas/config", {"alerta_sc_dias": "9"}, ("ADMIN",)),
    ]
    for metodo, ruta, cuerpo, requeridos in llamadas:
        resp = getattr(app_client, metodo)(ruta, json=cuerpo, headers=_auth(bodega_token))
        assert resp.status_code == 403, (ruta, resp.status_code, resp.text)
        assert resp.json()["detail"] == _rol_no_autorizado("BODEGA", requeridos), ruta
    for ruta in ("/api/v1/ventas/pedidos", "/api/v1/ventas/solicitudes", "/api/v1/ventas/cotizaciones"):
        assert app_client.get(ruta, params={"limit": 1}, headers=_auth(bodega_token)).status_code == 200, ruta
    db.expire_all()
    db.refresh(ven)
    assert ven.estado == "LISTO_ENTREGA" and ven.pxp_id is None


# ─── ADMIN y ASESOR siguen igual; los demas roles siguen fuera ───────────────────────────────────────────────────────

def test_admin_y_asesor_siguen_igual(app_client, db, admin_token, vendedor_token, compras_token, sku):
    """R15: ADMIN y ASESOR cambian el pedido como hoy (otros estados, otros campos, el autor de updated_by y la bodega solo
    si hay lineas de catalogo, con el mensaje de siempre); la Actividad no cambia de texto. COMPRAS sigue fuera."""
    from app.models.inventory import Warehouse
    ven = _ven(db, estado="LISTO_ENTREGA")
    resp = _patch(app_client, vendedor_token, ven.id, {"estado": "EN_PROCESO", "notas": "Llamar antes"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(ven)
    assert (ven.estado, ven.notas) == ("EN_PROCESO", "Llamar antes")

    con_catalogo = _ven(db, productos=[{"product_name": "Taladro", "qty": 2, "sku_id": sku.id}])
    resp = _patch(app_client, vendedor_token, con_catalogo.id, {"estado": "ENTREGADO"})
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Debes indicar la bodega de despacho para descontar el inventario de este pedido"
    bodega, _ = _bodega_con_stock(db, sku, 5)
    resp = _patch(app_client, vendedor_token, con_catalogo.id,
                  {"estado": "ENTREGADO", "warehouse_id": bodega.id, "notas": "Sale hoy", "updated_by": "Asesor Uno"})
    assert resp.status_code == 200, resp.text
    [renglon] = _logs(db, con_catalogo.id, "ESTADO_CHANGED")
    assert (renglon.description, renglon.user_name) == ("Estado cambiado a Entregado", "Asesor Uno")

    texto_libre = _ven(db, productos=[{"product_name": "Instalación", "qty": 1}])
    resp = _patch(app_client, admin_token, texto_libre.id, {"estado": "ENTREGADO"})
    assert resp.status_code == 200, resp.text
    [renglon] = _logs(db, texto_libre.id, "ESTADO_CHANGED")
    assert renglon.description == "Estado cambiado a Entregado"

    otra = Warehouse(name=f"Bodega Admin {uuid.uuid4().hex[:6]}", location_type="Central")
    db.add(otra)
    db.commit()
    resp = _patch(app_client, compras_token, ven.id, {"estado": "ENTREGADO", "warehouse_id": otra.id})
    assert resp.status_code == 403, resp.text
    assert resp.json()["detail"] == _rol_no_autorizado("COMPRAS", ("ADMIN", "ASESOR", "BODEGA"))
    db.expire_all()
    db.refresh(ven)
    assert ven.estado == "EN_PROCESO"
