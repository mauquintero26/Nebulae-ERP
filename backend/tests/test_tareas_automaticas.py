"""Bloque 3, Tarea 10 (TAREAS): revisión automática cada 10 minutos, solo en el servidor de producción (R14).

- core/tareas_automaticas.py: el bucle dentro del proceso, el candado de Postgres (CLAVE_LOCK) y correr_una_vez, que
  confirma cada tarea por separado (requisito del controlador): el fallo de una tarea no deshace lo de las demás.
- R14: tareas_habilitadas exige NEBULAE_TAREAS_AUTOMATICAS == '1', NEBULAE_ENV == 'production' y una base que no sea de
  pruebas (erp_test); debe_iniciar exige además que 'pytest' no esté cargado y que uvicorn no corra con --reload.
- RP7: el registro trae la purga de la Papelera (purgar_papelera_vencida(db, ahora), autor «Sistema»).
- RP17: el estado se escribe con guardar_config y se lee con leer_config. RP18: tareas_ es una clave reservada de
  /ventas/config («Ese valor lo escribe el sistema.»). RP30: /tareas/estado informa tareas_habilitadas().
- main.py arranca el bucle después de startup_preflight y lo cancela al apagar.

Correr SOLO con el runner de ROLLBACK (la purga real corre dentro de la transacción revertida):
    python tests/rollback_runner.py test_tareas_automaticas
Ninguna prueba deja hilos ni tareas vivos: el bucle se prueba con un sueño y un hilo falsos, y correr_una_vez directo.
"""
import asyncio
import datetime
import json
import logging
import sys

import pytest
from sqlalchemy import text

MENSAJE_APAGADA = "La revisión automática está apagada en este servidor."
MENSAJE_CLAVES_DEL_SISTEMA = "Ese valor lo escribe el sistema."
CLAVE_PRUEBA_A = "b3t10_prueba_a"
CLAVE_PRUEBA_B = "b3t10_prueba_b"
ENV_PRODUCCION = {"NEBULAE_TAREAS_AUTOMATICAS": "1", "NEBULAE_ENV": "production"}

_LLAMADAS = []  # (que, ahora) de las tareas falsas de este módulo; cada prueba lo vacía


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def _ta():
    from app.core import tareas_automaticas
    return tareas_automaticas


def _valor(db, clave):
    fila = db.execute(text("SELECT value FROM admin_config WHERE key = :k"), {"k": clave}).fetchone()
    return None if fila is None else fila[0]


def _candado_libre(clave):
    """True si NINGUNA sesión de esta base tiene el candado. Se mira pg_locks y no pg_try_advisory_lock: una conexión
    que volvió al pool con el candado tomado podría tocarle a esta consulta, y el candado de sesión es reentrante (lo
    «tomaría» otra vez y la fuga no se vería). Un bigint chico va en classid 0, objid = clave, objsubid 1."""
    import app.db.database as dbmod
    with dbmod.engine.connect() as conn:
        tomados = conn.execute(text(
            "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND classid = 0 AND objid = :k "
            "AND objsubid = 1 AND database = (SELECT oid FROM pg_database WHERE datname = current_database())"),
            {"k": clave}).scalar()
    return tomados == 0


# ─── tareas falsas (se registran con monkeypatch de TAREAS, como 'test_tareas_automaticas:<funcion>') ──────────────

def _tarea_ok(db, ahora):
    _LLAMADAS.append(("ok", ahora))
    return {"ok": 1}


def _tarea_que_falla(db, ahora):
    _LLAMADAS.append(("falla", ahora))
    raise RuntimeError("falla a propósito")


def _tarea_que_escribe(db, ahora):
    """Escribe una fila SIN commit: correr_una_vez la confirma antes de pasar a la siguiente tarea."""
    from app.core.admin_config import guardar_config
    _LLAMADAS.append(("escribe", ahora))
    guardar_config(db, {CLAVE_PRUEBA_A: "escrita"})
    return {"escritas": 1}


def _tarea_que_escribe_y_falla(db, ahora):
    """Escribe y luego falla: su rollback deshace solo lo suyo."""
    from app.core.admin_config import guardar_config
    _LLAMADAS.append(("escribe_y_falla", ahora))
    guardar_config(db, {CLAVE_PRUEBA_B: "no debe quedar"})
    raise RuntimeError("falla después de escribir")


def _tarea_con_resumen_largo(db, ahora):
    return {"purgadas": 400, "numeros": [f"SC-2026{i:04d}" for i in range(400)]}


@pytest.fixture
def registros_de_log():
    """Los registros del módulo de tareas durante la prueba, sin salir a la consola (tests/_registro_capturado.py)."""
    from _registro_capturado import registro_capturado
    with registro_capturado("app.core.tareas_automaticas") as registros:
        yield registros


# ─── R14: cuándo arranca ──────────────────────────────────────────────────────────────────────────────────────────

def test_no_arranca_sin_la_variable():
    """Prueba 1 (R14): debe_iniciar solo con NEBULAE_TAREAS_AUTOMATICAS='1' Y NEBULAE_ENV='production', sin pytest
    cargado, sin --reload y con una base que no sea de pruebas."""
    ta = _ta()
    prod = dict(ENV_PRODUCCION)
    assert ta.debe_iniciar({}, {}, argv=[], base="erpdb") is False
    assert ta.debe_iniciar({"NEBULAE_TAREAS_AUTOMATICAS": "1"}, {}, argv=[], base="erpdb") is False
    assert ta.debe_iniciar(prod, {}, argv=[], base="erpdb") is True
    assert ta.debe_iniciar({**prod, "NEBULAE_TAREAS_AUTOMATICAS": " 1 "}, {}, argv=[], base="erpdb") is True
    for valor in ("0", "si", "true", "", "11"):
        assert ta.debe_iniciar({**prod, "NEBULAE_TAREAS_AUTOMATICAS": valor}, {}, argv=[], base="erpdb") is False, valor
    for ambiente in ("development", "staging", ""):
        assert ta.debe_iniciar({**prod, "NEBULAE_ENV": ambiente}, {}, argv=[], base="erpdb") is False, ambiente
    # Con pytest cargado no arranca (conftest usa `with TestClient(app)`, que dispara el startup).
    assert ta.debe_iniciar(prod, {"pytest": sys.modules["pytest"]}, argv=[], base="erpdb") is False
    # Con uvicorn --reload (o UVICORN_RELOAD) no arranca: el proceso de trabajo hereda el argv del que vigila.
    assert ta.debe_iniciar(prod, {}, argv=["uvicorn", "main:app", "--reload", "--port", "8030"], base="erpdb") is False
    for valor in ("true", "1", "yes"):
        assert ta.debe_iniciar({**prod, "UVICORN_RELOAD": valor}, {}, argv=[], base="erpdb") is False, valor
    assert ta.debe_iniciar({**prod, "UVICORN_RELOAD": "false"}, {}, argv=[], base="erpdb") is True
    # Contra una base de pruebas no arranca, aunque alguien ponga las dos variables en el .env.
    for base in ("erp_test", "ERP_TEST", "erp_staging", "nebulae_dev", "qa_ventas", ""):
        assert ta.debe_iniciar(prod, {}, argv=[], base=base) is False, base
    # Sin base explícita lee la del proceso: en el runner es erp_test, así que tampoco arranca.
    assert ta.debe_iniciar(prod, {}, argv=[]) is False
    # tareas_habilitadas es la regla del servidor (R14): no mira pytest ni --reload.
    assert ta.tareas_habilitadas(prod, base="erpdb") is True
    assert ta.tareas_habilitadas(prod) is False  # erp_test
    assert ta.tareas_habilitadas({"NEBULAE_TAREAS_AUTOMATICAS": "1"}, base="erpdb") is False


def test_intervalo_con_limites():
    """Prueba 2: NEBULAE_TAREAS_INTERVALO_SEG por defecto 600, mínimo 60 y máximo 3600; uno inválido da 600."""
    ta = _ta()
    casos = [("30", 60), ("abc", 600), ("99999", 3600), ("", 600), (" 120 ", 120), ("60", 60), ("3600", 3600),
             ("-5", 60), ("90.5", 600)]
    for valor, esperado in casos:
        assert ta.intervalo_seg({"NEBULAE_TAREAS_INTERVALO_SEG": valor}) == esperado, valor
    assert ta.intervalo_seg({}) == 600


# ─── correr_una_vez ───────────────────────────────────────────────────────────────────────────────────────────────

def test_correr_una_vez_registra_la_revision(db, monkeypatch, registros_de_log):
    """Prueba 3: una tarea que falla no frena a las demás, queda en el log, y la revisión deja su hora (UTC con 'Z') y
    su resumen en admin_config."""
    ta = _ta()
    _LLAMADAS.clear()
    monkeypatch.setattr(ta, "TAREAS", [("buena", f"{__name__}:_tarea_ok"), ("mala", f"{__name__}:_tarea_que_falla"),
                                       ("despues", f"{__name__}:_tarea_ok")])
    ahora = datetime.datetime(2026, 10, 5, 14, 0)
    resumen = ta.correr_una_vez(ahora=ahora)
    assert resumen == {"buena": {"ok": 1}, "mala": {"error": "RuntimeError"}, "despues": {"ok": 1}}
    assert _LLAMADAS == [("ok", ahora), ("falla", ahora), ("ok", ahora)]
    assert _valor(db, "tareas_ultima_revision") == "2026-10-05T14:00:00Z"
    assert json.loads(_valor(db, "tareas_ultimo_resumen")) == resumen
    errores = [r for r in registros_de_log if r.levelno >= logging.ERROR]
    assert len(errores) == 1, [r.getMessage() for r in errores]
    assert errores[0].exc_info and "mala" in errores[0].getMessage()


def test_correr_una_vez_confirma_cada_tarea_por_separado(db, monkeypatch, registros_de_log):
    """Requisito del controlador: lo que escribe una tarea que termina bien queda firme antes de la siguiente; el
    rollback de la que falla deshace solo lo suyo. En los dos órdenes."""
    ta = _ta()
    ordenes = (
        [("escribe", f"{__name__}:_tarea_que_escribe"), ("falla", f"{__name__}:_tarea_que_escribe_y_falla")],
        [("falla", f"{__name__}:_tarea_que_escribe_y_falla"), ("escribe", f"{__name__}:_tarea_que_escribe")],
    )
    for tareas in ordenes:
        db.execute(text("DELETE FROM admin_config WHERE key IN (:a, :b)"), {"a": CLAVE_PRUEBA_A, "b": CLAVE_PRUEBA_B})
        db.commit()
        _LLAMADAS.clear()
        monkeypatch.setattr(ta, "TAREAS", tareas)
        resumen = ta.correr_una_vez()
        assert resumen == {"escribe": {"escritas": 1}, "falla": {"error": "RuntimeError"}}, tareas
        assert [que for que, _ in _LLAMADAS] == [nombre if nombre == "escribe" else "escribe_y_falla"
                                                 for nombre, _ in tareas]
        assert _valor(db, CLAVE_PRUEBA_A) == "escrita", tareas
        assert _valor(db, CLAVE_PRUEBA_B) is None, tareas
        # Sin `ahora`, la hora es la del servidor en UTC, con 'Z'.
        marca = _valor(db, "tareas_ultima_revision")
        assert marca.endswith("Z")
        hora = datetime.datetime.fromisoformat(marca[:-1])
        assert abs(datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None) - hora) < datetime.timedelta(
            minutes=5)


def test_registro_real_purga_la_papelera_como_sistema(db, user_admin):
    """RP7 y decisión del controlador (punto 1): con el registro REAL (sin monkeypatch de TAREAS), correr_una_vez llama
    a purgar_papelera_vencida(db, ahora): la SC vencida se borra y el renglón PURGED queda con autor «Sistema».
    `ahora` está en 2001 para que la purga solo alcance a la SC de la prueba (todo se revierte al final)."""
    from app.models.erp_documents import ActivityLog, CustomerRequest
    ta = _ta()
    assert ta.TAREAS[0] == ("purga_papelera", "app.api.v1.erp_ventas:purgar_papelera_vencida")
    ahora = datetime.datetime(2001, 3, 1, 12, 0)
    sc = CustomerRequest(numero="SC-T10P01", customer_name="Cliente Prueba", estado="CANCELADA",
                         eliminada_at=ahora - datetime.timedelta(days=31), razon_cancelacion="Vencida",
                         productos=[{"product_name": "Cuna Colecho", "qty": 1}])
    db.add(sc)
    db.commit()
    sc_id = sc.id
    resumen = ta.correr_una_vez(ahora=ahora)
    purga = resumen["purga_papelera"]
    assert "error" not in purga, purga
    assert "SC-T10P01" in purga["numeros"] and purga["purgadas"] == len(purga["numeros"])
    db.expire_all()
    assert db.get(CustomerRequest, sc_id) is None
    (renglon,) = (db.query(ActivityLog)
                  .filter(ActivityLog.entity_type == "SC", ActivityLog.entity_id == sc_id,
                          ActivityLog.action == "PURGED").all())
    assert (renglon.entity_numero, renglon.user_name) == ("SC-T10P01", "Sistema")
    assert _valor(db, "tareas_ultima_revision") == "2001-03-01T12:00:00Z"


def test_resumen_largo_se_guarda_como_json_valido(db, monkeypatch):
    """El resumen guardado cabe en 2000 caracteres y sigue siendo JSON: las listas largas se recortan."""
    ta = _ta()
    monkeypatch.setattr(ta, "TAREAS", [("purga_larga", f"{__name__}:_tarea_con_resumen_largo")])
    resumen = ta.correr_una_vez(ahora=datetime.datetime(2026, 10, 5, 14, 0))
    assert len(resumen["purga_larga"]["numeros"]) == 400  # lo que devuelve correr_una_vez no se recorta
    guardado = _valor(db, "tareas_ultimo_resumen")
    assert len(guardado) <= 2000
    datos = json.loads(guardado)
    assert datos["purga_larga"]["purgadas"] == 400
    assert datos["purga_larga"]["numeros"] == [f"SC-2026{i:04d}" for i in range(10)]


# ─── el candado ───────────────────────────────────────────────────────────────────────────────────────────────────

def test_segunda_copia_no_toma_el_turno(db, monkeypatch):
    """Prueba 4: si otra copia tiene el candado, correr_una_vez no corre ninguna tarea ni marca la revisión."""
    import app.db.database as dbmod
    ta = _ta()
    assert ta.CLAVE_LOCK == 7420016
    _LLAMADAS.clear()
    monkeypatch.setattr(ta, "TAREAS", [("buena", f"{__name__}:_tarea_ok")])
    antes = _valor(db, "tareas_ultima_revision")
    otra = dbmod.engine.connect()
    try:
        assert otra.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": ta.CLAVE_LOCK}).scalar() is True
        assert ta.correr_una_vez() == {"omitido": "otra_copia_revisando"}
        assert _LLAMADAS == []
        assert _valor(db, "tareas_ultima_revision") == antes
    finally:
        otra.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": ta.CLAVE_LOCK})
        otra.close()
    assert _candado_libre(ta.CLAVE_LOCK) is True


def test_el_candado_se_suelta_siempre(db, monkeypatch, registros_de_log):
    """El candado se suelta aunque una tarea falle o correr_una_vez se caiga. Si el unlock falla, la conexión se
    invalida (cerrar la conexión física lo suelta) en vez de volver al pool con el candado tomado."""
    import app.db.database as dbmod
    ta = _ta()
    monkeypatch.setattr(ta, "TAREAS", [("mala", f"{__name__}:_tarea_que_falla")])
    assert ta.correr_una_vez() == {"mala": {"error": "RuntimeError"}}
    assert _candado_libre(ta.CLAVE_LOCK) is True

    def sesion_que_no_abre():
        raise RuntimeError("no hay sesión")

    def marcar_que_falla(db, ahora, resumen):
        raise RuntimeError("no se pudo escribir admin_config")

    monkeypatch.setattr(ta, "_marcar_revision", marcar_que_falla)
    assert ta.correr_una_vez() == {"mala": {"error": "RuntimeError"}}  # el resumen se devuelve igual
    assert any("hora de la revisión" in r.getMessage() for r in registros_de_log if r.levelno >= logging.ERROR)
    assert _candado_libre(ta.CLAVE_LOCK) is True

    monkeypatch.setattr(dbmod, "SessionLocal", sesion_que_no_abre)
    with pytest.raises(RuntimeError):
        ta.correr_una_vez()
    assert _candado_libre(ta.CLAVE_LOCK) is True

    class ConexionRota:
        def __init__(self, falla_al_ejecutar=True):
            self.falla_al_ejecutar = falla_al_ejecutar
            self.eventos = []

        def execute(self, *args, **kwargs):
            self.eventos.append("execute")
            if self.falla_al_ejecutar:
                raise RuntimeError("se cayó la conexión")

        def commit(self):
            self.eventos.append("commit")

        def invalidate(self):
            self.eventos.append("invalidate")

        def close(self):
            self.eventos.append("close")

    rota = ConexionRota()
    ta._soltar_turno(rota)  # no lanza
    assert rota.eventos == ["execute", "invalidate", "close"]
    ta._soltar_turno(None)
    ta._soltar_turno(ta.SIN_LOCK)

    class MotorFalso:
        def __init__(self, nombre, conexion=None):
            self.dialect = type("Dialecto", (), {"name": nombre})()
            self.conexion = conexion

        def connect(self):
            return self.conexion

    assert ta._tomar_turno(MotorFalso("sqlite")) == ta.SIN_LOCK  # SQLite local: un solo proceso, sin candado
    rota = ConexionRota()
    with pytest.raises(RuntimeError):
        ta._tomar_turno(MotorFalso("postgresql", rota))
    assert rota.eventos == ["execute", "close"]  # si el SELECT falla, la conexión no se queda abierta


# ─── el bucle y main.py (sin hilos ni tareas vivas) ───────────────────────────────────────────────────────────────

def test_bucle_espera_sigue_tras_un_error_y_se_cancela(monkeypatch, registros_de_log):
    """La primera vuelta es a los 60 s; luego intervalo + 0-30 s. Un error de correr_una_vez queda en el log y el
    bucle sigue; la cancelación (apagar el servidor) sí sale del bucle. Sueño y hilo falsos: no se crea ningún hilo."""
    import anyio.to_thread
    ta = _ta()
    esperas, vueltas = [], []

    async def dormir(segundos):
        esperas.append(segundos)
        if len(esperas) == 3:
            raise asyncio.CancelledError()

    async def en_el_hilo(funcion, *args, **kwargs):
        return funcion(*args)

    def correr_falso():
        vueltas.append(1)
        if len(vueltas) == 1:
            raise RuntimeError("la base no respondió")
        return {}

    monkeypatch.setenv("NEBULAE_TAREAS_INTERVALO_SEG", "120")
    monkeypatch.setattr(ta, "_dormir", dormir)
    monkeypatch.setattr(anyio.to_thread, "run_sync", en_el_hilo)
    monkeypatch.setattr(ta, "correr_una_vez", correr_falso)
    with pytest.raises(asyncio.CancelledError):
        asyncio.run(ta.bucle())
    assert len(vueltas) == 2
    assert esperas[0] == 60
    assert 120 <= esperas[1] <= 150 and 120 <= esperas[2] <= 150
    errores = [r for r in registros_de_log if r.levelno >= logging.ERROR]
    assert len(errores) == 1 and errores[0].exc_info


def test_main_arranca_el_bucle_despues_del_preflight_y_lo_detiene(monkeypatch):
    """main.py: iniciar_tareas_automaticas va DESPUÉS de startup_preflight; con debe_iniciar() en False (aquí pytest
    está cargado) no crea nada; con True crea la tarea y detener_tareas_automaticas la cancela."""
    import main
    ta = _ta()
    inicio = [h.__name__ for h in main.app.router.on_startup]
    assert inicio.index("startup_preflight") < inicio.index("iniciar_tareas_automaticas")
    assert "detener_tareas_automaticas" in [h.__name__ for h in main.app.router.on_shutdown]

    async def arrancar():
        await main.iniciar_tareas_automaticas()
        return getattr(main.app.state, "tareas_bucle", None)

    try:
        monkeypatch.setattr(sys, "argv", ["uvicorn", "main:app"])
        for clave, valor in ENV_PRODUCCION.items():
            monkeypatch.setenv(clave, valor)
        monkeypatch.setattr(ta, "_nombre_de_la_base", lambda: "erpdb")
        assert asyncio.run(arrancar()) is None  # pytest cargado: no arranca

        cancelado = []

        async def bucle_falso():
            try:
                await asyncio.Event().wait()
            except asyncio.CancelledError:
                cancelado.append(True)
                raise

        monkeypatch.setattr(ta, "debe_iniciar", lambda: True)
        monkeypatch.setattr(ta, "bucle", bucle_falso)

        async def arrancar_y_detener():
            tarea = await arrancar()
            await asyncio.sleep(0)
            assert tarea is not None and not tarea.done()
            await main.detener_tareas_automaticas()
            return tarea

        tarea = asyncio.run(arrancar_y_detener())
        assert tarea.cancelled() and cancelado == [True]
        assert getattr(main.app.state, "tareas_bucle", None) is None
        asyncio.run(main.detener_tareas_automaticas())  # sin bucle: no hace nada
    finally:
        main.app.state.tareas_bucle = None


# ─── endpoints ────────────────────────────────────────────────────────────────────────────────────────────────────

def test_revisar_ahora(app_client, db, admin_token, vendedor_token, user_admin, monkeypatch):
    """Prueba 5: 409 con el mensaje exacto si la revisión está apagada (variable, ambiente o base de pruebas); 403 para
    quien no es administrador; 202 con las dos variables y una base de producción (la revisión va en segundo plano,
    que TestClient corre). El rastro en el log lleva el autor de la sesión (RP15), no un user_name del body."""
    from _registro_capturado import registro_capturado
    from app.api.v1 import erp_ventas
    from app.core.textos_actividad import nombre_de_usuario
    ta = _ta()
    llamadas = []

    def correr_falso(*args, **kwargs):
        llamadas.append((args, kwargs))
        return {}

    monkeypatch.setattr(ta, "correr_una_vez", correr_falso)
    monkeypatch.setattr(ta, "_nombre_de_la_base", lambda: "erpdb")
    monkeypatch.setenv("NEBULAE_ENV", "production")
    url = "/api/v1/ventas/tareas/revisar-ahora"

    monkeypatch.setenv("NEBULAE_TAREAS_AUTOMATICAS", "0")
    resp = app_client.post(url, headers=auth(admin_token))
    assert resp.status_code == 409, resp.text
    assert resp.json()["detail"] == MENSAJE_APAGADA

    monkeypatch.setenv("NEBULAE_TAREAS_AUTOMATICAS", "1")
    resp = app_client.post(url, headers=auth(vendedor_token))
    assert resp.status_code == 403, resp.text

    monkeypatch.setenv("NEBULAE_ENV", "development")
    resp = app_client.post(url, headers=auth(admin_token))
    assert resp.status_code == 409 and resp.json()["detail"] == MENSAJE_APAGADA
    monkeypatch.setenv("NEBULAE_ENV", "production")

    monkeypatch.setattr(ta, "_nombre_de_la_base", lambda: "erp_test")  # un equipo de prueba nunca revisa
    resp = app_client.post(url, headers=auth(admin_token))
    assert resp.status_code == 409 and resp.json()["detail"] == MENSAJE_APAGADA
    monkeypatch.setattr(ta, "_nombre_de_la_base", lambda: "erpdb")
    assert llamadas == []

    nivel = erp_ventas.logger.level
    erp_ventas.logger.setLevel(logging.INFO)  # el rastro es INFO
    try:
        with registro_capturado(erp_ventas.logger.name) as registros:
            resp = app_client.post(url, headers=auth(admin_token), json={"user_name": "otro@impostor"})
    finally:
        erp_ventas.logger.setLevel(nivel)
    assert resp.status_code == 202, resp.text
    assert resp.json() == {"status": "success", "message": "Revisión iniciada"}
    assert len(llamadas) == 1
    mensajes = [r.getMessage() for r in registros]
    assert any(nombre_de_usuario(user_admin) in m for m in mensajes), mensajes
    assert not any("otro@impostor" in m for m in mensajes)


def test_estado_lo_leen_todos(app_client, db, admin_token, vendedor_token, monkeypatch):
    """Prueba 6 y RP30: GET /ventas/tareas/estado lo lee cualquier rol del ERP. activas_en_servidor es
    tareas_habilitadas(): True con las dos variables y una base de producción aunque pytest esté cargado; False en
    erp_test. El resumen se lee con json.loads seguro."""
    from app.core.admin_config import guardar_config
    ta = _ta()
    url = "/api/v1/ventas/tareas/estado"
    for clave, valor in ENV_PRODUCCION.items():
        monkeypatch.setenv(clave, valor)
    monkeypatch.delenv("NEBULAE_TAREAS_INTERVALO_SEG", raising=False)
    guardar_config(db, {"tareas_ultima_revision": None, "tareas_ultimo_resumen": None})
    db.commit()

    resp = app_client.get(url, headers=auth(vendedor_token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["data"] == {"activas_en_servidor": False, "intervalo_min": 10, "ultima_revision": None,
                                   "resumen": None}  # erp_test: apagada aunque estén las dos variables

    monkeypatch.setattr(ta, "_nombre_de_la_base", lambda: "erpdb")
    assert "pytest" in sys.modules
    monkeypatch.setenv("NEBULAE_TAREAS_INTERVALO_SEG", "120")
    resumen = {"purga_papelera": {"purgadas": 0, "numeros": []}}
    guardar_config(db, {"tareas_ultima_revision": "2026-10-05T14:00:00Z",
                        "tareas_ultimo_resumen": json.dumps(resumen)})
    db.commit()
    for token in (vendedor_token, admin_token):
        resp = app_client.get(url, headers=auth(token))
        assert resp.status_code == 200, resp.text
        assert resp.json()["data"] == {"activas_en_servidor": True, "intervalo_min": 2,
                                       "ultima_revision": "2026-10-05T14:00:00Z", "resumen": resumen}

    for roto in ('{"purga_papelera": ', "[1, 2]", "no es json"):
        guardar_config(db, {"tareas_ultimo_resumen": roto})
        db.commit()
        resp = app_client.get(url, headers=auth(vendedor_token))
        assert resp.status_code == 200 and resp.json()["data"]["resumen"] is None, roto

    monkeypatch.setenv("NEBULAE_TAREAS_AUTOMATICAS", "0")
    resp = app_client.get(url, headers=auth(vendedor_token))
    assert resp.json()["data"]["activas_en_servidor"] is False
    assert app_client.get(url).status_code in (401, 403)


def test_update_config_rechaza_claves_del_sistema(app_client, db, admin_token):
    """Prueba 7 (C23, RP18): tareas_* es reservada en /ventas/config. PATCH -> 422 «Ese valor lo escribe el sistema.»,
    todo o nada; GET /config no la muestra ni al administrador."""
    from app.core.admin_config import guardar_config
    url = "/api/v1/ventas/config"
    for clave in ("tareas_ultima_revision", "tareas_ultimo_resumen", "tareas_cualquiera"):
        resp = app_client.patch(url, json={clave: "x"}, headers=auth(admin_token))
        assert resp.status_code == 422, (clave, resp.text)
        assert resp.json()["detail"] == MENSAJE_CLAVES_DEL_SISTEMA
    antes = _valor(db, "alerta_sc_dias")
    resp = app_client.patch(url, json={"alerta_sc_dias": "9", "tareas_ultima_revision": "x"}, headers=auth(admin_token))
    assert resp.status_code == 422 and resp.json()["detail"] == MENSAJE_CLAVES_DEL_SISTEMA
    assert _valor(db, "alerta_sc_dias") == antes
    assert _valor(db, "tareas_ultima_revision") != "x"

    guardar_config(db, {"tareas_ultima_revision": "2026-10-05T14:00:00Z"})
    db.commit()
    resp = app_client.get(url, headers=auth(admin_token))
    assert resp.status_code == 200, resp.text
    assert not [clave for clave in resp.json()["data"] if clave.startswith("tareas_")]
