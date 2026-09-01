'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  FileText, ShieldAlert, TrendingUp, Clock, AlertTriangle,
  CheckCircle2, Search, Filter, Plus, X, Check, User,
  Phone, Mail, MapPin, ExternalLink, RefreshCw, ArrowRight,
  Activity, ChevronRight, MoreVertical, FileOutput, DollarSign
} from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers as Record<string, string> || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BORRADOR:               { label: 'Borrador',               color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  PENDIENTE_CONFIRMACION: { label: 'Pendiente confirmacion',  color: '#b45309', bg: '#fffbeb', border: '#fde68a' },
  CONFIRMADA:             { label: 'Confirmada',              color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  CANCELADA:              { label: 'Cancelada',               color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
};

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#4338ca', bg: '#eef2ff', border: '#c7d2fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {estado === 'BORRADOR' && <Clock size={11} />}
      {estado === 'PENDIENTE_CONFIRMACION' && <AlertTriangle size={11} />}
      {estado === 'CONFIRMADA' && <CheckCircle2 size={11} />}
      {estado === 'CANCELADA' && <X size={11} />}
      {cfg.label}
    </span>
  );
}

const fDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

const SUB_MODULES = [
  { name: 'Solicitud',        path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',       path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta',            path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',     path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango',   path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion',   path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',     path: '/dashboard/ventas/proyecciones' },
];

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [stats, setStats] = useState({ sc_total: 0, sc_activas: 0, sc_vencidas: 0, sc_monto: 0, cot_total: 0, ven_total: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Activas');
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // Customer autocomplete
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [selectedCust, setSelectedCust] = useState<any | null>(null);
  const custTimer = useRef<any>(null);

  // Form
  const [form, setForm] = useState({
    advisor_name: '', modalidad_pago: 'Contado', notas: '',
    productos: [] as any[], dias_vencimiento: 30,
  });
  const [newProd, setNewProd] = useState({ product_name: '', qty: 1, unit_price_cop: 0 });

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
    setForm(f => ({ ...f, advisor_name: u }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, s] = await Promise.all([
        apiFetch('/ventas/solicitudes?limit=200'),
        apiFetch('/ventas/stats').catch(() => ({})),
      ]);
      const list = Array.isArray(d) ? d : (d?.data ?? []);
      setSolicitudes(list);
      setStats(prev => ({ ...prev, ...s }));
    } catch { setSolicitudes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    const d = await apiFetch(`/ventas/solicitudes/${id}`);
    setSelected(d);
  }

  function onCustSearch(q: string) {
    setCustSearch(q);
    setSelectedCust(null);
    if (custTimer.current) clearTimeout(custTimer.current);
    if (!q.trim()) { setCustResults([]); return; }
    custTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/crm/customers/search?q=${encodeURIComponent(q)}`).catch(() => []);
      setCustResults(Array.isArray(d) ? d : (d?.data ?? []));
    }, 300);
  }

  function addProd() {
    if (!newProd.product_name) return;
    setForm(f => ({ ...f, productos: [...f.productos, { ...newProd }] }));
    setNewProd({ product_name: '', qty: 1, unit_price_cop: 0 });
  }

  async function createSolicitud(e: React.FormEvent) {
    e.preventDefault();
    if (!custSearch && !selectedCust) { alert('Selecciona un cliente'); return; }
    setSaving(true);
    try {
      await apiFetch('/ventas/solicitudes', {
        method: 'POST',
        body: JSON.stringify({
          ...form,
          customer_id: selectedCust?.id || null,
          customer_name: selectedCust ? `${selectedCust.first_name} ${selectedCust.last_name}` : custSearch,
          customer_phone: selectedCust?.phone || '',
          customer_email: selectedCust?.email || '',
          customer_address: selectedCust?.address || '',
          created_by: currentUser,
        }),
      });
      setShowCreate(false);
      setSelectedCust(null); setCustSearch(''); setCustResults([]);
      setForm({ advisor_name: currentUser, modalidad_pago: 'Contado', notas: '', productos: [], dias_vencimiento: 30 });
      load();
    } catch (err: any) { alert('Error: ' + err.message); }
    setSaving(false);
  }

  async function confirmarSC(sc: any) {
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/solicitudes/${sc.id}/confirmar`, {
        method: 'POST', body: JSON.stringify({ user_name: currentUser }),
      });
      alert(`Cotizacion ${d.cotizacion?.numero || ''} creada exitosamente.`);
      loadDetail(sc.id); load();
    } catch (err: any) { alert('Error: ' + err.message); }
    setConfirming(false);
  }

  // Filter logic
  const filtered = solicitudes.filter(sc => {
    const matchSearch = !search ||
      sc.numero?.toLowerCase().includes(search.toLowerCase()) ||
      sc.customer_name?.toLowerCase().includes(search.toLowerCase()) ||
      sc.advisor_name?.toLowerCase().includes(search.toLowerCase());
    if (!matchSearch) return false;
    if (activeTab === 'Activas')     return sc.estado === 'BORRADOR' || sc.estado === 'PENDIENTE_CONFIRMACION';
    if (activeTab === 'Confirmadas') return sc.estado === 'CONFIRMADA';
    if (activeTab === 'Canceladas')  return sc.estado === 'CANCELADA';
    return true;
  });

  // Stats derived from real data
  const totalActivas = solicitudes.filter(s => s.estado === 'BORRADOR' || s.estado === 'PENDIENTE_CONFIRMACION').length;
  const totalConfirmadas = solicitudes.filter(s => s.estado === 'CONFIRMADA').length;
  const totalMonto = solicitudes
    .filter(s => s.estado !== 'CANCELADA')
    .reduce((acc, s) => acc + (s.productos?.reduce((a: number, p: any) => a + (p.qty * (p.unit_price_cop || 0)), 0) || 0), 0);
  const sinAtender = solicitudes.filter(s => {
    if (s.estado !== 'BORRADOR') return false;
    const created = new Date(s.fecha_solicitud);
    const diff = (Date.now() - created.getTime()) / (1000 * 60 * 60);
    return diff > 48;
  }).length;
  const vencidas = solicitudes.filter(s => {
    if (s.estado === 'CANCELADA' || s.estado === 'CONFIRMADA') return false;
    return s.fecha_vencimiento && new Date(s.fecha_vencimiento) < new Date();
  }).length;
  const totalCOP = form.productos.reduce((s, p) => s + (p.qty * (p.unit_price_cop || 0)), 0);

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-modules tab bar */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Modulos:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/ventas/solicitud'
                ? 'bg-indigo-600 text-white border-indigo-600'
                : 'text-slate-600 hover:bg-purple-50 hover:text-purple-700 border-transparent hover:border-purple-200'
            }`}>
            {mod.name}
          </Link>
        ))}
      </div>

      {/* Alert Banner */}
      {(sinAtender > 0 || vencidas > 0) && (
        <div className="bg-rose-50 border-b border-rose-200 px-6 py-3 flex items-start gap-4 z-20 relative">
          <ShieldAlert className="text-rose-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-rose-800">ATENCION REQUERIDA (Riesgo de perdida de ventas)</h4>
            <p className="text-xs font-bold text-rose-600 mt-1">
              {sinAtender > 0 && `• ${sinAtender} Solicitud${sinAtender > 1 ? 'es' : ''} sin atender (+48h) `}
              {vencidas > 0 && `• ${vencidas} Solicitud${vencidas > 1 ? 'es' : ''} vencidas `}
              {totalMonto > 0 && `• ${fCOP(totalMonto)} en solicitudes activas`}
            </p>
          </div>
          <button onClick={load} className="bg-rose-600 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm hover:bg-rose-700 transition-colors shrink-0">
            Actualizar
          </button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl shadow-inner"><FileText size={24} /></div>
              Solicitudes de Cliente
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Inicio del ciclo comercial. SC-YYYY#### → COT → VEN → PEC → ENINV</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-bold shadow-md transition-colors flex items-center gap-2">
            <Plus size={18} /> Nueva Solicitud
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-amber-300 transition-all"
            onClick={() => setActiveTab('Activas')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <FileText size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Solicitudes Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{totalActivas}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2 flex items-center gap-1">
              <Clock size={13} />
              {sinAtender > 0 ? `${sinAtender} sin atender +48h` : 'Todas atendidas'}
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Confirmadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Confirmadas (COT)</p>
            <h2 className="text-4xl font-black text-slate-800">{totalConfirmadas}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1">
              {totalConfirmadas} generaron cotizacion
            </p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-blue-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24} />
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto en Solicitudes</p>
            <h2 className="text-2xl font-black text-slate-800">{fCOP(totalMonto)}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1">
              {solicitudes.filter(s => s.estado !== 'CANCELADA').length} solicitudes activas
            </p>
          </div>

          <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden group cursor-pointer">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-indigo-200 uppercase tracking-wider mb-1 relative z-10">Total Solicitudes</p>
            <h2 className="text-4xl font-black text-white relative z-10">{solicitudes.length}</h2>
            <p className="text-xs font-bold text-emerald-300 mt-2 flex items-center gap-1 relative z-10">
              <TrendingUp size={13} /> {totalConfirmadas} convertidas a COT
            </p>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">

          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
            <div className="flex gap-2">
              {['Activas', 'Confirmadas', 'Canceladas'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Activas'     ? 'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : tab === 'Confirmadas' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                          'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab}
                  <span className="ml-2 text-xs opacity-70">
                    ({tab === 'Activas' ? totalActivas : tab === 'Confirmadas' ? totalConfirmadas : solicitudes.filter(s=>s.estado==='CANCELADA').length})
                  </span>
                </button>
              ))}
            </div>
            <div className="flex items-center gap-3 w-full lg:w-auto">
              <div className="relative flex-1 lg:w-72 flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 focus-within:border-indigo-500 focus-within:ring-2 focus-within:ring-indigo-100 transition-all shadow-sm">
                <Search className="text-slate-400 shrink-0 mr-2" size={16} />
                <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Buscar SC, cliente, asesor..."
                  className="w-full bg-transparent border-none focus:ring-0 text-sm font-medium text-slate-700 outline-none" />
              </div>
              <button onClick={load} className="bg-white border border-slate-300 p-2.5 rounded-xl text-slate-600 hover:bg-slate-50 transition-colors shadow-sm">
                <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">SC (Trazabilidad)</th>
                  <th className="px-6 py-4">Cliente / Asesor</th>
                  <th className="px-6 py-4">Fecha Solicitud</th>
                  <th className="px-6 py-4">Vencimiento</th>
                  <th className="px-6 py-4">Monto Est.</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-indigo-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando solicitudes...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center text-slate-500 font-medium">
                    No hay registros en esta categoria.
                  </td></tr>
                ) : filtered.map(sc => {
                  const isOverdue = sc.fecha_vencimiento && new Date(sc.fecha_vencimiento) < new Date();
                  const monto = (sc.productos || []).reduce((a: number, p: any) => a + (p.qty * (p.unit_price_cop || 0)), 0);
                  return (
                    <tr key={sc.id} onClick={() => loadDetail(sc.id)}
                      className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === sc.id ? 'bg-indigo-50/40' : ''}`}>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-black text-indigo-700">{sc.numero}</span>
                          {sc.cotizaciones?.length > 0 && (
                            <Link href="/dashboard/ventas/cotizacion" onClick={e => e.stopPropagation()}
                              className="text-[10px] font-bold text-blue-500 hover:underline mt-0.5 flex items-center gap-1">
                              COT vinculada <ChevronRight size={10} />
                            </Link>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col">
                          <span className="font-bold text-slate-800">{sc.customer_name || '-'}</span>
                          <span className="text-[11px] font-medium text-slate-500">{sc.advisor_name || 'Sin asesor'}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 font-medium text-slate-600">{fDate(sc.fecha_solicitud)}</td>
                      <td className="px-6 py-4">
                        <span className={`font-medium text-sm ${isOverdue ? 'text-red-600 font-black' : 'text-slate-600'}`}>
                          {isOverdue && <AlertTriangle size={12} className="inline mr-1" />}
                          {fDate(sc.fecha_vencimiento)}
                        </span>
                      </td>
                      <td className="px-6 py-4 font-black text-slate-800">{monto > 0 ? fCOP(monto) : '-'}</td>
                      <td className="px-6 py-4"><EstadoBadge estado={sc.estado} /></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {(sc.estado === 'BORRADOR' || sc.estado === 'PENDIENTE_CONFIRMACION') && (
                            <button
                              onClick={async (e) => { e.stopPropagation(); await loadDetail(sc.id); setSelected(sc); }}
                              className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1 transition-colors">
                              <CheckCircle2 size={13} /> Confirmar
                            </button>
                          )}
                          <button className="text-slate-400 hover:text-slate-700 p-1 transition-colors" onClick={e => { e.stopPropagation(); loadDetail(sc.id); }}>
                            <MoreVertical size={16} />
                          </button>
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

      {/* ─── DETAIL PANEL OVERLAY ─── */}
      {selected && selected !== 'NEW' && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden">
            {/* Panel Header */}
            <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h2 className="font-extrabold text-slate-900 text-xl">{selected.numero}</h2>
                <p className="text-xs text-slate-500 mt-0.5">Solicitud de Cliente</p>
                <div className="mt-2"><EstadoBadge estado={selected.estado} /></div>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl mt-1">
                <X size={18} />
              </button>
            </div>

            {/* Panel Actions */}
            <div className="px-6 py-3 border-b border-slate-100 flex items-center gap-2 flex-wrap bg-slate-50">
              {(selected.estado === 'BORRADOR' || selected.estado === 'PENDIENTE_CONFIRMACION') && (
                <button onClick={() => confirmarSC(selected)} disabled={confirming}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm disabled:opacity-50">
                  {confirming ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle2 size={13} />}
                  Confirmar + Crear COT
                </button>
              )}
              {selected.cotizaciones?.length > 0 && (
                <Link href="/dashboard/ventas/cotizacion"
                  className="bg-amber-100 text-amber-800 border border-amber-200 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 hover:bg-amber-200 transition-colors">
                  <ArrowRight size={13} /> Ver Cotizacion
                </Link>
              )}
            </div>

            {/* Panel Body */}
            <div className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase mb-3">Cliente</p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0">
                      <User size={14} />
                    </div>
                    <div>
                      <p className="font-bold text-slate-800 leading-tight">{selected.customer_name || '-'}</p>
                      {selected.customer_id && (
                        <a href={`/dashboard/agenda_clientes/${selected.customer_id}`} target="_blank"
                          className="text-xs text-indigo-500 hover:underline flex items-center gap-0.5">
                          Ver perfil <ExternalLink size={9} />
                        </a>
                      )}
                    </div>
                  </div>
                  {selected.customer_phone && (
                    <a href={`tel:${selected.customer_phone}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1">
                      <Phone size={13} className="text-slate-400" />{selected.customer_phone}
                    </a>
                  )}
                  {selected.customer_email && (
                    <a href={`mailto:${selected.customer_email}`}
                      className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 pl-1">
                      <Mail size={13} className="text-slate-400" />{selected.customer_email}
                    </a>
                  )}
                  {selected.customer_address && (
                    <p className="flex items-start gap-2 text-sm text-slate-600 pl-1">
                      <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />{selected.customer_address}
                    </p>
                  )}
                </div>
              </div>

              {/* Detalles */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-slate-400 mb-1">Asesor</p>
                  <p className="font-bold text-sm text-slate-800">{selected.advisor_name || '-'}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-slate-400 mb-1">Modalidad Pago</p>
                  <p className="font-bold text-sm text-slate-800">{selected.modalidad_pago}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-slate-400 mb-1">Fecha Solicitud</p>
                  <p className="font-bold text-sm text-slate-800">{fDate(selected.fecha_solicitud)}</p>
                </div>
                <div className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                  <p className="text-xs text-slate-400 mb-1">Vencimiento</p>
                  <p className={`font-bold text-sm ${selected.fecha_vencimiento && new Date(selected.fecha_vencimiento) < new Date() ? 'text-red-600' : 'text-slate-800'}`}>
                    {fDate(selected.fecha_vencimiento)}
                  </p>
                </div>
              </div>

              {/* Productos */}
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Solicitados</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-400 uppercase">
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-700">{p.product_name}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{p.qty}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{fCOP(p.qty * (p.unit_price_cop || 0))}</td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={2} className="px-3 py-2 text-right font-black text-slate-600 text-xs uppercase">Total:</td>
                          <td className="px-3 py-2 text-right font-black text-indigo-700">
                            {fCOP((selected.productos || []).reduce((a: number, p: any) => a + p.qty * (p.unit_price_cop || 0), 0))}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Cotizaciones vinculadas */}
              {selected.cotizaciones?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Cotizaciones Generadas</p>
                  {selected.cotizaciones.map((c: any) => (
                    <Link key={c.id} href="/dashboard/ventas/cotizacion"
                      className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2 hover:bg-amber-100 transition-colors">
                      <div>
                        <span className="font-bold text-amber-800">{c.numero}</span>
                        <p className="text-xs text-amber-600 mt-0.5">{c.estado}</p>
                      </div>
                      <ChevronRight size={16} className="text-amber-500" />
                    </Link>
                  ))}
                </div>
              )}

              {/* Actividad */}
              {selected.actividades?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Historial de Actividad</p>
                  <div className="space-y-3 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                    {selected.actividades.map((a: any) => (
                      <div key={a.id} className="flex gap-4 pl-7 relative">
                        <div className="absolute left-0 top-1.5 w-4 h-4 rounded-full bg-indigo-100 border-2 border-indigo-400 flex-shrink-0" />
                        <div className="flex-1">
                          <p className="text-sm text-slate-700 font-medium">{a.description}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{fDate(a.created_at)} &bull; {a.user_name || 'Sistema'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              {selected.notas && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <p className="text-xs font-black text-amber-600 uppercase mb-1.5">Notas</p>
                  <p className="text-sm text-amber-800">{selected.notas}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ─── CREATE MODAL ─── */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-indigo-50 to-white">
              <div>
                <h3 className="font-extrabold text-xl text-slate-900">Nueva Solicitud de Cliente</h3>
                <p className="text-xs text-slate-500 mt-0.5">El numero SC se asignara automaticamente</p>
              </div>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                <X size={20} />
              </button>
            </div>
            <form onSubmit={createSolicitud} className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Customer search */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Cliente *</label>
                <div className="relative">
                  <User size={15} className="absolute left-3 top-3 text-slate-400" />
                  <input value={custSearch} onChange={e => onCustSearch(e.target.value)}
                    placeholder="Buscar por nombre, email, telefono..."
                    className={`w-full pl-9 pr-3 py-2.5 border rounded-xl text-sm outline-none transition-all ${selectedCust ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100'}`} />
                  {selectedCust && <Check size={15} className="absolute right-3 top-3 text-emerald-500" />}
                </div>
                {custResults.length > 0 && !selectedCust && (
                  <div className="border border-slate-200 rounded-xl mt-1 shadow-lg overflow-hidden max-h-44 overflow-y-auto">
                    {custResults.map((c: any) => (
                      <button key={c.id} type="button"
                        onClick={() => { setSelectedCust(c); setCustSearch(`${c.first_name} ${c.last_name}`); setCustResults([]); }}
                        className="w-full text-left px-4 py-2.5 hover:bg-indigo-50 border-b border-slate-50 last:border-0 flex justify-between items-center">
                        <div>
                          <p className="font-bold text-sm text-slate-800">{c.first_name} {c.last_name}</p>
                          <p className="text-xs text-slate-400">{c.email || c.phone || c.city}</p>
                        </div>
                        <ChevronRight size={14} className="text-slate-300" />
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Asesor</label>
                  <input value={form.advisor_name} onChange={e => setForm(f => ({ ...f, advisor_name: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Modalidad de Pago</label>
                  <select value={form.modalidad_pago} onChange={e => setForm(f => ({ ...f, modalidad_pago: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
                    <option>Contado</option><option>Credito 30 dias</option><option>Credito 60 dias</option><option>Transferencia</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Vencimiento (dias)</label>
                <input type="number" min={1} max={365} value={form.dias_vencimiento}
                  onChange={e => setForm(f => ({ ...f, dias_vencimiento: parseInt(e.target.value) || 30 }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400" />
              </div>

              {/* Products */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Productos Solicitados</label>
                {form.productos.length > 0 && (
                  <div className="mb-3 border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50">
                        <tr className="text-slate-400 uppercase">
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          <th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {form.productos.map((p, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{fCOP(p.unit_price_cop)}</td>
                            <td className="px-3 py-2 text-right font-bold">{fCOP(p.qty * p.unit_price_cop)}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setForm(f => ({ ...f, productos: f.productos.filter((_, j) => j !== i) }))}
                                className="text-red-400 hover:text-red-600"><X size={12} /></button>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={3} className="px-3 py-2 text-right font-bold text-xs text-slate-500 uppercase">Total:</td>
                          <td className="px-3 py-2 text-right font-black text-indigo-700">{fCOP(totalCOP)}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2">
                  <input placeholder="Nombre del producto" value={newProd.product_name}
                    onChange={e => setNewProd(p => ({ ...p, product_name: e.target.value }))}
                    className="col-span-2 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400" />
                  <input type="number" placeholder="Qty" min={1} value={newProd.qty}
                    onChange={e => setNewProd(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-indigo-400 text-center" />
                  <input type="number" placeholder="Precio COP" value={newProd.unit_price_cop || ''}
                    onChange={e => setNewProd(p => ({ ...p, unit_price_cop: parseFloat(e.target.value) || 0 }))}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none focus:border-indigo-400" />
                  <button type="button" onClick={addProd}
                    className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-xl text-sm font-bold flex items-center justify-center">
                    <Plus size={16} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas internas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                  Cancelar
                </button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 shadow-md transition-colors">
                  {saving ? <RefreshCw size={15} className="animate-spin" /> : <Plus size={15} />}
                  {saving ? 'Creando...' : 'Crear Solicitud'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
