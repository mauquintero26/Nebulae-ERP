/**
 * hooks/useDebounce.ts
 *
 * Hook que retrasa la actualización de un valor.
 * Útil para limitar peticiones de búsqueda.
 */

import { useState, useEffect } from 'react';

/**
 * Devuelve un valor debounced.
 * @param value — valor a retardar
 * @param delayMs — retraso en ms (por especificación: 300-500ms para búsqueda)
 */
export function useDebounce<T>(value: T, delayMs = 350): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
