'use client';

import { useSyncExternalStore } from 'react';
import { avisoDeFuente } from '@/lib/avisos';

/**
 * B4 T23B: el aviso de una fuente de una pantalla que falló (lib/avisos.js avisoDeFuente): una falla lleva el detalle del servidor y
 * «Reintentar»; un 403 es un tema de permiso y NO ofrece «Reintentar» (volver a pedir no lo cambia). Es la pieza común de
 * Seguimientos, Marketing y Campañas (E-Commerce, de T23A, trae una copia local que T24 puede cambiar por esta).
 */
export function AvisoFuente({ aviso, onReintentar }: { aviso: NonNullable<ReturnType<typeof avisoDeFuente>>; onReintentar: () => void }) {
  const permiso = aviso.tipo === 'permiso';
  return (
    <div role={permiso ? 'status' : 'alert'} className={`flex flex-wrap items-center gap-3 rounded-2xl border px-4 py-3 text-sm font-semibold ${permiso ? 'border-amber-200 bg-amber-50 text-amber-800' : 'border-rose-200 bg-rose-50 text-rose-800'}`}>
      {aviso.texto}
      {aviso.reintentar && (
        <button type="button" onClick={onReintentar}
          className="inline-flex items-center gap-1.5 rounded-xl border border-rose-300 bg-white px-3 py-1.5 text-xs font-bold text-rose-800 hover:bg-rose-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2">
          Reintentar
        </button>
      )}
    </div>
  );
}

const suscribirRol = (alCambiar: () => void) => {
  window.addEventListener('storage', alCambiar);
  return () => window.removeEventListener('storage', alCambiar);
};

/**
 * B4 T23B: el rol del usuario (localStorage 'user_role'), leído DESPUÉS de montar: en el servidor y en la hidratación es '' (no se
 * pide ni se ofrece nada que dependa del rol: accesoSeguimientos, accesoMarketing y accesoAsistente de lib/roles.js dan listo
 * false) y se relee cuando otra pestaña lo cambia. Nunca se lee en el inicializador de useState (el servidor da '' y el cliente el
 * rol real: riesgo de hidratación).
 */
export function useRolActual(): string {
  return useSyncExternalStore(suscribirRol, () => localStorage.getItem('user_role') || '', () => '');
}
