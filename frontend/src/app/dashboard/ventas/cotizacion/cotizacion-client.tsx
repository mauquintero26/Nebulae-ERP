'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  FileText, CheckCircle2, DollarSign, Activity,
  Search, X, RefreshCw, AlertCircle, MoreVertical, Plus,
  Phone, Mail, ShieldAlert,
  Calculator, Send, Trash2, Save, ArrowRight,
  MessageCircle, RotateCcw
} from 'lucide-react';

import { apiFetch, API_URL } from '@/lib/api';
import { computeMarginPrice, MARGIN_PCT_CAP } from '@/lib/pricing';
import { SubNav, PageHeader, StatCard, Modal, Button, EmptyState } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';

export const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BORRADOR:              { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ENVIADA:               { label: 'Enviada al cliente',    color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  PENDIENTE_CONFIRMACION:{ label: 'Esp. confirmacion',     color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMADA:            { label: 'Confirmada',            color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  RECHAZADA:             { label: 'Rechazada',             color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  VENCIDA:               { label: 'Vencida',               color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};

// Mapa de estados propio de Cotizacion (rico, varios estados reales del negocio) --
// se mantiene como pastilla a medida en vez del Badge generico de tono semantico,
// pero con la misma forma (rounded-full, border, text-xs font-bold, px-2.5 py-1).
export function EstadoBadge({ estado }: { estado: string }) {
  const cfg = ESTADOS[estado] || { label: estado, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

export const fDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const fTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
export const fCOP = (v: number | null | undefined) => {
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

// â”€â”€ ActionIcon for activity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ActionDot({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATED: '#6366f1', ESTADO_CHANGED: '#f59e0b', SENT: '#10b981',
    CONFIRMED: '#059669', REJECTED: '#ef4444', UPDATED: '#3b82f6',
  };
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 flex-shrink-0"
    style={{ backgroundColor: colors[action] || '#94a3b8', borderColor: 'white' }} />;
}

// â”€â”€ Calculator Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Aviso de producto no encontrado en catalogo, con fallback a texto libre (es_libre)
function ProductoNoEncontradoAviso({
  nombre, onAgregarComoComentario, onCancelar
}: { nombre: string; onAgregarComoComentario: () => void; onCancelar: () => void }) {
  return (
    <div className="absolute top-full left-0 right-0 z-50 bg-amber-50 border border-amber-200 rounded-xl shadow-xl mt-1 p-3 min-w-[260px]">
      <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1">
        <AlertCircle size={12}/> Producto no encontrado en el catalogo
      </p>
      <p className="text-xs text-amber-700 mb-2">
        "{nombre}" no existe en el catalogo. Puedes agregarlo como texto libre sin bloquear la cotizacion.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 px-2 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-bold hover:bg-amber-100">
          Cancelar
        </button>
        <button type="button" onClick={onAgregarComoComentario}
          className="flex-1 px-2 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">
          Agregar como comentario
        </button>
      </div>
      {/* Cuando exista el asistente de creacion de producto de la spec Catalogo Configurable,
          aqui se agregara un enlace directo para crear el producto en el catalogo. */}
    </div>
  );
}

// Autocompletar producto de catalogo, mismo patron de busqueda con debounce que ProductSearch en solicitud-client.tsx
function ProductoAutocomplete({
  value, esLibre, skuId, onTyping, onSelect, onFreeText
}: {
  value: string;
  esLibre?: boolean;
  skuId?: number | null;
  onTyping: (v: string) => void;
  onSelect: (p: any) => void;
  onFreeText: (nombre: string) => void;
}) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [showAviso, setShowAviso] = useState(false);
  const [pending, setPending] = useState('');
  const timer = useRef<any>(null);

  function handle(v: string) {
    onTyping(v);
    setShowAviso(false); setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        setResults(list); setOpen(list.length > 0);
        if (list.length === 0 && v.trim().length > 2) { setPending(v); setShowAviso(true); }
      } catch { setResults([]); }
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={e => handle(e.target.value)}
        placeholder="Buscar producto en catalogo..."
        className="w-full border-0 bg-transparent outline-none font-medium text-slate-700 placeholder-slate-300" />
      {esLibre && value && (
        <p className="text-[9px] font-black text-amber-600 uppercase tracking-wide mt-0.5">Texto libre</p>
      )}
      {!esLibre && skuId && (
        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wide mt-0.5">Vinculado a catalogo</p>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto min-w-[240px]">
          {results.map((p: any) => (
            <button key={p.id || p.product_name} type="button"
              onClick={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-800">{p.product_name || p.name}</span>
              {p.sku && <span className="ml-2 text-xs text-slate-400">SKU:{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
      {showAviso && (
        <ProductoNoEncontradoAviso
          nombre={pending}
          onAgregarComoComentario={() => { onFreeText(pending); setShowAviso(false); }}
          onCancelar={() => { onTyping(''); setShowAviso(false); setPending(''); }}
        />
      )}
    </div>
  );
}

export function CalculadorModal({
  cot, onSave, onClose
}: { cot: any; onSave: (data: any) => void; onClose: () => void }) {
  const [trm, setTrm] = useState(cot.trm_rate || 4200);
  const [productos, setProductos] = useState<any[]>(
    (cot.productos || []).length > 0
      ? cot.productos.map((p: any) => ({ ...p, cost_usd: p.cost_usd || 0, margen_pct: p.margen_pct || 30, flete_usd: p.flete_usd || 0, es_libre: !!p.es_libre, _rowId: crypto.randomUUID() }))
      : [{ product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0, es_libre: false, _rowId: crypto.randomUUID() }]
  );
  const [descuento, setDescuento] = useState(cot.descuento_pct || 0);
  const [fechaEntrega, setFechaEntrega] = useState(cot.fecha_entrega_estimada ? cot.fecha_entrega_estimada.split('T')[0] : '');
  const [notas, setNotas] = useState(cot.notas || '');
  const [anticipo, setAnticipo] = useState<string | number>(cot.anticipo_cop ?? 0);
  const [error, setError] = useState('');

  const addProd = () => setProductos(p => [...p, { product_name: '', qty: 1, cost_usd: 0, margen_pct: 30, flete_usd: 0, es_libre: false, _rowId: crypto.randomUUID() }]);
  const removeProd = (i: number) => setProductos(p => p.filter((_, idx) => idx !== i));
  const setProdFields = (i: number, patch: any) =>
    setProductos(p => p.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateProd = (i: number, k: string, v: any) => setProdFields(i, { [k]: v });

  const computedProd = productos.map(p => {
    const costo_cop = (Number(p.cost_usd) || 0) * Number(trm);
    const flete_cop = (Number(p.flete_usd) || 0) * Number(trm);
    const costo_total = (costo_cop + flete_cop) * (Number(p.qty) || 1);
    const { totalCop, unitPriceCop, margenPct } = computeMarginPrice(costo_total, p.margen_pct, Number(p.qty) || 1);
    return { ...p, margen_pct: margenPct, price_cop_unit: unitPriceCop, total_cop: totalCop };
  });

  const subtotal = computedProd.reduce((s, p) => s + p.total_cop, 0);
  const descTotal = subtotal * (Number(descuento) || 0) / 100;
  const total = subtotal - descTotal;
  const numAnticipo = anticipo === '' ? 0 : Number(anticipo);
  const anticipo_cop = Math.min(Math.max(0, isNaN(numAnticipo) ? 0 : numAnticipo), total);
  const saldo = Math.max(0, total - anticipo_cop);

  const handleSave = () => {
    if (computedProd.length === 0 || computedProd.some(p => !p.total_cop || p.total_cop <= 0)) {
      setError('Cada producto necesita un costo mayor a $0 antes de guardar la cotizacion.');
      return;
    }
    if (total <= 0) {
      setError('El total de la cotizacion debe ser mayor a $0.');
      return;
    }
    setError('');
    const prods = computedProd.map(p => ({
      product_name: p.product_name,
      sku_id: p.sku_id || null,
      qty: Number(p.qty),
      cost_usd: Number(p.cost_usd),
      flete_usd: Number(p.flete_usd),
      margen_pct: Number(p.margen_pct),
      unit_price_cop: p.price_cop_unit,
      total_cop: p.total_cop,
      es_libre: !!p.es_libre,
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
    <Modal title="Calculadora de Cotización" subtitle={`${cot.numero} — ${cot.customer_name}`}
      icon={Calculator} color="amber" maxWidth="3xl" onClose={onClose}
      footer={(
        <div className="w-full">
          {error && (
            <p className="text-xs text-red-600 font-bold mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" onClick={onClose}>Cancelar</Button>
            <Button color="amber" icon={Save} onClick={handleSave}>Guardar Cotización</Button>
          </div>
        </div>
      )}>
        <div className="space-y-5">
          {/* TRM */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">TRM (USD → COP)</label>
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
                    <tr key={p._rowId}>
                      <td className="px-3 py-2">
                        <ProductoAutocomplete
                          value={p.product_name}
                          esLibre={p.es_libre}
                          skuId={p.sku_id}
                          onTyping={v => setProdFields(i, { product_name: v, sku_id: null, es_libre: false })}
                          onSelect={sel => setProdFields(i, { product_name: sel.product_name || sel.name, sku_id: sel.id, es_libre: false })}
                          onFreeText={nombre => setProdFields(i, { product_name: nombre, sku_id: null, es_libre: true })}
                        />
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
                        <input type="number" min="0" max={MARGIN_PCT_CAP} value={p.margen_pct} onChange={e => updateProd(i, 'margen_pct', Math.min(MARGIN_PCT_CAP, Math.max(0, Number(e.target.value) || 0)))}
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
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-black text-slate-500 uppercase block">Anticipo COP</label>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setAnticipo(Math.round(total * 0.6))} className="text-[10px] px-1.5 py-0.5 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded font-bold">60%</button>
                    <button type="button" onClick={() => setAnticipo(total)} className="text-[10px] px-1.5 py-0.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded font-bold">100%</button>
                    <button type="button" onClick={() => setAnticipo(0)} className="text-[10px] px-1.5 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded font-bold">0%</button>
                  </div>
                </div>
                <input type="number" min="0" max={total} value={anticipo} onChange={e => setAnticipo(e.target.value)}
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
    </Modal>
  );
}

// â”€â”€ Delete Confirm Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function DeleteConfirm({ cot, onConfirm, onCancel }: { cot: any; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title="Eliminar Cotización" icon={Trash2} color="red" maxWidth="md" onClose={onCancel}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Sí, Eliminar</Button>
        </>
      )}>
      <p className="text-slate-500 text-sm">
        ¿Estás seguro de eliminar <strong>{cot.numero}</strong>?
      </p>
      <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
        La Solicitud de Cliente vinculada (<strong>{cot.sc_numero}</strong>) no será eliminada y podrá generar una nueva cotización.
      </p>
    </Modal>
  );
}

export function PropagarPvenConfirm({ pven, totalAnterior, totalNuevo, onConfirm, onCancel, saving }: { pven: any; totalAnterior: number; totalNuevo: number; onConfirm: () => void; onCancel: () => void; saving: boolean }) {
  const anticipoYaPagado = Number(pven?.anticipo_cop || 0);
  const creditoAFavor = anticipoYaPagado - totalNuevo;
  return (
    <Modal title="Actualizar Pedido de Venta" icon={RotateCcw} color="indigo" maxWidth="md" onClose={onCancel}
      footer={(
        <div className="flex flex-col w-full gap-2">
          <Button color="indigo" disabled={saving} onClick={onConfirm}>Sí, actualizar también el pedido</Button>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Solo guardar la cotización</Button>
        </div>
      )}>
      <p className="text-slate-500 text-sm">
        Esta cotización ya tiene el pedido <strong>{pven?.numero}</strong> generado. Los nuevos precios no se
        reflejan allí automáticamente.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center gap-3 text-sm">
        <span className="text-slate-400 line-through">{fCOP(totalAnterior)}</span>
        <ArrowRight size={14} className="text-slate-400"/>
        <span className="font-black text-indigo-700">{fCOP(totalNuevo)}</span>
      </div>
      {creditoAFavor > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <p className="font-bold mb-1">⚠ El cliente ya pagó {fCOP(anticipoYaPagado)}, más que el nuevo total.</p>
          <p>Al continuar, el pedido quedará con un crédito a favor del cliente de <strong>{fCOP(creditoAFavor)}</strong> (saldo negativo). Esto no genera el reembolso automáticamente -- coordina con el cliente o finanzas por separado.</p>
        </div>
      )}
      <p className="text-[11px] text-slate-400 text-center">
        El anticipo y los pagos ya registrados en el pedido no se modifican, solo productos y precios.
      </p>
    </Modal>
  );
}

export function ChannelModal({ selectedChannel, onSelectChannel, onConfirm, onCancel, saving, customerHasPhone }: { selectedChannel: 'WhatsApp'|'Email'|'Otro'|null; onSelectChannel: (ch: 'WhatsApp'|'Email'|'Otro') => void; onConfirm: () => void; onCancel: () => void; saving: boolean; customerHasPhone: boolean }) {
  return (
    <Modal title="Seleccionar Canal de Envío" subtitle="¿Por cuál canal deseas enviar la cotización?"
      icon={Send} color="blue" maxWidth="md" onClose={onCancel}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</Button>
          <Button color="blue" disabled={!selectedChannel || saving} onClick={onConfirm}>Enviar</Button>
        </>
      )}>
      <div className="space-y-2">
        <button
          onClick={() => onSelectChannel('WhatsApp')}
          disabled={!customerHasPhone}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'WhatsApp'
              ? 'border-green-500 bg-green-50 text-green-700'
              : customerHasPhone
              ? 'border-slate-300 bg-white text-slate-700 hover:border-green-300'
              : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
          }`}>
          <Phone size={18}/>
          <span>WhatsApp{!customerHasPhone ? ' (sin telefono)' : ''}</span>
        </button>
        <button
          onClick={() => onSelectChannel('Email')}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'Email'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'
          }`}>
          <Mail size={18}/>
          <span>Email</span>
        </button>
        <button
          onClick={() => onSelectChannel('Otro')}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'Otro'
              ? 'border-slate-500 bg-slate-50 text-slate-700'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
          }`}>
          <MessageCircle size={18}/>
          <span>Otro</span>
        </button>
      </div>
    </Modal>
  );
}

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CotizacionClient() {
  const router = useRouter();
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Activas');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [alertDias, setAlertDias] = useState(2);

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

  const searchParams = useSearchParams();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id= (Hub, SC, PVEN):
  // se redirige a la pagina canonica de detalle en vez de duplicar la vista aqui.
  useEffect(() => {
    const idParam = searchParams?.get('id');
    if (idParam) { const numId = Number(idParam); if (!isNaN(numId)) router.replace(`/dashboard/ventas/cotizacion/${numId}`); }
  }, [searchParams, router]);

  // Derived stats
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

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-module nav */}
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/cotizacion" color="amber" hub={{ href: '/dashboard/ventas' }} />

      {/* Alert Banner */}
      {(sinCalc > 0 || vencenPronto > 0 || sinAtender > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-amber-800">ATENCIÓN — Cotizaciones requieren acción (Alerta {alertDias} días)</h4>
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
        <PageHeader
          icon={FileText} color="amber"
          title="Cotizaciones"
          subtitle="COT-YYYY#### — Genera precios, envía al cliente y confirma para crear Pedido de Venta."
          actions={(
            <div className="flex gap-3">
              <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar
              </button>
              <Link href="/dashboard/ventas/solicitud" className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
                <Plus size={16}/> Nueva desde SC
              </Link>
            </div>
          )}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={FileText} color="amber" label="Activas" value={activas.length}
            hint={sinCalc > 0 ? `${sinCalc} sin precio` : 'Todas calculadas'}
            onClick={() => setActiveTab('Activas')} />

          <StatCard icon={CheckCircle2} color="emerald" label="Confirmadas" value={confirmadas.length}
            hint="Generaron Pedido de Venta"
            onClick={() => setActiveTab('Confirmadas')} />

          {/* Sin acento neutro/gris disponible en AccentColor -- se deja a medida para
              conservar la misma paleta (slate) en vez de forzar un color del hub. */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-slate-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24}/>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto Confirmado</p>
            <h2 className="text-xl font-black text-slate-800">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-slate-400 mt-2">{confirmadas.length} cotizaciones cerradas</p>
          </div>

          <StatCard icon={Activity} color="amber" variant="gradient" label="Total Cotizaciones" value={cotizaciones.length}
            hint={`${rechazadas.length} rechazadas`}
            onClick={() => setActiveTab('Activas')} />
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
                  <tr><td colSpan={8}>
                    <EmptyState icon={FileText} message="No hay cotizaciones en esta categoría." />
                    {activeTab === 'Activas' && (
                      <div className="text-center pb-8 -mt-6">
                        <Link href="/dashboard/ventas/solicitud" className="inline-flex items-center gap-1 bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-amber-700">
                          <ArrowRight size={12}/> Ir a Solicitudes para crear una COT
                        </Link>
                      </div>
                    )}
                  </td></tr>
                ) : filtered.slice((currentPage-1)*pageSize, currentPage*pageSize).map(cot => {
                  const overdue = isOverdue(cot.fecha_entrega_estimada);
                  const expiring = isExpiringSoon(cot.fecha_entrega_estimada);
                  return (
                    <tr key={cot.id} onClick={() => router.push(`/dashboard/ventas/cotizacion/${cot.id}`)}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
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
                      <td className="px-6 py-4"><EstadoBadge estado={cot.estado}/></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); router.push(`/dashboard/ventas/cotizacion/${cot.id}`); }}
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

          {filtered.length > 0 && activeTab !== 'Analisis' && (
            <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">{filtered.length} registros</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none focus:ring-1 focus:ring-amber-200">
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                <p className="text-xs font-black text-amber-700">
                  Total activas: {fCOP(activas.reduce((s, c) => s + (c.total_cop || 0), 0))}
                </p>
              </div>
              {Math.ceil(filtered.length/pageSize)>1&&(
                <div className="flex items-center gap-1">
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
                  {Array.from({length:Math.min(5,Math.ceil(filtered.length/pageSize))},(_,i)=>{
                    const tp=Math.ceil(filtered.length/pageSize);let page=i+1;
                    if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                    return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-amber-600 text-white border-amber-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
                  })}
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(Math.ceil(filtered.length/pageSize))} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

