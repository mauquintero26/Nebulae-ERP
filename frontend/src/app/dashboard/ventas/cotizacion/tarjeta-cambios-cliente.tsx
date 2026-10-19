'use client';

import type { ReactNode } from 'react';
import type { avisoCambiosCliente } from '@/lib/cambios-cliente';
import { NextStepCard } from '../flujo';

/**
 * B3 T17 (U22-cambios punto 7, C9): la tarjeta «El cliente pidió cambios» en «Siguiente paso», con lo que devuelve
 * avisoCambiosCliente (lib/cambios-cliente.js, de las columnas cambios_cliente_*): el título, el comentario del cliente
 * entre comillas (texto, escapado por React, con sus saltos de línea) y la fecha en hora de Colombia. Las acciones las
 * pone quien la monta (la COT: «Re-cotizar» y «Enviar al cliente»; T18, las de la SC). null sin cambios vigentes.
 */
export function TarjetaCambiosCliente({ aviso, acciones }: {
  aviso: ReturnType<typeof avisoCambiosCliente>;
  acciones?: ReactNode;
}) {
  if (!aviso) return null;
  return (
    <NextStepCard tone={aviso.tono === 'rosa' ? 'rose' : 'amber'} title={aviso.titulo} actions={acciones}>
      {aviso.texto && (
        <span className="mt-1 block whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-slate-700">
          &ldquo;{aviso.texto}&rdquo;
        </span>
      )}
      {aviso.fecha && <span className="mt-1.5 block">Lo pidió el {aviso.fecha}</span>}
    </NextStepCard>
  );
}
