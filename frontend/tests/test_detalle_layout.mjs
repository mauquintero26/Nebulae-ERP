/**
 * frontend/tests/test_detalle_layout.mjs
 * H37 + C12 (Bloque 2, T6B): un solo botón de volver con su destino escrito y el ancho inicial del panel derecho de
 * los detalles (SC, COT, PVEN). Incluye returnToSeguro (ruling T6B-2): el return_to débil de la SC y el PVEN
 * (startsWith('/') && !startsWith('//')) dejaba pasar '/\evil.com', que el navegador resuelve como //evil.com.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { returnToSeguro, destinoVolver, etiquetaVolver, anchoInicialPanel } from '../src/lib/detalle-layout.js';
// B4.1 T10 (P14): por el espacio de nombres, para que la falta de la función nueva no tape los demás casos.
import * as DL from '../src/lib/detalle-layout.js';

const COT = '/dashboard/ventas/cotizacion';

console.log('--- TEST 1: returnToSeguro acepta rutas internas del dashboard ---');
{
  assert.equal(returnToSeguro('/dashboard/ventas/solicitud/5'), '/dashboard/ventas/solicitud/5');
  assert.equal(returnToSeguro('/dashboard/ventas/cotizacion/3?return_to=%2Fdashboard%2Fventas&tab=chatter#notas'),
    '/dashboard/ventas/cotizacion/3?return_to=%2Fdashboard%2Fventas&tab=chatter#notas', 'conserva query y hash');
  assert.equal(returnToSeguro('/dashboard/ventas'), '/dashboard/ventas', 'el Hub');
  assert.equal(returnToSeguro('/dashboard/'), '/dashboard/');
  assert.equal(returnToSeguro('/dashboard'), '', "sin la barra no empieza por '/dashboard/'");
  assert.equal(returnToSeguro('/dashboardx/ventas'), '');
  // Lo que se devuelve es la ruta ya resuelta: un '..' que se queda dentro del dashboard se normaliza.
  assert.equal(returnToSeguro('/dashboard/ventas/../ventas/solicitud/5'), '/dashboard/ventas/solicitud/5');
}

console.log('--- TEST 2: returnToSeguro rechaza lo que sale del origen o del dashboard (open redirect) ---');
{
  for (const malo of [
    '/\\evil.com', // el parser de URL trata '\' como '/': //evil.com
    '//evil.com',
    '///evil.com',
    'https://evil.com',
    'http://localhost/dashboard/ventas',
    'javascript:alert(1)',
    '/dashboard/../login',
    '/dashboard/%2e%2e/login', // %2e%2e es '..' para el parser
    '/dashboard/..',
    '/dashboard/ventas\\..\\..\\login',
    '/dashboard/\\evil.com',
    '/dashboard/\t/x', // tabulador y saltos de línea: el parser los borra en silencio
    '/dashboard/x\n',
    '/login',
    'dashboard/ventas',
    '',
    '   ',
    null,
    undefined,
    42,
    {},
    // Ronda 1, punto 15.
    '\\\\evil.com',
    'http:/evil.com',
    'JaVaScRiPt:alert(1)',
    'data:text/html,x',
    ' /dashboard/x',
    '/dashboard/x\r',
    '/dashboard/\0x',
    // Ronda 1, punto 12: una ruta con '//' no se acepta (ni al principio ni en medio).
    '/dashboard//evil.com',
    '/dashboard/ventas//solicitud/5',
  ]) {
    assert.equal(returnToSeguro(malo), '', `debía rechazar ${JSON.stringify(malo)}`);
  }
}

console.log('--- TEST 2b: propiedad de lo aceptado (ronda 1, punto 15) ---');
{
  const entradas = [
    '/dashboard/', '/dashboard/ventas', '/dashboard/ventas/', '/dashboard/ventas/solicitud/5',
    '/dashboard/ventas/cotizacion/3?return_to=%2Fdashboard%2Fventas&tab=chatter#notas',
    '/dashboard/ventas/../ventas/venta/9', '/dashboard/ventas/./venta/9', '/dashboard/ventas/solicitud/5?q=a b',
    '/dashboard/%2F%2Fevil.com', '/dashboard/x?y=//evil.com', '/dashboard/x#//evil.com', '/dashboard/ventas/á',
    // y las rechazadas, que no deben producir nada:
    '/\\evil.com', '//evil.com', '/dashboard/../login', '/dashboard//x', 'javascript:alert(1)',
  ];
  let aceptadas = 0;
  for (const x of entradas) {
    const r = returnToSeguro(x);
    if (!r) continue;
    aceptadas += 1;
    assert.ok(r.startsWith('/dashboard/'), `${x} -> ${r}`);
    const u = new URL(r, 'https://erp.example');
    assert.equal(u.origin, 'https://erp.example', `${x} -> ${r} cambia de origen`);
    assert.ok(u.pathname.startsWith('/dashboard/'), `${x} -> ${r} sale del dashboard`);
    assert.equal(returnToSeguro(r), r, `${x}: idempotente`);
  }
  assert.ok(aceptadas >= 10, `se aceptaron ${aceptadas}`);
}

console.log('--- TEST 3: destinoVolver aplica returnToSeguro y si no, el valor por defecto ---');
{
  assert.equal(destinoVolver('', COT), COT);
  assert.equal(destinoVolver(null, COT), COT);
  assert.equal(destinoVolver(undefined, COT), COT);
  assert.equal(destinoVolver('/dashboard/ventas/solicitud/5', COT), '/dashboard/ventas/solicitud/5');
  for (const malo of ['/\\evil.com', '//evil.com', 'https://evil.com', '/dashboard/../login', 'javascript:alert(1)']) {
    assert.equal(destinoVolver(malo, COT), COT, `${malo} -> por defecto`);
  }
  // Idempotente: pasarle un valor ya saneado da lo mismo.
  const saneado = returnToSeguro('/dashboard/ventas/solicitud/5?x=1');
  assert.equal(destinoVolver(saneado, COT), saneado);
}

console.log('--- TEST 4: etiquetaVolver (8 casos de H37) ---');
{
  assert.equal(etiquetaVolver('/dashboard/ventas/solicitud/12'), 'Volver a la solicitud');
  assert.equal(etiquetaVolver('/dashboard/ventas/solicitud'), 'Volver a solicitudes');
  assert.equal(etiquetaVolver('/dashboard/ventas/cotizacion/3'), 'Volver a la cotización');
  assert.equal(etiquetaVolver('/dashboard/ventas/cotizacion/3?return_to=x'), 'Volver a la cotización');
  assert.equal(etiquetaVolver('/dashboard/ventas/cotizacion'), 'Volver a cotizaciones');
  assert.equal(etiquetaVolver('/dashboard/ventas/venta/9#pagos'), 'Volver al pedido');
  assert.equal(etiquetaVolver('/dashboard/ventas/venta'), 'Volver a pedidos');
  assert.equal(etiquetaVolver('/dashboard/ventas'), 'Volver al Hub de Ventas');
  assert.equal(etiquetaVolver('/dashboard/ventas/?x=1'), 'Volver al Hub de Ventas', 'barra final');
  assert.equal(etiquetaVolver('/dashboard/otra'), 'Volver');
  assert.equal(etiquetaVolver('/dashboard/ventas/solicitud/nueva'), 'Volver', 'nueva no es una solicitud');
  assert.equal(etiquetaVolver('/dashboard/ventas/venta/9/otra'), 'Volver');
  assert.equal(etiquetaVolver(''), 'Volver');
  assert.equal(etiquetaVolver(null), 'Volver');
  assert.equal(etiquetaVolver('/dashboard/ventas/venta///'), 'Volver a pedidos', 'varias barras finales');
  assert.equal(etiquetaVolver('/'), 'Volver');
  // Ronda 1, punto 12: tiempo lineal con muchas barras (la regex /(.)\/+$/ era cuadrática: ~2,4 s con 60.000).
  const inicio = Date.now();
  assert.equal(etiquetaVolver(`/dashboard/ventas${'/'.repeat(60000)}x`), 'Volver');
  assert.equal(etiquetaVolver(`/dashboard/ventas${'/'.repeat(60000)}`), 'Volver al Hub de Ventas');
  assert.ok(Date.now() - inicio < 500, `tardó ${Date.now() - inicio} ms`);
}

console.log('--- TEST 5: anchoInicialPanel = min(400, max(300, 0,3 × ancho)) ---');
{
  assert.equal(anchoInicialPanel(1024), 307);
  assert.equal(anchoInicialPanel(1440), 400);
  assert.equal(anchoInicialPanel(800), 300);
  assert.equal(anchoInicialPanel(1280), 384);
  assert.equal(anchoInicialPanel(NaN), 400);
  assert.equal(anchoInicialPanel(Infinity), 400);
  assert.equal(anchoInicialPanel(undefined), 400);
  assert.equal(anchoInicialPanel('1024'), 400, 'solo números');
}

console.log('--- B4.1 T10 (P14): los detalles de SC y COT a 375 px, con la Actividad plegable por debajo de md (768) ---');
{
  const { clasesDivisionDetalle } = DL;
  const plegada = clasesDivisionDetalle(false);
  const abierta = clasesDivisionDetalle(true);
  const tokens = (clases) => clases.split(' ');
  // Las cinco claves exactas.
  assert.deepEqual(Object.keys(plegada).sort(), ['asa', 'botonActividad', 'contenedor', 'izquierda', 'panel']);
  assert.deepEqual(Object.keys(abierta).sort(), ['asa', 'botonActividad', 'contenedor', 'izquierda', 'panel']);
  // Plegada: el panel no se ve por debajo de md (hidden) y desde md vuelve a ser la columna de siempre (md:flex).
  assert.ok(tokens(plegada.panel).includes('hidden'), `plegada: hidden (${plegada.panel})`);
  assert.ok(tokens(plegada.panel).includes('md:flex'), 'plegada: md:flex');
  assert.ok(!tokens(plegada.panel).includes('flex'), 'plegada: sin flex suelto (pisaría el hidden)');
  // Abierta (pre-flight H30: el token flex aislado; includes('flex') también es cierto con false por flex-col y md:flex).
  assert.ok(tokens(abierta.panel).includes('flex'), `abierta: flex (${abierta.panel})`);
  assert.ok(tokens(abierta.panel).includes('max-md:min-h-[70vh]'), 'abierta: alto mínimo en el teléfono');
  assert.ok(!tokens(abierta.panel).includes('hidden'), 'abierta: sin hidden');
  // Los valores exactos del brief.
  assert.equal(plegada.panel, 'hidden w-full flex-col md:flex md:w-[var(--ancho-panel)] md:shrink-0');
  assert.equal(abierta.panel, 'flex max-md:min-h-[70vh] w-full flex-col md:flex md:w-[var(--ancho-panel)] md:shrink-0');
  for (const d of [plegada, abierta]) {
    assert.equal(d.contenedor, 'flex-1 flex flex-col overflow-y-auto md:flex-row md:overflow-hidden');
    assert.equal(d.izquierda, 'shrink-0 md:flex-1 md:shrink md:overflow-y-auto');
    assert.equal(d.asa, 'hidden md:block');
    assert.equal(d.botonActividad, 'md:hidden');
  }

  // Los dos detalles toman las clases de la división; el ancho arrastrable pasa a una variable CSS (solo desde md).
  const leer = (ruta) => readFileSync(new URL(`../src/app/dashboard/ventas/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const ruta of ['solicitud/[id]/page.tsx', 'cotizacion/[id]/page.tsx']) {
    const f = leer(ruta);
    assert.ok(f.includes('clasesDivisionDetalle(actividadAbierta)'), `${ruta}: clasesDivisionDetalle(actividadAbierta)`);
    assert.ok(f.includes("['--ancho-panel' as string]: `${rightWidth}px`"), `${ruta}: --ancho-panel`);
    assert.ok(f.includes('aria-expanded={actividadAbierta}'), `${ruta}: aria-expanded`);
    assert.ok(!f.includes('style={{ width: rightWidth }}') && !f.includes('style={{width: rightWidth}}'), `${ruta}: sin el ancho fijo en el style`);
    assert.ok(f.includes('const [actividadAbierta, setActividadAbierta] = useState(false);'), `${ruta}: plegada al entrar`);
    assert.ok(f.includes('const division = clasesDivisionDetalle(actividadAbierta);'), `${ruta}: division`);
    assert.ok(f.includes('<div className={division.contenedor}>'), `${ruta}: division.contenedor`);
    // La columna izquierda, el asa y el panel: las clases de la división primero y detrás las propias de cada página.
    for (const clave of ['izquierda', 'asa', 'panel']) {
      assert.ok(f.includes(`className={\`\${division.${clave}} `), `${ruta}: division.${clave}`);
    }
    assert.ok(f.includes('className={`${division.botonActividad} '), `${ruta}: el botón de la Actividad, solo por debajo de md`);
    assert.ok(f.includes('aria-controls="panel-actividad"') && f.includes('id="panel-actividad"'), `${ruta}: el botón controla el panel`);
    assert.ok(f.includes("{actividadAbierta ? 'Ocultar actividad' : 'Ver actividad'}"), `${ruta}: «Ver actividad» / «Ocultar actividad»`);
    // El botón va antes del panel.
    assert.ok(f.indexOf('aria-controls="panel-actividad"') < f.indexOf('id="panel-actividad"'), `${ruta}: el botón antes del panel`);
  }
}

console.log('OK test_detalle_layout.mjs');
