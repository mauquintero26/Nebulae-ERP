"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  DollarSign, CheckCircle2, Circle,
  ShoppingCart, RefreshCw, AlertCircle, ListChecks, ExternalLink,
  Activity, FileText, X, Edit2, Save, Sparkles, MessageSquare, Send,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname, useRouter, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button, Modal, useAvisos } from '@/components/ui';
import { textoDeError, recargarTrasError } from '@/lib/avisos';
import { NewSupplierModal } from '../venta-client';
import { CambiosDeActividad, CabeceraActividad, getUsuarioActual, puedeCrearOrdenDePago, returnToSeguro, BotonVolver, EnlaceConfirmacionModal } from '../../flujo';
import { ChatterDocumento, EtiquetaChatter } from '../../chatter';
import { ChannelModal } from '../../cotizacion/cotizacion-client';
import { useEnvioAlCliente, LineaEnlaceCliente, TablaProductosPedido } from './detalle-bloque3';
import { formatoPesos } from '@/lib/pesos';
import { etiquetaModalidad } from '@/lib/etiquetas-ventas';
import {
  PASOS_PEDIDO as STEPS, ESTADOS_PEDIDO_MANUALES, ESTADOS_PEDIDO_CERRADOS, infoEstadoPedido, pasoPedido, transicionesPedido,
  humanizarCodigo,
} from '@/lib/estados-pedido';
import {
  formatoPct, describirPago, etiquetaEstadoPxp, pxpsDelPedido, pedidoAdmitePxp, textoChipPxp, saldoAFavorAlCancelar,
} from '@/lib/dinero-ventas';
import { rutaSinParametro } from '@/lib/listas-ventas';
import { destinoVolver, anchoInicialPanel } from '@/lib/detalle-layout';
import { agregarActividad, esEntradaChatter, motivoTelefono, textoSinTelefono } from '@/lib/chatter';
import { resumenPagoPedido } from '@/lib/resumen-pago';
import { comoUTC } from '@/lib/hub-ventas';
import { NOTA_REENVIO_ENLACE } from '@/lib/envio-whatsapp';
import { accionBloque3 } from '@/lib/acciones-bloque3';
import { textoIvaIncluido } from '@/lib/iva';
import { AYUDA_NOTA_CLIENTE } from '@/lib/cambios-cliente';

const fCOP = formatoPesos;
const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';

const ACTIVITY_STYLE: Record<string, string> = {
  CREATED: '#6366f1', UPDATED: '#3b82f6', ESTADO_CHANGED: '#f59e0b',
  SENT: '#10b981', CONFIRMED: '#059669', REJECTED: '#ef4444',
  // U6+H22: las notas del Chatter (y la 'Motivo del rechazo (Hub)' de N3).
  CHATTER: '#0891b2', NOTE_ADDED: '#3b82f6',
};

// U24: el tercer recuadro del Resumen Financiero según resumenPagoPedido(...).caso (clases literales para Tailwind).
// Las ayudas son hechos del saldo. Un pedido CANCELADO no usa este mapa: ya no se cobra y lleva RECUADRO_CANCELADO.
const TERCER_RECUADRO: Record<string, { titulo: string; caja: string; texto: string; valor: string; ayuda: string }> = {
  pendiente: { titulo: 'Saldo pendiente', caja: 'border-red-200 bg-red-50', texto: 'text-red-700', valor: 'text-red-800', ayuda: 'Total menos lo pagado' },
  completo: { titulo: 'Pagado completo', caja: 'border-emerald-200 bg-emerald-50', texto: 'text-emerald-700', valor: 'text-emerald-800', ayuda: 'Sin saldo pendiente' },
  a_favor: { titulo: 'Saldo a favor del cliente', caja: 'border-amber-200 bg-amber-50', texto: 'text-amber-800', valor: 'text-amber-900', ayuda: 'Pagó más que el total del pedido' },
  desconocido: { titulo: 'Saldo pendiente', caja: 'border-slate-200 bg-slate-50', texto: 'text-slate-600', valor: 'text-slate-500', ayuda: 'Saldo sin datos' },
};

// Ronda 1 (punto 8): un pedido cancelado ya no se cobra: el tercer recuadro, neutro, dice eso (y no 'Saldo pendiente').
const RECUADRO_CANCELADO = { ...TERCER_RECUADRO.desconocido, titulo: 'Sin cobrar (pedido cancelado)', ayuda: 'El pedido se canceló: no se cobra.' };

function PedidoVentaDetalleContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  // "Volver al origen" (ruling T9A-7, H6 del preflight): solo se confia en return_to si es una ruta interna del
  // dashboard (returnToSeguro, la misma regla de solicitud/[id] y cotizacion/[id]). El chequeo debil de antes
  // (startsWith('/') && !startsWith('//')) dejaba pasar '/\evil.com', que el navegador resuelve como //evil.com.
  const safeReturnTo = returnToSeguro(searchParams?.get('return_to'));
  // H49 (T1B): avisos del sistema en lugar de window.alert; los errores de las ventanas (PEC, cancelar) van dentro.
  const { avisar, avisarError } = useAvisos();

  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [creatingPxp, setCreatingPxp] = useState(false);
  const [showPecModal, setShowPecModal] = useState(false);
  const [pecSaving, setPecSaving] = useState(false);
  const [pecError, setPecError] = useState('');
  const [pecForm, setPecForm] = useState({ dias_entrega: 15, modalidad_pago: 'Contado', notas: '' });
  const [supplierSearch, setSupplierSearch] = useState('');
  const [suppliers, setSuppliers] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [listaSaving, setListaSaving] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRazon, setCancelRazon] = useState('');
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const editEntryEstado = useRef('');
  // U6+H22 (C11): Actividad | Chatter | IA, el mismo orden de la solicitud. Las notas se escriben en el Chatter.
  const [panelTab, setPanelTab] = useState<'actividad' | 'chatter' | 'ia'>('actividad');
  const [iaAnalisis, setIaAnalisis] = useState('');
  const supplierTimer = useRef<any>(null);
  // R8: el menu de la lista ("Cancelar Pedido") llega con ?accion=cancelar: tras la primera carga se abre el
  // mismo modal de cancelacion (una sola vez), si el pedido se puede cancelar.
  const abrirCancelacion = useRef(searchParams?.get('accion') === 'cancelar');

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  // T9A (patrón H29 de solicitud/[id]): con { silencioso: true } no se muestra el spinner de página (no se desmontan el
  // formulario de edición ni las ventanas abiertas) y, si falla, queda lo que ya está en pantalla. Cada carga toma un
  // número y solo la ÚLTIMA pinta el pedido: una recarga vieja no pisa datos más nuevos.
  const cargaRef = useRef(0);
  const loadPedido = useCallback(async (opts?: { silencioso?: boolean }) => {
    const silencioso = opts?.silencioso === true;
    if (!params.id) { if (!silencioso) setLoading(false); return; }
    const miCarga = ++cargaRef.current;
    // B3 T19: devuelve el pedido que pintó (o null), para que el envío al cliente sepa si lo cancelaron mientras tanto.
    let fresco: any = null;
    if (!silencioso) {
      setLoading(true);
      setLoadError('');
    }
    try {
      const raw = await apiFetch(`/ventas/pedidos/${params.id}`);
      const d = raw?.data ?? raw;
      if (miCarga === cargaRef.current) { setPedido(d); fresco = d; }
      if (abrirCancelacion.current && transicionesPedido(d?.estado).includes('CANCELADO')) setShowCancelModal(true);
      abrirCancelacion.current = false;
    } catch (err: any) {
      if (!silencioso && miCarga === cargaRef.current) setLoadError(err.message || 'No se pudo cargar el pedido de venta');
    }
    if (!silencioso) setLoading(false);
    return fresco;
  }, [params.id]);

  useEffect(() => { loadPedido(); }, [loadPedido]);

  // B3 T19 (U23 punto 7): «Enviar al cliente» / «Reenviar al cliente» con el ChannelModal (detalle-bloque3.tsx).
  const envio = useEnvioAlCliente(pedido, loadPedido);

  // B1 (R8): ?accion=cancelar se usa una sola vez. Tras la primera carga se quita de la URL (sin recargar el pedido)
  // para que el modal no se vuelva a abrir al refrescar ni al volver con el navegador.
  useEffect(() => {
    if (!pedido || searchParams?.get('accion') !== 'cancelar') return;
    router.replace(rutaSinParametro(pathname, searchParams, 'accion'), { scroll: false });
  }, [pedido, searchParams, pathname, router]);

  // Resizable Right Pane Logic (mismo patron que cotizacion/[id]/page.tsx)
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
  // N10: nombre claro de cualquier estado y su lugar en los 5 pasos (-1: cancelado o devuelto, sin stepper).
  const estadoCfg = infoEstadoPedido(estadoActual);
  const stepIndex = pasoPedido(estadoActual);
  // T11 (V5): la línea de la barra de pasos va del centro del primer círculo al del último: p-6 (1.5rem) + media
  // columna, con las columnas del mismo ancho ((100% - 3rem) / pasos).
  const bordeLineaPasos = `calc(1.5rem + (100% - 3rem) / ${2 * STEPS.length})`;
  // N2: solo se ofrece lo que el servidor acepta por PATCH desde el estado actual.
  const puedeCancelar = transicionesPedido(estadoActual).includes('CANCELADO');
  const opcionesEstado = ESTADOS_PEDIDO_MANUALES.filter(k => transicionesPedido(estadoActual).includes(k));
  const estadoSoloLectura = ESTADOS_PEDIDO_CERRADOS.includes(estadoActual) || opcionesEstado.length === 0;
  // H44+N6 / H45: la orden de pago vigente (o la ultima cancelada) y si se puede crear otra.
  const { vigente: pxpVigente, cancelada: pxpCancelada } = pxpsDelPedido(pedido);
  const puedePxp = puedeCrearOrdenDePago(getUsuarioActual().role) && pedidoAdmitePxp(pedido);

  async function handleCrearPxp() {
    if (!pedido?.id) return;
    setCreatingPxp(true);
    try {
      // H44+N6: los montos salen del pedido en el servidor; el body ya no manda montos.
      const d = await apiFetch(`/ventas/pedidos/${pedido.id}/crear-pxp`, {
        method: 'POST',
        body: JSON.stringify({}),
      });
      await loadPedido();
      const numeroPxp = (d?.data ?? d)?.numero;
      avisar(numeroPxp ? `Orden de pago ${numeroPxp} creada` : 'Orden de pago creada');
    } catch (err: any) {
      avisarError(err, 'No se pudo crear la orden de pago');
      if (recargarTrasError(err)) void loadPedido({ silencioso: true });
    }
    setCreatingPxp(false);
  }

  function onSupplierSearch(q: string) {
    setSupplierSearch(q); setSelectedSupplier(null); setPecError('');
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
    // El botón 'Crear PEC' está deshabilitado sin proveedor; esto es solo una defensa.
    if (!selectedSupplier) { setPecError('Selecciona un proveedor o crea uno nuevo.'); return; }
    setPecSaving(true);
    setPecError('');
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
      avisar(
        pecObj?.numero ? `PEC ${pecObj.numero} creado y vinculado al pedido` : 'PEC creado y vinculado al pedido',
        pecObj?.id ? { accion: { texto: 'Ver PEC', href: `/dashboard/compras/pedidos/${pecObj.id}` } } : undefined,
      );
    } catch (err: any) {
      // El error se muestra dentro de la ventana, que sigue abierta con lo escrito.
      setPecError(textoDeError(err, 'No se pudo crear el PEC'));
      if (recargarTrasError(err)) void loadPedido({ silencioso: true });
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
      avisar('Productos agregados a la lista de compras');
    } catch (err: any) {
      avisarError(err, 'No se pudieron agregar los productos a la lista de compras');
      if (recargarTrasError(err)) void loadPedido({ silencioso: true });
    }
    setListaSaving(false);
  }

  async function handleCancelarPedido() {
    if (!pedido) return;
    // El botón está deshabilitado con menos de 5 caracteres; esto es solo una defensa.
    if (cancelRazon.trim().length < 5) { setCancelError('El motivo es obligatorio (mínimo 5 caracteres).'); return; }
    setCancelling(true);
    setCancelError('');
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
      // El error se muestra dentro de la ventana, que sigue abierta con el motivo escrito.
      setCancelError(textoDeError(err, 'No se pudo cancelar el pedido'));
      if (recargarTrasError(err)) void loadPedido({ silencioso: true });
    }
    setCancelling(false);
  }

  async function handleSaveEdit() {
    if (!pedido) return;
    try {
      const body: any = { ...editForm, fecha_entrega_estimada: editForm.fecha_entrega_estimada || null, updated_by: currentUser };
      // editForm se congela al abrir el modo edicion; si OTRA accion cambio el
      // estado (cancelar, entregar, o el auto-avance a EN_PROCESO al crear un
      // PEC) o vinculo un PEC real mientras el modo edicion seguia abierto, no
      // se reenvia el valor viejo. "estado" solo se envia si el usuario en
      // verdad lo cambio con el selector (difiere del valor al entrar a editar).
      if (editForm.estado === editEntryEstado.current) delete body.estado;
      if (pedido.pec_id) delete body.pec_numero;
      await apiFetch(`/ventas/pedidos/${pedido.id}`, {
        method: 'PATCH',
        body: JSON.stringify(body),
      });
      setIsEditMode(false);
      await loadPedido();
    } catch (err: any) {
      avisarError(err, 'No se pudieron guardar los cambios');
      if (recargarTrasError(err)) void loadPedido({ silencioso: true });
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
  // H35+H48: notas ACTUALES de la SC y de la COT, aparte de la del pedido. Al crear el pedido se copia la nota
  // de la COT, asi que 'Notas del pedido' solo aparece si es distinta (se edito, o el pedido no viene de una COT).
  const notaSolicitud = (pedido?.sc_notas || '').trim();
  const notaCotizacion = (pedido?.cot_notas || '').trim();
  const notaPedido = (pedido?.notas || '').trim();
  const mostrarNotaPedido = !!notaPedido && notaPedido !== notaCotizacion;
  // U24: las cuentas del Resumen Financiero (total, anticipo requerido, pagado verificado, saldo y lo que falta del
  // anticipo), en pesos enteros. Sin saldo_cop el caso es 'desconocido' (pagado y saldo en null: sin barra ni %).
  const resumenPago = resumenPagoPedido(pedido);
  const cancelado = estadoActual === 'CANCELADO';
  const tercerRecuadro = cancelado ? RECUADRO_CANCELADO : (TERCER_RECUADRO[resumenPago.caso] || TERCER_RECUADRO.desconocido);
  const pagos = Array.isArray(pedido?.pagos) ? pedido.pagos : [];
  const ivaIncluido = textoIvaIncluido(pedido);

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      {/* Ronda 1 (punto 7): a 1024 px las acciones bajan de línea en vez de desbordar (PXP pendiente, «Cancelar Pedido»). */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4 min-w-0">
          {/* H37: un solo botón de volver, con su destino escrito: el return_to saneado o la lista de pedidos (ya no la
              cotización, que sigue a un clic en «Origen»). */}
          <BotonVolver href={destinoVolver(safeReturnTo, '/dashboard/ventas/venta')} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">{pedido?.numero || String(params.id || '').toUpperCase()}</h1>
              <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${estadoCfg.clases.bg} ${estadoCfg.clases.text} ${estadoCfg.clases.border}`}>
                {estadoCfg.label}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">{pedido?.customer_name} &middot; {fDate(pedido?.created_at)}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* B3 T19 (U23 punto 7): antes de «Crear PXP»; botonEnvioPedido lo oculta donde el servidor lo rechazaría. */}
          {envio.boton && (
            <Button color="indigo" icon={Send} onClick={envio.abrir}>{envio.boton.texto}</Button>
          )}
          {puedePxp && (
            <Button color="emerald" icon={DollarSign} loading={creatingPxp} onClick={handleCrearPxp}>Crear PXP</Button>
          )}
          {pxpVigente ? (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-emerald-50 text-emerald-800 border border-emerald-200 rounded-xl font-bold text-sm">
              <CheckCircle2 size={16} /> {textoChipPxp(pxpVigente)}
            </span>
          ) : pxpCancelada && (
            <span className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-500 border border-slate-200 rounded-xl font-bold text-sm">
              {/* T11 ronda 1: el mismo texto que la PXP vigente («PXP-X · Cancelada»), sin repetir la sigla. */}
              {textoChipPxp(pxpCancelada)}
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
                editEntryEstado.current = pedido.estado;
              }
              setIsEditMode(!isEditMode);
            }}
            className={`p-2.5 rounded-xl border transition-colors ${isEditMode ? 'bg-indigo-100 text-indigo-700 border-indigo-300' : 'text-slate-500 border-slate-200 hover:bg-slate-100'}`}>
            <Edit2 size={18} />
          </button>
          {puedeCancelar && (
            <Button variant="danger" icon={X} onClick={() => { setCancelError(''); setShowCancelModal(true); }}>Cancelar Pedido</Button>
          )}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Info del Pedido */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {/* Status Tracker -- N10: los 5 pasos; cada estado cae en el mas cercano y el exacto se lee abajo.
              Se oculta solo en Cancelado y Devuelto (paso -1).
              T11 (V5): cinco columnas del mismo ancho, cada etiqueta centrada bajo su paso, separada (px-1) y con salto
              de línea permitido (a 1024 px salían pegadas). La línea queda a la altura del centro de los círculos
              (top-10 = p-6 + medio círculo) aunque una etiqueta ocupe dos líneas. */}
          {stepIndex >= 0 && (
            <div className="bg-white p-6 border-b border-slate-100 mb-8 flex relative">
              <div className="absolute top-10 h-1 bg-slate-100 -translate-y-1/2 z-0" style={{ left: bordeLineaPasos, right: bordeLineaPasos }} />
              <div className="absolute top-10 h-1 bg-emerald-500 -translate-y-1/2 transition-all duration-500 z-0"
                style={{ left: bordeLineaPasos, width: `calc((100% - 3rem) * ${stepIndex} / ${STEPS.length})` }} />
              {STEPS.map((s, i) => (
                <div key={s.key} className="relative z-10 flex flex-1 basis-0 min-w-0 flex-col items-center gap-2 px-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold shadow-md transition-colors ${
                    i < stepIndex ? 'bg-emerald-500 text-white shadow-emerald-200'
                    : i === stepIndex ? 'bg-indigo-600 text-white shadow-indigo-200'
                    : 'bg-white border-2 border-slate-200 text-slate-300'
                  }`}>
                    {i < stepIndex ? <CheckCircle2 size={16} /> : <Circle size={16} fill={i === stepIndex ? 'currentColor' : 'transparent'} />}
                  </div>
                  <span className={`text-center text-xs font-bold leading-tight break-words ${i <= stepIndex ? 'text-slate-800' : 'text-slate-400'}`}>{s.label}</span>
                </div>
              ))}
            </div>
          )}
          {stepIndex >= 0 && STEPS[stepIndex]?.key !== estadoActual && (
            <p className="-mt-6 mb-8 text-center text-xs font-bold text-slate-500">Estado actual: {estadoCfg.label}</p>
          )}
          {estadoActual === 'DEVUELTO_TOTAL' && (
            <div className="bg-rose-50 border border-rose-200 rounded-2xl p-4 mb-8 flex items-start gap-3">
              <AlertCircle className="text-rose-500 shrink-0 mt-0.5" size={20} />
              <p className="text-sm font-bold text-rose-700">Este pedido fue devuelto totalmente.</p>
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

          {/* H37: @container -- lo de adentro se reacomoda según el ancho REAL de esta columna (también al arrastrar el
              panel de Actividad), no según la ventana. */}
          <div className="max-w-5xl mx-auto space-y-8 @container">

            {/* Cliente + Origen + Entrega */}
            <div className="grid grid-cols-1 @2xl:grid-cols-3 gap-6">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Cliente</label>
                <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-800 break-words">
                  {pedido?.customer_name || 'Sin cliente asignado'}
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Origen</label>
                {/* Cadena SC -> COT -> PVEN: la Solicitud y la Cotizacion de origen, cada una
                    con su "volver" hacia este pedido. */}
                {(pedido?.sc_id || pedido?.cot_id) ? (
                  <div className="flex flex-col gap-2">
                    {pedido?.sc_id && (
                      <Link href={`/dashboard/ventas/solicitud/${pedido.sc_id}?return_to=${encodeURIComponent(`/dashboard/ventas/venta/${params.id}`)}`} className="flex items-center gap-2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-indigo-100 transition-colors">
                        {pedido.sc_numero || `SC-${pedido.sc_id}`}
                      </Link>
                    )}
                    {pedido?.cot_id && (
                      <Link href={`/dashboard/ventas/cotizacion/${pedido.cot_id}?return_to=${encodeURIComponent(`/dashboard/ventas/venta/${params.id}`)}`} className="flex items-center gap-2 bg-blue-50 border border-blue-200 text-blue-700 rounded-xl px-4 py-3 text-sm font-bold hover:bg-blue-100 transition-colors">
                        {pedido.cot_numero || `COT-${pedido.cot_id}`}
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-bold text-slate-400">Sin cotización ni solicitud de origen</div>
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
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-6 mb-10">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Estado</label>
                  {estadoSoloLectura ? (
                    <>
                      <div className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium bg-slate-50 text-slate-500">
                        {estadoCfg.label}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Este estado ya no se puede cambiar manualmente desde aquí.</p>
                    </>
                  ) : (
                    <>
                      {/* N10: solo los manuales que el servidor acepta desde aqui; un estado que no es manual se
                          muestra como "(actual)" y no se reenvia si no se cambia (handleSaveEdit). */}
                      <select value={editForm.estado} onChange={e => setEditForm((f: any) => ({ ...f, estado: e.target.value }))}
                        className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200">
                        {!opcionesEstado.includes(estadoActual) && (
                          <option value={estadoActual} disabled>{estadoCfg.label} (actual)</option>
                        )}
                        {opcionesEstado.map(k => (
                          <option key={k} value={k}>{infoEstadoPedido(k).label}</option>
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
                        {pedido.pec_numero}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-1">Ya está vinculado a un Pedido de Compra real; no se puede editar manualmente.</p>
                    </>
                  ) : (
                    <input type="text" value={editForm.pec_numero} onChange={e => setEditForm((f: any) => ({ ...f, pec_numero: e.target.value }))}
                      className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium outline-none focus:ring-2 focus:ring-indigo-200" />
                  )}
                </div>
                <div className="@lg:col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Notas</label>
                  <textarea value={editForm.notas} onChange={e => setEditForm((f: any) => ({ ...f, notas: e.target.value }))} rows={3}
                    className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm resize-none outline-none focus:ring-2 focus:ring-indigo-200" />
                </div>
                <div className="@lg:col-span-2 flex justify-end">
                  <Button color="indigo" icon={Save} onClick={handleSaveEdit}>Guardar Cambios</Button>
                </div>
              </div>
            )}

            {/* Resumen Financiero */}
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <DollarSign className="text-emerald-600" size={20} /> Resumen Financiero
              </h3>
              {/* B3 T19 (U23 punto 7): cuándo se le envió al cliente y hasta cuándo sirve su enlace (o que venció). */}
              <LineaEnlaceCliente enlace={pedido?.enlace_cliente} estado={estadoActual} />
              {/* U24: el total y tres recuadros grandes (anticipo requerido, pagado verificado y saldo), la barra de lo
                  pagado y el aviso del anticipo pendiente (R4). N1: lo pagado sale del libro de pagos (total - saldo); el
                  requerido, del % guardado en el pedido (60 sin snapshot). @container: los recuadros se apilan cuando la
                  tarjeta mide menos de 448 px. */}
              <div className="@container bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4">
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Total del pedido</p>
                  <p className="text-3xl font-black text-slate-900">{fCOP(resumenPago.total)}</p>
                  {/* B3 T19 (IVA punto 12): 'IVA incluido: $X' (con el IVA discriminado o, r1, con iva_cop > 0) o, en un
                      pedido viejo sin IVA, 'IVA no discriminado'. */}
                  {ivaIncluido && <p className="text-sm font-semibold text-slate-500">{ivaIncluido}</p>}
                </div>
                <div className="grid grid-cols-1 @md:grid-cols-3 gap-3">
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-indigo-700">Anticipo requerido · {formatoPct(resumenPago.anticipoPct)}</p>
                    <p className="text-2xl font-black text-indigo-900">{fCOP(resumenPago.requerido)}</p>
                    {/* Lo que falta del anticipo lo dice el aviso de abajo (R4); en un pedido cancelado el servidor manda 0. */}
                    <p className="text-sm text-indigo-700">{resumenPago.requerido === 0 ? 'No pide anticipo' : 'Del total del pedido'}</p>
                  </div>
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                    <p className="text-xs font-bold uppercase tracking-wider text-emerald-700">Pagado (verificado)</p>
                    <p className="text-2xl font-black text-emerald-800">{resumenPago.pagado === null ? '—' : fCOP(resumenPago.pagado)}</p>
                    <p className="text-sm text-emerald-700">{resumenPago.pctPagado === null ? 'Saldo sin datos' : `${resumenPago.pctPagado}% del total`}</p>
                  </div>
                  <div className={`rounded-xl border p-4 ${tercerRecuadro.caja}`}>
                    <p className={`text-xs font-bold uppercase tracking-wider ${tercerRecuadro.texto}`}>{tercerRecuadro.titulo}</p>
                    <p className={`text-2xl font-black ${tercerRecuadro.valor}`}>
                      {cancelado ? (resumenPago.saldo === null ? '—' : fCOP(resumenPago.saldo))
                        : resumenPago.caso === 'pendiente' ? fCOP(resumenPago.saldo)
                        : resumenPago.caso === 'a_favor' ? fCOP(resumenPago.saldoAFavor)
                        : resumenPago.caso === 'completo' ? fCOP(0) : '—'}
                    </p>
                    <p className={`text-sm ${tercerRecuadro.texto}`}>{tercerRecuadro.ayuda}</p>
                  </div>
                </div>
                {/* Sin saldo conocido (caso 'desconocido') no se pinta la barra ni el % (T6B); en un pedido cancelado
                    tampoco (ronda 1, punto 8): ya no se cobra. */}
                {!cancelado && resumenPago.pagado !== null && resumenPago.pctPagado !== null && (
                  <div>
                    <div className="w-full bg-slate-200 rounded-full h-3 overflow-hidden">
                      <div className="bg-emerald-500 h-3 rounded-full transition-all" style={{ width: `${resumenPago.pctPagado}%` }} />
                    </div>
                    <p className="mt-2 text-sm font-bold text-slate-600">
                      Pagado {fCOP(resumenPago.pagado)} de {fCOP(resumenPago.total)} ({resumenPago.pctPagado}%)
                    </p>
                  </div>
                )}
                {Number(resumenPago.anticipoPendiente) > 0 && (
                  <p className="text-sm font-bold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                    Anticipo pendiente: {fCOP(resumenPago.anticipoPendiente)}. El cliente todavía debe esta parte del anticipo.
                  </p>
                )}
                {pagos.length > 0 && (
                  <ul className="pt-3 border-t border-slate-100 space-y-1.5">
                    {pagos.map((p: any) => {
                      const d = describirPago(p);
                      return (
                        <li key={p.id} className="text-sm text-slate-600 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                          <span className="font-bold text-slate-800">{d.titulo}</span>
                          {d.partes.map((parte, i) => <span key={i}>· {parte}</span>)}
                          {p.fecha && <span>· {fDate(`${p.fecha}T00:00:00`)}</span>}
                          {d.estado && <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-bold">{d.estado}</span>}
                          {d.sinVerificar && <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">Registrado automáticamente, sin verificar</span>}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            {/* Productos */}
            <div>
              <h3 className="text-lg font-black text-slate-800 mb-4 flex items-center gap-2">
                <FileText className="text-indigo-600" size={20} /> Productos
              </h3>
              {/* B3 T19 (IVA punto 12): desde @xl, la tabla PRODUCTO / CANT. / P. UNIT. SIN IVA / IVA / TOTAL CON IVA; bajo
                  @xl (r1: a 1024 px), una tarjeta por línea; debajo, los totales de la COT (detalle-bloque3.tsx). */}
              <TablaProductosPedido pedido={pedido} />
            </div>

            {(notaSolicitud || notaCotizacion || mostrarNotaPedido || pedido?.direccion_entrega) && !isEditMode && (
              <div className="grid grid-cols-1 @lg:grid-cols-2 gap-6">
                {pedido?.direccion_entrega && (
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Dirección de Entrega</label>
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 break-words">
                      {pedido.direccion_entrega}
                    </div>
                  </div>
                )}
                {(notaSolicitud || notaCotizacion || mostrarNotaPedido) && (
                  <div className={`space-y-3 ${pedido?.direccion_entrega ? '' : '@lg:col-span-2'}`}>
                    {/* B3 T20 (M5, R3): la nota de la COT es la que ve el cliente; la de la SC y las del pedido, no. */}
                    {([['Nota de la solicitud', notaSolicitud, null], ['Nota de la cotización', notaCotizacion, AYUDA_NOTA_CLIENTE],
                      ['Notas del pedido', mostrarNotaPedido ? notaPedido : '', null]] as const).filter(([, t]) => t).map(([titulo, t, ayuda]) => (
                      <div key={titulo}>
                        <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">{titulo}</label>
                        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-700 whitespace-pre-wrap break-words">
                          {t}
                        </div>
                        {ayuda && <p className="text-xs text-slate-500 mt-1.5">{ayuda}</p>}
                      </div>
                    ))}
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
                      setSupplierSearch(''); setSelectedSupplier(null); setSuppliers([]); setPecError('');
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

          {/* U6+H22 (C11): Actividad | Chatter | IA, el orden de la solicitud; 'IA' con Sparkles, sin emoji. */}
          <div className="flex border-b border-slate-200 bg-slate-50/50 shrink-0">
            {([['actividad', 'Actividad'], ['chatter', 'Chatter'], ['ia', 'IA']] as const).map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPanelTab(k)}
                className={`px-4 py-3 text-sm font-bold border-b-2 transition-colors ${panelTab === k ? 'text-indigo-700 border-indigo-600 bg-white' : 'text-slate-500 border-transparent hover:text-slate-700'}`}>
                {k === 'ia' ? <span className="inline-flex items-center gap-1.5"><Sparkles size={14} />{l}</span> : l}
              </button>
            ))}
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
              {/* U6+H22: la caja de notas y los botones de contacto se mudaron a la pestaña Chatter (ChatterDocumento:
                  nota interna, llamada, WhatsApp, correo y Nota externa). Aquí queda el enlace 'Escribir nota'. */}
              <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
                <div className="flex items-center justify-between gap-2 mb-6">
                  <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Línea Temporal</h4>
                  <button type="button" onClick={() => setPanelTab('chatter')}
                    className="inline-flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:underline">
                    <MessageSquare size={12} /> Escribir nota
                  </button>
                </div>
                <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
                  {[...actividades].reverse().map((a: any, i: number) => {
                    // B3 T19 (RP22): ENVIADO_AL_CLIENTE, MENSAJE_CLIENTE y las demás acciones nuevas toman su hex y su
                    // etiqueta de ACCIONES_BLOQUE3 (T13), sin copiarlos en ACTIVITY_STYLE.
                    const b3 = accionBloque3(a.action);
                    return (
                    <div key={i} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                      <div className="flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10"
                        style={{ color: ACTIVITY_STYLE[a.action] || b3?.hex || '#94a3b8' }}>
                        <Activity size={14} />
                      </div>
                      <div className="flex-1 min-w-0 bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                        {/* U6+H22: una nota del Chatter lleva su tipo encima (Nota interna, Llamada…, «Nota externa · medio»). */}
                        {esEntradaChatter(a) && <div className="mb-1.5"><EtiquetaChatter actividad={a} /></div>}
                        {/* T11 (V3): la misma cabecera que la SC y la COT (F12: el título arriba y la fecha debajo).
                            Revisión final (F3): la fecha y la hora del renglón pasan por comoUTC (solo aquí, no en fDate:
                            una fecha de negocio a las 00:00 se correría un día). */}
                        <CabeceraActividad className="mb-2" titulo={a.description || b3?.etiqueta || humanizarCodigo(a.action)}
                          fecha={`${fDate(comoUTC(a.created_at))}${a.created_at ? ` ${new Date(comoUTC(a.created_at)).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}` : ''}`} />
                        <CambiosDeActividad extra={a.extra_data} />
                        <p className="text-xs font-medium text-slate-500">{a.user_name || 'Sistema'}</p>
                      </div>
                    </div>
                    );
                  })}
                </div>
                {actividades.length === 0 && <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavía.</p>}
              </div>
            </>
          )}

          {/* U6+H22 (R1): el Chatter compartido (nota interna, llamada, WhatsApp, correo y Nota externa con su medio). La
              nota guardada entra de una vez aquí y en la Actividad, sin el spinner de página; si el servidor no devuelve
              el renglón, recarga silenciosa. */}
          {panelTab === 'chatter' && (
            <div className="flex-1 overflow-y-auto p-5 custom-scrollbar bg-white">
              <ChatterDocumento tipoDoc="VEN" doc={pedido}
                onRegistrado={(log) => log ? setPedido((p: any) => agregarActividad(p, log, 'VEN')) : void loadPedido({ silencioso: true })} />
            </div>
          )}
        </div>
      </div>
      {showPecModal && pedido && (
        <Modal title="Crear Pedido de Compra" icon={ShoppingCart} color="purple"
          subtitle={`Vinculado a ${pedido.numero} — ${pedido.customer_name}`}
          // Mientras se crea el PEC no se cierra (ni la X ni 'Cancelar'): el resultado siempre llega a una ventana abierta.
          onClose={() => { if (!pecSaving) setShowPecModal(false); }} bloquearCierre={pecSaving}
          footer={(
            <>
              <Button variant="secondary" disabled={pecSaving} onClick={() => setShowPecModal(false)}>Cancelar</Button>
              <Button color="purple" icon={ShoppingCart} loading={pecSaving} disabled={!selectedSupplier} onClick={handleCrearPEC}>Crear PEC</Button>
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
                  <button key={s.id} onClick={() => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); setPecError(''); }}
                    className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium border-b last:border-0">
                    {s.name} {s.city && <span className="text-slate-400">· {s.city}</span>}
                  </button>
                ))}
              </div>
            )}
            {selectedSupplier ? (
              <p className="text-xs text-purple-700 font-bold mt-1 flex items-center gap-1">
                <CheckCircle2 size={12} /> {selectedSupplier.name} seleccionado
              </p>
            ) : (
              <p className="text-xs text-slate-400 mt-1">Selecciona un proveedor o crea uno nuevo.</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Días Entrega Estimada</label>
              <input type="number" min="1" value={pecForm.dias_entrega} onChange={e => { setPecError(''); setPecForm(f => ({ ...f, dias_entrega: Number(e.target.value) })); }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
              <select value={pecForm.modalidad_pago} onChange={e => { setPecError(''); setPecForm(f => ({ ...f, modalidad_pago: e.target.value })); }}
                className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                {['Contado', 'Credito 30d', 'Credito 60d', 'Adelanto 50%', 'Contra entrega'].map(p => <option key={p} value={p}>{etiquetaModalidad(p)}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas</label>
            <textarea value={pecForm.notas} onChange={e => { setPecError(''); setPecForm(f => ({ ...f, notas: e.target.value })); }}
              rows={2} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200" />
          </div>
          {pecError && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{pecError}</p>}
        </Modal>
      )}
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s) => { setSelectedSupplier(s); setSupplierSearch(s.name); setSuppliers([]); setPecError(''); setShowNewSupplier(false); }}
          onClose={() => setShowNewSupplier(false)}
        />
      )}
      {showCancelModal && (
        <Modal title="Cancelar Pedido de Venta" icon={AlertCircle} color="red" maxWidth="md"
          // Mientras se cancela no se cierra (ni la X ni 'Volver'): el resultado siempre llega a una ventana abierta.
          onClose={() => { if (!cancelling) setShowCancelModal(false); }} bloquearCierre={cancelling}
          footer={(
            <>
              <Button variant="secondary" disabled={cancelling} onClick={() => setShowCancelModal(false)}>Volver</Button>
              <Button variant="danger" icon={X} loading={cancelling} disabled={cancelRazon.trim().length < 5} onClick={handleCancelarPedido}>Confirmar Cancelación</Button>
            </>
          )}>
          <p className="text-sm text-slate-500">Esta acción marca el pedido como <strong>Cancelado</strong>. Indica el motivo (mínimo 5 caracteres).</p>
          {pedido?.cot_numero && (
            <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl p-3">
              La cotización {pedido.cot_numero} volverá a Borrador para que puedas ajustarla, reenviarla al cliente y crear otro pedido.
            </p>
          )}
          {/* B7 (R6): lo pagado no se pierde: queda como saldo a favor de la cotización (sin COT no hay a dónde pasarlo). */}
          {pedido?.cot_numero && saldoAFavorAlCancelar(pedido) > 0 && (
            <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
              El dinero ya pagado queda como saldo a favor de la cotización y pasa al pedido nuevo si la vuelves a convertir.
            </p>
          )}
          {/* H45: el servidor cancela solo las PXP PENDIENTE; una pagada no se toca y deja un aviso de revision. */}
          {pxpVigente && (
            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-xl p-3">
              {pxpVigente.estado === 'PENDIENTE'
                ? `También se cancelará la orden de pago ${pxpVigente.numero} (pendiente ${fCOP(pxpVigente.monto_pendiente)}).`
                : `La orden de pago ${pxpVigente.numero} está ${etiquetaEstadoPxp(pxpVigente.estado).toLowerCase()}: no se cancela y queda un aviso para revisar la devolución o el saldo a favor del cliente.`}
            </p>
          )}
          <textarea value={cancelRazon} onChange={e => { setCancelError(''); setCancelRazon(e.target.value); }} rows={3} autoFocus
            placeholder="Ej: Cliente desistió de la compra, error en el pedido, etc."
            className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-red-200 resize-none" />
          {cancelRazon.trim().length < 5 && <p className="text-xs text-red-500 -mt-2">El motivo es obligatorio. Mínimo 5 caracteres (llevas {cancelRazon.trim().length}).</p>}
          {cancelError && <p role="alert" className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{cancelError}</p>}
        </Modal>
      )}
      {/* B3 T19 (U23 punto 7, U16-envio, RP19): el canal del envío. customerHasPhone sobre telefono_whatsapp (el e164 que
          valida el servidor); el porqué mira el teléfono escrito si no hay e164 (como la SC). envioWhatsApp (A mayúscula)
          es el estado del automático; el error del envío va dentro (H49). */}
      {envio.abierto && (
        <ChannelModal
          selectedChannel={envio.canal}
          onSelectChannel={envio.elegirCanal}
          onConfirm={envio.enviarAlCliente}
          onCancel={envio.cerrar}
          saving={envio.enviando}
          documentLabel="confirmación del pedido"
          customerHasPhone={!motivoTelefono(pedido?.telefono_whatsapp)}
          textoSinTelefono={textoSinTelefono(pedido?.telefono_whatsapp ?? pedido?.customer_phone) ?? undefined}
          customerEmail={pedido?.customer_email ?? null}
          envioWhatsApp={envio.estadoWhatsApp}
          nota={envio.boton?.reenvio ? NOTA_REENVIO_ENLACE : undefined}
          error={envio.error}
        />
      )}
      {/* B3 T19 (T16, RP23): la ventana del enlace en modo consulta, con el resultado del WhatsApp (envioWhatsapp, w
          minúscula), el teléfono e164, el correo de respaldo y hasta cuándo sirve (30 días, R6). */}
      {envio.resultado && (
        <EnlaceConfirmacionModal tipo="consulta" documento={`el pedido ${pedido?.numero || ''}`} link={envio.resultado.link}
          color="indigo" correo={envio.resultado.correo} canal={envio.resultado.canal}
          whatsappUrl={envio.resultado.whatsappUrl} envioWhatsapp={envio.resultado.envioWhatsapp}
          telefono={pedido?.telefono_whatsapp ?? null} vence={envio.resultado.vence}
          onClose={envio.cerrarResultado} />
      )}
    </div>
  );
}

// useSearchParams() exige un limite de Suspense para no romper el prerenderizado estatico
// (mismo patron ya usado en solicitud/[id]/page.tsx, agregado aqui en Gate 2 al leer return_to).
export default function PedidoVentaDetallePage() {
  return (
    <Suspense fallback={(
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-indigo-600" size={28} />
      </div>
    )}>
      <PedidoVentaDetalleContent />
    </Suspense>
  );
}
