'use client';

import { useState, useEffect } from 'react';
import { Truck, Clock, AlertCircle, RefreshCw, Check, Package } from 'lucide-react';

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

const TRACKING_STAGES = [
  { stage: 'PROVEEDOR_CASILLERO', label: 'Proveedor → Casillero' },
  { stage: 'CASILLERO_ADUANA',    label: 'Casillero → Aduana' },
  { stage: 'ADUANA_BODEGA',       label: 'Aduana → Bodega' },
  { stage: 'ENTREGADO',           label: 'Entregado' },
];

const fDate = (iso: string|null) => iso ? new Date(iso).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function TransitoPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [overdueCount, setOverdueCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    load();
  }, []);

  async function load() {
    setLoading(true);
    try {
      const d = await apiFetch('/compras/transito');
      setPedidos(Array.isArray(d) ? d : (d?.data ?? []));
      setOverdueCount(d?.overdue_count ?? 0);
    } catch { setPedidos([]); }
    finally { setLoading(false); }
  }

  async function updateTracking(pec_id: number, stage: string, status: string) {
    await apiFetch(`/compras/pedidos/${pec_id}/tracking`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, status, user_name: currentUser }),
    });
    load();
  }

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center text-blue-600">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Mercancia en Transito</h1>
            <p className="text-xs text-slate-500">{pedidos.length} pedidos activos
              {overdueCount > 0 && <span className="text-red-500 font-bold ml-2">• {overdueCount} vencidos</span>}
            </p>
          </div>
        </div>
        <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-blue-400" /></div>
        ) : pedidos.length === 0 ? (
          <div className="text-center pt-16 text-slate-400">
            <Truck size={48} className="mx-auto mb-4 opacity-20" />
            <p className="font-medium">Sin mercancia en transito</p>
            <p className="text-sm mt-1">Los pedidos de compra activos apareceran aqui</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {pedidos.map(p => {
              const completedStages = (p.tracking_stages || []).filter((s: any) => s.status === 'COMPLETADO').length;
              const progressPct = Math.round((completedStages / 4) * 100);
              return (
                <div key={p.id} className={`bg-white rounded-3xl shadow-sm border p-5 ${p.is_overdue ? 'border-red-200' : 'border-slate-100'}`}>
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-lg text-purple-700">{p.numero}</span>
                        {p.ven_numero && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">{p.ven_numero}</span>}
                        {p.is_overdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle size={10} /> Vencido</span>}
                      </div>
                      <p className="text-slate-600 font-medium mt-0.5">{p.supplier_name}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-extrabold text-slate-900">{fCOP(p.total_cop)}</p>
                      <p className="text-xs text-slate-400">Entrega: {fDate(p.fecha_entrega_estimada)}</p>
                      {p.days_until_delivery !== null && !p.is_overdue && (
                        <p className={`text-xs font-bold flex items-center gap-1 justify-end mt-1 ${p.days_until_delivery <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>
                          <Clock size={10} /> {p.days_until_delivery} dias
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mb-4">
                    <div className="flex justify-between text-xs text-slate-400 mb-1">
                      <span>Progreso de entrega</span>
                      <span>{completedStages}/4 etapas</span>
                    </div>
                    <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-emerald-500 rounded-full transition-all"
                        style={{ width: `${progressPct}%` }} />
                    </div>
                  </div>

                  {/* Tracking stages */}
                  <div className="grid grid-cols-4 gap-2">
                    {(p.tracking_stages || []).map((s: any, i: number) => {
                      const meta = TRACKING_STAGES[i] || { label: s.stage };
                      const isDone = s.status === 'COMPLETADO';
                      const isActive = s.status === 'EN_PROCESO';
                      return (
                        <div key={s.stage} className={`p-2.5 rounded-xl text-center border transition-all ${isDone ? 'bg-emerald-50 border-emerald-200' : isActive ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center mx-auto mb-1.5 text-xs font-black ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                            {isDone ? <Check size={12} /> : i+1}
                          </div>
                          <p className={`text-xs font-bold mb-2 leading-tight ${isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : 'text-slate-500'}`}>{meta.label}</p>
                          {!isDone && (
                            <button onClick={() => updateTracking(p.id, s.stage, isActive ? 'COMPLETADO' : 'EN_PROCESO')}
                              className={`text-xs px-2 py-1 rounded-lg font-bold w-full ${isActive ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                              {isActive ? 'Completar' : 'Iniciar'}
                            </button>
                          )}
                          {isDone && s.timestamp && <p className="text-xs text-emerald-600">{fDate(s.timestamp)}</p>}
                        </div>
                      );
                    })}
                  </div>

                  {/* Products summary */}
                  {p.productos?.length > 0 && (
                    <div className="mt-3 pt-3 border-t border-slate-100">
                      <div className="flex gap-2 flex-wrap">
                        {p.productos.slice(0, 3).map((pr: any, i: number) => (
                          <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">
                            {pr.product_name} x{pr.qty}
                          </span>
                        ))}
                        {p.productos.length > 3 && <span className="text-xs text-slate-400">+{p.productos.length-3} mas</span>}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
