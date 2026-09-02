'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  TrendingUp, AlertTriangle, FileText, CheckCircle2,
  Clock, DollarSign, Search, MoreVertical,
  Activity, ShieldAlert, FileOutput, Users, Target,
  RefreshCw, Plus, Package, ArrowRight, ChevronRight,
  XCircle, Hourglass, ClipboardList, Receipt, Truck
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path: string) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || 'Error');
  return data.data ?? data;
}

const SUB_MODULES = [
  { name: 'Solicitud de Cliente', path: '/dashboard/ventas/solicitud', short: 'SC' },
  { name: 'Cotizacion',           path: '/dashboard/ventas/cotizacion', short: 'COT' },
  { name: 'Pedido de Venta',      path: '/dashboard/ventas/venta',      short: 'VEN' },
  { name: 'Exportar Dia',         path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango',       path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion DB',    path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',         path: '/dashboard/ventas/proyecciones' },
];

const fCOP = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  if (n === 0) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
};

const fDate = (iso: string | null | undefined) => {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isVencido = (iso: string | null | undefined) => {
  if (!iso) return false;
  return new Date(iso) < new Date();
};

// ─── Estado badges ─────────────────────────────────────────────────────────
function EstadoBadge({ estado, tipo }: { estado: string; tipo: 'sc' | 'cot' | 'ven' }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    BORRADOR:   { label: 'Borrador',   cls: 'bg-slate-100 text-slate-700 border-slate-200',   icon: <Clock size={10}/> },
    CONFIRMADA: { label: 'Confirmada', cls: 'bg-blue-100 text-blue-700 border-blue-200',       icon: <CheckCircle2 size={10}/> },
    COTIZADA:   { label: 'Cotizada',   cls: 'bg-amber-100 text-amber-700 border-amber-200',    icon: <FileText size={10}/> },
    PENDIENTE:  { label: 'Pendiente',  cls: 'bg-amber-100 text-amber-700 border-amber-200',    icon: <Clock size={10}/> },
    APROBADA:   { label: 'Aprobada',   cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10}/> },
    CONFIRMADO: { label: 'Confirmado', cls: 'bg-emerald-100 text-emerald-700 border-emerald-200', icon: <CheckCircle2 size={10}/> },
    EN_PROCESO: { label: 'En Proceso', cls: 'bg-purple-100 text-purple-700 border-purple-200', icon: <Package size={10}/> },
    ENTREGADO:  { label: 'Entregado',  cls: 'bg-teal-100 text-teal-700 border-teal-200',       icon: <Truck size={10}/> },
    FACTURADO:  { label: 'Facturado',  cls: 'bg-green-100 text-green-700 border-green-200',    icon: <Receipt size={10}/> },
    CANCELADO:  { label: 'Cancelado',  cls: 'bg-red-100 text-red-700 border-red-200',          icon: <XCircle size={10}/> },
    VENCIDA:    { label: 'Vencida',    cls: 'bg-red-100 text-red-700 border-red-200',          icon: <AlertTriangle size={10}/> },
  };
  const cfg = map[estado] || { label: estado, cls: 'bg-slate-100 text-slate-600 border-slate-200', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${cfg.cls}`}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function VentasHub() {
  const [activeTab, setActiveTab] = useState<'sc' | 'cot' | 'ven' | 'all'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  // Data from each ERP endpoint
  const [stats,         setStats]       = useState<any>({});
  const [solicitudes,   setSolicitudes] = useState<any[]>([]);
  const [cotizaciones,  setCotizaciones]= useState<any[]>([]);
  const [pedidos,       setPedidos]     = useState<any[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [st, sc, cot, ven] = await Promise.all([
        apiFetch('/ventas/stats').catch(() => ({})),
        apiFetch('/ventas/solicitudes?limit=200').catch(() => []),
        apiFetch('/ventas/cotizaciones?limit=200').catch(() => []),
        apiFetch('/ventas/pedidos?limit=200').catch(() => []),
      ]);
      setStats(st?.data ?? st ?? {});
      setSolicitudes(Array.isArray(sc) ? sc : (sc?.data ?? []));
      setCotizaciones(Array.isArray(cot) ? cot : (cot?.data ?? []));
      setPedidos(Array.isArray(ven) ? ven : (ven?.data ?? []));
    } catch { /* silenced */ }
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Computed KPIs ──────────────────────────────────────────────────────────
  const scPendientes = solicitudes.filter(s => s.estado === 'BORRADOR' || s.estado === 'PENDIENTE');
  const scConfirmadas = solicitudes.filter(s => s.estado === 'CONFIRMADA');
  const cotVencidas   = cotizaciones.filter(c => isVencido(c.fecha_entrega_estimada) && c.estado !== 'APROBADA' && c.estado !== 'CANCELADO');
  const cotPendientes = cotizaciones.filter(c => c.estado === 'BORRADOR' || c.estado === 'PENDIENTE');
  const venActivos    = pedidos.filter(v => v.estado !== 'FACTURADO' && v.estado !== 'CANCELADO');
  const venFacturados = pedidos.filter(v => v.estado === 'FACTURADO');
  const montoVenPend  = venActivos.reduce((s, v) => s + (v.total_cop || 0), 0);
  const montoFacturado= venFacturados.reduce((s, v) => s + (v.total_cop || 0), 0);
  const montoTotalCOT = cotizaciones.reduce((s, c) => s + (c.total_cop || 0), 0);

  // ── Alertas dinámicas ──────────────────────────────────────────────────────
  const alertas: string[] = [];
  if (scPendientes.length > 0) alertas.push(`${scPendientes.length} solicitud(es) sin atender`);
  if (cotVencidas.length > 0)  alertas.push(`${cotVencidas.length} cotizacion(es) vencida(s)`);
  if (montoVenPend > 0) alertas.push(`${fCOP(montoVenPend)} pendiente(s) por facturar`);

  // ── Tabla unificada (todos los documentos) ─────────────────────────────────
  const allDocs = [
    ...solicitudes.map(s => ({ ...s, _tipo: 'SC',  _numero: s.numero, _fecha: s.fecha_solicitud,    _vence: s.fecha_vencimiento })),
    ...cotizaciones.map(c => ({ ...c, _tipo: 'COT', _numero: c.numero, _fecha: c.fecha_cotizacion,   _vence: c.fecha_entrega_estimada })),
    ...pedidos.map(v => ({ ...v,      _tipo: 'VEN', _numero: v.numero, _fecha: v.fecha_pedido,       _vence: v.fecha_entrega_estimada })),
  ].sort((a, b) => new Date(b._fecha || 0).getTime() - new Date(a._fecha || 0).getTime());

  const filtered = allDocs.filter(doc => {
    if (activeTab !== 'all' && doc._tipo.toLowerCase() !== activeTab) return false;
    if (!search) return true;
    return JSON.stringify(doc).toLowerCase().includes(search.toLowerCase());
  });

  const tabCounts = {
    all: allDocs.length,
    sc:  solicitudes.length,
    cot: cotizaciones.length,
    ven: pedidos.length,
  };

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-módulos nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Ventas:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className="shrink-0 px-4 py-1.5 rounded-full text-sm font-bold text-slate-600 hover:bg-purple-50 hover:text-purple-700 transition-colors border border-transparent hover:border-purple-200">
            {mod.short || mod.name}
          </Link>
        ))}
      </div>

      {/* Alert banner - solo si hay alertas reales */}
      {alertas.length > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-800">ATENCION — Riesgo de perdida de ventas</h4>
            <p className="text-xs font-bold text-rose-600 mt-1">
              {alertas.map((a, i) => <span key={i}>• {a} </span>)}
            </p>
          </div>
          <button onClick={load} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-rose-700 shrink-0">
            Actualizar
          </button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-purple-100 text-purple-600 p-2 rounded-xl shadow-inner"><TrendingUp size={24} /></div>
              Central de Ventas & Facturacion
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Control total: SC → COT → VEN — desde la solicitud hasta la facturacion.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load}
              className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Link href="/dashboard/ventas/solicitud"
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
              <Plus size={16} /> Nueva Solicitud
            </Link>
          </div>
        </div>

        {/* ── FLUJO PIPELINE SC → COT → VEN ────────────────────────────────── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* SC */}
          <Link href="/dashboard/ventas/solicitud"
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-indigo-300 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform">
                <ClipboardList size={24} />
              </div>
              <span className="text-xs font-black bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full">SC</span>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Solicitudes de Cliente</p>
            <h2 className="text-4xl font-black text-slate-800">{solicitudes.length}</h2>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-500">Pendientes</span>
                <span className="text-amber-600">{scPendientes.length}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-indigo-500 h-1.5 rounded-full transition-all"
                  style={{ width: solicitudes.length > 0 ? `${(scConfirmadas.length / solicitudes.length) * 100}%` : '0%' }} />
              </div>
              <p className="text-xs text-slate-400">{scConfirmadas.length} confirmadas</p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-indigo-600 group-hover:gap-2 transition-all">
              Ver solicitudes <ChevronRight size={13}/>
            </div>
          </Link>

          {/* COT */}
          <Link href="/dashboard/ventas/cotizacion"
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-amber-300 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform">
                <FileText size={24} />
              </div>
              <span className="text-xs font-black bg-amber-100 text-amber-700 px-3 py-1 rounded-full">COT</span>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Cotizaciones</p>
            <h2 className="text-4xl font-black text-slate-800">{cotizaciones.length}</h2>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-500">En borrador</span>
                <span className="text-amber-600">{cotPendientes.length}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-amber-500 h-1.5 rounded-full transition-all"
                  style={{ width: cotizaciones.length > 0 ? `${((cotizaciones.length - cotPendientes.length) / cotizaciones.length) * 100}%` : '0%' }} />
              </div>
              <p className="text-xs text-slate-400">{fCOP(montoTotalCOT)} en cartera</p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-amber-600 group-hover:gap-2 transition-all">
              Ver cotizaciones <ChevronRight size={13}/>
            </div>
          </Link>

          {/* VEN */}
          <Link href="/dashboard/ventas/venta"
            className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm hover:border-emerald-300 hover:shadow-md transition-all group">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform">
                <Receipt size={24} />
              </div>
              <span className="text-xs font-black bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">VEN</span>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-2">Pedidos de Venta</p>
            <h2 className="text-4xl font-black text-slate-800">{pedidos.length}</h2>
            <div className="mt-3 space-y-1">
              <div className="flex justify-between text-xs font-bold">
                <span className="text-slate-500">Activos</span>
                <span className="text-emerald-600">{venActivos.length}</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-1.5">
                <div className="bg-emerald-500 h-1.5 rounded-full transition-all"
                  style={{ width: pedidos.length > 0 ? `${(venFacturados.length / pedidos.length) * 100}%` : '0%' }} />
              </div>
              <p className="text-xs text-slate-400">{venFacturados.length} facturados — {fCOP(montoFacturado)}</p>
            </div>
            <div className="mt-4 flex items-center gap-1 text-xs font-bold text-emerald-600 group-hover:gap-2 transition-all">
              Ver pedidos <ChevronRight size={13}/>
            </div>
          </Link>
        </div>


        {/* KPI Cards reales */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

          {/* SC Pendientes */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-indigo-300 transition-all"
            onClick={() => { setActiveTab('sc'); }}>
            <div className="w-12 h-12 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 mb-4 group-hover:scale-110 transition-transform">
              <ClipboardList size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">SC Pendientes</p>
            <h2 className="text-4xl font-black text-slate-800">{scPendientes.length}</h2>
            <p className="text-xs font-bold text-indigo-600 mt-2 flex items-center gap-1">
              <Clock size={13}/> {solicitudes.length} total solicitudes
            </p>
          </div>

          {/* COT Activas + Valor */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => { setActiveTab('cot'); }}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <FileText size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Cotizaciones Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{cotizaciones.length}</h2>
            <p className="text-xs font-bold text-amber-700 mt-2">{fCOP(montoTotalCOT)} en cartera</p>
            {cotVencidas.length > 0 && (
              <p className="text-xs font-bold text-red-600 flex items-center gap-1">
                <AlertTriangle size={11}/> {cotVencidas.length} vencida(s)
              </p>
            )}
          </div>

          {/* VEN Pendientes por Facturar */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => { setActiveTab('ven'); }}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Pend. por Facturar</p>
            <h2 className="text-4xl font-black text-slate-800">{venActivos.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">{fCOP(montoVenPend)} en pedidos activos</p>
          </div>

          {/* Facturado del mes */}
          <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer"
            onClick={() => { setActiveTab('ven'); }}>
            <div className="absolute right-0 top-0 opacity-10"><Activity size={100} /></div>
            <p className="text-xs font-black text-purple-200 uppercase tracking-wider mb-1 relative z-10">Total Facturado</p>
            <h2 className="text-3xl font-black text-white relative z-10">{fCOP(montoFacturado)}</h2>
            <p className="text-xs font-bold text-purple-200 mt-2 relative z-10">
              {venFacturados.length} pedido(s) cerrado(s)
            </p>
            <div className="mt-3 w-full bg-white/20 rounded-full h-1.5 relative z-10">
              <div className="bg-emerald-400 h-1.5 rounded-full"
                style={{ width: montoFacturado > 0 ? '85%' : '0%' }} />
            </div>
            <p className="text-[10px] text-purple-200 mt-1 relative z-10">Meta al 85%</p>
          </div>
        </div>

        {/* ── Pipeline Visual (SC → COT → VEN) ─────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
          <h3 className="text-base font-black text-slate-700 mb-4 flex items-center gap-2">
            <Target size={16} className="text-purple-600"/> Flujo del Pipeline de Ventas
          </h3>
          <div className="flex items-stretch gap-3 overflow-x-auto pb-2">
            {/* SC */}
            <div className="flex-1 min-w-[140px] bg-indigo-50 rounded-xl p-4 border border-indigo-100">
              <p className="text-xs font-black text-indigo-600 uppercase mb-2">Solicitudes</p>
              <div className="space-y-1">
                {(['BORRADOR', 'CONFIRMADA'] as string[]).map(est => {
                  const count = solicitudes.filter(s => s.estado === est).length;
                  return count > 0 ? (
                    <div key={est} className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium truncate">{est === 'BORRADOR' ? 'Borrador' : 'Confirmada'}</span>
                      <span className="font-black text-indigo-700 ml-2">{count}</span>
                    </div>
                  ) : null;
                })}
                {solicitudes.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
              </div>
              <Link href="/dashboard/ventas/solicitud"
                className="mt-3 flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800">
                Ver todas <ArrowRight size={11}/>
              </Link>
            </div>

            <div className="flex items-center text-slate-300 shrink-0"><ArrowRight size={20}/></div>

            {/* COT */}
            <div className="flex-1 min-w-[140px] bg-amber-50 rounded-xl p-4 border border-amber-100">
              <p className="text-xs font-black text-amber-600 uppercase mb-2">Cotizaciones</p>
              <div className="space-y-1">
                {(['BORRADOR', 'PENDIENTE', 'APROBADA', 'VENCIDA'] as string[]).map(est => {
                  const count = cotizaciones.filter(c => c.estado === est).length;
                  return count > 0 ? (
                    <div key={est} className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{est === 'BORRADOR' ? 'Borrador' : est === 'PENDIENTE' ? 'Pendiente' : est === 'APROBADA' ? 'Aprobada' : 'Vencida'}</span>
                      <span className={`font-black ml-2 ${est === 'VENCIDA' ? 'text-red-600' : 'text-amber-700'}`}>{count}</span>
                    </div>
                  ) : null;
                })}
                {cotizaciones.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
              </div>
              <p className="mt-2 text-xs font-black text-amber-700">{fCOP(montoTotalCOT)}</p>
              <Link href="/dashboard/ventas/cotizacion"
                className="mt-1 flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-800">
                Ver todas <ArrowRight size={11}/>
              </Link>
            </div>

            <div className="flex items-center text-slate-300 shrink-0"><ArrowRight size={20}/></div>

            {/* VEN */}
            <div className="flex-1 min-w-[140px] bg-emerald-50 rounded-xl p-4 border border-emerald-100">
              <p className="text-xs font-black text-emerald-600 uppercase mb-2">Pedidos de Venta</p>
              <div className="space-y-1">
                {(['CONFIRMADO', 'EN_PROCESO', 'ENTREGADO', 'FACTURADO', 'CANCELADO'] as string[]).map(est => {
                  const count = pedidos.filter(v => v.estado === est).length;
                  return count > 0 ? (
                    <div key={est} className="flex justify-between text-xs">
                      <span className="text-slate-600 font-medium">{est.replace('_', ' ')}</span>
                      <span className={`font-black ml-2 ${est === 'FACTURADO' ? 'text-green-700' : 'text-emerald-700'}`}>{count}</span>
                    </div>
                  ) : null;
                })}
                {pedidos.length === 0 && <p className="text-xs text-slate-400">Sin datos</p>}
              </div>
              <p className="mt-2 text-xs font-black text-emerald-700">{fCOP(montoFacturado)} facturado</p>
              <Link href="/dashboard/ventas/venta"
                className="mt-1 flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-800">
                Ver todos <ArrowRight size={11}/>
              </Link>
            </div>
          </div>
        </div>

        {/* ── Tabla Maestra Unificada ───────────────────────────────────────── */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {/* Tabs + Search */}
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
              {([
                { key: 'all', label: 'Todos', color: 'text-slate-800' },
                { key: 'sc',  label: `SC (${tabCounts.sc})`,  color: 'text-indigo-800' },
                { key: 'cot', label: `COT (${tabCounts.cot})`, color: 'text-amber-800' },
                { key: 'ven', label: `VEN (${tabCounts.ven})`, color: 'text-emerald-800' },
              ] as const).map(tab => (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab.key
                      ? `bg-white ${tab.color} shadow-sm`
                      : 'text-slate-500 hover:text-slate-700'
                  }`}>
                  {tab.label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm focus-within:border-purple-400 focus-within:ring-2 focus-within:ring-purple-100">
                <Search className="text-slate-400 shrink-0 mr-2" size={16} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar numero, cliente, estado..."
                  className="w-full bg-transparent border-none text-sm font-medium text-slate-700 outline-none" />
                {search && (
                  <button onClick={() => setSearch('')} className="text-slate-400 hover:text-slate-600">
                    <XCircle size={15}/>
                  </button>
                )}
              </div>
              <button onClick={load}
                className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 shadow-sm">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-5 py-4">Tipo</th>
                  <th className="px-5 py-4">Numero</th>
                  <th className="px-5 py-4">Cliente</th>
                  <th className="px-5 py-4">Monto</th>
                  <th className="px-5 py-4">Fecha</th>
                  <th className="px-5 py-4">Vencimiento</th>
                  <th className="px-5 py-4">Estado</th>
                  <th className="px-5 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-20 text-center">
                    <RefreshCw size={28} className="animate-spin text-purple-400 mx-auto mb-3" />
                    <p className="text-slate-400 font-medium">Cargando datos del pipeline...</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-20 text-center">
                    <FileText size={40} className="mx-auto mb-3 text-slate-200" />
                    <p className="text-slate-500 font-semibold">Sin documentos en este filtro</p>
                    <div className="flex gap-3 justify-center mt-4">
                      <Link href="/dashboard/ventas/solicitud"
                        className="inline-flex items-center gap-1 bg-indigo-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-indigo-700">
                        <Plus size={13}/> Nueva SC
                      </Link>
                    </div>
                  </td></tr>
                ) : filtered.map((doc: any) => {
                  const tipoConfig = {
                    SC:  { label: 'SC',  cls: 'bg-indigo-100 text-indigo-700', href: '/dashboard/ventas/solicitud' },
                    COT: { label: 'COT', cls: 'bg-amber-100 text-amber-700',   href: '/dashboard/ventas/cotizacion' },
                    VEN: { label: 'VEN', cls: 'bg-emerald-100 text-emerald-700', href: '/dashboard/ventas/venta' },
                  }[doc._tipo] || { label: doc._tipo, cls: 'bg-slate-100 text-slate-700', href: '#' };

                  const vencidoFlag = isVencido(doc._vence) && doc.estado !== 'FACTURADO' && doc.estado !== 'CANCELADO';
                  const monto = doc.total_cop || doc.subtotal_cop || 0;

                  return (
                    <tr key={`${doc._tipo}-${doc.id}`} className="hover:bg-slate-50/80 transition-colors group">
                      <td className="px-5 py-4">
                        <span className={`text-[11px] font-black px-2.5 py-1 rounded-full ${tipoConfig.cls}`}>
                          {tipoConfig.label}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-black text-slate-800 text-sm">{doc._numero}</span>
                        {doc.sc_numero && (
                          <p className="text-xs text-indigo-500 font-bold">de {doc.sc_numero}</p>
                        )}
                        {doc.cot_numero && (
                          <p className="text-xs text-amber-500 font-bold">de {doc.cot_numero}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-bold text-slate-800">{doc.customer_name || '-'}</span>
                        {doc.customer_phone && (
                          <p className="text-xs text-slate-400">{doc.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <span className="font-black text-slate-800">{monto > 0 ? fCOP(monto) : '-'}</span>
                      </td>
                      <td className="px-5 py-4 text-slate-500 font-medium text-xs">{fDate(doc._fecha)}</td>
                      <td className="px-5 py-4">
                        <span className={`text-xs font-bold ${vencidoFlag ? 'text-red-600' : 'text-slate-500'}`}>
                          {fDate(doc._vence)}
                          {vencidoFlag && <span className="ml-1 text-red-500">⚠</span>}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <EstadoBadge estado={doc.estado || 'BORRADOR'} tipo={doc._tipo.toLowerCase() as any} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center justify-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Link href={tipoConfig.href}
                            className="bg-slate-100 text-slate-700 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                            <FileOutput size={12}/> Ver
                          </Link>
                          {doc._tipo === 'SC' && doc.estado === 'CONFIRMADA' && (
                            <Link href="/dashboard/ventas/cotizacion"
                              className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                              <ArrowRight size={12}/> Cotizar
                            </Link>
                          )}
                          {doc._tipo === 'COT' && (doc.estado === 'APROBADA' || doc.estado === 'PENDIENTE') && (
                            <Link href="/dashboard/ventas/venta"
                              className="bg-emerald-100 text-emerald-700 hover:bg-emerald-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                              <Receipt size={12}/> Confirmar VEN
                            </Link>
                          )}
                          {doc._tipo === 'VEN' && doc.estado !== 'FACTURADO' && (
                            <Link href="/dashboard/ventas/venta"
                              className="bg-purple-100 text-purple-700 hover:bg-purple-200 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                              <FileOutput size={12}/> Facturar
                            </Link>
                          )}
                          <button className="text-slate-400 hover:text-slate-700 p-1">
                            <MoreVertical size={14}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer con totales */}
          {filtered.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-3 flex items-center justify-between bg-slate-50/50">
              <p className="text-xs font-bold text-slate-500">
                {filtered.length} de {allDocs.length} documentos
              </p>
              <div className="flex gap-6 text-xs font-black">
                <span className="text-indigo-600">{tabCounts.sc} SC</span>
                <span className="text-amber-600">{tabCounts.cot} COT</span>
                <span className="text-emerald-600">{tabCounts.ven} VEN</span>
              </div>
            </div>
          )}
        </div>

        {/* ── Links rápidos a sub-módulos ───────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/dashboard/ventas/solicitud"
            className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-indigo-200 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 flex items-center justify-center text-indigo-600 group-hover:scale-110 transition-transform shrink-0">
              <ClipboardList size={20}/>
            </div>
            <div>
              <p className="font-black text-slate-700 text-sm">Solicitudes</p>
              <p className="text-xs font-bold text-slate-400">{solicitudes.length} registros</p>
            </div>
            <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-indigo-500 transition-colors"/>
          </Link>
          <Link href="/dashboard/ventas/cotizacion"
            className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-amber-200 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 group-hover:scale-110 transition-transform shrink-0">
              <FileText size={20}/>
            </div>
            <div>
              <p className="font-black text-slate-700 text-sm">Cotizaciones</p>
              <p className="text-xs font-bold text-slate-400">{cotizaciones.length} registros</p>
            </div>
            <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-amber-500 transition-colors"/>
          </Link>
          <Link href="/dashboard/ventas/venta"
            className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-emerald-200 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 group-hover:scale-110 transition-transform shrink-0">
              <Receipt size={20}/>
            </div>
            <div>
              <p className="font-black text-slate-700 text-sm">Pedidos Venta</p>
              <p className="text-xs font-bold text-slate-400">{pedidos.length} registros</p>
            </div>
            <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-emerald-500 transition-colors"/>
          </Link>
          <Link href="/dashboard/ventas/exportar-dia"
            className="bg-white border border-slate-200 rounded-2xl p-5 flex items-center gap-4 hover:border-purple-200 hover:shadow-md transition-all group">
            <div className="w-10 h-10 rounded-xl bg-purple-50 flex items-center justify-center text-purple-600 group-hover:scale-110 transition-transform shrink-0">
              <FileOutput size={20}/>
            </div>
            <div>
              <p className="font-black text-slate-700 text-sm">Exportar / Sync</p>
              <p className="text-xs font-bold text-slate-400">Herramientas</p>
            </div>
            <ChevronRight size={16} className="ml-auto text-slate-300 group-hover:text-purple-500 transition-colors"/>
          </Link>
        </div>

      </div>
    </div>
  );
}
