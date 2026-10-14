/**
 * frontend/tests/test_dinero_ventas.mjs
 * Dinero de la cotizacion y del pedido en pantalla (frontend/src/lib/dinero-ventas.js):
 *  - H36+H43 / R3: anticipo por modalidad o manual (etiqueta, resumen, validacion del ajuste con nota).
 *  - N1 / R4 / R6: cuentas del modal de verificacion (pago parcial con casilla, saldo a favor que se descuenta).
 *  - Parked de T3: en una COT ya convertida se muestran los valores del pedido, no el anticipo recalculado.
 *  - Pagos del pedido con etiquetas (TRASLADO / TRASLADADO / SALDO_A_FAVOR nunca en crudo).
 *  - H44+N6 / H45: PXP vigente o cancelada del pedido y cuando se puede crear otra.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  METODOS_PAGO_ANTICIPO, formatoPct, porcentajeDePesos, hoyLocal,
  etiquetaAnticipoCotizacion, origenAnticipo, resumenAnticipoCotizacion,
  cuentaVerificacion, evaluarVerificacion, verificacionParaEnviar, validarAjusteAnticipo, montoDesdeTexto,
  etiquetaTipoPago, etiquetaMetodoPago, etiquetaEstadoPago, describirPago,
  etiquetaEstadoPxp, pxpsDelPedido, pedidoAdmitePxp, textoChipPxp, propagacionRecotizacion, creditoPorRecotizacion,
  saldoAFavorAlCancelar, puedeGestionarCotizacion, notaAnticipoPorLinea,
} from '../src/lib/dinero-ventas.js';

console.log('--- N1 TEST 1: los 8 medios de pago son los mismos que acepta el servidor ---');
{
  const py = readFileSync(new URL('../../backend/app/core/ventas_dinero.py', import.meta.url), 'utf8');
  const bloque = py.match(/METODOS_PAGO_ANTICIPO = \(([\s\S]*?)\)/)[1];
  const delServidor = [...bloque.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  assert.deepEqual([...METODOS_PAGO_ANTICIPO], delServidor);
  assert.equal(METODOS_PAGO_ANTICIPO.length, 8);
  assert.ok(!METODOS_PAGO_ANTICIPO.includes('TRASLADO'), 'el traslado solo lo pone el servidor');
}

console.log('--- H42 TEST 2: formatoPct y porcentajeDePesos (exacto al peso, half-up) ---');
{
  assert.equal(formatoPct(60), '60%');
  assert.equal(formatoPct('100.00'), '100%');
  assert.equal(formatoPct(12.5), '12,5%');
  assert.equal(formatoPct('66.666'), '66,67%');
  assert.equal(formatoPct(33.333), '33,33%', 'U19+U21 (B2-T6B): redondea hacia abajo a 2 decimales');
  assert.equal(formatoPct(null), '0%');
  assert.equal(porcentajeDePesos(2786923, 60), 1672154, 'el recorrido: 1.672.153,8 sube a 1.672.154');
  assert.equal(porcentajeDePesos(2874000, 60), 1724400);
  assert.equal(porcentajeDePesos(1000001, 50), 500001, 'empate .5 hacia arriba');
  assert.equal(porcentajeDePesos('2786923.08', 100), 2786923, 'sobre el total ya redondeado');
  assert.equal(porcentajeDePesos(1000, 66.66), 667);
  assert.equal(porcentajeDePesos(1000, 0), 0);
  assert.equal(porcentajeDePesos(null, 60), 0);
  assert.equal(hoyLocal(new Date(2026, 9, 4, 23, 30)), '2026-10-04');
  assert.equal(hoyLocal(new Date(2026, 0, 9, 0, 5)), '2026-01-09');
}

const cotSc = { sc_id: 7, sc_numero: 'SC-1', anticipo_pct: 60, sc_modalidad_pago: '60/40 (60% anticipo - 40% pendiente)',
  total_cop: 2786923, anticipo_requerido: 1672154, anticipo_cop: 1724400, anticipo_pct_manual: null };

console.log('--- H36+H43 / R3 TEST 3: de donde sale el anticipo ---');
{
  // R23 (B2-T9A, ruling 4): la modalidad se muestra con etiquetaModalidad (el texto de H10 que dejo B2-T6A); el valor
  // guardado de la SC no cambia. T11 (V9): la etiqueta va entre paréntesis en los totales ('Anticipo requerido (…)'),
  // así que usa el nombre corto de la modalidad (etiquetaModalidadCorta): sin paréntesis dentro de paréntesis. La frase
  // de origenAnticipo sigue con la explicación completa.
  assert.equal(etiquetaAnticipoCotizacion(cotSc), '60% · 60/40');
  assert.equal(origenAnticipo(cotSc), 'Modalidad 60/40 (60% de anticipo y 40% al entregar)');
  const manual = { ...cotSc, anticipo_pct: 50, anticipo_pct_manual: 50, anticipo_manual_nota: 'Negociado' };
  assert.equal(etiquetaAnticipoCotizacion(manual), '50% · manual');
  assert.equal(origenAnticipo(manual), 'Anticipo manual de 50%');
  const sinSc = { sc_id: null, anticipo_pct: 60 };
  assert.equal(etiquetaAnticipoCotizacion(sinSc), '60% · sin solicitud');
  assert.equal(origenAnticipo(sinSc), 'Cotización sin solicitud');
  const scSinModalidad = { sc_id: 3, anticipo_pct: 60, sc_modalidad_pago: '  ' };
  assert.equal(etiquetaAnticipoCotizacion(scSinModalidad), '60% · solicitud sin modalidad');
  assert.equal(origenAnticipo(scSinModalidad), 'Solicitud sin modalidad de pago');
}

console.log('--- H36+H43 TEST 4: resumen del anticipo de una COT sin pedido (usa anticipo_requerido, no el guardado) ---');
{
  const r = resumenAnticipoCotizacion(cotSc);
  assert.equal(r.convertida, false);
  assert.equal(r.pedido, null);
  assert.equal(r.requerido, 1672154, 'el requerido del GET, no el anticipo_cop viejo');
  assert.equal(r.saldo, 2786923 - 1672154);
  assert.equal(r.etiqueta, '60% · 60/40');
  assert.equal(r.manual, null);
  const manual = resumenAnticipoCotizacion({ ...cotSc, anticipo_pct: 50, anticipo_pct_manual: 50,
    anticipo_manual_nota: '  Negociado con el cliente ', anticipo_requerido: 1393462 });
  assert.deepEqual(manual.manual, { pct: 50, nota: 'Negociado con el cliente' });
  assert.equal(manual.requerido, 1393462);
  // GET viejo sin anticipo_requerido: cae al anticipo guardado.
  assert.equal(resumenAnticipoCotizacion({ total_cop: 1000, anticipo_cop: 600, anticipo_pct: 60 }).requerido, 600);
}

console.log('--- T3 parked TEST 5: COT ya convertida muestra los valores del pedido, no el recalculo de hoy ---');
{
  // La modalidad de la SC cambio a Contado despues de convertir: el GET recalcula 100%, el pedido sigue en 60%.
  const convertida = { ...cotSc, anticipo_pct: 100, anticipo_requerido: 2786923, sc_modalidad_pago: 'Contado',
    pedidos_venta: [
      { id: 1, numero: 'PVEN-1', estado: 'CANCELADO', total_cop: 2786923, saldo_cop: 2786923, anticipo_pct: 60 },
      { id: 2, numero: 'PVEN-2', estado: 'PENDIENTE_COMPRA', total_cop: 2786923, saldo_cop: 1786923, anticipo_pct: 60 },
    ] };
  const r = resumenAnticipoCotizacion(convertida);
  assert.equal(r.convertida, true);
  assert.equal(r.pedido.numero, 'PVEN-2');
  assert.equal(r.pct, 60);
  assert.equal(r.etiqueta, '60% · pedido PVEN-2');
  assert.equal(r.requerido, 1672154);
  assert.equal(r.pagado, 1000000);
  assert.equal(r.saldo, 1786923);
  assert.equal(r.pendiente, 672154, 'R4: queda debiendo anticipo');
  const sinSnapshot = resumenAnticipoCotizacion({ pedidos_venta: [{ numero: 'PVEN-3', estado: 'EN_PROCESO',
    total_cop: 1000, saldo_cop: 0, anticipo_pct: null }] });
  assert.equal(sinSnapshot.pct, 60, 'sin snapshot: 60, como anticipo_del_pedido del servidor');
  assert.equal(sinSnapshot.pendiente, 0);
}

console.log('--- N1 / R6 TEST 6: cuentaVerificacion descuenta el saldo a favor ---');
{
  const simple = cuentaVerificacion({ total_cop: 1000000, anticipo_requerido: 600000, saldo_a_favor: 0,
    anticipo_por_verificar: 600000, saldo_a_favor_detalle: [] });
  assert.deepEqual(simple, { total: 1000000, requerido: 600000, saldoAFavor: 0, porVerificar: 600000,
    maximo: 1000000, saldos: [] });

  const conSaldo = cuentaVerificacion({ total_cop: 1000000, anticipo_requerido: 600000, saldo_a_favor: 250000,
    anticipo_por_verificar: 350000, saldo_a_favor_detalle: [{ pven_id: 9, pven_numero: 'PVEN-1', monto: 250000 }] });
  assert.equal(conSaldo.porVerificar, 350000);
  assert.equal(conSaldo.maximo, 750000, 'el pago mas el saldo a favor no pasan del total');
  assert.deepEqual(conSaldo.saldos, [{ numero: 'PVEN-1', monto: 250000 }]);

  const saldoMayor = cuentaVerificacion({ total_cop: 500000, anticipo_requerido: 500000, saldo_a_favor: 800000 });
  assert.equal(saldoMayor.saldoAFavor, 500000, 'el traslado se limita al total');
  assert.equal(saldoMayor.porVerificar, 0, 'sin anticipo_por_verificar lo calcula igual que el servidor');
  assert.equal(saldoMayor.maximo, 0);
}

console.log('--- N1 / R4 TEST 7: evaluarVerificacion (pago completo, parcial con casilla, limites) ---');
{
  const cuenta = cuentaVerificacion({ total_cop: 1000000, anticipo_requerido: 600000, saldo_a_favor: 0,
    anticipo_por_verificar: 600000 });
  const hoy = '2026-10-04';
  const base = { monto: '600000', metodo: 'Transferencia bancaria', referencia: 'BANCOL-123', fecha: hoy,
    confirmoRevision: true, confirmoParcial: false };

  const ok = evaluarVerificacion(cuenta, base, hoy);
  assert.equal(ok.valido, true);
  assert.equal(ok.parcial, false);
  assert.equal(ok.deuda, 0);
  assert.deepEqual(ok.errores, []);

  assert.equal(evaluarVerificacion(cuenta, { ...base, confirmoRevision: false }, hoy).valido, false,
    'la casilla de revision es obligatoria');

  const parcial = evaluarVerificacion(cuenta, { ...base, monto: '500000' }, hoy);
  assert.equal(parcial.parcial, true);
  assert.equal(parcial.deuda, 100000);
  assert.equal(parcial.valido, false, 'R4: sin marcar la casilla del pago parcial no se crea');
  assert.equal(evaluarVerificacion(cuenta, { ...base, monto: '500000', confirmoParcial: true }, hoy).valido, true);

  const mayor = evaluarVerificacion(cuenta, { ...base, monto: '1200000' }, hoy);
  assert.equal(mayor.valido, false);
  assert.ok(mayor.errores.some((e) => e.includes('supera el total del pedido ($1.000.000)')), mayor.errores.join('|'));

  const conSaldo = cuentaVerificacion({ total_cop: 1000000, anticipo_requerido: 600000, saldo_a_favor: 250000,
    anticipo_por_verificar: 350000 });
  const sobreSaldo = evaluarVerificacion(conSaldo, { ...base, monto: '800000' }, hoy);
  assert.ok(sobreSaldo.errores.some((e) => e.includes('saldo a favor')), sobreSaldo.errores.join('|'));
  assert.equal(evaluarVerificacion(conSaldo, { ...base, monto: '350000' }, hoy).valido, true);

  const futura = evaluarVerificacion(cuenta, { ...base, fecha: '2026-10-05' }, hoy);
  assert.ok(futura.errores.includes('La fecha del pago no puede ser posterior a hoy.'));
  assert.equal(futura.valido, false);

  const corta = evaluarVerificacion(cuenta, { ...base, referencia: ' ab ' }, hoy);
  assert.ok(corta.errores.some((e) => e.includes('al menos 3 caracteres')));
  assert.equal(corta.valido, false);

  const metodoRaro = evaluarVerificacion(cuenta, { ...base, metodo: 'Bitcoin' }, hoy);
  assert.equal(metodoRaro.valido, false);

  const negativo = evaluarVerificacion(cuenta, { ...base, monto: '-5' }, hoy);
  assert.ok(negativo.errores.includes('El monto recibido debe ser mayor que $0.'));

  // Campos vacios: no son errores visibles (el boton queda deshabilitado), pero no es valido.
  const vacio = evaluarVerificacion(cuenta, { monto: '', metodo: '', referencia: '', fecha: '',
    confirmoRevision: false, confirmoParcial: false }, hoy);
  assert.equal(vacio.valido, false);
  assert.deepEqual(vacio.errores, []);
  assert.ok(vacio.pendientes.length >= 4);

  assert.equal(evaluarVerificacion(cuenta, { ...base, monto: '600000.4' }, hoy).monto, 600000, 'pesos enteros');

  // Fix 1: el monto escrito con puntos de miles ('600.000') vale; antes el input numerico lo dejaba vacio sin aviso.
  const conPuntos = evaluarVerificacion(cuenta, { ...base, monto: '$ 600.000' }, hoy);
  assert.equal(conPuntos.monto, 600000);
  assert.equal(conPuntos.valido, true);
  const millon = evaluarVerificacion(cuenta, { ...base, monto: '1.500.000' }, hoy);
  assert.equal(millon.monto, 1500000);
  assert.ok(millon.errores.some((e) => e.includes('supera el total del pedido')), 'se ve el monto y por que no vale');
  const texto = evaluarVerificacion(cuenta, { ...base, monto: 'seiscientos' }, hoy);
  assert.equal(texto.valido, false);
  assert.ok(texto.errores.includes('Escribe el monto en pesos, por ejemplo 1.500.000.'));
}

console.log('--- N1 TEST 7b: montoDesdeTexto (puntos de miles, coma decimal, simbolos) ---');
{
  assert.equal(montoDesdeTexto('1.500.000'), 1500000);
  assert.equal(montoDesdeTexto('$1.500.000'), 1500000);
  assert.equal(montoDesdeTexto(' 1 500 000 '), 1500000);
  assert.equal(montoDesdeTexto('1.500'), 1500, 'un punto con 3 cifras es de miles');
  assert.equal(montoDesdeTexto('1.500.000,50'), 1500001, 'coma decimal, al peso');
  assert.equal(montoDesdeTexto('600000.4'), 600000, 'un punto que no agrupa de a 3 es decimal');
  assert.equal(montoDesdeTexto('600000'), 600000);
  assert.equal(montoDesdeTexto(600000), 600000);
  assert.equal(montoDesdeTexto('-5'), -5);
  assert.equal(montoDesdeTexto(''), null);
  assert.equal(montoDesdeTexto(null), null);
  assert.equal(montoDesdeTexto('abc'), null);
  assert.equal(montoDesdeTexto('1.50.0'), null);
}

console.log('--- A1 TEST 7c: montoDesdeTexto con coma de miles, coma decimal y ambiguos ---');
{
  // Una coma o un punto seguidos de grupos de exactamente 3 cifras son de miles.
  assert.equal(montoDesdeTexto('600,000'), 600000, "'600,000' no es $600");
  assert.equal(montoDesdeTexto('1,500'), 1500, "'1,500' no es $2");
  assert.equal(montoDesdeTexto('1,500,000'), 1500000);
  assert.equal(montoDesdeTexto('$1,500,000'), 1500000);
  assert.equal(montoDesdeTexto('1.500.000'), 1500000);
  assert.equal(montoDesdeTexto('$ 600.000'), 600000);
  // Una coma seguida de 1 o 2 cifras al final es decimal (al peso).
  assert.equal(montoDesdeTexto('1.500.000,5'), 1500001);
  assert.equal(montoDesdeTexto('600,50'), 601);
  assert.equal(montoDesdeTexto('1,5'), 2);
  // Ambiguo o mal formado.
  assert.equal(montoDesdeTexto(''), null);
  assert.equal(montoDesdeTexto('abc'), null);
  assert.equal(montoDesdeTexto('1,5000'), null, 'coma con 4 cifras no es ni miles ni decimal');
  assert.equal(montoDesdeTexto('1.500,000'), null, 'punto y coma mezclados como miles');
  assert.equal(montoDesdeTexto('1,500.000'), null, 'coma y punto mezclados como miles');
  assert.equal(montoDesdeTexto('1,500,000.50'), null, 'miles con coma y decimal con punto');
  assert.equal(montoDesdeTexto('1,50,000'), null);
  assert.equal(montoDesdeTexto('600,000,'), null);
}

console.log('--- N1 TEST 8: verificacionParaEnviar arma el payload del servidor ---');
{
  assert.deepEqual(verificacionParaEnviar({ monto: '600000.4', metodo: 'Nequi', referencia: '  REF-1 ', fecha: '2026-10-04' }),
    { monto: 600000, metodo_pago: 'Nequi', referencia: 'REF-1', fecha_pago: '2026-10-04' });
  assert.equal(verificacionParaEnviar({ monto: '1.500.000', metodo: 'PSE', referencia: 'PSE-1' }).monto, 1500000);
  assert.deepEqual(verificacionParaEnviar({ monto: 1000, metodo: 'Efectivo', referencia: 'Recibo 9', fecha: '' }),
    { monto: 1000, metodo_pago: 'Efectivo', referencia: 'Recibo 9' });
}

console.log('--- R3 TEST 9: validarAjusteAnticipo (porcentaje 0-100 y nota de al menos 5 caracteres) ---');
{
  assert.deepEqual(validarAjusteAnticipo('50', ' Negociado con el cliente '),
    { pct: 50, nota: 'Negociado con el cliente', error: null });
  assert.equal(validarAjusteAnticipo('12,5', 'Acuerdo especial').pct, 12.5, 'acepta coma decimal');
  assert.equal(validarAjusteAnticipo('0', 'Sin anticipo pactado').pct, 0);
  assert.equal(validarAjusteAnticipo('100', 'Pago total pactado').pct, 100);
  for (const malo of ['', '101', '-1', 'abc', null]) {
    assert.equal(validarAjusteAnticipo(malo, 'Nota valida').error,
      'El anticipo manual debe ser un porcentaje entre 0% y 100%.', String(malo));
  }
  for (const nota of ['abc', '   abcd   ', '', null]) {
    assert.equal(validarAjusteAnticipo('50', nota).error,
      'Escribe una nota de al menos 5 caracteres que explique el anticipo manual.', String(nota));
  }
}

console.log('--- N1 / R6 TEST 10: pagos del pedido con etiquetas, nunca codigos crudos ---');
{
  for (const t of ['ANTICIPO', 'ABONO', 'PAGO_TOTAL', 'PAGO_SALDO', 'DEVOLUCION', 'REVERSION', 'AJUSTE_AUTORIZADO']) {
    const e = etiquetaTipoPago(t);
    assert.ok(e && e !== t && !e.includes('_'), `${t} -> ${e}`);
  }
  for (const s of ['CONFIRMADO', 'REVERTIDO', 'ANULADO', 'TRASLADADO']) {
    const e = etiquetaEstadoPago(s);
    assert.ok(e && e !== s && !e.includes('_'), `${s} -> ${e}`);
  }
  assert.equal(etiquetaEstadoPago('TRASLADADO'), 'Trasladado a otro pedido');
  assert.equal(etiquetaEstadoPago('ALGO_NUEVO'), 'Algo nuevo');
  assert.equal(etiquetaMetodoPago('TRASLADO'), 'Saldo a favor trasladado');
  assert.equal(etiquetaMetodoPago('SALDO_A_FAVOR'), 'Saldo a favor del cliente');
  assert.equal(etiquetaMetodoPago('CONVERSION_COTIZACION'), 'Registrado automáticamente');
  assert.equal(etiquetaMetodoPago('Nequi'), 'Nequi');
  assert.equal(etiquetaMetodoPago('TRANSFERENCIA'), 'Transferencia');
  assert.equal(etiquetaMetodoPago(null), 'Sin método');
  assert.equal(etiquetaTipoPago('DEVOLUCION'), 'Devolución');

  assert.deepEqual(describirPago({ tipo: 'ANTICIPO', monto: 600000, metodo_pago: 'Transferencia bancaria',
    referencia_bancaria: 'BANCOL-123', usuario: 'a@b.co', estado: 'CONFIRMADO' }),
  { titulo: 'Anticipo $600.000', partes: ['Transferencia bancaria', 'ref. BANCOL-123', 'verificado por a@b.co'],
    estado: null, sinVerificar: false });
  assert.deepEqual(describirPago({ tipo: 'ANTICIPO', monto: 250000, metodo_pago: 'TRASLADO',
    referencia_bancaria: 'PVEN-1', usuario: 'a@b.co', estado: 'CONFIRMADO' }).partes,
  ['Saldo a favor trasladado', 'desde PVEN-1', 'registrado por a@b.co']);
  const origen = describirPago({ tipo: 'ANTICIPO', monto: 250000, metodo_pago: 'Nequi', referencia_bancaria: 'N-1',
    usuario: 'a@b.co', estado: 'TRASLADADO' });
  assert.equal(origen.estado, 'Trasladado a otro pedido');
  assert.deepEqual(describirPago({ tipo: 'ANTICIPO', monto: 50000, metodo_pago: 'SALDO_A_FAVOR',
    referencia_bancaria: 'PVEN-1', usuario: null, estado: 'CONFIRMADO' }).partes,
  ['Saldo a favor del cliente', 'ref. PVEN-1']);
  const viejo = describirPago({ tipo: 'ANTICIPO', monto: 1724400, metodo_pago: 'CONVERSION_COTIZACION',
    referencia_bancaria: null, usuario: 'sistema', estado: 'CONFIRMADO' });
  assert.equal(viejo.sinVerificar, true);
  assert.deepEqual(viejo.partes, ['Registrado automáticamente', 'registrado por sistema']);
}

console.log('--- H44+N6 / H45 TEST 11: PXP vigente o cancelada y cuando se puede crear ---');
{
  assert.equal(etiquetaEstadoPxp('PENDIENTE'), 'Pendiente');
  assert.equal(etiquetaEstadoPxp('PAGADA'), 'Pagada');
  assert.equal(etiquetaEstadoPxp('CANCELADA'), 'Cancelada');
  assert.equal(etiquetaEstadoPxp('EN_REVISION'), 'En revision');
  // Fix 1: el chip solo muestra lo pendiente mientras la PXP esta PENDIENTE (una pagada no debe nada).
  // T11 (V9): sin repetir palabras: el numero ya dice PXP y el estado ya dice Pendiente.
  assert.equal(textoChipPxp({ numero: 'PXP-2', estado: 'PENDIENTE', monto_pendiente: 1062523 }),
    'PXP-2 · Pendiente · $1.062.523');
  assert.equal(textoChipPxp({ numero: 'PXP-2', estado: 'PAGADA', monto_pendiente: 1062523 }), 'PXP-2 · Pagada');
  assert.equal(textoChipPxp({ estado: 'PAGADA' }), 'PXP · Pagada', 'sin numero, la sigla sola');
  // T11 ronda 1 (3): el chip de la PXP cancelada usa la misma funcion ('PXP PXP-1 cancelada' repetia la sigla), sin monto.
  assert.equal(textoChipPxp({ numero: 'PXP-1', estado: 'CANCELADA', monto_pendiente: 5000 }), 'PXP-1 · Cancelada');

  const ambas = pxpsDelPedido({ pxps: [{ numero: 'PXP-1', estado: 'CANCELADA' }, { numero: 'PXP-2', estado: 'PENDIENTE' }] });
  assert.equal(ambas.vigente.numero, 'PXP-2');
  assert.equal(ambas.cancelada.numero, 'PXP-1');
  const soloCancelada = pxpsDelPedido({ pxps: [{ numero: 'PXP-1', estado: 'CANCELADA' }, { numero: 'PXP-3', estado: 'CANCELADA' }] });
  assert.equal(soloCancelada.vigente, null);
  assert.equal(soloCancelada.cancelada.numero, 'PXP-3', 'la cancelada mas reciente');
  assert.deepEqual(pxpsDelPedido({}), { vigente: null, cancelada: null });
  assert.deepEqual(pxpsDelPedido(null), { vigente: null, cancelada: null });

  const pven = { estado: 'PENDIENTE_COMPRA', saldo_cop: '1062523.00', pxps: [] };
  assert.equal(pedidoAdmitePxp(pven), true);
  assert.equal(pedidoAdmitePxp({ ...pven, estado: 'CANCELADO' }), false);
  assert.equal(pedidoAdmitePxp({ ...pven, saldo_cop: 0 }), false);
  assert.equal(pedidoAdmitePxp({ ...pven, pxps: [{ estado: 'PENDIENTE' }] }), false);
  assert.equal(pedidoAdmitePxp({ ...pven, pxps: [{ estado: 'PAGADA' }] }), false, 'una pagada tambien es vigente');
  assert.equal(pedidoAdmitePxp({ ...pven, pxps: [{ estado: 'CANCELADA' }] }), true);
  // Fila de la lista: no trae pxps, mira pxp_id (H45 lo limpia al anular).
  assert.equal(pedidoAdmitePxp({ estado: 'EN_PROCESO', saldo_cop: 10, pxp_id: 4 }), false);
  assert.equal(pedidoAdmitePxp({ estado: 'EN_PROCESO', saldo_cop: 10, pxp_id: null }), true);
  assert.equal(pedidoAdmitePxp(null), false);
}

console.log('--- A3 TEST 12: la re-cotizacion manda precios al pedido, nunca saldo ni anticipo ---');
{
  const data = { productos: [{ product_name: 'Cuna' }], subtotal_cop: 1500000, descuento_pct: 0, total_cop: 1500000 };
  // Pagado 700.000 (anticipo 400.000 + abono 300.000): el saldo lo recalcula el servidor desde el libro.
  const pedido = { total_cop: 1000000, saldo_cop: 300000, anticipo_cop: 400000 };
  const body = propagacionRecotizacion(data, pedido, 'COT-1', 'ana@x.com');
  assert.deepEqual(Object.keys(body).sort(),
    ['descuento_pct', 'motivo', 'productos', 'subtotal_cop', 'total_cop', 'updated_by']);
  assert.equal(body.total_cop, 1500000);
  assert.equal(body.updated_by, 'ana@x.com');
  assert.equal(body.motivo,
    'Precios actualizados por re-cotización de COT-1 (anticipo y pagos existentes no se modificaron).');
  // Total nuevo menor que lo pagado (no solo que el anticipo): el aviso usa lo pagado.
  const menor = propagacionRecotizacion({ ...data, total_cop: 600000 }, pedido, 'COT-1', 'ana@x.com');
  assert.equal(menor.motivo, 'Precios actualizados por re-cotización de COT-1 (anticipo y pagos existentes no se '
    + 'modificaron). Crédito a favor del cliente: $100.000.');
  assert.ok(!('saldo_cop' in menor) && !('anticipo_cop' in menor));
  // El modal de confirmacion usa la misma cuenta (antes: anticipo - total y "saldo negativo").
  assert.deepEqual(creditoPorRecotizacion(pedido, 600000), { pagado: 700000, credito: 100000 });
  assert.deepEqual(creditoPorRecotizacion(pedido, 1500000), { pagado: 700000, credito: 0 });
  assert.deepEqual(creditoPorRecotizacion(null, 1000), { pagado: 0, credito: 0 });
}

console.log('--- B7 / R6 TEST 13: dinero del pedido que queda como saldo a favor si se cancela ---');
{
  // La misma cuenta que saldos_a_favor_de_cotizacion: ingresos CONFIRMADO - devoluciones CONFIRMADO, sin el pago
  // automatico viejo 'CONVERSION_COTIZACION' (nadie lo verifico).
  const pagos = [
    { tipo: 'ANTICIPO', monto: 600000, metodo_pago: 'Nequi', estado: 'CONFIRMADO' },
    { tipo: 'ABONO', monto: 100000.4, metodo_pago: 'PSE', estado: 'CONFIRMADO' },
    { tipo: 'DEVOLUCION', monto: 50000, metodo_pago: 'PSE', estado: 'CONFIRMADO' },
    { tipo: 'ABONO', monto: 70000, metodo_pago: 'PSE', estado: 'REVERTIDO' },
    { tipo: 'REVERSION', monto: 70000, metodo_pago: 'PSE', estado: 'CONFIRMADO' },
    { tipo: 'ANTICIPO', monto: 999, metodo_pago: 'CONVERSION_COTIZACION', estado: 'CONFIRMADO' },
    { tipo: 'ANTICIPO', monto: 300000, metodo_pago: 'TRASLADO', estado: 'CONFIRMADO' },
  ];
  assert.equal(saldoAFavorAlCancelar({ pagos }), 950000);
  assert.equal(saldoAFavorAlCancelar({ pagos: [pagos[5]] }), 0, 'el pago automatico no es saldo a favor');
  assert.equal(saldoAFavorAlCancelar({ pagos: [pagos[0], { tipo: 'DEVOLUCION', monto: 700000, estado: 'CONFIRMADO' }] }), 0);
  for (const nulo of [null, undefined, {}, { pagos: null }, { pagos: [null, 'x'] }]) {
    assert.equal(saldoAFavorAlCancelar(nulo), 0);
  }
}

console.log('--- B4 TEST 14: Ajustar anticipo y Crear Pedido de Venta solo para los roles que acepta el servidor ---');
{
  // El servidor: PATCH /ventas/cotizaciones/{id} y POST /ventas/cotizaciones/{id}/confirmar con
  // require_roles(*ROLE_ADMIN, *ROLE_ASESOR) (normalize_role: Admin -> ADMIN, Vendedor -> ASESOR).
  const py = readFileSync(new URL('../../backend/app/api/v1/erp_ventas.py', import.meta.url), 'utf8');
  for (const ruta of ['def update_cotizacion(', 'def confirmar_cotizacion(']) {
    const firma = py.slice(py.indexOf(ruta), py.indexOf(ruta) + 200);
    assert.ok(firma.includes('require_roles(*ROLE_ADMIN, *ROLE_ASESOR)'), `${ruta} cambio de roles: ${firma}`);
  }
  for (const rol of ['ADMIN', 'Admin', 'admin', 'ASESOR', 'Asesor', 'Vendedor', ' vendedor ']) {
    assert.equal(puedeGestionarCotizacion(rol), true, rol);
  }
  for (const rol of ['COMPRAS', 'ERP', 'FINANZAS', 'Finanzas', 'BODEGA', 'CONSULTA', 'Mercadeo', '', null, undefined]) {
    assert.equal(puedeGestionarCotizacion(rol), false, String(rol));
  }
}

console.log('--- R23 (B2-T9A) TEST 15: la modalidad de la solicitud sale con tilde (etiquetaModalidad de etiquetas-ventas) ---');
{
  const credito = { sc_id: 9, sc_numero: 'SC-9', anticipo_pct: 0, sc_modalidad_pago: 'Credito 30 dias', anticipo_pct_manual: null };
  assert.equal(etiquetaAnticipoCotizacion(credito), '0% · Crédito 30 días');
  assert.equal(origenAnticipo(credito), 'Modalidad Crédito 30 días');
  assert.equal(resumenAnticipoCotizacion({ ...credito, total_cop: 1000, anticipo_requerido: 0 }).etiqueta,
    '0% · Crédito 30 días');
  // Los textos que etiquetaModalidad no reescribe quedan igual; los espacios de los bordes no cuentan.
  assert.equal(origenAnticipo({ sc_id: 9, sc_modalidad_pago: '  Contra entrega ' }), 'Modalidad Contra entrega');
  assert.equal(etiquetaAnticipoCotizacion({ sc_id: 9, anticipo_pct: 100, sc_modalidad_pago: 'Contado' }), '100% · Contado');
  // El manual y la COT sin solicitud no muestran modalidad; el valor guardado no cambia.
  assert.equal(etiquetaAnticipoCotizacion({ ...credito, anticipo_pct: 50, anticipo_pct_manual: 50 }), '50% · manual');
  assert.equal(credito.sc_modalidad_pago, 'Credito 30 dias');
}

console.log('--- U19+U21 / C10 (B2-T9A, ruling 2) TEST 16: nota del anticipo por producto en TOTALES ---');
{
  const SUMA = 'El anticipo de cada producto suma el anticipo total.';
  const SIN_PRECIO = 'Los productos no tienen precio por línea: el anticipo se calcula sobre el total.';
  const NO_CUADRA = 'El anticipo de los productos no suma el anticipo total: vale el anticipo total.';
  // El recorrido: 60/40 sobre 1.840.614 -> 1.104.368 = 744.368 + 280.800 + 79.200 (anticipo_por_linea del GET).
  const cot = { sc_id: 7, anticipo_pct: 60, sc_modalidad_pago: '60/40 (60% anticipo - 40% pendiente)', total_cop: 1840614,
    anticipo_requerido: 1104368, productos: [{}, {}, {}], anticipo_por_linea: [744368, 280800, 79200] };
  assert.deepEqual(notaAnticipoPorLinea(cot), { cuadra: true, texto: SUMA });
  // Con el resumen que ya pinto TOTALES (el mismo objeto).
  assert.deepEqual(notaAnticipoPorLinea(cot, resumenAnticipoCotizacion(cot)), { cuadra: true, texto: SUMA });
  // Sin la lista (GET viejo) o sin lineas: no hay nota.
  for (const sin of [undefined, null, [], 'x']) {
    assert.equal(notaAnticipoPorLinea({ ...cot, anticipo_por_linea: sin }), null, String(sin));
  }
  assert.equal(notaAnticipoPorLinea(null), null);
  // A credito (o sin precios): todas las lineas en 0 y el anticipo en 0 -> cuadra.
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, anticipo_pct: 0, anticipo_requerido: 0, anticipo_por_linea: [0, 0, 0] }),
    { cuadra: true, texto: SUMA });
  // Lineas sin valor y un total (dato viejo): el servidor reparte ceros y no suman el anticipo.
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, total_cop: 1000, anticipo_requerido: 600, anticipo_por_linea: [0, 0] }),
    { cuadra: false, texto: SIN_PRECIO });
  // No suman por otra causa: texto general.
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, anticipo_por_linea: [744368, 280800] }), { cuadra: false, texto: NO_CUADRA });
  // Decimales viejos se comparan al peso; un texto numerico cuenta, lo que no es numero vale 0.
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, anticipo_por_linea: [744368.0, '280800', 79200.4] }),
    { cuadra: true, texto: SUMA });
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, anticipo_por_linea: [744368, 280800, 79200, null, 'x'] }),
    { cuadra: true, texto: SUMA });

  // C10: con pedido vigente del MISMO total las lineas reparten el anticipo del pedido (su %), el de TOTALES. La
  // modalidad de la SC cambio despues de convertir (el GET recalcula 100%): no cuenta.
  const pven = { id: 2, numero: 'PVEN-2', estado: 'PENDIENTE_COMPRA', total_cop: 1840614, saldo_cop: 736246, anticipo_pct: 60 };
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, anticipo_pct: 100, anticipo_requerido: 1840614, pedidos_venta: [pven] }),
    { cuadra: true, texto: SUMA });
  // Pedido vigente de OTRO total (se re-cotizo sin pasar los precios al pedido): las lineas reparten el anticipo del
  // pedido (60% de 2.000.000 = 1.200.000) y su % ya no es el de cada producto: aviso del pedido aunque la suma cuadre.
  const otro = { ...pven, total_cop: 2000000, saldo_cop: 800000 };
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, pedidos_venta: [otro], anticipo_por_linea: [808826, 305116, 86058] }),
    { cuadra: false, texto: 'El pedido PVEN-2 tiene otro total: el anticipo es el del pedido.' });
  // Un pedido CANCELADO no es vigente: se reparte el requerido de la cotizacion (C10).
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, pedidos_venta: [{ ...otro, estado: 'CANCELADO' }] }),
    { cuadra: true, texto: SUMA });
  // Totales con decimales viejos se comparan al peso.
  assert.deepEqual(notaAnticipoPorLinea({ ...cot, total_cop: '1840614.00', pedidos_venta: [{ ...pven, total_cop: 1840613.6 }] }),
    { cuadra: true, texto: SUMA });
}

console.log('OK test_dinero_ventas.mjs');
