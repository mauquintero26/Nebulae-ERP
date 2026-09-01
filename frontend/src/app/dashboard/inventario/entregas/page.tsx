'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowUpFromLine, Activity, Package, CheckCircle2, Clock,
  Search, X, RefreshCw, AlertCircle, Truck, ChevronRight, MoreVertical
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

const INV_NAV = [
  { name: 'Productos',       path: '/dashboard/inventario/productos' },
  { name: 'Stock',           path: '/dashboard/inventario/stock' },
  { name: 'Recepciones',     path: '/dashboard/inventario/recepciones' },
  { name: 'Entregas',        path: '/dashboard/inventario/entregas' },
  { name: 'Traslados',       path: '/dashboard/inventario/traslados' },
  { name: 'Ajustes',         path: '/dashboard/inventario/ajustes' },
  { name: 'Abastecimiento',  path: '/dashboard/inventario/abastecimiento' },
  { name: 'Bodegas',         path: '/dashboard/inventario/bodegas' },
];

const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function EntregasPage() {
  const [entregas, setEntregas] = useState<any[]>([]);
  const [ventas, setVentas] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Pendientes');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v] = await Promise.all([
        apiFetch('/ventas/pedidos?limit=100').catch(() => []),
      ]);
      const ventasList = Array.isArray(v) ? v : (v?.data ?? []);
      setVentas(ventasList);
      // Entregas = ventas in EN_TRANSITO or ENTREGADO state
      setEntregas(ventasList.filter((ven: any) =>
        ven.estado === 'EN_TRANSITO' || ven.estado === 'ENTREGADO' || ven.estado === 'PENDIENTE_ENTREGA'
      ));
    } catch { setEntregas([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendientes = entregas.filter(e => e.estado !== 'ENTREGADO' && e.estado !== 'COMPLETADO').length;
  const completadas = entregas.filter(e => e.estado === 'ENTREGADO' || e.estado === 'COMPLETADO').length;
  const totalVentas = ventas.length;

  const filtered = entregas.filter(e => {
    const ms = !search || JSON.stringify(e).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Pendientes') return e.estado !== 'ENTREGADO' && e.estado !== 'COMPLETADO';
    if (activeTab === 'Despachadas') return e.estado === 'ENTREGADO' || e.estado === 'COMPLETADO';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Inventario:</span>
        {INV_NAV.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/inventario/entregas'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 border-transparent hover:border-orange-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-rose-100 text-rose-600 p-2 rounded-xl shadow-inner"><ArrowUpFromLine size={24} /></div>
              Salidas de Inventario
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Control de productos que salen de bodega hacia clientes.</p>
          </div>
          <Link href="/dashboard/ventas/venta"
            className="bg-rose-600 hover:bg-rose-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <ArrowUpFromLine size={18} /> Ver Pedidos de Venta
          </Link>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Pendientes')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pendientes de Despacho</p>
            <h2 className="text-4xl font-black text-slate-800">{pendientes}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2">Esperando salida de bodega</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Despachadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Despachadas</p>
            <h2 className="text-4xl font-black text-slate-800">{completadas}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Entregadas al cliente</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><Truck size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Total Pedidos Venta</p>
            <h2 className="text-4xl font-black text-slate-800">{totalVentas}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">En el sistema</p>
          </div>
          <div className="bg-gradient-to-br from-rose-500 to-red-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-rose-100 uppercase tracking-wider mb-1 relative z-10">Total Entregas</p>
            <h2 className="text-4xl font-black text-white relative z-10">{entregas.length}</h2>
            <p className="text-xs font-bold text-rose-100 mt-2 relative z-10">{completadas} despachadas</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Pendientes', 'Despachadas', 'Todos'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Pendientes'  ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'Despachadas' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                           'bg-slate-200 text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab}
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar VEN, cliente..." className="bg-transparent text-sm outline-none w-52" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">VEN # (Origen)</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Productos</th>
                  <th className="px-6 py-4">Fecha VEN</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-rose-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando entregas...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-20 text-center">
                    <ArrowUpFromLine size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin entregas en este estado</p>
                    <p className="text-slate-400 text-sm mt-1">Las entregas se generan desde los Pedidos de Venta</p>
                  </td></tr>
                ) : filtered.map((e: any) => (
                  <tr key={e.id} onClick={() => setSelected(e)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <td className="px-6 py-4">
                      <p className="font-black text-emerald-700">{e.numero}</p>
                      {e.cot_numero && <p className="text-xs text-slate-400 mt-0.5">desde {e.cot_numero}</p>}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{e.customer_name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{(e.productos || []).length} items</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(e.fecha_pedido)}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {e.total_cop ? `$${Number(e.total_cop).toLocaleString('es-CO')}` : '-'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        e.estado === 'ENTREGADO' ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>{e.estado}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href="/dashboard/ventas/venta" onClick={e2 => e2.stopPropagation()}
                          className="bg-rose-100 text-rose-700 hover:bg-rose-200 px-3 py-1.5 rounded text-xs font-bold">
                          Ver VEN
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-rose-50 to-white flex items-start justify-between">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">{selected.numero}</h2>
                <p className="text-xs text-slate-400">Pedido de Venta — Entrega</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Cliente', value: selected.customer_name || '-' },
                  { label: 'Estado', value: selected.estado },
                  { label: 'Fecha', value: fDate(selected.fecha_pedido) },
                  { label: 'Total', value: selected.total_cop ? `$${Number(selected.total_cop).toLocaleString('es-CO')}` : '-' },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="font-bold text-sm text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                      </tr></thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
