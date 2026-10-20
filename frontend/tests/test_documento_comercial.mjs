/**
 * frontend/tests/test_documento_comercial.mjs
 * B3 T12 (PLANTILLA, U22+H38, U23, C2, C5, R24, RP25 y la nota del controlador después de T9): lib/documento-comercial.js.
 * El documento llega del servidor con la forma ÚNICA de backend/app/core/documento_cliente.py (CLAVES_DOCUMENTO y
 * demás): aquí no se recalcula nada; solo se completa total_linea si falta y se arman los textos.
 * - textoFormaPago: los MISMOS textos y la misma precedencia que el PDF (pdf_documento._texto_anticipo_cotizacion):
 *   manual -> >= 100% -> > 0% -> 0%; la modalidad va en su propio renglón (formaDePagoDocumento().etiqueta). Con
 *   pago.anticipo None (la SC) los textos de U17 para 100, 60, 0 y modalidad no reconocida.
 * - resumenPagosCliente es un adaptador de resumenPagoPedido (resumen-pago.js) con el mapeo de RP25.
 * - B3 T14: documentoVistaPrevia (la vista previa de «Diseño de documentos» con los textos sin guardar).
 * - B3 T15: totalUnidades (la pastilla de la solicitud) y coloresBotonPrincipal (el botón principal con la marca).
 */

import assert from 'node:assert/strict';
import {
  TIPOS_DOCUMENTO, normalizarDocumento, filasTotales, textoFormaPago, formaDePagoDocumento, colorTextoSobre,
  colorSobreBlanco, enlaceSeguro, contactosEmpresa, mensajeWhatsAppDocumento, resumenPagosCliente, textoEnlaceVigente,
  textoEntregaEstimada, formatoCantidad, tituloDePestana, DOCUMENTO_EJEMPLO_SC, DOCUMENTO_EJEMPLO_COT,
  documentoVistaPrevia, totalUnidades, coloresBotonPrincipal, textoValidezCotizacion,
  TEXTO_ENLACE_PEDIDO_VENCIDO, enlacePedidoVigente,
} from '../src/lib/documento-comercial.js';
import * as documentoComercial from '../src/lib/documento-comercial.js';
import { readFileSync } from 'node:fs';
import { resumenPagoPedido } from '../src/lib/resumen-pago.js';

// Las claves del contrato, copiadas de backend/app/core/documento_cliente.py (C2, R24).
const CLAVES_DOCUMENTO = ['atendido_por', 'cliente', 'con_precios', 'estado', 'fecha_emision', 'fecha_entrega_estimada',
  'lineas', 'mensaje_pie', 'notas', 'numero', 'pago', 'terminos', 'tipo', 'titulo', 'totales', 'valida_hasta'];
const CLAVES_CLIENTE = ['direccion_entrega', 'nombre'];
const CLAVES_LINEA = ['anticipo', 'cantidad', 'descripcion', 'iva_etiqueta', 'iva_pct', 'n', 'precio_unitario', 'total_linea'];
const CLAVES_TOTALES = ['ajuste_redondeo', 'descuento', 'descuento_pct', 'impuestos', 'subtotal', 'total'];
const CLAVES_IMPUESTO = ['base', 'etiqueta', 'valor'];
const CLAVES_PAGO = ['anticipo', 'anticipo_pct', 'anticipo_por_pagar', 'instrucciones', 'manual', 'modalidad', 'pagado',
  'pagos', 'saldo', 'saldo_a_favor'];
const CLAVES_NOTA = ['texto', 'titulo'];
const claves = (o) => Object.keys(o).sort();

/** Una COT como la arma documento_cot: IVA discriminado, sin descuento, 60/40. */
function cot(cambios = {}) {
  return {
    tipo: 'COT', titulo: 'Cotización', numero: 'COT-20261003-1', estado: 'PENDIENTE_CONFIRMACION',
    fecha_emision: '2026-10-03T14:00:00Z', fecha_entrega_estimada: '2026-10-21',
    cliente: { nombre: 'Cliente DEMO', direccion_entrega: 'Calle DEMO 1' }, atendido_por: 'Asesor DEMO',
    con_precios: true,
    lineas: [
      { n: 1, descripcion: 'Pintura vinilo', cantidad: 4, precio_unitario: 117000, total_linea: 468000,
        iva_etiqueta: 'IVA 19%', iva_pct: 19, anticipo: 334152 },
    ],
    totales: { subtotal: 1152924, descuento_pct: 0, descuento: 0,
      impuestos: [{ etiqueta: 'IVA 19%', base: 1152924, valor: 219056 }], ajuste_redondeo: null, total: 1371980 },
    pago: { modalidad: '60/40 (60% anticipo - 40% pendiente)', anticipo_pct: 60, anticipo: 823188, saldo: 548792,
      saldo_a_favor: 0, anticipo_por_pagar: 823188, pagado: null, pagos: null, instrucciones: 'Banco DEMO\nCuenta 123',
      manual: false },
    notas: [], valida_hasta: '2026-10-08', terminos: null, mensaje_pie: null,
    ...cambios,
  };
}

console.log('--- TEST 1: los documentos de ejemplo tienen la forma exacta del backend (C2, R24) ---');
{
  for (const doc of [DOCUMENTO_EJEMPLO_SC, DOCUMENTO_EJEMPLO_COT]) {
    assert.deepEqual(claves(doc), CLAVES_DOCUMENTO);
    assert.deepEqual(claves(doc.cliente), CLAVES_CLIENTE);
    for (const linea of doc.lineas) assert.deepEqual(claves(linea), CLAVES_LINEA);
    assert.deepEqual(claves(doc.pago), CLAVES_PAGO);
    for (const nota of doc.notas) assert.deepEqual(claves(nota), CLAVES_NOTA);
    assert.match(doc.fecha_emision, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/, 'fecha_emision ISO con Z');
    assert.match(doc.fecha_entrega_estimada, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(JSON.stringify(doc).includes('DEMO'), 'datos DEMO');
    assert.ok(!JSON.stringify(doc).includes('Nebulae'));
    assert.ok(Object.isFrozen(doc) && Object.isFrozen(doc.lineas) && Object.isFrozen(doc.lineas[0]));
  }
  const sc = DOCUMENTO_EJEMPLO_SC;
  assert.equal(sc.tipo, 'SC');
  assert.equal(sc.con_precios, false);
  assert.equal(sc.totales, null, 'la SC no trae totales');
  assert.equal(sc.terminos, null, 'la SC no lleva términos');
  assert.equal(sc.pago.anticipo, null, 'la SC: pago sin montos');
  assert.equal(sc.pago.instrucciones, null, 'ni datos para pagar');
  assert.ok(sc.lineas.every((l) => l.precio_unitario === null && l.total_linea === null && l.anticipo === null));
  assert.deepEqual(sc.notas.map((n) => n.titulo), ['Nota para el cliente'], 'R3: solo la Nota para el cliente');

  const c = DOCUMENTO_EJEMPLO_COT;
  assert.equal(c.tipo, 'COT');
  assert.equal(c.con_precios, true);
  assert.deepEqual(claves(c.totales), CLAVES_TOTALES);
  for (const i of c.totales.impuestos) assert.deepEqual(claves(i), CLAVES_IMPUESTO);
  for (const l of c.lineas) assert.equal(l.total_linea, l.precio_unitario * l.cantidad, 'total de la línea sin IVA');
  const subtotal = c.lineas.reduce((s, l) => s + l.total_linea, 0);
  assert.equal(c.totales.subtotal, subtotal, 'subtotal = suma de las líneas');
  const iva = c.totales.impuestos.reduce((s, i) => s + i.valor, 0);
  assert.equal(c.totales.total, subtotal - c.totales.descuento + iva, 'total = subtotal − descuento + IVA');
  assert.equal(c.pago.anticipo + c.pago.saldo, c.totales.total);
  assert.equal(c.lineas.reduce((s, l) => s + l.anticipo, 0), c.pago.anticipo, 'el anticipo por línea suma el anticipo');
}

console.log('--- TEST 2: TIPOS_DOCUMENTO ---');
{
  assert.equal(TIPOS_DOCUMENTO.SC.variante, 'degradado');
  assert.equal(TIPOS_DOCUMENTO.COT.variante, 'acento');
  assert.equal(TIPOS_DOCUMENTO.PVEN.variante, 'acento');
  assert.equal(TIPOS_DOCUMENTO.SC.titulo, 'SOLICITUD');
  assert.equal(TIPOS_DOCUMENTO.COT.titulo, 'COTIZACIÓN');
  assert.equal(TIPOS_DOCUMENTO.PVEN.titulo, 'PEDIDO DE VENTA');
  assert.ok(Object.isFrozen(TIPOS_DOCUMENTO) && Object.isFrozen(TIPOS_DOCUMENTO.SC));
}

console.log('--- TEST 3: normalizarDocumento ---');
{
  const doc = normalizarDocumento(cot({
    lineas: [
      { n: 1, descripcion: 'A', cantidad: 4, precio_unitario: 117000.4, total_linea: null },
      { descripcion: '  ', cantidad: 2, precio_unitario: 1000 },
      { n: 3, cantidad: 1, precio_unitario: null, total_linea: null },
      'no es una línea',
    ],
    notas: [{ titulo: 'Notas', texto: '  ' }, { titulo: 'Notas', texto: 'Entrega en obra' }],
  }));
  assert.deepEqual(claves(doc), CLAVES_DOCUMENTO);
  assert.equal(doc.lineas.length, 3, 'lo que no es una línea se descarta');
  assert.equal(doc.lineas[0].total_linea, 468002, 'completa total_linea con redondearPeso(precio × cantidad)');
  assert.equal(doc.lineas[1].descripcion, 'Producto', 'una línea sin descripción queda como Producto');
  assert.equal(doc.lineas[1].n, 2, 'sin n: su posición');
  assert.equal(doc.lineas[1].total_linea, 2000);
  assert.equal(doc.lineas[2].total_linea, null, 'sin precio no se inventa un total');
  for (const l of doc.lineas) assert.deepEqual(claves(l), CLAVES_LINEA);
  assert.deepEqual(doc.notas, [{ titulo: 'Notas', texto: 'Entrega en obra' }], 'sin notas vacías');
  assert.equal(doc.totales.total, 1371980, 'nunca recalcula los totales');

  const sinPrecios = normalizarDocumento({ ...cot(), con_precios: false });
  assert.equal(sinPrecios.totales, null, 'sin precios: sin totales');
  assert.ok(sinPrecios.lineas.every((l) => l.precio_unitario === null && l.total_linea === null && l.anticipo === null
    && l.iva_pct === null));

  const vacio = normalizarDocumento(null);
  assert.deepEqual(claves(vacio), CLAVES_DOCUMENTO);
  assert.deepEqual(vacio.lineas, []);
  assert.deepEqual(vacio.notas, []);
  assert.deepEqual(vacio.cliente, { nombre: null, direccion_entrega: null });
  assert.equal(vacio.con_precios, false);
  assert.equal(vacio.pago, null);
}

console.log('--- TEST 4: filasTotales ---');
{
  const filas = filasTotales(cot());
  assert.deepEqual(filas.map((f) => [f.etiqueta, f.valor, f.estilo]), [
    ['Subtotal', 1152924, null],
    ['IVA 19% sobre $1.152.924', 219056, null],
    ['TOTAL', 1371980, 'total'],
    ['Anticipo (60%)', 823188, null],
    ['Saldo', 548792, null],
  ], 'descuento 0 oculto; una fila por impuesto; con pago: anticipo y saldo');
  assert.equal(new Set(filas.map((f) => f.clave)).size, filas.length, 'claves únicas para React');

  const conDescuento = filasTotales(cot({ totales: { subtotal: 1000000, descuento_pct: 10, descuento: 100000,
    impuestos: [{ etiqueta: 'IVA 19%', base: 600000, valor: 114000 }, { etiqueta: 'Exento', base: 300000, valor: 0 }],
    ajuste_redondeo: null, total: 1014000 } }));
  assert.deepEqual(conDescuento.slice(0, 5).map((f) => [f.etiqueta, f.valor]), [
    ['Subtotal', 1000000], ['Descuento (10%)', -100000], ['IVA 19% sobre $600.000', 114000],
    ['Exento sobre $300.000', 0], ['TOTAL', 1014000],
  ]);

  const viejo = filasTotales(cot({ totales: { subtotal: 1000001, descuento_pct: 0, descuento: 0,
    impuestos: [{ etiqueta: 'IVA', base: 840336, valor: 159664 }], ajuste_redondeo: -1, total: 1000000 } }));
  assert.deepEqual(viejo.slice(0, 4).map((f) => f.etiqueta),
    ['Subtotal', 'IVA sobre $840.336', 'Ajuste por redondeo', 'TOTAL'], 'con ajuste aparece Ajuste por redondeo');
  assert.equal(viejo[2].valor, -1);
  const sinAjuste = filasTotales(cot({ totales: { ...cot().totales, impuestos: [], ajuste_redondeo: 0 } }));
  assert.ok(!sinAjuste.some((f) => f.etiqueta === 'Ajuste por redondeo'), 'ajuste 0 oculto');

  const conSaldoAFavor = filasTotales(cot({ pago: { ...cot().pago, saldo_a_favor: 300000, anticipo_por_pagar: 523188 } }));
  assert.deepEqual(conSaldoAFavor.slice(3).map((f) => [f.etiqueta, f.valor, f.estilo]), [
    ['Anticipo (60%)', 823188, null], ['Saldo a favor', 300000, null], ['Anticipo por pagar', 523188, 'fuerte'],
    ['Saldo', 548792, null],
  ]);

  const pven = filasTotales(cot({ tipo: 'PVEN', pago: { ...cot().pago, pagado: 300000, saldo: 1071980,
    anticipo_por_pagar: 523188, pagos: [] } }));
  assert.deepEqual(pven.slice(3).map((f) => [f.etiqueta, f.valor, f.estilo]), [
    ['Anticipo (60%)', 823188, null], ['Pagado', 300000, null], ['Anticipo pendiente', 523188, 'ambar'],
    ['Saldo por pagar', 1071980, 'fuerte'],
  ], 'anticipo / pagado / saldo del pedido');
  const pvenSinPagos = filasTotales(cot({ tipo: 'PVEN', pago: { ...cot().pago, pagado: 0, anticipo_por_pagar: 0 } }));
  assert.ok(!pvenSinPagos.some((f) => f.etiqueta === 'Pagado'), 'Pagado solo si es mayor que 0');
  assert.ok(!pvenSinPagos.some((f) => f.etiqueta === 'Anticipo pendiente'));

  assert.deepEqual(filasTotales({ ...cot(), con_precios: false }), [], 'sin precios la lista queda vacía');
  assert.deepEqual(filasTotales(DOCUMENTO_EJEMPLO_SC), []);
  assert.deepEqual(filasTotales(null), []);
}

console.log('--- TEST 5: textoFormaPago (U22 con la precedencia del PDF) y la SC (U17, R24) ---');
{
  const p = (cambios) => ({ ...cot().pago, ...cambios });
  assert.equal(textoFormaPago(p({ anticipo_pct: 60, anticipo: 1104369, saldo: 736246 })),
    'Anticipo del 60% ($1.104.369) para confirmar el pedido. Saldo: $736.246.', '60/40');
  assert.equal(textoFormaPago(p({ modalidad: 'Contado', anticipo_pct: 100, anticipo: 1840615, saldo: 0 })),
    'Pagas el 100% ($1.840.615) antes de que procesemos el pedido.', 'Contado');
  const credito = p({ modalidad: 'Credito 30 dias', anticipo_pct: 0, anticipo: 0, saldo: 1840615 });
  assert.equal(textoFormaPago(credito, { total: 1840615 }), 'Sin anticipo. Total a pagar: $1.840.615.', 'crédito');
  assert.equal(textoFormaPago(credito), 'Sin anticipo. Total a pagar: $1.840.615.', 'sin totales: anticipo + saldo');
  const formaCredito = formaDePagoDocumento(cot({ pago: credito, totales: { ...cot().totales, total: 1840615 } }));
  assert.equal(formaCredito.etiqueta, 'Crédito 30 días', "'Credito 30 dias' se lee 'Crédito 30 días'");
  assert.equal(formaCredito.texto, 'Sin anticipo. Total a pagar: $1.840.615.');
  assert.equal(textoFormaPago(p({ anticipo_pct: 50, anticipo: 920308, saldo: 920307, manual: true })),
    'Anticipo acordado: 50% ($920.308). Saldo: $920.307.', 'manual');
  assert.equal(textoFormaPago(p({ anticipo_pct: 100, anticipo: 1000, saldo: 0, manual: true })),
    'Anticipo acordado: 100% ($1.000). Saldo: $0.', 'manual gana a 100%');
  assert.equal(textoFormaPago(p({ anticipo_pct: 60, anticipo: 1104369, saldo: 736246, saldo_a_favor: 300000,
    anticipo_por_pagar: 804369 })),
  'Anticipo del 60% ($1.104.369) para confirmar el pedido. Saldo: $736.246. Ya tienes $300.000 a favor de un pedido '
    + 'anterior: te falta pagar $804.369 de anticipo.', 'saldo a favor');
  assert.equal(textoFormaPago(p({ anticipo_pct: 12.5, anticipo: 125000, saldo: 875000 })),
    'Anticipo del 12,5% ($125.000) para confirmar el pedido. Saldo: $875.000.');
  assert.equal(textoFormaPago(p({ anticipo_pct: null, anticipo: 1000 })), '', 'sin % no hay texto (como el PDF)');
  assert.equal(textoFormaPago(null), '');

  // La SC: pago.anticipo None -> los textos de U17 (100, 60, 0 y no reconocida).
  const sc = (modalidad, pct) => ({ ...DOCUMENTO_EJEMPLO_SC.pago, modalidad, anticipo_pct: pct });
  assert.equal(textoFormaPago(sc('Contado', 100)),
    'Pagas el 100% del valor de la cotización antes de que hagamos tu pedido.');
  assert.equal(textoFormaPago(sc('60/40 (60% anticipo - 40% pendiente)', 60)),
    'Pagas un anticipo del 60% del valor de la cotización antes de que hagamos tu pedido; el 40% restante, después.');
  assert.equal(textoFormaPago(sc('Credito 30 dias', 0)), 'Sin anticipo: pagas según el crédito acordado con tu asesor.');
  const noReconocida = 'Anticipo del 60% del valor de la cotización antes del pedido; tu asesor te confirma la forma de pago.';
  assert.equal(textoFormaPago(sc('Otro', 60)), noReconocida, 'modalidad no reconocida');
  assert.equal(textoFormaPago(sc(null, 60)), noReconocida, 'sin modalidad');
  assert.equal(textoFormaPago(sc('Cruce de cuentas', 60)), noReconocida);

  const formaSc = formaDePagoDocumento(DOCUMENTO_EJEMPLO_SC);
  assert.equal(formaSc.etiqueta, '60/40 (60% de anticipo y 40% al entregar)');
  assert.ok(formaSc.texto.startsWith('Pagas un anticipo del 60%'));
  assert.equal(formaSc.instrucciones, null);
  const formaCot = formaDePagoDocumento(cot());
  assert.equal(formaCot.texto, 'Anticipo del 60% ($823.188) para confirmar el pedido. Saldo: $548.792.');
  assert.equal(formaCot.instrucciones, 'Banco DEMO\nCuenta 123');
  const formaPven = formaDePagoDocumento(cot({ tipo: 'PVEN' }));
  assert.equal(formaPven.texto, '', 'el pedido muestra sus pagos, no el texto del anticipo (como el PDF)');
  assert.equal(formaPven.etiqueta, '60/40 (60% de anticipo y 40% al entregar)');
  assert.equal(formaDePagoDocumento(cot({ pago: null })), null);
}

console.log('--- TEST 6: colorTextoSobre y colorSobreBlanco ---');
{
  assert.equal(colorTextoSobre('#C2410C'), '#FFFFFF');
  assert.equal(colorTextoSobre('#FDE68A'), '#111827');
  assert.equal(colorTextoSobre('#7C3AED', '#E11D48'), '#FFFFFF');
  assert.equal(colorTextoSobre('#ffffff', '#000000'), '#111827', 'el de mayor contraste mínimo frente a todos');
  assert.equal(colorTextoSobre('#7C3AED', 'red', null), '#FFFFFF', 'los inválidos no cuentan');
  // r1 (menor 9): como correo_documento.color_texto_sobre: sin ningún color válido, blanco; en empate, blanco.
  assert.equal(colorTextoSobre(), '#FFFFFF', 'sin colores: blanco, como el backend');
  assert.equal(colorTextoSobre('x'), '#FFFFFF');
  assert.equal(colorTextoSobre(null, 'red'), '#FFFFFF');
  assert.equal(colorSobreBlanco('#C2410C'), '#C2410C', 'el acento se lee sobre blanco');
  assert.equal(colorSobreBlanco('#FDE68A'), '#111827', 'un acento claro pasa a oscuro');
  assert.equal(colorSobreBlanco('x'), '#111827');
}

console.log('--- TEST 7: enlaceSeguro ---');
{
  assert.equal(enlaceSeguro('javascript:alert(1)'), null);
  assert.equal(enlaceSeguro('data:text/html,x'), null);
  assert.equal(enlaceSeguro('ftp://example.com'), null);
  assert.equal(enlaceSeguro('example.com'), null, 'solo http(s) completo');
  assert.equal(enlaceSeguro('https://exa mple.com'), null);
  assert.equal(enlaceSeguro('https://'), null);
  assert.equal(enlaceSeguro(null), null);
  assert.equal(enlaceSeguro(' https://example.com/tienda '), 'https://example.com/tienda');
  assert.equal(enlaceSeguro('HTTP://example.com'), 'HTTP://example.com');
  // r1 (menor 14): sin credenciales en la URL (phishing 'mitienda.com@evil.com') ni otros esquemas.
  for (const malo of ['https://a.com@evil.com', 'https://u:p@evil.com', 'https://u:@evil.com', '//evil.com',
    'vbscript:x', 'JaVaScRiPt:alert(1)', '\tjavascript:alert(1)', 'https://evil.com\n.x']) {
    assert.equal(enlaceSeguro(malo), null, JSON.stringify(malo));
  }
  assert.deepEqual(contactosEmpresa({ sitio_web: 'https://mitienda.com@evil.com' }), [], 'el pie no pinta ese enlace');
}

console.log('--- TEST 8: contactosEmpresa y el mensaje de WhatsApp ---');
{
  const marca = { nombre_comercial: 'DEMO', telefono: '(601) 234-5678', whatsapp: '3001234567',
    correo: 'ventas@example.com', sitio_web: 'https://example.com/' };
  const contactos = contactosEmpresa(marca);
  assert.deepEqual(contactos.map((c) => c.tipo), ['telefono', 'whatsapp', 'correo', 'web']);
  const wa = contactos.find((c) => c.tipo === 'whatsapp');
  assert.equal(wa.href, 'https://wa.me/573001234567');
  assert.equal(wa.externo, true);
  assert.equal(contactos.find((c) => c.tipo === 'telefono').href, 'tel:6012345678');
  assert.equal(contactos.find((c) => c.tipo === 'correo').href, 'mailto:ventas@example.com');
  const web = contactos.find((c) => c.tipo === 'web');
  assert.equal(web.href, 'https://example.com/');
  assert.equal(web.texto, 'example.com');
  assert.equal(contactosEmpresa({ telefono: '+57 601 234 5678' })[0].href, 'tel:+576012345678');

  const conTexto = contactosEmpresa(marca, mensajeWhatsAppDocumento('SC', 'SC-20261003-1'));
  assert.equal(conTexto.find((c) => c.tipo === 'whatsapp').href,
    `https://wa.me/573001234567?text=${encodeURIComponent('Hola, te escribo por la solicitud SC-20261003-1.')}`);
  assert.equal(mensajeWhatsAppDocumento('COT', 'COT-1'), 'Hola, te escribo por la cotización COT-1.');
  assert.equal(mensajeWhatsAppDocumento('PVEN', 'PVEN-1'), 'Hola, te escribo por el pedido PVEN-1.');
  assert.equal(mensajeWhatsAppDocumento('SC', ''), '');

  assert.deepEqual(contactosEmpresa({}), [], 'sin datos: sin botones');
  assert.deepEqual(contactosEmpresa(null), []);
  assert.deepEqual(contactosEmpresa({ sitio_web: 'javascript:alert(1)', correo: 'no es correo', telefono: 'N/A' }), [],
    'nunca un href inseguro');
}

console.log('--- TEST 9: resumenPagosCliente (adaptador de resumenPagoPedido, RP25) ---');
{
  const totales = { total: 1000000 };
  const parcial = { modalidad: '60/40 (60% anticipo - 40% pendiente)', anticipo_pct: 60, anticipo: 600000,
    saldo: 700000, saldo_a_favor: null, anticipo_por_pagar: 300000, pagado: 300000, instrucciones: null, manual: false,
    pagos: [{ concepto: 'Anticipo', monto: 300000, metodo: 'Transferencia bancaria', fecha: '2026-10-03T15:00:00Z' }] };
  const r = resumenPagosCliente(parcial, totales);
  const base = resumenPagoPedido({ total_cop: 1000000, saldo_cop: 700000, anticipo_requerido: 600000,
    anticipo_pendiente: 300000, anticipo_pct: 60 });
  for (const clave of Object.keys(base)) assert.deepEqual(r[clave], base[clave], `mismo ${clave} que resumenPagoPedido`);
  assert.equal(r.pagado, 300000);
  assert.equal(r.saldo, 700000);
  assert.equal(r.anticipoPendiente, 300000, 'sale de pago.anticipo_por_pagar');
  assert.equal(r.avisoAnticipo, 'Anticipo pendiente: $300.000', 'pago parcial: el aviso ámbar');
  assert.deepEqual(r.pagos, [{ concepto: 'Anticipo', metodo: 'Transferencia bancaria', fecha: '3 de octubre de 2026',
    monto: 300000, detalle: 'Transferencia bancaria · 3 de octubre de 2026' }]);
  // El anticipo pendiente es el del servidor (resumen_anticipo_del_pedido), aunque no sea requerido − pagado.
  const delServidor = resumenPagosCliente({ ...parcial, anticipo_por_pagar: 0 }, totales);
  assert.equal(delServidor.anticipoPendiente, 0, 'pago.anticipo_por_pagar gana a la resta');
  assert.equal(delServidor.avisoAnticipo, null);
  assert.equal(resumenPagosCliente({ ...parcial, anticipo_por_pagar: null }, totales).anticipoPendiente, 300000,
    'sin anticipo_por_pagar: requerido − pagado (resumenPagoPedido)');

  const traslado = resumenPagosCliente({ ...parcial, saldo: 400000, anticipo_por_pagar: 0, pagado: 600000,
    pagos: [{ concepto: 'Saldo a favor de tu pedido anterior', monto: 600000, metodo: null, fecha: '2026-10-02' },
      { concepto: 'Devolución', monto: -50000, metodo: 'Efectivo', fecha: '2026-10-04T15:00:00Z' }] }, totales);
  assert.equal(traslado.pagos[0].concepto, 'Saldo a favor de tu pedido anterior', 'el traslado con su concepto');
  assert.equal(traslado.pagos[0].detalle, '2 de octubre de 2026', 'sin método');
  assert.equal(traslado.pagos[1].monto, -50000);
  assert.equal(traslado.avisoAnticipo, null, 'anticipo completo: sin aviso');
  assert.equal(traslado.caso, 'pendiente');

  const vacio = resumenPagosCliente(null, null);
  assert.deepEqual(vacio.pagos, []);
  assert.equal(vacio.caso, 'desconocido');
}

console.log('--- TEST 10: textoEnlaceVigente (enlace_cliente del pedido, T7) ---');
{
  const ahora = new Date('2026-10-10T12:00:00Z');
  const vigente = { vigente: true, enviado_at: '2026-10-03T15:00:00Z', vence_at: '2026-11-03T05:00:00Z', vence: '2026-11-02' };
  const esperado = 'Enviado al cliente el 3 de octubre de 2026 · el enlace sirve hasta el 2 de noviembre de 2026';
  // r1 (menor 11): textoEnlaceVigente(enlace, estadoDelPedido?, ahora?).
  assert.equal(textoEnlaceVigente(vigente, 'CONFIRMADO', ahora), esperado);
  assert.equal(textoEnlaceVigente(vigente, null, ahora), esperado, 'sin estado: como siempre');
  assert.equal(textoEnlaceVigente({ ...vigente, vence: null }, null, ahora), esperado, 'sin vence: el último día de vence_at');
  assert.equal(textoEnlaceVigente({ ...vigente, enviado_at: null }, null, ahora),
    'El enlace sirve hasta el 2 de noviembre de 2026');
  const vencido = { vigente: false, enviado_at: '2026-09-01T15:00:00Z', vence_at: null, vence: null };
  assert.equal(textoEnlaceVigente(vencido, 'EN_PRODUCCION', ahora), 'El enlace del cliente venció: reenvíaselo');
  assert.equal(textoEnlaceVigente(vigente, null, new Date('2026-11-03T05:00:00Z')),
    'El enlace del cliente venció: reenvíaselo', 'una página abierta desde antes ya ve el vencimiento');
  assert.equal(textoEnlaceVigente({ vigente: false, enviado_at: null, vence_at: null, vence: null }, null, ahora), null);
  assert.equal(textoEnlaceVigente(null, null, ahora), null);
  // Un pedido CANCELADO no se puede reenviar (el botón se oculta y /pedido-cliente/ver lo rechaza): no se aconseja.
  assert.equal(textoEnlaceVigente(vencido, 'CANCELADO', ahora), null);
  assert.equal(textoEnlaceVigente(vigente, 'CANCELADO', ahora), null);
}

console.log('--- B3 T19 TEST 10c: enlacePedidoVigente y el texto del vencido (U23 punto 7) ---');
{
  const ahora = new Date('2026-10-10T12:00:00Z');
  const vigente = { vigente: true, enviado_at: '2026-10-03T15:00:00Z', vence_at: '2026-11-03T05:00:00Z', vence: '2026-11-02' };
  const vencido = { vigente: false, enviado_at: '2026-09-01T15:00:00Z', vence_at: null, vence: null };
  const nunca = { vigente: false, enviado_at: null, vence_at: null, vence: null };
  // El texto del enlace vencido es una constante (la pantalla lo pinta en ámbar).
  assert.equal(TEXTO_ENLACE_PEDIDO_VENCIDO, 'El enlace del cliente venció: reenvíaselo');
  assert.equal(textoEnlaceVigente(vencido, null, ahora), TEXTO_ENLACE_PEDIDO_VENCIDO);
  // enlacePedidoVigente: la misma regla que textoEnlaceVigente (vigente del servidor y vence_at todavía no llegó).
  assert.equal(enlacePedidoVigente(vigente, ahora), true);
  assert.equal(enlacePedidoVigente(vigente, new Date('2026-11-03T04:59:59Z')), true, 'el último segundo del 2 de noviembre');
  assert.equal(enlacePedidoVigente(vigente, new Date('2026-11-03T05:00:00Z')), false, 'vence_at es exclusivo');
  assert.equal(enlacePedidoVigente({ ...vigente, vence_at: null }, ahora), true, 'sin vence_at, el del servidor');
  for (const e of [vencido, nunca, { ...vigente, vigente: 'true' }, null, undefined, 'x']) {
    assert.equal(enlacePedidoVigente(e, ahora), false, JSON.stringify(e));
  }
  // r1 (menor 13): el botón del asesor (rol y texto) vive en envio-whatsapp.js (test_envio_whatsapp.mjs). Esta librería
  // la importan las páginas públicas: no exporta botonEnvioPedido ni importa la regla de roles.
  assert.equal(documentoComercial.botonEnvioPedido, undefined);
  const fuente = readFileSync(new URL('../src/lib/documento-comercial.js', import.meta.url), 'utf8');
  assert.ok(!/from '\.\/seguimiento\.js'/.test(fuente), 'sin importar seguimiento.js');
}

console.log('--- B3 T17 TEST 10b: textoValidezCotizacion (U22-validez punto 9: la COT pendiente en el detalle) ---');
{
  const dia = (iso) => new Date(iso);
  // valida_hasta es el último día en que sirve el enlace (hasta las 23:59 de Colombia).
  assert.deepEqual(textoValidezCotizacion('2026-10-08', dia('2026-10-05T15:00:00Z')),
    { vencida: false, texto: 'El cliente puede confirmar hasta el 8 de octubre de 2026.' });
  assert.deepEqual(textoValidezCotizacion('2026-10-08', dia('2026-10-09T04:30:00Z')),
    { vencida: false, texto: 'El cliente puede confirmar hasta el 8 de octubre de 2026.' },
    '11:30 p. m. del 8 en Colombia (ya el 9 en UTC): todavía sirve');
  assert.deepEqual(textoValidezCotizacion('2026-10-08', dia('2026-10-09T05:00:00Z')),
    { vencida: true, texto: 'El enlace venció el 8 de octubre de 2026.' });
  assert.deepEqual(textoValidezCotizacion(' 2026-10-08 ', dia('2026-11-01T12:00:00Z')),
    { vencida: true, texto: 'El enlace venció el 8 de octubre de 2026.' });
  // Una COT enviada antes del Bloque 3 (sin valida_hasta) o un dato que no es una fecha: null (no se dice nada).
  for (const sin of [null, undefined, '', 'mañana', '2026-02-30', 20261008]) {
    assert.equal(textoValidezCotizacion(sin, dia('2026-10-05T15:00:00Z')), null, String(sin));
  }
}

console.log('--- TEST 11: entrega estimada, cantidad y título de la pestaña ---');
{
  assert.equal(textoEntregaEstimada(DOCUMENTO_EJEMPLO_SC),
    '21 de octubre de 2026 (aproximada; la fecha final llega en la cotización)');
  assert.equal(textoEntregaEstimada(cot()), '21 de octubre de 2026');
  assert.equal(textoEntregaEstimada(cot({ fecha_entrega_estimada: null })), '');
  assert.equal(formatoCantidad(2), '2');
  assert.equal(formatoCantidad(2.5), '2,5');
  assert.equal(formatoCantidad(null), '');
  assert.equal(tituloDePestana(cot(), { nombre_comercial: 'DEMO Ferretería' }), 'Cotización COT-20261003-1 · DEMO Ferretería');
  assert.equal(tituloDePestana(cot(), {}), 'Cotización COT-20261003-1', 'sin marca: sin nombre, nunca Nebulae');
}

console.log('--- TEST 12: documentoVistaPrevia (los textos sin guardar, donde los pone empresa.textos_documento) ---');
{
  const textos = { terminos_cotizacion: '  Válida por 5 días.\nPrecios en pesos.  ', terminos_pedido: 'Términos PVEN',
    instrucciones_pago: 'Banco DEMO\nCuenta 000', mensaje_pie: ' Gracias por tu compra. ', color_principal: '#112233' };

  const c = documentoVistaPrevia('COT', textos);
  assert.equal(c.terminos, 'Válida por 5 días.\nPrecios en pesos.', 'COT: los términos de la cotización, con saltos');
  assert.equal(c.pago.instrucciones, 'Banco DEMO\nCuenta 000', 'COT: los datos para pagar en pago.instrucciones');
  assert.equal(c.mensaje_pie, 'Gracias por tu compra.');
  assert.deepEqual(claves(c), CLAVES_DOCUMENTO, 'la forma exacta del backend');
  assert.deepEqual(claves(c.pago), CLAVES_PAGO);
  assert.deepEqual({ ...c, terminos: null, mensaje_pie: null, pago: { ...c.pago, instrucciones: null } },
    { ...DOCUMENTO_EJEMPLO_COT, terminos: null, mensaje_pie: null,
      pago: { ...DOCUMENTO_EJEMPLO_COT.pago, instrucciones: null } }, 'lo demás es el ejemplo DEMO tal cual');

  const s = documentoVistaPrevia('SC', textos);
  assert.equal(s.terminos, null, 'la SC no lleva términos (textos_documento SC)');
  assert.equal(s.pago.instrucciones, null, 'ni datos para pagar (R8)');
  assert.equal(s.mensaje_pie, 'Gracias por tu compra.', 'sí el mensaje de pie');
  assert.deepEqual({ ...s, mensaje_pie: null }, { ...DOCUMENTO_EJEMPLO_SC, mensaje_pie: null });

  // Un texto vacío no aparece en el documento (textos_documento: '' -> None), aunque el ejemplo DEMO traiga uno.
  const vacia = documentoVistaPrevia('COT', { terminos_cotizacion: '   ', instrucciones_pago: '', mensaje_pie: null });
  assert.equal(vacia.terminos, null);
  assert.equal(vacia.pago.instrucciones, null);
  assert.equal(vacia.mensaje_pie, null);
  assert.equal(documentoVistaPrevia('COT', null).terminos, null);
  assert.equal(documentoVistaPrevia('COT', { terminos_cotizacion: 5 }).terminos, null, 'lo que no es texto no entra');
  assert.equal(documentoVistaPrevia('PVEN', textos).tipo, 'SC', 'otro tipo: la solicitud');
  assert.equal(normalizarDocumento(c).terminos, c.terminos, 'DocumentoComercial lo pinta tal cual');

  // No toca los ejemplos congelados.
  assert.equal(DOCUMENTO_EJEMPLO_COT.terminos, 'Términos y condiciones DEMO de la cotización.');
  assert.ok(DOCUMENTO_EJEMPLO_COT.pago.instrucciones.startsWith('Banco DEMO'));
  assert.equal(DOCUMENTO_EJEMPLO_SC.mensaje_pie, 'Mensaje de pie DEMO.');
}

console.log('--- TEST 13 (B3 T15): totalUnidades (la pastilla de la SC) y coloresBotonPrincipal ---');
{
  // U17: total_unidades no es clave del contrato (R24): la página suma documento.lineas[].cantidad.
  assert.equal(totalUnidades(DOCUMENTO_EJEMPLO_SC), 6);
  assert.equal(totalUnidades({ lineas: [{ cantidad: 2.5 }, { cantidad: '3' }, { cantidad: null }, 'x', { cantidad: 1 }] }),
    3.5, 'solo los números de JSON (como normalizarDocumento)');
  assert.equal(totalUnidades({ lineas: [{ cantidad: 0.1 }, { cantidad: 0.2 }] }), 0.3, 'sin el error de coma flotante');
  assert.equal(totalUnidades({ lineas: [] }), null, 'sin líneas no hay pastilla');
  assert.equal(totalUnidades({ lineas: [{ cantidad: null }] }), null);
  assert.equal(totalUnidades(null), null);

  // El botón principal de la página del cliente con los colores de la marca: el degradado en la SC y el acento en la
  // COT y el PVEN, con el texto que se lee encima (colorTextoSobre).
  const marca = { colores: { principal: '#7C3AED', secundario: '#E11D48', acento: '#FDE68A' } };
  assert.deepEqual(coloresBotonPrincipal(marca, 'degradado'),
    { fondo: 'linear-gradient(90deg, #7C3AED, #E11D48)', texto: '#FFFFFF' });
  assert.deepEqual(coloresBotonPrincipal(marca, 'acento'), { fondo: '#FDE68A', texto: '#111827' });
  // Sin marca: los colores de la referencia (nunca un color interno).
  assert.deepEqual(coloresBotonPrincipal(null, 'acento'), { fondo: '#C2410C', texto: '#FFFFFF' });
  assert.deepEqual(coloresBotonPrincipal(undefined, 'otra'), { fondo: '#C2410C', texto: '#FFFFFF' }, 'por defecto, acento');
}

console.log('✓ Todas las pruebas del documento comercial pasaron.');
