"""El flujo de Compras en el servidor: los números de la franja «Flujo de compras» (GET /compras/flujo).

Bloque 4, T12 (FLUJO-compras puntos 1 y 2; R9, C16; RP40, RP42, RP46, D42). La misma forma que resumen_flujo_ventas
(core/resolucion_ventas.py), para que lib/flujo.js (conteosDePasos) la lea igual:

    {'pasos': {paso: {'total', 'atrasados', 'mas_antiguo_dias', 'por_estado'}} (en el orden de PASOS_FLUJO_COMPRAS),
     'semaforo': {'atrasados', 'no_resueltos'}, 'criterio_atraso': 'fecha_entrega', 'generado_at'}

- Los pasos y el paso de cada estado son los de core/estados_compras.py (PASOS_FLUJO_COMPRAS y paso_flujo_pec; T1C): no
  hay aquí otro mapa de estados (R27). PEC = borrador + emitido (un estado desconocido cuenta como emitido); TRANSITO =
  en tránsito; RECEPCION = la etapa en_bodega (RECIBIDO y PARCIALMENTE_RECIBIDA), que además trae
  recepciones_por_confirmar (RP46: las GoodsReceipt en BORRADOR, para el aviso «N recepciones por confirmar» que arma el
  frontend); RECIBIDO = la recepción confirmada; un CANCELADO no está en ningún paso.
- LISTA: los ítems PENDIENTE de la Lista de compras, sin los de pedidos de venta cancelados (RP42), leídos SIN
  sincronizar: _load_lista_compras y _sin_items_de_pedidos_cancelados solo leen; _sincronizar_pvens_pendientes_a_lista
  y _save_lista_compras escriben y aquí no se llaman. Un PVEN nuevo que todavía no pasó a la Lista (pasa al abrir Lista
  de compras) no se cuenta hasta entonces.
- atrasados (RP40): solo en PEC y TRANSITO, con cond_vencido (emitido o en tránsito con el día de entrega anterior a hoy
  en Colombia, sin días de tolerancia: compras_atraso = «Cuando ya pasó la fecha de entrega estimada»). Un PEC en
  bodega o recibido nunca está atrasado: en LISTA, RECEPCION y RECIBIDO va None (no hay regla de atraso).
- mas_antiguo_dias: el piso de los días desde la fecha más vieja del paso (COALESCE(fecha_compra, created_at) en PEC,
  TRANSITO y RECEPCION, RP46; la fecha del ítem en LISTA); None si el paso está vacío, y siempre en RECIBIDO (cerrado).
- semaforo.atrasados = PEC + TRANSITO; semaforo.no_resueltos = PEC + TRANSITO + RECEPCION (lo que falta por cerrar; la
  franja de Compras no tiene ese botón, D42, pero el dato va como en Ventas).

Solo lee: ningún INSERT, UPDATE ni commit. Hace cuatro consultas como mucho, sin importar cuántos documentos haya.
"""
import math
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.analisis_compras import fecha_de_compra
from app.core.estados_compras import PASOS_FLUJO_COMPRAS, cond_vencido, paso_flujo_pec
from app.core.fechas import ahora_utc, hoy_colombia, iso_z
from app.models.erp_documents import GoodsReceipt, PurchaseOrderFull

CRITERIO_ATRASO = "fecha_entrega"
PASOS_CON_ATRASO = ("PEC", "TRANSITO")
PASOS_SIN_ANTIGUEDAD = ("RECIBIDO",)
ESTADO_ITEM_POR_COMPRAR = "PENDIENTE"
ESTADO_RECEPCION_POR_CONFIRMAR = "BORRADOR"


def _dias_desde(ahora: datetime, desde) -> int | None:
    if desde is None:
        return None
    return max(0, math.floor((ahora - desde).total_seconds() / 86400))


def _fecha_del_item(item) -> datetime | None:
    """La fecha de un ítem de la Lista (un ISO de UTC sin zona, como lo guarda erp_compras), o None si no se lee."""
    texto = item.get("fecha") if isinstance(item, dict) else None
    if not isinstance(texto, str) or not texto.strip():
        return None
    try:
        fecha = datetime.fromisoformat(texto.strip().replace("Z", "+00:00"))
    except ValueError:
        return None
    return fecha if fecha.tzinfo is None else fecha.astimezone(timezone.utc).replace(tzinfo=None)


def _paso_lista(db: Session, ahora: datetime) -> dict:
    # Import en la función: erp_compras importa este módulo (GET /compras/flujo) y es el dueño de la Lista de compras.
    from app.api.v1.erp_compras import _load_lista_compras, _sin_items_de_pedidos_cancelados
    items = [it for it in _sin_items_de_pedidos_cancelados(db, _load_lista_compras(db))
             if isinstance(it, dict) and it.get("estado") == ESTADO_ITEM_POR_COMPRAR]
    fechas = [f for f in (_fecha_del_item(it) for it in items) if f is not None]
    return {"total": len(items), "atrasados": None, "mas_antiguo_dias": _dias_desde(ahora, min(fechas, default=None)),
            "por_estado": {ESTADO_ITEM_POR_COMPRAR: len(items)}}


def resumen_flujo_compras(db: Session, ahora: datetime | None = None) -> dict:
    """Los números del diagrama del flujo de Compras sobre TODOS los pedidos de compra (solo lectura; ver el docstring
    del módulo). `ahora` (UTC sin zona) fija el instante en las pruebas: de él salen hoy en Colombia (hoy_colombia), los
    días de antigüedad y generado_at."""
    ahora = ahora if ahora is not None else ahora_utc()
    hoy = hoy_colombia(ahora)
    pec = PurchaseOrderFull
    filas = (db.query(pec.estado, func.count(pec.id),
                      func.count(pec.id).filter(cond_vencido(pec.estado, pec.fecha_entrega_estimada, hoy)),
                      func.min(fecha_de_compra()))
             .group_by(pec.estado).all())
    pasos = {"LISTA": _paso_lista(db, ahora)}
    acumulado = {paso: {"total": 0, "atrasados": 0, "minimo": None, "por_estado": {}}
                 for paso in PASOS_FLUJO_COMPRAS if paso != "LISTA"}
    for estado, n, vencidos, minimo in filas:
        paso = paso_flujo_pec(estado)
        if paso is None:        # cancelado
            continue
        a = acumulado[paso]
        a["total"] += int(n)
        a["atrasados"] += int(vencidos or 0)
        a["por_estado"][estado] = int(n)
        if minimo is not None and (a["minimo"] is None or minimo < a["minimo"]):
            a["minimo"] = minimo
    por_confirmar = (db.query(func.count(GoodsReceipt.id))
                     .filter(GoodsReceipt.estado == ESTADO_RECEPCION_POR_CONFIRMAR).scalar())
    for paso, a in acumulado.items():
        pasos[paso] = {
            "total": a["total"],
            "atrasados": a["atrasados"] if paso in PASOS_CON_ATRASO else None,
            "mas_antiguo_dias": None if paso in PASOS_SIN_ANTIGUEDAD else _dias_desde(ahora, a["minimo"]),
            "por_estado": a["por_estado"],
        }
    pasos["RECEPCION"]["recepciones_por_confirmar"] = int(por_confirmar or 0)
    pasos = {paso: pasos[paso] for paso in PASOS_FLUJO_COMPRAS}
    return {
        "pasos": pasos,
        "semaforo": {"atrasados": sum(pasos[p]["atrasados"] for p in PASOS_CON_ATRASO),
                     "no_resueltos": sum(pasos[p]["total"] for p in ("PEC", "TRANSITO", "RECEPCION"))},
        "criterio_atraso": CRITERIO_ATRASO,
        "generado_at": iso_z(ahora),
    }
