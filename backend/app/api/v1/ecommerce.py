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
    """
    Obtiene el siguiente valor de seq_pweb.
    La secuencia es creada por Alembic (fa5_002). Si no existe es un error
    de migración — se lanza para visibilidad, no se crea DDL desde aquí.
    """
    r = db.execute(text("SELECT nextval('seq_pweb')")).scalar()
    return int(r)


def _gen_pweb_numero(db: Session) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq_pweb(db)
    return f"PWEB-{year}{n:04d}"


def _assert_ecommerce_tables_ready(db: Session) -> None:
    """
    Verifica que el esquema ecommerce está disponible. Falla con 503 si no.

    WEB-2B.1: El esquema ecommerce es responsabilidad exclusiva de Alembic (fa_web2b1_001).
    El usuario runtime nebulae_prod NUNCA ejecuta DDL. Los endpoints GET públicos
    nunca modifican el esquema. Si falta la tabla, la migración no se ha ejecutado.

    Acción correctiva: ejecutar 'alembic upgrade fa_web2b1_001' con el rol migrador.
    """
    try:
        db.execute(text("SELECT 1 FROM ecommerce_products LIMIT 0"))
    except Exception:
        raise HTTPException(
            status_code=503,
            detail={
                "error": "SCHEMA_NOT_READY",
                "message": (
                    "El esquema ecommerce no está disponible. "
                    "Ejecute la migración fa_web2b1_001 con el rol migrador."
                ),
            },
        )


# Alias para compatibilidad con llamadas existentes a _ensure_ecommerce_tables.
# WEB-2B.1: Ya no crea DDL — solo verifica que el esquema existe.
def _ensure_ecommerce_tables(db: Session) -> None:
    _assert_ecommerce_tables_ready(db)




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



def _get_real_sellable_stock(
    db: Session,
    sku_id: int,
    warehouse_id: Optional[int] = None,
    owner: str = "NEBULAE",
    authorized_warehouse_ids: Optional[list] = None,
) -> Decimal:
    """
    Calcula el stock vendible real del propietario para un SKU.

    Fórmula:
        stock_vendible = InventoryOwnerBalance(owner, sku, auth_whs)
                       - InventoryReservation(ACTIVE, owner, sku, auth_whs)

    Notas de implementación (WEB-2B.1):
    - InventoryOwnerBalance ya representa EXCLUSIVAMENTE unidades físicas conformes del propietario.
      Las unidades en cuarentena (InventoryQuarantine) NO están incluidas, no se restan aquí.
    - Las reservas ACTIVE bloquean stock comprometido. RELEASED/CONVERTED/EXPIRED no se restan.
    - NUNCA mezcla inventario de MAU con NEBULAE ni de warehouse no autorizado.
    - authorized_warehouse_ids: si se proporciona, filtra el cómputo SOLO a esas bodegas.
      Si la lista está vacía → retorna 0 (sin bodegas autorizadas = sin stock computable).
    - Si warehouse_id se proporciona, filtra a esa bodega específica (debe estar en auth list).
    - Siempre retorna max(disponible, 0) — nunca negativo.

    Prohibiciones:
    - No usar Warehouse.first(), warehouse_id=1 o cualquier fallback de bodega.
    - No inferir disponibilidad de ProductSKU.inventory_levels (legacy).
    - No incluir bodegas MAU ni bodegas no autorizadas para ecommerce.
    """
    # If explicit empty list of authorized warehouses → no stock available
    if authorized_warehouse_ids is not None and len(authorized_warehouse_ids) == 0:
        return Decimal("0.0")

    # 1. Balance por propietario en bodegas autorizadas
    bal_q = db.query(func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0)).filter(
        InventoryOwnerBalance.sku_id == sku_id,
        InventoryOwnerBalance.owner == owner,
    )
    if warehouse_id:
        bal_q = bal_q.filter(InventoryOwnerBalance.warehouse_id == warehouse_id)
    elif authorized_warehouse_ids:
        bal_q = bal_q.filter(InventoryOwnerBalance.warehouse_id.in_(authorized_warehouse_ids))
    balance_owner = Decimal(str(bal_q.scalar() or 0))

    # 2. Reservas activas en las mismas bodegas autorizadas
    res_q = db.query(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0)).filter(
        InventoryReservation.sku_id == sku_id,
        InventoryReservation.owner == owner,
        InventoryReservation.status == "ACTIVE",
    )
    if warehouse_id:
        res_q = res_q.filter(InventoryReservation.warehouse_id == warehouse_id)
    elif authorized_warehouse_ids:
        res_q = res_q.filter(InventoryReservation.warehouse_id.in_(authorized_warehouse_ids))
    reservas_activas = Decimal(str(res_q.scalar() or 0))

    disponible = balance_owner - reservas_activas
    return max(disponible, Decimal("0.0"))


def _get_authorized_ecommerce_warehouses(db: Session):
    """
    Obtiene la lista de bodegas autorizadas para fulfillment ecommerce.

    WEB-2B.1 — Reglas estrictas:
    1. Fuente primaria: web_builder_config (config_key='ecommerce_fulfillment').
       authorized_warehouse_ids: lista de IDs enteros explícitos.
    2. Fuente secundaria: variable de entorno ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS.
    3. SIN configuración explícita: retorna ([], None). NINGÚN producto es comprable.
       NO hay fallback a todas las bodegas Central.
       Razón: un fallback automático comprometería stock de bodegas no autorizadas para ecommerce.
    4. Toda bodega autorizada DEBE existir en la DB y tener location_type='Central'.
       Bodegas de tipo 'Remota' o 'Consignacion' no son elegibles.
    5. No usa Warehouse.first() ni IDs hardcodeados.

    Retorna: (bodegas_autorizadas: list[Warehouse], bodega_por_defecto: Warehouse | None)
    """
    explicit_ids: Optional[list[int]] = None
    default_id: Optional[int] = None

    # 1. DB config
    try:
        row = db.execute(
            text("SELECT config_value FROM web_builder_config WHERE config_key='ecommerce_fulfillment'")
        ).fetchone()
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

    # 2. Env var (only if DB config not found)
    if explicit_ids is None and "ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS" in os.environ:
        raw_env = os.environ.get("ECOMMERCE_AUTHORIZED_WAREHOUSE_IDS", "").strip()
        if raw_env:
            explicit_ids = [int(x.strip()) for x in raw_env.split(",") if x.strip().isdigit()]
        else:
            explicit_ids = []
        raw_def = os.environ.get("ECOMMERCE_DEFAULT_WAREHOUSE_ID", "").strip()
        if raw_def and raw_def.isdigit():
            default_id = int(raw_def)

    # 3. WEB-2B.1: NO fallback. Sin config explícita → nada es comprable.
    if explicit_ids is None:
        return [], None

    # Empty list explicitly configured → no fulfillment
    if not explicit_ids:
        return [], None

    # Validate: all authorized IDs must exist and be Central
    whs = db.query(Warehouse).filter(
        Warehouse.id.in_(explicit_ids),
        Warehouse.location_type == "Central",
    ).all()

    if not whs:
        return [], None

    # Resolve default warehouse
    def_wh: Optional[Warehouse] = None
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
    # seq_ven es creada por Alembic (fa5_002). No se crea DDL desde aquí.
    pweb_numero = _gen_pweb_numero(db)
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
        # WEB-2B.1 fix: resolved_wh_id is the validated warehouse from step 6.
        # default_wh_id was undefined here — caused NameError on edge case.
        wh_id = vl["warehouse_id"] or resolved_wh_id
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
        # WEB-2B.1: Include new fields sku_id, purchasable, requires_configuration, availability_source, modalidad
        rows = db.execute(text(
            f"SELECT id, nombre, descripcion, sku, precio_venta, precio_comparacion, descuento_pct, "
            f"impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, atributos, variantes, "
            f"stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, seo_titulo, "
            f"created_at, updated_at, "
            f"COALESCE(sku_id, NULL) AS sku_id, "
            f"COALESCE(purchasable, FALSE) AS purchasable, "
            f"COALESCE(requires_configuration, FALSE) AS requires_configuration, "
            f"COALESCE(availability_source, 'MANUAL') AS availability_source, "
                        f"COALESCE(modalidad, 'POR_PEDIDO') AS modalidad "
            f"FROM ecommerce_products {where_sql} ORDER BY nombre LIMIT :limit"
        ), params).fetchall()
        total = int(db.execute(text(f"SELECT COUNT(*) FROM ecommerce_products {where_sql}"), {k:v for k,v in params.items() if k!="limit"}).scalar() or 0)

        # WEB-2B.1: Resolve authorized warehouses ONCE for the entire catalog response
        auth_whs, _ = _get_authorized_ecommerce_warehouses(db)
        auth_wh_ids = [w.id for w in auth_whs] if auth_whs else []

        data = []
        seen_skus = set()
        for r in rows:
            # r indices: 0=id,1=nombre,2=desc,3=sku,4=pv,5=pc,6=dpct,7=ipct,8=cat,9=subcat,10=marca,11=tipo
            # 12=img,13=attr,14=var,15=stock,16=alerta,17=pub,18=rastrear,19=seo,20=cat,21=upd
            # 22=sku_id,23=purchasable,24=requires_conf,25=avail_source,26=modalidad
            sku_code = r[3]
            sku_id_db = r[22]  # FK to product_skus
            purchasable_db = bool(r[23])
            availability_source_db = r[25] or "MANUAL"
            modalidad_db = r[26] or "POR_PEDIDO"

            stock_disp = float(r[15] or 0)

            # WEB-2B.1: Real stock only via FK sku_id, scoped to authorized warehouses only.
            # No SKU-string lookup fallback.
            if sku_id_db:
                real_stock = _get_real_sellable_stock(
                    db, sku_id_db, owner="NEBULAE",
                    authorized_warehouse_ids=auth_wh_ids if auth_wh_ids else None,
                )
                stock_disp = float(real_stock)
                availability_source_db = "REAL"
            else:
                availability_source_db = "UNCONFIRMED"

            if sku_code:
                seen_skus.add(sku_code)

            # WEB-2B.1: Honest modality — requires BOTH purchasable AND sku_id.
            if purchasable_db and sku_id_db and modalidad_db in ("ENTREGA_INMEDIATA", "POR_PEDIDO"):
                modalidad_disponible = modalidad_db
            else:
                modalidad_disponible = "DISPONIBILIDAD_POR_CONFIRMAR"

            alerta = r[16] or 5
            is_low = stock_disp > 0 and stock_disp <= alerta

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
                # WEB-2B.1: Honest modality — never inferred from stock
                "modalidad_disponible": modalidad_disponible,
                "modalidad": modalidad_db,
                # WEB-2B.1: New fields
                "sku_id": sku_id_db,
                "purchasable": bool(purchasable_db),
                "requires_configuration": bool(r[24]),
                "availability_source": availability_source_db,
                "alerta_stock_minimo": alerta,
                "publicado_web": r[17],
                "rastrear_inventario": r[18],
                "seo_titulo": r[19],
                "created_at": r[20].isoformat() if r[20] else None,
                "updated_at": r[21].isoformat() if r[21] else None,
                "is_low_stock": is_low,
            })

        return {"status": "success", "total": total, "data": data}
    except Exception:
        # WEB-2B.1: Never return HTTP 200 with an error key — this leaks internal details
        # and confuses clients into thinking the catalog is empty.
        raise HTTPException(
            status_code=503,
            detail={"error": "CATALOG_ERROR", "message": "Error al cargar el catálogo. Intente de nuevo."}
        )




@router.get("/catalogo/{product_id}")
def get_catalogo_product(product_id: int, db: Session = Depends(get_db)):
    """
    WEB-2B.1: product_id es EXCLUSIVAMENTE ecommerce_products.id.
    Si no existe en ecommerce_products → 404.
    No hay fallback a ProductSKU.id ni Product.id.
    El vínculo ERP proviene únicamente de ecommerce_products.sku_id (FK persistida).
    """
    _ensure_ecommerce_tables(db)
    row = db.execute(text(
        "SELECT id, nombre, descripcion, descripcion_larga, sku, precio_venta, precio_comparacion, "
        "descuento_pct, impuesto_pct, categoria, sub_categoria, marca, tipo_producto, imagenes, "
        "atributos, variantes, stock_disponible, alerta_stock_minimo, publicado_web, rastrear_inventario, "
        "codigo_aduana, peso_kg, notas_internas, seo_titulo, seo_descripcion, seo_keywords, "
        "created_at, updated_at, created_by, "
        "COALESCE(sku_id, NULL) AS sku_id, "
        "COALESCE(purchasable, FALSE) AS purchasable, "
        "COALESCE(requires_configuration, FALSE) AS requires_configuration, "
        "COALESCE(availability_source, 'MANUAL') AS availability_source, "
        "COALESCE(modalidad, 'POR_PEDIDO') AS modalidad "
        "FROM ecommerce_products WHERE id=:id"
    ), {"id": product_id}).fetchone()

    # WEB-2B.1: ID is exclusively ecommerce_products.id — no ERP fallback.
    if not row:
        raise HTTPException(status_code=404, detail="Producto no encontrado en el catálogo ecommerce")

    keys = [
        "id","nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion",
        "descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto","imagenes",
        "atributos","variantes","stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario",
        "codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords",
        "created_at","updated_at","created_by",
        "sku_id","purchasable","requires_configuration","availability_source","modalidad"
    ]
    data = dict(zip(keys, row))
    sku_id_db = data.get("sku_id")
    availability_source_db = data.get("availability_source") or "MANUAL"
    modalidad_db = data.get("modalidad") or "POR_PEDIDO"
    purchasable_db = bool(data.get("purchasable"))

    # Real stock only via FK sku_id — no string-SKU lookup fallback
    if sku_id_db:
        real_stock = float(_get_real_sellable_stock(db, sku_id_db, owner="NEBULAE"))
        data["stock_disponible"] = real_stock
        availability_source_db = "REAL"

    # WEB-2B.1: Honest modality — never inferred from stock alone
    if purchasable_db and sku_id_db and modalidad_db in ("ENTREGA_INMEDIATA", "POR_PEDIDO"):
        data["modalidad_disponible"] = modalidad_db
    else:
        data["modalidad_disponible"] = "DISPONIBILIDAD_POR_CONFIRMAR"

    data["availability_source"] = availability_source_db
    data["purchasable"] = purchasable_db

    # Sales analytics
    ventas_prod = db.query(SaleOrder).filter(SaleOrder.canal_venta=='WEB', SaleOrder.estado!='CANCELADO').all()
    total_vendido = sum(
        p.get("qty", p.get("cantidad", 0))
        for o in ventas_prod
        for p in (o.productos or [])
        if p.get("sku") == data.get("sku") or p.get("nombre","").lower() == (data.get("nombre") or "").lower()
    )
    data["total_vendido"] = total_vendido
    for k in ["created_at","updated_at"]:
        if data.get(k) and hasattr(data[k],"isoformat"):
            data[k] = data[k].isoformat()
    return {"status": "success", "data": data}




@router.get("/catalogo/{product_id}/disponibilidad")
def get_product_disponibilidad(product_id: int, db: Session = Depends(get_db)):
    """
    WEB-2B.1: Endpoint público de disponibilidad real para un producto.
    No requiere autenticación — solo expone campos seguros para el frontend.

    Permite al frontend consultar disponibilidad sin recargar el producto completo.
    Responde con:
    - stock_vendible: unidades vendibles NEBULAE reales (InventoryOwnerBalance - InventoryReservation ACTIVE)
    - modalidad: política de entrega configurada en ecommerce_products
    - modalidad_disponible: modalidad honesta (DISPONIBILIDAD_POR_CONFIRMAR si sin vínculo canónico)
    - purchasable: si el producto está listo para compra (tiene sku_id válido y modalidad configurada)
    - availability_source: REAL | MANUAL | UNCONFIRMED
    - requires_supplier_confirmation: True si no es ENTREGA_INMEDIATA directa
    """
    _ensure_ecommerce_tables(db)
    now_ts = datetime.datetime.utcnow().isoformat() + "Z"

    # Try ecommerce_products first
    row = db.execute(text(
        "SELECT id, sku, "
        "COALESCE(sku_id, NULL) AS sku_id, "
        "COALESCE(purchasable, FALSE) AS purchasable, "
        "COALESCE(requires_configuration, FALSE) AS requires_configuration, "
        "COALESCE(availability_source, 'MANUAL') AS availability_source, "
        "COALESCE(modalidad, 'POR_PEDIDO') AS modalidad, "
        "COALESCE(alerta_stock_minimo, 5) AS alerta, "
        "COALESCE(rastrear_inventario, TRUE) AS rastrear "
        "FROM ecommerce_products WHERE id=:id"
    ), {"id": product_id}).fetchone()

    # WEB-2B.1: product_id is exclusively ecommerce_products.id — no ERP fallback.
    if not row:
        raise HTTPException(status_code=404, detail="Producto no encontrado en el catálogo ecommerce")

    sku_id_db = row[2]
    purchasable_db = bool(row[3])
    requires_conf_db = bool(row[4])
    availability_source_db = row[5] or "MANUAL"
    modalidad_db = row[6] or "POR_PEDIDO"
    alerta_db = int(row[7] or 5)
    rastrear = bool(row[8])

    # Resolve real sellable stock — only via persisted FK sku_id, no string-SKU fallback
    if sku_id_db:
        real_stock = float(_get_real_sellable_stock(db, sku_id_db, owner="NEBULAE"))
        availability_source_db = "REAL"
    else:
        # No persisted sku_id → no real stock can be computed
        real_stock = 0.0
        availability_source_db = "UNCONFIRMED"

    # WEB-2B.1: Honest modality — requires BOTH purchasable AND sku_id
    if purchasable_db and sku_id_db and modalidad_db in ("ENTREGA_INMEDIATA", "POR_PEDIDO"):
        modalidad_disponible = modalidad_db
    else:
        modalidad_disponible = "DISPONIBILIDAD_POR_CONFIRMAR"

    requires_supplier_confirmation = (modalidad_disponible != "ENTREGA_INMEDIATA")

    # WEB-2B.1: max_orderable — no magic 99.
    # ENTREGA_INMEDIATA: bounded by real stock.
    # POR_PEDIDO: null (no stock ceiling — business policy set elsewhere).
    # DISPONIBILIDAD_POR_CONFIRMAR: null (not purchasable).
    if modalidad_disponible == "ENTREGA_INMEDIATA":
        max_orderable: Optional[int] = max(0, int(real_stock))
    else:
        max_orderable = None  # POR_PEDIDO or UNCONFIRMED — null, not 99

    # WEB-2B.1: can_purchase strict AND — DISPONIBILIDAD_POR_CONFIRMAR is never purchasable
    can_purchase = (
        purchasable_db
        and bool(sku_id_db)
        and modalidad_disponible in ("ENTREGA_INMEDIATA", "POR_PEDIDO")
        and not requires_conf_db
        and (
            modalidad_disponible == "POR_PEDIDO"
            or (modalidad_disponible == "ENTREGA_INMEDIATA" and real_stock > 0)
        )
    )

    # disponible: product can be placed in cart
    disponible = can_purchase


    return {
        "status": "success",
        "data": {
            "product_id": product_id,
            "sku_id": sku_id_db,
            "sku": row[1],
            "stock_vendible": real_stock,
            "max_orderable": max_orderable,
            # WEB-2B.1: disponible = strict can_purchase (all AND conditions)
            "disponible": disponible,
            "modalidad": modalidad_db,
            "modalidad_disponible": modalidad_disponible,
            "purchasable": purchasable_db,
            "requires_configuration": requires_conf_db,
            "requires_supplier_confirmation": requires_supplier_confirmation,
            "availability_source": availability_source_db,
            "alerta_stock_minimo": alerta_db,
            # warehouse_id intentionally null: stock is aggregated across authorized warehouses.
            # Exposing individual warehouse IDs would leak internal logistics data.
            "warehouse_id": None,
            "timestamp": now_ts,
        }
    }


@router.post("/catalogo", status_code=201)
def create_catalogo_product(body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    """
    WEB-2B.1: Crea un producto en el catálogo ecommerce.
    Admin rechaza publicación con purchasable=true y sku_id=null (sin vínculo canónico).
    Los campos WEB-2B.1 (sku_id, purchasable, etc.) se aceptan en la creación.
    """
    _ensure_ecommerce_tables(db)

    # WEB-2B.1: Validation — cannot publish purchasable without sku_id
    sku_id = body.get("sku_id")
    purchasable = bool(body.get("purchasable", False))
    publicado_web = bool(body.get("publicado_web", False))
    modalidad = body.get("modalidad", "POR_PEDIDO")

    if purchasable and not sku_id:
        raise HTTPException(
            status_code=422,
            detail="No se puede crear un producto purchasable=true sin un sku_id válido. Vincule primero el SKU del ERP."
        )
    if publicado_web and purchasable and not sku_id:
        raise HTTPException(
            status_code=422,
            detail="No se puede publicar un producto como comprable sin sku_id."
        )
    if modalidad == "ENTREGA_INMEDIATA" and not sku_id:
        raise HTTPException(
            status_code=422,
            detail="modalidad=ENTREGA_INMEDIATA requiere sku_id. Sin vínculo canónico use POR_PEDIDO o DISPONIBILIDAD_POR_CONFIRMAR."
        )

    # Validate sku_id exists if provided
    if sku_id:
        sku_rec = db.query(ProductSKU).filter(ProductSKU.id == int(sku_id)).first()
        if not sku_rec:
            raise HTTPException(status_code=422, detail=f"sku_id={sku_id} no existe en product_skus.")
        # Check parent product is active
        if sku_rec.product and not sku_rec.product.is_active:
            raise HTTPException(status_code=422, detail=f"El producto padre del sku_id={sku_id} está inactivo.")

    now = datetime.datetime.utcnow()
    result = db.execute(text("""
        INSERT INTO ecommerce_products (
            nombre,descripcion,descripcion_larga,sku,precio_venta,precio_comparacion,
            descuento_pct,impuesto_pct,categoria,sub_categoria,marca,tipo_producto,
            imagenes,atributos,variantes,stock_disponible,alerta_stock_minimo,
            publicado_web,rastrear_inventario,codigo_aduana,peso_kg,notas_internas,
            seo_titulo,seo_descripcion,seo_keywords,created_at,updated_at,created_by,
            sku_id,purchasable,requires_configuration,availability_source,modalidad
        )
        VALUES (
            :nombre,:descripcion,:descripcion_larga,:sku,:precio_venta,:precio_comparacion,
            :descuento_pct,:impuesto_pct,:categoria,:sub_categoria,:marca,:tipo_producto,
            CAST(:imagenes AS jsonb),CAST(:atributos AS jsonb),CAST(:variantes AS jsonb),
            :stock_disponible,:alerta_stock_minimo,:publicado_web,:rastrear_inventario,
            :codigo_aduana,:peso_kg,:notas_internas,:seo_titulo,:seo_descripcion,:seo_keywords,
            :now,:now,:created_by,
            :sku_id,:purchasable,:requires_configuration,:availability_source,:modalidad
        )
        RETURNING id
    """), {
        "nombre": body.get("nombre",""),
        "descripcion": body.get("descripcion"),
        "descripcion_larga": body.get("descripcion_larga"),
        "sku": body.get("sku"),
        "precio_venta": body.get("precio_venta", 0),
        "precio_comparacion": body.get("precio_comparacion", 0),
        "descuento_pct": body.get("descuento_pct", 0),
        "impuesto_pct": body.get("impuesto_pct", 0),
        "categoria": body.get("categoria"),
        "sub_categoria": body.get("sub_categoria"),
        "marca": body.get("marca"),
        "tipo_producto": body.get("tipo_producto", "Bienes"),
        "imagenes": json_mod.dumps(body.get("imagenes", [])),
        "atributos": json_mod.dumps(body.get("atributos", [])),
        "variantes": json_mod.dumps(body.get("variantes", [])),
        "stock_disponible": body.get("stock_disponible", 0),
        "alerta_stock_minimo": body.get("alerta_stock_minimo", 5),
        "publicado_web": publicado_web,
        "rastrear_inventario": body.get("rastrear_inventario", True),
        "codigo_aduana": body.get("codigo_aduana"),
        "peso_kg": body.get("peso_kg"),
        "notas_internas": body.get("notas_internas"),
        "seo_titulo": body.get("seo_titulo"),
        "seo_descripcion": body.get("seo_descripcion"),
        "seo_keywords": body.get("seo_keywords"),
        "now": now,
        "created_by": body.get("created_by", user.username if hasattr(user, "username") else ""),
        "sku_id": int(sku_id) if sku_id else None,
        "purchasable": purchasable,
        "requires_configuration": bool(body.get("requires_configuration", not bool(sku_id))),
        "availability_source": body.get("availability_source", "REAL" if sku_id else "UNCONFIRMED"),
        "modalidad": modalidad,
    })
    db.commit()
    new_id = result.fetchone()[0]
    return {"status": "success", "data": {"id": new_id}}


@router.patch("/catalogo/{product_id}")
def update_catalogo_product(product_id: int, body: dict, user: User = Depends(require_roles(*ROLE_ADMIN)), db: Session = Depends(get_db)):
    """
    WEB-2B.1: Actualiza un producto del catálogo.
    Incluye campos WEB-2B.1. Rechaza publicación inválida.
    """
    _ensure_ecommerce_tables(db)

    # WEB-2B.1: validation of purchasable/sku_id consistency
    if "purchasable" in body or "sku_id" in body or "publicado_web" in body:
        # Load current values to merge
        cur = db.execute(text(
            "SELECT sku_id, purchasable, publicado_web, modalidad FROM ecommerce_products WHERE id=:id"
        ), {"id": product_id}).fetchone()
        if not cur:
            raise HTTPException(status_code=404, detail="Producto no encontrado")

        new_sku_id = body.get("sku_id", cur[0])
        new_purchasable = bool(body.get("purchasable", cur[1]))
        new_publicado = bool(body.get("publicado_web", cur[2]))
        new_modalidad = body.get("modalidad", cur[3] or "POR_PEDIDO")

        if new_purchasable and not new_sku_id:
            raise HTTPException(
                status_code=422,
                detail="No se puede marcar purchasable=true sin un sku_id válido."
            )
        if new_publicado and new_purchasable and not new_sku_id:
            raise HTTPException(
                status_code=422,
                detail="No se puede publicar como comprable sin sku_id."
            )
        if new_modalidad == "ENTREGA_INMEDIATA" and not new_sku_id:
            raise HTTPException(
                status_code=422,
                detail="modalidad=ENTREGA_INMEDIATA requiere sku_id."
            )

    # Validate sku_id exists if being set
    if "sku_id" in body and body["sku_id"] is not None:
        sku_rec = db.query(ProductSKU).filter(ProductSKU.id == int(body["sku_id"])).first()
        if not sku_rec:
            raise HTTPException(status_code=422, detail=f"sku_id={body['sku_id']} no existe en product_skus.")
        if sku_rec.product and not sku_rec.product.is_active:
            raise HTTPException(status_code=422, detail=f"El producto padre del sku_id={body['sku_id']} está inactivo.")

    # WEB-2B.1: include contract fields in allowed list
    allowed_scalar = [
        "nombre","descripcion","descripcion_larga","sku","precio_venta","precio_comparacion",
        "descuento_pct","impuesto_pct","categoria","sub_categoria","marca","tipo_producto",
        "stock_disponible","alerta_stock_minimo","publicado_web","rastrear_inventario",
        "codigo_aduana","peso_kg","notas_internas","seo_titulo","seo_descripcion","seo_keywords",
        # WEB-2B.1 contract fields
        "sku_id","purchasable","requires_configuration","availability_source","modalidad",
    ]
    json_fields = ["imagenes","atributos","variantes"]
    sets = []
    params: dict = {"id": product_id, "now": datetime.datetime.utcnow()}
    for k in allowed_scalar:
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
