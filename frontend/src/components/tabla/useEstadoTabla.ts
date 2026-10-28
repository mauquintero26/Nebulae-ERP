'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import {
  armarEstadoTabla, claveSesionTabla, esModoTabla, escriturasDeAccion, esperarPreferencias, estadoTablaInicial,
  listoConTope, reducirEstadoTabla, sesionVigente,
} from '@/lib/tabla';
import type { AccionTabla, EstadoTabla, ModoTabla, SesionTabla } from '@/lib/tabla';
import { usePreferencia, usePreferenciaParte } from '@/components/ui/usePreferencia';
import { usuarioDeLaSesion } from './usuarioDeLaSesion';

/**
 * El estado ÚNICO de una pantalla con tabla estándar (Bloque 4, T4C y r1; TABLA-base punto 3, R4, R5, C2, C3, RP26 y
 * D39): {vista (la pestaña), modo, semaforo, paso, estados, q, orden, pagina, tamano}. Las tarjetas pulsables, las cajas
 * del flujo, los botones del semáforo, las pestañas, la búsqueda y el filtro de estados despachan acciones al reductor
 * (reducirEstadoTabla de lib/tabla.js): todo cambio que no sea de página vuelve a la página 1. La tabla y el tablero
 * leen este mismo estado y lo mandan al servidor (useListado y el `cargar` de useTableroKanban).
 *
 * Cada campo vive en UN lugar (escriturasDeAccion dice qué se escribe después de cada acción):
 *  - La pestaña, la página, la búsqueda, el orden, el semáforo, el paso y el filtro de estados son de la SESIÓN: van a
 *    sessionStorage 'tabla-sesion:{id}' para volver a lo mismo al regresar de un documento (R4, C2; r1, punto 2: la
 *    página N solo tiene sentido con el filtro con que se llegó a ella). Lo guardado se lee con useSyncExternalStore
 *    (en el servidor no hay sesión: sin desajuste de hidratación) y solo se escribe cuando el usuario cambia algo.
 *  - El modo ('lista' | 'kanban') es del usuario: vista:<id> con usePreferencia. Este hook es el ÚNICO escritor de
 *    vista:<id> (RP26): la pantalla le pasa modo={estado.modo} a ConmutadorVista, su onCambiar despacha
 *    {tipo: 'modo', valor} y no usa el hook de vista guardada de ConmutadorVista.tsx (sería un segundo escritor). La
 *    primera vez vale inicial.modo (el CRM, 'kanban').
 *  - El tamaño (25 | 50) es del usuario y se comparte con el tablero (porColumna = estado.tamano): la pieza {tamano}
 *    de tabla:<id> con usePreferenciaParte (escribirParte, RP26), al lado de las columnas de usePreferenciasTabla.
 * El usuario (r1, puntos 3 y 4): todo va con el usuario del token con que se pintó la pantalla. Lo que se cambió en
 * este montaje vale solo para ese usuario (sesionVigente): si el token pasa a otra cuenta (otra pestaña), la pantalla
 * vuelve a leer la sesión con el usuario nuevo (la de la cuenta anterior da {}) y arranca de `inicial`. La sesión se
 * firma con el usuario del render, y una acción despachada cuando el token ya es de otro (antes de que la pantalla lo
 * vea) no se guarda en ningún lado: ni la sesión, ni el modo, ni el tamaño.
 *
 * Las preferencias se leen después del montaje y nada se escribe antes de listo (D35 y D38: usePreferencia y
 * usePreferenciaParte ya lo resuelven). Mientras tanto el estado usa inicial.modo e inicial.tamano. El tercer valor,
 * `listo`, dice que ya se leyeron. r1, punto 5: para no pedir la lista con el tamaño por defecto y abortarla al llegar
 * el guardado, la pantalla pasa useListado({…, esperar: !listo}) (la tabla se ve cargando, no vacía). El tablero (D39)
 * espera igual: no carga hasta listo.
 * r2, punto 4: el `listo` que devuelve este hook pasa a true cuando los vínculos de las preferencias están listos o
 * cuando vence ESPERA_PREFERENCIAS_MS (4000 ms, lib/tabla.js) desde el montaje, lo que ocurra primero. Si el GET de
 * preferencias se cuelga (apiFetch no tiene tope), con esperar: !listo la tabla carga igual con los valores en memoria.
 * Las escrituras no cambian: siguen esperando el listo de su vínculo (T4A). El temporizador se limpia al desmontar.
 *
 * D39: si la pantalla tiene tablero, useTableroKanban recibe pantalla = este mismo id, porColumna = estado.tamano,
 * activo = listo && estado.modo === 'kanban' y dependencias = dependenciasTablero(estado) (lib/tabla.js). Regla:
 * mientras !listo, la pantalla pinta el esqueleto de la vista.
 *
 * `inicial` (por ejemplo {vista: 'todos', orden: 'atencion'}) se toma al montar, como el valor inicial de useState.
 * despachar es estable y se puede llamar varias veces seguidas: cada acción parte de lo que dejó la anterior.
 */

export type { AccionTabla, EstadoTabla, ModoTabla } from '@/lib/tabla';
export type DespacharTabla = (accion: AccionTabla) => void;

// ─── la sesión: sessionStorage 'tabla-sesion:{id}' ───────────────────────────────────────────────────────────────

// Lo último que se escribió en esta pestaña, por id: si sessionStorage falta o lanza (modo privado, lleno), la tabla
// recuerda igual mientras la app esté abierta.
const memoriaSesion = new Map<string, string | null>();

function leerSesion(id: string): string | null {
  if (memoriaSesion.has(id)) return memoriaSesion.get(id) ?? null;
  if (typeof window === 'undefined') return null;
  let texto: string | null = null;
  try {
    texto = window.sessionStorage.getItem(claveSesionTabla(id));
  } catch {
    // sin almacenamiento de la sesión: se empieza con lo de la pantalla
  }
  memoriaSesion.set(id, texto);
  return texto;
}

function escribirSesion(id: string, texto: string): void {
  memoriaSesion.set(id, texto);
  try {
    window.sessionStorage.setItem(claveSesionTabla(id), texto);
  } catch {
    // queda en memoria: vale hasta que se recargue la página
  }
}

// El texto guardado solo cambia cuando este mismo hook despacha (y entonces ya lo tiene en su estado): no hay a quién
// avisar. En el servidor (y al hidratar) no hay sesión.
const sinSuscripcion = () => () => {};
const sinSesionEnElServidor = () => null;

const esObjetoPlano = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);

type ParteTamano = { tamano?: unknown };
type Local = { id: string; usuario: number | null; sesion: SesionTabla };

/**
 * [estado, despachar, listo] de la pantalla `id` (el mismo id de usePreferenciasTabla y de useTableroKanban). Ver
 * arriba.
 */
export function useEstadoTabla(
  id: string,
  inicial: Partial<EstadoTabla> = {},
): [EstadoTabla, DespacharTabla, boolean] {
  const [inicialFijo] = useState(() => estadoTablaInicial(inicial));

  // La sesión guardada (al montar) y lo que el usuario cambió desde entonces (una sola actualización por acción), que
  // vale solo para esta pantalla y este usuario.
  const instantanea = useCallback(() => leerSesion(id), [id]);
  const textoGuardado = useSyncExternalStore(sinSuscripcion, instantanea, sinSesionEnElServidor);
  const [local, setLocal] = useState<Local | null>(null);
  const usuario = usuarioDeLaSesion();
  const sesion = useMemo(
    () => sesionVigente(local, { id, usuario, texto: textoGuardado }),
    [local, id, usuario, textoGuardado],
  );

  // Las preferencias del usuario (R4): el modo en vista:<id> y la pieza del tamaño en tabla:<id>.
  const [modo, guardarModo, modoListo] = usePreferencia<ModoTabla>(`vista:${id}`, inicialFijo.modo, { validar: esModoTabla });
  const tamanoPorDefecto = useMemo<ParteTamano>(() => ({ tamano: inicialFijo.tamano }), [inicialFijo]);
  const [tabla, guardarTabla, tablaListo] = usePreferenciaParte<ParteTamano>(`tabla:${id}`, tamanoPorDefecto, {
    validar: esObjetoPlano,
  });

  const estado = useMemo(
    () => armarEstadoTabla(inicialFijo, { sesion, modo, tamano: tabla.tamano }),
    [inicialFijo, sesion, modo, tabla.tamano],
  );

  // Lo último que se pintó y con qué usuario; despachar adelanta el estado, así que dos acciones seguidas no se pisan.
  const ultimo = useRef(estado);
  const usuarioDelRender = useRef(usuario);
  useLayoutEffect(() => {
    ultimo.current = estado;
    usuarioDelRender.current = usuario;
  }, [estado, usuario]);

  const despachar = useCallback((accion: AccionTabla) => {
    const actual = ultimo.current;
    const siguiente = reducirEstadoTabla(actual, accion);
    if (siguiente === actual) return;
    const escrituras = escriturasDeAccion(actual, siguiente, {
      usuarioRender: usuarioDelRender.current, usuarioToken: usuarioDeLaSesion(),
    });
    // El token ya es de otra cuenta: la acción se hizo sobre la pantalla de la anterior y no se guarda en ningún lado.
    if (!escrituras) return;
    ultimo.current = siguiente;
    if (escrituras.sesion !== null) {
      setLocal({ id, usuario: usuarioDelRender.current, sesion: siguiente });
      escribirSesion(id, escrituras.sesion);
    }
    if (escrituras.modo !== null) guardarModo(escrituras.modo);
    if (escrituras.tamano !== null) guardarTabla({ tamano: escrituras.tamano });
  }, [id, guardarModo, guardarTabla]);

  // r2, punto 4: el tope de espera de las preferencias, desde el montaje (se limpia al desmontar).
  const [vencido, setVencido] = useState(false);
  useEffect(
    () => esperarPreferencias({ alVencer: () => setVencido(true) }),
    [],
  );

  return [estado, despachar, listoConTope(modoListo && tablaListo, vencido)];
}
