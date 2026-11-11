'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, ChevronRight, Eye, Package, RefreshCw } from 'lucide-react';
// B4 T19: Traslados Internos de Inventario 100 % sobre el servidor (R5, C3, C4): la tabla estándar con las columnas COMPARTIDAS con
// Compras (compras/columnas-traslado.tsx), la Fecha REAL del traslado (antes era la de creación, que la tabla no tiene), las pestañas
// En proceso · Completados · Cancelados · Todos, el tablero solo para ver en modo cliente (hasta 200) y las tarjetas tras_* de los
// conteos del servidor. Se conserva lo de B1 a B3: el Drawer «Ver detalle» con sus productos y el enlace a Compras, donde se
// gestionan (esta pantalla no crea ni cambia traslados).
import {
  SubNav, PageHeader, Drawer, MenuFila, FranjaKpis, TarjetaKpi, useEstadoKpi, TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla } from '@/components/tabla';
import { INV_NAV } from '../inv-nav';
import { AvisoReintentar, CONTENEDOR, FOCOS, useCatalogo } from '../piezas-inventario';
import { BodegasTraslado, CeldaEstadoTraslado, columnasTraslado, titulosDeOrdenTraslado } from '../../compras/columnas-traslado';
import type { FilaColumnasTraslado } from '../../compras/columnas-traslado';

import { apiFetch } from '@/lib/api';
import { accionModo, accionVistaEnLista, estadoDelTotal, normalizarRespuesta, ordenEsAtencion, textoOrdenHub } from '@/lib/tabla';
import { lecturaDeCarga, tarjetasTraslados } from '@/lib/kpis';
import { textoDeError } from '@/lib/avisos';
import { fechaLarga } from '@/lib/fechas-colombia';
import {
  COLUMNAS_TRASLADO, OPCIONES_ESTADOS_TABLERO_TRASLADO, RUTA_CONTEOS_TRASLADOS, avisoTope200, columnaDeTraslado, conteosTraslado,
  consultaTableroTraslados, consultaTraslados, fechaDeTraslado, nombreBodega, numeroTraslado, opcionesEstadosTraslado, pestanasTraslado,
  tarjetaTraslado, textoVacioTraslados, vistaDeTarjetaTraslado,
} from '@/lib/estados-compras';

/** Una fila de GET /inventory/operations?operation_type=TRANSFER (InventoryOperationResponse + `fecha`, T13). */
type FilaTraslado = FilaColumnasTraslado & { shipping_method_name?: string | null; notas?: string | null };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_TRASLADOS = 'inventario.traslados';
/** Como la pantalla de hoy: se ven todos; las pestañas separan lo que sigue en proceso. */
const INICIAL_TRASLADOS = { vista: 'todos' };
const RUTA_OPERACIONES = '/inventory/operations';
/** El motivo de un tablero solo para ver (R11, KANBAN-logistica punto 5). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: los traslados no cambian de estado desde aquí.';

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
const AccionesFila = React.createContext<{ abrir: (t: FilaTraslado) => void; gestionar: (t: FilaTraslado) => void } | null>(null);

/** Acciones (R11): el menú ⋯ (MenuFila: clic y portal) con «Ver detalle», que abre el Drawer. Lleva el número en su nombre. */
function CeldaAcciones({ t }: { t: FilaTraslado }) {
  const acciones = React.useContext(AccionesFila);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(t) },
    { etiqueta: 'Gestionar en Compras', icono: ChevronRight, onClick: () => acciones?.gestionar(t) },
  ];
  return (
    <span className="flex items-center justify-end">
      <MenuFila items={items} etiqueta={`Acciones de ${numeroTraslado(t)}`} />
    </span>
  );
}

/**
 * B4 T19, la tabla (TABLA-inventario punto 11; R26, D41): las columnas de columnas-traslado.tsx (compartidas con Compras › Traslados)
 * con la celda de Acciones de esta pantalla. Una constante (estable, D40). Todas se ven por defecto (720 px).
 */
/** R26 (m9): la celda de Acciones lleva solo el ⋯; 104+130+130+88+92+96+56 = 696 px contra los 704 de la caja a 1024 px con el menú abierto. */
const ANCHO_ACCIONES_TRASLADOS = 56;
const COLUMNAS_TABLA_TRASLADOS = columnasTraslado<FilaTraslado>((t) => <CeldaAcciones t={t} />, ANCHO_ACCIONES_TRASLADOS);
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_TRASLADOS = titulosDeOrdenTraslado(COLUMNAS_TABLA_TRASLADOS);

/* ================================================================
   MAIN PAGE — InventarioTrasladosPage (B4 T19)
   ================================================================ */
export default function InventarioTrasladosPage() {
  const router = useRouter();
  // ── bloque 1: la carga del servidor (TABLA-inventario punto 11; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, las tarjetas, la tabla y el tablero despachan a
  // él. El modo (Lista o Kanban) se guarda en vista:inventario.traslados.
  const [estado, despachar, listo] = useEstadoTabla(ID_TRASLADOS, INICIAL_TRASLADOS);
  const enKanban = estado.modo === 'kanban';
  const [selected, setSelected] = useState<FilaTraslado | null>(null);

  // La tabla: la página (25 o 50) de GET /inventory/operations?operation_type=TRANSFER. La pestaña viaja como `status`
  // (consultaTraslados), cruzada con el filtro. esperar: !listo (D40): el esqueleto, nunca «vacío». Los conteos de las pestañas
  // vienen en la MISMA llamada.
  const extraDeLaLista = useMemo(() => consultaTraslados(estado), [estado]);
  const listado = useListado<FilaTraslado>({
    ruta: RUTA_OPERACIONES, estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero (modo cliente): los 200 más recientes con el mismo estado, otra consulta activa solo en Kanban.
  const extraDelTablero = useMemo(() => consultaTableroTraslados(estado), [estado]);
  const completa = useListado<FilaTraslado>({
    ruta: RUTA_OPERACIONES, estado, esperar: !listo, activo: enKanban, extra: extraDelTablero,
  });

  // Las bodegas (GET /inventory/warehouses): los nombres de origen y destino y la tarjeta «Bodegas». Si falla, se dice con
  // «Reintentar» (los nombres salen como «Bodega #id»); nunca se traga en silencio.
  const { catalogo: catalogoBodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');
  const bodegas = catalogoBodegas.filas;
  const errorBodegas = bodegas === null ? catalogoBodegas.error : null;
  const estadoBodegas = useEstadoKpi(bodegas === null && catalogoBodegas.error == null, errorBodegas);

  // Las tarjetas (KPI-compras punto 10, KPI-inventario; R7, R12): los conteos de TODOS los traslados (GET …?limit=0&con_conteos=1:
  // sin la búsqueda ni los filtros de la tabla), sin respaldo local. Mientras no llegan, 'cargando' (nunca 0); si fallan, «—».
  const [vueltaConteos, setVueltaConteos] = useState(0);
  const [totales, setTotales] = useState<{ vuelta: number; conteos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch(RUTA_CONTEOS_TRASLADOS, { signal: control.signal })
      .then((r: unknown) => setTotales({ vuelta: vueltaConteos, conteos: normalizarRespuesta(r).conteos, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setTotales({ vuelta: vueltaConteos, conteos: null, error: err }); });
    return () => control.abort();
  }, [vueltaConteos]);
  // I3 (r1): una recarga conserva el último valor (actualizando); solo la primera carga va en cargando.
  const { datos: conteosTotales, cargando: cargandoTotales } = lecturaDeCarga(totales && { vuelta: totales.vuelta, datos: totales.conteos, error: totales.error }, vueltaConteos);
  const errorTotales = cargandoTotales ? null : (totales?.error ?? null);
  const estadoKpis = useEstadoKpi(cargandoTotales, errorTotales);
  const tarjetas = tarjetasTraslados(conteosTraslado(conteosTotales), bodegas ? bodegas.length : null);

  // «Actualizar»: la tabla con sus conteos, el tablero, las tarjetas y las bodegas. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarCompleta } = completa;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarCompleta();
    setVueltaConteos((n) => n + 1);
    recargarBodegas();
  }, [recargarListado, recargarCompleta, recargarBodegas]);

  const abrir = useCallback((t: FilaTraslado) => setSelected(t), []);
  // m24 (regresión): el «Ver en Compras» que la fila tenía en BASE.
  const gestionar = useCallback((t: FilaTraslado) => router.push(`/dashboard/compras/traslados?id=${t.id}`), [router]);
  const accionesFila = useMemo(() => ({ abrir, gestionar }), [abrir, gestionar]);

  // ── bloque 2: la tabla (TABLA-inventario punto 11; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_TRASLADOS, COLUMNAS_TABLA_TRASLADOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa: pantallaCompleta, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasTraslado(listado.conteos);
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
  // Modo cliente: los traslados de la consulta completa agrupados por su estado (columnaDeTraslado). Mientras llegan, el tablero
  // carga (items null); items estable: useMemo. El clic abre el mismo Drawer que la fila.
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
  const textoTope = enKanban && !completa.cargandoInicial ? avisoTope200(completa.total, 'traslados') : null;
  const errorTablero = enKanban && completa.error != null;
  const avisoTablero = (textoTope || errorTablero) ? (
    <div className="flex flex-col gap-1">
      {errorTablero && (
        <p role="alert">
          {textoDeError(completa.error, 'No se pudieron cargar los traslados')}.{' '}
          <button type="button" onClick={completa.recargar} className={`rounded font-bold text-orange-700 underline ${FOCOS.indigo}`}>Reintentar</button>
        </p>
      )}
      {textoTope && <p>{textoTope}</p>}
    </div>
  ) : undefined;

  // ── bloque 4: las tarjetas (KPI-inventario; R5, R12) ──
  // En proceso, Completados y Total abren su pestaña (D41: como un clic en ella; tocar la activa vuelve a Todos). En Kanban abren esa
  // pestaña en Lista. Bodegas es informativa.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (kpi: 'tras_en_proceso' | 'tras_completados' | 'tras_total') => {
    const vista = vistaDeTarjetaTraslado(kpi) ?? 'todos';
    const siguiente = vistaActiva === vista ? 'todos' : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosTraslado));
  };
  const actualizando = listado.recargando || completa.recargando || (cargandoTotales && totales !== null);
  const productos = (selected?.movements ?? []).filter((m) => m.direction !== 'TRANSFER_IN');

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/traslados" color="orange" />

      <div className={CONTENEDOR}>
        <PageHeader icon={ArrowLeftRight} color="orange"
          title="Traslados Internos"
          subtitle="Movimiento de mercancía entre bodegas propias de la empresa."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold text-sm shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/compras/traslados"
                className={`bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2 ${FOCOS.indigo}`}>
                <Package size={18} aria-hidden="true" /> Gestionar Traslados
              </Link>
            </div>
          )} />

        {/* B4 T19 (KPI-compras punto 10; R7, R12): las 4 tarjetas con los conteos de TODOS los traslados, las mismas de Compras ›
            Traslados: mientras cargan, barras grises (nunca 0); con error, «—» y «Reintentar». En proceso, Completados y Total
            abren su pestaña; Bodegas es informativa. */}
        <FranjaKpis estado={estadoKpis} titulo="Traslados">
          <TarjetaKpi kpi="tras_en_proceso" valor={tarjetas.en_proceso.valor}
            activo={vistaActiva === vistaDeTarjetaTraslado('tras_en_proceso')} onClick={() => elegirVista('tras_en_proceso')} />
          <TarjetaKpi kpi="tras_completados" valor={tarjetas.completados.valor}
            activo={vistaActiva === vistaDeTarjetaTraslado('tras_completados')} onClick={() => elegirVista('tras_completados')} />
          <TarjetaKpi kpi="bodegas" valor={tarjetas.bodegas.valor} estado={estadoBodegas} />
          <TarjetaKpi kpi="tras_total" valor={tarjetas.total.valor}
            activo={vistaActiva === vistaDeTarjetaTraslado('tras_total')} onClick={() => elegirVista('tras_total')} />
        </FranjaKpis>
        {errorTotales != null && (
          <AvisoReintentar error={errorTotales} fallo="No se pudieron cargar los indicadores de traslados" onReintentar={() => setVueltaConteos((n) => n + 1)} />
        )}
        {errorBodegas != null && (
          <AvisoReintentar error={errorBodegas} fallo="No se pudieron cargar las bodegas (los nombres salen como «Bodega #N»)" onReintentar={recargarBodegas} />
        )}

        {/* B4 T19 (TABLA-inventario punto 11, KANBAN-logistica punto 5): la barra y la tabla estándar en el servidor, o el tablero solo
            para ver en modo cliente, con el MISMO estado (búsqueda y estados). En Kanban las pestañas no se ven (el tablero trae todos
            los estados por columna). */}
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
                  placeholder="Buscar traslado, notas o guía…"
                  opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_TRASLADO : opcionesEstadosTraslado}
                  filtros={textoOrden ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                      {textoOrden}
                      <span aria-hidden="true">·</span>
                      <button type="button" onClick={() => despachar({ tipo: 'orden', valor: null })}
                        className={`rounded font-bold text-orange-700 hover:underline ${FOCOS.indigo}`}>
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
                {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden por columna son de la tabla; un clic en la fila
                    abre el Drawer. */}
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

      {/* Drawer (B1 a B3): el detalle del traslado y su enlace a Compras, donde se gestiona. */}
      {selected && (
        <Drawer etiqueta="Detalle del traslado" onClose={() => setSelected(null)} header={(
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
              <p className="text-xs text-slate-500 mb-1">Notas</p>
              <p className="font-bold text-sm">{selected.notas || '—'}</p>
            </div>
          </div>
          {selected.tracking_number && (
            <div className="bg-slate-50 rounded-xl p-3">
              <p className="text-xs text-slate-500 mb-1">Guía</p>
              <p className="font-mono text-sm font-bold">{selected.tracking_number}</p>
            </div>
          )}
          {productos.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-2">Productos</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr className="text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-right">Cant.</th>
                  </tr></thead>
                  <tbody>
                    {productos.map((m, i) => (
                      <tr key={i} className="border-t border-slate-50">
                        <td className="px-3 py-2 font-medium">SKU #{m.sku_id}</td>
                        <td className="px-3 py-2 text-right font-bold">{m.quantity ?? 0}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          <Link href={`/dashboard/compras/traslados?id=${selected.id}`}
            className={`w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl font-bold text-sm ${FOCOS.indigo}`}>
            Gestionar en Compras <ChevronRight size={14} aria-hidden="true" />
          </Link>
        </Drawer>
      )}
    </div>
  );
}
