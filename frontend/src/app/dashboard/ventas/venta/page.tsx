'use client';
import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Search, RefreshCw, Plus, MoreHorizontal, X, Edit2, Save,
  Clock, Truck, FileText, FileCheck, Phone, Mail, MessageCircle,
  AlertCircle, ShoppingCart, TrendingUp, Activity, CheckCircle2, 
  Package, DollarSign, ChevronDown
} from 'lucide-react';
import Link from 'next/link';

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

const fCOP  = (v: any) => { const n = Number(v)||0; return '$'+n.toLocaleString('es-CO'); };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';

const VEN_ESTADOS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDIENTE_COMPRA: { bg:'bg-orange-100', text:'text-orange-700', border:'border-orange-200', label:'Pend. Compra' },
  EN_PROCESO:       { bg:'bg-purple-100', text:'text-purple-700', border:'border-purple-200', label:'En Proceso' },
  LISTO_ENTREGA:    { bg:'bg-teal-100',   text:'text-teal-700',   border:'border-teal-200',   label:'Listo Entrega' },
  ENTREGADO:        { bg:'bg-emerald-100',text:'text-emerald-700',border:'border-emerald-200',label:'Entregado' },
  FACTURADO:        { bg:'bg-green-100',  text:'text-green-700',  border:'border-green-200',  label:'Facturado' },
  CANCELADO:        { bg:'bg-red-100',    text:'text-red-700',    border:'border-red-200',    label:'Cancelado' },
};

const SUB_MODULES = [
  { path:'/dashboard/ventas/solicitud',      label:'Solicitud' },
  { path:'/dashboard/ventas/cotizacion',     label:'Cotizacion' },
  { path:'/dashboard/ventas/venta',          label:'Venta' },
  { path:'/dashboard/ventas/exportar-dia',   label:'Exportar Dia' },
  { path:'/dashboard/ventas/exportar-rango', label:'Exportar Rango' },
  { path:'/dashboard/ventas/sincronizacion', label:'Sincronizacion' },
  { path:'/dashboard/ventas/proyecciones',   label:'Proyecciones' },
];

export default function PedidoDeVentaPage() {
  const [pedidos, setPedidos]           = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [activeTab, setActiveTab]       = useState('Todos');
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set());
  const [selectedPedido, setSelectedPedido] = useState<any>(null);
  const [toast, setToast]               = useState<{msg:string,type:'success'|'error'}|null>(null);
  const [isEditMode, setIsEditMode]     = useState(false);
  const [editForm, setEditForm]         = useState<any>({});
  const [panelTab, setPanelTab]         = useState<'actividad'|'chatter'>('actividad');
  const [chatterMsg, setChatterMsg]     = useState('');
  const [chatterSending, setChatterSending] = useState(false);
  const [openMenu, setOpenMenu]         = useState<number|null>(null);

  const showToast = (msg:string, type:'success'|'error'='success') => {
    setToast({msg,type}); setTimeout(()=>setToast(null),3500);
  };

  const fetchPedidos = async () => {
    setLoading(true);
    try { const d=await apiFetch('/ventas/pedidos?limit=200'); setPedidos(Array.isArray(d)?d:[]); }
    catch(err:any) { showToast(err.message,'error'); }
    finally { setLoading(false); }
  };

  const fetchDetail = async (id:number) => {
    try {
      const d=await apiFetch(`/ventas/pedidos/${id}`);
      setSelectedPedido(d); setPanelTab('actividad');
      setEditForm({ estado:d.estado, notas:d.notas||'', fecha_entrega_estimada:d.fecha_entrega_estimada?d.fecha_entrega_estimada.split('T')[0]:'', direccion_entrega:d.direccion_entrega||'', pec_numero:d.pec_numero||'' });
    } catch(err:any) { showToast(err.message,'error'); }
  };

  useEffect(()=>{ fetchPedidos(); },[]);

  const handleSaveEdit = async () => {
    if(!selectedPedido) return;
    try { await apiFetch(`/ventas/pedidos/${selectedPedido.id}`,{method:'PATCH',body:JSON.stringify(editForm)}); showToast('Pedido actualizado'); setIsEditMode(false); fetchDetail(selectedPedido.id); fetchPedidos(); }
    catch(err:any){ showToast(err.message,'error'); }
  };

  const handleCrearPXP = async (id:number) => {
    try { await apiFetch(`/ventas/pedidos/${id}/crear-pxp`,{method:'POST',body:JSON.stringify({monto_anticipo:selectedPedido?.saldo_cop||0})}); showToast('PXP Creado'); fetchDetail(id); fetchPedidos(); }
    catch(err:any){ showToast(err.message,'error'); }
  };

  const handleSendChatter = async () => {
    if(!chatterMsg.trim()||!selectedPedido) return;
    setChatterSending(true);
    try {
      await apiFetch(`/ventas/pedidos/${selectedPedido.id}/actividad`,{method:'POST',body:JSON.stringify({action:panelTab==='chatter'?'CHATTER':'UPDATED',description:chatterMsg})});
      setChatterMsg(''); fetchDetail(selectedPedido.id); showToast('Registrado');
    } catch(err:any){ showToast(err.message,'error'); }
    finally{ setChatterSending(false); }
  };

  const TABS = ['Todos','Pend. Compra','En Proceso','Listo Entrega','Entregado','Facturado','Cancelado'];
  const tabEstado:Record<string,string> = {'Pend. Compra':'PENDIENTE_COMPRA','En Proceso':'EN_PROCESO','Listo Entrega':'LISTO_ENTREGA','Entregado':'ENTREGADO','Facturado':'FACTURADO','Cancelado':'CANCELADO'};

  const filtered = useMemo(()=>{
    let base=pedidos;
    if(activeTab!=='Todos') base=base.filter(p=>p.estado===tabEstado[activeTab]);
    if(search){ const s=search.toLowerCase(); base=base.filter(p=>p.numero?.toLowerCase().includes(s)||p.customer_name?.toLowerCase().includes(s)||p.cot_numero?.toLowerCase().includes(s)||p.sc_numero?.toLowerCase().includes(s)); }
    return base;
  },[pedidos,activeTab,search]);

  const kpis = useMemo(()=>{
    const total=pedidos.length;
    const monto=pedidos.reduce((a,p)=>a+(Number(p.total_cop)||0),0);
    const pCompra=pedidos.filter(p=>p.estado==='PENDIENTE_COMPRA').length;
    const sCobro=pedidos.reduce((a,p)=>a+(Number(p.saldo_cop)||0),0);
    return {total,monto,pCompra,sCobro};
  },[pedidos]);

  const toggleSelect=(id:number)=>{ const n=new Set(selectedIds); if(n.has(id))n.delete(id); else n.add(id); setSelectedIds(n); };
  const toggleAll=()=>{ if(selectedIds.size===filtered.length)setSelectedIds(new Set()); else setSelectedIds(new Set(filtered.map(p=>p.id))); };

  return (
    <div className="flex flex-col min-h-screen bg-gray-50 font-sans text-gray-900">
      {/* Toast */}
      {toast&&(
        <div className={`fixed top-5 right-5 z-[200] px-5 py-3 rounded-2xl shadow-xl text-sm font-bold flex items-center gap-2 ${toast.type==='error'?'bg-red-500 text-white':'bg-emerald-500 text-white'}`}>
          {toast.msg}<button onClick={()=>setToast(null)}><X size={14}/></button>
        </div>
      )}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-gray-200 px-6 py-2 flex items-center gap-1 sticky top-0 z-30 shadow-sm overflow-x-auto">
        <span className="text-xs font-black text-gray-400 uppercase tracking-wider mr-3 shrink-0">VENTAS:</span>
        {SUB_MODULES.map(m=>(
          <Link key={m.path} href={m.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${m.label==='Venta'?'bg-indigo-600 text-white border-indigo-600':'text-gray-600 hover:bg-indigo-50 hover:text-indigo-700 border-transparent'}`}>
            {m.label}
          </Link>
        ))}
      </div>

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-8 py-6">
        <div className="flex justify-between items-start">
          <div className="flex items-center gap-4">
            <div className="bg-indigo-50 text-indigo-600 p-3 rounded-2xl">
              <ShoppingCart size={30}/>
            </div>
            <div>
              <h1 className="text-3xl font-black text-gray-900">Pedidos de Venta</h1>
              <p className="text-sm text-gray-400 mt-0.5">PVEN-YYYY#### &nbsp;•&nbsp; Pipeline: SC → COT → PVEN → PEC → ENINV → PXP</p>
            </div>
          </div>
          <div className="flex items-center gap-3 mt-1">
            <button onClick={fetchPedidos} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
              <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
            </button>
            <button className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-sm shadow-sm">
              <Plus size={15}/> Nuevo Pedido
            </button>
          </div>
        </div>
      </div>

      {/* KPI CARDS */}
      <div className="px-8 py-5 bg-white border-b border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="bg-indigo-100 text-indigo-600 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
              <FileText size={20}/>
            </div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">Total Pedidos</p>
            <p className="text-3xl font-black text-gray-900">{kpis.total}</p>
            <p className="text-xs text-gray-400 mt-1">{pedidos.filter(p=>!['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)).length} activos</p>
          </div>
          <div className="border border-gray-200 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="bg-emerald-100 text-emerald-600 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
              <DollarSign size={20}/>
            </div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">Total Monto</p>
            <p className="text-3xl font-black text-gray-900">{fCOP(kpis.monto)}</p>
            <p className="text-xs text-gray-400 mt-1">COP acumulado</p>
          </div>
          <div className="border border-orange-200 bg-orange-50/30 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="bg-orange-100 text-orange-600 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
              <Package size={20}/>
            </div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">Pendiente Compra</p>
            <p className="text-3xl font-black text-orange-700">{kpis.pCompra}</p>
            <p className="text-xs text-orange-500 mt-1">Requieren PEC</p>
          </div>
          <div className="border border-red-200 bg-red-50/30 rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="bg-red-100 text-red-600 w-10 h-10 rounded-xl flex items-center justify-center mb-3">
              <AlertCircle size={20}/>
            </div>
            <p className="text-xs font-black text-gray-400 uppercase tracking-wide mb-1">Saldo Pendiente</p>
            <p className="text-3xl font-black text-red-600">{fCOP(kpis.sCobro)}</p>
            <p className="text-xs text-red-400 mt-1">Por cobrar</p>
          </div>
        </div>
      </div>

      {/* TABS + SEARCH */}
      <div className="px-8 py-4 flex items-center justify-between gap-4 bg-white border-b border-gray-100">
        <div className="flex items-center gap-1 overflow-x-auto shrink-0">
          {TABS.map(tab=>{
            const est=tabEstado[tab];
            const count=tab==='Todos'?pedidos.length:pedidos.filter(p=>p.estado===est).length;
            return (
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${activeTab===tab?'bg-amber-100 text-amber-800 border border-amber-300':'text-gray-500 hover:bg-gray-100'}`}>
                {tab}
                <span className={`ml-1.5 text-xs ${activeTab===tab?'text-amber-600':'text-gray-400'}`}>{count}</span>
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center bg-gray-100 rounded-xl px-3 py-2 gap-2 w-64">
            <Search size={14} className="text-gray-400 shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar PVEN, cliente..."
              className="text-sm bg-transparent outline-none flex-1 placeholder-gray-400"/>
            {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-gray-400"/></button>}
          </div>
          <button onClick={fetchPedidos} className="p-2 rounded-xl border border-gray-200 bg-white text-gray-500 hover:bg-gray-50 shadow-sm">
            <RefreshCw size={14} className={loading?'animate-spin':''}/>
          </button>
        </div>
      </div>

      {/* TABLE */}
      <div className="flex-1 overflow-auto px-8 py-4">
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-5 py-4 w-10">
                  <input type="checkbox" className="rounded border-gray-300"
                    onChange={toggleAll} checked={selectedIds.size>0&&selectedIds.size===filtered.length}/>
                </th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">PVEN / TRAZABILIDAD</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Cliente</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Total COP</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Anticipo</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Saldo</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Entrega Est.</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide">Estado</th>
                <th className="px-4 py-4 text-xs font-black text-gray-400 uppercase tracking-wide text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {loading?(
                <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto mb-3"/>
                  Cargando pedidos...
                </td></tr>
              ):filtered.length===0?(
                <tr><td colSpan={9} className="text-center py-16 text-gray-400">
                  <ShoppingCart size={36} className="mx-auto mb-3 opacity-25"/>
                  <p className="font-medium">{search?`Sin resultados para "${search}"`:'Sin pedidos de venta'}</p>
                </td></tr>
              ):filtered.map(p=>{
                const st=VEN_ESTADOS[p.estado]||{bg:'bg-gray-100',text:'text-gray-700',border:'border-gray-200',label:p.estado};
                const isOpen=openMenu===p.id;
                return (
                  <tr key={p.id} className="hover:bg-indigo-50/30 cursor-pointer transition-colors group">
                    <td className="px-5 py-4"><input type="checkbox" className="rounded border-gray-300" checked={selectedIds.has(p.id)} onChange={()=>toggleSelect(p.id)}/></td>
                    <td className="px-4 py-4" onClick={()=>fetchDetail(p.id)}>
                      <p className="font-bold text-indigo-700 hover:underline">{p.numero}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{[p.sc_numero,p.cot_numero].filter(Boolean).join(' / ')}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-700 font-medium" onClick={()=>fetchDetail(p.id)}>{p.customer_name||'-'}</td>
                    <td className="px-4 py-4 font-bold text-gray-900" onClick={()=>fetchDetail(p.id)}>{fCOP(p.total_cop)}</td>
                    <td className="px-4 py-4 text-emerald-600 font-bold" onClick={()=>fetchDetail(p.id)}>{fCOP(p.anticipo_cop)}</td>
                    <td className="px-4 py-4 text-red-600 font-bold" onClick={()=>fetchDetail(p.id)}>{fCOP(p.saldo_cop)}</td>
                    <td className="px-4 py-4 text-gray-500 text-xs" onClick={()=>fetchDetail(p.id)}>{fDate(p.fecha_entrega_estimada)}</td>
                    <td className="px-4 py-4" onClick={()=>fetchDetail(p.id)}>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
                    </td>
                    <td className="px-4 py-4 text-right relative">
                      <button onClick={(e)=>{e.stopPropagation();setOpenMenu(isOpen?null:p.id);}}
                        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-700 transition-colors">
                        <MoreHorizontal size={18}/>
                      </button>
                      {isOpen&&(
                        <>
                          <div className="fixed inset-0 z-10" onClick={()=>setOpenMenu(null)}/>
                          <div className="absolute right-6 top-12 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-20">
                            <button className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium text-indigo-700 flex items-center gap-2" onClick={()=>{setOpenMenu(null);fetchDetail(p.id);}}>
                              <FileCheck size={14}/> Ver Detalle
                            </button>
                            <button className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium flex items-center gap-2 text-gray-700" onClick={()=>{setOpenMenu(null);fetchDetail(p.id);setIsEditMode(true);}}>
                              <Edit2 size={14}/> Editar
                            </button>
                            <div className="border-t border-gray-100 my-1"/>
                            <button className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium flex items-center gap-2 text-gray-700" onClick={()=>{setOpenMenu(null);handleCrearPXP(p.id);}}>
                              <DollarSign size={14}/> Crear PXP
                            </button>
                            <div className="border-t border-gray-100 my-1"/>
                            <button className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm font-medium text-red-600 flex items-center gap-2">
                              <X size={14}/> Cancelar Pedido
                            </button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400 font-medium">
            <span>{filtered.length} de {pedidos.length} pedidos</span>
            {selectedIds.size>0&&<span className="text-indigo-600 font-bold">{selectedIds.size} seleccionados</span>}
          </div>
        </div>
      </div>

      {/* DETAIL PANEL (full-width left:240px) */}
      {selectedPedido&&(
        <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl border-l border-gray-200 flex flex-col" style={{left:'240px'}}>
          {/* Panel Header */}
          <div className="bg-gradient-to-r from-indigo-50 to-white px-8 py-5 border-b border-gray-100 flex justify-between items-center">
            <div className="flex items-center gap-4">
              <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow"><ShoppingCart size={22}/></div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-xl font-black text-gray-900">Pedido {selectedPedido.numero}</h2>
                  <span className={`px-3 py-1 rounded-full text-xs font-medium border ${(VEN_ESTADOS[selectedPedido.estado]||{bg:'bg-gray-100',text:'text-gray-700',border:'border-gray-200'}).bg} ${(VEN_ESTADOS[selectedPedido.estado]||{}).text} ${(VEN_ESTADOS[selectedPedido.estado]||{}).border}`}>
                    {(VEN_ESTADOS[selectedPedido.estado]||{label:selectedPedido.estado}).label}
                  </span>
                </div>
                <p className="text-xs text-gray-400 mt-0.5">{selectedPedido.customer_name} &nbsp;•&nbsp; {fDate(selectedPedido.created_at)}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={()=>setIsEditMode(!isEditMode)}
                className={`p-2.5 rounded-xl border transition-colors ${isEditMode?'bg-indigo-100 text-indigo-700 border-indigo-300':'text-gray-500 border-gray-200 hover:bg-gray-100'}`}>
                <Edit2 size={18}/>
              </button>
              <button onClick={()=>{setSelectedPedido(null);setIsEditMode(false);}} className="p-2.5 rounded-xl border border-gray-200 text-gray-500 hover:bg-gray-100">
                <X size={18}/>
              </button>
            </div>
          </div>

          {/* Panel Body split */}
          <div className="flex flex-1 overflow-hidden">

            {/* LEFT 45% — Info */}
            <div className="w-[45%] border-r border-gray-100 p-7 overflow-y-auto space-y-5 bg-gray-50/40">

              {/* Cliente */}
              <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">Informacion del Cliente</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-gray-400 text-xs mb-0.5">Nombre</p><p className="font-bold">{selectedPedido.customer_name||'-'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-0.5">Telefono</p><p>{selectedPedido.customer_phone||'-'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-0.5">Email</p><p className="truncate">{selectedPedido.customer_email||'-'}</p></div>
                  <div><p className="text-gray-400 text-xs mb-0.5">COT / SC</p><p className="text-indigo-600 font-medium">{selectedPedido.cot_numero||'-'} / {selectedPedido.sc_numero||'-'}</p></div>
                </div>
              </section>

              {/* Resumen Financiero */}
              <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-4">Resumen Financiero</h3>
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-gray-400 text-xs mb-1">Total a Pagar</p>
                    <p className="text-3xl font-black text-gray-900">{fCOP(selectedPedido.total_cop)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-gray-400 text-xs mb-1">Saldo Pendiente</p>
                    <p className="text-xl font-black text-red-600">{fCOP(selectedPedido.saldo_cop)}</p>
                  </div>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{width:`${Math.min(100,((selectedPedido.anticipo_cop||0)/(selectedPedido.total_cop||1))*100)}%`}}/>
                </div>
                <p className="text-xs text-gray-400 text-right">Anticipo: <span className="text-emerald-600 font-bold">{fCOP(selectedPedido.anticipo_cop)}</span></p>
              </section>

              {/* Datos Entrega */}
              <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">Datos de Entrega</h3>
                {isEditMode?(
                  <div className="space-y-3 text-sm">
                    <div><label className="text-xs text-gray-500 mb-1 block">Fecha Estimada</label><input type="date" value={editForm.fecha_entrega_estimada} onChange={e=>setEditForm({...editForm,fecha_entrega_estimada:e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Direccion Entrega</label><input type="text" value={editForm.direccion_entrega} onChange={e=>setEditForm({...editForm,direccion_entrega:e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Estado</label>
                      <select value={editForm.estado} onChange={e=>setEditForm({...editForm,estado:e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200">
                        {Object.keys(VEN_ESTADOS).map(k=><option key={k} value={k}>{VEN_ESTADOS[k].label}</option>)}
                      </select>
                    </div>
                    <div><label className="text-xs text-gray-500 mb-1 block">PEC Numero</label><input type="text" value={editForm.pec_numero} onChange={e=>setEditForm({...editForm,pec_numero:e.target.value})} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200"/></div>
                    <div><label className="text-xs text-gray-500 mb-1 block">Notas</label><textarea value={editForm.notas} onChange={e=>setEditForm({...editForm,notas:e.target.value})} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-200 resize-none"/></div>
                    <button onClick={handleSaveEdit} className="w-full bg-indigo-600 text-white py-2.5 rounded-xl flex items-center justify-center gap-2 font-bold hover:bg-indigo-700">
                      <Save size={14}/> Guardar Cambios
                    </button>
                  </div>
                ):(
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><p className="text-gray-400 text-xs mb-0.5">Fecha Estimada</p><p className="font-medium">{fDate(selectedPedido.fecha_entrega_estimada)}</p></div>
                    <div><p className="text-gray-400 text-xs mb-0.5">PEC Numero</p><p className="font-medium">{selectedPedido.pec_numero||'-'}</p></div>
                    <div className="col-span-2"><p className="text-gray-400 text-xs mb-0.5">Direccion Entrega</p><p>{selectedPedido.direccion_entrega||'-'}</p></div>
                    <div className="col-span-2"><p className="text-gray-400 text-xs mb-0.5">Notas</p><p className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-gray-700">{selectedPedido.notas||'Sin notas.'}</p></div>
                  </div>
                )}
              </section>

              {/* Productos */}
              <section className="bg-white rounded-2xl p-5 border border-gray-100 shadow-sm">
                <h3 className="text-xs font-black text-gray-400 uppercase tracking-wide mb-3">Productos</h3>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100"><tr><th className="p-2 text-left text-xs font-bold text-gray-400">Producto</th><th className="p-2 text-center text-xs font-bold text-gray-400">Cant</th><th className="p-2 text-right text-xs font-bold text-gray-400">P.U.</th><th className="p-2 text-right text-xs font-bold text-gray-400">Subtotal</th></tr></thead>
                  <tbody>
                    {(selectedPedido.productos||[]).map((p:any,i:number)=>(
                      <tr key={i} className="border-b last:border-0">
                        <td className="p-2 truncate max-w-[140px]" title={p.descripcion||p.producto_nombre}>{p.descripcion||p.producto_nombre}</td>
                        <td className="p-2 text-center">{p.cantidad}</td>
                        <td className="p-2 text-right">{fCOP(p.precio_unitario)}</td>
                        <td className="p-2 text-right font-bold">{fCOP(p.subtotal)}</td>
                      </tr>
                    ))}
                    {(!selectedPedido.productos||selectedPedido.productos.length===0)&&<tr><td colSpan={4} className="text-center py-4 text-gray-400 text-xs">Sin productos registrados</td></tr>}
                  </tbody>
                </table>
              </section>
            </div>

            {/* RIGHT 55% — Acciones + Actividad/Chatter */}
            <div className="w-[55%] bg-white p-7 overflow-y-auto flex flex-col gap-4">

              {/* Action buttons row */}
              <div className="bg-gray-50 rounded-2xl p-4 border border-gray-100 flex flex-wrap gap-2">
                {!selectedPedido.pxp_id&&(
                  <button onClick={()=>handleCrearPXP(selectedPedido.id)} className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 shadow-sm">
                    <DollarSign size={14}/> Crear PXP
                  </button>
                )}
                {selectedPedido.pxp_numero&&(
                  <span className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl text-sm font-bold">
                    <CheckCircle2 size={14}/> PXP: {selectedPedido.pxp_numero}
                  </span>
                )}
                <div className="flex-1"/>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-[#25D366] text-white rounded-xl text-sm font-bold hover:bg-[#1ebe5d] shadow-sm"
                  onClick={()=>{if(selectedPedido.customer_phone) window.open(`https://wa.me/57${selectedPedido.customer_phone.replace(/\D/g,'')}?text=Hola,%20somos%20Nebulae.%20Su%20pedido%20${selectedPedido.numero}...`,'_blank');}}>
                  <MessageCircle size={14}/> WhatsApp
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-300">
                  <Phone size={14}/> Llamar
                </button>
                <button className="flex items-center gap-1.5 px-3 py-2 bg-gray-200 text-gray-700 rounded-xl text-sm font-bold hover:bg-gray-300">
                  <Mail size={14}/> Email
                </button>
              </div>

              {/* Actividad/Chatter area */}
              <div className="flex-1 border border-gray-100 rounded-2xl overflow-hidden flex flex-col bg-white shadow-sm">
                <div className="flex border-b border-gray-100 bg-gray-50/50">
                  <button onClick={()=>setPanelTab('actividad')}
                    className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-colors ${panelTab==='actividad'?'text-indigo-700 border-indigo-600 bg-white':'text-gray-500 border-transparent hover:text-gray-700'}`}>
                    Actividad y Notas
                  </button>
                  <button onClick={()=>setPanelTab('chatter')}
                    className={`px-6 py-3.5 text-sm font-bold border-b-2 transition-colors ${panelTab==='chatter'?'text-indigo-700 border-indigo-600 bg-white':'text-gray-500 border-transparent hover:text-gray-700'}`}>
                    Chatter
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 bg-gray-50/30">
                  {panelTab==='actividad'?(
                    <div className="space-y-3 relative before:absolute before:left-4 before:top-0 before:bottom-0 before:w-0.5 before:bg-gray-100">
                      {(selectedPedido.actividades||[]).filter((a:any)=>a.action!=='CHATTER').length===0&&<p className="text-center text-gray-400 text-sm py-8">Sin actividad registrada.</p>}
                      {[...(selectedPedido.actividades||[]).filter((a:any)=>a.action!=='CHATTER')].reverse().map((a:any,i:number)=>(
                        <div key={i} className="flex gap-4 pl-10 relative">
                          <div className="absolute left-2 top-2 w-4 h-4 rounded-full border-2 border-white shadow" style={{backgroundColor:({CREATED:'#6366f1',UPDATED:'#3b82f6',ESTADO_CHANGED:'#f59e0b',SENT:'#10b981',CONFIRMED:'#059669',REJECTED:'#ef4444'}as any)[a.action]||'#94a3b8'}}/>
                          <div className="flex-1 bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                            <div className="flex justify-between items-start">
                              <p className="font-bold text-gray-800 text-sm">{a.description||a.action}</p>
                              <p className="text-xs text-gray-400 ml-3 shrink-0">{fDate(a.created_at)}</p>
                            </div>
                            {a.user_name&&<p className="text-xs text-gray-400 mt-0.5">{a.user_name}</p>}
                          </div>
                        </div>
                      ))}
                    </div>
                  ):(
                    <div className="space-y-3">
                      {(selectedPedido.actividades||[]).filter((a:any)=>a.action==='CHATTER').length===0&&<p className="text-center text-gray-400 text-sm py-8">Sin mensajes de chatter.</p>}
                      {(selectedPedido.actividades||[]).filter((a:any)=>a.action==='CHATTER').map((a:any,i:number)=>(
                        <div key={i} className="bg-green-50 border border-green-100 rounded-xl p-4">
                          <p className="text-sm text-green-900">{a.description}</p>
                          <p className="text-xs text-green-600 mt-1 font-medium">{a.user_name} — {fDate(a.created_at)}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t border-gray-100 bg-white">
                  <div className="flex gap-2">
                    <input type="text" value={chatterMsg} onChange={e=>setChatterMsg(e.target.value)}
                      onKeyDown={e=>{if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();handleSendChatter();}}}
                      placeholder={panelTab==='chatter'?'Mensaje de chatter...':'Registrar nota...'}
                      className="flex-1 border border-gray-200 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/>
                    <button onClick={()=>window.open(`https://wa.me/57${(selectedPedido.customer_phone||'').replace(/\D/g,'')}?text=${encodeURIComponent(chatterMsg)}`,'_blank')}
                      className="px-3 py-2.5 bg-[#25D366] text-white rounded-xl hover:bg-[#1ebe5d]" title="WhatsApp">
                      <MessageCircle size={15}/>
                    </button>
                    <button onClick={handleSendChatter} disabled={chatterSending||!chatterMsg.trim()}
                      className="bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-bold hover:bg-indigo-700 disabled:opacity-50">
                      {chatterSending?'...':'Registrar'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
