'use client';

import { TARIFAS_IVA, etiquetaCortaTarifaIva, filasIvaTotales } from '@/lib/iva';
import { avisoTarifaProducto } from '@/lib/pricing';
import { formatoPesos } from '@/lib/pesos';

// B3 T17 (IVA puntos 10 y 13; R8): las piezas del IVA de la calculadora de la cotización (CalculadorModal) y del
// Cotizador Rápido. Toda la lógica viene de lib/iva.js y lib/pricing.js (probadas con node); aquí solo se pinta.

/** Los totales de lib/iva.js (calcularTotalesCotizacion), o null con una línea incompleta. */
export type TotalesIva = {
  lineas: Array<{ iva_tarifa: string; total_cop: number; iva_cop: number; [clave: string]: unknown }>;
  subtotal_cop: number; descuento_cop: number; iva_cop: number; total_cop: number;
  iva_por_tarifa: Array<{ tarifa: string; etiqueta: string; base_cop: number; iva_cop: number }>;
};
/** Lo que la celda IVA lee de una fila de la calculadora. */
type FilaConTarifa = { iva_tarifa?: string; product_name?: string; sku_id?: number | string | null; _tarifaProducto?: string | null };
/** El resultado de totalesIvaCalculadora / intentarTotalesCotizacion: con error, totales es null (y se ve «—»). */
export type IvaCalculado = { totales: TotalesIva | null; error: string };

/** '$1.062.523', o '—' sin monto (mientras haya una línea incompleta). */
export const pesosOGuion = (v: number | null | undefined) => (v === null || v === undefined ? '—' : formatoPesos(v));

const CLASES_SELECT = 'w-full min-w-0 border border-slate-200 rounded px-1.5 py-1 font-bold bg-white outline-none focus:ring-1 focus:ring-amber-200';

/** El selector de la tarifa: 19% / 5% / Exento / Excluido (etiquetaCortaTarifaIva). */
export function SelectTarifaIva({ valor, onCambio, etiqueta, id, className = CLASES_SELECT }: {
  valor: string;
  onCambio: (tarifa: string) => void;
  /** El nombre accesible (aria-label) cuando no hay un <label> con htmlFor. */
  etiqueta?: string;
  id?: string;
  className?: string;
}) {
  return (
    <select id={id} aria-label={etiqueta} value={valor} onChange={e => onCambio(e.target.value)} className={className}>
      {TARIFAS_IVA.map(t => <option key={t.codigo} value={t.codigo}>{etiquetaCortaTarifaIva(t.codigo)}</option>)}
    </select>
  );
}

/**
 * La celda «IVA» de una fila: el selector, debajo el IVA de la línea ('+$235.717', o '—') y, en ámbar, «El producto
 * tiene IVA 5%» si la tarifa no es la del producto del catálogo (avisoTarifaProducto).
 */
export function CeldaIvaLinea({ fila, ivaLinea, onCambio }: {
  fila: FilaConTarifa;
  ivaLinea: number | null | undefined;
  onCambio: (tarifa: string) => void;
}) {
  const aviso = avisoTarifaProducto(fila);
  return (
    <div className="min-w-[84px] space-y-0.5">
      <SelectTarifaIva valor={fila.iva_tarifa ?? ''} onCambio={onCambio}
        etiqueta={`IVA de ${fila.product_name || 'la línea'}`} />
      <p className="text-[10px] font-bold text-slate-500 text-right">
        {ivaLinea === null || ivaLinea === undefined ? '—' : `+${formatoPesos(ivaLinea)}`}
      </p>
      {aviso && <p className="text-[10px] font-bold text-amber-700 leading-tight">{aviso}</p>}
    </div>
  );
}

/**
 * Subtotal, Descuento (x%), un renglón por tarifa ('IVA 19% sobre $1.537.753' · '$292.173') y TOTAL (con IVA) de la
 * calculadora. Con una línea incompleta, las cifras en «—» y el mensaje (el mismo del 422) en línea, aquí.
 */
export function TotalesCalculadoraIva({ iva, descuentoPct }: { iva: IvaCalculado; descuentoPct: number }) {
  const t = iva.totales;
  return (
    <>
      <div className="flex justify-between text-sm">
        <span className="text-slate-600 font-medium">Subtotal</span>
        <span className="font-bold">{pesosOGuion(t?.subtotal_cop)}</span>
      </div>
      {descuentoPct > 0 && (
        <div className="flex justify-between text-sm text-red-600">
          <span className="font-medium">Descuento ({descuentoPct}%)</span>
          <span className="font-bold">{t ? `-${formatoPesos(t.descuento_cop)}` : '—'}</span>
        </div>
      )}
      {t && filasIvaTotales(t).map(f => (
        <div key={f.clave} className="flex justify-between gap-3 text-sm">
          <span className="text-slate-600 font-medium">{f.etiqueta}</span>
          <span className="font-bold shrink-0">{pesosOGuion(f.valor)}</span>
        </div>
      ))}
      <div className="flex justify-between text-base border-t border-amber-200 pt-2">
        <span className="font-black text-slate-800">TOTAL (con IVA)</span>
        <span className="font-black text-amber-700 text-lg">{pesosOGuion(t?.total_cop)}</span>
      </div>
      {iva.error && (
        <p role="alert" className="text-xs text-red-600 font-bold bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {iva.error}
        </p>
      )}
    </>
  );
}
