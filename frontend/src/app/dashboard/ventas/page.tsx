'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal, MessageCircle, MessageSquare, Trash2, X,
  List, Send, RefreshCw, Search, Bell, Settings, Activity,
  Filter, LayoutGrid, Clock, CheckCircle2, AlertCircle, Zap,
  ToggleLeft, ToggleRight, Save, TrendingUp, ShieldAlert,
  ShoppingBag, FileText, Package, BarChart3, ChevronRight,
  ArrowRight, Phone, Check, AlertTriangle, HelpCircle,
  DollarSign, ExternalLink, Calendar, Plus
} from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { apiFetch, API_URL } from '@/lib/api';

const SUB_MODULES = [
  { name: 'Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
  { name: 'Cotización',           path: '/dashboard/ventas/cotizacion' },
  { name: 'Pedido de Venta',      path: '/dashboard/ventas/venta' },
  { name: 'Exportar Día',         path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango',       path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronización DB',    path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',         path: '/dashboard/ventas/proyecciones' },
];

const fCOP  = (v: any) => { const n = Number(v)||0; return n > 0 ? '$' + n.toLocaleString('es-CO') : '$' + 0; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
const daysDiff = (iso: any) => iso ? Math.floor((Date.now()-new Date(iso).getTime())/86400000) : 0;

// Estados de no resolución (requieren acción o están en espera de gestión)
const ESTADOS_NO_RESOLUCION = [
  'BORRADOR',
  'PENDIENTE_CONFIRMACION',
  'EN_GESTION',
  'ENVIADA',
  'PENDIENTE_COMPRA',
  'PENDIENTE_PAGO',
  'EN_PROCESO',
  'EN_TRANSITO',
];

// Estados resueltos o con acciones tomadas completadas
const ESTADOS_ACCION_TOMADA = [
  'CONFIRMADA',
  'LISTO_ENTREGA',
  'ENTREGADO',
  'FACTURADO',
  'CANCELADO',
  'CANCELADA',
  'RECHAZADA',
];

const getEstadoClass = (e: string) => ({
  BORRADOR: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDIENTE_CONFIRMACION: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_GESTION: 'bg-blue-100 text-blue-800 border-blue-200',
  CONFIRMADA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ENVIADA: 'bg-sky-100 text-sky-700 border-sky-200',
  PENDIENTE_COMPRA: 'bg-orange-100 text-orange-700 border-orange-200',
  PENDIENTE_PAGO: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_PROCESO: 'bg-purple-100 text-purple-700 border-purple-200',
  EN_TRANSITO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  LISTO_ENTREGA: 'bg-teal-100 text-teal-700 border-teal-200',
  ENTREGADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FACTURADO: 'bg-green-100 text-green-800 border-green-200',
  CANCELADO: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELADA: 'bg-rose-100 text-rose-700 border-rose-200',
  RECHAZADA: 'bg-rose-100 text-rose-700 border-rose-200',
} as Record<string,string>)[e] || 'bg-gray-100 text-gray-700 border-gray-200';

const getTipoClass = (t: string) => ({
  SC: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  COT: 'bg-amber-100 text-amber-800 border-amber-200',
  VEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
} as Record<string,string>)[t] || 'bg-gray-100 text-gray-700';

const getTipoLabel = (t: string) => ({
  SC: 'Solicitud',
  COT: 'Cotización',
  VEN: 'Pedido Venta',
} as Record<string,string>)[t] || t;

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
        setDetail(d?.data || d);
      } catch{}
      setLoading(false);
    })();
  },[row.id,row.tipo]);
  const acts = detail?.actividades||[];
  const chatter=acts.filter((a:any)=>a.action==='CHATTER');
  const hist=acts.filter((a:any)=>a.action!=='CHATTER');
  return (
    <>
      <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40" onClick={onClose}/>
      <div className="fixed top-0 right-0 bottom-0 z-50 bg-white shadow-2xl flex flex-col w-[480px] border-l border-slate-200">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
          <div>
            <div className="flex items-center gap-2">
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
              <span className="font-bold text-slate-800">{row.numero}</span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">{row.customer_name||row.cliente?.nombre||'Cliente Nebulae'}</p>
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
                      <p className="text-xs text-green-600 mt-1">{a.user_name || 'Asesor'} - {fDate(a.created_at)}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-1"><Activity size={12}/> Historial de Acciones Tomadas</p>
              {hist.length===0?<p className="text-xs text-slate-400 italic">Sin actividad registrada</p>:(
                <div className="space-y-3 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                  {[...hist].reverse().map((a:any,i:number)=>(
                    <div key={i} className="flex gap-3 pl-7 relative">
                      <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white"
                        style={{backgroundColor:({CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',SENT:'#10b981',CONFIRMED:'#059669',REJECTED:'#ef4444',UPDATED:'#3b82f6'}as any)[a.action]||'#94a3b8'}}/>
                      <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
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
            <div><h2 className="font-black text-slate-800 text-lg">Configuración de HUB Ventas</h2><p className="text-xs text-slate-500">Parámetros de resolución, alertas y automatizaciones</p></div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><Bell size={16} className="text-amber-600"/><h3 className="font-black text-amber-800 text-sm uppercase tracking-wide">Alertas de No Resolución</h3></div>
            <p className="text-xs text-amber-700 mb-4">Si una solicitud, cotización o pedido pasa más de X días sin cambio de estado o acción tomada, se marcará en color rojo de alerta.</p>
            <div className="space-y-3">
              {[{k:'alerta_sc_dias',label:'Solicitudes de Cliente (SC)'},{k:'alerta_cot_dias',label:'Cotizaciones (COT)'},{k:'alerta_ven_dias',label:'Pedidos de Venta (PVEN)'}].map(({k,label})=>(
                <div key={k} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="30" value={(cfg as any)[k]} onChange={e=>setCfg(p=>({...p,[k]:e.target.value}))}
                      className="w-16 border border-slate-200 rounded-lg text-center text-sm font-bold py-1 focus:ring-2 focus:ring-amber-200 outline-none"/>
                    <span className="text-xs text-slate-500 font-medium">días</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-indigo-600"/><h3 className="font-black text-indigo-800 text-sm uppercase tracking-wide">Automatizaciones Comerciales</h3></div>
            <div className="space-y-3">
              <Toggle k="auto_lead_crm" label="Auto-crear Lead en CRM" desc="Al ingresar una solicitud de cliente, sincroniza automáticamente el prospecto al CRM."/>
              <Toggle k="auto_chatter_ia" label="Chatter asistido por IA" desc="Sugiere respuestas en el Chatter basadas en el catálogo y compras del cliente."/>
              <Toggle k="notif_whatsapp" label="Notificación WhatsApp automática" desc="Al pasar el pedido a LISTO ENTREGA, avisa al cliente con su número de orden."/>
            </div>
          </div>
        </div>
        <div className="p-5 border-t border-slate-100 bg-white">
          <button onClick={save} disabled={saving}
            className={`w-full py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors ${saved?'bg-emerald-500 text-white':'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
            {saving?<RefreshCw size={16} className="animate-spin"/>:saved?<CheckCircle2 size={16}/>:<Save size={16}/>}
            {saved?'¡Configuración Guardada!':'Guardar Configuración'}
          </button>
        </div>
      </div>
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT: HUB VENTAS
   ════════════════════════════════════════════════════════════ */
export default function VentasHub() {
  const pathname = usePathname();
  const router = useRouter();
  const [activeTab, setActiveTab]       = useState('Todos');
  const [viewMode, setViewMode]         = useState<'lista'|'kanban'>('lista');
  const [loading, setLoading]           = useState(true);
  const [toast, setToast]               = useState<{msg:string,type:'ok'|'error'}|null>(null);
  const [search, setSearch]             = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [quickFilter, setQuickFilter]   = useState<'todos'|'no_resueltos'|'atrasados'|'acciones_tomadas'>('todos');

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
  const [quickDetailDoc, setQuickDetailDoc] = useState<any>(null);
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
      const scL  = (Array.isArray(sc) ? sc : (sc?.data || sc?.items || [])).map((x:any)=>({...x,tipo:'SC'}));
      const cotL = (Array.isArray(cot) ? cot : (cot?.data || cot?.items || [])).map((x:any)=>({...x,tipo:'COT'}));
      const venL = (Array.isArray(ven) ? ven : (ven?.data || ven?.items || [])).map((x:any)=>({...x,tipo:'VEN'}));
      setSolicitudes(scL); setCotizaciones(cotL); setPedidos(venL);
      setAllData([...scL,...cotL,...venL].sort((a,b)=>new Date(b.created_at||0).getTime()-new Date(a.created_at||0).getTime()));
      if(cfg && typeof cfg === 'object') setAlertDias(cfg?.data || cfg);
    } catch(err:any){setToast({msg:err.message,type:'error'});}
    finally{setLoading(false);}
  },[]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{if(activeTab==='Analisis')loadAnalytics();},[activeTab,analyticsRange,analyticsTopN]);

  async function loadAnalytics(){
    try{
      const res = await apiFetch(`/ventas/analytics?range=${analyticsRange}&top_n=${analyticsTopN}`);
      setAnalytics(res?.data || res);
    }
    catch(err:any){setToast({msg:err.message||'Error al cargar analítica',type:'error'});}
  }

  const scAlertDias  = Number(alertDias?.alerta_sc_dias?.value  || alertDias?.alerta_sc_dias  || 2);
  const cotAlertDias = Number(alertDias?.alerta_cot_dias?.value || alertDias?.alerta_cot_dias || 2);
  const venAlertDias = Number(alertDias?.alerta_ven_dias?.value || alertDias?.alerta_ven_dias || 2);

  // Clasificación de estados de no resolución vs resueltos
  const isDocNoResolucion = useCallback((item: any) => {
    return ESTADOS_NO_RESOLUCION.includes(item.estado);
  }, []);

  const isDocAtrasado = useCallback((item: any) => {
    const dLimit = item.tipo === 'SC' ? scAlertDias : item.tipo === 'COT' ? cotAlertDias : venAlertDias;
    return isDocNoResolucion(item) && daysDiff(item.updated_at || item.created_at) >= dLimit;
  }, [scAlertDias, cotAlertDias, venAlertDias, isDocNoResolucion]);

  const noResueltosList = useMemo(() => allData.filter(isDocNoResolucion), [allData, isDocNoResolucion]);
  const atrasadosList   = useMemo(() => allData.filter(isDocAtrasado), [allData, isDocAtrasado]);
  const accionesTomadasList = useMemo(() => allData.filter(d => ESTADOS_ACCION_TOMADA.includes(d.estado)), [allData]);

  const scAtrasadas  = useMemo(() => solicitudes.filter(isDocAtrasado), [solicitudes, isDocAtrasado]);
  const cotAtrasadas = useMemo(() => cotizaciones.filter(isDocAtrasado), [cotizaciones, isDocAtrasado]);
  const venAtrasadas = useMemo(() => pedidos.filter(isDocAtrasado), [pedidos, isDocAtrasado]);
  const totalAtrasadas = atrasadosList.length;

  // Filtrado de datos según tab activo, quick filter, búsqueda y estado
  const filteredData = useMemo(()=>{
    let base: any[] = [];
    if(activeTab === 'Todos') base = allData;
    else if(activeTab === 'No_Resueltos') base = noResueltosList;
    else if(activeTab === 'SC') base = solicitudes;
    else if(activeTab === 'Cotizaciones') base = cotizaciones;
    else if(activeTab === 'Pedidos de Venta') base = pedidos;
    else if(activeTab === 'Acciones_Tomadas') base = accionesTomadasList;
    else return [];

    // Quick filter adicional
    if(quickFilter === 'no_resueltos') base = base.filter(isDocNoResolucion);
    else if(quickFilter === 'atrasados') base = base.filter(isDocAtrasado);
    else if(quickFilter === 'acciones_tomadas') base = base.filter(d => ESTADOS_ACCION_TOMADA.includes(d.estado));

    if(search) {
      const q = search.toLowerCase();
      base = base.filter(r => 
        (r.numero || '').toLowerCase().includes(q) ||
        (r.customer_name || r.cliente?.nombre || '').toLowerCase().includes(q) ||
        (r.advisor_name || r.asesor?.nombre || '').toLowerCase().includes(q) ||
        (r.estado || '').toLowerCase().includes(q)
      );
    }
    if(filterEstado) base = base.filter(r => r.estado === filterEstado);
    return base;
  },[activeTab, quickFilter, allData, noResueltosList, solicitudes, cotizaciones, pedidos, accionesTomadasList, search, filterEstado, isDocNoResolucion, isDocAtrasado]);

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
    if(!selectedIds.size||!confirm('¿Cancelar documentos seleccionados?')) return;
    for(const idStr of Array.from(selectedIds)){
      const [tipo,id]=idStr.split('|');
      const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
      const estado=tipo==='SC'?'CANCELADA':tipo==='COT'?'RECHAZADA':'CANCELADO';
      await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado})}).catch(()=>{});
    }
    setToast({msg:'Documentos cancelados',type:'ok'}); setSelectedIds(new Set()); loadData();
  }

  async function handleAskAI(){
    if(!aiQuestion.trim()) return;
    setAiLoading(true); setAiResponse('');
    try{
      const res = await apiFetch('/ventas/ai-chat',{method:'POST',body:JSON.stringify({question:aiQuestion,context:{stats:analytics, totales: {sc: solicitudes.length, cot: cotizaciones.length, ven: pedidos.length}}})});
      setAiResponse(res?.response || res?.data?.response || 'El Copilot de Ventas ha analizado el pipeline comercial de Nebulae.');
    }
    catch{
      // Fallback a respuesta contextual de Nebulae
      setAiResponse(`Para el catálogo de Nebulae Kids (cunas, corrales, ropa infantil y puericultura), se recomienda priorizar los pedidos con más de ${venAlertDias} días en estado PENDIENTE_COMPRA o EN_TRANSITO para asegurar el stock de entrega.`);
    }
    setAiLoading(false);
  }

  async function openDocDetail(row: any){
    try {
      let d: any = null;
      if(row.tipo === 'SC')  d = await apiFetch(`/ventas/solicitudes/${row.id}`);
      if(row.tipo === 'COT') d = await apiFetch(`/ventas/cotizaciones/${row.id}`);
      if(row.tipo === 'VEN') d = await apiFetch(`/ventas/pedidos/${row.id}`);
      setQuickDetailDoc({ ...row, ...(d?.data || d) });
    } catch(err:any) {
      setQuickDetailDoc(row);
    }
  }

  const getKanbanCol=(item:any)=>{
    const e=item.estado||'';
    if(['CANCELADO','CANCELADA','RECHAZADA'].includes(e)) return 'Cancelado';
    if(['ENTREGADO','FACTURADO','CONFIRMADA','LISTO_ENTREGA'].includes(e)) return 'Acción Tomada';
    if(['EN_PROCESO','ENVIADA','EN_TRANSITO'].includes(e)) return 'En Gestión';
    return 'No Resuelto';
  };

  const handleDragStart=(e:React.DragEvent,idStr:string)=>e.dataTransfer.setData('idStr',idStr);
  const handleDrop=async(e:React.DragEvent,col:string)=>{
    const idStr=e.dataTransfer.getData('idStr'); if(!idStr) return;
    const [tipo,id]=idStr.split('|');
    const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
    const m:Record<string,Record<string,string>>={
      'No Resuelto':{SC:'BORRADOR',COT:'PENDIENTE_CONFIRMACION',VEN:'PENDIENTE_COMPRA'},
      'En Gestión':{SC:'PENDIENTE_CONFIRMACION',COT:'ENVIADA',VEN:'EN_PROCESO'},
      'Acción Tomada':{SC:'CONFIRMADA',COT:'CONFIRMADA',VEN:'LISTO_ENTREGA'},
      'Cancelado':{SC:'CANCELADA',COT:'RECHAZADA',VEN:'CANCELADO'},
    };
    await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado:(m[col]||{})[tipo]||col})}).catch(()=>{});
    loadData();
  };

  // KPIs con contexto de Nebulae Kids
  const totalFacturadoCOP = useMemo(() => {
    return pedidos.filter(p => p.estado === 'FACTURADO' || p.estado === 'ENTREGADO').reduce((sum, p) => sum + Number(p.total_cop || p.total || 0), 0);
  }, [pedidos]);

  const kpiCards = [
    {
      label: 'Solicitudes Activas',
      value: solicitudes.filter(s => !['CONFIRMADA','CANCELADA'].includes(s.estado)).length,
      color: 'indigo',
      icon: <FileText size={22}/>,
      sub: scAtrasadas.length > 0 ? `${scAtrasadas.length} sin atender (+${scAlertDias}d)` : 'Todas al día',
      ok: scAtrasadas.length === 0,
      tipo: 'SC'
    },
    {
      label: 'Cotizaciones Vigentes',
      value: cotizaciones.filter(c => !['CONFIRMADA','RECHAZADA'].includes(c.estado)).length,
      color: 'amber',
      icon: <Package size={22}/>,
      sub: cotAtrasadas.length > 0 ? `${cotAtrasadas.length} sin respuesta (+${cotAlertDias}d)` : 'Flujo en tiempo',
      ok: cotAtrasadas.length === 0,
      tipo: 'COT'
    },
    {
      label: 'Pedidos en Curso (PVEN)',
      value: pedidos.filter(p => !['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)).length,
      color: 'emerald',
      icon: <ShoppingBag size={22}/>,
      sub: venAtrasadas.length > 0 ? `${venAtrasadas.length} requieren compra/pago` : 'Stock & Despacho al día',
      ok: venAtrasadas.length === 0,
      tipo: 'VEN'
    },
    {
      label: 'Ventas Facturadas (COP)',
      value: fCOP(totalFacturadoCOP),
      color: 'purple',
      icon: <BarChart3 size={22}/>,
      sub: `${pedidos.filter(p => p.estado === 'FACTURADO').length} pedidos facturados formalmente`,
      ok: true,
      tipo: 'TOTAL'
    },
  ];

  const colorMap:Record<string,{bg:string,text:string,border:string,iconBg:string}> = {
    indigo: {bg:'bg-indigo-50',  text:'text-indigo-700',  border:'border-indigo-200', iconBg:'bg-indigo-100'},
    amber:  {bg:'bg-amber-50',   text:'text-amber-800',   border:'border-amber-200',  iconBg:'bg-amber-100'},
    emerald:{bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200',iconBg:'bg-emerald-100'},
    purple: {bg:'bg-purple-50',  text:'text-purple-700',  border:'border-purple-200', iconBg:'bg-purple-100'},
  };

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {actRow && <ActivitiesPanel row={actRow} onClose={()=>setActRow(null)}/>}
      {showConfig && <ConfigPanel alertDias={alertDias} onSave={cfg=>{setAlertDias(cfg);setShowConfig(false);loadData();}} onClose={()=>setShowConfig(false)}/>}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2.5 flex items-center gap-1 sticky top-0 z-30 shadow-xs overflow-x-auto">
        <span className="text-xs font-black text-indigo-700 tracking-wider mr-3 shrink-0 flex items-center gap-1.5">
          <TrendingUp size={14}/> HUB VENTAS:
        </span>
        {SUB_MODULES.map(m=>(
          <Link key={m.name} href={m.path}
            className={`shrink-0 px-3.5 py-1.5 rounded-full text-xs font-bold border transition-colors ${pathname===m.path?'bg-indigo-600 text-white border-indigo-600 shadow-xs':'text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent'}`}>
            {m.name}
          </Link>
        ))}
      </div>

      {/* ALERT BANNER — SEMÁFORO DE RESOLUCIÓN */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl flex items-center justify-center ${totalAtrasadas > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {totalAtrasadas > 0 ? <ShieldAlert size={18}/> : <CheckCircle2 size={18}/>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">Semáforo de Resolución Comercial:</h2>
              <span className="text-xs font-medium text-slate-500">Regla de atención: máx {scAlertDias} días sin gestión</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1 text-xs">
              <span className={`px-2.5 py-0.5 rounded-full font-bold border ${atrasadosList.length > 0 ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                🔴 {atrasadosList.length} Atrasados (+{scAlertDias}d)
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                🟡 {noResueltosList.length} No Resueltos / En Espera
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                🟢 {accionesTomadasList.length} Acciones Tomadas
              </span>
            </div>
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-2">
          <button onClick={()=>setQuickFilter(quickFilter === 'atrasados' ? 'todos' : 'atrasados')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'atrasados' ? 'bg-rose-600 text-white border-rose-600 shadow-xs' : 'bg-slate-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}>
            Filtrar Atrasados ({atrasadosList.length})
          </button>
          <button onClick={()=>setQuickFilter(quickFilter === 'no_resueltos' ? 'todos' : 'no_resueltos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'no_resueltos' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-slate-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>
            No Resueltos ({noResueltosList.length})
          </button>
          <button onClick={()=>setQuickFilter('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'todos' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            Ver Todo
          </button>
          <button onClick={()=>setShowConfig(true)} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50 transition-colors">
            Ajustar Tiempos
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER ROW */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-tr from-indigo-700 to-indigo-500 text-white p-3.5 rounded-2xl shadow-md">
              <TrendingUp size={28}/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">HUB Ventas</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-indigo-50 text-indigo-700 border border-indigo-200">Nebulae Kids</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Control Unificado del Ciclo Comercial: Solicitud (SC) → Cotización (COT) → Pedido (PVEN) → Facturación y Despacho</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard/ventas/solicitud/nueva"
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all">
              <Plus size={15}/> Nueva Solicitud
            </Link>
            <button onClick={loadData}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs shadow-xs transition-colors">
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <button onClick={()=>setShowConfig(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 font-semibold text-xs shadow-xs transition-colors">
              <Settings size={13}/> Configuración
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((k,i)=>{
              const c=colorMap[k.color]||colorMap.indigo;
              return (
                <div key={i} className={`bg-white rounded-2xl p-5 border shadow-xs hover:shadow-md transition-all ${k.ok?'border-slate-200':'border-rose-200 bg-rose-50/20'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${c.iconBg} ${c.text}`}>{k.icon}</div>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${k.ok?'bg-slate-100 text-slate-600':'bg-rose-100 text-rose-700'}`}>
                      {k.tipo}
                    </span>
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">{k.value}</p>
                  <p className={`text-xs font-semibold flex items-center gap-1 ${k.ok?'text-emerald-600':'text-rose-600'}`}>
                    {k.ok?<CheckCircle2 size={12}/>:<AlertCircle size={12}/>}{k.sub}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TABS ROW */}
        <div className="flex flex-wrap items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
            {[
              { id: 'Todos',             label: 'Todos',                  count: allData.length },
              { id: 'No_Resueltos',      label: '🚨 No Resueltos',        count: noResueltosList.length, alert: atrasadosList.length > 0 },
              { id: 'SC',                label: 'Solicitudes (SC)',       count: solicitudes.length },
              { id: 'Cotizaciones',      label: 'Cotizaciones (COT)',     count: cotizaciones.length },
              { id: 'Pedidos de Venta',  label: 'Pedidos Venta (PVEN)',   count: pedidos.length },
              { id: 'Acciones_Tomadas',  label: '✅ Acciones Tomadas',    count: accionesTomadasList.length },
              { id: 'Analisis',          label: '📊 Análisis Funcional',  count: null },
            ].map(tab=>(
              <button key={tab.id} onClick={()=>{setActiveTab(tab.id);setSelectedIds(new Set());}}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab===tab.id?'bg-indigo-600 text-white shadow-xs':'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeTab===tab.id?'bg-indigo-500 text-white':tab.alert?'bg-rose-100 text-rose-700':'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                <button onClick={()=>setViewMode('lista')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='lista'?'bg-white shadow-xs text-indigo-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Lista">
                  <List size={15}/>
                </button>
                <button onClick={()=>setViewMode('kanban')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='kanban'?'bg-white shadow-xs text-indigo-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Tablero Kanban">
                  <LayoutGrid size={15}/>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER ROW (only for list views) */}
        {activeTab !== 'Analisis' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs gap-2 flex-1 min-w-[280px] max-w-[500px]">
              <Search size={15} className="text-slate-400 shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por número, cliente, asesor, estado..."
                className="text-xs outline-none flex-1 bg-transparent text-slate-800 placeholder-slate-400"/>
              {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
            </div>

            <div className="relative">
              <button onClick={()=>setShowFilters(f=>!f)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold shadow-xs bg-white transition-colors ${filterEstado?'border-indigo-400 text-indigo-700 bg-indigo-50':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Filter size={13}/> Estado Específico
                {filterEstado&&<span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters&&(
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Filtrar por Estado</p>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none mb-3 focus:ring-2 focus:ring-indigo-200 bg-white">
                    <option value="">Todos los estados</option>
                    {[...new Set([...ESTADOS_NO_RESOLUCION, ...ESTADOS_ACCION_TOMADA])].map(s=>(
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-rose-500 hover:text-rose-700 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 font-medium ml-auto">
              Mostrando <strong className="text-slate-700">{filteredData.length}</strong> documentos
            </p>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"/>
              <p className="text-xs text-slate-400 font-medium">Cargando pipeline comercial de Nebulae...</p>
            </div>
          </div>

        /* ── ANALYTICS TAB ── */
        ) : activeTab === 'Analisis' ? (
          <div className="flex flex-col gap-6">
            {/* Range and controls */}
            <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-black text-slate-400 uppercase mr-2 flex items-center gap-1"><Calendar size={13}/> Periodo:</span>
              {[
                {k:'7d',l:'Últimos 7 días'},
                {k:'30d',l:'Último mes (30d)'},
                {k:'90d',l:'Trimestre (90d)'},
                {k:'180d',l:'Semestre'},
                {k:'1y',l:'Año Completo'}
              ].map(({k,l})=>(
                <button key={k} onClick={()=>setAnalyticsRange(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${analyticsRange===k?'bg-indigo-600 text-white shadow-xs':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
              ))}
              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"/>
              <input type="text" placeholder="Filtrar por producto (ej. Cuna, Coche)..." value={analyticsProduct} onChange={e=>setAnalyticsProduct(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200 bg-white"/>
              <select value={analyticsTopN} onChange={e=>setAnalyticsTopN(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none bg-white">
                <option value="5">Top 5 Clientes</option>
                <option value="10">Top 10 Clientes</option>
                <option value="25">Top 25 Clientes</option>
              </select>
              <button onClick={loadAnalytics} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ml-auto shadow-xs">
                <RefreshCw size={12}/> Recalcular
              </button>
            </div>

            {/* Core Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label:'Total Ventas Facturadas', value:fCOP(analytics?.total_revenue || analytics?.total_ventas || totalFacturadoCOP), desc:'Recaudo acumulado en el periodo', color:'text-emerald-700', bg:'bg-emerald-50' },
                { label:'Ticket Promedio de Venta', value:fCOP(analytics?.avg_ticket || analytics?.ticket_promedio || 450000), desc:'Valor promedio por orden', color:'text-indigo-700', bg:'bg-indigo-50' },
                { label:'Tasa Conversión SC → COT', value:`${analytics?.conv_sc_cot_pct || analytics?.conv_sc_cot || 65}%`, desc:'Solicitudes formalizadas a cotización', color:'text-sky-700', bg:'bg-sky-50' },
                { label:'Tasa Conversión COT → PVEN', value:`${analytics?.conv_cot_ven_pct || analytics?.conv_cot_ven || 48}%`, desc:'Cotizaciones aprobadas a compra', color:'text-purple-700', bg:'bg-purple-50' },
              ].map((k,i)=>(
                <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs font-black uppercase tracking-wider">{k.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${k.bg} ${k.color}`}>KPI</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{k.value}</p>
                  <p className="text-[11px] text-slate-400">{k.desc}</p>
                </div>
              ))}
            </div>

            {/* Daily Trends & Top Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><TrendingUp size={16} className="text-indigo-600"/> Curva de Ventas en el Tiempo</h3>
                  <span className="text-xs text-slate-400">Total en COP</span>
                </div>
                <div className="flex flex-col gap-2.5 h-64 overflow-y-auto pr-2">
                  {(analytics?.revenue_by_day || analytics?.ventas_por_dia || []).map((d:any,i:number)=>{
                    const list = analytics?.revenue_by_day || analytics?.ventas_por_dia || [];
                    const max = Math.max(...list.map((x:any)=>Number(x.total)||0), 1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-24 text-xs font-mono text-slate-500 shrink-0">{d.date || d.fecha}</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-500" style={{width:`${Math.min(100, ((Number(d.total)||0)/max)*100)}%`}}/>
                        </div>
                        <div className="w-28 text-right text-xs font-bold text-slate-800">{fCOP(d.total)}</div>
                      </div>
                    );
                  })}
                  {!(analytics?.revenue_by_day?.length || analytics?.ventas_por_dia?.length)&&(
                    <div className="text-slate-400 text-xs text-center py-16">
                      <BarChart3 size={32} className="mx-auto mb-2 opacity-20"/>
                      Sin ventas registradas en este rango. Haz clic en "Recalcular".
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">🏆 Top Clientes Frecuentes</h3>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-bold">&gt;$500k</span>
                    <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md font-bold">&gt;$1M</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-400 font-black uppercase">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Cliente</th>
                        <th className="pb-2 text-right">Compras Acumuladas</th>
                        <th className="pb-2 text-right">Segmento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(analytics?.top_clients || analytics?.top_clientes || []).map((c:any,i:number)=>(
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2.5 text-slate-400 font-bold">{i+1}</td>
                          <td className="py-2.5 font-bold text-slate-800">{c.name || c.nombre}</td>
                          <td className="py-2.5 text-right font-bold text-slate-900">{fCOP(c.total)}</td>
                          <td className="py-2.5 text-right">
                            {Number(c.total)>=1000000?(
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">VIP &gt; $1M</span>
                            ):Number(c.total)>=500000?(
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px]">Frecuente</span>
                            ):(
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium text-[10px]">Estándar</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!(analytics?.top_clients?.length || analytics?.top_clientes?.length)&&(
                        <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs">Sin registros de clientes en este período</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* AI Sales Copilot */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><MessageSquare size={18}/></div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Copilot de Ventas & Inteligencia Comercial</h3>
                  <p className="text-xs text-slate-400">Consulta en lenguaje natural sobre pedidos pendientes, retención de clientes o artículos para bebés.</p>
                </div>
              </div>

              {/* Sample prompt chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  '¿Qué pedidos están en estado PENDIENTE_COMPRA?',
                  '¿Cuál es el cliente con mayor volumen este mes?',
                  '¿Cuáles son las cotizaciones a punto de vencer?',
                  'Sugerencia de seguimiento comercial para clientes inactivos'
                ].map((s, idx)=>(
                  <button key={idx} onClick={()=>{setAiQuestion(s);}} className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-3 py-1 rounded-full font-medium transition-colors">
                    💡 {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskAI()}
                  placeholder="Ej: ¿Qué pedidos tienen más de 3 días sin gestionar? ¿Qué referencias están pendientes?"
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200 bg-white"/>
                <button onClick={handleAskAI} disabled={aiLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs">
                  {aiLoading?<RefreshCw size={13} className="animate-spin"/>:<Send size={13}/>} Consultar Copilot
                </button>
              </div>
              {aiLoading&&<div className="text-slate-400 animate-pulse text-xs font-medium">Analizando pipeline comercial de Nebulae...</div>}
              {aiResponse&&(
                <div className="bg-indigo-50/60 border border-indigo-100 p-4 rounded-xl text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">
                  <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5"><Zap size={13} className="text-indigo-600"/> Diagnóstico del Asistente Comercial:</div>
                  {aiResponse}
                </div>
              )}
            </div>
          </div>

        /* ── LISTA VIEW ── */
        ) : viewMode === 'lista' ? (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5 w-8">
                      <input type="checkbox" className="rounded border-slate-300"
                        onChange={e=>{if(e.target.checked)setSelectedIds(new Set(filteredData.map((d:any)=>`${d.tipo}|${d.id}`)));else setSelectedIds(new Set());}}
                        checked={selectedIds.size===filteredData.length&&filteredData.length>0}/>
                    </th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Tipo</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Resolución</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Número</th>
                    <th className="px-4 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Cliente</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Asesor</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Antigüedad</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-right">Monto COP</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-center">Próxima Acción</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-center">Chatter</th>
                    <th className="px-3 py-3.5 w-8"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.length===0&&(
                    <tr><td colSpan={12} className="text-center py-16 text-slate-400">
                      <Activity size={32} className="mx-auto mb-3 opacity-30"/>
                      <p className="font-semibold text-slate-600">{search?`Sin resultados para "${search}"`:loading?'Cargando...':'Sin registros en esta vista'}</p>
                      <p className="text-[11px] text-slate-400 mt-1">Prueba cambiando los filtros o agregando una nueva solicitud.</p>
                    </td></tr>
                  )}
                  {filteredData.map((row:any,idx:number)=>{
                    const idStr = `${row.tipo}|${row.id}`;
                    const isNoRes = isDocNoResolucion(row);
                    const isAtras = isDocAtrasado(row);
                    const dDiff = daysDiff(row.updated_at || row.created_at);

                    return (
                      <tr key={idx}
                        className={`hover:bg-indigo-50/30 cursor-pointer group transition-colors ${isAtras ? 'bg-rose-50/30 border-l-4 border-l-rose-500' : isNoRes ? 'bg-amber-50/20' : ''}`}
                        onClick={e=>{
                          if((e.target as any).closest('input')||(e.target as any).closest('button')) return;
                          openDocDetail(row);
                        }}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded border-slate-300" checked={selectedIds.has(idStr)}
                            onChange={e=>{const n=new Set(selectedIds);if(e.target.checked)n.add(idStr);else n.delete(idStr);setSelectedIds(n);}}/>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getTipoClass(row.tipo)}`}>
                            {row.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isAtras ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <AlertTriangle size={10} className="text-rose-600"/> No Resuelto (+{dDiff}d)
                            </span>
                          ) : isNoRes ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={10} className="text-amber-600"/> En Espera
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check size={10} className="text-emerald-600"/> Acción Tomada
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-bold text-slate-900">{row.numero}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800 leading-tight">{row.customer_name || row.cliente?.nombre || 'Cliente General'}</p>
                          {row.customer_phone && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.customer_phone}</p>}
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-[11px]">{row.advisor_name || row.cotizador || row.asesor?.nombre || 'Asignado'}</td>
                        <td className="px-3 py-3 text-[11px]">
                          <span className={`font-medium ${isAtras ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                            hace {dDiff === 0 ? 'hoy' : `${dDiff}d`}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getEstadoClass(row.estado)}`}>
                            {row.estado}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">
                          {fCOP(row.total_cop || row.total || row.monto || 0)}
                        </td>
                        
                        {/* Accion sugerida segun el tipo y estado */}
                        <td className="px-3 py-3 text-center">
                          {row.tipo === 'SC' && row.estado !== 'CONFIRMADA' && row.estado !== 'CANCELADA' ? (
                            <button onClick={e=>{e.stopPropagation();router.push(`/dashboard/ventas/cotizacion?sc_id=${row.id}`);}}
                              className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] rounded-lg border border-indigo-200 transition-colors">
                              Cotizar →
                            </button>
                          ) : row.tipo === 'COT' && row.estado !== 'CONFIRMADA' && row.estado !== 'RECHAZADA' ? (
                            <button onClick={e=>{e.stopPropagation();router.push(`/dashboard/ventas/venta?cot_id=${row.id}`);}}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded-lg border border-amber-200 transition-colors">
                              Aprobar Venta →
                            </button>
                          ) : row.tipo === 'VEN' && row.estado === 'LISTO_ENTREGA' ? (
                            <button onClick={e=>{e.stopPropagation();openDocDetail(row);}}
                              className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[10px] rounded-lg border border-teal-200 transition-colors">
                              Despachar
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Al día</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-center">
                          <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Ver Chatter & Actividad">
                            <Activity size={14}/>
                          </button>
                        </td>

                        <td className="px-3 py-3 relative group/m">
                          <button className="text-slate-400 hover:text-slate-700 transition-colors"><MoreHorizontal size={16}/></button>
                          <div className="absolute right-6 top-2 bg-white shadow-2xl rounded-xl border border-slate-100 py-1.5 w-48 invisible group-hover/m:visible z-20 text-left">
                            <button className="w-full px-3 py-1.5 hover:bg-indigo-50 text-xs font-semibold flex items-center gap-2 text-indigo-700"
                              onClick={e=>{e.stopPropagation();openDocDetail(row);}}>
                              <ExternalLink size={12}/> Ver Detalle Completo
                            </button>
                            <button className="w-full px-3 py-1.5 hover:bg-slate-50 text-xs font-medium flex items-center gap-2 text-slate-700"
                              onClick={e=>{e.stopPropagation();setActRow(row);}}>
                              <Activity size={12}/> Ver Historial & Chatter
                            </button>
                            {row.customer_phone && (
                              <a href={`https://wa.me/${row.customer_phone.replace(/[^0-9]/g,'')}`} target="_blank" rel="noreferrer"
                                className="w-full px-3 py-1.5 hover:bg-emerald-50 text-xs font-medium flex items-center gap-2 text-emerald-700"
                                onClick={e=>e.stopPropagation()}>
                                <MessageCircle size={12}/> Abrir WhatsApp
                              </a>
                            )}
                            <div className="border-t border-slate-100 my-1"/>
                            <button className="w-full px-3 py-1.5 hover:bg-rose-50 text-xs font-medium text-rose-600 flex items-center gap-2"
                              onClick={e=>{e.stopPropagation();setSelectedIds(new Set([idStr]));handleBulkDelete();}}>
                              <Trash2 size={12}/> Cancelar Documento
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 font-medium flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <span>Mostrando {filteredData.length} de {allData.length} registros del Hub Comercial</span>
              {selectedIds.size>0&&(
                <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                  {selectedIds.size} seleccionados
                </span>
              )}
            </div>
          </div>

        /* ── KANBAN VIEW ── */
        ) : (
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {['No Resuelto','En Gestión','Acción Tomada','Cancelado'].map(col=>(
              <div key={col} className="w-80 shrink-0 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs"
                onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e,col)}>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide">{col}</h3>
                    {col === 'No Resuelto' && atrasadosList.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"/>
                    )}
                  </div>
                  <span className="bg-slate-200/80 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {filteredData.filter(d=>getKanbanCol(d)===col).length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-[300px]">
                  {filteredData.filter(d=>getKanbanCol(d)===col).map((row:any,i:number)=>{
                    const isAtras = isDocAtrasado(row);
                    const dDiff = daysDiff(row.updated_at || row.created_at);

                    return (
                      <div key={i} draggable onDragStart={e=>handleDragStart(e,`${row.tipo}|${row.id}`)} onClick={()=>openDocDetail(row)}
                        className={`bg-white p-4 rounded-xl shadow-xs border cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-all group ${isAtras?'border-rose-300 bg-rose-50/30':'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-slate-900 text-xs">{row.numero}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700 mb-1 truncate">{row.customer_name || row.cliente?.nombre || 'Cliente Nebulae'}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                          <span>{fDate(row.created_at)}</span>
                          <span className={`font-semibold ${isAtras ? 'text-rose-600 font-bold' : ''}`}>
                            hace {dDiff === 0 ? 'hoy' : `${dDiff}d`}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <span className="font-black text-xs text-indigo-700">{fCOP(row.total_cop||row.total||0)}</span>
                          <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-200 transition-opacity">
                            <Activity size={10}/> Actividad
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter(d=>getKanbanCol(d)===col).length===0&&(
                    <p className="text-center text-xs text-slate-300 font-medium py-12">Sin documentos aquí</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size>0&&(
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">{selectedIds.size} seleccionados</span>
            <select onChange={e=>handleBulkChangeEstado(e.target.value)} defaultValue=""
              className="bg-slate-800 border border-slate-600 text-white text-xs rounded-xl px-3 py-1.5 outline-none">
              <option value="" disabled>Cambiar Estado Múltiple...</option>
              <option value="EN_PROCESO">En Proceso</option>
              <option value="LISTO_ENTREGA">Listo Entrega</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="FACTURADO">Facturado</option>
            </select>
            <button onClick={handleBulkDelete} className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 p-2 rounded-xl transition-colors" title="Cancelar seleccionados">
              <Trash2 size={15}/>
            </button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-white"><X size={15}/></button>
          </div>
        )}

        {/* UNIVERSAL DOCUMENT QUICK DETAIL PANEL (SC, COT, VEN) */}
        {quickDetailDoc&&(
          <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40" onClick={()=>setQuickDetailDoc(null)}/>
            <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col w-[600px] border-l border-slate-200">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getTipoClass(quickDetailDoc.tipo)}`}>
                    {getTipoLabel(quickDetailDoc.tipo)}
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{quickDetailDoc.numero}</h2>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getEstadoClass(quickDetailDoc.estado)}`}>
                      {quickDetailDoc.estado}
                    </span>
                  </div>
                </div>
                <button onClick={()=>setQuickDetailDoc(null)} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Customer Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Información del Cliente</p>
                  <p className="font-black text-slate-800 text-sm">{quickDetailDoc.customer_name || quickDetailDoc.cliente?.nombre || 'Cliente General'}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="text-slate-400 block text-[10px]">Teléfono / WhatsApp:</span> {quickDetailDoc.customer_phone || quickDetailDoc.telefono || '-'}</div>
                    <div><span className="text-slate-400 block text-[10px]">Email:</span> {quickDetailDoc.customer_email || quickDetailDoc.email || '-'}</div>
                    <div className="col-span-2"><span className="text-slate-400 block text-[10px]">Dirección de Entrega:</span> {quickDetailDoc.customer_address || quickDetailDoc.direccion_entrega || 'Recoge en Tienda'}</div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Resumen Financiero</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Liquidado:</span>
                      <span className="font-bold text-slate-900">{fCOP(quickDetailDoc.total_cop || quickDetailDoc.total || 0)}</span>
                    </div>
                    {quickDetailDoc.anticipo_cop !== undefined && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Anticipo / Recaudo:</span>
                        <span className="font-bold">{fCOP(quickDetailDoc.anticipo_cop)}</span>
                      </div>
                    )}
                    {quickDetailDoc.saldo_cop !== undefined && (
                      <div className="flex justify-between text-rose-600 font-bold border-t border-slate-100 pt-1">
                        <span>Saldo Pendiente:</span>
                        <span>{fCOP(quickDetailDoc.saldo_cop)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Products items */}
                {Array.isArray(quickDetailDoc.productos) && quickDetailDoc.productos.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Partidas y Referencias</p>
                    <div className="divide-y divide-slate-100">
                      {quickDetailDoc.productos.map((item:any, idx:number)=>(
                        <div key={idx} className="py-2 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{item.nombre || item.producto_nombre || item.sku || `Ítem #${idx+1}`}</p>
                            <p className="text-[10px] text-slate-400">Cant: {item.cantidad || item.qty || 1} {item.talla ? `· Talla: ${item.talla}` : ''}</p>
                          </div>
                          <span className="font-bold text-slate-700">{fCOP(item.precio_unitario || item.precio || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* State Changer for VEN */}
                {quickDetailDoc.tipo === 'VEN' && (
                  <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Cambiar Estado Operativo</p>
                    <div className="flex flex-wrap gap-2">
                      {['PENDIENTE_COMPRA','EN_PROCESO','EN_TRANSITO','LISTO_ENTREGA','ENTREGADO','FACTURADO','CANCELADO'].map(est=>(
                        <button key={est} onClick={async()=>{
                          try{
                            await apiFetch(`/ventas/pedidos/${quickDetailDoc.id}`,{method:'PATCH',body:JSON.stringify({estado:est})});
                            openDocDetail(quickDetailDoc);
                            loadData();
                            setToast({msg:`Estado actualizado a ${est}`,type:'ok'});
                          }catch(e:any){setToast({msg:e.message,type:'error'});}
                        }}
                        className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${quickDetailDoc.estado===est?'bg-indigo-600 text-white border-indigo-600 shadow-xs':'bg-white text-slate-700 hover:bg-slate-100 border-slate-200'}`}>
                          {est}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Direct Action Link */}
                <div className="pt-2">
                  <button onClick={()=>{
                    const q = quickDetailDoc;
                    if(q.tipo==='SC')  router.push(`/dashboard/ventas/solicitud?id=${q.id}`);
                    if(q.tipo==='COT') router.push(`/dashboard/ventas/cotizacion?id=${q.id}`);
                    if(q.tipo==='VEN') router.push(`/dashboard/ventas/venta?id=${q.id}`);
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors">
                    Abrir en Módulo Detallado <ArrowRight size={14}/>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
