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
 * suma su cantidad a esa línea. Una línea del catálogo y un texto libre con el mismo nombre no se fusionan.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {LineaProducto} nueva
 * @returns {{ lineas: LineaProducto[], indice: number, fusionada: boolean }} indice = la línea agregada o sumada.
 */
export function agregarLinea(lineas, nueva) {
  const lista = Array.isArray(lineas) ? lineas : [];
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
 * Lo que se manda al backend: cada línea sin las claves que empiezan por '_' y con su cantidad válida; y, si quedó
 * texto escrito sin agregar (textoPendiente), se suma como texto libre (con la misma regla de agregarLinea), aunque ya
 * haya otras líneas. Un pendiente de solo espacios se ignora.
 * @param {ReadonlyArray<LineaProducto> | null | undefined} lineas
 * @param {any} [textoPendiente]
 * @returns {LineaProducto[]}
 */
export function lineasParaEnviar(lineas, textoPendiente) {
  const limpias = (Array.isArray(lineas) ? lineas : []).map((l) => {
    const sinInternas = Object.fromEntries(Object.entries(l ?? {}).filter(([k]) => !k.startsWith('_')));
    return { ...sinInternas, qty: cantidadValida(sinInternas.qty) };
  });
  const pendiente = String(textoPendiente ?? '').trim();
  return pendiente ? agregarLinea(limpias, lineaTextoLibre(pendiente)).lineas : limpias;
}
