'use client';

import { useSyncExternalStore } from 'react';

const suscribirRol = (alCambiar: () => void) => {
  window.addEventListener('storage', alCambiar);
  return () => window.removeEventListener('storage', alCambiar);
};

/**
 * B4 T23B: el rol del usuario (localStorage 'user_role'), leído DESPUÉS de montar: en el servidor y en la hidratación es '' (no se
 * pide ni se ofrece nada que dependa del rol: accesoSeguimientos, accesoMarketing, accesoAsistente y accesoTienda de lib/roles.js dan
 * listo false) y se relee cuando otra pestaña lo cambia. Nunca se lee en el inicializador de useState (el servidor da '' y el cliente el
 * rol real: riesgo de hidratación). Se importa directo de '@/components/ui/useRolActual' (components/ui/index.ts es de T4A y T4B, R18).
 */
export function useRolActual(): string {
  return useSyncExternalStore(suscribirRol, () => localStorage.getItem('user_role') || '', () => '');
}
