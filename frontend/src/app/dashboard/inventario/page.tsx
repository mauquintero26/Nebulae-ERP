'use client';
import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle, Archive, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronRight, Eye, Layers, LayoutGrid, List, Plus,
  RefreshCw, Warehouse,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
// B4 T17: el Hub de Inventario con las existencias reales (R10, C11): la tabla estándar sobre /inventory/stock-tabla por
// bodega con el estado único de la pantalla (R5), las tarjetas de /inventory/stats (R12) y la pestaña Análisis estándar
// (R2, R13). Sin tablero (R11): conserva su vista Lista / Almacenes. El menú propio (SUB_MODULES) y el encabezado maestro
// quedan como estaban (TABLA-inventario, riesgo 5: «es otro hallazgo»).
import { FranjaKpis, Modal, TarjetaKpi, useEstadoKpi } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ClaveFila, ColumnaTabla, Listado, PestanaTabla } from '@/components/tabla';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { apiFetch } from '@/lib/api';
import { TABLE } from '@/lib/design-system';
import { formatoPesos } from '@/lib/pesos';
import { tiene } from '@/lib/estados-pedido';
import { estadoDelTotal, extraPorVista, textoVacioExistencias } from '@/lib/tabla';
import { AYUDA_MINIMO_INVENTARIO, formatoDecimal, numeroFinito, resumenAlmacenes, tarjetasHubInventario } from '@/lib/kpis';
import { ESTADOS_STOCK, TOPE_TABLERO_COMPRAS, avisoTope200 } from '@/lib/estados-compras';
// ?tab=analisis: la lectura genérica que dejó T14 en flujo-compras.js (se reúsa, no se copia).
import { leerEnlaceHubCompras } from '@/lib/flujo-compras';
import { textoDeError } from '@/lib/avisos';
// El chip estándar de las tablas del bloque (columnas-pec.tsx, T15 r1): la misma forma que el estado de un PEC.
import { CHIP } from '../compras/columnas-pec';

const SUB_MODULES = [
  { name: 'Stock y Catálogo', path: '/dashboard/inventario/stock' },
  { name: 'Recepciones',     path: '/dashboard/inventario/recepciones' },
  { name: 'Entregas',        path: '/dashboard/inventario/entregas' },
  { name: 'Traslados',       path: '/dashboard/inventario/traslados' },
  { name: 'Ajustes',         path: '/dashboard/inventario/ajustes' },
  { name: 'Abastecimiento',  path: '/dashboard/inventario/abastecimiento' },
  // B4 T17 (R14): Almacenes, Ubicaciones y Rutas salen del menú hasta tener datos (sus pantallas no se borran).
];

/* ============================================================
   B4 T17 — las piezas del Hub (la tabla, sus celdas, los selectores, las bodegas, el detalle y el asistente)
   ============================================================ */

/**
 * Una fila de GET /inventory/stock-tabla?por=bodega (T13): un SKU en una bodega, con los números de core/existencias.py
 * (R10): disponible = físico − reservado (nunca negativo), el estado con el disponible de la fila y el mínimo de la
 * referencia (RP52 a). en_transito es el del SKU, el mismo en cada bodega (RP50: no se suma por fila); valorizacion =
 * físico × costo, null sin costo.
 */
type FilaStock = {
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
/** `conteos` de stock-tabla con con_conteos=1: filas (pares) con la búsqueda y los filtros, sin la pestaña (D-4 de T13). */
type ConteosStock = Partial<Record<'todos' | 'agotados' | 'bajo_minimo' | 'abastecidos' | 'con_fisico', number>>;
/** Una bodega de GET /inventory/warehouses o una categoría de GET /categories (las opciones de los selectores). */
type OpcionCatalogo = { id: number; name: string };
/** Un catálogo: filas null mientras carga; si falla, el error (y lo último que llegó bien, si había). */
type Catalogo = { filas: OpcionCatalogo[] | null; error: unknown };
/** Los filtros extra de la barra, que van al servidor: el id elegido como texto ('' = todas). */
type FiltrosHub = { bodega: string; categoria: string };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla y TablaEstandar. */
const ID_HUB = 'inventario.hub';
const INICIAL_HUB = { vista: 'todos' };
const RUTA_HUB = '/dashboard/inventario';
const RUTA_STOCK = '/inventory/stock-tabla';
/**
 * RP52 y RP53: las pestañas y su parámetro de stock-tabla, que no tiene `vista` (extraPorVista de lib/tabla.js). «Bajo
 * el mínimo» = estado_stock=bajo_minimo (sin los agotados); «Existencias físicas» = incluir_sin_stock=false (físico > 0).
 */
const VISTAS_HUB = {
  todos: {},
  bajo_minimo: { estado_stock: 'bajo_minimo' },
  fisico: { incluir_sin_stock: false },
};
const SIN_FILTROS: FiltrosHub = { bodega: '', categoria: '' };
/** El contenedor de los Hubs del bloque (T7 a T16): pb-24 deja libre la esquina del botón de la IA. */
const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';
const FOCO_VISIBLE = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
/** TABLA-inventario punto 4: Recepciones, Entregas y Traslados dejan de ser pestañas (no filtraban nada) y son enlaces. */
const OPERACIONES = [
  { etiqueta: 'Recepciones', ruta: '/dashboard/inventario/recepciones' },
  { etiqueta: 'Entregas', ruta: '/dashboard/inventario/entregas' },
  { etiqueta: 'Traslados', ruta: '/dashboard/inventario/traslados' },
];
/** RP69 con D31: el asistente de hoy del Hub, con su título y sus ejemplos (el primero con la etiqueta de RP53). */
const ASISTENTE_INVENTARIO = {
  titulo: 'Nebulae AI Inventory Copilot',
  ejemplos: [
    '¿Qué productos están bajo el mínimo o agotados?',
    '¿Cuál es la valorización total del inventario?',
    '¿Cómo están distribuidos los almacenes y bodegas?',
    '¿Cuáles son los productos con mayor valor patrimonial?',
  ],
};
/** R10: una referencia con rastrear_inventario = false sale en la tabla, pero no suma en los totales. */
const TEXTO_SIN_SEGUIMIENTO = 'No lleva control de inventario (su publicación tiene «rastrear inventario» apagado): no suma en los totales.';

// H42: pesos enteros con punto de miles; lo que no llega, '—'. Las cantidades sin redondear ('2,5').
const pesos = (v: unknown) => (numeroFinito(v) === null ? '—' : formatoPesos(v));
const cantidad = (v: unknown) => formatoDecimal(v);
/** RP53: la etiqueta, el tono y las clases de ESTADOS_STOCK (estados-compras.js); un estado desconocido, null. */
const infoStock = (e: unknown) => (typeof e === 'string' && tiene(ESTADOS_STOCK, e) ? ESTADOS_STOCK[e as keyof typeof ESTADOS_STOCK] : null);
/** La fila es un par SKU y bodega: la clave de la selección y de React. */
const claveDeFilaStock = (f: FilaStock) => `${f.sku_id}-${f.warehouse_id ?? 'sin-bodega'}`;
/**
 * D41: tonos opacos de TABLE. Agotada en filaAlerta, bajo el mínimo en filaAviso (antes un borde rojo y un tinte
 * translúcido) y la que no lleva control de inventario, apagada.
 */
const claseDeFilaStock = (f: FilaStock) => (f.rastrear_inventario === false ? TABLE.filaApagada
  : f.estado_stock === 'agotado' ? TABLE.filaAlerta : f.estado_stock === 'bajo_minimo' ? TABLE.filaAviso : null);

/** Producto: el nombre y, si no lleva control de inventario, la marca «Sin seguimiento». */
function CeldaProducto({ f }: { f: FilaStock }) {
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
function CeldaEstadoStock({ f }: { f: FilaStock }) {
  const info = infoStock(f.estado_stock);
  if (!info) return <span className="text-xs text-slate-500">—</span>;
  return <span className={`${CHIP} text-[11px] ${info.clases.bg} ${info.clases.text} ${info.clases.border}`}>{info.label}</span>;
}

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaHub = { abrir: (f: FilaStock) => void };
const AccionesFila = React.createContext<AccionesFilaHub | null>(null);

/** Acciones: el ojo abre el detalle de la existencia (lo mismo que un clic en la fila). */
function CeldaAcciones({ f }: { f: FilaStock }) {
  const acciones = useContext(AccionesFila);
  return (
    <button type="button" onClick={() => acciones?.abrir(f)} aria-label={`Ver el detalle de ${f.sku}${f.bodega ? ` en ${f.bodega}` : ''}`}
      title="Ver detalle" className={`rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 ${FOCO_VISIBLE}`}>
      <Eye size={14} aria-hidden="true" />
    </button>
  );
}

/**
 * La tabla (TABLA-inventario punto 4; R26, D41): las columnas y los anchos del diseño. SKU y Acciones fijas; Producto es
 * la flexible. Bodega y Estado no se ordenan (stock-tabla no los acepta); las demás, por su id, que es el campo de orden
 * del servidor. R26: a 1024 px con el menú abierto la caja deja 704 px (medido en T7 a T16); caben la casilla, SKU,
 * Producto, Bodega, Disponible, Estado y Acciones (40 + 112 + 180 + 120 + 88 + 104 + 56 = 700). Categoría, Físico,
 * Reservado, Precio y Valorización van ocultas por defecto (se muestran con «Ajustar tabla»). Sin columna de tránsito
 * (RP50). Una constante: estable (D40).
 */
const COLUMNAS_HUB: ColumnaTabla<FilaStock>[] = [
  { id: 'sku', titulo: 'SKU', ancho: 112, clave: true, fija: 'izquierda', ordenable: true,
    celda: (f) => <span className="block truncate font-mono text-xs font-black text-indigo-700">{f.sku}</span> },
  { id: 'producto', titulo: 'Producto', ancho: 180, clave: true, flexible: true, ordenable: true,
    titleCelda: (f) => [f.producto || 'Sin nombre', f.rastrear_inventario === false ? TEXTO_SIN_SEGUIMIENTO : null].filter(Boolean).join(' · '),
    celda: (f) => <CeldaProducto f={f} /> },
  { id: 'categoria', titulo: 'Categoría', ancho: 120, ocultaPorDefecto: true, ordenable: true,
    celda: (f) => <span className="block truncate text-xs text-slate-600">{f.categoria || '—'}</span> },
  { id: 'bodega', titulo: 'Bodega', ancho: 120,
    celda: (f) => <span className="block truncate text-xs font-semibold text-slate-700">{f.bodega || '—'}</span> },
  { id: 'fisico', titulo: 'Físico', ancho: 80, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-slate-900">{cantidad(f.fisico)}</span> },
  { id: 'reservado', titulo: 'Reservado', ancho: 88, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-amber-800">{cantidad(f.reservado)}</span> },
  { id: 'disponible', titulo: 'Disponible', ancho: 88, clave: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-black text-emerald-800">{cantidad(f.disponible)}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 104, clave: true,
    titleCelda: (f) => infoStock(f.estado_stock)?.label ?? 'Sin estado', celda: (f) => <CeldaEstadoStock f={f} /> },
  { id: 'precio', titulo: 'Precio', ancho: 104, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => (numeroFinito(f.precio) === null ? 'Sin precio de venta' : pesos(f.precio)),
    celda: (f) => <span className="text-xs text-slate-700">{pesos(f.precio)}</span> },
  { id: 'valorizacion', titulo: 'Valorización', ancho: 120, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => (numeroFinito(f.valorizacion) === null ? 'Sin costo registrado' : `${pesos(f.valorizacion)} al costo`),
    celda: (f) => <span className="text-xs font-black text-slate-900">{pesos(f.valorizacion)}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 56, clave: true, fija: 'derecha', celda: (f) => <CeldaAcciones f={f} /> },
];

/**
 * Las pestañas del Hub (RP53, sin emojis): Todos, Bajo el mínimo (en rojo si hay alguna) y Existencias físicas, con los
 * conteos del servidor (null mientras cargan: la barra gris, nunca 0). Análisis va aparte (pestanaAparte).
 */
function pestanasDelHub(conteos: ConteosStock | null): PestanaTabla[] {
  return [
    { id: 'todos', etiqueta: 'Todos', conteo: conteos?.todos ?? null },
    { id: 'bajo_minimo', etiqueta: ESTADOS_STOCK.bajo_minimo.label, conteo: conteos?.bajo_minimo ?? null, alerta: (conteos?.bajo_minimo ?? 0) > 0 },
    { id: 'fisico', etiqueta: 'Existencias físicas', conteo: conteos?.con_fisico ?? null },
  ];
}

/**
 * Un selector de un catálogo (la bodega o la categoría de la barra, la bodega del Análisis). Mientras carga, deshabilitado
 * («Cargando…»); si falla sin nada antes, lo dice con el detalle del servidor y «Reintentar» (nunca una lista vacía).
 */
function SelectorCatalogo({ etiqueta, todas, cargando, fallo, catalogo, valor, onCambiar, onReintentar, icono: Icono }: {
  etiqueta: string; todas: string; cargando: string; fallo: string; catalogo: Catalogo; valor: string;
  onCambiar: (valor: string) => void; onReintentar: () => void; icono: LucideIcon;
}) {
  if (catalogo.error && !catalogo.filas) {
    return (
      <span role="alert" className="inline-flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-800">
        {textoDeError(catalogo.error, fallo)}
        <button type="button" onClick={onReintentar} className={`rounded font-bold underline ${FOCO_VISIBLE}`}>Reintentar</button>
      </span>
    );
  }
  return (
    <label className="inline-flex items-center gap-1.5">
      <Icono size={14} aria-hidden="true" className="shrink-0 text-slate-500" />
      <select aria-label={etiqueta} value={valor} disabled={!catalogo.filas} onChange={(e) => onCambiar(e.target.value)}
        className={`max-w-[11rem] rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 disabled:text-slate-500 ${FOCO_VISIBLE}`}>
        <option value="">{catalogo.filas ? todas : cargando}</option>
        {(catalogo.filas ?? []).map((o) => <option key={o.id} value={String(o.id)}>{o.name}</option>)}
      </select>
    </label>
  );
}

/**
 * La vista «Almacenes» (RP52 d): una tarjeta por bodega con hasta 200 filas de la MISMA consulta de la tabla (su pestaña,
 * búsqueda, bodega y categoría), agrupadas con resumenAlmacenes (lib/kpis.js; sin las referencias que no llevan control
 * de inventario, R10) y el aviso de R11 si hay más. «Ver artículos» filtra la tabla por esa bodega.
 */
function VistaAlmacenes({ listado, vacio, onVer }: { listado: Listado<FilaStock>; vacio: React.ReactNode; onVer: (id: number) => void }) {
  const grupos = useMemo(() => resumenAlmacenes(listado.filas), [listado.filas]);
  const aviso = avisoTope200(listado.total, 'existencias');
  const error = listado.error ? (
    <div role="alert" className="flex flex-wrap items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-semibold text-rose-800">
      {textoDeError(listado.error, 'No se pudieron cargar las bodegas')}
      <button type="button" onClick={listado.recargar}
        className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCO_VISIBLE}`}>
        <RefreshCw size={13} aria-hidden="true" /> Reintentar
      </button>
    </div>
  ) : null;
  if (listado.cargandoInicial) {
    return (
      <div aria-busy="true" className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        <span className="sr-only">Cargando las bodegas</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-[214px] rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
            <div className="h-12 w-2/3 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="h-16 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
              <div className="h-16 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
            </div>
          </div>
        ))}
      </div>
    );
  }
  return (
    <div className="space-y-3" aria-busy={listado.recargando || undefined}>
      {error}
      {aviso && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{aviso}</p>}
      {grupos.length === 0 ? (
        !listado.error && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm">{vacio}</div>
      ) : (
        <div className={`grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3 transition-opacity ${listado.recargando ? 'opacity-60' : ''}`}>
          {grupos.map((b) => (
            <article key={b.warehouse_id} className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                    <Warehouse size={24} aria-hidden="true" />
                  </div>
                  <h3 className="min-w-0 truncate text-base font-black leading-tight text-slate-800" title={b.bodega}>{b.bodega}</h3>
                </div>
                <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-black text-slate-700">
                  {b.referencias} {b.referencias === 1 ? 'referencia' : 'referencias'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="text-[10px] font-black uppercase text-slate-500">Existencias</span>
                  <p className="text-lg font-black text-slate-900">{cantidad(b.fisico)} unid.</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3" title={b.sin_costo > 0 ? `${b.sin_costo} sin costo registrado` : undefined}>
                  <span className="text-[10px] font-black uppercase text-slate-500">Valor al costo</span>
                  <p className="truncate text-lg font-black text-indigo-700">{pesos(b.valor)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between gap-2 pt-2 text-xs font-bold">
                <span className={`flex items-center gap-1 ${b.en_riesgo > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {b.en_riesgo > 0 ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                  {b.en_riesgo > 0 ? `${b.en_riesgo} bajo el mínimo o agotadas` : 'Bien abastecida'}
                </span>
                <button type="button" onClick={() => onVer(b.warehouse_id)} aria-label={`Ver los artículos de ${b.bodega}`}
                  className={`flex items-center gap-1 rounded font-black text-indigo-700 hover:text-indigo-900 ${FOCO_VISIBLE}`}>
                  Ver artículos <ChevronRight size={14} aria-hidden="true" />
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El detalle de una existencia (un clic en la fila o el ojo): el mismo de antes, con Modal de components/ui y los datos
 * reales de la fila (antes, campos inventados y el estado con su código crudo).
 */
function DetalleExistencia({ f, onCerrar }: { f: FilaStock; onCerrar: () => void }) {
  const info = infoStock(f.estado_stock);
  const lineas: [string, string][] = [
    ['Cuarentena', cantidad(f.cuarentena)],
    ['En tránsito (del SKU, en todas las bodegas)', cantidad(f.en_transito)],
    ['Mínimo de la referencia', cantidad(f.minimo)],
    ['Precio de venta', pesos(f.precio)],
    ['Costo', pesos(f.costo)],
    ['Valorización (físico × costo)', numeroFinito(f.valorizacion) === null ? 'Sin costo registrado' : pesos(f.valorizacion)],
    ['Estado', info?.label ?? '—'],
  ];
  return (
    <Modal title={f.producto || f.sku} subtitle={[f.sku, f.categoria, f.bodega].filter(Boolean).join(' · ')} icon={Archive}
      color="indigo" onClose={onCerrar} footer={(
        <button type="button" onClick={onCerrar}
          className={`rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 ${FOCO_VISIBLE}`}>Cerrar</button>
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

/* ============================================================
   MAIN COMPONENT — InventarioHub
   ============================================================ */
export default function InventarioHub() {
  const pathname = usePathname();
  const router = useRouter();

  // ── B4 T17, bloque 1: la carga del servidor (TABLA-inventario punto 4; R5, R10, RP47, RP52; D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, la tabla y la vista Almacenes despachan a él. La bodega y
  // la categoría son filtros extra de la barra que van al servidor (cada cambio vuelve a la página 1 y limpia la
  // selección). Ya no hay productos inventados (/products?limit=300 con físico 12 + …, precio 45000 y bodegas alternadas).
  const [estado, despachar, listo] = useEstadoTabla(ID_HUB, INICIAL_HUB);
  // R13: ?tab=analisis abre la pestaña Análisis; se lee de window.location al montar (AuthGuard pinta el dashboard solo en
  // el navegador). Análisis es un estado de la página, nunca una vista de la tabla (RP35).
  const [enAnalisis, setEnAnalisis] = useState(() => leerEnlaceHubCompras(typeof window === 'undefined' ? '' : window.location.search).analisis);
  // R11: sin tablero; la vista Lista / Almacenes es de la página (como antes, no se recuerda).
  const [verAlmacenes, setVerAlmacenes] = useState(false);
  const [filtros, setFiltros] = useState<FiltrosHub>(SIN_FILTROS);
  const [seleccion, setSeleccion] = useState<ClaveFila[]>([]);

  // La tabla (T13): GET /inventory/stock-tabla?por=bodega con q, orden, limit y offset del estado, la pestaña como su
  // parámetro (VISTAS_HUB) y los conteos de las pestañas en la MISMA llamada. esperar: !listo (D40): el esqueleto, nunca
  // «vacío». En Análisis o en Almacenes no pide nada (activo: false, RP35).
  const extraDeLaLista = useMemo(() => extraPorVista(estado, VISTAS_HUB, {
    por: 'bodega', warehouse_id: filtros.bodega || null, categoria_id: filtros.categoria || null,
  }), [estado, filtros]);
  const listado = useListado<FilaStock>({
    ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, despachar, activo: !enAnalisis && !verAlmacenes, extra: extraDeLaLista,
  });
  // RP52 (d): «Almacenes» agrupa hasta 200 filas de la MISMA consulta (con sus conteos, para las pestañas).
  const extraAlmacenes = useMemo(() => ({ ...extraDeLaLista, limit: TOPE_TABLERO_COMPRAS, offset: 0 }), [extraDeLaLista]);
  const almacenes = useListado<FilaStock>({
    ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, activo: !enAnalisis && verAlmacenes, extra: extraAlmacenes,
  });
  const fuente = verAlmacenes ? almacenes : listado;
  const conteos = fuente.conteos as ConteosStock | null;
  const estadoConteos = useEstadoKpi(fuente.cargandoInicial || fuente.recargando, fuente.error);

  // Los selectores (las bodegas y las categorías reales; antes, 3 bodegas de relleno si la lista venía vacía y los
  // errores tragados como una lista vacía). Si falla, lo último bueno se conserva y el selector lo dice con «Reintentar».
  const [vueltaCatalogos, setVueltaCatalogos] = useState(0);
  const [bodegas, setBodegas] = useState<Catalogo>({ filas: null, error: null });
  const [categorias, setCategorias] = useState<Catalogo>({ filas: null, error: null });
  useEffect(() => {
    const control = new AbortController();
    const lista = (r: { data?: unknown } | null) => (Array.isArray(r?.data) ? (r.data as OpcionCatalogo[]) : []);
    apiFetch('/inventory/warehouses', { signal: control.signal })
      .then((r: { data?: unknown } | null) => setBodegas({ filas: lista(r), error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setBodegas((c) => ({ filas: c.filas, error: err })); });
    apiFetch('/categories', { signal: control.signal })
      .then((r: { data?: unknown } | null) => setCategorias({ filas: lista(r), error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCategorias((c) => ({ filas: c.filas, error: err })); });
    return () => control.abort();
  }, [vueltaCatalogos]);
  const reintentarCatalogos = useCallback(() => setVueltaCatalogos((n) => n + 1), []);

  // Las tarjetas (KPI-inventario punto 4; R10, R12): GET /inventory/stats, todo el inventario por referencia, sin
  // respaldo local. Mientras no llega, 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  const [stats, setStats] = useState<{ vuelta: number; datos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch('/inventory/stats', { signal: control.signal })
      .then((r: { data?: unknown } | null) => setStats({ vuelta: vueltaStats, datos: r?.data ?? null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setStats({ vuelta: vueltaStats, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaStats]);
  const cargandoStats = stats?.vuelta !== vueltaStats;
  const estadoKpis = useEstadoKpi(cargandoStats, cargandoStats ? null : (stats?.error ?? null));
  const tarjetas = tarjetasHubInventario(stats?.datos ?? null);

  // «Actualizar»: la tabla (o las bodegas), las tarjetas y los selectores. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarAlmacenes } = almacenes;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarAlmacenes();
    setVueltaStats((n) => n + 1);
    setVueltaCatalogos((n) => n + 1);
  }, [recargarListado, recargarAlmacenes]);
  const actualizando = fuente.recargando || (cargandoStats && stats !== null);

  // ── B4 T17, bloque 2: la tabla (TABLA-inventario punto 4; R5, R26, RP53; D40, D41) ──
  const prefs = usePreferenciasTabla(ID_HUB, COLUMNAS_HUB);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Almacenes o a Análisis sale de la pantalla completa (es de la tabla).
  useEffect(() => { if (enAnalisis || verAlmacenes) salir(); }, [enAnalisis, verAlmacenes, salir]);
  const [detalle, setDetalle] = useState<FilaStock | null>(null);
  const abrir = useCallback((f: FilaStock) => setDetalle(f), []);
  const accionesFila = useMemo<AccionesFilaHub>(() => ({ abrir }), [abrir]);
  const pestanas = pestanasDelHub(conteos);
  const cambiarFiltros = useCallback((cambio: Partial<FiltrosHub>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    setSeleccion([]);
    despachar({ tipo: 'pagina', valor: 1 });
  }, [despachar]);
  const alSeleccionar = useCallback((claves: ClaveFila[]) => setSeleccion(claves), []);
  const pieSeleccion = seleccion.length > 0
    ? <span className="font-bold text-indigo-700">{seleccion.length} {seleccion.length === 1 ? 'seleccionada' : 'seleccionadas'}</span>
    : null;
  // Los nombres de lo elegido, para el vacío (si el catálogo todavía no llegó, el id).
  const nombreBodega = filtros.bodega ? (bodegas.filas?.find((b) => String(b.id) === filtros.bodega)?.name ?? `#${filtros.bodega}`) : null;
  const nombreCategoria = filtros.categoria ? (categorias.filas?.find((c) => String(c.id) === filtros.categoria)?.name ?? `#${filtros.categoria}`) : null;
  // m8 de T15: el «vacío» memoizado dice qué lo deja vacío (textoVacioExistencias): la búsqueda, la pestaña o los filtros.
  const vacio = useMemo(() => {
    const texto = textoVacioExistencias({ q: estado.q, vista: estado.vista, bodega: nombreBodega, categoria: nombreCategoria });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, estado.vista, nombreBodega, nombreCategoria]);
  const hayFiltros = Boolean(filtros.bodega || filtros.categoria);

  // ── B4 T17, bloque 4: la vista Almacenes (RP52 d) ──
  const elegirVista = useCallback((almacenesAhora: boolean) => {
    setVerAlmacenes(almacenesAhora);
    setSeleccion([]);
  }, []);
  const verArticulos = useCallback((id: number) => {
    cambiarFiltros({ bodega: String(id) });
    setVerAlmacenes(false);
  }, [cambiarFiltros]);

  // ── B4 T17, bloque 8: Documentos / Análisis (ANALISIS-inventario punto 3; R2, R13, RP35, RP69, D31, D45) ──
  const cambiarSeccion = useCallback((analisis: boolean) => {
    setEnAnalisis(analisis);
    setSeleccion([]);
    // Al volver a los documentos la URL deja de decir ?tab=analisis (recargar no reabre el Análisis).
    if (!analisis && leerEnlaceHubCompras(window.location.search).analisis) router.replace(RUTA_HUB);
  }, [router]);
  const alCambiarAparte = useCallback((activa: boolean) => {
    if (activa !== enAnalisis) cambiarSeccion(activa);
  }, [enAnalisis, cambiarSeccion]);
  // El select de la bodega del Análisis es propio (no el filtro de la tabla) y usa las bodegas reales.
  const [bodegaAnalisis, setBodegaAnalisis] = useState('');
  const paramsAnalisis = useMemo(() => ({ bodega: bodegaAnalisis || null }), [bodegaAnalisis]);
  const selectorBodegaAnalisis = (
    <SelectorCatalogo etiqueta="Bodega del análisis" todas="Todas las bodegas" cargando="Cargando bodegas…"
      fallo="No se pudieron cargar las bodegas" catalogo={bodegas} valor={bodegaAnalisis} onCambiar={setBodegaAnalisis}
      onReintentar={reintentarCatalogos} icono={Warehouse} />
  );

  // «N resultados»: el de la tabla o el de la vista Almacenes (filas).
  const totalDeLaBarra = {
    total: fuente.total,
    estadoTotal: estadoDelTotal({ total: fuente.total, cargando: fuente.cargandoInicial, recargando: fuente.recargando, error: fuente.error }),
  };

  /* ============================================================
     RENDER
     ============================================================ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 1. SUB-MODULE NAVIGATION */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-xs sticky top-0 z-30">
        <Link href="/dashboard/inventario" className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 mr-2 transition-colors">
          <ArrowLeft size={12}/> Hub
        </Link>
        <div className="w-px h-4 bg-slate-200 mr-1 shrink-0"/>
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">HUB DE INVENTARIO:</span>
        {SUB_MODULES.map(function(m) {
          return (
            <Link key={m.name} href={m.path}
              className={'shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ' + (pathname === m.path ? 'bg-indigo-600 text-white border-indigo-600' : 'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent hover:border-indigo-200')}>
              {m.name}
            </Link>
          );
        })}
      </div>

      {/* B4 T17 (R10, R12): sin el «Semáforo de Resolución de Inventario». Sus conteos eran de los productos inventados,
          «Filtrar Críticos» es la pestaña «Bajo el mínimo», «Ver Reservas» no tiene parámetro en el servidor y su botón
          abría el modal «Umbral», que no guardaba nada (el mínimo es de cada referencia). Lo dicen las tarjetas y su nota. */}

      <div className={CONTENEDOR}>

        {/* 3. HEADER MAESTRO */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Archive size={28}/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight">HUB de Inventario</h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Nebulae Kids
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                Control maestro de existencias físicas, bodegas de almacenamiento, rotación y disponibilidad vendible multicanal.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button type="button" onClick={recargarTodo} className={`px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold text-xs flex items-center gap-2 transition-colors ${FOCO_VISIBLE}`}>
              <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/>
              Actualizar
            </button>
            <Link href="/dashboard/inventario/recepciones" className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-sm flex items-center gap-2 transition-all">
              <Plus size={16}/>
              Nueva Operación
            </Link>
          </div>
        </div>

        {/* B4 T17, bloque 5 (KPI-inventario punto 4; R7, R10, R12, RP51, RP52 b): las 4 tarjetas de /inventory/stats (todo el
            inventario, por referencia): mientras cargan, barras grises (nunca 0); con error, «—». Ninguna es botón: no hay
            una vista con el mismo número (la pestaña «Bajo el mínimo» cuenta filas por bodega). La nota dice dónde se
            define el mínimo (R10). No se ven en Análisis (allí van sus propios indicadores). Debajo, Recepciones, Entregas y
            Traslados como enlaces (antes, pestañas que no filtraban nada y decían siempre 14, 8 y 5). */}
        {!enAnalisis && (
          <>
            <FranjaKpis estado={estadoKpis} titulo="Existencias" nota={AYUDA_MINIMO_INVENTARIO}>
              <TarjetaKpi kpi="inv_valorizacion" valor={tarjetas?.valorizacion.valor ?? null} ayuda={tarjetas?.valorizacion.ayuda ?? undefined} />
              <TarjetaKpi kpi="inv_skus" valor={tarjetas?.skus.valor ?? null} ayuda={tarjetas?.skus.ayuda ?? undefined} />
              <TarjetaKpi kpi="inv_bajo_minimo" valor={tarjetas?.bajo_minimo.valor ?? null} ayuda={tarjetas?.bajo_minimo.ayuda ?? undefined}
                tono={tarjetas?.bajo_minimo.tono ?? 'normal'} />
              <TarjetaKpi kpi="inv_disponibilidad" valor={tarjetas?.disponibilidad.valor ?? null} ayuda={tarjetas?.disponibilidad.ayuda ?? undefined} />
            </FranjaKpis>
            <nav aria-label="Operaciones de inventario" className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-semibold text-slate-600">Operaciones:</span>
              {OPERACIONES.map((o) => (
                <Link key={o.ruta} href={o.ruta}
                  className={`inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 font-bold text-slate-700 hover:bg-slate-50 ${FOCO_VISIBLE}`}>
                  {o.etiqueta} <ArrowUpRight size={12} aria-hidden="true" />
                </Link>
              ))}
            </nav>
          </>
        )}

        {/* B4 T17, bloques 2, 4 y 8 (TABLA-inventario punto 4, ANALISIS-inventario punto 3): la barra y la tabla estándar en
            el servidor con el estado único (pestaña, búsqueda, orden y página), o la vista Almacenes con la MISMA consulta.
            Sin tablero (R11). La bodega y la categoría van al servidor. Análisis es la pestaña aparte. */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={despachar}
                pestanas={pestanas}
                pestanaAparte={{ id: 'analisis', etiqueta: 'Análisis', activa: enAnalisis, onCambiar: alCambiarAparte }}
                estadoConteos={estadoConteos}
                placeholder="Buscar por SKU o producto…"
                filtros={(
                  <>
                    <SelectorCatalogo etiqueta="Bodega" todas="Todas las bodegas" cargando="Cargando bodegas…"
                      fallo="No se pudieron cargar las bodegas" catalogo={bodegas} valor={filtros.bodega}
                      onCambiar={(bodega) => cambiarFiltros({ bodega })} onReintentar={reintentarCatalogos} icono={Warehouse} />
                    <SelectorCatalogo etiqueta="Categoría" todas="Todas las categorías" cargando="Cargando categorías…"
                      fallo="No se pudieron cargar las categorías" catalogo={categorias} valor={filtros.categoria}
                      onCambiar={(categoria) => cambiarFiltros({ categoria })} onReintentar={reintentarCatalogos} icono={Layers} />
                    {hayFiltros && (
                      <button type="button" onClick={() => cambiarFiltros(SIN_FILTROS)}
                        className={`rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 ${FOCO_VISIBLE}`}>
                        Quitar filtros
                      </button>
                    )}
                    {/* R11: la vista Lista / Almacenes del Hub (no es el conmutador del tablero: el Hub no lleva tablero). */}
                    <div role="group" aria-label="Vista" className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5">
                      {([[false, 'Lista', List, 'Vista lista'], [true, 'Almacenes', LayoutGrid, 'Vista por bodegas']] as const).map(([valor, texto, Icono, titulo]) => (
                        <button key={texto} type="button" aria-pressed={verAlmacenes === valor} onClick={() => elegirVista(valor)} title={titulo}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${
                            verAlmacenes === valor ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                          <Icono size={14} aria-hidden="true" />
                          <span className="hidden md:inline">{texto}</span>
                          <span className="sr-only md:hidden">{titulo}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                ajustes={verAlmacenes ? undefined : { columnas: COLUMNAS_HUB, preferencias: prefs, anchoRef: anchoTablaRef }}
                pantallaCompleta={verAlmacenes ? undefined : { completa, alternar }}
                color="indigo"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden, la selección de la página y los tonos
                  de la fila son de la tabla; un clic en la fila (o el ojo) abre el detalle. */}
              {!enAnalisis && !verAlmacenes && (
                <TablaEstandar
                  id={ID_HUB}
                  modo="servidor"
                  columnas={COLUMNAS_HUB}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={listado.filas}
                  total={listado.total}
                  cargando={listado.cargandoInicial}
                  recargando={listado.recargando}
                  error={listado.error}
                  onReintentar={listado.recargar}
                  aviso={listado.avisoOrden}
                  claveFila={claveDeFilaStock}
                  onFila={abrir}
                  claseFila={claseDeFilaStock}
                  seleccion={seleccion}
                  onSeleccion={alSeleccionar}
                  pie={pieSeleccion}
                  vacio={vacio}
                  etiqueta="Existencias por bodega"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enAnalisis ? (
            /* ANALISIS-inventario punto 3 (R2, R13, RP69, D31, D45): /inventory/analisis con el contrato único; la línea
               del valor del inventario es mejor si sube (el «mejor» que manda el servidor para esa cifra). El asistente es
               la tarjeta de AsistenteEnConstruccion del panel (R2): se fue el chat simulado. */
            <PanelAnalisisPerezoso
              modulo="inventario"
              endpoint="/inventory/analisis"
              acento="teal"
              mejorLinea="sube"
              params={paramsAnalisis}
              controlesExtra={selectorBodegaAnalisis}
              asistente={ASISTENTE_INVENTARIO}
            />
          ) : verAlmacenes ? (
            <VistaAlmacenes listado={almacenes} vacio={vacio} onVer={verArticulos} />
          ) : null}
        </div>

      </div>

      {/* B4 T17, bloque 7: el detalle de la existencia (sin el modal «Umbral», que no guardaba nada: R10). */}
      {detalle && <DetalleExistencia f={detalle} onCerrar={() => setDetalle(null)} />}

    </div>
  );
}
