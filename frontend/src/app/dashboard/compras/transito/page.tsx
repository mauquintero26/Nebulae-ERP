'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  Truck, ShieldAlert, Activity, Clock, AlertCircle,
  CheckCircle2, RefreshCw, Check, Package, DollarSign,
  ChevronRight, TrendingUp
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
  { name: 'Pedidos de Compra',       path: '/dashboard/compras/pedidos' },
  { name: 'Mercancia en Transito',   path: '/dashboard/compras/transito' },
  { name: 'Recepciones (Entrada)',   path: '/dashboard/compras/recepciones' },
  { name: 'Traslados Internos',      path: '/dashboard/compras/traslados' },
  { name: 'Registro OCR/Manual',     path: '/dashboard/compras/registro' },
  { name: 'Proyecciones',            path: '/dashboard/compras/proyecciones' },
];

const TRACKING_STAGES = [
  { stage: 'PROVEEDOR_CASILLERO', label: 'Proveedor → Casillero', labelShort: 'Proveedor' },
  { stage: 'CASILLERO_ADUANA',    label: 'Casillero → Aduana',    labelShort: 'Aduana' },
  { stage: 'ADUANA_BODEGA',       label: 'Aduana → Bodega',       labelShort: 'Bodega' },
  { stage: 'ENTREGADO',           label: 'Entregado',             labelShort: 'Entregado' },
];

const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function TransitoPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    load();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/compras/transito');
      setPedidos(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setPedidos([]); }
    finally { setLoading(false); }
  }, []);

  async function updateTracking(pec_id: number, stage: string, status: string) {
    setUpdatingId(pec_id);
    try {
      await apiFetch(`/compras/pedidos/${pec_id}/tracking`, {
        method: 'PATCH',
        body: JSON.stringify({ stage, status, user_name: currentUser }),
      });
      load();
    } finally { setUpdatingId(null); }
  }

  const overdue = pedidos.filter(p => p.is_overdue).length;
  const montoTotal = pedidos.reduce((s, p) => s + (p.total_cop || 0), 0);
  const promedioEtapas = pedidos.length > 0
    ? Math.round(pedidos.reduce((s, p) => s + ((p.tracking_stages || []).filter((t: any) => t.status === 'COMPLETADO').length), 0) / pedidos.length * 10) / 10
    : 0;

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Modulos:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/compras/transito'
                ? 'bg-blue-600 text-white border-blue-600'
                : 'text-slate-600 hover:bg-emerald-50 hover:text-emerald-700 border-transparent hover:border-emerald-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert banner */}
      {overdue > 0 && (
        <div className="bg-red-50 border-b border-red-200 px-6 py-3 flex items-start gap-4 z-20">
          <ShieldAlert className="text-red-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-red-800">ALERTA DE RETRASO EN CADENA DE SUMINISTRO</h4>
            <p className="text-xs font-bold text-red-600 mt-1">{overdue} pedido(s) con fecha de entrega vencida. Riesgo de incumplimiento a clientes.</p>
          </div>
          <Link href="/dashboard/compras/pedidos" className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 shrink-0">
            Gestionar Retrasos
          </Link>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-blue-100 text-blue-600 p-2 rounded-xl shadow-inner"><Truck size={24} /></div>
              Mercancia en Transito
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Seguimiento en tiempo real de los embarques activos y su progreso por etapas.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="bg-white border border-slate-200 px-4 py-3 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2">
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Actualizar
            </button>
            <Link href="/dashboard/compras/pedidos"
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
              <Package size={18} /> Ver Pedidos
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><Truck size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">En Transito Activo</p>
            <h2 className="text-4xl font-black text-slate-800">{pedidos.length}</h2>
            <p className="text-xs font-bold text-blue-600 mt-2">Embarques en seguimiento</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group hover:border-red-300 transition-all">
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-4 group-hover:scale-110 transition-transform ${overdue > 0 ? 'bg-red-50 text-red-600' : 'bg-emerald-50 text-emerald-600'}`}>
              <AlertCircle size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Vencidos (Overdue)</p>
            <h2 className={`text-4xl font-black ${overdue > 0 ? 'text-red-600' : 'text-slate-800'}`}>{overdue}</h2>
            <p className={`text-xs font-bold mt-2 ${overdue > 0 ? 'text-red-500' : 'text-emerald-500'}`}>{overdue > 0 ? 'Requieren atencion inmediata' : 'Todos en tiempo'}</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Clock size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Promedio Etapas</p>
            <h2 className="text-4xl font-black text-slate-800">{promedioEtapas}/4</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Etapas completadas promedio</p>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-blue-100 uppercase tracking-wider mb-1 relative z-10">Monto en Movimiento</p>
            <h2 className="text-2xl font-black text-white relative z-10">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-blue-100 mt-2 relative z-10">Capital flotante en transito</p>
          </div>
        </div>

        {/* Tracking Cards */}
        {loading ? (
          <div className="flex justify-center pt-8">
            <RefreshCw size={28} className="animate-spin text-blue-400" />
          </div>
        ) : pedidos.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center shadow-sm">
            <Truck size={52} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-500 font-semibold text-lg">Sin mercancia en transito</p>
            <p className="text-slate-400 text-sm mt-2">Los pedidos de compra activos apareceran aqui cuando esten en camino</p>
            <Link href="/dashboard/compras/pedidos"
              className="inline-flex items-center gap-2 mt-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700">
              Ir a Pedidos de Compra <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="grid gap-5">
            {pedidos.map(p => {
              const completedStages = (p.tracking_stages || []).filter((s: any) => s.status === 'COMPLETADO').length;
              const progressPct = Math.round((completedStages / 4) * 100);
              const daysLeft = p.days_until_delivery;
              const isUpdating = updatingId === p.id;

              return (
                <div key={p.id} className={`bg-white rounded-3xl shadow-sm border p-6 transition-all hover:shadow-md ${
                  p.is_overdue ? 'border-red-200 bg-red-50/20' : 'border-slate-100'
                }`}>
                  {/* Card header */}
                  <div className="flex items-start justify-between mb-5">
                    <div className="flex items-start gap-4">
                      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center flex-shrink-0 ${
                        p.is_overdue ? 'bg-red-100 text-red-600' : progressPct === 100 ? 'bg-emerald-100 text-emerald-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                        <Truck size={22} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-extrabold text-xl text-purple-700">{p.numero}</span>
                          {p.ven_numero && (
                            <Link href="/dashboard/ventas/venta"
                              className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold hover:bg-emerald-200 flex items-center gap-1">
                              {p.ven_numero} <ChevronRight size={10} />
                            </Link>
                          )}
                          {p.is_overdue && (
                            <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                              <AlertCircle size={10} /> Vencido
                            </span>
                          )}
                        </div>
                        <p className="text-slate-600 font-semibold mt-0.5">{p.supplier_name || 'Sin proveedor'}</p>
                        <p className="text-xs text-slate-400 mt-0.5">Entrega est.: {fDate(p.fecha_entrega_estimada)}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-2xl text-slate-900">{fCOP(p.total_cop)}</p>
                      {daysLeft !== null && daysLeft !== undefined && !p.is_overdue && (
                        <p className={`text-sm font-bold mt-1 flex items-center gap-1 justify-end ${
                          daysLeft <= 3 ? 'text-amber-500' : 'text-slate-400'
                        }`}>
                          <Clock size={12} /> {daysLeft} dia(s)
                        </p>
                      )}
                      {p.is_overdue && (
                        <p className="text-sm font-bold mt-1 text-red-500 flex items-center gap-1 justify-end">
                          <AlertCircle size={12} /> {Math.abs(daysLeft || 0)} dias de retraso
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-5">
                    <div className="flex justify-between text-xs text-slate-400 mb-2">
                      <span className="font-semibold">Progreso del embarque</span>
                      <span className="font-bold">{completedStages}/4 etapas ({progressPct}%)</span>
                    </div>
                    <div className="h-3 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-700 ${
                        p.is_overdue ? 'bg-gradient-to-r from-red-500 to-red-400'
                        : progressPct === 100 ? 'bg-gradient-to-r from-emerald-500 to-teal-400'
                        : 'bg-gradient-to-r from-blue-500 to-indigo-500'
                      }`} style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  {/* Tracking stages */}
                  <div className="grid grid-cols-4 gap-3 mb-4">
                    {(p.tracking_stages || []).map((s: any, i: number) => {
                      const meta = TRACKING_STAGES[i] || { label: s.stage, labelShort: s.stage };
                      const isDone = s.status === 'COMPLETADO';
                      const isActive = s.status === 'EN_PROCESO';
                      return (
                        <div key={s.stage} className={`p-3 rounded-2xl text-center border transition-all ${
                          isDone ? 'bg-emerald-50 border-emerald-200'
                          : isActive ? 'bg-blue-50 border-blue-200 ring-2 ring-blue-200'
                          : 'bg-slate-50 border-slate-100'
                        }`}>
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center mx-auto mb-2 text-sm font-black shadow-sm ${
                            isDone ? 'bg-emerald-500 text-white'
                            : isActive ? 'bg-blue-500 text-white'
                            : 'bg-slate-200 text-slate-500'
                          }`}>
                            {isDone ? <Check size={14} /> : i + 1}
                          </div>
                          <p className={`text-xs font-black leading-tight mb-2 ${
                            isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : 'text-slate-400'
                          }`}>{meta.labelShort}</p>
                          {!isDone && !isUpdating && (
                            <button
                              onClick={() => updateTracking(p.id, s.stage, isActive ? 'COMPLETADO' : 'EN_PROCESO')}
                              className={`text-xs px-2 py-1.5 rounded-lg font-bold w-full transition-colors ${
                                isActive ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                                : 'bg-slate-200 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                              }`}>
                              {isActive ? 'Completar' : 'Iniciar'}
                            </button>
                          )}
                          {isUpdating && <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin mx-auto" />}
                          {isDone && s.timestamp && (
                            <p className="text-xs text-emerald-600 font-medium">{fDate(s.timestamp)}</p>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Products summary + footer */}
                  <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                    <div className="flex gap-2 flex-wrap">
                      {(p.productos || []).slice(0, 3).map((pr: any, i: number) => (
                        <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                          {pr.product_name || pr.sku_id} x{pr.qty}
                        </span>
                      ))}
                      {(p.productos || []).length > 3 && (
                        <span className="text-xs text-slate-400">+{(p.productos || []).length - 3} mas</span>
                      )}
                    </div>
                    <Link href="/dashboard/compras/recepciones"
                      className={`text-xs font-bold px-4 py-2 rounded-xl flex items-center gap-1.5 transition-colors ${
                        completedStages === 4
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : 'bg-slate-100 text-slate-500 cursor-default'
                      }`}>
                      {completedStages === 4 ? <><CheckCircle2 size={13} /> Recepcionar</> : <><Package size={13} /> Pendiente entrega</>}
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
