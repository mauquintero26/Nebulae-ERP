from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from app.api.v1 import auth, catalog, quotations, inventory, finance, store, crm, sales, purchases, webhooks, marketing, chat
from app.api.v1 import erp_ventas, erp_compras, ecommerce
from app.api import ws
from app.db.database import Base, engine

# Create tables in DB (for development/testing only, Alembic is preferred)
# Base.metadata.create_all(bind=engine)

from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="Nebulae ERP & CRM API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5100",
        "http://127.0.0.1:5100",
        "https://nebulaekids.com",
        "https://www.nebulaekids.com",
        "*",   # Allow web chat widget from any domain
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handler to standardize generic errors in JSend format
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
app.include_router(erp_compras.router, prefix="/api/v1/compras", tags=["ERP Compras"])
app.include_router(ecommerce.router, prefix="/api/v1/ecommerce", tags=["E-commerce"])

@app.get("/")
def read_root():
    return {"status": "success", "data": {"message": "Welcome to Nebulae ERP-CRM API"}}
