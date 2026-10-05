"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowLeft, ArrowRight, Send, Mail, FileText, CheckCircle2, Circle,
  MessageSquare, Calculator, Search, RefreshCw, Package, Trash2, RotateCcw,
  AlertCircle, XCircle, Activity, MessageCircle, Phone, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui';
import {
  ChannelModal, CalculadorModal, DeleteConfirm, PropagarPvenConfirm, VerificarAnticipoModal, AjustarAnticipoModal,
  ESTADOS as ESTADOS_COT, EstadoBadge, fCOP, fDate, fTime,
} from '../cotizacion-client';
import { NextStepCard, EnlaceConfirmacionModal, CambiosDeActividad, returnToSeguro, getUsuarioActual } from '../../flujo';
import { situacionPedidoCotizacion } from '@/lib/listas-ventas';
import { resumenAnticipoCotizacion, formatoPct, propagacionRecotizacion, puedeGestionarCotizacion } from '@/lib/dinero-ventas';
import { comoUTC } from '@/lib/hub-ventas';
import { waUrl } from '@/lib/whatsapp';

// Estilo (icono + color) por tipo de accion registrada en el ActivityLog real del backend
const ACTIVITY_STYLE: Record<string, {icon: any; color: string}> = {
  CREATED:        {icon: FileText,      color: 'text-indigo-500 bg-indigo-50'},
  ESTADO_CHANGED: {icon: Activity,      color: 'text-amber-500 bg-amber-50'},
  SENT:           {icon: Send,          color: 'text-blue-500 bg-blue-50'},
  CONFIRMED:      {icon: CheckCircle2,  color: 'text-emerald-500 bg-emerald-50'},
  REJECTED:       {icon: XCircle,       color: 'text-rose-500 bg-rose-50'},
  UPDATED:        {icon: FileText,      color: 'text-purple-500 bg-purple-50'},
  RECOTIZADA:     {icon: RotateCcw,     color: 'text-orange-500 bg-orange-50'},
  CHATTER:        {icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50'},
  NOTE_ADDED:     {icon: MessageSquare, color: 'text-blue-500 bg-blue-50'},
};
const DEFAULT_ACTIVITY_STYLE = {icon: Activity, color: 'text-slate-500 bg-slate-50'};

function CotizacionDetalleContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = params.id === 'nueva';
  // "Volver al origen" (mismo patron que solicitud/[id] y venta/[id]): la Solicitud ya
  // construye ?return_to= al enlazar a esta cotizacion, pero esta pagina lo ignoraba.
  const safeReturnTo = returnToSeguro(searchParams?.get('return_to'));
  const currentPath = `/dashboard/ventas/cotizacion/${String(params.id || '')}`;

  const [cotizacion, setCotizacion] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'WhatsApp'|'Email'|'Otro'|null>(null);
  // Enlace de confirmacion recien generado: el token crudo solo viaja en la respuesta del
  // envio, asi que se muestra (copiar/abrir) apenas llega -- con el canal Email/Otro, o
  // sin SMTP configurado, no llegaba a ningun lado.
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
  // H27+H39: resultado del correo de respaldo y canal del envio, para el aviso del modal del enlace.
  const [confirmCorreo, setConfirmCorreo] = useState<any>(null);
  const [confirmCanal, setConfirmCanal] = useState<string | null>(null);
  // B13: el wa.me que se intento abrir, para "Abrir WhatsApp" en el modal si el navegador bloqueo la ventana.
  const [confirmWhatsapp, setConfirmWhatsapp] = useState<string | null>(null);
  // Gate 2: numero del PVEN recien creado, para el mensaje de exito con fade (4s) tras
  // "Crear Pedido de Venta". H46: ya no hay banner permanente; despues queda la tarjeta
  // "Pedido de Venta generado" mientras el pedido siga vigente.
  const [pvenCreadoNumero, setPvenCreadoNumero] = useState<string | null>(null);
  // N1: modal de verificacion del pago del anticipo (el error del servidor se muestra dentro).
  const [showVerificar, setShowVerificar] = useState(false);
  const [verificarError, setVerificarError] = useState('');
  // R3: ajuste manual del anticipo.
  const [showAjuste, setShowAjuste] = useState(false);
  const [ajusteSaving, setAjusteSaving] = useState(false);
  const [ajusteError, setAjusteError] = useState('');

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
  // H46: solo un pedido vigente es "venta generada" (los cancelados no). Con todos cancelados, confirmacion_vigente
  // (la confirmacion del cliente sin usar) separa la COT re-confirmada, que crea otro pedido ya, de la antigua que
  // quedo CONFIRMADA y hay que reabrir (situacionPedidoCotizacion).
  const situacion = situacionPedidoCotizacion(cotizacion);
  const pvenVigente = situacion.vigente;
  const pvenCancelado = situacion.cancelado;
  const anticipo = resumenAnticipoCotizacion(cotizacion);
  // B4: solo los roles que el servidor acepta en PATCH /cotizaciones/{id} y POST /confirmar (Administración y asesor).
  const rolGestiona = puedeGestionarCotizacion(getUsuarioActual().role);
  const puedeAjustarAnticipo = rolGestiona && !pvenVigente && !['RECHAZADA', 'CANCELADA'].includes(estadoActual);

  function handleEnviarCotizacion() {
    if (!cotizacion?.id) return;
    setShowChannelModal(true);
  }

  async function confirmarEnvio() {
    if (!cotizacion?.id) return;
    if (!selectedChannel) return;
    setSending(true);
    try {
      // H27+H39: el canal viaja en el mismo POST que crea y emite el token (canal_envio queda en el
      // mismo commit que PENDIENTE_CONFIRMACION y la Actividad lo muestra en ese renglon), sin un PATCH
      // previo. El servidor responde 400 con 'Email' si el cliente no tiene correo (ChannelModal lo evita).
      const d = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/enviar-confirmacion`, {
        method: 'POST',
        body: JSON.stringify({user_name: currentUser, canal: selectedChannel}),
      });
      const link = d?.link_confirmacion || '';
      let whatsapp: string | null = null;

      if (selectedChannel === 'WhatsApp') {
        // Hallazgo #3 (spec): el mensaje de WhatsApp debe incluir el link -- sin esto,
        // un cliente que solo recibe por WhatsApp (o sin email registrado) no tenia
        // ninguna forma real de llegar al link de confirmacion.
        const mensaje = link
          ? `Hola, aquí está tu cotización ${cotizacion.numero}. Confírmala aquí: ${link}`
          : `Hola, aquí está tu cotización ${cotizacion.numero}`;
        whatsapp = waUrl(cotizacion?.customer_phone, mensaje);
        if (whatsapp) window.open(whatsapp, '_blank');
      }

      await loadCotizacion();
      setConfirmCorreo(d?.correo ?? null);
      setConfirmCanal(selectedChannel);
      setConfirmWhatsapp(whatsapp);
      setShowChannelModal(false);
      setSelectedChannel(null);
      if (link) setConfirmLink(link);
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
    // N1: con anticipo por verificar (lo que pide la modalidad o el % manual, menos el saldo a favor de un
    // pedido cancelado), primero se registra el pago en el modal; sin anticipo (credito) se crea directo.
    if (Number(cotizacion.anticipo_por_verificar) > 0) {
      setVerificarError('');
      setShowVerificar(true);
      return;
    }
    await crearPedido();
  }

  async function crearPedido(verificacion?: Record<string, unknown>) {
    if (!cotizacion?.id) return;
    setConfirming(true);
    setVerificarError('');
    try {
      const d = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({user_name: currentUser, ...(verificacion && {verificacion_anticipo: verificacion})}),
      });
      const dataObj = d?.data ?? d;
      const pvenNumero = dataObj?.pedido_venta?.numero || d?.pedido_venta?.numero || '';
      setShowVerificar(false);
      await loadCotizacion();
      if (pvenNumero) setPvenCreadoNumero(pvenNumero);
    } catch (err: any) {
      // El 422 de la verificacion (pago, metodo, fecha...) se muestra dentro del modal.
      if (verificacion) setVerificarError(err.message);
      else alert('Error al confirmar la venta: ' + err.message);
    }
    setConfirming(false);
  }

  // R3: anticipo manual (pct + nota) o null para volver a la modalidad; el 409/422 se ve en el modal.
  async function guardarAjusteAnticipo(pct: number | null, nota?: string) {
    if (!cotizacion?.id) return;
    setAjusteSaving(true);
    setAjusteError('');
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ anticipo_pct_manual: pct, anticipo_manual_nota: pct === null ? null : nota, updated_by: currentUser }),
      });
      setShowAjuste(false);
      await loadCotizacion();
    } catch (err: any) {
      setAjusteError(err.message);
    }
    setAjusteSaving(false);
  }

  function onCalcSave(data: any) {
    // H46: solo un pedido VIGENTE recibe los precios nuevos; uno cancelado nunca se reescribe.
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
        // recotizacion: el backend lo deja en la Actividad como RECOTIZADA aunque los precios queden igual.
        body: JSON.stringify({ ...data, recotizacion: true, updated_by: currentUser }),
      });
      if (propagarAPven && pvenVigente) {
        // A3: solo productos y precios; el servidor recalcula saldo y anticipo desde los pagos del pedido.
        // El PATCH del pedido ya registra su propio renglon de Actividad (con el detalle de lo que
        // cambio); "motivo" le pone el titulo, en vez de un segundo POST /actividad que duplicaria el evento.
        await apiFetch(`/ventas/pedidos/${pvenVigente.id}`, {
          method: 'PATCH',
          body: JSON.stringify(propagacionRecotizacion(data, pvenVigente, cotizacion?.numero, currentUser)),
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
      // N7: la solicitud sigue activa; desde ella se crea la nueva cotizacion.
      router.push(cotizacion.sc_id ? `/dashboard/ventas/solicitud/${cotizacion.sc_id}` : '/dashboard/ventas/cotizacion');
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

  // Cada estado le dice al usuario cual es su siguiente paso, en vez de dejar botones
  // sueltos (incluido "Enviar al Cliente", que el backend rechaza mientras la cotizacion
  // no tenga productos ni precio calculado).
  const cotizada = productos.length > 0 && Number(cotizacion?.total_cop) > 0;
  // La tarjeta de siguiente paso ya ofrece "Calcular Precios" en este caso; evita
  // repetir el mismo boton justo debajo.
  const cardOfreceCalculo = !pvenVigente && !cotizada
    && (estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA');
  const LINK_ACCION = 'flex items-center justify-center gap-2 rounded-xl font-bold px-6 py-3 text-sm text-white shadow-md';

  function renderSiguientePaso() {
    if (!cotizacion) return null;
    if (pvenVigente) {
      return (
        <NextStepCard
          tone="emerald"
          title="Pedido de Venta generado"
          actions={(
            <Link href={`/dashboard/ventas/venta/${pvenVigente.id}?return_to=${encodeURIComponent(currentPath)}`} className={`${LINK_ACCION} bg-emerald-600 hover:bg-emerald-700`}>
              Ver {pvenVigente.numero} <ArrowRight size={14} />
            </Link>
          )}
        >
          La cotización ya se convirtió en pedido. El seguimiento (compra, entrega) continúa en el Pedido de Venta.
        </NextStepCard>
      );
    }
    if (situacion.paso === 'reabrir') {
      // CONFIRMADA sin confirmacion del cliente vigente: el servidor no la convierte (400). Con pedido cancelado es el
      // dato antiguo de H46; sin pedidos, una confirmacion anterior a Gate 2. Una COT re-confirmada va a "Crear Pedido".
      return (
        <NextStepCard
          tone="rose"
          title={pvenCancelado ? `El pedido ${pvenCancelado.numero} se canceló` : 'Falta la confirmación del cliente'}
          actions={<Button color="rose" size="lg" icon={RotateCcw} onClick={() => changeEstado('BORRADOR')}>Reabrir cotización</Button>}
        >
          {pvenCancelado
            ? 'Para crear otro pedido, reabre la cotización: podrás ajustarla y enviársela de nuevo al cliente.'
            : 'Esta cotización figura como confirmada, pero no tiene una confirmación del cliente vigente: reábrela y envíasela de nuevo para que la confirme.'}
        </NextStepCard>
      );
    }
    if (situacion.paso === 'crear_pedido') {
      // Tambien la re-confirmada tras cancelar el pedido: el pedido nuevo recibe el saldo a favor (R6).
      return (
        <NextStepCard
          tone="emerald"
          title="El cliente confirmó la cotización"
          actions={rolGestiona
            ? <Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} onClick={handleConfirmarVenta}>Crear Pedido de Venta</Button>
            : undefined}
        >
          {rolGestiona
            ? 'Crea el Pedido de Venta para pasar a compra y entrega.'
            : 'El asesor o Administración crea el Pedido de Venta para pasar a compra y entrega.'}
          {pvenCancelado && Number(cotizacion.saldo_a_favor) > 0
            && ` El saldo a favor del pedido cancelado ${pvenCancelado.numero} (${fCOP(cotizacion.saldo_a_favor)}) pasa al pedido nuevo.`}
        </NextStepCard>
      );
    }
    if (estadoActual === 'PENDIENTE_CONFIRMACION') {
      return (
        <NextStepCard tone="blue" title="Esperando confirmación del cliente">
          Cuando el cliente confirme desde el enlace, aquí aparecerá &ldquo;Crear Pedido de Venta&rdquo;. Si el enlace venció
          (dura 2 días) o no le llegó, pasa la cotización a Borrador desde &ldquo;Cambiar Estado&rdquo; y envíala de nuevo
          para generar uno nuevo.
        </NextStepCard>
      );
    }
    if (estadoActual === 'RECHAZADA' || estadoActual === 'VENCIDA') {
      return (
        <NextStepCard
          tone="slate"
          title={`Cotización ${estadoActual === 'RECHAZADA' ? 'rechazada' : 'vencida'}`}
          actions={cotizacion.sc_id ? (
            <Link href={`/dashboard/ventas/solicitud/${cotizacion.sc_id}?return_to=${encodeURIComponent(currentPath)}`} className={`${LINK_ACCION} bg-slate-600 hover:bg-slate-700`}>
              Ir a {cotizacion.sc_numero || 'la solicitud'} <ArrowRight size={14} />
            </Link>
          ) : undefined}
        >
          {cotizacion.sc_id
            ? `La solicitud ${cotizacion.sc_numero || ''} sigue activa: puedes crearle una nueva cotización desde la solicitud, o retomar esta pasándola a Borrador desde “Cambiar Estado”.`
            : 'Para retomarla, pásala a Borrador desde “Cambiar Estado”, ajusta los precios y envíala de nuevo.'}
        </NextStepCard>
      );
    }
    // BORRADOR / ENVIADA
    if (!cotizada) {
      return (
        <NextStepCard
          tone="amber"
          title="Calcula los precios de la cotización"
          actions={<Button color="blue" size="lg" icon={Calculator} onClick={() => setShowCalc(true)}>Cotizar — Calcular Precios</Button>}
        >
          Hasta que tenga precios, la cotización no se puede enviar al cliente ni convertir en pedido.
        </NextStepCard>
      );
    }
    return (
      <NextStepCard
        tone="blue"
        title={estadoActual === 'ENVIADA' ? 'Enviada al cliente: reenvíala si hace falta' : 'Envía la cotización al cliente para que la confirme'}
        actions={(
          <Button color="blue" size="lg" icon={Send} loading={sending} onClick={handleEnviarCotizacion}>
            {estadoActual === 'ENVIADA' ? 'Re-enviar al Cliente' : 'Enviar al Cliente'}
          </Button>
        )}
      >
        El cliente confirma desde un enlace de un solo uso. Cuando lo haga, podrás crear el Pedido de Venta.
      </NextStepCard>
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
          {safeReturnTo && (
            <Link href={safeReturnTo} className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline whitespace-nowrap">
              ← Volver
            </Link>
          )}
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
                  <Link href={`/dashboard/ventas/solicitud/${cotizacion.sc_id}?return_to=${encodeURIComponent(currentPath)}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
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

            {/* H35+H48: la nota ACTUAL de la solicitud (se lee en vivo, nunca se copia) aparte de la de la cotizacion. */}
            {(cotizacion?.sc_notas || cotizacion?.notas) && (
              <div className="space-y-3 mb-10">
                {cotizacion?.sc_notas && (
                  <div className="bg-amber-50 border border-amber-100 rounded-xl p-4">
                    <p className="text-xs font-black text-amber-700 uppercase mb-1.5">Nota de la solicitud</p>
                    <p className="text-sm text-amber-900 whitespace-pre-wrap">{cotizacion.sc_notas}</p>
                  </div>
                )}
                {cotizacion?.notas && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-black text-blue-600 uppercase mb-1.5">Nota de la cotización</p>
                    <p className="text-sm text-blue-900 whitespace-pre-wrap">{cotizacion.notas}</p>
                  </div>
                )}
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
                <div className="w-80 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  <div className="flex justify-between items-center mb-3">
                    <span className="text-sm font-bold text-slate-500">Subtotal</span>
                    <span className="font-bold text-slate-800">{fCOP(cotizacion?.subtotal_cop)}</span>
                  </div>
                  <div className="flex justify-between items-center mb-4">
                    <span className="text-sm font-bold text-slate-500">Descuento ({Number(cotizacion?.descuento_pct) || 0}%)</span>
                    <span className="font-bold text-slate-800">
                      {fCOP((Number(cotizacion?.subtotal_cop) || 0) - (Number(cotizacion?.total_cop) || 0))}
                    </span>
                  </div>
                  <div className="h-px w-full bg-slate-200 mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-black text-slate-800">TOTAL</span>
                    <span className="text-xl font-black text-blue-600">{fCOP(cotizacion?.total_cop)}</span>
                  </div>
                  {/* H36+H43 / R3: anticipo y saldo. Ya convertida: los valores del pedido (el GET recalcula con la
                      modalidad de hoy, que ya no es el trato). */}
                  {Number(cotizacion?.total_cop) > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-slate-500">{anticipo.convertida ? 'Anticipo del pedido' : 'Anticipo requerido'} ({anticipo.etiqueta})</span>
                        <span className="font-bold text-slate-800 shrink-0">{fCOP(anticipo.requerido)}</span>
                      </div>
                      {anticipo.convertida && (
                        <div className="flex justify-between gap-2">
                          <span className="font-bold text-slate-500">Pagado (verificado)</span>
                          <span className="font-bold text-emerald-700 shrink-0">{fCOP(anticipo.pagado)}</span>
                        </div>
                      )}
                      <div className="flex justify-between gap-2">
                        <span className="font-bold text-slate-500">Saldo</span>
                        <span className="font-bold text-slate-800 shrink-0">{fCOP(anticipo.saldo)}</span>
                      </div>
                      {anticipo.convertida && Number(anticipo.pendiente) > 0 && (
                        <p className="text-xs font-bold text-amber-700">Anticipo pendiente: {fCOP(anticipo.pendiente)}</p>
                      )}
                      {anticipo.manual && (
                        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2 py-1">
                          Anticipo manual: {formatoPct(anticipo.manual.pct)}{anticipo.manual.nota ? ` — ${anticipo.manual.nota}` : ''}
                        </p>
                      )}
                      {puedeAjustarAnticipo && (
                        <button onClick={() => { setAjusteError(''); setShowAjuste(true); }} className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline">
                          Ajustar anticipo
                        </button>
                      )}
                    </div>
                  )}
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
                      enlace publico (estado === 'CONFIRMADA') y no hay pedido vigente -- lo decide
                      renderSiguientePaso(). pvenCreadoNumero (mensaje de exito, 4 s) va aparte:
                      loadCotizacion() ya deja el pedido vigente ANTES de que este mensaje se
                      renderice, asi que la tarjeta ya muestra "Pedido de Venta generado". */}
                  {pvenCreadoNumero && (
                    <div className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm font-bold animate-in fade-in">
                      <CheckCircle2 size={16} /> Pedido {pvenCreadoNumero} creado exitosamente
                    </div>
                  )}

                  {/* H46+U25: el ultimo pedido se cancelo; la cotizacion se ajusta, se reenvia y da otro pedido. No se
                      muestra si el cliente ya la confirmo otra vez (confirmacion vigente: toca crear el pedido). */}
                  {situacion.avisoCancelado && pvenCancelado && (
                    <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-1">
                      <p className="text-sm font-black text-rose-800">Pedido {pvenCancelado.numero} cancelado</p>
                      {pvenCancelado.cancellation_reason && <p className="text-xs text-rose-700">Motivo: {pvenCancelado.cancellation_reason}</p>}
                      {(pvenCancelado.cancellation_authorized_by || pvenCancelado.cancelled_at) && (
                        <p className="text-xs text-rose-600">
                          {[pvenCancelado.cancellation_authorized_by && `Por ${pvenCancelado.cancellation_authorized_by}`,
                            pvenCancelado.cancelled_at && fDate(comoUTC(pvenCancelado.cancelled_at))].filter(Boolean).join(' · ')}
                        </p>
                      )}
                      <Link href={`/dashboard/ventas/venta/${pvenCancelado.id}?return_to=${encodeURIComponent(currentPath)}`} className="inline-block text-xs font-bold text-rose-700 hover:underline">
                        Ver {pvenCancelado.numero}
                      </Link>
                      <p className="text-xs text-rose-700">Ajusta la cotización si hace falta y envíasela de nuevo al cliente; cuando la confirme podrás crear otro pedido.</p>
                    </div>
                  )}

                  {renderSiguientePaso()}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    {!cardOfreceCalculo && (
                      <Button color={Number(cotizacion?.total_cop) > 0 ? 'orange' : 'blue'}
                        icon={Number(cotizacion?.total_cop) > 0 ? RotateCcw : Calculator}
                        onClick={() => setShowCalc(true)}>
                        {Number(cotizacion?.total_cop) > 0 ? 'Re-Cotizar — Actualizar Precios' : 'Cotizar — Calcular Precios'}
                      </Button>
                    )}
                    {!pvenVigente && estadoActual !== 'CONFIRMADA' && (
                      <div className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-400 text-xs font-bold text-center">
                        El Pedido de Venta se habilita cuando el cliente confirma la cotización
                      </div>
                    )}
                  </div>

                  {estadoActual !== 'CONFIRMADA' && (
                    <div className="pt-4 border-t border-slate-100">
                      <p className="text-xs font-black text-slate-400 uppercase mb-2">Cambiar Estado</p>
                      {/* H50: lista blanca igual a la del backend (ESTADOS_COT_MANUALES): Borrador, Rechazada
                          y Vencida. 'Enviada al cliente', PENDIENTE_CONFIRMACION y CONFIRMADA solo se
                          alcanzan por "Enviar al Cliente" (crea y envía el enlace real) y por el enlace del
                          cliente. Esta pastilla SI sigue visible mientras la cotización esta
                          PENDIENTE_CONFIRMACION: pasarla a Borrador es la salida de ese ciclo (revoca el
                          enlace) para una cotizacion enviada por error, y retoma una Rechazada (N7: el
                          servidor responde 409 si la solicitud ya tiene otra activa). Un solo <select>,
                          mismo patron que venta/[id]/page.tsx. */}
                      <select
                        value=""
                        onChange={e => {
                          const k = e.target.value;
                          if (!k) return;
                          if (k === 'RECHAZADA' && !window.confirm(cotizacion.sc_id
                            ? `¿Marcar como Rechazada? La solicitud ${cotizacion.sc_numero || ''} seguirá activa y podrás crearle otra cotización.`
                            : '¿Marcar como Rechazada?')) return;
                          changeEstado(k);
                        }}
                        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold text-slate-600 outline-none focus:ring-2 focus:ring-amber-200 mb-3">
                        <option value="">Seleccionar nuevo estado...</option>
                        {Object.entries(ESTADOS_COT).filter(([k]) => ['BORRADOR', 'RECHAZADA', 'VENCIDA'].includes(k) && k !== estadoActual).map(([k, v]: any) => (
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
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Línea Temporal</h4>

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
                      <CambiosDeActividad extra={a.extra_data} />
                      {a.old_estado && a.new_estado && (
                        <p className="flex items-center gap-1.5 mb-3 flex-wrap">
                          <EstadoBadge estado={a.old_estado} /><ArrowRight size={10} className="text-slate-300" /><EstadoBadge estado={a.new_estado} />
                        </p>
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
              <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavía.</p>
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
          customerHasPhone={!!waUrl(cotizacion?.customer_phone)}
          customerEmail={cotizacion?.customer_email ?? null}
        />
      )}
      {showVerificar && cotizacion && (
        <VerificarAnticipoModal
          cot={cotizacion}
          verificador={getUsuarioActual().email}
          saving={confirming}
          error={verificarError}
          onConfirm={(v) => crearPedido(v)}
          onCancel={() => { if (!confirming) { setShowVerificar(false); setVerificarError(''); } }}
        />
      )}
      {showAjuste && cotizacion && (
        <AjustarAnticipoModal
          cot={cotizacion}
          saving={ajusteSaving}
          error={ajusteError}
          onGuardar={(pct, nota) => guardarAjusteAnticipo(pct, nota)}
          onVolverModalidad={() => guardarAjusteAnticipo(null)}
          onCancel={() => { if (!ajusteSaving) setShowAjuste(false); }}
        />
      )}
      {showCalc && cotizacion && <CalculadorModal cot={cotizacion} onSave={onCalcSave} onClose={() => setShowCalc(false)} />}
      {showDelete && cotizacion && <DeleteConfirm cot={cotizacion} onConfirm={deleteCot} onCancel={() => setShowDelete(false)} />}
      {pendingCalcData && (
        <PropagarPvenConfirm
          pven={pvenVigente}
          totalAnterior={Number(cotizacion?.total_cop || 0)}
          totalNuevo={Number(pendingCalcData.total_cop || 0)}
          saving={savingCalc}
          onConfirm={() => commitCalcSave(pendingCalcData, true)}
          onCancel={() => commitCalcSave(pendingCalcData, false)}
        />
      )}
      {confirmLink && (
        <EnlaceConfirmacionModal documento={`la cotización ${cotizacion?.numero || ''}`} link={confirmLink} color="blue"
          correo={confirmCorreo} canal={confirmCanal} whatsappUrl={confirmWhatsapp} onClose={() => setConfirmLink(null)} />
      )}
    </div>
  );
}

// useSearchParams() exige un limite de Suspense para no romper el prerenderizado estatico
// (mismo patron que solicitud/[id] y venta/[id]).
export default function CotizacionDetallePage() {
  return (
    <Suspense fallback={(
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-blue-600" size={28} />
      </div>
    )}>
      <CotizacionDetalleContent />
    </Suspense>
  );
}
