'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { Info, Layers, RefreshCw, ShoppingCart } from 'lucide-react';
// B4 T18: Stock con las existencias REALES (R10) en la tabla estándar sobre /inventory/stock-tabla (por=sku), el estado único
// de la pantalla (R5), las tarjetas de /inventory/stats (R12) y el tablero solo para ver Agotado · Bajo el mínimo · Bien
// abastecido (R11, en modo servidor). Antes: /products?limit=300 con campos que /products no trae (todo salía en 0 y Agotado).
import { FranjaKpis, PageHeader, SubNav, TableroKanban, TarjetaKpi, useEstadoKpi, useTableroKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { useResumen } from '@/components/ui/useResumen';
import { apiFetch } from '@/lib/api';
import { AYUDA_MINIMO_INVENTARIO, tarjetasStock } from '@/lib/kpis';
import { dependenciasTablero, estadoDelTotal, extraPorVista, normalizarRespuesta, textoVacioExistencias } from '@/lib/tabla';
import {
  COLUMNAS_STOCK, TEXTO_SOLO_VER_STOCK, VISTAS_STOCK, consultaColumnaStock, existenciaReservada, pestanasExistencias, tarjetaExistencia,
} from '@/lib/estados-compras';
import { INV_NAV } from '../inv-nav';
import {
  AvisoReintentar, CONTENEDOR, CeldaEstadoExistencia, CeldaProducto, DetalleExistencia, FOCOS, SelectorCatalogo, cantidad, claseDeFilaExistencia,
  claveDeFilaExistencia, infoStock, pesos, useCatalogo,
} from '../piezas-inventario';
import { AvisoCatalogoViejo } from '../aviso-catalogo';
import type { ConteosStock, FilaExistencia } from '../piezas-inventario';

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_STOCK = 'inventario.stock';
const INICIAL_STOCK = { vista: 'todos' };
const RUTA_STOCK = '/inventory/stock-tabla';
/** Una fila por referencia, con las bodegas sumadas (el tránsito del SKU se cuenta una vez, RP50). */
const FIJOS_STOCK = { por: 'sku' };

/**
 * La tabla (TABLA-inventario punto 5; R26, D41): las columnas de hoy (Producto, Categoría, Físico, Comprometido, Venta
 * inmediata, En tránsito, Precio y Estado) ahora con datos; los títulos son los de R10 (Reservado, Disponible). SKU queda fijo y
 * Producto es la flexible. R26: a 1024 px con el menú abierto la caja deja 704 px; Categoría y Precio van ocultas por defecto
 * (se muestran con «Ajustar tabla»). Una constante: estable (D40).
 */
const COLUMNAS_TABLA_STOCK: ColumnaTabla<FilaExistencia>[] = [
  { id: 'sku', titulo: 'SKU', ancho: 104, clave: true, fija: 'izquierda', ordenable: true, titleCelda: (f) => f.sku,
    celda: (f) => <span className="block truncate font-mono text-[11px] font-bold text-indigo-700">{f.sku}</span> },
  { id: 'producto', titulo: 'Producto', ancho: 120, clave: true, flexible: true, ordenable: true,
    titleCelda: (f) => f.producto || 'Sin nombre', celda: (f) => <CeldaProducto f={f} /> },
  { id: 'categoria', titulo: 'Categoría', ancho: 120, ocultaPorDefecto: true, ordenable: true, titleCelda: (f) => f.categoria || 'Sin categoría',
    celda: (f) => <span className="block truncate text-xs text-slate-600">{f.categoria || '—'}</span> },
  { id: 'fisico', titulo: 'Físico', ancho: 72, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-slate-900">{cantidad(f.fisico)}</span> },
  { id: 'reservado', titulo: 'Reservado', ancho: 88, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-bold text-amber-800">{cantidad(f.reservado)}</span> },
  { id: 'disponible', titulo: 'Disponible', ancho: 88, clave: true, alinear: 'derecha', ordenable: true,
    celda: (f) => <span className="text-xs font-black text-emerald-800">{cantidad(f.disponible)}</span> },
  { id: 'transito', titulo: 'En tránsito', ancho: 92, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => ((f.en_transito ?? 0) > 0 ? `${cantidad(f.en_transito)} pedidas al proveedor y sin recibir` : 'Nada en camino'),
    celda: (f) => <span className="text-xs font-medium text-blue-700">{(f.en_transito ?? 0) > 0 ? `+${cantidad(f.en_transito)}` : '—'}</span> },
  { id: 'precio', titulo: 'Precio', ancho: 104, ocultaPorDefecto: true, alinear: 'derecha', ordenable: true,
    titleCelda: (f) => (f.precio == null ? 'Sin precio de venta' : pesos(f.precio)),
    celda: (f) => <span className="text-xs text-slate-700">{pesos(f.precio)}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 124, clave: true,
    titleCelda: (f) => `${infoStock(f.estado_stock)?.label ?? 'Sin estado'}${existenciaReservada(f) ? ' · Reservado: hay unidades en bodega, todas comprometidas' : ''}`,
    celda: (f) => <CeldaEstadoExistencia f={f} /> },
];

export default function StockPage() {
  // ── B4 T18, bloque 1: la carga del servidor (TABLA-inventario punto 5; R5, R10, RP47; D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, la tabla y el tablero despachan a él; el modo (Lista o Kanban)
  // se guarda en vista:inventario.stock. La categoría es un filtro extra de la barra que va al servidor (cada cambio vuelve a
  // la página 1). stock-tabla no tiene `vista`: la pestaña viaja como estado_stock (extraPorVista, RP53).
  const [estado, despachar, listo] = useEstadoTabla(ID_STOCK, INICIAL_STOCK);
  const enKanban = estado.modo === 'kanban';
  const [categoria, setCategoria] = useState('');
  const { catalogo: categorias, recargar: recargarCategorias } = useCatalogo('/categories');
  const fijos = useMemo(() => ({ ...FIJOS_STOCK, categoria_id: categoria || null }), [categoria]);
  const extraLista = useMemo(() => extraPorVista(estado, VISTAS_STOCK, fijos), [estado, fijos]);
  // GET /inventory/stock-tabla?por=sku con q, orden, limit y offset del estado y los conteos de las pestañas en la MISMA
  // llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista (activo: false, RP35).
  const listado = useListado<FilaExistencia>({
    ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,
  });
  const conteos = listado.conteos as ConteosStock | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero solo para ver, en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaStock: el estado de
  // la columna, la búsqueda y el orden del MISMO estado, y la categoría). El orden del hook ('sin_movimiento') NO se manda:
  // stock-tabla responde 422 a un orden de tiempo. La fila no trae `id`: la clave es el par SKU y bodega.
  const tablero = useTableroKanban<FilaExistencia>({
    pantalla: ID_STOCK,
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

  // Las tarjetas (KPI-inventario punto 5; R10, R12): GET /inventory/stats, todo el inventario por referencia, sin respaldo
  // local. Mientras no llega, 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen('/inventory/stats', vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);
  const tarjetas = tarjetasStock(stats.datos);

  // «Actualizar»: la lista, el tablero, las tarjetas y el selector. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    recargarCategorias();
    setVueltaStats((n) => n + 1);
  }, [recargarListado, recargarTablero, recargarCategorias]);
  const actualizando = listado.recargando || (cargandoStats && stats.datos !== null);

  // ── bloque 2: la tabla (R5, R26; D40, D41) ──
  const prefs = usePreferenciasTabla(ID_STOCK, COLUMNAS_TABLA_STOCK);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const [detalle, setDetalle] = useState<FilaExistencia | null>(null);
  const abrir = useCallback((f: FilaExistencia) => setDetalle(f), []);
  const pestanas = pestanasExistencias(conteos);
  const cambiarCategoria = useCallback((valor: string) => {
    setCategoria(valor);
    despachar({ tipo: 'pagina', valor: 1 });
  }, [despachar]);
  // El nombre de lo elegido, para el vacío (si el catálogo todavía no llegó, el id).
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

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/stock" color="indigo" />

      <div className={CONTENEDOR}>
        <PageHeader icon={Layers} color="indigo"
          title="Vista Dual de Inventario"
          subtitle="Control simultáneo de Inventario Físico en Bodega vs. Disponible para Venta Inmediata."
          actions={(
            <div className="flex items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/cotiza"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-xs shadow-sm transition-colors">
                <ShoppingCart size={14} /> Cotizar Producto
              </Link>
            </div>
          )} />

        {/* Banner Explicativo de la Regla Dual */}
        <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 flex items-start gap-3.5">
          <Info className="text-indigo-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-indigo-900 leading-relaxed">
            <span className="font-bold">Regla de Oro de Nebulae: </span>
            El <strong>Inventario Físico</strong> contabiliza todas las unidades reales en bodega. El <strong>Disponible</strong> se calcula por bodega: resta los ítems comprometidos con clientes que pagaron su anticipo, nunca queda negativo, y luego se suma. Los asesores comerciales solo pueden comprometer unidades con entrega inmediata si figuran en <strong>Disponible</strong>.
          </div>
        </div>

        {/* B4 T18, bloque 4 (KPI-inventario punto 5; R10, R12): las 4 tarjetas de /inventory/stats (todo el inventario, por
            referencia): mientras cargan, barras grises (nunca 0); con error, «—». Ninguna es botón: no equivalen a una
            pestaña. La nota dice dónde se define el mínimo (R10). Sin la nota de «datos de ejemplo»: la tabla ya es real. */}
        {estadoKpis === 'error' && (
          <AvisoReintentar error={stats.error} fallo="No se pudieron cargar las tarjetas de existencias" onReintentar={stats.recargar} />
        )}
        <FranjaKpis estado={estadoKpis} titulo="Existencias" nota={AYUDA_MINIMO_INVENTARIO}>
          <TarjetaKpi kpi="inv_fisico" valor={tarjetas?.fisico.valor ?? null} ayuda={tarjetas?.fisico.ayuda} />
          <TarjetaKpi kpi="inv_reservado" valor={tarjetas?.reservado.valor ?? null} ayuda={tarjetas?.reservado.ayuda} />
          <TarjetaKpi kpi="inv_disponible" valor={tarjetas?.disponible.valor ?? null} ayuda={tarjetas?.disponible.ayuda} />
          <TarjetaKpi kpi="inv_en_transito" valor={tarjetas?.en_transito.valor ?? null} ayuda={tarjetas?.en_transito.ayuda} />
        </FranjaKpis>

        {/* B4 T18, bloques 2 y 3 (TABLA-inventario punto 5, KANBAN-resto): la barra y la tabla estándar en el servidor, o el
            tablero solo para ver en modo servidor, con el MISMO estado (pestaña, búsqueda, orden y categoría). En Kanban las
            pestañas no se ven (el tablero muestra los tres niveles de stock). */}
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
                  {/* r2 (F81): si «Actualizar» falla con el catálogo ya cargado, se dice junto al selector (la vuelta, en useCatalogo). */}
                  <AvisoCatalogoViejo catalogo={categorias} fallo="No se pudieron actualizar las categorías" onReintentar={recargarCategorias} />
                  {categoria && (
                    <button type="button" onClick={() => cambiarCategoria('')}
                      className={`rounded-xl px-3 py-2 text-xs font-bold text-rose-700 hover:bg-rose-50 ${FOCOS.indigo}`}>
                      Quitar filtro
                    </button>
                  )}
                </>
              )}
              ajustes={{ columnas: COLUMNAS_TABLA_STOCK, preferencias: prefs, anchoRef: anchoTablaRef }}
              kanbanDisponible
              pantallaCompleta={enKanban ? undefined : { completa, alternar }}
              color="indigo"
              {...totalDeLaBarra}
            />
            {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden, y los tonos de la fila son de la tabla; un
                clic en la fila abre el detalle. */}
            {!enKanban && (
              <TablaEstandar
                id={ID_STOCK}
                modo="servidor"
                columnas={COLUMNAS_TABLA_STOCK}
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
                etiqueta="Existencias por referencia"
              />
            )}
          </section>
          {enKanban ? (
            /* KANBAN-resto: Agotado · Bajo el mínimo · Bien abastecido, solo para ver: sin regla, con su motivo. El clic abre el detalle. */
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
      {detalle && <DetalleExistencia f={detalle} onCerrar={() => setDetalle(null)} />}
    </div>
  );
}
