'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import Link from 'next/link';
import {
  Layers, Search, AlertCircle, CheckCircle2,
  RefreshCw, Package, Box, Truck,
  Clock, Info, ShoppingCart
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge, EmptyState } from '@/components/ui';
import { INV_NAV } from '../inv-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const fCOP = (v: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(v || 0);

export default function StockPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState<'all' | 'available' | 'low' | 'out'>('all');

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/products?limit=300').catch(() => []);
      const prodList = Array.isArray(res) ? res : (res?.data ?? []);
      setProducts(prodList);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Transformar datos para la vista dual de inventario
  const mappedItems = useMemo(() => {
    return products.map((p: any) => {
      const fisico = Number(p.total_stock || p.stock || 0);
      // Comprometido estimado (reservas o asignaciones a pedidos con anticipo)
      const comprometido = Number(p.reserved_stock || p.comprometido || 0);
      // Disponible real = Físico - Comprometido (nunca menor a 0)
      const disponible = Math.max(0, fisico - comprometido);
      const enTransito = Number(p.in_transit_stock || p.en_transito || 0);
      const minStock = Number(p.min_stock || 5);

      let stockState: 'ok' | 'warning' | 'danger' = 'ok';
      if (disponible === 0) stockState = 'danger';
      else if (disponible <= minStock) stockState = 'warning';

      return {
        id: p.id,
        sku: p.internal_ref || p.sku || `PRD-${p.id}`,
        nombre: p.name || p.nombre || 'Producto sin nombre',
        categoria: p.category_name || (p.category_id ? `Categoría #${p.category_id}` : 'General'),
        precio_venta: Number(p.price || p.precio_venta || 0),
        fisico,
        comprometido,
        disponible,
        enTransito,
        minStock,
        stockState
      };
    });
  }, [products]);

  // Métricas globales
  const totalFisico = mappedItems.reduce((acc, i) => acc + i.fisico, 0);
  const totalComprometido = mappedItems.reduce((acc, i) => acc + i.comprometido, 0);
  const totalDisponible = mappedItems.reduce((acc, i) => acc + i.disponible, 0);
  const totalEnTransito = mappedItems.reduce((acc, i) => acc + i.enTransito, 0);

  const categories = useMemo(() => {
    const set = new Set<string>();
    mappedItems.forEach(i => { if (i.categoria) set.add(i.categoria); });
    return Array.from(set);
  }, [mappedItems]);

  const filteredItems = useMemo(() => {
    return mappedItems.filter(item => {
      const term = search.toLowerCase();
      const matchSearch = !search ||
        item.nombre.toLowerCase().includes(term) ||
        item.sku.toLowerCase().includes(term);

      if (!matchSearch) return false;
      if (filterCategory !== 'all' && item.categoria !== filterCategory) return false;

      if (filterStatus === 'available' && item.disponible <= 0) return false;
      if (filterStatus === 'low' && item.stockState !== 'warning') return false;
      if (filterStatus === 'out' && item.disponible > 0) return false;

      return true;
    });
  }, [mappedItems, search, filterCategory, filterStatus]);

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in flex flex-col">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/stock" color="indigo" />

      <div className="p-8 max-w-[1600px] mx-auto space-y-6 flex-1 w-full">
        <PageHeader icon={Layers} color="indigo"
          title="Vista Dual de Inventario"
          subtitle="Control simultáneo de Inventario Físico en Bodega vs. Disponible para Venta Inmediata."
          actions={(
            <div className="flex items-center gap-2.5">
              <button onClick={loadData}
                className="flex items-center gap-1.5 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-xs shadow-sm transition-colors">
                <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Actualizar
              </button>
              <Link href="/dashboard/cotiza"
                className="flex items-center gap-1.5 px-4 py-2.5 bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 font-bold text-xs shadow-sm transition-colors">
                <ShoppingCart size={14} /> Cotizar Producto
              </Link>
            </div>
          )} />

        {/* Banner Explicativo de la Regla Dual */}
        <div className="bg-indigo-50/60 border border-indigo-200/80 rounded-2xl p-4 flex items-start gap-3.5">
          <Info className="text-indigo-600 shrink-0 mt-0.5" size={18} />
          <div className="text-xs text-indigo-900 leading-relaxed">
            <span className="font-bold">Regla de Oro de Nebulae: </span>
            El <strong>Inventario Físico</strong> contabiliza todas las unidades reales en bodega. El <strong>Disponible</strong> resta los ítems comprometidos con clientes que pagaron su anticipo. Los asesores comerciales solo pueden comprometer unidades con entrega inmediata si figuran en <strong>Disponible</strong>.
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard icon={Box} color="blue" label="Físico en Bodega" value={totalFisico} hint="Unidades presentes en estantería" />
          <StatCard icon={Clock} color="amber" label="Comprometido" value={totalComprometido} hint="Preventas con anticipo recibido" />
          <StatCard icon={CheckCircle2} color="emerald" label="Venta Inmediata" value={totalDisponible} hint="Libres de compromiso comercial" />
          <StatCard icon={Truck} color="blue" label="En Tránsito" value={totalEnTransito} hint="Compradas en camino a bodega" />
        </div>

        {/* Barra de Filtros y Búsqueda */}
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full md:w-auto flex-1">
            <div className="relative w-full md:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
              <input
                type="text"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Buscar por SKU o nombre de producto..."
                className="pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:ring-2 focus:ring-indigo-500 outline-none w-full"
              />
            </div>

            <select
              value={filterCategory}
              onChange={e => setFilterCategory(e.target.value)}
              className="bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-xs font-medium text-slate-700 outline-none"
            >
              <option value="all">Todas las Categorías</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>

          <div className="flex items-center gap-2 w-full md:w-auto justify-end">
            <div className="flex bg-slate-100 p-1 rounded-xl">
              {(['all', 'available', 'low', 'out'] as const).map(st => (
                <button
                  key={st}
                  onClick={() => setFilterStatus(st)}
                  className={`px-3 py-1.5 text-[11px] font-bold rounded-lg transition-all ${
                    filterStatus === st
                      ? 'bg-white text-indigo-700 shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {st === 'all' ? 'Todos' : st === 'available' ? 'Disponible' : st === 'low' ? 'Bajo Stock' : 'Agotado'}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Tabla Dual de Stock */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-400 font-black">
                  <th className="p-4 pl-6">Producto / Referencia</th>
                  <th className="p-4">Categoría</th>
                  <th className="p-4 text-center bg-slate-100/50">Físico Bodega</th>
                  <th className="p-4 text-center bg-amber-50/40 text-amber-800">Comprometido</th>
                  <th className="p-4 text-center bg-emerald-50/60 text-emerald-800 font-extrabold">Venta Inmediata</th>
                  <th className="p-4 text-center">En Tránsito</th>
                  <th className="p-4 text-right">Precio Venta</th>
                  <th className="p-4 pr-6 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="p-12 text-center text-slate-400">
                      <RefreshCw size={24} className="animate-spin text-indigo-500 mx-auto mb-2" />
                      Cargando stock actualizado...
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={Package} message="No se encontraron productos con los filtros seleccionados" />
                  </td></tr>
                ) : (
                  filteredItems.map((item, idx) => (
                    <tr key={item.id || idx} className="hover:bg-slate-50/60 transition-colors">
                      <td className="p-4 pl-6">
                        <div className="font-bold text-slate-800">{item.nombre}</div>
                        <div className="text-[10px] font-mono text-slate-400 mt-0.5">{item.sku}</div>
                      </td>
                      <td className="p-4 text-slate-600 font-medium">
                        {item.categoria}
                      </td>
                      <td className="p-4 text-center font-bold text-slate-700 bg-slate-50/40">
                        {item.fisico}
                      </td>
                      <td className="p-4 text-center font-bold text-amber-700 bg-amber-50/20">
                        {item.comprometido > 0 ? (
                          <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px]">
                            {item.comprometido}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>
                      <td className="p-4 text-center font-black bg-emerald-50/40">
                        <span className={`text-sm ${item.disponible > 0 ? 'text-emerald-700' : 'text-red-500'}`}>
                          {item.disponible}
                        </span>
                      </td>
                      <td className="p-4 text-center font-medium text-blue-600">
                        {item.enTransito > 0 ? `+${item.enTransito}` : '—'}
                      </td>
                      <td className="p-4 text-right font-bold text-slate-800">
                        {item.precio_venta > 0 ? fCOP(item.precio_venta) : '-'}
                      </td>
                      <td className="p-4 pr-6 text-center">
                        {item.disponible > 0 ? (
                          <Badge tone="success" icon={CheckCircle2}>Disponible</Badge>
                        ) : item.fisico > 0 ? (
                          <Badge tone="warning" icon={Clock}>Reservado</Badge>
                        ) : (
                          <Badge tone="danger" icon={AlertCircle}>Agotado</Badge>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
