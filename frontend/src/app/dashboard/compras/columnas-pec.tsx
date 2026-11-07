/**
 * B4 T15 r1 (m3, m11): las columnas de los pedidos de compra que comparten el Hub de Compras (compras/page.tsx, T14) y
 * Pedidos de compra (compras/pedidos/page.tsx, T15), con sus celdas, la clase de la fila vencida y los formatos de
 * monto y fecha. No es una ruta (como comp-nav.ts): cada pantalla arma su lista con columnasPec, pasándole la celda de
 * Acciones con su propio menú.
 *
 * La tabla (TABLA-compras puntos 6 y 7; R26, D41): la casilla (la de TablaEstandar), PEC / PVEN (clave, fija a la
 * izquierda, con el chip Vencido), Proveedor (la flexible), Comprador, Monto, F. compra, Entrega est., Límite alerta,
 * Estado (clave) y Acciones (fija a la derecha). Sin la columna Total, que repetía el Monto. Comprador, F. compra y
 * Límite alerta van ocultas por defecto (R26; se muestran con «Ajustar tabla»). A 1024 px con el menú abierto la caja de
 * la tabla deja 704 px (medido en T7 a T15): Proveedor en su piso de R26 (120), Monto 108 (cabe hasta $99.999.999),
 * Estado 120 y Acciones 80 (el ojo, 26 px, y el ⋯, 28 px, no caben en los 48 px que dejan 72 con el relleno de la
 * celda). 40 + 132 + 120 + 108 + 104 + 120 + 80 = 704.
 */
import type { ReactNode } from 'react';
import { CLASE_CHIP } from '@/components/ui';
import type { ColumnaTabla } from '@/components/tabla';
import { TABLE } from '@/lib/design-system';
import { formatoPesos } from '@/lib/pesos';
import { fechaCorta } from '@/lib/fechas-colombia';
import { campoOrden } from '@/lib/tabla';
import { diaPec, infoEstadoPec } from '@/lib/estados-compras';

// H42: pesos enteros con punto de miles; lo que no es un monto positivo se ve '—'.
export const fCOP = (v: unknown) => (Number(v) > 0 ? formatoPesos(v) : '—');
// Resolución 4 (T14 y T15): un instante del API (fecha de compra, creado, Actividad, etapas, guías) en el día de
// Colombia; un día de negocio (entrega estimada, límite de alerta, la ETA de una etapa) tal como se guarda (diaPec,
// RP40), sin correrlo. Lo vacío, '—'.
export const textoInstante = (v: unknown) => fechaCorta(v) || '—';
export const textoDia = (v: unknown) => fechaCorta(diaPec(v)) || '—';

/**
 * Lo que leen las columnas de una fila de GET /compras/pedidos (el _pec_dict de T12). is_overdue es la regla del
 * servidor (RP40: emitido o en tránsito con la entrega pasada): las celdas no la recalculan.
 */
export type FilaColumnasPec = {
  id: number;
  numero: string;
  estado: string;
  supplier_name?: string | null;
  ven_numero?: string | null;
  created_by?: string | null;
  total_cop?: number | null;
  fecha_compra?: string | null;
  created_at?: string | null;
  fecha_entrega_estimada?: string | null;
  fecha_alerta?: string | null;
  is_overdue?: boolean;
};

// El chip estándar de las tablas del bloque con los tintes del tablero (CLASE_CHIP): la misma marca en Lista y en
// Kanban. Sin tamaño de letra: cada uso pone el suyo.
const CHIP = 'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 font-bold leading-tight';
// D41: la fila vencida en el tono opaco filaAlerta, con la marca rosa a la izquierda del Hub de Ventas (antes un borde
// rojo y un tinte translúcido, que dejaba ver lo de debajo de las columnas fijas).
const MARCA_VENCIDO = '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-rose-500)]';

/** La clase de la fila (claseFila de TablaEstandar): la vencida en filaAlerta con la marca rosa; las demás, la de siempre. */
export const claseDeFilaPec = (p: FilaColumnasPec) => (p.is_overdue ? `${TABLE.filaAlerta} ${MARCA_VENCIDO}` : null);

/** PEC / PVEN: el número, el pedido de venta de origen y el chip «Vencido» (is_overdue del servidor, RP40). */
export function CeldaNumero({ p }: { p: FilaColumnasPec }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <span className="max-w-full truncate text-xs font-black text-purple-700">{p.numero}</span>
      {p.ven_numero && <span className="max-w-full truncate text-[10px] font-bold text-indigo-600">{p.ven_numero}</span>}
      {p.is_overdue && <span className={`${CHIP} text-[10px] ${CLASE_CHIP.rose}`}>Vencido</span>}
    </span>
  );
}

/** Estado: la insignia de estados-compras.js (un heredado sale humanizado, nunca «Borrador»; C10). */
export function CeldaEstado({ p }: { p: FilaColumnasPec }) {
  const { label, clases } = infoEstadoPec(p.estado);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}

/** Entrega est.: el día de negocio tal como se guarda (RP40), en rojo si el servidor dice que está vencido. */
export function CeldaEntrega({ p }: { p: FilaColumnasPec }) {
  return <span className={`text-xs ${p.is_overdue ? 'font-bold text-rose-700' : 'text-slate-700'}`}>{textoDia(p.fecha_entrega_estimada)}</span>;
}

/**
 * Las 9 columnas de una tabla de pedidos de compra, con la celda de Acciones de la pantalla (su menú cambia: el Hub
 * lleva «Ver en Pedidos de compra»; Pedidos de compra, «Marcar Emitido» y «Eliminar definitivamente»). La pantalla la
 * llama una sola vez, como constante del módulo (estable, D40).
 * @param celdaAcciones lo que pinta la celda de Acciones de una fila
 */
export function columnasPec<T extends FilaColumnasPec>(celdaAcciones: (p: T) => ReactNode): ColumnaTabla<T>[] {
  return [
    { id: 'numero', titulo: 'PEC / PVEN', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero',
      titleCelda: (p) => [p.numero, p.ven_numero, p.is_overdue ? 'Vencido' : null].filter(Boolean).join(' · '),
      celda: (p) => <CeldaNumero p={p} /> },
    { id: 'proveedor', titulo: 'Proveedor', ancho: 120, flexible: true, ordenable: 'proveedor',
      titleCelda: (p) => p.supplier_name || 'Sin proveedor',
      celda: (p) => <span className="block truncate text-xs font-bold text-slate-800">{p.supplier_name || '—'}</span> },
    { id: 'comprador', titulo: 'Comprador', ancho: 120, ocultaPorDefecto: true, ordenable: 'comprador',
      titleCelda: (p) => p.created_by || 'Sin comprador',
      celda: (p) => <span className="block truncate text-xs text-slate-600">{p.created_by || '—'}</span> },
    { id: 'monto', titulo: 'Monto', ancho: 108, alinear: 'derecha', ordenable: 'monto', titleCelda: (p) => fCOP(p.total_cop),
      celda: (p) => <span className="block truncate text-xs font-black text-slate-900">{fCOP(p.total_cop)}</span> },
    // T14 r1 (m13): sin fecha de compra, la celda muestra la de creación (como antes) y su title lo dice; el separador
    // por mes la pone en «Sin fecha de compra» (el servidor ordena por fecha_compra).
    { id: 'compra', titulo: 'F. compra', ancho: 96, ocultaPorDefecto: true, ordenable: 'compra',
      titleCelda: (p) => (p.fecha_compra ? textoInstante(p.fecha_compra)
        : p.created_at ? 'Fecha de creación (sin fecha de compra)' : 'Sin fecha de compra'),
      celda: (p) => <span className="text-xs text-slate-600">{textoInstante(p.fecha_compra || p.created_at)}</span> },
    { id: 'entrega', titulo: 'Entrega est.', ancho: 104, ordenable: 'entrega',
      titleCelda: (p) => `${textoDia(p.fecha_entrega_estimada)}${p.is_overdue ? ' · Vencido' : ''}`, celda: (p) => <CeldaEntrega p={p} /> },
    { id: 'limite', titulo: 'Límite alerta', ancho: 104, ocultaPorDefecto: true, ordenable: 'limite',
      titleCelda: (p) => textoDia(p.fecha_alerta),
      celda: (p) => <span className="text-xs text-slate-600">{textoDia(p.fecha_alerta)}</span> },
    { id: 'estado', titulo: 'Estado', ancho: 120, clave: true, ordenable: 'estado', titleCelda: (p) => infoEstadoPec(p.estado).label,
      celda: (p) => <CeldaEstado p={p} /> },
    { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: celdaAcciones },
  ];
}

/** {campo de orden: título}, para el chip «Orden: Monto ↓» (textoOrdenHub), solo de las columnas que se ordenan. */
export function titulosDeOrdenPec<T>(columnas: ReadonlyArray<ColumnaTabla<T>>): Record<string, string> {
  return Object.fromEntries(columnas.flatMap((c) => { const campo = campoOrden(c); return campo ? [[campo, c.titulo]] : []; }));
}
