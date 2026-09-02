'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal, MessageCircle, MessageSquare, Trash2, X,
  List, Send, RefreshCw, Search, Bell, Settings, Activity,
  Filter, LayoutGrid, Clock, CheckCircle2, AlertCircle, Zap,
  ToggleLeft, ToggleRight, Save, TrendingUp, ShieldAlert,
  ShoppingBag, FileText, Package, BarChart3
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';

const SUB_MODULES = [
  { name: 'Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',           path: '/dashboard/ventas/cotizacion' },
  { name: 'Pedido de Venta',      path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',         path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango',       path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion DB',    path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',         path: '/dashboard/ventas/proyecciones' },
];

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

const fCOP  = (v: any) => { const n = Number(v)||0; return n > 0 ? '$'+n.toLocaleString('es-CO') : '-'; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
const daysDiff = (iso: any) => iso ? Math.floor((Date.now()-new Date(iso).getTime())/86400000) : 999;

const getEstadoClass = (e: string) => ({
  BORRADOR:'bg-slate-100 text-slate-700 border-slate-200',
  PENDIENTE_CONFIRMACION:'bg-amber-100 text-amber-800 border-amber-200',
  CONFIRMADA:'bg-emerald-100 text-emerald-700 border-emerald-200',
  ENVIADA:'bg-blue-100 text-blue-700 border-blue-200',
  PENDIENTE_COMPRA:'bg-orange-100 text-orange-700 border-orange-200',
  EN_PROCESO:'bg-purple-100 text-purple-700 border-purple-200',
  LISTO_ENTREGA:'bg-teal-100 text-teal-700 border-teal-200',
  ENTREGADO:'bg-teal-100 text-teal-700 border-teal-200',
  FACTURADO:'bg-green-100 text-green-700 border-green-200',
  CANCELADO:'bg-red-100 text-red-700 border-red-200',
  CANCELADA:'bg-red-100 text-red-700 border-red-200',
  RECHAZADA:'bg-red-100 text-red-700 border-red-200',
} as Record<string,string>)[e] || 'bg-gray-100 text-gray-700 border-gray-200';

const getTipoClass = (t: string) => ({
  SC:'bg-indigo-100 text-indigo-700',
  COT:'bg-amber-100 text-amber-700',
  VEN:'bg-emerald-100 text-emerald-700',
} as Record<string,string>)[t] || 'bg-gray-100 text-gray-700';

function Toast({msg,type,onClose}:{msg:string,type:'ok'|'error',onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,4000);return()=>clearTimeout(t);},[onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${type==='ok'?'bg-emerald-600':'bg-red-600'} text-white`}>
      <span>{msg}</span><button onClick={onClose}><X size={16}/></button>
    </div>
  );
}

/* ── Activities floating panel ── */
function ActivitiesPanel({row,onClose}:{row:any,onClose:()=>void}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  useEffect(()=>{
    (async()=>{
      setLoading(true);
      try {
        let d:any=null;
        if(row.tipo==='SC')  d=await apiFetch(`/ventas/solicitudes/${row.id}`);
        if(row.tipo==='COT') d=await apiFetch(`/ventas/cotizaciones/${row.id}`);
        if(row.tipo==='VEN') d=await apiFetch(`/ventas/pedidos/${row.id}`);
        setDetail(d);
      } catch{}
      setLoading(false);
    })();
  },[row.id,row.tipo]);
  const acts = detail?.actividades||[];
  const chatter=acts.filter((a:any)=>a.action==='CHATTER');
  const hist=acts.filter((a:any)=>a.action!=='CHATTER');
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/30 z-40" onClick={onClose}/>
      <div className="fixed top-0 right-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col w-[480px] border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
              <span className="font-bold text-slate-800">{row.numero}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{row.customer_name||row.cliente?.nombre||'-'}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
        </div>
        {loading?(
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>
        ):(
          <div className="flex-1 overflow-y-auto p-5 space-y-5">
            {chatter.length>0&&(
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-1"><MessageCircle size={12}/> Chatter con Cliente</p>
                <div className="space-y-2">
                  {chatter.map((a:any,i:number)=>(
                    <div key={i} className="bg-green-50 border border-green-100 rounded-xl p-3">
                      <p className="text-sm text-green-900">{a.description}</p>
                      <p className="text-xs text-green-600 mt-1">{a.user_name} - {fDate(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-1"><Activity size={12}/> Historial</p>
              {hist.length===0?<p className="text-xs text-slate-400 italic">Sin actividad</p>:(
                <div className="space-y-3 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                  {[...hist].reverse().map((a:any,i:number)=>(
                    <div key={i} className="flex gap-3 pl-7 relative">
                      <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white"
                        style={{backgroundColor:({CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',SENT:'#10b981',CONFIRMED:'#059669',REJECTED:'#ef4444',UPDATED:'#3b82f6'}as any)[a.action]||'#94a3b8'}}/>
                      <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                        <p className="text-sm font-medium text-slate-700">{a.description}</p>
                        <p className="text-xs text-slate-400 mt-1">{fDate(a.created_at)} {fTime(a.created_at)}{a.user_name&&<span className="ml-2 font-medium">- {a.user_name}</span>}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ── Config Panel ── */
function ConfigPanel({alertDias,onSave,onClose}:{alertDias:any,onSave:(cfg:any)=>void,onClose:()=>void}) {
  const [cfg, setCfg] = useState({
    alerta_sc_dias:  String(alertDias?.alerta_sc_dias?.value  || alertDias?.alerta_sc_dias  || '2'),
    alerta_cot_dias: String(alertDias?.alerta_cot_dias?.value || alertDias?.alerta_cot_dias || '2'),
    alerta_ven_dias: String(alertDias?.alerta_ven_dias?.value || alertDias?.alerta_ven_dias || '2'),
    auto_lead_crm:   String(alertDias?.auto_lead_crm?.value   || alertDias?.auto_lead_crm   || 'true'),
    auto_chatter_ia: String(alertDias?.auto_chatter_ia?.value || alertDias?.auto_chatter_ia || 'false'),
    notif_whatsapp:  String(alertDias?.notif_whatsapp?.value  || alertDias?.notif_whatsapp  || 'false'),
  });
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  async function save(){
    setSaving(true);
    try{ await apiFetch('/ventas/config',{method:'PATCH',body:JSON.stringify(cfg)}); onSave(cfg); setSaved(true); setTimeout(()=>setSaved(false),2000); }
    catch{}
    setSaving(false);
  }
  const Toggle=({k,label,desc}:{k:string,label:string,desc:string})=>(
    <div className="bg-white rounded-xl p-4 border border-indigo-100">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-bold text-sm text-slate-800">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
        <button onClick={()=>setCfg(p=>({...p,[k]:p[k as keyof typeof p]==='true'?'false':'true'}))}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors shrink-0 ${(cfg as any)[k]==='true'?'bg-emerald-50 border-emerald-300 text-emerald-700':'bg-slate-50 border-slate-200 text-slate-500'}`}>
          {(cfg as any)[k]==='true'?<ToggleRight size={16} className="text-emerald-600"/>:<ToggleLeft size={16}/>}
          {(cfg as any)[k]==='true'?'ON':'OFF'}
        </button>
      </div>
    </div>
  );
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 z-[60]" onClick={onClose}/>
      <div className="fixed top-0 right-0 bottom-0 z-[70] bg-white shadow-2xl flex flex-col w-[520px] border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-white">
          <div className="flex items-center gap-3">
            <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md"><Settings size={20}/></div>
            <div><h2 className="font-black text-slate-800 text-lg">Configuracion</h2><p className="text-xs text-slate-500">Automatizaciones, alertas y preferencias</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><Bell size={16} className="text-amber-600"/><h3 className="font-black text-amber-800 text-sm uppercase tracking-wide">Alertas de Tiempo Sin Atender</h3></div>
            <p className="text-xs text-amber-700 mb-4">Si un documento pasa X dias sin cambio de estado, aparece alerta en el banner superior.</p>
            <div className="space-y-3">
              {[{k:'alerta_sc_dias',label:'Solicitudes de Cliente (SC)'},{k:'alerta_cot_dias',label:'Cotizaciones (COT)'},{k:'alerta_ven_dias',label:'Pedidos de Venta (PVEN)'}].map(({k,label})=>(
                <div key={k} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="30" value={(cfg as any)[k]} onChange={e=>setCfg(p=>({...p,[k]:e.target.value}))}
                      className="w-16 border border-slate-200 rounded-lg text-center text-sm font-bold py-1 focus:ring-2 focus:ring-amber-200 outline-none"/>
                    <span className="text-xs text-slate-500 font-medium">dias</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-indigo-600"/><h3 className="font-black text-indigo-800 text-sm uppercase tracking-wide">Automatizaciones</h3></div>
            <div className="space-y-3">
              <Toggle k="auto_lead_crm" label="Auto-crear Lead en CRM" desc="Al crear una SC con cliente registrado, crea automaticamente un Lead en el pipeline CRM."/>
              <Toggle k="auto_chatter_ia" label="Chatter asistido por IA" desc="Sugiere respuestas en el Chatter basado en el historial del cliente."/>
              <Toggle k="notif_whatsapp" label="Notificacion WhatsApp automatica" desc="Al cambiar PVEN a LISTO ENTREGA, envia mensaje al cliente."/>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 bg-white">
          <button onClick={save} disabled={saving}
            className={`w-full py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors ${saved?'bg-emerald-500 text-white':'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
            {saving?<RefreshCw size={16} className="animate-spin"/>:saved?<CheckCircle2 size={16}/>:<Save size={16}/>}
            {saved?'Guardado!':'Guardar Configuracion'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT
   ════════════════════════════════════════════════════════════ */
export default function VentasHub() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab]   = useState('Todos');
  const [viewMode, setViewMode]     = useState<'lista'|'kanban'>('lista');
  const [loading, setLoading]       = useState(true);
  const [toast, setToast]           = useState<{msg:string,type:'ok'|'error'}|null>(null);
  const [search, setSearch]         = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters]   = useState(false);

  const [solicitudes, setSolicitudes]   = useState<any[]>([]);
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [pedidos, setPedidos]           = useState<any[]>([]);
  const [allData, setAllData]           = useState<any[]>([]);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());

  const [analytics, setAnalytics]           = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState('30d');
  const [analyticsTopN, setAnalyticsTopN]   = useState('5');
  const [analyticsProduct, setAnalyticsProduct] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const [alertDias, setAlertDias]   = useState<any>({alerta_sc_dias:'2',alerta_cot_dias:'2',alerta_ven_dias:'2'});
  const [actRow, setActRow]         = useState<any>(null);
  const [selectedVenId, setSelectedVenId] = useState<string|null>(null);
  const [venDetail, setVenDetail]         = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);

  const loadData = useCallback(async()=>{
    setLoading(true);
    try {
      const [sc,cot,ven,cfg] = await Promise.all([
        apiFetch('/ventas/solicitudes?limit=200').catch(()=>[]),
        apiFetch('/ventas/cotizaciones?limit=200').catch(()=>[]),
        apiFetch('/ventas/pedidos?limit=200').catch(()=>[]),
        apiFetch('/ventas/config').catch(()=>({})),
      ]);
      const scL  = (Array.isArray(sc)?sc:(sc?.items||[])).map((x:any)=>({...x,tipo:'SC'}));
      const cotL = (Array.isArray(cot)?cot:(cot?.items||[])).map((x:any)=>({...x,tipo:'COT'}));
      const venL = (Array.isArray(ven)?ven:(ven?.items||[])).map((x:any)=>({...x,tipo:'VEN'}));
      setSolicitudes(scL); setCotizaciones(cotL); setPedidos(venL);
      setAllData([...scL,...cotL,...venL].sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()));
      if(cfg&&typeof cfg==='object') setAlertDias(cfg);
    } catch(err:any){setToast({msg:err.message,type:'error'});}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{if(activeTab==='Analisis')loadAnalytics();},[activeTab,analyticsRange,analyticsTopN]);

  async function loadAnalytics(){
    try{const res=await apiFetch(`/ventas/analytics?range=${analyticsRange}&top_n=${analyticsTopN}`);setAnalytics(res);}
    catch(err:any){setToast({msg:err.message||'Error analytics',type:'error'});}
  }

  const scAlertDias  = Number(alertDias?.alerta_sc_dias?.value  || alertDias?.alerta_sc_dias  || 2);
  const cotAlertDias = Number(alertDias?.alerta_cot_dias?.value || alertDias?.alerta_cot_dias || 2);
  const venAlertDias = Number(alertDias?.alerta_ven_dias?.value || alertDias?.alerta_ven_dias || 2);
  const scAtrasadas  = solicitudes.filter(s=>!['CONFIRMADA','CANCELADA'].includes(s.estado)&&daysDiff(s.updated_at||s.created_at)>=scAlertDias);
  const cotAtrasadas = cotizaciones.filter(c=>!['CONFIRMADA','RECHAZADA'].includes(c.estado)&&daysDiff(c.updated_at||c.created_at)>=cotAlertDias);
  const venAtrasadas = pedidos.filter(v=>!['ENTREGADO','FACTURADO','CANCELADO'].includes(v.estado)&&daysDiff(v.updated_at||v.created_at)>=venAlertDias);
  const totalAtrasadas = scAtrasadas.length+cotAtrasadas.length+venAtrasadas.length;

  const filteredData = React.useMemo(()=>{
    let base:any[]=[];
    if(activeTab==='Todos') base=allData;
    else if(activeTab==='SC') base=solicitudes;
    else if(activeTab==='Cotizaciones') base=cotizaciones;
    else if(activeTab==='Pedidos de Venta') base=pedidos;
    else return [];
    if(search) base=base.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
    if(filterEstado) base=base.filter(r=>r.estado===filterEstado);
    return base;
  },[activeTab,allData,solicitudes,cotizaciones,pedidos,search,filterEstado]);

  async function handleBulkChangeEstado(newEstado:string){
    if(!selectedIds.size) return;
    for(const idStr of Array.from(selectedIds)){
      const [tipo,id]=idStr.split('|');
      const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
      await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado:newEstado})}).catch(()=>{});
    }
    setToast({msg:'Estados actualizados',type:'ok'}); setSelectedIds(new Set()); loadData();
  }
  async function handleBulkDelete(){
    if(!selectedIds.size||!confirm('Cancelar seleccionados?')) return;
    for(const idStr of Array.from(selectedIds)){
      const [tipo,id]=idStr.split('|');
      const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
      const estado=tipo==='SC'?'CANCELADA':tipo==='COT'?'RECHAZADA':'CANCELADO';
      await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado})}).catch(()=>{});
    }
    setToast({msg:'Cancelados',type:'ok'}); setSelectedIds(new Set()); loadData();
  }
  async function handleAskAI(){
    if(!aiQuestion.trim()) return;
    setAiLoading(true); setAiResponse('');
    try{const res=await apiFetch('/ventas/ai-chat',{method:'POST',body:JSON.stringify({question:aiQuestion,context:{stats:analytics}})});setAiResponse(res.response||'Asistente IA en configuracion.');}
    catch{setAiResponse('Asistente IA en configuracion. Intenta mas tarde.');}
    setAiLoading(false);
  }
  async function openVenDetail(id:string){
    setSelectedVenId(id); setVenDetail(null);
    try{const d=await apiFetch(`/ventas/pedidos/${id}`);setVenDetail(d);}
    catch(err:any){setToast({msg:err.message,type:'error'});}
  }
  const getKanbanCol=(item:any)=>{
    const e=item.estado||'';
    if(['CANCELADO','CANCELADA','RECHAZADA'].includes(e)) return 'Cancelado';
    if(['ENTREGADO','FACTURADO','CONFIRMADA','ENVIADA'].includes(e)) return 'Completado';
    if(['EN_PROCESO','LISTO_ENTREGA'].includes(e)) return 'En Proceso';
    return 'Pendiente';
  };
  const handleDragStart=(e:React.DragEvent,idStr:string)=>e.dataTransfer.setData('idStr',idStr);
  const handleDrop=async(e:React.DragEvent,col:string)=>{
    const idStr=e.dataTransfer.getData('idStr'); if(!idStr) return;
    const [tipo,id]=idStr.split('|');
    const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
    const m:Record<string,Record<string,string>>={
      'Pendiente':{SC:'BORRADOR',COT:'PENDIENTE_CONFIRMACION',VEN:'PENDIENTE_COMPRA'},
      'En Proceso':{SC:'PENDIENTE_CONFIRMACION',COT:'ENVIADA',VEN:'EN_PROCESO'},
      'Completado':{SC:'CONFIRMADA',COT:'CONFIRMADA',VEN:'ENTREGADO'},
      'Cancelado':{SC:'CANCELADA',COT:'RECHAZADA',VEN:'CANCELADO'},
    };
    await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado:(m[col]||{})[tipo]||col})}).catch(()=>{});
    loadData();
  };

  /* KPIs para la vista principal */
  const kpiCards = [
    { label:'Solicitudes Activas', value:solicitudes.filter(s=>!['CONFIRMADA','CANCELADA'].includes(s.estado)).length, color:'indigo', icon:<FileText size={22}/>, sub:scAtrasadas.length>0?`${scAtrasadas.length} sin atender`:'Todas atendidas', ok:scAtrasadas.length===0 },
    { label:'Cotizaciones Activas', value:cotizaciones.filter(c=>!['CONFIRMADA','RECHAZADA'].includes(c.estado)).length, color:'amber', icon:<Package size={22}/>, sub:cotAtrasadas.length>0?`${cotAtrasadas.length} sin atender`:'Todas atendidas', ok:cotAtrasadas.length===0 },
    { label:'Pedidos en Proceso', value:pedidos.filter(p=>!['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)).length, color:'emerald', icon:<ShoppingBag size={22}/>, sub:venAtrasadas.length>0?`${venAtrasadas.length} sin atender`:'Al dia', ok:venAtrasadas.length===0 },
    { label:'Facturado (Total)', value:fCOP(pedidos.filter(p=>p.estado==='FACTURADO').reduce((s:number,p:any)=>s+(p.total_cop||p.total||0),0)), color:'purple', icon:<BarChart3 size={22}/>, sub:`${pedidos.filter(p=>p.estado==='FACTURADO').length} pedidos facturados`, ok:true },
  ];

  const colorMap:Record<string,{bg:string,text:string,border:string,iconBg:string}> = {
    indigo:{bg:'bg-indigo-50',text:'text-indigo-700',border:'border-indigo-200',iconBg:'bg-indigo-100'},
    amber: {bg:'bg-amber-50', text:'text-amber-700', border:'border-amber-200', iconBg:'bg-amber-100'},
    emerald:{bg:'bg-emerald-50',text:'text-emerald-700',border:'border-emerald-200',iconBg:'bg-emerald-100'},
    purple:{bg:'bg-purple-50',text:'text-purple-700',border:'border-purple-200',iconBg:'bg-purple-100'},
  };

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {actRow && <ActivitiesPanel row={actRow} onClose={()=>setActRow(null)}/>}
      {showConfig && <ConfigPanel alertDias={alertDias} onSave={cfg=>{setAlertDias(cfg);setShowConfig(false);loadData();}} onClose={()=>setShowConfig(false)}/>}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto">
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0">VENTAS:</span>
        {SUB_MODULES.map(m=>(
          <Link key={m.name} href={m.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${pathname===m.path?'bg-indigo-600 text-white border-indigo-600':'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent'}`}>
            {m.name}
          </Link>
        ))}
      </div>

      {/* ALERT BANNER */}
      {totalAtrasadas > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-center gap-3">
          <ShieldAlert className="text-red-600 shrink-0" size={18}/>
          <div className="flex-1 flex flex-wrap gap-2 text-xs font-bold text-red-700">
            {scAtrasadas.length>0  && <span className="bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">{scAtrasadas.length} SC sin atender (+{scAlertDias} dias)</span>}
            {cotAtrasadas.length>0 && <span className="bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">{cotAtrasadas.length} COT sin atender (+{cotAlertDias} dias)</span>}
            {venAtrasadas.length>0 && <span className="bg-red-100 border border-red-200 px-2.5 py-1 rounded-full">{venAtrasadas.length} PVEN sin atender (+{venAlertDias} dias)</span>}
          </div>
          <button onClick={()=>setShowConfig(true)} className="shrink-0 text-xs text-red-600 hover:text-red-800 font-bold border border-red-300 px-2.5 py-1 rounded-lg">Configurar</button>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER ROW */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-600 text-white p-3 rounded-2xl shadow-lg">
              <BarChart3 size={28}/>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Hub de Ventas</h1>
              <p className="text-sm text-gray-500 mt-0.5">Pipeline: SC-YYYY#### → COT-YYYY#### → PVEN-YYYY####</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={loadData}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm transition-colors">
              <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <button onClick={()=>setShowConfig(true)}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 font-semibold text-sm shadow-sm transition-colors">
              <Settings size={14}/> Configuracion
            </button>
            {totalAtrasadas>0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-red-50 border border-red-200 rounded-xl text-sm font-bold text-red-700">
                <Bell size={14}/>{totalAtrasadas} alertas
              </div>
            )}
          </div>
        </div>

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map((k,i)=>{
              const c=colorMap[k.color]||colorMap.indigo;
              return (
                <div key={i} className={`bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all ${k.ok?'border-gray-200':'border-red-200'}`}>
                  <div className={`inline-flex p-2.5 rounded-xl mb-3 ${c.iconBg} ${c.text}`}>{k.icon}</div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-3xl font-black text-gray-900 mb-1">{k.value}</p>
                  <p className={`text-xs font-semibold flex items-center gap-1 ${k.ok?'text-emerald-600':'text-red-500'}`}>
                    {k.ok?<CheckCircle2 size={11}/>:<AlertCircle size={11}/>}{k.sub}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TABS ROW */}
        <div className="flex items-center justify-between bg-white rounded-2xl border border-gray-200 px-4 py-3 shadow-sm">
          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            {['Todos','SC','Cotizaciones','Pedidos de Venta','Analisis'].map(tab=>(
              <button key={tab} onClick={()=>{setActiveTab(tab);setSelectedIds(new Set());}}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${activeTab===tab?'bg-indigo-600 text-white shadow':'text-gray-600 hover:bg-white hover:shadow-sm'}`}>
                {tab}
                {tab!=='Analisis'&&tab!=='Todos'&&(
                  <span className={`ml-1.5 text-xs px-1.5 py-0.5 rounded-full font-black ${activeTab===tab?'bg-indigo-500 text-white':'bg-gray-200 text-gray-600'}`}>
                    {tab==='SC'?solicitudes.length:tab==='Cotizaciones'?cotizaciones.length:pedidos.length}
                  </span>
                )}
              </button>
            ))}
          </div>
          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-2">
              {/* View toggle */}
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button onClick={()=>setViewMode('lista')} className={`p-2 rounded-lg transition-colors ${viewMode==='lista'?'bg-white shadow text-indigo-700':'text-gray-500 hover:bg-white/50'}`} title="Lista"><List size={16}/></button>
                <button onClick={()=>setViewMode('kanban')} className={`p-2 rounded-lg transition-colors ${viewMode==='kanban'?'bg-white shadow text-indigo-700':'text-gray-500 hover:bg-white/50'}`} title="Kanban"><LayoutGrid size={16}/></button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER ROW (only for list views) */}
        {activeTab !== 'Analisis' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm gap-2 flex-1 max-w-[500px]">
              <Search size={15} className="text-gray-400 shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por numero, cliente, asesor..."
                className="text-sm outline-none flex-1 bg-transparent text-gray-700 placeholder-gray-400"/>
              {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-gray-400 hover:text-gray-600"/></button>}
            </div>
            <div className="relative">
              <button onClick={()=>setShowFilters(f=>!f)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-sm bg-white transition-colors ${filterEstado?'border-indigo-400 text-indigo-700 bg-indigo-50':'border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
                <Filter size={14}/> Filtrar Estado
                {filterEstado&&<span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters&&(
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-gray-400 uppercase mb-2">Por Estado</p>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none mb-3 focus:ring-2 focus:ring-indigo-200">
                    <option value="">Todos los estados</option>
                    {['BORRADOR','PENDIENTE_CONFIRMACION','CONFIRMADA','ENVIADA','EN_PROCESO','PENDIENTE_COMPRA','LISTO_ENTREGA','ENTREGADO','FACTURADO','CANCELADO','RECHAZADA'].map(s=>(
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-red-500 hover:text-red-700 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-400 font-medium ml-1">{filteredData.length} registros{search?` para "${search}"`:''}  </p>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"/>
              <p className="text-sm text-gray-400 font-medium">Cargando datos...</p>
            </div>
          </div>

        /* ── ANALYTICS TAB ── */
        ) : activeTab === 'Analisis' ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-black text-gray-400 uppercase mr-1">Periodo:</span>
              {[{k:'7d',l:'Ultimos 7 dias'},{k:'30d',l:'Ultimo mes'},{k:'90d',l:'Trimestre'},{k:'180d',l:'Semestre'},{k:'1y',l:'Ultimo Ano'}].map(({k,l})=>(
                <button key={k} onClick={()=>setAnalyticsRange(k)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold ${analyticsRange===k?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}>{l}</button>
              ))}
              <div className="h-6 w-px bg-gray-200 mx-1"/>
              <input type="text" placeholder="Filtrar producto..." value={analyticsProduct} onChange={e=>setAnalyticsProduct(e.target.value)}
                className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/>
              <select value={analyticsTopN} onChange={e=>setAnalyticsTopN(e.target.value)} className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm outline-none">
                <option value="5">Top 5</option><option value="10">Top 10</option><option value="25">Top 25</option>
              </select>
              <button onClick={loadAnalytics} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ml-auto">
                <RefreshCw size={13}/> Analizar
              </button>
            </div>
            <div className="grid grid-cols-4 gap-4">
              {[{label:'Total Ventas COP',value:fCOP(analytics?.total_ventas||0)},{label:'Ticket Promedio',value:fCOP(analytics?.ticket_promedio||0)},{label:'Conversion SC-COT',value:`${analytics?.conv_sc_cot||0}%`},{label:'Conversion COT-VEN',value:`${analytics?.conv_cot_ven||0}%`}].map((k,i)=>(
                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-gray-400 text-xs font-bold uppercase mb-2">{k.label}</p>
                  <p className="text-2xl font-black text-gray-900">{k.value}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-indigo-600"/> Ventas por Dia</h3>
                <div className="flex flex-col gap-2 h-64 overflow-y-auto">
                  {(analytics?.ventas_por_dia||[]).map((d:any,i:number)=>{
                    const max=Math.max(...(analytics?.ventas_por_dia||[]).map((x:any)=>x.total),1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-20 text-xs text-gray-500 shrink-0">{d.fecha}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-indigo-500 h-full rounded-full" style={{width:`${(d.total/max)*100}%`}}/>
                        </div>
                        <div className="w-24 text-right text-xs font-bold text-gray-700">{fCOP(d.total)}</div>
                      </div>
                    );
                  })}
                  {!(analytics?.ventas_por_dia?.length)&&<p className="text-gray-400 text-sm text-center py-8">Sin datos. Presiona Analizar.</p>}
                </div>
              </div>
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-3">Top Clientes</h3>
                <div className="flex gap-2 mb-3">
                  <span className="text-xs bg-amber-50 border border-amber-200 text-amber-700 px-2 py-1 rounded-full font-bold">&gt;$500k: {(analytics?.top_clientes||[]).filter((c:any)=>c.total>=500000).length}</span>
                  <span className="text-xs bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-1 rounded-full font-bold">&gt;$1M: {(analytics?.top_clientes||[]).filter((c:any)=>c.total>=1000000).length}</span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-400 font-black uppercase"><th className="pb-2">#</th><th>Nombre</th><th className="text-right">Total</th><th className="text-right">Seg.</th></tr></thead>
                  <tbody>
                    {(analytics?.top_clientes||[]).map((c:any,i:number)=>(
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 font-bold">{i+1}</td>
                        <td className="py-2 font-medium">{c.nombre}</td>
                        <td className="py-2 text-right font-bold">{fCOP(c.total)}</td>
                        <td className="py-2 text-right">{c.total>=1000000?<span className="text-xs bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-bold">&gt;1M</span>:c.total>=500000?<span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded font-bold">&gt;500k</span>:null}</td>
                      </tr>
                    ))}
                    {!(analytics?.top_clientes?.length)&&<tr><td colSpan={4} className="text-center py-6 text-gray-400 text-xs">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><MessageSquare size={18} className="text-indigo-600"/> AI Sales Assistant</h3>
              <div className="flex gap-2 mb-4">
                <input value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskAI()}
                  placeholder="Ej: Cual fue el cliente que mas compro? Que productos vendemos mas?"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/>
                <button onClick={handleAskAI} disabled={aiLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50 transition-colors">
                  {aiLoading?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>} Preguntar
                </button>
              </div>
              {aiLoading&&<div className="text-gray-400 animate-pulse text-sm">Analizando...</div>}
              {aiResponse&&<div className="bg-indigo-50 border border-indigo-100 p-4 rounded-xl text-gray-700 text-sm whitespace-pre-wrap">{aiResponse}</div>}
            </div>
          </div>

        /* ── LISTA ── */
        ) : viewMode === 'lista' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-5 py-3.5 w-10">
                    <input type="checkbox" className="rounded border-gray-300"
                      onChange={e=>{if(e.target.checked)setSelectedIds(new Set(filteredData.map((d:any)=>`${d.tipo}|${d.id}`)));else setSelectedIds(new Set());}}
                      checked={selectedIds.size===filteredData.length&&filteredData.length>0}/>
                  </th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Tipo</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Numero</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Cliente</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Asesor</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Fecha</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Estado</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide text-right">Monto</th>
                  <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide text-center">Actividad</th>
                  <th className="px-4 py-3.5 w-10"/>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredData.length===0&&(
                  <tr><td colSpan={10} className="text-center py-16 text-gray-400">
                    <Activity size={32} className="mx-auto mb-3 opacity-30"/>
                    <p className="font-medium">{search?`Sin resultados para "${search}"`:loading?'Cargando...':'Sin registros'}</p>
                  </td></tr>
                )}
                {filteredData.map((row:any,idx:number)=>{
                  const idStr=`${row.tipo}|${row.id}`;
                  const isAtrasada=(row.tipo==='SC'&&scAtrasadas.some((x:any)=>x.id===row.id))||(row.tipo==='COT'&&cotAtrasadas.some((x:any)=>x.id===row.id))||(row.tipo==='VEN'&&venAtrasadas.some((x:any)=>x.id===row.id));
                  return (
                    <tr key={idx}
                      className={`hover:bg-indigo-50/30 cursor-pointer group transition-colors ${isAtrasada?'border-l-4 border-l-red-400 bg-red-50/20':''}`}
                      onClick={e=>{
                        if((e.target as any).closest('input')||(e.target as any).closest('button')) return;
                        if(row.tipo==='SC')  router.push(`/dashboard/ventas/solicitud?id=${row.id}`);
                        if(row.tipo==='COT') router.push(`/dashboard/ventas/cotizacion?id=${row.id}`);
                        if(row.tipo==='VEN') router.push(`/dashboard/ventas/venta?id=${row.id}`);
                      }}>
                      <td className="px-5 py-3.5">
                        <input type="checkbox" className="rounded border-gray-300" checked={selectedIds.has(idStr)}
                          onChange={e=>{const n=new Set(selectedIds);if(e.target.checked)n.add(idStr);else n.delete(idStr);setSelectedIds(n);}}/>
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
                          {isAtrasada&&<AlertCircle size={12} className="text-red-500"/>}
                        </div>
                      </td>
                      <td className="px-4 py-3.5 font-bold text-gray-900">{row.numero}</td>
                      <td className="px-4 py-3.5 text-gray-700">{row.customer_name||row.cliente?.nombre||'-'}</td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs">{row.advisor_name||row.asesor?.nombre||'-'}</td>
                      <td className="px-4 py-3.5 text-gray-400 text-xs">{fDate(row.created_at||row.fecha)}</td>
                      <td className="px-4 py-3.5"><span className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${getEstadoClass(row.estado)}`}>{row.estado}</span></td>
                      <td className="px-4 py-3.5 text-right font-bold text-gray-900">{fCOP(row.total_cop||row.total||row.monto||0)}</td>
                      <td className="px-4 py-3.5 text-center">
                        <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                          className="opacity-0 group-hover:opacity-100 transition-all flex items-center gap-1.5 mx-auto px-3 py-1 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-bold">
                          <Activity size={11}/> Ver
                        </button>
                      </td>
                      <td className="px-4 py-3.5 relative group/m">
                        <button className="text-gray-300 hover:text-gray-600 group-hover:text-gray-400 transition-colors"><MoreHorizontal size={18}/></button>
                        <div className="absolute right-10 top-2 bg-white shadow-2xl rounded-2xl border border-gray-100 py-2 w-52 invisible group-hover/m:visible z-20">
                          <button className="w-full text-left px-4 py-2 hover:bg-indigo-50 text-sm font-medium flex items-center gap-2 text-indigo-700" onClick={e=>{e.stopPropagation();setActRow(row);}}>
                            <Activity size={13}/> Ver Actividad
                          </button>
                          <button className="w-full text-left px-4 py-2 hover:bg-gray-50 text-sm font-medium" onClick={e=>{e.stopPropagation();if(row.tipo==='VEN')openVenDetail(row.id);}}>
                            Ver Detalle
                          </button>
                          <div className="border-t border-gray-100 my-1"/>
                          <button className="w-full text-left px-4 py-2 hover:bg-red-50 text-sm font-medium text-red-600" onClick={e=>{e.stopPropagation();setSelectedIds(new Set([idStr]));handleBulkDelete();}}>
                            Cancelar / Eliminar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 font-medium flex items-center justify-between">
              <span>{filteredData.length} de {allData.length} registros</span>
              {selectedIds.size>0&&<span className="text-indigo-600 font-bold">{selectedIds.size} seleccionados</span>}
            </div>
          </div>

        /* ── KANBAN ── */
        ) : (
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {['Pendiente','En Proceso','Completado','Cancelado'].map(col=>(
              <div key={col} className="w-80 flex-shrink-0 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm"
                onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e,col)}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-black text-gray-700">{col}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{filteredData.filter(d=>getKanbanCol(d)===col).length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-[200px]">
                  {filteredData.filter(d=>getKanbanCol(d)===col).map((row:any,i:number)=>{
                    const isAtrasada=(row.tipo==='SC'&&scAtrasadas.some((x:any)=>x.id===row.id))||(row.tipo==='COT'&&cotAtrasadas.some((x:any)=>x.id===row.id))||(row.tipo==='VEN'&&venAtrasadas.some((x:any)=>x.id===row.id));
                    return (
                      <div key={i} draggable onDragStart={e=>handleDragStart(e,`${row.tipo}|${row.id}`)} onClick={()=>{if(row.tipo==='VEN')openVenDetail(row.id);}}
                        className={`bg-white p-4 rounded-xl shadow-sm border cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors group ${isAtrasada?'border-red-300 bg-red-50/30':'border-gray-200'}`}>
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="font-bold text-gray-900 text-sm">{row.numero}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
                        </div>
                        <p className="text-xs text-gray-500 mb-2 truncate">{row.customer_name||row.cliente?.nombre||'Cliente'}</p>
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="font-bold text-xs text-indigo-700">{fCOP(row.total_cop||row.total||0)}</span>
                          <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-lg text-xs font-bold border border-indigo-200">
                            <Activity size={11}/> Act.
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter(d=>getKanbanCol(d)===col).length===0&&<p className="text-center text-xs text-gray-300 font-medium py-8">Arrastra aqui</p>}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size>0&&(
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-gray-700">
            <span className="font-bold text-sm bg-gray-800 px-3 py-1 rounded-full">{selectedIds.size} seleccionados</span>
            <select onChange={e=>handleBulkChangeEstado(e.target.value)} defaultValue=""
              className="bg-gray-800 border border-gray-600 text-white text-sm rounded-xl px-3 py-1.5 outline-none">
              <option value="" disabled>Cambiar Estado...</option>
              <option value="EN_PROCESO">En Proceso</option>
              <option value="LISTO_ENTREGA">Listo Entrega</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="FACTURADO">Facturado</option>
            </select>
            <button onClick={handleBulkDelete} className="bg-red-500/20 text-red-400 hover:bg-red-500/40 p-2 rounded-xl transition-colors"><Trash2 size={16}/></button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-2 text-gray-400 hover:text-white"><X size={16}/></button>
          </div>
        )}

        {/* VEN quick detail panel */}
        {selectedVenId&&(
          <>
            <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={()=>setSelectedVenId(null)}/>
            <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left:'240px'}}>
              <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-gray-50">
                <h2 className="text-xl font-black flex items-center gap-3">
                  {venDetail?.numero||`PVEN-${selectedVenId}`}
                  {venDetail&&<span className={`px-3 py-1 rounded-full text-xs font-medium border ${getEstadoClass(venDetail.estado)}`}>{venDetail.estado}</span>}
                </h2>
                <button onClick={()=>setSelectedVenId(null)} className="p-2 hover:bg-gray-200 rounded-xl text-gray-500"><X size={22}/></button>
              </div>
              {!venDetail?(
                <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>
              ):(
                <div className="flex-1 flex overflow-hidden">
                  <div className="w-[45%] border-r border-gray-100 bg-gray-50/50 p-7 overflow-y-auto space-y-4">
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <p className="text-xs font-black text-gray-400 uppercase mb-2">Cliente</p>
                      <p className="font-bold text-lg">{venDetail.customer_name||'-'}</p>
                      <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                        <div><span className="text-xs text-gray-400 block mb-0.5">Entrega Estimada</span><span className="font-medium">{fDate(venDetail.fecha_entrega_estimada)}</span></div>
                        <div><span className="text-xs text-gray-400 block mb-0.5">COT Origen</span><span className="font-medium text-indigo-600">{venDetail.cot_numero||'-'}</span></div>
                      </div>
                    </div>
                    <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
                      <p className="text-xs font-black text-gray-400 uppercase mb-3">Montos</p>
                      {[['Total COP',venDetail.total_cop||venDetail.total],['Anticipo',venDetail.anticipo_cop||venDetail.anticipo],['Saldo',(venDetail.saldo_cop||(venDetail.total_cop-(venDetail.anticipo_cop||0)))]].map(([label,val]:any,i:number)=>(
                        <div key={i} className="flex justify-between py-2 border-b last:border-0">
                          <span className="text-gray-500 text-sm">{label}</span>
                          <span className={`font-bold text-sm ${label==='Anticipo'?'text-emerald-600':label==='Saldo'?'text-red-600':''}`}>{fCOP(val)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="w-[55%] p-7 overflow-y-auto bg-white">
                    <p className="text-xs font-black text-gray-400 uppercase mb-3">Cambiar Estado</p>
                    <div className="flex flex-wrap gap-2 mb-6 p-4 bg-gray-50 rounded-2xl">
                      {['PENDIENTE_COMPRA','EN_PROCESO','LISTO_ENTREGA','ENTREGADO','FACTURADO','CANCELADO'].map(est=>(
                        <button key={est} onClick={async()=>{try{await apiFetch(`/ventas/pedidos/${venDetail.id}`,{method:'PATCH',body:JSON.stringify({estado:est})});openVenDetail(venDetail.id);loadData();}catch(e:any){setToast({msg:e.message,type:'error'});}}}
                          className={`px-3 py-2 rounded-xl text-xs font-bold border transition-colors ${venDetail.estado===est?'bg-indigo-600 text-white border-indigo-600 shadow':'bg-white text-gray-600 hover:bg-gray-100 border-gray-200'}`}>{est}</button>
                      ))}
                    </div>
                    <p className="text-xs font-black text-gray-400 uppercase mb-3">Historial</p>
                    <div className="relative border-l-2 border-gray-100 ml-4 pl-6 pb-4">
                      {(venDetail.actividades||[{created_at:venDetail.created_at,action:'CREATED',description:'Pedido de venta creado'}]).map((a:any,i:number)=>(
                        <div key={i} className="mb-5 relative">
                          <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-indigo-200"/>
                          <p className="text-xs text-gray-400 mb-0.5">{fDate(a.created_at)}</p>
                          <p className="font-bold text-gray-700 text-sm">{a.description||a.action}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
