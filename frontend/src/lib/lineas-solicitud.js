/**
 * Líneas de producto de la solicitud (U7+U8+H12+H13 con la regla de cantidad de H25; choque C2): la librería ÚNICA que
 * usan el formulario de creación (lista y Asistente Omnicanal) y el editor de productos del detalle. JS plano para
 * probarlo con node (frontend/tests/test_lineas_solicitud.mjs). Imports relativos con extensión.
 *
 * Lo que llega al backend tiene la forma de siempre: {product_name, qty, unit_price_cop: 0, sku_id}. Las claves que
 * empiezan por '_' (por ejemplo _nuevo: 'Nuevo en catálogo') son solo de la pantalla: lineasParaEnviar las quita.
 * Ninguna función muta lo que recibe.
 */

import { normalizarBusqueda } from './busqueda.js';

/** @typedef {Record<string, any>} LineaProducto */

/** Nombre comparable: sin tildes ni mayúsculas y con los espacios colapsados. */
const clave = (texto) => normalizarBusqueda(texto).replace(/\s+/g, ' ');

const tieneSku = (linea) => linea?.sku_id !== null && linea?.sku_id !== undefined && linea?.sku_id !== '';

/** Una línea en blanco: sin nombre y sin sku (no identifica ningún producto). Nunca se agrega ni se envía. */
const enBlanco = (linea) => !tieneSku(linea) && nombreLinea(linea) === '';

/**
 * El nombre de una línea o de un producto del buscador: product_name, nombre o name (el primero que no esté vacío),
 * sin espacios en los bordes. '' si no tiene.
 * @param {any} p
 * @returns {string}
 */
export function nombreLinea(p) {
  for (const k of ['product_name', 'nombre', 'name']) {
    const v = p?.[k];
    const texto = v === null || v === undefined ? '' : String(v).trim();
    if (texto) return texto;
  }
  return '';
}

/**
 * Cantidad válida: entero >= 1. '', 0, negativos, texto o NaN -> 1; '2.7' -> 2.
 * @param {any} v
 * @returns {number}
 */
export function cantidadValida(v) {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

/**
 * Línea de un producto elegido o creado en el catálogo. `creado` marca la pastilla 'Nuevo en catálogo' (_nuevo).
 * Se puede llamar con un solo argumento.
 * @param {any} p resultado del buscador o respuesta de quick-create ({id: id del SKU, product_name | name})
 * @param {{ creado?: boolean }} [opciones]
 * @returns {LineaProducto}
 */
export function lineaDesdeCatalogo(p, { creado = false } = {}) {
  return { product_name: nombreLinea(p), qty: 1, unit_price_cop: 0, sku_id: p?.id ?? null, _nuevo: !!creado };
}

/**
 * Línea de texto libre (no está en el catálogo; quien cotice puede vincularla).
 * @param {any} texto
 * @returns {LineaProducto}
 */
export function lineaTextoLibre(texto) {
  return { product_name: String(texto ?? '').trim(), qty: 1, unit_price_cop: 0, sku_id: null };
}

/** Dos líneas son el mismo producto: el mismo SKU, o dos textos libres con el mismo nombre comparable. */
function mismaLinea(a, b) {
  if (tieneSku(a) || tieneSku(b)) return tieneSku(a) && tieneSku(b) && String(a.sku_id) === String(b.sku_id);
  const k = clave(nombreLinea(a));
  return k !== '' && k === clave(nombreLinea(b));
}

/**
 * Agrega `nueva` al final o, si ya está (mismo sku_id, o texto libre con el mismo nombre sin tildes ni mayúsculas),
 * suma su cantidad a esa línea. Una línea del catálogo y un texto libre con el mismo nombre no se fusionan. Una línea en
 * blanco (sin nombre y sin sku) no se agrega: indice -1 y una copia de la lista.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {LineaProducto} nueva
 * @returns {{ lineas: LineaProducto[], indice: number, fusionada: boolean }} indice = la línea agregada o sumada
 *   (-1 si no se agregó nada).
 */
export function agregarLinea(lineas, nueva) {
  const lista = Array.isArray(lineas) ? lineas : [];
  if (enBlanco(nueva)) return { lineas: [...lista], indice: -1, fusionada: false };
  const indice = lista.findIndex((l) => mismaLinea(l, nueva));
  if (indice < 0) return { lineas: [...lista, nueva], indice: lista.length, fusionada: false };
  const suma = { ...lista[indice], qty: cantidadValida(lista[indice].qty) + cantidadValida(nueva?.qty) };
  return { lineas: lista.map((l, i) => (i === indice ? suma : l)), indice, fusionada: true };
}

/**
 * H25: cambia la cantidad de la línea i. Acepta '' mientras se escribe (para borrar el número y escribir otro sin que
 * salte a 1: el bug '5' -> '15'); cualquier otro valor se guarda como cantidadValida(v). Al salir del campo y al
 * enviar se normaliza (cantidadValida / lineasParaEnviar). Devuelve un arreglo nuevo.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {number} i
 * @param {any} v
 * @returns {LineaProducto[]}
 */
export function cambiarCantidad(lineas, i, v) {
  return (Array.isArray(lineas) ? lineas : []).map((l, j) => (j === i ? { ...l, qty: v === '' ? '' : cantidadValida(v) } : l));
}

/**
 * Quita la línea i. Devuelve un arreglo nuevo.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {number} i
 * @returns {LineaProducto[]}
 */
export function quitarLinea(lineas, i) {
  return (Array.isArray(lineas) ? lineas : []).filter((_, j) => j !== i);
}

/**
 * El resultado del buscador cuyo nombre es IGUAL a lo escrito (sin tildes, mayúsculas ni espacios de más), o null.
 * Con él, '+ Agregar' o Enter vinculan lo escrito al catálogo en vez de dejarlo como texto libre.
 * @param {any} texto
 * @param {ReadonlyArray<any> | null | undefined} resultados
 * @returns {any | null}
 */
export function resolverTextoEscrito(texto, resultados) {
  const k = clave(texto);
  if (!k || !Array.isArray(resultados)) return null;
  return resultados.find((r) => clave(nombreLinea(r)) === k) ?? null;
}

/**
 * T7 ronda 1 (A4): los resultados que tiene el buscador sirven para resolver lo escrito solo si se pidieron para ESE
 * texto (recortado) y no hay un temporizador ni una petición en curso. Si no, hay que buscar en el acto antes de agregar:
 * si no, un producto que sí existe entraría como texto libre solo por pulsar Enter antes de que vuelva la búsqueda.
 * @param {any} texto lo escrito
 * @param {any} resultadosDe el texto para el que se pidieron los resultados que se tienen
 * @param {boolean} pendiente hay un temporizador o una petición de búsqueda en curso
 * @returns {boolean}
 */
export function resultadosSirven(texto, resultadosDe, pendiente) {
  const t = String(texto ?? '').trim();
  return !pendiente && t !== '' && String(resultadosDe ?? '').trim() === t;
}

/**
 * T7 ronda 1 (A4): busca en el acto lo escrito (recortado) con `buscar` y lo resuelve contra ESA respuesta (arreglo o
 * {data: [...]}). Si la búsqueda falla, {coincidencia: null, comprobado: false}: la línea entra como texto libre y el
 * aviso dice que no se pudo comprobar el catálogo (no afirma que el producto no esté).
 * @param {any} texto
 * @param {(texto: string) => any} buscar
 * @returns {Promise<{ coincidencia: any | null, comprobado: boolean }>}
 */
export async function resolverConBusqueda(texto, buscar) {
  const t = String(texto ?? '').trim();
  try {
    const d = await buscar(t);
    const lista = Array.isArray(d) ? d : Array.isArray(d?.data) ? d.data : [];
    return { coincidencia: resolverTextoEscrito(t, lista), comprobado: true };
  } catch {
    return { coincidencia: null, comprobado: false };
  }
}

/**
 * Lo que se manda al backend: cada línea sin las claves que empiezan por '_' y con su cantidad válida, sin las líneas
 * en blanco (sin nombre y sin sku); y, si quedó texto escrito sin agregar (textoPendiente), se suma como texto libre
 * (con la misma regla de agregarLinea), aunque ya haya otras líneas. Un pendiente de solo espacios se ignora.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {any} [textoPendiente]
 * @returns {LineaProducto[]}
 */
export function lineasParaEnviar(lineas, textoPendiente) {
  const limpias = (Array.isArray(lineas) ? lineas : []).filter((l) => !enBlanco(l)).map((l) => {
    const sinInternas = Object.fromEntries(Object.entries(l ?? {}).filter(([k]) => !k.startsWith('_')));
    return { ...sinInternas, qty: cantidadValida(sinInternas.qty) };
  });
  const pendiente = String(textoPendiente ?? '').trim();
  return pendiente ? agregarLinea(limpias, lineaTextoLibre(pendiente)).lineas : limpias;
}

/**
 * T8B (H25 con U7+U8): el aviso verde que explica qué pasó al agregar una línea. Es el mismo en el formulario de nueva
 * solicitud y en el editor de productos del detalle. '' si no hay nada que explicar: una línea elegida del catálogo que
 * no se sumó a otra solo se resalta; tampoco hay texto para una línea en blanco (indice -1) ni para un origen desconocido.
 * @param {{ lineas: ReadonlyArray<LineaProducto>, indice: number, fusionada: boolean } | null | undefined} r
 *   el resultado de agregarLinea
 * @param {'catalogo' | 'creado' | 'existente' | 'texto' | 'texto-sin-comprobar'} origen de dónde vino la línea: elegida
 *   del catálogo, creada con el alta rápida (o que ya existía con ese nombre) o escrita (comprobada o no en el catálogo)
 * @returns {string}
 */
export function textoAvisoLinea(r, origen) {
  const linea = r && r.indice >= 0 && Array.isArray(r.lineas) ? r.lineas[r.indice] : null;
  if (!linea) return '';
  const nombre = nombreLinea(linea);
  if (r.fusionada) return `«${nombre}» ya estaba en la lista: ahora son ${linea.qty}.`;
  if (origen === 'creado') {
    return `Se creó «${nombre}» en el catálogo y se agregó a la solicitud. Queda marcado para completar marca, categoría y precio después.`;
  }
  if (origen === 'existente') return `«${nombre}» ya estaba en el catálogo: se agregó.`;
  if (origen === 'texto') return `Se agregó «${nombre}» como texto libre (no está en el catálogo).`;
  // A4 (T7 ronda 1): la búsqueda para comprobarlo falló: no se afirma que no esté en el catálogo.
  if (origen === 'texto-sin-comprobar') return `Se agregó «${nombre}» como texto libre (no se pudo comprobar el catálogo).`;
  return '';
}

/** Estados de la solicitud en los que el cliente ya tiene (o tenía) el enlace o la confirmación de sus productos. */
const ESTADOS_CON_CONFIRMACION = ['PENDIENTE_CONFIRMACION', 'CONFIRMADA'];

/**
 * T8B ronda 1 (punto 8): el aviso después de «Guardar productos» en el detalle. Si la solicitud estaba en Pendiente por
 * confirmación o Confirmada y el guardado le cambió el estado (cambiaron los productos: vuelve a Asignada o a Nueva), la
 * confirmación del cliente quedó anulada y hay que enviársela de nuevo. Si no (o sin el estado nuevo), el de guardado.
 * @param {any} estadoAntes el estado de la solicitud antes de guardar
 * @param {any} estadoDespues el estado que devuelve el PATCH (undefined si no trajo la solicitud)
 * @returns {{ texto: string, tono: 'ok' | 'info' }}
 */
export function avisoProductosGuardados(estadoAntes, estadoDespues) {
  if (ESTADOS_CON_CONFIRMACION.includes(estadoAntes) && estadoDespues && estadoDespues !== estadoAntes) {
    return {
      texto: 'Productos guardados. Como cambiaron, la confirmación del cliente quedó anulada: envíale la solicitud de nuevo.',
      tono: 'info',
    };
  }
  return { texto: 'Productos guardados.', tono: 'ok' };
}
