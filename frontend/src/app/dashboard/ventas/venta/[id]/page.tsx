"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, DollarSign, MessageCircle, Phone, Mail, CheckCircle2, Circle,
  ShoppingCart, RefreshCw, AlertCircle, ListChecks, ExternalLink, Send,
  Activity, FileText, X, Edit2, Save,
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import { NewSupplierModal } from '../venta-client';

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
  const [showPecModal, setShowPecModal] = useState(false);
  const [pecSaving, setPecSaving] = useState(false);
  const [pecForm, setPecForm] = useState({ dias_entrega: 15, modalidad_pago: 'Contado', notas: '' });
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [listaSaving, setListaSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRazon, setCancelRazon] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [panelTab, setPanelTab] = useState<'actividad' | 'ia'>('actividad');
  const [iaAnalisis, setIaAnalisis] = useState('');
  const supplierTimer = useRef<any>(null);

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
      const d = raw?.data ?? raw;
      setPedido(d);
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

  async function handleEnviarWhatsApp() {
    if (!pedido?.customer_phone) return;
    const text = encodeURIComponent(nota || `Hola, somos Nebulae. Su pedido ${pedido.numero}...`);
    window.open(`https://wa.me/57${pedido.customer_phone.replace(/\D/g, '')}?text=${text}`, '_blank');
    if (!nota.trim()) return;
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}/actividad`, {
        method: 'POST',
        body: JSON.stringify({ action: 'CHATTER', description: nota, user_name: currentUser }),
      });
      setNota('');
      await loadPedido();
    } catch (err: any) {
      alert('Error al registrar el mensaje: ' + err.message);
    }
  }

  function onSupplierSearch(q: string) {
    setSupplierSearch(q); setSelectedSupplier(null);
    if (supplierTimer.current) clearTimeout(supplierTimer.current);
    if (!q.trim()) { setSuppliers([]); return; }
    supplierTimer.current = setTimeout(async () => {
      const d = await apiFetch(`/compras/proveedores/search?q=${encodeURIComponent(q)}`).catch(() => ({ data: [] }));
      const arr = Array.isArray(d) ? d : (d?.data ?? []);
      setSuppliers(arr);
      if (arr.length === 0) setShowNewSupplier(true);
    }, 300);
  }

  async function handleCrearPEC() {
    if (!pedido) return;
    if (!selectedSupplier) { alert('Selecciona un proveedor (o crea uno nuevo) antes de crear el PEC'); return; }
    setPecSaving(true);
    try {
      const productosPec = (pedido.productos || []).map((p: any) => {
        const qty = Number(p.qty || p.cantidad || 1);
        const unitPrice = Number(p.unit_price_cop ?? p.precio_unitario ?? (p.total_cop ? p.total_cop / qty : 0));
        return {
          producto_nombre: p.product_name || p.nombre || p.descripcion || p.producto_nombre || 'Producto',
          qty,
          unit_price_cop: unitPrice,
        };
      });
      const totalPec = productosPec.reduce((s: number, p: any) => s + p.qty * p.unit_price_cop, 0);
      const pec = await apiFetch('/compras/pedidos', {
        method: 'POST',
        body: JSON.stringify({
          supplier_id: selectedSupplier.id,
          supplier_name: selectedSupplier.name,
          ven_id: pedido.id,
          ven_numero: pedido.numero,
          dias_entrega: pecForm.dias_entrega,
          modalidad_pago: pecForm.modalidad_pago,
          notas: pecForm.notas,
          productos: productosPec,
          subtotal_cop: totalPec,
          total_cop: totalPec,
          created_by: currentUser,
        }),
      });
      const pecObj = pec?.data ?? pec;
      setShowPecModal(false);
      await loadPedido();
      alert(`PEC ${pecObj.numero || ''} creado y vinculado al pedido`);
    } catch (err: any) {
      alert('Error al crear PEC: ' + err.message);
    }
    setPecSaving(false);
  }

  async function handleAgregarLista() {
    if (!pedido) return;
    setListaSaving(true);
    try {
      await apiFetch('/compras/lista-compras', {
        method: 'POST',
        body: JSON.stringify({
          pven_id: pedido.id,
          pven_numero: pedido.numero,
          productos: (pedido.productos || []).map((p: any) => ({
            producto_nombre: p.product_name || p.nombre || p.descripcion || p.producto_nombre || 'Sin nombre',
            qty: p.qty || p.cantidad || 1,
          })),
          notas: `PVEN: ${pedido.numero} — Cliente: ${pedido.customer_name || ''}`,
          created_by: currentUser,
        }),
      });
      await loadPedido();
    } catch (err: any) {
      alert('Error al agregar a la lista de compras: ' + err.message);
    }
    setListaSaving(false);
  }

  async function handleCancelarPedido() {
    if (!pedido) return;
    if (cancelRazon.trim().length < 5) { alert('La razón de cancelación debe tener al menos 5 caracteres'); return; }
    setCancelling(true);
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          estado: 'CANCELADO',
          cancellation_reason: cancelRazon.trim(),
          cancellation_authorized_by: currentUser,
          cancelled_at: new Date().toISOString(),
          updated_by: currentUser,
        }),
      });
      setShowCancelModal(false);
      setCancelRazon('');
      await loadPedido();
    } catch (err: any) {
      alert('Error al cancelar: ' + err.message);
    }
    setCancelling(false);
  }

  async function handleSaveEdit() {
    if (!pedido) return;
    try {
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...editForm, fecha_entrega_estimada: editForm.fecha_entrega_estimada || null, updated_by: currentUser }),
      });
      setIsEditMode(false);
      await loadPedido();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    }
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
  const actividades = pedido?.actividades || [];

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href={pedido?.cot_id ? `/dashboard/ventas/cotizacion/${pedido.cot_id}` : '/dashboard/ventas/venta'} className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">{pedido?.numero || String(params.id || '').toUpperCase()}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${estadoCfg.bg} ${estadoCfg.text} ${estadoCfg.border}`}>
                {estadoCfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{pedido?.customer_name} &middot; {fDate(pedido?.created_at)}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!pedido?.pxp_id && (
            <Button color="emerald" icon={DollarSign} loading={creatingPxp} onClick={handleCrearPxp}>Crear PXP</Button>
          )}
          {pedido?.pxp_numero && (
            <span className="flex items-center gap-1.5 px-5 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-sm">
              <CheckCircle2 size={16} /> PXP: {pedido.pxp_numero}
            </span>
          )}
          <button onClick={() => {
              if (!isEditMode && pedido) {
                setEditForm({
                  estado: pedido.estado,
                  notas: pedido.notas || '',
                  fecha_entrega_estimada: pedido.fecha_entrega_estimada ? pedido.fecha_entrega_estimada.split('T')[0] : '',
                  direccion_entrega: pedido.direccion_entrega || '',
                  pec_numero: pedido.pec_numero || '',
                });
              }
              setIsEditMode(!isEditMode);
            }}
            className={`p-2.5 rounded-xl border transition-colors ${isEditMode ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
            <Edit2 size={18} />
          </button>
          {!['ENTREGADO', 'FACTURADO', 'CANCELADO'].includes(estadoActual) && (
            <Button variant="danger" icon={X} onClick={() => setShowCancelModal(true)}>Cancelar Pedido</Button>
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
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-8 flex items-start gap-3">
              <AlertCircle className="text-red-500 shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-sm font-bold text-red-700">Este pedido de venta fue cancelado.</p>
                {pedido?.cancellation_reason && (
                  <p className="text-xs text-red-600 mt-1">Motivo: {pedido.cancellation_reason}</p>
                )}
                {(pedido?.cancellation_authorized_by || pedido?.cancelled_at) && (
                  <p className="text-xs text-red-500 mt-1">
                    {pedido?.cancellation_authorized_by && <>Por: {pedido.cancellation_authorized_by}</>}
                    {pedido?.cancellation_authorized_by && pedido?.cancelled_at && ' · '}
                    {pedido?.cancelled_at && fDate(pedido.cancelled_at)}
                  </p>
                )}
              </div>
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
                  <Link href={`/dashboard/ventas/cotizacion/${pedido.cot_id}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
                    {pedido.cot_numero || `COT-${pedido.cot_id}`}
                  </Link>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-400">Sin cotizacion de origen</div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Entrega Estimada</label>
                {isEditMode ? (
                  <input type="date" value={editForm.fecha_entrega_estimada} onChange={e => setEditForm((f: any) => ({ ...f, fecha_entrega_estimada: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                    {fDate(pedido?.fecha_entrega_estimada)}
                  </div>
                )}
              </div>
            </div>

            {isEditMode && (
              <div className="grid grid-cols-2 gap-6 mb-10">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Estado</label>
                  {['ENTREGADO', 'FACTURADO', 'CANCELADO'].includes(estadoActual) ? (
                    <>
                      <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 text-slate-500">
                        {VEN_ESTADOS[estadoActual]?.label || estadoActual}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Este estado ya no se puede cambiar manualmente desde aquí.</p>
                    </>
                  ) : (
                    <>
                      <select value={editForm.estado} onChange={e => setEditForm((f: any) => ({ ...f, estado: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200">
                        {['PENDIENTE_COMPRA', 'EN_PROCESO', 'LISTO_ENTREGA'].map(k => (
                          <option key={k} value={k}>{VEN_ESTADOS[k].label}</option>
                        ))}
                      </select>
                      <p className="text-[11px] text-slate-400 mt-1">Para marcar Entregado o Facturado usa el flujo de Entregas; para cancelar usa el botón "Cancelar Pedido" (registra el motivo).</p>
                    </>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Dirección de Entrega</label>
                  <input type="text" value={editForm.direccion_entrega} onChange={e => setEditForm((f: any) => ({ ...f, direccion_entrega: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">PEC Número (manual)</label>
                  {pedido?.pec_id ? (
                    <>
                      <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 text-slate-500">
                        {editForm.pec_numero}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Ya está vinculado a un Pedido de Compra real; no se puede editar manualmente.</p>
                    </>
                  ) : (
                    <input type="text" value={editForm.pec_numero} onChange={e => setEditForm((f: any) => ({ ...f, pec_numero: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                  )}
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm((f: any) => ({ ...f, notas: e.target.value }))} rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div className="col-span-2 flex justify-end">
                  <Button color="indigo" icon={Save} onClick={handleSaveEdit}>Guardar Cambios</Button>
                </div>
              </div>
            )}

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

            {(pedido?.notas || pedido?.direccion_entrega) && !isEditMode && (
              <div className="grid grid-cols-2 gap-6">
                {pedido?.direccion_entrega && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Dirección de Entrega</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                      {pedido.direccion_entrega}
                    </div>
                  </div>
                )}
                {pedido?.notas && (
                  <div className={pedido?.direccion_entrega ? '' : 'col-span-2'}>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Notas</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 whitespace-pre-wrap">
                      {pedido.notas}
                    </div>
                  </div>
                )}
              </div>
            )}

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
                <Link href={`/dashboard/compras/pedidos?id=${pedido.pec_id}`} className="mt-3 inline-flex items-center gap-1 text-xs text-purple-700 font-bold hover:underline">
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
                  Este pedido requiere la compra de {productos.length} producto(s). Selecciona cómo proceder:
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => {
                      setSupplierSearch(''); setSelectedSupplier(null); setSuppliers([]);
                      setPecForm({ dias_entrega: 15, modalidad_pago: 'Contado', notas: `Pedido de compra para PVEN ${pedido.numero} — ${pedido.customer_name || ''}` });
                      setShowPecModal(true);
                    }}
                    className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-orange-300 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all text-left shadow-sm">
                    <div className="bg-purple-100 text-purple-600 p-2 rounded-xl"><ShoppingCart size={18} /></div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Crear Pedido de Compra</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">Genera un PEC vinculado directamente a este PVEN</p>
                    </div>
                  </button>
                  <button
                    onClick={handleAgregarLista}
                    disabled={listaSaving}
                    className="flex flex-col items-start gap-2 p-4 bg-white border-2 border-orange-300 rounded-xl hover:border-indigo-400 hover:bg-indigo-50 transition-all text-left shadow-sm disabled:opacity-50">
                    <div className="bg-indigo-100 text-indigo-600 p-2 rounded-xl">
                      {listaSaving ? <RefreshCw size={18} className="animate-spin" /> : <ListChecks size={18} />}
                    </div>
                    <div>
                      <p className="text-sm font-black text-slate-900">Agregar a Lista de Compras</p>
                      <p className="text-xs text-slate-500 mt-0.5 leading-tight">Envía los productos a la lista pendiente de comprar (pool)</p>
                    </div>
                  </button>
                </div>
              </div>
            )}

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

          <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
            <button onClick={() => setPanelTab('actividad')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${panelTab === 'actividad' ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>Actividad</button>
            <button onClick={() => setPanelTab('ia')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${panelTab === 'ia' ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>IA</button>
          </div>

          {panelTab === 'ia' && (
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/30 space-y-4">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 rounded-lg px-2 py-1 text-white font-black text-xs">AI</div>
                    <div><p className="font-extrabold text-indigo-900 text-sm">Análisis de Pedido</p><p className="text-[10px] text-indigo-500">Nebulae Analytics</p></div>
                  </div>
                  <Button size="sm" color="indigo" disabled={!pedido} onClick={() => {
                    const prods = pedido?.productos || [];
                    const txt = `ANÁLISIS DE PEDIDO\n\nEstado: ${estadoCfg.label}\nTotal: ${fCOP(pedido?.total_cop)}\nAnticipo: ${fCOP(pedido?.anticipo_cop)}\nSaldo: ${fCOP(pedido?.saldo_cop)}\n\nProductos: ${prods.length} línea(s)\n${prods.map((p: any) => `- ${p.product_name || p.descripcion || 'Producto'} x${p.qty ?? p.cantidad ?? 0}`).join('\n')}\n\nActividad: ${actividades.length} evento(s) registrados.`;
                    setIaAnalisis(txt);
                  }}>Analizar</Button>
                </div>
                {!iaAnalisis && <p className="text-xs text-indigo-700 italic text-center py-3">Genera un análisis con los montos, productos y estado del pedido.</p>}
                {iaAnalisis && <pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/70 rounded-xl p-3 border border-indigo-100 mt-2">{iaAnalisis}</pre>}
              </div>
            </div>
          )}

          {panelTab === 'actividad' && (
            <>
              <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0 space-y-3">
                <div className="grid grid-cols-3 gap-2">
                  <button onClick={handleEnviarWhatsApp}
                    disabled={!pedido?.customer_phone}
                    className="flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold hover:bg-[#1ebe5d] transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                    <MessageCircle size={14} /> WhatsApp
                  </button>
                  <a href={pedido?.customer_phone ? `tel:${pedido.customer_phone}` : undefined}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${pedido?.customer_phone ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                    <Phone size={14} /> Llamar
                  </a>
                  <a href={pedido?.customer_email ? `mailto:${pedido.customer_email}` : undefined}
                    className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${pedido?.customer_email ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                    <Mail size={14} /> Email
                  </a>
                </div>
                <div className="relative">
                  <textarea rows={3} value={nota} onChange={e => setNota(e.target.value)}
                    placeholder="Escribe un mensaje o registra una nota interna..."
                    className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none resize-none transition-colors shadow-sm" />
                  <button onClick={handleRegistrarNota} disabled={sendingNota || !nota.trim()}
                    className="absolute bottom-3 right-3 bg-indigo-600 hover:bg-indigo-700 text-white p-2 rounded-lg shadow-sm transition-colors disabled:opacity-50">
                    {sendingNota ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
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
            </>
          )}
        </div>
      </div>
      {showPecModal && pedido && (
        <Modal title="Crear Pedido de Compra" icon={ShoppingCart} color="purple"
          subtitle={`Vinculado a ${pedido.numero} — ${pedido.customer_name}`}
          onClose={() => setShowPecModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowPecModal(false)}>Cancelar</Button>
              <Button color="purple" icon={ShoppingCart} loading={pecSaving} onClick={handleCrearPEC}>Crear PEC</Button>
            </>
          )}>
          {(pedido.productos || []).length > 0 && (
            <div className="bg-slate-50 rounded-xl p-3 border border-slate-100">
              <p className="text-xs font-black text-slate-400 uppercase mb-2">Productos a comprar</p>
              <div className="space-y-1">
                {(pedido.productos || []).slice(0, 5).map((p: any, i: number) => (
                  <div key={i} className="flex justify-between text-xs text-slate-700">
                    <span className="truncate max-w-[260px]">{p.product_name || p.descripcion || p.producto_nombre}</span>
                    <span className="font-bold ml-2 shrink-0">× {p.qty ?? p.cantidad}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Proveedor</label>
            <input value={supplierSearch} onChange={e => onSupplierSearch(e.target.value)}
              placeholder="Buscar proveedor..." className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
            {suppliers.length > 0 && (
              <div className="border border-slate-200 rounded-xl shadow-lg mt-1 max-h-36 overflow-y-auto z-10">
                {suppliers.map((s: any) => (
                  <button key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium border-b last:border-0">
                    {s.name} {s.city && <span className="text-slate-400">· {s.city}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedSupplier && (
              <p className="text-xs text-purple-700 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> {selectedSupplier.name} seleccionado
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Días Entrega Estimada</label>
              <input type="number" min="1" value={pecForm.dias_entrega} onChange={e => setPecForm(f => ({ ...f, dias_entrega: Number(e.target.value) }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
              <select value={pecForm.modalidad_pago} onChange={e => setPecForm(f => ({ ...f, modalidad_pago: e.target.value }))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                {['Contado', 'Credito 30d', 'Credito 60d', 'Adelanto 50%', 'Contra entrega'].map(p => <option key={p}>{p}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas</label>
            <textarea value={pecForm.notas} onChange={e => setPecForm(f => ({ ...f, notas: e.target.value }))}
              rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
        </Modal>
      )}
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s) => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); setShowNewSupplier(false); }}
          onClose={() => setShowNewSupplier(false)}
        />
      )}
      {showCancelModal && (
        <Modal title="Cancelar Pedido de Venta" icon={AlertCircle} color="red" maxWidth="md"
          onClose={() => setShowCancelModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCancelModal(false)}>Volver</Button>
              <Button variant="danger" icon={X} loading={cancelling} onClick={handleCancelarPedido}>Confirmar Cancelación</Button>
            </>
          )}>
          <p className="text-sm text-slate-500">Esta acción marca el pedido como <strong>CANCELADO</strong>. Indica el motivo (mínimo 5 caracteres).</p>
          <textarea value={cancelRazon} onChange={e => setCancelRazon(e.target.value)} rows={3} autoFocus
            placeholder="Ej: Cliente desistió de la compra, error en el pedido, etc."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 resize-none" />
        </Modal>
      )}
    </div>
  );
}
