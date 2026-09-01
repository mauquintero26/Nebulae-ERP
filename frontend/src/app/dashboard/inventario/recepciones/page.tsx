'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, Activity, Package, CheckCircle2, Clock,
  Search, X, RefreshCw, AlertCircle, Warehouse, ChevronRight, MoreVertical
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

export default function InventarioRecepcionesPage() {
  const [recepciones, setRecepciones] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Recientes');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [r, w] = await Promise.all([
        apiFetch('/compras/recepciones?limit=100').catch(() => []),
        apiFetch('/inventory/warehouses').catch(() => []),
      ]);
      setRecepciones(Array.isArray(r) ? r : (r?.data ?? []));
      setWarehouses(Array.isArray(w) ? w : (w?.data ?? []));
    } catch { setRecepciones([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const pendientes = recepciones.filter(r => r.estado !== 'COMPLETADA' && r.estado !== 'CONFIRMADA').length;
  const completadas = recepciones.filter(r => r.estado === 'COMPLETADA' || r.estado === 'CONFIRMADA').length;
  const stockActualizado = recepciones.filter(r => r.stock_actualizado).length;

  const filtered = recepciones.filter(r => {
    const ms = !search || JSON.stringify(r).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Por Confirmar') return r.estado !== 'COMPLETADA' && r.estado !== 'CONFIRMADA';
    if (activeTab === 'Completadas') return r.estado === 'COMPLETADA' || r.estado === 'CONFIRMADA';
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
              mod.path === '/dashboard/inventario/recepciones'
                ? 'bg-orange-600 text-white border-orange-600'
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
              <div className="bg-orange-100 text-orange-600 p-2 rounded-xl shadow-inner"><ArrowDownToLine size={24} /></div>
              Entradas de Inventario
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Registro de mercancia que ingresa a las bodegas desde compras.</p>
          </div>
          <Link href="/dashboard/compras/pedidos"
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Package size={18} /> Ver Pedidos de Compra
          </Link>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Por Confirmar')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <Clock size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Por Confirmar</p>
            <h2 className="text-4xl font-black text-slate-800">{pendientes}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1"><AlertCircle size={12} /> Stock aun no actualizado</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Completadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Completadas</p>
            <h2 className="text-4xl font-black text-slate-800">{completadas}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Stock actualizado correctamente</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <Warehouse size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Bodegas Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{warehouses.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Puntos de almacenamiento</p>
          </div>

          <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-orange-100 uppercase tracking-wider mb-1 relative z-10">Total Entradas</p>
            <h2 className="text-4xl font-black text-white relative z-10">{recepciones.length}</h2>
            <p className="text-xs font-bold text-orange-100 mt-2 relative z-10">{stockActualizado} con stock confirmado</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Recientes', 'Por Confirmar', 'Completadas'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Por Confirmar' ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'Completadas'   ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                             'bg-orange-100 text-orange-800 shadow-sm border border-orange-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'Por Confirmar' ? pendientes : tab === 'Completadas' ? completadas : recepciones.length})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar ENINV, PEC..." className="bg-transparent text-sm outline-none w-52 text-slate-700" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">ENINV #</th>
                  <th className="px-6 py-4">PEC Origen</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4">Bodega Destino</th>
                  <th className="px-6 py-4">Productos</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-orange-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando entradas...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-20 text-center">
                    <ArrowDownToLine size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin entradas registradas</p>
                    <p className="text-slate-400 text-sm mt-1">Las entradas se generan al recepcionar un Pedido de Compra</p>
                  </td></tr>
                ) : filtered.map((r: any) => (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === r.id ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-6 py-4 font-black text-orange-700">{r.numero}</td>
                    <td className="px-6 py-4">
                      {r.pec_numero ? (
                        <Link href="/dashboard/compras/pedidos" onClick={e => e.stopPropagation()}
                          className="text-purple-600 font-bold hover:underline text-sm">{r.pec_numero}</Link>
                      ) : <span className="text-slate-400 text-sm">-</span>}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{r.supplier_name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{r.warehouse_name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{(r.productos || []).length} items</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(r.fecha_recepcion || r.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        r.estado === 'COMPLETADA' || r.estado === 'CONFIRMADA'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}>
                        {r.estado === 'COMPLETADA' || r.estado === 'CONFIRMADA'
                          ? <><CheckCircle2 size={11} /> Confirmada</>
                          : <><Clock size={11} /> Pendiente</>}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href="/dashboard/compras/recepciones" onClick={e => e.stopPropagation()}
                          className="bg-orange-100 text-orange-700 hover:bg-orange-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                          Ver en Compras <ChevronRight size={12} />
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
            <div className="px-6 py-5 border-b bg-gradient-to-r from-orange-50 to-white flex items-start justify-between">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">{selected.numero}</h2>
                <p className="text-xs text-slate-400">Entrada de Inventario</p>
                <span className={`mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-bold border ${
                  selected.estado === 'COMPLETADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                }`}>{selected.estado}</span>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'PEC Origen', value: selected.pec_numero || '-' },
                  { label: 'Proveedor', value: selected.supplier_name || '-' },
                  { label: 'Bodega', value: selected.warehouse_name || '-' },
                  { label: 'Fecha', value: fDate(selected.fecha_recepcion || selected.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="font-bold text-sm text-slate-800">{value}</p>
                  </div>
                ))}
              </div>
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Recibidos</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Esperado</th>
                        <th className="px-3 py-2 text-right">Recibido</th>
                      </tr></thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">{p.product_name || p.sku_id}</td>
                            <td className="px-3 py-2 text-right">{p.qty_esperada || p.qty || 0}</td>
                            <td className={`px-3 py-2 text-right font-bold ${p.qty_recibida < p.qty_esperada ? 'text-red-600' : 'text-emerald-600'}`}>
                              {p.qty_recibida ?? p.qty ?? 0}
                            </td>
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
