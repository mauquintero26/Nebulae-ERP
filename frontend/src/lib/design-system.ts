// ═══════════════════════════════════════════════════════════════════
//  NEBULAE ERP — Design System
//  Archivo: frontend/src/lib/design-system.ts
//
//  REGLA: Toda página nueva o modificación visual DEBE importar y
//  usar estas constantes. No escribir clases Tailwind a mano cuando
//  exista un token aquí definido.
// ═══════════════════════════════════════════════════════════════════

// ─── PALETA DE COLORES POR MÓDULO ───────────────────────────────────
export const MODULE_COLORS = {
  ventas:    { primary: 'indigo',  accent: 'amber'   },
  compras:   { primary: 'blue',    accent: 'cyan'    },
  inventario:{ primary: 'teal',    accent: 'emerald' },
  crm:       { primary: 'violet',  accent: 'purple'  },
  finanzas:  { primary: 'emerald', accent: 'green'   },
  rrhh:      { primary: 'rose',    accent: 'pink'    },
} as const;

// ─── COLORES DE ESTADO (badges/pills) ───────────────────────────────
export const ESTADO_CLASSES: Record<string, string> = {
  // Solicitudes
  BORRADOR:               'bg-slate-100 text-slate-700 border-slate-200',
  PENDIENTE_CONFIRMACION: 'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMADA:             'bg-emerald-100 text-emerald-700 border-emerald-200',
  // Cotizaciones
  ENVIADA:                'bg-blue-100 text-blue-700 border-blue-200',
  RECHAZADA:              'bg-red-100 text-red-700 border-red-200',
  VENCIDA:                'bg-gray-100 text-gray-500 border-gray-200',
  // Pedidos de Venta
  PENDIENTE_COMPRA:       'bg-orange-100 text-orange-700 border-orange-200',
  EN_PROCESO:             'bg-purple-100 text-purple-700 border-purple-200',
  LISTO_ENTREGA:          'bg-teal-100 text-teal-700 border-teal-200',
  ENTREGADO:              'bg-teal-100 text-teal-700 border-teal-200',
  FACTURADO:              'bg-green-100 text-green-700 border-green-200',
  CANCELADO:              'bg-red-100 text-red-700 border-red-200',
  CANCELADA:              'bg-red-100 text-red-700 border-red-200',
  // Compras
  APROBADO:               'bg-emerald-100 text-emerald-700 border-emerald-200',
  PENDIENTE_PAGO:         'bg-yellow-100 text-yellow-700 border-yellow-200',
  PAGADO:                 'bg-green-100 text-green-700 border-green-200',
  // Inventario
  ACTIVO:                 'bg-emerald-100 text-emerald-700 border-emerald-200',
  INACTIVO:               'bg-gray-100 text-gray-500 border-gray-200',
  BAJO_STOCK:             'bg-red-100 text-red-700 border-red-200',
};
export const getEstadoClass = (e: string) =>
  ESTADO_CLASSES[e] ?? 'bg-gray-100 text-gray-700 border-gray-200';

// ─── COLORES DE TIPO (SC / COT / VEN / etc.) ─────────────────────────
export const TIPO_CLASSES: Record<string, string> = {
  SC:  'bg-indigo-100 text-indigo-700',
  COT: 'bg-amber-100 text-amber-700',
  VEN: 'bg-emerald-100 text-emerald-700',
  PEC: 'bg-blue-100 text-blue-700',
  ENINV: 'bg-teal-100 text-teal-700',
  PXP: 'bg-orange-100 text-orange-700',
};
export const getTipoClass = (t: string) =>
  TIPO_CLASSES[t] ?? 'bg-gray-100 text-gray-700';

// ─── COLORES DE KPI CARD ─────────────────────────────────────────────
export type KpiColor = 'indigo' | 'amber' | 'emerald' | 'purple' | 'orange' | 'red' | 'blue' | 'teal';

export const KPI_COLOR_MAP: Record<KpiColor, {
  bg: string; text: string; border: string; iconBg: string; iconText: string;
}> = {
  indigo:  { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-indigo-100',  iconText:'text-indigo-600'  },
  amber:   { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-amber-100',   iconText:'text-amber-600'   },
  emerald: { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-emerald-100', iconText:'text-emerald-600' },
  purple:  { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-purple-100',  iconText:'text-purple-600'  },
  orange:  { bg:'bg-orange-50',      text:'text-orange-700',  border:'border-orange-200', iconBg:'bg-orange-100',  iconText:'text-orange-600'  },
  red:     { bg:'bg-red-50',         text:'text-red-700',     border:'border-red-200',    iconBg:'bg-red-100',     iconText:'text-red-600'     },
  blue:    { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-blue-100',    iconText:'text-blue-600'    },
  teal:    { bg:'bg-white',          text:'text-gray-900',    border:'border-gray-200',   iconBg:'bg-teal-100',    iconText:'text-teal-600'    },
};

// ─── COLORES DE ACTIVIDAD (timeline dots) ────────────────────────────
export const ACTIVITY_DOT_COLORS: Record<string, string> = {
  CREATED:        '#6366f1',  // indigo
  UPDATED:        '#3b82f6',  // blue
  ESTADO_CHANGED: '#f59e0b',  // amber
  SENT:           '#10b981',  // emerald
  CONFIRMED:      '#059669',  // green
  REJECTED:       '#ef4444',  // red
  CHATTER:        '#22c55e',  // green
  DEFAULT:        '#94a3b8',  // slate
};
export const getActivityColor = (action: string) =>
  ACTIVITY_DOT_COLORS[action] ?? ACTIVITY_DOT_COLORS.DEFAULT;

// ─── CLASES DE COMPONENTES REUTILIZABLES ─────────────────────────────

/** Nav pills del sub-módulo (sticky top) */
export const NAV = {
  wrapper: 'bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto',
  label:   'text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0',
  pill:    'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors',
  pillActive:   'bg-indigo-600 text-white border-indigo-600',
  pillInactive: 'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent',
};

/** Header de página (debajo del nav) */
export const PAGE_HEADER = {
  wrapper:     'bg-white border-b border-gray-100 px-8 py-6',
  inner:       'flex justify-between items-start',
  iconWrapper: 'p-3 rounded-2xl',          // añadir bg-{color}-50 text-{color}-600 dinámicamente
  title:       'text-3xl font-black text-gray-900',
  subtitle:    'text-sm text-gray-400 mt-0.5',
  actions:     'flex items-center gap-3 mt-1',
};

/** Botones de acción del header */
export const BTN = {
  secondary: 'flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm transition-colors',
  primary:   'flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm shadow-sm transition-colors',
  danger:    'flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl hover:bg-red-700 font-bold text-sm shadow-sm transition-colors',
  ghost:     'flex items-center gap-2 px-4 py-2 text-gray-600 rounded-xl hover:bg-gray-100 font-semibold text-sm transition-colors',
  icon:      'p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100 transition-colors',
  whatsapp:  'flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white rounded-xl hover:bg-[#1ebe5d] font-bold text-sm',
};

/** KPI Card */
export const KPI_CARD = {
  wrapper: 'rounded-2xl p-5 border hover:shadow-md transition-all',
  label:   'text-xs font-black text-gray-400 uppercase tracking-wide mb-1',
  value:   'text-3xl font-black text-gray-900 mb-1',
  sub:     'text-xs font-semibold flex items-center gap-1',
  subOk:   'text-emerald-600',
  subWarn: 'text-red-500',
  icon:    'w-10 h-10 rounded-xl flex items-center justify-center mb-3',
};

/** Alert banner */
export const ALERT_BANNER = {
  wrapper: 'bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3',
  text:    'text-xs font-bold text-red-700',
  pill:    'bg-red-100 border border-red-200 px-2.5 py-1 rounded-full',
  action:  'shrink-0 text-xs text-red-600 hover:text-red-800 font-bold border border-red-300 px-2.5 py-1 rounded-lg',
};

/** Barra de Tabs */
export const TABS_BAR = {
  wrapper:     'flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm',
  group:       'flex items-center gap-1 p-1 bg-gray-100 rounded-xl overflow-x-auto',
  tabActive:   'px-4 py-2 rounded-lg text-sm font-bold bg-indigo-600 text-white shadow whitespace-nowrap',
  tabInactive: 'px-4 py-2 rounded-lg text-sm font-bold text-gray-600 hover:bg-white hover:shadow-sm whitespace-nowrap',
  // Estilo amber (usado en sub-páginas tipo Solicitud/Venta/Cotizacion)
  tabActiveAmber:   'px-4 py-2 rounded-xl text-sm font-bold bg-amber-100 text-amber-800 border border-amber-300 whitespace-nowrap',
  tabInactiveAmber: 'px-4 py-2 rounded-xl text-sm font-bold text-gray-500 hover:bg-gray-100 whitespace-nowrap',
};

/** Search + Filters row */
export const SEARCH_BAR = {
  wrapper: 'flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm gap-2',
  input:   'text-sm outline-none flex-1 bg-transparent text-gray-700 placeholder-gray-400',
  pill:    'flex items-center bg-gray-100 rounded-xl px-3 py-2.5 gap-2',     // variante sin borde
};

/** Tabla */
export const TABLE = {
  wrapper: 'bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden',
  thead:   'bg-gray-50 border-b border-gray-100',
  th:      'px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide',
  thFirst: 'px-5 py-3.5 w-10',
  tbody:   'divide-y divide-gray-50',
  tr:      'hover:bg-indigo-50/30 cursor-pointer transition-colors group',
  td:      'px-4 py-4',
  tdFirst: 'px-5 py-4',
  footer:  'px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-medium',
};

/** Badge de estado (pill) */
export const BADGE = {
  base:   'px-2.5 py-0.5 rounded-full text-xs font-medium border',
  tipo:   'px-2.5 py-0.5 rounded-full text-xs font-bold',
};

/** Panel de Detalle (full-width overlay) */
export const DETAIL_PANEL = {
  // left: 240px = sidebar width
  overlay: 'fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl border-l border-gray-200 flex flex-col',
  overlayStyle: { left: '240px' } as React.CSSProperties,
  header:    'bg-gradient-to-r from-indigo-50 to-white px-8 py-5 border-b border-gray-100 flex justify-between items-center',
  body:      'flex flex-1 overflow-hidden',
  leftPane:  'w-[45%] border-r border-gray-100 p-7 overflow-y-auto space-y-5 bg-gray-50/40',
  rightPane: 'w-[55%] bg-white p-7 overflow-y-auto flex flex-col gap-4',
  section:   'bg-white rounded-2xl p-5 border border-gray-100 shadow-sm',
  sectionTitle: 'text-xs font-black text-gray-400 uppercase tracking-wide mb-3',
};

/** Slide-in Panel (Config / Activities) */
export const SLIDE_PANEL = {
  backdrop:     'fixed inset-0 bg-slate-900/30 z-40',
  wrapper480:   'fixed top-0 right-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col w-[480px] border-l border-slate-200',
  wrapper520:   'fixed top-0 right-0 bottom-0 z-[70] bg-white shadow-2xl flex flex-col w-[520px] border-l border-slate-200',
  header:       'flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50',
  body:         'flex-1 overflow-y-auto p-5 space-y-5',
  footer:       'p-5 border-t border-slate-100 bg-white',
};

/** Activity / Chatter tabs */
export const ACTIVITY_TABS = {
  wrapper:     'flex-1 border border-gray-100 rounded-2xl overflow-hidden flex flex-col bg-white shadow-sm',
  tabBar:      'flex border-b border-gray-100 bg-gray-50/50',
  tabActive:   'px-6 py-3.5 text-sm font-bold border-b-2 text-indigo-700 border-indigo-600 bg-white transition-colors',
  tabInactive: 'px-6 py-3.5 text-sm font-bold border-b-2 text-gray-500 border-transparent hover:text-gray-700 transition-colors',
  body:        'flex-1 overflow-y-auto p-5 bg-gray-50/30',
  inputRow:    'p-4 border-t border-gray-100 bg-white flex gap-2',
  input:       'flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200',
  sendBtn:     'bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50',
  // Chatter bubble
  chatterBubble: 'bg-green-50 border border-green-100 rounded-xl p-4',
  chatterText:   'text-sm text-green-900',
  chatterMeta:   'text-xs text-green-600 mt-1 font-medium',
  // Activity item
  activityItem:  'flex gap-4 pl-10 relative',
  activityDot:   'absolute left-2 top-2 w-4 h-4 rounded-full border-2 border-white shadow',
  activityCard:  'flex-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm',
};

/** Toast notification */
export const TOAST = {
  base:    'fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2',
  success: 'bg-emerald-500 text-white',
  error:   'bg-red-500 text-white',
};

/** Loading spinner */
export const LOADING = {
  wrapper: 'flex items-center justify-center py-16',
  spinner: 'animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600',
};

/** Dropdown menu 3 puntos */
export const DROPDOWN = {
  wrapper:   'absolute right-6 top-12 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 z-20',
  item:      'w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium text-indigo-700 flex items-center gap-2',
  itemGray:  'w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium text-gray-700 flex items-center gap-2',
  itemRed:   'w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm font-medium text-red-600 flex items-center gap-2',
  divider:   'border-t border-gray-100 my-1',
  width52:   'w-52',
  width44:   'w-44',
};

/** Barra de acción bulk (bottom center) */
export const BULK_BAR = {
  wrapper: 'fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-gray-700',
  badge:   'font-bold text-sm bg-gray-800 px-3 py-1 rounded-full',
  select:  'bg-gray-800 border border-gray-600 text-white text-sm rounded-xl px-3 py-1.5 outline-none',
};

// ─── UTILIDADES DE FORMATEO ──────────────────────────────────────────
export const fCOP = (v: any): string => {
  const n = Number(v) || 0;
  return '$' + n.toLocaleString('es-CO');
};
export const fDate = (iso: any): string =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const fTime = (iso: any): string =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
export const daysDiff = (iso: any): number =>
  iso ? Math.floor((Date.now() - new Date(iso).getTime()) / 86400000) : 999;

// ─── API FETCH HELPER ────────────────────────────────────────────────
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
export async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as Record<string,string> || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}
