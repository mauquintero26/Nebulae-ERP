"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowRight, ChevronRight, Edit2, Save, Trash2, CheckCircle2,
  User, Phone, Mail, MapPin, MessageCircle, RefreshCw, AlertCircle,
  FileText, Activity, XCircle, MessageSquare, RotateCcw, Filter, Send, Plus, Sparkles, AlertTriangle,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { Button, Modal, useAvisos } from '@/components/ui';
import {
  EstadoBadge, TipoBadge, ChatterTab, IAPanelSC,
  TIPOS_SC, MODALIDADES_PAGO, fDate, fTime,
} from '../solicitud-client';
import {
  infoEstadoSolicitud, puedeReiniciar, puedeCotizarSinConfirmacion, MOTIVO_SIN_CONFIRMACION_MIN, ESTADOS_SC_SIN_CONFIRMAR,
  resumenCancelacion, MOTIVO_SIN_CONFIRMACION_MAX, pasoSolicitud, PASOS_SC,
} from '@/lib/estados-solicitud';
import { largoTexto, telUrl, mailtoUrl, asuntoDocumento } from '@/lib/chatter';
import { formatoPct } from '@/lib/dinero-ventas';
import { pctAnticipoDeModalidad } from '@/lib/etiquetas-solicitud';
import { destinoVolver, anchoInicialPanel } from '@/lib/detalle-layout';
import { comoUTC, diaLocalDeFecha, fechaEditadaParaGuardar } from '@/lib/hub-ventas';
import { CAMPOS_CONTACTO, cambiosDeContacto, validarContacto, avisoCorreccionContacto } from '@/lib/datos-cliente';
import { EstadoSolicitudPasos } from './estado-solicitud';
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
import { etiquetaTipoSolicitud, etiquetaModalidad } from '@/lib/etiquetas-ventas';
import { cotizacionesVigentes, cotizacionesRechazadas, pasosParaCancelarSolicitud } from '@/lib/listas-ventas';
import { infoEstadoPedido, humanizarCodigo } from '@/lib/estados-pedido';
import { CambiosDeActividad } from '../../flujo';
import { ProductosSolicitud } from './productos-solicitud';
import {
  NextStepCard, EnlaceConfirmacionModal, esAsesorElegible, getUsuarioActual, type UsuarioActual,
  BotonVolver, returnToSeguro,
} from '../../flujo';

// Estilo (icono + color) por tipo de accion registrada en el ActivityLog real del backend
// (mismo patron que cotizacion/[id]/page.tsx; valores reales emitidos por el backend para
// Solicitudes -- ver erp_ventas.py: CREATED, ESTADO_CHANGED, NOTE_ADDED, CHATTER, CANCELLED,
// RESTORED; U15: COTIZACION_CREADA y COTIZACION_RECHAZADA (la SC ya no cambia de estado con su
// cotizacion); U11: COTIZADA_SIN_CONFIRMACION; N4/U18: SENT_TO_TRASH, enviar a la Papelera una SC ya cancelada).
const ACTIVITY_STYLE: Record<string, {icon: any; color: string}> = {
  CREATED:        {icon: FileText,      color: 'text-indigo-500 bg-indigo-50'},
  COTIZACION_CREADA:         {icon: FileText,      color: 'text-indigo-500 bg-indigo-50'},
  COTIZACION_RECHAZADA:      {icon: XCircle,       color: 'text-rose-500 bg-rose-50'},
  COTIZADA_SIN_CONFIRMACION: {icon: AlertTriangle, color: 'text-amber-600 bg-amber-50'},
  ESTADO_CHANGED: {icon: Activity,      color: 'text-amber-500 bg-amber-50'},
  NOTE_ADDED:     {icon: MessageSquare, color: 'text-blue-500 bg-blue-50'},
  CHATTER:        {icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50'},
  CANCELLED:      {icon: XCircle,       color: 'text-rose-500 bg-rose-50'},
  SENT_TO_TRASH:  {icon: Trash2,        color: 'text-rose-500 bg-rose-50'},
  RESTORED:       {icon: RotateCcw,     color: 'text-emerald-500 bg-emerald-50'},
  UPDATED:        {icon: FileText,      color: 'text-purple-500 bg-purple-50'},
};
const DEFAULT_ACTIVITY_STYLE = {icon: Activity, color: 'text-slate-500 bg-slate-50'};

// Etiquetas legibles para el filtro por tipo del tab Actividad. Un tipo de accion
// que no este listado aqui (futuro) igual se muestra, con el codigo humanizado como label (nunca el codigo crudo).
const ACTIVITY_TYPE_LABELS: Record<string, string> = {
  ESTADO_CHANGED: 'Cambios de Estado',
  NOTE_ADDED: 'Notas',
  CREATED: 'Creación',
  COTIZACION_CREADA: 'Cotización creada',
  COTIZADA_SIN_CONFIRMACION: 'Cotización sin confirmación',
  COTIZACION_RECHAZADA: 'Cotización rechazada',
  CHATTER: 'Chatter',
  CANCELLED: 'Cancelación',
  SENT_TO_TRASH: 'Papelera',
  RESTORED: 'Restauración',
  UPDATED: 'Ediciones',
  FECHA_ENTREGA_MODIFICADA: 'Fecha de entrega',
};
const ACTIVITY_TYPE_ORDER = [
  'ESTADO_CHANGED', 'UPDATED', 'FECHA_ENTREGA_MODIFICADA', 'NOTE_ADDED', 'CREATED',
  'COTIZACION_CREADA', 'COTIZADA_SIN_CONFIRMACION', 'COTIZACION_RECHAZADA', 'CHATTER', 'CANCELLED', 'SENT_TO_TRASH', 'RESTORED',
];

// T8A ronda 1: tras un 400 o un 409 (la solicitud cambió en otra pantalla: ya tiene cotización, se canceló…) o un error
// sin respuesta del servidor (la red se cortó y la operación pudo hacerse igual), la pantalla se recarga en silencio.
function recargarTrasError(err: unknown): boolean {
  const status = (err as { status?: unknown } | null | undefined)?.status;
  return status === 400 || status === 409 || status === undefined || status === null;
}

const textoCotizacionCreada = (numero: unknown) => (numero ? `Cotización ${numero} creada` : 'Cotización creada');

// U11 (T8A ronda 1) y T8B: con el editor de productos abierto no se cotiza (ni con confirmación ni sin ella): el servidor
// cotiza los productos GUARDADOS, no los que se están editando. El mismo porqué en todos los botones de cotizar.
const GUARDA_PRODUCTOS_ANTES = 'Guarda o cancela la edición de productos antes de cotizar';

type SolicitudEditable = {
  advisor_name?: string | null; advisor_user_id?: number | string | null; tipo_solicitud?: string | null;
  modalidad_pago?: string | null; notas?: string | null; fecha_vencimiento?: string | null;
  customer_phone?: string | null; customer_email?: string | null; customer_address?: string | null; customer_city?: string | null;
};

// Lo que muestra «Editar»: los datos de la solicitud y, H21, el contacto del cliente (la ciudad viene de su ficha).
// fecha_vencimiento llega en UTC sin zona (utcnow + días): el campo muestra el día en hora de Colombia, el mismo que la
// grilla y la lista (con split('T') una SC creada de 7 pm a medianoche salía al día siguiente).
function formularioDeEdicion(d: SolicitudEditable) {
  return {
    advisor_name: d.advisor_name || '',
    advisor_user_id: d.advisor_user_id || '',
    tipo_solicitud: d.tipo_solicitud || 'Cotizacion de Producto',
    modalidad_pago: d.modalidad_pago || 'Contado',
    notas: d.notas || '',
    fecha_vencimiento: diaLocalDeFecha(d.fecha_vencimiento),
    customer_phone: d.customer_phone || '',
    customer_email: d.customer_email || '',
    customer_address: d.customer_address || '',
    customer_city: d.customer_city || '',
  };
}

// H21: el tipo de cada campo de contacto en «Editar» (los demás, texto).
const TIPO_CAMPO_CONTACTO: Record<string, string> = { customer_phone: 'tel', customer_email: 'email' };
// H21 con R6 y R18: el texto gris bajo los campos de contacto. Sin ficha la corrección también llega a la cotización y al
// pedido abiertos de la solicitud (los que no son de otro cliente), así que no se dice que «solo queda en la solicitud».
const TEXTO_CONTACTO_CON_FICHA = 'Lo que corrijas aquí también se guarda en la ficha del cliente y en la cotización y el pedido abiertos de esta solicitud, y queda en la Actividad.';
const TEXTO_CONTACTO_SIN_FICHA = 'Esta solicitud no está vinculada a una ficha de cliente: lo que corrijas aquí se guarda en la solicitud y en la cotización y el pedido abiertos de esta solicitud, y queda en la Actividad.';
const TEXTO_CONTACTO_ANULA = 'Si cambias el correo o el teléfono, la confirmación del cliente se anula y hay que enviársela de nuevo.';

function SolicitudDetalleContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  // "Volver al origen" (R22, H5 del preflight): solo se confia en return_to si es una ruta interna del dashboard
  // (returnToSeguro, la misma regla de cotizacion/[id]). El chequeo debil de antes (startsWith('/') && !startsWith('//'))
  // dejaba pasar '/\evil.com', que el navegador resuelve como //evil.com (open redirect).
  const safeReturnTo = returnToSeguro(searchParams?.get('return_to'));
  const currentPath = `/dashboard/ventas/solicitud/${String(params.id || '')}`;
  // H49 (T1B): avisos del sistema en lugar de window.alert; R30: 'Reiniciar solicitud' se confirma con confirmar().
  const { avisar, avisarError, confirmar } = useAvisos();

  const [solicitud, setSolicitud] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  // H21: el error de «Guardar» (un dato de contacto que no sirve, el 409 del correo de otro cliente…), en rojo bajo la
  // barra de Guardar, sin cerrar el formulario.
  const [editError, setEditError] = useState('');
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
  // B13: el wa.me que se intento abrir, para "Abrir WhatsApp" en el modal si el navegador bloqueo la ventana.
  const [confirmWhatsapp, setConfirmWhatsapp] = useState<string | null>(null);
  // Asignar asesor desde la propia pagina (BORRADOR -> ASIGNADA), sin tener que entrar a Editar.
  const [me, setMe] = useState<UsuarioActual>({ id: null, email: '', name: '', role: '' });
  const [assigning, setAssigning] = useState(false);
  const [assignUserId, setAssignUserId] = useState<number | ''>('');

  // U12: tres pestañas; Actividad (con el siguiente paso y el contacto arriba) se abre sola.
  const [panelTab, setPanelTab] = useState<'actividad' | 'chatter' | 'ia'>('actividad');
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
  // U11: cotizar sin esperar la confirmación del cliente (motivo obligatorio; el error del servidor va dentro de la ventana).
  const [showCotizarSinConf, setShowCotizarSinConf] = useState(false);
  const [motivoSinConf, setMotivoSinConf] = useState('');
  const [cotizandoSinConf, setCotizandoSinConf] = useState(false);
  const [errorSinConf, setErrorSinConf] = useState('');

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
    setMe(getUsuarioActual());
    apiFetch('/auth/users').then((d: any) => setUsuarios(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  // H29: con { silencioso: true } (tras guardar productos) no se muestra el spinner de pagina, no se reescribe editForm
  // (lo que el usuario este editando) y, si falla, se deja lo que ya esta en pantalla: solo se repinta la solicitud.
  // Orden de las cargas: cada llamada toma un numero y solo la ULTIMA pinta la solicitud. Una recarga silenciosa mas vieja
  // (pedida antes de un segundo guardado, que ya se pinto con la respuesta de su PATCH) no pisa lo mas nuevo con datos
  // anteriores a ese guardado.
  const cargaRef = useRef(0);
  const loadSolicitud = useCallback(async (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso === true;
    if (!params.id) { if (!silencioso) setLoading(false); return; }
    const miCarga = ++cargaRef.current;
    const esLaUltima = () => miCarga === cargaRef.current;
    if (!silencioso) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const raw = await apiFetch(`/ventas/solicitudes/${params.id}`);
      const d = raw?.data ?? raw;
      if (esLaUltima()) {
        setSolicitud(d);
        if (!silencioso) setEditForm(formularioDeEdicion(d));
      }
    } catch (err: any) {
      if (!silencioso && esLaUltima()) setLoadError(err.message || 'No se pudo cargar la solicitud');
    }
    // El spinner de una carga completa siempre se apaga (aunque una mas nueva la haya reemplazado): nunca queda pegado.
    if (!silencioso) setLoading(false);
  }, [params.id]);

  useEffect(() => { loadSolicitud(); }, [loadSolicitud]);

  // T8A ronda 1: false cuando la pantalla se desmonta (el usuario salió de la solicitud). Un POST que vuelve después ya
  // no lo lleva a otra pantalla: le avisa con un enlace.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);

  // Resizable Right Pane Logic (mismo patron que cotizacion/[id]/page.tsx y venta/[id]/page.tsx)
  const [rightWidth, setRightWidth] = useState(400);
  // H25/C12: el ancho inicial según la ventana (300-400 px: a 1024 px el panel izquierdo gana espacio). En un efecto al
  // montar y no en el useState, para no romper la hidratación; después se sigue arrastrando (300-800).
  useEffect(() => {
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

  // H21: 'Editar' parte siempre de la solicitud que está en pantalla (las recargas silenciosas no tocan editForm), con el
  // contacto del cliente; cancelar lo deja como estaba y limpia el error.
  function abrirEdicion() {
    if (!solicitud) return;
    setEditForm(formularioDeEdicion(solicitud));
    setEditError('');
    setEditMode(true);
  }

  function cancelarEdicion() {
    setEditMode(false);
    setEditError('');
    if (solicitud) setEditForm(formularioDeEdicion(solicitud));
  }

  // H21: «Guardar» en dos pasos.
  // (1) Si cambió el contacto del cliente: PATCH /cliente con solo lo que cambió, validado antes aquí con las reglas del
  //     servidor. Corrige también la ficha y la cotización y el pedido abiertos, con la regla de Gate 1 de R18. Si falla
  //     (409 del correo de otro cliente, 422), no se guarda nada y se sigue editando.
  // (2) El resto con un cuerpo EXPLÍCITO, sin customer_*: los datos del cliente no viajan dos veces ni dejan otro renglón.
  async function saveEdit() {
    if (!solicitud) return;
    setEditError('');
    const cambios = cambiosDeContacto(solicitud, editForm, { tieneFicha: !!solicitud.customer_id });
    const errorContacto = validarContacto(cambios);
    if (errorContacto) { setEditError(errorContacto); return; }
    setSavingEdit(true);
    let correccion: { data?: object; sin_cambios?: boolean } | null = null;
    if (Object.keys(cambios).length > 0) {
      try {
        // R9: sin updated_by: el autor lo pone el servidor con la sesión.
        correccion = await apiFetch(`/ventas/solicitudes/${solicitud.id}/cliente`, { method: 'PATCH', body: JSON.stringify(cambios) });
      } catch (err) {
        setEditError(textoDeError(err));
        setSavingEdit(false);
        return;
      }
      // Lo corregido se ve de una vez (y si el paso 2 falla, reintentar ya no lo reenvía).
      const datos = correccion?.data;
      if (datos) setSolicitud((prev: Record<string, unknown>) => ({ ...prev, ...datos }));
    }
    const contactoGuardado = !!correccion && correccion.sin_cambios !== true;
    const body: Record<string, unknown> = {
      advisor_name: editForm.advisor_name,
      advisor_user_id: editForm.advisor_user_id,
      tipo_solicitud: editForm.tipo_solicitud,
      modalidad_pago: editForm.modalidad_pago,
      notas: editForm.notas,
      updated_by: currentUser,
    };
    // T8A ronda 1: el vencimiento solo viaja si el día cambió (mediodía local de ese día). Sin tocarlo no se mueve la
    // hora guardada ni la Actividad anota «11/10/2026 → 10/10/2026» (cambios_documento compara el día UTC), y nunca
    // se manda ''.
    const vencimiento = fechaEditadaParaGuardar(editForm.fecha_vencimiento, solicitud.fecha_vencimiento);
    if (vencimiento) body.fecha_vencimiento = vencimiento;
    let guardado = true;
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, { method: 'PATCH', body: JSON.stringify(body) });
    } catch (err) {
      guardado = false;
      setEditError(contactoGuardado
        ? `Los datos del cliente se guardaron, pero no el resto: ${textoDeError(err)}`
        : textoDeError(err, 'No se pudieron guardar los cambios'));
    }
    if (guardado) setEditMode(false);
    // Recarga silenciosa (ruling de T8B): sin el spinner de página no se desmonta lo que siga abierto (el formulario si el
    // paso 2 falló, el editor de productos) y llega la Actividad de la corrección.
    if (guardado || contactoGuardado) await loadSolicitud({ silencioso: true });
    // R18: si la corrección anuló la confirmación del cliente o un enlace, se dice qué hacer; si no, el aviso de guardado.
    const aviso = correccion ? avisoCorreccionContacto(correccion, solicitud.numero) : null;
    if (aviso) avisar(aviso.texto, { tono: aviso.tono });
    setSavingEdit(false);
  }

  // U15 (R30): 'Reiniciar solicitud' es el único cambio de estado a mano (PATCH {estado:'BORRADOR'}: vuelve a Nueva, o a
  // Asignada si tiene asesor; anula el enlace y la confirmación del cliente). Se confirma antes; cancelar va por "Cancelar
  // Solicitud". El 409 de R10 (cotización o pedido activos) sale con su mensaje en un aviso.
  async function reiniciarSolicitud() {
    if (!solicitud) return;
    const destino = infoEstadoSolicitud(solicitud.advisor_user_id ? 'ASIGNADA' : 'BORRADOR').label;
    if (!(await confirmar({
      titulo: 'Reiniciar solicitud',
      mensaje: `La solicitud vuelve a ${destino}: se anula el enlace que se le envió al cliente y su confirmación, y habrá que enviársela de nuevo.`,
      textoConfirmar: 'Reiniciar solicitud',
      peligro: true,
    }))) return;
    setSaving(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'BORRADOR', updated_by: currentUser }) });
      // T8A ronda 1: recarga silenciosa: sin el spinner de página no se desmontan el formulario ni el editor abiertos.
      await loadSolicitud({ silencioso: true });
    } catch (err: any) {
      avisarError(err, 'No se pudo reiniciar la solicitud');
      if (recargarTrasError(err)) void loadSolicitud({ silencioso: true });
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
      avisarError(err, 'No se pudo cambiar el estado de soporte');
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
      const hrefCot = cotId ? `/dashboard/ventas/cotizacion/${cotId}?return_to=${encodeURIComponent(currentPath)}` : '';
      if (!vivo.current) {
        // T8A ronda 1: el usuario ya salió de la solicitud: no se lo lleva a la cotización; se le avisa con el enlace.
        avisar(textoCotizacionCreada(cotNum), hrefCot ? { accion: { texto: 'Ver cotización', href: hrefCot } } : undefined);
        return;
      }
      if (hrefCot) {
        // El siguiente paso es calcular precios y enviar la cotizacion al cliente: se
        // lleva al usuario directo a ella, con "Volver" hacia esta solicitud.
        router.push(hrefCot);
        return;
      }
      await loadSolicitud();
      avisar(textoCotizacionCreada(cotNum));
    } catch (err: any) {
      avisarError(err, 'No se pudo crear la cotización');
    }
    setConfirming(false);
  }

  // U11: la única excepción auditada a Gate 1. Crea la cotización (Borrador) de una SC que el cliente todavía no
  // confirma: la SC no cambia de estado y su enlace sigue sirviendo. R9: el body es solo {motivo}; el autor lo pone el
  // servidor con la sesión. Si sale bien se va a la cotización, como confirmarSC.
  function abrirCotizarSinConfirmacion() {
    setMotivoSinConf('');
    setErrorSinConf('');
    setShowCotizarSinConf(true);
  }

  async function cotizarSinConfirmacion() {
    if (!solicitud) return;
    const motivo = motivoSinConf.trim();
    // En puntos de código, como len() de Python en el servidor (T8A ronda 1).
    if (largoTexto(motivo) < MOTIVO_SIN_CONFIRMACION_MIN) {
      setErrorSinConf(`El motivo debe tener al menos ${MOTIVO_SIN_CONFIRMACION_MIN} caracteres.`);
      return;
    }
    setCotizandoSinConf(true);
    setErrorSinConf('');
    try {
      const d = await apiFetch(`/ventas/solicitudes/${solicitud.id}/cotizar-sin-confirmacion`, { method: 'POST', body: JSON.stringify({ motivo }) });
      const cot = (d?.data ?? d)?.cotizacion;
      const hrefCot = cot?.id ? `/dashboard/ventas/cotizacion/${cot.id}?return_to=${encodeURIComponent(currentPath)}` : '';
      if (!vivo.current) {
        // T8A ronda 1: el usuario ya salió de la solicitud: no se lo lleva a la cotización; se le avisa con el enlace.
        avisar(textoCotizacionCreada(cot?.numero), hrefCot ? { accion: { texto: 'Ver cotización', href: hrefCot } } : undefined);
        return;
      }
      if (hrefCot) {
        router.push(hrefCot);
        return;
      }
      setShowCotizarSinConf(false);
      await loadSolicitud();
    } catch (err: any) {
      if (!vivo.current) {
        avisarError(err, 'No se pudo crear la cotización');
        return;
      }
      // 422 del motivo, 409 (ya confirmada o cancelada) o 400 (sin asesor, sin productos, con una cotización activa).
      setErrorSinConf(textoDeError(err));
      // T8A ronda 1: con un 400/409 la solicitud cambió en otra parte y sin respuesta la cotización pudo crearse igual.
      if (recargarTrasError(err)) void loadSolicitud({ silencioso: true });
    }
    setCotizandoSinConf(false);
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
      avisarError(err, 'No se pudo asignar el asesor');
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
      let whatsapp: string | null = null;

      if (selectedChannel === 'WhatsApp') {
        const mensaje = link
          ? `Hola, aquí está tu solicitud ${solicitud.numero}. Confírmala aquí: ${link}`
          : `Hola, aquí está tu solicitud ${solicitud.numero}`;
        whatsapp = waUrl(solicitud?.customer_phone, mensaje);
        if (whatsapp) window.open(whatsapp, '_blank');
      }

      await loadSolicitud();
      setConfirmCorreo(d?.correo ?? null);
      setConfirmCanal(selectedChannel);
      setConfirmWhatsapp(whatsapp);
      setShowChannelModal(false);
      setSelectedChannel(null);
      if (link) setConfirmLink(link);
    } catch (err: any) {
      avisarError(err, 'No se pudo enviar la solicitud al cliente');
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
      // U18: la cancelada ya no se edita (sin 'Editar'): si se canceló con el formulario o el editor de productos
      // abiertos, se cierran.
      setEditMode(false);
      setEditandoProductos(false);
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
  // U15: 'Reiniciar solicitud' (el único estado a mano) solo en Pendiente por confirmación o Confirmada, sin cotización
  // activa ni pedido vigente (con ellos el servidor responde 409, R10); nunca en Cancelada ni en Soporte.
  const puedeReiniciarSC = puedeReiniciar(solicitud, { cotizacionesActivas, pedidosVigentes });
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
  // Cotizaciones (panel izquierdo) y por el siguiente paso de la pestaña Actividad; en cualquier otro caso no se ofrece
  // esa accion (ASIGNADA tiene su propia accion -- "Enviar para Confirmacion", ver abajo).
  // U15: ademas la confirmacion del cliente debe seguir vigente (confirmacion_vigente: gate1 de la SC, nunca el de
  // solicitud.cotizaciones[i], que es gate2). Una SC Confirmada por su cotizacion no la tiene: el servidor la rechazaria.
  const canConfirmarSC = solicitud?.estado === 'CONFIRMADA' && solicitud?.confirmacion_vigente === true
    && cotizacionesActivas.length === 0 && pedidosVigentes.length === 0 && tieneProductos;
  // U11: 'Cotizar sin esperar confirmación' (mismas condiciones que el servidor: asesor, productos, sin cotización
  // activa ni pedido vigente, en Asignada, Pendiente por confirmación o Confirmada sin la confirmación vigente).
  const puedeCotizarSinConf = puedeCotizarSinConfirmacion(solicitud, { cotizacionesActivas, pedidosVigentes, tieneProductos });
  // El cliente todavía no confirma la solicitud (Nueva, Asignada o Pendiente por confirmación).
  const scSinConfirmar = ESTADOS_SC_SIN_CONFIRMAR.includes(solicitud?.estado);
  // Lo que cuenta el servidor para los límites del motivo: sin los espacios de los bordes y en puntos de código (len()).
  const largoMotivoSinConf = largoTexto(motivoSinConf.trim());

  const asesoresElegibles = usuarios.filter(u => esAsesorElegible(u.role));
  const yoPuedoSerAsesor = me.id !== null && asesoresElegibles.some(u => u.id === me.id);
  const LINK_ACCION = 'flex items-center justify-center gap-2 rounded-xl font-bold px-6 py-3 text-sm text-white shadow-md';
  // T8A ronda 1: Llamar y Correo con la librería del Chatter: el número normalizado (tel:+57…) y el correo y el asunto
  // codificados (un dato del cliente no agrega destinatarios ni encabezados al mailto). Un dato incompleto o inválido no
  // pinta su enlace.
  const llamarCliente = telUrl(solicitud?.customer_phone);
  // H5/C19 con el mismo criterio que Llamar (re-revisión de T8A): el wa.me del cliente solo si el teléfono sirve (con
  // '123', waUrl daba un enlace muerto wa.me/123).
  const whatsappCliente = llamarCliente ? waUrl(solicitud?.customer_phone) : null;
  const correoCliente = mailtoUrl(solicitud?.customer_email, asuntoDocumento('SC', solicitud?.numero), '');
  // Sin ningún enlace de contacto: no hay datos, o los que hay no sirven (teléfono incompleto, correo inválido).
  const sinDatosDeContacto = !solicitud?.customer_phone && !solicitud?.customer_email;
  const textoSinContacto = sinDatosDeContacto
    ? 'Sin teléfono ni correo registrados' : 'El teléfono o el correo registrados no son válidos';
  // R22: % de anticipo de la modalidad (crédito 0, 60/40 60, contado 100; la que no se reconoce, 60 como el backend).
  const pctAnticipo = pctAnticipoDeModalidad(solicitud?.modalidad_pago) ?? 60;
  // T8A ronda 1: la cotización activa que ajustó el anticipo a mano (R3), si hay; la más reciente.
  const cotAnticipoManual = [...cotizacionesActivas]
    .filter((c) => c.anticipo_pct_manual !== null && c.anticipo_pct_manual !== undefined)
    .sort((a, b) => (a.id || 0) - (b.id || 0)).pop() || null;
  // U15 (T8A ronda 1): la ayuda del último paso según el contexto. En Confirmada (y en los heredados, que cuentan como
  // ese paso) la de PASOS_SC dice que sigue la cotización aunque ya exista o la confirmación ya no valga. El documento
  // donde sigue el avance: el pedido vigente más reciente o, sin pedido, la cotización activa más reciente.
  const ultimoDocumento = [...(pedidosVigentes.length > 0 ? pedidosVigentes : cotizacionesActivas)]
    .sort((a, b) => (a.id || 0) - (b.id || 0)).pop() || null;
  const ayudaPasos = pasoSolicitud(solicitud?.estado) !== PASOS_SC.length - 1 ? undefined
    : ultimoDocumento ? `El cliente confirmó. El avance sigue en ${ultimoDocumento.numero}.`
    : solicitud?.estado === 'CONFIRMADA' && solicitud?.confirmacion_vigente === false
      ? 'La confirmación del cliente ya no vale: reinicia la solicitud o cotízala con motivo.'
      : undefined;

  function abrirEditorProductos() {
    setEditandoProductos(true);
    setTimeout(() => document.getElementById('productos-solicitud')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  }

  // U18+H31 (C11): 'Ver en la Actividad' de la tarjeta de la cancelada. La tarjeta ya vive en la pestaña Actividad: se
  // quita un filtro que esconda la cancelación y se baja al historial (ancla historial-actividad).
  function verCancelacionEnActividad() {
    setActivityFilter('all');
    setTimeout(() => document.getElementById('historial-actividad')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
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
      // U18+H31: el resumen de la cancelación (motivo, quién y cuándo, y qué pasa en la Papelera) en lugar de avisos que
      // ya no aplican. El detalle completo está en el renglón de la Actividad, justo debajo (C11: scroll, sin cambiar de
      // pestaña).
      const r = resumenCancelacion(solicitud, actividades);
      const cuando = r.fecha ? comoUTC(r.fecha) : null;
      return (
        <NextStepCard
          tone="rose"
          title="Solicitud cancelada"
          actions={<Button variant="secondary" icon={Activity} onClick={verCancelacionEnActividad}>Ver en la Actividad</Button>}
        >
          <span className="block"><span className="font-bold">Motivo:</span> {r.motivo}</span>
          {(r.por || cuando) && (
            <span className="block">Cancelada{r.por ? ` por ${r.por}` : ''}{cuando ? ` el ${fDate(cuando)} ${fTime(cuando)}` : ''}</span>
          )}
          {r.papelera && <span className="block">{r.papelera}</span>}
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
      // U11: la SC sigue sin confirmar con una cotización activa (creada con 'Cotizar sin esperar confirmación'): se dice
      // con su motivo y se ofrece enviarle (o reenviarle) el enlace de la solicitud al cliente.
      const cotSinConf = scSinConfirmar ? cotizacionesActivas.find((c: any) => c.sin_confirmacion_sc_at) : null;
      const avisoSinConfirmar = !scSinConfirmar ? null
        : !cotSinConf ? 'El cliente todavía no confirma esta solicitud.'
        : `El cliente todavía no confirma esta solicitud; se cotizó sin su confirmación.${
          cotSinConf.sin_confirmacion_sc_motivo ? ` Motivo: ${cotSinConf.sin_confirmacion_sc_motivo}` : ''}`;
      const puedeEnviarEnlace = scSinConfirmar && (estado === 'ASIGNADA' || estado === 'PENDIENTE_CONFIRMACION');
      return (
        <NextStepCard
          tone="indigo"
          title="Continúa en la cotización"
          actions={(
            <>
              {cotizacionesActivas.map((c: any) => (
                <Link key={c.id} href={`/dashboard/ventas/cotizacion/${c.id}?return_to=${encodeURIComponent(currentPath)}`} className={`${LINK_ACCION} bg-indigo-600 hover:bg-indigo-700`}>
                  Ver {c.numero} <ArrowRight size={14} />
                </Link>
              ))}
              {puedeEnviarEnlace && (
                <Button variant="secondary" icon={Send} loading={sendingConfirmacion} onClick={handleEnviarParaConfirmacion}>
                  {estado === 'PENDIENTE_CONFIRMACION' ? 'Reenviar enlace de confirmación' : 'Enviar para Confirmación'}
                </Button>
              )}
            </>
          )}
        >
          La cotización ya fue creada desde esta solicitud: calcula los precios, envíala al cliente y, cuando confirme,
          crea el Pedido de Venta desde ahí.
          {avisoSinConfirmar && <span className="block mt-1.5 font-semibold">{avisoSinConfirmar}</span>}
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
      // T8B: con el editor de productos abierto no se cotiza (el span lleva el porqué del botón deshabilitado).
      if (ultimaRechazada) {
        return (
          <NextStepCard
            tone="emerald"
            title={`La cotización ${ultimaRechazada.numero} fue rechazada`}
            actions={(
              <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
                <Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} disabled={editandoProductos} onClick={confirmarSC}>Crear nueva cotización</Button>
              </span>
            )}
          >
            La solicitud sigue activa: crea una nueva cotización con los productos que el cliente confirmó.
          </NextStepCard>
        );
      }
      return (
        <NextStepCard
          tone="emerald"
          title="El cliente confirmó la solicitud"
          actions={(
            <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
              <Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} disabled={editandoProductos} onClick={confirmarSC}>Crear Cotización</Button>
            </span>
          )}
        >
          Crea la cotización para calcular los precios y enviársela al cliente.
        </NextStepCard>
      );
    }
    // U11: además del botón principal, cotizar sin esperar al cliente (abre la ventana del motivo). Con el editor de
    // productos abierto queda deshabilitado (el servidor cotiza los productos guardados); el span lleva el porqué.
    const botonCotizarSinConf = puedeCotizarSinConf ? (
      <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
        <Button variant="secondary" icon={FileText} disabled={editandoProductos} onClick={abrirCotizarSinConfirmacion}>Cotizar sin esperar confirmación</Button>
      </span>
    ) : null;
    if (estado === 'PENDIENTE_CONFIRMACION') {
      return (
        <NextStepCard
          tone="blue"
          title="Esperando confirmación del cliente"
          actions={(
            <>
              <Button color="blue" icon={Send} loading={sendingConfirmacion} onClick={handleEnviarParaConfirmacion}>Reenviar enlace de confirmación</Button>
              {botonCotizarSinConf}
            </>
          )}
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
          actions={(
            <>
              <Button color="indigo" size="lg" icon={Send} loading={sendingConfirmacion} onClick={handleEnviarParaConfirmacion}>Enviar para Confirmación</Button>
              {botonCotizarSinConf}
            </>
          )}
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
    // Sin siguiente paso automático: una Confirmada cuya confirmación ya no vale (U15: sin cotización activa; se retoma
    // reiniciándola o se cotiza sin esperar al cliente, U11) o un estado heredado (se ajusta en la revisión de datos).
    return (
      <NextStepCard tone="slate" title={`Solicitud ${infoEstadoSolicitud(estado).label.toLowerCase()}`} actions={botonCotizarSinConf ?? undefined}>
        {estado === 'CONFIRMADA'
          ? 'La confirmación del cliente ya no vale para crear la cotización.'
          : 'Esta solicitud no tiene un siguiente paso automático.'}
        {puedeReiniciarSC && ' Para retomarla, usa «Reiniciar solicitud» en «Estado de la solicitud» y envíasela de nuevo al cliente.'}
      </NextStepCard>
    );
  }

  // Filtro por tipo del tab Actividad: "Todos" + los tipos que realmente aparecen en
  // esta SC (orden preferido primero, luego cualquier tipo futuro no listado arriba).
  const activityFilterOptions = [
    { key: 'all', label: 'Todos' },
    ...ACTIVITY_TYPE_ORDER.filter(t => actividades.some((a: any) => a.action === t)).map(t => ({ key: t, label: ACTIVITY_TYPE_LABELS[t] || t })),
    ...Array.from(new Set(actividades.map((a: any) => a.action).filter((t: string) => t && !ACTIVITY_TYPE_ORDER.includes(t)))).map((t: any) => ({ key: t, label: humanizarCodigo(t) })),
  ];
  const actividadesFiltradas = [...actividades].reverse().filter((a: any) => activityFilter === 'all' || a.action === activityFilter);

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          {/* R22: un solo botón de volver, al origen (return_to seguro) o a la lista de solicitudes, con su destino escrito. */}
          <BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/solicitud')} />
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-black text-slate-800">{solicitud?.numero || String(params.id || '').toUpperCase()}</h1>
            {solicitud && <EstadoBadge estado={solicitud.estado} />}
            {solicitud && <TipoBadge tipo={solicitud.tipo_solicitud || 'Cotizacion de Producto'} />}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* U18: una solicitud cancelada no se edita: se restaura desde la Papelera. */}
          {!editMode ? (
            solicitud?.estado !== 'CANCELADA' && (
              <Button variant="secondary" size="sm" icon={Edit2} onClick={abrirEdicion}>Editar</Button>
            )
          ) : (
            <>
              <Button variant="secondary" size="sm" disabled={savingEdit} onClick={cancelarEdicion}>Cancelar</Button>
              <Button color="indigo" size="sm" icon={Save} loading={savingEdit} onClick={saveEdit}>Guardar</Button>
            </>
          )}
          {solicitud && solicitud.estado !== 'CANCELADA' && !isSoporte && (
            <Button variant="danger" size="sm" icon={Trash2} onClick={abrirCancelacion}>Cancelar Solicitud</Button>
          )}
        </div>
      </div>
      {/* H21: el error de «Guardar» en rojo, justo bajo la barra (en lugar de alert()); el formulario sigue abierto. */}
      {editMode && editError && (
        <p role="alert" className="px-6 py-2 bg-rose-50 border-b border-rose-200 text-xs font-bold text-rose-700 break-words shrink-0">{editError}</p>
      )}

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
          {/* Cliente. H21: con la ciudad (de la ficha) y «Ver ficha» (Agenda); en «Editar», el contacto se corrige aquí. */}
          <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Cliente</p>
              {!editMode && solicitud?.customer_id && (
                <Link href={`/dashboard/agenda?customer_id=${solicitud.customer_id}`} className="text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline">Ver ficha</Link>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-600 flex-shrink-0"><User size={15} /></div>
                <div>
                  <p className="font-bold text-slate-900">{solicitud?.customer_name}</p>
                  {editMode && <p className="text-xs text-slate-500">El nombre se cambia en la ficha del cliente</p>}
                </div>
              </div>
              {editMode ? (
                <div className="space-y-3 pt-1">
                  {/* Teléfono, Correo y Dirección; la Ciudad solo con ficha (no es columna de la solicitud). */}
                  {CAMPOS_CONTACTO.filter(c => !c.soloConFicha || !!solicitud?.customer_id).map(c => (
                    <div key={c.clave}>
                      <label htmlFor={`contacto-${c.clave}`} className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">{c.etiqueta}</label>
                      <input
                        id={`contacto-${c.clave}`} type={TIPO_CAMPO_CONTACTO[c.clave] || 'text'} value={editForm[c.clave] ?? ''} maxLength={c.max}
                        onChange={e => { const v = e.target.value; setEditForm((ef: Record<string, unknown>) => ({ ...ef, [c.clave]: v })); setEditError(''); }}
                        className="w-full border border-slate-200 bg-white rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"
                      />
                    </div>
                  ))}
                  <p className="text-xs text-slate-500 leading-relaxed">
                    {solicitud?.customer_id ? TEXTO_CONTACTO_CON_FICHA : TEXTO_CONTACTO_SIN_FICHA} {TEXTO_CONTACTO_ANULA}
                  </p>
                </div>
              ) : (
                <>
                  {solicitud?.customer_phone && <a href={`tel:${solicitud.customer_phone}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-emerald-600 pl-1"><Phone size={13} className="text-slate-400" />{solicitud.customer_phone}</a>}
                  {solicitud?.customer_email && <a href={`mailto:${solicitud.customer_email}`} className="flex items-center gap-2 text-sm text-slate-600 hover:text-indigo-600 pl-1"><Mail size={13} className="text-slate-400" />{solicitud.customer_email}</a>}
                  {/* «{dirección} · {ciudad}», o solo la ciudad si no hay dirección. */}
                  {(solicitud?.customer_address || solicitud?.customer_city) && (
                    <p className="flex items-start gap-2 text-sm text-slate-600 pl-1"><MapPin size={13} className="text-slate-400 mt-0.5 flex-shrink-0" />{[solicitud.customer_address, solicitud.customer_city].filter(Boolean).join(' · ')}</p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* U13: los productos van justo debajo del cliente y siguen a la vista en modo Editar (mismas props). */}
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

          {/* Edit mode */}
          {editMode ? (
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Editar</p>
              {[{ l: 'Tipo de Solicitud', k: 'tipo_solicitud', opts: TIPOS_SC, etq: etiquetaTipoSolicitud }, { l: 'Modalidad de Pago', k: 'modalidad_pago', opts: MODALIDADES_PAGO, etq: etiquetaModalidad }].map(f => (
                <div key={f.k}>
                  <label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">{f.l}</label>
                  <select value={editForm[f.k]} onChange={e => setEditForm((ef: any) => ({ ...ef, [f.k]: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">
                    {f.opts.map(o => <option key={o} value={o}>{f.etq(o)}</option>)}
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
              {/* U14: las notas con el fondo de las demás tarjetas (no parecen una advertencia) y con sus saltos de línea. */}
              {solicitud?.notas && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Notas</p>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap break-words">{solicitud.notas}</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                {[{ l: 'Asesor', v: solicitud?.advisor_name || '-' }, { l: 'Modalidad Pago', v: etiquetaModalidad(solicitud?.modalidad_pago) || '-' }, { l: 'Fecha Solicitud', v: fDate(comoUTC(solicitud?.fecha_solicitud)) }, { l: 'Vencimiento', v: fDate(comoUTC(solicitud?.fecha_vencimiento)) }].map(item => (
                  <div key={item.l} className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3"><p className="text-xs font-bold text-slate-500 mb-1 uppercase tracking-wider">{item.l}</p><p className="font-bold text-sm text-slate-800">{item.v}</p></div>
                ))}
              </div>
              {/* R22: el anticipo que pedirá la cotización, para toda modalidad (R2: el mismo % que calcula el backend; una
                  modalidad que no reconoce, 'Otro' o vacía, 60%), igual que el formulario de H10. */}
              {!isSoporte && solicitud && (
                <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3">
                  <p className="text-xs font-black text-indigo-700 mb-2">{etiquetaModalidad(solicitud.modalidad_pago) || 'Modalidad de pago'}</p>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Anticipo</p><p className="font-black text-indigo-700">{pctAnticipo}%</p></div>
                    <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-400">Saldo</p><p className="font-black text-slate-700">{100 - pctAnticipo}%</p></div>
                  </div>
                  {/* T8A ronda 1: el remate de R3 (como el formulario de H10) y, si la cotización activa lo ajustó, a cuánto. */}
                  <p className="text-xs text-indigo-800 mt-2">En la cotización se puede ajustar a mano con una nota.</p>
                  {cotAnticipoManual && (
                    <p className="text-xs font-bold text-indigo-800 mt-1">
                      La cotización {cotAnticipoManual.numero} lo ajustó a {formatoPct(cotAnticipoManual.anticipo_pct_manual)}.
                    </p>
                  )}
                </div>
              )}
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
                            {/* U11: creada con 'Cotizar sin esperar confirmación' y el cliente todavía no confirma la solicitud. */}
                            {c.sin_confirmacion_sc_at && scSinConfirmar && (
                              <span className="inline-block mt-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300">Sin confirmación del cliente</span>
                            )}
                          </div>
                          <ChevronRight size={15} className={rechazada ? 'text-rose-500' : 'text-amber-500'} />
                        </Link>
                      );
                    })}
                    {/* N7: con la cotizacion rechazada la solicitud sigue activa: si la confirmacion del cliente sigue vigente, se crea otra. */}
                    {canConfirmarSC && (
                      <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
                        <Button color="emerald" size="sm" icon={CheckCircle2} loading={confirming} disabled={editandoProductos} onClick={confirmarSC}>Crear nueva cotización</Button>
                      </span>
                    )}
                  </>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-400 italic mb-3">Aún no se ha realizado ninguna cotización.</p>
                    {/* U11: 'Cotizar' crea la cotización si el cliente ya confirmó; si no (y se puede), pide el motivo. */}
                    {canConfirmarSC ? (
                      <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
                        <Button color="emerald" size="sm" icon={CheckCircle2} loading={confirming} disabled={editandoProductos} onClick={confirmarSC}>Cotizar</Button>
                      </span>
                    ) : puedeCotizarSinConf && (
                      <span className="block" title={editandoProductos ? GUARDA_PRODUCTOS_ANTES : undefined}>
                        <Button color="amber" size="sm" icon={FileText} disabled={editandoProductos} onClick={abrirCotizarSinConfirmacion}>Cotizar</Button>
                      </span>
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

          {/* Estado: el ticket de Soporte tiene su select; la cancelada se restaura desde la Papelera (N4); las demás
              muestran sus pasos (U15), que avanzan solos, con 'Reiniciar solicitud' cuando aplica. */}
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
            ) : solicitud && (
              <EstadoSolicitudPasos solicitud={solicitud} puedeReiniciar={puedeReiniciarSC} onReiniciar={reiniciarSolicitud} reiniciando={saving} ayuda={ayudaPasos} />
            )}
          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-indigo-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* RIGHT: Actividad (con el siguiente paso y contacto) / Chatter / IA */}
        <div style={{ width: rightWidth }} className="bg-slate-50/50 flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">
          {/* Tab bar */}
          <div className="border-b border-slate-200 px-4 pt-3 flex gap-1 bg-white flex-shrink-0">
            {([['actividad', 'Actividad'], ['chatter', 'Chatter'], ['ia', 'IA']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPanelTab(k)} className={`px-4 py-2 rounded-t-lg text-sm font-bold border-b-2 transition-colors ${panelTab === k ? 'text-indigo-700 border-indigo-600 bg-indigo-50/50' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
                {k === 'ia' ? <span className="inline-flex items-center gap-1.5"><Sparkles size={14} />{l}</span> : l}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-5">
            {panelTab === 'actividad' && (
              <>
                {/* U12: arriba el siguiente paso (NextStepCard ya trae la etiqueta 'Siguiente paso') y el contacto. */}
                {renderSiguientePaso()}
                {/* C19: enlaces directos (WhatsApp con waUrl); el registro de cada contacto se hace en el Chatter. */}
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Contactar cliente</p>
                  {whatsappCliente || llamarCliente || correoCliente ? (
                    <div className="grid grid-cols-3 gap-2">
                      {whatsappCliente && <a href={whatsappCliente} target="_blank" rel="noreferrer" className="flex items-center justify-center gap-1.5 py-2 bg-green-50 border border-green-200 text-green-700 rounded-xl font-bold text-xs hover:bg-green-100"><MessageCircle size={16} />WhatsApp</a>}
                      {llamarCliente && <a href={llamarCliente} className="flex items-center justify-center gap-1.5 py-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl font-bold text-xs hover:bg-blue-100"><Phone size={16} />Llamar</a>}
                      {correoCliente && <a href={correoCliente} className="flex items-center justify-center gap-1.5 py-2 bg-slate-50 border border-slate-200 text-slate-700 rounded-xl font-bold text-xs hover:bg-slate-100"><Mail size={16} />Correo</a>}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      {solicitud?.estado === 'CANCELADA'
                        ? `${textoSinContacto}.`
                        : `${textoSinContacto}: ${sinDatosDeContacto ? 'agrégalos' : 'corrígelos'} con «Editar».`}
                    </p>
                  )}
                </div>

              {/* Ancla de 'Ver en la Actividad' (tarjeta de la solicitud cancelada, C11). */}
              <div id="historial-actividad" className="scroll-mt-4 border-t border-slate-200 pt-5">
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
                              <span className="font-bold text-slate-800 text-sm">{a.description || humanizarCodigo(a.action)}</span>
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
              </>
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
          // T1B: mientras cancela, la X queda deshabilitada y la ventana no se cierra.
          onClose={() => { if (!cancelling) setShowCancelModal(false); }}
          bloquearCierre={cancelling}
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
              onChange={e => { setCancelRazon(e.target.value); setCancelError(''); }}
              rows={3}
              maxLength={500}
              placeholder="Describe el motivo de la cancelación..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-200 outline-none"
              autoFocus
            />
            {cancelRazon.trim().length < 5 && <p className="text-xs text-red-500 mt-1">El motivo es obligatorio. Mínimo 5 caracteres (llevas {cancelRazon.trim().length}).</p>}
            {cancelError && <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3">{cancelError}</p>}
          </div>
        </Modal>
      )}

      {/* U11: cotizar sin esperar la confirmación del cliente. El motivo es obligatorio y queda en la Actividad de la
          solicitud y de la cotización con el autor de la sesión; el error del servidor se muestra aquí dentro. */}
      {showCotizarSinConf && (
        <Modal title="Cotizar sin confirmación del cliente" icon={AlertTriangle} color="amber" maxWidth="md"
          onClose={() => { if (!cotizandoSinConf) setShowCotizarSinConf(false); }}
          bloquearCierre={cotizandoSinConf}
          footer={(
            <>
              <Button variant="secondary" disabled={cotizandoSinConf} onClick={() => setShowCotizarSinConf(false)}>Esperar la confirmación</Button>
              <Button color="amber" icon={FileText} loading={cotizandoSinConf} disabled={largoMotivoSinConf < MOTIVO_SIN_CONFIRMACION_MIN} onClick={cotizarSinConfirmacion}>Crear cotización</Button>
            </>
          )}>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
            <p className="text-sm font-bold text-amber-900">Esta solicitud no ha sido confirmada por el cliente.</p>
            <p className="text-xs text-amber-800 mt-1 leading-relaxed">
              Puedes crear la cotización igual: quedará registrado en la Actividad con tu nombre y este motivo. Cuando el cliente confirme, la solicitud pasará a Confirmada y se mantendrá esta cotización.
            </p>
          </div>
          <div>
            <label htmlFor="motivo-sin-confirmacion" className="text-xs font-black text-slate-500 uppercase mb-2 block">Motivo (nota interna) *</label>
            <textarea
              id="motivo-sin-confirmacion"
              value={motivoSinConf}
              onChange={e => { setMotivoSinConf(e.target.value); setErrorSinConf(''); }}
              readOnly={cotizandoSinConf}
              rows={3}
              maxLength={MOTIVO_SIN_CONFIRMACION_MAX}
              placeholder="¿Por qué se cotiza sin esperar al cliente?"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 outline-none"
              autoFocus
            />
            <div className="flex items-start justify-between gap-3 mt-1 text-xs">
              <span className={largoMotivoSinConf < MOTIVO_SIN_CONFIRMACION_MIN ? 'text-amber-700' : 'text-slate-500'}>
                {largoMotivoSinConf < MOTIVO_SIN_CONFIRMACION_MIN
                  ? `Mínimo ${MOTIVO_SIN_CONFIRMACION_MIN} caracteres (llevas ${largoMotivoSinConf}).`
                  : 'Lo ve tu equipo en la Actividad; el cliente no lo recibe.'}
              </span>
              <span className="text-slate-400 tabular-nums shrink-0">{largoMotivoSinConf}/{MOTIVO_SIN_CONFIRMACION_MAX}</span>
            </div>
            {errorSinConf && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2 mt-3">{errorSinConf}</p>}
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
          correo={confirmCorreo} canal={confirmCanal} whatsappUrl={confirmWhatsapp} onClose={() => setConfirmLink(null)} />
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
