/**
 * frontend/tests/test_ajustes_visuales_b2.mjs
 * T11 (Bloque 2, ronda visual): lo que mostraron las capturas «después».
 * - V1: el aviso «N atrasados» deja de flotar (fixed) sobre la cabecera: es un elemento del menú lateral (Sidebar), con
 *   la misma carga de siempre (cada 5 min, sin consultar con la pestaña oculta ni con el re-ingreso pendiente).
 *   textoAtrasados (hub-ventas.js) y guardias de layout.tsx, AlertasBadge.tsx y Sidebar.tsx.
 * - V2: el menú «⋮» de la fila de solicitudes va con position: fixed calculado desde el botón (posicionMenuFila,
 *   listas-ventas.js): el overflow de la tabla ya no lo corta y, si no cabe abajo, se abre hacia arriba.
 * - V3: la cabecera de las tarjetas de la Actividad (título + fecha) es UN componente (CabeceraActividad de flujo.tsx)
 *   en la SC, la COT y el PVEN: el título usa el ancho que haya y la fecha no se encoge ni se sale.
 * - V4: la caja del Chatter va en el flujo normal (sin sticky): el botón «Guardar nota» no tapa la lista.
 * - V5: las etiquetas de la barra de pasos del pedido, cada una bajo su paso, centradas y separadas.
 * - V6: la pestaña «Análisis» de la lista de solicitudes, con tilde (solo el texto visible).
 * - V7: la tarjeta ACTIVAS no dice «Todas atendidas» cuando el banner avisa vencidas (pistaActivasSolicitudes).
 * - V8: inicialesAutor (detalle-layout.js) ignora lo que no es letra o dígito: «Cliente (confirmación por link)» -> CC.
 * - V10: la pila de avisos va arriba a la derecha (no tapa el botón principal de una ventana).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoAtrasados, RUTA_HUB_VENTAS } from '../src/lib/hub-ventas.js';
import { posicionMenuFila } from '../src/lib/listas-ventas.js';
import { inicialesAutor } from '../src/lib/detalle-layout.js';

// Con los saltos de línea normalizados (el checkout de Windows deja CRLF en algunos archivos).
const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** El código sin comentarios // ni /* … *\/ (también {/* … *\/} de JSX), para que una nota no cuente como uso. */
const sinComentarios = (fuente) => fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** Desde `marca` hasta la llave que cierra esa función de primer nivel (la primera '\n}\n' que sigue). */
function cuerpo(fuente, marca) {
  const inicio = fuente.indexOf(marca);
  assert.ok(inicio >= 0, `no se encontró ${marca}`);
  const fin = fuente.indexOf('\n}\n', inicio);
  assert.ok(fin > inicio, `no se encontró el final de ${marca}`);
  return fuente.slice(inicio, fin);
}

console.log('--- V1 TEST 1: textoAtrasados ---');
{
  assert.equal(textoAtrasados(1), '1 atrasado');
  assert.equal(textoAtrasados(5), '5 atrasados');
  assert.equal(textoAtrasados(12), '12 atrasados');
  assert.equal(textoAtrasados('3'), '3 atrasados', 'el número puede llegar como texto');
  // Con 0 (o un valor que no es un número positivo) no hay texto: el aviso no se muestra.
  for (const n of [0, -2, null, undefined, '', 'x', NaN, Infinity]) assert.equal(textoAtrasados(n), '', String(n));
}

console.log('--- V1 TEST 2: el aviso vive en el menú lateral, ya no flota sobre la cabecera ---');
{
  const layout = sinComentarios(leer('app/dashboard/layout.tsx'));
  assert.ok(!/AlertasBadge/.test(layout), 'layout.tsx ya no importa ni monta <AlertasBadge />');

  const badge = sinComentarios(leer('components/AlertasBadge.tsx'));
  assert.ok(!/\bfixed\b/.test(badge), 'AlertasBadge.tsx sin la clase fixed');
  assert.ok(!/\btop-4\b|\bright-20\b/.test(badge), 'sin la posición vieja (top-4 right-20)');
  // La lógica de carga se conserva tal cual (se movió con el componente, no se duplicó).
  assert.ok(badge.includes("apiFetch('/ventas/alertas/resumen')"), 'consulta /ventas/alertas/resumen');
  assert.ok(badge.includes('hayReautenticacionPendiente()'), 'no consulta con el re-ingreso pendiente');
  assert.ok(badge.includes("document.visibilityState === 'hidden'"), 'no consulta con la pestaña oculta');
  assert.ok(badge.includes('5 * 60 * 1000'), 'cada 5 minutos');
  assert.ok(/textoAtrasados\(/.test(badge), 'el texto sale de textoAtrasados');
  assert.ok(/if \(!texto\) return null;/.test(badge), 'con 0 atrasados no se muestra nada');
  assert.ok(badge.includes('router.push(RUTA_HUB_VENTAS)') && RUTA_HUB_VENTAS === '/dashboard/ventas', 'el clic lleva al Hub');
  assert.ok(/<AlertTriangle\b/.test(badge), 'con el ícono AlertTriangle');
  assert.ok(/colapsado/.test(badge), 'conoce el menú contraído (solo ícono + número)');

  const sidebar = sinComentarios(leer('components/Sidebar.tsx'));
  assert.ok(/import \{ AlertasBadge \} from '@\/components\/AlertasBadge';/.test(sidebar), 'Sidebar importa AlertasBadge');
  assert.equal((sidebar.match(/<AlertasBadge\b/g) ?? []).length, 1, 'el Sidebar lo monta una vez');
  assert.ok(/<AlertasBadge colapsado=\{isCollapsed\} \/>/.test(sidebar), 'con el estado contraído del menú');
  // Arriba: antes de la lista de grupos del menú.
  assert.ok(sidebar.indexOf('<AlertasBadge') < sidebar.indexOf('MENU_ITEMS.map('), 'arriba, antes de los grupos');
}

console.log('--- V2 TEST 1: posicionMenuFila abre abajo, alineado a la derecha del botón ---');
{
  const ventana = { ancho: 1440, alto: 900 };
  const menu = { ancho: 224, alto: 150 };
  assert.deepEqual(posicionMenuFila({ top: 100, bottom: 127, right: 900 }, menu, ventana), { top: 131, left: 676 });
  // Coordenadas con decimales (getBoundingClientRect): se redondean.
  assert.deepEqual(posicionMenuFila({ top: 100.4, bottom: 127.4, right: 900.6 }, menu, ventana), { top: 131, left: 677 });
}

console.log('--- V2 TEST 2: si no cabe abajo y arriba sí, se abre hacia arriba ---');
{
  const ventana = { ancho: 1440, alto: 900 };
  const menu = { ancho: 224, alto: 150 };
  assert.deepEqual(posicionMenuFila({ top: 850, bottom: 877, right: 900 }, menu, ventana), { top: 696, left: 676 });
  // Desde 731 cabe (731 + 150 = 881 <= 900 - 8) y se queda abajo; desde 771 ya no (921 > 892) y se abre hacia arriba.
  assert.deepEqual(posicionMenuFila({ top: 700, bottom: 727, right: 900 }, menu, ventana), { top: 731, left: 676 });
  assert.deepEqual(posicionMenuFila({ top: 740, bottom: 767, right: 900 }, menu, ventana), { top: 586, left: 676 });
}

console.log('--- V2 TEST 3: nunca se sale de la ventana (margen de 8 px) ---');
{
  const menu = { ancho: 224, alto: 150 };
  // Botón pegado a la izquierda: el menú no se sale por la izquierda.
  assert.equal(posicionMenuFila({ top: 100, bottom: 127, right: 100 }, menu, { ancho: 1440, alto: 900 }).left, 8);
  // Botón más allá del borde derecho: el menú queda dentro.
  assert.equal(posicionMenuFila({ top: 100, bottom: 127, right: 1500 }, menu, { ancho: 1440, alto: 900 }).left, 1208);
  // No cabe ni abajo ni arriba (ventana baja): se queda dentro, arriba del todo.
  assert.deepEqual(posicionMenuFila({ top: 90, bottom: 110, right: 600 }, { ancho: 224, alto: 300 }, { ancho: 1024, alto: 200 }),
    { top: 8, left: 376 });
}

console.log('--- V2 TEST 4: el menú de fila de la lista de solicitudes usa la posición fija ---');
{
  const rowMenu = cuerpo(sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx')), 'function RowMenu(');
  assert.ok(/posicionMenuFila\(/.test(rowMenu), 'calcula la posición con posicionMenuFila');
  assert.ok(/className="fixed /.test(rowMenu), 'el menú va con position: fixed');
  assert.ok(!/absolute right-0 top-8/.test(rowMenu), 'sin la posición absoluta que el overflow cortaba');
  // Las opciones y su lógica no cambian.
  for (const texto of ['Ver Detalle', 'Editar', 'Reiniciar (volver a {destinoReinicio})', 'Enviar a la papelera', 'Cancelar Solicitud']) {
    assert.ok(rowMenu.includes(texto), `sigue la opción ${texto}`);
  }
  assert.ok(rowMenu.includes("document.addEventListener('mousedown',close)"), 'sigue cerrando con un clic afuera');
}

console.log('--- V3 TEST 1: CabeceraActividad (título + fecha) en flujo.tsx ---');
{
  const comp = cuerpo(sinComentarios(leer('app/dashboard/ventas/flujo.tsx')), 'export function CabeceraActividad(');
  assert.ok(/flex flex-wrap/.test(comp), 'si no caben en una línea, la fecha pasa debajo (flex-wrap)');
  assert.ok(/min-w-0/.test(comp) && /break-words/.test(comp), 'el título usa el ancho disponible (min-w-0, break-words)');
  assert.ok(/shrink-0 whitespace-nowrap/.test(comp), 'la fecha no se encoge ni se parte (shrink-0, whitespace-nowrap)');
}

console.log('--- V3 TEST 2: la SC, la COT y el PVEN usan la misma cabecera ---');
{
  for (const ruta of ['solicitud/[id]/page.tsx', 'cotizacion/[id]/page.tsx', 'venta/[id]/page.tsx']) {
    const fuente = sinComentarios(leer(`app/dashboard/ventas/${ruta}`));
    assert.ok(/<CabeceraActividad\b[^>]*titulo=\{a\.description \|\| humanizarCodigo\(a\.action\)\}/.test(fuente),
      `${ruta}: la tarjeta usa <CabeceraActividad titulo=...>`);
    assert.ok(!/<span className="font-bold text-slate-800 text-sm">\{a\.description/.test(fuente),
      `${ruta}: sin la cabecera vieja armada a mano`);
    assert.ok(/import \{[^}]*\bCabeceraActividad\b[^}]*\} from '\.\.\/\.\.\/flujo';/.test(fuente), `${ruta}: importa CabeceraActividad`);
  }
}

console.log('--- V4 TEST: la caja del Chatter va en el flujo normal (sin sticky) ---');
{
  const doc = cuerpo(sinComentarios(leer('app/dashboard/ventas/chatter.tsx')), 'export function ChatterDocumento(');
  assert.ok(/<ComposerChatter /.test(doc), 'ChatterDocumento encontrado');
  assert.ok(!/\bsticky\b/.test(doc), 'la caja ya no es sticky: no se monta sobre la lista');
}

console.log('--- V5 TEST: barra de pasos del pedido con las etiquetas separadas ---');
{
  const venta = sinComentarios(leer('app/dashboard/ventas/venta/[id]/page.tsx'));
  const inicio = venta.indexOf('{STEPS.map((s, i) => (');
  assert.ok(inicio > 0, 'barra de pasos encontrada');
  const pasos = venta.slice(inicio, venta.indexOf('))}', inicio));
  assert.ok(/className="relative z-10 flex flex-1 basis-0 min-w-0 flex-col items-center gap-2 px-1"/.test(pasos),
    'cada paso es una columna del mismo ancho, con su espacio a los lados');
  assert.ok(/<span className=\{`text-center text-xs font-bold leading-tight break-words /.test(pasos),
    'la etiqueta va centrada bajo su paso y puede partirse en dos líneas');
}

console.log('--- V6 + V7 TEST: lista de solicitudes ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.ok(lista.includes("tab==='Analisis'?'Análisis':tab"), 'la pestaña se ve «Análisis» (la clave sigue igual)');
  assert.ok(/hint=\{pistaActivasSolicitudes\(sinAtender,vencidas\)\}/.test(lista), 'la tarjeta ACTIVAS usa pistaActivasSolicitudes');
  assert.ok(!lista.includes("'Todas atendidas'"), 'sin el texto armado a mano');
}

console.log('--- V8 TEST 1: inicialesAutor solo toma letras y dígitos ---');
{
  assert.equal(inicialesAutor('Cliente (confirmación por link)'), 'CC', 'sin el paréntesis');
  assert.equal(inicialesAutor('Juan Pérez'), 'JP');
  assert.equal(inicialesAutor('juan pérez gómez'), 'JP', 'dos letras como máximo, en mayúscula');
  assert.equal(inicialesAutor('admin_qa'), 'A');
  assert.equal(inicialesAutor('maria.lopez@example.com'), 'M', 'un correo');
  assert.equal(inicialesAutor('  Ángela   Ñúñez  '), 'ÁÑ', 'espacios de más y tildes');
  assert.equal(inicialesAutor('(Cliente)'), 'C');
  assert.equal(inicialesAutor('3D Pinturas'), '3P', 'un dígito cuenta');
  assert.equal(inicialesAutor('— Ana'), 'A', 'una palabra sin letras se salta');
  // Sin autor: 'S' de 'Sistema' (lo que se muestra al lado). Sin ninguna letra ni dígito: '?'.
  for (const v of [null, undefined, '', '   ']) assert.equal(inicialesAutor(v), 'S', String(v));
  assert.equal(inicialesAutor('( )'), '?');
}

console.log('--- V8 TEST 2: los avatares de la Actividad de la SC y la COT usan inicialesAutor ---');
{
  for (const ruta of ['solicitud/[id]/page.tsx', 'cotizacion/[id]/page.tsx']) {
    const fuente = sinComentarios(leer(`app/dashboard/ventas/${ruta}`));
    assert.ok(/\{inicialesAutor\(a\.user_name\)\}/.test(fuente), `${ruta}: usa inicialesAutor(a.user_name)`);
    assert.ok(!/\.map\(\(n\s*:\s*string\)\s*=>\s*n\[0\]\)/.test(fuente), `${ruta}: sin las iniciales armadas a mano`);
  }
}

console.log('--- V10 TEST: la pila de avisos va arriba a la derecha ---');
{
  const avisos = sinComentarios(leer('components/ui/Avisos.tsx'));
  const pila = avisos.match(/<div className="fixed [^"]*z-\[90\][^"]*">/);
  assert.ok(pila, 'la pila de avisos (z-[90]) encontrada');
  assert.ok(/\btop-4 right-6\b/.test(pila[0]), `arriba a la derecha: ${pila[0]}`);
  assert.ok(!/\bbottom-/.test(pila[0]), 'ya no va abajo (tapaba el botón principal de las ventanas)');
  assert.ok(/flex flex-col items-end gap-2 max-w-sm pointer-events-none/.test(pila[0]), 'mismo orden y comportamiento');
}

console.log('OK test_ajustes_visuales_b2.mjs');
