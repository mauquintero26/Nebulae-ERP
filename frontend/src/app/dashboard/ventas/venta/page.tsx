'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingCart, Activity, Clock, CheckCircle2, DollarSign,
  Search, X, RefreshCw, AlertCircle, MoreVertical, Plus,
  Truck, CreditCard, ChevronRight, ShieldAlert, FileText
} from 'lucide-react';

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

const SUB_MODULES = [
  { name: 'Solicitud',       path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',      path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta',           path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',    path: '/dashboard/ventas/exportar-dia' },
  { name: 'Proyecciones',    path: '/dashboard/ventas/proyecciones' },
];

const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  PENDIENTE_COMPRA: { label: 'Pend. Compra',  color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  EN_TRANSITO:      { label: 'En Transito',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  ENTREGADO:        { label: 'Entregado',     color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  COMPLETADO:       { label: 'Completado',    color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  CANCELADO:        { label: 'Cancelado',     color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

const fDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function VentaPage() {
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Pendiente Compra');
  const [selected, setSelected] = useState<any | null>(null);
  const [showPXP, setShowPXP] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/ventas/pedidos?limit=100');
      setVentas(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setVentas([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function crearPXP(ventaId: number) {
    setSaving(true);
    try {
      await apiFetch(`/ventas/pedidos/${ventaId}/crear-pxp`, { method: 'POST' });
      load();
      setShowPXP(false);
      setSelected(null);
    } catch (err: any) { alert(`Error: ${err.message}`); }
    setSaving(false);
  }

  const pendienteCompra = ventas.filter(v => v.estado === 'PENDIENTE_COMPRA' || !v.pec_id).length;
  const enTransito = ventas.filter(v => v.estado === 'EN_TRANSITO').length;
  const completadas = ventas.filter(v => v.estado === 'COMPLETADO' || v.estado === 'ENTREGADO').length;
  const montoTotal = ventas.reduce((s, v) => s + (v.total_cop || 0), 0);
  const sinPEC = ventas.filter(v => !v.pec_id && v.estado !== 'COMPLETADO').length;

  const filtered = ventas.filter(v => {
    const ms = !search || JSON.stringify(v).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Pendiente Compra') return v.estado === 'PENDIENTE_COMPRA' || (!v.pec_id && v.estado !== 'COMPLETADO');
    if (activeTab === 'En Transito') return v.estado === 'EN_TRANSITO';
    if (activeTab === 'Completadas') return v.estado === 'COMPLETADO' || v.estado === 'ENTREGADO';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Ventas:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/ventas/venta'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700 border-transparent hover:border-amber-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert banner */}
      {sinPEC > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-4 z-20">
          <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-red-800">PEDIDOS DE VENTA SIN COMPRA ASIGNADA</h4>
            <p className="text-xs font-bold text-red-600 mt-1">{sinPEC} pedido(s) sin Pedido de Compra (PEC). Riesgo de no cumplir al cliente.</p>
          </div>
          <Link href="/dashboard/compras/pedidos" className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 shrink-0">
            Crear PEC
          </Link>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl shadow-inner"><ShoppingCart size={24} /></div>
              Pedidos de Venta
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Confirmaciones de ventas que requieren abastecimiento y despacho al cliente.</p>
          </div>
          <Link href="/dashboard/ventas/cotizacion"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
            <Plus size={18} /> Nueva (desde COT)
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Pendiente Compra')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pendiente de Compra</p>
            <h2 className="text-4xl font-black text-slate-800">{pendienteCompra}</h2>
            {sinPEC > 0 && <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1"><AlertCircle size={12}/> {sinPEC} sin PEC asignado</p>}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all"
            onClick={() => setActiveTab('En Transito')}>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><Truck size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">En Transito</p>
            <h2 className="text-4xl font-black text-slate-800">{enTransito}</h2>
            <p className="text-xs font-bold text-blue-600 mt-2">Mercancia en camino</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-indigo-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform"><DollarSign size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto Total VEN</p>
            <h2 className="text-3xl font-black text-slate-800">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Suma de pedidos</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer"
            onClick={() => setActiveTab('Completadas')}>
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-emerald-100 uppercase tracking-wider mb-1 relative z-10">Completadas</p>
            <h2 className="text-4xl font-black text-white relative z-10">{completadas}</h2>
            <p className="text-xs font-bold text-emerald-100 mt-2 relative z-10">Entregadas al cliente</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Pendiente Compra', 'En Transito', 'Completadas'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Pendiente Compra' ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'En Transito'       ? 'bg-blue-100 text-blue-800 shadow-sm border border-blue-200'
                      :                               'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'Pendiente Compra' ? pendienteCompra : tab === 'En Transito' ? enTransito : completadas})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar VEN, cliente..."
                className="bg-transparent text-sm outline-none w-52 text-slate-700" />
              <button onClick={load} className="ml-2 text-slate-400">
                <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">VEN # (Trazabilidad)</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Saldo</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4">Compra</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-emerald-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando ventas...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-20 text-center">
                    <ShoppingCart size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin pedidos de venta en este estado</p>
                    <p className="text-slate-400 text-sm mt-1">Los pedidos se crean al confirmar una Cotizacion</p>
                  </td></tr>
                ) : filtered.map((v: any) => {
                  const saldo = (v.total_cop || 0) - (v.anticipo_cop || 0);
                  return (
                    <tr key={v.id} onClick={() => setSelected(v)}
                      className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === v.id ? 'bg-emerald-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <p className="font-black text-emerald-700">{v.numero}</p>
                        <div className="flex gap-1 mt-0.5 flex-wrap">
                          {v.cot_numero && <span className="text-xs text-amber-500 font-bold">COT: {v.cot_numero}</span>}
                          {v.sc_numero && <span className="text-xs text-purple-500 font-bold">SC: {v.sc_numero}</span>}
                        </div>
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-800">{v.customer_name || '-'}</td>
                      <td className="px-6 py-4 text-slate-600">{fDate(v.fecha_pedido)}</td>
                      <td className="px-6 py-4 font-black text-slate-800">{fCOP(v.total_cop || 0)}</td>
                      <td className={`px-6 py-4 font-bold ${saldo > 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                        {fCOP(saldo)}
                      </td>
                      <td className="px-6 py-4"><Badge estado={v.estado} /></td>
                      <td className="px-6 py-4">
                        {v.pec_numero ? (
                          <Link href="/dashboard/compras/pedidos" onClick={e => e.stopPropagation()}
                            className="text-purple-600 font-bold hover:underline text-xs">{v.pec_numero}</Link>
                        ) : (
                          <span className="text-xs text-slate-400">Sin PEC</span>
                        )}
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!v.pec_id && (
                            <Link href="/dashboard/compras/pedidos" onClick={e => e.stopPropagation()}
                              className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded text-xs font-bold">
                              Crear PEC
                            </Link>
                          )}
                          {!v.pxp_id && v.pec_id && (
                            <button onClick={e => { e.stopPropagation(); setSelected(v); setShowPXP(true); }}
                              className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded text-xs font-bold">
                              Crear PXP
                            </button>
                          )}
                          <button className="text-slate-400 hover:text-slate-700 p-1"><MoreVertical size={16} /></button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && !showPXP && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b flex items-start justify-between bg-gradient-to-r from-emerald-50 to-white">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">{selected.numero}</h2>
                <p className="text-xs text-slate-400">Pedido de Venta</p>
                <div className="flex gap-2 mt-2 flex-wrap">
                  {selected.sc_numero && <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-bold">SC: {selected.sc_numero}</span>}
                  {selected.cot_numero && <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">COT: {selected.cot_numero}</span>}
                  {selected.pec_numero && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">PEC: {selected.pec_numero}</span>}
                </div>
              </div>
              <div className="flex gap-2">
                {!selected.pxp_id && selected.pec_id && (
                  <button onClick={() => setShowPXP(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5">
                    <CreditCard size={13} /> Crear PXP
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Badge */}
              <Badge estado={selected.estado} />

              {/* Financiero */}
              <div className="grid grid-cols-3 gap-3">
                {[
                  { label: 'Total VEN', value: fCOP(selected.total_cop || 0), color: 'text-slate-900' },
                  { label: 'Anticipo', value: fCOP(selected.anticipo_cop || 0), color: 'text-emerald-700' },
                  { label: 'Saldo', value: fCOP((selected.total_cop || 0) - (selected.anticipo_cop || 0)), color: (selected.total_cop || 0) - (selected.anticipo_cop || 0) > 0 ? 'text-red-600' : 'text-emerald-600' },
                ].map(({ label, value, color }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3 text-center">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className={`font-black text-base ${color}`}>{value}</p>
                  </div>
                ))}
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Cliente', value: selected.customer_name || '-' },
                  { label: 'Fecha', value: fDate(selected.fecha_pedido) },
                  { label: 'Modalidad', value: selected.modalidad_pago || '-' },
                  { label: 'Asesor', value: selected.asesor || '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="font-bold text-sm text-slate-800">{value}</p>
                  </div>
                ))}
              </div>

              {/* Productos */}
              {(selected.productos || []).length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                      </tr></thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{fCOP(p.unit_price || 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* PEC link */}
              {!selected.pec_id && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-black text-amber-700 mb-2">Sin Pedido de Compra asignado</p>
                  <Link href="/dashboard/compras/pedidos"
                    className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2">
                    <Plus size={12} /> Crear PEC para este VEN
                  </Link>
                </div>
              )}

              {selected.pec_id && (
                <div className="bg-purple-50 border border-purple-100 rounded-xl p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs text-purple-600 font-black uppercase mb-0.5">Pedido de Compra</p>
                    <p className="font-extrabold text-purple-800">{selected.pec_numero}</p>
                  </div>
                  <Link href="/dashboard/compras/pedidos"
                    className="bg-purple-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    Ver PEC <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* PXP Modal */}
      {showPXP && selected && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r from-blue-50 to-white">
              <div>
                <h3 className="font-extrabold text-xl text-slate-900">Crear PXP (Anticipo)</h3>
                <p className="text-xs text-slate-400 mt-0.5">Para {selected.numero}</p>
              </div>
              <button onClick={() => setShowPXP(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">Total VEN</p>
                  <p className="font-black text-xl">{fCOP(selected.total_cop || 0)}</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-4 text-center">
                  <p className="text-xs text-slate-400 mb-1">Saldo Pendiente</p>
                  <p className="font-black text-xl text-emerald-700">{fCOP((selected.total_cop || 0) - (selected.anticipo_cop || 0))}</p>
                </div>
              </div>
              <p className="text-sm text-slate-500">Se generara el documento PXP vinculado a este VEN para control de pagos.</p>
              <div className="flex gap-3">
                <button onClick={() => setShowPXP(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold">Cancelar</button>
                <button onClick={() => crearPXP(selected.id)} disabled={saving}
                  className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <CreditCard size={14} />}
                  {saving ? 'Creando...' : 'Crear PXP'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
