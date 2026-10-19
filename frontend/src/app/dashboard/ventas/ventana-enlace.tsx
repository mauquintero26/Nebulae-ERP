'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { MessageCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { textoDeError } from '@/lib/avisos';
import { TONES } from '@/components/ui';
import { debeVerificar, ESPERA_VERIFICACION_MS, TEXTO_REVISANDO_ENTREGA } from '@/lib/envio-whatsapp';

// B3 T16 (C28, U16-envio punto 12, U16-entrega punto 4): piezas nuevas de la ventana del enlace (EnlaceConfirmacionModal
// de flujo.tsx), para que flujo.tsx solo las cablee (R15). La lógica y los textos están en lib/envio-whatsapp.js.

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
 * número o el motivo, y la línea de entrega) y «Volver a revisar» (botón de texto, deshabilitado mientras consulta)
 * después de la primera verificación, mientras el estado no sea final.
 */
export function RecuadroEnvioWhatsapp({ recuadro, entrega }: {
  recuadro: { tono: 'ok' | 'info' | 'alerta'; texto: string; entrega: string | null; revisable: boolean };
  entrega: EstadoVerificacion;
}) {
  return (
    <div role="status" className={`rounded-xl border px-3 py-2.5 text-xs font-semibold space-y-1 ${CLASES_TONO_AVISO[recuadro.tono]}`}>
      <p className="flex items-start gap-1.5">
        <MessageCircle size={13} className="mt-px shrink-0" /> <span>{recuadro.texto}</span>
      </p>
      {recuadro.entrega
        ? <p>{recuadro.entrega}</p>
        : entrega.revisando && <p className="font-medium opacity-80">{TEXTO_REVISANDO_ENTREGA}</p>}
      {entrega.error && <p className="font-medium">{entrega.error}</p>}
      {entrega.iniciada && recuadro.revisable && (
        <button type="button" onClick={entrega.revisar} disabled={entrega.revisando}
          className="font-bold underline underline-offset-2 hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed">
          Volver a revisar
        </button>
      )}
    </div>
  );
}
