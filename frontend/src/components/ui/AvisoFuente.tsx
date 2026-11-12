'use client';

import { avisoDeFuente } from '@/lib/avisos';
import { FOCOS } from '@/lib/design-system';
import type { AcentoFoco } from '@/lib/design-system';

/**
 * B4 T23B: el aviso de una fuente de una pantalla que falló (lib/avisos.js avisoDeFuente): una falla lleva el detalle del servidor y
 * «Reintentar»; un 403 es un tema de permiso y NO ofrece «Reintentar» (volver a pedir no lo cambia). Es la pieza común de
 * Seguimientos, Marketing, Campañas, Agenda, Asistente y E-Commerce. Se importa directo de '@/components/ui/AvisoFuente' (R18).
 */
export function AvisoFuente({ aviso, onReintentar, acento = 'rose' }: {
  aviso: NonNullable<ReturnType<typeof avisoDeFuente>>; onReintentar: () => void;
  /** B4 T24 (F46): el foco de «Reintentar» con el acento de la pantalla (aditivo; por defecto, rose). */
  acento?: AcentoFoco;
}) {
  const permiso = aviso.tipo === 'permiso';
  return (
    <div role={permiso ? 'status' : 'alert'} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${permiso ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      {aviso.texto}
      {aviso.reintentar && (
        <button type="button" onClick={onReintentar}
          className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 ${FOCOS[acento]}`}>
          Reintentar
        </button>
      )}
    </div>
  );
}

/**
 * B4 T24 (F46): el aviso de una fuente a partir de su error y del texto de la falla (avisoDeFuente → AvisoFuente); sin error, nada. Es
 * la pieza que usan el Dashboard y AvisoReintentar de Inventario: un 403 nunca ofrece «Reintentar».
 */
export function AvisoDeError({ error, fallo, onReintentar, acento }: { error: unknown; fallo: string; onReintentar: () => void; acento?: AcentoFoco }) {
  const aviso = avisoDeFuente(error, fallo);
  return aviso ? <AvisoFuente aviso={aviso} onReintentar={onReintentar} acento={acento} /> : null;
}
