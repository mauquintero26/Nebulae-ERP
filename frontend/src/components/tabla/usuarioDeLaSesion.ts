'use client';

import { getToken } from '@/lib/api';
import { usuarioDelToken } from '@/lib/preferencias';

/**
 * El usuario de la sesión según el token vigente (el sub del JWT, usuarioDelToken de lib/preferencias.js), o null si no
 * hay token o no se puede leer (Bloque 4, T4C r1). Los hooks de components/tabla lo leen en cada render (el usuario
 * con que se pintó la pantalla) y otra vez al escribir: si ya no es el mismo, el gesto se hizo sobre la pantalla de
 * otra cuenta y no se guarda. Es interno de components/tabla (index.ts no lo exporta).
 */
export function usuarioDeLaSesion(): number | null {
  try {
    return usuarioDelToken(getToken());
  } catch {
    return null;
  }
}
