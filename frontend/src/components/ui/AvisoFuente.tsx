'use client';

import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import { avisoDeFuente, avisoVisible, focoTrasReintento } from '@/lib/avisos';
import { FOCOS } from '@/lib/design-system';
import type { AcentoFoco } from '@/lib/design-system';
import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';

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
export function AvisoDeError({ error, fallo, onReintentar, acento, reintentando = false, destinoFoco }: {
  error: unknown; fallo: string; onReintentar: () => void; acento?: AcentoFoco;
  /** B4 T24 f3 r1 (m36, aditivo): true mientras se reintenta. El aviso sigue con el último error y «Reintentando…» (aria-disabled). */
  reintentando?: boolean;
  /** B4 T24 f3 r2 y r3 (m36, C del ruling, aditivo): el destino VISIBLE del foco. B4 T24 f4 (m2 + m10 de f3 r3): es el `id` del destino
   * (el idFoco de la FranjaKpis de la pantalla, o la lista de Productos), no el texto de su aria-label, y la prop cambió de nombre.
   * Si el botón «Reintentar» se va con el foco (el reintento salió bien, o un 403), el foco va ahí (focoTrasReintento), nunca al <body>.
   * La pantalla pinta el aviso sin condición (que siga montado). Sin la prop, como antes. */
  destinoFoco?: string;
}) {
  const [ultimo, setUltimo] = useState<unknown>(null);
  // B4 T24 f4 (m8 de f3 r3): el último va con la cuenta con que se vio: si la sesión pasa a otra, no se pinta mientras carga la nueva.
  const cuenta = usuarioDeLaSesion();
  const [cuentaDelUltimo, setCuentaDelUltimo] = useState<number | null>(null);
  // r3 (C1 = C3): qué se ve lo decide avisoVisible (lib); al terminar un reintento bueno, el último se olvida.
  const { visto, olvidar } = avisoVisible({ error, ultimo, reintentando, cuenta, cuentaDelUltimo });
  if (error != null && (error !== ultimo || cuenta !== cuentaDelUltimo)) {
    setUltimo(error);
    setCuentaDelUltimo(cuenta);
  }
  else if (olvidar) setUltimo(null);
  const aviso = avisoDeFuente(visto, fallo);
  const hayBoton = Boolean(aviso?.reintentar);
  const ultimoHayBoton = useRef(hayBoton);
  useLayoutEffect(() => { ultimoHayBoton.current = hayBoton; }, [hayBoton]);
  const alSoltarBoton = useCallback((teniaFoco: boolean) => {
    // Se decide después del commit (el aviso nuevo ya pintado): si el botón volvió (otro error), el foco se queda en él.
    queueMicrotask(() => {
      if (focoTrasReintento({ teniaFoco, hayBoton: ultimoHayBoton.current }) === 'destino' && document.activeElement === document.body && destinoFoco) {
        document.getElementById(destinoFoco)?.focus();
      }
    });
  }, [destinoFoco]);
  // r2 (m36, un solo contrato): `reintentando` llega tal cual (useResumen limpia el error al reintentar; estadoReintento lo conserva).
  return aviso ? <AvisoFuente aviso={aviso} onReintentar={onReintentar} acento={acento} reintentando={reintentando}
    alSoltarBoton={destinoFoco ? alSoltarBoton : undefined} /> : null;
}
