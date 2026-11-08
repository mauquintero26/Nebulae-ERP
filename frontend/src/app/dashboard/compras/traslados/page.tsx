'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeftRight, BarChart3, Eye, Plus, RefreshCw, X } from 'lucide-react';
// B4 T16B: Traslados 100 % sobre el servidor (R5, C3, C4): la tabla estándar con las columnas compartidas con Inventario (columnas-
// traslado.tsx), las pestañas En proceso · Completados · Cancelados · Todos, el tablero solo para ver en modo cliente (hasta 200),
// las tarjetas tras_* de los conteos del servidor, la fecha REAL del traslado y «Ver análisis» en lugar de la IA simulada (R2,
// R13). Se conserva lo de B1 a B3: crear un traslado (bodegas, productos y notas), el Drawer «Ver detalle» y su enlace ?id=.
import {
  SubNav, PageHeader, Drawer, Modal, Button, ContenidoEnlace, MenuFila, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi,
  TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, PestanaTabla } from '@/components/tabla';
import { COMP_NAV } from '../comp-nav';
import {
  BodegasTraslado, CeldaEstadoTraslado, columnasTraslado, titulosDeOrdenTraslado,
} from '../columnas-traslado';
import type { BodegaTraslado, FilaColumnasTraslado } from '../columnas-traslado';

import { apiFetch } from '@/lib/api';
import { accionModo, estadoDelTotal, normalizarRespuesta } from '@/lib/tabla';
import { tarjetasTraslados } from '@/lib/kpis';
import { textoDeError } from '@/lib/avisos';
import { fechaLarga } from '@/lib/fechas-colombia';
import { ordenEsAtencion, textoOrdenHub } from '@/lib/hub-ventas';
import { accionVistaEnLista } from '@/lib/listas-ventas';
import {
  COLUMNAS_TRASLADO, OPCIONES_ESTADOS_TABLERO_TRASLADO, TOPE_TABLERO_COMPRAS, conteosTraslado, consultaTableroTraslados,
  consultaTraslados, nombreBodega, numeroTraslado, opcionesEstadosTraslado, tarjetaTraslado, textoVacioTraslados,
} from '@/lib/estados-compras';
import { ENLACE_VER_ANALISIS_COMPRAS } from '@/lib/flujo-compras';

/** Una fila de GET /inventory/operations?operation_type=TRANSFER (InventoryOperationResponse + `fecha`, T13). */
type FilaTraslado = FilaColumnasTraslado & {
  shipping_method_name?: string | null;
  notas?: string | null;
};
/** Un producto buscado para armar un traslado (GET /crm/products/search). */
type ProductoBuscado = { id: number; display?: string; product_name?: string };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_TRASLADOS = 'compras.traslados';
/** La pestaña de trabajo (como hoy): En proceso. */
const INICIAL_TRASLADOS = { vista: 'en_proceso' };
const RUTA_OPERACIONES = '/inventory/operations';
/** Los conteos de TODOS los traslados (sin búsqueda ni filtros) para las tarjetas: solo el total y los conteos, sin filas. */
const RUTA_CONTEOS = `${RUTA_OPERACIONES}?operation_type=TRANSFER&limit=0&con_conteos=1`;
/** El motivo de un tablero solo para ver (R11, KANBAN-logistica punto 5). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: los traslados no cambian de estado desde aquí.';
/** El contenedor de los Hubs y de las listas del bloque (T7 a T16A): pb-24 deja libre la esquina del botón de la IA. */
const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';
const FOCO_VISIBLE = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-700';

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
const AccionesFila = React.createContext<{ abrir: (t: FilaTraslado) => void } | null>(null);

/** Acciones (R11): el menú ⋯ (MenuFila: clic y portal) con «Ver detalle», que abre el Drawer. Lleva el número en su nombre. */
function CeldaAcciones({ t }: { t: FilaTraslado }) {
  const acciones = React.useContext(AccionesFila);
  const items: ItemMenuFila[] = [{ etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(t) }];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${numeroTraslado(t)}`} />
    </span>
  );
}

/**
 * B4 T16B, la tabla (TABLA-compras punto 11; R26, D41): las columnas de columnas-traslado.tsx (compartidas con Inventario ›
 * Traslados, T19) con la celda de Acciones de esta lista. Una constante (estable, D40). Todas se ven por defecto (680 px).
 */
const COLUMNAS_TABLA_TRASLADOS = columnasTraslado<FilaTraslado>((t) => <CeldaAcciones t={t} />);
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_TRASLADOS = titulosDeOrdenTraslado(COLUMNAS_TABLA_TRASLADOS);

/** Las pestañas (sin emojis): En proceso · Completados · Cancelados · Todos, con los conteos del servidor (null mientras cargan: barra gris). */
function pestanasDeTraslados(conteos: unknown): PestanaTabla[] {
  const c = conteosTraslado(conteos);
  return [
    { id: 'en_proceso', etiqueta: 'En proceso', conteo: c.en_proceso },
    { id: 'completadas', etiqueta: 'Completados', conteo: c.completadas },
    { id: 'canceladas', etiqueta: 'Cancelados', conteo: c.canceladas },
    { id: 'todos', etiqueta: 'Todos', conteo: c.todos },
  ];
}

/** El estado del traslado que el tablero muestra en cada columna, y el día en que se hizo. */
const columnaDeTraslado = (t: FilaTraslado) => t.status;
const fechaDeTraslado = (t: FilaTraslado) => t.fecha;

/* ================================================================
   MAIN PAGE — TrasladosPage (B4 T16B)
   ================================================================ */
export default function TrasladosPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { avisar, avisarError } = useAvisos();

  // ── bloque 1: la carga del servidor (TABLA-compras punto 11; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, las tarjetas, la tabla y el tablero despachan a
  // él. El modo (Lista o Kanban) se guarda en vista:compras.traslados.
  const [estado, despachar, listo] = useEstadoTabla(ID_TRASLADOS, INICIAL_TRASLADOS);
  const enKanban = estado.modo === 'kanban';

  // La tabla: la página (25 o 50) de GET /inventory/operations?operation_type=TRANSFER. La pestaña viaja como `status` (consultaTraslados),
  // cruzada con el filtro. esperar: !listo (D40): el esqueleto, nunca «vacío». Los conteos de las pestañas vienen en la MISMA llamada.
  const extraDeLaLista = useMemo(() => consultaTraslados(estado), [estado]);
  const listado = useListado<FilaTraslado>({
    ruta: RUTA_OPERACIONES, estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero (modo cliente): los 200 más recientes con el mismo estado, otra consulta activa solo en Kanban (la tabla nunca se ve
  // con las 200 filas del tablero).
  const extraDelTablero = useMemo(() => consultaTableroTraslados(estado), [estado]);
  const completa = useListado<FilaTraslado>({
    ruta: RUTA_OPERACIONES, estado, esperar: !listo, activo: enKanban, extra: extraDelTablero,
  });

  // Las bodegas (GET /inventory/warehouses): los nombres de origen y destino y la tarjeta «Bodegas». Si falla, se dice con
  // «Reintentar» (los nombres salen como «Bodega #id»); nunca se traga en silencio.
  const [vueltaBodegas, setVueltaBodegas] = useState(0);
  const [bodegasCargadas, setBodegasCargadas] = useState<{ vuelta: number; filas: BodegaTraslado[]; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch('/inventory/warehouses', { signal: control.signal })
      .then((r: unknown) => setBodegasCargadas({ vuelta: vueltaBodegas, filas: normalizarRespuesta(r).filas as BodegaTraslado[], error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setBodegasCargadas({ vuelta: vueltaBodegas, filas: [], error: err }); });
    return () => control.abort();
  }, [vueltaBodegas]);
  const cargandoBodegas = bodegasCargadas?.vuelta !== vueltaBodegas;
  const bodegas = bodegasCargadas?.error == null ? (bodegasCargadas?.filas ?? null) : null;
  const errorBodegas = !cargandoBodegas && bodegasCargadas?.error != null ? bodegasCargadas.error : null;
  const estadoBodegas = useEstadoKpi(cargandoBodegas, errorBodegas);

  // Las tarjetas (KPI-compras punto 10; R7, R12): los conteos de TODOS los traslados (GET …?limit=0&con_conteos=1: sin la búsqueda
  // ni los filtros de la tabla), sin respaldo local. Mientras no llegan, 'cargando' (nunca 0); si fallan, «—».
  const [vueltaConteos, setVueltaConteos] = useState(0);
  const [totales, setTotales] = useState<{ vuelta: number; conteos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch(RUTA_CONTEOS, { signal: control.signal })
      .then((r: unknown) => setTotales({ vuelta: vueltaConteos, conteos: normalizarRespuesta(r).conteos, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setTotales({ vuelta: vueltaConteos, conteos: null, error: err }); });
    return () => control.abort();
  }, [vueltaConteos]);
  const cargandoTotales = totales?.vuelta !== vueltaConteos;
  const estadoKpis = useEstadoKpi(cargandoTotales, cargandoTotales ? null : (totales?.error ?? null));
  const tarjetas = tarjetasTraslados(conteosTraslado(totales?.conteos ?? null), bodegas ? bodegas.length : null);

  // «Actualizar» y lo que sigue a crear un traslado: la tabla con sus conteos, el tablero (el que no se ve se recarga al activarse) y
  // las tarjetas. Ninguna recarga vacía lo que se ve: los hooks conservan lo último.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarCompleta } = completa;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarCompleta();
    setVueltaConteos((n) => n + 1);
  }, [recargarListado, recargarCompleta]);

  // ── bloque 5: el Drawer «Ver detalle» y su enlace ?id= (B1 a B3) ──
  // El HUB de Inventario enlaza aquí con ?id=<operation_id>. Como la tabla ya pagina en el servidor, el traslado se pide por su
  // número (q=TRL-0012) en lugar de buscarlo entre los cargados; si no existe o falla, se dice.
  const [selected, setSelected] = useState<FilaTraslado | null>(null);
  const idDeLaUrl = searchParams.get('id');
  const idAbierto = useRef<string | null>(null);
  useEffect(() => {
    if (!idDeLaUrl || idAbierto.current === idDeLaUrl) return undefined;
    const id = Number(idDeLaUrl);
    if (!Number.isInteger(id) || id <= 0) return undefined;
    idAbierto.current = idDeLaUrl;
    const control = new AbortController();
    apiFetch(`${RUTA_OPERACIONES}?operation_type=TRANSFER&q=${encodeURIComponent(numeroTraslado({ id }))}&limit=5`, { signal: control.signal })
      .then((r: unknown) => {
        const encontrada = (normalizarRespuesta(r).filas as FilaTraslado[]).find((t) => t.id === id);
        if (encontrada) setSelected(encontrada);
        else avisar(`No se encontró el traslado ${numeroTraslado({ id })}.`, { tono: 'info' });
      })
      .catch((err: unknown) => { if (!control.signal.aborted) { idAbierto.current = null; avisarError(err, 'No se pudo abrir el traslado'); } });
    return () => control.abort();
  }, [idDeLaUrl, avisar, avisarError]);
  const abrir = useCallback((t: FilaTraslado) => setSelected(t), []);
  const closeSelected = useCallback(() => {
    setSelected(null);
    if (searchParams.get('id')) router.replace(pathname);
  }, [searchParams, router, pathname]);
  const accionesFila = useMemo(() => ({ abrir }), [abrir]);

  // ── crear un traslado (B1 a B3, sin cambios de comportamiento) ──
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ origen_id: '', destino_id: '', notas: '', productos: [] as { sku_id: number | null; product_name: string; qty: number }[] });
  const [newProd, setNewProd] = useState<{ sku_id: number | null; product_name: string; qty: number }>({ sku_id: null, product_name: '', qty: 1 });
  const [productResults, setProductResults] = useState<ProductoBuscado[]>([]);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onProductSearch(q: string) {
    setNewProd((p) => ({ ...p, product_name: q, sku_id: null }));
    if (productTimer.current) clearTimeout(productTimer.current);
    if (!q.trim()) { setProductResults([]); return; }
    productTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch('/crm/products/search?q=' + encodeURIComponent(q));
        setProductResults(Array.isArray(d) ? d : (d?.data ?? []));
      } catch (err) {
        setProductResults([]);
        avisarError(err, 'No se pudo buscar el producto');
      }
    }, 300);
  }
  function addProd() {
    if (!newProd.sku_id) return;
    setForm((f) => ({ ...f, productos: [...f.productos, { ...newProd }] }));
    setNewProd({ sku_id: null, product_name: '', qty: 1 });
    setProductResults([]);
  }
  async function createTraslado(e: React.FormEvent) {
    e.preventDefault();
    if (!form.origen_id || !form.destino_id) { avisar('Selecciona bodega origen y destino', { tono: 'error' }); return; }
    if (!form.productos.length) { avisar('Agrega al menos un producto', { tono: 'error' }); return; }
    setSaving(true);
    try {
      await apiFetch(RUTA_OPERACIONES, {
        method: 'POST',
        body: JSON.stringify({
          source_warehouse_id: parseInt(form.origen_id, 10),
          dest_warehouse_id: parseInt(form.destino_id, 10),
          operation_type: 'TRANSFER',
          movements: form.productos.map((p) => ({ sku_id: p.sku_id, quantity: Number(p.qty) })),
          notas: form.notas,
          created_by: localStorage.getItem('user_name') || '',
        }),
      });
      avisar('Traslado creado', { tono: 'ok' });
      setShowCreate(false);
      setForm({ origen_id: '', destino_id: '', notas: '', productos: [] });
      recargarTodo();
    } catch (err) {
      avisarError(err, 'No se pudo crear el traslado');
    }
    setSaving(false);
  }

  // ── bloque 2: la tabla (TABLA-compras punto 11; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_TRASLADOS, COLUMNAS_TABLA_TRASLADOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa: pantallaCompleta, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasDeTraslados(listado.conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo, con la regla de accionPestana.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_TRASLADO : opcionesEstadosTraslado));
    } else despachar(accion);
  }, [estado, despachar]);
  // R8: ordenada por una columna, el chip «Orden: … · Más recientes» vuelve al orden del servidor.
  const textoOrden = enKanban || !estado.orden || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_TRASLADOS);
  const vacio = useMemo(() => {
    const texto = textoVacioTraslados({ vista: estado.vista, q: estado.q, estados: estado.estados });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.vista, estado.q, estado.estados]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };

  // ── bloque 3: el tablero solo para ver (KANBAN-logistica punto 5; R11, C4, RP95) ──
  // Modo cliente: los traslados de la consulta completa agrupados por su estado (columnaDeTraslado). Mientras llegan, el tablero carga
  // (items null); items estable: useMemo. El clic abre el mismo Drawer que la fila.
  const itemsTablero = useMemo<FilaTraslado[] | null>(
    () => (completa.cargandoInicial || (completa.error != null && completa.filas.length === 0) ? null : completa.filas),
    [completa.cargandoInicial, completa.filas, completa.error],
  );
  const tablero = useTableroKanban<FilaTraslado>({
    pantalla: ID_TRASLADOS,
    modo: 'cliente',
    columnas: COLUMNAS_TRASLADO,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    items: itemsTablero,
    columnaDe: columnaDeTraslado,
    fechaMovimiento: fechaDeTraslado,
  });
  const tarjetaDe = useCallback((t: FilaTraslado) => tarjetaTraslado(t, bodegas), [bodegas]);
  const hayMasDelTope = enKanban && !completa.cargandoInicial && (completa.total ?? 0) > TOPE_TABLERO_COMPRAS;
  const errorTablero = enKanban && completa.error != null;
  const avisoTablero = (hayMasDelTope || errorTablero) ? (
    <div className="flex flex-col gap-1">
      {errorTablero && (
        <p role="alert">
          {textoDeError(completa.error, 'No se pudieron cargar los traslados')}.{' '}
          <button type="button" onClick={completa.recargar} className={`rounded font-bold text-orange-700 underline ${FOCO_VISIBLE}`}>Reintentar</button>
        </p>
      )}
      {hayMasDelTope && <p>Se muestran los 200 más recientes de {completa.total} traslados. Busca o filtra para ver el resto.</p>}
    </div>
  ) : undefined;

  // ── bloque 4: las tarjetas (KPI-compras punto 10; R5, R12) ──
  // En proceso, Completados y Total abren su pestaña (D41: como un clic en ella; tocar la activa vuelve a Todos). En Kanban abren esa
  // pestaña en Lista. Bodegas es informativa.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = vistaActiva === vista ? 'todos' : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosTraslado));
  };
  const actualizando = listado.recargando || completa.recargando || (cargandoTotales && totales !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath={pathname} color="orange" hub={{ href: '/dashboard/compras' }} />

      <div className={CONTENEDOR}>

        <PageHeader icon={ArrowLeftRight} color="orange"
          title="Traslados Internos"
          subtitle="Movimiento de mercancía entre bodegas propias de la empresa."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              {/* R13 (ANALISIS-compras punto 5): «Ver análisis» abre el Análisis del Hub de Compras (?tab=analisis). */}
              <Link href={ENLACE_VER_ANALISIS_COMPRAS}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-orange-50 hover:text-orange-800 hover:border-orange-200 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
              </Link>
              <Button color="orange" size="lg" icon={Plus} onClick={() => setShowCreate(true)}>Nuevo Traslado</Button>
            </div>
          )} />

        {/* B4 T16B (KPI-compras punto 10; R7, R12): las 4 tarjetas con los conteos de TODOS los traslados: mientras cargan, barras
            grises (nunca 0); con error, «—». En proceso, Completados y Total abren su pestaña; Bodegas es informativa. */}
        <FranjaKpis estado={estadoKpis} titulo="Traslados">
          <TarjetaKpi kpi="tras_en_proceso" valor={tarjetas.en_proceso.valor}
            activo={vistaActiva === 'en_proceso'} onClick={() => elegirVista('en_proceso')} />
          <TarjetaKpi kpi="tras_completados" valor={tarjetas.completados.valor}
            activo={vistaActiva === 'completadas'} onClick={() => elegirVista('completadas')} />
          <TarjetaKpi kpi="bodegas" valor={tarjetas.bodegas.valor} estado={estadoBodegas} />
          <TarjetaKpi kpi="tras_total" valor={tarjetas.total.valor}
            activo={vistaActiva === 'todos'} onClick={() => elegirVista('todos')} />
        </FranjaKpis>

        {errorBodegas != null && (
          <p role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-900">
            {textoDeError(errorBodegas, 'No se pudieron cargar las bodegas')}. Los nombres salen como «Bodega #N».{' '}
            <button type="button" onClick={() => setVueltaBodegas((n) => n + 1)} className={`rounded font-bold underline ${FOCO_VISIBLE}`}>Reintentar</button>
          </p>
        )}

        {/* B4 T16B (TABLA-compras punto 11, KANBAN-logistica punto 5): la barra y la tabla estándar en el servidor, o el tablero
            solo para ver en modo cliente, con el MISMO estado (búsqueda y estados). En Kanban las pestañas no se ven (el tablero
            trae todos los estados por columna). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <BodegasTraslado.Provider value={bodegas}>
              <section ref={refTarjeta} className={claseTarjeta}>
                <BarraTabla
                  estado={estado}
                  onEstado={alCambiarBarra}
                  pestanas={enKanban ? undefined : pestanas}
                  estadoConteos={estadoConteos}
                  placeholder="Buscar por traslado (TRL-…), notas, guía o documento…"
                  opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_TRASLADO : opcionesEstadosTraslado}
                  filtros={textoOrden ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                      {textoOrden}
                      <span aria-hidden="true">·</span>
                      <button type="button" onClick={() => despachar({ tipo: 'orden', valor: null })}
                        className={`rounded font-bold text-orange-700 hover:underline ${FOCO_VISIBLE}`}>
                        Más recientes
                      </button>
                    </span>
                  ) : undefined}
                  ajustes={{ columnas: COLUMNAS_TABLA_TRASLADOS, preferencias: prefs, anchoRef: anchoTablaRef }}
                  kanbanDisponible
                  pantallaCompleta={enKanban ? undefined : { completa: pantallaCompleta, alternar }}
                  color="orange"
                  {...totalDeLaBarra}
                />
                {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden por columna son de la tabla; un clic en la
                    fila abre el Drawer. */}
                {!enKanban && (
                  <TablaEstandar
                    id={ID_TRASLADOS}
                    modo="servidor"
                    columnas={COLUMNAS_TABLA_TRASLADOS}
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
                    etiqueta="Traslados"
                  />
                )}
              </section>
            </BodegasTraslado.Provider>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 5: Borrador · Listo · Hecho (plegada) · Cancelado (plegada), solo para ver: sin regla, con su
               motivo. El clic abre el Drawer, como la fila. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER}
              tarjetaDe={tarjetaDe}
              onAbrir={abrir}
              aviso={avisoTablero}
              color="orange"
              vacio="Sin traslados aquí"
            />
          ) : null}
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <Drawer onClose={closeSelected} header={(
          <div>
            <h2 className="font-extrabold text-slate-900 text-xl">{numeroTraslado(selected)}</h2>
            <p className="text-xs text-slate-500 mt-0.5">Traslado Interno</p>
            <div className="mt-2"><CeldaEstadoTraslado t={selected} /></div>
          </div>
        )}>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Bodega Origen</p>
              <p className="font-bold text-sm text-slate-800">{nombreBodega(bodegas, selected.source_warehouse_id)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Bodega Destino</p>
              <p className="font-bold text-sm text-slate-800">{nombreBodega(bodegas, selected.dest_warehouse_id)}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Fecha</p>
              <p className="font-bold text-sm">{fechaLarga(selected.fecha) || '—'}</p>
            </div>
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Método de Envío</p>
              <p className="font-bold text-sm">{selected.shipping_method_name || 'Interno'}</p>
            </div>
          </div>
          {selected.tracking_number && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Tracking</p>
              <p className="font-mono text-sm font-bold">{selected.tracking_number}</p>
            </div>
          )}
          {(selected.movements || []).filter((m) => m.direction !== 'TRANSFER_IN').length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-2">Productos</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr className="text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                  </tr></thead>
                  <tbody>
                    {(selected.movements || []).filter((m) => m.direction !== 'TRANSFER_IN').map((p, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-3 py-2 font-medium">SKU #{p.sku_id}</td>
                        <td className="px-3 py-2 text-right font-bold">{p.quantity || 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Drawer>
      )}

      {/* Create Modal */}
      {showCreate && (
        <Modal title="Nuevo Traslado Interno" subtitle="Mover mercancía entre bodegas" icon={ArrowLeftRight} color="orange"
          onClose={() => setShowCreate(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" form="traslado-form" color="orange" loading={saving} icon={ArrowLeftRight}>
                {saving ? 'Creando...' : 'Crear Traslado'}
              </Button>
            </>
          )}>
          <form id="traslado-form" onSubmit={createTraslado} className="space-y-4">
            <div>
              <label htmlFor="traslado-origen" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega Origen *</label>
              <select id="traslado-origen" required value={form.origen_id} onChange={(e) => setForm((f) => ({ ...f, origen_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400">
                <option value="">Seleccionar bodega origen...</option>
                {(bodegas ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="traslado-destino" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega Destino *</label>
              <select id="traslado-destino" required value={form.destino_id} onChange={(e) => setForm((f) => ({ ...f, destino_id: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-orange-400">
                <option value="">Seleccionar bodega destino...</option>
                {(bodegas ?? []).filter((w) => String(w.id) !== form.origen_id).map((w) => (
                  <option key={w.id} value={w.id}>{w.name}</option>
                ))}
              </select>
            </div>

            {/* Products */}
            <div>
              <label className="block text-xs font-black text-slate-500 uppercase mb-2">Productos a Trasladar</label>
              {form.productos.length > 0 && (
                <div className="mb-3 border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50"><tr className="text-slate-500">
                      <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Cant.</th><th></th>
                    </tr></thead>
                    <tbody>
                      {form.productos.map((p, i) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="px-3 py-2">{p.product_name}</td>
                          <td className="px-3 py-2 text-right">{p.qty}</td>
                          <td className="px-3 py-2">
                            <button type="button" aria-label={`Quitar ${p.product_name}`} onClick={() => setForm((f) => ({ ...f, productos: f.productos.filter((_, j) => j !== i) }))}
                              className={`rounded text-red-600 ${FOCO_VISIBLE}`}><X size={11} aria-hidden="true" /></button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <div className="grid grid-cols-4 gap-2">
                <div className="col-span-3 relative">
                  <input placeholder="Buscar producto..." aria-label="Buscar producto" value={newProd.product_name}
                    onChange={(e) => onProductSearch(e.target.value)}
                    className={`w-full border rounded-xl px-3 py-2 text-sm outline-none ${newProd.sku_id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`} />
                  {productResults.length > 0 && !newProd.sku_id && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                      {productResults.map((p) => (
                        <button key={p.id} type="button"
                          onClick={() => { setNewProd((n) => ({ ...n, sku_id: p.id, product_name: p.display || p.product_name || '' })); setProductResults([]); }}
                          className="w-full text-left px-4 py-2.5 hover:bg-orange-50 text-sm border-b last:border-0 border-slate-50">
                          {p.display || p.product_name}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <input type="number" placeholder="Cant." aria-label="Cantidad" min={1} value={newProd.qty}
                  onChange={(e) => setNewProd((p) => ({ ...p, qty: parseInt(e.target.value, 10) || 1 }))}
                  className="border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none text-center" />
              </div>
              <button type="button" onClick={addProd}
                className={`mt-2 w-full border border-dashed border-orange-300 text-orange-700 rounded-xl py-2 text-xs font-bold hover:bg-orange-50 flex items-center justify-center gap-1 ${FOCO_VISIBLE}`}>
                <Plus size={13} aria-hidden="true" /> Agregar producto
              </button>
            </div>

            <div>
              <label htmlFor="traslado-notas" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas</label>
              <textarea id="traslado-notas" rows={2} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
