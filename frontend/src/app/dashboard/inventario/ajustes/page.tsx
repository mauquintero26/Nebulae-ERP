'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  SlidersHorizontal, Activity, TrendingUp, TrendingDown, Plus,
  Search, X, RefreshCw
} from 'lucide-react';
import { apiFetch as _apiFetch, API_URL } from '@/lib/api';
import { SubNav, PageHeader, StatCard, Badge, Modal, Button, EmptyState } from '@/components/ui';
import { INV_NAV } from '../inv-nav';

async function apiFetch(path: string, opts: RequestInit = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

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
  const [form, setForm] = useState<{ tipo: string; sku_id: number|null; product_name: string; warehouse_id: string; qty: number; motivo: string; notas: string }>({
    tipo: 'ENTRADA', sku_id: null, product_name: '', warehouse_id: '', qty: 1, motivo: 'Conteo fisico', notas: '',
  });
  const [productResults, setProductResults] = useState<any[]>([]);
  const productTimer = useRef<any>(null);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  function onProductSearch(q: string) {
    setForm(f => ({ ...f, product_name: q, sku_id: null }));
    clearTimeout(productTimer.current);
    if (!q.trim()) { setProductResults([]); return; }
    productTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch('/crm/products/search?q=' + encodeURIComponent(q));
        setProductResults(Array.isArray(d) ? d : (d?.data ?? []));
      } catch { setProductResults([]); }
    }, 300);
  }

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
    if (!form.sku_id) { alert('Selecciona un producto de la lista'); return; }
    setSaving(true);
    try {
      await apiFetch('/inventory/operations', {
        method: 'POST',
        body: JSON.stringify({
          operation_type: 'ADJUSTMENT',
          dest_warehouse_id: parseInt(form.warehouse_id),
          notas: form.motivo + (form.notas ? ` — ${form.notas}` : ''),
          movements: [{ sku_id: form.sku_id, quantity: form.qty, direction: form.tipo === 'ENTRADA' ? 'IN' : 'OUT' }],
          created_by: currentUser,
        }),
      });
      setShowCreate(false);
      setForm({ tipo: 'ENTRADA', sku_id: null, product_name: '', warehouse_id: '', qty: 1, motivo: 'Conteo fisico', notas: '' });
      load();
    } catch (err: any) {
      alert('Error al registrar el ajuste: ' + (err?.message || 'intenta de nuevo'));
    }
    setSaving(false);
  }

  const direccionDe = (a: any) => a.movements?.[0]?.direction === 'ADJUST_OUT' ? 'SALIDA' : 'ENTRADA';
  const entradas = ajustes.filter(a => direccionDe(a) === 'ENTRADA').length;
  const salidas = ajustes.filter(a => direccionDe(a) === 'SALIDA').length;

  const filtered = ajustes.filter(a => {
    const ms = !search || JSON.stringify(a).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Entradas') return direccionDe(a) === 'ENTRADA';
    if (activeTab === 'Salidas') return direccionDe(a) === 'SALIDA';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <SubNav label="Inventario" items={INV_NAV} currentPath="/dashboard/inventario/ajustes" color="amber" />

      <div className="p-8 max-w-[1600px] mx-auto space-y-6">
        <PageHeader icon={SlidersHorizontal} color="amber"
          title="Ajustes de Inventario"
          subtitle="Correcciones de stock por mermas, conteos fisicos o diferencias."
          actionLabel="Nuevo Ajuste" actionIcon={Plus} onAction={() => setShowCreate(true)} />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={SlidersHorizontal} color="amber" label="Total Ajustes" value={ajustes.length} hint="Todos los periodos" />
          <StatCard icon={TrendingUp} color="emerald" label="Ajustes Positivos" value={entradas} hint="Sobrantes / Entradas" onClick={() => setActiveTab('Entradas')} />
          <StatCard icon={TrendingDown} color="rose" label="Ajustes Negativos" value={salidas} hint="Mermas / Salidas" onClick={() => setActiveTab('Salidas')} />
          <StatCard variant="gradient" icon={Activity} color="amber" label="Diferencia Neta"
            value={`${entradas - salidas > 0 ? '+' : ''}${entradas - salidas}`}
            hint={`${entradas} entradas vs ${salidas} salidas`} />
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
                  <tr><td colSpan={8}>
                    <EmptyState icon={SlidersHorizontal} message="Sin ajustes registrados" hint="Los ajustes corrigen diferencias de stock detectadas en conteo fisico" />
                  </td></tr>
                ) : filtered.map((a: any, i) => (
                  <tr key={a.id || i} onClick={() => setSelected(a)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <td className="px-6 py-4 font-black text-amber-700">AJU-{String(a.id || i+1).padStart(4, '0')}</td>
                    <td className="px-6 py-4">
                      <Badge tone={direccionDe(a) === 'ENTRADA' ? 'success' : 'danger'} icon={direccionDe(a) === 'ENTRADA' ? TrendingUp : TrendingDown}>
                        {direccionDe(a) === 'ENTRADA' ? 'Entrada' : 'Salida'}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-800">SKU #{a.movements?.[0]?.sku_id ?? '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{warehouses.find((w: any) => w.id === (a.dest_warehouse_id ?? a.source_warehouse_id))?.name || '-'}</td>
                    <td className="px-6 py-4 font-bold text-slate-800">{a.movements?.[0]?.quantity ?? 0}</td>
                    <td className="px-6 py-4 text-slate-600">{a.notas || '-'}</td>
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
                  { label: 'Tipo', value: direccionDe(selected) },
                  { label: 'Producto', value: `SKU #${selected.movements?.[0]?.sku_id ?? '-'}` },
                  { label: 'Bodega', value: warehouses.find((w: any) => w.id === (selected.dest_warehouse_id ?? selected.source_warehouse_id))?.name || '-' },
                  { label: 'Cantidad', value: selected.movements?.[0]?.quantity ?? 0 },
                  { label: 'Motivo', value: selected.notas || '-' },
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
        <Modal title="Nuevo Ajuste de Inventario" icon={SlidersHorizontal} color="amber" onClose={() => setShowCreate(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCreate(false)}>Cancelar</Button>
              <Button type="submit" form="ajuste-form" loading={saving} color={form.tipo === 'ENTRADA' ? 'emerald' : 'red'} icon={SlidersHorizontal}>
                {saving ? 'Registrando...' : `Registrar ${form.tipo === 'ENTRADA' ? 'Sobrante' : 'Merma'}`}
              </Button>
            </>
          )}>
          <form id="ajuste-form" onSubmit={createAjuste} className="space-y-4">
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
            <div className="relative">
              <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Producto *</label>
              <input required value={form.product_name} onChange={e => onProductSearch(e.target.value)}
                placeholder="Buscar producto..."
                className={`w-full border rounded-xl px-3 py-2.5 text-sm outline-none ${form.sku_id ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200'}`} />
              {productResults.length > 0 && !form.sku_id && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl z-10 max-h-48 overflow-y-auto">
                  {productResults.map((p: any) => (
                    <button key={p.id} type="button"
                      onClick={() => { setForm(f => ({ ...f, sku_id: p.id, product_name: p.display || p.product_name })); setProductResults([]); }}
                      className="w-full text-left px-4 py-2.5 hover:bg-amber-50 text-sm border-b last:border-0 border-slate-50">
                      {p.display || p.product_name}
                    </button>
                  ))}
                </div>
              )}
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
          </form>
        </Modal>
      )}
    </div>
  );
}
