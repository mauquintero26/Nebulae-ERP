"use client";
import { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Target, Plus, RefreshCw, Megaphone, CheckCircle2, Tag, Edit2, Trash2, PauseCircle, Play, Search, Copy } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import {
  SubNav, PageHeader, Toast, Modal, Button, FranjaKpis, TarjetaKpi, useAvisos,
} from '@/components/ui';
import { AvisoFuente } from '@/components/ui/AvisoFuente';
import { useRolActual } from '@/components/ui/useRolActual';
import { BarraTabla, TablaEstandar, useEstadoTabla, useListadoCliente, usePreferenciasTabla } from '@/components/tabla';
import type { ColumnaTabla } from '@/components/tabla';
import { MKT_NAV } from '../mkt-nav';
import { accesoMarketing } from '@/lib/roles';
import { avisoDeFuente } from '@/lib/avisos';
import { barraPresupuesto, datosDeRespuesta, lecturaLeadsCampana, tarjetasCampana } from '@/lib/kpis';
import { textoDiaCorto } from '@/lib/fechas-colombia';
import { humanizarCodigo } from '@/lib/estados-pedido';
import { formatoPesos } from '@/lib/pesos';
import { accesoresDeOrden, estadoDelTotal } from '@/lib/tabla';
import { CAJA_SIN_PERMISO, RESERVA_BOTON_IA } from '@/lib/design-system';
// B4 T23B: el dinero con el formato del catálogo (formatoPesos: '$1.062.523', sin el espacio duro de Intl).
const fCOP = (v: number) => formatoPesos(v || 0);
// m11: la fecha de una campaña es un día de calendario (fechaCorta), no un instante que se corre a la víspera en Colombia.
// B4 T24 (FINAL-m30): textoDiaCorto de fechas-colombia.js (el día corto o '—', como las demás pantallas).
const fDate = (d: unknown) => textoDiaCorto(d);

const ESTADO_COLORS: Record<string, string> = {
  BORRADOR: 'bg-slate-100 text-slate-600',
  PLANIFICADA: 'bg-blue-100 text-blue-700',
  ACTIVA: 'bg-emerald-100 text-emerald-700',
  PAUSADA: 'bg-amber-100 text-amber-700',
  FINALIZADA: 'bg-gray-100 text-gray-600',
};
const CANALES_DISPONIBLES = ['Meta Ads','Instagram','TikTok','WhatsApp','Email','Google Ads','LinkedIn','Físico','YouTube','SMS'];
const TIPOS_CAMPANA = ['OMNICANAL','EMAIL','META','TIKTOK','WHATSAPP','FISICA','GOOGLE'];
// B4 T24 f4 (FINAL-m24): la etiqueta de cada tipo, con su tilde (el valor que se guarda no cambia).
const ETIQUETA_TIPO_CAMPANA: Record<string, string> = {
  OMNICANAL: 'Omnicanal', EMAIL: 'Email', META: 'Meta', TIKTOK: 'TikTok', WHATSAPP: 'WhatsApp', FISICA: 'Física', GOOGLE: 'Google',
};

/** Un lead de una campaña (GET /marketing/campanas/{id}/leads: campaign_leads). */
type LeadCampana = {
  id: number; lead_name: string | null; lead_email: string | null; source_channel: string | null; estado: string | null;
  venta_atribuida_cop: number | null; crm_lead_id: number | null;
};
/** Lo último que llegó de los leads de UNA campaña: la vuelta con la que se pidió (la campaña y el turno), sus datos y su error. */
type LeadsCargados = { vuelta: string; marca: string; datos: LeadCampana[] | null; error: unknown };

/** B4 T23B: la tabla de leads de la campaña, estándar y en modo cliente (llegan completos), sin tablero (R11). El id es el mismo en
 * useEstadoTabla, usePreferenciasTabla y TablaEstandar. */
const ID_LEADS = 'marketing.leads';
/** Lo que las celdas de la tabla le piden a la pantalla (las columnas son una constante de módulo: D40). */
const AccionesLeads = createContext<{ sincronizar: (id: number) => void; sincronizando: number | null }>({ sincronizar: () => {}, sincronizando: null });
/** Los estados de un lead de campaña; la etiqueta de la celda, de la búsqueda y del filtro es UNA: humanizarCodigo. */
const ESTADOS_LEAD = ['NUEVO', 'CONTACTADO', 'CONVERTIDO', 'PERDIDO'];
const OPCIONES_ESTADO_LEAD = ESTADOS_LEAD.map((valor) => ({ valor, etiqueta: humanizarCodigo(valor) }));

function CeldaCrmLead({ l }: { l: LeadCampana }) {
  const { sincronizar, sincronizando } = useContext(AccionesLeads);
  if (l.crm_lead_id) return <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1"><CheckCircle2 size={10}/>CRM #{l.crm_lead_id}</span>;
  return (
    <button type="button" onClick={() => sincronizar(l.id)} disabled={sincronizando === l.id} title="Todavía no está en el CRM"
      className="text-[10px] px-2 py-1 bg-indigo-50 text-indigo-700 rounded-lg font-bold hover:bg-indigo-100 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-600">
      Pasar al CRM
    </button>
  );
}

/** Las columnas (R26: a 1024 px con el menú abierto el panel de la campaña mide unos 430 px; Email y Canal salen ocultas, con «Ajustar tabla»). */
const COLUMNAS_LEADS: ColumnaTabla<LeadCampana>[] = [
  { id: 'nombre', titulo: 'Nombre', ancho: 120, anchoMin: 90, flexible: true, clave: true, ordenable: true, valorOrden: (l) => l.lead_name ?? '',
    celda: (l) => <span className="font-semibold text-slate-800 text-xs">{l.lead_name || '-'}</span> },
  { id: 'email', titulo: 'Email', ancho: 180, ordenable: true, ocultaPorDefecto: true, valorOrden: (l) => l.lead_email ?? '',
    celda: (l) => <span className="text-xs text-slate-500">{l.lead_email || '-'}</span> },
  { id: 'canal', titulo: 'Canal', ancho: 90, ordenable: true, ocultaPorDefecto: true, valorOrden: (l) => l.source_channel ?? '',
    celda: (l) => <span className="text-[10px] bg-slate-100 px-1.5 py-0.5 rounded font-bold text-slate-600">{l.source_channel || '-'}</span> },
  { id: 'estado', titulo: 'Estado', ancho: 100, ordenable: true, valorOrden: (l) => l.estado ?? '',
    celda: (l) => <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${l.estado==='CONVERTIDO'?'bg-emerald-100 text-emerald-700':l.estado==='PERDIDO'?'bg-red-100 text-red-600':'bg-blue-100 text-blue-700'}`}>{humanizarCodigo(l.estado)}</span> },
  { id: 'venta', titulo: 'Venta', ancho: 96, alinear: 'derecha', ordenable: true, valorOrden: (l) => Number(l.venta_atribuida_cop) || 0,
    celda: (l) => <span className="text-xs font-bold text-emerald-600">{Number(l.venta_atribuida_cop) > 0 ? fCOP(Number(l.venta_atribuida_cop)) : '-'}</span> },
  { id: 'crm', titulo: 'CRM', ancho: 104, celda: (l) => <CeldaCrmLead l={l} /> },
];
/** useListadoCliente (D40): sus accesores son una constante. */
const ACCESORES_LEADS = {
  busqueda: ['lead_name', 'lead_email', 'source_channel', (l: LeadCampana) => humanizarCodigo(l.estado)],
  orden: accesoresDeOrden(COLUMNAS_LEADS),
};

export default function CampanasPage() {
  // B4 T23B: el rol se lee después de montar y no se pide lo que no puede leer (accesoMarketing: todo /marketing es de ADMIN y ASESOR;
  // borrar una campaña, solo de ADMIN).
  const acceso = accesoMarketing(useRolActual());
  const { confirmar } = useAvisos();
  const [campanas, setCampanas] = useState<any[]>([]);
  const [errorCampanas, setErrorCampanas] = useState<unknown>(null);
  const [selected, setSelected] = useState<any>(null);
  const [activeTab, setActiveTab] = useState('resumen');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [toast, setToast] = useState<{msg:string;type:string}|null>(null);
  // Form state para nueva/edición campaña
  const [form, setForm] = useState({ nombre:'', tipo:'OMNICANAL', estado:'BORRADOR', fecha_inicio:'', fecha_fin:'', presupuesto_cop:0, objetivo:'', canales:[] as string[], descripcion:'', codigo_descuento:'', descuento_pct:0 });
  const [editMode, setEditMode] = useState(false);
  // Leads tab
  const [vueltaLeads, setVueltaLeads] = useState(0);
  const [leadsCargados, setLeadsCargados] = useState<LeadsCargados | null>(null);
  const [showLeadForm, setShowLeadForm] = useState(false);
  const [leadForm, setLeadForm] = useState({ lead_name:'', lead_email:'', lead_phone:'', source_channel:'MANUAL', notas:'' });
  const [syncingLead, setSyncingLead] = useState<number|null>(null);

  const showToast = (msg: string, type='ok') => { setToast({msg,type}); setTimeout(()=>setToast(null),3500); };
  
  const verCampanas = acceso.ver;
  const loadCampanas = useCallback(async () => {
    if (!verCampanas) return;
    setLoading(true);
    try {
      const d = await apiFetch('/marketing/campanas?limit=200');
      setCampanas(d.data || []);
      setErrorCampanas(null);
      // Elegir la primera solo si no hay una elegida (sin depender de `selected`: no recarga la lista en cada clic).
      if (d.data?.length) setSelected((s: any) => s ?? d.data[0]);
    } catch (e) { setErrorCampanas(e); }
    setLoading(false);
  }, [verCampanas]);

  // Los leads de la campaña elegida, para la pestaña Leads y para las Métricas (convertidos): uno por campaña y por turno. Lo que llegó
  // de OTRA campaña no se ve (marca), y mientras se recarga la misma se conserva ('actualizando').
  const claveLeads = `${selected?.id ?? ''}:${vueltaLeads}`;
  const pideLeads = verCampanas && Boolean(selected?.id) && (activeTab === 'leads' || activeTab === 'metricas');
  useEffect(() => {
    if (!pideLeads) return;
    const control = new AbortController();
    const marca = String(selected.id);
    apiFetch(`/marketing/campanas/${selected.id}/leads`, { signal: control.signal })
      .then((d: unknown) => setLeadsCargados({ vuelta: claveLeads, marca, datos: datosDeRespuesta(d) as LeadCampana[], error: null }))
      .catch((err: unknown) => { if (!control.signal.aborted) setLeadsCargados({ vuelta: claveLeads, marca, datos: null, error: err }); });
    return () => control.abort();
  }, [pideLeads, selected?.id, claveLeads]);
  // La lectura es una función pura (lecturaLeadsCampana): lo de otra campaña no se ve y la recién elegida está 'cargando'.
  const lectura = lecturaLeadsCampana(leadsCargados, claveLeads, String(selected?.id ?? ''), pideLeads);
  const { leads, error: errorLeads } = lectura;
  const avisoLeads = avisoDeFuente(errorLeads, 'No se pudieron cargar los leads de la campaña');
  const recargarLeads = useCallback(() => setVueltaLeads((n) => n + 1), []);

  // La tabla de leads (TablaEstandar «marketing.leads», modo cliente): un estado, las preferencias de columnas UNA vez y los accesores estables.
  const [estadoTabla, despacharTabla, listoTabla] = useEstadoTabla(ID_LEADS);
  const prefsLeads = usePreferenciasTabla(ID_LEADS, COLUMNAS_LEADS);
  const anchoLeadsRef = useRef<number | null>(null);
  const tablaLeads = useListadoCliente<LeadCampana>(leads, estadoTabla, ACCESORES_LEADS);
  const cargandoTabla = !listoTabla || (tablaLeads.cargandoInicial && !errorLeads);
  const elegirCampana = (c: any) => { setSelected(c); despacharTabla({ tipo: 'limpiarFiltros' }); };

  useEffect(() => { loadCampanas(); }, [loadCampanas]);


  const saveCampana = async () => {
    try {
      if (editMode && selected?.id) {
        const d = await apiFetch(`/marketing/campanas/${selected.id}`, { method:'PATCH', body:JSON.stringify(form) });
        showToast('Campaña actualizada');
        setSelected(d.data);
      } else {
        const d = await apiFetch('/marketing/campanas', { method:'POST', body:JSON.stringify(form) });
        showToast(`Campaña creada: ${d.data.numero}`);
        setSelected(d.data);
      }
      setShowForm(false); setEditMode(false);
      loadCampanas();
    } catch(e:any) { showToast(e.message,'error'); }
  };
  
  const launchCampana = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/launch`, {method:'POST'}); showToast('¡Campaña lanzada!'); loadCampanas(); setSelected((s:any)=>({...s, estado:'ACTIVA'})); } 
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const pauseCampana = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/pause`, {method:'POST'}); showToast('Campaña pausada'); loadCampanas(); setSelected((s:any)=>({...s, estado:'PAUSADA'})); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const deleteCampana = async (id:number) => {
    if (!(await confirmar({ titulo: 'Eliminar campaña', mensaje: '¿Eliminar esta campaña? Sus leads dejan de verse y no se puede deshacer.', textoConfirmar: 'Eliminar campaña', peligro: true }))) return;
    try { await apiFetch(`/marketing/campanas/${id}`, {method:'DELETE'}); showToast('Campaña eliminada'); loadCampanas(); if(selected?.id===id) setSelected(null); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const addLead = async () => {
    if (!selected) return;
    try { await apiFetch(`/marketing/campanas/${selected.id}/leads`, {method:'POST', body:JSON.stringify(leadForm)}); showToast('Lead agregado'); setShowLeadForm(false); setLeadForm({lead_name:'',lead_email:'',lead_phone:'',source_channel:'MANUAL',notas:''}); recargarLeads(); loadCampanas(); }
    catch(e:any) { showToast(e.message,'error'); }
  };
  
  const syncLeadToCRM = async (lead_id:number) => {
    setSyncingLead(lead_id);
    try { const d = await apiFetch('/marketing/leads/crm-sync', {method:'POST', body:JSON.stringify({lead_id})}); showToast(`Lead sincronizado al CRM (ID: ${d.data.crm_lead_id})`); recargarLeads(); }
    catch(e:any) { showToast(e.message,'error'); }
    setSyncingLead(null);
  };
  
  const tarjetasMetricas = tarjetasCampana(selected, leads);
  // B4 T24 f4 (F111): la barra del presupuesto, de la lib: «—» y gris mientras carga, con error o sin dato (nunca «$0»).
  const barra = barraPresupuesto(lectura.estado, tarjetasMetricas.ventas_atribuidas.valor, selected?.presupuesto_cop);

  const filtered = useMemo(() => campanas.filter(c => {
    if (filtroEstado && c.estado !== filtroEstado) return false;
    if (search && !c.nombre.toLowerCase().includes(search.toLowerCase()) && !(c.numero||'').toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }), [campanas, search, filtroEstado]);

  if (acceso.listo && !acceso.ver) {
    return (
      <div className="w-full h-full bg-slate-50 flex flex-col overflow-hidden">
        <SubNav label="Marketing" items={MKT_NAV} currentPath="/dashboard/marketing/campanas" color="emerald" hub={{ href: '/dashboard/marketing' }} />
        <p role="status" className={`m-6 ${CAJA_SIN_PERMISO}`}>Tu rol no ve las campañas de Marketing.</p>
      </div>
    );
  }

  return (
    // B4 T24 f4 (Campañas a 375): en el teléfono se desplaza la página entera (el detalle quedaba con 0 px de alto); desde md, el panel.
    <div className="w-full h-full bg-slate-50 flex flex-col overflow-y-auto md:overflow-hidden">
      <Toast toast={toast as any} onClose={() => setToast(null)} />

      <SubNav label="Marketing" items={MKT_NAV} currentPath="/dashboard/marketing/campanas" color="emerald" hub={{ href: '/dashboard/marketing' }} />

      {/* HEADER */}
      <div className="bg-white px-6 py-4 border-b border-slate-200 shrink-0 shadow-sm">
        <PageHeader icon={Target} color="emerald"
          title="Campañas de Mercadeo"
          subtitle="Crea, planifica y lanza campañas en todos los canales · Numeración MKT-YYYY####"
          actions={(
            <div className="flex gap-2">
              <button onClick={loadCampanas} className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-50 font-semibold text-sm">
                <RefreshCw size={13} className={loading?'animate-spin':''}/> Actualizar
              </button>
              <Button color="emerald" icon={Plus} onClick={()=>{setForm({nombre:'',tipo:'OMNICANAL',estado:'BORRADOR',fecha_inicio:'',fecha_fin:'',presupuesto_cop:0,objetivo:'',canales:[],descripcion:'',codigo_descuento:'',descuento_pct:0});setEditMode(false);setShowForm(true);}}>Nueva Campaña</Button>
            </div>
          )} />
      </div>

      <div className="flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">
        {/* COLUMNA IZQUIERDA — Lista de campañas */}
        <div className="w-full md:w-72 shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col max-h-80 md:max-h-none">
          {/* Search row */}
          <div className="p-3 border-b border-slate-100 space-y-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"/>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar campaña..." className="w-full pl-7 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs outline-none focus:ring-2 focus:ring-emerald-200"/>
            </div>
            <select value={filtroEstado} onChange={e=>setFiltroEstado(e.target.value)} className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-emerald-200 bg-white">
              <option value="">Todos los estados</option>
              {Object.keys(ESTADO_COLORS).map(e=><option key={e} value={e}>{humanizarCodigo(e)}</option>)}
            </select>
          </div>
          {/* List */}
          <div className="flex-1 min-h-0 overflow-y-auto">
            {loading && <div className="text-center py-10 text-slate-400 text-sm">Cargando...</div>}
            {Boolean(errorCampanas) && !loading && <div className="p-3">{(() => { const a = avisoDeFuente(errorCampanas, 'No se pudieron cargar las campañas'); return a ? <AvisoFuente aviso={a} onReintentar={loadCampanas} /> : null; })()}</div>}
            {!loading && !errorCampanas && filtered.length===0 && <div className="text-center py-10 text-slate-400 text-sm">Sin campañas</div>}
            {filtered.map(c=>(
              <div key={c.id} onClick={()=>elegirCampana(c)} className={`p-4 border-b border-slate-100 cursor-pointer hover:bg-emerald-50/30 transition-colors ${selected?.id===c.id?'bg-emerald-50 border-l-2 border-l-emerald-600':''}`}>
                <div className="flex items-start justify-between mb-1.5">
                  <div>
                    <p className="font-black text-slate-800 text-sm leading-tight">{c.nombre}</p>
                    <p className="text-[10px] text-emerald-600 font-bold mt-0.5">{c.numero}</p>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${ESTADO_COLORS[c.estado]||'bg-gray-100 text-gray-500'}`}>{humanizarCodigo(c.estado)}</span>
                </div>
                <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                  {(c.canales||[]).slice(0,3).map((ch:string)=>(<span key={ch} className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded font-bold">{ch}</span>))}
                  {(c.canales||[]).length>3 && <span className="text-[9px] text-slate-400">+{(c.canales||[]).length-3}</span>}
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-slate-500">
                  <span>{c.leads_count||0} leads</span>
                  <span className="font-bold text-emerald-600">{fCOP(c.ventas_cop||0)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* PANEL CENTRAL — Detalle */}
        {selected ? (
          <div className="flex-1 flex flex-col md:overflow-hidden">
            {/* Campaña Header */}
            <div className="bg-white px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-xl font-black text-slate-800">{selected.nombre}</h2>
                  <span className={`text-xs font-black px-2 py-0.5 rounded-full ${ESTADO_COLORS[selected.estado]||''}`}>{humanizarCodigo(selected.estado)}</span>
                </div>
                <p className="text-xs text-slate-400">{selected.numero} · {(selected.canales||[]).join(', ') || 'Sin canales'}</p>
              </div>
              <div className="flex gap-2">
                {selected.estado==='BORRADOR'||selected.estado==='PLANIFICADA' ? (
                  <button onClick={launchCampana} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-sm">
                    <Play size={14}/> Lanzar
                  </button>
                ) : selected.estado==='ACTIVA' ? (
                  <button onClick={pauseCampana} className="flex items-center gap-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold text-sm">
                    <PauseCircle size={14}/> Pausar
                  </button>
                ) : null}
                <button onClick={()=>{setForm({nombre:selected.nombre,tipo:selected.tipo||'OMNICANAL',estado:selected.estado,fecha_inicio:selected.fecha_inicio?.split('T')[0]||'',fecha_fin:selected.fecha_fin?.split('T')[0]||'',presupuesto_cop:selected.presupuesto_cop||0,objetivo:selected.objetivo||'',canales:selected.canales||[],descripcion:selected.descripcion||'',codigo_descuento:selected.codigo_descuento||'',descuento_pct:selected.descuento_pct||0});setEditMode(true);setShowForm(true);}} className="flex items-center gap-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-bold text-sm hover:bg-slate-50">
                  <Edit2 size={13}/>
                </button>
                <button onClick={()=>deleteCampana(selected.id)} disabled={!acceso.eliminarCampana}
                  title={acceso.eliminarCampana ? 'Eliminar campaña' : 'Solo la Administración elimina campañas'} aria-label="Eliminar campaña"
                  className="p-2 bg-white border border-slate-200 rounded-xl hover:bg-red-50 text-red-500 disabled:opacity-40 disabled:hover:bg-white">
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
            
            {/* Tabs */}
            <div className="bg-white border-b border-slate-100 px-6 flex gap-1 overflow-x-auto">
              {[['resumen','Resumen'],['leads','Leads'],['metricas','Métricas'],['descuentos','Descuentos']].map(([v,l])=>(
                <button key={v} onClick={()=>setActiveTab(v)} className={`px-4 py-3 font-bold text-sm border-b-2 transition-colors ${activeTab===v?'border-emerald-600 text-emerald-600':'border-transparent text-slate-400 hover:text-slate-700'}`}>{l}</button>
              ))}
            </div>
            
            {/* Tab Content */}
            <div className={`flex-1 md:overflow-y-auto p-6 ${RESERVA_BOTON_IA}`}>
              {/* RESUMEN TAB */}
              {activeTab==='resumen' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide">Información General</h3>
                      {[['Tipo', ETIQUETA_TIPO_CAMPANA[selected.tipo] ?? humanizarCodigo(selected.tipo)],['Fecha Inicio',fDate(selected.fecha_inicio)],['Fecha Fin',fDate(selected.fecha_fin)],['Presupuesto',fCOP(selected.presupuesto_cop||0)]].map(([l,v])=>(
                        <div key={l} className="flex justify-between text-sm"><span className="text-slate-400 font-medium">{l}</span><span className="font-bold text-slate-800">{v}</span></div>
                      ))}
                    </div>
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-4">Canales</h3>
                      <div className="flex flex-wrap gap-2">
                        {(selected.canales||[]).map((ch:string)=>(
                          <span key={ch} className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold text-xs rounded-xl">{ch}</span>
                        ))}
                        {!(selected.canales||[]).length && <p className="text-slate-400 text-sm">Sin canales definidos</p>}
                      </div>
                    </div>
                  </div>
                  {selected.objetivo && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <h3 className="font-black text-slate-700 text-sm uppercase tracking-wide mb-2">Objetivo</h3>
                      <p className="text-slate-600 text-sm leading-relaxed">{selected.objetivo}</p>
                    </div>
                  )}
                </div>
              )}
              
              {/* LEADS TAB */}
              {activeTab==='leads' && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-bold text-slate-500">{leads === null ? 'Leads de esta campaña' : `${leads.length} ${leads.length === 1 ? 'lead' : 'leads'} en esta campaña`}</p>
                    <button onClick={()=>setShowLeadForm(!showLeadForm)} className="flex items-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">
                      <Plus size={14}/> Agregar Lead
                    </button>
                  </div>
                  {showLeadForm && (
                    <div className="bg-white rounded-2xl border border-emerald-200 p-5 space-y-3">
                      <h4 className="font-black text-slate-700">Nuevo Lead</h4>
                      <div className="grid grid-cols-2 gap-3">
                        {[['lead_name','Nombre *','text'],['lead_email','Email','email'],['lead_phone','Teléfono','tel']].map(([k,l,t])=>(
                          <div key={k}><label className="block text-xs font-bold text-slate-500 mb-1">{l}</label><input type={t} value={(leadForm as any)[k]} onChange={e=>setLeadForm(f=>({...f,[k]:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                        ))}
                        <div><label className="block text-xs font-bold text-slate-500 mb-1">Canal</label><select value={leadForm.source_channel} onChange={e=>setLeadForm(f=>({...f,source_channel:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{['MANUAL','INSTAGRAM','WHATSAPP','EMAIL','META','TIKTOK','WEB'].map(c=><option key={c}>{c}</option>)}</select></div>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={addLead} className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold text-sm hover:bg-emerald-700">Guardar Lead</button>
                        <button onClick={()=>setShowLeadForm(false)} className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-bold text-sm">Cancelar</button>
                      </div>
                    </div>
                  )}
                  <AccionesLeads.Provider value={{ sincronizar: syncLeadToCRM, sincronizando: syncingLead }}>
                    <section aria-label="Leads de la campaña" className="flex min-w-0 flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
                      <BarraTabla estado={estadoTabla} onEstado={despacharTabla} placeholder="Buscar lead…" opcionesEstados={OPCIONES_ESTADO_LEAD}
                        ajustes={{ columnas: COLUMNAS_LEADS, preferencias: prefsLeads, anchoRef: anchoLeadsRef }} color="emerald"
                        total={tablaLeads.total}
                        estadoTotal={estadoDelTotal({ total: tablaLeads.total, cargando: cargandoTabla, recargando: lectura.recargando, error: errorLeads })} />
                      <TablaEstandar<LeadCampana> id={ID_LEADS} modo="cliente" columnas={COLUMNAS_LEADS} preferencias={prefsLeads} anchoRef={anchoLeadsRef}
                        estado={estadoTabla} onEstado={despacharTabla} filas={tablaLeads.filas} total={tablaLeads.total}
                        cargando={cargandoTabla} recargando={lectura.recargando}
                        error={errorLeads} onReintentar={recargarLeads} etiqueta="Leads de la campaña"
                        vacio={estadoTabla.q || estadoTabla.estados.length ? 'Ningún lead coincide con la búsqueda o el estado elegido.' : 'Sin leads en esta campaña'} />
                    </section>
                  </AccionesLeads.Provider>
                </div>
              )}

              {/* MÉTRICAS TAB */}
              {activeTab==='metricas' && (
                <div className="space-y-5">
                  {avisoLeads && <AvisoFuente aviso={avisoLeads} onReintentar={recargarLeads} />}
                  <FranjaKpis titulo="Indicadores de la campaña">
                    <TarjetaKpi kpi="leads_capturados" valor={tarjetasMetricas.leads_capturados.valor} />
                    <TarjetaKpi kpi="leads_convertidos" valor={tarjetasMetricas.leads_convertidos.valor} estado={lectura.estado} />
                    <TarjetaKpi kpi="ventas_atribuidas" valor={tarjetasMetricas.ventas_atribuidas.valor} ayuda={tarjetasMetricas.ventas_atribuidas.ayuda} estado={lectura.estado} />
                    <TarjetaKpi kpi="roi" formato="texto" valor={tarjetasMetricas.roi.texto} tono={tarjetasMetricas.roi.tono} ayuda={tarjetasMetricas.roi.ayuda ?? undefined} estado={lectura.estado} />
                  </FranjaKpis>
                  {/* Presupuesto progress */}
                  {selected.presupuesto_cop>0 && (
                    <div className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex justify-between mb-2">
                        <span className="text-sm font-bold text-slate-700">Progreso del Presupuesto</span>
                        <span className="text-sm font-black text-emerald-600">{barra.texto}</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-3">
                        {barra.gris ? <div className={`h-3 w-full rounded-full bg-slate-200 ${lectura.estado === 'cargando' ? 'animate-pulse' : ''}`} aria-hidden="true" /> : <div className="bg-emerald-500 h-3 rounded-full" style={{width:`${barra.ancho}%`}}/>}
                      </div>
                    </div>
                  )}
                </div>
              )}
              
              {/* DESCUENTOS TAB */}
              {activeTab==='descuentos' && (
                <div className="space-y-4">
                  <div className="bg-white rounded-2xl border border-slate-200 p-6">
                    <h3 className="font-black text-slate-800 mb-4 flex items-center gap-2"><Tag size={18} className="text-emerald-600"/>Código de Descuento</h3>
                    {selected.codigo_descuento ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl">
                          <div>
                            <p className="text-xs font-black text-emerald-500 uppercase mb-1">Código activo</p>
                            <p className="text-3xl font-black text-emerald-800 tracking-widest">{selected.codigo_descuento}</p>
                            <p className="text-sm font-bold text-emerald-600 mt-1">{selected.descuento_pct}% de descuento</p>
                          </div>
                          <button onClick={()=>navigator.clipboard.writeText(selected.codigo_descuento)} className="ml-auto p-2 bg-white border border-emerald-200 rounded-xl hover:bg-emerald-100">
                            <Copy size={16} className="text-emerald-600"/>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-sm">Sin código de descuento configurado para esta campaña. Edita la campaña para agregar uno.</p>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center text-slate-400">
              <Target size={48} className="mx-auto mb-4 opacity-20"/>
              <p className="font-bold">Selecciona una campaña</p>
              <p className="text-sm mt-1">o crea una nueva con el botón superior</p>
            </div>
          </div>
        )}
      </div>
      
      {/* MODAL / PANEL FORMULARIO */}
      {showForm && (
        <Modal cierreExterno={false} title={editMode?'Editar Campaña':'Nueva Campaña'} icon={Megaphone} color="emerald" maxWidth="xl"
          onClose={()=>setShowForm(false)}
          footer={(
            <>
              <Button variant="secondary" onClick={()=>setShowForm(false)}>Cancelar</Button>
              <Button color="emerald" onClick={saveCampana}>{editMode?'Guardar Cambios':'Crear Campaña'}</Button>
            </>
          )}>
            <div className="space-y-5">
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Nombre *</label><input value={form.nombre} onChange={e=>setForm(f=>({...f,nombre:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200" placeholder="Ej. Black Friday 2026"/></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Tipo</label><select value={form.tipo} onChange={e=>setForm(f=>({...f,tipo:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{TIPOS_CAMPANA.map(t=><option key={t} value={t}>{ETIQUETA_TIPO_CAMPANA[t] ?? humanizarCodigo(t)}</option>)}</select></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Estado</label><select value={form.estado} onChange={e=>setForm(f=>({...f,estado:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 bg-white">{Object.keys(ESTADO_COLORS).map(e=><option key={e} value={e}>{humanizarCodigo(e)}</option>)}</select></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Fecha Inicio</label><input type="date" value={form.fecha_inicio} onChange={e=>setForm(f=>({...f,fecha_inicio:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Fecha Fin</label><input type="date" value={form.fecha_fin} onChange={e=>setForm(f=>({...f,fecha_fin:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              </div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Presupuesto COP</label><input type="number" value={form.presupuesto_cop} onChange={e=>setForm(f=>({...f,presupuesto_cop:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Objetivo</label><textarea value={form.objetivo} onChange={e=>setForm(f=>({...f,objetivo:e.target.value}))} rows={2} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 resize-none" placeholder="Ej. Generar 500 leads calificados a través de redes sociales en noviembre"/></div>
              <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Canales</label><div className="flex flex-wrap gap-2">{CANALES_DISPONIBLES.map(c=>(<button key={c} type="button" onClick={()=>setForm(f=>({...f,canales:f.canales.includes(c)?f.canales.filter(x=>x!==c):[...f.canales,c]}))} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${form.canales.includes(c)?'bg-emerald-600 text-white border-emerald-600':'bg-white text-slate-500 border-slate-200 hover:border-emerald-300'}`}>{c}</button>))}</div></div>
              <div className="grid grid-cols-2 gap-4">
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Código Descuento</label><input value={form.codigo_descuento} onChange={e=>setForm(f=>({...f,codigo_descuento:e.target.value.toUpperCase()}))} placeholder="BF2026" className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200 font-mono"/></div>
                <div><label className="block text-xs font-black text-slate-500 uppercase mb-1.5">Descuento %</label><input type="number" min="0" max="100" value={form.descuento_pct} onChange={e=>setForm(f=>({...f,descuento_pct:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-emerald-200"/></div>
              </div>
            </div>
        </Modal>
      )}
    </div>
  );
}
