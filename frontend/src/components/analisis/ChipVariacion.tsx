'use client';

import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { infoVariacion } from '@/lib/analisis';
import type { MejorAnalisis } from '@/lib/analisis';

/**
 * ANALISIS-base punto 2 (Bloque 4, T5B; R7, C12 y RP27): la variación de una cifra contra el período anterior, como un
 * chip con flecha, texto y color. El texto, la flecha y el tono salen de infoVariacion de lib/analisis.js (la regla única
 * de lib/kpis.js, la misma de TarjetaKpi): «Hoy» (una foto), «—» (sin anterior), «Sin cambio», «Nuevo» o '+12,5 %' /
 * '−8 %'; tono 'bien', 'mal' o 'neutro'. El verde y el rojo nunca van solos: siempre con la flecha y el texto.
 *  - Lo visible va con aria-hidden y el lector de pantalla lee infoVariacion().lector ('Sube 12,5 % frente al período
 *    anterior'); `frente` cambia ese final.
 *  - Colores -700 sobre -50 (o slate-600 sobre slate-100): al menos 4,5:1. Sin variantes de modo oscuro.
 */

export type KpiVariacion = {
  valor: unknown;
  anterior: unknown;
  mejor?: MejorAnalisis | null;
  es_foto?: boolean;
};

export type PropsChipVariacion = {
  /** {valor, anterior, mejor, es_foto}: un kpi del contrato o el total y el total anterior de un gráfico. */
  kpi: KpiVariacion | null | undefined;
  /** El final del texto para lectores de pantalla (por defecto, 'frente al período anterior'). */
  frente?: string;
};

const TONO = {
  bien: 'bg-emerald-50 text-emerald-700',
  mal: 'bg-rose-50 text-rose-700',
  neutro: 'bg-slate-100 text-slate-600',
} as const;

export function ChipVariacion({ kpi, frente }: PropsChipVariacion) {
  const info = infoVariacion(kpi, frente ? { frente } : {});
  let icono: React.ReactNode = null;
  if (info.flecha === 'sube') icono = <ArrowUpRight size={12} strokeWidth={2.5} />;
  else if (info.flecha === 'baja') icono = <ArrowDownRight size={12} strokeWidth={2.5} />;
  else if (info.texto === 'Sin cambio') icono = <Minus size={12} strokeWidth={2.5} />;
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold tabular-nums ${TONO[info.tono]}`}>
      <span aria-hidden="true" className="inline-flex items-center gap-0.5">
        {icono}
        {info.texto}
      </span>
      <span className="sr-only">{info.lector}</span>
    </span>
  );
}
