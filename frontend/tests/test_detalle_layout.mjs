/**
 * frontend/tests/test_detalle_layout.mjs
 * H37 + C12 (Bloque 2, T6B): un solo botón de volver con su destino escrito y el ancho inicial del panel derecho de
 * los detalles (SC, COT, PVEN). Incluye returnToSeguro (ruling T6B-2): el return_to débil de la SC y el PVEN
 * (startsWith('/') && !startsWith('//')) dejaba pasar '/\evil.com', que el navegador resuelve como //evil.com.
 */

import assert from 'node:assert/strict';
import { returnToSeguro, destinoVolver, etiquetaVolver, anchoInicialPanel } from '../src/lib/detalle-layout.js';

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
  ]) {
    assert.equal(returnToSeguro(malo), '', `debía rechazar ${JSON.stringify(malo)}`);
  }
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

console.log('OK test_detalle_layout.mjs');
