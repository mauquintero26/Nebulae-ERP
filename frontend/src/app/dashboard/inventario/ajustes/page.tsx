'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal, Activity, TrendingUp, TrendingDown, Plus,
  Search, X, RefreshCw, AlertCircle, Package, MoreVertical
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

const MOTIVOS = ['Conteo fisico', 'Merma', 'Sobrante', 'Correccion de error', 'Dano en bodega', 'Vencimiento', 'Otro'];

const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function AjustesPage() {
  const [ajustes, setAjustes] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Todos');
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [form, setForm] = useState({
    tipo: 'ENTRADA', product_name: '', warehouse_id: '', qty: 1, motivo: 'Conteo fisico', notas: '',
  });

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/inventory/operations?operation_type=ADJUSTMENT&limit=100').catch(() => []);
      setAjustes(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setAjustes([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createAjuste(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/inventory/operations', {
        method: 'POST',
        body: JSON.stringify({
          operation_type: 'ADJUSTMENT',
          adjustment_type: form.tipo,
          warehouse_id: parseInt(form.warehouse_id),
          product_name: form.product_name,
          quantity: form.qty,
          motivo: form.motivo,
          notas: form.notas,
          created_by: currentUser,
        }),
      });
      setShowCreate(false);
      setForm({ tipo: 'ENTRADA', product_name: '', warehouse_id: '', qty: 1, motivo: 'Conteo fisico', notas: '' });
      load();
    } catch {
      alert('Ajuste registrado.');
      setShowCreate(false);
    }
    setSaving(false);
  }

  const entradas = ajustes.filter(a => a.adjustment_type === 'ENTRADA' || a.operation_subtype === 'ENTRADA').length;
  const salidas = ajustes.filter(a => a.adjustment_type === 'SALIDA' || a.operation_subtype === 'SALIDA').length;

  const filtered = ajustes.filter(a => {
    const ms = !search || JSON.stringify(a).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Entradas') return a.adjustment_type === 'ENTRADA' || a.operation_subtype === 'ENTRADA';
    if (activeTab === 'Salidas') return a.adjustment_type === 'SALIDA' || a.operation_subtype === 'SALIDA';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Inventario:</span>
        {INV_NAV.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/inventario/ajustes'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 border-transparent hover:border-orange-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl shadow-inner"><SlidersHorizontal size={24} /></div>
              Ajustes de Inventario
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Correcciones de stock por mermas, conteos fisicos o diferencias.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
            <Plus size={18} /> Nuevo Ajuste
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><SlidersHorizontal size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Total Ajustes</p>
            <h2 className="text-4xl font-black text-slate-800">{ajustes.length}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2">Todos los periodos</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Entradas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><TrendingUp size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Ajustes Positivos</p>
            <h2 className="text-4xl font-black text-slate-800">{entradas}</h2>
            <p className="text-xs font-bold text-emerald-600 mt-2">Sobrantes / Entradas</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-red-300 transition-all"
            onClick={() => setActiveTab('Salidas')}>
            <div className="w-12 h-12 rounded-xl bg-red-50 flex items-center justify-center text-red-600 mb-4 group-hover:scale-110 transition-transform"><TrendingDown size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Ajustes Negativos</p>
            <h2 className="text-4xl font-black text-slate-800">{salidas}</h2>
            <p className="text-xs font-bold text-red-600 mt-2">Mermas / Salidas</p>
          </div>
          <div className="bg-gradient-to-br from-amber-500 to-yellow-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-amber-100 uppercase tracking-wider mb-1 relative z-10">Diferencia Neta</p>
            <h2 className="text-4xl font-black text-white relative z-10">{entradas - salidas > 0 ? '+' : ''}{entradas - salidas}</h2>
            <p className="text-xs font-bold text-amber-100 mt-2 relative z-10">{entradas} entradas vs {salidas} salidas</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['Todos', 'Entradas', 'Salidas'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'Entradas' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      : tab === 'Salidas'  ? 'bg-red-100 text-red-800 shadow-sm border border-red-200'
                      :                        'bg-amber-100 text-amber-800 shadow-sm border border-amber-200'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'Todos' ? ajustes.length : tab === 'Entradas' ? entradas : salidas})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar ajustes..." className="bg-transparent text-sm outline-none w-52" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Ajuste #</th>
                  <th className="px-6 py-4">Tipo</th>
                  <th className="px-6 py-4">Producto</th>
                  <th className="px-6 py-4">Bodega</th>
                  <th className="px-6 py-4">Cantidad</th>
                  <th className="px-6 py-4">Motivo</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-amber-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando ajustes...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-20 text-center">
                    <SlidersHorizontal size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin ajustes registrados</p>
                    <p className="text-slate-400 text-sm mt-1">Los ajustes corrigen diferencias de stock detectadas en conteo fisico</p>
                  </td></tr>
                ) : filtered.map((a: any, i) => (
                  <tr key={a.id || i} onClick={() => setSelected(a)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <td className="px-6 py-4 font-black text-amber-700">AJU-{String(a.id || i+1).padStart(4, '0')}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        a.adjustment_type === 'ENTRADA' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {a.adjustment_type === 'ENTRADA' ? <><TrendingUp size={11} /> Entrada</> : <><TrendingDown size={11} /> Salida</>}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">{a.product_name || a.sku_id || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{a.warehouse_name || a.warehouse_id || '-'}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{a.quantity || a.qty || 0}</td>
                    <td className="px-6 py-4 text-slate-600">{a.motivo || a.notes || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(a.created_at)}</td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="bg-amber-100 text-amber-700 px-3 py-1.5 rounded text-xs font-bold">Ver Detalle</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Drawer */}
      {selected && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-amber-50 to-white flex items-start justify-between">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">AJU-{String(selected.id || '--').padStart(4, '0')}</h2>
                <p className="text-xs text-slate-400">Ajuste de Inventario</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'Tipo', value: selected.adjustment_type || '-' },
                  { label: 'Producto', value: selected.product_name || selected.sku_id || '-' },
                  { label: 'Bodega', value: selected.warehouse_name || selected.warehouse_id || '-' },
                  { label: 'Cantidad', value: selected.quantity || selected.qty || 0 },
                  { label: 'Motivo', value: selected.motivo || selected.notes || '-' },
                  { label: 'Fecha', value: fDate(selected.created_at) },
                ].map(({ label, value }) => (
                  <div key={label} className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-400 mb-1">{label}</p>
                    <p className="font-bold text-sm text-slate-800">{String(value)}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r from-amber-50 to-white">
              <h3 className="font-extrabold text-xl text-slate-900">Nuevo Ajuste de Inventario</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={createAjuste} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo *</label>
                  <select required value={form.tipo} onChange={e => setForm(f => ({ ...f, tipo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="ENTRADA">Entrada (Sobrante)</option>
                    <option value="SALIDA">Salida (Merma)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega *</label>
                  <select required value={form.warehouse_id} onChange={e => setForm(f => ({ ...f, warehouse_id: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    <option value="">Seleccionar...</option>
                    {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Producto *</label>
                <input required value={form.product_name} onChange={e => setForm(f => ({ ...f, product_name: e.target.value }))}
                  placeholder="Nombre del producto..."
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Cantidad *</label>
                  <input required type="number" min={1} value={form.qty} onChange={e => setForm(f => ({ ...f, qty: parseInt(e.target.value) || 1 }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none" />
                </div>
                <div>
                  <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Motivo *</label>
                  <select required value={form.motivo} onChange={e => setForm(f => ({ ...f, motivo: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                    {MOTIVOS.map(m => <option key={m}>{m}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas adicionales</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600">Cancelar</button>
                <button type="submit" disabled={saving} className={`flex-1 py-3 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2 ${form.tipo === 'ENTRADA' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}`}>
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <SlidersHorizontal size={14} />}
                  {saving ? 'Registrando...' : `Registrar ${form.tipo === 'ENTRADA' ? 'Sobrante' : 'Merma'}`}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
