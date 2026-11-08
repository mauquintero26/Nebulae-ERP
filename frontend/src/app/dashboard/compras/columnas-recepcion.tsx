/**
 * B4 T16A (TABLA-compras punto 11, KANBAN-logistica punto 5): las columnas de la tabla de recepciones que comparten
 * Compras › Recepciones (compras/recepciones/page.tsx) e Inventario › Recepciones (T19), con sus celdas y los formatos.
 * No es una ruta (como columnas-pec.tsx y comp-nav.ts): no depende de ninguna page.tsx. Cada pantalla arma su lista con
 * columnasRecepcion, pasándole la celda de Acciones con sus propios botones y menú.
 *
 * La tabla (R26, D41): Recepción # (clave, fija a la izquierda), PEC origen, Proveedor (la flexible), Bodega, Fecha,
 * Ítems, Estado (clave), Retraso, Stock y Acciones (fija a la derecha). Por defecto se ven 6: Bodega, Ítems, Retraso y
 * Stock van ocultas (se muestran con «Ajustar tabla»; Retraso lo pide el diseño). A 1024 px con el menú abierto la caja de
 * la tabla deja 704 px (medido en T7 a T15), sin la casilla de selección (Recepciones no selecciona): Recepción # 112 +
 * PEC origen 92 + Proveedor 120 (su piso de R26) + Fecha 92 + Estado 124 + Acciones 156 = 696 (la celda lleva «Abrir conteo», «Confirmar» y el ⋯).
 */
import type { ReactNode } from 'react';
import type { ColumnaTabla } from '@/components/tabla';
import { fechaCorta } from '@/lib/fechas-colombia';
import {
  numeroRecepcion, pecDeRecepcion, proveedorDeRecepcion, esRecepcionPorConfirmar, infoEstadoRecepcion,
} from '@/lib/estados-compras';
import { numeroFinito } from '@/lib/kpis';
import { CHIP, titulosDeOrdenPec } from './columnas-pec';

/**
 * Lo que leen las columnas de una fila de GET /compras/recepciones (el _gr_dict de T12). dias_retraso es del servidor
 * (la recepción contra la entrega estimada del PEC, con un día de tolerancia): las celdas no lo recalculan.
 */
export type FilaColumnasRecepcion = {
  id: number;
  numero?: string | null;
  estado: string;
  pec_id?: number | null;
  pec_numero?: string | null;
  supplier_name?: string | null;
  proveedor_nombre?: string | null;
  warehouse_name?: string | null;
  fecha_recepcion?: string | null;
  created_at?: string | null;
  productos?: unknown[] | null;
  lineas?: unknown[] | null;
  items_count?: number | null;
  stock_actualizado?: boolean | null;
  dias_retraso?: number | null;
};

// m13: el número, el PEC de origen, el proveedor y «por confirmar» son UNA regla (estados-compras.js, con sus casos); aquí se
// reexportan para las pantallas. El chip y los títulos de orden son los de columnas-pec.tsx (m6).
// m6 (medido en el banco): «Entrada manual» necesita 90 px y la columna PEC origen (92 px, R26) deja 68: la tabla dice «Manual»
// (el title y el resto de las pantallas dicen «Entrada manual»).
const pecCorto = (r: FilaColumnasRecepcion) => { const t = pecDeRecepcion(r); return t === 'Entrada manual' ? 'Manual' : t; };
export { numeroRecepcion, pecDeRecepcion, proveedorDeRecepcion, esRecepcionPorConfirmar };
export const titulosDeOrdenRecepcion = titulosDeOrdenPec;
/** Las líneas de la recepción: las que trae la fila, o items_count; 0 si no hay datos (antes se pintaba 1). */
export const lineasDeRecepcion = (r: FilaColumnasRecepcion) => (r.lineas || r.productos || []).length || numeroFinito(r.items_count) || 0;
/** El día de la recepción (la fecha de recepción o, sin ella, la de creación) en Colombia; sin fecha, '—'. */
export const textoFechaRecepcion = (r: FilaColumnasRecepcion) => fechaCorta(r.fecha_recepcion || r.created_at) || '—';
/** El retraso de la recepción en días (dias_retraso del servidor), o 0. */
export const retrasoDeRecepcion = (r: FilaColumnasRecepcion) => Math.max(0, numeroFinito(r.dias_retraso) ?? 0);

/** Estado: la insignia de estados-compras.js (un desconocido sale humanizado; nunca el código crudo). */
export function CeldaEstadoRecepcion({ r }: { r: FilaColumnasRecepcion }) {
  const { label, clases } = infoEstadoRecepcion(r.estado);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}

/** Retraso: 'N días' en rojo si el servidor lo calculó; si no, '—'. */
export function CeldaRetraso({ r }: { r: FilaColumnasRecepcion }) {
  const n = retrasoDeRecepcion(r);
  if (n <= 0) return <span className="text-xs text-slate-400">—</span>;
  return <span className="text-xs font-bold text-rose-700">{n} {n === 1 ? 'día' : 'días'}</span>;
}

/** Stock: 'Sí' si la recepción actualizó el stock; 'Pendiente' si falta confirmarla; '—' en las demás. */
export function CeldaStock({ r }: { r: FilaColumnasRecepcion }) {
  if (r.stock_actualizado) return <span className={`${CHIP} text-[11px] border-emerald-200 bg-emerald-50 text-emerald-700`}>Sí</span>;
  if (esRecepcionPorConfirmar(r)) return <span className={`${CHIP} text-[11px] border-slate-200 bg-slate-50 text-slate-600`}>Pendiente</span>;
  return <span className="text-xs text-slate-400">—</span>;
}

/**
 * Las 10 columnas de una tabla de recepciones, con la celda de Acciones de la pantalla (los botones cambian: Compras lleva
 * «Abrir conteo» y «Confirmar»; Inventario, los suyos). La pantalla la llama una sola vez, como constante del módulo
 * (estable, D40).
 * @param celdaAcciones lo que pinta la celda de Acciones de una fila
 */
export function columnasRecepcion<T extends FilaColumnasRecepcion>(celdaAcciones: (r: T) => ReactNode): ColumnaTabla<T>[] {
  return [
    { id: 'numero', titulo: 'Recepción #', ancho: 112, clave: true, fija: 'izquierda', ordenable: 'numero',
      titleCelda: (r) => numeroRecepcion(r),
      celda: (r) => <span className="block truncate text-xs font-black text-teal-700">{numeroRecepcion(r)}</span> },
    { id: 'pec', titulo: 'PEC origen', ancho: 92, ordenable: 'pec', titleCelda: (r) => pecDeRecepcion(r),
      celda: (r) => <span className="block truncate text-xs font-bold text-purple-700">{pecCorto(r)}</span> },
    { id: 'proveedor', titulo: 'Proveedor', ancho: 120, flexible: true, ordenable: 'proveedor', titleCelda: (r) => proveedorDeRecepcion(r),
      celda: (r) => <span className="block truncate text-xs font-bold text-slate-800">{proveedorDeRecepcion(r)}</span> },
    { id: 'bodega', titulo: 'Bodega', ancho: 120, ocultaPorDefecto: true, ordenable: 'bodega', titleCelda: (r) => r.warehouse_name || 'Sin bodega',
      celda: (r) => <span className="block truncate text-xs text-slate-600">{r.warehouse_name || '—'}</span> },
    { id: 'fecha', titulo: 'Fecha', ancho: 92, ordenable: 'fecha', titleCelda: (r) => textoFechaRecepcion(r),
      celda: (r) => <span className="text-xs text-slate-600">{textoFechaRecepcion(r)}</span> },
    { id: 'items', titulo: 'Ítems', ancho: 64, alinear: 'centro', ocultaPorDefecto: true, titleCelda: (r) => String(lineasDeRecepcion(r)),
      celda: (r) => <span className="text-xs font-bold text-slate-700">{lineasDeRecepcion(r) || '—'}</span> },
    { id: 'estado', titulo: 'Estado', ancho: 124, clave: true, ordenable: 'estado', titleCelda: (r) => infoEstadoRecepcion(r.estado).label,
      celda: (r) => <CeldaEstadoRecepcion r={r} /> },
    { id: 'retraso', titulo: 'Retraso', ancho: 84, ocultaPorDefecto: true, ordenable: 'retraso',
      titleCelda: (r) => (retrasoDeRecepcion(r) > 0 ? `${retrasoDeRecepcion(r)} días de retraso` : 'Sin retraso'),
      celda: (r) => <CeldaRetraso r={r} /> },
    { id: 'stock', titulo: 'Stock', ancho: 76, alinear: 'centro', ocultaPorDefecto: true, celda: (r) => <CeldaStock r={r} /> },
    { id: 'acciones', titulo: 'Acciones', ancho: 156, clave: true, fija: 'derecha', celda: celdaAcciones },
  ];
}
