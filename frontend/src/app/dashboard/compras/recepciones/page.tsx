'use client';

import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, X, Check, Package, Truck, AlertCircle, ArrowRight } from 'lucide-react';

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
  BORRADOR:   { label: 'Borrador',    color: '#64748b', bg: '#f1f5f9' },
  EN_PROCESO: { label: 'En proceso',  color: '#3b82f6', bg: '#eff6ff' },
  COMPLETADA: { label: 'Completada',  color: '#10b981', bg: '#f0fdf4' },
  PARCIAL:    { label: 'Parcial',     color: '#f59e0b', bg: '#fffbeb' },
  CANCELADA:  { label: 'Cancelada',   color: '#ef4444', bg: '#fef2f2' },
};
function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#6366f1', bg: '#eef2ff' };
  return <span className="px-2 py-0.5 rounded-full text-xs font-bold" style={{ backgroundColor: cfg.bg, color: cfg.color }}>{cfg.label}</span>;
}
const fDate = (iso: string|null) => iso ? new Date(iso).toLocaleDateString('es-CO', {day:'2-digit',month:'short',year:'numeric'}) : '-';

export default function RecepcionesPage() {
  const [recs, setRecs] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any|null>(null);
  const [confirming, setConfirming] = useState(false);
  const [currentUser, setCurrentUser] = useState('');
  const [editProds, setEditProds] = useState<any[]>([]);

  useEffect(() => { setCurrentUser(localStorage.getItem('user_name') || ''); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await apiFetch(`/compras/recepciones?limit=100`);
      setRecs(Array.isArray(d) ? d : (d?.data ?? []));
      setTotal(d?.total ?? (Array.isArray(d) ? d.length : 0));
    } catch { setRecs([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    const d = await apiFetch(`/compras/recepciones/${id}`);
    setSelected(d);
    setEditProds(d.productos || []);
  }

  async function confirmar() {
    setConfirming(true);
    try {
      // Save current qty_recibida first
      await apiFetch(`/compras/recepciones/${selected.id}`, {
        method: 'PATCH', body: JSON.stringify({ productos: editProds, updated_by: currentUser }),
      });
      await apiFetch(`/compras/recepciones/${selected.id}/confirmar`, {
        method: 'POST', body: JSON.stringify({ user_name: currentUser }),
      });
      alert('Recepcion confirmada. Stock actualizado en bodega.');
      loadDetail(selected.id); load();
    } catch (err: any) { alert(err.message); }
    setConfirming(false);
  }

  return (
    <div className="h-full w-full bg-[#f8f9fa] flex flex-col overflow-hidden">
      <div className="bg-white border-b border-slate-100 px-6 py-4 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center text-teal-600">
            <Truck size={20} />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-slate-900">Recepciones de Inventario</h1>
            <p className="text-xs text-slate-500">{total} recepciones &bull; ENINV-YYYY####</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={load} className="p-2 border border-slate-200 rounded-xl text-slate-500 hover:bg-slate-50">
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
          <a href="/dashboard/compras/pedidos" className="bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-xl font-bold text-sm flex items-center gap-2">
            <ArrowRight size={16} /> Ir a Pedidos de Compra
          </a>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className={`flex flex-col overflow-hidden transition-all ${selected ? 'w-[50%]' : 'w-full'}`}>
          <div className="flex-1 overflow-y-auto">
            {loading ? <div className="flex justify-center pt-16"><RefreshCw size={24} className="animate-spin text-teal-400" /></div>
            : recs.length === 0 ? (
              <div className="text-center pt-16 text-slate-400">
                <Truck size={40} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Sin recepciones. Crea una desde un Pedido de Compra.</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-100 sticky top-0">
                  <tr className="text-xs text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3">ENINV #</th><th className="px-4 py-3">PEC #</th>
                    <th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Bodega</th>
                    <th className="px-4 py-3">Fecha</th><th className="px-4 py-3">Estado</th><th className="px-4 py-3">Stock</th>
                  </tr>
                </thead>
                <tbody>
                  {recs.map(r => (
                    <tr key={r.id} onClick={() => loadDetail(r.id)}
                      className={`border-b border-slate-50 cursor-pointer hover:bg-teal-50/30 ${selected?.id===r.id?'bg-teal-50/50':''}`}>
                      <td className="px-4 py-3 font-bold text-teal-600">{r.numero}</td>
                      <td className="px-4 py-3 text-purple-600 font-medium">{r.pec_numero || '-'}</td>
                      <td className="px-4 py-3 text-slate-800">{r.supplier_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-600">{r.warehouse_name || '-'}</td>
                      <td className="px-4 py-3 text-slate-500">{fDate(r.fecha_recepcion)}</td>
                      <td className="px-4 py-3"><Badge estado={r.estado} /></td>
                      <td className="px-4 py-3">{r.stock_actualizado ? <span className="text-xs text-emerald-600 font-bold">✓ Actualizado</span> : <span className="text-xs text-slate-400">Pendiente</span>}</td>
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
                {selected.pec_numero && <p className="text-xs text-slate-400">PEC: <span className="text-purple-600 font-bold">{selected.pec_numero}</span></p>}
              </div>
              <div className="flex items-center gap-2">
                {!selected.stock_actualizado && selected.estado !== 'CANCELADA' && (
                  <button onClick={confirmar} disabled={confirming}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1">
                    {confirming ? <RefreshCw size={12} className="animate-spin" /> : <Check size={12} />}
                    Confirmar Recepcion
                  </button>
                )}
                <button onClick={() => setSelected(null)} className="p-1.5 text-slate-400 hover:bg-slate-100 rounded-lg"><X size={16} /></button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge estado={selected.estado} />
                {selected.stock_actualizado && <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">Stock actualizado</span>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Proveedor</p><p className="font-bold text-sm">{selected.supplier_name || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Bodega</p><p className="font-bold text-sm">{selected.warehouse_name || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Carrier</p><p className="font-bold text-sm">{selected.carrier || '-'}</p></div>
                <div className="bg-slate-50 rounded-xl p-3"><p className="text-xs text-slate-400 mb-1">Fecha Recepcion</p><p className="font-bold text-sm">{fDate(selected.fecha_recepcion)}</p></div>
              </div>

              {/* Products with received qty */}
              <div>
                <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos (Esperados vs Recibidos)</p>
                {!selected.stock_actualizado && (
                  <p className="text-xs text-amber-600 mb-2 flex items-center gap-1"><AlertCircle size={11} /> Actualiza la cantidad recibida antes de confirmar</p>
                )}
                <div className="border border-slate-100 rounded-xl overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-50"><tr className="text-slate-400 uppercase">
                      <th className="px-3 py-2 text-left">Producto</th>
                      <th className="px-3 py-2 text-right">Esperado</th>
                      <th className="px-3 py-2 text-right">Recibido</th>
                      <th className="px-3 py-2 text-center">Estado</th>
                    </tr></thead>
                    <tbody>
                      {editProds.map((p: any, i: number) => (
                        <tr key={i} className="border-t border-slate-50">
                          <td className="px-3 py-2 font-medium">{p.product_name}</td>
                          <td className="px-3 py-2 text-right text-slate-600">{p.qty_esperada || p.qty || 0}</td>
                          <td className="px-3 py-2 text-right">
                            {selected.stock_actualizado ? (
                              <span className="font-bold text-emerald-600">{p.qty_recibida}</span>
                            ) : (
                              <input type="number" min={0} value={p.qty_recibida || 0}
                                onChange={e => {
                                  const n = [...editProds];
                                  n[i] = { ...n[i], qty_recibida: parseInt(e.target.value) || 0 };
                                  setEditProds(n);
                                }}
                                className="w-16 border border-slate-200 rounded px-1.5 py-1 outline-none text-right focus:border-teal-400" />
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            <span className={`text-xs font-bold ${p.estado==='RECIBIDO'?'text-emerald-600':'text-amber-600'}`}>{p.estado || 'PENDIENTE'}</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actividades */}
              {selected.actividades?.length > 0 && (
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Actividad</p>
                  {selected.actividades.map((a: any) => (
                    <div key={a.id} className="flex gap-3 mb-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-teal-400 mt-2 flex-shrink-0" />
                      <div>
                        <p className="text-sm text-slate-700">{a.description}</p>
                        <p className="text-xs text-slate-400">{fDate(a.created_at)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
