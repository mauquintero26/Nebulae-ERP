/**
 * frontend/tests/test_ajustes_visuales_b2.mjs
 * T11 (Bloque 2, ronda visual): lo que mostraron las capturas «después».
 * - V1: el aviso «N atrasados» deja de flotar (fixed) sobre la cabecera: es un elemento del menú lateral (Sidebar), con
 *   la misma carga de siempre (cada 5 min, sin consultar con la pestaña oculta ni con el re-ingreso pendiente).
 *   textoAtrasados (hub-ventas.js) y guardias de layout.tsx, AlertasBadge.tsx y Sidebar.tsx.
 * - V2: el menú «⋮» de la fila de solicitudes va con position: fixed calculado desde el botón: el overflow de la tabla ya
 *   no lo corta y, si no cabe abajo, se abre hacia arriba. B4 T8: es MenuFila (posicionMenu, probada en test_tabla.mjs); B4
 *   T24 f2 (F48): se retiraron posicionMenuFila, botonALaVista y recortesDeAncestros (solo las usaban sus pruebas).
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
 * - Revisión final: el Toaster abajo al centro (F1); la fecha de la Actividad de la COT y del PVEN con comoUTC (F3);
 *   tildes de «Nuevo Proveedor» (F5); la carga neutra de /solicitud (F6); el ancho de la pila, botonALaVista por abajo
 *   y por la izquierda, recortesDeAncestros y el menú que solo se cierra al desplazar (F11); la cabecera de la
 *   Actividad apilada (F12).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { textoAtrasados, RUTA_HUB_VENTAS } from '../src/lib/hub-ventas.js';
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
  // B3 T18 (H28-cambios punto 11, C22): las pastillas de cambios del cliente se muestran aunque no haya atrasados;
  // sin ninguna no se muestra nada (antes: «if (!texto) return null;») y, sin atrasados, la roja no se pinta (r1).
  // B4 T24 (F42, D27): sin ninguna no se muestra NADA a la vista, pero el alto queda reservado (un div vacío aria-hidden): que el aviso
  // llegue después no corre el menú.
  assert.ok(/if \(!texto && pastillas\.length === 0\) return <div aria-hidden="true" className=\{RESERVA\} \/>;/.test(badge), 'sin atrasados ni cambios no se muestra nada (solo el alto reservado)');
  assert.ok(/\{texto && <PastillaMenuLateral\b/.test(badge), 'sin atrasados no se pinta la roja');
  assert.ok(badge.includes('router.push(RUTA_HUB_VENTAS)') && RUTA_HUB_VENTAS === '/dashboard/ventas', 'el clic lleva al Hub');
  assert.ok(/icono=\{AlertTriangle\}/.test(badge), 'con el ícono AlertTriangle');
  assert.ok(/colapsado/.test(badge), 'conoce el menú contraído (solo ícono + número)');
  // B3 T18 r1: las de cambios leen cambios_cliente_sc y cambios_cliente_cot de la MISMA respuesta (sin otra consulta);
  // cuáles se pintan y adónde lleva cada una lo decide pastillasCambiosCliente (lib/cambios-cliente.js).
  assert.equal((badge.match(/apiFetch\(/g) ?? []).length, 1, 'una sola consulta para todas las pastillas');
  assert.ok(/setCambios\(res\?\.data \?\? null\)/.test(badge), 'guarda el resumen con las dos cuentas');
  assert.ok(/pastillasCambiosCliente\(cambios\)/.test(badge), 'las pastillas salen de pastillasCambiosCliente');
  assert.ok(/<PastillasCambiosCliente\b/.test(badge), 'monta las pastillas de cambios');
  const pastilla = sinComentarios(leer('components/PastillaCambiosCliente.tsx'));
  assert.ok(pastilla.includes('router.push(p.ruta)'), 'cada pastilla lleva a su lista');
  assert.ok(pastilla.includes('title={p.titulo}') && pastilla.includes('aria-label={p.ariaLabel}'), 'y dice adónde');
  // r1 (contraste): la insignia del menú contraído y el ícono en ámbar oscuro.
  assert.ok(pastilla.includes('claseInsignia="bg-amber-700 text-white"') && pastilla.includes('claseIcono="text-amber-700"'));
  assert.ok(!/\bbg-amber-500\b|\btext-amber-600\b/.test(pastilla), 'sin los tonos de poco contraste');
  assert.ok(!/\bfixed\b/.test(pastilla) && !/\bdark:/.test(pastilla), 'sin fixed ni dark:');
  // r1 (sin duplicados): la forma de las pastillas vive en UN componente; ni AlertasBadge ni las de cambios la copian.
  const forma = sinComentarios(leer('components/PastillaMenuLateral.tsx'));
  assert.ok(/<button\b/.test(forma) && forma.includes('absolute -top-1.5 -right-1.5'));
  // T18 r2: la forma tampoco flota (las guardias de V1 sobre el botón, que ahora vive aquí) y el texto no se corta con
  // «…»: hace salto de línea dentro del menú («2 solicitudes con cambios» no cabía en 256 px).
  assert.ok(!/\bfixed\b/.test(forma) && !/\btop-4\b|\bright-20\b/.test(forma), 'la forma no flota');
  assert.ok(!/\btruncate\b/.test(forma) && forma.includes('min-w-0 text-left leading-snug'), 'el texto hace salto de línea');
  assert.ok(pastilla.includes('colapsado={colapsado}'), 'las ámbar reciben el menú contraído');
  // T18 r2: con el menú contraído, cada pastilla de cambios se distingue por su ícono (solicitudes y cotizaciones).
  assert.ok(/MessageSquareWarning/.test(pastilla) && /FileWarning/.test(pastilla), 'un ícono por tipo de documento');
  for (const [nombre, fuente] of [['AlertasBadge', badge], ['PastillaCambiosCliente', pastilla]]) {
    assert.ok(/<PastillaMenuLateral\b/.test(fuente) && !/<button\b/.test(fuente), `${nombre} usa PastillaMenuLateral`);
  }

  const sidebar = sinComentarios(leer('components/Sidebar.tsx'));
  assert.ok(/import \{ AlertasBadge \} from '@\/components\/AlertasBadge';/.test(sidebar), 'Sidebar importa AlertasBadge');
  assert.equal((sidebar.match(/<AlertasBadge\b/g) ?? []).length, 1, 'el Sidebar lo monta una vez');
  assert.ok(/<AlertasBadge colapsado=\{isCollapsed\} \/>/.test(sidebar), 'con el estado contraído del menú');
  // Arriba: antes de la lista de grupos del menú.
  assert.ok(sidebar.indexOf('<AlertasBadge') < sidebar.indexOf('MENU_ITEMS.map('), 'arriba, antes de los grupos');
}

console.log('--- V2 TEST 4: el menú de fila de la lista de solicitudes usa la posición fija ---');
{
  // B4 T8 (D27, R11): el RowMenu de T11 se reemplazó por MenuFila de components/ui, el ÚNICO menú ⋯ de la app. La
  // protección es la misma: posición fija calculada desde el botón (posicionMenu), en un portal sobre document.body (el
  // overflow de la tabla no lo corta), las mismas opciones y se cierra con un clic afuera.
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.ok(!lista.includes('function RowMenu('), 'sin el menú propio de la lista');
  const acciones = cuerpo(lista, 'function CeldaAcciones(');
  assert.ok(/<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{sc\.numero\}`\} \/>/.test(acciones), 'la fila usa MenuFila');
  const menu = sinComentarios(leer('components/ui/MenuFila.tsx'));
  assert.ok(/posicionMenu\(/.test(menu), 'calcula la posición desde el botón (posicionMenu)');
  assert.ok(/createPortal\(/.test(menu) && /className="invisible fixed /.test(menu), 'en un portal, con position: fixed');
  assert.ok(!/absolute right-0 top-8/.test(acciones), 'sin la posición absoluta que el overflow cortaba');
  // Las opciones y su lógica no cambian.
  for (const texto of ["etiqueta: 'Ver Detalle'", "etiqueta: 'Editar'", 'etiqueta: `Reiniciar (volver a ${destinoReinicio})`',
    "etiqueta: 'Enviar a la papelera'", "etiqueta: 'Cancelar Solicitud'"]) {
    assert.ok(acciones.includes(texto), `sigue la opción ${texto}`);
  }
  assert.ok(menu.includes("document.addEventListener('pointerdown', alPresionar, true)"), 'sigue cerrando con un clic afuera');
}

console.log('--- V3 TEST 1 (revisión final, F12): CabeceraActividad apila el título y la fecha ---');
{
  // F12: con la fecha al lado (justify-between y basis-28 en el título), a 1440 px el título quedaba en una columna
  // angosta de 6 a 8 líneas. Ahora va SIEMPRE apilada: el título a todo el ancho y la fecha debajo, en su línea.
  const comp = cuerpo(sinComentarios(leer('app/dashboard/ventas/flujo.tsx')), 'export function CabeceraActividad(');
  const clases = [...comp.matchAll(/className=\{?[`"]([^`"$]*)/g)].map((m) => m[1]);
  assert.equal(clases.length, 3, `contenedor, título y fecha: ${clases.join(' | ')}`);
  const [contenedor, titulo, fecha] = clases;
  conClases(contenedor, ['flex', 'flex-col'], ['justify-between', 'flex-wrap', 'flex-row', /^basis-/], 'cabecera apilada');
  conClases(titulo, ['min-w-0', 'break-words', 'font-bold', 'text-sm'], [/^basis-/, 'flex-1', 'shrink-0'],
    'el título usa todo el ancho y parte las palabras largas');
  conClases(fecha, ['whitespace-nowrap', 'text-[10px]', 'text-slate-400'], [/^basis-/],
    'la fecha va debajo, chica y gris, sin partirse');
  assert.ok(comp.indexOf('{titulo}') < comp.indexOf('{fecha}'), 'primero el título y debajo la fecha');
}

console.log('--- V3 TEST 2: la SC, la COT y el PVEN usan la misma cabecera ---');
{
  for (const ruta of ['solicitud/[id]/page.tsx', 'cotizacion/[id]/page.tsx', 'venta/[id]/page.tsx']) {
    const fuente = sinComentarios(leer(`app/dashboard/ventas/${ruta}`));
    // B3 T17 r1 (RP22): entre la descripción y el código humanizado puede ir la etiqueta de ACCIONES_BLOQUE3.
    assert.ok(/<CabeceraActividad\b[^>]*titulo=\{a\.description \|\| (b3\?\.etiqueta \|\| )?humanizarCodigo\(a\.action\)\}/.test(fuente),
      `${ruta}: la tarjeta usa <CabeceraActividad titulo=...>`);
    // B3 T18: la SC también (las acciones nuevas de su Actividad, RP22). B3 T19: y el PVEN; ya van las tres.
    assert.ok(/<CabeceraActividad\b[^>]*titulo=\{a\.description \|\| b3\?\.etiqueta \|\| humanizarCodigo\(a\.action\)\}/.test(fuente),
      `${ruta}: sin descripción, la etiqueta de ACCIONES_BLOQUE3 (RP22)`);
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
  // B4 T10 (D27; FLUJO-documentos punto 5, RP87): el Status Tracker ya no se arma a mano: lo dibuja la pieza común
  // PasosFlujo 'barra' con los 5 pasos de PASOS_PEDIDO (pasosConProgreso), solo con stepIndex >= 0. La protección de V5
  // (a 1024 px las etiquetas salían pegadas) sigue, ahora en la pieza: cada paso es su propio elemento, con la etiqueta
  // centrada bajo su círculo; entre dos pasos va un conector con margen y ancho mínimo (dos etiquetas nunca se tocan) y,
  // con partirEtiquetas (la pasa el Status Tracker), la etiqueta puede partirse en dos líneas en lugar de recortarse.
  const venta = sinComentarios(leer('app/dashboard/ventas/venta/[id]/page.tsx'));
  assert.ok(venta.includes('const pasosPedido = pasosConProgreso(STEPS, stepIndex);'), 'los pasos de PASOS_PEDIDO con su progreso');
  assert.match(venta, /\{stepIndex >= 0 && \(\s*<div className="[^"]*">\s*<PasosFlujo variante="barra" pasos=\{pasosPedido\} etiqueta="Pasos del pedido" partirEtiquetas \/>\s*<\/div>\s*\)\}/,
    'la barra, con la pieza común, sus etiquetas partidas y solo con stepIndex >= 0');
  assert.ok(!venta.includes('{STEPS.map((s, i) => ('), 'sin la barra hecha a mano');
  const pasosFlujo = sinComentarios(leer('components/flujo/PasosFlujo.tsx'));
  const barra = cuerpo(pasosFlujo, 'function PasosBarra(');
  // Ronda 1 (6): clases sueltas, no la cadena exacta.
  const conector = barra.match(/: `(mx-1 [^`$]*)/);
  assert.ok(conector, 'el conector entre dos pasos encontrado');
  conClases(conector[1], ['mx-1', 'min-w-3', 'flex-1'], [], 'entre dos pasos, un conector con margen y ancho mínimo');
  assert.ok(barra.includes("'flex-col items-center text-center'"), 'cada paso es una columna, centrada bajo su círculo');
  assert.ok(barra.includes('<span title={tituloPaso(paso)} className={`${partirEtiquetas ? ETIQUETA_PARTIDA : ETIQUETA_RECORTADA} '),
    'la etiqueta de cada paso, con su title y partida con partirEtiquetas');
  const partida = pasosFlujo.match(/const ETIQUETA_PARTIDA = '([^']*)';/);
  assert.ok(partida, 'la clase de la etiqueta partida');
  conClases(partida[1], ['max-w-full', 'break-words', 'leading-tight', 'whitespace-normal'], ['truncate', 'whitespace-nowrap'],
    'la etiqueta va centrada bajo su paso y puede partirse en dos líneas');
  assert.ok(barra.includes('>{paso.label}</span>'), 'la etiqueta es el label del paso');
  {
    const { tituloPaso, pasosConProgreso } = await import('../src/lib/flujo.js');
    const { PASOS_PEDIDO } = await import('../src/lib/estados-pedido.js');
    for (const p of pasosConProgreso(PASOS_PEDIDO, 2)) assert.ok(tituloPaso(p).includes(p.label), `el title de «${p.label}» lo dice completo`);
  }
}

console.log('--- V6 + V7 TEST: lista de solicitudes ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  // B4 T8 (D27, R13): la lista ya no tiene pestaña Análisis; queda el botón «Ver análisis» (con su tilde) al del Hub.
  assert.ok(!/'Analisis'/.test(lista), 'sin la pestaña Analisis');
  assert.ok(/<ContenidoEnlace icon=\{BarChart3\}>Ver análisis<\/ContenidoEnlace>/.test(lista), 'el botón dice «Ver análisis»');
  // V7: la tarjeta de las activas dice la pista de pistaActivasSolicitudes; B4 T8 (RP19 (4)): con sin_atender y vencidas del
  // resumen del servidor, por tarjetasSolicitudes (test_listas_ventas.mjs, B4 T8 TEST 1).
  assert.ok(/<TarjetaKpi kpi="sc_activas" valor=\{tarjetas\?\.activas\.valor \?\? null\} ayuda=\{tarjetas\?\.activas\.ayuda\}/.test(lista),
    'la tarjeta de las activas usa la ayuda de tarjetasSolicitudes');
  assert.ok(/const tarjetas = tarjetasSolicitudes\(listado\.resumen\);/.test(lista));
  const libListas = sinComentarios(leer('lib/listas-ventas.js'));
  assert.ok(/ayuda: pistaActivasSolicitudes\(resumen\.sin_atender, resumen\.vencidas\)/.test(libListas), 'con pistaActivasSolicitudes');
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
  // B4 T24 f2 (m9, D27): la pila lleva además data-superficie="avisos" (va encima de las ventanas: la capa de arriba no le quita el
  // foco). Las clases que se fijan abajo son las mismas.
  const pila = avisos.match(/<div data-superficie="avisos" className="([^"]*\bz-\[90\][^"]*)">/);
  assert.ok(pila, 'la pila de avisos (z-[90]) encontrada');
  // Arriba al centro (decisión del controlador, ronda 1): a la derecha tapaba «Editar» y «Cancelar Solicitud» de las
  // cabeceras, y abajo el botón principal de las ventanas. Mismo z-index, orden (flex-col) y pointer-events.
  // Revisión final (F11, M1 de la ronda visual r1): también el ancho (hasta 24rem sin salirse de la ventana).
  conClases(pila[1], ['fixed', 'top-4', 'left-1/2', '-translate-x-1/2', 'z-[90]', 'flex', 'flex-col', 'items-center',
    'pointer-events-none', 'w-[min(24rem,calc(100vw_-_2rem))]'], [/^right-/, /^bottom-/, 'items-end'], 'pila de avisos');
  // Revisión final (F1): el Toaster de react-hot-toast (CRM, Agenda, Cotiza…) va abajo al centro: arriba al centro
  // pintaba sus toasts (z-95) justo encima de la pila de avisos.
  const toaster = avisos.match(/<Toaster\b[^>]*\/>/);
  assert.ok(toaster, 'el <Toaster> sigue montado');
  assert.ok(/position="bottom-center"/.test(toaster[0]), `Toaster abajo al centro: ${toaster[0]}`);
  assert.ok(/zIndex:\s*95/.test(toaster[0]), 'mismo z-index (95)');
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
  // B4 T8 (D27, R13): la pestaña Análisis de la lista se fue (y con ella su tarjeta de Activas). Queda UNA tarjeta de las
  // activas, con la pista de tarjetasSolicitudes; ninguna otra arma su propia ayuda.
  const usos = lista.match(/ayuda=\{tarjetas\?\.activas\.ayuda\}/g) ?? [];
  assert.equal(usos.length, 1, 'una sola tarjeta de las activas, con la pista de la librería');
  assert.equal((lista.match(/pistaActivasSolicitudes\(/g) ?? []).length, 0, 'la pantalla no arma la pista: la da tarjetasSolicitudes');
}

console.log('--- R1 (5) TEST 2: RowMenu se cierra si su botón sale de la vista (solo al desplazar o redimensionar) ---');
{
  // B4 T8 (D27, R11): el menú de la fila es MenuFila. Un scroll (de la página o de la tabla, en captura) o un cambio de
  // tamaño de la ventana lo cierran (más estricto que T11: no queda pegado a un botón que se fue de la vista), y abrirlo no
  // lo cierra (la primera medición solo lo ubica y lo muestra).
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.ok(/<MenuFila items=\{items\}/.test(cuerpo(lista, 'function CeldaAcciones(')), 'la fila usa MenuFila');
  // B4 T24 f2 (F48, D27): lo que fijaba el final de TEST 1b (retirado con recortesDeAncestros): sin el menú propio ni recortesDe.
  assert.ok(!lista.includes('function recortesDe(') && !lista.includes('function RowMenu('), 'sin el menú propio de la lista');
  const menu = sinComentarios(leer('components/ui/MenuFila.tsx'));
  assert.ok(/const alDesplazar = \(e: Event\) => \{\s*if \(!\(e\.target instanceof Node && menu\.current\?\.contains\(e\.target\)\)\) setAbierto\(false\);/.test(menu),
    'un scroll fuera del menú lo cierra');
  assert.ok(/const alRedimensionar = \(\) => setAbierto\(false\);/.test(menu), 'un cambio de tamaño lo cierra');
  assert.ok(/addEventListener\('scroll', alDesplazar, true\)/.test(menu) && /addEventListener\('resize', alRedimensionar\)/.test(menu));
  assert.ok(/removeEventListener\('scroll', alDesplazar, true\)/.test(menu) && /removeEventListener\('resize', alRedimensionar\)/.test(menu));
  // La primera medición (al abrir) solo ubica el menú y lo muestra: no lo cierra.
  const abrir = menu.slice(menu.indexOf('useLayoutEffect(() => {'), menu.indexOf('}, [abierto]);'));
  assert.ok(/m\.style\.visibility = 'visible';/.test(abrir) && !/setAbierto\(false\)/.test(abrir), 'abrir no lo cierra');
}

console.log('--- Revisión final (F3): la fecha y la hora de la Actividad de la COT y del PVEN pasan por comoUTC ---');
{
  const cot = sinComentarios(leer('app/dashboard/ventas/cotizacion/[id]/page.tsx'));
  assert.ok(cot.includes('fecha={`${fDate(comoUTC(a.created_at))} ${fTime(comoUTC(a.created_at))}`}'), 'COT');
  const ven = sinComentarios(leer('app/dashboard/ventas/venta/[id]/page.tsx'));
  assert.ok(/fecha=\{`\$\{fDate\(comoUTC\(a\.created_at\)\)\}\$\{a\.created_at \? ` \$\{new Date\(comoUTC\(a\.created_at\)\)\.toLocaleTimeString\(/.test(ven), 'PVEN');
  assert.ok(/import \{[^}]*\bcomoUTC\b[^}]*\} from '@\/lib\/hub-ventas';/.test(ven), 'el PVEN importa comoUTC');
  // Solo ahí: fDate general sigue sin comoUTC (una fecha de negocio a las 00:00 se correría un día).
  assert.ok(ven.includes("const fDate = (iso: any) => iso ? new Date(iso).toLocaleDateString("), 'fDate del PVEN igual');
  const cliente = sinComentarios(leer('app/dashboard/ventas/cotizacion/cotizacion-client.tsx'));
  assert.ok(cliente.includes('iso ? new Date(iso).toLocaleDateString('), 'fDate de la COT igual');
}

console.log('--- Revisión final (F5): tildes de la ventana «Nuevo Proveedor» ---');
{
  const modal = cuerpo(sinComentarios(leer('app/dashboard/ventas/venta/venta-client.tsx')), 'export function NewSupplierModal(');
  for (const texto of ['>Teléfono<', '>Términos de Pago<']) assert.ok(modal.includes(texto), texto);
  for (const texto of ['>Telefono<', '>Terminos de Pago<']) assert.ok(!modal.includes(texto), texto);
}

console.log('--- Revisión final (F6): la carga de /solicitud es neutra; el esqueleto de la lista, solo en la lista ---');
{
  const carga = sinComentarios(leer('app/dashboard/ventas/solicitud/loading.tsx'));
  assert.ok(!/CargandoSolicitudes/.test(carga), 'solicitud/loading.tsx no importa ni pinta el esqueleto de la lista');
  assert.ok(/import \{ LOADING \} from '@\/lib\/design-system';/.test(carga), 'con los tokens del design-system');
  assert.ok(/LOADING\.wrapper/.test(carga) && /LOADING\.spinner/.test(carga) && carga.includes('Cargando…'), 'spinner y «Cargando…»');
  assert.ok(/role="status"/.test(carga), 'región viva');
  // La página protegida conserva su fallback (solo aplica dentro de la lista) y no se movió a un grupo de rutas.
  const pagina = leer('app/dashboard/ventas/solicitud/page.tsx');
  assert.ok(pagina.includes('<Suspense fallback={<CargandoSolicitudes />}>'), 'el fallback del Suspense sigue igual');
  // El comentario de [id]/loading.tsx dice lo que de verdad hace: no evita la carga de solicitud/loading.tsx.
  const detalle = leer('app/dashboard/ventas/solicitud/[id]/loading.tsx');
  assert.ok(!detalle.includes('Sin este archivo, solicitud/loading.tsx mostraba el esqueleto de la LISTA'), 'sin la afirmación equivocada');
}

console.log('--- B3 T19 r1: la tabla de productos del pedido a 1024 px (tarjetas bajo @xl) y su accesibilidad ---');
{
  const tabla = cuerpo(sinComentarios(leer('app/dashboard/ventas/venta/[id]/detalle-bloque3.tsx')), 'export function TablaProductosPedido(');
  // La columna izquierda mide unos 390 px a 1024: bajo @xl (container query del @container de page.tsx) cada línea es
  // una tarjeta; desde @xl, la tabla de 5 columnas.
  const tarjetas = tabla.match(/<ul className="([^"]*)"/);
  assert.ok(tarjetas, 'la lista de tarjetas');
  conClases(tarjetas[1], ['@xl:hidden'], [/^(sm|md|lg|xl):/], 'tarjetas solo bajo @xl');
  const envoltura = tabla.match(/<div className="([^"]*overflow-x-auto[^"]*)"/);
  assert.ok(envoltura, 'la tarjeta de la tabla');
  conClases(envoltura[1], ['hidden', '@xl:block'], [/^(sm|md|lg|xl):/], 'la tabla desde @xl');
  assert.ok(!/(^|[\s"'`])(sm|md|lg|xl):/m.test(tabla), 'sin breakpoints de la ventana en el panel (solo @container)');
  // Accesibilidad (menor 9): los cinco encabezados con scope="col"; el texto gris legible; la raya con su texto.
  // B4 T10 (D27; TABLA-listas-ventas punto 8, RP38): desde @xl la tabla es TablaEstandar en modo 'simple' con las cinco
  // columnas (ninguna oculta por defecto) y la tabla estándar pone scope="col" en el encabezado de cada columna visible.
  assert.match(tabla, /<TablaEstandar id="ventas\.pedido\.productos" modo="simple" columnas=\{columnas\} preferencias=\{prefs\}/);
  assert.deepEqual([...tabla.matchAll(/\{ id: '([a-z]+)', titulo: /g)].map((m) => m[1]), ['producto', 'cantidad', 'unitario', 'iva', 'total'],
    'las cinco columnas');
  assert.ok(!tabla.includes('ocultaPorDefecto'), 'ninguna sale oculta: se ven los cinco encabezados');
  const estandar = sinComentarios(leer('components/tabla/TablaEstandar.tsx'));
  const encabezados = estandar.slice(estandar.indexOf('<thead>'), estandar.indexOf('</thead>'));
  assert.match(encabezados, /\{visibles\.map\(\(v\) => \{[\s\S]*?<th\s+key=\{v\}[\s\S]*?scope="col"/, 'scope="col" en el th de cada columna');
  assert.ok(!tabla.includes('text-slate-400">{ETIQUETA_SIN_TARIFA}'), 'IVA no discriminado sin slate-400');
  assert.ok(/<span aria-hidden="true"[^>]*>—<\/span><span className="sr-only">Sin IVA<\/span>/.test(tabla), 'la raya con su texto');
  // Ruling r1 (menor 6): la columna dice «Total con IVA» cuando el pedido tiene el IVA discriminado.
  assert.ok(tabla.includes("'Total con IVA'"), 'encabezado «Total con IVA»');
}

console.log('OK test_ajustes_visuales_b2.mjs');
