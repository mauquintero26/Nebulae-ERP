'use client';

import { AlertTriangle } from 'lucide-react';
import { avisoNombreSinContacto } from '@/lib/datos-cliente';

/**
 * B3 T20b (parte B, decisión del usuario): la nota ámbar «El nombre cambió pero el contacto no: revisa el teléfono y
 * el correo.» arriba de los botones de la ventana de envío (ChannelModal) de la SC y de la COT. La decide el servidor
 * (nombre_cambio_sin_contacto del detalle) y la lib (avisoNombreSinContacto). No bloquea nada: el asesor puede enviar
 * igual. Sin el aviso no pinta nada.
 */
export function AvisoNombreSinContacto({ documento }: { documento: unknown }) {
  const aviso = avisoNombreSinContacto(documento);
  if (!aviso) return null;
  return (
    <p className="flex items-start gap-2 text-xs font-semibold text-amber-800 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
      <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" aria-hidden="true" />
      <span>{aviso}</span>
    </p>
  );
}
