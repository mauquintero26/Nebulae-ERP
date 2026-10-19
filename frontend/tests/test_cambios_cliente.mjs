/**
 * frontend/tests/test_cambios_cliente.mjs
 * B3 T12 (H28-cambios punto 7, C9): lib/cambios-cliente.js.
 * cambios_cliente llega en el detalle de la SC (_sc_dict) y de la COT (get_cotizacion) como {at ('...Z'), tipo
 * ('CAMBIOS' | 'NO_LA_NECESITA'), comentario} o null (erp_ventas._cambios_cliente_dict). La marca vale mientras el
 * documento sigue en manos del asesor: la SC en Asignada o Nueva (BORRADOR) y la COT en Borrador
 * (_ESTADOS_CON_CAMBIOS_VIGENTES).
 * B3 T18: textoCambiosCliente (la pastilla de AlertasBadge) y motivoCancelacionNoLaNecesita («Cancelar solicitud», R8).
 */

import assert from 'node:assert/strict';
import {
  avisoCambiosCliente, etiquetaChipCambios, textoCambiosCliente, motivoCancelacionNoLaNecesita, MAX_MOTIVO_CANCELACION,
  RUTA_CAMBIOS_CLIENTE,
} from '../src/lib/cambios-cliente.js';

const cambios = (tipo, comentario = 'Son 8 rodillos, no 6, y agrega 2 brochas de 3 pulgadas.') =>
  ({ at: '2026-10-03T20:15:00Z', tipo, comentario });

console.log('--- TEST 1: avisoCambiosCliente en la SC ---');
{
  const aviso = avisoCambiosCliente({ estado: 'ASIGNADA', cambios_cliente: cambios('CAMBIOS') });
  assert.equal(aviso.tono, 'ambar');
  assert.equal(aviso.titulo, 'El cliente pidió cambios');
  assert.equal(aviso.texto, 'Son 8 rodillos, no 6, y agrega 2 brochas de 3 pulgadas.');
  assert.equal(aviso.fecha, 'sábado 3 de octubre, 3:15 p. m.', 'la fecha leída con Z, en hora de Colombia');
  assert.equal(aviso.at, '2026-10-03T20:15:00Z');

  assert.equal(avisoCambiosCliente({ estado: 'PENDIENTE_CONFIRMACION', cambios_cliente: cambios('CAMBIOS') }), null,
    'reenviada: la marca ya no vale');
  const noLaNecesita = avisoCambiosCliente({ estado: 'BORRADOR', cambios_cliente: cambios('NO_LA_NECESITA', null) });
  assert.equal(noLaNecesita.tono, 'rosa');
  assert.equal(noLaNecesita.titulo, 'El cliente dice que ya no la necesita');
  assert.equal(noLaNecesita.texto, null, 'sin comentario');
  assert.equal(avisoCambiosCliente({ estado: 'ASIGNADA', cambios_cliente: null }), null, 'sin cambios_cliente');
  assert.equal(avisoCambiosCliente({ estado: 'ASIGNADA' }), null);
  assert.equal(avisoCambiosCliente({ estado: 'CANCELADA', cambios_cliente: cambios('CAMBIOS') }), null);
  assert.equal(avisoCambiosCliente(null), null);
}

console.log('--- TEST 2: la COT en Borrador con cambios_cliente -> tarjeta ámbar ---');
{
  const aviso = avisoCambiosCliente({ estado: 'BORRADOR', cambios_cliente: cambios('CAMBIOS', 'Quiero 6 galones en vez de 4') },
    'COT');
  assert.equal(aviso.tono, 'ambar');
  assert.equal(aviso.titulo, 'El cliente pidió cambios');
  assert.equal(aviso.texto, 'Quiero 6 galones en vez de 4');
  assert.equal(avisoCambiosCliente({ estado: 'ASIGNADA', cambios_cliente: cambios('CAMBIOS') }, 'COT'), null,
    'la COT solo en Borrador');
  assert.equal(avisoCambiosCliente({ estado: 'PENDIENTE_CONFIRMACION', cambios_cliente: cambios('CAMBIOS') }, 'COT'), null);
}

console.log('--- TEST 3: etiquetaChipCambios ---');
{
  assert.equal(etiquetaChipCambios({ estado: 'ASIGNADA', cambios_cliente: cambios('CAMBIOS') }), 'Cambios pedidos');
  assert.equal(etiquetaChipCambios({ estado: 'BORRADOR', cambios_cliente: cambios('NO_LA_NECESITA') }), 'Ya no la necesita');
  assert.equal(etiquetaChipCambios({ estado: 'ASIGNADA', cambios_cliente: null }), null);
  assert.equal(etiquetaChipCambios({ estado: 'PENDIENTE_CONFIRMACION', cambios_cliente: cambios('CAMBIOS') }), null);
  assert.equal(etiquetaChipCambios({ estado: 'BORRADOR', cambios_cliente: cambios('CAMBIOS') }, 'COT'), 'Cambios pedidos');
  assert.equal(etiquetaChipCambios(undefined), null);
}

console.log('--- TEST 4 (T18, H28-cambios punto 11, C22): textoCambiosCliente, la pastilla ámbar de AlertasBadge ---');
{
  // El `cambios_cliente` de GET /ventas/alertas/resumen: una cuenta aparte de los atrasados.
  assert.equal(textoCambiosCliente(1), '1 con cambios del cliente');
  assert.equal(textoCambiosCliente(3), '3 con cambios del cliente');
  assert.equal(textoCambiosCliente('4'), '4 con cambios del cliente', 'el número puede llegar como texto');
  // Con 0 (o un valor que no es un número positivo) no hay texto: la pastilla no se muestra.
  for (const n of [0, -1, null, undefined, '', '  ', 'x', NaN, Infinity]) assert.equal(textoCambiosCliente(n), '', String(n));
  // El clic lleva a la lista de solicitudes, donde está la marca «Cambios pedidos» (H28-cambios punto 11).
  assert.equal(RUTA_CAMBIOS_CLIENTE, '/dashboard/ventas/solicitud');
}

console.log('--- TEST 5 (T18, R8): motivoCancelacionNoLaNecesita, el motivo prellenado de «Cancelar solicitud» ---');
{
  const sc = (comentario, estado = 'ASIGNADA', tipo = 'NO_LA_NECESITA') => ({ estado, cambios_cliente: cambios(tipo, comentario) });
  assert.equal(MAX_MOTIVO_CANCELACION, 500, 'el máximo del motivo de POST /solicitudes/{id}/cancelar');
  assert.equal(motivoCancelacionNoLaNecesita(sc('  Ya lo compré en otra tienda.  ')),
    'El cliente ya no la necesita: Ya lo compré en otra tienda.', 'con su comentario, sin los espacios de los bordes');
  assert.equal(motivoCancelacionNoLaNecesita(sc(null)), 'El cliente ya no la necesita.', 'sin comentario');
  assert.equal(motivoCancelacionNoLaNecesita(sc('   ')), 'El cliente ya no la necesita.', 'un comentario en blanco');
  assert.equal(motivoCancelacionNoLaNecesita(sc('x', 'BORRADOR')), 'El cliente ya no la necesita: x', 'también en Nueva');
  // Solo con «Ya no la necesita» vigente (la SC en Asignada o Nueva).
  assert.equal(motivoCancelacionNoLaNecesita(sc('Son 8', 'ASIGNADA', 'CAMBIOS')), null, 'pidió cambios: no se prellena');
  assert.equal(motivoCancelacionNoLaNecesita(sc('Ya no', 'PENDIENTE_CONFIRMACION')), null, 'reenviada: la marca ya no vale');
  assert.equal(motivoCancelacionNoLaNecesita({ estado: 'ASIGNADA', cambios_cliente: null }), null);
  assert.equal(motivoCancelacionNoLaNecesita(null), null);
  // El comentario llega hasta 1000 caracteres y el motivo admite 500 (len() de Python: puntos de código): se corta con
  // «…» y nunca parte un emoji.
  const largo = motivoCancelacionNoLaNecesita(sc('a'.repeat(1000)));
  assert.equal([...largo].length, 500);
  assert.ok(largo.startsWith('El cliente ya no la necesita: aaa') && largo.endsWith('a…'), largo.slice(-5));
  const conEmoji = motivoCancelacionNoLaNecesita(sc('😀'.repeat(600)));
  assert.equal([...conEmoji].length, 500);
  assert.ok(conEmoji.endsWith('😀…'), 'el corte no deja medio emoji');
  // Justo en el límite no se corta.
  const justo = 'b'.repeat(500 - 'El cliente ya no la necesita: '.length);
  assert.equal(motivoCancelacionNoLaNecesita(sc(justo)), `El cliente ya no la necesita: ${justo}`);
}

console.log('✓ Todas las pruebas de los cambios del cliente pasaron.');
