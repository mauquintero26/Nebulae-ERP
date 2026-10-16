"""Bloque 3, Tarea 1: enlaces de confirmación por tipo y con resultado (core/confirmation_tokens.py; C11, C12, R19,
RP2 y RP16).

- Tipos: TIPOS_CONFIRMACION = ('SC','COT') y TIPOS_CONSULTA = ('PVEN',). consultar_token, reclamar_token, peek_token y
  verify_and_consume_token filtran con document_type = ANY(:tipos); por defecto, solo SC y COT. Un enlace de consulta
  del pedido nunca se gasta en /confirmar/confirmar (prueba 8 de U22+H38).
- Columna resultado (fa6_026): 'CONFIRMADO' | 'CAMBIOS' | 'REVOCADO'. revoke_pending_tokens y revocar_token ponen
  'REVOCADO'; marcar_resultado no hace commit (va en el del documento).
- create_confirmation_token(..., expires_at=None, commit=True); revoke_pending_tokens(..., commit=True,
  contar_vigentes=False, excepto_hash=None); ultimo_enlace_vigente; hay_enlace_mas_reciente_vigente; enlace_publico.
- Confirmar una SC o una COT revoca sus demás enlaces pendientes en el mismo commit que la pone CONFIRMADA.
- FRONTEND_URL (hueco 1): enlace_publico registra un error y el preflight advierte (sin abortar) si en producción falta
  o apunta a localhost.

Correr SOLO con el runner de ROLLBACK:  python tests/rollback_runner.py test_enlaces_confirmacion
"""
import hashlib
import uuid
from datetime import datetime, timedelta, timezone
from unittest import mock

from sqlalchemy import text

PRODUCTOS = [{"product_name": "Cuna Colecho", "qty": 1}]
# r1: commits de la rama COT de /confirmar/confirmar: reclamar el token, el que pone CONFIRMADA (con la revocación),
# _sincronizar_estado_solicitud_desde_cotizacion y el renglón de Actividad. Si T5 reescribe la rama, se vuelve a medir.
COMMITS_RAMA_COT = 4


def _ahora():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _hash(raw):
    return hashlib.sha256(raw.encode()).hexdigest()


def _fila(db, raw):
    """La fila del token leída de la base (no del mapa de identidad de la sesión)."""
    return db.execute(text(
        "SELECT id, document_type, document_id, created_at, expires_at, used_at, resultado "
        "FROM document_confirmation_tokens WHERE token_hash = :h"), {"h": _hash(raw)}).mappings().first()


def _poner(db, raw, **campos):
    """Cambia columnas del token (created_at, expires_at, used_at) con SQL y confirma el savepoint."""
    asignaciones = ", ".join(f"{c} = :{c}" for c in campos)
    db.execute(text(f"UPDATE document_confirmation_tokens SET {asignaciones} WHERE token_hash = :h"),
               {**campos, "h": _hash(raw)})
    db.commit()


def _sufijo():
    return uuid.uuid4().hex[:6].upper()


def _sc(db, estado="PENDIENTE_CONFIRMACION", **campos):
    from app.models.erp_documents import CustomerRequest
    sc = CustomerRequest(numero=f"SC-B3E{_sufijo()}", customer_name="Cliente B3T1", estado=estado,
                         productos=PRODUCTOS, **campos)
    db.add(sc); db.commit(); db.refresh(sc)
    return sc


def _cot(db, sc, estado="PENDIENTE_CONFIRMACION"):
    from app.models.erp_documents import SalesQuotation
    cot = SalesQuotation(numero=f"COT-B3E{_sufijo()}", sc_id=sc.id, sc_numero=sc.numero, customer_name="Cliente B3T1",
                         estado=estado, total_cop=1000,
                         productos=[{"product_name": "Cuna Colecho", "qty": 1, "unit_price_cop": 1000}])
    db.add(cot); db.commit(); db.refresh(cot)
    return cot


def _ven(db, sc):
    from app.models.erp_documents import SaleOrder
    ven = SaleOrder(numero=f"PVEN-B3E{_sufijo()}", sc_id=sc.id, customer_name="Cliente B3T1",
                    estado="PENDIENTE_COMPRA")
    db.add(ven); db.commit(); db.refresh(ven)
    return ven


def _confirmar(app_client, raw):
    return app_client.post("/api/v1/confirmar/confirmar", json={"token": raw},
                           headers={"Idempotency-Key": f"b3t1-{uuid.uuid4().hex[:8]}"})


# ─── Tipos (C11) ─────────────────────────────────────────────────────────────────────────────────────────────

def test_token_de_pedido_no_se_gasta_en_confirmar(app_client, db):
    """Prueba 8 de U22+H38 (C11): un enlace 'PVEN' (consulta del pedido) da 400 en /confirmar/confirmar y en
    /confirmar/ver SIN gastarse; consultar_token solo lo ve con tipos=TIPOS_CONSULTA."""
    from app.core import confirmation_tokens as ct
    assert ct.TIPOS_CONFIRMACION == ("SC", "COT")
    assert ct.TIPOS_CONSULTA == ("PVEN",)
    ven = _ven(db, _sc(db, estado="CONFIRMADA"))
    raw = ct.create_confirmation_token(db, "PVEN", ven.id)

    assert _confirmar(app_client, raw).status_code == 400
    assert app_client.post("/api/v1/confirmar/ver", json={"token": raw}).status_code == 400
    assert _fila(db, raw)["used_at"] is None

    assert ct.consultar_token(db, raw) is None
    info = ct.consultar_token(db, raw, tipos=ct.TIPOS_CONSULTA)
    assert info is not None
    assert (info["document_type"], info["document_id"], info["vigente"]) == ("PVEN", ven.id, True)

    # Ninguna de las funciones de confirmación lo reclama con sus tipos por defecto.
    assert ct.peek_token(db, raw) is None
    assert ct.verify_and_consume_token(db, raw) is None
    assert ct.reclamar_token(db, raw) is None
    assert _fila(db, raw)["used_at"] is None
    # Con su tipo sí.
    assert ct.peek_token(db, raw, tipos=ct.TIPOS_CONSULTA) == ("PVEN", ven.id)
    # r1: un solo tipo escrito como texto ('PVEN') se toma como ('PVEN',), no como ['P','V','E','N'].
    assert ct.consultar_token(db, raw, tipos="PVEN")["document_type"] == "PVEN"
    assert ct.peek_token(db, raw, tipos="PVEN") == ("PVEN", ven.id)
    assert ct.reclamar_token(db, raw, tipos="PVEN")["document_type"] == "PVEN"


def test_enlace_de_confirmacion_no_abre_la_consulta_del_pedido(db):
    """r1 (C11, el otro sentido): un enlace SC o COT no da nada con tipos=TIPOS_CONSULTA (la vista del pedido de T5)."""
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    cot = _cot(db, sc)
    raw_sc = ct.create_confirmation_token(db, "SC", sc.id)
    raw_cot = ct.create_confirmation_token(db, "COT", cot.id)
    assert ct.consultar_token(db, raw_sc, tipos=ct.TIPOS_CONSULTA) is None
    assert ct.consultar_token(db, raw_cot, tipos=ct.TIPOS_CONSULTA) is None
    assert ct.peek_token(db, raw_sc, tipos=ct.TIPOS_CONSULTA) is None
    assert ct.peek_token(db, raw_cot, tipos=ct.TIPOS_CONSULTA) is None
    assert ct.reclamar_token(db, raw_cot, tipos=ct.TIPOS_CONSULTA) is None
    assert ct.verify_and_consume_token(db, raw_sc, tipos=ct.TIPOS_CONSULTA) is None
    assert _fila(db, raw_sc)["used_at"] is None and _fila(db, raw_cot)["used_at"] is None
    # Con sus tipos por defecto sí.
    assert ct.peek_token(db, raw_sc) == ("SC", sc.id)
    assert ct.peek_token(db, raw_cot) == ("COT", cot.id)


# ─── consultar / reclamar / marcar ──────────────────────────────────────────────────────────────────────────

def test_consultar_token_no_cambia_nada(db, contador_sql):
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    raw = ct.create_confirmation_token(db, "SC", sc.id)
    antes = dict(_fila(db, raw))

    with contador_sql.ventana() as v:
        info = ct.consultar_token(db, raw)
        otra = ct.consultar_token(db, raw)
    assert v.commits == 0
    assert all(s.lstrip().upper().startswith("SELECT") for s in v.sentencias), v.sentencias
    assert info == otra
    assert set(info) == {"id", "document_type", "document_id", "created_at", "expires_at", "used_at", "resultado",
                         "vigente", "vencido"}
    assert (info["id"], info["document_type"], info["document_id"]) == (antes["id"], "SC", sc.id)
    assert (info["created_at"], info["expires_at"]) == (antes["created_at"], antes["expires_at"])
    assert (info["used_at"], info["resultado"], info["vigente"], info["vencido"]) == (None, None, True, False)
    assert dict(_fila(db, raw)) == antes

    # Vencido sin usar: vencido y no vigente.
    _poner(db, raw, expires_at=_ahora() - timedelta(minutes=1))
    info = ct.consultar_token(db, raw)
    assert (info["vigente"], info["vencido"]) == (False, True)
    # Usado: ni vigente ni vencido.
    _poner(db, raw, used_at=_ahora())
    info = ct.consultar_token(db, raw)
    assert info["used_at"] is not None
    assert (info["vigente"], info["vencido"]) == (False, False)
    # Un token que no existe.
    assert ct.consultar_token(db, "no-existe-" + uuid.uuid4().hex) is None


def test_reclamar_token_es_de_un_solo_uso(db):
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    raw = ct.create_confirmation_token(db, "SC", sc.id)
    fila = _fila(db, raw)
    assert ct.reclamar_token(db, raw) == {"id": fila["id"], "document_type": "SC", "document_id": sc.id}
    assert _fila(db, raw)["used_at"] is not None
    assert ct.reclamar_token(db, raw) is None

    # Uno vencido no se reclama.
    vencido = ct.create_confirmation_token(db, "SC", sc.id)
    _poner(db, vencido, expires_at=_ahora() - timedelta(minutes=1))
    assert ct.reclamar_token(db, vencido) is None
    assert _fila(db, vencido)["used_at"] is None

    # verify_and_consume_token es la envoltura de siempre: devuelve la tupla.
    otro = ct.create_confirmation_token(db, "SC", sc.id)
    assert ct.verify_and_consume_token(db, otro) == ("SC", sc.id)
    assert ct.verify_and_consume_token(db, otro) is None


def test_marcar_resultado_no_hace_commit(db, contador_sql):
    from app.core import confirmation_tokens as ct
    assert (ct.RESULTADO_CONFIRMADO, ct.RESULTADO_CAMBIOS, ct.RESULTADO_REVOCADO) == ("CONFIRMADO", "CAMBIOS",
                                                                                       "REVOCADO")
    sc = _sc(db)
    raw = ct.create_confirmation_token(db, "SC", sc.id)
    info = ct.reclamar_token(db, raw)
    with contador_sql.ventana() as v:
        assert ct.marcar_resultado(db, info["id"], ct.RESULTADO_CONFIRMADO) is True
    assert v.commits == 0
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"
    # Un resultado que no es de los tres no se escribe.
    try:
        ct.marcar_resultado(db, info["id"], "CONFIRMADA")
    except ValueError:
        pass
    else:
        raise AssertionError("marcar_resultado aceptó un resultado desconocido")
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"
    # r1: solo escribe sobre un enlace usado y todavía sin resultado.
    assert ct.marcar_resultado(db, info["id"], ct.RESULTADO_CAMBIOS) is False          # ya tenía resultado
    assert _fila(db, raw)["resultado"] == "CONFIRMADO"
    revocado = ct.create_confirmation_token(db, "SC", sc.id)
    ct.revocar_token(db, revocado)
    id_revocado = _fila(db, revocado)["id"]
    assert ct.marcar_resultado(db, id_revocado, ct.RESULTADO_CONFIRMADO) is False      # un REVOCADO no cambia
    assert _fila(db, revocado)["resultado"] == "REVOCADO"
    sin_usar = ct.create_confirmation_token(db, "SC", sc.id)
    assert ct.marcar_resultado(db, _fila(db, sin_usar)["id"], ct.RESULTADO_CONFIRMADO) is False   # nadie lo usó
    assert _fila(db, sin_usar)["resultado"] is None


# ─── revocar ─────────────────────────────────────────────────────────────────────────────────────────────────

def test_revoke_pending_tokens_pone_revocado_y_respeta_excepto_hash(db, contador_sql):
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    a = ct.create_confirmation_token(db, "SC", sc.id)
    b = ct.create_confirmation_token(db, "SC", sc.id)
    c = ct.create_confirmation_token(db, "SC", sc.id)
    usado = ct.create_confirmation_token(db, "SC", sc.id)
    ct.reclamar_token(db, usado)
    de_cot = ct.create_confirmation_token(db, "COT", sc.id)          # otro tipo, mismo id: no se toca
    usado_antes = _fila(db, usado)["used_at"]

    with contador_sql.ventana() as v:
        assert ct.revoke_pending_tokens(db, "SC", sc.id, commit=False, excepto_hash=ct.hash_token(b)) is None
    assert v.commits == 0
    for raw in (a, c):
        fila = _fila(db, raw)
        assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO", raw
    assert (_fila(db, b)["used_at"], _fila(db, b)["resultado"]) == (None, None)
    assert (_fila(db, usado)["used_at"], _fila(db, usado)["resultado"]) == (usado_antes, None)
    assert (_fila(db, de_cot)["used_at"], _fila(db, de_cot)["resultado"]) == (None, None)

    # Con el commit por defecto: un commit y revoca el que quedaba.
    with contador_sql.ventana() as v:
        ct.revoke_pending_tokens(db, "SC", sc.id)
    assert v.commits == 1
    assert _fila(db, b)["resultado"] == "REVOCADO"
    assert ct.hash_token(b) == _hash(b)


def test_revoke_contar_vigentes_con_excepto_hash(db):
    """RP2: con contar_vigentes=True cuenta solo lo que revocó ESTE UPDATE (que ya excluye excepto_hash) y que el cliente
    todavía podía usar; el vencido se revoca pero no cuenta."""
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    a = ct.create_confirmation_token(db, "SC", sc.id)
    b = ct.create_confirmation_token(db, "SC", sc.id)
    c = ct.create_confirmation_token(db, "SC", sc.id)
    vencido = ct.create_confirmation_token(db, "SC", sc.id)
    _poner(db, vencido, expires_at=_ahora() - timedelta(minutes=1))

    assert ct.revoke_pending_tokens(db, "SC", sc.id, commit=False, contar_vigentes=True,
                                    excepto_hash=ct.hash_token(b)) == 2
    for raw in (a, c, vencido):
        assert _fila(db, raw)["resultado"] == "REVOCADO", raw
    assert (_fila(db, b)["used_at"], _fila(db, b)["resultado"]) == (None, None)
    assert ct.revoke_pending_tokens(db, "SC", sc.id, commit=False, contar_vigentes=True,
                                    excepto_hash=ct.hash_token(b)) == 0


def test_revocar_token(db, contador_sql):
    """revocar_token(db, raw): solo ese enlace, sin commit (el recordatorio que no salió, U16-seguimiento)."""
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    raw = ct.create_confirmation_token(db, "SC", sc.id)
    otro = ct.create_confirmation_token(db, "SC", sc.id)
    with contador_sql.ventana() as v:
        assert ct.revocar_token(db, raw) is True
    assert v.commits == 0
    fila = _fila(db, raw)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    assert (_fila(db, otro)["used_at"], _fila(db, otro)["resultado"]) == (None, None)
    assert ct.revocar_token(db, raw) is False
    # Uno ya usado no cambia de resultado.
    ct.reclamar_token(db, otro)
    assert ct.revocar_token(db, otro) is False
    assert _fila(db, otro)["resultado"] is None


# ─── crear ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_create_confirmation_token_con_vencimiento_y_sin_commit(db, contador_sql):
    from app.core import confirmation_tokens as ct
    from app.core.fechas import vence_al_final_del_dia
    from datetime import date
    sc = _sc(db)
    # Sin expires_at: +TOKEN_TTL_DAYS (2 días), como siempre.
    raw = ct.create_confirmation_token(db, "SC", sc.id)
    fila = _fila(db, raw)
    assert ct.TOKEN_TTL_DAYS == 2
    assert fila["expires_at"] - fila["created_at"] == timedelta(days=2)
    # Con expires_at: se guarda tal cual.
    vence = vence_al_final_del_dia(date.today() + timedelta(days=5))
    raw = ct.create_confirmation_token(db, "COT", sc.id, expires_at=vence)
    assert _fila(db, raw)["expires_at"] == vence
    # RP16: commit=False solo hace flush; el token queda en la transacción de quien llama.
    with contador_sql.ventana() as v:
        raw = ct.create_confirmation_token(db, "SC", sc.id, commit=False)
    assert v.commits == 0
    assert _fila(db, raw) is not None
    assert ct.consultar_token(db, raw)["vigente"] is True


# ─── último enlace vigente / uno más reciente ────────────────────────────────────────────────────────────────

def test_ultimo_enlace_vigente_y_hay_enlace_mas_reciente_vigente(db):
    from app.core import confirmation_tokens as ct
    sc = _sc(db)
    ahora = _ahora()
    t1 = ct.create_confirmation_token(db, "SC", sc.id)
    t2 = ct.create_confirmation_token(db, "SC", sc.id)
    t3 = ct.create_confirmation_token(db, "SC", sc.id)
    _poner(db, t1, created_at=ahora - timedelta(hours=3))
    _poner(db, t2, created_at=ahora - timedelta(hours=2))
    _poner(db, t3, created_at=ahora - timedelta(hours=1))
    otro_tipo = ct.create_confirmation_token(db, "COT", sc.id)       # más nuevo, pero de otro tipo

    assert ct.ultimo_enlace_vigente(db, "SC", sc.id).token_hash == _hash(t3)
    ct.revocar_token(db, t3)
    db.commit()
    ultimo = ct.ultimo_enlace_vigente(db, "SC", sc.id)
    assert ultimo.token_hash == _hash(t2)
    assert ultimo.used_at is None

    creado_t1 = _fila(db, t1)["created_at"]
    creado_t2 = _fila(db, t2)["created_at"]
    assert ct.hay_enlace_mas_reciente_vigente(db, "SC", sc.id, creado_t1) is True     # t2
    assert ct.hay_enlace_mas_reciente_vigente(db, "SC", sc.id, creado_t2) is False    # t3 está revocado
    _poner(db, t2, expires_at=ahora - timedelta(minutes=1))
    assert ct.hay_enlace_mas_reciente_vigente(db, "SC", sc.id, creado_t1) is False    # t2 venció

    ct.revoke_pending_tokens(db, "SC", sc.id)
    assert ct.ultimo_enlace_vigente(db, "SC", sc.id) is None
    assert ct.ultimo_enlace_vigente(db, "COT", sc.id).token_hash == _hash(otro_tipo)


# ─── enlace público y FRONTEND_URL (hueco 1) ────────────────────────────────────────────────────────────────

def _errores(monkeypatch):
    from app.core import confirmation_tokens as ct
    registro = []
    monkeypatch.setattr(ct.logger, "error", lambda mensaje, *a, **k: registro.append(mensaje % a if a else mensaje))
    return registro


def test_enlace_publico_arma_confirmar_y_pedido(monkeypatch):
    from app.core import confirmation_tokens as ct
    errores = _errores(monkeypatch)
    monkeypatch.setenv("NEBULAE_ENV", "staging")
    monkeypatch.setenv("FRONTEND_URL", "https://erp.ejemplo.invalid/")
    raw = "Abc_123-" * 3                                              # 24 caracteres del alfabeto de token_urlsafe
    assert ct.frontend_url() == "https://erp.ejemplo.invalid"
    assert ct.enlace_publico(raw, "SC") == f"https://erp.ejemplo.invalid/confirmar/{raw}"
    assert ct.enlace_publico(raw, "COT") == f"https://erp.ejemplo.invalid/confirmar/{raw}"
    assert ct.enlace_publico(raw, "PVEN") == f"https://erp.ejemplo.invalid/pedido/{raw}"
    import secrets
    real = secrets.token_urlsafe(32)                                  # como lo crea create_confirmation_token
    assert ct.enlace_publico(real, "SC").endswith(f"/confirmar/{real}")
    # Tipo desconocido, o un token que no es de token_urlsafe (armaría otra ruta): ValueError.
    for token, tipo in ((raw, "OTRO"), ("a/../b", "SC"), (raw[:19], "SC"), (raw + "?x=1", "SC"), (raw + "#x", "PVEN"),
                        (raw + "/../pedido", "COT"), ("", "SC")):
        try:
            ct.enlace_publico(token, tipo)
        except ValueError:
            pass
        else:
            raise AssertionError(f"enlace_publico aceptó {token!r} / {tipo!r}")
    # Fuera de producción, localhost es lo normal: sin error.
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5100")
    assert ct.enlace_publico(raw, "SC") == f"http://localhost:5100/confirmar/{raw}"
    monkeypatch.delenv("FRONTEND_URL", raising=False)
    assert ct.enlace_publico(raw, "SC") == f"{ct.FRONTEND_URL_POR_DEFECTO}/confirmar/{raw}"
    assert errores == []


def test_frontend_url_por_defecto_es_una_sola_constante():
    """r1: el valor por defecto vive en preflight.py; confirmation_tokens lo importa y el aviso lo usa (sin literal)."""
    import inspect
    from app.core import confirmation_tokens as ct, preflight as pf
    assert ct.FRONTEND_URL_POR_DEFECTO is pf.FRONTEND_URL_POR_DEFECTO
    assert pf.FRONTEND_URL_POR_DEFECTO in pf.aviso_frontend_url("production", None)
    assert inspect.getsource(pf).count("localhost:5100") == 1
    assert "localhost:5100" not in inspect.getsource(ct)


def test_enlace_publico_registra_error_en_produccion_con_localhost(monkeypatch):
    from app.core import confirmation_tokens as ct
    errores = _errores(monkeypatch)
    monkeypatch.setenv("NEBULAE_ENV", "production")
    monkeypatch.setenv("FRONTEND_URL", "http://localhost:5100")
    raw = "token-secreto-" + uuid.uuid4().hex
    assert ct.enlace_publico(raw, "SC") == f"http://localhost:5100/confirmar/{raw}"
    assert len(errores) == 1 and "FRONTEND_URL" in errores[0]
    assert raw not in errores[0]                                     # el token crudo nunca se registra

    monkeypatch.delenv("FRONTEND_URL", raising=False)                # falta: también es error
    ct.enlace_publico(raw, "PVEN")
    assert len(errores) == 2 and "FRONTEND_URL" in errores[1] and raw not in errores[1]

    monkeypatch.setenv("FRONTEND_URL", "https://erp.ejemplo.invalid")
    assert ct.enlace_publico(raw, "COT") == f"https://erp.ejemplo.invalid/confirmar/{raw}"
    assert len(errores) == 2


def _engine_falso(nombre_base, version):
    conn = mock.MagicMock()
    conn.execute.return_value.scalar.side_effect = [nombre_base, version]
    ctx = mock.MagicMock()
    ctx.__enter__ = mock.MagicMock(return_value=conn)
    ctx.__exit__ = mock.MagicMock(return_value=False)
    engine = mock.MagicMock()
    engine.connect.return_value = ctx
    return engine


def _preflight_produccion(monkeypatch, frontend_url):
    """Corre run_preflight_or_abort en modo producción con un engine falso; devuelve (resultado, avisos)."""
    import app.core.preflight as pf
    avisos = []
    monkeypatch.setattr(pf.logger, "warning", lambda mensaje, *a, **k: avisos.append(mensaje % a if a else mensaje))
    monkeypatch.setattr(pf, "create_engine", lambda *a, **k: _engine_falso("erpdb", "fa6_026"))
    monkeypatch.setenv("NEBULAE_ENV", "production")
    monkeypatch.setenv("SECRET_KEY", "k" * 64)
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://erp.ejemplo.invalid")
    if frontend_url is None:
        monkeypatch.delenv("FRONTEND_URL", raising=False)
    else:
        monkeypatch.setenv("FRONTEND_URL", frontend_url)
    resultado = pf.run_preflight_or_abort(db_url="postgresql://u:x@h:5432/erpdb", expected_db="erpdb",
                                          nebulae_env="production", required_version="fa6_026")
    return resultado, avisos


def test_preflight_advierte_frontend_url_en_produccion(monkeypatch):
    """Hueco 1: en producción, FRONTEND_URL ausente o en localhost se advierte al arrancar, sin abortar."""
    for valor in ("http://localhost:5100", None, "http://127.0.0.1:5100", "erp.ejemplo.invalid"):
        resultado, avisos = _preflight_produccion(monkeypatch, valor)
        assert resultado["env"] == "production", valor              # no abortó
        assert any("FRONTEND_URL" in a for a in avisos), (valor, avisos)

    resultado, avisos = _preflight_produccion(monkeypatch, "https://erp.ejemplo.invalid")
    assert resultado["env"] == "production"
    assert not any("FRONTEND_URL" in a for a in avisos), avisos


def test_aviso_frontend_url_solo_en_produccion():
    from app.core.preflight import aviso_frontend_url
    assert aviso_frontend_url("staging", "http://localhost:5100") is None
    assert aviso_frontend_url("", None) is None
    assert aviso_frontend_url("production", "https://erp.ejemplo.invalid") is None
    for valor in (None, "", "   ", "http://localhost:5100", "http://LOCALHOST", "http://127.0.0.1",
                  "http://[::1]:5100", "http://app.localhost:5100", "erp.ejemplo.invalid", "ftp://erp.ejemplo.invalid"):
        aviso = aviso_frontend_url("production", valor)
        assert aviso and "FRONTEND_URL" in aviso, valor


# ─── confirmar revoca los demás enlaces (C12) ───────────────────────────────────────────────────────────────

def test_confirmar_sc_revoca_los_demas_enlaces_en_el_mismo_commit(app_client, db, user_admin, contador_sql):
    from app.core import confirmation_tokens as ct
    sc = _sc(db, advisor_user_id=user_admin.id, advisor_name=user_admin.email)
    primero = ct.create_confirmation_token(db, "SC", sc.id)
    segundo = ct.create_confirmation_token(db, "SC", sc.id)
    with contador_sql.ventana() as v:
        resp = _confirmar(app_client, segundo)
    assert resp.status_code == 200, resp.text
    # El de reclamar el token y el que pone CONFIRMADA: la revocación no agrega otro commit.
    assert v.commits == 2
    db.refresh(sc)
    assert sc.estado == "CONFIRMADA"
    fila = _fila(db, primero)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    fila = _fila(db, segundo)
    assert fila["used_at"] is not None and fila["resultado"] != "REVOCADO"
    assert _confirmar(app_client, primero).status_code == 400


def test_confirmar_sc_que_ya_no_esta_pendiente_no_revoca_los_demas(app_client, db, user_admin):
    from app.core import confirmation_tokens as ct
    sc = _sc(db, estado="ASIGNADA", advisor_user_id=user_admin.id, advisor_name=user_admin.email)
    primero = ct.create_confirmation_token(db, "SC", sc.id)
    segundo = ct.create_confirmation_token(db, "SC", sc.id)
    assert _confirmar(app_client, segundo).status_code == 400
    assert (_fila(db, primero)["used_at"], _fila(db, primero)["resultado"]) == (None, None)


def test_confirmar_cot_revoca_los_demas_enlaces(app_client, db, monkeypatch, contador_sql):
    """r1: además del 'REVOCADO', la revocación va en el MISMO commit que pone CONFIRMADA: un espía sobre
    revoke_pending_tokens de confirmacion_publica afirma commit=False, el excepto_hash del enlace usado y que hasta ese
    momento solo hubo el commit de reclamar el token (el siguiente es el que pone CONFIRMADA)."""
    import app.api.v1.confirmacion_publica as cp
    from app.core import confirmation_tokens as ct
    sc = _sc(db, estado="COTIZADA")
    cot = _cot(db, sc)
    primero = ct.create_confirmation_token(db, "COT", cot.id)
    segundo = ct.create_confirmation_token(db, "COT", cot.id)
    llamadas = []
    revocar_real = cp.revoke_pending_tokens
    with contador_sql.ventana() as v:
        def espia(*args, **kwargs):
            llamadas.append((args[1:], kwargs, v.commits))
            return revocar_real(*args, **kwargs)
        monkeypatch.setattr(cp, "revoke_pending_tokens", espia)
        resp = _confirmar(app_client, segundo)
    assert resp.status_code == 200, resp.text
    assert llamadas == [(("COT", cot.id), {"commit": False, "excepto_hash": ct.hash_token(segundo)}, 1)]
    # Reclamar + CONFIRMADA + los dos de la rama COT después (sincronizar la SC y el renglón de Actividad).
    assert v.commits == COMMITS_RAMA_COT, v.commits
    db.refresh(cot)
    assert cot.estado == "CONFIRMADA"
    fila = _fila(db, primero)
    assert fila["used_at"] is not None and fila["resultado"] == "REVOCADO"
    fila = _fila(db, segundo)
    assert fila["used_at"] is not None and fila["resultado"] != "REVOCADO"
