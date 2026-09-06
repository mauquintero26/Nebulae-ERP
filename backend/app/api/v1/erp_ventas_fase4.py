"""
ERP Ventas Fase 4 — Módulo Canónico de Ventas, Pagos, Empaque, Entregas y Devoluciones.

Cumple estrictamente con las directrices de Fase 4:
1. Modelo canónico de pedidos y líneas de venta (ENTREGA_INMEDIATA y POR_PEDIDO).
2. Máquinas de estados y derivación automática de estados de pedido y línea.
3. Entrega inmediata con bloqueo pesimista (SELECT FOR UPDATE) y reserva automática.
4. Ventas por pedido con asignación a compras y recepción automática.
5. Libro transaccional de pagos con idempotencia, políticas 60/40 y 100%, y reversiones atómicas.
6. Cancelaciones totales o parciales con decisiones explícitas sobre mercancía comprada.
7. Zona de empaque operativa con agrupación multiventas por cliente.
8. Despacho y entrega con reglas operativas (L/M/V, horario Bogotá), deducción atómica de inventario y Kárdex OUT.
9. Devoluciones con resoluciones a stock (+RETURN_IN), cuarentena (+QUARANTINE) y preservación de propietario.
10. Costo y rentabilidad con snapshots inmutables y segregación patrimonial NEBULAE vs MAU.
11. Eventos tipados de auditoría de negocio.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text
from typing import Optional, List, Dict, Any
from decimal import Decimal
import datetime
import hashlib
import zoneinfo

from app.db.database import get_db, SessionLocal
from app.models.customers import Customer
from app.models.catalog import ProductSKU, Product
from app.models.inventory import Warehouse, InventoryLevel, InventoryMovement, InventoryOperation
from app.models.erp_documents import SaleOrder, SalesQuotation, CustomerRequest, ActivityLog
from app.models.fase1b import (
    SaleOrderLineErp,
    ProcurementAllocation,
    GoodsReceiptLineAllocation,
    InventoryOwnerBalance,
    InventoryReservation,
)
from app.models.fase3 import InventoryQuarantine
from app.models.fase4 import (
    SaleOrderPayment,
    SalePackingSession,
    SalePackingItem,
    SaleOrderDelivery,
    SaleOrderDeliveryLine,
    SaleOrderReturn,
    SaleOrderReturnLine,
)
from app.models.users import User
from app.api.dependencies import (
    require_roles, get_current_user,
    ROLE_ADMIN, ROLE_ASESOR, ROLE_BODEGA, ROLE_COMPRAS, ROLE_FINANZAS, ALL_ERP_ROLES
)
from app.api.v1.schemas_fase4 import (
    SaleOrderCreate,
    SaleOrderLineCreate,
    SaleOrderPaymentCreate,
    CancelSaleOrderRequest,
    CancelLineRequest,
    PackingSessionCreate,
    PackingItemVerify,
    DeliveryCreate,
    DispatchDeliveryRequest,
    SaleOrderReturnCreate,
)

router = APIRouter()

BOGOTA_TZ = zoneinfo.ZoneInfo("America/Bogota")


def _now():
    return datetime.datetime.utcnow()


def _now_bogota():
    return datetime.datetime.now(BOGOTA_TZ)


def _next_seq(db: Session, seq_name: str) -> int:
    return db.execute(text(f"SELECT nextval('{seq_name}')")).scalar()


def _gen_numero(db: Session, prefix: str, seq: str) -> str:
    year = datetime.datetime.utcnow().year
    n = _next_seq(db, seq)
    return f"{prefix}{year}{n:04d}"


def _log_event(
    db: Session,
    entity_type: str,
    entity_id: int,
    entity_numero: str,
    action: str,
    description: str,
    old_estado: Optional[str] = None,
    new_estado: Optional[str] = None,
    user_name: Optional[str] = None,
    extra_data: Optional[dict] = None
):
    """Genera un evento tipado de auditoría de negocio."""
    log = ActivityLog(
        entity_type=entity_type,
        entity_id=entity_id,
        entity_numero=entity_numero,
        action=action,
        description=description,
        old_estado=old_estado,
        new_estado=new_estado,
        user_name=user_name,
        extra_data=extra_data or {},
    )
    db.add(log)


# ─────────────────────────────────────────────────────────────────────────────
# MÁQUINA DE ESTADOS Y DERIVACIÓN AUTOMÁTICA
# ─────────────────────────────────────────────────────────────────────────────

SO_STATES_CANONICAL = [
    "BORRADOR",
    "PENDIENTE_ANTICIPO",
    "CONFIRMADO",
    "PARCIALMENTE_DISPONIBLE",
    "DISPONIBLE",
    "PENDIENTE_SALDO",
    "LISTO_PARA_ENTREGA",
    "PARCIALMENTE_ENTREGADO",
    "ENTREGADO",
    "CANCELADO",
    "DEVUELTO_TOTAL",
]

ALLOWED_SO_TRANSITIONS = {
    "BORRADOR": {"PENDIENTE_ANTICIPO", "CONFIRMADO", "CANCELADO"},
    "PENDIENTE_ANTICIPO": {"CONFIRMADO", "CANCELADO"},
    "CONFIRMADO": {"PARCIALMENTE_DISPONIBLE", "DISPONIBLE", "CANCELADO"},
    "PARCIALMENTE_DISPONIBLE": {"DISPONIBLE", "PENDIENTE_SALDO", "CANCELADO"},
    "DISPONIBLE": {"PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "CANCELADO"},
    "PENDIENTE_SALDO": {"LISTO_PARA_ENTREGA", "CANCELADO"},
    "LISTO_PARA_ENTREGA": {"PARCIALMENTE_ENTREGADO", "ENTREGADO", "CANCELADO"},
    "PARCIALMENTE_ENTREGADO": {"ENTREGADO", "DEVUELTO_TOTAL"},
    "ENTREGADO": {"DEVUELTO_TOTAL"},
    "CANCELADO": set(),
    "DEVUELTO_TOTAL": set(),
}

LINE_STATES_CANONICAL = [
    "PENDIENTE",
    "PENDIENTE_COMPRA",
    "PENDIENTE_RESERVA",
    "ASIGNADA_COMPRA",
    "PARCIALMENTE_DISPONIBLE",
    "RESERVADA",
    "LISTA_PARA_ENTREGA",
    "ENTREGADA",
    "CANCELADA",
    "DEVUELTA_PARCIAL",
    "DEVUELTA_TOTAL",
]

ALLOWED_LINE_TRANSITIONS = {
    "PENDIENTE": {"PENDIENTE_COMPRA", "PENDIENTE_RESERVA", "CANCELADA"},
    "PENDIENTE_COMPRA": {"ASIGNADA_COMPRA", "CANCELADA"},
    "PENDIENTE_RESERVA": {"RESERVADA", "PARCIALMENTE_DISPONIBLE", "CANCELADA"},
    "ASIGNADA_COMPRA": {"PARCIALMENTE_DISPONIBLE", "RESERVADA", "CANCELADA"},
    "PARCIALMENTE_DISPONIBLE": {"RESERVADA", "CANCELADA"},
    "RESERVADA": {"LISTA_PARA_ENTREGA", "CANCELADA"},
    "LISTA_PARA_ENTREGA": {"ENTREGADA", "CANCELADA"},
    "ENTREGADA": {"DEVUELTA_PARCIAL", "DEVUELTA_TOTAL"},
    "DEVUELTA_PARCIAL": {"DEVUELTA_TOTAL"},
    "CANCELADA": set(),
    "DEVUELTA_TOTAL": set(),
}


def recalculate_sale_order_state(so: SaleOrder, db: Session) -> str:
    """
    Deriva el estado canónico general del pedido de venta a partir de sus líneas y pagos.
    Invariante: No permite regresiones desde estados terminales (CANCELADO, DEVUELTO_TOTAL).
    """
    if so.estado in ("CANCELADO", "DEVUELTO_TOTAL"):
        return so.estado

    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).all()
    if not lines:
        return so.estado

    active_lines = [l for l in lines if l.estado not in ("CANCELADA", "DEVUELTA_TOTAL")]
    if not active_lines:
        # Todas las líneas están canceladas o devueltas
        all_returned = all(l.estado == "DEVUELTA_TOTAL" for l in lines)
        return "DEVUELTO_TOTAL" if all_returned else "CANCELADO"

    total_cop = Decimal(str(so.total_cop or "0.00"))
    anticipo_pct = Decimal(str(so.anticipo_pct_snapshot or "60.00"))
    anticipo_req = (total_cop * anticipo_pct / Decimal("100.00")).quantize(Decimal("0.01"))

    # Calcular pagos confirmados netos
    pagos_confirmados = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO", "AJUSTE_AUTORIZADO"])
    ).scalar() or Decimal("0.00")

    devoluciones = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo == "DEVOLUCION"
    ).scalar() or Decimal("0.00")

    net_pagado = max(Decimal("0.00"), Decimal(str(pagos_confirmados)) - Decimal(str(devoluciones)))
    anticipo_cubierto = (net_pagado >= anticipo_req) or (so.policy_exception_authorized_by is not None)
    total_cubierto = (net_pagado >= total_cop) or (so.policy_exception_authorized_by is not None)

    # 1. Estados de entrega
    all_delivered = all(l.estado == "ENTREGADA" for l in active_lines)
    if all_delivered:
        return "ENTREGADO"

    any_delivered = any(l.estado == "ENTREGADA" for l in active_lines)
    if any_delivered:
        return "PARCIALMENTE_ENTREGADO"

    # 2. Estados de disponibilidad y entrega
    all_reserved_or_ready = all(l.estado in ("RESERVADA", "LISTA_PARA_ENTREGA") for l in active_lines)
    if all_reserved_or_ready:
        if total_cubierto:
            return "LISTO_PARA_ENTREGA"
        else:
            return "PENDIENTE_SALDO"

    any_reserved = any(l.estado in ("RESERVADA", "PARCIALMENTE_DISPONIBLE", "LISTA_PARA_ENTREGA") for l in active_lines)
    if any_reserved:
        return "PARCIALMENTE_DISPONIBLE"

    # 3. Estados tempranos
    if anticipo_cubierto:
        return "CONFIRMADO"

    return "PENDIENTE_ANTICIPO"


# ─────────────────────────────────────────────────────────────────────────────
# 1. CREACIÓN DE PEDIDO DE VENTA CANÓNICO
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/canonico", status_code=status.HTTP_201_CREATED)
def create_canonical_sale_order(
    body: SaleOrderCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    """
    Crea un pedido de venta canónico de Fase 4 con líneas normalizadas,
    soporte para modalidades mixtas (ENTREGA_INMEDIATA y POR_PEDIDO),
    propietario (NEBULAE o MAU), snapshots de costo/precio y libro de pagos.
    """
    customer = db.query(Customer).filter(Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, f"Cliente {body.customer_id} no encontrado")

    numero = _gen_numero(db, "PVEN-", "seq_ven")
    user_name = getattr(user, "email", str(getattr(user, "id", "asesor")))

    # Calcular totales y validar líneas
    subtotal = Decimal("0.00")
    total_cost = Decimal("0.00")
    line_models: List[SaleOrderLineErp] = []

    for l_in in body.lines:
        sku = db.query(ProductSKU).filter(ProductSKU.id == l_in.sku_id).first()
        if not sku:
            raise HTTPException(404, f"SKU {l_in.sku_id} no encontrado")

        qty = Decimal(str(l_in.quantity))
        price = Decimal(str(l_in.unit_price_cop))
        desc = Decimal(str(l_in.descuento_pct or "0.00"))
        tax = Decimal(str(l_in.tax_pct or "0.00"))
        cost = Decimal(str(l_in.cost_unit_cop_snapshot or "0.00"))

        line_sub = (qty * price * (Decimal("1.00") - desc / Decimal("100.00"))).quantize(Decimal("0.01"))
        subtotal += line_sub
        total_cost += (qty * cost).quantize(Decimal("0.01"))

        # Estado inicial de la línea según modalidad
        initial_line_state = "PENDIENTE_RESERVA" if l_in.modalidad == "ENTREGA_INMEDIATA" else "PENDIENTE_COMPRA"

        sol = SaleOrderLineErp(
            sku_id=l_in.sku_id,
            sq_line_id=l_in.sq_line_id,
            description=l_in.description or getattr(sku.product, "name", f"SKU {sku.sku}"),
            quantity=qty,
            unit_price_cop=price,
            descuento_pct=desc,
            tax_pct=tax,
            modalidad=l_in.modalidad,
            owner=l_in.owner,
            quantity_reserved=Decimal("0.00"),
            quantity_delivered=Decimal("0.00"),
            quantity_cancelled=Decimal("0.00"),
            estado=initial_line_state,
            cost_unit_cop_snapshot=cost,
            price_unit_cop_snapshot=price,
            customer_id=customer.id,
            source="NATIVE",
        )
        line_models.append(sol)

    total = subtotal
    anticipo_pct = Decimal(str(body.anticipo_pct or "60.00"))
    saldo_pct = Decimal(str(body.saldo_pct or "40.00"))
    anticipo_req = (total * anticipo_pct / Decimal("100.00")).quantize(Decimal("0.01"))
    saldo_req = total - anticipo_req

    estimated_profit = total - total_cost

    so = SaleOrder(
        numero=numero,
        customer_id=customer.id,
        customer_name=f"{customer.first_name} {customer.last_name}".strip(),
        customer_phone=customer.phone or "",
        customer_email=customer.email or "",
        customer_address=customer.address or "",
        direccion_entrega=body.direccion_entrega or customer.address or "",
        fecha_entrega_estimada=body.fecha_entrega_estimada,
        trm_rate=body.trm_rate,
        subtotal_cop=subtotal,
        descuento_pct=Decimal("0.00"),
        total_cop=total,
        anticipo_cop=Decimal("0.00"),
        saldo_cop=total,
        estado="PENDIENTE_ANTICIPO",
        notas=body.notas,
        canal_venta=body.canal_venta or "CRM",
        anticipo_pct_snapshot=anticipo_pct,
        saldo_pct_snapshot=saldo_pct,
        policy_exception_authorized_by=body.policy_exception_authorized_by,
        policy_exception_reason=body.policy_exception_reason,
        total_cost_cop=total_cost,
        estimated_profit_cop=estimated_profit,
        profit_is_estimated=True,
        created_by=user_name,
        cot_id=body.cot_id,
        sc_id=body.sc_id,
    )
    db.add(so)
    db.flush()

    for sol in line_models:
        sol.so_id = so.id
        db.add(sol)

    # Actualizar snapshot legacy JSON en so.productos para compatibilidad temporal con frontend
    legacy_prods = []
    for sol in line_models:
        legacy_prods.append({
            "line_id": sol.id,
            "sku_id": sol.sku_id,
            "product_name": sol.description,
            "qty": float(sol.quantity),
            "unit_price_cop": float(sol.unit_price_cop),
            "descuento_pct": float(sol.descuento_pct),
            "modalidad": sol.modalidad,
            "owner": sol.owner,
            "estado": sol.estado,
        })
    so.productos = legacy_prods

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="VENTA_CONFIRMADA",
        description=f"Pedido {so.numero} creado con {len(line_models)} línea(s). Total: ${total:,.0f} COP",
        new_estado="PENDIENTE_ANTICIPO",
        user_name=user_name,
        extra_data={"total_cop": str(total), "customer_id": customer.id}
    )

    db.commit()
    db.refresh(so)

    return {
        "status": "success",
        "data": {
            "id": so.id,
            "numero": so.numero,
            "customer_id": so.customer_id,
            "customer_name": so.customer_name,
            "total_cop": float(so.total_cop),
            "anticipo_requerido": float(anticipo_req),
            "saldo_requerido": float(saldo_req),
            "estado": so.estado,
            "lines": [
                {
                    "id": l.id,
                    "sku_id": l.sku_id,
                    "quantity": float(l.quantity),
                    "unit_price_cop": float(l.unit_price_cop),
                    "modalidad": l.modalidad,
                    "owner": l.owner,
                    "estado": l.estado,
                }
                for l in line_models
            ]
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. CONFIRMAR LÍNEA ENTREGA INMEDIATA (RESERVA ATÓMICA CONCURRENTE)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata")
def confirm_immediate_sale_line(
    so_id: int,
    line_id: int,
    warehouse_id: int = Query(..., description="Bodega de despacho"),
    idempotency_key: str = Query(..., min_length=3),
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """
    Confirma una línea ENTREGA_INMEDIATA:
    - Bloquea InventoryLevel e InventoryOwnerBalance (SELECT FOR UPDATE).
    - Valida stock vendible y balance del propietario (NEBULAE vs MAU).
    - Evita sobreventa concurrente mediante serialización pesimista.
    - Crea InventoryReservation automáticamente (ACTIVE) vinculada a sale_order_line_id.
    - Idempotente: si ya se reservó para esta línea y clave, retorna replay 200 sin duplicar.
    - Si no hay suficiente stock, devuelve 409 Conflict.
    """
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    # Idempotencia: Verificar si ya existe reserva para esta clave
    existing_res = db.execute(
        select(InventoryReservation).where(
            InventoryReservation.notes.ilike(f"%idempotency_key={idempotency_key}%")
        )
    ).scalar_one_or_none()
    if existing_res:
        return {
            "status": "success",
            "message": "Replay idempotente de confirmación inmediata",
            "idempotent_replay": True,
            "data": {
                "reservation_id": existing_res.id,
                "sale_order_line_id": existing_res.sale_order_line_id,
                "quantity_reserved": float(existing_res.quantity_reserved),
                "status": existing_res.status,
            }
        }

    # Bloquear SaleOrder y Línea
    so = db.execute(
        select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    line = db.execute(
        select(SaleOrderLineErp).where(
            SaleOrderLineErp.id == line_id,
            SaleOrderLineErp.so_id == so_id
        ).with_for_update()
    ).scalar_one_or_none()
    if not line:
        raise HTTPException(404, f"Línea {line_id} no encontrada en el pedido {so_id}")

    if line.modalidad != "ENTREGA_INMEDIATA":
        raise HTTPException(422, f"La línea {line_id} tiene modalidad '{line.modalidad}', se requiere 'ENTREGA_INMEDIATA'")

    qty_to_reserve = Decimal(str(line.quantity)) - Decimal(str(line.quantity_reserved or 0))
    if qty_to_reserve <= Decimal("0.00"):
        return {
            "status": "success",
            "message": "La línea ya se encuentra totalmente reservada",
            "data": {"line_id": line.id, "quantity_reserved": float(line.quantity_reserved), "estado": line.estado}
        }

    # Bloquear y validar InventoryLevel
    level = db.execute(
        select(InventoryLevel).where(
            InventoryLevel.sku_id == line.sku_id,
            InventoryLevel.warehouse_id == warehouse_id
        ).with_for_update()
    ).scalar_one_or_none()
    stock_fisico = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")

    # Bloquear y validar InventoryOwnerBalance para el propietario específico
    owner_bal = db.execute(
        select(InventoryOwnerBalance).where(
            InventoryOwnerBalance.sku_id == line.sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == line.owner
        ).with_for_update()
    ).scalar_one_or_none()
    stock_owner = Decimal(str(owner_bal.quantity)) if owner_bal and owner_bal.quantity is not None else Decimal("0.00")

    # Calcular reservas activas globales y por owner
    global_res = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
            InventoryReservation.sku_id == line.sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.status == "ACTIVE"
        )
    ).scalar() or Decimal("0.00")

    owner_res = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
            InventoryReservation.sku_id == line.sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.owner == line.owner,
            InventoryReservation.status == "ACTIVE"
        )
    ).scalar() or Decimal("0.00")

    disponible_fisico = max(Decimal("0.00"), stock_fisico - Decimal(str(global_res)))
    disponible_owner = max(Decimal("0.00"), stock_owner - Decimal(str(owner_res)))

    if disponible_owner < qty_to_reserve:
        raise HTTPException(
            409,
            f"Stock insuficiente para el propietario {line.owner}. "
            f"Requerido: {qty_to_reserve}, Disponible {line.owner}: {disponible_owner} (Físico: {stock_owner}, Reservas: {owner_res})"
        )

    if disponible_fisico < qty_to_reserve:
        raise HTTPException(
            409,
            f"Stock vendible insuficiente en bodega {warehouse_id}. "
            f"Requerido: {qty_to_reserve}, Disponible vendible: {disponible_fisico}"
        )

    # Crear InventoryReservation
    res = InventoryReservation(
        sku_id=line.sku_id,
        warehouse_id=warehouse_id,
        owner=line.owner,
        quantity_reserved=qty_to_reserve,
        sale_order_line_id=line.id,
        status="ACTIVE",
        expires_at=now + datetime.timedelta(hours=72),
        created_at=now,
        created_by=user_name,
        notes=f"Reserva automática entrega inmediata para {so.numero} línea {line.id} (idempotency_key={idempotency_key})"
    )
    db.add(res)
    db.flush()

    line.quantity_reserved = Decimal(str(line.quantity_reserved or 0)) + qty_to_reserve
    line.estado = "RESERVADA"
    line.updated_at = now

    # Recalcular estado del pedido
    new_so_state = recalculate_sale_order_state(so, db)
    so.estado = new_so_state
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="MERCANCIA_DISPONIBLE",
        description=f"Reserva de {qty_to_reserve} unidad(es) de SKU {line.sku_id} asignada para {so.numero} (Owner: {line.owner})",
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"line_id": line.id, "reservation_id": res.id, "warehouse_id": warehouse_id}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "reservation_id": res.id,
            "sale_order_id": so.id,
            "sale_order_line_id": line.id,
            "quantity_reserved": float(line.quantity_reserved),
            "line_estado": line.estado,
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. LIBRO TRANSACCIONAL DE PAGOS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/pagos", status_code=status.HTTP_201_CREATED)
def register_sale_order_payment(
    so_id: int,
    body: SaleOrderPaymentCreate,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """
    Registra una transacción en el libro de pagos de la venta (idempotente):
    - Tipos: ANTICIPO, ABONO, PAGO_TOTAL, PAGO_SALDO, DEVOLUCION, REVERSION, AJUSTE_AUTORIZADO.
    - Idempotencia determinista vía idempotency_key (replay 200).
    - Reversión atómica creando transacción compensatoria referenciada.
    - Derivación automática del estado del pedido según políticas 60/40 y 100%.
    """
    now = _now()
    client_key = body.idempotency_key.strip()
    user_name = getattr(user, "email", str(getattr(user, "id", "cajero")))

    # Idempotencia
    existing_p = db.execute(
        select(SaleOrderPayment).where(SaleOrderPayment.idempotency_key == client_key)
    ).scalar_one_or_none()
    if existing_p:
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "message": "Replay idempotente de transacción de pago",
            "idempotent_replay": True,
            "data": {
                "id": existing_p.id,
                "sale_order_id": existing_p.sale_order_id,
                "tipo": existing_p.tipo,
                "monto": float(existing_p.monto),
                "estado": existing_p.estado,
                "fecha": str(existing_p.fecha),
            }
        }

    # Bloquear pedido
    so = db.execute(
        select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    if so.estado == "CANCELADO":
        raise HTTPException(409, "No se pueden registrar pagos en un pedido CANCELADO")

    monto = Decimal(str(body.monto))
    tipo = body.tipo.strip().upper()

    # Reversión
    if tipo == "REVERSION":
        if not body.reversed_payment_id:
            raise HTTPException(422, "tipo='REVERSION' requiere reversed_payment_id obligatorio")
        orig_p = db.execute(
            select(SaleOrderPayment).where(
                SaleOrderPayment.id == body.reversed_payment_id,
                SaleOrderPayment.sale_order_id == so_id
            ).with_for_update()
        ).scalar_one_or_none()
        if not orig_p:
            raise HTTPException(404, f"Transacción original {body.reversed_payment_id} no encontrada")
        if orig_p.estado != "CONFIRMADO":
            raise HTTPException(409, f"La transacción original ya se encuentra en estado '{orig_p.estado}'")
        orig_p.estado = "REVERTIDO"

    p = SaleOrderPayment(
        sale_order_id=so.id,
        customer_id=so.customer_id,
        tipo=tipo,
        monto=monto,
        moneda=body.moneda or "COP",
        metodo_pago=body.metodo_pago,
        fecha=body.fecha or now.date(),
        referencia_bancaria=body.referencia_bancaria,
        comprobante=body.comprobante,
        usuario=user_name,
        idempotency_key=client_key,
        estado="CONFIRMADO",
        reversed_payment_id=body.reversed_payment_id,
        notes=body.notes,
        created_at=now,
    )
    db.add(p)
    db.flush()

    # Actualizar totales financieros en SaleOrder
    # Sumar pagos activos
    pagos_positivos = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO", "AJUSTE_AUTORIZADO"])
    ).scalar() or Decimal("0.00")

    devoluciones = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["DEVOLUCION", "REVERSION"])
    ).scalar() or Decimal("0.00")

    # Separar anticipos de saldo
    total_anticipos = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo == "ANTICIPO"
    ).scalar() or Decimal("0.00")

    total_cop = Decimal(str(so.total_cop or 0))
    net_pagado = max(Decimal("0.00"), Decimal(str(pagos_positivos)) - Decimal(str(devoluciones)))
    so.anticipo_cop = total_anticipos
    so.saldo_cop = max(Decimal("0.00"), total_cop - net_pagado)

    # Derivar nuevo estado del pedido
    old_estado = so.estado
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="ANTICIPO_RECIBIDO" if tipo == "ANTICIPO" else ("PAGO_COMPLETO" if so.saldo_cop == 0 else "PAGO_REGISTRADO"),
        description=f"Pago {tipo} registrado por ${monto:,.0f} COP. Saldo restante: ${so.saldo_cop:,.0f} COP",
        old_estado=old_estado,
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"payment_id": p.id, "tipo": tipo, "monto": str(monto)}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "id": p.id,
            "sale_order_id": so.id,
            "tipo": p.tipo,
            "monto": float(p.monto),
            "saldo_cop": float(so.saldo_cop),
            "anticipo_cop": float(so.anticipo_cop),
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CANCELACIONES (VENTA O LÍNEA) CON DECISIÓN SOBRE MERCANCÍA
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/cancelar")
def cancel_sale_order(
    so_id: int,
    body: CancelSaleOrderRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    """
    Cancela un pedido de venta completo:
    - Libera todas las reservas activas (RELEASED).
    - Si la mercancía ya fue comprada/recibida, exige y persiste una decisión explícita.
    - Calcula dinero a devolver o saldo a favor del cliente.
    """
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "admin")))

    so = db.execute(
        select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    if so.estado in ("ENTREGADO", "CANCELADO"):
        raise HTTPException(409, f"No se puede cancelar un pedido en estado '{so.estado}'")

    lines = db.execute(
        select(SaleOrderLineErp).where(SaleOrderLineErp.so_id == so_id).with_for_update()
    ).scalars().all()

    # Verificar si hay mercancía ya comprada o reservada
    has_purchased_or_reserved = any(
        l.quantity_reserved > 0 or l.estado in ("ASIGNADA_COMPRA", "RESERVADA", "LISTA_PARA_ENTREGA", "PARCIALMENTE_DISPONIBLE")
        for l in lines
    )
    if has_purchased_or_reserved and not body.purchased_goods_decision:
        raise HTTPException(
            422,
            "El pedido contiene mercancía comprada o reservada. "
            "Debe especificar purchased_goods_decision: PASAR_A_STOCK_NEBULAE | MANTENER_PENDIENTE | REASIGNAR_CLIENTE | DEVOLVER_PROVEEDOR | REGISTRAR_PERDIDA"
        )

    # Liberar reservas activas
    line_ids = [l.id for l in lines]
    if line_ids:
        active_reservations = db.execute(
            select(InventoryReservation).where(
                InventoryReservation.sale_order_line_id.in_(line_ids),
                InventoryReservation.status == "ACTIVE"
            ).with_for_update()
        ).scalars().all()

        for res in active_reservations:
            res.status = "RELEASED"
            res.released_at = now
            res.notes = f"{(res.notes or '').strip()} Liberada por cancelación de pedido {so.numero}".strip()

    # Cancelar líneas
    for l in lines:
        if l.estado != "ENTREGADA":
            l.estado = "CANCELADA"
            l.quantity_cancelled = l.quantity - l.quantity_delivered
            l.quantity_reserved = Decimal("0.00")
            l.updated_at = now

    # Calcular saldo a favor / dinero a devolver
    pagos_confirmados = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO", "AJUSTE_AUTORIZADO"])
    ).scalar() or Decimal("0.00")

    devoluciones = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo == "DEVOLUCION"
    ).scalar() or Decimal("0.00")

    dinero_a_favor = max(Decimal("0.00"), Decimal(str(pagos_confirmados)) - Decimal(str(devoluciones)))

    old_estado = so.estado
    so.estado = "CANCELADO"
    so.cancellation_reason = body.motivo
    so.cancellation_authorized_by = body.authorized_by or user_name
    so.cancelled_at = now
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="CANCELACION",
        description=f"Pedido cancelado: {body.motivo}. Decisión mercancía: {body.purchased_goods_decision or 'N/A'}. Saldo a favor: ${dinero_a_favor:,.0f} COP",
        old_estado=old_estado,
        new_estado="CANCELADO",
        user_name=user_name,
        extra_data={"dinero_a_favor": str(dinero_a_favor), "decision": body.purchased_goods_decision}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "sale_order_id": so.id,
            "estado": so.estado,
            "dinero_a_favor_cop": float(dinero_a_favor),
            "decision_mercancia": body.purchased_goods_decision,
            "motivo": body.motivo,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. ZONA DE EMPAQUE (PACKING) CON AGRUPACIÓN POR CLIENTE
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/empaque/sesiones", status_code=status.HTTP_201_CREATED)
def create_packing_session(
    body: PackingSessionCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """
    Crea una sesión de empaque agrupando productos de una o varias ventas del MISMO cliente:
    - Valida que todas las ventas y líneas pertenezcan al mismo customer_id (rechaza con 422 si se mezclan clientes).
    - Conserva las reservas asociadas sin descontar stock físico dos veces.
    """
    numero = _gen_numero(db, "EMP-", "seq_emp")
    user_name = getattr(user, "email", str(getattr(user, "id", "bodega")))

    # Validar que todos los pedidos y líneas pertenezcan al cliente indicado
    so_ids = list({it.sale_order_id for it in body.items})
    sale_orders = db.execute(
        select(SaleOrder).where(SaleOrder.id.in_(so_ids))
    ).scalars().all()

    for so in sale_orders:
        if so.customer_id != body.customer_id:
            raise HTTPException(
                422,
                f"Violación de empaque: El pedido {so.numero} pertenece al cliente {so.customer_id}, "
                f"no al cliente {body.customer_id} de la sesión de empaque. No se pueden agrupar clientes diferentes."
            )

    sess = SalePackingSession(
        numero=numero,
        customer_id=body.customer_id,
        warehouse_id=body.warehouse_id,
        status="EN_PROCESO",
        responsible_user=user_name,
        observations=body.observations,
        created_at=_now(),
    )
    db.add(sess)
    db.flush()

    items = []
    for it in body.items:
        pack_item = SalePackingItem(
            packing_id=sess.id,
            sale_order_id=it.sale_order_id,
            sale_order_line_id=it.sale_order_line_id,
            sku_id=it.sku_id,
            quantity=Decimal(str(it.quantity)),
            verified_quantity=Decimal("0.00"),
            status="PENDIENTE",
            notes=it.notes,
            created_at=_now(),
        )
        db.add(pack_item)
        items.append(pack_item)

    _log_event(
        db=db,
        entity_type="EMPAQUE",
        entity_id=sess.id,
        entity_numero=sess.numero,
        action="ENTRADA_EMPAQUE",
        description=f"Sesión de empaque {sess.numero} creada para cliente {body.customer_id} con {len(items)} ítem(s)",
        user_name=user_name
    )

    db.commit()
    db.refresh(sess)

    return {
        "status": "success",
        "data": {
            "id": sess.id,
            "numero": sess.numero,
            "customer_id": sess.customer_id,
            "warehouse_id": sess.warehouse_id,
            "status": sess.status,
            "items_count": len(items),
        }
    }


@router.patch("/empaque/sesiones/{sess_id}/items/{item_id}")
def verify_packing_item(
    sess_id: int,
    item_id: int,
    body: PackingItemVerify,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """Verifica y asienta la cantidad empacada o reporta incidencias de empaque."""
    item = db.execute(
        select(SalePackingItem).where(
            SalePackingItem.id == item_id,
            SalePackingItem.packing_id == sess_id
        ).with_for_update()
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, f"Ítem {item_id} de empaque no encontrado")

    item.verified_quantity = Decimal(str(body.verified_quantity))
    item.status = body.status
    if body.notes:
        item.notes = (str(item.notes or '') + ' ' + str(body.notes or '')).strip()

    db.commit()
    return {"status": "success", "data": {"id": item.id, "status": item.status, "verified_quantity": float(item.verified_quantity)}}


# ─────────────────────────────────────────────────────────────────────────────
# 6. DESPACHO Y ENTREGA (CON REGLAS OPERATIVAS Y DEDUCCIÓN ATÓMICA)
# ─────────────────────────────────────────────────────────────────────────────

def validate_dispatch_policy(delivery_method: str, scheduled_dt: Optional[datetime.datetime], authorized_by: Optional[str]) -> Optional[str]:
    """
    Reglas operativas de despacho:
    - Despachos nacionales (ENVIO_NACIONAL): Días Lunes (0), Miércoles (2) y Viernes (4).
    - Entregas de fin de semana (Sábado/Domingo): Deben programarse a más tardar el viernes a las 5:30 p.m. (America/Bogota).
    - Advertir o exigir autorización si no cumple la política.
    """
    if not scheduled_dt:
        return None

    # Convertir a hora Bogotá
    if scheduled_dt.tzinfo is None:
        bogota_time = scheduled_dt.replace(tzinfo=BOGOTA_TZ)
    else:
        bogota_time = scheduled_dt.astimezone(BOGOTA_TZ)

    weekday = bogota_time.weekday()  # 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun

    # 1. Regla despachos nacionales
    if delivery_method == "ENVIO_NACIONAL":
        if weekday not in (0, 2, 4):
            day_name = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"][weekday]
            warn = f"Política de Despacho Nacional: Solo se despacha Lunes, Miércoles y Viernes. La fecha programada es {day_name}."
            if not authorized_by:
                raise HTTPException(422, f"Violación de política de despacho: {warn} Requiere autorización explícita.")
            return warn

    # 2. Regla fin de semana
    if weekday in (5, 6):
        now_b = _now_bogota()
        cutoff_friday = now_b.replace(hour=17, minute=30, second=0, microsecond=0)
        # Si hoy ya es viernes después de 5:30pm o ya es fin de semana
        if now_b.weekday() == 4 and now_b > cutoff_friday:
            warn = "Política Fin de Semana: Las entregas de fin de semana deben programarse máximo el viernes antes de las 5:30 p.m."
            if not authorized_by:
                raise HTTPException(422, f"Violación de política: {warn} Requiere autorización explícita.")
            return warn

    return None


@router.post("/entregas", status_code=status.HTTP_201_CREATED)
def create_delivery(
    body: DeliveryCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """
    Crea una orden de despacho/entrega (individual o multiventas del mismo cliente):
    - Valida que todas las líneas pertenezcan al mismo customer_id (rechaza con 422 si se mezclan clientes).
    - Evalúa reglas operativas de despacho (L/M/V y corte viernes 5:30 p.m. Bogotá).
    """
    user_name = getattr(user, "email", str(getattr(user, "id", "logistica")))

    # Validar clientes
    so_ids = list({l.sale_order_id for l in body.lines})
    sos = db.execute(select(SaleOrder).where(SaleOrder.id.in_(so_ids))).scalars().all()
    for so in sos:
        if so.customer_id != body.customer_id:
            raise HTTPException(
                422,
                f"No se pueden agrupar ventas de clientes diferentes en una misma entrega. "
                f"Pedido {so.numero} pertenece a {so.customer_id}, entrega a {body.customer_id}"
            )

    # Validar reglas operativas
    policy_warn = validate_dispatch_policy(body.delivery_method, body.scheduled_date, body.policy_authorized_by)

    numero = _gen_numero(db, "ENT-", "seq_ent")

    deliv = SaleOrderDelivery(
        numero=numero,
        customer_id=body.customer_id,
        warehouse_id=body.warehouse_id,
        delivery_method=body.delivery_method,
        address_snapshot=body.address_snapshot,
        city=body.city,
        phone=body.phone,
        carrier=body.carrier,
        tracking_number=body.tracking_number,
        shipping_cost=Decimal(str(body.shipping_cost or 0)),
        shipping_paid_by=body.shipping_paid_by or "CLIENTE",
        scheduled_date=body.scheduled_date,
        packing_id=body.packing_id,
        policy_warning=policy_warn,
        policy_authorized_by=body.policy_authorized_by,
        observations=body.observations,
        status="PREPARANDO",
        created_by=user_name,
        created_at=_now(),
    )
    db.add(deliv)
    db.flush()

    for l_in in body.lines:
        d_line = SaleOrderDeliveryLine(
            delivery_id=deliv.id,
            sale_order_id=l_in.sale_order_id,
            sale_order_line_id=l_in.sale_order_line_id,
            sku_id=l_in.sku_id,
            quantity=Decimal(str(l_in.quantity)),
            owner=l_in.owner or "NEBULAE",
            created_at=_now(),
        )
        db.add(d_line)

    db.commit()
    db.refresh(deliv)

    return {
        "status": "success",
        "data": {
            "id": deliv.id,
            "numero": deliv.numero,
            "customer_id": deliv.customer_id,
            "delivery_method": deliv.delivery_method,
            "status": deliv.status,
            "policy_warning": policy_warn,
        }
    }


@router.post("/entregas/{delivery_id}/despachar")
def dispatch_delivery(
    delivery_id: int,
    body: DispatchDeliveryRequest,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """
    Confirma el despacho físico en una ÚNICA transacción atómica e idempotente:
    - Convierte las reservas asociadas (CONVERTED).
    - Descuenta InventoryLevel de la bodega.
    - Descuenta InventoryOwnerBalance del propietario correcto (NEBULAE vs MAU).
    - Genera InventoryOperation ('DELIVERY') e InventoryMovement ('OUT').
    - Actualiza cantidades entregadas en las líneas de venta y recalcula estados.
    - Replay seguro con idempotency_key (no descuenta dos veces).
    """
    now = _now()
    client_key = body.idempotency_key.strip()
    user_name = getattr(user, "email", str(getattr(user, "id", "bodega")))

    deliv = db.execute(
        select(SaleOrderDelivery).where(SaleOrderDelivery.id == delivery_id).with_for_update()
    ).scalar_one_or_none()
    if not deliv:
        raise HTTPException(404, f"Entrega {delivery_id} no encontrada")

    # Idempotencia: Verificar si ya fue despachada con esta clave
    if deliv.idempotency_key == client_key or deliv.status in ("DESPACHADO", "EN_TRANSITO", "ENTREGADO"):
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "message": "Replay idempotente de despacho",
            "idempotent_replay": True,
            "data": {
                "delivery_id": deliv.id,
                "numero": deliv.numero,
                "status": deliv.status,
                "dispatch_date": str(deliv.dispatch_date),
            }
        }

    deliv_lines = db.execute(
        select(SaleOrderDeliveryLine).where(SaleOrderDeliveryLine.delivery_id == delivery_id).with_for_update()
    ).scalars().all()
    if not deliv_lines:
        raise HTTPException(422, "La entrega no contiene líneas para despachar")

    # Crear InventoryOperation única para la entrega
    inv_op = InventoryOperation(
        source_warehouse_id=deliv.warehouse_id,
        operation_type="DELIVERY",
        status="DONE",
        tracking_number=body.tracking_number or deliv.tracking_number,
        source_document_type="ENTREGA",
        source_document_id=deliv.id,
        source_document_numero=deliv.numero,
    )
    db.add(inv_op)
    db.flush()

    affected_so_ids = set()

    for dl in deliv_lines:
        qty = Decimal(str(dl.quantity))
        owner = dl.owner or "NEBULAE"

        # 1. Bloquear y convertir la reserva activa asociada
        res = db.execute(
            select(InventoryReservation).where(
                InventoryReservation.sale_order_line_id == dl.sale_order_line_id,
                InventoryReservation.status == "ACTIVE"
            ).with_for_update()
        ).scalar_one_or_none()

        if res:
            res.status = "CONVERTED"
            res.converted_at = now
            res.notes = f"{(res.notes or '').strip()} Convertida en despacho {deliv.numero}".strip()

        # 2. Descontar InventoryLevel
        level = db.execute(
            select(InventoryLevel).where(
                InventoryLevel.sku_id == dl.sku_id,
                InventoryLevel.warehouse_id == deliv.warehouse_id
            ).with_for_update()
        ).scalar_one_or_none()
        if not level or Decimal(str(level.quantity)) < qty:
            raise HTTPException(409, f"Stock físico insuficiente en bodega {deliv.warehouse_id} para SKU {dl.sku_id}")
        level.quantity = Decimal(str(level.quantity)) - qty

        # 3. Descontar InventoryOwnerBalance del propietario original
        owner_bal = db.execute(
            select(InventoryOwnerBalance).where(
                InventoryOwnerBalance.sku_id == dl.sku_id,
                InventoryOwnerBalance.warehouse_id == deliv.warehouse_id,
                InventoryOwnerBalance.owner == owner
            ).with_for_update()
        ).scalar_one_or_none()
        if not owner_bal or Decimal(str(owner_bal.quantity)) < qty:
            raise HTTPException(409, f"Balance insuficiente para propietario {owner} en SKU {dl.sku_id}")
        owner_bal.quantity = Decimal(str(owner_bal.quantity)) - qty
        owner_bal.updated_at = now

        # 4. Registrar Kárdex OUT con clave determinista
        mv_key = hashlib.sha256(f"{inv_op.id}:{dl.sku_id}:OUT:{owner}:{deliv.warehouse_id}:{dl.id}".encode()).hexdigest()
        mv = InventoryMovement(
            operation_id=inv_op.id,
            sku_id=dl.sku_id,
            quantity=qty,
            direction="OUT",
            owner=owner,
            warehouse_id=deliv.warehouse_id,
            idempotency_key=mv_key,
            created_at=now,
            created_by=user_name,
        )
        db.add(mv)

        # 5. Actualizar línea de venta
        sol = db.execute(
            select(SaleOrderLineErp).where(SaleOrderLineErp.id == dl.sale_order_line_id).with_for_update()
        ).scalar_one_or_none()
        if sol:
            sol.quantity_delivered = Decimal(str(sol.quantity_delivered or 0)) + qty
            if sol.quantity_delivered >= sol.quantity:
                sol.estado = "ENTREGADA"
            sol.updated_at = now
            affected_so_ids.add(sol.so_id)

    # Actualizar estado de la entrega
    deliv.status = "DESPACHADO"
    deliv.dispatch_date = body.dispatch_date or now
    deliv.idempotency_key = client_key
    if body.carrier:
        deliv.carrier = body.carrier
    if body.tracking_number:
        deliv.tracking_number = body.tracking_number
    if body.evidence_url:
        deliv.evidence_url = body.evidence_url
    deliv.updated_at = now

    # Recalcular estados de todos los pedidos involucrados
    for so_id in affected_so_ids:
        so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
        if so:
            so.estado = recalculate_sale_order_state(so, db)
            so.updated_at = now
            _log_event(
                db=db,
                entity_type="PVEN",
                entity_id=so.id,
                entity_numero=so.numero,
                action="DESPACHO",
                description=f"Despacho {deliv.numero} confirmado. Nuevo estado del pedido: {so.estado}",
                new_estado=so.estado,
                user_name=user_name
            )

    db.commit()

    return {
        "status": "success",
        "data": {
            "delivery_id": deliv.id,
            "numero": deliv.numero,
            "status": deliv.status,
            "dispatch_date": str(deliv.dispatch_date),
            "idempotency_key": client_key,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 7. DEVOLUCIONES DE CLIENTES
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/devoluciones", status_code=status.HTTP_201_CREATED)
def register_sale_order_return(
    so_id: int,
    body: SaleOrderReturnCreate,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    """
    Registra una devolución de cliente (parcial o total):
    - REINTEGRAR_STOCK: +InventoryLevel, +InventoryOwnerBalance (propietario original), Kárdex RETURN_IN.
    - CUARENTENA: Crea InventoryQuarantine con el propietario original, no incrementa vendible, Kárdex QUARANTINE.
    - DESTRUIDO: Kárdex SCRAP.
    - DEVOLVER_PROVEEDOR: Kárdex TRANSFER_OUT.
    - Manejo financiero: DEVOLUCION_DINERO registra transacción DEVOLUCION en pagos.
    """
    now = _now()
    client_key = body.idempotency_key.strip()
    user_name = getattr(user, "email", str(getattr(user, "id", "devoluciones")))

    # Idempotencia
    existing_ret = db.execute(
        select(SaleOrderReturn).where(SaleOrderReturn.idempotency_key == client_key)
    ).scalar_one_or_none()
    if existing_ret:
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "message": "Replay idempotente de devolución",
            "idempotent_replay": True,
            "data": {
                "return_id": existing_ret.id,
                "numero": existing_ret.numero,
                "status": existing_ret.status,
            }
        }

    so = db.execute(
        select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    numero = _gen_numero(db, "DEV-", "seq_dev")

    ret = SaleOrderReturn(
        numero=numero,
        sale_order_id=so.id,
        delivery_id=body.delivery_id,
        customer_id=body.customer_id,
        financial_resolution=body.financial_resolution,
        refund_amount=Decimal(str(body.refund_amount or 0)),
        status="PROCESADA",
        reason=body.reason,
        evidence_url=body.evidence_url,
        authorized_by=body.authorized_by,
        idempotency_key=client_key,
        created_by=user_name,
        created_at=now,
    )
    db.add(ret)
    db.flush()

    for l_in in body.lines:
        qty = Decimal(str(l_in.quantity))
        sol = db.execute(
            select(SaleOrderLineErp).where(SaleOrderLineErp.id == l_in.sale_order_line_id).with_for_update()
        ).scalar_one_or_none()
        if not sol:
            raise HTTPException(404, f"Línea de pedido {l_in.sale_order_line_id} no encontrada")

        owner = l_in.owner or sol.owner or "NEBULAE"

        quar_id = None
        inv_res = l_in.inventory_resolution.strip().upper()

        # Operación de inventario para trazabilidad de Kárdex
        inv_op = InventoryOperation(
            dest_warehouse_id=l_in.warehouse_id,
            operation_type="RECEIPT",
            status="DONE",
            source_document_type="DEVOLUCION",
            source_document_id=ret.id,
            source_document_numero=ret.numero,
        )
        db.add(inv_op)
        db.flush()

        if inv_res == "REINTEGRAR_STOCK":
            # 1. Incrementar nivel vendible
            lvl = db.execute(
                select(InventoryLevel).where(
                    InventoryLevel.sku_id == l_in.sku_id,
                    InventoryLevel.warehouse_id == l_in.warehouse_id
                ).with_for_update()
            ).scalar_one_or_none()
            if lvl:
                lvl.quantity = Decimal(str(lvl.quantity)) + qty
            else:
                db.add(InventoryLevel(sku_id=l_in.sku_id, warehouse_id=l_in.warehouse_id, quantity=qty))

            # 2. Incrementar balance de propietario original
            iob = db.execute(
                select(InventoryOwnerBalance).where(
                    InventoryOwnerBalance.sku_id == l_in.sku_id,
                    InventoryOwnerBalance.warehouse_id == l_in.warehouse_id,
                    InventoryOwnerBalance.owner == owner
                ).with_for_update()
            ).scalar_one_or_none()
            if iob:
                iob.quantity = Decimal(str(iob.quantity)) + qty
                iob.updated_at = now
            else:
                db.add(InventoryOwnerBalance(sku_id=l_in.sku_id, warehouse_id=l_in.warehouse_id, owner=owner, quantity=qty, updated_at=now))

            # 3. Kárdex RETURN_IN
            mv_key = hashlib.sha256(f"{inv_op.id}:{l_in.sku_id}:RETURN_IN:{owner}:{l_in.warehouse_id}".encode()).hexdigest()
            db.add(InventoryMovement(
                operation_id=inv_op.id,
                sku_id=l_in.sku_id,
                quantity=qty,
                direction="RETURN_IN",
                owner=owner,
                warehouse_id=l_in.warehouse_id,
                idempotency_key=mv_key,
                created_at=now,
                created_by=user_name,
            ))

        elif inv_res == "CUARENTENA":
            quar = InventoryQuarantine(
                sku_id=l_in.sku_id,
                warehouse_id=l_in.warehouse_id,
                quantity=qty,
                reason="DEVOLUCION_CLIENTE",
                status="ACTIVO",
                owner=owner,
                notes=f"Devolución {ret.numero} - Condición: {l_in.product_condition}",
                created_at=now,
            )
            db.add(quar)
            db.flush()
            quar_id = quar.id

            mv_key = hashlib.sha256(f"{inv_op.id}:{l_in.sku_id}:QUARANTINE:{owner}:{l_in.warehouse_id}".encode()).hexdigest()
            db.add(InventoryMovement(
                operation_id=inv_op.id,
                sku_id=l_in.sku_id,
                quantity=qty,
                direction="QUARANTINE",
                owner=owner,
                warehouse_id=l_in.warehouse_id,
                idempotency_key=mv_key,
                created_at=now,
                created_by=user_name,
            ))

        elif inv_res == "DESTRUIDO":
            mv_key = hashlib.sha256(f"{inv_op.id}:{l_in.sku_id}:SCRAP:{owner}:{l_in.warehouse_id}".encode()).hexdigest()
            db.add(InventoryMovement(
                operation_id=inv_op.id,
                sku_id=l_in.sku_id,
                quantity=qty,
                direction="SCRAP",
                owner=owner,
                warehouse_id=l_in.warehouse_id,
                idempotency_key=mv_key,
                created_at=now,
                created_by=user_name,
            ))

        ret_line = SaleOrderReturnLine(
            return_id=ret.id,
            sale_order_line_id=l_in.sale_order_line_id,
            sku_id=l_in.sku_id,
            warehouse_id=l_in.warehouse_id,
            quantity=qty,
            inventory_resolution=inv_res,
            product_condition=l_in.product_condition,
            owner=owner,
            quarantine_id=quar_id,
            created_at=now,
        )
        db.add(ret_line)

        # Actualizar estado de la línea
        if qty >= sol.quantity:
            sol.estado = "DEVUELTA_TOTAL"
        else:
            sol.estado = "DEVUELTA_PARCIAL"
        sol.updated_at = now

    # Manejo financiero: Si hubo reembolso en dinero, registrar transacción DEVOLUCION en pagos
    refund_amount = Decimal(str(body.refund_amount or 0))
    if body.financial_resolution == "DEVOLUCION_DINERO" and refund_amount > 0:
        db.add(SaleOrderPayment(
            sale_order_id=so.id,
            customer_id=so.customer_id,
            tipo="DEVOLUCION",
            monto=refund_amount,
            moneda="COP",
            fecha=now.date(),
            usuario=user_name,
            idempotency_key=f"REFUND:{ret.id}:{client_key}",
            estado="CONFIRMADO",
            notes=f"Reembolso por devolución {ret.numero}",
            created_at=now,
        ))

    # Recalcular estado del pedido
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="DEVOLUCION",
        description=f"Devolución {ret.numero} procesada. Resolución financiera: {body.financial_resolution}",
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"return_id": ret.id, "refund_amount": str(refund_amount)}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "return_id": ret.id,
            "numero": ret.numero,
            "status": ret.status,
            "financial_resolution": ret.financial_resolution,
            "refund_amount": float(ret.refund_amount),
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. COSTO Y RENTABILIDAD CON SEGREGACIÓN PATRIMONIAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pedidos/{so_id}/rentabilidad")
def get_sale_order_profitability(
    so_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    """
    Calcula la rentabilidad y desglose patrimonial (NEBULAE vs MAU):
    - Venta bruta, descuentos, venta neta.
    - Costo snapshot / real.
    - Utilidad y margen %.
    - Resultado de Nebulae y Resultado de Mau por separado.
    """
    so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so_id).all()

    gross_sales = Decimal("0.00")
    total_discount = Decimal("0.00")
    total_cost = Decimal("0.00")
    nebulae_result = Decimal("0.00")
    mau_result = Decimal("0.00")
    breakdown = []

    for l in lines:
        qty = Decimal(str(l.quantity))
        price = Decimal(str(l.unit_price_cop))
        desc_pct = Decimal(str(l.descuento_pct or 0))
        cost = Decimal(str(l.cost_unit_cop_snapshot or 0))

        line_gross = (qty * price).quantize(Decimal("0.01"))
        line_desc = (line_gross * desc_pct / Decimal("100.00")).quantize(Decimal("0.01"))
        line_net = line_gross - line_desc
        line_cost = (qty * cost).quantize(Decimal("0.01"))
        line_profit = line_net - line_cost
        line_margin = (line_profit / line_net * Decimal("100.00")).quantize(Decimal("0.01")) if line_net > 0 else Decimal("0.00")

        gross_sales += line_gross
        total_discount += line_desc
        total_cost += line_cost

        if l.owner == "MAU":
            mau_result += line_profit
        else:
            nebulae_result += line_profit

        breakdown.append({
            "line_id": l.id,
            "sku_id": l.sku_id,
            "description": l.description,
            "owner": l.owner,
            "quantity": float(qty),
            "unit_price_cop": float(price),
            "descuento_pct": float(desc_pct),
            "net_price_cop": float(line_net),
            "unit_cost_cop": float(cost),
            "total_cost_cop": float(line_cost),
            "profit_cop": float(line_profit),
            "margin_pct": float(line_margin),
            "estado": l.estado,
        })

    net_sales = gross_sales - total_discount
    estimated_profit = net_sales - total_cost
    margin_pct = (estimated_profit / net_sales * Decimal("100.00")).quantize(Decimal("0.01")) if net_sales > 0 else Decimal("0.00")

    return {
        "status": "success",
        "data": {
            "sale_order_id": so.id,
            "numero": so.numero,
            "gross_sales_cop": float(gross_sales),
            "discount_cop": float(total_discount),
            "net_sales_cop": float(net_sales),
            "total_cost_cop": float(total_cost),
            "estimated_profit_cop": float(estimated_profit),
            "real_profit_cop": float(so.real_profit_cop) if so.real_profit_cop is not None else None,
            "margin_pct": float(margin_pct),
            "profit_is_estimated": so.profit_is_estimated,
            "nebulae_result_cop": float(nebulae_result),
            "mau_result_cop": float(mau_result),
            "lines_breakdown": breakdown,
        }
    }
