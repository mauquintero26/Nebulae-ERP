'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { avisoDeFuente, focoTrasReintento } from '@/lib/avisos';
import { FOCOS } from '@/lib/design-system';
import type { AcentoFoco } from '@/lib/design-system';

/**
 * B4 T23B: el aviso de una fuente de una pantalla que falló (lib/avisos.js avisoDeFuente): una falla lleva el detalle del servidor y
 * «Reintentar»; un 403 es un tema de permiso y NO ofrece «Reintentar» (volver a pedir no lo cambia). Es la pieza común de
 * Seguimientos, Marketing, Campañas, Agenda, Asistente y E-Commerce. Se importa directo de '@/components/ui/AvisoFuente' (R18).
 */
export function AvisoFuente({ aviso, onReintentar, acento = 'rose', reintentando = false, alSoltarBoton }: {
  aviso: NonNullable<ReturnType<typeof avisoDeFuente>>; onReintentar: () => void;
  /** B4 T24 (F46): el foco de «Reintentar» con el acento de la pantalla (aditivo; por defecto, rose). */
  acento?: AcentoFoco;
  /** B4 T24 f3 r1 (m36, aditivo): mientras se reintenta, el botón dice «Reintentando…» con aria-disabled (no disabled: conserva el foco). */
  reintentando?: boolean;
  /** B4 T24 f3 r2 (m36, aditivo): se llama cuando el botón «Reintentar» se va del DOM, con si tenía el foco (para no dejarlo en el <body>). */
  alSoltarBoton?: (teniaFoco: boolean) => void;
}) {
  const permiso = aviso.tipo === 'permiso';
  // r2 (m36): un ref con limpieza (React 19): al quitarse el botón (sigue en el DOM en ese momento) se mira si tenía el foco.
  const refBoton = useCallback((nodo: HTMLButtonElement | null) => {
    if (!nodo || !alSoltarBoton) return undefined;
    return () => alSoltarBoton(document.activeElement === nodo);
  }, [alSoltarBoton]);
  return (
    <div role={permiso ? 'status' : 'alert'} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${permiso ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      {aviso.texto}
      {aviso.reintentar && (
        <button ref={refBoton} type="button" onClick={reintentando ? undefined : onReintentar} aria-disabled={reintentando || undefined}
          className={`inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 aria-disabled:cursor-wait aria-disabled:opacity-70 ${FOCOS[acento]}`}>
          {reintentando ? 'Reintentando…' : 'Reintentar'}
        </button>
      )}
    </div>
  );
}

/**
 * B4 T24 (F46): el aviso de una fuente a partir de su error y del texto de la falla (avisoDeFuente → AvisoFuente); sin error, nada. Es
 * la pieza que usan el Dashboard y AvisoReintentar de Inventario: un 403 nunca ofrece «Reintentar».
 */
export function AvisoDeError({ error, fallo, onReintentar, acento, reintentando = false, regionFoco = false }: {
  error: unknown; fallo: string; onReintentar: () => void; acento?: AcentoFoco;
  /** B4 T24 f3 r1 (m36, aditivo): true mientras se reintenta (la carga limpia el error). El aviso sigue montado con el último error y
   * «Reintentando…» (aria-disabled), como la línea de BannerFlujo: el foco no cae al <body>. */
  reintentando?: boolean;
  /** B4 T24 f3 r2 (m36 completo, aditivo): true para que el aviso viva en una región estable (tabindex=-1, montada siempre: la pantalla lo
   * pinta sin condición). Si el botón se va con el foco (el reintento salió bien, o un 403 sin «Reintentar»), el foco va a esa región
   * (focoTrasReintento, lib/avisos.js), nunca al <body>. Sin la prop, como antes. */
  regionFoco?: boolean;
}) {
  const [ultimo, setUltimo] = useState<unknown>(null);
  if (error != null && error !== ultimo) setUltimo(error);
  const visto = error ?? (reintentando ? ultimo : null);
  const aviso = avisoDeFuente(visto, fallo);
  const region = useRef<HTMLDivElement>(null);
  const hayBoton = Boolean(aviso?.reintentar);
  const ultimoHayBoton = useRef(hayBoton);
  useLayoutEffect(() => { ultimoHayBoton.current = hayBoton; }, [hayBoton]);
  const alSoltarBoton = useCallback((teniaFoco: boolean) => {
    // Se decide después del commit (el aviso nuevo ya pintado): si el botón volvió (otro error), el foco se queda en él.
    queueMicrotask(() => {
      if (focoTrasReintento({ teniaFoco, hayBoton: ultimoHayBoton.current }) === 'region' && document.activeElement === document.body) region.current?.focus();
    });
  }, []);
  const cuadro = aviso ? <AvisoFuente aviso={aviso} onReintentar={onReintentar} acento={acento} reintentando={error == null && reintentando}
    alSoltarBoton={regionFoco ? alSoltarBoton : undefined} /> : null;
  if (!regionFoco) return cuadro;
  return (
    <div ref={region} tabIndex={-1} aria-label={aviso ? undefined : 'Avisos'} className={aviso ? undefined : 'sr-only'}>
      {cuadro ?? <span>Sin avisos.</span>}
    </div>
  );
}
