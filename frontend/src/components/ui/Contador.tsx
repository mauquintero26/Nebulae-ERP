'use client';

import { estadoContador, textoContador } from '@/lib/kpis';
import type { EstadoKpi } from '@/lib/kpis';

/**
 * El ÚNICO contador de la app (Bloque 4, T4A; R12 y C13): el número de las pestañas, las pastillas, BarraTabla,
 * BannerFlujo y las columnas del tablero. Mientras carga pinta una barra gris animada (nunca 0 ni '…'); si hubo un
 * error, '—'; ya cargado, el número con los miles con punto (textoContador de lib/kpis.js), atenuado si se está
 * actualizando. Sin `estado`, un valor null o undefined cuenta como 'cargando' (estadoContador).
 */
export function Contador({
  valor, estado, className = '',
}: {
  valor: number | null | undefined;
  estado?: EstadoKpi;
  className?: string;
}) {
  const actual = estadoContador(valor, estado);
  if (actual === 'cargando') {
    return (
      <span className={`inline-flex items-center ${className}`}>
        <span aria-hidden="true" className="inline-block h-2 w-4 rounded-full bg-current opacity-30 animate-pulse" />
        <span className="sr-only">Cargando</span>
      </span>
    );
  }
  if (actual === 'error') {
    return (
      <span title="No se pudo cargar" className={className}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">No se pudo cargar</span>
      </span>
    );
  }
  return (
    <span className={`tabular-nums ${actual === 'actualizando' ? 'opacity-60' : ''} ${className}`}>
      {textoContador(valor, actual)}
    </span>
  );
}
