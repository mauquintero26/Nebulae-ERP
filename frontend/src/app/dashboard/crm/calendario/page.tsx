'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Phone, Mail, MessageCircle, FileText, CheckCircle2,
  Clock, AlertCircle, Search, Calendar,
  MoreVertical, Activity, RefreshCw, User,
  ChevronRight, DollarSign, Package
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers as any || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Error');
  return data.data ?? data;
}

const PIPELINE_LABELS: Record<string, string> = {
  DRAFT: 'Nuevo',
  PENDING: 'Solicitud Cliente',
  QUOTATION: 'Cotizacion',
  WON: 'Pedido de Venta',
  LOST: 'Perdido',
};

const PIPELINE_COLORS: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  DRAFT:     { bg: 'bg-slate-50',   text: 'text-slate-700',  border: 'border-slate-200', dot: 'bg-slate-400' },
  PENDING:   { bg: 'bg-blue-50',    text: 'text-blue-700',   border: 'border-blue-200',  dot: 'bg-blue-500' },
  QUOTATION: { bg: 'bg-amber-50',   text: 'text-amber-700',  border: 'border-amber-200', dot: 'bg-amber-500' },
  WON:       { bg: 'bg-emerald-50', text: 'text-emerald-700',border: 'border-emerald-200',dot: 'bg-emerald-500' },
  LOST:      { bg: 'bg-red-50',     text: 'text-red-700',    border: 'border-red-200',   dot: 'bg-red-500' },
};

function timeAgo(iso: string | null) {
  if (!iso) return 'Sin actividad';
  const diff = Date.now() - new Date(iso).getTime();
  const d = Math.floor(diff / 86400000);
  const h = Math.floor(diff / 3600000);
  if (d > 30) return `hace ${Math.floor(d/30)} mes(es)`;
  if (d > 0) return `hace ${d} dia(s)`;
  if (h > 0) return `hace ${h}h`;
  return 'Hace un momento';
}

function daysInStage(iso: string | null) {
  if (!iso) return 0;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

const SUB_MODULES = [
  { name: 'Tablero Kanban',  path: '/dashboard/crm' },
  { name: 'Seguimientos',    path: '/dashboard/crm/calendario' },
];

export default function SeguimientosPage() {
  const [leads, setLeads] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeStage, setActiveStage] = useState('all');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [l, s] = await Promise.all([
        apiFetch('/crm/leads?limit=200').catch(() => []),
        apiFetch('/crm/pipeline-stages').catch(() => []),
      ]);
      setLeads(Array.isArray(l) ? l : (l?.leads ?? []));
      setStages(Array.isArray(s) ? s : (s?.stages ?? []));
    } catch { setLeads([]); }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = leads.filter(l => {
    const ms = !search || JSON.stringify(l).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeStage === 'all') return true;
    return (l.pipeline_stage_id?.toString() === activeStage) || (l.status === activeStage);
  });

  const byStage = stages.reduce((acc: any, s: any) => {
    acc[s.id] = filtered.filter(l => l.pipeline_stage_id === s.id);
    return acc;
  }, {} as Record<string, any[]>);

  const urgentes = leads.filter(l => daysInStage(l.updated_at) > 7 && l.status !== 'WON' && l.status !== 'LOST');

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">CRM:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/crm/calendario'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700 border-transparent hover:border-purple-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert urgentes */}
      {urgentes.length > 0 && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-center gap-4">
          <AlertCircle className="text-amber-600 shrink-0" size={18} />
          <p className="text-xs font-bold text-amber-700 flex-1">
            {urgentes.length} lead(s) sin actividad por mas de 7 dias — riesgo de perder oportunidades
          </p>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-purple-100 text-purple-600 p-2 rounded-xl shadow-inner"><Phone size={24} /></div>
              Seguimientos CRM
            </h1>
            <p className="text-slate-500 mt-1 font-medium">Gestiona el pipeline de ventas por etapa — {leads.length} leads activos</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Link href="/dashboard/crm"
              className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
              Ir al Kanban
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stages.slice(0, 3).map((s: any) => {
            const count = leads.filter(l => l.pipeline_stage_id === s.id).length;
            return (
              <div key={s.id} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-sm cursor-pointer hover:border-purple-200 transition-all"
                onClick={() => setActiveStage(s.id.toString())}>
                <div className="w-3 h-3 rounded-full mb-3" style={{ backgroundColor: s.color || '#a855f7' }} />
                <p className="text-xs font-black text-slate-400 uppercase mb-1 truncate">{s.name}</p>
                <h2 className="text-3xl font-black text-slate-800">{count}</h2>
              </div>
            );
          })}
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden cursor-pointer"
            onClick={() => setActiveStage('all')}>
            <div className="absolute right-0 top-0 opacity-10"><Activity size={80} /></div>
            <p className="text-xs font-black text-purple-100 uppercase mb-1 relative z-10">Total Leads</p>
            <h2 className="text-3xl font-black relative z-10">{leads.length}</h2>
            <p className="text-xs font-bold text-purple-100 mt-1 relative z-10">{urgentes.length} urgentes</p>
          </div>
        </div>

        {/* Stage filter + Search */}
        <div className="flex gap-3 flex-wrap items-center">
          <button onClick={() => setActiveStage('all')}
            className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeStage === 'all' ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-600'}`}>
            Todos ({leads.length})
          </button>
          {stages.map((s: any) => {
            const count = leads.filter(l => l.pipeline_stage_id === s.id).length;
            return (
              <button key={s.id} onClick={() => setActiveStage(s.id.toString())}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeStage === s.id.toString() ? 'bg-purple-600 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:border-purple-200'}`}>
                {s.name} ({count})
              </button>
            );
          })}
          <div className="ml-auto flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-purple-400">
            <Search className="text-slate-400 mr-2" size={15} />
            <input type="text" value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar cliente, producto..."
              className="bg-transparent text-sm outline-none w-48 text-slate-700" />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex justify-center py-20">
            <RefreshCw size={28} className="animate-spin text-purple-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center shadow-sm">
            <Activity size={48} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-500 font-semibold">Sin leads en esta etapa</p>
            <Link href="/dashboard/crm"
              className="inline-flex items-center gap-2 mt-4 bg-purple-600 text-white px-5 py-2 rounded-xl font-bold text-sm hover:bg-purple-700">
              Ir al Kanban <ChevronRight size={14} />
            </Link>
          </div>
        ) : stages.length > 0 ? (
          /* Group by stage */
          <div className="space-y-6">
            {stages.map((stage: any) => {
              const stageLeads = filtered.filter(l => l.pipeline_stage_id === stage.id);
              if (stageLeads.length === 0 && activeStage !== 'all') return null;
              return (
                <div key={stage.id}>
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: stage.color || '#a855f7' }} />
                    <h3 className="font-extrabold text-slate-700 text-lg">{stage.name}</h3>
                    <span className="text-xs font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full">{stageLeads.length} leads</span>
                  </div>
                  {stageLeads.length === 0 ? (
                    <p className="text-sm text-slate-400 italic pl-6">Sin leads en esta etapa</p>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {stageLeads.map((lead: any) => {
                        const days = daysInStage(lead.updated_at);
                        const isUrgent = days > 7;
                        return (
                          <div key={lead.id} onClick={() => setSelected(selected?.id === lead.id ? null : lead)}
                            className={`bg-white rounded-2xl border shadow-sm p-5 cursor-pointer transition-all hover:shadow-md ${
                              selected?.id === lead.id ? 'border-purple-400 ring-2 ring-purple-100' : isUrgent ? 'border-amber-200' : 'border-slate-100'
                            }`}>
                            <div className="flex items-start justify-between mb-3">
                              <div>
                                <p className="font-extrabold text-slate-900">{lead.customer_name || lead.name || 'Sin nombre'}</p>
                                {lead.lead_product_name && (
                                  <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Package size={10}/> {lead.lead_product_name}</p>
                                )}
                              </div>
                              <div className="flex flex-col items-end gap-1">
                                {lead.lead_value > 0 && (
                                  <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
                                    {fCOP(lead.lead_value)}
                                  </span>
                                )}
                                {isUrgent && (
                                  <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                                    <AlertCircle size={10}/> {days}d sin actividad
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="space-y-1.5 text-xs text-slate-500">
                              {lead.description && (
                                <p className="line-clamp-2">{lead.description}</p>
                              )}
                              <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-50">
                                <span className="flex items-center gap-1 text-slate-400">
                                  <Clock size={11}/> {timeAgo(lead.updated_at)}
                                </span>
                                {lead.advisor_name && (
                                  <span className="flex items-center gap-1 text-slate-500 font-medium">
                                    <User size={11}/> {lead.advisor_name}
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Quick actions */}
                            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-50">
                              {lead.customer_phone && (
                                <a href={`tel:${lead.customer_phone}`}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-green-50 text-green-700 rounded-lg text-xs font-bold hover:bg-green-100" onClick={e => e.stopPropagation()}>
                                  <Phone size={11}/> Llamar
                                </a>
                              )}
                              {lead.customer_email && (
                                <a href={`mailto:${lead.customer_email}`}
                                  className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-xs font-bold hover:bg-blue-100" onClick={e => e.stopPropagation()}>
                                  <Mail size={11}/> Email
                                </a>
                              )}
                              <Link href="/dashboard/crm"
                                className="flex-1 flex items-center justify-center gap-1 py-1.5 bg-purple-50 text-purple-700 rounded-lg text-xs font-bold hover:bg-purple-100" onClick={e => e.stopPropagation()}>
                                <MoreVertical size={11}/> CRM
                              </Link>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          /* Fallback: simple list if no stages */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((lead: any) => (
              <div key={lead.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
                <p className="font-extrabold text-slate-900">{lead.customer_name || lead.name || 'Sin nombre'}</p>
                <p className="text-xs text-slate-400 mt-1">{timeAgo(lead.updated_at)}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
