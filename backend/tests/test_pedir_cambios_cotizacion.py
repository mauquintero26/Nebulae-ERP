"""Bloque 3, Tarea 6 — U22-cambios con C9 (y RP16): el cliente pide cambios en la COTIZACIÓN desde su enlace.

- Mismo POST /confirmar/pedir-cambios que la SC (un solo endpoint, C9). Rama COT: la COT en Pendiente por confirmación
  vuelve a Borrador con gate2_confirmed_at None y cambios_cliente_at/_tipo/_comentario; revoca sus otros enlaces,
  marca el usado con resultado CAMBIOS y deja el renglón CAMBIOS_CLIENTE ('Cliente (por el enlace)'), todo en UN
  commit. No toca la SC (U15) ni el lead. Después avisa al asesor de su SC (correo + renglón AVISO_ASESOR en la COT).
- Mínimo 10 y máximo 1000 caracteres; 'ok' es 422 y no gasta el enlace. NO_LA_NECESITA solo existe en la SC.
- Un enlace ya usado responde 400 con detail['estado_enlace'] (C10), nunca el texto genérico.
- GET /cotizaciones/{id} trae cambios_cliente desde las columnas; reenviar la COT las limpia en el único commit del
  envío, que lee la COT con FOR UPDATE (RP16). El lead se mueve después del correo, sin otro commit antes de él, y un
  fallo del lead no deshace el envío.
- alertas_resumen.cambios_cliente cuenta también las COT (el asesor de su SC ve las suyas).

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Los símbolos nuevos de T6 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_pedir_cambios_cotizacion
"""
import datetime
import hashlib
import uuid

from sqlalchemy import text

ASESORA = "Laura Gómez"
COMENTARIO = "Quiero 6 galones en vez de 4"
CLIENTE_ENLACE = "Cliente (por el enlace)"
CLAVES_DETALLE = {"mensaje", "estado_enlace", "empresa", "documento", "confirmada_el", "siguiente_paso", "comentario"}
CLAVES_200 = {"status", "estado_enlace", "mensaje", "detalle", "comentario", "empresa", "data"}
PINTURA = {"product_name": "Pintura", "qty": 4, "unit_price_cop": 117000, "total_cop": 468000}


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ahora():
    return datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None)


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch, configurado=False, al_enviar=None):
    import app.core.email as correo
    llamadas = []

    def enviar(*a, **k):
        llamadas.append((a, k))
        if al_enviar is not None:
            al_enviar()
        return True

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: configurado)
    return llamadas


def _sc(db, asesor=None, **campos):
    from app.models.erp_documents import CustomerRequest
    campos.setdefault("estado", "CONFIRMADA")
    campos.setdefault("gate1_confirmed_at", _ahora())
    sc = CustomerRequest(numero=f"SC-T6C{_sufijo()}", customer_name="Ana Pérez", advisor_name=ASESORA,
                         advisor_user_id=asesor.id if asesor is not None else None,
                         productos=[{"product_name": "Pintura", "qty": 4}], **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc=None, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "PENDIENTE_CONFIRMACION")
    campos.setdefault("productos", [dict(PINTURA)])
    campos.setdefault("subtotal_cop", 468000)
    campos.setdefault("total_cop", 468000)
    if sc is not None:
        campos.setdefault("sc_id", sc.id)
        campos.setdefault("sc_numero", sc.numero)
    cot = SalesQuotation(numero=f"COT-T6C{_sufijo()}", customer_name="Ana Pérez", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _token(db, cot):
    from app.core.confirmation_tokens import create_confirmation_token
    return create_confirmation_token(db, "COT", cot.id)


def _pedir(app_client, raw, comentario=COMENTARIO, tipo=None):
    cuerpo = {"token": raw, "comentario": comentario}
    if tipo is not None:
        cuerpo["tipo"] = tipo
    return app_client.post("/api/v1/confirmar/pedir-cambios", json=cuerpo,
                           headers={"Idempotency-Key": f"t6c-{uuid.uuid4().hex[:8]}"})


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"t6cc-{uuid.uuid4().hex[:8]}"})


def _detalle(resp, estado):
    assert resp.status_code == 400, resp.text
    detalle = resp.json()["detail"]
    assert isinstance(detalle, dict) and detalle["estado_enlace"] == estado, detalle
    assert set(detalle) == CLAVES_DETALLE, detalle
    return detalle


def _fila(db, raw):
    return db.execute(text("SELECT used_at, resultado FROM document_confirmation_tokens WHERE token_hash = :h"),
                      {"h": hashlib.sha256(raw.encode()).hexdigest()}).mappings().first()


def _logs(db, entidad, entity_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == entidad, ActivityLog.entity_id == entity_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _get_cot(app_client, admin_token, cot):
    resp = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _alertas(app_client, token):
    resp = app_client.get("/api/v1/ventas/alertas/resumen", headers=auth(token))
    assert resp.status_code == 200, resp.text
    return resp.json()["data"]


def _lead(db, sc, status="DRAFT"):
    """Un lead del CRM (tabla sales_orders) enlazado a la SC por canonical_customer_request_id."""
    from app.models.customers import Customer
    from app.models.sales import SalesOrder
    cliente = Customer(first_name="Cliente", last_name="T6", email=f"t6-{uuid.uuid4().hex[:8]}@test.nebulae")
    db.add(cliente); db.commit()
    lead = SalesOrder(customer_id=cliente.id, status=status, canonical_customer_request_id=sc.id, lead_source="SC",
                      lead_description=f"SC creada: {sc.numero}")
    db.add(lead); db.commit(); db.refresh(lead)
    return lead


# ─── 1 a 4 de U22-cambios ────────────────────────────────────────────────────────────────────────────────────

def test_pedir_cambios_devuelve_la_cot_a_borrador(app_client, db, admin_token, user_admin, monkeypatch, contador_sql):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    cot = _cot(db, sc, gate2_confirmed_at=None)
    raw = _token(db, cot)

    with contador_sql.ventana() as v:
        resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert v.commits == 3, v.commits  # reclamar, el cambio de la COT (UN commit) y el renglón del aviso
    j = resp.json()
    assert set(j) == CLAVES_200, j
    assert (j["estado_enlace"], j["mensaje"], j["comentario"]) == ("cambios_enviados", "¡Listo! Recibimos tus cambios.",
                                                                  COMENTARIO)
    assert j["detalle"] == f"{ASESORA} ajustará tu cotización y te enviará un enlace nuevo."
    assert j["data"]["numero"] == cot.numero and j["data"]["documento"]["tipo"] == "COT"
    assert "nombre_comercial" in j["empresa"]

    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert (cot.cambios_cliente_tipo, cot.cambios_cliente_comentario) == ("CAMBIOS", COMENTARIO)
    assert cot.cambios_cliente_at is not None
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "CAMBIOS"

    [renglon] = _logs(db, "COT", cot.id, "CAMBIOS_CLIENTE")
    assert (renglon.old_estado, renglon.new_estado) == ("PENDIENTE_CONFIRMACION", "BORRADOR")
    assert renglon.user_name == CLIENTE_ENLACE
    assert COMENTARIO in renglon.description
    assert renglon.extra_data["comentario"] == COMENTARIO and renglon.extra_data["tipo"] == "CAMBIOS"
    assert [c["etiqueta"] for c in renglon.extra_data["cambios"]] == ["Comentario del cliente",
                                                                      "Estado de la cotización"]
    assert renglon.extra_data["cambios"][1]["despues"] == "Borrador"

    marca = _get_cot(app_client, admin_token, cot)["cambios_cliente"]
    assert (marca["tipo"], marca["comentario"]) == ("CAMBIOS", COMENTARIO) and marca["at"].endswith("Z")


def test_comentario_corto_es_422_y_no_gasta_el_enlace(app_client, db, admin_token, user_admin):
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _pedir(app_client, raw, comentario="ok")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == "Cuéntanos qué quieres cambiar (al menos 10 caracteres)."
    assert _ver(app_client, raw).status_code == 200
    assert _fila(db, raw)["used_at"] is None
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"


def test_comentario_de_1001_caracteres_es_422(app_client, db, admin_token, user_admin, monkeypatch):
    from app.api.v1.confirmacion_publica import MENSAJE_COMENTARIO_LARGO
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    resp = _pedir(app_client, raw, comentario="g" * 1001)
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == MENSAJE_COMENTARIO_LARGO == "Tu mensaje puede tener hasta 1000 caracteres."
    assert _fila(db, raw)["used_at"] is None
    assert _pedir(app_client, raw, comentario="g" * 1000).status_code == 200


def test_enlace_usado_es_400_con_su_estado(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    assert _pedir(app_client, raw).status_code == 200

    for resp in (_pedir(app_client, raw), _confirmar(app_client, raw), _ver(app_client, raw)):
        d = _detalle(resp, "cambios_enviados")  # C10: el estado del enlace, no el texto genérico
        assert d["comentario"] == COMENTARIO and d["documento"] is None
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.gate2_confirmed_at is None
    assert len(_logs(db, "COT", cot.id, "CAMBIOS_CLIENTE")) == 1


def test_el_enlace_viejo_no_ve_el_comentario_del_nuevo(app_client, db, admin_token, user_admin, monkeypatch):
    """r1 (seguridad 6, regla g): en la COT tampoco; el comentario solo lo ve el enlace que dejó la marca vigente."""
    _correo_falso(monkeypatch)
    cot = _cot(db, _sc(db, user_admin))
    primero = _token(db, cot)
    assert _pedir(app_client, primero, comentario="Comentario de la clienta A").status_code == 200
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    segundo = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    privado = "Dato privado del cliente B: calle 5 #10"
    assert _pedir(app_client, segundo, comentario=privado).status_code == 200

    resp = _ver(app_client, primero)
    assert _detalle(resp, "cambios_enviados")["comentario"] is None
    assert privado not in resp.text
    assert _detalle(_ver(app_client, segundo), "cambios_enviados")["comentario"] == privado


# ─── 5 a 8 de U22-cambios ────────────────────────────────────────────────────────────────────────────────────

def test_cot_que_ya_no_esta_pendiente_es_400(app_client, db, admin_token, user_admin):
    sc = _sc(db, user_admin)
    cot = _cot(db, sc, estado="BORRADOR")
    raw = _token(db, cot)  # un enlace vivo creado a mano
    _detalle(_pedir(app_client, raw), "no_disponible")
    db.refresh(cot)
    assert cot.estado == "BORRADOR" and cot.cambios_cliente_at is None
    assert _fila(db, raw)["used_at"] is None


def test_la_sc_y_el_lead_no_cambian(app_client, db, admin_token, user_admin, monkeypatch):
    import app.api.v1.crm as crm
    import app.api.v1.erp_ventas as m
    _correo_falso(monkeypatch)
    llamadas = []
    monkeypatch.setattr(m, "mover_lead_de_solicitud", lambda *a, **k: llamadas.append(a))
    monkeypatch.setattr(crm, "mover_lead_de_solicitud", lambda *a, **k: llamadas.append(a))
    sc = _sc(db, user_admin)
    gate1 = sc.gate1_confirmed_at
    lead = _lead(db, sc, status="QUOTATION")
    cot = _cot(db, sc)
    raw = _token(db, cot)

    assert _pedir(app_client, raw).status_code == 200
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA" and sc.gate1_confirmed_at == gate1  # U15: la SC no refleja a su COT
    assert sc.cambios_cliente_at is None
    assert llamadas == []
    from app.models.sales import SalesOrder
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "QUOTATION"
    assert _logs(db, "SC", sc.id, "CAMBIOS_CLIENTE") == []


def test_al_reenviar_desaparece_cambios_cliente(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    assert _pedir(app_client, raw).status_code == 200
    assert _get_cot(app_client, admin_token, cot)["cambios_cliente"]["comentario"] == COMENTARIO

    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert _get_cot(app_client, admin_token, cot)["cambios_cliente"] is None
    db.refresh(cot)
    assert (cot.cambios_cliente_at, cot.cambios_cliente_tipo, cot.cambios_cliente_comentario) == (None, None, None)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert len(_logs(db, "COT", cot.id, "CAMBIOS_CLIENTE")) == 1  # la Actividad conserva lo que pidió


def test_el_comentario_con_html_se_guarda_como_texto(app_client, db, admin_token, user_admin, monkeypatch):
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    assert _pedir(app_client, raw, comentario="<b>6</b> galones").status_code == 200
    db.refresh(cot)
    assert cot.cambios_cliente_comentario == "<b>6</b> galones"
    [renglon] = _logs(db, "COT", cot.id, "CAMBIOS_CLIENTE")
    assert renglon.extra_data["comentario"] == "<b>6</b> galones"


# ─── C9: aviso al asesor de su SC, NO_LA_NECESITA y las alertas ──────────────────────────────────────────────

def test_avisa_al_asesor_de_su_sc(app_client, db, admin_token, user_admin, user_vendedor, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True)
    sc = _sc(db, user_vendedor)
    cot = _cot(db, sc, customer_email="ana@cliente.com")
    raw = _token(db, cot)

    assert _pedir(app_client, raw, comentario="Quiero <i>6</i> galones").status_code == 200
    [(args, kwargs)] = llamadas  # solo el aviso: al cliente no se le escribe
    destino, asunto, html = args
    assert destino == user_vendedor.email
    assert cot.numero in asunto and "cotización" in asunto
    assert "&lt;i&gt;6&lt;/i&gt;" in html and "<i>6" not in html
    assert f"/dashboard/ventas/cotizacion/{cot.id}" in html
    assert "remitente_nombre" in kwargs
    [aviso] = _logs(db, "COT", cot.id, "AVISO_ASESOR")
    assert aviso.description == f"Aviso por correo a {user_vendedor.email}: enviado."
    assert _logs(db, "SC", sc.id, "AVISO_ASESOR") == []


def test_cot_sin_solicitud_anota_que_no_hay_asesor(app_client, db, admin_token, monkeypatch):
    llamadas = _correo_falso(monkeypatch, configurado=True)
    cot = _cot(db)
    raw = _token(db, cot)
    resp = _pedir(app_client, raw)
    assert resp.status_code == 200, resp.text
    assert resp.json()["detalle"] == "Tu asesor ajustará tu cotización y te enviará un enlace nuevo."
    assert llamadas == []
    [aviso] = _logs(db, "COT", cot.id, "AVISO_ASESOR")
    assert aviso.description == "No se pudo avisar por correo al asesor: la cotización no tiene asesor asignado."


def test_no_la_necesita_no_existe_en_la_cotizacion(app_client, db, admin_token, user_admin):
    sc = _sc(db, user_admin)
    cot = _cot(db, sc)
    raw = _token(db, cot)
    from app.api.v1.confirmacion_publica import MENSAJE_SOLO_SOLICITUD
    resp = _pedir(app_client, raw, comentario="", tipo="NO_LA_NECESITA")
    assert resp.status_code == 422, resp.text
    assert resp.json()["detail"] == MENSAJE_SOLO_SOLICITUD == (
        "La opción «Ya no la necesito» solo existe para la solicitud.")
    assert _fila(db, raw)["used_at"] is None
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"


def test_alertas_cuentan_la_cotizacion_con_cambios(app_client, db, admin_token, user_admin, user_vendedor,
                                                   vendedor_token, monkeypatch):
    _correo_falso(monkeypatch)
    antes = _alertas(app_client, admin_token)
    cot = _cot(db, _sc(db, user_admin))
    assert _pedir(app_client, _token(db, cot)).status_code == 200
    despues = _alertas(app_client, admin_token)
    assert despues["cambios_cliente"] == antes["cambios_cliente"] + 1
    assert despues["atrasados"] == antes["atrasados"]  # C22
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 0

    propia = _cot(db, _sc(db, user_vendedor))
    assert _pedir(app_client, _token(db, propia)).status_code == 200
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 1

    # Una COT con la marca que ya no está en Borrador (p. ej. rechazada) deja de contar y, con la misma regla (r1,
    # calidad 1), el detalle ya no la muestra.
    propia.estado = "RECHAZADA"
    db.commit()
    assert _alertas(app_client, vendedor_token)["cambios_cliente"] == 0
    assert _get_cot(app_client, admin_token, propia)["cambios_cliente"] is None


# ─── RP16: el envío de la COT ────────────────────────────────────────────────────────────────────────────────

def test_reenvio_de_la_cot_hace_un_solo_commit_antes_del_correo(app_client, db, admin_token, user_admin, monkeypatch,
                                                               contador_sql):
    """RP16: la COT se lee FOR UPDATE y la revocación, el token, el estado, el canal y la limpieza de la marca van en
    UN commit antes del correo. El lead (QUOTATION) se mueve después, en el commit del renglón del envío."""
    from app.models.sales import SalesOrder
    commits_al_enviar = []
    _correo_falso(monkeypatch, configurado=True, al_enviar=lambda: commits_al_enviar.append(contador_sql.commits))
    sc = _sc(db, user_admin)
    lead = _lead(db, sc, status="DRAFT")
    cot = _cot(db, sc, customer_email="ana@cliente.com")
    assert _pedir(app_client, _token(db, cot)).status_code == 200
    commits_al_enviar.clear()

    contador_sql.reset()
    resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert commits_al_enviar == [1], commits_al_enviar
    assert [s for s in contador_sql.sentencias if "FROM sales_quotations" in s and "FOR UPDATE" in s.upper()], \
        "la COT debe leerse con FOR UPDATE"
    # r1 (seguridad 2): y su SC también, DESPUÉS de la COT (el orden COT→SC de update_cotizacion): un «Pedir cambios» en
    # la SC que corre al mismo tiempo termina antes o espera a este envío; nunca quedan los dos a medias.
    orden = [("COT" if "FROM sales_quotations" in s else "SC") for s in contador_sql.sentencias
             if "FOR UPDATE" in s.upper() and ("FROM sales_quotations" in s or "FROM customer_requests" in s)]
    assert orden[:2] == ["COT", "SC"], orden
    # El del envío y, después del correo, el del renglón. B3 T8 r1 (ruling 1): el lead se mueve en un savepoint
    # (_lead_en_savepoint) y contador_sql cuenta su RELEASE SAVEPOINT como un commit (escucha after_commit), así que son 3.
    # El invariante de RP16 no cambia: un solo commit ANTES del correo (commits_al_enviar == [1], arriba).
    assert contador_sql.commits == 3, contador_sql.commits
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION" and cot.canal_envio == "Email" and cot.cambios_cliente_at is None
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "QUOTATION"
    [envio] = _logs(db, "COT", cot.id, "ESTADO_CHANGED")
    assert envio.new_estado == "PENDIENTE_CONFIRMACION" and envio.extra_data["correo"]["enviado"] is True


def test_si_falla_el_lead_el_envio_de_la_cot_queda(app_client, db, admin_token, user_admin, monkeypatch):
    """El aislamiento de hoy se conserva: un fallo al mover el lead no deshace el envío ni su renglón."""
    import app.api.v1.erp_ventas as m
    from _registro_capturado import registro_capturado
    from app.models.sales import SalesOrder
    _correo_falso(monkeypatch)
    sc = _sc(db, user_admin)
    lead = _lead(db, sc, status="DRAFT")
    cot = _cot(db, sc, estado="BORRADOR")

    def mover_que_falla(sc_id, status, sesion, commit=True):
        sesion.query(SalesOrder).filter(SalesOrder.id == lead.id).update({"status": "EN_NEGOCIACION"})
        raise RuntimeError("fallo simulado del CRM")

    monkeypatch.setattr(m, "mover_lead_de_solicitud", mover_que_falla)
    with registro_capturado("app.api.v1.erp_ventas") as registros:
        resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                               headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert any(r.levelname == "ERROR" for r in registros)
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    assert len(_logs(db, "COT", cot.id, "ESTADO_CHANGED")) == 1
    db.expire_all()
    assert db.get(SalesOrder, lead.id).status == "DRAFT"  # lo del lead se deshizo
    link = resp.json()["link_confirmacion"].rsplit("/", 1)[-1]
    assert _ver(app_client, link).status_code == 200


def test_el_lead_llega_a_quotation_aunque_el_correo_no_salga(app_client, db, admin_token, user_admin, monkeypatch):
    """Ruling r1 (duda 1): el lead se mueve después del correo; si el correo falla (FALLO_ENVIO) o no está configurado,
    el lead llega igual a QUOTATION."""
    import app.core.email as correo
    from app.models.sales import SalesOrder
    for configurado, motivo in ((True, "FALLO_ENVIO"), (False, "CORREO_NO_CONFIGURADO")):
        _correo_falso(monkeypatch, configurado=configurado)
        monkeypatch.setattr(correo, "send_email", lambda *a, **k: False)
        sc = _sc(db, user_admin)
        lead = _lead(db, sc, status="DRAFT")
        cot = _cot(db, sc, estado="BORRADOR", customer_email="ana@cliente.com")
        resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                               headers=auth(admin_token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["correo"]["motivo"] == motivo
        db.expire_all()
        assert db.get(SalesOrder, lead.id).status == "QUOTATION", motivo


def test_un_interbloqueo_o_un_tiempo_agotado_al_bloquear_la_sc_da_409(app_client, db, admin_token, user_admin,
                                                                     monkeypatch):
    """r2: el envío bloquea la COT y después su SC (COT→SC). PATCH /solicitudes/{id}/cliente y update_solicitud con
    cambio de modalidad bloquean SC→COT: si chocan, PostgreSQL aborta uno (40P01), o el bloqueo espera más que el
    statement_timeout (57014). El envío responde un 409 claro y no guarda nada (el patrón de PATCH /cliente, S8)."""
    import app.api.v1.erp_ventas as m
    from _registro_capturado import registro_capturado
    from sqlalchemy.exc import OperationalError
    from sqlalchemy.orm import Query
    from app.models.erp_documents import CustomerRequest
    llamadas = _correo_falso(monkeypatch, configurado=True)
    bloquear_real = Query.with_for_update
    for pgcode in ("40P01", "57014"):
        error_de_la_base = type("ErrorDeBloqueo", (Exception,), {"pgcode": pgcode})

        def _falla_al_bloquear_la_sc(self, *args, **kwargs):
            if self.column_descriptions and self.column_descriptions[0].get("entity") is CustomerRequest:
                raise OperationalError("SELECT customer_requests.id ... FOR UPDATE", {},
                                       error_de_la_base("bloqueo abortado"))
            return bloquear_real(self, *args, **kwargs)

        sc = _sc(db, user_admin)
        cot = _cot(db, sc, estado="BORRADOR", customer_email="ana@cliente.com")
        monkeypatch.setattr(Query, "with_for_update", _falla_al_bloquear_la_sc)
        with registro_capturado(m.logger.name) as registros:
            resp = app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json={},
                                   headers=auth(admin_token))
        monkeypatch.setattr(Query, "with_for_update", bloquear_real)
        assert resp.status_code == 409, (pgcode, resp.text)
        assert resp.json()["detail"] == ("Otra operación estaba cambiando esta cotización o su solicitud al mismo "
                                         "tiempo. Intenta de nuevo.")
        assert [r.levelname for r in registros] == ["WARNING"], pgcode
        db.expire_all()
        assert db.get(m.SalesQuotation, cot.id).estado == "BORRADOR", pgcode
        tokens = db.execute(text("SELECT count(*) FROM document_confirmation_tokens WHERE document_type = 'COT' "
                                 "AND document_id = :id"), {"id": cot.id}).scalar()
        assert tokens == 0, pgcode
        assert _logs(db, "COT", cot.id, "ESTADO_CHANGED") == [], pgcode
        assert llamadas == [], pgcode
