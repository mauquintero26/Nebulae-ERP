from app.models.users import User
from app.api.dependencies import require_roles, ROLE_ADMIN, ROLE_FINANZAS, ROLE_ASESOR, ROLE_BODEGA, ALL_ERP_ROLES
import hashlib

from decimal import Decimal
from app.models.catalog import ProductSKU, Product
from app.models.inventory import InventoryLevel, Warehouse
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, SaleOrderLineErp
from app.models.fase3 import InventoryQuarantine
from app.models.fase4 import SaleOrderPayment

"""
E-commerce API
Endpoints for: E-commerce stats, PWEB orders, digital catalog,
abandoned carts, web builder config, image management
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status, Body
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session
from sqlalchemy import text, func
from typing import Optional
from app.db.database import get_db
from app.models.erp_documents import SaleOrder, ActivityLog
from app.models.customers import Customer
import datetime
import uuid
import os
import json as json_mod

router = APIRouter()

def _now():
    return datetime.datetime.utcnow()

def _next_seq_pweb(db: Session) -> int:
    try:
        r = db.execute(text("SELECT nextval('seq_pweb')")).scalar()
        return int(r)
    except Exception:
        db.rollback()
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_pweb START 1"))
        db.commit()
        return int(db.execute(text("SELECT nextval('seq_pweb')")).scalar())

def _gen_pweb_numero(db: Session) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq_pweb(db)
    return f"PWEB-{year}{n:04d}"

def _ensure_ecommerce_tables(db: Session):
    try:
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS web_carts (
                id SERIAL PRIMARY KEY,
                session_id VARCHAR(100),
                customer_email VARCHAR(200),
                customer_name VARCHAR(200),
                productos JSONB DEFAULT '[]',
                total_cop NUMERIC(14,2) DEFAULT 0,
                estado VARCHAR(30) DEFAULT 'ACTIVO',
                ip_address VARCHAR(50),
                recuperacion_enviada BOOLEAN DEFAULT FALSE,
                recuperacion_descuento NUMERIC(5,2) DEFAULT 0,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS web_builder_config (
                id SERIAL PRIMARY KEY,
                config_key VARCHAR(100) UNIQUE NOT NULL,
                config_value JSONB,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS media_repository (
                id SERIAL PRIMARY KEY,
                filename VARCHAR(300) NOT NULL,
                url VARCHAR(500) NOT NULL,
                tipo VARCHAR(50) DEFAULT 'imagen',
                tags JSONB DEFAULT '[]',
                size_bytes INTEGER DEFAULT 0,
                uploaded_by VARCHAR(150),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        db.execute(text("""
            CREATE TABLE IF NOT EXISTS ecommerce_products (
                id SERIAL PRIMARY KEY,
                nombre VARCHAR(500) NOT NULL,
                descripcion TEXT,
                descripcion_larga TEXT,
                sku VARCHAR(100),
                precio_venta NUMERIC(14,2) DEFAULT 0,
                precio_comparacion NUMERIC(14,2) DEFAULT 0,
                descuento_pct NUMERIC(5,2) DEFAULT 0,
                impuesto_pct NUMERIC(5,2) DEFAULT 0,
                categoria VARCHAR(200),
                sub_categoria VARCHAR(200),
                marca VARCHAR(200),
                tipo_producto VARCHAR(50) DEFAULT 'Bienes',
                imagenes JSONB DEFAULT '[]',
                atributos JSONB DEFAULT '[]',
                variantes JSONB DEFAULT '[]',
                stock_disponible INTEGER DEFAULT 0,
                alerta_stock_minimo INTEGER DEFAULT 5,
                publicado_web BOOLEAN DEFAULT FALSE,
                rastrear_inventario BOOLEAN DEFAULT TRUE,
                codigo_aduana VARCHAR(100),
                peso_kg NUMERIC(8,2),
                notas_internas TEXT,
                seo_titulo VARCHAR(300),
                seo_descripcion TEXT,
                seo_keywords TEXT,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW(),
                created_by VARCHAR(150)
            )
        """))
        db.commit()
    except Exception:
        db.rollback()

# --- ECOMMERCE STATS ---
@router.get("/stats")
def get_ecommerce_stats(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    today = datetime.date.today()
    start_today = datetime.datetime.combine(today, datetime.time.min)
    start_month = datetime.datetime.combine(today.replace(day=1), datetime.time.min)

    web_orders_today = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_today).count()
    web_orders_month = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_month).count()
    rev_today = float(db.query(func.sum(SaleOrder.total_cop)).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_today, SaleOrder.estado != 'CANCELADO').scalar() or 0)
    rev_month = float(db.query(func.sum(SaleOrder.total_cop)).filter(SaleOrder.canal_venta == 'WEB', SaleOrder.created_at >= start_month, SaleOrder.estado != 'CANCELADO').scalar() or 0)

    try:
        cr = db.execute(text("SELECT COUNT(*), COALESCE(SUM(total_cop),0) FROM web_carts WHERE estado='ABANDONADO'")).fetchone()
        carritos_count, carritos_valor = int(cr[0] or 0), float(cr[1] or 0)
    except Exception:
        carritos_count, carritos_valor = 0, 0

    try:
        prod_pub = int(db.execute(text("SELECT COUNT(*) FROM ecommerce_products WHERE publicado_web=TRUE")).scalar() or 0)
    except Exception:
        prod_pub = 0

    total_carts = carritos_count + web_orders_today
    conversion = round((web_orders_today / total_carts * 100), 1) if total_carts > 0 else 0.0

    recent = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB').order_by(SaleOrder.created_at.desc()).limit(10).all()
    orders_data = [{"id": o.id, "numero": o.pweb_numero or o.numero, "customer_name": o.customer_name or "Cliente Web", "customer_email": o.customer_email or "", "total_cop": float(o.total_cop or 0), "estado": o.estado, "created_at": o.created_at.isoformat() if o.created_at else None, "productos_count": len(o.productos or [])} for o in recent]

    return {"status": "success", "data": {"web_orders_today": web_orders_today, "web_orders_month": web_orders_month, "revenue_today": rev_today, "revenue_month": rev_month, "carritos_abandonados_count": carritos_count, "carritos_abandonados_valor": carritos_valor, "productos_publicados": prod_pub, "conversion_pct": conversion, "recent_orders": orders_data}}


# --- WEB ORDERS ---
@router.get("/pedidos")
def list_web_orders(estado: Optional[str] = None, search: Optional[str] = None, limit: int = Query(50, le=200), offset: int = 0, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_FINANZAS, *ROLE_BODEGA)), db: Session = Depends(get_db)):
    q = db.query(SaleOrder).filter(SaleOrder.canal_venta == 'WEB')
    if estado: q = q.filter(SaleOrder.estado == estado)
    if search:
        like = f"%{search}%"
        q = q.filter(SaleOrder.pweb_numero.ilike(like) | SaleOrder.customer_name.ilike(like) | SaleOrder.customer_email.ilike(like))
    total = q.count()
    items = q.order_by(SaleOrder.created_at.desc()).offset(offset).limit(limit).all()
    data = [{"id": o.id, "numero": o.pweb_numero or o.numero, "pven_numero": o.numero, "customer_name": o.customer_name or "Cliente Web", "customer_email": o.customer_email or "", "customer_phone": o.customer_phone or "", "total_cop": float(o.total_cop or 0), "estado": o.estado, "canal_venta": o.canal_venta, "productos": o.productos or [], "created_at": o.created_at.isoformat() if o.created_at else None} for o in items]
    return {"status": "success", "total": total, "data": data}



def _get_real_sellable_stock(db: Session, sku_id: int, warehouse_id: Optional[int] = None, owner: str = "NEBULAE") -> Decimal:
    """
    Calcula la disponibilidad vendible real:
    disponible = stock_fisico_owner - reservas_activas_owner - cuarentena_owner.
    Nunca publica inventario reservado, en cuarentena, perdido o de otro propietario.
    """
    # 1. Balance por propietario
    bal_q = db.query(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0)).filter(
        InventoryOwnerBalance.sku_id == sku_id,
        InventoryOwnerBalance.owner == owner
    )
    if warehouse_id:
        bal_q = bal_q.filter(InventoryOwnerBalance.warehouse_id == warehouse_id)
    balance_owner = Decimal(str(bal_q.scalar() or 0))

    # 2. Reservas activas
    res_q = db.query(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0)).filter(
        InventoryReservation.sku_id == sku_id,
        InventoryReservation.owner == owner,
        InventoryReservation.status == "ACTIVE"
    )
    if warehouse_id:
        res_q = res_q.filter(InventoryReservation.warehouse_id == warehouse_id)
    reservas_activas = Decimal(str(res_q.scalar() or 0))

    # 3. Semantica de inventario canonica de Fase 3:
    # InventoryOwnerBalance ya representa exclusivamente las unidades fisicas conformes
    # del propietario y excluye las unidades en cuarentena (que se registran en InventoryQuarantine).
    # Por tanto, no se resta nuevamente cuarentena para evitar doble descuento.
    disponible = balance_owner - reservas_activas
    return max(disponible, Decimal("0.0"))

def _get_authorized_ecommerce_warehouses(db: Session):
    """
    Obtiene la lista de bodegas autorizadas y la bodega principal por defecto para fulfillment ecommerce.
    Reglas estrictas de fulfillment y seguridad:
    1. Si existe configuracion explicita en web_builder_config (key 'ecommerce_fulfillment'):
       - Se lee 'authorized_warehouse_ids' (lista de enteros) y 'default_warehouse_id'.
       - Si 'authorized_warehouse_ids' es una lista vacia ([]), retorna ([], None).
    2. Si existe variable de entorno ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS:
       - Se parsean los IDs separados por coma.
       - Si la variable esta definida pero vacia, retorna ([], None).
    3. Si no hay configuracion explicita previa:
       - Se consultan todas las bodegas de tipo 'Central' existentes en la base de datos.
    4. Cada bodega autorizada DEBE existir en la base de datos y tener estrictamente location_type == 'Central'.
    5. Prohibido cualquier fallback a Warehouse.first() de tipo no-Central o a un ID hardcodeado fijo.
    Retorna (bodegas_autorizadas, bodega_por_defecto).
    """
    _ensure_ecommerce_tables(db)
    explicit_ids = None
    default_id = None

    try:
        row = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='ecommerce_fulfillment'")).fetchone()
        if row and row[0]:
            cfg = row[0]
            if isinstance(cfg, str):
                cfg = json_mod.loads(cfg)
            if "authorized_warehouse_ids" in cfg:
                explicit_ids = [int(x) for x in cfg["authorized_warehouse_ids"]]
                raw_def = cfg.get("default_warehouse_id")
                if raw_def is not None:
                    default_id = int(raw_def)
    except Exception:
        pass

    if explicit_ids is None and "ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS" in os.environ:
        raw_env = os.environ.get("ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS", "").strip()
        if raw_env:
            explicit_ids = [int(x.strip()) for x in raw_env.split(",") if x.strip().isdigit()]
        else:
            explicit_ids = []
        raw_def = os.environ.get("ECOMMERCE_DEFAULT_WAREHOUSE_ID", "").strip()
        if raw_def and raw_def.isdigit():
            default_id = int(raw_def)

    if explicit_ids is not None:
        if not explicit_ids:
            return [], None
        whs = db.query(Warehouse).filter(
            Warehouse.id.in_(explicit_ids),
            Warehouse.location_type == "Central"
        ).all()
    else:
        whs = db.query(Warehouse).filter(
            Warehouse.location_type == "Central"
        ).all()

    if not whs:
        return [], None

    def_wh = None
    if default_id is not None:
        def_wh = next((w for w in whs if w.id == default_id), None)
    if not def_wh:
        def_wh = whs[0]

    return whs, def_wh

@router.post("/pedidos", status_code=201)
def create_web_order(body: dict, db: Session = Depends(get_db)):
    """
    Creacion segura, consistente y pesimista de pedidos desde ecommerce:
    - Calculo de precios, descuentos y totales 100% en el backend.
    - Rechazo de intentos de manipulacion de precios, totales forzados o empresa no autorizada (MAU).
    - Validacion de disponibilidad vendible real para ENTREGA_INMEDIATA (409 si stock insuficiente).
    - Lineas POR_PEDIDO admitidas con estado PENDIENTE_COMPRA.
    - Estado inicial PENDIENTE_PAGO (CERO creacion de SaleOrderPayment en el checkout).
    - Secuencias seguras PostgreSQL (seq_pweb y seq_ven).
    - Idempotencia con huella canonica: replay 200 vs conflicto divergente 409.
    """
    _ensure_ecommerce_tables(db)

    # 1. Validar clave de idempotencia
    idem_key = body.get("idempotency_key")
    if not idem_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El campo 'idempotency_key' es obligatorio para el checkout web."
        )

    # 2. Validacion de items y anti-manipulacion de propiedad patrimonial (MAU)
    if body.get("owner") and body.get("owner") != "NEBULAE":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Operacion rechazada: No se permite forzar propietario patrimonial no autorizado (MAU) en ecommerce."
        )

    raw_items = body.get("items") or body.get("productos") or []
    if not raw_items:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El pedido debe contener al menos un articulo."
        )

    for it in raw_items:
        if it.get("owner") and it.get("owner") != "NEBULAE":
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Operacion rechazada: Articulo con propietario forzado no autorizado (MAU)."
            )

    # 3. Calculo estricto del lado del servidor (precios, cantidades, totales)
    server_subtotal = Decimal("0.00")
    validated_lines = []

    for it in raw_items:
        qty = int(it.get("quantity") or it.get("qty") or 0)
        if qty <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cantidad invalida para el articulo: {qty}. Debe ser un entero mayor a 0."
            )

        sku_code = it.get("sku")
        sku_id = it.get("sku_id")
        sku = None
        if sku_id:
            sku = db.query(ProductSKU).filter(ProductSKU.id == sku_id).first()
        elif sku_code:
            sku = db.query(ProductSKU).filter(ProductSKU.sku == sku_code).first()

        if not sku:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Producto SKU '{sku_code or sku_id}' no encontrado en el catalogo."
            )

        db_price = Decimal(str(sku.sale_price or sku.price or 0))

        # Deteccion de manipulacion de precio unitario
        client_price = it.get("unit_price_cop") or it.get("precio_venta") or it.get("price")
        if client_price is not None and abs(Decimal(str(client_price)) - db_price) > Decimal("0.01"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Manipulacion de precios detectada: Precio enviado para SKU {sku.sku} (${client_price}) no coincide con el catalogo oficial (${db_price})."
            )

        # Deteccion de manipulacion de descuento
        client_disc = it.get("descuento_pct")
        if client_disc is not None and Decimal(str(client_disc)) > Decimal("0.0"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Descuento arbitrario no permitido desde el cliente web."
            )

        raw_mod = str(it.get("modalidad") or "ENTREGA_INMEDIATA").upper()
        modalidad = "ENTREGA_INMEDIATA" if "INMEDIATA" in raw_mod else "POR_PEDIDO"
        cost_unit = Decimal(str(sku.cost_price or 0)) if sku.cost_price else Decimal("0.00")
        line_subtotal = Decimal(str(qty)) * db_price
        server_subtotal += line_subtotal

        validated_lines.append({
            "sku": sku,
            "qty": qty,
            "unit_price": db_price,
            "cost_unit": cost_unit,
            "modalidad": modalidad,
            "nombre": it.get("nombre") or (sku.sku if sku else "Producto Web"),
            "warehouse_id": it.get("warehouse_id")
        })

    server_total = server_subtotal
    # Deteccion de manipulacion de total
    client_total = body.get("total_cop")
    if client_total is not None and abs(Decimal(str(client_total)) - server_total) > Decimal("0.01"):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Manipulacion de totales detectada: Total enviado (${client_total}) no coincide con el calculo del servidor (${server_total})."
        )

    # 4. Construccion de huella canonica de idempotencia (Fingerprint)
    sorted_items = sorted([
        {"sku": vl["sku"].sku, "quantity": vl["qty"], "modalidad": vl["modalidad"]}
        for vl in validated_lines
    ], key=lambda x: (x["sku"], x["quantity"]))

    email_norm = str(body.get("customer_email") or "").strip().lower()
    addr_norm = str(body.get("direccion_entrega") or body.get("customer_address") or "").strip().lower()
    fp_raw = f"{email_norm}|{json_mod.dumps(sorted_items, sort_keys=True)}|{addr_norm}|{float(server_total)}"
    current_fingerprint = hashlib.sha256(fp_raw.encode("utf-8")).hexdigest()

    # 5. Verificacion de idempotencia en base de datos
    existing_order = db.query(SaleOrder).filter(
        (SaleOrder.checkout_idempotency_key == idem_key) |
        (text("canal_metadata->>'idempotency_key' = :k").params(k=idem_key))
    ).first()

    if existing_order:
        stored_fp = existing_order.checkout_fingerprint or (existing_order.canal_metadata or {}).get("fingerprint")
        if stored_fp and stored_fp != current_fingerprint:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflicto de idempotencia: La clave ya fue utilizada para un pedido con datos divergentes."
            )
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "status": "success",
                "idempotent_replay": True,
                "data": {
                    "id": existing_order.id,
                    "numero": existing_order.numero,
                    "pweb_numero": existing_order.pweb_numero,
                    "estado": existing_order.estado,
                    "total_cop": float(existing_order.total_cop or 0)
                }
            }
        )

    # 6. Resolucion estricta de bodega en el servidor (reglas de fulfillment canonico)
    auth_warehouses, default_wh = _get_authorized_ecommerce_warehouses(db)
    if not auth_warehouses or not default_wh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error de configuracion: No existe una bodega central autorizada para fulfillment ecommerce."
        )
    auth_wh_ids = {w.id for w in auth_warehouses}

    # Validacion anti-manipulacion de bodega: no confiar en warehouse_id enviado por cliente
    client_wh_id = body.get("warehouse_id")
    if client_wh_id is not None:
        try:
            target_id = int(client_wh_id)
        except (ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Identificador de bodega invalido: '{client_wh_id}'."
            )
        target_wh = db.query(Warehouse).filter(Warehouse.id == target_id).first()
        if not target_wh:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bodega '{client_wh_id}' no encontrada en el sistema."
            )
        if target_wh.id not in auth_wh_ids:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bodega '{client_wh_id}' no autorizada para fulfillment ecommerce."
            )
        resolved_wh_id = target_wh.id
    else:
        resolved_wh_id = default_wh.id

    for it in raw_items:
        it_wh_id = it.get("warehouse_id")
        if it_wh_id is not None:
            try:
                it_target_id = int(it_wh_id)
            except (ValueError, TypeError):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Identificador de bodega en item invalido: '{it_wh_id}'."
                )
            it_target = db.query(Warehouse).filter(Warehouse.id == it_target_id).first()
            if not it_target:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bodega '{it_wh_id}' en item no encontrada."
                )
            if it_target.id not in auth_wh_ids:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bodega '{it_wh_id}' en item no autorizada para fulfillment ecommerce."
                )

    for vl in validated_lines:
        vl["warehouse_id"] = resolved_wh_id
        if vl["modalidad"] == "ENTREGA_INMEDIATA":
            wh_id = resolved_wh_id
            disp_real = _get_real_sellable_stock(db, vl["sku"].id, wh_id, "NEBULAE")
            if disp_real < Decimal(str(vl["qty"])):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Stock insuficiente para entrega inmediata de '{vl['sku'].sku}'. Disponibles: {disp_real}, solicitadas: {vl['qty']}."
                )

    # 7. Generacion segura de secuencias
    pweb_numero = _gen_pweb_numero(db)
    try:
        n_ven = db.execute(text("SELECT nextval('seq_ven')")).scalar()
    except Exception:
        db.rollback()
        db.execute(text("CREATE SEQUENCE IF NOT EXISTS seq_ven START 1000"))
        db.commit()
        n_ven = db.execute(text("SELECT nextval('seq_ven')")).scalar()

    year = datetime.datetime.utcnow().year
    pven_numero = f"PVEN-{year}{int(n_ven):04d}"

    # 8. Resolucion o creacion de cliente
    customer = None
    if body.get("customer_email"):
        customer = db.query(Customer).filter(Customer.email == body["customer_email"]).first()
    if not customer and body.get("customer_id"):
        customer = db.query(Customer).filter(Customer.id == int(body["customer_id"])).first()
    if not customer and body.get("customer_email"):
        names = (body.get("customer_name", "Web") or "Web").split(" ", 1)
        customer = Customer(
            first_name=names[0],
            last_name=names[1] if len(names) > 1 else "",
            email=body.get("customer_email"),
            phone=body.get("customer_phone", ""),
            address=body.get("customer_address", "")
        )
        db.add(customer)
        db.flush()

    # 9. Creacion de la orden en estado PENDIENTE_PAGO (CERO confirmacion automatica de pago)
    meta = {
        "idempotency_key": idem_key,
        "fingerprint": current_fingerprint,
        "shipping_method": body.get("shipping_method") or body.get("metodo_entrega") or "STANDARD"
    }

    order = SaleOrder(
        numero=pven_numero,
        pweb_numero=pweb_numero,
        canal_venta="WEB",
        checkout_idempotency_key=idem_key,
        checkout_fingerprint=current_fingerprint,
        canal_metadata=meta,
        customer_id=customer.id if customer else None,
        customer_name=body.get("customer_name") or (f"{customer.first_name} {customer.last_name or ''}".strip() if customer else "Cliente Web"),
        customer_email=body.get("customer_email") or (customer.email if customer else None),
        customer_phone=body.get("customer_phone") or (customer.phone if customer else None),
        customer_address=body.get("customer_address") or (customer.address if customer else None),
        direccion_entrega=body.get("direccion_entrega") or body.get("customer_address") or (customer.address if customer else ""),
        total_cop=server_total,
        subtotal_cop=server_subtotal,
        descuento_pct=Decimal("0.00"),
        anticipo_cop=Decimal("0.00"),
        saldo_cop=server_total,
        productos=[{
            "sku": vl["sku"].sku,
            "sku_id": vl["sku"].id,
            "qty": vl["qty"],
            "unit_price_cop": float(vl["unit_price"]),
            "modalidad": vl["modalidad"]
        } for vl in validated_lines],
        notas=body.get("notas"),
        estado="PENDIENTE_PAGO"
    )
    db.add(order)
    db.flush()

    # 10. Creacion de lineas canonicas y reservas fisicas para articulos inmediatos
    for vl in validated_lines:
        wh_id = vl["warehouse_id"] or default_wh_id
        so_line = SaleOrderLineErp(
            so_id=order.id,
            sku_id=vl["sku"].id,
            description=vl["nombre"],
            quantity=Decimal(str(vl["qty"])),
            unit_price_cop=vl["unit_price"],
            descuento_pct=Decimal("0.00"),
            customer_id=customer.id if customer else None,
            tax_pct=Decimal("0.00"),
            modalidad=vl["modalidad"],
            owner="NEBULAE",
            quantity_reserved=Decimal("0"),
            quantity_delivered=Decimal("0"),
            quantity_cancelled=Decimal("0"),
            estado="PENDIENTE",
            cost_unit_cop_snapshot=vl["cost_unit"],
            price_unit_cop_snapshot=vl["unit_price"],
            source="NATIVE"
        )
        db.add(so_line)
        db.flush()

        if vl["modalidad"] == "ENTREGA_INMEDIATA":
            # Bloqueo pesimista de balance
            owner_bal = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == vl["sku"].id,
                InventoryOwnerBalance.warehouse_id == wh_id,
                InventoryOwnerBalance.owner == "NEBULAE"
            ).with_for_update().first()

            disp_real = _get_real_sellable_stock(db, vl["sku"].id, wh_id, "NEBULAE")
            if disp_real < Decimal(str(vl["qty"])):
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"Stock insuficiente para entrega inmediata de '{vl['sku'].sku}'. Disponibles: {disp_real}, solicitadas: {vl['qty']}."
                )

            res_key = f"RES_PWEB_{order.id}_LINE_{so_line.id}"
            res = InventoryReservation(
                sku_id=vl["sku"].id,
                warehouse_id=wh_id,
                owner="NEBULAE",
                quantity_reserved=Decimal(str(vl["qty"])),
                sale_order_line_id=so_line.id,
                status="ACTIVE",
                idempotency_key=res_key,
                created_by="ECOMMERCE",
                notes=f"Reserva e-commerce pedido {pweb_numero}"
            )
            db.add(res)
            so_line.quantity_reserved = Decimal(str(vl["qty"]))
            so_line.estado = "RESERVADA"
        else:
            so_line.estado = "PENDIENTE_COMPRA"

    log = ActivityLog(
        entity_type="VEN",
        entity_id=order.id,
        entity_numero=pweb_numero,
        action="CREATED",
        description=f"Pedido web {pweb_numero} ({pven_numero}) creado desde e-commerce en estado PENDIENTE_PAGO.",
        new_estado=order.estado,
        user_name="ECOMMERCE"
    )
    db.add(log)
    db.commit()
    db.refresh(order)

    return {
        "status": "success",
        "idempotent_replay": False,
        "data": {
            "id": order.id,
            "numero": order.numero,
            "pweb_numero": order.pweb_numero,
            "estado": order.estado,
            "total_cop": float(order.total_cop or 0),
            "anticipo_cop": float(order.anticipo_cop or 0),
            "saldo_cop": float(order.saldo_cop or 0),
            "fingerprint": current_fingerprint
        }
    }


# --- CARRITOS ---
@router.get("/carritos")
def list_carritos(estado: str = "ABANDONADO", user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT id, session_id, customer_email, customer_name, productos, total_cop, estado, recuperacion_enviada, recuperacion_descuento, created_at FROM web_carts WHERE estado=:e ORDER BY created_at DESC LIMIT 50"), {"e": estado}).fetchall()
        return {"status": "success", "data": [{"id": r[0], "session_id": r[1], "customer_email": r[2], "customer_name": r[3], "productos": r[4] or [], "total_cop": float(r[5] or 0), "estado": r[6], "recuperacion_enviada": r[7], "recuperacion_descuento": float(r[8] or 0), "created_at": r[9].isoformat() if r[9] else None} for r in rows]}
    except Exception:
        return {"status": "success", "data": []}

@router.post("/carritos")
def save_cart(body: dict, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    session_id = body.get("session_id", str(uuid.uuid4()))
    existing = db.execute(text("SELECT id FROM web_carts WHERE session_id=:s"), {"s": session_id}).fetchone()
    pj = json_mod.dumps(body.get("productos", []))
    if existing:
        db.execute(text("UPDATE web_carts SET customer_email=:e, customer_name=:n, productos=CAST(:p AS jsonb), total_cop=:t, estado=:s, updated_at=NOW() WHERE session_id=:sid"), {"e": body.get("customer_email"), "n": body.get("customer_name"), "p": pj, "t": body.get("total_cop", 0), "s": body.get("estado", "ACTIVO"), "sid": session_id})
    else:
        db.execute(text("INSERT INTO web_carts (session_id, customer_email, customer_name, productos, total_cop, estado, ip_address) VALUES (:sid, :e, :n, CAST(:p AS jsonb), :t, :s, :ip)"), {"sid": session_id, "e": body.get("customer_email"), "n": body.get("customer_name"), "p": pj, "t": body.get("total_cop", 0), "s": body.get("estado", "ACTIVO"), "ip": body.get("ip_address")})
    db.commit()
    return {"status": "success", "session_id": session_id}

@router.patch("/carritos/{cart_id}/recuperar")
def recuperar_carrito(cart_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    descuento = body.get("descuento_pct", 10)
    db.execute(text("UPDATE web_carts SET recuperacion_enviada=TRUE, recuperacion_descuento=:d, updated_at=NOW() WHERE id=:id"), {"d": descuento, "id": cart_id})
    db.commit()
    return {"status": "success", "message": f"Recuperacion enviada con {descuento}% descuento"}


# --- CATALOGO DIGITAL ---
@router.get("/catalogo")
def list_catalogo(search: Optional[str] = None, categoria: Optional[str] = None, publicado: Optional[bool] = None, limit: int = Query(100, le=500), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    where_clauses = []
    params: dict = {"limit": limit}
    if search:
        where_clauses.append("(nombre ILIKE :s OR sku ILIKE :s OR descripcion ILIKE :s)")
        params["s"] = f"%{search}%"
    if categoria:
        where_clauses.append("categoria ILIKE :c")
        params["c"] = f"%{categoria}%"
    if publicado is not None:
        where_clauses.append("publicado_web = :pub")
        params["pub"] = publicado
    where_sql = ("WHERE " + " AND ".join(where_clauses)) if where_clauses else ""
    try:
        rows = db.execute(text(f"SELECT id, nombre, descripcion, sku, precio_venta, precio_comparacion, descuento_pct, impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, atributos, variantes, stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, seo_titulo, created_at, updated_at FROM ecommerce_products {where_sql} ORDER BY nombre LIMIT :limit"), params).fetchall()
        total = int(db.execute(text(f"SELECT COUNT(*) FROM ecommerce_products {where_sql}"), {k:v for k,v in params.items() if k!="limit"}).scalar() or 0)
        data = []
        seen_skus = set()
        for r in rows:
            sku_code = r[3]
            stock_disp = float(r[15] or 0)
            if sku_code:
                seen_skus.add(sku_code)
                sku_record = db.query(ProductSKU).filter(ProductSKU.sku == sku_code).first()
                if sku_record:
                    real_stock = _get_real_sellable_stock(db, sku_record.id, owner="NEBULAE")
                    stock_disp = float(real_stock)

            modalidad = "ENTREGA_INMEDIATA" if stock_disp > 0 else "POR_PEDIDO"
            is_low = stock_disp <= (r[16] or 5)

            data.append({
                "id": r[0],
                "nombre": r[1],
                "descripcion": r[2],
                "sku": r[3],
                "precio_venta": float(r[4] or 0),
                "precio_comparacion": float(r[5] or 0),
                "descuento_pct": float(r[6] or 0),
                "impuesto_pct": float(r[7] or 0),
                "categoria": r[8],
                "sub_categoria": r[9],
                "marca": r[10],
                "tipo_producto": r[11],
                "imagenes": r[12] or [],
                "atributos": r[13] or [],
                "variantes": r[14] or [],
                "stock_disponible": stock_disp,
                "modalidad_disponible": modalidad,
                "alerta_stock_minimo": r[16] or 5,
                "publicado_web": r[17],
                "rastrear_inventario": r[18],
                "seo_titulo": r[19],
                "created_at": r[20].isoformat() if r[20] else None,
                "updated_at": r[21].isoformat() if r[21] else None,
                "is_low_stock": is_low,
            })

        # Incluir SKUs canonicos del ERP no presentes en ecommerce_products
        sku_q = db.query(ProductSKU).join(Product, ProductSKU.product_id == Product.id)
        if search:
            like = f"%{search}%"
            sku_q = sku_q.filter(
                ProductSKU.sku.ilike(like) | Product.name.ilike(like)
            )
        for canon_sku in sku_q.limit(limit).all():
            if canon_sku.sku not in seen_skus:
                prod = canon_sku.product
                real_stock = float(_get_real_sellable_stock(db, canon_sku.id, owner="NEBULAE"))
                modalidad = "ENTREGA_INMEDIATA" if real_stock > 0 else "POR_PEDIDO"
                data.append({
                    "id": canon_sku.id,
                    "nombre": prod.name if prod else canon_sku.sku,
                    "descripcion": getattr(prod, "description", "") or "",
                    "sku": canon_sku.sku,
                    "precio_venta": float(canon_sku.sale_price or 0),
                    "precio_comparacion": float(canon_sku.sale_price or 0),
                    "descuento_pct": 0.0,
                    "impuesto_pct": 0.0,
                    "categoria": getattr(getattr(prod, "category", None), "name", "") if prod else "",
                    "sub_categoria": "",
                    "marca": getattr(getattr(prod, "brand", None), "name", "") if prod else "",
                    "tipo_producto": "Fisico",
                    "imagenes": [],
                    "atributos": [],
                    "variantes": [],
                    "stock_disponible": real_stock,
                    "modalidad_disponible": modalidad,
                    "alerta_stock_minimo": 5,
                    "publicado_web": True,
                    "rastrear_inventario": True,
                    "seo_titulo": prod.name if prod else canon_sku.sku,
                    "created_at": canon_sku.created_at.isoformat() if hasattr(canon_sku, "created_at") and canon_sku.created_at else None,
                    "updated_at": canon_sku.updated_at.isoformat() if hasattr(canon_sku, "updated_at") and canon_sku.updated_at else None,
                    "is_low_stock": real_stock <= 5,
                })
                seen_skus.add(canon_sku.sku)
                total += 1

        return {"status": "success", "total": total, "data": data}
    except Exception as e:
        return {"status": "success", "total": 0, "data": [], "error": str(e)}

@router.get("/catalogo/{product_id}")
def get_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    row = db.execute(text("SELECT * FROM ecommerce_products WHERE id=:id"), {"id": product_id}).fetchone()
    if not row:
        prod = db.query(Product).filter(Product.id == product_id).first()
        if prod:
            sku_first = prod.skus[0] if prod.skus else None
            stock_disp = float(_get_real_sellable_stock(db, sku_first.id, owner="NEBULAE")) if sku_first else 0.0
            return {
                "status": "success",
                "data": {
                    "id": prod.id,
                    "nombre": prod.name,
                    "descripcion": getattr(prod, "description", "") or "",
                    "sku": sku_first.sku if sku_first else "",
                    "precio_venta": float(sku_first.sale_price or 0) if sku_first else 0.0,
                    "precio_comparacion": float(sku_first.sale_price or 0) if sku_first else 0.0,
                    "descuento_pct": 0.0,
                    "categoria": prod.category.name if prod.category else "",
                    "marca": prod.brand.name if prod.brand else "",
                    "stock_disponible": stock_disp,
                    "publicado_web": True
                }
            }
        raise HTTPException(404, "Producto no encontrado")
    keys = ["id","nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","imagenes","atributos","variantes","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords","created_at","updated_at","created_by"]
    data = dict(zip(keys, row))
    # Sales analytics for this product
    ventas_prod = db.query(SaleOrder).filter(SaleOrder.canal_venta=='WEB', SaleOrder.estado!='CANCELADO').all()
    total_vendido = sum(p.get("qty", p.get("cantidad", 0)) for o in ventas_prod for p in (o.productos or []) if p.get("sku") == data.get("sku") or p.get("nombre","").lower() == (data.get("nombre") or "").lower())
    data["total_vendido"] = total_vendido
    for k in ["created_at","updated_at"]:
        if data.get(k) and hasattr(data[k],"isoformat"):
            data[k] = data[k].isoformat()
    return {"status": "success", "data": data}

@router.post("/catalogo", status_code=201)
def create_catalogo_product(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    now = datetime.datetime.utcnow()
    result = db.execute(text("""
        INSERT INTO ecommerce_products (nombre,descripcion,descripcion_larga,sku,precio_venta,precio_comparacion,descuento_pct,impuesto_pct,categoria,sub_categoria,marca,tipo_producto,imagenes,atributos,variantes,stock_disponible,alerta_stock_minimo,publicado_web,rastrear_inventario,codigo_aduana,peso_kg,notas_internas,seo_titulo,seo_descripcion,seo_keywords,created_at,updated_at,created_by)
        VALUES (:nombre,:descripcion,:descripcion_larga,:sku,:precio_venta,:precio_comparacion,:descuento_pct,:impuesto_pct,:categoria,:sub_categoria,:marca,:tipo_producto,CAST(:imagenes AS jsonb),CAST(:atributos AS jsonb),CAST(:variantes AS jsonb),:stock_disponible,:alerta_stock_minimo,:publicado_web,:rastrear_inventario,:codigo_aduana,:peso_kg,:notas_internas,:seo_titulo,:seo_descripcion,:seo_keywords,:now,:now,:created_by)
        RETURNING id
    """), {"nombre": body.get("nombre",""), "descripcion": body.get("descripcion"), "descripcion_larga": body.get("descripcion_larga"), "sku": body.get("sku"), "precio_venta": body.get("precio_venta",0), "precio_comparacion": body.get("precio_comparacion",0), "descuento_pct": body.get("descuento_pct",0), "impuesto_pct": body.get("impuesto_pct",0), "categoria": body.get("categoria"), "sub_categoria": body.get("sub_categoria"), "marca": body.get("marca"), "tipo_producto": body.get("tipo_producto","Bienes"), "imagenes": json_mod.dumps(body.get("imagenes",[])), "atributos": json_mod.dumps(body.get("atributos",[])), "variantes": json_mod.dumps(body.get("variantes",[])), "stock_disponible": body.get("stock_disponible",0), "alerta_stock_minimo": body.get("alerta_stock_minimo",5), "publicado_web": body.get("publicado_web",False), "rastrear_inventario": body.get("rastrear_inventario",True), "codigo_aduana": body.get("codigo_aduana"), "peso_kg": body.get("peso_kg"), "notas_internas": body.get("notas_internas"), "seo_titulo": body.get("seo_titulo"), "seo_descripcion": body.get("seo_descripcion"), "seo_keywords": body.get("seo_keywords"), "now": now, "created_by": body.get("created_by","")})
    db.commit()
    new_id = result.fetchone()[0]
    return {"status": "success", "data": {"id": new_id}}

@router.patch("/catalogo/{product_id}")
def update_catalogo_product(product_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    allowed = ["nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion","descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario","codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords"]
    json_fields = ["imagenes","atributos","variantes"]
    sets = []
    params: dict = {"id": product_id, "now": datetime.datetime.utcnow()}
    for k in allowed:
        if k in body:
            sets.append(f"{k}=:{k}")
            params[k] = body[k]
    for k in json_fields:
        if k in body:
            sets.append(f"{k}=CAST(:{k} AS jsonb)")
            params[k] = json_mod.dumps(body[k])
    if not sets:
        raise HTTPException(400, "Nada que actualizar")
    sets.append("updated_at=:now")
    db.execute(text(f"UPDATE ecommerce_products SET {', '.join(sets)} WHERE id=:id"), params)
    db.commit()
    return {"status": "success"}

@router.delete("/catalogo/{product_id}")
def delete_catalogo_product(product_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("DELETE FROM ecommerce_products WHERE id=:id"), {"id": product_id})
    db.commit()
    return {"status": "success"}

@router.get("/categorias")
def get_categorias_web(db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT DISTINCT categoria, sub_categoria FROM ecommerce_products WHERE publicado_web=TRUE AND categoria IS NOT NULL ORDER BY categoria, sub_categoria")).fetchall()
        cat_map: dict = {}
        for r in rows:
            cat = r[0] or "General"
            sub = r[1]
            if cat not in cat_map:
                cat_map[cat] = {"nombre": cat, "sub_categorias": []}
            if sub and sub not in cat_map[cat]["sub_categorias"]:
                cat_map[cat]["sub_categorias"].append(sub)
        return {"status": "success", "data": list(cat_map.values())}
    except Exception:
        return {"status": "success", "data": []}


# --- MEDIA REPOSITORY ---
@router.get("/media")
def list_media(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT id, filename, url, tipo, tags, size_bytes, uploaded_by, created_at FROM media_repository ORDER BY created_at DESC LIMIT 200")).fetchall()
        return {"status": "success", "data": [{"id": r[0], "filename": r[1], "url": r[2], "tipo": r[3], "tags": r[4] or [], "size_bytes": r[5] or 0, "uploaded_by": r[6], "created_at": r[7].isoformat() if r[7] else None} for r in rows]}
    except Exception:
        return {"status": "success", "data": []}

@router.post("/media", status_code=201)
def upload_media(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    result = db.execute(text("INSERT INTO media_repository (filename, url, tipo, tags, size_bytes, uploaded_by) VALUES (:fn, :url, :tipo, CAST(:tags AS jsonb), :size, :user) RETURNING id"), {"fn": body.get("filename","imagen"), "url": body.get("url",""), "tipo": body.get("tipo","imagen"), "tags": json_mod.dumps(body.get("tags",[])), "size": body.get("size_bytes",0), "user": body.get("uploaded_by","")})
    db.commit()
    return {"status": "success", "data": {"id": result.fetchone()[0]}}

@router.delete("/media/{media_id}")
def delete_media(media_id: int, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("DELETE FROM media_repository WHERE id=:id"), {"id": media_id})
    db.commit()
    return {"status": "success"}


# --- WEB BUILDER ---
@router.get("/web-builder/config")
def get_web_config(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        rows = db.execute(text("SELECT config_key, config_value FROM web_builder_config")).fetchall()
        return {"status": "success", "data": {r[0]: r[1] for r in rows}}
    except Exception:
        return {"status": "success", "data": {}}

@router.patch("/web-builder/config")
def update_web_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    for key, value in body.items():
        val_json = json_mod.dumps(value) if not isinstance(value, str) else json_mod.dumps(value)
        db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES (:k, CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=CAST(:v AS jsonb), updated_at=NOW()"), {"k": key, "v": val_json})
    db.commit()
    return {"status": "success"}

@router.post("/web-builder/chat")
def web_builder_chat(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    instruction = (body.get("instruction", "") or "").lower()
    changes: dict = {}
    suggestions: list = []
    if any(w in instruction for w in ["color","fondo","background","paleta","tema"]):
        changes["theme"] = {"primary": body.get("primary_color","#6C3EC0"), "secondary": "#f8f9fa", "accent": "#9F7AEA"}
        suggestions.append("Paleta de colores actualizada")
    if any(w in instruction for w in ["hero","banner","inicio","cabecera"]):
        changes["hero"] = {"title": body.get("title","Bienvenido a Nebulae"), "subtitle": body.get("subtitle","Productos de calidad para ti"), "cta_text": body.get("cta_text","Comprar Ahora"), "cta_url": "/store/catalogo", "bg_image": body.get("bg_image","")}
        suggestions.append("Sección hero/banner configurada")
    if any(w in instruction for w in ["producto","categor","destacado","seccion"]):
        changes["featured_section"] = {"enabled": True, "title": body.get("section_title","Productos Destacados"), "categoria": body.get("categoria",""), "limit": body.get("limit",8), "layout": body.get("layout","grid")}
        suggestions.append("Sección de productos destacados configurada")
    if any(w in instruction for w in ["contacto","whatsapp","telefono","email","direccion"]):
        changes["contact"] = {"phone": body.get("phone",""), "whatsapp": body.get("whatsapp",""), "email": body.get("email",""), "address": body.get("address","")}
        suggestions.append("Información de contacto actualizada")
    if any(w in instruction for w in ["blog","articulo","post","contenido"]):
        changes["blog"] = {"enabled": True, "title": body.get("blog_title","Blog Nebulae"), "posts_home": body.get("posts_home", 3)}
        suggestions.append("Sección de blog habilitada")

    response_text = "He procesado tu instrucción. " + ". ".join(suggestions) if suggestions else (
        "Entendido. Puedo configurar: 🎨 colores/tema, 🖼️ sección hero/banner, 📦 productos destacados por categoría, 📞 información de contacto, 📝 blog. ¿Qué quieres cambiar?"
    )
    # Apply changes if any
    if changes:
        for key, value in changes.items():
            db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES (:k, CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=CAST(:v AS jsonb), updated_at=NOW()"), {"k": key, "v": json_mod.dumps(value)})
        db.commit()
    return {"status": "success", "data": {"response": response_text, "changes": changes, "applied": len(changes) > 0}}


# --- PAGOS CONFIG ---
@router.get("/pagos/config")
def get_payment_config(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        row = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='payment_gateways'")).fetchone()
        if row and row[0]:
            config = dict(row[0])
            for gw, sk_field in [("stripe","secret_key"),("mercadopago","access_token")]:
                if gw in config:
                    sk = config[gw].get(sk_field,"")
                    config[gw][f"{sk_field}_masked"] = ("*"*max(0,len(sk)-4)+sk[-4:]) if sk else ""
                    config[gw].pop(sk_field, None)
            return {"status": "success", "data": config}
    except Exception:
        pass
    return {"status": "success", "data": {"stripe": {"enabled": False, "publishable_key": "", "webhook_secret": ""}, "mercadopago": {"enabled": False, "public_key": ""}}}

@router.patch("/pagos/config")
def update_payment_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    existing = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='payment_gateways'")).fetchone()
    existing_data: dict = dict(existing[0]) if existing and existing[0] else {}
    for gateway, config in body.items():
        if gateway in ["stripe","mercadopago"]:
            if gateway not in existing_data:
                existing_data[gateway] = {}
            existing_data[gateway].update(config)
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('payment_gateways', CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=CAST(:v AS jsonb), updated_at=NOW()"), {"v": json_mod.dumps(existing_data)})
    db.commit()
    return {"status": "success"}

@router.get("/envios/config")
def get_shipping_config(user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    try:
        row = db.execute(text("SELECT config_value FROM web_builder_config WHERE config_key='shipping'")).fetchone()
        if row and row[0]:
            return {"status": "success", "data": row[0]}
    except Exception:
        pass
    return {"status": "success", "data": {"envio_local": {"enabled": True, "tarifa": 12000}, "envio_nacional": {"enabled": True, "tarifa": 25000}, "envio_gratis_desde": 200000, "zonas": []}}

@router.patch("/envios/config")
def update_shipping_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    db.execute(text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('shipping', CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=CAST(:v AS jsonb), updated_at=NOW()"), {"v": json_mod.dumps(body)})
    db.commit()
    return {"status": "success"}

@router.get("/fulfillment/config")
def get_fulfillment_config(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    auth_warehouses, default_wh = _get_authorized_ecommerce_warehouses(db)
    return {
        "status": "success",
        "data": {
            "authorized_warehouse_ids": [w.id for w in auth_warehouses],
            "default_warehouse_id": default_wh.id if default_wh else None,
            "warehouses": [{"id": w.id, "name": w.name, "location_type": w.location_type} for w in auth_warehouses]
        }
    }

@router.patch("/fulfillment/config")
def update_fulfillment_config(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    _ensure_ecommerce_tables(db)
    auth_ids = [int(x) for x in body.get("authorized_warehouse_ids", [])]
    def_id = body.get("default_warehouse_id")
    val = {"authorized_warehouse_ids": auth_ids, "default_warehouse_id": int(def_id) if def_id is not None else (auth_ids[0] if auth_ids else None)}
    db.execute(
        text("INSERT INTO web_builder_config (config_key, config_value, updated_at) VALUES ('ecommerce_fulfillment', CAST(:v AS jsonb), NOW()) ON CONFLICT (config_key) DO UPDATE SET config_value=CAST(:v AS jsonb), updated_at=NOW()"),
        {"v": json_mod.dumps(val)}
    )
    db.commit()
    return {"status": "success", "data": val}


# --- CLIENTES WEB → AGENDA CRM ---
@router.get("/clientes")
def list_clientes_web(user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """Lista clientes únicos que han realizado pedidos web (canal_venta=WEB)"""
    web_orders = db.query(SaleOrder).filter(
        SaleOrder.canal_venta == 'WEB',
        SaleOrder.customer_email.isnot(None)
    ).all()
    # Deduplicate by email
    seen = set()
    clientes = []
    for o in web_orders:
        email = (o.customer_email or "").lower()
        if email and email not in seen:
            seen.add(email)
            # Check if already in CRM agenda
            from app.models.customers import Customer
            crm_customer = db.query(Customer).filter(Customer.email == email).first()
            clientes.append({
                "email": o.customer_email,
                "nombre": o.customer_name,
                "telefono": o.customer_phone,
                "address": o.customer_address,
                "primer_pedido": o.created_at.isoformat() if o.created_at else None,
                "total_pedidos": sum(1 for x in web_orders if (x.customer_email or "").lower() == email),
                "total_cop": sum(float(x.total_cop or 0) for x in web_orders if (x.customer_email or "").lower() == email),
                "en_agenda": crm_customer is not None,
                "crm_id": crm_customer.id if crm_customer else None,
            })
    return {"status": "success", "total": len(clientes), "data": clientes}


@router.post("/clientes/sync-agenda")
def sync_clientes_web_to_agenda(body: Optional[dict] = Body(default={}), user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)), db: Session = Depends(get_db)):
    """Importa clientes web a la agenda CRM marcados como canal=WEB"""
    from app.models.customers import Customer
    if not body:
        body = {}
    emails = body.get("emails", [])  # list of emails to sync, or empty = all
    web_orders = db.query(SaleOrder).filter(
        SaleOrder.canal_venta == 'WEB',
        SaleOrder.customer_email.isnot(None)
    ).all()
    seen: dict = {}
    for o in web_orders:
        email = (o.customer_email or "").lower()
        if email and email not in seen:
            seen[email] = o
    if emails:
        to_sync = {e.lower(): seen[e.lower()] for e in emails if e.lower() in seen}
    else:
        to_sync = seen
    imported = 0
    already_exists = 0
    for email, order in to_sync.items():
        existing = db.query(Customer).filter(Customer.email == email).first()
        if existing:
            already_exists += 1
            continue
        # Parse name parts
        full_name = (order.customer_name or "").strip()
        parts = full_name.split(" ", 1)
        first_name = parts[0] if parts else "Cliente"
        last_name = parts[1] if len(parts) > 1 else "Web"
        new_customer = Customer(
            first_name=first_name,
            last_name=last_name + " [WEB]",
            email=order.customer_email,
            phone=order.customer_phone,
            address=order.customer_address,
            city=None,
            document=None,
        )
        db.add(new_customer)
        imported += 1
    db.commit()
    return {"status": "success", "data": {"importados": imported, "ya_existian": already_exists, "total_procesados": len(to_sync)}}
