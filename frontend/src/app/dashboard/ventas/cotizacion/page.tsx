'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Calculator, Clock, CheckCircle2, DollarSign, Activity,
  Search, X, RefreshCw, AlertCircle, MoreVertical, Plus,
  Phone, Mail, MapPin, ChevronRight, FileText, ShieldAlert
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
  BORRADOR:    { label: 'Borrador',    color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ENVIADA:     { label: 'Enviada',     color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  PENDIENTE:   { label: 'Pendiente',   color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMADA:  { label: 'Confirmada',  color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  RECHAZADA:   { label: 'Rechazada',   color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  VENCIDA:     { label: 'Vencida',     color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
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
const isExpiringSoon = (iso: string | null) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d >= now && (d.getTime() - now.getTime()) / 86400000 <= 7;
};
const isOverdue = (iso: string | null) => iso ? new Date(iso) < new Date() : false;

export default function CotizacionPage() {
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Activas');
  const [selected, setSelected] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/ventas/cotizaciones?limit=100');
      setCotizaciones(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setCotizaciones([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function confirmar(id: number) {
    setSaving(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${id}/confirmar`, { method: 'POST' });
      load();
      setSelected(null);
    } catch (err: any) { alert(`Error: ${err.message}`); }
    setSaving(false);
  }

  const activas = cotizaciones.filter(c => c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA');
  const confirmadas = cotizaciones.filter(c => c.estado === 'CONFIRMADA');
  const rechazadas = cotizaciones.filter(c => c.estado === 'RECHAZADA');

  const sinConfirmar72h = activas.filter(c => {
    if (!c.created_at) return false;
    return (new Date().getTime() - new Date(c.created_at).getTime()) / 3600000 > 72;
  }).length;
  const vencenHoy = activas.filter(c => isExpiringSoon(c.vencimiento)).length;
  const montoTotal = cotizaciones.reduce((s, c) => s + (c.total_cop || 0), 0);

  const filtered = cotizaciones.filter(c => {
    const ms = !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Activas') return c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA';
    if (activeTab === 'Confirmadas') return c.estado === 'CONFIRMADA';
    if (activeTab === 'Rechazadas') return c.estado === 'RECHAZADA';
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
              mod.path === '/dashboard/ventas/cotizacion'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700 border-transparent hover:border-amber-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert banner */}
      {(sinConfirmar72h > 0 || vencenHoy > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-4 z-20">
          <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-amber-800">ATENCION EN COTIZACIONES</h4>
            <p className="text-xs font-bold text-amber-600 mt-1">
              {sinConfirmar72h > 0 && `${sinConfirmar72h} cotizacion(es) sin confirmar +72h. `}
              {vencenHoy > 0 && `${vencenHoy} cotizacion(es) vencen en los proximos 7 dias.`}
            </p>
          </div>
          <button onClick={() => setActiveTab('Activas')}
            className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-700 shrink-0">
            Ver Activas
          </button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl shadow-inner"><Calculator size={24} /></div>
              Cotizaciones
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Administra las propuestas comerciales enviadas a clientes.</p>
          </div>
          <Link href="/dashboard/ventas/solicitud"
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
            <Plus size={18} /> Nueva (desde SC)
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Activas')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{activas.length}</h2>
            {sinConfirmar72h > 0 && <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1"><AlertCircle size={12}/> {sinConfirmar72h} sin confirmar +72h</p>}
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Confirmadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Confirmadas (VEN)</p>
            <h2 className="text-4xl font-black text-slate-800">{confirmadas.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Generaron pedido de venta</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><DollarSign size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto Total</p>
            <h2 className="text-3xl font-black text-slate-800">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Suma de cotizaciones</p>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-amber-100 uppercase tracking-wider mb-1 relative z-10">Por Vencer (7 dias)</p>
            <h2 className="text-4xl font-black text-white relative z-10">{vencenHoy}</h2>
            <p className="text-xs font-bold text-amber-100 mt-2 relative z-10">Requieren confirmacion urgente</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Activas', 'Confirmadas', 'Rechazadas'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Activas'     ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'Confirmadas' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                         'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'Activas' ? activas.length : tab === 'Confirmadas' ? confirmadas.length : rechazadas.length})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar COT, cliente..."
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
                  <th className="px-6 py-4">COT #</th>
                  <th className="px-6 py-4">Cliente / Cotizador</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Vencimiento</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-amber-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando cotizaciones...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-20 text-center">
                    <FileText size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin cotizaciones en este estado</p>
                    <p className="text-slate-400 text-sm mt-1">Las cotizaciones se crean al confirmar una Solicitud de Cliente</p>
                  </td></tr>
                ) : filtered.map((c: any) => (
                  <tr key={c.id} onClick={() => setSelected(c)}
                    className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === c.id ? 'bg-amber-50/30' : ''}`}>
                    <td className="px-6 py-4">
                      <p className="font-black text-amber-700">{c.numero}</p>
                      {c.sc_numero && (
                        <Link href="/dashboard/ventas/solicitud" onClick={e => e.stopPropagation()}
                          className="text-xs text-purple-500 hover:underline mt-0.5 flex items-center gap-1">
                          SC: {c.sc_numero}
                        </Link>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-800">{c.customer_name || '-'}</p>
                      {c.cotizador && <p className="text-xs text-slate-400">{c.cotizador}</p>}
                    </td>
                    <td className="px-6 py-4 text-slate-600">{fDate(c.fecha_cotizacion)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${isOverdue(c.vencimiento) ? 'text-red-600' : isExpiringSoon(c.vencimiento) ? 'text-amber-600' : 'text-slate-600'}`}>
                        {fDate(c.vencimiento)}
                        {isOverdue(c.vencimiento) && <span className="ml-1 text-xs">(Vencida)</span>}
                        {isExpiringSoon(c.vencimiento) && !isOverdue(c.vencimiento) && <span className="ml-1 text-xs">(Pronto)</span>}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-black text-slate-800">{fCOP(c.total_cop || 0)}</td>
                    <td className="px-6 py-4"><Badge estado={c.estado} /></td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA' && (
                          <button onClick={e => { e.stopPropagation(); confirmar(c.id); }}
                            disabled={saving}
                            className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                            <CheckCircle2 size={12} /> Confirmar + VEN
                          </button>
                        )}
                        <button className="text-slate-400 hover:text-slate-700 p-1"><MoreVertical size={16} /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Detail Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-lg h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-amber-50 to-white">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">{selected.numero}</h2>
                <p className="text-xs text-slate-400">Cotizacion</p>
                {selected.sc_numero && (
                  <p className="text-xs text-purple-600 font-bold mt-0.5">SC: {selected.sc_numero}</p>
                )}
                <div className="mt-2"><Badge estado={selected.estado} /></div>
              </div>
              <div className="flex gap-2">
                {selected.estado !== 'CONFIRMADA' && selected.estado !== 'RECHAZADA' && (
                  <button onClick={() => confirmar(selected.id)} disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 disabled:opacity-50">
                    {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle2 size={13} />}
                    Confirmar + VEN
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {/* Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4 space-y-2">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Cliente</p>
                <p className="font-extrabold text-slate-900 text-lg">{selected.customer_name || '-'}</p>
                {selected.customer_phone && (
                  <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
                    <Phone size={13} /> {selected.customer_phone}
                  </a>
                )}
                {selected.customer_email && (
                  <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-2 text-sm text-blue-600 font-medium hover:underline">
                    <Mail size={13} /> {selected.customer_email}
                  </a>
                )}
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Cotizador', value: selected.cotizador || '-' },
                  { label: 'Fecha', value: fDate(selected.fecha_cotizacion) },
                  { label: 'Vencimiento', value: fDate(selected.vencimiento) },
                  { label: 'Modalidad', value: selected.modalidad_pago || '-' },
                  { label: 'Total', value: fCOP(selected.total_cop || 0) },
                  { label: 'Anticipo %', value: selected.anticipo_pct ? `${selected.anticipo_pct}%` : '-' },
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
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Cotizados</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2 text-right">Subtotal</th>
                      </tr></thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{fCOP(p.unit_price || 0)}</td>
                            <td className="px-3 py-2 text-right font-bold">{fCOP((p.qty || 0) * (p.unit_price || 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={3} className="px-3 py-2 text-right font-black text-slate-600">TOTAL</td>
                          <td className="px-3 py-2 text-right font-extrabold text-slate-900">{fCOP(selected.total_cop || 0)}</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* VEN link */}
              {selected.ven_numero && (
                <div className="bg-emerald-50 rounded-xl p-4 flex items-center justify-between border border-emerald-100">
                  <div>
                    <p className="text-xs text-emerald-600 font-black uppercase mb-0.5">Pedido de Venta generado</p>
                    <p className="font-extrabold text-emerald-800">{selected.ven_numero}</p>
                  </div>
                  <Link href="/dashboard/ventas/venta" className="bg-emerald-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    Ver VEN <ChevronRight size={12} />
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
