'use client';

import { MessageSquareWarning } from 'lucide-react';
import { Badge } from '@/components/ui';
import { avisoCambiosCliente, etiquetaChipCambios } from '@/lib/cambios-cliente';

/**
 * B3 T18 (H28-cambios punto 9, C9): la pastilla «Cambios pedidos» (ámbar) o «Ya no la necesita» (rosa) junto al estado
 * del documento: en la tabla de las listas de solicitudes y de cotizaciones (r1) y en la cabecera del detalle de la SC.
 * El texto sale de etiquetaChipCambios y el tono de avisoCambiosCliente (lib/cambios-cliente.js, con la regla de
 * vigencia del backend: la SC en Asignada o Nueva y la COT en Borrador, con cambios_cliente; al reenviarlo, el servidor
 * limpia la marca). Sin cambios vigentes no pinta nada.
 */
export function ChipCambiosCliente({ doc, tipoDoc = 'SC' }: { doc: unknown; tipoDoc?: 'SC' | 'COT' }) {
  const etiqueta = etiquetaChipCambios(doc, tipoDoc);
  if (!etiqueta) return null;
  const rosa = avisoCambiosCliente(doc, tipoDoc)?.tono === 'rosa';
  return <Badge tone={rosa ? 'danger' : 'warning'} icon={MessageSquareWarning}>{etiqueta}</Badge>;
}
