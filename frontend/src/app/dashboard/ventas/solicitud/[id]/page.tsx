"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronRight, Edit2, Save, Trash2, CheckCircle2,
  User, Phone, Mail, MapPin, MessageCircle, RefreshCw, AlertCircle,
  FileText, Activity, XCircle, MessageSquare, RotateCcw, Filter, Send, Plus,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import {
  EstadoBadge, TipoBadge, ChatterTab, IAPanelSC,
  ESTADOS_SC_MANUALES, TIPOS_SC, MODALIDADES_PAGO, fDate, fTime,
} from '../solicitud-client';
// Final whole-branch review (hallazgo #1, el mas severo): Gate 1 no tenia NINGUNA via
// de UI para entregarle el link de confirmacion al cliente -- enviarParaConfirmacion
// llamaba al endpoint y tiraba la respuesta entera, sin selector de canal ni manejo
// del link devuelto. Sin SMTP real configurado (el estado actual) o para cualquier SC
// sin email registrado, Gate 1 nunca se podia completar, bloqueando todo el flujo
// SC->COT. Se trae a paridad con lo que COT ya tiene (ChannelModal es un export
// generico y reusable de cotizacion-client.tsx, no especifico de COT) -- MISMO patron,
// no uno mejor (el propio hueco de COT en el canal Email/Otro, donde el link tampoco
// llega a ningun lado, es un problema ya conocido y diferido por separado, simetrico
// entre ambos gates -- no se corrige aqui).
import { ChannelModal, ESTADOS as ESTADOS_COT } from '../../cotizacion/cotizacion-client';
import { waUrl } from '@/lib/whatsapp';
import { cotizacionesVigentes, cotizacionesRechazadas, pasosParaCancelarSolicitud } from '@/lib/listas-ventas';
import { infoEstadoPedido, humanizarCodigo } from '@/lib/estados-pedido';
import { CambiosDeActividad } from '../../flujo';
import { ProductosSolicitud } from './productos-solicitud';
import {
  NextStepCard, EnlaceConfirmacionModal, esAsesorElegible, getUsuarioActual, type UsuarioActual,
} from '../../flujo';

// Estilo (icono + color) por tipo de accion registrada en el ActivityLog real del backend
// (mismo patron que cotizacion/[id]/page.tsx; valores reales emitidos por el backend para
// Solicitudes -- ver erp_ventas.py: CREATED, ESTADO_CHANGED, NOTE_ADDED, CHATTER, CANCELLED,
// RESTORED).
const ACTIVITY_STYLE: Record<string, {icon: any; color: string}> = {
  CREATED:        {icon: FileText,      color: 'text-indigo-500 bg-indigo-50'},
  ESTADO_CHANGED: {icon: Activity,      color: 'text-amber-500 bg-amber-50'},
  NOTE_ADDED:     {icon: MessageSquare, color: 'text-blue-500 bg-blue-50'},
  CHATTER:        {icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50'},
  CANCELLED:      {icon: XCircle,       color: 'text-rose-500 bg-rose-50'},
  RESTORED:       {icon: RotateCcw,     color: 'text-emerald-500 bg-emerald-50'},
  UPDATED:        {icon: FileText,      color: 'text-purple-500 bg-purple-50'},
};
const DEFAULT_ACTIVITY_STYLE = {icon: Activity, color: 'text-slate-500 bg-slate-50'};

// Etiquetas legibles para el filtro por tipo del tab Actividad. Un tipo de accion
// que no este listado aqui (futuro) igual se muestra, usando el valor crudo como label.
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  ESTADO_CHANGED: 'Cambios de Estado',
  NOTE_ADDED: 'Notas',
  CREATED: 'Creación',
  CHATTER: 'Chatter',
  CANCELLED: 'Cancelación',
  RESTORED: 'Restauración',
  UPDATED: 'Ediciones',
  FECHA_ENTREGA_MODIFICADA: 'Fecha de entrega',
};
const ACTIVITY_TYPE_ORDER = ['ESTADO_CHANGED', 'UPDATED', 'FECHA_ENTREGA_MODIFICADA', 'NOTE_ADDED', 'CREATED', 'CHATTER', 'CANCELLED', 'RESTORED'];

function SolicitudDetalleContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawReturnTo = searchParams?.get('return_to') || '';
  // Convencion "volver al origen" (aplicada aqui primero, se formalizara luego en mas
  // pantallas): solo se confia en return_to si es una ruta interna relativa -- nunca un
  // esquema http(s) ni "//" (protocol-relative), que redirigirian fuera del dominio.
  const safeReturnTo = rawReturnTo.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : '';
  const currentPath = `/dashboard/ventas/solicitud/${String(params.id || '')}`;

  const [solicitud, setSolicitud] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [sendingConfirmacion, setSendingConfirmacion] = useState(false);
  // Hallazgo #1: mismo estado que cotizacion/[id]/page.tsx usa para su propio ChannelModal.
  const [showChannelModal, setShowChannelModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<'WhatsApp'|'Email'|'Otro'|null>(null);
  // Enlace de confirmacion recien generado: el token crudo solo viaja en la respuesta del
  // envio, asi que se muestra (copiar/abrir) apenas llega.
  const [confirmLink, setConfirmLink] = useState<string | null>(null);
  // H27+H39: resultado del correo de respaldo y canal elegido, para el aviso verde/ambar del modal del enlace.
  const [confirmCorreo, setConfirmCorreo] = useState<any>(null);
  const [confirmCanal, setConfirmCanal] = useState<string | null>(null);
  // Asignar asesor desde la propia pagina (BORRADOR -> ASIGNADA), sin tener que entrar a Editar.
  const [me, setMe] = useState<UsuarioActual>({ id: null, email: '', name: '', role: '' });
  const [assigning, setAssigning] = useState(false);
  const [assignUserId, setAssignUserId] = useState<number | ''>('');

  const [panelTab, setPanelTab] = useState<'acciones' | 'actividad' | 'chatter' | 'ia'>('acciones');
  const [activityFilter, setActivityFilter] = useState<string>('all');

  // Usuarios para el selector de asesor en modo edicion (mismo endpoint y filtro de
  // rol que el selector equivalente en el modal de creacion, solicitud-client.tsx).
  const [usuarios, setUsuarios] = useState<{ id: number; email: string; role: string }[]>([]);

  // Cancelar con razon (mismo endpoint/flujo que solicitud-client.tsx, duplicado
  // aqui como estado propio de la pagina -- mismo patron que "Cancelar Pedido"
  // en venta/[id]/page.tsx). Antes solo era alcanzable desde la lista (fila /
  // menu de 3 puntos); ahora tambien se puede disparar desde el detalle.
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRazon, setCancelRazon] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [editandoProductos, setEditandoProductos] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
    setMe(getUsuarioActual());
    apiFetch('/auth/users').then((d: any) => setUsuarios(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  // H29: con { silencioso: true } (tras guardar productos) no se muestra el spinner de pagina, no se reescribe editForm
  // (lo que el usuario este editando) y, si falla, se deja lo que ya esta en pantalla: solo se repinta la solicitud.
  const loadSolicitud = useCallback(async (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso === true;
    if (!params.id) { if (!silencioso) setLoading(false); return; }
    if (!silencioso) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const raw = await apiFetch(`/ventas/solicitudes/${params.id}`);
      const d = raw?.data ?? raw;
      setSolicitud(d);
      if (!silencioso) {
        setEditForm({
          advisor_name: d.advisor_name || '',
          advisor_user_id: d.advisor_user_id || '',
          tipo_solicitud: d.tipo_solicitud || 'Cotizacion de Producto',
          modalidad_pago: d.modalidad_pago || 'Contado',
          notas: d.notas || '',
          fecha_vencimiento: d.fecha_vencimiento ? d.fecha_vencimiento.split('T')[0] : '',
        });
      }
    } catch (err: any) {
      if (!silencioso) setLoadError(err.message || 'No se pudo cargar la solicitud');
    }
    if (!silencioso) setLoading(false);
  }, [params.id]);

  useEffect(() => { loadSolicitud(); }, [loadSolicitud]);

  // Resizable Right Pane Logic (mismo patron que cotizacion/[id]/page.tsx y venta/[id]/page.tsx)
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

  async function saveEdit() {
    if (!solicitud) return;
    setSavingEdit(true);
    try {
      const body: any = { ...editForm, updated_by: currentUser };
      if (editForm.fecha_vencimiento) body.fecha_vencimiento = new Date(editForm.fecha_vencimiento + 'T12:00:00').toISOString();
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      setEditMode(false);
      await loadSolicitud();
    } catch (err: any) {
      alert('Error al guardar: ' + err.message);
    }
    setSavingEdit(false);
  }

  async function changeEstado(newEstado: string) {
    if (!solicitud) return;
    // N4: aqui solo se vuelve a Borrador (ESTADOS_SC_MANUALES); cancelar va por "Cancelar Solicitud" (motivo + revision de
    // documentos). El servidor responde 409 con el motivo si hay una cotizacion o un pedido activos: se muestra tal cual.
    setSaving(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, { method: 'PATCH', body: JSON.stringify({ estado: newEstado, updated_by: currentUser }) });
      await loadSolicitud();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  }

  async function changeEstadoSoporte(newEstado: string) {
    if (!solicitud) return;
    setSaving(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, { method: 'PATCH', body: JSON.stringify({ estado_soporte: newEstado, updated_by: currentUser }) });
      await loadSolicitud();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setSaving(false);
  }

  async function confirmarSC() {
    if (!solicitud) return;
    setConfirming(true);
    try {
      const d = await apiFetch(`/ventas/solicitudes/${solicitud.id}/confirmar`, { method: 'POST', body: JSON.stringify({ user_name: currentUser }) });
      const dataObj = d?.data ?? d;
      const cotNum = dataObj?.cotizacion?.numero || d?.cotizacion?.numero || '';
      // CRM Pipeline: avanza el lead a la etapa COT si el cliente tiene customer_id
      // (misma logica best-effort que tenia confirmarSC() en solicitud-client.tsx)
      if (solicitud.customer_id) {
        try {
          const leads = await apiFetch(`/crm/leads/v2?limit=50`).catch(() => ({ data: [] }));
          const leadList = Array.isArray(leads) ? leads : (leads?.data ?? []);
          const myLead = leadList.find((l: any) => l.customer_id === solicitud.customer_id && l.lead_source === 'SC');
          if (myLead) {
            const stages = await apiFetch('/crm/pipeline-stages').catch(() => ({ data: [] }));
            const stageList = Array.isArray(stages) ? stages : (stages?.data ?? []);
            const curIdx = stageList.findIndex((s: any) => s.id === myLead.pipeline_stage_id);
            const nextStage = stageList[curIdx + 1];
            if (nextStage) {
              await apiFetch(`/crm/leads/${myLead.id}/stage`, { method: 'PATCH', body: JSON.stringify({ stage_id: nextStage.id, cotizacion_numero: cotNum }) }).catch(() => {});
            }
          }
        } catch {}
      }
      const cotId = dataObj?.cotizacion?.id || d?.cotizacion?.id;
      if (cotId) {
        // El siguiente paso es calcular precios y enviar la cotizacion al cliente: se
        // lleva al usuario directo a ella, con "Volver" hacia esta solicitud.
        router.push(`/dashboard/ventas/cotizacion/${cotId}?return_to=${encodeURIComponent(currentPath)}`);
        return;
      }
      await loadSolicitud();
      alert(`Cotización ${cotNum} creada`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setConfirming(false);
  }

  // BORRADOR -> ASIGNADA: update_solicitud promueve el estado solo cuando se le manda un
  // advisor_user_id real (el id, no solo el nombre).
  async function asignarAsesor(userId: number) {
    if (!solicitud) return;
    const u = usuarios.find(x => x.id === userId);
    setAssigning(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          advisor_user_id: userId,
          advisor_name: u?.email || (userId === me.id ? me.email : '') || solicitud.advisor_name || '',
          updated_by: currentUser,
        }),
      });
      setAssignUserId('');
      await loadSolicitud();
    } catch (err: any) {
      alert('Error al asignar el asesor: ' + err.message);
    }
    setAssigning(false);
  }

  // Hallazgo #1: mismo patron que confirmarEnvio en cotizacion/[id]/page.tsx -- llama al
  // endpoint dedicado, lee link_confirmacion de la respuesta, y si el canal elegido es
  // WhatsApp (y la SC tiene telefono), abre wa.me con el link incluido en el mensaje.
  function handleEnviarParaConfirmacion() {
    if (!solicitud) return;
    setShowChannelModal(true);
  }

  async function enviarParaConfirmacion() {
    if (!solicitud) return;
    if (!selectedChannel) return;
    setSendingConfirmacion(true);
    try {
      // H27+H39: el canal viaja en el POST (la Actividad lo anota y el servidor siempre intenta el correo de respaldo;
      // responde {canal, correo: {enviado, destino, motivo, mensaje}, link_confirmacion}). 'Email' sin correo del cliente
      // da 400 (ChannelModal lo deshabilita).
      const d = await apiFetch(`/ventas/solicitudes/${solicitud.id}/enviar-confirmacion`, { method: 'POST', body: JSON.stringify({ user_name: currentUser, canal: selectedChannel }) });
      const link = d?.link_confirmacion || '';

      if (selectedChannel === 'WhatsApp') {
        const mensaje = link
          ? `Hola, aquí está tu solicitud ${solicitud.numero}. Confírmala aquí: ${link}`
          : `Hola, aquí está tu solicitud ${solicitud.numero}`;
        const url = waUrl(solicitud?.customer_phone, mensaje);
        if (url) window.open(url, '_blank');
      }

      await loadSolicitud();
      setConfirmCorreo(d?.correo ?? null);
      setConfirmCanal(selectedChannel);
      setShowChannelModal(false);
      setSelectedChannel(null);
      if (link) setConfirmLink(link);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setSendingConfirmacion(false);
  }

  function cancelarEnvioConfirmacion() {
    setShowChannelModal(false);
    setSelectedChannel(null);
  }

  function abrirCancelacion() {
    setCancelError('');
    setCancelRazon('');
    setShowCancelModal(true);
  }

  // N4: POST /cancelar pide el motivo (minimo 5 caracteres) y el servidor responde 409 con lo que falta (cancelar el pedido
  // o rechazar la cotizacion activos): se muestra tal cual dentro de la ventana, que sigue abierta.
  async function cancelWithReason() {
    const razon = cancelRazon.trim();
    if (!solicitud || razon.length < 5) { setCancelError('El motivo es obligatorio (mínimo 5 caracteres).'); return; }
    setCancelling(true);
    setCancelError('');
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}/cancelar`, { method: 'POST', body: JSON.stringify({ razon, user_name: currentUser }) });
      setShowCancelModal(false);
      setCancelRazon('');
      await loadSolicitud();
    } catch (err: any) {
      setCancelError(err?.message || 'No se pudo cancelar la solicitud.');
    }
    setCancelling(false);
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
        <Link href="/dashboard/ventas/solicitud" className="text-indigo-600 font-bold text-sm hover:underline">
          Volver al listado de solicitudes
        </Link>
      </div>
    );
  }

  const cotizaciones = solicitud?.cotizaciones || [];
  const actividades = solicitud?.actividades || [];
  const isSoporte = solicitud?.tipo_solicitud === 'Soporte Tecnico';
  // 'CANCELADO' (masculino) es el estado real de un Pedido de Venta cancelado.
  const pedidosVigentes = (solicitud?.pedidos_venta || []).filter((v: any) => v.estado !== 'CANCELADO');
  // N7: una cotizacion RECHAZADA no cuenta: la solicitud sigue activa y se le puede crear otra. VENCIDA si cuenta (N4).
  const cotizacionesActivas = cotizacionesVigentes(solicitud);
  // La rechazada mas reciente: la que nombra el aviso "fue rechazada" (el detalle no garantiza el orden de la lista).
  const ultimaRechazada: any = [...cotizacionesRechazadas(solicitud)].sort((a: any, b: any) => (a.id || 0) - (b.id || 0)).pop() || null;
  // N4: lo que hay que hacer antes de poder cancelar la solicitud (el servidor responde 409 con lo mismo).
  const pasosCancelar = pasosParaCancelarSolicitud(solicitud);
  // N4: a mano solo se vuelve a Borrador; ya estando en Borrador no queda nada que ofrecer.
  const estadosManuales = Object.entries(ESTADOS_SC_MANUALES).filter(([k]) => k !== solicitud?.estado);
  const pipelineStep = pedidosVigentes.length > 0 ? 3
    : cotizacionesActivas.some((c: any) => c.estado === 'CONFIRMADA') ? 2
    : cotizacionesActivas.length > 0 ? 1 : 0;
  // Sin productos no hay nada que el cliente confirme ni que cotizar: el backend no deja
  // enviarla ni crear la cotizacion. Se editan aqui mientras la SC no tenga cotizacion.
  const productosSC = solicitud?.productos || [];
  const tieneProductos = productosSC.some((p: any) => String(p?.product_name || p?.nombre || p?.name || '').trim());
  const puedeEditarProductos = !!solicitud && !isSoporte && solicitud.estado !== 'CANCELADA' && cotizacionesActivas.length === 0;

  // Gate 1 (confirmacion por link): "Confirmar + Crear Cotizacion" (confirmarSC) ahora
  // solo es valido cuando el cliente ya confirmo via el link publico (estado ===
  // CONFIRMADA) Y la SC no tiene ninguna Cotizacion activa ni Pedido de Venta vigente -- el backend
  // (confirmar_solicitud en erp_ventas.py) exige exactamente eso: una venta
  // cerrada normal puede volver a dejar la SC en CONFIRMADA via la sincronizacion con
  // su Cotizacion, pero eso nunca debe reabrir la creacion de una Cotizacion duplicada.
  // N7: una Cotizacion RECHAZADA no cuenta (la SC sigue activa): con la confirmacion del cliente aun vigente se
  // ofrece "Crear nueva cotizacion" con los productos ya confirmados. Reutilizado por el boton "Cotizar" del bloque
  // Cotizaciones (panel izquierdo) y por el tab Acciones; en cualquier otro caso no se ofrece esa accion (ASIGNADA
  // tiene su propia accion -- "Enviar para Confirmacion", ver abajo).
  const canConfirmarSC = solicitud?.estado === 'CONFIRMADA' && cotizacionesActivas.length === 0 && pedidosVigentes.length === 0 && tieneProductos;

  const asesoresElegibles = usuarios.filter(u => esAsesorElegible(u.role));
  const yoPuedoSerAsesor = me.id !== null && asesoresElegibles.some(u => u.id === me.id);
  const LINK_ACCION = 'flex items-center justify-center gap-2 rounded-xl font-bold px-6 py-3 text-sm text-white shadow-md';

  function abrirEditorProductos() {
    setEditandoProductos(true);
    setTimeout(() => document.getElementById('productos-solicitud')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  // Cada estado le dice al usuario cual es su siguiente paso -- antes solo ASIGNADA y
  // CONFIRMADA ofrecian algo y el resto (incluida una SC recien creada sin asesor,
  // BORRADOR) mostraba "Sin acciones principales disponibles" sin ninguna pista.
  function renderSiguientePaso() {
    if (!solicitud) return null;
    const estado = solicitud.estado;

    if (isSoporte) {
      return (
        <NextStepCard tone="slate" title="Ticket de soporte">
          Las solicitudes de Soporte Técnico no pasan por cotización: gestiona el avance del ticket en
          &ldquo;Estado del Ticket de Soporte&rdquo;, en el panel izquierdo.
        </NextStepCard>
      );
    }
    if (estado === 'CANCELADA') {
      return (
        <NextStepCard tone="rose" title="Solicitud cancelada">
          Esta solicitud está cancelada y no puede avanzar. Puedes restaurarla desde la Papelera del listado de solicitudes.
        </NextStepCard>
      );
    }
    if (pedidosVigentes.length > 0) {
      return (
        <NextStepCard
          tone="emerald"
          title="Pedido de Venta generado"
          actions={pedidosVigentes.map((v: any) => (
            <Link key={v.id} href={`/dashboard/ventas/venta/${v.id}?return_to=${encodeURIComponent(currentPath)}`} className={`${LINK_ACCION} bg-emerald-600 hover:bg-emerald-700`}>
              Ver {v.numero} <ArrowRight size={14} />
            </Link>
          ))}
        >
          El flujo Solicitud → Cotización → Pedido de Venta está completo. El seguimiento (compra, entrega) continúa en el Pedido.
        </NextStepCard>
      );
    }
    if (cotizacionesActivas.length > 0) {
      return (
        <NextStepCard
          tone="indigo"
          title="Continúa en la cotización"
          actions={cotizacionesActivas.map((c: any) => (
            <Link key={c.id} href={`/dashboard/ventas/cotizacion/${c.id}?return_to=${encodeURIComponent(currentPath)}`} className={`${LINK_ACCION} bg-indigo-600 hover:bg-indigo-700`}>
              Ver {c.numero} <ArrowRight size={14} />
            </Link>
          ))}
        >
          La cotización ya fue creada desde esta solicitud: calcula los precios, envíala al cliente y, cuando confirme,
          crea el Pedido de Venta desde ahí.
        </NextStepCard>
      );
    }
    if (!tieneProductos && ['ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(estado)) {
      return (
        <NextStepCard
          tone="amber"
          title="Agrega los productos a cotizar"
          actions={puedeEditarProductos ? <Button color="amber" size="lg" icon={Plus} onClick={abrirEditorProductos}>Agregar productos</Button> : undefined}
        >
          Esta solicitud no tiene productos: sin ellos no hay nada que el cliente pueda confirmar ni que cotizar.
          {estado === 'ASIGNADA' ? ' Después podrás enviarla al cliente para que la confirme.' : ' Cuando los agregues, tendrás que reenviarle la solicitud al cliente.'}
        </NextStepCard>
      );
    }
    if (canConfirmarSC) {
      // N7: la cotizacion anterior fue rechazada pero la confirmacion del cliente sigue vigente: no hay que reenviar nada.
      if (ultimaRechazada) {
        return (
          <NextStepCard
            tone="emerald"
            title={`La cotización ${ultimaRechazada.numero} fue rechazada`}
            actions={<Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Crear nueva cotización</Button>}
          >
            La solicitud sigue activa: crea una nueva cotización con los productos que el cliente confirmó.
          </NextStepCard>
        );
      }
      return (
        <NextStepCard
          tone="emerald"
          title="El cliente confirmó la solicitud"
          actions={<Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Crear Cotización</Button>}
        >
          Crea la cotización para calcular los precios y enviársela al cliente.
        </NextStepCard>
      );
    }
    if (estado === 'PENDIENTE_CONFIRMACION') {
      return (
        <NextStepCard
          tone="blue"
          title="Esperando confirmación del cliente"
          actions={<Button color="blue" icon={Send} loading={sendingConfirmacion} onClick={handleEnviarParaConfirmacion}>Reenviar enlace de confirmación</Button>}
        >
          Ya se envió el enlace. Cuando el cliente confirme, aquí aparecerá &ldquo;Crear Cotización&rdquo;.
          Si el enlace venció (dura 2 días) o no le llegó, genera uno nuevo.
        </NextStepCard>
      );
    }
    if (estado === 'ASIGNADA') {
      return (
        <NextStepCard
          tone="indigo"
          title="Envía la solicitud al cliente para que la confirme"
          actions={<Button color="indigo" size="lg" icon={Send} loading={sendingConfirmacion} onClick={handleEnviarParaConfirmacion}>Enviar para Confirmación</Button>}
        >
          El cliente confirma desde un enlace de un solo uso. Cuando lo haga, podrás crear la cotización.
          {ultimaRechazada && ' La cotización anterior fue rechazada; para hacer otra, reenvía la solicitud al cliente para que la confirme.'}
        </NextStepCard>
      );
    }
    if (estado === 'BORRADOR') {
      return (
        <NextStepCard
          tone="amber"
          title="Asigna un asesor para continuar"
          actions={(
            <>
              {yoPuedoSerAsesor && (
                <Button color="indigo" size="lg" icon={User} loading={assigning} onClick={() => asignarAsesor(me.id as number)}>
                  Asignarme esta solicitud
                </Button>
              )}
              <div className="flex gap-2">
                <select
                  value={assignUserId}
                  onChange={e => setAssignUserId(e.target.value ? Number(e.target.value) : '')}
                  className="flex-1 min-w-0 border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-medium outline-none focus:ring-2 focus:ring-amber-200"
                >
                  <option value="">{asesoresElegibles.length ? 'Elegir otro asesor...' : 'No hay asesores disponibles'}</option>
                  {asesoresElegibles.map(u => <option key={u.id} value={u.id}>{u.email}</option>)}
                </select>
                <Button variant="secondary" size="sm" loading={assigning} disabled={!assignUserId} onClick={() => asignarAsesor(Number(assignUserId))}>
                  Asignar
                </Button>
              </div>
            </>
          )}
        >
          Esta solicitud todavía no tiene asesor. Con asesor se puede enviar a confirmación del cliente y, cuando
          confirme, crear la cotización.
        </NextStepCard>
      );
    }
    return (
      <NextStepCard tone="slate" title={`Solicitud ${String(estado || '').toLowerCase().replace(/_/g, ' ')}`}>
        Esta solicitud no tiene un siguiente paso automático. Si quieres retomarla, pásala a Borrador desde &ldquo;Cambiar Estado&rdquo;.
      </NextStepCard>
    );
  }

  // Filtro por tipo del tab Actividad: "Todos" + los tipos que realmente aparecen en
  // esta SC (orden preferido primero, luego cualquier tipo futuro no listado arriba).
  const activityFilterOptions = [
    { key: 'all', label: 'Todos' },
    ...ACTIVITY_TYPE_ORDER.filter(t => actividades.some((a: any) => a.action === t)).map(t => ({ key: t, label: ACTIVITY_TYPE_LABELS[t] || t })),
    ...Array.from(new Set(actividades.map((a: any) => a.action).filter((t: string) => t && !ACTIVITY_TYPE_ORDER.includes(t)))).map((t: any) => ({ key: t, label: t })),
  ];
  const actividadesFiltradas = [...actividades].reverse().filter((a: any) => activityFilter === 'all' || a.action === activityFilter);

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Link href="/dashboard/ventas/solicitud" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
              <ArrowLeft size={20} />
            </Link>
            {safeReturnTo && (
              <Link href={safeReturnTo} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline whitespace-nowrap">
                ← Volver
              </Link>
            )}
          </div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800">{solicitud?.numero || String(params.id || '').toUpperCase()}</h1>
            {solicitud && <EstadoBadge estado={solicitud.estado} />}
            {solicitud && <TipoBadge tipo={solicitud.tipo_solicitud || 'Cotizacion de Producto'} />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {!editMode ? (
            <Button variant="secondary" size="sm" icon={Edit2} onClick={() => setEditMode(true)}>Editar</Button>
          ) : (
            <>
              <Button variant="secondary" size="sm" onClick={() => setEditMode(false)}>Cancelar</Button>
              <Button color="indigo" size="sm" icon={Save} loading={savingEdit} onClick={saveEdit}>Guardar</Button>
            </>
          )}
          {solicitud && solicitud.estado !== 'CANCELADA' && !isSoporte && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={abrirCancelacion}>Cancelar Solicitud</Button>
          )}
        </div>
      </div>

      {/* Progreso del Flujo -- SC -> COT -> PVEN (no aplica a Soporte Tecnico, que tiene su propio ciclo) */}
      {!isSoporte && (
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center max-w-md">
            {['Solicitud', 'Cotización', 'Pedido de Venta'].map((label, i) => (
              <div key={label} className="flex items-center flex-1 last:flex-none">
                <div className="flex flex-col items-center gap-1">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${i < pipelineStep ? 'bg-emerald-500 text-white' : i === pipelineStep ? 'bg-indigo-600 text-white' : 'bg-white border-2 border-slate-200 text-slate-300'}`}>
                    {i < pipelineStep ? '✓' : i + 1}
                  </div>
                  <span className={`text-[10px] font-bold whitespace-nowrap ${i <= pipelineStep ? 'text-slate-700' : 'text-slate-300'}`}>{label}</span>
                </div>
                {i < 2 && <div className={`flex-1 h-0.5 mx-2 ${i < pipelineStep ? 'bg-emerald-400' : 'bg-slate-200'}`} />}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* LEFT: Informacion de la Solicitud (Cliente, datos, estado) */}
        <div className="flex-1 border-r border-slate-100 overflow-y-auto p-6 space-y-5">
          {/* Cliente */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Cliente</p>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0"><User size={15} /></div>
                <div><p className="font-bold text-slate-900">{solicitud?.customer_name}</p></div>
              </div>
              {solicitud?.customer_phone && <a href={`tel:${solicitud.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1"><Phone size={13} className="text-slate-400" />{solicitud.customer_phone}</a>}
              {solicitud?.customer_email && <a href={`mailto:${solicitud.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 pl-1"><Mail size={13} className="text-slate-400" />{solicitud.customer_email}</a>}
              {solicitud?.customer_address && <p className="flex items-start gap-2 text-sm text-slate-600 pl-1"><MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />{solicitud.customer_address}</p>}
            </div>
          </div>

          {/* Edit mode */}
          {editMode ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Editar</p>
              {[{ l: 'Tipo de Solicitud', k: 'tipo_solicitud', opts: TIPOS_SC }, { l: 'Modalidad de Pago', k: 'modalidad_pago', opts: MODALIDADES_PAGO }].map(f => (
                <div key={f.k}>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">{f.l}</label>
                  <select value={editForm[f.k]} onChange={e => setEditForm((ef: any) => ({ ...ef, [f.k]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                    {f.opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              ))}
              <div>
                <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">Asesor</label>
                {/* Gate 1: asignar asesor aqui es la unica forma de promover una SC creada
                    sin asesor (BORRADOR) a ASIGNADA -- update_solicitud/promueve_asignada
                    decide la promocion en el backend, este selector solo manda el id real
                    (mismo patron que el selector de asesor en el modal de creacion). */}
                <select value={editForm.advisor_user_id || ''} onChange={e => {
                  const uid = e.target.value ? Number(e.target.value) : '';
                  const u = usuarios.find(x => x.id === uid);
                  setEditForm((ef: any) => ({ ...ef, advisor_user_id: uid, advisor_name: u?.email || ef.advisor_name }));
                }} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                  <option value="">Seleccionar asesor...</option>
                  {asesoresElegibles.map(u => (
                    <option key={u.id} value={u.id}>{u.email}</option>
                  ))}
                </select>
              </div>
              <div><label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">Fecha Vencimiento</label><input type="date" value={editForm.fecha_vencimiento} onChange={e => setEditForm((ef: any) => ({ ...ef, fecha_vencimiento: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
              <div><label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">Notas</label><textarea value={editForm.notas} onChange={e => setEditForm((ef: any) => ({ ...ef, notas: e.target.value }))} rows={3} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                {[{ l: 'Asesor', v: solicitud?.advisor_name || '-' }, { l: 'Modalidad Pago', v: solicitud?.modalidad_pago || '-' }, { l: 'Fecha Solicitud', v: fDate(solicitud?.fecha_solicitud) }, { l: 'Vencimiento', v: fDate(solicitud?.fecha_vencimiento) }].map(item => (
                  <div key={item.l} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"><p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{item.l}</p><p className="font-bold text-sm text-slate-800">{item.v}</p></div>
                ))}
              </div>
              {solicitud?.modalidad_pago?.includes('60/40') && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-xs font-black text-indigo-700 uppercase mb-2">Modalidad 60/40</p>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Anticipo</p><p className="font-black text-indigo-700">60%</p></div>
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Pendiente</p><p className="font-black text-slate-700">40%</p></div>
                  </div>
                </div>
              )}
              {!isSoporte && solicitud && (
                <ProductosSolicitud
                  scId={solicitud.id}
                  productos={productosSC}
                  editable={puedeEditarProductos}
                  motivoBloqueo={cotizacionesActivas.length > 0
                    ? `Los productos ya pasaron a la cotización ${cotizacionesActivas[0].numero}: ajústalos allí con "Re-Cotizar".`
                    : solicitud.estado === 'CANCELADA' ? 'La solicitud está cancelada.' : undefined}
                  anulaConfirmacion={['PENDIENTE_CONFIRMACION', 'CONFIRMADA'].includes(solicitud.estado)}
                  editando={editandoProductos}
                  setEditando={setEditandoProductos}
                  currentUser={currentUser}
                  // H29: el PATCH ya devuelve la SC completa: se pinta de inmediato (sin esperar una recarga) y las
                  // actividades, cotizaciones y pedidos se refrescan despues, sin spinner de pagina.
                  onGuardado={(scNueva) => {
                    if (scNueva) setSolicitud((prev: any) => ({ ...prev, ...scNueva }));
                    void loadSolicitud({ silencioso: true });
                  }}
                />
              )}
              {solicitud?.notas && <div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><p className="text-xs font-black text-amber-700 uppercase mb-1.5">Notas</p><p className="text-sm text-amber-900">{solicitud.notas}</p></div>}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cotizaciones</p>
                {cotizaciones.length > 0 ? (
                  <>
                    {cotizaciones.map((c: any) => {
                      const rechazada = c.estado === 'RECHAZADA';
                      return (
                        <Link key={c.id} href={`/dashboard/ventas/cotizacion/${c.id}?return_to=${encodeURIComponent(currentPath)}`} className={`flex items-center justify-between p-3 border rounded-xl mb-2 ${rechazada ? 'bg-rose-50 border-rose-200 hover:bg-rose-100' : 'bg-amber-50 border-amber-200 hover:bg-amber-100'}`}>
                          <div>
                            <span className={`font-bold ${rechazada ? 'text-rose-800' : 'text-amber-800'}`}>{c.numero}</span>
                            <p className={`text-xs mt-0.5 ${rechazada ? 'text-rose-600' : 'text-amber-600'}`}>{ESTADOS_COT[c.estado]?.label || humanizarCodigo(c.estado)}</p>
                          </div>
                          <ChevronRight size={15} className={rechazada ? 'text-rose-500' : 'text-amber-500'} />
                        </Link>
                      );
                    })}
                    {/* N7: con la cotizacion rechazada la solicitud sigue activa: si la confirmacion del cliente sigue vigente, se crea otra. */}
                    {canConfirmarSC && (
                      <Button color="emerald" size="sm" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Crear nueva cotización</Button>
                    )}
                  </>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-400 italic mb-3">Aún no se ha realizado ninguna cotización.</p>
                    {canConfirmarSC && (
                      <Button color="emerald" size="sm" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Crear Cotización</Button>
                    )}
                  </div>
                )}
              </div>
              {pedidosVigentes.length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Pedidos de Venta</p>
                  {pedidosVigentes.map((v: any) => (
                    <Link key={v.id} href={`/dashboard/ventas/venta/${v.id}?return_to=${encodeURIComponent(currentPath)}`} className="flex items-center justify-between p-3 bg-emerald-50 border border-emerald-200 rounded-xl mb-2 hover:bg-emerald-100">
                      <div><span className="font-bold text-emerald-800">{v.numero}</span><p className="text-xs text-emerald-600 mt-0.5">{infoEstadoPedido(v.estado).label}{v.cot_numero ? ` · desde ${v.cot_numero}` : ''}</p></div>
                      <ChevronRight size={15} className="text-emerald-500" />
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Estado change */}
          <div>
            {isSoporte ? (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Estado del Ticket de Soporte</p>
                <select value={solicitud?.estado_soporte || 'ABIERTO'} disabled={saving}
                  onChange={e => changeEstadoSoporte(e.target.value)}
                  className="w-full border border-purple-200 bg-purple-50 rounded-xl px-3 py-2 text-sm font-bold text-purple-700 outline-none focus:ring-2 focus:ring-purple-200 disabled:opacity-40">
                  <option value="ABIERTO">Abierto</option>
                  <option value="EN_PROCESO">En Proceso</option>
                  <option value="RESUELTO">Resuelto</option>
                  <option value="CERRADO">Cerrado</option>
                </select>
              </>
            ) : solicitud?.estado === 'CANCELADA' ? (
              // N4: una SC cancelada solo vuelve por "Restaurar" en la Papelera (el PATCH a Borrador responde 409).
              <p className="text-xs text-slate-500">Esta solicitud está cancelada: para volver a trabajar en ella, restáurala desde la Papelera del listado de solicitudes.</p>
            ) : estadosManuales.length > 0 && (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cambiar Estado</p>
                <div className="flex gap-2 flex-wrap">
                  {estadosManuales.map(([k, v]) => (
                    <button key={k} onClick={() => changeEstado(k)} disabled={saving} className="px-3 py-1.5 rounded-lg text-xs font-bold border hover:opacity-80 disabled:opacity-40" style={{ backgroundColor: v.bg, color: v.color, borderColor: v.border }}>{v.label}</button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-indigo-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* RIGHT: Acciones / Actividad / Chatter / IA */}
        <div style={{ width: rightWidth }} className="bg-slate-50/50 flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          {/* Tab bar */}
          <div className="border-b border-slate-200 px-4 pt-3 flex gap-1 bg-white flex-shrink-0">
            {([['acciones', 'Acciones'], ['actividad', 'Actividad'], ['chatter', 'Chatter'], ['ia', '🤖 IA']] as const).map(([k, l]) => (
              <button key={k} onClick={() => setPanelTab(k)} className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-colors ${panelTab === k ? 'text-indigo-700 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>{l}</button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {panelTab === 'acciones' && (
              <>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Acciones Principales</p>
                  {renderSiguientePaso()}
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Contactar Cliente</p>
                  <div className="grid grid-cols-3 gap-2">
                    {solicitud?.customer_phone && <a href={`https://wa.me/57${solicitud.customer_phone.replace(/\D/g, '')}`} target="_blank" rel="noreferrer" className="flex flex-col items-center gap-1.5 py-3 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100"><MessageCircle size={18} />WhatsApp</a>}
                    {solicitud?.customer_phone && <a href={`tel:${solicitud.customer_phone}`} className="flex flex-col items-center gap-1.5 py-3 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100"><Phone size={18} />Llamar</a>}
                    {solicitud?.customer_email && <a href={`mailto:${solicitud.customer_email}?subject=Solicitud ${solicitud.numero}`} className="flex flex-col items-center gap-1.5 py-3 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100"><Mail size={18} />Email</a>}
                  </div>
                </div>
              </>
            )}

            {panelTab === 'actividad' && (
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Historial de Actividad</p>

                {/* Filtro por tipo -- "Todos" + los tipos reales presentes en esta SC */}
                <div className="flex items-center gap-1.5 flex-wrap mb-4">
                  <Filter size={12} className="text-slate-300 shrink-0" />
                  {activityFilterOptions.map(opt => (
                    <button
                      key={opt.key}
                      onClick={() => setActivityFilter(opt.key)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-colors ${
                        activityFilter === opt.key
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                {actividadesFiltradas.length === 0 ? (
                  <p className="text-xs text-slate-400 italic text-center py-8">
                    {activityFilter === 'all' ? 'Sin actividad registrada.' : 'Sin actividad de este tipo.'}
                  </p>
                ) : (
                  <div className="space-y-5 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                    {actividadesFiltradas.map((a: any) => {
                      const style = ACTIVITY_STYLE[a.action] || DEFAULT_ACTIVITY_STYLE;
                      const Icon = style.icon;
                      return (
                        <div key={a.id} className="relative flex items-start gap-3">
                          <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white shadow-sm shrink-0 z-10 ${style.color}`}>
                            <Icon size={14} />
                          </div>
                          <div className="flex-1 bg-white border border-slate-200 rounded-xl p-3 shadow-sm min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                              <span className="font-bold text-slate-800 text-sm">{a.description || a.action}</span>
                              <span className="text-[10px] font-bold text-slate-400 whitespace-nowrap shrink-0">{fDate(a.created_at)} {fTime(a.created_at)}</span>
                            </div>
                            <CambiosDeActividad extra={a.extra_data} />
                            {a.old_estado && a.new_estado && (
                              <p className="flex items-center gap-1.5 mb-2 flex-wrap">
                                <EstadoBadge estado={a.old_estado} /><ArrowRight size={10} className="text-slate-300" /><EstadoBadge estado={a.new_estado} />
                              </p>
                            )}
                            <div className="flex items-center gap-2">
                              <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                                {(a.user_name || 'S').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                              </div>
                              <span className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {panelTab === 'chatter' && <ChatterTab sc={solicitud} currentUser={currentUser} />}

            {panelTab === 'ia' && <IAPanelSC sc={solicitud} apiBase={process.env.NEXT_PUBLIC_API_URL || 'https://api.nebulaekids.com/api/v1'} />}
          </div>
        </div>
      </div>

      {/* MODAL: CANCELAR LA SOLICITUD (N4) */}
      {showCancelModal && pasosCancelar.length > 0 && (
        // Con una cotizacion o un pedido activos no se puede cancelar: se dice que hacer primero, con enlaces a cada
        // documento (el servidor responde 409 con lo mismo), en vez de pedir un motivo que no se podria usar.
        <Modal title="Cancelar Solicitud" subtitle="Antes de cancelarla hay que dejar sin efecto sus documentos activos." icon={Trash2} color="red" maxWidth="md"
          onClose={() => setShowCancelModal(false)}
          footer={<Button variant="secondary" onClick={() => setShowCancelModal(false)}>Entendido</Button>}>
          <div className="space-y-3">
            <p className="text-sm text-slate-700">
              No se puede cancelar la solicitud {solicitud?.numero}: tiene documentos activos. Primero:
            </p>
            <ol className="space-y-2">
              {pasosCancelar.map((p, i) => (
                <li key={`${p.tipo}-${p.id}`} className="flex items-center justify-between gap-3 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <span className="text-sm font-bold text-amber-900">{i + 1}. {p.texto}</span>
                  <Link
                    href={`/dashboard/ventas/${p.tipo === 'pedido' ? 'venta' : 'cotizacion'}/${p.id}?return_to=${encodeURIComponent(currentPath)}`}
                    className="text-xs font-bold text-indigo-600 hover:underline whitespace-nowrap"
                  >
                    Abrir {p.numero}
                  </Link>
                </li>
              ))}
            </ol>
            <p className="text-xs text-slate-500">Después podrás cancelar la solicitud.</p>
          </div>
        </Modal>
      )}
      {showCancelModal && pasosCancelar.length === 0 && (
        <Modal title="Cancelar Solicitud" subtitle="La solicitud pasa a la Papelera. Podrás restaurarla desde allí." icon={Trash2} color="red" maxWidth="md"
          onClose={() => setShowCancelModal(false)}
          footer={(
            <>
              <Button variant="secondary" disabled={cancelling} onClick={() => setShowCancelModal(false)}>No, mantener</Button>
              <Button variant="danger" icon={Trash2} loading={cancelling} disabled={cancelRazon.trim().length < 5} onClick={cancelWithReason}>Cancelar SC</Button>
            </>
          )}>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Motivo de la cancelación *</label>
            <textarea
              value={cancelRazon}
              onChange={e => setCancelRazon(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe el motivo de la cancelación..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-200 outline-none"
              autoFocus
            />
            {cancelRazon.trim().length < 5 && <p className="text-xs text-red-500 mt-1">El motivo es obligatorio (mínimo 5 caracteres).</p>}
            {cancelError && <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3">{cancelError}</p>}
          </div>
        </Modal>
      )}

      {/* Hallazgo #1: mismo ChannelModal generico que usa cotizacion/[id]/page.tsx */}
      {showChannelModal && (
        <ChannelModal
          selectedChannel={selectedChannel}
          onSelectChannel={setSelectedChannel}
          onConfirm={enviarParaConfirmacion}
          onCancel={cancelarEnvioConfirmacion}
          saving={sendingConfirmacion}
          customerHasPhone={!!waUrl(solicitud?.customer_phone)}
          customerEmail={solicitud?.customer_email ?? null}
          documentLabel="solicitud"
        />
      )}

      {confirmLink && (
        <EnlaceConfirmacionModal documento={`la solicitud ${solicitud?.numero || ''}`} link={confirmLink} color="indigo"
          correo={confirmCorreo} canal={confirmCanal} onClose={() => setConfirmLink(null)} />
      )}
    </div>
  );
}

// useSearchParams() exige un limite de Suspense para no romper el prerenderizado estatico
// (mismo patron ya usado en solicitud/page.tsx para SolicitudClient).
export default function SolicitudDetallePage() {
  return (
    <Suspense fallback={(
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-indigo-600" size={28} />
      </div>
    )}>
      <SolicitudDetalleContent />
    </Suspense>
  );
}
