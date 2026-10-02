"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, ArrowRight, Send, Mail, FileText, CheckCircle2, Circle,
  MessageSquare, Calculator, Search, RefreshCw, Package, Trash2, RotateCcw,
  AlertCircle, XCircle, Activity, MessageCircle, Phone, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui';
import {
  ChannelModal, CalculadorModal, DeleteConfirm, PropagarPvenConfirm,
  ESTADOS as ESTADOS_COT, fCOP, fDate, fTime,
} from '../cotizacion-client';

// Estilo (icono + color) por tipo de accion registrada en el ActivityLog real del backend
const ACTIVITY_STYLE: Record<string, {icon: any; color: string}> = {
  CREATED:        {icon: FileText,      color: 'text-indigo-500 bg-indigo-50'},
  ESTADO_CHANGED: {icon: Activity,      color: 'text-amber-500 bg-amber-50'},
  SENT:           {icon: Send,          color: 'text-blue-500 bg-blue-50'},
  CONFIRMED:      {icon: CheckCircle2,  color: 'text-emerald-500 bg-emerald-50'},
  REJECTED:       {icon: XCircle,       color: 'text-rose-500 bg-rose-50'},
  UPDATED:        {icon: FileText,      color: 'text-purple-500 bg-purple-50'},
  CHATTER:        {icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50'},
  NOTE_ADDED:     {icon: MessageSquare, color: 'text-blue-500 bg-blue-50'},
};
const DEFAULT_ACTIVITY_STYLE = {icon: Activity, color: 'text-slate-500 bg-slate-50'};

export default function CotizacionDetallePage() {
  const params = useParams();
  const router = useRouter();
  const isNew = params.id === 'nueva';

  const [cotizacion, setCotizacion] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'WhatsApp'|'Email'|'Otro'|null>(null);
  // Gate 2: numero del PVEN recien creado, para el mensaje de exito con fade (4s) tras
  // "Crear Pedido de Venta" -- distinto del banner permanente de arriba (ventaGenerada),
  // que sigue mostrandose en cada visita a la pagina mientras exista un PVEN vinculado.
  const [pvenCreadoNumero, setPvenCreadoNumero] = useState<string | null>(null);

  // Acciones (Calculadora / Eliminar / Propagar a Pedido de Venta)
  const [showCalc, setShowCalc] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingCalcData, setPendingCalcData] = useState<any | null>(null);
  const [savingCalc, setSavingCalc] = useState(false);
  const [creatingProductIdx, setCreatingProductIdx] = useState<number | null>(null);

  // Chatter (compose real, reemplaza el placeholder sin funcionalidad)
  const [chatterInput, setChatterInput] = useState('');
  const [chatterSending, setChatterSending] = useState(false);

  // Right panel tabs
  const [cotPanelTab, setCotPanelTab] = useState<'actividad'|'ia'>('actividad');
  const [cotAnalisis, setCotAnalisis] = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  const loadCotizacion = useCallback(async () => {
    if (isNew || !params.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const raw = await apiFetch(`/ventas/cotizaciones/${params.id}`);
      setCotizacion(raw?.data ?? raw);
    } catch (err: any) {
      setLoadError(err.message || 'No se pudo cargar la cotizacion');
    }
    setLoading(false);
  }, [params.id, isNew]);

  useEffect(() => { loadCotizacion(); }, [loadCotizacion]);

  useEffect(() => {
    if (pvenCreadoNumero) {
      const t = setTimeout(() => setPvenCreadoNumero(null), 4000);
      return () => clearTimeout(t);
    }
  }, [pvenCreadoNumero]);

  // Resizable Right Pane Logic
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
    const newWidth = Math.min(Math.max(300, startWidth.current + delta), 800);
    setRightWidth(newWidth);
  };

  const handleMouseUp = () => {
    isDragging.current = false;
    document.removeEventListener('mousemove', handleMouseMove);
    document.removeEventListener('mouseup', handleMouseUp);
    document.body.style.cursor = 'default';
    document.body.style.userSelect = 'auto';
  };

  useEffect(() => {
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const estadoActual = cotizacion?.estado || 'BORRADOR';
  const estadoCfg = ESTADOS_COT[estadoActual] || {label: estadoActual, color:'#7c3aed', bg:'#f5f3ff', border:'#ddd6fe'};
  // 0 = Borrador/Valorizando, 1 = Cotizado al cliente (o rechazada/vencida en ese punto), 2 = Confirmada (venta generada)
  const stepIndex = estadoActual === 'CONFIRMADA' ? 2
    : ['ENVIADA', 'PENDIENTE_CONFIRMACION', 'RECHAZADA', 'VENCIDA'].includes(estadoActual) ? 1
    : 0;

  const productos = cotizacion?.productos || [];
  const pedidosVenta = cotizacion?.pedidos_venta || [];
  const ventaGenerada = pedidosVenta.length > 0;
  const pedidoReciente = ventaGenerada ? pedidosVenta[pedidosVenta.length - 1] : null;

  function handleEnviarCotizacion() {
    if (!cotizacion?.id) return;
    setShowChannelModal(true);
  }

  async function confirmarEnvio() {
    if (!cotizacion?.id) return;
    if (!selectedChannel) return;
    setSending(true);
    try {
      // canal_envio es solo informativo (para que se pueda ver el canal que se usara
      // ir enviarlo) -- se guarda con un PATCH normal, que ya no puede tocar el estado
      // de Gate 2. El envio real (que crea y emite el token) pasa por su propio
      // endpoint dedicado -- Round 2 (adversarial review): antes este mismo PATCH
      // ponia 'PENDIENTE_CONFIRMACION' directamente, que es exactamente lo que el
      // drag-and-drop del Kanban del Hub tambien manda al soltar una tarjeta en "No
      // Resuelto" -- un PATCH generico nunca debe poder disparar el envio de un email
      // de confirmacion como efecto secundario.
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({canal_envio: selectedChannel, updated_by: currentUser}),
      });
      const d = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/enviar-confirmacion`, {
        method: 'POST',
        body: JSON.stringify({user_name: currentUser}),
      });
      const link = d?.link_confirmacion || '';

      if (selectedChannel === 'WhatsApp' && cotizacion?.customer_phone) {
        const phoneNumber = cotizacion.customer_phone.replace(/\D/g, '');
        // Hallazgo #3 (spec): el mensaje de WhatsApp debe incluir el link -- sin esto,
        // un cliente que solo recibe por WhatsApp (o sin email registrado) no tenia
        // ninguna forma real de llegar al link de confirmacion.
        const mensaje = link
          ? `Hola, aqui esta tu cotizacion ${cotizacion.numero}. Confírmala aquí: ${link}`
          : `Hola, aqui esta tu cotizacion ${cotizacion.numero}`;
        window.open(`https://wa.me/57${phoneNumber}?text=${encodeURIComponent(mensaje)}`, '_blank');
      }

      await loadCotizacion();
      setShowChannelModal(false);
      setSelectedChannel(null);
    } catch (err: any) {
      alert('Error al enviar la cotizacion: ' + err.message);
    }
    setSending(false);
  }

  function cancelarEnvio() {
    setShowChannelModal(false);
    setSelectedChannel(null);
  }

  async function handleConfirmarVenta() {
    if (!cotizacion?.id) return;
    const hasProds = productos.length > 0;
    const hasNotes = (cotizacion.notas || '').trim().length > 0;
    if (!hasProds && !hasNotes) {
      alert('No hay productos ni notas. Cotiza primero o agrega información antes de confirmar.');
      return;
    }
    if (!hasProds && hasNotes) {
      const ok = window.confirm('No hay productos especificados. Las notas mencionan el producto. ¿Confirmar de todas formas?');
      if (!ok) return;
    }
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({user_name: currentUser}),
      });
      const dataObj = d?.data ?? d;
      const pvenNumero = dataObj?.pedido_venta?.numero || d?.pedido_venta?.numero || '';
      await loadCotizacion();
      if (pvenNumero) setPvenCreadoNumero(pvenNumero);
    } catch (err: any) {
      alert('Error al confirmar la venta: ' + err.message);
    }
    setConfirming(false);
  }

  function onCalcSave(data: any) {
    const pvenVigente = pedidosVenta.filter((v: any) => v.estado !== 'CANCELADA').pop();
    if (pvenVigente) {
      setShowCalc(false);
      setPendingCalcData(data);
      return;
    }
    commitCalcSave(data, false);
  }

  async function commitCalcSave(data: any, propagarAPven: boolean) {
    if (!cotizacion?.id) return;
    setSavingCalc(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...data, updated_by: currentUser }),
      });
      const pvenVigente = pedidosVenta.filter((v: any) => v.estado !== 'CANCELADA').pop();
      if (propagarAPven && pvenVigente) {
        const nuevoSaldo = Number(data.total_cop || 0) - Number(pvenVigente.anticipo_cop || 0);
        await apiFetch(`/ventas/pedidos/${pvenVigente.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            productos: data.productos,
            subtotal_cop: data.subtotal_cop,
            descuento_pct: data.descuento_pct,
            total_cop: data.total_cop,
            saldo_cop: nuevoSaldo,
            updated_by: currentUser,
          }),
        });
        const notaCredito = nuevoSaldo < 0 ? ` Crédito a favor del cliente: ${fCOP(Math.abs(nuevoSaldo))}.` : '';
        await apiFetch(`/ventas/pedidos/${pvenVigente.id}/actividad`, {
          method: 'POST',
          body: JSON.stringify({
            action: 'UPDATED',
            description: `Precios actualizados por re-cotización de ${cotizacion?.numero || ''} (anticipo y pagos existentes no se modificaron).${notaCredito}`,
            user_name: currentUser,
          }),
        });
      }
      setShowCalc(false);
      setPendingCalcData(null);
      await loadCotizacion();
    } catch (err: any) {
      alert('Error al guardar la cotización: ' + err.message);
    }
    setSavingCalc(false);
  }

  async function changeEstado(newEstado: string) {
    if (!cotizacion?.id) return;
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: newEstado, updated_by: currentUser }),
      });
      await loadCotizacion();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function deleteCot() {
    if (!cotizacion?.id) return;
    try {
      // No hay DELETE real: se marca como RECHAZADA (soft-delete), igual que en el listado.
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'RECHAZADA', updated_by: currentUser }),
      });
      setShowDelete(false);
      router.push('/dashboard/ventas/cotizacion');
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
  }

  async function handleQuickCreateProduct(idx: number) {
    const item = productos[idx];
    if (!item || item.sku_id || !cotizacion?.id) return;
    setCreatingProductIdx(idx);
    try {
      const p = await apiFetch('/crm/products/quick-create', {
        method: 'POST',
        body: JSON.stringify({ name: item.product_name, sale_price: item.unit_price_cop || 0 }),
      });
      const prod = p?.data ?? p;
      const nuevosProductos = productos.map((it: any, i: number) => i === idx ? { ...it, sku_id: prod.id, es_libre: false } : it);
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ productos: nuevosProductos, updated_by: currentUser }),
      });
      await loadCotizacion();
    } catch (err: any) {
      alert('Error al crear el producto: ' + err.message);
    }
    setCreatingProductIdx(null);
  }

  async function enviarChatter(viaWhatsApp: boolean) {
    if (!cotizacion?.id) return;
    if (viaWhatsApp) {
      if (!cotizacion?.customer_phone) return;
      const text = encodeURIComponent(chatterInput || `Hola, aqui esta tu cotizacion ${cotizacion.numero}`);
      window.open(`https://wa.me/57${cotizacion.customer_phone.replace(/\D/g, '')}?text=${text}`, '_blank');
      if (!chatterInput.trim()) return;
    } else if (!chatterInput.trim()) {
      return;
    }
    setChatterSending(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/actividad`, {
        method: 'POST',
        body: JSON.stringify({ action: 'CHATTER', description: chatterInput, user_name: currentUser }),
      });
      setChatterInput('');
      await loadCotizacion();
    } catch (err: any) {
      alert('Error al registrar el mensaje: ' + err.message);
    }
    setChatterSending(false);
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-blue-600" size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white">
        <AlertCircle className="text-rose-500" size={32} />
        <p className="text-slate-600 font-medium">{loadError}</p>
        <Link href="/dashboard/ventas/cotizacion" className="text-blue-600 font-bold text-sm hover:underline">
          Volver al listado de cotizaciones
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/ventas/cotizacion" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nueva Cotizacion' : (cotizacion?.numero || String(params.id || '').toUpperCase())}
              </h1>
              {!isNew && cotizacion && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border"
                  style={{backgroundColor: estadoCfg.bg, color: estadoCfg.color, borderColor: estadoCfg.border}}>
                  {estadoCfg.label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Informacion de la Cotizacion (Formulario sin limites) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {ventaGenerada && pedidoReciente && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center gap-3 shadow-sm animate-in fade-in slide-in-from-top-4">
              <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm shrink-0"><CheckCircle2 size={20}/></div>
              <div>
                <h3 className="font-black text-emerald-900">Pedido {pedidoReciente.numero} creado exitosamente</h3>
                <p className="text-sm text-emerald-700">La cotizacion fue aceptada y ya paso a operaciones/logistica. Ver acción "Ver Pedido de Venta" abajo.</p>
              </div>
            </div>
          )}

          {/* Status Tracker */}
          {!isNew && cotizacion && (
            <div className="bg-white p-6 border-b border-slate-100 mb-8 flex justify-between relative">
              <div className="absolute top-1/2 left-10 right-10 h-1 bg-slate-100 -translate-y-1/2 z-0" />

              <div className={`absolute top-1/2 left-10 h-1 transition-all duration-500 z-0 ${
                stepIndex === 2 ? 'bg-emerald-500 right-10' :
                stepIndex === 1 ? 'bg-blue-500 right-1/2' :
                'bg-slate-300 right-[80%]'
              }`} />

              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full text-white flex items-center justify-center font-bold shadow-md ${
                  stepIndex >= 1 ? 'bg-blue-600 shadow-blue-200' : 'bg-slate-800 shadow-slate-200'
                }`}><CheckCircle2 size={16} /></div>
                <span className="text-xs font-bold text-slate-800">Borrador (Valorizando)</span>
              </div>

              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                  stepIndex === 2 ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' :
                  stepIndex === 1 ? 'bg-blue-600 text-white shadow-md shadow-blue-200' :
                  'bg-white border-2 border-slate-200 text-slate-300'
                }`}>
                  {stepIndex === 2 ? <CheckCircle2 size={16} /> : <Circle size={16} fill={stepIndex === 1 ? 'currentColor' : 'transparent'} />}
                </div>
                <span className={`text-xs font-bold ${
                  stepIndex === 2 ? 'text-emerald-700' :
                  stepIndex === 1 ? 'text-blue-700' : 'text-slate-400'
                }`}>Cotizado al Cliente</span>
              </div>

              <div className="relative z-10 flex flex-col items-center gap-2">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold transition-colors ${
                  stepIndex === 2 ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-white border-2 border-slate-200 text-slate-300'
                }`}>
                  {stepIndex === 2 ? <CheckCircle2 size={16} /> : <Circle size={16} />}
                </div>
                <span className={`text-xs font-bold ${stepIndex === 2 ? 'text-emerald-700' : 'text-slate-400'}`}>Confirmado (Venta)</span>
              </div>
            </div>
          )}

          {/* Area de Formulario Abierta */}
          <div className="max-w-5xl mx-auto">
            <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
              <FileText className="text-blue-600" size={24} /> Datos de la Cotizacion
            </h2>

            {!isNew && cotizacion && !cotizacion.customer_name && (
              <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-bold">
                  Falta el nombre del cliente — esta cotización no puede completarse sin esta información.
                </p>
              </div>
            )}

            <div className="grid grid-cols-3 gap-6 mb-10">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800">
                  {cotizacion?.customer_name || 'Sin cliente asignado'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Origen</label>
                {cotizacion?.sc_id ? (
                  <Link href={`/dashboard/ventas/solicitud?id=${cotizacion.sc_id}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
                    <Search size={16} /> {cotizacion.sc_numero || `SC-${cotizacion.sc_id}`}
                  </Link>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-400">
                    Sin solicitud de origen
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Entrega Estimada</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700">
                  {fDate(cotizacion?.fecha_entrega_estimada)}
                </div>
              </div>
            </div>

            {cotizacion?.notas && (
              <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 mb-10">
                <p className="text-xs font-black text-blue-600 uppercase mb-1.5">Notas</p>
                <p className="text-sm text-blue-900">{cotizacion.notas}</p>
              </div>
            )}

            {/* ARTICULOS Y PRECIOS */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Package className="text-blue-600" size={20} /> Producto{productos.length !== 1 ? 's' : ''} Cotizado{productos.length !== 1 ? 's' : ''}
                </h3>
              </div>

              {productos.length === 0 ? (
                <div className="bg-slate-50 border border-dashed border-slate-300 rounded-2xl p-8 text-center text-sm text-slate-400 italic">
                  Sin productos registrados en esta cotización.
                </div>
              ) : (
                <div className="space-y-3">
                  {productos.map((item: any, idx: number) => (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex items-center gap-4 hover:border-blue-200 transition-colors">
                      <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          <Package size={26}/>
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-slate-900 text-base truncate">{item.product_name || item.name || 'Producto sin nombre'}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.sku_id ? (
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide bg-emerald-50 px-1.5 py-0.5 rounded">Vinculado a catálogo</span>
                          ) : (
                            <>
                              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide bg-amber-50 px-1.5 py-0.5 rounded">Texto libre</span>
                              <button onClick={() => handleQuickCreateProduct(idx)} disabled={creatingProductIdx === idx}
                                className="text-[10px] font-black text-blue-600 hover:text-blue-800 underline disabled:opacity-50">
                                {creatingProductIdx === idx ? 'Creando...' : '+ Ingresar como producto'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs text-slate-400">Cant. {item.qty ?? 0} &times; {fCOP(item.unit_price_cop)}</p>
                        <p className="font-black text-slate-900 text-lg">{fCOP(item.total_cop != null ? item.total_cop : (Number(item.unit_price_cop) || 0) * (Number(item.qty) || 0))}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* TOTALES */}
              <div className="flex justify-end mt-6">
                <div className="w-72 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-500">Subtotal</span>
                    <span className="font-bold text-slate-800">{fCOP(cotizacion?.subtotal_cop)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-slate-500">Descuento ({Number(cotizacion?.descuento_pct) || 0}%)</span>
                    <span className="font-bold text-slate-800">
                      {fCOP((Number(cotizacion?.subtotal_cop) || 0) * ((Number(cotizacion?.descuento_pct) || 0) / 100))}
                    </span>
                  </div>
                  <div className="h-px w-full bg-slate-200 mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-black text-slate-800">TOTAL</span>
                    <span className="text-xl font-black text-blue-600">{fCOP(cotizacion?.total_cop)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BLOQUE DE ACCIONES — estandarizado: primero mover el flujo (enviar/confirmar),
                al final Re-Cotizar y Ver Pedido de Venta, y lo destructivo/edge-case al fondo. */}
            {!isNew && cotizacion && (
              <div className="mb-4">
                <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                  <Sparkles className="text-amber-500" size={20} /> Acciones
                </h3>
                <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">

                  {/* Gate 2: "Crear Pedido de Venta" solo cuando el cliente ya confirmo via el
                      enlace publico (estado === 'CONFIRMADA') -- separado de "Enviar al
                      Cliente", que ahora solo manda el link de confirmacion (ver
                      confirmarEnvio). !ventaGenerada evita que el boton siga ofreciendose
                      despues de usado: a diferencia del flujo viejo, CONFIRMADA ya no es solo un
                      estado terminal post-conversion -- ahora tambien es el estado intermedio
                      mientras el PVEN todavia no existe.
                      Round 2 (adversarial review, hallazgo bundled): pvenCreadoNumero se
                      incluye como condicion aparte (en vez de depender solo de
                      "CONFIRMADA && !ventaGenerada") porque loadCotizacion() ya deja
                      ventaGenerada=true ANTES de que el mensaje de exito se renderice --
                      sin esto, el mensaje nunca llegaba a mostrarse (el `!ventaGenerada`
                      de la condicion original ya era falso para cuando pvenCreadoNumero se
                      alcanzaba a setear). */}
                  {(estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA' || estadoActual === 'PENDIENTE_CONFIRMACION' || (estadoActual === 'CONFIRMADA' && !ventaGenerada) || pvenCreadoNumero) && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {(estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA') && (
                        <Button color="blue" icon={Send} loading={sending} onClick={handleEnviarCotizacion}>
                          {estadoActual === 'ENVIADA' ? 'Re-enviar al Cliente' : 'Enviar al Cliente'}
                        </Button>
                      )}
                      {estadoActual === 'PENDIENTE_CONFIRMACION' && (
                        <div className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-dashed border-blue-200 bg-blue-50 text-blue-500 text-sm font-bold">
                          Esperando confirmación del cliente
                        </div>
                      )}
                      {pvenCreadoNumero ? (
                        <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold animate-in fade-in">
                          <CheckCircle2 size={16} /> Pedido {pvenCreadoNumero} creado exitosamente
                        </div>
                      ) : estadoActual === 'CONFIRMADA' && !ventaGenerada && (
                        <Button color="emerald" icon={CheckCircle2} loading={confirming} onClick={handleConfirmarVenta}>
                          Crear Pedido de Venta
                        </Button>
                      )}
                    </div>
                  )}

                  <div className={`grid grid-cols-1 sm:grid-cols-2 gap-3 ${(estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA' || estadoActual === 'PENDIENTE_CONFIRMACION' || (estadoActual === 'CONFIRMADA' && !ventaGenerada) || pvenCreadoNumero) ? 'pt-4 border-t border-slate-100' : ''}`}>
                    <Button color={Number(cotizacion?.total_cop) > 0 ? 'orange' : 'blue'}
                      icon={Number(cotizacion?.total_cop) > 0 ? RotateCcw : Calculator}
                      onClick={() => setShowCalc(true)}>
                      {Number(cotizacion?.total_cop) > 0 ? 'Re-Cotizar — Actualizar Precios' : 'Cotizar — Calcular Precios'}
                    </Button>
                    {ventaGenerada && pedidoReciente ? (
                      <Link href={`/dashboard/ventas/venta/${pedidoReciente.id}?return_to=${encodeURIComponent('/dashboard/ventas/cotizacion/' + cotizacion.id)}`}
                        className="flex items-center justify-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 px-4 py-2.5 rounded-xl font-bold text-sm hover:bg-emerald-100 transition-colors">
                        Ver Pedido de Venta <ArrowRight size={14} />
                      </Link>
                    ) : (
                      <div className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-300 text-sm font-bold">
                        Pedido de Venta pendiente de confirmar
                      </div>
                    )}
                  </div>

                  {estadoActual !== 'CONFIRMADA' && (
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">Cambiar Estado</p>
                      {/* Gate 2: PENDIENTE_CONFIRMACION (igual que CONFIRMADA) se excluye de las
                          opciones manuales -- solo se alcanza vía "Enviar al Cliente" (que crea y
                          envía el link de confirmación real), nunca por esta selección directa.
                          Esta pastilla SI sigue visible mientras la cotización esta
                          PENDIENTE_CONFIRMACION (no se agrega esa exclusion al `estadoActual !==
                          'CONFIRMADA'` de arriba): es la unica salida real de ese ciclo (ver
                          update_cotizacion en el backend), para que un asesor pueda revertir una
                          cotizacion enviada por error. Un solo <select> en vez de pastillas -- mismo
                          patron que venta/[id]/page.tsx para su selector de Estado. */}
                      <select
                        value=""
                        onChange={e => {
                          const k = e.target.value;
                          if (!k) return;
                          if (k === 'RECHAZADA' && !window.confirm('¿Marcar como Rechazada? La SC vinculada permanecerá activa.')) return;
                          changeEstado(k);
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-amber-200 mb-3">
                        <option value="">Seleccionar nuevo estado...</option>
                        {Object.entries(ESTADOS_COT).filter(([k]) => k !== estadoActual && k !== 'CONFIRMADA' && k !== 'PENDIENTE_CONFIRMACION').map(([k, v]: any) => (
                          <option key={k} value={k}>{v.label}</option>
                        ))}
                      </select>
                      <button onClick={() => setShowDelete(true)} className="flex items-center gap-1.5 text-red-500 hover:text-red-700 text-xs font-bold">
                        <Trash2 size={12} /> Eliminar cotización
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitacora (Chatter) -- la actividad es la informacion principal */}
        <div style={{width: rightWidth}} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividad
            </h3>
          </div>

          {/* Tab Bar */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
            <button onClick={()=>setCotPanelTab('actividad')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${cotPanelTab==='actividad'?'text-blue-700 border-blue-600 bg-white':'text-slate-500 border-transparent hover:text-slate-700'}`}>Actividad</button>
            <button onClick={()=>setCotPanelTab('ia')} className={`px-5 py-3 text-sm font-bold border-b-2 transition-colors ${cotPanelTab==='ia'?'text-indigo-700 border-indigo-600 bg-white':'text-slate-500 border-transparent hover:text-slate-700'}`}>IA</button>
          </div>

          {/* IA Tab Content */}
          {cotPanelTab==='ia'&&(
            <div className="flex-1 overflow-y-auto p-5 bg-slate-50/30 space-y-4">
              <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="bg-indigo-600 rounded-lg px-2 py-1 text-white font-black text-xs">AI</div>
                    <div><p className="font-extrabold text-indigo-900 text-sm">Analisis de Cotizacion</p><p className="text-[10px] text-indigo-500">Nebulae Analytics</p></div>
                  </div>
                  <Button size="sm" color="indigo" disabled={!cotizacion} onClick={()=>{
                    const prods = cotizacion?.productos || [];
                    const actividades = cotizacion?.actividades || [];
                    const txt=`ANALISIS DE COTIZACION\n\nEstado: ${estadoCfg.label}\nTotal: ${fCOP(cotizacion?.total_cop)}\nSubtotal: ${fCOP(cotizacion?.subtotal_cop)}\nDescuento: ${Number(cotizacion?.descuento_pct)||0}%\n\nArticulos: ${prods.length} linea(s)\n${prods.map((p:any)=>`- ${p.product_name||'Producto'} x${p.qty||0} - ${fCOP((Number(p.unit_price_cop)||0)*(Number(p.qty)||0))}`).join('\n')}\n\nActividad: ${actividades.length} evento(s) registrados.`;
                    setCotAnalisis(txt);
                  }}>Analizar</Button>
                </div>
                {!cotAnalisis&&<p className="text-xs text-indigo-700 italic text-center py-3">Genera un analisis con los precios, productos y estado de la cotizacion.</p>}
                {cotAnalisis&&<pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/70 rounded-xl p-3 border border-indigo-100 mt-2">{cotAnalisis}</pre>}
              </div>
            </div>
          )}

          {cotPanelTab==='actividad'&&(
          <>{/* Contactar + Chatter Input Area -- reemplaza el placeholder anterior sin funcionalidad */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0 space-y-3">
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => enviarChatter(true)} disabled={!cotizacion?.customer_phone}
                className="flex items-center justify-center gap-1.5 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold hover:bg-[#1ebe5d] transition-colors shadow-sm disabled:opacity-40 disabled:cursor-not-allowed">
                <MessageCircle size={14} /> WhatsApp
              </button>
              <a href={cotizacion?.customer_phone ? `tel:${cotizacion.customer_phone}` : undefined}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${cotizacion?.customer_phone ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                <Phone size={14} /> Llamar
              </a>
              <a href={cotizacion?.customer_email ? `mailto:${cotizacion.customer_email}?subject=Cotización ${cotizacion.numero}` : undefined}
                className={`flex items-center justify-center gap-1.5 py-2.5 rounded-xl text-xs font-bold shadow-sm transition-colors ${cotizacion?.customer_email ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-slate-50 text-slate-300 pointer-events-none'}`}>
                <Mail size={14} /> Email
              </a>
            </div>

            <div className="relative">
              <textarea
                rows={3}
                value={chatterInput}
                onChange={e => setChatterInput(e.target.value)}
                placeholder="Escribe un mensaje o registra una nota interna..."
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none transition-colors shadow-sm"
              />
              <button onClick={() => enviarChatter(false)} disabled={chatterSending || !chatterInput.trim()}
                className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-sm transition-colors disabled:opacity-40">
                {chatterSending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />}
              </button>
            </div>
          </div>

          {/* Timeline / Bitacora */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {[...(cotizacion?.actividades || [])].reverse().map((a:any) => {
                const style = ACTIVITY_STYLE[a.action] || DEFAULT_ACTIVITY_STYLE;
                const Icon = style.icon;
                return (
                  <div key={a.id} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${style.color}`}>
                      <Icon size={14} />
                    </div>

                    <div className="flex-1 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-800 text-sm">{a.description || a.action}</span>
                        <span className="text-[10px] font-bold text-slate-400">{fDate(a.created_at)} {fTime(a.created_at)}</span>
                      </div>
                      {a.old_estado && a.new_estado && (
                        <p className="text-sm text-slate-600 mb-3 leading-relaxed">{a.old_estado} / {a.new_estado}</p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                          {(a.user_name||'S').split(' ').map((n:string)=>n[0]).join('').slice(0,2).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {(!cotizacion?.actividades || cotizacion.actividades.length===0) && (
              <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavia.</p>
            )}

            {(cotizacion?.actividades || []).length > 0 && (
              <div className="text-center mt-8">
                <span className="text-xs font-bold text-slate-400 bg-slate-50 px-3 py-1 rounded-full border border-slate-200">
                  Fin del historial
                </span>
              </div>
            )}
          </div>
          </> /* end actividad */
          )}

        </div>
      </div>

      {showChannelModal && (
        <ChannelModal
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          onConfirm={confirmarEnvio}
          onCancel={cancelarEnvio}
          saving={sending}
          customerHasPhone={!!cotizacion?.customer_phone}
        />
      )}
      {showCalc && cotizacion && <CalculadorModal cot={cotizacion} onSave={onCalcSave} onClose={() => setShowCalc(false)} />}
      {showDelete && cotizacion && <DeleteConfirm cot={cotizacion} onConfirm={deleteCot} onCancel={() => setShowDelete(false)} />}
      {pendingCalcData && (
        <PropagarPvenConfirm
          pven={pedidosVenta.filter((v: any) => v.estado !== 'CANCELADA').pop()}
          totalAnterior={Number(cotizacion?.total_cop || 0)}
          totalNuevo={Number(pendingCalcData.total_cop || 0)}
          saving={savingCalc}
          onConfirm={() => commitCalcSave(pendingCalcData, true)}
          onCancel={() => commitCalcSave(pendingCalcData, false)}
        />
      )}
    </div>
  );
}
