"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, DollarSign, MessageCircle, Phone, Mail, CheckCircle2, Circle,
  ShoppingCart, RefreshCw, AlertCircle, ListChecks, ExternalLink, Send,
  Activity, FileText,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';

const fCOP  = (v: any) => { const n = Number(v) || 0; return '$' + n.toLocaleString('es-CO'); };
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const VEN_ESTADOS: Record<string, { bg: string; text: string; border: string; label: string }> = {
  PENDIENTE_COMPRA: { bg: 'bg-orange-100',  text: 'text-orange-700',  border: 'border-orange-200',  label: 'Pend. Compra' },
  EN_PROCESO:       { bg: 'bg-purple-100',  text: 'text-purple-700',  border: 'border-purple-200',  label: 'En Proceso' },
  LISTO_ENTREGA:    { bg: 'bg-teal-100',    text: 'text-teal-700',    border: 'border-teal-200',    label: 'Listo Entrega' },
  ENTREGADO:        { bg: 'bg-emerald-100', text: 'text-emerald-700', border: 'border-emerald-200', label: 'Entregado' },
  FACTURADO:        { bg: 'bg-green-100',   text: 'text-green-700',   border: 'border-green-200',   label: 'Facturado' },
  CANCELADO:        { bg: 'bg-red-100',     text: 'text-red-700',     border: 'border-red-200',     label: 'Cancelado' },
};
const STEPS: { key: string; label: string }[] = [
  { key: 'PENDIENTE_COMPRA', label: 'Pend. Compra' },
  { key: 'EN_PROCESO',       label: 'En Proceso' },
  { key: 'LISTO_ENTREGA',    label: 'Listo Entrega' },
  { key: 'ENTREGADO',        label: 'Entregado' },
  { key: 'FACTURADO',        label: 'Facturado' },
];

const ACTIVITY_STYLE: Record<string, string> = {
  CREATED: '#6366f1', UPDATED: '#3b82f6', ESTADO_CHANGED: '#f59e0b',
  SENT: '#10b981', CONFIRMED: '#059669', REJECTED: '#ef4444',
};

export default function PedidoVentaDetallePage() {
  const params = useParams();

  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [creatingPxp, setCreatingPxp] = useState(false);
  const [nota, setNota] = useState('');
  const [sendingNota, setSendingNota] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  const loadPedido = useCallback(async () => {
    if (!params.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const raw = await apiFetch(`/ventas/pedidos/${params.id}`);
      setPedido(raw?.data ?? raw);
    } catch (err: any) {
      setLoadError(err.message || 'No se pudo cargar el pedido de venta');
    }
    setLoading(false);
  }, [params.id]);

  useEffect(() => { loadPedido(); }, [loadPedido]);

  // Resizable Right Pane Logic (mismo patron que cotizacion/[id]/page.tsx)
  const [rightWidth, setRightWidth] = useState(400);
  const isDragging = useRef(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    isDragging.current = true;
    startX.current = e.clientX;
    startWidth.current = rightWidth;
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };
  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging.current) return;
    const delta = startX.current - e.clientX;
    setRightWidth(Math.min(Math.max(300, startWidth.current + delta), 800));
  };
  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };
  useEffect(() => () => {
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
  }, []);

  const estadoActual = pedido?.estado || 'PENDIENTE_COMPRA';
  const estadoCfg = VEN_ESTADOS[estadoActual] || { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200', label: estadoActual };
  const stepIndex = STEPS.findIndex(s => s.key === estadoActual);

  async function handleCrearPxp() {
    if (!pedido?.id) return;
    setCreatingPxp(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}/crear-pxp`, {
        method: 'POST',
        body: JSON.stringify({ monto_anticipo: pedido?.saldo_cop || 0 }),
      });
      await loadPedido();
    } catch (err: any) {
      alert('Error al crear PXP: ' + err.message);
    }
    setCreatingPxp(false);
  }

  async function handleRegistrarNota() {
    if (!pedido?.id || !nota.trim()) return;
    setSendingNota(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}/actividad`, {
        method: 'POST',
        body: JSON.stringify({ action: 'UPDATED', description: nota, user_name: currentUser }),
      });
      setNota('');
      await loadPedido();
    } catch (err: any) {
      alert('Error al registrar nota: ' + err.message);
    }
    setSendingNota(false);
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-indigo-600" size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white">
        <AlertCircle className="text-rose-500" size={32} />
        <p className="text-slate-600 font-medium">{loadError}</p>
        <Link href="/dashboard/ventas/venta" className="text-indigo-600 font-bold text-sm hover:underline">
          Volver al listado de pedidos
        </Link>
      </div>
    );
  }

  const productos = pedido?.productos || [];
  const actividades = (pedido?.actividades || []).filter((a: any) => a.action !== 'CHATTER');

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/venta" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">{pedido?.numero || String(params.id || '').toUpperCase()}</h1>
              <span className={`px-3 py-1 rounded-full text-xs font-bold border ${estadoCfg.bg} ${estadoCfg.text} ${estadoCfg.border}`}>
                {estadoCfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{pedido?.customer_name} &middot; {fDate(pedido?.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!pedido?.pxp_id && (
            <button onClick={handleCrearPxp} disabled={creatingPxp} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
              {creatingPxp ? <RefreshCw size={16} className="animate-spin" /> : <DollarSign size={16} />} Crear PXP
            </button>
          )}
          {pedido?.pxp_numero && (
            <span className="flex items-center gap-1.5 px-5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-sm">
              <CheckCircle2 size={16} /> PXP: {pedido.pxp_numero}
            </span>
          )}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Info del Pedido */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {/* Status Tracker */}
          {estadoActual !== 'CANCELADO' && (
            <div className="bg-white p-6 border-b border-slate-100 mb-8 flex justify-between relative">
              <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0" />
              <div className="absolute top-1/2 left-10 h-1 bg-emerald-500 transition-all duration-500 z-0"
                style={{ right: `${Math.max(0, 100 - (stepIndex / (STEPS.length - 1)) * 100)}%`, minWidth: stepIndex > 0 ? undefined : 0 }} />
              {STEPS.map((s, i) => (
                <div key={s.key} className="relative z-10 flex flex-col items-center gap-2">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-md transition-colors ${
                    i < stepIndex ? 'bg-emerald-500 text-white shadow-emerald-200'
                    : i === stepIndex ? 'bg-indigo-600 text-white shadow-indigo-200'
                    : 'bg-white border-2 border-slate-200 text-slate-300'
                  }`}>
                    {i < stepIndex ? <CheckCircle2 size={16} /> : <Circle size={16} fill={i === stepIndex ? 'currentColor' : 'transparent'} />}
                  </div>
                  <span className={`text-xs font-bold ${i <= stepIndex ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {estadoActual === 'CANCELADO' && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8 flex items-center gap-3">
              <AlertCircle className="text-red-500" size={20} />
              <p className="text-sm font-bold text-red-700">Este pedido de venta fue cancelado.</p>
            </div>
          )}

          <div className="max-w-5xl mx-auto space-y-8">

            {/* Cliente + Origen + Entrega */}
            <div className="grid grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                  {pedido?.customer_name || 'Sin cliente asignado'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Origen</label>
                {pedido?.cot_id ? (
                  <Link href={`/dashboard/ventas/cotizacion?id=${pedido.cot_id}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
                    {pedido.cot_numero || `COT-${pedido.cot_id}`}
                  </Link>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-400">Sin cotizacion de origen</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Entrega Estimada</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                  {fDate(pedido?.fecha_entrega_estimada)}
                </div>
              </div>
            </div>

            {/* Resumen Financiero */}
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <DollarSign className="text-emerald-600" size={20} /> Resumen Financiero
              </h3>
              <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
                <div className="flex justify-between items-end mb-4">
                  <div>
                    <p className="text-slate-400 text-xs mb-1">Total a Pagar</p>
                    <p className="text-3xl font-black text-slate-900">{fCOP(pedido?.total_cop)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-slate-400 text-xs mb-1">Saldo Pendiente</p>
                    <p className="text-xl font-black text-red-600">{fCOP(pedido?.saldo_cop)}</p>
                  </div>
                </div>
                <div className="w-full bg-slate-200 rounded-full h-2.5 mb-2 overflow-hidden">
                  <div className="bg-emerald-500 h-2.5 rounded-full transition-all" style={{ width: `${Math.min(100, ((pedido?.anticipo_cop || 0) / (pedido?.total_cop || 1)) * 100)}%` }} />
                </div>
                <p className="text-xs text-slate-400 text-right">Anticipo: <span className="text-emerald-600 font-bold">{fCOP(pedido?.anticipo_cop)}</span></p>
              </div>
            </div>

            {/* Productos */}
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="text-indigo-600" size={20} /> Productos
              </h3>
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-24 text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36">P. Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productos.length === 0 && (
                      <tr><td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400 italic">Sin productos registrados.</td></tr>
                    )}
                    {productos.map((p: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-800 text-sm">{p.product_name || p.descripcion || p.producto_nombre || 'Producto sin nombre'}</td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-700">{p.qty ?? p.cantidad ?? 0}</td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-700">{fCOP(p.unit_price_cop ?? p.precio_unitario)}</td>
                        <td className="px-4 py-3 font-black text-slate-800 text-right">{fCOP(p.total_cop ?? p.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Compra vinculada -- 3 estados derivados, igual que en el panel de Pedido de Venta */}
            {pedido?.pec_numero ? (
              <div className="rounded-2xl border border-purple-200 bg-purple-50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 size={18} className="text-purple-600" />
                  <h3 className="text-sm font-black text-purple-800 uppercase tracking-wide">Pedido de Compra Creado</h3>
                </div>
                <div className="mt-2 space-y-1">
                  {productos.map((p: any, i: number) => (
                    <p key={i} className="text-xs text-purple-700">&middot; {p.product_name || p.descripcion || p.producto_nombre || 'Producto'} <span className="text-purple-400">&times;{p.qty ?? p.cantidad ?? 1}</span></p>
                  ))}
                </div>
                <Link href="/dashboard/compras/pedidos" className="mt-3 inline-flex items-center gap-1 text-xs text-purple-700 font-bold hover:underline">
                  Ir a {pedido.pec_numero} <ExternalLink size={11} />
                </Link>
              </div>
            ) : (pedido?.lista_compras_items || []).length > 0 ? (
              <div className="rounded-2xl border border-indigo-200 bg-indigo-50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ListChecks size={18} className="text-indigo-600" />
                  <h3 className="text-sm font-black text-indigo-800 uppercase tracking-wide">Agregado a Lista de Compras</h3>
                </div>
                <div className="mt-2 space-y-1">
                  {pedido.lista_compras_items.map((it: any) => (
                    <p key={it.id} className="text-xs text-indigo-700">&middot; {it.producto} <span className="text-indigo-400">&times;{it.cantidad}</span></p>
                  ))}
                </div>
                <Link href="/dashboard/compras/lista-compras" className="mt-3 inline-flex items-center gap-1 text-xs text-indigo-700 font-bold hover:underline">
                  Ir a Lista de Compras <ExternalLink size={11} />
                </Link>
              </div>
            ) : estadoActual === 'PENDIENTE_COMPRA' && (
              <div className="rounded-2xl border-2 border-orange-200 bg-orange-50 p-5">
                <div className="flex items-center gap-2 mb-1">
                  <ShoppingCart size={18} className="text-orange-600" />
                  <h3 className="text-sm font-black text-orange-800 uppercase tracking-wide">Pendiente de Compra</h3>
                </div>
                <p className="text-xs text-orange-600 mb-4">
                  Este pedido requiere la compra de {productos.length} producto(s). Gestiona la compra desde el panel de Pedidos de Venta.
                </p>
                <Link href={`/dashboard/ventas/venta?id=${pedido.id}`} className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border-2 border-orange-300 rounded-xl text-sm font-black text-orange-800 hover:bg-orange-100 transition-colors">
                  <ListChecks size={16} /> Ir a Crear Pedido de Compra / Lista de Compras
                </Link>
              </div>
            )}

            {/* Contactar cliente */}
            <div>
              <p className="text-xs font-black text-slate-400 uppercase mb-3">Contactar Cliente</p>
              <div className="grid grid-cols-3 gap-2">
                <button onClick={() => { if (pedido?.customer_phone) window.open(`https://wa.me/57${pedido.customer_phone.replace(/\D/g, '')}?text=${encodeURIComponent('Hola, somos Nebulae. Su pedido ' + pedido.numero + '...')}`, '_blank'); }}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 bg-[#25D366] text-white rounded-xl text-sm font-bold hover:bg-[#1ebe5d] shadow-sm">
                  <MessageCircle size={14} /> WhatsApp
                </button>
                <a href={pedido?.customer_phone ? `tel:${pedido.customer_phone}` : undefined} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200">
                  <Phone size={14} /> Llamar
                </a>
                <a href={pedido?.customer_email ? `mailto:${pedido.customer_email}` : undefined} className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-200">
                  <Mail size={14} /> Email
                </a>
              </div>
            </div>
          </div>
        </div>

        {/* Resizer Handle */}
        <div onMouseDown={handleMouseDown} className="w-1.5 bg-slate-200 hover:bg-indigo-500 cursor-col-resize shrink-0 transition-colors z-30" title="Arrastrar para ajustar panel de actividades" />

        {/* BLOQUE 2: Actividades */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <Activity className="text-slate-400" size={20} /> Actividades
            </h3>
          </div>

          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="relative">
              <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)}
                placeholder="Registra una nota interna..."
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-colors shadow-sm" />
              <button onClick={handleRegistrarNota} disabled={sendingNota || !nota.trim()}
                className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>
            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {[...actividades].reverse().map((a: any, i: number) => (
                <div key={i} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10"
                    style={{ color: ACTIVITY_STYLE[a.action] || '#94a3b8' }}>
                    <Activity size={14} />
                  </div>
                  <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold text-slate-800 text-sm">{a.description || a.action}</span>
                      <span className="text-[10px] font-bold text-slate-400">{fDate(a.created_at)}</span>
                    </div>
                    <p className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</p>
                  </div>
                </div>
              ))}
            </div>
            {actividades.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavia.</p>}
          </div>
        </div>
      </div>
    </div>
  );
}
