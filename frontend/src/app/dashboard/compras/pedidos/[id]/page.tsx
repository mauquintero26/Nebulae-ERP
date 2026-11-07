"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import type { ComponentType, CSSProperties } from 'react';
import {
  ArrowLeft, Edit2, MessageSquare,
  MapPin, Clock,
  Box, Truck, PackageCheck, FileText,
  RefreshCw, AlertCircle, Activity
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Badge, Button, ContenidoEnlace, useAvisos } from '@/components/ui';
// B4 T15 (TABLA-compras punto 12, FLUJO-compras punto 7, H13): las etapas reales del envío en la barra estándar, las
// tablas de detalle en modo simple y, en vez de campos y botones que no guardaban, texto de solo lectura.
import { TablaEstandar, usePreferenciasTabla } from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { PasosFlujo } from '@/components/flujo';
import { diaPec, etapaPec, infoEstadoPec } from '@/lib/estados-compras';
import { pasosDeTracking } from '@/lib/flujo-compras';
import { fechaCorta, fechaHoraLarga } from '@/lib/fechas-colombia';
import { formatoPesos } from '@/lib/pesos';

// C10: la etiqueta y el color del estado salen de estados-compras.js (se fueron la barra fija de 4 nodos, que se pintaba
// por posición, y la tabla de etiquetas propia de esta página, que contradecía a la de la lista).

const ACTIVITY_STYLE: Record<string, { icon: ComponentType<{ size?: number }>; color: string }> = {
  CREATED:           { icon: FileText,     color: 'text-emerald-500 bg-emerald-50' },
  TRACKING_UPDATED:  { icon: Truck,        color: 'text-blue-500 bg-blue-50' },
  ESTADO_CHANGED:    { icon: Activity,     color: 'text-amber-500 bg-amber-50' },
  RECEPCION_CREATED: { icon: PackageCheck, color: 'text-emerald-500 bg-emerald-50' },
};
const DEFAULT_ACTIVITY_STYLE = { icon: MessageSquare, color: 'text-slate-500 bg-slate-50' };

// B4 T15 (resolución 4): un instante (fecha de compra, la Actividad) en Colombia; un día de negocio (la entrega estimada)
// tal como se guarda (diaPec, RP40), sin correrlo. Lo vacío, '—'. Los montos en pesos enteros (H42).
const textoInstante = (v: unknown) => fechaCorta(v) || '—';
const textoDia = (v: unknown) => fechaCorta(diaPec(v)) || '—';
const fCOP = (v: unknown) => formatoPesos(Number(v) || 0);

/** Una línea de productos del PEC (el JSON `productos`), con su posición como clave de la tabla. */
type LineaPec = {
  id: number; nombre: string; variante: string | null; destino: string; cantidad: number; precio: number; total: number;
  /** El «Estado interno» de la línea: el del PEC, con su etiqueta (C10), como antes. */
  estado: string;
};
/** Un renglón de la Actividad del PEC. */
type RenglonActividad = {
  id: number; action: string; descripcion: string; cambio: string | null; quien: string; cuando: string | null;
};

const DESTINOS: Record<string, string> = { MAU: 'Socio Mau', NEBULAE: 'Stock Nebulae', CLIENTE: 'Cliente' };

/** Un dato de solo lectura (H13: antes era un campo que parecía editable y no guardaba nada). */
function Dato({ etiqueta, valor, icono, tono = 'normal' }: {
  etiqueta: string; valor: string | null | undefined; icono?: ComponentType<{ size?: number }>; tono?: 'normal' | 'alerta';
}) {
  const Icono = icono;
  return (
    <div className="min-w-0">
      <p className={`mb-1 flex items-center gap-1 text-xs font-bold uppercase tracking-wider ${tono === 'alerta' ? 'text-rose-700' : 'text-slate-500'}`}>
        {Icono && <Icono size={14} />} {etiqueta}
      </p>
      <p className={`truncate text-sm font-bold ${tono === 'alerta' ? 'text-rose-700' : 'text-slate-800'}`} title={valor || undefined}>
        {valor || '—'}
      </p>
    </div>
  );
}

/**
 * B4 T15 (TABLA-compras punto 12): los productos del PEC en la tabla estándar en modo simple, con las 6 columnas de antes
 * (Nombre / Atributos, Destino, Cant., Precio unit., Estado interno y Total neto). Una constante (estable, D40).
 */
const COLUMNAS_PRODUCTOS: ColumnaTabla<LineaPec>[] = [
  { id: 'nombre', titulo: 'Nombre / Atributos', ancho: 160, flexible: true, anchoMax: 960, titleCelda: (l) => l.nombre,
    celda: (l) => (
      <span className="block leading-tight">
        <span className="block truncate text-sm font-bold text-slate-800">{l.nombre}</span>
        {l.variante && <span className="block truncate text-xs text-slate-500">{l.variante}</span>}
      </span>
    ) },
  { id: 'destino', titulo: 'Destino', ancho: 104, celda: (l) => <span className="text-sm font-medium text-slate-600">{l.destino}</span> },
  { id: 'cantidad', titulo: 'Cant.', ancho: 64, alinear: 'centro', celda: (l) => <span className="font-bold text-slate-700">{l.cantidad}</span> },
  { id: 'precio', titulo: 'Precio unit.', ancho: 112, alinear: 'derecha', titleCelda: (l) => fCOP(l.precio),
    celda: (l) => <span className="whitespace-nowrap text-sm font-medium text-slate-700">{fCOP(l.precio)}</span> },
  { id: 'estado', titulo: 'Estado interno', ancho: 120, titleCelda: (l) => l.estado,
    celda: (l) => <Badge tone="warning">{l.estado}</Badge> },
  { id: 'total', titulo: 'Total neto', ancho: 120, alinear: 'derecha', titleCelda: (l) => fCOP(l.total),
    celda: (l) => <span className="whitespace-nowrap font-black text-slate-800">{fCOP(l.total)}</span> },
];

/**
 * B4 T15 (TABLA-compras punto 12): la Actividad del PEC en la tabla estándar en modo simple: cuándo (con la hora de
 * Colombia), qué pasó (con el ícono de su acción y, si cambió el estado, «antes → después» con sus etiquetas, C10) y quién.
 */
const COLUMNAS_ACTIVIDADES: ColumnaTabla<RenglonActividad>[] = [
  { id: 'cuando', titulo: 'Fecha', ancho: 120, titleCelda: (r) => fechaHoraLarga(r.cuando) || textoInstante(r.cuando),
    celda: (r) => (
      <span className="block whitespace-normal text-xs leading-tight text-slate-600">{fechaHoraLarga(r.cuando) || textoInstante(r.cuando)}</span>
    ) },
  { id: 'que', titulo: 'Qué pasó', ancho: 168, flexible: true, titleCelda: (r) => [r.descripcion, r.cambio].filter(Boolean).join(' · '),
    celda: (r) => {
      const estilo = ACTIVITY_STYLE[r.action] || DEFAULT_ACTIVITY_STYLE;
      const Icono = estilo.icon;
      return (
        <span className="flex min-w-0 items-start gap-2 py-1.5">
          <span aria-hidden="true" className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${estilo.color}`}><Icono size={12} /></span>
          <span className="block min-w-0 leading-tight">
            <span className="block whitespace-normal break-words text-sm font-bold text-slate-800">{r.descripcion}</span>
            {r.cambio && <span className="block whitespace-normal text-xs text-slate-600">{r.cambio}</span>}
          </span>
        </span>
      );
    } },
  { id: 'quien', titulo: 'Quién', ancho: 100, titleCelda: (r) => r.quien,
    celda: (r) => <span className="block truncate text-xs font-medium text-slate-600">{r.quien}</span> },
];

export default function PedidoCompraDetallePage() {
  const params = useParams();
  const isNew = params.id === 'nueva';

  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [advancing, setAdvancing] = useState(false);
  const { avisarError } = useAvisos();
  // TABLA-compras punto 12 (D40, D41): un solo usePreferenciasTabla por tabla de detalle (las columnas se estiran, se
  // mueven y se recuerdan; sin paginación, orden ni selección).
  const prefsProductos = usePreferenciasTabla('compras.pec.productos', COLUMNAS_PRODUCTOS);
  const prefsActividades = usePreferenciasTabla('compras.pec.actividades', COLUMNAS_ACTIVIDADES);

  useEffect(() => {
    setCurrentUser(localStorage.getItem('user_name') || localStorage.getItem('username') || '');
  }, []);

  const loadPedido = useCallback(async () => {
    if (isNew || !params.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const raw = await apiFetch(`/compras/pedidos/${params.id}`);
      setPedido(raw?.data ?? raw);
    } catch (err: any) {
      setLoadError(err.message || 'No se pudo cargar el pedido de compra');
    }
    setLoading(false);
  }, [params.id, isNew]);

  useEffect(() => { loadPedido(); }, [loadPedido]);

  // Resizable Right Pane Logic
  const [rightWidth, setRightWidth] = useState(450);
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
    const newWidth = Math.min(Math.max(350, startWidth.current + delta), 800);
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

  // B4 T15 (FLUJO-compras punto 7): las etapas son las del arreglo del PEC (3 si el envío es directo, 4 si va por
  // casillero), por nombre y en su orden, no 4 posiciones fijas; completedCount se cuenta sobre ellas.
  const stages: any[] = Array.isArray(pedido?.tracking_stages) ? pedido.tracking_stages : [];
  const completedCount = stages.filter((s) => s?.status === 'COMPLETADO').length;
  const estadoActual = pedido?.estado || 'BORRADOR';
  const infoEstado = infoEstadoPec(estadoActual);
  // Un PEC cancelado no sigue su envío: la barra y «Avanzar etapa» no se pintan (como la barra del pedido de venta, T10).
  const cancelado = etapaPec(estadoActual) === 'cancelado';
  const recepciones: any[] = pedido?.recepciones || [];
  const ultimaRecepcion = recepciones.length > 0 ? recepciones[recepciones.length - 1] : null;
  const productos: any[] = Array.isArray(pedido?.productos) ? pedido.productos : [];
  const actividades: any[] = Array.isArray(pedido?.actividades) ? pedido.actividades : [];
  // TABLA-compras punto 12: las filas de las dos tablas de detalle (la clave de cada una, su posición).
  const lineas: LineaPec[] = productos.map((p, i) => {
    const cantidad = Number(p.qty ?? p.cantidad ?? 0);
    const precio = Number(p.unit_price_cop ?? p.precio_unitario ?? p.cost_cop ?? 0);
    return {
      id: i, nombre: p.product_name || p.producto_nombre || p.nombre || p.descripcion || 'Producto sin nombre',
      variante: p.variante || null, destino: DESTINOS[p.destino] || '—', cantidad, precio, total: cantidad * precio,
      estado: infoEstado.label,
    };
  });
  const renglones: RenglonActividad[] = actividades.map((a, i) => ({
    id: a.id ?? i, action: a.action || '', descripcion: a.description || a.action || '—',
    cambio: a.old_estado && a.new_estado ? `${infoEstadoPec(a.old_estado).label} → ${infoEstadoPec(a.new_estado).label}` : null,
    quien: a.user_name || 'Sistema', cuando: a.created_at || null,
  }));

  async function avanzarTracking() {
    if (!pedido?.id) return;
    const next = stages.find((s: any) => s.status !== 'COMPLETADO');
    if (!next) return;
    const nextStatus = next.status === 'EN_PROCESO' ? 'COMPLETADO' : 'EN_PROCESO';
    setAdvancing(true);
    try {
      await apiFetch(`/compras/pedidos/${pedido.id}/tracking`, {
        method: 'PATCH',
        body: JSON.stringify({ stage: next.stage, status: nextStatus, user_name: currentUser }),
      });
      // RP45: el estado que deje el servidor (un PEC en bodega o recibido lo conserva) se lee recargando.
      await loadPedido();
    } catch (err) {
      // RP30: un aviso del sistema con el mensaje del servidor (nunca alert()).
      avisarError(err, 'No se pudo actualizar el seguimiento');
    }
    setAdvancing(false);
  }

  if (loading) {
    return (
      <div className="w-full h-full flex items-center justify-center bg-white">
        <RefreshCw className="animate-spin text-emerald-600" size={28} />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-white">
        <AlertCircle className="text-rose-500" size={32} />
        <p className="text-slate-600 font-medium">{loadError}</p>
        <Link href="/dashboard/compras/pedidos" className="text-emerald-600 font-bold text-sm hover:underline">
          Volver al listado de pedidos de compra
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full h-full bg-white flex flex-col overflow-hidden">

      {/* Top Action Bar */}
      <div className="bg-white px-4 sm:px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 z-20 shadow-sm shrink-0">
        <div className="flex min-w-0 items-center gap-4">
          <Link href="/dashboard/compras/pedidos" aria-label="Volver a Pedidos de compra" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-xl sm:text-2xl font-black text-slate-800">
                {isNew ? 'Nuevo Pedido de Compra' : (pedido?.numero || String(params.id).toUpperCase())}
              </h1>
              {/* C10: la etiqueta y el color de estados-compras.js; «Vencido» lo manda el servidor (RP40). */}
              {!isNew && pedido && (
                <span className={`rounded-full border px-2.5 py-1 text-xs font-black ${infoEstado.clases.bg} ${infoEstado.clases.text} ${infoEstado.clases.border}`}>{infoEstado.label}</span>
              )}
              {!isNew && pedido?.is_overdue && (
                <span className="rounded-full border border-rose-200 bg-rose-100 px-2 py-0.5 text-xs font-black text-rose-700">Vencido</span>
              )}
            </div>
          </div>
        </div>

        {/* H13: el botón de guardar de antes no guardaba nada. Se edita en el panel de Pedidos de compra (Info, con su PATCH). */}
        {!isNew && pedido?.id && (
          <div className="flex items-center gap-3">
            <Link href={`/dashboard/compras/pedidos?id=${pedido.id}`}
              className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-700 shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700">
              <ContenidoEnlace icon={Edit2}>Editar en Pedidos de compra</ContenidoEnlace>
            </Link>
          </div>
        )}
      </div>

      {/* Main Content Layout (Split Pane). B4 T15 (banco, R26): desde xl (1280 px) el panel de la Actividad va al lado y
          se ajusta con el asa, como antes; por debajo va debajo de la información, a todo el ancho (con 450 px fijos al lado,
          a 1024 px con el menú abierto la información quedaba en 250 px y a 375 px la página se corría de lado). */}
      <div className="flex-1 flex flex-col xl:flex-row overflow-y-auto xl:overflow-hidden">

        {/* BLOQUE 1: Informacion del Pedido de Compra */}
        <div className="xl:flex-1 xl:overflow-y-auto px-4 sm:px-8 py-8 custom-scrollbar bg-white relative min-w-0">

          {ultimaRecepcion && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><PackageCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancía entregada. Recepción {ultimaRecepcion.numero} generada.</h3>
                  <p className="text-sm text-emerald-700">El departamento de inventario debe realizar el conteo de la recepción.</p>
                </div>
              </div>
              <Link href={`/dashboard/compras/recepciones/${ultimaRecepcion.id}`} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors">
                Ver recepción (Inventario)
              </Link>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-10">

            {/* Cabecera del Pedido */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Información de compra
              </h2>

              {/* B4 T15 (H13): texto de solo lectura (antes, campos con defaultValue que no guardaban). Se fueron la dirección
                  y el teléfono del proveedor: el PEC no los trae y siempre salían vacíos. La entrega es un día de negocio
                  (RP40) y va en rojo si el servidor dice que está vencida. */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-4 sm:p-6">
                <div className="col-span-2"><Dato etiqueta="Proveedor" valor={isNew ? null : pedido?.supplier_name} /></div>
                <div className="col-span-2"><Dato etiqueta="Ref. proveedor (factura / cotización)" valor={isNew ? null : pedido?.supplier_ref} /></div>
                <div className="col-span-2"><Dato etiqueta="Fecha de compra" valor={isNew ? null : textoInstante(pedido?.fecha_compra)} /></div>
                <div className="col-span-2">
                  <Dato etiqueta="Fecha estimada de entrega (ETA)" icono={Clock} tono={pedido?.is_overdue ? 'alerta' : 'normal'}
                    valor={isNew ? null : textoDia(pedido?.fecha_entrega_estimada)} />
                </div>
              </div>
            </div>

            {/* Bloque Logistico (Rutas y Tracking) */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <Truck className="text-blue-600" size={24} /> Logística y tracking
              </h2>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                {/* B4 T15 (H13): texto de solo lectura; se fue el botón de rastrear la guía, que no hacía nada. */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-8">
                  <Dato etiqueta="Ubicación de entrega final" icono={MapPin}
                    valor={isNew ? null : (pedido?.warehouse_id ? `Bodega #${pedido.warehouse_id}` : 'Sin bodega asignada')} />
                  <Dato etiqueta="Carrier / Transportadora" valor={isNew ? null : pedido?.carrier} />
                  <Dato etiqueta="N° de tracking (guía)" valor={isNew ? null : pedido?.tracking_number} />
                </div>

                {/* Tracker de Estados Logisticos. B4 T15 (FLUJO-compras punto 7; RP28): la barra estándar con las etapas
                    reales del envío (pasosDeTracking: 3 si es directo, 4 por casillero, en el orden del arreglo), la en
                    curso resaltada y el aviso rojo solo si la etapa va atrasada. Cancelado: ni barra ni «Avanzar etapa». */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center gap-3 mb-6">
                    <span className="text-sm font-bold text-slate-700">Progreso de la importación / ruta</span>
                    {!isNew && !cancelado && completedCount < stages.length && (
                      <Button size="sm" color="blue" icon={Truck} loading={advancing} onClick={avanzarTracking}>Avanzar etapa logística</Button>
                    )}
                  </div>
                  {cancelado ? (
                    <p className="text-sm text-slate-600">Pedido de compra cancelado: su envío ya no se sigue.</p>
                  ) : stages.length > 0 ? (
                    <div className="max-w-3xl mx-auto">
                      <PasosFlujo variante="barra" pasos={pasosDeTracking(stages)} etiqueta={`Etapas del envío de ${pedido?.numero || 'este pedido'}`} />
                    </div>
                  ) : (
                    <p className="text-sm text-slate-500">Sin etapas de seguimiento configuradas para este pedido.</p>
                  )}
                </div>

              </div>
            </div>

            {/* ARTÍCULOS */}
            <div>
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-6">
                <Box className="text-emerald-600" size={24} /> Productos Requeridos
              </h3>

              {/* B4 T15 (TABLA-compras punto 12): la tabla estándar en modo simple (se estira, se mueve y se recuerda; sin
                  paginación, orden ni selección), con el «Gran total» de la cabecera debajo, como antes. */}
              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <TablaEstandar id="compras.pec.productos" modo="simple" columnas={COLUMNAS_PRODUCTOS} preferencias={prefsProductos}
                  filas={lineas} vacio={<span className="italic">Sin productos registrados en este pedido.</span>} etiqueta="Productos del pedido de compra" />
                <div className="flex items-center justify-end gap-6 border-t border-slate-200 bg-slate-50 px-4 py-4">
                  <span className="text-xs font-bold uppercase text-slate-500">Gran total del pedido</span>
                  <span className="text-xl font-black text-emerald-700">{fCOP(pedido?.total_cop)}</span>
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="hidden xl:block w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitacora (Historial); el ancho del asa solo desde xl (la variable --ancho-actividad). */}
        <div style={{ '--ancho-actividad': `${rightWidth}px` } as CSSProperties}
          className="bg-white flex flex-col xl:overflow-hidden shrink-0 w-full xl:w-[var(--ancho-actividad)] border-t border-slate-200 xl:border-t-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades del Pedido
            </h3>
          </div>

          {/* B4 T15 (H13): se fueron «Nota», la caja de texto y «Enviar», que no guardaban nada. La Actividad es la tabla
              estándar en modo simple (TABLA-compras punto 12), con su fecha y hora de Colombia y los estados con su nombre. */}
          <div className="xl:flex-1 xl:overflow-y-auto p-4 sm:p-6 custom-scrollbar bg-slate-50">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4">Línea temporal</h4>
            <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
              <TablaEstandar id="compras.pec.actividades" modo="simple" columnas={COLUMNAS_ACTIVIDADES} preferencias={prefsActividades}
                filas={renglones} vacio={<span className="italic">Sin actividad registrada todavía.</span>} etiqueta="Actividad del pedido de compra" />
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
