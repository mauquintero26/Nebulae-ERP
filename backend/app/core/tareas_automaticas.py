"""Revisión automática cada 10 minutos dentro del proceso del backend (Bloque 3, T10, TAREAS).

Qué hace: un bucle asyncio (bucle()) que cada intervalo_seg() corre correr_una_vez() en un hilo. correr_una_vez toma un
candado de Postgres (pg_try_advisory_lock(CLAVE_LOCK)) para que, con varias copias del backend (uvicorn --workers 2, o
varios contenedores), una sola revise en cada vuelta; corre las tareas de TAREAS una por una y deja en admin_config la
hora de la revisión (tareas_ultima_revision, UTC con 'Z') y un resumen corto (tareas_ultimo_resumen, JSON). Lo lee
GET /ventas/tareas/estado y lo muestra Configuración del Hub de Ventas.

CUÁNDO SE ENCIENDE (R14). Solo en el servidor de producción, y en uno solo:
- NEBULAE_TAREAS_AUTOMATICAS=1 va SOLO en el entorno de producción, que ya tiene NEBULAE_ENV=production: el
  .env.production del servidor Windows (launch_production.py / nebulae_service_wrapper.py) o las variables de EasyPanel
  si corre en Docker. NUNCA en backend/.env: database.py hace load_dotenv() al importarse, y esa variable encendería la
  revisión contra erp_test, que puede escribirle a clientes (recordatorios de U16-seguimiento).
- NEBULAE_TAREAS_INTERVALO_SEG (opcional): segundos entre vueltas; 600 por defecto, de 60 a 3600.
- tareas_habilitadas() exige las dos variables Y una base que no sea de pruebas (su nombre no tiene test, staging, dev ni
  qa, como la salvaguarda de conftest.py y del runner). Es lo que informa /tareas/estado (RP30) y lo que exige
  «Revisar ahora» (409 si no).
- debe_iniciar() exige además que 'pytest' no esté cargado (conftest usa `with TestClient(app)`, que dispara el startup)
  y que uvicorn no corra con --reload ni UVICORN_RELOAD (el proceso que recarga hereda el argv del que vigila). Así, si
  por error las variables quedan en un .env de desarrollo, ni el runner, ni pytest, ni un uvicorn --reload, ni una base
  erp_test arrancan el bucle. Lo mitigan además seguimiento_auto_activo y que sin SMTP ni plantillas no sale nada.

Cada tarea de TAREAS es (nombre, 'modulo:funcion'), resuelta con importlib al correr (evita el import circular con
erp_ventas), con la firma fn(db: Session, ahora: datetime) -> dict; `ahora` es UTC sin zona. correr_una_vez confirma
DESPUÉS DE CADA TAREA (requisito del controlador): una tarea que falla hace rollback solo de lo suyo, queda en el log
con {'error': <tipo>} en el resumen, y no frena a las demás. Las consultas de una tarea van por índice y con LIMIT (el
statement_timeout del motor es de 15 s).

El candado vive en una conexión DEDICADA (no en la Session de trabajo, que cambia de conexión entre commits) y es de
sesión: se suelta siempre en el finally; si el unlock falla, la conexión se invalida (Postgres lo suelta al cerrarla) en
vez de volver al pool con el candado tomado. Si el proceso muere, Postgres lo suelta solo. Mientras dura la revisión, el
candado ocupa una conexión del pool.

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

logger = logging.getLogger(__name__)

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

# Marcas del nombre de una base de pruebas (las mismas de la salvaguarda de conftest.py y tests/rollback_runner.py).
MARCAS_BASE_DE_PRUEBAS = ("test", "staging", "dev", "qa")
_VERDADEROS_DE_UVICORN = ("1", "true", "t", "yes", "y", "on")

# Registro fijo de tareas, en orden. T11 agrega al final ('seguimiento_confirmacion',
# 'app.core.seguimiento_confirmacion:correr_seguimientos').
TAREAS = [
    # RP7 (B2.1-D2): la purga de la Papelera, la misma de POST /papelera/purgar, con el autor por defecto «Sistema».
    ("purga_papelera", "app.api.v1.erp_ventas:purgar_papelera_vencida"),
]


def _nombre_de_la_base() -> str:
    """El nombre de la base a la que apunta el motor del proceso (por ejemplo 'erpdb' o 'erp_test')."""
    return dbmod.engine.url.database or ""


def es_base_de_pruebas(nombre: str) -> bool:
    """True si el nombre de la base es de pruebas (test, staging, dev o qa) o no se conoce (vacío)."""
    nombre = (nombre or "").lower()
    return not nombre or any(marca in nombre for marca in MARCAS_BASE_DE_PRUEBAS)


def tareas_habilitadas(env=None, base=None) -> bool:
    """R14: la revisión está encendida en este servidor. Exige NEBULAE_TAREAS_AUTOMATICAS == '1' (sin espacios de los
    bordes), NEBULAE_ENV == 'production' y una base de producción. `env` es os.environ y `base`, la del motor, si no se
    pasan. No mira pytest ni --reload: eso es de debe_iniciar (lo que informa /tareas/estado, RP30)."""
    env = os.environ if env is None else env
    if (env.get(VARIABLE_ACTIVAS) or "").strip() != "1":
        return False
    if (env.get("NEBULAE_ENV") or "").strip() != "production":
        return False
    return not es_base_de_pruebas(_nombre_de_la_base() if base is None else base)


def _con_recarga(argv, env) -> bool:
    """uvicorn --reload (o UVICORN_RELOAD, la variable que lee su línea de comandos)."""
    return "--reload" in argv or (env.get("UVICORN_RELOAD") or "").strip().lower() in _VERDADEROS_DE_UVICORN


def debe_iniciar(env=None, modulos=None, argv=None, base=None) -> bool:
    """R14: este proceso arranca el bucle. tareas_habilitadas(env, base), y además 'pytest' no está en `modulos`
    (sys.modules) ni uvicorn corre con recarga (`argv` = sys.argv, que el proceso que recarga hereda del que vigila)."""
    env = os.environ if env is None else env
    modulos = sys.modules if modulos is None else modulos
    argv = sys.argv if argv is None else argv
    return tareas_habilitadas(env, base) and "pytest" not in modulos and not _con_recarga(argv, env)


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
        conn.close()
        raise
    if not ok:
        conn.close()
        return None
    return conn


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


def _resumen_para_guardar(resumen: dict) -> str:
    """El resumen en JSON de hasta LARGO_MAXIMO_RESUMEN caracteres, siempre válido: si no cabe, cada lista de un
    resultado se recorta a sus primeros ELEMENTOS_POR_LISTA_EN_RESUMEN elementos (los números de una purga grande); si
    aun así no cabe, {'recortado': true}."""
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
