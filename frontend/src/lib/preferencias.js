/**
 * Las preferencias de pantalla del usuario (Bloque 4, T3A: TABLA-base punto 2, R4, C2, RP24 y RP26): lo ÚNICO del
 * frontend que guarda preferencias (kanban.js, flujo.js y analisis.js no tocan el almacenamiento). JS plano, con el
 * almacén, el servidor y el temporizador inyectados, para probarlo con node (frontend/tests/test_preferencias.mjs).
 * components/ui/usePreferencia.ts (T4A) arma la instancia de la app (preferenciasApp) con localStorage, el
 * localStorage 'user_id' y apiFetch hacia /preferencias (backend/app/api/v1/preferencias.py, T1B).
 *
 *  - recordar_pantallas = «En tu usuario: igual en cualquier computador o celular». Ámbitos (los del servidor):
 *    tabla:<id> (anchos, orden, ocultas y el tamaño 25/50), vista:<pantalla> ('lista' | 'kanban'),
 *    kanban:<pantalla> (columnas plegadas), flujo:<id> (franja compacta) y analisis:<modulo> (período, top y foco).
 *  - La clave interna del almacén es 'pref:{usuarioId}:{clave}': dos usuarios del mismo equipo no se pisan. Sin un
 *    usuario válido (null, 0, NaN…) trabaja solo en memoria y no hace PUT ni GET.
 *  - claveValida usa la MISMA expresión del servidor (RP24); el tamaño se mide en bytes UTF-8 como el servidor
 *    (new TextEncoder().encode(JSON.stringify(valor)).length > 8192 se rechaza sin PUT).
 *  - Lee primero lo que hay en el almacén (o en memoria si el almacén falta o lanza, como en modo privado);
 *    precargar('') hace UN solo GET por sesión y llena el caché (un valor pendiente de enviar no lo pisa).
 *  - escribir guarda de inmediato en local y agrupa los PUT: uno por clave, 800 ms después del último cambio. Si un
 *    PUT falla por la red o con un 5xx, el valor queda local y se reintenta en el siguiente cambio (de cualquier
 *    clave); con un 401, un 422 u otro 4xx no se reintenta y queda un console.warn (RP24). Los envíos van uno detrás
 *    de otro: dos PUT de la misma clave no se cruzan.
 *  - escribirParte(clave, parcial) guarda {...leer(clave), ...parcial} (RP26): el tamaño (useEstadoTabla) y los
 *    anchos (usePreferenciasTabla) se escriben por separado en tabla:<id> y conviven.
 * El servidor inyectado es {leer(prefijo) -> Promise<{status, data: {clave: valor}} | {clave: valor}>,
 * guardar(clave, valor) -> Promise}; un error lleva .status (apiFetch) o no lleva (la red).
 */

import { congelar } from './estados-pedido.js';

/**
 * @typedef {{getItem(clave: string): string | null, setItem(clave: string, valor: string): void}} Almacen
 * @typedef {{leer(prefijo: string): Promise<unknown>, guardar(clave: string, valor: unknown): Promise<unknown>}} ServidorPreferencias
 * @typedef {{setTimeout(fn: () => void, ms: number): any, clearTimeout(id: any): void}} Temporizador
 * @typedef {{
 *   usuarioId: number | null,
 *   leer: (clave: string, porDefecto?: any) => any,
 *   escribir: (clave: string, valor: unknown) => boolean,
 *   escribirParte: (clave: string, parcial: Record<string, unknown>) => boolean,
 *   precargar: (prefijo?: string) => Promise<boolean>,
 *   vaciar: () => Promise<void>,
 *   listo: Promise<void>,
 *   estaLista: () => boolean,
 * }} Preferencias
 */

/** Los cinco ámbitos de R4 (los mismos del servidor). Inmutable. */
export const AMBITOS = congelar(['tabla', 'vista', 'kanban', 'flujo', 'analisis']);
/** La expresión de la clave, idéntica a CLAVE_VALIDA de backend/app/api/v1/preferencias.py (RP24). */
export const CLAVE_VALIDA = /^(tabla|vista|kanban|flujo|analisis):[a-z0-9._-]{1,80}$/;
/** El tope del valor serializado, en bytes UTF-8 (LIMITE_BYTES del servidor). */
export const LIMITE_BYTES = 8192;
/** Cuánto espera una ráfaga de escrituras antes de mandar el PUT. */
export const RETARDO_MS = 800;

/**
 * true si `clave` cumple la expresión del servidor ('tabla:ventas.hub'). En JS el '$' sin la bandera m solo calza al
 * final del texto: un salto de línea al final no pasa (como el fullmatch del servidor).
 * @param {unknown} clave
 * @returns {boolean}
 */
export function claveValida(clave) {
  return typeof clave === 'string' && CLAVE_VALIDA.test(clave);
}

/**
 * La clave del almacén: 'pref:{usuarioId}:{clave}'.
 * @param {number | string} usuarioId
 * @param {string} clave
 * @returns {string}
 */
export function claveInterna(usuarioId, clave) {
  return `pref:${usuarioId}:${clave}`;
}

const CODIFICADOR = new TextEncoder();

/** El JSON de `valor`, o null si no se puede serializar (circular, BigInt, undefined, una función). */
function aJson(valor) {
  try {
    const texto = JSON.stringify(valor);
    return typeof texto === 'string' ? texto : null;
  } catch {
    return null;
  }
}

/**
 * Lo que mide el servidor (RP24): los bytes UTF-8 del JSON compacto de `valor`. Lo que no se puede serializar da
 * Infinity.
 * @param {unknown} valor
 * @returns {number}
 */
export function tamanoEnBytes(valor) {
  const texto = aJson(valor);
  return texto === null ? Number.POSITIVE_INFINITY : CODIFICADOR.encode(texto).length;
}

const relojDelSistema = {
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (id) => globalThis.clearTimeout(id),
};

/** Un error que se arregla reintentando: la red (sin status numérico) o un 5xx. */
const esReintentable = (error) => {
  const status = /** @type {any} */ (error)?.status;
  return typeof status !== 'number' || status <= 0 || status >= 500;
};

/** El mapa {clave: valor} de la respuesta del GET: {status, data: {…}} o el mapa suelto. */
function mapaDeRespuesta(r) {
  const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
  if (!objeto(r)) return {};
  return objeto(r.data) ? r.data : r;
}

/**
 * Las preferencias de un usuario.
 * @param {{usuarioId?: unknown, almacen?: Almacen | null, servidor?: ServidorPreferencias | null, retardoMs?: number,
 *   temporizador?: Temporizador}} [opciones]
 * @returns {Preferencias}
 */
export function crearPreferencias({
  usuarioId, almacen = null, servidor = null, retardoMs = RETARDO_MS, temporizador = relojDelSistema,
} = {}) {
  const n = Number(usuarioId);
  const usuario = usuarioId !== null && usuarioId !== undefined && usuarioId !== '' && Number.isInteger(n) && n > 0 ? n : null;
  // Sin usuario válido: solo memoria (nada de 'pref:null:…' en el almacén ni PUT a la cuenta de nadie).
  const tienda = usuario === null ? null : almacen;
  const remoto = usuario === null ? null : servidor;

  /** clave -> texto JSON (lo último que se sabe). */
  const memoria = new Map();
  /** Claves con un cambio local que el servidor todavía no tiene. */
  const pendientes = new Set();
  /** prefijo -> Promise<boolean> de su precarga (una por sesión). */
  const precargas = new Map();
  /** @type {any} */
  let temporizadorId = null;
  let cola = Promise.resolve();
  let lista = remoto === null;
  /** @type {(valor?: any) => void} */
  let marcarLista = () => {};
  const listo = lista ? Promise.resolve() : new Promise((resolver) => { marcarLista = resolver; });

  const avisar = (/** @type {unknown[]} */ ...partes) => console.warn('[preferencias]', ...partes);

  function leerTexto(clave) {
    if (memoria.has(clave)) return memoria.get(clave);
    if (tienda) {
      try {
        const texto = tienda.getItem(claveInterna(/** @type {number} */ (usuario), clave));
        if (typeof texto === 'string') { memoria.set(clave, texto); return texto; }
      } catch { /* modo privado o almacén bloqueado: se trabaja en memoria */ }
    }
    return null;
  }

  function guardarLocal(clave, texto) {
    memoria.set(clave, texto);
    if (!tienda) return;
    try {
      tienda.setItem(claveInterna(/** @type {number} */ (usuario), clave), texto);
    } catch { /* lleno o bloqueado: queda en memoria */ }
  }

  /**
   * El valor guardado en `clave`, o `porDefecto` si no hay, si el JSON está dañado o si la clave no vale. Devuelve
   * una copia: mutarla no cambia lo guardado.
   * @param {string} clave
   * @param {any} [porDefecto]
   */
  function leer(clave, porDefecto = undefined) {
    if (!claveValida(clave)) return porDefecto;
    const texto = leerTexto(clave);
    if (texto === null) return porDefecto;
    try {
      return JSON.parse(texto);
    } catch {
      return porDefecto;
    }
  }

  async function enviarPendientes() {
    if (!remoto || !pendientes.size) return;
    const lote = [...pendientes].map((clave) => [clave, memoria.get(clave)]);
    pendientes.clear();
    await Promise.all(lote.map(async ([clave, texto]) => {
      try {
        await remoto.guardar(clave, JSON.parse(/** @type {string} */ (texto)));
      } catch (error) {
        const e = /** @type {any} */ (error);
        if (esReintentable(error)) {
          // Queda local y sale con el siguiente cambio (si mientras tanto hubo otro, ya está pendiente).
          pendientes.add(clave);
          avisar(`No se pudo guardar ${clave} en el servidor; se reintenta en el siguiente cambio.`, e?.status ?? e?.message ?? '');
        } else {
          avisar(`El servidor no aceptó ${clave} (${e.status}): queda solo en este equipo.`, e?.detail ?? e?.message ?? '');
        }
      }
    }));
  }

  /** Encola un envío: los PUT salen uno detrás de otro (nunca dos de la misma clave a la vez). */
  function enviar() {
    cola = cola.then(enviarPendientes, enviarPendientes);
    return cola;
  }

  function programar() {
    if (temporizadorId !== null) temporizador.clearTimeout(temporizadorId);
    temporizadorId = temporizador.setTimeout(() => {
      temporizadorId = null;
      enviar();
    }, retardoMs);
  }

  /**
   * Guarda `valor` en `clave`: de inmediato en local y, con servidor, en un PUT agrupado (RETARDO_MS después del
   * último cambio). Devuelve false, sin lanzar y con un console.warn, si la clave no vale, si el valor no se puede
   * serializar o si pasa de LIMITE_BYTES en bytes UTF-8 (no hay PUT). Escribir lo mismo que ya está y no está
   * pendiente no manda nada.
   * @param {string} clave
   * @param {unknown} valor
   * @returns {boolean}
   */
  function escribir(clave, valor) {
    if (!claveValida(clave)) {
      avisar(`Clave de preferencia no válida: ${String(clave)}`);
      return false;
    }
    const texto = aJson(valor);
    if (texto === null) {
      avisar(`El valor de ${clave} no se puede guardar como JSON.`);
      return false;
    }
    if (CODIFICADOR.encode(texto).length > LIMITE_BYTES) {
      avisar(`El valor de ${clave} pasa de 8 KB (${LIMITE_BYTES} bytes): no se guarda.`);
      return false;
    }
    if (leerTexto(clave) === texto && !pendientes.has(clave)) return true;
    guardarLocal(clave, texto);
    if (remoto) {
      pendientes.add(clave);
      programar();
    }
    return true;
  }

  /**
   * Guarda {...leer(clave), ...parcial} (RP26). Si lo guardado no es un objeto, la parte arranca de cero.
   * @param {string} clave
   * @param {Record<string, unknown>} parcial
   * @returns {boolean}
   */
  function escribirParte(clave, parcial) {
    const actual = leer(clave);
    const base = actual !== null && typeof actual === 'object' && !Array.isArray(actual) ? actual : {};
    const parte = parcial !== null && typeof parcial === 'object' && !Array.isArray(parcial) ? parcial : {};
    return escribir(clave, { ...base, ...parte });
  }

  /**
   * Trae del servidor las preferencias que empiezan por `prefijo` ('' = todas) con UN GET por sesión: si ya se
   * precargó ese prefijo o uno que lo cubre (''), devuelve la misma promesa. Lo que llega pasa al caché y al almacén,
   * salvo las claves con un cambio local pendiente y las que no cumplen la expresión. Resuelve true si cargó y false
   * si falló (sigue con lo local, y una precarga posterior lo vuelve a intentar); nunca rechaza. La primera que
   * termina deja `listo` resuelto. Sin servidor (o sin usuario), resuelve true de inmediato.
   * @param {string} [prefijo]
   * @returns {Promise<boolean>}
   */
  function precargar(prefijo = '') {
    if (!remoto) return Promise.resolve(true);
    const p = typeof prefijo === 'string' ? prefijo : '';
    for (const [hecho, promesa] of precargas) if (p.startsWith(hecho)) return promesa;
    const promesa = Promise.resolve()
      .then(() => remoto.leer(p))
      .then((respuesta) => {
        for (const [clave, valor] of Object.entries(mapaDeRespuesta(respuesta))) {
          if (!claveValida(clave) || !clave.startsWith(p) || pendientes.has(clave)) continue;
          const texto = aJson(valor);
          if (texto !== null) guardarLocal(clave, texto);
        }
        return true;
      }, (error) => {
        precargas.delete(p);
        avisar('No se pudieron traer las preferencias del servidor; se usan las de este equipo.', /** @type {any} */ (error)?.message ?? '');
        return false;
      })
      .then((ok) => {
        lista = true;
        marcarLista();
        return ok;
      });
    precargas.set(p, promesa);
    return promesa;
  }

  /**
   * Manda ya lo pendiente (sin esperar el temporizador, que se cancela). Resuelve cuando terminan los PUT.
   * @returns {Promise<void>}
   */
  function vaciar() {
    if (temporizadorId !== null) {
      temporizador.clearTimeout(temporizadorId);
      temporizadorId = null;
    }
    return enviar();
  }

  return {
    usuarioId: usuario,
    leer,
    escribir,
    escribirParte,
    precargar,
    vaciar,
    listo,
    estaLista: () => lista,
  };
}
