'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDownRight, ArrowRightLeft, ArrowUpRight, RefreshCw, Search, Warehouse, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
// B4 T18: el Kardex en la tabla estándar, en modo servidor (R5, R11): el estado único de la pantalla, UN solo pedido por cada
// cambio de filtro (antes, el filtro y la página eran dos estados con dos efectos: cada filtro pedía dos veces), los errores
// dichos (antes, catch(() => {}) y listas vacías falsas) y el tablero solo para ver Entradas · Salidas (RP54). El servidor
// ordena siempre por fecha (más reciente primero) y no tiene `q`: la barra no lleva búsqueda libre sino los filtros del Kardex.
import { Modal, PageHeader, SubNav, TableroKanban, useTableroKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { apiFetch } from '@/lib/api';
import { estadoDelTotal, normalizarRespuesta } from '@/lib/tabla';
import { textoDeError } from '@/lib/avisos';
import { numeroFinito } from '@/lib/kpis';
import {
  COLUMNAS_KARDEX, DIRECCIONES_KARDEX, TEXTO_SOLO_VER_KARDEX, consultaColumnaKardex, direccionesDeColumnaKardex, extraKardex,
  etiquetaPropietario, infoDireccionKardex, numeroMovimiento, tarjetaMovimiento, textoFechaMovimiento, textoVacioKardex,
} from '@/lib/estados-compras';
import { INV_NAV } from '../inv-nav';
import { CONTENEDOR, FOCOS, SelectorCatalogo, cantidad, pesos, useCatalogo } from '../piezas-inventario';
// El chip estándar de las tablas del bloque (columnas-pec.tsx, T15 r1): la misma forma que el estado de un PEC.
import { CHIP } from '../../compras/columnas-pec';

/** Un movimiento de GET /inventory/kardex (KardexMovementItem, T13): los nombres son los del servidor. */
type Movimiento = {
  id: number;
  operation_id?: number | null;
  operation_type?: string | null;
  source_document_type?: string | null;
  source_document_numero?: string | null;
  sku_id?: number | null;
  sku?: string | null;
  product_name?: string | null;
  quantity?: number | string | null;
  direction?: string | null;
  owner?: string | null;
  warehouse_id?: number | null;
  warehouse_name?: string | null;
  unit_cost_cop?: number | string | null;
  created_at?: string | null;
  created_by?: string | null;
  idempotency_key?: string | null;
};
/** Los filtros extra de la barra, que van al servidor (extraKardex): el id del SKU elegido y los demás como texto ('' = todos). */
type FiltrosKardex = { skuId: number | null; bodega: string; propietario: string; direccion: string; desde: string; hasta: string };
/** Un resultado de GET /crm/products/search: el SKU y su texto. */
type OpcionSku = { id: number; display?: string | null; product_name?: string | null };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_KARDEX = 'inventario.kardex';
const INICIAL_KARDEX = {};
const RUTA_KARDEX = '/inventory/kardex';
/** m1: el servidor ordena SIEMPRE por fecha (get_kardex no tiene `orden`); la barra lo dice en lugar de un título que prometería ordenar. */
const TEXTO_ORDEN_KARDEX = 'Del más reciente al más antiguo';
const SIN_FILTROS: FiltrosKardex = { skuId: null, bodega: '', propietario: '', direccion: '', desde: '', hasta: '' };
/** El orden de la lista de direcciones (la del Kardex de hoy, más las dos que escribe el sistema y no estaban). */
// B4 T24 f3 (F88): el orden de DIRECCIONES_KARDEX (la lib), sin repetir sus claves a mano.
const ORDEN_DIRECCIONES = Object.keys(DIRECCIONES_KARDEX);
const ICONO_DIRECCION: Record<string, LucideIcon> = {
  IN: ArrowDownRight, OUT: ArrowUpRight, TRANSFER_IN: RefreshCw, TRANSFER_OUT: RefreshCw, ADJUST_IN: ArrowDownRight,
  ADJUST_OUT: ArrowUpRight, QUARANTINE: RefreshCw, SCRAP: ArrowUpRight, RETURN_IN: ArrowDownRight,
};
const CONTROL = `rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 ${FOCOS.indigo}`;

/** Dirección: la insignia de DIRECCIONES_KARDEX (la distinción de color entre normales y ajustes es a propósito). */
function CeldaDireccion({ m }: { m: Movimiento }) {
  const info = infoDireccionKardex(m.direction);
  const Icono = ICONO_DIRECCION[m.direction ?? ''] ?? RefreshCw;
  return (
    <span className={`${CHIP} text-[11px] ${info.clases.bg} ${info.clases.text} ${info.clases.border}`}>
      <Icono size={12} aria-hidden="true" /> {info.label}
    </span>
  );
}

/** Cant.: la cantidad con su signo (+ entra, − sale; ámbar si no tiene dirección). */
function CeldaCantidad({ m }: { m: Movimiento }) {
  const info = infoDireccionKardex(m.direction);
  const n = numeroFinito(m.quantity);
  return (
    <span className={`text-xs font-black ${info.signo === '+' ? 'text-green-700' : info.signo === '-' ? 'text-red-700' : 'text-amber-700'}`}>
      {n === null ? '—' : `${info.signo}${cantidad(Math.abs(n))}`}
    </span>
  );
}

/** Fecha: el día y la hora de Colombia (created_at es UTC sin zona: el navegador la leería en su zona, 5 horas corrida). */
function CeldaFecha({ m }: { m: Movimiento }) {
  const f = textoFechaMovimiento(m.created_at);
  return (
    <span className="flex flex-col leading-tight">
      <span className="text-xs text-slate-700">{f.dia}</span>
      {f.hora && <span className="text-[10px] text-slate-500">{f.hora}</span>}
    </span>
  );
}

/**
 * La tabla (TABLA-inventario punto 8; R26, D41): las columnas de hoy. El servidor ordena siempre por fecha, la más reciente
 * primero, y NO acepta `orden`: ninguna columna se ordena (un título que ordenara no haría nada). R26: a 1024 px con el menú
 * abierto la caja deja 704 px: 92 + 124 + 120 + 92 + 64 + 100 + 104 = 696. «Documento origen» se titula «Documento» (con su
 * title) para caber; Costo unit. y Usuario van ocultas por defecto (se muestran con «Ajustar tabla»). Una constante: estable (D40).
 */
const COLUMNAS_TABLA_KARDEX: ColumnaTabla<Movimiento>[] = [
  { id: 'fecha', titulo: 'Fecha', ancho: 92, clave: true, fija: 'izquierda',
    titleCelda: (m) => { const f = textoFechaMovimiento(m.created_at); return f.hora ? `${f.dia} ${f.hora}` : f.dia; },
    celda: (m) => <CeldaFecha m={m} /> },
  { id: 'direccion', titulo: 'Dirección', ancho: 124, clave: true, titleCelda: (m) => infoDireccionKardex(m.direction).label,
    celda: (m) => <CeldaDireccion m={m} /> },
  { id: 'producto', titulo: 'SKU / Producto', ancho: 120, clave: true, flexible: true,
    titleCelda: (m) => [m.sku, m.product_name].filter(Boolean).join(' · ') || `SKU #${m.sku_id ?? ''}`,
    celda: (m) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-mono text-[11px] font-bold text-slate-700">{m.sku || `SKU #${m.sku_id ?? ''}`}</span>
        <span className="truncate text-xs text-slate-600">{m.product_name || '—'}</span>
      </span>
    ) },
  { id: 'bodega', titulo: 'Bodega', ancho: 92, titleCelda: (m) => m.warehouse_name || 'Sin bodega',
    celda: (m) => <span className="block truncate text-xs text-slate-600">{m.warehouse_name || '—'}</span> },
  { id: 'cantidad', titulo: 'Cant.', ancho: 64, alinear: 'derecha', clave: true, celda: (m) => <CeldaCantidad m={m} /> },
  { id: 'propietario', titulo: 'Propietario', ancho: 100, titleCelda: (m) => etiquetaPropietario(m.owner),
    celda: (m) => <span className="block truncate text-xs font-bold text-slate-600">{etiquetaPropietario(m.owner)}</span> },
  { id: 'documento', titulo: 'Documento', ancho: 104, titleCelda: (m) => `Documento de origen: ${numeroMovimiento(m)}`,
    celda: (m) => <span className="block truncate text-xs text-slate-600">{numeroMovimiento(m)}</span> },
  { id: 'costo', titulo: 'Costo unit.', ancho: 96, ocultaPorDefecto: true, alinear: 'derecha',
    titleCelda: (m) => (Number(m.unit_cost_cop) > 0 ? `${pesos(m.unit_cost_cop)} (el costo actual del SKU)` : 'Sin costo registrado'),
    celda: (m) => <span className="text-xs text-slate-600">{Number(m.unit_cost_cop) > 0 ? pesos(m.unit_cost_cop) : '—'}</span> },
  { id: 'usuario', titulo: 'Usuario', ancho: 100, ocultaPorDefecto: true, titleCelda: (m) => m.created_by || 'Sistema',
    celda: (m) => <span className="block truncate text-xs font-bold text-slate-600">{m.created_by || 'Sistema'}</span> },
];

/** El detalle de un movimiento (un clic en la fila o en la tarjeta): todos sus datos, con Modal de components/ui. */
function DetalleMovimiento({ m, onCerrar }: { m: Movimiento; onCerrar: () => void }) {
  const info = infoDireccionKardex(m.direction);
  const f = textoFechaMovimiento(m.created_at);
  const n = numeroFinito(m.quantity);
  const lineas: [string, string][] = [
    ['Fecha', f.hora ? `${f.dia}, ${f.hora}` : f.dia],
    ['Dirección', info.label],
    ['Cantidad', n === null ? '—' : `${info.signo}${cantidad(Math.abs(n))}`],
    ['SKU', m.sku || `SKU #${m.sku_id ?? ''}`],
    ['Producto', m.product_name || '—'],
    ['Bodega', m.warehouse_name || '—'],
    ['Propietario', etiquetaPropietario(m.owner)],
    ['Documento de origen', numeroMovimiento(m)],
    ['Costo actual del SKU', Number(m.unit_cost_cop) > 0 ? pesos(m.unit_cost_cop) : 'Sin costo registrado'],
    ['Registrado por', m.created_by || 'Sistema'],
  ];
  return (
    // B4 T24 f3 (F90): el título fijo y el número en el subtítulo (sin «Movimiento Movimiento n.º 3» cuando no trae documento).
    <Modal title="Detalle del movimiento" subtitle={[numeroMovimiento(m), m.sku, m.product_name].filter(Boolean).join(' · ')} icon={ArrowRightLeft}
      color="indigo" onClose={onCerrar} footer={(
        <button type="button" onClick={onCerrar}
          className={`rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white hover:bg-slate-800 ${FOCOS.indigo}`}>Cerrar</button>
      )}>
      <dl className="space-y-2 text-xs">
        {lineas.map(([titulo, valor]) => (
          <div key={titulo} className="flex justify-between gap-3 border-b border-slate-100 py-1.5 last:border-b-0">
            <dt className="text-slate-600">{titulo}</dt>
            <dd className="text-right font-bold text-slate-900">{valor}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export default function KardexPage() {
  // ── B4 T18, bloque 1: la carga del servidor (TABLA-inventario punto 8; R5, RP54; D40) ──
  // El estado ÚNICO de la pantalla (página y tamaño: 25 o 50) y los filtros del Kardex (el SKU, la bodega, el propietario, la
  // dirección y las fechas), que van al servidor. Un cambio de filtro cambia el filtro Y vuelve a la página 1 en el MISMO
  // evento: la consulta cambia una sola vez (un solo pedido; antes, dos efectos pedían dos veces). El Kardex no tiene `q`.
  const [estado, despachar, listo] = useEstadoTabla(ID_KARDEX, INICIAL_KARDEX);
  const enKanban = estado.modo === 'kanban';
  const [filtros, setFiltros] = useState<FiltrosKardex>(SIN_FILTROS);
  const { catalogo: bodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');
  const extraLista = useMemo(() => ({ ...extraKardex(filtros), q: null, orden: null }), [filtros]);
  // GET /inventory/kardex con limit y offset del estado; responde {data: {items, total}} (normalizarRespuesta, RP54). esperar:
  // !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista (activo: false, RP35).
  const listado = useListado<Movimiento>({
    ruta: RUTA_KARDEX, estado, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,
  });

  // El tablero solo para ver, en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaKardex: sus direcciones
  // en CSV cruzadas con la dirección elegida, y los demás filtros). Recarga con cualquier filtro (dependencias). Sin q ni orden:
  // el Kardex no los tiene.
  const dependencias = [filtros.skuId, filtros.bodega, filtros.propietario, filtros.direccion, filtros.desde, filtros.hasta];
  const tablero = useTableroKanban<Movimiento>({
    pantalla: ID_KARDEX,
    modo: 'servidor',
    columnas: COLUMNAS_KARDEX,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias,
    cargar: async (columna, { offset, limit, signal }) => {
      const consulta = consultaColumnaKardex(estado, columna, filtros, { limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`${RUTA_KARDEX}?${consulta}`, { signal }));
    },
  });

  // «Actualizar»: la lista, el tablero y el selector. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    recargarBodegas();
  }, [recargarListado, recargarTablero, recargarBodegas]);

  // ── bloque 2: los filtros y la tabla (R5, R26; D40, D41) ──
  const cambiarFiltros = useCallback((cambio: Partial<FiltrosKardex>) => {
    setFiltros((f) => ({ ...f, ...cambio }));
    despachar({ tipo: 'pagina', valor: 1 });
  }, [despachar]);
  const hayFiltros = filtros.skuId !== null || Boolean(filtros.bodega || filtros.propietario || filtros.direccion || filtros.desde || filtros.hasta);
  // La búsqueda del SKU: el texto que se escribe y lo que devuelve /crm/products/search (con su error, nunca una lista vacía
  // falsa). Escribir de nuevo suelta el SKU elegido (el filtro cambia una sola vez).
  const [skuTexto, setSkuTexto] = useState('');
  const [skuBusqueda, setSkuBusqueda] = useState<{ texto: string; filas: OpcionSku[]; error: unknown } | null>(null);
  const buscarSku = skuTexto.trim() !== '' && filtros.skuId === null;
  useEffect(() => {
    if (!buscarSku) return undefined;
    const control = new AbortController();
    const pausa = setTimeout(() => {
      apiFetch(`/crm/products/search?q=${encodeURIComponent(skuTexto)}`, { signal: control.signal })
        .then((r: { data?: OpcionSku[] } | OpcionSku[] | null) => {
          setSkuBusqueda({ texto: skuTexto, filas: Array.isArray(r) ? r : (r?.data ?? []), error: null });
        })
        .catch((err: unknown) => { if (!control.signal.aborted) setSkuBusqueda({ texto: skuTexto, filas: [], error: err }); });
    }, 300);
    return () => { clearTimeout(pausa); control.abort(); };
  }, [buscarSku, skuTexto]);
  const resultadosSku = buscarSku && skuBusqueda?.texto === skuTexto ? skuBusqueda : null;
  // B4 T24 f3 (F88): la lista del autocompletar se cierra con Esc y al salir del campo y de la lista; se abre otra vez al escribir.
  const [skuCerrado, setSkuCerrado] = useState(false);
  const listaSkuAbierta = buscarSku && !skuCerrado;
  const refListaSku = useRef<HTMLDivElement>(null);
  const escribirSku = (texto: string) => {
    setSkuTexto(texto);
    setSkuCerrado(false);
    if (filtros.skuId !== null) cambiarFiltros({ skuId: null });
  };
  const opcionesSku = () => Array.from(refListaSku.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? []);
  const teclaSku = (e: React.KeyboardEvent<HTMLElement>) => {
    if (e.key === 'Escape' && listaSkuAbierta) { e.preventDefault(); e.stopPropagation(); setSkuCerrado(true); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    const opciones = opcionesSku();
    if (!opciones.length) return;
    e.preventDefault();
    const i = opciones.indexOf(document.activeElement as HTMLElement);
    opciones[e.key === 'ArrowDown' ? Math.min(i + 1, opciones.length - 1) : Math.max(i - 1, 0)].focus();
  };
  const saleDelSku = (e: React.FocusEvent<HTMLElement>) => {
    if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setSkuCerrado(true);
  };
  const elegirSku = (o: OpcionSku) => {
    setSkuTexto(o.display || o.product_name || `SKU #${o.id}`);
    cambiarFiltros({ skuId: o.id });
  };
  const quitarFiltros = () => {
    setSkuTexto('');
    cambiarFiltros(SIN_FILTROS);
  };
  const prefs = usePreferenciasTabla(ID_KARDEX, COLUMNAS_TABLA_KARDEX);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const [detalle, setDetalle] = useState<Movimiento | null>(null);
  const abrir = useCallback((m: Movimiento) => setDetalle(m), []);
  // m8 de T15: el «vacío» memoizado dice qué lo deja vacío (los filtros o nada).
  const vacio = useMemo(() => {
    const texto = textoVacioKardex(hayFiltros);
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>
      </div>
    );
  }, [hayFiltros]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };
  // RP54: la cuarentena, la pérdida, la devolución y lo que no tiene dirección solo salen en la lista: con uno de esos filtros
  // el tablero queda vacío, y lo dice.
  const direccionSoloLista = filtros.direccion !== '' && COLUMNAS_KARDEX.every((c) => direccionesDeColumnaKardex(c, filtros.direccion).length === 0);

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/kardex" color="emerald" />

      <div className={CONTENEDOR}>
        <PageHeader icon={ArrowRightLeft} color="emerald"
          title="Movimientos (Kardex)"
          subtitle="Historial inmutable de entradas, salidas, traslados y ajustes de inventario."
          actions={(
            <button type="button" onClick={recargarTodo} className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors ${FOCOS.indigo}`}>
              <RefreshCw size={16} aria-hidden="true" className={listado.recargando || tablero.cargandoInicial ? 'animate-spin' : ''} /> Actualizar
            </button>
          )} />

        {/* B4 T18, bloques 2 y 3 (TABLA-inventario punto 8, KANBAN-resto): la barra con los filtros del Kardex (sin búsqueda
            libre: el servidor no tiene `q`) y la tabla estándar en el servidor, o el tablero solo para ver Entradas · Salidas,
            con los MISMOS filtros. */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <section ref={refTarjeta} className={claseTarjeta}>
            <BarraTabla
              estado={estado}
              onEstado={despachar}
              buscar={false}
              filtros={(
                <>
                  <div className="relative" onKeyDown={teclaSku} onBlur={saleDelSku}>
                    <label className="relative flex items-center">
                      <Search size={14} aria-hidden="true" className="pointer-events-none absolute left-3 text-slate-500" />
                      <input type="search" aria-label="Producto o SKU" placeholder="Producto / SKU…" value={skuTexto}
                        role="combobox" aria-expanded={listaSkuAbierta} aria-controls="kardex-sku-opciones" aria-autocomplete="list"
                        onChange={(e) => escribirSku(e.target.value)}
                        className={`w-44 py-2 pl-8 pr-3 text-xs font-bold ${CONTROL} ${filtros.skuId !== null ? 'border-emerald-400 bg-emerald-50' : ''}`} />
                    </label>
                    {listaSkuAbierta && (
                      <div ref={refListaSku} id="kardex-sku-opciones" role="listbox" aria-label="Productos que coinciden"
                        className="absolute left-0 top-full z-20 mt-1 max-h-48 w-64 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
                        {resultadosSku === null ? (
                          <p role="status" className="px-3 py-2 text-xs text-slate-600">Buscando…</p>
                        ) : resultadosSku.error ? (
                          <p role="alert" className="px-3 py-2 text-xs font-semibold text-rose-800">
                            {textoDeError(resultadosSku.error, 'No se pudo buscar el producto')}
                          </p>
                        ) : resultadosSku.filas.length === 0 ? (
                          <p className="px-3 py-2 text-xs text-slate-600">Ningún producto coincide con «{skuTexto.trim()}».</p>
                        ) : resultadosSku.filas.map((o) => (
                          <button key={o.id} type="button" role="option" aria-selected={false} onClick={() => elegirSku(o)}
                            className={`block w-full border-b border-slate-50 px-3 py-2 text-left text-xs text-slate-800 last:border-0 hover:bg-slate-50 ${FOCOS.indigo}`}>
                            {o.display || o.product_name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <SelectorCatalogo etiqueta="Bodega" todas="Todas las bodegas" cargando="Cargando bodegas…"
                    fallo="No se pudieron cargar las bodegas" catalogo={bodegas} valor={filtros.bodega}
                    onCambiar={(bodega) => cambiarFiltros({ bodega })} onReintentar={recargarBodegas} icono={Warehouse} />
                  <select aria-label="Dirección" value={filtros.direccion} onChange={(e) => cambiarFiltros({ direccion: e.target.value })} className={CONTROL}>
                    <option value="">Todas las direcciones</option>
                    {ORDEN_DIRECCIONES.map((d) => <option key={d} value={d}>{DIRECCIONES_KARDEX[d].label}</option>)}
                  </select>
                  <select aria-label="Propietario" value={filtros.propietario} onChange={(e) => cambiarFiltros({ propietario: e.target.value })} className={CONTROL}>
                    <option value="">Todos los propietarios</option>
                    {['NEBULAE', 'MAU'].map((o) => <option key={o} value={o}>{etiquetaPropietario(o)}</option>)}
                  </select>
                  <label className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                    Desde
                    <input type="date" aria-label="Desde" value={filtros.desde} max={filtros.hasta || undefined}
                      onChange={(e) => cambiarFiltros({ desde: e.target.value })} className={CONTROL} />
                  </label>
                  <label className="inline-flex items-center gap-1 text-xs font-bold text-slate-600">
                    Hasta
                    <input type="date" aria-label="Hasta" value={filtros.hasta} min={filtros.desde || undefined}
                      onChange={(e) => cambiarFiltros({ hasta: e.target.value })} className={CONTROL} />
                  </label>
                  <span className="inline-flex items-center rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2 text-xs font-semibold text-slate-600"
                    title="El Kardex no se reordena: el servidor lo entrega siempre por fecha">
                    Orden: {TEXTO_ORDEN_KARDEX}
                  </span>
                  {hayFiltros && (
                    <button type="button" onClick={quitarFiltros}
                      className={`inline-flex items-center gap-1 rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 ${FOCOS.indigo}`}>
                      <X size={13} aria-hidden="true" /> Quitar filtros
                    </button>
                  )}
                </>
              )}
              ajustes={{ columnas: COLUMNAS_TABLA_KARDEX, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={enKanban ? undefined : { completa, alternar }}
              color="indigo"
              {...totalDeLaBarra}
            />
            {/* La tabla estándar en el servidor: la paginación (25 o 50) es de la tabla; un clic en la fila abre el detalle. */}
            {!enKanban && (
              <TablaEstandar
                id={ID_KARDEX}
                modo="servidor"
                columnas={COLUMNAS_TABLA_KARDEX}
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
                onFila={abrir}
                vacio={vacio}
                etiqueta="Movimientos del Kardex"
              />
            )}
          </section>
          {enKanban ? (
            /* KANBAN-resto, RP54: Entradas · Salidas, solo para ver: sin regla, con su motivo. El clic abre el detalle. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER_KARDEX}
              tarjetaDe={tarjetaMovimiento}
              onAbrir={abrir}
              color="indigo"
              vacio="Sin movimientos aquí"
              aviso={direccionSoloLista
                ? <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-amber-800">La dirección elegida solo se ve en la lista.</p>
                : undefined}
            />
          ) : null}
        </div>
      </div>

      {/* B4 T18, bloque 5: el detalle del movimiento (un clic en la fila o en la tarjeta). */}
      {detalle && <DetalleMovimiento m={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
