'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  MessageCircle, Trash2, X, RefreshCw, Bell, Settings, Activity, CheckCircle2, Zap, ToggleLeft, ToggleRight, Save,
  TrendingUp, ArrowRight, AlertTriangle, ExternalLink, Plus,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import {
  SubNav, PageHeader, Drawer, Modal, Button, useAvisos, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila,
  TableroKanban, useTableroKanban,
} from '@/components/ui';
import type { DatosColumnaKanban, ItemMenuFila } from '@/components/ui';
// B4 T7: el Hub 100 % sobre el servidor (R6, C4): la tabla y el tablero estándar con el estado único de la pantalla
// (C3), la franja del flujo, la cadena de documentos del panel rápido y la pestaña Análisis estándar.
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, CadenaDocumentos, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { TABLE, TABS_BAR } from '@/lib/design-system';
import { accionPestana, dependenciasTablero, estadoDelTotal, normalizarRespuesta, queryListado } from '@/lib/tabla';
import { alternarSeleccion, pasosConConteos } from '@/lib/flujo';
import {
  PASOS_FLUJO_VENTAS, chipsFiltroHub, conteosDesdeResumen, leerEnlaceHub, pasoTrasPestana, tabHubDePaso, textoRegla,
} from '@/lib/flujo-ventas';
import {
  COLUMNAS_HUB, chipsResolucionHub, confirmacionReiniciarSolicitud, estadoDeTarjeta, opcionesEstadosHub, reglaSoltarHub,
  tarjetaHub,
} from '@/lib/kanban-ventas';
import { PERIODO_KPI } from '@/lib/kpis';
import { FOCOS_VENTAS } from '@/lib/analisis';
import { pestanaConTecla } from '@/lib/pestanas';
import { textoDeError, esErrorDeValidacion } from '@/lib/avisos';
import { VEN_NAV } from './ven-nav';
import { CambiosDeActividad, EnlaceConfirmacionModal, getUsuarioActual } from './flujo';
import { ChannelModal, ESTADOS as ESTADOS_COT } from './cotizacion/cotizacion-client';
import { useEstadoEnvioWhatsApp } from './cotizacion/estado-envio-whatsapp';
import { ESTADOS_SC } from './solicitud/solicitud-client';
import { ComposerChatter, EtiquetaChatter } from './chatter';
import { agregarActividad, esEntradaChatter, motivoTelefono, textoSinTelefono } from '@/lib/chatter';
import { infoEstadoPedido } from '@/lib/estados-pedido';
import {
  ordenParaCancelar, motivoNoCancelable, resumenLote, ETIQUETA_ESTADO_VEN, ESTADOS_VEN_MANUALES, opcionesEstadoPVEN,
  repartirCambioEstadoPVEN, comoUTC, textoAntiguedad, notaReiniciaAtraso, conDetalleDelEnvio, accionSiguienteDocumento,
  tituloGrupo, scConCotDeFilas, ordenEsAtencion, textoOrdenHub, RUTA_HUB_VENTAS, cantidadPositiva,
} from '@/lib/hub-ventas';
import { waUrl, abrirWhatsApp } from '@/lib/whatsapp';
import { correoDelCliente } from '@/lib/aviso-correo';
import { formatoPesos } from '@/lib/pesos';
import { etiquetaTipoSolicitud } from '@/lib/etiquetas-ventas';
import { diasAlerta, valorConfig, enteroConfig, DIAS_VALIDEZ_COTIZACION, configLeida, cuerpoGuardarConfig,
  AVISO_CONFIG_SIN_LEER } from '@/lib/listas-ventas';
// B3 T16: las secciones nuevas del ConfigPanel, la etiqueta de las acciones del Bloque 3 y el WhatsApp automático del
// envío desde el tablero (R15: lo nuevo vive en sus archivos; aquí solo se cablea).
import { SeccionSeguimiento } from './seguimiento';
import { ConfigEnvioWhatsApp } from './config-envio-whatsapp';
import { SeccionDocumentosCliente, SeccionIva, EtiquetaAccionBloque3 } from './hub-bloque3';
import { accionBloque3 } from '@/lib/acciones-bloque3';
import { abreWhatsAppLocal, MENSAJE_WHATSAPP_SIN_GUARDAR, banderaReenvio } from '@/lib/envio-whatsapp';
import { configSeguimientoInicial, errorConfigSeguimiento } from '@/lib/seguimiento';
// Revisión final B3 (F2): la regla de rol (M12) y la nota ámbar en la ventana de envío del tablero (M47).
import { esAdmin } from '@/lib/roles';
import { AvisoNombreSinContacto } from './aviso-nombre-sin-contacto';
import { normalizarTarifaIva, TARIFA_IVA_POR_DEFECTO } from '@/lib/iva';

// H42: pesos enteros con punto de miles ('$1.062.523'); lo que no es un monto (null, NaN) se ve '$0'.
const fCOP  = (v: any) => formatoPesos(v);
// Las fechas del API son UTC; si alguna llega sin zona, comoUTC la marca como UTC (no hora local corrida 5 h).
const fDate = (iso: any) => iso ? new Date(comoUTC(iso)).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(comoUTC(iso)).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';

// N10: el estado siempre con su etiqueta (pedido: estados-pedido.js; COT y SC: sus tablas), nunca el código crudo; una
// clave desconocida sale humanizada. B4 T7: el filtro de estados ya no la usa (opcionesEstadosHub, agrupado por tipo).
const etiquetaEstado = (tipo: string, e: string): string => {
  if (tipo === 'VEN') return infoEstadoPedido(e).label;
  const propia = tipo === 'COT' ? ESTADOS_COT[e]?.label : tipo === 'SC' ? ESTADOS_SC[e]?.label : undefined;
  return propia || ESTADOS_SC[e]?.label || ESTADOS_COT[e]?.label || infoEstadoPedido(e).label;
};

// H3 y R26 (B4 T7): el color del botón de la próxima acción (el tono de accionSiguienteDocumento).
const TONO_ACCION: Record<string,string> = {
  indigo:  'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200',
  blue:    'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
  slate:   'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200',
};

// N3: lo que pasa con cada tipo de documento al cancelarlo desde el Hub.
const EFECTO_CANCELACION: Record<string,string> = {
  SC: 'La solicitud se cancela y pasa a la Papelera: se puede eliminar definitivamente después de 30 días si no se restaura',
  COT: 'La cotización queda Rechazada',
  VEN: 'El pedido queda Cancelado',
};

// Autor de los cambios hechos desde el Hub (Actividad); sin sesión, el servidor usa el correo del usuario.
const autorActual = () => { const u = getUsuarioActual(); return u.name || u.email || undefined; };

const getEstadoClass = (e: string) => ({
  BORRADOR: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDIENTE_CONFIRMACION: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_GESTION: 'bg-blue-100 text-blue-800 border-blue-200',
  CONFIRMADA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ENVIADA: 'bg-sky-100 text-sky-700 border-sky-200',
  PENDIENTE_COMPRA: 'bg-orange-100 text-orange-700 border-orange-200',
  PENDIENTE_PAGO: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_PROCESO: 'bg-purple-100 text-purple-700 border-purple-200',
  EN_TRANSITO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  LISTO_ENTREGA: 'bg-teal-100 text-teal-700 border-teal-200',
  ENTREGADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FACTURADO: 'bg-green-100 text-green-800 border-green-200',
  CANCELADO: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELADA: 'bg-rose-100 text-rose-700 border-rose-200',
  RECHAZADA: 'bg-rose-100 text-rose-700 border-rose-200',
} as Record<string,string>)[e] || 'bg-gray-100 text-gray-700 border-gray-200';

const getTipoClass = (t: string) => ({
  SC: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  COT: 'bg-amber-100 text-amber-800 border-amber-200',
  VEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
} as Record<string,string>)[t] || 'bg-gray-100 text-gray-700';

const getTipoLabel = (t: string) => ({
  SC: 'Solicitud',
  COT: 'Cotización',
  VEN: 'Pedido Venta',
} as Record<string,string>)[t] || t;

/* ── B4 T7: la fila del Hub y lo que la pantalla lee de ella ── */

/** Un documento ligero de las listas `cotizaciones` y `pedidos_venta` de una fila (R6, D37). */
type DocLigero = { id: number; numero?: string | null; estado?: string | null };

/**
 * Una fila de GET /ventas/hub/documentos (R6): el _sc_dict, _cot_dict o _ven_dict del documento, más tipo, resolucion,
 * dias_sin_mov, dias_creado, seguimiento_estado y cambios_cliente (C14); las SC traen cotizaciones y pedidos_venta, y
 * las COT pedidos_venta. La resolución y el atraso son los del servidor: aquí no se recalculan (R8). Lo demás pasa tal
 * cual a las librerías (accionSiguienteDocumento, tarjetaHub, reglaSoltarHub, chipsResolucionHub…).
 */
type FilaHub = {
  tipo: 'SC' | 'COT' | 'VEN';
  id: number;
  numero: string;
  estado: string;
  customer_name?: string | null;
  cliente?: { nombre?: string | null } | null;
  customer_phone?: string | null;
  telefono_whatsapp?: string | null;
  advisor_name?: string | null;
  cotizador?: string | null;
  asesor?: { nombre?: string | null } | null;
  total_cop?: number | null;
  resolucion?: 'ATRASADO' | 'NO_RESUELTO' | 'ACCION_TOMADA' | 'CERRADO' | null;
  dias_sin_mov?: number | null;
  dias_creado?: number | null;
  seguimiento_estado?: string | null;
  cotizaciones?: DocLigero[] | null;
  pedidos_venta?: DocLigero[] | null;
  [campo: string]: unknown;
};

/** {actual, anterior, variacion_pct} de un indicador del bloque `flujo` de /ventas/stats (R7). */
type ParPeriodo = { actual?: number | null; anterior?: number | null; variacion_pct?: number | null };
/** Lo que el Hub lee de GET /ventas/stats?periodo=30d (T6C; RP68). */
type StatsHub = {
  kpis?: { pven_saldo_por_cobrar?: number | null } | null;
  flujo?: { vendido_cop?: ParPeriodo | null; ticket_promedio_cop?: ParPeriodo | null; cot_conversion_pct?: ParPeriodo | null } | null;
};
/** `conteos` de GET /ventas/hub/documentos con con_conteos=1 (R6): las pestañas y los grupos de los separadores. */
type ConteosHub = { pestanas?: Partial<Record<string, number>>; grupos?: Partial<Record<string, number>> };

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_HUB = 'ventas.hub';
const INICIAL_HUB = { vista: 'todos', orden: 'atencion' };
const claveDeFila = (f: FilaHub) => `${f.tipo}|${f.id}`;
// U1: con el orden de atención, un separador por resolución. Las atrasadas van con el tono opaco filaAlerta (D41: la
// fila ya no lleva el borde ni el tinte translúcido de antes, que dejaba ver lo de debajo de las columnas fijas).
const grupoDeFila = (f: FilaHub) => f.resolucion ?? null;
const claseDeFila = (f: FilaHub) => (f.resolucion === 'ATRASADO' ? TABLE.filaAlerta : null);
const tarjetaDeFila = (f: FilaHub) => tarjetaHub(f);
const variacionDe = (p?: ParPeriodo | null) => ({ actual: p?.actual ?? null, anterior: p?.anterior ?? null });
/** El tipo que ve el usuario: SC, COT o PVEN (las filas del Hub traen 'VEN', RP74). */
const siglaTipo = (t: FilaHub['tipo']) => (t === 'VEN' ? 'PVEN' : t);

/** RP69 con su ajuste: cambia solo el primer ejemplo y se quita el emoji; los otros tres quedan como estaban. */
const ASISTENTE_VENTAS = {
  titulo: 'Copilot de Ventas',
  ejemplos: [
    '¿Qué pedidos están pendientes de compra?',
    '¿Cuál es el cliente con mayor volumen este mes?',
    '¿Cuáles son las cotizaciones a punto de vencer?',
    'Sugerencia de seguimiento comercial para clientes inactivos',
  ],
};

/** Los tonos de los chips de la columna Resolución (clases literales para Tailwind). */
const CHIP_TONO: Record<string, string> = {
  rose: 'bg-rose-100 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
};
const CHIP = 'inline-block max-w-full truncate rounded-full border px-2 py-0.5 text-[10px] font-bold leading-tight';
const FOCO_VISIBLE = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';

/** Los dos apartados del Hub. Análisis es un estado de la página, no una vista de la tabla (RP35, RP21). */
const SECCIONES_HUB = [{ id: 'documentos', etiqueta: 'Documentos' }, { id: 'analisis', etiqueta: 'Análisis' }] as const;
type SeccionHub = (typeof SECCIONES_HUB)[number]['id'];

/** La insignia del estado con la tabla única de su tipo (estadoDeTarjeta: clases de Tailwind, o los hex en la SC). */
function InsigniaEstado({ tipo, estado }: { tipo: FilaHub['tipo']; estado: unknown }) {
  const e = estadoDeTarjeta(tipo, estado);
  const clases = e.clases ? `${e.clases.bg} ${e.clases.text} ${e.clases.border}` : '';
  const estilo = e.colores ? { color: e.colores.color, backgroundColor: e.colores.bg, borderColor: e.colores.border } : undefined;
  return <span className={`${CHIP} text-[11px] ${clases}`} style={estilo}>{e.label}</span>;
}

/** Resolución: el chip corto del servidor y, debajo, el del recordatorio y el de los cambios del cliente (RP18, D4). */
function CeldaResolucion({ fila }: { fila: FilaHub }) {
  const { principal, extras } = chipsResolucionHub(fila);
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      {principal ? <span className={`${CHIP} ${CHIP_TONO[principal.tono] ?? CHIP_TONO.slate}`}>{principal.texto}</span>
        : <span className="text-xs text-slate-400">—</span>}
      {extras.map((c) => <span key={c.texto} className={`${CHIP} ${CHIP_TONO[c.tono] ?? CHIP_TONO.slate}`}>{c.texto}</span>)}
    </span>
  );
}

const tituloResolucion = (f: FilaHub) => {
  const { principal, extras } = chipsResolucionHub(f);
  return [principal?.titulo, ...extras.map((c) => c.texto)].filter(Boolean).join(' · ') || null;
};

/**
 * Lo que las celdas de la tabla le piden a la pantalla (abrir el panel rápido, el chatter y la cancelación de N3). Va por
 * un contexto para que las columnas sean una constante del módulo (D40 y D41: estables; el cuerpo está memoizado).
 */
type AccionesFilaHub = { abrir: (f: FilaHub) => void; actividad: (f: FilaHub) => void; cancelar: (ids: string[]) => void };
const AccionesFila = React.createContext<AccionesFilaHub | null>(null);

/** Chatter: el panel de notas y actividad del documento (ActivitiesPanel). */
function BotonChatter({ fila }: { fila: FilaHub }) {
  const acciones = React.useContext(AccionesFila);
  return (
    <button type="button" onClick={() => acciones?.actividad(fila)} aria-label={`Notas y actividad de ${fila.numero}`}
      title="Notas y actividad"
      className={`rounded-lg p-1 text-slate-400 transition-colors hover:bg-indigo-50 hover:text-indigo-600 ${FOCO_VISIBLE}`}>
      <Activity size={14} aria-hidden="true"/>
    </button>
  );
}

/** Acción (R26, RP15): la próxima acción del documento (solo navega) y el menú ⋯ de N3 (MenuFila: clic y portal). */
function CeldaAccion({ fila }: { fila: FilaHub }) {
  const acciones = React.useContext(AccionesFila);
  const accion = accionSiguienteDocumento(fila);
  const urlWhatsApp = waUrl(fila.customer_phone);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle completo', icono: ExternalLink, onClick: () => acciones?.abrir(fila) },
    { etiqueta: 'Ver historial y chatter', icono: Activity, onClick: () => acciones?.actividad(fila) },
    { etiqueta: 'Abrir WhatsApp', icono: MessageCircle, onClick: () => abrirWhatsApp(urlWhatsApp), oculto: !urlWhatsApp },
    { etiqueta: 'Cancelar documento', icono: Trash2, peligro: true, onClick: () => acciones?.cancelar([claveDeFila(fila)]),
      oculto: Boolean(motivoNoCancelable(fila)) },
  ];
  const tono = TONO_ACCION[accion?.tono ?? 'slate'] ?? TONO_ACCION.slate;
  const boton = `min-w-0 truncate rounded-lg border px-2 py-1 text-[11px] font-bold transition-colors ${tono}`;
  return (
    <span className="flex min-w-0 items-center justify-end gap-1">
      {!accion ? <span className="text-xs text-slate-400">—</span>
        : accion.href ? <Link href={accion.href} title={accion.texto} className={`${boton} ${FOCO_VISIBLE}`}>{accion.texto}</Link>
        : <span title={accion.texto} className={boton}>{accion.texto}</span>}
      <MenuFila items={items} etiqueta={`Acciones de ${fila.numero || 'este documento'}`} />
    </span>
  );
}

/**
 * B4 T7, la tabla (TABLA-hub-ventas punto 6; R26, D41): las columnas por defecto, pensadas para 1024 px con el menú
 * abierto (unos 716 px útiles con el px-4 de abajo de 1280 px): la casilla y Resolución fijas a la izquierda, Acción fija
 * a la derecha y, en medio, Número (con su tipo), Cliente (la flexible, con el teléfono), Estado y Monto. Asesor,
 * Antigüedad (R5: desde la creación) y Chatter quedan a la derecha (se traen arrastrándolos); Tipo existe, oculta. Una
 * constante (estable, D40). La resolución, el atraso y la próxima acción salen de la fila (R8, RP15).
 */
const COLUMNAS_TABLA_HUB: ColumnaTabla<FilaHub>[] = [
  { id: 'resolucion', titulo: 'Resolución', ancho: 104, clave: true, fija: 'izquierda',
    celda: (f) => <CeldaResolucion fila={f} />, titleCelda: tituloResolucion },
  { id: 'numero', titulo: 'Número', ancho: 108, clave: true, ordenable: 'numero',
    titleCelda: (f) => `${getTipoLabel(f.tipo)} ${f.numero}`,
    celda: (f) => (
      <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
        <span className={`rounded-full border px-1.5 text-[9px] font-black ${getTipoClass(f.tipo)}`}>{siglaTipo(f.tipo)}</span>
        <span className="max-w-full truncate font-bold text-slate-900">{f.numero}</span>
      </span>
    ) },
  { id: 'cliente', titulo: 'Cliente', ancho: 136, clave: true, flexible: true, ordenable: 'cliente',
    titleCelda: (f) => [f.customer_name || f.cliente?.nombre || 'Cliente General', f.customer_phone].filter(Boolean).join(' · '),
    celda: (f) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate font-bold text-slate-800">{f.customer_name || f.cliente?.nombre || 'Cliente General'}</span>
        {f.customer_phone && <span className="truncate font-mono text-[11px] text-slate-400">{f.customer_phone}</span>}
      </span>
    ) },
  { id: 'estado', titulo: 'Estado', ancho: 112, clave: true, ordenable: 'estado',
    titleCelda: (f) => estadoDeTarjeta(f.tipo, f.estado).label, celda: (f) => <InsigniaEstado tipo={f.tipo} estado={f.estado} /> },
  { id: 'monto', titulo: 'Monto', ancho: 96, clave: true, alinear: 'derecha', ordenable: 'monto',
    celda: (f) => (f.tipo === 'SC' ? '—' : formatoPesos(f.total_cop)) },
  { id: 'asesor', titulo: 'Asesor', ancho: 120, ordenable: 'asesor',
    titleCelda: (f) => f.advisor_name || f.cotizador || f.asesor?.nombre || 'Sin asignar',
    celda: (f) => f.advisor_name || f.cotizador || f.asesor?.nombre || <span className="italic text-slate-400">Sin asignar</span> },
  { id: 'antiguedad', titulo: 'Antigüedad', ancho: 96, celda: (f) => textoAntiguedad(Number(f.dias_creado) || 0) },
  { id: 'chatter', titulo: 'Chatter', ancho: 56, alinear: 'centro', celda: (f) => <BotonChatter fila={f} /> },
  { id: 'tipo', titulo: 'Tipo', ancho: 96, ocultaPorDefecto: true, ordenable: 'tipo', celda: (f) => getTipoLabel(f.tipo) },
  { id: 'accion', titulo: 'Acción', ancho: 128, clave: true, fija: 'derecha', celda: (f) => <CeldaAccion fila={f} /> },
];
/** {campo de orden: título}, para el chip «Orden: Monto ↓» (textoOrdenHub). */
const TITULOS_ORDEN_HUB: Record<string, string> = Object.fromEntries(
  COLUMNAS_TABLA_HUB.map((c) => [typeof c.ordenable === 'string' ? c.ordenable : c.id, c.titulo]),
);

/* ── Activities floating panel ── */
// U6+H22 (T9B): notas rápidas con el mismo Chatter de la SC, la COT y el PVEN (ComposerChatter compacto, con la Nota
// externa, R1) arriba del historial completo, donde cada nota lleva su etiqueta. Si el GET falla, se dice y se reintenta.
// onNotaGuardada: una nota que reinicia el atraso del documento (un contacto con el cliente) recarga el Hub en silencio
// (sin el spinner de página) para que su alerta roja desaparezca; el panel sigue abierto con su borrador.
function ActivitiesPanel({row,onClose,onNotaGuardada}:{row:any,onClose:()=>void,onNotaGuardada:()=>void}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string|null>(null);
  // Cada intento vuelve a leer el documento: el primero al abrir (una key por documento: arranca con loading en true),
  // «Reintentar» (con spinner) y la relectura silenciosa tras una nota sin renglón (sin spinner: el composer no se
  // desmonta; si falla, se queda lo que se ve).
  const [intento, setIntento] = useState({n: 0, silencioso: false});
  useEffect(()=>{
    let vigente = true; // la respuesta de un intento anterior (o con el panel cerrado) no se pinta
    (async()=>{
      try {
        let d:any=null;
        if(row.tipo==='SC')  d=await apiFetch(`/ventas/solicitudes/${row.id}`);
        if(row.tipo==='COT') d=await apiFetch(`/ventas/cotizaciones/${row.id}`);
        if(row.tipo==='VEN') d=await apiFetch(`/ventas/pedidos/${row.id}`);
        if(!vigente) return;
        setDetail(d?.data || d);
        setErrorCarga(null);
      } catch(err) {
        console.error(err);
        if(vigente && !intento.silencioso) setErrorCarga(textoDeError(err));
      } finally {
        if(vigente) setLoading(false);
      }
    })();
    return ()=>{ vigente = false; };
  },[row.id,row.tipo,intento]);
  function reintentar(){ setLoading(true); setErrorCarga(null); setIntento(i=>({n: i.n+1, silencioso: false})); }
  function notaRegistrada(log:any){
    // Sin el renglón en la respuesta: solo se relee el documento del panel (el Hub se recarga solo con una nota que
    // reinicia el atraso, ruling 3).
    if(!log){ setIntento(i=>({n: i.n+1, silencioso: true})); return; }
    setDetail((p:any)=>agregarActividad(p, log, row.tipo));
    if(notaReiniciaAtraso(log)) onNotaGuardada();
  }
  const acts = detail?.actividades||[];
  return (
    <Drawer onClose={onClose} header={(
      <div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
          <span className="font-bold text-slate-800">{row.numero}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{row.customer_name||row.cliente?.nombre||'Cliente Nebulae'}</p>
      </div>
    )}>
      {loading?(
        <div className="flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>
      ):errorCarga!==null?(
        <div className="text-center space-y-3 py-8">
          <AlertTriangle size={28} className="mx-auto text-rose-400"/>
          {/* F3 (M6): la región viva envuelve solo los textos; el botón «Reintentar» queda fuera. */}
          <div role="alert" className="space-y-3">
            <p className="text-sm font-bold text-slate-700">No se pudo cargar la actividad.</p>
            {errorCarga&&<p className="text-xs text-slate-500">{errorCarga}</p>}
          </div>
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reintentar}>Reintentar</Button>
        </div>
      ):(
        <>
          {detail?.id&&(
            <div className="pb-5 border-b border-slate-100">
              <ComposerChatter compacto tipoDoc={row.tipo} doc={detail} onRegistrado={notaRegistrada}/>
            </div>
          )}
          {/* pb-20: la burbuja fija del asistente (bottom-6 right-6) no tapa el último renglón. */}
          <div className="pb-20">
            <p className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-1"><Activity size={12}/> Historial de Acciones Tomadas</p>
            {acts.length===0?<p className="text-xs text-slate-400 italic">Sin actividad registrada</p>:(
              <div className="space-y-3 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                {[...acts].reverse().map((a:any,i:number)=>(
                  <div key={a.id ?? `act-${i}`} className="flex gap-3 pl-7 relative">
                    <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white"
                      style={{backgroundColor:accionBloque3(a.action)?.hex||({CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',SENT:'#10b981',CONFIRMED:'#059669',REJECTED:'#ef4444',UPDATED:'#3b82f6',RECOTIZADA:'#f97316',CHATTER:'#0891b2',NOTE_ADDED:'#3b82f6'}as any)[a.action]||'#94a3b8'}}/>
                    <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
                      {/* U6+H22: una nota del Chatter lleva su tipo encima (Nota interna, Llamada…, «Nota externa · medio»). */}
                      {esEntradaChatter(a)&&<div className="mb-1.5"><EtiquetaChatter actividad={a}/></div>}
                      {/* B3 T16 (RP22): las acciones nuevas (recordatorio, entrega del WhatsApp…) con su etiqueta e ícono. */}
                      {accionBloque3(a.action)&&<div className="mb-1.5"><EtiquetaAccionBloque3 action={a.action}/></div>}
                      <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap break-words">{a.description}</p>
                      <div className="mt-1.5"><CambiosDeActividad extra={a.extra_data}/></div>
                      <p className="text-xs text-slate-400 mt-1">{fDate(a.created_at)} {fTime(a.created_at)}{a.user_name&&<span className="ml-2 font-medium">- {a.user_name}</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ── Config Panel ── */
function ConfigPanel({alertDias,configCargada,onSave,onClose}:{alertDias:any,configCargada:boolean,onSave:(cfg:any)=>void,onClose:()=>void}) {
  // N8: todos leen los valores reales; solo un administrador los cambia (la seguridad real es el 403 del PATCH).
  const soloLectura = !esAdmin(getUsuarioActual().role);
  const { avisarError } = useAvisos();
  const [error, setError] = useState('');
  // F2 (M15): el campo que falló (aria-invalid y ligado al error del pie, que tiene este id).
  const [campoError, setCampoError] = useState<string|null>(null);
  const idError = React.useId();
  const [cfg, setCfg] = useState({
    alerta_sc_dias:  String(diasAlerta(alertDias, 'alerta_sc_dias')),
    alerta_cot_dias: String(diasAlerta(alertDias, 'alerta_cot_dias')),
    alerta_ven_dias: String(diasAlerta(alertDias, 'alerta_ven_dias')),
    auto_lead_crm:   String(alertDias?.auto_lead_crm?.value   || alertDias?.auto_lead_crm   || 'true'),
    auto_chatter_ia: String(alertDias?.auto_chatter_ia?.value || alertDias?.auto_chatter_ia || 'false'),
    notif_whatsapp:  String(alertDias?.notif_whatsapp?.value  || alertDias?.notif_whatsapp  || 'false'),
    // B3 T16: validez de la cotización (U22-validez, 1 a 60), tarifa de IVA por defecto (IVA-PRODUCTO, '19') y las 6
    // claves del recordatorio (U16-seguimiento), leídas como las lee el servidor.
    dias_validez_cotizacion: String(enteroConfig(alertDias, 'dias_validez_cotizacion', DIAS_VALIDEZ_COTIZACION.defecto,
      DIAS_VALIDEZ_COTIZACION.minimo, DIAS_VALIDEZ_COTIZACION.maximo)),
    iva_tarifa_defecto: String(normalizarTarifaIva(valorConfig(alertDias, 'iva_tarifa_defecto')) ?? TARIFA_IVA_POR_DEFECTO),
    ...configSeguimientoInicial(alertDias),
  });
  // B3 T16 r1: la foto con que abrió el panel (el PATCH lleva solo lo que cambió) y si la sección de WhatsApp tiene
  // cambios sin guardar (tiene su propio botón). Editar un campo borra el error del pie.
  const cfgInicial = React.useRef(cfg);
  const [waPendiente, setWaPendiente] = useState(false);
  const cambiarCampo = (k: string, v: string) => { setCfg(p => ({...p, [k]: v})); setError(''); setCampoError(null); };
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  async function save(){
    // B3 T16: los recordatorios con las mismas reglas del 422 del servidor, antes de mandar nada (r1: y sin perder lo
    // escrito en la sección de WhatsApp).
    setCampoError(null);
    if(waPendiente){ setError(MENSAJE_WHATSAPP_SIN_GUARDAR); return; }
    const invalido = errorConfigSeguimiento(cfg);
    if(invalido){ setError(invalido.mensaje); setCampoError(invalido.clave); return; }
    // r1: solo las claves que cambiaron (nunca pisa con un valor por defecto lo que nadie tocó), y solo con /config leído.
    const cuerpo = cuerpoGuardarConfig(cfgInicial.current, cfg, configCargada);
    if(!cuerpo) return;
    setSaving(true); setError('');
    try{ await apiFetch('/ventas/config',{method:'PATCH',body:JSON.stringify(cuerpo)}); onSave(cfg); setSaved(true); setTimeout(()=>setSaved(false),2000); }
    // r1: un error de validación (el 422) va solo en línea; los demás, solo con el aviso.
    catch(err:any){ if(esErrorDeValidacion(err)) setError(textoDeError(err)); else avisarError(err, 'No se pudo guardar la configuración'); }
    setSaving(false);
  }
  const Toggle=({k,label,desc}:{k:string,label:string,desc:string})=>(
    <div className="bg-white rounded-xl p-4 border border-indigo-100">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-bold text-sm text-slate-800">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
        <button disabled={soloLectura} onClick={()=>cambiarCampo(k,cfg[k as keyof typeof cfg]==='true'?'false':'true')}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${(cfg as any)[k]==='true'?'bg-emerald-50 border-emerald-300 text-emerald-700':'bg-slate-50 border-slate-200 text-slate-500'}`}>
          {(cfg as any)[k]==='true'?<ToggleRight size={16} className="text-emerald-600"/>:<ToggleLeft size={16}/>}
          {(cfg as any)[k]==='true'?'ON':'OFF'}
        </button>
      </div>
    </div>
  );
  return (
    <Drawer onClose={onClose} maxWidth="md" header={(
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md"><Settings size={20}/></div>
        <div><h2 className="font-black text-slate-800 text-lg">Configuración de HUB Ventas</h2><p className="text-xs text-slate-500">Parámetros de resolución, alertas y automatizaciones</p></div>
      </div>
    )} footer={soloLectura ? (
      <p className="text-xs text-slate-500 text-center">Solo un administrador puede cambiar estos valores.</p>
    ) : (
      <div>
        {/* F2 (M15): la región del error siempre montada (como en ChannelModal); solo cambia su contenido. */}
        <div role="alert">{error ? <p id={idError} className="mb-2 text-xs font-semibold text-rose-600 text-center">{error}</p> : null}</div>
        <button onClick={save} disabled={saving || !configCargada}
          className={`w-full py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors ${saved?'bg-emerald-500 text-white':'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
          {saving?<RefreshCw size={16} className="animate-spin"/>:saved?<CheckCircle2 size={16}/>:<Save size={16}/>}
          {saved?'¡Configuración Guardada!':'Guardar Configuración'}
        </button>
      </div>
    )}>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><Bell size={16} className="text-amber-600"/><h3 className="font-black text-amber-800 text-sm uppercase tracking-wide">Alertas de No Resolución</h3></div>
            <p className="text-xs text-amber-700 mb-4">Si una solicitud, cotización o pedido pasa más de X días sin cambio de estado o acción tomada, se marcará en color rojo de alerta.</p>
            <div className="space-y-3">
              {[{k:'alerta_sc_dias',label:'Solicitudes de Cliente (SC)'},{k:'alerta_cot_dias',label:'Cotizaciones (COT)'},{k:'alerta_ven_dias',label:'Pedidos de Venta (PVEN)'}].map(({k,label})=>(
                <div key={k} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="30" value={(cfg as any)[k]} onChange={e=>cambiarCampo(k,e.target.value)} disabled={soloLectura}
                      className="w-16 border border-slate-200 rounded-lg text-center text-sm font-bold py-1 focus:ring-2 focus:ring-amber-200 outline-none disabled:bg-slate-50 disabled:text-slate-500"/>
                    <span className="text-xs text-slate-500 font-medium">días</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* B3 T16: Documentos para el cliente (U22-validez), IVA (IVA-PRODUCTO), Seguimiento de confirmación con la
              revisión automática (U16-seguimiento, TAREAS) y el envío automático por WhatsApp (U16-envio, con su propio
              «Guardar»). Las tres primeras se guardan con «Guardar Configuración». */}
          <SeccionDocumentosCliente cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura}/>
          <SeccionIva cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura}/>
          <SeccionSeguimiento cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura} error={campoError ? {clave: campoError, id: idError} : null}/>
          <ConfigEnvioWhatsApp soloLectura={soloLectura} onCambiosPendientes={p=>{setWaPendiente(p); if(!p) setError(e=>e===MENSAJE_WHATSAPP_SIN_GUARDAR?'':e);}}/>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-indigo-600"/><h3 className="font-black text-indigo-800 text-sm uppercase tracking-wide">Automatizaciones Comerciales</h3></div>
            <div className="space-y-3">
              <Toggle k="auto_lead_crm" label="Auto-crear Lead en CRM" desc="Al ingresar una solicitud de cliente, sincroniza automáticamente el prospecto al CRM."/>
              <Toggle k="auto_chatter_ia" label="Chatter asistido por IA" desc="Sugiere respuestas en el Chatter basadas en el catálogo y compras del cliente."/>
              {/* C23 (B3 T16): el interruptor decorativo notif_whatsapp queda oculto: no hacía nada y se confundiría con el
                  envío automático por WhatsApp. Su valor guardado no cambia (no se manda: el PATCH lleva solo lo que cambió). */}
            </div>
          </div>
    </Drawer>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT: HUB VENTAS
   ════════════════════════════════════════════════════════════ */
export default function VentasHub() {
  const router = useRouter();
  // H49 (T1B): avisos y confirmaciones del sistema; setToast queda como adaptador ({msg, type}) de las llamadas de siempre.
  // Los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ' repetido).
  const { avisar, confirmar } = useAvisos();
  const setToast = useCallback((t: {msg:string,type:'ok'|'error'}|null) => {
    if (!t) return;
    if (t.type === 'error') avisar(textoDeError(t.msg), {tono: 'error'});
    else avisar(t.msg, {tono: t.type});
  }, [avisar]);

  // B4 T7 (R6, C3, C4; RP26, RP35, D40): el estado ÚNICO de la pantalla. Las pestañas, la búsqueda, el filtro de
  // estados, el semáforo, las cajas del flujo, la tabla y el tablero despachan a él; el modo (Lista o Kanban) se guarda
  // en vista:ventas.hub. Ya no hay arreglos en memoria (C4): la tabla y el tablero piden a /ventas/hub/documentos.
  const [estado, despachar, listo] = useEstadoTabla(ID_HUB, INICIAL_HUB);
  // R6 y RP21: ?paso= y ?tab=analisis&foco= (leerEnlaceHub) salen de window.location al montar, sin useSearchParams (la
  // página no necesita Suspense; AuthGuard la pinta solo en el navegador). Análisis es un estado de la página (RP35).
  const [enlace] = useState(() => leerEnlaceHub(typeof window === 'undefined' ? '' : window.location.search));
  const [seccion, setSeccion] = useState<SeccionHub>(enlace.analisis ? 'analisis' : 'documentos');
  const enAnalisis = seccion === 'analisis';
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());
  const [alertDias, setAlertDias]   = useState<any>({alerta_sc_dias:'2',alerta_cot_dias:'2',alerta_ven_dias:'2'});

  const [actRow, setActRow]         = useState<any>(null);
  const [quickDetailDoc, setQuickDetailDoc] = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);
  // B3 T16 r1: GET /ventas/config llegó de verdad (configLeida). Hasta entonces el panel no se abre ni guarda.
  const [configCargada, setConfigCargada] = useState(false);

  // N3: cancelación con motivo (modal) y resultado de un lote con fallos (banner; lo comparte N5).
  const [cancelacion, setCancelacion]             = useState<{ids:string[]}|null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelando, setCancelando]               = useState(false);
  const [resultadoLote, setResultadoLote]         = useState<{titulo:string, lineas:{numero:string,error:string}[]}|null>(null);
  // H27+H39: al arrastrar una SC o COT para enviarla se pregunta el canal y luego se muestra el enlace con el aviso del correo.
  // F2: telefonoCrudo (el porqué de «sin teléfono», M50) y detalle (la nota ámbar del nombre sin contacto, M47).
  const [envioHub, setEnvioHub]       = useState<{tipo:'SC'|'COT', id:string, numero:string, telefono:string, telefonoCrudo?:string|null, correo?:string|null, detalle?:unknown}|null>(null);
  const [canalHub, setCanalHub]       = useState<'WhatsApp'|'Email'|'Otro'|null>(null);
  const [enviandoHub, setEnviandoHub] = useState(false);
  const envioWhatsAppHub = useEstadoEnvioWhatsApp(!!envioHub); // B3 T17: {automatico, listo} del ChannelModal (U16-envio 14)
  // B3 T16 (RP23): whatsapp sigue siendo el wa.me que se intentó abrir; envioWhatsapp es el resultado del automático, y
  // telefono (telefono_whatsapp, RP19), vence y seguimiento vienen de la respuesta del envío (el mismo modal del detalle).
  const [hubEnlace, setHubEnlace]     = useState<{documento:string, link:string, correo:any, canal:string|null, color:'blue'|'indigo', whatsapp?:string|null,
    envioWhatsapp?:unknown, telefono?:string|null, vence?:string|null, seguimiento?:unknown}|null>(null);

  // ── B4 T7, carga (R6, C4): cada parte pide lo suyo al servidor ──
  // La tabla (RP35 y RP68: sin conResumen ni extra.semaforo; el semáforo va en estado.semaforo). En la pestaña Análisis
  // no pide nada (activo: false, RP35) y nunca se manda vista=analisis. esperar: !listo (D40): el esqueleto, nunca vacío.
  const listado = useListado<FilaHub>({
    ruta: '/ventas/hub/documentos', estado, conConteos: true, esperar: !listo, despachar, activo: !enAnalisis,
  });
  const conteos = listado.conteos as ConteosHub | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero en modo servidor (C4, RP10, D39): una consulta por columna con columna=<clave> y el MISMO estado (vista,
  // semáforo, paso, q y estados), con porColumna = el tamaño de la tabla y limit=0 en las plegadas (lo hace el hook).
  // D39: 'atencion' en las abiertas (dentro de cada columna, primero lo atrasado: U1) y 'reciente' en Cancelado.
  const tablero = useTableroKanban<FilaHub>({
    pantalla: ID_HUB,
    modo: 'servidor',
    columnas: COLUMNAS_HUB,
    idDe: claveDeFila,
    activo: listo && estado.modo === 'kanban' && !enAnalisis,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => normalizarRespuesta(
      await apiFetch(`/ventas/hub/documentos?${queryListado(estado, { columna: columna.clave, orden, limit, offset })}`, { signal }),
    ),
  });

  // La franja del flujo (R6): GET /ventas/flujo; recargaFlujo sube con cada loadData.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/ventas/flujo', recargaFlujo);

  // Las tarjetas (R6, RP68): GET /ventas/stats?periodo=30d, sin respaldo local; si falla, «—» (C6, C13).
  const [vueltaStats, setVueltaStats] = useState(0);
  const [stats, setStats] = useState<{ vuelta: number; datos: StatsHub | null; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    apiFetch(`/ventas/stats?periodo=${PERIODO_KPI}`, { signal: control.signal })
      .then((r: { data?: StatsHub } | null) => setStats({ vuelta: vueltaStats, datos: r?.data ?? null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setStats({ vuelta: vueltaStats, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaStats]);
  const cargandoStats = stats?.vuelta !== vueltaStats;
  const estadoKpis = useEstadoKpi(cargandoStats, cargandoStats ? null : (stats?.error ?? null));
  const datosStats = stats?.datos ?? null;

  // La configuración (ConfigPanel, B3-T10d): GET /ventas/config, como antes; configCargada abre el panel y «Ajustar
  // tiempos» (configLeida). Si falla, un aviso y lo que había en pantalla sigue.
  const [vueltaConfig, setVueltaConfig] = useState(0);
  useEffect(() => {
    let vigente = true;
    apiFetch('/ventas/config')
      .then((cfg: unknown) => {
        if (!vigente) return;
        const datos = cfg && typeof cfg === 'object' ? ((cfg as { data?: unknown }).data || cfg) : null;
        if (datos && typeof datos === 'object') setAlertDias(datos);
        if (configLeida(cfg)) setConfigCargada(true);
      })
      .catch((err: unknown) => {
        if (!vigente) return;
        console.error(err);
        avisar('No se pudo cargar la configuración de alertas.', { tono: 'error' });
      });
    return () => { vigente = false; };
  }, [vueltaConfig, avisar]);

  // La recarga de la pantalla (antes, tres listas de 200 documentos en memoria): la tabla, el tablero y el flujo; sin
  // `silencioso` («Actualizar», un lote, un envío, el panel de configuración), también las tarjetas y la configuración.
  // La recarga silenciosa de una nota del panel de actividad (T9B r1) solo pide lo que mueve el atraso. Ninguna vacía lo
  // que se ve: los hooks conservan lo último mientras recargan y la última carga gana (D28: useListado aborta la anterior).
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const loadData = useCallback((opciones?: { silencioso?: boolean }) => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
    if (opciones?.silencioso) return;
    setVueltaStats((n) => n + 1);
    setVueltaConfig((n) => n + 1);
  }, [recargarListado, recargarTablero]);

  // RP36: las filas cargadas (la página de la tabla y las tarjetas del tablero). filaPorId las usan el modal de
  // cancelación, la barra masiva (N3 y N5) y el panel rápido; scConCot, las reglas del tablero.
  const filasCargadas = useMemo(
    () => [...listado.filas, ...Object.values(tablero.datos).flatMap((d) => d.items)],
    [listado.filas, tablero.datos],
  );
  const scConCot = useMemo(() => scConCotDeFilas(filasCargadas), [filasCargadas]);
  const filaPorId = useCallback((idStr: string) => filasCargadas.find((f) => claveDeFila(f) === idStr), [filasCargadas]);
  const quitarDeSeleccion = (ids: Set<string>) =>
    setSelectedIds(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; });

  // N5: el cambio masivo de estado solo aplica a Pedidos de Venta; las SC y COT marcadas se omiten. Solo se envían
  // los pedidos que pueden pasar al estado elegido (repartirCambioEstadoPVEN); los demás se omiten con su motivo. Los
  // fallos salen con el mensaje del servidor. Omitidos y fallidos siguen marcados.
  async function handleBulkChangeEstado(nuevo:string){
    if(!nuevo) return;
    const ids = Array.from(selectedIds);
    const ven = ids.filter(i => i.startsWith('VEN|'));
    const otrosOmitidos = ids.length - ven.length;
    if(ven.length === 0){
      setToast({msg:'Selecciona al menos un Pedido de Venta: las solicitudes y cotizaciones no cambian de estado desde aquí.',type:'error'});
      return;
    }
    const etiqueta = ETIQUETA_ESTADO_VEN[nuevo] || nuevo;
    const {aplican, omitidos} = repartirCambioEstadoPVEN(ven.map(idStr => {
      const fila = filaPorId(idStr);
      return {idStr, numero: fila?.numero || `Pedido ${idStr.split('|')[1]}`, estado: fila?.estado};
    }), nuevo);
    if(nuevo === 'FACTURADO' && aplican.length > 0
      && !(await confirmar({
        titulo: `Marcar ${aplican.length === 1 ? '1 pedido' : `${aplican.length} pedidos`} como Facturado`,
        mensaje: `Después de esto el estado ${aplican.length === 1 ? 'del pedido' : 'de los pedidos'} ya no se puede cambiar.`,
        textoConfirmar: 'Marcar como Facturado',
      }))) return;
    setResultadoLote(null);
    const resultados: {idStr:string, numero:string, ok:boolean, error?:string}[] = [];
    for(const {idStr, numero} of aplican){
      try{
        await apiFetch(`/ventas/pedidos/${idStr.split('|')[1]}`,{method:'PATCH',body:JSON.stringify({estado:nuevo, updated_by:autorActual()})});
        resultados.push({idStr, numero, ok:true});
      }catch(err:any){ resultados.push({idStr, numero, ok:false, error:err?.message}); }
    }
    const r = resumenLote(resultados, 'actualizados', {omitidos, destino:etiqueta});
    if(r.fallidos.length === 0 && r.exitosos > 0){
      const nota = otrosOmitidos === 0 ? '' : otrosOmitidos === 1 ? ' · se omitió 1 solicitud/cotización' : ` · se omitieron ${otrosOmitidos} solicitudes/cotizaciones`;
      setToast({msg:`${r.mensaje}${nota}`,type:'ok'});
    }
    if(r.banner) setResultadoLote(r.banner);
    quitarDeSeleccion(new Set(resultados.filter(x => x.ok).map(x => x.idStr)));
    if(resultados.length > 0) loadData();
  }

  // N3: cancelar abre un modal con lo que se va a cancelar y el motivo. La acción de fila nunca lee ni cambia la selección.
  const abrirCancelacion = useCallback((ids: string[]) => {
    setCancelacion({ids});
    setMotivoCancelacion('');
  }, []);

  // Filas del modal de cancelación, en el orden en que se procesan (VEN, COT, SC) y con el motivo si se omiten. RP36: la
  // fila se busca en la tabla y en el tablero (filaPorId); si ya no está, se omite con ese motivo.
  const filasCancelacion = useMemo(() => (cancelacion ? ordenParaCancelar(cancelacion.ids) : []).map(idStr => {
    const row = filaPorId(idStr);
    return {idStr, row, motivo: row ? motivoNoCancelable(row) : 'ya no está en la lista del Hub'};
  }), [cancelacion, filaPorId]);
  const porCancelar = filasCancelacion.filter((f): f is {idStr: string; row: FilaHub; motivo: null} => !f.motivo && Boolean(f.row));

  async function confirmarCancelacion(){
    const motivo = motivoCancelacion.trim();
    if(!cancelacion || motivo.length < 5 || porCancelar.length === 0) return;
    setCancelando(true);
    setResultadoLote(null);
    const autor = autorActual();
    const resultados: {idStr:string, numero:string, ok:boolean, error?:string, aviso?:string}[] = [];
    for(const {idStr, row} of porCancelar){
      let aviso: string | undefined;
      try{
        if(row.tipo === 'SC'){
          // La ruta real: guarda el motivo, manda a la papelera y revoca enlaces (bloquea si hay COT o PVEN activos).
          await apiFetch(`/ventas/solicitudes/${row.id}/cancelar`,{method:'POST',body:JSON.stringify({razon:motivo, user_name:autor})});
        } else if(row.tipo === 'COT'){
          await apiFetch(`/ventas/cotizaciones/${row.id}`,{method:'PATCH',body:JSON.stringify({estado:'RECHAZADA', updated_by:autor})});
          try{
            await apiFetch(`/ventas/cotizaciones/${row.id}/actividad`,{method:'POST',body:JSON.stringify({action:'NOTE_ADDED', description:`Motivo del rechazo (Hub): ${motivo}`, user_name:autor})});
          }catch(errNota:any){
            // El rechazo ya quedó hecho (cuenta como exitoso), pero el banner avisa que el motivo no quedó registrado.
            aviso = `rechazada, pero el motivo no quedó en la Actividad: ${errNota?.message || 'el servidor no dio detalle del error'}`;
          }
        } else {
          await apiFetch(`/ventas/pedidos/${row.id}`,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO', cancellation_reason:motivo, cancelled_at:new Date().toISOString(), updated_by:autor})});
        }
        resultados.push({idStr, numero:row.numero, ok:true, aviso});
      }catch(err:any){ resultados.push({idStr, numero:row.numero, ok:false, error:err?.message}); }
    }
    const r = resumenLote(resultados);
    if(r.fallidos.length === 0) setToast({msg:r.mensaje,type:'ok'});
    if(r.banner) setResultadoLote(r.banner);
    const exitosos = new Set(resultados.filter(x => x.ok).map(x => x.idStr));
    quitarDeSeleccion(exitosos);
    setCancelacion(null);
    setCancelando(false);
    if(quickDetailDoc && exitosos.has(`${quickDetailDoc.tipo}|${quickDetailDoc.id}`)) openDocDetail(quickDetailDoc);
    loadData();
  }

  // N2: cambio de estado del pedido desde el panel rápido (solo destinos que el servidor acepta).
  async function cambiarEstadoPedido(doc:any, est:string){
    try{
      await apiFetch(`/ventas/pedidos/${doc.id}`,{method:'PATCH',body:JSON.stringify({estado:est, updated_by:autorActual()})});
      openDocDetail(doc);
      loadData();
      setToast({msg:`Estado actualizado a ${ETIQUETA_ESTADO_VEN[est] || est}`,type:'ok'});
    }catch(e:any){setToast({msg:e.message,type:'error'});}
  }

  const openDocDetail = useCallback(async (row: any) => {
    try {
      let d: any = null;
      if(row.tipo === 'SC')  d = await apiFetch(`/ventas/solicitudes/${row.id}`);
      if(row.tipo === 'COT') d = await apiFetch(`/ventas/cotizaciones/${row.id}`);
      if(row.tipo === 'VEN') d = await apiFetch(`/ventas/pedidos/${row.id}`);
      setQuickDetailDoc({ ...row, ...(d?.data || d) });
    } catch {
      setQuickDetailDoc(row);
    }
  }, []);

  // ── B4 T7, Kanban (KANBAN-hub-ventas punto 2; C4, C15, R11; RP17, D39) ──
  // Lo que T9 resolvía al soltar una tarjeta vive ahora en reglaSoltarHub (kanban-ventas.js, con su matriz probada): soltar en
  // la misma columna no hace nada; lo que no se puede queda bloqueado con su motivo ANTES de soltar (una COT que el
  // cliente confirmó ya no se reenvía al soltarla en «No resuelto»: C15(a)); y lo demás llega aquí.
  // 'cambio': el PATCH del estado. El tablero mueve la tarjeta y, si el servidor la rechaza (R10: el 409 de una SC con
  // documentos activos), la devuelve con su mensaje. No se devuelve el documento: el PATCH no trae la resolución ni el
  // tipo de la fila, y el tablero recarga el origen y el destino (D39). Las pestañas y el flujo se recargan aquí.
  async function cambiarDesdeTablero(fila: FilaHub, resultado: { estado: string }) {
    const ruta = fila.tipo === 'SC' ? 'solicitudes' : fila.tipo === 'COT' ? 'cotizaciones' : 'pedidos';
    await apiFetch(`/ventas/${ruta}/${fila.id}`, {
      method: 'PATCH', body: JSON.stringify({ estado: resultado.estado, updated_by: autorActual() }),
    });
    recargarListado();
    setRecargaFlujo((n) => n + 1);
  }

  // 'accion' (D39): la pantalla abre su ventana y, al terminar, recarga el origen y el destino.
  //  - cancelar: el modal de N3 con el motivo (abrirCancelacion), el mismo del menú de la fila;
  //  - enviar: el envío que ya vive en esta página (C15(b): el canal de H27 y el enlace de B3-T10d, abrirEnvioHub); no
  //    se arma otro ChannelModal ni otro POST;
  //  - reiniciar: «Reiniciar solicitud» con la confirmación de U15 (RP17) y PATCH {estado: 'BORRADOR'}.
  function accionDesdeTablero(fila: FilaHub, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion === 'cancelar') abrirCancelacion([claveDeFila(fila)]);
    else if (resultado.accion === 'enviar' && (fila.tipo === 'SC' || fila.tipo === 'COT')) abrirEnvioHub(fila.tipo, String(fila.id), fila);
    else if (resultado.accion === 'reiniciar' && fila.tipo === 'SC') void reiniciarDesdeTablero(fila, origen, destino);
  }

  async function reiniciarDesdeTablero(fila: FilaHub, origen: string, destino: string) {
    if (!(await confirmar(confirmacionReiniciarSolicitud(fila)))) return;
    try {
      await apiFetch(`/ventas/solicitudes/${fila.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: 'BORRADOR', updated_by: autorActual() }),
      });
      setToast({msg: 'Solicitud reiniciada', type: 'ok'});
    } catch (err: unknown) {
      // R10: con documentos activos el servidor responde 409; el aviso trae su mensaje.
      setToast({msg: 'No se pudo reiniciar: ' + ((err instanceof Error && err.message) || 'intenta de nuevo.'), type: 'error'});
    }
    tablero.recargar([origen, destino]);
    recargarListado();
    setRecargaFlujo((n) => n + 1);
  }

  // H27+H39 (usuario: "Sí, preguntar el canal"): el envío desde el tablero pide el canal y luego muestra el enlace.
  function abrirEnvioHub(tipo:'SC'|'COT', id:string, item:any){
    // B3: el correo del cliente, como en cotizacion/[id] (sin correo, ChannelModal no ofrece Email).
    // B3 T16 (RP19): el teléfono es telefono_whatsapp de la fila (el e164 que valida el servidor, o null), no el crudo.
    setEnvioHub({tipo, id, numero:item?.numero || id, telefono:item?.telefono_whatsapp || '', telefonoCrudo:item?.customer_phone ?? null, correo:correoDelCliente(item)});
    setCanalHub(null);
    // Revisión final B3 (F2, M47): la nota ámbar sale del detalle (nombre_cambio_sin_contacto), guardado solo si la ventana
    // sigue abierta para este documento. Si el GET falla, la ventana queda sin la nota: no bloquea el envío.
    apiFetch(`/ventas/${tipo === 'COT' ? 'cotizaciones' : 'solicitudes'}/${id}`)
      .then((d: any) => setEnvioHub(e => conDetalleDelEnvio(e, tipo, id, d?.data)))
      .catch((err: unknown) => console.error(err));
  }

  async function confirmarEnvioHub(){
    if(!envioHub || !canalHub) return;
    const {tipo, id, numero, telefono} = envioHub;
    const ruta = tipo === 'COT' ? 'cotizaciones' : 'solicitudes';
    setEnviandoHub(true);
    try{
      // F2 (M0): siempre un primer envío (una tarjeta ya pendiente no llega aquí); si ya se le envió, el servidor da 409.
      const d = await apiFetch(`/ventas/${ruta}/${id}/enviar-confirmacion`, {method:'POST', body: JSON.stringify({canal:canalHub, user_name:autorActual(), ...banderaReenvio(false)})});
      const link = d?.link_confirmacion || '';
      const documento = tipo === 'COT' ? `la cotización ${numero}` : `la solicitud ${numero}`;
      let whatsapp: string | null = null;
      // B3 T16 (U16-envio punto 14): wa.me solo si el automático no vino o está apagado (nunca dos mensajes), con el
      // texto que devolvió el servidor (texto_manual, con el enlace) o el de siempre.
      const wa = d?.whatsapp ?? null;
      if(abreWhatsAppLocal(canalHub, wa)){
        whatsapp = waUrl(telefono, wa?.texto_manual || (link ? `Hola, aquí está ${documento}. Confírmala aquí: ${link}` : `Hola, aquí está ${documento}.`));
        abrirWhatsApp(whatsapp);
      }
      // B13: el modal ofrece "Abrir WhatsApp" con el mismo enlace por si el navegador bloqueó la ventana.
      if(link) setHubEnlace({documento, link, correo:d?.correo ?? null, canal:canalHub, color: tipo === 'COT' ? 'blue' : 'indigo', whatsapp,
        envioWhatsapp: wa, telefono, vence: d?.vence ?? null, seguimiento: d?.seguimiento ?? null});
      setToast({msg: 'Enviada para confirmación del cliente', type: 'ok'});
      setEnvioHub(null);
      setCanalHub(null);
      loadData();
    }catch(err:any){
      // F3 (M3): con el 409 de la bandera (otro asesor o pestaña ya la envió: «Ya se le envió al cliente…») la ventana ya
      // no aplica: se cierra y el tablero se recarga en silencio; si no, la tarjeta seguía en su columna vieja y cada
      // «Enviar» repetía el 409. Con cualquier otro error la ventana del canal sigue abierta: se puede elegir otro canal
      // o cancelar. El toast con el mensaje del servidor sale en los dos casos.
      if(err?.status === 409){
        setEnvioHub(null);
        setCanalHub(null);
        loadData({silencioso: true});
      }
      setToast({msg: 'No se pudo enviar para confirmación: ' + (err?.message || (tipo === 'COT'
        ? 'la cotización necesita precios calculados primero.' : 'la solicitud necesita un asesor asignado primero.')), type: 'error'});
    }
    setEnviandoHub(false);
  }

  // ── B4 T7, tabla (TABLA-hub-ventas puntos 5 a 8; R26, D41): las columnas son COLUMNAS_TABLA_HUB (una constante); sus
  // celdas piden a la pantalla lo que necesitan por AccionesFila (abrir el panel rápido, el chatter y la cancelación).
  const accionesFila: AccionesFilaHub = { abrir: openDocDetail, actividad: setActRow, cancelar: abrirCancelacion };
  // D40: un solo usePreferenciasTabla por id; la tabla y «Ajustar tabla» comparten su resultado y el ref del ancho.
  const prefs = usePreferenciasTabla(ID_HUB, COLUMNAS_TABLA_HUB);
  const anchoTablaRef = useRef<number | null>(null);
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban o a Análisis sale de la pantalla completa (el conmutador sigue a la vista).
  useEffect(() => { if (estado.modo === 'kanban' || enAnalisis) salir(); }, [estado.modo, enAnalisis, salir]);

  // Las pestañas: las 6 vistas de R6 (RP21), sin emojis, con los conteos del servidor (q, estados y paso; null mientras
  // cargan: la barra gris, nunca 0). «No resueltos» en rojo si el Hub tiene atrasados (el semáforo de /ventas/flujo).
  const pestanas: PestanaTabla[] = [
    { id: 'todos', etiqueta: 'Todos', conteo: conteos?.pestanas?.todos ?? null },
    { id: 'no_resueltos', etiqueta: 'No resueltos', conteo: conteos?.pestanas?.no_resueltos ?? null,
      alerta: cantidadPositiva(flujo.datos?.semaforo?.atrasados) !== null },
    { id: 'sc', etiqueta: 'Solicitudes', conteo: conteos?.pestanas?.sc ?? null },
    { id: 'cot', etiqueta: 'Cotizaciones', conteo: conteos?.pestanas?.cot ?? null },
    { id: 'ven', etiqueta: 'Pedidos', conteo: conteos?.pestanas?.ven ?? null },
    { id: 'acciones_tomadas', etiqueta: 'Acciones tomadas', conteo: conteos?.pestanas?.acciones_tomadas ?? null },
  ];
  // La barra despacha al estado único; elegir a mano la pestaña de otro tipo quita el paso del diagrama
  // (pasoTrasPestana, FLUJO-ventas-pantallas A.4): si no, la tabla quedaría vacía sin una razón a la vista.
  const alEstadoBarra = useCallback((accion: AccionTabla) => {
    despachar(accion);
    const vista = accion.tipo === 'vista' ? accion.valor : accion.tipo === 'cambiar' ? accion.cambios.vista : undefined;
    if (typeof vista === 'string' && estado.paso && pasoTrasPestana(estado.paso, vista) === null) {
      despachar({ tipo: 'paso', valor: null });
    }
  }, [despachar, estado.paso]);

  // U1 (R6): con el orden de atención, un separador al empezar cada grupo con su total (conteos.grupos, con todos los
  // filtros); ordenada por otra columna, sin separadores y con el chip «Orden: … · Atención primero».
  const atencion = ordenEsAtencion(estado.orden);
  const grupos = conteos?.grupos;
  const tituloDeGrupo = useCallback((grupo: string, n: number) => tituloGrupo(grupo, grupos?.[grupo] ?? n), [grupos]);
  const textoOrden = textoOrdenHub(estado.orden, TITULOS_ORDEN_HUB);
  const chipsFiltro = chipsFiltroHub(estado);
  // N3/N5: la selección de la página (TablaEstandar la limpia al cambiar de página, de pestaña, de filtro o de orden).
  const seleccion = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const alSeleccionar = useCallback((claves: (string | number)[]) => setSelectedIds(new Set(claves.map(String))), []);

  // ── B4 T7, Documentos / Análisis (RP35): Análisis es un estado de la página; nunca va en estado.vista ──
  const cambiarSeccion = useCallback((s: SeccionHub) => {
    setSeccion(s);
    setSelectedIds(new Set());
    // Al volver a los documentos la URL deja de decir ?tab=analisis (recargar no reabre el Análisis).
    if (s === 'documentos' && leerEnlaceHub(window.location.search).analisis) router.replace(RUTA_HUB_VENTAS);
  }, [router]);
  const botonesSeccion = useRef(new Map<SeccionHub, HTMLButtonElement>());
  const teclaSecciones = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const siguiente = pestanaConTecla(SECCIONES_HUB.map((s) => s.id), seccion, e.key) as SeccionHub | null;
    if (!siguiente) return;
    e.preventDefault();
    cambiarSeccion(siguiente);
    botonesSeccion.current.get(siguiente)?.focus();
  };
  const idSecciones = React.useId();

  // ── B4 T7, la franja del flujo (FLUJO-ventas-pantallas A; R6, C3, RP21, RP34, D27(a), D42) ──
  const filtroSemaforo: FiltroSemaforo =
    estado.semaforo === 'atrasados' || estado.semaforo === 'no_resueltos' ? estado.semaforo : 'todos';
  // clic_en_hub (R6): tocar un botón del semáforo o un paso pone ese filtro en el estado único y muestra los documentos;
  // tocarlo otra vez lo quita. El paso activa la pestaña de su tipo (tabHubDePaso, con accionPestana: D41).
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    despachar({ tipo: 'semaforo', valor: f === 'todos' ? null : f });
    if (enAnalisis) cambiarSeccion('documentos');
  };
  const elegirPaso = (clave: string) => {
    const paso = alternarSeleccion(estado.paso, clave);
    despachar({ tipo: 'paso', valor: paso });
    const vista = paso ? tabHubDePaso(paso) : null;
    if (vista) despachar(accionPestana(estado, vista, opcionesEstadosHub));
    if (enAnalisis) cambiarSeccion('documentos');
  };
  // ?paso=<clave> (R6): el Hub abre filtrado por ese paso y en la pestaña de su tipo, una sola vez, como tocar la caja.
  const pasoDelEnlace = useRef(enlace.paso);
  useEffect(() => {
    const paso = pasoDelEnlace.current;
    if (!paso) return;
    pasoDelEnlace.current = null;
    despachar({ tipo: 'paso', valor: paso });
    const vista = tabHubDePaso(paso);
    if (vista) despachar(accionPestana(estado, vista, opcionesEstadosHub));
  }, [estado, despachar]);
  // RP34 y D27(a): «Ajustar tiempos» solo para un administrador (esAdmin, el mismo esAdministrador de flujo.tsx), apagado y
  // con el porqué mientras no se leyó /ventas/config, igual que el botón «Configuración» de arriba.
  const accionAjustar = esAdmin(getUsuarioActual().role)
    ? { label: 'Ajustar tiempos', onClick: () => setShowConfig(true), deshabilitado: !configCargada, titulo: configCargada ? undefined : AVISO_CONFIG_SIN_LEER }
    : null;

  // ── B4 T7, lo que recibe el tablero (KANBAN-hub-ventas punto 2) ──
  // La regla de soltar con el scConCot de las filas cargadas (RP36): las tarjetas SC traen sus cotizaciones.
  const reglaHub = useCallback(
    (f: FilaHub, origen: string, destino: string) => reglaSoltarHub(f, origen, destino, { scConCot }),
    [scConCot],
  );
  // RP68: el ítem del menú de la tarjeta con `etiqueta` (ItemMenuFila); «Abrir» y «Mover a…» los pone el tablero.
  const accionesTarjeta = useCallback(
    (f: FilaHub): ItemMenuFila[] => [{ etiqueta: 'Actividad y chatter', icono: Activity, onClick: () => setActRow(f) }],
    [],
  );
  // KANBAN-hub-ventas punto 3: el punto que late en «No resuelto» cuando su columna trae atrasados (que el servidor
  // ordena primero). La resolución es la de la fila: aquí no se recalcula (R8).
  const resumenColumna = useCallback((clave: string, d: DatosColumnaKanban<FilaHub>) => (
    clave === 'No Resuelto' && d.items.some((f) => f.resolucion === 'ATRASADO') ? (
      <span className="inline-flex items-center gap-1.5 font-semibold text-rose-700">
        <span aria-hidden="true" className="relative inline-flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75 motion-safe:animate-ping"/>
          <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"/>
        </span>
        Primero los atrasados
      </span>
    ) : null
  ), []);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {actRow && <ActivitiesPanel key={`${actRow.tipo}|${actRow.id}`} row={actRow} onClose={()=>setActRow(null)} onNotaGuardada={()=>loadData({silencioso: true})}/>}
      {showConfig && <ConfigPanel alertDias={alertDias} configCargada={configCargada} onSave={cfg=>{setAlertDias(cfg);setShowConfig(false);loadData();}} onClose={()=>setShowConfig(false)}/>}

      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas" color="indigo" />

      {/* B4 T7 (FLUJO-ventas-pantallas A; R6, D42): la franja del flujo reemplaza el semáforo con emojis y sus botones
          repetidos. Va directo bajo la barra de submódulos, sin otro padding horizontal (las 5 cajas se miden en ella). */}
      <BannerFlujo
        titulo="Flujo comercial"
        idPreferencia="ventas"
        regla={textoRegla(flujo.datos?.dias_alerta)}
        semaforo={{
          atrasados: flujo.datos?.semaforo?.atrasados ?? null,
          noResueltos: flujo.datos?.semaforo?.no_resueltos,
          filtro: filtroSemaforo,
          onFiltrar: alFiltrarSemaforo,
        }}
        pasos={pasosConConteos(PASOS_FLUJO_VENTAS, conteosDesdeResumen(flujo.datos), {
          seleccionado: estado.paso,
          cargando: !flujo.datos,
        })}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
        onSeleccionarPaso={elegirPaso}
        accionAjustar={accionAjustar}
      />

      <div className="flex-1 flex flex-col px-4 xl:px-8 py-6 max-w-[1600px] mx-auto w-full min-w-0 gap-6">

        {/* HEADER ROW */}
        <PageHeader
          icon={TrendingUp} color="indigo"
          title="HUB Ventas"
          subtitle="Solicitudes, cotizaciones y pedidos de tus clientes en un solo lugar."
          actions={(
            <div className="flex items-center gap-2.5">
              {/* H9: directo a la lista con ?new=1 (abre el formulario y limpia la URL, U9), sin pasar por
                  /solicitud/nueva; «Abriendo…» apenas se hace clic. */}
              <Link href="/dashboard/ventas/solicitud?new=1" aria-label="Nueva solicitud"
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all">
                <ContenidoEnlace icon={Plus}>Nueva Solicitud</ContenidoEnlace>
              </Link>
              <button onClick={() => loadData()}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs shadow-xs transition-colors">
                <RefreshCw size={13} className={listado.recargando || flujo.cargando || cargandoStats ? 'animate-spin' : ''}/> Actualizar
              </button>
              <button onClick={()=>setShowConfig(true)} disabled={!configCargada} title={configCargada ? undefined : AVISO_CONFIG_SIN_LEER}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Settings size={13}/> Configuración
              </button>
            </div>
          )} />

        {/* B4 T7: los dos apartados del Hub. «Análisis» es un estado de la página (RP35): nunca va en estado.vista ni
            se manda vista=analisis; las pestañas de la tabla son las 6 vistas de R6, dentro de la barra. */}
        <div role="tablist" aria-label="Apartados del Hub de Ventas" onKeyDown={teclaSecciones} className={`${TABS_BAR.group} self-start max-w-full`}>
          {SECCIONES_HUB.map((s) => {
            const activa = s.id === seccion;
            return (
              <button key={s.id} type="button" role="tab" id={`${idSecciones}-${s.id}`} aria-selected={activa}
                aria-controls={`${idSecciones}-panel`} tabIndex={activa ? 0 : -1}
                ref={(el) => { if (el) botonesSeccion.current.set(s.id, el); else botonesSeccion.current.delete(s.id); }}
                onClick={() => { if (!activa) cambiarSeccion(s.id); }}
                className={`${activa ? TABS_BAR.tabActive : TABS_BAR.tabInactive} ${FOCO_VISIBLE}`}>
                {s.etiqueta}
              </button>
            );
          })}
        </div>

        {/* B4 T7 (KPI-ventas, R6, R7, RP68, RP70): dinero y avance de /ventas/stats?periodo=30d, no pulsables (no
            equivalen a una vista); los conteos por paso viven solo en el diagrama (C6). Mientras cargan, barras grises;
            si /ventas/stats falla, «—». No se ven en Análisis (allí van sus propios indicadores). */}
        {!enAnalisis && (
          <FranjaKpis estado={estadoKpis} titulo="Dinero y avance">
            <TarjetaKpi kpi="vendido_periodo" valor={datosStats?.flujo?.vendido_cop?.actual ?? null}
              variacion={variacionDe(datosStats?.flujo?.vendido_cop)} />
            <TarjetaKpi kpi="pven_saldo_por_cobrar" valor={datosStats?.kpis?.pven_saldo_por_cobrar ?? null}
              variacion={{ actual: datosStats?.kpis?.pven_saldo_por_cobrar ?? null, anterior: null, es_foto: true }} />
            <TarjetaKpi kpi="ticket_promedio" valor={datosStats?.flujo?.ticket_promedio_cop?.actual ?? null}
              variacion={variacionDe(datosStats?.flujo?.ticket_promedio_cop)} />
            <TarjetaKpi kpi="cot_conversion" valor={datosStats?.flujo?.cot_conversion_pct?.actual ?? null}
              variacion={variacionDe(datosStats?.flujo?.cot_conversion_pct)} />
          </FranjaKpis>
        )}

        {/* N3/N5: lo que no se pudo cancelar o actualizar (mensaje del servidor), los avisos y los pedidos omitidos;
            no se traga ningún error */}
        {resultadoLote && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-rose-800">{resultadoLote.titulo}</p>
              <ul className="mt-1 space-y-0.5">
                {resultadoLote.lineas.map((f, i) => (
                  <li key={i} className="text-xs text-rose-700"><span className="font-bold">{f.numero}:</span> {f.error}</li>
                ))}
              </ul>
            </div>
            <button onClick={()=>setResultadoLote(null)} className="p-1 text-rose-400 hover:text-rose-700 rounded-lg" title="Cerrar"><X size={14}/></button>
          </div>
        )}

        {/* B4 T7: el apartado elegido. Documentos: la barra y la tabla estándar (TABLA-hub-ventas) o el tablero en modo
            servidor (KANBAN-hub-ventas), con el MISMO estado (pestaña, búsqueda, estados, semáforo y paso). Análisis: la
            pestaña estándar (ANALISIS-ventas). */}
        <div role="tabpanel" id={`${idSecciones}-panel`} aria-labelledby={`${idSecciones}-${seccion}`} className="flex min-w-0 flex-col gap-4">
          {enAnalisis ? (
            /* ANALISIS-ventas punto 3 (R2, R13, RP6, RP68, RP69, D45): /ventas/analisis con el selector Todo /
               Solicitudes / Cotizaciones / Pedidos; el ?foco= de «Ver análisis» gana hasta que el usuario elige otro y la
               URL se mantiene al día. El Copilot es la tarjeta «En construcción» del panel (R2): no llama a ningún chat. */
            <PanelAnalisisPerezoso
              modulo="ventas"
              endpoint="/ventas/analisis"
              acento="indigo"
              focos={FOCOS_VENTAS}
              focoInicial={enlace.foco}
              alCambiarFoco={(foco) => router.replace(`${RUTA_HUB_VENTAS}?tab=analisis&foco=${foco}`)}
              mejorLinea="sube"
              busquedaProducto
              asistente={ASISTENTE_VENTAS}
            />
          ) : (
            <>
              {capa}
              <section ref={refTarjeta} className={claseTarjeta}>
                <BarraTabla
                  estado={estado}
                  onEstado={alEstadoBarra}
                  pestanas={pestanas}
                  estadoConteos={estadoConteos}
                  placeholder="Buscar por número, cliente, asesor o producto…"
                  opcionesEstados={opcionesEstadosHub}
                  filtros={chipsFiltro.length > 0 || textoOrden ? (
                    <div className="flex flex-wrap items-center gap-2">
                      {/* clic_en_hub (R6): el filtro del paso o del semáforo con su chip para quitarlo. */}
                      {chipsFiltro.map((c) => (
                        <button key={c.campo} type="button" onClick={() => despachar({ tipo: c.campo, valor: null })}
                          aria-label={`Quitar el filtro «${c.texto}»`} title={`Quitar el filtro «${c.texto}»`}
                          className={`inline-flex items-center gap-1 rounded-xl border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 ${FOCO_VISIBLE}`}>
                          {c.texto}
                          <X size={12} aria-hidden="true"/>
                        </button>
                      ))}
                      {/* orden_clic_columna (R6): ordenada por una columna, el chip vuelve al orden del semáforo. */}
                      {textoOrden && (
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                          {textoOrden}
                          <span aria-hidden="true">·</span>
                          <button type="button" onClick={() => despachar({ tipo: 'orden', valor: 'atencion' })}
                            className={`rounded font-bold text-indigo-700 hover:underline ${FOCO_VISIBLE}`}>
                            Atención primero
                          </button>
                        </span>
                      )}
                    </div>
                  ) : undefined}
                  ajustes={{ columnas: COLUMNAS_TABLA_HUB, preferencias: prefs, anchoRef: anchoTablaRef }}
                  kanbanDisponible
                  pantallaCompleta={estado.modo === 'lista' ? { completa, alternar } : undefined}
                  total={listado.total}
                  estadoTotal={estadoDelTotal({
                    total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error,
                  })}
                />
                {estado.modo === 'lista' && (
                  <AccionesFila.Provider value={accionesFila}>
                    <TablaEstandar
                      id={ID_HUB}
                      modo="servidor"
                      columnas={COLUMNAS_TABLA_HUB}
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
                      claveFila={claveDeFila}
                      onFila={openDocDetail}
                      claseFila={claseDeFila}
                      grupoFila={atencion ? grupoDeFila : undefined}
                      tituloGrupo={tituloDeGrupo}
                      seleccion={seleccion}
                      onSeleccion={alSeleccionar}
                      vacio={(
                        <div>
                          <p className="font-semibold text-slate-600">{estado.q.trim() ? `Sin resultados para «${estado.q.trim()}»` : 'No hay documentos en esta vista'}</p>
                          <p className="mt-1 text-xs text-slate-400">Prueba cambiando los filtros o agregando una nueva solicitud.</p>
                        </div>
                      )}
                      etiqueta="Documentos del Hub de Ventas"
                    />
                  </AccionesFila.Provider>
                )}
              </section>
              {estado.modo === 'kanban' && (
                <TableroKanban
                  tablero={tablero}
                  regla={reglaHub}
                  tarjetaDe={tarjetaDeFila}
                  onAbrir={openDocDetail}
                  onCambio={cambiarDesdeTablero}
                  onAccion={accionDesdeTablero}
                  accionesTarjeta={accionesTarjeta}
                  resumenColumna={resumenColumna}
                  color="indigo"
                />
              )}
            </>
          )}
        </div>

        {/* Bulk action bar (N3 y N5): la selección es de la página de la tabla, así que solo en Lista. */}
        {selectedIds.size>0 && !enAnalisis && estado.modo === 'lista' && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">{selectedIds.size} seleccionados</span>
            {(() => {
              // N5: solo pedidos. Se ofrecen los estados manuales a los que al menos uno de los pedidos marcados puede
              // pasar (más Facturado si alguno está entregado); Entregado va por Entregas. El servidor decide cada uno.
              const venMarcados = Array.from(selectedIds).filter(i => i.startsWith('VEN|'));
              const destinos = new Set<string>();
              venMarcados.forEach(idStr => {
                const op = opcionesEstadoPVEN(filaPorId(idStr)?.estado);
                op.mover.forEach(e => destinos.add(e));
                if (op.facturar) destinos.add('FACTURADO');
              });
              const opciones = [...ESTADOS_VEN_MANUALES, 'FACTURADO'].filter(e => destinos.has(e));
              return (
                <select value="" onChange={e=>handleBulkChangeEstado(e.target.value)} disabled={venMarcados.length === 0 || opciones.length === 0}
                  className="bg-slate-800 border border-slate-600 text-white text-xs rounded-xl px-3 py-1.5 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value="" disabled>Cambiar estado de pedidos ({venMarcados.length})…</option>
                  {opciones.map(est => <option key={est} value={est}>{ETIQUETA_ESTADO_VEN[est] || est}</option>)}
                </select>
              );
            })()}
            <button onClick={()=>abrirCancelacion(Array.from(selectedIds))} className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 p-2 rounded-xl transition-colors" title="Cancelar seleccionados">
              <Trash2 size={15}/>
            </button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-white"><X size={15}/></button>
          </div>
        )}

        {/* UNIVERSAL DOCUMENT QUICK DETAIL PANEL (SC, COT, VEN) */}
        {quickDetailDoc&&(
          <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40" onClick={()=>setQuickDetailDoc(null)}/>
            <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col w-[600px] max-w-full border-l border-slate-200">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getTipoClass(quickDetailDoc.tipo)}`}>
                    {getTipoLabel(quickDetailDoc.tipo)}
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{quickDetailDoc.numero}</h2>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getEstadoClass(quickDetailDoc.estado)}`}>
                      {etiquetaEstado(quickDetailDoc.tipo, quickDetailDoc.estado)}
                    </span>
                  </div>
                </div>
                <button onClick={()=>setQuickDetailDoc(null)} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* B4 T7 (FLUJO-documentos punto 6; RP74, D36, D42): la cadena de documentos, compacta (solo los números;
                    las cajas caídas conservan su palabra). Las etiquetas salen de las tablas únicas de cada tipo (RP4). */}
                <div className="min-w-0 bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                  <CadenaDocumentos doc={quickDetailDoc} tipo={quickDetailDoc.tipo} compacta/>
                </div>

                {/* Que se esta pidiendo -- tipo de solicitud + notas, solo aplica a SC */}
                {quickDetailDoc.tipo === 'SC' && (quickDetailDoc.tipo_solicitud || quickDetailDoc.notas) && (
                  <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-2">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wide">Qué se está pidiendo</p>
                    {quickDetailDoc.tipo_solicitud && (
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-white text-indigo-700 border border-indigo-200">{etiquetaTipoSolicitud(quickDetailDoc.tipo_solicitud)}</span>
                    )}
                    {quickDetailDoc.notas && <p className="text-xs text-indigo-900 leading-relaxed">{quickDetailDoc.notas}</p>}
                  </div>
                )}

                {/* Customer Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Información del Cliente</p>
                  <p className="font-black text-slate-800 text-sm">{quickDetailDoc.customer_name || quickDetailDoc.cliente?.nombre || 'Cliente General'}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="text-slate-400 block text-[10px]">Teléfono / WhatsApp:</span> {quickDetailDoc.customer_phone || quickDetailDoc.telefono || '-'}</div>
                    <div><span className="text-slate-400 block text-[10px]">Email:</span> {quickDetailDoc.customer_email || quickDetailDoc.email || '-'}</div>
                    <div className="col-span-2"><span className="text-slate-400 block text-[10px]">Dirección de Entrega:</span> {quickDetailDoc.customer_address || quickDetailDoc.direccion_entrega || 'Recoge en Tienda'}</div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Resumen Financiero</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Liquidado:</span>
                      <span className="font-bold text-slate-900">{fCOP(quickDetailDoc.total_cop || quickDetailDoc.total || 0)}</span>
                    </div>
                    {quickDetailDoc.anticipo_cop !== undefined && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Anticipo / Recaudo:</span>
                        <span className="font-bold">{fCOP(quickDetailDoc.anticipo_cop)}</span>
                      </div>
                    )}
                    {quickDetailDoc.saldo_cop !== undefined && (
                      <div className="flex justify-between text-rose-600 font-bold border-t border-slate-100 pt-1">
                        <span>Saldo Pendiente:</span>
                        <span>{fCOP(quickDetailDoc.saldo_cop)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Products items */}
                {Array.isArray(quickDetailDoc.productos) && quickDetailDoc.productos.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Partidas y Referencias</p>
                    <div className="divide-y divide-slate-100">
                      {quickDetailDoc.productos.map((item:any, idx:number)=>(
                        <div key={idx} className="py-2 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{item.product_name || item.nombre || item.producto_nombre || item.sku || `Ítem #${idx+1}`}</p>
                            <p className="text-[10px] text-slate-400">Cant: {item.qty || item.cantidad || 1} {item.talla ? `· Talla: ${item.talla}` : ''}</p>
                          </div>
                          <span className="font-bold text-slate-700">{fCOP(item.unit_price_cop || item.precio_unitario || item.precio || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* State Changer for VEN -- N2: solo lo que el servidor acepta desde el estado actual; nunca un botón
                    directo a Entregado (va por Entregas) ni a Cancelado sin motivo (modal de N3). */}
                {quickDetailDoc.tipo === 'VEN' && (() => {
                  const op = opcionesEstadoPVEN(quickDetailDoc.estado);
                  const sinOpciones = op.mover.length === 0 && !op.despachar && !op.cancelar && !op.facturar;
                  return (
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Cambiar Estado Operativo</p>
                      {op.mover.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {op.mover.map(est => (
                            <button key={est} onClick={() => cambiarEstadoPedido(quickDetailDoc, est)}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-white text-slate-700 hover:bg-slate-100 border-slate-200">
                              {ETIQUETA_ESTADO_VEN[est]}
                            </button>
                          ))}
                        </div>
                      )}
                      {(op.despachar || op.facturar || op.cancelar) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {op.despachar && (
                            <Link href="/dashboard/inventario/entregas"
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-teal-50 text-teal-800 hover:bg-teal-100 border-teal-200">
                              Despachar en Entregas →
                            </Link>
                          )}
                          {op.facturar && (
                            <button onClick={async () => {
                              const doc = quickDetailDoc;
                              if (await confirmar({
                                titulo: `Marcar ${doc.numero} como Facturado`,
                                mensaje: 'Después de esto el estado del pedido ya no se puede cambiar.',
                                textoConfirmar: 'Marcar como Facturado',
                              })) cambiarEstadoPedido(doc, 'FACTURADO');
                            }}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-green-50 text-green-800 hover:bg-green-100 border-green-200">
                              Marcar como Facturado
                            </button>
                          )}
                          {op.cancelar && (
                            <button onClick={() => abrirCancelacion([`VEN|${quickDetailDoc.id}`])}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-white text-rose-600 hover:bg-rose-50 border-rose-200">
                              Cancelar pedido
                            </button>
                          )}
                        </div>
                      )}
                      {sinOpciones && (
                        <p className="text-xs text-slate-500">
                          Este pedido está {etiquetaEstado('VEN', quickDetailDoc.estado)}; su estado ya no se cambia desde aquí.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Direct Action Link */}
                <div className="pt-2">
                  <button onClick={()=>{
                    const q = quickDetailDoc;
                    // H37: con return_to del Hub, el único botón de volver del detalle dice «Volver al Hub de Ventas». La SC
                    // va directo a su detalle (/solicitud?id= montaba la lista entera solo para redirigir).
                    if(q.tipo==='SC')  router.push(`/dashboard/ventas/solicitud/${q.id}?return_to=%2Fdashboard%2Fventas`);
                    if(q.tipo==='COT') router.push(`/dashboard/ventas/cotizacion/${q.id}?return_to=%2Fdashboard%2Fventas`);
                    if(q.tipo==='VEN') router.push(`/dashboard/ventas/venta/${q.id}?return_to=%2Fdashboard%2Fventas`);
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors">
                    Abrir en Módulo Detallado <ArrowRight size={14}/>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Ventanas que pueden abrirse desde el panel rápido (z-50): van después en el DOM para quedar encima. */}

      {/* N3: cancelar documentos con motivo */}
      {cancelacion && (
        <Modal
          title={filasCancelacion.length === 1 ? `Cancelar ${filasCancelacion[0].row?.numero || 'documento'}` : `Cancelar ${filasCancelacion.length} documentos`}
          subtitle="Revisa qué se va a cancelar e indica el motivo"
          icon={Trash2} color="rose" maxWidth="lg"
          onClose={()=>{ if(!cancelando) setCancelacion(null); }} bloquearCierre={cancelando}
          footer={(
            <>
              <Button variant="secondary" disabled={cancelando} onClick={()=>setCancelacion(null)}>Volver</Button>
              <Button variant="danger" loading={cancelando} disabled={motivoCancelacion.trim().length < 5 || porCancelar.length === 0} onClick={confirmarCancelacion}>
                {porCancelar.length === 1 ? 'Cancelar documento' : 'Cancelar documentos'}
              </Button>
            </>
          )}>
          <ul className="space-y-2">
            {filasCancelacion.map(({idStr, row, motivo}) => (
              <li key={idStr} className={`rounded-xl border px-3 py-2 text-xs ${motivo ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white border-rose-100 text-slate-700'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{row?.numero || idStr}</span>
                  <span className={motivo ? '' : 'text-slate-500'}>· {getTipoLabel(row?.tipo || idStr.split('|')[0])}</span>
                </div>
                <p className="mt-0.5">{motivo ? `Se omite: ${motivo}.` : EFECTO_CANCELACION[row?.tipo ?? '']}</p>
              </li>
            ))}
          </ul>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Motivo (mínimo 5 caracteres)</label>
            <textarea value={motivoCancelacion} onChange={e=>setMotivoCancelacion(e.target.value)} rows={3} disabled={cancelando}
              placeholder="Ej.: El cliente desistió de la compra"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"/>
          </div>
        </Modal>
      )}

      {/* H27+H39: canal del envío al arrastrar una SC o COT (misma ventana que en el detalle) */}
      {envioHub && (
        <ChannelModal
          selectedChannel={canalHub}
          onSelectChannel={setCanalHub}
          onConfirm={confirmarEnvioHub}
          onCancel={()=>{ if(!enviandoHub){ setEnvioHub(null); setCanalHub(null); } }}
          saving={enviandoHub}
          // T9A: WhatsApp solo con un teléfono que sirve (motivoTelefono, como la COT); si no, dice por qué.
          customerHasPhone={!motivoTelefono(envioHub.telefono)}
          textoSinTelefono={textoSinTelefono(envioHub.telefono || envioHub.telefonoCrudo) ?? undefined}
          documentLabel={envioHub.tipo === 'COT' ? 'cotización' : 'solicitud'}
          customerEmail={envioHub.correo}
          envioWhatsApp={envioWhatsAppHub}
          aviso={<AvisoNombreSinContacto documento={envioHub.detalle} />}
        />
      )}
      {hubEnlace && (
        <EnlaceConfirmacionModal documento={hubEnlace.documento} link={hubEnlace.link} color={hubEnlace.color}
          correo={hubEnlace.correo} canal={hubEnlace.canal} whatsappUrl={hubEnlace.whatsapp} envioWhatsapp={hubEnlace.envioWhatsapp}
          telefono={hubEnlace.telefono} vence={hubEnlace.vence} seguimiento={hubEnlace.seguimiento} onClose={()=>setHubEnlace(null)} />
      )}
    </div>
  );
}
