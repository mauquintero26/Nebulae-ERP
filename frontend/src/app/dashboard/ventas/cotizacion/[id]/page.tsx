"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowRight, Send, FileText, CheckCircle2, Circle,
  MessageSquare, Calculator, Search, RefreshCw, Package, Trash2, RotateCcw,
  AlertCircle, AlertTriangle, XCircle, X, Activity, Sparkles
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import { Button, useAvisos } from '@/components/ui';
import {
  ChannelModal, CalculadorModal, DeleteConfirm, PropagarPvenConfirm, VerificarAnticipoModal, AjustarAnticipoModal,
  ESTADOS as ESTADOS_COT, EstadoBadge, fCOP, fDate, fTime,
} from '../cotizacion-client';
import type { AnulacionConfirmacion } from '../cotizacion-client';
import { NextStepCard, EnlaceConfirmacionModal, CambiosDeActividad, CabeceraActividad, returnToSeguro, getUsuarioActual, BotonVolver } from '../../flujo';
import { ChatterDocumento, EtiquetaChatter } from '../../chatter';
import { situacionPedidoCotizacion } from '@/lib/listas-ventas';
import {
  resumenAnticipoCotizacion, formatoPct, propagacionRecotizacion, puedeGestionarCotizacion, notaAnticipoPorLinea,
} from '@/lib/dinero-ventas';
import { comoUTC, notaReiniciaAtraso } from '@/lib/hub-ventas';
import { waUrl, abrirWhatsApp } from '@/lib/whatsapp';
import { destinoVolver, anchoInicialPanel, inicialesAutor } from '@/lib/detalle-layout';
import { agregarActividad, esEntradaChatter, motivoTelefono, textoSinTelefono } from '@/lib/chatter';
import { ESTADOS_SC_SIN_CONFIRMAR, pideMotivoNuevo, errorMotivoSinConfirmacion } from '@/lib/estados-solicitud';
import { humanizarCodigo } from '@/lib/estados-pedido';
import { VentanaMotivoSinConfirmacion } from '../../motivo-sin-confirmacion';
// B3 T17: IVA, cambios del cliente, validez y reenvío, WhatsApp automático y recordatorio (las piezas nuevas viven en
// sus propios archivos; aquí solo se cablean, R15).
import { abreWhatsAppLocal, NOTA_REENVIO_ENLACE } from '@/lib/envio-whatsapp';
import { accionBloque3 } from '@/lib/acciones-bloque3';
import { avisoCambiosCliente } from '@/lib/cambios-cliente';
import { useEstadoEnvioWhatsApp } from '../estado-envio-whatsapp';
import { TarjetaCambiosCliente } from '../tarjeta-cambios-cliente';
import { PrecioLineaIva, TotalesIvaCotizacion, PasoEsperandoConfirmacion } from './detalle-bloque3';
import { AvisoNombreSinContacto } from '../../aviso-nombre-sin-contacto';

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
  // U11: el cliente confirmó la solicitud por su enlace y se mantiene esta cotización (creada antes).
  SC_CONFIRMADA:  {icon: CheckCircle2,  color: 'text-emerald-500 bg-emerald-50'},
};
const DEFAULT_ACTIVITY_STYLE = {icon: Activity, color: 'text-slate-500 bg-slate-50'};

// H40: el aviso que queda en Acciones después de anular la confirmación del cliente al re-cotizar.
const AVISO_CONFIRMACION_ANULADA = 'Se anuló la confirmación del cliente porque cambiaste la cotización. Envíasela de nuevo para que la confirme.';

function CotizacionDetalleContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = params.id === 'nueva';
  // "Volver al origen" (mismo patron que solicitud/[id] y venta/[id]): la Solicitud ya
  // construye ?return_to= al enlazar a esta cotizacion, pero esta pagina lo ignoraba.
  const safeReturnTo = returnToSeguro(searchParams?.get('return_to'));
  const currentPath = `/dashboard/ventas/cotizacion/${String(params.id || '')}`;
  // H49 (T1B): avisos y confirmaciones del sistema en lugar de window.alert / window.confirm.
  const { avisar, avisarError, confirmar } = useAvisos();

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
  // B3 T17 (RP23, U22-validez, U16-seguimiento): lo demás que trae el envío para la ventana del enlace: el resultado del
  // WhatsApp automático (envioWhatsapp, w minúscula), el último día del enlace (vence) y el recordatorio (seguimiento).
  const [confirmEnvio, setConfirmEnvio] = useState<{ envioWhatsapp: unknown; vence: string | null; seguimiento: unknown } | null>(null);
  // B3 T17 (U16-reenvio-cot, C13): el ChannelModal se abrió con «Reenviar al cliente» (la nota del reenvío y reenvio: true).
  const [reenviando, setReenviando] = useState(false);
  // B3 T17 (U16-envio punto 14): el estado del WhatsApp automático mientras el ChannelModal está abierto.
  const envioWhatsAppCanal = useEstadoEnvioWhatsApp(showChannelModal);
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
  // B3 T17 (U22-anticipo punto 5): el 409 ANULA_CONFIRMACION de «Ajustar anticipo» y el guardado que lo pidió (se repite
  // con la razón).
  const [ajusteAnulacion, setAjusteAnulacion] = useState<{ detalle: AnulacionConfirmacion; pct: number | null; nota?: string } | null>(null);
  // B2.1 D6: el 409 MOTIVO_NUEVO de retomar la cotización (la solicitud se canceló y se restauró después de crearla sin
  // confirmación): el cuerpo del PATCH que se reintenta con el motivo, el mensaje del servidor y la ventana del motivo.
  const [motivoNuevoPendiente, setMotivoNuevoPendiente] = useState<{ cuerpo: { estado: string; [campo: string]: unknown }; mensaje: string } | null>(null);
  const [motivoNuevo, setMotivoNuevo] = useState('');
  const [motivoNuevoError, setMotivoNuevoError] = useState('');
  const [guardandoMotivoNuevo, setGuardandoMotivoNuevo] = useState(false);

  // Acciones (Calculadora / Eliminar / Propagar a Pedido de Venta)
  const [showCalc, setShowCalc] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [pendingCalcData, setPendingCalcData] = useState<any | null>(null);
  const [savingCalc, setSavingCalc] = useState(false);
  const [creatingProductIdx, setCreatingProductIdx] = useState<number | null>(null);
  // H40: el 409 ANULA_CONFIRMACION (qué cambió y el mensaje del servidor) mientras la calculadora pide la razón, y el
  // aviso que queda en Acciones después de anular la confirmación del cliente.
  const [calcAnulacion, setCalcAnulacion] = useState<AnulacionConfirmacion | null>(null);
  const [avisoAnulada, setAvisoAnulada] = useState<string | null>(null);
  // Ronda 2 (punto 1): el número del último guardado de la calculadora (commitCalcSave). Solo ese apaga savingCalc.
  const guardadoCalcRef = useRef(0);

  // U6+H22 (C11): Actividad | Chatter | IA, el mismo orden de la solicitud. Las notas se escriben en el Chatter.
  const [cotPanelTab, setCotPanelTab] = useState<'actividad' | 'chatter' | 'ia'>('actividad');
  const [cotAnalisis, setCotAnalisis] = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  // T9A (patrón H29 de solicitud/[id]): con { silencioso: true } no se muestra el spinner de página (no se desmontan la
  // calculadora ni las ventanas abiertas) y, si falla, queda lo que ya está en pantalla. Cada carga toma un número y
  // solo la ÚLTIMA pinta la cotización: una recarga vieja no pisa datos más nuevos. Devuelve la cotización que pintó (o
  // null), para decidir después de un error de la calculadora (ronda 1, puntos 4 y 6).
  const cargaRef = useRef(0);
  const loadCotizacion = useCallback(async (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso === true;
    if (isNew || !params.id) { if (!silencioso) setLoading(false); return null; }
    const miCarga = ++cargaRef.current;
    const esLaUltima = () => miCarga === cargaRef.current;
    let pintada: { estado?: string } | null = null;
    if (!silencioso) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const raw = await apiFetch(`/ventas/cotizaciones/${params.id}`);
      const d = raw?.data ?? raw;
      if (esLaUltima()) {
        setCotizacion(d);
        pintada = d;
      }
    } catch (err: any) {
      if (!silencioso && esLaUltima()) setLoadError(err.message || 'No se pudo cargar la cotización');
    }
    if (!silencioso) setLoading(false);
    return pintada;
  }, [params.id, isNew]);

  useEffect(() => { loadCotizacion(); }, [loadCotizacion]);

  // T9A (patrón de T8A): false cuando la pantalla se desmonta. Una acción que vuelve después ya no lleva al usuario a
  // otra pantalla: le avisa con un enlace.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  useEffect(() => {
    if (pvenCreadoNumero) {
      const t = setTimeout(() => setPvenCreadoNumero(null), 4000);
      return () => clearTimeout(t);
    }
  }, [pvenCreadoNumero]);

  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(400);
  // H37/C12: el ancho inicial según la ventana (300-400 px: a 1024 px el contenido de la izquierda gana espacio). En un
  // efecto al montar y no en el useState, para no romper la hidratación; después se sigue arrastrando (300-800).
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- C12: ancho inicial tras montar, sin romper la hidratación
    setRightWidth(anchoInicialPanel(window.innerWidth));
  }, []);
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
  // U19+U21 (C10, ruling T9A-2): la nota bajo TOTALES sobre el anticipo de cada producto (null sin anticipo_por_linea).
  const notaLineas = notaAnticipoPorLinea(cotizacion, anticipo);
  // H40: la calculadora avisa desde que se abre que guardar precios anula la confirmación del cliente (CONFIRMADA) o el
  // enlace que tiene (PENDIENTE_CONFIRMACION). Con pedido vigente no: sigue 'Actualizar Pedido de Venta'. Refleja al
  // servidor: una CONFIRMADA sin confirmación vigente ('reabrir') también responde 409 (ruling T9A-6).
  const estadoConfirmacionCalc: 'CONFIRMADA' | 'PENDIENTE_CONFIRMACION' | null =
    (estadoActual === 'CONFIRMADA' || estadoActual === 'PENDIENTE_CONFIRMACION') && !pvenVigente ? estadoActual : null;
  // B4: solo los roles que el servidor acepta en PATCH /cotizaciones/{id} y POST /confirmar (Administración y asesor).
  const rolGestiona = puedeGestionarCotizacion(getUsuarioActual().role);
  const puedeAjustarAnticipo = rolGestiona && !pvenVigente && !['RECHAZADA', 'CANCELADA'].includes(estadoActual);

  function handleEnviarCotizacion() {
    if (!cotizacion?.id) return;
    setReenviando(false);
    setShowChannelModal(true);
  }

  // B3 T17 (U16-reenvio-cot, C13): «Reenviar al cliente» de una cotización que espera al cliente: el mismo ChannelModal,
  // con la nota del reenvío; confirmarEnvio manda reenvio: true.
  function handleReenviarCotizacion() {
    if (!cotizacion?.id) return;
    setReenviando(true);
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
        // B3 T7 (r1): el reenvío lleva reenvio: true; si la cotización cambió mientras tanto, el servidor responde 409.
        body: JSON.stringify({user_name: currentUser, canal: selectedChannel, ...(reenviando ? { reenvio: true } : {})}),
      });
      const link = d?.link_confirmacion || '';
      let whatsapp: string | null = null;
      // B3 T17 (U16-envio punto 14): wa.me solo si el automático no vino o está apagado (nunca dos mensajes), con el texto
      // que devolvió el servidor (texto_manual, con el enlace) o el de siempre, y al telefono_whatsapp (el e164, RP19).
      const wa = d?.whatsapp ?? null;
      if (abreWhatsAppLocal(selectedChannel, wa)) {
        // Hallazgo #3 (spec): el mensaje de WhatsApp debe incluir el link -- sin esto,
        // un cliente que solo recibe por WhatsApp (o sin email registrado) no tenia
        // ninguna forma real de llegar al link de confirmacion.
        const mensaje = link
          ? `Hola, aquí está tu cotización ${cotizacion.numero}. Confírmala aquí: ${link}`
          : `Hola, aquí está tu cotización ${cotizacion.numero}`;
        whatsapp = waUrl(cotizacion?.telefono_whatsapp, wa?.texto_manual || mensaje);
        abrirWhatsApp(whatsapp);
      }

      await loadCotizacion();
      setConfirmCorreo(d?.correo ?? null);
      setConfirmCanal(selectedChannel);
      setConfirmWhatsapp(whatsapp);
      setConfirmEnvio({ envioWhatsapp: wa, vence: d?.vence ?? null, seguimiento: d?.seguimiento ?? null });
      setShowChannelModal(false);
      setSelectedChannel(null);
      // H40: ya se le envió de nuevo; el aviso 'Envíasela de nuevo' sobra.
      setAvisoAnulada(null);
      if (link) setConfirmLink(link);
    } catch (err: any) {
      avisarError(err, 'No se pudo enviar la cotización');
      // B3 T7 (r1): con el 409 «La cotización cambió mientras la reenviabas…» (el cliente pidió cambios o la editaron) la
      // recarga la trae fuera de Pendiente: el reenvío ya no aplica y la ventana se cierra. Otro 409 la deja abierta.
      if (recargarTrasError(err)) {
        void loadCotizacion({ silencioso: true }).then(fresca => {
          if (reenviando && fresca && fresca.estado !== 'PENDIENTE_CONFIRMACION') cancelarEnvio();
        });
      }
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
      avisar('No hay productos ni notas. Cotiza primero o agrega información antes de confirmar.', { tono: 'error' });
      return;
    }
    if (!hasProds && hasNotes) {
      const ok = await confirmar({
        titulo: 'Crear el pedido sin productos',
        mensaje: 'La cotización no tiene productos; solo las notas los mencionan.',
        textoConfirmar: 'Crear pedido de todas formas',
      });
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
      else avisarError(err, 'No se pudo crear el pedido');
      if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
    }
    setConfirming(false);
  }

  // R3: anticipo manual (pct + nota) o null para volver a la modalidad; el 409/422 se ve en el modal.
  // B3 T17 (U22-anticipo punto 5): si el cliente ya vio o confirmó la cotización, el 409 ANULA_CONFIRMACION (no guardó
  // nada) abre en el modal la ventana de H40; con la razón (`anular`) se repite este mismo guardado.
  async function guardarAjusteAnticipo(pct: number | null, nota?: string,
    anular?: { anular_confirmacion: true; motivo_recotizacion: string }) {
    if (!cotizacion?.id) return;
    setAjusteSaving(true);
    setAjusteError('');
    try {
      const r = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ anticipo_pct_manual: pct, anticipo_manual_nota: pct === null ? null : nota, updated_by: currentUser, ...anular }),
      });
      setShowAjuste(false);
      setAjusteAnulacion(null);
      // H40: la cotización volvió a Borrador; el aviso de Acciones pide enviársela de nuevo.
      if (r?.confirmacion_anulada) setAvisoAnulada(AVISO_CONFIRMACION_ANULADA);
      await loadCotizacion();
    } catch (err: any) {
      if (!anular && err?.status === 409 && err?.detail?.codigo === 'ANULA_CONFIRMACION') {
        setAjusteAnulacion({ detalle: err.detail, pct, nota });
      } else {
        setAjusteError(err.message);
        if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
      }
    }
    setAjusteSaving(false);
  }

  function cerrarAjuste() {
    if (ajusteSaving) return;
    setShowAjuste(false);
    setAjusteAnulacion(null);
  }

  function onCalcSave(data: any) {
    // H46: solo un pedido VIGENTE recibe los precios nuevos; uno cancelado nunca se reescribe. Ronda 1 (punto 2): sin
    // precios en el cuerpo (solo notas o fecha) no hay nada que pasar al pedido: se guarda directo.
    if (pvenVigente && Array.isArray(data?.productos)) {
      setShowCalc(false);
      setCalcAnulacion(null);
      setPendingCalcData(data);
      return;
    }
    commitCalcSave(data, false, true);
  }

  // H40: `desdeCalculadora` = la calculadora sigue abierta. Ahí el 409 ANULA_CONFIRMACION (el cliente ya confirmó la
  // cotización o tiene el enlace) no guarda nada: la calculadora queda inerte (ronda 1: fieldset deshabilitado), muestra
  // qué cambió y pide la razón, y con ella reenvía exactamente lo que describió el 409, con anular_confirmacion y
  // motivo_recotizacion (R7); solo «Seguir editando» vuelve a habilitar la edición. Desde 'Actualizar Pedido de Venta'
  // (pedido vigente) no se puede pedir la razón: el 409 sale como aviso de error.
  // Ronda 2 (punto 1): cada guardado toma un número y apaga savingCalc una sola vez, y solo si sigue siendo el último. Así
  // la recarga tardía de un guardado viejo ya no apaga el de otro con su PATCH en curso (doble envío o la ventana
  // cerrada a mitad).
  async function commitCalcSave(data: any, propagarAPven: boolean, desdeCalculadora = false) {
    if (!cotizacion?.id) return;
    const miGuardado = ++guardadoCalcRef.current;
    let terminado = false;
    const guardado = {
      vigente: () => guardadoCalcRef.current === miGuardado,
      terminar: () => {
        if (terminado) return;
        terminado = true;
        if (guardadoCalcRef.current === miGuardado) setSavingCalc(false);
      },
    };
    // Ronda 1 (punto 2): la calculadora manda los precios solo si cambiaron (cuerpoDeGuardado). Sin precios el guardado
    // no es una re-cotización: no lleva `recotizacion` ni deja un renglón RECOTIZADA.
    const conPrecios = Array.isArray(data?.productos);
    setSavingCalc(true);
    try {
      const r = await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        // recotizacion: el backend lo deja en la Actividad como RECOTIZADA aunque los precios queden igual.
        body: JSON.stringify({ ...data, ...(conPrecios ? { recotizacion: true } : {}), updated_by: currentUser }),
      });
      if (propagarAPven && pvenVigente) {
        // A3: solo productos y precios; el servidor recalcula saldo y anticipo desde los pagos del pedido.
        // El PATCH del pedido ya registra su propio renglon de Actividad (con el detalle de lo que
        // cambio); "motivo" le pone el titulo, en vez de un segundo POST /actividad que duplicaria el evento.
        // B3 T17 (IVA punto 11): con la RESPUESTA del PATCH (lo que guardó el servidor, con su IVA), no con lo calculado
        // en el navegador: productos, subtotal, IVA, descuento y total, y el crédito se mide con ese total. r1: sin esa
        // respuesta no se propaga nada (null): se avisa, y la recarga de abajo muestra cómo quedó.
        const cuerpoPedido = propagacionRecotizacion(r?.data, pvenVigente, cotizacion?.numero, currentUser);
        if (cuerpoPedido) {
          await apiFetch(`/ventas/pedidos/${pvenVigente.id}`, { method: 'PATCH', body: JSON.stringify(cuerpoPedido) });
        } else {
          // r2: el texto exacto del controlador (re-cotizar sin cambiar un precio no propagaría nada).
          avisar('La cotización se guardó, pero el pedido no se actualizó: recarga la página y revisa el pedido.', { tono: 'error' });
        }
      }
      setShowCalc(false);
      setPendingCalcData(null);
      setCalcAnulacion(null);
      // H40: confirmacion_anulada va en el nivel superior de la respuesta (T4); por si acaso también se mira en data.
      if (r?.confirmacion_anulada ?? r?.data?.confirmacion_anulada) setAvisoAnulada(AVISO_CONFIRMACION_ANULADA);
      await loadCotizacion();
    } catch (err: any) {
      await errorAlGuardarCalculo(err, data, desdeCalculadora, guardado);
    }
    guardado.terminar();
  }

  // H40 y ronda 1 (puntos 4 y 6): un guardado de la calculadora que falló. `guardado` es el de commitCalcSave (ronda 2).
  async function errorAlGuardarCalculo(
    err: { status?: number | null; detail?: AnulacionConfirmacion } | null | undefined,
    data: { anular_confirmacion?: boolean } | null | undefined,
    desdeCalculadora: boolean,
    guardado: { vigente: () => boolean; terminar: () => void },
  ) {
    // R10: apiFetch deja el status y el detail del servidor en el error.
    const anula = err?.status === 409 && err?.detail?.codigo === 'ANULA_CONFIRMACION';
    // Punto 6: «Guardar y anular la confirmación» sin respuesta del servidor (la red se cortó): pudo guardarse. Se
    // cierra el panel rosa y la recarga dice qué pasó antes de avisar nada (mientras, la calculadora sigue ocupada).
    const anulandoSinRespuesta = data?.anular_confirmacion === true && (err?.status === undefined || err?.status === null);
    // Punto 4: el estado que describe el panel rosa: el del 409 que lo abre o, si ya estaba abierto, el suyo.
    const estadoDelPanel = anula && desdeCalculadora ? err?.detail?.estado : calcAnulacion?.estado;
    if (anula && desdeCalculadora) {
      setCalcAnulacion(err?.detail ?? null);
    } else if (anulandoSinRespuesta) {
      setCalcAnulacion(null);
    } else {
      if (anula) setPendingCalcData(null);
      avisarError(err, 'No se pudo guardar la cotización');
    }
    if (!recargarTrasError(err)) return;
    // El panel rosa (o «Actualizar Pedido de Venta») responde sin esperar la recarga; anulando sin respuesta, no.
    if (!anulandoSinRespuesta) guardado.terminar();
    const fresca = await loadCotizacion({ silencioso: true });
    // Ronda 2 (punto 1): si mientras recargaba empezó otro guardado, lo que traiga la recarga ya no decide nada aquí.
    if (!guardado.vigente()) return;
    // Punto 4: la cotización ya no está en el estado que describe el panel rosa (el cliente confirmó, se rechazó…): el
    // panel ya no aplica y la calculadora vuelve a editarse.
    if (estadoDelPanel && fresca && fresca.estado !== estadoDelPanel) setCalcAnulacion(null);
    if (!anulandoSinRespuesta) return;
    if (fresca?.estado === 'BORRADOR') {
      // El servidor sí lo guardó: la confirmación quedó anulada.
      if (vivo.current) {
        setShowCalc(false);
        setAvisoAnulada(AVISO_CONFIRMACION_ANULADA);
      } else {
        avisar(`${cotizacion?.numero || 'Cotización'}: ${AVISO_CONFIRMACION_ANULADA}`,
          { tono: 'info', accion: { texto: 'Ver cotización', href: currentPath } });
      }
    } else if (vivo.current) {
      avisarError(err, 'No se pudo guardar la cotización');
    } else {
      // Ronda 2 (punto 4): ya no está en la página: el error también lleva el enlace (avisarError no acepta una acción;
      // esto es lo mismo que hace, con la acción).
      console.error(err);
      avisar(textoDeError(err, `No se pudo guardar la cotización ${cotizacion?.numero || ''}`.trim()),
        { tono: 'error', accion: { texto: 'Ver cotización', href: currentPath } });
    }
  }

  async function changeEstado(newEstado: string) {
    if (!cotizacion?.id) return;
    // B2.1 D6: el cuerpo se guarda para reintentarlo con el motivo nuevo si el servidor lo pide.
    const cuerpo = { estado: newEstado, updated_by: currentUser };
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify(cuerpo),
      });
      await loadCotizacion();
    } catch (err: any) {
      // B2.1 D6: retomarla después de cancelar y restaurar la solicitud pide un motivo nuevo (409 MOTIVO_NUEVO; no cambió
      // nada): se abre la ventana del motivo con este cuerpo, sin aviso de error. Si el usuario ya salió de la
      // cotización, el aviso de error lleva el mensaje del servidor.
      if (pideMotivoNuevo(err) && vivo.current) {
        abrirMotivoNuevo(cuerpo, err);
        return;
      }
      avisarError(err, 'No se pudo cambiar el estado');
      if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
    }
  }

  function abrirMotivoNuevo(cuerpo: { estado: string; [campo: string]: unknown }, err: { detail?: { mensaje?: unknown } } | null) {
    const delServidor = err?.detail?.mensaje;
    const mensaje = typeof delServidor === 'string' && delServidor.trim() ? delServidor : textoDeError(err);
    setMotivoNuevo('');
    setMotivoNuevoError('');
    setMotivoNuevoPendiente({ cuerpo, mensaje });
  }

  // B2.1 D6: el reintento del PATCH que pidió el motivo nuevo: el mismo cuerpo más motivo_sin_confirmacion (el servidor
  // lo limpia y lo valida con las reglas de S5; su 422 o un 409 se ven en la ventana). Mientras guarda, la ventana no se
  // cierra. Si el usuario ya salió de la cotización, se le avisa con un enlace (patrón T9A).
  async function retomarConMotivoNuevo() {
    if (!cotizacion?.id || !motivoNuevoPendiente) return;
    const errorMotivo = errorMotivoSinConfirmacion(motivoNuevo);
    if (errorMotivo) {
      setMotivoNuevoError(errorMotivo);
      return;
    }
    setGuardandoMotivoNuevo(true);
    setMotivoNuevoError('');
    const nombre = cotizacion.numero ? `la cotización ${cotizacion.numero}` : 'la cotización';
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...motivoNuevoPendiente.cuerpo, motivo_sin_confirmacion: motivoNuevo.trim() }),
      });
      if (!vivo.current) {
        avisar(`Se retomó ${nombre} con el motivo nuevo`, { accion: { texto: 'Ver cotización', href: currentPath } });
        return;
      }
      setMotivoNuevoPendiente(null);
      setGuardandoMotivoNuevo(false);
      await loadCotizacion();
      return;
    } catch (err) {
      if (!vivo.current) {
        console.error(err);
        avisar(textoDeError(err, `No se pudo retomar ${nombre}`), { tono: 'error', accion: { texto: 'Ver cotización', href: currentPath } });
        return;
      }
      setMotivoNuevoError(textoDeError(err));
      if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
    }
    setGuardandoMotivoNuevo(false);
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
      const destino = cotizacion.sc_id ? `/dashboard/ventas/solicitud/${cotizacion.sc_id}` : '/dashboard/ventas/cotizacion';
      if (!vivo.current) {
        // T9A (patrón de T8A): el usuario ya salió de la cotización: no se lo lleva a otra pantalla; se le avisa.
        avisar(`Cotización ${cotizacion.numero || ''} eliminada (quedó como Rechazada)`,
          cotizacion.sc_id ? { accion: { texto: 'Ver solicitud', href: destino } } : undefined);
        return;
      }
      router.push(destino);
    } catch (err: any) {
      avisarError(err, 'No se pudo eliminar la cotización');
      if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
    }
  }

  async function handleQuickCreateProduct(idx: number) {
    const item = productos[idx];
    if (!item || item.sku_id || !cotizacion?.id) return;
    setCreatingProductIdx(idx);
    try {
      const p = await apiFetch('/crm/products/quick-create', {
        method: 'POST',
        // B3 T17 (IVA punto 11): el producto nuevo nace con la tarifa de la línea (el servidor la normaliza).
        body: JSON.stringify({ name: item.product_name, sale_price: item.unit_price_cop || 0, iva_tarifa: item.iva_tarifa }),
      });
      const prod = p?.data ?? p;
      const nuevosProductos = productos.map((it: any, i: number) => i === idx ? { ...it, sku_id: prod.id, es_libre: false } : it);
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ productos: nuevosProductos, updated_by: currentUser }),
      });
      await loadCotizacion();
    } catch (err: any) {
      avisarError(err, 'No se pudo crear el producto');
      if (recargarTrasError(err)) void loadCotizacion({ silencioso: true });
    }
    setCreatingProductIdx(null);
  }

  // U6+H22: las notas y los contactos con el cliente se registran en la pestaña Chatter (ChatterDocumento, T6B). La nota
  // guardada entra de una vez en la cotización (sin recargar ni spinner); si el servidor no devuelve el renglón, recarga
  // silenciosa. Función con nombre (y no una flecha en el JSX) para que el React Compiler conserve el useCallback de
  // loadCotizacion (eslint react-hooks/preserve-manual-memoization).
  function notaRegistrada(log: Record<string, unknown> | null) {
    if (log) setCotizacion((p: Record<string, unknown>) => agregarActividad(p, log, 'COT'));
    // B3 T17 r1: un contacto con el cliente (llamada, WhatsApp, correo, nota externa) corre el recordatorio en el
    // servidor: se relee para que TarjetaSeguimiento muestre la fecha nueva (como el Hub).
    if (!log || notaReiniciaAtraso(log)) void loadCotizacion({ silencioso: true });
  }

  // B3 T17: la recarga silenciosa tras «No enviar recordatorios» (TarjetaSeguimiento). Con nombre, como notaRegistrada.
  function recordatorioCambiado() {
    void loadCotizacion({ silencioso: true });
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
  // B3 T17 (U22-cambios punto 7, C9): lo que pidió el cliente desde su enlace (cambios_cliente del GET; solo en Borrador).
  const avisoCambios = avisoCambiosCliente(cotizacion, 'COT');
  // La tarjeta de siguiente paso ya ofrece "Calcular Precios" en este caso (o "Re-cotizar", con los cambios del cliente);
  // evita repetir el mismo boton justo debajo.
  const cardOfreceCalculo = (!pvenVigente && !cotizada
    && (estadoActual === 'BORRADOR' || estadoActual === 'ENVIADA')) || (!!avisoCambios && rolGestiona);
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
      // B3 T17 (U22-validez punto 9, U16-reenvio-cot con C13, U16-seguimiento punto 10): hasta cuándo puede confirmar, el
      // recordatorio y «Reenviar al cliente» (ya no hay que pasarla a Borrador para enviarle un enlace nuevo).
      return (
        <PasoEsperandoConfirmacion cotizacion={cotizacion} puedeReenviar={rolGestiona} enviando={sending}
          onReenviar={handleReenviarCotizacion} onCambio={recordatorioCambiado} />
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
    if (avisoCambios) {
      // B3 T17 (U22-cambios punto 7, C9): lo que escribió el cliente, la fecha, «Re-cotizar» y «Enviar al cliente» (solo
      // para ADMIN o ASESOR, los roles que el servidor acepta).
      return (
        <TarjetaCambiosCliente aviso={avisoCambios} acciones={rolGestiona ? (
          <>
            <Button color="orange" size="lg" icon={RotateCcw} onClick={() => setShowCalc(true)}>Re-cotizar</Button>
            <Button color="blue" size="lg" icon={Send} loading={sending} onClick={handleEnviarCotizacion}>Enviar al cliente</Button>
          </>
        ) : undefined} />
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
        <div className="flex items-center gap-4 min-w-0">
          {/* H37: un solo botón de volver, con su destino escrito: el return_to saneado o la lista de cotizaciones. */}
          <BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/cotizacion')} />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nueva Cotización' : (cotizacion?.numero || String(params.id || '').toUpperCase())}
              </h1>
              {!isNew && cotizacion && (
                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border"
                  style={{backgroundColor: estadoCfg.bg, color: estadoCfg.color, borderColor: estadoCfg.border}}>
                  {estadoCfg.label}
                </span>
              )}
            </div>
            {/* U11 (ruling T9A-6): una cotización temprana cuya solicitud ya confirmó el cliente: línea gris discreta. */}
            {cotizacion?.sin_confirmacion_sc_at && cotizacion?.sc_estado === 'CONFIRMADA' && (
              <p className="text-xs text-slate-500 mt-0.5 line-clamp-2 break-words" title={cotizacion.sin_confirmacion_sc_motivo || undefined}>
                Creada antes de la confirmación del cliente
                {cotizacion.sin_confirmacion_sc_motivo ? ` — Motivo: ${cotizacion.sin_confirmacion_sc_motivo}` : ''}
              </p>
            )}
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

          {/* Area de Formulario Abierta. H37: @container -- lo de adentro se reacomoda según el ancho REAL de esta
              columna (también al arrastrar el panel de Actividad), no según la ventana. */}
          <div className="max-w-5xl mx-auto @container">
            <h2 className="text-xl font-black text-slate-800 mb-8 flex items-center gap-2">
              <FileText className="text-blue-600" size={24} /> Datos de la Cotización
            </h2>

            {!isNew && cotizacion && !cotizacion.customer_name && (
              <div className="mb-6 flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-4 py-3 text-red-700">
                <AlertCircle size={20} className="shrink-0 mt-0.5" />
                <p className="text-sm font-bold">
                  Falta el nombre del cliente — esta cotización no puede completarse sin esta información.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-6 mb-10">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 break-words">
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

            {/* H35+H48: la nota ACTUAL de la solicitud (se lee en vivo, nunca se copia) aparte de la de la cotizacion.
                U14 (C17): la de la solicitud con el estilo neutro de la SC (no parece una advertencia); la de la
                cotización sigue azul. */}
            {(cotizacion?.sc_notas || cotizacion?.notas) && (
              <div className="space-y-3 mb-10">
                {cotizacion?.sc_notas && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Nota de la solicitud</p>
                    <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{cotizacion.sc_notas}</p>
                  </div>
                )}
                {cotizacion?.notas && (
                  <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
                    <p className="text-xs font-black text-blue-600 uppercase mb-1.5">Nota de la cotización</p>
                    <p className="text-sm text-blue-900 whitespace-pre-wrap break-words">{cotizacion.notas}</p>
                    {/* R3 (C19): la nota de la cotización le llega al cliente; la de la solicitud no (es interna). */}
                    <p className="text-[11px] text-blue-700 mt-1.5">El cliente verá esta nota</p>
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
                  {productos.map((item: any, idx: number) => {
                    const nombre = item.product_name || item.name || 'Producto sin nombre';
                    // U19+U21 (C10): el anticipo de esta línea, del GET (lista paralela a productos).
                    const anticipoLinea = Number(cotizacion?.anticipo_por_linea?.[idx] ?? 0) || 0;
                    return (
                    <div key={idx} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-wrap items-center gap-x-4 gap-y-2 hover:border-blue-200 transition-colors">
                      <div className="w-14 h-14 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600 shrink-0 overflow-hidden">
                        {item.image_url ? (
                          <img src={item.image_url} alt="" className="w-full h-full object-cover"/>
                        ) : (
                          <Package size={26}/>
                        )}
                      </div>
                      {/* H37: el nombre completo (sin truncate); si no cabe junto al precio, el precio baja a la línea siguiente. */}
                      <div className="grow basis-48 min-w-0">
                        <p className="font-black text-slate-900 text-base break-words" title={nombre}>{nombre}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                          {item.sku_id ? (
                            <span className="text-[10px] font-black text-emerald-600 uppercase tracking-wide bg-emerald-50 px-1.5 py-0.5 rounded whitespace-nowrap">Vinculado a catálogo</span>
                          ) : (
                            <>
                              <span className="text-[10px] font-black text-amber-600 uppercase tracking-wide bg-amber-50 px-1.5 py-0.5 rounded whitespace-nowrap">Texto libre</span>
                              <button onClick={() => handleQuickCreateProduct(idx)} disabled={creatingProductIdx === idx}
                                className="text-[10px] font-black text-blue-600 hover:text-blue-800 underline disabled:opacity-50">
                                {creatingProductIdx === idx ? 'Creando...' : '+ Ingresar como producto'}
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="ml-auto text-right shrink-0">
                        {/* B3 T17 (IVA punto 11): precio sin IVA, el IVA de la línea y su total con IVA (detalle-bloque3.tsx). */}
                        <PrecioLineaIva item={item} />
                        {/* U19+U21: el % es el de TOTALES (resumenAnticipoCotizacion; con pedido, el del pedido: ruling T9A-2). */}
                        {Array.isArray(cotizacion?.anticipo_por_linea) && (
                          <p className={`text-sm font-bold ${anticipoLinea > 0 ? 'text-emerald-700' : 'text-slate-500'}`}>
                            {`Anticipo ${formatoPct(anticipo.pct)}: ${fCOP(cotizacion.anticipo_por_linea?.[idx] ?? 0)}`}
                          </p>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              )}

              {/* TOTALES */}
              <div className="flex justify-end mt-6">
                <div className="w-full @md:w-80 bg-slate-50 p-5 rounded-2xl border border-slate-200">
                  {/* B3 T17 (IVA punto 11): Subtotal (sin IVA), Descuento con descuento_cop (ya no subtotal − total, que con
                      IVA da mal) y el IVA por tarifa (detalle-bloque3.tsx). */}
                  <TotalesIvaCotizacion cotizacion={cotizacion} />
                  <div className="h-px w-full bg-slate-200 mb-4" />
                  <div className="flex justify-between items-center">
                    <span className="text-base font-black text-slate-800">TOTAL</span>
                    <span className="text-xl font-black text-blue-600">{fCOP(cotizacion?.total_cop)}</span>
                  </div>
                  {/* H36+H43 / R3: anticipo y saldo. Ya convertida: los valores del pedido (el GET recalcula con la
                      modalidad de hoy, que ya no es el trato). */}
                  {Number(cotizacion?.total_cop) > 0 && (
                    <div className="mt-4 pt-3 border-t border-slate-200 space-y-1.5 text-sm">
                      {/* U19+U21: el renglón del anticipo grande (el mismo número que reparten las líneas, C10). */}
                      <div className="flex justify-between items-baseline gap-2 text-sm font-bold text-emerald-700">
                        <span>{anticipo.convertida ? 'Anticipo del pedido' : 'Anticipo requerido'} ({anticipo.etiqueta})</span>
                        <span className="text-base font-black shrink-0">{fCOP(anticipo.requerido)}</span>
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
                      {/* U19+U21 (ruling T9A-2): la suma de las líneas da este anticipo; si no cuadra, un aviso discreto. */}
                      {notaLineas && (
                        <p className={`text-[11px] ${notaLineas.cuadra ? 'text-slate-400' : 'font-semibold text-amber-700'}`}>{notaLineas.texto}</p>
                      )}
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

                  {/* U11 (R5, opción A): cotización creada sin la confirmación del cliente y la solicitud sigue sin
                      confirmar. Cuando el cliente confirma, queda la línea gris de la cabecera. */}
                  {cotizacion.sin_confirmacion_sc_at && ESTADOS_SC_SIN_CONFIRMAR.includes(cotizacion.sc_estado) && (
                    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1">
                      <p className="text-sm font-black text-amber-800 flex items-start gap-1.5">
                        <AlertTriangle size={16} className="shrink-0 mt-0.5" />
                        La solicitud {cotizacion.sc_numero || 'de origen'} no ha sido confirmada por el cliente
                      </p>
                      <p className="text-xs text-amber-800 whitespace-pre-wrap break-words">
                        Esta cotización se creó sin su confirmación.
                        {cotizacion.sin_confirmacion_sc_motivo ? ` Motivo: ${cotizacion.sin_confirmacion_sc_motivo}` : ''}
                      </p>
                      <p className="text-xs text-amber-700">Si el cliente confirma esta cotización, la solicitud también quedará confirmada.</p>
                    </div>
                  )}

                  {/* H40: después de anular la confirmación del cliente al re-cotizar. */}
                  {avisoAnulada && (
                    <div role="status" className="flex items-start gap-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
                      <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                      <p className="flex-1 text-sm font-bold text-amber-800">{avisoAnulada}</p>
                      <button type="button" onClick={() => setAvisoAnulada(null)} aria-label="Cerrar aviso" title="Cerrar aviso"
                        className="p-1 rounded-lg text-amber-700 hover:bg-amber-100 shrink-0">
                        <X size={14} />
                      </button>
                    </div>
                  )}

                  {renderSiguientePaso()}

                  <div className="grid grid-cols-1 @lg:grid-cols-2 gap-3 pt-4 border-t border-slate-100">
                    {!cardOfreceCalculo && (
                      <div className="space-y-1.5">
                        <Button color={Number(cotizacion?.total_cop) > 0 ? 'orange' : 'blue'}
                          icon={Number(cotizacion?.total_cop) > 0 ? RotateCcw : Calculator}
                          onClick={() => setShowCalc(true)}>
                          {Number(cotizacion?.total_cop) > 0 ? 'Re-Cotizar — Actualizar Precios' : 'Cotizar — Calcular Precios'}
                        </Button>
                        {/* H40: lo dice antes de abrir la calculadora (que lo repite y pide la razón si hace falta), según
                            el caso (ronda 1, punto 5). */}
                        {estadoConfirmacionCalc && (
                          <p className="text-[11px] text-amber-700">
                            {situacion.paso === 'reabrir' ? 'Cambiar precios la devuelve a Borrador.'
                              : estadoConfirmacionCalc === 'PENDIENTE_CONFIRMACION'
                                ? 'Cambiar precios deja sin efecto el enlace que tiene el cliente.'
                                : 'Cambiar precios anula la confirmación del cliente.'}
                          </p>
                        )}
                      </div>
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
                        onChange={async e => {
                          const k = e.target.value;
                          if (!k) return;
                          // value="" se conserva: mientras la confirmación está abierta no queda elegida ninguna opción.
                          if (k === 'RECHAZADA' && !(await confirmar({
                            titulo: `Marcar ${cotizacion.numero} como Rechazada`,
                            mensaje: cotizacion.sc_id
                              ? `La solicitud ${cotizacion.sc_numero || 'de origen'} seguirá activa y podrás crearle otra cotización.`
                              : 'La cotización queda como Rechazada.',
                            textoConfirmar: 'Marcar como Rechazada',
                            peligro: true,
                          }))) return;
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

          {/* Tab Bar -- U6+H22 (C11): Actividad | Chatter | IA, el orden de la solicitud; 'IA' con Sparkles, sin emoji. */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
            {([['actividad', 'Actividad'], ['chatter', 'Chatter'], ['ia', 'IA']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setCotPanelTab(k)}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${cotPanelTab === k
                  ? (k === 'ia' ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-blue-700 border-blue-600 bg-white')
                  : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
                {k === 'ia' ? <span className="inline-flex items-center gap-1.5"><Sparkles size={14} />{l}</span> : l}
              </button>
            ))}
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
          <>{/* U6+H22: la caja de notas y los botones de contacto se mudaron a la pestaña Chatter (ChatterDocumento:
              nota interna, llamada, WhatsApp, correo y Nota externa). Aquí queda el enlace 'Escribir nota'. */}

          {/* Timeline / Bitacora */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <div className="flex items-center justify-between gap-2 mb-6">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Línea Temporal</h4>
              <button type="button" onClick={() => setCotPanelTab('chatter')}
                className="inline-flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline">
                <MessageSquare size={12} /> Escribir nota
              </button>
            </div>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {[...(cotizacion?.actividades || [])].reverse().map((a:any) => {
                // RP22: las acciones del Bloque 3 (cambios del cliente, entrega del WhatsApp, recordatorios…) toman su ícono
                // y su color de ACCIONES_BLOQUE3 (T13), sin copiarlos en ACTIVITY_STYLE.
                const b3 = accionBloque3(a.action);
                const style = ACTIVITY_STYLE[a.action] || (b3 ? {icon: b3.icono, color: b3.clases} : DEFAULT_ACTIVITY_STYLE);
                const Icon = style.icon;
                return (
                  <div key={a.id} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${style.color}`}>
                      <Icon size={14} />
                    </div>

                    <div className="flex-1 min-w-0 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      {/* U6+H22: una nota del Chatter lleva su tipo encima (Nota interna, Llamada…, «Nota externa · medio»). */}
                      {esEntradaChatter(a) && <div className="mb-1.5"><EtiquetaChatter actividad={a} /></div>}
                      {/* T11 (V3): la misma cabecera que la SC y el PVEN (F12: el título arriba y la fecha debajo).
                          Revisión final (F3): la fecha y la hora del renglón pasan por comoUTC (solo aquí, no en fDate). */}
                      <CabeceraActividad className="mb-2" titulo={a.description || b3?.etiqueta || humanizarCodigo(a.action)} fecha={`${fDate(comoUTC(a.created_at))} ${fTime(comoUTC(a.created_at))}`} />
                      <CambiosDeActividad extra={a.extra_data} />
                      {a.old_estado && a.new_estado && (
                        <p className="flex items-center gap-1.5 mb-3 flex-wrap">
                          <EstadoBadge estado={a.old_estado} /><ArrowRight size={10} className="text-slate-300" /><EstadoBadge estado={a.new_estado} />
                        </p>
                      )}
                      <div className="flex items-center gap-2">
                        <div className="w-5 h-5 shrink-0 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                          {inicialesAutor(a.user_name)}
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

          {/* U6+H22 (R1): el Chatter compartido (nota interna, llamada, WhatsApp, correo y Nota externa con su medio). La
              nota guardada entra de una vez aquí y en la Actividad, sin el spinner de página; si el servidor no devuelve
              el renglón, recarga silenciosa. */}
          {cotPanelTab === 'chatter' && (
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white">
              <ChatterDocumento tipoDoc="COT" doc={cotizacion} onRegistrado={notaRegistrada} />
            </div>
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
          // B3 T17 (RP19, C27): sobre telefono_whatsapp, el e164 que valida el servidor (el de la COT o el de la ficha del
          // cliente), o null. T11 calidad (E6 y ronda 1): las tres ventanas de envío (SC, COT y Hub) usan textoSinTelefono.
          customerHasPhone={!motivoTelefono(cotizacion?.telefono_whatsapp)}
          textoSinTelefono={textoSinTelefono(cotizacion?.telefono_whatsapp) ?? undefined}
          customerEmail={cotizacion?.customer_email ?? null}
          envioWhatsApp={envioWhatsAppCanal}
          nota={reenviando ? NOTA_REENVIO_ENLACE : undefined}
          aviso={<AvisoNombreSinContacto documento={cotizacion} />}
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
          onCancel={cerrarAjuste}
          // B3 T17 (U22-anticipo punto 5): la ventana de H40 con el 409 ANULA_CONFIRMACION; con la razón repite el guardado.
          anulacion={ajusteAnulacion?.detalle ?? null} sinConfirmacionVigente={situacion.paso === 'reabrir'}
          onDescartarAnulacion={() => { setAjusteAnulacion(null); setAjusteError(''); }}
          onAnular={motivo => ajusteAnulacion && guardarAjusteAnticipo(ajusteAnulacion.pct, ajusteAnulacion.nota,
            { anular_confirmacion: true, motivo_recotizacion: motivo })}
        />
      )}
      {showCalc && cotizacion && (
        // H40: avisa desde que se abre (estadoConfirmacion) y, con el 409 ANULA_CONFIRMACION (anulacion), pide la razón.
        // No se cierra mientras guarda: el resultado siempre llega a una ventana abierta.
        <CalculadorModal cot={cotizacion} onSave={onCalcSave}
          onClose={() => { if (!savingCalc) { setShowCalc(false); setCalcAnulacion(null); } }}
          estadoConfirmacion={estadoConfirmacionCalc} sinConfirmacionVigente={situacion.paso === 'reabrir'}
          anulacion={calcAnulacion} onDescartarAnulacion={() => setCalcAnulacion(null)} saving={savingCalc}
          tarifaIvaDefecto={cotizacion.iva_tarifa_defecto} />
      )}
      {showDelete && cotizacion && <DeleteConfirm cot={cotizacion} onConfirm={deleteCot} onCancel={() => setShowDelete(false)} />}
      {/* B2.1 D6: retomarla después de cancelar y restaurar la solicitud pide un motivo nuevo (409 MOTIVO_NUEVO): la
          misma ventana de «Cotizar sin confirmación» de la solicitud; reintenta el PATCH con el motivo. */}
      {motivoNuevoPendiente && (
        <VentanaMotivoSinConfirmacion
          titulo="Retomar sin confirmación del cliente"
          aviso={motivoNuevoPendiente.mensaje}
          detalle={`La cotización pasará a ${ESTADOS_COT[motivoNuevoPendiente.cuerpo.estado]?.label ?? humanizarCodigo(motivoNuevoPendiente.cuerpo.estado)}. El motivo con el que se creó era del ciclo anterior de la solicitud: el nuevo quedará registrado en la Actividad con tu nombre.`}
          motivo={motivoNuevo}
          onMotivo={(valor) => { setMotivoNuevo(valor); setMotivoNuevoError(''); }}
          error={motivoNuevoError}
          guardando={guardandoMotivoNuevo}
          textoCancelar="Volver"
          textoConfirmar="Retomar cotización"
          placeholder="¿Por qué se retoma sin esperar la confirmación del cliente?"
          idCampo="motivo-nuevo-retomar"
          onCerrar={() => setMotivoNuevoPendiente(null)}
          onConfirmar={retomarConMotivoNuevo}
        />
      )}
      {pendingCalcData && (
        <PropagarPvenConfirm
          pven={pvenVigente}
          totalAnterior={Number(cotizacion?.total_cop || 0)}
          totalNuevo={Number(pendingCalcData.total_cop || 0)}
          saving={savingCalc}
          onConfirm={() => commitCalcSave(pendingCalcData, true, false)}
          onCancel={() => commitCalcSave(pendingCalcData, false, false)}
        />
      )}
      {confirmLink && (
        <EnlaceConfirmacionModal documento={`la cotización ${cotizacion?.numero || ''}`} link={confirmLink} color="blue"
          correo={confirmCorreo} canal={confirmCanal} whatsappUrl={confirmWhatsapp}
          // B3 T17 (T16, RP23): el resultado del WhatsApp automático, el teléfono e164, el vencimiento y el recordatorio.
          envioWhatsapp={confirmEnvio?.envioWhatsapp} telefono={cotizacion?.telefono_whatsapp ?? null}
          vence={confirmEnvio?.vence ?? null} seguimiento={confirmEnvio?.seguimiento ?? null}
          onClose={() => setConfirmLink(null)} />
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
