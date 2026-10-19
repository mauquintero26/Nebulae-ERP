"""Bloque 3, Tarea 7 — U22-validez (con C13, C14, C16, C21, C23; RP16, RP17): hasta cuándo vale la cotización.

- Al enviar (o reenviar) la COT: valida_hasta = hoy en Colombia + dias_validez_cotizacion (5 por defecto). Se lee con
  admin_config.config_entero (RP17): un valor que no es entero usa 5 y uno fuera de 1..60, el límite. Va en el commit
  único del envío (RP16).
- El enlace de la COT vence al final de ese día en Colombia (vence_al_final_del_dia); el correo dice «Esta cotización
  es válida hasta el …» (correo_documento con vence, C14) y la respuesta trae 'vence' (AAAA-MM-DD).
- La Actividad del envío agrega el renglón «Enlace vigente hasta» después del correo (C16); _cot_dict trae valida_hasta.
- /confirmar/ver con el enlace vencido: 400 con detail['estado_enlace'] == 'vencido' (C10), no el texto genérico.
- PATCH /ventas/config valida dias_validez_cotizacion (entero de 1 a 60, o 422, todo o nada: C23/R13) y los demás roles
  la leen (_CONFIG_LECTURA_GENERAL).

Nunca correo real: app.core.email.send_email se reemplaza por un falso que acepta **kwargs.
Los símbolos nuevos de T7 se importan DENTRO de cada prueba (el runner importa el módulo fuera de un try).
Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_validez_cotizacion
"""
import datetime
import uuid

from sqlalchemy import text

CORREO = "ana@cliente.com"
LINEA = {"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000000, "total_cop": 1000000}
MENSAJE_DIAS = "Los días de validez de una cotización deben ser un número entero entre 1 y 60."


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _correo_falso(monkeypatch, configurado=True):
    import app.core.email as correo
    llamadas = []

    def enviar(to, subject, html_body, **kwargs):
        llamadas.append({"to": to, "subject": subject, "html_body": html_body, **kwargs})
        return True

    monkeypatch.setattr(correo, "send_email", enviar)
    monkeypatch.setattr(correo, "smtp_configurado", lambda: configurado)
    return llamadas


def _cot(db, **campos):
    from app.models.erp_documents import SalesQuotation
    campos.setdefault("estado", "BORRADOR")
    campos.setdefault("productos", [dict(LINEA)])
    campos.setdefault("subtotal_cop", 1000000)
    campos.setdefault("total_cop", 1000000)
    campos.setdefault("customer_email", CORREO)
    cot = SalesQuotation(numero=f"COT-T7V{_sufijo()}", customer_name="Ana Pérez", **campos)
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _enviar(app_client, token, cot, body=None):
    return app_client.post(f"/api/v1/ventas/cotizaciones/{cot.id}/enviar-confirmacion", json=body or {},
                           headers=auth(token))


def _raw(resp):
    return resp.json()["link_confirmacion"].rsplit("/", 1)[-1]


def _tokens(db, cot_id):
    from app.models.confirmation import DocumentConfirmationToken
    db.expire_all()
    return (db.query(DocumentConfirmationToken)
            .filter(DocumentConfirmationToken.document_type == "COT", DocumentConfirmationToken.document_id == cot_id)
            .order_by(DocumentConfirmationToken.id.asc()).all())


def _logs(db, cot_id, accion=None):
    from app.models.erp_documents import ActivityLog
    db.expire_all()
    q = db.query(ActivityLog).filter(ActivityLog.entity_type == "COT", ActivityLog.entity_id == cot_id)
    if accion:
        q = q.filter(ActivityLog.action == accion)
    return q.order_by(ActivityLog.id.asc()).all()


def _poner_config(db, clave, valor):
    """admin_config dentro de la transacción de la prueba (se revierte al final)."""
    db.execute(text("INSERT INTO admin_config (key, value, updated_at) VALUES (:k, :v, NOW()) "
                    "ON CONFLICT (key) DO UPDATE SET value = :v, updated_at = NOW()"), {"k": clave, "v": valor})
    db.commit()


def _leer_config(db, clave):
    db.expire_all()
    fila = db.execute(text("SELECT value FROM admin_config WHERE key = :k"), {"k": clave}).first()
    return fila[0] if fila else None


def _ver(app_client, raw):
    return app_client.post("/api/v1/confirmar/ver", json={"token": raw})


# ─── U22-validez: el envío ───────────────────────────────────────────────────────────────────────────────────

def test_enviar_pone_valida_hasta_y_el_enlace_dura_hasta_ese_dia(app_client, db, admin_token, monkeypatch):
    from app.core.fechas import fecha_larga, hoy_colombia, vence_al_final_del_dia
    llamadas = _correo_falso(monkeypatch)
    cot = _cot(db)
    resp = _enviar(app_client, admin_token, cot, {"canal": "Email"})
    assert resp.status_code == 200, resp.text
    esperado = hoy_colombia() + datetime.timedelta(days=5)
    j = resp.json()
    assert j["vence"] == esperado.isoformat()
    assert j["data"]["valida_hasta"] == esperado.isoformat()
    db.refresh(cot)
    assert cot.valida_hasta == esperado and cot.estado == "PENDIENTE_CONFIRMACION"
    [token] = _tokens(db, cot.id)
    assert token.expires_at == vence_al_final_del_dia(esperado)
    # C14: el correo dice hasta cuándo es válida (correo_documento con vence = la fecha, no el expires_at).
    [correo] = llamadas
    assert correo["to"] == CORREO
    assert f"Esta cotización es válida hasta el {fecha_larga(esperado)}." in correo["html_body"]
    # C16: «Enlace vigente hasta» después del correo, con la fecha dd/mm/aaaa; sin la clave 'campo'.
    [envio] = _logs(db, cot.id, "ESTADO_CHANGED")
    cambios = envio.extra_data["cambios"]
    # B3 T11 (C16, cierre): después va 'Recordatorio automático' (U16-seguimiento).
    assert [c["etiqueta"] for c in cambios] == ["Canal de envío", "Correo", "Enlace vigente hasta",
                                                "Recordatorio automático"]
    assert cambios[-2] == {"etiqueta": "Enlace vigente hasta", "despues": esperado.strftime("%d/%m/%Y")}
    assert envio.extra_data["vence"] == esperado.isoformat()


def test_dias_de_validez_desde_configuracion(app_client, db, admin_token, monkeypatch):
    from app.core.fechas import hoy_colombia, vence_al_final_del_dia
    _correo_falso(monkeypatch)
    _poner_config(db, "dias_validez_cotizacion", "10")
    cot = _cot(db)
    resp = _enviar(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    esperado = hoy_colombia() + datetime.timedelta(days=10)
    db.refresh(cot)
    assert cot.valida_hasta == esperado
    assert resp.json()["vence"] == esperado.isoformat()
    [token] = _tokens(db, cot.id)
    assert token.expires_at == vence_al_final_del_dia(esperado)


def test_config_invalida_usa_limites(app_client, db, admin_token, monkeypatch):
    """R13: al leer, un valor que no es entero usa el defecto (5) y uno fuera de rango, el límite (1 o 60)."""
    from app.core.fechas import hoy_colombia
    _correo_falso(monkeypatch)
    for valor, dias in (("abc", 5), ("0", 1), ("500", 60), ("-3", 1), ("7.5", 5), ("", 5)):
        _poner_config(db, "dias_validez_cotizacion", valor)
        cot = _cot(db)
        resp = _enviar(app_client, admin_token, cot)
        assert resp.status_code == 200, (valor, resp.text)
        db.refresh(cot)
        assert cot.valida_hasta == hoy_colombia() + datetime.timedelta(days=dias), valor


def test_ver_trae_valida_hasta(app_client, db, admin_token, monkeypatch):
    """El cliente (documento de /confirmar/ver) y el asesor (GET /cotizaciones/{id}) ven la misma fecha."""
    from app.core.fechas import hoy_colombia, iso_z, vence_al_final_del_dia
    _correo_falso(monkeypatch)
    cot = _cot(db)
    resp = _enviar(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    esperado = hoy_colombia() + datetime.timedelta(days=5)
    ver = _ver(app_client, _raw(resp))
    assert ver.status_code == 200, ver.text
    assert ver.json()["data"]["documento"]["valida_hasta"] == esperado.isoformat()
    assert ver.json()["vence_at"] == iso_z(vence_al_final_del_dia(esperado))
    get = app_client.get(f"/api/v1/ventas/cotizaciones/{cot.id}", headers=auth(admin_token))
    assert get.status_code == 200, get.text
    assert get.json()["data"]["valida_hasta"] == esperado.isoformat()
    # Una COT nunca enviada no tiene validez (los datos existentes quedan en None).
    otra = _cot(db)
    get = app_client.get(f"/api/v1/ventas/cotizaciones/{otra.id}", headers=auth(admin_token))
    assert get.json()["data"]["valida_hasta"] is None


def test_enlace_vencido_es_400(app_client, db, admin_token, monkeypatch):
    """C10: pasada la fecha, /confirmar/ver responde 400 con estado_enlace 'vencido' (no el texto genérico) y la COT no
    cambia de estado sola."""
    _correo_falso(monkeypatch)
    cot = _cot(db)
    resp = _enviar(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    raw = _raw(resp)
    db.execute(text("UPDATE document_confirmation_tokens SET expires_at = :antes "
                    "WHERE document_type = 'COT' AND document_id = :id"),
               {"antes": datetime.datetime.utcnow() - datetime.timedelta(minutes=1), "id": cot.id})
    db.commit()
    ver = _ver(app_client, raw)
    assert ver.status_code == 400, ver.text
    detalle = ver.json()["detail"]
    assert isinstance(detalle, dict) and detalle["estado_enlace"] == "vencido", detalle
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"


def test_reenviar_cot_pendiente(app_client, db, admin_token, monkeypatch):
    """C13: el segundo envío (la COT ya está en Pendiente) da 200; el enlace viejo deja de servir y el nuevo sirve."""
    _correo_falso(monkeypatch)
    cot = _cot(db)
    primero = _enviar(app_client, admin_token, cot, {"canal": "Email"})
    assert primero.status_code == 200, primero.text
    segundo = _enviar(app_client, admin_token, cot, {"canal": "Email"})
    assert segundo.status_code == 200, segundo.text
    assert _ver(app_client, _raw(primero)).status_code == 400
    assert _ver(app_client, _raw(segundo)).status_code == 200
    db.refresh(cot)
    assert cot.estado == "PENDIENTE_CONFIRMACION"
    descripciones = [l.description for l in _logs(db, cot.id, "ESTADO_CHANGED")]
    assert descripciones == ["Enviada para confirmación del cliente por correo",
                             "Enlace de confirmación reenviado al cliente por correo"]


def test_vence_al_final_del_dia():
    """Prueba pura (T1, C6/RP1): el último instante del 8 de octubre en Colombia son las 05:00 UTC del 9."""
    from app.core.fechas import vence_al_final_del_dia
    assert vence_al_final_del_dia(datetime.date(2026, 10, 8)) == datetime.datetime(2026, 10, 9, 5, 0)


def test_la_sc_conserva_su_enlace_de_2_dias(app_client, db, admin_token, user_admin, monkeypatch):
    """U22-validez: la SC no cambia. Su enlace sigue durando TOKEN_TTL_DAYS y su Actividad no lleva «Enlace vigente
    hasta» (vence solo se pasa en la COT y en el PVEN, R20)."""
    from app.core.confirmation_tokens import TOKEN_TTL_DAYS
    from app.models.confirmation import DocumentConfirmationToken
    from app.models.erp_documents import ActivityLog, CustomerRequest
    _correo_falso(monkeypatch)
    sc = CustomerRequest(numero=f"SC-T7V{_sufijo()}", customer_name="Ana Pérez", customer_email=CORREO,
                         estado="ASIGNADA", advisor_user_id=user_admin.id, advisor_name=user_admin.email,
                         productos=[{"product_name": "Cuna Colecho", "qty": 1}])
    db.add(sc); db.commit(); db.refresh(sc)
    antes = datetime.datetime.utcnow()
    resp = app_client.post(f"/api/v1/ventas/solicitudes/{sc.id}/enviar-confirmacion", json={"canal": "Email"},
                           headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    db.expire_all()
    token = (db.query(DocumentConfirmationToken)
             .filter(DocumentConfirmationToken.document_type == "SC", DocumentConfirmationToken.document_id == sc.id)
             .one())
    duracion = token.expires_at - antes
    assert datetime.timedelta(days=TOKEN_TTL_DAYS) - datetime.timedelta(minutes=1) < duracion
    assert duracion < datetime.timedelta(days=TOKEN_TTL_DAYS) + datetime.timedelta(minutes=1)
    envio = (db.query(ActivityLog).filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc.id,
                                          ActivityLog.action == "ESTADO_CHANGED").one())
    assert [c["etiqueta"] for c in envio.extra_data["cambios"]] == ["Canal de envío", "Correo",
                                                                     "Recordatorio automático"]  # B3 T11 (C16)
    assert "vence" not in envio.extra_data


# ─── C23/R13: dias_validez_cotizacion en PATCH /ventas/config ─────────────────────────────────────────────────

def test_config_dias_validez_se_valida(app_client, db, admin_token):
    for malo in ("0", "61", "abc", "", " ", "5.5", "-1", 0, 61, True, None, 10.5, ["10"]):
        resp = app_client.patch("/api/v1/ventas/config", json={"dias_validez_cotizacion": malo},
                                headers=auth(admin_token))
        assert resp.status_code == 422, (malo, resp.text)
        assert resp.json()["detail"] == MENSAJE_DIAS, malo
    assert _leer_config(db, "dias_validez_cotizacion") is None
    # Todo o nada: con una clave mala no se guarda ninguna.
    alerta_antes = _leer_config(db, "alerta_sc_dias")
    otra_alerta = "97" if alerta_antes != "97" else "98"
    resp = app_client.patch("/api/v1/ventas/config",
                            json={"alerta_sc_dias": otra_alerta, "dias_validez_cotizacion": "61"},
                            headers=auth(admin_token))
    assert resp.status_code == 422, resp.text
    assert _leer_config(db, "alerta_sc_dias") == alerta_antes
    for bueno, guardado in (("10", "10"), (" 7 ", "7"), (1, "1"), (60, "60")):
        resp = app_client.patch("/api/v1/ventas/config", json={"dias_validez_cotizacion": bueno},
                                headers=auth(admin_token))
        assert resp.status_code == 200, (bueno, resp.text)
        assert _leer_config(db, "dias_validez_cotizacion") == guardado, bueno


def test_los_asesores_leen_los_dias_de_validez(app_client, db, admin_token, vendedor_token):
    """N8 + C23: dias_validez_cotizacion está en _CONFIG_LECTURA_GENERAL (la pantalla de la COT la muestra)."""
    resp = app_client.patch("/api/v1/ventas/config", json={"dias_validez_cotizacion": "8"}, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    resp = app_client.get("/api/v1/ventas/config", headers=auth(vendedor_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"]["dias_validez_cotizacion"]["value"] == "8"


def test_la_validez_sale_del_dia_de_colombia_aunque_en_utc_ya_sea_otro_dia(app_client, db, admin_token, monkeypatch):
    """r1 (dinero 2): a las 03:30 UTC del 9 de octubre en Colombia todavía es el 8 (22:30). Con 5 días la COT vale hasta
    el 13 y su enlace vence a las 00:00 del 14 en Colombia (05:00 UTC). Con la fecha UTC saldría un día más."""
    import app.core.fechas as fechas
    _correo_falso(monkeypatch)
    db.execute(text("DELETE FROM admin_config WHERE key = 'dias_validez_cotizacion'"))  # el defecto, 5
    db.commit()
    monkeypatch.setattr(fechas, "ahora_utc", lambda: datetime.datetime(2026, 10, 9, 3, 30))
    cot = _cot(db)
    resp = _enviar(app_client, admin_token, cot)
    assert resp.status_code == 200, resp.text
    assert resp.json()["vence"] == "2026-10-13"
    db.refresh(cot)
    assert cot.valida_hasta == datetime.date(2026, 10, 13)
    [token] = _tokens(db, cot.id)
    assert token.expires_at == datetime.datetime(2026, 10, 14, 5, 0)
