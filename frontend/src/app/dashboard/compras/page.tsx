'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  ShoppingBag, AlertTriangle, Package, CheckCircle2,
  Clock, Truck, Search, MoreHorizontal, RefreshCw,
  Activity, ShieldAlert, Receipt, Filter, X, Trash2,
  Edit2, Send, TrendingUp, BarChart3, ExternalLink, Bell,
  DollarSign, Calendar, MessageSquare, AlertCircle,
  ChevronRight, ChevronUp, Plus, Eye, ShoppingCart
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

const fCOP  = (v) => { const n = Number(v)||0; return n > 0 ? '$'+n.toLocaleString('es-CO') : '-'; };
const fDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fMonthKey = (iso) => iso ? new Date(iso).toLocaleDateString('es-CO',{year:'numeric',month:'long'}) : 'Sin fecha';

const PEC_ESTADOS = {
  BORRADOR:          { bg:'bg-slate-100',   text:'text-slate-700',   border:'border-slate-200',   label:'Borrador' },
  EMITIDO:           { bg:'bg-amber-100',   text:'text-amber-800',   border:'border-amber-200',   label:'Emitido' },
  ENVIADO:           { bg:'bg-blue-100',    text:'text-blue-800',    border:'border-blue-200',    label:'Enviado' },
  EN_TRANSITO:       { bg:'bg-indigo-100',  text:'text-indigo-800',  border:'border-indigo-200',  label:'En Transito' },
  PENDIENTE_ENTREGA: { bg:'bg-orange-100',  text:'text-orange-800',  border:'border-orange-200',  label:'Pend. Entrega' },
  RECIBIDO:          { bg:'bg-emerald-100', text:'text-emerald-800', border:'border-emerald-200', label:'Recibido' },
  COMPLETADO:        { bg:'bg-green-100',   text:'text-green-800',   border:'border-green-200',   label:'Completado' },
  CANCELADO:         { bg:'bg-red-100',     text:'text-red-700',     border:'border-red-200',     label:'Cancelado' },
};

const SUB_MODULES = [
  { name: 'Lista de Compras',      path: '/dashboard/compras/lista-compras' },
  { name: 'Pedidos de Compra',     path: '/dashboard/compras/pedidos' },
  { name: 'Mercancia en Transito', path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)', path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos',    path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual',   path: '/dashboard/compras/registro' },
  { name: 'Proyecciones',          path: '/dashboard/compras/proyecciones' },
];

function Toast({ msg, type, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={'fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ' + (type==='ok'?'bg-emerald-600':'bg-red-600') + ' text-white'}>
      <span>{msg}</span><button onClick={onClose}><X size={16}/></button>
    </div>
  );
}

/* ============================================================
   PEC DETAIL PANEL
   ============================================================ */
function PecDetailPanel({ pec, pedidosVenta, onClose, onUpdate, onToast }) {
  const [detail, setDetail] = useState(pec);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('info');
  const [selectedPvens, setSelectedPvens] = useState(new Set());
  const [searchPven, setSearchPven] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editEstado, setEditEstado] = useState(false);

  useEffect(() => { setDetail(pec); setTab('info'); setSelectedPvens(new Set()); }, [pec && pec.id]);

  const loadFull = async () => {
    if (!pec) return;
    setLoadingDetail(true);
    try { const d = await apiFetch('/compras/pedidos/' + pec.id); setDetail(d); }
    catch (e) { onToast(e.message, 'error'); }
    finally { setLoadingDetail(false); }
  };
  useEffect(() => { if (pec) loadFull(); }, [pec && pec.id]);

  const handleChangeEstado = async (est) => {
    try {
      await apiFetch('/compras/pedidos/' + pec.id, { method: 'PATCH', body: JSON.stringify({ estado: est }) });
      onToast('Estado actualizado'); onUpdate(); loadFull();
    } catch(e) { onToast(e.message, 'error'); }
    setEditEstado(false);
  };

  const handleDelete = async () => {
    if (!confirm('Cancelar este pedido de compra?')) return;
    try {
      await apiFetch('/compras/pedidos/' + pec.id, { method: 'PATCH', body: JSON.stringify({ estado: 'CANCELADO' }) });
      onToast('PEC cancelado'); onUpdate(); onClose();
    } catch(e) { onToast(e.message, 'error'); }
  };

  const handleConvertPvens = async () => {
    if (!selectedPvens.size) { onToast('Selecciona al menos un PVEN', 'error'); return; }
    const selected = pedidosVenta.filter(p => selectedPvens.has(p.id));
    const productos = selected.flatMap(p => (p.productos||[]).map(pr => ({ ...pr, pven_origen: p.numero })));
    try {
      const user = localStorage.getItem('user_name') || '';
      const newPec = await apiFetch('/compras/pedidos', { method: 'POST', body: JSON.stringify({
        ven_id: selected[0] && selected[0].id,
        ven_numero: selected.map(p => p.numero).join(', '),
        productos,
        notas: 'Consolidado de PVEN: ' + selected.map(p=>p.numero).join(', '),
        created_by: user,
      })});
      onToast('PEC ' + newPec.numero + ' creado con ' + selected.length + ' PVEN(s) consolidados');
      onUpdate();
    } catch(e) { onToast(e.message, 'error'); }
  };

  if (!pec) return null;
  const est = PEC_ESTADOS[detail && detail.estado] || PEC_ESTADOS.BORRADOR;
  const filteredPvens = pedidosVenta.filter(p =>
    p.estado === 'PENDIENTE_COMPRA' &&
    JSON.stringify(p).toLowerCase().includes(searchPven.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left:'240px'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-gray-900">{(detail && detail.numero) || pec.numero}</h2>
              <span className={'px-3 py-1 rounded-full text-xs font-black border ' + est.bg + ' ' + est.text + ' ' + est.border}>{est.label}</span>
              {pec.is_overdue && <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-black border border-red-200">VENCIDO</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{(detail && detail.supplier_name) || '-'}{pec.ven_numero && ' · VEN: ' + pec.ven_numero}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={()=>setMenuOpen(m=>!m)} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><MoreHorizontal size={20}/></button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-10">
                  <button onClick={()=>{setEditEstado(true);setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium flex items-center gap-2"><Edit2 size={13} className="text-purple-600"/> Cambiar Estado</button>
                  <Link href="/dashboard/compras/pedidos" className="block w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm font-medium text-blue-600" onClick={()=>setMenuOpen(false)}>Ver en Pedidos</Link>
                  <div className="border-t border-gray-100 my-1"/>
                  <button onClick={handleDelete} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm font-medium flex items-center gap-2 text-red-600"><Trash2 size={13}/> Cancelar PEC</button>
                </div>
              )}
            </div>
            <button onClick={onClose} className="p-2 hover:bg-gray-200 rounded-xl text-gray-500"><X size={20}/></button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-8 py-2 border-b border-gray-100 bg-white shrink-0">
          {[{k:'info',l:'Info PEC'},{k:'pvens',l:'Pedidos de Venta'},{k:'productos',l:'Productos'}].map(function(t){ return (
            <button key={t.k} onClick={()=>setTab(t.k)} className={'px-4 py-2 rounded-lg text-sm font-bold transition-all ' + (tab===t.k?'bg-purple-600 text-white shadow':'text-gray-600 hover:bg-purple-50 hover:text-purple-700')}>{t.l}</button>
          ); })}
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT 45% */}
          <div className="w-[45%] border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Proveedor</p>
              <p className="font-bold text-lg text-gray-900">{(detail && detail.supplier_name) || '-'}</p>
              {detail && detail.supplier_ref && <p className="text-xs text-gray-400 mt-0.5">Ref: {detail.supplier_ref}</p>}
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Fechas</p>
              <div className="space-y-2 text-sm">
                {[['Fecha Compra', fDate(detail && (detail.fecha_compra || detail.created_at))],
                  ['Entrega Estimada', fDate(detail && detail.fecha_entrega_estimada)],
                  ['Fecha Alerta', fDate(detail && detail.fecha_alerta)]].map(function(row,i){return(
                  <div key={i} className="flex justify-between"><span className="text-gray-500">{row[0]}</span><span className="font-bold">{row[1]}</span></div>
                );})}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Montos</p>
              <div className="flex justify-between py-1 border-b"><span className="text-gray-500 text-sm">Subtotal</span><span className="font-black">{fCOP(detail && detail.subtotal_cop)}</span></div>
              <div className="flex justify-between py-1"><span className="text-gray-500 text-sm">Total COP</span><span className="font-black text-gray-900">{fCOP(detail && detail.total_cop)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Pago & Logistica</p>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                {[['Modalidad',(detail&&detail.modalidad_pago)||'-'],['Carrier',(detail&&detail.carrier)||'-'],['Tracking',(detail&&detail.tracking_number)||'-']].map(function(r,i){return(
                  <div key={i}><span className="block text-gray-400 font-black uppercase mb-0.5">{r[0]}</span>{r[1]}</div>
                );})}
              </div>
            </div>
            {detail && detail.notas && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-black text-amber-700 uppercase mb-1">Notas</p>
                <p className="text-sm text-amber-900">{detail.notas}</p>
              </div>
            )}
          </div>

          {/* RIGHT 55% */}
          <div className="w-[55%] p-6 overflow-y-auto flex flex-col gap-4">
            {editEstado && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5">
                <p className="text-sm font-black text-purple-800 mb-3">Cambiar Estado del PEC</p>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(PEC_ESTADOS).map(function(entry){ const k=entry[0]; const v=entry[1]; return (
                    <button key={k} onClick={()=>handleChangeEstado(k)}
                      className={'px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ' + ((detail&&detail.estado===k)?v.bg+' '+v.text+' '+v.border+' shadow':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
                      {v.label}
                    </button>
                  ); })}
                </div>
                <button onClick={()=>setEditEstado(false)} className="text-xs text-gray-400 mt-3 hover:text-gray-600">Cancelar</button>
              </div>
            )}

            {tab==='info' && (
              <>
                {(detail && (detail.tracking_stages||[]).length > 0) && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Tracking</p>
                    <div className="space-y-3">
                      {detail.tracking_stages.map(function(stage,i){ return (
                        <div key={i} className={'flex items-center gap-3 p-3 rounded-xl border ' + (stage.status==='COMPLETADO'?'bg-emerald-50 border-emerald-200':stage.status==='EN_PROCESO'?'bg-blue-50 border-blue-200':'bg-gray-50 border-gray-200')}>
                          <div className={'w-7 h-7 rounded-full flex items-center justify-center shrink-0 ' + (stage.status==='COMPLETADO'?'bg-emerald-500':stage.status==='EN_PROCESO'?'bg-blue-500':'bg-gray-300')}>
                            {stage.status==='COMPLETADO'?<CheckCircle2 size={14} className="text-white"/>:<Clock size={14} className="text-white"/>}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{stage.label}</p>
                            {stage.timestamp && <p className="text-xs text-gray-500">{fDate(stage.timestamp)}</p>}
                          </div>
                          <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' + (stage.status==='COMPLETADO'?'bg-emerald-100 text-emerald-700':stage.status==='EN_PROCESO'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-500')}>{stage.status}</span>
                        </div>
                      ); })}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-black text-gray-400 uppercase mb-4">Historial de Actividad</p>
                  <div className="relative border-l-2 border-gray-100 ml-4 pl-6 pb-2">
                    {loadingDetail && <p className="text-gray-400 text-sm py-4">Cargando...</p>}
                    {(detail&&(detail.actividades||[])).map(function(a,i){ return (
                      <div key={i} className="mb-4 relative">
                        <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-purple-200"/>
                        <p className="text-xs text-gray-400 mb-0.5">{fDate(a.created_at)}{a.user_name && ' · ' + a.user_name}</p>
                        <p className="font-bold text-gray-700 text-sm">{a.description||a.action}</p>
                        {a.old_estado && a.new_estado && <p className="text-xs text-gray-400">{a.old_estado} → {a.new_estado}</p>}
                      </div>
                    ); })}
                    {!(detail&&detail.actividades&&detail.actividades.length) && !loadingDetail && <p className="text-gray-400 text-xs py-4 text-center">Sin historial</p>}
                  </div>
                </div>
              </>
            )}

            {tab==='pvens' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-800 mb-1">Consolidar Pedidos de Venta</p>
                  <p className="text-xs text-gray-500 mb-3">Selecciona 1 o varios PVEN en estado Pendiente Compra para convertirlos en una orden de compra</p>
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 gap-2">
                    <Search size={14} className="text-gray-400"/>
                    <input value={searchPven} onChange={e=>setSearchPven(e.target.value)} placeholder="Buscar PVEN..." className="text-sm bg-transparent outline-none flex-1"/>
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
                  {filteredPvens.length === 0 && (
                    <div className="py-10 text-center"><Package size={28} className="mx-auto mb-2 text-gray-300"/><p className="text-gray-400 text-sm">No hay PVEN en estado Pendiente Compra</p></div>
                  )}
                  {filteredPvens.map(function(p){ return (
                    <label key={p.id} className={'flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-purple-50 transition-colors ' + (selectedPvens.has(p.id)?'bg-purple-50/80':'')}>
                      <input type="checkbox" checked={selectedPvens.has(p.id)}
                        onChange={function(e){ const n=new Set(selectedPvens);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedPvens(n); }}
                        className="mt-1 rounded border-gray-300 text-purple-600"/>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{p.numero}</span>
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">PEND. COMPRA</span>
                        </div>
                        <p className="text-xs text-gray-500">{p.customer_name||'-'} · {fDate(p.created_at)}</p>
                        <p className="text-xs font-bold text-indigo-700 mt-0.5">{fCOP(p.total_cop||p.total||0)} · {(p.productos||[]).length} producto(s)</p>
                        {(p.productos||[]).slice(0,3).map(function(pr,i){ return <p key={i} className="text-[10px] text-gray-400">· {pr.descripcion||pr.producto_nombre||'Producto'}</p>; })}
                      </div>
                    </label>
                  ); })}
                </div>
                {selectedPvens.size > 0 && (
                  <div className="p-4 border-t border-gray-100 bg-purple-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-purple-800">{selectedPvens.size} PVEN seleccionado(s)</span>
                    <button onClick={handleConvertPvens} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                      <ShoppingCart size={14}/> Crear PEC Consolidado
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab==='productos' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100"><p className="text-xs font-black text-gray-400 uppercase">Productos del PEC</p></div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 font-black uppercase">
                    <tr><th className="px-5 py-3 text-left">Producto</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detail&&(detail.productos||[])).map(function(p,i){ return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900 max-w-[180px] truncate">{p.producto_nombre||p.descripcion||p.nombre||'-'}</td>
                        <td className="px-4 py-3 text-center font-bold">{p.qty||p.cantidad||0}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fCOP(p.unit_price_cop||p.precio_unitario||0)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fCOP((p.qty||p.cantidad||0)*(p.unit_price_cop||p.precio_unitario||0))}</td>
                      </tr>
                    ); })}
                    {!(detail&&detail.productos&&detail.productos.length) && <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-xs">Sin productos registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   MAIN COMPONENT — ComprasHub
   ============================================================ */
export default function ComprasHub() {
  const pathname = usePathname();
  const [activeTab, setActiveTab]     = useState('Pedidos de Compra');
  const [viewMode, setViewMode]       = useState('lista');
  const [loading, setLoading]         = useState(true);
  const [toast, setToast]             = useState(null);
  const [search, setSearch]           = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [groupByMonth, setGroupByMonth] = useState(false);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [pedidos, setPedidos]         = useState([]);
  const [pedidosVenta, setPedidosVenta] = useState([]);
  const [stats, setStats]             = useState({});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedPec, setSelectedPec] = useState(null);
  const [menuOpenId, setMenuOpenId]   = useState(null);
  const [analytics, setAnalytics]     = useState(null);
  const [analyticsRange, setAnalyticsRange] = useState('30d');
  const [chartType, setChartType]     = useState('bars');
  const [aiQuestion, setAiQuestion]   = useState('');
  const [aiResponse, setAiResponse]   = useState('');
  const [aiLoading, setAiLoading]     = useState(false);

  const showToast = (msg, type) => setToast({msg, type: type||'ok'});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all([
        apiFetch('/compras/pedidos?limit=200').catch(() => []),
        apiFetch('/compras/stats').catch(() => ({})),
        apiFetch('/ventas/pedidos?limit=200').catch(() => []),
      ]);
      setPedidos(Array.isArray(results[0]) ? results[0] : (results[0] && results[0].data ? results[0].data : []));
      setStats((results[1] && results[1].data) ? results[1].data : results[1] || {});
      setPedidosVenta(Array.isArray(results[2]) ? results[2] : (results[2] && results[2].data ? results[2].data : []));
    } catch(e) { showToast(e.message, 'error'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (activeTab === 'Analisis') loadAnalytics(); }, [activeTab, analyticsRange]);

  async function loadAnalytics() {
    try { const res = await apiFetch('/compras/stats'); setAnalytics((res && res.data) ? res.data : res); }
    catch(e) { showToast(e.message||'Error analytics', 'error'); }
  }

  async function handleAskAI() {
    if (!aiQuestion.trim()) return;
    setAiLoading(true); setAiResponse('');
    try {
      const res = await apiFetch('/ventas/ai-chat', { method:'POST', body:JSON.stringify({question: aiQuestion, context:{pedidos_count: pedidos.length, en_proceso: enProceso.length}}) });
      setAiResponse((res && res.response) || 'Asistente IA en configuracion.');
    } catch { setAiResponse('Asistente IA en configuracion. Intenta mas tarde.'); }
    setAiLoading(false);
  }

  async function handleBulkDelete() {
    if (!selectedIds.size || !confirm('Cancelar seleccionados?')) return;
    for (const id of Array.from(selectedIds)) {
      await apiFetch('/compras/pedidos/' + id, { method:'PATCH', body:JSON.stringify({estado:'CANCELADO'}) }).catch(()=>{});
    }
    showToast('Cancelados', 'ok'); setSelectedIds(new Set()); load();
  }

  const filteredData = useMemo(() => {
    let base = pedidos;
    if (search) base = base.filter(r => JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
    if (filterEstado) base = base.filter(r => r.estado === filterEstado);
    return base;
  }, [pedidos, search, filterEstado]);

  const enProceso  = pedidos.filter(p => ['EMITIDO','ENVIADO','EN_TRANSITO','PENDIENTE_ENTREGA'].includes(p.estado));
  const recibidos  = pedidos.filter(p => ['RECIBIDO','COMPLETADO'].includes(p.estado));
  const retrasados = pedidos.filter(p => p.is_overdue);
  const montoTotal = pedidos.filter(p=>p.estado!=='CANCELADO').reduce((s,p)=>s+(p.total_cop||0),0);

  const kpiCards = [
    { label:'PEC Activos',       value: enProceso.length,   color:'purple', icon: <Receipt size={22}/>,         sub: pedidos.length + ' total',      ok: true },
    { label:'Capital Compras',   value: fCOP(montoTotal),   color:'emerald', icon: <DollarSign size={22}/>,      sub:'Monto total activo',             ok: true },
    { label:'Retrasos Criticos', value: retrasados.length,  color:'red',    icon: <AlertTriangle size={22}/>,    sub:'Entrega vencida',               ok: retrasados.length===0 },
    { label:'Recibidos',         value: recibidos.length,   color:'teal',   icon: <CheckCircle2 size={22}/>,    sub:'Pedidos completados',            ok: true },
  ];

  const colorMap = {
    purple:  {bg:'bg-purple-50',  text:'text-purple-700',  border:'border-purple-200',  iconBg:'bg-purple-100'},
    emerald: {bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200', iconBg:'bg-emerald-100'},
    red:     {bg:'bg-red-50',     text:'text-red-700',     border:'border-red-200',     iconBg:'bg-red-100'},
    teal:    {bg:'bg-teal-50',    text:'text-teal-700',    border:'border-teal-200',    iconBg:'bg-teal-100'},
  };

  const groupedByMonth = useMemo(() => {
    const map = {};
    filteredData.forEach(p => {
      const key = fMonthKey(p.fecha_compra || p.created_at);
      if (!map[key]) map[key] = [];
      map[key].push(p);
    });
    return map;
  }, [filteredData]);

  const getKanbanCol = (item) => {
    const e = item.estado||'';
    if (e === 'CANCELADO') return 'Cancelado';
    if (['RECIBIDO','COMPLETADO'].includes(e)) return 'Recibido';
    if (['EN_TRANSITO','ENVIADO','PENDIENTE_ENTREGA'].includes(e)) return 'En Transito';
    return 'Emitido';
  };

  const handleDragStart = (e, id) => e.dataTransfer.setData('pecId', String(id));
  const handleDrop = async (e, col) => {
    const id = e.dataTransfer.getData('pecId'); if (!id) return;
    const m = { 'Emitido':'EMITIDO','En Transito':'EN_TRANSITO','Recibido':'RECIBIDO','Cancelado':'CANCELADO' };
    await apiFetch('/compras/pedidos/' + id, { method:'PATCH', body:JSON.stringify({estado: m[col]||'EMITIDO'}) }).catch(()=>{});
    load();
  };

  /* PEC table row */
  function PecRow({ p }) {
    const est = PEC_ESTADOS[p.estado] || PEC_ESTADOS.BORRADOR;
    const isSelected = selectedIds.has(p.id);
    return (
      <tr className={'hover:bg-purple-50/30 cursor-pointer group transition-colors ' + (p.is_overdue?'border-l-4 border-l-red-400 bg-red-50/20 ':'') + (isSelected?'bg-purple-50/40':'')}
        onClick={function(e){ const t=e.target as HTMLElement; if (t.closest('input')||t.closest('button')||t.closest('a')) return; setSelectedPec(p); }}>
        <td className="px-5 py-3.5">
          <input type="checkbox" className="rounded border-gray-300 text-purple-600" checked={isSelected}
            onChange={function(e){ const n=new Set(selectedIds);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedIds(n); }}/>
        </td>
        <td className="px-4 py-3.5">
          <span className="font-black text-purple-700 text-sm">{p.numero}</span>
          {p.ven_numero && <p className="text-[10px] text-indigo-600 font-bold">{p.ven_numero}</p>}
          {p.is_overdue && <span className="ml-1 text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-black">VENCIDO</span>}
        </td>
        <td className="px-4 py-3.5 font-bold text-gray-900">{p.supplier_name||'-'}</td>
        <td className="px-4 py-3.5 text-gray-500 text-xs">{p.created_by||'-'}</td>
        <td className="px-4 py-3.5 font-black text-gray-900">{fCOP(p.total_cop||0)}</td>
        <td className="px-4 py-3.5 text-gray-500 text-xs">{fDate(p.fecha_compra||p.created_at)}</td>
        <td className="px-4 py-3.5"><span className={'text-xs font-bold ' + (p.is_overdue?'text-red-600':'text-gray-700')}>{fDate(p.fecha_entrega_estimada)}</span></td>
        <td className="px-4 py-3.5 text-xs text-gray-500">{fDate(p.fecha_alerta)}</td>
        <td className="px-4 py-3.5">
          <span className={'px-2.5 py-1 rounded-full text-xs font-black border ' + est.bg + ' ' + est.text + ' ' + est.border}>{est.label}</span>
        </td>
        <td className="px-4 py-3.5 font-black text-gray-900 text-right">{fCOP(p.total_cop||0)}</td>
        <td className="px-4 py-3.5 relative">
          <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <button onClick={function(e){e.stopPropagation();setSelectedPec(p);}} className="p-1.5 rounded-lg bg-purple-50 text-purple-600 hover:bg-purple-100" title="Ver detalle"><Eye size={13}/></button>
            <div className="relative">
              <button onClick={function(e){e.stopPropagation();setMenuOpenId(menuOpenId===p.id?null:p.id);}} className="p-1.5 rounded-lg bg-gray-100 text-gray-600 hover:bg-gray-200"><MoreHorizontal size={13}/></button>
              {menuOpenId===p.id && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-48 z-20" onClick={function(e){e.stopPropagation();}}>
                  <button onClick={function(){setSelectedPec(p);setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm flex items-center gap-2"><Eye size={13} className="text-purple-600"/> Ver Detalle</button>
                  <button onClick={async function(){try{await apiFetch('/compras/pedidos/'+p.id,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO'})});showToast('Cancelado','ok');load();}catch(ex:any){showToast(ex.message,'error');}setMenuOpenId(null);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar</button>
                </div>
              )}
            </div>
          </div>
        </td>
      </tr>
    );
  }

  /* Table headers */
  const TABLE_HEADERS = ['#PEC','Proveedor','Comprador','Monto','F. Compra','F. Entrega Est.','F. Limite Alerta','Estado','Total','Acciones'];

  /* ═══ RETURN JSX ═══ */
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={()=>setToast(null)}/>}
      {selectedPec && (
        <PecDetailPanel
          pec={selectedPec}
          pedidosVenta={pedidosVenta}
          onClose={()=>setSelectedPec(null)}
          onUpdate={load}
          onToast={showToast}
        />
      )}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto">
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0">COMPRAS:</span>
        {SUB_MODULES.map(function(m){ return (
          <Link key={m.name} href={m.path}
            className={'shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ' + (pathname===m.path?'bg-purple-600 text-white border-purple-600':'text-gray-600 hover:bg-purple-50 hover:text-purple-700 border-transparent')}>
            {m.name}
          </Link>
        ); })}
      </div>

      {/* Alert banner */}
      {retrasados.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-center gap-3">
          <ShieldAlert className="text-orange-600 shrink-0" size={18}/>
          <div className="flex-1 flex flex-wrap gap-2 text-xs font-bold text-orange-700">
            <span className="bg-orange-100 border border-orange-200 px-2.5 py-1 rounded-full">{retrasados.length} PEC con entrega vencida — Riesgo de cadena de suministro</span>
          </div>
          <Link href="/dashboard/compras/transito" className="shrink-0 text-xs text-orange-700 font-bold border border-orange-300 px-3 py-1.5 rounded-lg hover:bg-orange-100">Gestionar</Link>
        </div>
      )}

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="bg-purple-600 text-white p-3 rounded-2xl shadow-lg"><ShoppingBag size={28}/></div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Hub de Compras</h1>
              <p className="text-sm text-gray-500 mt-0.5">PEC · Proveedores · Inventario en Transito · Cadena de Suministro</p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-1">
            <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
              <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <Link href="/dashboard/compras/pedidos" className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-semibold text-sm shadow-sm">
              <Plus size={14}/> Nuevo PEC
            </Link>
            {retrasados.length>0 && (
              <div className="flex items-center gap-1.5 px-3 py-2 bg-orange-50 border border-orange-200 rounded-xl text-sm font-bold text-orange-700">
                <Bell size={14}/>{retrasados.length} alertas
              </div>
            )}
          </div>
        </div>

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {kpiCards.map(function(k,i){
              const c = colorMap[k.color] || colorMap.purple;
              return (
                <div key={i} className={'bg-white rounded-2xl p-5 border shadow-sm hover:shadow-md transition-all ' + (k.ok?'border-gray-200':'border-red-200')}>
                  <div className={'inline-flex p-2.5 rounded-xl mb-3 ' + c.iconBg + ' ' + c.text}>{k.icon}</div>
                  <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-3xl font-black text-gray-900 mb-1">{k.value}</p>
                  <p className={'text-xs font-semibold flex items-center gap-1 ' + (k.ok?'text-emerald-600':'text-red-500')}>
                    {k.ok?<CheckCircle2 size={11}/>:<AlertCircle size={11}/>}{k.sub}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TABS ROW — pill format as per image */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            {['Pedidos de Compra','Analisis'].map(function(tab){ return (
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={'px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ' + (activeTab===tab?'bg-purple-600 text-white shadow':'text-gray-600 hover:text-purple-700 hover:bg-purple-50')}>
                {tab}
                {tab==='Pedidos de Compra' && (
                  <span className={'ml-1.5 text-xs font-black ' + (activeTab===tab?'text-purple-200':'text-gray-400')}>{pedidos.length}</span>
                )}
              </button>
            ); })}
          </div>
          {activeTab !== 'Analisis' && (
            <div className="flex items-center gap-2">
              <button onClick={()=>setGroupByMonth(function(g){return !g;})}
                className={'flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ' + (groupByMonth?'bg-purple-50 border-purple-300 text-purple-700':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Calendar size={13}/> Agrupar mes
              </button>
              <div className="flex items-center bg-gray-100 rounded-xl p-1">
                <button onClick={()=>setViewMode('lista')} className={'p-2 rounded-lg transition-colors ' + (viewMode==='lista'?'bg-white shadow text-purple-700':'text-gray-500 hover:bg-white/50')} title="Lista">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1" fill="currentColor"/><circle cx="3" cy="12" r="1" fill="currentColor"/><circle cx="3" cy="18" r="1" fill="currentColor"/></svg>
                </button>
                <button onClick={()=>setViewMode('kanban')} className={'p-2 rounded-lg transition-colors ' + (viewMode==='kanban'?'bg-white shadow text-purple-700':'text-gray-500 hover:bg-white/50')} title="Kanban">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER */}
        {activeTab !== 'Analisis' && (
          <div className="flex items-center gap-3">
            <div className="flex items-center bg-white border border-gray-200 rounded-xl px-4 py-2.5 shadow-sm gap-2 flex-1 max-w-[500px]">
              <Search size={15} className="text-gray-400 shrink-0"/>
              <input value={search} onChange={function(e){setSearch(e.target.value);}}
                placeholder="Buscar por PEC, proveedor, VEN numero..."
                className="text-sm outline-none flex-1 bg-transparent text-gray-700 placeholder-gray-400"/>
              {search && <button onClick={()=>setSearch('')}><X size={13} className="text-gray-400 hover:text-gray-600"/></button>}
            </div>
            <div className="relative">
              <button onClick={()=>setShowFilters(function(f){return !f;})}
                className={'flex items-center gap-2 px-4 py-2.5 rounded-xl border text-sm font-semibold shadow-sm bg-white transition-colors ' + (filterEstado?'border-purple-400 text-purple-700 bg-purple-50':'border-gray-200 text-gray-600 hover:bg-gray-50')}>
                <Filter size={14}/> Filtrar Estado
                {filterEstado && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-gray-400 uppercase mb-2">Por Estado</p>
                  <select value={filterEstado} onChange={function(e){setFilterEstado(e.target.value);}}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none mb-3 focus:ring-2 focus:ring-purple-200">
                    <option value="">Todos los estados</option>
                    {Object.entries(PEC_ESTADOS).map(function(entry){ return <option key={entry[0]} value={entry[0]}>{entry[1].label}</option>; })}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-red-500 hover:text-red-700 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>
            <p className="text-sm text-gray-400 font-medium ml-1">{filteredData.length} registros</p>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-purple-600 mx-auto mb-3"/>
              <p className="text-sm text-gray-400 font-medium">Cargando datos...</p>
            </div>
          </div>

        ) : activeTab === 'Analisis' ? (
          /* ── ANALYTICS ── */
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-2xl border border-gray-200 shadow-sm">
              <span className="text-xs font-black text-gray-400 uppercase mr-1">Periodo:</span>
              {[{k:'7d',l:'Ultimos 7 dias'},{k:'30d',l:'Ultimo mes'},{k:'90d',l:'Trimestre'},{k:'180d',l:'Semestre'},{k:'1y',l:'Ultimo Ano'},{k:'custom',l:'Personalizado'}].map(function(item){ return (
                <button key={item.k} onClick={()=>setAnalyticsRange(item.k)}
                  className={'px-3 py-1.5 rounded-lg text-sm font-bold ' + (analyticsRange===item.k?'bg-purple-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{item.l}</button>
              ); })}
              <div className="h-6 w-px bg-gray-200 mx-1"/>
              <span className="text-xs font-black text-gray-400 uppercase">Grafico:</span>
              {[{k:'bars',l:'Barras'},{k:'lines',l:'Lineas'},{k:'pie',l:'Torta'}].map(function(item){ return (
                <button key={item.k} onClick={()=>setChartType(item.k)}
                  className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (chartType===item.k?'bg-indigo-600 text-white':'bg-gray-100 text-gray-600 hover:bg-gray-200')}>{item.l}</button>
              ); })}
              <button onClick={loadAnalytics} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 ml-auto">
                <RefreshCw size={13}/> Analizar
              </button>
            </div>

            <div className="grid grid-cols-4 gap-4">
              {[
                {label:'Total PEC',       value: String(pedidos.length)},
                {label:'Monto Total COP', value: fCOP(montoTotal)},
                {label:'En Proceso',      value: String(enProceso.length)},
                {label:'Recibidos',       value: String(recibidos.length)},
              ].map(function(k,i){ return (
                <div key={i} className="bg-white p-5 rounded-2xl border border-gray-200 shadow-sm">
                  <p className="text-gray-400 text-xs font-black uppercase mb-2">{k.label}</p>
                  <p className="text-2xl font-black text-gray-900">{k.value}</p>
                </div>
              ); })}
            </div>

            <div className="grid grid-cols-2 gap-5">
              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-purple-600"/> Compras por Estado</h3>
                <div className="flex flex-col gap-3 h-64 overflow-y-auto">
                  {Object.entries(PEC_ESTADOS).filter(function(entry){ return pedidos.filter(function(p){return p.estado===entry[0];}).length > 0; }).map(function(entry){
                    const k=entry[0]; const v=entry[1];
                    const count = pedidos.filter(function(p){return p.estado===k;}).length;
                    const maxCount = Math.max.apply(null, Object.keys(PEC_ESTADOS).map(function(s){ return pedidos.filter(function(p){return p.estado===s;}).length; }).concat([1]));
                    return (
                      <div key={k} className="flex items-center gap-3">
                        <div className="w-28 text-xs text-gray-500 shrink-0">{v.label}</div>
                        <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                          <div className={v.bg + ' h-full rounded-full flex items-center justify-end pr-2'} style={{width: String(Math.round((count/maxCount)*100)) + '%'}}>
                            <span className="text-[10px] font-black text-gray-700">{count}</span>
                          </div>
                        </div>
                        <div className="w-8 text-right text-xs font-bold text-gray-700">{count}</div>
                      </div>
                    );
                  })}
                  {!pedidos.length && <p className="text-gray-400 text-sm text-center py-8">Sin datos. Presiona Analizar.</p>}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
                <h3 className="font-black text-gray-800 mb-3">Top Proveedores</h3>
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-left text-xs text-gray-400 font-black uppercase"><th className="pb-2">#</th><th>Proveedor</th><th className="text-right">PECs</th><th className="text-right">Total</th></tr></thead>
                  <tbody>
                    {Object.entries(pedidos.reduce(function(acc: Record<string,{count:number,total:number}>, p: any){ const k=p.supplier_name||'Sin proveedor'; if(!acc[k])acc[k]={count:0,total:0}; acc[k].count++; acc[k].total+=p.total_cop||0; return acc; },{} as Record<string,{count:number,total:number}>)).sort(function(a: any,b: any){return b[1].total-a[1].total;}).slice(0,8).map(function(entry: any,i: number){ return (
                      <tr key={i} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="py-2 text-gray-400 font-bold">{i+1}</td>
                        <td className="py-2 font-medium truncate max-w-[120px]">{entry[0]}</td>
                        <td className="py-2 text-right text-gray-500">{entry[1].count}</td>
                        <td className="py-2 text-right font-bold">{fCOP(entry[1].total)}</td>
                      </tr>
                    ); })}
                    {!pedidos.length && <tr><td colSpan={4} className="text-center py-6 text-gray-400 text-xs">Sin datos</td></tr>}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
              <h3 className="font-black text-gray-800 mb-4 flex items-center gap-2"><MessageSquare size={18} className="text-purple-600"/> AI Compras Assistant</h3>
              <div className="flex gap-2 mb-4">
                <input value={aiQuestion} onChange={function(e){setAiQuestion(e.target.value);}} onKeyDown={function(e){if(e.key==='Enter')handleAskAI();}}
                  placeholder="Ej: Que proveedor tuvo mas retrasos? Cuanto gastamos en compras este mes?"
                  className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                <button onClick={handleAskAI} disabled={aiLoading}
                  className="bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
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
              Object.entries(groupedByMonth).map(function(entry){
                const month=entry[0]; const rows=entry[1];
                const isOpen = expandedMonths.has(month);
                return (
                  <div key={month}>
                    <button onClick={function(){ const n=new Set(expandedMonths); if(n.has(month)) n.delete(month); else n.add(month); setExpandedMonths(n); }}
                      className="w-full flex items-center justify-between px-6 py-3 bg-gray-50 border-b border-gray-200 hover:bg-purple-50/50 transition-colors">
                      <span className="font-black text-gray-700 text-sm capitalize">{month}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 font-bold">{(rows as any[]).length} pedido(s) · {fCOP((rows as any[]).reduce(function(s:number,r:any){return s+(r.total_cop||0);},0))}</span>
                        {isOpen ? <ChevronUp size={16} className="text-gray-400"/> : <ChevronRight size={16} className="text-gray-400"/>}
                      </div>
                    </button>
                    {isOpen && (
                      <table className="w-full text-left text-sm">
                        <thead className="bg-gray-50/50 border-b border-gray-100">
                          <tr>
                            <th className="px-5 py-3 w-10"/>
                            {TABLE_HEADERS.map(function(h,i){ return <th key={i} className={'px-4 py-3 text-xs font-black text-gray-400 uppercase' + (i===TABLE_HEADERS.length-1?' text-center':i>=4?' ':'')}>{h}</th>; })}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {(rows as any[]).map(function(p: any){ return <PecRow key={p.id} p={p}/>; })}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    <th className="px-5 py-3.5 w-10">
                      <input type="checkbox" className="rounded border-gray-300"
                        onChange={function(e){if(e.target.checked)setSelectedIds(new Set(filteredData.map(function(d){return d.id;})));else setSelectedIds(new Set());}}
                        checked={selectedIds.size===filteredData.length&&filteredData.length>0}/>
                    </th>
                    {TABLE_HEADERS.map(function(h,i){ return <th key={i} className={'px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide' + (i===TABLE_HEADERS.length-1?' text-center':'')}>{h}</th>; })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {filteredData.length===0 && (
                    <tr><td colSpan={11} className="text-center py-16 text-gray-400">
                      <Activity size={32} className="mx-auto mb-3 opacity-30"/>
                      <p className="font-medium">{search?'Sin resultados para "'+search+'"':loading?'Cargando...':'Sin pedidos de compra'}</p>
                    </td></tr>
                  )}
                  {filteredData.map(function(p){ return <PecRow key={p.id} p={p}/>; })}
                </tbody>
              </table>
            )}
            <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-400 font-medium flex items-center justify-between">
              <span>{filteredData.length} de {pedidos.length} registros</span>
              {selectedIds.size>0 && <span className="text-purple-600 font-bold">{selectedIds.size} seleccionados</span>}
            </div>
          </div>

        ) : (
          /* ── KANBAN ── */
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4">
            {['Emitido','En Transito','Recibido','Cancelado'].map(function(col){ return (
              <div key={col} className="w-80 flex-shrink-0 flex flex-col bg-white border border-gray-200 rounded-2xl shadow-sm"
                onDragOver={function(e){e.preventDefault();}} onDrop={function(e){handleDrop(e,col);}}>
                <div className="p-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-black text-gray-700">{col}</h3>
                  <span className="bg-gray-100 text-gray-600 text-xs font-bold px-2 py-0.5 rounded-full">{filteredData.filter(function(d){return getKanbanCol(d)===col;}).length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2 min-h-[200px]">
                  {filteredData.filter(function(d){return getKanbanCol(d)===col;}).map(function(p,i){
                    const est = PEC_ESTADOS[p.estado]||PEC_ESTADOS.BORRADOR;
                    return (
                      <div key={i} draggable onDragStart={function(e){handleDragStart(e,p.id);}} onClick={function(){setSelectedPec(p);}}
                        className={'bg-white p-4 rounded-xl shadow-sm border cursor-grab active:cursor-grabbing hover:border-purple-300 transition-colors group ' + (p.is_overdue?'border-red-300 bg-red-50/30':'border-gray-200')}>
                        <div className="flex justify-between items-start mb-1.5">
                          <span className="font-bold text-gray-900 text-sm">{p.numero}</span>
                          {p.is_overdue && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded font-black">VENCIDO</span>}
                        </div>
                        <p className="text-xs text-gray-500 mb-1 truncate">{p.supplier_name||'-'}</p>
                        {p.ven_numero && <p className="text-[10px] text-indigo-600 font-bold mb-1">VEN: {p.ven_numero}</p>}
                        <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                          <span className="font-bold text-xs text-purple-700">{fCOP(p.total_cop||0)}</span>
                          <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + est.bg + ' ' + est.text}>{est.label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter(function(d){return getKanbanCol(d)===col;}).length===0 && <p className="text-center text-xs text-gray-300 font-medium py-8">Arrastra aqui</p>}
                </div>
              </div>
            ); })}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size>0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-gray-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-gray-700">
            <span className="font-bold text-sm bg-gray-800 px-3 py-1 rounded-full">{selectedIds.size} seleccionados</span>
            <button onClick={handleBulkDelete} className="bg-red-500/20 text-red-400 hover:bg-red-500/40 p-2 rounded-xl flex items-center gap-2 text-sm font-bold"><Trash2 size={16}/> Cancelar</button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-2 text-gray-400 hover:text-white"><X size={16}/></button>
          </div>
        )}

      </div>
    </div>
  );
}
