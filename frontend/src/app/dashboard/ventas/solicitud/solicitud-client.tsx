'use client';

import {
  useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef, forwardRef, useImperativeHandle, createContext, useContext, useId,
} from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  FileText, AlertTriangle, CheckCircle2, Plus, X, Mail, RefreshCw, MessageCircle, Edit2, AlertCircle, Trash2, RotateCcw,
  XCircle, BarChart3,
} from 'lucide-react';

import { apiFetch, getToken } from '@/lib/api';
import {
  SubNav, PageHeader, Modal, Button, EmptyState, useAvisos, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila,
  TableroKanban, EsqueletoTablero, useTableroKanban, CLASE_CHIP,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
// B4 T8: la lista 100 % en el servidor con las piezas estándar (R5, R8, R11, R12, R13, R26; C3, C4, C13, C14, C15, C21).
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, useListadoCliente, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import {
  accesoresDeOrden, accionModo, accionPestana, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta,
} from '@/lib/tabla';
import type { AccionTabla } from '@/lib/tabla';
import { alternarPaso } from '@/lib/flujo';
import { avisoVencidas, enlaceVerAnalisis, pasosDeLista, textoRegla } from '@/lib/flujo-ventas';
import {
  COLUMNAS_SC, OPCIONES_ESTADOS_TABLERO_SC, chipsDocumentoVentas, confirmacionReiniciarSolicitud, consultaColumnaSC,
  estadoDeTarjeta, opcionesEstadosSolicitudes, puedeReiniciarSC, reglaSoltarSC, tarjetaSolicitud,
} from '@/lib/kanban-ventas';
import { textoDeError, recargarTrasError } from '@/lib/avisos';
// B4 T24 (FINAL-m32): la regla del motivo de ModalMotivo también en la ventana de la cancelación en lote.
import { MINIMO_MOTIVO, largoDelMotivo, motivoValido } from '@/lib/kanban';
import { VEN_NAV } from '../ven-nav';
import { FOCOS, PAGE_HEADER, RESERVA_BOTON_IA, TABLE } from '@/lib/design-system';
import { accesoTableroVentas } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import { esAdministrador, esAsesorElegible, getUsuarioActual } from '../flujo';
import { etiquetaTipoSolicitud, etiquetaModalidad } from '@/lib/etiquetas-ventas';
import {
  generoCotizacion, cotizacionesVigentes, resumenCancelacionSolicitudes, repartirCancelacionSolicitudes, estadoEnPapelera,
  contarVencidasEnPapelera, confirmacionVaciarVencidas, textoPapeleraVaciada, tarjetasSolicitudes, fechaNegocioVencida,
  vistaSolicitudesPermitida, atrasadosDeLaPestana,
} from '@/lib/listas-ventas';
import { diaDeNegocio, fechaCorta, fechaLarga } from '@/lib/fechas-colombia';
import { mailtoUrl, telUrl, motivoTelefono } from '@/lib/chatter';
import { waUrl } from '@/lib/whatsapp';
import { ESTADOS_SC as ESTADOS_SC_LIB, infoEstadoSolicitud, motivoDeCancelacion } from '@/lib/estados-solicitud';
import { infoEstadoPedido, humanizarCodigo } from '@/lib/estados-pedido';
import { ESTADOS as ESTADOS_COT } from '../cotizacion/cotizacion-client';
import { TIPOS_SC, MODALIDADES_PAGO, pctAnticipoDeModalidad } from '@/lib/etiquetas-solicitud';
import { lineaDesdeCatalogo, lineaTextoLibre, agregarLinea, lineasParaEnviar, textoAvisoLinea } from '@/lib/lineas-solicitud';
import { nombreCliente } from '@/lib/cliente-desde-busqueda';
import { ProductSearch } from './buscador-producto';
import { SelectorClienteSC } from './selector-cliente';
import { LineasProducto } from './lineas-producto';
import { RUTA_LISTA_SOLICITUDES } from '@/lib/cambios-cliente';

// T7: las tablas viven en las librerías (H10/C16 y U15/C5: una sola fuente). Se reexportan desde aquí para no romper los
// imports del detalle (solicitud/[id]), del Hub y del Asistente Omnicanal. ProductSearch (buscador-producto.tsx) y
// NewClientModal (selector-cliente.tsx) también se mudaron a sus archivos.
export { TIPOS_SC, MODALIDADES_PAGO };
export { ProductSearch } from './buscador-producto';
export { NewClientModal } from './selector-cliente';

// El contrato público no cambia: {label, color, bg, border} por estado (lo leen el Hub, EstadoBadge y el detalle). En
// código nuevo, la etiqueta sale de infoEstadoSolicitud(e).label.
export const ESTADOS_SC: Record<string, {label:string; color:string; bg:string; border:string}> = ESTADOS_SC_LIB;
// U15 (T8A): ya no hay estados que se pongan a mano. El único es 'Reiniciar solicitud' (PATCH {estado:'BORRADOR'}),
// en el menú de fila de la lista y en el detalle (EstadoSolicitudPasos); cancelar va por POST /cancelar.

export const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString('es-CO',{day:'2-digit',month:'short',year:'numeric'}) : '-';
export const fTime = (iso: any) => iso ? new Date(iso).toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}) : '';
export const fCOP  = (v: any)   => { const n=Number(v)||0; return n>0?'$'+n.toLocaleString('es-CO'):'-'; };

// Mapa de 9 estados propios de Solicitud de Cliente -- se mantiene bespoke
// (mas de los ~6 tonos semanticos que cubre el Badge compartido), pero la
// forma de la pastilla ahora coincide con la de Badge (rounded-full, border,
// text-xs font-bold, px-2.5 py-1).
export function EstadoBadge({estado}: {estado:string}) {
  // U15: etiqueta de la librería (un estado desconocido sale humanizado y en gris, nunca el código crudo).
  const cfg = infoEstadoSolicitud(estado);
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{backgroundColor:cfg.bg,color:cfg.color,borderColor:cfg.border}}>
      {cfg.label}
    </span>
  );
}

// 6 tipos de solicitud con colores categoricos deliberadamente distintos
// (indigo/blue/teal/orange/purple/emerald) que no colapsan limpiamente sobre
// los 6 tonos semanticos de Badge (neutral/success/warning/danger/info/purple)
// sin perder distincion real -- se mantiene bespoke, solo se alinea la forma.
export function TipoBadge({tipo}: {tipo:string}) {
  const map: Record<string,string> = {
    'Cotizacion de Producto':'bg-indigo-100 text-indigo-700 border-indigo-200',
    'Seguimiento':           'bg-blue-100 text-blue-700 border-blue-200',
    'Programar Entrega':     'bg-teal-100 text-teal-700 border-teal-200',
    'Devolucion de Producto':'bg-orange-100 text-orange-700 border-orange-200',
    'Soporte Tecnico':       'bg-purple-100 text-purple-700 border-purple-200',
    'Nuevo Lead':            'bg-emerald-100 text-emerald-700 border-emerald-200',
  };
  return <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${map[tipo]||'bg-slate-100 text-slate-600 border-slate-200'}`}>{etiquetaTipoSolicitud(tipo)||'Sin tipo'}</span>;
}

export function ActionDot({action}: {action:string}) {
  const colors: Record<string,string> = {CREATED:'#6366f1',ESTADO_CHANGED:'#f59e0b',NOTE_ADDED:'#3b82f6',CONFIRMED:'#059669',CANCELLED:'#ef4444',UPDATED:'#8b5cf6',CHATTER:'#0891b2'};
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 border-white" style={{backgroundColor:colors[action]||'#94a3b8'}}/>;
}

// ── Cliente nuevo y buscador de productos ─────────────────────────────────────
// H11 (T7): NewClientModal vive ahora en selector-cliente.tsx (alta encima de la solicitud, en un portal); se reexporta
// arriba para el Asistente Omnicanal. U7 (T7): ProductSearch vive en buscador-producto.tsx; se reexporta arriba para el
// editor de productos del detalle.

// C5 (T7 ronda 1): el estado de cada resultado de Seguimiento con su etiqueta según el documento (_tipo de onSegSearch:
// 'SC', 'COT' o 'VEN'), nunca el código crudo. COT: la tabla ESTADOS de cotizacion-client (la del Hub y el detalle).
function etiquetaEstadoSeguimiento(r: any): string {
  if (r?._tipo === 'SC') return infoEstadoSolicitud(r.estado).label;
  if (r?._tipo === 'COT') return ESTADOS_COT[r.estado]?.label || humanizarCodigo(r.estado) || String(r.estado ?? '');
  if (r?._tipo === 'VEN' || r?._tipo === 'PVEN') return infoEstadoPedido(r.estado).label;
  return humanizarCodigo(r?.estado) || String(r?.estado ?? '');
}

// Campos dependientes del Tipo de Solicitud + Asesor/Vencimiento. Bloque
// reutilizable: Tipo/Modalidad, los 5 sub-formularios por tipo (Cotizacion,
// Seguimiento, Programar Entrega, Devolucion de Producto, Soporte Tecnico) y
// el selector de Asesor + Dias Vencimiento, identicos a los que usa la pagina
// real de Solicitud de Cliente. Se extrajo para que cualquier otro punto de
// entrada (p.ej. el Asistente Omnicanal) dispare EXACTAMENTE el mismo
// formulario en vez de una reimplementacion paralela que termina divergiendo.
export type SolicitudTipoYDetalleHandle = {
  getExtras: () => { productos: any[]; notasConExtras: string };
  reset: () => void;
};

type SolicitudFormState = {
  advisor_name: string; advisor_user_id: number | '';
  tipo_solicitud: string; modalidad_pago: string; notas: string;
  dias_vencimiento: number;
  tipo_problema: string; descripcion_problema: string; urgencia: string;
  evidencia_descripcion: string; asignado_a_user_id: number | '';
};

export const SolicitudTipoYDetalle = forwardRef<SolicitudTipoYDetalleHandle, {
  form: SolicitudFormState;
  setForm: (updater: (f: SolicitudFormState) => SolicitudFormState) => void;
  /** Espaciado de los bloques (el mismo del <form> que lo aloja): 'space-y-5' en la lista, 'space-y-3.5' en el Asistente. */
  className?: string;
}>(function SolicitudTipoYDetalle({ form, setForm, className = 'space-y-5' }, ref) {
  const [usuarios, setUsuarios] = useState<{id:number;email:string;role:string}[]>([]);
  // U7+U8+H12+H13: lo escrito en el buscador (prodName) y las líneas ya agregadas. Elegir o crear un producto lo agrega
  // de una vez (cantidad 1, editable en su tarjeta); el SKU viaja en la línea para que la Cotización lo herede vinculado.
  const [prodName, setProdName] = useState('');
  const [productos, setProductos] = useState<any[]>([]);
  // Copia síncrona de las líneas: el alta rápida responde después de un await y no debe sumar sobre una lista vieja.
  const productosRef = useRef<any[]>([]);
  const prodInputRef = useRef<HTMLInputElement>(null);
  const [aviso, setAviso] = useState<{ texto: string; indice: number } | null>(null);
  const avisoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [segSearch, setSegSearch] = useState('');
  const [segResults, setSegResults] = useState<any[]>([]);
  const segTimer = useRef<any>(null);
  const [envio, setEnvio] = useState({nombre_completo:'',cedula:'',direccion:'',ciudad:'',telefono:'',transportadora:'',tipo_envio:'Contraentrega',ven_ids:''});
  const [devVen, setDevVen] = useState('');
  const [devPec, setDevPec] = useState('');
  const [devMotivo, setDevMotivo] = useState('');
  // T7 ronda 1 (A2): las pruebas de la devolución en su propio estado (antes cada tecla anteponía 'PRUEBAS: …' a las
  // notas, que acumulaban 'PRUEBAS: f', 'PRUEBAS: fo'… y viajaban a la COT y al PVEN).
  const [devPruebas, setDevPruebas] = useState('');

  useEffect(() => {
    apiFetch('/auth/users').then((d: any) => setUsuarios(Array.isArray(d) ? d : (d?.data ?? []))).catch(() => {});
  }, []);

  // El asesor por defecto es quien crea la solicitud (si puede ser asesor): una SC sin
  // asesor queda en BORRADOR y no puede avanzar hasta que alguien se lo asigne. Se aplica
  // una sola vez por montaje para que el usuario siga pudiendo dejarlo vacio a proposito.
  const asesorPorDefectoAplicado = useRef(false);
  useEffect(() => {
    if (asesorPorDefectoAplicado.current || usuarios.length === 0) return;
    asesorPorDefectoAplicado.current = true;
    if (form.advisor_user_id) return;
    const yo = usuarios.find(u => u.id === getUsuarioActual().id && esAsesorElegible(u.role));
    if (yo) setForm(f => ({ ...f, advisor_user_id: yo.id, advisor_name: yo.email }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuarios]);

  function onSegSearch(q: string) {
    setSegSearch(q);
    if (segTimer.current) clearTimeout(segTimer.current);
    if (!q.trim()) { setSegResults([]); return; }
    segTimer.current = setTimeout(async () => {
      const [sc, cot, ven] = await Promise.all([
        apiFetch(`/ventas/solicitudes?search=${encodeURIComponent(q)}&limit=5`).catch(() => []),
        apiFetch(`/ventas/cotizaciones?search=${encodeURIComponent(q)}&limit=5`).catch(() => []),
        apiFetch(`/ventas/pedidos?search=${encodeURIComponent(q)}&limit=5`).catch(() => []),
      ]);
      const arr = [
        ...(Array.isArray(sc) ? sc : (sc?.data ?? [])).map((x: any) => ({ ...x, _tipo: 'SC' })),
        ...(Array.isArray(cot) ? cot : (cot?.data ?? [])).map((x: any) => ({ ...x, _tipo: 'COT' })),
        ...(Array.isArray(ven) ? ven : (ven?.data ?? [])).map((x: any) => ({ ...x, _tipo: 'VEN' })),
      ];
      setSegResults(arr);
    }, 300);
  }

  useEffect(() => () => { if (avisoTimer.current) clearTimeout(avisoTimer.current); }, []);

  function cambiarProductos(lineas: any[]) {
    productosRef.current = lineas;
    setProductos(lineas);
  }

  function quitarAviso() {
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    avisoTimer.current = null;
    setAviso(null);
  }

  // U7+U8: agrega (o suma a la línea igual) lo elegido, creado o escrito; limpia el buscador, le devuelve el foco y
  // explica en un aviso verde (6 s) lo que pasó. Una línea en blanco no se agrega (agregarLinea da indice -1).
  // C8 (ronda 1): `textoUsado` es lo que había en el buscador al pedirlo; si ya dice otra cosa, no se borra.
  function agregar(linea: any, origen: 'catalogo' | 'creado' | 'existente' | 'texto' | 'texto-sin-comprobar', textoUsado?: string) {
    const r = agregarLinea(productosRef.current, linea);
    if (r.indice < 0) return;
    cambiarProductos(r.lineas);
    setProdName(actual => (textoUsado === undefined || actual.trim() === textoUsado ? '' : actual));
    prodInputRef.current?.focus();
    // T8B: el texto sale de la librería, el mismo que muestra el editor de productos del detalle.
    const texto = textoAvisoLinea(r, origen);
    if (avisoTimer.current) clearTimeout(avisoTimer.current);
    setAviso({ texto, indice: r.indice });
    avisoTimer.current = setTimeout(() => { avisoTimer.current = null; setAviso(null); }, 6000);
  }

  useImperativeHandle(ref, () => ({
    getExtras: () => {
      // H12: lo escrito sin agregar también se guarda, aunque ya haya otras líneas (igual que el editor del detalle);
      // al backend llega la forma de siempre {product_name, qty, unit_price_cop, sku_id}, sin claves internas.
      const prodsToSend = lineasParaEnviar(productosRef.current, prodName);
      let notasConExtras = form.notas;
      if (form.tipo_solicitud === 'Programar Entrega' && envio.nombre_completo) {
        notasConExtras = `ENVIO: ${JSON.stringify(envio)}\n${form.notas}`;
      } else if (form.tipo_solicitud === 'Devolucion de Producto') {
        // Las pruebas entran una sola vez, en la misma línea DEVOLUCION y solo si se escribió algo.
        const pruebas = devPruebas.trim().replace(/\s+/g, ' ');
        notasConExtras = `DEVOLUCION VEN:${devVen} PEC:${devPec} MOTIVO:${devMotivo}${pruebas ? ` PRUEBAS:${pruebas}` : ''}\n${form.notas}`;
      }
      return { productos: prodsToSend, notasConExtras };
    },
    reset: () => {
      cambiarProductos([]); setProdName(''); quitarAviso();
      setSegSearch(''); setSegResults([]);
      setEnvio({nombre_completo:'',cedula:'',direccion:'',ciudad:'',telefono:'',transportadora:'',tipo_envio:'Contraentrega',ven_ids:''});
      setDevVen(''); setDevPec(''); setDevMotivo(''); setDevPruebas('');
    },
  }));

  const isCotizacion = form.tipo_solicitud === 'Cotizacion de Producto';
  const isSeguimiento = form.tipo_solicitud === 'Seguimiento';
  const isProgramarEntrega = form.tipo_solicitud === 'Programar Entrega';
  const isDevolucion = form.tipo_solicitud === 'Devolucion de Producto';
  const isSoporte = form.tipo_solicitud === 'Soporte Tecnico';
  // T11 calidad (E1): el WhatsApp del resumen de envío con waUrl (no repite el 57) y solo con un teléfono que sirva
  // (telUrl, el mismo criterio que «Contactar cliente»); sin él no se pinta el enlace.
  const waEnvio = telUrl(envio.telefono) ? waUrl(envio.telefono, `Hola ${envio.nombre_completo}, tu pedido `
    + `${envio.ven_ids} será enviado por ${envio.transportadora} a ${envio.direccion}, ${envio.ciudad}. Tipo: ${envio.tipo_envio}`) : null;

  // C10 (ronda 1): el Enter en un campo de texto de este bloque (Seguimiento, Envío, Devolución, vencimiento…) no crea
  // la solicitud por el envío implícito del <form>. Sin stopPropagation: el buscador de productos y la cantidad siguen
  // con su propio manejo. Los textarea y los botones no se tocan.
  const evitarEnvioConEnter = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' && e.target instanceof HTMLInputElement) e.preventDefault();
  };

  return (
    <div className={className} onKeyDown={evitarEnvioConEnter}>
      {/* Tipo + Modalidad (Modalidad solo para Cotizacion) */}
      <div className={`grid gap-4 ${isCotizacion ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Tipo de Solicitud</label>
          <select value={form.tipo_solicitud} onChange={e=>setForm(f=>({...f,tipo_solicitud:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{TIPOS_SC.map(t=><option key={t} value={t}>{etiquetaTipoSolicitud(t)}</option>)}</select></div>
        {isCotizacion&&(
          <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Modalidad de Pago</label>
            <select value={form.modalidad_pago} onChange={e=>setForm(f=>({...f,modalidad_pago:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none">{MODALIDADES_PAGO.map(m=><option key={m} value={m}>{etiquetaModalidad(m)}</option>)}</select></div>
        )}
      </div>

      {/* H10: el anticipo que pedirá la cotización, para toda modalidad (R2: el mismo % que calcula el backend; 'Otro' o
          vacía, 60%). */}
      {isCotizacion&&(()=>{
        const pctReconocido = pctAnticipoDeModalidad(form.modalidad_pago);
        const pct = pctReconocido ?? 60;
        const frase = pctReconocido === null ? 'Se pedirá un anticipo del 60%.'
          : pct === 100 ? 'El cliente paga todo antes de crear el pedido de venta.'
          : pct === 0 ? 'Sin anticipo: el cliente paga según el plazo.'
          : `El ${100 - pct}% restante se paga al entregar.`;
        return (
          <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 space-y-2">
            <div className="flex gap-4">
              <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Anticipo antes del pedido</p><p className="font-black text-indigo-700 text-lg">{pct}%</p></div>
              <div className="flex-1 bg-white rounded-lg p-2 text-center"><p className="text-xs text-slate-500">Saldo</p><p className="font-black text-slate-700 text-lg">{100 - pct}%</p></div>
            </div>
            <p className="text-xs text-indigo-800">{frase} En la cotización se puede ajustar a mano con una nota.</p>
          </div>
        );
      })()}

      {/* TYPE-SPECIFIC FIELDS */}
      {isCotizacion&&(
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Productos a cotizar <span className="text-slate-300 font-medium normal-case">(puedes agregarlos después)</span></label>
          <ProductSearch value={prodName} onChange={setProdName} inputRef={prodInputRef}
            onSelect={(p, info) => agregar(lineaDesdeCatalogo(p, info), info ? (info.creado ? 'creado' : 'existente') : 'catalogo', info?.texto)}
            onAgregarTexto={(t, c, info) => agregar(c ? lineaDesdeCatalogo(c) : lineaTextoLibre(t),
              c ? 'catalogo' : info?.sinComprobar ? 'texto-sin-comprobar' : 'texto', t)}/>
          <div role="status" aria-live="polite">
            {aviso?.texto&&<p className="mt-2 text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2 break-words">{aviso.texto}</p>}
          </div>
          {productos.length>0&&(
            <div className="mt-2">
              <LineasProducto tono="morado" lineas={productos} resaltada={aviso?.indice ?? null}
                // Al quitar una línea el índice resaltado ya no sería el mismo producto: se quita el aviso.
                onChange={l=>{ if(l.length!==productosRef.current.length) quitarAviso(); cambiarProductos(l); }}/>
            </div>
          )}
          <p className="text-xs text-slate-500 mt-2">Elige del catálogo, créalo si no existe o agrégalo como texto libre. Sin productos la solicitud no se puede enviar al cliente ni cotizar.</p>
        </div>
      )}

      {isSeguimiento&&(
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Buscar SC / COT / Pedido de Venta</label>
          <div className="relative">
            <input type="text" value={segSearch} onChange={e=>onSegSearch(e.target.value)} placeholder="Número, cliente o producto…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none"/>
            {segResults.length>0&&(
              <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto">
                {segResults.map((r:any,i:number)=>(
                  <button key={i} type="button" onClick={()=>{setSegSearch(`${r._tipo}: ${r.numero}`);setSegResults([]);setForm(f=>({...f,notas:`Seguimiento a ${r._tipo} ${r.numero} - ${r.customer_name||''}\n${f.notas}`}));}} className="w-full text-left px-3 py-2 hover:bg-slate-50 text-sm border-b border-slate-50 last:border-0">
                    <span className="font-bold">{r.numero}</span>
                    <span className="ml-2 text-xs text-slate-400">{r._tipo} - {etiquetaEstadoSeguimiento(r)} - {r.customer_name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {segSearch&&<div className="mt-2 bg-blue-50 border border-blue-200 rounded-xl px-3 py-2"><p className="text-xs font-bold text-blue-700 flex items-center gap-1"><CheckCircle2 size={11}/>Referencia: {segSearch}</p></div>}
        </div>
      )}

      {isProgramarEntrega&&(
        <div className="space-y-3 bg-teal-50 border border-teal-100 rounded-xl p-4">
          <p className="text-xs font-black text-teal-700 uppercase">Datos de envío</p>
          <div className="grid grid-cols-2 gap-3">
            {[{l:'Nombre completo',k:'nombre_completo'},{l:'Cédula',k:'cedula'},{l:'Teléfono',k:'telefono'},{l:'Ciudad',k:'ciudad'},{l:'Transportadora',k:'transportadora'}].map(f=>(
              <div key={f.k}><label className="text-xs font-bold text-teal-600 mb-1 block">{f.l}</label><input type="text" value={(envio as any)[f.k]} onChange={e=>setEnvio(ev=>({...ev,[f.k]:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
            ))}
            <div><label className="text-xs font-bold text-teal-600 mb-1 block">Tipo de envío</label>
              <select value={envio.tipo_envio} onChange={e=>setEnvio(ev=>({...ev,tipo_envio:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"><option>Contraentrega</option><option>Contado</option></select></div>
          </div>
          <div><label className="text-xs font-bold text-teal-600 mb-1 block">Dirección</label><input type="text" value={envio.direccion} onChange={e=>setEnvio(ev=>({...ev,direccion:e.target.value}))} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
          <div><label className="text-xs font-bold text-teal-600 mb-1 block">Pedido(s) de venta (PVEN)</label><input type="text" value={envio.ven_ids} onChange={e=>setEnvio(ev=>({...ev,ven_ids:e.target.value}))} placeholder="PVEN-20260001, PVEN-20260002…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-teal-200"/></div>
          {envio.nombre_completo&&(
            <div className="mt-2">
              <p className="text-xs font-black text-teal-700 mb-1">Enviar resumen:</p>
              <div className="flex gap-2">
                {/* T11 calidad, ronda 1 (9): sin un teléfono que sirva, en vez del botón se dice por qué. */}
                {waEnvio ? <a href={waEnvio} target="_blank" rel="noreferrer" className="flex-1 bg-green-500 text-white py-2 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1"><MessageCircle size={12}/>WhatsApp</a>
                  : <span className="flex-1 self-center text-xs text-slate-500">{motivoTelefono(envio.telefono)}</span>}
                {form.modalidad_pago&&<a href={`mailto:?subject=${encodeURIComponent('Información de envío')}&body=${encodeURIComponent(`Destinatario: ${envio.nombre_completo}\nCédula: ${envio.cedula}\nDirección: ${envio.direccion}, ${envio.ciudad}\nTransportadora: ${envio.transportadora}\nTipo: ${envio.tipo_envio}`)}`} className="flex-1 bg-blue-500 text-white py-2 rounded-xl text-xs font-bold text-center flex items-center justify-center gap-1"><Mail size={12}/>Correo</a>}
              </div>
            </div>
          )}
        </div>
      )}

      {isDevolucion&&(
        <div className="space-y-3 bg-orange-50 border border-orange-100 rounded-xl p-4">
          <p className="text-xs font-black text-orange-700 uppercase">Datos de devolución</p>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pedido de venta (PVEN)</label><input type="text" value={devVen} onChange={e=>setDevVen(e.target.value)} placeholder="PVEN-20260001" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"/></div>
            <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pedido de compra (PEC)</label><input type="text" value={devPec} onChange={e=>setDevPec(e.target.value)} placeholder="PEC-20260001" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200"/></div>
          </div>
          <div><label className="text-xs font-bold text-orange-600 mb-1 block">Motivo de la devolución</label>
            {/* H10: los textos con 'menor' y 'total' se conservan (los usan los includes de abajo). */}
            <select value={devMotivo} onChange={e=>setDevMotivo(e.target.value)} className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-orange-200">
              <option value="">Selecciona el motivo…</option>
              <option>Daño menor: ajustar el precio de venta</option>
              <option>Daño total: ajuste negativo de inventario</option>
              <option>Producto incorrecto</option>
              <option>El cliente cambió de decisión</option>
            </select>
          </div>
          <div><label className="text-xs font-bold text-orange-600 mb-1 block">Pruebas (enlaces a imágenes o descripción)</label>
            <textarea rows={2} placeholder="Enlace a una foto o descripción del estado del producto…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-orange-200" value={devPruebas} onChange={e=>setDevPruebas(e.target.value)}/></div>
          {/* H10: texto honesto (ningún código del backend lee la nota DEVOLUCION: el ajuste se hace a mano). */}
          {(devMotivo.includes('menor')||devMotivo.includes('total'))&&<div className="bg-orange-100 rounded-xl p-3 text-xs text-orange-800 font-bold space-y-1">
            {devMotivo.includes('menor')&&<p>Queda anotado en la solicitud: ajustar el margen del pedido {devVen||'de venta'}.</p>}
            {devMotivo.includes('total')&&<p>Queda anotado en la solicitud: ajuste negativo de inventario del pedido de compra {devPec||'(sin número)'}.</p>}
            <p className="font-medium">El ajuste no se hace solo: hazlo desde el pedido o desde Compras.</p>
          </div>}
        </div>
      )}

      {isSoporte && (
        <div className="bg-purple-50 border border-purple-200 rounded-2xl p-4 space-y-3">
          <select value={form.tipo_problema||''} onChange={e=>setForm(f=>({...f,tipo_problema:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Tipo de problema…</option>
            <option>Falla del producto</option><option>Garantía</option>
            <option>Duda de uso</option><option>Problema con el pedido o el envío</option><option>Otro</option>
          </select>
          <textarea placeholder="Descripción del problema" value={form.descripcion_problema||''}
            onChange={e=>setForm(f=>({...f,descripcion_problema:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={3} />
          <select value={form.urgencia||''} onChange={e=>setForm(f=>({...f,urgencia:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Urgencia…</option>
            <option>Baja</option><option>Media</option><option>Alta</option>
          </select>
          <textarea placeholder="Descripción de la evidencia (fotos recibidas por fuera del sistema, etc.)…"
            value={form.evidencia_descripcion||''} onChange={e=>setForm(f=>({...f,evidencia_descripcion:e.target.value}))}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm" rows={2} />
          <select value={form.asignado_a_user_id||''} onChange={e=>{
            const uid = e.target.value ? Number(e.target.value) : '';
            setForm(f=>({...f, asignado_a_user_id: uid as any}));
          }}
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm">
            <option value="">Asignar a…</option>
            {usuarios.filter(u=>esAsesorElegible(u.role)).map(u=>(
              <option key={u.id} value={u.id}>{u.email}</option>
            ))}
          </select>
        </div>
      )}

      {/* Asesor + Vencimiento */}
      <div className="grid grid-cols-2 gap-4">
        <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Asesor</label><select value={form.advisor_user_id||''} onChange={e=>{
          const uid = e.target.value ? Number(e.target.value) : '';
          const u = usuarios.find(x=>x.id===uid);
          setForm(f=>({...f, advisor_user_id: uid, advisor_name: u?.email || f.advisor_name}));
        }}
        className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-indigo-400">
        <option value="">Selecciona un asesor…</option>
        {usuarios.filter(u=>esAsesorElegible(u.role)).map(u=>(
          <option key={u.id} value={u.id}>{u.email}</option>
        ))}
      </select></div>
        <div><label className="text-xs font-black text-slate-500 uppercase mb-2 block">Días de vencimiento</label><input type="number" min="1" max="365" value={form.dias_vencimiento} onChange={e=>setForm(f=>({...f,dias_vencimiento:Number(e.target.value)}))} className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-200 outline-none"/></div>
      </div>

      {/* Notas */}
      <div>
        <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Notas / Observaciones</label>
        <textarea value={form.notas} onChange={e=>setForm(f=>({...f,notas:e.target.value}))} rows={3} placeholder="Detalles de la solicitud…" className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-indigo-200 outline-none"/>
      </div>
    </div>
  );
});

// ── B4 T8: las piezas de la lista (TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas y FLUJO-ventas-pantallas) ──
// T11 (V2) armó aquí RowMenu (el menú «⋮» con su posición fija y sus recortes): lo reemplaza MenuFila de
// components/ui (R11: el ÚNICO menú ⋯, en un portal con posición fija, que se cierra con un clic afuera, Esc, un scroll o
// un cambio de tamaño). Las opciones y su lógica son las mismas (CeldaAcciones).

/** Un documento ligero de las listas `cotizaciones` y `pedidos_venta` de una fila (H32, RP15). */
type DocLigero = { id: number; numero?: string | null; estado?: string | null };

/**
 * Una fila de GET /ventas/solicitudes (T6B): el _sc_dict de la solicitud, sus cotizaciones y pedidos_venta ligeros, y
 * tipo, resolucion, dias_sin_mov, dias_creado y seguimiento_estado (R8, C14). La resolución y el atraso son los del
 * servidor: aquí no se recalculan. Lo demás pasa tal cual a las librerías.
 */
type FilaSC = {
  id: number;
  numero: string;
  estado: string;
  tipo?: string;
  tipo_solicitud?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  advisor_name?: string | null;
  advisor_user_id?: number | null;
  fecha_solicitud?: string | null;
  fecha_vencimiento?: string | null;
  eliminada_at?: string | null;
  cotizaciones?: DocLigero[] | null;
  pedidos_venta?: DocLigero[] | null;
  resolucion?: 'ATRASADO' | 'NO_RESUELTO' | 'ACCION_TOMADA' | 'CERRADO' | null;
  dias_sin_mov?: number | null;
  dias_creado?: number | null;
  seguimiento_estado?: string | null;
  [campo: string]: unknown;
};

/** Una fila de GET /ventas/solicitudes/papelera (B2.1 y N4): todas canceladas, sin `estado`. */
type FilaPapelera = {
  id: number;
  numero: string;
  customer_name?: string | null;
  advisor_name?: string | null;
  tipo_solicitud?: string | null;
  razon_cancelacion?: string | null;
  notas?: string | null;
  eliminada_at?: string | null;
  dias_restantes?: number | null;
  tiene_documentos?: boolean;
  [campo: string]: unknown;
};

/** `resumen` de con_resumen=1 (RP19): las tarjetas, la ayuda de Activas y el aviso «N vencidas». */
type ResumenSC = {
  activas?: number; confirmadas?: number; canceladas?: number; total?: number; con_cot?: number; esperan_cot?: number;
  sin_atender?: number; vencidas?: number;
};
/** `conteos` de con_conteos=1: las pestañas (con la búsqueda; sin vista, estados ni semáforo, R5). */
type ConteosSC = Partial<Record<'activas' | 'confirmadas' | 'canceladas' | 'soporte', number>>;
/** Lo que trajo la Papelera: `vuelta` es la de la petición que llegó; `filas`, null hasta la primera respuesta. */
type CargaPapelera = { vuelta: number; filas: FilaPapelera[] | null; error: string };
/** r1 (m6, D39): las columnas del tablero de una acción desde una tarjeta: [origen, destino]. */
type ColumnasDeTarjeta = readonly [string, string];

/** El id de la lista: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26), y el del
 *  modo compacto de la franja (RP90). B4 T8 r1 (A2): exportado para el esqueleto del Suspense (CargandoSolicitudes). */
export const ID_SC = 'ventas.solicitudes';
/** RP37: la Papelera es otra tabla (modo cliente), con su propio id para sus columnas. */
const ID_PAPELERA = 'ventas.solicitudes.papelera';
/** R8 (atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras»): primero lo atrasado. */
export const INICIAL_SC = { vista: 'activas', orden: 'atencion' };
/** B4 T8 r1 (A2): el contenedor de la lista (el del Hub, T7), el mismo en la pantalla y en su esqueleto del Suspense. */
// B4 T24 f2 (F44-a): la reserva del botón de la IA es el token RESERVA_BOTON_IA (pb-24) de design-system.ts.
export const CONTENEDOR_LISTA = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;
/** KANBAN-ventas-listas punto 7: los tickets de Soporte y la Papelera no van al tablero (se ven en lista). */
const VISTAS_SIN_TABLERO = ['soporte', 'papelera'];
/** R8 y r1 (m7): fuera del semáforo (Soporte) o de canceladas (la Papelera y Canceladas): «Con atraso» abre Activas. */
const VISTAS_SIN_ATRASO = ['soporte', 'papelera', 'canceladas'];
/**
 * B4 T8 r1 (m6, D39): en Kanban la lista va sin filas (limit=0): las pestañas no se ven y las filas no se pintan, pero
 * las tarjetas siguen con su resumen (con_resumen) en una consulta barata; las filas las piden las columnas del tablero.
 */
const EXTRA_TABLERO = { limit: 0 };
/**
 * RP35: la Papelera no es una vista del servidor y ahí la lista no pide nada. Solo cuando hacen falta los conteos (se
 * entró directo a ella y todavía no llegaron, o r1 (I1): después de Restaurar, de «Vaciar las vencidas» o de
 * «Actualizar»), se piden una vez sin filas (limit=0) y sin la vista: las pestañas y las tarjetas, que se ven también en
 * la Papelera, no quedan en gris ni viejas (D-T8-2 del reporte). r2 (p2): también sin la página ni el orden (los de la
 * tabla de la Papelera, que despacha al mismo estado): paginarla u ordenarla no cambia la URL de los conteos. La búsqueda
 * sí va: los conteos del servidor la usan (con_conteos, R5), como en las demás pestañas.
 */
const EXTRA_PAPELERA = { vista: null, limit: 0, offset: 0, orden: null };
/** La marca de los conteos pendientes al montar: hacen falta, y todavía no hay ninguna respuesta (crudo null). */
const CONTEOS_AL_ENTRAR = { antes: null };
const PAPELERA_SIN_CARGAR: CargaPapelera = { vuelta: -1, filas: null, error: '' };
const SIN_FILAS_PAPELERA: FilaPapelera[] = [];
/** r1 (m8): el «vacío» de la Papelera no depende de nada (una constante: la tabla no lo recibe nuevo en cada render). */
const VACIO_PAPELERA = (
  <EmptyState icon={Trash2} message="La papelera está vacía." hint="Las solicitudes canceladas aparecen aquí; se pueden eliminar definitivamente después de 30 días si no se restauran, salvo las que tienen cotizaciones, pedidos o leads vinculados. Un administrador vacía las vencidas, y la revisión automática también."/>
);

// Los chips: los tintes del tablero (CLASE_CHIP de components/ui/Kanban.tsx), así la misma marca sale igual en Lista y en
// Kanban (como el Hub, T7 r1 m7a). Sin tamaño de letra: cada uso pone el suyo.
const CHIP = 'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 font-bold leading-tight';
const FOCO_VISIBLE = FOCOS.indigo;
// D41: el tono opaco filaAlerta para la fila atrasada (la resolución del servidor, R8; antes un rosa translúcido solo en
// las Nuevas sin atender) y la marca rosa a la izquierda del Hub (una sombra en la primera celda, no un tinte).
const MARCA_ATRASO = '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-rose-500)]';
const claseDeFila = (sc: FilaSC) => (sc.resolucion === 'ATRASADO' ? `${TABLE.filaAlerta} ${MARCA_ATRASO}` : null);
const BOTON_FILA = `p-1.5 rounded-lg text-xs font-bold transition-colors ${FOCO_VISIBLE}`;

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaSC = {
  abrir: (sc: { id: number }) => void;
  cancelar: (sc: FilaSC) => void;
  aPapelera: (sc: FilaSC) => void;
  reiniciar: (sc: FilaSC) => void;
  restaurar: (sc: FilaPapelera) => void;
  eliminar: (sc: FilaPapelera) => void;
  /** B4 T24 f2 (m8 de la revisión r0 de f1): el rol cancela, reinicia, manda a la papelera y restaura (ADMIN y ASESOR, accesoTableroVentas). */
  mover: boolean;
  /** B4 T24 f2 r1 (m18): el rol de la sesión, leído después de montar (useRolActual): «Eliminar permanentemente» es de ADMIN. */
  rol: string;
};
const AccionesLista = createContext<AccionesFilaSC | null>(null);

/** H32: la marca de la cotización de la solicitud, debajo del número (las COT ligeras de la fila, T6B). */
function marcaCotizacion(sc: FilaSC): { texto: string; clase: string } | null {
  if (cotizacionesVigentes(sc).length > 0) return { texto: 'COT vinculada', clase: 'text-amber-700' };
  if (generoCotizacion(sc)) return { texto: 'COT rechazada', clase: 'text-rose-600' };
  return null;
}

/** SC / Trazabilidad: el número y, debajo, «COT vinculada» o «COT rechazada» (H32). */
function CeldaNumero({ sc }: { sc: FilaSC }) {
  const marca = marcaCotizacion(sc);
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-xs font-black text-indigo-700">{sc.numero}</span>
      {marca && <span className={`max-w-full truncate text-[10px] font-bold ${marca.clase}`}>{marca.texto}</span>}
    </span>
  );
}

function CeldaCliente({ sc }: { sc: FilaSC }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-xs font-bold text-slate-800">{sc.customer_name || '-'}</span>
      {sc.customer_phone && <span className="truncate text-[11px] text-slate-500">{sc.customer_phone}</span>}
    </span>
  );
}

/** Vencimiento: en rojo y con el triángulo si su día ya pasó en Colombia (B4.1, P8: fecha de negocio, fechaNegocioVencida). «5 nov 2026». */
function CeldaVencimiento({ sc }: { sc: FilaSC }) {
  const vencida = fechaNegocioVencida(sc.fecha_vencimiento);
  return (
    <span className={`text-xs ${vencida ? 'font-bold text-red-600' : 'font-medium text-slate-600'}`}>
      {vencida && <AlertTriangle size={10} aria-hidden="true" className="mr-1 inline" />}
      {fechaCorta(diaDeNegocio(sc.fecha_vencimiento)) || '-'}
    </span>
  );
}

/** U18+H31: en Canceladas, el motivo de la cancelación (nunca se inventa uno). */
function CeldaMotivo({ sc }: { sc: FilaSC }) {
  const motivo = motivoDeCancelacion(sc);
  return <span className={`text-xs ${motivo ? 'font-semibold text-rose-800' : 'italic text-slate-500'}`}>{motivo || SIN_MOTIVO_REGISTRADO}</span>;
}

/**
 * Estado: la insignia de estados-solicitud.js (U15: un estado desconocido sale humanizado) y, debajo, los chips de la
 * fila (chipsDocumentoVentas, RP18 y D4): «Atrasado N días», «Sin respuesta al recordatorio» (C14) y el de los cambios del
 * cliente de B3-T18 («Cambios pedidos» o «Ya no la necesita», etiquetaChipCambios): los mismos de la tarjeta del tablero.
 */
function CeldaEstado({ sc }: { sc: FilaSC }) {
  const e = estadoDeTarjeta('SC', sc.estado);
  const chips = chipsDocumentoVentas(sc, 'SC');
  const estilo = e.colores ? { color: e.colores.color, backgroundColor: e.colores.bg, borderColor: e.colores.border } : undefined;
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className={`${CHIP} text-[11px]`} style={estilo}>{e.label}</span>
      {chips.length > 0 && (
        <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
          {chips.map((c) => <span key={c.texto} className={`${CHIP} min-w-0 text-[10px] ${CLASE_CHIP[c.tono] ?? CLASE_CHIP.slate}`}>{c.texto}</span>)}
        </span>
      )}
    </span>
  );
}

const tituloEstado = (sc: FilaSC) =>
  [estadoDeTarjeta('SC', sc.estado).label, ...chipsDocumentoVentas(sc, 'SC').map((c) => c.texto)].join(' · ');

/**
 * Acciones: Ver, Cancelar (o «Enviar a la papelera» si ya está cancelada y no está en ella) y el menú ⋯ de T11 con sus
 * mismas opciones. N4: una SC cancelada solo vuelve por «Restaurar» en la Papelera y una que ya tiene eliminada_at ya está
 * en ella. Soporte Técnico no participa del estado ligado a la cotización ni de su cancelación (cancelarla la mandaría a
 * la purga y se perdería el ticket): su estado propio se cambia en el detalle. U15 (R30): ningún estado se pone a mano;
 * «Reiniciar» solo en Pendiente por confirmación o Confirmada sin documentos activos (puedeReiniciarSC: la regla del
 * tablero, con los pedidos_venta de la fila).
 */
function CeldaAcciones({ sc }: { sc: FilaSC }) {
  const acciones = useContext(AccionesLista);
  const soporte = sc.tipo_solicitud === 'Soporte Tecnico';
  const cancelada = sc.estado === 'CANCELADA';
  // B4 T24 f2 (m8 de la revisión r0 de f1): cancelar y «Enviar a la papelera» (POST /solicitudes/{id}/cancelar) y «Reiniciar» (PATCH)
  // son de ADMIN y ASESOR: sin ese permiso la fila queda con «Ver Detalle» y «Editar».
  const conAcciones = acciones?.mover === true && !soporte && (!cancelada || !sc.eliminada_at);
  const destinoReinicio = infoEstadoSolicitud(sc.advisor_user_id ? 'ASIGNADA' : 'BORRADOR').label;
  const items: ItemMenuFila[] = [
    { etiqueta: 'Ver Detalle', icono: FileText, onClick: () => acciones?.abrir(sc) },
    // B4 T24 f2 r1 (m19 + m37): «Editar» promete el PATCH (ADMIN y ASESOR); sin permiso, solo «Ver Detalle».
    { etiqueta: 'Editar', icono: Edit2, onClick: () => acciones?.abrir(sc), oculto: !acciones?.mover },
    { etiqueta: `Reiniciar (volver a ${destinoReinicio})`, icono: RotateCcw, onClick: () => acciones?.reiniciar(sc),
      oculto: !conAcciones || !puedeReiniciarSC(sc) },
    { etiqueta: 'Enviar a la papelera', icono: Trash2, peligro: true, onClick: () => acciones?.aPapelera(sc), oculto: !conAcciones || !cancelada },
    { etiqueta: 'Cancelar Solicitud', icono: AlertCircle, peligro: true, onClick: () => acciones?.cancelar(sc), oculto: !conAcciones || cancelada },
  ];
  return (
    <span className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => acciones?.abrir(sc)} title="Ver Detalle" aria-label={`Ver ${sc.numero}`}
        className={`${BOTON_FILA} bg-indigo-50 hover:bg-indigo-100 text-indigo-700`}>
        <FileText size={13} aria-hidden="true" />
      </button>
      {conAcciones && (cancelada ? (
        <button type="button" onClick={() => acciones?.aPapelera(sc)} title="Enviar a la papelera" aria-label={`Enviar ${sc.numero} a la papelera`}
          className={`${BOTON_FILA} bg-rose-50 hover:bg-rose-100 text-rose-600`}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={() => acciones?.cancelar(sc)} title="Cancelar Solicitud" aria-label={`Cancelar ${sc.numero}`}
          className={`${BOTON_FILA} bg-slate-100 hover:bg-amber-50 hover:text-amber-700 text-slate-600`}>
          <X size={13} aria-hidden="true" />
        </button>
      ))}
      <MenuFila items={items} etiqueta={`Acciones de ${sc.numero}`} />
    </span>
  );
}

/**
 * B4 T8, la tabla (TABLA-listas-ventas punto 5; R26, D41). Las columnas del diseño: SC / Trazabilidad (clave, fija a la
 * izquierda), Tipo, Cliente (la flexible), Asesor, Fecha, Vencimiento, Estado (clave) y Acciones (fija a la derecha). Tipo,
 * Asesor y Fecha salen ocultas (R26: se muestran con «Ajustar tabla»). A 1024 px con el menú abierto quedan 704 px para
 * las columnas (lo midió T7 en el Hub, con el mismo contenedor): 40 de la casilla + 132 + 160 + 104 + 120 + 104 = 660.
 * Constantes (estables, D40); sus celdas piden a la pantalla lo suyo por AccionesLista.
 */
const COLUMNA_VENCIMIENTO: ColumnaTabla<FilaSC> = {
  id: 'vencimiento', titulo: 'Vencimiento', ancho: 104, ordenable: 'vencimiento',
  titleCelda: (sc) => fechaLarga(diaDeNegocio(sc.fecha_vencimiento)) || 'Sin vencimiento', celda: (sc) => <CeldaVencimiento sc={sc} />,
};
/** En Canceladas, la misma columna (el mismo id: el usuario la mueve y la estira una sola vez) dice el motivo. */
const COLUMNA_MOTIVO: ColumnaTabla<FilaSC> = {
  id: 'vencimiento', titulo: 'Motivo', ancho: 140,
  titleCelda: (sc) => motivoDeCancelacion(sc) || SIN_MOTIVO_REGISTRADO, celda: (sc) => <CeldaMotivo sc={sc} />,
};

function columnasDeLaTabla(vencimiento: ColumnaTabla<FilaSC>): ColumnaTabla<FilaSC>[] {
  return [
    { id: 'numero', titulo: 'SC / Trazabilidad', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero',
      titleCelda: (sc) => [sc.numero, marcaCotizacion(sc)?.texto].filter(Boolean).join(' · '), celda: (sc) => <CeldaNumero sc={sc} /> },
    { id: 'tipo', titulo: 'Tipo', ancho: 120, ocultaPorDefecto: true, ordenable: 'tipo',
      titleCelda: (sc) => etiquetaTipoSolicitud(sc.tipo_solicitud || 'Cotizacion de Producto'),
      celda: (sc) => <TipoBadge tipo={sc.tipo_solicitud || 'Cotizacion de Producto'} /> },
    { id: 'cliente', titulo: 'Cliente', ancho: 160, flexible: true, ordenable: 'cliente',
      titleCelda: (sc) => [sc.customer_name || '-', sc.customer_phone].filter(Boolean).join(' · '),
      celda: (sc) => <CeldaCliente sc={sc} /> },
    { id: 'asesor', titulo: 'Asesor', ancho: 120, ocultaPorDefecto: true, ordenable: 'asesor', celda: (sc) => sc.advisor_name || '-' },
    { id: 'fecha', titulo: 'Fecha', ancho: 96, ocultaPorDefecto: true, ordenable: 'creado',
      titleCelda: (sc) => fechaLarga(sc.fecha_solicitud) || null, celda: (sc) => fechaCorta(sc.fecha_solicitud) || '-' },
    vencimiento,
    { id: 'estado', titulo: 'Estado', ancho: 120, clave: true, ordenable: 'estado', titleCelda: tituloEstado,
      celda: (sc) => <CeldaEstado sc={sc} /> },
    { id: 'acciones', titulo: 'Acciones', ancho: 104, clave: true, fija: 'derecha', celda: (sc) => <CeldaAcciones sc={sc} /> },
  ];
}
export const COLUMNAS_TABLA_SC = columnasDeLaTabla(COLUMNA_VENCIMIENTO);
const COLUMNAS_CANCELADAS = columnasDeLaTabla(COLUMNA_MOTIVO);

/** La Papelera: «Se borra» con estadoEnPapelera (B2.1 D2: TEXTO_PAPELERA_VENCIDA en las vencidas; nada se borra solo). */
function CeldaSeBorra({ sc }: { sc: FilaPapelera }) {
  const enPapelera = estadoEnPapelera(sc);
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className={`truncate text-xs font-black ${enPapelera.conservada ? 'text-slate-600' : enPapelera.urgente ? 'text-red-600' : 'text-amber-700'}`}>{enPapelera.texto}</span>
      {enPapelera.nota && <span className="truncate text-[10px] text-slate-500">{enPapelera.nota}</span>}
    </span>
  );
}

/** Acciones de la Papelera: «Restaurar» y, solo para un administrador y si se puede (H34), «Eliminar permanentemente». */
function CeldaAccionesPapelera({ sc }: { sc: FilaPapelera }) {
  const acciones = useContext(AccionesLista);
  const enPapelera = estadoEnPapelera(sc);
  return (
    <span className="flex items-center justify-end gap-1.5">
      {/* B4 T24 f2 (m8 de la revisión r0 de f1): POST /solicitudes/{id}/restaurar es de ADMIN y ASESOR. */}
      {acciones?.mover && (
        <button type="button" onClick={() => acciones?.restaurar(sc)} aria-label={`Restaurar ${sc.numero}`}
          className={`bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-emerald-200 flex items-center gap-1 ${FOCO_VISIBLE}`}>
          <RotateCcw size={11} aria-hidden="true" />Restaurar
        </button>
      )}
      {esAdministrador(acciones?.rol)&&enPapelera.puedeEliminar&&(
        <button type="button" onClick={() => acciones?.eliminar(sc)} title="Eliminar permanentemente" aria-label={`Eliminar ${sc.numero} permanentemente`}
          className={`bg-red-50 hover:bg-red-100 text-red-600 p-1.5 rounded-lg border border-red-200 ${FOCO_VISIBLE}`}>
          <Trash2 size={13} aria-hidden="true" />
        </button>
      )}
    </span>
  );
}

/**
 * RP37: la Papelera como tabla, con sus columnas: SC (y su tipo), Cliente (y el asesor), Motivo (motivoDeCancelacion),
 * Cancelada el, «Se borra» y Acciones. Se ordena por número o cliente (los mismos campos que entiende el servidor: el
 * estado de la pantalla es uno solo y al volver a la lista el orden sigue sirviendo).
 */
const COLUMNAS_PAPELERA: ColumnaTabla<FilaPapelera>[] = [
  { id: 'numero', titulo: 'SC', ancho: 120, clave: true, fija: 'izquierda', ordenable: 'numero', valorOrden: (sc) => sc.numero,
    titleCelda: (sc) => [sc.numero, etiquetaTipoSolicitud(sc.tipo_solicitud)].filter(Boolean).join(' · '),
    celda: (sc) => (
      <span className="flex min-w-0 flex-col items-start leading-tight">
        <span className="max-w-full truncate text-xs font-black text-red-700">{sc.numero}</span>
        <span className="max-w-full truncate text-[10px] font-bold text-slate-500">{etiquetaTipoSolicitud(sc.tipo_solicitud) || 'SC'}</span>
      </span>
    ) },
  { id: 'cliente', titulo: 'Cliente', ancho: 140, flexible: true, ordenable: 'cliente', valorOrden: (sc) => sc.customer_name ?? '',
    titleCelda: (sc) => [sc.customer_name || '-', sc.advisor_name].filter(Boolean).join(' · '),
    celda: (sc) => (
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate text-xs font-bold text-slate-800">{sc.customer_name || '-'}</span>
        <span className="truncate text-[11px] text-slate-500">{sc.advisor_name || '-'}</span>
      </span>
    ) },
  { id: 'motivo', titulo: 'Motivo', ancho: 160, titleCelda: (sc) => motivoDeCancelacion(sc) || SIN_MOTIVO_REGISTRADO,
    celda: (sc) => <span className="text-xs italic text-slate-600">{motivoDeCancelacion(sc) || SIN_MOTIVO_REGISTRADO}</span> },
  // B4 T8 r1 (A3): oculta por defecto (el patrón de R26): a 1024 px con el menú abierto la Papelera ya no corre de lado.
  { id: 'cancelada', titulo: 'Cancelada el', ancho: 104, ocultaPorDefecto: true, titleCelda: (sc) => fechaLarga(sc.eliminada_at) || null,
    celda: (sc) => fechaCorta(sc.eliminada_at) || '-' },
  { id: 'se_borra', titulo: 'Se borra', ancho: 150, titleCelda: (sc) => [estadoEnPapelera(sc).texto, estadoEnPapelera(sc).nota].filter(Boolean).join(' '),
    celda: (sc) => <CeldaSeBorra sc={sc} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 140, clave: true, fija: 'derecha', celda: (sc) => <CeldaAccionesPapelera sc={sc} /> },
];

/** useListadoCliente de la Papelera (D40: accesores estables). Todas sus filas están canceladas (no traen `estado`). */
const ACCESORES_PAPELERA = {
  busqueda: ['numero', 'customer_name', 'advisor_name', (sc: FilaPapelera) => motivoDeCancelacion(sc)],
  orden: accesoresDeOrden(COLUMNAS_PAPELERA),
  estadoDe: () => 'CANCELADA',
};

/**
 * Las pestañas de la lista (TABLA-listas-ventas punto 5): las 4 vistas del servidor con sus conteos (con_conteos: con la
 * búsqueda, sin la vista, los estados ni el semáforo; null mientras cargan: la barra gris, nunca 0) y la Papelera sin
 * conteo (no es una vista del servidor). Sin emojis. B4 T8 r1 (A2): la misma en la pantalla y en su esqueleto.
 */
export function pestanasDeLaLista(conteos: ConteosSC | null, { papelera = false }: { papelera?: boolean } = {}): PestanaTabla[] {
  return [
    { id: 'activas', etiqueta: 'Activas', conteo: conteos?.activas ?? null },
    { id: 'confirmadas', etiqueta: 'Confirmadas', conteo: conteos?.confirmadas ?? null },
    { id: 'canceladas', etiqueta: 'Canceladas', conteo: conteos?.canceladas ?? null },
    { id: 'soporte', etiqueta: 'Soporte', conteo: conteos?.soporte ?? null },
    // B4 T24 f2 r1 (m21): la Papelera (GET /solicitudes/papelera: ADMIN y ASESOR) solo con `papelera`; el esqueleto (el rol sin leer),
    // sin ella.
    ...(papelera ? [{ id: 'papelera', etiqueta: 'Papelera', conteo: null, sinConteo: true }] : []),
  ];
}

/**
 * Los botones de la cabecera: «Actualizar», «Ver análisis» (R13: el Análisis del Hub enfocado en Solicitudes,
 * ?tab=analisis&foco=sc, enlaceVerAnalisis) y «Nueva Solicitud». B4 T8 r1 (A2): los mismos en el esqueleto del Suspense,
 * que los pinta invisibles para que la cabecera mida lo mismo.
 */
export function AccionesCabecera({ onActualizar, actualizando, onNueva }: { onActualizar: () => void; actualizando: boolean; onNueva?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={onActualizar} className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}><RefreshCw size={15} aria-hidden="true" className={actualizando?'animate-spin':''}/> Actualizar</button>
      <Link href={enlaceVerAnalisis('sc')}
        className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}>
        <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
      </Link>
      {/* B4 T24 f2 r1 (m19): crear una solicitud (POST /solicitudes) es de ADMIN y ASESOR: sin onNueva, sin el botón. */}
      {onNueva && <Button onClick={onNueva} color="indigo" icon={Plus}>Nueva Solicitud</Button>}
    </div>
  );
}


// ── IA Panel SC ────────────────────────────────────────────────────────────────
export function IAPanelSC({sc,apiBase}:{sc:any;apiBase:string}) {
  const [analisis,setAnalisis]=useState('');
  const [loading,setLoading]=useState(false);
  const [chat,setChat]=useState('');
  const [chatHistory,setChatHistory]=useState<{role:'user'|'ia';text:string}[]>([]);
  const [sending,setSending]=useState(false);
  const tipo=sc?.tipo_solicitud||'Cotizacion de Producto';
  const isTraz=['Seguimiento','Programar Entrega'].includes(tipo);
  const isDev=tipo==='Devolucion de Producto';
  const label=isTraz?'Análisis de trazabilidad':isDev?'Análisis de devolución':'Análisis de la solicitud';
  async function generar() {
    setLoading(true);
    try{
      const token=getToken();
      const res=await fetch(`${apiBase}/ventas/solicitudes/${sc.id}/ia-analisis`,{method:'POST',headers:{'Content-Type':'application/json','Authorization':`Bearer ${token}`}});
      const d=await res.json().catch(()=>({}));
      setAnalisis(d.data?.analisis||d.analisis||'Error al generar el análisis.');
    }catch(e:any){setAnalisis('Error: '+e.message);}
    setLoading(false);
  }
  async function askChat() {
    if(!chat.trim()) return;
    setSending(true);
    const userMsg=chat;setChat('');
    setChatHistory(h=>[...h,{role:'user',text:userMsg}]);
    setChatHistory(h=>[...h,{role:'ia',text:`Con base en ${sc.numero} (${etiquetaTipoSolicitud(tipo)}):${(analisis||'Sin análisis previo.').slice(0,150)}... Puedo profundizar en cualquier aspecto.`}]);
    setSending(false);
  }
  // T8B ronda 2: los enlaces del «Formato de Confirmación» con el criterio del detalle: WhatsApp solo con un teléfono que
  // sirva para llamar (telUrl; waUrl no repite el 57) y el correo y el asunto codificados (mailtoUrl: un correo con
  // «?bcc=» no agrega destinatarios). Si es null, no se pinta el enlace. El texto del mensaje no cambia.
  const whatsappConfirmacion = telUrl(sc?.customer_phone)
    ? waUrl(sc?.customer_phone, 'Hola '+sc?.customer_name+', confirma tu solicitud '+sc?.numero+'. Responde SI para confirmar.') : null;
  const correoConfirmacion = mailtoUrl(sc?.customer_email, `Confirma ${sc?.numero}`, '');
  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="bg-gradient-to-br from-indigo-50 to-blue-50 rounded-2xl p-4 border border-indigo-100">
          <div className="flex items-center gap-2 mb-3">
            <div className="bg-indigo-600 rounded-lg p-1.5 text-white text-xs">AI</div>
            <div><p className="font-extrabold text-indigo-900 text-sm">{label}</p><p className="text-[10px] text-indigo-500">Nebulae AI - {etiquetaTipoSolicitud(tipo)}</p></div>
          </div>
          {!analisis&&!loading&&(
            <div className="text-center py-4">
              <p className="text-xs text-indigo-700 mb-3 font-medium">
                {isTraz?'Genera el análisis de trazabilidad: estados, historial y próximos pasos.':
                 isDev?'Verifica si la devolución cumple las condiciones de la política (30 días, estado).':
                 'Obtén un análisis completo de esta solicitud.'}
              </p>
              <button onClick={generar} className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl font-bold text-sm shadow flex items-center gap-2 mx-auto">
                Generar análisis con IA
              </button>
            </div>
          )}
          {loading&&<div className="flex items-center gap-2 py-4 justify-center"><RefreshCw size={16} className="animate-spin text-indigo-600"/><p className="text-sm text-indigo-700 font-medium">Analizando solicitud...</p></div>}
          {analisis&&!loading&&(
            <div>
              <pre className="text-xs text-slate-800 whitespace-pre-wrap font-medium leading-relaxed bg-white/80 rounded-xl p-3 border border-indigo-100">{analisis}</pre>
              <button onClick={generar} className="mt-2 text-xs text-indigo-600 hover:underline font-bold">Re-generar</button>
            </div>
          )}
        </div>
        {sc?.tipo_solicitud==='Cotizacion de Producto'&&(
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
            <p className="font-extrabold text-amber-800 text-sm mb-2">Formato de confirmación al cliente</p>
            <div className="bg-white border border-amber-300 rounded-xl p-4 mb-3 shadow-sm">
              <div className="flex items-center gap-2 mb-3 border-b pb-2">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-sm">N</div>
                <div><p className="font-black text-slate-900 text-sm">Nebulae Kids</p><p className="text-[10px] text-slate-500">Solicitud de confirmación</p></div>
              </div>
              <p className="text-xs font-bold text-slate-700 mb-1">SC: <span className="text-indigo-700">{sc.numero}</span></p>
              <p className="text-xs text-slate-600 mb-0.5">Cliente: <strong>{sc.customer_name}</strong></p>
              <p className="text-xs text-slate-600 mb-0.5">Tipo: {etiquetaTipoSolicitud(sc.tipo_solicitud)}</p>
              {sc.modalidad_pago&&<p className="text-xs text-slate-600 mb-0.5">Modalidad: {etiquetaModalidad(sc.modalidad_pago)}</p>}
              {(sc.productos||[]).length>0&&<div className="mt-2">{sc.productos.slice(0,3).map((p:any,i:number)=><p key={i} className="text-xs text-slate-700">- {p.product_name} x{p.qty}</p>)}</div>}
            </div>
            <div className="grid grid-cols-3 gap-2">
              {whatsappConfirmacion&&<a href={whatsappConfirmacion} target="_blank" rel="noreferrer" className="bg-green-500 text-white py-2 rounded-xl text-[10px] font-black text-center hover:bg-green-600">WhatsApp</a>}
              {correoConfirmacion&&<a href={correoConfirmacion} className="bg-blue-500 text-white py-2 rounded-xl text-[10px] font-black text-center hover:bg-blue-600">Email</a>}
              <button onClick={()=>window.print()} className="bg-slate-100 text-slate-700 py-2 rounded-xl text-[10px] font-black hover:bg-slate-200">PDF</button>
            </div>
          </div>
        )}
        {chatHistory.map((m,i)=>(
          <div key={i} className={`flex ${m.role==='user'?'justify-end':''}`}>
            <div className={`rounded-2xl px-3 py-2 text-xs max-w-[85%] ${m.role==='user'?'bg-indigo-600 text-white':'bg-white border border-slate-200 text-slate-700'}`}>{m.text}</div>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 p-3 flex gap-2">
        <input value={chat} onChange={e=>setChat(e.target.value)} onKeyDown={e=>e.key==='Enter'&&askChat()} placeholder="Pregunta sobre esta solicitud..." className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-xs focus:ring-2 focus:ring-indigo-200 outline-none"/>
        <button onClick={askChat} disabled={!chat.trim()||sending} className="bg-indigo-600 text-white px-3 py-2 rounded-xl text-xs font-bold disabled:opacity-50">Enviar</button>
      </div>
    </div>
  );
}

// â”€â”€ Main â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// U18+H31 (C1 h): el motivo de una cancelación, o '' si no se registró (quien lo muestra pone 'Sin motivo registrado'):
// nunca se inventa uno. La regla vive en la librería (motivoDeCancelacion, la misma de resumenCancelacion).
const SIN_MOTIVO_REGISTRADO = 'Sin motivo registrado';
const getRazonCancelacion = (sc: any): string => motivoDeCancelacion(sc);

export default function SolicitudClient() {
  // B4 T8: ya no hay arreglos en memoria (antes, las 200 más recientes): la lista, la búsqueda, la pestaña y la página
  // son del estado único y del servidor (bloque 1, más abajo).
  const [showCreate,setShowCreate]=useState(false);
  const [saving,setSaving]=useState(false);
  // H49 (T1B): avisos y confirmaciones del sistema (showToast, más abajo, es el adaptador de las llamadas de siempre).
  const { avisar, avisarError, confirmar } = useAvisos();
  // Revisión final (F9, patrón de confirmarSC en solicitud/[id]): false cuando la lista se desmonta (el usuario se fue a
  // otra pantalla). Una solicitud que se termina de crear después ya no lo arrastra a ella: se le avisa con un enlace.
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => { vivo.current = false; };
  }, []);
  const [currentUser,setCurrentUser]=useState('');
  // B4 T8 (ANALISIS-ventas punto 4 con R2 y R13): se fueron los estados del Análisis de la lista (topClientsLimit,
  // donutMode, aiQuery, aiLoading, aiChatHistory y su chat simulado con setTimeout), el del pipeline oscuro
  // (showPipelineGuide), los días de alerta de la Configuración (alertDias: sin atender y las vencidas llegan en el resumen
  // del servidor) y el total del servidor (totalServidor: la tabla trae el suyo).

  async function enviarAPapelera(id:number) {
    const existing = filaPorId(id);
    if(!(await confirmar({
      titulo: `Enviar ${existing?.numero || 'la solicitud'} a la papelera`,
      mensaje: 'La solicitud ya está cancelada. Desde la papelera se puede restaurar.',
      textoConfirmar: 'Enviar a la papelera',
      peligro: true,
    }))) return;
    try {
      // C1 h: sin motivo registrado no se inventa uno: se dice que no lo hay.
      const razonToSend = (existing && getRazonCancelacion(existing)) || '';
      await apiFetch(`/ventas/solicitudes/${id}/cancelar`, {
        method: 'POST',
        body: JSON.stringify({
          razon: motivoValido(razonToSend) ? razonToSend : 'Enviada a la papelera (sin motivo registrado)',
          user_name: currentUser || 'asesor'
        })
      });
      showToast('Solicitud enviada a la papelera', 'ok');
      recargarLista();
      recargarPapelera();
    } catch(err:any) {
      showToast('Error: ' + err.message, 'err');
    }
  }

  // Cancelar con razón
  const [showCancelModal,setShowCancelModal]=useState(false);
  // N4: ids de las solicitudes a cancelar (una desde la fila o varias desde la barra masiva) y por que fallaron.
  const [cancelTarget,setCancelTarget]=useState<number[]>([]);
  const [cancelRazon,setCancelRazon]=useState('');
  // B4 T24 (FINAL-m32): el id que une la etiqueta «Motivo de la cancelación» con su campo (nombre accesible).
  const idMotivo = useId();
  // B4 T24 f2 r1 (m34): el «llevas N» nombra el campo (aria-describedby) mientras el motivo no alcanza.
  const idAyudaMotivo = `${idMotivo}-ayuda`;
  const [cancelling,setCancelling]=useState(false);
  const [cancelErrores,setCancelErrores]=useState<string[]>([]);
  // Marcadas que no se envian a /cancelar (ya estan en la Papelera o son de Soporte): se informan, no se llaman.
  const [cancelOmitidas,setCancelOmitidas]=useState<{id:any;numero:string;motivo:string}[]>([]);
  // r1 (m6, D39): si la cancelación salió de una tarjeta del tablero, su origen y su destino (lo que se recarga al final).
  const [cancelColumnas,setCancelColumnas]=useState<ColumnasDeTarjeta | null>(null);

  // Papelera (lo que trajo GET /ventas/solicitudes/papelera vive en el bloque 1, más abajo).
  // B2.1 D2: «Vaciar las vencidas» en curso (el botón no se puede pulsar dos veces).
  const [vaciandoPapelera,setVaciandoPapelera]=useState(false);

  // Checkboxes (N4: la barra masiva). B4 T8: la barra se ve con algo marcado (ya no hay un estado aparte).
  const [checked,setChecked]=useState<Set<number>>(new Set());

  // Create form
  const [form,setForm]=useState<SolicitudFormState>({advisor_name:'',advisor_user_id:'',tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:5,tipo_problema:'',descripcion_problema:'',urgencia:'',evidencia_descripcion:'',asignado_a_user_id:''});
  // Producto/envio/devolucion/seguimiento/asesor viven en <SolicitudTipoYDetalle>,
  // montado via este ref mas abajo (ver createSolicitud/resetCreateForm).
  const tipoDetalleRef = useRef<SolicitudTipoYDetalleHandle>(null);

  // H11: el cliente elegido; la búsqueda y el alta viven en <SelectorClienteSC> (selector-cliente.tsx).
  const [selectedCust,setSelectedCust]=useState<any|null>(null);

  // Los de error pasan por textoDeError (sin conexión, '[object Object]', 'Error: ' repetido).
  const showToast=(msg:string,type:'ok'|'err'='ok')=>{
    if(type==='err') avisar(textoDeError(msg),{tono:'error'});
    else avisar(msg,{tono:'ok'});
  };

  useEffect(()=>{
    const u=localStorage.getItem('user_name')||localStorage.getItem('username')||'';
    setCurrentUser(u);
    setForm(f=>({...f,advisor_name:u}));
  },[]);

  // ── B4 T8, bloque 1: la carga del servidor (TABLA-listas-ventas punto 5; R5, R8, C3, C4; RP26, RP35, D39, D40) ──
  // El estado ÚNICO de la lista: las pestañas, la búsqueda, el filtro de estados, el semáforo de la franja, las tarjetas,
  // la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en vista:ventas.solicitudes (RP26: este hook
  // es su único dueño) y la pestaña, la página y la búsqueda en la sesión (volver del detalle deja lo mismo).
  const [estado, despachar, listo] = useEstadoTabla(ID_SC, INICIAL_SC);
  // B4 T24 (FINAL-m31 y FINAL-m38): el rol después de montar (useRolActual) decide si el tablero se mueve (accesoTableroVentas: el
  // require_roles del PATCH de destino); sin permiso, soloLectura (no se arrastra ni se ofrece «Mover a…») y sin acciones masivas.
  const rol = useRolActual();
  const accesoTablero = accesoTableroVentas(rol);
  // La tarjeta del tablero (KANBAN-ventas-listas punto 7, RP15, RP18, D37 y el cruce C5): vuelve a esta lista. B4 T24 f2 r1 (duda 2 +
  // m15): ofrece su acción solo si el rol puede hacerla (su require_roles); si no, «Abrir».
  const tarjetaDeSC = useCallback((sc: FilaSC) => tarjetaSolicitud(sc, { returnTo: RUTA_LISTA_SOLICITUDES, rol }), [rol]);
  const enPapelera = estado.vista === 'papelera';
  // KANBAN-ventas-listas punto 7: Soporte y la Papelera no tienen tablero (ahí no aparece el botón y se ve la lista).
  const kanbanDisponible = !VISTAS_SIN_TABLERO.includes(estado.vista ?? '');
  const modoEfectivo = kanbanDisponible ? estado.modo : 'lista';

  // La tabla (T6B): GET /ventas/solicitudes con vista, estados, semáforo, q, orden, limit y offset del estado, más los
  // conteos de las pestañas y el resumen de las tarjetas (RP19) en la MISMA llamada. esperar: !listo (D40): el esqueleto,
  // nunca «vacío». RP35: en la Papelera no pide nada y nunca manda vista=papelera, salvo la petición única de los conteos
  // (EXTRA_PAPELERA: sin la vista y con limit=0, D-T8-2) cuando hacen falta:
  //  - al entrar directo a ella (la sesión la recuerda) sin conteos todavía (la marca empieza puesta);
  //  - B4 T8 r1 (I1; B2.1, revisión final Minor 2): después de Restaurar, de «Vaciar las vencidas» y de «Actualizar»
  //    (pedirConteos), para que las pestañas y las tarjetas no sigan contando las restauradas o las purgadas.
  // La marca guarda el `crudo` que había al ponerla y se apaga cuando llega otra respuesta (no con «ya hay conteos», que
  // ya era cierto). r2 (p2): o cuando la petición falla. Un error fallido conserva el mismo crudo, y useListado solo
  // muestra el error cuando la petición vigente ya llegó (mientras va en camino es null: estadoListado). Si no, la lista
  // seguía prendida y cada gesto en la Papelera volvía a pedir limit=0. «Actualizar» es el reintento.
  const [conteosPendientes, setConteosPendientes] = useState<{ antes: unknown } | null>(CONTEOS_AL_ENTRAR);
  const listado = useListado<FilaSC>({
    ruta: '/ventas/solicitudes', estado, conConteos: true, conResumen: true, esperar: !listo, despachar,
    activo: !enPapelera || conteosPendientes !== null,
    extra: enPapelera ? EXTRA_PAPELERA : modoEfectivo === 'kanban' ? EXTRA_TABLERO : null,
  });
  if (conteosPendientes !== null && (listado.crudo !== conteosPendientes.antes || listado.error !== null)) setConteosPendientes(null);
  // El crudo de ahora, para la marca que se pone en un manejador (después de un await, el del render ya pudo cambiar).
  const crudoActual = useRef<unknown>(null);
  useLayoutEffect(() => { crudoActual.current = listado.crudo; });
  // r1 (m5): la última respuesta y si llegó sin filas (la de la Papelera o la de Kanban). Mientras sea de esas y la tabla
  // ya pida su página (otra pestaña, o de Kanban a Lista), la tabla está cargando y el total en 'cargando': nunca «No hay
  // solicitudes en esta vista» con el total de la otra consulta. Se pone al día durante el render (llegadaDeListado).
  const sinFilasAhora = enPapelera || modoEfectivo === 'kanban';
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, sinFilasAhora);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !sinFilasAhora && llegadaAhora.sinFilas && !listado.error;

  // La franja del flujo (R8): GET /ventas/flujo; recargaFlujo sube con cada recarga de la lista.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/ventas/flujo', recargaFlujo);

  // El tablero en modo servidor (R11, C4, D39): una consulta por columna con vista=todas_sin_soporte (R5), los estados de
  // la columna cruzados con el filtro de la pantalla (estadosDeColumnaLista; sin ninguno en común, la columna queda vacía
  // sin pedir nada) y el MISMO estado (búsqueda y semáforo); porColumna = el tamaño de la tabla y limit=0 en la plegada
  // (lo hace el hook). 'atencion' en las abiertas y 'reciente' en Cancelada (D39). r1 (m10): la consulta la arma
  // consultaColumnaSC (lib/kanban-ventas.js, con su prueba).
  const tablero = useTableroKanban<FilaSC>({
    pantalla: ID_SC,
    modo: 'servidor',
    columnas: COLUMNAS_SC,
    activo: listo && modoEfectivo === 'kanban',
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaSC(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`/ventas/solicitudes?${consulta}`, { signal }));
    },
  });

  // Después de un cambio hecho en la pantalla (cancelar, reiniciar, restaurar, la Papelera): la tabla, el tablero y la
  // franja. Ninguna recarga vacía lo que se ve: los hooks conservan lo último mientras recargan (D28).
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarLista = useCallback(() => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
  }, [recargarListado, recargarTablero]);
  // B4 T8 r1 (I1): una petición más de los conteos (en la Papelera, la de EXTRA_PAPELERA; fuera de ella, la de siempre).
  const pedirConteos = useCallback(() => {
    setConteosPendientes({ antes: crudoActual.current });
    recargarListado();
  }, [recargarListado]);
  // r1 (m6, D39): después de una acción desde una tarjeta, del tablero solo su origen y su destino (no las 5 columnas),
  // más la lista (en Kanban va sin filas: las tarjetas de arriba) y la franja.
  function recargarTrasTarjeta([origen, destino]: ColumnasDeTarjeta) {
    recargarListado();
    tablero.recargar([origen, destino]);
    setRecargaFlujo((n) => n + 1);
  }

  // La Papelera (RP35, RP37): GET /ventas/solicitudes/papelera (trae como mucho 200) en modo cliente. Se pide al entrar a
  // la pestaña y con «Actualizar» (vueltaPapelera); el estado se escribe solo cuando llega la respuesta.
  const [vueltaPapelera, setVueltaPapelera] = useState(0);
  const [cargaPapelera, setCargaPapelera] = useState<CargaPapelera>(PAPELERA_SIN_CARGAR);
  useEffect(() => {
    // B4 T24 f2 r1 (m21): sin permiso (ADMIN y ASESOR) no se pide: daría un 403.
    if (!enPapelera || !accesoTablero.mover) return;
    const control = new AbortController();
    apiFetch('/ventas/solicitudes/papelera', { signal: control.signal })
      .then((d: unknown) => setCargaPapelera({ vuelta: vueltaPapelera, filas: normalizarRespuesta(d).filas as FilaPapelera[], error: '' }))
      .catch((err: unknown) => {
        if (control.signal.aborted) return;
        // N4: un fallo ya no se disfraza de «papelera vacía»: se avisa y la lista (si había una) se conserva.
        const msg = (err instanceof Error && err.message) || 'error desconocido';
        setCargaPapelera((c) => ({ vuelta: vueltaPapelera, filas: c.filas, error: msg }));
        avisar(textoDeError('No se pudo cargar la papelera: ' + msg), { tono: 'error' });
      });
    return () => control.abort();
  }, [enPapelera, accesoTablero.mover, vueltaPapelera, avisar]);
  const recargarPapelera = useCallback(() => setVueltaPapelera((n) => n + 1), []);
  // B4 T24 f2 r1 (m21): una «papelera» guardada en la sesión, sin permiso, cae a Activas (cuando el rol ya se leyó).
  const vistaPermitida = vistaSolicitudesPermitida(estado.vista, { papelera: accesoTablero.mover, rolLeido: accesoTablero.listo });
  useEffect(() => {
    if (listo && vistaPermitida && vistaPermitida !== estado.vista) despachar(accionPestana(estado, vistaPermitida, opcionesEstadosSolicitudes));
  }, [listo, vistaPermitida, estado, despachar]);
  const papelera = cargaPapelera.filas ?? SIN_FILAS_PAPELERA;
  const papeleraCargada = cargaPapelera.filas !== null;
  const papeleraError = cargaPapelera.error;
  const cargandoPapelera = enPapelera && cargaPapelera.vuelta !== vueltaPapelera;
  // Sin ninguna lista cargada, el error va en la tabla (con «Reintentar»); con una, en el aviso de arriba.
  const errorPapeleraTabla = papeleraError && !papeleraCargada ? papeleraError : null;
  const papeleraCliente = useListadoCliente<FilaPapelera>(cargaPapelera.filas, estado, ACCESORES_PAPELERA);

  // RP36: las filas cargadas (la página de la tabla y las tarjetas del tablero), para el modal del motivo y la barra.
  const filasCargadas = useMemo(
    () => [...listado.filas, ...Object.values(tablero.datos).flatMap((d) => d.items)],
    [listado.filas, tablero.datos],
  );
  const filaPorId = useCallback((id: number) => filasCargadas.find((s) => s.id === id), [filasCargadas]);

  // D40 y D41: un solo usePreferenciasTabla por id (la tabla y «Ajustar tabla» comparten su resultado y el ref del
  // ancho). La lista y la Papelera son dos tablas con su id. En Canceladas, la columna Vencimiento dice el motivo.
  const columnasTabla = estado.vista === 'canceladas' ? COLUMNAS_CANCELADAS : COLUMNAS_TABLA_SC;
  const prefs = usePreferenciasTabla(ID_SC, columnasTabla);
  const prefsPapelera = usePreferenciasTabla(ID_PAPELERA, COLUMNAS_PAPELERA);
  const anchoTablaRef = useRef<number | null>(null);
  const anchoPapeleraRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa: el conmutador sigue a la vista y el tablero no queda tapado.
  useEffect(() => { if (modoEfectivo === 'kanban') salir(); }, [modoEfectivo, salir]);
  // Las pestañas y las tarjetas salen de la misma llamada: un solo estado (C13; barras grises mientras cargan, «—» con error).
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);
  const estadoKpis = estadoConteos;

  const searchParams = useSearchParams();
  const router = useRouter();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id=:
  // redirige a la pagina canonica en vez de duplicar la vista aqui.
  useEffect(()=>{
    const idParam = searchParams?.get('id');
    if(idParam){
      const numId = Number(idParam);
      if(!isNaN(numId)) router.replace(`/dashboard/ventas/solicitud/${numId}`);
    }
  },[searchParams, router]);
  // Auto-open create form if navigated here with ?new=1 (from "Nueva Solicitud" button on Ventas hub). U9: el parametro
  // se consume (la URL queda limpia): al recargar con F5 el formulario ya no se abre solo. Next integra
  // history.replaceState con useSearchParams; el efecto corre otra vez con new=null y no hace nada, sin remontar la
  // pagina, asi que showCreate sigue en true.
  useEffect(()=>{
    if(searchParams?.get('new')){
      setShowCreate(true);
      window.history.replaceState(null,'','/dashboard/ventas/solicitud');
    }
  },[searchParams]);

  function cerrarCancelacion() {
    setShowCancelModal(false);setCancelTarget([]);setCancelRazon('');setCancelErrores([]);setCancelOmitidas([]);setCancelColumnas(null);
  }

  // N4: toda cancelacion de SC pasa por POST /cancelar (pide el motivo y el servidor revisa que no tenga cotizaciones
  // ni pedidos activos). Una por una: las que fallan se muestran con el detalle del servidor y la ventana queda abierta
  // solo con ellas, para leerlas; las que se cancelaron salen de la lista.
  async function cancelWithReason() {
    const razon=cancelRazon.trim();
    if(cancelTarget.length===0||!motivoValido(cancelRazon)){showToast(`El motivo es obligatorio (mínimo ${MINIMO_MOTIVO} caracteres)`,'err');return;}
    setCancelling(true);
    setCancelErrores([]);
    const resultados:{numero:string;ok:boolean;error?:string}[]=[];
    const canceladas:number[]=[];
    const fallidas:number[]=[];
    for(const id of cancelTarget){
      const numero=filaPorId(id)?.numero||`#${id}`;
      try{
        await apiFetch(`/ventas/solicitudes/${id}/cancelar`,{method:'POST',body:JSON.stringify({razon,user_name:currentUser})});
        resultados.push({numero,ok:true});
        canceladas.push(id);
      }catch(err:any){
        // Por fila y legible (sin conexión, 409 del servidor tal cual): el resumen del aviso no pasa por textoDeError.
        resultados.push({numero,ok:false,error:textoDeError(err)});
        fallidas.push(id);
      }
    }
    const resumen=resumenCancelacionSolicitudes(resultados,cancelOmitidas);
    showToast(resumen.mensaje,resumen.tipo);
    if(fallidas.length===0) cerrarCancelacion();
    // Las omitidas ya se informaron en el toast: al reintentar solo quedan las que fallaron.
    else{setCancelTarget(fallidas);setCancelOmitidas([]);setCancelErrores(resumen.fallidas.map(f=>f.texto));}
    // Las canceladas y las omitidas dejan de estar seleccionadas; las que fallaron siguen marcadas.
    setChecked(prev=>{const n=new Set(prev);canceladas.forEach(id=>n.delete(id));cancelOmitidas.forEach(o=>n.delete(o.id));return n;});
    // B4 T8: la tabla, el tablero y la franja; r1 (m6, D39): desde una tarjeta, del tablero solo su origen y su destino.
    if(cancelColumnas) recargarTrasTarjeta(cancelColumnas);
    else recargarLista();
    setCancelling(false);
  }

  // T7 ronda 1: el motivo de una fila de la Papelera con la misma regla que Canceladas. B4 T8: GET /papelera ya trae la
  // razón y las notas de cada fila (T11 calidad, A3), así que el respaldo de la lista cargada (las 200 de antes) ya no
  // aporta nada: es motivoDeCancelacion de la fila, la misma de la columna Motivo.
  const motivoEnPapelera=(sc:any)=>getRazonCancelacion(sc);

  // H34: recibe la fila para mostrar número, cliente y motivo en la confirmación; el 409 del servidor (tiene
  // documentos vinculados) sale en el aviso de error.
  async function eliminarPermanente(sc:any) {
    if(!(await confirmar({
      titulo: `Eliminar ${sc.numero} definitivamente`,
      mensaje: 'La solicitud se borra para siempre y no se puede recuperar.',
      efectos: [`Cliente: ${sc.customer_name||'—'}`, `Motivo de la cancelación: ${motivoEnPapelera(sc)||'—'}`],
      textoConfirmar: 'Eliminar definitivamente',
      peligro: true,
    }))) return;
    try{
      await apiFetch(`/ventas/solicitudes/${sc.id}/permanente`,{method:'DELETE'});
      avisar(`${sc.numero} eliminada definitivamente`);
      // r2 (p4): la de la Papelera también cuenta en Canceladas y en las tarjetas: pedirConteos() las pone al día.
      recargarPapelera();
      pedirConteos();
    }catch(err:any){avisarError(err,`No se pudo eliminar ${sc.numero}`);}
  }

  // B2.1 D2 (decisión del usuario): abrir la Papelera ya no borra nada; el administrador la vacía con este botón. POST
  // /ventas/papelera/purgar borra las canceladas hace más de 30 días y sin documentos (con su renglón PURGED y la sesión
  // como autor) y responde {purgadas, numeros}. La confirmación dice cuántas vencidas hay en la lista (el servidor
  // decide: la lista trae como mucho 200). Un error (403, o 500 sin borrar nada) sale como aviso.
  async function vaciarVencidas() {
    if(vaciandoPapelera) return;
    if(!(await confirmar(confirmacionVaciarVencidas(contarVencidasEnPapelera(papelera))))) return;
    setVaciandoPapelera(true);
    try{
      const d=await apiFetch('/ventas/papelera/purgar',{method:'POST'});
      const purgadas=(d?.data??d)?.purgadas;
      avisar(textoPapeleraVaciada(purgadas),{tono:purgadas>0?'ok':'info'});
      // B4 T8: la Papelera y también la lista (las pestañas, las tarjetas y la franja ya no cuentan las purgadas). r1 (I1):
      // dentro de la Papelera la lista va apagada (RP35): pedirConteos() trae otra vez sus conteos y su resumen.
      recargarPapelera();
      recargarLista();
      pedirConteos();
    }catch(err){
      avisarError(err,'No se pudo vaciar la Papelera');
      // Sin respuesta del servidor (la red se cortó) pudo vaciarse igual: la lista recargada dice qué quedó. r2 (p4): y los
      // conteos de las pestañas y las tarjetas.
      if(recargarTrasError(err)) { recargarPapelera(); pedirConteos(); }
    }
    setVaciandoPapelera(false);
  }

  // U18+H33: el servidor responde {id, numero, estado, estado_label, mensaje} ('… restaurada: queda Asignada porque …')
  // y el aviso trae 'Ver solicitud'. Un 409 (no está cancelada, o tiene documentos activos: R34) sale con su mensaje y la
  // lista no cambia.
  async function restaurarSC(id:number) {
    try{
      const d=await apiFetch(`/ventas/solicitudes/${id}/restaurar`,{method:'POST'});
      const r=d?.data??d;
      avisar(r?.mensaje||`Solicitud restaurada: queda ${infoEstadoSolicitud(r?.estado).label}`,
        {tono:'ok',accion:{texto:'Ver solicitud',href:`/dashboard/ventas/solicitud/${id}`}});
      recargarPapelera();
      recargarLista();
      pedirConteos();
    }catch(err:any){avisarError(err,'No se pudo restaurar la solicitud');}
  }

  // U15 (R30): 'Reiniciar' es el único cambio de estado a mano (PATCH {estado:'BORRADOR'}: vuelve a Nueva, o a Asignada
  // si tiene asesor). Se confirma antes; cancelar va por cancelWithReason. El 409 de R10 (cotización o pedido activos)
  // sale con su mensaje. B4 T8 (RP17 y el cruce C4): el texto de la confirmación es el de la librería
  // (confirmacionReiniciarSolicitud, el mismo del detalle y del tablero). Lo usan el menú ⋯ de la fila y el tablero.
  async function reiniciarSC(sc:any, columnas?:ColumnasDeTarjeta) {
    if(!(await confirmar(confirmacionReiniciarSolicitud(sc)))) return;
    setSaving(true);
    try{
      const r=await apiFetch(`/ventas/solicitudes/${sc.id}`,{method:'PATCH',body:JSON.stringify({estado:'BORRADOR',updated_by:currentUser})});
      // Se dice lo que devolvió el servidor (con asesor queda Asignada), no lo que se pidió.
      const nueva=r?.data;
      avisar(`${sc.numero} reiniciada: queda ${infoEstadoSolicitud(nueva?.estado??(sc.advisor_user_id?'ASIGNADA':'BORRADOR')).label}`);
    }catch(err:any){avisarError(err,`No se pudo reiniciar ${sc.numero}`);}
    // B4 T8: la lista, el tablero (la tarjeta pasa a su columna) y la franja, también si el servidor la rechazó. r1 (m6,
    // D39): desde una tarjeta, del tablero solo su origen y su destino.
    if(columnas) recargarTrasTarjeta(columnas);
    else recargarLista();
    setSaving(false);
  }

  function deleteItem(scId:number, columnas:ColumnasDeTarjeta|null=null) {
    setCancelTarget([scId]);setCancelRazon('');setCancelErrores([]);setCancelOmitidas([]);setCancelColumnas(columnas);setShowCancelModal(true);
  }

  // U15: la barra masiva ya no cambia estados (ninguno se pone a mano): solo cancela las marcadas.
  function bulkCancelar() {
    // N4: ya no hace PATCH: abre el modal del motivo y las cancela con POST /cancelar. Las que ya estan canceladas (ya
    // estan en la Papelera) y las de Soporte Tecnico (su ciclo es estado_soporte: cancelarlas las mandaria a purga en
    // 30 dias y se perderia el ticket) no se envian al servidor: se informan como omitidas.
    const {cancelables,omitidas}=repartirCancelacionSolicitudes(Array.from(checked).map(id=>filaPorId(id)||{id}));
    if(cancelables.length===0){
      showToast(resumenCancelacionSolicitudes([],omitidas).mensaje,'err');
      setChecked(new Set());
      return;
    }
    setCancelTarget(cancelables.map(s=>s.id));setCancelOmitidas(omitidas);setCancelRazon('');setCancelErrores([]);setShowCancelModal(true);
  }

  async function createSolicitud(e:React.FormEvent) {
    e.preventDefault();
    // H11: sin cliente solo se avisa (antes se abría el alta DETRÁS de esta ventana y no se veía nada); el selector sigue
    // ofreciendo 'Agregar cliente'.
    if(!selectedCust){
      avisar('Elige un cliente o agrega uno nuevo: no se puede crear la solicitud sin cliente.',{tono:'error'});
      return;
    }
    setSaving(true);
    try{
      const {productos:prodsToSend,notasConExtras:extraNotas}=tipoDetalleRef.current?.getExtras()??{productos:[],notasConExtras:form.notas};
      const scData = await apiFetch('/ventas/solicitudes',{method:'POST',body:JSON.stringify({
        ...form,notas:extraNotas,
        customer_id:selectedCust?.id||null,
        customer_name:nombreCliente(selectedCust),
        customer_phone:selectedCust?.phone||'',customer_email:selectedCust?.email||'',customer_address:selectedCust?.address||'',
        productos:prodsToSend,created_by:currentUser,
        // advisor_user_id / asignado_a_user_id son Integer/nullable en el backend: nunca enviar '' (rompe el INSERT)
        advisor_user_id:form.advisor_user_id||null,
        asignado_a_user_id:form.asignado_a_user_id||null,
      })});
      // POST /ventas/solicitudes responde {data: <la SC>} con su id y numero.
      const nueva=scData?.data;
      // Auto-create CRM Lead silently (only if customer_id exists; Soporte Tecnico
      // tiene su propio flujo y no debe generar una tarjeta en el pipeline de ventas)
      if(selectedCust?.id && form.tipo_solicitud!=='Soporte Tecnico'){
        apiFetch('/crm/leads',{method:'POST',body:JSON.stringify({
          customer_id:selectedCust.id,
          sc_id:nueva?.id,
          advisor_name:form.advisor_name||currentUser,
          solicitud_tipo:form.tipo_solicitud||'Cotizacion de Producto',
          // H14: el numero va en la descripcion (que es lo que muestra la tarjeta del CRM): viene en scData.data.
          description:`SC creada: ${nueva?.numero||''} - ${form.notas||''}`.substring(0,500),
          lead_source:'SC',
          lead_product_name:prodsToSend[0]?.product_name||'',
          lead_qty:prodsToSend[0]?.qty||1,
        })}).catch(()=>{}); // Silent â€” CRM lead is best-effort
      }
      // U9: crear la SC lleva directo a ella. El return salta setSaving(false) a proposito: el boton "Crear" queda
      // bloqueado hasta que cambia la pagina y no se puede crear dos veces. Al volver a la lista, se recarga al montar
      // y la SC aparece arriba (orden created_at desc). El lead de arriba sigue en segundo plano (sin await).
      if(nueva?.id){
        const href=`/dashboard/ventas/solicitud/${nueva.id}`;
        // Revisión final (F9): si el usuario ya salió de la lista mientras se guardaba, no se lo lleva a la SC nueva.
        if(!vivo.current){
          avisar(nueva.numero?`Solicitud ${nueva.numero} creada`:'Solicitud creada',{accion:{texto:'Ver solicitud',href}});
          return;
        }
        router.push(href);
        return;
      }
      // Respaldo si la respuesta no trae id: se queda en la lista como antes.
      showToast('Solicitud creada');
      setShowCreate(false);resetCreateForm();recargarLista();
    }catch(err:any){showToast('Error: '+err.message,'err');}
    setSaving(false);
  }

  function resetCreateForm() {
    // El buscador del selector se reinicia solo: se desmonta al cerrar la ventana.
    setSelectedCust(null);
    tipoDetalleRef.current?.reset();
    setForm({advisor_name:currentUser,advisor_user_id:'',tipo_solicitud:'Cotizacion de Producto',modalidad_pago:'Contado',notas:'',dias_vencimiento:5,tipo_problema:'',descripcion_problema:'',urgencia:'',evidencia_descripcion:'',asignado_a_user_id:''});
  }

  // ── B4 T8, bloque 2: pestañas y búsqueda (TABLA-listas-ventas punto 5; R5, RP26, RP35, D40, D41) ──
  const pestanas = pestanasDeLaLista(listado.conteos as ConteosSC | null, { papelera: accesoTablero.mover && listo });
  // La barra recibe el modo que se ve: en Soporte y la Papelera es Lista (no tienen tablero), así «Ajustar tabla» está
  // aunque lo guardado sea Kanban. El estado de la pantalla no cambia (useEstadoTabla sigue siendo su único dueño).
  const estadoBarra = useMemo(() => (estado.modo === modoEfectivo ? estado : { ...estado, modo: modoEfectivo }), [estado, modoEfectivo]);
  // «N resultados» es el de la tabla que se ve; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = modoEfectivo === 'kanban' ? {}
    : enPapelera ? {
      total: papeleraCliente.total,
      estadoTotal: estadoDelTotal({
        total: papeleraCliente.total, cargando: !papeleraCargada && !papeleraError, recargando: cargandoPapelera && papeleraCargada,
        error: errorPapeleraTabla,
      }),
    } : {
      // r1 (m5): sin la página de la vista todavía (llegó la de la Papelera o la de Kanban), el total en 'cargando'.
      total: sinPagina ? null : listado.total,
      estadoTotal: estadoDelTotal({
        total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
      }),
    };
  // r1 (m2): el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o
  // las de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_SC : opcionesEstadosSolicitudes, COLUMNAS_SC));
    } else despachar(accion);
  }, [estado, despachar]);
  // r1 (m8): el «vacío» de la lista solo cambia con la búsqueda.
  const vacioLista = useMemo(() => (
    <div>
      <p className="font-semibold text-slate-600">{estado.q.trim() ? `Sin resultados para «${estado.q.trim()}»` : 'No hay solicitudes en esta vista'}</p>
      <p className="mt-1 text-xs text-slate-400">Ajusta la búsqueda o el filtro, o crea una nueva solicitud.</p>
    </div>
  ), [estado.q]);

  // ── B4 T8, bloque 3: la tabla (las columnas son constantes del módulo; en Canceladas, Vencimiento dice el motivo) ──
  // N4: la selección es la de la página (TablaEstandar la limpia al cambiar de página, pestaña, búsqueda, filtro u orden).
  const seleccion = useMemo(() => Array.from(checked), [checked]);
  const alSeleccionar = useCallback((claves: (string | number)[]) => setChecked(new Set(claves.map(Number))), []);
  const abrirSolicitud = useCallback((sc: { id: number }) => router.push(`/dashboard/ventas/solicitud/${sc.id}`), [router]);
  // Las celdas (constantes, D40 y D41) piden a la pantalla lo suyo por AccionesLista. El valor del contexto es estable
  // (las celdas no se repintan con cada cambio de la página) y llama siempre a los manejadores del último render: la ref
  // se pone al día después de pintar y solo se lee en un clic.
  const manejadores = useRef<Omit<AccionesFilaSC, 'mover' | 'rol'> | null>(null);
  useLayoutEffect(() => {
    manejadores.current = {
      abrir: abrirSolicitud,
      cancelar: (sc) => deleteItem(sc.id),
      aPapelera: (sc) => { void enviarAPapelera(sc.id); },
      reiniciar: (sc) => { void reiniciarSC(sc); },
      restaurar: (sc) => { void restaurarSC(sc.id); },
      eliminar: (sc) => { void eliminarPermanente(sc); },
    };
  });
  const accionesFila = useMemo<AccionesFilaSC>(() => ({
    abrir: (sc) => manejadores.current?.abrir(sc),
    cancelar: (sc) => manejadores.current?.cancelar(sc),
    aPapelera: (sc) => manejadores.current?.aPapelera(sc),
    reiniciar: (sc) => manejadores.current?.reiniciar(sc),
    restaurar: (sc) => manejadores.current?.restaurar(sc),
    eliminar: (sc) => manejadores.current?.eliminar(sc),
    mover: accesoTablero.mover,
    rol,
  }), [accesoTablero.mover, rol]);

  // ── B4 T8, bloque 4: el tablero (KANBAN-ventas-listas punto 7; C15, R11; RP16, RP17, D11, D39) ──
  // reglaSoltarSC sin puedeEnviar (D11): soltar para enviar queda bloqueado con «Ábrela para enviar.» y el enlace a la
  // solicitud; no se arma otro ChannelModal ni otro POST. Las acciones que quedan las resuelve la pantalla:
  //  - cancelar: el modal del motivo de N4 (cancelWithReason, POST /cancelar) con cancelTarget = [id];
  //  - reiniciar: confirmacionReiniciarSolicitud (RP17) y PATCH {estado: 'BORRADOR'} (reiniciarSC; el 409 de R10 sale como
  //    aviso). Las dos recargan la lista y la franja al terminar y, r1 (m6, D39), del tablero solo el origen y el destino.
  function accionDesdeTablero(sc: FilaSC, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion === 'cancelar') deleteItem(sc.id, [origen, destino]);
    else if (resultado.accion === 'reiniciar') void reiniciarSC(sc, [origen, destino]);
  }

  // ── B4 T8, bloque 5: las tarjetas (KPI-ventas punto 7; R12, RP19) ──
  const tarjetas = tarjetasSolicitudes(listado.resumen);
  // En Lista son las pestañas (D41: accionPestana, como un clic en la pestaña); tocar la activa vuelve a Activas (la de
  // siempre, alternarPaso). En Kanban abren esa pestaña en Lista: el tablero muestra todas.
  const vistaActiva = modoEfectivo === 'lista' ? estado.vista : null;
  const elegirVista = (vista: string) => {
    const siguiente = modoEfectivo === 'lista' ? (alternarPaso(estado.vista, vista) ?? INICIAL_SC.vista) : vista;
    despachar(accionPestana(estado, siguiente, opcionesEstadosSolicitudes));
    if (modoEfectivo === 'kanban') despachar({ tipo: 'modo', valor: 'lista' });
  };

  // ── B4 T8, bloque 6: la franja del flujo (FLUJO-ventas-pantallas B; R8, C3, D42) ──
  const pasosFlujo = useMemo(() => pasosDeLista(flujo.datos, 'SC'), [flujo.datos]);
  // B4.1 (P4): «Con atraso (N)» cuenta la pestaña abierta (atrasados_por_vista de la lista), no el paso entero del flujo; en
  // Kanban, el del tablero (todas las que no son de soporte). Las cajas de la franja siguen con /ventas/flujo.
  const atrasadosSC = atrasadosDeLaPestana(listado.crudo?.atrasados_por_vista ?? null, {
    vista: estado.vista, enKanban: modoEfectivo === 'kanban', vistaTablero: 'todas_sin_soporte', vistaInicial: INICIAL_SC.vista,
    vistasSinAtraso: VISTAS_SIN_ATRASO,
  });
  // RP19 (4): el aviso ámbar «N vencidas» lee resumen.vencidas (las activas con el vencimiento pasado).
  const vencidasResumen = (listado.resumen as ResumenSC | null)?.vencidas;
  const avisosFlujo = useMemo(() => {
    const aviso = avisoVencidas(vencidasResumen);
    return aviso ? [aviso] : undefined;
  }, [vencidasResumen]);
  const filtroSemaforo: FiltroSemaforo = estado.semaforo === 'atrasados' ? 'atrasados' : 'todos';
  // «Con atraso» pone semaforo=atrasados en el estado único (la tabla y el tablero lo mandan al servidor) y vuelve a la
  // página 1; «Ver todo» lo quita. Soporte queda fuera del semáforo (R8) y la Papelera y Canceladas (r1, m7) son de
  // canceladas: desde ellas, «Con atraso» abre Activas (VISTAS_SIN_ATRASO). r2b (p5): también en Kanban (vista
  // 'canceladas'), pero la poda es con las opciones del modo que se ve: en Kanban, las del tablero, así su filtro se
  // queda; al volver a Lista no se cae en Canceladas con atrasados y accionModo poda con las de Activas.
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    if (f !== 'todos' && VISTAS_SIN_ATRASO.includes(estado.vista ?? '')) {
      despachar(accionPestana(estado, INICIAL_SC.vista, modoEfectivo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_SC : opcionesEstadosSolicitudes));
    }
    despachar({ tipo: 'semaforo', valor: f === 'todos' ? null : f });
  };

  // «Actualizar»: la lista, el tablero, la franja y, en la Papelera, también ella.
  const actualizar = () => {
    recargarLista();
    if (enPapelera) {
      recargarPapelera();
      pedirConteos();
    }
  };
  const actualizando = listado.recargando || flujo.cargando || cargandoPapelera;

  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      {/* Sub-module nav */}
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/solicitud" color="indigo" hub={{ href: '/dashboard/ventas' }} />

      {/* B4 T8 (FLUJO-ventas-pantallas B; R8, D42, RP90): la franja del flujo reemplaza el aviso rojo de arriba y el
          pipeline oscuro. «Estás aquí» en Solicitud, con su detalle por estado; las otras cajas llevan a su lista. «Con
          atraso» es semaforo=atrasados en el servidor, con los atrasados del paso Solicitud; no hay «No resueltos» (lo cubre
          la pestaña Activas: la clave noResueltos no se escribe). El aviso ámbar «N vencidas» es resumen.vencidas. Va
          directo bajo la barra de submódulos, sin otro padding horizontal. */}
      <BannerFlujo
        titulo="Flujo comercial"
        idPreferencia={ID_SC}
        regla={textoRegla(flujo.datos?.dias_alerta)}
        semaforo={{ atrasados: atrasadosSC, filtro: filtroSemaforo, onFiltrar: alFiltrarSemaforo }}
        pasos={pasosFlujo}
        avisos={avisosFlujo}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
      />

      {/* B4 T8: el contenedor del Hub (T7). pb-24 deja libre, con la página al fondo, la esquina del botón flotante de la
          IA (GlobalAIChat: fixed bottom-6 de 56 px, 80 px en total); en la pantalla completa la reserva es el pr-20 del pie
          (D41). px-4 hasta xl: a 1024 px con el menú abierto las columnas clave caben (R26). */}
      <div className={CONTENEDOR_LISTA}>
        {/* Header */}
        <PageHeader
          icon={FileText} color="indigo"
          title="Solicitudes de Cliente"
          subtitle="Lo que te piden los clientes, antes de cotizar."
          actions={<AccionesCabecera onActualizar={actualizar} actualizando={actualizando} onNueva={accesoTablero.mover ? () => setShowCreate(true) : undefined} />} />

        {/* B4 T8 (KPI-ventas punto 7; R12, RP19): las 4 tarjetas con con_resumen de la MISMA llamada de la lista (todas las
            solicitudes, sin Soporte): mientras cargan, barras grises (nunca 0); con error, «—». Las tres primeras son sus
            pestañas (accionPestana; tocar la activa vuelve a Activas); el total no tiene una vista. */}
        <FranjaKpis estado={estadoKpis} titulo="Solicitudes">
          <TarjetaKpi kpi="sc_activas" valor={tarjetas?.activas.valor ?? null} ayuda={tarjetas?.activas.ayuda}
            tono={tarjetas?.activas.tono} activo={vistaActiva === 'activas'} onClick={() => elegirVista('activas')} />
          <TarjetaKpi kpi="sc_confirmadas" valor={tarjetas?.confirmadas.valor ?? null} ayuda={tarjetas?.confirmadas.ayuda}
            activo={vistaActiva === 'confirmadas'} onClick={() => elegirVista('confirmadas')} />
          <TarjetaKpi kpi="sc_canceladas" valor={tarjetas?.canceladas.valor ?? null} ayuda={tarjetas?.canceladas.ayuda}
            activo={vistaActiva === 'canceladas'} onClick={() => elegirVista('canceladas')} />
          <TarjetaKpi kpi="sc_total" valor={tarjetas?.total.valor ?? null} ayuda={tarjetas?.total.ayuda} />
        </FranjaKpis>

        {/* B4 T8 (TABLA-listas-ventas punto 5, KANBAN-ventas-listas punto 7): la barra y la tabla estándar, o la Papelera
            (otra tabla, en modo cliente), o el tablero en modo servidor, con el MISMO estado (búsqueda, estados y semáforo). */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesLista.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              <BarraTabla
                estado={estadoBarra}
                onEstado={alCambiarBarra}
                pestanas={modoEfectivo === 'lista' ? pestanas : undefined}
                estadoConteos={estadoConteos}
                placeholder="Buscar por número, cliente, asesor o producto…"
                opcionesEstados={modoEfectivo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_SC : opcionesEstadosSolicitudes}
                ajustes={enPapelera
                  ? { columnas: COLUMNAS_PAPELERA, preferencias: prefsPapelera, anchoRef: anchoPapeleraRef }
                  : { columnas: columnasTabla, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible={kanbanDisponible}
                pantallaCompleta={modoEfectivo === 'lista' ? { completa, alternar } : undefined}
                {...totalDeLaBarra}
              />
              {enPapelera ? (
                <>
                  {/* B2.1 D2: la Papelera ya no se borra al abrirla; un administrador vacía las vencidas (solo él ve el
                      botón). B3 T18 (RP7): desde B3-T10 también la revisión automática (purga_papelera). B2.1 T4 r1: el
                      título solo; la regla va debajo, sin mayúsculas, con el subtítulo del design-system. */}
                  <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-500 uppercase">Solicitudes en Papelera</p>
                      <p className={PAGE_HEADER.subtitle}>Las solicitudes canceladas se pueden eliminar definitivamente después de 30 días si no se restauran, salvo las que tienen documentos vinculados; un administrador vacía las vencidas, y la revisión automática también.</p>
                    </div>
                    <div className="flex items-center gap-3 shrink-0">
                      {esAdministrador(rol)&&<button onClick={vaciarVencidas} disabled={vaciandoPapelera} className="bg-red-50 hover:bg-red-100 text-red-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-red-200 flex items-center gap-1 disabled:opacity-60 disabled:cursor-not-allowed"><Trash2 size={11} className={vaciandoPapelera?'animate-pulse':''}/>Vaciar las vencidas</button>}
                      <button onClick={recargarPapelera} className="text-xs text-slate-500 hover:text-slate-700 font-bold flex items-center gap-1"><RefreshCw size={11} className={cargandoPapelera?'animate-spin':''}/> Actualizar</button>
                    </div>
                  </div>
                  {/* N4: un fallo no se disfraza de «papelera vacía»: se avisa y la última lista cargada se conserva. Sin
                      ninguna, la tabla muestra el error con «Reintentar». */}
                  {papeleraError && papelera.length > 0 && (
                    <div className="mx-4 mt-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl px-4 py-3 text-xs font-bold flex items-start gap-2">
                      <AlertCircle size={14} className="shrink-0 mt-0.5"/>
                      <span>No se pudo cargar la papelera: {papeleraError} (se muestra la última lista cargada).</span>
                    </div>
                  )}
                  {/* RP37: la Papelera como tabla (modo cliente: GET /ventas/solicitudes/papelera trae como mucho 200). */}
                  <TablaEstandar
                    id={ID_PAPELERA}
                    modo="cliente"
                    columnas={COLUMNAS_PAPELERA}
                    preferencias={prefsPapelera}
                    anchoRef={anchoPapeleraRef}
                    estado={estado}
                    onEstado={despachar}
                    filas={papeleraCliente.filas}
                    total={papeleraCliente.total}
                    cargando={!listo || papeleraCliente.cargandoInicial && !papeleraError}
                    recargando={cargandoPapelera && papeleraCargada}
                    error={errorPapeleraTabla}
                    onReintentar={recargarPapelera}
                    onFila={abrirSolicitud}
                    vacio={VACIO_PAPELERA}
                    etiqueta="Papelera de solicitudes"
                  />
                </>
              ) : modoEfectivo === 'lista' ? (
                <TablaEstandar
                  id={ID_SC}
                  modo="servidor"
                  columnas={columnasTabla}
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
                  onFila={abrirSolicitud}
                  claseFila={claseDeFila}
                  // B4 T24 f2 (m8 de la revisión r0 de f1): sin permiso de cancelar, sin casillas (la barra masiva tampoco sale).
                  seleccion={accesoTablero.mover ? seleccion : undefined}
                  onSeleccion={accesoTablero.mover ? alSeleccionar : undefined}
                  vacio={vacioLista}
                  etiqueta="Solicitudes de cliente"
                />
              ) : null}
            </section>
          </AccionesLista.Provider>
          {modoEfectivo === 'kanban' && (
            // B4 T24 r2 (m2, m10): mientras se lee el rol, el esqueleto (sin acciones) en lugar del tablero.
            !accesoTablero.listo ? <EsqueletoTablero /> : <TableroKanban
              tablero={tablero}
              regla={reglaSoltarSC}
              tarjetaDe={tarjetaDeSC}
              onAbrir={abrirSolicitud}
              onAccion={accionDesdeTablero}
              soloLectura={accesoTablero.soloLectura}
              color="indigo"
            />
          )}
        </div>
      </div>

      {/* N4 (barra masiva): solo cancela las marcadas (U15: ningún estado se pone a mano). B4 T8: la selección es de la
          página de la tabla («Seleccionar todo» marca la página), así que solo en Lista y fuera de la Papelera; va abajo y
          fija, como la del Hub, para no correr la lista al marcar una fila. */}
      {checked.size>0 && modoEfectivo === 'lista' && !enPapelera && accesoTablero.mover && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-indigo-600 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-4 z-40">
          <span className="font-bold text-sm">{checked.size} seleccionada(s)</span>
          <div className="flex gap-2">
            {/* U15: sin botones 'Estado: …' (ningún estado se pone a mano). */}
            <button onClick={bulkCancelar} className="bg-rose-600 hover:bg-rose-700 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><XCircle size={12}/>Cancelar seleccionadas</button>
            <button onClick={()=>setChecked(new Set())} className="bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1"><X size={12}/>Limpiar</button>
          </div>
        </div>
      )}

      {/* MODAL: MOTIVO DE CANCELACIÓN (N4: una o varias solicitudes; el servidor revisa que no tengan documentos activos) */}
      {showCancelModal&&(
        <Modal cierreExterno={false} title={cancelTarget.length>1?`Cancelar ${cancelTarget.length} solicitudes`:'Cancelar Solicitud'} subtitle="La solicitud pasa a la Papelera. No se puede cancelar si tiene una cotización o un pedido de venta activos." icon={Trash2} color="red" maxWidth="md"
          // Mientras se cancela, la X y el fondo no cierran la ventana (igual que "No, mantener"): las fallidas y el
          // detalle del servidor siempre llegan a una ventana abierta; bloquearCierre deja la X deshabilitada a la vista.
          onClose={()=>{if(!cancelling) cerrarCancelacion();}} bloquearCierre={cancelling}
          footer={(
            <>
              <Button variant="secondary" disabled={cancelling} onClick={cerrarCancelacion}>No, mantener</Button>
              <Button variant="danger" icon={Trash2} loading={cancelling} disabled={!motivoValido(cancelRazon)} onClick={cancelWithReason}>{cancelTarget.length>1?'Cancelar solicitudes':'Cancelar SC'}</Button>
            </>
          )}>
          <div>
            {(cancelTarget.length>1||cancelOmitidas.length>0)&&<p className="text-xs font-bold text-slate-500 mb-3">{cancelTarget.map(id=>filaPorId(id)?.numero||`#${id}`).join(', ')}</p>}
            {cancelOmitidas.length>0&&(
              <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2 mb-3">
                No se enviarán: {cancelOmitidas.map(o=>`${o.numero} ${o.motivo}`).join('; ')}.
              </p>
            )}
            <label htmlFor={idMotivo} className="text-xs font-black text-slate-500 uppercase mb-2 block">Motivo de la cancelación *</label>
            <textarea
              id={idMotivo}
              value={cancelRazon}
              onChange={e=>setCancelRazon(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="Describe el motivo de la cancelación..."
              aria-describedby={motivoValido(cancelRazon) ? undefined : idAyudaMotivo}
              className={`w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:border-red-300 ${FOCOS.red}`}
              autoFocus
            />
            {!motivoValido(cancelRazon)&&<p id={idAyudaMotivo} className="text-xs text-red-500 mt-1">El motivo es obligatorio. Mínimo {MINIMO_MOTIVO} caracteres (llevas {largoDelMotivo(cancelRazon)}).</p>}
            {cancelErrores.length>0&&(
              <div className="mt-3 bg-rose-50 border border-rose-200 rounded-xl p-3 space-y-1.5">
                <p className="text-xs font-black text-rose-700">No se pudo cancelar:</p>
                {cancelErrores.map((t,i)=><p key={i} className="text-xs text-rose-700">{t}</p>)}
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* CREATE MODAL */}
      {/* B4 T24 f2 r1 (m19): el formulario solo para quien crea (también con ?new=1). */}
      {showCreate && accesoTablero.mover && (
        <Modal cierreExterno={false} title="Nueva Solicitud de Cliente" subtitle="El número de la solicitud se asigna al crearla." icon={Plus} color="indigo" maxWidth="3xl"
          onClose={()=>{setShowCreate(false);resetCreateForm();}}
          footer={(
            <>
              <Button variant="secondary" onClick={()=>{setShowCreate(false);resetCreateForm();}}>Cancelar</Button>
              <Button type="submit" form="sc-create-form" color="indigo" icon={Plus} loading={saving}>Crear Solicitud</Button>
            </>
          )}>
          <form id="sc-create-form" onSubmit={createSolicitud} className="space-y-5">
                {/* Cliente */}
                <div>
                  <label className="text-xs font-black text-slate-500 uppercase mb-2 block">Cliente *</label>
                  {/* H11: buscar o dar de alta (encima de esta ventana, sin perder lo escrito); con cliente, solo su tarjeta. */}
                  <SelectorClienteSC cliente={selectedCust} onCliente={(c, info)=>{
                    setSelectedCust(c);
                    if(info?.nuevo) avisar('Cliente creado y seleccionado',{tono:'ok'});
                  }}/>
                </div>

                <SolicitudTipoYDetalle ref={tipoDetalleRef} form={form} setForm={setForm} />
          </form>
        </Modal>
      )}
    </div>
  );
}


