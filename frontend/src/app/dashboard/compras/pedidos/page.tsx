'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag, Package, Truck, CheckCircle2, AlertTriangle, Activity,
  Search, MoreHorizontal, RefreshCw, Filter, X, Trash2, Edit2, Send,
  TrendingUp, DollarSign, Calendar, MessageSquare, AlertCircle, ChevronRight,
  ChevronUp, Plus, Eye, ShoppingCart, FileText, LayoutGrid, List,
  Bell, Receipt, Clock, MapPin, ArrowRight, Save, ChevronDown,
  ExternalLink, RotateCcw, Layers, Tag, Hash, UserPlus
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
async function apiFetch(path: string, opts: any = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(API_BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const fCOP  = (v: any) => { const n = Number(v)||0; return n > 0 ? '$'+n.toLocaleString('es-CO') : '-'; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fMonthKey = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{year:'numeric',month:'long'}) : 'Sin fecha';

const PEC_ESTADOS: Record<string,{bg:string;text:string;border:string;label:string}> = {
  BORRADOR:          {bg:'bg-slate-100',   text:'text-slate-700',   border:'border-slate-200',   label:'Borrador'},
  EMITIDO:           {bg:'bg-amber-100',   text:'text-amber-800',   border:'border-amber-200',   label:'Emitido'},
  ENVIADO:           {bg:'bg-blue-100',    text:'text-blue-800',    border:'border-blue-200',    label:'Enviado'},
  EN_TRANSITO:       {bg:'bg-indigo-100',  text:'text-indigo-800',  border:'border-indigo-200',  label:'En Transito'},
  PENDIENTE_ENTREGA: {bg:'bg-orange-100',  text:'text-orange-800',  border:'border-orange-200',  label:'Pend. Entrega'},
  RECIBIDO:          {bg:'bg-emerald-100', text:'text-emerald-800', border:'border-emerald-200', label:'Recibido'},
  COMPLETADO:        {bg:'bg-green-100',   text:'text-green-800',   border:'border-green-200',   label:'Completado'},
  CANCELADO:         {bg:'bg-red-100',     text:'text-red-700',     border:'border-red-200',     label:'Cancelado'},
};

const TRACKING_STAGES_CASILLERO = [
  {stage:'PROVEEDOR_CASILLERO', label:'Proveedor → Casillero', icon:'📦'},
  {stage:'CASILLERO_NEBULAE',   label:'Casillero → Nebulae',   icon:'✈️'},
  {stage:'PENDIENTE_RECEPCION', label:'Pendiente Recepcion',   icon:'🏭'},
];
const TRACKING_STAGES_DIRECTO = [
  {stage:'PROVEEDOR_COLOMBIA',  label:'Proveedor → Colombia',  icon:'🚚'},
  {stage:'PENDIENTE_RECEPCION', label:'Pendiente Recepcion',   icon:'🏭'},
];

const SUB_MODULES = [
  {name:'Lista de Compras',      path:'/dashboard/compras/lista-compras'},
  {name:'Pedidos de Compra',     path:'/dashboard/compras/pedidos'},
  {name:'Mercancia en Transito', path:'/dashboard/compras/transito'},
  {name:'Recepciones (Entrada)', path:'/dashboard/compras/recepciones'},
  {name:'Traslados Internos',    path:'/dashboard/compras/traslados'},
  {name:'Registro OCR/Manual',   path:'/dashboard/compras/registro'},
  {name:'Proyecciones',          path:'/dashboard/compras/proyecciones'},
];

function Toast({msg,type,onClose}: {msg:string;type:string;onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,4000);return()=>clearTimeout(t);},[onClose]);
  return (
    <div className={'fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ' + (type==='ok'?'bg-emerald-600':'bg-red-600') + ' text-white'}>
      <span>{msg}</span><button onClick={onClose}><X size={16}/></button>
    </div>
  );
}

/* ================================================================
   NUEVO PROVEEDOR MODAL
   ================================================================ */
function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({name:'',reference:'',contact_name:'',phone:'',email:'',address:'',city:'',country:'Colombia',payment_terms:'',notes:''});
  const [saving, setSaving] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { const d = await apiFetch('/compras/proveedores',{method:'POST',body:JSON.stringify(form)}); onSave(d); }
    catch(err:any) { alert('Error: '+err.message); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-purple-50 rounded-t-3xl">
          <div><h3 className="font-black text-gray-900 text-lg">Nuevo Proveedor</h3><p className="text-xs text-gray-500 mt-0.5">Agregar a la agenda de proveedores</p></div>
          <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Referencia / NIT</label><input value={form.reference} onChange={e=>set('reference',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Telefono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Email</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Terminos de Pago</label><input value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<UserPlus size={14}/>} Agregar Proveedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   TRACKING PANEL — Barra interactiva de tracking
   ================================================================ */
function TrackingPanel({pec, onUpdate, onToast}: {pec:any; onUpdate:()=>void; onToast:(m:string,t?:string)=>void}) {
  const [updating, setUpdating] = useState<string|null>(null);
  const [editStage, setEditStage] = useState<string|null>(null);
  const [guia, setGuia] = useState('');
  const [notas, setNotas] = useState('');

  const stages: any[] = pec.tracking_stages || [];
  const tipoEnvio = pec.tipo_envio || 'casillero';
  const templateStages = tipoEnvio === 'directo' ? TRACKING_STAGES_DIRECTO : TRACKING_STAGES_CASILLERO;

  async function updateStage(stageName: string, status: string, trackingNum?: string) {
    setUpdating(stageName);
    try {
      await apiFetch('/compras/pedidos/' + pec.id + '/tracking', {
        method: 'PATCH',
        body: JSON.stringify({stage: stageName, status, tracking_number: trackingNum || undefined, notes: notas || undefined, user_name: localStorage.getItem('user_name') || ''})
      });
      onToast('Etapa actualizada', 'ok');
      onUpdate();
      setEditStage(null);
      setGuia('');
      setNotas('');
    } catch(e:any) { onToast(e.message, 'error'); }
    setUpdating(null);
  }

  const getStageData = (stageName: string) => stages.find((s:any) => s.stage === stageName) || {};

  const stageColor = (status: string) => {
    if (status === 'COMPLETADO') return 'bg-emerald-500 border-emerald-500';
    if (status === 'EN_PROCESO') return 'bg-blue-500 border-blue-500';
    return 'bg-gray-200 border-gray-300';
  };

  return (
    <div className="space-y-3">
      {/* Visual progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {templateStages.map((ts,i) => {
          const sd = getStageData(ts.stage);
          const status = sd.status || 'PENDIENTE';
          return (
            <React.Fragment key={ts.stage}>
              <div className="flex flex-col items-center flex-1">
                <div className={'w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ' + stageColor(status)}>
                  {status === 'COMPLETADO' ? <CheckCircle2 size={18} className="text-white"/> :
                   status === 'EN_PROCESO' ? <Clock size={18} className="text-white"/> :
                   <span className="text-gray-400 text-sm">{i+1}</span>}
                </div>
                <p className="text-[10px] text-center text-gray-500 mt-1 max-w-[70px] leading-tight">{ts.label}</p>
                {sd.tracking_number && <p className="text-[9px] text-indigo-600 font-bold mt-0.5 max-w-[70px] truncate">{sd.tracking_number}</p>}
              </div>
              {i < templateStages.length - 1 && (
                <div className={'flex-none h-0.5 w-8 mt-[-24px] ' + (getStageData(templateStages[i+1].stage).status !== 'PENDIENTE' ? 'bg-emerald-400' : 'bg-gray-200')}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Stage cards */}
      {templateStages.map((ts) => {
        const sd = getStageData(ts.stage);
        const status = sd.status || 'PENDIENTE';
        const history: any[] = sd.tracking_history || [];
        const isEditing = editStage === ts.stage;
        return (
          <div key={ts.stage} className={'rounded-2xl border p-4 transition-all ' + (status==='COMPLETADO'?'border-emerald-200 bg-emerald-50':status==='EN_PROCESO'?'border-blue-200 bg-blue-50':'border-gray-200 bg-white')}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-lg">{ts.icon}</span>
                <div>
                  <p className="font-bold text-sm text-gray-900">{ts.label}</p>
                  {sd.timestamp && <p className="text-[10px] text-gray-400">{fDate(sd.timestamp)}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className={'text-xs font-black px-2 py-1 rounded-full ' + (status==='COMPLETADO'?'bg-emerald-100 text-emerald-700':status==='EN_PROCESO'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-500')}>{status}</span>
                <button onClick={()=>{setEditStage(isEditing?null:ts.stage);setGuia(sd.tracking_number||'');setNotas(sd.notes||'');}} className="p-1.5 hover:bg-white rounded-lg border border-gray-200 text-gray-500"><Edit2 size={12}/></button>
              </div>
            </div>

            {/* Edit form */}
            {isEditing && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Numero de Guia / Tracking</label>
                  <input value={guia} onChange={e=>setGuia(e.target.value)} placeholder="ej: 1Z999AA1234567890" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Notas</label>
                  <input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Notas de esta etapa..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {status !== 'EN_PROCESO' && <button onClick={()=>updateStage(ts.stage,'EN_PROCESO',guia||undefined)} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><Clock size={12}/> Marcar En Proceso</button>}
                  {status !== 'COMPLETADO' && <button onClick={()=>updateStage(ts.stage,'COMPLETADO',guia||undefined)} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><CheckCircle2 size={12}/> Marcar Completado</button>}
                  {status !== 'PENDIENTE' && <button onClick={()=>updateStage(ts.stage,'PENDIENTE')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold disabled:opacity-50"><RotateCcw size={12}/> Revertir</button>}
                </div>
              </div>
            )}

            {/* Tracking history */}
            {history.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Historial de guias:</p>
                {history.map((h:any,i:number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="text-indigo-600 font-bold">{h.numero}</span>
                    <span className="text-gray-300">·</span>
                    <span>{fDate(h.fecha)}</span>
                    {h.notas && <span className="text-gray-400 italic truncate">"{h.notas}"</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   PEC DETAIL PANEL — full-width slide-over (left: 240px)
   ================================================================ */
function PecDetailPanel({pec, onClose, onUpdate, onToast}: {pec:any; onClose:()=>void; onUpdate:()=>void; onToast:(m:string,t?:string)=>void}) {
  const [detail, setDetail] = useState<any>(pec);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('tracking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editEstado, setEditEstado] = useState(false);

  useEffect(()=>{setDetail(pec);setTab('tracking');},[pec?.id]);

  const loadFull = async () => {
    if (!pec) return;
    setLoading(true);
    try { const d = await apiFetch('/compras/pedidos/'+pec.id); setDetail(d); }
    catch(e:any) { onToast(e.message,'error'); }
    finally { setLoading(false); }
  };
  useEffect(()=>{ if(pec) loadFull(); },[pec?.id]);

  const changeEstado = async (est: string) => {
    try {
      await apiFetch('/compras/pedidos/'+pec.id,{method:'PATCH',body:JSON.stringify({estado:est,updated_by:localStorage.getItem('user_name')||''})});
      onToast('Estado actualizado','ok'); onUpdate(); loadFull();
    } catch(e:any){ onToast(e.message,'error'); }
    setEditEstado(false);
  };

  const cancelPec = async () => {
    if (!confirm('Cancelar este PEC?')) return;
    await changeEstado('CANCELADO');
    onClose();
  };

  if (!pec) return null;
  const est = PEC_ESTADOS[detail?.estado] || PEC_ESTADOS.BORRADOR;
  const pvens = (detail?.ven_numero||'').split(',').map((s:string)=>s.trim()).filter(Boolean);

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left:'240px'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-black text-gray-900">{detail?.numero || pec.numero}</h2>
                <span className={'px-2.5 py-1 rounded-full text-xs font-black border ' + est.bg + ' ' + est.text + ' ' + est.border}>{est.label}</span>
                {pec.is_overdue && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-black border border-red-200">VENCIDO</span>}
                {pvens.map((v:string,i:number)=><span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">{v}</span>)}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{detail?.supplier_name||'-'} {detail?.created_by && '· '+detail.created_by}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={()=>setEditEstado(x=>!x)} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100"><Edit2 size={12}/> Estado</button>
            <div className="relative">
              <button onClick={()=>setMenuOpen(m=>!m)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><MoreHorizontal size={18}/></button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-10" onClick={(e:any)=>e.stopPropagation()}>
                  <button onClick={()=>{setMenuOpen(false);loadFull();}} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2"><RefreshCw size={13}/> Recargar</button>
                  <div className="border-t border-gray-100 my-1"/>
                  <button onClick={()=>{cancelPec();setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar PEC</button>
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl text-gray-500"><X size={18}/></button>
          </div>
        </div>

        {/* Cambiar estado inline */}
        {editEstado && (
          <div className="px-8 py-3 border-b border-purple-100 bg-purple-50/50 flex flex-wrap gap-2 shrink-0">
            {Object.entries(PEC_ESTADOS).map(([k,v])=>(
              <button key={k} onClick={()=>changeEstado(k)} className={'px-3 py-1.5 rounded-xl text-xs font-bold border transition-all ' + (detail?.estado===k?v.bg+' '+v.text+' '+v.border+' shadow':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>{v.label}</button>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-8 py-2 border-b border-gray-100 shrink-0">
          {[{k:'tracking',l:'Tracking'},{k:'productos',l:'Productos'},{k:'pvens',l:'Pedidos Venta'},{k:'info',l:'Info'},{k:'actividad',l:'Actividad'}].map(({k,l})=>(
            <button key={k} onClick={()=>setTab(k)} className={'px-3 py-1.5 rounded-lg text-sm font-bold transition-all ' + (tab===k?'bg-purple-600 text-white shadow':'text-gray-600 hover:bg-purple-50 hover:text-purple-700')}>{l}</button>
          ))}
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT 45% — Info */}
          <div className="w-[45%] border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto space-y-4 shrink-0">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Proveedor</p>
              <p className="font-bold text-gray-900">{detail?.supplier_name||'-'}</p>
              {detail?.supplier_ref && <p className="text-xs text-gray-400 mt-0.5">Ref: {detail.supplier_ref}</p>}
              {detail?.tipo_envio && <p className="text-xs text-purple-600 font-bold mt-1 capitalize">Tipo: {detail.tipo_envio === 'directo' ? 'Directo Colombia' : 'Via Casillero'}</p>}
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Fechas</p>
              <div className="space-y-2 text-sm">
                {[['Fecha Compra',fDate(detail?.fecha_compra||detail?.created_at)],
                  ['Entrega Est.',fDate(detail?.fecha_entrega_estimada)],
                  ['Alerta',fDate(detail?.fecha_alerta)]].map(([l,v],i)=>(
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-500">{l}</span>
                    <span className={'font-bold ' + (l==='Entrega Est.'&&pec.is_overdue?'text-red-600':'text-gray-900')}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Montos</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-1 border-b"><span className="text-gray-500">Subtotal</span><span className="font-bold">{fCOP(detail?.subtotal_cop)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-500">Total COP</span><span className="font-black text-gray-900 text-base">{fCOP(detail?.total_cop)}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Logistica</p>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                {[['Modalidad',detail?.modalidad_pago||'-'],['Carrier',detail?.carrier||'-'],['Casillero',detail?.casillero||'-'],['Tracking',detail?.tracking_number||'-']].map(([l,v],i)=>(
                  <div key={i}><span className="block text-gray-400 font-black uppercase mb-0.5">{l}</span>{v}</div>
                ))}
              </div>
            </div>
            {detail?.notas && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-black text-amber-700 uppercase mb-1">Notas</p>
                <p className="text-sm text-amber-900">{detail.notas}</p>
              </div>
            )}
          </div>

          {/* RIGHT 55% */}
          <div className="w-[55%] p-6 overflow-y-auto">
            {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"/></div>}

            {!loading && tab === 'tracking' && (
              <TrackingPanel pec={detail||pec} onUpdate={()=>{loadFull();onUpdate();}} onToast={onToast}/>
            )}

            {!loading && tab === 'productos' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100"><p className="text-xs font-black text-gray-400 uppercase">Productos del PEC</p></div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 font-black uppercase border-b">
                    <tr><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detail?.productos||[]).map((p:any,i:number)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium truncate max-w-[160px]">{p.producto_nombre||p.descripcion||p.nombre||'-'}</td>
                        <td className="px-4 py-3 text-center font-bold">{p.qty||p.cantidad||0}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{fCOP(p.unit_price_cop||p.precio_unitario||0)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fCOP((p.qty||p.cantidad||0)*(p.unit_price_cop||p.precio_unitario||0))}</td>
                      </tr>
                    ))}
                    {!(detail?.productos?.length) && <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-xs">Sin productos</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && tab === 'pvens' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-black text-gray-400 uppercase mb-4">Pedidos de Venta Asociados</p>
                {pvens.length === 0 ? (
                  <p className="text-gray-400 text-sm text-center py-6">Sin PVEN asociados</p>
                ) : pvens.map((v:string,i:number)=>(
                  <div key={i} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100 mb-2">
                    <span className="font-bold text-indigo-700">{v}</span>
                    <Link href="/dashboard/ventas" className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold"><ExternalLink size={11}/> Ver</Link>
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === 'info' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-black text-gray-400 uppercase mb-4">Informacion del PEC</p>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    {[['Numero',detail?.numero],['Estado',detail?.estado],['Modalidad Pago',detail?.modalidad_pago||'-'],['Metodo Pago',detail?.metodo_pago||'-'],['Creado por',detail?.created_by||'-'],['Actualizado',fDate(detail?.updated_at)]].map(([l,v],i)=>(
                      <div key={i}><span className="block text-gray-400 text-xs font-black uppercase mb-0.5">{l}</span><span className="font-bold text-gray-900">{v||'-'}</span></div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!loading && tab === 'actividad' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase mb-4">Historial de Actividad</p>
                <div className="relative border-l-2 border-gray-100 ml-4 pl-6 pb-2">
                  {(detail?.actividades||[]).map((a:any,i:number)=>(
                    <div key={i} className="mb-4 relative">
                      <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-purple-200"/>
                      <p className="text-xs text-gray-400 mb-0.5">{fDate(a.created_at)}{a.user_name&&' · '+a.user_name}</p>
                      <p className="font-bold text-gray-700 text-sm">{a.description||a.action}</p>
                      {a.old_estado&&a.new_estado&&<p className="text-xs text-gray-400">{a.old_estado} → {a.new_estado}</p>}
                    </div>
                  ))}
                  {!(detail?.actividades?.length)&&<p className="text-gray-400 text-xs py-4 text-center">Sin historial registrado</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   NUEVO PEC MODAL — Odoo-style full form
   ================================================================ */
function NuevoPecModal({pedidosVenta, onClose, onCreated, onToast}: {pedidosVenta:any[]; onClose:()=>void; onCreated:()=>void; onToast:(m:string,t?:string)=>void}) {
  const [supplierSearch, setSupplierSearch] = useState('');
  const [supplierResults, setSupplierResults] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierTimer, setSupplierTimer] = useState<any>(null);
  const [form, setForm] = useState({
    modalidad_pago:'Contado', metodo_pago:'', tipo_envio:'casillero', casillero:'',
    fecha_entrega_estimada:'', notas:'', carrier:'', dias_entrega:15,
    subtotal_cop:0, total_cop:0,
  });
  const [productos, setProductos] = useState<any[]>([]);
  const [selectedPvens, setSelectedPvens] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [modalTab, setModalTab] = useState('info');
  const [searchPven, setSearchPven] = useState('');

  const setF = (k:string, v:any) => setForm(f=>({...f,[k]:v}));

  const onSupplierType = (val: string) => {
    setSupplierSearch(val);
    setSelectedSupplier(null);
    clearTimeout(supplierTimer);
    if (!val.trim()) { setSupplierResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/compras/proveedores/search?q='+encodeURIComponent(val));
        const arr = Array.isArray(res) ? res : (res?.data || []);
        setSupplierResults(arr);
        if (arr.length === 0) setShowNewSupplier(true);
      } catch {}
    }, 350);
    setSupplierTimer(t);
  };

  const addProduct = () => setProductos(prev => [...prev, {nombre:'',descripcion:'',qty:1,unit_price_cop:0,impuesto_pct:0,tracking:'',entrega_est:'',casillero:'',notas:'',estado:'PENDIENTE'}]);
  const setProd = (i:number, k:string, v:any) => setProductos(prev => prev.map((p,idx)=>idx===i?{...p,[k]:v}:p));
  const delProd = (i:number) => setProductos(prev => prev.filter((_,idx)=>idx!==i));

  useEffect(() => {
    const sub = form.subtotal_cop || productos.reduce((s,p)=>s+(Number(p.qty||0)*Number(p.unit_price_cop||0)),0);
    setF('subtotal_cop', sub);
    setF('total_cop', sub);
  }, [productos]);

  const filteredPvens = pedidosVenta.filter(p =>
    p.estado === 'PENDIENTE_COMPRA' &&
    JSON.stringify(p).toLowerCase().includes(searchPven.toLowerCase())
  );

  async function submit() {
    if (!selectedSupplier) { onToast('Selecciona un proveedor','error'); return; }
    setSaving(true);
    try {
      const user = localStorage.getItem('user_name') || '';
      const pvensSelected = pedidosVenta.filter(p=>selectedPvens.has(p.id));
      const payload = {
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.name,
        supplier_ref: selectedSupplier.reference,
        ven_id: pvensSelected[0]?.id || null,
        ven_numero: pvensSelected.map((p:any)=>p.numero).join(', ') || null,
        modalidad_pago: form.modalidad_pago,
        metodo_pago: form.metodo_pago || null,
        tipo_envio: form.tipo_envio,
        casillero: form.casillero || null,
        carrier: form.carrier || null,
        dias_entrega: Number(form.dias_entrega) || 15,
        fecha_entrega_estimada: form.fecha_entrega_estimada || null,
        notas: form.notas || null,
        productos: productos.map(p=>({...p,qty:Number(p.qty),unit_price_cop:Number(p.unit_price_cop)})),
        subtotal_cop: form.subtotal_cop,
        total_cop: form.total_cop,
        created_by: user,
      };
      await apiFetch('/compras/pedidos',{method:'POST',body:JSON.stringify(payload)});
      onToast('PEC creado exitosamente','ok');
      onCreated();
      onClose();
    } catch(e:any){ onToast(e.message,'error'); }
    setSaving(false);
  }

  const totalCalc = productos.reduce((s,p)=>s+(Number(p.qty||0)*Number(p.unit_price_cop||0)),0);

  return (
    <>
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s)=>{setSelectedSupplier(s);setSupplierSearch(s.name);setSupplierResults([]);setShowNewSupplier(false);}}
          onClose={()=>setShowNewSupplier(false)}
        />
      )}
      <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-4 overflow-hidden flex flex-col max-h-[96vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-purple-50 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-xl"><ShoppingCart size={20} className="text-purple-700"/></div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Nuevo Pedido de Compra</h2>
                  <p className="text-xs text-gray-500">PEC-YYYY#### · {selectedSupplier ? selectedSupplier.name : 'Sin proveedor'}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {saving?<RefreshCw size={13} className="animate-spin"/>:<Send size={13}/>} {saving?'Guardando...':'Crear PEC'}
              </button>
              <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"><X size={13}/> Cancelar</button>
              <div className="flex-1"/>
              <div className="flex gap-1">
                {['info','pvens'].map(t=>(
                  <button key={t} onClick={()=>setModalTab(t)} className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (modalTab===t?'bg-purple-600 text-white':'bg-white text-gray-600 hover:bg-purple-50 border border-gray-200')}>
                    {t==='info'?'Informacion del Pedido':'Pedidos de Venta'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT — Form */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalTab === 'info' && (
                <div className="space-y-6">
                  {/* Proveedor */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Proveedor</p>
                    <div className="relative">
                      <input value={supplierSearch} onChange={e=>onSupplierType(e.target.value)}
                        placeholder="Buscar proveedor por nombre o NIT..."
                        className={'w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 ' + (selectedSupplier?'border-emerald-300 bg-emerald-50':'border-gray-200')}/>
                      {selectedSupplier && <CheckCircle2 size={16} className="absolute right-3 top-3 text-emerald-600"/>}
                      {supplierResults.length > 0 && !selectedSupplier && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-10 overflow-hidden">
                          {supplierResults.map((s:any)=>(
                            <button key={s.id} onClick={()=>{setSelectedSupplier(s);setSupplierSearch(s.name);setSupplierResults([]);}} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs shrink-0">{s.name[0]}</div>
                              <div><p className="font-bold text-gray-900">{s.name}</p><p className="text-xs text-gray-400">{s.reference||s.city||''}</p></div>
                            </button>
                          ))}
                          <button onClick={()=>setShowNewSupplier(true)} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-2 text-purple-600 font-bold border-t border-gray-100">
                            <UserPlus size={13}/> Agregar nuevo proveedor
                          </button>
                        </div>
                      )}
                    </div>
                    {selectedSupplier && (
                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-600">
                        {[['Ref/NIT',selectedSupplier.reference||'-'],['Contacto',selectedSupplier.contact_name||'-'],['Ciudad',selectedSupplier.city||'-']].map(([l,v])=>(
                          <div key={l}><span className="block text-gray-400 font-black uppercase mb-0.5">{l}</span>{v}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Detalles del pedido */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Detalles del Pedido</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Tipo de Envio</label>
                        <select value={form.tipo_envio} onChange={e=>setF('tipo_envio',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                          <option value="casillero">Via Casillero</option>
                          <option value="directo">Directo Colombia</option>
                        </select>
                      </div>
                      {form.tipo_envio === 'casillero' && (
                        <div>
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Casillero</label>
                          <input value={form.casillero} onChange={e=>setF('casillero',e.target.value)} placeholder="ID Casillero" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Carrier</label>
                        <input value={form.carrier} onChange={e=>setF('carrier',e.target.value)} placeholder="ej: DHL, FedEx, Amazon" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Modalidad Pago</label>
                        <select value={form.modalidad_pago} onChange={e=>setF('modalidad_pago',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                          {['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'].map(m=><option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Entrega Estimada (dias)</label>
                        <input type="number" value={form.dias_entrega} onChange={e=>setF('dias_entrega',Number(e.target.value))} min={1} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Fecha Entrega Est.</label>
                        <input type="date" value={form.fecha_entrega_estimada} onChange={e=>setF('fecha_entrega_estimada',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-xs font-black text-gray-500 uppercase mb-1">Notas internas</label>
                      <textarea value={form.notas} onChange={e=>setF('notas',e.target.value)} rows={2} placeholder="Instrucciones para el proveedor, condiciones especiales..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
                    </div>
                  </div>

                  {/* Productos */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-gray-400 uppercase">Productos / Lineas de Compra</p>
                      <button onClick={addProduct} className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200 bg-white"><Plus size={12}/> Agregar linea</button>
                    </div>
                    {productos.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Package size={28} className="mx-auto mb-2 opacity-30"/>
                        <p className="text-sm">Sin productos. Haz click en "Agregar linea"</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead className="border-b border-gray-200 text-xs text-gray-400 font-black uppercase">
                            <tr>
                              <th className="pb-2 text-left pr-3 min-w-[180px]">Producto</th>
                              <th className="pb-2 text-center w-16">Qty</th>
                              <th className="pb-2 text-right w-28">Precio COP</th>
                              <th className="pb-2 text-center w-16">IVA %</th>
                              <th className="pb-2 text-left min-w-[100px]">Tracking</th>
                              <th className="pb-2 text-left min-w-[100px]">Entrega Est.</th>
                              <th className="pb-2 text-right w-24">Subtotal</th>
                              <th className="pb-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {productos.map((p,i)=>(
                              <tr key={i} className="group">
                                <td className="py-2 pr-3"><input value={p.nombre||p.descripcion||''} onChange={e=>setProd(i,'descripcion',e.target.value)} placeholder="Nombre / descripcion del producto" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2 text-center"><input type="number" min={1} value={p.qty} onChange={e=>setProd(i,'qty',e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input type="number" min={0} value={p.unit_price_cop} onChange={e=>setProd(i,'unit_price_cop',e.target.value)} className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2 text-center"><input type="number" min={0} max={100} value={p.impuesto_pct} onChange={e=>setProd(i,'impuesto_pct',e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input value={p.tracking||''} onChange={e=>setProd(i,'tracking',e.target.value)} placeholder="Guia" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input type="date" value={p.entrega_est||''} onChange={e=>setProd(i,'entrega_est',e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2 text-right font-bold text-xs">{fCOP(Number(p.qty||0)*Number(p.unit_price_cop||0))}</td>
                                <td className="py-2"><button onClick={()=>delProd(i)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={13}/></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* Footer total */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-8 text-sm">
                      <div className="text-right">
                        <p className="text-gray-400 text-xs font-bold uppercase">Subtotal</p>
                        <p className="font-black text-gray-900 mt-0.5">{fCOP(totalCalc)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-xs font-bold uppercase">TOTAL</p>
                        <p className="font-black text-gray-900 text-lg mt-0.5">{fCOP(totalCalc)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'pvens' && (
                <div>
                  <p className="text-sm font-black text-gray-700 mb-1">Pedidos de Venta disponibles</p>
                  <p className="text-xs text-gray-400 mb-4">Selecciona los PVEN en estado <strong>Pendiente Compra</strong> para asociar a este PEC</p>
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 gap-2 mb-3">
                    <Search size={14} className="text-gray-400"/>
                    <input value={searchPven} onChange={e=>setSearchPven(e.target.value)} placeholder="Buscar PVEN..." className="text-sm bg-transparent outline-none flex-1"/>
                  </div>
                  <div className="space-y-2">
                    {filteredPvens.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">Sin PVEN en estado Pendiente Compra</p>}
                    {filteredPvens.map((p:any)=>(
                      <label key={p.id} className={'flex items-start gap-3 p-4 rounded-2xl border cursor-pointer hover:bg-purple-50 transition-colors ' + (selectedPvens.has(p.id)?'border-purple-300 bg-purple-50':'border-gray-200 bg-white')}>
                        <input type="checkbox" checked={selectedPvens.has(p.id)} onChange={e=>{const n=new Set(selectedPvens);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedPvens(n);}} className="mt-1 rounded border-gray-300 text-purple-600"/>
                        <div className="flex-1">
                          <div className="flex items-center gap-2"><span className="font-bold text-gray-900">{p.numero}</span><span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">PEND. COMPRA</span></div>
                          <p className="text-xs text-gray-500">{p.customer_name||'-'} · {fDate(p.created_at)}</p>
                          <p className="text-xs font-bold text-indigo-700 mt-0.5">{fCOP(p.total_cop||0)} · {(p.productos||[]).length} producto(s)</p>
                          {(p.productos||[]).slice(0,3).map((pr:any,j:number)=><p key={j} className="text-[10px] text-gray-400">· {pr.descripcion||pr.producto_nombre||'Producto'}</p>)}
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedPvens.size > 0 && (
                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between">
                      <span className="text-sm font-bold text-purple-800">{selectedPvens.size} PVEN seleccionado(s)</span>
                      <span className="text-xs text-purple-600">Se asociaran al nuevo PEC al crearlo</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <div className="text-sm text-gray-500"><span className="font-bold">{productos.length}</span> producto(s) · <span className="font-bold">{selectedPvens.size}</span> PVEN asociado(s)</div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {saving?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>} {saving?'Creando PEC...':'Crear PEC'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   MAIN PAGE — PedidosCompraPage
   ================================================================ */
export default function PedidosCompraPage() {
  const pathname = usePathname();
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{msg:string;type:string}|null>(null);
  const [pedidos, setPedidos]         = useState<any[]>([]);
  const [pedidosVenta, setPedidosVenta] = useState<any[]>([]);
  const [stats, setStats]             = useState<any>({});
  const [activeTab, setActiveTab]     = useState('Todos');
  const [viewMode, setViewMode]       = useState<'lista'|'kanban'>('lista');
  const [search, setSearch]           = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByMonth, setGroupByMonth] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedPec, setSelectedPec] = useState<any>(null);
  const [menuOpenId, setMenuOpenId]   = useState<number|null>(null);
  const [showNuevoPec, setShowNuevoPec] = useState(false);
  // Analytics
  const [analyticsRange, setAnalyticsRange] = useState('30d');
  const [chartType, setChartType]     = useState('bars');
  const [aiQuestion, setAiQuestion]   = useState('');
  const [aiResponse, setAiResponse]   = useState('');
  const [aiLoading, setAiLoading]     = useState(false);

  const showToast = (msg:string, type:string='ok') => setToast({msg,type});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s, pv] = await Promise.all([
        apiFetch('/compras/pedidos?limit=200').catch(()=>[]),
        apiFetch('/compras/stats').catch(()=>({})),
        apiFetch('/ventas/pedidos?limit=200').catch(()=>[]),
      ]);
      setPedidos(Array.isArray(p)?p:(p?.data??[]));
      setStats(s?.data??s??{});
      setPedidosVenta(Array.isArray(pv)?pv:(pv?.data??[]));
    } catch(e:any){ showToast(e.message,'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); }, [load]);

  async function handleAskAI() {
    if (!aiQuestion.trim()) return;
    setAiLoading(true); setAiResponse('');
    try {
      const res = await apiFetch('/ventas/ai-chat',{method:'POST',body:JSON.stringify({question:aiQuestion,context:{pedidos_count:pedidos.length}})});
      setAiResponse(res.response||'Asistente IA en configuracion.');
    } catch { setAiResponse('Asistente IA en configuracion. Intenta mas tarde.'); }
    setAiLoading(false);
  }

  async function handleBulkCancel() {
    if (!selectedIds.size||!confirm('Cancelar seleccionados?')) return;
    for (const id of Array.from(selectedIds)) {
      await apiFetch('/compras/pedidos/'+id,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO'})}).catch(()=>{});
    }
    showToast('Cancelados','ok'); setSelectedIds(new Set()); load();
  }

  // Computed tabs
  const activos    = pedidos.filter(p=>['EMITIDO','ENVIADO','EN_TRANSITO','PENDIENTE_ENTREGA'].includes(p.estado));
  const enTransito = pedidos.filter(p=>['EN_TRANSITO','ENVIADO'].includes(p.estado));
  const recibidos  = pedidos.filter(p=>['RECIBIDO','COMPLETADO'].includes(p.estado));
  const vencidos   = pedidos.filter(p=>p.is_overdue);
  const montoTotal = pedidos.filter(p=>p.estado!=='CANCELADO').reduce((s,p)=>s+(p.total_cop||0),0);

  const kpiCards = [
    {label:'PEC Activos',  value:activos.length,     color:'purple', icon:<Receipt size={22}/>,      sub:pedidos.length+' total',       ok:true},
    {label:'En Transito',  value:enTransito.length,  color:'blue',   icon:<Truck size={22}/>,         sub:'Enviados + En transito',      ok:true},
    {label:'Vencidos',     value:vencidos.length,    color:'red',    icon:<AlertTriangle size={22}/>, sub:'Entrega vencida',             ok:vencidos.length===0},
    {label:'Total',        value:pedidos.length,     color:'teal',   icon:<Activity size={22}/>,      sub:fCOP(montoTotal)+' en compras',ok:true},
  ];
  const colorMap: Record<string,any> = {
    purple:{bg:'bg-purple-50',text:'text-purple-700',iconBg:'bg-purple-100'},
    blue:  {bg:'bg-blue-50',  text:'text-blue-700',  iconBg:'bg-blue-100'},
    red:   {bg:'bg-red-50',   text:'text-red-700',   iconBg:'bg-red-100'},
    teal:  {bg:'bg-teal-50',  text:'text-teal-700',  iconBg:'bg-teal-100'},
  };

  const tabConfig = [
    {k:'Todos',      count:pedidos.length,     data:pedidos},
    {k:'Activos',    count:activos.length,      data:activos},
    {k:'En Transito',count:enTransito.length,   data:enTransito},
    {k:'Recibidos',  count:recibidos.length,    data:recibidos},
    {k:'Analisis',   count:null,                data:[]},
  ];

  const baseData = tabConfig.find(t=>t.k===activeTab)?.data || pedidos;
  const filteredData = useMemo(()=>{
    let d = baseData;
    if (search) d = d.filter((r:any)=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
    if (filterEstado) d = d.filter((r:any)=>r.estado===filterEstado);
    return d;
  }, [baseData, search, filterEstado]);

  const groupedByMonth = useMemo(()=>{
    const map: Record<string,any[]> = {};
    filteredData.forEach((p:any)=>{ const k=fMonthKey(p.fecha_compra||p.created_at); if(!map[k])map[k]=[]; map[k].push(p); });
    return map;
  }, [filteredData]);

  const getKanbanCol = (item: any) => {
    const e = item.estado||'';
    if (e==='CANCELADO') return 'Cancelado';
    if (['RECIBIDO','COMPLETADO'].includes(e)) return 'Recibido';
    if (['EN_TRANSITO','ENVIADO','PENDIENTE_ENTREGA'].includes(e)) return 'En Transito';
    if (e==='EMITIDO') return 'Emitido';
    return 'Borrador';
  };
  const handleDragStart = (e:React.DragEvent, id:number) => e.dataTransfer.setData('pecId', String(id));
  const handleDrop = async (e:React.DragEvent, col:string) => {
    const id = e.dataTransfer.getData('pecId'); if (!id) return;
    const m: Record<string,string> = {'Borrador':'BORRADOR','Emitido':'EMITIDO','En Transito':'EN_TRANSITO','Recibido':'RECIBIDO','Cancelado':'CANCELADO'};
    await apiFetch('/compras/pedidos/'+id,{method:'PATCH',body:JSON.stringify({estado:m[col]||'BORRADOR'})}).catch(()=>{});
    load();
  };

  // Table Row
  function PecRow({p}: {p:any}) {
    const est = PEC_ESTADOS[p.estado]||PEC_ESTADOS.BORRADOR;
    const isSelected = selectedIds.has(p.id);
    return (
      <tr className={'group hover:bg-purple-50/30 cursor-pointer transition-colors ' + (p.is_overdue?'border-l-4 border-l-red-400 bg-red-50/20 ':'') + (isSelected?'bg-purple-50/40':'')}
        onClick={(e:any)=>{const t=e.target as HTMLElement;if(t.closest('input')||t.closest('button'))return;setSelectedPec(p);}}>
        <td className="px-5 py-3.5 shrink-0">
          <input type="checkbox" className="rounded border-gray-300 text-purple-600" checked={isSelected}
            onChange={e=>{const n=new Set(selectedIds);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedIds(n);}}/>
        </td>
        <td className="px-4 py-3.5">
          <span className="font-black text-purple-700 text-sm block">{p.numero}</span>
          {p.ven_numero && <span className="text-[10px] text-indigo-600 font-bold">{p.ven_numero}</span>}
          {p.is_overdue && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black">VENC.</span>}
        </td>
        <td className="px-4 py-3.5 font-bold text-gray-900">{p.supplier_name||'-'}</td>
        <td className="px-4 py-3.5 text-xs text-gray-400">{p.created_by||'-'}</td>
        <td className="px-4 py-3.5 font-black text-gray-900">{fCOP(p.total_cop||0)}</td>
        <td className="px-4 py-3.5 text-xs text-gray-500">{fDate(p.fecha_compra||p.created_at)}</td>
        <td className="px-4 py-3.5"><span className={'text-xs font-bold '+(p.is_overdue?'text-red-600':'text-gray-700')}>{fDate(p.fecha_entrega_estimada)}</span></td>
        <td className="px-4 py-3.5 text-xs text-gray-400">{fDate(p.fecha_alerta)}</td>
        <td className="px-4 py-3.5"><span className={'px-2.5 py-1 rounded-full text-xs font-black border '+est.bg+' '+est.text+' '+est.border}>{est.label}</span></td>
        <td className="px-4 py-3.5 text-right font-black text-gray-900">{fCOP(p.total_cop||0)}</td>
        <td className="px-4 py-3.5 relative">
          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
            <button onClick={e=>{e.stopPropagation();setSelectedPec(p);}} className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100"><Eye size={13}/></button>
            <div className="relative">
              <button onClick={e=>{e.stopPropagation();setMenuOpenId(menuOpenId===p.id?null:p.id);}} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><MoreHorizontal size={13}/></button>
              {menuOpenId===p.id && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-20" onClick={(e:any)=>e.stopPropagation()}>
                  <button onClick={()=>{setSelectedPec(p);setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm flex items-center gap-2"><Eye size={13} className="text-purple-600"/> Ver Detalle</button>
                  <button onClick={async()=>{try{await apiFetch('/compras/pedidos/'+p.id,{method:'PATCH',body:JSON.stringify({estado:'EMITIDO'})});showToast('Marcado como Emitido','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm flex items-center gap-2 text-amber-700"><Send size={13}/> Marcar Emitido</button>
                  <div className="border-t border-gray-100 my-1"/>
                  <button onClick={async()=>{try{await apiFetch('/compras/pedidos/'+p.id,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO'})});showToast('Cancelado','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar PEC</button>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  const TABLE_HEADERS = ['#PEC / PVEN','Proveedor','Comprador','Monto','F. Compra','F. Entrega Est.','F. Limite','Estado','Total','Acciones'];

  /* ═══════════════ RETURN JSX ═══════════════ */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {selectedPec && (
        <PecDetailPanel
          pec={selectedPec}
          onClose={()=>setSelectedPec(null)}
          onUpdate={load}
          onToast={showToast}
        />
      )}
      {showNuevoPec && (
        <NuevoPecModal
          pedidosVenta={pedidosVenta}
          onClose={()=>setShowNuevoPec(false)}
          onCreated={load}
          onToast={showToast}
        />
      )}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto">
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0">COMPRAS:</span>
        {SUB_MODULES.map(m=>(
          <Link key={m.name} href={m.path}
            className={'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ' + (pathname===m.path?'bg-purple-600 text-white border-purple-600':'text-gray-600 hover:bg-purple-50 hover:text-purple-700 border-transparent')}>
            {m.name}
          </Link>
        ))}
      </div>

      {/* Alert vencidos */}
      {vencidos.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-center gap-3">
          <AlertCircle className="text-orange-600 shrink-0" size={16}/>
          <span className="text-xs font-bold text-orange-700">{vencidos.length} PEC con entrega vencida — Revisa el tracking</span>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER — Solicitud de Cliente style */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-purple-600 text-white p-3 rounded-2xl shadow-lg"><ShoppingBag size={26}/></div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Pedidos de Compra</h1>
              <p className="text-sm text-gray-400 mt-0.5">PEC-YYYY#### · Pipeline: BORRADOR → EMITIDO → EN_TRANSITO → RECIBIDO</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
              <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <button onClick={()=>setShowNuevoPec(true)} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-sm shadow-sm">
              <Plus size={15}/> Nuevo PEC
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map((k,i)=>{
              const c = colorMap[k.color]||colorMap.purple;
              return (
                <div key={i} className={'bg-white rounded-2xl border shadow-sm hover:shadow-md transition-all p-5 ' + (k.ok?'border-gray-200':'border-red-200')}>
                  <div className={'inline-flex p-2.5 rounded-xl mb-3 '+c.iconBg+' '+c.text}>{k.icon}</div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-3xl font-black text-gray-900 mb-1">{k.value}</p>
                  <p className={'text-xs font-semibold flex items-center gap-1 '+(k.ok?'text-emerald-600':'text-red-500')}>
                    {k.ok?<CheckCircle2 size={11}/>:<AlertCircle size={11}/>}{k.sub}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TABS ROW — formato imagen: pills sin bg container */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {tabConfig.map(({k,count})=>(
              <button key={k} onClick={()=>setActiveTab(k)}
                className={'px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap '+(activeTab===k?'bg-purple-600 text-white shadow':'text-gray-600 hover:text-purple-700 hover:bg-purple-50')}>
                {k}
                {count !== null && <span className={'ml-1.5 text-xs font-black '+(activeTab===k?'text-purple-200':'text-gray-400')}>{count}</span>}
              </button>
            ))}
          </div>
          {activeTab !== 'Analisis' && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setGroupByMonth(g=>!g)}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors '+(groupByMonth?'bg-purple-50 border-purple-300 text-purple-700':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Calendar size={13}/> Agrupar mes
              </button>
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button onClick={()=>setViewMode('lista')} className={'p-2 rounded-lg transition-colors '+(viewMode==='lista'?'bg-white shadow text-purple-700':'text-gray-500 hover:bg-white/50')} title="Lista">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>
                </button>
                <button onClick={()=>setViewMode('kanban')} className={'p-2 rounded-lg transition-colors '+(viewMode==='kanban'?'bg-white shadow text-purple-700':'text-gray-500 hover:bg-white/50')} title="Kanban">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER ROW */}
        {activeTab !== 'Analisis' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm gap-2 flex-1 max-w-[500px]">
              <Search size={15} className="text-gray-400 shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar PEC, proveedor, PVEN numero..." className="text-sm outline-none flex-1 bg-transparent text-gray-700 placeholder-gray-400"/>
              {search && <button onClick={()=>setSearch('')}><X size={13} className="text-gray-400 hover:text-gray-600"/></button>}
            </div>
            <div className="relative">
              <button onClick={()=>setShowFilters(f=>!f)}
                className={'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-sm bg-white '+(filterEstado?'border-purple-400 text-purple-700 bg-purple-50':'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Filter size={14}/> Filtrar Estado
                {filterEstado && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-gray-400 uppercase mb-2">Por Estado</p>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none mb-3">
                    <option value="">Todos los estados</option>
                    {Object.entries(PEC_ESTADOS).map(([k,v])=><option key={k} value={k}>{v.label}</option>)}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-red-500 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-400 font-medium ml-1">{filteredData.length} registros</p>
          </div>
        )}

        {/* LOADING */}
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center"><div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"/><p className="text-sm text-gray-400 font-medium">Cargando pedidos de compra...</p></div>
          </div>

        ) : activeTab === 'Analisis' ? (
          /* ── ANALYTICS ── */
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-black text-gray-400 uppercase mr-1">Periodo:</span>
              {[{k:'7d',l:'Ultimos 7 dias'},{k:'30d',l:'Ultimo mes'},{k:'90d',l:'Trimestre'},{k:'180d',l:'Semestre'},{k:'1y',l:'Ultimo Ano'},{k:'custom',l:'Personalizado'}].map(({k,l})=>(
                <button key={k} onClick={()=>setAnalyticsRange(k)} className={'px-3 py-1.5 rounded-lg text-sm font-bold '+(analyticsRange===k?'bg-purple-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{l}</button>
              ))}
              <div className="h-6 w-px bg-gray-200 mx-1"/>
              <span className="text-xs font-black text-gray-400 uppercase">Grafico:</span>
              {[{k:'bars',l:'Barras'},{k:'lines',l:'Lineas'},{k:'pie',l:'Torta'}].map(({k,l})=>(
                <button key={k} onClick={()=>setChartType(k)} className={'px-3 py-1.5 rounded-lg text-xs font-bold '+(chartType===k?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{l}</button>
              ))}
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[{l:'Total PEC',v:String(pedidos.length)},{l:'Capital COP',v:fCOP(montoTotal)},{l:'En Proceso',v:String(activos.length)},{l:'Recibidos',v:String(recibidos.length)}].map((k,i)=>(
                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-gray-400 text-xs font-black uppercase mb-2">{k.l}</p><p className="text-2xl font-black text-gray-900">{k.v}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-purple-600"/> Compras por Estado</h3>
                <div className="flex flex-col gap-3">
                  {Object.entries(PEC_ESTADOS).filter(([k])=>pedidos.some((p:any)=>p.estado===k)).map(([k,v])=>{
                    const count = pedidos.filter((p:any)=>p.estado===k).length;
                    const maxC = Math.max(...Object.keys(PEC_ESTADOS).map(s=>pedidos.filter((p:any)=>p.estado===s).length),1);
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-500 shrink-0">{v.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div className={v.bg+' h-full rounded-full flex items-center justify-end pr-2'} style={{width:Math.round((count/maxC)*100)+'%'}}>
                            <span className="text-[10px] font-black text-gray-700">{count}</span>
                          </div>
                        </div>
                        <div className="w-8 text-right text-xs font-bold">{count}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-3">Top Proveedores</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-xs text-gray-400 font-black uppercase"><th className="pb-2 text-left">#</th><th className="text-left">Proveedor</th><th className="text-right">PECs</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {Object.entries(pedidos.reduce((acc:Record<string,{count:number,total:number}>,p:any)=>{const k=p.supplier_name||'Sin proveedor';if(!acc[k])acc[k]={count:0,total:0};acc[k].count++;acc[k].total+=p.total_cop||0;return acc;},{} as Record<string,{count:number,total:number}>)).sort((a:any,b:any)=>b[1].total-a[1].total).slice(0,8).map(([name,v]:any,i:number)=>(
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 font-bold">{i+1}</td>
                        <td className="py-2 font-medium truncate max-w-[120px]">{name}</td>
                        <td className="py-2 text-right text-gray-500">{v.count}</td>
                        <td className="py-2 text-right font-bold">{fCOP(v.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><MessageSquare size={18} className="text-purple-600"/> AI Compras Assistant</h3>
              <div className="flex gap-2 mb-4">
                <input value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskAI()}
                  placeholder="Ej: Cual proveedor tuvo mas retrasos? Cuanto gastamos este mes?"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <button onClick={handleAskAI} disabled={aiLoading} className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                  {aiLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>} Preguntar
                </button>
              </div>
              {aiLoading && <div className="text-gray-400 animate-pulse text-sm">Analizando...</div>}
              {aiResponse && <div className="bg-purple-50 border border-purple-100 p-4 rounded-xl text-gray-700 text-sm whitespace-pre-wrap">{aiResponse}</div>}
            </div>
          </div>

        ) : viewMode === 'lista' ? (
          /* ── LISTA ── */
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            {groupByMonth ? (
              Object.entries(groupedByMonth).map(([month,rows]:any)=>{
                const isOpen = expandedMonths.has(month);
                return (
                  <div key={month}>
                    <button onClick={()=>{const n=new Set(expandedMonths);if(n.has(month))n.delete(month);else n.add(month);setExpandedMonths(n);}}
                      className="w-full flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-200 hover:bg-purple-50/50 transition-colors">
                      <span className="font-black text-gray-700 text-sm capitalize">{month}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-bold">{(rows as any[]).length} pedido(s) · {fCOP((rows as any[]).reduce((s:number,r:any)=>s+(r.total_cop||0),0))}</span>
                        {isOpen?<ChevronUp size={16} className="text-gray-400"/>:<ChevronRight size={16} className="text-gray-400"/>}
                      </div>
                    </button>
                    {isOpen && (
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/50 border-b border-gray-100"><tr><th className="px-5 py-3 w-10"/>{TABLE_HEADERS.map((h,i)=><th key={i} className={'px-4 py-3 text-xs font-black text-gray-400 uppercase'+(i===TABLE_HEADERS.length-1?' text-center':'')}>{h}</th>)}</tr></thead>
                        <tbody className="divide-y divide-gray-100">{(rows as any[]).map((p:any)=><PecRow key={p.id} p={p}/>)}</tbody>
                      </table>
                    )}
                  </div>
                );
              })
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3.5 w-10"><input type="checkbox" className="rounded border-gray-300" onChange={e=>{if(e.target.checked)setSelectedIds(new Set(filteredData.map((d:any)=>d.id)));else setSelectedIds(new Set());}} checked={selectedIds.size===filteredData.length&&filteredData.length>0}/></th>
                    {TABLE_HEADERS.map((h,i)=><th key={i} className={'px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide'+(i===TABLE_HEADERS.length-1?' text-center':'')}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.length===0&&(
                    <tr><td colSpan={11} className="text-center py-16 text-gray-400">
                      <Package size={32} className="mx-auto mb-3 opacity-30"/>
                      <p className="font-medium">{search?'Sin resultados para "'+search+'"':'Sin pedidos de compra registrados'}</p>
                      <button onClick={()=>setShowNuevoPec(true)} className="mt-3 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm font-bold">+ Nuevo PEC</button>
                    </td></tr>
                  )}
                  {filteredData.map((p:any)=><PecRow key={p.id} p={p}/>)}
                </tbody>
              </table>
            )}
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 font-medium flex justify-between">
              <span>{filteredData.length} de {pedidos.length} registros</span>
              {selectedIds.size>0&&<span className="text-purple-600 font-bold">{selectedIds.size} seleccionados</span>}
            </div>
          </div>

        ) : (
          /* ── KANBAN ── */
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {['Borrador','Emitido','En Transito','Recibido','Cancelado'].map(col=>(
              <div key={col} className="w-72 flex-shrink-0 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm"
                onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e,col)}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-black text-gray-700 text-sm">{col}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{filteredData.filter((d:any)=>getKanbanCol(d)===col).length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-[200px]">
                  {filteredData.filter((d:any)=>getKanbanCol(d)===col).map((p:any,i:number)=>{
                    const est = PEC_ESTADOS[p.estado]||PEC_ESTADOS.BORRADOR;
                    return (
                      <div key={i} draggable onDragStart={e=>handleDragStart(e,p.id)} onClick={()=>setSelectedPec(p)}
                        className={'bg-white p-4 rounded-xl shadow-sm border cursor-grab hover:border-purple-300 transition-colors '+(p.is_overdue?'border-red-300 bg-red-50/30':'border-gray-200')}>
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="font-bold text-gray-900 text-sm">{p.numero}</span>
                          {p.is_overdue&&<span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black">VEN.</span>}
                        </div>
                        <p className="text-xs text-gray-500 mb-1 truncate">{p.supplier_name||'-'}</p>
                        {p.ven_numero&&<p className="text-[10px] text-indigo-600 font-bold mb-1">{p.ven_numero}</p>}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="font-bold text-xs text-purple-700">{fCOP(p.total_cop||0)}</span>
                          <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full '+est.bg+' '+est.text}>{est.label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter((d:any)=>getKanbanCol(d)===col).length===0&&<p className="text-center text-xs text-gray-300 py-8">Arrastra aqui</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk actions */}
        {selectedIds.size>0&&(
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40">
            <span className="font-bold text-sm bg-gray-800 px-3 py-1 rounded-full">{selectedIds.size} seleccionados</span>
            <button onClick={handleBulkCancel} className="bg-red-500/20 text-red-400 hover:bg-red-500/40 p-2 rounded-xl flex items-center gap-2 text-sm font-bold"><Trash2 size={16}/> Cancelar</button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-2 text-gray-400 hover:text-white"><X size={16}/></button>
          </div>
        )}

      </div>
    </div>
  );
}
