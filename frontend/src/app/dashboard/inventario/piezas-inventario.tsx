'use client';
import React, { useCallback, useEffect, useState } from 'react';
import { Archive } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
// B4 T18: las piezas que comparten Stock, Abastecimiento, Kardex y Productos (el tipo de una existencia y sus celdas, el
// detalle, y los selectores de un catálogo con su error y «Reintentar»). El Hub de Inventario (T17) trae las suyas dentro de
// su page.tsx (una página de Next no puede exportar más que su componente); aquí no se tocan.
import { Modal } from '@/components/ui';
import { apiFetch } from '@/lib/api';
import { FOCOS, TABLE, type AcentoFoco } from '@/lib/design-system';
import { formatoPesos } from '@/lib/pesos';
import { tiene } from '@/lib/estados-pedido';
import { formatoDecimal, numeroFinito } from '@/lib/kpis';
import { ESTADOS_STOCK, existenciaReservada } from '@/lib/estados-compras';
import { ofreceReintentar, textoDeError } from '@/lib/avisos';
// El chip estándar de las tablas del bloque (columnas-pec.tsx, T15 r1): la misma forma que el estado de un PEC.
import { CHIP } from '../compras/columnas-pec';

/**
 * Una fila de GET /inventory/stock-tabla (T13, core/existencias.py): un SKU (por=sku: bodega y warehouse_id en null, con las
 * bodegas sumadas) o un par SKU y bodega (por=bodega). disponible = físico − reservado (nunca negativo); en_transito es el del
 * SKU (no se suma por fila, RP50); valorizacion = físico × costo, null sin costo. Los nombres son los del servidor.
 */
export type FilaExistencia = {
  sku_id: number;
  sku: string;
  producto?: string | null;
  categoria?: string | null;
  bodega?: string | null;
  warehouse_id?: number | null;
  fisico?: number | null;
  reservado?: number | null;
  disponible?: number | null;
  cuarentena?: number | null;
  en_transito?: number | null;
  precio?: number | null;
  costo?: number | null;
  valorizacion?: number | null;
  minimo?: number | null;
  estado_stock?: string | null;
  rastrear_inventario?: boolean | null;
};
/** `conteos` de stock-tabla con con_conteos=1: filas con la búsqueda y los filtros, sin la pestaña (D-4 de T13). */
export type ConteosStock = Partial<Record<'todos' | 'agotados' | 'bajo_minimo' | 'abastecidos' | 'con_fisico', number>>;
/** Una bodega de GET /inventory/warehouses o una categoría de GET /categories. */
export type OpcionCatalogo = { id: number; name: string; parent_id?: number | null };
/** Un catálogo: filas null mientras carga; si falla, el error (y lo último que llegó bien, si había). */
export type Catalogo = { filas: OpcionCatalogo[] | null; error: unknown };

/** El contenedor de los Hubs y de las listas del bloque (T7 a T17): pb-24 deja libre la esquina del botón de la IA. */
export const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';
/** B4 T24 (FINAL-m25): el foco visible es el token común de design-system.ts (una sola copia); se reexporta para quien lo importa de aquí. */
export { FOCOS };
export type { AcentoFoco };

// H42: pesos enteros con punto de miles; lo que no llega, '—'. Las cantidades sin redondear ('2,5').
export const pesos = (v: unknown) => (numeroFinito(v) === null ? '—' : formatoPesos(v));
export const cantidad = (v: unknown) => formatoDecimal(v);
/** RP53: la etiqueta, el tono y las clases de ESTADOS_STOCK (estados-compras.js); un estado desconocido, null. */
export const infoStock = (e: unknown) => (typeof e === 'string' && tiene(ESTADOS_STOCK, e) ? ESTADOS_STOCK[e as keyof typeof ESTADOS_STOCK] : null);
/** La clave de la fila (la selección, React y el tablero): el SKU y, por bodega, su bodega. */
export const claveDeFilaExistencia = (f: FilaExistencia) => `${f.sku_id}-${f.warehouse_id ?? 'sku'}`;
/**
 * D41: tonos opacos de TABLE. Agotada en filaAlerta, bajo el mínimo en filaAviso, y la que no lleva control de inventario,
 * apagada.
 */
export const claseDeFilaExistencia = (f: FilaExistencia) => (f.rastrear_inventario === false ? TABLE.filaApagada
  : f.estado_stock === 'agotado' ? TABLE.filaAlerta : f.estado_stock === 'bajo_minimo' ? TABLE.filaAviso : null);
/** R10: una referencia con rastrear_inventario = false sale en la tabla, pero no suma en los totales. */
export const TEXTO_SIN_SEGUIMIENTO = 'No lleva control de inventario (su publicación tiene «rastrear inventario» apagado): no suma en los totales.';

/** Producto: el nombre y, si no lleva control de inventario, la marca «Sin seguimiento». */
export function CeldaProducto({ f }: { f: FilaExistencia }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <span className="max-w-full truncate text-xs font-bold text-slate-800">{f.producto || '—'}</span>
      {f.rastrear_inventario === false && (
        <span className={`${CHIP} border-slate-300 bg-slate-100 text-[10px] text-slate-700`}>Sin seguimiento</span>
      )}
    </span>
  );
}

/** Estado: la insignia de ESTADOS_STOCK («Agotado», «Bajo el mínimo» o «Bien abastecido», con su tono). */
export function CeldaEstadoStock({ f }: { f: FilaExistencia }) {
  const info = infoStock(f.estado_stock);
  if (!info) return <span className="text-xs text-slate-500">—</span>;
  return <span className={`${CHIP} text-[11px] ${info.clases.bg} ${info.clases.text} ${info.clases.border}`}>{info.label}</span>;
}

/**
 * Estado de la tabla de Stock (T18 r1, m24): la insignia de siempre y, debajo, «Reservado» si hay unidades en bodega y nada
 * disponible (existenciaReservada): lo que BASE mostraba en lugar de «Agotado» para una referencia comprometida por completo.
 */
export function CeldaEstadoExistencia({ f }: { f: FilaExistencia }) {
  return (
    <span className="flex flex-col items-start gap-0.5">
      <CeldaEstadoStock f={f} />
      {existenciaReservada(f) && <span className={`${CHIP} border-amber-200 bg-amber-100 text-[10px] text-amber-800`}>Reservado</span>}
    </span>
  );
}

/**
 * Una fuente de indicadores que falló (T18 r1, m11): lo dice con el detalle del servidor y ofrece «Reintentar» (que vuelve a pedir
 * SOLO esa fuente), en lugar de dejar solo «—» en las tarjetas.
 */
export function AvisoReintentar({ error, fallo, onReintentar, acento = 'indigo' }: { error: unknown; fallo: string; onReintentar: () => void; acento?: AcentoFoco }) {
  return (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
      {textoDeError(error, fallo)}
      <button type="button" onClick={onReintentar}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCOS[acento]}`}>
        Reintentar
      </button>
    </div>
  );
}

/**
 * El detalle de una existencia (un clic en la fila o en la tarjeta): los datos reales de la fila, con Modal de components/ui.
 * En una fila por SKU (Stock y Abastecimiento) las bodegas van sumadas.
 */
export function DetalleExistencia({ f, onCerrar, color = 'indigo' }: { f: FilaExistencia; onCerrar: () => void; color?: 'indigo' | 'emerald' }) {
  const info = infoStock(f.estado_stock);
  const lineas: [string, string][] = [
    ['Cuarentena', cantidad(f.cuarentena)],
    ['En tránsito (del SKU, en todas las bodegas)', cantidad(f.en_transito)],
    ['Mínimo de la referencia', cantidad(f.minimo)],
    ['Precio de venta', pesos(f.precio)],
    ['Costo', numeroFinito(f.costo) !== null && Number(f.costo) > 0 ? pesos(f.costo) : 'Sin costo registrado'],
    ['Valorización (físico × costo)', numeroFinito(f.valorizacion) === null ? 'Sin costo registrado' : pesos(f.valorizacion)],
    ['Estado', info?.label ?? '—'],
  ];
  return (
    <Modal title={f.producto || f.sku} subtitle={[f.sku, f.categoria, f.bodega].filter(Boolean).join(' · ')} icon={Archive}
      color={color} onClose={onCerrar} footer={(
        <button type="button" onClick={onCerrar}
          className={`rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 ${FOCOS.indigo}`}>Cerrar</button>
      )}>
      <div className="grid grid-cols-3 gap-3">
        {([['Físico', f.fisico, 'border-slate-100 bg-slate-50 text-slate-900'], ['Reservado', f.reservado, 'border-amber-100 bg-amber-50 text-amber-800'],
          ['Disponible', f.disponible, 'border-emerald-100 bg-emerald-50 text-emerald-800']] as const).map(([titulo, valor, clases]) => (
          <div key={titulo} className={`rounded-xl border p-3 text-center ${clases}`}>
            <span className="text-[10px] font-black uppercase">{titulo}</span>
            <p className="text-xl font-black">{cantidad(valor)}</p>
          </div>
        ))}
      </div>
      <dl className="space-y-2 text-xs">
        {lineas.map(([titulo, valor]) => (
          <div key={titulo} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
            <dt className="text-slate-600">{titulo}</dt>
            <dd className="text-right font-bold text-slate-900">{valor}</dd>
          </div>
        ))}
      </dl>
      {f.rastrear_inventario === false && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">{TEXTO_SIN_SEGUIMIENTO}</p>
      )}
    </Modal>
  );
}

/**
 * Un catálogo del servidor (las bodegas, las categorías, las marcas): `{catalogo, recargar}`. Mientras carga, filas null; si
 * falla, el error SE CONSERVA (con lo último bueno, si había) y `recargar` vuelve a pedir: nunca una lista vacía falsa.
 */
export function useCatalogo(ruta: string): { catalogo: Catalogo; recargar: () => void } {
  const [vuelta, setVuelta] = useState(0);
  const [catalogo, setCatalogo] = useState<Catalogo>({ filas: null, error: null });
  useEffect(() => {
    const control = new AbortController();
    apiFetch(ruta, { signal: control.signal })
      .then((r: { data?: unknown } | OpcionCatalogo[] | null) => {
        const filas = Array.isArray(r) ? r : Array.isArray(r?.data) ? (r.data as OpcionCatalogo[]) : [];
        setCatalogo({ filas, error: null });
      })
      .catch((err: unknown) => { if (!control.signal.aborted) setCatalogo((c) => ({ filas: c.filas, error: err })); });
    return () => control.abort();
  }, [ruta, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { catalogo, recargar };
}

/**
 * Un selector de un catálogo (la bodega o la categoría de la barra). Mientras carga, deshabilitado («Cargando…»); si falla sin
 * nada antes, lo dice con el detalle del servidor y «Reintentar», salvo con un 403 (nunca una lista vacía).
 */
export function SelectorCatalogo({ etiqueta, todas, cargando, fallo, catalogo, valor, onCambiar, onReintentar, icono: Icono, acento = 'indigo' }: {
  etiqueta: string; todas: string; cargando: string; fallo: string; catalogo: Catalogo; valor: string;
  onCambiar: (valor: string) => void; onReintentar: () => void; icono: LucideIcon; acento?: AcentoFoco;
}) {
  if (catalogo.error && !catalogo.filas) {
    return (
      <span role="alert" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
        {textoDeError(catalogo.error, fallo)}
        {/* B4 T24 (FINAL-C5): un 403 no ofrece «Reintentar» (ofreceReintentar de lib/avisos.js). */}
        {ofreceReintentar(catalogo.error) && <button type="button" onClick={onReintentar} className={`rounded font-bold underline ${FOCOS[acento]}`}>Reintentar</button>}
      </span>
    );
  }
  return (
    <label className="inline-flex items-center gap-1.5">
      <Icono size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
      <select aria-label={etiqueta} value={valor} disabled={!catalogo.filas} onChange={(e) => onCambiar(e.target.value)}
        className={`max-w-[11rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:text-slate-500 ${FOCOS[acento]}`}>
        <option value="">{catalogo.filas ? todas : cargando}</option>
        {(catalogo.filas ?? []).map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
      </select>
    </label>
  );
}
