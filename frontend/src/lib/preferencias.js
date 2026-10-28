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
 *    (new TextEncoder().encode(JSON.stringify(valor)).length > 8192 se rechaza sin PUT), y más de 32 niveles
 *    anidados también se rechaza (pasaDeNiveles, el pasa_de_niveles del servidor).
 *  - Lee primero lo que hay en el almacén (o en memoria si el almacén falta o lanza, como en modo privado);
 *    precargar('') hace UN solo GET por sesión y llena el caché. El GET nunca pisa una clave que esta instancia
 *    escribió (las «tocadas»), ni mientras su PUT está en camino ni después: si el GET llega tarde, gana lo local.
 *  - escribir guarda de inmediato en local y agrupa los PUT: uno por clave, 800 ms después del último cambio. Si un
 *    PUT falla por la red o con un 5xx, el valor queda local y se reintenta en el siguiente cambio (de cualquier
 *    clave); con un 401, un 422 u otro 4xx no se reintenta y queda un console.warn (RP24). Los envíos van uno detrás
 *    de otro: dos PUT de la misma clave no se cruzan.
 *  - escribirParte(clave, parcial) guarda {...leer(clave), ...parcial} (RP26): el tamaño (useEstadoTabla) y los
 *    anchos (usePreferenciasTabla) se escriben por separado en tabla:<id> y conviven.
 *  - cerrar() deja la instancia muda: cancela el temporizador y descarta lo pendiente sin PUT (al cambiar de usuario,
 *    T4A la cierra: un PUT pendiente saldría con la sesión del usuario nuevo y escribiría en la cuenta del otro).
 *  - T4A (RP25, D35): crearPreferenciasPorUsuario da la instancia del usuario actual (al cambiar de usuario cierra la
 *    vieja ANTES de crear la nueva) y vincularPreferencia es la regla de los hooks: nada se escribe antes de `listo`.
 *  - T4A r1: el usuario de las preferencias es el del TOKEN (usuarioDeSesion: el user_id de AuthGuard solo si es el sub
 *    del JWT vigente) y cada instancia comprueba antes de cada GET y PUT que el token sigue siendo de su usuario
 *    (servidorDeUsuario); crearPreferenciasDeSesion arma las dos cosas para usePreferencia.ts. Si la precarga falló,
 *    las partes (escribirParte) esperan en memoria, sin PUT, hasta una precarga buena (cada escritura la reintenta
 *    una vez).
 * El servidor inyectado es {leer(prefijo) -> Promise<{status, data: {clave: valor}} | {clave: valor}>,
 * guardar(clave, valor) -> Promise}; un error lleva .status (apiFetch) o no lleva (la red).
 */

import { congelar } from './estados-pedido.js';
import { leerPayload } from './session.js';

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
 *   cerrar: () => void,
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
/** Los niveles anidados que acepta el servidor (MAXIMO_NIVELES de backend/app/api/v1/preferencias.py). */
export const MAXIMO_NIVELES = 32;

/**
 * true si `valor` tiene más de `maximo` arreglos u objetos uno dentro de otro (un escalar tiene 0; [1] y {a: 1}, 1),
 * como pasa_de_niveles del servidor. Recorrido iterativo con una pila, sin recursión: miles de niveles (o un valor
 * circular) no desbordan la pila.
 * @param {unknown} valor
 * @param {number} [maximo]
 * @returns {boolean}
 */
export function pasaDeNiveles(valor, maximo = MAXIMO_NIVELES) {
  const contenedor = (v) => v !== null && typeof v === 'object';
  /** @type {[any, number][]} */
  const pila = contenedor(valor) ? [[valor, 1]] : [];
  while (pila.length) {
    const [actual, nivel] = /** @type {[any, number]} */ (pila.pop());
    if (nivel > maximo) return true;
    for (const hijo of Array.isArray(actual) ? actual : Object.values(actual)) {
      if (contenedor(hijo)) pila.push([hijo, nivel + 1]);
    }
  }
  return false;
}

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
 * El id de un usuario (el localStorage 'user_id' que escribe AuthGuard, RP25): un entero positivo, o null si no hay un
 * id válido (null, '', '0', 'abc', '7.5', '-3', NaN…).
 * @param {unknown} valor
 * @returns {number | null}
 */
export function normalizarUsuario(valor) {
  const n = Number(valor);
  return valor !== null && valor !== undefined && valor !== '' && Number.isInteger(n) && n > 0 ? n : null;
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
  const usuario = normalizarUsuario(usuarioId);
  // Sin usuario válido: solo memoria (nada de 'pref:null:…' en el almacén ni PUT a la cuenta de nadie).
  const tienda = usuario === null ? null : almacen;
  const remoto = usuario === null ? null : servidor;

  /** clave -> texto JSON (lo último que se sabe). */
  const memoria = new Map();
  /** Claves con un cambio local que el servidor todavía no tiene (su PUT no ha salido o falló por la red). */
  const pendientes = new Set();
  /**
   * Claves que esta instancia escribió desde que se creó: el GET de una precarga nunca las pisa, estén pendientes,
   * con su PUT en camino o ya confirmadas (lo local es más nuevo que lo que traiga un GET de esta misma sesión).
   */
  const tocadas = new Set();
  let cerrada = false;
  /** prefijo -> Promise<boolean> de su precarga (una por sesión). */
  const precargas = new Map();
  /** T4A r1: la última precarga('') falló y ninguna salió bien desde entonces. */
  let precargaFallo = false;
  /**
   * T4A r1: clave -> las partes escritas mientras precargaFallo (solo en memoria, sin PUT): la copia local puede no
   * tener las partes que hay en el servidor. Con la primera precarga buena se escriben sobre lo que trajo el servidor.
   */
  const partesEnEspera = new Map();
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

  /** Lo guardado (memoria o almacén), sin las partes en espera. */
  function leerGuardado(clave, porDefecto) {
    if (!claveValida(clave)) return porDefecto;
    const texto = leerTexto(clave);
    if (texto === null) return porDefecto;
    try {
      return JSON.parse(texto);
    } catch {
      return porDefecto;
    }
  }

  /**
   * El valor guardado en `clave`, o `porDefecto` si no hay, si el JSON está dañado o si la clave no vale, con las partes
   * que esperan una precarga buena encima. Devuelve una copia: mutarla no cambia lo guardado.
   * @param {string} clave
   * @param {any} [porDefecto]
   */
  function leer(clave, porDefecto = undefined) {
    const guardado = leerGuardado(clave, porDefecto);
    const espera = partesEnEspera.get(clave);
    if (!espera) return guardado;
    return { ...(esObjetoPlano(guardado) ? guardado : {}), ...espera };
  }

  async function enviarPendientes() {
    if (!remoto || cerrada || !pendientes.size) return;
    const lote = [...pendientes].map((clave) => [clave, memoria.get(clave)]);
    pendientes.clear();
    await Promise.all(lote.map(async ([clave, texto]) => {
      try {
        await remoto.guardar(clave, JSON.parse(/** @type {string} */ (texto)));
      } catch (error) {
        const e = /** @type {any} */ (error);
        if (cerrada) {
          // Cerrada (cambió el usuario): no se reintenta; saldría con la sesión de otro.
          avisar(`No se pudo guardar ${clave} en el servidor y la sesión ya se cerró: no se reintenta.`);
        } else if (esReintentable(error)) {
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

  /** El JSON de `valor` si se puede guardar en `clave`, o null con un console.warn (clave, JSON, 8 KB y niveles). */
  function textoGuardable(clave, valor) {
    if (!claveValida(clave)) {
      avisar(`Clave de preferencia no válida: ${String(clave)}`);
      return null;
    }
    const texto = aJson(valor);
    if (texto === null) {
      avisar(`El valor de ${clave} no se puede guardar como JSON.`);
      return null;
    }
    if (CODIFICADOR.encode(texto).length > LIMITE_BYTES) {
      avisar(`El valor de ${clave} pasa de 8 KB (${LIMITE_BYTES} bytes): no se guarda.`);
      return null;
    }
    // Sobre el JSON, como el servidor: un Date es un texto y un valor circular ya cayó arriba (no se serializa).
    if (pasaDeNiveles(JSON.parse(texto))) {
      avisar(`El valor de ${clave} tiene demasiados niveles anidados (máximo ${MAXIMO_NIVELES}): no se guarda.`);
      return null;
    }
    return texto;
  }

  /**
   * T4A r1: si la última precarga('') falló, la vuelve a pedir, una vez por escritura (si ya va una en camino,
   * precargar devuelve esa misma y no sale otro GET).
   */
  function reintentarPrecarga() {
    if (!remoto || cerrada || !precargaFallo) return;
    precargar('');
  }

  /**
   * Guarda `valor` en `clave`: de inmediato en local y, con servidor, en un PUT agrupado (RETARDO_MS después del
   * último cambio). Devuelve false, sin lanzar y con un console.warn, si la clave no vale, si el valor no se puede
   * serializar, si pasa de LIMITE_BYTES en bytes UTF-8 o si su JSON tiene más de MAXIMO_NIVELES niveles anidados
   * (no toca el almacén ni hay PUT). Después de cerrar() devuelve false y no hace nada. Escribir lo mismo que ya está y no está
   * pendiente no manda nada. Si la precarga falló, la pide otra vez (T4A r1) y el valor sube igual: reemplaza la clave
   * entera, así que no borra partes ajenas.
   * @param {string} clave
   * @param {unknown} valor
   * @returns {boolean}
   */
  function escribir(clave, valor) {
    if (cerrada) return false;
    const texto = textoGuardable(clave, valor);
    if (texto === null) return false;
    // Un valor completo reemplaza la clave entera (no borra partes ajenas): sube aunque la precarga haya fallado, y
    // deja sin efecto las partes de esa clave que esperaban.
    partesEnEspera.delete(clave);
    reintentarPrecarga();
    if (leerTexto(clave) === texto && !pendientes.has(clave)) return true;
    guardarLocal(clave, texto);
    if (remoto) {
      tocadas.add(clave);
      pendientes.add(clave);
      programar();
    }
    return true;
  }

  /**
   * Guarda {...leer(clave), ...parcial} (RP26). Si lo guardado no es un objeto, la parte arranca de cero.
   * Regla para los hooks (T4A): no se llama antes de `listo`. En un equipo sin copia local, una parte escrita antes de
   * la precarga mezcla con {} y su PUT borraría en el servidor las otras partes de la clave.
   * T4A r1: si la precarga falló (y ninguna salió bien desde entonces), la parte queda solo en memoria, sin PUT ni
   * almacén (leer ya la ve), y se pide otra precarga, una vez por escritura. Con la primera precarga buena, las partes
   * en espera se escriben sobre lo que trajo el servidor.
   * @param {string} clave
   * @param {Record<string, unknown>} parcial
   * @returns {boolean}
   */
  function escribirParte(clave, parcial) {
    if (cerrada) return false;
    const parte = esObjetoPlano(parcial) ? parcial : {};
    if (remoto && precargaFallo) {
      const espera = { ...(partesEnEspera.get(clave) ?? {}), ...parte };
      const guardado = leerGuardado(clave, undefined);
      if (textoGuardable(clave, { ...(esObjetoPlano(guardado) ? guardado : {}), ...espera }) === null) return false;
      partesEnEspera.set(clave, espera);
      reintentarPrecarga();
      return true;
    }
    const actual = leer(clave);
    return escribir(clave, { ...(esObjetoPlano(actual) ? actual : {}), ...parte });
  }

  /**
   * T4A r1: con una precarga buena, las partes en espera se escriben sobre lo guardado (lo que trajo el servidor).
   * T4A r2: si la mezcla no cabe (pasa de 8 KB o de 32 niveles; escribir ya dejó su console.warn), la parte sigue en
   * memoria, con su aviso, y no se descarta en silencio.
   */
  function escribirPartesEnEspera() {
    for (const [clave, espera] of [...partesEnEspera]) {
      partesEnEspera.delete(clave);
      const guardado = leerGuardado(clave, undefined);
      if (!escribir(clave, { ...(esObjetoPlano(guardado) ? guardado : {}), ...espera })) {
        partesEnEspera.set(clave, espera);
        avisar(`La parte de ${clave} no cabe con lo que trajo el servidor: queda solo en memoria.`);
      }
    }
  }

  /**
   * Trae del servidor las preferencias que empiezan por `prefijo` ('' = todas) con UN GET por sesión: si ya se
   * precargó ese prefijo o uno que lo cubre (''), devuelve la misma promesa. Lo que llega pasa al caché y al almacén,
   * salvo las claves que esta instancia escribió (pendientes, con su PUT en camino o ya confirmadas: si el GET llega
   * tarde, gana lo local) y las que no cumplen la expresión. Resuelve true si cargó y false si falló (sigue con lo
   * local, y una precarga posterior lo vuelve a intentar); nunca rechaza. La primera que termina deja `listo`
   * resuelto. Sin servidor (o sin usuario), resuelve true de inmediato; después de cerrar(), false sin GET.
   * T4A r1: si la de '' falla, cada escritura siguiente la vuelve a pedir una vez (reintentarPrecarga, sin bucle), y
   * cuando una sale bien escribe las partes que esperaban (escribirPartesEnEspera).
   * Límite conocido: lo pendiente no sobrevive a una recarga de la página. El valor queda en el almacén, pero la
   * precarga de la sesión siguiente lo pisa con el del servidor si el PUT nunca llegó.
   * @param {string} [prefijo]
   * @returns {Promise<boolean>}
   */
  function precargar(prefijo = '') {
    if (cerrada) return Promise.resolve(false);
    if (!remoto) return Promise.resolve(true);
    const p = typeof prefijo === 'string' ? prefijo : '';
    for (const [hecho, promesa] of precargas) if (p.startsWith(hecho)) return promesa;
    const promesa = Promise.resolve()
      .then(() => (cerrada ? null : remoto.leer(p))) // un cerrar() del mismo tic no deja salir el GET
      .then((respuesta) => {
        if (cerrada) return false;
        for (const [clave, valor] of Object.entries(mapaDeRespuesta(respuesta))) {
          // Toda clave pendiente está también en tocadas: basta con mirar tocadas.
          if (!claveValida(clave) || !clave.startsWith(p) || tocadas.has(clave)) continue;
          const texto = aJson(valor);
          if (texto !== null) guardarLocal(clave, texto);
        }
        if (p === '') {
          precargaFallo = false;
          escribirPartesEnEspera();
        }
        return true;
      }, (error) => {
        precargas.delete(p);
        if (p === '' && !cerrada) precargaFallo = true;
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

  /**
   * Deja la instancia muda (al cambiar de usuario): cancela el temporizador y descarta lo pendiente sin PUT. Desde
   * aquí escribir y escribirParte devuelven false y no hacen nada, precargar resuelve false sin GET, una precarga que
   * ya estaba en camino no escribe lo que traiga, y un PUT que ya estaba en camino y falla no se reintenta. `listo`
   * queda resuelto. leer sigue leyendo lo de este usuario.
   */
  function cerrar() {
    cerrada = true;
    if (temporizadorId !== null) {
      temporizador.clearTimeout(temporizadorId);
      temporizadorId = null;
    }
    pendientes.clear();
    partesEnEspera.clear();
    // Nadie queda esperando una precarga que ya no va a escribir nada.
    lista = true;
    marcarLista();
  }

  return {
    usuarioId: usuario,
    leer,
    escribir,
    escribirParte,
    precargar,
    vaciar,
    cerrar,
    listo,
    estaLista: () => lista,
  };
}

// ─── T4A: la instancia de la app por usuario y el vínculo de los hooks (RP25, RP26 y D35) ──────────────────────────

/**
 * La instancia de preferencias del usuario que está usando la app (RP25). components/ui/usePreferencia.ts (T4A) arma
 * con esto preferenciasApp(): `leerUsuario` lee el localStorage 'user_id' de AuthGuard y `crear` llama a
 * crearPreferencias con localStorage y el servidor.
 *  - obtener() lee el usuario EN CADA LLAMADA (si leer lanza, cuenta como sin usuario). Con el mismo usuario devuelve la
 *    misma instancia. Si cambió, primero llama a cerrar() de la vieja y DESPUÉS crea la nueva (D35: si no, un PUT
 *    pendiente del usuario anterior saldría con la sesión del nuevo), le hace precargar('') (un solo GET por sesión) y
 *    avisa a los oyentes de alCambiar.
 *  - Sin un id válido (normalizarUsuario da null) la instancia trabaja solo en memoria y no hace PUT ni GET.
 *  - Crear el gestor no lee nada: la primera instancia nace en la primera llamada a obtener().
 * Un oyente que lanza deja un console.warn y no impide avisar a los demás.
 * @param {{leerUsuario: () => unknown, crear: (usuarioId: number | null) => Preferencias}} opciones
 * @returns {{obtener: () => Preferencias, alCambiar: (oyente: (instancia: Preferencias) => void) => () => void}}
 */
export function crearPreferenciasPorUsuario({ leerUsuario, crear }) {
  /** @type {{usuarioId: number | null, instancia: Preferencias} | null} */
  let actual = null;
  /** @type {Set<(instancia: Preferencias) => void>} */
  const oyentes = new Set();

  function usuarioActual() {
    try {
      return normalizarUsuario(leerUsuario());
    } catch {
      return null; // localStorage bloqueado (o del lado del servidor): sin usuario, solo memoria
    }
  }

  function obtener() {
    const usuarioId = usuarioActual();
    if (actual && actual.usuarioId === usuarioId) return actual.instancia;
    // D35: la vieja se cierra ANTES de crear la nueva.
    if (actual) actual.instancia.cerrar();
    const instancia = crear(usuarioId);
    actual = { usuarioId, instancia };
    instancia.precargar('');
    for (const oyente of [...oyentes]) {
      try {
        oyente(instancia);
      } catch (error) {
        console.warn('[preferencias] Un oyente del cambio de usuario falló.', /** @type {any} */ (error)?.message ?? '');
      }
    }
    return instancia;
  }

  /** @param {(instancia: Preferencias) => void} oyente */
  function alCambiar(oyente) {
    oyentes.add(oyente);
    return () => { oyentes.delete(oyente); };
  }

  return { obtener, alCambiar };
}

const SIN_VALOR = Symbol('sin valor');
const esObjetoPlano = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * @template T
 * @typedef {{valor: T, listo: boolean}} EstadoPreferencia
 */

/**
 * El vínculo entre un hook (usePreferencia, T4A) y una clave de preferencias. JS plano para probar con node la regla
 * D35, que usePreferencia solo envuelve en estado de React:
 *  - Hasta que la instancia está `listo`, el valor es `porDefecto` en memoria y NO se escribe nada: ni al crear el
 *    vínculo (tampoco el valor por defecto) ni al guardar. Lo que se guarda antes de listo se ve en memoria y se
 *    escribe recién con listo; gana sobre lo que trajo el servidor (es lo último que eligió el usuario).
 *  - Con listo, el valor es lo guardado (si no hay, o si `validar` lo rechaza, `porDefecto`), y guardar escribe de
 *    inmediato (escribir de lib/preferencias.js: local ya, PUT agrupado).
 *  - `parte: true` (RP26, para las claves con dos dueños como tabla:<id>): guardar recibe una parte del objeto y la
 *    escribe con escribirParte, también solo con listo (antes de listo, una parte se mezclaría con {} y su PUT borraría
 *    en el servidor las otras partes). El valor es {...porDefecto, ...lo guardado}.
 *  - El usuario puede cambiar (RP25): obtener() devuelve otra instancia. revisarUsuario() y guardar() lo notan; el
 *    vínculo pasa a la instancia nueva con `porDefecto` y listo = false hasta que esa esté lista, y descarta lo que
 *    tenía sin escribir (era la pantalla del usuario anterior: no se guarda en la cuenta de otro). Un `listo` que llega
 *    de una instancia que ya no es la del vínculo (por ejemplo el de cerrar()) no publica nada.
 *  - Crear el vínculo no publica: alCambiar se llama solo cuando el estado cambia (con listo o al guardar). soltar()
 *    (el componente se desmontó) lo deja mudo.
 * @template T
 * @param {{obtener: () => Preferencias, clave: string, porDefecto: T, alCambiar: (estado: EstadoPreferencia<T>) => void,
 *   validar?: ((valor: unknown) => boolean) | null, parte?: boolean}} opciones
 * @returns {{
 *   estado: () => EstadoPreferencia<T>,
 *   guardar: (entrada: T | Partial<T> | ((anterior: T) => T | Partial<T>)) => void,
 *   revisarUsuario: () => void,
 *   soltar: () => void,
 * }}
 */
export function vincularPreferencia({ obtener, clave, porDefecto, alCambiar, validar = null, parte = false }) {
  /** @type {Preferencias} */
  let instancia = obtener();
  /** @type {EstadoPreferencia<T>} */
  let estado = { valor: porDefecto, listo: false };
  /** Lo que se guardó antes de listo (el valor completo o, con parte, la suma de las partes). */
  let pendiente = /** @type {any} */ (SIN_VALOR);
  let suelto = false;

  // Quien llama ya miró `suelto` (guardar, revisarUsuario y alListo salen antes).
  const publicar = (/** @type {EstadoPreferencia<T>} */ nuevo) => {
    estado = nuevo;
    alCambiar(estado);
  };

  /** Lo guardado en la instancia, validado y (con parte) sobre el valor por defecto. */
  function leerGuardado(/** @type {Preferencias} */ inst) {
    const leido = inst.leer(clave, SIN_VALOR);
    let valor = leido === SIN_VALOR || (validar && !validar(leido)) ? porDefecto : leido;
    if (parte && esObjetoPlano(porDefecto) && esObjetoPlano(valor)) valor = { ...porDefecto, ...valor };
    return /** @type {T} */ (valor);
  }

  function alListo(/** @type {Preferencias} */ inst) {
    if (suelto || inst !== instancia) return;
    let valor;
    if (pendiente === SIN_VALOR) {
      valor = leerGuardado(inst);
    } else if (parte) {
      inst.escribirParte(clave, pendiente);
      pendiente = SIN_VALOR;
      valor = leerGuardado(inst);
    } else {
      inst.escribir(clave, pendiente);
      valor = pendiente;
      pendiente = SIN_VALOR;
    }
    publicar({ valor, listo: true });
  }

  function esperar(/** @type {Preferencias} */ inst) {
    inst.listo.then(() => alListo(inst));
  }

  /** Pasa a la instancia nueva: porDefecto, sin listo y sin lo pendiente del usuario anterior. */
  function enlazar(/** @type {Preferencias} */ inst) {
    instancia = inst;
    pendiente = SIN_VALOR;
    publicar({ valor: porDefecto, listo: false });
    esperar(inst);
  }

  function revisarUsuario() {
    if (suelto) return;
    const actual = obtener();
    if (actual !== instancia) enlazar(actual);
  }

  function guardar(entrada) {
    if (suelto) return;
    // T4A r2: la instancia se toma ANTES de obtener(). Si el usuario cambió sin que el hook se enterara, obtener() crea
    // la instancia nueva y avisa a los oyentes; el de usePreferencia (revisarUsuario) puede enlazarla antes de que
    // guardar compare. Comparando con la previa, lo que esta pantalla armó con los datos del otro usuario se descarta
    // igual: no va a la cuenta del nuevo.
    const previa = instancia;
    const actual = obtener();
    if (actual !== previa) {
      if (instancia !== actual) enlazar(actual);
      return;
    }
    const nuevo = typeof entrada === 'function' ? entrada(estado.valor) : entrada;
    if (parte) {
      const pieza = esObjetoPlano(nuevo) ? nuevo : {};
      const valor = /** @type {T} */ ({ ...(esObjetoPlano(estado.valor) ? estado.valor : {}), ...pieza });
      if (!estado.listo) {
        pendiente = { ...(pendiente === SIN_VALOR ? {} : pendiente), ...pieza };
        publicar({ valor, listo: false });
        return;
      }
      instancia.escribirParte(clave, pieza);
      publicar({ valor, listo: true });
      return;
    }
    if (!estado.listo) {
      pendiente = nuevo;
      publicar({ valor: nuevo, listo: false });
      return;
    }
    instancia.escribir(clave, nuevo);
    publicar({ valor: nuevo, listo: true });
  }

  function soltar() {
    suelto = true;
  }

  esperar(instancia);
  return { estado: () => estado, guardar, revisarUsuario, soltar };
}

// ─── T4A r1: las preferencias atadas al usuario del token ──────────────────────────────────────────────────────────

/**
 * El id del usuario dueño de `token`: el sub del JWT (backend/app/api/v1/auth.py firma sub = str(user.id)), o null si
 * no hay token, si no se puede leer o si su sub no es un id válido. No verifica la firma: el servidor decide.
 * @param {unknown} token
 * @returns {number | null}
 */
export function usuarioDelToken(token) {
  const sub = leerPayload(token)?.sub;
  return sub === undefined || sub === null ? null : normalizarUsuario(sub);
}

/**
 * El usuario de las preferencias (RP25, T4A r1): el localStorage 'user_id' de AuthGuard SOLO si es el sub del token
 * vigente. Nadie borra 'user_id' al cerrar la sesión, así que con el token de otro usuario (o sin token) da null: la
 * instancia queda en memoria, sin GET ni PUT, hasta que AuthGuard escriba el user_id correcto.
 * @param {unknown} token
 * @param {unknown} userId
 * @returns {number | null}
 */
export function usuarioDeSesion(token, userId) {
  const delToken = usuarioDelToken(token);
  return delToken !== null && delToken === normalizarUsuario(userId) ? delToken : null;
}

/** El texto del error de una petición de preferencias con la sesión de otro usuario. */
export const MENSAJE_OTRO_USUARIO = 'La sesión es de otro usuario: estas preferencias no se envían con ella.';

/**
 * El servidor de las preferencias de `usuarioId` (T4A r1): GET /preferencias[?prefijo=] y PUT /preferencias/{clave}
 * con {valor} (backend/app/api/v1/preferencias.py) por medio de `pedir` (apiFetch). ANTES de cada GET y de cada PUT
 * comprueba que el token vigente sigue siendo de `usuarioId`; si no, rechaza sin pedir nada con un error de status 409
 * y otroUsuario = true, que preferencias.js no reintenta (no es de red ni 5xx). Cada petición va con
 * sinReintento401: un 401 no se reintenta con el token de otro usuario (lib/api.ts). La comprobación y la llamada a
 * `pedir` van en el mismo tic: apiFetch lee el token al empezar, antes de su primer await.
 * @param {{usuarioId: number, leerToken: () => unknown,
 *   pedir: (ruta: string, opciones: {method?: string, body?: string, sinReintento401: boolean}) => Promise<unknown>}} opciones
 * @returns {ServidorPreferencias}
 */
export function servidorDeUsuario({ usuarioId, leerToken, pedir }) {
  const tokenVigente = () => {
    try {
      return leerToken();
    } catch {
      return null; // localStorage bloqueado: sin token, no se pide nada
    }
  };
  const comprobar = () => {
    if (usuarioDelToken(tokenVigente()) === usuarioId) return;
    const error = /** @type {Error & {status?: number, otroUsuario?: boolean}} */ (new Error(MENSAJE_OTRO_USUARIO));
    error.status = 409;
    error.otroUsuario = true;
    throw error;
  };
  return {
    async leer(prefijo) {
      comprobar();
      const ruta = prefijo ? `/preferencias?prefijo=${encodeURIComponent(prefijo)}` : '/preferencias';
      return pedir(ruta, { sinReintento401: true });
    },
    async guardar(clave, valor) {
      comprobar();
      return pedir(`/preferencias/${encodeURIComponent(clave)}`, {
        method: 'PUT', body: JSON.stringify({ valor }), sinReintento401: true,
      });
    },
  };
}

/**
 * Las preferencias de la sesión de la app (T4A r1; lo usa preferenciasApp de components/ui/usePreferencia.ts): el
 * gestor de crearPreferenciasPorUsuario con el usuario de usuarioDeSesion(token, user_id) y, para cada usuario válido,
 * el servidor protegido de servidorDeUsuario. Todo se lee en cada llamada (leerToken, leerUserId y leerAlmacen pueden
 * lanzar: cuenta como sin usuario o sin almacén).
 * @param {{leerToken: () => unknown, leerUserId: () => unknown, leerAlmacen?: () => Almacen | null,
 *   pedir: (ruta: string, opciones: {method?: string, body?: string, sinReintento401: boolean}) => Promise<unknown>,
 *   temporizador?: Temporizador, retardoMs?: number}} opciones
 * @returns {{obtener: () => Preferencias, alCambiar: (oyente: (instancia: Preferencias) => void) => () => void}}
 */
export function crearPreferenciasDeSesion({ leerToken, leerUserId, leerAlmacen = () => null, pedir, temporizador, retardoMs }) {
  const almacenSeguro = () => {
    try {
      return leerAlmacen();
    } catch {
      return null;
    }
  };
  return crearPreferenciasPorUsuario({
    leerUsuario: () => usuarioDeSesion(leerToken(), leerUserId()),
    crear: (usuarioId) => crearPreferencias({
      usuarioId,
      almacen: almacenSeguro(),
      servidor: usuarioId === null ? null : servidorDeUsuario({ usuarioId, leerToken, pedir }),
      temporizador,
      retardoMs,
    }),
  });
}
