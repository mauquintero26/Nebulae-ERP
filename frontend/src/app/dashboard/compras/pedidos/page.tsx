'use client';
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  ShoppingBag, Package, Truck, CheckCircle2, AlertTriangle, Activity,
  Search, MoreHorizontal, RefreshCw, Filter, X, Trash2, Edit2, Send,
  TrendingUp, DollarSign, Calendar, MessageSquare, AlertCircle, ChevronRight,
  ChevronUp, Plus, Eye, ShoppingCart, FileText, LayoutGrid, List,
  Bell, Receipt, Clock, MapPin, ArrowRight, Save, ChevronDown,
  ExternalLink, RotateCcw, Layers, Tag, Hash, UserPlus, Settings2, PackageCheck
} from 'lucide-react';

import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
async function apiFetch(path: string, opts: any = {}) {
  const res = await _apiFetch(path, opts);
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
  // confirmar_recepcion sets the PEC's own estado to one of these two on the
  // parent PurchaseOrderFull — distinct from RECIBIDO above (set only by the
  // tracking-stage flow) and missing here entirely, so a PEC that had gone
  // through a real reception confirmation fell through to PEC_ESTADOS.BORRADOR
  // and displayed as "Borrador" regardless of its real state.
  RECIBIDA:            {bg:'bg-emerald-100', text:'text-emerald-800', border:'border-emerald-200', label:'Recibido'},
  PARCIALMENTE_RECIBIDA:{bg:'bg-amber-100',  text:'text-amber-800',  border:'border-amber-200',   label:'Parcialmente Recibido'},
  COMPLETADO:        {bg:'bg-green-100',   text:'text-green-800',   border:'border-green-200',   label:'Completado'},
  CANCELADO:         {bg:'bg-red-100',     text:'text-red-700',     border:'border-red-200',     label:'Cancelado'},
};

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
    try { const raw = await apiFetch('/compras/proveedores',{method:'POST',body:JSON.stringify(form)}); onSave(raw?.data ?? raw); }
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
   NUEVO CASILLERO MODAL
   ================================================================ */
function NewCasilleroModal({onSave, onClose}: {onSave:(c:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({name:'',address:'',reception_point:'',contact_name:'',phone:'',email:'',city:'',country:'Estados Unidos',notes:''});
  const [saving, setSaving] = useState(false);
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { const raw = await apiFetch('/compras/casilleros',{method:'POST',body:JSON.stringify(form)}); onSave(raw?.data ?? raw); }
    catch(err:any) { alert('Error: '+err.message); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-3xl">
          <div><h3 className="font-black text-gray-900 text-lg">Nuevo Casillero</h3><p className="text-xs text-gray-500 mt-0.5">Punto de recepcion / forwarder</p></div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-100 rounded-xl"><X size={18}/></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Direccion</label><input value={form.address} onChange={e=>set('address',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Punto de Recepcion</label><input value={form.reception_point} onChange={e=>set('reception_point',e.target.value)} placeholder="ej: Bodega 4, Muelle B" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Telefono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Pais</label><input value={form.country} onChange={e=>set('country',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<MapPin size={14}/>} Agregar Casillero
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   TRACKING CONFIG MODAL — icono de configuracion (Etapas/Alertas + Casilleros)
   ================================================================ */
function TrackingConfigModal({onClose, onToast}: {onClose:()=>void; onToast:(m:string,t?:string)=>void}) {
  const [tab, setTab] = useState<'etapas'|'casilleros'>('etapas');
  const [tipoEnvio, setTipoEnvio] = useState<'casillero'|'directo'>('casillero');
  const [config, setConfig] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [casilleros, setCasilleros] = useState<any[]>([]);
  const [showNewCasillero, setShowNewCasillero] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/compras/tracking-config'); setConfig(d); setStages(d[tipoEnvio]||[]); }
    catch(e:any) { onToast(e.message,'error'); }
    setLoading(false);
  }, [tipoEnvio]);
  const loadCasilleros = async () => {
    try { const d = await apiFetch('/compras/casilleros?limit=100'); setCasilleros(Array.isArray(d)?d:(d?.data||[])); }
    catch {}
  };
  useEffect(()=>{ loadConfig(); loadCasilleros(); }, []);
  useEffect(()=>{ if(config) setStages(config[tipoEnvio]||[]); }, [tipoEnvio]);

  const setStage = (i:number, k:string, v:any) => setStages(prev=>prev.map((s,idx)=>idx===i?{...s,[k]:v}:s));
  const addStage = () => setStages(prev=>[...prev, {key:'',label:'',alert_confirm_days:2,alert_overdue_days:1,active:true}]);
  const removeStage = (i:number) => setStages(prev=>prev.filter((_,idx)=>idx!==i));
  const moveStage = (i:number, dir:number) => setStages(prev=>{
    const n=[...prev]; const j=i+dir; if(j<0||j>=n.length) return prev;
    [n[i],n[j]]=[n[j],n[i]]; return n;
  });

  const saveStages = async () => {
    if (stages.some(s=>!s.key || !String(s.key).trim())) { onToast('Cada etapa necesita una key (identificador unico)','error'); return; }
    setSaving(true);
    try {
      await apiFetch(`/compras/tracking-config/${tipoEnvio}`, {method:'PUT', body:JSON.stringify({stages})});
      onToast('Configuracion de etapas guardada','ok');
      loadConfig();
    } catch(e:any) { onToast(e.message,'error'); }
    setSaving(false);
  };

  const deleteCasillero = async (id:number) => {
    if (!confirm('Eliminar este casillero?')) return;
    try { await apiFetch(`/compras/casilleros/${id}`,{method:'DELETE'}); loadCasilleros(); onToast('Casillero eliminado','ok'); }
    catch(e:any) { onToast(e.message,'error'); }
  };

  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      {showNewCasillero && (
        <NewCasilleroModal onClose={()=>setShowNewCasillero(false)} onSave={()=>{setShowNewCasillero(false);loadCasilleros();}}/>
      )}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-lg flex items-center gap-2"><Settings2 size={18} className="text-purple-600"/> Configuracion de Tracking</h3>
            <p className="text-xs text-gray-500 mt-0.5">Etapas, alertas y casilleros del pipeline logistico</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18}/></button>
        </div>
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {[{k:'etapas',l:'Etapas y Alertas'},{k:'casilleros',l:'Casilleros'}].map(({k,l}:any)=>(
            <button key={k} onClick={()=>setTab(k)} className={'px-3 py-1.5 rounded-lg text-sm font-bold ' + (tab===k?'bg-purple-600 text-white':'bg-gray-100 text-gray-600 hover:bg-purple-50')}>{l}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'etapas' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['casillero','directo'] as const).map(t=>(
                  <button key={t} onClick={()=>setTipoEnvio(t)} className={'px-3 py-1.5 rounded-lg text-xs font-bold border ' + (tipoEnvio===t?'bg-indigo-600 text-white border-indigo-600':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                    {t==='casillero'?'Via Casillero':'Directo Colombia'}
                  </button>
                ))}
              </div>
              {loading ? <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div> : (
                <div className="space-y-2">
                  {stages.map((s,i)=>(
                    <div key={i} className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Etiqueta</label>
                          <input value={s.label||''} onChange={e=>setStage(i,'label',e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Key (unica)</label>
                          <input value={s.key||''} onChange={e=>setStage(i,'key',e.target.value.toUpperCase().replace(/\s+/g,'_'))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 font-mono"/>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Confirm. (d)</label>
                          <input type="number" min={0} value={s.alert_confirm_days??''} onChange={e=>setStage(i,'alert_confirm_days',e.target.value===''?null:Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Atraso (d)</label>
                          <input type="number" min={0} value={s.alert_overdue_days??''} onChange={e=>setStage(i,'alert_overdue_days',e.target.value===''?null:Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-1 flex flex-col items-center gap-1">
                          <button onClick={()=>moveStage(i,-1)} disabled={i===0} className="text-gray-400 hover:text-purple-600 disabled:opacity-20"><ChevronUp size={14}/></button>
                          <button onClick={()=>moveStage(i,1)} disabled={i===stages.length-1} className="text-gray-400 hover:text-purple-600 disabled:opacity-20"><ChevronDown size={14}/></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 font-bold">
                          <input type="checkbox" checked={s.active!==false} onChange={e=>setStage(i,'active',e.target.checked)} className="rounded border-gray-300"/> Activa
                        </label>
                        <button onClick={()=>removeStage(i)} className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"><Trash2 size={12}/> Eliminar etapa</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addStage} className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-bold text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-2"><Plus size={14}/> Agregar etapa</button>
                </div>
              )}
            </div>
          )}

          {tab === 'casilleros' && (
            <div className="space-y-2">
              <button onClick={()=>setShowNewCasillero(true)} className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-bold text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-2 mb-2"><Plus size={14}/> Nuevo Casillero</button>
              {casilleros.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Sin casilleros registrados</p>}
              {casilleros.map(c=>(
                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400">{[c.address,c.city].filter(Boolean).join(' · ')||'Sin direccion'}</p>
                  </div>
                  <button onClick={()=>deleteCasillero(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'etapas' && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cerrar</button>
            <button onClick={saveStages} disabled={saving} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<Save size={14}/>} Guardar Etapas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   TRACKING PANEL — Barra interactiva de tracking (renderiza SIEMPRE
   directamente pec.tracking_stages, la fuente de verdad real -- nunca
   una plantilla separada por nombre, que fue la causa raiz del bug
   "las etapas no se marcan": el backend y un template hardcodeado en
   este archivo usaban nombres de etapa distintos, asi que el PATCH de
   las etapas 2/3/4 nunca encontraba coincidencia y no hacia nada).
   ================================================================ */
function TrackingPanel({pec, onUpdate, onToast}: {pec:any; onUpdate:()=>void; onToast:(m:string,t?:string)=>void}) {
  const [updating, setUpdating] = useState<string|null>(null);
  const [editStage, setEditStage] = useState<string|null>(null);
  const [guia, setGuia] = useState('');
  const [notas, setNotas] = useState('');
  const [eta, setEta] = useState('');
  const [carrier, setCarrier] = useState('');
  const [casilleroId, setCasilleroId] = useState<number|null>(null);
  const [casilleroSearch, setCasilleroSearch] = useState('');
  const [casilleroResults, setCasilleroResults] = useState<any[]>([]);
  const [showNewCasillero, setShowNewCasillero] = useState(false);
  const casilleroTimer = useRef<any>(null);

  const stages: any[] = pec.tracking_stages || [];

  async function updateStage(stageName: string, status: string) {
    setUpdating(stageName);
    try {
      await apiFetch('/compras/pedidos/' + pec.id + '/tracking', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: stageName, status,
          tracking_number: guia || undefined,
          notes: notas || undefined,
          eta: eta || undefined,
          carrier: carrier || undefined,
          casillero_id: casilleroId || undefined,
          user_name: localStorage.getItem('user_name') || '',
        })
      });
      onToast('Etapa actualizada', 'ok');
      onUpdate();
      closeEdit();
    } catch(e:any) { onToast(e.message, 'error'); }
    setUpdating(null);
  }

  function openEdit(s:any) {
    if (editStage === s.stage) { closeEdit(); return; }
    setEditStage(s.stage);
    setGuia(s.tracking_number||'');
    setNotas(s.notes||'');
    setEta(s.eta ? String(s.eta).slice(0,10) : '');
    setCarrier(s.carrier||'');
    setCasilleroId(s.casillero_id||null);
    setCasilleroSearch(s.casillero_nombre||'');
    setCasilleroResults([]);
  }
  function closeEdit() {
    setEditStage(null); setGuia(''); setNotas(''); setEta(''); setCarrier(''); setCasilleroId(null); setCasilleroSearch(''); setCasilleroResults([]);
  }

  function onCasilleroSearch(q:string) {
    setCasilleroSearch(q);
    setCasilleroId(null);
    clearTimeout(casilleroTimer.current);
    if (!q.trim()) { setCasilleroResults([]); return; }
    casilleroTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch('/compras/casilleros/search?q='+encodeURIComponent(q));
        setCasilleroResults(Array.isArray(d)?d:(d?.data||[]));
      } catch {}
    }, 300);
  }

  const stageColor = (status: string) => {
    if (status === 'COMPLETADO') return 'bg-emerald-500 border-emerald-500';
    if (status === 'EN_PROCESO') return 'bg-blue-500 border-blue-500';
    return 'bg-gray-200 border-gray-300';
  };

  const diasTexto = (etaVal: string|null) => {
    if (!etaVal) return null;
    const d = Math.ceil((new Date(etaVal).getTime() - Date.now()) / 86400000);
    if (d > 0) return {txt:`${d} dia(s) restante(s)`, color:'text-blue-600'};
    if (d === 0) return {txt:'Vence hoy', color:'text-amber-600'};
    return {txt:`${Math.abs(d)} dia(s) de atraso`, color:'text-red-600'};
  };

  if (stages.length === 0) {
    return <p className="text-center py-10 text-gray-400 text-sm">Sin etapas de tracking configuradas para este pedido.</p>;
  }

  return (
    <div className="space-y-3">
      {showNewCasillero && (
        <NewCasilleroModal onClose={()=>setShowNewCasillero(false)} onSave={(c:any)=>{setCasilleroId(c.id);setCasilleroSearch(c.name);setCasilleroResults([]);setShowNewCasillero(false);}}/>
      )}
      {/* Visual progress bar */}
      <div className="flex items-center gap-1 mb-6">
        {stages.map((sd,i) => {
          const status = sd.status || 'PENDIENTE';
          return (
            <React.Fragment key={sd.stage}>
              <div className="flex flex-col items-center flex-1">
                <div className={'w-10 h-10 rounded-full flex items-center justify-center text-lg border-2 transition-all ' + stageColor(status)}>
                  {status === 'COMPLETADO' ? <CheckCircle2 size={18} className="text-white"/> :
                   status === 'EN_PROCESO' ? <Clock size={18} className="text-white"/> :
                   <span className="text-gray-400 text-sm">{i+1}</span>}
                </div>
                <p className="text-[10px] text-center text-gray-500 mt-1 max-w-[70px] leading-tight">{sd.label}</p>
                {sd.tracking_number && <p className="text-[9px] text-indigo-600 font-bold mt-0.5 max-w-[70px] truncate">{sd.tracking_number}</p>}
              </div>
              {i < stages.length - 1 && (
                <div className={'flex-none h-0.5 w-8 mt-[-24px] ' + (stages[i+1].status !== 'PENDIENTE' ? 'bg-emerald-400' : 'bg-gray-200')}/>
              )}
            </React.Fragment>
          );
        })}
      </div>

      {/* Stage cards */}
      {stages.map((sd) => {
        const status = sd.status || 'PENDIENTE';
        const history: any[] = sd.tracking_history || [];
        const isEditing = editStage === sd.stage;
        const dias = diasTexto(sd.eta);
        return (
          <div key={sd.stage} className={'rounded-2xl border p-4 transition-all ' + (status==='COMPLETADO'?'border-emerald-200 bg-emerald-50':status==='EN_PROCESO'?'border-blue-200 bg-blue-50':'border-gray-200 bg-white')}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-sm text-gray-900">{sd.label}</p>
                {sd.timestamp && <p className="text-[10px] text-gray-400">{fDate(sd.timestamp)}</p>}
              </div>
              <div className="flex items-center gap-2">
                <span className={'text-xs font-black px-2 py-1 rounded-full ' + (status==='COMPLETADO'?'bg-emerald-100 text-emerald-700':status==='EN_PROCESO'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-500')}>{status}</span>
                <button onClick={()=>openEdit(sd)} className="p-1.5 hover:bg-white rounded-lg border border-gray-200 text-gray-500"><Edit2 size={12}/></button>
              </div>
            </div>

            {/* ETA / carrier / casillero / timer */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-1">
              {sd.eta && <span className="flex items-center gap-1"><Clock size={11}/> ETA: <strong className="text-gray-700">{fDate(sd.eta)}</strong></span>}
              {sd.carrier && <span>Carrier: <strong className="text-gray-700">{sd.carrier}</strong></span>}
              {sd.casillero_nombre && <span className="flex items-center gap-1"><MapPin size={11}/> {sd.casillero_nombre}</span>}
              {dias && status !== 'COMPLETADO' && <span className={'font-bold ' + dias.color}>{dias.txt}</span>}
            </div>
            {sd.alert && status !== 'COMPLETADO' && (
              sd.alert.nivel === 'atrasado' ? (
                <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={12}/> {sd.alert.mensaje}
                </div>
              ) : (
                <div className="mb-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs font-bold text-blue-700 flex items-center gap-1.5">
                  <Clock size={12}/> {sd.alert.mensaje}
                </div>
              )
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">ETA de esta etapa</label>
                    <input type="date" value={eta} onChange={e=>setEta(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  </div>
                  <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Carrier</label>
                    <input value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="ej: DHL" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  </div>
                </div>
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Numero de Guia / Tracking</label>
                  <input value={guia} onChange={e=>setGuia(e.target.value)} placeholder="ej: 1Z999AA1234567890" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="relative">
                  <label className="text-xs font-black text-gray-400 uppercase mb-1 block">Casillero</label>
                  <input value={casilleroSearch} onChange={e=>onCasilleroSearch(e.target.value)} placeholder="Buscar casillero..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  {casilleroResults.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-32 overflow-y-auto">
                      {casilleroResults.map((c:any)=>(
                        <button key={c.id} type="button" onClick={()=>{setCasilleroId(c.id);setCasilleroSearch(c.name);setCasilleroResults([]);}} className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm">{c.name}</button>
                      ))}
                    </div>
                  )}
                  {casilleroSearch && !casilleroId && (
                    <button type="button" onClick={()=>setShowNewCasillero(true)} className="mt-1 text-xs text-purple-600 font-bold hover:underline">+ Crear casillero "{casilleroSearch}"</button>
                  )}
                </div>
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Notas</label>
                  <input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Notas de esta etapa..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {status !== 'EN_PROCESO' && <button onClick={()=>updateStage(sd.stage,'EN_PROCESO')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><Clock size={12}/> Marcar En Proceso</button>}
                  {status !== 'COMPLETADO' && <button onClick={()=>updateStage(sd.stage,'COMPLETADO')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><CheckCircle2 size={12}/> Marcar Completado</button>}
                  {status !== 'PENDIENTE' && <button onClick={()=>updateStage(sd.stage,'PENDIENTE')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold disabled:opacity-50"><RotateCcw size={12}/> Revertir</button>}
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
                    <span className="text-gray-300">&middot;</span>
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
  const router = useRouter();
  const [detail, setDetail] = useState<any>(pec);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('tracking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editEstado, setEditEstado] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [goingToRecepcion, setGoingToRecepcion] = useState(false);
  const [infoEdit, setInfoEdit] = useState(false);
  const [infoForm, setInfoForm] = useState<any>({});
  const [savingInfo, setSavingInfo] = useState(false);

  // "Hacer Recepcion": ir directo a LA recepcion de este PEC, no al hub general
  // (con cientos de pedidos, aterrizar en la lista completa obliga a buscarla).
  // Si ya existe una (GoodsReceipt), abrirla; si no, crearla y abrir la nueva.
  async function goToRecepcion() {
    setGoingToRecepcion(true);
    try {
      const existing = detail?.recepciones?.[detail.recepciones.length - 1];
      if (existing?.id) { router.push(`/dashboard/compras/recepciones/${existing.id}`); return; }
      const user = localStorage.getItem('user_name') || '';
      const r = await apiFetch(`/compras/pedidos/${pec.id}/recepcionar`, {
        method: 'POST',
        body: JSON.stringify({ created_by: user, force_full: false }),
      });
      router.push(`/dashboard/compras/recepciones/${r.id}`);
    } catch (e: any) {
      onToast(e.message, 'error');
    }
    setGoingToRecepcion(false);
  }

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

  // El backend ya acepta editar proveedor/notas/fechas/modalidad via el mismo
  // PATCH que usa el cambio de estado -- solo faltaba exponerlo en la UI, que
  // antes solo mostraba estos campos como texto fijo.
  const openInfoEdit = () => {
    setInfoForm({
      supplier_name: detail?.supplier_name || '',
      supplier_ref: detail?.supplier_ref || '',
      modalidad_pago: detail?.modalidad_pago || 'Contado',
      metodo_pago: detail?.metodo_pago || '',
      fecha_entrega_estimada: detail?.fecha_entrega_estimada ? detail.fecha_entrega_estimada.slice(0,10) : '',
      notas: detail?.notas || '',
    });
    setInfoEdit(true);
  };
  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      await apiFetch('/compras/pedidos/'+pec.id,{method:'PATCH',body:JSON.stringify({...infoForm,updated_by:localStorage.getItem('user_name')||''})});
      onToast('Informacion actualizada','ok'); onUpdate(); await loadFull();
      setInfoEdit(false);
    } catch(e:any){ onToast(e.message,'error'); }
    setSavingInfo(false);
  };

  const cancelPec = async () => {
    if (!confirm('Cancelar este PEC?')) return;
    await changeEstado('CANCELADO');
    onClose();
  };

  const deletePec = async () => {
    if (!confirm(`Eliminar definitivamente ${detail?.numero || pec.numero}? Esta accion no se puede deshacer.`)) return;
    try {
      await apiFetch('/compras/pedidos/'+pec.id, {method:'DELETE'});
      onToast('PEC eliminado','ok'); onUpdate(); onClose();
    } catch(e:any){ onToast(e.message,'error'); }
  };

  if (!pec) return null;
  const est = PEC_ESTADOS[detail?.estado] || PEC_ESTADOS.BORRADOR;
  const pvens = detail?.pedidos_venta?.length ? detail.pedidos_venta.map((v:any)=>v.numero) : (detail?.ven_numero ? [detail.ven_numero] : []);

  return (
    <>
      {showConfig && <TrackingConfigModal onClose={()=>setShowConfig(false)} onToast={onToast}/>}
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
            <button onClick={()=>setShowConfig(true)} title="Configurar etapas, alertas y casilleros" className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><Settings2 size={16}/></button>
            <div className="relative">
              <button onClick={()=>setMenuOpen(m=>!m)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><MoreHorizontal size={18}/></button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-10" onClick={(e:any)=>e.stopPropagation()}>
                  <button onClick={()=>{setMenuOpen(false);loadFull();}} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2"><RefreshCw size={13}/> Recargar</button>
                  <div className="border-t border-gray-100 my-1"/>
                  {detail?.estado !== 'CANCELADO' ? (
                    <button onClick={()=>{cancelPec();setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar PEC</button>
                  ) : (
                    <button onClick={()=>{deletePec();setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Eliminar definitivamente</button>
                  )}
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

        {/* Mercancia recibida: falta hacer la recepcion fisica, o ya existe y
            hay que poder volver a ella -- antes el banner (y su unico link a
            la recepcion) desaparecia por completo en cuanto se creaba una,
            dejando sin forma de volver a encontrarla desde el PEC. */}
        {['RECIBIDO','RECIBIDA'].includes(detail?.estado) && (
          <div className="mx-8 mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><PackageCheck size={18}/></div>
              <div>
                <p className="font-black text-emerald-900 text-sm">
                  {detail?.recepciones?.length > 0 ? 'Mercancia recibida en bodega' : 'Mercancia recibida en bodega — pendiente por recepcion'}
                </p>
                <p className="text-xs text-emerald-700">
                  {detail?.recepciones?.length > 0
                    ? `Recepcion ${detail.recepciones[detail.recepciones.length-1].numero} en curso.`
                    : 'Inicia el conteo fisico de este pedido.'}
                </p>
              </div>
            </div>
            <button onClick={goToRecepcion} disabled={goingToRecepcion} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 transition-colors shrink-0 disabled:opacity-50 flex items-center gap-2">
              {goingToRecepcion && <RefreshCw size={12} className="animate-spin"/>}
              {detail?.recepciones?.length > 0 ? 'Ver Recepcion' : 'Hacer Recepcion'}
            </button>
          </div>
        )}

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
                {[['Modalidad',detail?.modalidad_pago||'-'],['Carrier',detail?.carrier||'-'],['Casillero',detail?.casillero_nombre||'-'],['Tracking',detail?.tracking_number||'-']].map(([l,v],i)=>(
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
                    <tr><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-center">Destino</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detail?.productos||[]).map((p:any,i:number)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium truncate max-w-[160px]">{p.producto_nombre||p.descripcion||p.nombre||'-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${p.destino==='MAU'?'bg-purple-100 text-purple-700':p.destino==='NEBULAE'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>
                            {p.destino==='MAU'?'Socio Mau':p.destino==='NEBULAE'?'Stock Nebulae':(p.cliente_nombre ? `Cliente (${p.cliente_nombre})` : 'Cliente')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">{p.qty||p.cantidad||0}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{fCOP(p.unit_price_cop||p.precio_unitario||0)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fCOP((p.qty||p.cantidad||0)*(p.unit_price_cop||p.precio_unitario||0))}</td>
                      </tr>
                    ))}
                    {!(detail?.productos?.length) && <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-xs">Sin productos</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && tab === 'pvens' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-black text-gray-400 uppercase mb-4">Pedidos de Venta Asociados</p>
                {/* pedidos_venta viene de SaleOrder.pec_id (el vinculo real y
                    completo) en vez del ven_id/ven_numero del PEC, que solo
                    guardan el primer PVEN de una compra consolidada -- asi se
                    ven y enlazan TODOS los PVEN, no solo el primero. */}
                {!(detail?.pedidos_venta?.length) ? (
                  <p className="text-gray-400 text-sm text-center py-6">Sin PVEN asociados</p>
                ) : detail.pedidos_venta.map((v:any)=>(
                  <div key={v.id} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100 mb-2">
                    <div>
                      <span className="font-bold text-indigo-700 block">{v.numero}</span>
                      <span className="text-xs text-gray-500">{v.customer_name||'-'} · {fCOP(v.total_cop)}</span>
                    </div>
                    <Link href={`/dashboard/ventas/venta?id=${v.id}`} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold"><ExternalLink size={11}/> Ver</Link>
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === 'info' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-black text-gray-400 uppercase">Informacion del PEC</p>
                    {!infoEdit ? (
                      <button onClick={openInfoEdit} className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800"><Edit2 size={12}/> Editar</button>
                    ) : (
                      <div className="flex gap-2">
                        <button onClick={()=>setInfoEdit(false)} disabled={savingInfo} className="text-xs font-bold text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancelar</button>
                        <button onClick={saveInfo} disabled={savingInfo} className="flex items-center gap-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg disabled:opacity-50">
                          {savingInfo && <RefreshCw size={11} className="animate-spin"/>} Guardar
                        </button>
                      </div>
                    )}
                  </div>
                  {!infoEdit ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {[['Numero',detail?.numero],['Estado',detail?.estado],['Proveedor',detail?.supplier_name||'-'],['Ref/NIT',detail?.supplier_ref||'-'],['Modalidad Pago',detail?.modalidad_pago||'-'],['Metodo Pago',detail?.metodo_pago||'-'],['Entrega Est.',fDate(detail?.fecha_entrega_estimada)],['Creado por',detail?.created_by||'-'],['Actualizado',fDate(detail?.updated_at)]].map(([l,v],i)=>(
                        <div key={i}><span className="block text-gray-400 text-xs font-black uppercase mb-0.5">{l}</span><span className="font-bold text-gray-900">{v||'-'}</span></div>
                      ))}
                      <div className="col-span-2"><span className="block text-gray-400 text-xs font-black uppercase mb-0.5">Notas</span><span className="font-bold text-gray-900 whitespace-pre-wrap">{detail?.notas||'-'}</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Proveedor</label>
                        <input value={infoForm.supplier_name} onChange={e=>setInfoForm((f:any)=>({...f,supplier_name:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Ref/NIT</label>
                        <input value={infoForm.supplier_ref} onChange={e=>setInfoForm((f:any)=>({...f,supplier_ref:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Modalidad Pago</label>
                        <select value={infoForm.modalidad_pago} onChange={e=>setInfoForm((f:any)=>({...f,modalidad_pago:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                          {/* Si el valor guardado no esta en esta lista (formato viejo/libre,
                              ej. "Credito 60d" en vez de "Credito 60 dias"), se agrega como
                              opcion extra para que el select muestre el valor real en vez de
                              caer en la primera opcion silenciosamente. */}
                          {(['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'] as string[])
                            .concat(infoForm.modalidad_pago && !['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'].includes(infoForm.modalidad_pago) ? [infoForm.modalidad_pago] : [])
                            .map(o=><option key={o}>{o}</option>)}
                        </select></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Metodo Pago</label>
                        <input value={infoForm.metodo_pago} onChange={e=>setInfoForm((f:any)=>({...f,metodo_pago:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Fecha Entrega Est.</label>
                        <input type="date" value={infoForm.fecha_entrega_estimada} onChange={e=>setInfoForm((f:any)=>({...f,fecha_entrega_estimada:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div className="col-span-2"><label className="block text-gray-400 text-xs font-black uppercase mb-1">Notas</label>
                        <textarea value={infoForm.notas} onChange={e=>setInfoForm((f:any)=>({...f,notas:e.target.value}))} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200"/></div>
                    </div>
                  )}
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
  const [casilleroSearch, setCasilleroSearch] = useState('');
  const [casilleroResults, setCasilleroResults] = useState<any[]>([]);
  const [selectedCasillero, setSelectedCasillero] = useState<any>(null);
  const [showNewCasillero, setShowNewCasillero] = useState(false);
  const [casilleroTimer, setCasilleroTimer] = useState<any>(null);
  const [form, setForm] = useState({
    modalidad_pago:'Contado', metodo_pago:'', tipo_envio:'casillero',
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

  const onCasilleroType = (val: string) => {
    setCasilleroSearch(val);
    setSelectedCasillero(null);
    clearTimeout(casilleroTimer);
    if (!val.trim()) { setCasilleroResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/compras/casilleros/search?q='+encodeURIComponent(val));
        const arr = Array.isArray(res) ? res : (res?.data || []);
        setCasilleroResults(arr);
        if (arr.length === 0) setShowNewCasillero(true);
      } catch {}
    }, 350);
    setCasilleroTimer(t);
  };

  const addProduct = () => setProductos(prev => [...prev, {nombre:'',descripcion:'',sku_id:null,qty:1,unit_price_cop:0,impuesto_pct:0,tracking:'',entrega_est:'',casillero:'',notas:'',estado:'PENDIENTE',destino:'CLIENTE'}]);
  const setProd = (i:number, k:string, v:any) => setProductos(prev => prev.map((p,idx)=>idx===i?{...p,[k]:v}:p));
  const delProd = (i:number) => setProductos(prev => prev.filter((_,idx)=>idx!==i));

  // Product autocomplete for PEC lines — without this, descripcion is free
  // text with no sku_id, so purchase_order_lines.sku_id (and everything that
  // depends on it downstream: goods_receipt_lines, InventoryLevel) stays
  // NULL forever and a completed reception never actually moves stock, no
  // matter how many tracking stages get marked done. Confirmed live: a
  // 5-unit reception on a text-only line closed as "Validado" but
  // stock_actualizado stayed false because receipt_type=="FISICA" still
  // requires a real sku_id to touch InventoryLevel.
  const [prodSearchIdx, setProdSearchIdx] = useState<number|null>(null);
  const [prodSearchResults, setProdSearchResults] = useState<any[]>([]);
  const [prodSearchTimer, setProdSearchTimer] = useState<any>(null);

  const searchProduct = (i:number, val:string) => {
    setProd(i, 'descripcion', val);
    setProd(i, 'sku_id', null); // typing again after picking one un-links it — must re-pick to relink
    setProdSearchIdx(i);
    if (prodSearchTimer) clearTimeout(prodSearchTimer);
    if (!val || val.length < 1) { setProdSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/crm/products/search?q='+encodeURIComponent(val));
        setProdSearchResults(Array.isArray(res) ? res : (res?.data || []));
      } catch { setProdSearchResults([]); }
    }, 300);
    setProdSearchTimer(t);
  };

  const pickProduct = (i:number, item:any) => {
    setProductos(prev => prev.map((p,idx)=>idx===i?{
      ...p, descripcion: item.display || item.product_name, sku_id: item.id,
      unit_price_cop: Number(p.unit_price_cop) > 0 ? p.unit_price_cop : item.sale_price,
    }:p));
    setProdSearchIdx(null);
    setProdSearchResults([]);
  };

  useEffect(() => {
    // Always derive from the current lines — falling back to the previous
    // form.subtotal_cop when it was already non-zero (as this used to do)
    // meant that once any line got a price, editing qty/price afterward on
    // any line no longer recalculated the total: it stuck at whatever the
    // subtotal happened to be the first time this effect saw a non-zero value.
    const sub = productos.reduce((s,p)=>s+(Number(p.qty||0)*Number(p.unit_price_cop||0)),0);
    setF('subtotal_cop', sub);
    setF('total_cop', sub);
  }, [productos]);

  const filteredPvens = pedidosVenta.filter(p =>
    p.estado === 'PENDIENTE_COMPRA' &&
    JSON.stringify(p).toLowerCase().includes(searchPven.toLowerCase())
  );

  async function submit() {
    if (!selectedSupplier) { onToast('Selecciona un proveedor','error'); return; }
    const sinPrecio = productos.find(p => !(Number(p.unit_price_cop) > 0));
    if (sinPrecio) {
      onToast(`"${sinPrecio.nombre || sinPrecio.descripcion || 'Un producto'}" no tiene precio. Ingresa un precio antes de crear el pedido.`, 'error');
      return;
    }
    setSaving(true);
    try {
      const user = localStorage.getItem('user_name') || '';
      const pvensSelected = pedidosVenta.filter(p=>selectedPvens.has(p.id));
      const payload = {
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.name,
        supplier_ref: selectedSupplier.reference,
        ven_id: pvensSelected[0]?.id || null,
        // ven_numero es VARCHAR(20) en la BD -- no cabe una lista unida por comas
        // de varios PVEN reales. El vinculo real de cada PVEN adicional vive en
        // su propio pec_id/pec_numero (ver loop de PATCH mas abajo), asi que aqui
        // solo va el primero como referencia legible.
        ven_numero: pvensSelected[0]?.numero || null,
        modalidad_pago: form.modalidad_pago,
        metodo_pago: form.metodo_pago || null,
        tipo_envio: form.tipo_envio,
        casillero_id: selectedCasillero?.id || null,
        carrier: form.carrier || null,
        dias_entrega: Number(form.dias_entrega) || 15,
        fecha_entrega_estimada: form.fecha_entrega_estimada || null,
        notas: form.notas || null,
        productos: productos.map(p=>({...p,qty:Number(p.qty),unit_price_cop:Number(p.unit_price_cop)})),
        subtotal_cop: form.subtotal_cop,
        total_cop: form.total_cop,
        created_by: user,
      };
      const pec = await apiFetch('/compras/pedidos',{method:'POST',body:JSON.stringify(payload)});
      const pecObj = pec?.data ?? pec;
      // El POST solo vincula el primer PVEN seleccionado (payload.ven_id); el resto
      // se vincula aqui explicitamente para que TODOS los PVEN marcados queden con
      // pec_id/pec_numero, no solo el primero.
      const restantes = pvensSelected.slice(1);
      for (const pv of restantes) {
        await apiFetch(`/ventas/pedidos/${pv.id}`,{method:'PATCH',body:JSON.stringify({
          pec_id: pecObj.id, pec_numero: pecObj.numero, estado:'EN_PROCESO', updated_by:user,
        })}).catch(()=>{});
      }
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
      {showNewCasillero && (
        <NewCasilleroModal
          onSave={(c)=>{setSelectedCasillero(c);setCasilleroSearch(c.name);setCasilleroResults([]);setShowNewCasillero(false);}}
          onClose={()=>setShowNewCasillero(false)}
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
                        <div className="relative">
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Casillero</label>
                          <input value={casilleroSearch} onChange={e=>onCasilleroType(e.target.value)}
                            placeholder="Buscar casillero..."
                            className={'w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 ' + (selectedCasillero?'border-emerald-300 bg-emerald-50':'border-gray-200')}/>
                          {selectedCasillero && <CheckCircle2 size={16} className="absolute right-3 top-9 text-emerald-600"/>}
                          {casilleroResults.length > 0 && !selectedCasillero && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-10 overflow-hidden">
                              {casilleroResults.map((c:any)=>(
                                <button key={c.id} type="button" onClick={()=>{setSelectedCasillero(c);setCasilleroSearch(c.name);setCasilleroResults([]);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm">{c.name}</button>
                              ))}
                              <button type="button" onClick={()=>setShowNewCasillero(true)} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-2 text-purple-600 font-bold border-t border-gray-100">
                                <Plus size={13}/> Agregar nuevo casillero
                              </button>
                            </div>
                          )}
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
                              <th className="pb-2 text-center w-28">Destino</th>
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
                                <td className="py-2 pr-3 relative">
                                  <input value={p.nombre||p.descripcion||''} onChange={e=>searchProduct(i,e.target.value)} onFocus={()=>setProdSearchIdx(i)}
                                    placeholder="Buscar producto del catalogo..."
                                    className={`w-full border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 ${p.sku_id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}/>
                                  {p.sku_id && <span className="absolute right-2 top-1.5 text-[10px] text-emerald-600" title="Vinculado al catalogo (sku_id presente)">&#10003;</span>}
                                  {prodSearchIdx===i && prodSearchResults.length>0 && (
                                    <div className="absolute z-20 top-full left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                      {prodSearchResults.map((r:any)=>(
                                        <button type="button" key={r.id} onClick={()=>pickProduct(i,r)}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 border-b border-gray-100 last:border-0">
                                          <div className="font-bold text-gray-800">{r.product_name}</div>
                                          {r.sku && <div className="text-gray-400">{r.sku} · {fCOP(r.sale_price)}</div>}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 pr-2 text-center"><select value={p.destino||'CLIENTE'} onChange={e=>setProd(i,'destino',e.target.value)} className="w-28 border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 bg-white font-semibold"><option value="CLIENTE">Cliente</option><option value="NEBULAE">Stock Nebulae</option><option value="MAU">Socio Mau</option></select></td>
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
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState<{msg:string;type:string}|null>(null);
  const [pedidos, setPedidos]         = useState<any[]>([]);
  const [pedidosVenta, setPedidosVenta] = useState<any[]>([]);
  const [stats, setStats]             = useState<any>({});
  const [activeTab, setActiveTab]     = useState('Todos');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize]       = useState(25);
  const [viewMode, setViewMode]       = useState<'lista'|'kanban'>('lista');
  const [search, setSearch]           = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByMonth, setGroupByMonth] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState<Set<string>>(new Set());
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [selectedPec, setSelectedPec] = useState<any>(null);
  const [menuOpenId, setMenuOpenId]   = useState<number|null>(null);
  const [menuPos, setMenuPos] = useState<{top?:number; bottom?:number; left:number}|null>(null);
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

  // Deep-link: otras paginas (ej. Mercancia en Transito) enlazan aqui con
  // ?id=<pec_id> para abrir directamente el panel de detalle de ese PEC.
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam || loading) return;
    const found = pedidos.find(p => String(p.id) === idParam);
    if (found) { setSelectedPec(found); return; }
    apiFetch('/compras/pedidos/'+idParam).then(setSelectedPec).catch(()=>{});
  }, [searchParams, pedidos, loading]);

  const closePecPanel = useCallback(() => {
    setSelectedPec(null);
    if (searchParams.get('id')) router.replace(pathname);
  }, [searchParams, router, pathname]);

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
  const cancelados = pedidos.filter(p=>p.estado==='CANCELADO');
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
    {k:'Cancelados', count:cancelados.length,    data:cancelados},
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
    const menuBtnRef = useRef<HTMLButtonElement|null>(null);
    // menuPos vive en el padre (no aqui) -- PecRow se redefine en cada render
    // del padre (es una funcion anidada dentro de su cuerpo), asi que un
    // setMenuOpenId del padre remonta esta fila con un tipo "nuevo" y
    // cualquier estado local propio de PecRow se perdia justo despues de
    // calcularlo, dejando el menu con menuPos=null para siempre.
    const toggleMenu = () => {
      if (menuOpenId === p.id) { setMenuOpenId(null); return; }
      const rect = menuBtnRef.current?.getBoundingClientRect();
      if (rect) {
        // Menu es ~150px alto; si no cabe hacia abajo en el viewport (el caso
        // de la ultima fila visible, sea o no la ultima fila de la tabla),
        // se abre hacia arriba en vez de quedar cortado por el overflow-hidden
        // del contenedor de la tabla.
        const menuHeight = 150;
        if (rect.bottom + menuHeight > window.innerHeight) {
          setMenuPos({ bottom: window.innerHeight - rect.top + 4, left: rect.right - 208 });
        } else {
          setMenuPos({ top: rect.bottom + 4, left: rect.right - 208 });
        }
      }
      setMenuOpenId(p.id);
    };
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
              <button ref={menuBtnRef} onClick={e=>{e.stopPropagation();toggleMenu();}} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><MoreHorizontal size={13}/></button>
              {menuOpenId===p.id && menuPos && (
                <div style={{position:'fixed', top:menuPos.top, bottom:menuPos.bottom, left:menuPos.left}} className="bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-50" onClick={(e:any)=>e.stopPropagation()}>
                  <button onClick={()=>{setSelectedPec(p);setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm flex items-center gap-2"><Eye size={13} className="text-purple-600"/> Ver Detalle</button>
                  {p.estado !== 'CANCELADO' && (
                    <button onClick={async()=>{try{await apiFetch('/compras/pedidos/'+p.id,{method:'PATCH',body:JSON.stringify({estado:'EMITIDO'})});showToast('Marcado como Emitido','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm flex items-center gap-2 text-amber-700"><Send size={13}/> Marcar Emitido</button>
                  )}
                  <div className="border-t border-gray-100 my-1"/>
                  {p.estado !== 'CANCELADO' ? (
                    <button onClick={async()=>{try{await apiFetch('/compras/pedidos/'+p.id,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO'})});showToast('Cancelado','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar PEC</button>
                  ) : (
                    <button onClick={async()=>{if(!confirm(`Eliminar definitivamente ${p.numero}? Esta accion no se puede deshacer.`))return;try{await apiFetch('/compras/pedidos/'+p.id,{method:'DELETE'});showToast('PEC eliminado','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Eliminar definitivamente</button>
                  )}
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
          onClose={closePecPanel}
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
                  {filteredData.slice((currentPage-1)*pageSize, currentPage*pageSize).map((p:any)=><PecRow key={p.id} p={p}/>)}
                </tbody>
              </table>
            )}
            {activeTab!=='Analisis'&&(
              <div className="px-5 py-3 border-t border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-400">{filteredData.length} registros</span>
                  <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none">
                    <option value={25}>25 por página</option>
                    <option value={50}>50 por página</option>
                  </select>
                  {selectedIds.size>0&&<span className="text-purple-600 font-bold text-xs">{selectedIds.size} seleccionados</span>}
                </div>
                {Math.ceil(filteredData.length/pageSize)>1&&(
                  <div className="flex items-center gap-1">
                    <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
                    <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
                    {Array.from({length:Math.min(5,Math.ceil(filteredData.length/pageSize))},(_,i)=>{
                      const tp=Math.ceil(filteredData.length/pageSize);let page=i+1;
                      if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                      return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-indigo-600 text-white border-indigo-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
                    })}
                    <button disabled={currentPage===Math.ceil(filteredData.length/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
                    <button disabled={currentPage===Math.ceil(filteredData.length/pageSize)} onClick={()=>setCurrentPage(Math.ceil(filteredData.length/pageSize))} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
                  </div>
                )}
              </div>
            )}
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
