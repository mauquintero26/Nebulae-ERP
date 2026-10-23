/**
 * frontend/tests/test_cambios_cliente.mjs
 * B3 T12 (H28-cambios punto 7, C9): lib/cambios-cliente.js.
 * cambios_cliente llega en el detalle de la SC (_sc_dict) y de la COT (get_cotizacion) como {at ('...Z'), tipo
 * ('CAMBIOS' | 'NO_LA_NECESITA'), comentario} o null (erp_ventas._cambios_cliente_dict). La marca vale mientras el
 * documento sigue en manos del asesor: la SC en Asignada o Nueva (BORRADOR) y la COT en Borrador
 * (_ESTADOS_CON_CAMBIOS_VIGENTES).
 * B3 T18: motivoCancelacionNoLaNecesita («Cancelar solicitud», R8). r1: pastillasCambiosCliente (las pastillas de
 * AlertasBadge, cada una a su lista), AYUDA_NOTA_CLIENTE y las guardias de las pantallas que usan la pastilla.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import {
  avisoCambiosCliente, etiquetaChipCambios, motivoCancelacionNoLaNecesita, MAX_MOTIVO_CANCELACION,
  pastillasCambiosCliente, RUTA_LISTA_SOLICITUDES, RUTA_LISTA_COTIZACIONES, AYUDA_NOTA_CLIENTE,
  TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD,
} from '../src/lib/cambios-cliente.js';

const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

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

console.log('--- TEST 4 (T18 r1, H28-cambios punto 11, C9, C22): pastillasCambiosCliente, cada pastilla a su lista ---');
{
  assert.equal(RUTA_LISTA_SOLICITUDES, '/dashboard/ventas/solicitud');
  assert.equal(RUTA_LISTA_COTIZACIONES, '/dashboard/ventas/cotizacion');
  // Solo solicitudes con cambios: una pastilla, a la lista de solicitudes (donde está la marca).
  assert.deepEqual(pastillasCambiosCliente({ atrasados: 4, cambios_cliente: 2, cambios_cliente_sc: 2, cambios_cliente_cot: 0 }), [{
    clave: 'SC', cantidad: 2, texto: '2 solicitudes con cambios', ruta: '/dashboard/ventas/solicitud',
    titulo: 'Solicitudes con cambios pedidos por el cliente: abre la lista de solicitudes',
    ariaLabel: '2 solicitudes con cambios pedidos por el cliente: ver la lista de solicitudes',
  }]);
  // Solo cotizaciones (en singular): a la lista de cotizaciones.
  assert.deepEqual(pastillasCambiosCliente({ cambios_cliente: 1, cambios_cliente_sc: 0, cambios_cliente_cot: 1 }), [{
    clave: 'COT', cantidad: 1, texto: '1 cotización con cambios', ruta: '/dashboard/ventas/cotizacion',
    titulo: 'Cotizaciones con cambios pedidos por el cliente: abre la lista de cotizaciones',
    ariaLabel: '1 cotización con cambios pedidos por el cliente: ver la lista de cotizaciones',
  }]);
  // De los dos: dos pastillas, cada una con su número y su destino (primero la de solicitudes).
  assert.deepEqual(pastillasCambiosCliente({ cambios_cliente_sc: '1', cambios_cliente_cot: 3 }).map((p) => [p.clave, p.texto, p.ruta]), [
    ['SC', '1 solicitud con cambios', '/dashboard/ventas/solicitud'],
    ['COT', '3 cotizaciones con cambios', '/dashboard/ventas/cotizacion'],
  ]);
  // Sin cuentas positivas no hay pastillas. Solo la suma (cambios_cliente) no dice adónde llevar: tampoco.
  for (const r of [null, undefined, 'x', {}, { cambios_cliente_sc: 0, cambios_cliente_cot: 0 }, { cambios_cliente: 5 },
    { cambios_cliente_sc: -1, cambios_cliente_cot: 'x' }]) {
    assert.deepEqual(pastillasCambiosCliente(r), [], JSON.stringify(r));
  }
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

console.log('--- TEST 6 (T18 r1): AYUDA_NOTA_CLIENTE y las pantallas que usan la pastilla ---');
{
  // R3 (C19): una sola redacción del aviso bajo la nota que ve el cliente.
  assert.equal(AYUDA_NOTA_CLIENTE, 'El cliente verá esta nota');
  const detalle = leer('app/dashboard/ventas/solicitud/[id]/detalle-bloque3.tsx');
  assert.ok(/import \{[^}]*\bAYUDA_NOTA_CLIENTE\b[^}]*\} from '@\/lib\/cambios-cliente';/.test(detalle), 'la SC la importa de la lib');
  assert.ok(!detalle.includes("'El cliente verá esta nota'"), 'sin copia en la pantalla');
  // T20 (M5): en el pedido, «Nota de la cotización» es la que ve el cliente (R3) y lo dice con la misma constante; la
  // «Nota de la solicitud» (interna) y las «Notas del pedido» no llevan el aviso.
  const venta = leer('app/dashboard/ventas/venta/[id]/page.tsx');
  assert.ok(/import \{[^}]*\bAYUDA_NOTA_CLIENTE\b[^}]*\} from '@\/lib\/cambios-cliente';/.test(venta), 'el pedido la importa de la lib');
  assert.ok(!venta.includes('El cliente verá esta nota'), 'sin copia en la pantalla del pedido');
  assert.ok(venta.includes("['Nota de la cotización', notaCotizacion, AYUDA_NOTA_CLIENTE]"), 'el aviso va con la nota de la COT');
  assert.ok(venta.includes("['Nota de la solicitud', notaSolicitud, null]"), 'la nota interna de la SC no lo lleva');
  assert.ok(venta.includes("['Notas del pedido', mostrarNotaPedido ? notaPedido : '', null]"), 'las notas del pedido tampoco');
  assert.ok(/\{ayuda && <p className="[^"]*">\{ayuda\}<\/p>\}/.test(venta), 'se pinta debajo de la nota');
  // La pastilla de la lista es UNA (ventas/chip-cambios-cliente.tsx) con etiquetaChipCambios, en las dos listas.
  const chip = leer('app/dashboard/ventas/chip-cambios-cliente.tsx');
  assert.ok(chip.includes('etiquetaChipCambios(doc, tipoDoc)') && chip.includes('avisoCambiosCliente(doc, tipoDoc)'));
  assert.ok(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx').includes('<ChipCambiosCliente doc={sc}/>'), 'lista de SC');
  assert.ok(leer('app/dashboard/ventas/cotizacion/cotizacion-client.tsx').includes('<ChipCambiosCliente doc={cot} tipoDoc="COT"/>'),
    'lista de COT');
}

console.log('--- Revisión final B3 (F2, M8 y M51): la «Nota para el cliente» de la SC en la COT y el PVEN; un solo aviso ---');
{
  // Sin los comentarios ({/* */}, /* */ y //): un comentario puede citar el aviso.
  const codigo = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const importa = (fuente, simbolo) =>
    new RegExp(`import \\{[^}]*\\b${simbolo}\\b[^}]*\\} from '@/lib/cambios-cliente';`).test(fuente);
  // M51: ningún .tsx de dashboard/ventas escribe el aviso a mano; los dos sitios de la COT (T17) importan la constante.
  const carpeta = new URL('../src/app/dashboard/ventas/', import.meta.url);
  const tsx = readdirSync(carpeta, { recursive: true }).map(String).filter((n) => n.endsWith('.tsx'));
  assert.ok(tsx.length > 20, 'se leen los .tsx de ventas');
  for (const nombre of tsx) {
    const fuente = readFileSync(new URL(nombre.replace(/\\/g, '/'), carpeta), 'utf8');
    assert.ok(!codigo(fuente).includes('El cliente verá esta nota'), `${nombre}: el aviso sale de AYUDA_NOTA_CLIENTE`);
  }
  const editor = leer('app/dashboard/ventas/cotizacion/cotizacion-client.tsx');
  const cot = leer('app/dashboard/ventas/cotizacion/[id]/page.tsx');
  assert.ok(importa(editor, 'AYUDA_NOTA_CLIENTE') && importa(cot, 'AYUDA_NOTA_CLIENTE'), 'la COT importa la constante');
  assert.ok(/<p id=\{notasAyudaId\} [^>]*>\{AYUDA_NOTA_CLIENTE\}<\/p>/.test(editor), 'la calculadora, ligada al textarea');
  assert.ok(/<p className="[^"]*">\{AYUDA_NOTA_CLIENTE\}<\/p>/.test(cot), 'el detalle, bajo la nota de la cotización');

  // M8: la SC le manda su «Nota para el cliente» al cliente también en la COT y el PVEN (notas_para_cliente del
  // servidor): sus detalles internos la muestran aparte, con su título y el aviso, desde sc_nota_cliente.
  assert.equal(TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD, 'Nota para el cliente (de la solicitud)');
  assert.ok(importa(cot, 'TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD'), 'la COT importa el título');
  assert.ok(cot.includes('<NotaParaElCliente nota={cotizacion?.sc_nota_cliente} titulo={TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD} />'),
    'la COT la pinta con la pieza de la SC');
  assert.ok(cot.includes('(cotizacion?.sc_notas || cotizacion?.sc_nota_cliente || cotizacion?.notas) && ('),
    'también cuando es la única nota');
  assert.ok(!cot.includes('la de la solicitud no (es interna)'), 'el comentario ya no dice que el cliente no ve la SC');
  const detalleSc = leer('app/dashboard/ventas/solicitud/[id]/detalle-bloque3.tsx');
  assert.ok(detalleSc.includes("export function NotaParaElCliente({ nota, titulo = 'Nota para el cliente' }"),
    'NotaParaElCliente acepta el título (el de la SC por defecto)');
  assert.ok(/>\{titulo\}<\/p>/.test(detalleSc) && /\{AYUDA_NOTA_CLIENTE\}/.test(detalleSc));
  const venta = leer('app/dashboard/ventas/venta/[id]/page.tsx');
  assert.ok(importa(venta, 'TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD'), 'el pedido importa el título');
  assert.ok(venta.includes("const notaClienteSolicitud = (pedido?.sc_nota_cliente || '').trim();"), 'el pedido la lee');
  assert.ok(venta.includes('[TITULO_NOTA_CLIENTE_DE_LA_SOLICITUD, notaClienteSolicitud, AYUDA_NOTA_CLIENTE]'),
    'con el aviso, después de la nota interna de la SC');
  assert.ok(venta.includes('(notaSolicitud || notaClienteSolicitud || notaCotizacion || mostrarNotaPedido)'),
    'también cuando es la única nota');
}

console.log('✓ Todas las pruebas de los cambios del cliente pasaron.');
