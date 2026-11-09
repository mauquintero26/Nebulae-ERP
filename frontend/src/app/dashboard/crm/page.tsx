// @ts-nocheck
"use client";

import { useState, useEffect, useCallback, useRef, useMemo, createContext, useContext } from 'react';
import {
  Plus, RefreshCw, ChevronDown, Trash2,
  GripVertical, ExternalLink, Settings, CheckCircle2,
  AlertCircle, User, Package, DollarSign, Clock,
  Edit3, ArrowRight, FileText, ShoppingCart, Receipt,
  Bell, Filter, BarChart3, List, Kanban, Save,
  ChevronRight, AlertTriangle, LayoutGrid, Loader2
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import {
  SubNav, PageHeader, Drawer, Modal, Button, MenuFila, TableroKanban, useAvisos, useTableroKanban, CLASE_CHIP,
} from '@/components/ui';
// B4 T21: la tabla estándar (TABLA-otros punto 4), el tablero común (KANBAN-crm) y la pestaña Análisis (ANALISIS-crm).
import { BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla } from '@/components/tabla';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import {
  COLOR_HEX, BG_HEX, columnasDesdeEtapas, columnaDeLead, esLeadAtrasado, reglaSoltarLead, claveEtapaPerdido,
  leadsDelTablero, conLeadActivo, conLeadPerdido, sinLead, sinLeadPerdido, filtrarLeads, sumaPorEtapa,
  textoResumenEtapa, totalesDelTablero, chipsDeLead, leadDeMovimiento, textoDiasLead, textoVacioLeads,
} from '@/lib/crm-etapas';
import { estadoDelTotal, normalizarRespuesta } from '@/lib/tabla';
import { formatoPesos } from '@/lib/pesos';
import { textoDeError } from '@/lib/avisos';
import { TABLE } from '@/lib/design-system';
import { CRM_NAV } from './crm-nav';

async function apiFetch(path, opts = {}) {
  const res = await _apiFetch(path, opts);
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'HTTP ' + res.status); }
  const json = await res.json();
  return json.data ?? json;
}

// ─── Color helpers ─────────────────────────────────────────────────────────
// B4 T21 (RP73): COLOR_HEX y BG_HEX vienen de lib/crm-etapas.js (de HEX_CLASE_TAILWIND, con el rojo de «Perdido»).
const COLOR_OPTIONS = [
  { label:'Azul',    color:'bg-blue-500',    bg:'bg-blue-50'   },
  { label:'Cyan',    color:'bg-cyan-500',    bg:'bg-cyan-50'   },
  { label:'Índigo',  color:'bg-indigo-500',  bg:'bg-indigo-50' },
  { label:'Verde',   color:'bg-emerald-500', bg:'bg-emerald-50'},
  { label:'Ámbar',   color:'bg-amber-500',   bg:'bg-amber-50'  },
  { label:'Rosa',    color:'bg-rose-500',    bg:'bg-rose-50'   },
  { label:'Púrpura', color:'bg-purple-500',  bg:'bg-purple-50' },
  { label:'Teal',    color:'bg-teal-500',    bg:'bg-teal-50'   },
  { label:'Naranja', color:'bg-orange-500',  bg:'bg-orange-50' },
];

const SOLICITUD_TIPOS = [
  'Solicitud de Cotizacion','Solicitud de Seguimiento',
  'Solicitud de Devolucion / Garantia','Solicitud de Soporte Tecnico','Nuevo Lead',
];
const LEAD_SOURCES = ['CRM','WhatsApp','Instagram','Correo','Referido','Sitio Web','Llamada','Otro'];
const STATUS_MAP = {
  'Solicitud de Cotizacion':'QUOTATION','Solicitud de Seguimiento':'PENDING',
  'Solicitud de Devolucion / Garantia':'PENDING','Solicitud de Soporte Tecnico':'PENDING',
  'Nuevo Lead':'DRAFT',
};

function formatCOP(v) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(v);
}
function timeAgo(iso) {
  if (!iso) return 'Hoy';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  if (d > 0) return `hace ${d}d`;
  if (h > 0) return `hace ${h}h`;
  return 'Hace un momento';
}
function daysAgo(iso) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// ─── Autocomplete Hook ─────────────────────────────────────────────────────
function useDebounce(value, delay=300) {
  const [dv, setDv] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDv(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return dv;
}

// ══════════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE FIELDS (reusable) — module scope, not nested in CRMPage, so
// React keeps the same component identity across every keystroke instead of
// unmounting/remounting the <input> (which was stealing focus after every
// single character typed).
// ══════════════════════════════════════════════════════════════════════════
function CustomerAutocomplete({ query, showDropdown, suggestions, onQueryChange, onFocus, onSelect, onCreateNew }) {
  return (
    <div className="relative">
      <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
        Cliente *
      </label>
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onFocus={onFocus}
        placeholder="Nombre, email o teléfono..."
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
      />
      {showDropdown && query.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {suggestions.length > 0 ? (
            <>
              {suggestions.map(c => (
                <button key={c.id} onClick={() => onSelect(c)}
                  className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                  <p className="text-sm font-bold text-slate-800">{c.full_name}</p>
                  <p className="text-xs text-slate-400">{c.email || c.phone || c.city || 'Sin contacto'}</p>
                </button>
              ))}
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <p className="text-xs text-slate-400 text-center">
                  {suggestions.length} resultado(s) — escribe para filtrar
                </p>
              </div>
            </>
          ) : (
            <div className="p-4 text-center">
              <AlertCircle size={18} className="text-amber-400 mx-auto mb-2"/>
              <p className="text-sm font-bold text-slate-700">Cliente no encontrado</p>
              <p className="text-xs text-slate-400 mb-3">"{query}" no existe en la base de datos</p>
              <button onClick={onCreateNew}
                className="w-full bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                + Crear cliente "{query}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ProductAutocomplete({ query, showDropdown, suggestions, onQueryChange, onFocus, onSelect, onCreateNew }) {
  return (
    <div className="relative">
      <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
        Producto / Servicio (cotización)
      </label>
      <input
        value={query}
        onChange={e => onQueryChange(e.target.value)}
        onFocus={onFocus}
        placeholder="Nombre del producto..."
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
      />
      {showDropdown && query.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
          {suggestions.length > 0 ? (
            <>
              {suggestions.map(p => (
                <button key={p.id} onClick={() => onSelect(p)}
                  className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                  <p className="text-sm font-bold text-slate-800">{p.product_name}</p>
                  <p className="text-xs text-slate-400">{p.sku ? `SKU: ${p.sku} · ` : ''}{formatCOP(p.sale_price)}</p>
                </button>
              ))}
            </>
          ) : (
            <div className="p-4 text-center">
              <Package size={18} className="text-amber-400 mx-auto mb-2"/>
              <p className="text-sm font-bold text-slate-700">Producto no encontrado</p>
              <p className="text-xs text-slate-400 mb-3">¿Desea crear "{query}"?</p>
              <button onClick={onCreateNew}
                className="w-full bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                + Crear producto "{query}"
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// B4 T21: la tabla estándar, el tablero común y la pestaña Análisis del CRM
// ══════════════════════════════════════════════════════════════════════════
/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_LEADS = 'crm.leads';
/** La primera vez, Kanban (R4, RP26: vista:crm.leads guarda 'lista' o 'kanban'; «Análisis» no se guarda). */
const INICIAL_LEADS = { modo: 'kanban' };
/** La columna Perdido: los 50 más recientes y el total real (RP61). */
const RUTA_PERDIDOS = '/crm/leads?perdidos=solo&limit=50&orden=dias';
/** El selector de 3 vistas del encabezado, con los íconos de ConmutadorVista (KANBAN-crm punto 6). */
const VISTAS_CRM = [
  { id: 'kanban', etiqueta: 'Kanban', Icono: Kanban },
  { id: 'lista', etiqueta: 'Lista', Icono: List },
  { id: 'analisis', etiqueta: 'Análisis', Icono: BarChart3 },
];
/** El asistente «En construcción» de la pestaña Análisis (R2, RP69). */
const ASISTENTE_CRM = {
  titulo: 'Asistente del CRM',
  ejemplos: ['¿Qué leads llevan más días sin movimiento?', '¿En qué etapa se quedan los leads?'],
};
const FOCO_VISIBLE = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300';

/** «Abrir» y «Borrar» de la fila de la Lista: las columnas son estables (useMemo por las etapas) y leen esto del contexto. */
const AccionesLead = createContext({ abrir: () => {}, borrar: () => {} });

function MenuLead({ lead }) {
  const { abrir, borrar } = useContext(AccionesLead);
  return (
    <MenuFila etiqueta={`Acciones de ${lead.client || 'este lead'}`} items={[
      { etiqueta: 'Abrir', icono: ExternalLink, onClick: () => abrir(lead) },
      { etiqueta: 'Borrar', icono: Trash2, peligro: true, onClick: () => borrar(lead) },
    ]}/>
  );
}

/** El punto de color y el nombre de la etapa (la del lead o, sin ella, la etiqueta de su status que manda el servidor). */
function EtapaDelLead({ lead, etapa }) {
  const color = etapa ? (COLOR_HEX[etapa.color] || '#94a3b8') : '#94a3b8';
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-700">
      <span aria-hidden="true" className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }}/>
      <span className="truncate">{etapa?.name || lead.stage_name || 'Sin etapa'}</span>
    </span>
  );
}

/**
 * Las columnas de la vista Lista (TABLA-otros punto 4; R26): Cliente/Tipo 180 (clave, fija y flexible), Producto 160,
 * Etapa 120 (clave, con su color), Valor 112, Asesor 120, Días 72 (en rojo si esLeadAtrasado: 7 días fijos, RP73) y
 * Acciones 56 (fija, MenuFila con Abrir y Borrar). El orden es el de get_leads (cliente, producto, etapa, valor, asesor,
 * dias). Producto sale oculta por defecto (R26: a 1024 px con el menú abierto la tabla cabe sin correrse).
 */
function columnasLeads(etapasPorId) {
  return [
    {
      id: 'cliente', titulo: 'Cliente / Tipo', ancho: 180, clave: true, fija: 'izquierda', flexible: true, ordenable: 'cliente',
      titleCelda: (l) => [l.client, l.solicitud_tipo || l.tag].filter(Boolean).join(' · '),
      celda: (l) => (
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-slate-900">{l.client}</p>
          <span className="inline-block max-w-full truncate rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-bold text-indigo-700">
            {l.solicitud_tipo || l.tag}
          </span>
        </div>
      ),
    },
    {
      id: 'producto', titulo: 'Producto', ancho: 160, ordenable: 'producto', ocultaPorDefecto: true,
      titleCelda: (l) => l.lead_product_name || '',
      celda: (l) => (l.lead_product_name ? (
        <span className="flex min-w-0 items-center gap-1 text-slate-700">
          <Package size={12} aria-hidden="true" className="shrink-0"/><span className="truncate">{l.lead_product_name}</span>
        </span>
      ) : '—'),
    },
    {
      id: 'etapa', titulo: 'Etapa', ancho: 120, clave: true, ordenable: 'etapa',
      titleCelda: (l) => etapasPorId[String(l.pipeline_stage_id)]?.name || l.stage_name || '',
      celda: (l) => <EtapaDelLead lead={l} etapa={etapasPorId[String(l.pipeline_stage_id)]}/>,
    },
    {
      id: 'valor', titulo: 'Valor', ancho: 112, alinear: 'derecha', ordenable: 'valor',
      titleCelda: (l) => (l.value > 0 ? formatoPesos(l.value) : ''),
      celda: (l) => <span className="font-semibold tabular-nums text-slate-800">{l.value > 0 ? formatoPesos(l.value) : '—'}</span>,
    },
    { id: 'asesor', titulo: 'Asesor', ancho: 120, ordenable: 'asesor', celda: (l) => l.advisor_name || '—' },
    {
      id: 'dias', titulo: 'Días', ancho: 72, alinear: 'derecha', ordenable: 'dias', titleCelda: (l) => textoDiasLead(l),
      celda: (l) => {
        const tarde = esLeadAtrasado(l);
        return (
          <span className={`inline-flex items-center gap-1 font-bold tabular-nums ${tarde ? 'text-red-700' : 'text-slate-600'}`}>
            {tarde && <AlertTriangle size={12} aria-hidden="true"/>}{l.days}d
          </span>
        );
      },
    },
    { id: 'acciones', titulo: 'Acciones', ancho: 56, fija: 'derecha', celda: (l) => <MenuLead lead={l}/> },
  ];
}

/** El tono opaco de la fila (D41): un lead atrasado, ámbar como el tinte de hoy. */
const claseDeFilaLead = (l) => (esLeadAtrasado(l) ? TABLE.filaAviso : null);

/** El nombre de la tarjeta para el menú ⋯ («Acciones de …») y el anuncio del movimiento («… movido a …»). */
const tarjetaDeLead = (l) => ({ numero: l.client || `Lead ${l.id}`, titulo: l.client || '' });

/** El esqueleto del tablero mientras faltan las preferencias o las etapas (la forma de TableroKanban: nada salta). */
function EsqueletoTablero() {
  return (
    <div aria-busy="true" aria-label="Cargando el tablero" className="flex min-h-[420px] w-full min-w-0 items-stretch gap-3 overflow-hidden pb-2">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex w-[85vw] shrink-0 flex-col rounded-2xl border border-slate-200 bg-slate-50 sm:w-72">
          <div className="shrink-0 border-b border-slate-200 px-3 pb-2 pt-3">
            <div className="h-3.5 w-28 animate-pulse rounded bg-slate-200"/>
            <div className="mt-2 h-3 w-16 animate-pulse rounded bg-slate-200"/>
          </div>
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((j) => <div key={j} className="h-20 animate-pulse rounded-xl border border-slate-200 bg-white"/>)}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Una carga del tablero que falló: el texto del servidor tal cual y «Reintentar» (nunca columnas vacías falsas). */
function ErrorCarga({ texto, onReintentar }) {
  return (
    <div role="alert" className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
      <p className="break-words font-semibold">{texto}</p>
      <button type="button" onClick={onReintentar}
        className={`mt-3 inline-flex items-center gap-1.5 rounded-lg border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCO_VISIBLE}`}>
        <RefreshCw size={12} aria-hidden="true"/> Reintentar
      </button>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
// LEAD CARD — la tarjeta del tablero común (renderTarjeta; KANBAN-crm puntos 5 y 7). El arrastre, el clic que abre el
// detalle y el menú ⋯ (Abrir, Mover a…, Borrar) son de TableroKanban: aquí no hay manejadores de puntero. Va en el
// módulo para que React no la vuelva a montar en cada render (el ⋯ abierto no se cierra solo).
// ══════════════════════════════════════════════════════════════════════════
function LeadCard({ lead, stage, contexto }) {
  const isStale = esLeadAtrasado(lead);
  const stageColor = stage ? (COLOR_HEX[stage.color] || '#6366f1') : '#94a3b8';
  const stageBg = stage ? (BG_HEX[stage.bg_color] || '#f8fafc') : '#f8fafc';
  const chips = chipsDeLead(lead);
  return (
    <div aria-busy={contexto?.esperando || undefined}
      className={`bg-white rounded-xl border hover:shadow-md transition-all group p-3
        ${isStale ? 'border-rose-300' : 'border-slate-200 hover:border-indigo-200'}`}>
      {/* Header row */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <GripVertical size={13} aria-hidden="true" className="text-slate-300 group-hover:text-slate-400 mt-0.5 flex-shrink-0 transition-colors"/>
        <div className="flex-1 min-w-0">
          {/* Tipo badge y chips «Con solicitud» y «Atrasado» */}
          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md truncate max-w-[140px]"
              style={{ color: stageColor, backgroundColor: stageBg + 'cc' }}>
              {lead.solicitud_tipo || lead.tag || 'Lead'}
            </span>
            {chips.map(c => (
              <span key={c.texto} className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${CLASE_CHIP[c.tono] ?? CLASE_CHIP.slate}`}>
                {c.texto}
              </span>
            ))}
            {contexto?.esperando && <Loader2 size={12} className="animate-spin text-slate-500" aria-label="Guardando el cambio"/>}
          </div>
          <p className="font-black text-slate-800 text-sm truncate leading-tight" title={lead.client}>{lead.client}</p>
          {lead.lead_product_name && (
            <p className="text-[11px] text-indigo-700 font-bold flex items-center gap-1 mt-0.5 truncate">
              <Package size={9} aria-hidden="true"/> {lead.lead_product_name} {lead.lead_qty > 1 ? `x${lead.lead_qty}` : ''}
            </p>
          )}
          {lead.description && (
            <p className="text-[11px] text-slate-500 truncate mt-0.5">{lead.description}</p>
          )}
        </div>
        {contexto?.menu}
      </div>
      <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
        <div className="flex items-center gap-2 min-w-0">
          {lead.advisor_name && (
            <span className="text-[10px] text-slate-600 flex items-center gap-0.5 font-medium truncate">
              <User size={9} aria-hidden="true"/> {lead.advisor_name}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold text-slate-600 flex items-center gap-0.5" title={textoDiasLead(lead)}>
            <Clock size={9} aria-hidden="true"/> {lead.days}d
          </span>
          {lead.value > 0 && (
            <span className="text-[10px] font-black text-emerald-700 tabular-nums">{formatoPesos(lead.value)}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════
export default function CRMPage() {
  const router = useRouter();
  const [stages, setStages] = useState<any[]>([]);
  const [leads, setLeads]   = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // B4 T21 (KANBAN-crm 6, RP26, D40): el modo Kanban / Lista es de useEstadoTabla (vista:crm.leads; la primera vez,
  // Kanban), la búsqueda es estado.q y «Análisis» es un estado de la página que no se guarda. filterStage es el select
  // de etapa de la barra (stage_id en el servidor).
  const [estado, despachar, listo] = useEstadoTabla(ID_LEADS, INICIAL_LEADS);
  const [enAnalisis, setEnAnalisis] = useState(false);
  const [filterStage, setFilterStage] = useState('all');
  const { avisar, confirmar } = useAvisos();
  // Los perdidos (los 50 más recientes y el total real, RP61) y el estado de la carga del tablero.
  const [perdidos, setPerdidos] = useState(null);           // {items, total} | null (todavía no llegó)
  const [leadsListos, setLeadsListos] = useState(false);    // los activos llegaron al menos una vez
  const [errorLeads, setErrorLeads] = useState(null);       // el error de la última carga de los leads
  const [etapasListas, setEtapasListas] = useState(false);  // hay etapas (del servidor o de la caché)
  const [errorEtapas, setErrorEtapas] = useState(null);     // el de la última carga de /crm/pipeline-stages
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [editingLead, setEditingLead]   = useState(false);
  const [movingLead, setMovingLead]     = useState<any>(null);
  const [showNewLead, setShowNewLead]   = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [isSaving, setIsSaving]         = useState(false);

  // ─── New Lead form ─────────────────────────────────────────────────────
  const [nlForm, setNlForm] = useState({
    customer_id: '', customer_name: '', solicitud_tipo: 'Nuevo Lead',
    lead_value: '', lead_source: 'CRM', description: '',
    lead_product_name: '', lead_product_sku_id: '', lead_qty: '1',
    advisor_name: '', pipeline_stage_id: '',
  });
  // customer autocomplete
  const [custQuery, setCustQuery]       = useState('');
  const [custSugs, setCustSugs]         = useState([]);
  const [showCustDrop, setShowCustDrop] = useState(false);
  const debouncedCust = useDebounce(custQuery, 280);
  // product autocomplete
  const [prodQuery, setProdQuery]       = useState('');
  const [prodSugs, setProdSugs]         = useState([]);
  const [showProdDrop, setShowProdDrop] = useState(false);
  const debouncedProd = useDebounce(prodQuery, 280);

  // ─── Edit lead form ────────────────────────────────────────────────────
  const [editForm, setEditForm] = useState({});

  // ─── Config form ──────────────────────────────────────────────────────
  const [configStages, setConfigStages] = useState<any[]>([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('bg-purple-500');

  // ═══ Load data ═══════════════════════════════════════════════════════════
  // Stages: cached in localStorage for 5 min (rarely change)
  const STAGES_CACHE_KEY = 'crm_stages_v1';
  const STAGES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  function getCachedStages() {
    try {
      const raw = localStorage.getItem(STAGES_CACHE_KEY);
      if (!raw) return null;
      const { data, ts } = JSON.parse(raw);
      if (Date.now() - ts > STAGES_CACHE_TTL) return null;
      return data;
    } catch { return null; }
  }

  function setCachedStages(data) {
    try { localStorage.setItem(STAGES_CACHE_KEY, JSON.stringify({ data, ts: Date.now() })); }
    catch { /* quota exceeded — ignore */ }
  }

  // Load only leads (called after mutations)
  const loadLeads = useCallback(async () => {
    try {
      const leadsData = await apiFetch('/crm/leads');
      setLeads(Array.isArray(leadsData) ? leadsData : (leadsData?.data ?? []));
    } catch (e) { toast.error('Error cargando leads: ' + e.message); }
  }, []);

  // B4 T21 (KANBAN-crm punto 3, RP61): las etapas salen de /crm/pipeline-stages (responde a todos los roles; /config
  // queda solo para el panel del administrador), con la caché crm_stages_v1 de respaldo. Los activos (/crm/leads) y los
  // perdidos (los 50 más recientes y el total real) van en paralelo. Mientras recarga no se borra nada; si algo falla, su
  // error queda para «Reintentar» (nunca columnas vacías falsas). Fuera de la carga inicial también recarga la Lista.
  const recargarListaRef = useRef(() => {});
  const loadAll = useCallback(async (showSpinner = true, opciones = {}) => {
    if (showSpinner) setLoading(true);
    const cached = getCachedStages();
    if (cached) {
      setStages(cached);
      setConfigStages(cached);
      setEtapasListas(true);
    }
    if (!opciones.inicial) recargarListaRef.current();
    const [etapas, activos, perdidosRes] = await Promise.allSettled([
      _apiFetch('/crm/pipeline-stages'),
      _apiFetch('/crm/leads'),
      _apiFetch(RUTA_PERDIDOS),
    ]);
    if (etapas.status === 'fulfilled') {
      const arr = normalizarRespuesta(etapas.value).filas;
      setStages(arr);
      setConfigStages(arr);
      setCachedStages(arr);
      setEtapasListas(true);
      setErrorEtapas(null);
    } else setErrorEtapas(etapas.reason);
    if (activos.status === 'fulfilled') {
      setLeads(normalizarRespuesta(activos.value).filas);
      setLeadsListos(true);
    }
    if (perdidosRes.status === 'fulfilled') {
      const p = normalizarRespuesta(perdidosRes.value);
      setPerdidos({ items: p.filas, total: p.total });
    }
    const fallo = [activos, perdidosRes].find((r) => r.status === 'rejected');
    setErrorLeads(fallo ? fallo.reason : null);
    if (showSpinner) setLoading(false);
  }, []);

  // On mount: warmup pool, then load
  useEffect(() => {
    // Fire warmup in background (don't await — just wakes the pool)
    apiFetch('/crm/warmup').catch(() => {});
    loadAll(true, { inicial: true });
  }, [loadAll]);

  // ═══ B4 T21: la Lista (TABLA-otros punto 4) y el tablero común (KANBAN-crm punto 5) ═════════════════════════════
  // La Lista: TablaEstandar 'crm.leads' en el servidor (/crm/leads con q y el stage_id del select de etapa), activa solo
  // en Lista (D40: esperar: !listo, nunca activo: listo).
  const etapasPorId = useMemo(() => Object.fromEntries(stages.map((s) => [String(s.id), s])), [stages]);
  const columnasLista = useMemo(() => columnasLeads(etapasPorId), [etapasPorId]);
  const prefs = usePreferenciasTabla(ID_LEADS, columnasLista);
  const extraLista = useMemo(() => ({ stage_id: filterStage === 'all' ? null : filterStage }), [filterStage]);
  const listado = useListado({
    ruta: '/crm/leads', estado, extra: extraLista, esperar: !listo, despachar, activo: estado.modo === 'lista' && !enAnalisis,
  });
  const recargarLista = listado.recargar;
  useEffect(() => { recargarListaRef.current = recargarLista; }, [recargarLista]);
  const anchoTablaRef = useRef(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban o a Análisis sale de la pantalla completa (el tablero y el panel no quedan tapados).
  useEffect(() => { if (estado.modo === 'kanban' || enAnalisis) salir(); }, [estado.modo, enAnalisis, salir]);

  // El tablero, en modo cliente (C4: /crm/leads devuelve todo, hasta 500): los activos y los perdidos con la búsqueda y la
  // etapa de la barra; null mientras no llegaron (sus columnas cargan, nunca «vacías»). Perdido cuenta su total real.
  const filtroTablero = useMemo(() => ({ q: estado.q, etapa: filterStage }), [estado.q, filterStage]);
  const leadsTablero = useMemo(
    () => (leadsListos && perdidos ? filtrarLeads(leadsDelTablero(leads, perdidos.items), filtroTablero) : null),
    [leadsListos, perdidos, leads, filtroTablero],
  );
  const columnasTablero = useMemo(() => columnasDesdeEtapas(stages), [stages]);
  const clavePerdido = useMemo(() => claveEtapaPerdido(stages), [stages]);
  const totalesTablero = useMemo(() => totalesDelTablero(stages, perdidos, filtroTablero), [stages, perdidos, filtroTablero]);
  const sumasTablero = useMemo(() => sumaPorEtapa(leadsTablero, stages), [leadsTablero, stages]);
  const columnaDe = useCallback((l) => columnaDeLead(l, stages), [stages]);
  const tablero = useTableroKanban({
    pantalla: ID_LEADS,
    modo: 'cliente',
    columnas: columnasTablero,
    activo: listo && estado.modo === 'kanban' && !enAnalisis,
    porColumna: estado.tamano,
    items: leadsTablero,
    columnaDe,
    esAtrasado: esLeadAtrasado,
    totales: totalesTablero,
  });

  // Un lead que devolvió el servidor (crear, editar o mover) entra en su lista (activos o perdidos); la Lista, que es del
  // servidor, se recarga. El tablero lo toma de sus items (D39: la pantalla no llama a tablero.recargar).
  const aplicarLead = useCallback((lead) => {
    if (!lead || typeof lead !== 'object') return;
    setLeads((prev) => conLeadActivo(prev, lead));
    setPerdidos((prev) => conLeadPerdido(prev, lead));
    recargarLista();
  }, [recargarLista]);
  const quitarLead = useCallback((id) => {
    setLeads((prev) => sinLead(prev, id));
    setPerdidos((prev) => sinLeadPerdido(prev, id));
    recargarLista();
  }, [recargarLista]);

  // El selector Kanban / Lista / Análisis del encabezado (KANBAN-crm punto 6, RP26).
  const elegirVista = (id) => {
    if (id === 'analisis') { setEnAnalisis(true); return; }
    setEnAnalisis(false);
    if (estado.modo !== id) despachar({ tipo: 'modo', valor: id });
  };
  // El select de etapa de la barra (stage_id en el servidor): vuelve a la página 1, como todo filtro (R5).
  const elegirEtapa = (valor) => {
    setFilterStage(valor);
    despachar({ tipo: 'pagina', valor: 1 });
  };
  // Un movimiento de «Requieren atención» abre su lead; si no está cargado, se avisa (ANALISIS-crm punto 2).
  const abrirMovimiento = (fila) => {
    const lead = leadDeMovimiento(fila, leadsDelTablero(leads, perdidos?.items));
    if (lead) openDetail(lead);
    else avisar('Ábrelo desde el Kanban', { tono: 'info' });
  };

  // Customer autocomplete search
  useEffect(() => {
    if (!showNewLead && !editingLead) return;
    if (debouncedCust.length < 1) { setCustSugs([]); return; }
    apiFetch('/crm/customers/search?q=' + encodeURIComponent(debouncedCust))
      .then(d => setCustSugs(Array.isArray(d) ? d : []))
      .catch(() => setCustSugs([]));
  }, [debouncedCust, showNewLead, editingLead]);

  // Product autocomplete search
  useEffect(() => {
    if (!showNewLead && !editingLead) return;
    if (debouncedProd.length < 1) { setProdSugs([]); return; }
    apiFetch('/crm/products/search?q=' + encodeURIComponent(debouncedProd))
      .then(d => setProdSugs(Array.isArray(d) ? d : []))
      .catch(() => setProdSugs([]));
  }, [debouncedProd, showNewLead, editingLead]);

  // ═══ Helpers ═════════════════════════════════════════════════════════════
  // B4 T21: el filtro del Kanban (filteredLeads) es filtrarLeads de lib/crm-etapas.js (arriba, en leadsTablero) y la
  // Lista filtra en el servidor; getLeadsForStage era del Análisis viejo.
  const totalValue = leads.reduce((s, l) => s + (l.value || 0), 0);
  const isQuotacion = (tipo) => tipo?.toLowerCase().includes('cotizac');

  // ─── Select customer from autocomplete ────────────────────────────────
  function selectCustomer(c, isEdit=false) {
    if (isEdit) {
      setEditForm(f => ({ ...f, customer_id: c.id, customer_name: c.full_name }));
      setCustQuery(c.full_name);
    } else {
      setNlForm(f => ({ ...f, customer_id: c.id, customer_name: c.full_name }));
      setCustQuery(c.full_name);
    }
    setCustSugs([]); setShowCustDrop(false);
  }

  // ─── Select product from autocomplete ─────────────────────────────────
  function selectProduct(p, isEdit=false) {
    if (isEdit) {
      setEditForm(f => ({ ...f, lead_product_name: p.product_name, lead_product_sku_id: p.id,
        lead_value: f.lead_value || String(Math.round(p.sale_price)) }));
      setProdQuery(p.product_name);
    } else {
      setNlForm(f => ({ ...f, lead_product_name: p.product_name, lead_product_sku_id: p.id,
        lead_value: f.lead_value || String(Math.round(p.sale_price)) }));
      setProdQuery(p.product_name);
    }
    setProdSugs([]); setShowProdDrop(false);
  }

  // ─── Quick-create customer if not found ───────────────────────────────
  async function handleCreateCustomerQuick(isEdit=false) {
    const parts = custQuery.trim().split(' ');
    const first_name = parts[0] || 'Nuevo';
    const last_name = parts.slice(1).join(' ') || 'Cliente';
    const tid = toast.loading('Creando cliente...');
    try {
      const c = await apiFetch('/crm/customers', { method: 'POST',
        body: JSON.stringify({ first_name, last_name }) });
      selectCustomer({ id: c.id, full_name: `${c.first_name} ${c.last_name}` }, isEdit);
      toast.success(`Cliente "${c.first_name} ${c.last_name}" creado`, { id: tid });
      setCustSugs([]); setShowCustDrop(false);
    } catch (e) { toast.error(e.message, { id: tid }); }
  }

  // ─── Quick-create product if not found ────────────────────────────────
  async function handleCreateProductQuick(isEdit=false) {
    const tid = toast.loading('Creando producto...');
    try {
      const p = await apiFetch('/crm/products/quick-create', { method: 'POST',
        body: JSON.stringify({ name: prodQuery.trim(), sale_price: 0 }) });
      selectProduct({ id: p.id, product_name: p.product_name, sale_price: p.sale_price }, isEdit);
      toast.success(`Producto "${p.product_name}" creado`, { id: tid });
    } catch (e) { toast.error(e.message, { id: tid }); }
  }

  // ═══ Create Lead ══════════════════════════════════════════════════════════
  async function handleCreateLead() {
    if (!nlForm.customer_id) {
      toast.error('Selecciona o crea un cliente primero');
      return;
    }
    const tid = toast.loading('Creando lead...');
    setIsSaving(true);
    try {
      const payload = {
        customer_id: Number(nlForm.customer_id),
        solicitud_tipo: nlForm.solicitud_tipo,
        lead_value: parseFloat(nlForm.lead_value) || 0,
        lead_source: nlForm.lead_source,
        description: nlForm.description,
        lead_product_name: nlForm.lead_product_name,
        lead_product_sku_id: nlForm.lead_product_sku_id ? Number(nlForm.lead_product_sku_id) : null,
        lead_qty: parseFloat(nlForm.lead_qty) || 1,
        advisor_name: nlForm.advisor_name,
        pipeline_stage_id: nlForm.pipeline_stage_id ? Number(nlForm.pipeline_stage_id) : null,
      };
      const saved = await apiFetch('/crm/leads', { method: 'POST', body: JSON.stringify(payload) });
      aplicarLead(saved); // B4 T21: activos o perdidos, y la Lista (del servidor) se recarga
      toast.success('Lead creado', { id: tid });
      setShowNewLead(false);
      setCustQuery(''); setProdQuery('');
      setNlForm({ customer_id:'',customer_name:'',solicitud_tipo:'Nuevo Lead',
        lead_value:'',lead_source:'CRM',description:'',lead_product_name:'',
        lead_product_sku_id:'',lead_qty:'1',advisor_name:'',pipeline_stage_id:'' });
    } catch (e) { toast.error(e.message, { id: tid }); }
    finally { setIsSaving(false); }
  }

  // ═══ Update Lead ══════════════════════════════════════════════════════════
  async function handleUpdateLead() {
    if (!selectedLead) return;
    const tid = toast.loading('Guardando cambios...');
    setIsSaving(true);
    try {
      const payload = {
        solicitud_tipo: editForm.solicitud_tipo,
        lead_value: parseFloat(editForm.lead_value) || 0,
        lead_source: editForm.lead_source,
        lead_description: editForm.description,
        lead_product_name: editForm.lead_product_name,
        lead_product_sku_id: editForm.lead_product_sku_id ? Number(editForm.lead_product_sku_id) : null,
        lead_qty: parseFloat(editForm.lead_qty) || 1,
        advisor_name: editForm.advisor_name,
        pipeline_stage_id: editForm.pipeline_stage_id ? Number(editForm.pipeline_stage_id) : selectedLead.pipeline_stage_id,
      };
      const updated = await apiFetch(`/crm/leads/${selectedLead.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
      aplicarLead(updated); // B4 T21: activos o perdidos, y la Lista (del servidor) se recarga
      setSelectedLead(updated);
      setEditingLead(false);
      toast.success('Lead actualizado', { id: tid });
    } catch (e) { toast.error(e.message, { id: tid }); }
    finally { setIsSaving(false); }
  }

  // ═══ Delete Lead ══════════════════════════════════════════════════════════
  async function handleDeleteLead(lead) {
    // B4 T21 (RP30): confirmar de useAvisos, no confirm() nativo; el mismo texto.
    if (!(await confirmar({
      titulo: 'Eliminar lead', mensaje: `¿Eliminar el lead de "${lead.client}"?`, textoConfirmar: 'Eliminar', peligro: true,
    }))) return;
    try {
      await apiFetch(`/crm/leads/${lead.id}`, { method: 'DELETE' });
      quitarLead(lead.id); // B4 T21: sale de los activos o de Perdido, y la Lista se recarga
      if (selectedLead?.id === lead.id) setSelectedLead(null);
      toast.success('Lead eliminado');
    } catch (e) { toast.error(e.message); }
  }

  // ═══ Move Stage ═══════════════════════════════════════════════════════════
  async function handleMoveStage(lead, stageId) {
    try {
      const updated = await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH',
        body: JSON.stringify({ pipeline_stage_id: stageId }) });
      aplicarLead(updated); // B4 T21: activos o perdidos (Perdido), y la Lista (del servidor) se recarga
      if (selectedLead?.id === updated.id) setSelectedLead(updated);
      setMovingLead(null);
      toast.success('Lead movido');
    } catch (e) { toast.error(e.message); }
  }

  // ═══ B4 T21 (KANBAN-crm punto 5): el cambio de etapa desde el tablero común ══════════════════════════════════════
  // El arrastre, «Mover a…», el clon flotante y la vuelta de la tarjeta si el servidor falla son de TableroKanban
  // (useTableroKanban en modo cliente). reglaSoltarLead es libre (también con solicitud, R11) y da el cuerpo
  // {pipeline_stage_id} de PATCH /crm/leads/{id}/stage; el servidor copia el status de la etapa. Si falla, lanza y la
  // tarjeta vuelve con el mensaje del servidor (useAvisos; el <Toaster/> ya está montado, RP105).
  async function moverDesdeTablero(lead, resultado) {
    const updated = await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify(resultado.cuerpo) });
    aplicarLead(updated);
    if (selectedLead?.id === updated?.id) setSelectedLead(updated);
    return updated;
  }


  // ═══ Lead → Ventas actions ════════════════════════════════════════════════
  async function handleLeadAction(lead, action) {
    const tid = toast.loading('Procesando...');
    try {
      const result = await apiFetch(`/crm/leads/${lead.id}/${action}`, { method: 'POST' });
      await loadAll();
      toast.success(result.message, { id: tid });
      if (result.redirect) {
        setTimeout(() => router.push(result.redirect), 800);
      }
    } catch (e) { toast.error(e.message, { id: tid }); }
  }

  // ═══ Config: Create stage ════════════════════════════════════════════════
  async function handleCreateStage() {
    if (!newStageName.trim()) return;
    try {
      const bg = COLOR_OPTIONS.find(c => c.color === newStageColor)?.bg || 'bg-purple-50';
      const s = await apiFetch('/crm/pipeline-stages', { method: 'POST',
        body: JSON.stringify({ name: newStageName, color: newStageColor, bg_color: bg, maps_to_status: 'DRAFT', alert_days: 7 }) });
      setStages(prev => [...prev, s]);
      setConfigStages(prev => [...prev, { ...s, alert_days: 7, alert_message: '', is_closed: false }]);
      setNewStageName('');
      toast.success('Etapa creada');
    } catch (e) { toast.error(e.message); }
  }

  async function handleDeleteStage(stageId) {
    // B4 T21 (RP30): confirmar de useAvisos, no confirm() nativo; el mismo texto.
    if (!(await confirmar({
      titulo: 'Eliminar etapa', mensaje: '¿Eliminar esta etapa? Los leads en ella quedarán sin etapa asignada.',
      textoConfirmar: 'Eliminar', peligro: true,
    }))) return;
    try {
      await apiFetch(`/crm/pipeline-stages/${stageId}`, { method: 'DELETE' });
      setStages(prev => prev.filter(s => s.id !== stageId));
      setConfigStages(prev => prev.filter(s => s.id !== stageId));
      toast.success('Etapa eliminada');
    } catch (e) { toast.error(e.message); }
  }

  async function handleSaveStageConfig(s) {
    try {
      await apiFetch(`/crm/pipeline-stages/${s.id}/config`, { method: 'PUT',
        body: JSON.stringify(s) });
      setStages(prev => prev.map(st => st.id === s.id ? { ...st, ...s } : st));
      toast.success(`Etapa "${s.name}" guardada`);
    } catch (e) { toast.error(e.message); }
  }

  // Open config panel
  function openConfig() {
    setConfigStages(stages.map(s => ({ ...s })));
    setShowConfig(true);
    // B4 T21 (KANBAN-crm punto 3): /pipeline-stages/config queda para este panel del administrador (sus campos de
    // alerta). Sus datos completan los de cada etapa sin pisar lo que ya está (ni lo que se escribe mientras llega);
    // un 403 (asesor) o un error deja el panel con las etapas de /crm/pipeline-stages.
    apiFetch('/crm/pipeline-stages/config').then(d => {
      const deConfig = Object.fromEntries((Array.isArray(d) ? d : []).map(s => [s.id, s]));
      setConfigStages(prev => prev.map(s => ({ ...(deConfig[s.id] || {}), ...s })));
    }).catch(() => {});
  }

  // Build the edit form snapshot from a lead's CURRENT data (used both when
  // opening the detail panel and when entering edit mode, so a stage move
  // made via "Mover a etapa" while the panel is open — which updates
  // selectedLead but not editForm — can't be silently reverted by a later
  // unrelated save that submits a stale pipeline_stage_id).
  function buildEditForm(lead) {
    return {
      solicitud_tipo: lead.solicitud_tipo || '',
      lead_value: String(lead.value || ''),
      lead_source: lead.source || 'CRM',
      description: lead.description || '',
      lead_product_name: lead.lead_product_name || '',
      lead_product_sku_id: lead.lead_product_sku_id || '',
      lead_qty: String(lead.lead_qty || 1),
      advisor_name: lead.advisor_name || '',
      pipeline_stage_id: String(lead.pipeline_stage_id || ''),
    };
  }

  // Open detail panel (and populate edit form)
  function openDetail(lead) {
    setSelectedLead(lead);
    setEditingLead(false);
    setEditForm(buildEditForm(lead));
    setCustQuery(lead.client || '');
    setProdQuery(lead.lead_product_name || '');
  }

  // B4 T21: LeadCard vive en el módulo (arriba, junto a la Lista) y TableroKanban la pinta con renderTarjeta.

  // Autocomplete fields are now module-scope components (see top of file) —
  // pass all state/handlers explicitly instead of via closures.
  function customerAutocompleteProps(isEdit) {
    return {
      query: custQuery,
      showDropdown: showCustDrop,
      suggestions: custSugs,
      onQueryChange: (v) => {
        setCustQuery(v); setShowCustDrop(true);
        if (isEdit) setEditForm(f => ({...f, customer_id:'', customer_name:v}));
        else setNlForm(f => ({...f, customer_id:'', customer_name:v}));
      },
      onFocus: () => setShowCustDrop(true),
      onSelect: (c) => selectCustomer(c, isEdit),
      onCreateNew: () => handleCreateCustomerQuick(isEdit),
    };
  }

  function productAutocompleteProps(isEdit) {
    return {
      query: prodQuery,
      showDropdown: showProdDrop,
      suggestions: prodSugs,
      onQueryChange: (v) => {
        setProdQuery(v); setShowProdDrop(true);
        if (isEdit) setEditForm(f => ({...f, lead_product_name: v, lead_product_sku_id:''}));
        else setNlForm(f => ({...f, lead_product_name: v, lead_product_sku_id:''}));
      },
      onFocus: () => setShowProdDrop(true),
      onSelect: (p) => selectProduct(p, isEdit),
      onCreateNew: () => handleCreateProductQuick(isEdit),
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div
      className="h-full w-full bg-slate-50 flex flex-col overflow-hidden"
      onClick={() => { setShowCustDrop(false); setShowProdDrop(false); }}>

      <SubNav label="CRM" items={CRM_NAV} currentPath="/dashboard/crm" color="indigo" />

      {/* ── Header ── */}
      <div className="bg-white border-b border-slate-200 flex-shrink-0 px-6 py-4">
        <PageHeader icon={LayoutGrid} color="indigo"
          title="CRM Pipeline"
          subtitle={leadsListos ? `${leads.length} leads · ${formatCOP(totalValue)} en pipeline`
            : errorLeads ? 'No se pudieron cargar los leads' : 'Cargando leads…'}
          actions={(
            <div className="flex items-center gap-2 flex-wrap">
              <button onClick={openConfig}
                className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors" title="Configurar CRM">
                <Settings size={17}/>
              </button>
              <button onClick={loadAll} className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
                <RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>
              </button>
              {/* View switcher (B4 T21, KANBAN-crm 6 y RP26): Kanban y Lista despachan el modo a useEstadoTabla
                  (vista:crm.leads); Análisis es un estado de la página y no se guarda. */}
              <div role="group" aria-label="Vista" className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
                {VISTAS_CRM.map(({ id, etiqueta, Icono }) => {
                  const activa = id === 'analisis' ? enAnalisis : !enAnalisis && estado.modo === id;
                  return (
                    <button key={id} type="button" aria-pressed={activa} onClick={() => elegirVista(id)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${FOCO_VISIBLE}
                        ${activa ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-600 hover:text-slate-800'}`}>
                      <Icono size={14} aria-hidden="true"/>{etiqueta}
                    </button>
                  );
                })}
              </div>
              <Button color="indigo" icon={Plus} onClick={() => setShowNewLead(true)}>Nuevo Lead</Button>
            </div>
          )} />
      </div>

      {/* ══ B4 T21: la barra, la Lista y el Kanban (TABLA-otros 4, KANBAN-crm 3 y 5; R5, R11, D39, D40, D41) ═════════
          Una sola barra para las dos vistas: la búsqueda es estado.q y el select de etapa (stage_id) va en `filtros`.
          En Lista, la tabla estándar en el servidor; en Kanban, el tablero común en modo cliente con los mismos filtros.
          «Análisis» reemplaza las dos. */}
      {!enAnalisis && (
        // pb-24 en Lista: al final de la tabla, la paginación y los ⋯ de las últimas filas no quedan bajo el botón de la IA.
        <div className={`flex-1 min-h-0 overflow-y-auto p-5 ${estado.modo === 'lista' ? 'pb-24' : ''}`}>
          <div className="flex min-w-0 flex-col gap-4">
            {capa}
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={despachar}
                placeholder={estado.modo === 'lista' ? 'Buscar por cliente, producto o descripción…' : 'Buscar por cliente, producto, asesor…'}
                filtros={(
                  <select aria-label="Filtrar por etapa" value={filterStage} onChange={e => elegirEtapa(e.target.value)}
                    className={`rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 ${FOCO_VISIBLE}`}>
                    <option value="all">Todas las etapas</option>
                    {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                )}
                ajustes={{ columnas: columnasLista, preferencias: prefs, anchoRef: anchoTablaRef }}
                pantallaCompleta={estado.modo === 'lista' ? { completa, alternar } : undefined}
                {...(estado.modo === 'lista' ? {
                  total: listado.total,
                  estadoTotal: estadoDelTotal({
                    total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error,
                  }),
                } : {})}
              />
              {estado.modo === 'lista' && (
                <AccionesLead.Provider value={{ abrir: openDetail, borrar: handleDeleteLead }}>
                  <TablaEstandar
                    id={ID_LEADS}
                    modo="servidor"
                    columnas={columnasLista}
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
                    onFila={openDetail}
                    claseFila={claseDeFilaLead}
                    vacio={textoVacioLeads(filtroTablero)}
                    etiqueta="Leads del CRM"
                  />
                </AccionesLead.Provider>
              )}
            </section>
            {estado.modo === 'kanban' && (() => {
              // Mientras faltan las preferencias o las etapas: el esqueleto. Sin etapas por un error: el error con
              // «Reintentar» (nunca columnas vacías falsas). Con etapas y sin leads todavía: cada columna carga.
              if (!listo || (!etapasListas && (loading || !errorEtapas))) return <EsqueletoTablero/>;
              if (!etapasListas) {
                return <ErrorCarga texto={textoDeError(errorEtapas, 'No se pudieron cargar las etapas del CRM')} onReintentar={() => loadAll()}/>;
              }
              if (!columnasTablero.length) {
                return (
                  <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
                    No hay etapas configuradas. Créalas en «Configurar CRM».
                  </p>
                );
              }
              if (!leadsTablero && errorLeads && !loading) {
                return <ErrorCarga texto={textoDeError(errorLeads, 'No se pudieron cargar los leads')} onReintentar={() => loadAll()}/>;
              }
              const fallo = errorLeads || errorEtapas;
              return (
                <TableroKanban
                  tablero={tablero}
                  regla={reglaSoltarLead}
                  onCambio={moverDesdeTablero}
                  onAbrir={openDetail}
                  tarjetaDe={tarjetaDeLead}
                  renderTarjeta={(lead, contexto) => (
                    <LeadCard lead={lead} stage={etapasPorId[columnaDeLead(lead, stages)]} contexto={contexto}/>
                  )}
                  accionesTarjeta={(lead) => [
                    { etiqueta: 'Borrar', icono: Trash2, peligro: true, onClick: () => handleDeleteLead(lead) },
                  ]}
                  resumenColumna={(clave) => textoResumenEtapa(clave, sumasTablero, { clavePerdido, perdidos })}
                  pieColumna={(clave) => (
                    <button type="button" onClick={() => {
                      setNlForm(f => ({...f, pipeline_stage_id: clave}));
                      setShowNewLead(true);
                    }} className={`w-full text-xs font-bold text-slate-600 hover:text-indigo-700 flex items-center gap-1 px-2 py-1.5 hover:bg-indigo-50 rounded-lg transition-colors ${FOCO_VISIBLE}`}>
                      <Plus size={13} aria-hidden="true"/> Agregar lead
                    </button>
                  )}
                  color="indigo"
                  vacio="Sin leads aquí"
                  aviso={fallo && leadsTablero ? (
                    <p role="alert" className="text-rose-800">
                      {textoDeError(fallo, 'No se pudo actualizar el CRM')}{' '}
                      <button type="button" onClick={() => loadAll()} className={`rounded font-bold underline ${FOCO_VISIBLE}`}>Reintentar</button>
                    </p>
                  ) : undefined}
                />
              );
            })()}
          </div>
        </div>
      )}

      {/* ══ ANALISIS VIEW (B4 T21, ANALISIS-crm punto 2; R2, R13, RP69, D45) ══════════════════════════════════════ */}
      {enAnalisis && (
        <div className="flex-1 min-h-0 overflow-y-auto p-5">
          <PanelAnalisisPerezoso
            modulo="crm"
            endpoint="/crm/analisis"
            acento="purple"
            mejorLinea="sube"
            alAbrirMovimiento={abrirMovimiento}
            asistente={ASISTENTE_CRM}
          />
        </div>
      )}

      {/* ══ PANEL — DETALLE LEAD (600px, con edición y acciones Ventas) ════ */}
      {selectedLead && (() => {
        const stage = stages.find(s => s.id === selectedLead.pipeline_stage_id);
        return (
          <Drawer onClose={() => { setSelectedLead(null); setEditingLead(false); }} header={(
            <div className="flex-1 flex items-start justify-between gap-2 min-w-0">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {stage && <span className="text-xs font-black px-2 py-0.5 rounded-md"
                    style={{ color: COLOR_HEX[stage.color], backgroundColor: BG_HEX[stage.bg_color]||'#f8fafc' }}>
                    {stage.name}
                  </span>}
                  <span className="text-xs text-slate-400">{timeAgo(selectedLead.updated_at)}</span>
                </div>
                <h2 className="text-xl font-black text-slate-800">{selectedLead.client}</h2>
                <p className="text-sm text-indigo-600 font-bold mt-0.5">{selectedLead.solicitud_tipo || selectedLead.tag}</p>
              </div>
              <div className="flex items-center gap-2 ml-2">
                {!editingLead ? (
                  <button onClick={() => { setEditForm(buildEditForm(selectedLead)); setEditingLead(true); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100">
                    <Edit3 size={13}/> Editar
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditingLead(false)}
                      className="px-3 py-1.5 border border-slate-200 text-slate-500 rounded-xl text-xs font-bold hover:bg-slate-100">
                      Cancelar
                    </button>
                    <button onClick={handleUpdateLead} disabled={isSaving}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white rounded-xl text-xs font-bold hover:bg-indigo-700 disabled:opacity-60">
                      <Save size={13}/> {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}>

                    {/* ── VIEW MODE ── */}
                    {!editingLead && (
                      <div className="p-5 space-y-4">
                        {/* Value + status */}
                        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 p-4 rounded-2xl text-white">
                          <p className="text-xs font-bold opacity-70 uppercase tracking-wider mb-1">Valor de Oportunidad</p>
                          <h3 className="text-2xl font-black">{selectedLead.value > 0 ? formatCOP(selectedLead.value) : 'Sin valor'}</h3>
                          <p className="text-xs opacity-80 mt-1 font-bold">ESTADO: {selectedLead.status_label || selectedLead.status}</p>
                        </div>

                        {/* Info grid */}
                        <div className="grid grid-cols-2 gap-3">
                          {[
                            ['Cliente', selectedLead.client, User],
                            ['Contacto', selectedLead.contact, null],
                            ['Email', selectedLead.email||'—', null],
                            ['Ciudad', selectedLead.city||'—', null],
                            ['Origen', selectedLead.source, null],
                            ['Asesor', selectedLead.advisor_name||'—', User],
                          ].map(([lbl, val, Icon]) => (
                            <div key={lbl} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                              <p className="text-[10px] font-bold text-slate-400 uppercase">{lbl}</p>
                              <p className="text-sm font-bold text-slate-700 mt-0.5 truncate">{val}</p>
                            </div>
                          ))}
                        </div>

                        {/* Product info */}
                        {selectedLead.lead_product_name && (
                          <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                            <p className="text-xs font-bold text-indigo-500 uppercase mb-1">Producto / Cotización</p>
                            <p className="font-black text-indigo-800">{selectedLead.lead_product_name}</p>
                            {selectedLead.lead_qty > 1 && <p className="text-xs text-indigo-600">Cantidad: {selectedLead.lead_qty}</p>}
                          </div>
                        )}

                        {/* Description */}
                        {selectedLead.description && (
                          <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                            <p className="text-xs font-bold text-slate-400 uppercase mb-1">Descripción</p>
                            <p className="text-sm text-slate-600 whitespace-pre-wrap">{selectedLead.description}</p>
                          </div>
                        )}

                        {/* Days in stage */}
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <Clock size={13}/> {selectedLead.days} día(s) en esta etapa
                          {stage && selectedLead.days >= (stage.alert_days||7) && (
                            <span className="text-amber-600 font-bold flex items-center gap-0.5 ml-1">
                              <AlertTriangle size={11}/> Requiere seguimiento
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* ── EDIT MODE ── */}
                    {editingLead && (
                      <div className="p-5 space-y-4" onClick={e=>e.stopPropagation()}>
                        <CustomerAutocomplete {...customerAutocompleteProps(true)}/>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Tipo de Solicitud</label>
                          <select value={editForm.solicitud_tipo} onChange={e=>setEditForm(f=>({...f,solicitud_tipo:e.target.value}))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                            {SOLICITUD_TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        {isQuotacion(editForm.solicitud_tipo) && <ProductAutocomplete {...productAutocompleteProps(true)}/>}
                        {isQuotacion(editForm.solicitud_tipo) && editForm.lead_product_name && (
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Cantidad</label>
                            <input type="number" min="1" value={editForm.lead_qty}
                              onChange={e=>setEditForm(f=>({...f,lead_qty:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Valor (COP)</label>
                            <input type="number" value={editForm.lead_value}
                              onChange={e=>setEditForm(f=>({...f,lead_value:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Origen</label>
                            <select value={editForm.lead_source} onChange={e=>setEditForm(f=>({...f,lead_source:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                              {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Asesor</label>
                          <input value={editForm.advisor_name} onChange={e=>setEditForm(f=>({...f,advisor_name:e.target.value}))}
                            placeholder="Nombre del asesor"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Etapa del Pipeline</label>
                          <select value={editForm.pipeline_stage_id} onChange={e=>setEditForm(f=>({...f,pipeline_stage_id:e.target.value}))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                            <option value="">Sin etapa</option>
                            {stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Descripción</label>
                          <textarea value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}
                            rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"/>
                        </div>
                      </div>
                    )}

                    {/* ── ACCIONES VENTAS (always visible) ── */}
                    {!editingLead && (
                      <div className="px-5 pb-5 space-y-3">
                        <h4 className="text-xs font-black text-slate-400 uppercase tracking-wider">Acciones en Ventas</h4>

                        {/* Mover etapa */}
                        <div>
                          <p className="text-xs font-bold text-slate-500 mb-2">Mover a etapa:</p>
                          <div className="flex gap-2 flex-wrap">
                            {stages.filter(s => s.id !== selectedLead.pipeline_stage_id).map(s => (
                              <button key={s.id} onClick={() => handleMoveStage(selectedLead, s.id)}
                                className="text-xs font-bold px-2.5 py-1 rounded-lg border transition-all hover:opacity-80"
                                style={{ color: COLOR_HEX[s.color], backgroundColor: BG_HEX[s.bg_color]||'#f8fafc', borderColor: COLOR_HEX[s.color]+'44' }}>
                                → {s.name}
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Action buttons to Ventas */}
                        <div className="space-y-2 pt-2">
                          <button onClick={() => handleLeadAction(selectedLead, 'to-solicitud')}
                            className="w-full flex items-center justify-between px-4 py-3 bg-cyan-50 border border-cyan-200 text-cyan-700 rounded-xl hover:bg-cyan-100 transition-colors">
                            <span className="flex items-center gap-2 font-bold text-sm">
                              <FileText size={16}/> Crear en Ventas → Solicitud de Cliente
                            </span>
                            <ArrowRight size={14}/>
                          </button>
                          <button onClick={() => handleLeadAction(selectedLead, 'to-cotizacion')}
                            className="w-full flex items-center justify-between px-4 py-3 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl hover:bg-indigo-100 transition-colors">
                            <span className="flex items-center gap-2 font-bold text-sm">
                              <Receipt size={16}/> Crear en Ventas → Cotización
                            </span>
                            <ArrowRight size={14}/>
                          </button>
                          <button onClick={() => handleLeadAction(selectedLead, 'to-pedido')}
                            className="w-full flex items-center justify-between px-4 py-3 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl hover:bg-emerald-100 transition-colors">
                            <span className="flex items-center gap-2 font-bold text-sm">
                              <ShoppingCart size={16}/> Crear en Ventas → Pedido de Venta
                            </span>
                            <ArrowRight size={14}/>
                          </button>
                        </div>

                        {/* If cotización: button to Cotiza */}
                        {isQuotacion(selectedLead.solicitud_tipo) && (
                          <Link href="/dashboard/cotiza"
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-xl font-bold text-sm hover:bg-purple-700 transition-colors">
                            <ExternalLink size={15}/> Ir a Cotiza — Realizar Cotización
                          </Link>
                        )}

                        {/* Agenda link */}
                        <div className="grid grid-cols-2 gap-2 pt-1">
                          <Link href={`/dashboard/agenda?customer_id=${selectedLead.customer_id}`}
                            className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-100">
                            <User size={13}/> Ver en Agenda
                          </Link>
                          <button onClick={() => handleDeleteLead(selectedLead)}
                            className="flex items-center justify-center gap-1.5 py-2 bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-xs font-bold hover:bg-rose-100">
                            <Trash2 size={13}/> Eliminar Lead
                          </button>
                        </div>
                      </div>
                    )}
          </Drawer>
        );
      })()}

      {/* ══ MODAL — NUEVO LEAD ═════════════════════════════════════════════ */}
      {showNewLead && (
        <Modal title="Nuevo Lead" icon={Plus} color="indigo" onClose={() => setShowNewLead(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowNewLead(false)}>Cancelar</Button>
              <Button color="indigo" loading={isSaving} disabled={!nlForm.customer_id} onClick={handleCreateLead}>Crear Lead</Button>
            </>
          )}>
          <div onClick={e => e.stopPropagation()} className="space-y-4">
              {/* Customer autocomplete */}
              <CustomerAutocomplete {...customerAutocompleteProps(false)}/>

              {/* Tipo */}
              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Tipo de Solicitud</label>
                <select value={nlForm.solicitud_tipo}
                  onChange={e => setNlForm(f => ({...f, solicitud_tipo: e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                  {SOLICITUD_TIPOS.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* Product (only for cotización) */}
              {isQuotacion(nlForm.solicitud_tipo) && <ProductAutocomplete {...productAutocompleteProps(false)}/>}

              {isQuotacion(nlForm.solicitud_tipo) && nlForm.lead_product_name && (
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Cantidad</label>
                  <input type="number" min="1" value={nlForm.lead_qty}
                    onChange={e => setNlForm(f => ({...f, lead_qty: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Valor Estimado (COP)</label>
                  <input type="number" value={nlForm.lead_value}
                    onChange={e => setNlForm(f => ({...f, lead_value: e.target.value}))}
                    placeholder="0"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Origen</label>
                  <select value={nlForm.lead_source}
                    onChange={e => setNlForm(f => ({...f, lead_source: e.target.value}))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                    {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Asesor Asignado</label>
                <input value={nlForm.advisor_name}
                  onChange={e => setNlForm(f => ({...f, advisor_name: e.target.value}))}
                  placeholder="Nombre del asesor"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500"/>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Etapa Inicial</label>
                <select value={nlForm.pipeline_stage_id}
                  onChange={e => setNlForm(f => ({...f, pipeline_stage_id: e.target.value}))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 bg-white">
                  <option value="">Primera etapa (auto)</option>
                  {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Descripción</label>
                <textarea value={nlForm.description}
                  onChange={e => setNlForm(f => ({...f, description: e.target.value}))}
                  rows={3} placeholder="Detalles del lead, requerimiento, contexto..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-indigo-500 resize-none"/>
              </div>

              {!nlForm.customer_id && custQuery && (
                <div className="flex items-center gap-2 p-3 bg-amber-50 rounded-xl border border-amber-200">
                  <AlertCircle size={15} className="text-amber-500 flex-shrink-0"/>
                  <p className="text-xs text-amber-700 font-medium">Debes seleccionar o crear el cliente para continuar.</p>
                </div>
              )}
          </div>
        </Modal>
      )}

      {/* ══ PANEL — CONFIGURACIÓN CRM ══════════════════════════════════════ */}
      {showConfig && (
        <Drawer onClose={() => setShowConfig(false)} header={(
          <div className="flex items-center gap-3">
            <div className="p-2 bg-slate-700 text-white rounded-xl"><Settings size={18}/></div>
            <h2 className="font-black text-slate-800 text-lg">Configuración CRM</h2>
          </div>
        )}>
              {/* Pipeline stages management */}
              <div>
                <h3 className="font-black text-slate-700 text-sm uppercase tracking-wider mb-3">Etapas del Pipeline</h3>
                <div className="space-y-3">
                  {configStages.map((s, idx) => (
                    <div key={s.id} className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                      <div className="flex items-center gap-2 mb-2">
                        <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: COLOR_HEX[s.color]||'#94a3b8' }}/>
                        <input value={s.name}
                          onChange={e => setConfigStages(prev => prev.map((st,i)=>i===idx?{...st,name:e.target.value}:st))}
                          className="flex-1 text-sm font-bold text-slate-800 bg-transparent border-b border-slate-200 focus:outline-none focus:border-indigo-400 pb-0.5"/>
                        <button onClick={() => handleDeleteStage(s.id)}
                          className="p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={12}/></button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Color</label>
                          <div className="flex gap-1 mt-1 flex-wrap">
                            {COLOR_OPTIONS.map(c => (
                              <button key={c.color} onClick={() => setConfigStages(prev => prev.map((st,i)=>i===idx?{...st,color:c.color,bg_color:c.bg}:st))}
                                className={`w-4 h-4 rounded-full border-2 transition-all ${s.color===c.color?'border-slate-800 scale-110':'border-transparent'}`}
                                style={{ backgroundColor: COLOR_HEX[c.color]||'#94a3b8' }}/>
                            ))}
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-slate-400 uppercase">Días alerta</label>
                          <input type="number" min="1" value={s.alert_days||7}
                            onChange={e => setConfigStages(prev => prev.map((st,i)=>i===idx?{...st,alert_days:Number(e.target.value)}:st))}
                            className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                        </div>
                      </div>
                      <div className="mt-2">
                        <label className="text-[10px] font-bold text-slate-400 uppercase">Mensaje de alerta</label>
                        <input value={s.alert_message||''}
                          onChange={e => setConfigStages(prev => prev.map((st,i)=>i===idx?{...st,alert_message:e.target.value}:st))}
                          placeholder="Lead sin actividad"
                          className="w-full mt-1 border border-slate-200 rounded-lg px-2 py-1 text-xs focus:outline-none focus:border-indigo-400"/>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <label className="flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer">
                          <input type="checkbox" checked={s.is_closed||false}
                            onChange={e => setConfigStages(prev => prev.map((st,i)=>i===idx?{...st,is_closed:e.target.checked}:st))}
                            className="rounded"/>
                          Etapa cerrada (ganado/perdido)
                        </label>
                        <button onClick={() => handleSaveStageConfig(s)}
                          className="text-xs font-bold px-3 py-1 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
                          Guardar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Add new stage */}
                <div className="mt-3 bg-slate-50 rounded-xl p-3 border border-dashed border-slate-300">
                  <p className="text-xs font-bold text-slate-500 mb-2">Nueva Etapa</p>
                  <div className="flex gap-2">
                    <input value={newStageName} onChange={e => setNewStageName(e.target.value)}
                      placeholder="Nombre de la etapa"
                      className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-400"/>
                    <button onClick={handleCreateStage}
                      className="px-3 py-2 bg-indigo-600 text-white text-sm font-bold rounded-lg hover:bg-indigo-700">
                      <Plus size={16}/>
                    </button>
                  </div>
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {COLOR_OPTIONS.map(c => (
                      <button key={c.color} onClick={() => setNewStageColor(c.color)}
                        className={`w-5 h-5 rounded-full border-2 transition-all ${newStageColor===c.color?'border-slate-800 scale-110':'border-transparent'}`}
                        style={{ backgroundColor: COLOR_HEX[c.color]||'#94a3b8' }}/>
                    ))}
                  </div>
                </div>
              </div>

              {/* Info box */}
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-xs text-blue-700">
                <p className="font-bold mb-1">Alertas automáticas</p>
                <p>Los leads que superen los días configurados por etapa aparecerán marcados en rojo/ámbar en el Kanban y en la vista Análisis para que el equipo pueda hacer seguimiento a tiempo.</p>
              </div>
        </Drawer>
      )}
    </div>
  );
}
