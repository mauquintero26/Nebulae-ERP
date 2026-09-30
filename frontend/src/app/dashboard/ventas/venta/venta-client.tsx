'use client';

export const dynamic = 'force-dynamic';
import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, RefreshCw, Plus, MoreHorizontal, X, Edit2, FileCheck,
  FileText, AlertCircle, ShoppingCart, Package, DollarSign, UserPlus
} from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Button, EmptyState, Toast, Modal } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';

export function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
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
    <Modal title="Nuevo Proveedor" subtitle="Agregar a la agenda de proveedores" icon={UserPlus} color="purple" onClose={onClose}
      footer={(
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="new-supplier-form" color="purple" icon={UserPlus} loading={saving}>Agregar Proveedor</Button>
        </>
      )}>
      <form id="new-supplier-form" onSubmit={save} className="grid grid-cols-2 gap-4">
        <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Referencia / NIT</label><input value={form.reference} onChange={e=>set('reference',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Telefono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Email</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
        <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Terminos de Pago</label><input value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
      </form>
    </Modal>
  );
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

export default function VentaClient() {
  const router = useRouter();
  const [pedidos, setPedidos]           = useState<any[]>([]);
  const [loading, setLoading]           = useState(true);
  const [search, setSearch]             = useState('');
  const [activeTab, setActiveTab]       = useState('Todos');
  const [currentPage, setCurrentPage]   = useState(1);
  const [pageSize, setPageSize]         = useState(25);
  const [selectedIds, setSelectedIds]   = useState<Set<number>>(new Set());
  const [toast, setToast]               = useState<{msg:string,type:'ok'|'error'}|null>(null);
  const [openMenu, setOpenMenu]         = useState<number|null>(null);

  const showToast = (msg:string, type:'ok'|'error'='ok') => {
    setToast({msg,type});
  };

  const fetchPedidos = async () => {
    setLoading(true);
    try { const d=await apiFetch('/ventas/pedidos?limit=200'); setPedidos(Array.isArray(d)?d:(d?.data??[])); }
    catch(err:any) { showToast(err.message,'error'); }
    finally { setLoading(false); }
  };

  const searchParams = useSearchParams();

  useEffect(()=>{ fetchPedidos(); },[]);

  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id=:
  // redirige a la pagina canonica en vez de duplicar la vista aqui.
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) router.replace(`/dashboard/ventas/venta/${numId}`);
    }
  },[searchParams, router]);

  const TABS = ['Todos','Pend. Compra','En Proceso','Listo Entrega','Entregado','Facturado','Cancelado','Analisis'];
  const tabEstado:Record<string,string> = {'Pend. Compra':'PENDIENTE_COMPRA','En Proceso':'EN_PROCESO','Listo Entrega':'LISTO_ENTREGA','Entregado':'ENTREGADO','Facturado':'FACTURADO','Cancelado':'CANCELADO'};
  const [viewMode, setViewMode] = useState<'lista'|'kanban'>('lista');
  const [showFilterDropdown, setShowFilterDropdown] = useState(false);
  const [filterEstado, setFilterEstado] = useState('');

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
      <Toast toast={toast} onClose={()=>setToast(null)} />

      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/venta" color="indigo" hub={{ href: '/dashboard/ventas' }} />

      {/* HEADER */}
      <div className="bg-white border-b border-gray-100 px-8 py-6">
        <PageHeader
          icon={ShoppingCart} color="indigo"
          title="Pedidos de Venta"
          subtitle="PVEN-YYYY#### • Pipeline: SC → COT → PVEN → PEC → ENINV → PXP"
          actions={(
            <div className="flex items-center gap-3">
              <button onClick={fetchPedidos} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-sm shadow-sm">
                <RefreshCw size={14} className={loading?'animate-spin':''}/> Actualizar
              </button>
              <Button color="indigo" icon={Plus}>Nuevo Pedido</Button>
            </div>
          )} />
      </div>

      {/* KPI CARDS */}
      <div className="px-8 py-5 bg-white border-b border-gray-100">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={FileText} color="indigo" label="Total Pedidos" value={kpis.total}
            hint={`${pedidos.filter(p=>!['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)).length} activos`} />
          <StatCard icon={DollarSign} color="emerald" label="Total Monto" value={fCOP(kpis.monto)} hint="COP acumulado" />
          <StatCard icon={Package} color="orange" label="Pendiente Compra" value={kpis.pCompra} hint="Requieren PEC" />
          <StatCard icon={AlertCircle} color="red" label="Saldo Pendiente" value={fCOP(kpis.sCobro)} hint="Por cobrar" />
        </div>
      </div>

      {/* ROW 1: TABS + VIEW TOGGLE */}
      <div className="px-8 pt-4 pb-0 bg-white flex items-center justify-between">
        <div className="flex items-center gap-1 overflow-x-auto">
          {TABS.map(tab=>{
            const est=tabEstado[tab];
            const count=tab==='Todos'?pedidos.length:tab==='Analisis'?undefined:pedidos.filter(p=>p.estado===est).length;
            const isActive=activeTab===tab;
            return (
              <button key={tab} onClick={()=>setActiveTab(tab)}
                className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${isActive?'bg-indigo-600 text-white shadow-sm':'text-gray-600 hover:text-indigo-700 hover:bg-indigo-50'}`}>
                {tab}{count!==undefined&&<span className={`ml-1.5 text-xs font-black ${isActive?'text-indigo-200':'text-gray-400'}`}>{count}</span>}
              </button>
            );
          })}
        </div>
        {activeTab!=='Analisis'&&(
          <div className="flex items-center gap-1 shrink-0 ml-4">
            <button onClick={()=>setViewMode('lista')}
              className={`p-2 rounded-lg border transition-colors ${viewMode==='lista'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/></svg>
            </button>
            <button onClick={()=>setViewMode('kanban')}
              className={`p-2 rounded-lg border transition-colors ${viewMode==='kanban'?'bg-indigo-50 border-indigo-200 text-indigo-700':'border-gray-200 text-gray-400 hover:bg-gray-50'}`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="14" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor"/></svg>
            </button>
          </div>
        )}
      </div>

      {/* ROW 2: SEARCH + FILTER + COUNT */}
      {activeTab!=='Analisis'&&(
        <div className="px-8 py-3 bg-white border-b border-gray-100 flex items-center gap-3">
          <div className="flex items-center bg-white border border-gray-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[420px] shadow-sm">
            <Search size={14} className="text-gray-400 shrink-0"/>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              placeholder="Buscar por numero, cliente, asesor..."
              className="text-sm bg-transparent outline-none flex-1 placeholder-gray-400"/>
            {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-gray-400 hover:text-gray-600"/></button>}
          </div>
          <div className="relative">
            <button onClick={()=>setShowFilterDropdown(f=>!f)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-semibold transition-colors shadow-sm ${filterEstado?'bg-indigo-50 border-indigo-300 text-indigo-700':'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
              Filtrar Estado
              {filterEstado&&<span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black leading-none">{filterEstado.replace('_',' ')}</span>}
            </button>
            {showFilterDropdown&&(
              <>
                <div className="fixed inset-0 z-10" onClick={()=>setShowFilterDropdown(false)}/>
                <div className="absolute top-full left-0 mt-2 bg-white border border-gray-200 rounded-2xl shadow-2xl p-4 z-20 w-60">
                  <p className="text-xs font-black text-gray-400 uppercase mb-2">Filtrar por Estado</p>
                  {['','PENDIENTE_COMPRA','EN_PROCESO','LISTO_ENTREGA','ENTREGADO','FACTURADO','CANCELADO'].map(e=>(
                    <button key={e} onClick={()=>{setFilterEstado(e);setShowFilterDropdown(false);}}
                      className={`w-full text-left px-3 py-2 text-sm rounded-xl mb-0.5 font-medium transition-colors ${filterEstado===e?'bg-indigo-50 text-indigo-700 font-bold':'hover:bg-gray-50 text-gray-600'}`}>
                      {e||'Todos los estados'}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          <span className="text-sm text-gray-400 font-medium">{filtered.length} registros</span>
        </div>
      )}

      {/* ANALISIS TAB */}
      {activeTab==='Analisis'&&(
        <div className="flex-1 px-8 py-6 bg-gray-50 border-b border-gray-100">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              {label:'Total Pedidos',value:pedidos.length,color:'text-indigo-700'},
              {label:'Monto Total',value:fCOP(pedidos.reduce((a,p)=>a+(Number(p.total_cop)||0),0)),color:'text-gray-900'},
              {label:'Anticipo Cobrado',value:fCOP(pedidos.reduce((a,p)=>a+(Number(p.anticipo_cop)||0),0)),color:'text-emerald-600'},
              {label:'Saldo Pendiente',value:fCOP(pedidos.reduce((a,p)=>a+(Number(p.saldo_cop)||0),0)),color:'text-red-600'},
            ].map((k,i)=>(
              <div key={i} className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase mb-2">{k.label}</p>
                <p className={`text-2xl font-black ${k.color}`}>{k.value}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <h3 className="text-sm font-black text-gray-700 mb-4">Distribucion por Estado</h3>
              {Object.entries(VEN_ESTADOS).map(([key,st])=>{
                const cnt=pedidos.filter(p=>p.estado===key).length;
                const pct=pedidos.length?Math.round((cnt/pedidos.length)*100):0;
                return cnt>0?(
                  <div key={key} className="flex items-center gap-3 mb-2">
                    <span className={`text-xs font-bold ${st.text} shrink-0 w-28`}>{st.label}</span>
                    <div className="flex-1 bg-gray-100 rounded-full h-2 overflow-hidden">
                      <div className={`h-2 rounded-full ${st.bg.replace('bg-','bg-').replace('-100','-400')}`} style={{width:`${pct}%`}}/>
                    </div>
                    <span className="text-xs text-gray-500 w-12 text-right font-bold">{cnt} ({pct}%)</span>
                  </div>
                ):null;
              })}
            </div>
            <div className="bg-white rounded-2xl p-5 border border-gray-200 shadow-sm">
              <h3 className="text-sm font-black text-gray-700 mb-4">Top 5 Clientes por Monto</h3>
              {Object.entries(
                pedidos.reduce((acc:any,p:any)=>{
                  const k=p.customer_name||'Sin cliente';
                  acc[k]=(acc[k]||0)+(Number(p.total_cop)||0);
                  return acc;
                },{})
              ).sort(([,a]:any,[,b]:any)=>b-a).slice(0,5).map(([name,total]:any,i)=>(
                <div key={i} className="flex items-center justify-between py-2 border-b last:border-0">
                  <span className="text-sm font-medium text-gray-700 truncate mr-2">{name}</span>
                  <span className="text-sm font-black text-indigo-700 shrink-0">{fCOP(total)}</span>
                </div>
              ))}
              {pedidos.length===0&&<p className="text-sm text-gray-400 text-center py-4">Sin datos</p>}
            </div>
          </div>
        </div>
      )}

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
                <tr><td colSpan={9}>
                  <EmptyState icon={ShoppingCart} message={search?`Sin resultados para "${search}"`:'Sin pedidos de venta'} />
                </td></tr>
              ):filtered.slice((currentPage-1)*pageSize, currentPage*pageSize).map(p=>{
                const st=VEN_ESTADOS[p.estado]||{bg:'bg-gray-100',text:'text-gray-700',border:'border-gray-200',label:p.estado};
                const isOpen=openMenu===p.id;
                return (
                  <tr key={p.id} className="hover:bg-indigo-50/30 cursor-pointer transition-colors group">
                    <td className="px-5 py-4"><input type="checkbox" className="rounded border-gray-300" checked={selectedIds.has(p.id)} onChange={()=>toggleSelect(p.id)}/></td>
                    <td className="px-4 py-4 cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>
                      <p className="font-bold text-indigo-700 hover:underline">{p.numero}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{[p.sc_numero,p.cot_numero].filter(Boolean).join(' / ')}</p>
                    </td>
                    <td className="px-4 py-4 text-gray-700 font-medium cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>{p.customer_name||'-'}</td>
                    <td className="px-4 py-4 font-bold text-gray-900 cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>{fCOP(p.total_cop)}</td>
                    <td className="px-4 py-4 text-emerald-600 font-bold cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>{fCOP(p.anticipo_cop)}</td>
                    <td className="px-4 py-4 text-red-600 font-bold cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>{fCOP(p.saldo_cop)}</td>
                    <td className="px-4 py-4 text-gray-500 text-xs cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>{fDate(p.fecha_entrega_estimada)}</td>
                    <td className="px-4 py-4 cursor-pointer" onClick={()=>router.push(`/dashboard/ventas/venta/${p.id}`)}>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${st.bg} ${st.text} ${st.border}`}>{st.label}</span>
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
                            <button className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 text-sm font-medium text-indigo-700 flex items-center gap-2" onClick={()=>{setOpenMenu(null);router.push(`/dashboard/ventas/venta/${p.id}`);}}>
                              <FileCheck size={14}/> Ver Detalle
                            </button>
                            <button className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium flex items-center gap-2 text-gray-700" onClick={()=>{setOpenMenu(null);router.push(`/dashboard/ventas/venta/${p.id}`);}}>
                              <Edit2 size={14}/> Editar
                            </button>
                            <div className="border-t border-gray-100 my-1"/>
                            <button className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium flex items-center gap-2 text-gray-700" onClick={()=>{setOpenMenu(null);router.push(`/dashboard/ventas/venta/${p.id}`);}}>
                              <DollarSign size={14}/> Crear PXP
                            </button>
                            {!['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)&&(
                              <>
                                <div className="border-t border-gray-100 my-1"/>
                                <button className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm font-medium text-red-600 flex items-center gap-2" onClick={()=>{setOpenMenu(null);router.push(`/dashboard/ventas/venta/${p.id}`);}}>
                                  <X size={14}/> Cancelar Pedido
                                </button>
                              </>
                            )}
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {/* PAGINATION FOOTER */}
          {activeTab!=='Analisis'&&(
            <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-gray-400">{filtered.length} registros</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-gray-200 rounded-lg px-2 py-1 font-bold text-gray-600 outline-none focus:ring-1 focus:ring-indigo-200">
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                {selectedIds.size>0&&<span className="text-indigo-600 font-bold text-xs">{selectedIds.size} seleccionados</span>}
              </div>
              {Math.ceil(filtered.length/pageSize)>1&&(
                <div className="flex items-center gap-1">
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">«</button>
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">‹</button>
                  {Array.from({length:Math.min(5,Math.ceil(filtered.length/pageSize))},(_,i)=>{
                    const tp=Math.ceil(filtered.length/pageSize);let page=i+1;
                    if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                    return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-indigo-600 text-white border-indigo-600':'border-gray-200 hover:bg-gray-100'}`}>{page}</button>;
                  })}
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">›</button>
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(Math.ceil(filtered.length/pageSize))} className="px-2 py-1 text-xs font-bold border border-gray-200 rounded-lg disabled:opacity-40 hover:bg-gray-100">»</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>


    </div>
  );
}


