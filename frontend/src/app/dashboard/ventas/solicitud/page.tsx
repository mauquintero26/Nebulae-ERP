'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  FileText, AlertTriangle, CheckCircle2, Clock, Search, Plus, X,
  User, Phone, Mail, MapPin, ExternalLink, RefreshCw, ArrowRight,
  Activity, ChevronRight, MoreVertical, DollarSign, MessageCircle,
  Edit2, Save, Package, Send, AlertCircle, ChevronDown, Truck,
  Trash2, RotateCcw, UserPlus, LayoutGrid, List, ShieldAlert,
  MessageSquare, Paperclip, Camera
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers as any || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const SUB_MODULES = [
  { name: 'Solicitud',      path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',     path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta',          path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',   path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango', path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion', path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',   path: '/dashboard/ventas/proyecciones' },
];

const TIPOS_SC = [
  'Cotizacion de Producto',
  'Seguimiento',
  'Programar Entrega',
  'Devolucion de Producto',
  'Soporte Tecnico',
  'Nuevo Lead',
];

const MODALIDADES_PAGO = [
  'Contado',
  '60/40 (60% anticipo - 40% pendiente)',
  'Credito 30 dias',
  'Credito 60 dias',
  'Otro',
];

const ESTADOS_SC: Record<string, {label:string; color:string; bg:string; border:string}> = {
  BORRADOR:               {label:'Borrador',           color:'#64748b',bg:'#f1f5f9',border:'#e2e8f0'},
  PENDIENTE_CONFIRMACION: {label:'Pend. confirmacion', color:'#b45309',bg:'#fffbeb',border:'#fde68a'},
  CONFIRMADA:             {label:'Confirmada',         color:'#065f46',bg:'#f0fdf4',border:'#a7f3d0'},
  CANCELADA:              {label:'Cancelada',          color:'#991b1b',bg:'#fef2f2',border:'#fecaca'},
};

const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
const fCOP  = (v: any)   => { const n=Number(v)||0; return n>0?'$'+n.toLocaleString('es-CO'):'-'; };

function EstadoBadge({estado}: {estado:string}) {
  const cfg = ESTADOS_SC[estado] || {label:estado,color:'#4338ca',bg:'#eef2ff',border:'#c7d2fe'};
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border"
      style={{backgroundColor:cfg.bg,color:cfg.color,borderColor:cfg.border}}>
      {cfg.label}
    </span>
  );
}

function TipoBadge({tipo}: {tipo:string}) {
  const map: Record<string,string> = {
    'Cotizacion de Producto':'bg-indigo-100 text-indigo-700',
    'Seguimiento':           'bg-blue-100 text-blue-700',
    'Programar Entrega':     'bg-teal-100 text-teal-700',
    'Devolucion de Producto':'bg-orange-100 text-orange-700',
    'Soporte Tecnico':       'bg-purple-100 text-purple-700',
    'Nuevo Lead':            'bg-emerald-100 text-emerald-700',
  };
  return <span className={`inline-flex px-2 py-0.5 rounded text-[11px] font-bold ${map[tipo]||'bg-slate-100 text-slate-600'}`}>{tipo||'Sin tipo'}</span>;
}

function Toast({msg,type,onClose}: {msg:string;type:'ok'|'err';onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,4000);return()=>clearTimeout(t);},[onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 text-white ${type==='ok'?'bg-emerald-600':'bg-red-600'}`}>
      {type==='ok'?<CheckCircle2 size={16}/>:<AlertCircle size={16}/>}
      <span>{msg}</span>
      <button onClick={onClose}><X size={14}/></button>
    </div>
  );
}

function ActionDot({action}: {action:string}) {
  const colors: Record<string,string> = {CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',NOTE_ADDED:'#3b82f6',CONFIRMED:'#059669',CANCELLED:'#ef4444',UPDATED:'#8b5cf6',CHATTER:'#0891b2'};
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white" style={{backgroundColor:colors[action]||'#94a3b8'}}/>;
}

// ── New Client Modal ────────────────────────────────────────────────────────
function NewClientModal({onSave, onClose}: {onSave:(c:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({first_name:'',last_name:'',phone:'',email:'',address:'',city:''});
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name) return;
    setSaving(true);
    try {
      const d = await apiFetch('/crm/customers', {method:'POST', body:JSON.stringify(form)});
      onSave(d);
    } catch(err:any) { alert('Error: '+err.message); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-3xl">
          <div>
            <h3 className="font-extrabold text-lg text-slate-900 flex items-center gap-2"><UserPlus size={20} className="text-indigo-600"/>Nuevo Cliente</h3>
            <p className="text-xs text-slate-500">El cliente no esta en la base de datos. Completar para continuar.</p>
          </div>
          <button onClick={onClose}><X size={18} className="text-slate-400"/></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">Nombre *</label>
              <input required value={form.first_name} onChange={e=>setForm(f=>({...f,first_name:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">Apellido</label>
              <input value={form.last_name} onChange={e=>setForm(f=>({...f,last_name:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">Telefono</label>
              <input value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="text-xs font-bold text-slate-500 mb-1 block">Email</label>
              <input type="email" value={form.email} onChange={e=>setForm(f=>({...f,email:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          </div>
          <div><label className="text-xs font-bold text-slate-500 mb-1 block">Direccion</label>
            <input value={form.address} onChange={e=>setForm(f=>({...f,address:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          <div><label className="text-xs font-bold text-slate-500 mb-1 block">Ciudad</label>
            <input value={form.city} onChange={e=>setForm(f=>({...f,city:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm">Cancelar</button>
            <button type="submit" disabled={saving} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm shadow disabled:opacity-50 flex items-center justify-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<UserPlus size={14}/>} Guardar Cliente
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Product Not Found Modal ─────────────────────────────────────────────────
function ProductNotFoundModal({name,onConfirm,onCancel}: {name:string;onConfirm:()=>void;onCancel:()=>void}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-7 max-w-sm w-full mx-4 text-center">
        <div className="w-14 h-14 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4"><Package className="text-amber-600" size={24}/></div>
        <h3 className="font-extrabold text-lg text-slate-900 mb-2">Producto no encontrado</h3>
        <p className="text-slate-600 text-sm mb-1">El producto <strong>"{name}"</strong> no existe en la base de datos.</p>
        <p className="text-slate-500 text-xs mb-6">Puedes continuar con este nombre o dejarlo en Notas para cotizarlo.</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-2.5 rounded-xl border border-slate-300 text-slate-700 font-bold text-sm">No, Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-sm">Si, Continuar</button>
        </div>
      </div>
    </div>
  );
}

// ── Product Search ──────────────────────────────────────────────────────────
function ProductSearch({value,onChange,onSelect,onConfirmNew}:{value:string;onChange:(v:string)=>void;onSelect:(p:any)=>void;onConfirmNew:(n:string)=>void}) {
  const [results,setResults]=useState<any[]>([]);
  const [showModal,setShowModal]=useState(false);
  const [open,setOpen]=useState(false);
  const [pending,setPending]=useState('');
  const timer=useRef<any>(null);
  function handle(v:string) {
    onChange(v); setShowModal(false); setOpen(false);
    if(timer.current) clearTimeout(timer.current);
    if(!v.trim()){setResults([]);return;}
    timer.current=setTimeout(async()=>{
      try{
        const d=await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        const list=Array.isArray(d)?d:(d?.data??[]);
        setResults(list); setOpen(true);
        if(list.length===0&&v.length>2){setPending(v);setShowModal(true);}
      }catch{setResults([]);}
    },300);
  }
  return (
    <div className="relative">
      <input type="text" value={value} onChange={e=>handle(e.target.value)} placeholder="Buscar producto en catalogo..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"/>
      {open&&results.length>0&&(
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
          {results.map((p:any)=>(
            <button key={p.id||p.name} type="button" onClick={()=>{onSelect(p);setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-800">{p.name||p.product_name}</span>
              {p.sku&&<span className="ml-2 text-xs text-slate-400">SKU:{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
      {showModal&&<ProductNotFoundModal name={pending} onConfirm={()=>{onConfirmNew(pending);setShowModal(false);}} onCancel={()=>{onChange('');setShowModal(false);setPending('');}}/>}
    </div>
  );
}

// ── 3-dot Row Menu ──────────────────────────────────────────────────────────
function RowMenu({sc,onView,onChangeEstado,onDelete}:{sc:any;onView:()=>void;onChangeEstado:(e:string)=>void;onDelete:()=>void}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<any>(null);
  useEffect(()=>{
    function close(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);
  return (
    <div className="relative" ref={ref}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><MoreVertical size={15}/></button>
      {open&&(
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-48 py-1">
          <button onClick={()=>{onView();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm font-medium flex items-center gap-2"><FileText size={14} className="text-indigo-500"/>Ver Detalle</button>
          <button onClick={()=>{onView();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm font-medium flex items-center gap-2"><Edit2 size={14} className="text-amber-500"/>Editar</button>
          <div className="border-t border-slate-100 my-1"/>
          {Object.entries(ESTADOS_SC).map(([k,v])=>(
            <button key={k} onClick={()=>{onChangeEstado(k);setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs font-bold" style={{color:v.color}}>
              Estado: {v.label}
            </button>
          ))}
          <div className="border-t border-slate-100 my-1"/>
          <button onClick={()=>{onDelete();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-red-50 text-sm font-medium flex items-center gap-2 text-red-600"><Trash2 size={14}/>Eliminar</button>
        </div>
      )}
    </div>
  );
}

// ── Chatter Tab ─────────────────────────────────────────────────────────────
function ChatterTab({sc,currentUser}:{sc:any;currentUser:string}) {
  const [messages,setMessages]=useState<any[]>([]);
  const [input,setInput]=useState('');
  const [sending,setSending]=useState(false);
  const phone=sc?.customer_phone||'';
  async function send() {
    if(!input.trim()||!sc) return;
    setSending(true);
    const msg={text:input,from:'asesor',time:new Date().toISOString()};
    setMessages(prev=>[...prev,msg]);
    try{
      await apiFetch(`/ventas/solicitudes/${sc.id}/actividad`,{method:'POST',body:JSON.stringify({action:'CHATTER',description:input,user_name:currentUser})});
    }catch{}
    setInput('');setSending(false);
  }
  function openWA() {
    if(!phone) return;
    const text=encodeURIComponent(input||`Hola, te contactamos sobre tu solicitud ${sc?.numero}`);
    window.open(`https://wa.me/57${phone.replace(/\D/g,'')}?text=${text}`,'_blank');
    if(input){send();}
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {sc?.actividades?.filter((a:any)=>a.action==='CHATTER').map((a:any)=>(
          <div key={a.id} className="bg-slate-100 rounded-xl p-3 max-w-[85%]">
            <p className="text-sm text-slate-800">{a.description}</p>
            <p className="text-xs text-slate-400 mt-1">{a.user_name} - {fDate(a.created_at)} {fTime(a.created_at)}</p>
          </div>
        ))}
        {messages.filter(m=>m.from==='asesor').map((m:any,i:number)=>(
          <div key={`local-${i}`} className="bg-indigo-100 rounded-xl p-3 max-w-[85%] ml-auto">
            <p className="text-sm text-indigo-900">{m.text}</p>
            <p className="text-xs text-indigo-400 mt-1">{fTime(m.time)}</p>
          </div>
        ))}
        {!sc?.actividades?.some((a:any)=>a.action==='CHATTER')&&messages.length===0&&(
          <p className="text-xs text-slate-400 italic text-center py-8">Sin mensajes. Usa el campo de abajo para chatear con el cliente.</p>
        )}
      </div>
      <div className="border-t border-slate-100 p-3">
        <div className="flex gap-2 mb-2">
          <textarea value={input} onChange={e=>setInput(e.target.value)} rows={2} placeholder="Escribe un mensaje..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
        </div>
        <div className="flex gap-2">
          <button onClick={openWA} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50" disabled={!phone}>
            <MessageCircle size={13}/>WhatsApp
          </button>
          <button onClick={send} disabled={!input.trim()||sending} className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50">
            {sending?<RefreshCw size={12} className="animate-spin"/>:<Send size={12}/>}Registrar
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────
export default function SolicitudesPage() {
  const [solicitudes,setSolicitudes]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [activeTab,setActiveTab]=useState('Activas');
  const [selected,setSelected]=useState<any|null>(null);
  const [panelTab,setPanelTab]=useState<'info'|'actividad'|'chatter'>('info');
  const [showCreate,setShowCreate]=useState(false);
  const [saving,setSaving]=useState(false);
  const [confirming,setConfirming]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'ok'|'err'}|null>(null);
  const [currentUser,setCurrentUser]=useState('');
  const [alertDias,setAlertDias]=useState(2);

  // Checkboxes
  const [checked,setChecked]=useState<Set<number>>(new Set());
  const [showBulkBar,setShowBulkBar]=useState(false);

  // Panel edit
  const [editMode,setEditMode]=useState(false);
  const [editForm,setEditForm]=useState<any>({});
  const [savingEdit,setSavingEdit]=useState(false);

  // Create form
  const [form,setForm]=useState({advisor_name:'',tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:30});
  const [prodName,setProdName]=useState('');
  const [prodQty,setProdQty]=useState(1);
  const [productos,setProductos]=useState<any[]>([]);

  // Customer autocomplete
  const [custSearch,setCustSearch]=useState('');
  const [custResults,setCustResults]=useState<any[]>([]);
  const [selectedCust,setSelectedCust]=useState<any|null>(null);
  const [showNewClient,setShowNewClient]=useState(false);
  const [custSearchDone,setCustSearchDone]=useState(false);
  const custTimer=useRef<any>(null);

  // Seguimiento search
  const [segSearch,setSegSearch]=useState('');
  const [segResults,setSegResults]=useState<any[]>([]);
  const segTimer=useRef<any>(null);

  // Programar Entrega fields
  const [envio,setEnvio]=useState({nombre_completo:'',cedula:'',direccion:'',ciudad:'',telefono:'',transportadora:'',tipo_envio:'Contraentrega',ven_ids:''});

  // Devolucion fields
  const [devVen,setDevVen]=useState('');
  const [devPec,setDevPec]=useState('');
  const [devMotivo,setDevMotivo]=useState('');

  const showToast=(msg:string,type:'ok'|'err'='ok')=>setToast({msg,type});

  useEffect(()=>{
    const u=localStorage.getItem('user_name')||localStorage.getItem('username')||'';
    setCurrentUser(u);
    setForm(f=>({...f,advisor_name:u}));
  },[]);

  const load=useCallback(async()=>{
    setLoading(true);
    try{
      const [sc,cfg]=await Promise.all([
        apiFetch('/ventas/solicitudes?limit=200').catch(()=>[]),
        apiFetch('/ventas/config').catch(()=>({})),
      ]);
      setSolicitudes(Array.isArray(sc)?sc:(sc?.data??[]));
      if(cfg?.alerta_sc_dias?.value) setAlertDias(Number(cfg.alerta_sc_dias.value));
    }catch{setSolicitudes([]);}
    setLoading(false);
  },[]);
  useEffect(()=>{load();},[load]);

  async function loadDetail(id:number) {
    try{const d=await apiFetch(`/ventas/solicitudes/${id}`);setSelected(d);setEditForm({advisor_name:d.advisor_name||'',tipo_solicitud:d.tipo_solicitud||'Cotizacion de Producto',modalidad_pago:d.modalidad_pago||'Contado',notas:d.notas||'',fecha_vencimiento:d.fecha_vencimiento?d.fecha_vencimiento.split('T')[0]:''});}
    catch(err:any){showToast('Error: '+err.message,'err');}
  }

  function onCustSearch(q:string) {
    setCustSearch(q);setSelectedCust(null);setCustSearchDone(false);
    if(custTimer.current) clearTimeout(custTimer.current);
    if(!q.trim()){setCustResults([]);return;}
    custTimer.current=setTimeout(async()=>{
      const d=await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q)}`).catch(()=>[]);
      const list=Array.isArray(d)?d:(d?.data??[]);
      setCustResults(list);
      setCustSearchDone(true);
    },300);
  }

  function onSegSearch(q:string) {
    setSegSearch(q);
    if(segTimer.current) clearTimeout(segTimer.current);
    if(!q.trim()){setSegResults([]);return;}
    segTimer.current=setTimeout(async()=>{
      const [sc,cot,ven]=await Promise.all([
        apiFetch(`/ventas/solicitudes?search=${encodeURIComponent(q)}&limit=5`).catch(()=>[]),
        apiFetch(`/ventas/cotizaciones?search=${encodeURIComponent(q)}&limit=5`).catch(()=>[]),
        apiFetch(`/ventas/pedidos?search=${encodeURIComponent(q)}&limit=5`).catch(()=>[]),
      ]);
      const arr=[
        ...(Array.isArray(sc)?sc:(sc?.data??[])).map((x:any)=>({...x,_tipo:'SC'})),
        ...(Array.isArray(cot)?cot:(cot?.data??[])).map((x:any)=>({...x,_tipo:'COT'})),
        ...(Array.isArray(ven)?ven:(ven?.data??[])).map((x:any)=>({...x,_tipo:'VEN'})),
      ];
      setSegResults(arr);
    },300);
  }

  async function saveEdit() {
    if(!selected) return;
    setSavingEdit(true);
    try{
      const body:any={...editForm,updated_by:currentUser};
      if(editForm.fecha_vencimiento) body.fecha_vencimiento=new Date(editForm.fecha_vencimiento+'T12:00:00').toISOString();
      const d=await apiFetch(`/ventas/solicitudes/${selected.id}`,{method:'PATCH',body:JSON.stringify(body)});
      setSelected((prev:any)=>({...prev,...d}));
      setSolicitudes(prev=>prev.map(s=>s.id===selected.id?{...s,...d}:s));
      setEditMode(false);showToast('Solicitud actualizada');
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setSavingEdit(false);
  }

  async function changeEstado(scId:number,newEstado:string) {
    if(newEstado==='CANCELADA'&&!window.confirm('Cancelar esta solicitud?')) return;
    setSaving(true);
    try{
      await apiFetch(`/ventas/solicitudes/${scId}`,{method:'PATCH',body:JSON.stringify({estado:newEstado,updated_by:currentUser})});
      if(selected?.id===scId) await loadDetail(scId);
      setSolicitudes(prev=>prev.map(s=>s.id===scId?{...s,estado:newEstado}:s));
      showToast('Estado cambiado');
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setSaving(false);
  }

  async function deleteItem(scId:number) {
    if(!window.confirm('Eliminar esta solicitud? Esta accion la cancelara.')) return;
    await changeEstado(scId,'CANCELADA');
  }

  async function bulkAction(action:'delete'|'estado',estado?:string) {
    const ids=Array.from(checked);
    for(const id of ids){
      if(action==='delete') await changeEstado(id,'CANCELADA');
      else if(estado) await changeEstado(id,estado);
    }
    setChecked(new Set());setShowBulkBar(false);
    showToast(`${ids.length} solicitudes actualizadas`);
  }

  async function confirmarSC() {
    if(!selected) return;
    setConfirming(true);
    try{
      const d=await apiFetch(`/ventas/solicitudes/${selected.id}/confirmar`,{method:'POST',body:JSON.stringify({user_name:currentUser})});
      const cotNum=d?.cotizacion?.numero||'';
      showToast(`Cotizacion ${cotNum} creada`);
      // CRM Pipeline: advance lead to COT stage if customer_id exists
      if(selected.customer_id){
        try{
          // Get leads for this customer and advance the most recent one
          const leads=await apiFetch(`/crm/leads/v2?limit=50`).catch(()=>({data:[]}));
          const leadList=Array.isArray(leads)?leads:(leads?.data??[]);
          const myLead=leadList.find((l:any)=>l.customer_id===selected.customer_id&&l.lead_source==='SC');
          if(myLead){
            // Get pipeline stages and advance to next
            const stages=await apiFetch('/crm/pipeline-stages').catch(()=>({data:[]}));
            const stageList=Array.isArray(stages)?stages:(stages?.data??[]);
            const curIdx=stageList.findIndex((s:any)=>s.id===myLead.pipeline_stage_id);
            const nextStage=stageList[curIdx+1];
            if(nextStage){
              await apiFetch(`/crm/leads/${myLead.id}/stage`,{method:'PATCH',body:JSON.stringify({stage_id:nextStage.id,cotizacion_numero:cotNum})}).catch(()=>{});
            }
          }
        }catch{}
      }
      await loadDetail(selected.id);load();
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setConfirming(false);
  }

  async function createSolicitud(e:React.FormEvent) {
    e.preventDefault();
    if(!selectedCust&&!custSearch){showToast('Selecciona un cliente','err');return;}
    // If search done but no client selected and no customer found, force create
    if(custSearchDone&&custResults.length===0&&!selectedCust){
      setShowNewClient(true);return;
    }
    setSaving(true);
    try{
      const prodsToSend=productos.length>0?productos:(prodName?[{product_name:prodName,qty:prodQty,unit_price_cop:0}]:[]);
      // Build extra fields based on tipo
      let extraNotas=form.notas;
      if(form.tipo_solicitud==='Programar Entrega'&&envio.nombre_completo){
        extraNotas=`ENVIO: ${JSON.stringify(envio)}\n${form.notas}`;
      } else if(form.tipo_solicitud==='Devolucion de Producto'){
        extraNotas=`DEVOLUCION VEN:${devVen} PEC:${devPec} MOTIVO:${devMotivo}\n${form.notas}`;
      }
      const scData = await apiFetch('/ventas/solicitudes',{method:'POST',body:JSON.stringify({
        ...form,notas:extraNotas,
        customer_id:selectedCust?.id||null,
        customer_name:selectedCust?`${selectedCust.first_name} ${selectedCust.last_name}`.trim():custSearch,
        customer_phone:selectedCust?.phone||'',customer_email:selectedCust?.email||'',customer_address:selectedCust?.address||'',
        productos:prodsToSend,created_by:currentUser,
      })});
      // Auto-create CRM Lead silently (only if customer_id exists)
      if(selectedCust?.id){
        apiFetch('/crm/leads',{method:'POST',body:JSON.stringify({
          customer_id:selectedCust.id,
          advisor_name:form.advisor_name||currentUser,
          solicitud_tipo:form.tipo_solicitud||'Cotizacion de Producto',
          description:`SC creada: ${scData?.numero||''} - ${form.notas||''}`.substring(0,500),
          lead_source:'SC',
          lead_product_name:prodsToSend[0]?.product_name||'',
          lead_qty:prodsToSend[0]?.qty||1,
        })}).catch(()=>{}); // Silent — CRM lead is best-effort
      }
      showToast('Solicitud creada');
      setShowCreate(false);resetCreateForm();load();
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setSaving(false);
  }

  function resetCreateForm() {
    setSelectedCust(null);setCustSearch('');setCustResults([]);setCustSearchDone(false);
    setProductos([]);setProdName('');setProdQty(1);setSegSearch('');setSegResults([]);
    setEnvio({nombre_completo:'',cedula:'',direccion:'',ciudad:'',telefono:'',transportadora:'',tipo_envio:'Contraentrega',ven_ids:''});
    setDevVen('');setDevPec('');setDevMotivo('');
    setForm({advisor_name:currentUser,tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:30});
  }

  function toggleCheck(id:number) {
    setChecked(prev=>{
      const n=new Set(prev);
      if(n.has(id)) n.delete(id); else n.add(id);
      setShowBulkBar(n.size>0);
      return n;
    });
  }
  function toggleAll() {
    if(checked.size===filtered.length){setChecked(new Set());setShowBulkBar(false);}
    else{setChecked(new Set(filtered.map((s:any)=>s.id)));setShowBulkBar(true);}
  }

  // Stats
  const totalActivas=solicitudes.filter(s=>s.estado==='BORRADOR'||s.estado==='PENDIENTE_CONFIRMACION').length;
  const totalConf=solicitudes.filter(s=>s.estado==='CONFIRMADA').length;
  const sinAtender=solicitudes.filter(s=>{
    if(s.estado!=='BORRADOR') return false;
    return (Date.now()-new Date(s.updated_at||s.fecha_solicitud).getTime())/3600000>alertDias*24;
  }).length;
  const vencidas=solicitudes.filter(s=>{
    if(s.estado==='CANCELADA'||s.estado==='CONFIRMADA') return false;
    return s.fecha_vencimiento&&new Date(s.fecha_vencimiento)<new Date();
  }).length;

  const filtered=solicitudes.filter(sc=>{
    const ms=!search||(sc.numero||'').toLowerCase().includes(search.toLowerCase())||(sc.customer_name||'').toLowerCase().includes(search.toLowerCase())||(sc.advisor_name||'').toLowerCase().includes(search.toLowerCase());
    if(!ms) return false;
    if(activeTab==='Activas') return sc.estado==='BORRADOR'||sc.estado==='PENDIENTE_CONFIRMACION';
    if(activeTab==='Confirmadas') return sc.estado==='CONFIRMADA';
    if(activeTab==='Canceladas') return sc.estado==='CANCELADA';
    return true;
  });

  const isCotizacion=form.tipo_solicitud==='Cotizacion de Producto';
  const isSeguimiento=form.tipo_solicitud==='Seguimiento';
  const isProgramarEntrega=form.tipo_solicitud==='Programar Entrega';
  const isDevolucion=form.tipo_solicitud==='Devolucion de Producto';

  return (
    <div className="w-full bg-slate-50 min-h-full">
      {toast&&<Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {showNewClient&&<NewClientModal onSave={c=>{setSelectedCust(c);setCustSearch(`${c.first_name} ${c.last_name}`.trim());setCustResults([]);setShowNewClient(false);setShowCreate(true);}} onClose={()=>setShowNewClient(false)}/>}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Ventas:</span>
        {SUB_MODULES.map(mod=>(
          <Link key={mod.name} href={mod.path} className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${mod.path==='/dashboard/ventas/solicitud'?'bg-indigo-600 text-white border-indigo-600':'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent hover:border-indigo-200'}`}>{mod.name}</Link>
        ))}
      </div>

      {/* Alert Banner */}
      {(sinAtender>0||vencidas>0)&&(
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={20}/>
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-800">ATENCION REQUERIDA (Alerta de {alertDias} dias)</h4>
            <p className="text-xs font-bold text-rose-600 mt-1">
              {sinAtender>0&&`* ${sinAtender} solicitud(es) sin atender mas de ${alertDias} dias `}
              {vencidas>0&&`* ${vencidas} solicitud(es) vencidas`}
            </p>
          </div>
          <button onClick={load} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold">Actualizar</button>
        </div>
      )}

      {/* Bulk action bar */}
      {showBulkBar&&(
        <div className="bg-indigo-600 text-white px-6 py-3 flex items-center gap-4 shadow-lg">
          <span className="font-bold text-sm">{checked.size} seleccionada(s)</span>
          <div className="flex gap-2">
            {Object.entries(ESTADOS_SC).map(([k,v])=>(
              <button key={k} onClick={()=>bulkAction('estado',k)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/30">{v.label}</button>
            ))}
            <button onClick={()=>bulkAction('delete')} className="bg-red-500 hover:bg-red-600 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><Trash2 size={12}/>Eliminar</button>
            <button onClick={()=>{setChecked(new Set());setShowBulkBar(false);}} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><X size={12}/>Limpiar</button>
          </div>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl"><FileText size={24}/></div>
              Solicitudes de Cliente
            </h1>
            <p className="text-slate-500 mt-2 font-medium">SC-YYYY#### Pipeline: SC -> COT -> VEN</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm"><RefreshCw size={15} className={loading?'animate-spin':''}/> Actualizar</button>
            <button onClick={()=>setShowCreate(true)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm"><Plus size={16}/>Nueva Solicitud</button>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          {[
            {label:'Activas',val:totalActivas,sub:sinAtender>0?`${sinAtender} sin atender`:'Todas atendidas',cls:'border-amber-200 hover:border-amber-300',icls:'bg-amber-50 text-amber-600',icon:<FileText size={24}/>},
            {label:'Confirmadas (COT)',val:totalConf,sub:`${totalConf} generaron cotizacion`,cls:'border-emerald-200 hover:border-emerald-300',icls:'bg-emerald-50 text-emerald-600',icon:<CheckCircle2 size={24}/>},
            {label:'Canceladas',val:solicitudes.filter(s=>s.estado==='CANCELADA').length,sub:'Fuera del pipeline',cls:'border-red-200 hover:border-red-300',icls:'bg-red-50 text-red-500',icon:<X size={24}/>},
            {label:'Total',val:solicitudes.length,sub:`${totalConf} convertidas a COT`,cls:'border-indigo-200 hover:border-indigo-300',icls:'bg-indigo-50 text-indigo-600',icon:<Activity size={24}/>},
          ].map(card=>(
            <div key={card.label} className={`bg-white rounded-2xl p-6 border shadow-sm cursor-pointer transition-all ${card.cls}`}>
              <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 ${card.icls}`}>{card.icon}</div>
              <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">{card.label}</p>
              <h2 className="text-4xl font-black text-slate-800">{card.val}</h2>
              <p className="text-xs font-bold text-slate-500 mt-2">{card.sub}</p>
            </div>
          ))}
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2">
              {(['Activas','Confirmadas','Canceladas'] as const).map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab)} className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${activeTab===tab?tab==='Activas'?'bg-amber-100 text-amber-800 border border-amber-200':tab==='Confirmadas'?'bg-emerald-100 text-emerald-800 border border-emerald-200':'bg-red-100 text-red-800 border border-red-200':'text-slate-600 hover:bg-slate-100'}`}>{tab}</button>
              ))}
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100">
                <Search className="text-slate-400 shrink-0 mr-2" size={16}/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar SC, cliente, asesor..." className="w-full bg-transparent border-none text-sm font-medium text-slate-700 outline-none"/>
                {search&&<button onClick={()=>setSearch('')}><X size={14} className="text-slate-400"/></button>}
              </div>
              <button onClick={load} className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm"><RefreshCw size={16} className={loading?'animate-spin':''}/></button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-4"><input type="checkbox" onChange={toggleAll} checked={checked.size===filtered.length&&filtered.length>0} className="rounded border-slate-300"/></th>
                  <th className="px-4 py-4">SC / Trazabilidad</th>
                  <th className="px-4 py-4">Tipo</th>
                  <th className="px-4 py-4">Cliente</th>
                  <th className="px-4 py-4">Asesor</th>
                  <th className="px-4 py-4">Fecha</th>
                  <th className="px-4 py-4">Vencimiento</th>
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading?(
                  <tr><td colSpan={9} className="px-6 py-16 text-center"><RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-2"/><p className="text-slate-400">Cargando...</p></td></tr>
                ):filtered.length===0?(
                  <tr><td colSpan={9} className="px-6 py-16 text-center text-slate-500">No hay registros.</td></tr>
                ):filtered.map(sc=>{
                  const isOverdue=sc.fecha_vencimiento&&new Date(sc.fecha_vencimiento)<new Date();
                  const isStale=(Date.now()-new Date(sc.updated_at||sc.fecha_solicitud).getTime())/3600000>alertDias*24;
                  return (
                    <tr key={sc.id} onClick={()=>loadDetail(sc.id)} className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id===sc.id?'bg-indigo-50/40':''} ${isStale&&sc.estado==='BORRADOR'?'bg-rose-50/30':''}`}>
                      <td className="px-4 py-4" onClick={e=>e.stopPropagation()}>
                        <input type="checkbox" checked={checked.has(sc.id)} onChange={()=>toggleCheck(sc.id)} className="rounded border-slate-300"/>
                      </td>
                      <td className="px-4 py-4">
                        <span className="font-black text-indigo-700">{sc.numero}</span>
                        {(sc.cotizaciones||[]).length>0&&<p className="text-[10px] font-bold text-amber-500 mt-0.5">COT vinculada</p>}
                        {isStale&&sc.estado==='BORRADOR'&&<p className="text-[10px] font-bold text-rose-500 mt-0.5 flex items-center gap-1"><AlertTriangle size={8}/>Sin atender</p>}
                      </td>
                      <td className="px-4 py-4"><TipoBadge tipo={sc.tipo_solicitud||'Cotizacion de Producto'}/></td>
                      <td className="px-4 py-4"><span className="font-bold text-slate-800">{sc.customer_name||'-'}</span>{sc.customer_phone&&<p className="text-[11px] text-slate-400">{sc.customer_phone}</p>}</td>
                      <td className="px-4 py-4 text-slate-600 font-medium text-sm">{sc.advisor_name||'-'}</td>
                      <td className="px-4 py-4 text-slate-500 font-medium text-xs">{fDate(sc.fecha_solicitud)}</td>
                      <td className="px-4 py-4"><span className={`font-medium text-xs ${isOverdue?'text-red-600 font-bold':''}`}>{isOverdue&&<AlertTriangle size={10} className="inline mr-1"/>}{fDate(sc.fecha_vencimiento)}</span></td>
                      <td className="px-4 py-4"><EstadoBadge estado={sc.estado}/></td>
                      <td className="px-4 py-4" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          <button onClick={()=>loadDetail(sc.id)} className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-2 py-1.5 rounded text-xs font-bold opacity-0 group-hover:opacity-100 transition-opacity"><FileText size={12}/></button>
                          <RowMenu sc={sc} onView={()=>loadDetail(sc.id)} onChangeEstado={e=>changeEstado(sc.id,e)} onDelete={()=>deleteItem(sc.id)}/>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filtered.length>0&&<div className="border-t border-slate-100 px-6 py-3 flex justify-between items-center bg-slate-50/50"><p className="text-xs font-bold text-slate-400">{filtered.length} de {solicitudes.length} solicitudes</p></div>}
        </div>
      </div>

      {/* DETAIL PANEL */}
      {selected&&(
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={()=>{setSelected(null);setEditMode(false);setPanelTab('info');}}/>
          <div className="fixed top-0 bottom-0 right-0 z-40 bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden" style={{left:'240px'}}>
            {/* Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-xl">{selected.numero}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">Solicitud de Cliente</p>
                </div>
                <EstadoBadge estado={selected.estado}/>
                <TipoBadge tipo={selected.tipo_solicitud||'Cotizacion de Producto'}/>
              </div>
              <div className="flex items-center gap-2">
                {!editMode?(
                  <button onClick={()=>setEditMode(true)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1 hover:bg-slate-50"><Edit2 size={12}/>Editar</button>
                ):(
                  <>
                    <button onClick={()=>setEditMode(false)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                    <button onClick={saveEdit} disabled={savingEdit} className="bg-indigo-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-indigo-700 disabled:opacity-50">{savingEdit?<RefreshCw size={12} className="animate-spin"/>:<Save size={12}/>}Guardar</button>
                  </>
                )}
                <button onClick={()=>{setSelected(null);setEditMode(false);setPanelTab('info');}} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
              </div>
            </div>

            {/* Split pane */}
            <div className="flex-1 flex overflow-hidden min-h-0">
              {/* LEFT 45% */}
              <div className="w-[45%] border-r border-slate-100 overflow-y-auto p-6 space-y-5">
                {/* Cliente */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Cliente</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0"><User size={15}/></div>
                      <div><p className="font-bold text-slate-900">{selected.customer_name}</p></div>
                    </div>
                    {selected.customer_phone&&<a href={`tel:${selected.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1"><Phone size={13} className="text-slate-400"/>{selected.customer_phone}</a>}
                    {selected.customer_email&&<a href={`mailto:${selected.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 pl-1"><Mail size={13} className="text-slate-400"/>{selected.customer_email}</a>}
                    {selected.customer_address&&<p className="flex items-start gap-2 text-sm text-slate-600 pl-1"><MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0"/>{selected.customer_address}</p>}
                  </div>
                </div>

                {/* Edit mode */}
                {editMode?(
                  <div className="space-y-3">
                    <p className="text-xs font-black text-slate-400 uppercase">Editar</p>
                    {[{l:'Tipo de Solicitud',k:'tipo_solicitud',opts:TIPOS_SC},{l:'Modalidad de Pago',k:'modalidad_pago',opts:MODALIDADES_PAGO}].map(f=>(
                      <div key={f.k}><label className="text-xs font-bold text-slate-500 mb-1 block">{f.l}</label>
                        <select value={editForm[f.k]} onChange={e=>setEditForm((ef:any)=>({...ef,[f.k]:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{f.opts.map(o=><option key={o} value={o}>{o}</option>)}</select>
                      </div>
                    ))}
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Asesor</label><input type="text" value={editForm.advisor_name} onChange={e=>setEditForm((ef:any)=>({...ef,advisor_name:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Fecha Vencimiento</label><input type="date" value={editForm.fecha_vencimiento} onChange={e=>setEditForm((ef:any)=>({...ef,fecha_vencimiento:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                    <div><label className="text-xs font-bold text-slate-500 mb-1 block">Notas</label><textarea value={editForm.notas} onChange={e=>setEditForm((ef:any)=>({...ef,notas:e.target.value}))} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                  </div>
                ):(
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {[{l:'Asesor',v:selected.advisor_name||'-'},{l:'Modalidad Pago',v:selected.modalidad_pago||'-'},{l:'Fecha Solicitud',v:fDate(selected.fecha_solicitud)},{l:'Vencimiento',v:fDate(selected.fecha_vencimiento)}].map(item=>(
                        <div key={item.l} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm"><p className="text-xs text-slate-400 mb-1">{item.l}</p><p className="font-bold text-sm text-slate-800">{item.v}</p></div>
                      ))}
                    </div>
                    {selected.modalidad_pago?.includes('60/40')&&(
                      <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                        <p className="text-xs font-black text-indigo-700 uppercase mb-2">Modalidad 60/40</p>
                        <div className="flex gap-4"><div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Anticipo</p><p className="font-black text-indigo-700">60%</p></div><div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Pendiente</p><p className="font-black text-slate-700">40%</p></div></div>
                      </div>
                    )}
                    {(selected.productos||[]).length>0&&(
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
                        <div className="border border-slate-200 rounded-xl overflow-hidden"><table className="w-full text-xs"><thead className="bg-slate-50 text-slate-400 uppercase font-black"><tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Precio</th></tr></thead><tbody className="divide-y divide-slate-50">{selected.productos.map((p:any,i:number)=><tr key={i}><td className="px-3 py-2 font-medium text-slate-700">{p.product_name}</td><td className="px-3 py-2 text-right text-slate-600">{p.qty}</td><td className="px-3 py-2 text-right font-bold text-indigo-700">{fCOP(p.unit_price_cop)}</td></tr>)}</tbody></table></div>
                      </div>
                    )}
                    {selected.notas&&<div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><p className="text-xs font-black text-amber-700 uppercase mb-1.5">Notas</p><p className="text-sm text-amber-900">{selected.notas}</p></div>}
                    {(selected.cotizaciones||[]).length>0&&(
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-2">Cotizaciones</p>
                        {selected.cotizaciones.map((c:any)=>(
                          <Link key={c.id} href="/dashboard/ventas/cotizacion" className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2 hover:bg-amber-100">
                            <div><span className="font-bold text-amber-800">{c.numero}</span><p className="text-xs text-amber-600 mt-0.5">{c.estado}</p></div>
                            <ChevronRight size={15} className="text-amber-500"/>
                          </Link>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {/* Estado change */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Cambiar Estado</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(ESTADOS_SC).filter(([k])=>k!==selected.estado).map(([k,v])=>(
                      <button key={k} onClick={()=>changeEstado(selected.id,k)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold border hover:opacity-80 disabled:opacity-40" style={{backgroundColor:v.bg,color:v.color,borderColor:v.border}}>{v.label}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* RIGHT 55% */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* Tab bar */}
                <div className="border-b border-slate-200 px-4 pt-3 flex gap-1 bg-white flex-shrink-0">
                  {([['info','Acciones'],['actividad','Actividad'],['chatter','Chatter']] as const).map(([k,l])=>(
                    <button key={k} onClick={()=>setPanelTab(k)} className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-colors ${panelTab===k?'text-indigo-700 border-indigo-600 bg-indigo-50/50':'text-slate-500 border-transparent hover:text-slate-700'}`}>{l}</button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {panelTab==='info'&&(
                    <>
                      {/* Primary Actions - HALF WIDTH */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-3">Acciones Principales</p>
                        <div className="grid grid-cols-2 gap-2">
                          {(selected.estado==='BORRADOR'||selected.estado==='PENDIENTE_CONFIRMACION')&&(
                            <button onClick={confirmarSC} disabled={confirming} className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md disabled:opacity-50">
                              {confirming?<RefreshCw size={14} className="animate-spin"/>:<CheckCircle2 size={14}/>}Confirmar + Crear Cotizacion
                            </button>
                          )}
                          {(selected.cotizaciones||[]).length>0&&(
                            <Link href="/dashboard/ventas/cotizacion" className="bg-amber-50 border border-amber-200 text-amber-700 px-4 py-2.5 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-amber-100 text-sm">
                              <ArrowRight size={14}/>Ver Cotizacion
                            </Link>
                          )}
                        </div>
                      </div>
                      {/* Contactar - HALF WIDTH grid */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-3">Contactar Cliente</p>
                        <div className="grid grid-cols-3 gap-2">
                          {selected.customer_phone&&<a href={`https://wa.me/57${selected.customer_phone.replace(/\D/g,'')}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100"><MessageCircle size={18}/>WhatsApp</a>}
                          {selected.customer_phone&&<a href={`tel:${selected.customer_phone}`} className="flex flex-col items-center gap-1.5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100"><Phone size={18}/>Llamar</a>}
                          {selected.customer_email&&<a href={`mailto:${selected.customer_email}?subject=Solicitud ${selected.numero}`} className="flex flex-col items-center gap-1.5 py-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100"><Mail size={18}/>Email</a>}
                        </div>
                      </div>
                    </>
                  )}

                  {panelTab==='actividad'&&(
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase mb-3">Historial</p>
                      {(selected.actividades||[]).length===0?<p className="text-xs text-slate-400 italic">Sin actividad.</p>:(
                        <div className="space-y-4 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                          {[...(selected.actividades||[])].reverse().filter((a:any)=>a.action!=='CHATTER').map((a:any)=>(
                            <div key={a.id} className="flex gap-4 pl-7 relative">
                              <ActionDot action={a.action}/>
                              <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                                <p className="text-sm font-bold text-slate-700">{a.description}</p>
                                {a.old_estado&&a.new_estado&&<p className="text-xs text-slate-400 mt-1 flex items-center gap-1"><EstadoBadge estado={a.old_estado}/><ArrowRight size={10} className="text-slate-300"/><EstadoBadge estado={a.new_estado}/></p>}
                                <p className="text-xs text-slate-400 mt-1">{fDate(a.created_at)} {fTime(a.created_at)}{a.user_name&&<span className="ml-2 font-medium">- {a.user_name}</span>}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {panelTab==='chatter'&&<ChatterTab sc={selected} currentUser={currentUser}/>}
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      {/* CREATE MODAL */}
      {showCreate&&(
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white flex-shrink-0">
              <div><h3 className="font-extrabold text-xl text-slate-900">Nueva Solicitud de Cliente</h3><p className="text-xs text-slate-500 mt-0.5">El numero SC se asignara automaticamente</p></div>
              <button onClick={()=>{setShowCreate(false);resetCreateForm();}}><X size={18} className="text-slate-400"/></button>
            </div>

            <form onSubmit={createSolicitud} className="flex-1 overflow-y-auto">
              <div className="p-6 space-y-5">
                {/* Cliente */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Cliente *</label>
                  <div className="relative">
                    <input type="text" value={custSearch} onChange={e=>onCustSearch(e.target.value)} placeholder="Buscar por nombre, telefono, email..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"/>
                    {custResults.length>0&&!selectedCust&&(
                      <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                        {custResults.map((c:any)=>(
                          <button key={c.id} type="button" onClick={()=>{setSelectedCust(c);setCustSearch(`${c.first_name} ${c.last_name}`.trim());setCustResults([]);}} className="w-full text-left px-3 py-2.5 hover:bg-indigo-50 text-sm border-b border-slate-50 last:border-0">
                            <span className="font-bold text-slate-800">{c.first_name} {c.last_name}</span>
                            <span className="ml-2 text-xs text-slate-400">{c.phone||c.email}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {custSearchDone&&custResults.length===0&&!selectedCust&&custSearch&&(
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 flex items-center justify-between">
                      <p className="text-xs font-bold text-amber-700">Cliente no encontrado en la BD.</p>
                      <button type="button" onClick={()=>{setShowCreate(false);setShowNewClient(true);}} className="bg-amber-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><UserPlus size={12}/>Agregar Cliente</button>
                    </div>
                  )}
                  {selectedCust&&(
                    <div className="mt-2 bg-indigo-50 border border-indigo-200 rounded-xl px-3 py-2 flex items-center justify-between">
                      <span className="text-sm font-bold text-indigo-700">{selectedCust.first_name} {selectedCust.last_name}</span>
                      <button type="button" onClick={()=>{setSelectedCust(null);setCustSearch('');setCustSearchDone(false);}} className="text-indigo-400 hover:text-indigo-700"><X size={14}/></button>
                    </div>
                  )}
                </div>

                {/* Tipo + Modalidad */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Tipo de Solicitud</label>
                    <select value={form.tipo_solicitud} onChange={e=>setForm(f=>({...f,tipo_solicitud:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{TIPOS_SC.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
                    <select value={form.modalidad_pago} onChange={e=>setForm(f=>({...f,modalidad_pago:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{MODALIDADES_PAGO.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
                </div>

                {form.modalidad_pago.includes('60/40')&&(
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex gap-4">
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Anticipo</p><p className="font-black text-indigo-700 text-lg">60%</p></div>
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Saldo al entregar</p><p className="font-black text-slate-700 text-lg">40%</p></div>
                  </div>
                )}

                {/* TYPE-SPECIFIC FIELDS */}
                {isCotizacion&&(
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Producto a Cotizar <span className="text-slate-300 font-medium">(opcional)</span></label>
                    <ProductSearch value={prodName} onChange={v=>setProdName(v)} onSelect={p=>{setProdName(p.name||p.product_name);}} onConfirmNew={n=>setProdName(n)}/>
                    {prodName&&(
                      <div className="mt-2 flex items-center gap-2">
                        <label className="text-xs text-slate-500">Cantidad:</label>
                        <input type="number" min="1" value={prodQty} onChange={e=>setProdQty(Number(e.target.value))} className="w-20 border border-slate-200 rounded-lg px-2 py-1 text-sm text-center font-bold outline-none focus:ring-1 focus:ring-indigo-200"/>
                        <button type="button" onClick={()=>{if(prodName){setProductos(p=>[...p,{product_name:prodName,qty:prodQty,unit_price_cop:0}]);setProdName('');setProdQty(1);}}} className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-lg text-xs font-bold hover:bg-indigo-200">+ Agregar</button>
                      </div>
                    )}
                    {productos.length>0&&(
                      <div className="mt-2 space-y-1">{productos.map((p,i)=>(
                        <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-1.5">
                          <span className="text-sm font-bold text-slate-700">{p.product_name} x{p.qty}</span>
                          <button type="button" onClick={()=>setProductos(prev=>prev.filter((_,idx)=>idx!==i))} className="text-red-400 hover:text-red-600"><X size={13}/></button>
                        </div>
                      ))}</div>
                    )}
                    <p className="text-xs text-slate-400 mt-2">Si no existe en el catalogo, dejalo en blanco y detallalo en Notas.</p>
                  </div>
                )}

                {isSeguimiento&&(
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Buscar SC / COT / Pedido de Venta</label>
                    <div className="relative">
                      <input type="text" value={segSearch} onChange={e=>onSegSearch(e.target.value)} placeholder="Numero o nombre de cliente..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"/>
                      {segResults.length>0&&(
                        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                          {segResults.map((r:any,i:number)=>(
                            <button key={i} type="button" onClick={()=>{setSegSearch(`${r._tipo}: ${r.numero}`);setSegResults([]);setForm(f=>({...f,notas:`Seguimiento a ${r._tipo} ${r.numero} - ${r.customer_name||''}\n${f.notas}`}));}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0">
                              <span className="font-bold">{r.numero}</span>
                              <span className="ml-2 text-xs text-slate-400">{r._tipo} - {r.estado} - {r.customer_name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    {segSearch&&<div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2"><p className="text-xs font-bold text-blue-700 flex items-center gap-1"><CheckCircle2 size={11}/>Referencia: {segSearch}</p></div>}
                  </div>
                )}

                {isProgramarEntrega&&(
                  <div className="space-y-3 bg-teal-50 border border-teal-100 rounded-xl p-4">
                    <p className="text-xs font-black text-teal-700 uppercase">Datos de Envio</p>
                    <div className="grid grid-cols-2 gap-3">
                      {[{l:'Nombre Completo',k:'nombre_completo'},{l:'Cedula',k:'cedula'},{l:'Telefono',k:'telefono'},{l:'Ciudad',k:'ciudad'},{l:'Transportadora',k:'transportadora'}].map(f=>(
                        <div key={f.k}><label className="text-xs font-bold text-teal-600 mb-1 block">{f.l}</label><input type="text" value={(envio as any)[f.k]} onChange={e=>setEnvio(ev=>({...ev,[f.k]:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
                      ))}
                      <div><label className="text-xs font-bold text-teal-600 mb-1 block">Tipo Envio</label>
                        <select value={envio.tipo_envio} onChange={e=>setEnvio(ev=>({...ev,tipo_envio:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"><option>Contraentrega</option><option>Contado</option></select></div>
                    </div>
                    <div><label className="text-xs font-bold text-teal-600 mb-1 block">Direccion</label><input type="text" value={envio.direccion} onChange={e=>setEnvio(ev=>({...ev,direccion:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
                    <div><label className="text-xs font-bold text-teal-600 mb-1 block">Pedido(s) de Venta (PVEN#)</label><input type="text" value={envio.ven_ids} onChange={e=>setEnvio(ev=>({...ev,ven_ids:e.target.value}))} placeholder="PVEN-20260001, PVEN-20260002..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
                    {envio.nombre_completo&&(
                      <div className="mt-2">
                        <p className="text-xs font-black text-teal-700 mb-1">Enviar Resumen:</p>
                        <div className="flex gap-2">
                          <a href={`https://wa.me/57${envio.telefono.replace(/\D/g,'')}?text=${encodeURIComponent(`Hola ${envio.nombre_completo}, tu pedido ${envio.ven_ids} sera enviado por ${envio.transportadora} a ${envio.direccion}, ${envio.ciudad}. Tipo: ${envio.tipo_envio}`)}`} target="_blank" rel="noreferrer" className="flex-1 bg-green-500 text-white py-2 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1"><MessageCircle size={12}/>WhatsApp</a>
                          {form.modalidad_pago&&<a href={`mailto:?subject=Informacion de envio&body=${encodeURIComponent(`Destinatario: ${envio.nombre_completo}\nCedula: ${envio.cedula}\nDireccion: ${envio.direccion}, ${envio.ciudad}\nTransportadora: ${envio.transportadora}\nTipo: ${envio.tipo_envio}`)}`} className="flex-1 bg-blue-500 text-white py-2 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1"><Mail size={12}/>Email</a>}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {isDevolucion&&(
                  <div className="space-y-3 bg-orange-50 border border-orange-100 rounded-xl p-4">
                    <p className="text-xs font-black text-orange-700 uppercase">Datos de Devolucion</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pedido de Venta (PVEN)</label><input type="text" value={devVen} onChange={e=>setDevVen(e.target.value)} placeholder="PVEN-20260001" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"/></div>
                      <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pedido de Compra (PEC)</label><input type="text" value={devPec} onChange={e=>setDevPec(e.target.value)} placeholder="PEC-20260001" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"/></div>
                    </div>
                    <div><label className="text-xs font-bold text-orange-600 mb-1 block">Motivo / Tipo de Devolucion</label>
                      <select value={devMotivo} onChange={e=>setDevMotivo(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200">
                        <option value="">Seleccionar...</option>
                        <option>Dano menor - Ajustar precio de venta</option>
                        <option>Dano total - Ajuste inventario negativo</option>
                        <option>Producto incorrecto</option>
                        <option>El cliente cambio de decision</option>
                      </select>
                    </div>
                    <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pruebas (URLs de imagenes o descripcion)</label>
                      <textarea rows={2} placeholder="Enlace a foto o descripcion del estado del producto..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-orange-200" onChange={e=>setForm(f=>({...f,notas:`PRUEBAS: ${e.target.value}\n${f.notas}`}))}/></div>
                    {devMotivo&&<div className="bg-orange-100 rounded-xl p-3 text-xs text-orange-800 font-bold">
                      <p>Logica de backend:</p>
                      {devMotivo.includes('menor')&&<p>* Se afectara el margen en el Pedido de Venta {devVen}</p>}
                      {devMotivo.includes('total')&&<p>* Se ajustara el inventario en el PEC {devPec} (ajuste negativo)</p>}
                    </div>}
                  </div>
                )}

                {/* Asesor + Vencimiento */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Asesor</label><input type="text" value={form.advisor_name} onChange={e=>setForm(f=>({...f,advisor_name:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Dias Vencimiento</label><input type="number" min="1" max="365" value={form.dias_vencimiento} onChange={e=>setForm(f=>({...f,dias_vencimiento:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                </div>

                {/* Notas */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas / Observaciones</label>
                  <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} rows={3} placeholder="Detalles de la solicitud..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
                </div>
              </div>

              <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50 flex-shrink-0">
                <button type="button" onClick={()=>{setShowCreate(false);resetCreateForm();}} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-100">Cancelar</button>
                <button type="submit" disabled={saving} className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm shadow-md flex items-center gap-2 disabled:opacity-50">
                  {saving?<RefreshCw size={14} className="animate-spin"/>:<Plus size={14}/>}Crear Solicitud
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
