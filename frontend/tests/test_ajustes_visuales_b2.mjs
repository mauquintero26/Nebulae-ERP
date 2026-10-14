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
 * - V10: la pila de avisos va arriba al centro (ronda 1; no tapa el botón principal de una ventana ni los de la
 *   derecha de las cabeceras).
 * - Ronda 1: la cabecera de la SC baja de línea a 1024 (patrón del PVEN); el chip de la PXP cancelada con textoChipPxp;
 *   la tarjeta de Activas de la pestaña Análisis con pistaActivasSolicitudes; el menú de fila se cierra si su botón sale
 *   de la vista (botonALaVista); las guardias de clases comprueban clases sueltas (conClases).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoAtrasados, RUTA_HUB_VENTAS } from '../src/lib/hub-ventas.js';
import { posicionMenuFila, botonALaVista } from '../src/lib/listas-ventas.js';
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
/**
 * Ronda 1: las guardias de clases comprueban clases SUELTAS (en cualquier orden), no la cadena exacta. `className` es el
 * texto de un className="…" o de la parte fija de un className={`…`}.
 */
function conClases(className, requeridas, prohibidas = [], que = className) {
  const clases = new Set(String(className).split(/\s+/).filter(Boolean));
  for (const c of requeridas) assert.ok(clases.has(c), `${que}: falta la clase ${c} en «${className}»`);
  for (const p of prohibidas) {
    const hallada = [...clases].find((c) => (p instanceof RegExp ? p.test(c) : c === p));
    assert.ok(!hallada, `${que}: no debía tener ${hallada} en «${className}»`);
  }
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
  // Ronda 1 (6): clases sueltas, no la cadena exacta.
  const columna = pasos.match(/<div key=\{s\.key\} className="([^"]*)"/);
  assert.ok(columna, 'columna de cada paso encontrada');
  conClases(columna[1], ['flex', 'flex-1', 'basis-0', 'min-w-0', 'flex-col', 'items-center', 'px-1'], [],
    'cada paso es una columna del mismo ancho, con su espacio a los lados');
  const etiqueta = pasos.match(/<span className=\{`([^`$]*)/);
  assert.ok(etiqueta, 'etiqueta de cada paso encontrada');
  conClases(etiqueta[1], ['text-center', 'leading-tight', 'break-words'], ['whitespace-nowrap'],
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

console.log('--- V10 TEST (ronda 1): la pila de avisos va arriba al centro ---');
{
  const avisos = sinComentarios(leer('components/ui/Avisos.tsx'));
  const pila = avisos.match(/<div className="([^"]*\bz-\[90\][^"]*)">/);
  assert.ok(pila, 'la pila de avisos (z-[90]) encontrada');
  // Arriba al centro (decisión del controlador, ronda 1): a la derecha tapaba «Editar» y «Cancelar Solicitud» de las
  // cabeceras, y abajo el botón principal de las ventanas. Mismo z-index, orden (flex-col) y pointer-events.
  conClases(pila[1], ['fixed', 'top-4', 'left-1/2', '-translate-x-1/2', 'z-[90]', 'flex', 'flex-col', 'items-center',
    'pointer-events-none'], [/^right-/, /^bottom-/, 'items-end'], 'pila de avisos');
  // Cada tarjeta sigue recibiendo el puntero (pausa del tiempo y botón de cerrar).
  assert.ok(/className=\{`pointer-events-auto /.test(avisos), 'cada tarjeta con pointer-events-auto');
  assert.ok(/onPointerEnter=\{\(\) => setPausado\(true\)\}/.test(avisos), 'la pausa con el puntero sigue');
}

console.log('--- R1 (2) TEST: la cabecera de la SC baja de línea a 1024 en vez de salirse ---');
{
  const sc = sinComentarios(leer('app/dashboard/ventas/solicitud/[id]/page.tsx'));
  const inicio = sc.indexOf('<BotonVolver href={destinoVolver(safeReturnTo');
  assert.ok(inicio > 0, 'cabecera de la SC encontrada');
  // Los className de la barra, en orden: la barra y el bloque izquierdo (antes de BotonVolver); después, el grupo del
  // número, el h1 y los botones.
  const barra = [...sc.slice(0, inicio).matchAll(/className="([^"]*)"/g)].slice(-2);
  assert.equal(barra.length, 2);
  conClases(barra[0][1], ['flex', 'flex-wrap', 'items-center', 'justify-between', 'gap-x-4', 'gap-y-3'], [], 'barra de la SC');
  conClases(barra[1][1], ['flex', 'items-center', 'gap-4', 'min-w-0'], [], 'bloque izquierdo de la SC');
  const despues = sc.slice(inicio, sc.indexOf('Cancelar Solicitud</Button>', inicio));
  const resto = [...despues.matchAll(/className="([^"]*)"/g)].map((m) => m[1]);
  assert.ok(resto.length >= 3, `className de la cabecera: ${resto.length}`);
  conClases(resto[0], ['flex', 'flex-wrap', 'items-center', 'gap-3'], [], 'grupo del número de la SC');
  assert.ok(/<h1 className="[^"]*\bwhitespace-nowrap\b[^"]*">\{solicitud\?\.numero/.test(despues), 'el número no se parte');
  conClases(resto[2], ['flex', 'flex-wrap', 'items-center', 'gap-2', 'ml-auto'], [], 'botones de la SC');
}

console.log('--- R1 (3) TEST: el chip de la PXP cancelada usa textoChipPxp ---');
{
  const venta = sinComentarios(leer('app/dashboard/ventas/venta/[id]/page.tsx'));
  assert.ok(venta.includes('{textoChipPxp(pxpCancelada)}'), 'chip de la PXP cancelada con textoChipPxp');
  assert.ok(!/PXP \{pxpCancelada\.numero\} cancelada/.test(venta), 'sin el texto armado a mano («PXP PXP-… cancelada»)');
}

console.log('--- R1 (4) TEST: la tarjeta de Activas de la pestaña Análisis no contradice al banner ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.ok(!lista.includes('Todas en seguimiento regular'), 'sin el texto que ignoraba las vencidas');
  const usos = lista.match(/hint=\{pistaActivasSolicitudes\(sinAtender,\s*vencidas\)\}/g) ?? [];
  assert.equal(usos.length, 2, 'la tarjeta de la lista y la de Análisis usan la misma pista');
}

console.log('--- R1 (5) TEST 1: botonALaVista (el centro del botón dentro de la ventana y de sus contenedores) ---');
{
  const ventana = { top: 0, left: 0, right: 1440, bottom: 900 };
  const boton = { top: 100, bottom: 127, left: 880, right: 907 };
  assert.equal(botonALaVista(boton, [ventana]), true);
  assert.equal(botonALaVista(boton, [ventana, { top: 50, left: 300, right: 1400, bottom: 800 }]), true);
  // Fuera de la ventana (desplazado hacia arriba) o fuera del contenedor con overflow (la tabla desplazada).
  assert.equal(botonALaVista({ top: -40, bottom: -13, left: 880, right: 907 }, [ventana]), false);
  assert.equal(botonALaVista(boton, [ventana, { top: 130, left: 300, right: 1400, bottom: 800 }]), false, 'tapado arriba');
  assert.equal(botonALaVista(boton, [ventana, { top: 50, left: 300, right: 890, bottom: 800 }]), false, 'tapado a la derecha');
  // Medio botón a la vista: el centro decide (113,5 dentro de [110, 800] sí; dentro de [115, 800] no).
  assert.equal(botonALaVista(boton, [ventana, { top: 110, left: 300, right: 1400, bottom: 800 }]), true);
  assert.equal(botonALaVista(boton, [ventana, { top: 115, left: 300, right: 1400, bottom: 800 }]), false);
  // Sin rectángulo (el botón ya no está): no está a la vista. Sin recortes: a la vista.
  assert.equal(botonALaVista(null, [ventana]), false);
  assert.equal(botonALaVista(boton, []), true);
}

console.log('--- R1 (5) TEST 2: RowMenu se cierra si su botón sale de la vista ---');
{
  const rowMenu = cuerpo(sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx')), 'function RowMenu(');
  assert.ok(/if\s*\(\s*!botonALaVista\([^)]*\)\s*\)\s*\{\s*setOpen\(false\)/.test(rowMenu), 'fuera de la vista: setOpen(false)');
  assert.ok(/recortesDe\(/.test(rowMenu), 'con los contenedores que recortan (overflow) además de la ventana');
}

console.log('OK test_ajustes_visuales_b2.mjs');
