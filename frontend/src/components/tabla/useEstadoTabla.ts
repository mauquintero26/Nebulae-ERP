'use client';

import { useCallback, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { getToken } from '@/lib/api';
import { usuarioDelToken } from '@/lib/preferencias';
import {
  armarEstadoTabla, cambiosEstadoTabla, claveSesionTabla, esModoTabla, estadoTablaInicial, leerSesionTabla,
  reducirEstadoTabla, textoSesionTabla,
} from '@/lib/tabla';
import type { AccionTabla, EstadoTabla, ModoTabla, SesionTabla } from '@/lib/tabla';
import { usePreferencia, usePreferenciaParte } from '@/components/ui/usePreferencia';

/**
 * El estado ÚNICO de una pantalla con tabla estándar (Bloque 4, T4C; TABLA-base punto 3, R4, R5, C2, C3, RP26 y D39):
 * {vista (la pestaña), modo, semaforo, paso, estados, q, orden, pagina, tamano}. Las tarjetas pulsables, las cajas del
 * flujo, los botones del semáforo, las pestañas, la búsqueda y el filtro de estados despachan acciones al reductor
 * (reducirEstadoTabla de lib/tabla.js): todo cambio que no sea de página vuelve a la página 1. La tabla y el tablero
 * leen este mismo estado y lo mandan al servidor (useListado y el `cargar` de useTableroKanban).
 *
 * Cada campo vive en UN lugar (cambiosEstadoTabla dice qué se escribe después de cada acción):
 *  - La pestaña, la página, la búsqueda, el orden, el semáforo y el paso son de la SESIÓN: van a sessionStorage
 *    'tabla-sesion:{id}' para volver a lo mismo al regresar de un documento (R4, C2). Se leen con useSyncExternalStore
 *    (en el servidor no hay sesión: sin desajuste de hidratación) y solo se escriben cuando el usuario cambia algo.
 *    Van con el usuario del token: la sesión de otra cuenta en la misma pestaña no se restaura.
 *  - El modo ('lista' | 'kanban') es del usuario: vista:<id> con usePreferencia. Este hook es el ÚNICO escritor de
 *    vista:<id> (RP26): la pantalla le pasa modo={estado.modo} a ConmutadorVista, su onCambiar despacha
 *    {tipo: 'modo', valor} y no usa el hook de vista guardada de ConmutadorVista.tsx (sería un segundo escritor). La
 *    primera vez vale inicial.modo (el CRM, 'kanban').
 *  - El tamaño (25 | 50) es del usuario y se comparte con el tablero (porColumna = estado.tamano): la pieza {tamano}
 *    de tabla:<id> con usePreferenciaParte (escribirParte, RP26), al lado de las columnas de usePreferenciasTabla.
 *  - El filtro de estados es de la pantalla mientras está abierta (no se guarda).
 * Las preferencias se leen después del montaje y nada se escribe antes de listo (D35 y D38: usePreferencia y
 * usePreferenciaParte ya lo resuelven). Mientras tanto el estado usa inicial.modo e inicial.tamano; el tercer valor,
 * `listo`, dice que ya se leyeron (la pantalla puede pintar el esqueleto de la vista hasta entonces).
 *
 * D39: si la pantalla tiene tablero, useTableroKanban recibe pantalla = este mismo id, porColumna = estado.tamano,
 * activo = estado.modo === 'kanban' y dependencias = dependenciasTablero(estado) (lib/tabla.js).
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

function usuarioDeLaSesion(): number | null {
  try {
    return usuarioDelToken(getToken());
  } catch {
    return null;
  }
}

const esObjetoPlano = (v: unknown) => v !== null && typeof v === 'object' && !Array.isArray(v);

type ParteTamano = { tamano?: unknown };
type Local = { id: string; sesion: SesionTabla | null; estados: string[] };

/**
 * [estado, despachar, listo] de la pantalla `id` (el mismo id de usePreferenciasTabla y de useTableroKanban). Ver
 * arriba.
 */
export function useEstadoTabla(
  id: string,
  inicial: Partial<EstadoTabla> = {},
): [EstadoTabla, DespacharTabla, boolean] {
  const [inicialFijo] = useState(() => estadoTablaInicial(inicial));

  // La sesión guardada (al montar) y lo que el usuario cambió desde entonces (una sola actualización por acción).
  const instantanea = useCallback(() => leerSesion(id), [id]);
  const textoGuardado = useSyncExternalStore(sinSuscripcion, instantanea, sinSesionEnElServidor);
  const [local, setLocal] = useState<Local>(() => ({ id, sesion: null, estados: inicialFijo.estados }));
  const vigente = local.id === id ? local : null;
  const usuario = usuarioDeLaSesion();
  const sesion = useMemo(
    () => vigente?.sesion ?? leerSesionTabla(textoGuardado, usuario),
    [vigente, textoGuardado, usuario],
  );
  const estados = vigente ? vigente.estados : inicialFijo.estados;

  // Las preferencias del usuario (R4): el modo en vista:<id> y la pieza del tamaño en tabla:<id>.
  const [modo, guardarModo, modoListo] = usePreferencia<ModoTabla>(`vista:${id}`, inicialFijo.modo, { validar: esModoTabla });
  const tamanoPorDefecto = useMemo<ParteTamano>(() => ({ tamano: inicialFijo.tamano }), [inicialFijo]);
  const [tabla, guardarTabla, tablaListo] = usePreferenciaParte<ParteTamano>(`tabla:${id}`, tamanoPorDefecto, {
    validar: esObjetoPlano,
  });

  const estado = useMemo(
    () => armarEstadoTabla(inicialFijo, { sesion, estados, modo, tamano: tabla.tamano }),
    [inicialFijo, sesion, estados, modo, tabla.tamano],
  );

  // Lo último que se pintó; despachar lo adelanta, así que dos acciones seguidas no se pisan.
  const ultimo = useRef(estado);
  useLayoutEffect(() => {
    ultimo.current = estado;
  }, [estado]);

  const despachar = useCallback((accion: AccionTabla) => {
    const actual = ultimo.current;
    const siguiente = reducirEstadoTabla(actual, accion);
    if (siguiente === actual) return;
    ultimo.current = siguiente;
    const cambios = cambiosEstadoTabla(actual, siguiente);
    if (cambios.sesion || cambios.estados) setLocal({ id, sesion: siguiente, estados: siguiente.estados });
    if (cambios.sesion) escribirSesion(id, textoSesionTabla(siguiente, usuarioDeLaSesion()));
    if (cambios.modo) guardarModo(siguiente.modo);
    if (cambios.tamano) guardarTabla({ tamano: siguiente.tamano });
  }, [id, guardarModo, guardarTabla]);

  return [estado, despachar, modoListo && tablaListo];
}
