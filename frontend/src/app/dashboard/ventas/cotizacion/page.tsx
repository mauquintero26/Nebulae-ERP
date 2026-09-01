'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus, Search, RefreshCw, X, Check, FileText, ChevronRight,
  Phone, Mail, MapPin, User, DollarSign, Package, ExternalLink,
  Calculator, ArrowRight } from 'lucide-react';

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

const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  BORRADOR:               { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9' },
  ENVIADA:                { label: 'Enviada',               color: '#3b82f6', bg: '#eff6ff' },
  PENDIENTE_CONFIRMACION: { label: 'Pendiente',             color: '#f59e0b', bg: '#fffbeb' },
  CONFIRMADA:             { label: 'Confirmada',             color: '#10b981', bg: '#f0fdf4' },
  RECHAZADA:              { label: 'Rechazada',              color: '#ef4444', bg: '#fef2f2' },
  CANCELADA:              { label: 'Cancelada',              color: '#ef4444', bg: '#fef2f2' },
};

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#6366f1', bg: '#eef2ff' };
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}
const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fCOP  = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function CotizacionesPage() {
  const [cots, setCots] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [editingProd, setEditingProd] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // Edit producto inline
  const [editProds, setEditProds] = useState<any[]>([]);
  const [newProd, setNewProd] = useState({ product_name: '', qty: 1, unit_price_cop: 0, casillero: '', delivery_date: '' });
  const [trm, setTrm] = useState(4200);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || '';
    setCurrentUser(u);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterEstado) params.set('estado', filterEstado);
      const d = await apiFetch(`/ventas/cotizaciones?${params}&limit=100`);
      setCots(Array.isArray(d) ? d : (d?.data ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setCots([]); }
    finally { setLoading(false); }
  }, [search, filterEstado]);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    const d = await apiFetch(`/ventas/cotizaciones/${id}`);
    setSelected(d);
    setEditProds(d.productos || []);
  }

  async function saveProds() {
    const total_cop = editProds.reduce((s, p) => s + (p.qty * p.unit_price_cop), 0);
    const anticipo = total_cop * 0.5;
    await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
      method: 'PATCH',
      body: JSON.stringify({
        productos: editProds,
        subtotal_cop: total_cop,
        total_cop,
        anticipo_cop: anticipo,
        trm_rate: trm,
        updated_by: currentUser,
      }),
    });
    setEditingProd(false);
    loadDetail(selected.id);
    load();
  }

  function addProd() {
    if (!newProd.product_name) return;
    setEditProds(prev => [...prev, { ...newProd, total_cop: newProd.qty * newProd.unit_price_cop }]);
    setNewProd({ product_name: '', qty: 1, unit_price_cop: 0, casillero: '', delivery_date: '' });
  }

  async function changeEstado(estado: string) {
    await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
      method: 'PATCH', body: JSON.stringify({ estado, updated_by: currentUser }),
    });
    loadDetail(selected.id); load();
  }

  async function confirmarCOT() {
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${selected.id}/confirmar`, {
        method: 'POST', body: JSON.stringify({ user_name: currentUser }),
      });
      alert(`Cotizacion confirmada. Pedido de Venta ${d.pedido_venta?.numero} creado.`);
      loadDetail(selected.id); load();
    } catch (err: any) { alert('Error: ' + err.message); }
    setConfirming(false);
  }

  const totalCOP = editProds.reduce((s, p) => s + (p.qty * (p.unit_price_cop || 0)), 0);

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600">
            <Calculator size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Cotizaciones</h1>
            <p className="text-xs text-slate-500">{total} cotizaciones &bull; COT-YYYY####</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar COT, SC, cliente..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-amber-400 w-56" />
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="/dashboard/ventas/solicitud"
            className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <Plus size={16} /> Nueva (desde SC)
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? 'w-[52%]' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-amber-400" /></div>
            ) : cots.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <Calculator size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sin cotizaciones. Confirma una Solicitud para crear una.</p>
                <a href="/dashboard/ventas/solicitud" className="mt-3 inline-flex items-center gap-1 text-indigo-600 font-bold text-sm hover:underline">
                  <ArrowRight size={14} /> Ir a Solicitudes
                </a>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">COT #</th>
                    <th className="px-4 py-3">SC Origen</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Cotizador</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Entrega Est.</th>
                    <th className="px-4 py-3">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {cots.map(cot => (
                    <tr key={cot.id} onClick={() => loadDetail(cot.id)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-amber-50/30 ${selected?.id === cot.id ? 'bg-amber-50/50' : ''}`}>
                      <td className="px-4 py-3 font-bold text-amber-600">{cot.numero}</td>
                      <td className="px-4 py-3">
                        {cot.sc_numero ? <span className="text-indigo-600 font-medium">{cot.sc_numero}</span> : <span className="text-slate-400">-</span>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{cot.customer_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{cot.cotizador || '-'}</td>
                      <td className="px-4 py-3 font-bold text-slate-800">{fCOP(cot.total_cop)}</td>
                      <td className="px-4 py-3 text-slate-500">{fDate(cot.fecha_entrega_estimada)}</td>
                      <td className="px-4 py-3"><Badge estado={cot.estado} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="border-l border-slate-200 bg-white flex flex-col overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg">{selected.numero}</h2>
                {selected.sc_numero && <p className="text-xs text-slate-400">SC Origen: <span className="text-indigo-600 font-bold">{selected.sc_numero}</span></p>}
              </div>
              <div className="flex items-center gap-2">
                {(selected.estado === 'BORRADOR' || selected.estado === 'ENVIADA') && (
                  <button onClick={() => changeEstado('PENDIENTE_CONFIRMACION')}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    Enviar a cliente
                  </button>
                )}
                {(selected.estado === 'BORRADOR' || selected.estado === 'ENVIADA' || selected.estado === 'PENDIENTE_CONFIRMACION') && (
                  <button onClick={confirmarCOT} disabled={confirming}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    {confirming ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                    Confirmar + VEN
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge estado={selected.estado} />
                {selected.pec_numero && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">{selected.pec_numero}</span>}
              </div>

              {/* Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Cliente</p>
                <div className="font-bold text-slate-800 mb-1">{selected.customer_name}</div>
                {selected.customer_phone && <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-600 mb-0.5"><Phone size={12} />{selected.customer_phone}</a>}
                {selected.customer_email && <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 mb-0.5"><Mail size={12} />{selected.customer_email}</a>}
                {selected.customer_address && <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin size={12} />{selected.customer_address}</p>}
              </div>

              {/* Fechas y financiero */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Cotizacion</p><p className="font-bold text-sm">{fDate(selected.fecha_cotizacion)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Entrega Est.</p><p className="font-bold text-sm">{fDate(selected.fecha_entrega_estimada)}</p></div>
                <div className="bg-indigo-50 rounded-xl p-3"><p className="text-xs text-indigo-600 mb-1">Total COP</p><p className="font-extrabold text-base text-indigo-700">{fCOP(selected.total_cop)}</p></div>
                <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-600 mb-1">Anticipo (50%)</p><p className="font-extrabold text-base text-emerald-700">{fCOP(selected.anticipo_cop)}</p></div>
              </div>

              {/* Products */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black text-slate-400 uppercase">Productos</p>
                  <button onClick={() => { setEditingProd(!editingProd); setEditProds(selected.productos || []); }}
                    className="text-xs font-bold text-indigo-600 hover:underline flex items-center gap-1">
                    {editingProd ? 'Cancelar' : 'Editar productos'}
                  </button>
                </div>

                {editingProd ? (
                  <div>
                    <div className="border border-slate-100 rounded-xl overflow-hidden mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50"><tr className="text-slate-400">
                          <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Precio COP</th><th className="px-3 py-2 text-right">Total</th><th></th>
                        </tr></thead>
                        <tbody>
                          {editProds.map((p, i) => (
                            <tr key={i} className="border-t border-slate-50">
                              <td className="px-3 py-2">
                                <input value={p.product_name} onChange={e => { const n=[...editProds]; n[i].product_name=e.target.value; setEditProds(n); }}
                                  className="w-full border border-slate-200 rounded px-1.5 py-1 outline-none text-xs" />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input type="number" value={p.qty} onChange={e => { const n=[...editProds]; n[i].qty=parseInt(e.target.value)||1; setEditProds(n); }}
                                  className="w-14 border border-slate-200 rounded px-1.5 py-1 outline-none text-xs text-right" />
                              </td>
                              <td className="px-3 py-2 text-right">
                                <input type="number" value={p.unit_price_cop} onChange={e => { const n=[...editProds]; n[i].unit_price_cop=parseFloat(e.target.value)||0; setEditProds(n); }}
                                  className="w-24 border border-slate-200 rounded px-1.5 py-1 outline-none text-xs text-right" />
                              </td>
                              <td className="px-3 py-2 text-right font-bold">{fCOP(p.qty*(p.unit_price_cop||0))}</td>
                              <td className="px-3 py-2">
                                <button type="button" onClick={() => setEditProds(prev=>prev.filter((_,j)=>j!==i))} className="text-red-400 hover:text-red-600"><X size={11} /></button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="grid grid-cols-5 gap-2 mb-3">
                      <input placeholder="Producto" value={newProd.product_name} onChange={e=>setNewProd(p=>({...p,product_name:e.target.value}))}
                        className="col-span-2 border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" />
                      <input type="number" placeholder="Qty" value={newProd.qty} onChange={e=>setNewProd(p=>({...p,qty:parseInt(e.target.value)||1}))}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" />
                      <input type="number" placeholder="Precio COP" value={newProd.unit_price_cop||''} onChange={e=>setNewProd(p=>({...p,unit_price_cop:parseFloat(e.target.value)||0}))}
                        className="border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none" />
                      <button type="button" onClick={addProd} className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg px-2 py-1.5 text-xs font-bold flex items-center justify-center"><Plus size={12} /></button>
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-bold text-slate-700">Total: {fCOP(totalCOP)} &bull; Anticipo: {fCOP(totalCOP*0.5)}</p>
                      <button onClick={saveProds} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                        <Check size={12} /> Guardar
                      </button>
                    </div>
                  </div>
                ) : (
                  selected.productos?.length > 0 ? (
                    <div className="border border-slate-100 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                          <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th>
                        </tr></thead>
                        <tbody>
                          {selected.productos.map((p: any, i: number) => (
                            <tr key={i} className="border-t border-slate-50">
                              <td className="px-3 py-2 font-medium">{p.product_name}</td>
                              <td className="px-3 py-2 text-right">{p.qty}</td>
                              <td className="px-3 py-2 text-right">{fCOP(p.unit_price_cop)}</td>
                              <td className="px-3 py-2 text-right font-bold">{fCOP(p.qty*p.unit_price_cop)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : <p className="text-sm text-slate-400 italic">Sin productos. Haz clic en "Editar productos".</p>
                )}
              </div>

              {/* Linked VEN */}
              {selected.pedidos_venta?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Pedidos de Venta</p>
                  {selected.pedidos_venta.map((v: any) => (
                    <a key={v.id} href="/dashboard/ventas/venta"
                      className="flex items-center justify-between p-3 bg-emerald-50 rounded-xl mb-2 hover:bg-emerald-100">
                      <span className="font-bold text-emerald-700">{v.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-emerald-600">{v.estado}</span>
                        <ChevronRight size={14} className="text-emerald-400" />
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Actividades */}
              {selected.actividades?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Actividad</p>
                  <div className="space-y-2">
                    {selected.actividades.map((a: any) => (
                      <div key={a.id} className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-slate-700">{a.description}</p>
                          <p className="text-xs text-slate-400">{fDate(a.created_at)} &bull; {a.user_name || 'Sistema'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
