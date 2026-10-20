'use client';

import { useState, useEffect, useCallback, useRef, useMemo, useId } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import {
  FileText, CheckCircle2, DollarSign, Activity,
  Search, X, RefreshCw, AlertCircle, AlertTriangle, MoreVertical, Plus,
  Phone, Mail, ShieldAlert,
  Calculator, Send, Trash2, Save, ArrowRight,
  MessageCircle, RotateCcw
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
import { PanelAnularConfirmacion, tituloAnulacion } from './anular-confirmacion';
import type { AnulacionConfirmacion } from './anular-confirmacion';
import { CeldaIvaLinea, TotalesCalculadoraIva, pesosOGuion } from './calculadora-iva';
import type { EnvioWhatsAppCanal } from './estado-envio-whatsapp';
import {
  METODOS_PAGO_ANTICIPO, formatoPct, porcentajeDePesos, hoyLocal, origenAnticipo, cuentaVerificacion,
  evaluarVerificacion, verificacionParaEnviar, validarAjusteAnticipo, resumenAnticipoCotizacion, montoDesdeTexto,
  creditoPorRecotizacion, anticipoDeCalculadora,
} from '@/lib/dinero-ventas';
import {
  diasAlerta, pedidoVigente, soloPedidosCancelados, ultimoPedidoCancelado, pestanaCotizacion, situacionPedidoCotizacion,
} from '@/lib/listas-ventas';
import { SubNav, PageHeader, StatCard, Modal, Button, EmptyState } from '@/components/ui';
import { VEN_NAV } from '../ven-nav';
import { ChipCambiosCliente } from '../chip-cambios-cliente';

export const ESTADOS: Record<string, { label: string; color: string; bg: string; border: string }> = {
  BORRADOR:              { label: 'Borrador',              color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' },
  ENVIADA:               { label: 'Enviada al cliente',    color: '#92400e', bg: '#fef3c7', border: '#fde68a' },
  PENDIENTE_CONFIRMACION:{ label: 'Esp. confirmación',     color: '#1d4ed8', bg: '#eff6ff', border: '#bfdbfe' },
  CONFIRMADA:            { label: 'Confirmada',            color: '#065f46', bg: '#f0fdf4', border: '#a7f3d0' },
  RECHAZADA:             { label: 'Rechazada',             color: '#991b1b', bg: '#fef2f2', border: '#fecaca' },
  VENCIDA:               { label: 'Vencida',               color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe' },
};

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
const isOverdue = (iso: string | null | undefined) => iso ? new Date(iso) < new Date() : false;
const isExpiringSoon = (iso: string | null | undefined) => {
  if (!iso) return false;
  const d = new Date(iso), now = new Date();
  return d >= now && (d.getTime() - now.getTime()) / 86400000 <= 7;
};

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
    <Modal title="Calculadora de Cotización" subtitle={`${cot.numero} — ${cot.customer_name}`}
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
            <p id={notasAyudaId} className="text-[11px] text-slate-500 mt-1">El cliente verá esta nota</p>
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
  const { pagado: yaPagado, credito: creditoAFavor } = creditoPorRecotizacion(pven, totalNuevo);
  return (
    <Modal title="Actualizar Pedido de Venta" icon={RotateCcw} color="indigo" maxWidth="md" onClose={onCancel}
      footer={(
        <div className="flex flex-col w-full gap-2">
          <Button color="indigo" disabled={saving} onClick={onConfirm}>Sí, actualizar también el pedido</Button>
          <Button variant="secondary" disabled={saving} onClick={onCancel}>Solo guardar la cotización</Button>
        </div>
      )}>
      <p className="text-slate-500 text-sm">
        Esta cotización ya tiene el pedido <strong>{pven?.numero}</strong> generado. Los nuevos precios no se
        reflejan allí automáticamente.
      </p>
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex items-center justify-center gap-3 text-sm">
        <span className="text-slate-400 line-through">{fCOP(totalAnterior)}</span>
        <ArrowRight size={14} className="text-slate-400"/>
        <span className="font-black text-indigo-700">{fCOP(totalNuevo)}</span>
      </div>
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
export function ChannelModal({ selectedChannel, onSelectChannel, onConfirm, onCancel, saving, customerHasPhone, documentLabel = 'cotización', customerEmail, textoSinTelefono = 'sin teléfono', envioWhatsApp = null, nota, error }: {
  selectedChannel: 'WhatsApp'|'Email'|'Otro'|null; onSelectChannel: (ch: 'WhatsApp'|'Email'|'Otro') => void; onConfirm: () => void;
  onCancel: () => void; saving: boolean; customerHasPhone: boolean; documentLabel?: string; customerEmail?: string | null;
  textoSinTelefono?: string; envioWhatsApp?: EnvioWhatsAppCanal | null; nota?: string; error?: string;
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
      {/* r1 (lección de T16/T17): la región viva siempre montada; solo cambia su contenido. */}
      <div role="alert">{error ? <p className="text-xs font-bold text-rose-700 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{error}</p> : null}</div>
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
    <Modal title="Verificar el pago del anticipo" subtitle={`${cot.numero} — ${cot.customer_name || ''}`}
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
    <Modal title="Ajustar anticipo" subtitle={`${cot.numero} — total ${fCOP(cot.total_cop)}`}
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

// â”€â”€ Main Component â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
export default function CotizacionClient() {
  const router = useRouter();
  const [cotizaciones, setCotizaciones] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('Activas');
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [alertDias, setAlertDias] = useState(2);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [d, cfg] = await Promise.all([
        apiFetch('/ventas/cotizaciones?limit=200'),
        apiFetch('/ventas/config').catch(() => ({})),
      ]);
      setCotizaciones(Array.isArray(d) ? d : (d?.data ?? []));
      // N8: GET /ventas/config responde {status, data: {clave: {value}}} (cualquier rol lo lee): diasAlerta lo interpreta y, sin valor valido, usa 2.
      setAlertDias(diasAlerta(cfg, 'alerta_cot_dias'));
    } catch { setCotizaciones([]); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const searchParams = useSearchParams();
  // Compatibilidad con enlaces antiguos que abrian el detalle con ?id= (Hub, SC, PVEN):
  // se redirige a la pagina canonica de detalle en vez de duplicar la vista aqui.
  useEffect(() => {
    const idParam = searchParams?.get('id');
    if (idParam) { const numId = Number(idParam); if (!isNaN(numId)) router.replace(`/dashboard/ventas/cotizacion/${numId}`); }
  }, [searchParams, router]);

  // Derived stats -- COT-LISTA: una CONFIRMADA cuyo pedido se cancelo vuelve a 'Activas' (se ajusta y se reenvia)
  // y no suma en 'Confirmadas' ni en 'Monto Confirmado'.
  const activas     = cotizaciones.filter(c => pestanaCotizacion(c) === 'Activas');
  const confirmadas = cotizaciones.filter(c => pestanaCotizacion(c) === 'Confirmadas');
  const rechazadas  = cotizaciones.filter(c => pestanaCotizacion(c) === 'Rechazadas');
  const conPedido   = confirmadas.filter(c => pedidoVigente(c));
  const porConvertir= confirmadas.length - conPedido.length;
  const sinCalc     = activas.filter(c => !(c.total_cop > 0)).length;
  const vencenPronto= activas.filter(c => isExpiringSoon(c.fecha_entrega_estimada)).length;
  const montoTotal  = confirmadas.reduce((s, c) => s + (Number(c.total_cop) || 0), 0);
  const sinAtender  = activas.filter(c => {
    const ms = (Date.now() - new Date(c.updated_at || c.created_at).getTime());
    return ms / 3600000 > alertDias * 24;
  }).length;

  const filtered = cotizaciones.filter(c => {
    const ms = !search || JSON.stringify(c).toLowerCase().includes(search.toLowerCase());
    if (!ms) return false;
    if (activeTab === 'Activas' || activeTab === 'Confirmadas' || activeTab === 'Rechazadas') return pestanaCotizacion(c) === activeTab;
    return true;
  });

  return (
    <div className="w-full bg-slate-50 min-h-full animate-in fade-in">

      {/* Sub-module nav */}
      <SubNav label="Hub Ventas" items={VEN_NAV} currentPath="/dashboard/ventas/cotizacion" color="amber" hub={{ href: '/dashboard/ventas' }} />

      {/* Alert Banner */}
      {(sinCalc > 0 || vencenPronto > 0 || sinAtender > 0) && (
        <div className="bg-amber-50 border-b border-amber-200 px-6 py-3 flex items-start gap-4">
          <ShieldAlert className="text-amber-600 shrink-0 mt-0.5" size={20} />
          <div className="flex-1">
            <h4 className="text-sm font-black text-amber-800">ATENCIÓN — Cotizaciones requieren acción (Alerta {alertDias} días)</h4>
            <p className="text-xs font-bold text-amber-700 mt-1">
              {sinAtender > 0 && `* ${sinAtender} cotización(es) sin atender más de ${alertDias} días `}
              {sinCalc > 0 && `* ${sinCalc} sin calcular / sin precio `}
              {vencenPronto > 0 && `* ${vencenPronto} vence(n) en los próximos 7 días `}
            </p>
          </div>
          <button onClick={load} className="bg-amber-600 text-white px-4 py-2 rounded-lg text-xs font-bold hover:bg-amber-700 shrink-0">Actualizar</button>
        </div>
      )}

      <div className="p-8 max-w-[1600px] mx-auto space-y-8">

        {/* Header */}
        <PageHeader
          icon={FileText} color="amber"
          title="Cotizaciones"
          subtitle="COT-YYYY#### — Genera precios, envía al cliente y confirma para crear Pedido de Venta."
          actions={(
            <div className="flex gap-3">
              <button onClick={load} className="bg-white border border-slate-200 px-4 py-2.5 rounded-xl font-bold text-slate-600 hover:bg-slate-50 flex items-center gap-2 text-sm shadow-sm">
                <RefreshCw size={15} className={loading ? 'animate-spin' : ''}/> Actualizar
              </button>
              <Link href="/dashboard/ventas/solicitud" className="bg-amber-600 hover:bg-amber-700 text-white px-6 py-2.5 rounded-xl font-bold shadow-md flex items-center gap-2 text-sm">
                <Plus size={16}/> Nueva desde SC
              </Link>
            </div>
          )}
        />

        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <StatCard icon={FileText} color="amber" label="Activas" value={activas.length}
            hint={sinCalc > 0 ? `${sinCalc} sin precio` : 'Todas calculadas'}
            onClick={() => setActiveTab('Activas')} />

          <StatCard icon={CheckCircle2} color="emerald" label="Confirmadas" value={confirmadas.length}
            hint={confirmadas.length === 0 ? 'Sin confirmadas' : porConvertir > 0 ? `${conPedido.length} con pedido de venta · ${porConvertir} por convertir` : 'Todas con pedido de venta'}
            onClick={() => setActiveTab('Confirmadas')} />

          {/* Sin acento neutro/gris disponible en AccentColor -- se deja a medida para
              conservar la misma paleta (slate) en vez de forzar un color del hub. */}
          <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm group cursor-pointer hover:border-slate-300 transition-all">
            <div className="w-12 h-12 rounded-xl bg-slate-50 flex items-center justify-center text-slate-600 mb-4 group-hover:scale-110 transition-transform">
              <DollarSign size={24}/>
            </div>
            <p className="text-xs font-black text-slate-400 uppercase tracking-wider mb-1">Monto Confirmado</p>
            <h2 className="text-xl font-black text-slate-800">{fCOP(montoTotal)}</h2>
            <p className="text-xs font-bold text-slate-400 mt-2">{conPedido.length} con pedido de venta vigente</p>
          </div>

          <StatCard icon={Activity} color="amber" variant="gradient" label="Total Cotizaciones" value={cotizaciones.length}
            hint={`${rechazadas.length} rechazadas`}
            onClick={() => setActiveTab('Activas')} />
        </div>

        {/* Main Table */}
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col overflow-hidden">
          {/* ROW 1: TABS + VIEW TOGGLE */}
          <div className="flex items-center justify-between pt-1 pb-0">
            <div className="flex items-center gap-1 overflow-x-auto">
              {(['Activas','Confirmadas','Rechazadas','Analisis'] as const).map(tab=>(
                <button key={tab} onClick={()=>setActiveTab(tab as any)}
                  className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${activeTab===tab?'bg-indigo-600 text-white shadow-sm':'text-gray-600 hover:text-indigo-700 hover:bg-indigo-50'}`}>
                  {tab === 'Analisis' ? 'Análisis' : tab}
                  {tab!=='Analisis'&&<span className={`ml-1.5 text-xs font-black ${activeTab===tab?'text-indigo-200':'text-gray-400'}`}>
                    {tab==='Activas'?activas.length:tab==='Confirmadas'?confirmadas.length:rechazadas.length}
                  </span>}
                </button>
              ))}
            </div>
            {activeTab!=='Analisis'&&(
              <div className="flex items-center gap-1 shrink-0 ml-4">
                <button className="p-2 rounded-lg border bg-indigo-50 border-indigo-200 text-indigo-700">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="7" width="14" height="2" rx="1" fill="currentColor"/><rect x="1" y="11" width="14" height="2" rx="1" fill="currentColor"/></svg>
                </button>
                <button className="p-2 rounded-lg border border-gray-200 text-gray-400 hover:bg-gray-50">
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="1" y="1" width="6" height="14" rx="1.5" fill="currentColor"/><rect x="9" y="1" width="6" height="14" rx="1.5" fill="currentColor"/></svg>
                </button>
              </div>
            )}
          </div>

          {/* ROW 2: SEARCH + FILTER + COUNT */}
          {activeTab!=='Analisis'&&(
            <div className="flex items-center gap-3 pt-3 pb-1 border-t border-slate-100 mt-3">
              <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-2 gap-2 flex-1 max-w-[420px] shadow-sm focus-within:border-amber-400 focus-within:ring-2 focus-within:ring-amber-100">
                <Search className="text-slate-400 shrink-0" size={14}/>
                <input type="text" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Buscar COT, cliente, SC, producto..." className="w-full bg-transparent text-sm font-medium text-slate-700 outline-none placeholder-slate-400"/>
                {search&&<button onClick={()=>setSearch('')}><X size={13} className="text-slate-400 hover:text-slate-600"/></button>}
              </div>
              <button onClick={load} className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-semibold hover:bg-slate-50 shadow-sm">
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M1 3h12M3 7h8M5 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>
                Filtrar Estado
              </button>
              <span className="text-sm text-slate-400 font-medium">{filtered.length} registros</span>
            </div>
          )}



          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">COT / SC</th>
                  <th className="px-6 py-4">Cliente</th>
                  <th className="px-6 py-4">Cotizador</th>
                  <th className="px-6 py-4">Total</th>
                  <th className="px-6 py-4">Anticipo</th>
                  <th className="px-6 py-4">Entrega Est.</th>
                  <th className="px-6 py-4">Estado</th>
                  <th className="px-6 py-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50 text-sm">
                {loading ? (
                  <tr><td colSpan={8} className="px-6 py-16 text-center">
                    <RefreshCw size={24} className="animate-spin text-amber-400 mx-auto mb-2"/>
                    <p className="text-slate-400">Cargando cotizaciones...</p>
                  </td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={8}>
                    <EmptyState icon={FileText} message="No hay cotizaciones en esta categoría." />
                    {activeTab === 'Activas' && (
                      <div className="text-center pb-8 -mt-6">
                        <Link href="/dashboard/ventas/solicitud" className="inline-flex items-center gap-1 bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs hover:bg-amber-700">
                          <ArrowRight size={12}/> Ir a Solicitudes para crear una COT
                        </Link>
                      </div>
                    )}
                  </td></tr>
                ) : filtered.slice((currentPage-1)*pageSize, currentPage*pageSize).map(cot => {
                  const overdue = isOverdue(cot.fecha_entrega_estimada);
                  const expiring = isExpiringSoon(cot.fecha_entrega_estimada);
                  return (
                    <tr key={cot.id} onClick={() => router.push(`/dashboard/ventas/cotizacion/${cot.id}`)}
                      className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                      <td className="px-6 py-4">
                        <span className="font-black text-amber-700">{cot.numero}</span>
                        {cot.sc_numero && (
                          <p className="text-[10px] font-bold text-indigo-500 mt-0.5 flex items-center gap-1">
                            SC: {cot.sc_numero}
                          </p>
                        )}
                        {pedidoVigente(cot) ? (
                          <p className="text-[10px] font-bold text-emerald-600 mt-0.5">Pedido {pedidoVigente(cot)?.numero}</p>
                        ) : soloPedidosCancelados(cot) && situacionPedidoCotizacion(cot).avisoCancelado && (
                          // Una COT que el cliente volvio a confirmar ya no lleva la marca (igual que en su detalle).
                          <p className="text-[10px] font-bold text-rose-500 mt-0.5">Pedido {ultimoPedidoCancelado(cot)?.numero} cancelado</p>
                        )}
                      </td>
                      <td className="px-6 py-4">
                        <span className="font-bold text-slate-800">{cot.customer_name || '-'}</span>
                        {cot.customer_phone && (
                          <p className="text-[11px] text-slate-400">{cot.customer_phone}</p>
                        )}
                      </td>
                      <td className="px-6 py-4 text-slate-600 font-medium">{cot.cotizador || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="font-black text-slate-800">{fCOP(cot.total_cop)}</span>
                        {!(cot.total_cop > 0) && (
                          <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">Sin precio</span>
                        )}
                      </td>
                      <td className="px-6 py-4 font-bold text-slate-600">{fCOP(cot.anticipo_cop)}</td>
                      <td className="px-6 py-4">
                        <span className={`text-xs font-bold ${overdue ? 'text-red-600' : expiring ? 'text-amber-600' : 'text-slate-600'}`}>
                          {overdue && <AlertCircle size={11} className="inline mr-1"/>}
                          {fDate(cot.fecha_entrega_estimada)}
                        </span>
                      </td>
                      {/* B3 T18 r1 (H28-cambios, C9): junto al estado, «Cambios pedidos» si el cliente pidió cambios en su enlace. */}
                      <td className="px-6 py-4"><div className="flex flex-wrap items-center gap-1.5"><EstadoBadge estado={cot.estado}/><ChipCambiosCliente doc={cot} tipoDoc="COT"/></div></td>
                      <td className="px-6 py-4">
                        <div className="flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={e => { e.stopPropagation(); router.push(`/dashboard/ventas/cotizacion/${cot.id}`); }}
                            className="bg-amber-100 text-amber-700 hover:bg-amber-200 px-3 py-1.5 rounded text-xs font-bold flex items-center gap-1">
                            <FileText size={12}/> Ver
                          </button>
                          <button className="text-slate-400 hover:text-slate-700 p-1">
                            <MoreVertical size={15}/>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && activeTab !== 'Analisis' && (
            <div className="border-t border-slate-100 px-5 py-3 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center gap-3">
                <span className="text-xs font-bold text-slate-400">{filtered.length} registros</span>
                <select value={pageSize} onChange={e=>{setPageSize(Number(e.target.value));setCurrentPage(1);}} className="text-xs border border-slate-200 rounded-lg px-2 py-1 font-bold text-slate-600 outline-none focus:ring-1 focus:ring-amber-200">
                  <option value={25}>25 por página</option>
                  <option value={50}>50 por página</option>
                </select>
                <p className="text-xs font-black text-amber-700">
                  Total activas: {fCOP(activas.reduce((s, c) => s + (c.total_cop || 0), 0))}
                </p>
              </div>
              {Math.ceil(filtered.length/pageSize)>1&&(
                <div className="flex items-center gap-1">
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">«</button>
                  <button disabled={currentPage===1} onClick={()=>setCurrentPage(p=>p-1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">‹</button>
                  {Array.from({length:Math.min(5,Math.ceil(filtered.length/pageSize))},(_,i)=>{
                    const tp=Math.ceil(filtered.length/pageSize);let page=i+1;
                    if(tp>5){const half=2;const start=Math.max(1,Math.min(currentPage-half,tp-4));page=start+i;}
                    return <button key={page} onClick={()=>setCurrentPage(page)} className={`px-2.5 py-1 text-xs font-bold border rounded-lg ${currentPage===page?'bg-amber-600 text-white border-amber-600':'border-slate-200 hover:bg-slate-100'}`}>{page}</button>;
                  })}
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(p=>p+1)} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">›</button>
                  <button disabled={currentPage===Math.ceil(filtered.length/pageSize)} onClick={()=>setCurrentPage(Math.ceil(filtered.length/pageSize))} className="px-2 py-1 text-xs font-bold border border-slate-200 rounded-lg disabled:opacity-40 hover:bg-slate-100">»</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

    </div>
  );
}

