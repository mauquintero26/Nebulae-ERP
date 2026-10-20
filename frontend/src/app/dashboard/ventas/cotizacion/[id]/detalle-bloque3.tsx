'use client';

import { Send } from 'lucide-react';
import { Button } from '@/components/ui';
import { ivaDeLinea, filasIvaTotales } from '@/lib/iva';
import { textoValidezCotizacion } from '@/lib/documento-comercial';
import { textoSeguimiento } from '@/lib/seguimiento';
import { formatoPesos } from '@/lib/pesos';
import { NextStepCard } from '../../flujo';
import { TarjetaSeguimiento } from '../../seguimiento';

/** r1: la ayuda de la tarjeta Pendiente para quien puede reenviar (nota del controlador tras T7). */
export const AYUDA_REENVIAR_COT = 'Si el enlace venció, se anuló o no le llegó, reenvía la cotización al cliente.';

// B3 T17: las piezas nuevas del detalle de la cotización (cotizacion/[id]/page.tsx solo las cablea, R15). Toda la
// lógica y los textos vienen de lib/iva.js, lib/documento-comercial.js y lib/seguimiento.js (probadas con node).

type Monto = number | string | null | undefined;
/** Una línea guardada de la cotización (GET /ventas/cotizaciones/{id}, productos[i]). */
type LineaGuardada = { qty?: Monto; unit_price_cop?: Monto; total_cop?: Monto; [clave: string]: unknown };
/** Lo que leen estas piezas del detalle de la cotización (el GET, con el desglose del IVA de T4). */
type CotizacionDetalle = {
  id?: number | string | null; subtotal_cop?: Monto; descuento_pct?: Monto; descuento_cop?: Monto;
  iva_discriminado?: boolean; valida_hasta?: string | null; seguimiento?: unknown; [clave: string]: unknown;
};

/**
 * IVA punto 11: el bloque derecho de la tarjeta de un producto, sin el anticipo por línea (U19, que sigue debajo en la
 * página). Con tarifa: 'Cant. 6 × $206.769 sin IVA', '{etiqueta} · $235.717' (y 'Descuento −$X' si lo hay) y, en grande,
 * el total con IVA. Sin tarifa, como antes y con 'IVA no discriminado' en gris; una línea en $0, como antes.
 */
export function PrecioLineaIva({ item }: { item: LineaGuardada }) {
  const iva = ivaDeLinea(item);
  if (iva?.discriminado) {
    return (
      <>
        <p className="text-xs text-slate-400">{iva.cantidad}</p>
        <p className="text-xs font-semibold text-slate-500">
          {iva.iva}
          {iva.descuento && <span className="whitespace-nowrap"> · {iva.descuento}</span>}
        </p>
        <p className="font-black text-slate-900 text-lg">{formatoPesos(iva.total_con_iva_cop)}</p>
      </>
    );
  }
  return (
    <>
      <p className="text-xs text-slate-400">Cant. {item.qty ?? 0} &times; {formatoPesos(item.unit_price_cop)}</p>
      <p className="font-black text-slate-900 text-lg">{formatoPesos(item.total_cop != null ? item.total_cop : (Number(item.unit_price_cop) || 0) * (Number(item.qty) || 0))}</p>
      {iva && <p className="text-[11px] text-slate-400">{iva.texto}</p>}
    </>
  );
}

/**
 * IVA punto 11: los renglones de TOTALES antes de TOTAL: Subtotal (sin IVA), Descuento (x%) con descuento_cop del GET
 * (ya no subtotal − total, que con IVA da mal) y un renglón por tarifa ('IVA 19% sobre $1.537.753' · '$292.173'). Una
 * cotización vieja dice 'IVA no discriminado' (filasIvaTotales); B3 T19 r1: si tiene IVA guardado (tax_cop > 0), 'IVA
 * sobre $X' con su valor, como su documento del cliente. También lo usa el pedido de venta (venta/[id]).
 */
export function TotalesIvaCotizacion({ cotizacion }: { cotizacion: CotizacionDetalle | null }) {
  return (
    <div className="space-y-3 mb-4">
      <div className="flex justify-between items-center gap-2">
        <span className="text-sm font-bold text-slate-500">{cotizacion?.iva_discriminado ? 'Subtotal (sin IVA)' : 'Subtotal'}</span>
        <span className="font-bold text-slate-800 shrink-0">{formatoPesos(cotizacion?.subtotal_cop)}</span>
      </div>
      <div className="flex justify-between items-center gap-2">
        <span className="text-sm font-bold text-slate-500">Descuento ({Number(cotizacion?.descuento_pct) || 0}%)</span>
        <span className="font-bold text-slate-800 shrink-0">{formatoPesos(cotizacion?.descuento_cop)}</span>
      </div>
      {filasIvaTotales(cotizacion).map(f => (
        <div key={f.clave} className="flex justify-between items-center gap-2">
          <span className={`text-sm font-bold ${f.valor === null ? 'text-slate-400' : 'text-slate-500'}`}>{f.etiqueta}</span>
          {f.valor !== null && <span className="font-bold text-slate-800 shrink-0">{formatoPesos(f.valor)}</span>}
        </div>
      ))}
    </div>
  );
}

/**
 * U22-validez punto 9, U16-reenvio-cot (C13) y U16-seguimiento punto 10: «Siguiente paso» de una cotización que espera
 * al cliente (sin pedido vigente). Dice hasta cuándo puede confirmar (o que el enlace venció, en ámbar), muestra el
 * recordatorio (TarjetaSeguimiento, en `actions`: es un bloque) y el botón «Reenviar al cliente» para los roles que
 * pueden enviarla (el POST exige ADMIN o ASESOR). Ya no manda a pasarla a Borrador para reenviarla.
 */
export function PasoEsperandoConfirmacion({ cotizacion, puedeReenviar, enviando, onReenviar, onCambio }: {
  cotizacion: CotizacionDetalle;
  puedeReenviar: boolean;
  enviando: boolean;
  onReenviar: () => void;
  /** Recarga la cotización (el «No enviar recordatorios» deja su renglón en la Actividad). */
  onCambio: () => void;
}) {
  const validez = textoValidezCotizacion(cotizacion?.valida_hasta);
  const conRecordatorio = textoSeguimiento(cotizacion?.seguimiento) !== null;
  return (
    <NextStepCard
      tone={validez?.vencida ? 'amber' : 'blue'}
      title="Esperando confirmación del cliente"
      actions={conRecordatorio || puedeReenviar ? (
        <>
          <TarjetaSeguimiento tipoDoc="COT" doc={cotizacion} onCambio={onCambio} />
          {puedeReenviar && (
            <Button color="blue" size="lg" icon={Send} loading={enviando} onClick={onReenviar}>Reenviar al cliente</Button>
          )}
        </>
      ) : undefined}
    >
      Cuando el cliente confirme desde el enlace, aquí aparecerá &ldquo;Crear Pedido de Venta&rdquo;.
      {validez ? ` ${validez.texto}` : ''}
      {/* r1 (nota tras T7): la ayuda de reenviar, para quien puede hacerlo (el enlace pudo anularse sin que la COT cambie
          de estado, p. ej. al cambiar los datos del cliente en la solicitud). */}
      {puedeReenviar ? ` ${AYUDA_REENVIAR_COT}` : ''}
    </NextStepCard>
  );
}
