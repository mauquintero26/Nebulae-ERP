'use client';
import React, { useState, useEffect, useLayoutEffect, useCallback, useContext, useMemo, useRef } from 'react';
import Link from 'next/link';
import { usePathname, useSearchParams, useRouter } from 'next/navigation';
import {
  ShoppingBag, Package, CheckCircle2, AlertTriangle,
  Search, MoreHorizontal, RefreshCw, X, Trash2, Edit2, Send,
  ChevronUp, Plus, Eye, ShoppingCart, Clock, MapPin, Save, ChevronDown, BarChart3,
  ExternalLink, RotateCcw, UserPlus, Settings2, PackageCheck
} from 'lucide-react';
// B4 T15: Pedidos de compra 100 % sobre el servidor (R5, C3, C4): la tabla y el tablero estándar con el estado único de
// la pantalla, las tarjetas y la franja del flujo; el Análisis vive en el Hub (R13). El panel del PEC, el seguimiento,
// la recepción y el alta conservan lo de B1 a B3.
import {
  SubNav, PageHeader, Button, useAvisos, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila, ModalMotivo,
  TableroKanban, EsqueletoTablero, useTableroKanban,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { AccionTabla, ClaveFila, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, PasosFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import { COMP_NAV } from '../comp-nav';

import { FOCOS } from '@/lib/design-system';
import { accesoCompras } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import { apiFetch as _apiFetch } from '@/lib/api';
import type { OpcionesApiFetch } from '@/lib/api';
import {
  accionModo, accionPestana, accionVistaEnLista, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta,
  ordenEsAtencion, rutaSinParametro, textoOrdenHub,
} from '@/lib/tabla';
import { PERIODO_KPI, tarjetasPedidosCompra } from '@/lib/kpis';
// T15 r1 (m7): la etiqueta del estado del pedido de venta (el chip del alta), nunca el código.
import { infoEstadoPedido } from '@/lib/estados-pedido';
import { recargarTrasError, textoDeError } from '@/lib/avisos';
import {
  COLUMNAS_PEC, EFECTOS_CANCELAR_PEC, OPCIONES_ESTADOS_TABLERO_PEC, cancelarPecsEnSerie, consultaColumnaPec,
  despuesDeCancelarPec, etapaPec, grupoMesPec, infoEstadoPec, opcionesEstadosPec, ordenPorFechaDeCompra, reglaSoltarPec,
  repartirCancelacionPec, resumenCancelacionPec, tarjetaPedidoCompra, textoVacioPec, textoVencidosPec, tituloMesPec,
  transicionesPec,
} from '@/lib/estados-compras';
import {
  ENLACE_VER_ANALISIS_COMPRAS, TEXTO_SEGUIMIENTO_CERRADO, accionSemaforoCompras, avisoTarjetaEtapa, avisosFlujoCompras,
  etiquetaEtapaTracking, filtroSemaforoCompras, leerEnlacePedidosCompra, pasosDeTracking, pasosPedidosCompra, seguimientoCerrado,
  textoReglaCompras, vistaDePasoPedidosCompra,
} from '@/lib/flujo-compras';
// B4 T15 r1 (m3, m11): las columnas, las celdas y los formatos que comparte con el Hub de Compras.
import { claseDeFilaPec, columnasPec, fCOP, textoDia, textoInstante, titulosDeOrdenPec } from '../columnas-pec';
import type { FilaColumnasPec } from '../columnas-pec';

// La lectura de siempre de B1 a B3: el `data` de la respuesta. Los errores ya llegan legibles de lib/api (status y
// detail del servidor), así que se muestran tal cual.
async function apiFetch(path: string, opts: OpcionesApiFetch = {}) {
  const res = await _apiFetch(path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || data.message || 'Error');
  return data.data ?? data;
}

// El nombre de B1 a B3 en el alta y en el panel: el de un instante.
const fDate = textoInstante;

/** Quien hace el cambio (updated_by: la Actividad del PEC dice su nombre). Sin sesión se omite y el servidor usa el correo. */
const autorActual = () => {
  if (typeof window === 'undefined') return undefined;
  return localStorage.getItem('user_name') || localStorage.getItem('user_email') || undefined;
};

/**
 * El aviso de los modales y del panel (B1 a B3: showToast). B4 T15: con el tipo de la página (los de error pasan por
 * textoDeError en useAvisos): antes el tipo de los modales no admitía el de la página (los 2 errores de tsc de la base).
 */
type AvisoPantalla = (msg: unknown, tipo?: 'ok' | 'error') => void;

/** Los tonos de los días de avisoTarjetaEtapa (en -700: se leen sobre el fondo de la tarjeta de la etapa). */
const CLASE_DIAS_ETAPA: Record<string, string> = { azul: 'text-blue-700', ambar: 'text-amber-700', rojo: 'text-rose-700' };

/* ================================================================
   NUEVO PROVEEDOR MODAL
   ================================================================ */
function NewSupplierModal({onSave, onClose}: {onSave:(s:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({name:'',reference:'',contact_name:'',phone:'',email:'',address:'',city:'',country:'Colombia',payment_terms:'',notes:''});
  const [saving, setSaving] = useState(false);
  // B4 T15 (RP30): el error en un aviso del sistema, con el texto del servidor (nunca alert()).
  const { avisarError } = useAvisos();
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { const raw = await apiFetch('/compras/proveedores',{method:'POST',body:JSON.stringify(form)}); onSave(raw?.data ?? raw); }
    catch(err) { avisarError(err, 'No se pudo crear el proveedor'); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-purple-50 rounded-t-3xl">
          <div><h3 className="font-black text-gray-900 text-lg">Nuevo Proveedor</h3><p className="text-xs text-gray-500 mt-0.5">Agregar a la agenda de proveedores</p></div>
          <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Referencia / NIT</label><input value={form.reference} onChange={e=>set('reference',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Telefono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Email</label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Terminos de Pago</label><input value={form.payment_terms} onChange={e=>set('payment_terms',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<UserPlus size={14}/>} Agregar Proveedor
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   NUEVO CASILLERO MODAL
   ================================================================ */
function NewCasilleroModal({onSave, onClose}: {onSave:(c:any)=>void; onClose:()=>void}) {
  const [form, setForm] = useState({name:'',address:'',reception_point:'',contact_name:'',phone:'',email:'',city:'',country:'Estados Unidos',notes:''});
  const [saving, setSaving] = useState(false);
  // B4 T15 (RP30): el error en un aviso del sistema, con el texto del servidor (nunca alert()).
  const { avisarError } = useAvisos();
  const set = (k:string,v:string) => setForm(f=>({...f,[k]:v}));
  async function save(e:React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setSaving(true);
    try { const raw = await apiFetch('/compras/casilleros',{method:'POST',body:JSON.stringify(form)}); onSave(raw?.data ?? raw); }
    catch(err) { avisarError(err, 'No se pudo crear el casillero'); }
    setSaving(false);
  }
  return (
    <div className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg mx-4">
        <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-indigo-50 rounded-t-3xl">
          <div><h3 className="font-black text-gray-900 text-lg">Nuevo Casillero</h3><p className="text-xs text-gray-500 mt-0.5">Punto de recepcion / forwarder</p></div>
          <button onClick={onClose} className="p-2 hover:bg-indigo-100 rounded-xl"><X size={18}/></button>
        </div>
        <form onSubmit={save} className="p-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Nombre *</label><input required value={form.name} onChange={e=>set('name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Direccion</label><input value={form.address} onChange={e=>set('address',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div className="col-span-2"><label className="block text-xs font-black text-gray-500 uppercase mb-1">Punto de Recepcion</label><input value={form.reception_point} onChange={e=>set('reception_point',e.target.value)} placeholder="ej: Bodega 4, Muelle B" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Contacto</label><input value={form.contact_name} onChange={e=>set('contact_name',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Telefono</label><input value={form.phone} onChange={e=>set('phone',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Ciudad</label><input value={form.city} onChange={e=>set('city',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
            <div><label className="block text-xs font-black text-gray-500 uppercase mb-1">Pais</label><input value={form.country} onChange={e=>set('country',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-indigo-200"/></div>
          </div>
          <div className="flex justify-end gap-3 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
            <button type="submit" disabled={saving} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<MapPin size={14}/>} Agregar Casillero
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ================================================================
   TRACKING CONFIG MODAL — icono de configuracion (Etapas/Alertas + Casilleros)
   ================================================================ */
function TrackingConfigModal({onClose, onToast}: {onClose:()=>void; onToast:AvisoPantalla}) {
  const [tab, setTab] = useState<'etapas'|'casilleros'>('etapas');
  const [tipoEnvio, setTipoEnvio] = useState<'casillero'|'directo'>('casillero');
  const [config, setConfig] = useState<any>(null);
  const [stages, setStages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [casilleros, setCasilleros] = useState<any[]>([]);
  const [showNewCasillero, setShowNewCasillero] = useState(false);
  // T15 r1 (m9): los errores de la lista de casilleros se dicen (antes se callaban).
  const { avisarError } = useAvisos();

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try { const d = await apiFetch('/compras/tracking-config'); setConfig(d); setStages(d[tipoEnvio]||[]); }
    catch(e:any) { onToast(e.message,'error'); }
    setLoading(false);
  }, [tipoEnvio]);
  const loadCasilleros = async () => {
    try { const d = await apiFetch('/compras/casilleros?limit=100'); setCasilleros(Array.isArray(d)?d:(d?.data||[])); }
    catch (err) { avisarError(err, 'No se pudieron cargar los casilleros'); }
  };
  useEffect(()=>{ loadConfig(); loadCasilleros(); }, []);
  useEffect(()=>{ if(config) setStages(config[tipoEnvio]||[]); }, [tipoEnvio]);

  const setStage = (i:number, k:string, v:any) => setStages(prev=>prev.map((s,idx)=>idx===i?{...s,[k]:v}:s));
  const addStage = () => setStages(prev=>[...prev, {key:'',label:'',alert_confirm_days:2,alert_overdue_days:1,active:true}]);
  const removeStage = (i:number) => setStages(prev=>prev.filter((_,idx)=>idx!==i));
  const moveStage = (i:number, dir:number) => setStages(prev=>{
    const n=[...prev]; const j=i+dir; if(j<0||j>=n.length) return prev;
    [n[i],n[j]]=[n[j],n[i]]; return n;
  });

  const saveStages = async () => {
    if (stages.some(s=>!s.key || !String(s.key).trim())) { onToast('Cada etapa necesita una key (identificador unico)','error'); return; }
    setSaving(true);
    try {
      await apiFetch(`/compras/tracking-config/${tipoEnvio}`, {method:'PUT', body:JSON.stringify({stages})});
      onToast('Configuracion de etapas guardada','ok');
      loadConfig();
    } catch(e:any) { onToast(e.message,'error'); }
    setSaving(false);
  };

  // B4 T15 (RP30): confirmar de useAvisos (nunca confirm()), con el nombre del casillero.
  const { confirmar } = useAvisos();
  const deleteCasillero = async (id:number) => {
    const nombre = casilleros.find((c) => c.id === id)?.name;
    if (!(await confirmar({
      titulo: '¿Eliminar este casillero?', mensaje: nombre ? `Se elimina «${nombre}» de la lista de casilleros.` : 'Se elimina de la lista de casilleros.',
      textoConfirmar: 'Eliminar casillero', peligro: true,
    }))) return;
    try { await apiFetch(`/compras/casilleros/${id}`,{method:'DELETE'}); loadCasilleros(); onToast('Casillero eliminado','ok'); }
    catch(e:any) { onToast(e.message,'error'); }
  };

  return (
    // B4 T24 f2 r2 (m4): esta ventana (z-[95]) va ENCIMA de confirmar() (z-[60]) que abre «Eliminar casillero»: data-superficie, para que
    // la capa de la confirmación no le quite el foco.
    <div data-superficie="ventana" className="fixed inset-0 z-[95] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      {showNewCasillero && (
        <NewCasilleroModal onClose={()=>setShowNewCasillero(false)} onSave={()=>{setShowNewCasillero(false);loadCasilleros();}}/>
      )}
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="px-6 py-5 border-b border-gray-100 flex justify-between items-center shrink-0">
          <div>
            <h3 className="font-black text-gray-900 text-lg flex items-center gap-2"><Settings2 size={18} className="text-purple-600"/> Configuracion de Tracking</h3>
            <p className="text-xs text-gray-500 mt-0.5">Etapas, alertas y casilleros del pipeline logistico</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-xl"><X size={18}/></button>
        </div>
        <div className="flex gap-1 px-6 pt-4 shrink-0">
          {[{k:'etapas',l:'Etapas y Alertas'},{k:'casilleros',l:'Casilleros'}].map(({k,l}:any)=>(
            <button key={k} onClick={()=>setTab(k)} className={'px-3 py-1.5 rounded-lg text-sm font-bold ' + (tab===k?'bg-purple-600 text-white':'bg-gray-100 text-gray-600 hover:bg-purple-50')}>{l}</button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {tab === 'etapas' && (
            <div className="space-y-4">
              <div className="flex gap-2">
                {(['casillero','directo'] as const).map(t=>(
                  <button key={t} onClick={()=>setTipoEnvio(t)} className={'px-3 py-1.5 rounded-lg text-xs font-bold border ' + (tipoEnvio===t?'bg-indigo-600 text-white border-indigo-600':'bg-white text-gray-600 border-gray-200 hover:bg-gray-50')}>
                    {t==='casillero'?'Vía casillero':'Directo Colombia'}
                  </button>
                ))}
              </div>
              {loading ? <div className="text-center py-8 text-gray-400 text-sm">Cargando...</div> : (
                <div className="space-y-2">
                  {stages.map((s,i)=>(
                    <div key={i} className="border border-gray-200 rounded-2xl p-4 bg-gray-50">
                      <div className="grid grid-cols-12 gap-2 items-end">
                        <div className="col-span-4">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Etiqueta</label>
                          <input value={s.label||''} onChange={e=>setStage(i,'label',e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-3">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Key (unica)</label>
                          <input value={s.key||''} onChange={e=>setStage(i,'key',e.target.value.toUpperCase().replace(/\s+/g,'_'))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 font-mono"/>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Confirm. (d)</label>
                          <input type="number" min={0} value={s.alert_confirm_days??''} onChange={e=>setStage(i,'alert_confirm_days',e.target.value===''?null:Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-2">
                          <label className="text-[10px] font-black text-gray-400 uppercase">Atraso (d)</label>
                          <input type="number" min={0} value={s.alert_overdue_days??''} onChange={e=>setStage(i,'alert_overdue_days',e.target.value===''?null:Number(e.target.value))} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/>
                        </div>
                        <div className="col-span-1 flex flex-col items-center gap-1">
                          <button onClick={()=>moveStage(i,-1)} disabled={i===0} className="text-gray-400 hover:text-purple-600 disabled:opacity-20"><ChevronUp size={14}/></button>
                          <button onClick={()=>moveStage(i,1)} disabled={i===stages.length-1} className="text-gray-400 hover:text-purple-600 disabled:opacity-20"><ChevronDown size={14}/></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-2">
                        <label className="flex items-center gap-1.5 text-xs text-gray-500 font-bold">
                          <input type="checkbox" checked={s.active!==false} onChange={e=>setStage(i,'active',e.target.checked)} className="rounded border-gray-300"/> Activa
                        </label>
                        <button onClick={()=>removeStage(i)} className="text-xs text-red-500 hover:text-red-700 font-bold flex items-center gap-1"><Trash2 size={12}/> Eliminar etapa</button>
                      </div>
                    </div>
                  ))}
                  <button onClick={addStage} className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-bold text-gray-500 hover:border-purple-400 hover:text-purple-600 flex items-center justify-center gap-2"><Plus size={14}/> Agregar etapa</button>
                </div>
              )}
            </div>
          )}

          {tab === 'casilleros' && (
            <div className="space-y-2">
              <button onClick={()=>setShowNewCasillero(true)} className="w-full py-2.5 border-2 border-dashed border-gray-300 rounded-2xl text-sm font-bold text-gray-500 hover:border-indigo-400 hover:text-indigo-600 flex items-center justify-center gap-2 mb-2"><Plus size={14}/> Nuevo Casillero</button>
              {casilleros.length === 0 && <p className="text-center py-8 text-gray-400 text-sm">Sin casilleros registrados</p>}
              {casilleros.map(c=>(
                <div key={c.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-200">
                  <div>
                    <p className="font-bold text-sm text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400">{[c.address,c.city].filter(Boolean).join(' · ')||'Sin direccion'}</p>
                  </div>
                  <button onClick={()=>deleteCasillero(c.id)} className="p-1.5 hover:bg-red-50 rounded-lg text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
                </div>
              ))}
            </div>
          )}
        </div>

        {tab === 'etapas' && (
          <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 shrink-0">
            <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cerrar</button>
            <button onClick={saveStages} disabled={saving} className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50 flex items-center gap-2">
              {saving?<RefreshCw size={14} className="animate-spin"/>:<Save size={14}/>} Guardar Etapas
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ================================================================
   TRACKING PANEL — Barra interactiva de tracking (renderiza SIEMPRE
   directamente pec.tracking_stages, la fuente de verdad real -- nunca
   una plantilla separada por nombre, que fue la causa raiz del bug
   "las etapas no se marcan": el backend y un template hardcodeado en
   este archivo usaban nombres de etapa distintos, asi que el PATCH de
   las etapas 2/3/4 nunca encontraba coincidencia y no hacia nada).
   ================================================================ */
// r1 (m2, m7): puedeEditar es accesoCompras.tracking (PATCH /pedidos/{id}/tracking: ADMIN y COMPRAS); sin él, las tarjetas solo se ven.
function TrackingPanel({pec, onUpdate, onToast, puedeEditar}: {pec:any; onUpdate:()=>void; onToast:AvisoPantalla; puedeEditar: boolean}) {
  const [updating, setUpdating] = useState<string|null>(null);
  const [editStage, setEditStage] = useState<string|null>(null);
  const [guia, setGuia] = useState('');
  const [notas, setNotas] = useState('');
  const [eta, setEta] = useState('');
  const [carrier, setCarrier] = useState('');
  const [casilleroId, setCasilleroId] = useState<number|null>(null);
  const [casilleroSearch, setCasilleroSearch] = useState('');
  const [casilleroResults, setCasilleroResults] = useState<any[]>([]);
  const [showNewCasillero, setShowNewCasillero] = useState(false);
  const casilleroTimer = useRef<any>(null);
  // T15 r1 (m9): el error de la búsqueda de casilleros se dice (antes se callaba).
  const { avisarError } = useAvisos();

  const stages: any[] = pec.tracking_stages || [];
  // T15 r1 (m4, m14): con el PEC cancelado, el seguimiento es de solo lectura (seguimientoCerrado, la regla del detalle).
  const cerrado = seguimientoCerrado(pec.estado);

  async function updateStage(stageName: string, status: string) {
    setUpdating(stageName);
    try {
      await apiFetch('/compras/pedidos/' + pec.id + '/tracking', {
        method: 'PATCH',
        body: JSON.stringify({
          stage: stageName, status,
          tracking_number: guia || undefined,
          notes: notas || undefined,
          eta: eta || undefined,
          carrier: carrier || undefined,
          casillero_id: casilleroId || undefined,
          user_name: localStorage.getItem('user_name') || '',
        })
      });
      onToast('Etapa actualizada', 'ok');
      onUpdate();
      closeEdit();
    } catch(e:any) { onToast(e.message, 'error'); }
    setUpdating(null);
  }

  function openEdit(s:any) {
    if (editStage === s.stage) { closeEdit(); return; }
    setEditStage(s.stage);
    setGuia(s.tracking_number||'');
    setNotas(s.notes||'');
    setEta(s.eta ? String(s.eta).slice(0,10) : '');
    setCarrier(s.carrier||'');
    setCasilleroId(s.casillero_id||null);
    setCasilleroSearch(s.casillero_nombre||'');
    setCasilleroResults([]);
  }
  function closeEdit() {
    setEditStage(null); setGuia(''); setNotas(''); setEta(''); setCarrier(''); setCasilleroId(null); setCasilleroSearch(''); setCasilleroResults([]);
  }

  function onCasilleroSearch(q:string) {
    setCasilleroSearch(q);
    setCasilleroId(null);
    clearTimeout(casilleroTimer.current);
    if (!q.trim()) { setCasilleroResults([]); return; }
    casilleroTimer.current = setTimeout(async () => {
      try {
        const d = await apiFetch('/compras/casilleros/search?q='+encodeURIComponent(q));
        setCasilleroResults(Array.isArray(d)?d:(d?.data||[]));
      } catch (err) { avisarError(err, 'No se pudo buscar el casillero'); }
    }, 300);
  }

  if (stages.length === 0) {
    return <p className="text-center py-10 text-gray-400 text-sm">Sin etapas de tracking configuradas para este pedido.</p>;
  }

  return (
    <div className="space-y-3">
      {showNewCasillero && (
        <NewCasilleroModal onClose={()=>setShowNewCasillero(false)} onSave={(c:any)=>{setCasilleroId(c.id);setCasilleroSearch(c.name);setCasilleroResults([]);setShowNewCasillero(false);}}/>
      )}
      {/* B4 T15 (FLUJO-compras punto 6; RP28): las etapas reales del envío (3 si es directo, 4 por casillero, en el orden del
          arreglo) en la barra estándar, con la en curso resaltada; el aviso va en rojo solo si la etapa va atrasada.
          T15 r1 (m4, m14): un PEC cancelado no sigue su envío (seguimientoCerrado, la regla del detalle): sin la barra y
          con las tarjetas de solo lectura (sin editar, «En proceso», «Completado» ni «Revertir»). */}
      {cerrado ? (
        <p className="mb-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">{TEXTO_SEGUIMIENTO_CERRADO}</p>
      ) : (
        <div className="mb-6">
          <PasosFlujo variante="barra" pasos={pasosDeTracking(stages)} etiqueta={`Etapas del envío de ${pec.numero || 'este pedido'}`} />
        </div>
      )}

      {/* Stage cards */}
      {stages.map((sd) => {
        const status = sd.status || 'PENDIENTE';
        const history: any[] = sd.tracking_history || [];
        const isEditing = !cerrado && puedeEditar && editStage === sd.stage;
        // T15 r1 (m2, m6): UNA regla por tarjeta (avisoTarjetaEtapa): el aviso del servidor si lo hay (rojo si va
        // atrasada, neutro si no) o, si no, los días que faltan para la ETA (el día de calendario de Colombia).
        const aviso = cerrado ? null : avisoTarjetaEtapa(sd);
        return (
          <div key={sd.stage} className={'rounded-2xl border p-4 transition-all ' + (status==='COMPLETADO'?'border-emerald-200 bg-emerald-50':status==='EN_PROCESO'?'border-blue-200 bg-blue-50':'border-gray-200 bg-white')}>
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="font-bold text-sm text-gray-900">{sd.label}</p>
                {sd.timestamp && <p className="text-[10px] text-gray-500">{textoInstante(sd.timestamp)}</p>}
              </div>
              <div className="flex items-center gap-2">
                {/* RP28: el estado de la etapa en palabras (Pendiente, En curso, Completada, Cancelada), nunca el código. */}
                <span className={'text-xs font-black px-2 py-1 rounded-full ' + (status==='COMPLETADO'?'bg-emerald-100 text-emerald-700':status==='EN_PROCESO'?'bg-blue-100 text-blue-700':'bg-gray-100 text-gray-600')}>{etiquetaEtapaTracking(status)}</span>
                {!cerrado && puedeEditar && (
                  <button onClick={()=>openEdit(sd)} aria-label={`Editar la etapa ${sd.label || ''}`} className="p-1.5 hover:bg-white rounded-lg border border-gray-200 text-gray-500"><Edit2 size={12}/></button>
                )}
              </div>
            </div>

            {/* ETA / carrier / casillero / guía (T15 r1, m13: la guía vigente, como la barra de antes) / días */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500 mb-1">
              {sd.eta && <span className="flex items-center gap-1"><Clock size={11}/> ETA: <strong className="text-gray-700">{textoDia(sd.eta)}</strong></span>}
              {sd.carrier && <span>Carrier: <strong className="text-gray-700">{sd.carrier}</strong></span>}
              {sd.casillero_nombre && <span className="flex items-center gap-1"><MapPin size={11}/> {sd.casillero_nombre}</span>}
              {sd.tracking_number && <span>Guía: <strong className="text-indigo-700">{sd.tracking_number}</strong></span>}
              {aviso?.fuente === 'dias' && <span className={'font-bold ' + CLASE_DIAS_ETAPA[aviso.tono]}>{aviso.texto}</span>}
            </div>
            {aviso?.fuente === 'servidor' && (
              aviso.tono === 'rojo' ? (
                <div className="mb-2 px-3 py-1.5 bg-red-50 border border-red-200 rounded-lg text-xs font-bold text-red-700 flex items-center gap-1.5">
                  <AlertTriangle size={12}/> {aviso.texto}
                </div>
              ) : (
                <div className="mb-2 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-600 flex items-center gap-1.5">
                  <Clock size={12}/> {aviso.texto}
                </div>
              )
            )}

            {/* Edit form */}
            {isEditing && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">ETA de esta etapa</label>
                    <input type="date" value={eta} onChange={e=>setEta(e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  </div>
                  <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Carrier</label>
                    <input value={carrier} onChange={e=>setCarrier(e.target.value)} placeholder="ej: DHL" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  </div>
                </div>
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Numero de Guia / Tracking</label>
                  <input value={guia} onChange={e=>setGuia(e.target.value)} placeholder="ej: 1Z999AA1234567890" className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="relative">
                  <label className="text-xs font-black text-gray-400 uppercase mb-1 block">Casillero</label>
                  <input value={casilleroSearch} onChange={e=>onCasilleroSearch(e.target.value)} placeholder="Buscar casillero..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                  {casilleroResults.length > 0 && (
                    <div className="absolute left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg z-10 max-h-32 overflow-y-auto">
                      {casilleroResults.map((c:any)=>(
                        <button key={c.id} type="button" onClick={()=>{setCasilleroId(c.id);setCasilleroSearch(c.name);setCasilleroResults([]);}} className="w-full text-left px-3 py-2 hover:bg-purple-50 text-sm">{c.name}</button>
                      ))}
                    </div>
                  )}
                  {casilleroSearch && !casilleroId && (
                    <button type="button" onClick={()=>setShowNewCasillero(true)} className="mt-1 text-xs text-purple-600 font-bold hover:underline">+ Crear casillero "{casilleroSearch}"</button>
                  )}
                </div>
                <div><label className="text-xs font-black text-gray-400 uppercase mb-1 block">Notas</label>
                  <input value={notas} onChange={e=>setNotas(e.target.value)} placeholder="Notas de esta etapa..." className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {status !== 'EN_PROCESO' && <button onClick={()=>updateStage(sd.stage,'EN_PROCESO')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><Clock size={12}/> Marcar En Proceso</button>}
                  {status !== 'COMPLETADO' && <button onClick={()=>updateStage(sd.stage,'COMPLETADO')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 text-white rounded-xl text-xs font-bold disabled:opacity-50"><CheckCircle2 size={12}/> Marcar Completado</button>}
                  {status !== 'PENDIENTE' && <button onClick={()=>updateStage(sd.stage,'PENDIENTE')} disabled={!!updating} className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 rounded-xl text-xs font-bold disabled:opacity-50"><RotateCcw size={12}/> Revertir</button>}
                </div>
              </div>
            )}

            {/* Tracking history */}
            {history.length > 0 && (
              <div className="mt-2 pt-2 border-t border-gray-100">
                <p className="text-[10px] font-black text-gray-400 uppercase mb-1">Historial de guias:</p>
                {history.map((h:any,i:number) => (
                  <div key={i} className="flex items-center gap-2 text-[10px] text-gray-500">
                    <span className="text-indigo-600 font-bold">{h.numero}</span>
                    <span className="text-gray-300">&middot;</span>
                    <span>{fDate(h.fecha)}</span>
                    {h.notas && <span className="text-gray-400 italic truncate">"{h.notas}"</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================
   PEC DETAIL PANEL — full-width slide-over (left: 240px)
   ================================================================ */
type PropsPanelPec = {
  pec: any;
  onClose: () => void;
  onUpdate: () => void;
  onToast: AvisoPantalla;
  /** B4 T15 (R9, C15c): cancelar abre el ModalMotivo de la página (el mismo del menú de fila, del tablero y de la masiva). */
  onCancelar: (pec: any) => void;
  /** B4 T15 (m10 de T14): sube cuando la página pide releer el detalle (cancelar falló y el servidor pide recargar). */
  vueltaDetalle: number;
};

function PecDetailPanel({pec, onClose, onUpdate, onToast, onCancelar, vueltaDetalle}: PropsPanelPec) {
  const router = useRouter();
  // B4 T15 (RP30): «Eliminar definitivamente» con confirmar de useAvisos (nunca confirm()).
  const { confirmar } = useAvisos();
  const [detail, setDetail] = useState<any>(pec);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState('tracking');
  const [menuOpen, setMenuOpen] = useState(false);
  const [editEstado, setEditEstado] = useState(false);
  const [showConfig, setShowConfig] = useState(false);
  const [goingToRecepcion, setGoingToRecepcion] = useState(false);
  const [infoEdit, setInfoEdit] = useState(false);
  const [infoForm, setInfoForm] = useState<any>({});
  const [savingInfo, setSavingInfo] = useState(false);

  // "Hacer recepción": ir directo a LA recepción de este PEC, no al hub general
  // (con cientos de pedidos, aterrizar en la lista completa obliga a buscarla).
  // Si ya existe una (GoodsReceipt), abrirla; si no, crearla y abrir la nueva.
  async function goToRecepcion() {
    setGoingToRecepcion(true);
    try {
      const existing = detail?.recepciones?.[detail.recepciones.length - 1];
      if (existing?.id) { router.push(`/dashboard/compras/recepciones/${existing.id}`); return; }
      const user = localStorage.getItem('user_name') || '';
      const r = await apiFetch(`/compras/pedidos/${pec.id}/recepcionar`, {
        method: 'POST',
        body: JSON.stringify({ created_by: user, force_full: false }),
      });
      router.push(`/dashboard/compras/recepciones/${r.id}`);
    } catch (e: any) {
      onToast(e.message, 'error');
    }
    setGoingToRecepcion(false);
  }

  useEffect(()=>{setDetail(pec);setTab('tracking');},[pec?.id]);

  const loadFull = async () => {
    if (!pec) return;
    setLoading(true);
    try { const d = await apiFetch('/compras/pedidos/'+pec.id); setDetail(d); }
    catch(e:any) { onToast(e.message,'error'); }
    finally { setLoading(false); }
  };
  // B4 T15 (m10 de T14): también cuando la página lo pide (vueltaDetalle), para que el panel no quede con el estado viejo.
  useEffect(()=>{ if(pec) loadFull(); },[pec?.id, vueltaDetalle]);

  // B4 T15 (KANBAN-compras punto 6; R9, C15c): el botón Estado solo ofrece lo que acepta update_pec (transicionesPec):
  // emitir un borrador (PATCH) o cancelar, que abre el ModalMotivo de la página con su motivo. En tránsito y Recibido
  // los ponen el seguimiento y la recepción. Si el servidor dice que no, se ve su mensaje.
  // B4 T24 (FINAL-m10): «Estado», «Cancelar PEC» y «Eliminar definitivamente» solo con el rol del PATCH y el DELETE (accesoCompras).
  const accesoPec = accesoCompras(useRolActual());
  const transiciones = accesoPec.cambiarPec ? transicionesPec(detail?.estado) : [];
  const changeEstado = async (est: string) => {
    setEditEstado(false);
    if (est === 'CANCELADO') { onCancelar(detail ?? pec); return; }
    try {
      await apiFetch('/compras/pedidos/'+pec.id,{method:'PATCH',body:JSON.stringify({estado:est,updated_by:autorActual()})});
      onToast('Estado actualizado','ok'); onUpdate(); loadFull();
    } catch(e){
      onToast(e,'error');
      if (recargarTrasError(e)) { onUpdate(); loadFull(); }
    }
  };

  // El backend ya acepta editar proveedor/notas/fechas/modalidad via el mismo
  // PATCH que usa el cambio de estado -- solo faltaba exponerlo en la UI, que
  // antes solo mostraba estos campos como texto fijo.
  const openInfoEdit = () => {
    setInfoForm({
      supplier_name: detail?.supplier_name || '',
      supplier_ref: detail?.supplier_ref || '',
      modalidad_pago: detail?.modalidad_pago || 'Contado',
      metodo_pago: detail?.metodo_pago || '',
      fecha_entrega_estimada: detail?.fecha_entrega_estimada ? detail.fecha_entrega_estimada.slice(0,10) : '',
      notas: detail?.notas || '',
    });
    setInfoEdit(true);
  };
  const saveInfo = async () => {
    setSavingInfo(true);
    try {
      // B4 T15 (resolución 4; T12 r2): la fecha de entrega en blanco va como null (la borra), como en el alta.
      await apiFetch('/compras/pedidos/'+pec.id,{method:'PATCH',body:JSON.stringify({
        ...infoForm, fecha_entrega_estimada: infoForm.fecha_entrega_estimada || null, updated_by: autorActual(),
      })});
      onToast('Información actualizada','ok'); onUpdate(); await loadFull();
      setInfoEdit(false);
    } catch(e){
      onToast(e,'error');
      // T15 r1 (m9): si el PEC cambió en otro lado, recargarTrasError (400, 409, 422 o sin respuesta; 404 o 500, no) recarga lo que se ve.
      if (recargarTrasError(e)) { onUpdate(); loadFull(); }
    }
    setSavingInfo(false);
  };

  // B4 T15 (R9, RP30, RP93): sin confirm(): el motivo (5 letras o más) y lo que pasa al cancelar van en el ModalMotivo
  // de la página; al cancelar bien, el panel se cierra, como antes.
  const cancelPec = () => onCancelar(detail ?? pec);

  const deletePec = async () => {
    const numero = detail?.numero || pec.numero;
    if (!(await confirmar({
      titulo: `¿Eliminar definitivamente ${numero}?`, mensaje: 'El pedido de compra cancelado se borra y no se puede recuperar.',
      textoConfirmar: 'Eliminar definitivamente', peligro: true,
    }))) return;
    try {
      await apiFetch('/compras/pedidos/'+pec.id, {method:'DELETE'});
      onToast('PEC eliminado','ok'); onUpdate(); onClose();
    } catch(e){
      onToast(e,'error');
      if (recargarTrasError(e)) { onUpdate(); loadFull(); }
    }
  };

  if (!pec) return null;
  // C10: la etiqueta y el color de estados-compras.js (RECIBIDA y PARCIALMENTE_RECIBIDA ya no salen como «Borrador»).
  const est = { ...infoEstadoPec(detail?.estado).clases, label: infoEstadoPec(detail?.estado).label };
  const vencido = detail?.is_overdue ?? pec.is_overdue;
  const pvens = detail?.pedidos_venta?.length ? detail.pedidos_venta.map((v:any)=>v.numero) : (detail?.ven_numero ? [detail.ven_numero] : []);

  return (
    <>
      {showConfig && <TrackingConfigModal onClose={()=>setShowConfig(false)} onToast={onToast}/>}
      <div className="fixed inset-0 bg-gray-900/20 backdrop-blur-sm z-40" onClick={onClose}/>
      <div className="fixed top-0 bottom-0 right-0 z-50 bg-white shadow-2xl flex flex-col" style={{left:'240px'}}>
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-4 border-b border-gray-100 bg-gradient-to-r from-purple-50 to-white shrink-0">
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-3 flex-wrap">
                <h2 className="text-xl font-black text-gray-900">{detail?.numero || pec.numero}</h2>
                <span className={'px-2.5 py-1 rounded-full text-xs font-black border ' + est.bg + ' ' + est.text + ' ' + est.border}>{est.label}</span>
                {vencido && <span className="px-2 py-0.5 bg-red-100 text-red-700 rounded-full text-xs font-black border border-red-200">Vencido</span>}
                {pvens.map((v:string,i:number)=><span key={i} className="px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full text-xs font-bold border border-indigo-200">{v}</span>)}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">{detail?.supplier_name||'-'} {detail?.created_by && '· '+detail.created_by}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* B4 T15 (R9): «Estado» solo si el servidor acepta algún cambio a mano (transicionesPec). */}
            {transiciones.length > 0 && (
              <button onClick={()=>setEditEstado(x=>!x)} aria-expanded={editEstado} className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-xl text-xs font-bold hover:bg-purple-100"><Edit2 size={12}/> Estado</button>
            )}
            {/* r1 (m2, m7): PUT /compras/tracking-config/{tipo} es de ADMIN y COMPRAS (el GET, de todos). */}
            {accesoPec.cambiarPec && (
              <button onClick={()=>setShowConfig(true)} title="Configurar etapas, alertas y casilleros" aria-label="Configurar etapas, alertas y casilleros" className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><Settings2 size={16}/></button>
            )}
            <div className="relative">
              <button onClick={()=>setMenuOpen(m=>!m)} aria-label={`Acciones de ${detail?.numero || pec.numero}`} aria-expanded={menuOpen} className="p-2 hover:bg-gray-100 rounded-xl text-gray-500"><MoreHorizontal size={18}/></button>
              {menuOpen && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl py-2 w-52 z-10" onClick={(e:any)=>e.stopPropagation()}>
                  <button onClick={()=>{setMenuOpen(false);loadFull();}} className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm flex items-center gap-2"><RefreshCw size={13}/> Recargar</button>
                  {/* B4 T15 (R9): «Cancelar PEC» solo si update_pec lo acepta; «Eliminar definitivamente», solo cancelado. */}
                  {transiciones.includes('CANCELADO') && (
                    <>
                      <div className="border-t border-gray-100 my-1"/>
                      <button onClick={()=>{cancelPec();setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Cancelar PEC</button>
                    </>
                  )}
                  {accesoPec.cambiarPec && etapaPec(detail?.estado) === 'cancelado' && (
                    <>
                      <div className="border-t border-gray-100 my-1"/>
                      <button onClick={()=>{deletePec();setMenuOpen(false);}} className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-sm text-red-600 flex items-center gap-2"><Trash2 size={13}/> Eliminar definitivamente</button>
                    </>
                  )}
                </div>
              )}
            </div>
            <button onClick={onClose} aria-label="Cerrar el panel" className="p-2 hover:bg-gray-200 rounded-xl text-gray-500"><X size={18}/></button>
          </div>
        </div>

        {/* Cambiar estado inline (B4 T15, R9): solo lo que acepta el servidor; cancelar pide el motivo. */}
        {editEstado && transiciones.length > 0 && (
          <div className="px-8 py-3 border-b border-purple-100 bg-purple-50 flex flex-wrap items-center gap-2 shrink-0">
            {transiciones.map((k)=>{
              const v = infoEstadoPec(k);
              return <button key={k} onClick={()=>changeEstado(k)} className="px-3 py-1.5 rounded-xl text-xs font-bold border transition-all bg-white border-gray-200 text-gray-600 hover:bg-gray-50">{v.label}</button>;
            })}
            <p className="text-xs text-gray-500">En tránsito lo marca el seguimiento del envío y Recibido, la recepción en bodega.</p>
          </div>
        )}

        {/* Tabs */}
        <div className="flex items-center gap-1 px-8 py-2 border-b border-gray-100 shrink-0">
          {[{k:'tracking',l:'Tracking'},{k:'productos',l:'Productos'},{k:'pvens',l:'Pedidos Venta'},{k:'info',l:'Info'},{k:'actividad',l:'Actividad'}].map(({k,l})=>(
            <button key={k} onClick={()=>setTab(k)} className={'px-3 py-1.5 rounded-lg text-sm font-bold transition-all ' + (tab===k?'bg-purple-600 text-white shadow':'text-gray-600 hover:bg-purple-50 hover:text-purple-700')}>{l}</button>
          ))}
        </div>

        {/* Mercancía recibida: falta hacer la recepción física, o ya existe y
            hay que poder volver a ella -- antes el banner (y su unico link a
            la recepcion) desaparecia por completo en cuanto se creaba una,
            dejando sin forma de volver a encontrarla desde el PEC. */}
        {['RECIBIDO','RECIBIDA'].includes(detail?.estado) && (
          <div className="mx-8 mt-4 bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-white rounded-full flex items-center justify-center text-emerald-600 shadow-sm"><PackageCheck size={18}/></div>
              <div>
                <p className="font-black text-emerald-900 text-sm">
                  {detail?.recepciones?.length > 0 ? 'Mercancía recibida en bodega' : 'Mercancía recibida en bodega, pendiente de recepción'}
                </p>
                <p className="text-xs text-emerald-700">
                  {detail?.recepciones?.length > 0
                    ? `Recepción ${detail.recepciones[detail.recepciones.length-1].numero} en curso.`
                    : 'Inicia el conteo físico de este pedido.'}
                </p>
              </div>
            </div>
            {/* r1 (m7): «Hacer recepción» la crea (POST /pedidos/{id}/recepcionar: ADMIN y COMPRAS); «Ver recepción» solo navega. */}
            {(detail?.recepciones?.length > 0 || accesoPec.cambiarPec) && (
              <button onClick={goToRecepcion} disabled={goingToRecepcion} className="bg-emerald-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow-sm hover:bg-emerald-700 transition-colors shrink-0 disabled:opacity-50 flex items-center gap-2">
                {goingToRecepcion && <RefreshCw size={12} className="animate-spin"/>}
                {detail?.recepciones?.length > 0 ? 'Ver recepción' : 'Hacer recepción'}
              </button>
            )}
          </div>
        )}

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* LEFT 45% — Info */}
          <div className="w-[45%] border-r border-gray-100 bg-gray-50/50 p-6 overflow-y-auto space-y-4 shrink-0">
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Proveedor</p>
              <p className="font-bold text-gray-900">{detail?.supplier_name||'-'}</p>
              {detail?.supplier_ref && <p className="text-xs text-gray-400 mt-0.5">Ref: {detail.supplier_ref}</p>}
              {detail?.tipo_envio && <p className="text-xs text-purple-600 font-bold mt-1 capitalize">Tipo: {detail.tipo_envio === 'directo' ? 'Directo Colombia' : 'Vía casillero'}</p>}
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Fechas</p>
              <div className="space-y-2 text-sm">
                {/* B4 T15 (resolución 4): la fecha de compra es un instante; la entrega y la alerta, días de negocio (RP40). */}
                {[['Fecha Compra',textoInstante(detail?.fecha_compra||detail?.created_at)],
                  ['Entrega Est.',textoDia(detail?.fecha_entrega_estimada)],
                  ['Alerta',textoDia(detail?.fecha_alerta)]].map(([l,v],i)=>(
                  <div key={i} className="flex justify-between">
                    <span className="text-gray-500">{l}</span>
                    <span className={'font-bold ' + (l==='Entrega Est.'&&vencido?'text-red-600':'text-gray-900')}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Montos</p>
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between py-1 border-b"><span className="text-gray-500">Subtotal</span><span className="font-bold">{fCOP(detail?.subtotal_cop)}</span></div>
                <div className="flex justify-between py-1"><span className="text-gray-500">Total COP</span><span className="font-black text-gray-900 text-base">{fCOP(detail?.total_cop)}</span></div>
              </div>
            </div>
            <div className="bg-white rounded-2xl p-5 shadow-sm border border-gray-100">
              <p className="text-xs font-black text-gray-400 uppercase mb-3">Logística</p>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                {[['Modalidad',detail?.modalidad_pago||'-'],['Carrier',detail?.carrier||'-'],['Casillero',detail?.casillero_nombre||'-'],['Tracking',detail?.tracking_number||'-']].map(([l,v],i)=>(
                  <div key={i}><span className="block text-gray-400 font-black uppercase mb-0.5">{l}</span>{v}</div>
                ))}
              </div>
            </div>
            {detail?.notas && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                <p className="text-xs font-black text-amber-700 uppercase mb-1">Notas</p>
                <p className="text-sm text-amber-900">{detail.notas}</p>
              </div>
            )}
          </div>

          {/* RIGHT 55% */}
          <div className="w-[55%] p-6 overflow-y-auto">
            {loading && <div className="flex justify-center py-12"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"/></div>}

            {!loading && tab === 'tracking' && (
              <TrackingPanel pec={detail||pec} puedeEditar={accesoPec.tracking} onUpdate={()=>{loadFull();onUpdate();}} onToast={onToast}/>
            )}

            {!loading && tab === 'productos' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
                <div className="p-4 border-b border-gray-100"><p className="text-xs font-black text-gray-400 uppercase">Productos del PEC</p></div>
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-xs text-gray-400 font-black uppercase border-b">
                    <tr><th className="px-4 py-3 text-left">Producto</th><th className="px-4 py-3 text-center">Destino</th><th className="px-4 py-3 text-center">Qty</th><th className="px-4 py-3 text-right">Precio</th><th className="px-4 py-3 text-right">Subtotal</th></tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {(detail?.productos||[]).map((p:any,i:number)=>(
                      <tr key={i} className="hover:bg-gray-50">
                        <td className="px-4 py-3 font-medium truncate max-w-[160px]">{p.producto_nombre||p.descripcion||p.nombre||'-'}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${p.destino==='MAU'?'bg-purple-100 text-purple-700':p.destino==='NEBULAE'?'bg-blue-100 text-blue-700':'bg-emerald-100 text-emerald-700'}`}>
                            {p.destino==='MAU'?'Socio Mau':p.destino==='NEBULAE'?'Stock Nebulae':(p.cliente_nombre ? `Cliente (${p.cliente_nombre})` : 'Cliente')}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center font-bold">{p.qty||p.cantidad||0}</td>
                        <td className="px-4 py-3 text-right text-gray-500">{fCOP(p.unit_price_cop||p.precio_unitario||0)}</td>
                        <td className="px-4 py-3 text-right font-bold">{fCOP((p.qty||p.cantidad||0)*(p.unit_price_cop||p.precio_unitario||0))}</td>
                      </tr>
                    ))}
                    {!(detail?.productos?.length) && <tr><td colSpan={5} className="text-center py-8 text-gray-400 text-xs">Sin productos</td></tr>}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && tab === 'pvens' && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                <p className="text-xs font-black text-gray-400 uppercase mb-4">Pedidos de Venta Asociados</p>
                {/* pedidos_venta viene de SaleOrder.pec_id (el vinculo real y
                    completo) en vez del ven_id/ven_numero del PEC, que solo
                    guardan el primer PVEN de una compra consolidada -- asi se
                    ven y enlazan TODOS los PVEN, no solo el primero. */}
                {!(detail?.pedidos_venta?.length) ? (
                  <p className="text-gray-400 text-sm text-center py-6">Sin PVEN asociados</p>
                ) : detail.pedidos_venta.map((v:any)=>(
                  <div key={v.id} className="flex items-center justify-between p-3 bg-indigo-50 rounded-xl border border-indigo-100 mb-2">
                    <div>
                      <span className="font-bold text-indigo-700 block">{v.numero}</span>
                      <span className="text-xs text-gray-500">{v.customer_name||'-'} · {fCOP(v.total_cop)}</span>
                    </div>
                    <Link href={`/dashboard/ventas/venta?id=${v.id}`} className="text-xs text-indigo-600 hover:text-indigo-800 flex items-center gap-1 font-bold"><ExternalLink size={11}/> Ver</Link>
                  </div>
                ))}
              </div>
            )}

            {!loading && tab === 'info' && (
              <div className="space-y-4">
                <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <p className="text-xs font-black text-gray-400 uppercase">Información del PEC</p>
                    {/* r1 (m7): «Editar» guarda con PATCH /pedidos/{id} (ADMIN y COMPRAS). */}
                    {!infoEdit ? (accesoPec.cambiarPec && (
                      <button onClick={openInfoEdit} className="flex items-center gap-1 text-xs font-bold text-purple-600 hover:text-purple-800"><Edit2 size={12}/> Editar</button>
                    )) : (
                      <div className="flex gap-2">
                        <button onClick={()=>setInfoEdit(false)} disabled={savingInfo} className="text-xs font-bold text-gray-500 hover:text-gray-700 disabled:opacity-50">Cancelar</button>
                        <button onClick={saveInfo} disabled={savingInfo} className="flex items-center gap-1 text-xs font-bold text-white bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg disabled:opacity-50">
                          {savingInfo && <RefreshCw size={11} className="animate-spin"/>} Guardar
                        </button>
                      </div>
                    )}
                  </div>
                  {!infoEdit ? (
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      {[['Número',detail?.numero],['Estado',est.label],['Proveedor',detail?.supplier_name||'-'],['Ref/NIT',detail?.supplier_ref||'-'],['Modalidad de pago',detail?.modalidad_pago||'-'],['Método de pago',detail?.metodo_pago||'-'],['Entrega Est.',textoDia(detail?.fecha_entrega_estimada)],['Creado por',detail?.created_by||'-'],['Actualizado',textoInstante(detail?.updated_at)]].map(([l,v],i)=>(
                        <div key={i}><span className="block text-gray-400 text-xs font-black uppercase mb-0.5">{l}</span><span className="font-bold text-gray-900">{v||'-'}</span></div>
                      ))}
                      <div className="col-span-2"><span className="block text-gray-400 text-xs font-black uppercase mb-0.5">Notas</span><span className="font-bold text-gray-900 whitespace-pre-wrap">{detail?.notas||'-'}</span></div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Proveedor</label>
                        <input value={infoForm.supplier_name} onChange={e=>setInfoForm((f:any)=>({...f,supplier_name:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Ref/NIT</label>
                        <input value={infoForm.supplier_ref} onChange={e=>setInfoForm((f:any)=>({...f,supplier_ref:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Modalidad de pago</label>
                        <select value={infoForm.modalidad_pago} onChange={e=>setInfoForm((f:any)=>({...f,modalidad_pago:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200">
                          {/* Si el valor guardado no esta en esta lista (formato viejo/libre,
                              ej. "Credito 60d" en vez de "Credito 60 dias"), se agrega como
                              opcion extra para que el select muestre el valor real en vez de
                              caer en la primera opcion silenciosamente. */}
                          {(['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'] as string[])
                            .concat(infoForm.modalidad_pago && !['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'].includes(infoForm.modalidad_pago) ? [infoForm.modalidad_pago] : [])
                            .map(o=><option key={o}>{o}</option>)}
                        </select></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Método de pago</label>
                        <input value={infoForm.metodo_pago} onChange={e=>setInfoForm((f:any)=>({...f,metodo_pago:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div><label className="block text-gray-400 text-xs font-black uppercase mb-1">Fecha Entrega Est.</label>
                        <input type="date" value={infoForm.fecha_entrega_estimada} onChange={e=>setInfoForm((f:any)=>({...f,fecha_entrega_estimada:e.target.value}))} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-purple-200"/></div>
                      <div className="col-span-2"><label className="block text-gray-400 text-xs font-black uppercase mb-1">Notas</label>
                        <textarea value={infoForm.notas} onChange={e=>setInfoForm((f:any)=>({...f,notas:e.target.value}))} rows={3} className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-purple-200"/></div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!loading && tab === 'actividad' && (
              <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <p className="text-xs font-black text-gray-400 uppercase mb-4">Historial de Actividad</p>
                <div className="relative border-l-2 border-gray-100 ml-4 pl-6 pb-2">
                  {(detail?.actividades||[]).map((a:any,i:number)=>(
                    <div key={i} className="mb-4 relative">
                      <div className="absolute -left-[29px] top-1.5 w-4 h-4 rounded-full bg-white border-2 border-purple-200"/>
                      <p className="text-xs text-gray-400 mb-0.5">{fDate(a.created_at)}{a.user_name&&' · '+a.user_name}</p>
                      <p className="font-bold text-gray-700 text-sm">{a.description||a.action}</p>
                      {a.old_estado&&a.new_estado&&<p className="text-xs text-gray-500">{infoEstadoPec(a.old_estado).label} → {infoEstadoPec(a.new_estado).label}</p>}
                    </div>
                  ))}
                  {!(detail?.actividades?.length)&&<p className="text-gray-400 text-xs py-4 text-center">Sin historial registrado</p>}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   NUEVO PEC MODAL — Odoo-style full form
   ================================================================ */
type PropsNuevoPec = {
  pedidosVenta: any[];
  onClose: () => void;
  onCreated: () => void;
  onToast: AvisoPantalla;
  /** B4 T15 (m9 de T14): el error de GET /ventas/pedidos (los PVEN pendientes de compra), y volver a pedirla. */
  errorVentas: unknown;
  onReintentarVentas: () => void;
};

function NuevoPecModal({pedidosVenta, onClose, onCreated, onToast, errorVentas, onReintentarVentas}: PropsNuevoPec) {
  const [supplierSearch, setSupplierSearch] = useState('');
  // T15 r1 (m9): los errores de las búsquedas (proveedor, casillero y producto) se dicen (antes se callaban).
  const { avisarError } = useAvisos();
  const [supplierResults, setSupplierResults] = useState<any[]>([]);
  const [selectedSupplier, setSelectedSupplier] = useState<any>(null);
  const [showNewSupplier, setShowNewSupplier] = useState(false);
  const [supplierTimer, setSupplierTimer] = useState<any>(null);
  const [casilleroSearch, setCasilleroSearch] = useState('');
  const [casilleroResults, setCasilleroResults] = useState<any[]>([]);
  const [selectedCasillero, setSelectedCasillero] = useState<any>(null);
  const [showNewCasillero, setShowNewCasillero] = useState(false);
  const [casilleroTimer, setCasilleroTimer] = useState<any>(null);
  const [form, setForm] = useState({
    modalidad_pago:'Contado', metodo_pago:'', tipo_envio:'casillero',
    fecha_entrega_estimada:'', notas:'', carrier:'', dias_entrega:15,
    subtotal_cop:0, total_cop:0,
  });
  const [productos, setProductos] = useState<any[]>([]);
  const [selectedPvens, setSelectedPvens] = useState<Set<number>>(new Set());
  const [saving, setSaving] = useState(false);
  const [modalTab, setModalTab] = useState('info');
  const [searchPven, setSearchPven] = useState('');

  const setF = (k:string, v:any) => setForm(f=>({...f,[k]:v}));

  const onSupplierType = (val: string) => {
    setSupplierSearch(val);
    setSelectedSupplier(null);
    clearTimeout(supplierTimer);
    if (!val.trim()) { setSupplierResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/compras/proveedores/search?q='+encodeURIComponent(val));
        const arr = Array.isArray(res) ? res : (res?.data || []);
        setSupplierResults(arr);
        if (arr.length === 0) setShowNewSupplier(true);
      } catch (err) { avisarError(err, 'No se pudo buscar el proveedor'); }
    }, 350);
    setSupplierTimer(t);
  };

  const onCasilleroType = (val: string) => {
    setCasilleroSearch(val);
    setSelectedCasillero(null);
    clearTimeout(casilleroTimer);
    if (!val.trim()) { setCasilleroResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/compras/casilleros/search?q='+encodeURIComponent(val));
        const arr = Array.isArray(res) ? res : (res?.data || []);
        setCasilleroResults(arr);
        if (arr.length === 0) setShowNewCasillero(true);
      } catch (err) { avisarError(err, 'No se pudo buscar el casillero'); }
    }, 350);
    setCasilleroTimer(t);
  };

  const addProduct = () => setProductos(prev => [...prev, {nombre:'',descripcion:'',sku_id:null,qty:1,unit_price_cop:0,impuesto_pct:0,tracking:'',entrega_est:'',casillero:'',notas:'',estado:'PENDIENTE',destino:'CLIENTE'}]);
  const setProd = (i:number, k:string, v:any) => setProductos(prev => prev.map((p,idx)=>idx===i?{...p,[k]:v}:p));
  const delProd = (i:number) => setProductos(prev => prev.filter((_,idx)=>idx!==i));

  // Product autocomplete for PEC lines — without this, descripcion is free
  // text with no sku_id, so purchase_order_lines.sku_id (and everything that
  // depends on it downstream: goods_receipt_lines, InventoryLevel) stays
  // NULL forever and a completed reception never actually moves stock, no
  // matter how many tracking stages get marked done. Confirmed live: a
  // 5-unit reception on a text-only line closed as "Validado" but
  // stock_actualizado stayed false because receipt_type=="FISICA" still
  // requires a real sku_id to touch InventoryLevel.
  const [prodSearchIdx, setProdSearchIdx] = useState<number|null>(null);
  const [prodSearchResults, setProdSearchResults] = useState<any[]>([]);
  const [prodSearchTimer, setProdSearchTimer] = useState<any>(null);

  const searchProduct = (i:number, val:string) => {
    setProd(i, 'descripcion', val);
    setProd(i, 'sku_id', null); // typing again after picking one un-links it — must re-pick to relink
    setProdSearchIdx(i);
    if (prodSearchTimer) clearTimeout(prodSearchTimer);
    if (!val || val.length < 1) { setProdSearchResults([]); return; }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch('/crm/products/search?q='+encodeURIComponent(val));
        setProdSearchResults(Array.isArray(res) ? res : (res?.data || []));
      } catch (err) { setProdSearchResults([]); avisarError(err, 'No se pudo buscar el producto'); }
    }, 300);
    setProdSearchTimer(t);
  };

  const pickProduct = (i:number, item:any) => {
    setProductos(prev => prev.map((p,idx)=>idx===i?{
      ...p, descripcion: item.display || item.product_name, sku_id: item.id,
      unit_price_cop: Number(p.unit_price_cop) > 0 ? p.unit_price_cop : item.sale_price,
    }:p));
    setProdSearchIdx(null);
    setProdSearchResults([]);
  };

  useEffect(() => {
    // Always derive from the current lines — falling back to the previous
    // form.subtotal_cop when it was already non-zero (as this used to do)
    // meant that once any line got a price, editing qty/price afterward on
    // any line no longer recalculated the total: it stuck at whatever the
    // subtotal happened to be the first time this effect saw a non-zero value.
    const sub = productos.reduce((s,p)=>s+(Number(p.qty||0)*Number(p.unit_price_cop||0)),0);
    setF('subtotal_cop', sub);
    setF('total_cop', sub);
  }, [productos]);

  const filteredPvens = pedidosVenta.filter(p =>
    p.estado === 'PENDIENTE_COMPRA' &&
    JSON.stringify(p).toLowerCase().includes(searchPven.toLowerCase())
  );

  async function submit() {
    if (!selectedSupplier) { onToast('Selecciona un proveedor','error'); return; }
    const sinPrecio = productos.find(p => !(Number(p.unit_price_cop) > 0));
    if (sinPrecio) {
      onToast(`"${sinPrecio.nombre || sinPrecio.descripcion || 'Un producto'}" no tiene precio. Ingresa un precio antes de crear el pedido.`, 'error');
      return;
    }
    setSaving(true);
    try {
      const user = localStorage.getItem('user_name') || '';
      const pvensSelected = pedidosVenta.filter(p=>selectedPvens.has(p.id));
      const payload = {
        supplier_id: selectedSupplier.id,
        supplier_name: selectedSupplier.name,
        supplier_ref: selectedSupplier.reference,
        ven_id: pvensSelected[0]?.id || null,
        // ven_numero es VARCHAR(20) en la BD -- no cabe una lista unida por comas
        // de varios PVEN reales. El vinculo real de cada PVEN adicional vive en
        // su propio pec_id/pec_numero (ver loop de PATCH mas abajo), asi que aqui
        // solo va el primero como referencia legible.
        ven_numero: pvensSelected[0]?.numero || null,
        modalidad_pago: form.modalidad_pago,
        metodo_pago: form.metodo_pago || null,
        tipo_envio: form.tipo_envio,
        casillero_id: selectedCasillero?.id || null,
        carrier: form.carrier || null,
        dias_entrega: Number(form.dias_entrega) || 15,
        fecha_entrega_estimada: form.fecha_entrega_estimada || null,
        notas: form.notas || null,
        productos: productos.map(p=>({...p,qty:Number(p.qty),unit_price_cop:Number(p.unit_price_cop)})),
        subtotal_cop: form.subtotal_cop,
        total_cop: form.total_cop,
        created_by: user,
      };
      const pec = await apiFetch('/compras/pedidos',{method:'POST',body:JSON.stringify(payload)});
      const pecObj = pec?.data ?? pec;
      // El POST solo vincula el primer PVEN seleccionado (payload.ven_id); el resto
      // se vincula aqui explicitamente para que TODOS los PVEN marcados queden con
      // pec_id/pec_numero, no solo el primero.
      const restantes = pvensSelected.slice(1);
      // B4 T15: un PVEN que no se pudo vincular se dice con el mensaje del servidor (antes el error se tragaba).
      const sinVincular: string[] = [];
      for (const pv of restantes) {
        try {
          await apiFetch(`/ventas/pedidos/${pv.id}`,{method:'PATCH',body:JSON.stringify({
            pec_id: pecObj.id, pec_numero: pecObj.numero, estado:'EN_PROCESO', updated_by:user,
          })});
        } catch (err) { sinVincular.push(`${pv.numero}: ${textoDeError(err)}`); }
      }
      onToast('PEC creado exitosamente','ok');
      if (sinVincular.length > 0) onToast(`No se pudieron vincular al PEC: ${sinVincular.join('; ')}`, 'error');
      onCreated();
      onClose();
    } catch(e:any){ onToast(e.message,'error'); }
    setSaving(false);
  }

  const totalCalc = productos.reduce((s,p)=>s+(Number(p.qty||0)*Number(p.unit_price_cop||0)),0);

  return (
    <>
      {showNewSupplier && (
        <NewSupplierModal
          onSave={(s)=>{setSelectedSupplier(s);setSupplierSearch(s.name);setSupplierResults([]);setShowNewSupplier(false);}}
          onClose={()=>setShowNewSupplier(false)}
        />
      )}
      {showNewCasillero && (
        <NewCasilleroModal
          onSave={(c)=>{setSelectedCasillero(c);setCasilleroSearch(c.name);setCasilleroResults([]);setShowNewCasillero(false);}}
          onClose={()=>setShowNewCasillero(false)}
        />
      )}
      <div className="fixed inset-0 z-[80] flex items-start justify-center bg-slate-900/60 backdrop-blur-sm p-4 overflow-auto">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl my-4 overflow-hidden flex flex-col max-h-[96vh]">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 bg-purple-50 shrink-0">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-xl"><ShoppingCart size={20} className="text-purple-700"/></div>
                <div>
                  <h2 className="text-lg font-black text-gray-900">Nuevo Pedido de Compra</h2>
                  <p className="text-xs text-gray-500">PEC-YYYY#### · {selectedSupplier ? selectedSupplier.name : 'Sin proveedor'}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-2 hover:bg-purple-100 rounded-xl"><X size={18}/></button>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {saving?<RefreshCw size={13} className="animate-spin"/>:<Send size={13}/>} {saving?'Guardando...':'Crear PEC'}
              </button>
              <button onClick={onClose} className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-200 text-gray-600 rounded-xl text-sm font-semibold hover:bg-gray-50"><X size={13}/> Cancelar</button>
              <div className="flex-1"/>
              <div className="flex gap-1">
                {['info','pvens'].map(t=>(
                  <button key={t} onClick={()=>setModalTab(t)} className={'px-3 py-1.5 rounded-lg text-xs font-bold ' + (modalTab===t?'bg-purple-600 text-white':'bg-white text-gray-600 hover:bg-purple-50 border border-gray-200')}>
                    {t==='info'?'Informacion del Pedido':'Pedidos de Venta'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-1 overflow-hidden">
            {/* LEFT — Form */}
            <div className="flex-1 overflow-y-auto p-6">
              {modalTab === 'info' && (
                <div className="space-y-6">
                  {/* Proveedor */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Proveedor</p>
                    <div className="relative">
                      <input value={supplierSearch} onChange={e=>onSupplierType(e.target.value)}
                        placeholder="Buscar proveedor por nombre o NIT..."
                        className={'w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 ' + (selectedSupplier?'border-emerald-300 bg-emerald-50':'border-gray-200')}/>
                      {selectedSupplier && <CheckCircle2 size={16} className="absolute right-3 top-3 text-emerald-600"/>}
                      {supplierResults.length > 0 && !selectedSupplier && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-10 overflow-hidden">
                          {supplierResults.map((s:any)=>(
                            <button key={s.id} onClick={()=>{setSelectedSupplier(s);setSupplierSearch(s.name);setSupplierResults([]);}} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-black text-xs shrink-0">{s.name[0]}</div>
                              <div><p className="font-bold text-gray-900">{s.name}</p><p className="text-xs text-gray-400">{s.reference||s.city||''}</p></div>
                            </button>
                          ))}
                          <button onClick={()=>setShowNewSupplier(true)} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-2 text-purple-600 font-bold border-t border-gray-100">
                            <UserPlus size={13}/> Agregar nuevo proveedor
                          </button>
                        </div>
                      )}
                    </div>
                    {selectedSupplier && (
                      <div className="mt-3 grid grid-cols-3 gap-3 text-xs text-gray-600">
                        {[['Ref/NIT',selectedSupplier.reference||'-'],['Contacto',selectedSupplier.contact_name||'-'],['Ciudad',selectedSupplier.city||'-']].map(([l,v])=>(
                          <div key={l}><span className="block text-gray-400 font-black uppercase mb-0.5">{l}</span>{v}</div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Detalles del pedido */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <p className="text-xs font-black text-gray-400 uppercase mb-4">Detalles del Pedido</p>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Tipo de Envio</label>
                        <select value={form.tipo_envio} onChange={e=>setF('tipo_envio',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                          <option value="casillero">Vía casillero</option>
                          <option value="directo">Directo Colombia</option>
                        </select>
                      </div>
                      {form.tipo_envio === 'casillero' && (
                        <div className="relative">
                          <label className="block text-xs font-black text-gray-500 uppercase mb-1">Casillero</label>
                          <input value={casilleroSearch} onChange={e=>onCasilleroType(e.target.value)}
                            placeholder="Buscar casillero..."
                            className={'w-full border rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 ' + (selectedCasillero?'border-emerald-300 bg-emerald-50':'border-gray-200')}/>
                          {selectedCasillero && <CheckCircle2 size={16} className="absolute right-3 top-9 text-emerald-600"/>}
                          {casilleroResults.length > 0 && !selectedCasillero && (
                            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-2xl shadow-2xl z-10 overflow-hidden">
                              {casilleroResults.map((c:any)=>(
                                <button key={c.id} type="button" onClick={()=>{setSelectedCasillero(c);setCasilleroSearch(c.name);setCasilleroResults([]);}} className="w-full text-left px-4 py-2.5 hover:bg-purple-50 text-sm">{c.name}</button>
                              ))}
                              <button type="button" onClick={()=>setShowNewCasillero(true)} className="w-full text-left px-4 py-3 hover:bg-purple-50 text-sm flex items-center gap-2 text-purple-600 font-bold border-t border-gray-100">
                                <Plus size={13}/> Agregar nuevo casillero
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Carrier</label>
                        <input value={form.carrier} onChange={e=>setF('carrier',e.target.value)} placeholder="ej: DHL, FedEx, Amazon" className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Modalidad de pago</label>
                        <select value={form.modalidad_pago} onChange={e=>setF('modalidad_pago',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 bg-white">
                          {['Contado','60/40 (60% anticipo)','Credito 30 dias','Credito 60 dias','Otro'].map(m=><option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Entrega Estimada (dias)</label>
                        <input type="number" value={form.dias_entrega} onChange={e=>setF('dias_entrega',Number(e.target.value))} min={1} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                      <div>
                        <label className="block text-xs font-black text-gray-500 uppercase mb-1">Fecha Entrega Est.</label>
                        <input type="date" value={form.fecha_entrega_estimada} onChange={e=>setF('fecha_entrega_estimada',e.target.value)} className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200"/>
                      </div>
                    </div>
                    <div className="mt-4">
                      <label className="block text-xs font-black text-gray-500 uppercase mb-1">Notas internas</label>
                      <textarea value={form.notas} onChange={e=>setF('notas',e.target.value)} rows={2} placeholder="Instrucciones para el proveedor, condiciones especiales..." className="w-full border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-purple-200 resize-none"/>
                    </div>
                  </div>

                  {/* Productos */}
                  <div className="bg-gray-50 rounded-2xl p-5 border border-gray-200">
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-xs font-black text-gray-400 uppercase">Productos / Lineas de Compra</p>
                      <button onClick={addProduct} className="flex items-center gap-1.5 text-xs font-bold text-purple-600 hover:bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-200 bg-white"><Plus size={12}/> Agregar linea</button>
                    </div>
                    {productos.length === 0 ? (
                      <div className="text-center py-8 text-gray-400">
                        <Package size={28} className="mx-auto mb-2 opacity-30"/>
                        <p className="text-sm">Sin productos. Haz click en "Agregar linea"</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                          <thead className="border-b border-gray-200 text-xs text-gray-400 font-black uppercase">
                            <tr>
                              <th className="pb-2 text-left pr-3 min-w-[180px]">Producto</th>
                              <th className="pb-2 text-center w-28">Destino</th>
                              <th className="pb-2 text-center w-16">Qty</th>
                              <th className="pb-2 text-right w-28">Precio COP</th>
                              <th className="pb-2 text-center w-16">IVA %</th>
                              <th className="pb-2 text-left min-w-[100px]">Tracking</th>
                              <th className="pb-2 text-left min-w-[100px]">Entrega Est.</th>
                              <th className="pb-2 text-right w-24">Subtotal</th>
                              <th className="pb-2 w-8"></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {productos.map((p,i)=>(
                              <tr key={i} className="group">
                                <td className="py-2 pr-3 relative">
                                  <input value={p.nombre||p.descripcion||''} onChange={e=>searchProduct(i,e.target.value)} onFocus={()=>setProdSearchIdx(i)}
                                    placeholder="Buscar producto del catalogo..."
                                    className={`w-full border rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 ${p.sku_id ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200'}`}/>
                                  {p.sku_id && <span className="absolute right-2 top-1.5 text-[10px] text-emerald-600" title="Vinculado al catalogo (sku_id presente)">&#10003;</span>}
                                  {prodSearchIdx===i && prodSearchResults.length>0 && (
                                    <div className="absolute z-20 top-full left-0 w-64 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 max-h-48 overflow-y-auto">
                                      {prodSearchResults.map((r:any)=>(
                                        <button type="button" key={r.id} onClick={()=>pickProduct(i,r)}
                                          className="w-full text-left px-3 py-2 text-xs hover:bg-purple-50 border-b border-gray-100 last:border-0">
                                          <div className="font-bold text-gray-800">{r.product_name}</div>
                                          {r.sku && <div className="text-gray-400">{r.sku} · {fCOP(r.sale_price)}</div>}
                                        </button>
                                      ))}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2 pr-2 text-center"><select value={p.destino||'CLIENTE'} onChange={e=>setProd(i,'destino',e.target.value)} className="w-28 border border-gray-200 rounded-lg px-1.5 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200 bg-white font-semibold"><option value="CLIENTE">Cliente</option><option value="NEBULAE">Stock Nebulae</option><option value="MAU">Socio Mau</option></select></td>
                                <td className="py-2 text-center"><input type="number" min={1} value={p.qty} onChange={e=>setProd(i,'qty',e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input type="number" min={0} value={p.unit_price_cop} onChange={e=>setProd(i,'unit_price_cop',e.target.value)} className="w-28 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-right outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2 text-center"><input type="number" min={0} max={100} value={p.impuesto_pct} onChange={e=>setProd(i,'impuesto_pct',e.target.value)} className="w-16 border border-gray-200 rounded-lg px-2 py-1.5 text-xs text-center outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input value={p.tracking||''} onChange={e=>setProd(i,'tracking',e.target.value)} placeholder="Guia" className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2"><input type="date" value={p.entrega_est||''} onChange={e=>setProd(i,'entrega_est',e.target.value)} className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs outline-none focus:ring-2 focus:ring-purple-200"/></td>
                                <td className="py-2 text-right font-bold text-xs">{fCOP(Number(p.qty||0)*Number(p.unit_price_cop||0))}</td>
                                <td className="py-2"><button onClick={()=>delProd(i)} className="p-1 hover:bg-red-50 rounded text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100"><X size={13}/></button></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {/* Footer total */}
                    <div className="mt-4 pt-4 border-t border-gray-200 flex justify-end gap-8 text-sm">
                      <div className="text-right">
                        <p className="text-gray-400 text-xs font-bold uppercase">Subtotal</p>
                        <p className="font-black text-gray-900 mt-0.5">{fCOP(totalCalc)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-gray-400 text-xs font-bold uppercase">TOTAL</p>
                        <p className="font-black text-gray-900 text-lg mt-0.5">{fCOP(totalCalc)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'pvens' && (
                <div>
                  <p className="text-sm font-black text-gray-700 mb-1">Pedidos de Venta disponibles</p>
                  <p className="text-xs text-gray-400 mb-4">Selecciona los PVEN en estado <strong>Pendiente Compra</strong> para asociar a este PEC</p>
                  <div className="flex items-center bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 gap-2 mb-3">
                    <Search size={14} className="text-gray-400"/>
                    <input value={searchPven} onChange={e=>setSearchPven(e.target.value)} placeholder="Buscar PVEN..." className="text-sm bg-transparent outline-none flex-1"/>
                  </div>
                  <div className="space-y-2">
                    {/* B4 T15 (m9 de T14): si GET /ventas/pedidos falló, se dice (no «Sin PVEN…») y se puede reintentar. */}
                    {errorVentas ? (
                      <div className="py-8 text-center space-y-3">
                        <p role="alert" className="text-sm font-bold text-rose-700">No se pudieron cargar los pedidos de venta.</p>
                        <button type="button" onClick={onReintentarVentas}
                          className={`inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 ${FOCO_VISIBLE}`}>
                          <RefreshCw size={13} aria-hidden="true"/> Reintentar
                        </button>
                      </div>
                    ) : filteredPvens.length === 0 && <p className="text-center py-10 text-gray-400 text-sm">Sin PVEN en estado Pendiente Compra</p>}
                    {filteredPvens.map((p:any)=>(
                      <label key={p.id} className={'flex items-start gap-3 p-4 rounded-2xl border cursor-pointer hover:bg-purple-50 transition-colors ' + (selectedPvens.has(p.id)?'border-purple-300 bg-purple-50':'border-gray-200 bg-white')}>
                        <input type="checkbox" checked={selectedPvens.has(p.id)} onChange={e=>{const n=new Set(selectedPvens);if(e.target.checked)n.add(p.id);else n.delete(p.id);setSelectedPvens(n);}} className="mt-1 rounded border-gray-300 text-purple-600"/>
                        <div className="flex-1">
                          <div className="flex items-center gap-2"><span className="font-bold text-gray-900">{p.numero}</span><span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full font-bold">{infoEstadoPedido('PENDIENTE_COMPRA').label}</span></div>
                          <p className="text-xs text-gray-500">{p.customer_name||'-'} · {fDate(p.created_at)}</p>
                          <p className="text-xs font-bold text-indigo-700 mt-0.5">{fCOP(p.total_cop||0)} · {(p.productos||[]).length} producto(s)</p>
                          {(p.productos||[]).slice(0,3).map((pr:any,j:number)=><p key={j} className="text-[10px] text-gray-400">· {pr.descripcion||pr.producto_nombre||'Producto'}</p>)}
                        </div>
                      </label>
                    ))}
                  </div>
                  {selectedPvens.size > 0 && (
                    <div className="mt-4 p-3 bg-purple-50 border border-purple-200 rounded-2xl flex items-center justify-between">
                      <span className="text-sm font-bold text-purple-800">{selectedPvens.size} PVEN seleccionado(s)</span>
                      <span className="text-xs text-purple-600">Se asociaran al nuevo PEC al crearlo</span>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-between shrink-0">
            <div className="text-sm text-gray-500"><span className="font-bold">{productos.length}</span> producto(s) · <span className="font-bold">{selectedPvens.size}</span> PVEN asociado(s)</div>
            <div className="flex gap-3">
              <button onClick={onClose} className="px-4 py-2 border border-gray-200 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-50">Cancelar</button>
              <button onClick={submit} disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-bold disabled:opacity-50">
                {saving?<RefreshCw size={14} className="animate-spin"/>:<Send size={14}/>} {saving?'Creando PEC...':'Crear PEC'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

/* ================================================================
   B4 T15 — las piezas de la lista (la tabla estándar y sus celdas)
   ================================================================ */

/** Una fila de GET /compras/pedidos: la que leen las columnas compartidas (columnas-pec.tsx; is_overdue es del servidor). */
type FilaPec = FilaColumnasPec;
/** Un pedido de venta del alta (GET /ventas/pedidos, como en B1 a B3: «Nuevo PEC» lista sus PENDIENTE_COMPRA). */
type FilaVenta = {
  id: number; numero: string; estado?: string | null; customer_name?: string | null; created_at?: string | null;
  total_cop?: number | null; productos?: unknown[] | null;
};
/** `conteos` de GET /compras/pedidos con con_conteos=1 (T12): cada vista y los vencidos, con la búsqueda (R5). */
type ConteosPec = Partial<Record<'vigentes' | 'activos' | 'en_transito' | 'recibidos' | 'cancelados' | 'vencidos', number>>;
/** D39: las columnas del tablero de una acción desde una tarjeta: [origen, destino]. */
type ColumnasDeTarjeta = readonly [string, string];
/** La cancelación con motivo en curso (panel, menú de fila, tablero o masiva; R9, C15c). */
type Cancelacion = {
  pecs: FilaPec[];
  omitidos: { id: unknown; numero: string; motivo: string }[];
  columnas: ColumnasDeTarjeta | null;
  desdePanel: boolean;
};

/** El id de la pantalla: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26). */
const ID_PEDIDOS = 'compras.pedidos';
/** RP21: «Todos» es la vista 'vigentes' del servidor (sin los cancelados, R9). R8: lo vencido primero. */
const INICIAL_PEDIDOS = { vista: 'vigentes', orden: 'atencion' };
/** «Con atraso» desde Recibidos o Cancelados vuelve a la pestaña Todos de ESTA lista (accionSemaforoCompras). */
const OPCIONES_SEMAFORO = { vistaTodos: INICIAL_PEDIDOS.vista };
/** D39 (m6 de T8): en Kanban la lista va sin filas (limit=0); los conteos siguen al día y las filas las piden las columnas. */
const EXTRA_TABLERO = { limit: 0 };
const RUTA_PEDIDOS = '/dashboard/compras/pedidos';
/** El contenedor de los Hubs y de las listas del bloque (T7 a T14): pb-24 deja libre la esquina del botón de la IA. */
const CONTENEDOR = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-[1600px] mx-auto w-full min-w-0 gap-6';

const FOCO_VISIBLE = FOCOS.purple;
/** El foco de los botones de la barra masiva (fondo slate-900), como en el Hub (m11 de T14). */
const FOCO_OSCURO = FOCOS.blanco;

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaPedidos = {
  abrir: (p: FilaPec) => void;
  emitir: (p: FilaPec) => void;
  cancelar: (filas: FilaPec[]) => void;
  eliminar: (p: FilaPec) => void;
  /** r1 (m35): si el rol cambia los PEC (accesoCompras). */
  cambiarPec: boolean;
};
const AccionesFila = React.createContext<AccionesFilaPedidos | null>(null);

/**
 * Acciones (R11): el ojo abre el panel del PEC y el menú ⋯ (MenuFila: clic y portal, las mismas opciones de antes) trae
 * «Ver detalle», «Marcar Emitido» (solo un Borrador: lo único que se emite a mano, R9), «Cancelar PEC» (solo si update_pec
 * lo acepta; abre el ModalMotivo) y, en un cancelado, «Eliminar definitivamente» (con confirmar).
 */
function CeldaAcciones({ p }: { p: FilaPec }) {
  const acciones = useContext(AccionesFila);
  // r1 (m35): el permiso llega por el contexto (como Tránsito con puedeAvanzar): sin leer el rol en cada fila.
  const cambiarPec = acciones?.cambiarPec ?? false;
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver detalle', icono: Eye, onClick: () => acciones?.abrir(p) },
    { etiqueta: 'Marcar Emitido', icono: Send, onClick: () => acciones?.emitir(p),
      oculto: !cambiarPec || !transicionesPec(p.estado).includes('EMITIDO') },
    { etiqueta: 'Cancelar PEC', icono: Trash2, peligro: true, onClick: () => acciones?.cancelar([p]),
      oculto: !cambiarPec || !transicionesPec(p.estado).includes('CANCELADO') },
    { etiqueta: 'Eliminar definitivamente', icono: Trash2, peligro: true, onClick: () => acciones?.eliminar(p),
      oculto: !cambiarPec || etapaPec(p.estado) !== 'cancelado' },
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
 * B4 T15, la tabla (TABLA-compras punto 7; R26, D41): las columnas de columnas-pec.tsx (r1: las mismas, compartidas con
 * el Hub de Compras) con la celda de Acciones de esta lista. Una constante (estable, D40).
 */
const COLUMNAS_TABLA_PEDIDOS = columnasPec<FilaPec>((p) => <CeldaAcciones p={p} />);
/** {campo de orden: título}, para el chip «Orden: Monto ↓» (textoOrdenHub), solo de las columnas que se ordenan. */
const TITULOS_ORDEN_PEDIDOS = titulosDeOrdenPec(COLUMNAS_TABLA_PEDIDOS);

/**
 * Las pestañas de Pedidos de compra (R9, RP21, RP93: las vistas del servidor, sin emojis): Todos (vigentes), Activos (en
 * rojo si hay vencidos), En tránsito, Recibidos (la etapa recibido) y Cancelados. Los conteos son del servidor (con la
 * búsqueda; null mientras cargan: la barra gris, nunca 0). Ya no hay pestaña Análisis (R13).
 */
function pestanasDePedidos(conteos: ConteosPec | null): PestanaTabla[] {
  return [
    { id: 'vigentes', etiqueta: 'Todos', conteo: conteos?.vigentes ?? null },
    { id: 'activos', etiqueta: 'Activos', conteo: conteos?.activos ?? null, alerta: textoVencidosPec(conteos?.vencidos) },
    { id: 'en_transito', etiqueta: 'En tránsito', conteo: conteos?.en_transito ?? null },
    { id: 'recibidos', etiqueta: 'Recibidos', conteo: conteos?.recibidos ?? null },
    { id: 'cancelados', etiqueta: 'Cancelados', conteo: conteos?.cancelados ?? null },
  ];
}

/* ================================================================
   MAIN PAGE — PedidosCompraPage (B4 T15)
   ================================================================ */
export default function PedidosCompraPage() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  // H49 (B2): avisos y confirmaciones del sistema (nunca alert, confirm ni prompt). showToast es el adaptador de los
  // modales y del panel de B1 a B3: los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ').
  const { avisar, confirmar } = useAvisos();
  const showToast = useCallback<AvisoPantalla>((msg, tipo) => {
    if (tipo === 'error') avisar(textoDeError(msg), { tono: 'error' });
    else avisar(String(msg), { tono: 'ok' });
  }, [avisar]);
  const [showNuevoPec, setShowNuevoPec] = useState(false);
  const [selectedPec, setSelectedPec] = useState<FilaPec | null>(null);

  // ── B4 T15, bloque 1: la carga del servidor (TABLA-compras punto 7; R5, R8, C3, C4; D39, D40) ──
  // El estado ÚNICO de la pantalla: las pestañas, la búsqueda, el filtro de estados, el semáforo, las cajas de la franja,
  // las tarjetas, la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en vista:compras.pedidos. Ya
  // no hay arreglos en memoria (antes, los 200 más recientes filtrados, contados y paginados en el navegador).
  const [estado, despachar, listo] = useEstadoTabla(ID_PEDIDOS, INICIAL_PEDIDOS);
  // B4 T24 (FINAL-m10, m31 y m38): el rol después de montar (useRolActual) decide si se cambian los PEC (accesoCompras: PATCH y DELETE
  // /compras/pedidos y PATCH /tracking son de ADMIN y COMPRAS); sin permiso, el tablero es solo para ver y no se ofrecen sus acciones.
  const accesoPec = accesoCompras(useRolActual());
  const enKanban = estado.modo === 'kanban';

  // GET /compras/pedidos con vista, estados, semáforo, q, orden, limit y offset del estado, más los conteos de las
  // pestañas en la MISMA llamada. esperar: !listo (D40): el esqueleto, nunca «vacío». En Kanban, sin filas. Sin orden (el
  // tercer clic en un título), 'atencion': lo vencido primero sigue siendo el orden por defecto (R8).
  const extraDeLaLista = useMemo(() => ({ orden: estado.orden || 'atencion' }), [estado.orden]);
  const listado = useListado<FilaPec>({
    ruta: '/compras/pedidos', estado, conConteos: true, esperar: !listo, despachar,
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

  // El tablero en modo servidor (KANBAN-compras punto 6; R11, C4, D39): una consulta por columna (consultaColumnaPec: sin
  // vista, los estados de la columna cruzados con el filtro, la búsqueda y el semáforo del MISMO estado), porColumna = el
  // tamaño de la tabla y limit=0 en las plegadas (lo hace el hook). 'atencion' en las abiertas (lo vencido primero, R8)
  // y 'reciente' en Recibido y Cancelado. Un PEC con un estado desconocido no sale en ninguna columna (RP97).
  const tablero = useTableroKanban<FilaPec>({
    pantalla: ID_PEDIDOS,
    modo: 'servidor',
    columnas: COLUMNAS_PEC,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaPec(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await _apiFetch(`/compras/pedidos?${consulta}`, { signal }));
    },
  });

  // La franja del flujo (FLUJO-compras punto 6; R9, RP46, D36, D42): GET /compras/flujo; recargaFlujo sube con cada recarga.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/compras/flujo', recargaFlujo);

  // Las tarjetas (KPI-compras punto 6; R7, R12): GET /compras/stats?periodo=30d (antes se pedía sin período a un
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
  const tarjetas = tarjetasPedidosCompra(stats?.datos ?? null);

  // B1 a B3 (queda igual): los pedidos de venta del alta (sus PENDIENTE_COMPRA se eligen en «Nuevo PEC»). Si el GET
  // falla, el error queda en el estado (el alta lo dice con «Reintentar», m9 de T14) y la lista de antes se conserva.
  const [ventas, setVentas] = useState<{ filas: FilaVenta[]; error: unknown }>({ filas: [], error: null });
  const [vueltaVentas, setVueltaVentas] = useState(0);
  useEffect(() => {
    let vigente = true;
    apiFetch('/ventas/pedidos?limit=200')
      .then((r) => { if (vigente) setVentas({ filas: Array.isArray(r) ? r : (r && Array.isArray(r.data) ? r.data : []), error: null }); })
      .catch((err: unknown) => { if (vigente) setVentas((v) => ({ filas: v.filas, error: err })); });
    return () => { vigente = false; };
  }, [vueltaVentas]);
  // m10 de T14: releer el detalle del panel abierto cuando cancelar desde él falla y el servidor pide recargar.
  const [vueltaDetalle, setVueltaDetalle] = useState(0);

  // Enlace profundo (B1 a B3): otras páginas (por ejemplo Mercancía en tránsito) enlazan con ?id=<pec_id> para abrir el
  // panel de ese PEC. B4 T15: se pide su detalle (la lista ya no trae los 200 más recientes) y un error se dice.
  useEffect(() => {
    const idParam = searchParams.get('id');
    if (!idParam) return;
    let vigente = true;
    apiFetch('/compras/pedidos/' + idParam)
      .then((d) => { if (vigente) setSelectedPec(d); })
      .catch((err: unknown) => { if (vigente) showToast(err, 'error'); });
    return () => { vigente = false; };
  }, [searchParams, showToast]);
  const closePecPanel = useCallback(() => {
    setSelectedPec(null);
    if (searchParams.get('id')) router.replace(pathname);
  }, [searchParams, router, pathname]);

  // RP21: ?tab=<vista> (la caja Recibido de las otras franjas: ?tab=recibidos) abre esa pestaña, una sola vez al montar,
  // como un clic en ella (accionPestana). Se lee con window.location en el efecto (sin window en el render del servidor);
  // un valor desconocido se ignora. Después se quita de la URL (el ?id se conserva). Como en Pedidos de venta (T10 r1,
  // I1): con Kanban guardado, la pestaña se abre en LISTA (el tablero no tiene pestañas), cuando `listo` dice el modo.
  const enlaceLeido = useRef(false);
  const enlacePendiente = useRef<string | null>(null);
  useEffect(() => {
    if (enlaceLeido.current) return;
    enlaceLeido.current = true;
    const vista = leerEnlacePedidosCompra(window.location.search);
    if (!vista) return;
    enlacePendiente.current = vista;
    despachar(accionPestana(estado, vista, opcionesEstadosPec));
    router.replace(rutaSinParametro(RUTA_PEDIDOS, window.location.search, 'tab'), { scroll: false });
  }, [estado, despachar, router]);
  useLayoutEffect(() => {
    const vista = enlacePendiente.current;
    if (!listo || vista === null) return;
    enlacePendiente.current = null;
    if (estado.modo === 'kanban') despachar(accionVistaEnLista(estado, vista, opcionesEstadosPec));
  }, [listo, estado, despachar]);

  // «Actualizar»: la tabla, el tablero, la franja, las tarjetas y los pedidos de venta del alta. Ninguna recarga vacía
  // lo que se ve: los hooks conservan lo último. Después de un cambio de estado, lo que ese cambio mueve (la lista con sus
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

  // ── B4 T15, bloque 4: cancelar con motivo (KANBAN-compras punto 6; R9, C15c, RP30, RP93) ──
  // Un solo ModalMotivo para el panel, el menú de la fila, el tablero y la barra masiva (nunca confirm()): el motivo de
  // 5 letras o más va en el PATCH y el servidor lo deja en la Actividad («Estado cambiado a Cancelado. Motivo: …»). Solo se
  // mandan los que update_pec deja cancelar (repartirCancelacionPec); los demás se nombran como omitidos.
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

  // En serie, con el mismo motivo para todos (cancelarPecsEnSerie), y lo que sigue lo decide despuesDeCancelarPec
  // (estados-compras.js, con sus casos; T14 r1): qué sale de la selección, qué queda en la ventana, cuándo recargar (la
  // regla única recargarTrasError), los pedidos de venta del alta (lección I1 de T14: los vinculados vuelven a Pendiente
  // de compra) y el detalle del panel (m10), y qué error se relanza para que ModalMotivo muestre el mensaje del servidor.
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
      // T15 r1 (I1): desde el panel (que también se abre con una tarjeta del tablero) no hay columnas: el tablero entero.
      // Fuera de Kanban no cuesta nada (el hook inactivo solo marca la recarga para cuando se active).
      if (columnas) tablero.recargar([...columnas]);
      else tablero.recargar();
      recargarTrasCambio();
    }
    if (r.recargarVentas) setVueltaVentas((n) => n + 1);
    if (r.mensajeOk) avisar(r.mensajeOk, { tono: 'ok' });
    if (r.error === null) {
      if (desdePanel) closePecPanel();
      return;
    }
    if (desdePanel && r.recargarDetalle) setVueltaDetalle((n) => n + 1);
    setCancelacion({ ...cancelacion, pecs: r.pendientes, omitidos: [] });
    throw r.error;
  }

  // «Marcar Emitido» del menú de fila (R9: solo un Borrador) y «Eliminar definitivamente» (solo un cancelado, con
  // confirmar). Si el servidor dice que no, su mensaje; con la regla única recargarTrasError, se recarga.
  const emitir = useCallback(async (p: FilaPec) => {
    try {
      await _apiFetch(`/compras/pedidos/${p.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'EMITIDO', updated_by: autorActual() }) });
      avisar(`${p.numero} quedó Emitido`, { tono: 'ok' });
    } catch (err) {
      avisar(textoDeError(err), { tono: 'error' });
      if (!recargarTrasError(err)) return;
    }
    recargarTrasCambio();
  }, [avisar, recargarTrasCambio]);
  const eliminar = useCallback(async (p: FilaPec) => {
    if (!(await confirmar({
      titulo: `¿Eliminar definitivamente ${p.numero}?`, mensaje: 'El pedido de compra cancelado se borra y no se puede recuperar.',
      textoConfirmar: 'Eliminar definitivamente', peligro: true,
    }))) return;
    try {
      await _apiFetch(`/compras/pedidos/${p.id}`, { method: 'DELETE' });
      avisar(`${p.numero} eliminado`, { tono: 'ok' });
    } catch (err) {
      avisar(textoDeError(err), { tono: 'error' });
      if (!recargarTrasError(err)) return;
    }
    recargarTrasCambio();
  }, [avisar, confirmar, recargarTrasCambio]);

  // ── B4 T15, bloque 2: la tabla (TABLA-compras punto 7; R5, R26, D40, D41) ──
  const prefs = usePreferenciasTabla(ID_PEDIDOS, COLUMNAS_TABLA_PEDIDOS);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa (el conmutador sigue a la vista y el tablero no queda tapado).
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  const abrir = useCallback((p: FilaPec) => setSelectedPec(p), []);
  const accionesFila = useMemo<AccionesFilaPedidos>(() => ({
    abrir, emitir: (p) => { void emitir(p); }, cancelar: (filas) => pedirCancelacion(filas), eliminar: (p) => { void eliminar(p); },
    cambiarPec: accesoPec.cambiarPec,
  }), [abrir, emitir, pedirCancelacion, eliminar, accesoPec.cambiarPec]);
  const pestanas = pestanasDePedidos(conteos);
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o
  // las de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec, COLUMNAS_PEC));
    } else despachar(accion);
  }, [estado, despachar]);
  // R8: ordenada por una columna, el chip «Orden: … · Atención primero» vuelve a lo vencido primero.
  const textoOrden = enKanban || ordenEsAtencion(estado.orden) ? null : textoOrdenHub(estado.orden, TITULOS_ORDEN_PEDIDOS);
  // TABLA-compras («Agrupar mes»): con el orden por fecha de compra, un separador por mes (en la página que se ve).
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
  // m8 de T8: el «vacío» memoizado. T15 r1 (m8): dice qué lo deja vacío (textoVacioPec): «Con atraso», el filtro de
  // estados o la búsqueda; si no, la pista de crear un PEC.
  const vacio = useMemo(() => {
    const texto = textoVacioPec({ q: estado.q, semaforo: estado.semaforo, estados: estado.estados }, 'Los pedidos de compra se crean con «Nuevo PEC».');
    return (
      <div>
        <p className="font-semibold text-slate-600">{texto.titulo}</p>
        {texto.ayuda && <p className="mt-1 text-xs text-slate-500">{texto.ayuda}</p>}
      </div>
    );
  }, [estado.q, estado.semaforo, estado.estados]);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    total: sinPagina ? null : listado.total,
    estadoTotal: estadoDelTotal({
      total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
    }),
  };

  // ── B4 T15, bloque 3: el tablero (KANBAN-compras punto 6; R9, R11, C15c; D39) ──
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

  // ── B4 T15, bloque 5: las tarjetas (KPI-compras punto 6; R12, RP92, RP93) ──
  // pec_activos abre «Activos», pec_en_transito «En tránsito» y pec_monto «Todos» (D41: como un clic en la pestaña; tocar
  // la activa vuelve a Todos). En Kanban abren esa pestaña en Lista (accionVistaEnLista). pec_vencidos es el mismo filtro
  // que «Con atraso» de la franja (semaforo=vencidos, RP92); tocarla otra vez lo quita.
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = vistaActiva === vista ? INICIAL_PEDIDOS.vista : vista;
    despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosPec));
  };

  // ── B4 T15, bloque 6: la franja del flujo (FLUJO-compras punto 6; R5, R9, C3, RP21, RP40, RP46, D42) ──
  // «Estás aquí» en Pedido de compra. «Con atraso» es semaforo=vencidos en el servidor (accionSemaforoCompras; desde
  // Recibidos o Cancelados, que nunca vencen, pasa a Todos). En tránsito y Recibido abren su pestaña de esta lista (RP21) y
  // otro clic vuelve a Todos; Lista de compras y Recepción en bodega son enlaces a su pantalla.
  const filtroSemaforo = filtroSemaforoCompras(estado);
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    despachar(accionSemaforoCompras(estado, f, enKanban ? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec, OPCIONES_SEMAFORO));
  };
  const alternarVencidos = () => alFiltrarSemaforo(filtroSemaforo === 'atrasados' ? 'todos' : 'atrasados');
  const alSeleccionarPaso = (clave: string) => {
    const vista = vistaDePasoPedidosCompra(clave);
    if (vista) elegirVista(vista);
  };
  const actualizando = listado.recargando || flujo.cargando || (cargandoStats && stats !== null);

  /* ════════════════ RENDER ════════════════ */
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {selectedPec && (
        <PecDetailPanel
          pec={selectedPec}
          onClose={closePecPanel}
          onUpdate={recargarTodo}
          onToast={showToast}
          onCancelar={(p) => pedirCancelacion([p], { desdePanel: true })}
          vueltaDetalle={vueltaDetalle}
        />
      )}
      {showNuevoPec && (
        <NuevoPecModal
          pedidosVenta={ventas.filas}
          errorVentas={ventas.error}
          onReintentarVentas={() => setVueltaVentas((n) => n + 1)}
          onClose={()=>setShowNuevoPec(false)}
          onCreated={recargarTodo}
          onToast={showToast}
        />
      )}

      <SubNav label="Hub de Compras" items={COMP_NAV} currentPath={pathname} color="purple" hub={{ href: '/dashboard/compras' }} />

      {/* B4 T15 (FLUJO-compras punto 6; R9, D42, RP21, RP46): la franja del flujo con «Estás aquí» en Pedido de compra
          reemplaza el aviso naranja de los vencidos (ahora es «Con atraso» del semáforo) y el subtítulo con códigos. Sin el
          botón de los no resueltos (Compras no lo tiene). Va directo bajo la barra de submódulos, sin otro padding. */}
      <BannerFlujo
        titulo="Flujo de compras"
        idPreferencia={ID_PEDIDOS}
        regla={textoReglaCompras()}
        semaforo={{
          atrasados: flujo.datos?.semaforo?.atrasados ?? null,
          filtro: filtroSemaforo,
          onFiltrar: alFiltrarSemaforo,
        }}
        pasos={pasosPedidosCompra(flujo.datos, vistaActiva)}
        avisos={avisosFlujoCompras(flujo.datos)}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
        onSeleccionarPaso={alSeleccionarPaso}
      />

      <div className={CONTENEDOR}>

        {/* HEADER. R13 (ANALISIS-compras punto 5): «Ver análisis» abre el Análisis del Hub de Compras (?tab=analisis);
            esta lista ya no tiene pestaña Análisis ni el chat que llamaba a un endpoint inexistente (R2). */}
        <PageHeader
          icon={ShoppingBag} color="purple"
          title="Pedidos de Compra"
          subtitle="Pedidos a proveedores y su seguimiento."
          actions={(
            <div className="flex flex-wrap items-center gap-2.5">
              <button type="button" onClick={recargarTodo}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <RefreshCw size={14} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/> Actualizar
              </button>
              <Link href={ENLACE_VER_ANALISIS_COMPRAS}
                className={`flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-600 rounded-xl hover:bg-purple-50 hover:text-purple-800 hover:border-purple-200 font-semibold text-sm shadow-sm transition-colors ${FOCO_VISIBLE}`}>
                <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
              </Link>
              {/* r1 (m7): POST /compras/pedidos es de ADMIN y COMPRAS. */}
              {accesoPec.cambiarPec && <Button color="purple" icon={Plus} onClick={()=>setShowNuevoPec(true)}>Nuevo PEC</Button>}
            </div>
          )}
        />

        {/* B4 T15 (KPI-compras punto 6; R7, R12, RP92): las 4 tarjetas de /compras/stats (todos los PEC): mientras cargan,
            barras grises (nunca 0); con error, «—». Activos, En tránsito y Monto abren su pestaña; Con entrega vencida, el
            filtro «Con atraso». */}
        <FranjaKpis estado={estadoKpis} titulo="Pedidos de compra">
          <TarjetaKpi kpi="pec_activos" valor={tarjetas?.activos.valor ?? null}
            activo={vistaActiva === 'activos'} onClick={() => elegirVista('activos')} />
          <TarjetaKpi kpi="pec_en_transito" valor={tarjetas?.en_transito.valor ?? null}
            activo={vistaActiva === 'en_transito'} onClick={() => elegirVista('en_transito')} />
          <TarjetaKpi kpi="pec_vencidos" valor={tarjetas?.vencidos.valor ?? null} tono={tarjetas?.vencidos.tono ?? 'normal'}
            activo={filtroSemaforo === 'atrasados'} onClick={alternarVencidos} />
          <TarjetaKpi kpi="pec_monto" valor={tarjetas?.monto.valor ?? null} ayuda={tarjetas?.monto.ayuda ?? undefined}
            activo={vistaActiva === 'vigentes'} onClick={() => elegirVista('vigentes')} />
        </FranjaKpis>

        {/* B4 T15 (TABLA-compras punto 7, KANBAN-compras punto 6): la barra y la tabla estándar en el servidor, o el tablero
            en modo servidor, con el MISMO estado (pestaña, búsqueda, estados y semáforo). En Kanban las pestañas no se ven
            (el tablero muestra todos los PEC por etapa). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesFila.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
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
                ajustes={{ columnas: COLUMNAS_TABLA_PEDIDOS, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                color="purple"
                {...totalDeLaBarra}
              />
              {/* La tabla estándar en el servidor: la paginación (25 o 50), el orden, la selección de la página y los
                  separadores por mes son de la tabla; la fila vencida en filaAlerta; un clic en la fila abre el panel. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_PEDIDOS}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_PEDIDOS}
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
                  claseFila={claseDeFilaPec}
                  grupoFila={porMes ? grupoMesPec : undefined}
                  tituloGrupo={tituloDeMes}
                  seleccion={seleccion}
                  onSeleccion={alSeleccionar}
                  pie={pieSeleccion}
                  vacio={vacio}
                  etiqueta="Pedidos de compra"
                />
              )}
            </section>
          </AccionesFila.Provider>
          {enKanban ? (
            /* KANBAN-compras punto 6: Borrador · Emitido · En tránsito · En bodega · Recibido (plegada) · Cancelado
               (plegada). Lo que no se puede queda bloqueado con su motivo y su enlace ANTES de soltar (reglaSoltarPec);
               en En bodega, «Recepcionar» (tarjetaPedidoCompra). */
            // B4 T24 r2 (m2, m10): mientras se lee el rol, el esqueleto (sin acciones) en lugar del tablero.
            !accesoPec.listo ? <EsqueletoTablero /> : <TableroKanban
              tablero={tablero}
              regla={reglaSoltarPec}
              tarjetaDe={tarjetaPedidoCompra}
              onAbrir={abrir}
              onCambio={cambiarDesdeTablero}
              onAccion={accionDesdeTablero}
              soloLectura={accesoPec.soloLectura}
              color="purple"
            />
          ) : null}
        </div>

        {/* La barra masiva (la selección es de la página de la tabla, así que solo en Lista): cancelar con un motivo. */}
        {seleccion.length > 0 && !enKanban && accesoPec.cambiarPec && (
          <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-4 z-40 border border-slate-700">
            <span className="font-bold text-sm bg-slate-800 px-3 py-1 rounded-full">{seleccion.length} {seleccion.length === 1 ? 'seleccionado' : 'seleccionados'}</span>
            <button type="button" onClick={() => pedirCancelacion(filasSeleccionadas())}
              className={`bg-rose-500/20 text-rose-300 hover:bg-rose-500/40 px-3 py-1.5 rounded-xl flex items-center gap-2 text-xs font-bold transition-colors ${FOCO_OSCURO}`}>
              <Trash2 size={14} aria-hidden="true"/> Cancelar seleccionados
            </button>
            <button type="button" onClick={() => setSeleccion([])} aria-label="Quitar la selección" title="Quitar la selección"
              className={`rounded-lg p-1.5 text-slate-400 hover:text-white ${FOCO_OSCURO}`}><X size={14} aria-hidden="true"/></button>
          </div>
        )}
      </div>

      {/* B4 T15 (R9, C15c, RP93): el motivo de la cancelación (ModalMotivo, nunca confirm) con lo que pasa al cancelar. */}
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
