'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Search, RefreshCw, X, Check, Package, Truck,
  Phone, Mail, MapPin, User, ArrowRight, AlertCircle, ChevronRight, Clock } from 'lucide-react';

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

const ESTADOS: Record<string, { label: string; color: string; bg: string }> = {
  BORRADOR:         { label: 'Borrador',          color: '#64748b', bg: '#f1f5f9' },
  ENVIADO:          { label: 'Enviado',           color: '#3b82f6', bg: '#eff6ff' },
  PENDIENTE_ENTREGA:{ label: 'Pendiente entrega', color: '#f59e0b', bg: '#fffbeb' },
  EN_TRANSITO:      { label: 'En transito',       color: '#8b5cf6', bg: '#f5f3ff' },
  RECIBIDO:         { label: 'Recibido',          color: '#10b981', bg: '#f0fdf4' },
  CANCELADO:        { label: 'Cancelado',         color: '#ef4444', bg: '#fef2f2' },
};

const TRACKING_STAGES = [
  { stage: 'PROVEEDOR_CASILLERO', label: 'Proveedor → Casillero' },
  { stage: 'CASILLERO_ADUANA',    label: 'Casillero → Aduana' },
  { stage: 'ADUANA_BODEGA',       label: 'Aduana → Bodega' },
  { stage: 'ENTREGADO',           label: 'Entregado en Bodega' },
];

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#6366f1', bg: '#eef2ff' };
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}
const fDate = (iso: string|null) => iso ? new Date(iso).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';
const fCOP = (v: number) => v > 0 ? `$${Number(v).toLocaleString('es-CO')}` : '-';

export default function PedidosCompraPage() {
  const [pedidos, setPedidos] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [selected, setSelected] = useState<any|null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [suppliers, setSuppliers] = useState<any[]>([]);

  // Supplier search
  const [supSearch, setSupSearch] = useState('');
  const [supResults, setSupResults] = useState<any[]>([]);
  const [selectedSup, setSelectedSup] = useState<any|null>(null);
  const supTimer = useRef<any>(null);

  const [form, setForm] = useState({
    modalidad_pago: 'Contado', metodo_pago: 'Transferencia',
    dias_entrega: 15, carrier: '', tracking_number: '', notas: '',
    warehouse_id: '', ven_id: '', ven_numero: '',
    productos: [] as any[],
  });
  const [newProd, setNewProd] = useState({ product_name: '', qty: 1, unit_price_cop: 0 });

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterEstado) params.set('estado', filterEstado);
      const d = await apiFetch(`/compras/pedidos?${params}&limit=100`);
      setPedidos(Array.isArray(d) ? d : (d?.data ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setPedidos([]); }
    finally { setLoading(false); }
  }, [search, filterEstado]);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    const d = await apiFetch(`/compras/pedidos/${id}`);
    setSelected(d);
  }

  function onSupSearch(q: string) {
    setSupSearch(q);
    setSelectedSup(null);
    if (supTimer.current) clearTimeout(supTimer.current);
    if (!q.trim()) { setSupResults([]); return; }
    supTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/compras/proveedores/search?q=${encodeURIComponent(q)}`).catch(() => []);
      setSupResults(Array.isArray(d) ? d : (d?.data ?? []));
    }, 300);
  }

  function addProd() {
    if (!newProd.product_name) return;
    setForm(f => ({ ...f, productos: [...f.productos, { ...newProd, total_cop: newProd.qty * newProd.unit_price_cop }] }));
    setNewProd({ product_name: '', qty: 1, unit_price_cop: 0 });
  }

  async function createPEC(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const total_cop = form.productos.reduce((s, p) => s + p.qty * p.unit_price_cop, 0);
      const body: any = {
        ...form,
        supplier_id: selectedSup?.id || null,
        supplier_name: selectedSup?.name || supSearch,
        supplier_ref: selectedSup?.reference || '',
        warehouse_id: form.warehouse_id ? parseInt(form.warehouse_id) : null,
        ven_id: form.ven_id ? parseInt(form.ven_id) : null,
        total_cop,
        subtotal_cop: total_cop,
        created_by: currentUser,
      };
      await apiFetch('/compras/pedidos', { method: 'POST', body: JSON.stringify(body) });
      setShowCreate(false);
      setSelectedSup(null); setSupSearch(''); setSupResults([]);
      setForm({ modalidad_pago: 'Contado', metodo_pago: 'Transferencia', dias_entrega: 15, carrier: '', tracking_number: '', notas: '', warehouse_id: '', ven_id: '', ven_numero: '', productos: [] });
      load();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  }

  async function updateTracking(stage: string, status: string) {
    await apiFetch(`/compras/pedidos/${selected.id}/tracking`, {
      method: 'PATCH',
      body: JSON.stringify({ stage, status, user_name: currentUser }),
    });
    loadDetail(selected.id); load();
  }

  async function changeEstado(estado: string) {
    await apiFetch(`/compras/pedidos/${selected.id}`, {
      method: 'PATCH', body: JSON.stringify({ estado, updated_by: currentUser }),
    });
    loadDetail(selected.id); load();
  }

  async function crearRecepcion() {
    try {
      const d = await apiFetch(`/compras/pedidos/${selected.id}/recepcionar`, {
        method: 'POST', body: JSON.stringify({ created_by: currentUser }),
      });
      alert(`Recepcion ${d.numero} creada. Ve a Recepciones para confirmarla.`);
      loadDetail(selected.id); load();
    } catch (err: any) { alert(err.message); }
  }

  const totalCOP = form.productos.reduce((s, p) => s + (p.qty * p.unit_price_cop), 0);

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600">
            <Package size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Pedidos de Compra</h1>
            <p className="text-xs text-slate-500">{total} pedidos &bull; PEC-YYYY####</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
            <input value={search} onChange={e => setSearch(e.target.value)}
              placeholder="Buscar PEC, proveedor..." className="pl-8 pr-3 py-2 border border-slate-200 rounded-xl text-sm outline-none focus:border-purple-400 w-56" />
          </div>
          <select value={filterEstado} onChange={e => setFilterEstado(e.target.value)}
            className="border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none">
            <option value="">Todos</option>
            {Object.entries(ESTADOS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <button onClick={() => setShowCreate(true)}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <Plus size={16} /> Nuevo Pedido
          </button>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? 'w-[52%]' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-purple-400" /></div>
            ) : pedidos.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <Package size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sin pedidos de compra.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">PEC #</th>
                    <th className="px-4 py-3">Proveedor</th>
                    <th className="px-4 py-3">VEN</th>
                    <th className="px-4 py-3">Total</th>
                    <th className="px-4 py-3">Entrega Est.</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3">Timer</th>
                  </tr>
                </thead>
                <tbody>
                  {pedidos.map(p => (
                    <tr key={p.id} onClick={() => loadDetail(p.id)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-purple-50/30 ${selected?.id===p.id?'bg-purple-50/50':''}`}>
                      <td className="px-4 py-3 font-bold text-purple-600">{p.numero}</td>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-800">{p.supplier_name || '-'}</div>
                        {p.supplier_ref && <div className="text-xs text-slate-400">{p.supplier_ref}</div>}
                      </td>
                      <td className="px-4 py-3 text-emerald-600 font-medium">{p.ven_numero || '-'}</td>
                      <td className="px-4 py-3 font-bold">{fCOP(p.total_cop)}</td>
                      <td className="px-4 py-3 text-slate-500">{fDate(p.fecha_entrega_estimada)}</td>
                      <td className="px-4 py-3"><Badge estado={p.estado} /></td>
                      <td className="px-4 py-3">
                        {p.days_until_delivery !== null && (
                          <span className={`text-xs font-bold flex items-center gap-1 ${p.is_overdue ? 'text-red-500' : p.days_until_delivery <= 3 ? 'text-amber-500' : 'text-slate-400'}`}>
                            <Clock size={11} />
                            {p.is_overdue ? 'Vencido' : `${p.days_until_delivery}d`}
                          </span>
                        )}
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
                {selected.ven_numero && <p className="text-xs text-slate-400">VEN: <span className="text-emerald-600 font-bold">{selected.ven_numero}</span></p>}
              </div>
              <div className="flex items-center gap-2">
                {selected.estado === 'BORRADOR' && (
                  <button onClick={() => changeEstado('ENVIADO')}
                    className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-lg text-xs font-bold">
                    Marcar Enviado
                  </button>
                )}
                {selected.estado !== 'RECIBIDO' && selected.estado !== 'CANCELADO' && (
                  <button onClick={crearRecepcion}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    <Package size={12} /> Recepcionar
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex flex-wrap gap-2 items-center">
                <Badge estado={selected.estado} />
                {selected.is_overdue && <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold flex items-center gap-1"><AlertCircle size={10} /> Vencido</span>}
                {selected.days_until_delivery !== null && !selected.is_overdue && (
                  <span className="text-xs text-slate-500">{selected.days_until_delivery} dias para entrega</span>
                )}
              </div>

              {/* Proveedor */}
              <div className="bg-slate-50 rounded-2xl p-4">
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Proveedor</p>
                <div className="font-bold text-slate-800 mb-1">{selected.supplier_name}</div>
                {selected.supplier_ref && <p className="text-xs text-slate-500 mb-1">Ref: {selected.supplier_ref}</p>}
              </div>

              {/* Pago y envio */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Modalidad de Pago</p><p className="font-bold text-sm">{selected.modalidad_pago}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Total</p><p className="font-extrabold text-base text-purple-700">{fCOP(selected.total_cop)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Carrier</p><p className="font-bold text-sm">{selected.carrier || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Entrega Est.</p><p className="font-bold text-sm">{fDate(selected.fecha_entrega_estimada)}</p></div>
              </div>

              {/* Tracking */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Tracking</p>
                {selected.tracking_number && (
                  <p className="text-sm text-slate-600 mb-3 font-mono bg-slate-50 rounded-lg px-3 py-2">{selected.tracking_number}</p>
                )}
                <div className="space-y-2">
                  {(selected.tracking_stages || []).map((s: any, i: number) => {
                    const stage = TRACKING_STAGES.find(ts => ts.stage === s.stage);
                    const isDone = s.status === 'COMPLETADO';
                    const isActive = s.status === 'EN_PROCESO';
                    return (
                      <div key={s.stage} className={`flex items-center gap-3 p-3 rounded-xl border ${isDone ? 'bg-emerald-50 border-emerald-200' : isActive ? 'bg-blue-50 border-blue-200' : 'bg-slate-50 border-slate-100'}`}>
                        <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-black ${isDone ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-slate-300 text-slate-600'}`}>
                          {isDone ? <Check size={12} /> : i+1}
                        </div>
                        <div className="flex-1">
                          <p className={`text-sm font-bold ${isDone ? 'text-emerald-700' : isActive ? 'text-blue-700' : 'text-slate-600'}`}>{stage?.label || s.stage}</p>
                          {s.timestamp && <p className="text-xs text-slate-400">{fDate(s.timestamp)}</p>}
                        </div>
                        {!isDone && selected.estado !== 'CANCELADO' && (
                          <button onClick={() => updateTracking(s.stage, isActive ? 'COMPLETADO' : 'EN_PROCESO')}
                            className={`text-xs font-bold px-2 py-1 rounded-lg ${isActive ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'}`}>
                            {isActive ? 'Completar' : 'Iniciar'}
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Products */}
              {selected.productos?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos</p>
                  <div className="border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                        <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Precio</th><th className="px-3 py-2 text-right">Total</th>
                      </tr></thead>
                      <tbody>
                        {selected.productos.map((p: any, i: number) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2 font-medium">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{fCOP(p.unit_price_cop)}</td>
                            <td className="px-3 py-2 text-right font-bold">{fCOP(p.qty*p.unit_price_cop)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Recepciones */}
              {selected.recepciones?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Recepciones</p>
                  {selected.recepciones.map((r: any) => (
                    <a key={r.id} href="/dashboard/compras/recepciones"
                      className="flex items-center justify-between p-3 bg-slate-50 rounded-xl mb-2 hover:bg-slate-100">
                      <span className="font-bold text-slate-700">{r.numero}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-500">{r.estado}</span>
                        <ChevronRight size={14} className="text-slate-400" />
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
                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 mt-2 flex-shrink-0" />
                        <div>
                          <p className="text-sm text-slate-700">{a.description}</p>
                          <p className="text-xs text-slate-400">{fDate(a.created_at)} &bull; {a.user_name || 'Sistema'}</p>
                        </div>
                      </div>
                    ))}
                  </div>
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
              <h3 className="font-extrabold text-xl text-slate-900">Nuevo Pedido de Compra</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={18} /></button>
            </div>
            <form onSubmit={createPEC} className="flex-1 overflow-y-auto p-6 space-y-4">

              {/* Supplier Search */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Proveedor *</label>
                <div className="relative">
                  <User size={14} className="absolute left-3 top-3 text-slate-400" />
                  <input value={supSearch} onChange={e => onSupSearch(e.target.value)}
                    placeholder="Buscar proveedor..."
                    className={`w-full pl-8 pr-3 py-2.5 border rounded-xl text-sm outline-none ${selectedSup ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`} />
                </div>
                {supResults.length > 0 && !selectedSup && (
                  <div className="border border-slate-200 rounded-xl mt-1 shadow-lg overflow-hidden max-h-36 overflow-y-auto">
                    {supResults.map((s: any) => (
                      <button key={s.id} type="button" onClick={() => { setSelectedSup(s); setSupSearch(s.name); setSupResults([]); }}
                        className="w-full text-left px-3 py-2 hover:bg-purple-50 border-b border-slate-50">
                        <p className="font-bold text-sm">{s.name}</p>
                        <p className="text-xs text-slate-400">{s.reference || s.phone}</p>
                      </button>
                    ))}
                  </div>
                )}
                {!selectedSup && supSearch && supResults.length === 0 && (
                  <p className="text-xs text-slate-400 mt-1">Se creara con el nombre ingresado</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Modalidad de Pago</label>
                  <select value={form.modalidad_pago} onChange={e => setForm(f => ({ ...f, modalidad_pago: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option>Contado</option><option>Credito 30 dias</option><option>Credito 60 dias</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Metodo de Pago</label>
                  <select value={form.metodo_pago} onChange={e => setForm(f => ({ ...f, metodo_pago: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option>Transferencia</option><option>Efectivo</option><option>Banco</option><option>Cheque</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Dias entrega estimada</label>
                  <input type="number" min={1} max={365} value={form.dias_entrega}
                    onChange={e => setForm(f => ({ ...f, dias_entrega: parseInt(e.target.value) || 15 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega destino</label>
                  <select value={form.warehouse_id} onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Carrier</label>
                  <input value={form.carrier} onChange={e => setForm(f => ({ ...f, carrier: e.target.value }))}
                    placeholder="DHL, FedEx, etc." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tracking #</label>
                  <input value={form.tracking_number} onChange={e => setForm(f => ({ ...f, tracking_number: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Pedido de Venta (VEN-#)</label>
                  <input value={form.ven_numero} onChange={e => setForm(f => ({ ...f, ven_numero: e.target.value }))}
                    placeholder="VEN-20260001" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
              </div>

              {/* Products */}
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Productos</label>
                {form.productos.length > 0 && (
                  <div className="mb-3 border border-slate-100 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50"><tr className="text-slate-400">
                        <th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th>
                        <th className="px-3 py-2 text-right">Precio COP</th><th className="px-3 py-2 text-right">Total</th><th></th>
                      </tr></thead>
                      <tbody>
                        {form.productos.map((p, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2 text-right">{fCOP(p.unit_price_cop)}</td>
                            <td className="px-3 py-2 text-right font-bold">{fCOP(p.qty*p.unit_price_cop)}</td>
                            <td className="px-3 py-2">
                              <button type="button" onClick={() => setForm(f => ({ ...f, productos: f.productos.filter((_,j)=>j!==i) }))} className="text-red-400 hover:text-red-600"><X size={11} /></button>
                            </td>
                          </tr>
                        ))}
                        <tr className="border-t border-slate-200 bg-slate-50">
                          <td colSpan={3} className="px-3 py-2 text-right font-bold text-xs">Total:</td>
                          <td className="px-3 py-2 text-right font-bold">{fCOP(totalCOP)}</td><td></td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <input placeholder="Producto" value={newProd.product_name} onChange={e=>setNewProd(p=>({...p,product_name:e.target.value}))}
                    className="col-span-2 border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none" />
                  <input type="number" placeholder="Qty" value={newProd.qty} onChange={e=>setNewProd(p=>({...p,qty:parseInt(e.target.value)||1}))}
                    className="border border-slate-200 rounded-lg px-2.5 py-2 text-sm outline-none" />
                  <button type="button" onClick={addProd} className="bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-bold flex items-center justify-center"><Plus size={14} /></button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
              </div>

              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)}
                  className="flex-1 py-2.5 border border-slate-200 rounded-xl text-sm text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Plus size={14} />}
                  {saving ? 'Creando...' : 'Crear PEC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
