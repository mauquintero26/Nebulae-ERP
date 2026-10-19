/**
 * frontend/tests/test_cambios_cliente.mjs
 * B3 T12 (H28-cambios punto 7, C9): lib/cambios-cliente.js.
 * cambios_cliente llega en el detalle de la SC (_sc_dict) y de la COT (get_cotizacion) como {at ('...Z'), tipo
 * ('CAMBIOS' | 'NO_LA_NECESITA'), comentario} o null (erp_ventas._cambios_cliente_dict). La marca vale mientras el
 * documento sigue en manos del asesor: la SC en Asignada o Nueva (BORRADOR) y la COT en Borrador
 * (_ESTADOS_CON_CAMBIOS_VIGENTES).
 */

import assert from 'node:assert/strict';
import { avisoCambiosCliente, etiquetaChipCambios } from '../src/lib/cambios-cliente.js';

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

console.log('✓ Todas las pruebas de los cambios del cliente pasaron.');
