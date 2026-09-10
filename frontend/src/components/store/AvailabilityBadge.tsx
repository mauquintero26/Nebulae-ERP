"use client";

import type { AvailabilityStatus } from '@/types/store';
import { AVAILABILITY_CLS } from '@/lib/design-tokens';

type Props = {
  status: AvailabilityStatus;
  count?: number;
  className?: string;
};

export function AvailabilityBadge({ status, count, className = '' }: Props) {
  const { label, cls } = AVAILABILITY_CLS[status];
  const displayLabel =
    status === 'low_stock' && count !== undefined
      ? `${count} disponibles`
      : label;

  return (
    <span
      className={`inline-flex items-center gap-1.5 border text-xs font-bold rounded-full px-3 py-1 ${cls} ${className}`}
      role="status"
      aria-label={displayLabel}
    >
      <span
        className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
          status === 'available'    ? 'bg-[#7A9A40]' :
          status === 'low_stock'    ? 'bg-[#C47A3A]' :
          status === 'out_of_stock' ? 'bg-[#E55B8A]' :
          status === 'unconfirmed'  ? 'bg-[#8A8A8E]' :
                                      'bg-[#3A8FC4]'
        }`}
      />
      {displayLabel}
    </span>
  );
}

/**
 * Deriva AvailabilityStatus a partir de la modalidad y stock del producto.
 *
 * Reglas de seguridad (FASE 3 WEB-2A cierre):
 * - Solo devuelve 'available' o 'low_stock' cuando la modalidad es ENTREGA_INMEDIATA canónica.
 * - Si la modalidad es DISPONIBILIDAD_POR_CONFIRMAR (stock manual sin fuente canónica),
 *   devuelve 'unconfirmed' — nunca promete entrega inmediata.
 * - POR_PEDIDO siempre devuelve 'by_order' (independiente del stock local).
 * - stock === 0 con modalidad canónica de entrega devuelve 'out_of_stock'.
 *
 * Ver WEB2A_GAPS_BACKEND.md GAP-004.
 */
export function getAvailabilityStatus(
  stockDisponible: number,
  alertaStockMinimo: number = 5,
  modalidad?: string
): AvailabilityStatus {
  // Modalidad canónica por pedido — independiente de stock local
  if (modalidad === 'POR_PEDIDO') return 'by_order';

  // Solo ENTREGA_INMEDIATA canónica permite mostrar disponibilidad de stock real
  if (modalidad !== 'ENTREGA_INMEDIATA') {
    // Incluye: undefined, '', 'DISPONIBILIDAD_POR_CONFIRMAR', cualquier cadena inválida
    return 'unconfirmed';
  }

  // modalidad === 'ENTREGA_INMEDIATA' canónica — sí podemos mostrar estado de stock
  if (stockDisponible === 0)                        return 'out_of_stock';
  if (stockDisponible <= alertaStockMinimo)          return 'low_stock';
  return 'available';
}
