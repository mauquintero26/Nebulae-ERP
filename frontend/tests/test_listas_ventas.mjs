/**
 * frontend/tests/test_listas_ventas.mjs
 * Reglas compartidas por las listas de Ventas y el Hub (frontend/src/lib/listas-ventas.js):
 *  - N8: los dias de alerta salen de Configuracion (respuesta cruda, dict interno o lo que guarda el Hub).
 *  - COT-LISTA: una cotizacion confirmada cuyo pedido se cancelo vuelve a contar como activa.
 *  - H47: el resumen de pedidos no suma el dinero de los cancelados ni de los devueltos (igual que el servidor).
 *  - N10: el filtro de estado ofrece nombres claros y tambien los estados que traen los datos.
 *  - H32 / N4 / N7 (Solicitudes): contadores reales (cotizaciones de verdad), dias de alerta con fechas UTC,
 *    resumen de la cancelacion masiva, Papelera y pasos para poder cancelar una solicitud.
 *  - T7: Papelera sin eliminada_at (pendiente de T2B).
 */

import assert from 'node:assert/strict';
import {
  diasAlerta, pedidoVigente, soloPedidosCancelados, ultimoPedidoCancelado, pestanaCotizacion, situacionPedidoCotizacion,
  ESTADOS_PEDIDO_SIN_DINERO, pedidoSumaDinero, resumenPedidos, kpisPedidos, hintTotalPedidos, opcionesFiltroEstado,
  generoCotizacion, cotizacionesVigentes, cotizacionesRechazadas, esperaCotizacion, contadoresSolicitudes,
  tasaConversionCotizacion, superaDiasAlerta, resumenCancelacionSolicitudes, estadoEnPapelera, pasosParaCancelarSolicitud,
  repartirCancelacionSolicitudes, cifrasVentasDashboard, rutaSinParametro,
} from '../src/lib/listas-ventas.js';

console.log('--- N8 TEST 1: diasAlerta lee las tres formas de la configuracion ---');
{
  assert.equal(diasAlerta({ status: 'success', data: { alerta_sc_dias: { value: '5' } } }, 'alerta_sc_dias'), 5);
  assert.equal(diasAlerta({ alerta_cot_dias: { value: '4' } }, 'alerta_cot_dias'), 4);
  assert.equal(diasAlerta({ alerta_sc_dias: '3' }, 'alerta_sc_dias'), 3);
}

console.log('--- N8 TEST 2: sin valor valido usa el de por defecto (2) ---');
{
  assert.equal(diasAlerta({}, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta(null, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta(undefined, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: 'abc' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: '0' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_sc_dias: { value: '-3' } }, 'alerta_sc_dias'), 2);
  assert.equal(diasAlerta({ alerta_ven_dias: '' }, 'alerta_ven_dias', 7), 7);
}

console.log('--- COT-LISTA TEST 3: pedidoVigente / soloPedidosCancelados ---');
{
  const conVigente = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, { estado: 'PENDIENTE_COMPRA', numero: 'PVEN-2' }] };
  assert.equal(pedidoVigente(conVigente).numero, 'PVEN-2');
  assert.equal(soloPedidosCancelados(conVigente), false);

  // B5: con dos vigentes (dato viejo) es el mas NUEVO, como _pven_vigente_de_cotizacion del servidor (el GET los trae
  // por id, del mas viejo al mas nuevo).
  const dosVigentes = { pedidos_venta: [{ estado: 'EN_PROCESO', numero: 'PVEN-1' }, null,
    { estado: 'CANCELADO', numero: 'PVEN-2' }, { estado: 'PENDIENTE_COMPRA', numero: 'PVEN-3' },
    { estado: 'CANCELADO', numero: 'PVEN-4' }] };
  assert.equal(pedidoVigente(dosVigentes).numero, 'PVEN-3');

  const soloCancelados = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }] };
  assert.equal(pedidoVigente(soloCancelados), null);
  assert.equal(soloPedidosCancelados(soloCancelados), true);

  for (const cot of [{}, { pedidos_venta: null }, { pedidos_venta: [] }, null, undefined]) {
    assert.equal(pedidoVigente(cot), null);
    assert.equal(soloPedidosCancelados(cot), false);
  }
}

console.log('--- H46 TEST 4: ultimoPedidoCancelado toma el cancelado mas reciente (el detalle los trae por id) ---');
{
  const cot = { pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, null, { estado: 'CANCELADO', numero: 'PVEN-3' }] };
  assert.equal(ultimoPedidoCancelado(cot).numero, 'PVEN-3');
  assert.equal(ultimoPedidoCancelado({ pedidos_venta: [{ estado: 'PENDIENTE_COMPRA', numero: 'PVEN-2' }] }), null);
  assert.equal(ultimoPedidoCancelado({}), null);
  assert.equal(ultimoPedidoCancelado(null), null);
}

console.log('--- COT-LISTA TEST 5: pestanaCotizacion (la confirmada con pedido caido vuelve a Activas) ---');
{
  assert.equal(pestanaCotizacion({ estado: 'BORRADOR' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'PENDIENTE_CONFIRMACION' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'VENCIDA' }), 'Activas');
  assert.equal(pestanaCotizacion({ estado: 'RECHAZADA', pedidos_venta: [{ estado: 'CANCELADO' }] }), 'Rechazadas');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: true }), 'Confirmadas',
    'confirmada sin pedido y con la confirmacion del cliente vigente: por convertir');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: false }), 'Activas',
    'fix 2: confirmada sin confirmacion vigente y sin pedidos: no se puede convertir, hay que reabrirla');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA' }), 'Activas', 'sin el campo: igual que sin confirmacion vigente');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [{ estado: 'EN_PROCESO' }] }), 'Confirmadas');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [{ estado: 'CANCELADO' }] }), 'Activas',
    'dato antiguo: confirmada sin confirmacion vigente y con el pedido cancelado (hay que reabrirla)');
  assert.equal(pestanaCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: true,
    pedidos_venta: [{ estado: 'CANCELADO' }] }), 'Confirmadas',
  're-confirmada por el cliente tras cancelar el pedido: por convertir, suma en Monto Confirmado');
  assert.equal(pestanaCotizacion(null), 'Activas');
}

console.log('--- H47 TEST 6: resumenPedidos no suma el dinero de cancelados ni devueltos (como el servidor) ---');
{
  assert.deepEqual([...ESTADOS_PEDIDO_SIN_DINERO], ['CANCELADO', 'DEVUELTO_TOTAL']);
  const r = resumenPedidos([
    { estado: 'PENDIENTE_COMPRA', total_cop: '1000000.00', saldo_cop: 400000, anticipo_cop: 600000 },
    { estado: 'CANCELADO', total_cop: 2000000, saldo_cop: 2000000 },
    null,
  ]);
  assert.equal(r.monto_cop, 1000000);
  assert.equal(r.saldo_cop, 400000);
  assert.equal(r.anticipo_cop, 600000);
  assert.equal(r.total, 2, 'cuenta los pedidos (las lineas null no)');
  assert.deepEqual(r.por_estado, { PENDIENTE_COMPRA: 1, CANCELADO: 1 });

  const conDevuelto = resumenPedidos([
    { estado: 'ENTREGADO', total_cop: 500000, saldo_cop: 0, anticipo_cop: 500000 },
    { estado: 'DEVUELTO_TOTAL', total_cop: 700000, saldo_cop: 100000, anticipo_cop: 600000 },
    'no es un objeto',
  ]);
  assert.equal(conDevuelto.monto_cop, 500000);
  assert.equal(conDevuelto.saldo_cop, 0);
  assert.equal(conDevuelto.anticipo_cop, 500000);
  assert.deepEqual(conDevuelto.por_estado, { ENTREGADO: 1, DEVUELTO_TOTAL: 1 });

  const centavos = resumenPedidos([{ estado: 'EN_PROCESO', total_cop: 2786923.08, saldo_cop: 1062523.4, anticipo_cop: 1724399.68 }]);
  assert.equal(centavos.monto_cop, 2786923, 'en pesos enteros');
  assert.equal(centavos.saldo_cop, 1062523);

  for (const vacio of [[], undefined, null]) {
    assert.deepEqual(resumenPedidos(vacio), { total: 0, monto_cop: 0, saldo_cop: 0, anticipo_cop: 0, por_estado: {} });
  }
  assert.equal(pedidoSumaDinero({ estado: 'CANCELADO' }), false);
  assert.equal(pedidoSumaDinero({ estado: 'DEVUELTO_TOTAL' }), false);
  assert.equal(pedidoSumaDinero({ estado: 'PENDIENTE_PAGO' }), true);
  assert.equal(pedidoSumaDinero(null), false);
}

console.log('--- H47 TEST 7: kpisPedidos usa el resumen del servidor y, si no viene, el del navegador ---');
{
  const cargados = [
    { estado: 'PENDIENTE_COMPRA', total_cop: 1000, saldo_cop: 400, anticipo_cop: 600 },
    { estado: 'CANCELADO', total_cop: 9000, saldo_cop: 9000, anticipo_cop: 0 },
  ];
  const servidor = {
    total: 250, monto_cop: 5000000, saldo_cop: 1200000, anticipo_cop: 3800000,
    por_estado: { PENDIENTE_COMPRA: 10, EN_PROCESO: 5, ENTREGADO: 200, FACTURADO: 20, CANCELADO: 12, DEVUELTO_TOTAL: 3 },
  };
  const k = kpisPedidos(servidor, cargados);
  assert.equal(k.total, 250);
  assert.equal(k.monto, 5000000);
  assert.equal(k.saldo, 1200000);
  assert.equal(k.anticipo, 3800000);
  assert.equal(k.pCompra, 10);
  assert.equal(k.cancelados, 15, 'cancelados y devueltos, como la pestaña Cancelado');
  assert.equal(k.activos, 15, 'total menos entregados, facturados, cancelados y devueltos');
  assert.equal(k.cargados, 2);
  assert.equal(hintTotalPedidos(k), '15 activos · 15 cancelados · se ven los 2 más recientes');

  const sinServidor = kpisPedidos(null, cargados);
  assert.equal(sinServidor.total, 2);
  assert.equal(sinServidor.monto, 1000, 'el cancelado no suma');
  assert.equal(sinServidor.saldo, 400);
  assert.equal(sinServidor.activos, 1);
  assert.equal(hintTotalPedidos(sinServidor), '1 activos · 1 cancelados');

  const vacio = kpisPedidos(null, undefined);
  assert.equal(vacio.total, 0);
  assert.equal(hintTotalPedidos(vacio), '0 activos');
}

console.log('--- N10 TEST 8: opcionesFiltroEstado (lista base + los estados que traen los datos, sin repetir) ---');
{
  const base = opcionesFiltroEstado([]);
  assert.deepEqual(base, ['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO', 'LISTO_ENTREGA',
    'ENTREGADO', 'FACTURADO', 'CANCELADO']);
  const conRaros = opcionesFiltroEstado([{ estado: 'PENDIENTE_SALDO' }, { estado: 'EN_PROCESO' }, null,
    { estado: 'DEVUELTO_TOTAL' }, { estado: 'PENDIENTE_SALDO' }, { estado: '' }]);
  assert.deepEqual(conRaros.slice(-2), ['PENDIENTE_SALDO', 'DEVUELTO_TOTAL']);
  assert.equal(conRaros.length, base.length + 2);
}

console.log('--- H46 / N1 TEST 9: situacionPedidoCotizacion (crear pedido, reabrir o ya convertida) ---');
{
  // Convertida: tiene pedido vigente (la conversion consumio la confirmacion).
  const convertida = situacionPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: false,
    pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, { estado: 'EN_PROCESO', numero: 'PVEN-2' }] });
  assert.equal(convertida.paso, 'pedido_vigente');
  assert.equal(convertida.vigente.numero, 'PVEN-2');
  assert.equal(convertida.cancelado, null);
  assert.equal(convertida.avisoCancelado, false);

  // Re-confirmada por el cliente tras cancelar el pedido (flujo normal de H46): se crea otro pedido YA.
  const reconfirmada = situacionPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: true,
    pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }] });
  assert.equal(reconfirmada.paso, 'crear_pedido');
  assert.equal(reconfirmada.cancelado.numero, 'PVEN-1');
  assert.equal(reconfirmada.avisoCancelado, false, 'no se ofrece reabrir ni el aviso de reenviar');

  // Dato antiguo: CONFIRMADA sin confirmacion vigente y con el pedido cancelado: hay que reabrirla.
  const antigua = situacionPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: false,
    pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }, { estado: 'CANCELADO', numero: 'PVEN-3' }] });
  assert.equal(antigua.paso, 'reabrir');
  assert.equal(antigua.cancelado.numero, 'PVEN-3');
  assert.equal(antigua.avisoCancelado, true);

  // Confirmada sin pedidos: crear el pedido (la primera conversion).
  assert.equal(situacionPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: true }).paso, 'crear_pedido');
  // Fix 2: confirmada SIN confirmacion vigente y sin pedidos (anterior a Gate 2): el servidor no la convierte (400),
  // asi que tambien se reabre; no hay pedido cancelado del que avisar.
  const sinMarca = situacionPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: false });
  assert.equal(sinMarca.paso, 'reabrir');
  assert.equal(sinMarca.cancelado, null);
  assert.equal(sinMarca.avisoCancelado, false);
  assert.equal(situacionPedidoCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [] }).paso, 'reabrir', 'sin el campo');
  // Reabierta a Borrador por la cancelacion: sin paso de pedido, con el aviso del pedido cancelado.
  const borrador = situacionPedidoCotizacion({ estado: 'BORRADOR', confirmacion_vigente: false,
    pedidos_venta: [{ estado: 'CANCELADO', numero: 'PVEN-1' }] });
  assert.equal(borrador.paso, null);
  assert.equal(borrador.avisoCancelado, true);
  assert.deepEqual(situacionPedidoCotizacion(null), { paso: null, vigente: null, cancelado: null, avisoCancelado: false });
}

console.log('--- H32 TEST 1: generoCotizacion y cotizacionesVigentes (una rechazada si se genero; Vencida sigue activa) ---');
{
  assert.equal(generoCotizacion({ cotizaciones: [{ estado: 'RECHAZADA' }] }), true);
  assert.equal(generoCotizacion({ cotizaciones: [] }), false);
  assert.equal(generoCotizacion({}), false);
  assert.equal(generoCotizacion(null), false);
  assert.equal(generoCotizacion({ cotizaciones: null }), false);

  const sc = { cotizaciones: [{ estado: 'RECHAZADA', numero: 'COT-0' }, { estado: 'BORRADOR', numero: 'COT-1' }, { estado: 'VENCIDA', numero: 'COT-2' }, null] };
  assert.deepEqual(cotizacionesVigentes(sc).map((c) => c.numero), ['COT-1', 'COT-2'], 'VENCIDA cuenta como activa (decision N4)');
  assert.deepEqual(cotizacionesRechazadas(sc).map((c) => c.numero), ['COT-0']);
  for (const nulo of [{}, null, undefined, { cotizaciones: null }]) {
    assert.deepEqual(cotizacionesVigentes(nulo), []);
    assert.deepEqual(cotizacionesRechazadas(nulo), []);
  }
}

console.log('--- H32 TEST 2: esperaCotizacion (confirmada y sin cotizacion en juego) ---');
{
  assert.equal(esperaCotizacion({ estado: 'CONFIRMADA', cotizaciones: [] }), true);
  assert.equal(esperaCotizacion({ estado: 'CONFIRMADA' }), true);
  assert.equal(esperaCotizacion({ estado: 'CONFIRMADA', cotizaciones: [{ estado: 'RECHAZADA' }] }), true, 'solo tiene rechazadas: espera una nueva');
  assert.equal(esperaCotizacion({ estado: 'CONFIRMADA', cotizaciones: [{ estado: 'BORRADOR' }] }), false);
  assert.equal(esperaCotizacion({ estado: 'ASIGNADA', cotizaciones: [] }), false);
  assert.equal(esperaCotizacion(null), false);
}

console.log('--- H32 TEST 3: contadoresSolicitudes (tarjetas Confirmadas y Total) ---');
{
  const lista = [
    { estado: 'CONFIRMADA', cotizaciones: [] },                                  // espera cotizacion
    { estado: 'COTIZADA', cotizaciones: [{ estado: 'BORRADOR' }] },               // genero
    { estado: 'ASIGNADA', cotizaciones: [{ estado: 'RECHAZADA' }] },              // genero (rechazada)
    { estado: 'CANCELADA' },
  ];
  const c = contadoresSolicitudes(lista, 4);
  assert.equal(c.total, 4);
  assert.equal(c.totalConf, 1);
  assert.equal(c.conCot, 2);
  assert.equal(c.esperanCot, 1);
  assert.equal(c.hintConfirmadas, '1 esperan cotización');
  assert.equal(c.hintTotal, '2 generaron cotización');

  // El servidor tiene mas solicitudes que las cargadas (tope de 200): se dice cuantas se ven.
  assert.equal(contadoresSolicitudes(lista, 350).hintTotal, '2 generaron cotización · se ven las 4 más recientes de 350');
  assert.equal(contadoresSolicitudes(lista, null).hintTotal, '2 generaron cotización');

  assert.equal(contadoresSolicitudes([{ estado: 'ASIGNADA' }], 1).hintConfirmadas, 'Sin confirmadas');
  assert.equal(contadoresSolicitudes([{ estado: 'CONFIRMADA', cotizaciones: [{ estado: 'CONFIRMADA' }] }], 1).hintConfirmadas, 'Todas con cotización');
  const vacio = contadoresSolicitudes(null, null);
  assert.equal(vacio.total, 0);
  assert.equal(vacio.hintConfirmadas, 'Sin confirmadas');
}

console.log('--- H32 TEST 4: tasa de conversion solo con solicitudes de cotizacion de producto (decision del usuario) ---');
{
  const lista = [
    { tipo_solicitud: 'Cotizacion de Producto', cotizaciones: [{ estado: 'BORRADOR' }] },
    { tipo_solicitud: 'Cotizacion de Producto', cotizaciones: [{ estado: 'RECHAZADA' }] },
    { cotizaciones: [] },                                                           // sin tipo: cotizacion de producto
    { tipo_solicitud: 'Cotizacion de Producto', cotizaciones: [] },
    { tipo_solicitud: 'Soporte Tecnico' },                                          // nunca se cotiza: no cuenta
    { tipo_solicitud: 'Devolucion de Producto' },
  ];
  const t = tasaConversionCotizacion(lista);
  assert.equal(t.total, 4);
  assert.equal(t.conCot, 2);
  assert.equal(t.pct, 50);
  assert.deepEqual(tasaConversionCotizacion([{ tipo_solicitud: 'Soporte Tecnico' }]), { total: 0, conCot: 0, pct: 0 });
  assert.deepEqual(tasaConversionCotizacion(null), { total: 0, conCot: 0, pct: 0 });
}

console.log('--- N8 TEST 5: superaDiasAlerta lee las fechas del API como UTC ---');
{
  const ahora = Date.parse('2026-10-04T12:00:00Z');
  // Sin zona (fecha_solicitud): se lee como UTC, no como hora local del navegador.
  assert.equal(superaDiasAlerta('2026-10-01T11:00:00', 3, ahora), true, '3 dias y 1 hora > 3');
  assert.equal(superaDiasAlerta('2026-10-01T13:00:00', 3, ahora), false, '2 dias y 23 horas no pasan de 3');
  // Con 'Z' (updated_at): igual.
  assert.equal(superaDiasAlerta('2026-10-01T11:00:00Z', 3, ahora), true);
  assert.equal(superaDiasAlerta('2026-10-01T13:00:00Z', 3, ahora), false);
  assert.equal(superaDiasAlerta('2026-10-03T12:00:00Z', 5, ahora), false);
  for (const malo of [null, undefined, '', 'no es fecha']) assert.equal(superaDiasAlerta(malo, 2, ahora), false);
}

console.log('--- N4 TEST 6: resumenCancelacionSolicitudes (toast y detalle de la cancelacion de varias solicitudes) ---');
{
  const todas = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }, { numero: 'SC-2', ok: true }]);
  assert.equal(todas.mensaje, '2 solicitudes canceladas');
  assert.equal(todas.tipo, 'ok');
  assert.deepEqual(todas.fallidas, []);
  assert.equal(resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }]).mensaje, '1 solicitud cancelada');

  const msg409 = 'No se puede cancelar la solicitud SC-2: tiene documentos activos (cotización COT-9). Primero rechaza la cotización; después podrás cancelar la solicitud.';
  const parcial = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }, { numero: 'SC-2', ok: false, error: msg409 }]);
  assert.equal(parcial.tipo, 'err');
  assert.equal(parcial.mensaje, '1 solicitud cancelada. No se pudo cancelar: SC-2');
  assert.equal(parcial.fallidas.length, 1);
  assert.equal(parcial.fallidas[0].numero, 'SC-2');
  assert.equal(parcial.fallidas[0].texto, msg409, 'el detalle del servidor ya nombra la solicitud: no se repite');

  const ninguna = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: false, error: 'La solicitud está bloqueada' }, { numero: 'SC-3', ok: false, error: '' }]);
  assert.equal(ninguna.mensaje, 'No se pudieron cancelar: SC-1, SC-3');
  assert.equal(ninguna.fallidas[0].texto, 'SC-1: La solicitud está bloqueada');
  assert.ok(ninguna.fallidas[1].texto.startsWith('SC-3: '), 'ningun error queda en blanco');
  assert.ok(ninguna.fallidas[1].texto.length > 'SC-3: '.length);

  assert.equal(resumenCancelacionSolicitudes([]).mensaje, 'No se canceló ninguna solicitud');
  assert.equal(resumenCancelacionSolicitudes(null).tipo, 'err');
}

console.log('--- N4 TEST 7: estadoEnPapelera (se conserva si tiene documentos; nunca "null dias") ---');
{
  const conservada = estadoEnPapelera({ dias_restantes: null, tiene_documentos: true });
  assert.equal(conservada.conservada, true);
  assert.equal(conservada.texto, 'Se conserva (tiene documentos vinculados)');
  assert.equal(conservada.urgente, false, 'null <= 5 es true en JS: no se pinta como urgente');
  assert.equal(conservada.puedeEliminar, false);

  const normal = estadoEnPapelera({ dias_restantes: 20, tiene_documentos: false });
  assert.equal(normal.conservada, false);
  assert.equal(normal.texto, '20 días');
  assert.equal(normal.nota, 'para eliminar');
  assert.equal(normal.urgente, false);
  assert.equal(normal.puedeEliminar, true);

  assert.equal(estadoEnPapelera({ dias_restantes: 5, tiene_documentos: false }).urgente, true);
  assert.equal(estadoEnPapelera({ dias_restantes: 1, tiene_documentos: false }).texto, '1 día');
  assert.equal(estadoEnPapelera({ dias_restantes: 0, tiene_documentos: false }).texto, '0 días');
  // T7 (pendiente de T2B): sin dias_restantes ya no se dice que se conserva, pero tampoco se promete una eliminación.
  assert.equal(estadoEnPapelera({}).texto, 'No se elimina automáticamente: no tiene fecha de envío a la Papelera');
  assert.equal(estadoEnPapelera({}).nota, '', 'sin dias_restantes no hay cuenta regresiva');
  assert.equal(estadoEnPapelera({ dias_restantes: 10, tiene_documentos: true }).puedeEliminar, false);

  // Revision T11 (B1): 'Se conserva' y 'Eliminar permanentemente' no pueden ir juntos.
  for (const sc of [{}, { dias_restantes: null }, { dias_restantes: undefined, tiene_documentos: false },
    { dias_restantes: null, tiene_documentos: false }, { dias_restantes: null, tiene_documentos: true },
    { dias_restantes: 10, tiene_documentos: true }, { dias_restantes: 20, tiene_documentos: false }, null]) {
    const e = estadoEnPapelera(sc);
    assert.equal(e.conservada, e.texto.startsWith('Se conserva'), `conservada y su texto van juntos (${JSON.stringify(sc)})`);
    assert.ok(!(e.conservada && e.puedeEliminar), `se conserva: no se ofrece eliminar (${JSON.stringify(sc)})`);
  }
  assert.equal(estadoEnPapelera(null).puedeEliminar, false);
}

console.log('--- T7 TEST 7c (pendiente de T2B): sin eliminada_at y sin documentos no se purga sola, pero se puede eliminar ---');
{
  // Desde T2B el servidor manda dias_restantes = null también para una SC cancelada sin eliminada_at (cancelada con la
  // pastilla vieja): la purga no la toca. Eso no es "tiene documentos": 'Eliminar permanentemente' sale de
  // tiene_documentos, no de dias_restantes.
  const sinFecha = estadoEnPapelera({ dias_restantes: null, tiene_documentos: false });
  assert.deepEqual(sinFecha, {
    conservada: false, texto: 'No se elimina automáticamente: no tiene fecha de envío a la Papelera', nota: '',
    urgente: false, puedeEliminar: true,
  });
  // Con documentos se conserva el texto de siempre (y no se elimina), tenga o no dias_restantes.
  const conDocumentos = estadoEnPapelera({ dias_restantes: null, tiene_documentos: true });
  assert.equal(conDocumentos.texto, 'Se conserva (tiene documentos vinculados)');
  assert.equal(conDocumentos.puedeEliminar, false);
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: true }).texto, 'Se conserva (tiene documentos vinculados)');
  // La cuenta regresiva sigue igual sin documentos.
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: false }).puedeEliminar, true);
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: false }).texto, '12 días');
}

console.log('--- N4 TEST 7b (revision T11): repartirCancelacionSolicitudes omite las que ya estan en la Papelera y las de soporte ---');
{
  const filas = [
    { id: 1, numero: 'SC-1', estado: 'ASIGNADA', tipo_solicitud: 'Cotizacion de Producto' },
    { id: 2, numero: 'SC-2', estado: 'CANCELADA', tipo_solicitud: 'Cotizacion de Producto' },
    { id: 3, numero: 'SC-3', estado: 'N/A_SOPORTE', tipo_solicitud: 'Soporte Tecnico' },
    { id: 4, numero: 'SC-4', estado: 'BORRADOR' },
    null,
  ];
  const r = repartirCancelacionSolicitudes(filas);
  assert.deepEqual(r.cancelables.map((s) => s.id), [1, 4], 'no se hace POST /cancelar para las canceladas ni las de soporte');
  assert.deepEqual(r.omitidas, [
    { id: 2, numero: 'SC-2', motivo: 'ya está en la Papelera' },
    { id: 3, numero: 'SC-3', motivo: 'es un ticket de soporte: se cierra desde su estado de soporte' },
  ]);
  assert.deepEqual(repartirCancelacionSolicitudes([]), { cancelables: [], omitidas: [] });
  assert.deepEqual(repartirCancelacionSolicitudes(null), { cancelables: [], omitidas: [] });
  assert.equal(repartirCancelacionSolicitudes([{ id: 9, estado: 'CANCELADA' }]).omitidas[0].numero, '#9', 'sin numero se nombra por su id');
}

console.log('--- N4 TEST 7c (revision T11): resumenCancelacionSolicitudes informa las omitidas ---');
{
  const omitidas = [{ id: 2, numero: 'SC-2', motivo: 'ya está en la Papelera' }];
  const conOmitida = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }], omitidas);
  assert.equal(conOmitida.mensaje, '1 solicitud cancelada. Se omitió SC-2: ya está en la Papelera.');
  assert.equal(conOmitida.tipo, 'ok', 'omitir una que ya estaba cancelada no es un error');

  const soloOmitidas = resumenCancelacionSolicitudes([], omitidas);
  assert.equal(soloOmitidas.mensaje, 'No se canceló ninguna solicitud. Se omitió SC-2: ya está en la Papelera.');
  assert.equal(soloOmitidas.tipo, 'err');

  const varias = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }, { numero: 'SC-5', ok: true }],
    [...omitidas, { id: 3, numero: 'SC-3', motivo: 'es un ticket de soporte' }]);
  assert.equal(varias.mensaje, '2 solicitudes canceladas. Se omitieron SC-2: ya está en la Papelera; SC-3: es un ticket de soporte.');

  const conFallo = resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: false, error: 'bloqueada' }], omitidas);
  assert.equal(conFallo.mensaje, 'No se pudo cancelar: SC-1. Se omitió SC-2: ya está en la Papelera.');
  assert.equal(conFallo.tipo, 'err');
  // Sin omitidas el mensaje no cambia.
  assert.equal(resumenCancelacionSolicitudes([{ numero: 'SC-1', ok: true }], []).mensaje, '1 solicitud cancelada');
}

console.log('--- N4 TEST 8: pasosParaCancelarSolicitud (primero el pedido, luego la cotizacion; Vencida cuenta) ---');
{
  const sc = {
    cotizaciones: [{ id: 1, numero: 'COT-1', estado: 'RECHAZADA' }, { id: 2, numero: 'COT-2', estado: 'VENCIDA' }],
    pedidos_venta: [{ id: 7, numero: 'PVEN-7', estado: 'CANCELADO' }, { id: 8, numero: 'PVEN-8', estado: 'PENDIENTE_COMPRA' }],
  };
  const pasos = pasosParaCancelarSolicitud(sc);
  assert.deepEqual(pasos.map((p) => [p.tipo, p.id, p.numero]), [['pedido', 8, 'PVEN-8'], ['cotizacion', 2, 'COT-2']]);
  assert.equal(pasos[0].texto, 'Cancela el pedido de venta PVEN-8');
  assert.equal(pasos[1].texto, 'Rechaza la cotización COT-2');
  assert.deepEqual(pasosParaCancelarSolicitud({ cotizaciones: [{ numero: 'COT-1', estado: 'RECHAZADA' }], pedidos_venta: [{ numero: 'PVEN-1', estado: 'CANCELADO' }] }), []);
  for (const nulo of [{}, null, undefined, { cotizaciones: null, pedidos_venta: null }]) assert.deepEqual(pasosParaCancelarSolicitud(nulo), []);
}

console.log('--- B1 / R8 TEST: tras abrir la cancelacion, la URL queda sin ?accion=cancelar (y conserva lo demas) ---');
{
  const ruta = '/dashboard/ventas/venta/5';
  assert.equal(rutaSinParametro(ruta, 'accion=cancelar', 'accion'), ruta);
  assert.equal(rutaSinParametro(ruta, new URLSearchParams('accion=cancelar&return_to=%2Fdashboard%2Fventas'), 'accion'),
    `${ruta}?return_to=%2Fdashboard%2Fventas`);
  assert.equal(rutaSinParametro(ruta, 'return_to=%2Fx', 'accion'), `${ruta}?return_to=%2Fx`);
  for (const vacio of [null, undefined, '']) assert.equal(rutaSinParametro(ruta, vacio, 'accion'), ruta);
}

console.log('--- A4 / H47 TEST: cifras de ventas del Dashboard General sin cancelados ni devueltos ---');
{
  // Con el resumen del servidor (todos los pedidos, no solo la pagina de 50).
  const respuesta = {
    total: 4,
    resumen: { monto_cop: 3000, saldo_cop: 700, anticipo_cop: 900,
      por_estado: { EN_PROCESO: 2, CANCELADO: 1, DEVUELTO_TOTAL: 1 } },
    data: [{ estado: 'EN_PROCESO', total_cop: 1000, saldo_cop: 100, anticipo_cop: 900 }],
  };
  assert.deepEqual(cifrasVentasDashboard(respuesta), { ventas: 3000, cartera: 700, ticket: 1500 });
  // Sin resumen: la misma regla en el navegador. La cartera es el saldo (con abonos), no total - anticipo.
  const cargados = [
    { estado: 'EN_PROCESO', total_cop: 1000, saldo_cop: 100, anticipo_cop: 400 },
    { estado: 'PENDIENTE_PAGO', total_cop: 2001, saldo_cop: 2001, anticipo_cop: 0 },
    { estado: 'CANCELADO', total_cop: 5000, saldo_cop: 5000, anticipo_cop: 0 },
    { estado: 'DEVUELTO_TOTAL', total_cop: 7000, saldo_cop: 0, anticipo_cop: 7000 },
  ];
  assert.deepEqual(cifrasVentasDashboard({ data: cargados }), { ventas: 3001, cartera: 2101, ticket: 1501 });
  assert.deepEqual(cifrasVentasDashboard(cargados), { ventas: 3001, cartera: 2101, ticket: 1501 });
  assert.deepEqual(cifrasVentasDashboard({ data: [cargados[2]] }), { ventas: 0, cartera: 0, ticket: 0 });
  for (const nulo of [null, undefined, {}, []]) {
    assert.deepEqual(cifrasVentasDashboard(nulo), { ventas: 0, cartera: 0, ticket: 0 });
  }
}

console.log('OK test_listas_ventas.mjs');
