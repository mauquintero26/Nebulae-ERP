'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Eye, Plus, RefreshCw, SlidersHorizontal } from 'lucide-react';
// B4 T19: Ajustes de Inventario 100 % sobre el servidor (R5, C3, C4): la tabla estándar con la Fecha REAL del ajuste (un instante, antes
// era una fecha de creación que la tabla no tiene), las pestañas Todos · Entradas · Salidas con el parámetro `direccion` del servidor
// (RP96: la dirección de un ajuste es la de su primer movimiento, como los grupos del Kardex), el tablero solo para ver Entradas · Salidas
// y las tarjetas aju_* de los TOTALES de tres consultas (limit=0): los mismos números de las pestañas. Se conserva lo de B1 a B3: crear
// un ajuste (tipo, bodega, producto, cantidad, motivo y notas); sus avisos pasan de alert() a useAvisos.
import {
  SubNav, PageHeader, Drawer, Modal, Button, MenuFila, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi, TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { INV_NAV } from '../inv-nav';
import { AvisoReintentar, CONTENEDOR, FOCOS, useCatalogo } from '../piezas-inventario';
import type { OpcionCatalogo } from '../piezas-inventario';
import { CHIP, titulosDeOrdenPec } from '../../compras/columnas-pec';

import { apiFetch } from '@/lib/api';
import { accionVistaEnLista, dependenciasTablero, estadoDelTotal, normalizarRespuesta, ordenEsAtencion, textoOrdenHub } from '@/lib/tabla';
import { formatoDecimal, lecturaDeCarga, tarjetasAjustes } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import { fechaLarga } from '@/lib/fechas-colombia';
import {
  COLUMNAS_AJUSTE, MOTIVOS_AJUSTE, bodegaDeAjuste, cantidadDeAjuste, consultaAjustes, consultaColumnaAjuste, direccionDeAjuste,
  consultasTotalesAjuste, infoDireccionAjuste, motivoDeAjuste, nombreBodega, numeroAjuste, pestanasAjustes, skuDeAjuste, tarjetaAjuste, textoFechaAjuste,
  textoVacioAjustes, vistaDeTarjetaAjuste,
} from '@/lib/estados-compras';

/** Un movimiento de una operación de inventario (InventoryMovementResponse): los nombres son los del servidor. */
type MovimientoAjuste = { id?: number; sku_id?: number | null; quantity?: number | string | null; direction?: string | null };
/** Una fila de GET /inventory/operations?operation_type=ADJUSTMENT (InventoryOperationResponse + `fecha`, T13). */
type FilaAjuste = {
  id: number;
  status?: string | null;
  source_warehouse_id?: number | null;
  dest_warehouse_id?: number | null;
  notas?: string | null;
  fecha?: string | null;
  movements?: MovimientoAjuste[] | null;
};
/** Un producto buscado para el ajuste (GET /crm/products/search). */
type ProductoBuscado = { id: number; display?: string; product_name?: string };
type FormAjuste = { tipo: 'ENTRADA' | 'SALIDA'; sku_id: number | null; product_name: string; warehouse_id: string; qty: number; motivo: string; notas: string };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_AJUSTES = 'inventario.ajustes';
const INICIAL_AJUSTES = { vista: 'todos' };
const RUTA_OPERACIONES = '/inventory/operations';
/** El motivo de un tablero solo para ver (R11, KANBAN-resto). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: la dirección de un ajuste sale de su primer movimiento y no se cambia arrastrando tarjetas.';
const FORM_VACIO: FormAjuste = { tipo: 'ENTRADA', sku_id: null, product_name: '', warehouse_id: '', qty: 1, motivo: MOTIVOS_AJUSTE[0], notas: '' };

/** Las bodegas de la pantalla (null mientras llegan o si fallaron: las celdas dicen «Bodega #id»). */
const BodegasAjuste = React.createContext<ReadonlyArray<OpcionCatalogo> | null>(null);
/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
const AccionesFila = React.createContext<{ abrir: (a: FilaAjuste) => void } | null>(null);

/** Tipo: la insignia de la dirección del ajuste (Entrada en verde, Salida en rojo; sin dirección, gris). */
function CeldaTipo({ a }: { a: FilaAjuste }) {
  const info = infoDireccionAjuste(direccionDeAjuste(a));
  return <span className={`${CHIP} text-[11px] ${info.clases.bg} ${info.clases.text} ${info.clases.border}`}>{info.label}</span>;
}
/** Cantidad: la del primer movimiento con su signo (+ entra, − sale); sin número, «—». */
function CeldaCantidad({ a }: { a: FilaAjuste }) {
  const info = infoDireccionAjuste(direccionDeAjuste(a));
  const n = cantidadDeAjuste(a);
  return (
    <span className={`text-xs font-black ${info.signo === '+' ? 'text-green-700' : info.signo === '-' ? 'text-red-700' : 'text-slate-700'}`}>
      {n === null ? '—' : `${info.signo}${formatoDecimal(Math.abs(n))}`}
    </span>
  );
}
/** Bodega: el nombre (del contexto); si no llegó, «Bodega #id». */
function CeldaBodega({ a }: { a: FilaAjuste }) {
  const nombre = nombreBodega(useContext(BodegasAjuste), bodegaDeAjuste(a));
  return <span className="block truncate text-xs text-slate-600">{nombre}</span>;
}
/** Acciones (R11): «Ver detalle» a la vista y en el menú ⋯. Todo lleva el número del ajuste en su nombre. */
function CeldaAcciones({ a }: { a: FilaAjuste }) {
  const acciones = useContext(AccionesFila);
  const numero = numeroAjuste(a);
  const items: ItemMenuFila[] = [{ etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(a) }];
  return (
    <span className="flex items-center justify-end gap-0.5">
      <button type="button" onClick={() => acciones?.abrir(a)} aria-label={`Ver el detalle de ${numero}`} title="Ver detalle"
        className={`rounded-lg p-1.5 text-amber-700 transition-colors hover:bg-amber-50 ${FOCOS.indigo}`}>
        <Eye size={14} aria-hidden="true" />
      </button>
      <MenuFila items={items} etiqueta={`Acciones de ${numero}`} />
    </span>
  );
}

/**
 * B4 T19, la tabla (TABLA-inventario punto 11; R26, D41): Ajuste # (clave, fija a la izquierda), Tipo (clave), Producto (la flexible),
 * Bodega, Cantidad (clave), Motivo, Fecha y Acciones (clave, fija a la derecha). A 1024 px con el menú abierto la caja de la tabla
 * deja 704 px (medido en T7 a T18), sin casilla de selección: Ajuste # 100 + Tipo 96 + Producto 120 (su piso de R26) + Bodega 120 +
 * Cantidad 84 + Fecha 92 + Acciones 80 = 692. Motivo va oculta por defecto (se muestra con «Ajustar tabla»). El servidor ordena por
 * id, fecha y bodega destino (los campos de GET /inventory/operations). Una constante: estable (D40).
 */
const COLUMNAS_TABLA_AJUSTES: ColumnaTabla<FilaAjuste>[] = [
  { id: 'numero', titulo: 'Ajuste #', ancho: 100, clave: true, fija: 'izquierda', ordenable: 'id', titleCelda: (a) => numeroAjuste(a),
    celda: (a) => <span className="block truncate text-xs font-black text-amber-700">{numeroAjuste(a)}</span> },
  { id: 'tipo', titulo: 'Tipo', ancho: 96, clave: true, titleCelda: (a) => infoDireccionAjuste(direccionDeAjuste(a)).label, celda: (a) => <CeldaTipo a={a} /> },
  { id: 'producto', titulo: 'Producto', ancho: 120, flexible: true, titleCelda: (a) => skuDeAjuste(a),
    celda: (a) => <span className="block truncate text-xs font-bold text-slate-800">{skuDeAjuste(a)}</span> },
  { id: 'bodega', titulo: 'Bodega', ancho: 120, ordenable: 'destino', celda: (a) => <CeldaBodega a={a} /> },
  { id: 'cantidad', titulo: 'Cantidad', ancho: 84, alinear: 'derecha', clave: true, celda: (a) => <CeldaCantidad a={a} /> },
  { id: 'motivo', titulo: 'Motivo', ancho: 140, ocultaPorDefecto: true, titleCelda: (a) => motivoDeAjuste(a),
    celda: (a) => <span className="block truncate text-xs text-slate-600">{motivoDeAjuste(a)}</span> },
  { id: 'fecha', titulo: 'Fecha', ancho: 92, ordenable: 'fecha', titleCelda: (a) => textoFechaAjuste(a),
    celda: (a) => <span className="text-xs text-slate-600">{textoFechaAjuste(a)}</span> },
  { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: (a) => <CeldaAcciones a={a} /> },
];
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_AJUSTES = titulosDeOrdenPec(COLUMNAS_TABLA_AJUSTES);

/** Los totales de las pestañas y las tarjetas: tres consultas con limit=0 (RP96); si una falla, las tres «—» y «Reintentar». */
type TotalesAjustes = { vuelta: string; totales: { todos: number; entradas: number; salidas: number } | null; error: unknown };

/* ================================================================
   MAIN PAGE — AjustesPage (B4 T19)
   ================================================================ */
export default function AjustesPage() {
  const { avisar, avisarError } = useAvisos();

  // ── bloque 1: la carga del servidor (TABLA-inventario punto 11; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, las tarjetas, la tabla y el tablero despachan a él. El modo (Lista o
  // Kanban) se guarda en vista:inventario.ajustes.
  const [estado, despachar, listo] = useEstadoTabla(ID_AJUSTES, INICIAL_AJUSTES);
  const enKanban = estado.modo === 'kanban';
  const [selected, setSelected] = useState<FilaAjuste | null>(null);

  // La tabla: la página (25 o 50) de GET /inventory/operations?operation_type=ADJUSTMENT. La pestaña viaja como `direccion`
  // (consultaAjustes). esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban no pide la lista (activo: false, RP35).
  const extraDeLaLista = useMemo(() => consultaAjustes(estado), [estado]);
  const listado = useListado<FilaAjuste>({
    ruta: RUTA_OPERACIONES, estado, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });

  // El tablero solo para ver, en modo servidor (R11, C4, D39): una consulta por columna con SU dirección y la búsqueda del MISMO estado.
  const tablero = useTableroKanban<FilaAjuste>({
    pantalla: ID_AJUSTES,
    modo: 'servidor',
    columnas: COLUMNAS_AJUSTE,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    cargar: async (columna, { offset, limit, signal }) => {
      const consulta = consultaColumnaAjuste(estado, columna, { limit, offset });
      return normalizarRespuesta(await apiFetch(`${RUTA_OPERACIONES}?${consulta}`, { signal }));
    },
  });

  // Las bodegas (GET /inventory/warehouses): los nombres de la tabla y el selector del ajuste. Si fallan, se dice con «Reintentar».
  const { catalogo: bodegas, recargar: recargarBodegas } = useCatalogo('/inventory/warehouses');

  // Los totales (RP96): tres consultas con limit=0 (todos, direccion=entrada y direccion=salida) con la BÚSQUEDA del estado (R5, m1).
  // Las pestañas y las tarjetas leen ESTOS mismos números. La primera carga va en 'cargando' (nunca 0); una recarga (o una búsqueda
  // nueva) conserva el último valor atenuado ('actualizando', I3); si fallan, «—» y «Reintentar».
  const [vueltaTotales, setVueltaTotales] = useState(0);
  const [cargados, setCargados] = useState<TotalesAjustes | null>(null);
  const qTotales = estado.q.trim();
  const claveTotales = `${vueltaTotales}|${qTotales}`;
  useEffect(() => {
    const control = new AbortController();
    const consultas = consultasTotalesAjuste(qTotales);
    const total = async (consulta: string) => normalizarRespuesta(await apiFetch(`${RUTA_OPERACIONES}?${consulta}`, { signal: control.signal })).total;
    Promise.all([total(consultas.todos), total(consultas.entradas), total(consultas.salidas)])
      .then(([todos, entradas, salidas]) => setCargados({ vuelta: claveTotales, totales: { todos, entradas, salidas }, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setCargados({ vuelta: claveTotales, totales: null, error: err }); });
    return () => control.abort();
  }, [claveTotales, qTotales]);
  const { datos: totales, cargando: cargandoTotales } = lecturaDeCarga(cargados && { vuelta: cargados.vuelta, datos: cargados.totales, error: cargados.error }, claveTotales);
  const errorTotales = cargandoTotales ? null : (cargados?.error ?? null);
  const estadoKpis = useEstadoKpi(cargandoTotales, errorTotales);
  const tarjetas = tarjetasAjustes(totales);

  // «Actualizar» y lo que sigue a crear un ajuste: la tabla, el tablero, los totales y las bodegas. Ninguna recarga vacía lo que se ve.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    setVueltaTotales((n) => n + 1);
    recargarBodegas();
  }, [recargarListado, recargarTablero, recargarBodegas]);

  const abrir = useCallback((a: FilaAjuste) => setSelected(a), []);
  const accionesFila = useMemo(() => ({ abrir }), [abrir]);

  // ── bloque 2: la tabla (TABLA-inventario punto 11; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_AJUSTES, COLUMNAS_TABLA_AJUSTES);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas: PestanaTabla[] = pestanasAjustes(totales);
  // R8: ordenada por una columna, el chip «Orden: … · Más recientes» vuelve al orden del servidor.
  const textoOrden = enKanban || !estado.orden || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_AJUSTES);
  const vacio = useMemo(() => {
    const texto = textoVacioAjustes({ vista: estado.vista, q: estado.q });
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.vista, estado.q]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: listado.total,
    estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),
  };

  // ── bloque 3: el tablero solo para ver (KANBAN-resto; R11, RP96) ──
  const tarjetaDe = useCallback((a: FilaAjuste) => tarjetaAjuste(a, bodegas.filas), [bodegas.filas]);

  // ── bloque 4: las tarjetas (KPI-inventario punto 9; R5, R12) ──
  // Total, Entradas y Salidas abren su pestaña (D41: como un clic en ella; tocar la activa vuelve a Todos). En Kanban abren esa
  // pestaña en Lista. La diferencia neta es informativa (no equivale a una vista).
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (kpi: 'aju_total' | 'aju_entradas' | 'aju_salidas') => {
    const vista = vistaDeTarjetaAjuste(kpi) ?? 'todos';
    const siguiente = vistaActiva === vista ? 'todos' : vista;
    despachar(accionVistaEnLista(estado, siguiente, null));
  };
  const actualizando = listado.recargando || (cargandoTotales && cargados !== null);

  // ── crear un ajuste (B1 a B3, sin cambios de comportamiento; los alert() pasan a useAvisos) ──
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<FormAjuste>(FORM_VACIO);
  const [productResults, setProductResults] = useState<ProductoBuscado[]>([]);
  const productTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function onProductSearch(q: string) {
    setForm((f) => ({ ...f, product_name: q, sku_id: null }));
    if (productTimer.current) clearTimeout(productTimer.current);
    if (!q.trim()) { setProductResults([]); return; }
    productTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/crm/products/search?q=${encodeURIComponent(q)}`);
        setProductResults(Array.isArray(d) ? d : (d?.data ?? []));
      } catch (err) {
        setProductResults([]);
        avisarError(err, 'No se pudo buscar el producto');
      }
    }, 300);
  }

  async function createAjuste(e: React.FormEvent) {
    e.preventDefault();
    if (!form.sku_id) { avisar('Selecciona un producto de la lista', { tono: 'error' }); return; }
    setSaving(true);
    try {
      await apiFetch(RUTA_OPERACIONES, {
        method: 'POST',
        body: JSON.stringify({
          operation_type: 'ADJUSTMENT',
          dest_warehouse_id: parseInt(form.warehouse_id, 10),
          notas: form.motivo + (form.notas ? ` — ${form.notas}` : ''),
          movements: [{ sku_id: form.sku_id, quantity: form.qty, direction: form.tipo === 'ENTRADA' ? 'IN' : 'OUT' }],
          created_by: localStorage.getItem('user_name') || '',
        }),
      });
      avisar('Ajuste registrado', { tono: 'ok' });
      setShowCreate(false);
      setForm(FORM_VACIO);
      recargarTodo();
    } catch (err) {
      avisarError(err, 'No se pudo registrar el ajuste');
      // La regla única (recargarTrasError): con un 400, un 409, un 422 (F8) o sin respuesta se recarga lo que se ve; un 404 o un 500, no.
      if (recargarTrasError(err)) recargarTodo();
    } finally {
      setSaving(false);
    }
  }

  const direccionSeleccionada = infoDireccionAjuste(selected ? direccionDeAjuste(selected) : null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/ajustes" color="amber" />

      <div className={CONTENEDOR}>
        <PageHeader icon={SlidersHorizontal} color="amber"
          title="Ajustes de Inventario"
          subtitle="Correcciones de stock por mermas, conteos físicos o diferencias."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors ${FOCOS.indigo}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Button color="amber" icon={Plus} onClick={() => setShowCreate(true)}>Nuevo Ajuste</Button>
            </div>
          )} />

        {/* B4 T19 (KPI-inventario punto 9; R7, R12, RP96): las 4 tarjetas de los TOTALES de tres consultas (los mismos números de las
            pestañas): mientras cargan, barras grises (nunca 0); con error, «—» y «Reintentar». Total, Entradas y Salidas abren su
            pestaña; la diferencia neta (entradas − salidas, con signo) es informativa. */}
        <FranjaKpis estado={estadoKpis} titulo="Ajustes">
          <TarjetaKpi kpi="aju_total" valor={tarjetas.total.valor}
            activo={vistaActiva === vistaDeTarjetaAjuste('aju_total')} onClick={() => elegirVista('aju_total')} />
          <TarjetaKpi kpi="aju_entradas" valor={tarjetas.entradas.valor}
            activo={vistaActiva === vistaDeTarjetaAjuste('aju_entradas')} onClick={() => elegirVista('aju_entradas')} />
          <TarjetaKpi kpi="aju_salidas" valor={tarjetas.salidas.valor}
            activo={vistaActiva === vistaDeTarjetaAjuste('aju_salidas')} onClick={() => elegirVista('aju_salidas')} />
          <TarjetaKpi kpi="aju_neto" formato="texto" valor={tarjetas.neto.texto} ayuda={tarjetas.neto.ayuda} />
        </FranjaKpis>
        {errorTotales != null && (
          <AvisoReintentar error={errorTotales} fallo="No se pudieron cargar los totales de ajustes" onReintentar={() => setVueltaTotales((n) => n + 1)} />
        )}
        {bodegas.error != null && bodegas.filas === null && (
          <AvisoReintentar error={bodegas.error} fallo="No se pudieron cargar las bodegas (los nombres salen como «Bodega #N»)" onReintentar={recargarBodegas} />
        )}

        {/* B4 T19 (TABLA-inventario punto 11, KANBAN-resto): la barra y la tabla estándar en el servidor, o el tablero solo para ver
            Entradas · Salidas, con el MISMO estado (búsqueda). En Kanban las pestañas no se ven (el tablero trae las dos columnas). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <BodegasAjuste.Provider value={bodegas.filas}>
              <section ref={refTarjeta} className={claseTarjeta}>
                <BarraTabla
                  estado={estado}
                  onEstado={despachar}
                  pestanas={enKanban ? undefined : pestanas}
                  estadoConteos={estadoKpis}
                  placeholder="Buscar ajuste, motivo o guía…"
                  filtros={textoOrden ? (
                    <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                      {textoOrden}
                      <span aria-hidden="true">·</span>
                      <button type="button" onClick={() => despachar({ tipo: 'orden', valor: null })}
                        className={`rounded font-bold text-amber-700 hover:underline ${FOCOS.indigo}`}>
                        Más recientes
                      </button>
                    </span>
                  ) : undefined}
                  ajustes={{ columnas: COLUMNAS_TABLA_AJUSTES, preferencias: prefs, anchoRef: anchoTablaRef }}
                  kanbanDisponible
                  pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                  color="amber"
                  {...totalDeLaBarra}
                />
                {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden por columna son de la tabla; un clic en la fila
                    abre el Drawer. */}
                {!enKanban && (
                  <TablaEstandar
                    id={ID_AJUSTES}
                    modo="servidor"
                    columnas={COLUMNAS_TABLA_AJUSTES}
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
                    etiqueta="Ajustes de inventario"
                  />
                )}
              </section>
            </BodegasAjuste.Provider>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-resto: Entradas · Salidas, solo para ver: sin regla, con su motivo. El clic abre el Drawer, como la fila. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER}
              tarjetaDe={tarjetaDe}
              onAbrir={abrir}
              color="amber"
              vacio="Sin ajustes aquí"
            />
          ) : null}
        </div>
      </div>

      {/* Drawer (B1 a B3): el detalle del ajuste, con la fecha real. */}
      {selected && (
        <Drawer etiqueta="Detalle del ajuste"
          onClose={() => setSelected(null)}
          header={(
            <div>
              <h2 className="font-extrabold text-xl text-slate-900">{numeroAjuste(selected)}</h2>
              <p className="text-xs text-slate-500">Ajuste de Inventario</p>
              <div className="mt-2">
                <span className={`${CHIP} text-[11px] ${direccionSeleccionada.clases.bg} ${direccionSeleccionada.clases.text} ${direccionSeleccionada.clases.border}`}>
                  {direccionSeleccionada.label}
                </span>
              </div>
            </div>
          )}
          footer={<Button variant="secondary" onClick={() => setSelected(null)}>Cerrar</Button>}
        >
          <div className="grid grid-cols-2 gap-3">
            {([
              ['Producto', skuDeAjuste(selected)],
              ['Bodega', nombreBodega(bodegas.filas, bodegaDeAjuste(selected))],
              ['Cantidad', cantidadDeAjuste(selected) === null ? '—' : `${direccionSeleccionada.signo}${formatoDecimal(Math.abs(cantidadDeAjuste(selected) ?? 0))}`],
              ['Fecha', fechaLarga(selected.fecha) || '—'],
              ['Motivo', motivoDeAjuste(selected)],
            ] as [string, string][]).map(([titulo, valor]) => (
              <div key={titulo} className="bg-slate-50 rounded-xl p-3">
                <p className="text-xs text-slate-500 mb-1">{titulo}</p>
                <p className="font-bold text-sm text-slate-800">{valor}</p>
              </div>
            ))}
          </div>
        </Drawer>
      )}

      {/* Create Modal (B1 a B3) */}
      {showCreate && (
        <Modal cierreExterno={false} title="Nuevo Ajuste de Inventario" icon={SlidersHorizontal} color="amber" onClose={() => setShowCreate(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" form="ajuste-form" loading={saving} color={form.tipo === 'ENTRADA' ? 'emerald' : 'red'} icon={SlidersHorizontal}>
                {saving ? 'Registrando...' : `Registrar ${form.tipo === 'ENTRADA' ? 'Sobrante' : 'Merma'}`}
              </Button>
            </>
          )}>
          <form id="ajuste-form" onSubmit={createAjuste} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ajuste-tipo" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo *</label>
                <select id="ajuste-tipo" required value={form.tipo} onChange={(e) => setForm((f) => ({ ...f, tipo: e.target.value as FormAjuste['tipo'] }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                  <option value="ENTRADA">Entrada (Sobrante)</option>
                  <option value="SALIDA">Salida (Merma)</option>
                </select>
              </div>
              <div>
                <label htmlFor="ajuste-bodega" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega *</label>
                <select id="ajuste-bodega" required value={form.warehouse_id} disabled={!bodegas.filas}
                  onChange={(e) => setForm((f) => ({ ...f, warehouse_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none disabled:text-slate-500">
                  <option value="">{bodegas.filas ? 'Seleccionar...' : (bodegas.error ? 'No se pudieron cargar' : 'Cargando bodegas…')}</option>
                  {(bodegas.filas ?? []).map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
                {bodegas.error != null && bodegas.filas === null && (
                  <p role="alert" className="mt-1 text-[11px] font-semibold text-rose-800">
                    {textoDeError(bodegas.error, 'No se pudieron cargar las bodegas')}.{' '}
                    <button type="button" onClick={recargarBodegas} className={`rounded font-bold underline ${FOCOS.indigo}`}>Reintentar</button>
                  </p>
                )}
              </div>
            </div>
            <div className="relative">
              <label htmlFor="ajuste-producto" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Producto *</label>
              <input id="ajuste-producto" required value={form.product_name} onChange={(e) => onProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none ${form.sku_id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`} />
              {productResults.length > 0 && !form.sku_id && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                  {productResults.map((p) => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm((f) => ({ ...f, sku_id: p.id, product_name: p.display || p.product_name || '' })); setProductResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b last:border-0 border-slate-50">
                      {p.display || p.product_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label htmlFor="ajuste-cantidad" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Cantidad *</label>
                <input id="ajuste-cantidad" required type="number" min={1} value={form.qty}
                  onChange={(e) => setForm((f) => ({ ...f, qty: parseInt(e.target.value, 10) || 1 }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div>
                <label htmlFor="ajuste-motivo" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Motivo *</label>
                <select id="ajuste-motivo" required value={form.motivo} onChange={(e) => setForm((f) => ({ ...f, motivo: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                  {MOTIVOS_AJUSTE.map((m) => <option key={m}>{m}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label htmlFor="ajuste-notas" className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas adicionales</label>
              <textarea id="ajuste-notas" rows={2} value={form.notas} onChange={(e) => setForm((f) => ({ ...f, notas: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
