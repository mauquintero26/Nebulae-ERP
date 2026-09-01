'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, RefreshCw, ChevronRight, X, Check, User, AlertCircle,
  FileText, Clock, Calendar, Phone, Mail, MapPin, DollarSign, Package,
  CheckCircle, XCircle, ArrowRight, ExternalLink } from 'lucide-react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api/v1';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;
  const headers: Record<string,string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(opts.headers as Record<string,string> || {}),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

const ESTADO_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  BORRADOR:               { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9' },
  PENDIENTE_CONFIRMACION: { label: 'Pendiente confirmacion', color: '#f59e0b', bg: '#fffbeb' },
  CONFIRMADA:             { label: 'Confirmada',             color: '#10b981', bg: '#f0fdf4' },
  CANCELADA:              { label: 'Cancelada',              color: '#ef4444', bg: '#fef2f2' },
};

function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADO_CONFIG[estado] || { label: estado, color: '#6366f1', bg: '#eef2ff' };
  return (
    <span className="px-2 py-0.5 rounded-full text-xs font-bold"
      style={{ backgroundColor: cfg.bg, color: cfg.color }}>
      {cfg.label}
    </span>
  );
}

function formatDate(iso: string | null) {
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' });
}
function formatCOP(val: number) {
  return val > 0 ? `$${Number(val).toLocaleString('es-CO')} COP` : '-';
}

export default function SolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [currentUser, setCurrentUser] = useState('');

  // Customer search
  const [custSearch, setCustSearch] = useState('');
  const [custResults, setCustResults] = useState<any[]>([]);
  const [selectedCust, setSelectedCust] = useState<any | null>(null);
  const custTimer = useRef<any>(null);

  // New SC form
  const [form, setForm] = useState({
    advisor_name: '', modalidad_pago: 'Contado', notas: '',
    productos: [] as any[], dias_vencimiento: 30,
  });
  const [newProd, setNewProd] = useState({ product_name: '', qty: 1, unit_price_cop: 0, casillero: '', delivery_date: '' });

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
    setForm(f => ({ ...f, advisor_name: u }));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterEstado) params.set('estado', filterEstado);
      const d = await apiFetch(`/ventas/solicitudes?${params}&limit=100`);
      setSolicitudes(Array.isArray(d) ? d : (d?.data ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setSolicitudes([]); }
    finally { setLoading(false); }
  }, [search, filterEstado]);

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
    setForm(f => ({
      ...f,
      productos: [...f.productos, { ...newProd, total_cop: newProd.qty * newProd.unit_price_cop }]
    }));
    setNewProd({ product_name: '', qty: 1, unit_price_cop: 0, casillero: '', delivery_date: '' });
  }

  async function createSolicitud(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedCust && !custSearch) { alert('Selecciona un cliente'); return; }
    setSaving(true);
    try {
      const body: any = {
        ...form,
        customer_id: selectedCust?.id || null,
        customer_name: selectedCust ? `${selectedCust.first_name} ${selectedCust.last_name}` : custSearch,
        customer_phone: selectedCust?.phone || '',
        customer_email: selectedCust?.email || '',
        customer_address: selectedCust?.address || '',
        created_by: currentUser,
      };
      await apiFetch('/ventas/solicitudes', { method: 'POST', body: JSON.stringify(body) });
      setShowCreate(false);
      setSelectedCust(null); setCustSearch(''); setCustResults([]);
      setForm({ advisor_name: currentUser, modalidad_pago: 'Contado', notas: '', productos: [], dias_vencimiento: 30 });
      load();
    } catch (err: any) { alert('Error: ' + err.message); }
    setSaving(false);
  }

  async function changeEstado(sc: any, estado: string) {
    await apiFetch(`/ventas/solicitudes/${sc.id}`, {
      method: 'PATCH', body: JSON.stringify({ estado, updated_by: currentUser }),
    });
    loadDetail(sc.id); load();
  }

  async function confirmarSC(sc: any) {
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/solicitudes/${sc.id}/confirmar`, {
        method: 'POST', body: JSON.stringify({ user_name: currentUser }),
      });
      alert(`Solicitud confirmada. Cotizacion ${d.cotizacion?.numero} creada.`);
      loadDetail(sc.id); load();
    } catch (err: any) { alert('Error: ' + err.message); }
    setConfirming(false);
  }

  const totalCOP = form.productos.reduce((s, p) => s + (p.qty * p.unit_price_cop), 0);

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-600">
            <FileText size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Solicitudes de Cliente</h1>
            <p className="text-xs text-slate-500">{total} solicitudes &bull; SC-YYYY####</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar SC, cliente, asesor..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-indigo-400 w-56" />
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-indigo-400">
            <option value="">Todos los estados</option>
            {Object.entries(ESTADO_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <Plus size={16} /> Nueva Solicitud
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table */}
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? 'w-[55%]' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-indigo-400" /></div>
            ) : solicitudes.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <FileText size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sin solicitudes. Crea la primera.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">Numero</th>
                    <th className="px-4 py-3">Cliente</th>
                    <th className="px-4 py-3">Asesor</th>
                    <th className="px-4 py-3">Fecha</th>
                    <th className="px-4 py-3">Vence</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Cotizaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {solicitudes.map(sc => (
                    <tr key={sc.id} onClick={() => loadDetail(sc.id)}
                      className={`border-b border-slate-50 cursor-pointer transition-colors hover:bg-indigo-50/30 ${selected?.id === sc.id ? 'bg-indigo-50/50' : ''}`}>
                      <td className="px-4 py-3 font-bold text-indigo-600">{sc.numero}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{sc.customer_name || '-'}</div>
                        {sc.customer_phone && <div className="text-xs text-slate-400">{sc.customer_phone}</div>}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{sc.advisor_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(sc.fecha_solicitud)}</td>
                      <td className="px-4 py-3">
                        <span className={`text-xs ${new Date(sc.fecha_vencimiento) < new Date() ? 'text-red-500 font-bold' : 'text-slate-400'}`}>
                          {formatDate(sc.fecha_vencimiento)}
                        </span>
                      </td>
                      <td className="px-4 py-3"><EstadoBadge estado={sc.estado} /></td>
                      <td className="px-4 py-3 text-slate-400 text-xs">
                        {sc.cotizaciones?.length > 0 ? (
                          <span className="text-indigo-600 font-bold">{sc.cotizaciones.length} COT</span>
                        ) : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selected && (
          <div className="border-l border-slate-200 bg-white flex flex-col overflow-hidden flex-1">
            <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h2 className="font-extrabold text-slate-900 text-lg">{selected.numero}</h2>
                <p className="text-xs text-slate-500">Solicitud de Cliente</p>
              </div>
              <div className="flex items-center gap-2">
                {selected.estado === 'BORRADOR' && (
                  <button onClick={() => changeEstado(selected, 'PENDIENTE_CONFIRMACION')}
                    className="bg-amber-500 hover:bg-amber-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    Enviar a confirmacion
                  </button>
                )}
                {(selected.estado === 'BORRADOR' || selected.estado === 'PENDIENTE_CONFIRMACION') && (
                  <button onClick={() => confirmarSC(selected)} disabled={confirming}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    {confirming ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                    Confirmar + Crear COT
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg">
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              {/* Estado */}
              <div className="flex items-center gap-2">
                <EstadoBadge estado={selected.estado} />
                <span className="text-xs text-slate-400">Modalidad: {selected.modalidad_pago}</span>
              </div>

              {/* Cliente */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Cliente</p>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <User size={14} className="text-indigo-500" />
                    <span className="font-bold text-slate-800">{selected.customer_name || '-'}</span>
                    {selected.customer_id && (
                      <a href={`/dashboard/agenda_clientes/${selected.customer_id}`} target="_blank"
                        className="text-indigo-500 hover:text-indigo-700"><ExternalLink size={12} /></a>
                    )}
                  </div>
                  {selected.customer_phone && (
                    <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600">
                      <Phone size={13} />{selected.customer_phone}
                    </a>
                  )}
                  {selected.customer_email && (
                    <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600">
                      <Mail size={13} />{selected.customer_email}
                    </a>
                  )}
                  {selected.customer_address && (
                    <p className="flex items-start gap-2 text-sm text-slate-600">
                      <MapPin size={13} className="mt-0.5 flex-shrink-0" />{selected.customer_address}
                    </p>
                  )}
                </div>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Fecha Solicitud</p>
                  <p className="font-bold text-sm text-slate-800">{formatDate(selected.fecha_solicitud)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <p className="text-xs text-slate-400 mb-1">Vencimiento</p>
                  <p className={`font-bold text-sm ${new Date(selected.fecha_vencimiento) < new Date() ? 'text-red-500' : 'text-slate-800'}`}>
                    {formatDate(selected.fecha_vencimiento)}
                  </p>
                </div>
              </div>

              {/* Products */}
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Solicitados</p>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50">
                        <tr className="text-xs text-slate-400 uppercase">
                          <th className="px-3 py-2 text-left">Producto</th>
                          <th className="px-3 py-2 text-right">Qty</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium text-slate-800">{p.product_name}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{p.qty}</td>
                            <td className="px-3 py-2 text-right text-slate-600">{formatCOP(p.unit_price_cop)}</td>
                            <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCOP(p.qty * p.unit_price_cop)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Linked Cotizaciones */}
              {selected.cotizaciones?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Cotizaciones Generadas</p>
                  {selected.cotizaciones.map((c: any) => (
                    <a key={c.id} href="/dashboard/ventas/cotizacion"
                      className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl mb-2 hover:bg-indigo-100">
                      <span className="font-bold text-indigo-700">{c.numero}</span>
                      <div className="flex items-center gap-2">
                        <EstadoBadge estado={c.estado} />
                        <ChevronRight size={14} className="text-indigo-400" />
                      </div>
                    </a>
                  ))}
                </div>
              )}

              {/* Actividades */}
              {selected.actividades?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Actividad</p>
                  <div className="space-y-2">
                    {selected.actividades.map((a: any) => (
                      <div key={a.id} className="flex gap-3">
                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-slate-700">{a.description}</p>
                          <p className="text-xs text-slate-400">{formatDate(a.created_at)} &bull; {a.user_name || 'Sistema'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Notas */}
              {selected.notas && (
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-xs font-black text-amber-600 uppercase mb-1">Notas</p>
                  <p className="text-sm text-amber-800">{selected.notas}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CREATE MODAL */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-extrabold text-xl text-slate-900">Nueva Solicitud de Cliente</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
            </div>
            <form onSubmit={createSolicitud} className="flex-1 overflow-y-auto p-6 space-y-5">

              {/* Customer Search */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Cliente *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input value={custSearch} onChange={e => onCustSearch(e.target.value)}
                    placeholder="Buscar por nombre, email o telefono..."
                    className={`w-full pl-8 pr-3 py-2.5 border rounded-xl text-sm outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${selectedCust ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`} />
                  {selectedCust && <Check size={14} className="absolute right-3 top-3 text-emerald-500" />}
                </div>
                {custResults.length > 0 && !selectedCust && (
                  <div className="border border-slate-200 rounded-xl mt-1 shadow-lg overflow-hidden max-h-40 overflow-y-auto">
                    {custResults.map((c: any) => (
                      <button key={c.id} type="button" onClick={() => { setSelectedCust(c); setCustSearch(`${c.first_name} ${c.last_name}`); setCustResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-indigo-50 border-b border-slate-50 last:border-0">
                        <p className="font-bold text-sm">{c.first_name} {c.last_name}</p>
                        <p className="text-xs text-slate-400">{c.email || c.phone || c.city}</p>
                      </button>
                    ))}
                  </div>
                )}
                {selectedCust && (
                  <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1"><Check size={10} /> Cliente seleccionado</p>
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
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Dias hasta vencimiento</label>
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
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th>
                        <th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Precio</th>
                        <th className="px-3 py-2"></th>
                      </tr></thead>
                      <tbody>
                        {form.productos.map((p, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{formatCOP(p.unit_price_cop)}</td>
                            <td className="px-3 py-2 text-right">
                              <button type="button" onClick={() => setForm(f => ({ ...f, productos: f.productos.filter((_, j) => j !== i) }))}
                                className="text-red-400 hover:text-red-600"><X size={12} /></button>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={2} className="px-3 py-2 text-right font-bold text-xs text-slate-600">Total:</td>
                          <td className="px-3 py-2 text-right font-bold text-slate-800">{formatCOP(totalCOP)}</td>
                          <td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-5 gap-2">
                  <input placeholder="Nombre producto" value={newProd.product_name}
                    onChange={e => setNewProd(p => ({ ...p, product_name: e.target.value }))}
                    className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
                  <input type="number" placeholder="Qty" min={1} value={newProd.qty}
                    onChange={e => setNewProd(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                    className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
                  <input type="number" placeholder="Precio COP" value={newProd.unit_price_cop || ''}
                    onChange={e => setNewProd(p => ({ ...p, unit_price_cop: parseFloat(e.target.value) || 0 }))}
                    className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none focus:border-indigo-400" />
                  <button type="button" onClick={addProd}
                    className="bg-indigo-100 hover:bg-indigo-200 text-indigo-700 rounded-lg px-3 py-2 text-sm font-bold flex items-center justify-center gap-1">
                    <Plus size={14} />
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400 resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
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
