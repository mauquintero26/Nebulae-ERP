'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, X, Check, ShoppingCart, Package, ChevronRight,
  Phone, Mail, MapPin, ArrowRight, ExternalLink, Plus, AlertCircle } from 'lucide-react';

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
  PENDIENTE_COMPRA: { label: 'Pendiente de compra', color: '#f59e0b', bg: '#fffbeb' },
  EN_TRANSITO:      { label: 'En transito',          color: '#3b82f6', bg: '#eff6ff' },
  RECIBIDO:         { label: 'Recibido',             color: '#8b5cf6', bg: '#f5f3ff' },
  FACTURADO:        { label: 'Facturado',            color: '#10b981', bg: '#f0fdf4' },
  COMPLETADO:       { label: 'Completado',           color: '#10b981', bg: '#f0fdf4' },
  CANCELADO:        { label: 'Cancelado',            color: '#ef4444', bg: '#fef2f2' },
};

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#6366f1', bg: '#eef2ff' };
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}
const fDate = (iso: string|null) => iso ? new Date(iso).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function VentasPage() {
  const [vens, setVens] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [selected, setSelected] = useState<any|null>(null);
  const [currentUser, setCurrentUser] = useState('');
  const [showPXPModal, setShowPXPModal] = useState(false);
  const [creatingPXP, setCreatingPXP] = useState(false);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterEstado) params.set('estado', filterEstado);
      const d = await apiFetch(`/ventas/pedidos?${params}&limit=100`);
      setVens(Array.isArray(d) ? d : (d?.data ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setVens([]); }
    finally { setLoading(false); }
  }, [search, filterEstado]);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    const d = await apiFetch(`/ventas/pedidos/${id}`);
    setSelected(d);
  }

  async function createPXP() {
    setCreatingPXP(true);
    try {
      await apiFetch(`/ventas/pedidos/${selected.id}/crear-pxp`, {
        method: 'POST',
        body: JSON.stringify({ monto_anticipo: selected.anticipo_cop, user_name: currentUser }),
      });
      setShowPXPModal(false);
      loadDetail(selected.id);
    } catch (err: any) { alert(err.message); }
    setCreatingPXP(false);
  }

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-emerald-50 rounded-xl flex items-center justify-center text-emerald-600">
            <ShoppingCart size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Pedidos de Venta</h1>
            <p className="text-xs text-slate-500">{total} pedidos &bull; VEN-YYYY####</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar VEN, COT, cliente..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-emerald-400 w-56" />
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="/dashboard/ventas/cotizacion" className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <ArrowRight size={16} /> Ir a Cotizaciones
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? 'w-[52%]' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-emerald-400" /></div>
            ) : vens.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <ShoppingCart size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sin pedidos de venta. Confirma una cotizacion.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">VEN #</th>
                    <th className="px-4 py-3">SC / COT</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Saldo</th>
                    <th className="px-4 py-3">Entrega Est.</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Compra</th>
                  </tr>
                </thead>
                <tbody>
                  {vens.map(v => (
                    <tr key={v.id} onClick={() => loadDetail(v.id)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-emerald-50/30 ${selected?.id===v.id?'bg-emerald-50/50':''}`}>
                      <td className="px-4 py-3 font-bold text-emerald-600">{v.numero}</td>
                      <td className="px-4 py-3 text-xs">
                        {v.sc_numero && <div className="text-indigo-600">{v.sc_numero}</div>}
                        {v.cot_numero && <div className="text-amber-600">{v.cot_numero}</div>}
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-800">{v.customer_name || '-'}</td>
                      <td className="px-4 py-3 font-bold">{fCOP(v.total_cop)}</td>
                      <td className="px-4 py-3 text-slate-600">{fCOP(v.saldo_cop)}</td>
                      <td className="px-4 py-3 text-slate-500">{fDate(v.fecha_entrega_estimada)}</td>
                      <td className="px-4 py-3"><Badge estado={v.estado} /></td>
                      <td className="px-4 py-3">
                        {v.pec_numero ? (
                          <span className="text-xs font-bold text-purple-600">{v.pec_numero}</span>
                        ) : (
                          <span className="text-xs text-slate-300">-</span>
                        )}
                      </td>
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
                <div className="flex items-center gap-2 mt-0.5">
                  {selected.sc_numero && <span className="text-xs bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-full font-bold">{selected.sc_numero}</span>}
                  {selected.cot_numero && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">{selected.cot_numero}</span>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!selected.pec_id && (
                  <a href="/dashboard/compras/pedidos"
                    className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    <Package size={12} /> Crear Pedido de Compra
                  </a>
                )}
                {!selected.pxp_id && selected.total_cop > 0 && (
                  <button onClick={() => setShowPXPModal(true)}
                    className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    Crear PXP
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge estado={selected.estado} />
                {selected.pec_numero && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">PEC: {selected.pec_numero}</span>}
                {selected.pxp_numero && <span className="text-xs bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full font-bold">PXP: {selected.pxp_numero}</span>}
              </div>

              {/* Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Cliente</p>
                <div className="font-bold text-slate-800 mb-1">{selected.customer_name}</div>
                {selected.customer_phone && <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-emerald-600 mb-0.5"><Phone size={12} />{selected.customer_phone}</a>}
                {selected.customer_email && <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-1.5 text-sm text-slate-600 hover:text-indigo-600 mb-0.5"><Mail size={12} />{selected.customer_email}</a>}
                {selected.direccion_entrega && <p className="flex items-center gap-1.5 text-sm text-slate-600"><MapPin size={12} />Entrega: {selected.direccion_entrega}</p>}
              </div>

              {/* Financiero */}
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-indigo-50 rounded-xl p-3"><p className="text-xs text-indigo-600 mb-1">Total</p><p className="font-extrabold text-indigo-700">{fCOP(selected.total_cop)}</p></div>
                <div className="bg-emerald-50 rounded-xl p-3"><p className="text-xs text-emerald-600 mb-1">Anticipo</p><p className="font-extrabold text-emerald-700">{fCOP(selected.anticipo_cop)}</p></div>
                <div className="bg-amber-50 rounded-xl p-3"><p className="text-xs text-amber-600 mb-1">Saldo</p><p className="font-extrabold text-amber-700">{fCOP(selected.saldo_cop)}</p></div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Cotizacion</p><p className="font-bold text-sm">{fDate(selected.fecha_cotizacion)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Entrega Est.</p><p className="font-bold text-sm">{fDate(selected.fecha_entrega_estimada)}</p></div>
              </div>

              {/* Products */}
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
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
                </div>
              )}

              {/* PXP */}
              {selected.pxps?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Orden de Pago (PXP)</p>
                  {selected.pxps.map((p: any) => (
                    <div key={p.id} className="bg-slate-50 rounded-xl p-3 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-slate-800">{p.numero}</p>
                        <p className="text-xs text-slate-500">Pendiente: {fCOP(p.monto_pendiente)}</p>
                      </div>
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${p.estado==='COMPLETADA'?'bg-emerald-100 text-emerald-700':'bg-amber-100 text-amber-700'}`}>{p.estado}</span>
                    </div>
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
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
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

      {/* PXP Modal */}
      {showPXPModal && selected && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <h3 className="font-extrabold text-slate-900 text-lg mb-4">Crear Orden de Pago (PXP)</h3>
            <div className="bg-slate-50 rounded-xl p-4 mb-4 space-y-2">
              <div className="flex justify-between text-sm"><span className="text-slate-500">VEN:</span><span className="font-bold">{selected.numero}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Cliente:</span><span className="font-bold">{selected.customer_name}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Total:</span><span className="font-bold text-indigo-600">{fCOP(selected.total_cop)}</span></div>
              <div className="flex justify-between text-sm"><span className="text-slate-500">Anticipo (50%):</span><span className="font-bold text-emerald-600">{fCOP(selected.anticipo_cop)}</span></div>
              <div className="flex justify-between text-sm border-t border-slate-200 pt-2 mt-2">
                <span className="text-slate-500 font-bold">Saldo a cobrar:</span>
                <span className="font-extrabold text-amber-600">{fCOP(selected.saldo_cop)}</span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setShowPXPModal(false)} className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
              <button onClick={createPXP} disabled={creatingPXP}
                className="flex-1 py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                {creatingPXP ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                Crear PXP
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
