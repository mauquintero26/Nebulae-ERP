/**
 * B4 T16B (TABLA-compras punto 11, KANBAN-logistica punto 5): las columnas de la tabla de traslados que comparten
 * Compras › Traslados (compras/traslados/page.tsx) e Inventario › Traslados (T19), con sus celdas. No es una ruta (como
 * columnas-pec.tsx y columnas-recepcion.tsx): no depende de ninguna page.tsx. Cada pantalla arma su lista con
 * columnasTraslado, pasándole la celda de Acciones con su propio menú, y envuelve la tabla en BodegasTraslado.Provider con
 * las bodegas (GET /inventory/warehouses): la fila solo trae los ids, y las columnas son una constante (estable, D40) que no
 * puede depender de un dato que llega después, así que las celdas de bodega leen el contexto.
 *
 * La tabla (R26, D41): Traslado # (clave, fija a la izquierda), Origen (la flexible), Destino, Productos, Fecha, Estado
 * (clave) y Acciones (fija a la derecha, solo el ⋯: «Ver detalle» pasó a MenuFila). Sin casilla de selección (los traslados
 * no se seleccionan). A 1024 px con el menú abierto la caja de la tabla deja 704 px (medido en T7 a T16A): Traslado # 104 +
 * Origen 130 (flexible, su piso es 120) + Destino 130 + Productos 76 + Fecha 92 + Estado 96 + Acciones 52 = 680.
 * La Fecha es la REAL del traslado (`fecha`: el primer movimiento, un instante; antes salía siempre «-»).
 */
'use client';

import { createContext, useContext } from 'react';
import type { ReactNode } from 'react';
import type { ColumnaTabla } from '@/components/tabla';
import {
  infoEstadoTraslado, nombreBodega, numeroTraslado, productosDeTraslado, textoFechaTraslado,
} from '@/lib/estados-compras';
import { CHIP, titulosDeOrdenPec } from './columnas-pec';

/** Una bodega de GET /inventory/warehouses (lo que leen las celdas). */
export type BodegaTraslado = { id: number; name?: string | null };

/**
 * Lo que leen las columnas de una fila de GET /inventory/operations (InventoryOperationResponse + `fecha`, T13). Una fila
 * trae los ids de las bodegas, nunca sus nombres.
 */
export type FilaColumnasTraslado = {
  id: number;
  status?: string | null;
  source_warehouse_id?: number | null;
  dest_warehouse_id?: number | null;
  movements?: { direction?: string | null; sku_id?: number | null; quantity?: number | null }[] | null;
  fecha?: string | null;
  tracking_number?: string | null;
};

/** Las bodegas de la pantalla (null mientras llegan o si fallaron: las celdas dicen «Bodega #id»). */
export const BodegasTraslado = createContext<ReadonlyArray<BodegaTraslado> | null>(null);

export { numeroTraslado, productosDeTraslado, textoFechaTraslado };
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
export const titulosDeOrdenTraslado = titulosDeOrdenPec;

/** Estado: la insignia de estados-compras.js (un desconocido sale humanizado; nunca el código crudo). */
export function CeldaEstadoTraslado({ t }: { t: FilaColumnasTraslado }) {
  const { label, clases } = infoEstadoTraslado(t.status);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}

/** Origen o destino: el nombre de la bodega (del contexto); si no llegó, «Bodega #id». */
export function CeldaBodega({ id }: { id: number | null | undefined }) {
  const nombre = nombreBodega(useContext(BodegasTraslado), id);
  return <span className="block truncate text-sm font-medium text-slate-800">{nombre}</span>;
}

/**
 * Las 7 columnas de una tabla de traslados, con la celda de Acciones de la pantalla (Compras lleva «Ver detalle»; Inventario,
 * lo suyo). La pantalla la llama una sola vez, como constante del módulo (estable, D40).
 * @param celdaAcciones lo que pinta la celda de Acciones de una fila
 */
export function columnasTraslado<T extends FilaColumnasTraslado>(celdaAcciones: (t: T) => ReactNode): ColumnaTabla<T>[] {
  return [
    { id: 'numero', titulo: 'Traslado #', ancho: 104, clave: true, fija: 'izquierda', ordenable: 'id', titleCelda: (t) => numeroTraslado(t),
      celda: (t) => <span className="block truncate text-xs font-black text-orange-700">{numeroTraslado(t)}</span> },
    { id: 'origen', titulo: 'Origen', ancho: 130, flexible: true, ordenable: 'origen', celda: (t) => <CeldaBodega id={t.source_warehouse_id} /> },
    { id: 'destino', titulo: 'Destino', ancho: 130, ordenable: 'destino', celda: (t) => <CeldaBodega id={t.dest_warehouse_id} /> },
    { id: 'productos', titulo: 'Productos', ancho: 76, alinear: 'centro', titleCelda: (t) => `${productosDeTraslado(t)} producto(s)`,
      celda: (t) => <span className="text-xs font-bold text-slate-700">{productosDeTraslado(t)}</span> },
    { id: 'fecha', titulo: 'Fecha', ancho: 92, ordenable: 'fecha', titleCelda: (t) => textoFechaTraslado(t),
      celda: (t) => <span className="text-xs text-slate-600">{textoFechaTraslado(t)}</span> },
    { id: 'estado', titulo: 'Estado', ancho: 96, clave: true, ordenable: 'status', titleCelda: (t) => infoEstadoTraslado(t.status).label,
      celda: (t) => <CeldaEstadoTraslado t={t} /> },
    { id: 'acciones', titulo: 'Acciones', ancho: 52, clave: true, fija: 'derecha', celda: celdaAcciones },
  ];
}
