import json
import hashlib
from decimal import Decimal
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, status
from sqlalchemy.orm import Session
from sqlalchemy import text, func

from app.db.database import get_db
from app.models.catalog import Product, ProductSKU
from app.models.inventory import Warehouse
from app.models.customers import Customer
from app.models.sales import SalesOrder, SalesOrderLine
from app.models.erp_documents import SaleOrder
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, SaleOrderLineErp
from app.schemas import store as schemas
from app.api.v1.ecommerce import (
    _get_authorized_ecommerce_warehouses,
    _get_real_sellable_stock,
    _gen_pweb_numero
)
from app.services.legacy_consolidation import (
    _get_next_sale_order_numero,
    record_legacy_audit_log,
    _now
)

router = APIRouter()

@router.get("/products", response_model=dict)
def get_public_products(db: Session = Depends(get_db)):
    active_products = db.query(Product).filter(Product.is_active == True).all()
    store_products = []
    
    for product in active_products:
        skus_with_stock = []
        for sku in product.skus:
            total_stock = sum(level.quantity for level in sku.inventory_levels)
            if total_stock > 0:
                attributes_data = []
                for attr_val in sku.attribute_values:
                    attributes_data.append({
                        "attribute": attr_val.attribute.name,
                        "value": attr_val.value
                    })
                
                skus_with_stock.append(schemas.StoreSKU(
                    id=sku.id,
                    sku=sku.sku,
                    sale_price=sku.sale_price,
                    inventory_available=total_stock,
                    attributes=attributes_data
                ))
        
        if skus_with_stock:
            images = [img.image_url_hd for img in product.images]
            store_products.append(schemas.StoreProductResponse(
                id=product.id,
                name=product.name,
                description=product.description,
                brand_name=product.brand.name if product.brand else "",
                category_name=product.category.name if product.category else "",
                images=images,
                skus=skus_with_stock
            ))
            
    return {"status": "success", "data": [p.model_dump() for p in store_products]}

@router.post("/checkout", status_code=status.HTTP_201_CREATED)
def checkout(
    request: schemas.CheckoutRequest,
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
    db: Session = Depends(get_db)
):
    """
    Checkout publico seguro delegado al motor canonico certificado (Fase 6 - Bloqueo 5):
    - Exige idempotencia (Idempotency-Key).
    - Replay identico -> retorna la misma orden.
    - Replay divergente -> 409 Conflict.
    - Calculo de precios exclusivamente desde BD (ProductSKU.sale_price).
    - Resolucion estricta de bodega autorizada para ecommerce.
    - Aislamiento estricto de inventario NEBULAE vs MAU.
    - Bloqueo pesimista concurrrente en reservas de inventario.
    - Estado inicial PENDIENTE_PAGO (CERO pagos confirmados creados).
    - Persistencia atomica en SaleOrder canonica y SalesOrder legacy vinculada.
    """
    if not request.cart:
        raise HTTPException(status_code=400, detail="Cart is empty")

    # 1. Validar Idempotencia
    if not idempotency_key:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El header 'Idempotency-Key' es obligatorio para el checkout."
        )

    # 2. Calcular huella (fingerprint) del pedido
    sorted_items = sorted([{"sku_id": c.sku_id, "quantity": c.quantity} for c in request.cart], key=lambda x: x["sku_id"])
    email_norm = str(request.customer.email or "").strip().lower()
    fp_raw = f"{email_norm}|{json.dumps(sorted_items, sort_keys=True)}"
    fingerprint = hashlib.sha256(fp_raw.encode("utf-8")).hexdigest()

    # 3. Lock consultivo de idempotencia
    db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": f"store_checkout_{idempotency_key}"})

    # 4. Verificar existencia de replay
    existing_so = db.query(SaleOrder).filter(SaleOrder.checkout_idempotency_key == idempotency_key).first()
    if existing_so:
        if existing_so.checkout_fingerprint == fingerprint:
            # Replay identico
            legacy_so = db.query(SalesOrder).filter(SalesOrder.canonical_sale_order_id == existing_so.id).first()
            return {
                "status": "success",
                "idempotent_replay": True,
                "data": {
                    "order_id": legacy_so.id if legacy_so else existing_so.id,
                    "customer_id": existing_so.customer_id,
                    "total": float(existing_so.total_cop or 0.0),
                    "items_count": len(request.cart),
                    "status": legacy_so.status if legacy_so else "PENDING",
                    "canonical_sale_order_id": existing_so.id,
                    "pweb_numero": existing_so.pweb_numero,
                    "estado": existing_so.estado
                }
            }
        else:
            # Replay divergente
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Conflicto de idempotencia: Idempotency-Key ya fue utilizada para un pedido con datos divergentes."
            )

    # 5. Resolucion de bodega ecommerce autorizada
    auth_warehouses, default_wh = _get_authorized_ecommerce_warehouses(db)
    if not auth_warehouses or not default_wh:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Error de configuracion: No existe una bodega central autorizada para fulfillment ecommerce."
        )

    # 6. Resolucion o creacion de cliente
    customer = db.query(Customer).filter(Customer.email == request.customer.email).first()
    if not customer:
        customer = Customer(
            first_name=request.customer.first_name,
            last_name=request.customer.last_name,
            email=request.customer.email,
            phone=request.customer.phone
        )
        db.add(customer)
        db.flush()

    # 7. Validacion de lineas y calculo estricto de precios en backend
    total_order_cop = Decimal("0.00")
    validated_lines = []

    for item in request.cart:
        if item.quantity <= 0:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La cantidad debe ser mayor a 0.")

        sku = db.query(ProductSKU).filter(ProductSKU.id == item.sku_id).first()
        if not sku:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"SKU {item.sku_id} no encontrado en catalogo.")

        # Precio calculado 100% desde BD
        line_price = Decimal(str(sku.sale_price or 0.0))
        if line_price <= 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"El SKU '{sku.sku}' no tiene un precio de venta valido configurado.")

        # Validacion de stock disponible vendible para NEBULAE
        disp_real = _get_real_sellable_stock(db, sku.id, default_wh.id, "NEBULAE")
        if disp_real < Decimal(str(item.quantity)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Stock insuficiente para entrega inmediata de '{sku.sku}'. Disponibles: {disp_real}, solicitadas: {item.quantity}."
            )

        # Bloqueo concurrente pesimista
        bal = db.query(InventoryOwnerBalance).filter(
            InventoryOwnerBalance.sku_id == sku.id,
            InventoryOwnerBalance.warehouse_id == default_wh.id,
            InventoryOwnerBalance.owner == "NEBULAE"
        ).with_for_update().first()

        disp_real = _get_real_sellable_stock(db, sku.id, default_wh.id, "NEBULAE")
        if not bal or disp_real < Decimal(str(item.quantity)):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"Stock insuficiente para reserva concurrente de '{sku.sku}'. Disponibles: {disp_real}, solicitadas: {item.quantity}."
            )

        line_tot = line_price * Decimal(str(item.quantity))
        total_order_cop += line_tot
        validated_lines.append({
            "sku": sku,
            "qty": item.quantity,
            "unit_price": line_price,
            "cost_price": Decimal(str(sku.cost_price or 0.0))
        })

    # 8. Generacion de numeros consecutivos via secuencias PostgreSQL
    pweb_numero = _gen_pweb_numero(db)
    pven_numero = _get_next_sale_order_numero(db, prefix="PVEN")

    # 9. Creacion de SaleOrder canonica
    meta = {
        "idempotency_key": idempotency_key,
        "fingerprint": fingerprint,
        "channel": "STORE_CHECKOUT"
    }

    canonical_so = SaleOrder(
        numero=pven_numero,
        pweb_numero=pweb_numero,
        canal_venta="WEB",
        checkout_idempotency_key=idempotency_key,
        checkout_fingerprint=fingerprint,
        canal_metadata=meta,
        customer_id=customer.id,
        customer_name=f"{customer.first_name} {customer.last_name or ''}".strip(),
        customer_email=customer.email,
        customer_phone=customer.phone,
        total_cop=total_order_cop,
        subtotal_cop=total_order_cop,
        anticipo_cop=Decimal("0.00"),
        saldo_cop=total_order_cop,
        estado="PENDIENTE_PAGO",
        notas="Pedido creado desde Store Checkout publico"
    )
    db.add(canonical_so)
    db.flush()

    # 10. Creacion de lineas canonicas y reservas fisicas
    for vl in validated_lines:
        so_line = SaleOrderLineErp(
            so_id=canonical_so.id,
            sku_id=vl["sku"].id,
            description=vl["sku"].sku,
            quantity=Decimal(str(vl["qty"])),
            unit_price_cop=vl["unit_price"],
            descuento_pct=Decimal("0.00"),
            customer_id=customer.id,
            tax_pct=Decimal("0.00"),
            modalidad="ENTREGA_INMEDIATA",
            owner="NEBULAE",
            quantity_reserved=Decimal(str(vl["qty"])),
            quantity_delivered=Decimal("0"),
            quantity_cancelled=Decimal("0"),
            estado="RESERVADA",
            cost_unit_cop_snapshot=vl["cost_price"],
            price_unit_cop_snapshot=vl["unit_price"],
            source="STORE_CHECKOUT"
        )
        db.add(so_line)
        db.flush()

        res_key = f"RES_STORE_{canonical_so.id}_LINE_{so_line.id}"
        res = InventoryReservation(
            sku_id=vl["sku"].id,
            warehouse_id=default_wh.id,
            owner="NEBULAE",
            quantity_reserved=Decimal(str(vl["qty"])),
            sale_order_line_id=so_line.id,
            status="ACTIVE",
            idempotency_key=res_key,
            created_by="STORE",
            notes=f"Reserva Store pedido {pweb_numero}"
        )
        db.add(res)

    # 11. Creacion de SalesOrder legacy vinculada
    sales_order = SalesOrder(
        customer_id=customer.id,
        user_id=None,
        status="PENDING",
        canonical_sale_order_id=canonical_so.id
    )
    db.add(sales_order)
    db.flush()

    for vl in validated_lines:
        db.add(SalesOrderLine(
            sales_order_id=sales_order.id,
            sku_id=vl["sku"].id,
            quantity=vl["qty"],
            unit_price=float(vl["unit_price"])
        ))
        # NOTA: InventoryLevel.quantity NO se modifica al reservar.
        # El stock fisico solo disminuye al ejecutar el despacho o salida fisica canonica.
        # La disponibilidad vendible baja porque InventoryReservation ACTIVE existe
        # y _get_real_sellable_stock() lo descuenta automaticamente.

    # 12. Auditoria inmutable
    record_legacy_audit_log(
        db=db,
        event_type="LEGACY_WRITE_INTERCEPTED",
        legacy_endpoint="/api/v1/store/checkout",
        http_method="POST",
        entity_type="STORE",
        legacy_id=sales_order.id,
        canonical_id=canonical_so.id,
        idempotency_key=idempotency_key,
        fingerprint=fingerprint,
        discrepancy_details={"total_cop": float(total_order_cop), "items_count": len(request.cart), "pweb_numero": pweb_numero},
        status="ALIGNED"
    )

    db.commit()
    db.refresh(sales_order)
    db.refresh(canonical_so)

    return {
        "status": "success",
        "data": {
            "order_id": sales_order.id,
            "customer_id": customer.id,
            "total": float(total_order_cop),
            "items_count": len(request.cart),
            "status": sales_order.status,
            "canonical_sale_order_id": canonical_so.id,
            "pweb_numero": canonical_so.pweb_numero,
            "estado": canonical_so.estado
        }
    }
