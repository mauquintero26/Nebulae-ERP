"use client";

import { MODALITY_CLS } from '@/lib/design-tokens';
import { Truck, Clock } from 'lucide-react';

type Props = {
  modalidad: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO';
  className?: string;
};

const ICONS = {
  ENTREGA_INMEDIATA: Truck,
  POR_PEDIDO:        Clock,
} as const;

export function ModalityBadge({ modalidad, className = '' }: Props) {
  const { label, cls } = MODALITY_CLS[modalidad];
  const Icon = ICONS[modalidad];

  return (
    <span
      className={`inline-flex items-center gap-1.5 border text-xs font-bold rounded-full px-3 py-1 ${cls} ${className}`}
      title={
        modalidad === 'ENTREGA_INMEDIATA'
          ? 'Producto disponible para despacho inmediato'
          : 'Producto disponible bajo pedido previo — se compra antes de importar'
      }
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
