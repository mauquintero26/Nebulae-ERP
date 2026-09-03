"use client";
import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { Target, Plus, ArrowLeft, RefreshCw, Megaphone, Users, DollarSign, TrendingUp, BarChart3, CheckCircle2, AlertCircle, X, Calendar, Globe, Mail, Phone, Tag, Send, Edit2, Trash2, Zap, PauseCircle, Play, ChevronRight, Filter, Search, Copy, ExternalLink } from 'lucide-react';

const API = process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1';
async function apiFetch(path: string, opts?: RequestInit) {
  const r = await fetch(API + path, { headers: { 'Content-Type': 'application/json' }, ...opts });
  if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.detail || r.statusText); }
  return r.json();
}
const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);
const fDate = (d: any) => d ? new Date(d).toLocaleDateString('es-CO', { month: 'short', day: 'numeric', year: 'numeric' }) : '-';

const ESTADO_COLORS: Record<string, string> = {
  BORRADOR: 'bg-slate-100 text-slate-600',
  PLANIFICADA: 'bg-blue-100 text-blue-700',
  ACTIVA: 'bg-emerald-100 text-emerald-700',
  PAUSADA: 'bg-amber-100 text-amber-700',
  FINALIZADA: 'bg-gray-100 text-gray-600',
};
const CANALES_DISPONIBLES = ['Meta Ads','Instagram','TikTok','WhatsApp','Email','Google Ads','LinkedIn','Físico','YouTube','SMS'];
const TIPOS_CAMPANA = ['OMNICANAL','EMAIL','META','TIKTOK','WHATSAPP','FISICA','GOOGLE'];

export default function CampanasPage() {
  const [campanas, setCampanas] = useState<any[]>([]);
  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [toast, setToast] = useState<{msg:string;type:string}|null>(null);
  // Form state para nueva/edición campaña
  const [form, setForm] = useState({ nombre:'', tipo:'OMNICANAL', estado:'BORRADOR', fecha_inicio:'', fecha_fin:'', presupuesto_cop:0, objetivo:'', canales:[] as string[], descripcion:'', codigo_descuento:'', descuento_pct:0 });
  const [editMode, setEditMode] = useState(false);
  // Leads tab
  const [leads, setLeads] = useState<any[]>([]);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ lead_name:'', lead_email:'', lead_phone:'', source_channel:'MANUAL', notas:'' });
  const [syncingLead, setSyncingLead] = useState<number|null>(null);

  const showToast = (msg: string, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };
  
  const loadCampanas = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/marketing/campanas?limit=200');
      setCampanas(d.data || []);
      if (d.data?.length && !selected) setSelected(d.data[0]);
    } catch { showToast('Error cargando campañas','error'); }
    setLoading(false);
  }, [selected]);
  
  const loadLeads = useCallback(async (cid: number) => {
    try { const d = await apiFetch(`/marketing/campanas/${cid}/leads`); setLeads(d.data || []); } catch {}
  }, []);
  
  useEffect(() => { loadCampanas(); }, [loadCampanas]);
  useEffect(() => { if (selected?.id && activeTab==='leads') loadLeads(selected.id); }, [selected, activeTab, loadLeads]);

  const saveCampana = async () => {
    try {
      if (editMode && selected?.id) {
        const d = await apiFetch(`/marketing/campanas/${selected.id}`, { method:'PATCH', body:JSON.stringify(form) });
        showToast('Campaña actualizada');
        setSelected(d.data);
      } else {
        const d = await apiFetch('/marketing/campanas', { method:'POST', body:JSON.stringify(form) });
        showToast(`Campaña creada: ${d.data.numero}`);
        setSelected(d.data);
      }
      setShowForm(false); setEditMode(false);
      loadCampanas();
    } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const launchCampana = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/launch`, {method:'POST'}); showToast('Campaña lanzada!'); loadCampanas(); setSelected((s:any)=>({...s, estado:'ACTIVA'})); } 
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const pauseCampana = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/pause`, {method:'POST'}); showToast('Campaña pausada'); loadCampanas(); setSelected((s:any)=>({...s, estado:'PAUSADA'})); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const deleteCampana = async (id:number) => {
    if (!confirm('¿Eliminar esta campaña?')) return;
    try { await apiFetch(`/marketing/campanas/${id}`, {method:'DELETE'}); showToast('Campaña eliminada'); loadCampanas(); if(selected?.id===id) setSelected(null); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const addLead = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/leads`, {method:'POST', body:JSON.stringify(leadForm)}); showToast('Lead agregado'); setShowLeadForm(false); setLeadForm({lead_name:'',lead_email:'',lead_phone:'',source_channel:'MANUAL',notas:''}); loadLeads(selected.id); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const syncLeadToCRM = async (lead_id:number) => {
    setSyncingLead(lead_id);
    try { const d = await apiFetch('/marketing/leads/crm-sync', {method:'POST', body:JSON.stringify({lead_id})}); showToast(`Lead sincronizado al CRM (ID: ${d.data.crm_lead_id})`); loadLeads(selected.id); }
    catch(e:any) { showToast(e.message,'error'); }
    setSyncingLead(null);
  };
  
  const filtered = useMemo(() => campanas.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()) && !(c.numero||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [campanas, search, filtroEstado]);

  return (
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
      {/* Toast */}
      {toast && (<div className={`fixed bottom-6 right-6 z-50 px-5 py-3 rounded-2xl shadow-xl text-white text-sm font-semibold flex items-center gap-2 ${toast.type==='ok'?'bg-emerald-600':'bg-red-600'}`}>{toast.type==='ok'?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>}{toast.msg}</div>)}
      
      {/* HEADER */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0 shadow-sm">
        <div>
          <Link href="/dashboard/marketing" className="inline-flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600 mb-1"><ArrowLeft size={12}/> Marketing</Link>
          <h1 className="text-2xl font-black text-slate-800 flex items-center gap-2"><Target className="text-emerald-600" size={22}/> Campañas de Mercadeo</h1>
          <p className="text-xs text-slate-400 mt-0.5">Crea, planifica y lanza campañas en todos los canales · Numeración MKT-YYYY####</p>
        </div>
        <div className="flex gap-2">
          <button onClick={loadCampanas} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm">
            <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
          </button>
          <button onClick={()=>{setForm({nombre:'',tipo:'OMNICANAL',estado:'BORRADOR',fecha_inicio:'',fecha_fin:'',presupuesto_cop:0,objetivo:'',canales:[],descripcion:'',codigo_descuento:'',descuento_pct:0});setEditMode(false);setShowForm(true);}} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm shadow-sm">
            <Plus size={15}/> Nueva Campaña
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex overflow-hidden">
        {/* COLUMNA IZQUIERDA — Lista de campañas */}
        <div className="w-72 shrink-0 bg-white border-r border-slate-200 flex flex-col">
          {/* Search row */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar campaña..." className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-200"/>
            </div>
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
              <option value="">Todos los estados</option>
              {Object.keys(ESTADO_COLORS).map(e=><option key={e}>{e}</option>)}
            </select>
          </div>
          {/* List */}
          <div className="flex-1 overflow-y-auto">
            {loading && <div className="text-center py-10 text-slate-400 text-sm">Cargando...</div>}
            {!loading && filtered.length===0 && <div className="text-center py-10 text-slate-400 text-sm">Sin campañas</div>}
            {filtered.map(c=>(
              <div key={c.id} onClick={()=>setSelected(c)} className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-emerald-50/30 transition-colors ${selected?.id===c.id?'bg-emerald-50 border-l-2 border-l-emerald-600':''}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="font-black text-slate-800 text-sm leading-tight">{c.nombre}</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{c.numero}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ESTADO_COLORS[c.estado]||'bg-gray-100 text-gray-500'}`}>{c.estado}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {(c.canales||[]).slice(0,3).map((ch:string)=>(<span key={ch} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{ch}</span>))}
                  {(c.canales||[]).length>3 && <span className="text-[9px] text-slate-400">+{(c.canales||[]).length-3}</span>}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                  <span>{c.leads_count||0} leads</span>
                  <span className="font-bold text-emerald-600">{fCOP(c.ventas_cop||0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* PANEL CENTRAL — Detalle */}
        {selected ? (
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Campaña Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-xl font-black text-slate-800">{selected.nombre}</h2>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${ESTADO_COLORS[selected.estado]||''}`}>{selected.estado}</span>
                </div>
                <p className="text-xs text-slate-400">{selected.numero} · {(selected.canales||[]).join(', ') || 'Sin canales'}</p>
              </div>
              <div className="flex gap-2">
                {selected.estado==='BORRADOR'||selected.estado==='PLANIFICADA' ? (
                  <button onClick={launchCampana} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm">
                    <Play size={14}/> Lanzar
                  </button>
                ) : selected.estado==='ACTIVA' ? (
                  <button onClick={pauseCampana} className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm">
                    <PauseCircle size={14}/> Pausar
                  </button>
                ) : null}
                <button onClick={()=>{setForm({nombre:selected.nombre,tipo:selected.tipo||'OMNICANAL',estado:selected.estado,fecha_inicio:selected.fecha_inicio?.split('T')[0]||'',fecha_fin:selected.fecha_fin?.split('T')[0]||'',presupuesto_cop:selected.presupuesto_cop||0,objetivo:selected.objetivo||'',canales:selected.canales||[],descripcion:selected.descripcion||'',codigo_descuento:selected.codigo_descuento||'',descuento_pct:selected.descuento_pct||0});setEditMode(true);setShowForm(true);}} className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50">
                  <Edit2 size={13}/>
                </button>
                <button onClick={()=>deleteCampana(selected.id)} className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-red-50 text-red-500">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="bg-white border-b border-slate-100 px-6 flex gap-1">
              {[['resumen','Resumen'],['leads','Leads'],['metricas','Métricas'],['descuentos','Descuentos']].map(([v,l])=>(
                <button key={v} onClick={()=>setActiveTab(v)} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab===v?'border-emerald-600 text-emerald-600':'border-transparent text-slate-400 hover:text-slate-700'}`}>{l}</button>
              ))}
            </div>
            
            {/* Tab Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* RESUMEN TAB */}
              {activeTab==='resumen' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide">Información General</h3>
                      {[['Tipo',selected.tipo],['Fecha Inicio',fDate(selected.fecha_inicio)],['Fecha Fin',fDate(selected.fecha_fin)],['Presupuesto',fCOP(selected.presupuesto_cop||0)]].map(([l,v])=>(
                        <div key={l} className="flex justify-between text-sm"><span className="text-slate-400 font-medium">{l}</span><span className="font-bold text-slate-800">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-4">Canales</h3>
                      <div className="flex flex-wrap gap-2">
                        {(selected.canales||[]).map((ch:string)=>(
                          <span key={ch} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs rounded-xl">{ch}</span>
                        ))}
                        {!(selected.canales||[]).length && <p className="text-slate-400 text-sm">Sin canales definidos</p>}
                      </div>
                    </div>
                  </div>
                  {selected.objetivo && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-2">Objetivo</h3>
                      <p className="text-slate-600 text-sm leading-relaxed">{selected.objetivo}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* LEADS TAB */}
              {activeTab==='leads' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-500">{leads.length} leads en esta campaña</p>
                    <button onClick={()=>setShowLeadForm(!showLeadForm)} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
                      <Plus size={14}/> Agregar Lead
                    </button>
                  </div>
                  {showLeadForm && (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
                      <h4 className="font-black text-slate-700">Nuevo Lead</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {[['lead_name','Nombre *','text'],['lead_email','Email','email'],['lead_phone','Teléfono','tel']].map(([k,l,t])=>(
                          <div key={k}><label className="block text-xs font-bold text-slate-500 mb-1">{l}</label><input type={t} value={(leadForm as any)[k]} onChange={e=>setLeadForm(f=>({...f,[k]:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                        ))}
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Canal</label><select value={leadForm.source_channel} onChange={e=>setLeadForm(f=>({...f,source_channel:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{['MANUAL','INSTAGRAM','WHATSAPP','EMAIL','META','TIKTOK','WEB'].map(c=><option key={c}>{c}</option>)}</select></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addLead} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">Guardar Lead</button>
                        <button onClick={()=>setShowLeadForm(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}
                  <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                    <table className="w-full text-sm">
                      <thead><tr className="bg-slate-50 border-b border-slate-100">{['Nombre','Email','Canal','Estado','Venta','CRM','Acción'].map(h=><th key={h} className="text-left px-4 py-2.5 text-xs font-black text-slate-400 uppercase">{h}</th>)}</tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {leads.length===0 && <tr><td colSpan={7} className="text-center py-8 text-slate-400 text-sm">Sin leads en esta campaña</td></tr>}
                        {leads.map((l:any)=>(
                          <tr key={l.id} className="hover:bg-slate-50/80">
                            <td className="px-4 py-3 font-semibold text-slate-800 text-xs">{l.lead_name||'-'}</td>
                            <td className="px-4 py-3 text-xs text-slate-500">{l.lead_email||'-'}</td>
                            <td className="px-4 py-3"><span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">{l.source_channel}</span></td>
                            <td className="px-4 py-3"><span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${l.estado==='CONVERTIDO'?'bg-emerald-100 text-emerald-700':l.estado==='PERDIDO'?'bg-red-100 text-red-600':'bg-blue-100 text-blue-700'}`}>{l.estado}</span></td>
                            <td className="px-4 py-3 text-xs font-bold text-emerald-600">{l.venta_atribuida_cop>0?fCOP(l.venta_atribuida_cop):'-'}</td>
                            <td className="px-4 py-3">{l.crm_lead_id?<span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={10}/>CRM #{l.crm_lead_id}</span>:<span className="text-[10px] text-slate-400">No sync</span>}</td>
                            <td className="px-4 py-3">
                              {!l.crm_lead_id && <button onClick={()=>syncLeadToCRM(l.id)} disabled={syncingLead===l.id} className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50">Sync CRM</button>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              
              {/* MÉTRICAS TAB */}
              {activeTab==='metricas' && (
                <div className="space-y-5">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[
                      {l:'Leads Totales',v:selected.leads_count||0,icon:<Users size={18}/>,color:'bg-blue-50 text-blue-700'},
                      {l:'Convertidos',v:leads.filter((l:any)=>l.estado==='CONVERTIDO').length,icon:<CheckCircle2 size={18}/>,color:'bg-emerald-50 text-emerald-700'},
                      {l:'Ventas Atribuidas',v:fCOP(selected.ventas_cop||0),icon:<DollarSign size={18}/>,color:'bg-purple-50 text-purple-700'},
                      {l:'ROI',v:selected.presupuesto_cop>0?`+${(((selected.ventas_cop||0)/selected.presupuesto_cop)*100-100).toFixed(0)}%`:'N/A',icon:<TrendingUp size={18}/>,color:'bg-amber-50 text-amber-700'},
                    ].map((k,i)=>(
                      <div key={i} className="bg-white rounded-2xl border border-slate-200 p-5">
                        <div className={`inline-flex p-2 rounded-xl mb-3 ${k.color}`}>{k.icon}</div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-1">{k.l}</p>
                        <p className="text-2xl font-black text-slate-900">{k.v}</p>
                      </div>
                    ))}
                  </div>
                  {/* Presupuesto progress */}
                  {selected.presupuesto_cop>0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-bold text-slate-700">Progreso del Presupuesto</span>
                        <span className="text-sm font-black text-emerald-600">{fCOP(selected.ventas_cop||0)} / {fCOP(selected.presupuesto_cop)}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        <div className="bg-emerald-500 h-3 rounded-full" style={{width:`${Math.min(100,((selected.ventas_cop||0)/selected.presupuesto_cop)*100)}%`}}/>
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* DESCUENTOS TAB */}
              {activeTab==='descuentos' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Tag size={18} className="text-emerald-600"/>Código de Descuento</h3>
                    {selected.codigo_descuento ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                          <div>
                            <p className="text-xs font-black text-emerald-500 uppercase mb-1">Código activo</p>
                            <p className="text-3xl font-black text-emerald-800 tracking-widest">{selected.codigo_descuento}</p>
                            <p className="text-sm font-bold text-emerald-600 mt-1">{selected.descuento_pct}% de descuento</p>
                          </div>
                          <button onClick={()=>navigator.clipboard.writeText(selected.codigo_descuento)} className="ml-auto p-2 bg-white border border-emerald-200 rounded-xl hover:bg-emerald-100">
                            <Copy size={16} className="text-emerald-600"/>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">Sin código de descuento configurado para esta campaña. Edita la campaña para agregar uno.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Target size={48} className="mx-auto mb-4 opacity-20"/>
              <p className="font-bold">Selecciona una campaña</p>
              <p className="text-sm mt-1">o crea una nueva con el botón superior</p>
            </div>
          </div>
        )}
      </div>
      
      {/* MODAL / PANEL FORMULARIO */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-xl font-black text-slate-800">{editMode?'Editar Campaña':'Nueva Campaña'}</h2>
              <button onClick={()=>setShowForm(false)}><X size={20} className="text-slate-400"/></button>
            </div>
            <div className="p-6 space-y-5">
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre *</label><input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200" placeholder="Ej. Black Friday 2026"/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo</label><select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{TIPOS_CAMPANA.map(t=><option key={t}>{t}</option>)}</select></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Estado</label><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{Object.keys(ESTADO_COLORS).map(e=><option key={e}>{e}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Fecha Inicio</label><input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Fecha Fin</label><input type="date" value={form.fecha_fin} onChange={e=>setForm(f=>({...f,fecha_fin:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              </div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Presupuesto COP</label><input type="number" value={form.presupuesto_cop} onChange={e=>setForm(f=>({...f,presupuesto_cop:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Objetivo</label><textarea value={form.objetivo} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 resize-none" placeholder="Ej. Generar 500 leads calificados a través de redes sociales en noviembre"/></div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Canales</label><div className="flex flex-wrap gap-2">{CANALES_DISPONIBLES.map(c=>(<button key={c} type="button" onClick={()=>setForm(f=>({...f,canales:f.canales.includes(c)?f.canales.filter(x=>x!==c):[...f.canales,c]}))} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.canales.includes(c)?'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'}`}>{c}</button>))}</div></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Código Descuento</label><input value={form.codigo_descuento} onChange={e=>setForm(f=>({...f,codigo_descuento:e.target.value.toUpperCase()}))} placeholder="BF2026" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 font-mono"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Descuento %</label><input type="number" min="0" max="100" value={form.descuento_pct} onChange={e=>setForm(f=>({...f,descuento_pct:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              </div>
            </div>
            <div className="p-6 border-t border-slate-100 flex gap-3">
              <button onClick={saveCampana} className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm">{editMode?'Guardar Cambios':'Crear Campaña'}</button>
              <button onClick={()=>setShowForm(false)} className="px-6 py-3 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl font-bold text-sm">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
