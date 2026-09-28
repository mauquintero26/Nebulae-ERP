'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowDownToLine, Activity, Package, CheckCircle2, Clock,
  Search, X, RefreshCw, AlertCircle, Warehouse, ChevronRight
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge, Drawer, EmptyState } from '@/components/ui';
import { INV_NAV } from '../inv-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

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
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/recepciones" color="orange" />

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <PageHeader icon={ArrowDownToLine} color="orange"
          title="Entradas de Inventario"
          subtitle="Registro de mercancia que ingresa a las bodegas desde compras."
          actions={(
            <Link href="/dashboard/compras/pedidos"
              className="bg-orange-600 hover:bg-orange-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
              <Package size={18} /> Ver Pedidos de Compra
            </Link>
          )} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={Clock} color="amber" label="Por Confirmar" value={pendientes} hint="Stock aun no actualizado" onClick={() => setActiveTab('Por Confirmar')} />
          <StatCard icon={CheckCircle2} color="emerald" label="Completadas" value={completadas} hint="Stock actualizado correctamente" onClick={() => setActiveTab('Completadas')} />
          <StatCard icon={Warehouse} color="blue" label="Bodegas Activas" value={warehouses.length} hint="Puntos de almacenamiento" />
          <StatCard variant="gradient" color="orange" icon={Activity} label="Total Entradas" value={recepciones.length} hint={`${stockActualizado} con stock confirmado`} />
        </div>

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
                  <tr><td colSpan={8}>
                    <EmptyState icon={ArrowDownToLine} message="Sin entradas registradas" hint="Las entradas se generan al recepcionar un Pedido de Compra" />
                  </td></tr>
                ) : filtered.map((r: any) => (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === r.id ? 'bg-orange-50/30' : ''}`}>
                    <td className="px-6 py-4 font-black text-orange-700">{r.numero}</td>
                    <td className="px-6 py-4">
                      {r.pec_numero ? (
                        <Link href={`/dashboard/compras/pedidos?id=${r.pec_id}`} onClick={e => e.stopPropagation()}
                          className="text-purple-600 font-bold hover:underline text-sm">{r.pec_numero}</Link>
                      ) : <span className="text-slate-400 text-sm">-</span>}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{r.supplier_name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{r.warehouse_name || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{(r.productos || []).length} items</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(r.fecha_recepcion || r.created_at)}</td>
                    <td className="px-6 py-4">
                      {r.estado === 'COMPLETADA' || r.estado === 'CONFIRMADA' ? (
                        <Badge tone="success" icon={CheckCircle2}>Confirmada</Badge>
                      ) : (
                        <Badge tone="warning" icon={Clock}>Pendiente</Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/dashboard/compras/recepciones/${r.id}`} onClick={e => e.stopPropagation()}
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
        <Drawer
          onClose={() => setSelected(null)}
          header={(
            <div>
              <h2 className="font-extrabold text-xl text-slate-900">{selected.numero}</h2>
              <p className="text-xs text-slate-400">Entrada de Inventario</p>
              <div className="mt-2">
                <Badge tone={selected.estado === 'COMPLETADA' ? 'success' : 'warning'}>{selected.estado}</Badge>
              </div>
            </div>
          )}
        >
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
        </Drawer>
      )}
    </div>
  );
}
