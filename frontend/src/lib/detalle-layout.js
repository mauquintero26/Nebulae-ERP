/**
 * Piezas del layout de los detalles de Ventas (H37 + C12, Bloque 2): el destino y el texto del unico boton de volver
 * (BotonVolver en app/dashboard/ventas/flujo.tsx) y el ancho inicial del panel derecho de la SC, la COT y el PVEN.
 * JS plano para probarlo con node (frontend/tests/test_detalle_layout.mjs).
 *
 * returnToSeguro vive aqui (ruling T6B-2) y flujo.tsx lo reexporta con el mismo nombre: es la UNICA regla para
 * confiar en un ?return_to=. El chequeo debil startsWith('/') && !startsWith('//') dejaba pasar '/\evil.com', que el
 * navegador resuelve como //evil.com (open redirect).
 */

const PREFIJO_DASHBOARD = '/dashboard/';
// Origen ficticio para resolver la ruta: si el resultado cambia de origen, la ruta salia del sitio.
const ORIGEN_PRUEBA = 'http://x';

/** true si el texto trae caracteres de control (U+0000–U+001F o U+007F): el parser de URL borra tab, CR y LF. */
function tieneControl(texto) {
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto.charCodeAt(i);
    if (c < 0x20 || c === 0x7f) return true;
  }
  return false;
}

/**
 * La ruta de "volver" solo si es una ruta interna del dashboard; si no, ''.
 * - Debe empezar por '/dashboard/' (nunca '//' ni '/\', ni un esquema como 'https:' o 'javascript:').
 * - Sin '\' ni caracteres de control: el parser de URL trata '\' como '/' y borra tab/CR/LF en silencio.
 * - Resuelta con new URL, debe quedar en el mismo origen y seguir dentro de /dashboard/ (sin '..' ni '%2e%2e' que la
 *   saquen), y su ruta no puede tener '//' (ningun destino legitimo lo trae).
 * Devuelve la ruta ya resuelta (ruta + query + hash): lo que se valido es exactamente lo que se usa.
 * @param {unknown} raw
 * @returns {string}
 */
export function returnToSeguro(raw) {
  if (typeof raw !== 'string' || !raw.startsWith(PREFIJO_DASHBOARD)) return '';
  if (raw.includes('\\') || tieneControl(raw)) return '';
  let url;
  try {
    url = new URL(raw, ORIGEN_PRUEBA);
  } catch {
    return '';
  }
  if (url.origin !== ORIGEN_PRUEBA || !url.pathname.startsWith(PREFIJO_DASHBOARD)) return '';
  if (url.pathname.includes('//')) return '';
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * A donde lleva el boton de volver: el return_to si pasa returnToSeguro; si no (vacio, externo o malicioso), la
 * lista del documento (`porDefecto`). Se le puede pasar el valor crudo de ?return_to= o uno ya saneado (da lo mismo).
 * @param {unknown} returnTo
 * @param {string} porDefecto
 * @returns {string}
 */
export function destinoVolver(returnTo, porDefecto) {
  return returnToSeguro(returnTo) || porDefecto;
}

/** Texto del boton por ruta (sin query ni hash, sin barra final). Los ids son numericos. */
const ETIQUETAS_VOLVER = Object.freeze([
  [/^\/dashboard\/ventas\/solicitud\/\d+$/, 'Volver a la solicitud'],
  [/^\/dashboard\/ventas\/solicitud$/, 'Volver a solicitudes'],
  [/^\/dashboard\/ventas\/cotizacion\/\d+$/, 'Volver a la cotización'],
  [/^\/dashboard\/ventas\/cotizacion$/, 'Volver a cotizaciones'],
  [/^\/dashboard\/ventas\/venta\/\d+$/, 'Volver al pedido'],
  [/^\/dashboard\/ventas\/venta$/, 'Volver a pedidos'],
  [/^\/dashboard\/ventas$/, 'Volver al Hub de Ventas'],
]);

/**
 * Lo que dice el boton de volver segun su destino: 'Volver a la solicitud', 'Volver a solicitudes', 'Volver a la
 * cotización', 'Volver a cotizaciones', 'Volver al pedido', 'Volver a pedidos', 'Volver al Hub de Ventas' o, para
 * cualquier otra ruta, 'Volver'.
 * @param {unknown} href
 * @returns {string}
 */
export function etiquetaVolver(href) {
  if (typeof href !== 'string') return 'Volver';
  const ruta = href.split(/[?#]/)[0];
  // Sin las barras finales (salvo la raiz), con un bucle: la regex /(.)\/+$/ era cuadratica con muchas barras.
  let fin = ruta.length;
  while (fin > 1 && ruta[fin - 1] === '/') fin -= 1;
  const limpia = ruta.slice(0, fin);
  const fila = ETIQUETAS_VOLVER.find(([patron]) => patron.test(limpia));
  return fila ? fila[1] : 'Volver';
}

/**
 * C12: ancho inicial del panel derecho (Actividad) de la SC, la COT y el PVEN: 30% de la ventana, entre 300 y 400
 * px (1024 -> 307, 1440 -> 400). 400 si el ancho no es un numero finito. Se aplica en un useEffect al montar (el
 * useState(400) de cada pagina no cambia, para no romper la hidratacion); despues se sigue pudiendo arrastrar.
 * @param {unknown} anchoVentana
 * @returns {number}
 */
export function anchoInicialPanel(anchoVentana) {
  if (typeof anchoVentana !== 'number' || !Number.isFinite(anchoVentana)) return 400;
  return Math.min(400, Math.max(300, Math.round(anchoVentana * 0.3)));
}
