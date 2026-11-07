"""
erp_inventario.py — Módulo de Inventario Avanzado para Fase 3 (Prompt Maestro & Hardening).

Funcionalidades:
1. Kárdex Inmutable e Idempotente (/kardex)
2. Reservas de Inventario con Control Concurrente e Idempotencia (/reservas)
3. Cálculo de Disponibilidad Derivada (/disponibilidad, /stock-summary)
4. Gestión y Aislamiento de Cuarentena con Segregación Patrimonial (/cuarentena)
5. Separación Patrimonial Nebulae vs Mau con Aritmética Decimal Exacta
"""
import datetime
import hashlib
import json
import uuid
from typing import Optional, List, Tuple
from decimal import Decimal
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, status, Response
from sqlalchemy.orm import Session
from sqlalchemy import select, func, and_, or_, text

logger = logging.getLogger(__name__)

from app.db.database import get_db, SessionLocal
from app.models.users import User
from app.models.catalog import Category, Product, ProductSKU
from app.models.inventory import Warehouse, InventoryLevel, InventoryOperation, InventoryMovement
# B4 T13: las existencias, sus totales y el Análisis salen de core (R10, R13); los validadores genéricos de las listas son
# los de T6B (erp_ventas.py), como en erp_compras.py: se importan, no se copian (para la revisión final: deberían vivir en
# core/listados.py). erp_ventas no importa este módulo al cargarse, así que no hay ciclo.
from app.api.v1.erp_ventas import _parametro_de_lista, _sin_caracteres_de_control
from app.core import analisis_inventario as ai
from app.core.analisis import dinero, validar_top
from app.core.existencias import ESTADOS_STOCK, POR, consulta_existencias, disponibilidad_sku, resumen_existencias
from app.core.listados import (MAX_OFFSET, contar_por_vista, filtrar_por_estados, leer_lista, leer_orden, paginar,
                               respuesta as respuesta_de_lista, texto_busqueda)
from app.core.periodos import resolver_periodo
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, SaleOrderLineErp
from app.models.fase3 import InventoryQuarantine
from app.api.dependencies import (
    require_roles,
    ROLE_ADMIN,
    ROLE_BODEGA,
    ROLE_ASESOR,
    ROLE_COMPRAS,
    ALL_ERP_ROLES,
)
from app.api.v1.schemas_fase3 import (
    KardexMovementItem,
    CreateReservationRequest,
    OperateReservationRequest,
    ReservationResponse,
    SkuAvailabilityResponse,
    QuarantineItemResponse,
    ResolveQuarantineRequest,
)

router = APIRouter()


def _now():
    return datetime.datetime.now(datetime.timezone.utc)


# ─────────────────────────────────────────────────────────────────────────────
# IDEMPOTENCIA Y CONCURRENCIA HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _start_idempotent_operation(
    db: Session,
    op_type: str,
    client_key: str,
    payload_dict: dict,
    entity_type: str,
    user_id: Optional[int],
    now: datetime.datetime,
) -> Tuple[Optional[dict], str, str]:
    """
    Control de concurrencia e idempotencia estricta.
    1. Toma lock consultivo de transacción: pg_advisory_xact_lock(hashtext(f'{op_type}:{client_key}'))
       lo que serializa cualquier ejecución concurrente con la misma clave.
    2. Valida hash del payload contra ejecuciones previas (409 Conflict si difiere).
    3. Si ya completó (DONE), retorna el response guardado con idempotent_replay=True.
    4. Si es nueva o reintento de FAILED con mismo payload, registra status='PROCESSING' y retorna nuevo execution_token.
    """
    req_hash = hashlib.sha256(
        json.dumps(payload_dict, sort_keys=True, default=str).encode()
    ).hexdigest()

    # 1. Lock consultivo serializado por clave
    db.execute(
        text("SELECT pg_advisory_xact_lock(hashtext(:k))"),
        {"k": f"{op_type}:{client_key}"}
    )

    # 2. Consultar registro de idempotencia existente
    row = db.execute(
        text(
            "SELECT id, status, request_hash, response_body, execution_token "
            "FROM idempotency_requests "
            "WHERE operation_type = :ot AND operation_key = :k"
        ),
        {"ot": op_type, "k": client_key}
    ).fetchone()

    if row:
        if row.status == "DONE":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia ya fue usada con un payload diferente. "
                    f"Usa una clave nueva para este intento."
                )
            stored = row.response_body
            if isinstance(stored, str):
                stored = json.loads(stored)
            return (stored, row.execution_token, req_hash)
        elif row.status == "PROCESSING":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia ya fue usada con un payload diferente."
                )
            raise HTTPException(409, "Operación en proceso. Reintenta en unos segundos.")
        elif row.status == "FAILED":
            if row.request_hash != req_hash:
                raise HTTPException(
                    409,
                    f"La clave de idempotencia (FAILED) fue usada con payload diferente."
                )
            exec_token = str(uuid.uuid4())
            db.execute(
                text(
                    "UPDATE idempotency_requests "
                    "SET status = 'PROCESSING', execution_token = :token, "
                    "    request_hash = :h, request_body = CAST(:body AS jsonb), "
                    "    created_at = :now, response_body = NULL, error_detail = NULL "
                    "WHERE id = :id"
                ),
                {
                    "token": exec_token,
                    "h": req_hash,
                    "body": json.dumps(payload_dict, default=str),
                    "now": now,
                    "id": row.id
                }
            )
            return (None, exec_token, req_hash)

    # 3. No existía: registrar PROCESSING en la sesión de la transacción
    exec_token = str(uuid.uuid4())
    db.execute(
        text(
            "INSERT INTO idempotency_requests "
            "(operation_type, operation_key, request_hash, entity_type, "
            " user_id, status, execution_token, request_body, created_at) "
            "VALUES (:ot, :k, :h, :et, :uid, 'PROCESSING', :token, CAST(:body AS jsonb), :now)"
        ),
        {
            "ot": op_type, "k": client_key, "h": req_hash, "et": entity_type,
            "uid": user_id, "token": exec_token,
            "body": json.dumps(payload_dict, default=str), "now": now
        }
    )
    return (None, exec_token, req_hash)


def _finish_idempotent_operation(
    db: Session,
    op_type: str,
    client_key: str,
    exec_token: str,
    entity_id: Optional[int],
    response_data: dict,
    now: datetime.datetime,
):
    db.execute(
        text(
            "UPDATE idempotency_requests "
            "SET status = 'DONE', entity_id = :eid, "
            "    response_body = CAST(:resp AS jsonb), completed_at = :now "
            "WHERE operation_type = :ot AND operation_key = :k AND execution_token = :token"
        ),
        {
            "ot": op_type, "k": client_key, "token": exec_token,
            "eid": entity_id, "resp": json.dumps(response_data, default=str), "now": now
        }
    )


def _mark_failed_external(
    op_type: str,
    client_key: str,
    exec_token: str,
    error: str,
    now: datetime.datetime,
    request_hash: Optional[str] = None,
    request_body: Optional[dict] = None,
    entity_type: Optional[str] = None,
    user_id: Optional[int] = None,
):
    try:
        from app.db.database import SessionLocal as _SL
        with _SL() as s:
            body_json = json.dumps(request_body, default=str) if request_body is not None else None
            try:
                s.execute(
                    text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES (:ot, :k, :h, CAST(:body AS jsonb), :token, :et, :uid, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status = 'FAILED', "
                        "    error_detail = :err, "
                        "    completed_at = :now, "
                        "    request_hash = COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body = COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token = EXCLUDED.execution_token, "
                        "    entity_type = COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type), "
                        "    user_id = COALESCE(EXCLUDED.user_id, idempotency_requests.user_id) "
                        "WHERE idempotency_requests.operation_type = :ot AND idempotency_requests.operation_key = :k"
                    ),
                    {
                        "ot": op_type,
                        "k": client_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "uid": user_id,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                s.commit()
            except IntegrityError:
                s.rollback()
                # Fallback con user_id=None en caso de foreign key error en tabla users
                s.execute(
                    text(
                        "INSERT INTO idempotency_requests "
                        "(operation_type, operation_key, request_hash, request_body, execution_token, entity_type, user_id, status, error_detail, created_at, completed_at) "
                        "VALUES (:ot, :k, :h, CAST(:body AS jsonb), :token, :et, NULL, 'FAILED', :err, :now, :now) "
                        "ON CONFLICT (operation_type, operation_key) DO UPDATE "
                        "SET status = 'FAILED', "
                        "    error_detail = :err, "
                        "    completed_at = :now, "
                        "    request_hash = COALESCE(EXCLUDED.request_hash, idempotency_requests.request_hash), "
                        "    request_body = COALESCE(EXCLUDED.request_body, idempotency_requests.request_body), "
                        "    execution_token = EXCLUDED.execution_token, "
                        "    entity_type = COALESCE(EXCLUDED.entity_type, idempotency_requests.entity_type) "
                        "WHERE idempotency_requests.operation_type = :ot AND idempotency_requests.operation_key = :k"
                    ),
                    {
                        "ot": op_type,
                        "k": client_key,
                        "h": request_hash,
                        "body": body_json,
                        "token": exec_token,
                        "et": entity_type,
                        "err": error[:2000],
                        "now": now,
                    }
                )
                s.commit()
    except Exception as exc:
        logger.error(f"Error al marcar FAILED en idempotency_requests para {op_type}/{client_key}: {exc}", exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
# 1. KARDEX INMUTABLE E IDEMPOTENTE
# ─────────────────────────────────────────────────────────────────────────────

def _direcciones_del_kardex(direction) -> list:
    """B4 T13 (R11, RP9, D46): las direcciones del CSV de get_kardex, en mayúsculas (como hoy: 'in' es IN) y sin
    repetidas. 422 con más de 20 («Puedes filtrar por 20 estados como máximo.»), con un carácter de control
    (MENSAJE_CONTROL) o con un valor que no es de DIRECCIONES_KARDEX: «La dirección «x» no existe en el Kardex.» (el
    valor recibido, recortado a 40)."""
    try:
        recibidas = leer_lista(direction)
    except ValueError as e:
        raise HTTPException(422, str(e))
    direcciones = []
    for valor in recibidas:
        if valor.upper() not in ai.DIRECCIONES_KARDEX:
            raise HTTPException(422, f"La dirección «{valor:.40}» no existe en el Kardex.")
        if valor.upper() not in direcciones:
            direcciones.append(valor.upper())
    return direcciones


@router.get("/kardex", response_model=dict)
def get_kardex(
    sku_id: Optional[int] = Query(None, description="Filtrar por SKU"),
    warehouse_id: Optional[int] = Query(None, description="Filtrar por Bodega"),
    owner: Optional[str] = Query(None, description="Filtrar por propietario: NEBULAE o MAU"),
    direction: Optional[str] = Query(None, description="Una o varias, en CSV: IN | OUT | ADJUST_IN | ADJUST_OUT | TRANSFER_IN | TRANSFER_OUT | QUARANTINE | SCRAP | RETURN_IN"),
    start_date: Optional[datetime.date] = Query(None, description="Fecha inicial"),
    end_date: Optional[datetime.date] = Query(None, description="Fecha final"),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Consulta el historial de movimientos (Kárdex) inmutable con filtros y paginación.

    B4 T13 (KANBAN-resto, R11, RP54): direction acepta una lista en CSV (leer_lista), cada valor en mayúsculas y de los
    que escribe el sistema (analisis_inventario.DIRECCIONES_KARDEX); con un solo valor la consulta es la de hoy (la
    igualdad). La respuesta {status, data: {total, limit, offset, items}} no cambia y no hay `q`."""
    direcciones = _direcciones_del_kardex(direction)
    query = (
        select(
            InventoryMovement.id,
            InventoryMovement.operation_id,
            InventoryOperation.operation_type,
            InventoryOperation.source_document_type,
            InventoryOperation.source_document_numero,
            InventoryMovement.sku_id,
            ProductSKU.sku,
            Product.name.label("product_name"),
            InventoryMovement.quantity,
            InventoryMovement.direction,
            InventoryMovement.owner,
            InventoryMovement.warehouse_id,
            Warehouse.name.label("warehouse_name"),
            ProductSKU.cost_price.label("unit_cost_cop"),
            InventoryMovement.created_at,
            InventoryMovement.created_by,
            InventoryMovement.idempotency_key,
        )
        .join(InventoryOperation, InventoryOperation.id == InventoryMovement.operation_id)
        .outerjoin(ProductSKU, ProductSKU.id == InventoryMovement.sku_id)
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .outerjoin(Warehouse, Warehouse.id == InventoryMovement.warehouse_id)
    )

    if sku_id is not None:
        query = query.where(InventoryMovement.sku_id == sku_id)
    if warehouse_id is not None:
        query = query.where(InventoryMovement.warehouse_id == warehouse_id)
    if owner:
        query = query.where(InventoryMovement.owner == owner.strip().upper())
    query = filtrar_por_estados(query, InventoryMovement.direction, direcciones)
    if start_date:
        query = query.where(InventoryMovement.created_at >= datetime.datetime.combine(start_date, datetime.time.min))
    if end_date:
        query = query.where(InventoryMovement.created_at <= datetime.datetime.combine(end_date, datetime.time.max))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    query = query.order_by(InventoryMovement.created_at.desc(), InventoryMovement.id.desc()).limit(limit).offset(offset)
    rows = db.execute(query).mappings().all()

    items = [
        KardexMovementItem(
            id=r["id"],
            operation_id=r["operation_id"],
            operation_type=r["operation_type"],
            source_document_type=r["source_document_type"],
            source_document_numero=r["source_document_numero"],
            sku_id=r["sku_id"],
            sku=r["sku"],
            product_name=r["product_name"],
            quantity=Decimal(str(r["quantity"])),
            direction=r["direction"],
            owner=r["owner"] or "NEBULAE",
            warehouse_id=r["warehouse_id"],
            warehouse_name=r["warehouse_name"],
            unit_cost_cop=Decimal(str(r["unit_cost_cop"])) if r["unit_cost_cop"] is not None else None,
            created_at=r["created_at"],
            created_by=r["created_by"],
            idempotency_key=r["idempotency_key"],
        )
        for r in rows
    ]

    return {
        "status": "success",
        "data": {
            "total": total,
            "limit": limit,
            "offset": offset,
            "items": [it.model_dump() for it in items],
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2. DISPONIBILIDAD DERIVADA Y RESUMEN DE STOCK
# ─────────────────────────────────────────────────────────────────────────────

def _calculate_sku_availability(db: Session, sku_id: int, warehouse_id: int) -> dict:
    """
    Calcula la disponibilidad física vendible, reservas y cuarentena de un SKU en una bodega.

    B4 T13 (R10, C11, RP50, RP80): delega en core/existencias.disponibilidad_sku, la regla única de las existencias que
    también usan /inventory/stock-tabla, /inventory/stats y /inventory/analisis. Conserva las nueve claves de siempre, en
    Decimal:
    - stock_vendible_fisico = InventoryLevel.quantity (físico vendible, NUNCA incluye cuarentena)
    - stock_reservado = SUM(InventoryReservation.quantity_reserved) activas y no vencidas
    - stock_disponible = max(0, stock_vendible_fisico - stock_reservado)
    - stock_cuarentena = SUM(InventoryQuarantine.quantity) activas
    - stock_total_bajo_custodia = stock_vendible_fisico + stock_cuarentena
    - stock_fisico = stock_vendible_fisico (compatibilidad)
    - stock_en_transito = Σ(pedido − recibido) de las líneas de los PEC en la etapa activos de R9 (emitido, en tránsito y
      en bodega; core/estados_compras.GRUPOS_PEC['activos']), del SKU y sin bodega: el mismo número en cada bodega. Antes
      filtraba CONFIRMADA, ENVIADA, PARCIALMENTE_ENVIADA y PARCIALMENTE_RECIBIDA, que el PEC no usa (casi siempre 0).
    - balance_nebulae y balance_mau = SUM(InventoryOwnerBalance) de cada dueño
    """
    return disponibilidad_sku(db, sku_id, warehouse_id)


@router.get("/disponibilidad/{sku_id}", response_model=dict)
def get_sku_availability(
    sku_id: int,
    warehouse_id: Optional[int] = Query(None, description="Filtrar por bodega específica"),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Retorna el desglose de disponibilidad física, reservada, en cuarentena y vendible de un SKU."""
    sku = db.execute(
        select(ProductSKU, Product.name.label("product_name"))
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .where(ProductSKU.id == sku_id)
    ).first()
    if not sku:
        raise HTTPException(404, f"SKU {sku_id} no encontrado")

    sku_obj, product_name = sku[0], sku[1]

    warehouses = db.execute(select(Warehouse).order_by(Warehouse.id)).scalars().all()
    if warehouse_id:
        warehouses = [w for w in warehouses if w.id == warehouse_id]
        if not warehouses:
            raise HTTPException(404, f"Bodega {warehouse_id} no encontrada")

    results = []
    for w in warehouses:
        data = _calculate_sku_availability(db, sku_id, w.id)
        results.append({
            "sku_id": sku_id,
            "sku": sku_obj.sku,
            "product_name": product_name,
            "warehouse_id": w.id,
            "warehouse_name": w.name,
            **data
        })

    return {
        "status": "success",
        "data": results if warehouse_id is None else results[0]
    }


@router.get("/stock-summary", response_model=dict)
def get_inventory_stock_summary(
    warehouse_id: Optional[int] = Query(None, description="Filtrar por bodega específica"),
    sku_id: Optional[int] = Query(None, description="Filtrar por SKU específico"),
    search: Optional[str] = Query(None, description="Buscar por SKU o nombre de producto"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Reporte consolidado de inventario con disponibilidad derivada y separación patrimonial."""
    query = (
        select(ProductSKU.id, ProductSKU.sku, Product.name.label("product_name"))
        .outerjoin(Product, Product.id == ProductSKU.product_id)
    )
    if sku_id:
        query = query.where(ProductSKU.id == sku_id)
    if search:
        s = f"%{search.strip()}%"
        query = query.where(or_(ProductSKU.sku.ilike(s), Product.name.ilike(s)))

    total = db.execute(select(func.count()).select_from(query.subquery())).scalar() or 0
    skus = db.execute(query.order_by(ProductSKU.id).limit(limit).offset(offset)).all()

    warehouses = db.execute(select(Warehouse).order_by(Warehouse.id)).scalars().all()
    if warehouse_id:
        warehouses = [w for w in warehouses if w.id == warehouse_id]

    items = []
    for sku_row in skus:
        s_id, s_code, p_name = sku_row[0], sku_row[1], sku_row[2]
        for w in warehouses:
            avail = _calculate_sku_availability(db, s_id, w.id)
            if avail["stock_vendible_fisico"] > 0 or avail["stock_reservado"] > 0 or avail["stock_cuarentena"] > 0 or avail["stock_en_transito"] > 0:
                items.append({
                    "sku_id": s_id,
                    "sku": s_code,
                    "product_name": p_name,
                    "warehouse_id": w.id,
                    "warehouse_name": w.name,
                    **avail
                })

    return {
        "status": "success",
        "data": {
            "total_skus": total,
            "items": items
        }
    }


# ─────────────────────────────────────────────────────────────────────────────
# 2b. B4 T13: EXISTENCIAS REALES EN LA TABLA ESTÁNDAR, INDICADORES Y ANÁLISIS
# (TABLA-inventario 1, KPI-inventario 1 y ANALISIS-inventario 2; R5, R10, R13, R21; C8, C11; RP50, RP51, RP52)
# Todo sale de core/existencias.py (T1C). Estas rutas no declaran response_model: sus Decimal salen como números.
# ─────────────────────────────────────────────────────────────────────────────

ORDENES_STOCK = ("producto", "sku", "categoria", "fisico", "reservado", "disponible", "transito", "precio",
                 "valorizacion")
ORDEN_STOCK_POR_DEFECTO = "producto"
POR_DEFECTO = "sku"
SIN_FILTRO_STOCK = "todos"   # D46: 'todos' es «sin filtro», como vista=todos y semaforo=todos
MENSAJE_POR = "No se puede agrupar por «{:.40}»: usa sku o bodega."
MENSAJE_ESTADO_STOCK = "El estado de stock «{:.40}» no existe: usa agotado, bajo_minimo o abastecido."
MENSAJE_BODEGA = "La bodega «{}» no existe."
MENSAJE_CATEGORIA = "La categoría «{}» no existe."


def _opcion_de_stock(valor, opciones, mensaje) -> Optional[str]:
    """Un parámetro de negocio (R21): 422 con MENSAJE_CONTROL si trae un carácter de control y, si no es una de
    `opciones`, con `mensaje` (el valor recortado a 40). None si no vino o vino en blanco."""
    return _parametro_de_lista(_sin_caracteres_de_control(valor), opciones, mensaje)


def _exigir_que_exista(db: Session, modelo, id_, mensaje: str) -> None:
    """Un id que llega como filtro y no existe responde 422 en español (no una lista vacía que parezca real)."""
    if id_ is not None and db.get(modelo, id_) is None:
        raise HTTPException(422, mensaje.format(id_))


def _ordenes_stock(e) -> dict:
    """Las órdenes permitidas de leer_orden (D34) sobre las columnas de consulta_existencias."""
    return {"producto": e.c.producto, "sku": e.c.sku, "categoria": e.c.categoria, "fisico": e.c.fisico,
            "reservado": e.c.reservado, "disponible": e.c.disponible, "transito": e.c.en_transito,
            "precio": e.c.precio, "valorizacion": e.c.valorizacion}


def _conteos_stock(e) -> dict:
    """con_conteos (R10, RP52): todos, agotados, bajo_minimo, abastecidos (el estado_stock de cada fila) y con_fisico
    (físico > 0, lo mismo que incluir_sin_stock=false)."""
    return {"todos": None, "agotados": e.c.estado_stock == ESTADOS_STOCK[0],
            "bajo_minimo": e.c.estado_stock == ESTADOS_STOCK[1], "abastecidos": e.c.estado_stock == ESTADOS_STOCK[2],
            "con_fisico": e.c.fisico > 0}


def _resumen_stock(db: Session, warehouse_id, categoria_id, texto) -> dict:
    """con_resumen (R10, RP50): por REFERENCIA (consulta_existencias por='sku', sea cual sea `por`), con la búsqueda, la
    bodega y la categoría, sin estado_stock ni incluir_sin_stock y sin las referencias con rastrear_inventario = false
    (la regla de los totales de resumen_existencias): valorizacion_cop (Σ físico × costo, al peso), skus, bajo_minimo,
    agotados y disponibilidad_pct (disponibles / físicas × 100 con 1 decimal; None sin físicas). UNA consulta."""
    s = consulta_existencias(db, por="sku", warehouse_id=warehouse_id, categoria_id=categoria_id,
                             q=texto).subquery("resumen_stock")
    contar = lambda estado: func.count(s.c.sku_id).filter(s.c.estado_stock == estado)  # noqa: E731
    skus, valor, bajo, agotados, fisicas, disponibles = (
        db.query(func.count(s.c.sku_id), func.coalesce(func.sum(s.c.valorizacion), 0), contar(ESTADOS_STOCK[1]),
                 contar(ESTADOS_STOCK[0]), func.coalesce(func.sum(s.c.fisico), 0),
                 func.coalesce(func.sum(s.c.disponible), 0))
        .filter(s.c.rastrear_inventario.is_(True)).one())
    return {"valorizacion_cop": dinero(valor), "skus": int(skus), "bajo_minimo": int(bajo),
            "agotados": int(agotados),
            "disponibilidad_pct": round(float(disponibles) / float(fisicas) * 100, 1) if fisicas else None}


@router.get("/stock-tabla")
def get_stock_tabla(
    por: Optional[str] = None,
    q: Optional[str] = None,
    warehouse_id: Optional[int] = None,
    categoria_id: Optional[int] = None,
    estado_stock: Optional[str] = None,
    incluir_sin_stock: bool = True,
    orden: Optional[str] = None,
    con_conteos: bool = False,
    con_resumen: bool = False,
    limit: int = Query(50, ge=0, le=200),
    offset: int = Query(0, ge=0, le=MAX_OFFSET),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Las existencias reales en la tabla estándar (TABLA-inventario 1, R10): una fila por SKU (por=sku, por defecto,
    con las bodegas sumadas) o por SKU y bodega (por=bodega), con las columnas de consulta_existencias (sku_id, sku,
    producto, categoria, bodega, fisico, reservado, disponible, cuarentena, en_transito, precio, costo, valorizacion,
    minimo, estado_stock, warehouse_id y rastrear_inventario). El tránsito es el del SKU: con por=bodega cada fila trae el
    del SKU y nada lo suma dos veces (RP50).
    - q: el SKU o el nombre del producto; warehouse_id y categoria_id (si no existen, 422).
    - estado_stock: agotado | bajo_minimo | abastecido, con el disponible de la fila y el mínimo de la referencia (RP52 a;
      no hay `umbral`, R10); 'todos' o en blanco no filtra. incluir_sin_stock=false deja solo físico > 0 (RP52 c).
    - orden: [-]producto | sku | categoria | fisico | reservado | disponible | transito | precio | valorizacion (por
      defecto producto); desempate sku_id desc y, con por=bodega, warehouse_id desc.
    - con_conteos (con q y los filtros, sin estado_stock ni incluir_sin_stock) y con_resumen (_resumen_stock).
    limit = Query(50, ge=0, le=200) (0 = solo el total) y offset hasta MAX_OFFSET."""
    por = _opcion_de_stock(por, POR, MENSAJE_POR) or POR_DEFECTO
    estado = _opcion_de_stock(estado_stock, ESTADOS_STOCK + (SIN_FILTRO_STOCK,), MENSAJE_ESTADO_STOCK)
    estado = None if estado == SIN_FILTRO_STOCK else estado
    try:
        texto = texto_busqueda(q, None)
    except ValueError as e:
        raise HTTPException(422, str(e))
    e = consulta_existencias(db, por=por, warehouse_id=warehouse_id, categoria_id=categoria_id,
                             q=texto).subquery("stock_tabla")
    orden_sql = leer_orden(orden, _ordenes_stock(e), ORDEN_STOCK_POR_DEFECTO, id_lista=e.c.sku_id)
    if por == "bodega":
        orden_sql.append(e.c.warehouse_id.desc())
    _exigir_que_exista(db, Warehouse, warehouse_id, MENSAJE_BODEGA)
    _exigir_que_exista(db, Category, categoria_id, MENSAJE_CATEGORIA)

    base = db.query(e)
    filtrado = base
    if estado:
        filtrado = filtrado.filter(e.c.estado_stock == estado)
    if not incluir_sin_stock:
        filtrado = filtrado.filter(e.c.fisico > 0)
    conteos = contar_por_vista(base, _conteos_stock(e)) if con_conteos else None
    resumen = _resumen_stock(db, warehouse_id, categoria_id, texto) if con_resumen else None
    total, filas = paginar(filtrado.order_by(*orden_sql), limit, offset)
    return respuesta_de_lista(total, [dict(f._mapping) for f in filas], conteos=conteos, resumen=resumen)


@router.get("/stats")
def get_inventory_stats(
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Los indicadores de Inventario (KPI-inventario 1, R10): data = resumen_existencias (skus_total, unidades_fisicas,
    unidades_reservadas, unidades_disponibles, unidades_en_transito, valor_inventario_cop, skus_sin_costo, skus_agotados,
    skus_bajo_minimo, skus_abastecidos y disponibilidad_pct, por referencia y sin rastrear_inventario = false) + bodegas
    (COUNT de warehouses). Dos consultas agregadas. El «un solo mínimo» (PATCH /inventory/config) no se hace."""
    data = resumen_existencias(db)
    data["bodegas"] = int(db.scalar(select(func.count(Warehouse.id))) or 0)
    return {"status": "success", "data": data}


@router.get("/analisis")
def get_inventory_analisis(
    periodo: Optional[str] = None,
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
    top: Optional[str] = None,
    bodega: Optional[int] = None,
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """El Análisis de Inventario con el contrato único de core/analisis.py (core/analisis_inventario.analisis_inventario,
    ANALISIS-inventario 2). periodo: 7d, 30d (por defecto), 90d, mes, 12m o personalizado (con desde y hasta
    'AAAA-MM-DD'); top: 5 (por defecto), 10 o 25; bodega: un warehouse_id (si no existe, 422). Los parámetros de negocio
    se declaran como texto y se validan aquí (R21): un valor que no sirve responde 422 con su texto en español (RP9). Los
    errores del cálculo (analisis.ErrorDeContrato) no se convierten en 422: llegan como 500. No usa
    _calculate_sku_availability: todo es agregado."""
    try:
        p = resolver_periodo(periodo, desde, hasta)
        top = validar_top(top if isinstance(top, str) and top.strip() else ai.TOP_POR_DEFECTO)
    except ValueError as e:
        raise HTTPException(422, str(e))
    _exigir_que_exista(db, Warehouse, bodega, MENSAJE_BODEGA)
    return ai.analisis_inventario(db, p, top, bodega=bodega)


# ─────────────────────────────────────────────────────────────────────────────
# 3. RESERVAS DE INVENTARIO CON CONTROL CONCURRENTE E IDEMPOTENCIA
# ─────────────────────────────────────────────────────────────────────────────

@router.post("/reservas", response_model=dict, status_code=status.HTTP_201_CREATED)
def create_inventory_reservation(
    body: CreateReservationRequest,
    response: Response,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Crea una reserva de stock atómica y protegida contra sobreventa concurrente (SELECT FOR UPDATE) e idempotente."""
    now = _now()
    client_key = body.idempotency_key.strip()
    sku_id = body.sku_id
    warehouse_id = body.warehouse_id
    qty = Decimal(str(body.quantity))
    owner = body.owner.strip().upper()

    if owner not in ("NEBULAE", "MAU"):
        raise HTTPException(422, "El propietario debe ser 'NEBULAE' o 'MAU'")

    payload_for_hash = {
        "sku_id": sku_id,
        "warehouse_id": warehouse_id,
        "quantity": str(qty),
        "owner": owner,
        "sale_order_line_id": body.sale_order_line_id,
    }

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="CREAR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        response.status_code = status.HTTP_200_OK
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        # Iniciar transacción pesimista: Bloquear InventoryLevel para serializar concurrencia
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == sku_id, InventoryLevel.warehouse_id == warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()

        stock_fisico = Decimal(str(level.quantity)) if level and level.quantity is not None else Decimal("0.00")

        # Bloquear y calcular balance del propietario
        owner_bal = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == sku_id,
                InventoryOwnerBalance.warehouse_id == warehouse_id,
                InventoryOwnerBalance.owner == owner
            )
            .with_for_update()
        ).scalar_one_or_none()

        stock_owner = Decimal(str(owner_bal.quantity)) if owner_bal and owner_bal.quantity is not None else Decimal("0.00")

        # Calcular reservas activas para el propietario
        active_res_sum = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
            .where(
                InventoryReservation.sku_id == sku_id,
                InventoryReservation.warehouse_id == warehouse_id,
                InventoryReservation.owner == owner,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        active_res_owner = Decimal(str(active_res_sum))

        # Calcular reservas activas globales
        global_res_sum = db.execute(
            select(func.coalesce(func.sum(InventoryReservation.quantity_reserved), 0))
            .where(
                InventoryReservation.sku_id == sku_id,
                InventoryReservation.warehouse_id == warehouse_id,
                InventoryReservation.status == "ACTIVE"
            )
        ).scalar()
        global_res = Decimal(str(global_res_sum))

        # Semántica única: disponible_fisico = vendible - reservas
        disponible_fisico = max(Decimal("0.00"), stock_fisico - global_res)
        disponible_owner = max(Decimal("0.00"), stock_owner - active_res_owner)

        if disponible_owner < qty:
            raise HTTPException(
                409,
                f"Stock disponible insuficiente para reserva del propietario {owner}. "
                f"Solicitado: {qty}, Disponible: {disponible_owner} (Físico {owner}: {stock_owner}, Reservado: {active_res_owner})"
            )

        if disponible_fisico < qty:
            raise HTTPException(
                409,
                f"Stock físico vendible insuficiente en bodega. "
                f"Solicitado: {qty}, Vendible disponible: {disponible_fisico} (Físico: {stock_fisico})"
            )

        # Validar sale_order_line_id si viene provisto
        if body.sale_order_line_id:
            so_line = db.execute(
                select(SaleOrderLineErp).where(SaleOrderLineErp.id == body.sale_order_line_id)
            ).scalar_one_or_none()
            if not so_line:
                raise HTTPException(404, f"Línea de pedido de venta {body.sale_order_line_id} no encontrada")

        expires_at = now + datetime.timedelta(hours=body.expires_hours or 48)

        reservation = InventoryReservation(
            sku_id=sku_id,
            warehouse_id=warehouse_id,
            owner=owner,
            quantity_reserved=qty,
            sale_order_line_id=body.sale_order_line_id,
            status="ACTIVE",
            expires_at=expires_at,
            created_at=now,
            created_by=getattr(user, "email", str(getattr(user, "id", "system"))),
            notes=body.notes
        )
        db.add(reservation)
        db.flush()

        resp_data = ReservationResponse.model_validate(reservation).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=reservation.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="CREAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al crear reserva: {exc}")


@router.post("/reservas/{reserva_id}/liberar", response_model=dict)
def release_inventory_reservation(
    reserva_id: int,
    body: OperateReservationRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Libera una reserva activa haciéndola disponible nuevamente (idempotente)."""
    now = _now()
    client_key = body.idempotency_key.strip()
    payload_for_hash = {"reserva_id": reserva_id, "notes": body.notes}

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="LIBERAR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        res = db.execute(
            select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
        ).scalar_one_or_none()
        if not res:
            raise HTTPException(404, "Reserva no encontrada")

        if res.status != "ACTIVE":
            raise HTTPException(409, f"La reserva {reserva_id} no está activa (estado actual={res.status})")

        res.status = "RELEASED"
        res.released_at = now
        if body.notes:
            res.notes = f"{res.notes or ''}\nLiberación: {body.notes}".strip()
        db.flush()

        resp_data = ReservationResponse.model_validate(res).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=res.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Reserva {reserva_id} liberada con éxito",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="LIBERAR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al liberar reserva: {exc}")


@router.post("/reservas/{reserva_id}/convertir", response_model=dict)
def convert_inventory_reservation(
    reserva_id: int,
    body: OperateReservationRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """Convierte una reserva activa al despachar el pedido: deduce el stock físico y registra salida en Kárdex (idempotente)."""
    now = _now()
    client_key = body.idempotency_key.strip()
    payload_for_hash = {"reserva_id": reserva_id, "notes": body.notes}

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="CONVERTIR_RESERVA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="RESERVA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        res = db.execute(
            select(InventoryReservation).where(InventoryReservation.id == reserva_id).with_for_update()
        ).scalar_one_or_none()
        if not res:
            raise HTTPException(404, "Reserva no encontrada")

        if res.status != "ACTIVE":
            raise HTTPException(409, f"La reserva {reserva_id} no está activa (estado actual={res.status})")

        qty = Decimal(str(res.quantity_reserved))

        # Bloquear y actualizar InventoryLevel
        level = db.execute(
            select(InventoryLevel)
            .where(InventoryLevel.sku_id == res.sku_id, InventoryLevel.warehouse_id == res.warehouse_id)
            .with_for_update()
        ).scalar_one_or_none()
        if not level or Decimal(str(level.quantity)) < qty:
            raise HTTPException(
                409,
                f"Discrepancia física: existencia en bodega insuficiente ({level.quantity if level else 0}) "
                f"para convertir reserva de {qty}"
            )

        level.quantity = Decimal(str(level.quantity)) - qty

        # Actualizar balance por propietario (REGLA: NUNCA usar max(0, ...), fallar con 409 si insuficiente)
        owner_bal = db.execute(
            select(InventoryOwnerBalance)
            .where(
                InventoryOwnerBalance.sku_id == res.sku_id,
                InventoryOwnerBalance.warehouse_id == res.warehouse_id,
                InventoryOwnerBalance.owner == res.owner
            )
            .with_for_update()
        ).scalar_one_or_none()
        if not owner_bal or Decimal(str(owner_bal.quantity)) < qty:
            raise HTTPException(
                409,
                f"Saldo insuficiente del propietario {res.owner} ({owner_bal.quantity if owner_bal else 0}) "
                f"para convertir reserva de {qty}"
            )

        owner_bal.quantity = Decimal(str(owner_bal.quantity)) - qty
        owner_bal.updated_at = now

        # Registrar operación y movimiento de Kárdex OUT
        inv_op = InventoryOperation(
            dest_warehouse_id=res.warehouse_id,
            operation_type="DELIVERY",
            status="DONE",
            source_document_type="RESERVA",
            source_document_id=res.id,
            source_document_numero=f"RES-{res.id}",
        )
        db.add(inv_op)
        db.flush()

        mv_key = hashlib.sha256(f"{inv_op.id}:{res.sku_id}:OUT:{res.owner}:{res.warehouse_id}".encode()).hexdigest()
        db.add(InventoryMovement(
            operation_id=inv_op.id,
            sku_id=res.sku_id,
            quantity=qty,
            direction="OUT",
            owner=res.owner,
            warehouse_id=res.warehouse_id,
            idempotency_key=mv_key,
            created_at=now,
            created_by=getattr(user, "email", str(getattr(user, "id", "system")))
        ))

        res.status = "CONVERTED"
        res.converted_at = now
        if body.notes:
            res.notes = f"{res.notes or ''}\nConversión: {body.notes}".strip()
        db.flush()

        resp_data = ReservationResponse.model_validate(res).model_dump(mode="json")
        _finish_idempotent_operation(
            db=db,
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=res.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Reserva {reserva_id} convertida a entrega exitosamente",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="CONVERTIR_RESERVA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="RESERVA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al convertir reserva: {exc}")


# ─────────────────────────────────────────────────────────────────────────────
# 4. GESTIÓN Y AISLAMIENTO DE CUARENTENA CON SEGREGACIÓN PATRIMONIAL
# ─────────────────────────────────────────────────────────────────────────────

@router.get("/cuarentena", response_model=dict)
def list_quarantine_items(
    warehouse_id: Optional[int] = Query(None),
    owner: Optional[str] = Query(None, description="Filtrar por propietario: NEBULAE o MAU"),
    status: Optional[str] = Query("ACTIVO", description="ACTIVO | LIBERADO | DEVUELTO_PROVEEDOR | DESTRUIDO"),
    user: User = Depends(require_roles(*ALL_ERP_ROLES)),
    db: Session = Depends(get_db),
):
    """Lista las unidades retenidas en cuarentena, defectuosas o discrepantes con filtro por propietario."""
    query = (
        select(
            InventoryQuarantine.id,
            InventoryQuarantine.sku_id,
            ProductSKU.sku,
            Product.name.label("product_name"),
            InventoryQuarantine.warehouse_id,
            Warehouse.name.label("warehouse_name"),
            InventoryQuarantine.gr_line_id,
            InventoryQuarantine.quantity,
            InventoryQuarantine.reason,
            InventoryQuarantine.owner,
            InventoryQuarantine.status,
            InventoryQuarantine.notes,
            InventoryQuarantine.created_at,
            InventoryQuarantine.resolved_at,
            InventoryQuarantine.resolved_by,
        )
        .join(ProductSKU, ProductSKU.id == InventoryQuarantine.sku_id)
        .outerjoin(Product, Product.id == ProductSKU.product_id)
        .join(Warehouse, Warehouse.id == InventoryQuarantine.warehouse_id)
    )
    if warehouse_id:
        query = query.where(InventoryQuarantine.warehouse_id == warehouse_id)
    if owner:
        query = query.where(InventoryQuarantine.owner == owner.strip().upper())
    if status:
        query = query.where(InventoryQuarantine.status == status.strip().upper())

    rows = db.execute(query.order_by(InventoryQuarantine.created_at.desc())).mappings().all()
    items = [
        QuarantineItemResponse(
            id=r["id"],
            sku_id=r["sku_id"],
            sku=r["sku"],
            product_name=r["product_name"],
            warehouse_id=r["warehouse_id"],
            warehouse_name=r["warehouse_name"],
            gr_line_id=r["gr_line_id"],
            quantity=Decimal(str(r["quantity"])),
            reason=r["reason"],
            owner=r["owner"] or "NEBULAE",
            status=r["status"],
            notes=r["notes"],
            created_at=r["created_at"],
            resolved_at=r["resolved_at"],
            resolved_by=r["resolved_by"],
        )
        for r in rows
    ]

    return {
        "status": "success",
        "data": [it.model_dump() for it in items]
    }


@router.post("/cuarentena/{quarantine_id}/resolver", response_model=dict)
def resolve_quarantine_item(
    quarantine_id: int,
    body: ResolveQuarantineRequest,
    user: User = Depends(require_roles(*ROLE_ADMIN, *ROLE_BODEGA)),
    db: Session = Depends(get_db),
):
    """
    Resuelve un ítem de cuarentena (idempotente):
    - LIBERAR: ingresa las unidades como stock físico vendible (+Kárdex IN) y suma al balance del propietario original.
    - DEVUELTO_PROVEEDOR: se asienta la devolución con su propietario original y motivo (no toca disponible ni balances).
    - DESTRUIDO: se da de baja con su propietario original y motivo (no toca disponible ni balances).
    """
    now = _now()
    client_key = body.idempotency_key.strip()
    action = body.action.strip().upper()
    if action not in ("LIBERAR", "DEVUELTO_PROVEEDOR", "DESTRUIDO"):
        raise HTTPException(422, "Acción inválida. Use: LIBERAR, DEVUELTO_PROVEEDOR, DESTRUIDO")

    payload_for_hash = {
        "quarantine_id": quarantine_id,
        "action": action,
        "notes": body.notes,
    }

    replay_data, exec_token, req_hash = _start_idempotent_operation(
        db=db,
        op_type="RESOLVER_CUARENTENA",
        client_key=client_key,
        payload_dict=payload_for_hash,
        entity_type="CUARENTENA",
        user_id=getattr(user, "id", None),
        now=now,
    )

    if replay_data is not None:
        return {
            "status": "success",
            "data": replay_data,
            "idempotent_replay": True,
            "idempotency_key": client_key,
        }

    try:
        q = db.execute(
            select(InventoryQuarantine).where(InventoryQuarantine.id == quarantine_id).with_for_update()
        ).scalar_one_or_none()
        if not q:
            raise HTTPException(404, "Registro de cuarentena no encontrado")

        if q.status != "ACTIVO":
            raise HTTPException(409, f"El registro de cuarentena ya está resuelto (estado={q.status})")

        qty = Decimal(str(q.quantity))
        item_owner = q.owner or "NEBULAE"

        if action == "LIBERAR":
            # 1. Ingresar a stock vendible
            level = db.execute(
                select(InventoryLevel)
                .where(InventoryLevel.sku_id == q.sku_id, InventoryLevel.warehouse_id == q.warehouse_id)
                .with_for_update()
            ).scalar_one_or_none()
            if level:
                level.quantity = Decimal(str(level.quantity)) + qty
            else:
                db.add(InventoryLevel(sku_id=q.sku_id, warehouse_id=q.warehouse_id, quantity=qty))

            # 2. Balance del propietario original (Si era Mau -> suma a Mau. Si era Nebulae -> suma a Nebulae)
            iob = db.execute(
                select(InventoryOwnerBalance)
                .where(
                    InventoryOwnerBalance.sku_id == q.sku_id,
                    InventoryOwnerBalance.warehouse_id == q.warehouse_id,
                    InventoryOwnerBalance.owner == item_owner
                )
                .with_for_update()
            ).scalar_one_or_none()
            if iob:
                iob.quantity = Decimal(str(iob.quantity)) + qty
                iob.updated_at = now
            else:
                db.add(InventoryOwnerBalance(
                    sku_id=q.sku_id,
                    warehouse_id=q.warehouse_id,
                    owner=item_owner,
                    quantity=qty,
                    updated_at=now
                ))

            # 3. Registrar Kárdex IN con el propietario original
            inv_op = db.execute(
                select(InventoryOperation).where(
                    InventoryOperation.source_document_type == "CUARENTENA_LIBERADA",
                    InventoryOperation.source_document_id == q.id
                )
            ).scalar_one_or_none()
            if not inv_op:
                inv_op = InventoryOperation(
                    dest_warehouse_id=q.warehouse_id,
                    operation_type="RECEIPT",
                    status="DONE",
                    source_document_type="CUARENTENA_LIBERADA",
                    source_document_id=q.id,
                    source_document_numero=f"CUAR-{q.id}",
                )
                db.add(inv_op)
                db.flush()

            mv_key = hashlib.sha256(f"{inv_op.id}:{q.sku_id}:IN:{item_owner}:{q.warehouse_id}:LIBERAR".encode()).hexdigest()
            existing_mv = db.execute(
                select(InventoryMovement).where(InventoryMovement.idempotency_key == mv_key)
            ).scalar_one_or_none()
            if not existing_mv:
                db.add(InventoryMovement(
                    operation_id=inv_op.id,
                    sku_id=q.sku_id,
                    quantity=qty,
                    direction="IN",
                    owner=item_owner,
                    warehouse_id=q.warehouse_id,
                    idempotency_key=mv_key,
                    created_at=now,
                    created_by=getattr(user, "email", str(getattr(user, "id", "system")))
                ))

            # 4. Asignación prioritaria a CUSTOMER_ORDER si proviene de una recepción de compra
            if q.gr_line_id:
                from app.models.fase1b import GoodsReceiptLine, ProcurementAllocation, SaleOrderLineErp
                from app.models.erp_documents import SaleOrder
                from app.api.v1.erp_ventas_fase4 import recalculate_sale_order_state

                grl = db.execute(select(GoodsReceiptLine).where(GoodsReceiptLine.id == q.gr_line_id)).scalar_one_or_none()
                if grl and grl.po_line_id:
                    allocs = db.execute(
                        select(ProcurementAllocation).where(
                            ProcurementAllocation.po_line_id == grl.po_line_id,
                            ProcurementAllocation.allocation_type == "CUSTOMER_ORDER",
                            ProcurementAllocation.sale_order_line_id.isnot(None)
                        ).order_by(ProcurementAllocation.id)
                    ).scalars().all()

                    rem_lib = qty
                    for alloc in allocs:
                        if rem_lib <= 0:
                            break
                        sol = db.execute(
                            select(SaleOrderLineErp).where(SaleOrderLineErp.id == alloc.sale_order_line_id).with_for_update()
                        ).scalar_one_or_none()
                        if sol:
                            needed = max(Decimal("0.00"), Decimal(str(sol.quantity)) - Decimal(str(sol.quantity_reserved or 0)))
                            if needed > 0:
                                take_res = min(rem_lib, needed)
                                res_key = f"QUAR_LIB_RES:{q.id}:{alloc.id}:{client_key}"
                                res = InventoryReservation(
                                    sku_id=q.sku_id,
                                    warehouse_id=q.warehouse_id,
                                    owner=item_owner,
                                    quantity_reserved=take_res,
                                    sale_order_line_id=sol.id,
                                    status="ACTIVE",
                                    expires_at=now + datetime.timedelta(hours=72),
                                    created_at=now,
                                    created_by=getattr(user, "email", "system"),
                                    notes=f"Reserva por liberación de cuarentena CUAR-{q.id} (idempotency_key={res_key})"
                                )
                                db.add(res)
                                sol.quantity_reserved = Decimal(str(sol.quantity_reserved or 0)) + take_res
                                if sol.quantity_reserved >= sol.quantity:
                                    sol.estado = "RESERVADA"
                                else:
                                    sol.estado = "PARCIALMENTE_DISPONIBLE"
                                sol.updated_at = now

                                so = db.execute(select(SaleOrder).where(SaleOrder.id == sol.so_id).with_for_update()).scalar_one_or_none()
                                if so:
                                    so.estado = recalculate_sale_order_state(so, db)
                                    so.updated_at = now

                                rem_lib -= take_res

            q.status = "LIBERADO"
        else:
            q.status = action

        q.resolved_at = now
        q.resolved_by = getattr(user, "email", str(getattr(user, "id", "system")))
        if body.notes:
            q.notes = f"{q.notes or ''}\nResolución: {body.notes}".strip()

        db.flush()

        sku_code = q.sku.sku if q.sku else None
        prod_name = q.sku.product.name if (q.sku and q.sku.product) else None
        wh_name = q.warehouse.name if q.warehouse else None

        resp_data = {
            "id": q.id,
            "sku_id": q.sku_id,
            "sku": sku_code,
            "product_name": prod_name,
            "warehouse_id": q.warehouse_id,
            "warehouse_name": wh_name,
            "gr_line_id": q.gr_line_id,
            "quantity": str(q.quantity),
            "owner": q.owner,
            "reason": q.reason,
            "status": q.status,
            "notes": q.notes,
            "created_at": q.created_at.isoformat() if q.created_at else None,
            "resolved_at": q.resolved_at.isoformat() if q.resolved_at else None,
            "resolved_by": q.resolved_by,
        }

        _finish_idempotent_operation(
            db=db,
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            entity_id=q.id,
            response_data=resp_data,
            now=now,
        )
        db.commit()

        return {
            "status": "success",
            "message": f"Cuarentena {quarantine_id} resuelta como {q.status}",
            "data": resp_data,
            "idempotency_key": client_key,
        }
    except HTTPException as he:
        db.rollback()
        _mark_failed_external(
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(getattr(he, "detail", he))[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="CUARENTENA",
            user_id=getattr(user, "id", None),
        )
        raise
    except Exception as exc:
        db.rollback()
        _mark_failed_external(
            op_type="RESOLVER_CUARENTENA",
            client_key=client_key,
            exec_token=exec_token,
            error=str(exc)[:2000],
            now=now,
            request_hash=req_hash,
            request_body=payload_for_hash,
            entity_type="CUARENTENA",
            user_id=getattr(user, "id", None),
        )
        raise HTTPException(500, f"Error al resolver cuarentena: {exc}")
