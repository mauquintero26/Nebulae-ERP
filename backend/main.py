import asyncio
import logging
import math
from decimal import Decimal

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.exceptions import RequestValidationError
from app.api.v1 import auth, catalog, quotations, inventory, finance, store, crm, sales, purchases, webhooks, marketing, chat, legacy_observability
from app.api.v1 import erp_ventas, erp_ventas_fase4, erp_compras, erp_compras_asignaciones, ecommerce, erp_logistica, erp_inventario
from app.api.v1 import confirmacion_publica  # Gate 1/2 — confirmacion publica de SC/COT por link, sin autenticacion
from app.api.v1 import empresa  # Bloque 3 (MARCA) — datos de la empresa; su router_publico va sin autenticacion
from app.api.v1 import envio_cliente  # Bloque 3 (U16-envio) — WhatsApp automatico por Chatwoot y estado de entrega
from app.api.v1 import whatsapp_webhook  # BLOQUE 5 — Modo Sombra WhatsApp
from app.api.v1 import debug_db  # Hardening — endpoint de verificacion de DB (solo ADMIN)
from app.api import ws
from app.db.database import Base, engine
from app.core.preflight import run_preflight_or_abort  # BLOQUE 5 — Preflight DB check
from app.core import tareas_automaticas  # Bloque 3 (TAREAS) — revision automatica cada 10 minutos, solo en produccion

logger = logging.getLogger(__name__)

# Create tables in DB (for development/testing only, Alembic is preferred)
# Base.metadata.create_all(bind=engine)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Nebulae ERP & CRM API", version="1.0.0")

import os as _os

def _build_cors_origins() -> list[str]:
    """
    Construye la lista de orígenes permitidos por ambiente.
    NUNCA combinar wildcard ('*') con allow_credentials=True (viola RFC 6454,
    browsers lo rechazan con error CORS).
    """
    explicit = _os.environ.get("CORS_ALLOWED_ORIGINS", "").strip()
    if explicit:
        return [o.strip() for o in explicit.split(",") if o.strip()]
    _env = _os.environ.get("NEBULAE_ENV", "development")
    if _env == "production":
        return [
            "https://nebulaekids.com",
            "https://www.nebulaekids.com",
        ]
    elif _env == "staging":
        return [
            "http://localhost:5100",
            "http://127.0.0.1:5100",
            "http://localhost:3000",
        ]
    else:  # development
        return [
            "http://localhost:3000",
            "http://localhost:5100",
            "http://127.0.0.1:5100",
            "http://127.0.0.1:3000",
        ]

_CORS_ORIGINS = _build_cors_origins()

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handler to standardize generic errors in JSend format
@app.on_event("startup")
async def startup_preflight():
    """
    Ejecuta la verificacion de base de datos ANTES de aceptar trafico.
    Si falla, Uvicorn termina con codigo != 0.
    No imprime DATABASE_URL ni credenciales.
    """
    run_preflight_or_abort()


# Bloque 3 (TAREAS): segundos que el apagado espera a que el bucle termine de cancelarse.
_ESPERA_AL_DETENER_TAREAS_SEG = 5


@app.on_event("startup")
async def iniciar_tareas_automaticas():
    """Revision automatica (B3 T10). Va DESPUES de startup_preflight: solo con la base verificada. Arranca el bucle
    solo si tareas_automaticas.debe_iniciar() (R14: NEBULAE_TAREAS_AUTOMATICAS=1 y NEBULAE_ENV=production, base de
    produccion, sin pytest ni --reload). Con --workers 2 cada proceso arranca el suyo y el candado de Postgres decide
    quien revisa en cada vuelta."""
    if tareas_automaticas.debe_iniciar():
        app.state.tareas_bucle = asyncio.create_task(tareas_automaticas.bucle())
        logger.info("Tareas automáticas activas cada %s s", tareas_automaticas.intervalo_seg())
    else:
        logger.info("Tareas automáticas apagadas en este proceso")


@app.on_event("shutdown")
async def detener_tareas_automaticas():
    """Cancela el bucle de la revision automatica si este proceso lo arranco. Lo ya confirmado se queda; si habia una
    revision a mitad, su hilo la termina y suelta el candado (y si el proceso muere antes, Postgres lo suelta)."""
    tarea = getattr(app.state, "tareas_bucle", None)
    if tarea is None:
        return
    app.state.tareas_bucle = None
    tarea.cancel()
    await asyncio.wait({tarea}, timeout=_ESPERA_AL_DETENER_TAREAS_SEG)


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    # Starlette monta el handler de `Exception` en ServerErrorMiddleware, que
    # envuelve a CORSMiddleware por FUERA. Cuando este handler dispara, la
    # respuesta nunca pasa por CORSMiddleware y sale sin
    # Access-Control-Allow-Origin — el navegador entonces bloquea la
    # respuesta y el frontend solo ve "Failed to fetch", ocultando el error
    # real. Hay que agregar el header a mano en cada 500 no controlado.
    response = JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal Server Error"},
    )
    origin = request.headers.get("origin")
    if origin in _CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

MENSAJE_DATOS_INVALIDOS = "Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo."
_CLAVES_CTX_NUMERICAS = ("min_length", "max_length", "gt", "ge", "lt", "le")


def _error_de_validacion_legible(error: dict) -> dict:
    """Un error de pydantic sin datos del usuario ni del servidor: {type, loc, msg, ctx}.

    Nunca lleva `input` (lo que mando el usuario) ni `url`; ctx conserva solo los limites numericos que el frontend
    usa para la frase ('debe tener al menos 5 caracteres'). Lo demas de ctx (p. ej. la excepcion de un validador)
    se descarta: no es serializable y no aporta al mensaje."""
    ctx_pydantic = error.get("ctx") or {}
    ctx = {}
    for clave in _CLAVES_CTX_NUMERICAS:
        valor = ctx_pydantic.get(clave)
        if isinstance(valor, bool):
            continue
        if isinstance(valor, int) or (isinstance(valor, float) and math.isfinite(valor)):
            ctx[clave] = valor
        elif isinstance(valor, Decimal) and valor.is_finite():
            ctx[clave] = int(valor) if valor == valor.to_integral_value() else float(valor)
    return {
        "type": str(error.get("type", "")),
        "loc": [parte if isinstance(parte, (str, int)) else str(parte) for parte in error.get("loc", ())],
        "msg": _msg_sin_valor_enviado(str(error.get("msg", "")), error.get("input")),
        "ctx": ctx,
    }


def _msg_sin_valor_enviado(msg: str, entrada) -> str:
    """Un validador propio puede interpolar lo que mando el usuario en su ValueError ("estado 'X' no existe"): el
    valor se reemplaza por '…'. Entre comillas siempre; suelto solo si tiene 3 caracteres o mas (uno o dos
    caracteres sueltos borrarian letras del texto)."""
    if not isinstance(entrada, str) or not entrada:
        return msg
    for comillas in ("'", '"'):
        msg = msg.replace(f"{comillas}{entrada}{comillas}", f"{comillas}…{comillas}")
    if len(entrada) >= 3:
        msg = msg.replace(entrada, "…")
    return msg


@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    # Se conserva el 400 y la forma {status, message}: muchas pantallas leen data.detail || data.message. Antes
    # message era str(exc), con rutas de archivo del servidor y el valor enviado; ahora es una frase fija y el
    # detalle va en `errores` (el frontend lo traduce con lib/avisos.js).
    return JSONResponse(
        status_code=400,
        content={
            "status": "error",
            "message": MENSAJE_DATOS_INVALIDOS,
            "errores": [_error_de_validacion_legible(error) for error in exc.errors()],
        },
    )

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Auth"])
app.include_router(catalog.router, prefix="/api/v1", tags=["Catalog"])
app.include_router(quotations.router, prefix="/api/v1/quotations", tags=["Quotations"])
app.include_router(inventory.router, prefix="/api/v1/inventory", tags=["Inventory"])
app.include_router(finance.router, prefix="/api/v1/finance", tags=["Finance"])
app.include_router(store.router, prefix="/api/v1/store", tags=["Store (B2C)"])
app.include_router(crm.router, prefix="/api/v1/crm", tags=["CRM"])
app.include_router(sales.router, prefix="/api/v1/sales", tags=["Sales"])
app.include_router(purchases.router, prefix="/api/v1/purchases", tags=["Purchases"])
app.include_router(webhooks.router, prefix="/api/v1/webhooks", tags=["Webhooks"])
app.include_router(marketing.router, prefix="/api/v1/marketing", tags=["Marketing"])
app.include_router(chat.router, prefix="/api/v1/chat", tags=["Chat Omnicanal"])
app.include_router(ws.router, prefix="/ws", tags=["WebSockets"])
app.include_router(erp_ventas.router, prefix="/api/v1/ventas", tags=["ERP Ventas"])
app.include_router(erp_ventas_fase4.router, prefix="/api/v1/ventas", tags=["ERP Ventas Fase 4"])
app.include_router(envio_cliente.router, prefix="/api/v1/ventas", tags=["ERP Ventas - Envío al cliente"])
app.include_router(erp_compras.router, prefix="/api/v1/compras", tags=["ERP Compras"])
app.include_router(erp_compras_asignaciones.router, prefix="/api/v1/compras", tags=["ERP Compras - Asignaciones"])
app.include_router(erp_logistica.router, prefix="/api/v1/logistica", tags=["ERP Logística y Tránsito"])
app.include_router(ecommerce.router, prefix="/api/v1/ecommerce", tags=["E-commerce"])
app.include_router(erp_inventario.router, prefix="/api/v1/inventory", tags=["ERP Inventario"])
app.include_router(legacy_observability.router, prefix="/api/v1/legacy", tags=["Legacy Observability & Governance"])
app.include_router(whatsapp_webhook.router, prefix="/api/v1/whatsapp", tags=["WhatsApp Webhook"])  # BLOQUE 5
app.include_router(debug_db.router, prefix="/api/v1/debug", tags=["Debug / Verificacion"])  # Hardening
app.include_router(confirmacion_publica.router, prefix="/api/v1", tags=["confirmacion-publica"])  # Sin autenticacion -- publico por diseno
app.include_router(empresa.router, prefix="/api/v1/empresa", tags=["Empresa"])
app.include_router(empresa.router_publico, prefix="/api/v1/publico", tags=["publico"])  # Sin autenticacion -- publico por diseno

@app.get("/")
def read_root(request: Request):
    accept = request.headers.get("accept", "")
    if "text/html" in accept:
        return RedirectResponse(url="/docs")
    return {
        "status": "success",
        "data": {
            "message": "Welcome to Nebulae ERP-CRM API",
            "docs": "/docs",
            "redoc": "/redoc",
            "openapi": "/openapi.json"
        }
    }


@app.get("/health")
def health_check():
    """Health check endpoint para scripts de arranque y monitores."""
    return {"status": "ok", "service": "nebulae-erp"}
