"use client";

import { useState, useEffect } from 'react';
import {
  MoreHorizontal, Plus, Search, X, LayoutList, KanbanSquare, BarChart3,
  MessageCircle, Mail, Phone, ExternalLink,
  Clock, Trash2, Check, GripVertical, RefreshCw
} from 'lucide-react';
import toast from 'react-hot-toast';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path, opts = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers = { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) };
  const res = await fetch(API_URL + path, { ...opts, headers: { ...headers, ...(opts.headers || {}) } });
  if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.detail || 'HTTP ' + res.status); }
  const json = await res.json();
  return json.data ?? json;
}

const COLOR_HEX = {
  'bg-blue-500': '#3b82f6', 'bg-cyan-500': '#06b6d4', 'bg-indigo-500': '#6366f1',
  'bg-amber-500': '#f59e0b', 'bg-emerald-500': '#10b981', 'bg-rose-500': '#f43f5e',
  'bg-purple-500': '#a855f7', 'bg-slate-500': '#64748b',
};
const BG_HEX = {
  'bg-blue-50': '#eff6ff', 'bg-cyan-50': '#ecfeff', 'bg-indigo-50': '#eef2ff',
  'bg-amber-50': '#fffbeb', 'bg-emerald-50': '#ecfdf5', 'bg-rose-50': '#fff1f2',
  'bg-purple-50': '#faf5ff', 'bg-slate-50': '#f8fafc',
};
const COLOR_OPTIONS = [
  { label: 'Azul',   color: 'bg-blue-500',   bg: 'bg-blue-50'   },
  { label: 'Cian',   color: 'bg-cyan-500',   bg: 'bg-cyan-50'   },
  { label: 'Indigo', color: 'bg-indigo-500', bg: 'bg-indigo-50' },
  { label: 'Ambar',  color: 'bg-amber-500',  bg: 'bg-amber-50'  },
  { label: 'Verde',  color: 'bg-emerald-500',bg: 'bg-emerald-50' },
  { label: 'Rosa',   color: 'bg-rose-500',   bg: 'bg-rose-50'   },
  { label: 'Morado', color: 'bg-purple-500', bg: 'bg-purple-50' },
];
const dotStyle = (color) => ({ backgroundColor: COLOR_HEX[color] || '#94a3b8' });
const formatCOP = (v) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const timeAgo = (iso) => {
  if (!iso) return '';
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diff < 1) return 'Ahora'; if (diff < 60) return `Hace ${diff} min`;
  if (diff < 1440) return `Hace ${Math.floor(diff/60)}h`; return `Hace ${Math.floor(diff/1440)} dias`;
};

const SOLICITUD_TIPOS = ['Solicitud de Cotizacion','Solicitud de Seguimiento','Solicitud de Devolucion / Garantia','Solicitud de Soporte Tecnico'];
const ORIGENES = ['WhatsApp','Instagram','Correo','Telefono','Reunion','Referido','Web','CRM'];

export default function CRMKanbanPage() {
  const [activeView, setActiveView] = useState('kanban');
  const [stages, setStages] = useState([]);
  const [leads, setLeads] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [selectedLead, setSelectedLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showNewLead, setShowNewLead] = useState(false);
  const [newLeadForm, setNewLeadForm] = useState({ customer_id: '', solicitud_tipo: 'Solicitud de Cotizacion', lead_value: 0, lead_source: 'WhatsApp', description: '', pipeline_stage_id: '' });
  const [editingStage, setEditingStage] = useState(null);
  const [editStageName, setEditStageName] = useState('');
  const [showAddStage, setShowAddStage] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageColor, setNewStageColor] = useState(COLOR_OPTIONS[0]);
  const [movingLead, setMovingLead] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    try {
      const [s, l, c] = await Promise.all([apiFetch('/crm/pipeline-stages'), apiFetch('/crm/leads'), apiFetch('/crm/customers')]);
      setStages(Array.isArray(s) ? s : []); setLeads(Array.isArray(l) ? l : []); setCustomers(Array.isArray(c) ? c : []);
    } catch(e) { toast.error('Error: ' + e.message); } finally { setLoading(false); }
  }

  const getLeadsForStage = (stage) => leads.filter(l => {
    const match = l.pipeline_stage_id ? l.pipeline_stage_id === stage.id : l.status === stage.maps_to_status;
    if (!search) return match;
    return match && (l.client?.toLowerCase().includes(search.toLowerCase()) || l.tag?.toLowerCase().includes(search.toLowerCase()));
  });

  async function handleAddStage() {
    if (!newStageName.trim()) return;
    try {
      const s = await apiFetch('/crm/pipeline-stages', { method: 'POST', body: JSON.stringify({ name: newStageName, color: newStageColor.color, bg_color: newStageColor.bg }) });
      setStages(prev => [...prev, s]); setNewStageName(''); setShowAddStage(false); toast.success('Etapa creada');
    } catch(e) { toast.error(e.message); }
  }
  async function handleRenameStage() {
    if (!editingStage || !editStageName.trim()) return;
    try {
      const s = await apiFetch(`/crm/pipeline-stages/${editingStage.id}`, { method: 'PUT', body: JSON.stringify({ name: editStageName }) });
      setStages(prev => prev.map(st => st.id === s.id ? s : st)); setEditingStage(null); toast.success('Etapa renombrada');
    } catch(e) { toast.error(e.message); }
  }
  async function handleDeleteStage(stage) {
    if (!confirm(`Eliminar la etapa "${stage.name}"?`)) return;
    try {
      await apiFetch(`/crm/pipeline-stages/${stage.id}`, { method: 'DELETE' });
      setStages(prev => prev.filter(s => s.id !== stage.id)); setEditingStage(null); toast.success('Etapa eliminada');
    } catch(e) { toast.error(e.message); }
  }
  async function handleCreateLead() {
    if (!newLeadForm.customer_id) { toast.error('Selecciona un cliente'); return; }
    try {
      const l = await apiFetch('/crm/leads', { method: 'POST', body: JSON.stringify({ ...newLeadForm, customer_id: Number(newLeadForm.customer_id), pipeline_stage_id: newLeadForm.pipeline_stage_id ? Number(newLeadForm.pipeline_stage_id) : undefined, lead_value: Number(newLeadForm.lead_value) || 0 }) });
      setLeads(prev => [l, ...prev]); setShowNewLead(false);
      setNewLeadForm({ customer_id: '', solicitud_tipo: 'Solicitud de Cotizacion', lead_value: 0, lead_source: 'WhatsApp', description: '', pipeline_stage_id: '' });
      toast.success('Lead creado en el pipeline');
    } catch(e) { toast.error(e.message); }
  }
  async function handleMoveLead(lead, stageId) {
    try {
      const updated = await apiFetch(`/crm/leads/${lead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ pipeline_stage_id: stageId }) });
      setLeads(prev => prev.map(l => l.id === updated.id ? updated : l));
      if (selectedLead && selectedLead.id === lead.id) setSelectedLead(updated);
      setMovingLead(null); toast.success('Lead movido');
    } catch(e) { toast.error(e.message); }
  }
  async function handleDeleteLead(lead) {
    if (!confirm(`Eliminar el lead de "${lead.client}"?`)) return;
    try {
      await apiFetch(`/crm/leads/${lead.id}`, { method: 'DELETE' });
      setLeads(prev => prev.filter(l => l.id !== lead.id));
      if (selectedLead && selectedLead.id === lead.id) setSelectedLead(null); toast.success('Lead eliminado');
    } catch(e) { toast.error(e.message); }
  }

  const totalValue = leads.reduce((sum, l) => sum + (l.value || 0), 0);

  const InputField = ({ label, children }) => (
    <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">{label}</label>{children}</div>
  );

  return (
    <div className="h-full w-full flex flex-col bg-slate-50/50 relative overflow-hidden">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 tracking-tight">Pipeline Comercial</h1>
          <p className="text-slate-500 mt-1">{leads.length} leads activos &mdash; <span className="font-bold text-purple-700">{formatCOP(totalValue)}</span></p>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative"><Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" /><input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar..." className="pl-9 pr-4 py-2 text-sm border border-slate-200 rounded-xl bg-white focus:outline-none focus:border-purple-500 w-44" /></div>
          <div className="flex p-1 bg-slate-100 rounded-xl">
            {[['kanban','Kanban'],['lista','Lista'],['analisis','Analisis']].map(([v, label]) => (
              <button key={v} onClick={() => setActiveView(v)} className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-bold rounded-lg transition-all ${activeView === v ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>{label}</button>
            ))}
          </div>
          <button onClick={load} className="p-2 text-slate-500 hover:text-purple-600 hover:bg-purple-50 rounded-xl transition-colors" title="Recargar"><RefreshCw size={18} /></button>
          <button onClick={() => setShowNewLead(true)} className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-sm font-bold rounded-xl transition-all shadow-md shadow-purple-200"><Plus size={18} /> Nuevo Lead</button>
        </div>
      </div>

      {/* KANBAN */}
      {activeView === 'kanban' && (
        <div className="flex-1 overflow-x-auto overflow-y-hidden pb-4">
          <div className="flex h-full gap-4 min-w-max px-1 items-start">
            {loading ? <div className="flex items-center gap-3 text-slate-500 p-8"><RefreshCw size={20} className="animate-spin" /> Cargando...</div>
            : stages.map(col => {
              const colLeads = getLeadsForStage(col);
              return (
                <div key={col.id} className="flex flex-col w-72 bg-slate-100/50 rounded-2xl border border-slate-200/60 overflow-hidden flex-shrink-0" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                  <div className="p-3 border-b border-slate-200/50 flex items-center justify-between bg-white/60">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={dotStyle(col.color)} />
                      <h3 className="font-bold text-slate-800 text-sm truncate">{col.name}</h3>
                      <span className="text-[10px] font-bold text-slate-400 bg-slate-200 px-1.5 py-0.5 rounded-full">{colLeads.length}</span>
                    </div>
                    <button onClick={() => { setEditingStage(col); setEditStageName(col.name); }} className="p-1 hover:bg-slate-200 rounded text-slate-400"><MoreHorizontal size={14} /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-2.5 space-y-2.5">
                    {colLeads.map(card => (
                      <div key={card.id} onClick={() => setSelectedLead(card)} className="bg-white p-3 rounded-xl shadow-sm border border-slate-200 cursor-pointer hover:border-purple-300 hover:shadow-md transition-all group">
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-md" style={{ color: COLOR_HEX[col.color] || '#64748b', backgroundColor: BG_HEX[col.bg_color] || '#f8fafc' }}>{card.tag || 'Solicitud'}</span>
                          <span className="text-[10px] text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md flex items-center gap-1"><Clock size={9} />{card.days}d</span>
                        </div>
                        <h4 className="font-black text-slate-800 text-sm mb-0.5 truncate">{card.client}</h4>
                        <p className="text-xs text-slate-500 truncate mb-2">{card.contact}</p>
                        <div className="flex justify-between items-center border-t border-slate-100 pt-2">
                          <span className="font-black text-slate-800 text-xs">{card.value > 0 ? formatCOP(card.value) : 'Sin valor'}</span>
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {card.phone && <button className="p-1 bg-green-50 text-green-600 hover:bg-green-100 rounded" onClick={e => { e.stopPropagation(); window.open(`https://wa.me/${card.phone.replace(/\D/g,'')}`); }}><MessageCircle size={11} /></button>}
                            {card.email && <button className="p-1 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded" onClick={e => { e.stopPropagation(); window.open(`mailto:${card.email}`); }}><Mail size={11} /></button>}
                            <button className="p-1 bg-rose-50 text-rose-500 hover:bg-rose-100 rounded" onClick={e => { e.stopPropagation(); handleDeleteLead(card); }}><Trash2 size={11} /></button>
                          </div>
                        </div>
                      </div>
                    ))}
                    {colLeads.length === 0 && <div className="text-center py-6 text-slate-300 text-xs font-medium">Sin leads</div>}
                  </div>
                  <button onClick={() => { setNewLeadForm(p => ({ ...p, pipeline_stage_id: col.id })); setShowNewLead(true); }} className="flex items-center gap-2 text-slate-400 hover:text-purple-600 text-xs font-bold p-3 border-t border-slate-200/50 hover:bg-purple-50/50 transition-colors">
                    <Plus size={13} /> Agregar lead
                  </button>
                </div>
              );
            })}
            {!loading && (
              <button onClick={() => setShowAddStage(true)} className="flex flex-col items-center justify-center w-52 min-h-28 bg-slate-100/30 hover:bg-slate-200/50 border-2 border-dashed border-slate-300 hover:border-purple-400 rounded-2xl text-slate-400 hover:text-purple-500 transition-all flex-shrink-0 gap-2 font-bold text-sm">
                <Plus size={20} /> Nueva etapa
              </button>
            )}
          </div>
        </div>
      )}

      {/* LISTA */}
      {activeView === 'lista' && (
        <div className="flex-1 overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-sm">
          {loading ? <div className="p-8 text-slate-400 flex items-center gap-3"><RefreshCw size={20} className="animate-spin" /> Cargando...</div> : (
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                <tr>{['Cliente','Tipo Solicitud','Etapa','Valor','Dias','Origen',''].map(h => <th key={h} className="p-4 text-xs font-bold text-slate-500 uppercase tracking-wider">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leads.filter(l => !search || l.client?.toLowerCase().includes(search.toLowerCase())).map(l => {
                  const stage = stages.find(s => s.id === l.pipeline_stage_id);
                  return (
                    <tr key={l.id} onClick={() => setSelectedLead(l)} className="hover:bg-slate-50 cursor-pointer transition-colors">
                      <td className="p-4"><p className="font-bold text-slate-900 text-sm">{l.client}</p><p className="text-xs text-slate-500">{l.contact}</p></td>
                      <td className="p-4 text-sm text-slate-600">{l.solicitud_tipo || l.tag}</td>
                      <td className="p-4">{stage && <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: COLOR_HEX[stage.color], backgroundColor: BG_HEX[stage.bg_color] || '#f8fafc' }}>{stage.name}</span>}</td>
                      <td className="p-4 font-black text-slate-800 text-sm">{l.value > 0 ? formatCOP(l.value) : '—'}</td>
                      <td className="p-4 text-slate-500 text-sm"><span className="flex items-center gap-1"><Clock size={12} />{l.days}d</span></td>
                      <td className="p-4 text-slate-500 text-sm">{l.source}</td>
                      <td className="p-4"><button onClick={e => { e.stopPropagation(); handleDeleteLead(l); }} className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"><Trash2 size={14} /></button></td>
                    </tr>
                  );
                })}
                {leads.length === 0 && !loading && <tr><td colSpan={7} className="text-center text-slate-400 py-12 text-sm">No hay leads. Crea uno con "Nuevo Lead".</td></tr>}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ANALISIS */}
      {activeView === 'analisis' && (
        <div className="flex-1 overflow-y-auto space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Leads Activos</p><p className="text-3xl font-black text-slate-800">{leads.length}</p></div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Valor Total</p><p className="text-3xl font-black text-purple-700">{formatCOP(totalValue)}</p></div>
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"><p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Etapas del Pipeline</p><p className="text-3xl font-black text-slate-800">{stages.length}</p></div>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h3 className="font-bold text-slate-700 mb-4">Leads por etapa</h3>
            <div className="space-y-3">
              {stages.map(s => {
                const count = getLeadsForStage(s).length;
                const val = getLeadsForStage(s).reduce((sum, l) => sum + (l.value || 0), 0);
                const pct = leads.length > 0 ? Math.round((count / leads.length) * 100) : 0;
                return (
                  <div key={s.id} className="flex items-center gap-4">
                    <div className="w-36 text-sm font-bold text-slate-600 truncate">{s.name}</div>
                    <div className="flex-1 bg-slate-100 rounded-full h-3 overflow-hidden"><div className="h-3 rounded-full transition-all" style={{ width: pct + '%', backgroundColor: COLOR_HEX[s.color] || '#94a3b8' }} /></div>
                    <div className="text-xs font-bold text-slate-500 w-6 text-right">{count}</div>
                    <div className="text-xs font-bold text-slate-400 w-28 text-right hidden lg:block">{formatCOP(val)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PANEL DETALLE LEAD */}
      {selectedLead && (
        <>
          <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={() => setSelectedLead(null)} />
          <div className="fixed top-0 right-0 bottom-0 w-[400px] bg-white shadow-2xl border-l border-slate-200 z-50 flex flex-col">
            <div className="p-5 border-b border-slate-100 bg-slate-50 flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-black text-slate-800 truncate">{selectedLead.client}</h2>
                <p className="text-sm text-slate-500 mt-0.5">{selectedLead.solicitud_tipo || selectedLead.tag}</p>
                <div className="flex items-center gap-2 mt-2">
                  {(() => { const stage = stages.find(s => s.id === selectedLead.pipeline_stage_id); return stage ? <span className="text-xs font-bold px-2 py-1 rounded-md" style={{ color: COLOR_HEX[stage.color], backgroundColor: BG_HEX[stage.bg_color] || '#f8fafc' }}>{stage.name}</span> : null; })()}
                  <span className="text-xs text-slate-400">{timeAgo(selectedLead.created_at)}</span>
                </div>
              </div>
              <button onClick={() => setSelectedLead(null)} className="p-2 hover:bg-slate-200 rounded-full text-slate-400 ml-2"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              <div className="bg-purple-50 p-4 rounded-2xl border border-purple-100">
                <p className="text-xs font-bold text-purple-500 uppercase tracking-wider mb-1">Valor de Oportunidad</p>
                <h3 className="text-2xl font-black text-purple-700">{selectedLead.value > 0 ? formatCOP(selectedLead.value) : 'Sin valor'}</h3>
                <p className="text-xs text-purple-500 mt-1 font-bold">ESTADO: {selectedLead.status_label || selectedLead.status}</p>
                <div className="grid grid-cols-2 gap-2 mt-3">
                  <Link href="/dashboard/agenda" className="flex items-center justify-center gap-2 bg-white text-purple-700 border border-purple-200 py-2 rounded-xl text-xs font-bold hover:bg-purple-50 transition-colors"><ExternalLink size={13} /> Ver en Agenda</Link>
                  <button onClick={() => setMovingLead(selectedLead)} className="flex items-center justify-center gap-2 bg-purple-600 text-white py-2 rounded-xl text-xs font-bold hover:bg-purple-700 transition-colors"><GripVertical size={13} /> Mover Etapa</button>
                </div>
              </div>
              <div className="space-y-2">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Informacion del Lead</h4>
                {[['Cliente', selectedLead.client],['Contacto', selectedLead.contact],['Email', selectedLead.email || '—'],['Ciudad', selectedLead.city || '—'],['Origen', selectedLead.source],['Descripcion', selectedLead.description || '—'],['Dias en etapa', `${selectedLead.days} dia(s)`]].map(([lbl, val]) => (
                  <div key={lbl} className="flex gap-3"><span className="text-xs font-bold text-slate-400 w-28 flex-shrink-0 pt-0.5">{lbl}</span><span className="text-sm text-slate-700 font-medium">{val}</span></div>
                ))}
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Acciones</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => selectedLead.phone && window.open(`https://wa.me/${selectedLead.phone.replace(/\D/g,'')}`)} className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-green-400 transition-all group"><div className="bg-green-100 text-green-600 p-1.5 rounded-lg group-hover:bg-green-500 group-hover:text-white transition-colors"><MessageCircle size={13} /></div><span className="text-xs font-bold text-slate-700">WhatsApp</span></button>
                  <button onClick={() => selectedLead.email && window.open(`mailto:${selectedLead.email}`)} className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-blue-400 transition-all group"><div className="bg-blue-100 text-blue-600 p-1.5 rounded-lg group-hover:bg-blue-500 group-hover:text-white transition-colors"><Mail size={13} /></div><span className="text-xs font-bold text-slate-700">Email</span></button>
                  <button onClick={() => selectedLead.phone && window.open(`tel:${selectedLead.phone}`)} className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-purple-400 transition-all group"><div className="bg-purple-100 text-purple-600 p-1.5 rounded-lg group-hover:bg-purple-500 group-hover:text-white transition-colors"><Phone size={13} /></div><span className="text-xs font-bold text-slate-700">Llamar</span></button>
                  <button onClick={() => handleDeleteLead(selectedLead)} className="flex items-center gap-2 p-3 bg-white border border-slate-200 rounded-xl hover:border-rose-400 transition-all group"><div className="bg-rose-100 text-rose-500 p-1.5 rounded-lg group-hover:bg-rose-500 group-hover:text-white transition-colors"><Trash2 size={13} /></div><span className="text-xs font-bold text-slate-700">Eliminar</span></button>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Historial</h4>
                <div className="space-y-3 border-l-2 border-slate-100 pl-4 ml-2">
                  <div className="relative">
                    <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-purple-400 border-2 border-white shadow" />
                    <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                      <p className="text-xs font-bold text-slate-700">Lead creado — {selectedLead.solicitud_tipo || 'Solicitud'}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{selectedLead.created_at ? new Date(selectedLead.created_at).toLocaleString('es-CO') : 'Fecha desconocida'}</p>
                    </div>
                  </div>
                  {selectedLead.updated_at && selectedLead.updated_at !== selectedLead.created_at && (
                    <div className="relative">
                      <div className="absolute -left-6 top-1 w-3 h-3 rounded-full bg-indigo-400 border-2 border-white shadow" />
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                        <p className="text-xs font-bold text-slate-700">Ultima actualizacion — {selectedLead.stage_name}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{new Date(selectedLead.updated_at).toLocaleString('es-CO')}</p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* MODAL NUEVO LEAD */}
      {showNewLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-5"><h2 className="text-xl font-black text-slate-800">Nuevo Lead</h2><button onClick={() => setShowNewLead(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button></div>
            <div className="space-y-4">
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Cliente *</label><select value={newLeadForm.customer_id} onChange={e => setNewLeadForm({ ...newLeadForm, customer_id: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white"><option value="">Selecciona un cliente...</option>{customers.map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Tipo de Solicitud</label><select value={newLeadForm.solicitud_tipo} onChange={e => setNewLeadForm({ ...newLeadForm, solicitud_tipo: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white">{SOLICITUD_TIPOS.map(o => <option key={o}>{o}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Etapa del Pipeline</label><select value={newLeadForm.pipeline_stage_id} onChange={e => setNewLeadForm({ ...newLeadForm, pipeline_stage_id: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white">{stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Valor estimado (COP)</label><input type="number" value={newLeadForm.lead_value} onChange={e => setNewLeadForm({ ...newLeadForm, lead_value: e.target.value })} placeholder="0" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500" /></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Origen</label><select value={newLeadForm.lead_source} onChange={e => setNewLeadForm({ ...newLeadForm, lead_source: e.target.value })} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 bg-white">{ORIGENES.map(o => <option key={o}>{o}</option>)}</select></div>
              <div><label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Descripcion</label><textarea value={newLeadForm.description} onChange={e => setNewLeadForm({ ...newLeadForm, description: e.target.value })} rows={3} placeholder="Detalla el requerimiento..." className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-purple-500 resize-none" /></div>
            </div>
            <div className="flex gap-3 mt-5"><button onClick={() => setShowNewLead(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">Cancelar</button><button onClick={handleCreateLead} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm shadow-md shadow-purple-200">Crear Lead</button></div>
          </div>
        </div>
      )}

      {/* MODAL EDITAR ETAPA */}
      {editingStage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-black text-slate-800">Editar etapa</h2><button onClick={() => setEditingStage(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button></div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Nombre</label>
            <input value={editStageName} onChange={e => setEditStageName(e.target.value)} className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 mb-5" />
            <div className="flex gap-3"><button onClick={() => handleDeleteStage(editingStage)} className="flex-1 py-2.5 border border-rose-200 text-rose-600 font-bold rounded-xl hover:bg-rose-50 text-sm flex items-center justify-center gap-2"><Trash2 size={13} /> Eliminar</button><button onClick={handleRenameStage} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm flex items-center justify-center gap-2"><Check size={13} /> Guardar</button></div>
          </div>
        </div>
      )}

      {/* MODAL NUEVA ETAPA */}
      {showAddStage && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-5"><h2 className="text-lg font-black text-slate-800">Nueva Etapa</h2><button onClick={() => setShowAddStage(false)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button></div>
            <label className="text-xs font-bold text-slate-500 uppercase block mb-1.5">Nombre</label>
            <input value={newStageName} onChange={e => setNewStageName(e.target.value)} placeholder="Ej: En negociacion" className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:outline-none focus:border-purple-500 mb-4" />
            <label className="text-xs font-bold text-slate-500 uppercase block mb-2">Color</label>
            <div className="flex gap-2 flex-wrap mb-5">{COLOR_OPTIONS.map(opt => (<button key={opt.color} onClick={() => setNewStageColor(opt)} className={`w-8 h-8 rounded-full border-2 transition-all ${newStageColor.color === opt.color ? 'border-slate-800 scale-110' : 'border-transparent'}`} style={{ backgroundColor: COLOR_HEX[opt.color] || '#94a3b8' }} />))}</div>
            <div className="flex gap-3"><button onClick={() => setShowAddStage(false)} className="flex-1 py-2.5 border border-slate-200 text-slate-600 font-bold rounded-xl hover:bg-slate-50 text-sm">Cancelar</button><button onClick={handleAddStage} className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-sm">Crear Etapa</button></div>
          </div>
        </div>
      )}

      {/* MODAL MOVER LEAD */}
      {movingLead && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex justify-between items-center mb-4"><h2 className="text-lg font-black text-slate-800">Mover a etapa</h2><button onClick={() => setMovingLead(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><X size={18} /></button></div>
            <p className="text-sm text-slate-500 mb-4">Lead: <span className="font-bold text-slate-800">{movingLead.client}</span></p>
            <div className="space-y-2">
              {stages.map(s => (
                <button key={s.id} onClick={() => handleMoveLead(movingLead, s.id)} className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${s.id === movingLead.pipeline_stage_id ? 'border-purple-400 bg-purple-50' : 'border-slate-200 hover:border-purple-300 hover:bg-purple-50/50'}`}>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={dotStyle(s.color)} />
                  <span className="text-sm font-bold text-slate-700">{s.name}</span>
                  {s.id === movingLead.pipeline_stage_id && <Check size={14} className="ml-auto text-purple-600" />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
