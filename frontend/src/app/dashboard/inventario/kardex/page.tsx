'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  ArrowRightLeft, Search, ArrowUpRight, ArrowDownRight, RefreshCw,
  ChevronLeft, ChevronRight, X, Filter
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, EmptyState } from '@/components/ui';
import { INV_NAV } from '../inv-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

// direction real: IN | OUT | ADJUST_IN | ADJUST_OUT | TRANSFER_IN | TRANSFER_OUT | QUARANTINE (ver erp_inventario.py get_kardex)
const DIRECTIONS = [
  { value: '', label: 'Todas' },
  { value: 'IN', label: 'Entrada' },
  { value: 'OUT', label: 'Salida' },
  { value: 'TRANSFER_IN', label: 'Traslado (entra)' },
  { value: 'TRANSFER_OUT', label: 'Traslado (sale)' },
  { value: 'ADJUST_IN', label: 'Ajuste (entrada)' },
  { value: 'ADJUST_OUT', label: 'Ajuste (salida)' },
  { value: 'QUARANTINE', label: 'Cuarentena' },
];

// Paleta propia (no la de Badge/tones): la distincion de color entre IN/OUT
// normales vs ADJUST_IN/OUT es semantica a proposito (ambar = fue un ajuste
// manual, no un movimiento de flujo normal) y se pierde si se reduce a los
// tonos genericos success/danger -- se mantiene el color, solo se unifica la
// forma de la pastilla (rounded-full + borde) con el resto del proyecto.
const DIR_STYLE: Record<string, { label: string; cls: string; icon: any }> = {
  IN:            { label: 'Entrada',          cls: 'bg-green-50 text-green-700 border-green-200',   icon: ArrowDownRight },
  OUT:           { label: 'Salida',           cls: 'bg-red-50 text-red-700 border-red-200',         icon: ArrowUpRight },
  TRANSFER_IN:   { label: 'Traslado (entra)', cls: 'bg-blue-50 text-blue-700 border-blue-200',      icon: RefreshCw },
  TRANSFER_OUT:  { label: 'Traslado (sale)',  cls: 'bg-blue-50 text-blue-700 border-blue-200',      icon: RefreshCw },
  ADJUST_IN:     { label: 'Ajuste (entrada)', cls: 'bg-amber-50 text-amber-700 border-amber-200',   icon: ArrowDownRight },
  ADJUST_OUT:    { label: 'Ajuste (salida)',  cls: 'bg-amber-50 text-amber-700 border-amber-200',   icon: ArrowUpRight },
  QUARANTINE:    { label: 'Cuarentena',       cls: 'bg-purple-50 text-purple-700 border-purple-200', icon: RefreshCw },
};

const fDateTime = (iso: string | null) => iso ? new Date(iso).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-';
const fCOP = (v: number | null) => v ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function KardexPage() {
  const [items, setItems] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [warehouses, setWarehouses] = useState<any[]>([]);

  const [productSearch, setProductSearch] = useState('');
  const [productResults, setProductResults] = useState<any[]>([]);
  const [skuId, setSkuId] = useState<number | null>(null);
  const [warehouseId, setWarehouseId] = useState('');
  const [direction, setDirection] = useState('');
  const [owner, setOwner] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [page, setPage] = useState(0);
  const pageSize = 25;
  const productTimer = useRef<any>(null);

  useEffect(() => {
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (skuId) params.set('sku_id', String(skuId));
      if (warehouseId) params.set('warehouse_id', warehouseId);
      if (direction) params.set('direction', direction);
      if (owner) params.set('owner', owner);
      if (startDate) params.set('start_date', startDate);
      if (endDate) params.set('end_date', endDate);
      params.set('limit', String(pageSize));
      params.set('offset', String(page * pageSize));
      const d = await apiFetch('/inventory/kardex?' + params.toString());
      setItems(d?.items ?? []);
      setTotal(d?.total ?? 0);
    } catch { setItems([]); setTotal(0); }
    finally { setLoading(false); }
  }, [skuId, warehouseId, direction, owner, startDate, endDate, page]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(0); }, [skuId, warehouseId, direction, owner, startDate, endDate]);

  function onProductSearch(q: string) {
    setProductSearch(q);
    setSkuId(null);
    clearTimeout(productTimer.current);
    if (!q.trim()) { setProductResults([]); return; }
    productTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch('/crm/products/search?q=' + encodeURIComponent(q));
        setProductResults(Array.isArray(d) ? d : (d?.data ?? []));
      } catch { setProductResults([]); }
    }, 300);
  }

  function clearFilters() {
    setProductSearch(''); setSkuId(null); setProductResults([]);
    setWarehouseId(''); setDirection(''); setOwner(''); setStartDate(''); setEndDate('');
  }
  const hasFilters = skuId || warehouseId || direction || owner || startDate || endDate;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/kardex" color="emerald" />

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <PageHeader icon={ArrowRightLeft} color="emerald"
          title="Movimientos (Kardex)"
          subtitle="Historial inmutable de entradas, salidas, traslados y ajustes de inventario."
          actions={(
            <button onClick={load} className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-bold text-sm shadow-sm transition-colors">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
          )} />

        {/* Filters */}
        <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-end gap-3">
          <div className="relative">
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Producto / SKU</label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
              <input value={productSearch} onChange={e => onProductSearch(e.target.value)} placeholder="Buscar..."
                className={`pl-8 pr-3 py-2 border rounded-xl text-sm outline-none w-52 ${skuId ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`} />
            </div>
            {productResults.length > 0 && !skuId && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-20 max-h-48 overflow-y-auto">
                {productResults.map((p: any) => (
                  <button key={p.id} type="button"
                    onClick={() => { setSkuId(p.id); setProductSearch(p.display || p.product_name); setProductResults([]); }}
                    className="w-full text-left px-3 py-2 hover:bg-emerald-50 text-xs border-b last:border-0 border-slate-50">
                    {p.display || p.product_name}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Bodega</label>
            <select value={warehouseId} onChange={e => setWarehouseId(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
              <option value="">Todas</option>
              {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Direccion</label>
            <select value={direction} onChange={e => setDirection(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
              {DIRECTIONS.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Propietario</label>
            <select value={owner} onChange={e => setOwner(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none bg-white">
              <option value="">Todos</option>
              <option value="NEBULAE">Nebulae</option>
              <option value="MAU">Mau</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Desde</label>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          <div>
            <label className="block text-[10px] font-black text-slate-400 uppercase mb-1">Hasta</label>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
          </div>
          {hasFilters && (
            <button onClick={clearFilters} className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-500 hover:text-red-600">
              <X size={13} /> Limpiar
            </button>
          )}
        </div>

        {/* Tabla Kardex */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500 font-bold">
                  <th className="p-4 pl-6">Fecha</th>
                  <th className="p-4">Direccion</th>
                  <th className="p-4">SKU / Producto</th>
                  <th className="p-4">Bodega</th>
                  <th className="p-4 text-center">Cant.</th>
                  <th className="p-4">Propietario</th>
                  <th className="p-4">Documento Origen</th>
                  <th className="p-4 text-right">Costo Unit.</th>
                  <th className="p-4 pr-6">Usuario</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={9} className="p-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-emerald-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando kardex...</span>
                  </td></tr>
                ) : items.length === 0 ? (
                  <tr><td colSpan={9}>
                    <EmptyState icon={ArrowRightLeft} message={`Sin movimientos ${hasFilters ? 'para este filtro' : 'registrados'}`} />
                  </td></tr>
                ) : items.map((mov: any) => {
                  const style = DIR_STYLE[mov.direction] || { label: mov.direction || '-', cls: 'bg-slate-100 text-slate-600', icon: RefreshCw };
                  const Icon = style.icon;
                  const isPositive = ['IN', 'TRANSFER_IN', 'ADJUST_IN'].includes(mov.direction);
                  const isNegative = ['OUT', 'TRANSFER_OUT', 'ADJUST_OUT'].includes(mov.direction);
                  return (
                    <tr key={mov.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 pl-6 text-xs text-slate-500">{fDateTime(mov.created_at)}</td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${style.cls}`}>
                          <Icon size={12} /> {style.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="font-bold text-slate-700 font-mono text-xs mb-0.5">{mov.sku || `SKU #${mov.sku_id}`}</div>
                        <div className="text-slate-600 font-medium truncate max-w-[200px]">{mov.product_name || '-'}</div>
                      </td>
                      <td className="p-4 text-slate-600 text-xs">{mov.warehouse_name || '-'}</td>
                      <td className="p-4">
                        <div className={`text-center font-black ${isPositive ? 'text-green-600' : isNegative ? 'text-red-600' : 'text-amber-600'}`}>
                          {isPositive ? '+' : isNegative ? '-' : ''}{mov.quantity}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className="text-xs font-bold text-slate-500">{mov.owner || 'NEBULAE'}</span>
                      </td>
                      <td className="p-4 text-xs text-slate-500">
                        {mov.source_document_numero || (mov.operation_type ? `${mov.operation_type} #${mov.operation_id}` : '-')}
                      </td>
                      <td className="p-4 text-right text-xs text-slate-600">{fCOP(mov.unit_cost_cop)}</td>
                      <td className="p-4 pr-6">
                        <div className="inline-flex items-center px-2 py-1 bg-slate-100 rounded-md text-xs font-bold text-slate-600 truncate max-w-[120px]">
                          {mov.created_by || 'Sistema'}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="p-4 border-t border-slate-100 bg-slate-50/50 flex items-center justify-between text-sm text-slate-500">
            <div>{total > 0 ? `Mostrando ${page * pageSize + 1} a ${Math.min((page + 1) * pageSize, total)} de ${total} movimientos` : 'Sin movimientos'}</div>
            <div className="flex gap-1">
              <button disabled={page === 0} onClick={() => setPage(p => p - 1)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 font-bold text-xs">
                <ChevronLeft size={13} /> Anterior
              </button>
              <button disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
                className="px-3 py-1.5 bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 flex items-center gap-1 font-bold text-xs">
                Siguiente <ChevronRight size={13} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
