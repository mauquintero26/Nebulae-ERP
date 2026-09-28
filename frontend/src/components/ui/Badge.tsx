'use client';
import { TONES, Tone } from './colors';

/** Pastilla de estado (Cancelado/Pendiente/Entregado/etc). Un solo tamano y
 * forma en todo el proyecto -- lo que cambia es el `tone` semantico. */
export function Badge({
  tone = 'neutral', icon: Icon, children,
}: {
  tone?: Tone;
  icon?: React.ComponentType<{ size?: number }>;
  children: React.ReactNode;
}) {
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold border ${TONES[tone]}`}>
      {Icon && <Icon size={12} />}
      {children}
    </span>
  );
}
