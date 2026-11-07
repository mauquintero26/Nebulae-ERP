"""B4 T12 (KANBAN-compras puntos 3 y 4 con R9; C10, C15c; RP44, RP97, D46): PATCH /compras/pedidos/{id} cambia el
estado del pedido de compra solo por el camino correcto (_validar_transicion_pec, antes de tocar nada).

A mano solo se emite un borrador (EMITIDO desde BORRADOR) o se cancela (desde borrador, emitido o en tránsito, con un
motivo de 5 caracteres o más que queda en la Actividad, y nunca con recepciones que no estén canceladas: 409). EN_TRANSITO
lo pone el seguimiento y los estados de recepción la recepción en bodega (422 diciendo dónde). Desde cancelado, en bodega
o recibido, 422. pec_cancelar_en_transito = «Sí, mientras no tenga recepciones en bodega»; pec_motivo_cancelacion = «Sí,
obligatorio (mínimo 5 letras)». El estilo es el de test_pendiente_compra_lista_pec.py: el PEC se crea por la API o por
ORM con db.add.

Se corre SOLO con el runner de ROLLBACK (python tests/rollback_runner.py test_pec_transiciones).
"""
import uuid
from datetime import datetime, timedelta

from app.models.erp_documents import ActivityLog, GoodsReceipt, PurchaseOrderFull, SaleOrder
from tests.usuarios_de_prueba import compras_token  # noqa: F401 (fixture por nombre, RP79)

RUTA = "/api/v1/compras/pedidos"
CONTROL = "La búsqueda no puede llevar caracteres de control."
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
    # Sin updated_by, la Actividad lleva el correo de quien lo hizo; con él, ese nombre.
    assert logs[0].user_name == user_admin.email
    otro = f.pec("BORRADOR")
    assert _patch(app_client, admin_token, otro, estado="EMITIDO", updated_by="Ana Compras").status_code == 200
    assert _logs(db, otro)[0].user_name == "Ana Compras"


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
    assert _error(app_client, admin_token, pec, estado="EMI\x00TIDO") == CONTROL
    assert _estado(db, pec) == "EMITIDO"


def test_emitido_solo_desde_borrador(app_client, db, admin_token):
    f = _Fabrica(db)
    for origen in ("EN_TRANSITO", "ENVIADO", "PENDIENTE_ENTREGA", "CONFIRMADA"):   # CONFIRMADA: un heredado
        pec = f.pec(origen)
        assert _error(app_client, admin_token, pec, estado="EMITIDO") == SOLO_BORRADOR, origen
        assert _estado(db, pec) == origen


# ─── 4) Cancelar exige el motivo (pec_motivo_cancelacion = Sí) ───────────────────────────────────────────────────────

def test_cancelar_exige_motivo(app_client, db, admin_token):
    f = _Fabrica(db)
    pec = f.pec("EMITIDO")
    pven = f.pven("EN_PROCESO", pec)
    for body in ({}, {"motivo": "abc"}, {"motivo": "  abcd   "}, {"motivo": None}, {"motivo": "    "}):
        assert _error(app_client, admin_token, pec, estado="CANCELADO", **body) == MOTIVO, body
    assert _error(app_client, admin_token, pec, estado="CANCELADO", motivo="Sin stock\x00") == CONTROL
    assert _estado(db, pec) == "EMITIDO" and _logs(db, pec) == []
    resp = _patch(app_client, admin_token, pec, estado="CANCELADO", motivo="  El proveedor no tiene stock ",
                  updated_by="tester")
    assert resp.status_code == 200, resp.text
    logs = _logs(db, pec)
    assert [(l.description, l.old_estado, l.new_estado, l.user_name) for l in logs] == [
        ("Estado cambiado a Cancelado. Motivo: El proveedor no tiene stock", "EMITIDO", "CANCELADO", "tester")]
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
