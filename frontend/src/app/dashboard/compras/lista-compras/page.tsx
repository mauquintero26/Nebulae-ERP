'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ShoppingCart, Search, RefreshCw, X, Filter, Plus,
  Package, Clock, CheckCircle2, AlertCircle, Trash2,
  ChevronDown, ExternalLink, ArrowLeft, ShoppingBag,
  Calendar, User, Edit2, Save, ListChecks
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';
async function apiFetch(path, opts = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const fDate = (iso) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const ESTADO_STYLES = {
  PENDIENTE: { bg: 'bg-amber-100', text: 'text-amber-800', label: 'Pendiente' },
  EN_PEDIDO: { bg: 'bg-blue-100',  text: 'text-blue-800',  label: 'En Pedido' },
  RECIBIDO:  { bg: 'bg-emerald-100', text: 'text-emerald-800', label: 'Recibido' },
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

export default function ListaComprasPage() {
  const [items, setItems]         = useState([]);
  const [stats, setStats]         = useState({});
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterEstado, setFilterEstado] = useState('PENDIENTE');
  const [filterProveedor, setFilterProveedor] = useState('');
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [filterTab, setFilterTab] = useState('Pendiente');
  const [activeTab, setActiveTab] = useState('Lista');
  const [toast, setToast]         = useState(null);

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);

  // AI Analysis
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiChat, setAiChat] = useState<any[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editProveedor, setEditProveedor] = useState('');
  const [showPecModal, setShowPecModal] = useState(false);
  const [pecModalItem, setPecModalItem] = useState(null);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierSearch, setSupplierSearch] = useState('');
  const [selectedSupplier, setSelectedSupplier] = useState(null);
  const [pecForm, setPecForm]     = useState({ dias_entrega: 15, modalidad_pago: 'Contado', notas: '' });
  const [pecSaving, setPecSaving] = useState(false);
  const supplierTimer = useRef(null);

  const showToast = (msg, type = 'ok') => {
    setToast({msg,type}); setTimeout(()=>setToast(null), 3500);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '200' });
      if (filterEstado) params.set('estado', filterEstado);
      if (search) params.set('search', search);
      if (filterProveedor) params.set('proveedor', filterProveedor);
      if (fechaDesde) params.set('fecha_desde', fechaDesde);
      if (fechaHasta) params.set('fecha_hasta', fechaHasta);
      const [d, s] = await Promise.all([
        apiFetch(`/compras/lista-compras?${params}`).catch(() => []),
        apiFetch('/compras/lista-compras/stats').catch(() => ({})),
      ]);
      setItems(Array.isArray(d) ? d : (d?.data ?? []));
      setStats(s?.data ?? s ?? {});
    } catch (e) { showToast(e.message, 'err'); }
    finally { setLoading(false); }
  }, [filterEstado, search, filterProveedor, fechaDesde, fechaHasta]);

  useEffect(() => { load(); }, [load]);

  const onSupplierSearch = (q) => {
    setSupplierSearch(q);
    setSelectedSupplier(null);
    if (supplierTimer.current) clearTimeout(supplierTimer.current);
    if (!q.trim()) { setSuppliers([]); return; }
    supplierTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/compras/proveedores/search?q=${encodeURIComponent(q)}`).catch(() => ({ data: [] }));
      setSuppliers(Array.isArray(d) ? d : (d?.data ?? []));
    }, 300);
  };

  const handleMarkEstado = async (id, estado) => {
    try {
      await apiFetch(`/compras/lista-compras/${id}`, { method: 'PATCH', body: JSON.stringify({ estado }) });
      showToast(estado === 'RECIBIDO' ? 'Marcado como recibido' : 'Estado actualizado');
      load();
    } catch (e) { showToast(e.message, 'err'); }
  };

  const handleSaveProveedor = async (id) => {
    try {
      await apiFetch(`/compras/lista-compras/${id}`, { method: 'PATCH', body: JSON.stringify({ proveedor: editProveedor }) });
      setEditingId(null);
      showToast('Proveedor actualizado');
      load();
    } catch (e) { showToast(e.message, 'err'); }
  };

  const handleDelete = async (id) => {
    if (!confirm('Eliminar este item de la lista?')) return;
    try {
      await apiFetch(`/compras/lista-compras/${id}`, { method: 'DELETE' });
      showToast('Item eliminado');
      load();
    } catch (e) { showToast(e.message, 'err'); }
  };

  const openPecModal = (item) => {
    setPecModalItem(item);
    setSelectedSupplier(null);
    setSupplierSearch('');
    setSuppliers([]);
    setPecForm({ dias_entrega: 15, modalidad_pago: 'Contado', notas: `Desde Lista de Compras - ${item.pven_numero || ''}` });
    setShowPecModal(true);
  };

  const handleCrearPEC = async () => {
    if (!pecModalItem) return;
    setPecSaving(true);
    try {
      const user = localStorage.getItem('user_name') || '';
      const pec = await apiFetch('/compras/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: selectedSupplier?.id,
          supplier_name: selectedSupplier?.name || supplierSearch,
          ven_id: pecModalItem.pven_id,
          ven_numero: pecModalItem.pven_numero,
          dias_entrega: pecForm.dias_entrega,
          modalidad_pago: pecForm.modalidad_pago,
          notas: pecForm.notas,
          productos: [{ producto_nombre: pecModalItem.producto, qty: pecModalItem.cantidad }],
          created_by: user,
        }),
      });
      await apiFetch(`/compras/lista-compras/${pecModalItem.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'EN_PEDIDO', pec_id: pec.id, pec_numero: pec.numero }),
      });
      showToast(`PEC ${pec.numero} creado y vinculado`);
      setShowPecModal(false);
      load();
    } catch (e) { showToast(e.message, 'err'); }
    finally { setPecSaving(false); }
  };

  const totalItems = items.length;
  const displayed = items.slice((currentPage-1)*pageSize, currentPage*pageSize);

  async function handleAIAnalysis() {
    setAiLoading(true);
    const summary = `Datos de Lista de Compras: ${items.length} registros. Top items: ${items.slice(0,3).map((r:any)=>r.producto||'item').join(', ')}.`;
    setAiAnalysis(`📊 ANÁLISIS DE LISTA DE COMPRAS — ${new Date().toLocaleDateString('es-CO')}\n\n${summary}\n\nPuede consultar más detalles usando el chat de abajo.`);
    setAiLoading(false);
  }

  async function sendAIChat() {
    if(!aiInput.trim()) return;
    const msg=aiInput; setAiInput('');
    setAiChat(h=>[...h,{role:'user',text:msg}]);
    setAiChat(h=>[...h,{role:'ia',text:`Con base en los datos actuales: ${msg}. El análisis muestra ${items.length} registros disponibles.`}]);
  }

  return (
    <div className="flex flex-col min-h-screen bg-gray-50">
      {toast && (
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2 ${toast.type==='err'?'bg-red-500':'bg-emerald-500'} text-white`}>
          {toast.msg}<button onClick={()=>setToast(null)}><X size={14}/></button>
        </div>
      )}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto">
        <Link href="/dashboard/compras" className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold text-gray-500 hover:bg-gray-100 border border-gray-200 mr-2 transition-colors">
          <ArrowLeft size={12}/> Hub
        </Link>
        <div className="w-px h-4 bg-gray-200 mr-2 shrink-0"/>
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0">COMPRAS:</span>
        {SUB_MODULES.map(m => (
          <Link key={m.path} href={m.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
              m.path === '/dashboard/compras/lista-compras'
                ? 'bg-purple-600 text-white border-purple-600'
                : 'text-gray-600 hover:bg-purple-50 hover:text-purple-700 border-transparent'
            }`}>{m.name}
          </Link>
        ))}
      </div>

      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-8 py-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="bg-purple-50 text-purple-600 p-3 rounded-2xl">
              <ListChecks size={30}/>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Lista de Productos por Comprar</h1>
              <p className="text-sm text-gray-400 mt-0.5">Productos pendientes de compra desde Pedidos de Venta</p>
            </div>
          </div>
          <button onClick={load} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm mt-1">
            <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="px-8 py-5 bg-white border-b border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { label:'Pendientes',  value: stats.pendientes ?? 0, color:'text-amber-700',   bg:'bg-amber-100',   icon:<Clock size={20}/> },
            { label:'En Pedido',   value: stats.en_pedido ?? 0,  color:'text-blue-700',    bg:'bg-blue-100',    icon:<ShoppingCart size={20}/> },
            { label:'Recibidos',   value: stats.recibidos ?? 0,  color:'text-emerald-700', bg:'bg-emerald-100', icon:<CheckCircle2 size={20}/> },
            { label:'Total Items', value: stats.total ?? 0,      color:'text-gray-700',    bg:'bg-gray-100',    icon:<Package size={20}/> },
          ].map((k,i) => (
            <div key={i} className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow bg-white">
              <div className={`${k.bg} ${k.color} w-10 h-10 rounded-xl flex items-center justify-center mb-3`}>{k.icon}</div>
              <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">{k.label}</p>
              <p className="text-3xl font-black text-gray-900">{k.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Tabs Row */}
      <div className="px-8 pt-4 pb-0 bg-white flex items-center justify-between">
        <div className="flex items-center gap-1">
          {[
            {tab:'Todos', estado:''},
            {tab:'Pendiente', estado:'PENDIENTE'},
            {tab:'En Pedido', estado:'EN_PEDIDO'},
            {tab:'Recibido',  estado:'RECIBIDO'},
          ].map(({tab,estado}) => (
            <button key={tab} onClick={() => { setFilterTab(tab); setFilterEstado(estado); setCurrentPage(1); }}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                filterTab===tab ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
              }`}>
              {tab}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {['Lista', 'Análisis'].map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab === 'Análisis' ? 'Analisis' : tab)}
              className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === (tab === 'Análisis' ? 'Analisis' : tab) ? 'bg-purple-600 text-white shadow-sm' : 'text-gray-600 hover:text-purple-700 hover:bg-purple-50'
              }`}>
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Search + Filter Row */}
      <div className="px-8 py-3 bg-white border-b border-gray-100 flex flex-wrap items-center gap-3">
        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[400px] shadow-sm">
          <Search size={14} className="text-gray-400 shrink-0"/>
          <input value={search} onChange={e=>setSearch(e.target.value)}
            placeholder="Buscar producto, PVEN, notas..."
            className="text-sm bg-transparent outline-none flex-1 placeholder-gray-400"/>
          {search && <button onClick={()=>setSearch('')}><X size={13} className="text-gray-400"/></button>}
        </div>

        <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 shadow-sm">
          <User size={14} className="text-gray-400 shrink-0"/>
          <input value={filterProveedor} onChange={e=>setFilterProveedor(e.target.value)}
            placeholder="Filtrar proveedor..." className="text-sm bg-transparent outline-none w-40 placeholder-gray-400"/>
          {filterProveedor && <button onClick={()=>setFilterProveedor('')}><X size={13} className="text-gray-400"/></button>}
        </div>

        <button onClick={()=>setShowFilters(f=>!f)}
          className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold shadow-sm transition-colors ${
            showFilters || fechaDesde || fechaHasta ? 'bg-purple-50 border-purple-300 text-purple-700' : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
          }`}>
          <Calendar size={14}/> Fecha
          {(fechaDesde||fechaHasta) && <span className="bg-purple-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
        </button>

        {showFilters && (
          <>
            <input type="date" value={fechaDesde} onChange={e=>setFechaDesde(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none shadow-sm"/>
            <span className="text-gray-400 text-sm">→</span>
            <input type="date" value={fechaHasta} onChange={e=>setFechaHasta(e.target.value)}
              className="border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none shadow-sm"/>
            {(fechaDesde||fechaHasta) && (
              <button onClick={()=>{setFechaDesde('');setFechaHasta('');}} className="text-red-500 text-xs font-bold hover:text-red-700">Limpiar</button>
            )}
          </>
        )}
        <span className="text-sm text-gray-400 font-medium ml-auto">{totalItems} registros</span>
      </div>

      {activeTab === 'Lista' && (
      <>
      {/* Tabla */}
      <div className="flex-1 px-8 py-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Producto</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide text-center">Qty</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">PVEN</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Proveedor</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">PEC</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide">Fecha</th>
                <th className="px-4 py-3.5 text-xs font-black text-gray-400 uppercase tracking-wide text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && (
                <tr><td colSpan={8} className="py-16 text-center">
                  <RefreshCw size={24} className="animate-spin text-purple-400 mx-auto mb-2"/>
                  <p className="text-gray-400 text-sm">Cargando...</p>
                </td></tr>
              )}
              {!loading && displayed.length === 0 && (
                <tr><td colSpan={8} className="py-16 text-center">
                  <Package size={32} className="mx-auto mb-3 text-gray-300"/>
                  <p className="text-gray-500 font-medium">No hay productos en la lista</p>
                  <p className="text-gray-400 text-xs mt-1">Los productos se agregan desde Pedidos de Venta en estado Pendiente Compra</p>
                </td></tr>
              )}
              {displayed.map((item) => {
                const est = ESTADO_STYLES[item.estado] || ESTADO_STYLES.PENDIENTE;
                return (
                  <tr key={item.id} className="hover:bg-gray-50 group transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="font-bold text-gray-900 truncate max-w-[220px]" title={item.producto}>{item.producto}</p>
                      {item.notas && <p className="text-xs text-gray-400 truncate max-w-[200px]">{item.notas}</p>}
                    </td>
                    <td className="px-4 py-3.5 text-center font-black text-gray-700">{item.cantidad}</td>
                    <td className="px-4 py-3.5">
                      {item.pven_numero ? (
                        <Link href={`/dashboard/ventas/venta?id=${item.pven_id}`} className="text-indigo-600 font-bold hover:underline flex items-center gap-1 text-sm">
                          {item.pven_numero}<ExternalLink size={11}/>
                        </Link>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      {editingId === item.id ? (
                        <div className="flex items-center gap-1">
                          <input autoFocus value={editProveedor} onChange={e=>setEditProveedor(e.target.value)}
                            className="border border-purple-300 rounded-lg px-2 py-1 text-xs outline-none focus:ring-2 focus:ring-purple-200 w-28"/>
                          <button onClick={()=>handleSaveProveedor(item.id)} className="text-purple-600"><Save size={13}/></button>
                          <button onClick={()=>setEditingId(null)} className="text-gray-400"><X size={13}/></button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 group/prov">
                          <span className="text-sm">{item.proveedor || <span className="text-gray-300 italic">Sin asignar</span>}</span>
                          <button onClick={()=>{setEditingId(item.id);setEditProveedor(item.proveedor||'');}}
                            className="opacity-0 group-hover/prov:opacity-100 text-gray-400 hover:text-purple-600">
                            <Edit2 size={12}/>
                          </button>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {item.pec_numero ? (
                        <Link href="/dashboard/compras/pedidos" className="text-purple-600 font-bold hover:underline flex items-center gap-1 text-xs">
                          {item.pec_numero}<ExternalLink size={10}/>
                        </Link>
                      ) : <span className="text-gray-300 text-xs">-</span>}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`px-3 py-1 rounded-full text-xs font-black ${est.bg} ${est.text}`}>{est.label}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs text-gray-500">{fDate(item.fecha_creacion)}</td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {item.estado === 'PENDIENTE' && (
                          <>
                            <button onClick={()=>openPecModal(item)}
                              className="flex items-center gap-1 px-2.5 py-1.5 bg-purple-600 text-white rounded-lg text-xs font-bold hover:bg-purple-700">
                              <ShoppingCart size={11}/> Crear PEC
                            </button>
                            <button onClick={()=>handleMarkEstado(item.id,'RECIBIDO')}
                              className="p-1.5 rounded-lg border border-emerald-200 text-emerald-600 hover:bg-emerald-50" title="Marcar recibido">
                              <CheckCircle2 size={13}/>
                            </button>
                          </>
                        )}
                        {item.estado === 'EN_PEDIDO' && (
                          <button onClick={()=>handleMarkEstado(item.id,'RECIBIDO')}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold hover:bg-emerald-700">
                            <CheckCircle2 size={11}/> Recibido
                          </button>
                        )}
                        <button onClick={()=>handleDelete(item.id)}
                          className="p-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50" title="Eliminar">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* PAGINATION */}
          {totalItems > 0 && (
            <div className="border-t border-gray-100 px-6 py-3 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400">{totalItems} registros</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-gray-200 rounded-lg px-2 py-1 font-bold text-gray-600 outline-none">
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
              </div>
              {Math.ceil(totalItems/pageSize) > 1 && (
                <div className="flex items-center gap-1">
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">«</button>
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">‹</button>
                  {Array.from({length:Math.min(5,Math.ceil(totalItems/pageSize))},(_,i)=>{
                    const tp=Math.ceil(totalItems/pageSize); let page=i+1;
                    if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                    return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-purple-600 text-white border-purple-600':'border-gray-200 hover:bg-gray-100'}`}>{page}</button>;
                  })}
                  <button disabled={currentPage===Math.ceil(totalItems/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">›</button>
                  <button disabled={currentPage===Math.ceil(totalItems/pageSize)} onClick={()=>setCurrentPage(Math.ceil(totalItems/pageSize))} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">»</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Por proveedor */}
      {stats.por_proveedor?.length > 0 && (
        <div className="px-8 pb-8">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
            <h3 className="text-sm font-black text-gray-700 mb-4">Pendientes por Proveedor</h3>
            <div className="flex flex-wrap gap-2">
              {stats.por_proveedor.map((p, i) => (
                <button key={i} onClick={()=>setFilterProveedor(p.proveedor)}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-50 border border-purple-200 rounded-xl text-sm font-bold text-purple-700 hover:bg-purple-100">
                  {p.proveedor} <span className="bg-purple-600 text-white px-2 py-0.5 rounded-full text-xs">{p.count}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      </>
      )}

      {activeTab === 'Analisis' && (
        <div className="px-8 py-6 space-y-4">
          <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-2xl p-5 border border-blue-100">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-blue-600 rounded-xl p-2 text-white font-black text-sm">AI</div>
              <div>
                <p className="font-extrabold text-blue-900">Análisis de Lista de Compras</p>
                <p className="text-xs text-blue-500">Nebulae Analytics</p>
              </div>
              <button onClick={handleAIAnalysis} disabled={aiLoading} className="ml-auto bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl font-bold text-sm disabled:opacity-50 flex items-center gap-2">
                {aiLoading ? <RefreshCw size={14} className="animate-spin"/> : null} Generar Análisis
              </button>
            </div>
            {aiAnalysis && (
              <pre className="text-sm text-slate-700 whitespace-pre-wrap bg-white/70 rounded-xl p-4 border border-blue-100 leading-relaxed">{aiAnalysis}</pre>
            )}
            {!aiAnalysis && !aiLoading && (
              <p className="text-sm text-blue-700 italic text-center py-4">Haz clic en "Generar Análisis" para obtener insights sobre los datos actuales.</p>
            )}
          </div>
          {/* Chat */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4">
            <p className="font-bold text-slate-700 text-sm mb-3">Consultar al Asistente</p>
            <div className="space-y-2 max-h-40 overflow-y-auto mb-3">
              {aiChat.map((m:any,i:number)=>(
                <div key={i} className={`flex ${m.role==='user'?'justify-end':''}`}>
                  <div className={`rounded-xl px-3 py-2 text-xs max-w-[80%] ${m.role==='user'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700'}`}>{m.text}</div>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input value={aiInput} onChange={e=>setAiInput(e.target.value)} onKeyDown={e=>e.key==='Enter'&&sendAIChat()} placeholder="Pregunta sobre los datos..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none focus:ring-2 focus:ring-blue-200"/>
              <button onClick={sendAIChat} disabled={!aiInput.trim()} className="bg-blue-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">Enviar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Crear PEC */}
      {showPecModal && pecModalItem && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md">
            <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center">
              <div>
                <h3 className="text-xl font-black text-gray-900">Crear Pedido de Compra</h3>
                <p className="text-sm text-gray-500 mt-0.5">Producto: <strong>{pecModalItem.producto}</strong></p>
              </div>
              <button onClick={()=>setShowPecModal(false)} className="p-2 text-gray-400 hover:bg-gray-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="text-xs font-black text-gray-500 uppercase mb-2 block">Proveedor</label>
                <input value={supplierSearch} onChange={e=>onSupplierSearch(e.target.value)}
                  placeholder="Buscar proveedor..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                {suppliers.length > 0 && (
                  <div className="border border-gray-200 rounded-xl shadow-lg mt-1 max-h-40 overflow-y-auto">
                    {suppliers.map(s => (
                      <button key={s.id} onClick={()=>{setSelectedSupplier(s);setSupplierSearch(s.name);setSuppliers([]);}}
                        className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium border-b last:border-0">
                        {s.name}
                      </button>
                    ))}
                  </div>
                )}
                {selectedSupplier && (
                  <p className="text-xs text-purple-700 font-bold mt-1">✓ {selectedSupplier.name} seleccionado</p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-black text-gray-500 uppercase mb-2 block">Dias Entrega</label>
                  <input type="number" min="1" value={pecForm.dias_entrega} onChange={e=>setPecForm(f=>({...f,dias_entrega:Number(e.target.value)}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div>
                  <label className="text-xs font-black text-gray-500 uppercase mb-2 block">Modalidad</label>
                  <select value={pecForm.modalidad_pago} onChange={e=>setPecForm(f=>({...f,modalidad_pago:e.target.value}))}
                    className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                    {['Contado','Credito 30d','Credito 60d','Adelanto 50%','Contra entrega'].map(p=><option key={p}>{p}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs font-black text-gray-500 uppercase mb-2 block">Notas</label>
                <textarea value={pecForm.notas} onChange={e=>setPecForm(f=>({...f,notas:e.target.value}))}
                  rows={2} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200"/>
              </div>
            </div>
            <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
              <button onClick={()=>setShowPecModal(false)} className="px-5 py-2.5 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={handleCrearPEC} disabled={pecSaving}
                className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold shadow-sm flex items-center gap-2 disabled:opacity-50">
                {pecSaving ? <RefreshCw size={14} className="animate-spin"/> : <ShoppingCart size={14}/>}
                Crear PEC
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
