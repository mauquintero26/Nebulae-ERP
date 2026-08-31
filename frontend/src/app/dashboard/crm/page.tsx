"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Plus, Search, RefreshCw, X, ChevronDown, Trash2,
  GripVertical, ExternalLink, Settings, CheckCircle2,
  AlertCircle, User, Package, DollarSign, Clock,
  Edit3, ArrowRight, FileText, ShoppingCart, Receipt,
  Bell, Filter, BarChart3, List, Kanban, Save,
  ChevronRight, AlertTriangle, LayoutGrid
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path, opts = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const res = await fetch(API_URL + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'HTTP ' + res.status); }
  const json = await res.json();
  return json.data ?? json;
}

// ─── Color helpers ─────────────────────────────────────────────────────────
const COLOR_HEX = {
  'bg-blue-500': '#3b82f6','bg-cyan-500': '#06b6d4','bg-indigo-500': '#6366f1',
  'bg-emerald-500': '#10b981','bg-amber-500': '#f59e0b','bg-rose-500': '#f43f5e',
  'bg-purple-500': '#a855f7','bg-slate-500': '#64748b','bg-green-500': '#22c55e',
  'bg-teal-500': '#14b8a6','bg-orange-500': '#f97316','bg-pink-500': '#ec4899',
};
const BG_HEX = {
  'bg-blue-50': '#eff6ff','bg-cyan-50': '#ecfeff','bg-indigo-50': '#eef2ff',
  'bg-emerald-50': '#f0fdf4','bg-amber-50': '#fffbeb','bg-rose-50': '#fff1f2',
  'bg-purple-50': '#faf5ff','bg-slate-50': '#f8fafc','bg-green-50': '#f0fdf4',
  'bg-teal-50': '#f0fdfa','bg-orange-50': '#fff7ed','bg-pink-50': '#fdf2f8',
};
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
export default function CRMPage() {
  const router = useRouter();
  const [stages, setStages] = useState([]);
  const [leads, setLeads]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState('kanban');
  const [search, setSearch] = useState('');
  const [filterStage, setFilterStage] = useState('all');
  const [selectedLead, setSelectedLead] = useState(null);
  const [editingLead, setEditingLead]   = useState(false);
  const [movingLead, setMovingLead]     = useState(null);
  const [showNewLead, setShowNewLead]   = useState(false);
  const [showConfig, setShowConfig]     = useState(false);
  const [isSaving, setIsSaving]         = useState(false);

  // ─── Drag & Drop state ────────────────────────────────────────────────────
  const [dragLeadId, setDragLeadId]           = useState(null);
  const [dragOverStageId, setDragOverStageId] = useState(null);

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
  const [configStages, setConfigStages] = useState([]);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState('bg-purple-500');

  // ═══ Load data ═══════════════════════════════════════════════════════════
  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [stagesData, leadsData] = await Promise.all([
        apiFetch('/crm/pipeline-stages/config'),
        apiFetch('/crm/leads'),
      ]);
      setStages(Array.isArray(stagesData) ? stagesData : []);
      setLeads(Array.isArray(leadsData) ? leadsData : []);
    } catch (e) { toast.error('Error cargando CRM: ' + e.message); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

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
  function getLeadsForStage(stage) {
    return leads.filter(l => l.pipeline_stage_id === stage.id);
  }
  const totalValue = leads.reduce((s, l) => s + (l.value || 0), 0);
  const isQuotacion = (tipo) => tipo?.toLowerCase().includes('cotizac');
  const filteredLeads = leads.filter(l => {
    const matchSearch = !search ||
      l.client?.toLowerCase().includes(search.toLowerCase()) ||
      l.description?.toLowerCase().includes(search.toLowerCase()) ||
      l.lead_product_name?.toLowerCase().includes(search.toLowerCase()) ||
      l.advisor_name?.toLowerCase().includes(search.toLowerCase());
    const matchStage = filterStage === 'all' || l.pipeline_stage_id === Number(filterStage);
    return matchSearch && matchStage;
  });

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
  async function handleCreateCustomerQuick() {
    const parts = custQuery.trim().split(' ');
    const first_name = parts[0] || 'Nuevo';
    const last_name = parts.slice(1).join(' ') || 'Cliente';
    const tid = toast.loading('Creando cliente...');
    try {
      const c = await apiFetch('/crm/customers', { method: 'POST',
        body: JSON.stringify({ first_name, last_name }) });
      selectCustomer({ id: c.id, full_name: `${c.first_name} ${c.last_name}` });
      toast.success(`Cliente "${c.first_name} ${c.last_name}" creado`, { id: tid });
      setCustSugs([]); setShowCustDrop(false);
    } catch (e) { toast.error(e.message, { id: tid }); }
  }

  // ─── Quick-create product if not found ────────────────────────────────
  async function handleCreateProductQuick() {
    const tid = toast.loading('Creando producto...');
    try {
      const p = await apiFetch('/crm/products/quick-create', { method: 'POST',
        body: JSON.stringify({ name: prodQuery.trim(), sale_price: 0 }) });
      selectProduct({ id: p.id, product_name: p.product_name, sale_price: p.sale_price });
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
      setLeads(prev => [saved, ...prev]);
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
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      setSelectedLead(updated);
      setEditingLead(false);
      toast.success('Lead actualizado', { id: tid });
    } catch (e) { toast.error(e.message, { id: tid }); }
    finally { setIsSaving(false); }
  }

  // ═══ Delete Lead ══════════════════════════════════════════════════════════
  async function handleDeleteLead(lead) {
    if (!confirm(`¿Eliminar el lead de "${lead.client}"?`)) return;
    try {
      await apiFetch(`/crm/leads/${lead.id}`, { method: 'DELETE' });
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selectedLead?.id === lead.id) setSelectedLead(null);
      toast.success('Lead eliminado');
    } catch (e) { toast.error(e.message); }
  }

  // ═══ Move Stage ═══════════════════════════════════════════════════════════
  async function handleMoveStage(lead, stageId) {
    try {
      const updated = await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH',
        body: JSON.stringify({ pipeline_stage_id: stageId }) });
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      if (selectedLead?.id === updated.id) setSelectedLead(updated);
      setMovingLead(null);
      toast.success('Lead movido');
    } catch (e) { toast.error(e.message); }
  }

  // ═══ Drag & Drop handlers ════════════════════════════════════════════════
  function handleDragStart(e, lead) {
    setDragLeadId(lead.id);
    e.dataTransfer.effectAllowed = 'move';
    // Store lead id in dataTransfer for cross-window safety
    e.dataTransfer.setData('text/plain', String(lead.id));
  }

  function handleDragEnd() {
    setDragLeadId(null);
    setDragOverStageId(null);
  }

  function handleDragOverStage(e, stageId) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverStageId(stageId);
  }

  function handleDragLeaveStage(e) {
    // Only clear if leaving the column (not a child element)
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDragOverStageId(null);
    }
  }

  async function handleDropOnStage(e, targetStageId) {
    e.preventDefault();
    setDragOverStageId(null);
    if (!dragLeadId) return;
    const lead = leads.find(l => l.id === dragLeadId);
    if (!lead) return;
    if (lead.pipeline_stage_id === targetStageId) {
      setDragLeadId(null);
      return; // same column — no-op
    }
    // Optimistic update for instant visual feedback
    setLeads(prev => prev.map(l =>
      l.id === dragLeadId ? { ...l, pipeline_stage_id: targetStageId } : l
    ));
    setDragLeadId(null);
    try {
      const updated = await apiFetch(`/crm/leads/${dragLeadId}/stage`, {
        method: 'PATCH',
        body: JSON.stringify({ pipeline_stage_id: targetStageId }),
      });
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      if (selectedLead?.id === updated.id) setSelectedLead(updated);
      const stageName = stages.find(s => s.id === targetStageId)?.name || '';
      toast.success(`Lead movido a "${stageName}"`);
    } catch (e) {
      // Revert optimistic update on error
      setLeads(prev => prev.map(l =>
        l.id === dragLeadId ? { ...l, pipeline_stage_id: lead.pipeline_stage_id } : l
      ));
      toast.error('Error al mover: ' + e.message);
    }
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
    if (!confirm('¿Eliminar esta etapa? Los leads en ella quedarán sin etapa asignada.')) return;
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
  }

  // Open detail panel (and populate edit form)
  function openDetail(lead) {
    setSelectedLead(lead);
    setEditingLead(false);
    setEditForm({
      solicitud_tipo: lead.solicitud_tipo || '',
      lead_value: String(lead.value || ''),
      lead_source: lead.source || 'CRM',
      description: lead.description || '',
      lead_product_name: lead.lead_product_name || '',
      lead_product_sku_id: lead.lead_product_sku_id || '',
      lead_qty: String(lead.lead_qty || 1),
      advisor_name: lead.advisor_name || '',
      pipeline_stage_id: String(lead.pipeline_stage_id || ''),
    });
    setCustQuery(lead.client || '');
    setProdQuery(lead.lead_product_name || '');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LEAD CARD component (rich display + draggable)
  // ══════════════════════════════════════════════════════════════════════════
  function LeadCard({ lead }) {
    const stage = stages.find(s => s.id === lead.pipeline_stage_id);
    const alertDays = stage?.alert_days || 7;
    const isStale = lead.days >= alertDays;
    const stageColor = stage ? (COLOR_HEX[stage.color] || '#6366f1') : '#94a3b8';
    const stageBg = stage ? (BG_HEX[stage.bg_color] || '#f8fafc') : '#f8fafc';
    const isDragging = dragLeadId === lead.id;
    return (
      <div
        draggable
        onDragStart={e => handleDragStart(e, lead)}
        onDragEnd={handleDragEnd}
        onClick={() => !dragLeadId && openDetail(lead)}
        className={`bg-white rounded-xl border cursor-grab active:cursor-grabbing hover:shadow-md transition-all group p-3 mb-2 select-none
          ${isDragging ? 'opacity-40 scale-95 shadow-lg ring-2 ring-indigo-400 ring-offset-1' : ''}
          ${isStale && !isDragging ? 'border-amber-300 shadow-amber-100/50 shadow-sm' : ''}
          ${!isStale && !isDragging ? 'border-slate-200 hover:border-indigo-200' : ''}`}>
        {/* Header row */}
        <div className="flex items-start justify-between gap-2 mb-2">
          {/* Drag handle */}
          <GripVertical size={13} className="text-slate-300 group-hover:text-slate-400 mt-0.5 flex-shrink-0 transition-colors"/>
          <div className="flex-1 min-w-0">
            {/* Tipo badge */}
            <div className="flex items-center gap-1.5 mb-1 flex-wrap">
              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md truncate max-w-[140px]"
                style={{ color: stageColor, backgroundColor: stageBg + 'cc' }}>
                {lead.solicitud_tipo || lead.tag || 'Lead'}
              </span>
              {isStale && (
                <span className="text-[9px] font-bold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-md flex items-center gap-0.5">
                  <AlertTriangle size={8}/> {lead.days}d
                </span>
              )}
            </div>
            {/* Client name */}
            <p className="font-black text-slate-800 text-sm truncate leading-tight">{lead.client}</p>
            {/* Product */}
            {lead.lead_product_name && (
              <p className="text-[11px] text-indigo-600 font-bold flex items-center gap-1 mt-0.5 truncate">
                <Package size={9}/> {lead.lead_product_name} {lead.lead_qty > 1 ? `x${lead.lead_qty}` : ''}
              </p>
            )}
            {/* Description */}
            {lead.description && (
              <p className="text-[11px] text-slate-400 truncate mt-0.5">{lead.description}</p>
            )}
          </div>
          {/* Delete button */}
          <button onClick={e => { e.stopPropagation(); handleDeleteLead(lead); }}
            className="opacity-0 group-hover:opacity-100 p-1 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-all flex-shrink-0">
            <Trash2 size={13}/>
          </button>
        </div>
        {/* Footer row */}
        <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            {lead.advisor_name && (
              <span className="text-[10px] text-slate-500 flex items-center gap-0.5 font-medium">
                <User size={9}/> {lead.advisor_name}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-bold text-slate-500 flex items-center gap-0.5">
              <Clock size={9}/> {lead.days}d
            </span>
            {lead.value > 0 && (
              <span className="text-[10px] font-black text-emerald-600">{formatCOP(lead.value)}</span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // AUTOCOMPLETE FIELDS (reusable)
  // ══════════════════════════════════════════════════════════════════════════
  function CustomerAutocomplete({ isEdit=false }) {
    return (
      <div className="relative">
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
          Cliente *
        </label>
        <input
          value={custQuery}
          onChange={e => { setCustQuery(e.target.value); setShowCustDrop(true);
            if (isEdit) setEditForm(f => ({...f, customer_id:'', customer_name:e.target.value}));
            else setNlForm(f => ({...f, customer_id:'', customer_name:e.target.value})); }}
          onFocus={() => setShowCustDrop(true)}
          placeholder="Nombre, email o teléfono..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
        />
        {showCustDrop && custQuery.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
            {custSugs.length > 0 ? (
              <>
                {custSugs.map(c => (
                  <button key={c.id} onClick={() => selectCustomer(c, isEdit)}
                    className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 transition-colors border-b border-slate-50 last:border-0">
                    <p className="text-sm font-bold text-slate-800">{c.full_name}</p>
                    <p className="text-xs text-slate-400">{c.email || c.phone || c.city || 'Sin contacto'}</p>
                  </button>
                ))}
                <div className="p-2 border-t border-slate-100 bg-slate-50">
                  <p className="text-xs text-slate-400 text-center">
                    {custSugs.length} resultado(s) — escribe para filtrar
                  </p>
                </div>
              </>
            ) : (
              <div className="p-4 text-center">
                <AlertCircle size={18} className="text-amber-400 mx-auto mb-2"/>
                <p className="text-sm font-bold text-slate-700">Cliente no encontrado</p>
                <p className="text-xs text-slate-400 mb-3">"{custQuery}" no existe en la base de datos</p>
                <button onClick={handleCreateCustomerQuick}
                  className="w-full bg-purple-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-purple-700">
                  + Crear cliente "{custQuery}"
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function ProductAutocomplete({ isEdit=false }) {
    const tipo = isEdit ? editForm.solicitud_tipo : nlForm.solicitud_tipo;
    if (!isQuotacion(tipo)) return null;
    return (
      <div className="relative">
        <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">
          Producto / Servicio (cotización)
        </label>
        <input
          value={prodQuery}
          onChange={e => { setProdQuery(e.target.value); setShowProdDrop(true);
            if (isEdit) setEditForm(f => ({...f, lead_product_name: e.target.value, lead_product_sku_id:''}));
            else setNlForm(f => ({...f, lead_product_name: e.target.value, lead_product_sku_id:''})); }}
          onFocus={() => setShowProdDrop(true)}
          placeholder="Nombre del producto..."
          className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"
        />
        {showProdDrop && prodQuery.length > 0 && (
          <div className="absolute z-50 top-full left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-52 overflow-y-auto">
            {prodSugs.length > 0 ? (
              <>
                {prodSugs.map(p => (
                  <button key={p.id} onClick={() => selectProduct(p, isEdit)}
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
                <p className="text-xs text-slate-400 mb-3">¿Desea crear "{prodQuery}"?</p>
                <button onClick={handleCreateProductQuick}
                  className="w-full bg-indigo-600 text-white text-xs font-bold py-2 px-4 rounded-lg hover:bg-indigo-700">
                  + Crear producto "{prodQuery}"
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RENDER
  // ══════════════════════════════════════════════════════════════════════════
  return (
    <div className="h-full w-full bg-slate-50 flex flex-col overflow-hidden" onClick={() => {
      setShowCustDrop(false); setShowProdDrop(false);
    }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-200 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-100 rounded-xl flex items-center justify-center text-indigo-600">
            <LayoutGrid size={22}/>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">CRM Pipeline</h1>
            <p className="text-slate-500 text-xs mt-0.5">{leads.length} leads · {formatCOP(totalValue)} en pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button onClick={openConfig}
            className="p-2.5 rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 hover:text-indigo-600 transition-colors" title="Configurar CRM">
            <Settings size={17}/>
          </button>
          <button onClick={loadAll} className="p-2.5 rounded-xl border border-slate-200 text-slate-400 hover:bg-slate-50 transition-colors">
            <RefreshCw size={17} className={loading ? 'animate-spin' : ''}/>
          </button>
          {/* View switcher */}
          <div className="flex bg-slate-100 rounded-xl p-1 gap-0.5">
            {[['kanban','Kanban',<LayoutGrid size={14}/>],['lista','Lista',<List size={14}/>],['analisis','Análisis',<BarChart3 size={14}/>]].map(([v,l,icon]) => (
              <button key={v} onClick={() => setActiveView(v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all
                  ${activeView===v ? 'bg-white text-indigo-700 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                {icon}{l}
              </button>
            ))}
          </div>
          <button onClick={() => setShowNewLead(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl shadow-md shadow-indigo-200 transition-colors">
            <Plus size={17}/> Nuevo Lead
          </button>
        </div>
      </div>

      {/* ── Toolbar: search + filter ── */}
      <div className="flex items-center gap-3 px-6 py-3 bg-white border-b border-slate-100 flex-shrink-0">
        <div className="relative flex-1 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por cliente, producto, asesor..."
            className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-indigo-400"/>
        </div>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="border border-slate-200 rounded-xl px-3 py-2 text-sm text-slate-600 focus:outline-none focus:border-indigo-400 bg-white">
          <option value="all">Todas las etapas</option>
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        {(search || filterStage !== 'all') && (
          <button onClick={() => { setSearch(''); setFilterStage('all'); }}
            className="text-xs text-slate-400 hover:text-slate-700 flex items-center gap-1">
            <X size={13}/> Limpiar
          </button>
        )}
        <span className="text-xs text-slate-400 ml-auto">{filteredLeads.length} leads</span>
      </div>

      {/* ══ KANBAN VIEW ══════════════════════════════════════════════════════ */}
      {activeView === 'kanban' && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden">
          <div className="flex gap-4 p-5 h-full min-w-max">
            {loading ? (
              <div className="flex-1 flex items-center justify-center text-slate-400">
                <RefreshCw size={20} className="animate-spin mr-2"/> Cargando pipeline...
              </div>
            ) : (
              stages.map(stage => {
                const stageLeads = filteredLeads.filter(l => l.pipeline_stage_id === stage.id);
                const stageColor = COLOR_HEX[stage.color] || '#6366f1';
                const stageBg = BG_HEX[stage.bg_color] || '#f8fafc';
                const stageTotal = stageLeads.reduce((s,l) => s+(l.value||0), 0);
                const isDragTarget = dragOverStageId === stage.id;
                const isDraggingAny = dragLeadId !== null;
                return (
                  <div key={stage.id} className="flex flex-col w-72 flex-shrink-0">
                    {/* Stage header */}
                    <div className="flex items-center justify-between mb-3 px-1">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: stageColor }}/>
                        <h3 className="font-black text-slate-700 text-sm">{stage.name}</h3>
                        <span className="text-xs font-bold bg-slate-200 text-slate-600 w-5 h-5 rounded-full flex items-center justify-center">
                          {stageLeads.length}
                        </span>
                      </div>
                      {stageTotal > 0 && (
                        <span className="text-[10px] font-bold text-slate-500">{formatCOP(stageTotal)}</span>
                      )}
                    </div>
                    {/* Cards — Drop zone */}
                    <div
                      onDragOver={e => handleDragOverStage(e, stage.id)}
                      onDragLeave={handleDragLeaveStage}
                      onDrop={e => handleDropOnStage(e, stage.id)}
                      className={`flex-1 overflow-y-auto rounded-2xl p-2 min-h-[200px] transition-all duration-150
                        ${isDragTarget
                          ? 'ring-2 ring-offset-2 scale-[1.01]'
                          : isDraggingAny
                          ? 'opacity-90'
                          : ''}`}
                      style={{
                        backgroundColor: isDragTarget ? stageColor + '18' : stageBg + 'cc',
                        border: isDragTarget
                          ? `2px dashed ${stageColor}`
                          : `1px solid ${stageColor}22`,
                        ringColor: isDragTarget ? stageColor : 'transparent',
                      }}>
                      {stageLeads.map(lead => <LeadCard key={lead.id} lead={lead}/>)}
                      {/* Drop indicator (empty or dragging) */}
                      {(stageLeads.length === 0 || (isDragTarget && isDraggingAny)) && (
                        <div className={`flex flex-col items-center justify-center h-20 rounded-xl transition-all
                          ${isDragTarget ? 'border-2 border-dashed' : 'text-slate-300'}`}
                          style={isDragTarget ? { borderColor: stageColor, color: stageColor } : {}}>
                          {isDragTarget ? (
                            <>
                              <ArrowRight size={20} className="mb-1 animate-bounce"/>
                              <p className="text-xs font-bold">Soltar aquí</p>
                            </>
                          ) : (
                            <>
                              <GripVertical size={20} className="mb-1"/>
                              <p className="text-xs">Sin leads</p>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Add button at bottom */}
                    <button onClick={() => {
                      setNlForm(f => ({...f, pipeline_stage_id: String(stage.id)}));
                      setShowNewLead(true);
                    }} className="mt-2 text-xs font-bold text-slate-400 hover:text-indigo-600 flex items-center gap-1 px-2 py-1.5 hover:bg-indigo-50 rounded-lg transition-colors">
                      <Plus size={13}/> Agregar lead
                    </button>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* ══ LISTA VIEW ═══════════════════════════════════════════════════════ */}
      {activeView === 'lista' && (
        <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-sm m-5">
          {loading ? <div className="p-8 text-slate-400 flex items-center gap-3"><RefreshCw size={20} className="animate-spin"/>Cargando...</div> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>
                  {['Cliente / Tipo','Producto','Etapa','Valor','Asesor','Días',''].map(h =>
                    <th key={h} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredLeads.map(l => {
                  const stage = stages.find(s => s.id === l.pipeline_stage_id);
                  const staleAlert = stage && l.days >= (stage.alert_days || 7);
                  return (
                    <tr key={l.id} onClick={() => openDetail(l)}
                      className={`hover:bg-slate-50 cursor-pointer transition-colors ${staleAlert ? 'bg-amber-50/30' : ''}`}>
                      <td className="p-4">
                        <p className="font-bold text-slate-900 text-sm">{l.client}</p>
                        <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
                          {l.solicitud_tipo || l.tag}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-600">
                        {l.lead_product_name ? (
                          <span className="flex items-center gap-1"><Package size={12}/>{l.lead_product_name}</span>
                        ) : '—'}
                      </td>
                      <td className="p-4">
                        {stage && <span className="text-xs font-bold px-2 py-1 rounded-md"
                          style={{ color: COLOR_HEX[stage.color], backgroundColor: BG_HEX[stage.bg_color]||'#f8fafc' }}>
                          {stage.name}
                        </span>}
                      </td>
                      <td className="p-4 font-black text-slate-800 text-sm">{l.value>0?formatCOP(l.value):'—'}</td>
                      <td className="p-4 text-sm text-slate-500">{l.advisor_name||'—'}</td>
                      <td className="p-4">
                        <span className={`flex items-center gap-1 text-sm font-bold ${staleAlert?'text-amber-600':'text-slate-400'}`}>
                          {staleAlert && <AlertTriangle size={12}/>}{l.days}d
                        </span>
                      </td>
                      <td className="p-4">
                        <button onClick={e=>{e.stopPropagation();handleDeleteLead(l);}}
                          className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded"><Trash2 size={14}/></button>
                      </td>
                    </tr>
                  );
                })}
                {filteredLeads.length===0 && !loading && (
                  <tr><td colSpan={7} className="text-center text-slate-400 py-12 text-sm">No hay leads. Crea uno con "Nuevo Lead".</td></tr>
                )}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ══ ANALISIS VIEW ════════════════════════════════════════════════════ */}
      {activeView === 'analisis' && (
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {[
              ['Leads Activos', leads.length, 'text-slate-800'],
              ['Valor Total Pipeline', formatCOP(totalValue), 'text-purple-700'],
              ['Etapas Configuradas', stages.length, 'text-indigo-700'],
              ['Leads con Producto', leads.filter(l=>l.lead_product_name).length, 'text-emerald-700'],
            ].map(([lbl, val, cls]) => (
              <div key={lbl} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{lbl}</p>
                <p className={`text-2xl font-black ${cls}`}>{val}</p>
              </div>
            ))}
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-700 mb-4">Leads por etapa</h3>
            <div className="space-y-3">
              {stages.map(s => {
                const count = getLeadsForStage(s).length;
                const val = getLeadsForStage(s).reduce((sum, l) => sum+(l.value||0), 0);
                const pct = leads.length > 0 ? Math.round((count/leads.length)*100) : 0;
                const staleCount = getLeadsForStage(s).filter(l=>l.days>=(s.alert_days||7)).length;
                return (
                  <div key={s.id} className="flex items-center gap-3">
                    <div className="w-32 text-sm font-bold text-slate-600 truncate">{s.name}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div className="h-3 rounded-full transition-all" style={{ width:pct+'%', backgroundColor:COLOR_HEX[s.color]||'#94a3b8' }}/>
                    </div>
                    <div className="text-xs font-bold text-slate-600 w-6 text-right">{count}</div>
                    {staleCount > 0 && (
                      <div className="text-xs font-bold text-amber-600 flex items-center gap-0.5 w-16">
                        <AlertTriangle size={10}/>{staleCount} atrasado{staleCount>1?'s':''}
                      </div>
                    )}
                    <div className="text-xs font-bold text-slate-400 w-28 text-right hidden lg:block">{formatCOP(val)}</div>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Leads that need attention */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="font-bold text-slate-700 mb-4 flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-500"/> Leads que requieren atención
            </h3>
            <div className="divide-y divide-slate-100">
              {leads.filter(l => {
                const s = stages.find(st => st.id === l.pipeline_stage_id);
                return s && l.days >= (s.alert_days||7);
              }).slice(0,10).map(l => {
                const s = stages.find(st => st.id === l.pipeline_stage_id);
                return (
                  <div key={l.id} onClick={() => openDetail(l)}
                    className="py-3 flex items-center justify-between cursor-pointer hover:bg-amber-50/50 rounded-lg px-2 transition-colors">
                    <div>
                      <p className="font-bold text-slate-800 text-sm">{l.client}</p>
                      <p className="text-xs text-slate-400">{l.solicitud_tipo} · {s?.name}</p>
                    </div>
                    <span className="text-xs font-bold text-amber-600 bg-amber-50 border border-amber-200 px-2 py-1 rounded-lg">
                      {l.days}d sin movimiento
                    </span>
                  </div>
                );
              })}
              {leads.filter(l => {
                const s = stages.find(st => st.id === l.pipeline_stage_id);
                return s && l.days >= (s.alert_days||7);
              }).length === 0 && (
                <p className="text-sm text-slate-400 text-center py-6">¡Todo al día! No hay leads atrasados.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ══ PANEL — DETALLE LEAD (600px, con edición y acciones Ventas) ════ */}
      {selectedLead && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => { setSelectedLead(null); setEditingLead(false); }}/>
          <div className="fixed top-0 right-0 bottom-0 w-[620px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col" onClick={e=>e.stopPropagation()}>
            {/* Panel header */}
            {(() => {
              const stage = stages.find(s => s.id === selectedLead.pipeline_stage_id);
              return (
                <>
                  <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
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
                        <button onClick={() => setEditingLead(true)}
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
                      <button onClick={() => { setSelectedLead(null); setEditingLead(false); }}
                        className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={16}/></button>
                    </div>
                  </div>

                  {/* Panel body */}
                  <div className="flex-1 overflow-y-auto">

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
                        <CustomerAutocomplete isEdit={true}/>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Tipo de Solicitud</label>
                          <select value={editForm.solicitud_tipo} onChange={e=>setEditForm(f=>({...f,solicitud_tipo:e.target.value}))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white">
                            {SOLICITUD_TIPOS.map(t=><option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                        <ProductAutocomplete isEdit={true}/>
                        {isQuotacion(editForm.solicitud_tipo) && editForm.lead_product_name && (
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Cantidad</label>
                            <input type="number" min="1" value={editForm.lead_qty}
                              onChange={e=>setEditForm(f=>({...f,lead_qty:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"/>
                          </div>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Valor (COP)</label>
                            <input type="number" value={editForm.lead_value}
                              onChange={e=>setEditForm(f=>({...f,lead_value:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"/>
                          </div>
                          <div>
                            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Origen</label>
                            <select value={editForm.lead_source} onChange={e=>setEditForm(f=>({...f,lead_source:e.target.value}))}
                              className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white">
                              {LEAD_SOURCES.map(s=><option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Asesor</label>
                          <input value={editForm.advisor_name} onChange={e=>setEditForm(f=>({...f,advisor_name:e.target.value}))}
                            placeholder="Nombre del asesor"
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500"/>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Etapa del Pipeline</label>
                          <select value={editForm.pipeline_stage_id} onChange={e=>setEditForm(f=>({...f,pipeline_stage_id:e.target.value}))}
                            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 bg-white">
                            <option value="">Sin etapa</option>
                            {stages.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Descripción</label>
                          <textarea value={editForm.description} onChange={e=>setEditForm(f=>({...f,description:e.target.value}))}
                            rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-purple-500 resize-none"/>
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
                          <Link href="/dashboard/agenda"
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
                  </div>
                </>
              );
            })()}
          </div>
        </>
      )}

      {/* ══ MODAL — NUEVO LEAD ═════════════════════════════════════════════ */}
      {showNewLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[95vh] overflow-y-auto"
            onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white sticky top-0 z-10">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-600 text-white rounded-lg"><Plus size={18}/></div>
                <h3 className="font-extrabold text-slate-800 text-lg">Nuevo Lead</h3>
              </div>
              <button onClick={() => setShowNewLead(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18}/></button>
            </div>

            <div className="p-6 space-y-4" onClick={e => e.stopPropagation()}>
              {/* Customer autocomplete */}
              <CustomerAutocomplete isEdit={false}/>

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
              <ProductAutocomplete isEdit={false}/>

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

            <div className="flex gap-3 px-6 pb-6">
              <button onClick={() => setShowNewLead(false)}
                className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">
                Cancelar
              </button>
              <button onClick={handleCreateLead} disabled={isSaving || !nlForm.customer_id}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl text-sm shadow-md shadow-indigo-200 disabled:opacity-50">
                {isSaving ? 'Creando...' : 'Crear Lead'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══ PANEL — CONFIGURACIÓN CRM ══════════════════════════════════════ */}
      {showConfig && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setShowConfig(false)}/>
          <div className="fixed top-0 right-0 bottom-0 w-[520px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-700 text-white rounded-xl"><Settings size={18}/></div>
                <h2 className="font-black text-slate-800 text-lg">Configuración CRM</h2>
              </div>
              <button onClick={() => setShowConfig(false)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400"><X size={16}/></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
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
            </div>
          </div>
        </>
      )}
    </div>
  );
}
