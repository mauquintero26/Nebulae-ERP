'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, Eye, Layers, RefreshCw, ShoppingCart } from 'lucide-react';
// B4 T18: Abastecimiento sobre las existencias REALES (R10): la tabla estándar de /inventory/stock-tabla (por=sku) con las
// pestañas Agotado · Bajo el mínimo · Bien abastecido (RP53), el estado único (R5), las tarjetas de /inventory/stats y de
// /compras/stats (pec_activos, RP94) y el tablero solo para ver (R11, modo servidor). Antes: /products?limit=200 con campos
// que /products no trae (todo salía «Sin stock») y /compras/stats tragado con .catch(() => ({})) (la tarjeta decía «?»).
import { FranjaKpis, PageHeader, SubNav, TableroKanban, TarjetaKpi, useEstadoKpi, useTableroKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { useResumen } from '@/components/ui/useResumen';
import { apiFetch } from '@/lib/api';
import { AYUDA_MINIMO_INVENTARIO, formatoEntero, tarjetasAbastecimiento } from '@/lib/kpis';
import { dependenciasTablero, estadoDelTotal, extraPorVista, normalizarRespuesta, textoVacioExistencias } from '@/lib/tabla';
import {
  COLUMNAS_STOCK, TEXTO_SOLO_VER_STOCK, VISTAS_ABASTECIMIENTO, consultaColumnaStock, estadoAlertaAgotados, pestanasExistencias,
  tarjetaExistencia, textoAlertaSinDato,
} from '@/lib/estados-compras';
import { INV_NAV } from '../inv-nav';
import {
  AvisoReintentar, CONTENEDOR, CeldaEstadoStock, CeldaProducto, DetalleExistencia, FOCOS, SelectorCatalogo, cantidad, claseDeFilaExistencia,
  claveDeFilaExistencia, infoStock, useCatalogo,
} from '../piezas-inventario';
import type { ConteosStock, FilaExistencia } from '../piezas-inventario';

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_ABASTECIMIENTO = 'inventario.abastecimiento';
/** RP53: la pestaña de trabajo es Agotado (lo más urgente); antes, «Bajo Minimo» incluía también los agotados. */
const INICIAL_ABASTECIMIENTO = { vista: 'agotado' };
const RUTA_STOCK = '/inventory/stock-tabla';
/** Una fila por referencia, con las bodegas sumadas (el tránsito del SKU se cuenta una vez, RP50). */
const FIJOS_ABASTECIMIENTO = { por: 'sku' };

/** Acciones: «Crear un pedido de compra» (solo si falta stock) y «Ver el producto» (por su SKU: stock-tabla no trae el id). */
function CeldaAcciones({ f }: { f: FilaExistencia }) {
  return (
    <span className="flex items-center justify-end gap-0.5">
      {f.estado_stock !== 'abastecido' && (
        <Link href="/dashboard/compras/pedidos" aria-label={`Crear un pedido de compra para ${f.sku}`} title="Crear PEC"
          className={`rounded-lg p-1.5 text-emerald-700 transition-colors hover:bg-emerald-50 ${FOCOS.indigo}`}>
          <ShoppingCart size={14} aria-hidden="true" />
        </Link>
      )}
      <Link href={`/dashboard/inventario/productos?sku=${encodeURIComponent(f.sku)}`} aria-label={`Ver el producto de ${f.sku}`} title="Ver producto"
        className={`rounded-lg p-1.5 text-indigo-600 transition-colors hover:bg-indigo-50 ${FOCOS.indigo}`}>
        <Eye size={14} aria-hidden="true" />
      </Link>
    </span>
  );
}

/**
 * La tabla (TABLA-inventario punto 6; R26, D41): las columnas de hoy (Producto, Referencia, Categoría, Stock actual, Stock
 * mínimo, Estado, Acciones) ahora con datos: «Stock actual» es lo DISPONIBLE (con el que se decide el estado) y el mínimo es el
 * de cada referencia (R10). R26: a 1024 px con el menú abierto la caja deja 704 px; Categoría va oculta por defecto. Una
 * constante: estable (D40).
 */
const COLUMNAS_TABLA_ABASTECIMIENTO: ColumnaTabla<FilaExistencia>[] = [
  { id: 'sku', titulo: 'SKU', ancho: 104, clave: true, fija: 'izquierda', ordenable: true, titleCelda: (f) => f.sku,
    celda: (f) => <span className="block truncate font-mono text-[11px] font-bold text-indigo-700">{f.sku}</span> },
  { id: 'producto', titulo: 'Producto', ancho: 120, clave: true, flexible: true, ordenable: true,
    titleCelda: (f) => f.producto || 'Sin nombre', celda: (f) => <CeldaProducto f={f} /> },
  { id: 'categoria', titulo: 'Categoría', ancho: 120, ocultaPorDefecto: true, ordenable: true, titleCelda: (f) => f.categoria || 'Sin categoría',
    celda: (f) => <span className="block truncate text-xs text-slate-600">{f.categoria || '—'}</span> },
  { id: 'disponible', titulo: 'Disponible', ancho: 88, clave: true, alinear: 'derecha', ordenable: true,
    celda: (f) => (
      <span className={`text-sm font-black ${f.estado_stock === 'agotado' ? 'text-red-700' : f.estado_stock === 'bajo_minimo' ? 'text-amber-700' : 'text-slate-800'}`}>
        {cantidad(f.disponible)}
      </span>
    ) },
  { id: 'minimo', titulo: 'Mínimo', ancho: 80, alinear: 'derecha', titleCelda: () => 'Mínimo de la referencia (la alerta de stock mínimo de su publicación; 5 si no tiene)',
    celda: (f) => <span className="text-xs font-medium text-slate-600">{cantidad(f.minimo)}</span> },
  { id: 'transito', titulo: 'En tránsito', ancho: 92, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => ((f.en_transito ?? 0) > 0 ? `${cantidad(f.en_transito)} pedidas al proveedor y sin recibir` : 'Nada en camino'),
    celda: (f) => <span className="text-xs font-medium text-blue-700">{(f.en_transito ?? 0) > 0 ? `+${cantidad(f.en_transito)}` : '—'}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 124, clave: true,
    titleCelda: (f) => infoStock(f.estado_stock)?.label ?? 'Sin estado', celda: (f) => <CeldaEstadoStock f={f} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: (f) => <CeldaAcciones f={f} /> },
];

export default function AbastecimientoPage() {
  // ── B4 T18, bloque 1: la carga del servidor (TABLA-inventario punto 6; R5, R10, RP53; D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, las tarjetas pulsables, la búsqueda, la tabla y el tablero despachan a él;
  // el modo (Lista o Kanban) se guarda en vista:inventario.abastecimiento. stock-tabla no tiene `vista`: la pestaña viaja como
  // estado_stock (extraPorVista, RP53). La categoría es un filtro extra de la barra que va al servidor.
  const [estado, despachar, listo] = useEstadoTabla(ID_ABASTECIMIENTO, INICIAL_ABASTECIMIENTO);
  const enKanban = estado.modo === 'kanban';
  const [categoria, setCategoria] = useState('');
  const { catalogo: categorias, recargar: recargarCategorias } = useCatalogo('/categories');
  const fijos = useMemo(() => ({ ...FIJOS_ABASTECIMIENTO, categoria_id: categoria || null }), [categoria]);
  const extraLista = useMemo(() => extraPorVista(estado, VISTAS_ABASTECIMIENTO, fijos, 'agotado'), [estado, fijos]);
  const listado = useListado<FilaExistencia>({
    ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,
  });
  const conteos = listado.conteos as ConteosStock | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero solo para ver, en modo servidor (R11, C4, D39): el mismo de Stock (COLUMNAS_STOCK), con el MISMO estado. El orden
  // del hook ('sin_movimiento') NO se manda: stock-tabla responde 422 a un orden de tiempo.
  const tablero = useTableroKanban<FilaExistencia>({
    pantalla: ID_ABASTECIMIENTO,
    modo: 'servidor',
    columnas: COLUMNAS_STOCK,
    idDe: claveDeFilaExistencia,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: [...dependenciasTablero(estado), categoria],
    cargar: async (columna, { offset, limit, signal }) => {
      const consulta = consultaColumnaStock(estado, columna, fijos, { limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`${RUTA_STOCK}?${consulta}`, { signal }));
    },
  });

  // Las tarjetas (KPI-inventario punto 6; R10, R12, RP94): tres de GET /inventory/stats y pec_activos de GET /compras/stats
  // (T12), que cargan y fallan POR SEPARADO: la que falla dice «—» y las demás siguen. Sin respaldo local; mientras no llegan,
  // 'cargando' (nunca 0 ni «?»).
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen('/inventory/stats', vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);
  const [vueltaCompras, setVueltaCompras] = useState(0);
  const compras = useResumen('/compras/stats', vueltaCompras);
  const cargandoCompras = compras.cargando;
  const estadoCompras = useEstadoKpi(cargandoCompras, compras.error);
  const tarjetas = tarjetasAbastecimiento(stats.datos, compras.datos);
  const agotados = tarjetas.agotados.valor;
  const alerta = estadoAlertaAgotados(estadoKpis, agotados);

  // «Actualizar»: la lista, el tablero, las dos fuentes de las tarjetas y el selector. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    recargarCategorias();
    setVueltaStats((n) => n + 1);
    setVueltaCompras((n) => n + 1);
  }, [recargarListado, recargarTablero, recargarCategorias]);
  const actualizando = listado.recargando || (cargandoStats && stats.datos !== null) || (cargandoCompras && compras.datos !== null);

  // ── bloque 2: la tabla (R5, R26; D40, D41) ──
  const prefs = usePreferenciasTabla(ID_ABASTECIMIENTO, COLUMNAS_TABLA_ABASTECIMIENTO);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const [detalle, setDetalle] = useState<FilaExistencia | null>(null);
  const abrir = useCallback((f: FilaExistencia) => setDetalle(f), [setDetalle]);
  const pestanas = pestanasExistencias(conteos, { conTodos: false });
  const cambiarCategoria = useCallback((valor: string) => {
    setCategoria(valor);
    despachar({ tipo: 'pagina', valor: 1 });
  }, [despachar]);
  // r1 (m16, como F85 en el Hub): sin el catálogo, «la categoría elegida» (true), nunca el id crudo.
  const nombreCategoria = categoria ? (categorias.filas?.find((c) => String(c.id) === categoria)?.name ?? true) : null;
  // m8 de T15: el «vacío» memoizado dice qué lo deja vacío (la búsqueda, la pestaña o la categoría).
  const vacio = useMemo(() => {
    const texto = textoVacioExistencias({ q: estado.q, vista: estado.vista, categoria: nombreCategoria, sinBodega: true });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, estado.vista, nombreCategoria]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };

  // ── bloque 4: las tarjetas (R12; T18 r1, I1) ──
  // Las cuatro son INFORMATIVAS, como inv_bajo_minimo del Hub (RP52 b): «una tarjeta solo es botón si equivale a una vista» y
  // aquí no hay una vista con el mismo número (la tarjeta cuenta referencias de /inventory/stats SIN las que no llevan control
  // de inventario; la pestaña cuenta las filas de la tabla: 33 contra 36 en el banco). Las pestañas siguen ahí.

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/abastecimiento" color="emerald" />

      {/* La alerta de agotados: el número es el de /inventory/stats (real). Cuatro estados (estadoAlertaAgotados) con el MISMO alto
          mínimo, para que al llegar el número no empuje la página (CLS): cargando (barras grises), sin dato (si falló no afirma
          nada), con agotados (la alerta roja y «Crear PEC Urgente») y sin ninguno. */}
      {alerta === 'cargando' && (
        <div role="status" aria-busy="true" className="min-h-[4.1rem] border-b border-slate-200 bg-slate-100 px-6 py-3">
          <span className="sr-only">Contando los productos agotados</span>
          <div aria-hidden="true" className="space-y-2">
            <div className="h-4 w-44 rounded bg-slate-200 motion-safe:animate-pulse" />
            <div className="h-3 w-72 max-w-full rounded bg-slate-200 motion-safe:animate-pulse" />
          </div>
        </div>
      )}
      {alerta === 'sin_dato' && (
        <div role="status" className="min-h-[4.1rem] border-b border-slate-200 bg-slate-100 px-6 py-3">
          <h4 className="text-sm font-black text-slate-700">No se pudo verificar el stock crítico</h4>
          {/* B4 T24 f3 (F92): un solo «Reintentar» para /inventory/stats, el del aviso sobre las tarjetas (un 403 no lo ofrece). r1 (m11,
              m37): si los indicadores respondieron, el texto no remite a un aviso que no existe (textoAlertaSinDato). */}
          <p className="mt-1 text-xs font-semibold text-slate-600">{textoAlertaSinDato(estadoKpis === 'error')}</p>
        </div>
      )}
      {alerta === 'ninguno' && (
        <div role="status" className="min-h-[4.1rem] border-b border-emerald-200 bg-emerald-50 px-6 py-3">
          <h4 className="text-sm font-black text-emerald-800">Sin productos agotados</h4>
          <p className="mt-1 text-xs font-semibold text-emerald-800">Ninguna referencia tiene el disponible en cero.</p>
        </div>
      )}
      {alerta === 'hay' && agotados !== null && (
        <div role="alert" className="min-h-[4.1rem] bg-red-50 border-b border-red-200 px-6 py-3 flex flex-wrap items-start gap-4 z-20">
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} aria-hidden="true" />
          <div className="min-w-[12rem] flex-1">
            <h4 className="text-sm font-black text-red-800">ALERTA DE STOCK CRÍTICO</h4>
            <p className="text-xs font-bold text-red-700 mt-1">
              {formatoEntero(agotados)} {agotados === 1 ? 'producto con stock en cero' : 'productos con stock en cero'}. Se requiere pedido de compra urgente.
              <span className="block font-semibold text-red-800">Solo cuenta las referencias con control de inventario.</span>
            </p>
          </div>
          <Link href="/dashboard/compras/pedidos" className={`bg-red-700 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-800 ${FOCOS.indigo}`}>
            Crear PEC Urgente
          </Link>
        </div>
      )}

      <div className={CONTENEDOR}>
        <PageHeader icon={ShoppingCart} color="emerald"
          title="Abastecimiento"
          subtitle="Productos que requieren reabastecimiento según el mínimo de cada referencia."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/compras/pedidos"
                className={`bg-emerald-700 hover:bg-emerald-800 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2 ${FOCOS.indigo}`}>
                <ShoppingCart size={18} aria-hidden="true" /> Crear Pedido de Compra
              </Link>
            </div>
          )} />

        {/* B4 T18, bloque 4 (KPI-inventario punto 6; R10, R12, RP94): Agotados, Bajo el mínimo y Bien abastecidos (de
            /inventory/stats) y Pedidos de compra activos (de /compras/stats), todas informativas. Cada fuente carga y falla por
            separado: barras grises mientras cargan (nunca 0) y «—» si falla, con su aviso y «Reintentar» (m11). Sin gradiente. */}
        {estadoKpis === 'error' && (
          <AvisoReintentar error={stats.error} fallo="No se pudieron cargar los indicadores de existencias" onReintentar={stats.recargar} />
        )}
        {estadoCompras === 'error' && (
          <AvisoReintentar error={compras.error} fallo="No se pudieron cargar los pedidos de compra activos" onReintentar={compras.recargar} />
        )}
        <FranjaKpis estado={estadoKpis} titulo="Abastecimiento" nota={AYUDA_MINIMO_INVENTARIO}>
          <TarjetaKpi kpi="inv_agotados" valor={tarjetas.agotados.valor} ayuda={tarjetas.agotados.ayuda} />
          <TarjetaKpi kpi="inv_bajo_minimo" valor={tarjetas.bajo_minimo.valor} ayuda={tarjetas.bajo_minimo.ayuda} />
          <TarjetaKpi kpi="inv_abastecidos" valor={tarjetas.abastecidos.valor} ayuda={tarjetas.abastecidos.ayuda} />
          <TarjetaKpi kpi="pec_activos" valor={tarjetas.pec_activos.valor} ayuda={tarjetas.pec_activos.ayuda} estado={estadoCompras} />
        </FranjaKpis>

        {/* B4 T18, bloques 2 y 3 (TABLA-inventario punto 6, KANBAN-resto): la barra y la tabla estándar en el servidor, o el
            tablero solo para ver en modo servidor, con el MISMO estado. En Kanban las pestañas no se ven (el tablero muestra
            los tres niveles de stock). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <section ref={refTarjeta} className={claseTarjeta}>
            <BarraTabla
              estado={estado}
              onEstado={despachar}
              pestanas={enKanban ? undefined : pestanas}
              estadoConteos={estadoConteos}
              placeholder="Buscar por SKU o producto…"
              filtros={(
                <>
                  <SelectorCatalogo etiqueta="Categoría" todas="Todas las categorías" cargando="Cargando categorías…"
                    fallo="No se pudieron cargar las categorías" catalogo={categorias} valor={categoria}
                    onCambiar={cambiarCategoria} onReintentar={recargarCategorias} icono={Layers} />
                  {categoria && (
                    <button type="button" onClick={() => cambiarCategoria('')}
                      className={`rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 ${FOCOS.indigo}`}>
                      Quitar filtro
                    </button>
                  )}
                </>
              )}
              ajustes={{ columnas: COLUMNAS_TABLA_ABASTECIMIENTO, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={enKanban ? undefined : { completa, alternar }}
              color="indigo"
              {...totalDeLaBarra}
            />
            {!enKanban && (
              <TablaEstandar
                id={ID_ABASTECIMIENTO}
                modo="servidor"
                columnas={COLUMNAS_TABLA_ABASTECIMIENTO}
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
                claveFila={claveDeFilaExistencia}
                onFila={abrir}
                claseFila={claseDeFilaExistencia}
                vacio={vacio}
                etiqueta="Abastecimiento por referencia"
              />
            )}
          </section>
          {enKanban ? (
            /* KANBAN-resto: Agotado · Bajo el mínimo · Bien abastecido, solo para ver: sin regla, con su motivo. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER_STOCK}
              tarjetaDe={tarjetaExistencia}
              onAbrir={abrir}
              color="indigo"
              vacio="Sin referencias aquí"
            />
          ) : null}
        </div>
      </div>

      {/* B4 T18, bloque 5: el detalle de la existencia (un clic en la fila o en la tarjeta). */}
      {detalle && <DetalleExistencia f={detalle} onCerrar={() => setDetalle(null)} color="emerald" />}
    </div>
  );
}
