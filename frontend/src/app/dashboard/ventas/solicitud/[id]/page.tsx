"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import {
  ArrowLeft, ArrowRight, ChevronRight, Edit2, Save, Trash2, CheckCircle2,
  User, Phone, Mail, MapPin, MessageCircle, RefreshCw, AlertCircle,
  FileText, Activity, XCircle, MessageSquare, RotateCcw, Filter, Send,
} from 'lucide-react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';
import { Button, Modal } from '@/components/ui';
import {
  EstadoBadge, TipoBadge, ChatterTab, IAPanelSC,
  ESTADOS_SC_MANUALES, TIPOS_SC, MODALIDADES_PAGO, fDate, fTime, fCOP,
} from '../solicitud-client';

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
};
const ACTIVITY_TYPE_ORDER = ['ESTADO_CHANGED', 'NOTE_ADDED', 'CREATED', 'CHATTER', 'CANCELLED', 'RESTORED'];

function SolicitudDetalleContent() {
  const params = useParams();
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

  const [panelTab, setPanelTab] = useState<'acciones' | 'actividad' | 'chatter' | 'ia'>('acciones');
  const [activityFilter, setActivityFilter] = useState<string>('all');

  // Cancelar con razon (mismo endpoint/flujo que solicitud-client.tsx, duplicado
  // aqui como estado propio de la pagina -- mismo patron que "Cancelar Pedido"
  // en venta/[id]/page.tsx). Antes solo era alcanzable desde la lista (fila /
  // menu de 3 puntos); ahora tambien se puede disparar desde el detalle.
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelRazon, setCancelRazon] = useState('');
  const [cancelling, setCancelling] = useState(false);

  useEffect(() => {
    const u = localStorage.getItem('user_name') || localStorage.getItem('username') || '';
    setCurrentUser(u);
  }, []);

  const loadSolicitud = useCallback(async () => {
    if (!params.id) { setLoading(false); return; }
    setLoading(true);
    setLoadError('');
    try {
      const raw = await apiFetch(`/ventas/solicitudes/${params.id}`);
      const d = raw?.data ?? raw;
      setSolicitud(d);
      setEditForm({
        advisor_name: d.advisor_name || '',
        tipo_solicitud: d.tipo_solicitud || 'Cotizacion de Producto',
        modalidad_pago: d.modalidad_pago || 'Contado',
        notas: d.notas || '',
        fecha_vencimiento: d.fecha_vencimiento ? d.fecha_vencimiento.split('T')[0] : '',
      });
    } catch (err: any) {
      setLoadError(err.message || 'No se pudo cargar la solicitud');
    }
    setLoading(false);
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
    if (newEstado === 'CANCELADA' && !window.confirm('Cancelar esta solicitud?')) return;
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
      await loadSolicitud();
      alert(`Cotización ${cotNum} creada`);
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setConfirming(false);
  }

  async function enviarParaConfirmacion() {
    if (!solicitud) return;
    setSendingConfirmacion(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}/enviar-confirmacion`, { method: 'POST', body: JSON.stringify({ user_name: currentUser }) });
      await loadSolicitud();
    } catch (err: any) {
      alert('Error: ' + err.message);
    }
    setSendingConfirmacion(false);
  }

  async function cancelWithReason() {
    if (!solicitud || !cancelRazon.trim()) { alert('La razón es obligatoria'); return; }
    setCancelling(true);
    try {
      await apiFetch(`/ventas/solicitudes/${solicitud.id}/cancelar`, { method: 'POST', body: JSON.stringify({ razon: cancelRazon, user_name: currentUser }) });
      setShowCancelModal(false);
      setCancelRazon('');
      await loadSolicitud();
    } catch (err: any) {
      alert('Error al cancelar: ' + err.message);
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
  const pipelineStep = cotizaciones.some((c: any) => c.estado === 'CONFIRMADA') ? 2 : cotizaciones.length > 0 ? 1 : 0;

  // Gate 1 (confirmacion por link): "Confirmar + Crear Cotizacion" (confirmarSC) ahora
  // solo es valido cuando el cliente ya confirmo via el link publico (estado ===
  // CONFIRMADA) Y la SC todavia no tiene ninguna Cotizacion vinculada -- el backend
  // (confirmar_solicitud en erp_ventas.py) exige exactamente ambas cosas: una venta
  // cerrada normal puede volver a dejar la SC en CONFIRMADA via la sincronizacion con
  // su Cotizacion, pero eso nunca debe reabrir la creacion de una Cotizacion duplicada.
  // Reutilizado por el boton "Cotizar" del bloque Cotizaciones (panel izquierdo) y por
  // el tab Acciones; en cualquier otro caso no se ofrece esa accion (ASIGNADA tiene su
  // propia accion -- "Enviar para Confirmacion", ver abajo).
  const canConfirmarSC = solicitud?.estado === 'CONFIRMADA' && cotizaciones.length === 0;

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
            <Button variant="danger" size="sm" icon={Trash2} onClick={() => setShowCancelModal(true)}>Cancelar Solicitud</Button>
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
              <div><label className="text-xs font-bold text-slate-500 mb-1.5 uppercase tracking-wider block">Asesor</label><input type="text" value={editForm.advisor_name} onChange={e => setEditForm((ef: any) => ({ ...ef, advisor_name: e.target.value }))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none" /></div>
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
              {(solicitud?.productos || []).length > 0 && (
                <div>
                  <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Productos</p>
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 text-slate-400 uppercase font-black"><tr><th className="px-3 py-2 text-left">Producto</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Precio</th></tr></thead>
                      <tbody className="divide-y divide-slate-50">
                        {solicitud.productos.map((p: any, i: number) => (
                          <tr key={i}><td className="px-3 py-2 font-medium text-slate-700">{p.product_name}</td><td className="px-3 py-2 text-right text-slate-600">{p.qty}</td><td className="px-3 py-2 text-right font-bold text-indigo-700">{fCOP(p.unit_price_cop)}</td></tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
              {solicitud?.notas && <div className="bg-amber-50 border border-amber-100 rounded-xl p-4"><p className="text-xs font-black text-amber-700 uppercase mb-1.5">Notas</p><p className="text-sm text-amber-900">{solicitud.notas}</p></div>}
              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cotizaciones</p>
                {cotizaciones.length > 0 ? (
                  cotizaciones.map((c: any) => (
                    <Link key={c.id} href={`/dashboard/ventas/cotizacion/${c.id}?return_to=${encodeURIComponent(currentPath)}`} className="flex items-center justify-between p-3 bg-amber-50 border border-amber-200 rounded-xl mb-2 hover:bg-amber-100">
                      <div><span className="font-bold text-amber-800">{c.numero}</span><p className="text-xs text-amber-600 mt-0.5">{c.estado}</p></div>
                      <ChevronRight size={15} className="text-amber-500" />
                    </Link>
                  ))
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-300 rounded-xl p-4 text-center">
                    <p className="text-xs text-slate-400 italic mb-3">Aún no se ha realizado ninguna cotización.</p>
                    {canConfirmarSC && (
                      <Button color="emerald" size="sm" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Cotizar</Button>
                    )}
                  </div>
                )}
              </div>
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
            ) : (
              <>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Cambiar Estado</p>
                <div className="flex gap-2 flex-wrap">
                  {Object.entries(ESTADOS_SC_MANUALES).filter(([k]) => k !== solicitud?.estado).map(([k, v]) => (
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
                  {canConfirmarSC ? (
                    <div className="[&>button]:w-full">
                      <Button color="emerald" size="lg" icon={CheckCircle2} loading={confirming} onClick={confirmarSC}>Confirmar + Crear Cotizacion</Button>
                    </div>
                  ) : solicitud?.estado === 'ASIGNADA' ? (
                    <div className="[&>button]:w-full">
                      <Button color="indigo" size="lg" icon={Send} loading={sendingConfirmacion} onClick={enviarParaConfirmacion}>Enviar para Confirmación</Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center px-4 py-2.5 rounded-xl border border-dashed border-slate-200 text-slate-300 text-sm font-bold">
                      Sin acciones principales disponibles
                    </div>
                  )}
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

      {/* MODAL: RAZÓN DE CANCELACIÓN */}
      {showCancelModal && (
        <Modal title="Cancelar Solicitud" subtitle="Esta acción pasará la SC a la papelera por 30 días antes de eliminarse." icon={Trash2} color="red" maxWidth="md"
          onClose={() => setShowCancelModal(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={() => setShowCancelModal(false)}>No, mantener</Button>
              <Button variant="danger" icon={Trash2} loading={cancelling} disabled={!cancelRazon.trim()} onClick={cancelWithReason}>Cancelar SC</Button>
            </>
          )}>
          <div>
            <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Razón de Cancelación *</label>
            <textarea
              value={cancelRazon}
              onChange={e => setCancelRazon(e.target.value)}
              rows={3}
              placeholder="Describe el motivo de la cancelación..."
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-red-200 outline-none"
              autoFocus
            />
            {!cancelRazon.trim() && <p className="text-xs text-red-500 mt-1">La razón es obligatoria para continuar.</p>}
          </div>
        </Modal>
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
