# -*- coding: utf-8 -*-
"""
ERP Ventas Fase 4 — Módulo Canónico de Ventas, Pagos, Empaque, Entregas y Devoluciones (Hardened).
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session
from sqlalchemy import select, func, text, and_, or_
from typing import Optional, List, Dict, Any
from decimal import Decimal
import datetime
import hashlib
import json
import zoneinfo
import uuid

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
    DeliveryStatusUpdateRequest,
    SaleOrderReturnCreate,
    FinancialExceptionRequest,
)

router = APIRouter()

BOGOTA_TZ = zoneinfo.ZoneInfo("America/Bogota")

def _compute_return_fingerprint(
    so_id: int,
    customer_id: int,
    delivery_id: Optional[int],
    financial_resolution: str,
    refund_amount: Decimal,
    lines: List[Any]
) -> str:
    sorted_lines = sorted(
        [
            {
                "sale_order_line_id": getattr(l, "sale_order_line_id", getattr(l, "id", None)),
                "quantity": f"{Decimal(str(l.quantity)):.2f}",
                "warehouse_id": l.warehouse_id,
                "product_condition": getattr(l, "product_condition", None),
                "inventory_resolution": getattr(l, "inventory_resolution", None),
            }
            for l in lines
        ],
        key=lambda x: (x["sale_order_line_id"] or 0, x["warehouse_id"] or 0)
    )
    payload_dict = {
        "sale_order_id": so_id,
        "customer_id": customer_id,
        "delivery_id": delivery_id,
        "financial_resolution": financial_resolution,
        "refund_amount": f"{Decimal(str(refund_amount or 0)):.2f}",
        "lines": sorted_lines
    }
    return hashlib.sha256(json.dumps(payload_dict, sort_keys=True).encode("utf-8")).hexdigest()



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


def _customer_full_name(c) -> str:
    if not c:
        return ""
    if hasattr(c, "name") and c.name:
        return str(c.name)
    fn = getattr(c, "first_name", "") or ""
    ln = getattr(c, "last_name", "") or ""
    return f"{fn} {ln}".strip() or "Cliente"


def _log_event(
    db: Session,
    entity_type: str,
    entity_id: int,
    entity_numero: Optional[str] = "",
    action: str = "",
    description: str = "",
    old_estado: Optional[str] = None,
    new_estado: Optional[str] = None,
    user_name: Optional[str] = None,
    extra_data: Optional[dict] = None
):
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
        created_at=_now()
    )
    db.add(log)


# ─────────────────────────────────────────────────────────────────────────────
# MÁQUINAS DE ESTADOS CENTRALIZADAS
# ─────────────────────────────────────────────────────────────────────────────

ALLOWED_TRANSITIONS_SALE_ORDER = {
    "BORRADOR": {"PENDIENTE_ANTICIPO", "CONFIRMADO", "CANCELADO"},
    "PENDIENTE_ANTICIPO": {"CONFIRMADO", "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "CANCELADO"},
    "CONFIRMADO": {"PARCIALMENTE_DISPONIBLE", "DISPONIBLE", "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "CANCELADO"},
    "PARCIALMENTE_DISPONIBLE": {"DISPONIBLE", "PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "PARCIALMENTE_ENTREGADO", "CANCELADO"},
    "DISPONIBLE": {"PENDIENTE_SALDO", "LISTO_PARA_ENTREGA", "PARCIALMENTE_ENTREGADO", "CANCELADO"},
    "PENDIENTE_SALDO": {"LISTO_PARA_ENTREGA", "PARCIALMENTE_ENTREGADO", "PENDIENTE_ANTICIPO", "CANCELADO"},
    "LISTO_PARA_ENTREGA": {"PENDIENTE_SALDO", "PARCIALMENTE_ENTREGADO", "ENTREGADO", "CANCELADO"},
    "PARCIALMENTE_ENTREGADO": {"ENTREGADO", "DEVUELTO_TOTAL", "CANCELADO"},
    "ENTREGADO": {"DEVUELTO_TOTAL"},
    "CANCELADO": set(),
    "DEVUELTO_TOTAL": set(),
}

ALLOWED_TRANSITIONS_SALE_LINE = {
    "PENDIENTE": {"PENDIENTE_COMPRA", "PENDIENTE_RESERVA", "RESERVADA", "ASIGNADA_COMPRA", "CANCELADA"},
    "PENDIENTE_COMPRA": {"ASIGNADA_COMPRA", "CANCELADA"},
    "PENDIENTE_RESERVA": {"RESERVADA", "CANCELADA"},
    "ASIGNADA_COMPRA": {"PARCIALMENTE_DISPONIBLE", "RESERVADA", "CANCELADA"},
    "PARCIALMENTE_DISPONIBLE": {"RESERVADA", "LISTA_PARA_ENTREGA", "CANCELADA"},
    "RESERVADA": {"LISTA_PARA_ENTREGA", "ENTREGADA", "CANCELADA"},
    "LISTA_PARA_ENTREGA": {"ENTREGADA", "CANCELADA"},
    "ENTREGADA": {"DEVUELTA_PARCIAL", "DEVUELTA_TOTAL"},
    "DEVUELTA_PARCIAL": {"DEVUELTA_TOTAL"},
    "DEVUELTA_TOTAL": set(),
    "CANCELADA": set(),
}

ALLOWED_TRANSITIONS_PACKING = {
    "EN_PROCESO": {"LISTO_DESPACHO", "CANCELADO"},
    "LISTO_DESPACHO": {"DESPACHADO", "EN_PROCESO", "CANCELADO"},
    "DESPACHADO": set(),
    "CANCELADO": set(),
}

ALLOWED_TRANSITIONS_DELIVERY = {
    "BORRADOR": {"PREPARANDO", "DESPACHADO", "CANCELADO"},
    "PREPARANDO": {"DESPACHADO", "CANCELADO"},
    "DESPACHADO": {"EN_TRANSITO", "ENTREGADO", "INCIDENCIA", "DEVUELTO", "CANCELADO"},
    "EN_TRANSITO": {"ENTREGADO", "INCIDENCIA", "DEVUELTO", "CANCELADO"},
    "ENTREGADO": {"DEVUELTO"},
    "INCIDENCIA": {"DESPACHADO", "EN_TRANSITO", "ENTREGADO", "DEVUELTO", "CANCELADO"},
    "DEVUELTO": set(),
    "CANCELADO": set(),
}

ALLOWED_TRANSITIONS_RETURN = {
    "REGISTRADA": {"PROCESADA", "CANCELADA"},
    "PROCESADA": set(),
    "CANCELADA": set(),
}


def _validate_transition(current: str, target: str, allowed_map: Dict[str, set], entity_name: str):
    if current == target:
        return
    allowed = allowed_map.get(current, set())
    if target not in allowed:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Transición ilegal para {entity_name}: no se permite pasar de '{current}' a '{target}'. Permitidas: {sorted(list(allowed))}"
        )


def recalculate_sale_order_state(so: SaleOrder, db: Session) -> str:
    if so.estado in ("CANCELADO", "DEVUELTO_TOTAL"):
        return so.estado

    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).all()
    if not lines:
        return so.estado

    all_delivered = all(l.estado == "ENTREGADA" or l.quantity_delivered >= (l.quantity - l.quantity_cancelled) for l in lines if l.estado != "CANCELADA")
    any_delivered = any(l.quantity_delivered > 0 for l in lines)
    all_cancelled = all(l.estado == "CANCELADA" or l.quantity_cancelled >= l.quantity for l in lines)
    if all_cancelled and lines:
        return "CANCELADO"

    if all_delivered and not all_cancelled:
        return "ENTREGADO"
    if any_delivered:
        return "PARCIALMENTE_ENTREGADO"

    # Pagos
    anticipo_req_pct = Decimal(str(so.anticipo_pct_snapshot or 60.00))
    total_cop = Decimal(str(so.total_cop or 0))
    anticipo_min_cop = (total_cop * anticipo_req_pct / Decimal("100.00")).quantize(Decimal("0.01"))
    saldo_cop = Decimal(str(so.saldo_cop or 0))
    pagado_cop = total_cop - saldo_cop

    # Anticipo no cubierto
    if pagado_cop < anticipo_min_cop and pagado_cop < total_cop:
        return "PENDIENTE_ANTICIPO"

    # Líneas reservadas
    active_lines = [l for l in lines if l.estado != "CANCELADA"]
    all_ready = all(l.estado in ("RESERVADA", "LISTA_PARA_ENTREGA") or (l.quantity_reserved + l.quantity_delivered >= (l.quantity - l.quantity_cancelled)) for l in active_lines)
    any_ready = any(l.quantity_reserved > 0 for l in active_lines)

    if all_ready:
        has_valid_financial_exception = bool(
            so.policy_exception_authorized_by and
            so.policy_exception_reason and
            len(str(so.policy_exception_reason).strip()) >= 5
        )
        if saldo_cop > Decimal("0.00") and not has_valid_financial_exception:
            return "PENDIENTE_SALDO"
        return "LISTO_PARA_ENTREGA"

    if any_ready:
        return "PARCIALMENTE_DISPONIBLE"

    return "CONFIRMADO"



@router.post("/pedidos/{so_id}/excepcion-financiera")
def authorize_order_financial_exception(
    so_id: int,
    body: FinancialExceptionRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")
    so.policy_exception_authorized_by = body.policy_exception_authorized_by
    so.policy_exception_reason = body.policy_exception_reason
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = _now()
    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="EXCEPCION_FINANCIERA_AUTORIZADA",
        description=f"Excepción financiera autorizada por {body.policy_exception_authorized_by}: {body.policy_exception_reason}",
        new_estado=so.estado,
        user_name=getattr(user, "email", str(getattr(user, "id", "system")))
    )
    db.commit()
    return {
        "status": "success",
        "data": {
            "sale_order_id": so.id,
            "estado": so.estado,
            "authorized_by": so.policy_exception_authorized_by,
            "reason": so.policy_exception_reason
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 1. PEDIDO DE VENTA CANÓNICO
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/canonico", status_code=status.HTTP_201_CREATED)
def create_sale_order_canonical(
    body: SaleOrderCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    customer = db.query(Customer).filter(Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(status_code=404, detail=f"Cliente {body.customer_id} no encontrado")

    # Validar suma de porcentajes
    anticipo_pct = body.anticipo_pct if body.anticipo_pct is not None else Decimal("60.00")
    saldo_pct = body.saldo_pct if body.saldo_pct is not None else (Decimal("100.00") - anticipo_pct)
    if (anticipo_pct + saldo_pct).quantize(Decimal("0.01")) != Decimal("100.00"):
        raise HTTPException(
            status_code=422,
            detail=f"La suma de anticipo_pct ({anticipo_pct}%) y saldo_pct ({saldo_pct}%) debe ser exactamente 100%"
        )

    # Excepción de política financiera
    if body.policy_exception_authorized_by or (anticipo_pct != Decimal("60.00") and anticipo_pct != Decimal("100.00")):
        if body.policy_exception_authorized_by:
            if not body.policy_exception_reason or len(body.policy_exception_reason.strip()) < 5:
                raise HTTPException(422, "policy_exception_reason es obligatorio (mínimo 5 caracteres) para excepciones de política")

    so_num = _gen_numero(db, "VEN-", "seq_ven")

    # Calcular totales
    subtotal_so = Decimal("0.00")
    tax_so = Decimal("0.00")
    total_so = Decimal("0.00")
    total_cost_est = Decimal("0.00")

    validated_lines_data = []
    for line_in in body.lines:
        sku = db.query(ProductSKU).filter(ProductSKU.id == line_in.sku_id).first()
        if not sku:
            raise HTTPException(status_code=404, detail=f"SKU {line_in.sku_id} no encontrado")

        qty = line_in.quantity
        price = line_in.unit_price_cop
        disc_pct = line_in.descuento_pct or Decimal("0.00")
        tax_pct = line_in.tax_pct or Decimal("0.00")

        line_base = (qty * price).quantize(Decimal("0.01"))
        disc_amt = (line_base * (disc_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
        line_subtotal = line_base - disc_amt
        line_tax = (line_subtotal * (tax_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
        line_total = line_subtotal + line_tax

        subtotal_so += line_subtotal
        tax_so += line_tax
        total_so += line_total

        cost_unit = line_in.cost_unit_cop_snapshot or getattr(sku, "cost_price_cop", Decimal("0.00")) or Decimal("0.00")
        total_cost_est += (qty * cost_unit).quantize(Decimal("0.01"))

        validated_lines_data.append({
            "sku_id": line_in.sku_id,
            "description": line_in.description or getattr(sku, "sku", ""),
            "quantity": qty,
            "unit_price_cop": price,
            "descuento_pct": disc_pct,
            "tax_pct": tax_pct,
            "modalidad": line_in.modalidad,
            "owner": line_in.owner,
            "sq_line_id": line_in.sq_line_id,
            "cost_unit_cop_snapshot": cost_unit,
            "price_unit_cop_snapshot": price,
        })

    so = SaleOrder(
        numero=so_num,
        cot_id=body.cot_id,
        sc_id=body.sc_id,
        customer_id=customer.id,
        customer_name=_customer_full_name(customer),
        customer_phone=customer.phone,
        customer_email=customer.email,
        customer_address=customer.address,
        direccion_entrega=body.direccion_entrega or customer.address,
        fecha_entrega_estimada=body.fecha_entrega_estimada,
        trm_rate=body.trm_rate,
        subtotal_cop=subtotal_so,
        tax_cop=tax_so,
        total_cop=total_so,
        anticipo_cop=Decimal("0.00"),
        saldo_cop=total_so,
        estado="PENDIENTE_ANTICIPO" if anticipo_pct > Decimal("0.00") else "CONFIRMADO",
        notas=body.notas,
        productos=[],
        canal_venta=body.canal_venta or "CRM",
        anticipo_pct_snapshot=anticipo_pct,
        saldo_pct_snapshot=saldo_pct,
        policy_exception_authorized_by=body.policy_exception_authorized_by,
        policy_exception_reason=body.policy_exception_reason,
        total_cost_cop=total_cost_est,
        estimated_profit_cop=total_so - total_cost_est,
        real_profit_cop=None,
        profit_is_estimated=True,
        created_by=user_name,
        created_at=now,
        updated_at=now,
    )
    db.add(so)
    db.flush()

    # Crear líneas
    created_lines = []
    for ld in validated_lines_data:
        sol = SaleOrderLineErp(
            so_id=so.id,
            customer_id=customer.id,
            sku_id=ld["sku_id"],
            description=ld["description"],
            quantity=ld["quantity"],
            unit_price_cop=ld["unit_price_cop"],
            descuento_pct=ld["descuento_pct"],
            tax_pct=ld["tax_pct"],
            modalidad=ld["modalidad"],
            owner=ld["owner"],
            quantity_reserved=Decimal("0.00"),
            quantity_delivered=Decimal("0.00"),
            quantity_cancelled=Decimal("0.00"),
            estado="PENDIENTE_RESERVA" if ld["modalidad"] == "ENTREGA_INMEDIATA" else "PENDIENTE_COMPRA",
            sq_line_id=ld["sq_line_id"],
            cost_unit_cop_snapshot=ld["cost_unit_cop_snapshot"],
            price_unit_cop_snapshot=ld["price_unit_cop_snapshot"],
            created_at=now,
            updated_at=now,
        )
        db.add(sol)
        db.flush()
        created_lines.append(sol)

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="VENTA_CREADA",
        description=f"Pedido canónico {so.numero} creado con {len(created_lines)} líneas. Total: ${total_so:,.0f} COP",
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"lines_count": len(created_lines), "total_cop": str(total_so)}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "id": so.id,
            "numero": so.numero,
            "estado": so.estado,
            "total_cop": float(so.total_cop),
            "subtotal_cop": float(so.subtotal_cop),
            "tax_cop": float(so.tax_cop),
            "saldo_cop": float(so.saldo_cop),
            "anticipo_cop": float(so.anticipo_cop),
            "anticipo_pct": float(so.anticipo_pct_snapshot),
            "saldo_pct": float(so.saldo_pct_snapshot),
            "anticipo_requerido": float((so.total_cop * so.anticipo_pct_snapshot / Decimal("100.00")).quantize(Decimal("0.01"))),
            "saldo_requerido": float((so.total_cop * so.saldo_pct_snapshot / Decimal("100.00")).quantize(Decimal("0.01"))),
            "lines": [
                {
                    "id": l.id,
                    "sku_id": l.sku_id,
                    "quantity": float(l.quantity),
                    "modalidad": l.modalidad,
                    "owner": l.owner,
                    "estado": l.estado,
                }
                for l in created_lines
            ]
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. ENTREGA INMEDIATA (RESERVA AUTOMÁTICA Y PESIMISTA)
# ─────────────────────────────────────────────────────────────────────────────

def check_and_reserve_stock(
    db: Session,
    sku_id: int,
    warehouse_id: int,
    owner: str,
    qty_to_reserve: Decimal,
    sale_order_line_id: int,
    idempotency_key: str,
    user_name: str,
    now: datetime.datetime,
    notes: str = ""
) -> InventoryReservation:
    """
    Calcula simultáneamente la disponibilidad física y por propietario:
      disponible_fisico = InventoryLevel.quantity - SUM(ACTIVE res para SKU y bodega)
      disponible_owner  = InventoryOwnerBalance.quantity - SUM(ACTIVE res para SKU, bodega y owner)
    Bloquea de forma transaccional pesimista InventoryLevel e InventoryOwnerBalance.
    Exige: qty_to_reserve <= disponible_fisico Y qty_to_reserve <= disponible_owner.
    Si alguna condición falla, levanta HTTP 409 Conflict.
    Crea, persiste y retorna InventoryReservation con status ACTIVE.
    """
    # 1. Bloqueo transaccional pesimista de InventoryLevel
    lvl = db.execute(
        select(InventoryLevel).where(
            InventoryLevel.sku_id == sku_id,
            InventoryLevel.warehouse_id == warehouse_id
        ).with_for_update()
    ).scalar_one_or_none()
    if not lvl:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"No existe nivel de inventario para SKU {sku_id} en bodega {warehouse_id}"
        )

    # 2. Bloqueo transaccional pesimista de InventoryOwnerBalance para el owner exacto
    owner_bal = db.execute(
        select(InventoryOwnerBalance).where(
            InventoryOwnerBalance.sku_id == sku_id,
            InventoryOwnerBalance.warehouse_id == warehouse_id,
            InventoryOwnerBalance.owner == owner
        ).with_for_update()
    ).scalar_one_or_none()

    # 3. Sumar reservas activas físicas (globales SKU + warehouse)
    active_res_fisico = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
            InventoryReservation.sku_id == sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.status == "ACTIVE"
        )
    ).scalar() or Decimal("0.00")
    disponible_fisico = max(Decimal("0.00"), Decimal(str(lvl.quantity)) - Decimal(str(active_res_fisico)))

    # 4. Sumar reservas activas del propietario (SKU + warehouse + owner)
    active_res_owner = db.execute(
        select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))).where(
            InventoryReservation.sku_id == sku_id,
            InventoryReservation.warehouse_id == warehouse_id,
            InventoryReservation.owner == owner,
            InventoryReservation.status == "ACTIVE"
        )
    ).scalar() or Decimal("0.00")
    owner_qty = Decimal(str(owner_bal.quantity)) if owner_bal else Decimal("0.00")
    disponible_owner = max(Decimal("0.00"), owner_qty - Decimal(str(active_res_owner)))

    # 5. Validaciones de suficiencia simultánea
    if disponible_fisico < qty_to_reserve:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Stock físico insuficiente en bodega {warehouse_id}: disponible {disponible_fisico}, requerido {qty_to_reserve}"
        )
    if disponible_owner < qty_to_reserve:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Balance disponible insuficiente del propietario '{owner}' en bodega {warehouse_id}: disponible {disponible_owner}, requerido {qty_to_reserve}"
        )

    # 6. Crear la reserva
    rsv = InventoryReservation(
        sku_id=sku_id,
        warehouse_id=warehouse_id,
        owner=owner,
        quantity_reserved=qty_to_reserve,
        sale_order_line_id=sale_order_line_id,
        status="ACTIVE",
        idempotency_key=idempotency_key,
        created_by=user_name,
        created_at=now,
        notes=notes or f"Reserva línea {sale_order_line_id}"
    )
    db.add(rsv)
    db.flush()
    return rsv


@router.post("/pedidos/{so_id}/lineas/{line_id}/confirmar-inmediata")
def confirm_immediate_sale_line(
    so_id: int,
    line_id: int,
    warehouse_id: int = Query(..., description="Bodega de despacho"),
    idempotency_key: str = Query(..., min_length=3),
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    # Idempotencia con columna explícita
    existing_res = db.execute(
        select(InventoryReservation).where(InventoryReservation.idempotency_key == idempotency_key)
    ).scalar_one_or_none()
    if existing_res:
        if existing_res.sale_order_line_id != line_id or existing_res.warehouse_id != warehouse_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="idempotency_key ya utilizada para otra reserva o parámetros divergentes"
            )
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
    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    line = db.execute(
        select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id, SaleOrderLineErp.so_id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not line:
        raise HTTPException(404, f"Línea {line_id} no encontrada en el pedido {so_id}")

    if line.modalidad != "ENTREGA_INMEDIATA":
        raise HTTPException(422, f"La línea {line_id} tiene modalidad '{line.modalidad}', se requiere 'ENTREGA_INMEDIATA'")

    qty_to_reserve = Decimal(str(line.quantity)) - Decimal(str(line.quantity_reserved or 0)) - Decimal(str(line.quantity_cancelled or 0))
    if qty_to_reserve <= Decimal("0.00"):
        return {
            "status": "success",
            "message": "La línea ya tiene reservas completas para su cantidad vendible",
            "data": {"quantity_reserved": float(line.quantity_reserved)}
        }

    # Reservar mediante helper canónico con validación simultánea física y de propietario
    rsv = check_and_reserve_stock(
        db=db,
        sku_id=line.sku_id,
        warehouse_id=warehouse_id,
        owner=line.owner,
        qty_to_reserve=qty_to_reserve,
        sale_order_line_id=line.id,
        idempotency_key=idempotency_key,
        user_name=user_name,
        now=now,
        notes=f"Reserva inmediata pedido {so.numero} línea {line.id}"
    )

    line.quantity_reserved = Decimal(str(line.quantity_reserved or 0)) + qty_to_reserve
    _validate_transition(line.estado, "RESERVADA", ALLOWED_TRANSITIONS_SALE_LINE, f"Línea {line.id}")
    line.estado = "RESERVADA"
    line.updated_at = now

    old_so_state = so.estado
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="RESERVA_INMEDIATA_CREADA",
        description=f"Reserva inmediata creada por {qty_to_reserve} unidades para SKU {line.sku_id}. Estado pedido: {so.estado}",
        old_estado=old_so_state,
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"line_id": line.id, "quantity_reserved": str(qty_to_reserve), "idempotency_key": idempotency_key}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "reservation_id": rsv.id,
            "sale_order_line_id": line.id,
            "quantity_reserved": float(line.quantity_reserved),
            "line_estado": line.estado,
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 3. PAGOS Y REVERSIONES (FINANZAS Y LEDGER INMUTABLE)
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/pagos", status_code=status.HTTP_201_CREATED)
def register_sale_order_payment(
    so_id: int,
    body: SaleOrderPaymentCreate,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))
    client_key = body.idempotency_key.strip()
    monto = Decimal(str(body.monto))
    tipo = body.tipo.strip().upper()

    # Verificar idempotencia
    existing_p = db.execute(
        select(SaleOrderPayment).where(SaleOrderPayment.idempotency_key == client_key)
    ).scalar_one_or_none()
    if existing_p:
        if existing_p.sale_order_id != so_id or existing_p.monto != monto or existing_p.tipo != tipo:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="idempotency_key ya utilizada con venta, monto o tipo diferente"
            )
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
    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    if so.estado == "CANCELADO":
        raise HTTPException(409, "No se pueden registrar pagos en un pedido CANCELADO")

    # Manejo de reversión
    reversed_id = None
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
            raise HTTPException(404, f"Transacción original {body.reversed_payment_id} no encontrada en este pedido")

        if orig_p.tipo in ("DEVOLUCION", "REVERSION", "ANULADO"):
            raise HTTPException(422, f"No se puede revertir una transacción de tipo '{orig_p.tipo}'. Solo pagos positivos confirmados.")

        if orig_p.estado != "CONFIRMADO":
            raise HTTPException(status_code=409, detail=f"La transacción original ya se encuentra en estado '{orig_p.estado}'")

        # Verificar si ya existe reversión registrada para este pago
        already_reverted = db.execute(
            select(SaleOrderPayment).where(
                SaleOrderPayment.reversed_payment_id == orig_p.id,
                SaleOrderPayment.tipo == "REVERSION",
                SaleOrderPayment.estado != "ANULADO"
            )
        ).scalar_one_or_none()
        if already_reverted:
            raise HTTPException(status_code=409, detail="La transacción original ya fue revertida previamente")

        # La reversión debe neutralizar exactamente el monto y moneda original
        monto = orig_p.monto
        body.moneda = orig_p.moneda
        orig_p.estado = "REVERTIDO"
        reversed_id = orig_p.id

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
        reversed_payment_id=reversed_id,
        notes=body.notes,
        created_at=now,
    )
    db.add(p)
    db.flush()

    # Recalcular totales desde el ledger
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
        SaleOrderPayment.tipo == "DEVOLUCION"
    ).scalar() or Decimal("0.00")

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

    old_estado = so.estado
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="REVERSION_PAGO" if tipo == "REVERSION" else ("ANTICIPO_RECIBIDO" if tipo == "ANTICIPO" else "PAGO_REGISTRADO"),
        description=f"Pago {tipo} registrado por ${monto:,.0f} COP. Neto pagado: ${net_pagado:,.0f} COP. Saldo: ${so.saldo_cop:,.0f} COP",
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
            "net_pagado": float(net_pagado),
            "saldo_cop": float(so.saldo_cop),
            "anticipo_cop": float(so.anticipo_cop),
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 4. CANCELACIONES TOTALES Y PARCIALES
# ─────────────────────────────────────────────────────────────────────────────

def _apply_purchased_goods_decision(
    decision: Optional[str],
    line: SaleOrderLineErp,
    qty_affected: Decimal,
    target_customer_id: Optional[int],
    target_sale_order_line_id: Optional[int],
    user_name: str,
    db: Session
):
    if not decision or qty_affected <= Decimal("0.00"):
        return

    now = _now()
    qty_affected = Decimal(str(qty_affected))

    # 1. Validar REASIGNAR_CLIENTE antes de cualquier mutación si esta es la decisión
    target_line = None
    target_so = None
    if decision == "REASIGNAR_CLIENTE":
        if not target_customer_id or not target_sale_order_line_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="REASIGNAR_CLIENTE requiere 'target_customer_id' y 'target_sale_order_line_id'"
            )
        target_cust = db.query(Customer).filter(Customer.id == target_customer_id).first()
        if not target_cust:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Cliente destino {target_customer_id} no encontrado")
        target_line = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == target_sale_order_line_id).with_for_update().first()
        if not target_line:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Línea destino {target_sale_order_line_id} no encontrada")
        target_so = db.query(SaleOrder).filter(SaleOrder.id == target_line.so_id).with_for_update().first()
        if not target_so or (target_line.customer_id != target_customer_id and target_so.customer_id != target_customer_id):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"La línea destino {target_line.id} no pertenece al cliente destino {target_customer_id}")
        if target_line.id == line.id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="La línea destino no puede ser la misma línea de origen")
        if target_line.sku_id != line.sku_id:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"SKU incompatible: origen={line.sku_id}, destino={target_line.sku_id}")
        if target_line.owner != line.owner:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Propietario incompatible: origen={line.owner}, destino={target_line.owner}")
        if target_line.estado in ("CANCELADA", "ENTREGADA", "DEVUELTA_TOTAL"):
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Línea destino en estado '{target_line.estado}' no es válida para reasignación")
        target_pending_need = (target_line.quantity - target_line.quantity_delivered - target_line.quantity_cancelled) - target_line.quantity_reserved
        if qty_affected > target_pending_need:
            raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"Cantidad reasignada ({qty_affected}) supera la necesidad pendiente ({target_pending_need}) de la línea destino {target_line.id}")

    # 2. Manejar reservas de inventario activas para exactamente qty_affected
    res_active = db.query(InventoryReservation).filter(
        InventoryReservation.sale_order_line_id == line.id,
        InventoryReservation.status == "ACTIVE"
    ).order_by(InventoryReservation.id.asc()).with_for_update().all()

    rem_res = qty_affected
    for r in res_active:
        if rem_res <= Decimal("0.00"):
            break
        if r.quantity_reserved <= rem_res:
            take_qty = r.quantity_reserved
            rem_res -= take_qty
            target_res_obj = r
        else:
            take_qty = rem_res
            rem_res = Decimal("0.00")
            r.quantity_reserved -= take_qty
            split_res = InventoryReservation(
                sku_id=r.sku_id,
                warehouse_id=r.warehouse_id,
                owner=r.owner,
                quantity_reserved=take_qty,
                sale_order_line_id=r.sale_order_line_id,
                status="ACTIVE",
                created_at=r.created_at,
                created_by=user_name,
                notes=f"Split de reserva {r.id} por cancelación parcial"
            )
            db.add(split_res)
            db.flush()
            target_res_obj = split_res

        # Aplicar decisión a target_res_obj
        if decision == "PASAR_A_STOCK_NEBULAE":
            orig_owner = target_res_obj.owner
            target_res_obj.owner = "NEBULAE"
            target_res_obj.sale_order_line_id = None
            target_res_obj.status = "RELEASED"
            target_res_obj.released_at = now
            target_res_obj.notes = (target_res_obj.notes or "") + " [Transferido a stock Nebulae por cancelación]"
            if orig_owner != "NEBULAE":
                ob_orig = db.query(InventoryOwnerBalance).filter(
                    InventoryOwnerBalance.sku_id == target_res_obj.sku_id,
                    InventoryOwnerBalance.warehouse_id == target_res_obj.warehouse_id,
                    InventoryOwnerBalance.owner == orig_owner
                ).with_for_update().first()
                if ob_orig and ob_orig.quantity >= take_qty:
                    ob_orig.quantity -= take_qty
                ob_neb = db.query(InventoryOwnerBalance).filter(
                    InventoryOwnerBalance.sku_id == target_res_obj.sku_id,
                    InventoryOwnerBalance.warehouse_id == target_res_obj.warehouse_id,
                    InventoryOwnerBalance.owner == "NEBULAE"
                ).with_for_update().first()
                if not ob_neb:
                    ob_neb = InventoryOwnerBalance(
                        sku_id=target_res_obj.sku_id,
                        warehouse_id=target_res_obj.warehouse_id,
                        owner="NEBULAE",
                        quantity=Decimal("0.00"),
                        updated_at=now
                    )
                    db.add(ob_neb)
                ob_neb.quantity += take_qty

        elif decision == "MANTENER_PENDIENTE":
            target_res_obj.sale_order_line_id = None
            target_res_obj.status = "RELEASED"
            target_res_obj.released_at = now
            target_res_obj.notes = (target_res_obj.notes or "") + " [Liberado a stock pendiente por cancelación]"

        elif decision == "REASIGNAR_CLIENTE":
            target_res_obj.sale_order_line_id = target_sale_order_line_id
            target_res_obj.notes = (target_res_obj.notes or "") + f" [Reasignado desde línea {line.id}]"

        elif decision == "DEVOLVER_PROVEEDOR":
            target_res_obj.status = "RELEASED"
            target_res_obj.released_at = now
            lvl = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == target_res_obj.sku_id,
                InventoryLevel.warehouse_id == target_res_obj.warehouse_id
            ).with_for_update().first()
            if lvl and lvl.quantity >= take_qty:
                lvl.quantity -= take_qty
            ob = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == target_res_obj.sku_id,
                InventoryOwnerBalance.warehouse_id == target_res_obj.warehouse_id,
                InventoryOwnerBalance.owner == target_res_obj.owner
            ).with_for_update().first()
            if ob and ob.quantity >= take_qty:
                ob.quantity -= take_qty
            inv_op = InventoryOperation(
                operation_type="PHYSICAL_INVENTORY",
                source_warehouse_id=target_res_obj.warehouse_id,
                dest_warehouse_id=None,
                status="DONE",
                source_document_type="CANCELACION",
                source_document_id=line.id,
                source_document_numero=f"SOL-{line.id}",
            )
            db.add(inv_op)
            db.flush()
            mov = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=target_res_obj.sku_id,
                warehouse_id=target_res_obj.warehouse_id,
                direction="OUT",
                quantity=take_qty,
                owner=target_res_obj.owner,
                idempotency_key=f"mov-canc-dev-{line.id}-{target_res_obj.id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add(mov)

        elif decision == "REGISTRAR_PERDIDA":
            target_res_obj.status = "RELEASED"
            target_res_obj.released_at = now
            lvl = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == target_res_obj.sku_id,
                InventoryLevel.warehouse_id == target_res_obj.warehouse_id
            ).with_for_update().first()
            if lvl and lvl.quantity >= take_qty:
                lvl.quantity -= take_qty
            ob = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == target_res_obj.sku_id,
                InventoryOwnerBalance.warehouse_id == target_res_obj.warehouse_id,
                InventoryOwnerBalance.owner == target_res_obj.owner
            ).with_for_update().first()
            if ob and ob.quantity >= take_qty:
                ob.quantity -= take_qty
            inv_op = InventoryOperation(
                operation_type="SCRAP",
                source_warehouse_id=target_res_obj.warehouse_id,
                dest_warehouse_id=None,
                status="DONE",
                source_document_type="CANCELACION",
                source_document_id=line.id,
                source_document_numero=f"SOL-{line.id}",
            )
            db.add(inv_op)
            db.flush()
            mov = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=target_res_obj.sku_id,
                warehouse_id=target_res_obj.warehouse_id,
                direction="SCRAP",
                quantity=take_qty,
                owner=target_res_obj.owner,
                idempotency_key=f"mov-canc-scrap-{line.id}-{target_res_obj.id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add(mov)

    # 3. Manejar ProcurementAllocations si existen para exactamente qty_affected
    allocs = db.query(ProcurementAllocation).filter(
        ProcurementAllocation.sale_order_line_id == line.id
    ).order_by(ProcurementAllocation.id.asc()).with_for_update().all()

    rem_alloc = qty_affected
    for a in allocs:
        if rem_alloc <= Decimal("0.00"):
            break
        if a.quantity_allocated <= rem_alloc:
            take_alloc = a.quantity_allocated
            rem_alloc -= take_alloc
            target_alloc_obj = a
        else:
            take_alloc = rem_alloc
            rem_alloc = Decimal("0.00")
            a.quantity_allocated -= take_alloc
            target_alloc_obj = None

        if decision == "PASAR_A_STOCK_NEBULAE":
            existing_stock_alloc = db.query(ProcurementAllocation).filter(
                ProcurementAllocation.po_line_id == a.po_line_id,
                ProcurementAllocation.allocation_type == "NEBULAE_STOCK",
                ProcurementAllocation.sale_order_line_id.is_(None)
            ).first()
            if existing_stock_alloc:
                existing_stock_alloc.quantity_allocated += take_alloc
            else:
                new_alloc = ProcurementAllocation(
                    po_line_id=a.po_line_id,
                    allocation_type="NEBULAE_STOCK",
                    sale_order_line_id=None,
                    quantity_allocated=take_alloc,
                    created_at=now
                )
                db.add(new_alloc)
            if target_alloc_obj:
                db.delete(target_alloc_obj)

        elif decision == "MANTENER_PENDIENTE":
            if target_alloc_obj:
                target_alloc_obj.sale_order_line_id = None
            else:
                new_alloc = ProcurementAllocation(
                    po_line_id=a.po_line_id,
                    allocation_type=a.allocation_type,
                    sale_order_line_id=None,
                    quantity_allocated=take_alloc,
                    created_at=now
                )
                db.add(new_alloc)

        elif decision == "REASIGNAR_CLIENTE":
            existing_target_alloc = db.query(ProcurementAllocation).filter(
                ProcurementAllocation.po_line_id == a.po_line_id,
                ProcurementAllocation.allocation_type == "CUSTOMER_ORDER",
                ProcurementAllocation.sale_order_line_id == target_sale_order_line_id
            ).first()
            if existing_target_alloc:
                existing_target_alloc.quantity_allocated += take_alloc
            else:
                new_alloc = ProcurementAllocation(
                    po_line_id=a.po_line_id,
                    allocation_type="CUSTOMER_ORDER",
                    sale_order_line_id=target_sale_order_line_id,
                    quantity_allocated=take_alloc,
                    created_at=now
                )
                db.add(new_alloc)
            if target_alloc_obj:
                db.delete(target_alloc_obj)

        elif decision in ("DEVOLVER_PROVEEDOR", "REGISTRAR_PERDIDA"):
            if target_alloc_obj:
                db.delete(target_alloc_obj)

    db.flush()
    # Si fue REASIGNAR_CLIENTE, actualizar target_line y target_so
    if decision == "REASIGNAR_CLIENTE" and target_line:
        target_line.quantity_reserved = db.query(
            func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))
        ).filter(
            InventoryReservation.sale_order_line_id == target_line.id,
            InventoryReservation.status == "ACTIVE"
        ).scalar() or Decimal("0.00")
        if target_line.quantity_reserved >= (target_line.quantity - target_line.quantity_delivered - target_line.quantity_cancelled):
            target_line.estado = "RESERVADA"
        target_line.updated_at = now
        so = db.query(SaleOrder).filter(SaleOrder.id == line.so_id).first()
        so_num = so.numero if so else f"SO-{line.so_id}"
        _log_event(
            db=db,
            entity_type="PVEN",
            entity_id=line.so_id,
            entity_numero=so_num,
            action="MERCANCIA_REASIGNADA",
            description=f"Reasignadas {qty_affected} unidades de línea {line.id} a cliente {target_customer_id}, línea {target_line.id}",
            user_name=user_name,
            extra_data={"source_line_id": line.id, "target_line_id": target_line.id, "target_customer_id": target_customer_id, "quantity": str(qty_affected)}
        )
        if target_so:
            target_so.estado = recalculate_sale_order_state(target_so, db)
            target_so.updated_at = now

    db.flush()
    # Reconciliar estrictamente line.quantity_reserved con las reservas ACTIVE restantes
    line.quantity_reserved = db.query(
        func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))
    ).filter(
        InventoryReservation.sale_order_line_id == line.id,
        InventoryReservation.status == "ACTIVE"
    ).scalar() or Decimal("0.00")



@router.post("/pedidos/{so_id}/cancelar")
def cancel_sale_order(
    so_id: int,
    body: CancelSaleOrderRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    if so.estado == "CANCELADO":
        raise HTTPException(status_code=409, detail="El pedido ya se encuentra CANCELADO")

    _validate_transition(so.estado, "CANCELADO", ALLOWED_TRANSITIONS_SALE_ORDER, "Pedido de Venta")

    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).with_for_update().all()
    has_procurement = db.query(ProcurementAllocation).filter(
        ProcurementAllocation.sale_order_line_id.in_([l.id for l in lines])
    ).first() is not None
    has_reservations = db.query(InventoryReservation).filter(
        InventoryReservation.sale_order_line_id.in_([l.id for l in lines]),
        InventoryReservation.status == "ACTIVE"
    ).first() is not None

    if (has_procurement or has_reservations) and not body.purchased_goods_decision:
        raise HTTPException(
            status_code=422,
            detail="El pedido tiene compras asignadas o mercancía reservada. Debe proveer 'purchased_goods_decision' obligatoria."
        )

    for l in lines:
        cancelable_qty = l.quantity - l.quantity_delivered - l.quantity_cancelled
        if cancelable_qty > Decimal("0.00"):
            _apply_purchased_goods_decision(
                body.purchased_goods_decision,
                l,
                cancelable_qty,
                body.target_customer_id,
                body.target_sale_order_line_id,
                user_name,
                db
            )
            # Liberar reservas activas
            db.query(InventoryReservation).filter(
                InventoryReservation.sale_order_line_id == l.id,
                InventoryReservation.status == "ACTIVE"
            ).update({"status": "RELEASED", "released_at": now})

            l.quantity_cancelled = l.quantity - l.quantity_delivered
            l.quantity_reserved = Decimal("0.00")
            l.estado = "CANCELADA"
            l.updated_at = now

    old_estado = so.estado
    so.estado = "CANCELADO"
    so.cancellation_reason = body.motivo
    so.cancellation_authorized_by = body.authorized_by or user_name
    so.cancelled_at = now
    so.updated_at = now

    # Liquidación financiera de saldo a favor
    pagos_positivos = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO"])
    ).scalar() or Decimal("0.00")

    devoluciones = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo == "DEVOLUCION"
    ).scalar() or Decimal("0.00")

    saldo_a_favor = max(Decimal("0.00"), Decimal(str(pagos_positivos)) - Decimal(str(devoluciones)))

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="VENTA_CANCELADA",
        description=f"Pedido {so.numero} cancelado. Motivo: {body.motivo}. Saldo a favor cliente: ${saldo_a_favor:,.0f} COP",
        old_estado=old_estado,
        new_estado="CANCELADO",
        user_name=user_name,
        extra_data={"saldo_a_favor_cliente": str(saldo_a_favor), "decision": body.purchased_goods_decision}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "sale_order_id": so.id,
            "id": so.id,
            "numero": so.numero,
            "estado": so.estado,
            "saldo_a_favor_cliente": float(saldo_a_favor),
            "dinero_a_favor_cop": float(saldo_a_favor),
            "decision": body.purchased_goods_decision,
            "decision_mercancia": body.purchased_goods_decision,
        }
    }


@router.post("/pedidos/{so_id}/lineas/{line_id}/cancelar")
def cancel_sale_order_line(
    so_id: int,
    line_id: int,
    body: CancelLineRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    line = db.execute(
        select(SaleOrderLineErp).where(SaleOrderLineErp.id == line_id, SaleOrderLineErp.so_id == so_id).with_for_update()
    ).scalar_one_or_none()
    if not line:
        raise HTTPException(404, f"Línea {line_id} no encontrada en pedido {so_id}")

    max_cancelable = line.quantity - line.quantity_delivered - line.quantity_cancelled
    if max_cancelable <= Decimal("0.00"):
        raise HTTPException(422, "La línea no tiene unidades cancelables")

    qty_to_cancel = body.quantity if body.quantity is not None else max_cancelable
    if qty_to_cancel > max_cancelable:
        raise HTTPException(422, f"Cantidad a cancelar ({qty_to_cancel}) supera la cantidad cancelable ({max_cancelable})")

    decision = body.purchased_goods_decision or getattr(body, "decision", None)
    # Verificar compras asociadas
    alloc = db.query(ProcurementAllocation).filter(
        ProcurementAllocation.sale_order_line_id == line.id
    ).first()
    if alloc and not decision:
        raise HTTPException(422, "La línea tiene compras asociadas. Debe indicar 'purchased_goods_decision'.")

    _apply_purchased_goods_decision(
        decision,
        line,
        qty_to_cancel,
        body.target_customer_id,
        body.target_sale_order_line_id,
        user_name,
        db
    )

    if not decision:
        # Liberar reserva proporcional únicamente si no se aplicó una decisión específica
        res_active = db.query(InventoryReservation).filter(
            InventoryReservation.sale_order_line_id == line.id,
            InventoryReservation.status == "ACTIVE"
        ).order_by(InventoryReservation.id.asc()).all()
        rem_lib = qty_to_cancel
        for r in res_active:
            if rem_lib <= Decimal("0.00"):
                break
            if r.quantity_reserved <= rem_lib:
                r.status = "RELEASED"
                r.released_at = now
                rem_lib -= r.quantity_reserved
            else:
                r.quantity_reserved -= rem_lib
                rem_lib = Decimal("0.00")

    db.flush()
    # Reconciliar cantidad reservada de la línea con reservas activas
    line.quantity_reserved = db.query(
        func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))
    ).filter(
        InventoryReservation.sale_order_line_id == line.id,
        InventoryReservation.status == "ACTIVE"
    ).scalar() or Decimal("0.00")

    line.quantity_cancelled += qty_to_cancel
    if line.quantity_cancelled + line.quantity_delivered >= line.quantity:
        line.estado = "CANCELADA"
    line.updated_at = now

    # Recalcular totales del pedido
    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).all()
    new_subtotal = Decimal("0.00")
    new_tax = Decimal("0.00")
    new_total = Decimal("0.00")
    for l in lines:
        vendible_qty = l.quantity - l.quantity_cancelled
        if vendible_qty > Decimal("0.00"):
            l_base = (vendible_qty * l.unit_price_cop).quantize(Decimal("0.01"))
            l_disc = (l_base * (l.descuento_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
            l_sub = l_base - l_disc
            l_tx = (l_sub * (l.tax_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
            new_subtotal += l_sub
            new_tax += l_tx
            new_total += (l_sub + l_tx)

    so.subtotal_cop = new_subtotal
    so.tax_cop = new_tax
    so.total_cop = new_total

    # Pagos netos
    pagos_positivos = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO"])
    ).scalar() or Decimal("0.00")
    devoluciones = db.query(
        func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
    ).filter(
        SaleOrderPayment.sale_order_id == so.id,
        SaleOrderPayment.estado == "CONFIRMADO",
        SaleOrderPayment.tipo == "DEVOLUCION"
    ).scalar() or Decimal("0.00")
    net_pagado = max(Decimal("0.00"), Decimal(str(pagos_positivos)) - Decimal(str(devoluciones)))
    so.saldo_cop = max(Decimal("0.00"), new_total - net_pagado)

    old_so_state = so.estado
    so.estado = recalculate_sale_order_state(so, db)
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="PVEN",
        entity_id=so.id,
        entity_numero=so.numero,
        action="LINEA_CANCELADA",
        description=f"Línea {line.id} canceló {qty_to_cancel} unidades. Motivo: {body.motivo}. Nuevo total pedido: ${new_total:,.0f} COP",
        old_estado=old_so_state,
        new_estado=so.estado,
        user_name=user_name,
        extra_data={"line_id": line.id, "quantity_cancelled": str(qty_to_cancel)}
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "line_id": line.id,
            "quantity_cancelled": float(line.quantity_cancelled),
            "line_estado": line.estado,
            "sale_order_total_cop": float(so.total_cop),
            "sale_order_saldo_cop": float(so.saldo_cop),
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 5. ZONA DE EMPAQUE OPERATIVA
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/empaque/sesiones", status_code=status.HTTP_201_CREATED)
def create_packing_session(
    body: PackingSessionCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    customer = db.query(Customer).filter(Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, f"Cliente {body.customer_id} no encontrado")

    warehouse = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
    if not warehouse:
        raise HTTPException(404, f"Bodega {body.warehouse_id} no encontrada")

    emp_numero = _gen_numero(db, "EMP-", "seq_emp")
    sess = SalePackingSession(
        numero=emp_numero,
        customer_id=body.customer_id,
        warehouse_id=body.warehouse_id,
        status="EN_PROCESO",
        responsible_user=user_name,
        observations=body.observations,
        created_at=now,
    )
    db.add(sess)
    db.flush()

    # Validar primero que todos los pedidos pertenezcan al mismo cliente de la sesión
    for it in body.items:
        so = db.query(SaleOrder).filter(SaleOrder.id == it.sale_order_id).first()
        if not so:
            raise HTTPException(404, f"Pedido {it.sale_order_id} no encontrado")
        if so.customer_id != body.customer_id:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"No se permite agrupar pedidos de clientes diferentes: el pedido {it.sale_order_id} pertenece al cliente {so.customer_id}, no al cliente {body.customer_id} de la sesión"
            )

    created_items = []
    for it in body.items:
        line = db.query(SaleOrderLineErp).filter(
            SaleOrderLineErp.id == it.sale_order_line_id,
            SaleOrderLineErp.so_id == it.sale_order_id
        ).first()
        if not line:
            raise HTTPException(404, f"Línea {it.sale_order_line_id} no encontrada en pedido {it.sale_order_id}")

        if line.sku_id != it.sku_id:
            raise HTTPException(422, f"SKU {it.sku_id} no coincide con el SKU de la línea {line.sku_id}")

        if line.estado in ("CANCELADA", "DEVUELTA_TOTAL"):
            raise HTTPException(422, f"La línea {line.id} se encuentra en estado terminal '{line.estado}'")

        # Validar rigurosamente que cada cantidad a empacar esté respaldada por reserva ACTIVE en la misma bodega
        active_res_qty = db.query(
            func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))
        ).filter(
            InventoryReservation.sale_order_line_id == line.id,
            InventoryReservation.warehouse_id == body.warehouse_id,
            InventoryReservation.status == "ACTIVE"
        ).scalar() or Decimal("0.00")

        if active_res_qty <= Decimal("0.00"):
            if line.modalidad == "ENTREGA_INMEDIATA":
                rsv_key = f"rsv-pack-auto-{sess.id}-{line.id}-{uuid.uuid4().hex[:8]}"
                auto_rsv = check_and_reserve_stock(
                    db=db,
                    sku_id=line.sku_id,
                    warehouse_id=body.warehouse_id,
                    owner=line.owner,
                    qty_to_reserve=it.quantity,
                    sale_order_line_id=line.id,
                    idempotency_key=rsv_key,
                    user_name=user_name,
                    now=now,
                    notes=f"Reserva automática para sesión de empaque {sess.numero}"
                )
                active_res_qty = it.quantity
                line.quantity_reserved = (line.quantity_reserved or Decimal("0.00")) + it.quantity
                if line.quantity_reserved >= (line.quantity - line.quantity_delivered - line.quantity_cancelled):
                    line.estado = "RESERVADA"
                line.updated_at = now

        if active_res_qty <= Decimal("0.00"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"La línea {line.id} no tiene reserva física activa en la bodega {body.warehouse_id}. No se puede empacar mercancía sin reserva previa."
            )

        already_packed = db.query(
            func.coalesce(func.sum(SalePackingItem.quantity), Decimal("0.00"))
        ).join(SalePackingSession).filter(
            SalePackingItem.sale_order_line_id == line.id,
            SalePackingSession.warehouse_id == body.warehouse_id,
            SalePackingSession.status.in_(["EN_PROCESO", "LISTO_DESPACHO"])
        ).scalar() or Decimal("0.00")

        pending_to_pack = active_res_qty - already_packed
        if it.quantity > pending_to_pack:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Cantidad a empacar ({it.quantity}) supera la reserva activa disponible ({pending_to_pack}) en bodega {body.warehouse_id} para la línea {line.id}"
            )

        p_item = SalePackingItem(
            packing_id=sess.id,
            sale_order_id=it.sale_order_id,
            sale_order_line_id=it.sale_order_line_id,
            sku_id=it.sku_id,
            quantity=it.quantity,
            verified_quantity=Decimal("0.00"),
            status="PENDIENTE",
            notes=it.notes,
            created_at=now,
        )
        db.add(p_item)
        db.flush()
        created_items.append(p_item)

    _log_event(
        db=db,
        entity_type="EMPAQUE",
        entity_id=sess.id,
        entity_numero=sess.numero,
        action="SESION_EMPAQUE_CREADA",
        description=f"Sesión de empaque {sess.numero} creada para cliente {_customer_full_name(customer)} con {len(created_items)} ítems",
        new_estado=sess.status,
        user_name=user_name
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "id": sess.id,
            "numero": sess.numero,
            "customer_id": sess.customer_id,
            "status": sess.status,
            "items_count": len(created_items),
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
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    sess = db.execute(select(SalePackingSession).where(SalePackingSession.id == sess_id).with_for_update()).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, f"Sesión de empaque {sess_id} no encontrada")

    if sess.status in ("DESPACHADO", "CANCELADO"):
        raise HTTPException(422, f"No se pueden modificar ítems de una sesión en estado '{sess.status}'")

    item = db.execute(
        select(SalePackingItem).where(SalePackingItem.id == item_id, SalePackingItem.packing_id == sess_id).with_for_update()
    ).scalar_one_or_none()
    if not item:
        raise HTTPException(404, f"Ítem {item_id} no encontrado en sesión {sess_id}")

    if body.verified_quantity > item.quantity:
        raise HTTPException(
            status_code=422,
            detail=f"verified_quantity ({body.verified_quantity}) no puede superar quantity ({item.quantity})"
        )

    item.verified_quantity = body.verified_quantity
    item.status = body.status
    if body.notes:
        item.notes = body.notes

    # Verificar si todos los ítems de la sesión están completamente empacados
    all_items = db.query(SalePackingItem).filter(SalePackingItem.packing_id == sess_id).all()
    all_complete = all(it.verified_quantity == it.quantity and it.status == "EMPACADO" for it in all_items)
    if all_complete:
        sess.status = "LISTO_DESPACHO"
        sess.completed_at = now
        for it in all_items:
            l = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == it.sale_order_line_id).first()
            if l and l.estado == "RESERVADA":
                l.estado = "LISTA_PARA_ENTREGA"
                l.updated_at = now

    _log_event(
        db=db,
        entity_type="EMPAQUE",
        entity_id=sess.id,
        entity_numero=sess.numero,
        action="ITEM_VERIFICADO",
        description=f"Ítem {item.id} verificado con {item.verified_quantity}/{item.quantity} unidades. Estado sesión: {sess.status}",
        user_name=user_name
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "item_id": item.id,
            "verified_quantity": float(item.verified_quantity),
            "item_status": item.status,
            "session_status": sess.status,
        }
    }


@router.post("/empaque/sesiones/{sess_id}/cancelar")
def cancel_packing_session(
    sess_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    sess = db.execute(select(SalePackingSession).where(SalePackingSession.id == sess_id).with_for_update()).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, f"Sesión de empaque {sess_id} no encontrada")

    if sess.status == "DESPACHADO":
        raise HTTPException(422, "No se puede cancelar una sesión de empaque ya DESPACHADA")

    sess.status = "CANCELADO"
    items = db.query(SalePackingItem).filter(SalePackingItem.packing_id == sess_id).all()
    for it in items:
        it.status = "INCIDENCIA"
        l = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == it.sale_order_line_id).first()
        if l and l.estado == "LISTA_PARA_ENTREGA":
            l.estado = "RESERVADA"

    db.commit()
    return {"status": "success", "message": f"Sesión de empaque {sess.numero} cancelada"}


@router.post("/empaque/sesiones/{sess_id}/reabrir")
def reopen_packing_session(
    sess_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    sess = db.execute(select(SalePackingSession).where(SalePackingSession.id == sess_id).with_for_update()).scalar_one_or_none()
    if not sess:
        raise HTTPException(404, f"Sesión de empaque {sess_id} no encontrada")
    if sess.status != "LISTO_DESPACHO":
        raise HTTPException(422, f"Solo se pueden reabrir sesiones en estado 'LISTO_DESPACHO', estado actual '{sess.status}'")

    sess.status = "EN_PROCESO"
    db.commit()
    return {"status": "success", "message": f"Sesión {sess.numero} reabierta a EN_PROCESO"}


# ─────────────────────────────────────────────────────────────────────────────
# 6. ENTREGAS, DESPACHO Y POLÍTICAS OPERATIVAS
# ─────────────────────────────────────────────────────────────────────────────

def validate_dispatch_operational_policy(
    delivery_method: str,
    scheduled_date: Optional[datetime.datetime],
    created_at_bogota: datetime.datetime,
    authorized_by: Optional[str],
    exception_reason: Optional[str]
) -> Optional[str]:
    if not scheduled_date:
        return None

    if authorized_by and (not exception_reason or len(exception_reason.strip()) == 0):
        exception_reason = f"Autorizado por {authorized_by}"

    if scheduled_date.tzinfo is None:
        sch_bogota = scheduled_date.replace(tzinfo=BOGOTA_TZ)
    else:
        sch_bogota = scheduled_date.astimezone(BOGOTA_TZ)

    # Regla 1: Despacho nacional solo lunes (0), miércoles (2) y viernes (4)
    if delivery_method == "ENVIO_NACIONAL":
        day_w = sch_bogota.weekday()
        if day_w not in (0, 2, 4):
            if not authorized_by or not exception_reason or len(exception_reason.strip()) < 5:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Despachos nacionales solo están permitidos Lunes, Miércoles y Viernes. Programado para día {day_w}. Requiere policy_authorized_by y policy_exception_reason (mínimo 5 caracteres)."
                )
            return "EXCEPCION_DIA_NACIONAL"

    # Regla 2: Entrega de fin de semana (sábado=5, domingo=6)
    if sch_bogota.weekday() in (5, 6):
        days_ahead = sch_bogota.weekday() - 4  # sábado -> 1, domingo -> 2
        prev_friday_date = (sch_bogota - datetime.timedelta(days=days_ahead)).date()
        cutoff = datetime.datetime.combine(prev_friday_date, datetime.time(17, 30, 0), tzinfo=BOGOTA_TZ)

        if created_at_bogota > cutoff:
            if not authorized_by or not exception_reason or len(exception_reason.strip()) < 5:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail="Entregas de fin de semana deben programarse máximo el viernes a las 17:30:00 (hora Bogotá). Requiere policy_authorized_by y policy_exception_reason (mínimo 5 caracteres)."
                )
            return "EXCEPCION_FIN_DE_SEMANA"

    return None


@router.post("/entregas", status_code=status.HTTP_201_CREATED)
def create_delivery(
    body: DeliveryCreate,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    now = _now()
    now_bogota = _now_bogota()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))

    customer = db.query(Customer).filter(Customer.id == body.customer_id).first()
    if not customer:
        raise HTTPException(404, f"Cliente {body.customer_id} no encontrado")

    warehouse = db.query(Warehouse).filter(Warehouse.id == body.warehouse_id).first()
    if not warehouse:
        raise HTTPException(404, f"Bodega {body.warehouse_id} no encontrada")

    # Validar packing si se proporciona
    ps = None
    if body.packing_id:
        ps = db.query(SalePackingSession).filter(SalePackingSession.id == body.packing_id).with_for_update().first()
        if not ps:
            raise HTTPException(404, f"Sesión de empaque {body.packing_id} no encontrada")
        if ps.status != "LISTO_DESPACHO":
            raise HTTPException(422, f"La sesión de empaque {ps.numero} está en estado '{ps.status}', no en 'LISTO_DESPACHO'")
        if ps.customer_id != body.customer_id:
            raise HTTPException(422, f"La sesión de empaque pertenece al cliente {ps.customer_id}, no a {body.customer_id}")
        if ps.warehouse_id != body.warehouse_id:
            raise HTTPException(422, f"La bodega de la sesión de empaque {ps.warehouse_id} no coincide con {body.warehouse_id}")

    # Validar política operativa
    policy_warn = validate_dispatch_operational_policy(
        delivery_method=body.delivery_method,
        scheduled_date=body.scheduled_date,
        created_at_bogota=now_bogota,
        authorized_by=body.policy_authorized_by,
        exception_reason=body.policy_exception_reason
    )

    ent_num = _gen_numero(db, "ENT-", "seq_ent")
    delivery = SaleOrderDelivery(
        numero=ent_num,
        customer_id=body.customer_id,
        delivery_method=body.delivery_method,
        address_snapshot=body.address_snapshot or customer.address,
        city=body.city or getattr(customer, "city", None),
        phone=body.phone or customer.phone,
        carrier=body.carrier,
        tracking_number=body.tracking_number,
        shipping_cost=body.shipping_cost or Decimal("0.00"),
        shipping_paid_by=body.shipping_paid_by or "CLIENTE",
        scheduled_date=body.scheduled_date,
        status="PREPARANDO",
        warehouse_id=body.warehouse_id,
        packing_id=body.packing_id,
        policy_warning=policy_warn,
        policy_authorized_by=body.policy_authorized_by,
        observations=body.observations,
        created_by=user_name,
        created_at=now,
        updated_at=now,
    )
    db.add(delivery)
    db.flush()

    for dl in body.lines:
        so = db.query(SaleOrder).filter(SaleOrder.id == dl.sale_order_id).first()
        if not so:
            raise HTTPException(404, f"Pedido de venta {dl.sale_order_id} no encontrado")
        if so.customer_id != body.customer_id:
            raise HTTPException(422, f"El pedido {so.id} pertenece al cliente {so.customer_id}, no al cliente {body.customer_id} de la entrega")

        # Bloqueo pesimista para evitar sobrecompromiso concurrente
        line = db.query(SaleOrderLineErp).filter(
            SaleOrderLineErp.id == dl.sale_order_line_id,
            SaleOrderLineErp.so_id == dl.sale_order_id
        ).with_for_update().first()
        if not line:
            raise HTTPException(404, f"Línea {dl.sale_order_line_id} no encontrada en pedido {dl.sale_order_id}")

        if line.sku_id != dl.sku_id:
            raise HTTPException(422, f"SKU {dl.sku_id} no coincide con el SKU de la línea {line.sku_id}")

        # Control canónico de acumulación sin doble descuento:
        # cantidad acumulada no cancelada de entregas abiertas o ejecutadas <= line.quantity - line.quantity_cancelled
        line_net_qty = Decimal(str(line.quantity)) - Decimal(str(line.quantity_cancelled or 0))
        already_committed = db.query(
            func.coalesce(func.sum(SaleOrderDeliveryLine.quantity), Decimal("0.00"))
        ).join(SaleOrderDelivery).filter(
            SaleOrderDeliveryLine.sale_order_line_id == line.id,
            SaleOrderDelivery.status.in_(["BORRADOR", "PREPARANDO", "DESPACHADO", "EN_TRANSITO", "ENTREGADO"])
        ).scalar() or Decimal("0.00")

        available_to_deliver = max(Decimal("0.00"), line_net_qty - Decimal(str(already_committed)))
        if Decimal(str(dl.quantity)) > available_to_deliver:
            raise HTTPException(
                status_code=422,
                detail=f"Cantidad a entregar ({dl.quantity}) supera lo vendible pendiente disponible ({available_to_deliver}) para la línea {line.id}"
            )

        # Si proviene de una sesión de empaque, validar que esté empacado y no reutilizado
        if body.packing_id and ps:
            pack_item = next((pi for pi in ps.items if pi.sale_order_line_id == dl.sale_order_line_id), None)
            if not pack_item:
                raise HTTPException(422, f"Línea {dl.sale_order_line_id} no existe en la sesión de empaque {ps.numero}")
            
            already_from_pack = db.query(
                func.coalesce(func.sum(SaleOrderDeliveryLine.quantity), Decimal("0.00"))
            ).join(SaleOrderDelivery).filter(
                SaleOrderDelivery.packing_id == ps.id,
                SaleOrderDelivery.status.in_(["BORRADOR", "PREPARANDO", "DESPACHADO", "EN_TRANSITO", "ENTREGADO"]),
                SaleOrderDeliveryLine.sale_order_line_id == dl.sale_order_line_id
            ).scalar() or Decimal("0.00")

            avail_pack_qty = max(Decimal("0.00"), Decimal(str(pack_item.verified_quantity)) - Decimal(str(already_from_pack)))
            if Decimal(str(dl.quantity)) > avail_pack_qty:
                raise HTTPException(
                    status_code=422,
                    detail=f"Cantidad a entregar ({dl.quantity}) supera las unidades empacadas disponibles ({avail_pack_qty}) en sesión {ps.numero} para línea {line.id}"
                )

        d_line = SaleOrderDeliveryLine(
            delivery_id=delivery.id,
            sale_order_id=dl.sale_order_id,
            sale_order_line_id=dl.sale_order_line_id,
            sku_id=dl.sku_id,
            quantity=dl.quantity,
            owner=line.owner,
            created_at=now,
        )
        db.add(d_line)

    _log_event(
        db=db,
        entity_type="ENTREGA",
        entity_id=delivery.id,
        entity_numero=delivery.numero,
        action="ENTREGA_CREADA",
        description=f"Entrega {delivery.numero} creada en estado BORRADOR para cliente {_customer_full_name(customer)}",
        new_estado="BORRADOR",
        user_name=user_name
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "id": delivery.id,
            "numero": delivery.numero,
            "status": delivery.status,
            "delivery_method": delivery.delivery_method,
            "lines_count": len(body.lines),
        }
    }


@router.post("/entregas/{delivery_id}/despachar")
def dispatch_delivery(
    delivery_id: int,
    body: DispatchDeliveryRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))
    client_key = body.idempotency_key.strip()

    delivery = db.execute(select(SaleOrderDelivery).where(SaleOrderDelivery.id == delivery_id).with_for_update()).scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, f"Entrega {delivery_id} no encontrada")

    # Idempotencia de despacho
    if delivery.status in ("DESPACHADO", "EN_TRANSITO", "ENTREGADO"):
        if delivery.idempotency_key == client_key:
            return {
                "status": "success",
                "message": "Replay idempotente de despacho ya confirmado",
                "idempotent_replay": True,
                "data": {"delivery_id": delivery.id, "status": delivery.status}
            }
        else:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="La entrega ya fue despachada previamente con otra clave de idempotencia"
            )

    _validate_transition(delivery.status, "DESPACHADO", ALLOWED_TRANSITIONS_DELIVERY, "Entrega")

    d_lines = db.query(SaleOrderDeliveryLine).filter(SaleOrderDeliveryLine.delivery_id == delivery.id).all()
    if not d_lines:
        raise HTTPException(422, "La entrega no contiene líneas")

    # Validar políticas financieras por cada pedido involucrado
    order_ids = list({dl.sale_order_id for dl in d_lines})
    for so_id in order_ids:
        so = db.query(SaleOrder).filter(SaleOrder.id == so_id).with_for_update().first()
        if so and so.saldo_cop > Decimal("0.00"):
            has_exception = bool(
                delivery.policy_authorized_by or
                (so.policy_exception_authorized_by and len(str(so.policy_exception_reason or "").strip()) >= 5)
            )
            if not has_exception:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=f"Despacho rechazado: Pedido {so.numero} tiene saldo pendiente de ${so.saldo_cop:,.0f} COP sin excepción autorizada"
                )

    # Crear operación de inventario de entrega
    inv_op = InventoryOperation(
        operation_type="DELIVERY",
        source_warehouse_id=delivery.warehouse_id,
        dest_warehouse_id=None,
        status="DONE",
        source_document_type="ENTREGA",
        source_document_id=delivery.id,
        source_document_numero=delivery.numero,
        tracking_number=delivery.tracking_number,
    )
    db.add(inv_op)
    db.flush()

    # Consumir exactamente reservas con SPLIT y descontar inventario
    for dl in d_lines:
        line = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.id == dl.sale_order_line_id).with_for_update().first()
        if not line:
            continue

        needed = dl.quantity
        active_reservations = db.query(InventoryReservation).filter(
            InventoryReservation.sale_order_line_id == dl.sale_order_line_id,
            InventoryReservation.warehouse_id == delivery.warehouse_id,
            InventoryReservation.status == "ACTIVE"
        ).order_by(InventoryReservation.id.asc()).with_for_update().all()

        total_rsv = sum(r.quantity_reserved for r in active_reservations)
        if total_rsv < needed:
            raise HTTPException(409, f"Reservas insuficientes para despachar línea {line.id}: requiere {needed}, reservado {total_rsv}")

        rem_needed = needed
        for rsv in active_reservations:
            if rem_needed <= Decimal("0.00"):
                break
            if rsv.quantity_reserved <= rem_needed:
                rsv.status = "CONVERTED"
                rsv.converted_at = now
                rem_needed -= rsv.quantity_reserved
            else:
                # SPLIT: Conservar reserva original con remanente ACTIVE y crear registro CONVERTED
                split_converted = InventoryReservation(
                    sku_id=rsv.sku_id,
                    warehouse_id=rsv.warehouse_id,
                    owner=rsv.owner,
                    quantity_reserved=rem_needed,
                    sale_order_line_id=rsv.sale_order_line_id,
                    status="CONVERTED",
                    created_at=now,
                    converted_at=now,
                    created_by=user_name,
                    notes=f"Split convertido de reserva {rsv.id} por despacho {delivery.numero}"
                )
                db.add(split_converted)
                rsv.quantity_reserved -= rem_needed
                rem_needed = Decimal("0.00")

        # Descontar stock físico y balance
        lvl = db.query(InventoryLevel).filter(
            InventoryLevel.sku_id == dl.sku_id,
            InventoryLevel.warehouse_id == delivery.warehouse_id
        ).with_for_update().first()
        if not lvl or lvl.quantity < dl.quantity:
            raise HTTPException(409, f"Stock físico insuficiente en bodega para despachar SKU {dl.sku_id}")
        lvl.quantity -= dl.quantity

        ob = db.query(InventoryOwnerBalance).filter(
            InventoryOwnerBalance.sku_id == dl.sku_id,
            InventoryOwnerBalance.warehouse_id == delivery.warehouse_id,
            InventoryOwnerBalance.owner == dl.owner
        ).with_for_update().first()
        if not ob or ob.quantity < dl.quantity:
            raise HTTPException(409, f"Balance del propietario {dl.owner} insuficiente para despachar SKU {dl.sku_id}")
        ob.quantity -= dl.quantity

        # Exactamente 1 movimiento Kárdex OUT
        mv_key = f"mov-deliv-{delivery.id}-{dl.id}-{client_key}"
        mov = InventoryMovement(
            operation_id=inv_op.id,
            sku_id=dl.sku_id,
            warehouse_id=delivery.warehouse_id,
            direction="OUT",
            quantity=dl.quantity,
            owner=dl.owner,
            idempotency_key=mv_key,
            created_at=now,
            created_by=user_name,
        )
        db.add(mov)

        line.quantity_delivered += dl.quantity
        db.flush()
        # Reconciliar estrictamente line.quantity_reserved con las reservas ACTIVE restantes
        line.quantity_reserved = db.query(
            func.coalesce(func.sum(InventoryReservation.quantity_reserved), Decimal("0.00"))
        ).filter(
            InventoryReservation.sale_order_line_id == line.id,
            InventoryReservation.status == "ACTIVE"
        ).scalar() or Decimal("0.00")

        if line.quantity_delivered >= (line.quantity - line.quantity_cancelled):
            line.estado = "ENTREGADA"
        line.updated_at = now

    delivery.status = "DESPACHADO"
    delivery.dispatch_date = body.dispatch_date or now
    delivery.carrier = body.carrier or delivery.carrier
    delivery.tracking_number = body.tracking_number or delivery.tracking_number
    delivery.evidence_url = body.evidence_url or delivery.evidence_url
    delivery.idempotency_key = client_key
    delivery.updated_at = now
    db.flush()

    if delivery.packing_id:
        ps = db.query(SalePackingSession).filter(SalePackingSession.id == delivery.packing_id).with_for_update().first()
        if ps:
            all_consumed = True
            for it in ps.items:
                consumed = db.query(
                    func.coalesce(func.sum(SaleOrderDeliveryLine.quantity), Decimal("0.00"))
                ).join(SaleOrderDelivery).filter(
                    SaleOrderDelivery.packing_id == ps.id,
                    SaleOrderDelivery.status.in_(["DESPACHADO", "EN_TRANSITO", "ENTREGADO"]),
                    SaleOrderDeliveryLine.sale_order_line_id == it.sale_order_line_id
                ).scalar() or Decimal("0.00")
                if Decimal(str(consumed)) < Decimal(str(it.verified_quantity)):
                    all_consumed = False
                    break
            if all_consumed:
                ps.status = "DESPACHADO"
            else:
                ps.status = "LISTO_DESPACHO"

    for so_id in order_ids:
        so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
        if so:
            so.estado = recalculate_sale_order_state(so, db)
            so.updated_at = now

    _log_event(
        db=db,
        entity_type="ENTREGA",
        entity_id=delivery.id,
        entity_numero=delivery.numero,
        action="ENTREGA_DESPACHADA",
        description=f"Entrega {delivery.numero} despachada físicamente con Kárdex OUT e idempotency_key {client_key}",
        old_estado="BORRADOR",
        new_estado="DESPACHADO",
        user_name=user_name
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "delivery_id": delivery.id,
            "status": delivery.status,
            "dispatch_date": str(delivery.dispatch_date),
            "idempotency_key": delivery.idempotency_key,
        }
    }


@router.post("/entregas/{delivery_id}/en-transito")
def set_delivery_in_transit(
    delivery_id: int,
    body: DeliveryStatusUpdateRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db)
):
    delivery = db.execute(select(SaleOrderDelivery).where(SaleOrderDelivery.id == delivery_id).with_for_update()).scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, f"Entrega {delivery_id} no encontrada")

    _validate_transition(delivery.status, "EN_TRANSITO", ALLOWED_TRANSITIONS_DELIVERY, "Entrega")
    delivery.status = "EN_TRANSITO"
    if body.carrier:
        delivery.carrier = body.carrier
    if body.tracking_number:
        delivery.tracking_number = body.tracking_number
    if body.evidence_url:
        delivery.evidence_url = body.evidence_url
    delivery.updated_at = _now()
    db.commit()

    return {"status": "success", "data": {"id": delivery.id, "status": delivery.status}}


@router.post("/entregas/{delivery_id}/confirmar-entrega")
def confirm_delivery_received(
    delivery_id: int,
    body: DeliveryStatusUpdateRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    now = _now()
    delivery = db.execute(select(SaleOrderDelivery).where(SaleOrderDelivery.id == delivery_id).with_for_update()).scalar_one_or_none()
    if not delivery:
        raise HTTPException(404, f"Entrega {delivery_id} no encontrada")

    _validate_transition(delivery.status, "ENTREGADO", ALLOWED_TRANSITIONS_DELIVERY, "Entrega")
    delivery.status = "ENTREGADO"
    delivery.delivery_date = body.delivery_date or now
    if body.evidence_url:
        delivery.evidence_url = body.evidence_url
    delivery.updated_at = now

    d_lines = db.query(SaleOrderDeliveryLine).filter(SaleOrderDeliveryLine.delivery_id == delivery.id).all()
    order_ids = list({dl.sale_order_id for dl in d_lines})
    for so_id in order_ids:
        so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
        if so:
            so.estado = recalculate_sale_order_state(so, db)
            so.updated_at = now

    db.commit()

    return {"status": "success", "data": {"id": delivery.id, "status": delivery.status, "delivery_date": str(delivery.delivery_date)}}


# ─────────────────────────────────────────────────────────────────────────────
# 7. DEVOLUCIONES DE CLIENTES Y GARANTÍAS
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/pedidos/{so_id}/devoluciones", status_code=status.HTTP_201_CREATED)
def create_sale_order_return(
    so_id: int,
    body: SaleOrderReturnCreate,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_FINANZAS)),
    db: Session = Depends(get_db)
):
    now = _now()
    user_name = getattr(user, "email", str(getattr(user, "id", "system")))
    client_key = body.idempotency_key.strip()

    if body.sale_order_id != so_id:
        raise HTTPException(422, f"sale_order_id en el payload ({body.sale_order_id}) no coincide con la URL ({so_id})")

    # Idempotencia determinista con fingerprint canónico del payload completo
    existing_ret = db.execute(
        select(SaleOrderReturn).where(SaleOrderReturn.idempotency_key == client_key)
    ).scalar_one_or_none()
    if existing_ret:
        incoming_fp = _compute_return_fingerprint(
            so_id=so_id,
            customer_id=body.customer_id,
            delivery_id=body.delivery_id,
            financial_resolution=body.financial_resolution,
            refund_amount=body.refund_amount or Decimal("0.00"),
            lines=body.lines
        )
        existing_lines = db.query(SaleOrderReturnLine).filter(SaleOrderReturnLine.return_id == existing_ret.id).all()
        existing_fp = _compute_return_fingerprint(
            so_id=existing_ret.sale_order_id,
            customer_id=existing_ret.customer_id,
            delivery_id=existing_ret.delivery_id,
            financial_resolution=existing_ret.financial_resolution,
            refund_amount=existing_ret.refund_amount,
            lines=existing_lines
        )
        if incoming_fp != existing_fp:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="idempotency_key ya utilizada para otra devolución con parámetros divergentes"
            )
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "message": "Replay idempotente de devolución",
            "idempotent_replay": True,
            "data": {
                "id": existing_ret.id,
                "numero": existing_ret.numero,
                "status": existing_ret.status,
            }
        }

    so = db.execute(select(SaleOrder).where(SaleOrder.id == so_id).with_for_update()).scalar_one_or_none()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    if so.customer_id != body.customer_id:
        raise HTTPException(422, f"El pedido pertenece al cliente {so.customer_id}, no a {body.customer_id}")

    deliv = None
    if body.delivery_id:
        deliv = db.execute(
            select(SaleOrderDelivery).where(SaleOrderDelivery.id == body.delivery_id).with_for_update()
        ).scalar_one_or_none()
        if not deliv:
            raise HTTPException(404, f"Entrega {body.delivery_id} no encontrada")

        if deliv.customer_id != so.customer_id:
            raise HTTPException(
                status_code=422,
                detail=f"La entrega {deliv.id} pertenece al cliente {deliv.customer_id}, no al cliente {so.customer_id}"
            )

        if deliv.status in ("BORRADOR", "PREPARANDO", "CANCELADO"):
            raise HTTPException(
                status_code=422,
                detail=f"La entrega {deliv.id} se encuentra en estado '{deliv.status}' y no puede ser utilizada como origen de devolución. Solo entregas despachadas o entregadas son válidas."
            )

        deliv_has_so = db.query(SaleOrderDeliveryLine).filter(
            SaleOrderDeliveryLine.delivery_id == deliv.id,
            SaleOrderDeliveryLine.sale_order_id == so.id
        ).first()
        if not deliv_has_so:
            raise HTTPException(
                status_code=422,
                detail=f"La entrega {deliv.id} no contiene ítems asociados al pedido de venta {so.id}"
            )

    # Validar que refund_amount no supere lo pagado elegible
    total_cop = Decimal(str(so.total_cop or 0))
    saldo_cop = Decimal(str(so.saldo_cop or 0))
    total_pagado_elegible = max(Decimal("0.00"), total_cop - saldo_cop)
    refund_amt = Decimal(str(body.refund_amount or 0))
    if refund_amt > total_pagado_elegible:
        raise HTTPException(
            status_code=422,
            detail=f"refund_amount (${refund_amt:,.0f}) no puede superar el valor total pagado por el cliente (${total_pagado_elegible:,.0f})"
        )

    ret_numero = _gen_numero(db, "DEV-", "seq_dev")
    ret = SaleOrderReturn(
        numero=ret_numero,
        sale_order_id=so.id,
        delivery_id=body.delivery_id,
        customer_id=body.customer_id,
        financial_resolution=body.financial_resolution,
        refund_amount=refund_amt,
        status="PROCESADA",
        reason=body.reason,
        evidence_url=body.evidence_url,
        authorized_by=body.authorized_by or user_name,
        idempotency_key=client_key,
        created_by=user_name,
        created_at=now,
    )
    db.add(ret)
    db.flush()

    first_wh = body.lines[0].warehouse_id if body.lines else None
    inv_op = InventoryOperation(
        operation_type="RECEIPT",
        source_warehouse_id=first_wh,
        dest_warehouse_id=first_wh,
        status="DONE",
        source_document_type="DEVOLUCION",
        source_document_id=ret.id,
        source_document_numero=ret.numero,
    )
    db.add(inv_op)
    db.flush()

    for rl in body.lines:
        line = db.execute(
            select(SaleOrderLineErp).where(
                SaleOrderLineErp.id == rl.sale_order_line_id,
                SaleOrderLineErp.so_id == so.id
            ).with_for_update()
        ).scalar_one_or_none()
        if not line:
            raise HTTPException(404, f"Línea {rl.sale_order_line_id} no encontrada en pedido {so.id}")

        # SKU y Owner derivados obligatoriamente de la línea original
        derived_sku_id = line.sku_id
        derived_owner = line.owner

        # Si se informó delivery_id, validar pertenencia a la entrega y límites despachados
        if deliv:
            deliv_line = db.query(SaleOrderDeliveryLine).filter(
                SaleOrderDeliveryLine.delivery_id == deliv.id,
                SaleOrderDeliveryLine.sale_order_line_id == line.id
            ).first()
            if not deliv_line:
                raise HTTPException(
                    status_code=422,
                    detail=f"La línea {line.id} no fue despachada en la entrega {deliv.id}"
                )

            deliv_line_qty = db.query(
                func.coalesce(func.sum(SaleOrderDeliveryLine.quantity), Decimal("0.00"))
            ).filter(
                SaleOrderDeliveryLine.delivery_id == deliv.id,
                SaleOrderDeliveryLine.sale_order_line_id == line.id
            ).scalar() or Decimal("0.00")

            deliv_returned_qty = db.query(
                func.coalesce(func.sum(SaleOrderReturnLine.quantity), Decimal("0.00"))
            ).join(SaleOrderReturn, SaleOrderReturnLine.return_id == SaleOrderReturn.id).filter(
                SaleOrderReturn.delivery_id == deliv.id,
                SaleOrderReturnLine.sale_order_line_id == line.id,
                SaleOrderReturn.status != "CANCELADA"
            ).scalar() or Decimal("0.00")

            if deliv_returned_qty + rl.quantity > deliv_line_qty:
                raise HTTPException(
                    status_code=422,
                    detail=f"Cantidad devuelta acumulada para la entrega {deliv.id} ({deliv_returned_qty + rl.quantity}) supera la cantidad despachada en esa entrega ({deliv_line_qty}) para la línea {line.id}"
                )

        # Validar acumulación histórica global de devoluciones para la línea
        past_returned_global = db.query(
            func.coalesce(func.sum(SaleOrderReturnLine.quantity), Decimal("0.00"))
        ).join(SaleOrderReturn, SaleOrderReturnLine.return_id == SaleOrderReturn.id).filter(
            SaleOrderReturnLine.sale_order_line_id == line.id,
            SaleOrderReturn.status != "CANCELADA"
        ).scalar() or Decimal("0.00")

        if past_returned_global + rl.quantity > line.quantity_delivered:
            raise HTTPException(
                status_code=422,
                detail=f"Cantidad devuelta acumulada global ({past_returned_global + rl.quantity}) no puede superar la cantidad entregada ({line.quantity_delivered}) para la línea {line.id}"
            )

        ret_line = SaleOrderReturnLine(
            return_id=ret.id,
            sale_order_line_id=line.id,
            sku_id=derived_sku_id,
            warehouse_id=rl.warehouse_id,
            quantity=rl.quantity,
            product_condition=rl.product_condition,
            inventory_resolution=rl.inventory_resolution,
            owner=derived_owner,
            created_at=now,
        )
        db.add(ret_line)

        # Efecto en inventario según resolución
        if rl.inventory_resolution == "REINTEGRAR_STOCK":
            lvl = db.query(InventoryLevel).filter(
                InventoryLevel.sku_id == derived_sku_id,
                InventoryLevel.warehouse_id == rl.warehouse_id
            ).with_for_update().first()
            if not lvl:
                lvl = InventoryLevel(sku_id=derived_sku_id, warehouse_id=rl.warehouse_id, quantity=Decimal("0.00"))
                db.add(lvl)
            lvl.quantity += rl.quantity

            ob = db.query(InventoryOwnerBalance).filter(
                InventoryOwnerBalance.sku_id == derived_sku_id,
                InventoryOwnerBalance.warehouse_id == rl.warehouse_id,
                InventoryOwnerBalance.owner == derived_owner
            ).with_for_update().first()
            if not ob:
                ob = InventoryOwnerBalance(sku_id=derived_sku_id, warehouse_id=rl.warehouse_id, owner=derived_owner, quantity=Decimal("0.00"), updated_at=now)
                db.add(ob)
            ob.quantity += rl.quantity

            mov = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                direction="RETURN_IN",
                quantity=rl.quantity,
                owner=derived_owner,
                idempotency_key=f"mov-ret-in-{ret.id}-{rl.sale_order_line_id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add(mov)

        elif rl.inventory_resolution == "CUARENTENA":
            quar = InventoryQuarantine(
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                quantity=rl.quantity,
                status="ACTIVO",
                reason="DEVOLUCION_CLIENTE",
                notes=f"Devolución cliente {ret.numero}: {rl.product_condition}",
                owner=derived_owner,
                created_at=now,
            )
            db.add(quar)

            mov = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                direction="IN",
                quantity=rl.quantity,
                owner=derived_owner,
                idempotency_key=f"mov-ret-quar-{ret.id}-{rl.sale_order_line_id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add(mov)

        elif rl.inventory_resolution == "DESTRUIDO":
            mov = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                direction="SCRAP",
                quantity=rl.quantity,
                owner=derived_owner,
                idempotency_key=f"mov-ret-scrap-{ret.id}-{rl.sale_order_line_id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add(mov)

        elif rl.inventory_resolution == "DEVOLVER_PROVEEDOR":
            # 1. Reflejar recepción física de la devolución desde el cliente
            mov_in = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                direction="RETURN_IN",
                quantity=rl.quantity,
                owner=derived_owner,
                idempotency_key=f"mov-ret-prov-in-{ret.id}-{rl.sale_order_line_id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            # 2. Reflejar salida física hacia el proveedor
            mov_out = InventoryMovement(
                operation_id=inv_op.id,
                sku_id=derived_sku_id,
                warehouse_id=rl.warehouse_id,
                direction="OUT",
                quantity=rl.quantity,
                owner=derived_owner,
                idempotency_key=f"mov-ret-out-{ret.id}-{rl.sale_order_line_id}-{uuid.uuid4().hex[:8]}",
                created_at=now,
                created_by=user_name,
            )
            db.add_all([mov_in, mov_out])

        # Actualizar estado de la línea según acumulado histórico
        total_ret = past_returned_global + rl.quantity
        if total_ret >= line.quantity_delivered and line.quantity_delivered > Decimal("0.00"):
            line.estado = "DEVUELTA_TOTAL"
        else:
            line.estado = "DEVUELTA_PARCIAL"
        line.updated_at = now

    # Efecto financiero en ledger
    if body.financial_resolution in ("DEVOLUCION_DINERO", "SALDO_A_FAVOR") and refund_amt > Decimal("0.00"):
        pay_ret = SaleOrderPayment(
            sale_order_id=so.id,
            customer_id=so.customer_id,
            tipo="DEVOLUCION",
            monto=refund_amt,
            moneda="COP",
            fecha=now.date(),
            usuario=user_name,
            idempotency_key=f"pay-{client_key}",
            estado="CONFIRMADO",
            notes=f"Resolución {body.financial_resolution} devolución {ret.numero}",
            created_at=now,
        )
        db.add(pay_ret)
        db.flush()

        pagos_pos = db.query(
            func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
        ).filter(
            SaleOrderPayment.sale_order_id == so.id,
            SaleOrderPayment.estado == "CONFIRMADO",
            SaleOrderPayment.tipo.in_(["ANTICIPO", "ABONO", "PAGO_TOTAL", "PAGO_SALDO"])
        ).scalar() or Decimal("0.00")
        devs = db.query(
            func.coalesce(func.sum(SaleOrderPayment.monto), Decimal("0.00"))
        ).filter(
            SaleOrderPayment.sale_order_id == so.id,
            SaleOrderPayment.estado == "CONFIRMADO",
            SaleOrderPayment.tipo == "DEVOLUCION"
        ).scalar() or Decimal("0.00")
        net = max(Decimal("0.00"), Decimal(str(pagos_pos)) - Decimal(str(devs)))
        so.saldo_cop = max(Decimal("0.00"), Decimal(str(so.total_cop or 0)) - net)

    all_lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).all()
    if all(l.estado == "DEVUELTA_TOTAL" for l in all_lines if l.estado != "CANCELADA"):
        so.estado = "DEVUELTO_TOTAL"
    so.updated_at = now

    _log_event(
        db=db,
        entity_type="DEVOLUCION",
        entity_id=ret.id,
        entity_numero=ret.numero,
        action="DEVOLUCION_PROCESADA",
        description=f"Devolución {ret.numero} procesada con resolución {body.financial_resolution}. Reembolso: ${refund_amt:,.0f} COP",
        user_name=user_name
    )

    db.commit()

    return {
        "status": "success",
        "data": {
            "id": ret.id,
            "numero": ret.numero,
            "financial_resolution": ret.financial_resolution,
            "refund_amount": float(ret.refund_amount),
            "status": ret.status,
            "sale_order_estado": so.estado,
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 8. COSTO Y RENTABILIDAD
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/pedidos/{so_id}/rentabilidad")
def get_sale_order_profitability(
    so_id: int,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_FINANZAS, *ROLE_ASESOR)),
    db: Session = Depends(get_db)
):
    so = db.query(SaleOrder).filter(SaleOrder.id == so_id).first()
    if not so:
        raise HTTPException(404, f"Pedido {so_id} no encontrado")

    lines = db.query(SaleOrderLineErp).filter(SaleOrderLineErp.so_id == so.id).all()

    gross_sales = Decimal("0.00")
    total_disc = Decimal("0.00")
    net_sales = Decimal("0.00")
    total_cost_est = Decimal("0.00")

    nebulae_net = Decimal("0.00")
    mau_net = Decimal("0.00")
    nebulae_cost = Decimal("0.00")
    mau_cost = Decimal("0.00")

    lines_breakdown = []
    for l in lines:
        if l.estado == "CANCELADA":
            continue

        effective_qty = l.quantity - l.quantity_cancelled
        base = (effective_qty * l.unit_price_cop).quantize(Decimal("0.01"))
        disc = (base * (l.descuento_pct / Decimal("100.00"))).quantize(Decimal("0.01"))
        net = base - disc

        c_est = (effective_qty * (l.cost_unit_cop_snapshot or Decimal("0.00"))).quantize(Decimal("0.01"))
        gross_sales += base
        total_disc += disc
        net_sales += net
        total_cost_est += c_est

        if l.owner == "MAU":
            mau_net += net
            mau_cost += c_est
        else:
            nebulae_net += net
            nebulae_cost += c_est

        lines_breakdown.append({
            "line_id": l.id,
            "sku_id": l.sku_id,
            "quantity": float(l.quantity),
            "effective_quantity": float(effective_qty),
            "unit_price_cop": float(l.unit_price_cop),
            "cost_unit_cop_snapshot": float(l.cost_unit_cop_snapshot),
            "net_sales_cop": float(net),
            "cost_cop": float(c_est),
            "profit_cop": float(net - c_est),
            "owner": l.owner,
            "estado": l.estado,
        })

    deliveries = db.query(SaleOrderDelivery).join(SaleOrderDeliveryLine).filter(
        SaleOrderDeliveryLine.sale_order_id == so.id,
        SaleOrderDelivery.status.in_(["DESPACHADO", "EN_TRANSITO", "ENTREGADO"])
    ).all()
    empresa_shipping_cost = sum(
        d.shipping_cost for d in deliveries if d.shipping_paid_by == "EMPRESA"
    ) or Decimal("0.00")

    est_profit = net_sales - total_cost_est - Decimal(str(empresa_shipping_cost))
    margin_pct = ((est_profit / net_sales) * Decimal("100.00")).quantize(Decimal("0.01")) if net_sales > Decimal("0.00") else Decimal("0.00")

    return {
        "status": "success",
        "data": {
            "sale_order_id": so.id,
            "numero": so.numero,
            "gross_sales_cop": float(gross_sales),
            "discount_cop": float(total_disc),
            "net_sales_cop": float(net_sales),
            "total_cost_cop": float(total_cost_est),
            "shipping_cost_empresa": float(empresa_shipping_cost),
            "estimated_profit_cop": float(est_profit),
            "real_profit_cop": float(so.real_profit_cop) if so.real_profit_cop is not None else None,
            "margin_pct": float(margin_pct),
            "profit_is_estimated": so.profit_is_estimated,
            "nebulae_result_cop": float(nebulae_net - nebulae_cost),
            "mau_result_cop": float(mau_net - mau_cost),
            "lines_breakdown": lines_breakdown,
        }
    }
