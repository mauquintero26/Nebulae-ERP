'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { copiarTexto } from '@/lib/copiar';

// B3 T16 r1 (menor 11): el «Copiar» que nunca falla en silencio (H30), en un solo hook. Primero el portapapeles; si no
// se puede (HTTP con IP, permiso negado), la copia de la selección del campo; si tampoco, 'manual': el texto queda
// seleccionado (también en el celular, con setSelectionRange) y la pantalla muestra cómo copiarlo a mano. 'copiado'
// vuelve a 'idle' a los 2 s con un solo temporizador, que se cancela al desmontar. La regla vive en lib/copiar.js.

export type EstadoCopia = 'idle' | 'copiado' | 'manual';

export function useCopiarConRespaldo<T extends HTMLInputElement | HTMLTextAreaElement>() {
  const ref = useRef<T>(null);
  const [estado, setEstado] = useState<EstadoCopia>('idle');
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (temporizador.current) clearTimeout(temporizador.current);
  }, []);

  const seleccionar = useCallback((): boolean => {
    const el = ref.current;
    if (!el) return false;
    el.focus();
    el.select();
    el.setSelectionRange(0, el.value.length);
    return true;
  }, []);

  const copiar = useCallback(async (texto: string) => {
    const r = await copiarTexto(texto, {
      portapapeles: typeof navigator !== 'undefined' ? navigator.clipboard : undefined,
      copiarSeleccion: () => seleccionar() && document.execCommand('copy'),
    });
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    if (r === 'copiado') {
      setEstado('copiado');
      temporizador.current = setTimeout(() => setEstado(e => (e === 'copiado' ? 'idle' : e)), 2000);
    } else {
      setEstado('manual');
      seleccionar();
    }
  }, [seleccionar]);

  return { ref, estado, copiar };
}
