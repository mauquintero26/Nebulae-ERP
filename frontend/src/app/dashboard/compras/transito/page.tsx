'use client';

import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { AlertCircle, Package, RefreshCw, Truck } from 'lucide-react';
// B4 T16A: Mercancía en tránsito 100 % sobre el servidor (R5, C3, C4): la tabla estándar y el tablero de etapas con el
// estado único de la pantalla, las tarjetas de /compras/stats y la franja del flujo con «Estás aquí» en En tránsito.
import {
  SubNav, PageHeader, useAvisos, FranjaKpis, TarjetaKpi, useEstadoKpi, TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { DatosTarjetaKanban } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { BannerFlujo, PasosFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import { COMP_NAV } from '../comp-nav';

import { FOCOS } from '@/lib/design-system';
import { accesoCompras } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import { apiFetch } from '@/lib/api';
import { estadoDelTotal } from '@/lib/tabla';
import { PERIODO_KPI, tarjetasTransito } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
// Piezas genéricas que nacieron en las libs de Ventas (T7), como en el Hub de Compras (T14): el chip del orden.
import { ordenEsAtencion, textoOrdenHub } from '@/lib/hub-ventas';
import { humanizarCodigo } from '@/lib/estados-pedido';
import { avisoTope200, infoEstadoPec, opcionesEstadosPec, textoVacioPec } from '@/lib/estados-compras';
import {
  accionEtapaTransito, avanceTransito, avancePromedioTransito, columnaTransito, columnasDeEtapas, etapaActual,
  pendienteDeTransito, reglaSoltarTransito, soltarPendientes, tarjetaTransito, terminarPendiente, textoEntregaTransito, tonoEntregaTransito,
} from '@/lib/transito';
import {
  accionSemaforoCompras, avisoTarjetaEtapa, avisosFlujoCompras, etiquetaEtapaTracking, filtroSemaforoCompras, pasosDeTracking,
  pasosPantallaCompras, textoReglaCompras,
} from '@/lib/flujo-compras';
// Las columnas, la clase de la fila vencida y los formatos que comparte con el Hub y con Pedidos de compra.
import { CeldaEntrega as CeldaDiaEntrega, CeldaEstado, CeldaMonto, claseDeFilaPec, fCOP, textoDia, titulosDeOrdenPec } from '../columnas-pec';
import type { FilaColumnasPec } from '../columnas-pec';

/** Quien hace el cambio (user_name: la Actividad del PEC dice su nombre). Sin nombre cae al correo del usuario; solo si tampoco hay correo se omite y la Actividad queda sin autor (update_tracking guarda user_name tal cual). */
const autorActual = () => {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem('user_name') || localStorage.getItem('user_email') || undefined;
};

/** Una etapa del envío (tracking_stages, con el aviso `alert` que calcula el servidor). */
type EtapaEnvio = {
  stage?: string;
  label?: string;
  status?: string;
  alert?: { nivel?: string; mensaje?: string; dias_restantes?: number } | null;
};
/** Una fila de GET /compras/pedidos?vista=transito_logistica (el _pec_dict de T12). is_overdue es la regla del servidor (RP40). */
type FilaTransito = FilaColumnasPec & {
  ven_id?: number | null;
  tipo_envio?: string | null;
  tracking_stages?: EtapaEnvio[] | null;
};

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_TRANSITO = 'compras.transito';
/** TABLA-compras punto 8: la vista transito_logistica de T12 con lo vencido primero (R8). */
const INICIAL_TRANSITO = { vista: 'transito_logistica', orden: 'atencion' };
/** C4: el tablero de etapas es de modo cliente: pide la vista completa, hasta 200 pedidos, de la primera página. */
const TOPE_TABLERO = 200;
const EXTRA_TABLERO = { orden: 'reciente', limit: TOPE_TABLERO, offset: 0 };
const RUTA_PEDIDOS = '/dashboard/compras/pedidos';
/** El contenedor de los Hubs y de las listas del bloque (T7 a T15): pb-24 deja libre la esquina del botón de la IA. */
const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';
const FOCO_VISIBLE = FOCOS.blue;

/** La flecha bonita de los labels de las etapas: 'Proveedor -> Casillero' -> 'Proveedor → Casillero'. */
const conFlecha = (texto: string) => texto.trim().replace(/\s*->\s*/g, ' → ');

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaTransito = {
  avanzar: (p: FilaTransito, accion: { stage: string; status: string }) => void;
  /** I3: ¿ese pedido tiene un cambio de etapa en camino (o su recarga sin llegar)? Su botón muestra la carga: cada fila por su cuenta. */
  pendiente: (id: number) => boolean;
  /** B4 T24 (FINAL-m38): si el rol puede iniciar o completar una etapa (PATCH /tracking: ADMIN y COMPRAS, accesoCompras). */
  puedeAvanzar: boolean;
};
const AccionesFila = React.createContext<AccionesFilaTransito | null>(null);

/** Pedido de compra: el número (enlace al panel del PEC) y su proveedor. */
function CeldaPedido({ p }: { p: FilaTransito }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <Link href={`${RUTA_PEDIDOS}?id=${p.id}`} className={`max-w-full truncate rounded text-xs font-black text-purple-700 hover:underline ${FOCO_VISIBLE}`}>
        {p.numero}
      </Link>
      <span className="max-w-full truncate text-[11px] text-slate-500">{p.supplier_name || 'Sin proveedor'}</span>
    </span>
  );
}

/** Cliente / PVEN: el pedido de venta de origen (enlace a su pantalla). */
function CeldaCliente({ p }: { p: FilaTransito }) {
  if (!p.ven_numero) return <span className="text-xs text-slate-400">—</span>;
  const clase = 'inline-block max-w-full truncate rounded-full border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 text-[11px] font-bold leading-tight text-emerald-700';
  return p.ven_id
    ? <Link href={`/dashboard/ventas/venta?id=${p.ven_id}`} className={`${clase} hover:bg-emerald-100 ${FOCO_VISIBLE}`}>{p.ven_numero}</Link>
    : <span className={clase}>{p.ven_numero}</span>;
}

/**
 * Etapa actual: la etapa que le falta completar (etapaActual) con su estado en palabras (etiquetaEtapaTracking) y, solo si el
 * servidor la marca atrasada, su aviso en rojo (RP28: el 'ok' no lleva alarma). Sin etapa por hacer (ya llegó a bodega),
 * el estado del pedido (RP98: 'Llegó a bodega').
 */
function CeldaEtapa({ p }: { p: FilaTransito }) {
  const etapa = etapaActual(p) as EtapaEnvio | null;
  if (!etapa) return <CeldaEstado p={p} />;
  const enCurso = etapa.status === 'EN_PROCESO';
  const titulo = tituloDeEtapa(etapa);
  // m5 y m7: el aviso es la regla única de la tarjeta de etapa (avisoTarjetaEtapa, RP28): rojo si va atrasada, gris si va a tiempo.
  const aviso = avisoTarjetaEtapa(etapa);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <span className="max-w-full truncate text-xs font-bold text-slate-700">{titulo}</span>
      <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-bold leading-tight ${
        enCurso ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-slate-200 bg-slate-50 text-slate-600'
      }`}>{etiquetaEtapaTracking(etapa.status)}</span>
      {aviso && <span title={aviso.texto} className={`max-w-full truncate text-[10px] font-bold ${CLASE_AVISO[aviso.tono] ?? CLASE_AVISO.gris}`}>{aviso.texto}</span>}
    </span>
  );
}

/** El título de una etapa: su label con la flecha, o la clave humanizada (nunca el código crudo). */
const tituloDeEtapa = (e: EtapaEnvio) => conFlecha(e.label || humanizarCodigo(e.stage || ''));
/** Los colores del aviso de una etapa (en -700: se leen sobre el fondo de la celda). */
const CLASE_AVISO: Record<string, string> = { rojo: 'text-rose-700', gris: 'text-slate-500', azul: 'text-blue-700', ambar: 'text-amber-700' };
/** El tono de «Entrega en N días»: ámbar con 3 días o menos (m17), rojo si el servidor la marca vencida. */
const CLASE_ENTREGA: Record<string, string> = { vencido: 'text-rose-700', pronto: 'text-amber-700', normal: 'text-slate-500' };

/** Progreso: un punto por etapa del envío (PasosFlujo mini con pasosDeTracking) y «n de m». */
function CeldaProgreso({ p }: { p: FilaTransito }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-1">
      <PasosFlujo variante="mini" pasos={pasosDeTracking(p.tracking_stages)} etiqueta={`Etapas del envío de ${p.numero}`} />
      <span className="text-[11px] font-bold text-slate-500">{avanceTransito(p).texto}</span>
    </span>
  );
}

/** Entrega est.: el día de negocio tal como se guarda (RP40) y cuánto falta o cuánto pasó; en rojo si el servidor la marca vencida. */
function CeldaEntrega({ p }: { p: FilaTransito }) {
  const texto = textoEntregaTransito(p);
  return (
    <span className="flex flex-col leading-tight">
      <CeldaDiaEntrega p={p} />
      {texto && <span className={`text-[11px] font-semibold ${CLASE_ENTREGA[tonoEntregaTransito(p)]}`}>{texto}</span>}
    </span>
  );
}

/** Acción (TABLA-compras punto 8): Iniciar o Completar la etapa actual; cada fila carga por su cuenta y lleva el número en su aria-label. */
function CeldaAccion({ p }: { p: FilaTransito }) {
  const acciones = useContext(AccionesFila);
  const accion = accionEtapaTransito(p);
  if (acciones?.pendiente(p.id)) {
    return <RefreshCw size={14} role="status" aria-label={`Actualizando ${p.numero}`} className="animate-spin text-blue-500" />;
  }
  if (!accion || !acciones?.puedeAvanzar) return <span className="text-xs text-slate-400">—</span>;
  const completar = accion.status === 'COMPLETADO';
  return (
    <button type="button" onClick={() => acciones?.avanzar(p, accion)} aria-label={`${accion.texto} la etapa actual de ${p.numero}`}
      className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${
        completar ? 'border-emerald-700 bg-emerald-700 text-white hover:bg-emerald-800'
          : 'border-slate-200 bg-slate-100 text-slate-700 hover:bg-blue-100 hover:text-blue-800'
      }`}>
      {accion.texto}
    </button>
  );
}

/**
 * B4 T16A, la tabla (TABLA-compras punto 8; R26, D41): Pedido de compra (clave, fija a la izquierda, la flexible), Cliente /
 * PVEN y Tipo (ocultas por defecto), Etapa actual, Progreso, Entrega est., Monto y Acción (fija a la derecha). A 1024 px con
 * el menú abierto la caja de la tabla deja 704 px: 120 + 124 + 104 + 104 + 108 + 96 = 656 (la flexible toma el resto). Una
 * constante (estable, D40).
 */
const COLUMNAS_TABLA_TRANSITO: ColumnaTabla<FilaTransito>[] = [
  { id: 'pedido', titulo: 'Pedido de compra', ancho: 120, clave: true, fija: 'izquierda', flexible: true, ordenable: 'numero',
    titleCelda: (p) => [p.numero, p.supplier_name || 'Sin proveedor', p.ven_numero].filter(Boolean).join(' · '),
    celda: (p) => <CeldaPedido p={p} /> },
  { id: 'cliente', titulo: 'Cliente / PVEN', ancho: 100, ocultaPorDefecto: true, titleCelda: (p) => p.ven_numero || 'Sin pedido de venta',
    celda: (p) => <CeldaCliente p={p} /> },
  { id: 'tipo', titulo: 'Tipo', ancho: 80, ocultaPorDefecto: true,
    celda: (p) => <span className="text-xs font-bold text-slate-500">{p.tipo_envio === 'directo' ? 'Directo' : 'Casillero'}</span> },
  { id: 'etapa', titulo: 'Etapa actual', ancho: 124, clave: true,
    titleCelda: (p) => { const e = etapaActual(p) as EtapaEnvio | null; return e ? tituloDeEtapa(e) : infoEstadoPec(p.estado).label; },
    celda: (p) => <CeldaEtapa p={p} /> },
  { id: 'progreso', titulo: 'Progreso', ancho: 104, titleCelda: (p) => avanceTransito(p).texto, celda: (p) => <CeldaProgreso p={p} /> },
  { id: 'entrega', titulo: 'Entrega est.', ancho: 104, ordenable: 'entrega',
    titleCelda: (p) => [textoDia(p.fecha_entrega_estimada), textoEntregaTransito(p)].filter(Boolean).join(' · '),
    celda: (p) => <CeldaEntrega p={p} /> },
  { id: 'monto', titulo: 'Monto', ancho: 108, alinear: 'derecha', ordenable: 'monto', titleCelda: (p) => fCOP(p.total_cop),
    celda: (p) => <CeldaMonto monto={p.total_cop} /> },
  { id: 'accion', titulo: 'Acción', ancho: 96, clave: true, fija: 'derecha', alinear: 'centro', celda: (p) => <CeldaAccion p={p} /> },
];
/** {campo de orden: título}, para el chip «Orden: Monto ↓» (textoOrdenHub), solo de las columnas que se ordenan. */
const TITULOS_ORDEN_TRANSITO = titulosDeOrdenPec(COLUMNAS_TABLA_TRANSITO);

/** El `data` de una respuesta {status, data}, o ella misma. */
const datosDe = (r: unknown) => (r !== null && typeof r === 'object' && 'data' in r ? (r as { data: unknown }).data : r);

/* ================================================================
   MAIN PAGE — TransitoPage (B4 T16A)
   ================================================================ */
export default function TransitoPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { avisar, avisarError } = useAvisos();

  // ── bloque 1: la carga del servidor (TABLA-compras punto 8; R5, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: la búsqueda, el filtro de estados, «Solo vencidos» (semaforo=vencidos), la franja, las
  // tarjetas, la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en vista:compras.transito.
  const [estado, despachar, listo] = useEstadoTabla(ID_TRANSITO, INICIAL_TRANSITO);
  // B4 T24 (FINAL-m10, m31 y m38): el rol después de montar (useRolActual) decide si se cambian los PEC (accesoCompras: PATCH y DELETE
  // /compras/pedidos y PATCH /tracking son de ADMIN y COMPRAS); sin permiso, el tablero es solo para ver y no se ofrecen sus acciones.
  const accesoPec = accesoCompras(useRolActual());
  const enKanban = estado.modo === 'kanban';

  // La tabla: la página (25 o 50) de GET /compras/pedidos?vista=transito_logistica. esperar: !listo (D40): el esqueleto, nunca
  // «vacío». Sin orden (el tercer clic en un título), 'atencion': lo vencido primero sigue siendo el orden por defecto (R8).
  const extraDeLaLista = useMemo(() => ({ orden: estado.orden || 'atencion' }), [estado.orden]);
  const lista = useListado<FilaTransito>({
    ruta: '/compras/pedidos', estado, esperar: !listo, despachar, activo: !enKanban, extra: extraDeLaLista,
  });
  // El tablero (modo cliente): la vista completa con el mismo estado, hasta 200 pedidos (C4). Otra consulta, activa solo en
  // Kanban: así la tabla nunca se ve con las 200 filas del tablero.
  const completa = useListado<FilaTransito>({
    ruta: '/compras/pedidos', estado, esperar: !listo, activo: enKanban, extra: EXTRA_TABLERO,
  });

  // GET /compras/tracking-config al cargar: las etapas del tablero. Si falla, el tablero lo dice con «Reintentar» (nunca un
  // tablero vacío sin razón) y sus columnas salen de las etapas de los pedidos.
  const [vueltaConfig, setVueltaConfig] = useState(0);
  const [config, setConfig] = useState<{ vuelta: number; datos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch('/compras/tracking-config', { signal: control.signal })
      .then((r: unknown) => setConfig({ vuelta: vueltaConfig, datos: datosDe(r), error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setConfig({ vuelta: vueltaConfig, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaConfig]);
  const cargandoConfig = config?.vuelta !== vueltaConfig;

  // La franja del flujo (FLUJO-compras punto 8; R9, RP46, D36, D42): GET /compras/flujo; recargaFlujo sube con cada recarga.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/compras/flujo', recargaFlujo);

  // Las tarjetas (KPI-compras punto 7; R7, R12): GET /compras/stats?periodo=30d (todos los PEC), sin respaldo local. Mientras
  // no llega, 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  const [stats, setStats] = useState<{ vuelta: number; datos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch(`/compras/stats?periodo=${PERIODO_KPI}`, { signal: control.signal })
      .then((r: { data?: unknown } | null) => setStats({ vuelta: vueltaStats, datos: r?.data ?? null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setStats({ vuelta: vueltaStats, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaStats]);
  const cargandoStats = stats?.vuelta !== vueltaStats;
  const estadoKpis = useEstadoKpi(cargandoStats, cargandoStats ? null : (stats?.error ?? null));

  // «Actualizar» y lo que sigue a un cambio de etapa: la tabla y el tablero (el que no se ve se recarga al activarse), la
  // franja y las tarjetas. Ninguna recarga vacía lo que se ve: los hooks conservan lo último.
  const { recargar: recargarLista } = lista;
  const { recargar: recargarCompleta } = completa;
  const recargarTodo = useCallback(() => {
    recargarLista();
    recargarCompleta();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarLista, recargarCompleta]);

  // ── bloque 6: avanzar una etapa (TABLA-compras punto 8; KANBAN-logistica punto 2) ──
  // El mismo PATCH /compras/pedidos/{id}/tracking del botón (Iniciar o Completar) y del arrastre a la etapa siguiente; queda en
  // la Actividad del PEC. Nada se traga: si falla, el mensaje del servidor tal cual (avisarError) y, con la regla única
  // recargarTrasError (con un 400, un 409 o sin respuesta recarga; un 404 no), se recarga lo que se ve.
  // I3: un pedido con un PATCH en camino (botón o arrastre), y hasta que llega la recarga, no ofrece Iniciar ni Completar: un
  // segundo clic no manda otro PATCH sobre la etapa vieja. Toda la regla vive en transito.js, con sus casos: pendienteDeTransito
  // dice si hay uno; terminarPendiente guarda la foto de la lista ACTIVA (y el modo) al resolver el PATCH; soltarPendientes lo suelta
  // cuando ESA lista trae filas nuevas o termina de recargar (también si falla). La lista inactiva no cuenta: no es la que se ve y,
  // si nunca cargó, da un [] nuevo con cada recarga. Si el modo cambia dentro de la ventana, se toma la foto de la nueva lista activa.
  const [enCurso, setEnCurso] = useState<{ id: number; fin: { filas: unknown; modo: string; visto: boolean } | null }[]>([]);
  const modo = enKanban ? 'kanban' : 'lista';
  const filasActivas = enKanban ? completa.filas : lista.filas;
  const recargandoActiva = enKanban ? completa.recargando : lista.recargando;
  // m5: la foto se lee en la continuación del PATCH (otra tarea del navegador); un efecto pasivo podría no haber corrido todavía
  // y dejaría la referencia vieja. useLayoutEffect corre dentro del commit, antes de cualquier continuación posterior.
  const filasAhora = useRef<{ filas: unknown; modo: string }>({ filas: filasActivas, modo });
  useLayoutEffect(() => { filasAhora.current = { filas: filasActivas, modo }; }, [filasActivas, modo]);
  const sueltos = soltarPendientes(enCurso, { filas: filasActivas, recargando: recargandoActiva, modo });
  if (sueltos !== enCurso) setEnCurso(sueltos);
  const pendiente = useCallback((id: number) => pendienteDeTransito(enCurso, id), [enCurso]);
  const pendienteRef = useRef(pendiente);
  useEffect(() => { pendienteRef.current = pendiente; }, [pendiente]);
  const iniciarCambio = useCallback((id: number) => setEnCurso((l) => [...l.slice(-19), { id, fin: null }]), []);
  // Terminó el PATCH y se pidió la recarga: sigue pendiente hasta que la lista activa trae filas nuevas o termina de recargar.
  const terminarCambio = useCallback((id: number) => {
    const ahora = filasAhora.current;
    setEnCurso((l) => terminarPendiente(l, id, ahora.filas, ahora.modo));
  }, []);
  // Falló sin recarga (un 404 o un 500): no hay nada que esperar.
  const descartarCambio = useCallback((id: number) => setEnCurso((l) => l.filter((e) => !(e.id === id && e.fin === null))), []);
  const aplicarEtapa = useCallback((p: FilaTransito, stage: string, status: string) => apiFetch(`/compras/pedidos/${p.id}/tracking`, {
    method: 'PATCH', body: JSON.stringify({ stage, status, user_name: autorActual() }),
  }), []);
  const avanzar = useCallback(async (p: FilaTransito, accion: { stage: string; status: string }) => {
    if (pendienteRef.current(p.id)) return;
    iniciarCambio(p.id);
    let recargar = true;
    try {
      await aplicarEtapa(p, accion.stage, accion.status);
      avisar(`${p.numero}: ${accion.status === 'COMPLETADO' ? 'etapa completada' : 'etapa iniciada'}`, { tono: 'ok' });
    } catch (err) {
      avisarError(err, `No se pudo actualizar ${p.numero}`);
      recargar = recargarTrasError(err);
    }
    if (recargar) {
      recargarTodo();
      terminarCambio(p.id);
    } else descartarCambio(p.id);
  }, [aplicarEtapa, avisar, avisarError, recargarTodo, iniciarCambio, terminarCambio, descartarCambio]);
  const accionesFila = useMemo<AccionesFilaTransito>(() => ({
    avanzar: (p, a) => { void avanzar(p, a); }, pendiente, puedeAvanzar: accesoPec.tracking,
  }), [avanzar, pendiente, accesoPec.tracking]);

  // ── bloque 2: la tabla (TABLA-compras punto 8; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_TRANSITO, COLUMNAS_TABLA_TRANSITO);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa: pantallaCompleta, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  // R8: ordenada por una columna, el chip «Orden: … · Atención primero» vuelve a lo vencido primero.
  const textoOrden = enKanban || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_TRANSITO);
  const vacio = useMemo(() => {
    const texto = textoVacioPec({ q: estado.q, semaforo: estado.semaforo, estados: estado.estados },
      'Los pedidos de compra activos aparecerán aquí cuando estén en camino.');
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
        <Link href={RUTA_PEDIDOS} className={`mt-3 inline-block rounded text-xs font-bold text-blue-700 hover:underline ${FOCO_VISIBLE}`}>Ir a Pedidos de compra</Link>
      </div>
    );
  }, [estado.q, estado.semaforo, estado.estados]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: lista.total,
    estadoTotal: estadoDelTotal({ total: lista.total, cargando: lista.cargandoInicial, recargando: lista.recargando, error: lista.error }),
  };

  // ── bloque 3: el tablero de etapas (KANBAN-logistica punto 2; R11, C4, D37, D39) ──
  // Modo cliente: los pedidos de la vista completa agrupados por la etapa que les falta completar (columnaTransito), con
  // las columnas de /compras/tracking-config (columnasDeEtapas; la de un PEC viejo con una etapa que ya no está se suma al
  // final). Mientras llegan la configuración o los pedidos, el tablero carga (items null). items estable: useMemo.
  const itemsTablero = useMemo<FilaTransito[] | null>(
    () => (completa.cargandoInicial || cargandoConfig || (completa.error != null && completa.filas.length === 0) ? null : completa.filas),
    [completa.cargandoInicial, completa.filas, completa.error, cargandoConfig],
  );
  const columnasTablero = useMemo(
    () => [...columnasDeEtapas(config?.datos ?? null, { pedidos: completa.filas })],
    [config?.datos, completa.filas],
  );
  const tablero = useTableroKanban<FilaTransito>({
    pantalla: ID_TRANSITO,
    modo: 'cliente',
    columnas: columnasTablero,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    items: itemsTablero,
    columnaDe: columnaTransito,
    esAtrasado: (p) => p.is_overdue === true,
    fechaMovimiento: (p) => p.fecha_entrega_estimada,
  });
  // Solo hacia la etapa siguiente del mismo pedido (reglaSoltarTransito): equivale a «Completar» y queda en la Actividad.
  const reglaTablero = useCallback(
    (p: FilaTransito, origen: string, destino: string) => reglaSoltarTransito(p, origen, destino, { columnas: columnasTablero }),
    [columnasTablero],
  );
  // Si el PATCH falla, el error sigue para que el tablero devuelva la tarjeta y avise el mensaje del servidor; con la regla
  // única recargarTrasError, se recarga antes.
  async function cambiarDesdeTablero(p: FilaTransito, resultado: { cuerpo?: { stage?: string } }) {
    const stage = resultado.cuerpo?.stage;
    if (typeof stage !== 'string' || !stage) throw new Error('No se pudo saber qué etapa completar.');
    if (pendienteRef.current(p.id)) throw new Error('Ese pedido ya tiene un cambio de etapa en camino.');
    iniciarCambio(p.id);
    try {
      await aplicarEtapa(p, stage, 'COMPLETADO');
    } catch (err) {
      if (recargarTrasError(err)) {
        recargarTodo();
        terminarCambio(p.id);
      } else descartarCambio(p.id);
      throw err;
    }
    recargarTodo();
    terminarCambio(p.id);
  }
  const abrirPedido = useCallback((p: FilaTransito) => router.push(`${RUTA_PEDIDOS}?id=${p.id}`), [router]);
  // La tarjeta: tarjetaTransito (chips «Vencido» y «Directo» o «Casillero», el tiempo y el botón de la etapa actual).
  const tarjetaDe = useCallback((p: FilaTransito): DatosTarjetaKanban => {
    const tarjeta = tarjetaTransito(p, { pendiente: pendiente(p.id) });
    const accion = accionEtapaTransito(p);
    return {
      ...tarjeta,
      // B4 T24 r1 (C1): «Iniciar» y «Completar» (PATCH /tracking) solo con tracking, también en el tablero (soloLectura no la quita).
      accionPrincipal: accesoPec.tracking && tarjeta.accionPrincipal && accion
        ? { ...tarjeta.accionPrincipal, onClick: () => { void avanzar(p, accion); } }
        : null,
    };
  }, [avanzar, pendiente, accesoPec.tracking]);
  const textoTope = enKanban && !completa.cargandoInicial ? avisoTope200(completa.total, 'pedidos') : null;
  const sinEtapas = enKanban && itemsTablero !== null && columnasTablero.length === 0;
  const errorConfig = !cargandoConfig && config?.error != null;
  // I2: si falla la carga del tablero, lo dice con «Reintentar» (con datos viejos, el mismo aviso encima); sin datos, items null.
  const errorTablero = enKanban && completa.error != null;
  const avisoTablero = (textoTope || errorConfig || sinEtapas || errorTablero) ? (
    <div className="flex flex-col gap-1">
      {errorTablero && (
        <p role="alert">
          {textoDeError(completa.error, 'No se pudieron cargar los pedidos en tránsito')}.{' '}
          <button type="button" onClick={completa.recargar} className={`rounded font-bold text-blue-700 underline ${FOCO_VISIBLE}`}>Reintentar</button>
        </p>
      )}
      {textoTope && <p>{textoTope}</p>}
      {errorConfig && (
        <p role="alert">
          {textoDeError(config?.error, 'No se pudieron cargar las etapas del envío')}. Las columnas salen de los pedidos.{' '}
          <button type="button" onClick={() => setVueltaConfig((n) => n + 1)} className={`rounded font-bold text-blue-700 underline ${FOCO_VISIBLE}`}>Reintentar</button>
        </p>
      )}
      {sinEtapas && <p>No hay etapas de envío configuradas para mostrar.</p>}
    </div>
  ) : undefined;

  // ── bloque 4: las tarjetas (KPI-compras punto 7; R7, R12, RP92, RP95) ──
  // pec_vencidos es el filtro «Solo vencidos» / «Con atraso» (semaforo=vencidos, RP92); tocarla otra vez lo quita. El avance
  // es el promedio de la página que se ve (RP95), de la tabla o del tablero; mientras llega, la barra gris.
  const filasVisibles = enKanban ? (completa.cargandoInicial ? null : completa.filas) : (lista.cargandoInicial ? null : lista.filas);
  const avance = useMemo(() => avancePromedioTransito(filasVisibles), [filasVisibles]);
  const tarjetas = tarjetasTransito(stats?.datos ?? null, avance);
  const errorLista = enKanban ? completa.error : lista.error;
  const estadoAvance = errorLista ? 'error' : filasVisibles === null ? 'cargando' : 'listo';

  // ── bloque 5: la franja del flujo (FLUJO-compras punto 8; R5, R9, C3, RP40, RP46, D42) ──
  // «Estás aquí» en En tránsito. «Con atraso» es semaforo=vencidos en el servidor, el mismo estado que «Solo vencidos» y la
  // tarjeta (accionSemaforoCompras; esta vista puede tener atrasos, así que no cambia de pestaña). Lista de compras, Pedido
  // de compra, Recepción en bodega y Recibido son enlaces a su pantalla.
  const filtroSemaforo = filtroSemaforoCompras(estado);
  const alFiltrarSemaforo = (f: FiltroSemaforo) => despachar(accionSemaforoCompras(estado, f, opcionesEstadosPec));
  const alternarVencidos = () => alFiltrarSemaforo(filtroSemaforo === 'atrasados' ? 'todos' : 'atrasados');
  const actualizando = lista.recargando || completa.recargando || flujo.cargando || (cargandoStats && stats !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath={pathname} color="blue" hub={{ href: '/dashboard/compras' }} />

      {/* B4 T16A (FLUJO-compras punto 8; R9, D42): la franja con «Estás aquí» en En tránsito reemplaza el aviso rojo «ALERTA DE
          RETRASO…» (ahora es «Con atraso» del semáforo). Va directo bajo la barra de submódulos, sin otro padding. */}
      <BannerFlujo
        titulo="Flujo de compras"
        idPreferencia={ID_TRANSITO}
        regla={textoReglaCompras()}
        semaforo={{
          atrasados: flujo.datos?.semaforo?.atrasados ?? null,
          filtro: filtroSemaforo,
          onFiltrar: alFiltrarSemaforo,
        }}
        pasos={pasosPantallaCompras(flujo.datos, 'TRANSITO')}
        avisos={avisosFlujoCompras(flujo.datos)}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
      />

      <div className={CONTENEDOR}>

        <PageHeader icon={Truck} color="blue"
          title="Mercancía en tránsito"
          subtitle="Seguimiento de los embarques activos y su progreso por etapas."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href={RUTA_PEDIDOS}
                className={`flex items-center gap-2 px-4 py-2 bg-blue-700 hover:bg-blue-800 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <Package size={16} aria-hidden="true" /> Ver pedidos
              </Link>
            </div>
          )} />

        {/* B4 T16A (KPI-compras punto 7; R7, R12): las 4 tarjetas de /compras/stats (todos los PEC) y el avance de la página:
            mientras cargan, barras grises (nunca 0); con error, «—». Con entrega vencida es el filtro «Con atraso». */}
        <FranjaKpis estado={estadoKpis} titulo="Mercancía en tránsito">
          <TarjetaKpi kpi="pec_activos" valor={tarjetas.activos.valor} ayuda={tarjetas.activos.ayuda} />
          <TarjetaKpi kpi="pec_vencidos" valor={tarjetas.vencidos.valor} tono={tarjetas.vencidos.tono}
            activo={filtroSemaforo === 'atrasados'} onClick={alternarVencidos} />
          <TarjetaKpi kpi="pec_avance" valor={tarjetas.avance.valor} ayuda={tarjetas.avance.ayuda} estado={estadoAvance} />
          <TarjetaKpi kpi="pec_monto_por_recibir" valor={tarjetas.monto_por_recibir.valor} />
        </FranjaKpis>

        {/* B4 T16A (TABLA-compras punto 8, KANBAN-logistica punto 2): la barra y la tabla estándar en el servidor, o el tablero
            de etapas en modo cliente, con el MISMO estado (búsqueda, estados y «Solo vencidos»). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={despachar}
                placeholder="Buscar por número, proveedor, pedido de venta, comprador o producto…"
                opcionesEstados={opcionesEstadosPec}
                filtros={(
                  <>
                    <button type="button" onClick={alternarVencidos} aria-pressed={filtroSemaforo === 'atrasados'}
                      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold transition-colors ${FOCO_VISIBLE} ${
                        filtroSemaforo === 'atrasados' ? 'border-rose-700 bg-rose-700 text-white' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                      }`}>
                      <AlertCircle size={14} aria-hidden="true" /> Solo vencidos
                    </button>
                    {textoOrden && (
                      <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                        {textoOrden}
                        <span aria-hidden="true">·</span>
                        <button type="button" onClick={() => despachar({ tipo: 'orden', valor: 'atencion' })}
                          className={`rounded font-bold text-blue-700 hover:underline ${FOCO_VISIBLE}`}>
                          Atención primero
                        </button>
                      </span>
                    )}
                  </>
                )}
                ajustes={{ columnas: COLUMNAS_TABLA_TRANSITO, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa: pantallaCompleta, alternar }}
                color="blue"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden por columna y la fila vencida en filaAlerta. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_TRANSITO}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_TRANSITO}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={lista.filas}
                  total={lista.total}
                  cargando={lista.cargandoInicial}
                  recargando={lista.recargando}
                  error={lista.error}
                  onReintentar={lista.recargar}
                  aviso={lista.avisoOrden}
                  claseFila={claseDeFilaPec}
                  vacio={vacio}
                  etiqueta="Mercancía en tránsito"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-logistica punto 2: una columna por etapa del envío. Arrastrar solo lleva a la etapa siguiente del mismo
               pedido y equivale a «Completar»; lo demás queda bloqueado con su motivo ANTES de soltar. */
            <TableroKanban
              tablero={tablero}
              regla={reglaTablero}
              tarjetaDe={tarjetaDe}
              onAbrir={abrirPedido}
              onCambio={cambiarDesdeTablero}
              aviso={avisoTablero}
              soloLectura={accesoPec.soloLectura}
              color="blue"
              vacio="Sin pedidos en esta etapa"
            />
          ) : null}
        </div>
      </div>
    </div>
  );
}
