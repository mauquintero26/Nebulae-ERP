"""Existencias calculadas en un solo lugar (Bloque 4, T1C; R10 y C11).

La usan (desde T13) /inventory/stock-tabla, /inventory/stats, /inventory/analisis y _calculate_sku_availability (que
delegara en disponibilidad_sku y conservara sus nueve claves). /stock-summary no se reescribe: su transito mejora a
traves de _calculate_sku_availability. Sin FastAPI; solo LEE. StockReplenishmentRule no se usa (R10).

Las reglas (las mismas fuentes y filtros que _calculate_sku_availability de erp_inventario.py):
- fisico = InventoryLevel.quantity (la suma, por si un par SKU-bodega tuviera mas de una fila);
- reservado = reservas ACTIVE no vencidas (expires_at NULL o posterior a ahora);
- cuarentena = InventoryQuarantine en ACTIVO (no se resta del fisico: nunca entro a InventoryLevel);
- disponible por bodega = max(0, fisico − reservado); la fila por SKU suma las bodegas;
- en_transito = Σ(cantidad pedida − recibida) de las lineas de PEC en la etapa activos de R9 (estados_compras: emitido,
  en transito y en bodega; un estado desconocido cuenta como emitido), contado UNA vez por SKU: con por='bodega', cada
  fila trae el transito del SKU (el mismo numero en cada bodega, RP50) y los totales lo suman una sola vez;
- minimo = COALESCE(product_web_listings.alerta_stock_minimo, 5) (minimo_stock: «Cuando lo disponible llega al minimo de
  esa referencia (5 si no se ha definido)»);
- estado_stock: 'agotado' (disponible 0), 'bajo_minimo' (0 < disponible ≤ minimo) o 'abastecido' (disponible > minimo);
- valorizacion = fisico × cost_price (NULL sin costo: la pantalla muestra '—' y un aviso; valor_inventario = «Con el
  costo de compra de cada referencia»);
- los TOTALES (resumen_existencias) excluyen las referencias cuya publicacion tiene rastrear_inventario = false.

Exporta: MINIMO_POR_DEFECTO, ESTADOS_STOCK, estado_stock, consulta_existencias, resumen_existencias y disponibilidad_sku.
"""
from decimal import Decimal

from sqlalchemy import Numeric, case, cast, func, literal, null, or_, select, true, union_all
from sqlalchemy.orm import Session

from app.core.estados_compras import GRUPOS_PEC, cond_estados_pec
from app.core.fechas import ahora_utc
from app.core.ventas_dinero import redondear_peso
from app.models.catalog import Category, Product, ProductSKU, ProductWebListing
from app.models.erp_documents import PurchaseOrderFull
from app.models.fase1b import InventoryOwnerBalance, InventoryReservation, PurchaseOrderLine
from app.models.fase3 import InventoryQuarantine
from app.models.inventory import InventoryLevel, Warehouse

MINIMO_POR_DEFECTO = 5
ESTADOS_STOCK = ("agotado", "bajo_minimo", "abastecido")

RESERVA_ACTIVA = "ACTIVE"
CUARENTENA_ACTIVA = "ACTIVO"
DUENOS = ("NEBULAE", "MAU")
POR = ("sku", "bodega")

_CERO = Decimal("0.00")


def estado_stock(disponible, minimo) -> str:
    """'agotado' (disponible 0 o menos, o sin dato), 'bajo_minimo' (0 < disponible ≤ minimo) o 'abastecido' (disponible
    > minimo). Sin minimo, MINIMO_POR_DEFECTO. Es la misma regla que la columna estado_stock de consulta_existencias."""
    d = disponible if disponible is not None else 0
    m = minimo if minimo is not None else MINIMO_POR_DEFECTO
    if d <= 0:
        return ESTADOS_STOCK[0]
    return ESTADOS_STOCK[1] if d <= m else ESTADOS_STOCK[2]


def _cantidad(valor):
    return cast(valor, Numeric(10, 2))


def _pares(ahora, warehouse_id=None, sku_id=None):
    """Subconsulta (sku_id, warehouse_id, fisico, reservado, cuarentena) por par SKU-bodega: los pares que tienen un nivel
    de inventario, una reserva activa o una cuarentena activa."""
    nivel = select(InventoryLevel.sku_id.label("sku_id"), InventoryLevel.warehouse_id.label("warehouse_id"),
                   _cantidad(func.coalesce(InventoryLevel.quantity, 0)).label("fisico"),
                   _cantidad(literal(0)).label("reservado"), _cantidad(literal(0)).label("cuarentena"))
    reserva = (select(InventoryReservation.sku_id, InventoryReservation.warehouse_id, _cantidad(literal(0)),
                      _cantidad(InventoryReservation.quantity_reserved), _cantidad(literal(0)))
               .where(InventoryReservation.status == RESERVA_ACTIVA,
                      or_(InventoryReservation.expires_at.is_(None), InventoryReservation.expires_at > ahora)))
    cuarentena = (select(InventoryQuarantine.sku_id, InventoryQuarantine.warehouse_id, _cantidad(literal(0)),
                         _cantidad(literal(0)), _cantidad(InventoryQuarantine.quantity))
                  .where(InventoryQuarantine.status == CUARENTENA_ACTIVA))
    partes = []
    for parte, modelo in ((nivel, InventoryLevel), (reserva, InventoryReservation), (cuarentena, InventoryQuarantine)):
        if warehouse_id is not None:
            parte = parte.where(modelo.warehouse_id == warehouse_id)
        if sku_id is not None:
            parte = parte.where(modelo.sku_id == sku_id)
        partes.append(parte)
    u = union_all(*partes).subquery("movimientos_existencias")
    return (select(u.c.sku_id, u.c.warehouse_id, func.sum(u.c.fisico).label("fisico"),
                   func.sum(u.c.reservado).label("reservado"), func.sum(u.c.cuarentena).label("cuarentena"))
            .group_by(u.c.sku_id, u.c.warehouse_id)
            .subquery("pares_existencias"))


def _transito(sku_id=None):
    """Subconsulta (sku_id, en_transito): lo pendiente de las lineas de PEC en la etapa activos (R9), por SKU."""
    pendiente = PurchaseOrderLine.quantity_ordered - PurchaseOrderLine.quantity_received
    q = (select(PurchaseOrderLine.sku_id.label("sku_id"), func.sum(pendiente).label("en_transito"))
         .join(PurchaseOrderFull, PurchaseOrderFull.id == PurchaseOrderLine.pec_id)
         .where(PurchaseOrderLine.sku_id.isnot(None),
                cond_estados_pec(PurchaseOrderFull.estado, GRUPOS_PEC["activos"]),
                PurchaseOrderLine.quantity_ordered > PurchaseOrderLine.quantity_received))
    if sku_id is not None:
        q = q.where(PurchaseOrderLine.sku_id == sku_id)
    return q.group_by(PurchaseOrderLine.sku_id).subquery("transito_existencias")


def consulta_existencias(db: Session, por="sku", warehouse_id=None, categoria_id=None, q=None, *, ahora=None):
    """El Select (sin ejecutar, sin orden ni paginacion: los pone quien llama) de las existencias, con estas columnas:
    sku_id, sku, producto, categoria, bodega, fisico, reservado, disponible, cuarentena, en_transito, precio
    (sale_price), costo (cost_price), valorizacion, minimo, estado_stock, y al final warehouse_id y rastrear_inventario
    (la marca de la publicacion; true sin publicacion), que usan los totales y la tabla por bodega.

    - por='sku' (por defecto): una fila por cada referencia del catalogo (tambien sin existencias: sale 'agotado'), con
      las bodegas sumadas; bodega y warehouse_id son NULL. Con warehouse_id solo se suman las existencias de esa bodega.
    - por='bodega': una fila por par SKU-bodega con nivel, reserva activa o cuarentena activa; con warehouse_id, solo
      esa bodega.
    - categoria_id: Product.category_id; q: el SKU o el nombre del producto (ILIKE, como /stock-summary; en blanco no
      filtra). Otro `por` -> ValueError. `db` no se consulta; `ahora` (UTC sin zona) fija el corte de las reservas."""
    if por not in POR:
        raise ValueError(f"por debe ser 'sku' o 'bodega', no {por!r}")
    ahora = ahora if ahora is not None else ahora_utc()
    pares = _pares(ahora, warehouse_id=warehouse_id)
    transito = _transito()
    disponible_par = func.greatest(_CERO, pares.c.fisico - pares.c.reservado)
    if por == "sku":
        suma = (select(pares.c.sku_id, func.sum(pares.c.fisico).label("fisico"),
                       func.sum(pares.c.reservado).label("reservado"), func.sum(disponible_par).label("disponible"),
                       func.sum(pares.c.cuarentena).label("cuarentena"))
                .group_by(pares.c.sku_id).subquery("existencias_por_sku"))
        fisico = func.coalesce(suma.c.fisico, _CERO)
        reservado = func.coalesce(suma.c.reservado, _CERO)
        disponible = func.coalesce(suma.c.disponible, _CERO)
        cuarentena = func.coalesce(suma.c.cuarentena, _CERO)
        bodega, warehouse = null().label("bodega"), null().label("warehouse_id")
        origen = select().select_from(ProductSKU).outerjoin(suma, suma.c.sku_id == ProductSKU.id)
    else:
        fisico, reservado, cuarentena = pares.c.fisico, pares.c.reservado, pares.c.cuarentena
        disponible = disponible_par
        bodega, warehouse = Warehouse.name.label("bodega"), pares.c.warehouse_id.label("warehouse_id")
        origen = (select().select_from(pares).join(ProductSKU, ProductSKU.id == pares.c.sku_id)
                  .outerjoin(Warehouse, Warehouse.id == pares.c.warehouse_id))
    minimo = func.coalesce(ProductWebListing.alerta_stock_minimo, MINIMO_POR_DEFECTO)
    estado = case((disponible <= 0, ESTADOS_STOCK[0]), (disponible <= minimo, ESTADOS_STOCK[1]), else_=ESTADOS_STOCK[2])
    consulta = (origen
                .outerjoin(Product, Product.id == ProductSKU.product_id)
                .outerjoin(Category, Category.id == Product.category_id)
                .outerjoin(transito, transito.c.sku_id == ProductSKU.id)
                .outerjoin(ProductWebListing, ProductWebListing.sku_id == ProductSKU.id)
                .add_columns(
                    ProductSKU.id.label("sku_id"), ProductSKU.sku.label("sku"), Product.name.label("producto"),
                    Category.name.label("categoria"), bodega,
                    fisico.label("fisico"), reservado.label("reservado"), disponible.label("disponible"),
                    cuarentena.label("cuarentena"), func.coalesce(transito.c.en_transito, _CERO).label("en_transito"),
                    ProductSKU.sale_price.label("precio"), ProductSKU.cost_price.label("costo"),
                    (fisico * ProductSKU.cost_price).label("valorizacion"), minimo.label("minimo"),
                    estado.label("estado_stock"), warehouse,
                    func.coalesce(ProductWebListing.rastrear_inventario, true()).label("rastrear_inventario")))
    if categoria_id is not None:
        consulta = consulta.where(Product.category_id == categoria_id)
    texto = q.strip() if isinstance(q, str) else None
    if texto:
        patron = f"%{texto}%"
        consulta = consulta.where(or_(ProductSKU.sku.ilike(patron), Product.name.ilike(patron)))
    return consulta


def resumen_existencias(db: Session, warehouse_id=None, *, ahora=None) -> dict:
    """Los totales de las existencias por SKU (consulta_existencias por='sku', en UNA consulta), sin las referencias con
    rastrear_inventario = false:
    {skus_total, unidades_fisicas, unidades_reservadas, unidades_disponibles, unidades_en_transito (una vez por SKU),
     valor_inventario_cop (Σ fisico × costo en pesos enteros), skus_sin_costo, skus_agotados, skus_bajo_minimo,
     skus_abastecidos, disponibilidad_pct (disponibles / fisicas × 100 con 1 decimal; None sin fisicas)}.
    Las unidades van en Decimal (como disponibilidad_sku); los conteos y el valor, en int. Con warehouse_id solo cuentan
    las existencias de esa bodega (el transito no tiene bodega: es el de cada SKU)."""
    e = consulta_existencias(db, por="sku", warehouse_id=warehouse_id, ahora=ahora).subquery("existencias")
    c = e.c

    def contar(condicion):
        return func.count(c.sku_id).filter(condicion)

    fila = db.execute(
        select(func.count(c.sku_id), func.coalesce(func.sum(c.fisico), 0), func.coalesce(func.sum(c.reservado), 0),
               func.coalesce(func.sum(c.disponible), 0), func.coalesce(func.sum(c.en_transito), 0),
               func.coalesce(func.sum(c.valorizacion), 0), contar(c.costo.is_(None)),
               contar(c.estado_stock == ESTADOS_STOCK[0]), contar(c.estado_stock == ESTADOS_STOCK[1]),
               contar(c.estado_stock == ESTADOS_STOCK[2]))
        .where(c.rastrear_inventario.is_(True))).one()
    total, fisicas, reservadas, disponibles, transito, valor, sin_costo, agotados, bajo, abastecidos = fila
    fisicas, disponibles = Decimal(str(fisicas)), Decimal(str(disponibles))
    return {
        "skus_total": int(total),
        "unidades_fisicas": fisicas,
        "unidades_reservadas": Decimal(str(reservadas)),
        "unidades_disponibles": disponibles,
        "unidades_en_transito": Decimal(str(transito)),
        "valor_inventario_cop": int(redondear_peso(valor)),
        "skus_sin_costo": int(sin_costo),
        "skus_agotados": int(agotados),
        "skus_bajo_minimo": int(bajo),
        "skus_abastecidos": int(abastecidos),
        "disponibilidad_pct": round(float(disponibles) / float(fisicas) * 100, 1) if fisicas else None,
    }


def disponibilidad_sku(db: Session, sku_id: int, warehouse_id: int, *, ahora=None) -> dict:
    """Las nueve claves de _calculate_sku_availability, en Decimal (RP80): stock_vendible_fisico, stock_reservado,
    stock_disponible, stock_cuarentena, stock_total_bajo_custodia, stock_fisico (= el vendible, por compatibilidad),
    stock_en_transito (el del SKU con la regla de R9, sin bodega), balance_nebulae y balance_mau (InventoryOwnerBalance,
    como hoy). T13 hace que _calculate_sku_availability delegue aqui."""
    ahora = ahora if ahora is not None else ahora_utc()
    pares = _pares(ahora, warehouse_id=warehouse_id, sku_id=sku_id)
    par = db.execute(select(pares.c.fisico, pares.c.reservado, pares.c.cuarentena)).first()
    fisico, reservado, cuarentena = ((Decimal(str(v)) if v is not None else _CERO) for v in (par or (None,) * 3))
    transito = _transito(sku_id=sku_id)
    en_transito = db.scalar(select(transito.c.en_transito))
    saldos = dict(db.execute(
        select(InventoryOwnerBalance.owner, func.coalesce(func.sum(InventoryOwnerBalance.quantity), 0))
        .where(InventoryOwnerBalance.sku_id == sku_id, InventoryOwnerBalance.warehouse_id == warehouse_id,
               InventoryOwnerBalance.owner.in_(DUENOS))
        .group_by(InventoryOwnerBalance.owner)).all())
    return {
        "stock_vendible_fisico": fisico,
        "stock_reservado": reservado,
        "stock_disponible": max(_CERO, fisico - reservado),
        "stock_cuarentena": cuarentena,
        "stock_total_bajo_custodia": fisico + cuarentena,
        "stock_fisico": fisico,
        "stock_en_transito": Decimal(str(en_transito)) if en_transito is not None else _CERO,
        "balance_nebulae": Decimal(str(saldos.get("NEBULAE", 0))),
        "balance_mau": Decimal(str(saldos.get("MAU", 0))),
    }
