"use client";

import { MODALITY_CLS } from '@/lib/design-tokens';
import { Truck, Clock, HelpCircle } from 'lucide-react';

type Props = {
  modalidad: 'ENTREGA_INMEDIATA' | 'POR_PEDIDO' | 'DISPONIBILIDAD_POR_CONFIRMAR';
  className?: string;
};

const ICONS = {
  ENTREGA_INMEDIATA:            Truck,
  POR_PEDIDO:                   Clock,
  DISPONIBILIDAD_POR_CONFIRMAR: HelpCircle,
} as const satisfies Record<Props['modalidad'], React.ComponentType<{ size?: number; 'aria-hidden'?: 'true' }>>;

import type React from 'react';

export function ModalityBadge({ modalidad, className = '' }: Props) {
  const token = MODALITY_CLS[modalidad] ?? MODALITY_CLS['DISPONIBILIDAD_POR_CONFIRMAR'];
  const { label, cls } = token;
  const Icon = ICONS[modalidad] ?? HelpCircle;

  const title =
    modalidad === 'ENTREGA_INMEDIATA'
      ? 'Producto disponible para despacho inmediato'
      : modalidad === 'POR_PEDIDO'
      ? 'Producto disponible bajo pedido previo — se compra antes de importar'
      : 'Disponibilidad sujeta a confirmación — contáctenos para verificar existencia';

  return (
    <span
      className={`inline-flex items-center gap-1.5 border text-xs font-bold rounded-full px-3 py-1 ${cls} ${className}`}
      title={title}
    >
      <Icon size={11} aria-hidden="true" />
      {label}
    </span>
  );
}
