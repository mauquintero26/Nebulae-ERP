"""H7+H41: etiquetas de estado legibles (backend/app/core/textos_actividad.py).

Es la fuente UNICA de los nombres de estado en la Actividad y en los mensajes de error de Ventas (choque
"Tablas de etiquetas de estado duplicadas" de la especificacion). Estas pruebas son puras (sin DB). Los cambios
de texto en los endpoints, la correccion de las actividades viejas y sus pruebas de API son de la Tarea 12 y se
agregan a este mismo archivo (abajo de las pruebas puras).
"""
import datetime
import re

from app.core.textos_actividad import ETIQUETAS_ESTADO, etiqueta_estado, corregir_descripcion_historica


def test_etiqueta_estado_es_legible_y_tiene_respaldo():
    assert etiqueta_estado('COT', 'PENDIENTE_CONFIRMACION') == 'Esperando confirmación del cliente'
    assert etiqueta_estado('SC', 'N/A_SOPORTE') == 'Soporte'
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO') == 'Pendiente algo'
    assert etiqueta_estado('PXP', 'PAGADO') == 'Pagado'
    assert etiqueta_estado('COT', None) == ''
    assert etiqueta_estado('SC', None) == ''
    assert etiqueta_estado('VEN', None) == ''


def test_etiqueta_estado_vacio_o_en_blanco_da_cadena_vacia():
    assert etiqueta_estado('COT', '') == ''
    assert etiqueta_estado('VEN', '   ') == ''


def test_etiquetas_de_sc():
    assert ETIQUETAS_ESTADO['SC'] == {
        'BORRADOR': 'Borrador',
        'ASIGNADA': 'Asignada',
        'PENDIENTE_CONFIRMACION': 'Pendiente de confirmación',
        'COTIZADA': 'Cotizada',
        'EN_ESPERA_CONFIRMACION': 'En espera de confirmación',
        'CONFIRMADA': 'Confirmada',
        'RECHAZADA': 'Rechazada',
        'VENCIDA': 'Vencida',
        'CANCELADA': 'Cancelada',
        'N/A_SOPORTE': 'Soporte',
    }


def test_etiquetas_de_cot():
    assert ETIQUETAS_ESTADO['COT'] == {
        'BORRADOR': 'Borrador',
        'ENVIADA': 'Enviada al cliente',
        'PENDIENTE_CONFIRMACION': 'Esperando confirmación del cliente',
        'CONFIRMADA': 'Confirmada',
        'RECHAZADA': 'Rechazada',
        'VENCIDA': 'Vencida',
    }


def test_etiquetas_de_ven_cubren_los_18_estados_del_pedido_con_las_del_frontend():
    # Fuente unica con el frontend (N10, frontend/src/lib/estados-pedido.js): ningun estado del pedido depende
    # del respaldo humanizado (que no pone tildes: sin EN_TRANSITO en el mapa saldria 'En transito').
    assert ETIQUETAS_ESTADO['VEN'] == {
        # Ventas / Compras
        'PENDIENTE_COMPRA': 'Pendiente de compra',
        'EN_PROCESO': 'En proceso',
        'EN_TRANSITO': 'En tránsito',
        'LISTO_ENTREGA': 'Listo para entrega',
        'ENTREGADO': 'Entregado',
        'FACTURADO': 'Facturado',
        'CANCELADO': 'Cancelado',
        # tienda / webhooks
        'PENDIENTE_PAGO': 'Pendiente de pago',
        'PAGADO': 'Pagado',
        # fase4
        'BORRADOR': 'Borrador',
        'PENDIENTE_ANTICIPO': 'Pendiente de anticipo',
        'CONFIRMADO': 'Confirmado',
        'PARCIALMENTE_DISPONIBLE': 'Parcialmente disponible',
        'DISPONIBLE': 'Disponible',
        'PENDIENTE_SALDO': 'Pendiente de saldo',
        'LISTO_PARA_ENTREGA': 'Listo para entrega',
        'PARCIALMENTE_ENTREGADO': 'Entregado parcialmente',
        'DEVUELTO_TOTAL': 'Devuelto',
    }
    assert len(ETIQUETAS_ESTADO['VEN']) == 18
    assert etiqueta_estado('VEN', 'EN_TRANSITO') == 'En tránsito'
    assert etiqueta_estado('VEN', 'PARCIALMENTE_ENTREGADO') == 'Entregado parcialmente'
    assert etiqueta_estado('VEN', 'DEVUELTO_TOTAL') == 'Devuelto'
    assert etiqueta_estado('VEN', 'PENDIENTE_ANTICIPO') == 'Pendiente de anticipo'
    assert etiqueta_estado('VEN', 'PENDIENTE_SALDO') == 'Pendiente de saldo'


def test_ninguna_etiqueta_es_el_codigo_ni_lleva_guion_bajo():
    for entidad, mapa in ETIQUETAS_ESTADO.items():
        for codigo, etiqueta in mapa.items():
            assert etiqueta != codigo, f'{entidad}.{codigo}: la etiqueta es el codigo crudo'
            assert '_' not in etiqueta, f'{entidad}.{codigo}: {etiqueta!r} lleva guion bajo'
            assert etiqueta == etiqueta.strip() and etiqueta[0].isupper(), f'{entidad}.{codigo}: {etiqueta!r}'


def test_etiqueta_estado_resuelve_cada_codigo_del_mapa():
    for entidad, mapa in ETIQUETAS_ESTADO.items():
        for codigo, etiqueta in mapa.items():
            assert etiqueta_estado(entidad, codigo) == etiqueta


def test_etiqueta_estado_respaldo_para_estados_fuera_del_mapa():
    # Un estado nuevo que aun no esta en el mapa sale legible, nunca el codigo crudo.
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO') == 'Pendiente algo'
    assert etiqueta_estado('SC', 'EN_REVISION_TECNICA') == 'En revision tecnica'
    # Entidades que el mapa no cubre (PEC, PXP...) usan solo el respaldo.
    assert etiqueta_estado('PEC', 'BORRADOR') == 'Borrador'
    assert etiqueta_estado('PXP', 'PENDIENTE') == 'Pendiente'


def test_etiqueta_estado_acepta_pven_como_alias_de_ven():
    # fase4 registra la Actividad del pedido con entity_type 'PVEN'; el resto de Ventas usa 'VEN'.
    assert etiqueta_estado('PVEN', 'EN_TRANSITO') == 'En tránsito'
    assert etiqueta_estado('PVEN', 'LISTO_ENTREGA') == 'Listo para entrega'


def test_etiqueta_estado_ignora_espacios_alrededor_del_codigo():
    assert etiqueta_estado('SC', ' ASIGNADA ') == 'Asignada'
    assert etiqueta_estado('VEN', 'PENDIENTE_ALGO ') == 'Pendiente algo'


# --- corregir_descripcion_historica (T12): solo textos que el sistema genero ---------------------------------

CASOS_HISTORICOS = [
    ('COT', 'CREATED', 'Cotizacion COT-1 creada desde SC-1', 'Cotización COT-1 creada desde SC-1'),
    ('COT', 'CREATED', 'Cotizacion COT-1 creada', 'Cotización COT-1 creada'),
    ('COT', 'CONVERTIDA_A_VENTA', 'Cotizacion COT-1 convertida al pedido PVEN-1. Lineas: 2.',
     'Cotización COT-1 convertida al pedido PVEN-1. Líneas: 2.'),
    ('SC', 'ESTADO_CHANGED', 'Estado cambiado a ASIGNADA (asesor asignado)', 'Estado cambiado a Asignada (asesor asignado)'),
    ('SC', 'ESTADO_CHANGED', 'Estado cambiado a BORRADOR (asesor retirado)', 'Estado cambiado a Borrador (asesor retirado)'),
    ('SC', 'ESTADO_CHANGED', 'Estado cambiado a ASIGNADA: se modificaron los productos, asi que hay que reenviarla',
     'Estado cambiado a Asignada: se modificaron los productos, asi que hay que reenviarla'),
    ('COT', 'ESTADO_CHANGED', 'Estado cambiado a PENDIENTE_CONFIRMACION', 'Estado cambiado a Esperando confirmación del cliente'),
    ('VEN', 'ESTADO_CHANGED', 'Estado cambiado a EN_PROCESO', 'Estado cambiado a En proceso'),
    ('SC', 'ESTADO_CHANGED', 'Estado cambiado a N/A_SOPORTE', 'Estado cambiado a Soporte'),
    ('SC', 'ESTADO_CHANGED', 'Solicitud confirmada - Cotizacion creada', 'Solicitud confirmada - Cotización creada'),
    ('SC', 'ESTADO_CHANGED', 'Solicitud cotizada - Cotizacion creada', 'Solicitud cotizada - Cotización creada'),
    ('COT', 'ESTADO_CHANGED', 'Cotizacion confirmada - Pedido de Venta creado', 'Cotización confirmada - Pedido de Venta creado'),
    ('PXP', 'ESTADO_CHANGED', 'Pago PXP-7 cambiado a PAGADO', 'Pago PXP-7 cambiado a Pagado'),
    ('SC', 'RESTORED', 'Solicitud restaurada a ASIGNADA', 'Solicitud restaurada a Asignada'),
]

CASOS_QUE_NO_SE_TOCAN = [
    ('COT', 'NOTE_ADDED', 'Cotizacion revisada'),
    ('COT', 'CHATTER', 'Estado cambiado a ASIGNADA'),
    ('SC', 'CANCELLED', 'Cancelada: Cotizacion cara'),
    ('PEC', 'ESTADO_CHANGED', 'Estado cambiado a BORRADOR'),
    ('COT', 'ESTADO_CHANGED', 'Estado cambiado a Borrador'),
    ('COT', 'ESTADO_CHANGED', 'Cotización COT-1 creada'),
    ('COT', 'CREATED', 'Cotización COT-1 creada desde SC-1'),
    ('SC', 'ESTADO_CHANGED', 'Estado cambiado a ASIGNADA y algo mas que el sistema no escribe'),
    ('COT', 'CREATED', 'Cotizacion revisada con el cliente'),
    ('SC', 'UPDATED', 'Estado cambiado a ASIGNADA'),
    ('SC', 'ESTADO_CHANGED', None),
    ('SC', 'ESTADO_CHANGED', ''),
]


def test_corregir_descripcion_historica_solo_textos_del_sistema():
    # El runner no soporta @pytest.mark.parametrize: un bucle sobre los casos.
    for entidad, accion, antes, esperado in CASOS_HISTORICOS:
        assert corregir_descripcion_historica(entidad, accion, antes) == esperado, (entidad, accion, antes)
    for entidad, accion, descripcion in CASOS_QUE_NO_SE_TOCAN:
        assert corregir_descripcion_historica(entidad, accion, descripcion) is None, (entidad, accion, descripcion)


def test_corregir_descripcion_historica_es_idempotente():
    for entidad, accion, _antes, corregida in CASOS_HISTORICOS:
        assert corregir_descripcion_historica(entidad, accion, corregida) is None, (entidad, accion, corregida)


def test_la_conversion_con_el_resumen_del_dinero_tambien_se_corrige():
    # Las filas que dejo el flujo del anticipo (T3-T5) traen un cierre despues de 'Lineas: n.'
    antes = 'Cotizacion COT-1 convertida al pedido PVEN-1. Lineas: 2. Anticipo verificado: $600.000.'
    assert corregir_descripcion_historica('COT', 'CONVERTIDA_A_VENTA', antes) == (
        'Cotización COT-1 convertida al pedido PVEN-1. Líneas: 2. Anticipo verificado: $600.000.')


# --- Textos de la Actividad y de los errores (API) ---------------------------------------------------------

def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _linea(nombre, qty, precio, **extra):
    return {"product_name": nombre, "qty": qty, "unit_price_cop": precio, "total_cop": qty * precio, **extra}


def _actividades(app_client, admin_token, ruta, doc_id):
    resp = app_client.get(f"/api/v1/ventas/{ruta}/{doc_id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]["actividades"]


def _sc(db, numero, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "BORRADOR")
    sc = CustomerRequest(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, numero, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    cot = SalesQuotation(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def test_crear_la_cotizacion_desde_la_sc_registra_textos_con_tilde(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-TXT001", estado="CONFIRMADA", advisor_user_id=user_admin.id, advisor_name=user_admin.email,
             productos=[{"product_name": "Cuna Colecho", "qty": 1}], gate1_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    cot = resp.json()["data"]["cotizacion"]
    estado = [a for a in _actividades(app_client, admin_token, "solicitudes", sc.id) if a["action"] == "ESTADO_CHANGED"]
    assert [a["description"] for a in estado] == ["Solicitud cotizada - Cotización creada"]
    creada = [a for a in _actividades(app_client, admin_token, "cotizaciones", cot["id"]) if a["action"] == "CREATED"]
    assert [a["description"] for a in creada] == [f"Cotización {cot['numero']} creada desde SC-TXT001"]


def test_crear_una_cotizacion_suelta_registra_su_creacion_con_tilde(app_client, db, admin_token):
    resp = app_client.post("/api/v1/ventas/cotizaciones", json={
        "customer_name": "Cliente Prueba", "productos": [_linea("Cuna", 1, 1000)], "total_cop": 1000,
        "subtotal_cop": 1000, "created_by": "asesor@test"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    cot = resp.json()["data"]
    (creada,) = [a for a in _actividades(app_client, admin_token, "cotizaciones", cot["id"]) if a["action"] == "CREATED"]
    assert creada["description"] == f"Cotización {cot['numero']} creada"


def test_convertir_la_cotizacion_registra_lineas_con_tilde(app_client, db, admin_token):
    # Misma preparacion que test_crear_el_pedido_desde_la_cotizacion_deja_su_registro_en_el_pedido (COT sin anticipo).
    cot = _cot(db, "COT-ACT909", estado="CONFIRMADA", sc_numero="SC-ACT909", total_cop=2000, subtotal_cop=2000,
               productos=[_linea("Cuna", 2, 1000)], gate2_confirmed_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "asesor@test"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["message"].startswith("Cotización COT-ACT909 convertida exitosamente a Pedido")
    repetida = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/convertir-a-venta", json={"user_name": "asesor@test"},
                               headers=auth(admin_token))
    assert repetida.status_code == 200 and repetida.json()["idempotent_replay"] is True
    assert repetida.json()["message"].startswith("Cotización ya convertida previamente al pedido")
    (convertida,) = [a for a in _actividades(app_client, admin_token, "cotizaciones", cot.id)
                     if a["action"] == "CONVERTIDA_A_VENTA"]
    assert re.match(r"^Cotización COT-ACT\S+ convertida al pedido PVEN-\S+\. Líneas: 1\.$", convertida["description"]), \
        convertida["description"]


def test_cambiar_el_estado_de_la_cot_se_describe_con_nombre_legible(app_client, db, admin_token):
    cot = _cot(db, "COT-TXT003")
    resp = app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json={"estado": "RECHAZADA"},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = [a for a in _actividades(app_client, admin_token, "cotizaciones", cot.id)
                 if a["action"] == "ESTADO_CHANGED"]
    assert cambio["description"] == "Estado cambiado a Rechazada"
    # Las columnas siguen guardando el CODIGO: el frontend las pinta como etiqueta (EstadoBadge).
    assert (cambio["old_estado"], cambio["new_estado"]) == ("BORRADOR", "RECHAZADA")


def test_asignar_asesor_describe_el_estado_legible(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-TXT004", advisor_name=None)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={
        "advisor_user_id": user_admin.id, "advisor_name": user_admin.email}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = [a for a in _actividades(app_client, admin_token, "solicitudes", sc.id)
                 if a["action"] == "ESTADO_CHANGED"]
    assert cambio["description"] == "Estado cambiado a Asignada (asesor asignado)"
    assert (cambio["old_estado"], cambio["new_estado"]) == ("BORRADOR", "ASIGNADA")


def test_retirar_el_asesor_describe_el_estado_legible(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-TXT005", estado="ASIGNADA", advisor_user_id=user_admin.id, advisor_name=user_admin.email)
    resp = app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json={"advisor_user_id": "", "advisor_name": ""},
                            headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = [a for a in _actividades(app_client, admin_token, "solicitudes", sc.id)
                 if a["action"] == "ESTADO_CHANGED"]
    assert cambio["description"] == "Estado cambiado a Borrador (asesor retirado)"


def test_enviar_la_cot_en_otro_estado_nombra_el_estado_actual_con_su_etiqueta(app_client, db, admin_token):
    cot = _cot(db, "COT-TXT006", estado="RECHAZADA")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert "(estado actual: Rechazada)" in resp.json()["detail"]
    assert "RECHAZADA" not in resp.json()["detail"]


def test_crear_el_pedido_de_una_cot_sin_confirmar_nombra_el_estado_con_su_etiqueta(app_client, db, admin_token):
    cot = _cot(db, "COT-TXT007", estado="PENDIENTE_CONFIRMACION")
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert "(estado actual: Esperando confirmación del cliente)" in resp.json()["detail"]


def test_los_errores_de_cotizacion_llevan_tilde(app_client, db, admin_token):
    h = auth(admin_token)
    for metodo, ruta, cuerpo in (("get", "/api/v1/ventas/cotizaciones/99999999", None),
                                 ("patch", "/api/v1/ventas/cotizaciones/99999999", {"notas": "x"}),
                                 ("post", "/api/v1/ventas/cotizaciones/99999999/enviar-confirmacion", {}),
                                 ("post", "/api/v1/ventas/cotizaciones/99999999/confirmar", {}),
                                 ("post", "/api/v1/ventas/cotizaciones/99999999/actividad", {"action": "NOTE_ADDED", "description": "x"})):
        resp = getattr(app_client, metodo)(ruta, headers=h, **({} if cuerpo is None else {"json": cuerpo}))
        assert resp.status_code == 404, (ruta, resp.text)
        assert resp.json()["detail"] == "Cotización no encontrada", (ruta, resp.text)


def test_confirmar_una_sc_en_otro_estado_nombra_el_estado_con_su_etiqueta(app_client, db, admin_token):
    sc = _sc(db, "SC-TXT008", estado="ASIGNADA")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/confirmar", json={"user_name": "t"},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert resp.json()["detail"] == "No se puede confirmar en estado Asignada"


def test_el_dinero_de_la_actividad_del_pedido_usa_el_punto_de_miles(app_client, db, admin_token, sku):
    from app.models.customers import Customer
    import uuid
    c = Customer(first_name="Cliente", last_name=f"Texto-{uuid.uuid4().hex[:4]}", email=f"txt_{uuid.uuid4().hex[:6]}@test.com")
    db.add(c); db.commit()
    resp = app_client.post("/api/v1/ventas/pedidos/canonico", json={
        "customer_id": c.id, "anticipo_pct": 60.0, "saldo_pct": 40.0,
        "lines": [{"sku_id": sku.id, "quantity": 1.0, "unit_price_cop": 1250000.0,
                   "modalidad": "ENTREGA_INMEDIATA", "owner": "NEBULAE"}]}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    so_id = resp.json()["data"]["id"]
    resp = app_client.post(f"/api/v1/ventas/pedidos/{so_id}/pagos", json={
        "tipo": "ANTICIPO", "monto": 750000.0, "metodo_pago": "TRANSFERENCIA",
        "idempotency_key": f"txt-{uuid.uuid4().hex}"}, headers=auth(admin_token))
    assert resp.status_code == 201, resp.text
    # fase4 registra con entity_type 'PVEN' (la pantalla del pedido lee 'VEN'): se leen de la tabla.
    from app.models.erp_documents import ActivityLog
    textos = [f.description for f in db.query(ActivityLog).filter(
        ActivityLog.entity_type == "PVEN", ActivityLog.entity_id == so_id).order_by(ActivityLog.id).all()]
    pago = [t for t in textos if t.startswith("Pago ANTICIPO registrado")]
    assert pago, textos
    assert pago[0] == "Pago ANTICIPO registrado por $750.000 COP. Neto pagado: $750.000 COP. Saldo: $500.000 COP", pago[0]
    assert not any("$1,250,000" in t or "$750,000" in t for t in textos), textos
    creado = [t for t in textos if t.startswith("Pedido canónico")]
    assert creado and "Total: $1.250.000 COP" in creado[0], textos


# --- Script de correccion de actividades viejas (T12; se corre en T14) -------------------------------------

TABLA_DE_PRUEBA = "activity_logs_respaldo_textos_test"


def _actividad(db, entidad, accion, descripcion, numero="X-1"):
    from app.models.erp_documents import ActivityLog
    fila = ActivityLog(entity_type=entidad, entity_id=987654, entity_numero=numero, action=accion,
                       description=descripcion)
    db.add(fila); db.commit(); db.refresh(fila)
    return fila


def _borrar_tabla_de_prueba(db):
    from sqlalchemy import text
    db.rollback()
    db.execute(text(f"DROP TABLE IF EXISTS {TABLA_DE_PRUEBA}"))
    db.commit()


def test_script_corrige_respalda_y_es_idempotente(db):
    from scripts.corregir_textos_actividad import corregir
    from sqlalchemy import text
    a = _actividad(db, "COT", "CREATED", "Cotizacion COT-T12 creada desde SC-T12")
    nota = _actividad(db, "COT", "NOTE_ADDED", "Cotizacion revisada con el cliente")
    b = _actividad(db, "SC", "ESTADO_CHANGED", "Estado cambiado a ASIGNADA (asesor asignado)")
    c = _actividad(db, "COT", "CONVERTIDA_A_VENTA", "Cotizacion COT-T12 convertida al pedido PVEN-T12. Lineas: 2.")
    ids = [a.id, nota.id, b.id, c.id]
    try:
        res = corregir(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_DE_PRUEBA)
        assert res["candidatas"] == 3 and res["corregidas"] == 3
        assert len(res["ejemplos"]) == 3
        db.expire_all()
        assert a.description == "Cotización COT-T12 creada desde SC-T12"
        assert b.description == "Estado cambiado a Asignada (asesor asignado)"
        assert c.description == "Cotización COT-T12 convertida al pedido PVEN-T12. Líneas: 2."
        assert nota.description == "Cotizacion revisada con el cliente"  # texto del usuario: intacto
        respaldo = {r[0]: (r[1], r[2]) for r in db.execute(
            text(f"SELECT id, description_original, description_nueva FROM {TABLA_DE_PRUEBA}")).all()}
        assert set(respaldo) == {a.id, b.id, c.id} and nota.id not in respaldo
        assert respaldo[a.id] == ("Cotizacion COT-T12 creada desde SC-T12", "Cotización COT-T12 creada desde SC-T12")
        # Segunda corrida: nada que corregir, y el respaldo sigue con el ORIGINAL de la primera.
        res2 = corregir(db, aplicar=True, ids=ids, tabla_respaldo=TABLA_DE_PRUEBA)
        assert res2["candidatas"] == 0 and res2["corregidas"] == 0
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_DE_PRUEBA}")).scalar() == 3
    finally:
        _borrar_tabla_de_prueba(db)


def test_script_en_modo_reporte_no_escribe(db):
    from scripts.corregir_textos_actividad import corregir
    from sqlalchemy import text
    a = _actividad(db, "COT", "CREATED", "Cotizacion COT-T12 creada")
    nota = _actividad(db, "COT", "NOTE_ADDED", "Cotizacion revisada")
    res = corregir(db, aplicar=False, ids=[a.id, nota.id], tabla_respaldo=TABLA_DE_PRUEBA)
    assert res["candidatas"] == 1 and res["corregidas"] == 0
    assert res["ejemplos"] == [(a.id, "Cotizacion COT-T12 creada", "Cotización COT-T12 creada")]
    db.expire_all()
    assert a.description == "Cotizacion COT-T12 creada"
    existe = db.execute(text("SELECT to_regclass(:t)"), {"t": TABLA_DE_PRUEBA}).scalar()
    assert existe is None  # ni siquiera crea la tabla de respaldo


def test_script_no_pisa_una_descripcion_que_cambio_despues_de_leerla(db):
    # El UPDATE exige que el texto siga igual que cuando se leyo: si alguien lo edito en medio, no se toca.
    from scripts import corregir_textos_actividad as modulo
    from sqlalchemy import text
    a = _actividad(db, "COT", "CREATED", "Cotizacion COT-T12 creada")
    original = modulo.corregir_descripcion_historica

    def _calcula_y_luego_cambian_el_texto(entidad, accion, descripcion):
        nueva = original(entidad, accion, descripcion)
        db.execute(text("UPDATE activity_logs SET description = 'Editada por otro' WHERE id = :i"), {"i": a.id})
        return nueva

    modulo.corregir_descripcion_historica = _calcula_y_luego_cambian_el_texto
    try:
        res = modulo.corregir(db, aplicar=True, ids=[a.id], tabla_respaldo=TABLA_DE_PRUEBA)
        assert res["candidatas"] == 1 and res["corregidas"] == 0
        db.expire_all()
        assert a.description == "Editada por otro"
        # Sin UPDATE no hay respaldo: la fila no se cambio.
        assert db.execute(text(f"SELECT count(*) FROM {TABLA_DE_PRUEBA}")).scalar() == 0
    finally:
        modulo.corregir_descripcion_historica = original
        _borrar_tabla_de_prueba(db)


def test_script_rechaza_un_nombre_de_tabla_de_respaldo_peligroso(db):
    from scripts.corregir_textos_actividad import corregir
    for nombre in ("x; DROP TABLE users", "Tabla-Con-Guion", "1abc", "", "a b", "abc\n", "abc\r\n"):
        try:
            corregir(db, aplicar=False, ids=[1], tabla_respaldo=nombre)
        except ValueError:
            continue
        raise AssertionError(f"debio rechazar {nombre!r}")


# --- B9 (revision final): --aplicar exige --base igual a current_database(), como correcciones_bloque1 -----------

def _correr_main(monkeypatch, argv):
    """Corre main() del script con `corregir` reemplazado por uno que solo anota la llamada (no lee ni escribe
    activity_logs). Devuelve (codigo, llamadas, salida, errores)."""
    import contextlib
    import io
    from scripts import corregir_textos_actividad as modulo
    llamadas = []

    def _anota(db, aplicar=False, **kwargs):
        llamadas.append(aplicar)
        return {"candidatas": 0, "corregidas": 0, "ejemplos": [], "por_tipo": {}}

    monkeypatch.setattr(modulo, "corregir", _anota)
    salida, errores = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(salida), contextlib.redirect_stderr(errores):
        try:
            codigo = modulo.main(argv)
        except SystemExit as exc:  # argparse
            codigo = exc.code
    return codigo, llamadas, salida.getvalue(), errores.getvalue()


def test_script_aplicar_sin_base_no_corre(monkeypatch):
    codigo, llamadas, _, errores = _correr_main(monkeypatch, ["--aplicar"])
    assert codigo == 2 and llamadas == []
    assert "--aplicar exige --base" in errores


def test_script_aplicar_con_otra_base_aborta_sin_escribir(db, monkeypatch):
    from sqlalchemy import text
    actual = db.execute(text("SELECT current_database()")).scalar()
    codigo, llamadas, salida, errores = _correr_main(monkeypatch, ["--aplicar", "--base", actual + "_otra"])
    assert codigo == 2 and llamadas == []
    assert f"SELECT current_database() -> {actual}" in salida
    assert "ABORTADO" in errores and "no se escribió nada" in errores


def test_script_aplicar_con_la_base_correcta_corrige(db, monkeypatch):
    from sqlalchemy import text
    actual = db.execute(text("SELECT current_database()")).scalar()
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, ["--aplicar", "--base", actual])
    assert codigo == 0 and llamadas == [True]
    assert "Corregidas: 0" in salida


def test_script_dry_run_no_pide_base(monkeypatch):
    codigo, llamadas, salida, _ = _correr_main(monkeypatch, [])
    assert codigo == 0 and llamadas == [False]
    assert "--aplicar --base <nombre de la base>" in salida


# --- Otros mensajes: PXP, restaurar, soporte, pedido ---------------------------------------------------------

def _ven(db, numero, **campos):
    from app.models.erp_documents import SaleOrder
    campos.setdefault("estado", "PENDIENTE_COMPRA")
    ven = SaleOrder(numero=numero, customer_name="Cliente Prueba", **campos)
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def test_el_pedido_describe_su_cambio_de_estado_con_la_etiqueta(app_client, db, admin_token):
    ven = _ven(db, "PVEN-TXT009", estado="PENDIENTE_COMPRA")
    resp = app_client.patch(f"/api/v1/ventas/pedidos/{ven.id}", json={"estado": "EN_PROCESO"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = [a for a in _actividades(app_client, admin_token, "pedidos", ven.id) if a["action"] == "ESTADO_CHANGED"]
    assert cambio["description"] == "Estado cambiado a En proceso"
    assert (cambio["old_estado"], cambio["new_estado"]) == ("PENDIENTE_COMPRA", "EN_PROCESO")


def test_la_orden_de_pago_registra_su_cambio_de_estado_con_la_etiqueta(app_client, db, admin_token):
    from app.models.erp_documents import ActivityLog, PaymentPending
    ven = _ven(db, "PVEN-TXT010")
    p = PaymentPending(numero="PXP-TXT001", ven_id=ven.id, ven_numero=ven.numero, estado="PENDIENTE")
    db.add(p); db.commit(); db.refresh(p)
    resp = app_client.patch(f"/api/v1/ventas/pxp/{p.id}", json={"estado": "PAGADO"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    fila = db.query(ActivityLog).filter(ActivityLog.entity_type == "PXP", ActivityLog.entity_id == p.id,
                                        ActivityLog.action == "ESTADO_CHANGED").one()
    assert fila.description == "Pago PXP-TXT001 cambiado a Pagado"
    assert (fila.old_estado, fila.new_estado) == ("PENDIENTE", "PAGADO")


def test_restaurar_la_solicitud_nombra_el_estado_con_su_etiqueta(app_client, db, admin_token, user_admin):
    sc = _sc(db, "SC-TXT011", estado="CANCELADA", advisor_user_id=user_admin.id, advisor_name=user_admin.email,
             eliminada_at=datetime.datetime.utcnow())
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/restaurar", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    (cambio,) = [a for a in _actividades(app_client, admin_token, "solicitudes", sc.id) if a["action"] == "RESTORED"]
    assert cambio["description"] == "Solicitud restaurada a Asignada"
    assert (cambio["old_estado"], cambio["new_estado"]) == ("CANCELADA", "ASIGNADA")


def test_cancelar_una_solicitud_de_soporte_explica_con_tilde(app_client, db, admin_token):
    sc = _sc(db, "SC-TXT012", tipo_solicitud="Soporte Tecnico")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/cancelar", json={"razon": "Motivo de prueba"},
                           headers=auth(admin_token))
    assert resp.status_code == 400
    assert resp.json()["detail"] == "Soporte Técnico no usa este flujo de cancelación; cambia su estado de soporte en su lugar"


def test_el_analisis_ia_nombra_el_estado_con_su_etiqueta(app_client, db, admin_token):
    sc = _sc(db, "SC-TXT013", estado="EN_ESPERA_CONFIRMACION")
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/ia-analisis", json={}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    analisis = resp.json()["data"]["analisis"]
    assert "Estado: En espera de confirmación" in analisis and "EN_ESPERA_CONFIRMACION" not in analisis
    assert "ítem(s)" in analisis


def test_el_campo_pxp_numero_del_pedido_se_llama_orden_de_pago():
    # La Actividad del pedido habla de 'Orden de pago' (no 'Pago por procesar'), como la pantalla y los avisos.
    from app.core import cambios_documento as cd
    assert cd.CAMPOS["VEN"]["pxp_numero"] == "Orden de pago"
