from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.api.v1 import auth, catalog, quotations, inventory, finance, store, crm, sales, purchases, webhooks, marketing, chat, legacy_observability
from app.api.v1 import erp_ventas, erp_ventas_fase4, erp_compras, erp_compras_asignaciones, ecommerce, erp_logistica, erp_inventario
from app.api.v1 import whatsapp_webhook  # BLOQUE 5 — Modo Sombra WhatsApp
from app.api.v1 import debug_db  # Hardening — endpoint de verificacion de DB (solo ADMIN)
from app.api import ws
from app.db.database import Base, engine
from app.core.preflight import run_preflight_or_abort  # BLOQUE 5 — Preflight DB check

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=_build_cors_origins(),
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


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"status": "error", "message": "Internal Server Error"},
    )

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(request: Request, exc: RequestValidationError):
    return JSONResponse(
        status_code=400,
        content={"status": "error", "message": str(exc)},
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
app.include_router(erp_compras.router, prefix="/api/v1/compras", tags=["ERP Compras"])
app.include_router(erp_compras_asignaciones.router, prefix="/api/v1/compras", tags=["ERP Compras - Asignaciones"])
app.include_router(erp_logistica.router, prefix="/api/v1/logistica", tags=["ERP Logística y Tránsito"])
app.include_router(ecommerce.router, prefix="/api/v1/ecommerce", tags=["E-commerce"])
app.include_router(erp_inventario.router, prefix="/api/v1/inventory", tags=["ERP Inventario"])
app.include_router(legacy_observability.router, prefix="/api/v1/legacy", tags=["Legacy Observability & Governance"])
app.include_router(whatsapp_webhook.router, prefix="/api/v1/whatsapp", tags=["WhatsApp Webhook"])  # BLOQUE 5
app.include_router(debug_db.router, prefix="/api/v1/debug", tags=["Debug / Verificacion"])  # Hardening

@app.get("/")
def read_root():
    return {"status": "success", "data": {"message": "Welcome to Nebulae ERP-CRM API"}}


@app.get("/health")
def health_check():
    """Health check endpoint para scripts de arranque y monitores."""
    return {"status": "ok", "service": "nebulae-erp"}
