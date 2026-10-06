/**
 * frontend/tests/test_hub_ventas.mjs
 * Reglas del Hub de Ventas (frontend/src/lib/hub-ventas.js):
 *  - N3: "Cancelar documento" cancela esa fila, en orden VEN -> COT -> SC, con omitidos y resumen.
 *  - N2: el panel rapido del pedido solo ofrece lo que el servidor acepta (transicionesPedido).
 *  - N5: el resumen del cambio masivo de estado de pedidos.
 *  - H2 (R5): dias desde la creacion, nunca negativos ni "hace hoy"; fechas sin zona = UTC.
 *  - H3: la proxima accion de una solicitud y el semaforo (no resuelto / accion tomada).
 *  - T9B (Bloque 2): R19 (Cotizar solo con la confirmacion del cliente vigente), R20 (una SC sin confirmar con
 *    cotizacion activa no es No resuelto; tambien en el Kanban) y R1 (que nota del Chatter reinicia el atraso).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ordenParaCancelar, motivoNoCancelable, resumenLote,
  ETIQUETA_ESTADO_VEN, ESTADOS_VEN_MANUALES, opcionesEstadoPVEN, repartirCambioEstadoPVEN,
  comoUTC, diasDesde, textoAntiguedad, diaLocalDeFecha, fechaEditadaParaGuardar,
  ESTADOS_NO_RESOLUCION, ESTADOS_ACCION_TOMADA, tieneProductos, esNoResuelto, esAccionTomada, accionSiguienteSC,
  esSCConCotizacionTemprana, TIPOS_NOTA_REINICIAN_ATRASO, notaReiniciaAtraso,
} from '../src/lib/hub-ventas.js';
import { ESTADOS_PEDIDO } from '../src/lib/estados-pedido.js';
import { ESTADOS_SC, ESTADOS_SC_SIN_CONFIRMAR } from '../src/lib/estados-solicitud.js';
import { TIPOS_CHATTER, esEntradaChatter, tipoChatter } from '../src/lib/chatter.js';

console.log('--- N3 TEST 1: ordenParaCancelar procesa VEN, luego COT, luego SC (orden estable) ---');
{
  assert.deepEqual(ordenParaCancelar(['SC|1', 'VEN|3', 'COT|2', 'SC|4', 'VEN|5']), ['VEN|3', 'VEN|5', 'COT|2', 'SC|1', 'SC|4']);
  assert.deepEqual(ordenParaCancelar([]), []);
  // no muta la lista que recibe (es la seleccion del usuario)
  const ids = ['SC|1', 'VEN|2'];
  ordenParaCancelar(ids);
  assert.deepEqual(ids, ['SC|1', 'VEN|2']);
}

console.log('--- N3 TEST 2: motivoNoCancelable ---');
{
  assert.equal(typeof motivoNoCancelable({ tipo: 'SC', estado: 'CANCELADA' }), 'string');
  assert.match(motivoNoCancelable({ tipo: 'SC', estado: 'CANCELADA' }), /ya está cancelada/);
  assert.match(motivoNoCancelable({ tipo: 'SC', estado: 'ASIGNADA', tipo_solicitud: 'Soporte Tecnico' }), /ticket de soporte/);
  assert.match(motivoNoCancelable({ tipo: 'SC', estado: 'N/A_SOPORTE' }), /ticket de soporte/);
  assert.match(motivoNoCancelable({ tipo: 'COT', estado: 'RECHAZADA' }), /ya está rechazada/);
  assert.match(motivoNoCancelable({ tipo: 'VEN', estado: 'CANCELADO' }), /ya está cancelado/);
  assert.equal(typeof motivoNoCancelable({ tipo: 'VEN', estado: 'ENTREGADO' }), 'string');
  assert.match(motivoNoCancelable({ tipo: 'VEN', estado: 'ENTREGADO' }), /entregado/);
  assert.match(motivoNoCancelable({ tipo: 'VEN', estado: 'FACTURADO' }), /facturado/);
  // Igual que el servidor (TRANSICIONES_VEN_PATCH): devuelto y entregado parcialmente tampoco se cancelan por PATCH.
  assert.equal(typeof motivoNoCancelable({ tipo: 'VEN', estado: 'DEVUELTO_TOTAL' }), 'string');
  assert.equal(typeof motivoNoCancelable({ tipo: 'VEN', estado: 'PARCIALMENTE_ENTREGADO' }), 'string');
  assert.equal(motivoNoCancelable({ tipo: 'VEN', estado: 'EN_PROCESO' }), null);
  assert.equal(motivoNoCancelable({ tipo: 'VEN', estado: 'PAGADO' }), null); // heredado = operativo
  assert.equal(motivoNoCancelable({ tipo: 'COT', estado: 'BORRADOR' }), null);
  assert.equal(motivoNoCancelable({ tipo: 'COT', estado: 'CONFIRMADA' }), null); // el servidor decide si tiene pedido vigente
  assert.equal(motivoNoCancelable({ tipo: 'SC', estado: 'ASIGNADA', tipo_solicitud: 'Cotizacion de Producto' }), null);
}

console.log('--- N3 TEST 3: resumenLote (cancelaciones) ---');
{
  const todoOk = resumenLote([{ idStr: 'SC|1', numero: 'SC-1', ok: true }, { idStr: 'COT|2', numero: 'COT-2', ok: true }]);
  assert.deepEqual(todoOk.fallidos, []);
  assert.equal(todoOk.exitosos, 2);
  assert.equal(todoOk.mensaje, '2 documentos cancelados');

  const parcial = resumenLote([
    { idStr: 'VEN|1', numero: 'PVEN-1', ok: false, error: 'Indica el motivo...' },
    { idStr: 'COT|2', numero: 'COT-2', ok: true },
    { idStr: 'SC|3', numero: 'SC-3', ok: true },
  ]);
  assert.equal(parcial.mensaje, 'No se pudieron cancelar 1 de 3 documentos');
  assert.deepEqual(parcial.fallidos, [{ numero: 'PVEN-1', error: 'Indica el motivo...' }]);
  assert.equal(parcial.exitosos, 2);

  assert.equal(resumenLote([{ idStr: 'SC|1', numero: 'SC-1', ok: true }]).mensaje, '1 documento cancelado');
  // un fallo sin mensaje del servidor no queda en blanco
  const sinDetalle = resumenLote([{ idStr: 'SC|1', numero: 'SC-1', ok: false }]);
  assert.equal(sinDetalle.fallidos.length, 1);
  assert.ok(sinDetalle.fallidos[0].error.length > 0);
  assert.ok(!sinDetalle.mensaje.includes('1 de 1 documentos'));
}

console.log('--- N5 TEST 4: resumenLote con verbo "actualizados" (pedidos) ---');
{
  const r = resumenLote([
    { idStr: 'VEN|1', numero: 'PVEN-1', ok: false, error: 'Un pedido entregado solo puede pasar a Facturado.' },
    { idStr: 'VEN|2', numero: 'PVEN-2', ok: true },
  ], 'actualizados');
  assert.equal(r.mensaje, 'No se pudieron actualizar 1 de 2 pedidos');
  assert.deepEqual(r.fallidos, [{ numero: 'PVEN-1', error: 'Un pedido entregado solo puede pasar a Facturado.' }]);
  assert.equal(resumenLote([{ numero: 'PVEN-1', ok: true }, { numero: 'PVEN-2', ok: true }], 'actualizados').mensaje, '2 pedidos actualizados');
  assert.equal(resumenLote([{ numero: 'PVEN-1', ok: true }], 'actualizados').mensaje, '1 pedido actualizado');
}

console.log('--- N2 TEST 5: etiquetas y lista manual salen de estados-pedido.js (fuente unica) ---');
{
  assert.deepEqual([...ESTADOS_VEN_MANUALES], ['PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA']);
  for (const [clave, info] of Object.entries(ESTADOS_PEDIDO)) assert.equal(ETIQUETA_ESTADO_VEN[clave], info.label);
  assert.equal(ETIQUETA_ESTADO_VEN.EN_TRANSITO, 'En tránsito');
  assert.equal(ETIQUETA_ESTADO_VEN.FACTURADO, 'Facturado');
}

console.log('--- N2 TEST 6: opcionesEstadoPVEN ---');
{
  const enProceso = opcionesEstadoPVEN('EN_PROCESO');
  assert.ok(!enProceso.mover.includes('EN_PROCESO'));
  assert.ok(enProceso.mover.includes('LISTO_ENTREGA'));
  assert.ok(enProceso.mover.includes('EN_TRANSITO'));
  assert.equal(enProceso.cancelar, true);
  assert.equal(enProceso.despachar, true);
  assert.equal(enProceso.facturar, false);
  // nunca hay botones directos a Entregado ni a Cancelado sin motivo
  assert.ok(!enProceso.mover.includes('ENTREGADO'));
  assert.ok(!enProceso.mover.includes('CANCELADO'));
  assert.ok(!enProceso.mover.includes('PENDIENTE_PAGO'));

  const entregado = opcionesEstadoPVEN('ENTREGADO');
  assert.deepEqual(entregado.mover, []);
  assert.equal(entregado.facturar, true);
  assert.equal(entregado.cancelar, false);
  assert.equal(entregado.despachar, false);

  for (const cerrado of ['CANCELADO', 'FACTURADO', 'DEVUELTO_TOTAL']) {
    const op = opcionesEstadoPVEN(cerrado);
    assert.deepEqual(op.mover, [], cerrado);
    assert.equal(op.despachar || op.cancelar || op.facturar, false, cerrado);
  }

  // entregado parcialmente: solo se completa la entrega (por Entregas)
  const parcial = opcionesEstadoPVEN('PARCIALMENTE_ENTREGADO');
  assert.deepEqual(parcial.mover, []);
  assert.equal(parcial.despachar, true);
  assert.equal(parcial.cancelar, false);

  // un estado heredado o desconocido se trata como operativo (igual que el backend)
  const heredado = opcionesEstadoPVEN('PAGADO');
  assert.deepEqual(heredado.mover, ['PENDIENTE_COMPRA', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA']);
  assert.equal(heredado.cancelar, true);
}

console.log('--- H2 TEST 7: diasDesde (dias desde la fecha, nunca negativo) ---');
{
  const AHORA = Date.UTC(2026, 9, 4, 12, 0, 0);
  const antes = (ms) => new Date(AHORA - ms).toISOString();
  const H = 3600 * 1000;
  assert.equal(diasDesde(antes(1 * H), AHORA), 0);
  assert.equal(diasDesde(antes(30 * H), AHORA), 1);
  assert.equal(diasDesde(antes(72 * H), AHORA), 3);
  assert.equal(diasDesde(antes(-2 * H), AHORA), 0); // 2 h en el futuro (desfase de reloj)
  assert.equal(diasDesde(null, AHORA), 0);
  assert.equal(diasDesde('', AHORA), 0);
  assert.equal(diasDesde('basura', AHORA), 0);
  // R5: una fecha del API sin zona es UTC (no hora local): no se corre 5 h
  assert.equal(diasDesde('2026-10-04T11:00:00', AHORA), 0);
  assert.equal(diasDesde('2026-10-03T06:00:00', AHORA), 1);
  assert.equal(diasDesde('2026-10-03 06:00:00.123456', AHORA), 1);
  assert.equal(diasDesde('2026-10-04T07:30:00', AHORA), 0);
  // documento creado de noche en Colombia (03:00 UTC del dia siguiente) no aparece "de mañana"
  assert.equal(diasDesde('2026-10-04T03:00:00', Date.UTC(2026, 9, 4, 2, 0, 0)), 0);
  // con zona explicita se respeta
  assert.equal(diasDesde('2026-10-03T07:00:00-05:00', AHORA), 1);
}

console.log('--- H2 TEST 8: textoAntiguedad ---');
{
  assert.equal(textoAntiguedad(0), 'hoy');
  assert.equal(textoAntiguedad(1), 'hace 1 día');
  assert.equal(textoAntiguedad(5), 'hace 5 días');
  for (let d = -2; d <= 10; d++) {
    const t = textoAntiguedad(d);
    assert.ok(!t.includes('-'), `${d}: ${t}`);
    assert.ok(!t.includes('hace hoy'), `${d}: ${t}`);
  }
}

console.log('--- H3 TEST 9: listas del semaforo ---');
{
  assert.ok(ESTADOS_NO_RESOLUCION.includes('ASIGNADA'));
  assert.ok(ESTADOS_NO_RESOLUCION.includes('BORRADOR'));
  assert.ok(ESTADOS_ACCION_TOMADA.includes('COTIZADA'));
  assert.ok(ESTADOS_ACCION_TOMADA.includes('EN_ESPERA_CONFIRMACION'));
  assert.ok(ESTADOS_ACCION_TOMADA.includes('CONFIRMADA'));
}

console.log('--- H3 TEST 10: tieneProductos ---');
{
  assert.equal(tieneProductos([{ product_name: 'Cuna' }]), true);
  assert.equal(tieneProductos([{ nombre: 'Coche' }]), true);
  assert.equal(tieneProductos([{ name: 'Silla' }]), true);
  assert.equal(tieneProductos([{ product_name: '  ' }]), false);
  assert.equal(tieneProductos([]), false);
  assert.equal(tieneProductos(null), false);
  assert.equal(tieneProductos(undefined), false);
  assert.equal(tieneProductos([null, 5]), false);
}

console.log('--- H3 TEST 11: accionSiguienteSC ---');
{
  const sc = (estado, extra = {}) => ({ tipo: 'SC', id: 5, estado, productos: [{ product_name: 'Cuna' }], ...extra });
  const vacio = { cotizaciones: [], pedidos: [] };

  const enviar = accionSiguienteSC(sc('ASIGNADA'), vacio);
  assert.equal(enviar.label, 'Enviar para confirmación');
  assert.equal(enviar.href, '/dashboard/ventas/solicitud/5');
  assert.equal(typeof enviar.tono, 'string');

  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [] }), vacio).label, 'Agregar productos');
  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [{ product_name: '  ' }] }), vacio).label, 'Agregar productos');
  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [] }), vacio).href, '/dashboard/ventas/solicitud/5');
  assert.equal(accionSiguienteSC(sc('BORRADOR'), vacio).label, 'Asignar asesor');
  assert.equal(accionSiguienteSC(sc('PENDIENTE_CONFIRMACION'), vacio).label, 'Esperando cliente');
  // R19 (T9B): se cotiza solo con la confirmación del cliente vigente (confirmacion_vigente de _sc_dict, T2A)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), vacio).label, 'Cotizar →');
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), vacio).href, '/dashboard/ventas/solicitud/5');
  // R19 (enmienda del controlador, T9B r1): sin la confirmación vigente (false, sin la llave o cualquier otro valor) no
  // se cotiza ni se envía (el servidor solo envía una Asignada): el detalle ofrece «Reiniciar solicitud» o «Cotizar sin
  // esperar confirmación», y el Hub abre la solicitud con 'Reiniciar o cotizar'
  const retomar = { label: 'Reiniciar o cotizar', href: '/dashboard/ventas/solicitud/5', tono: 'slate' };
  for (const extra of [{ confirmacion_vigente: false }, {}, { confirmacion_vigente: null }, { confirmacion_vigente: 'true' }, { confirmacion_vigente: 1 }]) {
    assert.deepEqual(accionSiguienteSC(sc('CONFIRMADA', extra), vacio), retomar, JSON.stringify(extra));
  }
  assert.deepEqual(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: false }), {
    cotizaciones: [{ id: 4, estado: 'RECHAZADA' }], pedidos: [],
  }), retomar);
  // 'Enviar para confirmación' queda solo para la Asignada
  assert.notEqual(accionSiguienteSC(sc('CONFIRMADA'), vacio).label, 'Enviar para confirmación');
  // lo que va antes no cambia: el documento activo y 'Agregar productos'
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: false }), {
    cotizaciones: [{ id: 9, estado: 'BORRADOR' }], pedidos: [],
  }).label, 'Ver cotización');
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { productos: [] }), vacio).label, 'Agregar productos');

  const verCot = accionSiguienteSC(sc('CONFIRMADA'), { cotizaciones: [{ id: 9, estado: 'CONFIRMADA' }], pedidos: [] });
  assert.equal(verCot.label, 'Ver cotización');
  assert.equal(verCot.href, '/dashboard/ventas/cotizacion/9');
  assert.equal(accionSiguienteSC(sc('COTIZADA'), { cotizaciones: [{ id: 3, estado: 'BORRADOR' }], pedidos: [] }).label, 'Ver cotización');
  // la mas reciente de las vigentes; una rechazada no cuenta
  assert.equal(accionSiguienteSC(sc('COTIZADA'), {
    cotizaciones: [{ id: 3, estado: 'BORRADOR' }, { id: 7, estado: 'ENVIADA' }, { id: 8, estado: 'RECHAZADA' }], pedidos: [],
  }).href, '/dashboard/ventas/cotizacion/7');
  // choque H3/N4: una COT VENCIDA cuenta como activa (esCotizacionActiva)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA'), { cotizaciones: [{ id: 4, estado: 'VENCIDA' }], pedidos: [] }).label, 'Ver cotización');
  // solo rechazadas: se puede cotizar otra vez (con la confirmación del cliente vigente, R19)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), { cotizaciones: [{ id: 4, estado: 'RECHAZADA' }], pedidos: [] }).label, 'Cotizar →');

  const verPed = accionSiguienteSC(sc('CONFIRMADA'), { cotizaciones: [{ id: 9, estado: 'CONFIRMADA' }], pedidos: [{ id: 4, estado: 'EN_PROCESO' }] });
  assert.equal(verPed.label, 'Ver pedido');
  assert.equal(verPed.href, '/dashboard/ventas/venta/4');
  assert.equal(accionSiguienteSC(sc('COTIZADA'), {
    cotizaciones: [{ id: 9, estado: 'BORRADOR' }], pedidos: [{ id: 4, estado: 'CANCELADO' }],
  }).label, 'Ver cotización');

  assert.equal(accionSiguienteSC(sc('CANCELADA'), vacio), null);
  const ticket = accionSiguienteSC(sc('ASIGNADA', { tipo_solicitud: 'Soporte Tecnico' }), vacio);
  assert.equal(ticket.label, 'Ver ticket');
  assert.equal(ticket.href, '/dashboard/ventas/solicitud/5');
  assert.equal(accionSiguienteSC(sc('N/A_SOPORTE'), vacio).label, 'Ver ticket');
  assert.equal(accionSiguienteSC(sc('RECHAZADA'), vacio).label, 'Ver solicitud');
  // sin contexto no rompe
  assert.equal(accionSiguienteSC(sc('ASIGNADA')).label, 'Enviar para confirmación');
  // ninguna ruta pasa por /solicitud?id= (redirige)
  for (const e of ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA', 'RECHAZADA']) {
    assert.ok(!accionSiguienteSC(sc(e), vacio).href.includes('?id='), e);
  }
}

console.log('--- H3 TEST 12: esNoResuelto / esAccionTomada ---');
{
  assert.equal(esNoResuelto({ tipo: 'SC', estado: 'ASIGNADA' }, new Set()), true);
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set()), true);
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set([1])), false);
  assert.equal(esNoResuelto({ tipo: 'SC', estado: 'COTIZADA' }, new Set()), false);
  assert.equal(esAccionTomada({ tipo: 'SC', estado: 'COTIZADA' }, new Set()), true);
  assert.equal(esAccionTomada({ tipo: 'COT', estado: 'CONFIRMADA' }, new Set()), true);
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set()), false);
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set([1])), true);
  assert.equal(esNoResuelto({ tipo: 'VEN', estado: 'EN_PROCESO' }, new Set()), true);

  // R20 (T9B): una SC sin confirmar con una cotización activa (U11, cotizada sin esperar al cliente) no es No resuelto
  // ni cuenta como atrasada: la alerta la lleva su cotización. Pasa a Acción tomada.
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }, new Set([1])), false);
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }, new Set([1])), true);
  for (const estado of ESTADOS_SC_SIN_CONFIRMAR) {
    assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado }, new Set([1])), false, estado);
    assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado }, new Set([1])), true, estado);
    // sin cotización activa, como antes
    assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado }, new Set()), true, estado);
    assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado }, new Set()), false, estado);
  }
  // mira el tipo antes que scConCot: los ids de SC, COT y PVEN pueden coincidir
  assert.equal(esNoResuelto({ tipo: 'COT', id: 1, estado: 'BORRADOR' }, new Set([1])), true);
  assert.equal(esAccionTomada({ tipo: 'COT', id: 1, estado: 'BORRADOR' }, new Set([1])), false);
  assert.equal(esNoResuelto({ tipo: 'VEN', id: 1, estado: 'PENDIENTE_COMPRA' }, new Set([1])), true);
  assert.equal(esNoResuelto({ id: 1, estado: 'ASIGNADA' }, new Set([1])), true);
  // ninguna SC queda a la vez en No resuelto y en Acción tomada, con o sin cotización
  for (const estado of Object.keys(ESTADOS_SC)) {
    for (const scConCot of [new Set([1]), new Set()]) {
      const fila = { tipo: 'SC', id: 1, estado };
      assert.ok(!(esNoResuelto(fila, scConCot) && esAccionTomada(fila, scConCot)), `${estado} (${scConCot.size})`);
    }
  }
  // sin scConCot no rompe
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }), true);
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }), false);
}

console.log('--- FIX1 TEST 13: un aviso (nota del rechazo que no quedo) no cuenta como fallo pero sale en el banner ---');
{
  const aviso = 'rechazada, pero el motivo no quedó en la Actividad: HTTP 500';
  const r = resumenLote([
    { idStr: 'COT|1', numero: 'COT-1', ok: true, aviso },
    { idStr: 'SC|2', numero: 'SC-2', ok: true },
  ]);
  assert.equal(r.exitosos, 2);
  assert.deepEqual(r.fallidos, []);
  assert.deepEqual(r.avisos, [{ numero: 'COT-1', error: aviso }]);
  assert.equal(r.mensaje, '2 documentos cancelados');
  assert.equal(r.banner.titulo, '2 documentos cancelados (1 aviso):');
  assert.deepEqual(r.banner.lineas, [{ numero: 'COT-1', error: aviso }]);

  // todo bien y sin avisos: sin banner (solo el toast)
  assert.equal(resumenLote([{ idStr: 'SC|1', numero: 'SC-1', ok: true }]).banner, null);

  // con un fallo: el titulo de siempre y primero los fallos, luego los avisos
  const conFallo = resumenLote([
    { idStr: 'VEN|1', numero: 'PVEN-1', ok: false, error: 'Indica el motivo...' },
    { idStr: 'COT|2', numero: 'COT-2', ok: true, aviso },
    { idStr: 'SC|3', numero: 'SC-3', ok: true },
  ]);
  assert.equal(conFallo.mensaje, 'No se pudieron cancelar 1 de 3 documentos');
  assert.equal(conFallo.banner.titulo, 'No se pudieron cancelar 1 de 3 documentos (1 aviso):');
  assert.deepEqual(conFallo.banner.lineas, [
    { numero: 'PVEN-1', error: 'Indica el motivo...' },
    { numero: 'COT-2', error: aviso },
  ]);
}

console.log('--- FIX1 TEST 14: repartirCambioEstadoPVEN (cambio masivo solo a los pedidos que pueden pasar) ---');
{
  const filas = [
    { idStr: 'VEN|1', numero: 'PVEN-1', estado: 'ENTREGADO' },
    { idStr: 'VEN|2', numero: 'PVEN-2', estado: 'EN_PROCESO' },
    { idStr: 'VEN|3', numero: 'PVEN-3', estado: 'LISTO_ENTREGA' },
    { idStr: 'VEN|4', numero: 'PVEN-4', estado: 'CANCELADO' },
  ];
  const aProceso = repartirCambioEstadoPVEN(filas, 'EN_PROCESO');
  assert.deepEqual(aProceso.aplican.map((f) => f.idStr), ['VEN|3']);
  assert.deepEqual(aProceso.omitidos, [
    { idStr: 'VEN|1', numero: 'PVEN-1', motivo: 'no se puede pasar de Entregado a En proceso' },
    { idStr: 'VEN|2', numero: 'PVEN-2', motivo: 'ya está en En proceso' },
    { idStr: 'VEN|4', numero: 'PVEN-4', motivo: 'no se puede pasar de Cancelado a En proceso' },
  ]);

  // Facturado solo desde Entregado
  const aFacturado = repartirCambioEstadoPVEN(filas, 'FACTURADO');
  assert.deepEqual(aFacturado.aplican.map((f) => f.idStr), ['VEN|1']);
  assert.deepEqual(aFacturado.omitidos.map((o) => o.motivo), [
    'no se puede pasar de En proceso a Facturado',
    'no se puede pasar de Listo para entrega a Facturado',
    'no se puede pasar de Cancelado a Facturado',
  ]);

  // un estado heredado se trata como operativo; una fila que ya no esta se omite
  const raras = repartirCambioEstadoPVEN([
    { idStr: 'VEN|5', numero: 'PVEN-5', estado: 'PAGADO' },
    { idStr: 'VEN|9', numero: 'Pedido 9' },
  ], 'LISTO_ENTREGA');
  assert.deepEqual(raras.aplican.map((f) => f.idStr), ['VEN|5']);
  assert.deepEqual(raras.omitidos, [{ idStr: 'VEN|9', numero: 'Pedido 9', motivo: 'ya no está en la lista del Hub' }]);
  assert.deepEqual(repartirCambioEstadoPVEN([], 'EN_PROCESO'), { aplican: [], omitidos: [] });
}

console.log('--- FIX1 TEST 15: resumenLote con omitidos y destino (cambio masivo) ---');
{
  const omitido = { idStr: 'VEN|1', numero: 'PVEN-1', motivo: 'no se puede pasar de Entregado a En proceso' };
  const r = resumenLote([{ idStr: 'VEN|2', numero: 'PVEN-2', ok: true }], 'actualizados', { omitidos: [omitido], destino: 'En proceso' });
  assert.equal(r.exitosos, 1);
  assert.equal(r.mensaje, '1 pedido actualizado a En proceso');
  assert.deepEqual(r.omitidos, [{ numero: 'PVEN-1', error: 'no se puede pasar de Entregado a En proceso' }]);
  assert.equal(r.banner.titulo, '1 pedido actualizado a En proceso (se omitió 1 pedido):');
  assert.deepEqual(r.banner.lineas, [{ numero: 'PVEN-1', error: 'no se puede pasar de Entregado a En proceso' }]);

  // ninguno podia pasar: no se envio nada
  const ninguno = resumenLote([], 'actualizados', { omitidos: [omitido, { ...omitido, numero: 'PVEN-3' }], destino: 'Facturado' });
  assert.equal(ninguno.exitosos, 0);
  assert.equal(ninguno.mensaje, 'Ningún pedido se pudo actualizar a Facturado');
  assert.equal(ninguno.banner.titulo, 'Ningún pedido se pudo actualizar a Facturado (se omitieron 2 pedidos):');

  // fallo + omitido
  const mixto = resumenLote([
    { idStr: 'VEN|2', numero: 'PVEN-2', ok: false, error: 'Un pedido entregado solo puede pasar a Facturado.' },
    { idStr: 'VEN|3', numero: 'PVEN-3', ok: true },
  ], 'actualizados', { omitidos: [omitido], destino: 'En proceso' });
  assert.equal(mixto.mensaje, 'No se pudieron actualizar 1 de 2 pedidos a En proceso');
  assert.equal(mixto.banner.titulo, 'No se pudieron actualizar 1 de 2 pedidos a En proceso (se omitió 1 pedido):');
  assert.deepEqual(mixto.banner.lineas.map((l) => l.numero), ['PVEN-2', 'PVEN-1']);

  // sin destino ni omitidos, igual que antes
  assert.equal(resumenLote([{ numero: 'PVEN-1', ok: true }], 'actualizados').mensaje, '1 pedido actualizado');
}

console.log('--- FIX1 TEST 16: comoUTC (fechas del API sin zona = UTC) ---');
{
  assert.equal(comoUTC('2026-10-04T11:00:00'), '2026-10-04T11:00:00Z');
  assert.equal(comoUTC('2026-10-04 11:00:00.123456'), '2026-10-04T11:00:00.123456Z');
  assert.equal(comoUTC('2026-10-04T11:00'), '2026-10-04T11:00Z');
  assert.equal(comoUTC('2026-10-04T11:00:00Z'), '2026-10-04T11:00:00Z');
  assert.equal(comoUTC('2026-10-04T11:00:00-05:00'), '2026-10-04T11:00:00-05:00');
  assert.equal(comoUTC('2026-10-04'), '2026-10-04'); // fecha de calendario: JS ya la lee como UTC
  assert.equal(comoUTC(null), null);
  assert.equal(comoUTC(undefined), undefined);
  // la hora mostrada no depende de la zona del navegador
  assert.equal(new Date(comoUTC('2026-10-04T03:00:00')).getTime(), Date.UTC(2026, 9, 4, 3, 0, 0));
}

// T8A ronda 1: el día de una fecha de negocio en hora LOCAL depende de la zona del proceso. Estas dos pruebas la fijan
// en America/Bogota (Node aplica process.env.TZ en caliente) y la devuelven al terminar: dan lo mismo en cualquier
// máquina (por ejemplo con TZ=Asia/Tokyo en el entorno).
{
  const tzPrevia = process.env.TZ;
  process.env.TZ = 'America/Bogota';
  try {
    assert.equal(new Date('2026-10-10T12:00:00Z').getTimezoneOffset(), 300, 'la prueba corre en hora de Colombia');

    console.log('--- T8A r1 TEST 17: diaLocalDeFecha (día de una fecha del API en hora de Colombia) ---');
    // sin zona = UTC (comoUTC): fecha_vencimiento = utcnow + días de una SC creada de noche en Colombia
    assert.equal(diaLocalDeFecha('2026-10-11T04:59:59.999999'), '2026-10-10'); // 11:59 pm del 10
    assert.equal(diaLocalDeFecha('2026-10-11T05:00:00'), '2026-10-11');        // medianoche de Colombia
    assert.equal(diaLocalDeFecha('2026-10-11T00:00:00'), '2026-10-10');        // 7 pm del 10
    assert.equal(diaLocalDeFecha('2026-10-11T01:00:00'), '2026-10-10');        // 8 pm del 10
    assert.equal(diaLocalDeFecha('2026-10-11 01:00:00.123456'), '2026-10-10');
    assert.equal(diaLocalDeFecha('2026-10-10T17:00:00'), '2026-10-10');        // lo que guarda 'Editar' (mediodía)
    // con zona se respeta la zona que trae
    assert.equal(diaLocalDeFecha('2026-10-11T03:00:00Z'), '2026-10-10');
    assert.equal(diaLocalDeFecha('2026-10-11T03:00:00-05:00'), '2026-10-11');
    // fecha sin hora: ese mismo día (new Date() la leería como medianoche UTC, que en Colombia es la víspera)
    assert.equal(diaLocalDeFecha('2026-10-10'), '2026-10-10');
    assert.equal(diaLocalDeFecha(' 2026-10-10 '), '2026-10-10');
    for (const v of [null, undefined, '', '   ', 'no es fecha', '2026-02-30', '2026-13-45T25:00:00', 20261010, {}]) {
      assert.equal(diaLocalDeFecha(v), '', `basura: ${JSON.stringify(v)}`);
    }

    console.log('--- T8A r1 TEST 18: fechaEditadaParaGuardar (el vencimiento solo viaja si el día cambió) ---');
    // sin tocar la fecha de una SC creada a las 8 pm: el campo muestra el 10 y no se manda nada (antes se mandaba el
    // mediodía del 10 y la Actividad anotaba «11/10/2026 → 10/10/2026»)
    assert.equal(fechaEditadaParaGuardar(diaLocalDeFecha('2026-10-11T01:00:00'), '2026-10-11T01:00:00'), null);
    assert.equal(fechaEditadaParaGuardar('2026-10-10', '2026-10-10T17:00:00'), null);
    assert.equal(fechaEditadaParaGuardar(' 2026-10-10 ', '2026-10-10T17:00:00'), null);
    // el día cambió: el mediodía local de ese día (17:00 UTC en Colombia), el mismo día en UTC y en hora local
    assert.equal(fechaEditadaParaGuardar('2026-10-12', '2026-10-11T01:00:00'), '2026-10-12T17:00:00.000Z');
    assert.equal(fechaEditadaParaGuardar('2026-10-12', null), '2026-10-12T17:00:00.000Z'); // sin fecha guardada
    // campo vacío o inválido: nunca se manda '' ni una fecha imposible
    for (const v of ['', null, undefined, '   ', '12/10/2026', '2026-02-30', 'abc', 20261012]) {
      assert.equal(fechaEditadaParaGuardar(v, '2026-10-11T01:00:00'), null, `campo: ${JSON.stringify(v)}`);
    }
    // ida y vuelta: lo que se guarda (sin zona en la base) vuelve al campo como el mismo día, y ya no se manda
    for (const dia of ['2026-10-10', '2026-12-31', '2027-01-01']) {
      const guardado = fechaEditadaParaGuardar(dia, null).replace(/\.\d+Z$/, '');
      assert.equal(diaLocalDeFecha(guardado), dia, `ida y vuelta de ${dia}`);
      assert.equal(fechaEditadaParaGuardar(dia, guardado), null);
    }
  } finally {
    if (tzPrevia === undefined) delete process.env.TZ;
    else process.env.TZ = tzPrevia;
  }
}

console.log('--- T9B TEST 19: esSCConCotizacionTemprana (R20; la usa también la columna del Kanban) ---');
{
  const conCot = new Set([5]);
  // exactamente los estados sin confirmar de la SC (ESTADOS_SC_SIN_CONFIRMAR de estados-solicitud.js), con cotización
  for (const estado of Object.keys(ESTADOS_SC)) {
    assert.equal(esSCConCotizacionTemprana({ tipo: 'SC', id: 5, estado }, conCot), ESTADOS_SC_SIN_CONFIRMAR.includes(estado), estado);
    assert.equal(esSCConCotizacionTemprana({ tipo: 'SC', id: 5, estado }, new Set()), false, `${estado} sin cotización`);
  }
  // otro documento con el mismo id no cuenta
  assert.equal(esSCConCotizacionTemprana({ tipo: 'COT', id: 5, estado: 'BORRADOR' }, conCot), false);
  assert.equal(esSCConCotizacionTemprana({ tipo: 'VEN', id: 5, estado: 'PENDIENTE_COMPRA' }, conCot), false);
  // datos raros no rompen
  assert.equal(esSCConCotizacionTemprana({ tipo: 'SC', id: 5, estado: 'ASIGNADA' }), false);
  assert.equal(esSCConCotizacionTemprana(null, conCot), false);
  assert.equal(esSCConCotizacionTemprana(undefined, undefined), false);
}

console.log('--- T9B TEST 20: notaReiniciaAtraso (R1: un contacto con el cliente reinicia el atraso; la nota interna no) ---');
{
  assert.deepEqual([...TIPOS_NOTA_REINICIAN_ATRASO], ['LLAMADA', 'WHATSAPP', 'CORREO', 'EXTERNA'], '_REINICIAN_ATRASO del backend (T4)');
  assert.ok(Object.isFrozen(TIPOS_NOTA_REINICIAN_ATRASO));
  // con cada tipo del Chatter: todos los contactos con el cliente reinician; la Nota interna no
  for (const tipo of Object.keys(TIPOS_CHATTER)) {
    assert.equal(notaReiniciaAtraso({ action: 'CHATTER', extra_data: { tipo } }), tipo !== 'NOTA', tipo);
  }
  // misma lectura que chatter.js: solo las notas (esEntradaChatter) y el tipo de tipoChatter (sin importar mayúsculas
  // ni espacios; sin tipo o desconocido = Nota interna)
  const renglones = [];
  for (const action of ['CHATTER', 'NOTE_ADDED', 'UPDATED', 'ESTADO_CHANGED', undefined]) {
    for (const extra_data of [{ tipo: 'LLAMADA' }, { tipo: ' llamada ' }, { tipo: 'externa', medio: 'Visita' }, { tipo: 'NOTA' },
      { tipo: 'FAX' }, { tipo: 5 }, {}, null, undefined]) {
      renglones.push({ action, extra_data });
    }
  }
  for (const r of renglones) {
    assert.equal(notaReiniciaAtraso(r), esEntradaChatter(r) && tipoChatter(r) !== 'NOTA', JSON.stringify(r));
  }
  assert.equal(notaReiniciaAtraso({ action: 'CHATTER', extra_data: { tipo: ' llamada ' } }), true);
  assert.equal(notaReiniciaAtraso({ action: 'NOTE_ADDED', extra_data: { tipo: 'NOTA' } }), false); // 'Motivo del rechazo (Hub)'
  // sin renglón no rompe
  for (const v of [null, undefined, 'CHATTER', 5]) assert.equal(notaReiniciaAtraso(v), false, String(v));
}

console.log('--- T9B r1 TEST 21: TIPOS_NOTA_REINICIAN_ATRASO es el _REINICIAN_ATRASO del backend (core/chatter.py) ---');
{
  const py = readFileSync(new URL('../../backend/app/core/chatter.py', import.meta.url), 'utf8');
  const conjunto = py.match(/^_REINICIAN_ATRASO\s*=\s*\{([^}]*)\}/m);
  assert.ok(conjunto, 'core/chatter.py define _REINICIAN_ATRASO = {...}');
  const delServidor = [...conjunto[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  assert.equal(delServidor.length, 4, 'se leyeron los 4 tipos del conjunto');
  assert.deepEqual([...TIPOS_NOTA_REINICIAN_ATRASO].sort(), [...delServidor].sort());
}

console.log('OK test_hub_ventas.mjs');
