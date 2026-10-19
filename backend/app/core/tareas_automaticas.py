"""Revisión automática cada 10 minutos dentro del proceso del backend (Bloque 3, T10, TAREAS).

Qué hace: un bucle asyncio (bucle()) que cada intervalo_seg() corre correr_una_vez() en un hilo. correr_una_vez toma un
candado de Postgres (pg_try_advisory_lock(CLAVE_LOCK)) y corre las tareas de TAREAS una por una; deja en admin_config la
hora de la revisión (tareas_ultima_revision, UTC con 'Z') y un resumen corto (tareas_ultimo_resumen, JSON). Lo lee
GET /ventas/tareas/estado y lo muestra Configuración del Hub de Ventas.

El candado da EXCLUSIÓN MUTUA, no una revisión por intervalo: con varias copias del backend (uvicorn --workers 2, o
varios contenedores) nunca corren dos revisiones a la vez, pero cada copia tiene su propio bucle y, como una revisión
dura segundos, suelen correr dos revisiones seguidas cada ~10 min (una por copia). «Revisar ahora» agrega otra en
cualquier momento. Por eso el contrato de TAREAS (abajo) exige tareas idempotentes.

CUÁNDO SE ENCIENDE (R14). Solo en el servidor de producción, y en uno solo:
- NEBULAE_TAREAS_AUTOMATICAS=1 va SOLO en el entorno de producción, que ya tiene NEBULAE_ENV=production: el
  .env.production del servidor Windows (launch_production.py / nebulae_service_wrapper.py) o las variables de EasyPanel
  si corre en Docker. NUNCA en backend/.env: database.py hace load_dotenv() al importarse, y esa variable encendería la
  revisión contra erp_test, que puede escribirle a clientes (recordatorios de U16-seguimiento).
- NEBULAE_TAREAS_INTERVALO_SEG (opcional): segundos entre vueltas; 600 por defecto, de 60 a 3600.
- tareas_habilitadas() exige las dos variables Y una base que no sea de pruebas (su nombre no contiene test, staging, dev
  ni qa, comparado por subcadena, como la salvaguarda de conftest.py y del runner: 'erpdb' pasa, 'latest' no). Es lo que
  informa /tareas/estado (RP30) y lo que exige «Revisar ahora» (409 si no).
- debe_iniciar() exige además que 'pytest' no esté cargado (conftest usa `with TestClient(app)`, que dispara el startup)
  y que uvicorn no corra con --reload ni UVICORN_RELOAD (el proceso que recarga hereda el argv del que vigila). Así, si
  por error las variables quedan en un .env de desarrollo, ni el runner, ni pytest, ni un uvicorn --reload, ni una base
  erp_test arrancan el bucle. Lo mitigan además seguimiento_auto_activo y que sin SMTP ni plantillas no sale nada.
- Si NEBULAE_TAREAS_AUTOMATICAS=1 y el proceso no arranca el bucle, anotar_por_que_no_arranca deja un WARNING con el
  motivo (motivo_para_no_iniciar).

CONTRATO DE TAREAS. Cada tarea es (nombre, 'modulo:funcion'), resuelta con importlib al correr (evita el import circular
con erp_ventas), con la firma fn(db: Session, ahora: datetime) -> dict; `ahora` es UTC sin zona.
- (a) IDEMPOTENTE entre dos corridas seguidas: con varios workers y con «Revisar ahora» puede correr dos veces en poco
  tiempo. La segunda corrida no puede repetir lo que hizo la primera (por ejemplo, un recordatorio ya enviado): el
  estado por documento lo guarda la tarea, y lo deja firme antes de terminar.
- (b) Lo que DEVUELVE lo ve cualquier rol del ERP en /tareas/estado: solo conteos y números de documento; nunca nombres,
  teléfonos, correos ni textos de error. Como red de seguridad, _resumen_para_guardar guarda solo enteros, booleanos,
  textos de hasta 40 caracteres y listas de esos valores, con claves que sean nombres de campo, y el {'error': tipo}.
- (c) Sus consultas van por índice y con LIMIT (el statement_timeout del motor es de 15 s).
- correr_una_vez confirma DESPUÉS DE CADA TAREA (requisito del controlador): una tarea que falla hace rollback solo de lo
  suyo, queda en el log y con {'error': <tipo>} en el resumen, y no frena a las demás.

El candado vive en una conexión DEDICADA (no en la Session de trabajo, que cambia de conexión entre commits) y es de
sesión: se suelta siempre en el finally; si el unlock falla, o si _tomar_turno falla después de pedirlo, la conexión se
invalida (Postgres lo suelta al cerrarla) en vez de volver al pool con el candado tomado. Si el proceso muere, Postgres
lo suelta solo. Mientras dura la revisión, el candado ocupa una conexión del pool. revision_en_curso() mira pg_locks
para saber si alguna copia lo tiene. La clave es un bigint fijo en el mismo espacio que los pg_advisory_xact_lock(
hashtext(...)) del resto del backend: una colisión solo haría esperar o saltar una vuelta (anotado en la revisión).

LOG. El módulo escribe en un logger hijo de 'uvicorn.error': uvicorn le pone handler y nivel INFO, así que el arranque,
el motivo del apagado, «Revisar ahora» y los errores de una tarea se ven en el log de producción (la app no llama
basicConfig y la raíz queda en WARNING: un INFO de 'app.*' se perdería).

Sin FastAPI. engine y SessionLocal se piden por atributo de app.db.database, para que el runner de ROLLBACK los parchee.
"""
import asyncio
import importlib
import json
import logging
import os
import random
import sys

from anyio import to_thread
from sqlalchemy import text

import app.db.database as dbmod
from app.core.admin_config import entero_acotado, guardar_config
from app.core.fechas import ahora_utc, iso_z

# Hijo de 'uvicorn.error' (r1): bajo uvicorn hereda su handler y su nivel INFO, y se ve en el log de producción. Lo usan
# también main.py (arranque) y erp_ventas.py (rastro de «Revisar ahora»).
logger = logging.getLogger("uvicorn.error.tareas_automaticas")

# Clave fija del candado de Postgres (pg_try_advisory_lock). La usa solo esta revisión; no la cambies: dos versiones del
# backend con claves distintas revisarían a la vez.
CLAVE_LOCK = 7420016
SIN_LOCK = "SIN_LOCK"  # el turno en una base que no es Postgres (SQLite local: un solo proceso)

VARIABLE_ACTIVAS = "NEBULAE_TAREAS_AUTOMATICAS"
VARIABLE_INTERVALO = "NEBULAE_TAREAS_INTERVALO_SEG"
INTERVALO_POR_DEFECTO_SEG = 600
INTERVALO_MINIMO_SEG = 60
INTERVALO_MAXIMO_SEG = 3600
PRIMERA_VUELTA_SEG = 60  # la primera revisión, un minuto después de arrancar
AZAR_MAXIMO_SEG = 30  # 0-30 s al azar al final de cada vuelta, para que las copias no despierten juntas

# admin_config: claves que escribe solo el sistema. /ventas/config reserva el prefijo (RP18) y no las muestra.
PREFIJO_CLAVES = "tareas_"
CLAVE_ULTIMA_REVISION = "tareas_ultima_revision"
CLAVE_ULTIMO_RESUMEN = "tareas_ultimo_resumen"
LARGO_MAXIMO_RESUMEN = 2000
ELEMENTOS_POR_LISTA_EN_RESUMEN = 10
LARGO_MAXIMO_TEXTO_EN_RESUMEN = 40  # r1: un texto más largo puede ser un nombre o un mensaje: no se guarda

# Marcas del nombre de una base de pruebas (las mismas de la salvaguarda de conftest.py y tests/rollback_runner.py).
MARCAS_BASE_DE_PRUEBAS = ("test", "staging", "dev", "qa")
_VERDADEROS_DE_UVICORN = ("1", "true", "t", "yes", "y", "on")

# Registro fijo de tareas, en orden. T11 agrega al final ('seguimiento_confirmacion',
# 'app.core.seguimiento_confirmacion:correr_seguimientos').
# CONTRATO (ver el docstring del módulo): fn(db, ahora) -> dict; (a) idempotente entre dos corridas seguidas (varios
# workers, «Revisar ahora»); (b) devuelve solo conteos y números de documento, porque lo ve cualquier rol en
# /tareas/estado: nunca nombres, teléfonos, correos ni textos de error; (c) consultas por índice y con LIMIT.
TAREAS = [
    # RP7 (B2.1-D2): la purga de la Papelera, la misma de POST /papelera/purgar, con el autor por defecto «Sistema».
    ("purga_papelera", "app.api.v1.erp_ventas:purgar_papelera_vencida"),
]


def _nombre_de_la_base() -> str:
    """El nombre de la base a la que apunta el motor del proceso (por ejemplo 'erpdb' o 'erp_test'). Solo el nombre:
    nunca la URL, que lleva el usuario y la clave."""
    return dbmod.engine.url.database or ""


def es_base_de_pruebas(nombre: str) -> bool:
    """True si el nombre de la base es de pruebas (contiene test, staging, dev o qa, por subcadena) o no se conoce."""
    nombre = (nombre or "").lower()
    return not nombre or any(marca in nombre for marca in MARCAS_BASE_DE_PRUEBAS)


def _motivo_del_servidor(env, base):
    """Por qué la revisión está apagada en este servidor (R14), o None si está encendida."""
    if (env.get(VARIABLE_ACTIVAS) or "").strip() != "1":
        return f"{VARIABLE_ACTIVAS} no vale 1"
    ambiente = (env.get("NEBULAE_ENV") or "").strip()
    if ambiente != "production":
        return f"el ambiente es '{ambiente}', no production"
    base = _nombre_de_la_base() if base is None else base
    if es_base_de_pruebas(base):
        return f"la base '{base}' parece de pruebas"
    return None


def tareas_habilitadas(env=None, base=None) -> bool:
    """R14: la revisión está encendida en este servidor. Exige NEBULAE_TAREAS_AUTOMATICAS == '1' (sin espacios de los
    bordes), NEBULAE_ENV == 'production' y una base de producción. `env` es os.environ y `base`, la del motor, si no se
    pasan. No mira pytest ni --reload: eso es de debe_iniciar (lo que informa /tareas/estado, RP30)."""
    return _motivo_del_servidor(os.environ if env is None else env, base) is None


def _con_recarga(argv, env) -> bool:
    """uvicorn --reload (o UVICORN_RELOAD, la variable que lee su línea de comandos)."""
    return "--reload" in argv or (env.get("UVICORN_RELOAD") or "").strip().lower() in _VERDADEROS_DE_UVICORN


def motivo_para_no_iniciar(env=None, modulos=None, argv=None, base=None):
    """Por qué este proceso no arranca el bucle (el primero que aplique), o None si debe arrancarlo: el de
    tareas_habilitadas(env, base), 'pytest' en `modulos` (sys.modules) o uvicorn con recarga (`argv` = sys.argv, que el
    proceso que recarga hereda del que vigila). Del motivo de la base sale solo su nombre."""
    env = os.environ if env is None else env
    modulos = sys.modules if modulos is None else modulos
    argv = sys.argv if argv is None else argv
    motivo = _motivo_del_servidor(env, base)
    if motivo:
        return motivo
    if "pytest" in modulos:
        return "pytest está cargado"
    if _con_recarga(argv, env):
        return "uvicorn corre con recarga (--reload)"
    return None


def debe_iniciar(env=None, modulos=None, argv=None, base=None) -> bool:
    """R14: este proceso arranca el bucle (motivo_para_no_iniciar(...) es None)."""
    return motivo_para_no_iniciar(env, modulos, argv, base) is None


def anotar_por_que_no_arranca(env=None, modulos=None, argv=None, base=None) -> None:
    """r1: lo que main.py deja en el log cuando no arranca el bucle. Si NEBULAE_TAREAS_AUTOMATICAS vale '1' (alguien la
    quiso encendida), un WARNING con el motivo, visible en producción; si no, un INFO."""
    env = os.environ if env is None else env
    motivo = motivo_para_no_iniciar(env, modulos, argv, base)
    if (env.get(VARIABLE_ACTIVAS) or "").strip() == "1" and motivo:
        logger.warning("Tareas automáticas apagadas en este proceso aunque %s=1: %s", VARIABLE_ACTIVAS, motivo)
    else:
        logger.info("Tareas automáticas apagadas en este proceso")


def intervalo_seg(env=None) -> int:
    """Segundos entre revisiones: NEBULAE_TAREAS_INTERVALO_SEG, por defecto 600, acotado a [60, 3600]; un valor que no
    es un entero da 600."""
    env = os.environ if env is None else env
    return entero_acotado(env.get(VARIABLE_INTERVALO), INTERVALO_POR_DEFECTO_SEG, INTERVALO_MINIMO_SEG,
                          INTERVALO_MAXIMO_SEG)


def _tomar_turno(engine):
    """El candado de la revisión en una conexión dedicada, o None si otra copia lo tiene. En una base que no es Postgres
    devuelve SIN_LOCK. El candado es de sesión: sobrevive al commit que cierra la transacción del SELECT (así la conexión
    no queda «idle in transaction» mientras corren las tareas)."""
    if engine.dialect.name != "postgresql":
        return SIN_LOCK
    conn = engine.connect()
    try:
        ok = conn.execute(text("SELECT pg_try_advisory_lock(:k)"), {"k": CLAVE_LOCK}).scalar()
        conn.commit()
    except Exception:
        # r1: si el candado ya se concedió (falló el commit), la conexión no puede volver al pool con él tomado:
        # invalidarla cierra la conexión física y Postgres lo suelta. Igual que _soltar_turno.
        try:
            conn.invalidate()
        finally:
            conn.close()
        raise
    if not ok:
        conn.close()
        return None
    return conn


_SQL_CANDADO_TOMADO = text(
    "SELECT count(*) FROM pg_locks WHERE locktype = 'advisory' AND objsubid = 1 "
    "AND classid = CAST(:alto AS oid) AND objid = CAST(:bajo AS oid) "
    "AND database = (SELECT oid FROM pg_database WHERE datname = current_database())")


def revision_en_curso(engine=None) -> bool:
    """r1: True si alguna copia (este u otro proceso) tiene ahora el candado de la revisión. Mira pg_locks y no usa
    pg_try_advisory_lock: no lo toma, y una conexión del pool que ya lo tuviera lo volvería a «tomar» (es reentrante).
    Un bigint k va en classid = k >> 32, objid = k & 0xFFFFFFFF, objsubid = 1. En una base que no es Postgres, False.
    Lo usa «Revisar ahora» para avisar en vez de agregar otra revisión (puede haber carrera: es solo un aviso)."""
    engine = dbmod.engine if engine is None else engine
    if engine.dialect.name != "postgresql":
        return False
    with engine.connect() as conn:
        tomados = conn.execute(_SQL_CANDADO_TOMADO,
                               {"alto": CLAVE_LOCK >> 32, "bajo": CLAVE_LOCK & 0xFFFFFFFF}).scalar()
    return tomados > 0


def _soltar_turno(turno) -> None:
    """Suelta el candado y cierra su conexión. Si el unlock falla, invalida la conexión: cerrar la conexión física suelta
    el candado, y así no vuelve al pool con el candado tomado (bloquearía todas las revisiones siguientes)."""
    if turno is None or turno == SIN_LOCK:
        return
    try:
        soltado = turno.execute(text("SELECT pg_advisory_unlock(:k)"), {"k": CLAVE_LOCK}).scalar()
        turno.commit()
        if not soltado:
            logger.warning("La revisión automática no tenía el candado %s al soltarlo", CLAVE_LOCK)
    except Exception:
        logger.exception("No se pudo soltar el candado de la revisión automática; se cierra su conexión")
        turno.invalidate()
    finally:
        turno.close()


def _resolver(ruta: str):
    """'modulo:funcion' -> la función (importlib al correr, para no importar erp_ventas al cargar este módulo)."""
    modulo, _, funcion = ruta.partition(":")
    return getattr(importlib.import_module(modulo), funcion)


def _valor_publicable(valor) -> bool:
    """Un entero, un booleano o un texto de hasta LARGO_MAXIMO_TEXTO_EN_RESUMEN caracteres (contrato (b) de TAREAS)."""
    if isinstance(valor, (bool, int)):
        return True
    return isinstance(valor, str) and len(valor) <= LARGO_MAXIMO_TEXTO_EN_RESUMEN


def _resultado_publicable(resultado) -> dict:
    """r1 (contrato (b) de TAREAS): lo que se guarda del resultado de una tarea, que /tareas/estado muestra a todos los
    roles. Pasan las claves que son nombres de campo (identificadores ASCII de hasta 40 caracteres) con un valor
    publicable o una lista de valores publicables; 'error' solo con el nombre de un tipo ({'error': 'RuntimeError'}).
    Lo demás (un dict anidado, un decimal, un texto largo, una clave con espacios o con letras fuera de ASCII, como un
    nombre con tildes) se descarta; un resultado que no es dict da {}."""
    if not isinstance(resultado, dict):
        return {}
    publicable = {}
    for clave, valor in resultado.items():
        if not (isinstance(clave, str) and clave.isascii() and clave.isidentifier()
                and len(clave) <= LARGO_MAXIMO_TEXTO_EN_RESUMEN):
            continue
        if clave == "error":
            if isinstance(valor, str) and valor.isidentifier():
                publicable[clave] = valor
        elif _valor_publicable(valor) or (isinstance(valor, list) and all(_valor_publicable(v) for v in valor)):
            publicable[clave] = valor
    return publicable


def _resumen_para_guardar(resumen: dict) -> str:
    """El resumen en JSON de hasta LARGO_MAXIMO_RESUMEN caracteres, siempre válido y solo con lo publicable de cada
    tarea (_resultado_publicable): si no cabe, cada lista se recorta a sus primeros ELEMENTOS_POR_LISTA_EN_RESUMEN
    elementos (los números de una purga grande); si aun así no cabe, {'recortado': true}."""
    resumen = {nombre: _resultado_publicable(resultado) for nombre, resultado in resumen.items()}
    texto = json.dumps(resumen, ensure_ascii=False, default=str)
    if len(texto) <= LARGO_MAXIMO_RESUMEN:
        return texto
    corto = {nombre: ({clave: valor[:ELEMENTOS_POR_LISTA_EN_RESUMEN] if isinstance(valor, list) else valor
                       for clave, valor in resultado.items()} if isinstance(resultado, dict) else resultado)
             for nombre, resultado in resumen.items()}
    texto = json.dumps(corto, ensure_ascii=False, default=str)
    return texto if len(texto) <= LARGO_MAXIMO_RESUMEN else json.dumps({"recortado": True})


def _marcar_revision(db, ahora, resumen: dict) -> None:
    """Deja en admin_config la hora de la revisión (UTC con 'Z') y su resumen, con guardar_config (RP17). Sin commit."""
    guardar_config(db, {CLAVE_ULTIMA_REVISION: iso_z(ahora), CLAVE_ULTIMO_RESUMEN: _resumen_para_guardar(resumen)})


def correr_una_vez(ahora=None) -> dict:
    """Una revisión: toma el turno, corre cada tarea de TAREAS confirmando después de cada una, marca la revisión y
    suelta el turno. Devuelve {nombre: resultado}, o {'omitido': 'otra_copia_revisando'} si otra copia tiene el turno.

    Una tarea que falla: rollback (solo lo suyo, porque lo de las anteriores ya se confirmó), log con el traceback y
    {'error': <tipo>} en el resumen; las demás siguen. Si no se puede marcar la revisión, queda en el log y la hora vieja
    sigue en Configuración (que avisa en ámbar si se atrasa). El turno se suelta siempre."""
    ahora = ahora or ahora_utc()
    turno = _tomar_turno(dbmod.engine)
    if turno is None:
        logger.info("Revisión automática omitida: otra copia está revisando")
        return {"omitido": "otra_copia_revisando"}
    try:
        db = dbmod.SessionLocal()
        try:
            resumen = {}
            for nombre, ruta in list(TAREAS):
                try:
                    resultado = _resolver(ruta)(db, ahora)
                    db.commit()
                except Exception as e:
                    db.rollback()
                    logger.exception("La tarea automática %s falló", nombre)
                    resultado = {"error": type(e).__name__}
                resumen[nombre] = resultado
            try:
                _marcar_revision(db, ahora, resumen)
                db.commit()
            except Exception:
                db.rollback()
                logger.exception("No se pudo guardar la hora de la revisión automática")
            return resumen
        finally:
            db.close()
    finally:
        _soltar_turno(turno)


async def _dormir(segundos) -> None:
    await asyncio.sleep(segundos)


async def bucle() -> None:
    """El bucle de la revisión: la primera vuelta a los PRIMERA_VUELTA_SEG del arranque y luego cada intervalo_seg() más
    0-30 s al azar. correr_una_vez va en un hilo (anyio) para no frenar el servidor. Un error queda en el log y el bucle
    sigue; solo la cancelación (al apagar el servidor) lo termina. Si la cancelación llega a mitad de una revisión, el
    hilo la termina y suelta el candado."""
    await _dormir(PRIMERA_VUELTA_SEG)
    while True:
        try:
            await to_thread.run_sync(correr_una_vez)
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("La revisión automática falló")
        await _dormir(intervalo_seg() + random.randint(0, AZAR_MAXIMO_SEG))
