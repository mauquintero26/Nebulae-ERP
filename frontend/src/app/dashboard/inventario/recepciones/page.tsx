'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowDownToLine, ClipboardList, Eye, Package, RefreshCw } from 'lucide-react';
// B4 T19: Entradas de Inventario (Recepciones) 100 % sobre el servidor (R5, C3, C4): la tabla estándar con las columnas COMPARTIDAS con
// Compras (compras/columnas-recepcion.tsx) y las vistas reales (Por confirmar · Confirmadas · Canceladas · Todas; antes preguntaba por
// 'CONFIRMADA', un estado que no existe), el tablero solo para ver en modo servidor y las tarjetas rec_* del MISMO /compras/stats
// que Compras › Recepciones (los mismos números). Se conserva lo de B1 a B3: el Drawer con los productos recibidos y el enlace a
// Compras. Esta pantalla no confirma: el conteo y la confirmación se hacen en Compras.
import {
  SubNav, PageHeader, Drawer, Button, MenuFila, FranjaKpis, TarjetaKpi, useEstadoKpi, TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla } from '@/components/tabla';
import { useResumen } from '@/components/ui/useResumen';
import { INV_NAV } from '../inv-nav';
import { AvisoReintentar, CONTENEDOR, FOCOS, useCatalogo } from '../piezas-inventario';
import {
  CeldaEstadoRecepcion, columnasRecepcion, numeroRecepcion, pecDeRecepcion, proveedorDeRecepcion,
  retrasoDeRecepcion, textoFechaRecepcion, titulosDeOrdenRecepcion,
} from '../../compras/columnas-recepcion';
import type { FilaColumnasRecepcion } from '../../compras/columnas-recepcion';

import { apiFetch } from '@/lib/api';
import {
  accionModo, accionVistaEnLista, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta, ordenEsAtencion,
  textoOrdenHub,
} from '@/lib/tabla';
import { PERIODO_KPI, NOTA_RECEPCIONES, formatoDecimal, tarjetasRecepciones, totalRecepciones } from '@/lib/kpis';
import {
  COLUMNAS_RECEPCION, EXTRA_TABLERO_RECEPCION, OPCIONES_ESTADOS_TABLERO_RECEPCION, consultaColumnaRecepcion, datosConfirmacion,
  opcionesEstadosRecepcion, pestanasRecepcion, tarjetaRecepcion, textoDiasRetraso, textoVacioRecepciones, vistaDeTarjetaRecepcion,
} from '@/lib/estados-compras';
// B4 T24 f3 (FINAL-C4-f, ruling 5): BODEGA (y ADMIN) cuenta y confirma en Compras; a los demás, «Abrir en Compras». r1 (C1 y la
// heredada): con la MISMA regla de Compras › Recepciones (confirmarRecepcion): sin bodega receptora o heredada, «Abrir en Compras».
import { confirmarRecepcion } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';

/** Una línea de la recepción (productos de _gr_dict: JSON; los nombres son los de la recepción de Compras). */
type LineaRecepcion = { product_name?: string | null; sku_id?: number | null; qty_esperada?: number | null; qty?: number | null; qty_recibida?: number | null };
/** Una fila de GET /compras/recepciones (el _gr_dict de T12). dias_retraso es del servidor. */
type FilaRecepcion = FilaColumnasRecepcion & { warehouse_id?: number | null; notas?: string | null };
/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_RECEPCIONES = 'inventario.recepciones';
/** Como la pantalla de hoy (Recientes): se ven todas; las pestañas separan lo que falta confirmar. */
const INICIAL_RECEPCIONES = { vista: 'todas' };
/** El motivo de un tablero solo para ver (R11, KANBAN-logistica punto 5). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: las recepciones se confirman contando la mercancía, en Compras.';

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
const AccionesFila = React.createContext<{ abrir: (r: FilaRecepcion) => void; abrirEnCompras: (r: FilaRecepcion) => void; abrirPec: (r: FilaRecepcion) => void } | null>(null);

/**
 * Acciones (R11): el enlace «Abrir en Compras» (donde se cuenta y se confirma) y el menú ⋯ (MenuFila: clic y portal) con «Ver
 * detalle» y «Abrir en Compras». Todo lleva el número de la recepción en su nombre.
 */
function CeldaAcciones({ r }: { r: FilaRecepcion }) {
  const acciones = useContext(AccionesFila);
  const numero = numeroRecepcion(r);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(r) },
    { etiqueta: 'Abrir en Compras', icono: ClipboardList, onClick: () => acciones?.abrirEnCompras(r) },
    { etiqueta: 'Abrir el pedido de compra', icono: Package, onClick: () => acciones?.abrirPec(r), oculto: !r.pec_id },
  ];
  return (
    <span className="flex items-center justify-end gap-0.5">
      <Link href={`/dashboard/compras/recepciones/${r.id}`} aria-label={`Abrir ${numero} en Compras`} title="Abrir en Compras"
        className={`rounded-lg p-1.5 text-orange-700 transition-colors hover:bg-orange-50 ${FOCOS.indigo}`}>
        <ClipboardList size={14} aria-hidden="true" />
      </Link>
      <MenuFila items={items} etiqueta={`Acciones de ${numero}`} />
    </span>
  );
}

/**
 * B4 T19, la tabla (TABLA-inventario punto 9; R26, D41): las columnas de columnas-recepcion.tsx (compartidas con Compras › Recepciones) con
 * la celda de Acciones de esta pantalla. Una constante (estable, D40). Bodega, Ítems, Retraso y Stock van ocultas por defecto.
 */
const COLUMNAS_TABLA_RECEPCIONES = columnasRecepcion<FilaRecepcion>((r) => <CeldaAcciones r={r} />);
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_RECEPCIONES = titulosDeOrdenRecepcion(COLUMNAS_TABLA_RECEPCIONES);

/** Las unidades de una línea: lo recibido y lo esperado; sin dato, 0 como en el Drawer de hoy. */
const unidades = (n: number | null | undefined) => formatoDecimal(n ?? 0);

/* ================================================================
   MAIN PAGE — InventarioRecepcionesPage (B4 T19)
   ================================================================ */
export default function InventarioRecepcionesPage() {
  const router = useRouter();
  const rol = useRolActual();
  const confirmacion = useCallback((r: FilaRecepcion) => confirmarRecepcion({ ...datosConfirmacion(r), rol }), [rol]);
  // ── bloque 1: la carga del servidor (TABLA-inventario punto 9; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, las tarjetas, la tabla y el tablero despachan a
  // él. El modo (Lista o Kanban) se guarda en vista:inventario.recepciones.
  const [estado, despachar, listo] = useEstadoTabla(ID_RECEPCIONES, INICIAL_RECEPCIONES);
  const enKanban = estado.modo === 'kanban';
  const [selectedItem, setSelectedItem] = useState<FilaRecepcion | null>(null);

  // GET /compras/recepciones con vista, estados, q, orden, limit y offset del estado, más los conteos de las pestañas en la MISMA
  // llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban, sin filas. Sin orden, el del servidor (la más reciente).
  const listado = useListado<FilaRecepcion>({
    ruta: '/compras/recepciones', estado, conConteos: true, esperar: !listo, despachar, extra: enKanban ? EXTRA_TABLERO_RECEPCION : null,
  });
  // m5 de T8: mientras la última respuesta sea la de Kanban (sin filas) y la tabla ya pida su página, la tabla está cargando y el total
  // en 'cargando': nunca «No hay recepciones…» con el total de la otra consulta.
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, enKanban);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !enKanban && llegadaAhora.sinFilas && !listado.error;
  const conteos = listado.conteos;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero solo para ver, en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaRecepcion: los estados de la
  // columna cruzados con el filtro y la búsqueda del MISMO estado), porColumna = el tamaño de la tabla y limit=0 en las plegadas.
  const tablero = useTableroKanban<FilaRecepcion>({
    pantalla: ID_RECEPCIONES,
    modo: 'servidor',
    columnas: COLUMNAS_RECEPCION,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaRecepcion(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`/compras/recepciones?${consulta}`, { signal }));
    },
  });

  // Las tarjetas (KPI-inventario punto 7; R7, R12): GET /compras/stats?periodo=30d, el MISMO endpoint de Compras › Recepciones (los
  // mismos números), sin respaldo local. Mientras no llega, 'cargando' (nunca 0); si falla, «—» y «Reintentar».
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen(`/compras/stats?periodo=${PERIODO_KPI}`, vueltaStats);
  // I3 (r1): una recarga conserva el último valor (actualizando; useResumen, estadoResumen); solo la primera carga va en cargando.
  const { datos: datosStats, cargando: cargandoStats, error: errorStats } = stats;
  const estadoKpis = useEstadoKpi(cargandoStats, errorStats);
  const tarjetas = tarjetasRecepciones(datosStats);
  const totalRec = totalRecepciones(datosStats);
  // Las bodegas (GET /inventory/warehouses): la tarjeta «Bodegas». Si falla, se dice con «Reintentar» (nunca un 0).
  const { catalogo: bodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');
  const errorBodegas = bodegas.filas === null ? bodegas.error : null;
  const estadoBodegas = useEstadoKpi(bodegas.filas === null && bodegas.error == null, errorBodegas);

  // «Actualizar»: la lista con sus conteos, el tablero, las tarjetas y las bodegas. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    setVueltaStats((n) => n + 1);
    recargarBodegas();
  }, [recargarListado, recargarTablero, recargarBodegas]);

  const abrir = useCallback((r: FilaRecepcion) => setSelectedItem(r), []);
  const abrirEnCompras = useCallback((r: FilaRecepcion) => router.push(`/dashboard/compras/recepciones/${r.id}`), [router]);
  // m18 (regresión): el enlace al PEC de origen que tenía la pantalla (compras/pedidos?id= lo atiende).
  const abrirPec = useCallback((r: FilaRecepcion) => router.push(`/dashboard/compras/pedidos?id=${r.pec_id}`), [router]);
  const accionesFila = useMemo(() => ({ abrir, abrirEnCompras, abrirPec }), [abrir, abrirEnCompras, abrirPec]);
  // La tarjeta del tablero: «Contar y confirmar» solo si esa recepción se puede confirmar (sin eso, la tarjeta queda en «Abrir»).
  const tarjetaDeRecepcion = useCallback((r: FilaRecepcion) => tarjetaRecepcion(r, { contar: confirmacion(r).confirmar, motivo: confirmacion(r).texto }), [confirmacion]);

  // ── bloque 2: la tabla (TABLA-inventario punto 9; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_RECEPCIONES, COLUMNAS_TABLA_RECEPCIONES);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasRecepcion(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o las de la
  // pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_RECEPCION : opcionesEstadosRecepcion, COLUMNAS_RECEPCION));
    } else despachar(accion);
  }, [estado, despachar]);
  // R8: ordenada por una columna, el chip «Orden: … · Más recientes» vuelve al orden del servidor.
  const textoOrden = enKanban || !estado.orden || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_RECEPCIONES);
  const vacio = useMemo(() => {
    const texto = textoVacioRecepciones({ vista: estado.vista, q: estado.q, estados: estado.estados });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.vista, estado.q, estado.estados]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: sinPagina ? null : listado.total,
    estadoTotal: estadoDelTotal({
      total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
    }),
  };

  // ── bloque 4: las tarjetas (KPI-inventario punto 7; R5, R12) ──
  // rec_por_confirmar abre «Por confirmar», rec_confirmadas «Confirmadas» y rec_total «Todas» (D41: como un clic en la pestaña; tocar la
  // activa vuelve a Todas). En Kanban abren esa pestaña en Lista (accionVistaEnLista). Bodegas es informativa.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (kpi: 'rec_por_confirmar' | 'rec_confirmadas' | 'rec_total') => {
    const vista = vistaDeTarjetaRecepcion(kpi) ?? 'todas';
    const siguiente = vistaActiva === vista ? 'todas' : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosRecepcion));
  };
  const actualizando = listado.recargando || (cargandoStats && stats !== null);
  const lineas = (selectedItem?.productos ?? []) as LineaRecepcion[];

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/recepciones" color="orange" />

      <div className={CONTENEDOR}>
        <PageHeader icon={ArrowDownToLine} color="orange"
          title="Entradas de Inventario"
          subtitle="Registro de mercancía que ingresa a las bodegas desde compras."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-xs font-bold shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/compras/pedidos"
                className={`bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2 ${FOCOS.indigo}`}>
                <Package size={18} aria-hidden="true" /> Ver Pedidos de Compra
              </Link>
            </div>
          )} />

        {/* B4 T19 (KPI-inventario punto 7; R7, R12): las 4 tarjetas del MISMO /compras/stats de Compras › Recepciones y las bodegas:
            mientras cargan, barras grises (nunca 0); con error, «—» y «Reintentar». Por confirmar, Confirmadas y el total abren su
            pestaña; Bodegas es informativa. */}
        <FranjaKpis estado={estadoKpis} titulo="Entradas" idFoco="franja-entradas" nota={NOTA_RECEPCIONES}>
          <TarjetaKpi kpi="rec_por_confirmar" valor={tarjetas?.por_confirmar.valor ?? null}
            activo={vistaActiva === vistaDeTarjetaRecepcion('rec_por_confirmar')} onClick={() => elegirVista('rec_por_confirmar')} />
          <TarjetaKpi kpi="rec_confirmadas" valor={tarjetas?.confirmadas.valor ?? null}
            activo={vistaActiva === vistaDeTarjetaRecepcion('rec_confirmadas')} onClick={() => elegirVista('rec_confirmadas')} />
          <TarjetaKpi kpi="bodegas" valor={bodegas.filas ? bodegas.filas.length : null} estado={estadoBodegas} />
          <TarjetaKpi kpi="rec_total" valor={totalRec}
            activo={vistaActiva === vistaDeTarjetaRecepcion('rec_total')} onClick={() => elegirVista('rec_total')} />
        </FranjaKpis>
        {/* r3 (C2, m36): montado siempre, con reintentando y el destino del foco (la franja). */}
        <AvisoReintentar error={errorStats} fallo="No se pudieron cargar los indicadores de recepciones" onReintentar={stats.recargar} reintentando={cargandoStats} destinoFoco="franja-entradas" />
        {errorBodegas != null && (
          <AvisoReintentar error={errorBodegas} fallo="No se pudieron cargar las bodegas" onReintentar={recargarBodegas} />
        )}

        {/* B4 T19 (TABLA-inventario punto 9, KANBAN-logistica punto 5): la barra y la tabla estándar en el servidor, o el tablero solo
            para ver en modo servidor, con el MISMO estado (pestaña, búsqueda y estados). En Kanban las pestañas no se ven (el tablero
            muestra todas las recepciones por grupo). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
                estadoConteos={estadoConteos}
                placeholder="Buscar por recepción, PEC, proveedor, bodega o producto…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_RECEPCION : opcionesEstadosRecepcion}
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
                ajustes={{ columnas: COLUMNAS_TABLA_RECEPCIONES, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="orange"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden son de la tabla; un clic en la fila abre el Drawer. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_RECEPCIONES}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_RECEPCIONES}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={listado.filas}
                  total={sinPagina ? null : listado.total}
                  cargando={listado.cargandoInicial || sinPagina}
                  recargando={listado.recargando}
                  error={listado.error}
                  onReintentar={listado.recargar}
                  aviso={listado.avisoOrden}
                  onFila={abrir}
                  vacio={vacio}
                  etiqueta="Entradas de inventario"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 5: Por contar · Confirmadas (plegada) · Canceladas (plegada), solo para ver: sin regla, con su
               motivo. El clic abre el Drawer, como la fila; «Contar y confirmar» lleva al conteo en Compras. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER}
              tarjetaDe={tarjetaDeRecepcion}
              onAbrir={abrir}
              color="orange"
              vacio="Sin recepciones aquí"
            />
          ) : null}
        </div>
      </div>

      {/* Drawer (B1 a B3): el detalle de la recepción y sus productos; el conteo y la confirmación se hacen en Compras. */}
      {selectedItem && (
        <Drawer idTitulo="drawer-recepcion-titulo"
          onClose={() => setSelectedItem(null)}
          header={(
            <div>
              <h2 id="drawer-recepcion-titulo" className="font-extrabold text-xl text-slate-900">{numeroRecepcion(selectedItem)}</h2>
              <p className="text-xs text-slate-500">Entrada de Inventario</p>
              <div className="mt-2"><CeldaEstadoRecepcion r={selectedItem} /></div>
            </div>
          )}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>Cerrar</Button>
              <Link href={`/dashboard/compras/recepciones/${selectedItem.id}`}
                className={`inline-flex items-center gap-2 rounded-xl border border-orange-200 bg-white px-4 py-2.5 text-sm font-bold text-orange-800 hover:bg-orange-50 ${FOCOS.indigo}`}>
                <ClipboardList size={14} aria-hidden="true" /> {confirmacion(selectedItem).confirmar ? 'Contar y confirmar en Compras' : 'Abrir en Compras'}
              </Link>
              {confirmacion(selectedItem).texto && (
                <p role="status" className="max-w-xs text-xs font-semibold text-slate-600">{confirmacion(selectedItem).texto}</p>
              )}
            </>
          )}
        >
          <div className="grid grid-cols-2 gap-3">
            {([
              ['PEC Origen', pecDeRecepcion(selectedItem)],
              ['Proveedor', proveedorDeRecepcion(selectedItem)],
              ['Bodega', selectedItem.warehouse_name || '—'],
              ['Fecha', textoFechaRecepcion(selectedItem)],
              ...(retrasoDeRecepcion(selectedItem) > 0 ? [['Retraso', textoDiasRetraso(retrasoDeRecepcion(selectedItem))]] : []),
            ] as [string, string][]).map(([titulo, valor]) => (
              <div key={titulo} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">{titulo}</p>
                <p className="font-bold text-sm text-slate-800">{valor}</p>
              </div>
            ))}
          </div>
          {selectedItem.pec_id ? (
            <Link href={`/dashboard/compras/pedidos?id=${selectedItem.pec_id}`}
              className={`inline-flex items-center gap-1.5 text-sm font-bold text-purple-700 hover:underline ${FOCOS.indigo}`}>
              <Package size={14} aria-hidden="true" /> Ver el pedido de compra {pecDeRecepcion(selectedItem)}
            </Link>
          ) : null}
          {lineas.length > 0 && (
            <div>
              <p className="text-xs font-black text-slate-500 uppercase mb-2">Productos Recibidos</p>
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-slate-50"><tr className="text-slate-500 uppercase">
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Esperado</th>
                    <th className="px-3 py-2 text-right">Recibido</th>
                  </tr></thead>
                  <tbody>
                    {lineas.map((p, i) => {
                      const esperado = p.qty_esperada ?? p.qty ?? 0;
                      const recibido = p.qty_recibida ?? p.qty ?? 0;
                      return (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="px-3 py-2 font-medium">{p.product_name || (p.sku_id != null ? `SKU #${p.sku_id}` : 'Ítem de compra')}</td>
                          <td className="px-3 py-2 text-right">{unidades(esperado)}</td>
                          <td className={`px-3 py-2 text-right font-bold ${recibido < esperado ? 'text-red-700' : 'text-emerald-700'}`}>{unidades(recibido)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Drawer>
      )}
    </div>
  );
}
