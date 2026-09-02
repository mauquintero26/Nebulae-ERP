'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  FileText, Clock, CheckCircle2, DollarSign, Activity,
  Search, X, RefreshCw, AlertCircle, MoreVertical, Plus,
  Phone, Mail, MapPin, ChevronRight, ShieldAlert, Package,
  Calculator, Send, Trash2, Edit2, Save, ArrowRight,
  MessageCircle, ExternalLink, User, TrendingUp, ChevronDown, RotateCcw
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
  { name: 'Solicitud',      path: '/dashboard/ventas/solicitud' },
  { name: 'Cotizacion',     path: '/dashboard/ventas/cotizacion' },
  { name: 'Venta',          path: '/dashboard/ventas/venta' },
  { name: 'Exportar Dia',   path: '/dashboard/ventas/exportar-dia' },
  { name: 'Exportar Rango', path: '/dashboard/ventas/exportar-rango' },
  { name: 'Sincronizacion', path: '/dashboard/ventas/sincronizacion' },
  { name: 'Proyecciones',   path: '/dashboard/ventas/proyecciones' },
];

const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BORRADOR:              { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ENVIADA:               { label: 'Enviada al cliente',    color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  PENDIENTE_CONFIRMACION:{ label: 'Esp. confirmacion',     color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMADA:            { label: 'Confirmada',            color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  RECHAZADA:             { label: 'Rechazada',             color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  VENCIDA:               { label: 'Vencida',               color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};

function Badge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

function Toast({ msg, type, onClose }: { msg: string; type: 'ok'|'err'; onClose: () => void }) {
  useEffect(() => { const t = setTimeout(onClose, 3500); return () => clearTimeout(t); }, [onClose]);
  return (
    <div className={`fixed top-5 right-5 z-[100] px-5 py-3 rounded-2xl shadow-2xl font-bold text-sm flex items-center gap-3 ${type === 'ok' ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'}`}>
      {type === 'ok' ? <CheckCircle2 size={16}/> : <AlertCircle size={16}/>}
      {msg}
      <button onClick={onClose}><X size={14}/></button>
    </div>
  );
}

const fDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
const fCOP = (v: number | null | undefined) => {
  const n = Number(v) || 0;
  if (n === 0) return '$0';
  return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(n);
};
const isOverdue = (iso: string | null | undefined) => iso ? new Date(iso) < new Date() : false;
const isExpiringSoon = (iso: string | null | undefined) => {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d >= now && (d.getTime() - now.getTime()) / 86400000 <= 7;
};

// ── ActionIcon for activity ──────────────────────────────────────────────────
function ActionDot({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATED: '#6366f1', ESTADO_CHANGED: '#f59e0b', SENT: '#10b981',
    CONFIRMED: '#059669', REJECTED: '#ef4444', UPDATED: '#3b82f6',
  };
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 flex-shrink-0"
    style={{ backgroundColor: colors[action] || '#94a3b8', borderColor: 'white' }} />;
}

// ── Calculator Modal ─────────────────────────────────────────────────────────
function CalculadorModal({
  cot, onSave, onClose
}: { cot: any; onSave: (data: any) => void; onClose: () => void }) {
  const [trm, setTrm] = useState(cot.trm_rate || 4200);
  const [productos, setProductos] = useState<any[]>(
    (cot.productos || []).length > 0
      ? cot.productos.map((p: any) => ({ ...p, cost_usd: p.cost_usd || 0, margen_pct: p.margen_pct || 30, flete_usd: p.flete_usd || 0 }))
      : [{ product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0 }]
  );
  const [descuento, setDescuento] = useState(cot.descuento_pct || 0);
  const [fechaEntrega, setFechaEntrega] = useState(cot.fecha_entrega_estimada ? cot.fecha_entrega_estimada.split('T')[0] : '');
  const [notas, setNotas] = useState(cot.notas || '');
  const [anticipo, setAnticipo] = useState(cot.anticipo_cop || 0);

  const addProd = () => setProductos(p => [...p, { product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0 }]);
  const removeProd = (i: number) => setProductos(p => p.filter((_, idx) => idx !== i));
  const updateProd = (i: number, k: string, v: any) =>
    setProductos(p => p.map((item, idx) => idx === i ? { ...item, [k]: v } : item));

  const computedProd = productos.map(p => {
    const costo_cop = (Number(p.cost_usd) || 0) * Number(trm);
    const flete_cop = (Number(p.flete_usd) || 0) * Number(trm);
    const costo_total = (costo_cop + flete_cop) * (Number(p.qty) || 1);
    const margen = Number(p.margen_pct) || 0;
    const price_cop = margen > 0 ? costo_total / (1 - margen / 100) : costo_total;
    return { ...p, price_cop_unit: costo_total / (Number(p.qty) || 1) * (1 + margen / 100), total_cop: price_cop };
  });

  const subtotal = computedProd.reduce((s, p) => s + p.total_cop, 0);
  const descTotal = subtotal * (Number(descuento) || 0) / 100;
  const total = subtotal - descTotal;
  const anticipo_cop = Number(anticipo) || 0;
  const saldo = total - anticipo_cop;

  const handleSave = () => {
    const prods = computedProd.map(p => ({
      product_name: p.product_name,
      qty: Number(p.qty),
      cost_usd: Number(p.cost_usd),
      flete_usd: Number(p.flete_usd),
      margen_pct: Number(p.margen_pct),
      unit_price_cop: p.price_cop_unit,
      total_cop: p.total_cop,
    }));
    onSave({
      productos: prods, trm_rate: Number(trm),
      subtotal_cop: subtotal, descuento_pct: Number(descuento),
      total_cop: total, anticipo_cop: anticipo_cop,
      notas: notas || cot.notas,
      fecha_entrega_estimada: fechaEntrega || cot.fecha_entrega_estimada,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-amber-50 to-white">
          <div>
            <h3 className="font-extrabold text-xl text-slate-900 flex items-center gap-2">
              <Calculator className="text-amber-600" size={20}/> Calculadora de Cotizacion
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">{cot.numero} — {cot.customer_name}</p>
          </div>
          <button onClick={onClose} className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl"><X size={18}/></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* TRM */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">TRM (USD→COP)</label>
              <input type="number" value={trm} onChange={e => setTrm(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Desc. Global (%)</label>
              <input type="number" min="0" max="100" value={descuento} onChange={e => setDescuento(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Fecha Entrega Est.</label>
              <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
          </div>

          {/* Products */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-black text-slate-500 uppercase">Productos</p>
              <button onClick={addProd} className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-amber-200">
                <Plus size={12}/> Agregar
              </button>
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 uppercase font-black">
                  <tr>
                    <th className="px-3 py-2 text-left">Producto</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Costo USD</th>
                    <th className="px-3 py-2 text-right">Flete USD</th>
                    <th className="px-3 py-2 text-right">Margen %</th>
                    <th className="px-3 py-2 text-right">Total COP</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {computedProd.map((p, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2">
                        <input type="text" value={p.product_name} onChange={e => updateProd(i, 'product_name', e.target.value)}
                          placeholder="Nombre del producto" className="w-full border-0 bg-transparent outline-none font-medium text-slate-700 placeholder-slate-300" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" value={p.qty} onChange={e => updateProd(i, 'qty', e.target.value)}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={p.cost_usd} onChange={e => updateProd(i, 'cost_usd', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={p.flete_usd} onChange={e => updateProd(i, 'flete_usd', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max="100" value={p.margen_pct} onChange={e => updateProd(i, 'margen_pct', e.target.value)}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2 text-right font-black text-amber-700">{fCOP(p.total_cop)}</td>
                      <td className="px-3 py-2">
                        {computedProd.length > 1 && (
                          <button onClick={() => removeProd(i)} className="text-red-400 hover:text-red-600"><X size={12}/></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-slate-600 font-medium">Subtotal</span>
              <span className="font-bold">{fCOP(subtotal)}</span>
            </div>
            {descuento > 0 && (
              <div className="flex justify-between text-sm text-red-600">
                <span className="font-medium">Descuento ({descuento}%)</span>
                <span className="font-bold">-{fCOP(descTotal)}</span>
              </div>
            )}
            <div className="flex justify-between text-base border-t border-amber-200 pt-2">
              <span className="font-black text-slate-800">TOTAL</span>
              <span className="font-black text-amber-700 text-lg">{fCOP(total)}</span>
            </div>
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Anticipo COP</label>
                <input type="number" min="0" value={anticipo} onChange={e => setAnticipo(Number(e.target.value))}
                  className="w-full border border-amber-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 outline-none bg-white" />
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-slate-500 mb-1">Saldo pendiente</p>
                <p className="font-black text-slate-800">{fCOP(saldo)}</p>
              </div>
            </div>
          </div>

          {/* Notas */}
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Notas / Observaciones</label>
            <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 flex justify-end gap-3 bg-slate-50">
          <button onClick={onClose} className="px-5 py-2.5 rounded-xl border border-slate-300 text-slate-600 font-bold text-sm hover:bg-slate-100">Cancelar</button>
          <button onClick={handleSave} className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm shadow-md flex items-center gap-2">
            <Save size={14}/> Guardar Cotizacion
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Delete Confirm Dialog ────────────────────────────────────────────────────
function DeleteConfirm({ cot, onConfirm, onCancel }: { cot: any; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl p-8 max-w-sm w-full mx-4">
        <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <Trash2 className="text-red-600" size={24}/>
        </div>
        <h3 className="font-extrabold text-xl text-slate-900 text-center mb-2">Eliminar Cotizacion</h3>
        <p className="text-slate-500 text-center text-sm mb-2">
          ¿Estas seguro de eliminar <strong>{cot.numero}</strong>?
        </p>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3 text-center mb-6">
          La Solicitud de Cliente vinculada (<strong>{cot.sc_numero}</strong>) no sera eliminada y podra generar una nueva cotizacion.
        </p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-50">Cancelar</button>
          <button onClick={onConfirm} className="flex-1 py-3 rounded-xl bg-red-600 text-white font-bold hover:bg-red-700">Si, Eliminar</button>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function CotizacionPage() {
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Activas');
  const [selected, setSelected] = useState<any | null>(null);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string; type: 'ok' | 'err' } | null>(null);
  const [currentUser, setCurrentUser] = useState('');

  // Panel state
  const [showCalc, setShowCalc] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [panelTab, setPanelTab] = useState<'acciones'|'actividad'|'chatter'>('acciones');
  const [cotHistory, setCotHistory] = useState<any[]>([]);
  const [chatterInput, setChatterInput] = useState('');
  const [chatterSending, setChatterSending] = useState(false);
  const [alertDias, setAlertDias] = useState(2);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  const showToast = (msg: string, type: 'ok' | 'err' = 'ok') => setToast({ msg, type });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, cfg] = await Promise.all([
        apiFetch('/ventas/cotizaciones?limit=200'),
        apiFetch('/ventas/config').catch(() => ({})),
      ]);
      setCotizaciones(Array.isArray(d) ? d : (d?.data ?? []));
      if (cfg?.alerta_cot_dias?.value) setAlertDias(Number(cfg.alerta_cot_dias.value));
    } catch { setCotizaciones([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function loadDetail(id: number) {
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${id}`);
      setSelected(d);
      setEditForm({
        notas: d.notas || '',
        fecha_entrega_estimada: d.fecha_entrega_estimada ? d.fecha_entrega_estimada.split('T')[0] : '',
        cotizador: d.cotizador || '',
        direccion_entrega: d.direccion_entrega || '',
        estado: d.estado,
      });
    } catch (err: any) { showToast('Error al cargar detalle: ' + err.message, 'err'); }
  }

  async function saveEdit() {
    if (!selected) return;
    setSavingEdit(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, updated_by: currentUser }),
      });
      setSelected({ ...selected, ...d });
      setCotizaciones(prev => prev.map(c => c.id === selected.id ? { ...c, ...d } : c));
      setEditMode(false);
      showToast('Cotizacion actualizada');
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSavingEdit(false);
  }

  async function changeEstado(newEstado: string) {
    if (!selected) return;
    setSaving(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: newEstado, updated_by: currentUser }),
      });
      await loadDetail(selected.id);
      setCotizaciones(prev => prev.map(c => c.id === selected.id ? { ...c, estado: newEstado } : c));
      showToast(`Estado cambiado a ${ESTADOS[newEstado]?.label || newEstado}`);
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSaving(false);
  }

  async function enviarCotizacion() {
    if (!selected) return;
    setSaving(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'ENVIADA', updated_by: currentUser }),
      });
      await loadDetail(selected.id);
      setCotizaciones(prev => prev.map(c => c.id === selected.id ? { ...c, estado: 'ENVIADA' } : c));
      showToast('Cotizacion marcada como enviada al cliente. En espera de confirmacion.');
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSaving(false);
  }

  async function confirmar() {
    if (!selected) return;
    // Alert if no products and no notes
    const hasProds = (selected.productos || []).length > 0;
    const hasNotes = (selected.notas || '').trim().length > 0;
    if (!hasProds && !hasNotes) {
      showToast('No hay productos ni notas. Por favor cotiza primero o agrega informacion.', 'err');
      return;
    }
    if (!hasProds && hasNotes) {
      const ok = window.confirm('No hay productos especificados. Las notas mencionan el producto. ¿Confirmar de todas formas?');
      if (!ok) return;
    }
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${selected.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({ user_name: currentUser }),
      });
      showToast(`Pedido de Venta ${d.pedido?.numero || ''} creado exitosamente`);
      await loadDetail(selected.id);
      load();
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setConfirming(false);
  }

  async function deleteCot() {
    if (!selected) return;
    try {
      // No DELETE endpoint: change to RECHAZADA as soft-delete
      await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'RECHAZADA', updated_by: currentUser }),
      });
      showToast('Cotizacion eliminada (marcada como Rechazada). La SC vinculada permanece activa.');
      setSelected(null);
      setShowDelete(false);
      load();
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
  }

  async function onCalcSave(data: any) {
    if (!selected) return;
    setSaving(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, updated_by: currentUser }),
      });
      setSelected((prev: any) => ({ ...prev, ...data }));
      setCotizaciones(prev => prev.map(c => c.id === selected.id ? { ...c, total_cop: data.total_cop } : c));
      setShowCalc(false);
      showToast('Cotizacion calculada y guardada');
    } catch (err: any) { showToast('Error: ' + err.message, 'err'); }
    setSaving(false);
  }

  // ── Derived stats ──────────────────────────────────────────────────────────
  const activas     = cotizaciones.filter(c => c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA');
  const confirmadas = cotizaciones.filter(c => c.estado === 'CONFIRMADA');
  const rechazadas  = cotizaciones.filter(c => c.estado === 'RECHAZADA');
  const sinCalc     = activas.filter(c => !(c.total_cop > 0)).length;
  const vencenPronto= activas.filter(c => isExpiringSoon(c.fecha_entrega_estimada)).length;
  const montoTotal  = confirmadas.reduce((s, c) => s + (c.total_cop || 0), 0);
  const sinAtender  = activas.filter(c => {
    const ms = (Date.now() - new Date(c.updated_at || c.created_at).getTime());
    return ms / 3600000 > alertDias * 24;
  }).length;

  const filtered = cotizaciones.filter(c => {
    const ms = !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Activas')    return c.estado !== 'CONFIRMADA' && c.estado !== 'RECHAZADA';
    if (activeTab === 'Confirmadas') return c.estado === 'CONFIRMADA';
    if (activeTab === 'Rechazadas')  return c.estado === 'RECHAZADA';
    return true;
  });

  // Alert check for selected cot: no products but type is cotizacion
  const selectedNoProds = selected && !(selected.productos || []).length > 0;
  const selectedNoNotes = selected && !(selected.notas || '').trim();

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Toast */}
      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      {/* Sub-module nav */}
      <div className="bg-white border-b border-slate-200 px-6 py-2 overflow-x-auto flex items-center gap-2 shadow-sm sticky top-0 z-30">
        <span className="text-xs font-black text-slate-400 uppercase tracking-wider mr-4 shrink-0">Ventas:</span>
        {SUB_MODULES.map(mod => (
          <Link key={mod.name} href={mod.path}
            className={`shrink-0 px-4 py-1.5 rounded-full text-sm font-bold transition-colors border ${
              mod.path === '/dashboard/ventas/cotizacion'
                ? 'bg-amber-600 text-white border-amber-600'
                : 'text-slate-600 hover:bg-amber-50 hover:text-amber-700 border-transparent hover:border-amber-200'
            }`}>{mod.name}
          </Link>
        ))}
      </div>

      {/* Alert Banner */}
      {(sinCalc > 0 || vencenPronto > 0 || sinAtender > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-amber-800">ATENCION — Cotizaciones requieren accion (Alerta {alertDias} dias)</h4>
            <p className="text-xs font-bold text-amber-700 mt-1">
              {sinAtender > 0 && `* ${sinAtender} cotizacion(es) sin atender mas de ${alertDias} dias `}
              {sinCalc > 0 && `* ${sinCalc} sin calcular / sin precio `}
              {vencenPronto > 0 && `* ${vencenPronto} vence(n) en los proximos 7 dias `}
            </p>
          </div>
          <button onClick={load} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-700 shrink-0">Actualizar</button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-black text-slate-800 tracking-tight flex items-center gap-3">
              <div className="bg-amber-100 text-amber-600 p-2 rounded-xl shadow-inner"><FileText size={24}/></div>
              Cotizaciones
            </h1>
            <p className="text-slate-500 mt-2 font-medium">COT-YYYY#### — Genera precios, envia al cliente y confirma para crear Pedido de Venta.</p>
          </div>
          <div className="flex gap-3">
            <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm">
              <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar
            </button>
            <Link href="/dashboard/ventas/solicitud" className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
              <Plus size={16}/> Nueva desde SC
            </Link>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-amber-300 transition-all" onClick={() => setActiveTab('Activas')}>
            <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600 mb-4 group-hover:scale-110 transition-transform">
              <FileText size={24}/>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Activas</p>
            <h2 className="text-4xl font-black text-slate-800">{activas.length}</h2>
            <p className="text-xs font-bold text-amber-600 mt-2">{sinCalc > 0 ? `${sinCalc} sin precio` : 'Todas calculadas'}</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-emerald-300 transition-all" onClick={() => setActiveTab('Confirmadas')}>
            <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600 mb-4 group-hover:scale-110 transition-transform">
              <CheckCircle2 size={24}/>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Confirmadas</p>
            <h2 className="text-4xl font-black text-slate-800">{confirmadas.length}</h2>
            <p className="text-xs font-bold text-slate-500 mt-2">Generaron Pedido de Venta</p>
          </div>

          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-slate-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24}/>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto Confirmado</p>
            <h2 className="text-xl font-black text-slate-800">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-slate-400 mt-2">{confirmadas.length} cotizaciones cerradas</p>
          </div>

          <div className="bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg relative overflow-hidden cursor-pointer" onClick={() => setActiveTab('Activas')}>
            <div className="absolute right-0 top-0 opacity-10"><Activity size={100}/></div>
            <p className="text-xs font-black text-amber-100 uppercase tracking-wider mb-1 relative z-10">Total Cotizaciones</p>
            <h2 className="text-4xl font-black relative z-10">{cotizaciones.length}</h2>
            <p className="text-xs font-bold text-amber-100 mt-2 relative z-10 flex items-center gap-1">
              <TrendingUp size={12}/> {rechazadas.length} rechazadas
            </p>
          </div>
        </div>

        {/* Main Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {/* ROW 1: TABS + VIEW TOGGLE */}
          <div className="flex items-center justify-between pt-1 pb-0">
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['Activas','Confirmadas','Rechazadas','Analisis'] as const).map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab===tab?'bg-indigo-600 text-white shadow-sm':'text-gray-600 hover:text-indigo-700 hover:bg-indigo-50'}`}>
                  {tab}
                  {tab!=='Analisis'&&<span className={`ml-1.5 text-xs font-black ${activeTab===tab?'text-indigo-200':'text-gray-400'}`}>
                    {tab==='Activas'?activas.length:tab==='Confirmadas'?confirmadas.length:rechazadas.length}
                  </span>}
                </button>
              ))}
            </div>
            {activeTab!=='Analisis'&&(
              <div className="flex items-center gap-1 shrink-0 ml-4">
                <button className="p-2 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/></svg>
                </button>
                <button className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="14" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* ROW 2: SEARCH + FILTER + COUNT */}
          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-3 pt-3 pb-1 border-t border-slate-100 mt-3">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[420px] shadow-sm focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
                <Search className="text-slate-400 shrink-0" size={14}/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar COT, cliente, SC..." className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder-slate-400"/>
                {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
              </div>
              <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Filtrar Estado
              </button>
              <span className="text-sm text-slate-400 font-medium">{filtered.length} registros</span>
            </div>
          )}



          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">COT / SC</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Cotizador</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Anticipo</th>
                  <th className="px-6 py-4">Entrega Est.</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-amber-400 mx-auto mb-2"/>
                    <p className="text-slate-400">Cargando cotizaciones...</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center text-slate-500 font-medium">
                    No hay cotizaciones en esta categoria.
                    {activeTab === 'Activas' && (
                      <div className="mt-3">
                        <Link href="/dashboard/ventas/solicitud" className="inline-flex items-center gap-1 bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-amber-700">
                          <ArrowRight size={12}/> Ir a Solicitudes para crear una COT
                        </Link>
                      </div>
                    )}
                  </td></tr>
                ) : filtered.map(cot => {
                  const overdue = isOverdue(cot.fecha_entrega_estimada);
                  const expiring = isExpiringSoon(cot.fecha_entrega_estimada);
                  return (
                    <tr key={cot.id} onClick={() => loadDetail(cot.id)}
                      className={`hover:bg-slate-50/80 transition-colors group cursor-pointer ${selected?.id === cot.id ? 'bg-amber-50/30' : ''}`}>
                      <td className="px-6 py-4">
                        <span className="font-black text-amber-700">{cot.numero}</span>
                        {cot.sc_numero && (
                          <p className="text-[10px] font-bold text-indigo-500 mt-0.5 flex items-center gap-1">
                            SC: {cot.sc_numero}
                          </p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800">{cot.customer_name || '-'}</span>
                        {cot.customer_phone && (
                          <p className="text-[11px] text-slate-400">{cot.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{cot.cotizador || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="font-black text-slate-800">{fCOP(cot.total_cop)}</span>
                        {!(cot.total_cop > 0) && (
                          <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Sin precio</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-600">{fCOP(cot.anticipo_cop)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-bold ${overdue ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-slate-600'}`}>
                          {overdue && <AlertCircle size={11} className="inline mr-1"/>}
                          {fDate(cot.fecha_entrega_estimada)}
                        </span>
                      </td>
                      <td className="px-6 py-4"><Badge estado={cot.estado}/></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); loadDetail(cot.id); }}
                            className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                            <FileText size={12}/> Ver
                          </button>
                          <button className="text-slate-400 hover:text-slate-700 p-1">
                            <MoreVertical size={15}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <div className="border-t border-slate-100 px-6 py-3 flex justify-between items-center bg-slate-50/50">
              <p className="text-xs font-bold text-slate-400">{filtered.length} de {cotizaciones.length} cotizaciones</p>
              <p className="text-xs font-black text-amber-700">
                Valor total activas: {fCOP(activas.reduce((s, c) => s + (c.total_cop || 0), 0))}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── DETAIL PANEL ── */}
      {selected && (
        <>
          <div className="fixed inset-0 z-40 bg-slate-900/30 backdrop-blur-sm" onClick={() => { setSelected(null); setEditMode(false); }}/>

          {/* Full-width panel from sidebar (240px) to right edge */}
          <div className="fixed top-0 bottom-0 right-0 z-40 bg-white shadow-2xl border-l border-slate-200 flex flex-col overflow-hidden"
            style={{ left: '240px' }}>

            {/* Panel Header */}
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-amber-50 to-white flex-shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <h2 className="font-extrabold text-slate-900 text-xl">{selected.numero}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Cotizacion
                    {selected.sc_numero && <span className="ml-2 text-indigo-600">de {selected.sc_numero}</span>}
                  </p>
                </div>
                <Badge estado={selected.estado}/>
              </div>
              <div className="flex items-center gap-2">
                {!editMode ? (
                  <button onClick={() => setEditMode(true)}
                    className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 flex items-center gap-1 hover:bg-slate-50">
                    <Edit2 size={12}/> Editar
                  </button>
                ) : (
                  <>
                    <button onClick={() => setEditMode(false)} className="bg-white border border-slate-200 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-500 hover:bg-slate-50">Cancelar</button>
                    <button onClick={saveEdit} disabled={savingEdit}
                      className="bg-amber-600 text-white px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1 hover:bg-amber-700 disabled:opacity-50">
                      {savingEdit ? <RefreshCw size={12} className="animate-spin"/> : <Save size={12}/>} Guardar
                    </button>
                  </>
                )}
                <button onClick={() => { setSelected(null); setEditMode(false); }}
                  className="p-2 text-slate-400 hover:bg-slate-100 rounded-xl">
                  <X size={18}/>
                </button>
              </div>
            </div>

            {/* Alert: no products */}
            {selectedNoProds && selectedNoNotes && selected.estado !== 'CONFIRMADA' && selected.estado !== 'RECHAZADA' && (
              <div className="bg-amber-50 border-b border-amber-200 px-6 py-2.5 flex items-center gap-3">
                <AlertCircle className="text-amber-600 shrink-0" size={16}/>
                <p className="text-xs font-bold text-amber-700">
                  Esta cotizacion no tiene productos ni notas. Usa "Cotiza" para agregar precios o agrega notas con el producto a cotizar.
                </p>
              </div>
            )}
            {selectedNoProds && !selectedNoNotes && selected.estado === 'BORRADOR' && (
              <div className="bg-blue-50 border-b border-blue-200 px-6 py-2.5 flex items-center gap-3">
                <AlertCircle className="text-blue-500 shrink-0" size={16}/>
                <p className="text-xs font-bold text-blue-700">
                  Sin productos pero hay notas. Revisa las notas y usa "Cotiza" para agregar el precio antes de enviar.
                </p>
              </div>
            )}

            {/* Split pane body */}
            <div className="flex-1 flex overflow-hidden min-h-0">

              {/* LEFT: Info 45% */}
              <div className="w-[45%] border-r border-slate-100 overflow-y-auto p-6 space-y-5">

                {/* Cliente */}
                <div className="bg-slate-50 rounded-2xl p-4">
                  <p className="text-xs font-black text-slate-400 uppercase mb-3">Cliente</p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center text-amber-600 flex-shrink-0">
                        <User size={15}/>
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{selected.customer_name}</p>
                        {selected.customer_id && (
                          <Link href="/dashboard/agenda" className="text-xs text-amber-600 hover:underline flex items-center gap-0.5">
                            Ver perfil <ExternalLink size={9}/>
                          </Link>
                        )}
                      </div>
                    </div>
                    {selected.customer_phone && (
                      <a href={`tel:${selected.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1">
                        <Phone size={13} className="text-slate-400"/> {selected.customer_phone}
                      </a>
                    )}
                    {selected.customer_email && (
                      <a href={`mailto:${selected.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-amber-600 pl-1">
                        <Mail size={13} className="text-slate-400"/> {selected.customer_email}
                      </a>
                    )}
                    {selected.customer_address && (
                      <p className="flex items-start gap-2 text-sm text-slate-600 pl-1">
                        <MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0"/> {selected.customer_address}
                      </p>
                    )}
                  </div>
                </div>

                {/* Detalles editables */}
                <div className="space-y-3">
                  <p className="text-xs font-black text-slate-400 uppercase">Detalles de la Cotizacion</p>

                  {editMode ? (
                    <div className="space-y-3">
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Cotizador</label>
                        <input type="text" value={editForm.cotizador} onChange={e => setEditForm((f: any) => ({ ...f, cotizador: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-200 outline-none"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Direccion de Entrega</label>
                        <input type="text" value={editForm.direccion_entrega} onChange={e => setEditForm((f: any) => ({ ...f, direccion_entrega: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-200 outline-none"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Fecha de Entrega Estimada</label>
                        <input type="date" value={editForm.fecha_entrega_estimada} onChange={e => setEditForm((f: any) => ({ ...f, fecha_entrega_estimada: e.target.value }))}
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-amber-200 outline-none"/>
                      </div>
                      <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">Notas</label>
                        <textarea value={editForm.notas} onChange={e => setEditForm((f: any) => ({ ...f, notas: e.target.value }))}
                          rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 outline-none"/>
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3">
                      {[
                        { label: 'Cotizador', value: selected.cotizador || '-' },
                        { label: 'Modalidad Pago', value: selected.modalidad_pago || '-' },
                        { label: 'Fecha Cotizacion', value: fDate(selected.fecha_cotizacion) },
                        { label: 'Entrega Estimada', value: fDate(selected.fecha_entrega_estimada) },
                      ].map(item => (
                        <div key={item.label} className="bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                          <p className="text-xs text-slate-400 mb-1">{item.label}</p>
                          <p className="font-bold text-sm text-slate-800">{item.value}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Precios */}
                <div className="bg-amber-50 border border-amber-100 rounded-2xl p-4">
                  <p className="text-xs font-black text-amber-700 uppercase mb-3">Valores</p>
                  <div className="space-y-1.5 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Subtotal</span>
                      <span className="font-bold">{fCOP(selected.subtotal_cop)}</span>
                    </div>
                    {selected.descuento_pct > 0 && (
                      <div className="flex justify-between text-red-600">
                        <span>Descuento ({selected.descuento_pct}%)</span>
                        <span className="font-bold">-{fCOP(selected.subtotal_cop * selected.descuento_pct / 100)}</span>
                      </div>
                    )}
                    <div className="flex justify-between font-black text-base border-t border-amber-200 pt-1.5">
                      <span>TOTAL</span>
                      <span className="text-amber-700">{fCOP(selected.total_cop)}</span>
                    </div>
                    {selected.anticipo_cop > 0 && (
                      <>
                        <div className="flex justify-between text-emerald-600 text-xs font-bold">
                          <span>Anticipo</span>
                          <span>{fCOP(selected.anticipo_cop)}</span>
                        </div>
                        <div className="flex justify-between text-slate-600 text-xs font-bold">
                          <span>Saldo</span>
                          <span>{fCOP((selected.total_cop || 0) - (selected.anticipo_cop || 0))}</span>
                        </div>
                      </>
                    )}
                    {selected.trm_rate && (
                      <p className="text-xs text-slate-400 mt-1">TRM: ${Number(selected.trm_rate).toLocaleString('es-CO')}</p>
                    )}
                  </div>
                </div>

                {/* Productos */}
                {(selected.productos || []).length > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos Cotizados</p>
                    <div className="border border-slate-200 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 text-slate-400 uppercase font-black">
                          <tr>
                            <th className="px-3 py-2 text-left">Producto</th>
                            <th className="px-3 py-2 text-right">Qty</th>
                            <th className="px-3 py-2 text-right">Unit</th>
                            <th className="px-3 py-2 text-right">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                          {selected.productos.map((p: any, i: number) => (
                            <tr key={i}>
                              <td className="px-3 py-2 font-medium text-slate-700">{p.product_name}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{p.qty}</td>
                              <td className="px-3 py-2 text-right text-slate-600">{fCOP(p.unit_price_cop || 0)}</td>
                              <td className="px-3 py-2 text-right font-bold text-amber-700">{fCOP(p.qty * (p.unit_price_cop || 0))}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Notas */}
                {selected.notas && !editMode && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-black text-blue-600 uppercase mb-1.5">Notas</p>
                    <p className="text-sm text-blue-900">{selected.notas}</p>
                  </div>
                )}

                {/* Pedidos de Venta vinculados */}
                {(selected.pedidos_venta || []).length > 0 && (
                  <div>
                    <p className="text-xs font-black text-slate-400 uppercase mb-2">Pedidos de Venta Generados</p>
                    {selected.pedidos_venta.map((v: any) => (
                      <Link key={v.id} href="/dashboard/ventas/venta"
                        className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2 hover:bg-emerald-100 transition-colors">
                        <div>
                          <span className="font-bold text-emerald-800">{v.numero}</span>
                          <p className="text-xs text-emerald-600 mt-0.5">{v.estado}</p>
                        </div>
                        <ChevronRight size={15} className="text-emerald-500"/>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Estado change */}
                <div>
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Cambiar Estado</p>
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(ESTADOS)
                      .filter(([k]) => k !== selected.estado && k !== 'CONFIRMADA')
                      .map(([k, v]) => (
                        <button key={k} onClick={() => {
                          if (k === 'RECHAZADA' && !window.confirm(`¿Marcar como Rechazada? La SC vinculada permanecera activa.`)) return;
                          changeEstado(k);
                        }}
                          className="px-3 py-1.5 rounded-lg text-xs font-bold border hover:opacity-80 transition-opacity"
                          style={{ backgroundColor: v.bg, color: v.color, borderColor: v.border }}>
                          {v.label}
                        </button>
                      ))}
                  </div>
                </div>
              </div>

              {/* RIGHT: Tabbed panel 55% */}
              <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
                {/* Tab bar */}
                <div className="border-b border-slate-200 px-4 pt-3 flex gap-1 bg-white flex-shrink-0">
                  {([['acciones','Acciones'],['actividad','Actividad'],['chatter','Chatter']] as const).map(([k,l])=>(
                    <button key={k} onClick={()=>setPanelTab(k)} className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-colors ${panelTab===k?'text-amber-700 border-amber-600 bg-amber-50/50':'text-slate-500 border-transparent hover:text-slate-700'}`}>{l}</button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                  {panelTab==='acciones'&&(
                    <>
                      {/* Primary Actions - HALF WIDTH grid */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-3">Acciones Principales</p>
                        <div className="grid grid-cols-2 gap-2">

                          {/* Calculadora / Re-Cotizar */}
                          <button onClick={()=>{
                            if(Number(selected.total_cop)>0){
                              setCotHistory(h=>[...h,{fecha:new Date().toISOString(),total:selected.total_cop,anticipo:selected.anticipo_cop,productos:selected.productos}]);
                            }
                            setShowCalc(true);
                          }}
                            className={`col-span-2 ${Number(selected.total_cop)>0?'bg-orange-500 hover:bg-orange-600':'bg-amber-600 hover:bg-amber-700'} text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md transition-colors`}>
                            {Number(selected.total_cop)>0?<RotateCcw size={15}/>:<Calculator size={15}/>}
                            {Number(selected.total_cop)>0?'Re-Cotizar — Actualizar Precios':'Cotiza — Calcular Precios'}
                          </button>

                          {/* Enviar */}
                          {(selected.estado === 'BORRADOR' || selected.estado === 'ENVIADA') && (
                            <button onClick={enviarCotizacion} disabled={saving}
                              className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-colors">
                              {saving ? <RefreshCw size={14} className="animate-spin"/> : <Send size={14}/>}
                              {selected.estado === 'ENVIADA' ? 'Re-enviar al Cliente' : 'Enviar al Cliente'}
                            </button>
                          )}

                          {/* Confirmar */}
                          {(selected.estado === 'ENVIADA' || selected.estado === 'PENDIENTE_CONFIRMACION' || selected.estado === 'BORRADOR') && selected.estado !== 'CONFIRMADA' && (
                            <button onClick={confirmar} disabled={confirming}
                              className="col-span-2 bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md disabled:opacity-50 transition-colors">
                              {confirming ? <RefreshCw size={14} className="animate-spin"/> : <CheckCircle2 size={14}/>}
                              Confirmar + Crear Pedido de Venta
                            </button>
                          )}

                          {/* Ver VEN */}
                          {(selected.pedidos_venta || []).length > 0 && (
                            <Link href="/dashboard/ventas/venta"
                              className="col-span-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-emerald-100 transition-colors">
                              <ArrowRight size={14}/> Ver Pedido de Venta
                            </Link>
                          )}

                          {/* Eliminar */}
                          {selected.estado !== 'CONFIRMADA' && (
                            <button onClick={() => setShowDelete(true)}
                              className="flex items-center justify-center gap-2 text-red-600 hover:text-red-800 text-xs font-bold border border-red-200 px-3 py-2.5 rounded-xl hover:bg-red-50 transition-colors">
                              <Trash2 size={13}/> Eliminar
                            </button>
                          )}
                        </div>

                        {/* History of re-cotizaciones */}
                        {cotHistory.length>0&&(
                          <div className="mt-3 border border-orange-200 rounded-xl bg-orange-50 p-3">
                            <p className="text-xs font-black text-orange-700 uppercase mb-2">Historial de Re-Cotizaciones</p>
                            {cotHistory.map((h:any,i:number)=>(
                              <div key={i} className="bg-white rounded-lg p-2 mb-1 flex justify-between text-xs">
                                <span className="text-slate-600">Re-Cotizacion #{i+1}</span>
                                <span className="font-bold text-orange-700">{new Intl.NumberFormat('es-CO',{style:'currency',currency:'COP',minimumFractionDigits:0}).format(h.total)}</span>
                                <span className="text-slate-400">{new Date(h.fecha).toLocaleDateString('es-CO')}</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Contactar */}
                      <div>
                        <p className="text-xs font-black text-slate-400 uppercase mb-3">Contactar al Cliente</p>
                        <div className="grid grid-cols-3 gap-2">
                          {selected.customer_phone && (
                            <a href={`https://wa.me/57${selected.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer"
                              className="flex flex-col items-center gap-1 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100 transition-colors">
                              <MessageCircle size={16}/>WhatsApp
                            </a>
                          )}
                          {selected.customer_phone && (
                            <a href={`tel:${selected.customer_phone}`}
                              className="flex flex-col items-center gap-1 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100 transition-colors">
                              <Phone size={16}/>Llamar
                            </a>
                          )}
                          {selected.customer_email && (
                            <a href={`mailto:${selected.customer_email}?subject=Cotizacion ${selected.numero}`}
                              className="flex flex-col items-center gap-1 py-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100 transition-colors">
                              <Mail size={16}/>Email
                            </a>
                          )}
                        </div>
                      </div>
                    </>
                  )}

                  {panelTab==='actividad'&&(
                    <div>
                      <p className="text-xs font-black text-slate-400 uppercase mb-3">Historial de Actividad</p>
                      {(selected.actividades || []).length === 0 ? (
                        <p className="text-xs text-slate-400 italic">Sin actividad registrada</p>
                      ) : (
                        <div className="space-y-4 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                          {[...(selected.actividades || [])].reverse().filter((a:any)=>a.action!=='CHATTER').map((a: any) => (
                            <div key={a.id} className="flex gap-4 pl-7 relative">
                              <ActionDot action={a.action}/>
                              <div className="flex-1 bg-white border border-slate-100 rounded-xl p-3 shadow-sm">
                                <p className="text-sm font-bold text-slate-700">{a.description}</p>
                                {a.old_estado && a.new_estado && (
                                  <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                                    <Badge estado={a.old_estado}/>
                                    <ArrowRight size={10} className="text-slate-300"/>
                                    <Badge estado={a.new_estado}/>
                                  </p>
                                )}
                                <p className="text-xs text-slate-400 mt-1">
                                  {fDate(a.created_at)} a las {fTime(a.created_at)}
                                  {a.user_name && <span className="ml-2 font-medium">• {a.user_name}</span>}
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {panelTab==='chatter'&&(
                    <div className="flex flex-col h-full">
                      <div className="flex-1 space-y-3 min-h-[200px]">
                        {(selected.actividades||[]).filter((a:any)=>a.action==='CHATTER').map((a:any)=>(
                          <div key={a.id} className="bg-slate-100 rounded-xl p-3 max-w-[85%]">
                            <p className="text-sm text-slate-800">{a.description}</p>
                            <p className="text-xs text-slate-400 mt-1">{a.user_name} - {fDate(a.created_at)}</p>
                          </div>
                        ))}
                        {!(selected.actividades||[]).some((a:any)=>a.action==='CHATTER')&&(
                          <p className="text-xs text-slate-400 italic text-center py-8">Sin mensajes. Escribe abajo para chatear con el cliente.</p>
                        )}
                      </div>
                      <div className="border-t border-slate-100 pt-3 mt-3">
                        <textarea value={chatterInput} onChange={e=>setChatterInput(e.target.value)} rows={2} placeholder="Escribe un mensaje..." className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 outline-none mb-2"/>
                        <div className="flex gap-2">
                          <button onClick={async()=>{
                            if(!selected.customer_phone) return;
                            const text=encodeURIComponent(chatterInput||`Hola, te contactamos sobre tu cotizacion ${selected.numero}`);
                            window.open(`https://wa.me/57${selected.customer_phone.replace(/\D/g,'')}?text=${text}`,'_blank');
                            if(chatterInput){
                              try{await apiFetch(`/ventas/cotizaciones/${selected.id}/actividad`,{method:'POST',body:JSON.stringify({action:'CHATTER',description:chatterInput,user_name:currentUser})});}catch{}
                              setChatterInput('');
                              await loadDetail(selected.id);
                            }
                          }} disabled={!selected.customer_phone} className="flex-1 bg-green-500 hover:bg-green-600 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50">
                            <MessageCircle size={12}/>WhatsApp
                          </button>
                          <button onClick={async()=>{
                            if(!chatterInput.trim()||chatterSending) return;
                            setChatterSending(true);
                            try{await apiFetch(`/ventas/cotizaciones/${selected.id}/actividad`,{method:'POST',body:JSON.stringify({action:'CHATTER',description:chatterInput,user_name:currentUser})});setChatterInput('');await loadDetail(selected.id);}catch{}
                            setChatterSending(false);
                          }} disabled={!chatterInput.trim()||chatterSending} className="flex-1 bg-amber-600 hover:bg-amber-700 text-white py-2 rounded-xl font-bold text-xs flex items-center justify-center gap-1 disabled:opacity-50">
                            {chatterSending?<RefreshCw size={12} className="animate-spin"/>:<Send size={12}/>}Registrar
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Modals */}
          {showCalc && <CalculadorModal cot={selected} onSave={onCalcSave} onClose={() => setShowCalc(false)}/>}
          {showDelete && <DeleteConfirm cot={selected} onConfirm={deleteCot} onCancel={() => setShowDelete(false)}/>}
        </>
      )}
    </div>
  );
}
