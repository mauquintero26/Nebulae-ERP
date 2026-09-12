// @ts-nocheck
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
  ChevronRight, ChevronUp, Plus, Eye, ShoppingCart,
  Bot, Sparkles, RotateCcw, PieChart, Award, Settings, Check, LayoutGrid, List, ArrowLeft
} from 'lucide-react';

import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
async function apiFetch(path: string, opts: any = {}) {
  const res = await _apiFetch(path, opts);
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
  const [activeTab, setActiveTab]         = useState('Todos');
  const [viewMode, setViewMode]           = useState('lista');
  const [loading, setLoading]             = useState(true);
  const [toast, setToast]                 = useState(null);
  const [search, setSearch]               = useState('');
  const [filterEstado, setFilterEstado]   = useState('');
  const [showFilters, setShowFilters]     = useState(false);
  const [groupByMonth, setGroupByMonth]   = useState(false);
  const [expandedMonths, setExpandedMonths] = useState(new Set());
  const [pedidos, setPedidos]             = useState([]);
  const [pedidosVenta, setPedidosVenta]   = useState([]);
  const [stats, setStats]                 = useState({});
  const [selectedIds, setSelectedIds]     = useState(new Set());
  const [selectedPec, setSelectedPec]     = useState(null);
  const [menuOpenId, setMenuOpenId]       = useState(null);
  const [quickFilter, setQuickFilter]     = useState('todos');
  const [pecAlertDias, setPecAlertDias]   = useState(5);
  const [showConfig, setShowConfig]       = useState(false);
  const [donutMode, setDonutMode]         = useState('estados');
  const [topSuppliersLimit, setTopSuppliersLimit] = useState(5);
  const [aiChatHistory, setAiChatHistory] = useState([
    { role: 'ia', text: '¡Hola! Soy Nebulae AI Copilot para HUB Compras. Pregúntame sobre tiempos de entrega de proveedores, PECs en tránsito o riesgo de suministros.', time: 'Ahora' }
  ]);
  const [aiQuery, setAiQuery]             = useState('');
  const [aiLoading, setAiLoading]         = useState(false);

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

  function handleAiQuestion(customQ?: string) {
    const q = (customQ || aiQuery).trim();
    if (!q) return;
    setAiLoading(true);
    const nowTime = new Date().toLocaleTimeString('es-CO', {hour:'2-digit', minute:'2-digit'});
    setAiChatHistory(prev => [...prev, { role: 'user', text: q, time: nowTime }]);
    if (!customQ) setAiQuery('');

    setTimeout(() => {
      const total = pedidos.length || 1;
      const rec = pedidos.filter(p => ['RECIBIDO','COMPLETADO'].includes(p.estado)).length;
      const act = enProceso.length;
      const canc = pedidos.filter(p => p.estado === 'CANCELADO').length;
      const cumRatio = ((rec / total) * 100).toFixed(1);
      const cancRate = ((canc / total) * 100).toFixed(1);

      const suppCounts: Record<string, {count: number, total: number}> = {};
      pedidos.forEach(p => {
        const s = p.supplier_name || 'Sin proveedor';
        if (!suppCounts[s]) suppCounts[s] = { count: 0, total: 0 };
        suppCounts[s].count += 1;
        suppCounts[s].total += (p.total_cop || 0);
      });
      const sortedSupp = Object.entries(suppCounts).sort((a,b)=>b[1].total - a[1].total);
      const topSupp = sortedSupp[0];
      const topSuppName = topSupp ? topSupp[0] : 'N/A';
      const topSuppAmount = topSupp ? fCOP(topSupp[1].total) : '$0';

      let aiReply = '';
      const qLower = q.toLowerCase();

      if (qLower.includes('diagnóstico') || qLower.includes('cumplimiento') || qLower.includes('tasa') || qLower.includes('tiempo')) {
        aiReply = `📊 **Diagnóstico del Ciclo de Compras (PEC):**\n\n` +
          `• **Total de Pedidos de Compra (PEC):** ${total}\n` +
          `• **Tasa de Cumplimiento / Entregas Recibidas:** **${cumRatio}%** (${rec} completados satisfactoriamente).\n` +
          `• **Compras en Curso / Tránsito:** **${act}** en proceso de entrega.\n` +
          `• **Alertas de Retraso:** **${retrasados.length}** pedidos con fecha límite excedida.\n\n` +
          `💡 **Recomendación:** Da seguimiento prioritario a los ${retrasados.length} PEC atrasados para evitar retrasos en el despacho a clientes de Nebulae Kids.`;
      } else if (qLower.includes('proveedor') || qLower.includes('top') || qLower.includes('volumen') || qLower.includes('gasto')) {
        aiReply = `🏭 **Comportamiento de Proveedores:**\n\n` +
          `• El proveedor con mayor volumen de compra es **${topSuppName}** con **${topSuppAmount}** adjudicados.\n` +
          `• Hay **${Object.keys(suppCounts).length} proveedores activos** registrados en el sistema.\n` +
          `• Consulta el ranking interactivo de **Top Proveedores** abajo para ver el desempeño y desglose de estados por cada uno.`;
      } else if (qLower.includes('transito') || qLower.includes('camino') || qLower.includes('despacho') || qLower.includes('casillero')) {
        aiReply = `🚚 **Mercancía en Tránsito:**\n\n` +
          `• Hay **${pedidos.filter(p=>p.estado==='EN_TRANSITO').length} PECs navegando la ruta logística** hacia almacén.\n` +
          `• El capital acumulado en tránsito asciende a **${fCOP(pedidos.filter(p=>p.estado==='EN_TRANSITO').reduce((s,p)=>s+(p.total_cop||0),0))}**.\n` +
          `• Te sugerimos revisar el módulo de *Mercancía en Tránsito* para auditar guías internacionales y tramos de casillero.`;
      } else {
        aiReply = `🔍 **Análisis para "${q}":**\n\n` +
          `• En base a los **${total} PECs** registrados, se han recibido **${rec}** exitosamente y **${act}** están en proceso activo.\n` +
          `• El proveedor principal es **${topSuppName}** con **${topSuppAmount}** en compras.\n` +
          `• Contamos con un capital total invertido de **${fCOP(montoTotal)}**.\n\n` +
          `¿Deseas auditar algún proveedor o número de PEC en particular?`;
      }

      setAiChatHistory(prev => [...prev, { role: 'ia', text: aiReply, time: nowTime }]);
      setAiLoading(false);
    }, 450);
  }

  async function handleBulkDelete() {
    if (!selectedIds.size || !confirm('Cancelar seleccionados?')) return;
    for (const id of Array.from(selectedIds)) {
      await apiFetch('/compras/pedidos/' + id, { method:'PATCH', body:JSON.stringify({estado:'CANCELADO'}) }).catch(()=>{});
    }
    showToast('Cancelados', 'ok'); setSelectedIds(new Set()); load();
  }

  const enProceso  = useMemo(() => pedidos.filter(p => ['BORRADOR','EMITIDO','ENVIADO','EN_TRANSITO','PENDIENTE_ENTREGA'].includes(p.estado)), [pedidos]);
  const recibidos  = useMemo(() => pedidos.filter(p => ['RECIBIDO','COMPLETADO'].includes(p.estado)), [pedidos]);
  const cancelados = useMemo(() => pedidos.filter(p => p.estado === 'CANCELADO'), [pedidos]);
  const retrasados = useMemo(() => pedidos.filter(p => p.is_overdue || (p.fecha_entrega_estimada && new Date(p.fecha_entrega_estimada) < new Date() && !['RECIBIDO','COMPLETADO','CANCELADO'].includes(p.estado))), [pedidos]);
  const montoTotal = useMemo(() => pedidos.filter(p=>p.estado!=='CANCELADO').reduce((s,p)=>s+(p.total_cop||0),0), [pedidos]);

  const noResueltosList = enProceso;
  const accionesTomadasList = useMemo(() => pedidos.filter(p => ['RECIBIDO','COMPLETADO','CANCELADO'].includes(p.estado)), [pedidos]);

  const filteredData = useMemo(() => {
    let base = pedidos;
    if (quickFilter === 'atrasados') {
      base = retrasados;
    } else if (quickFilter === 'no_resueltos') {
      base = noResueltosList;
    }

    if (activeTab === 'No_Resueltos') {
      base = noResueltosList;
    } else if (activeTab === 'Pedidos de Compra') {
      base = pedidos.filter(p => ['BORRADOR','EMITIDO'].includes(p.estado));
    } else if (activeTab === 'Transito') {
      base = pedidos.filter(p => ['ENVIADO','EN_TRANSITO'].includes(p.estado));
    } else if (activeTab === 'Recepciones') {
      base = pedidos.filter(p => ['PENDIENTE_ENTREGA','RECIBIDO'].includes(p.estado));
    } else if (activeTab === 'Acciones_Tomadas') {
      base = accionesTomadasList;
    }

    if (search) {
      base = base.filter(r => (r.numero||'').toLowerCase().includes(search.toLowerCase()) || (r.supplier_name||'').toLowerCase().includes(search.toLowerCase()) || (r.ven_numero||'').toLowerCase().includes(search.toLowerCase()) || (r.created_by||'').toLowerCase().includes(search.toLowerCase()));
    }
    if (filterEstado) base = base.filter(r => r.estado === filterEstado);
    return base;
  }, [pedidos, search, filterEstado, quickFilter, activeTab, noResueltosList, accionesTomadasList, retrasados]);

  const tasaCumplimiento = pedidos.length > 0 ? (((recibidos.length) / pedidos.length) * 100).toFixed(1) : '100';

  const kpiCards = [
    { label:'Capital Compras',   value: fCOP(montoTotal),   color:'purple', icon: <DollarSign size={22}/>,      sub:'Inversión activa en suministros', ok: true },
    { label:'PEC Activos',       value: enProceso.length,   color:'indigo', icon: <Receipt size={22}/>,         sub: retrasados.length > 0 ? `${retrasados.length} atrasados` : 'Al día', ok: retrasados.length === 0 },
    { label:'En Tránsito / Entregas', value: pedidos.filter(p=>['EN_TRANSITO','PENDIENTE_ENTREGA'].includes(p.estado)).length, color:'amber', icon: <Truck size={22}/>, sub: 'Navegando ruta logística', ok: true },
    { label:'Cumplimiento',      value: `${tasaCumplimiento}%`, color:'emerald', icon: <CheckCircle2 size={22}/>, sub:`${recibidos.length} recibidos satisfactoriamente`, ok: true },
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
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-xs sticky top-0 z-30">
        <Link href="/dashboard/compras" className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-slate-500 hover:bg-slate-100 border border-slate-200 mr-2 transition-colors">
          <ArrowLeft size={12}/> Hub
        </Link>
        <div className="w-px h-4 bg-slate-200 mr-1 shrink-0"/>
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">HUB DE COMPRAS:</span>
        {SUB_MODULES.map(function(m){ return (
          <Link key={m.name} href={m.path}
            className={'shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-colors border ' + (pathname===m.path?'bg-purple-600 text-white border-purple-600':'text-slate-600 hover:bg-purple-50 hover:text-purple-700 border-transparent hover:border-purple-200')}>
            {m.name}
          </Link>
        ); })}
      </div>

      {/* ALERT BANNER — SEMÁFORO DE RESOLUCIÓN DE COMPRAS */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl flex items-center justify-center ${retrasados.length > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {retrasados.length > 0 ? <ShieldAlert size={18}/> : <CheckCircle2 size={18}/>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">Semáforo de Resolución de Suministros:</h2>
              <span className="text-xs font-medium text-slate-500">Regla de entrega: máx {pecAlertDias} días límite</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1 text-xs">
              <span className={`px-2.5 py-0.5 rounded-full font-bold border ${retrasados.length > 0 ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                🔴 {retrasados.length} Atrasados (+{pecAlertDias}d)
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                🟡 {noResueltosList.length} No Resueltos / En Tránsito
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
            Filtrar Atrasados ({retrasados.length})
          </button>
          <button onClick={()=>setQuickFilter(quickFilter === 'no_resueltos' ? 'todos' : 'no_resueltos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'no_resueltos' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-slate-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>
            No Resueltos ({noResueltosList.length})
          </button>
          <button onClick={()=>setQuickFilter('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'todos' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            Ver Todo
          </button>
          <button onClick={()=>setShowConfig(true)} className="text-xs text-purple-600 hover:text-purple-800 font-bold border border-purple-200 px-3 py-1.5 rounded-xl hover:bg-purple-50 transition-colors">
            Ajustar Tiempos
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER ROW */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="bg-gradient-to-tr from-purple-700 to-purple-500 text-white p-3.5 rounded-2xl shadow-md">
              <ShoppingBag size={28}/>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">HUB de Compras</h1>
                <span className="px-2.5 py-0.5 rounded-full text-xs font-black bg-purple-50 text-purple-700 border border-purple-200">Nebulae Kids</span>
              </div>
              <p className="text-xs sm:text-sm text-slate-500 mt-0.5">Control Unificado del Ciclo de Suministros: Lista → Pedido (PEC) → Tránsito → Recepción en Bodega</p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            <Link href="/dashboard/compras/pedidos"
              className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all">
              <Plus size={15}/> Nuevo PEC
            </Link>
            <button onClick={load}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs shadow-xs transition-colors">
              <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <button onClick={()=>setShowConfig(true)}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-purple-50 hover:text-purple-700 hover:border-purple-200 font-semibold text-xs shadow-xs transition-colors">
              <Settings size={13}/> Configuración
            </button>
          </div>
        </div>

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((k,i)=>{
              const c=colorMap[k.color]||colorMap.purple;
              return (
                <div key={i} className={`bg-white rounded-2xl p-5 border shadow-xs hover:shadow-md transition-all ${k.ok?'border-slate-200':'border-rose-200 bg-rose-50/20'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${c.iconBg} ${c.text}`}>{k.icon}</div>
                    <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-full ${k.ok?'bg-slate-100 text-slate-600':'bg-rose-100 text-rose-700'}`}>
                      {k.ok ? 'Óptimo' : 'Alerta'}
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
              { id: 'Todos',              label: 'Todos',               count: pedidos.length },
              { id: 'No_Resueltos',       label: '🚨 No Resueltos',     count: noResueltosList.length, alert: retrasados.length > 0 },
              { id: 'Pedidos de Compra',  label: 'Pedidos Compra (PEC)',count: pedidos.filter(p=>['BORRADOR','EMITIDO'].includes(p.estado)).length },
              { id: 'Transito',           label: 'En Tránsito',         count: pedidos.filter(p=>['ENVIADO','EN_TRANSITO'].includes(p.estado)).length },
              { id: 'Recepciones',        label: 'Recepciones',         count: pedidos.filter(p=>['PENDIENTE_ENTREGA','RECIBIDO'].includes(p.estado)).length },
              { id: 'Acciones_Tomadas',   label: '✅ Acciones Tomadas', count: accionesTomadasList.length },
              { id: 'Analisis',           label: '📊 Análisis Funcional',count: null },
            ].map(tab=>(
              <button key={tab.id} onClick={()=>{setActiveTab(tab.id);setSelectedIds(new Set());}}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab===tab.id?'bg-purple-600 text-white shadow-xs':'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeTab===tab.id?'bg-purple-500 text-white':tab.alert?'bg-rose-100 text-rose-700':'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-2">
              <button onClick={()=>setGroupByMonth(g=>!g)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors ${groupByMonth?'bg-purple-50 border-purple-300 text-purple-700':'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Calendar size={13}/> Agrupar mes
              </button>
              <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                <button onClick={()=>setViewMode('lista')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='lista'?'bg-white shadow-xs text-purple-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Lista">
                  <List size={15}/>
                </button>
                <button onClick={()=>setViewMode('kanban')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='kanban'?'bg-white shadow-xs text-purple-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Tablero Kanban">
                  <LayoutGrid size={15}/>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER ROW */}
        {activeTab !== 'Analisis' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs gap-2 flex-1 min-w-[280px] max-w-[500px]">
              <Search size={15} className="text-slate-400 shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por PEC, proveedor, VEN vinculado, comprador..."
                className="text-xs outline-none flex-1 bg-transparent text-slate-800 placeholder-slate-400"/>
              {search && <button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
            </div>
            <div className="relative">
              <button onClick={()=>setShowFilters(f=>!f)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs font-bold shadow-xs bg-white transition-colors ${filterEstado?'border-purple-400 text-purple-700 bg-purple-50':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Filter size={14}/> Filtrar Estado
                {filterEstado && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters && (
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Por Estado</p>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none mb-3 focus:ring-2 focus:ring-purple-200">
                    <option value="">Todos los estados</option>
                    {Object.entries(PEC_ESTADOS).map(entry=><option key={entry[0]} value={entry[0]}>{entry[1].label}</option>)}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-rose-500 hover:text-rose-700 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>
            <p className="text-xs text-slate-400 font-bold ml-1">{filteredData.length} registros</p>
          </div>
        )}

        {/* ── CONTENIDO PRINCIPAL: ANÁLISIS, LISTA O KANBAN ── */}
        {activeTab === 'Analisis' ? (
          /* TAB DE ANÁLISIS CANÓNICO (SEGÚN REGLA: analisis-tab-standard.md) */
          <div className="p-2 space-y-8">
            {/* 1. FILA DE KPIS ANALÍTICOS */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
              <div className="bg-gradient-to-br from-purple-50 to-white rounded-2xl p-5 border border-purple-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-purple-700 uppercase tracking-wider">Tasa de Cumplimiento</span>
                  <span className="p-2 rounded-xl bg-purple-100 text-purple-700"><TrendingUp size={16}/></span>
                </div>
                <h3 className="text-3xl font-black text-slate-900">{tasaCumplimiento}%</h3>
                <p className="text-xs text-slate-500 font-semibold mt-1">
                  {recibidos.length} de {pedidos.length} PECs completados a tiempo
                </p>
              </div>

              <div className="bg-gradient-to-br from-amber-50 to-white rounded-2xl p-5 border border-amber-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-amber-700 uppercase tracking-wider">Compras Activas</span>
                  <span className="p-2 rounded-xl bg-amber-100 text-amber-700"><Clock size={16}/></span>
                </div>
                <h3 className="text-3xl font-black text-slate-900">{enProceso.length}</h3>
                <p className="text-xs text-amber-700 font-semibold mt-1">
                  {retrasados.length > 0 ? `${retrasados.length} pedidos con retraso crítico` : 'Todos en plazo normal de entrega'}
                </p>
              </div>

              <div className="bg-gradient-to-br from-rose-50 to-white rounded-2xl p-5 border border-rose-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-rose-600 uppercase tracking-wider">Cancelaciones</span>
                  <span className="p-2 rounded-xl bg-rose-100 text-rose-600"><AlertTriangle size={16}/></span>
                </div>
                <h3 className="text-3xl font-black text-slate-900">{cancelados.length}</h3>
                <p className="text-xs text-rose-600 font-semibold mt-1">
                  {pedidos.length > 0 ? ((cancelados.length / pedidos.length) * 100).toFixed(1) : 0}% tasa de descarte de compras
                </p>
              </div>

              <div className="bg-gradient-to-br from-emerald-50 to-white rounded-2xl p-5 border border-emerald-100 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-black text-emerald-700 uppercase tracking-wider">Total Inversión</span>
                  <span className="p-2 rounded-xl bg-emerald-100 text-emerald-700"><CheckCircle2 size={16}/></span>
                </div>
                <h3 className="text-3xl font-black text-slate-900">{fCOP(montoTotal)}</h3>
                <p className="text-xs text-emerald-700 font-semibold mt-1">
                  Volumen activo en suministros
                </p>
              </div>
            </div>

            {/* 2. GRÁFICAS: LÍNEAS + DONUT */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* DIAGRAMA DE LÍNEAS SVG */}
              <div className="lg:col-span-2 bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <Activity size={18} className="text-purple-600"/> Tendencia de Pedidos de Compra (PEC)
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Volumen y frecuencia por fecha de emisión</p>
                  </div>
                  <span className="text-xs font-bold bg-purple-50 text-purple-700 px-3 py-1 rounded-full border border-purple-100">
                    Histórico reciente
                  </span>
                </div>

                {(() => {
                  const dateMap: Record<string, number> = {};
                  pedidos.forEach(p => {
                    const d = p.fecha_compra || p.created_at ? new Date(p.fecha_compra || p.created_at).toLocaleDateString('es-CO', {month:'short', day:'numeric'}) : 'Reciente';
                    dateMap[d] = (dateMap[d] || 0) + 1;
                  });
                  const entries = Object.entries(dateMap).slice(-8);
                  if (entries.length === 0) entries.push(['Hoy', 0]);
                  const maxVal = Math.max(...entries.map(e => e[1]), 4);
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
                          <linearGradient id="areaGradCompras" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#9333ea" stopOpacity="0.3"/>
                            <stop offset="100%" stopColor="#9333ea" stopOpacity="0.0"/>
                          </linearGradient>
                        </defs>
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
                        {areaD && <path d={areaD} fill="url(#areaGradCompras)" />}
                        {polylinePts && <polyline fill="none" stroke="#9333ea" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" points={polylinePts}/>}
                        {points.map((p, i) => (
                          <g key={i} className="group cursor-pointer">
                            <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke="#9333ea" strokeWidth="2.5" className="transition-all hover:scale-125"/>
                            <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize="10" fill="#1e293b" fontWeight="bold">{p.val}</text>
                            <text x={p.x} y={height - 10} textAnchor="middle" fontSize="9" fill="#64748b" fontWeight="600">{p.label}</text>
                          </g>
                        ))}
                      </svg>
                    </div>
                  );
                })()}
              </div>

              {/* DIAGRAMA DONUT SVG */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm flex flex-col justify-between">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                      <PieChart size={18} className="text-purple-600"/> Distribución
                    </h4>
                    <p className="text-xs text-slate-400 font-medium">Proporciones de compras</p>
                  </div>
                  <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200">
                    <button onClick={() => setDonutMode('estados')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode==='estados'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                      Estados
                    </button>
                    <button onClick={() => setDonutMode('proveedores')}
                      className={`px-2.5 py-1 text-[11px] font-bold rounded-md transition-all ${donutMode==='proveedores'?'bg-white text-slate-800 shadow-sm':'text-slate-500 hover:text-slate-700'}`}>
                      Proveedores
                    </button>
                  </div>
                </div>

                {(() => {
                  const slices: { label: string; count: number; color: string }[] = [];
                  if (donutMode === 'estados') {
                    slices.push({ label: 'Emitido', count: pedidos.filter(p=>p.estado==='EMITIDO'||p.estado==='BORRADOR').length, color: '#f59e0b' });
                    slices.push({ label: 'En Tránsito', count: pedidos.filter(p=>p.estado==='EN_TRANSITO'||p.estado==='ENVIADO').length, color: '#6366f1' });
                    slices.push({ label: 'Recibido', count: pedidos.filter(p=>p.estado==='RECIBIDO'||p.estado==='COMPLETADO').length, color: '#10b981' });
                    slices.push({ label: 'Cancelado', count: pedidos.filter(p=>p.estado==='CANCELADO').length, color: '#ef4444' });
                  } else {
                    const suppCounts: Record<string, number> = {};
                    pedidos.forEach(p => {
                      const s = p.supplier_name || 'Sin proveedor';
                      suppCounts[s] = (suppCounts[s] || 0) + 1;
                    });
                    const pal = ['#9333ea', '#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#64748b'];
                    Object.entries(suppCounts).slice(0, 5).forEach(([s, count], i) => {
                      slices.push({ label: s, count, color: pal[i % pal.length] });
                    });
                  }
                  if (slices.length === 0) slices.push({ label: 'Sin datos', count: 1, color: '#cbd5e1' });
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
                              <circle key={i} cx="21" cy="21" r="15.915" fill="transparent" stroke={slice.color} strokeWidth="5"
                                strokeDasharray={strokeDasharray} strokeDashoffset={strokeDashoffset} className="transition-all duration-500"/>
                            );
                          })}
                        </svg>
                        <div className="absolute text-center">
                          <span className="text-xl font-black text-slate-800">{sum}</span>
                          <p className="text-[9px] uppercase font-black text-slate-400">Total</p>
                        </div>
                      </div>
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

            {/* 3. DIAGRAMA DE BARRAS CATEGÓRICAS */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h4 className="font-black text-slate-800 text-base flex items-center gap-2">
                    <BarChart3 size={18} className="text-purple-600"/> Estados Operativos de Compras
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">Distribución por fases y ratio de cumplimiento</p>
                </div>
                <span className="text-xs font-bold text-slate-500">Fases del ciclo</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {Object.entries(PEC_ESTADOS).map(([estKey, estVal]) => {
                  const matching = pedidos.filter(p => (p.estado || 'BORRADOR') === estKey);
                  const count = matching.length;
                  const totalAll = pedidos.length || 1;
                  const pctOfAll = Math.round((count / totalAll) * 100);
                  return (
                    <div key={estKey} className="bg-slate-50 border border-slate-100 rounded-xl p-4 hover:border-purple-200 transition-colors">
                      <div className="flex items-start justify-between mb-2">
                        <p className="font-black text-xs text-slate-800 leading-tight">{estVal.label}</p>
                        <span className="font-extrabold text-sm text-purple-700 bg-white px-2 py-0.5 rounded-md border border-slate-100 shadow-xs">
                          {count}
                        </span>
                      </div>
                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden mb-2">
                        <div className="bg-purple-600 h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pctOfAll * 2.5, 100)}%` }}/>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                        <span>{pctOfAll}% del ciclo</span>
                        <span className="font-bold text-purple-800">{fCOP(matching.reduce((s,p)=>s+(p.total_cop||0),0))}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 4. RANKING DE TOP PROVEEDORES CON SELECTOR DINÁMICO */}
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6">
                <div>
                  <h4 className="font-black text-slate-800 text-lg flex items-center gap-2">
                    <Award size={20} className="text-amber-500"/> Ranking de Top Proveedores
                  </h4>
                  <p className="text-xs text-slate-400 font-medium">Proveedores con mayor volumen de pedidos y cumplimiento en Nebulae</p>
                </div>
                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 shrink-0">
                  <span className="text-xs font-black text-slate-500 px-2 uppercase">Mostrar:</span>
                  {[5, 10, 20, 50].map(lim => (
                    <button key={lim} onClick={() => setTopSuppliersLimit(lim)}
                      className={`px-3 py-1 text-xs font-black rounded-lg transition-all ${topSuppliersLimit === lim ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}>
                      Top {lim}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const suppAgg: Record<string, { name: string; count: number; total: number; recibidos: number; enProceso: number; cancelados: number }> = {};
                pedidos.forEach(p => {
                  const key = (p.supplier_name || 'Sin Proveedor').trim();
                  if (!suppAgg[key]) {
                    suppAgg[key] = { name: key, count: 0, total: 0, recibidos: 0, enProceso: 0, cancelados: 0 };
                  }
                  suppAgg[key].count += 1;
                  suppAgg[key].total += (p.total_cop || 0);
                  if (['RECIBIDO','COMPLETADO'].includes(p.estado)) suppAgg[key].recibidos += 1;
                  else if (p.estado === 'CANCELADO') suppAgg[key].cancelados += 1;
                  else suppAgg[key].enProceso += 1;
                });
                const ranked = Object.values(suppAgg).sort((a,b) => b.total - a.total).slice(0, topSuppliersLimit);

                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-slate-50 text-[11px] font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                        <tr>
                          <th className="px-4 py-3">Posición</th>
                          <th className="px-4 py-3">Proveedor</th>
                          <th className="px-4 py-3 text-center">PECs Totales</th>
                          <th className="px-4 py-3 text-right">Monto Total</th>
                          <th className="px-4 py-3">Desglose de Estados</th>
                          <th className="px-4 py-3 text-right">Efectividad</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {ranked.length === 0 ? (
                          <tr><td colSpan={6} className="py-8 text-center text-slate-400">Sin datos de proveedores.</td></tr>
                        ) : ranked.map((s, idx) => {
                          const successRate = s.count > 0 ? Math.round((s.recibidos / s.count) * 100) : 0;
                          return (
                            <tr key={s.name} className="hover:bg-slate-50/80 transition-colors">
                              <td className="px-4 py-3">
                                <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full font-black text-xs ${idx===0 ? 'bg-amber-100 text-amber-800' : idx===1 ? 'bg-slate-200 text-slate-700' : idx===2 ? 'bg-orange-100 text-orange-800' : 'bg-slate-100 text-slate-500'}`}>
                                  {idx + 1}
                                </span>
                              </td>
                              <td className="px-4 py-3 font-extrabold text-slate-800">{s.name}</td>
                              <td className="px-4 py-3 text-center">
                                <span className="font-black text-sm text-purple-700 bg-purple-50 border border-purple-100 px-3 py-1 rounded-xl">{s.count}</span>
                              </td>
                              <td className="px-4 py-3 text-right font-black text-slate-900">{fCOP(s.total)}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded font-bold text-[10px]">
                                    {s.recibidos} Recibidos
                                  </span>
                                  <span className="bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded font-bold text-[10px]">
                                    {s.enProceso} En Curso
                                  </span>
                                  {s.cancelados > 0 && (
                                    <span className="bg-rose-50 text-rose-600 border border-rose-200 px-2 py-0.5 rounded font-bold text-[10px]">
                                      {s.cancelados} Canc.
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

            {/* 5. ASISTENTE IA EN VIVO (NEBULAE AI ANALYST CARD) */}
            <div className="bg-gradient-to-br from-slate-900 via-purple-950 to-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl border border-purple-900/50">
              <div className="flex items-center justify-between gap-4 mb-4 pb-4 border-b border-purple-800/40">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-purple-500/30 border border-purple-400/40 flex items-center justify-center text-purple-300 shadow-inner">
                    <Bot size={22} className="text-purple-300 animate-pulse"/>
                  </div>
                  <div>
                    <h3 className="text-lg font-black tracking-tight text-white flex items-center gap-2">
                      Nebulae AI · Analista de Compras & Suministros
                      <span className="text-[10px] uppercase font-black bg-purple-500/20 text-purple-300 border border-purple-400/30 px-2 py-0.5 rounded-full">
                        En Vivo
                      </span>
                    </h3>
                    <p className="text-xs text-slate-300 font-medium">
                      Auditoría de lead times, órdenes en tránsito y recomendaciones para evitar desabastecimiento
                    </p>
                  </div>
                </div>
                <button onClick={() => setAiChatHistory([{ role: 'ia', text: 'Historial reiniciado. Hazme una consulta sobre pedidos de compra o proveedores.', time: 'Ahora' }])}
                  className="text-xs text-slate-400 hover:text-white font-bold flex items-center gap-1 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <RotateCcw size={12}/> Limpiar
                </button>
              </div>

              {/* Quick Prompts Chips */}
              <div className="mb-5">
                <p className="text-xs font-black text-purple-300 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-amber-400"/> Consultas rápidas recomendadas:
                </p>
                <div className="flex flex-wrap gap-2">
                  {[
                    '¿Cuál es el diagnóstico de cumplimiento y tiempos de entrega?',
                    '¿Qué proveedores concentran el mayor volumen o demoras?',
                    '¿Cuánta mercancía y capital se encuentra navegando en tránsito?',
                    '¿Qué recomendaciones hay para prevenir cuellos de botella en suministros?'
                  ].map((promptText, i) => (
                    <button key={i} onClick={() => handleAiQuestion(promptText)} disabled={aiLoading}
                      className="text-xs font-semibold px-3 py-1.5 rounded-xl bg-white/10 hover:bg-purple-600/50 border border-white/10 text-slate-200 hover:text-white transition-colors text-left">
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
                      <div className="w-7 h-7 rounded-lg bg-purple-600 text-white flex items-center justify-center text-xs font-black shrink-0 mt-0.5">
                        AI
                      </div>
                    )}
                    <div className={`rounded-2xl px-4 py-3 max-w-[85%] text-xs leading-relaxed shadow-sm ${msg.role === 'user' ? 'bg-purple-600 text-white font-semibold' : 'bg-white/10 text-slate-100 border border-white/10 font-normal'}`}>
                      <div className="whitespace-pre-wrap">{msg.text}</div>
                      <span className="block text-[10px] mt-1.5 opacity-60 text-right">{msg.time}</span>
                    </div>
                  </div>
                ))}
                {aiLoading && (
                  <div className="flex items-center gap-2 text-purple-300 text-xs font-bold pl-2 py-1">
                    <RefreshCw size={14} className="animate-spin text-purple-400"/>
                    <span>Analizando órdenes de compra y desempeño de proveedores...</span>
                  </div>
                )}
              </div>

              {/* Input */}
              <div className="mt-4 flex gap-2">
                <input type="text" value={aiQuery} onChange={e => setAiQuery(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleAiQuestion()}
                  placeholder="Pregunta a la IA sobre compras, estado de PECs, transportadoras o insumos..."
                  className="flex-1 bg-white/10 border border-white/20 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-purple-400"/>
                <button onClick={() => handleAiQuestion()} disabled={!aiQuery.trim() || aiLoading}
                  className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs shadow-md disabled:opacity-50 flex items-center gap-1.5 shrink-0">
                  <Send size={13}/> Preguntar
                </button>
              </div>
            </div>
          </div>
        ) : viewMode === 'lista' ? (
          /* ── VISTA LISTA ── */
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            {groupByMonth ? (
              Object.entries(groupedByMonth).map(entry => {
                const month = entry[0]; const rows = entry[1];
                const isOpen = expandedMonths.has(month);
                return (
                  <div key={month}>
                    <button onClick={() => { const n = new Set(expandedMonths); if (n.has(month)) n.delete(month); else n.add(month); setExpandedMonths(n); }}
                      className="w-full flex items-center justify-between px-6 py-3 bg-slate-50 border-b border-slate-200 hover:bg-purple-50/50 transition-colors">
                      <span className="font-black text-slate-700 text-xs uppercase">{month}</span>
                      <div className="flex items-center gap-3">
                        <span className="text-xs text-slate-400 font-bold">{(rows as any[]).length} pedido(s) · {fCOP((rows as any[]).reduce((s:number,r:any)=>s+(r.total_cop||0),0))}</span>
                        {isOpen ? <ChevronUp size={16} className="text-slate-400"/> : <ChevronRight size={16} className="text-slate-400"/>}
                      </div>
                    </button>
                    {isOpen && (
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50/50 border-b border-slate-100">
                          <tr>
                            <th className="px-5 py-3 w-10"/>
                            {TABLE_HEADERS.map((h,i)=><th key={i} className={`px-4 py-3 text-xs font-black text-slate-400 uppercase ${i===TABLE_HEADERS.length-1?'text-center':''}`}>{h}</th>)}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {(rows as any[]).map((p: any) => <PecRow key={p.id} p={p}/>)}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })
            ) : (
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-5 py-3.5 w-10">
                      <input type="checkbox" className="rounded border-slate-300"
                        onChange={e=>{if(e.target.checked)setSelectedIds(new Set(filteredData.map(d=>d.id)));else setSelectedIds(new Set());}}
                        checked={selectedIds.size===filteredData.length&&filteredData.length>0}/>
                    </th>
                    {TABLE_HEADERS.map((h,i)=><th key={i} className={`px-4 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide ${i===TABLE_HEADERS.length-1?'text-center':''}`}>{h}</th>)}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.length===0 && (
                    <tr><td colSpan={11} className="text-center py-16 text-slate-400">
                      <Activity size={32} className="mx-auto mb-3 opacity-30"/>
                      <p className="font-semibold text-slate-600">{search?`Sin resultados para "${search}"`:loading?'Cargando...':'Sin pedidos de compra'}</p>
                    </td></tr>
                  )}
                  {filteredData.map(p => <PecRow key={p.id} p={p}/>)}
                </tbody>
              </table>
            )}
            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 font-medium flex items-center justify-between bg-slate-50/50">
              <span>Mostrando {filteredData.length} de {pedidos.length} pedidos de compra</span>
              {selectedIds.size>0 && <span className="text-purple-700 font-bold bg-purple-50 px-2.5 py-1 rounded-full border border-purple-200">{selectedIds.size} seleccionados</span>}
            </div>
          </div>
        ) : (
          /* ── VISTA KANBAN ── */
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {['Emitido','En Transito','Recibido','Cancelado'].map(col => (
              <div key={col} className="w-80 shrink-0 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs"
                onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e,col)}>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 rounded-t-2xl">
                  <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide">{col}</h3>
                  <span className="bg-slate-200/80 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {filteredData.filter(d=>getKanbanCol(d)===col).length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-[300px]">
                  {filteredData.filter(d=>getKanbanCol(d)===col).map((p,i) => {
                    const est = PEC_ESTADOS[p.estado] || PEC_ESTADOS.BORRADOR;
                    return (
                      <div key={i} draggable onDragStart={e=>handleDragStart(e,p.id)} onClick={()=>setSelectedPec(p)}
                        className={`bg-white p-4 rounded-xl shadow-xs border cursor-grab active:cursor-grabbing hover:border-purple-300 transition-all group ${p.is_overdue?'border-rose-300 bg-rose-50/30':'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-slate-900 text-xs">{p.numero}</span>
                          {p.is_overdue && <span className="text-[9px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-black">VENCIDO</span>}
                        </div>
                        <p className="text-xs font-bold text-slate-700 mb-1 truncate">{p.supplier_name||'-'}</p>
                        {p.ven_numero && <p className="text-[10px] text-indigo-600 font-bold mb-1">VEN: {p.ven_numero}</p>}
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <span className="font-black text-xs text-purple-700">{fCOP(p.total_cop||0)}</span>
                          <span className={`text-[9px] font-black px-2 py-0.5 rounded-full border ${est.bg} ${est.text} ${est.border}`}>{est.label}</span>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter(d=>getKanbanCol(d)===col).length===0 && (
                    <p className="text-center text-xs text-slate-300 font-medium py-12">Arrastra un PEC aquí</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal de Configuración de Tiempos */}
        {showConfig && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl border border-slate-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-black text-slate-800 text-base flex items-center gap-2">
                  <Settings size={18} className="text-purple-600"/> Ajustes de Alerta de Compras
                </h3>
                <button onClick={()=>setShowConfig(false)} className="p-1 hover:bg-slate-100 rounded-lg"><X size={16} className="text-slate-400"/></button>
              </div>
              <p className="text-xs text-slate-500">
                Define el umbral máximo de días permitidos para un Pedido de Compra sin haber recibido mercancía antes de activar la alerta roja de retraso en suministros.
              </p>
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Días límite de entrega:</label>
                <input type="number" min={1} max={60} value={pecAlertDias} onChange={e=>setPecAlertDias(Number(e.target.value)||5)}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button onClick={()=>setShowConfig(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-200">Cancelar</button>
                <button onClick={()=>{setShowConfig(false);showToast('Configuración guardada exitosamente');}}
                  className="px-5 py-2 bg-purple-600 text-white rounded-xl text-xs font-bold hover:bg-purple-700 shadow-xs">Guardar</button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size>0 && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-sm bg-slate-800 px-3 py-1 rounded-full">{selectedIds.size} seleccionados</span>
            <button onClick={handleBulkDelete} className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors">
              <Trash2 size={14}/> Cancelar Seleccionados
            </button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-white"><X size={14}/></button>
          </div>
        )}

      </div>
    </div>
  );
}
