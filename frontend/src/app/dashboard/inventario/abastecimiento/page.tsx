'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingCart, Activity, AlertCircle, CheckCircle2, TrendingUp,
  Search, RefreshCw, Package, ArrowRight, AlertTriangle
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

export default function AbastecimientoPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [comprasStats, setComprasStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Bajo Minimo');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, cs] = await Promise.all([
        apiFetch('/products?limit=200').catch(() => []),
        apiFetch('/compras/stats').catch(() => ({})),
      ]);
      setProducts(Array.isArray(p) ? p : (p?.data ?? p?.products ?? []));
      setComprasStats(cs);
    } catch { setProducts([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Classify products by stock status
  const getStatus = (p: any) => {
    const stock = p.current_stock ?? p.quantity ?? 0;
    const min = p.low_stock_alert ?? 0;
    if (stock === 0) return 'SIN_STOCK';
    if (min > 0 && stock < min) return 'BAJO_MINIMO';
    return 'OK';
  };

  const sinStock = products.filter(p => getStatus(p) === 'SIN_STOCK').length;
  const bajoMin = products.filter(p => getStatus(p) === 'BAJO_MINIMO').length;
  const ok = products.filter(p => getStatus(p) === 'OK').length;

  const filtered = products.filter(p => {
    const ms = !search || p.name?.toLowerCase().includes(search.toLowerCase()) || p.reference?.toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    const st = getStatus(p);
    if (activeTab === 'Urgente (0 stock)') return st === 'SIN_STOCK';
    if (activeTab === 'Bajo Minimo') return st === 'BAJO_MINIMO' || st === 'SIN_STOCK';
    if (activeTab === 'En Orden') return st === 'OK';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Inventario:</span>
        {INV_NAV.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/inventario/abastecimiento'
                ? 'bg-emerald-600 text-white border-emerald-600'
                : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 border-transparent hover:border-orange-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert if there are critical stockouts */}
      {sinStock > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-4 z-20">
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-red-800">ALERTA DE STOCK CRITICO</h4>
            <p className="text-xs font-bold text-red-600 mt-1">{sinStock} producto(s) con stock en CERO. Se requiere pedido de compra urgente.</p>
          </div>
          <Link href="/dashboard/compras/pedidos" className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700">
            Crear PEC Urgente
          </Link>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl shadow-inner"><ShoppingCart size={24} /></div>
              Abastecimiento
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Productos que requieren reabastecimiento segun niveles de alerta.</p>
          </div>
          <Link href="/dashboard/compras/pedidos"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
            <ShoppingCart size={18} /> Crear Pedido de Compra
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-red-300 transition-all"
            onClick={() => setActiveTab('Urgente (0 stock)')}>
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 mb-4 group-hover:scale-110 transition-transform"><AlertCircle size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Sin Stock (0)</p>
            <h2 className="text-4xl font-black text-slate-800">{sinStock}</h2>
            <p className="text-xs font-bold text-red-600 mt-2 flex items-center gap-1"><AlertTriangle size={11} /> Orden urgente requerida</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Bajo Minimo')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Package size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Bajo Minimo</p>
            <h2 className="text-4xl font-black text-slate-800">{bajoMin}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2">Menor al stock minimo configurado</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('En Orden')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Bien Abastecidos</p>
            <h2 className="text-4xl font-black text-slate-800">{ok}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Stock sobre el minimo</p>
          </div>
          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-emerald-100 uppercase tracking-wider mb-1 relative z-10">PEC Activos</p>
            <h2 className="text-4xl font-black text-white relative z-10">{comprasStats?.pec_activos ?? comprasStats?.pec_total ?? '?'}</h2>
            <p className="text-xs font-bold text-emerald-100 mt-2 relative z-10">Pedidos de compra en curso</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Urgente (0 stock)', 'Bajo Minimo', 'En Orden'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab.includes('Urgente')    ? 'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      : tab === 'Bajo Minimo'       ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      :                                'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab.includes('Urgente') ? sinStock : tab === 'Bajo Minimo' ? bajoMin : ok})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar producto..." className="bg-transparent text-sm outline-none w-52" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4">Referencia</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4 text-right">Stock Actual</th>
                  <th className="px-6 py-4 text-right">Stock Minimo</th>
                  <th className="px-6 py-4">Estado Abasto</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-emerald-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando catalogo...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-20 text-center">
                    <Package size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin productos en esta categoria</p>
                  </td></tr>
                ) : filtered.map((p: any) => {
                  const stock = p.current_stock ?? p.quantity ?? 0;
                  const min = p.low_stock_alert ?? 0;
                  const status = getStatus(p);
                  return (
                    <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-800">{p.name}</p>
                        {p.type && <p className="text-xs text-slate-400">{p.type}</p>}
                      </td>
                      <td className="px-6 py-4 font-mono text-sm text-slate-600">{p.reference || '-'}</td>
                      <td className="px-6 py-4 text-slate-600">{p.category_name || '-'}</td>
                      <td className="px-6 py-4 text-right">
                        <span className={`font-black text-lg ${
                          status === 'SIN_STOCK' ? 'text-red-600'
                          : status === 'BAJO_MINIMO' ? 'text-amber-600'
                          : 'text-slate-800'
                        }`}>{stock}</span>
                      </td>
                      <td className="px-6 py-4 text-right font-medium text-slate-500">{min || '-'}</td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                          status === 'SIN_STOCK'     ? 'bg-red-50 text-red-700 border-red-200'
                          : status === 'BAJO_MINIMO' ? 'bg-amber-50 text-amber-700 border-amber-200'
                          :                             'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}>
                          {status === 'SIN_STOCK' ? <><AlertCircle size={10} /> Sin Stock</>
                          : status === 'BAJO_MINIMO' ? <><AlertTriangle size={10} /> Bajo Minimo</>
                          : <><CheckCircle2 size={10} /> OK</>}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {status !== 'OK' && (
                            <Link href="/dashboard/compras/pedidos"
                              className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                              <ShoppingCart size={11} /> Crear PEC
                            </Link>
                          )}
                          <Link href="/dashboard/inventario/productos"
                            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded text-xs font-bold">
                            Ver Producto
                          </Link>
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
    </div>
  );
}
