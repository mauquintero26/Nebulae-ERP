'use client';

import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Check, ClipboardList, Eye, Info, PackageCheck, Plus, RefreshCw, Truck } from 'lucide-react';
// B4 T16A: Recepciones 100 % sobre el servidor (R5, C3, C4): la tabla estándar con las vistas reales (Por confirmar ·
// Confirmadas · Canceladas · Todas), el tablero solo para ver en modo servidor, las tarjetas rec_*, la nota en lugar de
// «Regla de Separación» y la franja del flujo con «Estás aquí» en Recepción en bodega. Se conserva lo de B1 a B3: el Drawer
// con «Confirmar entrada física», el selector de PEC por recepcionar y los textos del conteo.
import {
  SubNav, PageHeader, Badge, Button, Modal, Drawer, EmptyState, MenuFila, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi,
  TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo } from '@/components/flujo';
import { useResumen } from '@/components/ui/useResumen';
import { AvisoDeError } from '@/components/ui/AvisoFuente';
import { COMP_NAV } from '../comp-nav';
import {
  CeldaEstadoRecepcion, columnasRecepcion, esRecepcionPorConfirmar, numeroRecepcion, pecDeRecepcion, titulosDeOrdenRecepcion,
} from '../columnas-recepcion';
import type { FilaColumnasRecepcion } from '../columnas-recepcion';

import { FOCOS, RESERVA_BOTON_IA } from '@/lib/design-system';
import { apiFetch } from '@/lib/api';
import {
  accionModo, accionVistaEnLista, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta, ordenEsAtencion,
  textoOrdenHub,
} from '@/lib/tabla';
import { NOTA_RECEPCIONES, PERIODO_KPI, tarjetasRecepciones } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import { fCOP, textoDia } from '../columnas-pec';
import {
  COLUMNAS_RECEPCION, OPCIONES_ESTADOS_TABLERO_RECEPCION, bodegaRecepcion, consultaColumnaRecepcion, cuerpoRecepcionarPec,
  datosConfirmacion, infoEstadoPec, opcionesEstadosRecepcion, tarjetaRecepcion, textoVacioRecepciones,
} from '@/lib/estados-compras';
import { avisosFlujoCompras, pasosPantallaCompras, textoReglaCompras } from '@/lib/flujo-compras';
// B4 T24 f3 (FINAL-C4-f, ruling 5): confirmar es de ADMIN y BODEGA; recepcionar un PEC, de ADMIN y COMPRAS (accesoRecepciones).
// r1 (C1 y la heredada): «Confirmar» con la MISMA regla del detalle (confirmarRecepcion: sin bodega receptora o heredada, no; su motivo).
import { accesoRecepciones, confirmarRecepcion } from '@/lib/roles';
import { SelectorBodegaRecepcion, useBodegasRecepcion } from '../bodega-recepcion';
import { useRolActual } from '@/components/ui/useRolActual';

/** Una línea de la recepción (productos de _gr_dict; los nombres de campo cambian según quién la creó). */
type LineaRecepcion = {
  product_name?: string; nombre?: string; descripcion?: string; sku?: string; destino?: string;
  qty_esperada?: number; quantity_expected?: number; qty?: number; cantidad?: number;
  qty_recibida?: number; quantity_received?: number; cantidad_recibida?: number;
};
/** Una fila de GET /compras/recepciones (el _gr_dict de T12). dias_retraso es del servidor. */
type FilaRecepcion = FilaColumnasRecepcion & { warehouse_id?: number | null; notas?: string | null };
/** Un pedido de compra del selector «Recepcionar PEC» (GET /compras/pedidos). */
type PecPorRecepcionar = {
  id: number; numero: string; estado: string; supplier_name?: string | null; ven_numero?: string | null;
  fecha_entrega_estimada?: string | null; total_cop?: number | null;
};
/** `conteos` de GET /compras/recepciones con con_conteos=1 (T12): cada vista, con la búsqueda (R5). */
type ConteosRecepcion = Partial<Record<'por_confirmar' | 'confirmadas' | 'canceladas' | 'todas', number>>;

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_RECEPCIONES = 'compras.recepciones';
/** RP41, D6: la pestaña de trabajo es Por confirmar. */
const INICIAL_RECEPCIONES = { vista: 'por_confirmar' };
/** D39: en Kanban la lista va sin filas (limit=0); los conteos siguen al día y las filas las piden las columnas. */
const EXTRA_TABLERO = { limit: 0 };
/** El motivo de un tablero solo para ver (R11, KANBAN-logistica punto 5). */
const TEXTO_SOLO_VER = 'Este tablero es para ver: las recepciones se confirman contando la mercancía.';
/** Los estados del PEC que se pueden recepcionar: en camino y los que ya llegaron a bodega (R9). */
const ESTADOS_RECEPCIONABLES = 'EN_TRANSITO,PENDIENTE_ENTREGA,RECIBIDO,PARCIALMENTE_RECIBIDA';
/** El contenedor de los Hubs y de las listas del bloque (T7 a T15): RESERVA_BOTON_IA (pb-24, F44-a) deja libre la esquina del botón de la IA. */
const CONTENEDOR = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;
const FOCO_VISIBLE = FOCOS.teal;

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaRecepcion = {
  abrir: (r: FilaRecepcion) => void;
  abrirConteo: (r: FilaRecepcion) => void;
  confirmar: (r: FilaRecepcion) => void;
  /** B4 T24 f3 (FINAL-C4-f; r1, C1): si se ofrece «Confirmar» para esa recepción y, si no, su motivo (confirmarRecepcion). */
  confirmacion: (r: FilaRecepcion) => { confirmar: boolean; texto: string | null };
  /** El rol confirma (ADMIN y BODEGA): si la recepción lo impide (sin bodega o heredada), el ítem del menú queda apagado con el motivo. */
  puedeConfirmar: boolean;
  /** La recepción cuyo «Confirmar» está en camino: solo ese botón muestra la carga (antes, todos a la vez). */
  confirmandoId: number | null;
};
const AccionesFila = React.createContext<AccionesFilaRecepcion | null>(null);

const BOTON_FILA = `rounded-lg p-1.5 transition-colors ${FOCO_VISIBLE}`;

/**
 * Acciones (R11): «Abrir conteo» (hacia /compras/recepciones/{id}), «Confirmar» (solo una recepción por confirmar; cada
 * botón carga por su cuenta, confirmandoId) y el menú ⋯ (MenuFila: clic y portal) con «Ver detalle», «Abrir conteo» y
 * «Confirmar». Todo lleva el número de la recepción en su aria-label.
 */
function CeldaAcciones({ r }: { r: FilaRecepcion }) {
  const acciones = useContext(AccionesFila);
  const numero = numeroRecepcion(r);
  const porConfirmar = esRecepcionPorConfirmar(r);
  const confirmando = acciones?.confirmandoId === r.id;
  const confirmacion = acciones?.confirmacion(r) ?? { confirmar: false, texto: null };
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(r) },
    { etiqueta: 'Abrir conteo', icono: ClipboardList, onClick: () => acciones?.abrirConteo(r) },
    { etiqueta: 'Confirmar', icono: Check, onClick: () => acciones?.confirmar(r), oculto: !porConfirmar || !acciones?.puedeConfirmar,
      deshabilitado: !confirmacion.confirmar || acciones?.confirmandoId != null,
      titulo: !confirmacion.confirmar ? confirmacion.texto ?? undefined : acciones?.confirmandoId != null ? 'Hay otra confirmación en camino.' : undefined },
  ];
  return (
    <span className="flex items-center justify-end gap-0.5">
      <Link href={`/dashboard/compras/recepciones/${r.id}`} aria-label={`Abrir el conteo de ${numero}`} title="Abrir conteo"
        className={`${BOTON_FILA} text-teal-700 hover:bg-teal-50`}>
        <ClipboardList size={14} aria-hidden="true" />
      </Link>
      {confirmacion.confirmar && (
        <button type="button" onClick={() => acciones?.confirmar(r)} disabled={acciones?.confirmandoId != null}
          aria-label={`Confirmar la recepción ${numero}`} aria-busy={confirmando}
          className={`relative inline-flex items-center gap-1 rounded-lg border border-teal-700 bg-teal-700 px-2 py-1 text-xs font-bold text-white transition-colors hover:bg-teal-800 disabled:cursor-not-allowed disabled:opacity-60 ${FOCO_VISIBLE}`}>
          {/* B4 T24 f3 (el anillo de f1 r3): la carga no ensancha el botón (sin ella, la celda cabe en sus 132 px útiles): el spinner va
              encima del texto, que se oculta sin dejar de ocupar su lugar. */}
          {confirmando && <RefreshCw size={12} aria-hidden="true" className="absolute inset-0 m-auto animate-spin" />}
          <span className={confirmando ? 'invisible' : undefined}>Confirmar</span>
        </button>
      )}
      <MenuFila items={items} etiqueta={`Acciones de ${numero}`} />
    </span>
  );
}

/**
 * B4 T16A, la tabla (TABLA-compras punto 9; R26, D41): las columnas de columnas-recepcion.tsx (compartidas con Inventario ›
 * Recepciones, T19) con la celda de Acciones de esta lista. Una constante (estable, D40). Retraso, Bodega, Ítems y Stock
 * van ocultas por defecto.
 */
const COLUMNAS_TABLA_RECEPCIONES = columnasRecepcion<FilaRecepcion>((r) => <CeldaAcciones r={r} />);
/** {campo de orden: título}, para el chip «Orden: Fecha ↓», solo de las columnas que se ordenan. */
const TITULOS_ORDEN_RECEPCIONES = titulosDeOrdenRecepcion(COLUMNAS_TABLA_RECEPCIONES);

/**
 * Las pestañas de Recepciones (RP41, D6, sin emojis): las vistas de GET /compras/recepciones, con los conteos del servidor
 * (con la búsqueda; null mientras cargan: la barra gris, nunca 0). Por confirmar va en ámbar si hay alguna.
 */
function pestanasDeRecepciones(conteos: ConteosRecepcion | null): PestanaTabla[] {
  return [
    { id: 'por_confirmar', etiqueta: 'Por confirmar', conteo: conteos?.por_confirmar ?? null, alerta: (conteos?.por_confirmar ?? 0) > 0 },
    { id: 'confirmadas', etiqueta: 'Confirmadas', conteo: conteos?.confirmadas ?? null },
    { id: 'canceladas', etiqueta: 'Canceladas', conteo: conteos?.canceladas ?? null },
    { id: 'todas', etiqueta: 'Todas', conteo: conteos?.todas ?? null },
  ];
}

/* ================================================================
   MAIN PAGE — RecepcionesPage (B4 T16A)
   ================================================================ */
export default function RecepcionesPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { avisar, avisarError } = useAvisos();
  const rol = useRolActual();
  const accesoRec = accesoRecepciones(rol);

  // ── bloque 1: la carga del servidor (TABLA-compras punto 9; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, las tarjetas, la tabla y el tablero
  // despachan a él. El modo (Lista o Kanban) se guarda en vista:compras.recepciones.
  const [estado, despachar, listo] = useEstadoTabla(ID_RECEPCIONES, INICIAL_RECEPCIONES);
  const enKanban = estado.modo === 'kanban';
  const [selectedItem, setSelectedItem] = useState<FilaRecepcion | null>(null);
  const [confirmandoId, setConfirmandoId] = useState<number | null>(null);

  // GET /compras/recepciones con vista, estados, q, orden, limit y offset del estado, más los conteos de las pestañas en la
  // MISMA llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban, sin filas. Sin orden, el del servidor
  // (la más reciente primero).
  const listado = useListado<FilaRecepcion>({
    ruta: '/compras/recepciones', estado, conConteos: true, esperar: !listo, despachar, extra: enKanban ? EXTRA_TABLERO : null,
  });
  // m5 de T8: mientras la última respuesta sea la de Kanban (sin filas) y la tabla ya pida su página, la tabla está
  // cargando y el total en 'cargando': nunca «No hay recepciones…» con el total de la otra consulta.
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, enKanban);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !enKanban && llegadaAhora.sinFilas && !listado.error;
  const conteos = listado.conteos as ConteosRecepcion | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero solo para ver, en modo servidor (KANBAN-logistica punto 5; R11, C4, D39): una consulta por columna
  // (consultaColumnaRecepcion: sin vista, los estados de la columna cruzados con el filtro y la búsqueda del MISMO estado),
  // porColumna = el tamaño de la tabla y limit=0 en las plegadas (lo hace el hook).
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

  // La franja del flujo (FLUJO-compras punto 9; R9, RP46, D36, D42): GET /compras/flujo; recargaFlujo sube con cada recarga.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/compras/flujo', recargaFlujo);

  // Las tarjetas (KPI-compras punto 8; R7, R12): GET /compras/stats?periodo=30d, sin respaldo local. Mientras no llega,
  // 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  // B4 T24 f3 (F45): el cargador compartido de los resúmenes (useResumen: aborta la anterior, descarta las viejas, va atado al usuario,
  // conserva lo último al recargar y con error no deja datos viejos: «—»).
  const stats = useResumen(`/compras/stats?periodo=${PERIODO_KPI}`, vueltaStats);
  const cargandoStats = stats.cargando;
  const estadoKpis = useEstadoKpi(cargandoStats, stats.error);
  const tarjetas = tarjetasRecepciones(stats.datos);

  // «Actualizar» y lo que sigue a confirmar o recepcionar: la lista con sus conteos, el tablero, la franja y las tarjetas.
  // Ninguna recarga vacía lo que se ve: los hooks conservan lo último.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado, recargarTablero]);

  // ── el selector «Recepcionar PEC» (B1 a B3): los pedidos en camino o ya en bodega, pedidos al abrir la ventana ──
  const [showPecModal, setShowPecModal] = useState(false);
  const [creatingFromPec, setCreatingFromPec] = useState<number | null>(null);
  // r1 (C1, la raíz): la bodega receptora de la recepción que se crea (null: sin tocar; bodegaRecepcion preselecciona la única).
  const bodegas = useBodegasRecepcion(showPecModal);
  const [bodegaElegida, setBodegaElegida] = useState<string | null>(null);
  const [vueltaPecs, setVueltaPecs] = useState(0);
  const [pecs, setPecs] = useState<{ vuelta: number; filas: PecPorRecepcionar[]; error: unknown } | null>(null);
  useEffect(() => {
    if (!showPecModal) return undefined;
    const control = new AbortController();
    apiFetch(`/compras/pedidos?estados=${ESTADOS_RECEPCIONABLES}&orden=-estado&limit=200`, { signal: control.signal })
      .then((r: unknown) => setPecs({ vuelta: vueltaPecs, filas: normalizarRespuesta(r).filas as PecPorRecepcionar[], error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setPecs({ vuelta: vueltaPecs, filas: [], error: err }); });
    return () => control.abort();
  }, [showPecModal, vueltaPecs]);
  const cargandoPecs = pecs?.vuelta !== vueltaPecs;

  const abrir = useCallback((r: FilaRecepcion) => setSelectedItem(r), []);
  const abrirConteo = useCallback((r: FilaRecepcion) => router.push(`/dashboard/compras/recepciones/${r.id}`), [router]);

  const handleCrearDesdePec = async (pecId: number) => {
    setCreatingFromPec(pecId);
    try {
      const user = localStorage.getItem('user_name') || 'Mesa de Recepción';
      const res = await apiFetch(`/compras/pedidos/${pecId}/recepcionar`, {
        method: 'POST',
        body: JSON.stringify(cuerpoRecepcionarPec({
          creadoPor: user, notas: 'Recepción generada en Mesa de Entrada', bodega: bodegaRecepcion(bodegaElegida, bodegas.filas),
        })),
      });
      avisar('Recepción ENINV creada correctamente', { tono: 'ok' });
      setShowPecModal(false);
      recargarTodo();
      const creada = res?.data ?? res;
      if (creada && typeof creada === 'object') setSelectedItem(creada as FilaRecepcion);
    } catch (err) {
      avisarError(err, 'No se pudo crear la recepción');
      if (recargarTrasError(err)) setVueltaPecs((n) => n + 1);
    } finally {
      setCreatingFromPec(null);
    }
  };

  // Confirmar (la fila, el menú o el Drawer): cada botón carga por su cuenta (confirmandoId). Si el servidor dice que no, su
  // mensaje tal cual; con la regla única recargarTrasError (recarga con un 400, un 409, un 422 (F8) o sin respuesta; un 404 o un
  // 500 no), se recarga lo que se ve.
  const handleConfirmarRecepcion = useCallback(async (r: FilaRecepcion) => {
    setConfirmandoId(r.id);
    try {
      const user = localStorage.getItem('user_name') || 'Operario Bodega';
      const idempotencyKey = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `rec-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      await apiFetch(`/compras/recepciones/${r.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({ idempotency_key: idempotencyKey, receipt_type: 'FISICA', user_name: user, notas: 'Confirmado en mesa de recepción Nebulae' }),
      });
      avisar('Recepción confirmada y stock actualizado correctamente', { tono: 'ok' });
      setSelectedItem(null);
      recargarTodo();
    } catch (err) {
      avisarError(err, `No se pudo confirmar ${numeroRecepcion(r)}`);
      if (recargarTrasError(err)) recargarTodo();
    } finally {
      setConfirmandoId(null);
    }
  }, [avisar, avisarError, recargarTodo]);
  const confirmacion = useCallback((r: FilaRecepcion) => confirmarRecepcion({ ...datosConfirmacion(r), rol }), [rol]);
  const accionesFila = useMemo<AccionesFilaRecepcion>(() => ({
    abrir, abrirConteo, confirmar: (r) => { void handleConfirmarRecepcion(r); }, confirmacion, puedeConfirmar: accesoRec.confirmar, confirmandoId,
  }), [abrir, abrirConteo, handleConfirmarRecepcion, confirmacion, accesoRec.confirmar, confirmandoId]);
  // La tarjeta del tablero: «Contar y confirmar» solo si esa recepción se puede confirmar (r1, C1: con bodega y, si es heredada, ADMIN).
  const tarjetaDeRecepcion = useCallback((r: FilaRecepcion) => tarjetaRecepcion(r, { contar: confirmacion(r).confirmar }), [confirmacion]);

  // ── bloque 2: la tabla (TABLA-compras punto 9; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_RECEPCIONES, COLUMNAS_TABLA_RECEPCIONES);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const pestanas = pestanasDeRecepciones(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o las
  // de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
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

  // ── bloque 4: las tarjetas (KPI-compras punto 8; R5, R12) ──
  // rec_por_confirmar abre «Por confirmar» y rec_confirmadas «Confirmadas» (D41: como un clic en la pestaña; tocar la activa
  // vuelve a Todas). En Kanban abren esa pestaña en Lista (accionVistaEnLista). Los PEC en tránsito son informativos.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = vistaActiva === vista ? 'todas' : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosRecepcion));
  };
  const actualizando = listado.recargando || flujo.cargando || (cargandoStats && stats.datos !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath={pathname} color="teal" hub={{ href: '/dashboard/compras' }} />

      {/* B4 T16A (FLUJO-compras punto 9; R9, RP46, D42): la franja con «Estás aquí» en Recepción en bodega y el aviso «N
          recepciones por confirmar» reemplaza el banner ámbar «Mesa de Recepción Activa». Sin semáforo (la recepción no
          tiene atraso propio) ni «No resueltos». Va directo bajo la barra de submódulos, sin otro padding. */}
      <BannerFlujo
        titulo="Flujo de compras"
        idPreferencia={ID_RECEPCIONES}
        regla={textoReglaCompras()}
        pasos={pasosPantallaCompras(flujo.datos, 'RECEPCION')}
        avisos={avisosFlujoCompras(flujo.datos)}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
      />

      <div className={CONTENEDOR}>

        <PageHeader
          icon={PackageCheck} color="teal"
          title="Mesa de Recepciones Físico-Digital"
          subtitle="Inspección física y separación por destino: Cliente (despacho), Stock Nebulae (disponible) y Socio Mau."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              {accesoRec.recepcionar && (
                <Button size="sm" color="teal" icon={Plus} onClick={() => setShowPecModal(true)}>
                  Recepcionar PEC
                </Button>
              )}
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 text-xs font-bold shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
            </div>
          )}
        />

        {/* B4 T16A (KPI-compras punto 8; R7, R12): las 3 tarjetas de /compras/stats (todas las recepciones y los PEC en
            tránsito): mientras cargan, barras grises (nunca 0); con error, «—». La nota corta reemplaza la tarjeta «Regla de
            Separación». */}
        <FranjaKpis estado={estadoKpis} titulo="Recepciones" nota={NOTA_RECEPCIONES}>
          <TarjetaKpi kpi="rec_por_confirmar" valor={tarjetas?.por_confirmar.valor ?? null}
            activo={vistaActiva === 'por_confirmar'} onClick={() => elegirVista('por_confirmar')} />
          <TarjetaKpi kpi="rec_confirmadas" valor={tarjetas?.confirmadas.valor ?? null}
            activo={vistaActiva === 'confirmadas'} onClick={() => elegirVista('confirmadas')} />
          <TarjetaKpi kpi="pec_en_transito" valor={tarjetas?.en_transito.valor ?? null} />
        </FranjaKpis>
        {/* B4 T24 f3 (FINAL-m14, F84): si /stats falla, su detalle y «Reintentar» solo para él; un 403 no lo ofrece. */}
        {estadoKpis === 'error' && (
          <AvisoDeError error={stats.error} fallo="No se pudieron cargar los indicadores de compras" onReintentar={stats.recargar} acento="teal" />
        )}

        {/* B4 T16A (TABLA-compras punto 9, KANBAN-logistica punto 5): la barra y la tabla estándar en el servidor, o el
            tablero solo para ver en modo servidor, con el MISMO estado (pestaña, búsqueda y estados). En Kanban las
            pestañas no se ven (el tablero muestra todas las recepciones por grupo). */}
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
                      className={`rounded font-bold text-teal-700 hover:underline ${FOCO_VISIBLE}`}>
                      Más recientes
                    </button>
                  </span>
                ) : undefined}
                ajustes={{ columnas: COLUMNAS_TABLA_RECEPCIONES, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="teal"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50) y el orden son de la tabla; un clic en la fila
                  abre el Drawer. */}
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
                  etiqueta="Recepciones"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 5: Por contar · Confirmadas (plegada) · Canceladas (plegada), solo para ver: sin regla,
               con su motivo. El clic abre el Drawer, como la fila; «Contar y confirmar» lleva al conteo. */
            <TableroKanban
              tablero={tablero}
              soloLectura={TEXTO_SOLO_VER}
              tarjetaDe={tarjetaDeRecepcion}
              onAbrir={abrir}
              color="teal"
              vacio="Sin recepciones aquí"
            />
          ) : null}
        </div>
      </div>

      {/* MODAL SELECCIONAR PEC PARA RECEPCIONAR (B1 a B3) */}
      {showPecModal && (
        <Modal
          title="Iniciar Entrada desde Pedido de Compra"
          subtitle="Selecciona el embarque que acaba de llegar físicamente a la mesa de bodega"
          color="teal"
          maxWidth="xl"
          onClose={() => setShowPecModal(false)}
          footer={<Button variant="secondary" onClick={() => setShowPecModal(false)}>Cancelar</Button>}
        >
          <div className="mb-4">
            <SelectorBodegaRecepcion id="bodega-recepcionar-pec" bodegas={bodegas} elegida={bodegaElegida} onElegir={setBodegaElegida}
              deshabilitado={creatingFromPec !== null} />
          </div>
          {cargandoPecs ? (
            <div role="status" className="flex items-center justify-center gap-2 py-8 text-sm text-slate-500">
              <RefreshCw size={16} aria-hidden="true" className="animate-spin text-teal-500" /> Buscando los pedidos de compra…
            </div>
          ) : pecs?.error != null ? (
            <div role="alert" className="py-6 text-center text-sm text-rose-700">
              {textoDeError(pecs.error, 'No se pudieron cargar los pedidos de compra')}.{' '}
              <button type="button" onClick={() => setVueltaPecs((n) => n + 1)} className={`rounded font-bold underline ${FOCO_VISIBLE}`}>Reintentar</button>
            </div>
          ) : (pecs?.filas.length ?? 0) === 0 ? (
            <EmptyState icon={Truck} message="No hay pedidos de compra en camino para recepcionar." />
          ) : (
            <div className="space-y-3">
              {pecs?.filas.map((pec) => (
                <div key={pec.id} className="p-4 border border-slate-200 rounded-2xl hover:border-teal-400 transition-colors flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-black text-purple-700 text-sm">{pec.numero}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-100 text-slate-600 rounded-full">{infoEstadoPec(pec.estado).label}</span>
                      {pec.ven_numero && (
                        <span className="text-[10px] font-bold px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">
                          Cliente: {pec.ven_numero}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold text-slate-700 mt-1">{pec.supplier_name || 'Proveedor'}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">Entrega est.: {textoDia(pec.fecha_entrega_estimada)} · {fCOP(pec.total_cop)}</p>
                  </div>
                  <Button size="sm" color="teal" icon={PackageCheck} loading={creatingFromPec === pec.id} disabled={creatingFromPec !== null}
                    onClick={() => handleCrearDesdePec(pec.id)}>
                    Recepcionar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Modal>
      )}

      {/* DRAWER DETALLE DE RECEPCION Y SEPARACION POR DESTINO (B1 a B3) */}
      {selectedItem && (
        <Drawer idTitulo="drawer-recepcion-titulo"
          onClose={() => setSelectedItem(null)}
          header={(
            <div>
              <div className="flex items-center gap-2.5">
                <h2 id="drawer-recepcion-titulo" className="text-xl font-black text-slate-800">{numeroRecepcion(selectedItem)}</h2>
                <CeldaEstadoRecepcion r={selectedItem} />
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspección Física y Clasificación de Líneas en Mesa de Entrada
              </p>
            </div>
          )}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setSelectedItem(null)}>Cerrar</Button>
              <Link href={`/dashboard/compras/recepciones/${selectedItem.id}`}
                className={`inline-flex items-center gap-2 rounded-xl border border-teal-200 bg-white px-4 py-2.5 text-sm font-bold text-teal-800 hover:bg-teal-50 ${FOCO_VISIBLE}`}>
                <ClipboardList size={14} aria-hidden="true" /> Abrir conteo
              </Link>
              {/* r1 (C1, m42): sin «Confirmar» (sin bodega, heredada o el rol no confirma), su motivo en el pie. */}
              {confirmacion(selectedItem).confirmar ? (
                <Button color="teal" icon={Check} loading={confirmandoId === selectedItem.id} disabled={confirmandoId !== null}
                  onClick={() => handleConfirmarRecepcion(selectedItem)}>
                  Confirmar Entrada Física y Actualizar Stock
                </Button>
              ) : confirmacion(selectedItem).texto && (
                <p role="status" className="max-w-xs text-xs font-semibold text-slate-600">{confirmacion(selectedItem).texto}</p>
              )}
            </>
          )}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-500 uppercase">PEC Asociado</p>
              <p className="font-bold text-sm text-purple-700 mt-0.5">{pecDeRecepcion(selectedItem)}</p>
            </div>
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-500 uppercase">Bodega de Destino</p>
              <p className="font-bold text-sm text-slate-800 mt-0.5">{selectedItem.warehouse_name || 'Sin bodega asignada'}</p>
            </div>
          </div>

          {/* Guía Visual de Separación */}
          <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4">
            <h4 className="text-xs font-black text-teal-800 uppercase flex items-center gap-1.5 mb-2">
              <Info size={14} aria-hidden="true" /> Reglas de Distribución de Mercancía
            </h4>
            <div className="grid grid-cols-3 gap-2 text-[11px]">
              <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                <span className="font-black text-emerald-700 block mb-0.5">Destino: Cliente</span>
                <span className="text-slate-500">Pasa a cola de despacho. Se retiene entrega hasta cobrar 40% saldo.</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                <span className="font-black text-blue-700 block mb-0.5">Destino: Stock</span>
                <span className="text-slate-500">Ingresa a stock disponible para venta inmediata en catálogo y web.</span>
              </div>
              <div className="bg-white p-2.5 rounded-xl border border-teal-100">
                <span className="font-black text-purple-700 block mb-0.5">Destino: Mau</span>
                <span className="text-slate-500">Separado en casillero de socio para custodia o entrega especial.</span>
              </div>
            </div>
          </div>

          {/* Tabla de Productos de la Recepción */}
          <section>
            <h3 className="text-xs font-black text-slate-700 uppercase tracking-wider mb-3">Líneas de la Recepción</h3>
            <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-sm overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase">
                  <tr>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3 text-center">Destino</th>
                    <th className="px-4 py-3 text-center">Esperado</th>
                    <th className="px-4 py-3 text-center">Recibido</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {((selectedItem.lineas || selectedItem.productos || [
                    { nombre: 'Producto General', descripcion: selectedItem.notas || 'Lote general recibido', destino: 'CLIENTE', qty: 1, cantidad_recibida: 1 },
                  ]) as LineaRecepcion[]).map((linea, idx) => {
                    const destino = (linea.destino || 'CLIENTE').toUpperCase();
                    return (
                      <tr key={idx} className="hover:bg-slate-50/60">
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800">{linea.product_name || linea.nombre || linea.descripcion || 'Ítem de Compra'}</p>
                          {linea.sku && <p className="text-[10px] text-slate-500 font-mono">{linea.sku}</p>}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Badge tone={destino === 'MAU' ? 'purple' : (destino === 'NEBULAE' || destino === 'STOCK') ? 'info' : 'success'}>
                            {destino === 'MAU' ? 'Socio Mau' : destino === 'NEBULAE' || destino === 'STOCK' ? 'Stock Nebulae' : 'Cliente'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center font-bold text-slate-700">
                          {linea.qty_esperada ?? linea.quantity_expected ?? linea.qty ?? linea.cantidad ?? 1}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className="font-bold text-teal-700 bg-teal-50 px-2 py-1 rounded-lg">
                            {linea.qty_recibida ?? linea.quantity_received ?? 0}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        </Drawer>
      )}
    </div>
  );
}
