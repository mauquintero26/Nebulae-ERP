"""B4 T12 (KANBAN-compras puntos 3 y 4 con R9; C10, C15c; RP44, RP97, D46): PATCH /compras/pedidos/{id} cambia el
estado del pedido de compra solo por el camino correcto (_validar_transicion_pec, antes de tocar nada).

A mano solo se emite un borrador (EMITIDO desde BORRADOR) o se cancela (desde borrador, emitido o en tránsito, con un
motivo de 5 caracteres o más que queda en la Actividad, y nunca con recepciones que no estén canceladas: 409). EN_TRANSITO
lo pone el seguimiento y los estados de recepción la recepción en bodega (422 diciendo dónde). Desde cancelado, en bodega
o recibido, 422. pec_cancelar_en_transito = «Sí, mientras no tenga recepciones en bodega»; pec_motivo_cancelacion = «Sí,
obligatorio (mínimo 5 letras)». El estilo es el de test_pendiente_compra_lista_pec.py: el PEC se crea por la API o por
ORM con db.add.

RP45 (D7): el seguimiento (PATCH /tracking) solo cambia el estado de un PEC en borrador, emitido o en tránsito: uno en
bodega, recibido o cancelado guarda sus etapas sin cambiar de estado; la Actividad dice «Llegó a bodega: se completaron
todas las etapas del envío.».

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_pec_transiciones).
"""
import uuid
from datetime import datetime, timedelta

from app.core.textos_actividad import nombre_de_usuario
from app.models.erp_documents import ActivityLog, GoodsReceipt, PurchaseOrderFull, SaleOrder
from tests.usuarios_de_prueba import compras_token  # noqa: F401 (fixture por nombre, RP79)

RUTA = "/api/v1/compras/pedidos"
# r1 (m6): el estado y el motivo del PATCH tienen su propio texto (no es una búsqueda).
CONTROL_ESTADO = "El estado no puede llevar caracteres de control."
CONTROL_MOTIVO = "El motivo no puede llevar caracteres de control."
EN_TRANSITO_A_MANO = "'En tránsito' lo marca el seguimiento del envío (Mercancía en tránsito)."
RECIBIDO_A_MANO = "'Recibido' lo marca la recepción en bodega (Recepciones)."
SOLO_BORRADOR = "Solo un pedido en Borrador se puede marcar como Emitido."
MOTIVO = "Indica el motivo de la cancelación (mínimo 5 caracteres)."
ESTADOS_DE_RECEPCION = ("RECIBIDO", "PARCIALMENTE_RECIBIDA", "RECIBIDA", "COMPLETADO")


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _no_valido(nombre):
    return f"«{nombre}» no es un estado válido para un pedido de compra."


def _cancelado(numero):
    return f"El pedido de compra {numero} está cancelado y no se puede reabrir."


def _en_bodega(numero):
    return f"El pedido de compra {numero} ya llegó a bodega: su estado lo lleva la recepción."


class _Fabrica:
    def __init__(self, db):
        self.db = db
        self.sufijo = uuid.uuid4().hex[:8].upper()
        self.n = 0

    def _numero(self, prefijo):
        self.n += 1
        return f"{prefijo}{self.sufijo}{self.n:02d}"

    def _guardar(self, objeto):
        self.db.add(objeto)
        self.db.commit()
        return objeto

    def pec(self, estado="BORRADOR", **campos):
        campos.setdefault("fecha_entrega_estimada", datetime(2026, 12, 1))
        return self._guardar(PurchaseOrderFull(numero=self._numero("PEC-T"), estado=estado,
                                               supplier_name=f"Prov {self.sufijo}", total_cop=100_000, **campos))

    def recepcion(self, pec, estado="BORRADOR"):
        return self._guardar(GoodsReceipt(numero=self._numero("ENINV-T"), pec_id=pec.id, pec_numero=pec.numero,
                                          estado=estado))

    def pven(self, estado="EN_PROCESO", pec=None):
        return self._guardar(SaleOrder(numero=self._numero("PV-T"), customer_name=f"Cliente {self.sufijo}",
                                       estado=estado, pec_id=pec.id if pec else None,
                                       pec_numero=pec.numero if pec else None))


def _patch(app_client, token, pec, **body):
    return app_client.patch(f"{RUTA}/{pec.id}", json=body, headers=_auth(token))


def _error(app_client, token, pec, codigo=422, **body):
    resp = _patch(app_client, token, pec, **body)
    assert resp.status_code == codigo, (body, resp.status_code, resp.text)
    return resp.json()["detail"]


def _estado(db, pec):
    db.expire_all()
    return db.query(PurchaseOrderFull.estado).filter(PurchaseOrderFull.id == pec.id).scalar()


def _logs(db, pec, accion="ESTADO_CHANGED"):
    db.expire_all()
    return (db.query(ActivityLog).filter(ActivityLog.entity_type == "PEC", ActivityLog.entity_id == pec.id,
                                         ActivityLog.action == accion).order_by(ActivityLog.id).all())


# ─── 1) EMITIDO desde BORRADOR ────────────────────────────────────────────────────────────────────────────────────────

def test_borrador_se_emite(app_client, db, admin_token, user_admin):
    f = _Fabrica(db)
    pec = f.pec("BORRADOR")
    resp = _patch(app_client, admin_token, pec, estado="EMITIDO")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["estado"] == "EMITIDO"
    logs = _logs(db, pec)
    assert [(l.description, l.old_estado, l.new_estado) for l in logs] == [
        ("Estado cambiado a Emitido", "BORRADOR", "EMITIDO")]
    # B4 T24 (FINAL-m2): la Actividad la firma quien tiene la sesión, venga o no updated_by.
    assert logs[0].user_name == nombre_de_usuario(user_admin)
    otro = f.pec("BORRADOR")
    assert _patch(app_client, admin_token, otro, estado="EMITIDO", updated_by="Ana Compras").status_code == 200
    assert _logs(db, otro)[0].user_name == nombre_de_usuario(user_admin)


def test_compras_tambien_emite_y_cancela(app_client, db, compras_token):
    f = _Fabrica(db)
    pec = f.pec("BORRADOR")
    assert _patch(app_client, compras_token, pec, estado="EMITIDO").status_code == 200
    assert _patch(app_client, compras_token, pec, estado="CANCELADO", motivo="Ya no se necesita").status_code == 200
    assert _estado(db, pec) == "CANCELADO"


# ─── 2) EN_TRANSITO y los de recepción no se ponen a mano ────────────────────────────────────────────────────────────

def test_en_transito_y_recibido_no_se_ponen_a_mano(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    with contador_sql.ventana() as v:
        assert _error(app_client, admin_token, pec, estado="EN_TRANSITO") == EN_TRANSITO_A_MANO
        assert _error(app_client, admin_token, pec, estado="PENDIENTE_ENTREGA") == EN_TRANSITO_A_MANO
        for destino in ESTADOS_DE_RECEPCION:
            assert _error(app_client, admin_token, pec, estado=destino) == RECIBIDO_A_MANO, destino
    assert v.commits == 0
    assert not [x for x in v.sentencias if x.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    assert _estado(db, pec) == "EMITIDO"
    assert _logs(db, pec) == []


def test_la_validacion_corre_antes_de_tocar_los_productos(app_client, db, admin_token, contador_sql):
    """RP97: con productos en el cuerpo, un estado que no vale da 422 SIN el DELETE de purchase_order_lines."""
    from app.models.fase1b import PurchaseOrderLine
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    db.add(PurchaseOrderLine(pec_id=pec.id, description="Linea", quantity_ordered=2, quantity_received=0,
                             source="NATIVE"))
    db.commit()
    with contador_sql.ventana() as v:
        assert _error(app_client, admin_token, pec, estado="RECIBIDA",
                      productos=[{"nombre": "Otra", "qty": 5}]) == RECIBIDO_A_MANO
    assert not [x for x in v.sentencias if x.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    db.expire_all()
    assert [(l.description, l.quantity_ordered) for l in
            db.query(PurchaseOrderLine).filter(PurchaseOrderLine.pec_id == pec.id)] == [("Linea", 2)]


# ─── 3) Lo que no es un estado manual ────────────────────────────────────────────────────────────────────────────────

def test_emitido_no_vuelve_a_borrador_ni_pasa_a_otro_estado(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    assert _error(app_client, admin_token, pec, estado="BORRADOR") == _no_valido("Borrador")
    assert _error(app_client, admin_token, pec, estado="ENVIADO") == _no_valido("Enviado al proveedor")
    assert _error(app_client, admin_token, pec, estado="FOO") == _no_valido("FOO")
    assert _error(app_client, admin_token, pec, estado="emitido") == _no_valido("emitido")
    assert _error(app_client, admin_token, pec, estado="X" * 300) == _no_valido("X" * 40)
    # Lo que no es un texto, o un texto en blanco, tampoco es un estado (antes un null llegaba a la columna NOT NULL).
    for valor, nombre in ((None, ""), ("", ""), ("   ", ""), (123, "123"), (["EMITIDO"], "['EMITIDO']")):
        assert _error(app_client, admin_token, pec, estado=valor) == _no_valido(nombre), valor
    assert _error(app_client, admin_token, pec, estado="EMI\x00TIDO") == CONTROL_ESTADO
    assert _estado(db, pec) == "EMITIDO"


def test_emitido_solo_desde_borrador(app_client, db, admin_token):
    f = _Fabrica(db)
    for origen in ("EN_TRANSITO", "ENVIADO", "PENDIENTE_ENTREGA", "CONFIRMADA"):   # CONFIRMADA: un heredado
        pec = f.pec(origen)
        assert _error(app_client, admin_token, pec, estado="EMITIDO") == SOLO_BORRADOR, origen
        assert _estado(db, pec) == origen


# ─── 4) Cancelar exige el motivo (pec_motivo_cancelacion = Sí) ───────────────────────────────────────────────────────

def test_cancelar_exige_motivo(app_client, db, admin_token, user_admin):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    pven = f.pven("EN_PROCESO", pec)
    for body in ({}, {"motivo": "abc"}, {"motivo": "  abcd   "}, {"motivo": None}, {"motivo": "    "}):
        assert _error(app_client, admin_token, pec, estado="CANCELADO", **body) == MOTIVO, body
    assert _error(app_client, admin_token, pec, estado="CANCELADO", motivo="Sin stock\x00") == CONTROL_MOTIVO
    assert _estado(db, pec) == "EMITIDO" and _logs(db, pec) == []
    resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="  El proveedor no tiene stock ",
                  updated_by="tester")
    assert resp.status_code == 200, resp.text
    logs = _logs(db, pec)
    assert [(l.description, l.old_estado, l.new_estado, l.user_name) for l in logs] == [
        ("Estado cambiado a Cancelado. Motivo: El proveedor no tiene stock", "EMITIDO", "CANCELADO",
         nombre_de_usuario(user_admin))]   # B4 T24 (FINAL-m2): no el updated_by «tester»
    # _desvincular_pec_cancelado: el PVEN vinculado vuelve a Pendiente de Compra.
    db.expire_all()
    pven = db.query(SaleOrder).filter(SaleOrder.id == pven.id).one()
    assert (pven.estado, pven.pec_id, pven.pec_numero) == ("PENDIENTE_COMPRA", None, None)


def test_se_cancela_desde_borrador_emitido_y_en_transito(app_client, db, admin_token):
    """pec_cancelar_en_transito = Sí, mientras no tenga recepciones (como hoy)."""
    f = _Fabrica(db)
    for origen in ("BORRADOR", "EMITIDO", "ENVIADO", "EN_TRANSITO", "PENDIENTE_ENTREGA", "CONFIRMADA"):
        pec = f.pec(origen)
        resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Cambio de proveedor")
        assert resp.status_code == 200, (origen, resp.text)
        assert _estado(db, pec) == "CANCELADO", origen


# ─── 5) Con recepciones no se cancela (409); una recepción cancelada no cuenta (RP44) ────────────────────────────────

def test_no_se_cancela_con_recepciones(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EN_TRANSITO")
    f.recepcion(pec, "BORRADOR")
    texto = f"{pec.numero} tiene 1 recepción(es) en bodega: no se puede cancelar."
    assert _error(app_client, admin_token, pec, codigo=409, estado="CANCELADO", motivo="Sin stock otra vez") == texto
    assert _error(app_client, admin_token, pec, codigo=409, estado="CANCELADO") == texto   # antes que el motivo
    f.recepcion(pec, "COMPLETADA")
    f.recepcion(pec, "CANCELADA")
    assert _error(app_client, admin_token, pec, codigo=409, estado="CANCELADO", motivo="Sin stock otra vez") == (
        f"{pec.numero} tiene 2 recepción(es) en bodega: no se puede cancelar.")
    assert _estado(db, pec) == "EN_TRANSITO"


def test_con_solo_una_recepcion_cancelada_si_se_cancela(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    f.recepcion(pec, "CANCELADA")
    resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Pedido duplicado")
    assert resp.status_code == 200, resp.text
    assert _estado(db, pec) == "CANCELADO"


# ─── 6) Cancelado no se reabre; en bodega o recibido lo lleva la recepción ───────────────────────────────────────────

def test_cancelado_no_se_reabre(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("CANCELADO")
    assert _error(app_client, admin_token, pec, estado="EMITIDO") == _cancelado(pec.numero)
    assert _error(app_client, admin_token, pec, estado="BORRADOR") == _no_valido("Borrador")
    assert _estado(db, pec) == "CANCELADO"
    # El mismo estado no es un cambio: pasa sin motivo y sin Actividad nueva.
    assert _patch(app_client, admin_token, pec, estado="CANCELADO").status_code == 200
    assert _logs(db, pec) == []


def test_en_bodega_o_recibido_no_se_cambian_a_mano(app_client, db, admin_token):
    """PATCH CANCELADO desde RECIBIDO («Llegó a bodega») y los demás estados de recepción → 422."""
    f = _Fabrica(db)
    for origen in ESTADOS_DE_RECEPCION:
        pec = f.pec(origen)
        assert _error(app_client, admin_token, pec, estado="CANCELADO", motivo="El cliente desistió") == (
            _en_bodega(pec.numero)), origen
        assert _error(app_client, admin_token, pec, estado="EMITIDO") == _en_bodega(pec.numero), origen
        assert _estado(db, pec) == origen


# ─── 7) El mismo estado y los demás campos siguen libres ─────────────────────────────────────────────────────────────

def test_mismo_estado_y_otros_campos_siguen_libres(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EN_TRANSITO", fecha_entrega_estimada=datetime(2026, 12, 1, 15, 0))
    resp = _patch(app_client, admin_token, pec, estado="EN_TRANSITO", notas="x")
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["notas"] == "x" and resp.json()["data"]["estado"] == "EN_TRANSITO"
    assert _patch(app_client, admin_token, pec, estado=" EN_TRANSITO ").status_code == 200
    assert _estado(db, pec) == "EN_TRANSITO"
    assert _logs(db, pec) == []
    resp = _patch(app_client, admin_token, pec, fecha_entrega_estimada="2026-12-04", updated_by="tester")
    assert resp.status_code == 200, resp.text
    assert [l.description for l in _logs(db, pec, "FECHA_ENTREGA_MODIFICADA")] == [
        "Fecha de entrega modificada: 01/12/2026 -> 04/12/2026 (+3 días)"]


def test_ids_que_no_existen_o_no_son_numero(app_client, admin_token):
    from main import MENSAJE_DATOS_INVALIDOS
    for pec_id in (987654321, 10 ** 12):
        resp = app_client.patch(f"{RUTA}/{pec_id}", json={"estado": "EMITIDO"}, headers=_auth(admin_token))
        assert resp.status_code == 404 and resp.json()["detail"] == "Pedido de compra no encontrado", pec_id
    resp = app_client.patch(f"{RUTA}/abc", json={"estado": "EMITIDO"}, headers=_auth(admin_token))
    assert resp.status_code == 400 and resp.json()["message"] == MENSAJE_DATOS_INVALIDOS


# ─── 8) El seguimiento sigue poniendo EN_TRANSITO y RECIBIDO (no pasa por la validación nueva) ──────────────────────

def test_el_seguimiento_sigue_poniendo_transito_y_recibido(app_client, db, admin_token, supplier):
    body = {"supplier_id": supplier.id, "supplier_name": supplier.name, "tipo_envio": "directo",
            "productos": [{"producto_nombre": "Producto", "nombre": "Producto", "qty": 1, "unit_price_cop": 1000}]}
    pec = app_client.post(RUTA, json=body, headers=_auth(admin_token)).json()["data"]
    assert pec["estado"] == "BORRADOR"

    def tracking(stage, status):
        resp = app_client.patch(f"{RUTA}/{pec['id']}/tracking", json={"stage": stage, "status": status,
                                                                     "user_name": "tester"},
                                headers=_auth(admin_token))
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    assert tracking("PENDIENTE_DESPACHO", "EN_PROCESO")["estado"] == "EN_TRANSITO"
    for stage in ("PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"):
        data = tracking(stage, "COMPLETADO")
    assert data["estado"] == "RECIBIDO"


# ─── 9) La lista con varios estados ──────────────────────────────────────────────────────────────────────────────────

def test_lista_pec_varios_estados(app_client, db, admin_token):
    f = _Fabrica(db)
    a = f.pec("RECIBIDO")
    b = f.pec("PARCIALMENTE_RECIBIDA")
    f.pec("EMITIDO")
    for clave in ("estado", "estados"):
        resp = app_client.get(RUTA, params={"q": f.sufijo, clave: "RECIBIDO,PARCIALMENTE_RECIBIDA"},
                              headers=_auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert {x["id"] for x in resp.json()["data"]} == {a.id, b.id}, clave


# ─── RP45 (D7): completar la última etapa no reabre un PEC recibido, en bodega ni cancelado ─────────────────────────

def _pec_con_seguimiento(app_client, admin_token, supplier):
    body = {"supplier_id": supplier.id, "supplier_name": supplier.name, "tipo_envio": "directo",
            "productos": [{"producto_nombre": "Producto", "nombre": "Producto", "qty": 1, "unit_price_cop": 1000}]}
    resp = app_client.post(RUTA, json=body, headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text
    return resp.json()["data"]


def _tracking(app_client, admin_token, pec_id, stage, status):
    resp = app_client.patch(f"{RUTA}/{pec_id}/tracking", json={"stage": stage, "status": status,
                                                                "user_name": "tester"},
                            headers=_auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def test_completar_la_ultima_etapa_deja_recibido_con_su_texto(app_client, db, admin_token, supplier):
    pec = _pec_con_seguimiento(app_client, admin_token, supplier)
    for stage in ("PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"):
        data = _tracking(app_client, admin_token, pec["id"], stage, "COMPLETADO")
    assert data["estado"] == "RECIBIDO"
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec["id"]).one()
    assert [(l.description, l.old_estado, l.new_estado) for l in _logs(db, fila)] == [
        ("Llegó a bodega: se completaron todas las etapas del envío.", "BORRADOR", "RECIBIDO")]


def test_el_seguimiento_no_reabre_recibidos_ni_cancelados(app_client, db, admin_token, supplier):
    """RP45: el cambio automático de estado solo corre si el PEC está en borrador, emitido o en tránsito. Con un PEC
    RECIBIDA, PARCIALMENTE_RECIBIDA o CANCELADO se guardan las etapas y el estado no cambia (sin Actividad de estado)."""
    for estado in ("RECIBIDA", "PARCIALMENTE_RECIBIDA", "CANCELADO", "COMPLETADO"):
        pec = _pec_con_seguimiento(app_client, admin_token, supplier)
        fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec["id"]).one()
        fila.estado = estado
        db.commit()
        data = _tracking(app_client, admin_token, pec["id"], "PENDIENTE_DESPACHO", "EN_PROCESO")
        assert data["estado"] == estado, estado
        for stage in ("PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"):
            data = _tracking(app_client, admin_token, pec["id"], stage, "COMPLETADO")
        assert data["estado"] == estado, estado
        assert [s["status"] for s in data["tracking_stages"]] == ["COMPLETADO"] * 3, estado
        assert _estado(db, fila) == estado, estado
        assert _logs(db, fila) == [], estado


# ─── r1 (m1): los avisos de las etapas del seguimiento llevan tildes (D36) ──────────────────────────────────────────

def test_los_avisos_de_las_etapas_llevan_tildes():
    """Los cuatro mensajes de _stage_alert, por igualdad: con ETA (atrasada y en plazo) y sin ETA (confirmación atrasada
    y en plazo). pasosDeTracking de lib/flujo-compras.js los muestra tal cual."""
    from app.api.v1.erp_compras import _stage_alert
    ahora = datetime.utcnow()
    eta_vieja = ahora - timedelta(days=5, hours=1)
    atrasada = _stage_alert({"status": "EN_PROCESO", "eta": eta_vieja.isoformat(), "alert_overdue_days": 1}, None)
    assert atrasada["nivel"] == "atrasado"
    assert atrasada["mensaje"] == f"Entrega atrasada por 5 día(s) (ETA {eta_vieja:%d/%m/%Y})"
    eta_futura = ahora + timedelta(days=10, hours=1)
    en_plazo = _stage_alert({"status": "EN_PROCESO", "eta": eta_futura.isoformat(), "alert_overdue_days": 1}, None)
    assert en_plazo["nivel"] == "ok" and en_plazo["dias_restantes"] == 11
    assert en_plazo["mensaje"] == f"ETA {eta_futura:%d/%m/%Y} · 11 día(s) para confirmación atrasada"
    sin_confirmar = _stage_alert({"status": "PENDIENTE", "alert_confirm_days": 2},
                                 (ahora - timedelta(days=10, hours=1)).isoformat())
    assert sin_confirmar["nivel"] == "atrasado"
    assert sin_confirmar["mensaje"] == "Confirmación pendiente atrasada por 8 día(s)"
    por_confirmar = _stage_alert({"status": "PENDIENTE", "alert_confirm_days": 5}, (ahora + timedelta(hours=1)).isoformat())
    assert por_confirmar["nivel"] == "ok" and por_confirmar["dias_restantes"] == 5
    assert por_confirmar["mensaje"] == "5 día(s) para confirmar esta etapa"
    assert _stage_alert({"status": "COMPLETADO", "eta": eta_vieja.isoformat(), "alert_overdue_days": 1}, None) is None


# ─── r1 (m6, m7): ningún campo del PATCH da 500 después de guardar ────────────────────────────────────────────────

AUTOR_NO_TEXTO = "El nombre de quien hace el cambio debe ser un texto."
AUTOR_CONTROL = "El nombre de quien hace el cambio no puede llevar caracteres de control."
AUTOR_LARGO = "El nombre de quien hace el cambio no puede pasar de 150 caracteres."
NOTAS_NO_TEXTO = "Las notas deben ser un texto."
NOTAS_CONTROL = "Las notas no pueden llevar caracteres de control."
FECHA_INVALIDA = "La fecha de entrega estimada no es válida: usa el formato AAAA-MM-DD."
FECHA_ALERTA_INVALIDA = "La fecha de alerta no es válida: usa el formato AAAA-MM-DD."
FECHA_COMPRA_INVALIDA = "La fecha de compra no es válida: usa el formato AAAA-MM-DD."
REF_NO_TEXTO = "La referencia del proveedor debe ser un texto."
REF_CONTROL = "La referencia del proveedor no puede llevar caracteres de control."
REF_LARGO = "La referencia del proveedor no puede pasar de 100 caracteres."
ETAPAS_NO_LISTA = "Las etapas del seguimiento deben ser una lista de etapas."
ETAPA_NO_OBJETO = "Cada etapa del seguimiento debe ser un objeto con sus campos."
ETAPA_DIAS_INVALIDOS = "Los días de alerta de una etapa del seguimiento deben ser un número entre 0 y 36500."
# Cierre de r1 (m34): el eta de PATCH /tracking acepta la zona horaria; solo se acota el año (A2).
ETA_SEGUIMIENTO_INVALIDA = ("La fecha estimada de la etapa no es válida: usa el formato AAAA-MM-DD, con un año entre 1900 "
                            "y 2999.")
ETAPA_FECHA_INVALIDA = "La fecha de una etapa del seguimiento no es válida: usa el formato AAAA-MM-DD, sin zona horaria."


def test_los_campos_libres_se_validan_antes_de_guardar(app_client, db, admin_token, contador_sql, user_admin):
    """m7: updated_by llega a ActivityLog.user_name (String(150)) DESPUÉS del commit del estado; con más de 150
    caracteres o un NUL respondía 500 y el CANCELADO quedaba guardado sin Actividad y sin desvincular el PVEN. Ahora se
    valida antes de tocar nada, igual que las notas con un carácter de control y una fecha de entrega que no se lee.
    r2 (m3, m6) y B4 T24 (B27): también fecha_alerta y fecha_compra, supplier_ref y tracking_stages
    (_validar_campos_libres_pec)."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    pven = f.pven("EN_PROCESO", pec)
    casos = [
        ({"updated_by": 123}, AUTOR_NO_TEXTO),
        ({"updated_by": ["Ana"]}, AUTOR_NO_TEXTO),
        ({"updated_by": "A" * 151}, AUTOR_LARGO),
        ({"updated_by": "Ana\x00"}, AUTOR_CONTROL),
        ({"notas": "nota\x00"}, NOTAS_CONTROL),
        ({"notas": {"a": 1}}, NOTAS_NO_TEXTO),
        ({"fecha_entrega_estimada": "no-es-una-fecha"}, FECHA_INVALIDA),
        ({"fecha_entrega_estimada": "2026-02-30"}, FECHA_INVALIDA),
        ({"fecha_entrega_estimada": "2026-W49-5"}, FECHA_INVALIDA),
        ({"fecha_entrega_estimada": "2026W495"}, FECHA_INVALIDA),
        ({"fecha_entrega_estimada": "2026-W49"}, FECHA_INVALIDA),
        ({"fecha_alerta": "no-es-una-fecha"}, FECHA_ALERTA_INVALIDA),
        ({"fecha_alerta": "2026-W49-5"}, FECHA_ALERTA_INVALIDA),
        ({"fecha_alerta": 5}, FECHA_ALERTA_INVALIDA),
        ({"fecha_compra": "2026-13-01"}, FECHA_COMPRA_INVALIDA),
        ({"fecha_compra": "2026W495"}, FECHA_COMPRA_INVALIDA),
        ({"supplier_ref": 7}, REF_NO_TEXTO),
        ({"supplier_ref": "R" * 101}, REF_LARGO),
        ({"supplier_ref": "ref\x00"}, REF_CONTROL),
        ({"tracking_stages": "x"}, ETAPAS_NO_LISTA),
        ({"tracking_stages": ["x"]}, ETAPA_NO_OBJETO),
        ({"tracking_stages": [{"status": "PENDIENTE", "alert_overdue_days": "a"}]}, ETAPA_DIAS_INVALIDOS),
        ({"tracking_stages": [{"status": "PENDIENTE", "alert_confirm_days": True}]}, ETAPA_DIAS_INVALIDOS),
        ({"tracking_stages": [{"status": "PENDIENTE", "alert_overdue_days": 10 ** 12}]}, ETAPA_DIAS_INVALIDOS),
        ({"tracking_stages": [{"status": "PENDIENTE", "alert_confirm_days": -1}]}, ETAPA_DIAS_INVALIDOS),   # B4 T24 (B26)
        ({"tracking_stages": [{"status": "PENDIENTE", "eta": "3000-01-01T10:00:00+00:00"}]},   # cierre de r1 (duda 1); r2
         ETA_SEGUIMIENTO_INVALIDA),
        ({"tracking_stages": [{"status": "PENDIENTE", "eta": 5}]}, ETA_SEGUIMIENTO_INVALIDA),
        ({"tracking_stages": [{"status": "COMPLETADO", "timestamp": "2026-12-05T10:00:00+05:00"}]},
         ETAPA_FECHA_INVALIDA),                                                                       # B4 T24 (B26)
        ({"tracking_stages": [{"status": "COMPLETADO", "timestamp": 5}]}, ETAPA_FECHA_INVALIDA),
        ({"fecha_entrega_estimada": 20261204}, FECHA_INVALIDA),
    ]
    with contador_sql.ventana() as v:
        for extra, texto in casos:
            for base in ({}, {"estado": "CANCELADO", "motivo": "El proveedor no responde"}):
                assert _error(app_client, admin_token, pec, **base, **extra) == texto, (base, extra)
    assert v.commits == 0
    assert not [x for x in v.sentencias if x.lstrip().upper().startswith(("INSERT", "UPDATE", "DELETE"))]
    db.expire_all()
    assert _estado(db, pec) == "EMITIDO" and _logs(db, pec) == []
    assert db.query(SaleOrder.pec_id).filter(SaleOrder.id == pven.id).scalar() == pec.id
    # Lo que sí vale sigue pasando: 150 caracteres, un tabulador en las notas y la fecha con hora o con Z.
    for extra in ({"updated_by": "A" * 150}, {"notas": "línea 1\tlínea 2\nlínea 3"},
                  {"fecha_entrega_estimada": "2026-12-05T10:00:00"}, {"fecha_entrega_estimada": "2026-12-06T10:00:00Z"},
                  {"fecha_entrega_estimada": None}, {"notas": None}, {"updated_by": None}):
        resp = _patch(app_client, admin_token, pec, **extra)
        assert resp.status_code == 200, (extra, resp.text)
    resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="El proveedor no responde",
                  updated_by="A" * 150)
    assert resp.status_code == 200, resp.text
    assert [l.user_name for l in _logs(db, pec)] == [nombre_de_usuario(user_admin)]   # B4 T24 (FINAL-m2)


def test_cada_fecha_se_lee_una_sola_vez(app_client, db, admin_token, monkeypatch):
    """B4 T24 (B28): _fecha_leida corría dos veces por campo (el validador descartaba el datetime y update_pec lo volvía
    a calcular). Ahora _validar_campos_libres_pec devuelve las fechas leídas y update_pec las guarda."""
    from app.api.v1 import erp_compras
    real, llamadas = erp_compras._fecha_leida, []

    def contada(valor, mensaje):
        llamadas.append(valor)
        return real(valor, mensaje)
    monkeypatch.setattr(erp_compras, "_fecha_leida", contada)
    pec = _Fabrica(db).pec("EMITIDO")
    resp = _patch(app_client, admin_token, pec, fecha_entrega_estimada="2026-12-09", fecha_alerta="2026-12-08",
                  fecha_compra="")
    assert resp.status_code == 200, resp.text
    assert sorted(llamadas) == ["", "2026-12-08", "2026-12-09"]
    db.expire_all()
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).one()
    assert (fila.fecha_entrega_estimada, fila.fecha_alerta, fila.fecha_compra) == (
        datetime(2026, 12, 9), datetime(2026, 12, 8), None)


def test_los_largos_son_los_de_las_columnas():
    """B4 T24 (B29): los topes del autor y de la referencia del proveedor salen de las columnas, no de una copia a mano.
    r1 (m24): se comprueba en el código de erp_compras (la cifra sola también coincidía con la copia a mano de antes)."""
    import inspect
    import re
    from app.api.v1 import erp_compras
    fuente = inspect.getsource(erp_compras)
    assert re.search(r"^MAX_AUTOR = ActivityLog\.__table__\.c\.user_name\.type\.length\b", fuente, re.M)
    assert re.search(r"^MAX_SUPPLIER_REF = PurchaseOrderFull\.__table__\.c\.supplier_ref\.type\.length\b", fuente, re.M)
    assert erp_compras.MAX_AUTOR == ActivityLog.__table__.c.user_name.type.length == 150
    assert erp_compras.MAX_SUPPLIER_REF == PurchaseOrderFull.__table__.c.supplier_ref.type.length == 100


def test_fechas_en_blanco_borran_y_se_guarda_la_fecha_leida(app_client, db, admin_token):
    """r2 (m2, m4, m3): el formulario «Editar información» manda '' si el PEC no tiene fecha; '' o solo espacios = null
    (200, la fecha queda en NULL). Con valor, se guarda la fecha leída (naive, en UTC si trae zona), no el texto."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO", fecha_alerta=datetime(2026, 12, 2))
    for en_blanco in ("", "   "):
        f2 = f.pec("EMITIDO", fecha_alerta=datetime(2026, 12, 2), fecha_compra=datetime(2026, 11, 20))   # B4 T24 (B30)
        resp = _patch(app_client, admin_token, f2, fecha_entrega_estimada=en_blanco, fecha_alerta=en_blanco,
                      fecha_compra=en_blanco, notas="solo las notas")
        assert resp.status_code == 200, (en_blanco, resp.text)
        db.expire_all()
        fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == f2.id).one()
        assert (fila.fecha_entrega_estimada, fila.fecha_alerta, fila.fecha_compra, fila.notas) == (
            None, None, None, "solo las notas"), en_blanco
    resp = _patch(app_client, admin_token, pec, fecha_entrega_estimada="2026-12-06T23:30:00-05:00",
                  fecha_alerta=" 2026-12-03 ", fecha_compra="2026-12-01T08:00:00Z")
    assert resp.status_code == 200, resp.text
    db.expire_all()
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).one()
    assert fila.fecha_entrega_estimada == datetime(2026, 12, 7, 4, 30)
    assert (fila.fecha_alerta, fila.fecha_compra) == (datetime(2026, 12, 3), datetime(2026, 12, 1, 8, 0))
    ok = [{"status": "PENDIENTE", "alert_overdue_days": 3, "alert_confirm_days": 1.5, "eta": "2026-12-05T10:00:00"},
          {"status": "COMPLETADO", "timestamp": "2026-12-01T08:00:00"}]
    resp = _patch(app_client, admin_token, pec, supplier_ref="R" * 100, tracking_stages=ok)
    assert resp.status_code == 200, resp.text
    db.expire_all()   # B4 T24 (B30): lo guardado, no solo el 200
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).one()
    assert fila.supplier_ref == "R" * 100
    assert [(e["status"], e.get("eta"), e.get("timestamp")) for e in fila.tracking_stages] == [
        ("PENDIENTE", "2026-12-05T10:00:00", None), ("COMPLETADO", None, "2026-12-01T08:00:00")]


def test_tracking_valida_el_autor_antes_de_escribir(app_client, db, admin_token, contador_sql):
    """r2 (m5): user_name llega a ActivityLog.user_name (String(150)) DESPUÉS del commit; con 151 caracteres o un NUL
    daba 500 con la etapa ya guardada. Ahora 422, 0 commits y la etapa sin cambios."""
    f = _Fabrica(db)
    etapas = [{"stage": "PROVEEDOR_CASILLERO", "status": "PENDIENTE", "timestamp": None}]
    pec = f.pec("EMITIDO", tracking_stages=etapas)
    with contador_sql.ventana() as v:
        for autor, texto in (("A" * 151, AUTOR_LARGO), ("Ana\x00", AUTOR_CONTROL)):
            resp = app_client.patch(f"{RUTA}/{pec.id}/tracking", headers=_auth(admin_token),
                                    json={"stage": "PROVEEDOR_CASILLERO", "status": "EN_PROCESO", "user_name": autor})
            assert (resp.status_code, resp.json()["detail"]) == (422, texto), autor
    assert v.commits == 0
    db.expire_all()
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).one()
    assert [e["status"] for e in fila.tracking_stages] == ["PENDIENTE"] and fila.estado == "EMITIDO"
    assert _logs(db, pec, "TRACKING_UPDATED") == []


def test_eliminar_pedido_no_cancelado_dice_el_estado_con_su_etiqueta(app_client, db, admin_token):
    """r2 (m10): el 422 de DELETE lleva «está», la etiqueta legible del estado y «cancélalo». B4 T24 (B31): «está en
    estado «…»» y «cancélalo primero» solo si el pedido se puede cancelar (uno que llegó a bodega o recibido, no)."""
    f = _Fabrica(db)
    for estado, cola in (("EN_TRANSITO", "«En tránsito»: cancélalo primero."), ("BORRADOR", "«Borrador»: cancélalo primero."),
                         ("RECIBIDO", "«Llegó a bodega»."), ("RECIBIDA", "«Recibido».")):
        pec = f.pec(estado)
        resp = app_client.delete(f"{RUTA}/{pec.id}", headers=_auth(admin_token))
        assert (resp.status_code, resp.json()["detail"]) == (422, (
            f"Solo se pueden eliminar pedidos de compra cancelados. {pec.numero} está en estado {cola}")), estado


def test_tracking_deja_en_la_actividad_la_guia_con_tilde_y_etiquetas(app_client, db, admin_token, user_admin):
    """r2 (m10): «… | Guía: …». B4 T24 (B25): la etapa con su nombre (el label guardado; si no, el de la configuración;
    si no, el código humanizado), entre comillas angulares porque los nombres traen su propia flecha, y su estado con la
    etiqueta de los pasos (ETAPA_ENVIO: «En curso», «Completada»). FINAL-m2: firma la sesión, no user_name."""
    f = _Fabrica(db)
    etapas = [{"stage": "PROVEEDOR_CASILLERO", "status": "PENDIENTE", "timestamp": None},
              {"stage": "MI_ETAPA", "label": "Aduana Bogotá", "status": "PENDIENTE", "timestamp": None},
              {"stage": "OTRA_COSA", "status": "PENDIENTE", "timestamp": None}]
    pec = f.pec("EMITIDO", tracking_stages=etapas)
    for etapa, estado, guia in (("PROVEEDOR_CASILLERO", "EN_PROCESO", "ZX9"), ("MI_ETAPA", "COMPLETADO", None),
                                ("OTRA_COSA", "CANCELADO", None), ("OTRA_COSA", "PENDIENTE", None)):
        cuerpo = {"stage": etapa, "status": estado, "user_name": "Ana"}
        if guia:
            cuerpo["tracking_number"] = guia
        resp = app_client.patch(f"{RUTA}/{pec.id}/tracking", headers=_auth(admin_token), json=cuerpo)
        assert resp.status_code == 200, resp.text
    logs = _logs(db, pec, "TRACKING_UPDATED")
    assert [l.description for l in logs] == [
        "Etapa «Proveedor -> Casillero»: En curso | Guía: ZX9",
        "Etapa «Aduana Bogotá»: Completada",
        "Etapa «Otra cosa»: Cancelada",
        "Etapa «Otra cosa»: Pendiente",
    ]
    assert {l.user_name for l in logs} == {nombre_de_usuario(user_admin)}
    # El nombre que mandó el navegador sigue en el historial de la guía, como dato.
    db.expire_all()
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == pec.id).one()
    assert [h["user"] for h in fila.tracking_stages[0]["tracking_history"]] == ["Ana"]


def test_la_etapa_del_envio_espeja_los_pasos_del_frontend():
    """B4 T24 (B25): ETIQUETAS_ESTADO['ETAPA_ENVIO'] es ETIQUETA_ETAPA_TRACKING de frontend/src/lib/flujo-compras.js (lo
    lee del archivo, sin node: es un objeto literal de una línea) y cubre los estados de validate_status."""
    import re
    from pathlib import Path
    from app.core.textos_actividad import ETIQUETAS_ESTADO
    js = (Path(__file__).resolve().parents[2] / "frontend" / "src" / "lib" / "flujo-compras.js").read_text(encoding="utf-8")
    cuerpo = re.search(r"export const ETIQUETA_ETAPA_TRACKING = congelar\(\{(.*?)\}\);", js, re.S).group(1)
    espejo = dict(re.findall(r"(\w+): '([^']*)'", cuerpo))
    assert espejo == ETIQUETAS_ESTADO["ETAPA_ENVIO"]
    assert set(ETIQUETAS_ESTADO["ETAPA_ENVIO"]) == {"PENDIENTE", "EN_PROCESO", "COMPLETADO", "CANCELADO"}


def test_la_actividad_del_pec_la_firma_la_sesion(app_client, db, admin_token, user_admin, supplier):
    """B4 T24 (FINAL-m2): ni updated_by (PATCH) ni user_name (/tracking) cambian ActivityLog.user_name: firma quien tiene
    la sesión (nombre_de_usuario), como el despacho de BODEGA (RP23). r1 (m1, m11, m20): tampoco el created_by del alta,
    que queda solo como dato del PEC."""
    resp = _crear_pec(app_client, admin_token, created_by="Otra Persona")
    assert resp.status_code == 201, resp.text
    creado = resp.json()["data"]
    db.expire_all()
    assert [(l.action, l.user_name) for l in db.query(ActivityLog).filter(
        ActivityLog.entity_type == "PEC", ActivityLog.entity_id == creado["id"])] == [
        ("CREATED", nombre_de_usuario(user_admin))]
    assert db.query(PurchaseOrderFull.created_by).filter(PurchaseOrderFull.id == creado["id"]).scalar() == "Otra Persona"
    f = _Fabrica(db)
    pec = f.pec("EMITIDO", fecha_entrega_estimada=datetime(2026, 12, 1))
    resp = _patch(app_client, admin_token, pec, fecha_entrega_estimada="2026-12-05", updated_by="Otra Persona")
    assert resp.status_code == 200, resp.text
    resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Ya no se necesita", updated_by="Otra Persona")
    assert resp.status_code == 200, resp.text
    yo = nombre_de_usuario(user_admin)
    db.expire_all()
    assert {(l.action, l.user_name) for l in db.query(ActivityLog).filter(ActivityLog.entity_type == "PEC",
                                                                           ActivityLog.entity_id == pec.id)} == {
        ("FECHA_ENTREGA_MODIFICADA", yo), ("ESTADO_CHANGED", yo)}
    con_envio = _pec_con_seguimiento(app_client, admin_token, supplier)
    for stage in ("PENDIENTE_DESPACHO", "PROVEEDOR_BODEGA", "RECIBIDO"):
        resp = app_client.patch(f"{RUTA}/{con_envio['id']}/tracking", headers=_auth(admin_token),
                                json={"stage": stage, "status": "COMPLETADO", "user_name": "Otra Persona"})
        assert resp.status_code == 200, resp.text
    fila = db.query(PurchaseOrderFull).filter(PurchaseOrderFull.id == con_envio["id"]).one()
    assert [(l.action, l.user_name) for l in _logs(db, fila)] == [("ESTADO_CHANGED", yo)]   # «Llegó a bodega»
    assert {l.user_name for l in _logs(db, fila, "TRACKING_UPDATED")} == {yo}


# ─── B4 T24 (FINAL-C2 + FINAL-m1): un PEC cancelado no se reabre por la recepción ─────────────────────────────────────

RECEPCIONES = "/api/v1/compras/recepciones"


def _no_se_recepciona(numero):
    return f"El pedido de compra {numero} está cancelado: no se puede recepcionar."


def _recepciones_de(db, pec):
    db.expire_all()
    return db.query(GoodsReceipt).filter(GoodsReceipt.pec_id == pec.id).count()


def _lee_el_pec_con_bloqueo(sentencias):
    """La primera lectura de purchase_orders_full de la petición, y si lleva FOR UPDATE. (Quien llama lee antes, fuera de la
    ventana, los atributos del PEC de la prueba: un objeto vencido por el commit se recargaría con un SELECT propio.)"""
    lecturas = [s for s in sentencias if s.lstrip().upper().startswith("SELECT") and "FROM purchase_orders_full" in s]
    assert lecturas, sentencias
    return "FOR UPDATE" in lecturas[0].upper()


def test_un_pec_cancelado_no_se_recepciona_desde_el_pedido(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    assert _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Ya no se necesita").status_code == 200
    with contador_sql.ventana() as v:
        resp = app_client.post(f"{RUTA}/{pec.id}/recepcionar", json={}, headers=_auth(admin_token))
    assert (resp.status_code, resp.json()) == (409, {"detail": _no_se_recepciona(pec.numero)})
    assert v.commits == 0 and _recepciones_de(db, pec) == 0
    assert _lee_el_pec_con_bloqueo(v.sentencias)
    assert _estado(db, pec) == "CANCELADO"


def test_un_pec_cancelado_no_se_recepciona_por_post_recepciones(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)
    pec = f.pec("CANCELADO")
    cuerpo = {"pec_id": pec.id, "pec_numero": pec.numero, "productos": []}
    with contador_sql.ventana() as v:
        resp = app_client.post(RECEPCIONES, json=cuerpo, headers=_auth(admin_token))
    assert (resp.status_code, resp.json()) == (409, {"detail": _no_se_recepciona(pec.numero)})
    assert v.commits == 0 and _recepciones_de(db, pec) == 0
    assert _lee_el_pec_con_bloqueo(v.sentencias)
    # Con un PEC vivo sigue creando la recepción como hoy (y también lo lee con bloqueo).
    vivo = f.pec("EMITIDO")
    cuerpo = {"pec_id": vivo.id, "pec_numero": vivo.numero, "productos": []}
    with contador_sql.ventana() as v:
        resp = app_client.post(RECEPCIONES, json=cuerpo, headers=_auth(admin_token))
    assert resp.status_code == 201, resp.text
    assert _recepciones_de(db, vivo) == 1 and _lee_el_pec_con_bloqueo(v.sentencias)


def test_confirmar_la_recepcion_de_un_pec_cancelado_da_409_sin_tocar_el_inventario(
        app_client, db, admin_token, contador_sql, pec_10u, eninv_5u, inv_level_zero):
    """La carrera: la ENINV ya existía (la pantalla de Recepciones estaba abierta) y otro usuario canceló el PEC."""
    from sqlalchemy import text
    pec_10u.estado = "CANCELADO"
    db.commit()
    with contador_sql.ventana() as v:
        resp = app_client.post(f"{RECEPCIONES}/{eninv_5u.id}/confirmar",
                               json={"idempotency_key": f"t24-c2-{uuid.uuid4().hex}", "receipt_type": "FISICA"},
                               headers=_auth(admin_token))
    assert (resp.status_code, resp.json()) == (409, {"detail": _no_se_recepciona(pec_10u.numero)})
    assert not [s for s in v.sentencias if "inventory_" in s and s.lstrip().upper().startswith(("INSERT", "UPDATE"))]
    db.expire_all()
    assert db.execute(text("SELECT quantity FROM inventory_levels WHERE sku_id=:s AND warehouse_id=:w"),
                      {"s": inv_level_zero.sku_id, "w": inv_level_zero.warehouse_id}).scalar() == 0
    assert _estado(db, pec_10u) == "CANCELADO"
    assert db.query(GoodsReceipt.estado).filter(GoodsReceipt.id == eninv_5u.id).scalar() == "BORRADOR"


def test_la_cancelacion_lee_el_pec_con_bloqueo(app_client, db, admin_token, contador_sql):
    """FINAL-C2: update_pec lee el PEC con FOR UPDATE antes de contar sus recepciones, para que una cancelación y una
    recepción creada al mismo tiempo queden en serie."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    db.refresh(pec)   # fuera de la ventana (ver _lee_el_pec_con_bloqueo)
    with contador_sql.ventana() as v:
        assert _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Ya no se necesita").status_code == 200
    assert _lee_el_pec_con_bloqueo(v.sentencias)


# ─── B4 T24 (FINAL-C7-b): create_pec consolida varios PVEN (ven_ids) en la misma transacción ─────────────────────────

VEN_IDS_NO_VALIDOS = "Los pedidos de venta a vincular deben ser una lista de ids de pedido (números enteros)."
VEN_IDS_DEMASIADOS = "Puedes vincular 50 pedidos de venta como máximo en un pedido de compra."


def _crear_pec(app_client, token, **body):
    body.setdefault("supplier_name", f"Prov C7 {uuid.uuid4().hex[:6]}")
    return app_client.post(RUTA, json=body, headers=_auth(token))


def _pven(db, ven):
    db.expire_all()
    return db.query(SaleOrder).filter(SaleOrder.id == ven.id).one()


def _logs_pven(db, ven):
    db.expire_all()
    return (db.query(ActivityLog).filter(ActivityLog.entity_type == "VEN", ActivityLog.entity_id == ven.id)
            .order_by(ActivityLog.id).all())


def _pecs_de_proveedor(db, nombre):
    db.expire_all()
    return db.query(PurchaseOrderFull).filter(PurchaseOrderFull.supplier_name == nombre).count()


def test_compras_consolida_varios_pven_y_quedan_vinculados_con_su_actividad(app_client, db, compras_token, contador_sql):
    from app.api.dependencies import usuario_de_token
    f = _Fabrica(db)
    a, b = f.pven("PENDIENTE_COMPRA"), f.pven("PENDIENTE_COMPRA")
    with contador_sql.ventana() as v:
        resp = _crear_pec(app_client, compras_token, ven_ids=[a.id, b.id])
    assert resp.status_code == 201, resp.text
    assert v.commits == 1   # el alta, los vínculos y las Actividades en un solo commit
    pec = resp.json()["data"]
    autor = nombre_de_usuario(usuario_de_token(compras_token, db))   # B4 T24 r1 (m27): el usuario del token
    for ven in (a, b):
        fila = _pven(db, ven)
        assert (fila.pec_id, fila.pec_numero, fila.estado) == (pec["id"], pec["numero"], "EN_PROCESO")
        assert [(l.action, l.description, l.old_estado, l.new_estado, l.user_name) for l in _logs_pven(db, ven)] == [
            ("ESTADO_CHANGED", f"Estado cambiado a En proceso (pedido de compra {pec['numero']})", "PENDIENTE_COMPRA",
             "EN_PROCESO", autor)]
    assert (pec["ven_id"], pec["ven_numero"]) == (a.id, a.numero)


def test_ven_id_y_ven_ids_se_unen_sin_repetir_con_ven_id_primero(app_client, db, admin_token):
    f = _Fabrica(db)
    a, b = f.pven("PENDIENTE_COMPRA"), f.pven("PENDIENTE_COMPRA")
    resp = _crear_pec(app_client, admin_token, ven_id=b.id, ven_ids=[a.id, b.id, a.id])
    assert resp.status_code == 201, resp.text
    pec = resp.json()["data"]
    assert (pec["ven_id"], pec["ven_numero"]) == (b.id, b.numero)
    assert _pven(db, a).pec_id == _pven(db, b).pec_id == pec["id"]
    assert len(_logs_pven(db, a)) == len(_logs_pven(db, b)) == 1


def test_solo_se_consolidan_pven_pendientes_de_compra(app_client, db, compras_token, contador_sql):
    """B4 T24 r1 (m12 + m19): con ven_ids, cada PVEN de la unión (ven_id incluido) tiene que estar en PENDIENTE_COMPRA, el
    único estado que ofrecen las pantallas de consolidar (compras/page.tsx y compras/pedidos/page.tsx): si no, 409 en
    español y no se escribe nada. COMPRAS no puede hacer PATCH de un PVEN, así que no podía vincular uno cerrado."""
    from app.core.textos_actividad import etiqueta_estado
    f = _Fabrica(db)
    libre = f.pven("PENDIENTE_COMPRA")
    for estado in ("EN_PROCESO", "CANCELADO", "ENTREGADO", "FACTURADO", "DEVUELTO_TOTAL"):
        otro = f.pven(estado)
        for cuerpo in ({"ven_ids": [libre.id, otro.id]}, {"ven_id": otro.id, "ven_ids": [libre.id]}):
            nombre = f"Prov C7 {uuid.uuid4().hex[:6]}"
            with contador_sql.ventana() as v:
                resp = _crear_pec(app_client, compras_token, supplier_name=nombre, **cuerpo)
            texto = (f"El pedido de venta {otro.numero} está en «{etiqueta_estado('VEN', estado)}»: solo se consolidan "
                     "pedidos pendientes de compra; no se creó el pedido de compra.")
            assert (resp.status_code, resp.json()) == (409, {"detail": texto}), (estado, cuerpo)
            assert v.commits == 0 and _pecs_de_proveedor(db, nombre) == 0, (estado, cuerpo)
        assert (_pven(db, otro).pec_id, _pven(db, otro).estado) == (None, estado)
    assert (_pven(db, libre).pec_id, _logs_pven(db, libre)) == (None, [])


def test_solo_ven_id_lee_el_pven_con_bloqueo(app_client, db, admin_token, contador_sql):
    """B4 T24 r1 (m19): el camino de solo ven_id también lee el PVEN con FOR UPDATE (en serie con un ven_ids a la vez)."""
    ven = _Fabrica(db).pven("PENDIENTE_COMPRA")
    cuerpo = {"ven_id": ven.id, "ven_numero": ven.numero}
    with contador_sql.ventana() as v:
        assert _crear_pec(app_client, admin_token, **cuerpo).status_code == 201
    lecturas = [s for s in v.sentencias if s.lstrip().upper().startswith("SELECT") and "FROM sale_orders" in s]
    assert lecturas and "FOR UPDATE" in lecturas[0].upper(), lecturas[:1]


def test_un_pven_con_pec_o_que_no_existe_da_409_sin_escribir(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)
    otro_pec = f.pec("EMITIDO")
    libre, ocupado = f.pven("PENDIENTE_COMPRA"), f.pven("EN_PROCESO", pec=otro_pec)
    for ven_ids, texto in (
            ([libre.id, ocupado.id], f"El pedido de venta {ocupado.numero} ya está en el pedido de compra "
                                     f"{otro_pec.numero}: no se creó el pedido de compra."),
            ([libre.id, 2 ** 31 - 2], f"No existe el pedido de venta con id {2 ** 31 - 2}: no se creó el pedido de compra.")):
        nombre = f"Prov C7 {uuid.uuid4().hex[:6]}"
        with contador_sql.ventana() as v:
            resp = _crear_pec(app_client, admin_token, ven_ids=ven_ids, supplier_name=nombre)
        assert (resp.status_code, resp.json()) == (409, {"detail": texto}), ven_ids
        assert v.commits == 0 and _pecs_de_proveedor(db, nombre) == 0
        fila = _pven(db, libre)
        assert (fila.pec_id, fila.estado) == (None, "PENDIENTE_COMPRA") and _logs_pven(db, libre) == []
    assert _pven(db, ocupado).pec_id == otro_pec.id


def test_ven_ids_se_valida_a_mano_con_422_en_espanol(app_client, db, admin_token, contador_sql):
    f = _Fabrica(db)
    ven = f.pven("PENDIENTE_COMPRA")
    for ven_ids, texto in (("1,2", VEN_IDS_NO_VALIDOS), ([ven.id, "2"], VEN_IDS_NO_VALIDOS), ([True], VEN_IDS_NO_VALIDOS),
                           ([1.5], VEN_IDS_NO_VALIDOS), ([0], VEN_IDS_NO_VALIDOS), ([-3], VEN_IDS_NO_VALIDOS),
                           ([2 ** 31], VEN_IDS_NO_VALIDOS), ({"a": 1}, VEN_IDS_NO_VALIDOS), (7, VEN_IDS_NO_VALIDOS),
                           (list(range(1, 52)), VEN_IDS_DEMASIADOS)):
        with contador_sql.ventana() as v:
            resp = _crear_pec(app_client, admin_token, ven_ids=ven_ids)
        assert (resp.status_code, resp.json()) == (422, {"detail": texto}), ven_ids
        assert v.commits == 0
    assert _pven(db, ven).pec_id is None


def test_solo_ven_id_sigue_como_hoy(app_client, db, admin_token):
    """Sin ven_ids: el PVEN de ven_id se vincula y pasa a En proceso (ahora en el mismo commit y con su Actividad); uno que
    no existe no se vincula y el PEC se crea igual (como hoy)."""
    f = _Fabrica(db)
    ven = f.pven("PENDIENTE_COMPRA")
    for ven_ids in (None, []):
        ven = f.pven("PENDIENTE_COMPRA")
        cuerpo = {"ven_id": ven.id, "ven_numero": ven.numero}
        if ven_ids is not None:
            cuerpo["ven_ids"] = ven_ids
        resp = _crear_pec(app_client, admin_token, **cuerpo)
        assert resp.status_code == 201, resp.text
        pec = resp.json()["data"]
        fila = _pven(db, ven)
        assert (fila.pec_id, fila.pec_numero, fila.estado) == (pec["id"], pec["numero"], "EN_PROCESO")
        assert (pec["ven_id"], pec["ven_numero"]) == (ven.id, ven.numero)
        assert [l.action for l in _logs_pven(db, ven)] == ["ESTADO_CHANGED"]
    resp = _crear_pec(app_client, admin_token, ven_id=2 ** 31 - 2, ven_numero="PV-NO-EXISTE")
    assert resp.status_code == 201, resp.text
    assert (resp.json()["data"]["ven_id"], resp.json()["data"]["ven_numero"]) == (2 ** 31 - 2, "PV-NO-EXISTE")


# ─── B4 T24 (A2): un año fuera de 1900-2999 no se guarda (antes tumbaba la lista con un 500 para todos) ──────────────

def test_fechas_con_un_anio_fuera_de_rango_dan_422_sin_escribir(app_client, db, admin_token, contador_sql):
    """A2: 9999-12-31 pasaba la validación y _stage_alert desbordaba DESPUÉS del commit (el PATCH daba 500 y desde ahí toda
    página de GET /compras/pedidos con ese PEC también). Y con zona, astimezone desbordaba fuera del try (500 antes de
    escribir). Ahora el año va de 1900 a 2999, en las fechas del PEC y en el eta y el timestamp de cada etapa."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    casos = [
        ({"fecha_compra": "9999-12-31"}, FECHA_COMPRA_INVALIDA),
        ({"fecha_compra": "1899-12-31"}, FECHA_COMPRA_INVALIDA),
        ({"fecha_compra": "3000-01-01T00:00:00"}, FECHA_COMPRA_INVALIDA),
        ({"fecha_compra": "9999-12-31T23:30:00-05:00"}, FECHA_COMPRA_INVALIDA),   # OverflowError de astimezone
        ({"fecha_compra": "0001-01-01T00:30:00+05:00"}, FECHA_COMPRA_INVALIDA),   # OverflowError de astimezone
        ({"fecha_entrega_estimada": "9999-12-31"}, FECHA_INVALIDA),
        ({"fecha_alerta": "0999-06-01"}, FECHA_ALERTA_INVALIDA),
        ({"tracking_stages": [{"status": "PENDIENTE", "eta": "9999-12-31", "alert_overdue_days": 3}]},
         ETA_SEGUIMIENTO_INVALIDA),
        ({"tracking_stages": [{"status": "COMPLETADO", "timestamp": "1899-12-31T10:00:00"}]}, ETAPA_FECHA_INVALIDA),
        ({"tracking_stages": [{"status": "PENDIENTE", "eta": "3000-01-01"}]}, ETA_SEGUIMIENTO_INVALIDA),
    ]
    with contador_sql.ventana() as v:
        for extra, texto in casos:
            assert _error(app_client, admin_token, pec, **extra) == texto, extra
    assert v.commits == 0
    # El seguimiento por etapa tampoco guarda un eta así.
    etapas = [{"stage": "PROVEEDOR_CASILLERO", "status": "PENDIENTE", "timestamp": None, "alert_overdue_days": 3}]
    con_etapas = f.pec("EMITIDO", tracking_stages=etapas)
    with contador_sql.ventana() as v:
        for eta in ("9999-12-31", "1899-01-01T00:00:00"):
            resp = app_client.patch(f"{RUTA}/{con_etapas.id}/tracking", headers=_auth(admin_token),
                                    json={"stage": "PROVEEDOR_CASILLERO", "status": "EN_PROCESO", "eta": eta})
            assert (resp.status_code, resp.json()["detail"]) == (422, ETA_SEGUIMIENTO_INVALIDA), eta
    assert v.commits == 0
    # Los bordes valen y la lista sigue respondiendo con ellos.
    resp = _patch(app_client, admin_token, pec, fecha_compra="1900-01-01", fecha_entrega_estimada="2999-12-31",
                  tracking_stages=[{"status": "PENDIENTE", "eta": "2999-12-31T23:59:59", "alert_overdue_days": 36500}])
    assert resp.status_code == 200, resp.text
    assert app_client.get(f"{RUTA}/{pec.id}", headers=_auth(admin_token)).status_code == 200
    resp = app_client.patch(f"{RUTA}/{con_etapas.id}/tracking", headers=_auth(admin_token),
                            json={"stage": "PROVEEDOR_CASILLERO", "status": "EN_PROCESO", "eta": "2999-12-31"})
    assert resp.status_code == 200, resp.text



# ─── B4 T24 r1 (m15, m21) ───────────────────────────────────────────────────────────────────────────────────────────

def test_el_seguimiento_lee_el_pec_con_bloqueo(app_client, db, admin_token, contador_sql):
    """r1 (m15): update_tracking lee el PEC con FOR UPDATE, como update_pec: un seguimiento y una cancelación a la vez
    quedan en serie y la guarda de etapa_pec ve el CANCELADO."""
    pec = _Fabrica(db).pec("EMITIDO", tracking_stages=[{"stage": "PROVEEDOR_CASILLERO", "status": "PENDIENTE",
                                                          "timestamp": None}])
    ruta = f"{RUTA}/{pec.id}/tracking"
    with contador_sql.ventana() as v:
        resp = app_client.patch(ruta, headers=_auth(admin_token), json={"stage": "PROVEEDOR_CASILLERO",
                                                                        "status": "EN_PROCESO"})
    assert resp.status_code == 200, resp.text
    assert _lee_el_pec_con_bloqueo(v.sentencias)


def test_la_configuracion_del_seguimiento_valida_los_dias(app_client, db, admin_token, contador_sql):
    """r1 (m21): PUT /compras/tracking-config/{tipo} guardaba alert_confirm_days y alert_overdue_days sin validar, y
    create_pec los copia a cada PEC nuevo: un 10**9 o un texto tumbaba GET /compras/pedidos (el 500 de A2 por otra puerta).
    Ahora la misma validación de las etapas del PATCH (422, sin guardar)."""
    ruta = "/api/v1/compras/tracking-config/casillero"
    antes = app_client.get("/api/v1/compras/tracking-config", headers=_auth(admin_token)).json()
    for dias in (10 ** 9, "3", -1, True):
        etapas = [{"key": "UNO", "label": "Uno", "alert_confirm_days": dias, "alert_overdue_days": 1}]
        with contador_sql.ventana() as v:
            resp = app_client.put(ruta, headers=_auth(admin_token), json={"stages": etapas})
        assert (resp.status_code, resp.json()) == (422, {"detail": ETAPA_DIAS_INVALIDOS}), dias
        assert v.commits == 0 and not [s for s in v.sentencias if s.lstrip().upper().startswith(("INSERT", "UPDATE"))]
    with contador_sql.ventana() as v:
        resp = app_client.put(ruta, headers=_auth(admin_token), json={"stages": ["x"]})
    assert (resp.status_code, resp.json()) == (422, {"detail": ETAPA_NO_OBJETO}) and v.commits == 0
    assert app_client.get("/api/v1/compras/tracking-config", headers=_auth(admin_token)).json() == antes
    bien = [{"key": "UNO", "label": "Uno", "alert_confirm_days": 2, "alert_overdue_days": 1.5}]
    resp = app_client.put(ruta, headers=_auth(admin_token), json={"stages": bien})
    assert resp.status_code == 200, resp.text



# ─── Cierre de r1 (m34, ruling (a) + (b)): el eta con zona se acepta y se guarda y se lee en UTC sin zona ────────────

def _etapa_con_alerta(eta=None):
    return [{"stage": "PROVEEDOR_CASILLERO", "label": "Proveedor -> Casillero", "status": "PENDIENTE", "timestamp": None,
             "eta": eta, "alert_overdue_days": 3, "alert_confirm_days": 2}]


def _eta_guardado(db, pec):
    db.expire_all()
    return db.query(PurchaseOrderFull.tracking_stages).filter(PurchaseOrderFull.id == pec.id).scalar()[0]["eta"]


def _alerta_en_la_lista(app_client, token, pec):
    resp = app_client.get(RUTA, headers=_auth(token), params={"q": pec.numero})
    assert resp.status_code == 200, resp.text
    [fila] = [p for p in resp.json()["data"] if p["id"] == pec.id]
    return fila["tracking_stages"][0]["alert"]


def test_el_eta_con_zona_se_acepta_y_se_guarda_como_el_dia_de_colombia(app_client, db, admin_token, contador_sql):
    """m34: PATCH /tracking acepta un eta ISO con zona (antes de A2 se guardaba con la zona y tumbaba GET /compras/pedidos;
    con A2, 422). r2 (m12, ruling): el eta es una FECHA DE NEGOCIO y se guarda como el día de Colombia, en AAAA-MM-DD,
    el formato que manda la pantalla (las pantallas leen los 10 primeros caracteres: con el instante en UTC, uno de las
    19:00-23:59 de Colombia se veía al día siguiente). El AAAA-MM-DD, igual que hoy. La cota del año sigue (422, sin
    escribir), sobre ese día, también cuando la zona lo saca de rango o desborda."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO", tracking_stages=_etapa_con_alerta())
    ruta = f"{RUTA}/{pec.id}/tracking"
    for eta, guardado, dia in (("2026-12-01T00:00:00-05:00", "2026-12-01", "01/12/2026"),
                               ("2026-12-01T20:00:00-05:00", "2026-12-01", "01/12/2026"),   # en UTC, el 2
                               ("2026-12-01T03:00:00+00:00", "2026-11-30", "30/11/2026"),   # en Colombia, el 30
                               ("2026-12-01T10:30:00+05:30", "2026-12-01", "01/12/2026"),
                               ("2999-12-31T23:00:00-05:00", "2999-12-31", "31/12/2999"),   # en UTC, 3000
                               ("2026-12-01", "2026-12-01", "01/12/2026")):
        resp = app_client.patch(ruta, headers=_auth(admin_token), json={"stage": "PROVEEDOR_CASILLERO",
                                                                        "status": "EN_PROCESO", "eta": eta})
        assert resp.status_code == 200, (eta, resp.text)
        assert resp.json()["data"]["tracking_stages"][0]["alert"] is not None, eta
        assert _eta_guardado(db, pec) == guardado, eta
        alerta = _alerta_en_la_lista(app_client, admin_token, pec)
        assert alerta and f"ETA {dia}" in alerta["mensaje"], (eta, alerta)
    for eta in ("3000-01-01T10:00:00+00:00", "9999-12-31T23:30:00-05:00", "0001-01-01T00:30:00+05:00", "1899-12-31"):
        with contador_sql.ventana() as v:
            resp = app_client.patch(ruta, headers=_auth(admin_token), json={"stage": "PROVEEDOR_CASILLERO",
                                                                            "status": "EN_PROCESO", "eta": eta})
        assert (resp.status_code, resp.json()) == (422, {"detail": ETA_SEGUIMIENTO_INVALIDA}), eta
        assert v.commits == 0, eta
    assert _eta_guardado(db, pec) == "2026-12-01"


def test_un_eta_con_zona_ya_guardado_no_tumba_la_lista(app_client, db, admin_token):
    """m34, caso legado: un eta con zona ya guardado en la fila (sin pasar por el PATCH, como los de antes de A2) hacía que
    _stage_alert restara un datetime con zona de utcnow() (TypeError): GET /compras/pedidos daba 500 a todos. Al leer,
    _parse_dt lo pasa a UTC sin zona y la alerta se calcula. Uno que desborda al pasarlo a UTC se ignora (sin alerta)."""
    f = _Fabrica(db)
    con_zona = f.pec("EMITIDO", tracking_stages=_etapa_con_alerta("2026-12-01T00:00:00-05:00"))
    alerta = _alerta_en_la_lista(app_client, admin_token, con_zona)
    assert alerta and "ETA 01/12/2026" in alerta["mensaje"], alerta
    resp = app_client.get(f"{RUTA}/{con_zona.id}", headers=_auth(admin_token))
    assert resp.status_code == 200 and resp.json()["data"]["tracking_stages"][0]["alert"], resp.text
    desborda = f.pec("EMITIDO", tracking_stages=_etapa_con_alerta("9999-12-31T23:30:00-05:00"))
    assert _alerta_en_la_lista(app_client, admin_token, desborda) is not None   # cuenta como sin eta: la de confirmación



def test_las_etapas_del_patch_normalizan_el_eta_con_zona_como_el_seguimiento(app_client, db, admin_token):
    """Cierre de r1 (ruling de la duda 1): PATCH /compras/pedidos/{id} con tracking_stages usa el MISMO ayudante que PATCH
    /tracking (_eta_del_seguimiento): un eta con zona horaria se guarda (r2, m12) como el día de Colombia en vez de dar
    422, y GET
    /compras/pedidos sigue respondiendo con su alerta. El resto de cada etapa se guarda tal cual; un eta sin zona, igual
    que hoy. El timestamp con zona sigue dando 422 (A2: lo pone el servidor)."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    etapas = [dict(_etapa_con_alerta("2026-12-01T00:00:00-05:00")[0]),
              {"stage": "CASILLERO_BODEGA", "status": "PENDIENTE", "timestamp": None, "eta": "2026-12-05",
               "alert_overdue_days": 2}]
    resp = _patch(app_client, admin_token, pec, tracking_stages=etapas)
    assert resp.status_code == 200, resp.text
    db.expire_all()
    guardadas = db.query(PurchaseOrderFull.tracking_stages).filter(PurchaseOrderFull.id == pec.id).scalar()
    assert guardadas == [{**etapas[0], "eta": "2026-12-01"}, etapas[1]]
    alerta = _alerta_en_la_lista(app_client, admin_token, pec)
    assert alerta and "ETA 01/12/2026" in alerta["mensaje"], alerta
    assert resp.json()["data"]["tracking_stages"][0]["eta"] == "2026-12-01"



# ─── B4 T24 r2 (m3 + m14, m4, m11) ──────────────────────────────────────────────────────────────────────────────────

def test_las_fechas_legadas_fuera_de_la_cota_no_tumban_la_lista(app_client, db, admin_token):
    """r2 (m3 + m14, ruling): _parse_dt devuelve None si el año, ya normalizado, queda fuera de 1900-2999 (la cota de la
    escritura, con zona o sin ella), y _stage_alert lo trata como «sin fecha». Antes, un eta legado como
    '9999-12-30T00:00:00-05:00' (no desborda al pasarlo a UTC) o '9999-12-31' desbordaba al sumarle los días de alerta, y
    una fecha_compra 9999-12-31 al sumarle los de confirmación: GET /compras/pedidos daba 500 a todos."""
    f = _Fabrica(db)
    etapas = [{"stage": f"E{i}", "status": "EN_PROCESO", "timestamp": None, "eta": eta, "alert_overdue_days": 3,
               "alert_confirm_days": 2}
              for i, eta in enumerate(("9999-12-30T00:00:00-05:00", "9999-12-31", "1899-06-01"))]
    con_etas = f.pec("EMITIDO", tracking_stages=etapas)
    resp = app_client.get(RUTA, headers=_auth(admin_token), params={"q": con_etas.numero})
    assert resp.status_code == 200, resp.text
    [fila] = [p for p in resp.json()["data"] if p["id"] == con_etas.id]
    alertas = [s["alert"] for s in fila["tracking_stages"]]
    # Sin eta legible, la etapa cuenta como sin confirmar: el aviso de confirmación desde la fecha de compra.
    assert all(a and "para confirmar esta etapa" in a["mensaje"] for a in alertas), alertas
    compra_9999 = f.pec("EMITIDO", fecha_compra=datetime(9999, 12, 31),
                        tracking_stages=[{"stage": "E", "status": "PENDIENTE", "timestamp": None, "eta": None,
                                          "alert_confirm_days": 2}])
    resp = app_client.get(RUTA, headers=_auth(admin_token), params={"q": compra_9999.numero})
    assert resp.status_code == 200, resp.text
    [fila] = [p for p in resp.json()["data"] if p["id"] == compra_9999.id]
    assert fila["tracking_stages"][0]["alert"] is None
    assert app_client.get(f"{RUTA}/{compra_9999.id}", headers=_auth(admin_token)).status_code == 200


def test_la_cancelacion_desvincula_los_pven_con_bloqueo(app_client, db, admin_token, contador_sql):
    """r2 (m4): _desvincular_pec_cancelado lee los PVEN del PEC con FOR UPDATE y ORDER BY sale_orders.id: en serie con un
    create_pec que los vincule a la vez (en READ COMMITTED, tras la espera, PostgreSQL vuelve a evaluar pec_id y salta el
    que ya se vinculó a otro PEC). Unir la desvinculación al commit del CANCELADO queda para el B5."""
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    a, b = f.pven("EN_PROCESO", pec=pec), f.pven("EN_PROCESO", pec=pec)
    pec_id, ids = pec.id, (a.id, b.id)
    db.refresh(pec)
    with contador_sql.ventana() as v:
        assert _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="Ya no se necesita").status_code == 200
    lecturas = [s for s in v.sentencias if s.lstrip().upper().startswith("SELECT") and "FROM sale_orders" in s
                and "sale_orders.pec_id =" in s]
    assert lecturas, v.sentencias
    assert all("FOR UPDATE" in s.upper() and "ORDER BY sale_orders.id" in s for s in lecturas), lecturas
    db.expire_all()
    assert [(x.pec_id, x.estado) for x in db.query(SaleOrder).filter(SaleOrder.id.in_(ids)).order_by(SaleOrder.id)] == [
        (None, "PENDIENTE_COMPRA"), (None, "PENDIENTE_COMPRA")]
    assert _estado(db, pec) == "CANCELADO" and pec_id


def test_la_recepcion_desde_el_pedido_la_firma_la_sesion(app_client, db, admin_token, user_admin, pec_10u, warehouse):
    """r2 (m11): los dos renglones de Actividad de POST /compras/pedidos/{id}/recepcionar (el CREATED de la recepción y el
    «Recepcion X iniciada» del PEC) los firma la sesión (nombre_de_usuario), como el CREATED del PEC (m1/m11/m20).
    created_by queda solo como dato de la recepción."""
    pec_id = pec_10u.id
    resp = app_client.post(f"{RUTA}/{pec_id}/recepcionar", headers=_auth(admin_token),
                           json={"warehouse_id": warehouse.id, "created_by": "Otra Persona"})
    assert resp.status_code in (200, 201), resp.text
    gr_id = resp.json()["data"]["id"]
    db.expire_all()
    yo = nombre_de_usuario(user_admin)
    eninv = db.query(ActivityLog).filter(ActivityLog.entity_type == "ENINV", ActivityLog.entity_id == gr_id,
                                         ActivityLog.action == "CREATED").all()
    del_pec = db.query(ActivityLog).filter(ActivityLog.entity_type == "PEC", ActivityLog.entity_id == pec_id,
                                           ActivityLog.action == "RECEPCION_CREATED").all()
    assert [l.user_name for l in eninv] == [yo] and [l.user_name for l in del_pec] == [yo]
    assert db.query(GoodsReceipt.created_by).filter(GoodsReceipt.id == gr_id).scalar() == "Otra Persona"
