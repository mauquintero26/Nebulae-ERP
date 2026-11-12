'use client';

import { MessageSquareWarning } from 'lucide-react';
import { Badge } from '@/components/ui';
import { avisoCambiosCliente, etiquetaChipCambios } from '@/lib/cambios-cliente';

/**
 * B3 T18 (H28-cambios punto 9, C9): la pastilla «Cambios pedidos» (ámbar) o «Ya no la necesita» (rosa) junto al estado
 * de la solicitud. Su único uso es la cabecera del detalle de la SC (solicitud/[id]): desde B4 T8 y T9 las listas pintan
 * chipsDocumentoVentas (la misma fuente única), así que la rama de la cotización se retiró (B4 T24 f2, F49).
 * El texto sale de etiquetaChipCambios y el tono de avisoCambiosCliente (lib/cambios-cliente.js, con la regla de
 * vigencia del backend: la SC en Asignada o Nueva, con cambios_cliente; al reenviarla, el servidor limpia la marca). Sin
 * cambios vigentes no pinta nada.
 */
export function ChipCambiosCliente({ doc }: { doc: unknown }) {
  const etiqueta = etiquetaChipCambios(doc, 'SC');
  if (!etiqueta) return null;
  const rosa = avisoCambiosCliente(doc, 'SC')?.tono === 'rosa';
  return <Badge tone={rosa ? 'danger' : 'warning'} icon={MessageSquareWarning}>{etiqueta}</Badge>;
}
