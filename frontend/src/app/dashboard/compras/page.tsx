'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ShoppingBag, AlertTriangle, Package, CheckCircle2,
  Clock, Truck, Search, MoreVertical,
  Activity, ShieldAlert, Receipt, RefreshCw
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
  { name: 'Lista de Compras',      path: '/dashboard/compras/lista-compras' },
  { name: 'Pedidos de Compra',     path: '/dashboard/compras/pedidos' },
  { name: 'Mercancia en Transito', path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)', path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos',    path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual',   path: '/dashboard/compras/registro' },
  { name: 'Proyecciones',          path: '/dashboard/compras/proyecciones' },
];

const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '$0';
const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function ComprasHub() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [stats, setStats] = useState<any>({});
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('En Proceso');
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [p, s] = await Promise.all([
        apiFetch('/compras/pedidos?limit=100').catch(() => []),
        apiFetch('/compras/stats').catch(() => ({})),
      ]);
      setPedidos(Array.isArray(p) ? p : (p?.data ?? []));
      setStats(s?.data ?? s ?? {});
    } catch { setPedidos([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const enProceso = pedidos.filter(p => p.estado === 'EMITIDO' || p.estado === 'ENVIADO' || p.estado === 'EN_TRANSITO' || p.estado === 'PENDIENTE_ENTREGA');
  const recibidos = pedidos.filter(p => p.estado === 'RECIBIDO' || p.estado === 'COMPLETADO');
  const retrasados = pedidos.filter(p => p.is_overdue);
  const montoTransito = pedidos.filter(p => p.estado === 'EN_TRANSITO').reduce((s, p) => s + (p.total_cop || 0), 0);

  const filtered = pedidos.filter(p => {
    const ms = !search || JSON.stringify(p).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'En Proceso') return p.estado === 'EMITIDO' || p.estado === 'ENVIADO' || p.estado === 'EN_TRANSITO' || p.estado === 'PENDIENTE_ENTREGA';
    if (activeTab === 'Recibidos') return p.estado === 'RECIBIDO' || p.estado === 'COMPLETADO';
    if (activeTab === 'Alertas') return p.is_overdue;
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-Modulos */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Compras:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className="shrink-0 px-4 py-1.5 rounded-full text-sm font-bold text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 transition-colors border border-transparent hover:border-emerald-200">
            {mod.name}
          </Link>
        ))}
      </div>

      {/* Alert banner — solo si hay retrasados */}
      {retrasados.length > 0 && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-start gap-4 z-20">
          <ShieldAlert className="text-orange-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-orange-800">ALERTA DE CADENA DE SUMINISTRO</h4>
            <p className="text-xs font-bold text-orange-600 mt-1">
              {retrasados.length} pedido(s) con fecha de entrega vencida. Riesgo de incumplimiento a clientes.
            </p>
          </div>
          <Link href="/dashboard/compras/transito"
            className="bg-orange-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-orange-700 shrink-0">
            Gestionar Retrasos
          </Link>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-emerald-100 text-emerald-600 p-2 rounded-xl shadow-inner"><ShoppingBag size={24} /></div>
              Central de Compras & Abastecimiento
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Control integral: ordenes de compra, transito y verificacion de recepciones.</p>
          </div>
          <Link href="/dashboard/compras/pedidos"
            className="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Receipt size={18} /> Emitir Pedido de Compra
          </Link>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('En Proceso')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <Receipt size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pedidos Activos</p>
            <h2 className="text-4xl font-black text-slate-800">{enProceso.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1"><Clock size={14}/> En proceso o transito</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <Truck size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Capital en Transito</p>
            <h2 className="text-3xl font-black text-slate-800">{fCOP(montoTransito)}</h2>
            <p className="text-xs font-bold text-blue-600 mt-2">Inventario flotante</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-red-300 transition-all"
            onClick={() => setActiveTab('Alertas')}>
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${retrasados.length > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
              <AlertTriangle size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Retrasos Criticos</p>
            <h2 className={`text-4xl font-black ${retrasados.length > 0 ? 'text-red-600' : 'text-slate-800'}`}>{retrasados.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Pedidos con entrega vencida</p>
          </div>

          <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer"
            onClick={() => setActiveTab('Recibidos')}>
            <div className="absolute right-0 top-0 opacity-20"><Activity size={100} /></div>
            <p className="text-xs font-black text-emerald-200 uppercase tracking-wider mb-1 relative z-10">Total Recibidos</p>
            <h2 className="text-4xl font-black text-white relative z-10">{recibidos.length}</h2>
            <p className="text-xs font-bold text-emerald-100 mt-2 relative z-10">Pedidos completados</p>
          </div>
        </div>

        {/* Tabla */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2">
              {[
                { label: 'En Proceso / Transito', key: 'En Proceso', count: enProceso.length },
                { label: 'Mercancia Recibida',    key: 'Recibidos',  count: recibidos.length },
                { label: 'Retrasos Criticos',     key: 'Alertas',    count: retrasados.length },
              ].map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-5 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab.key
                      ? tab.key === 'Alertas'   ? 'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      : tab.key === 'Recibidos' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                           'bg-blue-100 text-blue-800 shadow-sm border border-blue-200'
                      : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                  }`}>
                  {tab.label} ({tab.count})
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-64 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-100">
                <Search className="text-slate-400 shrink-0 mr-2" size={16} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar PEC, Proveedor..."
                  className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none" />
              </div>
              <button onClick={load} className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">PEC # (Trazabilidad)</th>
                  <th className="px-6 py-4">Proveedor</th>
                  <th className="px-6 py-4">Monto</th>
                  <th className="px-6 py-4">Entrega Est.</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-emerald-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando pedidos...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={6} className="px-6 py-16 text-center text-slate-500 font-medium">
                    <Package size={36} className="mx-auto mb-3 text-slate-300" />
                    No hay pedidos en esta categoria.
                  </td></tr>
                ) : filtered.map((p: any) => (
                  <tr key={p.id} className="hover:bg-slate-50/80 transition-colors group">
                    <td className="px-6 py-4">
                      <span className="font-black text-purple-700">{p.numero}</span>
                      {p.ven_numero && (
                        <p className="text-xs text-emerald-600 font-bold mt-0.5">VEN: {p.ven_numero}</p>
                      )}
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800">{p.supplier_name || '-'}</td>
                    <td className="px-6 py-4 font-black text-slate-800">{fCOP(p.total_cop || 0)}</td>
                    <td className="px-6 py-4">
                      <span className={`text-sm font-bold ${p.is_overdue ? 'text-red-600' : 'text-slate-600'}`}>
                        {fDate(p.fecha_entrega_estimada)}
                        {p.is_overdue && <span className="ml-1 text-xs">(Vencido)</span>}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      {p.estado === 'EMITIDO' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200"><Clock size={12}/> Emitido</span>}
                      {p.estado === 'EN_TRANSITO' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-blue-100 text-blue-800 border border-blue-200"><Truck size={12}/> En Transito</span>}
                      {(p.estado === 'RECIBIDO' || p.estado === 'COMPLETADO') && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200"><CheckCircle2 size={12}/> Recibido</span>}
                      {p.estado === 'ENVIADO' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-amber-100 text-amber-800 border border-amber-200"><Package size={12}/> Enviado</span>}
                      {p.is_overdue && <span className="ml-1 inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700"><AlertTriangle size={10}/> Retrasado</span>}
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href="/dashboard/compras/transito"
                          className="bg-blue-100 text-blue-700 hover:bg-blue-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                          <Truck size={12}/> Tracking
                        </Link>
                        {(p.estado === 'EN_TRANSITO' || p.estado === 'ENVIADO') && (
                          <Link href="/dashboard/compras/recepciones"
                            className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                            <Package size={12}/> Recepcionar
                          </Link>
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
    </div>
  );
}
