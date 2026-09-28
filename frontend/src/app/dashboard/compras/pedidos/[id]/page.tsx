"use client";

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft, Save, Send, Paperclip, MessageSquare,
  MapPin, Clock, CheckCircle2, Circle,
  Box, Search, Truck, AlertTriangle, PackageCheck, FileText, Link as LinkIcon,
  RefreshCw, AlertCircle, Activity
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import { Badge, Button } from '@/components/ui';

// Los 4 stages reales de PurchaseOrderFull.tracking_stages, en orden
// (ver create_pec en erp_compras.py:328-333). El indice de este arreglo
// corresponde 1:1 al indice del arreglo tracking_stages que devuelve el backend.
const STAGE_NODES = [
  { stage: 'PROVEEDOR_CASILLERO', label: 'Proveedor' },
  { stage: 'CASILLERO_ADUANA',    label: 'Casillero' },
  { stage: 'ADUANA_BODEGA',       label: 'Aduana' },
  { stage: 'ENTREGADO',           label: 'Bodega (Entregado)' },
];

// Etiquetas de PurchaseOrderFull.estado realmente observadas en erp_compras.py
// (create_pec -> BORRADOR; update_tracking -> EN_TRANSITO/RECIBIDO;
// confirmar_recepcion -> RECIBIDA/PARCIALMENTE_RECIBIDA; update_pec permite
// fijar manualmente cualquier valor de PEC_ESTADOS en pedidos/page.tsx,
// incluidos EMITIDO/ENVIADO/PENDIENTE_ENTREGA/COMPLETADO/CANCELADO).
const ESTADO_LABELS: Record<string, string> = {
  BORRADOR: 'Pedido Compra Creado',
  EMITIDO: 'Emitido',
  ENVIADO: 'Enviado',
  EN_TRANSITO: 'Pedido pendiente por entrega',
  PENDIENTE_ENTREGA: 'Pendiente Entrega',
  RECIBIDO: 'Entregado en bodega',
  RECIBIDA: 'Entregado en bodega',
  PARCIALMENTE_RECIBIDA: 'Parcialmente recibido',
  COMPLETADO: 'Completado',
  CANCELADO: 'Cancelado',
};
const ESTADOS_RECIBIDOS = ['RECIBIDO', 'RECIBIDA', 'COMPLETADO'];

const ACTIVITY_STYLE: Record<string, { icon: any; color: string }> = {
  CREATED:           { icon: FileText,     color: 'text-emerald-500 bg-emerald-50' },
  TRACKING_UPDATED:  { icon: Truck,        color: 'text-blue-500 bg-blue-50' },
  ESTADO_CHANGED:    { icon: Activity,     color: 'text-amber-500 bg-amber-50' },
  RECEPCION_CREATED: { icon: PackageCheck, color: 'text-emerald-500 bg-emerald-50' },
};
const DEFAULT_ACTIVITY_STYLE = { icon: MessageSquare, color: 'text-slate-500 bg-slate-50' };

const fDateInput = (iso: any) => iso ? String(iso).slice(0, 10) : '';
const fDateLong = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
const fCOP = (v: any) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(Number(v) || 0);

export default function PedidoCompraDetallePage() {
  const params = useParams();
  const isNew = params.id === 'nueva';

  const [pedido, setPedido] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [advancing, setAdvancing] = useState(false);

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

  const stages: any[] = pedido?.tracking_stages || [];
  const completedCount = STAGE_NODES.filter((_, i) => stages[i]?.status === 'COMPLETADO').length;
  const estadoActual = pedido?.estado || 'BORRADOR';
  const estadoLabel = ESTADO_LABELS[estadoActual] || estadoActual;
  const isRecibido = ESTADOS_RECIBIDOS.includes(estadoActual);
  const recepciones: any[] = pedido?.recepciones || [];
  const ultimaRecepcion = recepciones.length > 0 ? recepciones[recepciones.length - 1] : null;
  const productos: any[] = pedido?.productos || [];
  const actividades: any[] = pedido?.actividades || [];

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
      await loadPedido();
    } catch (err: any) {
      alert('Error al actualizar el tracking: ' + err.message);
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
      <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between z-20 shadow-sm shrink-0">
        <div className="flex items-center gap-4">
          <Link href="/dashboard/compras/pedidos" className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors">
            <ArrowLeft size={20} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-black text-slate-800">
                {isNew ? 'Nuevo Pedido de Compra' : (pedido?.numero || String(params.id).toUpperCase())}
              </h1>
              {!isNew && pedido && (
                <Badge tone={isRecibido ? 'success' : 'warning'}>{estadoLabel}</Badge>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Button variant="secondary" icon={Save}>Guardar Cambios</Button>
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Informacion del Pedido de Compra */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {ultimaRecepcion && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 max-w-6xl mx-auto">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><PackageCheck size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Mercancia Entregada. Recepcion {ultimaRecepcion.numero} Generada.</h3>
                  <p className="text-sm text-emerald-700">El departamento de inventario debe realizar el conteo de la recepcion.</p>
                </div>
              </div>
              <Link href={`/dashboard/compras/recepciones/${ultimaRecepcion.id}`} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors">
                Ver Recepcion (Inventario)
              </Link>
            </div>
          )}

          <div className="max-w-6xl mx-auto space-y-10">

            {/* Cabecera del Pedido */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <FileText className="text-emerald-600" size={24} /> Informacion de Compra
              </h2>

              <div className="grid grid-cols-4 gap-6 bg-slate-50 border border-slate-200 rounded-2xl p-6">

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Proveedor</label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input type="text" defaultValue={isNew ? '' : (pedido?.supplier_name || '')} placeholder="Sin proveedor asignado" className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Ref. Proveedor (Factura/Quote)</label>
                  <input type="text" defaultValue={isNew ? '' : (pedido?.supplier_ref || '')} placeholder="Sin referencia registrada" className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-800 focus:border-emerald-500 outline-none" />
                </div>

                <div className="col-span-4">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Direccion Proveedor / Origen</label>
                  <div className="flex items-center gap-3">
                    <input type="text" defaultValue="" placeholder="Sin direccion registrada en este pedido" className="flex-1 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:border-emerald-500 outline-none" />
                    <input type="text" defaultValue="" placeholder="Sin telefono registrado" className="w-48 bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-800 focus:border-emerald-500 outline-none" />
                  </div>
                </div>

                <div className="col-span-2">
                  <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Fecha de Compra</label>
                  <input type="date" defaultValue={isNew ? '' : fDateInput(pedido?.fecha_compra)} className="w-full bg-white border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-medium text-slate-700 focus:border-emerald-500 outline-none" />
                </div>

                <div className="col-span-2 relative">
                  <label className="block text-xs font-bold text-rose-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                    <Clock size={14} /> Fecha Estimada de Entrega (ETA)
                  </label>
                  <input type="date" defaultValue={isNew ? '' : fDateInput(pedido?.fecha_entrega_estimada)} className="w-full bg-rose-50 border border-rose-200 rounded-xl px-4 py-2.5 text-sm font-bold text-rose-700 focus:border-rose-500 outline-none" />
                  <span className="absolute right-3 top-[38px] text-[10px] font-bold bg-rose-100 text-rose-600 px-2 py-0.5 rounded">Activa Timers</span>
                </div>

              </div>
            </div>

            {/* Bloque Logistico (Rutas y Tracking) */}
            <div>
              <h2 className="text-xl font-black text-slate-800 mb-6 flex items-center gap-2">
                <Truck className="text-blue-600" size={24} /> Logistica y Tracking
              </h2>

              <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">

                <div className="grid grid-cols-3 gap-6 mb-8">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider flex items-center gap-1">
                      <MapPin size={14} /> Ubicacion de Entrega Final
                    </label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input type="text" defaultValue={isNew ? '' : (pedido?.warehouse_id ? `Bodega #${pedido.warehouse_id}` : '')} placeholder="Sin bodega asignada" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-blue-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">Carrier / Transportadora</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                      <input type="text" defaultValue={isNew ? '' : (pedido?.carrier || '')} placeholder="Sin transportadora registrada" className="w-full bg-slate-50 border border-slate-200 rounded-xl pl-9 pr-4 py-2.5 text-sm font-bold text-slate-800 focus:border-blue-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">N° Tracking (Guia)</label>
                    <div className="flex items-center gap-2">
                      <input type="text" defaultValue={isNew ? '' : (pedido?.tracking_number || '')} placeholder="Sin guia registrada" className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 text-sm font-black text-slate-800 focus:border-blue-500 outline-none uppercase" />
                      <button className="bg-slate-100 p-2.5 rounded-xl text-slate-500 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Rastrear en web del carrier">
                        <LinkIcon size={18} />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Tracker de Estados Logisticos */}
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-200">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-sm font-bold text-slate-700">Progreso de la Importacion/Ruta</span>
                    {!isNew && completedCount < STAGE_NODES.length && (
                      <Button size="sm" color="blue" icon={Truck} loading={advancing} onClick={avanzarTracking}>Avanzar Etapa Logistica</Button>
                    )}
                  </div>

                  <div className="flex justify-between relative max-w-3xl mx-auto mt-2">
                    <div className="absolute top-1/2 left-4 right-4 h-1 bg-slate-200 -translate-y-1/2 z-0" />

                    {/* Progress Fill */}
                    <div className={`absolute top-1/2 left-4 h-1 bg-blue-500 -translate-y-1/2 z-0 transition-all duration-700 ${
                      completedCount >= 3 ? 'right-4' :
                      completedCount === 2 ? 'right-[20%]' :
                      completedCount === 1 ? 'right-[50%]' :
                      'right-[80%]'
                    }`} />

                    {STAGE_NODES.map((node, i) => {
                      const done = stages[i]?.status === 'COMPLETADO';
                      const isLast = i === STAGE_NODES.length - 1;
                      return (
                        <div key={node.stage} className="relative z-10 flex flex-col items-center gap-2">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center font-bold transition-colors ${
                            done
                              ? (isLast ? 'bg-emerald-500 text-white shadow-md shadow-emerald-200' : 'bg-blue-600 text-white shadow-md shadow-blue-200')
                              : 'bg-white border-2 border-slate-300 text-slate-300'
                          }`}>
                            {done ? <CheckCircle2 size={12} /> : <Circle size={12} />}
                          </div>
                          <span className={`text-xs font-bold ${
                            done ? (isLast ? 'text-emerald-700' : 'text-blue-700') : 'text-slate-400'
                          }`}>{node.label}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

              </div>
            </div>

            {/* ARTÍCULOS */}
            <div>
              <h3 className="text-xl font-black text-slate-800 flex items-center gap-2 mb-6">
                <Box className="text-emerald-600" size={24} /> Productos Requeridos
              </h3>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-x-auto shadow-sm">
                <table className="w-full text-left whitespace-nowrap min-w-max">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Nombre / Atributos</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Destino</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Precio Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Estado Interno</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase text-right">Total Neto</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productos.map((p: any, i: number) => {
                      const qty = Number(p.qty ?? p.cantidad ?? 0);
                      const priceUnit = Number(p.unit_price_cop ?? p.precio_unitario ?? p.cost_cop ?? 0);
                      const destinoLabel = p.destino === 'MAU' ? 'Socio Mau' : p.destino === 'NEBULAE' ? 'Stock Nebulae' : p.destino === 'CLIENTE' ? 'Cliente' : '-';
                      return (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-800 text-sm">{p.product_name || p.producto_nombre || p.nombre || p.descripcion || 'Producto sin nombre'}</div>
                            {p.variante && <div className="text-slate-500 text-xs">{p.variante}</div>}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-600 font-medium">{destinoLabel}</td>
                          <td className="px-4 py-3 text-center font-bold text-slate-700">{qty}</td>
                          <td className="px-4 py-3 text-sm text-slate-700 text-right font-medium">{fCOP(priceUnit)}</td>
                          <td className="px-4 py-3">
                            <Badge tone="warning">{estadoLabel}</Badge>
                          </td>
                          <td className="px-4 py-3 font-black text-slate-800 text-right">{fCOP(qty * priceUnit)}</td>
                        </tr>
                      );
                    })}
                    {productos.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-6 text-center text-sm text-slate-400 italic">Sin productos registrados en este pedido.</td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot className="bg-slate-50 border-t border-slate-200">
                    <tr>
                      <td colSpan={5} className="px-4 py-4 text-right font-bold text-slate-500 uppercase text-xs">Gran Total del Pedido</td>
                      <td className="px-4 py-4 text-right font-black text-emerald-600 text-xl">{fCOP(pedido?.total_cop)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-emerald-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitacora (Historial) */}
        <div style={{ width: rightWidth }} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-slate-800 flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-white flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades del Pedido
            </h3>
          </div>

          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <MessageSquare size={16} /> Nota
              </button>
            </div>
            <div className="relative">
              <textarea
                rows={3}
                placeholder="Registra una incidencia de transporte o aduana..."
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 outline-none resize-none transition-colors shadow-sm"
              />
              <button className="absolute bottom-3 right-3 bg-slate-800 hover:bg-slate-900 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-slate-50">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {actividades.map((item: any, idx: number) => {
                const style = ACTIVITY_STYLE[item.action] || DEFAULT_ACTIVITY_STYLE;
                const Icon = style.icon;
                return (
                  <div key={item.id ?? idx} className="relative flex items-start gap-4 group animate-in fade-in slide-in-from-bottom-2">
                    <div className={`flex items-center justify-center w-8 h-8 rounded-full border-2 border-white bg-white shadow-sm shrink-0 z-10 ${style.color}`}>
                      <Icon size={14} />
                    </div>

                    <div className="flex-1 bg-white p-4 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-800 text-sm">{item.description || item.action}</span>
                      </div>
                      {item.old_estado && item.new_estado && (
                        <p className="text-sm text-slate-600 mb-3 leading-relaxed">{item.old_estado} → {item.new_estado}</p>
                      )}
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center text-[8px] font-bold text-slate-600 border border-slate-300">
                            {(item.user_name || 'S').split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()}
                          </div>
                          <span className="text-xs font-medium text-slate-500">{item.user_name || 'Sistema'}</span>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">{fDateLong(item.created_at)} {fTime(item.created_at)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {actividades.length === 0 && (
                <p className="text-xs text-slate-400 italic text-center py-8">Sin actividad registrada todavia.</p>
              )}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
