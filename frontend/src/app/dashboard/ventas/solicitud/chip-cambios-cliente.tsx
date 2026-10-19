'use client';

import { MessageSquareWarning } from 'lucide-react';
import { Badge } from '@/components/ui';
import { avisoCambiosCliente, etiquetaChipCambios } from '@/lib/cambios-cliente';

/**
 * B3 T18 (H28-cambios punto 9, C9): la pastilla «Cambios pedidos» (ámbar) o «Ya no la necesita» (rosa) junto al estado
 * de la solicitud: en la tabla de la lista y en la cabecera del detalle. El texto sale de etiquetaChipCambios y el tono
 * de avisoCambiosCliente (lib/cambios-cliente.js, con la regla de vigencia del backend: la SC en Asignada o Nueva con
 * cambios_cliente; al reenviarla, el servidor limpia la marca). Sin cambios vigentes no pinta nada.
 */
export function ChipCambiosCliente({ sc }: { sc: unknown }) {
  const etiqueta = etiquetaChipCambios(sc, 'SC');
  if (!etiqueta) return null;
  const rosa = avisoCambiosCliente(sc, 'SC')?.tono === 'rosa';
  return <Badge tone={rosa ? 'danger' : 'warning'} icon={MessageSquareWarning}>{etiqueta}</Badge>;
}
