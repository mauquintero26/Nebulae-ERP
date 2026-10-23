'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { BellRing, MessageCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { TONES } from '@/components/ui';
import { debeVerificar, ESPERA_VERIFICACION_MS, TEXTO_REVISANDO_ENTREGA } from '@/lib/envio-whatsapp';
import { lineaSeguimientoEnlace } from '@/lib/seguimiento';

// B3 T16 (C28, U16-envio punto 12, U16-entrega punto 4, U16-seguimiento punto 11): piezas nuevas de la ventana del
// enlace (EnlaceConfirmacionModal de flujo.tsx), para que flujo.tsx solo las cablee (R15). La lógica y los textos están
// en lib/envio-whatsapp.js y lib/seguimiento.js.

/** Los colores de los recuadros de la ventana (WhatsApp y correo): verde si salió, azul informativo, ámbar si falta algo. */
export const CLASES_TONO_AVISO: Record<'ok' | 'info' | 'alerta', string> = {
  ok: TONES.success,
  info: TONES.info,
  alerta: TONES.warning,
};

export type EstadoVerificacion = {
  /** El `data` de POST /ventas/envio-cliente/{envio_id}/verificar, o null antes de la primera respuesta. */
  verificacion: unknown;
  revisando: boolean;
  /** Ya empezó la primera verificación (la automática o «Volver a revisar»). */
  iniciada: boolean;
  /** El error de la llamada al ERP (no el de Chatwoot, que viene en verificacion.texto). */
  error: string | null;
  revisar: () => void;
};

/**
 * U16-entrega punto 4: si el WhatsApp automático salió (debeVerificar), UNA verificación automática a los 6 s y las que
 * pida «Volver a revisar». El temporizador se limpia al cerrar la ventana (al desmontarse) y una respuesta que llega
 * después ya no se pinta.
 */
export function useVerificacionEntrega(envio: unknown): EstadoVerificacion {
  const id = debeVerificar(envio) ? String((envio as { envio_id: unknown }).envio_id) : null;
  const [verificacion, setVerificacion] = useState<unknown>(null);
  const [revisando, setRevisando] = useState(false);
  const [iniciada, setIniciada] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const montado = useRef(true);

  const revisar = useCallback(async () => {
    if (!id) return;
    setIniciada(true);
    setRevisando(true);
    setError(null);
    try {
      const r = await apiFetch(`/ventas/envio-cliente/${encodeURIComponent(id)}/verificar`, { method: 'POST', body: '{}' });
      if (montado.current) setVerificacion(r?.data ?? null);
    } catch (err) {
      if (montado.current) setError(textoDeError(err, 'No se pudo revisar si le llegó'));
    } finally {
      if (montado.current) setRevisando(false);
    }
  }, [id]);

  useEffect(() => {
    montado.current = true;
    const temporizador = id ? setTimeout(() => { void revisar(); }, ESPERA_VERIFICACION_MS) : null;
    return () => {
      montado.current = false;
      if (temporizador) clearTimeout(temporizador);
    };
  }, [id, revisar]);

  return { verificacion, revisando, iniciada, error, revisar: () => { void revisar(); } };
}

/**
 * El recuadro del WhatsApp (el primero de la ventana, C28): recuadroWhatsApp de lib/envio-whatsapp.js (texto con el
 * número o el motivo, y la línea de entrega) y «Volver a revisar» (botón de texto) después de la primera verificación,
 * mientras el estado no sea final. r1 (menor 9): mientras consulta queda aria-disabled (sigue enfocable, el foco no se
 * va al body) y, si desaparece (LEIDO o FALLIDO) con el foco perdido, el foco pasa al recuadro (tabIndex -1).
 */
export function RecuadroEnvioWhatsapp({ recuadro, entrega }: {
  recuadro: { tono: 'ok' | 'info' | 'alerta'; texto: string; entrega: string | null; revisable: boolean };
  entrega: EstadoVerificacion;
}) {
  const cajaRef = useRef<HTMLDivElement>(null);
  const mostrarBoton = entrega.iniciada && recuadro.revisable;
  const mostrabaBoton = useRef(false);
  useEffect(() => {
    if (mostrabaBoton.current && !mostrarBoton) {
      const activo = document.activeElement;
      if (!activo || activo === document.body) cajaRef.current?.focus();
    }
    mostrabaBoton.current = mostrarBoton;
  }, [mostrarBoton]);

  return (
    <div ref={cajaRef} tabIndex={-1}
      className={`rounded-xl border px-3 py-2.5 text-xs font-semibold space-y-1 outline-none focus:ring-2 focus:ring-slate-300 ${CLASES_TONO_AVISO[recuadro.tono]}`}>
      {/* Revisión final B3 (F2, M15): la región viva solo con los textos; «Volver a revisar» va fuera de ella. */}
      <div role="status" className="space-y-1">
        <p className="flex items-start gap-1.5">
          <MessageCircle size={13} className="mt-px shrink-0" /> <span>{recuadro.texto}</span>
        </p>
        {recuadro.entrega
          ? <p>{recuadro.entrega}</p>
          : entrega.revisando && <p className="font-medium opacity-80">{TEXTO_REVISANDO_ENTREGA}</p>}
        {entrega.error && <p className="font-medium">{entrega.error}</p>}
      </div>
      {mostrarBoton && (
        <button type="button" aria-disabled={entrega.revisando} onClick={() => { if (!entrega.revisando) entrega.revisar(); }}
          className="font-bold underline underline-offset-2 hover:opacity-80 aria-disabled:opacity-50 aria-disabled:cursor-not-allowed">
          Volver a revisar
        </button>
      )}
    </div>
  );
}

/**
 * La línea del recordatorio en la ventana del enlace (U16-seguimiento punto 11, el último recuadro de C28): gris si
 * quedó programado, ámbar si el cliente no tiene medio. r1: vive aquí, con las demás piezas de la ventana, para que
 * flujo.tsx no importe seguimiento.tsx (que importa getUsuarioActual de flujo.tsx).
 */
export function LineaSeguimientoEnlace({ seguimiento }: { seguimiento?: unknown }) {
  const linea = lineaSeguimientoEnlace(seguimiento);
  if (!linea) return null;
  return (
    <p className={`flex items-start gap-1.5 text-xs ${linea.tono === 'alerta' ? 'font-semibold text-amber-800' : 'text-slate-500'}`}>
      <BellRing size={12} className="mt-0.5 shrink-0" /> <span>{linea.texto}</span>
    </p>
  );
}
