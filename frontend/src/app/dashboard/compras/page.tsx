'use client';
import React, { useState, useEffect, useCallback, useContext, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ShoppingBag, Package, CheckCircle2, Clock, Search, MoreHorizontal, RefreshCw, X, Trash2, Edit2, ExternalLink, Plus, Eye,
  ShoppingCart,
} from 'lucide-react';
// B4 T14: el Hub de Compras 100 % sobre el servidor (R5, C3, C4): la tabla y el tablero estándar con el estado único de
// la pantalla, las tarjetas, la franja del flujo y la pestaña Análisis estándar. El panel del PEC conserva lo de B1 a B3.
import {
  SubNav, PageHeader, useAvisos, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila, ModalMotivo,
  TableroKanban, useTableroKanban, CLASE_CHIP,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, ClaveFila, ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, PasosFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import { PanelAnalisisPerezoso } from '@/components/analisis';
import { COMP_NAV } from './comp-nav';

import { apiFetch as _apiFetch } from '@/lib/api';
import type { OpcionesApiFetch } from '@/lib/api';
import { TABLE } from '@/lib/design-system';
import { formatoPesos } from '@/lib/pesos';
import { fechaCorta } from '@/lib/fechas-colombia';
import { accionModo, campoOrden, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta } from '@/lib/tabla';
import { PERIODO_KPI, tarjetasHubCompras } from '@/lib/kpis';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
// Dos piezas genéricas que nacieron en las libs de Ventas (T7 y T10): el chip del orden y la vista desde Kanban.
import { ordenEsAtencion, textoOrdenHub } from '@/lib/hub-ventas';
import { accionVistaEnLista } from '@/lib/listas-ventas';
import {
  COLUMNAS_PEC, EFECTOS_CANCELAR_PEC, OPCIONES_ESTADOS_TABLERO_PEC, consultaColumnaPec, diaPec, grupoMesPec, infoEstadoPec,
  opcionesEstadosPec, ordenPorFechaDeCompra, reglaSoltarPec, repartirCancelacionPec, resumenCancelacionPec, tarjetaPec,
  cancelarPecsEnSerie, despuesDeCancelarPec,
  tituloMesPec, transicionesPec,
} from '@/lib/estados-compras';
import {
  RUTA_HUB_COMPRAS, accionPasoHubCompras, accionSemaforoCompras, avisosFlujoCompras, etiquetaEtapaTracking,
  filtroSemaforoCompras, leerEnlaceHubCompras, pasosDeTracking, pasosHubCompras, textoReglaCompras,
} from '@/lib/flujo-compras';

// La lectura de siempre del panel (B1 a B3): el `data` de la respuesta. Los errores ya llegan legibles de lib/api
// (status y detail del servidor), así que se muestran tal cual.
async function apiFetch(path: string, opts: OpcionesApiFetch = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

// H42: pesos enteros con punto de miles; lo que no es un monto positivo se ve '—', como el '-' de antes.
const fCOP = (v: unknown) => (Number(v) > 0 ? formatoPesos(v) : '—');
// B4 T14 (resolución 4): un instante del API (fecha de compra, creado, Actividad, etapas) en el día de Colombia; un día de
// negocio (entrega estimada, límite de alerta) tal como se guarda (diaPec, RP40), sin correrlo. Lo vacío, '—'.
const textoInstante = (v: unknown) => fechaCorta(v) || '—';
const textoDia = (v: unknown) => fechaCorta(diaPec(v)) || '—';

/** Quien hace el cambio (updated_by: la Actividad del PEC dice su nombre). Sin sesión, el servidor usa el correo. */
const autorActual = () => {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem('user_name') || localStorage.getItem('user_email') || undefined;
};

/** Una etapa del envío (tracking_stages del PEC, con el `alert` que calcula el servidor). */
type EtapaTrackingPec = { stage?: string; label?: string; status?: string; timestamp?: string | null; eta?: string | null };
type ActividadPec = {
  created_at?: string | null; user_name?: string | null; description?: string | null; action?: string | null;
  old_estado?: string | null; new_estado?: string | null;
};
type ProductoPec = {
  producto_nombre?: string | null; descripcion?: string | null; nombre?: string | null; qty?: number | null;
  cantidad?: number | null; unit_price_cop?: number | null; precio_unitario?: number | null;
};
/**
 * Una fila de GET /compras/pedidos (el _pec_dict de T12) o el detalle de GET /compras/pedidos/{id}. is_overdue es la
 * regla del servidor (RP40: emitido o en tránsito con la entrega pasada): la pantalla no la recalcula.
 */
type FilaPec = {
  id: number;
  numero: string;
  estado: string;
  supplier_name?: string | null;
  supplier_ref?: string | null;
  ven_numero?: string | null;
  created_by?: string | null;
  total_cop?: number | null;
  subtotal_cop?: number | null;
  fecha_compra?: string | null;
  created_at?: string | null;
  fecha_entrega_estimada?: string | null;
  fecha_alerta?: string | null;
  is_overdue?: boolean;
  modalidad_pago?: string | null;
  carrier?: string | null;
  tracking_number?: string | null;
  notas?: string | null;
  tracking_stages?: EtapaTrackingPec[] | null;
  actividades?: ActividadPec[] | null;
  productos?: ProductoPec[] | null;
};
/** Un pedido de venta del panel de consolidación (GET /ventas/pedidos, como en B1 a B3). */
type FilaVenta = {
  id: number; numero: string; estado?: string | null; customer_name?: string | null; created_at?: string | null;
  total_cop?: number | null; total?: number | null; productos?: ProductoPec[] | null;
};

/* ============================================================
   PEC DETAIL PANEL
   ============================================================ */
type PropsPanelPec = {
  pec: FilaPec | null;
  pedidosVenta: FilaVenta[];
  onClose: () => void;
  onUpdate: () => void;
  onToast: (msg: unknown, tipo?: 'ok' | 'error') => void;
  /** B4 T14 (R9, C15c): cancelar abre el ModalMotivo de la página (el mismo del menú de fila, del tablero y de la masiva). */
  onCancelar: (pec: FilaPec) => void;
  /** B4 T14 r1 (m9): el error de GET /ventas/pedidos (la lista de consolidación), y volver a pedirla. */
  errorVentas: unknown;
  onReintentarVentas: () => void;
  /** B4 T14 r1 (m10): sube cuando la página pide releer el detalle (cancelar falló y el servidor pide recargar). */
  vueltaDetalle: number;
};

function PecDetailPanel({
  pec, pedidosVenta, onClose, onUpdate, onToast, onCancelar, errorVentas, onReintentarVentas, vueltaDetalle,
}: PropsPanelPec) {
  const [detail, setDetail] = useState<FilaPec | null>(pec);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [tab, setTab] = useState('info');
  const [selectedPvens, setSelectedPvens] = useState<Set<number>>(new Set());
  const [searchPven, setSearchPven] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editEstado, setEditEstado] = useState(false);

  useEffect(() => { setDetail(pec); setTab('info'); setSelectedPvens(new Set()); }, [pec && pec.id]);

  const loadFull = async () => {
    if (!pec) return;
    setLoadingDetail(true);
    try { const d = await apiFetch('/compras/pedidos/' + pec.id); setDetail(d); }
    catch (e) { onToast(e, 'error'); }
    finally { setLoadingDetail(false); }
  };
  // B4 T14 r1 (m10): también cuando la página lo pide (vueltaDetalle), para que el panel no quede con el estado viejo.
  useEffect(() => { if (pec) loadFull(); }, [pec && pec.id, vueltaDetalle]);

  // B4 T14 (KANBAN-compras punto 7; R9, C15c): el botón Estado solo ofrece lo que acepta update_pec (transicionesPec):
  // emitir un borrador (PATCH) o cancelar, que abre el ModalMotivo de la página con su motivo. En tránsito y Recibido
  // los ponen el seguimiento y la recepción. Si el servidor dice que no, se ve su mensaje.
  const transiciones = transicionesPec(detail?.estado);
  const handleChangeEstado = async (est: string) => {
    setEditEstado(false);
    if (!pec) return;
    if (est === 'CANCELADO') { onCancelar(detail ?? pec); return; }
    try {
      await apiFetch('/compras/pedidos/' + pec.id, { method: 'PATCH', body: JSON.stringify({ estado: est, updated_by: autorActual() }) });
      onToast('Estado actualizado'); onUpdate(); loadFull();
    } catch(e) {
      onToast(e, 'error');
      if (recargarTrasError(e)) { onUpdate(); loadFull(); }
    }
  };

  // B4 T14 (RP30): sin confirm(): el motivo (5 letras o más) y lo que pasa al cancelar van en el ModalMotivo.
  const handleDelete = () => {
    setMenuOpen(false);
    if (pec) onCancelar(detail ?? pec);
  };

  const handleConvertPvens = async () => {
    if (!selectedPvens.size) { onToast('Selecciona al menos un PVEN', 'error'); return; }
    const selected = pedidosVenta.filter(p => selectedPvens.has(p.id));
    const productos = selected.flatMap(p => (p.productos||[]).map(pr => ({ ...pr, pven_origen: p.numero })));
    try {
      const user = localStorage.getItem('user_name') || '';
      const newPec = await apiFetch('/compras/pedidos', { method: 'POST', body: JSON.stringify({
        ven_id: selected[0] && selected[0].id,
        ven_numero: selected.map(p => p.numero).join(', '),
        productos,
        notas: 'Consolidado de PVEN: ' + selected.map(p=>p.numero).join(', '),
        created_by: user,
      })});
      onToast('PEC ' + newPec.numero + ' creado con ' + selected.length + ' PVEN(s) consolidados');
      onUpdate();
    } catch(e) { onToast(e, 'error'); }
  };

  if (!pec) return null;
  // C10: la etiqueta y el color de estados-compras.js (RECIBIDA y PARCIALMENTE_RECIBIDA ya no salen como «Borrador»).
  const est = infoEstadoPec(detail?.estado).clases;
  const etiquetaEstado = infoEstadoPec(detail?.estado).label;
  const vencido = detail?.is_overdue ?? pec.is_overdue;
  const filteredPvens = pedidosVenta.filter(p =>
    p.estado === 'PENDIENTE_COMPRA' &&
    JSON.stringify(p).toLowerCase().includes(searchPven.toLowerCase())
  );

  return (
    <>
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left:'240px'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-5 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white shrink-0">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black text-gray-900">{(detail && detail.numero) || pec.numero}</h2>
              <span className={'px-3 py-1 rounded-full text-xs font-black border ' + est.bg + ' ' + est.text + ' ' + est.border}>{etiquetaEstado}</span>
              {vencido && <span className="px-2.5 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-black border border-red-200">Vencido</span>}
            </div>
            <p className="text-sm text-gray-500 mt-0.5">{(detail && detail.supplier_name) || '-'}{pec.ven_numero && ' · VEN: ' + pec.ven_numero}</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <button onClick={()=>setMenuOpen(m=>!m)} aria-label={`Acciones de ${(detail && detail.numero) || pec.numero}`} aria-expanded={menuOpen} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><MoreHorizontal size={20}/></button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-10">
                  {/* B4 T14 (R9): «Cambiar Estado» y «Cancelar PEC» solo si el servidor los acepta (transicionesPec). */}
                  {transiciones.length > 0 && (
                    <button onClick={()=>{setEditEstado(true);setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm font-medium flex items-center gap-2"><Edit2 size={13} className="text-purple-600"/> Cambiar Estado</button>
                  )}
                  <Link href={`/dashboard/compras/pedidos?id=${pec.id}`} className="block w-full text-left px-4 py-2.5 hover:bg-blue-50 text-sm font-medium text-blue-600" onClick={()=>setMenuOpen(false)}>Ver en Pedidos</Link>
                  {transiciones.includes('CANCELADO') && (
                    <>
                      <div className="border-t border-gray-100 my-1"/>
                      <button onClick={handleDelete} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm font-medium flex items-center gap-2 text-red-600"><Trash2 size={13}/> Cancelar PEC</button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} aria-label="Cerrar el panel" className="p-2 hover:bg-gray-200 rounded-xl text-gray-500"><X size={20}/></button>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex items-center gap-1 px-8 py-2 border-b border-gray-100 bg-white shrink-0">
          {[{k:'info',l:'Info PEC'},{k:'pvens',l:'Pedidos de Venta'},{k:'productos',l:'Productos'}].map(function(t){ return (
            <button key={t.k} onClick={()=>setTab(t.k)} className={'px-4 py-2 rounded-lg text-sm font-bold transition-all ' + (tab===t.k?'bg-purple-600 text-white shadow':'text-gray-600 hover:bg-purple-50 hover:text-purple-700')}>{t.l}</button>
          ); })}
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT 45% */}
          <div className="w-[45%] border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto space-y-4">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Proveedor</p>
              <p className="font-bold text-lg text-gray-900">{(detail && detail.supplier_name) || '-'}</p>
              {detail && detail.supplier_ref && <p className="text-xs text-gray-400 mt-0.5">Ref: {detail.supplier_ref}</p>}
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Fechas</p>
              <div className="space-y-2 text-sm">
                {[['Fecha Compra', textoInstante(detail && (detail.fecha_compra || detail.created_at))],
                  ['Entrega Estimada', textoDia(detail && detail.fecha_entrega_estimada)],
                  ['Fecha Alerta', textoDia(detail && detail.fecha_alerta)]].map(function(row,i){return(
                  <div key={i} className="flex justify-between"><span className="text-gray-500">{row[0]}</span><span className="font-bold">{row[1]}</span></div>
                );})}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Montos</p>
              <div className="flex justify-between py-1 border-b"><span className="text-gray-500 text-sm">Subtotal</span><span className="font-black">{fCOP(detail && detail.subtotal_cop)}</span></div>
              <div className="flex justify-between py-1"><span className="text-gray-500 text-sm">Total COP</span><span className="font-black text-gray-900">{fCOP(detail && detail.total_cop)}</span></div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Pago y logística</p>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                {[['Modalidad',(detail&&detail.modalidad_pago)||'-'],['Carrier',(detail&&detail.carrier)||'-'],['Tracking',(detail&&detail.tracking_number)||'-']].map(function(r,i){return(
                  <div key={i}><span className="block text-gray-400 font-black uppercase mb-0.5">{r[0]}</span>{r[1]}</div>
                );})}
              </div>
            </div>
            {detail && detail.notas && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-black text-amber-700 uppercase mb-1">Notas</p>
                <p className="text-sm text-amber-900">{detail.notas}</p>
              </div>
            )}
          </div>

          {/* RIGHT 55% */}
          <div className="w-[55%] p-6 overflow-y-auto flex flex-col gap-4">
            {editEstado && (
              <div className="bg-purple-50 border-2 border-purple-200 rounded-2xl p-5">
                <p className="text-sm font-black text-purple-800 mb-3">Cambiar Estado del PEC</p>
                <div className="flex flex-wrap gap-2">
                  {transiciones.map(function(k){ return (
                    <button key={k} onClick={()=>handleChangeEstado(k)}
                      className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors bg-white border-gray-200 text-gray-600 hover:bg-gray-50">
                      {infoEstadoPec(k).label}
                    </button>
                  ); })}
                </div>
                <p className="text-xs text-gray-500 mt-3">En tránsito lo marca el seguimiento del envío y Recibido, la recepción en bodega.</p>
                <button onClick={()=>setEditEstado(false)} className="text-xs text-gray-400 mt-3 hover:text-gray-600">Cancelar</button>
              </div>
            )}

            {tab==='info' && (
              <>
                {(detail && detail.tracking_stages && detail.tracking_stages.length > 0) && (
                  <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Tracking</p>
                    {/* B4 T14 (FLUJO-compras punto 5; RP28): las etapas reales del envío (3 si es directo, 4 por casillero) en una
                        barra, con la en curso resaltada; el aviso va en rojo solo si la etapa va atrasada. */}
                    <div className="mb-4">
                      <PasosFlujo variante="barra" pasos={pasosDeTracking(detail.tracking_stages)} etiqueta={`Etapas del envío de ${detail.numero || pec.numero}`} />
                    </div>
                    <div className="space-y-3">
                      {detail.tracking_stages.map(function(stage,i){ return (
                        <div key={i} className={'flex items-center gap-3 p-3 rounded-xl border ' + (stage.status==='COMPLETADO'?'bg-emerald-50 border-emerald-200':stage.status==='EN_PROCESO'?'bg-blue-50 border-blue-200':'bg-gray-50 border-gray-200')}>
                          <div className={'w-7 h-7 rounded-full flex items-center justify-center shrink-0 ' + (stage.status==='COMPLETADO'?'bg-emerald-500':stage.status==='EN_PROCESO'?'bg-blue-500':'bg-gray-300')}>
                            {stage.status==='COMPLETADO'?<CheckCircle2 size={14} className="text-white"/>:<Clock size={14} className="text-white"/>}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-bold text-gray-900">{stage.label}</p>
                            {stage.timestamp && <p className="text-xs text-gray-500">{textoInstante(stage.timestamp)}</p>}
                          </div>
                          <span className={'text-xs font-bold px-2 py-0.5 rounded-full ' + (stage.status==='COMPLETADO'?'bg-emerald-100 text-emerald-700':stage.status==='EN_PROCESO'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-500')}>{etiquetaEtapaTracking(stage.status)}</span>
                        </div>
                      ); })}
                    </div>
                  </div>
                )}
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <p className="text-xs font-black text-gray-400 uppercase mb-4">Historial de Actividad</p>
                  <div className="relative border-l-2 border-gray-100 ml-4 pl-6 pb-2">
                    {loadingDetail && <p className="text-gray-400 text-sm py-4">Cargando...</p>}
                    {(detail?.actividades||[]).map(function(a,i){ return (
                      <div key={i} className="mb-4 relative">
                        <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-purple-200"/>
                        <p className="text-xs text-gray-400 mb-0.5">{textoInstante(a.created_at)}{a.user_name && ' · ' + a.user_name}</p>
                        <p className="font-bold text-gray-700 text-sm">{a.description||a.action}</p>
                        {a.old_estado && a.new_estado && <p className="text-xs text-gray-400">{infoEstadoPec(a.old_estado).label} → {infoEstadoPec(a.new_estado).label}</p>}
                      </div>
                    ); })}
                    {!(detail&&detail.actividades&&detail.actividades.length) && !loadingDetail && <p className="text-gray-400 text-xs py-4 text-center">Sin historial</p>}
                  </div>
                </div>
              </>
            )}

            {tab==='pvens' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100">
                  <p className="text-sm font-black text-gray-800 mb-1">Consolidar Pedidos de Venta</p>
                  <p className="text-xs text-gray-500 mb-3">Selecciona 1 o varios PVEN en estado Pendiente Compra para convertirlos en una orden de compra</p>
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 gap-2">
                    <Search size={14} className="text-gray-400"/>
                    <input value={searchPven} onChange={e=>setSearchPven(e.target.value)} placeholder="Buscar PVEN..." className="text-sm bg-transparent outline-none flex-1"/>
                  </div>
                </div>
                <div className="max-h-[320px] overflow-y-auto divide-y divide-gray-100">
                  {/* B4 T14 r1 (m9): si GET /ventas/pedidos falló, se dice (no «No hay PVEN…») y se puede reintentar. */}
                  {errorVentas ? (
                    <div className="py-8 text-center space-y-3">
                      <p role="alert" className="text-sm font-bold text-rose-700">No se pudieron cargar los pedidos de venta.</p>
                      <button type="button" onClick={onReintentarVentas}
                        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700">
                        <RefreshCw size={13} aria-hidden="true"/> Reintentar
                      </button>
                    </div>
                  ) : filteredPvens.length === 0 && (
                    <div className="py-10 text-center"><Package size={28} className="mx-auto mb-2 text-gray-300"/><p className="text-gray-400 text-sm">No hay PVEN en estado Pendiente Compra</p></div>
                  )}
                  {filteredPvens.map(function(p){ return (
                    <label key={p.id} className={'flex items-start gap-3 px-5 py-3 cursor-pointer hover:bg-purple-50 transition-colors ' + (selectedPvens.has(p.id)?'bg-purple-50/80':'')}>
                      <input type="checkbox" checked={selectedPvens.has(p.id)}
                        onChange={function(e){ const n=new Set(selectedPvens);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedPvens(n); }}
                        className="mt-1 rounded border-gray-300 text-purple-600"/>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-gray-900 text-sm">{p.numero}</span>
                          <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">PEND. COMPRA</span>
                        </div>
                        <p className="text-xs text-gray-500">{p.customer_name||'-'} · {textoInstante(p.created_at)}</p>
                        <p className="text-xs font-bold text-indigo-700 mt-0.5">{fCOP(p.total_cop||p.total||0)} · {(p.productos||[]).length} producto(s)</p>
                        {(p.productos||[]).slice(0,3).map(function(pr,i){ return <p key={i} className="text-[10px] text-gray-400">· {pr.descripcion||pr.producto_nombre||'Producto'}</p>; })}
                      </div>
                    </label>
                  ); })}
                </div>
                {selectedPvens.size > 0 && (
                  <div className="p-4 border-t border-gray-100 bg-purple-50 flex items-center justify-between">
                    <span className="text-sm font-bold text-purple-800">{selectedPvens.size} PVEN seleccionado(s)</span>
                    <button onClick={handleConvertPvens} className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-xl text-sm font-bold shadow-sm flex items-center gap-2">
                      <ShoppingCart size={14}/> Crear PEC Consolidado
                    </button>
                  </div>
                )}
              </div>
            )}

            {tab==='productos' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-gray-100"><p className="text-xs font-black text-gray-400 uppercase">Productos del PEC</p></div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100 text-xs text-gray-400 font-black uppercase">
                    <tr><th className="px-5 py-3 text-left">Producto</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detail?.productos||[]).map(function(p,i){ return (
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-5 py-3 font-medium text-gray-900 max-w-[180px] truncate">{p.producto_nombre||p.descripcion||p.nombre||'-'}</td>
                        <td className="px-4 py-3 text-center font-bold">{p.qty||p.cantidad||0}</td>
                        <td className="px-4 py-3 text-right text-gray-600">{fCOP(p.unit_price_cop||p.precio_unitario||0)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fCOP((p.qty||p.cantidad||0)*(p.unit_price_cop||p.precio_unitario||0))}</td>
                      </tr>
                    ); })}
                    {!(detail&&detail.productos&&detail.productos.length) && <tr><td colSpan={4} className="text-center py-8 text-gray-400 text-xs">Sin productos registrados</td></tr>}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ============================================================
   B4 T14 — las piezas del Hub (la tabla estándar, sus celdas y el asistente)
   ============================================================ */

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_HUB = 'compras.hub';
/** R8 (atencion_primero_listas): lo vencido primero (el más atrasado arriba), luego la entrega más cercana. */
const INICIAL_HUB = { vista: 'todos', orden: 'atencion' };
/** D39 (m6 de T8): en Kanban la lista va sin filas (limit=0); los conteos siguen al día y las filas las piden las columnas. */
const EXTRA_TABLERO = { limit: 0 };
/** El contenedor de los Hubs y de las listas del bloque (T7 a T10): pb-24 deja libre la esquina del botón de la IA. */
const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';

/** `conteos` de GET /compras/pedidos con con_conteos=1 (T12): cada vista y los vencidos, con la búsqueda (R5). */
type ConteosPec = Partial<Record<'todos' | 'no_resueltos' | 'pedidos' | 'en_transito' | 'en_bodega' | 'acciones_tomadas'
  | 'recibidos' | 'cancelados' | 'vencidos', number>>;
/** D39: las columnas del tablero de una acción desde una tarjeta: [origen, destino]. */
type ColumnasDeTarjeta = readonly [string, string];
/** La cancelación con motivo en curso (panel, menú de fila, tablero o masiva; R9, C15c). */
type Cancelacion = {
  pecs: FilaPec[];
  omitidos: { id: unknown; numero: string; motivo: string }[];
  columnas: ColumnasDeTarjeta | null;
  desdePanel: boolean;
};

// Los chips: el chip estándar de las tablas del bloque con los tintes del tablero (CLASE_CHIP): la misma marca en Lista y
// en Kanban. Sin tamaño de letra: cada uso pone el suyo.
const CHIP = 'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 font-bold leading-tight';
const FOCO_VISIBLE = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-purple-700';
/** T14 r1 (m11): el foco de los botones de la barra masiva (fondo slate-900). */
const FOCO_OSCURO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white';
// D41: la fila vencida en el tono opaco filaAlerta, con la marca rosa a la izquierda del Hub de Ventas (la de antes era un
// borde rojo y un tinte translúcido, que dejaba ver lo de debajo de las columnas fijas).
const MARCA_VENCIDO = '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-rose-500)]';
const claseDeFila = (p: FilaPec) => (p.is_overdue ? `${TABLE.filaAlerta} ${MARCA_VENCIDO}` : null);

/** RP69: el asistente de hoy del Hub de Compras, con su título y sus ejemplos (sin códigos crudos ni emojis). */
const ASISTENTE_COMPRAS = {
  titulo: 'Nebulae AI · Analista de Compras & Suministros',
  ejemplos: [
    '¿Cuál es el diagnóstico de cumplimiento y tiempos de entrega?',
    '¿Qué proveedores concentran el mayor volumen o demoras?',
    '¿Cuánta mercancía y capital se encuentra navegando en tránsito?',
    '¿Qué recomendaciones hay para prevenir cuellos de botella en suministros?',
  ],
};

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaHub = { abrir: (p: FilaPec) => void; ir: (ruta: string) => void; cancelar: (filas: FilaPec[]) => void };
const AccionesFila = React.createContext<AccionesFilaHub | null>(null);

/** PEC / PVEN: el número, el pedido de venta de origen y el chip «Vencido» (is_overdue del servidor, RP40). */
function CeldaNumero({ p }: { p: FilaPec }) {
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5 leading-tight">
      <span className="max-w-full truncate text-xs font-black text-purple-700">{p.numero}</span>
      {p.ven_numero && <span className="max-w-full truncate text-[10px] font-bold text-indigo-600">{p.ven_numero}</span>}
      {p.is_overdue && <span className={`${CHIP} text-[10px] ${CLASE_CHIP.rose}`}>Vencido</span>}
    </span>
  );
}

/** Estado: la insignia de estados-compras.js (un heredado sale humanizado, nunca «Borrador»; C10). */
function CeldaEstado({ p }: { p: FilaPec }) {
  const { label, clases } = infoEstadoPec(p.estado);
  return <span className={`${CHIP} text-[11px] ${clases.bg} ${clases.text} ${clases.border}`}>{label}</span>;
}

/** Entrega est.: el día de negocio tal como se guarda (RP40), en rojo si el servidor dice que está vencido. */
function CeldaEntrega({ p }: { p: FilaPec }) {
  return <span className={`text-xs ${p.is_overdue ? 'font-bold text-rose-700' : 'text-slate-700'}`}>{textoDia(p.fecha_entrega_estimada)}</span>;
}

/**
 * Acciones (R11): el ojo abre el panel del PEC y el menú ⋯ (MenuFila: clic y portal) trae «Ver detalle», «Ver en Pedidos
 * de compra» y «Cancelar PEC», este solo si update_pec lo acepta (transicionesPec; R9). Cancelar abre el ModalMotivo.
 */
function CeldaAcciones({ p }: { p: FilaPec }) {
  const acciones = useContext(AccionesFila);
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(p) },
    { etiqueta: 'Ver en Pedidos de compra', icono: ExternalLink, onClick: () => acciones?.ir(`/dashboard/compras/pedidos?id=${p.id}`) },
    { etiqueta: 'Cancelar PEC', icono: Trash2, peligro: true, onClick: () => acciones?.cancelar([p]),
      oculto: !transicionesPec(p.estado).includes('CANCELADO') },
  ];
  return (
    <span className="flex items-center justify-end gap-0.5">
      <button type="button" onClick={() => acciones?.abrir(p)} aria-label={`Ver el detalle de ${p.numero}`} title="Ver detalle"
        className={`rounded-lg p-1.5 text-purple-600 transition-colors hover:bg-purple-50 ${FOCO_VISIBLE}`}>
        <Eye size={14} aria-hidden="true" />
      </button>
      <MenuFila items={items} etiqueta={`Acciones de ${p.numero}`} />
    </span>
  );
}

/**
 * B4 T14, la tabla (TABLA-compras punto 6; R26, D41): la casilla (la de TablaEstandar), PEC / PVEN (clave, fija a la
 * izquierda, con el chip Vencido), Proveedor (la flexible), Comprador, Monto, F. compra, Entrega est., Límite alerta,
 * Estado (clave) y Acciones (fija a la derecha). Se fue la columna Total, que repetía el Monto. Comprador, F. compra y
 * Límite alerta van ocultas por defecto (R26; se muestran con «Ajustar tabla»). Una constante (estable, D40).
 * R26: a 1024 px con el menú abierto la caja de la tabla deja 704 px (medido en T7 a T10). Con los anchos del diseño
 * (Proveedor 160, Monto 112, Estado 128 y Acciones 72) las visibles sumaban 748: Proveedor baja a su piso de R26 (120),
 * Monto a 108 (el Total de T10: cabe hasta $99.999.999), Estado a 120 (como T8 a T10) y Acciones sube a 80, porque el ojo
 * (26 px) y el ⋯ (28 px) no caben en los 48 px que dejan 72 con el relleno de la celda. 40 + 132 + 120 + 108 + 104 + 120
 * + 80 = 704.
 */
const COLUMNAS_TABLA_HUB: ColumnaTabla<FilaPec>[] = [
  { id: 'numero', titulo: 'PEC / PVEN', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero',
    titleCelda: (p) => [p.numero, p.ven_numero, p.is_overdue ? 'Vencido' : null].filter(Boolean).join(' · '),
    celda: (p) => <CeldaNumero p={p} /> },
  { id: 'proveedor', titulo: 'Proveedor', ancho: 120, flexible: true, ordenable: 'proveedor',
    titleCelda: (p) => p.supplier_name || 'Sin proveedor',
    celda: (p) => <span className="block truncate text-xs font-bold text-slate-800">{p.supplier_name || '—'}</span> },
  { id: 'comprador', titulo: 'Comprador', ancho: 120, ocultaPorDefecto: true, ordenable: 'comprador',
    titleCelda: (p) => p.created_by || 'Sin comprador',
    celda: (p) => <span className="block truncate text-xs text-slate-600">{p.created_by || '—'}</span> },
  { id: 'monto', titulo: 'Monto', ancho: 108, alinear: 'derecha', ordenable: 'monto', titleCelda: (p) => fCOP(p.total_cop),
    celda: (p) => <span className="block truncate text-xs font-black text-slate-900">{fCOP(p.total_cop)}</span> },
  // T14 r1 (m13): sin fecha de compra, la celda muestra la de creación (como antes) y su title lo dice; el separador por
  // mes la pone en «Sin fecha de compra» (el servidor ordena por fecha_compra).
  { id: 'compra', titulo: 'F. compra', ancho: 96, ocultaPorDefecto: true, ordenable: 'compra',
    titleCelda: (p) => (p.fecha_compra ? textoInstante(p.fecha_compra)
      : p.created_at ? 'Fecha de creación (sin fecha de compra)' : 'Sin fecha de compra'),
    celda: (p) => <span className="text-xs text-slate-600">{textoInstante(p.fecha_compra || p.created_at)}</span> },
  { id: 'entrega', titulo: 'Entrega est.', ancho: 104, ordenable: 'entrega',
    titleCelda: (p) => `${textoDia(p.fecha_entrega_estimada)}${p.is_overdue ? ' · Vencido' : ''}`, celda: (p) => <CeldaEntrega p={p} /> },
  { id: 'limite', titulo: 'Límite alerta', ancho: 104, ocultaPorDefecto: true, ordenable: 'limite',
    titleCelda: (p) => textoDia(p.fecha_alerta),
    celda: (p) => <span className="text-xs text-slate-600">{textoDia(p.fecha_alerta)}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 120, clave: true, ordenable: 'estado', titleCelda: (p) => infoEstadoPec(p.estado).label,
    celda: (p) => <CeldaEstado p={p} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: (p) => <CeldaAcciones p={p} /> },
];
/** {campo de orden: título}, para el chip «Orden: Monto ↓» (textoOrdenHub), solo de las columnas que se ordenan. */
const TITULOS_ORDEN_HUB: Record<string, string> = Object.fromEntries(
  COLUMNAS_TABLA_HUB.flatMap((c) => { const campo = campoOrden(c); return campo ? [[campo, c.titulo]] : []; }),
);

/**
 * Las pestañas del Hub (R9: las vistas de VISTAS_PEC, sin emojis): Recepciones es en_bodega, «No resueltos» los activos
 * (en rojo si hay vencidos) y «Acciones tomadas» lo recibido más lo cancelado. Los conteos son del servidor (con la
 * búsqueda; null mientras cargan: la barra gris, nunca 0). Análisis va aparte (pestanaAparte).
 */
function pestanasDelHub(conteos: ConteosPec | null): PestanaTabla[] {
  return [
    { id: 'todos', etiqueta: 'Todos', conteo: conteos?.todos ?? null },
    { id: 'no_resueltos', etiqueta: 'No resueltos', conteo: conteos?.no_resueltos ?? null, alerta: (conteos?.vencidos ?? 0) > 0 },
    { id: 'pedidos', etiqueta: 'Pedidos de compra', conteo: conteos?.pedidos ?? null },
    { id: 'en_transito', etiqueta: 'En tránsito', conteo: conteos?.en_transito ?? null },
    { id: 'en_bodega', etiqueta: 'Recepciones', conteo: conteos?.en_bodega ?? null },
    { id: 'acciones_tomadas', etiqueta: 'Acciones tomadas', conteo: conteos?.acciones_tomadas ?? null },
  ];
}

/* ============================================================
   MAIN COMPONENT — ComprasHub
   ============================================================ */
export default function ComprasHub() {
  const router = useRouter();
  // H49 (B2): avisos y confirmaciones del sistema (nunca alert, confirm ni prompt). showToast es el adaptador del panel:
  // los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ' repetido).
  const { avisar } = useAvisos();
  const showToast = useCallback((msg: unknown, tipo?: 'ok' | 'error') => {
    if (tipo === 'error') avisar(textoDeError(msg), { tono: 'error' });
    else avisar(String(msg), { tono: 'ok' });
  }, [avisar]);

  // ── B4 T14, bloque 1: la carga del servidor (TABLA-compras punto 6; R5, R8, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, el semáforo, las cajas de la franja,
  // las tarjetas, la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en vista:compras.hub. Ya no
  // hay arreglos en memoria (antes, los 200 más recientes filtrados y contados en el navegador).
  const [estado, despachar, listo] = useEstadoTabla(ID_HUB, INICIAL_HUB);
  const enKanban = estado.modo === 'kanban';
  // R13: ?tab=analisis («Ver análisis» de las listas de Compras) abre la pestaña Análisis; se lee de window.location al
  // montar (AuthGuard pinta el dashboard solo en el navegador, como el Hub de Ventas). Análisis es un estado de la
  // página, nunca una vista de la tabla (RP35).
  const [enAnalisis, setEnAnalisis] = useState(() => leerEnlaceHubCompras(typeof window === 'undefined' ? '' : window.location.search).analisis);

  // La tabla (T12): GET /compras/pedidos con vista, estados, semáforo, q, orden, limit y offset del estado, más los conteos
  // de las pestañas en la MISMA llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Análisis no pide nada
  // (activo: false, RP35). En Kanban, sin filas (EXTRA_TABLERO). Sin orden (el tercer clic en un título), 'atencion':
  // lo vencido primero sigue siendo el orden por defecto (R8), no el created_at del servidor.
  const extraDeLaLista = useMemo(() => ({ orden: estado.orden || 'atencion' }), [estado.orden]);
  const listado = useListado<FilaPec>({
    ruta: '/compras/pedidos', estado, conConteos: true, esperar: !listo, despachar, activo: !enAnalisis,
    extra: enKanban ? EXTRA_TABLERO : extraDeLaLista,
  });
  // m5 de T8: mientras la última respuesta sea la de Kanban (sin filas) y la tabla ya pida su página, la tabla está
  // cargando y el total en 'cargando': nunca «No hay pedidos de compra en esta vista» con el total de la otra consulta.
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, enKanban);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !enKanban && llegadaAhora.sinFilas && !listado.error;
  const conteos = listado.conteos as ConteosPec | null;
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  // El tablero en modo servidor (KANBAN-compras punto 7; R11, C4, D39): una consulta por columna (consultaColumnaPec: sin
  // vista, los estados de la columna cruzados con el filtro, la búsqueda y el semáforo del MISMO estado), porColumna = el
  // tamaño de la tabla y limit=0 en las plegadas (lo hace el hook). 'atencion' en las abiertas (lo vencido primero, R8)
  // y 'reciente' en Recibido y Cancelado. Un PEC con un estado desconocido no sale en ninguna columna (RP97).
  const tablero = useTableroKanban<FilaPec>({
    pantalla: ID_HUB,
    modo: 'servidor',
    columnas: COLUMNAS_PEC,
    activo: listo && enKanban && !enAnalisis,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaPec(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await _apiFetch(`/compras/pedidos?${consulta}`, { signal }));
    },
  });

  // La franja del flujo (FLUJO-compras punto 5; R9, RP46, D36, D42): GET /compras/flujo; recargaFlujo sube con cada recarga.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/compras/flujo', recargaFlujo);

  // Las tarjetas (KPI-compras punto 5; R7, R12, RP43): GET /compras/stats?periodo=30d (antes se pedía sin período a un
  // endpoint que no existía y quedaba en {}), sin respaldo local. Mientras no llega, 'cargando' (nunca 0); si falla, «—».
  const [vueltaStats, setVueltaStats] = useState(0);
  const [stats, setStats] = useState<{ vuelta: number; datos: unknown; error: unknown } | null>(null);
  useEffect(() => {
    const control = new AbortController();
    _apiFetch(`/compras/stats?periodo=${PERIODO_KPI}`, { signal: control.signal })
      .then((r: { data?: unknown } | null) => setStats({ vuelta: vueltaStats, datos: r?.data ?? null, error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setStats({ vuelta: vueltaStats, datos: null, error: err }); });
    return () => control.abort();
  }, [vueltaStats]);
  const cargandoStats = stats?.vuelta !== vueltaStats;
  const estadoKpis = useEstadoKpi(cargandoStats, cargandoStats ? null : (stats?.error ?? null));
  const tarjetas = tarjetasHubCompras(stats?.datos ?? null);

  // B1 a B3 (queda igual): los pedidos de venta del panel de consolidación (sus PENDIENTE_COMPRA se filtran en el panel).
  // T14 r1 (m9): si el GET falla, el error queda en el estado (el panel lo dice con «Reintentar») y la lista de antes se
  // conserva; nunca se presenta como una lista vacía.
  const [ventas, setVentas] = useState<{ filas: FilaVenta[]; error: unknown }>({ filas: [], error: null });
  const [vueltaVentas, setVueltaVentas] = useState(0);
  useEffect(() => {
    let vigente = true;
    apiFetch('/ventas/pedidos?limit=200')
      .then((r) => { if (vigente) setVentas({ filas: Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []), error: null }); })
      .catch((err: unknown) => { if (vigente) setVentas((v) => ({ filas: v.filas, error: err })); });
    return () => { vigente = false; };
  }, [vueltaVentas]);
  // m10: releer el detalle del panel abierto cuando cancelar desde él falla y el servidor pide recargar.
  const [vueltaDetalle, setVueltaDetalle] = useState(0);

  // «Actualizar»: la tabla, el tablero, la franja, las tarjetas y los pedidos de venta del panel. Ninguna recarga vacía lo
  // que se ve: los hooks conservan lo último. Después de un cambio de estado, lo que ese cambio mueve (la lista con sus
  // conteos, la franja y las tarjetas); del tablero, solo el origen y el destino (D39).
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarTodo = useCallback(() => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
    setVueltaVentas((n) => n + 1);
  }, [recargarListado, recargarTablero]);
  const recargarTrasCambio = useCallback(() => {
    recargarListado();
    setRecargaFlujo((n) => n + 1);
    setVueltaStats((n) => n + 1);
  }, [recargarListado]);

  // ── B4 T14, bloque 4: cancelar con motivo (KANBAN-compras punto 7; R9, C15c, RP30, RP93) ──
  // Un solo ModalMotivo para el panel, el menú de la fila, el tablero y la barra masiva (nunca confirm()): el motivo de
  // 5 letras o más va en el PATCH y el servidor lo deja en la Actividad («Estado cambiado a Cancelado. Motivo: …»). Solo se
  // mandan los que update_pec deja cancelar (repartirCancelacionPec); los demás se nombran como omitidos.
  const [selectedPec, setSelectedPec] = useState<FilaPec | null>(null);
  const [cancelacion, setCancelacion] = useState<Cancelacion | null>(null);
  const [seleccion, setSeleccion] = useState<ClaveFila[]>([]);
  const pedirCancelacion = useCallback((filas: FilaPec[], opciones: { columnas?: ColumnasDeTarjeta; desdePanel?: boolean } = {}) => {
    const { cancelables, omitidos } = repartirCancelacionPec(filas);
    if (cancelables.length === 0) {
      avisar(resumenCancelacionPec([], omitidos).mensaje, { tono: 'error' });
      return;
    }
    setCancelacion({ pecs: cancelables, omitidos, columnas: opciones.columnas ?? null, desdePanel: Boolean(opciones.desdePanel) });
  }, [avisar]);

  // T14 r1 (m15): en serie, con el mismo motivo para todos (cancelarPecsEnSerie), y lo que sigue lo decide
  // despuesDeCancelarPec (estados-compras.js, con sus casos): qué sale de la selección, qué queda en la ventana, cuándo
  // recargar (la regla única recargarTrasError), los pedidos de venta del panel (I1) y su detalle (m10), y qué error se
  // relanza para que ModalMotivo muestre el mensaje del servidor y conserve lo escrito (con un solo pedido, el mismo).
  async function cancelarConMotivo(motivo: string) {
    if (!cancelacion) return;
    const { pecs, omitidos, columnas, desdePanel } = cancelacion;
    const autor = autorActual();
    const resultados = await cancelarPecsEnSerie(pecs, (p) => _apiFetch(`/compras/pedidos/${p.id}`, {
      method: 'PATCH', body: JSON.stringify({ estado: 'CANCELADO', motivo, updated_by: autor }),
    }));
    const r = despuesDeCancelarPec(pecs, resultados, omitidos);
    if (r.fuera.length > 0) setSeleccion((s) => s.filter((c) => !r.fuera.includes(String(c))));
    if (r.recargar) {
      if (columnas) tablero.recargar([...columnas]);
      recargarTrasCambio();
    }
    if (r.recargarVentas) setVueltaVentas((n) => n + 1);
    if (r.mensajeOk) avisar(r.mensajeOk, { tono: 'ok' });
    if (r.error === null) {
      if (desdePanel) setSelectedPec(null);
      return;
    }
    if (desdePanel && r.recargarDetalle) setVueltaDetalle((n) => n + 1);
    setCancelacion({ ...cancelacion, pecs: r.pendientes, omitidos: [] });
    throw r.error;
  }

  // ── B4 T14, bloque 2: la tabla (TABLA-compras punto 6; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_HUB, COLUMNAS_TABLA_HUB);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban o a Análisis sale de la pantalla completa (el conmutador sigue a la vista).
  useEffect(() => { if (enKanban || enAnalisis) salir(); }, [enKanban, enAnalisis, salir]);
  const abrir = useCallback((p: FilaPec) => setSelectedPec(p), []);
  const accionesFila = useMemo<AccionesFilaHub>(() => ({
    abrir, ir: (ruta) => router.push(ruta), cancelar: (filas) => pedirCancelacion(filas),
  }), [abrir, router, pedirCancelacion]);
  const pestanas = pestanasDelHub(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o
  // las de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec));
    } else despachar(accion);
  }, [estado, despachar]);
  // R8: ordenada por una columna, el chip «Orden: … · Atención primero» vuelve a lo vencido primero.
  const textoOrden = enKanban || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_HUB);
  // TABLA-compras punto 6: con el orden por fecha de compra, un separador por mes (en la página que se ve).
  const porMes = ordenPorFechaDeCompra(estado.orden);
  const tituloDeMes = useCallback((grupo: string, n: number) => `${tituloMesPec(grupo)} · ${n} en esta página`, []);
  // La selección de la página (TablaEstandar la limpia al cambiar de página, de pestaña, de búsqueda, de filtro o de orden).
  const alSeleccionar = useCallback((claves: ClaveFila[]) => setSeleccion(claves), []);
  const pieSeleccion = seleccion.length > 0
    ? <span className="font-bold text-purple-700">{seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
    : null;
  const filasSeleccionadas = () => seleccion
    .map((c) => listado.filas.find((f) => String(f.id) === String(c)))
    .filter((f): f is FilaPec => Boolean(f));
  // m8 de T8: el «vacío» solo cambia con la búsqueda.
  const vacio = useMemo(() => {
    const q = estado.q.trim();
    return (
      <div>
        <p className="font-semibold text-slate-600">{q ? `Sin resultados para «${q}»` : 'No hay pedidos de compra en esta vista'}</p>
        <p className="mt-1 text-xs text-slate-500">
          {q ? 'Ajusta la búsqueda o el filtro de estados.' : 'Los pedidos de compra se crean con «Nuevo PEC» o desde el panel de un pedido.'}
        </p>
      </div>
    );
  }, [estado.q]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: sinPagina ? null : listado.total,
    estadoTotal: estadoDelTotal({
      total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
    }),
  };

  // ── B4 T14, bloque 3: el tablero (KANBAN-compras punto 7; R9, R11, C15c; D39) ──
  // reglaSoltarPec (T2): a mano solo Borrador → Emitido y cancelar (con motivo); En tránsito, En bodega y Recibido quedan
  // bloqueados ANTES de soltar con el enlace a donde se hacen; un cancelado no se reabre. 'cambio': el PATCH; si falla, la
  // regla recargarTrasError y el error sigue para que el tablero deshaga (eso ya recarga su origen y su destino).
  async function cambiarDesdeTablero(p: FilaPec, resultado: { estado: string }) {
    try {
      await _apiFetch(`/compras/pedidos/${p.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: resultado.estado, updated_by: autorActual() }),
      });
    } catch (err) {
      if (recargarTrasError(err)) recargarTrasCambio();
      throw err;
    }
    recargarTrasCambio();
  }
  // 'accion' 'cancelar': el ModalMotivo; al terminar, del tablero solo el origen y el destino (D39).
  function accionDesdeTablero(p: FilaPec, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion === 'cancelar') pedirCancelacion([p], { columnas: [origen, destino] });
  }

  // ── B4 T14, bloque 8: Documentos / Análisis (ANALISIS-compras punto 4; R2, R13, RP35) ──
  const cambiarSeccion = useCallback((analisis: boolean) => {
    setEnAnalisis(analisis);
    setSeleccion([]);
    // Al volver a los documentos la URL deja de decir ?tab=analisis (recargar no reabre el Análisis).
    if (!analisis && leerEnlaceHubCompras(window.location.search).analisis) router.replace(RUTA_HUB_COMPRAS);
  }, [router]);
  const alCambiarAparte = useCallback((activa: boolean) => {
    if (activa !== enAnalisis) cambiarSeccion(activa);
  }, [enAnalisis, cambiarSeccion]);

  // ── B4 T14, bloque 5: las tarjetas (KPI-compras punto 5; R12, RP93) ──
  // pec_activos abre «No resueltos» y pec_en_transito «En tránsito» (D41: como un clic en la pestaña; tocar la activa
  // vuelve a Todos). En Kanban abren esa pestaña en Lista (accionVistaEnLista). Cumplimiento y Comprado no son vistas.
  const vistaActiva = enKanban || enAnalisis ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = vistaActiva === vista ? INICIAL_HUB.vista : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosPec));
    if (enAnalisis) cambiarSeccion(false);
  };

  // ── B4 T14, bloque 6: la franja del flujo (FLUJO-compras punto 5; R5, R9, C3, RP40, RP46, D42) ──
  // «Con atraso» es semaforo=vencidos en el servidor (accionSemaforoCompras); tocar Pedido de compra, En tránsito o
  // Recibido abre su pestaña con accionPestana (T14 r1, m1; D41, D42) y Recibido filtra además su etapa
  // (accionPasoHubCompras); tocarla otra vez lo quita. Lista de compras y Recepción en bodega son enlaces. Desde Análisis,
  // vuelven a los documentos.
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    despachar(accionSemaforoCompras(estado, f, enKanban ? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec));
    if (enAnalisis) cambiarSeccion(false);
  };
  const elegirPaso = (clave: string) => {
    const accion = accionPasoHubCompras(estado, clave, opcionesEstadosPec);
    if (accion) despachar(accion);
    if (enAnalisis) cambiarSeccion(false);
  };
  const actualizando = listado.recargando || flujo.cargando || (cargandoStats && stats !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {selectedPec && (
        <PecDetailPanel
          pec={selectedPec}
          pedidosVenta={ventas.filas}
          errorVentas={ventas.error}
          onReintentarVentas={() => setVueltaVentas((n) => n + 1)}
          vueltaDetalle={vueltaDetalle}
          onClose={()=>setSelectedPec(null)}
          onUpdate={recargarTodo}
          onToast={showToast}
          onCancelar={(p) => pedirCancelacion([p], { desdePanel: true })}
        />
      )}

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath="/dashboard/compras" color="purple" hub={{ href: '/dashboard/compras' }} />

      {/* B4 T14 (FLUJO-compras punto 5; R9, D42, RP46): la franja del flujo reemplaza el semáforo con emojis, sus botones
          repetidos y el botón de los tiempos de alerta (abría una ventana que no guardaba nada; R9). Sin el botón de los no
          resueltos (Compras no lo tiene). Va directo bajo la barra de submódulos, sin otro padding horizontal. */}
      <BannerFlujo
        titulo="Flujo de compras"
        idPreferencia="compras"
        regla={textoReglaCompras()}
        semaforo={{
          atrasados: flujo.datos?.semaforo?.atrasados ?? null,
          filtro: filtroSemaforoCompras(estado),
          onFiltrar: alFiltrarSemaforo,
        }}
        pasos={pasosHubCompras(flujo.datos, estado)}
        avisos={avisosFlujoCompras(flujo.datos)}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
        onSeleccionarPaso={elegirPaso}
      />

      <div className={CONTENEDOR}>

        {/* HEADER ROW */}
        <PageHeader
          icon={ShoppingBag} color="purple"
          title="HUB de Compras"
          subtitle="Compras a proveedores, envíos en camino y recepción en bodega."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <Link href="/dashboard/compras/pedidos"
                className="flex items-center gap-2 px-4 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all">
                <ContenidoEnlace icon={Plus}>Nuevo PEC</ContenidoEnlace>
              </Link>
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs shadow-xs transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={13} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/> Actualizar
              </button>
            </div>
          )} />

        {/* B4 T14 (KPI-compras punto 5; R7, R12, RP43, RP93): las 4 tarjetas de /compras/stats (todos los PEC): mientras
            cargan, barras grises (nunca 0); con error, «—». «Pedidos de compra activos» abre «No resueltos» y «En tránsito»
            su pestaña; «Comprado (30 días)» lleva su % en gris. No se ven en Análisis. */}
        {!enAnalisis && (
          <FranjaKpis estado={estadoKpis} titulo="Pedidos de compra">
            <TarjetaKpi kpi="pec_activos" valor={tarjetas?.activos.valor ?? null} ayuda={tarjetas?.activos.ayuda ?? undefined}
              tono={tarjetas?.activos.tono ?? 'normal'} activo={vistaActiva === 'no_resueltos'} onClick={() => elegirVista('no_resueltos')} />
            <TarjetaKpi kpi="pec_en_transito" valor={tarjetas?.en_transito.valor ?? null}
              activo={vistaActiva === 'en_transito'} onClick={() => elegirVista('en_transito')} />
            <TarjetaKpi kpi="pec_cumplimiento" valor={tarjetas?.cumplimiento.valor ?? null} ayuda={tarjetas?.cumplimiento.ayuda ?? undefined} />
            <TarjetaKpi kpi="comprado_periodo" valor={tarjetas?.comprado.valor ?? null}
              variacion={tarjetas?.comprado.variacion ?? { actual: null, anterior: null }} ayuda={tarjetas?.comprado.ayuda} />
          </FranjaKpis>
        )}

        {/* B4 T14 (TABLA-compras punto 6, KANBAN-compras punto 7, ANALISIS-compras punto 4): la barra y la tabla estándar
            en el servidor, o el tablero en modo servidor, con el MISMO estado (pestaña, búsqueda, estados y semáforo). En
            Kanban las pestañas de vista no se ven (el tablero muestra todos los PEC); Análisis es la pestaña aparte. */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban && !enAnalisis ? undefined : pestanas}
                pestanaAparte={{ id: 'analisis', etiqueta: 'Análisis', activa: enAnalisis, onCambiar: alCambiarAparte }}
                estadoConteos={estadoConteos}
                placeholder="Buscar por número, proveedor, pedido de venta, comprador o producto…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec}
                filtros={textoOrden ? (
                  <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-600">
                    {textoOrden}
                    <span aria-hidden="true">·</span>
                    <button type="button" onClick={() => despachar({ tipo: 'orden', valor: 'atencion' })}
                      className={`rounded font-bold text-purple-700 hover:underline ${FOCO_VISIBLE}`}>
                      Atención primero
                    </button>
                  </span>
                ) : undefined}
                ajustes={{ columnas: COLUMNAS_TABLA_HUB, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="purple"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden, la selección de la página y los
                  separadores por mes son de la tabla; la fila vencida en filaAlerta; un clic en la fila abre el panel. */}
              {!enAnalisis && !enKanban && (
                <TablaEstandar
                  id={ID_HUB}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_HUB}
                  preferencias={prefs}
                  anchoRef={anchoTablaRef}
                  estado={estado}
                  onEstado={despachar}
                  filas={listado.filas}
                  total={sinPagina ? null : listado.total}
                  cargando={listado.cargandoInicial || sinPagina}
                  recargando={listado.recargando}
                  error={listado.error}
                  onReintentar={listado.recargar}
                  aviso={listado.avisoOrden}
                  onFila={abrir}
                  claseFila={claseDeFila}
                  grupoFila={porMes ? grupoMesPec : undefined}
                  tituloGrupo={tituloDeMes}
                  seleccion={seleccion}
                  onSeleccion={alSeleccionar}
                  pie={pieSeleccion}
                  vacio={vacio}
                  etiqueta="Pedidos de compra del Hub"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enAnalisis ? (
            /* ANALISIS-compras punto 4 (R2, R13, RP69, D45): /compras/analisis con el contrato único; la línea de lo
               comprado es neutra (ni buena ni mala). El asistente es la tarjeta de AsistenteEnConstruccion del panel
               (R2): se fue el chat simulado. */
            <PanelAnalisisPerezoso
              modulo="compras"
              endpoint="/compras/analisis"
              acento="purple"
              mejorLinea="neutro"
              asistente={ASISTENTE_COMPRAS}
            />
          ) : enKanban ? (
            /* KANBAN-compras punto 7: Borrador · Emitido · En tránsito · En bodega · Recibido (plegada) · Cancelado
               (plegada). Lo que no se puede queda bloqueado con su motivo y su enlace ANTES de soltar (reglaSoltarPec). */
            <TableroKanban
              tablero={tablero}
              regla={reglaSoltarPec}
              tarjetaDe={tarjetaPec}
              onAbrir={abrir}
              onCambio={cambiarDesdeTablero}
              onAccion={accionDesdeTablero}
              color="purple"
            />
          ) : null}
        </div>

        {/* La barra masiva (la selección es de la página de la tabla, así que solo en Lista): cancelar con un motivo. */}
        {seleccion.length > 0 && !enAnalisis && !enKanban && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-sm bg-slate-800 px-3 py-1 rounded-full">{seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
            {/* T14 r1 (m11): sobre el fondo oscuro, un foco blanco que se vea (el anillo del navegador apenas contrasta). */}
            <button type="button" onClick={() => pedirCancelacion(filasSeleccionadas())}
              className={`bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors ${FOCO_OSCURO}`}>
              <Trash2 size={14} aria-hidden="true"/> Cancelar seleccionados
            </button>
            <button type="button" onClick={() => setSeleccion([])} aria-label="Quitar la selección" title="Quitar la selección"
              className={`rounded-lg p-1.5 text-slate-400 hover:text-white ${FOCO_OSCURO}`}><X size={14} aria-hidden="true"/></button>
          </div>
        )}
      </div>

      {/* B4 T14 (R9, C15c, RP93): el motivo de la cancelación (ModalMotivo, nunca confirm) con lo que pasa al cancelar. */}
      {cancelacion && (
        <ModalMotivo
          efectos={[...EFECTOS_CANCELAR_PEC]}
          titulo={cancelacion.pecs.length === 1 ? `Cancelar ${cancelacion.pecs[0].numero}` : `Cancelar ${cancelacion.pecs.length} pedidos de compra`}
          mensaje={cancelacion.pecs.length > 1 || cancelacion.omitidos.length > 0 ? (
            <>
              {cancelacion.pecs.length > 1 && (
                <p>Se cancelan uno por uno, con el mismo motivo: {cancelacion.pecs.map((p) => p.numero).join(', ')}.</p>
              )}
              {cancelacion.omitidos.length > 0 && (
                <p className="mt-1 text-slate-500">Se omiten: {cancelacion.omitidos.map((o) => `${o.numero} (${o.motivo})`).join('; ')}.</p>
              )}
            </>
          ) : undefined}
          textoConfirmar={cancelacion.pecs.length === 1 ? 'Cancelar pedido de compra' : 'Cancelar pedidos de compra'}
          placeholder="Ej: El proveedor no tiene existencias, se pidió por error, etc."
          onConfirmar={cancelarConMotivo}
          onCerrar={() => setCancelacion(null)}
        />
      )}
    </div>
  );
}
