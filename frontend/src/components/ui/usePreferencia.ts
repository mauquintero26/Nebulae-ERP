'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, getToken } from '@/lib/api';
import { crearPreferencias, crearPreferenciasDeSesion, vincularPreferencia } from '@/lib/preferencias';
import type { Preferencias } from '@/lib/preferencias';

/**
 * La ÚNICA puerta de las pantallas a lib/preferencias.js (Bloque 4, T4A; R4, C2, RP24, RP25, RP26 y D35).
 *  - preferenciasApp(): la instancia de crearPreferencias del usuario de la SESIÓN, con localStorage y el servidor
 *    (GET /api/v1/preferencias?prefijo= y PUT /api/v1/preferencias/{clave} con {valor}, T1B). Ver su JSDoc.
 *    Los errores de apiFetch pasan tal cual, con su .status, para que preferencias.js reintente solo la red o un 5xx
 *    (RP24).
 *  - usePreferencia(clave, porDefecto) -> [valor, guardar, listo]: hasta que la instancia está lista, `valor` es
 *    porDefecto y no se escribe nada (tampoco el valor por defecto); lo que se guarde antes se ve en memoria y se
 *    escribe con listo (D35). El primer render siempre es porDefecto (sin desajuste de hidratación). Si cambia el
 *    usuario (otra pestaña, otro ingreso), el hook pasa a la instancia nueva (RP25).
 *  - usePreferenciaParte(clave, porDefecto) -> [valor, guardarParte, listo]: lo mismo para una clave con dos dueños
 *    (tabla:<id>: el tamaño de useEstadoTabla y las columnas de usePreferenciasTabla, RP26): guardarParte escribe con
 *    escribirParte, y solo con listo.
 * Un solo escritor por clave (RP26): vista:<id> lo escribe useEstadoTabla (T4C) en las pantallas con tabla estándar;
 * useVistaGuardada (ConmutadorVista.tsx) es para las demás.
 */

export type { Preferencias } from '@/lib/preferencias';
export type GuardarPreferencia<T> = (entrada: T | ((anterior: T) => T)) => void;
export type GuardarParte<T> = (parte: Partial<T> | ((anterior: T) => Partial<T>)) => void;
export type OpcionesPreferencia = {
  /** Un valor guardado que no pasa da porDefecto (p. ej. un 'vista:' que no es 'lista' ni 'kanban'). */
  validar?: (valor: unknown) => boolean;
};

// T4A r1: el usuario es el del TOKEN. crearPreferenciasDeSesion (lib/preferencias.js, con sus pruebas) toma el user_id
// de AuthGuard solo si es el sub del JWT vigente, y el servidor de cada instancia comprueba antes de cada GET y PUT
// que el token sigue siendo de su usuario; apiFetch va con sinReintento401 (un 401 no se reintenta con otro token).
const gestor = crearPreferenciasDeSesion({
  leerToken: getToken,
  leerUserId: () => window.localStorage.getItem('user_id'),
  leerAlmacen: () => window.localStorage,
  pedir: apiFetch,
});

/**
 * La instancia de preferencias del usuario de la sesión (T4A y r1; RP25 y D35):
 *  - Es la del usuario del TOKEN vigente: el localStorage 'user_id' de AuthGuard vale solo si es el sub del JWT. Sin
 *    token, o con el token de otro usuario (nadie borra 'user_id' al cerrar la sesión), es una instancia en memoria,
 *    sin GET ni PUT, hasta que AuthGuard escriba el user_id correcto. Al cambiar de usuario cierra la vieja ANTES de
 *    crear la nueva, y la nueva hace precargar('') (un solo GET por sesión).
 *  - Llámala en CADA uso (en el efecto o en el manejador que va a leer o escribir) y no guardes la instancia en un ref
 *    ni en el estado: después de un cambio de usuario la vieja queda cerrada y muda.
 *  - No escribas antes de estaLista() (o de `await preferenciasApp().listo`), ni siquiera un valor por defecto (D35).
 *  - Para escribir por partes (tabla:<id>), usePreferenciaParte ya resuelve D35: escribe con escribirParte solo con
 *    listo y sigue al usuario si cambia.
 * Del lado del servidor (render de Next) devuelve una instancia en memoria de un solo uso.
 */
export function preferenciasApp(): Preferencias {
  if (typeof window === 'undefined') return crearPreferencias({ usuarioId: null });
  return gestor.obtener();
}

type Vinculo<T> = ReturnType<typeof vincularPreferencia<T>>;

function useVinculo<T>(clave: string, porDefecto: T, validar: OpcionesPreferencia['validar'], parte: boolean) {
  const [estado, setEstado] = useState(() => ({ clave, valor: porDefecto, listo: false }));
  const vinculo = useRef<Vinculo<T> | null>(null);
  // Lo último que pasó la pantalla; el vínculo de cada clave toma el de su momento.
  const actuales = useRef({ porDefecto, validar });
  useEffect(() => {
    actuales.current = { porDefecto, validar };
  });

  useEffect(() => {
    const v = vincularPreferencia<T>({
      obtener: preferenciasApp,
      clave,
      porDefecto: actuales.current.porDefecto,
      validar: actuales.current.validar ?? null,
      parte,
      alCambiar: (e) => setEstado({ clave, valor: e.valor, listo: e.listo }),
    });
    vinculo.current = v;
    // El usuario cambió: lo avisa preferenciasApp (otra llamada lo notó) o, desde otra pestaña, el evento storage.
    const quitar = gestor.alCambiar(() => v.revisarUsuario());
    const alAlmacen = (e: StorageEvent) => {
      if (e.key === null || e.key === 'user_id' || e.key === 'token') v.revisarUsuario();
    };
    window.addEventListener('storage', alAlmacen);
    return () => {
      window.removeEventListener('storage', alAlmacen);
      quitar();
      v.soltar();
      if (vinculo.current === v) vinculo.current = null;
    };
  }, [clave, parte]);

  const guardar = useCallback((entrada: unknown) => {
    vinculo.current?.guardar(entrada as T);
  }, []);

  // Al cambiar de clave, hasta que el vínculo nuevo publique: porDefecto y sin listo.
  const vigente = estado.clave === clave ? estado : null;
  return { valor: vigente ? vigente.valor : porDefecto, guardar, listo: vigente ? vigente.listo : false };
}

/**
 * [valor, guardar, listo] de la preferencia `clave` ('vista:…', 'kanban:…', 'flujo:…', 'analisis:…'). Ver arriba.
 * `guardar` acepta el valor o una función del valor anterior.
 */
export function usePreferencia<T>(
  clave: string,
  porDefecto: T,
  opciones: OpcionesPreferencia = {},
): [T, GuardarPreferencia<T>, boolean] {
  const { valor, guardar, listo } = useVinculo<T>(clave, porDefecto, opciones.validar, false);
  return [valor, guardar as GuardarPreferencia<T>, listo];
}

/**
 * [valor, guardarParte, listo] de una preferencia objeto con varios dueños (tabla:<id>, RP26). `valor` es
 * {...porDefecto, ...lo guardado}; guardarParte(parte) escribe {...lo guardado, ...parte} con escribirParte, y solo
 * con listo (D35).
 */
export function usePreferenciaParte<T extends Record<string, unknown>>(
  clave: string,
  porDefecto: T,
  opciones: OpcionesPreferencia = {},
): [T, GuardarParte<T>, boolean] {
  const { valor, guardar, listo } = useVinculo<T>(clave, porDefecto, opciones.validar, true);
  return [valor, guardar as GuardarParte<T>, listo];
}
