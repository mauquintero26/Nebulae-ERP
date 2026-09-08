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
                                      'bg-[#3A8FC4]'
        }`}
      />
      {displayLabel}
    </span>
  );
}

/** Helper: derives AvailabilityStatus from product fields */
export function getAvailabilityStatus(
  stockDisponible: number,
  alertaStockMinimo: number = 5,
  modalidad?: string
): AvailabilityStatus {
  if (modalidad === 'POR_PEDIDO') return 'by_order';
  if (stockDisponible === 0)      return 'out_of_stock';
  if (stockDisponible <= alertaStockMinimo) return 'low_stock';
  return 'available';
}
