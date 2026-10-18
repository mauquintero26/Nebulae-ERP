"""Bloque 3, Tarea 7 — U22-anticipo (C18; RP29): si cambia el anticipo que el cliente ya vio, vuelve a confirmar.

- update_cotizacion: el anticipo REQUERIDO (anticipo_cotizacion, vivo) de antes del PATCH se compara con el de después
  del recálculo; si cambia en una COT en Pendiente por confirmación, o Confirmada sin pedido vigente, es un cambio
  congelado más: 409 ANULA_CONFIRMACION con la lista única de cambios ('...', 'IVA', 'Anticipo') y
  detail['anticipo'] = {antes, despues} en pesos. Se compara el requerido vivo, no la columna anticipo_cop: un anticipo
  viejo mal guardado no dispara la anulación al re-cotizar sin cambios.
- update_solicitud: cambiar la modalidad de pago cambia el requerido de sus COT abiertas sin pedido vigente; si alguna
  está en Pendiente por confirmación o Confirmada, 409 ANULA_CONFIRMACION ANTES de escribir (la SC y la COT quedan
  intactas). Con anular_confirmacion=True y motivo_recotizacion (MIN/MAX_RAZON_RECOTIZACION, los mismos mensajes que
  H40) la COT vuelve a Borrador, gate2 en None, su enlace revocado y el renglón ESTADO_CHANGED, todo en UN commit (H29).
  La SC no se toca (U15).

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_anticipo_congelado
"""
import datetime
import uuid
from decimal import Decimal

MOD_60_40 = "60/40 (60% anticipo - 40% pendiente)"
LINEA = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000000, "total_cop": 1000000}
MOTIVO = "Negociado con el cliente"
RAZON_CORTA = "Escribe la razón del cambio (mínimo 5 caracteres): queda en la Actividad de la cotización."
RAZON_LARGA = "La razón es muy larga (máximo 500 caracteres)."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch):
    import app.core.email as correo
    monkeypatch.setattr(correo, "send_email", lambda *a, **k: True)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: False)


def _sc(db, modalidad=MOD_60_40, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    sc = CustomerRequest(numero=f"SC-T7A{_sufijo()}", customer_name="Ana Pérez", modalidad_pago=modalidad,
                         productos=[{"product_name": "Cuna Colecho", "qty": 1}], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc, estado="PENDIENTE_CONFIRMACION", **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("productos", [dict(LINEA)])
    campos.setdefault("subtotal_cop", 1000000)
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("anticipo_cop", 600000)
    if estado == "CONFIRMADA":
        campos.setdefault("gate2_confirmed_at", datetime.datetime.utcnow())
    cot = SalesQuotation(numero=f"COT-T7A{_sufijo()}", customer_name="Ana Pérez", estado=estado, sc_id=sc.id,
                         sc_numero=sc.numero, **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _token(db, cot):
    from app.core.confirmation_tokens import create_confirmation_token
    return create_confirmation_token(db, "COT", cot.id)


def _fila_token(db, raw):
    from app.core.confirmation_tokens import hash_token
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return db.query(DocumentConfirmationToken).filter(DocumentConfirmationToken.token_hash == hash_token(raw)).one()


def _patch_cot(app_client, token, cot, body):
    return app_client.patch(f"/api/v1/ventas/cotizaciones/{cot.id}", json=body, headers=auth(token))


def _patch_sc(app_client, token, sc, body):
    return app_client.patch(f"/api/v1/ventas/solicitudes/{sc.id}", json=body, headers=auth(token))


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


AJUSTE = {"anticipo_pct_manual": 50, "anticipo_manual_nota": "negociado con gerencia"}


# ─── update_cotizacion ───────────────────────────────────────────────────────────────────────────────────────

def test_ajustar_anticipo_de_cot_pendiente_pide_anular(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _patch_cot(app_client, admin_token, cot, dict(AJUSTE))
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "PENDIENTE_CONFIRMACION"
    assert detail["cambios"] == ["Anticipo"]
    assert detail["anticipo"] == {"antes": "$600.000", "despues": "$500.000"}
    assert detail["mensaje"] == (
        "Esta cotización está esperando la confirmación del cliente. Si guardas estos cambios (Anticipo), el enlace "
        "que tiene el cliente deja de servir: la cotización vuelve a Borrador y tendrás que enviársela de nuevo.")
    db.expire_all()
    db.refresh(cot)
    assert cot.anticipo_pct_manual is None and cot.anticipo_manual_nota is None
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.anticipo_cop == Decimal("600000")
    assert _fila_token(db, raw).used_at is None
    assert _logs(db, "COT", cot.id) == []


def test_ajustar_anticipo_con_anular_confirmacion(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _patch_cot(app_client, admin_token, cot,
                      dict(AJUSTE, anular_confirmacion=True, motivo_recotizacion=MOTIVO))
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is True
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert cot.anticipo_cop == Decimal("500000") and cot.anticipo_pct_manual == Decimal("50.00")
    assert _fila_token(db, raw).used_at is not None
    estado = _logs(db, "COT", cot.id, "ESTADO_CHANGED")[-1]
    assert estado.description.endswith(f"Razón: {MOTIVO}.")
    assert estado.extra_data["cambios"][0] == {"etiqueta": "Cambió", "despues": "Anticipo"}
    # El ajuste manual deja su renglón, como siempre (R3).
    assert len(_logs(db, "COT", cot.id, "ANTICIPO_MANUAL")) == 1


def test_cambio_que_no_toca_el_anticipo_no_anula(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _patch_cot(app_client, admin_token, cot, {"notas": "x"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.notas == "x"
    assert _fila_token(db, raw).used_at is None
    # Un % manual que no cambia el requerido (60% a mano sobre una SC 60/40) tampoco anula.
    resp = _patch_cot(app_client, admin_token, cot, {"anticipo_pct_manual": 60,
                                                     "anticipo_manual_nota": "igual que la modalidad"})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False


def test_recotizar_sin_cambiar_el_requerido_no_anula(app_client, db, admin_token):
    """Se compara el requerido vivo (600.000 por la SC 60/40), no la columna anticipo_cop (un 0 viejo, T14)."""
    sc = _sc(db)
    cot = _cot(db, sc, anticipo_cop=0)
    raw = _token(db, cot)
    resp = _patch_cot(app_client, admin_token, cot, {"total_cop": 1000000, "recotizacion": True})
    assert resp.status_code == 200, resp.text
    assert resp.json()["confirmacion_anulada"] is False
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.anticipo_cop == Decimal("600000")
    assert _fila_token(db, raw).used_at is None


def test_recotizar_con_otro_total_nombra_el_anticipo_al_final(app_client, db, admin_token):
    """C18: lista única, en el orden de PRICE_FREEZE_FIELDS y el anticipo al final."""
    sc = _sc(db)
    cot = _cot(db, sc, estado="CONFIRMADA")
    linea = dict(LINEA, unit_price_cop=1200000, total_cop=1200000)
    resp = _patch_cot(app_client, admin_token, cot, {"productos": [linea], "subtotal_cop": 1200000,
                                                     "total_cop": 1200000, "recotizacion": True})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["cambios"] == ["Productos, cantidades o precios", "Total", "Anticipo"]
    assert detail["anticipo"] == {"antes": "$600.000", "despues": "$720.000"}
    # Sin cambio del requerido no viaja la clave del anticipo.
    resp = _patch_cot(app_client, admin_token, cot, {"trm_rate": 4100})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["cambios"] == ["TRM"] and "anticipo" not in resp.json()["detail"]


# ─── update_solicitud: cambio de modalidad ───────────────────────────────────────────────────────────────────

def test_cambiar_modalidad_de_sc_con_cot_pendiente_pide_anular(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado", "updated_by": "t"})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["codigo"] == "ANULA_CONFIRMACION" and detail["estado"] == "PENDIENTE_CONFIRMACION"
    assert detail["cambios"] == ["Anticipo"] and detail["documentos"] == [cot.numero]
    assert detail["mensaje"] == (
        f"Cambiar la modalidad de pago cambia el anticipo de {cot.numero} ($600.000 → $1.000.000), que el cliente ya "
        f"vio o confirmó. Si sigues, esa confirmación se anula y tendrás que enviarle la cotización de nuevo.")
    db.expire_all()
    db.refresh(sc)
    db.refresh(cot)
    assert sc.modalidad_pago == MOD_60_40
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.anticipo_cop == Decimal("600000")
    assert _fila_token(db, raw).used_at is None
    assert _logs(db, "COT", cot.id) == [] and _logs(db, "SC", sc.id) == []


def test_cambiar_modalidad_con_anular_confirmacion(app_client, db, admin_token, user_admin, contador_sql):
    from app.core.textos_actividad import nombre_de_usuario
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    with contador_sql.ventana() as v:
        resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado", "updated_by": "t",
                                                       "anular_confirmacion": True,
                                                       "motivo_recotizacion": f"  {MOTIVO}  "})
    assert resp.status_code == 200, resp.text
    assert v.commits == 1, f"el PATCH debe confirmar una sola vez (H29), confirmó {v.commits} veces"
    # r1 (calidad 2): al anular, la COT se relee FOR UPDATE (después de la SC: el orden SC -> COT) y su fila se escribe
    # (y queda bloqueada) ANTES de revocar sus enlaces.
    sentencias = v.sentencias
    relecturas = [s for s in sentencias if "FROM sales_quotations" in s and "FOR UPDATE" in s.upper()]
    assert relecturas, "al anular, la COT debe releerse con FOR UPDATE"
    escribe_cot = next(i for i, s in enumerate(sentencias) if s.lstrip().upper().startswith("UPDATE SALES_QUOTATIONS"))
    revoca = next(i for i, s in enumerate(sentencias)
                  if s.lstrip().upper().startswith("UPDATE DOCUMENT_CONFIRMATION_TOKENS"))
    assert escribe_cot < revoca, "la fila de la COT se escribe antes de revocar sus enlaces"
    db.expire_all()
    db.refresh(sc)
    db.refresh(cot)
    assert sc.modalidad_pago == "Contado" and sc.estado == "CONFIRMADA"  # U15: la SC no se toca
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert cot.anticipo_cop == Decimal("1000000")
    assert _fila_token(db, raw).used_at is not None
    [renglon] = _logs(db, "COT", cot.id, "ESTADO_CHANGED")
    assert renglon.description == (
        f"Estado cambiado a Borrador: el anticipo cambió por la modalidad de pago de {sc.numero} ($600.000 → "
        f"$1.000.000). Motivo: {MOTIVO}. La confirmación del cliente ya no es válida.")
    assert (renglon.old_estado, renglon.new_estado) == ("PENDIENTE_CONFIRMACION", "BORRADOR")
    assert renglon.user_name == nombre_de_usuario(user_admin)
    assert renglon.extra_data == {"motivo": MOTIVO,
                                  "cambios": [{"etiqueta": "Cambió", "despues": "Anticipo"},
                                              {"etiqueta": "Razón", "despues": MOTIVO}]}
    # Y el recálculo de siempre (H36), antes del cambio de estado en la línea de tiempo.
    acciones = [l.action for l in _logs(db, "COT", cot.id)]
    assert acciones == ["UPDATED", "ESTADO_CHANGED"]


def test_cot_borrador_no_pide_anular(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc, estado="BORRADOR")
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.anticipo_cop == Decimal("1000000")


def test_cot_confirmada_sin_pedido_pide_anular_y_con_pedido_no(app_client, db, admin_token):
    from app.models.erp_documents import SaleOrder
    sc = _sc(db)
    confirmada = _cot(db, sc, estado="CONFIRMADA")
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado"})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"]["documentos"] == [confirmada.numero]
    assert resp.json()["detail"]["estado"] == "CONFIRMADA"
    db.add(SaleOrder(numero=f"PVEN-T7A{_sufijo()}", cot_id=confirmada.id, customer_name="Ana Pérez",
                     estado="PENDIENTE_COMPRA", total_cop=1000000))
    db.commit()
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(confirmada)
    assert confirmada.estado == "CONFIRMADA" and confirmada.anticipo_cop == Decimal("600000")


def test_la_misma_modalidad_no_pide_anular(app_client, db, admin_token):
    sc = _sc(db)
    cot = _cot(db, sc)
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": MOD_60_40, "notas": "x"})
    assert resp.status_code == 200, resp.text
    # Otra modalidad con el mismo % (60/40 escrita distinto) tampoco cambia el requerido.
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "60/40"})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"


def test_motivo_de_la_anulacion_por_modalidad_se_valida_como_en_h40(app_client, db, admin_token):
    """RP29: MIN_RAZON_RECOTIZACION y MAX_RAZON_RECOTIZACION, con los mismos mensajes del 422 de H40; nada cambia.
    La bandera tiene que ser el booleano true."""
    sc = _sc(db)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    casos = [("abcd", RAZON_CORTA), ("    ", RAZON_CORTA), (None, RAZON_CORTA), (12345, RAZON_CORTA),
             ("r" * 501, RAZON_LARGA)]
    for motivo, mensaje in casos:
        body = {"modalidad_pago": "Contado", "anular_confirmacion": True}
        if motivo is not None:
            body["motivo_recotizacion"] = motivo
        resp = _patch_sc(app_client, admin_token, sc, body)
        assert resp.status_code == 422, (motivo, resp.text)
        assert resp.json()["detail"] == mensaje, motivo
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado", "anular_confirmacion": "true",
                                                   "motivo_recotizacion": MOTIVO})
    assert resp.status_code == 409, resp.text
    db.expire_all()
    db.refresh(sc)
    db.refresh(cot)
    assert sc.modalidad_pago == MOD_60_40 and cot.estado == "PENDIENTE_CONFIRMACION"
    assert _fila_token(db, raw).used_at is None


def test_dos_cotizaciones_congeladas_van_en_el_mismo_aviso(app_client, db, admin_token):
    sc = _sc(db)
    una = _cot(db, sc)
    otra = _cot(db, sc, estado="CONFIRMADA", total_cop=2000000, subtotal_cop=2000000, anticipo_cop=1200000,
                productos=[dict(LINEA, unit_price_cop=2000000, total_cop=2000000)])
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado"})
    assert resp.status_code == 409, resp.text
    detail = resp.json()["detail"]
    assert detail["documentos"] == [una.numero, otra.numero]
    assert detail["mensaje"] == (
        f"Cambiar la modalidad de pago cambia el anticipo de {una.numero} ($600.000 → $1.000.000) y {otra.numero} "
        f"($1.200.000 → $2.000.000), que el cliente ya vio o confirmó. Si sigues, esas confirmaciones se anulan y "
        f"tendrás que enviarle las cotizaciones de nuevo.")


def test_al_anular_cuenta_el_estado_releido_con_bloqueo(app_client, db, admin_token, monkeypatch):
    """r1 (calidad 2): la decisión de anular se toma con una lectura SIN bloqueo; si al releer la COT bloqueada ya no
    espera al cliente (aquí: la primera lectura la vio Pendiente y la base dice Borrador), no se anula nada ni queda un
    renglón con un estado viejo."""
    import app.api.v1.erp_ventas as ventas
    sc = _sc(db)
    cot = _cot(db, sc, estado="BORRADOR")
    leer_real = ventas._anticipos_requeridos

    def lectura_vieja(db_, sc_):
        previos = leer_real(db_, sc_)
        for c, _ in previos:
            c.estado = "PENDIENTE_CONFIRMACION"  # lo que vio la foto sin bloqueo, en memoria
        return previos

    monkeypatch.setattr(ventas, "_anticipos_requeridos", lectura_vieja)
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado", "anular_confirmacion": True,
                                                   "motivo_recotizacion": MOTIVO})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.anticipo_cop == Decimal("1000000")
    assert _logs(db, "COT", cot.id, "ESTADO_CHANGED") == []


def test_al_anular_se_descarta_la_cot_que_ya_tiene_pedido_vigente(app_client, db, admin_token, monkeypatch):
    """r2: la foto sin bloqueo vio la COT Confirmada sin pedido, pero mientras tanto convertir_cotizacion_a_venta creó su
    pedido (aquí: el pedido ya está en la base y la lectura vieja la incluye). Al releerla bloqueada se descarta: sigue
    Confirmada con su anticipo, sin renglón de anulación y con su enlace intacto (no se recalcula ni se anula)."""
    import app.api.v1.erp_ventas as ventas
    from app.models.erp_documents import SaleOrder, SalesQuotation
    sc = _sc(db)
    cot = _cot(db, sc, estado="CONFIRMADA")
    raw = _token(db, cot)
    db.add(SaleOrder(numero=f"PVEN-T7A{_sufijo()}", cot_id=cot.id, customer_name="Ana Pérez",
                     estado="PENDIENTE_COMPRA", total_cop=1000000))
    db.commit()
    leer_real = ventas._anticipos_requeridos

    def lectura_vieja(db_, sc_):
        previos = leer_real(db_, sc_)  # ya no la trae: tiene pedido vigente
        vieja = db_.get(SalesQuotation, cot.id)
        return previos + [(vieja, ventas.anticipo_cotizacion(vieja, db_, sc=sc_).requerido)]

    monkeypatch.setattr(ventas, "_anticipos_requeridos", lectura_vieja)
    resp = _patch_sc(app_client, admin_token, sc, {"modalidad_pago": "Contado", "anular_confirmacion": True,
                                                   "motivo_recotizacion": MOTIVO})
    assert resp.status_code == 200, resp.text
    db.expire_all()
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA" and cot.gate2_confirmed_at is not None
    assert cot.anticipo_cop == Decimal("600000")
    assert _logs(db, "COT", cot.id, "ESTADO_CHANGED") == []
    assert _fila_token(db, raw).used_at is None


def test_una_cot_pendiente_no_cambia_de_solicitud(app_client, db, admin_token):
    """r1 (dinero 1): requerido_nuevo es siempre el vivo (anticipo_cotizacion con la SC y el total que deja el PATCH).
    El caso que lo pide (mover una COT pendiente a una SC con otra modalidad) hoy no llega al congelamiento: N7 solo
    deja cambiar la solicitud de una COT en Borrador o Rechazada, y responde 409 sin tocar nada."""
    sc = _sc(db)
    otra = _sc(db, modalidad="Contado", estado="CONFIRMADA", gate1_confirmed_at=datetime.datetime.utcnow())
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _patch_cot(app_client, admin_token, cot, {"sc_id": otra.id, "anular_confirmacion": True,
                                                     "motivo_recotizacion": MOTIVO})
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == ("Solo se puede cambiar la solicitud de una cotización en Borrador o Rechazada "
                                     "(estado actual: Esperando confirmación del cliente).")
    db.expire_all()
    db.refresh(cot)
    assert cot.sc_id == sc.id and cot.estado == "PENDIENTE_CONFIRMACION"
    assert _fila_token(db, raw).used_at is None
