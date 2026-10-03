/**
 * Busqueda por producto en documentos con lineas (SC, COT, PVEN, PEC, recepciones...).
 *
 * Los listados filtran en el navegador sobre lo que ya cargaron; cada documento trae su
 * lista `productos`, pero el nombre de la linea vive bajo claves distintas segun donde se
 * creo (product_name en casi todo, nombre/name en otras pantallas) y a veces se busca por
 * SKU. La comparacion ignora mayusculas y tildes ("colchon" encuentra "Colchón").
 */
const CLAVES_PRODUCTO = ['product_name', 'name', 'nombre', 'producto', 'sku', 'sku_code', 'referencia'];

export function normalizarBusqueda(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

/** true si alguna linea de `doc.productos` coincide con el termino (nombre o SKU). */
export function coincideProducto(doc, termino) {
  const q = normalizarBusqueda(termino);
  if (!q) return false;
  const lineas = Array.isArray(doc?.productos) ? doc.productos : [];
  return lineas.some(
    linea =>
      linea &&
      typeof linea === 'object' &&
      CLAVES_PRODUCTO.some(k => typeof linea[k] === 'string' && normalizarBusqueda(linea[k]).includes(q)),
  );
}
