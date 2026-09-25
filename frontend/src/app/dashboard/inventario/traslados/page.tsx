'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight, Activity, Package, CheckCircle2, Clock,
  Search, X, RefreshCw, Warehouse, ChevronRight
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
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

// Valores reales de InventoryOperation.status (models/inventory.py): DRAFT | READY | DONE | CANCELLED.
const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function InventarioTrasladosPage() {
  const [traslados, setTraslados] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Todos');
  const [selected, setSelected] = useState<any | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, w] = await Promise.all([
        apiFetch('/inventory/operations?operation_type=TRANSFER&limit=100').catch(() => []),
        apiFetch('/inventory/warehouses').catch(() => []),
      ]);
      setTraslados(Array.isArray(t) ? t : (t?.data ?? []));
      setWarehouses(Array.isArray(w) ? w : (w?.data ?? []));
    } catch { setTraslados([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const whName = (id: number) => warehouses.find((w: any) => w.id === id)?.name || `Bodega #${id}`;
  const enProceso = traslados.filter(t => t.status === 'DRAFT' || t.status === 'READY').length;
  const completados = traslados.filter(t => t.status === 'DONE').length;

  const filtered = traslados.filter(t => {
    const ms = !search || JSON.stringify(t).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'En Proceso') return t.status === 'DRAFT' || t.status === 'READY';
    if (activeTab === 'Completados') return t.status === 'DONE';
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
              mod.path === '/dashboard/inventario/traslados'
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
              <div className="bg-orange-100 text-orange-600 p-2 rounded-xl shadow-inner"><ArrowLeftRight size={24} /></div>
              Traslados Internos
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Movimiento de mercancia entre bodegas propias de la empresa.</p>
          </div>
          <Link href="/dashboard/compras/traslados"
            className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Package size={18} /> Gestionar Traslados
          </Link>
        </div>

        {/* KPI */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all"
            onClick={() => setActiveTab('En Proceso')}>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">En Proceso</p>
            <h2 className="text-4xl font-black text-slate-800">{enProceso}</h2>
            <p className="text-xs font-bold text-blue-600 mt-2">Traslados activos</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Completados')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Completados</p>
            <h2 className="text-4xl font-black text-slate-800">{completados}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Traslados finalizados</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Warehouse size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Bodegas Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{warehouses.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Ubicaciones disponibles</p>
          </div>
          <div className="bg-gradient-to-br from-orange-500 to-amber-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-orange-100 uppercase tracking-wider mb-1 relative z-10">Total Traslados</p>
            <h2 className="text-4xl font-black text-white relative z-10">{traslados.length}</h2>
            <p className="text-xs font-bold text-orange-100 mt-2 relative z-10">{completados} completados</p>
          </div>
        </div>

        {/* Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Todos', 'En Proceso', 'Completados'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'En Proceso'   ? 'bg-blue-100 text-blue-800 shadow-sm border border-blue-200'
                      : tab === 'Completados' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                          'bg-orange-100 text-orange-800 shadow-sm border border-orange-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'En Proceso' ? enProceso : tab === 'Completados' ? completados : traslados.length})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar traslados..." className="bg-transparent text-sm outline-none w-52" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Traslado #</th>
                  <th className="px-6 py-4">Bodega Origen</th>
                  <th className="px-6 py-4">Bodega Destino</th>
                  <th className="px-6 py-4">Items</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-orange-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando traslados...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-20 text-center">
                    <ArrowLeftRight size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin traslados internos registrados</p>
                    <p className="text-slate-400 text-sm mt-1">Usa "Gestionar Traslados" para crear uno nuevo</p>
                  </td></tr>
                ) : filtered.map((t: any) => (
                  <tr key={t.id} onClick={() => setSelected(t)}
                    className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === t.id ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-6 py-4 font-black text-orange-700">TRL-{String(t.id).padStart(4, '0')}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{t.source_warehouse_id ? whName(t.source_warehouse_id) : '-'}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{t.dest_warehouse_id ? whName(t.dest_warehouse_id) : '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{Math.ceil((t.movements?.length || 0) / 2)} producto(s)</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(t.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        t.status === 'DONE' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-600 border-slate-200'
                      }`}>{t.status === 'DONE' ? 'Completado' : t.status === 'CANCELLED' ? 'Cancelado' : 'Borrador'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/dashboard/compras/traslados?id=${t.id}`} onClick={e => e.stopPropagation()}
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
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-orange-50 to-white">
              <div>
                <h2 className="font-extrabold text-slate-900 text-xl">TRL-{String(selected.id).padStart(4, '0')}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Traslado Interno</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Bodega Origen</p>
                  <p className="font-bold text-sm text-slate-800">{selected.source_warehouse_id ? whName(selected.source_warehouse_id) : '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Bodega Destino</p>
                  <p className="font-bold text-sm text-slate-800">{selected.dest_warehouse_id ? whName(selected.dest_warehouse_id) : '-'}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Fecha Creacion</p>
                  <p className="font-bold text-sm">{fDate(selected.created_at)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Notas</p>
                  <p className="font-bold text-sm">{selected.notas || '-'}</p>
                </div>
              </div>
              {(selected.movements || []).filter((m: any) => m.direction === 'TRANSFER_OUT').length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">SKU</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                      </tr></thead>
                      <tbody>
                        {selected.movements.filter((m: any) => m.direction === 'TRANSFER_OUT').map((m: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">SKU #{m.sku_id}</td>
                            <td className="px-3 py-2 text-right font-bold">{m.quantity}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              <Link href={`/dashboard/compras/traslados?id=${selected.id}`}
                className="w-full flex items-center justify-center gap-2 bg-orange-600 hover:bg-orange-700 text-white py-2.5 rounded-xl font-bold text-sm">
                Gestionar en Compras <ChevronRight size={14} />
              </Link>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
