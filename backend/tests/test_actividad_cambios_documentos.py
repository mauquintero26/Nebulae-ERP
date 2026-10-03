"""Actividad de cambios: re-cotizar o editar un documento de Ventas (SC / COT / VEN) deja un
renglon con el detalle (campo: antes -> despues). Hasta ahora solo quedaban registrados los
cambios de estado y de fecha de entrega: recotizar o editar productos, precios, cliente o
notas no dejaba ningun rastro en la Actividad.
"""
from datetime import datetime, timezone
from decimal import Decimal

from app.core import cambios_documento as cd


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, **extra):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio, **extra}


def _etiquetas(cambios):
    return [c["etiqueta"] for c in cambios]


# ─── Comparacion (sin DB) ────────────────────────────────────────────────────────────

def test_comparar_ignora_ruido_de_tipos_y_espacios_en_cot():
    antes = {"total_cop": Decimal("60000.00"), "subtotal_cop": Decimal("60000.00"), "descuento_pct": Decimal("0.00"),
             "notas": None, "customer_name": "Ana"}
    # Lo que manda el frontend: floats con ruido, enteros, textos con espacios o vacios.
    despues = {"total_cop": 60000.00000000001, "subtotal_cop": 60000, "descuento_pct": 0,
               "notas": "   ", "customer_name": " Ana "}
    assert cd.comparar("COT", antes, despues) == []


def test_comparar_fecha_de_vencimiento_a_nivel_de_dia_en_sc():
    antes = {"fecha_vencimiento": datetime(2026, 1, 10, 14, 30, 7)}
    assert cd.comparar("SC", antes, {"fecha_vencimiento": "2026-01-10T12:00:00.000Z"}) == []
    cambios = cd.comparar("SC", antes, {"fecha_vencimiento": "2026-01-15"})
    assert cambios == [{"campo": "fecha_vencimiento", "etiqueta": "Fecha de vencimiento",
                        "antes": "10/01/2026", "despues": "15/01/2026"}]


def test_comparar_muestra_el_dinero_con_formato_colombiano():
    cambios = cd.comparar("COT", {"total_cop": Decimal("1000000.00")}, {"total_cop": 1250000})
    assert cambios == [{"campo": "total_cop", "etiqueta": "Total", "antes": "$1.000.000", "despues": "$1.250.000"}]


def test_comparar_productos_agregado_eliminado_cantidad_y_precio():
    antes = {"productos": [_linea("Cuna", 1, 100000), _linea("Silla", 1, 50000)]}
    despues = {"productos": [_linea("Cuna", 2, 120000), _linea("Coche", 1, 70000)]}
    cambios = cd.comparar("COT", antes, despues)
    por_etiqueta = {c["etiqueta"]: c for c in cambios}
    assert por_etiqueta["Cuna — cantidad"]["antes"] == "1" and por_etiqueta["Cuna — cantidad"]["despues"] == "2"
    assert por_etiqueta["Cuna — precio unitario"]["antes"] == "$100.000"
    assert por_etiqueta["Cuna — precio unitario"]["despues"] == "$120.000"
    assert por_etiqueta["Producto agregado"]["despues"] == "Coche ×1 a $70.000"
    assert por_etiqueta["Producto eliminado"]["antes"] == "Silla ×1 a $50.000"
    assert cd.afecta_precio(cambios)


def test_cambiar_el_orden_de_los_productos_no_es_un_cambio():
    lineas = [_linea("Cuna", 1, 100000), _linea("Silla", 1, 50000)]
    assert cd.comparar("COT", {"productos": lineas}, {"productos": list(reversed(lineas))}) == []


def test_vincular_una_linea_al_catalogo_no_cuenta_como_cambio_de_precio():
    antes = {"productos": [_linea("Cuna", 1, 100000, sku_id=None, es_libre=True)]}
    despues = {"productos": [_linea("Cuna", 1, 100000, sku_id=42, es_libre=False)]}
    cambios = cd.comparar("COT", antes, despues)
    assert [c["campo"] for c in cambios] == ["productos_sku"]
    assert cambios[0]["antes"] == "Texto libre" and cambios[0]["despues"] == "SKU 42"
    assert not cd.afecta_precio(cambios)


def test_comparar_limita_la_cantidad_de_cambios():
    despues = {"productos": [_linea(f"Producto {i}", 1, 1000) for i in range(cd.CAMBIOS_MAX + 10)]}
    cambios = cd.comparar("COT", {"productos": []}, despues)
    assert len(cambios) == cd.CAMBIOS_MAX + 1
    assert cambios[-1]["campo"] == "mas" and cambios[-1]["etiqueta"] == "y 10 cambios más"


def test_describir_recotizacion_con_total_distinto():
    antes, despues = {"total_cop": Decimal("1000000.00")}, {"total_cop": Decimal("1250000.00")}
    cambios = cd.comparar("COT", antes, despues)
    assert cd.describir("COT", cambios, antes, despues) == (
        "RECOTIZADA", "Re-cotización: total $1.000.000 -> $1.250.000 (+$250.000)")
    # Bajar el total tambien se lee bien.
    cambios = cd.comparar("COT", despues, antes)
    assert cd.describir("COT", cambios, despues, antes)[1] == "Re-cotización: total $1.250.000 -> $1.000.000 (-$250.000)"


def test_describir_primer_precio_y_guardado_sin_cambios():
    antes, despues = {"total_cop": Decimal("0.00")}, {"total_cop": Decimal("900000.00")}
    assert cd.describir("COT", cd.comparar("COT", antes, despues), antes, despues) == (
        "RECOTIZADA", "Cotización calculada: total $900.000")
    igual = {"total_cop": Decimal("900000.00")}
    assert cd.describir("COT", [], igual, igual, recotizacion=True) == (
        "RECOTIZADA", "Re-cotización guardada sin cambios en los precios")
    assert cd.describir("COT", [], igual, igual) is None  # un PATCH que no cambia nada no registra nada


def test_describir_una_edicion_que_no_es_de_precio_es_updated():
    antes = {"notas": None, "customer_name": "Ana", "customer_phone": "1", "customer_email": "a@a.co",
             "customer_address": "x", "cotizador": "z"}
    despues = {"notas": "Entregar en la tarde", "customer_name": "Ana Maria", "customer_phone": "2",
               "customer_email": "b@b.co", "customer_address": "y", "cotizador": "w"}
    cambios = cd.comparar("COT", antes, despues)
    accion, titulo = cd.describir("COT", cambios, antes, despues)
    assert accion == "UPDATED"
    # Solo se nombran los primeros campos; el resto se resume.
    assert titulo == "Cotización actualizada: Cliente, Teléfono, Correo, Dirección del cliente y 2 más"
    assert cd.describir("SC", cd.comparar("SC", {"notas": "a"}, {"notas": "b"}), {}, {}) == ("UPDATED", "Solicitud actualizada: Notas")


def test_el_responsable_de_soporte_se_muestra_con_su_correo():
    cambios = cd.comparar("SC", {"asignado_a_user_id": None}, {"asignado_a_user_id": 7}, usuarios={7: "ana@nebulae.co"})
    assert cambios == [{"campo": "asignado_a_user_id", "etiqueta": "Responsable de soporte",
                        "antes": None, "despues": "ana@nebulae.co"}]


# ─── PATCH de Cotizacion ─────────────────────────────────────────────────────────────

def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _actividades(app_client, admin_token, ruta, doc_id):
    resp = app_client.get(f"/api/v1/ventas/{ruta}/{doc_id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["actividades"]


def test_recotizar_cot_registra_la_recotizacion_con_el_detalle(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT001", total_cop=1000, subtotal_cop=1000,
               productos=[_linea("Cuna", 1, 1000)])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "productos": [_linea("Cuna", 1, 2000)], "subtotal_cop": 2000, "total_cop": 2000,
        "recotizacion": True, "updated_by": "asesor@test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text

    actividades = _actividades(app_client, admin_token, "cotizaciones", cot.id)
    assert [a["action"] for a in actividades] == ["RECOTIZADA"]
    a = actividades[0]
    assert a["description"] == "Re-cotización: total $1.000 -> $2.000 (+$1.000)"
    assert a["user_name"] == "asesor@test"
    cambios = {c["etiqueta"]: c for c in a["extra_data"]["cambios"]}
    assert cambios["Total"]["antes"] == "$1.000" and cambios["Total"]["despues"] == "$2.000"
    assert cambios["Cuna — precio unitario"]["despues"] == "$2.000"


def test_guardar_la_calculadora_sin_cambios_de_precio_no_registra_nada_si_no_es_recotizacion(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT002", total_cop=60000, subtotal_cop=60000, descuento_pct=0,
               productos=[_linea("Cuna", 1, 60000)])
    # Mismo precio, pero con el ruido de punto flotante que produce la Calculadora real.
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "productos": [_linea("Cuna", 1, 60000.00000000001)], "subtotal_cop": 60000.00000000001,
        "total_cop": 60000.00000000001, "descuento_pct": 0, "updated_by": "asesor@test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _actividades(app_client, admin_token, "cotizaciones", cot.id) == []


def test_boton_recotizar_sin_cambios_deja_igualmente_su_registro(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT003", total_cop=60000, subtotal_cop=60000, productos=[_linea("Cuna", 1, 60000)])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "productos": [_linea("Cuna", 1, 60000)], "total_cop": 60000, "subtotal_cop": 60000,
        "recotizacion": True, "updated_by": "asesor@test",
    }, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    actividades = _actividades(app_client, admin_token, "cotizaciones", cot.id)
    assert [(a["action"], a["description"]) for a in actividades] == [
        ("RECOTIZADA", "Re-cotización guardada sin cambios en los precios")]
    assert actividades[0]["extra_data"]["cambios"] == []


def test_cambiar_solo_el_estado_no_agrega_un_renglon_de_edicion(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT004", total_cop=1000, productos=[_linea("Cuna", 1, 1000)])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "estado": "ENVIADA", "updated_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert [a["action"] for a in _actividades(app_client, admin_token, "cotizaciones", cot.id)] == ["ESTADO_CHANGED"]


def test_editar_las_notas_de_una_cot_registra_la_edicion(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT005", notas=None)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "notas": "Entregar en la tarde", "updated_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    actividades = _actividades(app_client, admin_token, "cotizaciones", cot.id)
    assert [(a["action"], a["description"]) for a in actividades] == [("UPDATED", "Cotización actualizada: Notas")]
    assert actividades[0]["extra_data"]["cambios"] == [
        {"campo": "notas", "etiqueta": "Notas", "antes": None, "despues": "Entregar en la tarde"}]


def test_recotizar_una_cot_pendiente_de_confirmacion_registra_primero_la_recotizacion_y_luego_el_estado(
        app_client, db, admin_token):
    cot = _cot(db, "COT-ACT006", estado="PENDIENTE_CONFIRMACION", total_cop=1000, subtotal_cop=1000,
               productos=[_linea("Cuna", 1, 1000)])
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={
        "productos": [_linea("Cuna", 1, 2000)], "subtotal_cop": 2000, "total_cop": 2000,
        "recotizacion": True, "updated_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    # El precio nuevo reinicia el ciclo de confirmacion a BORRADOR: causa primero, efecto despues.
    assert [a["action"] for a in _actividades(app_client, admin_token, "cotizaciones", cot.id)] == [
        "RECOTIZADA", "ESTADO_CHANGED"]


def test_sin_updated_by_el_renglon_queda_a_nombre_del_usuario_autenticado(app_client, db, admin_token):
    cot = _cot(db, "COT-ACT007", notas=None)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"notas": "hola"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = _actividades(app_client, admin_token, "cotizaciones", cot.id)
    assert actividad["user_name"] and "@" in actividad["user_name"]


def _es_utc_con_zona_y_reciente(created_at):
    assert created_at.endswith("Z"), created_at
    instante = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
    assert abs((datetime.now(timezone.utc) - instante).total_seconds()) < 120


def test_la_hora_de_la_actividad_de_ventas_se_entrega_en_utc_con_zona(app_client, db, admin_token):
    """created_at se guarda en UTC sin zona (utcnow). Sin la "Z" el navegador la leia como hora
    local y la linea de tiempo mostraba cada renglon con 5 h de adelanto en Colombia."""
    cot = _cot(db, "COT-ACT008", notas=None)
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"notas": "hola"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = _actividades(app_client, admin_token, "cotizaciones", cot.id)
    _es_utc_con_zona_y_reciente(actividad["created_at"])


def test_la_hora_de_la_actividad_de_compras_se_entrega_en_utc_con_zona(app_client, db, admin_token):
    from app.models.erp_documents import PurchaseOrderFull, ActivityLog
    pec = PurchaseOrderFull(numero="PEC-ACT001", supplier_name="Proveedor Prueba", estado="BORRADOR", productos=[])
    db.add(pec); db.commit(); db.refresh(pec)
    db.add(ActivityLog(entity_type="PEC", entity_id=pec.id, entity_numero=pec.numero, action="CREATED",
                       description="Creado", created_at=datetime.utcnow()))
    db.commit()
    resp = app_client.get(f"/api/v1/compras/pedidos/{pec.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = resp.json()["data"]["actividades"]
    _es_utc_con_zona_y_reciente(actividad["created_at"])


# ─── PATCH de Solicitud ──────────────────────────────────────────────────────────────

def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "BORRADOR")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def test_el_formulario_de_edicion_de_la_sc_sin_cambios_no_registra_nada_y_con_cambios_si(app_client, db, admin_token):
    sc = _sc(db, "SC-ACT001", advisor_name="ana@nebulae.co", tipo_solicitud="Cotizacion de Producto",
             modalidad_pago="Contado", notas="Urgente", fecha_vencimiento=datetime(2026, 10, 20, 0, 0))
    formulario = {  # lo que manda saveEdit(): todos los campos, tambien los que no se tocaron
        "advisor_name": "ana@nebulae.co", "advisor_user_id": "", "tipo_solicitud": "Cotizacion de Producto",
        "modalidad_pago": "Contado", "notas": "Urgente", "fecha_vencimiento": "2026-10-20T17:00:00.000Z",
        "updated_by": "asesor@test",
    }
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json=formulario, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _actividades(app_client, admin_token, "solicitudes", sc.id) == []

    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}",
                            json={**formulario, "notas": "Urgente: entregar antes del viernes", "modalidad_pago": "Credito"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = _actividades(app_client, admin_token, "solicitudes", sc.id)
    assert (actividad["action"], actividad["description"]) == ("UPDATED", "Solicitud actualizada: Modalidad de pago, Notas")
    cambios = {c["etiqueta"]: c for c in actividad["extra_data"]["cambios"]}
    assert cambios["Modalidad de pago"]["antes"] == "Contado" and cambios["Modalidad de pago"]["despues"] == "Credito"


def test_asignar_asesor_registra_primero_el_cambio_y_luego_el_estado(app_client, db, admin_token):
    from app.models.users import User
    asesor = db.query(User).first()
    sc = _sc(db, "SC-ACT002", advisor_name=None)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "advisor_user_id": asesor.id, "advisor_name": asesor.email, "updated_by": "asesor@test"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    actividades = _actividades(app_client, admin_token, "solicitudes", sc.id)
    assert [a["action"] for a in actividades] == ["UPDATED", "ESTADO_CHANGED"]
    assert actividades[0]["description"] == "Solicitud actualizada: Asesor"
    assert actividades[0]["extra_data"]["cambios"][0]["despues"] == asesor.email


def test_cambiar_el_responsable_de_soporte_muestra_su_correo(app_client, db, admin_token):
    from app.models.users import User
    responsable = db.query(User).first()
    sc = _sc(db, "SC-ACT003", tipo_solicitud="Soporte")
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "asignado_a_user_id": responsable.id, "updated_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = _actividades(app_client, admin_token, "solicitudes", sc.id)
    assert actividad["extra_data"]["cambios"] == [{
        "campo": "asignado_a_user_id", "etiqueta": "Responsable de soporte",
        "antes": None, "despues": responsable.email}]


# ─── PATCH de Pedido de Venta ────────────────────────────────────────────────────────

def _ven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def test_el_motivo_reemplaza_el_titulo_pero_conserva_el_detalle_en_el_pedido(app_client, db, admin_token):
    ven = _ven(db, "PVEN-ACT001", total_cop=1000, subtotal_cop=1000, saldo_cop=1000,
               productos=[_linea("Cuna", 1, 1000)])
    motivo = "Precios actualizados por re-cotización de COT-ACT001 (anticipo y pagos existentes no se modificaron)."
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={
        "productos": [_linea("Cuna", 1, 2000)], "subtotal_cop": 2000, "total_cop": 2000, "saldo_cop": 2000,
        "motivo": motivo, "updated_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (actividad,) = _actividades(app_client, admin_token, "pedidos", ven.id)
    assert (actividad["action"], actividad["description"]) == ("UPDATED", motivo)
    etiquetas = _etiquetas(actividad["extra_data"]["cambios"])
    assert "Total" in etiquetas and "Saldo" in etiquetas and "Cuna — precio unitario" in etiquetas


def test_cancelar_un_pedido_registra_el_estado_y_el_motivo(app_client, db, admin_token):
    ven = _ven(db, "PVEN-ACT002", productos=[])
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={
        "estado": "CANCELADO", "cancellation_reason": "El cliente desistió", "updated_by": "asesor@test"},
        headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    actividades = _actividades(app_client, admin_token, "pedidos", ven.id)
    assert [a["action"] for a in actividades] == ["UPDATED", "ESTADO_CHANGED"]
    assert actividades[0]["extra_data"]["cambios"] == [{
        "campo": "cancellation_reason", "etiqueta": "Motivo de cancelación",
        "antes": None, "despues": "El cliente desistió"}]
