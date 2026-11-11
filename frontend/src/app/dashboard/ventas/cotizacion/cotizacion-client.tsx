'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useId, createContext, useContext, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
// B4 T9: se fueron Activity, Search, MoreVertical y ShieldAlert (las tarjetas, la búsqueda, el ⋮ sin acción y el aviso
// ámbar de la lista); entran BarChart3 («Ver análisis») y ShoppingBag («Ver pedido» del menú de la fila).
import {
  FileText, CheckCircle2, DollarSign,
  X, RefreshCw, AlertCircle, AlertTriangle, Plus,
  Phone, Mail,
  Calculator, Send, Trash2, Save, ArrowRight,
  MessageCircle, RotateCcw, BarChart3, ShoppingBag,
} from 'lucide-react';
import { Info } from 'lucide-react'; // B3 T17 r3: el aviso neutral de la COT vieja

import { apiFetch, API_URL } from '@/lib/api';
import {
  MARGIN_PCT_CAP, calcularCotizacion, cuerpoCompletoCalculadora, cuerpoDeGuardado,
  validaPreciosAlGuardar,
  filaNuevaCalculadora, filasInicialesCalculadora, tarifaDeSeleccion, totalesIvaCalculadora, reglaCotizacionSinIva,
  referenciaDeGuardado, errorPreciosCalculadora,
} from '@/lib/pricing';
import { formatoPesos } from '@/lib/pesos';
import { humanizarCodigo } from '@/lib/estados-pedido';
import { lineaWhatsAppCanal } from '@/lib/envio-whatsapp';
import { AYUDA_NOTA_CLIENTE, RUTA_LISTA_COTIZACIONES } from '@/lib/cambios-cliente';
import { PanelAnularConfirmacion, tituloAnulacion } from './anular-confirmacion';
import type { AnulacionConfirmacion } from './anular-confirmacion';
import { CeldaIvaLinea, TotalesCalculadoraIva, pesosOGuion } from './calculadora-iva';
import type { EnvioWhatsAppCanal } from './estado-envio-whatsapp';
import {
  METODOS_PAGO_ANTICIPO, formatoPct, porcentajeDePesos, hoyLocal, origenAnticipo, cuentaVerificacion,
  evaluarVerificacion, verificacionParaEnviar, validarAjusteAnticipo, resumenAnticipoCotizacion, montoDesdeTexto,
  resumenPropagacionPedido, anticipoDeCalculadora,
} from '@/lib/dinero-ventas';
// B4 T9: la lista ya no cuenta en el navegador (diasAlerta, pestanaCotizacion): las vistas, los conteos y el resumen son
// del servidor (T6B). Las marcas del pedido de cada fila (COT-LISTA) siguen saliendo de aquí. r1 (I1 e I2): la marca del
// pedido y «Sin precio» con la regla de la tarjeta del tablero; la Entrega est. como día de calendario. r2 (p2): el chip
// «Sin precio» es chipSinPrecio, el mismo chip (texto y tono) de la tarjeta.
import {
  pedidoVigente, tarjetasCotizaciones, marcaPedidoCotizacion, chipSinPrecio, diaDeNegocio, fechaNegocioVencida,
  fechaPorVencer, avisoSolicitudTrasRechazo,
} from '@/lib/listas-ventas';
import {
  SubNav, PageHeader, Modal, Button, ContenidoEnlace, FranjaKpis, TarjetaKpi, useEstadoKpi, MenuFila, ModalMotivo,
  TableroKanban, EsqueletoTablero, useTableroKanban, CLASE_CHIP, useAvisos,
} from '@/components/ui';
import type { ItemMenuFila } from '@/components/ui';
import {
  BarraTabla, TablaEstandar, useEstadoTabla, useListado, usePantallaCompleta, usePreferenciasTabla,
} from '@/components/tabla';
import type { ColumnaTabla, PestanaTabla } from '@/components/tabla';
import { BannerFlujo, useResumenFlujo } from '@/components/flujo';
import type { DatosFlujo, FiltroSemaforo } from '@/components/flujo';
import {
  accionModo, accionPestana, dependenciasTablero, estadoDelTotal, llegadaDeListado, normalizarRespuesta,
} from '@/lib/tabla';
import type { AccionTabla } from '@/lib/tabla';
import { alternarPaso } from '@/lib/flujo';
import { avisosCotizaciones, enlaceVerAnalisis, pasosDeLista, reservaAvisosCotizaciones, textoRegla } from '@/lib/flujo-ventas';
import {
  COLUMNAS_COT, OPCIONES_ESTADOS_TABLERO_COT, chipsDocumentoVentas, consultaColumnaCOT, estadoDeTarjeta,
  opcionesEstadosCotizaciones, reglaSoltarCotizacion, tarjetaCotizacion,
} from '@/lib/kanban-ventas';
import { ESTADOS_COTIZACION } from '@/lib/estados-cotizacion';
import { fechaCorta, fechaSolo } from '@/lib/fechas-colombia';
import { enlaceDocumento } from '@/lib/analisis';
import { cambiarConRegla, recargarTrasError, textoDeError } from '@/lib/avisos';
import { FOCOS, RESERVA_BOTON_IA, TABLE } from '@/lib/design-system';
import { accesoTableroVentas } from '@/lib/roles';
import { useRolActual } from '@/components/ui/useRolActual';
import { VEN_NAV } from '../ven-nav';
import { getUsuarioActual } from '../flujo';

// B4 T9 (KANBAN-ventas-listas punto 3, RP4): ESTADOS conserva su export y su molde hex {label, color, bg, border} (lo
// importan ventas/page.tsx, solicitud-client.tsx, solicitud/[id] y cotizacion/[id]), pero la etiqueta es la ÚNICA de
// estados-cotizacion.js (ESTADOS_COTIZACION, espejo de ETIQUETAS_ESTADO['COT']): «Esp. confirmación» pasa a «Esperando
// confirmación del cliente». Los colores son los hex de siempre; un código de la tabla sin hex va en gris.
const HEX_ESTADOS_COT: Record<string, { color: string; bg: string; border: string }> = {
  BORRADOR:              { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ENVIADA:               { color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  PENDIENTE_CONFIRMACION:{ color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMADA:            { color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  RECHAZADA:             { color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  VENCIDA:               { color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};
const GRIS_ESTADO_COT = { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' };
export const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = Object.fromEntries(
  Object.entries(ESTADOS_COTIZACION).map(([codigo, info]) => [codigo, { label: info.label, ...(HEX_ESTADOS_COT[codigo] ?? GRIS_ESTADO_COT) }]),
);

// Mapa de estados propio de Cotizacion (rico, varios estados reales del negocio) --
// se mantiene como pastilla a medida en vez del Badge generico de tono semantico,
// pero con la misma forma (rounded-full, border, text-xs font-bold, px-2.5 py-1).
export function EstadoBadge({ estado }: { estado: string }) {
  // Un estado que no esta en ESTADOS sale humanizado ('ALGO_NUEVO' -> 'Algo nuevo'), nunca el codigo crudo.
  const cfg = ESTADOS[estado] || { label: humanizarCodigo(estado), color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' };
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border"
      style={{ backgroundColor: cfg.bg, color: cfg.color, borderColor: cfg.border }}>
      {cfg.label}
    </span>
  );
}

export const fDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
export const fTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' }) : '';
// H42: pesos enteros ('$1.062.523'); se mantiene el export porque lo importan el detalle y otros.
export const fCOP = (v: number | string | null | undefined) => formatoPesos(v);
// B4 T9: isOverdue e isExpiringSoon (la Entrega est. en rojo o en ámbar) pasaron a lib/listas-ventas.js, probadas. r1
// (I2): son fechaNegocioVencida y fechaPorVencer, que leen la entrega como día de calendario (una fecha de negocio, como
// fDate: no se corre de día); «vencen en 7 días» es resumen.vencen_pronto (RP89).

// â”€â”€ ActionIcon for activity â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function ActionDot({ action }: { action: string }) {
  const colors: Record<string, string> = {
    CREATED: '#6366f1', ESTADO_CHANGED: '#f59e0b', SENT: '#10b981',
    CONFIRMED: '#059669', REJECTED: '#ef4444', UPDATED: '#3b82f6',
  };
  return <div className="absolute left-0 top-2 w-4 h-4 rounded-full border-2 flex-shrink-0"
    style={{ backgroundColor: colors[action] || '#94a3b8', borderColor: 'white' }} />;
}

// â”€â”€ Calculator Modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Aviso de producto no encontrado en catalogo, con fallback a texto libre (es_libre)
function ProductoNoEncontradoAviso({
  nombre, onAgregarComoComentario, onCancelar
}: { nombre: string; onAgregarComoComentario: () => void; onCancelar: () => void }) {
  return (
    <div className="absolute top-full left-0 right-0 z-50 bg-amber-50 border border-amber-200 rounded-xl shadow-xl mt-1 p-3 min-w-[260px]">
      <p className="text-xs font-bold text-amber-800 flex items-center gap-1.5 mb-1">
        <AlertCircle size={12}/> Producto no encontrado en el catálogo
      </p>
      <p className="text-xs text-amber-700 mb-2">
        "{nombre}" no existe en el catálogo. Puedes agregarlo como texto libre sin bloquear la cotización.
      </p>
      <div className="flex gap-2">
        <button type="button" onClick={onCancelar}
          className="flex-1 px-2 py-1.5 rounded-lg border border-amber-300 text-amber-700 text-xs font-bold hover:bg-amber-100">
          Cancelar
        </button>
        <button type="button" onClick={onAgregarComoComentario}
          className="flex-1 px-2 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-bold hover:bg-amber-700">
          Agregar como comentario
        </button>
      </div>
      {/* Cuando exista el asistente de creacion de producto de la spec Catalogo Configurable,
          aqui se agregara un enlace directo para crear el producto en el catalogo. */}
    </div>
  );
}

// Autocompletar producto de catalogo, mismo patron de busqueda con debounce que ProductSearch en solicitud-client.tsx
function ProductoAutocomplete({
  value, esLibre, skuId, onTyping, onSelect, onFreeText
}: {
  value: string;
  esLibre?: boolean;
  skuId?: number | null;
  onTyping: (v: string) => void;
  onSelect: (p: any) => void;
  onFreeText: (nombre: string) => void;
}) {
  const [results, setResults] = useState<any[]>([]);
  const [open, setOpen] = useState(false);
  const [showAviso, setShowAviso] = useState(false);
  const [pending, setPending] = useState('');
  const timer = useRef<any>(null);

  function handle(v: string) {
    onTyping(v);
    setShowAviso(false); setOpen(false);
    if (timer.current) clearTimeout(timer.current);
    if (!v.trim()) { setResults([]); return; }
    timer.current = setTimeout(async () => {
      try {
        const d = await apiFetch(`/crm/products/search?q=${encodeURIComponent(v)}&limit=8`);
        const list = Array.isArray(d) ? d : (d?.data ?? []);
        setResults(list); setOpen(list.length > 0);
        if (list.length === 0 && v.trim().length > 2) { setPending(v); setShowAviso(true); }
      } catch { setResults([]); }
    }, 300);
  }

  return (
    <div className="relative">
      <input type="text" value={value} onChange={e => handle(e.target.value)}
        placeholder="Buscar producto en el catálogo..."
        className="w-full border-0 bg-transparent outline-none font-medium text-slate-700 placeholder-slate-300" />
      {esLibre && value && (
        <p className="text-[9px] font-black text-amber-600 uppercase tracking-wide mt-0.5">Texto libre</p>
      )}
      {!esLibre && skuId && (
        <p className="text-[9px] font-black text-emerald-600 uppercase tracking-wide mt-0.5">Vinculado a catálogo</p>
      )}
      {open && results.length > 0 && (
        <div className="absolute top-full left-0 right-0 z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 max-h-48 overflow-y-auto min-w-[240px]">
          {results.map((p: any) => (
            <button key={p.id || p.product_name} type="button"
              onClick={() => { onSelect(p); setOpen(false); }}
              className="w-full text-left px-3 py-2 hover:bg-amber-50 text-sm border-b border-slate-50 last:border-0">
              <span className="font-bold text-slate-800">{p.product_name || p.name}</span>
              {p.sku && <span className="ml-2 text-xs text-slate-400">SKU:{p.sku}</span>}
            </button>
          ))}
        </div>
      )}
      {showAviso && (
        <ProductoNoEncontradoAviso
          nombre={pending}
          onAgregarComoComentario={() => { onFreeText(pending); setShowAviso(false); }}
          onCancelar={() => { onTyping(''); setShowAviso(false); setPending(''); }}
        />
      )}
    </div>
  );
}

// H40: lo que trae el 409 ANULA_CONFIRMACION de PATCH /ventas/cotizaciones/{id} (T4) en err.detail. B3 T17: vive con
// el panel rosa en anular-confirmacion.tsx (lo comparte «Ajustar anticipo»); se reexporta para quien lo importa de aquí.
export type { AnulacionConfirmacion };
// H40 (R7): lo que la calculadora agrega al payload para guardar anulando la confirmación del cliente. La razón va de 5
// a 500 caracteres (medidos como len() de Python, en puntos de código) y queda en la Actividad de la cotización.
type ExtraGuardado = { anular_confirmacion?: boolean; motivo_recotizacion?: string };

// H40: el aviso ámbar con que abre la calculadora de una cotización que el cliente ya confirmó o que espera su
// confirmación. 'figura confirmada' (ruling T9A-6): CONFIRMADA sin la confirmación del cliente vigente ('reabrir').
const AVISO_CALC_CONFIRMADA = 'El cliente ya confirmó esta cotización. Cambiar productos, cantidades, precios, descuento, TRM o la fecha de entrega anula su confirmación y habrá que enviársela de nuevo. Cambiar solo las notas no la anula.';
const AVISO_CALC_PENDIENTE = 'Esta cotización está esperando la confirmación del cliente. Cambiar productos, cantidades, precios, descuento, TRM o la fecha de entrega hace que el enlace que tiene el cliente deje de servir y habrá que enviársela de nuevo. Cambiar solo las notas no lo afecta.';
const AVISO_CALC_FIGURA_CONFIRMADA = 'Esta cotización figura como confirmada: cambiar precios, productos, cantidades, descuento, TRM o la fecha de entrega la devuelve a Borrador y habrá que enviársela de nuevo al cliente. Cambiar solo las notas no la cambia.';

export function CalculadorModal({
  cot, onSave, onClose, estadoConfirmacion = null, sinConfirmacionVigente = false, anulacion = null,
  onDescartarAnulacion, saving = false, tarifaIvaDefecto = null,
}: {
  cot: any; onSave: (data: any) => void; onClose: () => void;
  /** B3 T17 (IVA punto 10): la tarifa de IVA de Configuración (iva_tarifa_defecto del GET) para las filas sin tarifa. */
  tarifaIvaDefecto?: string | null;
  /** H40: la cotización CONFIRMADA (sin pedido vigente) o PENDIENTE_CONFIRMACION: aviso ámbar al abrir. */
  estadoConfirmacion?: 'CONFIRMADA' | 'PENDIENTE_CONFIRMACION' | null;
  /** H40 (ruling T9A-6): CONFIRMADA pero sin la confirmación del cliente vigente (situacion.paso 'reabrir'). */
  sinConfirmacionVigente?: boolean;
  /** H40: el 409 ANULA_CONFIRMACION recibido: el pie cambia por el panel rosa que pide la razón. */
  anulacion?: AnulacionConfirmacion | null;
  onDescartarAnulacion?: () => void;
  /** Guardando: botones deshabilitados y la ventana no se cierra. */
  saving?: boolean;
}) {
  const avisoConfirmacion = estadoConfirmacion === 'PENDIENTE_CONFIRMACION' ? AVISO_CALC_PENDIENTE
    : estadoConfirmacion === 'CONFIRMADA' ? (sinConfirmacionVigente ? AVISO_CALC_FIGURA_CONFIRMADA : AVISO_CALC_CONFIRMADA)
    : null;
  const notasId = useId();
  const notasAyudaId = useId();
  const [razon, setRazon] = useState('');
  const [trm, setTrm] = useState(cot.trm_rate || 4200);
  // Ronda 1 (punto 3): filaDeCalculadora respeta un margen 0 (antes `|| 30` lo subía al 30%). B3 T17: cada fila lleva su
  // iva_tarifa (la de la línea, la actual del producto o la de Configuración) y _tarifaProducto (filasInicialesCalculadora).
  const [productos, setProductos] = useState<any[]>(
    () => filasInicialesCalculadora(cot, tarifaIvaDefecto).map(f => ({ ...f, _rowId: crypto.randomUUID() }))
  );
  const [descuento, setDescuento] = useState(cot.descuento_pct || 0);
  const [fechaEntrega, setFechaEntrega] = useState(cot.fecha_entrega_estimada ? cot.fecha_entrega_estimada.split('T')[0] : '');
  const [notas, setNotas] = useState(cot.notas || '');
  const [error, setError] = useState('');

  const addProd = () => setProductos(p => [...p, { ...filaNuevaCalculadora(tarifaIvaDefecto), _rowId: crypto.randomUUID() }]);
  const removeProd = (i: number) => setProductos(p => p.filter((_, idx) => idx !== i));
  const setProdFields = (i: number, patch: any) =>
    setProductos(p => p.map((item, idx) => idx === i ? { ...item, ...patch } : item));
  const updateProd = (i: number, k: string, v: any) => setProdFields(i, { [k]: v });

  // H42: lineas en pesos enteros; el descuento se redondea al peso y el total cuadra exacto (ronda 1: la cuenta vive en
  // @/lib/pricing, probada con node).
  const calculo = useMemo(() => calcularCotizacion(productos, trm, descuento), [productos, trm, descuento]);
  const computedProd = calculo.filas;
  // B3 T17 (nota tras T13): TODAS las cifras (el total de cada línea, subtotal, descuento, IVA por tarifa, total y
  // anticipo) salen de lib/iva.js. Con una línea incompleta no lanza: totales null, el mensaje en línea y «—».
  const iva = useMemo(() => totalesIvaCalculadora(calculo.filas, descuento), [calculo, descuento]);
  const totalIva = iva.totales ? iva.totales.total_cop : null;
  // B3 T17 r2: una cotización vieja (sin IVA discriminado): si se compara contra null y su aviso (lib/pricing.js).
  const reglaSinIva = reglaCotizacionSinIva(cot, iva.totales);
  // H36+H43 / R3: el anticipo ya no se edita aqui; lo calcula el servidor con la modalidad de la SC o el % manual.
  // Ya convertida: el % y lo pagado DEL PEDIDO (el GET recalcula con la modalidad de hoy, que ya no es el trato).
  // B3 T17 (R8): sobre el total CON IVA; r1: sin SC ni % manual, con el % guardado sin cuantizar (anticipoDeCalculadora).
  const resumenAnticipo = resumenAnticipoCotizacion(cot);
  const anticipo_cop = anticipoDeCalculadora(cot, resumenAnticipo, totalIva);
  const saldo = totalIva === null || anticipo_cop === null ? null
    : totalIva - (resumenAnticipo.convertida ? Number(resumenAnticipo.pagado) || 0 : anticipo_cop);

  // H40: el cuerpo COMPLETO de PATCH /ventas/cotizaciones/{id} con lo que hay en pantalla (ruling 1). B3 T17: con la
  // iva_tarifa de cada línea y subtotal/total de lib/iva.js (el servidor recalcula y gana).
  const armarPayload = () => cuerpoCompletoCalculadora(calculo, { trm, descuento, notas, fechaEntrega }, cot, iva.totales);
  // Ronda 1 (punto 2): el cálculo con que se abrió la calculadora (estado perezoso: se arma una sola vez; B3 T17: estado
  // y no ref, porque también lo lee el render para deshabilitar «Guardar»). Al guardar, los precios solo viajan si
  // cambiaron frente a él (cuerpoDeGuardado): guardar solo las notas de una cotización calculada antes de H42 ya no
  // reenvía sus precios recalculados ni anula la confirmación del cliente.
  const [inicial] = useState(armarPayload);
  // B3 T17 r2/r3: contra qué se compara al guardar (referenciaDeGuardado de lib/pricing.js): null en una cotización
  // vieja que ya puede tomar el IVA; si no, inicial.
  const referenciaGuardado = () => referenciaDeGuardado(cot, inicial, iva.totales);

  // H40 (ruling T9A-1): `extra` es solo lo de la anulación. El botón normal la llama con una flecha
  // (onClick={() => handleSave()}): si React le pasara el evento del clic como `extra`, JSON.stringify fallaría por la
  // estructura circular. Con el panel rosa la calculadora queda inerte: se reenvía lo mismo que describió el 409.
  const handleSave = (extra: ExtraGuardado = {}) => {
    // Ronda 2 (punto 2): una cotización sin total todavía no está cotizada: no se compara y va el cuerpo completo
    // (inicialParaComparar da null).
    const cuerpo = cuerpoDeGuardado(armarPayload(), referenciaGuardado());
    // Los precios se validan solo si viajan (validaPreciosAlGuardar): guardar solo las notas o la fecha de una
    // cotización ya calculada no depende de ellos.
    if (validaPreciosAlGuardar(cuerpo)) {
      // B3 T17: con una línea incompleta el botón está deshabilitado y el error se ve en TOTALES (un solo medio).
      if (!iva.totales) return;
      // r3: la misma validación que decide la rama (a) de la COT vieja (errorPreciosCalculadora, lib/pricing.js).
      const errorPrecios = errorPreciosCalculadora(iva.totales);
      if (errorPrecios) {
        setError(errorPrecios);
        return;
      }
    }
    setError('');
    onSave({ ...cuerpo, ...extra });
  };

  const errorCalculadora = error && (
    <p className="text-xs text-red-600 font-bold mb-3 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
  );
  // B3 T17: con una línea incompleta (iva.error) no se guardan precios: el botón se deshabilita y el motivo ya está en
  // TOTALES. Guardar solo las notas o la fecha sigue funcionando.
  const bloqueadoPorIva = !iva.totales
    && validaPreciosAlGuardar(cuerpoDeGuardado(armarPayload(), referenciaGuardado()));

  return (
    <Modal cierreExterno={false} title="Calculadora de Cotización" subtitle={`${cot.numero} — ${cot.customer_name}`}
      icon={Calculator} color="amber" maxWidth="4xl" onClose={onClose} bloquearCierre={saving}
      footer={anulacion ? (
        // H40 (R7): el servidor no guardó (409 ANULA_CONFIRMACION): qué cambió y la razón obligatoria antes de anular.
        // B3 T17: el panel vive en anular-confirmacion.tsx (lo comparte «Ajustar anticipo»). El título según el caso:
        // pendiente (el estado del 409), figura confirmada sin la confirmación vigente ('reabrir') o confirmada.
        <PanelAnularConfirmacion anulacion={anulacion} razon={razon} onRazon={setRazon} saving={saving}
          titulo={tituloAnulacion(anulacion.estado || estadoConfirmacion,
            estadoConfirmacion === 'CONFIRMADA' && sinConfirmacionVigente)}
          error={errorCalculadora} onSeguirEditando={onDescartarAnulacion}
          onAnular={motivo => handleSave({ anular_confirmacion: true, motivo_recotizacion: motivo })} />
      ) : (
        <div className="w-full">
          {errorCalculadora}
          <div className="flex justify-end gap-3">
            <Button variant="secondary" disabled={saving} onClick={onClose}>Cancelar</Button>
            <Button color="amber" icon={Save} loading={saving} disabled={bloqueadoPorIva} onClick={() => handleSave()}>Guardar Cotización</Button>
          </div>
        </div>
      )}>
        {/* Ronda 1 (punto 4): con el panel rosa (o mientras guarda) la calculadora queda inerte: lo que se reenvía es lo
            que describió el 409, y solo «Seguir editando» vuelve a habilitar la edición. */}
        <fieldset disabled={!!anulacion || saving} className="min-w-0 space-y-5">
          {/* H40: avisa desde que se abre qué anula la confirmación del cliente (el 409 del servidor es la red). */}
          {avisoConfirmacion && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs font-semibold text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <p>{avisoConfirmacion}</p>
            </div>
          )}
          {/* B3 T17 r2: una cotización vieja (sin IVA discriminado): neutral si al guardar se aplica el IVA, ámbar si no. */}
          {reglaSinIva && (
            <div className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-xs font-semibold ${reglaSinIva.tono === 'neutral'
              ? 'border-slate-200 bg-slate-50 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
              {/* r3: Info para el aviso neutral (se aplicará el IVA); AlertTriangle solo para los ámbar. */}
              {reglaSinIva.tono === 'neutral'
                ? <Info size={14} className="shrink-0 mt-0.5" />
                : <AlertTriangle size={14} className="shrink-0 mt-0.5" />}
              <p>{reglaSinIva.aviso}</p>
            </div>
          )}
          {/* TRM */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">TRM (USD → COP)</label>
              <input type="number" value={trm} onChange={e => setTrm(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Desc. Global (%)</label>
              <input type="number" min="0" max="100" value={descuento} onChange={e => setDescuento(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
            <div>
              <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Fecha Entrega Est.</label>
              <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)}
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            </div>
          </div>

          {/* Products */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <p className="text-xs font-black text-slate-500 uppercase">Productos</p>
              <button onClick={addProd} className="bg-amber-100 text-amber-700 px-3 py-1 rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-amber-200">
                <Plus size={12}/> Agregar
              </button>
            </div>
            {/* B3 T17: con la columna IVA la tabla no cabe en un celular: se desliza de lado en su recuadro. */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-slate-400 uppercase font-black">
                  <tr>
                    <th className="px-3 py-2 text-left min-w-[180px]">Producto</th>
                    <th className="px-3 py-2 text-right">Qty</th>
                    <th className="px-3 py-2 text-right">Costo USD</th>
                    <th className="px-3 py-2 text-right">Flete USD</th>
                    <th className="px-3 py-2 text-right">Margen %</th>
                    <th className="px-3 py-2 text-left">IVA</th>
                    <th className="px-3 py-2 text-right">Total sin IVA</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {computedProd.map((p, i) => (
                    <tr key={p._rowId}>
                      <td className="px-3 py-2 min-w-[180px]">
                        <ProductoAutocomplete
                          value={p.product_name}
                          esLibre={p.es_libre}
                          skuId={p.sku_id}
                          onTyping={v => setProdFields(i, { product_name: v, sku_id: null, es_libre: false })}
                          onSelect={sel => setProdFields(i, { product_name: sel.product_name || sel.name, sku_id: sel.id, es_libre: false, ...tarifaDeSeleccion(sel, tarifaIvaDefecto) })}
                          onFreeText={nombre => setProdFields(i, { product_name: nombre, sku_id: null, es_libre: true })}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="1" value={p.qty} onChange={e => updateProd(i, 'qty', e.target.value)}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={p.cost_usd} onChange={e => updateProd(i, 'cost_usd', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" step="0.01" value={p.flete_usd} onChange={e => updateProd(i, 'flete_usd', e.target.value)}
                          className="w-20 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2">
                        <input type="number" min="0" max={MARGIN_PCT_CAP} value={p.margen_pct} onChange={e => updateProd(i, 'margen_pct', Math.min(MARGIN_PCT_CAP, Math.max(0, Number(e.target.value) || 0)))}
                          className="w-16 border border-slate-200 rounded px-2 py-1 text-right font-bold outline-none focus:ring-1 focus:ring-amber-200" />
                      </td>
                      <td className="px-3 py-2 align-top">
                        <CeldaIvaLinea fila={p} ivaLinea={iva.totales?.lineas[i]?.iva_cop}
                          onCambio={t => updateProd(i, 'iva_tarifa', t)} />
                      </td>
                      <td className="px-3 py-2 text-right font-black text-amber-700">{pesosOGuion(iva.totales?.lineas[i]?.total_cop)}</td>
                      <td className="px-3 py-2">
                        {computedProd.length > 1 && (
                          <button onClick={() => removeProd(i)} className="text-red-400 hover:text-red-600"><X size={12}/></button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 space-y-2">
            {/* B3 T17: Subtotal, Descuento, el IVA por tarifa y TOTAL (con IVA), de lib/iva.js (calculadora-iva.tsx). */}
            <TotalesCalculadoraIva iva={iva} descuentoPct={descuento} />
            <div className="grid grid-cols-2 gap-3 mt-2">
              <div>
                <p className="text-xs text-slate-500 mb-1">Anticipo {resumenAnticipo.etiqueta}</p>
                <p className="font-black text-slate-800">{pesosOGuion(anticipo_cop)}</p>
              </div>
              <div className="flex flex-col justify-end">
                <p className="text-xs text-slate-500 mb-1">{resumenAnticipo.convertida ? 'Saldo del pedido' : 'Saldo pendiente'}</p>
                <p className="font-black text-slate-800">{pesosOGuion(saldo)}</p>
              </div>
            </div>
            <p className="text-[11px] text-amber-800">
              {resumenAnticipo.convertida
                ? `Ya pagado en el pedido ${resumenAnticipo.pedido?.numero || ''}: ${fCOP(resumenAnticipo.pagado)}. Re-cotizar no cambia el anticipo ni los pagos del pedido.`
                : resumenAnticipo.manual
                ? `${origenAnticipo(cot)}${resumenAnticipo.manual.nota ? ` — ${resumenAnticipo.manual.nota}` : ''}. Para cambiarlo usa “Ajustar anticipo” en la cotización.`
                : cot.sc_id
                  ? `El anticipo sigue la modalidad de pago de la solicitud ${cot.sc_numero || ''}. Para cambiarlo, cambia la modalidad en la solicitud o usa “Ajustar anticipo” en la cotización.`
                  : 'La cotización no tiene solicitud: conserva su % de anticipo. Para cambiarlo usa “Ajustar anticipo” en la cotización.'}
            </p>
          </div>

          {/* Notas */}
          <div>
            <label htmlFor={notasId} className="text-xs font-black text-slate-500 uppercase mb-1 block">Notas / Observaciones</label>
            <textarea id={notasId} aria-describedby={notasAyudaId} value={notas} onChange={e => setNotas(e.target.value)} rows={3}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400 outline-none" />
            {/* R3 (C19): la nota de la cotización le llega al cliente en su documento (r1: ligada al textarea). */}
            <p id={notasAyudaId} className="text-[11px] text-slate-500 mt-1">{AYUDA_NOTA_CLIENTE}</p>
          </div>
        </fieldset>
    </Modal>
  );
}

// â”€â”€ Delete Confirm Dialog â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export function DeleteConfirm({ cot, onConfirm, onCancel }: { cot: any; onConfirm: () => void; onCancel: () => void }) {
  return (
    <Modal title="Eliminar Cotización" icon={Trash2} color="red" maxWidth="md" onClose={onCancel}
      footer={(
        <>
          <Button variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button variant="danger" onClick={onConfirm}>Sí, Eliminar</Button>
        </>
      )}>
      <p className="text-slate-500 text-sm">
        ¿Estás seguro de eliminar <strong>{cot.numero}</strong>?
      </p>
      {cot.sc_numero && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-3">
          La solicitud <strong>{cot.sc_numero}</strong> seguirá activa y podrás crearle una nueva cotización.
        </p>
      )}
    </Modal>
  );
}

export function PropagarPvenConfirm({ pven, totalAnterior, totalNuevo, onConfirm, onCancel, saving }: { pven: any; totalAnterior: number; totalNuevo: number; onConfirm: () => void; onCancel: () => void; saving: boolean }) {
  // A3: lo pagado es total - saldo del pedido (no solo el anticipo); el servidor deja el saldo en $0, no negativo.
  // B3.1 r1 (B): «antes» es el total del pedido; si ya difiere del de la COT, una nota en vez del total nuevo y del crédito.
  const { antes, nuevo, pagado: yaPagado, credito: creditoAFavor, nota } = resumenPropagacionPedido(pven, totalAnterior, totalNuevo);
  return (
    // B4 T24 r2 (C5) y r3 (m6): su cierre ES una de sus dos decisiones (onCancel guarda la cotización con un PATCH): solo sus botones
    // (sin la X: la calculadora no conserva lo editado), y nada mientras guarda.
    <Modal cierreExterno={false} bloquearCierre={saving} sinCerrar title="Actualizar Pedido de Venta" icon={RotateCcw} color="indigo" maxWidth="md" onClose={onCancel}
      footer={(
        <div className="flex flex-col w-full gap-2">
          <Button color="indigo" disabled={saving} onClick={onConfirm}>Sí, actualizar también el pedido</Button>
          {/* B4 T24 f2 (m2 = m6 de la revisión r3 de f1): sin la X, el foco inicial caía en «Sí, actualizar también el pedido»: arranca en
              la opción de menos peso (autoFocus; useCierreVentana respeta el foco que ya está dentro del panel). Abrir no decide. */}
          <Button variant="secondary" autoFocus disabled={saving} onClick={onCancel}>Solo guardar la cotización</Button>
        </div>
      )}>
      <p className="text-slate-500 text-sm">
        Esta cotización ya tiene el pedido <strong>{pven?.numero}</strong> generado. Los nuevos precios no se
        reflejan allí automáticamente.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center gap-3 text-sm">
        {nuevo === null && <span className="text-slate-500">Total actual del pedido:</span>}
        <span className={nuevo === null ? 'font-semibold text-slate-700' : 'text-slate-400 line-through'}>{fCOP(antes)}</span>
        {nuevo !== null && <><ArrowRight size={14} className="text-slate-400"/><span className="font-black text-indigo-700">{fCOP(nuevo)}</span></>}
      </div>
      {nota && <p className="text-xs text-slate-600 text-center">{nota}</p>}
      {creditoAFavor > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800">
          <p className="font-bold mb-1">⚠ El cliente ya pagó {fCOP(yaPagado)}, más que el nuevo total.</p>
          <p>Al continuar, el saldo del pedido queda en $0 y el cliente tiene un crédito a favor de <strong>{fCOP(creditoAFavor)}</strong>. Esto no genera el reembolso automáticamente -- coordina con el cliente o finanzas por separado.</p>
        </div>
      )}
      <p className="text-[11px] text-slate-400 text-center">
        El anticipo y los pagos ya registrados en el pedido no se modifican, solo productos y precios.
      </p>
    </Modal>
  );
}

// H27+H39: `customerEmail` es opcional para no cambiar a quien no lo pasa (Hub, SC). Si se pasa y esta
// vacio, Email queda deshabilitado ('Email (sin correo)'); en ambos casos se avisa del correo de respaldo.
// B2-T9A ronda 1: `textoSinTelefono` (opcional) dice por qué no se ofrece WhatsApp: 'sin teléfono' (por defecto) o
// 'teléfono incompleto'.
// B3 T17 (U16-envio punto 13 con RP19, U16-reenvio-cot): dos props opcionales más, que usan la COT, el Hub, la SC (T18)
// y el PVEN (T19). `envioWhatsApp` {automatico, listo} (useEstadoEnvioWhatsApp; A mayúscula, no es la envioWhatsapp del
// EnlaceConfirmacionModal) pone bajo la opción WhatsApp si sale sola desde el WhatsApp de la empresa (lineaWhatsAppCanal);
// `nota` va bajo las opciones (el reenvío: NOTA_REENVIO_ENLACE). Sin ellas, la ventana queda como antes.
// B3 T19 (H49): `error` (opcional) es el error del envío dentro de la ventana, que sigue abierta (el PVEN).
// B3 T20b: `aviso` (opcional) va arriba de los botones y no bloquea nada (AvisoNombreSinContacto de la SC y la COT).
export function ChannelModal({ selectedChannel, onSelectChannel, onConfirm, onCancel, saving, customerHasPhone, documentLabel = 'cotización', customerEmail, textoSinTelefono = 'sin teléfono', envioWhatsApp = null, nota, error, aviso }: {
  selectedChannel: 'WhatsApp'|'Email'|'Otro'|null; onSelectChannel: (ch: 'WhatsApp'|'Email'|'Otro') => void; onConfirm: () => void;
  onCancel: () => void; saving: boolean; customerHasPhone: boolean; documentLabel?: string; customerEmail?: string | null;
  textoSinTelefono?: string; envioWhatsApp?: EnvioWhatsAppCanal | null; nota?: string; error?: string; aviso?: ReactNode;
}) {
  const conoceCorreo = customerEmail !== undefined;
  const correo = (customerEmail || '').trim();
  const sinCorreo = conoceCorreo && !correo;
  const lineaWhatsApp = customerHasPhone ? lineaWhatsAppCanal(envioWhatsApp) : null;
  return (
    <Modal title="Seleccionar Canal de Envío" subtitle={`¿Por cuál canal deseas enviar la ${documentLabel}?`}
      icon={Send} color="blue" maxWidth="md" onClose={onCancel} bloquearCierre={saving}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</Button>
          <Button color="blue" disabled={!selectedChannel || saving} onClick={onConfirm}>Enviar</Button>
        </>
      )}>
      {aviso}
      <div className="space-y-2">
        <button
          onClick={() => onSelectChannel('WhatsApp')}
          disabled={!customerHasPhone}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'WhatsApp'
              ? 'border-green-500 bg-green-50 text-green-700'
              : customerHasPhone
              ? 'border-slate-300 bg-white text-slate-700 hover:border-green-300'
              : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
          }`}>
          <Phone size={18}/>
          <span>WhatsApp{!customerHasPhone ? ` (${textoSinTelefono})` : ''}</span>
        </button>
        {/* r1 (accesibilidad): siempre montada (vacía e invisible sin línea), para que el aviso que llega con el GET se
            anuncie. */}
        <p role="status" aria-live="polite" className={!lineaWhatsApp ? 'sr-only'
          : `text-xs font-semibold px-1 ${lineaWhatsApp.tono === 'ok' ? 'text-green-700' : 'text-amber-700'}`}>
          {lineaWhatsApp?.texto ?? ''}
        </p>
        <button
          onClick={() => onSelectChannel('Email')}
          disabled={sinCorreo}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'Email'
              ? 'border-blue-500 bg-blue-50 text-blue-700'
              : !sinCorreo
              ? 'border-slate-300 bg-white text-slate-700 hover:border-blue-300'
              : 'border-slate-200 bg-slate-50 text-slate-400 cursor-not-allowed'
          }`}>
          <Mail size={18}/>
          <span>Email{sinCorreo ? ' (sin correo)' : ''}</span>
        </button>
        <button
          onClick={() => onSelectChannel('Otro')}
          className={`w-full py-3 px-4 rounded-xl border-2 font-bold text-left transition-all flex items-center gap-3 ${
            selectedChannel === 'Otro'
              ? 'border-slate-500 bg-slate-50 text-slate-700'
              : 'border-slate-300 bg-white text-slate-700 hover:border-slate-400'
          }`}>
          <MessageCircle size={18}/>
          <span>Otro</span>
        </button>
      </div>
      {nota && <p className="text-xs font-semibold text-slate-600">{nota}</p>}
      {conoceCorreo && (
        <p className="text-xs text-slate-500">
          {correo
            ? `Además se enviará un correo de respaldo a ${correo} con el enlace.`
            : 'El cliente no tiene correo registrado: no se enviará correo de respaldo.'}
        </p>
      )}
      {/* r1 (lección de T16/T17): la región viva siempre montada; solo cambia su contenido. r2: vacía, empty:-mt-4 anula el
          espacio del space-y-4. */}
      <div role="alert" className="empty:-mt-4">{error ? <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p> : null}</div>
    </Modal>
  );
}

// ── N1 / R4 / R6: verificar el pago del anticipo antes de crear el pedido ─────────────────────
// Se abre cuando la cotizacion tiene anticipo por verificar (anticipo_por_verificar del GET). El
// pago puede ser menor (R4: el pedido queda debiendo la diferencia, con casilla de confirmacion) y
// el saldo a favor de un pedido cancelado de esta misma COT se descuenta (R6). `error` es el
// detail del servidor, que se muestra aqui dentro.
// Los campos de GET /ventas/cotizaciones/{id} que usan los modales del anticipo.
type CotizacionAnticipo = {
  numero?: string; customer_name?: string | null; total_cop?: number | string | null;
  anticipo_cop?: number | null; anticipo_pct?: number | null; anticipo_requerido?: number | null;
  anticipo_pct_manual?: number | null; anticipo_manual_nota?: string | null;
  sc_id?: number | null; sc_modalidad_pago?: string | null;
  saldo_a_favor?: number | null; anticipo_por_verificar?: number | null;
  saldo_a_favor_detalle?: { pven_id?: number; pven_numero: string; monto: number }[] | null;
};

export function VerificarAnticipoModal({ cot, verificador, saving, error, onConfirm, onCancel }: {
  cot: CotizacionAnticipo; verificador: string; saving: boolean; error?: string;
  onConfirm: (verificacion: ReturnType<typeof verificacionParaEnviar>) => void; onCancel: () => void;
}) {
  const cuenta = cuentaVerificacion(cot);
  const hoy = hoyLocal();
  const [form, setForm] = useState({
    monto: formatoPesos(cuenta.porVerificar).replace('$', ''), metodo: '', referencia: '', fecha: hoy,
    confirmoRevision: false, confirmoParcial: false,
  });
  const set = (k: keyof typeof form, v: string | boolean) => setForm(f => ({ ...f, [k]: v }));
  const ev = evaluarVerificacion(cuenta, form, hoy);
  const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold outline-none focus:ring-2 focus:ring-emerald-200 focus:border-emerald-400';
  return (
    <Modal cierreExterno={false} title="Verificar el pago del anticipo" subtitle={`${cot.numero} — ${cot.customer_name || ''}`}
      icon={DollarSign} color="emerald" maxWidth="lg" onClose={onCancel}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Volver</Button>
          <Button color="emerald" icon={CheckCircle2} loading={saving} disabled={!ev.valido}
            onClick={() => onConfirm(verificacionParaEnviar(form))}>
            Pago verificado — Crear Pedido de Venta
          </Button>
        </>
      )}>
      <p className="text-sm text-slate-600">
        {origenAnticipo(cot)}: el cliente debe haber pagado al menos <strong>{fCOP(cuenta.requerido)}</strong> ({formatoPct(cot.anticipo_pct ?? 60)}).
        Revisa en el banco que el dinero llegó y registra el pago.
      </p>
      {cuenta.saldoAFavor > 0 && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-xs text-emerald-800 space-y-1">
          {cuenta.saldos.map(s => (
            <p key={s.numero} className="font-bold">Saldo a favor del pedido cancelado {s.numero}: {fCOP(s.monto)}</p>
          ))}
          <p>Se descuenta del anticipo: {cuenta.porVerificar > 0 ? `falta verificar ${fCOP(cuenta.porVerificar)}.` : 'el saldo a favor ya lo cubre.'}</p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Monto recibido</label>
          {/* Texto (no number): '1.500.000' con puntos de miles vale; debajo se ve lo que se entendio. Cambiar el
              monto quita la casilla del pago parcial (R4: se confirma la deuda de ESE monto). */}
          <input type="text" inputMode="decimal" value={form.monto} placeholder="Ej: 1.500.000"
            onChange={e => { const monto = e.target.value; setForm(f => ({ ...f, monto, confirmoParcial: false })); }} className={campo} />
          {/* Solo se muestra si lo escrito se entiende como monto: con texto que no lo es, el error ya lo dice. */}
          {form.monto.trim() !== '' && montoDesdeTexto(form.monto) !== null && (
            <p className="text-[11px] text-slate-500 mt-1">= {fCOP(ev.monto)} (máximo {fCOP(cuenta.maximo)})</p>
          )}
        </div>
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Método de pago</label>
          <select value={form.metodo} onChange={e => set('metodo', e.target.value)} className={campo}>
            <option value="">Seleccionar...</option>
            {METODOS_PAGO_ANTICIPO.map(m => <option key={m} value={m}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Referencia o número de comprobante</label>
          <input type="text" value={form.referencia} onChange={e => set('referencia', e.target.value)}
            placeholder="En efectivo, el número de recibo" className={campo} />
        </div>
        <div>
          <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Fecha del pago</label>
          <input type="date" max={hoy} value={form.fecha} onChange={e => set('fecha', e.target.value)} className={campo} />
        </div>
      </div>
      {ev.parcial && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 space-y-2">
          <p className="font-bold">El pago es menor que el anticipo requerido: el pedido quedará debiendo {fCOP(ev.deuda)}.</p>
          <label className="flex items-start gap-2 cursor-pointer">
            <input type="checkbox" checked={form.confirmoParcial} onChange={e => set('confirmoParcial', e.target.checked)} className="mt-0.5" />
            <span>Entiendo que el pedido se crea debiendo {fCOP(ev.deuda)} de anticipo.</span>
          </label>
        </div>
      )}
      {ev.errores.length > 0 && (
        <ul className="text-xs text-rose-600 font-bold space-y-0.5">
          {ev.errores.map(e => <li key={e}>{e}</li>)}
        </ul>
      )}
      <label className="flex items-start gap-2 text-sm text-slate-700 cursor-pointer">
        <input type="checkbox" checked={form.confirmoRevision} onChange={e => set('confirmoRevision', e.target.checked)} className="mt-1" />
        <span className="font-bold">Confirmo que revisé y el pago está en la cuenta de Nebulae</span>
      </label>
      <p className="text-xs text-slate-400">Verificado por: {verificador || 'usuario actual'}</p>
      {!ev.valido && ev.pendientes.length > 0 && (
        <p className="text-xs text-slate-500">Para crear el pedido falta: {ev.pendientes.join(', ')}.</p>
      )}
      {error && (
        <p className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
      )}
    </Modal>
  );
}

// ── R3: ajustar el anticipo a mano (porcentaje + nota obligatoria) o volver a la modalidad ─────
// B3 T17 (U22-anticipo punto 5): si el cliente ya vio o confirmó la cotización, el 409 ANULA_CONFIRMACION (`anulacion`)
// cambia el pie por el mismo panel rosa de H40 (anular-confirmacion.tsx, con el anticipo de antes y el nuevo) y deja el
// formulario inerte; con la razón, onAnular repite el mismo guardado con anular_confirmacion y motivo_recotizacion.
export function AjustarAnticipoModal({ cot, saving, error, onGuardar, onVolverModalidad, onCancel, anulacion = null,
  sinConfirmacionVigente = false, onDescartarAnulacion, onAnular }: {
  cot: CotizacionAnticipo; saving: boolean; error?: string;
  onGuardar: (pct: number, nota: string) => void; onVolverModalidad: () => void; onCancel: () => void;
  anulacion?: AnulacionConfirmacion | null; sinConfirmacionVigente?: boolean; onDescartarAnulacion?: () => void;
  onAnular?: (motivo: string) => void;
}) {
  const manual = cot.anticipo_pct_manual !== null && cot.anticipo_pct_manual !== undefined;
  const [pct, setPct] = useState(String(manual ? cot.anticipo_pct_manual : (cot.anticipo_pct ?? 60)));
  const [nota, setNota] = useState(cot.anticipo_manual_nota || '');
  const [razon, setRazon] = useState('');
  const v = validarAjusteAnticipo(pct, nota);
  const campo = 'w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-amber-200 focus:border-amber-400';
  const errorGuardado = error && <p className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>;
  return (
    <Modal cierreExterno={false} title="Ajustar anticipo" subtitle={`${cot.numero} — total ${fCOP(cot.total_cop)}`}
      icon={DollarSign} color="amber" maxWidth="md" onClose={onCancel}
      footer={anulacion ? (
        <PanelAnularConfirmacion anulacion={anulacion} razon={razon} onRazon={setRazon} saving={saving}
          titulo={tituloAnulacion(anulacion.estado, anulacion.estado === 'CONFIRMADA' && sinConfirmacionVigente)}
          error={errorGuardado} placeholder="Ej: el cliente negoció otro anticipo"
          onSeguirEditando={onDescartarAnulacion} onAnular={motivo => onAnular?.(motivo)} />
      ) : (
        <>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Cancelar</Button>
          {manual && <Button variant="secondary" disabled={saving} onClick={onVolverModalidad}>Volver a la modalidad</Button>}
          <Button color="amber" icon={Save} loading={saving} disabled={!!v.error}
            onClick={() => v.pct !== null && onGuardar(v.pct, v.nota)}>Guardar</Button>
        </>
      )}>
      <fieldset disabled={!!anulacion} className="min-w-0 space-y-4">
      <p className="text-sm text-slate-600">
        Hoy: {origenAnticipo(cot)} — {formatoPct(cot.anticipo_pct ?? 60)} = <strong>{fCOP(cot.anticipo_requerido ?? cot.anticipo_cop)}</strong>.
        Úsalo solo en casos especiales (por ejemplo, un anticipo negociado con el cliente).
      </p>
      <div>
        <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Porcentaje de anticipo (%)</label>
        <input type="number" min={0} max={100} step="0.01" value={pct} onChange={e => setPct(e.target.value)} className={`${campo} font-bold`} />
        {v.pct !== null && (
          <p className="text-xs text-slate-500 mt-1">Anticipo con {formatoPct(v.pct)}: <strong>{fCOP(porcentajeDePesos(cot.total_cop, v.pct))}</strong></p>
        )}
      </div>
      <div>
        <label className="text-xs font-black text-slate-500 uppercase mb-1 block">Nota (obligatoria)</label>
        <textarea value={nota} onChange={e => setNota(e.target.value)} rows={3}
          placeholder="Explica por qué el anticipo es distinto al de la modalidad" className={`${campo} resize-none`} />
      </div>
      {(pct !== '' || nota) && v.error && <p className="text-xs text-rose-600 font-bold">{v.error}</p>}
      {!anulacion && errorGuardado}
      </fieldset>
    </Modal>
  );
}

// ── B4 T9: las piezas de la lista (TABLA-listas-ventas, KANBAN-ventas-listas, KPI-ventas y FLUJO-ventas-pantallas) ──
// El modelo es la lista de Solicitudes (T8): un estado único, la tabla estándar y el tablero en el servidor, las tarjetas
// con el resumen de la misma llamada y la franja del flujo.

/** Un pedido ligero de la lista `pedidos_venta` de una fila (COT-LISTA, T6B). */
type PedidoLigero = { id: number; numero?: string | null; estado?: string | null };

/**
 * Una fila de GET /ventas/cotizaciones (T6B): el _cot_dict de la cotización, sus pedidos_venta ligeros y tipo,
 * resolucion, dias_sin_mov, dias_creado y seguimiento_estado (R8, C14). La resolución y el atraso son los del servidor:
 * aquí no se recalculan. Lo demás pasa tal cual a las librerías.
 */
type FilaCOT = {
  id: number;
  numero: string;
  estado: string;
  tipo?: string;
  sc_id?: number | null;
  sc_numero?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  cotizador?: string | null;
  total_cop?: number | string | null;
  anticipo_cop?: number | string | null;
  fecha_entrega_estimada?: string | null;
  confirmacion_vigente?: boolean | null;
  pedidos_venta?: PedidoLigero[] | null;
  resolucion?: 'ATRASADO' | 'NO_RESUELTO' | 'ACCION_TOMADA' | 'CERRADO' | null;
  dias_sin_mov?: number | null;
  dias_creado?: number | null;
  seguimiento_estado?: string | null;
  [campo: string]: unknown;
};

/** `conteos` de con_conteos=1: las pestañas (con la búsqueda; sin vista, estados ni semáforo, R5). */
type ConteosCOT = Partial<Record<'activas' | 'confirmadas' | 'rechazadas', number>>;
/** D39 (m6 de T8): las columnas del tablero de una acción desde una tarjeta: [origen, destino]. */
type ColumnasDeTarjeta = readonly [string, string];

/** El id de la lista: el MISMO en useEstadoTabla, usePreferenciasTabla, TablaEstandar y useTableroKanban (RP26), y el del
 *  modo compacto de la franja (RP90). B4 T9 r1 (A2): exportado para el esqueleto del Suspense (CargandoCotizaciones). */
export const ID_COT = 'ventas.cotizaciones';
/** R8 (atencion_primero_listas = «Sí; con un clic en una columna ordenas como quieras»): primero lo atrasado. */
export const INICIAL_COT = { vista: 'activas', orden: 'atencion' };
/** El contenedor de la lista, el del Hub y el de Solicitudes (T7 y T8): pb-24 deja libre, con la página al fondo, la
 *  esquina del botón flotante de la IA; px-4 hasta xl: a 1024 px con el menú abierto las columnas clave caben (R26). El
 *  mismo en la pantalla y en su esqueleto del Suspense (r1, A2). */
// B4 T24 f2 (F44-a): la reserva del botón de la IA es el token RESERVA_BOTON_IA (pb-24) de design-system.ts.
export const CONTENEDOR_LISTA = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;
/** R8: una rechazada está cerrada y nunca va atrasada: desde Rechazadas, «Con atraso» abre Activas (m7 de T8). */
const VISTAS_SIN_ATRASO = ['rechazadas'];
/** D39 (m6 de T8): en Kanban la lista va sin filas (limit=0): las tarjetas siguen con su resumen en una consulta barata; las
 *  filas las piden las columnas del tablero. */
const EXTRA_TABLERO = { limit: 0 };

// Los chips: los tintes del tablero (CLASE_CHIP de components/ui/Kanban.tsx), el chip estándar de las tablas del B4 (m12
// de T8): la misma marca sale igual en Lista y en Kanban. Sin tamaño de letra: cada uso pone el suyo.
const CHIP = 'inline-block max-w-full truncate rounded-full border px-1.5 py-0.5 font-bold leading-tight';
const FOCO_VISIBLE = FOCOS.indigo;
// D41: el tono opaco filaAlerta para la fila atrasada (la resolución del servidor, R8) y la marca rosa a la izquierda del Hub.
const MARCA_ATRASO = '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-rose-500)]';
const claseDeFila = (cot: FilaCOT) => (cot.resolucion === 'ATRASADO' ? `${TABLE.filaAlerta} ${MARCA_ATRASO}` : null);
const BOTON_FILA = `p-1.5 rounded-lg text-xs font-bold transition-colors ${FOCO_VISIBLE}`;
/** Quien hace el cambio desde el tablero (updated_by y user_name, como el Hub). */
const autorActual = () => { const u = getUsuarioActual(); return u.name || u.email || undefined; };

/** Lo que las celdas le piden a la pantalla. Va por un contexto para que las columnas sean constantes (D40 y D41). */
type AccionesFilaCOT = { abrir: (cot: { id: number }) => void; ir: (ruta: string) => void };
const AccionesLista = createContext<AccionesFilaCOT | null>(null);

/** r1 (I1): el color del texto de la marca del pedido en la celda (los tonos de marcaPedidoCotizacion, los del chip del
 *  tablero). */
const TEXTO_MARCA: Record<'emerald' | 'rose', string> = { emerald: 'text-emerald-700', rose: 'text-rose-600' };

const tituloNumero = (cot: FilaCOT) =>
  [cot.numero, cot.sc_numero ? `SC: ${cot.sc_numero}` : null, marcaPedidoCotizacion(cot)?.texto].filter(Boolean).join(' · ');

/** COT / SC: el número y, debajo, la solicitud de origen y la marca del pedido (COT-LISTA). r1 (I1): la marca sale de
 *  marcaPedidoCotizacion (listas-ventas.js), la misma regla de la tarjeta del tablero. */
function CeldaNumero({ cot }: { cot: FilaCOT }) {
  const marca = marcaPedidoCotizacion(cot);
  return (
    <span className="flex min-w-0 flex-col items-start leading-tight">
      <span className="max-w-full truncate text-xs font-black text-amber-700">{cot.numero}</span>
      {cot.sc_numero && <span className="max-w-full truncate text-[10px] font-bold text-indigo-600">SC: {cot.sc_numero}</span>}
      {marca && <span className={`max-w-full truncate text-[10px] font-bold ${TEXTO_MARCA[marca.tono]}`}>{marca.texto}</span>}
    </span>
  );
}

function CeldaCliente({ cot }: { cot: FilaCOT }) {
  return (
    <span className="flex min-w-0 flex-col leading-tight">
      <span className="truncate text-xs font-bold text-slate-800">{cot.customer_name || '-'}</span>
      {cot.customer_phone && <span className="truncate text-[11px] text-slate-500">{cot.customer_phone}</span>}
    </span>
  );
}

/** Total: el monto y, debajo, «Sin precio» si el total no es mayor que 0 (como antes, en cualquier estado). r1 (I1): la
 *  regla es cotizacionSinPrecio (listas-ventas.js), la misma del chip del tablero. r2 (p2): el chip (texto y tono) sale
 *  de chipSinPrecio, el mismo chip (texto y tono) de la tarjeta. */
function CeldaTotal({ cot }: { cot: FilaCOT }) {
  const chip = chipSinPrecio(cot);
  return (
    <span className="flex min-w-0 flex-col items-end gap-0.5 leading-tight">
      <span className="max-w-full truncate text-xs font-black text-slate-800">{fCOP(cot.total_cop)}</span>
      {chip && <span className={`${CHIP} text-[10px] ${CLASE_CHIP[chip.tono] ?? CLASE_CHIP.slate}`}>{chip.texto}</span>}
    </span>
  );
}

/**
 * Entrega est.: en rojo y con el ícono si ya pasó y en ámbar si vence en 7 días o menos. r1 (I2): fecha_entrega_estimada
 * es una fecha de NEGOCIO (la F3 del B3): se pinta su día de calendario (diaDeNegocio, sin pasarla a ninguna zona; el
 * mismo día del detalle y del editor) y «vencida» y «por vencer» comparan ese día con el de hoy en Colombia
 * (fechaNegocioVencida y fechaPorVencer). Nunca fechaVencida, que lee instantes.
 */
function CeldaEntrega({ cot }: { cot: FilaCOT }) {
  const vencida = fechaNegocioVencida(cot.fecha_entrega_estimada);
  const porVencer = !vencida && fechaPorVencer(cot.fecha_entrega_estimada);
  return (
    <span className={`text-xs font-bold ${vencida ? 'text-red-600' : porVencer ? 'text-amber-700' : 'text-slate-600'}`}>
      {vencida && <AlertCircle size={11} aria-hidden="true" className="mr-1 inline" />}
      {fechaCorta(diaDeNegocio(cot.fecha_entrega_estimada)) || '-'}
    </span>
  );
}

/**
 * Estado: la insignia de estados-cotizacion.js (estadoDeTarjeta, la misma del tablero) y, debajo, los chips de la fila
 * (chipsDocumentoVentas, RP18 y D4): «Atrasado N días», «Sin respuesta al recordatorio» (C14) y el de los cambios del
 * cliente de B3-T18 («Cambios pedidos» o «Ya no la necesita», etiquetaChipCambios): los mismos de la tarjeta del tablero.
 */
function CeldaEstado({ cot }: { cot: FilaCOT }) {
  const e = estadoDeTarjeta('COT', cot.estado);
  const chips = chipsDocumentoVentas(cot, 'COT');
  const clases = e.clases ? `${e.clases.bg} ${e.clases.text} ${e.clases.border}` : CLASE_CHIP.slate;
  return (
    <span className="flex min-w-0 flex-col items-start gap-0.5">
      <span className={`${CHIP} text-[11px] ${clases}`}>{e.label}</span>
      {chips.length > 0 && (
        <span className="flex min-w-0 max-w-full flex-col items-start gap-0.5">
          {chips.map((c) => <span key={c.texto} className={`${CHIP} min-w-0 text-[10px] ${CLASE_CHIP[c.tono] ?? CLASE_CHIP.slate}`}>{c.texto}</span>)}
        </span>
      )}
    </span>
  );
}

const tituloEstado = (cot: FilaCOT) =>
  [estadoDeTarjeta('COT', cot.estado).label, ...chipsDocumentoVentas(cot, 'COT').map((c) => c.texto)].join(' · ');

/**
 * Acciones: «Ver» siempre a la vista (antes solo aparecía con el puntero encima) y el menú ⋯ (MenuFila, R11) con «Abrir
 * solicitud» si la cotización viene de una y «Ver pedido» si tiene un pedido vigente (COT-LISTA); los dos vuelven a esta
 * lista con return_to. Se fue el MoreVertical sin acción. Sin ninguna de las dos, MenuFila no pinta nada.
 */
function CeldaAcciones({ cot }: { cot: FilaCOT }) {
  const acciones = useContext(AccionesLista);
  const solicitud = enlaceDocumento('SC', cot.sc_id, { returnTo: RUTA_LISTA_COTIZACIONES });
  const pedido = pedidoVigente(cot);
  const enlacePedido = pedido ? enlaceDocumento('PVEN', pedido.id, { returnTo: RUTA_LISTA_COTIZACIONES }) : null;
  const items: ItemMenuFila[] = [
    { etiqueta: 'Abrir solicitud', icono: FileText, onClick: () => { if (solicitud) acciones?.ir(solicitud); }, oculto: !solicitud },
    { etiqueta: 'Ver pedido', icono: ShoppingBag, onClick: () => { if (enlacePedido) acciones?.ir(enlacePedido); }, oculto: !enlacePedido },
  ];
  return (
    <span className="flex items-center justify-end gap-1">
      <button type="button" onClick={() => acciones?.abrir(cot)} title="Ver cotización" aria-label={`Ver ${cot.numero}`}
        className={`${BOTON_FILA} bg-amber-50 hover:bg-amber-100 text-amber-700`}>
        <FileText size={13} aria-hidden="true" />
      </button>
      <MenuFila items={items} etiqueta={`Acciones de ${cot.numero}`} />
    </span>
  );
}

/**
 * B4 T9, la tabla (TABLA-listas-ventas punto 6; R26, RP85, D41). Las columnas del diseño: COT / SC (clave, fija a la
 * izquierda), Cliente (la flexible), Cotizador, Total, Anticipo y Entrega est. (ocultas por defecto, R26: se muestran con
 * «Ajustar tabla»), Estado (clave) y Acciones (fija a la derecha). Sin casillas: la lista no tiene acciones en lote.
 * Constantes (estables, D40); sus celdas piden a la pantalla lo suyo por AccionesLista.
 * R26 (medido en el banco): a 1024 px con el menú abierto la caja de la tabla deja 704 px cuando la página trae su barra
 * vertical (RP85 contaba 716). Con Cliente en 152 las columnas sumaban 716 y la tabla corría 12 px; Cliente nace en 136
 * (132 + 136 + 120 + 104 + 120 + 88 = 700, 4 px de holgura) y, como es la flexible, toma lo que sobra en pantallas anchas.
 * r1 (A2): exportadas para el esqueleto del Suspense (las columnas que el usuario guardó, con usePreferenciasTabla).
 */
export const COLUMNAS_TABLA_COT: ColumnaTabla<FilaCOT>[] = [
  { id: 'numero', titulo: 'COT / SC', ancho: 132, clave: true, fija: 'izquierda', ordenable: 'numero', titleCelda: tituloNumero,
    celda: (cot) => <CeldaNumero cot={cot} /> },
  { id: 'cliente', titulo: 'Cliente', ancho: 136, flexible: true, ordenable: 'cliente',
    titleCelda: (cot) => [cot.customer_name || '-', cot.customer_phone].filter(Boolean).join(' · '),
    celda: (cot) => <CeldaCliente cot={cot} /> },
  // Banco (T9): con el texto suelto, la celda tomaba la letra de la tabla (text-sm), más grande que las demás.
  { id: 'cotizador', titulo: 'Cotizador', ancho: 120, ordenable: 'cotizador', titleCelda: (cot) => cot.cotizador || null,
    celda: (cot) => <span className="block truncate text-xs font-medium text-slate-600">{cot.cotizador || '-'}</span> },
  { id: 'total', titulo: 'Total', ancho: 104, alinear: 'derecha', ordenable: 'total',
    titleCelda: (cot) => [fCOP(cot.total_cop), chipSinPrecio(cot)?.texto].filter(Boolean).join(' · '),
    celda: (cot) => <CeldaTotal cot={cot} /> },
  { id: 'anticipo', titulo: 'Anticipo', ancho: 96, alinear: 'derecha', ocultaPorDefecto: true, ordenable: 'anticipo',
    titleCelda: (cot) => fCOP(cot.anticipo_cop),
    celda: (cot) => <span className="block truncate text-xs font-bold text-slate-600">{fCOP(cot.anticipo_cop)}</span> },
  { id: 'entrega', titulo: 'Entrega est.', ancho: 104, ocultaPorDefecto: true, ordenable: 'entrega',
    // r1 (I2): el title es el día de calendario (fechaSolo), como la celda.
    titleCelda: (cot) => fechaSolo(cot.fecha_entrega_estimada) || 'Sin fecha de entrega', celda: (cot) => <CeldaEntrega cot={cot} /> },
  { id: 'estado', titulo: 'Estado', ancho: 120, clave: true, ordenable: 'estado', titleCelda: tituloEstado,
    celda: (cot) => <CeldaEstado cot={cot} /> },
  { id: 'acciones', titulo: 'Acciones', ancho: 88, clave: true, fija: 'derecha', celda: (cot) => <CeldaAcciones cot={cot} /> },
];

/**
 * Las pestañas de la lista (TABLA-listas-ventas punto 6): las 3 vistas del servidor con sus conteos (con_conteos: con la
 * búsqueda, sin la vista, los estados ni el semáforo; null mientras cargan: la barra gris, nunca 0). Se fue la pestaña
 * Análisis (R13: «Ver análisis» abre el del Hub). Sin emojis. r1 (A2): la misma en la pantalla y en su esqueleto.
 */
export function pestanasDeLaLista(conteos: ConteosCOT | null): PestanaTabla[] {
  return [
    { id: 'activas', etiqueta: 'Activas', conteo: conteos?.activas ?? null },
    { id: 'confirmadas', etiqueta: 'Confirmadas', conteo: conteos?.confirmadas ?? null },
    { id: 'rechazadas', etiqueta: 'Rechazadas', conteo: conteos?.rechazadas ?? null },
  ];
}

/**
 * Los botones de la cabecera: «Actualizar», «Ver análisis» (R13: el Análisis del Hub enfocado en Cotizaciones,
 * ?tab=analisis&foco=cot, enlaceVerAnalisis) y «Nueva desde SC». r1 (A2, el patrón de T8 r1): los mismos en el esqueleto
 * del Suspense, que los pinta invisibles para que la cabecera mida lo mismo.
 */
export function AccionesCabecera({ onActualizar, actualizando }: { onActualizar: () => void; actualizando: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2.5">
      <button type="button" onClick={onActualizar} className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}>
        <RefreshCw size={15} aria-hidden="true" className={actualizando ? 'animate-spin' : ''}/> Actualizar
      </button>
      <Link href={enlaceVerAnalisis('cot')}
        className={`bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-amber-50 hover:text-amber-800 hover:border-amber-200 flex items-center gap-2 text-sm shadow-sm ${FOCO_VISIBLE}`}>
        <ContenidoEnlace icon={BarChart3}>Ver análisis</ContenidoEnlace>
      </Link>
      <Link href="/dashboard/ventas/solicitud" className={`bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm ${FOCO_VISIBLE}`}>
        <Plus size={16} aria-hidden="true"/> Nueva desde SC
      </Link>
    </div>
  );
}

/** La tarjeta del tablero (KANBAN-ventas-listas punto 6, RP18, D4, D37 y el cruce C5): vuelve a esta lista. */

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CotizacionClient() {
  const router = useRouter();
  const { avisar } = useAvisos();

  // ── B4 T9, bloque 1: la carga del servidor (TABLA-listas-ventas punto 6; R5, R8, C3, C4; RP26, D39, D40) ──
  // Ya no hay arreglos en memoria (antes, las 200 más recientes, filtradas y contadas en el navegador, y los días de
  // alerta de /ventas/config). El estado ÚNICO de la lista: las pestañas, la búsqueda, el filtro de estados, el semáforo de
  // la franja, las tarjetas, la tabla y el tablero despachan a él. El modo (Lista o Kanban) se guarda en
  // vista:ventas.cotizaciones (RP26: este hook es su único dueño) y la pestaña, la página y la búsqueda en la sesión
  // (volver del detalle deja lo mismo).
  const [estado, despachar, listo] = useEstadoTabla(ID_COT, INICIAL_COT);
  // B4 T24 (FINAL-m31 y FINAL-m38): el rol después de montar (useRolActual) decide si el tablero se mueve (accesoTableroVentas: el
  // require_roles del PATCH de destino); sin permiso, soloLectura (no se arrastra ni se ofrece «Mover a…») y sin acciones masivas.
  const rol = useRolActual();
  const accesoTablero = accesoTableroVentas(rol);
  // B4 T24 f2 r1 (duda 2 + m15): la tarjeta ofrece su acción solo si el rol puede hacerla (su require_roles); si no, «Abrir».
  const tarjetaDeCOT = useCallback((cot: FilaCOT) => tarjetaCotizacion(cot, { rol }), [rol]);
  const enKanban = estado.modo === 'kanban';

  // La tabla (T6B): GET /ventas/cotizaciones con vista, estados, semáforo, q, orden, limit y offset del estado, más los
  // conteos de las pestañas y el resumen de las tarjetas y de los avisos (RP19) en la MISMA llamada. esperar: !listo
  // (D40): el esqueleto, nunca «vacío». En Kanban, sin filas (EXTRA_TABLERO): las piden las columnas.
  const listado = useListado<FilaCOT>({
    ruta: '/ventas/cotizaciones', estado, conConteos: true, conResumen: true, esperar: !listo, despachar,
    extra: enKanban ? EXTRA_TABLERO : null,
  });
  // m5 de T8: mientras la última respuesta sea la de Kanban (sin filas) y la tabla ya pida su página, la tabla está
  // cargando y el total en 'cargando': nunca «No hay cotizaciones en esta vista» con el total de la otra consulta.
  const [llegada, setLlegada] = useState(() => llegadaDeListado(null, null, false));
  const llegadaAhora = llegadaDeListado(llegada, listado.crudo, enKanban);
  if (llegadaAhora !== llegada) setLlegada(llegadaAhora);
  const sinPagina = !enKanban && llegadaAhora.sinFilas && !listado.error;

  // La franja del flujo (R8): GET /ventas/flujo; recargaFlujo sube con cada recarga de la lista.
  const [recargaFlujo, setRecargaFlujo] = useState(0);
  const flujo = useResumenFlujo<DatosFlujo>('/ventas/flujo', recargaFlujo);

  // El tablero en modo servidor (R11, C4, D39): una consulta por columna (consultaColumnaCOT: vista=todas, los estados de
  // la columna cruzados con el filtro de la pantalla; sin ninguno en común la columna queda vacía sin pedir nada) con el
  // MISMO estado (búsqueda y semáforo); porColumna = el tamaño de la tabla y limit=0 en la plegada (lo hace el hook).
  // 'atencion' en las abiertas y 'reciente' en Rechazada (D39).
  const tablero = useTableroKanban<FilaCOT>({
    pantalla: ID_COT,
    modo: 'servidor',
    columnas: COLUMNAS_COT,
    activo: listo && enKanban,
    porColumna: estado.tamano,
    dependencias: dependenciasTablero(estado),
    ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),
    cargar: async (columna, { offset, limit, orden, signal }) => {
      const consulta = consultaColumnaCOT(estado, columna, { orden, limit, offset });
      if (consulta === null) return { filas: [], total: 0 };
      return normalizarRespuesta(await apiFetch(`/ventas/cotizaciones?${consulta}`, { signal }));
    },
  });

  // «Actualizar»: la tabla, el tablero y la franja. Ninguna recarga vacía lo que se ve: los hooks conservan lo último.
  const { recargar: recargarListado } = listado;
  const { recargar: recargarTablero } = tablero;
  const recargarLista = useCallback(() => {
    recargarListado();
    recargarTablero();
    setRecargaFlujo((n) => n + 1);
  }, [recargarListado, recargarTablero]);

  // D40 y D41: un solo usePreferenciasTabla por id (la tabla y «Ajustar tabla» comparten su resultado y el ref del ancho).
  const prefs = usePreferenciasTabla(ID_COT, COLUMNAS_TABLA_COT);
  const anchoTablaRef = useRef<number | null>(null);
  // Desestructurado: con el objeto entero en ref={…}, react-hooks/refs marca «Cannot access refs during render».
  const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();
  // Pasar a Kanban sale de la pantalla completa: el conmutador sigue a la vista y el tablero no queda tapado.
  useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);
  // Las pestañas y las tarjetas salen de la misma llamada: un solo estado (C13; barras grises mientras cargan, «—» con error).
  const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);

  const searchParams = useSearchParams();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id= (Hub, SC, PVEN):
  // se redirige a la pagina canonica de detalle en vez de duplicar la vista aqui.
  useEffect(() => {
    const idParam = searchParams?.get('id');
    if (idParam) { const numId = Number(idParam); if (!isNaN(numId)) router.replace(`/dashboard/ventas/cotizacion/${numId}`); }
  }, [searchParams, router]);

  // ── B4 T9, bloque 2: pestañas y búsqueda (TABLA-listas-ventas punto 6; R5, RP26, D40, D41; H15, H17) ──
  // COT-LISTA vive en el servidor: una CONFIRMADA cuyo pedido se canceló (y que el cliente no volvió a confirmar) cuenta
  // en Activas, no en Confirmadas ni en el monto confirmado (f_cot_activa y f_cot_confirmada de T6B).
  const pestanas = pestanasDeLaLista(listado.conteos as ConteosCOT | null);
  // «N resultados» es el de la tabla; en Kanban cada columna trae su total (la barra no lo repite).
  const totalDeLaBarra = enKanban ? {} : {
    // m5 de T8: sin la página de la vista todavía (llegó la de Kanban), el total en 'cargando'.
    total: sinPagina ? null : listado.total,
    estadoTotal: estadoDelTotal({
      total: listado.total, cargando: listado.cargandoInicial || sinPagina, recargando: listado.recargando, error: listado.error,
    }),
  };
  // m2 de T8: el conmutador Lista / Kanban poda los estados con las opciones del modo nuevo (las columnas del tablero, o
  // las de la pestaña en Lista), con la regla de accionPestana (accionModo); lo demás de la barra va directo.
  const alCambiarBarra = useCallback((accion: AccionTabla) => {
    if (accion.tipo === 'modo') {
      const modo = String(accion.valor);
      despachar(accionModo(estado, modo, modo === 'kanban' ? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones, COLUMNAS_COT));
    } else despachar(accion);
  }, [estado, despachar]);
  // m8 de T8: el «vacío» de la lista solo cambia con la búsqueda y la pestaña. En Activas, sin búsqueda, el enlace de
  // siempre a Solicitudes para crear una cotización.
  const vacioLista = useMemo(() => {
    const q = estado.q.trim();
    return (
      <div>
        <p className="font-semibold text-slate-600">{q ? `Sin resultados para «${q}»` : 'No hay cotizaciones en esta vista'}</p>
        <p className="mt-1 text-xs text-slate-500">Ajusta la búsqueda o el filtro de estados.</p>
        {!q && estado.vista === 'activas' && (
          <Link href="/dashboard/ventas/solicitud" className={`mt-3 inline-flex items-center gap-1 bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-amber-700 ${FOCO_VISIBLE}`}>
            <ArrowRight size={12} aria-hidden="true" /> Ir a Solicitudes para crear una COT
          </Link>
        )}
      </div>
    );
  }, [estado.q, estado.vista]);

  // ── B4 T9, bloque 3: la tabla (las columnas son constantes del módulo; sus celdas piden lo suyo por AccionesLista) ──
  const abrirCotizacion = useCallback((cot: { id: number }) => router.push(`/dashboard/ventas/cotizacion/${cot.id}`), [router]);
  const accionesFila = useMemo<AccionesFilaCOT>(() => ({ abrir: abrirCotizacion, ir: (ruta) => router.push(ruta) }), [abrirCotizacion, router]);

  // ── B4 T9, bloque 4: el tablero (KANBAN-ventas-listas punto 6; C15, R11; RP16, D11, D39) ──
  // reglaSoltarCotizacion sin puedeEnviar (D11): soltar en «Esperando al cliente» queda bloqueado con «Ábrela para
  // enviar.» y el enlace a la cotización; no se arma otro ChannelModal ni otro POST. C15(a): sacarla de «Esperando» o de
  // «Confirmada» queda bloqueado con «Ábrela para re-cotizar; te pedirá la razón.».
  // 'cambio' (Rechazada → Borrador, Borrador → Vencida…): el PATCH del estado. El tablero mueve la tarjeta y, si el
  // servidor la rechaza (N7: el 409 de otra activa), la devuelve con su mensaje; recarga su origen y su destino (D39) y
  // aquí se recargan las tarjetas de arriba y la franja.
  // B4 T24 f2 (FINAL-m9): si el PATCH falla (el 409 N7 de otra activa, un 400, un 422 o la red cortada), también con la regla única
  // recargarTrasError, y el error sigue para que el tablero deshaga.
  async function cambiarDesdeTablero(cot: FilaCOT, resultado: { estado: string }) {
    // B4 T24 f2 r1 (m28): la ruta de error, el ayudante puro cambiarConRegla (avisos.js).
    await cambiarConRegla(
      () => apiFetch(`/ventas/cotizaciones/${cot.id}`, {
        method: 'PATCH', body: JSON.stringify({ estado: resultado.estado, updated_by: autorActual() }),
      }),
      () => { recargarListado(); setRecargaFlujo((n) => n + 1); },
    );
  }
  // 'accion' 'rechazar': ModalMotivo (5 letras o más) → PATCH {estado: 'RECHAZADA'} y la nota «Motivo del rechazo: …» en
  // la Actividad (N3). Al terminar, del tablero solo su origen y su destino (D39), más las tarjetas y la franja.
  const [rechazando, setRechazando] = useState<{ cot: FilaCOT; columnas: ColumnasDeTarjeta } | null>(null);
  function accionDesdeTablero(cot: FilaCOT, resultado: { accion: string }, origen: string, destino: string) {
    if (resultado.accion === 'rechazar') setRechazando({ cot, columnas: [origen, destino] });
  }
  async function rechazarConMotivo(motivo: string) {
    if (!rechazando) return;
    const { cot, columnas } = rechazando;
    const autor = autorActual();
    // Si el servidor no la rechaza, ModalMotivo muestra su mensaje y conserva lo escrito. r1 (m1): con la regla única de
    // recargarTrasError (un 400, un 409, un 422 (F8) o la red cortada: algo cambió en otro lado, o el rechazo pudo quedar hecho) se
    // recargan la lista, el origen y el destino del tablero y la franja; el error sigue para que ModalMotivo lo muestre.
    try {
      await apiFetch(`/ventas/cotizaciones/${cot.id}`, { method: 'PATCH', body: JSON.stringify({ estado: 'RECHAZADA', updated_by: autor }) });
    } catch (err) {
      if (recargarTrasError(err)) {
        recargarListado();
        tablero.recargar([...columnas]);
        setRecargaFlujo((n) => n + 1);
      }
      throw err;
    }
    try {
      await apiFetch(`/ventas/cotizaciones/${cot.id}/actividad`, {
        method: 'POST', body: JSON.stringify({ action: 'NOTE_ADDED', description: `Motivo del rechazo: ${motivo}`, user_name: autor }),
      });
      avisar(`${cot.numero} rechazada`, { tono: 'ok' });
    } catch (err) {
      // El rechazo ya quedó hecho; el aviso dice que el motivo no quedó en la Actividad (como el Hub, N3).
      avisar(`${cot.numero} quedó rechazada, pero el motivo no quedó en la Actividad: ${textoDeError(err)}`, { tono: 'error' });
    }
    recargarListado();
    tablero.recargar([...columnas]);
    setRecargaFlujo((n) => n + 1);
  }

  // ── B4 T9, bloque 5: las tarjetas (KPI-ventas punto 8; R12, RP19) ──
  const tarjetas = tarjetasCotizaciones(listado.resumen);
  // En Lista son las pestañas (D41: accionPestana, como un clic en la pestaña); tocar la activa vuelve a Activas (la de
  // siempre, alternarPaso). En Kanban abren esa pestaña en Lista: el tablero muestra todas. Monto confirmado suma las
  // Confirmadas: abre esa pestaña. El total no tiene una vista: no es un botón (RP19 (5)).
  const vistaActiva = enKanban ? null : estado.vista;
  const elegirVista = (vista: string) => {
    const siguiente = enKanban ? vista : (alternarPaso(estado.vista, vista) ?? INICIAL_COT.vista);
    despachar(accionPestana(estado, siguiente, opcionesEstadosCotizaciones));
    if (enKanban) despachar({ tipo: 'modo', valor: 'lista' });
  };

  // ── B4 T9, bloque 6: la franja del flujo (FLUJO-ventas-pantallas C; R8, C3, D42, RP89) ──
  const pasosFlujo = useMemo(() => pasosDeLista(flujo.datos, 'COT'), [flujo.datos]);
  const atrasadosCOT = pasosFlujo.find((p) => p.esEste)?.atrasados ?? null;
  // Lo que decía el aviso ámbar de la lista: «N sin precio» (resumen.sin_calc) y «N vencen en 7 días»
  // (resumen.vencen_pronto, con valida_hasta del Bloque 3: RP89). Las cotizaciones sin atender son «Con atraso».
  const avisosFlujo = useMemo(() => avisosCotizaciones(listado.resumen), [listado.resumen]);
  // r1 (m6, CLS): los avisos salen de la lista, no de /ventas/flujo. Hasta que la lista responda (o falle), la franja
  // reserva su renglón (reservarAvisos): al llegar «N sin precio» o «N vencen en 7 días» no empujan las cajas ni lo de
  // abajo. Una recarga conserva lo último (el hook no vacía lo que se ve).
  // B4 T24 f2 (B14-f): con data.cotizaciones de /ventas/flujo (B14-b) se sabe antes si habrá avisos: el renglón se reserva solo si
  // alguno es > 0 (sin avisos no aparece ni desaparece); sin esa clave o mientras /ventas/flujo carga, como antes.
  const avisosPendientes = reservaAvisosCotizaciones(flujo.datos, listado.crudo === null && listado.error === null);
  const filtroSemaforo: FiltroSemaforo = estado.semaforo === 'atrasados' ? 'atrasados' : 'todos';
  // «Con atraso» pone semaforo=atrasados en el estado único (la tabla y el tablero lo mandan al servidor) y vuelve a la
  // página 1; «Ver todo» lo quita. Rechazadas nunca va atrasada: desde ahí abre Activas, también en Kanban (r2b de T8),
  // con la poda de las opciones del modo que se ve (en Kanban, las del tablero: su filtro se queda).
  const alFiltrarSemaforo = (f: FiltroSemaforo) => {
    if (f !== 'todos' && VISTAS_SIN_ATRASO.includes(estado.vista ?? '')) {
      despachar(accionPestana(estado, INICIAL_COT.vista, enKanban ? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones));
    }
    despachar({ tipo: 'semaforo', valor: f === 'todos' ? null : f });
  };
  const actualizando = listado.recargando || flujo.cargando;

  return (
    <div className="w-full bg-slate-50 min-h-full flex flex-col">
      {/* Sub-module nav */}
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/cotizacion" color="amber" hub={{ href: '/dashboard/ventas' }} />

      {/* B4 T9 (FLUJO-ventas-pantallas C; R8, D42, RP90): la franja del flujo reemplaza el aviso ámbar «ATENCIÓN —
          Cotizaciones requieren acción». «Estás aquí» en Cotización, con su detalle por estado (las etiquetas únicas de
          estados-cotizacion.js, las mismas de ESTADOS); las otras cajas llevan a su lista. «Con atraso» es
          semaforo=atrasados en el servidor, con los atrasados del paso Cotización (lo que el aviso llamaba «sin atender»);
          no hay «No resueltos» (la clave noResueltos no se escribe). Los avisos «N sin precio» y «N vencen en 7 días» son
          del resumen de la lista (no son botones: no hay una vista que los filtre). Va directo bajo la barra de
          submódulos, sin otro padding horizontal. */}
      <BannerFlujo
        titulo="Flujo comercial"
        idPreferencia={ID_COT}
        regla={textoRegla(flujo.datos?.dias_alerta)}
        semaforo={{ atrasados: atrasadosCOT, filtro: filtroSemaforo, onFiltrar: alFiltrarSemaforo }}
        pasos={pasosFlujo}
        avisos={avisosFlujo}
        reservarAvisos={avisosPendientes}
        cargando={flujo.cargando}
        error={flujo.error}
        onReintentar={flujo.recargar}
      />

      {/* B4 T9: el contenedor del Hub y de Solicitudes (T7 y T8, CONTENEDOR_LISTA). */}
      <div className={CONTENEDOR_LISTA}>
        {/* Header. B4 T9 (FLUJO-ventas-pantallas C.3): la frase corta, sin el código COT-YYYY####. R13 (ANALISIS-ventas
            punto 7): «Ver análisis» abre el Análisis del Hub enfocado en Cotizaciones (?tab=analisis&foco=cot). r1 (A2): los
            botones son AccionesCabecera, los mismos del esqueleto del Suspense. */}
        <PageHeader
          icon={FileText} color="amber"
          title="Cotizaciones"
          subtitle="Precios y anticipo para el cliente; al confirmar se crea el pedido."
          actions={<AccionesCabecera onActualizar={recargarLista} actualizando={actualizando} />}
        />

        {/* B4 T9 (KPI-ventas punto 8; R12, RP19): las 4 tarjetas iguales (sin el div a medida ni la variante gradient),
            con con_resumen de la MISMA llamada de la lista (todas las cotizaciones): mientras cargan, barras grises (nunca 0);
            con error, «—». Activas y Confirmadas son sus pestañas y Monto confirmado abre Confirmadas (accionPestana; tocar
            la activa vuelve a Activas); el total no tiene una vista (RP19 (5)). */}
        <FranjaKpis estado={estadoConteos} titulo="Cotizaciones">
          <TarjetaKpi kpi="cot_activas" valor={tarjetas?.activas.valor ?? null} ayuda={tarjetas?.activas.ayuda}
            activo={vistaActiva === 'activas'} onClick={() => elegirVista('activas')} />
          <TarjetaKpi kpi="cot_confirmadas" valor={tarjetas?.confirmadas.valor ?? null} ayuda={tarjetas?.confirmadas.ayuda}
            activo={vistaActiva === 'confirmadas'} onClick={() => elegirVista('confirmadas')} />
          <TarjetaKpi kpi="cot_monto_confirmado" valor={tarjetas?.monto_confirmado.valor ?? null} ayuda={tarjetas?.monto_confirmado.ayuda}
            activo={vistaActiva === 'confirmadas'} onClick={() => elegirVista('confirmadas')} />
          <TarjetaKpi kpi="cot_total" valor={tarjetas?.total.valor ?? null} ayuda={tarjetas?.total.ayuda} />
        </FranjaKpis>

        {/* B4 T9 (TABLA-listas-ventas punto 6, KANBAN-ventas-listas punto 6): la barra y la tabla estándar, o el tablero
            en modo servidor, con el MISMO estado (búsqueda, estados y semáforo). Se fue la pestaña Análisis (R13): en ella
            ya no se pinta la tabla. */}
        <div className="flex min-w-0 flex-col gap-4">
          {capa}
          <AccionesLista.Provider value={accionesFila}>
            <section ref={refTarjeta} className={claseTarjeta}>
              {/* Las pestañas con los conteos del servidor (en Kanban no se pintan: el tablero muestra todas, D-T8-3); la
                  búsqueda va al servidor (número, cliente, cotizador, la SC, el pedido y el producto, T6B); «Filtrar
                  Estado» (H15) es FiltroEstados con las etiquetas de estados-cotizacion.js y solo los de la pestaña; los
                  dos botones de vista sin onClick (H17) son ConmutadorVista. */}
              <BarraTabla
                estado={estado}
                onEstado={alCambiarBarra}
                pestanas={enKanban ? undefined : pestanas}
                estadoConteos={estadoConteos}
                placeholder="Buscar por número, cliente, cotizador, solicitud, pedido o producto…"
                opcionesEstados={enKanban ? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones}
                ajustes={{ columnas: COLUMNAS_TABLA_COT, preferencias: prefs, anchoRef: anchoTablaRef }}
                kanbanDisponible
                pantallaCompleta={enKanban ? undefined : { completa, alternar }}
                {...totalDeLaBarra}
              />
              {/* B4 T9, la tabla estándar en el servidor (TABLA-listas-ventas punto 6; R26, D41): la paginación, el
                  tamaño (25 o 50) y el orden son de la tabla (se fue la paginación propia, con su «Total activas»); la
                  fila atrasada en filaAlerta; un clic en la fila (o «Ver») abre la cotización. */}
              {!enKanban && (
                <TablaEstandar
                  id={ID_COT}
                  modo="servidor"
                  columnas={COLUMNAS_TABLA_COT}
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
                  onFila={abrirCotizacion}
                  claseFila={claseDeFila}
                  vacio={vacioLista}
                  etiqueta="Cotizaciones"
                />
              )}
            </section>
          </AccionesLista.Provider>
          {/* B4 T9, el tablero (KANBAN-ventas-listas punto 6): Borrador · Esperando al cliente · Confirmada · Vencida ·
              Rechazada (plegada). Lo que no se puede queda bloqueado con su motivo ANTES de soltar (reglaSoltarCotizacion). */}
          {enKanban && (
            // B4 T24 r2 (m2, m10): mientras se lee el rol, el esqueleto (sin acciones) en lugar del tablero.
            !accesoTablero.listo ? <EsqueletoTablero /> : <TableroKanban
              tablero={tablero}
              regla={reglaSoltarCotizacion}
              tarjetaDe={tarjetaDeCOT}
              onAbrir={abrirCotizacion}
              onCambio={cambiarDesdeTablero}
              onAccion={accionDesdeTablero}
              soloLectura={accesoTablero.soloLectura}
              color="amber"
            />
          )}
        </div>
      </div>

      {/* B4 T9 (KANBAN-ventas-listas punto 6, N3): el motivo del rechazo desde el tablero (ModalMotivo, nunca prompt). */}
      {rechazando && (
        <ModalMotivo
          titulo={`Rechazar ${rechazando.cot.numero}`}
          // r1 (m4): con la COT de una solicitud, lo mismo que dice el detalle (avisoSolicitudTrasRechazo).
          efectos={['La cotización pasa a Rechazada.', avisoSolicitudTrasRechazo(rechazando.cot), 'El motivo queda en la Actividad de la cotización.']
            .filter((e): e is string => Boolean(e))}
          textoConfirmar="Rechazar cotización"
          placeholder="Por qué se rechaza la cotización…"
          onConfirmar={rechazarConMotivo}
          onCerrar={() => setRechazando(null)}
        />
      )}
    </div>
  );
}

