"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  ArrowLeft, Send, Mail, FileText, CheckCircle2, Circle,
  MessageSquare, Paperclip, Calculator, Search, RefreshCw,
  AlertCircle, XCircle, Activity
} from 'lucide-react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { apiFetch } from '@/lib/api';

const ESTADOS_COT: Record<string, {label:string; color:string; bg:string; border:string}> = {
  BORRADOR:               {label:'Borrador',            color:'#64748b',bg:'#f1f5f9',border:'#e2e8f0'},
  ENVIADA:                {label:'Enviada al Cliente',   color:'#92400e',bg:'#fef3c7',border:'#fde68a'},
  PENDIENTE_CONFIRMACION: {label:'Esp. Confirmacion',    color:'#1d4ed8',bg:'#eff6ff',border:'#bfdbfe'},
  CONFIRMADA:             {label:'Confirmada',           color:'#065f46',bg:'#f0fdf4',border:'#a7f3d0'},
  RECHAZADA:              {label:'Rechazada',            color:'#991b1b',bg:'#fef2f2',border:'#fecaca'},
  VENCIDA:                {label:'Vencida',              color:'#7c3aed',bg:'#f5f3ff',border:'#ddd6fe'},
};

const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
const fCOP = (v: any) => {
  const n = Number(v) || 0;
  if (n === 0) return '$0';
  return new Intl.NumberFormat('es-CO', {style:'currency', currency:'COP', minimumFractionDigits:0}).format(n);
};

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
  const isNew = params.id === 'nueva';

  const [cotizacion, setCotizacion] = useState<any>(null);
  const [loading, setLoading] = useState(!isNew);
  const [loadError, setLoadError] = useState('');
  const [currentUser, setCurrentUser] = useState('');
  const [sending, setSending] = useState(false);
  const [confirming, setConfirming] = useState(false);

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

  async function handleEnviarCotizacion() {
    if (!cotizacion?.id) return;
    setSending(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}`, {
        method: 'PATCH',
        body: JSON.stringify({estado: 'ENVIADA', updated_by: currentUser}),
      });
      await loadCotizacion();
    } catch (err: any) {
      alert('Error al enviar la cotizacion: ' + err.message);
    }
    setSending(false);
  }

  async function handleConfirmarVenta() {
    if (!cotizacion?.id) return;
    setConfirming(true);
    try {
      await apiFetch(`/ventas/cotizaciones/${cotizacion.id}/confirmar`, {
        method: 'POST',
        body: JSON.stringify({user_name: currentUser}),
      });
      await loadCotizacion();
    } catch (err: any) {
      alert('Error al confirmar la venta: ' + err.message);
    }
    setConfirming(false);
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
                <span className="px-3 py-1 rounded-full text-xs font-bold border"
                  style={{backgroundColor: estadoCfg.bg, color: estadoCfg.color, borderColor: estadoCfg.border}}>
                  {estadoCfg.label}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {!isNew && estadoActual === 'BORRADOR' && (
            <button onClick={handleEnviarCotizacion} disabled={sending} className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
              {sending ? <RefreshCw size={16} className="animate-spin" /> : <Send size={16} />} Enviar al Cliente
            </button>
          )}
          {!isNew && (estadoActual === 'ENVIADA' || estadoActual === 'PENDIENTE_CONFIRMACION') && (
            <button onClick={handleConfirmarVenta} disabled={confirming} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm transition-colors shadow-sm disabled:opacity-50">
              {confirming ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle2 size={16} />} Cliente Acepto (Generar Venta)
            </button>
          )}
        </div>
      </div>

      {/* Main Content Layout (Split Pane) */}
      <div className="flex-1 flex flex-row overflow-hidden">

        {/* BLOQUE 1: Informacion de la Cotizacion (Formulario sin limites) */}
        <div className="flex-1 overflow-y-auto px-8 py-8 custom-scrollbar bg-white relative">

          {ventaGenerada && pedidoReciente && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 mb-8 flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><CheckCircle2 size={20}/></div>
                <div>
                  <h3 className="font-black text-emerald-900">Pedido {pedidoReciente.numero} creado exitosamente</h3>
                  <p className="text-sm text-emerald-700">La cotizacion fue aceptada y ya paso a operaciones/logistica.</p>
                </div>
              </div>
              <Link href={`/dashboard/ventas/venta?id=${pedidoReciente.id}`} className="bg-emerald-600 text-white px-4 py-2 rounded-lg font-bold text-sm shadow-sm hover:bg-emerald-700 transition-colors">
                Ver Pedido de Venta
              </Link>
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

            {/* ARTICULOS Y PRECIOS */}
            <div className="mb-10">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-black text-slate-800 flex items-center gap-2">
                  <Calculator className="text-blue-600" size={20} /> Valorizacion de Articulos
                </h3>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
                <table className="w-full text-left">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase">Producto / Descripcion</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-24 text-center">Cant.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36">Precio Unit.</th>
                      <th className="px-4 py-3 text-xs font-bold text-slate-500 uppercase w-36 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {productos.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-4 py-6 text-center text-sm text-slate-400 italic">
                          Sin productos registrados en esta cotizacion.
                        </td>
                      </tr>
                    )}
                    {productos.map((item: any, idx: number) => (
                      <tr key={idx} className="hover:bg-slate-50">
                        <td className="px-4 py-3 font-bold text-slate-800 text-sm">
                          {item.product_name || item.name || 'Producto sin nombre'}
                        </td>
                        <td className="px-4 py-3 text-center text-sm font-bold text-slate-700">
                          {item.qty ?? 0}
                        </td>
                        <td className="px-4 py-3 text-sm font-bold text-slate-700">
                          {fCOP(item.unit_price_cop)}
                        </td>
                        <td className="px-4 py-3 font-black text-slate-800 text-right">
                          {fCOP((Number(item.unit_price_cop) || 0) * (Number(item.qty) || 0))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

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

          </div>
        </div>

        {/* Resizer Handle */}
        <div
          onMouseDown={handleMouseDown}
          className="w-1.5 bg-slate-200 hover:bg-blue-500 cursor-col-resize shrink-0 transition-colors z-30"
          title="Arrastrar para ajustar panel de actividades"
        />

        {/* BLOQUE 2: Actividades y Bitacora (Chatter) */}
        <div style={{width: rightWidth}} className="bg-white flex flex-col overflow-hidden shrink-0 shadow-[-10px_0_15px_-10px_rgba(0,0,0,0.05)]">

          <div className="p-5 border-b border-slate-200 bg-white flex items-center justify-between shadow-sm z-10 shrink-0">
            <h3 className="font-black text-slate-800 flex items-center gap-2 text-lg">
              <MessageSquare className="text-slate-400" size={20} /> Actividades
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
                  <button onClick={()=>{
                    const prods = cotizacion?.productos || [];
                    const actividades = cotizacion?.actividades || [];
                    const txt=`ANALISIS DE COTIZACION\n\nEstado: ${estadoCfg.label}\nTotal: ${fCOP(cotizacion?.total_cop)}\nSubtotal: ${fCOP(cotizacion?.subtotal_cop)}\nDescuento: ${Number(cotizacion?.descuento_pct)||0}%\n\nArticulos: ${prods.length} linea(s)\n${prods.map((p:any)=>`- ${p.product_name||'Producto'} x${p.qty||0} - ${fCOP((Number(p.unit_price_cop)||0)*(Number(p.qty)||0))}`).join('\n')}\n\nActividad: ${actividades.length} evento(s) registrados.`;
                    setCotAnalisis(txt);
                  }} disabled={!cotizacion} className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-50">Analizar</button>
                </div>
                {!cotAnalisis&&<p className="text-xs text-indigo-700 italic text-center py-3">Genera un analisis con los precios, productos y estado de la cotizacion.</p>}
                {cotAnalisis&&<pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/70 rounded-xl p-3 border border-indigo-100 mt-2">{cotAnalisis}</pre>}
              </div>
            </div>
          )}

          {cotPanelTab==='actividad'&&(
          <>{/* Activity Input Area */}
          <div className="p-5 border-b border-slate-200 bg-slate-50 z-10 shrink-0">
            <div className="flex gap-2 mb-4">
              <button className="flex-1 flex items-center justify-center gap-2 bg-white border border-slate-200 hover:bg-slate-100 text-slate-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <MessageSquare size={16} /> Nota
              </button>
              <button className="flex-1 flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white border border-blue-700 py-2.5 rounded-xl text-xs font-bold transition-colors shadow-sm">
                <Mail size={16} /> Correo
              </button>
            </div>

            <div className="relative">
              <textarea
                rows={3}
                placeholder="Escribe un mensaje o registra una nota interna..."
                className="w-full bg-white border border-slate-300 rounded-xl px-4 py-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none resize-none transition-colors shadow-sm"
              />
              <div className="absolute bottom-3 left-3 flex gap-2">
                <button className="p-1.5 text-slate-400 hover:text-blue-600 rounded-md hover:bg-blue-50 transition-colors"><Paperclip size={18} /></button>
              </div>
              <button className="absolute bottom-3 right-3 bg-blue-600 hover:bg-blue-700 text-white p-2 rounded-lg shadow-sm transition-colors">
                <Send size={16} />
              </button>
            </div>
          </div>

          {/* Timeline / Bitacora */}
          <div className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-white">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-6">Linea Temporal</h4>

            <div className="space-y-6 relative before:absolute before:inset-0 before:ml-4 before:-translate-x-px before:h-full before:w-0.5 before:bg-gradient-to-b before:from-transparent before:via-slate-200 before:to-transparent">
              {(cotizacion?.actividades || []).map((a:any) => {
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
    </div>
  );
}
