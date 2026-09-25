'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  Truck, ShieldAlert, Activity, Clock, AlertCircle,
  CheckCircle2, RefreshCw, Package,
  ChevronRight, Search, ExternalLink, ChevronLeft
} from 'lucide-react';

import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
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

// Estados reales de PurchaseOrderFull.estado (confirmado leyendo erp_compras.py:
// create_pec -> "BORRADOR"; update_tracking -> "EN_TRANSITO"/"RECIBIDO";
// confirmar_recepcion -> "RECIBIDA"/"PARCIALMENTE_RECIBIDA"; update_pec/PecDetailPanel
// (pedidos/page.tsx) permite fijar manualmente cualquier valor de PEC_ESTADOS,
// incluido "CANCELADO"). Un pedido "en transito" es cualquiera que NO sea
// borrador (nunca enviado), cancelado, o ya completamente recibido.
const ESTADOS_EXCLUIDOS_TRANSITO = ['BORRADOR', 'CANCELADO', 'RECIBIDO', 'RECIBIDA', 'COMPLETADO'];

const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

// La etapa "actual" de un embarque es la primera que aun no esta COMPLETADA
// (el pipeline es dinamico/configurable, asi que nunca se asume una posicion fija).
const currentStageOf = (p: any) => (p.tracking_stages || []).find((s: any) => s.status !== 'COMPLETADO') || null;

export default function TransitoPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState('');
  const [updatingId, setUpdatingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  const [onlyOverdue, setOnlyOverdue] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 15;

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    load();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // No existe /compras/transito en el backend: esta pantalla siempre
      // trabaja sobre Pedidos de Compra (PEC) reales, igual que updateTracking()
      // mas abajo. GET /compras/pedidos responde {status, total, data: [...]}.
      const d = await apiFetch('/compras/pedidos?limit=200');
      const lista = Array.isArray(d) ? d : (Array.isArray(d?.data) ? d.data : []);
      setPedidos(lista.filter((p: any) => !ESTADOS_EXCLUIDOS_TRANSITO.includes(p.estado)));
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
  // El pipeline de etapas ahora es dinamico (configurable via el icono de
  // ajustes en Pedidos de Compra): "directo" tiene 3 etapas, "casillero" 4,
  // y un admin puede agregar mas. Nunca asumir un total fijo de 4.
  const promedioEtapas = pedidos.length > 0
    ? Math.round(pedidos.reduce((s, p) => s + ((p.tracking_stages || []).filter((t: any) => t.status === 'COMPLETADO').length), 0) / pedidos.length * 10) / 10
    : 0;
  const promedioTotalEtapas = pedidos.length > 0
    ? Math.round(pedidos.reduce((s, p) => s + (p.tracking_stages || []).length, 0) / pedidos.length)
    : 0;

  // Filtro + orden: vencidos primero, luego por menor cantidad de dias restantes,
  // para que la tabla priorice sola lo mas urgente sin que el usuario tenga que ordenar.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = pedidos.filter(p => {
      if (onlyOverdue && !p.is_overdue) return false;
      if (!q) return true;
      return [p.numero, p.supplier_name, p.ven_numero].filter(Boolean)
        .some((v: string) => v.toLowerCase().includes(q));
    });
    list = [...list].sort((a, b) => {
      if (!!a.is_overdue !== !!b.is_overdue) return a.is_overdue ? -1 : 1;
      const da = a.days_until_delivery ?? 9999;
      const db = b.days_until_delivery ?? 9999;
      return da - db;
    });
    return list;
  }, [pedidos, search, onlyOverdue]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const paged = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  useEffect(() => { setCurrentPage(1); }, [search, onlyOverdue]);

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
          <button onClick={() => setOnlyOverdue(true)} className="bg-red-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-red-700 shrink-0">
            Ver Vencidos
          </button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">

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
            <h2 className="text-4xl font-black text-slate-800">{promedioEtapas}/{promedioTotalEtapas || '-'}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Etapas completadas promedio</p>
          </div>

          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-blue-100 uppercase tracking-wider mb-1 relative z-10">Monto en Movimiento</p>
            <h2 className="text-2xl font-black text-white relative z-10">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-blue-100 mt-2 relative z-10">Capital flotante en transito</p>
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-3">
          <div className="relative flex-1 max-w-sm">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar PEC, proveedor, PVEN..."
              className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-3 py-2.5 text-sm outline-none focus:border-blue-400" />
          </div>
          <button onClick={() => setOnlyOverdue(v => !v)}
            className={`px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors flex items-center gap-2 ${
              onlyOverdue ? 'bg-red-600 text-white border-red-600' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}>
            <AlertCircle size={14} /> Solo vencidos
          </button>
          <span className="text-xs text-slate-400 font-semibold ml-auto">{filtered.length} embarque(s)</span>
        </div>

        {/* Tracking Table */}
        {loading ? (
          <div className="flex justify-center pt-8">
            <RefreshCw size={28} className="animate-spin text-blue-400" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-3xl border border-slate-200 p-20 text-center shadow-sm">
            <Truck size={52} className="mx-auto mb-4 text-slate-200" />
            <p className="text-slate-500 font-semibold text-lg">
              {pedidos.length === 0 ? 'Sin mercancia en transito' : 'Ningun embarque coincide con el filtro'}
            </p>
            <p className="text-slate-400 text-sm mt-2">Los pedidos de compra activos apareceran aqui cuando esten en camino</p>
            <Link href="/dashboard/compras/pedidos"
              className="inline-flex items-center gap-2 mt-6 bg-blue-600 text-white px-5 py-2.5 rounded-xl font-bold text-sm hover:bg-blue-700">
              Ir a Pedidos de Compra <ChevronRight size={16} />
            </Link>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left whitespace-nowrap">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Pedido de Compra</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Cliente / PVEN</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Tipo</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Etapa Actual</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Progreso</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase">Entrega Est.</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase text-right">Monto</th>
                    <th className="px-4 py-3 text-xs font-black text-slate-400 uppercase text-center">Accion</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paged.map(p => {
                    const totalStages = (p.tracking_stages || []).length || 1;
                    const completedStages = (p.tracking_stages || []).filter((s: any) => s.status === 'COMPLETADO').length;
                    const progressPct = Math.round((completedStages / totalStages) * 100);
                    const daysLeft = p.days_until_delivery;
                    const isUpdating = updatingId === p.id;
                    const stage = currentStageOf(p);
                    const stageActive = stage?.status === 'EN_PROCESO';

                    return (
                      <tr key={p.id} className={`hover:bg-slate-50 transition-colors ${p.is_overdue ? 'bg-red-50/40' : ''}`}>
                        <td className="px-4 py-3">
                          <Link href={`/dashboard/compras/pedidos?id=${p.id}`} className="font-extrabold text-purple-700 hover:underline flex items-center gap-1.5">
                            {p.numero} <ExternalLink size={11} className="opacity-40" />
                          </Link>
                          <p className="text-xs text-slate-500 mt-0.5">{p.supplier_name || 'Sin proveedor'}</p>
                        </td>
                        <td className="px-4 py-3">
                          {p.ven_numero ? (
                            <Link href="/dashboard/ventas/venta" className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold hover:bg-emerald-200 inline-flex items-center gap-1">
                              {p.ven_numero} <ChevronRight size={10} />
                            </Link>
                          ) : <span className="text-slate-300 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-xs font-bold text-slate-500 capitalize">{p.tipo_envio === 'directo' ? 'Directo' : 'Casillero'}</span>
                        </td>
                        <td className="px-4 py-3 max-w-[220px]">
                          {stage ? (
                            <>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs font-bold text-slate-700 truncate">{stage.label || stage.stage}</span>
                                <span className={`text-[10px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${
                                  stageActive ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-500'
                                }`}>{stage.status}</span>
                              </div>
                              {stage.alert && (
                                <p className="text-[10px] text-red-600 font-bold flex items-center gap-1 mt-0.5">
                                  <AlertCircle size={10} /> {stage.alert.mensaje}
                                </p>
                              )}
                            </>
                          ) : <span className="text-slate-300 text-xs">-</span>}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden shrink-0">
                              <div className={`h-full rounded-full ${progressPct === 100 ? 'bg-emerald-500' : 'bg-blue-500'}`} style={{ width: `${progressPct}%` }} />
                            </div>
                            <span className="text-xs font-bold text-slate-500 shrink-0">{completedStages}/{totalStages}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <p className="text-xs text-slate-500">{fDate(p.fecha_entrega_estimada)}</p>
                          {p.is_overdue ? (
                            <p className="text-xs font-bold text-red-600 flex items-center gap-1"><AlertCircle size={10} /> {Math.abs(daysLeft || 0)}d atraso</p>
                          ) : daysLeft !== null && daysLeft !== undefined ? (
                            <p className={`text-xs font-bold ${daysLeft <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>{daysLeft}d restante(s)</p>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-800">{fCOP(p.total_cop)}</td>
                        <td className="px-4 py-3 text-center">
                          {stage && !isUpdating && (
                            <button
                              onClick={() => updateTracking(p.id, stage.stage, stageActive ? 'COMPLETADO' : 'EN_PROCESO')}
                              className={`text-xs px-3 py-1.5 rounded-lg font-bold transition-colors ${
                                stageActive ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-100 text-slate-600 hover:bg-blue-100 hover:text-blue-700'
                              }`}>
                              {stageActive ? 'Completar' : 'Iniciar'}
                            </button>
                          )}
                          {isUpdating && <RefreshCw size={14} className="animate-spin text-blue-400 mx-auto" />}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-slate-100">
                <span className="text-xs text-slate-400 font-semibold">Pagina {currentPage} de {totalPages}</span>
                <div className="flex gap-2">
                  <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50">
                    <ChevronLeft size={14} />
                  </button>
                  <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 disabled:opacity-30 hover:bg-slate-50">
                    <ChevronRight size={14} />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
