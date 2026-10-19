'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import { estadoEnvioParaCanal } from '@/lib/envio-whatsapp';
import { esAdminOAsesor } from '@/lib/seguimiento';
import { getUsuarioActual } from '../flujo';

/** La prop envioWhatsApp del ChannelModal (A mayúscula; no es la envioWhatsapp del EnlaceConfirmacionModal, RP23). */
export type EnvioWhatsAppCanal = { automatico: boolean; listo: boolean };

/**
 * B3 T17 (U16-envio punto 14): al abrir el ChannelModal, GET /ventas/envio-cliente/whatsapp/estado una vez (si falla,
 * null: la ventana queda como hoy). Solo ADMIN y ASESOR lo leen (esAdminOAsesor): otro rol no hace la llamada (nunca
 * un 403). Con la ventana cerrada devuelve null. La lectura vieja de una ventana ya cerrada no se pinta (bandera
 * `vigente`, lección de T14 a T16 con StrictMode). Lo usan la COT, el Hub y, en T18/T19, la SC y el PVEN.
 */
export function useEstadoEnvioWhatsApp(abierto: boolean): EnvioWhatsAppCanal | null {
  const [estado, setEstado] = useState<EnvioWhatsAppCanal | null>(null);
  useEffect(() => {
    if (!abierto || !esAdminOAsesor(getUsuarioActual().role)) return;
    let vigente = true;
    apiFetch('/ventas/envio-cliente/whatsapp/estado')
      .then((r: { data?: unknown } | null) => { if (vigente) setEstado(estadoEnvioParaCanal(r?.data ?? null)); })
      .catch(() => { if (vigente) setEstado(null); });
    return () => { vigente = false; };
  }, [abierto]);
  return abierto ? estado : null;
}
