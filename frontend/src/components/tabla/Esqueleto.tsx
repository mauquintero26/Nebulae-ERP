'use client';

import { TABLE } from '@/lib/design-system';

/**
 * Los renglones grises de la tabla estándar mientras carga sin datos (Bloque 4, T4D; TABLA-base punto 3 y H6): 8
 * renglones (o `filas`) con una barra gris que se mueve en cada celda, nunca ceros. Va dentro del <tbody> de
 * TablaEstandar (que pone aria-busy y el pie 'Cargando…'); los renglones son aria-hidden. Las clases son las de TABLE
 * (lib/design-system.ts).
 */

// Anchos de las barras, para que no se vean todas iguales (clases literales).
const ANCHOS = ['w-3/4', 'w-1/2', 'w-2/3', 'w-5/6', 'w-2/5', 'w-3/5'] as const;

export function Esqueleto({ columnas, filas = 8 }: { columnas: number; filas?: number }) {
  const n = Math.max(1, Math.trunc(columnas) || 1);
  return (
    <>
      {Array.from({ length: Math.max(1, Math.trunc(filas) || 1) }, (_, i) => (
        <tr key={i} aria-hidden="true">
          {Array.from({ length: n }, (_, j) => (
            <td key={j} className={TABLE.celda}>
              <span className={`${TABLE.esqueleto} ${ANCHOS[(i + j) % ANCHOS.length]}`} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
