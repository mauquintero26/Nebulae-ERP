'use client';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  AlertTriangle, Archive, ArrowLeft, ArrowUpRight, CheckCircle2, ChevronRight, Eye, Layers, LayoutGrid, List, Plus,
  RefreshCw, Warehouse,
} from 'lucide-react';
// B4 T17: el Hub de Inventario con las existencias reales (R10, C11): la tabla estándar sobre /inventory/stock-tabla por
// bodega con el estado único de la pantalla (R5), las tarjetas de /inventory/stats (R12) y la pestaña Análisis estándar
// (R2, R13). Sin tablero (R11): conserva su vista Lista / Almacenes. El menú propio (SUB_MODULES) y el encabezado maestro
// quedan como estaban (TABLA-inventario, riesgo 5: «es otro hallazgo»).
import { FranjaKpis, TarjetaKpi, useEstadoKpi } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla, Listado, PestanaTabla } from '@/components/tabla';
import { useResumen } from '@/components/ui/useResumen';
import { useAnchoVentana } from '@/components/ui/useAnchoVentana';
import { AvisoDeError } from '@/components/ui/AvisoFuente';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { apiFetch } from '@/lib/api';
import { accionesDeFiltros, estadoDelTotal, extraPorVista, filtrosDePantalla, mostrarPorDefecto, textoVacioExistencias } from '@/lib/tabla';
import { AYUDA_MINIMO_INVENTARIO, numeroFinito, resumenAlmacenes, tarjetasHubInventario } from '@/lib/kpis';
import {
  CARGA_CATALOGO_VACIA, ESTADOS_STOCK, TOPE_TABLERO_COMPRAS, avisoTopeAlmacenes, falloCatalogo, filtrosAplicadosHub, lecturaCatalogo, llegadaCatalogo,
  marcarCategoriasPadre, textoPieBodega,
} from '@/lib/estados-compras';
// ?tab=analisis: la lectura genérica que dejó T14 en flujo-compras.js (se reúsa, no se copia).
import { leerEnlaceHubCompras } from '@/lib/flujo-compras';
// T18 r1 (m10, m21): las piezas de una existencia (tipos, celdas, detalle, selector, formatos, clave y clase de fila, CONTENEDOR y
// foco) son de piezas-inventario.tsx, fuente única de las cinco pantallas de existencias; el Hub las importa sin cambio visible.
import {
  CONTENEDOR, CeldaEstadoStock, CeldaProducto, DetalleExistencia, FOCOS, SelectorCatalogo, TEXTO_SIN_SEGUIMIENTO, cantidad,
  claseDeFilaExistencia as claseDeFilaStock, claveDeFilaExistencia as claveDeFilaStock, infoStock, pesos,
} from './piezas-inventario';
import type { Catalogo, ConteosStock, FilaExistencia as FilaStock, OpcionCatalogo } from './piezas-inventario';
import { AvisoCatalogoViejo } from './aviso-catalogo';

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

// T18 r1 (m10): FilaStock (FilaExistencia), ConteosStock, OpcionCatalogo y Catalogo salen de piezas-inventario.tsx.
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
const FOCO_VISIBLE = FOCOS.indigo; // el foco visible y el CONTENEDOR salen de piezas-inventario.tsx (T18 r1, m10)
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
// T18 r1 (m10): pesos, cantidad, infoStock, la clave y la clase de la fila, CeldaProducto y CeldaEstadoStock salen de piezas-inventario.tsx.

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
 * La tabla (TABLA-inventario punto 4; R26, D41): las columnas del diseño. SKU y Acciones fijas; Producto es la flexible.
 * Bodega y Estado no se ordenan (stock-tabla no los acepta); las demás, por su id, que es el campo de orden del servidor.
 * Los anchos son los del diseño salvo tres, medidos en el banco (salidas-17/medidas.txt):
 *  - Estado 124 (no 104): las etiquetas de RP53 son más largas que las del diseño («Bien abastecido» mide 98 px a 11 px;
 *    «Óptimo» cabía en 104);
 *  - Acciones 80 (no 56): el mínimo de TablaEstandar es 64 (ANCHO_MIN) y en 64 el título se recorta («Acci…»); 80 es el
 *    de las Acciones del Hub de Compras (columnas-pec.tsx);
 *  - Producto 140 (no 180): R26 baja primero la flexible (su piso es 120) y crece con el espacio que sobra.
 * R26: a 1024 la caja deja 704: 112 + 140 + 120 + 88 + 124 + 80 = 664; desde 1280, + Físico y Reservado (832) (B4.1 P23: sin la
 * casilla; P24: COLUMNAS_HUB_AMPLIO). Categoría, Precio y Valorización van ocultas por defecto (y Físico y Reservado hasta 1280; se
 * muestran con «Ajustar tabla»). Sin columna de tránsito (RP50). Constantes: estables (D40).
 */
const COLUMNAS_HUB: ColumnaTabla<FilaStock>[] = [
  { id: 'sku', titulo: 'SKU', ancho: 112, clave: true, fija: 'izquierda', ordenable: true, titleCelda: (f) => f.sku,
    celda: (f) => <span className="block truncate font-mono text-[11px] font-bold text-indigo-700">{f.sku}</span> },
  { id: 'producto', titulo: 'Producto', ancho: 140, clave: true, flexible: true, ordenable: true,
    titleCelda: (f) => [f.producto || 'Sin nombre', f.rastrear_inventario === false ? TEXTO_SIN_SEGUIMIENTO : null].filter(Boolean).join(' · '),
    celda: (f) => <CeldaProducto f={f} /> },
  { id: 'categoria', titulo: 'Categoría', ancho: 120, ocultaPorDefecto: true, ordenable: true, titleCelda: (f) => f.categoria || 'Sin categoría',
    celda: (f) => <span className="block truncate text-xs text-slate-600">{f.categoria || '—'}</span> },
  { id: 'bodega', titulo: 'Bodega', ancho: 120, titleCelda: (f) => f.bodega || 'Sin bodega',
    celda: (f) => <span className="block truncate text-xs font-semibold text-slate-700">{f.bodega || '—'}</span> },
  { id: 'fisico', titulo: 'Físico', ancho: 80, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-slate-900">{cantidad(f.fisico)}</span> },
  { id: 'reservado', titulo: 'Reservado', ancho: 88, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-amber-800">{cantidad(f.reservado)}</span> },
  { id: 'disponible', titulo: 'Disponible', ancho: 88, clave: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-black text-emerald-800">{cantidad(f.disponible)}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 124, clave: true,
    titleCelda: (f) => infoStock(f.estado_stock)?.label ?? 'Sin estado', celda: (f) => <CeldaEstadoStock f={f} /> },
  { id: 'precio', titulo: 'Precio', ancho: 104, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => (numeroFinito(f.precio) === null ? 'Sin precio de venta' : pesos(f.precio)),
    celda: (f) => <span className="text-xs text-slate-700">{pesos(f.precio)}</span> },
  { id: 'valorizacion', titulo: 'Valorización', ancho: 120, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => (numeroFinito(f.valorizacion) === null ? 'Sin costo registrado' : `${pesos(f.valorizacion)} al costo`),
    celda: (f) => <span className="text-xs font-black text-slate-900">{pesos(f.valorizacion)}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: (f) => <CeldaAcciones f={f} /> },
];

/** B4.1 (P24): la definición de desde 1280 px: la misma, con Físico y Reservado visibles por defecto (832 <= 1280 - 320 del menú). */
const COLUMNAS_HUB_AMPLIO = mostrarPorDefecto(COLUMNAS_HUB, ['fisico', 'reservado']);
const ANCHO_HUB_AMPLIO = 1280;

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

// T18 r1 (m10): SelectorCatalogo sale de piezas-inventario.tsx.

/**
 * Las columnas de la vista Almacenes las decide el ancho del CONTENEDOR (container queries, como FranjaKpis), no el de
 * la pantalla: con el menú abierto, a 1024 px caben 2 tarjetas legibles y a 1440, 3 (antes, md/lg de la pantalla daban 3
 * tarjetas de 229 px a 1024).
 */
const GRILLA_ALMACENES = 'grid grid-cols-1 gap-6 @xl:grid-cols-2 @4xl:grid-cols-3';
const TARJETA_BODEGA = '@container/bodega space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-xs';
/** Las dos cajas (existencias y valor) y el pie: en una tarjeta angosta (375 px) van una debajo de la otra. */
const CAJAS_BODEGA = 'grid grid-cols-1 gap-3 border-t border-slate-100 pt-2 @[19rem]/bodega:grid-cols-2';
const PIE_BODEGA = 'flex flex-col items-start gap-1 pt-2 text-xs font-bold @[19rem]/bodega:flex-row @[19rem]/bodega:items-center @[19rem]/bodega:justify-between';
const BARRA_ESQUELETO = 'inline-block rounded bg-slate-100 motion-safe:animate-pulse';

/**
 * La vista «Almacenes» (RP52 d): una tarjeta por bodega con hasta 200 filas de la MISMA consulta de la tabla (su pestaña,
 * búsqueda, bodega y categoría), agrupadas con resumenAlmacenes (lib/kpis.js; sin las referencias que no llevan control
 * de inventario, R10) y el aviso de R11 si hay más. «Ver artículos» filtra la tabla por esa bodega.
 */
function VistaAlmacenes({ listado, vacio, onVer }: { listado: Listado<FilaStock>; vacio: React.ReactNode; onVer: (id: number) => void }) {
  const grupos = useMemo(() => resumenAlmacenes(listado.filas), [listado.filas]);
  // B4.1 (P22): el aviso propio de Almacenes: dice que los totales por bodega son parciales.
  const aviso = avisoTopeAlmacenes(listado.total);
  // B4 T24 f3 (F79): con más filas que las cargadas, el pie no afirma «Bien abastecido» de lo que quedó fuera.
  const recortado = (listado.total ?? 0) > TOPE_TABLERO_COMPRAS;
  // r1 (m24): con AvisoDeError: un 403 no ofrece «Reintentar» (ofreceReintentar), como el resto de f3.
  const error = listado.error
    ? <AvisoDeError error={listado.error} fallo="No se pudieron cargar las existencias por bodega" onReintentar={listado.recargar} acento="indigo" />
    : null;
  if (listado.cargandoInicial) {
    // El esqueleto con la MISMA forma de la tarjeta cargada (las mismas cajas y alturas de línea): nada salta al llegar.
    return (
      <div aria-busy="true" className="@container">
        <span className="sr-only">Cargando las bodegas</span>
        <div className={GRILLA_ALMACENES}>
          {[0, 1, 2].map((i) => (
            <div key={i} aria-hidden="true" className={TARJETA_BODEGA}>
              <div className="flex min-w-0 items-center gap-3">
                <div className="h-12 w-12 shrink-0 rounded-xl bg-slate-100 motion-safe:animate-pulse" />
                <div className="min-w-0 flex-1">
                  <p className="text-base leading-tight"><span className={`w-2/3 ${BARRA_ESQUELETO}`}>&nbsp;</span></p>
                  <p className="text-xs"><span className={`w-1/3 ${BARRA_ESQUELETO}`}>&nbsp;</span></p>
                </div>
              </div>
              <div className={CAJAS_BODEGA}>
                {['Existencias', 'Valor al costo'].map((titulo) => (
                  <div key={titulo} className="rounded-xl bg-slate-50 p-3">
                    <span className="block text-[10px] font-black uppercase text-slate-500">{titulo}</span>
                    <p className="text-lg"><span className={`w-3/4 ${BARRA_ESQUELETO}`}>&nbsp;</span></p>
                  </div>
                ))}
              </div>
              <div className={PIE_BODEGA}>
                <span className={`w-1/2 ${BARRA_ESQUELETO}`}>&nbsp;</span>
                <span className={`w-1/4 ${BARRA_ESQUELETO}`}>&nbsp;</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="@container space-y-3" aria-busy={listado.recargando || undefined}>
      {/* B4 T24 f3 (F82 b): las tarjetas de bodega (h3) quedan bajo un h2 de la vista, sin cambiar lo que se ve. */}
      <h2 className="sr-only">Existencias por bodega</h2>
      {error}
      {aviso && <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">{aviso}</p>}
      {grupos.length === 0 ? (
        !listado.error && <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm">{vacio}</div>
      ) : (
        <div className={`${GRILLA_ALMACENES} transition-opacity ${listado.recargando ? 'opacity-60' : ''}`}>
          {grupos.map((b) => (
            <article key={b.warehouse_id} className={TARJETA_BODEGA}>
              {/* El nombre con todo el ancho (con la cuenta a la derecha se recortaba «Bodega Nor…» a 1440 px). */}
              <div className="flex min-w-0 items-center gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                  <Warehouse size={24} aria-hidden="true" />
                </div>
                <div className="min-w-0">
                  <h3 className="truncate text-base font-black leading-tight text-slate-800" title={b.bodega}>{b.bodega}</h3>
                  <p className="text-xs font-semibold text-slate-600">{b.referencias} {b.referencias === 1 ? 'referencia' : 'referencias'}</p>
                </div>
              </div>
              <div className={CAJAS_BODEGA}>
                <div className="rounded-xl bg-slate-50 p-3">
                  <span className="block text-[10px] font-black uppercase text-slate-500">Existencias</span>
                  <p className="truncate text-lg font-black text-slate-900" title={`${cantidad(b.fisico)} unidades`}>{cantidad(b.fisico)} unid.</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3" title={b.sin_costo > 0 ? `${b.sin_costo} sin costo registrado` : undefined}>
                  <span className="block text-[10px] font-black uppercase text-slate-500">Valor al costo</span>
                  <p className="truncate text-lg font-black text-indigo-700" title={pesos(b.valor)}>{pesos(b.valor)}</p>
                </div>
              </div>
              <div className={PIE_BODEGA}>
                <span className={`flex items-center gap-1 ${b.en_riesgo > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
                  {b.en_riesgo > 0 ? <AlertTriangle size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                  {textoPieBodega(b.en_riesgo, { recortado: recortado }).texto}
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

// T18 r1 (m10): DetalleExistencia sale de piezas-inventario.tsx.

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
  // B4 T24 (FINAL-C3): Análisis arranca apagado y lo enciende el useLayoutEffect de montaje si la URL NUEVA lo pide. En una
  // navegación con <Link>, Next 16 cambia la URL en el useInsertionEffect de HistoryUpdater, después del render: el
  // inicializador de useState leía la URL de la página anterior (la del Hub de Ventas con ?tab=analisis abría este Análisis
  // sin que nadie lo pidiera, y «Ver análisis» podía no abrirlo). Este efecto corre en el mismo commit, antes de pintar.
  const [enAnalisis, setEnAnalisis] = useState(false);
  useLayoutEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- FINAL-C3: la URL de la navegación existe recién en el commit
    if (leerEnlaceHubCompras(window.location.search).analisis) setEnAnalisis(true);
  }, []);
  // R11: sin tablero; la vista Lista / Almacenes es de la página (como antes, no se recuerda).
  const [verAlmacenes, setVerAlmacenes] = useState(false);
  // B4 T24 f4 (F39): la bodega y la categoría son filtros del estado único (estado.filtros): vuelven con la sesión junto con la página.
  const filtros = useMemo(() => filtrosDePantalla(estado.filtros, SIN_FILTROS) as FiltrosHub, [estado.filtros]);

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
  // B4 T24 f3 (F86): sin la bodega de la Lista: Almacenes muestra todas las bodegas (como en BASE); «Ver artículos» vuelve a filtrarla.
  const extraAlmacenes = useMemo(() => ({ ...extraDeLaLista, warehouse_id: null, limit: TOPE_TABLERO_COMPRAS, offset: 0 }), [extraDeLaLista]);
  const almacenes = useListado<FilaStock>({
    ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, activo: !enAnalisis && verAlmacenes, extra: extraAlmacenes,
  });
  const fuente = verAlmacenes ? almacenes : listado;
  const conteos = fuente.conteos as ConteosStock | null;
  const estadoConteos = useEstadoKpi(fuente.cargandoInicial || fuente.recargando, fuente.error);

  // Los selectores (las bodegas y las categorías reales; antes, 3 bodegas de relleno si la lista venía vacía y los
  // errores tragados como una lista vacía). Si falla, lo último bueno se conserva y el selector lo dice con «Reintentar».
  // r1 (F81): {vuelta, filas, error} por catálogo (cargando mientras no llega la de esta vuelta; el patrón de T16B) y filasDeCatalogo (una
  // forma inesperada es un error, no una lista vacía). Con un error y filas viejas, el selector lo dice junto al select.
  const [vueltaCatalogos, setVueltaCatalogos] = useState(0);
  // B4 T24 f4 (m5 de f3 r2): la vuelta de cada catálogo es la de la lib (llegadaCatalogo, falloCatalogo y lecturaCatalogo), la misma de useCatalogo.
  const [cargaBodegas, setBodegas] = useState<{ vuelta: number; filas: OpcionCatalogo[] | null; error: unknown }>(CARGA_CATALOGO_VACIA);
  const [cargaCategorias, setCategorias] = useState<{ vuelta: number; filas: OpcionCatalogo[] | null; error: unknown }>(CARGA_CATALOGO_VACIA);
  useEffect(() => {
    const control = new AbortController();
    const llegar = (fijar: typeof setBodegas) => (r: unknown) => fijar((c) => llegadaCatalogo(c, r, vueltaCatalogos));
    const fallar = (fijar: typeof setBodegas) => (err: unknown) => {
      if (!control.signal.aborted) fijar((c) => falloCatalogo(c, err, vueltaCatalogos));
    };
    apiFetch('/inventory/warehouses', { signal: control.signal }).then(llegar(setBodegas)).catch(fallar(setBodegas));
    apiFetch('/categories', { signal: control.signal }).then(llegar(setCategorias)).catch(fallar(setCategorias));
    return () => control.abort();
  }, [vueltaCatalogos]);
  const bodegas = useMemo<Catalogo>(() => lecturaCatalogo(cargaBodegas, vueltaCatalogos), [cargaBodegas, vueltaCatalogos]);
  const categorias = useMemo<Catalogo>(() => lecturaCatalogo(cargaCategorias, vueltaCatalogos), [cargaCategorias, vueltaCatalogos]);
  const reintentarCatalogos = useCallback(() => setVueltaCatalogos((n) => n + 1), []);

  // Las tarjetas (KPI-inventario punto 4; R10, R12): GET /inventory/stats, todo el inventario por referencia, sin
  // respaldo local. Mientras no llega, 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen('/inventory/stats', vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);
  const tarjetas = tarjetasHubInventario(stats.datos);

  // «Actualizar»: la tabla (o las bodegas), las tarjetas y los selectores. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarAlmacenes } = almacenes;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarAlmacenes();
    setVueltaStats((n) => n + 1);
    setVueltaCatalogos((n) => n + 1);
  }, [recargarListado, recargarAlmacenes]);
  const actualizando = fuente.recargando || (cargandoStats && stats.datos !== null);

  // ── B4 T17, bloque 2: la tabla (TABLA-inventario punto 4; R5, R26, RP53; D40, D41) ──
  // B4.1 (P24): desde 1280 px, la definición con Físico y Reservado visibles (null en el servidor: la angosta).
  const anchoVentana = useAnchoVentana();
  const columnasHub = (anchoVentana ?? 0) >= ANCHO_HUB_AMPLIO ? COLUMNAS_HUB_AMPLIO : COLUMNAS_HUB;
  const prefs = usePreferenciasTabla(ID_HUB, columnasHub);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Almacenes o a Análisis sale de la pantalla completa (es de la tabla).
  useEffect(() => { if (enAnalisis || verAlmacenes) salir(); }, [enAnalisis, verAlmacenes, salir]);
  const [detalle, setDetalle] = useState<FilaStock | null>(null);
  const abrir = useCallback((f: FilaStock) => setDetalle(f), []);
  const accionesFila = useMemo<AccionesFilaHub>(() => ({ abrir }), [abrir]);
  const pestanas = pestanasDelHub(conteos);
  // F39: una acción {tipo: 'filtro'} por clave; el reductor la mezcla con los otros filtros y vuelve a la página 1.
  const cambiarFiltros = useCallback((cambio: Partial<FiltrosHub>) => {
    for (const accion of accionesDeFiltros(cambio)) despachar(accion);
  }, [despachar]);
  // Los nombres de lo elegido, para el vacío (si el catálogo todavía no llegó, el id).
  // B4 T24 f3 (F85): sin el nombre (el catálogo no llegó), `true`: el vacío dice «la bodega elegida», nunca «#2».
  // B4 T24 f3 (F87-f): las categorías padre, marcadas en el selector (el filtro del servidor incluye las subcategorías (B4.1 P25)).
  const categoriasMarcadas = useMemo(() => ({ ...categorias, filas: marcarCategoriasPadre(categorias.filas) }), [categorias]);
  const nombreBodega = filtros.bodega ? (bodegas.filas?.find((b) => String(b.id) === filtros.bodega)?.name ?? true) : null;
  const nombreCategoria = filtros.categoria ? (categorias.filas?.find((c) => String(c.id) === filtros.categoria)?.name ?? true) : null;
  // r1 (m14 = m23): lo que aplica en la vista que se ve (en Almacenes, la bodega no: F86).
  const aplicados = filtrosAplicadosHub({ verAlmacenes, bodega: filtros.bodega, categoria: filtros.categoria });
  const bodegaDelVacio = aplicados.bodegaAplica ? nombreBodega : null;
  // m8 de T15: el «vacío» memoizado dice qué lo deja vacío (textoVacioExistencias): la búsqueda, la pestaña o los filtros.
  const vacio = useMemo(() => {
    const texto = textoVacioExistencias({ q: estado.q, vista: estado.vista, bodega: bodegaDelVacio, categoria: nombreCategoria });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, estado.vista, bodegaDelVacio, nombreCategoria]);
  const hayFiltros = aplicados.hayFiltros;

  // ── B4 T17, bloque 4: la vista Almacenes (RP52 d) ──
  const elegirVista = useCallback((almacenesAhora: boolean) => {
    setVerAlmacenes(almacenesAhora);
  }, []);
  const verArticulos = useCallback((id: number) => {
    cambiarFiltros({ bodega: String(id) });
    setVerAlmacenes(false);
  }, [cambiarFiltros]);

  // ── B4 T17, bloque 8: Documentos / Análisis (ANALISIS-inventario punto 3; R2, R13, RP35, RP69, D31, D45) ──
  const cambiarSeccion = useCallback((analisis: boolean) => {
    setEnAnalisis(analisis);
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
        {/* B4 T24 f3 (F78): flex-wrap y min-w-0: a 768 px con el menú abierto y a 375 px el encabezado se parte, no desplaza el main. */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4 min-w-0">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-slate-800 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Archive size={28}/>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-3xl font-black text-slate-900 tracking-tight break-words">HUB de Inventario</h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200">
                  Nebulae Kids
                </span>
              </div>
              <p className="text-sm text-slate-500 font-medium mt-0.5">
                Control maestro de existencias físicas, bodegas de almacenamiento, rotación y disponibilidad vendible multicanal.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            <FranjaKpis estado={estadoKpis} titulo="Existencias" idFoco="franja-existencias" nota={AYUDA_MINIMO_INVENTARIO}>
              <TarjetaKpi kpi="inv_valorizacion" valor={tarjetas?.valorizacion.valor ?? null} ayuda={tarjetas?.valorizacion.ayuda ?? undefined} />
              <TarjetaKpi kpi="inv_skus" valor={tarjetas?.skus.valor ?? null} ayuda={tarjetas?.skus.ayuda ?? undefined} />
              <TarjetaKpi kpi="inv_bajo_minimo" valor={tarjetas?.bajo_minimo.valor ?? null} ayuda={tarjetas?.bajo_minimo.ayuda ?? undefined}
                tono={tarjetas?.bajo_minimo.tono ?? 'normal'} />
              <TarjetaKpi kpi="inv_disponibilidad" valor={tarjetas?.disponibilidad.valor ?? null} ayuda={tarjetas?.disponibilidad.ayuda ?? undefined} />
            </FranjaKpis>
            {/* B4 T24 f3 (FINAL-m14, F84): si /stats falla, su detalle y «Reintentar» solo para él; un 403 no lo ofrece. */}
            {/* r2 (m36 completo): montado siempre (destinoFoco, el id de la franja): si el reintento sale bien o da un 403, el foco va a la franja, nunca al <body>. */}
            <AvisoDeError error={stats.error} fallo="No se pudieron cargar los indicadores de existencias" onReintentar={stats.recargar} acento="indigo" reintentando={stats.cargando} destinoFoco="franja-existencias" />
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
                    {aplicados.mostrarBodega ? (
                      <SelectorCatalogo etiqueta="Bodega" todas="Todas las bodegas" cargando="Cargando bodegas…"
                        fallo="No se pudieron cargar las bodegas" catalogo={bodegas} valor={filtros.bodega}
                        onCambiar={(bodega) => cambiarFiltros({ bodega })} onReintentar={reintentarCatalogos} icono={Warehouse} />
                    ) : (
                      <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600">En Almacenes se ven todas las bodegas</span>
                    )}
                    <SelectorCatalogo etiqueta="Categoría" todas="Todas las categorías" cargando="Cargando categorías…"
                      fallo="No se pudieron cargar las categorías" catalogo={categoriasMarcadas} valor={filtros.categoria}
                      onCambiar={(categoria) => cambiarFiltros({ categoria })} onReintentar={reintentarCatalogos} icono={Layers} />
                    {/* r1 (F81): si «Actualizar» falla con los catálogos ya cargados, se dice junto a los selectores, con «Reintentar». */}
                    <AvisoCatalogoViejo catalogo={bodegas} fallo="No se pudieron actualizar las bodegas" onReintentar={reintentarCatalogos} />
                    <AvisoCatalogoViejo catalogo={categorias} fallo="No se pudieron actualizar las categorías" onReintentar={reintentarCatalogos} />
                    {hayFiltros && (
                      <button type="button" onClick={() => cambiarFiltros(verAlmacenes ? { categoria: '' } : SIN_FILTROS)}
                        className={`rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 ${FOCO_VISIBLE}`}>
                        Quitar filtros
                      </button>
                    )}
                    {/* R11: la vista Lista / Almacenes del Hub (no es el conmutador del tablero: el Hub no lleva tablero). */}
                    <div role="group" aria-label="Vista" className="inline-flex items-center gap-0.5 rounded-xl border border-slate-200 bg-white p-0.5">
                      {([[false, 'Lista', List], [true, 'Almacenes', LayoutGrid]] as const).map(([valor, texto, Icono]) => (
                        <button key={texto} type="button" aria-pressed={verAlmacenes === valor} onClick={() => elegirVista(valor)}
                          aria-label={`Vista ${texto}`} title={`Vista ${texto}`}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${
                            verAlmacenes === valor ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                          <Icono size={14} aria-hidden="true" />
                          <span className="hidden md:inline">{texto}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
                ajustes={verAlmacenes ? undefined : { columnas: columnasHub, preferencias: prefs, anchoRef: anchoTablaRef }}
                pantallaCompleta={verAlmacenes ? undefined : { completa, alternar }}
                color="indigo"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden y los tonos
                  de la fila son de la tabla; un clic en la fila (o el ojo) abre el detalle. */}
              {!enAnalisis && !verAlmacenes && (
                <TablaEstandar
                  id={ID_HUB}
                  modo="servidor"
                  columnas={columnasHub}
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
                  vacio={vacio}
                  etiqueta="Existencias por bodega"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enAnalisis ? (
            /* ANALISIS-inventario punto 3 (R2, R13, RP69, D31, D45): /inventory/analisis con el contrato único; la línea
               del valor del inventario es neutra (B4.1 P15: sube o baja por compras y ventas). El asistente es
               la tarjeta de AsistenteEnConstruccion del panel (R2): se fue el chat simulado. */
            <PanelAnalisisPerezoso
              modulo="inventario"
              endpoint="/inventory/analisis"
              acento="teal"
              mejorLinea="neutro"
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
