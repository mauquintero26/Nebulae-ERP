'use client';

import { useEffect, useId, useRef } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';
import { largoTexto } from '@/lib/chatter';

// H40 (R7) y U22-anticipo (B3 T17): el panel rosa que pide la razón antes de anular la confirmación del cliente (o
// dejar sin efecto el enlace que tiene). Es UNA sola ventana para los dos 409 ANULA_CONFIRMACION de la cotización: el de
// re-cotizar (CalculadorModal) y el de «Ajustar anticipo» (AjustarAnticipoModal); T18 lo usa en la solicitud. Salió de
// CalculadorModal sin cambiar su texto ni su forma; lo nuevo es el renglón del anticipo (detail.anticipo, nota tras T7).

/** Lo que trae el 409 ANULA_CONFIRMACION de PATCH /ventas/cotizaciones/{id} (T4/T7) en err.detail. `anticipo` (los
 * dos en pesos, '$600.000') llega cuando cambia el anticipo que el cliente vio (C18). */
export type AnulacionConfirmacion = {
  codigo?: string; estado?: string; cambios?: string[]; mensaje?: string;
  anticipo?: { antes?: string; despues?: string } | null;
};

/** La razón va de 5 a 500 caracteres (len() de Python, en puntos de código) y queda en la Actividad. */
export const RAZON_ANULAR_MIN = 5;
export const RAZON_ANULAR_MAX = 500;

/**
 * El título del panel según el caso (H40 rondas 1 y 2): pendiente (el estado del 409), figura confirmada sin la
 * confirmación del cliente vigente ('reabrir') o confirmada.
 */
export function tituloAnulacion(estado: string | null | undefined, devuelveABorrador: boolean): string {
  if (estado === 'PENDIENTE_CONFIRMACION') return 'Vas a dejar sin efecto el enlace que tiene el cliente';
  if (devuelveABorrador) return 'Vas a devolver la cotización a Borrador';
  return 'Vas a anular la confirmación del cliente';
}

/**
 * El panel (va en el pie de la ventana). La razón es controlada por quien lo monta (así sobrevive a «Seguir editando»);
 * `error` es el error del guardado, que se ve solo aquí dentro mientras el panel está abierto.
 */
export function PanelAnularConfirmacion({
  anulacion, titulo, razon, onRazon, saving, error, placeholder = 'Ej: el proveedor subió el precio', onSeguirEditando,
  onAnular,
}: {
  anulacion: AnulacionConfirmacion;
  titulo: string;
  razon: string;
  onRazon: (valor: string) => void;
  saving: boolean;
  error?: React.ReactNode;
  placeholder?: string;
  onSeguirEditando?: () => void;
  /** Con la razón ya sin los espacios de los bordes (como la valida el servidor). */
  onAnular: (motivo: string) => void;
}) {
  const razonId = useId();
  // r1 (accesibilidad): el panel aparece en lugar del botón que tenía el foco (que se desmonta); el foco pasa a la razón.
  const razonRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { razonRef.current?.focus(); }, []);
  // Como el servidor: sin los espacios de los bordes y en puntos de código (largoTexto, lección de T7/T8A).
  const largoRazon = largoTexto(razon.trim());
  const razonValida = largoRazon >= RAZON_ANULAR_MIN && largoRazon <= RAZON_ANULAR_MAX;
  const cambios = Array.isArray(anulacion.cambios) ? anulacion.cambios : [];
  const anticipo = anulacion.anticipo;
  return (
    <div className="w-full rounded-2xl border border-rose-200 bg-rose-50 p-4 space-y-3">
      <div role="alert" className="space-y-1">
        <p className="text-sm font-black text-rose-800 flex items-center gap-1.5">
          <AlertTriangle size={16} className="shrink-0" />
          {titulo}
        </p>
        {anulacion.mensaje && <p className="text-xs text-rose-700">{anulacion.mensaje}</p>}
        {cambios.length > 0 && (
          <p className="text-xs font-bold text-rose-800">Cambia: {cambios.join(', ')}</p>
        )}
        {anticipo?.antes && anticipo?.despues && (
          <p className="text-xs font-bold text-rose-800">El anticipo pasa de {anticipo.antes} a {anticipo.despues}.</p>
        )}
      </div>
      <div>
        <label htmlFor={razonId} className="text-xs font-black text-rose-800 mb-1 block">Razón del cambio (queda en la Actividad)</label>
        <textarea ref={razonRef} id={razonId} value={razon} onChange={e => onRazon(e.target.value)} rows={2}
          maxLength={RAZON_ANULAR_MAX} readOnly={saving} placeholder={placeholder}
          className="w-full border border-rose-200 bg-white rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-rose-200 focus:border-rose-400 outline-none" />
        <div className="flex justify-between gap-2 text-[11px] mt-1">
          <span className={largoRazon < RAZON_ANULAR_MIN ? 'font-bold text-rose-700' : 'text-slate-500'}>
            {largoRazon < RAZON_ANULAR_MIN
              ? `Mínimo ${RAZON_ANULAR_MIN} caracteres (llevas ${largoRazon}).`
              : 'Queda en la Actividad de la cotización con tu nombre.'}
          </span>
          <span className="text-slate-500 shrink-0">{largoRazon}/{RAZON_ANULAR_MAX}</span>
        </div>
      </div>
      {error}
      <div className="flex flex-wrap justify-end gap-3">
        <Button variant="secondary" disabled={saving} onClick={onSeguirEditando}>Seguir editando</Button>
        <Button color="rose" icon={AlertTriangle} loading={saving} disabled={!razonValida}
          onClick={() => onAnular(razon.trim())}>
          Guardar y anular la confirmación
        </Button>
      </div>
    </div>
  );
}
