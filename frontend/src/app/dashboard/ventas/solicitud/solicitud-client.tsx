'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText, AlertTriangle, CheckCircle2, Clock, Search, Plus, X,
  Mail, ExternalLink, RefreshCw, ArrowLeft,
  Activity, ChevronRight, MoreVertical, DollarSign, MessageCircle,
  Edit2, Send, AlertCircle, ChevronDown, Truck,
  Trash2, RotateCcw, UserPlus, LayoutGrid, List, ShieldAlert,
  MessageSquare, Paperclip, Camera, TrendingUp, BarChart3, PieChart,
  Sparkles, HelpCircle, Info, ChevronUp, Check, Bot, CornerDownLeft,
  Eye, Archive, XCircle, ArrowUpRight, Award, Flame, Zap
} from 'lucide-react';

import { apiFetch, API_URL, getToken } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge as SharedBadge, Modal, Toast as SharedToast, Button, EmptyState } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';

export const TIPOS_SC = [
  'Cotizacion de Producto',
  'Seguimiento',
  'Programar Entrega',
  'Devolucion de Producto',
  'Soporte Tecnico',
  'Nuevo Lead',
];

export const MODALIDADES_PAGO = [
  'Contado',
  '60/40 (60% anticipo - 40% pendiente)',
  'Credito 30 dias',
  'Credito 60 dias',
  'Otro',
];

const ESTADOS_SC: Record<string, {label:string; color:string; bg:string; border:string}> = {
  BORRADOR:               {label:'Borrador',           color:'#64748b',bg:'#f1f5f9',border:'#e2e8f0'},
  PENDIENTE_CONFIRMACION: {label:'Pend. confirmacion', color:'#b45309',bg:'#fffbeb',border:'#fde68a'},
  COTIZADA:               {label:'Cotizada',           color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
  EN_ESPERA_CONFIRMACION: {label:'En espera confirmacion', color:'#c2410c',bg:'#fff7ed',border:'#fed7aa'},
  CONFIRMADA:             {label:'Confirmada',         color:'#065f46',bg:'#f0fdf4',border:'#a7f3d0'},
  RECHAZADA:              {label:'Rechazada',          color:'#9f1239',bg:'#fff1f2',border:'#fecdd3'},
  VENCIDA:                {label:'Vencida',            color:'#854d0e',bg:'#fefce8',border:'#fef08a'},
  CANCELADA:              {label:'Cancelada',          color:'#991b1b',bg:'#fef2f2',border:'#fecaca'},
  'N/A_SOPORTE':          {label:'Soporte',            color:'#7e22ce',bg:'#faf5ff',border:'#e9d5ff'},
};

// Subconjunto de ESTADOS_SC seguro para menus de "forzar estado manualmente"
// (3-dot menu, bulk-action bar, panel de detalle). ESTADOS_SC completo sirve
// para badges/tabs/labels (incluye estados que solo deben alcanzarse via los
// flujos reales de backend: confirmar_solicitud, sincronizacion con la
// Cotizacion). Si estos 5 estados nuevos se agregaran aqui tambien, cualquier
// Solicitud podria forzarse a, por ejemplo, "Cotizada" o "Soporte" con un
// click, sin Cotizacion vinculada ni backend involucrado -- exactamente lo que
// estos menus nunca pudieron hacer antes de que ESTADOS_SC creciera.
export const ESTADOS_SC_MANUALES: Record<string, {label:string; color:string; bg:string; border:string}> = Object.fromEntries(
  Object.entries(ESTADOS_SC).filter(([k]) => ['BORRADOR','PENDIENTE_CONFIRMACION','CONFIRMADA','CANCELADA'].includes(k))
);

export const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
export const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
export const fCOP  = (v: any)   => { const n=Number(v)||0; return n>0?'$'+n.toLocaleString('es-CO'):'-'; };

// Mapa de 9 estados propios de Solicitud de Cliente -- se mantiene bespoke
// (mas de los ~6 tonos semanticos que cubre el Badge compartido), pero la
// forma de la pastilla ahora coincide con la de Badge (rounded-full, border,
// text-xs font-bold, px-2.5 py-1).
export function EstadoBadge({estado}: {estado:string}) {
  const cfg = ESTADOS_SC[estado] || {label:estado,color:'#4338ca',bg:'#eef2ff',border:'#c7d2fe'};
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{backgroundColor:cfg.bg,color:cfg.color,borderColor:cfg.border}}>
      {cfg.label}
    </span>
  );
}

// 6 tipos de solicitud con colores categoricos deliberadamente distintos
// (indigo/blue/teal/orange/purple/emerald) que no colapsan limpiamente sobre
// los 6 tonos semanticos de Badge (neutral/success/warning/danger/info/purple)
// sin perder distincion real -- se mantiene bespoke, solo se alinea la forma.
export function TipoBadge({tipo}: {tipo:string}) {
  const map: Record<string,string> = {
    'Cotizacion de Producto':'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Seguimiento':           'bg-blue-100 text-blue-700 border-blue-200',
    'Programar Entrega':     'bg-teal-100 text-teal-700 border-teal-200',
    'Devolucion de Producto':'bg-orange-100 text-orange-700 border-orange-200',
    'Soporte Tecnico':       'bg-purple-100 text-purple-700 border-purple-200',
    'Nuevo Lead':            'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${map[tipo]||'bg-slate-100 text-slate-600 border-slate-200'}`}>{tipo||'Sin tipo'}</span>;
}

export function ActionDot({action}: {action:string}) {
  const colors: Record<string,string> = {CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',NOTE_ADDED:'#3b82f6',CONFIRMED:'#059669',CANCELLED:'#ef4444',UPDATED:'#8b5cf6',CHATTER:'#0891b2'};
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white" style={{backgroundColor:colors[action]||'#94a3b8'}}/>;
}

// â”€â”€ New Client Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function NewClientModal({onSave, onClose}: {onSave:(c:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({first_name:'',last_name:'',phone:'',email:'',address:'',city:''});
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!form.first_name) return;
    setSaving(true);
    try {
      const d = await apiFetch('/crm/customers', {method:'POST', body:JSON.stringify(form)});
      const custObj = d?.data ?? d;
      onSave(custObj);
    } catch(err:any) { alert('Error: '+err.message); }
    setSaving(false);
  }
  return (
    <Modal title="Nuevo Cliente" subtitle="El cliente no esta en la base de datos. Completar para continuar." icon={UserPlus} color="indigo" onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="sc-new-client-form" color="indigo" icon={UserPlus} loading={saving}>Guardar Cliente</Button>
        </>
      )}>
      <form id="sc-new-client-form" onSubmit={save} className="space-y-3">
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
      </form>
    </Modal>
  );
}

// â”€â”€ Product Not Found Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// ── Product Search ──────────────────────────────────────────────────────────
function ProductSearch({value,onChange,onSelect}:{value:string;onChange:(v:string)=>void;onSelect:(p:any)=>void}) {
  const [results,setResults]=useState<any[]>([]);
  const [open,setOpen]=useState(false);
  const [searched,setSearched]=useState(false);
  const [creating,setCreating]=useState(false);
  const timer=useRef<any>(null);
  function handle(v:string) {
    onChange(v); setOpen(false); setSearched(false);
    if(timer.current) clearTimeout(timer.current);
    if(!v.trim()){setResults([]);return;}
    timer.current=setTimeout(async()=>{
      try{
        const d=await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        const list=Array.isArray(d)?d:(d?.data??[]);
        setResults(list);
      }catch{setResults([]);}
      setOpen(true); setSearched(true);
    },300);
  }
  async function crearNuevo() {
    if(!value.trim()||creating) return;
    setCreating(true);
    try{
      const p=await apiFetch('/crm/products/quick-create',{method:'POST',body:JSON.stringify({name:value.trim(),sale_price:0})});
      onSelect(p?.data||p);
      setOpen(false); setSearched(false);
    }catch{
      // Si falla la creacion, se deja el texto tecleado tal cual (queda como
      // producto libre, igual que si el usuario nunca hubiera hecho clic).
    }
    setCreating(false);
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
      {open&&searched&&results.length===0&&value.trim().length>2&&(
        <div className="mt-1.5 bg-amber-50 border border-amber-200 rounded-xl p-2.5 flex items-center justify-between gap-2">
          <span className="text-xs text-amber-700">Producto no encontrado en el catalogo.</span>
          <button type="button" onClick={crearNuevo} disabled={creating}
            className="shrink-0 bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50">
            {creating?'Creando...':'+ Crear producto nuevo'}
          </button>
        </div>
      )}
    </div>
  );
}

// â”€â”€ 3-dot Row Menu â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
function RowMenu({sc,onView,onChangeEstado,onCancel,onSendToTrash}:{sc:any;onView:()=>void;onChangeEstado:(e:string)=>void;onCancel:()=>void;onSendToTrash:()=>void}) {
  const [open,setOpen]=useState(false);
  const ref=useRef<any>(null);
  useEffect(()=>{
    function close(e:MouseEvent){if(ref.current&&!ref.current.contains(e.target))setOpen(false);}
    document.addEventListener('mousedown',close);
    return()=>document.removeEventListener('mousedown',close);
  },[]);
  const isCancelled = sc.estado === 'CANCELADA';
  const isSoporte = sc.tipo_solicitud === 'Soporte Tecnico';
  return (
    <div className="relative" ref={ref}>
      <button onClick={e=>{e.stopPropagation();setOpen(o=>!o);}} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><MoreVertical size={15}/></button>
      {open&&(
        <div className="absolute right-0 top-8 z-50 bg-white border border-slate-200 rounded-xl shadow-xl w-56 py-1">
          <button onClick={()=>{onView();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm font-medium flex items-center gap-2"><FileText size={14} className="text-indigo-500"/>Ver Detalle</button>
          <button onClick={()=>{onView();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm font-medium flex items-center gap-2"><Edit2 size={14} className="text-amber-500"/>Editar</button>
          {/* Soporte Tecnico no participa del estado ligado a Cotizacion (siempre
              N/A_SOPORTE) ni de su flujo de cancelacion/papelera — su estado
              propio (estado_soporte) se cambia desde el panel de detalle, no con
              estos botones (cancelar aqui marcaria eliminada_at y lo mandaria a
              purga en 30 dias, perdiendo el ticket de soporte real) */}
          {!isSoporte && (
            <>
              <div className="border-t border-slate-100 my-1"/>
              {Object.entries(ESTADOS_SC_MANUALES).map(([k,v])=>(
                <button key={k} onClick={()=>{onChangeEstado(k);setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-xs font-bold" style={{color:v.color}}>
                  Estado: {v.label}
                </button>
              ))}
              <div className="border-t border-slate-100 my-1"/>
              {isCancelled ? (
                <button onClick={()=>{onSendToTrash();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-rose-50 text-sm font-medium flex items-center gap-2 text-rose-600">
                  <Trash2 size={14}/>Enviar a la papelera
                </button>
              ) : (
                <button onClick={()=>{onCancel();setOpen(false);}} className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm font-medium flex items-center gap-2 text-amber-600">
                  <AlertCircle size={14}/>Cancelar Solicitud
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}


// ── IA Panel SC ────────────────────────────────────────────────────────────────
export function IAPanelSC({sc,apiBase}:{sc:any;apiBase:string}) {
  const [analisis,setAnalisis]=useState('');
  const [loading,setLoading]=useState(false);
  const [chat,setChat]=useState('');
  const [chatHistory,setChatHistory]=useState<{role:'user'|'ia';text:string}[]>([]);
  const [sending,setSending]=useState(false);
  const tipo=sc?.tipo_solicitud||'Cotizacion de Producto';
  const isTraz=['Seguimiento','Programar Entrega'].includes(tipo);
  const isDev=tipo==='Devolucion de Producto';
  const label=isTraz?'Analisis de Trazabilidad':isDev?'Analisis de Devolucion':'Analisis de Solicitud';
  async function generar() {
    setLoading(true);
    try{
      const token=getToken();
      const res=await fetch(`${apiBase}/ventas/solicitudes/${sc.id}/ia-analisis`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}});
      const d=await res.json().catch(()=>({}));
      setAnalisis(d.data?.analisis||d.analisis||'Error al generar analisis.');
    }catch(e:any){setAnalisis('Error: '+e.message);}
    setLoading(false);
  }
  async function askChat() {
    if(!chat.trim()) return;
    setSending(true);
    const userMsg=chat;setChat('');
    setChatHistory(h=>[...h,{role:'user',text:userMsg}]);
    setChatHistory(h=>[...h,{role:'ia',text:`Con base en ${sc.numero} (${tipo}): ${(analisis||'Sin analisis previo.').slice(0,150)}... Puedo profundizar en cualquier aspecto.`}]);
    setSending(false);
  }
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-600 rounded-lg p-1.5 text-white text-xs">AI</div>
            <div><p className="font-extrabold text-indigo-900 text-sm">{label}</p><p className="text-[10px] text-indigo-500">Nebulae AI - {tipo}</p></div>
          </div>
          {!analisis&&!loading&&(
            <div className="text-center py-4">
              <p className="text-xs text-indigo-700 mb-3 font-medium">
                {isTraz?'Genera analisis de trazabilidad: estados, historial, proximos pasos.':
                 isDev?'Verifica si la devolucion cumple condiciones de politica (30 dias, estado).':
                 'Obtene un analisis completo de esta solicitud.'}
              </p>
              <button onClick={generar} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold text-sm shadow flex items-center gap-2 mx-auto">
                Generar Analisis IA
              </button>
            </div>
          )}
          {loading&&<div className="flex items-center gap-2 py-4 justify-center"><RefreshCw size={16} className="animate-spin text-indigo-600"/><p className="text-sm text-indigo-700 font-medium">Analizando solicitud...</p></div>}
          {analisis&&!loading&&(
            <div>
              <pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/80 rounded-xl p-3 border border-indigo-100">{analisis}</pre>
              <button onClick={generar} className="mt-2 text-xs text-indigo-600 hover:underline font-bold">Re-generar</button>
            </div>
          )}
        </div>
        {sc?.tipo_solicitud==='Cotizacion de Producto'&&(
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="font-extrabold text-amber-800 text-sm mb-2">Formato de Confirmacion al Cliente</p>
            <div className="bg-white border border-amber-300 rounded-xl p-4 mb-3 shadow-sm">
              <div className="flex items-center gap-2 mb-3 border-b pb-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">N</div>
                <div><p className="font-black text-slate-900 text-sm">Nebulae Kids</p><p className="text-[10px] text-slate-500">Solicitud de Confirmacion</p></div>
              </div>
              <p className="text-xs font-bold text-slate-700 mb-1">SC: <span className="text-indigo-700">{sc.numero}</span></p>
              <p className="text-xs text-slate-600 mb-0.5">Cliente: <strong>{sc.customer_name}</strong></p>
              <p className="text-xs text-slate-600 mb-0.5">Tipo: {sc.tipo_solicitud}</p>
              {sc.modalidad_pago&&<p className="text-xs text-slate-600 mb-0.5">Modalidad: {sc.modalidad_pago}</p>}
              {(sc.productos||[]).length>0&&<div className="mt-2">{sc.productos.slice(0,3).map((p:any,i:number)=><p key={i} className="text-xs text-slate-700">- {p.product_name} x{p.qty}</p>)}</div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {sc.customer_phone&&<a href={`https://wa.me/57${sc.customer_phone.replace(/\D/g,'')}?text=${encodeURIComponent('Hola '+sc.customer_name+', confirma tu solicitud '+sc.numero+'. Responde SI para confirmar.')}`} target="_blank" rel="noreferrer" className="bg-green-500 text-white py-2 rounded-xl text-[10px] font-black text-center hover:bg-green-600">WhatsApp</a>}
              {sc.customer_email&&<a href={`mailto:${sc.customer_email}?subject=Confirma ${sc.numero}`} className="bg-blue-500 text-white py-2 rounded-xl text-[10px] font-black text-center hover:bg-blue-600">Email</a>}
              <button onClick={()=>window.print()} className="bg-slate-100 text-slate-700 py-2 rounded-xl text-[10px] font-black hover:bg-slate-200">PDF</button>
            </div>
          </div>
        )}
        {chatHistory.map((m,i)=>(
          <div key={i} className={`flex ${m.role==='user'?'justify-end':''}`}>
            <div className={`rounded-2xl px-3 py-2 text-xs max-w-[85%] ${m.role==='user'?'bg-indigo-600 text-white':'bg-white border border-slate-200 text-slate-700'}`}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2">
        <input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askChat()} placeholder="Pregunta sobre esta solicitud..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-200 outline-none"/>
        <button onClick={askChat} disabled={!chat.trim()||sending} className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">Enviar</button>
      </div>
    </div>
  );
}

// â”€â”€ Chatter Tab â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ChatterTab({sc,currentUser}:{sc:any;currentUser:string}) {
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

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const getRazonCancelacion = (sc: any): string => {
  if (sc.razon_cancelacion && typeof sc.razon_cancelacion === 'string' && sc.razon_cancelacion.trim()) {
    return sc.razon_cancelacion.trim();
  }
  if (sc.notas && typeof sc.notas === 'string') {
    const match = sc.notas.match(/\[CANCELADA\]\s*Razón:\s*(.*)/i);
    if (match && match[1]) return match[1].trim();
    const match2 = sc.notas.match(/Razón:\s*(.*)/i);
    if (match2 && match2[1]) return match2[1].trim();
    const match3 = sc.notas.match(/Motivo:\s*(.*)/i);
    if (match3 && match3[1]) return match3[1].trim();
  }
  return 'Cancelada por cliente / Desistimiento comercial';
};

export default function SolicitudClient() {
  const [solicitudes,setSolicitudes]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [search,setSearch]=useState('');
  const [activeTab,setActiveTab]=useState('Activas');
  const [showCreate,setShowCreate]=useState(false);
  const [saving,setSaving]=useState(false);
  const [toast,setToast]=useState<{msg:string;type:'ok'|'err'}|null>(null);
  const [currentUser,setCurrentUser]=useState('');
  const [alertDias,setAlertDias]=useState(2);

  // Paginación
  
  // Enhanced Analisis & Pipeline State
  const [topClientsLimit, setTopClientsLimit] = useState<number>(5);
  const [donutMode, setDonutMode] = useState<'estados' | 'motivos'>('estados');
  const [showPipelineGuide, setShowPipelineGuide] = useState<boolean>(false);
  const [aiQuery, setAiQuery] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiChatHistory, setAiChatHistory] = useState<{role:'user'|'ia'; text:string; time:string}[]>([
    {
      role: 'ia',
      text: '¡Hola! Soy tu asistente de inteligencia comercial para el Pipeline de Solicitudes de Nebulae. Puedo analizar tasas de conversión (SC → COT), tiempos de resolución, clientes top y razones de cancelación. Selecciona una pregunta rápida o escribe tu consulta.',
      time: 'Ahora'
    }
  ]);

  async function enviarAPapelera(id:number) {
    if(!confirm('¿Enviar esta solicitud a la papelera? Podrás restaurarla o eliminarla definitivamente allí.')) return;
    try {
      const existing = solicitudes.find(s => s.id === id);
      const razonToSend = (existing && getRazonCancelacion(existing)) || 'Enviada a papelera por asesor';
      await apiFetch(`/ventas/solicitudes/${id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({
          razon: razonToSend.length >= 5 ? razonToSend : 'Enviada a papelera por asesor',
          user_name: currentUser || 'asesor'
        })
      });
      showToast('Solicitud enviada a la papelera', 'ok');
      await load();
      await loadPapelera();
    } catch(err:any) {
      showToast('Error: ' + err.message, 'err');
    }
  }

  function handleAiQuestion(customQ?: string) {
    const q = (customQ || aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    const nowTime = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'});
    setAiChatHistory(prev => [...prev, { role: 'user', text: q, time: nowTime }]);
    if (!customQ) setAiQuery('');

    setTimeout(() => {
      const total = solicitudes.length || 1;
      const conf = solicitudes.filter(s => s.estado === 'CONFIRMADA').length;
      const act = solicitudes.filter(s => s.estado === 'BORRADOR' || s.estado === 'PENDIENTE_CONFIRMACION').length;
      const canc = solicitudes.filter(s => s.estado === 'CANCELADA').length;
      const convRate = ((conf / total) * 100).toFixed(1);
      const cancRate = ((canc / total) * 100).toFixed(1);

      // Top client
      const custCounts: Record<string, number> = {};
      solicitudes.forEach(s => {
        const c = s.customer_name || 'Sin nombre';
        custCounts[c] = (custCounts[c] || 0) + 1;
      });
      const sortedCusts = Object.entries(custCounts).sort((a,b)=>b[1]-a[1]);
      const topCustName = sortedCusts[0] ? sortedCusts[0][0] : 'N/A';
      const topCustCount = sortedCusts[0] ? sortedCusts[0][1] : 0;

      // Cancellation reasons
      const cancelRazones: Record<string, number> = {};
      solicitudes.filter(s => s.estado === 'CANCELADA').forEach(s => {
        const r = getRazonCancelacion(s);
        cancelRazones[r] = (cancelRazones[r] || 0) + 1;
      });
      const topReason = Object.entries(cancelRazones).sort((a,b)=>b[1]-a[1])[0]?.[0] || 'Desistimiento de compra';

      let aiReply = '';
      const qLower = q.toLowerCase();

      if (qLower.includes('diagnóstico') || qLower.includes('conversion') || qLower.includes('tasa') || qLower.includes('pipeline')) {
        aiReply = `📊 **Diagnóstico del Pipeline SC → COT:**\n\n` +
          `• **Total Solicitudes registradas:** ${total}\n` +
          `• **Tasa de Conversión a Cotización:** **${convRate}%** (${conf} solicitudes confirmadas que avanzaron a COT).\n` +
          `• **Solicitudes Activas en Proceso:** **${act}** pendientes de resolución.\n` +
          `• **Tasa de Cancelación:** **${cancRate}%** (${canc} solicitudes canceladas).\n\n` +
          `💡 **Recomendación:** El objetivo estándar para Nebulae Kids es superar el 65% de conversión. Prioriza las ${act} solicitudes activas para convertirlas a cotización antes de 48 horas.`;
      } else if (qLower.includes('cancelac') || qLower.includes('motivo') || qLower.includes('razon')) {
        aiReply = `🚫 **Análisis de Cancelaciones:**\n\n` +
          `• Actualmente hay **${canc} solicitudes canceladas** (${cancRate}% del total).\n` +
          `• **Motivo más recurrente registrado:** *"${topReason}"*.\n` +
          `• Las solicitudes canceladas se almacenan automáticamente en la **Papelera** por 30 días con trazabilidad antes de su eliminación permanente.\n\n` +
          `💡 **Acción sugerida:** Implementar seguimiento preventivo vía WhatsApp antes de los 3 días de inactividad para recuperar leads dubitativos antes de que desistan.`;
      } else if (qLower.includes('cliente') || qLower.includes('top') || qLower.includes('volumen')) {
        aiReply = `👑 **Comportamiento de Clientes:**\n\n` +
          `• El cliente con mayor demanda es **${topCustName}** con **${topCustCount} solicitudes** generadas.\n` +
          `• Hay **${Object.keys(custCounts).length} clientes únicos** en el pipeline comercial.\n` +
          `• Consulta la tabla de **Top Clientes** interactiva abajo para filtrar entre Top 5, 10, 20 o 50 y ver su tasa de éxito particular.`;
      } else {
        aiReply = `🔍 **Análisis para "${q}":**\n\n` +
          `• Con base en el análisis en tiempo real de las **${total} solicitudes**, ${act} se encuentran activas en borrador o pendientes de confirmación.\n` +
          `• La conversión acumulada se sitúa en **${convRate}%** y el ${cancRate}% fue cancelado.\n` +
          `• El cliente líder es **${topCustName}** y el motivo principal de descarte reportado es *"${topReason}"*.\n\n` +
          `¿Deseas profundizar en algún segmento o tipo de solicitud específico?`;
      }

      setAiChatHistory(prev => [...prev, { role: 'ia', text: aiReply, time: nowTime }]);
      setAiLoading(false);
    }, 450);
  }

  const [currentPage,setCurrentPage]=useState(1);
  const [pageSize,setPageSize]=useState(25);

  // Cancelar con razón
  const [showCancelModal,setShowCancelModal]=useState(false);
  const [cancelTarget,setCancelTarget]=useState<number|null>(null);
  const [cancelRazon,setCancelRazon]=useState('');
  const [cancelling,setCancelling]=useState(false);

  // Papelera
  const [papelera,setPapelera]=useState<any[]>([]);
  const [loadingPapelera,setLoadingPapelera]=useState(false);

  // Formato confirmación
  const [showConfirmFormat,setShowConfirmFormat]=useState(false);

  // Checkboxes
  const [checked,setChecked]=useState<Set<number>>(new Set());
  const [showBulkBar,setShowBulkBar]=useState(false);

  // Create form
  const [form,setForm]=useState({advisor_name:'',advisor_user_id:'',tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:5,tipo_problema:'',descripcion_problema:'',urgencia:'',evidencia_descripcion:'',asignado_a_user_id:''});
  const [prodName,setProdName]=useState('');
  const [prodQty,setProdQty]=useState(1);
  const [productos,setProductos]=useState<any[]>([]);

  // Usuarios para selector de asesor
  const [usuarios,setUsuarios]=useState<{id:number;email:string;role:string}[]>([]);

  // Customer autocomplete
  const [custSearch,setCustSearch]=useState('');
  const [custResults,setCustResults]=useState<any[]>([]);
  const [selectedCust,setSelectedCust]=useState<any|null>(null);
  const [showNewClient,setShowNewClient]=useState(false);
  const [custSearchDone,setCustSearchDone]=useState(false);
  const custTimer=useRef<any>(null);
  const custReqId=useRef(0);

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
    apiFetch('/auth/users').then((d:any) => setUsuarios(Array.isArray(d)?d:(d?.data??[]))).catch(()=>{});
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

  const searchParams = useSearchParams();
  const router = useRouter();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id=:
  // redirige a la pagina canonica en vez de duplicar la vista aqui.
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) router.replace(`/dashboard/ventas/solicitud/${numId}`);
    }
  },[searchParams, router]);
  // Auto-open create form if navigated here with ?new=1 (from "Nueva Solicitud" button on Ventas hub)
  useEffect(()=>{
    if(searchParams?.get('new')) setShowCreate(true);
  },[searchParams]);

  async function loadPapelera() {
    setLoadingPapelera(true);
    try{ const d=await apiFetch('/ventas/solicitudes/papelera'); setPapelera(Array.isArray(d)?d:(d?.data??[])); }
    catch{ setPapelera([]); }
    setLoadingPapelera(false);
  }

  async function cancelWithReason() {
    if(!cancelTarget||!cancelRazon.trim()){showToast('La razón es obligatoria','err');return;}
    setCancelling(true);
    try{
      await apiFetch(`/ventas/solicitudes/${cancelTarget}/cancelar`,{method:'POST',body:JSON.stringify({razon:cancelRazon,user_name:currentUser})});
      showToast('Solicitud cancelada','ok');
      setShowCancelModal(false);setCancelTarget(null);setCancelRazon('');
      await load();
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setCancelling(false);
  }

  async function eliminarPermanente(id:number) {
    if(!confirm('¿Eliminar permanentemente? Esta acción no se puede deshacer.')) return;
    try{
      await apiFetch(`/ventas/solicitudes/${id}/permanente`,{method:'DELETE'});
      showToast('Eliminado permanentemente','ok');
      await loadPapelera();
    }catch(err:any){showToast('Error: '+err.message,'err');}
  }

  async function restaurarSC(id:number) {
    try{
      await apiFetch(`/ventas/solicitudes/${id}/restaurar`,{method:'POST'});
      showToast('Solicitud restaurada a Borrador','ok');
      await loadPapelera();
      await load();
    }catch(err:any){showToast('Error: '+err.message,'err');}
  }

  function onCustSearch(q:string) {
    setCustSearch(q);setSelectedCust(null);setCustSearchDone(false);
    if(custTimer.current) clearTimeout(custTimer.current);
    if(!q.trim()){setCustResults([]);return;}
    const reqId=++custReqId.current;
    custTimer.current=setTimeout(async()=>{
      const d=await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q)}`).catch(()=>[]);
      if(reqId!==custReqId.current) return; // respuesta de una busqueda anterior ya obsoleta
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

  async function changeEstado(scId:number,newEstado:string) {
    if(newEstado==='CANCELADA'&&!window.confirm('Cancelar esta solicitud?')) return;
    setSaving(true);
    try{
      await apiFetch(`/ventas/solicitudes/${scId}`,{method:'PATCH',body:JSON.stringify({estado:newEstado,updated_by:currentUser})});
      setSolicitudes(prev=>prev.map(s=>s.id===scId?{...s,estado:newEstado}:s));
      showToast('Estado cambiado');
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setSaving(false);
  }

  function deleteItem(scId:number) {
    setCancelTarget(scId);setCancelRazon('');setShowCancelModal(true);
  }

  async function bulkAction(action:'delete'|'estado',estado?:string) {
    const ids=Array.from(checked);
    for(const id of ids){
      // Soporte Tecnico usa su propio flujo (estado_soporte) y su propio ciclo
      // de vida: ni el cambio masivo de estado de Cotizacion ni la cancelacion
      // masiva deben tocarlo (cancelar aqui lo mandaria a purga en 30 dias,
      // perdiendo el ticket de soporte real)
      const sc=solicitudes.find(s=>s.id===id);
      if(sc?.tipo_solicitud==='Soporte Tecnico') continue;
      if(action==='delete') await changeEstado(id,'CANCELADA');
      else if(estado) await changeEstado(id,estado);
    }
    setChecked(new Set());setShowBulkBar(false);
    showToast(`${ids.length} solicitudes actualizadas`);
  }

  async function createSolicitud(e:React.FormEvent) {
    e.preventDefault();
    if(!selectedCust){
      if(custSearchDone&&custResults.length===0){
        setShowNewClient(true);return;
      }
      showToast('Selecciona un cliente existente o crea uno nuevo — no se puede continuar sin un cliente real','err');
      return;
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
        // advisor_user_id / asignado_a_user_id son Integer/nullable en el backend: nunca enviar '' (rompe el INSERT)
        advisor_user_id:form.advisor_user_id||null,
        asignado_a_user_id:form.asignado_a_user_id||null,
      })});
      // Auto-create CRM Lead silently (only if customer_id exists; Soporte Tecnico
      // tiene su propio flujo y no debe generar una tarjeta en el pipeline de ventas)
      if(selectedCust?.id && form.tipo_solicitud!=='Soporte Tecnico'){
        apiFetch('/crm/leads',{method:'POST',body:JSON.stringify({
          customer_id:selectedCust.id,
          sc_id:scData?.data?.id,
          advisor_name:form.advisor_name||currentUser,
          solicitud_tipo:form.tipo_solicitud||'Cotizacion de Producto',
          description:`SC creada: ${scData?.numero||''} - ${form.notas||''}`.substring(0,500),
          lead_source:'SC',
          lead_product_name:prodsToSend[0]?.product_name||'',
          lead_qty:prodsToSend[0]?.qty||1,
        })}).catch(()=>{}); // Silent â€” CRM lead is best-effort
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
    setForm({advisor_name:currentUser,advisor_user_id:'',tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:5,tipo_problema:'',descripcion_problema:'',urgencia:'',evidencia_descripcion:'',asignado_a_user_id:''});
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
  const totalActivas=solicitudes.filter(s=>s.tipo_solicitud!=='Soporte Tecnico'&&s.estado!=='CONFIRMADA'&&s.estado!=='CANCELADA').length;
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
    if(activeTab==='Activas') return sc.tipo_solicitud!=='Soporte Tecnico'&&sc.estado!=='CONFIRMADA'&&sc.estado!=='CANCELADA';
    if(activeTab==='Confirmadas') return sc.estado==='CONFIRMADA';
    if(activeTab==='Canceladas') return sc.estado==='CANCELADA';
    if(activeTab==='Soporte') return sc.tipo_solicitud==='Soporte Tecnico';
    return true;
  });

  const isCotizacion=form.tipo_solicitud==='Cotizacion de Producto';
  const isSeguimiento=form.tipo_solicitud==='Seguimiento';
  const isProgramarEntrega=form.tipo_solicitud==='Programar Entrega';
  const isDevolucion=form.tipo_solicitud==='Devolucion de Producto';
  const isSoporte=form.tipo_solicitud==='Soporte Tecnico';

  return (
    <div className="w-full bg-slate-50 min-h-full">
      {toast&&<SharedToast toast={{msg:toast.msg,type:toast.type==='ok'?'ok':'error'}} onClose={()=>setToast(null)}/>}
      {showNewClient&&<NewClientModal onSave={c=>{const cust=c?.data??c; setSelectedCust(cust);setCustSearch(`${cust.first_name||''} ${cust.last_name||''}`.trim());setCustResults([]);setShowNewClient(false);setShowCreate(true);showToast('Cliente creado exitosamente');}} onClose={()=>setShowNewClient(false)}/>}

      {/* Sub-module nav */}
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/solicitud" color="indigo" hub={{ href: '/dashboard/ventas' }} />

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
            {Object.entries(ESTADOS_SC_MANUALES).map(([k,v])=>(
              <button key={k} onClick={()=>bulkAction('estado',k)} className="bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-lg text-xs font-bold border border-white/30">{v.label}</button>
            ))}
            <button onClick={()=>bulkAction('delete')} className="bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle size={12}/>Cancelar seleccionadas</button>
            <button onClick={()=>{setChecked(new Set());setShowBulkBar(false);}} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><X size={12}/>Limpiar</button>
          </div>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <PageHeader
          icon={FileText} color="indigo"
          title="Solicitudes de Cliente"
          subtitle="Pipeline: Solicitud (SC) → Cotización (COT) → Pedido de Venta (PVEN)"
          actions={(
            <div className="flex gap-3">
              <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm"><RefreshCw size={15} className={loading?'animate-spin':''}/> Actualizar</button>
              <Button onClick={()=>setShowCreate(true)} color="indigo" icon={Plus}>Nueva Solicitud</Button>
            </div>
          )} />

        {/* Interactive Pipeline Component */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white rounded-2xl p-4 shadow-lg border border-indigo-900/50">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Steps Flow */}
                <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto pb-1 lg:pb-0">
                  {/* Step 1: SC */}
                  <div
                    onClick={() => { setActiveTab('Activas'); setCurrentPage(1); }}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all border ${activeTab==='Activas' ? 'bg-indigo-600/40 border-indigo-400 ring-2 ring-indigo-400/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    title="Clic para ver Solicitudes Activas"
                  >
                    <div className="w-8 h-8 rounded-lg bg-indigo-500/30 text-indigo-300 flex items-center justify-center font-black text-xs shrink-0 border border-indigo-400/30">
                      1
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm tracking-wide text-white">SC · Solicitud</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-400/30">
                          {totalActivas} Activas
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-medium">Requerimiento inicial del cliente</p>
                    </div>
                  </div>

                  {/* Arrow 1 */}
                  <div className="flex items-center justify-center text-indigo-400 shrink-0">
                    <ChevronRight size={18} className="animate-pulse" />
                  </div>

                  {/* Step 2: COT */}
                  <div
                    onClick={() => { setActiveTab('Confirmadas'); setCurrentPage(1); }}
                    className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all border ${activeTab==='Confirmadas' ? 'bg-emerald-600/40 border-emerald-400 ring-2 ring-emerald-400/40' : 'bg-white/5 border-white/10 hover:bg-white/10'}`}
                    title="Clic para ver Solicitudes Confirmadas que generaron Cotización"
                  >
                    <div className="w-8 h-8 rounded-lg bg-emerald-500/30 text-emerald-300 flex items-center justify-center font-black text-xs shrink-0 border border-emerald-400/30">
                      2
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm tracking-wide text-white">COT · Cotización</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30">
                          {totalConf} Generadas
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-300 font-medium">Propuesta formal con precios y TRM</p>
                    </div>
                  </div>

                  {/* Arrow 2 */}
                  <div className="flex items-center justify-center text-emerald-400 shrink-0">
                    <ChevronRight size={18} className="animate-pulse" />
                  </div>

                  {/* Step 3: VEN */}
                  <Link
                    href="/dashboard/ventas/venta"
                    className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl transition-all border bg-white/5 border-white/10 hover:bg-purple-600/30 hover:border-purple-400 shrink-0 group"
                    title="Ir al módulo de Pedidos de Venta"
                  >
                    <div className="w-8 h-8 rounded-lg bg-purple-500/30 text-purple-300 flex items-center justify-center font-black text-xs shrink-0 border border-purple-400/30 group-hover:scale-105 transition-transform">
                      3
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-extrabold text-sm tracking-wide text-white group-hover:text-purple-200">VEN · Pedido de Venta</span>
                        <ArrowUpRight size={12} className="text-purple-400 group-hover:translate-x-0.5 transition-transform" />
                      </div>
                      <p className="text-[11px] text-slate-300 font-medium">Pago, empaque, reserva y despacho</p>
                    </div>
                  </Link>
                </div>

                {/* Right guide toggle button */}
                <button
                  onClick={() => setShowPipelineGuide(!showPipelineGuide)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-indigo-200 text-xs font-bold border border-white/10 shrink-0 transition-colors"
                >
                  <Info size={14} className="text-indigo-400" />
                  {showPipelineGuide ? 'Ocultar Guía' : '¿Cómo funciona el flujo?'}
                </button>
              </div>

              {/* Collapsible Pipeline Guide Card */}
              {showPipelineGuide && (
                <div className="mt-3.5 pt-3.5 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="font-black text-indigo-300 uppercase text-[10px] tracking-wider mb-1">1. Registro de SC</p>
                    <p className="text-slate-300 leading-relaxed">
                      Captura los datos del cliente, productos y modalidad de pago (Contado, 60/40 o Crédito). Permanece en estado <strong>Borrador</strong> o <strong>Pendiente de confirmación</strong>.
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="font-black text-emerald-300 uppercase text-[10px] tracking-wider mb-1">2. Auto-conversión a COT</p>
                    <p className="text-slate-300 leading-relaxed">
                      Al pulsar <strong>"Confirmar + Crear Cotización"</strong>, el sistema valida las líneas y genera la cotización vinculada con TRM en tiempo real.
                    </p>
                  </div>
                  <div className="bg-white/5 rounded-xl p-3 border border-white/5">
                    <p className="font-black text-rose-300 uppercase text-[10px] tracking-wider mb-1">3. Cancelación & Papelera</p>
                    <p className="text-slate-300 leading-relaxed">
                      Si una SC se cancela, se exige el <strong>motivo</strong> y se traslada a la <strong>Papelera</strong> con retención de 30 días antes de permitir su eliminación permanente.
                    </p>
                  </div>
                </div>
              )}
            </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={FileText} label="Activas" value={totalActivas} hint={sinAtender>0?`${sinAtender} sin atender`:'Todas atendidas'} color="amber"/>
          <StatCard icon={CheckCircle2} label="Confirmadas (COT)" value={totalConf} hint={`${totalConf} generaron cotizacion`} color="emerald"/>
          <StatCard icon={X} label="Canceladas" value={solicitudes.filter(s=>s.estado==='CANCELADA').length} hint="Fuera del pipeline" color="red"/>
          <StatCard icon={Activity} label="Total" value={solicitudes.length} hint={`${totalConf} convertidas a COT`} color="indigo"/>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 px-4 pt-4 pb-3">
            {/* ROW 1: TABS + VIEW TOGGLE */}
            <div className="flex items-center justify-between pb-0">
              <div className="flex items-center gap-1 overflow-x-auto">
                {(['Activas','Confirmadas','Canceladas','Soporte','Papelera','Analisis'] as const).map(tab=>(
                  <button key={tab} onClick={()=>{setActiveTab(tab as any);setCurrentPage(1);if(tab==='Papelera')loadPapelera();}}
                    className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab===tab?'bg-indigo-600 text-white shadow-sm':'text-gray-600 hover:text-indigo-700 hover:bg-indigo-50'}`}>
                    {tab==='Papelera'?'🗑️ Papelera':tab}
                    {tab!=='Analisis'&&tab!=='Papelera'&&<span className={`ml-1.5 text-xs font-black ${activeTab===tab?'text-indigo-200':'text-gray-400'}`}>
                      {tab==='Activas'?totalActivas:tab==='Confirmadas'?solicitudes.filter(s=>s.estado==='CONFIRMADA').length:tab==='Soporte'?solicitudes.filter(s=>s.tipo_solicitud==='Soporte Tecnico').length:solicitudes.filter(s=>s.estado==='CANCELADA').length}
                    </span>}
                  </button>
                ))}
              </div>
              {activeTab!=='Analisis'&&(
                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <button className="p-2 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/></svg>
                  </button>
                  <button className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50">
                    <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="14" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor"/></svg>
                  </button>
                </div>
              )}
            </div>

            {/* ROW 2: SEARCH + FILTER + COUNT */}
            {activeTab!=='Analisis'&&(
              <div className="flex items-center gap-3 pt-3 mt-3 border-t border-slate-100">
                <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[420px] shadow-sm">
                  <Search className="text-slate-400 shrink-0" size={14}/>
                  <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar SC, cliente, asesor..." className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder-slate-400"/>
                  {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
                </div>
                <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 shadow-sm">
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                  Filtrar Estado
                </button>
                <span className="text-sm text-slate-400 font-medium">{filtered.length} registros</span>
              </div>
            )}
          </div>

          {/* PAPELERA TABLE */}
          {activeTab==='Papelera'&&(
            <div className="p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-black text-slate-500 uppercase">Solicitudes en Papelera — Se eliminan permanentemente a los 30 días</p>
                <button onClick={loadPapelera} className="text-xs text-slate-400 hover:text-slate-600 font-bold flex items-center gap-1"><RefreshCw size={11} className={loadingPapelera?'animate-spin':''}/> Actualizar</button>
              </div>
              {loadingPapelera?<div className="flex justify-center py-8"><RefreshCw size={20} className="animate-spin text-slate-400"/></div>:papelera.length===0?<EmptyState icon={Trash2} message="La papelera está vacía." hint="Las solicitudes canceladas aparecen aquí por 30 días."/>:(
                <div className="space-y-2">
                  {papelera.map((sc:any)=>(
                    <div key={sc.id} className="bg-white border border-red-100 rounded-xl p-4 flex items-center justify-between hover:border-red-300 transition-colors">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-black text-red-700 text-sm">{sc.numero}</span>
                          <SharedBadge tone="danger">{sc.tipo_solicitud||'SC'}</SharedBadge>
                        </div>
                        <p className="text-xs text-slate-600 font-medium">{sc.customer_name||'-'} — {sc.advisor_name||'-'}</p>
                        {sc.razon_cancelacion&&<p className="text-xs text-slate-500 mt-1 italic">Razón: {sc.razon_cancelacion}</p>}
                      </div>
                      <div className="flex items-center gap-3 flex-shrink-0 ml-4">
                        <div className="text-right">
                          <p className={`text-xs font-black ${sc.dias_restantes<=5?'text-red-600':'text-amber-600'}`}>{sc.dias_restantes} días</p>
                          <p className="text-[10px] text-slate-400">para eliminar</p>
                        </div>
                        <button onClick={()=>restaurarSC(sc.id)} className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 flex items-center gap-1"><RotateCcw size={11}/>Restaurar</button>
                        <button onClick={()=>eliminarPermanente(sc.id)} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 flex items-center gap-1"><Trash2 size={11}/>Eliminar permanentemente</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab!=='Papelera' && activeTab!=='Analisis' && (
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
                  {activeTab === 'Canceladas' ? (
                    <th className="px-4 py-4 min-w-[240px]">Razón de Cancelación</th>
                  ) : (
                    <th className="px-4 py-4">Vencimiento</th>
                  )}
                  <th className="px-4 py-4">Estado</th>
                  <th className="px-4 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading?(
                  <tr><td colSpan={9} className="px-6 py-16 text-center"><RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-2"/><p className="text-slate-400">Cargando...</p></td></tr>
                ):filtered.length===0?(
                  <tr><td colSpan={9}><EmptyState icon={FileText} message="No hay registros." hint="Ajusta la búsqueda o el filtro, o crea una nueva solicitud."/></td></tr>
                ):filtered.slice((currentPage-1)*pageSize, currentPage*pageSize).map(sc=>{
                  const isOverdue=sc.fecha_vencimiento&&new Date(sc.fecha_vencimiento)<new Date();
                  const isStale=(Date.now()-new Date(sc.updated_at||sc.fecha_solicitud).getTime())/3600000>alertDias*24;
                  return (
                    <tr key={sc.id} onClick={()=>router.push(`/dashboard/ventas/solicitud/${sc.id}`)} className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${isStale&&sc.estado==='BORRADOR'?'bg-rose-50/30':''}`}>
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
                      {activeTab === 'Canceladas' ? (
                        <td className="px-4 py-4 min-w-[240px]" onClick={e=>e.stopPropagation()}>
                          <div className="bg-rose-50 border border-rose-200 text-rose-800 px-3 py-1.5 rounded-xl text-xs font-semibold flex items-start gap-2 shadow-sm">
                            <AlertCircle size={14} className="text-rose-500 shrink-0 mt-0.5" />
                            <span className="line-clamp-2 leading-relaxed" title={getRazonCancelacion(sc)}>
                              {getRazonCancelacion(sc)}
                            </span>
                          </div>
                        </td>
                      ) : (
                        <td className="px-4 py-4"><span className={`font-medium text-xs ${isOverdue?'text-red-600 font-bold':''}`}>{isOverdue&&<AlertTriangle size={10} className="inline mr-1"/>}{fDate(sc.fecha_vencimiento)}</span></td>
                      )}
                      <td className="px-4 py-4"><EstadoBadge estado={sc.estado}/></td>
                      <td className="px-4 py-4" onClick={e=>e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={()=>router.push(`/dashboard/ventas/solicitud/${sc.id}`)} title="Ver Detalle" className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 p-1.5 rounded-lg text-xs font-bold transition-colors">
                            <FileText size={13}/>
                          </button>
                          {sc.tipo_solicitud!=='Soporte Tecnico' && (
                            sc.estado === 'CANCELADA' ? (
                              <button onClick={()=>enviarAPapelera(sc.id)} title="Enviar a la papelera" className="bg-rose-50 hover:bg-rose-100 text-rose-600 p-1.5 rounded-lg text-xs font-bold transition-colors flex items-center gap-1">
                                <Trash2 size={13}/>
                              </button>
                            ) : (
                              <button onClick={()=>deleteItem(sc.id)} title="Cancelar Solicitud" className="bg-slate-100 hover:bg-amber-50 hover:text-amber-600 text-slate-500 p-1.5 rounded-lg text-xs font-bold transition-colors">
                                <X size={13}/>
                              </button>
                            )
                          )}
                          <RowMenu sc={sc} onView={()=>router.push(`/dashboard/ventas/solicitud/${sc.id}`)} onChangeEstado={e=>changeEstado(sc.id,e)} onCancel={()=>deleteItem(sc.id)} onSendToTrash={()=>enviarAPapelera(sc.id)}/>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          )}

          {/* PAGINATION FOOTER */}
          {activeTab!=='Analisis'&&activeTab!=='Papelera'&&(
            <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">{filtered.length} registros</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none focus:ring-1 focus:ring-indigo-200">
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
              </div>
              {Math.ceil(filtered.length/pageSize)>1&&(
                <div className="flex items-center gap-1">
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
                  {Array.from({length:Math.min(5,Math.ceil(filtered.length/pageSize))},(_, i)=>{
                    const tp=Math.ceil(filtered.length/pageSize);
                    let page=i+1;
                    if(tp>5){const half=Math.floor(5/2);const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                    return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-indigo-600 text-white border-indigo-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
                  })}
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(Math.ceil(filtered.length/pageSize))} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
                </div>
              )}
            </div>
          )}

          {/* TAB ANALISIS: DASHBOARD, GRAFICAS (LINEAS, BARRAS, TORTA), TOP CLIENTES & IA ANALYST */}
          {activeTab === 'Analisis' && (
            <div className="p-6 space-y-8">
              {/* Analytics KPI Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                <StatCard icon={TrendingUp} color="indigo"
                  label="Tasa de Conversión"
                  value={`${solicitudes.length > 0 ? ((totalConf / solicitudes.length) * 100).toFixed(1) : 0}%`}
                  hint={`${totalConf} de ${solicitudes.length} pasaron a Cotización (COT)`}/>
                <StatCard icon={Clock} color="amber"
                  label="Solicitudes Activas"
                  value={totalActivas}
                  hint={sinAtender > 0 ? `${sinAtender} requieren atención urgente` : 'Todas en seguimiento regular'}/>
                <StatCard icon={AlertTriangle} color="rose"
                  label="Cancelaciones"
                  value={solicitudes.filter(s=>s.estado==='CANCELADA').length}
                  hint={`${solicitudes.length > 0 ? ((solicitudes.filter(s=>s.estado==='CANCELADA').length / solicitudes.length) * 100).toFixed(1) : 0}% tasa de descarte global`}/>
                <StatCard icon={CheckCircle2} color="emerald"
                  label="Total Pipeline"
                  value={solicitudes.length}
                  hint="Histórico acumulado de requerimientos"/>
              </div>

              {/* Charts Section: Line & Bar & Donut */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 1. DIAGRAMA DE LÍNEAS: Tendencia Temporal */}
                <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                        <Activity size={18} className="text-indigo-600"/> Tendencia de Solicitudes Recibidas
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">Volumen por fecha de ingreso al ERP</p>
                    </div>
                    <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-3 py-1 rounded-full border border-indigo-100">
                      Últimos registros
                    </span>
                  </div>

                  {/* Dynamic SVG Line Chart */}
                  {(() => {
                    // Group solicitudes by date
                    const dateMap: Record<string, number> = {};
                    solicitudes.forEach(s => {
                      const d = s.fecha_solicitud ? new Date(s.fecha_solicitud).toLocaleDateString('es-CO', {month:'short', day:'numeric'}) : 'Reciente';
                      dateMap[d] = (dateMap[d] || 0) + 1;
                    });
                    const entries = Object.entries(dateMap).slice(-8);
                    if (entries.length === 0) entries.push(['Hoy', 0]);
                    const maxVal = Math.max(...entries.map(e => e[1]), 5);
                    const width = 600;
                    const height = 180;
                    const padding = 35;
                    const stepX = entries.length > 1 ? (width - padding * 2) / (entries.length - 1) : 0;
                    const points = entries.map((e, idx) => {
                      const x = padding + idx * stepX;
                      const y = height - padding - ((e[1] / maxVal) * (height - padding * 2));
                      return { x, y, label: e[0], val: e[1] };
                    });
                    const polylinePts = points.map(p => `${p.x},${p.y}`).join(' ');
                    const areaD = points.length > 0 ? `M ${points[0].x} ${height - padding} ` + points.map(p => `L ${p.x} ${p.y}`).join(' ') + ` L ${points[points.length-1].x} ${height - padding} Z` : '';

                    return (
                      <div className="w-full overflow-x-auto">
                        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-48 select-none">
                          <defs>
                            <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.3"/>
                              <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.0"/>
                            </linearGradient>
                          </defs>
                          {/* Grid horizontal lines */}
                          {[0, 0.5, 1].map((ratio, i) => {
                            const y = height - padding - ratio * (height - padding * 2);
                            return (
                              <g key={i}>
                                <line x1={padding} y1={y} x2={width - padding} y2={y} stroke="#f1f5f9" strokeDasharray="4 4" strokeWidth="1"/>
                                <text x={padding - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#94a3b8" fontWeight="bold">
                                  {Math.round(ratio * maxVal)}
                                </text>
                              </g>
                            );
                          })}
                          {/* Area & Line */}
                          {areaD && <path d={areaD} fill="url(#areaGrad)" />}
                          {polylinePts && <polyline fill="none" stroke="#4f46e5" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polylinePts}/>}
                          {/* Circles & Labels */}
                          {points.map((p, i) => (
                            <g key={i} className="group cursor-pointer">
                              <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke="#4f46e5" strokeWidth="2.5" className="transition-all hover:scale-125"/>
                              <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#1e293b" fontWeight="bold">
                                {p.val}
                              </text>
                              <text x={p.x} y={height - 10} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">
                                {p.label}
                              </text>
                            </g>
                          ))}
                        </svg>
                      </div>
                    );
                  })()}
                </div>

                {/* 2. DIAGRAMA DE TORTA / DONUT: Estados o Razones */}
                <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                        <PieChart size={18} className="text-emerald-600"/> Distribución
                      </h4>
                      <p className="text-xs text-slate-400 font-medium">Proporciones del pipeline</p>
                    </div>
                    {/* Toggle Estados vs Motivos */}
                    <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                      <button
                        onClick={() => setDonutMode('estados')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode==='estados'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}
                      >
                        Estados
                      </button>
                      <button
                        onClick={() => setDonutMode('motivos')}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode==='motivos'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}
                      >
                        Canceladas
                      </button>
                    </div>
                  </div>

                  {/* SVG Donut */}
                  {(() => {
                    const slices: { label: string; count: number; color: string }[] = [];
                    if (donutMode === 'estados') {
                      slices.push({ label: 'Borrador', count: solicitudes.filter(s=>s.estado==='BORRADOR').length, color: '#94a3b8' });
                      slices.push({ label: 'Pendiente', count: solicitudes.filter(s=>s.estado==='PENDIENTE_CONFIRMACION').length, color: '#f59e0b' });
                      slices.push({ label: 'Confirmada', count: solicitudes.filter(s=>s.estado==='CONFIRMADA').length, color: '#10b981' });
                      slices.push({ label: 'Cancelada', count: solicitudes.filter(s=>s.estado==='CANCELADA').length, color: '#ef4444' });
                    } else {
                      const reasonCounts: Record<string, number> = {};
                      solicitudes.filter(s=>s.estado==='CANCELADA').forEach(s => {
                        const r = getRazonCancelacion(s);
                        reasonCounts[r] = (reasonCounts[r] || 0) + 1;
                      });
                      const pal = ['#ef4444', '#f97316', '#ec4899', '#8b5cf6', '#64748b'];
                      Object.entries(reasonCounts).slice(0, 5).forEach(([r, count], i) => {
                        slices.push({ label: r, count, color: pal[i % pal.length] });
                      });
                      if (slices.length === 0) {
                        slices.push({ label: 'Sin cancelaciones', count: 1, color: '#10b981' });
                      }
                    }

                    const sum = slices.reduce((acc, s) => acc + s.count, 0) || 1;
                    let accumulatedPercent = 0;

                    return (
                      <div className="flex flex-col items-center justify-center py-2">
                        <div className="relative w-36 h-36 flex items-center justify-center">
                          <svg viewBox="0 0 42 42" className="w-full h-full transform -rotate-90">
                            <circle cx="21" cy="21" r="15.915" fill="transparent" stroke="#f1f5f9" strokeWidth="5"/>
                            {slices.map((slice, i) => {
                              const pct = (slice.count / sum) * 100;
                              const strokeDasharray = `${pct} ${100 - pct}`;
                              const strokeDashoffset = -accumulatedPercent;
                              accumulatedPercent += pct;
                              return (
                                <circle
                                  key={i}
                                  cx="21"
                                  cy="21"
                                  r="15.915"
                                  fill="transparent"
                                  stroke={slice.color}
                                  strokeWidth="5"
                                  strokeDasharray={strokeDasharray}
                                  strokeDashoffset={strokeDashoffset}
                                  className="transition-all duration-500"
                                />
                              );
                            })}
                          </svg>
                          <div className="absolute text-center">
                            <span className="text-xl font-black text-slate-800">{sum}</span>
                            <p className="text-[9px] uppercase font-black text-slate-400">Total</p>
                          </div>
                        </div>

                        {/* Legend */}
                        <div className="w-full mt-4 space-y-1.5">
                          {slices.map((s, i) => (
                            <div key={i} className="flex items-center justify-between text-xs">
                              <div className="flex items-center gap-2 min-w-0">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: s.color }}/>
                                <span className="text-slate-600 font-medium truncate" title={s.label}>{s.label}</span>
                              </div>
                              <span className="font-bold text-slate-800 shrink-0 ml-2">
                                {s.count} ({Math.round((s.count / sum) * 100)}%)
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* 3. DIAGRAMA DE BARRAS: Distribución por Tipo de Solicitud */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <BarChart3 size={18} className="text-purple-600"/> Distribución por Tipo de Solicitud de Cliente
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Comparativa de motivos y tasas de conversión por categoría</p>
                  </div>
                  <span className="text-xs font-bold text-slate-500">Categorías oficiales</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {TIPOS_SC.map(tipo => {
                    const matching = solicitudes.filter(s => (s.tipo_solicitud || 'Cotizacion de Producto') === tipo);
                    const count = matching.length;
                    const confCount = matching.filter(s => s.estado === 'CONFIRMADA').length;
                    const totalAll = solicitudes.length || 1;
                    const pctOfAll = Math.round((count / totalAll) * 100);
                    const convRatio = count > 0 ? Math.round((confCount / count) * 100) : 0;

                    return (
                      <div key={tipo} className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-indigo-200 transition-colors">
                        <div className="flex items-start justify-between mb-2">
                          <p className="font-black text-xs text-slate-800 leading-tight">{tipo}</p>
                          <span className="font-extrabold text-sm text-indigo-700 bg-white px-2 py-0.5 rounded-md border border-slate-100 shadow-xs">
                            {count}
                          </span>
                        </div>
                        <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                          <div className="bg-indigo-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pctOfAll * 2.5, 100)}%` }}/>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                          <span>{pctOfAll}% del pipeline</span>
                          <span className="text-emerald-700 font-bold">{convRatio}% a COT</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. SELECTOR DE TOP CLIENTES (Top 5, 10, 20, 50) */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                  <div>
                    <h4 className="font-black text-slate-800 text-lg flex items-center gap-2">
                      <Award size={20} className="text-amber-500"/> Ranking de Top Clientes
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Clientes con mayor recurrencia y generación de solicitudes en Nebulae</p>
                  </div>
                  {/* Selector de Límite */}
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                    <span className="text-xs font-black text-slate-500 px-2 uppercase">Mostrar:</span>
                    {[5, 10, 20, 50].map(lim => (
                      <button
                        key={lim}
                        onClick={() => setTopClientsLimit(lim)}
                        className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${topClientsLimit === lim ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                      >
                        Top {lim}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Table Top Clientes */}
                {(() => {
                  const clientAgg: Record<string, { name: string; phone: string; email: string; total: number; conf: number; act: number; canc: number }> = {};
                  solicitudes.forEach(s => {
                    const key = (s.customer_name || 'Cliente Sin Nombre').trim();
                    if (!clientAgg[key]) {
                      clientAgg[key] = {
                        name: key,
                        phone: s.customer_phone || '',
                        email: s.customer_email || '',
                        total: 0,
                        conf: 0,
                        act: 0,
                        canc: 0
                      };
                    }
                    clientAgg[key].total += 1;
                    if (s.estado === 'CONFIRMADA') clientAgg[key].conf += 1;
                    else if (s.estado === 'CANCELADA') clientAgg[key].canc += 1;
                    else clientAgg[key].act += 1;
                  });

                  const ranked = Object.values(clientAgg).sort((a,b) => b.total - a.total).slice(0, topClientsLimit);

                  return (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm">
                        <thead className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                          <tr>
                            <th className="px-4 py-3">Posición</th>
                            <th className="px-4 py-3">Cliente</th>
                            <th className="px-4 py-3">Contacto</th>
                            <th className="px-4 py-3 text-center">Total Solicitudes</th>
                            <th className="px-4 py-3">Desglose de Estados</th>
                            <th className="px-4 py-3 text-right">Efectividad</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs">
                          {ranked.length === 0 ? (
                            <tr><td colSpan={6} className="py-8 text-center text-slate-400">Sin datos de clientes disponibles.</td></tr>
                          ) : ranked.map((c, idx) => {
                            const successRate = c.total > 0 ? Math.round((c.conf / c.total) * 100) : 0;
                            return (
                              <tr key={c.name} className="hover:bg-slate-50/80 transition-colors">
                                <td className="px-4 py-3">
                                  <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${idx===0 ? 'bg-amber-100 text-amber-800' : idx===1 ? 'bg-slate-200 text-slate-700' : idx===2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>
                                    {idx + 1}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <p className="font-extrabold text-slate-800">{c.name}</p>
                                </td>
                                <td className="px-4 py-3 text-slate-500">
                                  {c.phone || c.email ? (
                                    <div className="space-y-0.5">
                                      {c.phone && <p>{c.phone}</p>}
                                      {c.email && <p className="text-indigo-600">{c.email}</p>}
                                    </div>
                                  ) : (
                                    <span className="text-slate-400 italic">Sin datos directos</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <span className="font-black text-sm text-indigo-700 bg-indigo-50 border border-indigo-100 px-3 py-1 rounded-xl">
                                    {c.total}
                                  </span>
                                </td>
                                <td className="px-4 py-3">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold text-[10px]" title="Confirmadas">
                                      {c.conf} COT
                                    </span>
                                    <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold text-[10px]" title="Activas">
                                      {c.act} Activas
                                    </span>
                                    {c.canc > 0 && (
                                      <span className="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded font-bold text-[10px]" title="Canceladas">
                                        {c.canc} Canc.
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  <div className="inline-flex items-center gap-2">
                                    <div className="w-16 bg-slate-200 h-2 rounded-full overflow-hidden">
                                      <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${successRate}%` }}/>
                                    </div>
                                    <span className="font-black text-emerald-700 w-10 text-right">{successRate}%</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  );
                })()}
              </div>

              {/* 5. SECCIÓN DE IA: PREGUNTAS Y RESPUESTAS DEL PIPELINE DE SOLICITUDES */}
              <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-indigo-900/50">
                <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-indigo-800/40">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 shadow-inner">
                      <Bot size={22} className="text-indigo-300 animate-pulse"/>
                    </div>
                    <div>
                      <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                        Nebulae AI · Analista del Pipeline de Ventas
                        <span className="text-[10px] uppercase font-black bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 px-2 py-0.5 rounded-full">
                          En Vivo
                        </span>
                      </h3>
                      <p className="text-xs text-slate-300 font-medium">
                        Respuestas estratégicas, cuellos de botella y proyecciones basadas en datos reales de solicitudes
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setAiChatHistory([{ role: 'ia', text: 'Historial reiniciado. Hazme una consulta sobre tus solicitudes y conversiones.', time: 'Ahora' }])}
                    className="text-xs text-slate-400 hover:text-white font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10"
                  >
                    <RotateCcw size={12}/> Limpiar
                  </button>
                </div>

                {/* Quick Prompts Chips */}
                <div className="mb-5">
                  <p className="text-xs font-black text-indigo-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Sparkles size={13} className="text-amber-400"/> Consultas rápidas recomendadas:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      '¿Cuál es el diagnóstico de conversión del pipeline (SC → COT)?',
                      '¿Cuáles son los principales motivos de cancelación registrados?',
                      '¿Qué clientes tienen mayor volumen o solicitudes estancadas?',
                      '¿Cuáles son las recomendaciones comerciales para optimizar el cierre?'
                    ].map((promptText, i) => (
                      <button
                        key={i}
                        onClick={() => handleAiQuestion(promptText)}
                        disabled={aiLoading}
                        className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-indigo-600/50 border border-white/10 text-slate-200 hover:text-white transition-colors text-left"
                      >
                        {promptText}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Conversation Box */}
                <div className="bg-black/30 rounded-2xl p-4 max-h-[360px] overflow-y-auto space-y-4 border border-white/10">
                  {aiChatHistory.map((msg, i) => (
                    <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                      {msg.role === 'ia' && (
                        <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                          AI
                        </div>
                      )}
                      <div className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-indigo-600 text-white font-semibold' : 'bg-white/10 text-slate-100 border border-white/10 font-normal'}`}>
                        <div className="whitespace-pre-wrap">{msg.text}</div>
                        <span className="block text-[10px] mt-1.5 opacity-60 text-right">{msg.time}</span>
                      </div>
                    </div>
                  ))}
                  {aiLoading && (
                    <div className="flex items-center gap-2 text-indigo-300 text-xs font-bold pl-2 py-1">
                      <RefreshCw size={14} className="animate-spin text-indigo-400"/>
                      <span>Analizando pipeline y métricas de solicitudes...</span>
                    </div>
                  )}
                </div>

                {/* Question Input */}
                <div className="mt-4 flex gap-2">
                  <input
                    type="text"
                    value={aiQuery}
                    onChange={e => setAiQuery(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAiQuestion()}
                    placeholder="Pregunta a la IA sobre solicitudes, estados, conversión de clientes o asesores..."
                    className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-400"
                  />
                  <button
                    onClick={() => handleAiQuestion()}
                    disabled={!aiQuery.trim() || aiLoading}
                    className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5 shrink-0"
                  >
                    <Send size={13}/> Preguntar
                  </button>
                </div>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* MODAL: RAZÓN DE CANCELACIÓN */}
      {showCancelModal&&(
        <Modal title="Cancelar Solicitud" subtitle="Esta acción pasará la SC a la papelera por 30 días antes de eliminarse." icon={Trash2} color="red" maxWidth="md"
          onClose={()=>setShowCancelModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={()=>setShowCancelModal(false)}>No, mantener</Button>
              <Button variant="danger" icon={Trash2} loading={cancelling} disabled={!cancelRazon.trim()} onClick={cancelWithReason}>Cancelar SC</Button>
            </>
          )}>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Razón de Cancelación *</label>
            <textarea
              value={cancelRazon}
              onChange={e=>setCancelRazon(e.target.value)}
              rows={3}
              placeholder="Describe el motivo de la cancelación..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-200 outline-none"
              autoFocus
            />
            {!cancelRazon.trim()&&<p className="text-xs text-red-500 mt-1">La razón es obligatoria para continuar.</p>}
          </div>
        </Modal>
      )}

      {/* Papelera view active */}

      {/* CREATE MODAL */}
      {showCreate&&(
        <Modal title="Nueva Solicitud de Cliente" subtitle="El numero SC se asignara automaticamente" icon={Plus} color="indigo" maxWidth="3xl"
          onClose={()=>{setShowCreate(false);resetCreateForm();}}
          footer={(
            <>
              <Button variant="secondary" onClick={()=>{setShowCreate(false);resetCreateForm();}}>Cancelar</Button>
              <Button type="submit" form="sc-create-form" color="indigo" icon={Plus} loading={saving}>Crear Solicitud</Button>
            </>
          )}>
          <form id="sc-create-form" onSubmit={createSolicitud} className="space-y-5">
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

                {/* Tipo + Modalidad (Modalidad solo para Cotizacion) */}
                <div className={`grid gap-4 ${isCotizacion ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Tipo de Solicitud</label>
                    <select value={form.tipo_solicitud} onChange={e=>setForm(f=>({...f,tipo_solicitud:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{TIPOS_SC.map(t=><option key={t} value={t}>{t}</option>)}</select></div>
                  {isCotizacion&&(
                    <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
                      <select value={form.modalidad_pago} onChange={e=>setForm(f=>({...f,modalidad_pago:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{MODALIDADES_PAGO.map(m=><option key={m} value={m}>{m}</option>)}</select></div>
                  )}
                </div>

                {isCotizacion&&form.modalidad_pago.includes('60/40')&&(
                  <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex gap-4">
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Anticipo</p><p className="font-black text-indigo-700 text-lg">60%</p></div>
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Saldo al entregar</p><p className="font-black text-slate-700 text-lg">40%</p></div>
                  </div>
                )}

                {/* TYPE-SPECIFIC FIELDS */}
                {isCotizacion&&(
                  <div>
                    <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Producto a Cotizar <span className="text-slate-300 font-medium">(opcional)</span></label>
                    <ProductSearch value={prodName} onChange={v=>setProdName(v)} onSelect={p=>{setProdName(p.name||p.product_name);}}/>
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

                {isSoporte && (
                  <div className="col-span-2 bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
                    <select value={form.tipo_problema||''} onChange={e=>setForm(f=>({...f,tipo_problema:e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      <option value="">Tipo de problema...</option>
                      <option>Falla del producto</option><option>Garantia</option>
                      <option>Duda de uso</option><option>Problema con el pedido o envio</option><option>Otro</option>
                    </select>
                    <textarea placeholder="Descripcion del problema" value={form.descripcion_problema||''}
                      onChange={e=>setForm(f=>({...f,descripcion_problema:e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={3} />
                    <select value={form.urgencia||''} onChange={e=>setForm(f=>({...f,urgencia:e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      <option value="">Urgencia...</option>
                      <option>Baja</option><option>Media</option><option>Alta</option>
                    </select>
                    <textarea placeholder="Descripcion de la evidencia (fotos recibidas por fuera del sistema, etc.)"
                      value={form.evidencia_descripcion||''} onChange={e=>setForm(f=>({...f,evidencia_descripcion:e.target.value}))}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={2} />
                    <select value={form.asignado_a_user_id||''} onChange={e=>{
                      const uid = e.target.value ? Number(e.target.value) : '';
                      setForm(f=>({...f, asignado_a_user_id: uid as any}));
                    }}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
                      <option value="">Asignar a...</option>
                      {usuarios.filter(u=>u.role==='Admin'||u.role==='Vendedor').map(u=>(
                        <option key={u.id} value={u.id}>{u.email}</option>
                      ))}
                    </select>
                  </div>
                )}

                {/* Asesor + Vencimiento */}
                <div className="grid grid-cols-2 gap-4">
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Asesor</label><select value={form.advisor_user_id||''} onChange={e=>{
                    const uid = e.target.value ? Number(e.target.value) : '';
                    const u = usuarios.find(x=>x.id===uid);
                    setForm(f=>({...f, advisor_user_id: uid, advisor_name: u?.email || f.advisor_name}));
                  }}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                  <option value="">Seleccionar asesor...</option>
                  {usuarios.filter(u=>u.role==='Admin'||u.role==='Vendedor').map(u=>(
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select></div>
                  <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Dias Vencimiento</label><input type="number" min="1" max="365" value={form.dias_vencimiento} onChange={e=>setForm(f=>({...f,dias_vencimiento:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
                </div>

                {/* Notas */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas / Observaciones</label>
                  <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} rows={3} placeholder="Detalles de la solicitud..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
                </div>
          </form>
        </Modal>
      )}
    </div>
  );
}


