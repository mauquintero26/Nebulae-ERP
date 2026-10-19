'use client';
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  MoreHorizontal, MessageCircle, MessageSquare, Trash2, X,
  List, Send, RefreshCw, Search, Bell, Settings, Activity,
  Filter, LayoutGrid, Clock, CheckCircle2, AlertCircle, Zap,
  ToggleLeft, ToggleRight, Save, TrendingUp, ShieldAlert,
  ShoppingBag, FileText, Package, BarChart3, ChevronRight,
  ArrowRight, Phone, Check, AlertTriangle, HelpCircle,
  DollarSign, ExternalLink, Calendar, Plus
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { apiFetch, API_URL } from '@/lib/api';
import { coincideProducto } from '@/lib/busqueda';
import { SubNav, PageHeader, Badge, Drawer, Modal, Button, useAvisos, ContenidoEnlace } from '@/components/ui';
import { textoDeError, esErrorDeValidacion } from '@/lib/avisos';
import { VEN_NAV } from './ven-nav';
import { CambiosDeActividad, EnlaceConfirmacionModal, getUsuarioActual } from './flujo';
import { ChannelModal, ESTADOS as ESTADOS_COT } from './cotizacion/cotizacion-client';
import { ESTADOS_SC } from './solicitud/solicitud-client';
import { ComposerChatter, EtiquetaChatter } from './chatter';
import { agregarActividad, esEntradaChatter, motivoTelefono, textoSinTelefono } from '@/lib/chatter';
import { infoEstadoPedido, esCotizacionActiva } from '@/lib/estados-pedido';
import {
  ordenParaCancelar, motivoNoCancelable, resumenLote, ETIQUETA_ESTADO_VEN, ESTADOS_VEN_MANUALES, opcionesEstadoPVEN,
  repartirCambioEstadoPVEN, comoUTC,
  diasDesde, textoAntiguedad, ESTADOS_NO_RESOLUCION, ESTADOS_ACCION_TOMADA, esNoResuelto, esAccionTomada, accionSiguienteSC,
  esSCConCotizacionTemprana, notaReiniciaAtraso, desdeElHub, fusionarCargaHub,
} from '@/lib/hub-ventas';
import { waUrl } from '@/lib/whatsapp';
import { correoDelCliente } from '@/lib/aviso-correo';
import { formatoPesos } from '@/lib/pesos';
import { etiquetaTipoSolicitud } from '@/lib/etiquetas-ventas';
import { diasAlerta, pedidoVigente, pestanaCotizacion, valorConfig, enteroConfig, DIAS_VALIDEZ_COTIZACION, configLeida,
  cuerpoGuardarConfig } from '@/lib/listas-ventas';
// B3 T16: las secciones nuevas del ConfigPanel, la etiqueta de las acciones del Bloque 3 y el WhatsApp automático del
// envío desde el tablero (R15: lo nuevo vive en sus archivos; aquí solo se cablea).
import { SeccionSeguimiento } from './seguimiento';
import { ConfigEnvioWhatsApp } from './config-envio-whatsapp';
import { SeccionDocumentosCliente, SeccionIva, EtiquetaAccionBloque3 } from './hub-bloque3';
import { accionBloque3 } from '@/lib/acciones-bloque3';
import { abreWhatsAppLocal, MENSAJE_WHATSAPP_SIN_GUARDAR } from '@/lib/envio-whatsapp';
import { configSeguimientoInicial, validarConfigSeguimiento } from '@/lib/seguimiento';
import { normalizarTarifaIva, TARIFA_IVA_POR_DEFECTO } from '@/lib/iva';

// H42: pesos enteros con punto de miles ('$1.062.523'); lo que no es un monto (null, NaN) se ve '$0'.
const fCOP  = (v: any) => formatoPesos(v);
// Las fechas del API son UTC; si alguna llega sin zona, comoUTC la marca como UTC (no hora local corrida 5 h).
const fDate = (iso: any) => iso ? new Date(comoUTC(iso)).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
const fTime = (iso: any) => iso ? new Date(comoUTC(iso)).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
// H2: fechas del API en UTC (aunque vengan sin zona), nunca negativo.
const daysDiff = (iso: any) => diasDesde(iso);

// N10: el estado siempre con su etiqueta (pedido: estados-pedido.js; COT y SC: sus tablas), nunca el código crudo.
// Sin tipo (filtro de estados) se busca en las tres tablas; una clave desconocida sale humanizada. Sin tipo, BORRADOR
// filtra la SC «Nueva» y la COT y el pedido en «Borrador» (C5): lleva una etiqueta neutra.
const etiquetaEstado = (tipo: string, e: string): string => {
  if (tipo === 'VEN') return infoEstadoPedido(e).label;
  if (!tipo && e === 'BORRADOR') return 'Nueva / Borrador';
  const propia = tipo === 'COT' ? ESTADOS_COT[e]?.label : tipo === 'SC' ? ESTADOS_SC[e]?.label : undefined;
  return propia || ESTADOS_SC[e]?.label || ESTADOS_COT[e]?.label || infoEstadoPedido(e).label;
};

// H3: color del botón "Próxima acción" de una solicitud (tono de accionSiguienteSC).
const TONO_ACCION: Record<string,string> = {
  indigo:  'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200',
  emerald: 'bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border-emerald-200',
  amber:   'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200',
  blue:    'bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200',
  slate:   'bg-slate-50 hover:bg-slate-100 text-slate-600 border-slate-200',
};

// N3: lo que pasa con cada tipo de documento al cancelarlo desde el Hub.
const EFECTO_CANCELACION: Record<string,string> = {
  SC: 'La solicitud se cancela y pasa a la Papelera: se puede eliminar definitivamente después de 30 días si no se restaura',
  COT: 'La cotización queda Rechazada',
  VEN: 'El pedido queda Cancelado',
};

// Autor de los cambios hechos desde el Hub (Actividad); sin sesión, el servidor usa el correo del usuario.
const autorActual = () => { const u = getUsuarioActual(); return u.name || u.email || undefined; };

const getEstadoClass = (e: string) => ({
  BORRADOR: 'bg-slate-100 text-slate-700 border-slate-200',
  PENDIENTE_CONFIRMACION: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_GESTION: 'bg-blue-100 text-blue-800 border-blue-200',
  CONFIRMADA: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  ENVIADA: 'bg-sky-100 text-sky-700 border-sky-200',
  PENDIENTE_COMPRA: 'bg-orange-100 text-orange-700 border-orange-200',
  PENDIENTE_PAGO: 'bg-amber-100 text-amber-800 border-amber-200',
  EN_PROCESO: 'bg-purple-100 text-purple-700 border-purple-200',
  EN_TRANSITO: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  LISTO_ENTREGA: 'bg-teal-100 text-teal-700 border-teal-200',
  ENTREGADO: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  FACTURADO: 'bg-green-100 text-green-800 border-green-200',
  CANCELADO: 'bg-rose-100 text-rose-700 border-rose-200',
  CANCELADA: 'bg-rose-100 text-rose-700 border-rose-200',
  RECHAZADA: 'bg-rose-100 text-rose-700 border-rose-200',
} as Record<string,string>)[e] || 'bg-gray-100 text-gray-700 border-gray-200';

const getTipoClass = (t: string) => ({
  SC: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  COT: 'bg-amber-100 text-amber-800 border-amber-200',
  VEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
} as Record<string,string>)[t] || 'bg-gray-100 text-gray-700';

const getTipoLabel = (t: string) => ({
  SC: 'Solicitud',
  COT: 'Cotización',
  VEN: 'Pedido Venta',
} as Record<string,string>)[t] || t;

/* ── Activities floating panel ── */
// U6+H22 (T9B): notas rápidas con el mismo Chatter de la SC, la COT y el PVEN (ComposerChatter compacto, con la Nota
// externa, R1) arriba del historial completo, donde cada nota lleva su etiqueta. Si el GET falla, se dice y se reintenta.
// onNotaGuardada: una nota que reinicia el atraso del documento (un contacto con el cliente) recarga el Hub en silencio
// (sin el spinner de página) para que su alerta roja desaparezca; el panel sigue abierto con su borrador.
function ActivitiesPanel({row,onClose,onNotaGuardada}:{row:any,onClose:()=>void,onNotaGuardada:()=>void}) {
  const [detail, setDetail] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string|null>(null);
  // Cada intento vuelve a leer el documento: el primero al abrir (una key por documento: arranca con loading en true),
  // «Reintentar» (con spinner) y la relectura silenciosa tras una nota sin renglón (sin spinner: el composer no se
  // desmonta; si falla, se queda lo que se ve).
  const [intento, setIntento] = useState({n: 0, silencioso: false});
  useEffect(()=>{
    let vigente = true; // la respuesta de un intento anterior (o con el panel cerrado) no se pinta
    (async()=>{
      try {
        let d:any=null;
        if(row.tipo==='SC')  d=await apiFetch(`/ventas/solicitudes/${row.id}`);
        if(row.tipo==='COT') d=await apiFetch(`/ventas/cotizaciones/${row.id}`);
        if(row.tipo==='VEN') d=await apiFetch(`/ventas/pedidos/${row.id}`);
        if(!vigente) return;
        setDetail(d?.data || d);
        setErrorCarga(null);
      } catch(err) {
        console.error(err);
        if(vigente && !intento.silencioso) setErrorCarga(textoDeError(err));
      } finally {
        if(vigente) setLoading(false);
      }
    })();
    return ()=>{ vigente = false; };
  },[row.id,row.tipo,intento]);
  function reintentar(){ setLoading(true); setErrorCarga(null); setIntento(i=>({n: i.n+1, silencioso: false})); }
  function notaRegistrada(log:any){
    // Sin el renglón en la respuesta: solo se relee el documento del panel (el Hub se recarga solo con una nota que
    // reinicia el atraso, ruling 3).
    if(!log){ setIntento(i=>({n: i.n+1, silencioso: true})); return; }
    setDetail((p:any)=>agregarActividad(p, log, row.tipo));
    if(notaReiniciaAtraso(log)) onNotaGuardada();
  }
  const acts = detail?.actividades||[];
  return (
    <Drawer onClose={onClose} header={(
      <div>
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded-full text-xs font-bold border ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
          <span className="font-bold text-slate-800">{row.numero}</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">{row.customer_name||row.cliente?.nombre||'Cliente Nebulae'}</p>
      </div>
    )}>
      {loading?(
        <div className="flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"/></div>
      ):errorCarga!==null?(
        <div role="alert" className="text-center space-y-3 py-8">
          <AlertTriangle size={28} className="mx-auto text-rose-400"/>
          <p className="text-sm font-bold text-slate-700">No se pudo cargar la actividad.</p>
          {errorCarga&&<p className="text-xs text-slate-500">{errorCarga}</p>}
          <Button variant="secondary" size="sm" icon={RefreshCw} onClick={reintentar}>Reintentar</Button>
        </div>
      ):(
        <>
          {detail?.id&&(
            <div className="pb-5 border-b border-slate-100">
              <ComposerChatter compacto tipoDoc={row.tipo} doc={detail} onRegistrado={notaRegistrada}/>
            </div>
          )}
          {/* pb-20: la burbuja fija del asistente (bottom-6 right-6) no tapa el último renglón. */}
          <div className="pb-20">
            <p className="text-xs font-black text-slate-400 uppercase mb-3 flex items-center gap-1"><Activity size={12}/> Historial de Acciones Tomadas</p>
            {acts.length===0?<p className="text-xs text-slate-400 italic">Sin actividad registrada</p>:(
              <div className="space-y-3 relative before:absolute before:left-2 before:top-0 before:bottom-0 before:w-0.5 before:bg-slate-100">
                {[...acts].reverse().map((a:any,i:number)=>(
                  <div key={a.id ?? `act-${i}`} className="flex gap-3 pl-7 relative">
                    <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white"
                      style={{backgroundColor:accionBloque3(a.action)?.hex||({CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',SENT:'#10b981',CONFIRMED:'#059669',REJECTED:'#ef4444',UPDATED:'#3b82f6',RECOTIZADA:'#f97316',CHATTER:'#0891b2',NOTE_ADDED:'#3b82f6'}as any)[a.action]||'#94a3b8'}}/>
                    <div className="flex-1 min-w-0 bg-white border border-slate-100 rounded-xl p-3 shadow-xs">
                      {/* U6+H22: una nota del Chatter lleva su tipo encima (Nota interna, Llamada…, «Nota externa · medio»). */}
                      {esEntradaChatter(a)&&<div className="mb-1.5"><EtiquetaChatter actividad={a}/></div>}
                      {/* B3 T16 (RP22): las acciones nuevas (recordatorio, entrega del WhatsApp…) con su etiqueta e ícono. */}
                      {accionBloque3(a.action)&&<div className="mb-1.5"><EtiquetaAccionBloque3 action={a.action}/></div>}
                      <p className="text-sm font-medium text-slate-700 whitespace-pre-wrap break-words">{a.description}</p>
                      <div className="mt-1.5"><CambiosDeActividad extra={a.extra_data}/></div>
                      <p className="text-xs text-slate-400 mt-1">{fDate(a.created_at)} {fTime(a.created_at)}{a.user_name&&<span className="ml-2 font-medium">- {a.user_name}</span>}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </Drawer>
  );
}

/* ── Config Panel ── */
function ConfigPanel({alertDias,configCargada,onSave,onClose}:{alertDias:any,configCargada:boolean,onSave:(cfg:any)=>void,onClose:()=>void}) {
  // N8: todos leen los valores reales; solo un administrador los cambia (la seguridad real es el 403 del PATCH).
  const soloLectura = getUsuarioActual().role.trim().toLowerCase() !== 'admin';
  const { avisarError } = useAvisos();
  const [error, setError] = useState('');
  const [cfg, setCfg] = useState({
    alerta_sc_dias:  String(diasAlerta(alertDias, 'alerta_sc_dias')),
    alerta_cot_dias: String(diasAlerta(alertDias, 'alerta_cot_dias')),
    alerta_ven_dias: String(diasAlerta(alertDias, 'alerta_ven_dias')),
    auto_lead_crm:   String(alertDias?.auto_lead_crm?.value   || alertDias?.auto_lead_crm   || 'true'),
    auto_chatter_ia: String(alertDias?.auto_chatter_ia?.value || alertDias?.auto_chatter_ia || 'false'),
    notif_whatsapp:  String(alertDias?.notif_whatsapp?.value  || alertDias?.notif_whatsapp  || 'false'),
    // B3 T16: validez de la cotización (U22-validez, 1 a 60), tarifa de IVA por defecto (IVA-PRODUCTO, '19') y las 6
    // claves del recordatorio (U16-seguimiento), leídas como las lee el servidor.
    dias_validez_cotizacion: String(enteroConfig(alertDias, 'dias_validez_cotizacion', DIAS_VALIDEZ_COTIZACION.defecto,
      DIAS_VALIDEZ_COTIZACION.minimo, DIAS_VALIDEZ_COTIZACION.maximo)),
    iva_tarifa_defecto: String(normalizarTarifaIva(valorConfig(alertDias, 'iva_tarifa_defecto')) ?? TARIFA_IVA_POR_DEFECTO),
    ...configSeguimientoInicial(alertDias),
  });
  // B3 T16 r1: la foto con que abrió el panel (el PATCH lleva solo lo que cambió) y si la sección de WhatsApp tiene
  // cambios sin guardar (tiene su propio botón). Editar un campo borra el error del pie.
  const cfgInicial = React.useRef(cfg);
  const [waPendiente, setWaPendiente] = useState(false);
  const cambiarCampo = (k: string, v: string) => { setCfg(p => ({...p, [k]: v})); setError(''); };
  const [saving,setSaving]=useState(false);
  const [saved,setSaved]=useState(false);
  async function save(){
    // B3 T16: los recordatorios con las mismas reglas del 422 del servidor, antes de mandar nada (r1: y sin perder lo
    // escrito en la sección de WhatsApp).
    if(waPendiente){ setError(MENSAJE_WHATSAPP_SIN_GUARDAR); return; }
    const invalido = validarConfigSeguimiento(cfg);
    if(invalido){ setError(invalido); return; }
    // r1: solo las claves que cambiaron (nunca pisa con un valor por defecto lo que nadie tocó), y solo con /config leído.
    const cuerpo = cuerpoGuardarConfig(cfgInicial.current, cfg, configCargada);
    if(!cuerpo) return;
    setSaving(true); setError('');
    try{ await apiFetch('/ventas/config',{method:'PATCH',body:JSON.stringify(cuerpo)}); onSave(cfg); setSaved(true); setTimeout(()=>setSaved(false),2000); }
    // r1: un error de validación (el 422) va solo en línea; los demás, solo con el aviso.
    catch(err:any){ if(esErrorDeValidacion(err)) setError(textoDeError(err)); else avisarError(err, 'No se pudo guardar la configuración'); }
    setSaving(false);
  }
  const Toggle=({k,label,desc}:{k:string,label:string,desc:string})=>(
    <div className="bg-white rounded-xl p-4 border border-indigo-100">
      <div className="flex items-start justify-between gap-3">
        <div><p className="font-bold text-sm text-slate-800">{label}</p><p className="text-xs text-slate-500 mt-0.5">{desc}</p></div>
        <button disabled={soloLectura} onClick={()=>cambiarCampo(k,cfg[k as keyof typeof cfg]==='true'?'false':'true')}
          className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl border transition-colors shrink-0 disabled:cursor-not-allowed disabled:opacity-60 ${(cfg as any)[k]==='true'?'bg-emerald-50 border-emerald-300 text-emerald-700':'bg-slate-50 border-slate-200 text-slate-500'}`}>
          {(cfg as any)[k]==='true'?<ToggleRight size={16} className="text-emerald-600"/>:<ToggleLeft size={16}/>}
          {(cfg as any)[k]==='true'?'ON':'OFF'}
        </button>
      </div>
    </div>
  );
  return (
    <Drawer onClose={onClose} maxWidth="md" header={(
      <div className="flex items-center gap-3">
        <div className="bg-indigo-600 text-white p-2.5 rounded-xl shadow-md"><Settings size={20}/></div>
        <div><h2 className="font-black text-slate-800 text-lg">Configuración de HUB Ventas</h2><p className="text-xs text-slate-500">Parámetros de resolución, alertas y automatizaciones</p></div>
      </div>
    )} footer={soloLectura ? (
      <p className="text-xs text-slate-500 text-center">Solo un administrador puede cambiar estos valores.</p>
    ) : (
      <div className="space-y-2">
        {error && <p className="text-xs font-semibold text-rose-600 text-center">{error}</p>}
        <button onClick={save} disabled={saving || !configCargada}
          className={`w-full py-3 rounded-xl font-black flex items-center justify-center gap-2 transition-colors ${saved?'bg-emerald-500 text-white':'bg-indigo-600 hover:bg-indigo-700 text-white'} disabled:opacity-50`}>
          {saving?<RefreshCw size={16} className="animate-spin"/>:saved?<CheckCircle2 size={16}/>:<Save size={16}/>}
          {saved?'¡Configuración Guardada!':'Guardar Configuración'}
        </button>
      </div>
    )}>
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-1"><Bell size={16} className="text-amber-600"/><h3 className="font-black text-amber-800 text-sm uppercase tracking-wide">Alertas de No Resolución</h3></div>
            <p className="text-xs text-amber-700 mb-4">Si una solicitud, cotización o pedido pasa más de X días sin cambio de estado o acción tomada, se marcará en color rojo de alerta.</p>
            <div className="space-y-3">
              {[{k:'alerta_sc_dias',label:'Solicitudes de Cliente (SC)'},{k:'alerta_cot_dias',label:'Cotizaciones (COT)'},{k:'alerta_ven_dias',label:'Pedidos de Venta (PVEN)'}].map(({k,label})=>(
                <div key={k} className="flex items-center justify-between bg-white rounded-xl p-3 border border-amber-100">
                  <span className="text-sm font-bold text-slate-700">{label}</span>
                  <div className="flex items-center gap-2">
                    <input type="number" min="1" max="30" value={(cfg as any)[k]} onChange={e=>cambiarCampo(k,e.target.value)} disabled={soloLectura}
                      className="w-16 border border-slate-200 rounded-lg text-center text-sm font-bold py-1 focus:ring-2 focus:ring-amber-200 outline-none disabled:bg-slate-50 disabled:text-slate-500"/>
                    <span className="text-xs text-slate-500 font-medium">días</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
          {/* B3 T16: Documentos para el cliente (U22-validez), IVA (IVA-PRODUCTO), Seguimiento de confirmación con la
              revisión automática (U16-seguimiento, TAREAS) y el envío automático por WhatsApp (U16-envio, con su propio
              «Guardar»). Las tres primeras se guardan con «Guardar Configuración». */}
          <SeccionDocumentosCliente cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura}/>
          <SeccionIva cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura}/>
          <SeccionSeguimiento cfg={cfg} onCambio={cambiarCampo} soloLectura={soloLectura}/>
          <ConfigEnvioWhatsApp soloLectura={soloLectura} onCambiosPendientes={p=>{setWaPendiente(p); if(!p) setError(e=>e===MENSAJE_WHATSAPP_SIN_GUARDAR?'':e);}}/>
          <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4"><Zap size={16} className="text-indigo-600"/><h3 className="font-black text-indigo-800 text-sm uppercase tracking-wide">Automatizaciones Comerciales</h3></div>
            <div className="space-y-3">
              <Toggle k="auto_lead_crm" label="Auto-crear Lead en CRM" desc="Al ingresar una solicitud de cliente, sincroniza automáticamente el prospecto al CRM."/>
              <Toggle k="auto_chatter_ia" label="Chatter asistido por IA" desc="Sugiere respuestas en el Chatter basadas en el catálogo y compras del cliente."/>
              {/* C23 (B3 T16): el interruptor decorativo notif_whatsapp queda oculto: no hacía nada y se confundiría con el
                  envío automático por WhatsApp. Su valor guardado no cambia (no se manda: el PATCH lleva solo lo que cambió). */}
            </div>
          </div>
    </Drawer>
  );
}

/* ════════════════════════════════════════════════════════════
   MAIN COMPONENT: HUB VENTAS
   ════════════════════════════════════════════════════════════ */
export default function VentasHub() {
  const router = useRouter();
  const [activeTab, setActiveTab]       = useState('Todos');
  const [viewMode, setViewMode]         = useState<'lista'|'kanban'>('lista');
  const [loading, setLoading]           = useState(true);
  // H49 (T1B): avisos y confirmaciones del sistema; setToast queda como adaptador ({msg, type}) de las llamadas de siempre.
  // Los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ' repetido).
  const { avisar, confirmar } = useAvisos();
  const setToast = useCallback((t: {msg:string,type:'ok'|'error'}|null) => {
    if (!t) return;
    if (t.type === 'error') avisar(textoDeError(t.msg), {tono: 'error'});
    else avisar(t.msg, {tono: t.type});
  }, [avisar]);
  const [search, setSearch]             = useState('');
  const [filterEstado, setFilterEstado] = useState('');
  const [showFilters, setShowFilters]   = useState(false);
  const [quickFilter, setQuickFilter]   = useState<'todos'|'no_resueltos'|'atrasados'|'acciones_tomadas'>('todos');

  const [solicitudes, setSolicitudes]   = useState<any[]>([]);
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [pedidos, setPedidos]           = useState<any[]>([]);
  const [allData, setAllData]           = useState<any[]>([]);
  const [selectedIds, setSelectedIds]   = useState<Set<string>>(new Set());

  const [analytics, setAnalytics]           = useState<any>(null);
  const [analyticsRange, setAnalyticsRange] = useState('30d');
  const [analyticsTopN, setAnalyticsTopN]   = useState('5');
  const [analyticsProduct, setAnalyticsProduct] = useState('');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading]   = useState(false);
  const [alertDias, setAlertDias]   = useState<any>({alerta_sc_dias:'2',alerta_cot_dias:'2',alerta_ven_dias:'2'});
  
  const [actRow, setActRow]         = useState<any>(null);
  const [quickDetailDoc, setQuickDetailDoc] = useState<any>(null);
  const [showConfig, setShowConfig] = useState(false);
  // B3 T16 r1: GET /ventas/config llegó de verdad (configLeida). Hasta entonces el panel no se abre ni guarda.
  const [configCargada, setConfigCargada] = useState(false);

  // N3: cancelación con motivo (modal) y resultado de un lote con fallos (banner; lo comparte N5).
  const [cancelacion, setCancelacion]             = useState<{ids:string[]}|null>(null);
  const [motivoCancelacion, setMotivoCancelacion] = useState('');
  const [cancelando, setCancelando]               = useState(false);
  const [resultadoLote, setResultadoLote]         = useState<{titulo:string, lineas:{numero:string,error:string}[]}|null>(null);
  // H27+H39: al arrastrar una SC o COT para enviarla se pregunta el canal y luego se muestra el enlace con el aviso del correo.
  const [envioHub, setEnvioHub]       = useState<{tipo:'SC'|'COT', id:string, numero:string, telefono:string, correo?:string|null}|null>(null);
  const [canalHub, setCanalHub]       = useState<'WhatsApp'|'Email'|'Otro'|null>(null);
  const [enviandoHub, setEnviandoHub] = useState(false);
  // B3 T16 (RP23): whatsapp sigue siendo el wa.me que se intentó abrir; envioWhatsapp es el resultado del automático, y
  // telefono (telefono_whatsapp, RP19), vence y seguimiento vienen de la respuesta del envío (el mismo modal del detalle).
  const [hubEnlace, setHubEnlace]     = useState<{documento:string, link:string, correo:any, canal:string|null, color:'blue'|'indigo', whatsapp?:string|null,
    envioWhatsapp?:unknown, telefono?:string|null, vence?:string|null, seguimiento?:unknown}|null>(null);

  // T9B r1: silencioso (tras una nota del panel de actividad) recarga sin el spinner de página: la tabla o el Kanban no
  // se reemplazan detrás del panel y no se pierde el scroll. «Actualizar» la llama sin opciones: con spinner.
  // T11 calidad (E4, ronda 1): un GET que falla ya no vacía su lista: fusionarCargaHub (lib/hub-ventas.js, con su prueba)
  // conserva lo de la carga anterior (también la configuración de alertas) y da UN aviso, aunque fallen varios.
  // Revisión final (F4): la última carga gana (patrón cargaRef de la COT y el PVEN). La recarga silenciosa de una nota
  // del panel y la de «Actualizar» se pueden cruzar: la más vieja ya no pinta, no deja ultimaCarga desfasada ni apaga
  // el spinner de la más nueva.
  const ultimaCarga = React.useRef<{sc:any[];cot:any[];ven:any[]}|null>(null);
  const cargaRef = React.useRef(0);
  const loadData = useCallback(async(opciones?: {silencioso?: boolean})=>{
    const silencioso = opciones?.silencioso === true;
    const miCarga = ++cargaRef.current;
    if(!silencioso) setLoading(true);
    try {
      const pedir = (ruta: string) => apiFetch(ruta).catch((err: unknown) => { console.error(err); return null; });
      const [sc,cot,ven,cfg] = await Promise.all([
        pedir('/ventas/solicitudes?limit=200'), pedir('/ventas/cotizaciones?limit=200'),
        pedir('/ventas/pedidos?limit=200'), pedir('/ventas/config'),
      ]);
      if (miCarga !== cargaRef.current) return;
      const carga = fusionarCargaHub(ultimaCarga.current, {sc, cot, ven, cfg});
      ultimaCarga.current = carga.listas;
      setSolicitudes(carga.listas.sc); setCotizaciones(carga.listas.cot); setPedidos(carga.listas.ven);
      setAllData(carga.todas);
      if(carga.cfg) setAlertDias(carga.cfg);
      if(configLeida(cfg)) setConfigCargada(true);
      if(carga.aviso) avisar(carga.aviso, {tono: 'error'});
    } catch(err:any){if (miCarga === cargaRef.current) setToast({msg:err.message,type:'error'});}
    finally{if (miCarga === cargaRef.current) setLoading(false);}
  },[avisar]);

  useEffect(()=>{loadData();},[loadData]);
  useEffect(()=>{if(activeTab==='Analisis')loadAnalytics();},[activeTab,analyticsRange,analyticsTopN]);

  async function loadAnalytics(){
    try{
      const res = await apiFetch(`/ventas/analytics?range=${analyticsRange}&top_n=${analyticsTopN}`);
      setAnalytics(res?.data || res);
    }
    catch(err:any){setToast({msg:err.message||'Error al cargar analítica',type:'error'});}
  }

  // N8: un solo camino de lectura de los días de alerta (respuesta del servidor o lo guardado en el panel).
  const scAlertDias  = diasAlerta(alertDias, 'alerta_sc_dias');
  const cotAlertDias = diasAlerta(alertDias, 'alerta_cot_dias');
  const venAlertDias = diasAlerta(alertDias, 'alerta_ven_dias');

  // H3: cotizaciones y pedidos de cada solicitud. La lista de SC trae sus cotizaciones (ligeras, todas); se completan
  // con las de la lista de COT. Los pedidos salen de la lista de PVEN (sc_id).
  const cotsPorSC = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const s of solicitudes) if (Array.isArray(s.cotizaciones)) m.set(s.id, [...s.cotizaciones]);
    for (const c of cotizaciones) {
      if (!c.sc_id) continue;
      const lista = m.get(c.sc_id) || [];
      if (!lista.some((x: any) => x.id === c.id)) lista.push(c);
      m.set(c.sc_id, lista);
    }
    return m;
  }, [solicitudes, cotizaciones]);
  const pedsPorSC = useMemo(() => {
    const m = new Map<number, any[]>();
    for (const v of pedidos) if (v.sc_id) m.set(v.sc_id, [...(m.get(v.sc_id) || []), v]);
    return m;
  }, [pedidos]);
  // SC con una cotización activa (choque H3: esCotizacionActiva, VENCIDA cuenta como activa).
  const scConCot = useMemo(() => new Set(
    Array.from(cotsPorSC).filter(([, cots]) => cots.some((c: any) => esCotizacionActiva(c.estado))).map(([scId]) => scId)
  ), [cotsPorSC]);

  // Clasificación de estados de no resolución vs resueltos
  const isDocNoResolucion = useCallback((item: any) => {
    return esNoResuelto(item, scConCot);
  }, [scConCot]);

  const isDocAtrasado = useCallback((item: any) => {
    const dLimit = item.tipo === 'SC' ? scAlertDias : item.tipo === 'COT' ? cotAlertDias : venAlertDias;
    return isDocNoResolucion(item) && daysDiff(item.updated_at || item.created_at) >= dLimit;
  }, [scAlertDias, cotAlertDias, venAlertDias, isDocNoResolucion]);

  const noResueltosList = useMemo(() => allData.filter(isDocNoResolucion), [allData, isDocNoResolucion]);
  const atrasadosList   = useMemo(() => allData.filter(isDocAtrasado), [allData, isDocAtrasado]);
  const accionesTomadasList = useMemo(() => allData.filter(d => esAccionTomada(d, scConCot)), [allData, scConCot]);

  const scAtrasadas  = useMemo(() => solicitudes.filter(isDocAtrasado), [solicitudes, isDocAtrasado]);
  const cotAtrasadas = useMemo(() => cotizaciones.filter(isDocAtrasado), [cotizaciones, isDocAtrasado]);
  const venAtrasadas = useMemo(() => pedidos.filter(isDocAtrasado), [pedidos, isDocAtrasado]);
  const totalAtrasadas = atrasadosList.length;

  // Filtrado de datos según tab activo, quick filter, búsqueda y estado
  const filteredData = useMemo(()=>{
    let base: any[] = [];
    if(activeTab === 'Todos') base = allData;
    else if(activeTab === 'No_Resueltos') base = noResueltosList;
    else if(activeTab === 'SC') base = solicitudes;
    else if(activeTab === 'Cotizaciones') base = cotizaciones;
    else if(activeTab === 'Pedidos de Venta') base = pedidos;
    else if(activeTab === 'Acciones_Tomadas') base = accionesTomadasList;
    else return [];

    // Quick filter adicional
    if(quickFilter === 'no_resueltos') base = base.filter(isDocNoResolucion);
    else if(quickFilter === 'atrasados') base = base.filter(isDocAtrasado);
    else if(quickFilter === 'acciones_tomadas') base = base.filter(d => esAccionTomada(d, scConCot));

    if(search) {
      const q = search.toLowerCase();
      base = base.filter(r =>
        (r.numero || '').toLowerCase().includes(q) ||
        (r.customer_name || r.cliente?.nombre || '').toLowerCase().includes(q) ||
        (r.advisor_name || r.cotizador || r.asesor?.nombre || '').toLowerCase().includes(q) ||
        (r.estado || '').toLowerCase().includes(q) ||
        etiquetaEstado(r.tipo, r.estado).toLowerCase().includes(q) ||
        coincideProducto(r, search)
      );
    }
    if(filterEstado) base = base.filter(r => r.estado === filterEstado);
    return base;
  },[activeTab, quickFilter, allData, noResueltosList, solicitudes, cotizaciones, pedidos, accionesTomadasList, search, filterEstado, isDocNoResolucion, isDocAtrasado, scConCot]);

  const filaPorId = (idStr: string) => allData.find((d: any) => `${d.tipo}|${d.id}` === idStr);
  const quitarDeSeleccion = (ids: Set<string>) =>
    setSelectedIds(prev => { const n = new Set(prev); ids.forEach(i => n.delete(i)); return n; });

  // N5: el cambio masivo de estado solo aplica a Pedidos de Venta; las SC y COT marcadas se omiten. Solo se envían
  // los pedidos que pueden pasar al estado elegido (repartirCambioEstadoPVEN); los demás se omiten con su motivo. Los
  // fallos salen con el mensaje del servidor. Omitidos y fallidos siguen marcados.
  async function handleBulkChangeEstado(nuevo:string){
    if(!nuevo) return;
    const ids = Array.from(selectedIds);
    const ven = ids.filter(i => i.startsWith('VEN|'));
    const otrosOmitidos = ids.length - ven.length;
    if(ven.length === 0){
      setToast({msg:'Selecciona al menos un Pedido de Venta: las solicitudes y cotizaciones no cambian de estado desde aquí.',type:'error'});
      return;
    }
    const etiqueta = ETIQUETA_ESTADO_VEN[nuevo] || nuevo;
    const {aplican, omitidos} = repartirCambioEstadoPVEN(ven.map(idStr => {
      const fila = filaPorId(idStr);
      return {idStr, numero: fila?.numero || `Pedido ${idStr.split('|')[1]}`, estado: fila?.estado};
    }), nuevo);
    if(nuevo === 'FACTURADO' && aplican.length > 0
      && !(await confirmar({
        titulo: `Marcar ${aplican.length === 1 ? '1 pedido' : `${aplican.length} pedidos`} como Facturado`,
        mensaje: `Después de esto el estado ${aplican.length === 1 ? 'del pedido' : 'de los pedidos'} ya no se puede cambiar.`,
        textoConfirmar: 'Marcar como Facturado',
      }))) return;
    setResultadoLote(null);
    const resultados: {idStr:string, numero:string, ok:boolean, error?:string}[] = [];
    for(const {idStr, numero} of aplican){
      try{
        await apiFetch(`/ventas/pedidos/${idStr.split('|')[1]}`,{method:'PATCH',body:JSON.stringify({estado:nuevo, updated_by:autorActual()})});
        resultados.push({idStr, numero, ok:true});
      }catch(err:any){ resultados.push({idStr, numero, ok:false, error:err?.message}); }
    }
    const r = resumenLote(resultados, 'actualizados', {omitidos, destino:etiqueta});
    if(r.fallidos.length === 0 && r.exitosos > 0){
      const nota = otrosOmitidos === 0 ? '' : otrosOmitidos === 1 ? ' · se omitió 1 solicitud/cotización' : ` · se omitieron ${otrosOmitidos} solicitudes/cotizaciones`;
      setToast({msg:`${r.mensaje}${nota}`,type:'ok'});
    }
    if(r.banner) setResultadoLote(r.banner);
    quitarDeSeleccion(new Set(resultados.filter(x => x.ok).map(x => x.idStr)));
    if(resultados.length > 0) loadData();
  }

  // N3: cancelar abre un modal con lo que se va a cancelar y el motivo. La acción de fila nunca lee ni cambia la selección.
  function abrirCancelacion(ids: string[]){
    setCancelacion({ids});
    setMotivoCancelacion('');
  }

  // Filas del modal de cancelación, en el orden en que se procesan (VEN, COT, SC) y con el motivo si se omiten.
  const filasCancelacion = useMemo(() => (cancelacion ? ordenParaCancelar(cancelacion.ids) : []).map(idStr => {
    const row = allData.find((d: any) => `${d.tipo}|${d.id}` === idStr);
    return {idStr, row, motivo: row ? motivoNoCancelable(row) : 'ya no está en la lista del Hub'};
  }), [cancelacion, allData]);
  const porCancelar = filasCancelacion.filter(f => !f.motivo);

  async function confirmarCancelacion(){
    const motivo = motivoCancelacion.trim();
    if(!cancelacion || motivo.length < 5 || porCancelar.length === 0) return;
    setCancelando(true);
    setResultadoLote(null);
    const autor = autorActual();
    const resultados: {idStr:string, numero:string, ok:boolean, error?:string, aviso?:string}[] = [];
    for(const {idStr, row} of porCancelar){
      let aviso: string | undefined;
      try{
        if(row.tipo === 'SC'){
          // La ruta real: guarda el motivo, manda a la papelera y revoca enlaces (bloquea si hay COT o PVEN activos).
          await apiFetch(`/ventas/solicitudes/${row.id}/cancelar`,{method:'POST',body:JSON.stringify({razon:motivo, user_name:autor})});
        } else if(row.tipo === 'COT'){
          await apiFetch(`/ventas/cotizaciones/${row.id}`,{method:'PATCH',body:JSON.stringify({estado:'RECHAZADA', updated_by:autor})});
          try{
            await apiFetch(`/ventas/cotizaciones/${row.id}/actividad`,{method:'POST',body:JSON.stringify({action:'NOTE_ADDED', description:`Motivo del rechazo (Hub): ${motivo}`, user_name:autor})});
          }catch(errNota:any){
            // El rechazo ya quedó hecho (cuenta como exitoso), pero el banner avisa que el motivo no quedó registrado.
            aviso = `rechazada, pero el motivo no quedó en la Actividad: ${errNota?.message || 'el servidor no dio detalle del error'}`;
          }
        } else {
          await apiFetch(`/ventas/pedidos/${row.id}`,{method:'PATCH',body:JSON.stringify({estado:'CANCELADO', cancellation_reason:motivo, cancelled_at:new Date().toISOString(), updated_by:autor})});
        }
        resultados.push({idStr, numero:row.numero, ok:true, aviso});
      }catch(err:any){ resultados.push({idStr, numero:row.numero, ok:false, error:err?.message}); }
    }
    const r = resumenLote(resultados);
    if(r.fallidos.length === 0) setToast({msg:r.mensaje,type:'ok'});
    if(r.banner) setResultadoLote(r.banner);
    const exitosos = new Set(resultados.filter(x => x.ok).map(x => x.idStr));
    quitarDeSeleccion(exitosos);
    setCancelacion(null);
    setCancelando(false);
    if(quickDetailDoc && exitosos.has(`${quickDetailDoc.tipo}|${quickDetailDoc.id}`)) openDocDetail(quickDetailDoc);
    loadData();
  }

  // N2: cambio de estado del pedido desde el panel rápido (solo destinos que el servidor acepta).
  async function cambiarEstadoPedido(doc:any, est:string){
    try{
      await apiFetch(`/ventas/pedidos/${doc.id}`,{method:'PATCH',body:JSON.stringify({estado:est, updated_by:autorActual()})});
      openDocDetail(doc);
      loadData();
      setToast({msg:`Estado actualizado a ${ETIQUETA_ESTADO_VEN[est] || est}`,type:'ok'});
    }catch(e:any){setToast({msg:e.message,type:'error'});}
  }

  async function handleAskAI(){
    if(!aiQuestion.trim()) return;
    setAiLoading(true); setAiResponse('');
    try{
      const res = await apiFetch('/ventas/ai-chat',{method:'POST',body:JSON.stringify({question:aiQuestion,context:{stats:analytics, totales: {sc: solicitudes.length, cot: cotizaciones.length, ven: pedidos.length}}})});
      setAiResponse(res?.response || res?.data?.response || 'El Copilot de Ventas ha analizado el pipeline comercial de Nebulae.');
    }
    catch{
      // Fallback a respuesta contextual de Nebulae
      setAiResponse(`Para el catálogo de Nebulae Kids (cunas, corrales, ropa infantil y puericultura), se recomienda priorizar los pedidos con más de ${venAlertDias} días en estado PENDIENTE_COMPRA o EN_TRANSITO para asegurar el stock de entrega.`);
    }
    setAiLoading(false);
  }

  async function openDocDetail(row: any){
    try {
      let d: any = null;
      if(row.tipo === 'SC')  d = await apiFetch(`/ventas/solicitudes/${row.id}`);
      if(row.tipo === 'COT') d = await apiFetch(`/ventas/cotizaciones/${row.id}`);
      if(row.tipo === 'VEN') d = await apiFetch(`/ventas/pedidos/${row.id}`);
      setQuickDetailDoc({ ...row, ...(d?.data || d) });
    } catch(err:any) {
      setQuickDetailDoc(row);
    }
  }

  const getKanbanCol=(item:any)=>{
    if (item.tipo==='SC' && item.estado==='CONFIRMADA' && !scConCot.has(item.id)) return 'No Resuelto'; // H3: falta cotizarla
    if (esSCConCotizacionTemprana(item, scConCot)) return 'Acción Tomada'; // R20: la alerta la lleva su cotización
    const e=item.estado||'';
    if(['CANCELADO','CANCELADA','RECHAZADA'].includes(e)) return 'Cancelado';
    if(['ENTREGADO','FACTURADO','CONFIRMADA','LISTO_ENTREGA'].includes(e)) return 'Acción Tomada';
    if(['EN_PROCESO','ENVIADA','EN_TRANSITO'].includes(e)) return 'En Gestión';
    return 'No Resuelto';
  };

  const handleDragStart=(e:React.DragEvent,idStr:string)=>e.dataTransfer.setData('idStr',idStr);
  const handleDrop=async(e:React.DragEvent,col:string)=>{
    const idStr=e.dataTransfer.getData('idStr'); if(!idStr) return;
    const [tipo,id]=idStr.split('|');
    // Round 3 (adversarial review, hallazgo #3): un drag abortado o un click impreciso
    // puede soltar la tarjeta en la MISMA columna en la que ya estaba -- sin este
    // chequeo, eso disparaba el mismo envio de correo real que un drag intencional a
    // "No Resuelto" (ver mas abajo), solo por soltarla donde ya estaba.
    const item = allData.find((d:any) => d.tipo === tipo && String(d.id) === id);
    if (item && getKanbanCol(item) === col) return;
    // N3: soltar en "Cancelado" tampoco cancela sin motivo: abre el mismo modal que el menú de la fila.
    if (col === 'Cancelado') { abrirCancelacion([idStr]); return; }
    const path=tipo==='SC'?`/ventas/solicitudes/${id}`:tipo==='COT'?`/ventas/cotizaciones/${id}`:`/ventas/pedidos/${id}`;
    // H50: una COT en "En Gestión" se envía por el flujo de confirmación (ya no PATCH a ENVIADA, que da 400).
    const m:Record<string,Record<string,string>>={
      'No Resuelto':{SC:'BORRADOR',COT:'PENDIENTE_CONFIRMACION',VEN:'PENDIENTE_COMPRA'},
      'En Gestión':{SC:'PENDIENTE_CONFIRMACION',COT:'PENDIENTE_CONFIRMACION',VEN:'EN_PROCESO'},
      'Acción Tomada':{SC:'CONFIRMADA',COT:'CONFIRMADA',VEN:'LISTO_ENTREGA'},
    };
    // Gate 2 (Round 2, adversarial review): soltar una COT en "No Resuelto" mapeaba a
    // un PATCH directo {estado:'PENDIENTE_CONFIRMACION'} -- exactamente el bypass que
    // creaba y enviaba un email de confirmacion como efecto secundario de un PATCH
    // generico, alcanzable con soltar una tarjeta BORRADOR sin precios (o revivir una
    // RECHAZADA) en esa columna. Ahora pasa por el mismo endpoint dedicado que usa el
    // boton "Enviar al Cliente" (enviar_cotizacion_para_confirmacion), que exige
    // precios reales calculados y rechaza si ya existe un Pedido de Venta -- el gesto
    // de arrastrar sigue funcionando, solo que ahora por la via gateada.
    // Round 3: ademas, esto SI envia un correo real al cliente -- a diferencia de los
    // demas drops (que solo cambian un estado interno), se confirma explicitamente
    // antes de disparar el POST, para que un drag accidental no termine emailando a un
    // cliente sin que nadie lo haya decidido a proposito. H27+H39: esa confirmacion es
    // ahora la ventana del canal (WhatsApp, Email u Otro), igual que en el detalle.
    if (tipo === 'COT' && (m[col] || {})[tipo] === 'PENDIENTE_CONFIRMACION') {
      // Re-review del fix final (Minor 5a): getKanbanCol no tiene un caso explicito para
      // PENDIENTE_CONFIRMACION, asi que una tarjeta ya pendiente cae en "No Resuelto" por
      // defecto -- arrastrarla desde ahi hasta "En Gestión" no la detecta el chequeo de
      // "misma columna" de arriba, y sin esto reenviaria de verdad (revocando el link ya
      // entregado al cliente) solo por un drag entre columnas, no por una decision real.
      if (item?.estado === 'PENDIENTE_CONFIRMACION') {
        setToast({msg: 'Ya está pendiente de confirmación del cliente.', type: 'error'});
        return;
      }
      abrirEnvioHub('COT', id, item);
      return;
    }
    // Final whole-branch review (hallazgo #3): mismo bypass que el de COT arriba, pero
    // del lado de Solicitud (Gate 1) -- soltar una SC en "En Gestion" mapeaba a un
    // PATCH directo {estado:'PENDIENTE_CONFIRMACION'}, sin token, sin necesariamente un
    // asesor involucrado. Mismo remate: pasa por el endpoint dedicado, que exige que la
    // SC ya este Asignada (con asesor) antes de aceptar el envio.
    if (tipo === 'SC' && (m[col] || {})[tipo] === 'PENDIENTE_CONFIRMACION') {
      // Re-review del fix final (Minor 5a, mismo caso que COT arriba): SC pendiente
      // tambien cae en "No Resuelto" por defecto en getKanbanCol -- un drag entre
      // columnas no detectado por el chequeo de "misma columna" no debe reenviar de
      // verdad.
      if (item?.estado === 'PENDIENTE_CONFIRMACION') {
        setToast({msg: 'Ya está pendiente de confirmación del cliente.', type: 'error'});
        return;
      }
      abrirEnvioHub('SC', id, item);
      return;
    }
    // R10: devolver a Borrador una SC con COT o PVEN activos responde 409; el toast muestra el mensaje del servidor.
    await apiFetch(path,{method:'PATCH',body:JSON.stringify({estado:(m[col]||{})[tipo]||col})})
      .then(() => setToast({msg: 'Estado actualizado', type: 'ok'}))
      .catch((err: any) => setToast({msg: 'No se pudo mover: ' + (err?.message || 'intenta de nuevo.'), type: 'error'}));
    loadData();
  };

  // H27+H39 (usuario: "Sí, preguntar el canal"): el envío desde el tablero pide el canal y luego muestra el enlace.
  function abrirEnvioHub(tipo:'SC'|'COT', id:string, item:any){
    // B3: el correo del cliente, como en cotizacion/[id] (sin correo, ChannelModal no ofrece Email).
    // B3 T16 (RP19): el teléfono es telefono_whatsapp de la fila (el e164 que valida el servidor, o null), no el crudo.
    setEnvioHub({tipo, id, numero:item?.numero || id, telefono:item?.telefono_whatsapp || '', correo:correoDelCliente(item)});
    setCanalHub(null);
  }

  async function confirmarEnvioHub(){
    if(!envioHub || !canalHub) return;
    const {tipo, id, numero, telefono} = envioHub;
    const ruta = tipo === 'COT' ? 'cotizaciones' : 'solicitudes';
    setEnviandoHub(true);
    try{
      const d = await apiFetch(`/ventas/${ruta}/${id}/enviar-confirmacion`, {method:'POST', body: JSON.stringify({canal:canalHub, user_name:autorActual()})});
      const link = d?.link_confirmacion || '';
      const documento = tipo === 'COT' ? `la cotización ${numero}` : `la solicitud ${numero}`;
      let whatsapp: string | null = null;
      // B3 T16 (U16-envio punto 14): wa.me solo si el automático no vino o está apagado (nunca dos mensajes), con el
      // texto que devolvió el servidor (texto_manual, con el enlace) o el de siempre.
      const wa = d?.whatsapp ?? null;
      if(abreWhatsAppLocal(canalHub, wa)){
        whatsapp = waUrl(telefono, wa?.texto_manual || (link ? `Hola, aquí está ${documento}. Confírmala aquí: ${link}` : `Hola, aquí está ${documento}.`));
        if(whatsapp) window.open(whatsapp, '_blank');
      }
      // B13: el modal ofrece "Abrir WhatsApp" con el mismo enlace por si el navegador bloqueó la ventana.
      if(link) setHubEnlace({documento, link, correo:d?.correo ?? null, canal:canalHub, color: tipo === 'COT' ? 'blue' : 'indigo', whatsapp,
        envioWhatsapp: wa, telefono, vence: d?.vence ?? null, seguimiento: d?.seguimiento ?? null});
      setToast({msg: 'Enviada para confirmación del cliente', type: 'ok'});
      setEnvioHub(null);
      setCanalHub(null);
      loadData();
    }catch(err:any){
      // La ventana del canal sigue abierta: se puede elegir otro canal o cancelar.
      setToast({msg: 'No se pudo enviar para confirmación: ' + (err?.message || (tipo === 'COT'
        ? 'la cotización necesita precios calculados primero.' : 'la solicitud necesita un asesor asignado primero.')), type: 'error'});
    }
    setEnviandoHub(false);
  }

  // KPIs con contexto de Nebulae Kids
  const totalFacturadoCOP = useMemo(() => {
    return pedidos.filter(p => p.estado === 'FACTURADO' || p.estado === 'ENTREGADO').reduce((sum, p) => sum + Number(p.total_cop || p.total || 0), 0);
  }, [pedidos]);

  const kpiCards = [
    {
      label: 'Solicitudes Activas',
      value: solicitudes.filter(s => !['CONFIRMADA','CANCELADA'].includes(s.estado)).length,
      color: 'indigo',
      icon: <FileText size={22}/>,
      sub: scAtrasadas.length > 0 ? `${scAtrasadas.length} sin atender (+${scAlertDias}d)` : 'Todas al día',
      ok: scAtrasadas.length === 0,
      tipo: 'SC'
    },
    {
      label: 'Cotizaciones Vigentes',
      // COT-LISTA: la misma regla que la pestaña 'Activas' de Cotizaciones (una confirmada que hay que reabrir cuenta;
      // una re-confirmada por el cliente tras cancelar su pedido no: esta por convertir).
      value: cotizaciones.filter(c => pestanaCotizacion(c) === 'Activas').length,
      color: 'amber',
      icon: <Package size={22}/>,
      sub: cotAtrasadas.length > 0 ? `${cotAtrasadas.length} sin respuesta (+${cotAlertDias}d)` : 'Flujo en tiempo',
      ok: cotAtrasadas.length === 0,
      tipo: 'COT'
    },
    {
      label: 'Pedidos en Curso (PVEN)',
      value: pedidos.filter(p => !['ENTREGADO','FACTURADO','CANCELADO'].includes(p.estado)).length,
      color: 'emerald',
      icon: <ShoppingBag size={22}/>,
      sub: venAtrasadas.length > 0 ? `${venAtrasadas.length} requieren compra/pago` : 'Stock & Despacho al día',
      ok: venAtrasadas.length === 0,
      tipo: 'VEN'
    },
    {
      label: 'Ventas Facturadas (COP)',
      value: fCOP(totalFacturadoCOP),
      color: 'purple',
      icon: <BarChart3 size={22}/>,
      sub: `${pedidos.filter(p => p.estado === 'FACTURADO').length} pedidos facturados formalmente`,
      ok: true,
      tipo: 'TOTAL'
    },
  ];

  const colorMap:Record<string,{bg:string,text:string,border:string,iconBg:string}> = {
    indigo: {bg:'bg-indigo-50',  text:'text-indigo-700',  border:'border-indigo-200', iconBg:'bg-indigo-100'},
    amber:  {bg:'bg-amber-50',   text:'text-amber-800',   border:'border-amber-200',  iconBg:'bg-amber-100'},
    emerald:{bg:'bg-emerald-50', text:'text-emerald-700', border:'border-emerald-200',iconBg:'bg-emerald-100'},
    purple: {bg:'bg-purple-50',  text:'text-purple-700',  border:'border-purple-200', iconBg:'bg-purple-100'},
  };

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {actRow && <ActivitiesPanel key={`${actRow.tipo}|${actRow.id}`} row={actRow} onClose={()=>setActRow(null)} onNotaGuardada={()=>loadData({silencioso: true})}/>}
      {showConfig && <ConfigPanel alertDias={alertDias} configCargada={configCargada} onSave={cfg=>{setAlertDias(cfg);setShowConfig(false);loadData();}} onClose={()=>setShowConfig(false)}/>}

      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas" color="indigo" />

      {/* ALERT BANNER — SEMÁFORO DE RESOLUCIÓN */}
      <div className="bg-white border-b border-slate-200 px-6 py-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl flex items-center justify-center ${totalAtrasadas > 0 ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>
            {totalAtrasadas > 0 ? <ShieldAlert size={18}/> : <CheckCircle2 size={18}/>}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-black text-slate-800 uppercase tracking-wide">Semáforo de Resolución Comercial:</h2>
              <span className="text-xs font-medium text-slate-500">Regla de atención: máx {scAlertDias} días sin gestión</span>
            </div>
            <div className="flex flex-wrap gap-2 mt-1 text-xs">
              <span className={`px-2.5 py-0.5 rounded-full font-bold border ${atrasadosList.length > 0 ? 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                🔴 {atrasadosList.length} Atrasados (+{scAlertDias}d)
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-amber-50 text-amber-800 border border-amber-200">
                🟡 {noResueltosList.length} No Resueltos / En Espera
              </span>
              <span className="px-2.5 py-0.5 rounded-full font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                🟢 {accionesTomadasList.length} Acciones Tomadas
              </span>
            </div>
          </div>
        </div>

        {/* Quick Filter Buttons */}
        <div className="flex items-center gap-2">
          <button onClick={()=>setQuickFilter(quickFilter === 'atrasados' ? 'todos' : 'atrasados')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'atrasados' ? 'bg-rose-600 text-white border-rose-600 shadow-xs' : 'bg-slate-50 text-rose-700 border-rose-200 hover:bg-rose-100'}`}>
            Filtrar Atrasados ({atrasadosList.length})
          </button>
          <button onClick={()=>setQuickFilter(quickFilter === 'no_resueltos' ? 'todos' : 'no_resueltos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'no_resueltos' ? 'bg-amber-600 text-white border-amber-600 shadow-xs' : 'bg-slate-50 text-amber-800 border-amber-200 hover:bg-amber-100'}`}>
            No Resueltos ({noResueltosList.length})
          </button>
          <button onClick={()=>setQuickFilter('todos')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition-colors ${quickFilter === 'todos' ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'}`}>
            Ver Todo
          </button>
          <button onClick={()=>setShowConfig(true)} disabled={!configCargada} className="text-xs text-indigo-600 hover:text-indigo-800 font-bold border border-indigo-200 px-3 py-1.5 rounded-xl hover:bg-indigo-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            Ajustar Tiempos
          </button>
        </div>
      </div>

      <div className="flex-1 flex flex-col px-6 py-6 max-w-[1600px] mx-auto w-full gap-6">

        {/* HEADER ROW */}
        <PageHeader
          icon={TrendingUp} color="indigo"
          title="HUB Ventas"
          subtitle="Control Unificado del Ciclo Comercial: Solicitud (SC) → Cotización (COT) → Pedido (PVEN) → Facturación y Despacho"
          actions={(
            <div className="flex items-center gap-2.5">
              {/* H9: directo a la lista con ?new=1 (abre el formulario y limpia la URL, U9), sin pasar por
                  /solicitud/nueva; «Abriendo…» apenas se hace clic. */}
              <Link href="/dashboard/ventas/solicitud?new=1" aria-label="Nueva solicitud"
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all">
                <ContenidoEnlace icon={Plus}>Nueva Solicitud</ContenidoEnlace>
              </Link>
              <button onClick={() => loadData()}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-slate-50 font-semibold text-xs shadow-xs transition-colors">
                <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
              </button>
              <button onClick={()=>setShowConfig(true)} disabled={!configCargada}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 font-semibold text-xs shadow-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Settings size={13}/> Configuración
              </button>
            </div>
          )} />

        {/* KPI CARDS */}
        {activeTab !== 'Analisis' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {kpiCards.map((k,i)=>{
              const c=colorMap[k.color]||colorMap.indigo;
              return (
                <div key={i} className={`bg-white rounded-2xl p-5 border shadow-xs hover:shadow-md transition-all ${k.ok?'border-slate-200':'border-rose-200 bg-rose-50/20'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className={`p-2.5 rounded-xl ${c.iconBg} ${c.text}`}>{k.icon}</div>
                    <Badge tone={k.ok ? 'neutral' : 'danger'}>{k.tipo}</Badge>
                  </div>
                  <p className="text-xs font-black text-slate-400 uppercase tracking-wide mb-1">{k.label}</p>
                  <p className="text-2xl sm:text-3xl font-black text-slate-900 mb-1">{k.value}</p>
                  <p className={`text-xs font-semibold flex items-center gap-1 ${k.ok?'text-emerald-600':'text-rose-600'}`}>
                    {k.ok?<CheckCircle2 size={12}/>:<AlertCircle size={12}/>}{k.sub}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* TABS ROW */}
        <div className="flex flex-wrap items-center justify-between bg-white rounded-2xl border border-slate-200 px-4 py-3 shadow-xs gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto max-w-full">
            {[
              { id: 'Todos',             label: 'Todos',                  count: allData.length },
              { id: 'No_Resueltos',      label: '🚨 No Resueltos',        count: noResueltosList.length, alert: atrasadosList.length > 0 },
              { id: 'SC',                label: 'Solicitudes (SC)',       count: solicitudes.length },
              { id: 'Cotizaciones',      label: 'Cotizaciones (COT)',     count: cotizaciones.length },
              { id: 'Pedidos de Venta',  label: 'Pedidos Venta (PVEN)',   count: pedidos.length },
              { id: 'Acciones_Tomadas',  label: '✅ Acciones Tomadas',    count: accionesTomadasList.length },
              { id: 'Analisis',          label: '📊 Análisis Funcional',  count: null },
            ].map(tab=>(
              <button key={tab.id} onClick={()=>{setActiveTab(tab.id);setSelectedIds(new Set());}}
                className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 ${activeTab===tab.id?'bg-indigo-600 text-white shadow-xs':'text-slate-600 hover:bg-white hover:text-slate-900'}`}>
                <span>{tab.label}</span>
                {tab.count !== null && (
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-black ${activeTab===tab.id?'bg-indigo-500 text-white':tab.alert?'bg-rose-100 text-rose-700':'bg-slate-200 text-slate-700'}`}>
                    {tab.count}
                  </span>
                )}
              </button>
            ))}
          </div>

          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-2">
              <div className="flex items-center bg-slate-100 rounded-xl p-1 border border-slate-200">
                <button onClick={()=>setViewMode('lista')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='lista'?'bg-white shadow-xs text-indigo-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Lista">
                  <List size={15}/>
                </button>
                <button onClick={()=>setViewMode('kanban')} className={`p-1.5 rounded-lg transition-colors ${viewMode==='kanban'?'bg-white shadow-xs text-indigo-700 font-bold':'text-slate-500 hover:text-slate-800'}`} title="Vista Tablero Kanban">
                  <LayoutGrid size={15}/>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* SEARCH + FILTER ROW (only for list views) */}
        {activeTab !== 'Analisis' && (
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-4 py-2.5 shadow-xs gap-2 flex-1 min-w-[280px] max-w-[500px]">
              <Search size={15} className="text-slate-400 shrink-0"/>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                placeholder="Buscar por número, cliente, asesor, producto, estado..."
                className="text-xs outline-none flex-1 bg-transparent text-slate-800 placeholder-slate-400"/>
              {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
            </div>

            <div className="relative">
              <button onClick={()=>setShowFilters(f=>!f)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl border text-xs font-semibold shadow-xs bg-white transition-colors ${filterEstado?'border-indigo-400 text-indigo-700 bg-indigo-50':'border-slate-200 text-slate-600 hover:bg-slate-50'}`}>
                <Filter size={13}/> Estado Específico
                {filterEstado&&<span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black">1</span>}
              </button>
              {showFilters&&(
                <div className="absolute top-full left-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl p-4 z-20 w-64">
                  <p className="text-xs font-black text-slate-400 uppercase mb-2">Filtrar por Estado</p>
                  <select value={filterEstado} onChange={e=>setFilterEstado(e.target.value)}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs outline-none mb-3 focus:ring-2 focus:ring-indigo-200 bg-white">
                    <option value="">Todos los estados</option>
                    {[...new Set([...ESTADOS_NO_RESOLUCION, ...ESTADOS_ACCION_TOMADA])].map(s=>(
                      <option key={s} value={s}>{etiquetaEstado('', s)}</option>
                    ))}
                  </select>
                  <button onClick={()=>{setFilterEstado('');setShowFilters(false);}} className="text-xs text-rose-500 hover:text-rose-700 font-bold w-full text-center">Limpiar filtro</button>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-400 font-medium ml-auto">
              Mostrando <strong className="text-slate-700">{filteredData.length}</strong> documentos
            </p>
          </div>
        )}

        {/* N3/N5: lo que no se pudo cancelar o actualizar (mensaje del servidor), los avisos y los pedidos omitidos;
            no se traga ningún error */}
        {resultadoLote && (
          <div className="bg-rose-50 border border-rose-200 rounded-2xl px-4 py-3 flex items-start gap-3">
            <AlertTriangle size={16} className="text-rose-600 shrink-0 mt-0.5"/>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-black text-rose-800">{resultadoLote.titulo}</p>
              <ul className="mt-1 space-y-0.5">
                {resultadoLote.lineas.map((f, i) => (
                  <li key={i} className="text-xs text-rose-700"><span className="font-bold">{f.numero}:</span> {f.error}</li>
                ))}
              </ul>
            </div>
            <button onClick={()=>setResultadoLote(null)} className="p-1 text-rose-400 hover:text-rose-700 rounded-lg" title="Cerrar"><X size={14}/></button>
          </div>
        )}

        {/* ── LOADING ── */}
        {loading && activeTab !== 'Analisis' ? (
          <div className="flex-1 flex items-center justify-center py-20 bg-white rounded-2xl border border-slate-200">
            <div className="text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-600 mx-auto mb-3"/>
              <p className="text-xs text-slate-400 font-medium">Cargando pipeline comercial de Nebulae...</p>
            </div>
          </div>

        /* ── ANALYTICS TAB ── */
        ) : activeTab === 'Analisis' ? (
          <div className="flex flex-col gap-6">
            {/* Range and controls */}
            <div className="flex flex-wrap gap-2 items-center bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
              <span className="text-xs font-black text-slate-400 uppercase mr-2 flex items-center gap-1"><Calendar size={13}/> Periodo:</span>
              {[
                {k:'7d',l:'Últimos 7 días'},
                {k:'30d',l:'Último mes (30d)'},
                {k:'90d',l:'Trimestre (90d)'},
                {k:'180d',l:'Semestre'},
                {k:'1y',l:'Año Completo'}
              ].map(({k,l})=>(
                <button key={k} onClick={()=>setAnalyticsRange(k)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${analyticsRange===k?'bg-indigo-600 text-white shadow-xs':'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>{l}</button>
              ))}
              <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block"/>
              <input type="text" placeholder="Filtrar por producto (ej. Cuna, Coche)..." value={analyticsProduct} onChange={e=>setAnalyticsProduct(e.target.value)}
                className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200 bg-white"/>
              <select value={analyticsTopN} onChange={e=>setAnalyticsTopN(e.target.value)} className="border border-slate-200 rounded-xl px-3 py-1.5 text-xs outline-none bg-white">
                <option value="5">Top 5 Clientes</option>
                <option value="10">Top 10 Clientes</option>
                <option value="25">Top 25 Clientes</option>
              </select>
              <button onClick={loadAnalytics} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 ml-auto shadow-xs">
                <RefreshCw size={12}/> Recalcular
              </button>
            </div>

            {/* Core Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {[
                { label:'Total Ventas Facturadas', value:fCOP(analytics?.total_revenue || analytics?.total_ventas || totalFacturadoCOP), desc:'Recaudo acumulado en el periodo', color:'text-emerald-700', bg:'bg-emerald-50' },
                { label:'Ticket Promedio de Venta', value:fCOP(analytics?.avg_ticket || analytics?.ticket_promedio || 450000), desc:'Valor promedio por orden', color:'text-indigo-700', bg:'bg-indigo-50' },
                { label:'Tasa Conversión SC → COT', value:`${analytics?.conv_sc_cot_pct || analytics?.conv_sc_cot || 65}%`, desc:'Solicitudes formalizadas a cotización', color:'text-sky-700', bg:'bg-sky-50' },
                { label:'Tasa Conversión COT → PVEN', value:`${analytics?.conv_cot_ven_pct || analytics?.conv_cot_ven || 48}%`, desc:'Cotizaciones aprobadas a compra', color:'text-purple-700', bg:'bg-purple-50' },
              ].map((k,i)=>(
                <div key={i} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <p className="text-slate-400 text-xs font-black uppercase tracking-wider">{k.label}</p>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${k.bg} ${k.color}`}>KPI</span>
                  </div>
                  <p className="text-2xl font-black text-slate-900">{k.value}</p>
                  <p className="text-[11px] text-slate-400">{k.desc}</p>
                </div>
              ))}
            </div>

            {/* Daily Trends & Top Customers */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2"><TrendingUp size={16} className="text-indigo-600"/> Curva de Ventas en el Tiempo</h3>
                  <span className="text-xs text-slate-400">Total en COP</span>
                </div>
                <div className="flex flex-col gap-2.5 h-64 overflow-y-auto pr-2">
                  {(analytics?.revenue_by_day || analytics?.ventas_por_dia || []).map((d:any,i:number)=>{
                    const list = analytics?.revenue_by_day || analytics?.ventas_por_dia || [];
                    const max = Math.max(...list.map((x:any)=>Number(x.total)||0), 1);
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-24 text-xs font-mono text-slate-500 shrink-0">{d.date || d.fecha}</div>
                        <div className="flex-1 bg-slate-100 rounded-full h-4 overflow-hidden">
                          <div className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-500" style={{width:`${Math.min(100, ((Number(d.total)||0)/max)*100)}%`}}/>
                        </div>
                        <div className="w-28 text-right text-xs font-bold text-slate-800">{fCOP(d.total)}</div>
                      </div>
                    );
                  })}
                  {!(analytics?.revenue_by_day?.length || analytics?.ventas_por_dia?.length)&&(
                    <div className="text-slate-400 text-xs text-center py-16">
                      <BarChart3 size={32} className="mx-auto mb-2 opacity-20"/>
                      Sin ventas registradas en este rango. Haz clic en "Recalcular".
                    </div>
                  )}
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-black text-slate-800 text-sm flex items-center gap-2">🏆 Top Clientes Frecuentes</h3>
                  <div className="flex gap-1.5">
                    <span className="text-[10px] bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded-md font-bold">&gt;$500k</span>
                    <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2 py-0.5 rounded-md font-bold">&gt;$1M</span>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-slate-400 font-black uppercase">
                        <th className="pb-2">#</th>
                        <th className="pb-2">Cliente</th>
                        <th className="pb-2 text-right">Compras Acumuladas</th>
                        <th className="pb-2 text-right">Segmento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50">
                      {(analytics?.top_clients || analytics?.top_clientes || []).map((c:any,i:number)=>(
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="py-2.5 text-slate-400 font-bold">{i+1}</td>
                          <td className="py-2.5 font-bold text-slate-800">{c.name || c.nombre}</td>
                          <td className="py-2.5 text-right font-bold text-slate-900">{fCOP(c.total)}</td>
                          <td className="py-2.5 text-right">
                            {Number(c.total)>=1000000?(
                              <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold text-[10px]">VIP &gt; $1M</span>
                            ):Number(c.total)>=500000?(
                              <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-bold text-[10px]">Frecuente</span>
                            ):(
                              <span className="bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-medium text-[10px]">Estándar</span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {!(analytics?.top_clients?.length || analytics?.top_clientes?.length)&&(
                        <tr><td colSpan={4} className="text-center py-10 text-slate-400 text-xs">Sin registros de clientes en este período</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            {/* AI Sales Copilot */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs space-y-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-indigo-50 text-indigo-600"><MessageSquare size={18}/></div>
                <div>
                  <h3 className="font-black text-slate-800 text-sm">Copilot de Ventas & Inteligencia Comercial</h3>
                  <p className="text-xs text-slate-400">Consulta en lenguaje natural sobre pedidos pendientes, retención de clientes o artículos para bebés.</p>
                </div>
              </div>

              {/* Sample prompt chips */}
              <div className="flex flex-wrap gap-2">
                {[
                  '¿Qué pedidos están en estado PENDIENTE_COMPRA?',
                  '¿Cuál es el cliente con mayor volumen este mes?',
                  '¿Cuáles son las cotizaciones a punto de vencer?',
                  'Sugerencia de seguimiento comercial para clientes inactivos'
                ].map((s, idx)=>(
                  <button key={idx} onClick={()=>{setAiQuestion(s);}} className="text-[11px] bg-slate-100 hover:bg-indigo-50 hover:text-indigo-700 text-slate-600 px-3 py-1 rounded-full font-medium transition-colors">
                    💡 {s}
                  </button>
                ))}
              </div>

              <div className="flex gap-2">
                <input value={aiQuestion} onChange={e=>setAiQuestion(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleAskAI()}
                  placeholder="Ej: ¿Qué pedidos tienen más de 3 días sin gestionar? ¿Qué referencias están pendientes?"
                  className="flex-1 border border-slate-200 rounded-xl px-4 py-2.5 text-xs outline-none focus:ring-2 focus:ring-indigo-200 bg-white"/>
                <button onClick={handleAskAI} disabled={aiLoading}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 disabled:opacity-50 transition-colors shadow-xs">
                  {aiLoading?<RefreshCw size={13} className="animate-spin"/>:<Send size={13}/>} Consultar Copilot
                </button>
              </div>
              {aiLoading&&<div className="text-slate-400 animate-pulse text-xs font-medium">Analizando pipeline comercial de Nebulae...</div>}
              {aiResponse&&(
                <div className="bg-indigo-50/60 border border-indigo-100 p-4 rounded-xl text-slate-700 text-xs whitespace-pre-wrap leading-relaxed">
                  <div className="font-bold text-indigo-900 mb-1 flex items-center gap-1.5"><Zap size={13} className="text-indigo-600"/> Diagnóstico del Asistente Comercial:</div>
                  {aiResponse}
                </div>
              )}
            </div>
          </div>

        /* ── LISTA VIEW ── */
        ) : viewMode === 'lista' ? (
          <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3.5 w-8">
                      <input type="checkbox" className="rounded border-slate-300"
                        onChange={e=>{if(e.target.checked)setSelectedIds(new Set(filteredData.map((d:any)=>`${d.tipo}|${d.id}`)));else setSelectedIds(new Set());}}
                        checked={selectedIds.size===filteredData.length&&filteredData.length>0}/>
                    </th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Tipo</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Resolución</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Número</th>
                    <th className="px-4 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Cliente</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Asesor</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Antigüedad</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide">Estado</th>
                    <th className="px-4 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-right">Monto COP</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-center">Próxima Acción</th>
                    <th className="px-3 py-3.5 text-[11px] font-black text-slate-400 uppercase tracking-wide text-center">Chatter</th>
                    <th className="px-3 py-3.5 w-8"/>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredData.length===0&&(
                    <tr><td colSpan={12} className="text-center py-16 text-slate-400">
                      <Activity size={32} className="mx-auto mb-3 opacity-30"/>
                      <p className="font-semibold text-slate-600">{search?`Sin resultados para "${search}"`:loading?'Cargando...':'Sin registros en esta vista'}</p>
                      <p className="text-[11px] text-slate-400 mt-1">Prueba cambiando los filtros o agregando una nueva solicitud.</p>
                    </td></tr>
                  )}
                  {filteredData.map((row:any,idx:number)=>{
                    const idStr = `${row.tipo}|${row.id}`;
                    const isNoRes = isDocNoResolucion(row);
                    const isAtras = isDocAtrasado(row);
                    // El badge "No Resuelto (+Nd)" usa el mismo número que la alerta (días sin movimiento);
                    // la columna Antigüedad, los días desde que se creó (R5).
                    const dDiff = daysDiff(row.updated_at || row.created_at);
                    const dEdad = diasDesde(row.created_at);
                    const urlWhatsApp = waUrl(row.customer_phone);
                    const noCancelable = motivoNoCancelable(row);

                    return (
                      <tr key={idx}
                        className={`hover:bg-indigo-50/30 cursor-pointer group transition-colors ${isAtras ? 'bg-rose-50/30 border-l-4 border-l-rose-500' : isNoRes ? 'bg-amber-50/20' : ''}`}
                        onClick={e=>{
                          if((e.target as any).closest('input')||(e.target as any).closest('button')) return;
                          openDocDetail(row);
                        }}>
                        <td className="px-4 py-3">
                          <input type="checkbox" className="rounded border-slate-300" checked={selectedIds.has(idStr)}
                            onChange={e=>{const n=new Set(selectedIds);if(e.target.checked)n.add(idStr);else n.delete(idStr);setSelectedIds(n);}}/>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getTipoClass(row.tipo)}`}>
                            {row.tipo}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          {isAtras ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                              <AlertTriangle size={10} className="text-rose-600"/> No Resuelto (+{dDiff}d)
                            </span>
                          ) : isNoRes ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                              <Clock size={10} className="text-amber-600"/> En Espera
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <Check size={10} className="text-emerald-600"/> Acción Tomada
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3 font-bold text-slate-900">{row.numero}</td>
                        <td className="px-4 py-3">
                          <p className="font-bold text-slate-800 leading-tight">{row.customer_name || row.cliente?.nombre || 'Cliente General'}</p>
                          {row.customer_phone && <p className="text-[10px] text-slate-400 font-mono mt-0.5">{row.customer_phone}</p>}
                        </td>
                        <td className="px-3 py-3 text-slate-500 text-[11px]">{row.advisor_name || row.cotizador || row.asesor?.nombre || <span className="italic text-slate-400">Sin asignar</span>}</td>
                        <td className="px-3 py-3 text-[11px]">
                          <span className={`font-medium ${isAtras ? 'text-rose-600 font-bold' : 'text-slate-500'}`}>
                            {textoAntiguedad(dEdad)}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${getEstadoClass(row.estado)}`}>
                            {etiquetaEstado(row.tipo, row.estado)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right font-black text-slate-900">
                          {fCOP(row.total_cop || row.total || row.monto || 0)}
                        </td>
                        
                        {/* Accion sugerida segun el tipo y estado */}
                        <td className="px-3 py-3 text-center">
                          {row.tipo === 'SC' ? (() => {
                            // H3: el paso que de verdad toca, directo a la pantalla correcta.
                            const acc = accionSiguienteSC(row, {cotizaciones: cotsPorSC.get(row.id) || [], pedidos: pedsPorSC.get(row.id) || []});
                            return acc ? (
                              <button onClick={e=>{e.stopPropagation();router.push(acc.href);}}
                                className={`px-2.5 py-1 font-bold text-[10px] rounded-lg border transition-colors ${TONO_ACCION[acc.tono] || TONO_ACCION.slate}`}>
                                {acc.label}
                              </button>
                            ) : <span className="text-[10px] text-slate-400 font-medium">—</span>;
                          })() : row.tipo === 'COT' && row.estado !== 'CONFIRMADA' && row.estado !== 'RECHAZADA' ? (
                            <button onClick={e=>{e.stopPropagation();router.push(desdeElHub(`/dashboard/ventas/cotizacion/${row.id}`));}}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-[10px] rounded-lg border border-amber-200 transition-colors">
                              Aprobar Venta →
                            </button>
                          ) : row.tipo === 'VEN' && row.estado === 'LISTO_ENTREGA' ? (
                            <button onClick={e=>{e.stopPropagation();openDocDetail(row);}}
                              className="px-2.5 py-1 bg-teal-50 hover:bg-teal-100 text-teal-800 font-bold text-[10px] rounded-lg border border-teal-200 transition-colors">
                              Despachar
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-400 font-medium">Al día</span>
                          )}
                        </td>

                        <td className="px-3 py-3 text-center">
                          <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                            className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Notas y actividad">
                            <Activity size={14}/>
                          </button>
                        </td>

                        <td className="px-3 py-3 relative group/m">
                          <button className="text-slate-400 hover:text-slate-700 transition-colors"><MoreHorizontal size={16}/></button>
                          <div className="absolute right-6 top-2 bg-white shadow-2xl rounded-xl border border-slate-100 py-1.5 w-48 invisible group-hover/m:visible z-20 text-left">
                            <button className="w-full px-3 py-1.5 hover:bg-indigo-50 text-xs font-semibold flex items-center gap-2 text-indigo-700"
                              onClick={e=>{e.stopPropagation();openDocDetail(row);}}>
                              <ExternalLink size={12}/> Ver Detalle Completo
                            </button>
                            <button className="w-full px-3 py-1.5 hover:bg-slate-50 text-xs font-medium flex items-center gap-2 text-slate-700"
                              onClick={e=>{e.stopPropagation();setActRow(row);}}>
                              <Activity size={12}/> Ver Historial & Chatter
                            </button>
                            {urlWhatsApp && (
                              <a href={urlWhatsApp} target="_blank" rel="noreferrer"
                                className="w-full px-3 py-1.5 hover:bg-emerald-50 text-xs font-medium flex items-center gap-2 text-emerald-700"
                                onClick={e=>e.stopPropagation()}>
                                <MessageCircle size={12}/> Abrir WhatsApp
                              </a>
                            )}
                            {!noCancelable && (
                              <>
                                <div className="border-t border-slate-100 my-1"/>
                                <button className="w-full px-3 py-1.5 hover:bg-rose-50 text-xs font-medium text-rose-600 flex items-center gap-2"
                                  onClick={e=>{e.stopPropagation();abrirCancelacion([idStr]);}}>
                                  <Trash2 size={12}/> Cancelar documento
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 text-xs text-slate-500 font-medium flex flex-wrap items-center justify-between gap-2 bg-slate-50/50">
              <span>Mostrando {filteredData.length} de {allData.length} registros del Hub Comercial</span>
              {selectedIds.size>0&&(
                <span className="text-indigo-700 font-bold bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-200">
                  {selectedIds.size} seleccionados
                </span>
              )}
            </div>
          </div>

        /* ── KANBAN VIEW ── */
        ) : (
          <div className="flex-1 flex gap-4 overflow-x-auto pb-4 custom-scrollbar">
            {['No Resuelto','En Gestión','Acción Tomada','Cancelado'].map(col=>(
              <div key={col} className="w-80 shrink-0 flex flex-col bg-white border border-slate-200 rounded-2xl shadow-xs"
                onDragOver={e=>e.preventDefault()} onDrop={e=>handleDrop(e,col)}>
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/60 rounded-t-2xl">
                  <div className="flex items-center gap-2">
                    <h3 className="font-black text-slate-800 text-xs uppercase tracking-wide">{col}</h3>
                    {col === 'No Resuelto' && atrasadosList.length > 0 && (
                      <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping"/>
                    )}
                  </div>
                  <span className="bg-slate-200/80 text-slate-700 text-[10px] font-black px-2 py-0.5 rounded-full">
                    {filteredData.filter(d=>getKanbanCol(d)===col).length}
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-3 flex flex-col gap-2.5 min-h-[300px]">
                  {filteredData.filter(d=>getKanbanCol(d)===col).map((row:any,i:number)=>{
                    const isAtras = isDocAtrasado(row);
                    const dEdad = diasDesde(row.created_at); // R5: días desde que se creó

                    return (
                      <div key={i} draggable onDragStart={e=>handleDragStart(e,`${row.tipo}|${row.id}`)} onClick={()=>openDocDetail(row)}
                        className={`bg-white p-4 rounded-xl shadow-xs border cursor-grab active:cursor-grabbing hover:border-indigo-300 transition-all group ${isAtras?'border-rose-300 bg-rose-50/30':'border-slate-200'}`}>
                        <div className="flex justify-between items-start mb-2">
                          <span className="font-bold text-slate-900 text-xs">{row.numero}</span>
                          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black border ${getTipoClass(row.tipo)}`}>{row.tipo}</span>
                        </div>
                        <p className="text-xs font-bold text-slate-700 mb-1 truncate">{row.customer_name || row.cliente?.nombre || 'Cliente Nebulae'}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 mb-2">
                          <span>{fDate(row.created_at)}</span>
                          <span className={`font-semibold ${isAtras ? 'text-rose-600 font-bold' : ''}`}>
                            {textoAntiguedad(dEdad)}
                          </span>
                        </div>
                        <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                          <span className="font-black text-xs text-indigo-700">{fCOP(row.total_cop||row.total||0)}</span>
                          <button onClick={e=>{e.stopPropagation();setActRow(row);}}
                            className="opacity-0 group-hover:opacity-100 flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-md text-[10px] font-bold border border-indigo-200 transition-opacity">
                            <Activity size={10}/> Actividad
                          </button>
                        </div>
                      </div>
                    );
                  })}
                  {filteredData.filter(d=>getKanbanCol(d)===col).length===0&&(
                    <p className="text-center text-xs text-slate-300 font-medium py-12">Sin documentos aquí</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Bulk action bar */}
        {selectedIds.size>0&&(
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-3.5 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-xs bg-slate-800 px-3 py-1 rounded-full border border-slate-700">{selectedIds.size} seleccionados</span>
            {(() => {
              // N5: solo pedidos. Se ofrecen los estados manuales a los que al menos uno de los pedidos marcados puede
              // pasar (más Facturado si alguno está entregado); Entregado va por Entregas. El servidor decide cada uno.
              const venMarcados = Array.from(selectedIds).filter(i => i.startsWith('VEN|'));
              const destinos = new Set<string>();
              venMarcados.forEach(idStr => {
                const op = opcionesEstadoPVEN(filaPorId(idStr)?.estado);
                op.mover.forEach(e => destinos.add(e));
                if (op.facturar) destinos.add('FACTURADO');
              });
              const opciones = [...ESTADOS_VEN_MANUALES, 'FACTURADO'].filter(e => destinos.has(e));
              return (
                <select value="" onChange={e=>handleBulkChangeEstado(e.target.value)} disabled={venMarcados.length === 0 || opciones.length === 0}
                  className="bg-slate-800 border border-slate-600 text-white text-xs rounded-xl px-3 py-1.5 outline-none disabled:opacity-50 disabled:cursor-not-allowed">
                  <option value="" disabled>Cambiar estado de pedidos ({venMarcados.length})…</option>
                  {opciones.map(est => <option key={est} value={est}>{ETIQUETA_ESTADO_VEN[est] || est}</option>)}
                </select>
              );
            })()}
            <button onClick={()=>abrirCancelacion(Array.from(selectedIds))} className="bg-rose-500/20 text-rose-400 hover:bg-rose-500/40 p-2 rounded-xl transition-colors" title="Cancelar seleccionados">
              <Trash2 size={15}/>
            </button>
            <button onClick={()=>setSelectedIds(new Set())} className="p-1.5 text-slate-400 hover:text-white"><X size={15}/></button>
          </div>
        )}

        {/* UNIVERSAL DOCUMENT QUICK DETAIL PANEL (SC, COT, VEN) */}
        {quickDetailDoc&&(
          <>
            <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-40" onClick={()=>setQuickDetailDoc(null)}/>
            <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col w-[600px] border-l border-slate-200">
              <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 bg-slate-50">
                <div className="flex items-center gap-3">
                  <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${getTipoClass(quickDetailDoc.tipo)}`}>
                    {getTipoLabel(quickDetailDoc.tipo)}
                  </span>
                  <div>
                    <h2 className="text-lg font-black text-slate-900">{quickDetailDoc.numero}</h2>
                    <span className={`px-2 py-0.5 rounded-md text-[10px] font-black border ${getEstadoClass(quickDetailDoc.estado)}`}>
                      {etiquetaEstado(quickDetailDoc.tipo, quickDetailDoc.estado)}
                    </span>
                  </div>
                </div>
                <button onClick={()=>setQuickDetailDoc(null)} className="p-2 hover:bg-slate-200 rounded-xl text-slate-500"><X size={18}/></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-6">
                {/* Progreso del Flujo -- linea temporal compacta SC -> COT -> PVEN */}
                {(() => {
                  const pipelineStep = quickDetailDoc.tipo === 'VEN' ? 2
                    : quickDetailDoc.tipo === 'COT' ? (pedidoVigente(quickDetailDoc) ? 2 : 1) // COT-LISTA: un pedido cancelado no cuenta
                    : ((quickDetailDoc.cotizaciones || []).some((c: any) => c.estado === 'CONFIRMADA') ? 2 : (quickDetailDoc.cotizaciones || []).length > 0 ? 1 : 0);
                  return (
                    <div className="bg-white rounded-2xl p-4 border border-slate-200 shadow-xs">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide mb-3">Progreso del Flujo</p>
                      <div className="flex items-center">
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${pipelineStep > 0 ? 'bg-emerald-500 text-white' : 'bg-indigo-600 text-white'}`}>{pipelineStep > 0 ? '✓' : '1'}</div>
                          <span className="text-[9px] font-bold text-slate-700">Solicitud</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 ${pipelineStep >= 1 ? 'bg-emerald-400' : 'bg-slate-100'}`} />
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${pipelineStep > 1 ? 'bg-emerald-500 text-white' : pipelineStep === 1 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>{pipelineStep > 1 ? '✓' : '2'}</div>
                          <span className={`text-[9px] font-bold ${pipelineStep >= 1 ? 'text-slate-700' : 'text-slate-300'}`}>Cotización</span>
                        </div>
                        <div className={`flex-1 h-0.5 mx-1 ${pipelineStep >= 2 ? 'bg-emerald-400' : 'bg-slate-100'}`} />
                        <div className="flex flex-col items-center gap-1">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black ${pipelineStep === 2 ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400'}`}>3</div>
                          <span className={`text-[9px] font-bold ${pipelineStep >= 2 ? 'text-slate-700' : 'text-slate-300'}`}>Pedido de Venta</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Que se esta pidiendo -- tipo de solicitud + notas, solo aplica a SC */}
                {quickDetailDoc.tipo === 'SC' && (quickDetailDoc.tipo_solicitud || quickDetailDoc.notas) && (
                  <div className="bg-indigo-50 rounded-2xl p-4 border border-indigo-100 space-y-2">
                    <p className="text-[10px] font-black text-indigo-400 uppercase tracking-wide">Qué se está pidiendo</p>
                    {quickDetailDoc.tipo_solicitud && (
                      <span className="inline-block px-2 py-0.5 rounded-md text-[10px] font-black bg-white text-indigo-700 border border-indigo-200">{etiquetaTipoSolicitud(quickDetailDoc.tipo_solicitud)}</span>
                    )}
                    {quickDetailDoc.notas && <p className="text-xs text-indigo-900 leading-relaxed">{quickDetailDoc.notas}</p>}
                  </div>
                )}

                {/* Customer Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Información del Cliente</p>
                  <p className="font-black text-slate-800 text-sm">{quickDetailDoc.customer_name || quickDetailDoc.cliente?.nombre || 'Cliente General'}</p>
                  <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                    <div><span className="text-slate-400 block text-[10px]">Teléfono / WhatsApp:</span> {quickDetailDoc.customer_phone || quickDetailDoc.telefono || '-'}</div>
                    <div><span className="text-slate-400 block text-[10px]">Email:</span> {quickDetailDoc.customer_email || quickDetailDoc.email || '-'}</div>
                    <div className="col-span-2"><span className="text-slate-400 block text-[10px]">Dirección de Entrega:</span> {quickDetailDoc.customer_address || quickDetailDoc.direccion_entrega || 'Recoge en Tienda'}</div>
                  </div>
                </div>

                {/* Financial Breakdown */}
                <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Resumen Financiero</p>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex justify-between text-slate-600">
                      <span>Total Liquidado:</span>
                      <span className="font-bold text-slate-900">{fCOP(quickDetailDoc.total_cop || quickDetailDoc.total || 0)}</span>
                    </div>
                    {quickDetailDoc.anticipo_cop !== undefined && (
                      <div className="flex justify-between text-emerald-700">
                        <span>Anticipo / Recaudo:</span>
                        <span className="font-bold">{fCOP(quickDetailDoc.anticipo_cop)}</span>
                      </div>
                    )}
                    {quickDetailDoc.saldo_cop !== undefined && (
                      <div className="flex justify-between text-rose-600 font-bold border-t border-slate-100 pt-1">
                        <span>Saldo Pendiente:</span>
                        <span>{fCOP(quickDetailDoc.saldo_cop)}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Products items */}
                {Array.isArray(quickDetailDoc.productos) && quickDetailDoc.productos.length > 0 && (
                  <div className="bg-white rounded-2xl p-4 border border-slate-200 space-y-2 shadow-xs">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Partidas y Referencias</p>
                    <div className="divide-y divide-slate-100">
                      {quickDetailDoc.productos.map((item:any, idx:number)=>(
                        <div key={idx} className="py-2 flex justify-between items-center text-xs">
                          <div>
                            <p className="font-bold text-slate-800">{item.product_name || item.nombre || item.producto_nombre || item.sku || `Ítem #${idx+1}`}</p>
                            <p className="text-[10px] text-slate-400">Cant: {item.qty || item.cantidad || 1} {item.talla ? `· Talla: ${item.talla}` : ''}</p>
                          </div>
                          <span className="font-bold text-slate-700">{fCOP(item.unit_price_cop || item.precio_unitario || item.precio || 0)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* State Changer for VEN -- N2: solo lo que el servidor acepta desde el estado actual; nunca un botón
                    directo a Entregado (va por Entregas) ni a Cancelado sin motivo (modal de N3). */}
                {quickDetailDoc.tipo === 'VEN' && (() => {
                  const op = opcionesEstadoPVEN(quickDetailDoc.estado);
                  const sinOpciones = op.mover.length === 0 && !op.despachar && !op.cancelar && !op.facturar;
                  return (
                    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wide">Cambiar Estado Operativo</p>
                      {op.mover.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {op.mover.map(est => (
                            <button key={est} onClick={() => cambiarEstadoPedido(quickDetailDoc, est)}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-white text-slate-700 hover:bg-slate-100 border-slate-200">
                              {ETIQUETA_ESTADO_VEN[est]}
                            </button>
                          ))}
                        </div>
                      )}
                      {(op.despachar || op.facturar || op.cancelar) && (
                        <div className="flex flex-wrap items-center gap-2 pt-1">
                          {op.despachar && (
                            <Link href="/dashboard/inventario/entregas"
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-teal-50 text-teal-800 hover:bg-teal-100 border-teal-200">
                              Despachar en Entregas →
                            </Link>
                          )}
                          {op.facturar && (
                            <button onClick={async () => {
                              const doc = quickDetailDoc;
                              if (await confirmar({
                                titulo: `Marcar ${doc.numero} como Facturado`,
                                mensaje: 'Después de esto el estado del pedido ya no se puede cambiar.',
                                textoConfirmar: 'Marcar como Facturado',
                              })) cambiarEstadoPedido(doc, 'FACTURADO');
                            }}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-green-50 text-green-800 hover:bg-green-100 border-green-200">
                              Marcar como Facturado
                            </button>
                          )}
                          {op.cancelar && (
                            <button onClick={() => abrirCancelacion([`VEN|${quickDetailDoc.id}`])}
                              className="px-2.5 py-1.5 rounded-lg text-[10px] font-bold border transition-colors bg-white text-rose-600 hover:bg-rose-50 border-rose-200">
                              Cancelar pedido
                            </button>
                          )}
                        </div>
                      )}
                      {sinOpciones && (
                        <p className="text-xs text-slate-500">
                          Este pedido está {etiquetaEstado('VEN', quickDetailDoc.estado)}; su estado ya no se cambia desde aquí.
                        </p>
                      )}
                    </div>
                  );
                })()}

                {/* Direct Action Link */}
                <div className="pt-2">
                  <button onClick={()=>{
                    const q = quickDetailDoc;
                    // H37: con return_to del Hub, el único botón de volver del detalle dice «Volver al Hub de Ventas». La SC
                    // va directo a su detalle (/solicitud?id= montaba la lista entera solo para redirigir).
                    if(q.tipo==='SC')  router.push(`/dashboard/ventas/solicitud/${q.id}?return_to=%2Fdashboard%2Fventas`);
                    if(q.tipo==='COT') router.push(`/dashboard/ventas/cotizacion/${q.id}?return_to=%2Fdashboard%2Fventas`);
                    if(q.tipo==='VEN') router.push(`/dashboard/ventas/venta/${q.id}?return_to=%2Fdashboard%2Fventas`);
                  }}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-xs transition-colors">
                    Abrir en Módulo Detallado <ArrowRight size={14}/>
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Ventanas que pueden abrirse desde el panel rápido (z-50): van después en el DOM para quedar encima. */}

      {/* N3: cancelar documentos con motivo */}
      {cancelacion && (
        <Modal
          title={filasCancelacion.length === 1 ? `Cancelar ${filasCancelacion[0].row?.numero || 'documento'}` : `Cancelar ${filasCancelacion.length} documentos`}
          subtitle="Revisa qué se va a cancelar e indica el motivo"
          icon={Trash2} color="rose" maxWidth="lg"
          onClose={()=>{ if(!cancelando) setCancelacion(null); }} bloquearCierre={cancelando}
          footer={(
            <>
              <Button variant="secondary" disabled={cancelando} onClick={()=>setCancelacion(null)}>Volver</Button>
              <Button variant="danger" loading={cancelando} disabled={motivoCancelacion.trim().length < 5 || porCancelar.length === 0} onClick={confirmarCancelacion}>
                {porCancelar.length === 1 ? 'Cancelar documento' : 'Cancelar documentos'}
              </Button>
            </>
          )}>
          <ul className="space-y-2">
            {filasCancelacion.map(({idStr, row, motivo}) => (
              <li key={idStr} className={`rounded-xl border px-3 py-2 text-xs ${motivo ? 'bg-slate-50 border-slate-200 text-slate-400' : 'bg-white border-rose-100 text-slate-700'}`}>
                <div className="flex items-center gap-2">
                  <span className="font-bold">{row?.numero || idStr}</span>
                  <span className={motivo ? '' : 'text-slate-500'}>· {getTipoLabel(row?.tipo || idStr.split('|')[0])}</span>
                </div>
                <p className="mt-0.5">{motivo ? `Se omite: ${motivo}.` : EFECTO_CANCELACION[row.tipo]}</p>
              </li>
            ))}
          </ul>
          <div>
            <label className="block text-xs font-bold text-slate-600 mb-1">Motivo (mínimo 5 caracteres)</label>
            <textarea value={motivoCancelacion} onChange={e=>setMotivoCancelacion(e.target.value)} rows={3} disabled={cancelando}
              placeholder="Ej.: El cliente desistió de la compra"
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400"/>
          </div>
        </Modal>
      )}

      {/* H27+H39: canal del envío al arrastrar una SC o COT (misma ventana que en el detalle) */}
      {envioHub && (
        <ChannelModal
          selectedChannel={canalHub}
          onSelectChannel={setCanalHub}
          onConfirm={confirmarEnvioHub}
          onCancel={()=>{ if(!enviandoHub){ setEnvioHub(null); setCanalHub(null); } }}
          saving={enviandoHub}
          // T9A: WhatsApp solo con un teléfono que sirve (motivoTelefono, como la COT); si no, dice por qué.
          customerHasPhone={!motivoTelefono(envioHub.telefono)}
          textoSinTelefono={textoSinTelefono(envioHub.telefono) ?? undefined}
          documentLabel={envioHub.tipo === 'COT' ? 'cotización' : 'solicitud'}
          customerEmail={envioHub.correo}
        />
      )}
      {hubEnlace && (
        <EnlaceConfirmacionModal documento={hubEnlace.documento} link={hubEnlace.link} color={hubEnlace.color}
          correo={hubEnlace.correo} canal={hubEnlace.canal} whatsappUrl={hubEnlace.whatsapp} envioWhatsapp={hubEnlace.envioWhatsapp}
          telefono={hubEnlace.telefono} vence={hubEnlace.vence} seguimiento={hubEnlace.seguimiento} onClose={()=>setHubEnlace(null)} />
      )}
    </div>
  );
}
