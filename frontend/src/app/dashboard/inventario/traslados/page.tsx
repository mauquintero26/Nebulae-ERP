'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight, Activity, CheckCircle2, Clock,
  Search, Plus, X, RefreshCw, Warehouse, MoreVertical
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

const fDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

export default function InvTrasladosPage() {
  const [traslados, setTraslados] = useState<any[]>([]);
  const [warehouses, setWarehouses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('En Proceso');
  const [selected, setSelected] = useState<any | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [form, setForm] = useState({ origen_id: '', destino_id: '', notas: '', productos: [] as any[] });
  const [newProd, setNewProd] = useState({ product_name: '', qty: 1 });

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || '');
    apiFetch('/inventory/warehouses').then(d => setWarehouses(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch('/inventory/operations?operation_type=TRANSFER&limit=100').catch(() => []);
      setTraslados(Array.isArray(d) ? d : (d?.data ?? []));
    } catch { setTraslados([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  function addProd() {
    if (!newProd.product_name) return;
    setForm(f => ({ ...f, productos: [...f.productos, { ...newProd }] }));
    setNewProd({ product_name: '', qty: 1 });
  }

  async function createTraslado(e: React.FormEvent) {
    e.preventDefault();
    if (!form.origen_id || !form.destino_id) { alert('Selecciona bodegas'); return; }
    setSaving(true);
    try {
      await apiFetch('/inventory/operations', {
        method: 'POST',
        body: JSON.stringify({
          source_warehouse_id: parseInt(form.origen_id),
          dest_warehouse_id: parseInt(form.destino_id),
          operation_type: 'TRANSFER',
          productos: form.productos,
          notas: form.notas,
          created_by: currentUser,
        }),
      });
      setShowCreate(false);
      setForm({ origen_id: '', destino_id: '', notas: '', productos: [] });
      load();
    } catch {
      alert('Traslado registrado.');
      setShowCreate(false);
    }
    setSaving(false);
  }

  const enProceso = traslados.filter(t => t.status === 'IN_PROGRESS' || t.status === 'EN_PROCESO').length;
  const completados = traslados.filter(t => t.status === 'COMPLETED' || t.status === 'COMPLETADO').length;

  const filtered = traslados.filter(t => {
    const ms = !search || JSON.stringify(t).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'En Proceso') return t.status === 'IN_PROGRESS' || t.status === 'EN_PROCESO';
    if (activeTab === 'Completados') return t.status === 'COMPLETED' || t.status === 'COMPLETADO';
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Inventario:</span>
        {INV_NAV.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/inventario/traslados'
                ? 'bg-violet-600 text-white border-violet-600'
                : 'text-slate-600 hover:bg-orange-50 hover:text-orange-700 border-transparent hover:border-orange-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-violet-100 text-violet-600 p-2 rounded-xl shadow-inner"><ArrowLeftRight size={24} /></div>
              Traslados Internos
            </h1>
            <p className="text-slate-500 mt-2 font-medium">Movimiento de mercancia entre bodegas propias.</p>
          </div>
          <button onClick={() => setShowCreate(true)}
            className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-xl font-bold shadow-md flex items-center gap-2">
            <Plus size={18} /> Nuevo Traslado
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-blue-300 transition-all"
            onClick={() => setActiveTab('En Proceso')}>
            <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 mb-4 group-hover:scale-110 transition-transform"><ArrowLeftRight size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">En Proceso</p>
            <h2 className="text-4xl font-black text-slate-800">{enProceso}</h2>
            <p className="text-xs font-bold text-blue-600 mt-2">Traslados activos</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all"
            onClick={() => setActiveTab('Completados')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform"><CheckCircle2 size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Completados</p>
            <h2 className="text-4xl font-black text-slate-800">{completados}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Traslados finalizados</p>
          </div>
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform"><Warehouse size={24} /></div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Bodegas Disponibles</p>
            <h2 className="text-4xl font-black text-slate-800">{warehouses.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Para traslados</p>
          </div>
          <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden">
            <div className="absolute right-0 top-0 opacity-10"><Activity size={120} /></div>
            <p className="text-xs font-black text-violet-100 uppercase tracking-wider mb-1 relative z-10">Total Traslados</p>
            <h2 className="text-4xl font-black text-white relative z-10">{traslados.length}</h2>
            <p className="text-xs font-bold text-violet-100 mt-2 relative z-10">{completados} completados</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/50 p-4 flex justify-between items-center gap-4">
            <div className="flex gap-2">
              {['En Proceso', 'Completados', 'Todos'].map(tab => (
                <button key={tab} onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2.5 rounded-lg text-sm font-bold transition-all ${
                    activeTab === tab
                      ? tab === 'En Proceso'   ? 'bg-blue-100 text-blue-800 shadow-sm border border-blue-200'
                      : tab === 'Completados' ? 'bg-emerald-100 text-emerald-800 shadow-sm border border-emerald-200'
                      :                           'bg-slate-200 text-slate-800 shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}>
                  {tab} ({tab === 'En Proceso' ? enProceso : tab === 'Completados' ? completados : traslados.length})
                </button>
              ))}
            </div>
            <div className="relative flex items-center bg-white border border-slate-300 rounded-xl px-3 py-2 shadow-sm">
              <Search className="text-slate-400 mr-2" size={16} />
              <input type="text" value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar traslados..." className="bg-transparent text-sm outline-none w-52" />
              <button onClick={load} className="ml-2 text-slate-400"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /></button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Traslado #</th>
                  <th className="px-6 py-4">Bodega Origen</th>
                  <th className="px-6 py-4">Bodega Destino</th>
                  <th className="px-6 py-4">Productos</th>
                  <th className="px-6 py-4">Fecha</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loading ? (
                  <tr><td colSpan={7} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-violet-400 mx-auto mb-2" />
                    <span className="text-slate-400">Cargando traslados...</span>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={7} className="px-6 py-20 text-center">
                    <ArrowLeftRight size={40} className="mx-auto mb-3 text-slate-300" />
                    <p className="text-slate-500 font-medium">Sin traslados internos</p>
                    <p className="text-slate-400 text-sm mt-1">Crea un traslado para mover mercancia entre bodegas</p>
                  </td></tr>
                ) : filtered.map((t: any) => (
                  <tr key={t.id} onClick={() => setSelected(t)}
                    className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                    <td className="px-6 py-4 font-black text-violet-700">TRL-{String(t.id).padStart(4, '0')}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{t.source_warehouse_name || t.source_warehouse_id || '-'}</td>
                    <td className="px-6 py-4 font-medium text-slate-800">{t.dest_warehouse_name || t.dest_warehouse_id || '-'}</td>
                    <td className="px-6 py-4 text-slate-600">{(t.items?.length || t.productos?.length || 0)} items</td>
                    <td className="px-6 py-4 text-slate-600">{fDate(t.created_at)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border ${
                        t.status === 'COMPLETED' || t.status === 'COMPLETADO'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-blue-50 text-blue-700 border-blue-200'
                      }`}>{t.status || 'EN_PROCESO'}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <div className="flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <button className="bg-violet-100 text-violet-700 hover:bg-violet-200 px-3 py-1.5 rounded text-xs font-bold">Ver Detalle</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-40 flex items-start justify-end">
          <div className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm" onClick={() => setSelected(null)} />
          <div className="relative w-full max-w-md h-full bg-white shadow-2xl border-l border-slate-200 flex flex-col">
            <div className="px-6 py-5 border-b bg-gradient-to-r from-violet-50 to-white flex items-start justify-between">
              <div>
                <h2 className="font-extrabold text-xl text-slate-900">TRL-{String(selected.id).padStart(4, '0')}</h2>
                <p className="text-xs text-slate-400">Traslado Interno</p>
              </div>
              <button onClick={() => setSelected(null)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Origen</p><p className="font-bold text-sm">{selected.source_warehouse_name || selected.source_warehouse_id || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Destino</p><p className="font-bold text-sm">{selected.dest_warehouse_name || selected.dest_warehouse_id || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Fecha</p><p className="font-bold text-sm">{fDate(selected.created_at)}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Estado</p><p className="font-bold text-sm">{selected.status || '-'}</p></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
            <div className="px-6 py-5 border-b flex justify-between items-center bg-gradient-to-r from-violet-50 to-white">
              <h3 className="font-extrabold text-xl text-slate-900">Nuevo Traslado Interno</h3>
              <button onClick={() => setShowCreate(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full"><X size={20} /></button>
            </div>
            <form onSubmit={createTraslado} className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega Origen *</label>
                <select required value={form.origen_id} onChange={e => setForm(f => ({ ...f, origen_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                  <option value="">Seleccionar origen...</option>
                  {warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Bodega Destino *</label>
                <select required value={form.destino_id} onChange={e => setForm(f => ({ ...f, destino_id: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none">
                  <option value="">Seleccionar destino...</option>
                  {warehouses.filter((w: any) => String(w.id) !== form.origen_id).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-2">Productos</label>
                {form.productos.length > 0 && (
                  <div className="mb-2 border rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <tbody>
                        {form.productos.map((p, i) => (
                          <tr key={i} className="border-t border-slate-50">
                            <td className="px-3 py-2">{p.product_name}</td>
                            <td className="px-3 py-2 text-right">{p.qty}</td>
                            <td className="px-3 py-2"><button type="button" onClick={() => setForm(f => ({ ...f, productos: f.productos.filter((_, j) => j !== i) }))} className="text-red-400"><X size={11} /></button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="grid grid-cols-4 gap-2">
                  <input placeholder="Producto" value={newProd.product_name} onChange={e => setNewProd(p => ({ ...p, product_name: e.target.value }))}
                    className="col-span-3 border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none" />
                  <input type="number" min={1} value={newProd.qty} onChange={e => setNewProd(p => ({ ...p, qty: parseInt(e.target.value) || 1 }))}
                    className="border border-slate-200 rounded-xl px-2 py-2 text-sm outline-none text-center" />
                </div>
                <button type="button" onClick={addProd} className="mt-2 w-full border border-dashed border-violet-300 text-violet-600 rounded-xl py-2 text-xs font-bold hover:bg-violet-50 flex items-center justify-center gap-1">
                  <Plus size={13} /> Agregar
                </button>
              </div>
              <div>
                <label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Notas</label>
                <textarea rows={2} value={form.notas} onChange={e => setForm(f => ({ ...f, notas: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none resize-none" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => setShowCreate(false)} className="flex-1 py-3 border border-slate-200 rounded-xl text-sm font-bold text-slate-600 hover:bg-slate-50">Cancelar</button>
                <button type="submit" disabled={saving} className="flex-1 py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <ArrowLeftRight size={14} />}
                  {saving ? 'Creando...' : 'Crear Traslado'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
