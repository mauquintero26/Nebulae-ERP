'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { 
  MoreHorizontal, MessageCircle, MessageSquare, 
  Trash2, X, List, Kanban, Send
} from 'lucide-react';
import { usePathname } from 'next/navigation';

const SUB_MODULES = [
  { name: 'Solicitud de Cliente', path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion', path: '/dashboard/ventas/cotizacion' },
  { name: 'Pedido de Venta', path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia', path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango', path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion DB', path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones', path: '/dashboard/ventas/proyecciones' },
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

const fCOP = (v: any) => { const n = Number(v)||0; return n>0 ? '$'+n.toLocaleString('es-CO') : '-'; };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';

function Toast({msg,type,onClose}: {msg:string,type:'ok'|'error',onClose:()=>void}) {
  useEffect(()=>{const t=setTimeout(onClose,4000);return()=>clearTimeout(t);},[onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${type==='ok'?'bg-emerald-600':'bg-red-600'} text-white`}>
      <span>{msg}</span>
      <button onClick={onClose}><X size={16} /></button>
    </div>
  );
}

const getEstadoClass = (estado: string) => {
  const map: Record<string, string> = {
    'BORRADOR': 'bg-slate-100 text-slate-700 border-slate-200',
    'PENDIENTE_CONFIRMACION': 'bg-amber-100 text-amber-800 border-amber-200',
    'CONFIRMADA': 'bg-emerald-100 text-emerald-700 border-emerald-200',
    'ENVIADA': 'bg-blue-100 text-blue-700 border-blue-200',
    'PENDIENTE_COMPRA': 'bg-orange-100 text-orange-700 border-orange-200',
    'EN_PROCESO': 'bg-purple-100 text-purple-700 border-purple-200',
    'ENTREGADO': 'bg-teal-100 text-teal-700 border-teal-200',
    'FACTURADO': 'bg-green-100 text-green-700 border-green-200',
    'CANCELADO': 'bg-red-100 text-red-700 border-red-200',
    'CANCELADA': 'bg-red-100 text-red-700 border-red-200',
    'RECHAZADA': 'bg-red-100 text-red-700 border-red-200',
  };
  return map[estado] || 'bg-gray-100 text-gray-700 border-gray-200';
};

const getTipoClass = (tipo: string) => {
  const map: Record<string, string> = {
    'SC': 'bg-indigo-100 text-indigo-700',
    'COT': 'bg-amber-100 text-amber-700',
    'VEN': 'bg-emerald-100 text-emerald-700',
  };
  return map[tipo] || 'bg-gray-100 text-gray-700';
};

export default function VentasHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab] = useState('Todos');
  const [viewMode, setViewMode] = useState<'lista'|'kanban'>('lista');
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{msg:string, type:'ok'|'error'} | null>(null);
  
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [allData, setAllData] = useState<any[]>([]);
  
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  
  const [analytics, setAnalytics] = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState('30d');
  const [analyticsTopN, setAnalyticsTopN] = useState('5');
  const [analyticsProduct, setAnalyticsProduct] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  
  const [selectedVenId, setSelectedVenId] = useState<string|null>(null);
  const [venDetail, setVenDetail] = useState<any>(null);
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const [sc, cot, ven] = await Promise.all([
        apiFetch('/ventas/solicitudes?limit=200').catch(() => []),
        apiFetch('/ventas/cotizaciones?limit=200').catch(() => []),
        apiFetch('/ventas/pedidos?limit=200').catch(() => [])
      ]);
      const scList = (Array.isArray(sc) ? sc : (sc.items || [])).map((x:any)=>({...x, tipo:'SC'}));
      const cotList = (Array.isArray(cot) ? cot : (cot.items || [])).map((x:any)=>({...x, tipo:'COT'}));
      const venList = (Array.isArray(ven) ? ven : (ven.items || [])).map((x:any)=>({...x, tipo:'VEN'}));
      
      setSolicitudes(scList);
      setCotizaciones(cotList);
      setPedidos(venList);
      setAllData([...scList, ...cotList, ...venList].sort((a,b)=>new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()));
    } catch (err: any) {
      setToast({msg: err.message, type: 'error'});
    } finally {
      setLoading(false);
    }
  };
  
  const loadAnalytics = async () => {
    try {
      const res = await apiFetch(`/ventas/analytics?range=${analyticsRange}&top_n=${analyticsTopN}`);
      setAnalytics(res);
    } catch (err: any) {
      setToast({msg: err.message || 'Error loading analytics', type: 'error'});
    }
  };
  
  useEffect(() => {
    if (activeTab === 'Analisis') loadAnalytics();
  }, [activeTab, analyticsRange, analyticsTopN]);
  
  const filteredData = React.useMemo(() => {
    if (activeTab === 'Todos') return allData;
    if (activeTab === 'SC') return solicitudes;
    if (activeTab === 'Cotizaciones') return cotizaciones;
    if (activeTab === 'Pedidos de Venta') return pedidos;
    return [];
  }, [activeTab, allData, solicitudes, cotizaciones, pedidos]);
  
  const handleBulkChangeEstado = async (newEstado: string) => {
    if (selectedIds.size === 0) return;
    try {
      for (const idStr of Array.from(selectedIds)) {
        const [tipo, id] = idStr.split('|');
        let path = '';
        if (tipo === 'SC') path = `/ventas/solicitudes/${id}`;
        if (tipo === 'COT') path = `/ventas/cotizaciones/${id}`;
        if (tipo === 'VEN') path = `/ventas/pedidos/${id}`;
        await apiFetch(path, { method: 'PATCH', body: JSON.stringify({estado: newEstado}) });
      }
      setToast({msg: 'Estados actualizados', type: 'ok'});
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      setToast({msg: err.message, type: 'error'});
    }
  };
  
  const handleBulkDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm('Eliminar (cancelar/rechazar) elementos seleccionados?')) return;
    try {
      for (const idStr of Array.from(selectedIds)) {
        const [tipo, id] = idStr.split('|');
        let path = '';
        let estado = 'CANCELADO';
        if (tipo === 'SC') { path = `/ventas/solicitudes/${id}`; estado = 'CANCELADA'; }
        if (tipo === 'COT') { path = `/ventas/cotizaciones/${id}`; estado = 'RECHAZADA'; }
        if (tipo === 'VEN') { path = `/ventas/pedidos/${id}`; estado = 'CANCELADO'; }
        await apiFetch(path, { method: 'PATCH', body: JSON.stringify({estado}) });
      }
      setToast({msg: 'Elementos cancelados', type: 'ok'});
      setSelectedIds(new Set());
      loadData();
    } catch (err: any) {
      setToast({msg: err.message, type: 'error'});
    }
  };
  
  const handleAskAI = async () => {
    if (!aiQuestion.trim()) return;
    setAiLoading(true);
    setAiResponse('');
    try {
      const res = await apiFetch('/ventas/ai-chat', { method: 'POST', body: JSON.stringify({question: aiQuestion, context: {stats: analytics}}) });
      setAiResponse(res.response || 'El asistente IA de ventas esta en configuracion. Intenta mas tarde.');
    } catch (err: any) {
      setAiResponse('El asistente IA de ventas esta en configuracion. Intenta mas tarde.');
    } finally {
      setAiLoading(false);
    }
  };
  
  const openVenDetail = async (id: string) => {
    setSelectedVenId(id);
    setVenDetail(null);
    try {
      const data = await apiFetch(`/ventas/pedidos/${id}`);
      setVenDetail(data);
    } catch (err: any) {
      setToast({msg: err.message, type: 'error'});
    }
  };
  
  const handleDragStart = (e: React.DragEvent, idStr: string) => {
    e.dataTransfer.setData('idStr', idStr);
  };
  
  const handleDrop = async (e: React.DragEvent, colStatus: string) => {
    const idStr = e.dataTransfer.getData('idStr');
    if (!idStr) return;
    const [tipo, id] = idStr.split('|');
    let path = '';
    if (tipo === 'SC') path = `/ventas/solicitudes/${id}`;
    if (tipo === 'COT') path = `/ventas/cotizaciones/${id}`;
    if (tipo === 'VEN') path = `/ventas/pedidos/${id}`;
    
    let newEstado = colStatus;
    if (colStatus === 'Pendiente') newEstado = tipo === 'SC' ? 'BORRADOR' : (tipo === 'COT' ? 'PENDIENTE_CONFIRMACION' : 'PENDIENTE_COMPRA');
    if (colStatus === 'En Proceso') newEstado = 'EN_PROCESO';
    if (colStatus === 'Completado') newEstado = tipo === 'VEN' ? 'ENTREGADO' : (tipo === 'COT' ? 'CONFIRMADA' : 'ENVIADA');
    if (colStatus === 'Cancelado') newEstado = tipo === 'SC' ? 'CANCELADA' : (tipo === 'COT' ? 'RECHAZADA' : 'CANCELADO');

    try {
      await apiFetch(path, { method: 'PATCH', body: JSON.stringify({estado: newEstado}) });
      loadData();
    } catch (err: any) {
      setToast({msg: err.message, type: 'error'});
    }
  };
  
  const getKanbanColumnStatus = (item: any) => {
    const estado = item.estado || '';
    if (['CANCELADO','CANCELADA','RECHAZADA'].includes(estado)) return 'Cancelado';
    if (['ENTREGADO','FACTURADO','CONFIRMADA','ENVIADA'].includes(estado)) return 'Completado';
    if (['EN_PROCESO'].includes(estado)) return 'En Proceso';
    return 'Pendiente';
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
      
      <div className="bg-white border-b border-slate-200 px-6 py-4">
        <h1 className="text-2xl font-bold text-slate-800 mb-4">Ventas Hub</h1>
        <div className="flex flex-wrap gap-2">
          {SUB_MODULES.map(m => (
            <Link key={m.name} href={m.path} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${pathname === m.path ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600 hover:bg-slate-100'}`}>
              {m.name}
            </Link>
          ))}
        </div>
      </div>
      
      <div className="p-6 flex-1 flex flex-col max-w-[1600px] mx-auto w-full">
        <div className="flex items-center justify-between mb-6">
          <div className="flex bg-white rounded-xl shadow-sm p-1">
            {['Todos', 'SC', 'Cotizaciones', 'Pedidos de Venta', 'Analisis'].map(tab => (
              <button 
                key={tab} 
                onClick={() => { setActiveTab(tab); setSelectedIds(new Set()); }}
                className={`px-5 py-2.5 rounded-lg text-sm font-semibold transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                {tab}
              </button>
            ))}
          </div>
          
          {activeTab !== 'Analisis' && (
            <div className="flex items-center bg-white rounded-xl shadow-sm p-1">
              <button onClick={() => setViewMode('lista')} className={`p-2 rounded-lg ${viewMode === 'lista' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <List size={20} />
              </button>
              <button onClick={() => setViewMode('kanban')} className={`p-2 rounded-lg ${viewMode === 'kanban' ? 'bg-indigo-100 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}>
                <Kanban size={20} />
              </button>
            </div>
          )}
        </div>
        
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
        ) : activeTab === 'Analisis' ? (
          <div className="flex flex-col gap-6">
            <div className="flex gap-2">
              {['7d','30d','90d','180d','1y'].map(r => (
                <button key={r} onClick={() => setAnalyticsRange(r)} className={`px-3 py-1.5 rounded-md text-sm ${analyticsRange===r ? 'bg-indigo-600 text-white':'bg-white text-slate-600 border'}`}>{r}</button>
              ))}
              <input type="text" placeholder="Filtrar producto..." value={analyticsProduct} onChange={e=>setAnalyticsProduct(e.target.value)} className="border rounded-md px-3 py-1.5 text-sm" />
              <select value={analyticsTopN} onChange={e=>setAnalyticsTopN(e.target.value)} className="border rounded-md px-3 py-1.5 text-sm">
                <option value="5">Top 5</option><option value="10">Top 10</option><option value="25">Top 25</option>
              </select>
            </div>
            
            <div className="grid grid-cols-4 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm"><div className="text-slate-500 text-sm font-medium">Total Ventas COP</div><div className="text-2xl font-bold mt-2">{fCOP(analytics?.total_ventas || 0)}</div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm"><div className="text-slate-500 text-sm font-medium">Ticket Promedio</div><div className="text-2xl font-bold mt-2">{fCOP(analytics?.ticket_promedio || 0)}</div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm"><div className="text-slate-500 text-sm font-medium">Conversion SC-&gt;COT %</div><div className="text-2xl font-bold mt-2">{analytics?.conv_sc_cot||0}%</div></div>
              <div className="bg-white p-6 rounded-2xl shadow-sm"><div className="text-slate-500 text-sm font-medium">Conversion COT-&gt;VEN %</div><div className="text-2xl font-bold mt-2">{analytics?.conv_cot_ven||0}%</div></div>
            </div>
            
            <div className="grid grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <h3 className="font-bold text-lg mb-4">Ventas por Dia</h3>
                <div className="flex flex-col gap-2 h-64 overflow-y-auto">
                  {(analytics?.ventas_por_dia || []).map((d:any, i:number) => {
                    const max = Math.max(...(analytics?.ventas_por_dia || []).map((x:any)=>x.total), 1);
                    const w = (d.total / max) * 100;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-24 text-xs text-slate-500">{d.fecha}</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-indigo-500 h-full" style={{width: `${w}%`}}></div>
                        </div>
                        <div className="w-24 text-right text-xs font-medium">{fCOP(d.total)}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
              
              <div className="bg-white p-6 rounded-2xl shadow-sm">
                <h3 className="font-bold text-lg mb-4">Top Clientes</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-slate-500"><th>Rank</th><th>Nombre</th><th className="text-right">Total COP</th></tr></thead>
                  <tbody>
                    {(analytics?.top_clientes || []).map((c:any, i:number) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-2">{i+1}</td><td className="py-2">{c.nombre}</td><td className="py-2 text-right">{fCOP(c.total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm">
              <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><MessageSquare className="text-indigo-600" /> AI Sales Assistant</h3>
              <div className="flex gap-2 mb-4">
                <input type="text" value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskAI()} placeholder="Pregunta sobre las ventas..." className="flex-1 border border-slate-300 rounded-xl px-4 py-2" />
                <button onClick={handleAskAI} disabled={aiLoading} className="bg-indigo-600 text-white px-4 py-2 rounded-xl flex items-center gap-2"><Send size={18}/> Preguntar</button>
              </div>
              {aiLoading ? <div className="text-slate-500 animate-pulse">Pensando...</div> : aiResponse ? <div className="bg-slate-50 p-4 rounded-xl text-slate-700 whitespace-pre-wrap">{aiResponse}</div> : null}
            </div>
          </div>
        ) : viewMode === 'lista' ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-600 font-medium">
                  <tr>
                    <th className="px-6 py-4 w-10"><input type="checkbox" onChange={e => {
                      if (e.target.checked) setSelectedIds(new Set(filteredData.map(d=>`${d.tipo}|${d.id}`)));
                      else setSelectedIds(new Set());
                    }} checked={selectedIds.size === filteredData.length && filteredData.length > 0} className="rounded" /></th>
                    <th className="px-6 py-4">Tipo</th>
                    <th className="px-6 py-4">Numero</th>
                    <th className="px-6 py-4">Cliente</th>
                    <th className="px-6 py-4">Asesor</th>
                    <th className="px-6 py-4">Fecha</th>
                    <th className="px-6 py-4">Estado</th>
                    <th className="px-6 py-4 text-right">Monto</th>
                    <th className="px-6 py-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredData.map((row:any, idx:number) => {
                    const idStr = `${row.tipo}|${row.id}`;
                    return (
                      <tr key={idx} className="hover:bg-slate-50 cursor-pointer" onClick={(e) => {
                        if ((e.target as any).closest('input') || (e.target as any).closest('button')) return;
                        if (row.tipo === 'VEN') openVenDetail(row.id);
                        else window.location.href = row.tipo === 'SC' ? `/dashboard/ventas/solicitud/${row.id}` : `/dashboard/ventas/cotizacion/${row.id}`;
                      }}>
                        <td className="px-6 py-4"><input type="checkbox" checked={selectedIds.has(idStr)} onChange={e => {
                          const n = new Set(selectedIds);
                          if (e.target.checked) n.add(idStr); else n.delete(idStr);
                          setSelectedIds(n);
                        }} className="rounded" /></td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-bold ${getTipoClass(row.tipo)}`}>{row.tipo}</span></td>
                        <td className="px-6 py-4 font-medium">{row.numero}</td>
                        <td className="px-6 py-4">{row.cliente?.nombre || row.cliente_nombre || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{row.asesor?.nombre || row.asesor_nombre || '-'}</td>
                        <td className="px-6 py-4 text-slate-500">{fDate(row.created_at || row.fecha)}</td>
                        <td className="px-6 py-4"><span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getEstadoClass(row.estado)}`}>{row.estado}</span></td>
                        <td className="px-6 py-4 text-right font-medium">{fCOP(row.total || row.monto || 0)}</td>
                        <td className="px-6 py-4 relative group">
                          <button className="text-slate-400 hover:text-slate-600"><MoreHorizontal size={20}/></button>
                          <div className="absolute right-8 top-4 bg-white shadow-xl rounded-xl border border-slate-100 py-2 w-48 hidden group-hover:block z-10">
                            <button className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm" onClick={(e)=>{e.stopPropagation();if(row.tipo==='VEN')openVenDetail(row.id);}}>Ver Detalle</button>
                            <button className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm" onClick={(e)=>{e.stopPropagation();window.location.href=`/dashboard/ventas/${row.tipo.toLowerCase()}/${row.id}/editar`;}}>Editar</button>
                            <button className="w-full text-left px-4 py-2 hover:bg-slate-50 text-sm text-red-600" onClick={(e)=>{e.stopPropagation();setSelectedIds(new Set([idStr]));handleBulkDelete();}}>Eliminar</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {['Pendiente', 'En Proceso', 'Completado', 'Cancelado'].map(col => (
              <div key={col} className="w-80 flex-shrink-0 flex flex-col bg-slate-100/50 rounded-2xl p-4" onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e, col)}>
                <h3 className="font-bold text-slate-700 mb-4 px-2">{col}</h3>
                <div className="flex-1 flex flex-col gap-3">
                  {filteredData.filter(d => getKanbanColumnStatus(d) === col).map((row:any, i:number) => (
                    <div key={i} draggable onDragStart={e=>handleDragStart(e, `${row.tipo}|${row.id}`)} onClick={()=>{if(row.tipo==='VEN')openVenDetail(row.id);}} className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-colors">
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-bold text-slate-800 text-sm">{row.numero}</span>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
                      </div>
                      <div className="text-sm text-slate-600 mb-3 truncate">{row.cliente?.nombre || row.cliente_nombre || 'Cliente'}</div>
                      <div className="flex justify-between items-center mt-2 pt-3 border-t border-slate-50">
                        <span className="font-semibold text-indigo-700">{fCOP(row.total || row.monto || 0)}</span>
                        <span className={`px-2 py-0.5 rounded-md text-[10px] font-medium border ${getEstadoClass(row.estado)}`}>{row.estado}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        
        {selectedIds.size > 0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-full shadow-2xl flex items-center gap-6 z-40">
            <span className="font-medium bg-slate-800 px-3 py-1 rounded-full text-sm">{selectedIds.size} seleccionados</span>
            <div className="flex items-center gap-2 border-l border-slate-700 pl-6">
              <select onChange={e=>handleBulkChangeEstado(e.target.value)} value="" className="bg-slate-800 border-none text-white text-sm rounded-lg px-3 py-1.5 focus:ring-0">
                <option value="" disabled>Cambiar Estado...</option>
                <option value="EN_PROCESO">En Proceso</option>
                <option value="ENTREGADO">Entregado</option>
                <option value="FACTURADO">Facturado</option>
              </select>
              <button onClick={handleBulkDelete} className="bg-red-500/20 text-red-400 hover:bg-red-500/30 hover:text-red-300 p-2 rounded-lg transition-colors"><Trash2 size={18}/></button>
              <button onClick={()=>setSelectedIds(new Set())} className="p-2 text-slate-400 hover:text-white"><X size={18}/></button>
            </div>
          </div>
        )}
        
        {selectedVenId && (
          <>
            <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm z-40" onClick={()=>setSelectedVenId(null)}></div>
            <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left: '240px'}}>
              <div className="flex items-center justify-between px-8 py-5 border-b border-slate-100">
                <h2 className="text-xl font-bold flex items-center gap-3">
                  Pedido de Venta {venDetail?.numero || selectedVenId}
                  {venDetail && <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getEstadoClass(venDetail.estado)}`}>{venDetail.estado}</span>}
                </h2>
                <button onClick={()=>setSelectedVenId(null)} className="p-2 hover:bg-slate-100 rounded-full text-slate-500"><X size={24}/></button>
              </div>
              
              {!venDetail ? (
                <div className="flex-1 flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div></div>
              ) : (
                <div className="flex-1 flex overflow-hidden">
                  <div className="w-[45%] border-r border-slate-100 bg-slate-50/50 p-8 overflow-y-auto">
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
                      <div className="text-sm text-slate-500 mb-1">Cliente</div>
                      <div className="font-bold text-lg mb-4">{venDetail.cliente?.nombre || '-'}</div>
                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div><span className="text-slate-500 block mb-1">Fecha Entrega</span><span className="font-medium">{fDate(venDetail.fecha_entrega)}</span></div>
                        <div><span className="text-slate-500 block mb-1">Cotizacion</span><Link href={`/dashboard/ventas/cotizacion/${venDetail.cotizacion_id}`} className="font-medium text-indigo-600 hover:underline">{venDetail.cotizacion?.numero || '-'}</Link></div>
                      </div>
                    </div>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 mb-6">
                      <h3 className="font-bold mb-4">Montos</h3>
                      <div className="flex justify-between items-center py-2 border-b"><span className="text-slate-600">Total</span><span className="font-bold text-lg">{fCOP(venDetail.total)}</span></div>
                      <div className="flex justify-between items-center py-2 border-b"><span className="text-slate-600">Anticipo</span><span className="font-medium text-emerald-600">{fCOP(venDetail.anticipo)}</span></div>
                      <div className="flex justify-between items-center py-2"><span className="text-slate-600">Saldo</span><span className="font-bold text-indigo-600">{fCOP(venDetail.total - (venDetail.anticipo||0))}</span></div>
                    </div>
                    
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
                      <h3 className="font-bold mb-4">Productos</h3>
                      <div className="flex flex-col gap-3">
                        {(venDetail.items || []).map((it:any, i:number) => (
                          <div key={i} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl">
                            <div>
                              <div className="font-medium text-sm">{it.producto?.nombre || '-'}</div>
                              <div className="text-xs text-slate-500">{it.cantidad} und x {fCOP(it.precio_unitario)}</div>
                            </div>
                            <div className="font-bold text-sm">{fCOP(it.total)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  
                  <div className="w-[55%] p-8 overflow-y-auto bg-white">
                    <div className="flex gap-3 mb-8">
                      <button className="flex-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 py-3 rounded-xl font-medium flex justify-center items-center gap-2" onClick={()=>window.open(`https://wa.me/57${venDetail.cliente?.telefono||''}`)}><MessageCircle size={18}/> WhatsApp</button>
                      <button className="flex-1 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 py-3 rounded-xl font-medium flex justify-center items-center gap-2">Llamar</button>
                      <button className="flex-1 bg-slate-50 text-slate-700 hover:bg-slate-100 py-3 rounded-xl font-medium flex justify-center items-center gap-2">Email</button>
                    </div>
                    
                    <h3 className="font-bold text-lg mb-6">Actividad & Estado</h3>
                    <div className="flex flex-wrap gap-2 mb-8 p-4 bg-slate-50 rounded-2xl">
                      {['BORRADOR', 'EN_PROCESO', 'ENTREGADO', 'FACTURADO', 'CANCELADO'].map(est => (
                        <button key={est} onClick={async () => {
                          try {
                            await apiFetch(`/ventas/pedidos/${venDetail.id}`, { method: 'PATCH', body: JSON.stringify({estado: est}) });
                            openVenDetail(venDetail.id);
                            loadData();
                          } catch (e:any) { setToast({msg: e.message, type: 'error'}); }
                        }} className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${venDetail.estado === est ? 'bg-indigo-600 text-white shadow' : 'bg-white text-slate-600 hover:bg-slate-100 border'}`}>
                          {est}
                        </button>
                      ))}
                    </div>
                    
                    <div className="relative border-l-2 border-slate-100 ml-4 pl-6 pb-6">
                      {(venDetail.actividad || [{fecha: venDetail.created_at, tipo: 'CREACION', desc: 'Pedido creado'}]).map((act:any, i:number) => (
                        <div key={i} className="mb-6 relative">
                          <div className="absolute -left-[31px] bg-white p-1 rounded-full border-2 border-indigo-100"><div className="w-3 h-3 bg-indigo-500 rounded-full"></div></div>
                          <div className="text-xs text-slate-500 mb-1">{fDate(act.fecha)}</div>
                          <div className="font-medium text-slate-800">{act.tipo}</div>
                          <div className="text-sm text-slate-600 mt-1">{act.desc}</div>
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
