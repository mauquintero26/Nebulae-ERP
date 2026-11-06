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
  repartirCancelacionSolicitudes, cifrasVentasDashboard, rutaSinParametro, esSolicitudActiva, pestanaDeSolicitud,
  pistaActivasSolicitudes, valorConfig, enteroConfig, DIAS_VALIDEZ_COTIZACION, configLeida, cuerpoGuardarConfig,
  tarifaIvaDeConfig, AVISO_CONFIG_SIN_LEER,
} from '../src/lib/listas-ventas.js';
// B4 T7 r1: lo nuevo por el espacio de nombres, para que su falta no tape los demás rojos.
import * as listas from '../src/lib/listas-ventas.js';
import { existsSync, readFileSync } from 'node:fs';
import { TEXTO_PAPELERA_SIN_FECHA, ESTADOS_SC } from '../src/lib/estados-solicitud.js';

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
  assert.equal(normal.nota, 'para poder eliminarla');
  assert.equal(normal.urgente, false);
  assert.equal(normal.puedeEliminar, true);

  assert.equal(estadoEnPapelera({ dias_restantes: 5, tiene_documentos: false }).urgente, true);
  assert.equal(estadoEnPapelera({ dias_restantes: 1, tiene_documentos: false }).texto, '1 día');
  // B2.1 D2 (ruling de T4): con 0 días ya no dice «0 días para eliminar»: venció y la borra un administrador al vaciar.
  // B3 T18 (RP7): o la revisión automática (purga_papelera, desde B3-T10).
  assert.equal(estadoEnPapelera({ dias_restantes: 0, tiene_documentos: false }).texto,
    'Vencida: se borra cuando un administrador vacíe la Papelera o en la revisión automática');
  // T7 (pendiente de T2B): sin dias_restantes ya no se dice que se conserva, pero tampoco se promete una eliminación.
  assert.equal(estadoEnPapelera({}).texto, 'No vence: no tiene fecha de envío a la Papelera');
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
    conservada: false, texto: 'No vence: no tiene fecha de envío a la Papelera', nota: '',
    urgente: false, puedeEliminar: true,
  });
  // T7 ronda 1 (C13): es el mismo texto oficial de la tarjeta de la cancelación (una sola constante).
  assert.equal(sinFecha.texto, TEXTO_PAPELERA_SIN_FECHA);
  // Con documentos se conserva el texto de siempre (y no se elimina), tenga o no dias_restantes.
  const conDocumentos = estadoEnPapelera({ dias_restantes: null, tiene_documentos: true });
  assert.equal(conDocumentos.texto, 'Se conserva (tiene documentos vinculados)');
  assert.equal(conDocumentos.puedeEliminar, false);
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: true }).texto, 'Se conserva (tiene documentos vinculados)');
  // La cuenta regresiva sigue igual sin documentos.
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: false }).puedeEliminar, true);
  assert.equal(estadoEnPapelera({ dias_restantes: 12, tiene_documentos: false }).texto, '12 días');
}

console.log('--- T7 TEST 7d (ronda 1, C12): esSolicitudActiva, un solo predicado para la pestaña, sus contadores y la IA ---');
{
  const sc = (estado, tipo = 'Cotizacion de Producto') => ({ estado, tipo_solicitud: tipo });
  for (const e of ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION']) assert.equal(esSolicitudActiva(sc(e)), true, e);
  // Los estados heredados siguen visibles en 'Activas' hasta que T12 los ajuste (esconderlos sería peor).
  for (const e of ['COTIZADA', 'EN_ESPERA_CONFIRMACION', 'RECHAZADA', 'VENCIDA']) assert.equal(esSolicitudActiva(sc(e)), true, e);
  assert.equal(esSolicitudActiva(sc('CONFIRMADA')), false);
  assert.equal(esSolicitudActiva(sc('CANCELADA')), false);
  // Soporte Técnico no cuenta (por tipo o por su estado propio).
  assert.equal(esSolicitudActiva(sc('BORRADOR', 'Soporte Tecnico')), false);
  assert.equal(esSolicitudActiva(sc('N/A_SOPORTE')), false);
  for (const nada of [null, undefined, 'x', 3]) assert.equal(esSolicitudActiva(nada), false);
  // La misma lista da un solo número (antes la pestaña contaba por exclusión y el diagnóstico solo los 3 sin confirmar).
  const lista = [sc('BORRADOR'), sc('ASIGNADA'), sc('COTIZADA'), sc('CONFIRMADA'), sc('CANCELADA'), sc('BORRADOR', 'Soporte Tecnico')];
  assert.equal(lista.filter(esSolicitudActiva).length, 3);
}

console.log('--- T7 TEST 7e (ronda 2): pestanaDeSolicitud — cada SC cae en exactamente una pestaña ---');
{
  const PESTANAS = ['Activas', 'Confirmadas', 'Canceladas', 'Soporte'];
  const sc = (estado, tipo = 'Cotizacion de Producto') => ({ estado, tipo_solicitud: tipo });
  // Orden: Soporte (por tipo o por su estado propio) -> Confirmadas -> Canceladas -> Activas.
  const esperado = {
    BORRADOR: 'Activas', ASIGNADA: 'Activas', PENDIENTE_CONFIRMACION: 'Activas', CONFIRMADA: 'Confirmadas',
    CANCELADA: 'Canceladas', 'N/A_SOPORTE': 'Soporte',
    COTIZADA: 'Activas', EN_ESPERA_CONFIRMACION: 'Activas', RECHAZADA: 'Activas', VENCIDA: 'Activas',
  };
  assert.deepEqual(Object.keys(esperado).sort(), Object.keys(ESTADOS_SC).sort(), 'cubre todos los estados de ESTADOS_SC');
  for (const [estado, pestana] of Object.entries(esperado)) {
    assert.equal(pestanaDeSolicitud(sc(estado)), pestana, estado);
    // Un ticket de Soporte va a 'Soporte' tenga el estado que tenga (también Cancelada: antes salía en dos pestañas).
    assert.equal(pestanaDeSolicitud(sc(estado, 'Soporte Tecnico')), 'Soporte', `Soporte en ${estado}`);
  }
  // Un ticket al que se le corrigió el tipo en el detalle conserva N/A_SOPORTE: antes no salía en ninguna pestaña.
  assert.equal(pestanaDeSolicitud(sc('N/A_SOPORTE', 'Seguimiento')), 'Soporte');
  // Sin estado no está confirmada ni cancelada: sale en 'Activas' (no se pierde).
  assert.equal(pestanaDeSolicitud({ tipo_solicitud: 'Cotizacion de Producto' }), 'Activas');
  assert.equal(pestanaDeSolicitud({}), 'Activas');
  for (const nada of [null, undefined, 'x', 3]) {
    assert.equal(pestanaDeSolicitud(nada), null);
    assert.equal(esSolicitudActiva(nada), false);
  }
  // esSolicitudActiva es exactamente "su pestaña es Activas".
  for (const estado of Object.keys(esperado)) {
    for (const tipo of ['Cotizacion de Producto', 'Soporte Tecnico', 'Seguimiento']) {
      assert.equal(esSolicitudActiva(sc(estado, tipo)), pestanaDeSolicitud(sc(estado, tipo)) === 'Activas');
    }
  }
  // Con el filtro de la página (una pestaña = las filas cuya pestanaDeSolicitud es esa), los 4 contadores suman el total:
  // ninguna fila falta ni se repite.
  const filas = [
    ...Object.keys(esperado).map((e) => sc(e)), ...Object.keys(esperado).map((e) => sc(e, 'Soporte Tecnico')),
    sc('N/A_SOPORTE', 'Seguimiento'), { tipo_solicitud: 'Nuevo Lead' }, {},
  ];
  const conteos = PESTANAS.map((t) => filas.filter((s) => pestanaDeSolicitud(s) === t).length);
  assert.equal(conteos.reduce((a, b) => a + b, 0), filas.length);
  assert.deepEqual(conteos, [9, 1, 1, 12]);
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

console.log('--- T11 (V7): la tarjeta ACTIVAS no contradice al banner de vencidas ---');
{
  // 'Sin atender' (Borrador sin cambios más de los días de alerta) y 'vencidas' (activas con la fecha de vencimiento
  // pasada) miden cosas distintas: la tarjeta dice las dos, con los mismos números que el banner.
  assert.equal(pistaActivasSolicitudes(0, 0), 'Todas atendidas');
  assert.equal(pistaActivasSolicitudes(0, 1), '1 vencida', 'no dice «Todas atendidas» si el banner avisa vencidas');
  assert.equal(pistaActivasSolicitudes(0, 3), '3 vencidas');
  assert.equal(pistaActivasSolicitudes(2, 0), '2 sin atender');
  assert.equal(pistaActivasSolicitudes(1, 1), '1 sin atender · 1 vencida');
  assert.equal(pistaActivasSolicitudes(4, 2), '4 sin atender · 2 vencidas');
  // Valores raros cuentan como 0.
  assert.equal(pistaActivasSolicitudes(undefined, null), 'Todas atendidas');
  assert.equal(pistaActivasSolicitudes(-1, NaN), 'Todas atendidas');
}

console.log('--- B3 T16: valorConfig y enteroConfig (las secciones nuevas de la Configuración del Hub) ---');
{
  // Las tres formas, como diasAlerta.
  assert.equal(valorConfig({ status: 'success', data: { iva_tarifa_defecto: { value: '5' } } }, 'iva_tarifa_defecto'), '5');
  assert.equal(valorConfig({ iva_tarifa_defecto: { value: 'EXENTO' } }, 'iva_tarifa_defecto'), 'EXENTO');
  assert.equal(valorConfig({ dias_validez_cotizacion: '10' }, 'dias_validez_cotizacion'), '10');
  assert.equal(valorConfig({ dias_validez_cotizacion: 10 }, 'dias_validez_cotizacion'), '10');
  assert.equal(valorConfig({ seguimiento_auto_activo: false }, 'seguimiento_auto_activo'), 'false');
  // Sin la clave (o una clave heredada de Object) -> null; '' se conserva (el panel muestra lo que hay).
  for (const cfg of [null, undefined, {}, { data: null }, { otra: '1' }, { x: { value: null } }]) {
    assert.equal(valorConfig(cfg, 'x'), null, JSON.stringify(cfg));
  }
  assert.equal(valorConfig({}, 'toString'), null);
  assert.equal(valorConfig(Object.create({ x: '5' }), 'x'), null, 'solo claves propias');
  assert.equal(valorConfig({ x: '' }, 'x'), '');
  assert.equal(valorConfig({ x: { a: 1 } }, 'x'), null);
  // enteroConfig = admin_config.entero_acotado: fuera de rango usa el límite; lo que no es entero, el defecto.
  const { defecto, minimo, maximo } = DIAS_VALIDEZ_COTIZACION;
  assert.deepEqual([defecto, minimo, maximo], [5, 1, 60]);
  assert.ok(Object.isFrozen(DIAS_VALIDEZ_COTIZACION));
  const dias = (v) => enteroConfig({ dias_validez_cotizacion: v }, 'dias_validez_cotizacion', defecto, minimo, maximo);
  assert.equal(dias('10'), 10);
  assert.equal(dias(' 7 '), 7);
  assert.equal(dias('+8'), 8);
  assert.equal(dias('90'), 60);
  assert.equal(dias('0'), 1);
  assert.equal(dias('-3'), 1);
  for (const malo of ['abc', '2.5', '', null, undefined, true, '1e2']) assert.equal(dias(malo), 5, String(malo));
  assert.equal(enteroConfig(null, 'dias_validez_cotizacion', 5, 1, 60), 5);
  assert.equal(enteroConfig({ data: { dias_validez_cotizacion: { value: '12' } } }, 'dias_validez_cotizacion', 5, 1, 60),
    12);
}

console.log('--- B4 T7 r1 (m12): configDeRespuesta, los valores de GET /ventas/config (los casos de fusionarCargaHub) ---');
{
  const { configDeRespuesta } = listas;
  // El sobre {status, data} se desenvuelve; una respuesta que no es un objeto no reemplaza la que hay (null).
  assert.deepEqual(configDeRespuesta({ data: { alerta_sc_dias: '3' } }), { alerta_sc_dias: '3' });
  assert.equal(configDeRespuesta(null), null);
  assert.equal(configDeRespuesta('x'), null);
  // Sin sobre, el objeto tal cual (como `cfg.data || cfg`); un data que no es un objeto, tampoco reemplaza.
  assert.deepEqual(configDeRespuesta({ alerta_sc_dias: '4' }), { alerta_sc_dias: '4' });
  assert.equal(configDeRespuesta({ data: 'x' }), null);
  assert.equal(configDeRespuesta(undefined), null);
  // La página la usa para el ConfigPanel: solo una buena reemplaza lo de pantalla.
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(hub, /const datos = configDeRespuesta\(cfg\);\s*if \(datos\) setAlertDias\(datos\);/);
  assert.ok(!hub.includes('(cfg as { data?: unknown }).data || cfg'), 'sin el desenvolvimiento a mano');
}

console.log('--- B3 T16 r1: «Guardar Configuración» nunca pisa claves que no se tocaron ---');
{
  // configLeida: GET /ventas/config llegó de verdad (el sobre con su data); un GET que falló (null) no.
  assert.equal(configLeida({ status: 'success', data: { alerta_sc_dias: { value: '3', description: null } } }), true);
  assert.equal(configLeida({ status: 'success', data: {} }), true, 'una admin_config vacía (instalación nueva) sí cuenta');
  for (const no of [null, undefined, 'x', {}, { status: 'success' }, { data: null }, { data: [] }, { data: 'x' }]) {
    assert.equal(configLeida(no), false, JSON.stringify(no));
  }
  const inicial = { alerta_sc_dias: '2', alerta_cot_dias: '2', iva_tarifa_defecto: '5', seguimiento_auto_activo: 'false',
    dias_validez_cotizacion: '10', notif_whatsapp: 'false' };
  // Solo cambió un día de alerta -> el PATCH lleva SOLO esa clave (ni el IVA ni los recordatorios).
  assert.deepEqual(cuerpoGuardarConfig(inicial, { ...inicial, alerta_sc_dias: '4' }, true), { alerta_sc_dias: '4' });
  // Sin /config cargado -> no se puede guardar (null), aunque haya cambios.
  assert.equal(cuerpoGuardarConfig(inicial, { ...inicial, alerta_sc_dias: '4' }, false), null);
  assert.equal(cuerpoGuardarConfig(inicial, { ...inicial, alerta_sc_dias: '4' }, undefined), null, 'solo con true');
  // Sin cambios: un cuerpo vacío (no se escribe nada).
  assert.deepEqual(cuerpoGuardarConfig(inicial, { ...inicial }, true), {});
  // Varias: solo las que cambiaron, como texto; una clave nueva cuenta como cambio; nunca se borra una que falte.
  assert.deepEqual(cuerpoGuardarConfig(inicial, { ...inicial, seguimiento_auto_activo: 'true', iva_tarifa_defecto: '5',
    seguimiento_dias: '3' }, true), { seguimiento_auto_activo: 'true', seguimiento_dias: '3' });
  assert.deepEqual(cuerpoGuardarConfig(inicial, { alerta_sc_dias: 2 }, true), {}, '2 y \'2\' son el mismo valor');
  assert.deepEqual(cuerpoGuardarConfig(null, { a: '1' }, true), { a: '1' });
  assert.deepEqual(cuerpoGuardarConfig(Object.create({ a: '1' }), { a: '1' }, true), { a: '1' }, 'solo claves propias');
  assert.equal(cuerpoGuardarConfig(inicial, null, true), null);
}

console.log('--- Revisión final B3 (F2, M16): los botones de Configuración del Hub dicen por qué están apagados ---');
{
  assert.equal(AVISO_CONFIG_SIN_LEER, 'No se pudo leer la configuración: pulsa Actualizar.');
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // «Ajustar tiempos» y «Configuración»: deshabilitados sin /config, con el porqué en el title. B4 T7 (D27(a)): los dos
  // guardias en CADA botón que abre el panel, donde esté: «Configuración» sigue en el encabezado y «Ajustar tiempos» pasó
  // a la franja del flujo (accionAjustar de BannerFlujo, que los pinta como disabled y title).
  const aperturas = hub.match(/setShowConfig\(true\)/g) || [];
  assert.equal(aperturas.length, 2, 'los dos botones que abren el panel');
  const botones = hub.match(/<button onClick=\{\(\)=>setShowConfig\(true\)\} disabled=\{!configCargada\}[^>]*>/g) || [];
  assert.equal(botones.length, 1, '«Configuración» en el encabezado');
  for (const boton of botones) {
    assert.ok(boton.includes('title={configCargada ? undefined : AVISO_CONFIG_SIN_LEER}'), boton);
  }
  assert.ok(hub.includes("{ label: 'Ajustar tiempos', onClick: () => setShowConfig(true), deshabilitado: !configCargada, titulo: configCargada ? undefined : AVISO_CONFIG_SIN_LEER }"),
    '«Ajustar tiempos» (accionAjustar): apagado sin /config y con el porqué');
  assert.ok(hub.includes('accionAjustar={accionAjustar}'), 'la franja recibe la acción');
  const banner = readFileSync(new URL('../src/components/flujo/BannerFlujo.tsx', import.meta.url), 'utf8');
  assert.ok(banner.includes('disabled={accionAjustar.deshabilitado} title={accionAjustar.titulo}'), 'BannerFlujo los pinta en el botón');
}

console.log('--- B3 T17: tarifaIvaDeConfig (el IVA con que arranca el Cotizador Rápido) ---');
{
  // Las tres formas de valorConfig: la respuesta cruda de GET /ventas/config, el dict interno y lo que guarda el Hub.
  assert.equal(tarifaIvaDeConfig({ status: 'success', data: { iva_tarifa_defecto: { value: '5' } } }), '5');
  assert.equal(tarifaIvaDeConfig({ iva_tarifa_defecto: { value: 'exento' } }), 'EXENTO', 'normalizada');
  assert.equal(tarifaIvaDeConfig({ iva_tarifa_defecto: 'EXCLUIDO' }), 'EXCLUIDO');
  // Sin la clave, vacía o no válida: '19' (R8, como el servidor).
  for (const cfg of [{}, null, undefined, { data: {} }, { iva_tarifa_defecto: '' }, { iva_tarifa_defecto: '16' }]) {
    assert.equal(tarifaIvaDeConfig(cfg), '19', JSON.stringify(cfg));
  }
}

console.log('--- B4 T8 TEST 1: tarjetasSolicitudes — las 4 tarjetas de Solicitudes con el resumen del servidor (RP19) ---');
{
  // RP19 (3) y (4): valor de con_resumen (sc_activas ← activas, sc_confirmadas ← confirmadas, sc_canceladas ←
  // canceladas, sc_total ← total) y las ayudas de H32 y N8 con los números del resumen, no con una lista cargada.
  const resumen = { activas: 7, confirmadas: 3, canceladas: 2, total: 12, con_cot: 4, esperan_cot: 1, sin_atender: 2, vencidas: 1 };
  // r1 (m1, KPI-ventas punto 7): la de las activas va en alerta si hay sin atender o vencidas.
  assert.deepEqual(listas.tarjetasSolicitudes(resumen), {
    activas: { valor: 7, ayuda: '2 sin atender · 1 vencida', tono: 'alerta' },
    confirmadas: { valor: 3, ayuda: '1 esperan cotización' },
    canceladas: { valor: 2, ayuda: 'Fuera del flujo' },
    total: { valor: 12, ayuda: '4 generaron cotización' },
  });
  // La ayuda de Activas es la de V7 (pistaActivasSolicitudes) con sin_atender y vencidas del resumen.
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, sin_atender: 0, vencidas: 0 }).activas.ayuda, 'Todas atendidas');
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, sin_atender: 0, vencidas: 0 }).activas.tono, 'normal', 'todo atendido: normal');
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, sin_atender: 0, vencidas: 3 }).activas.tono, 'alerta', 'solo vencidas');
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, sin_atender: 1, vencidas: 0 }).activas.tono, 'alerta', 'solo sin atender');
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, sin_atender: -2, vencidas: 'x' }).activas.tono, 'normal', 'lo que no es un número');
  assert.equal(listas.tarjetasSolicitudes(resumen).activas.ayuda, pistaActivasSolicitudes(2, 1));
  // Confirmadas, con la regla de H32 de contadoresSolicitudes (la misma frase).
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, confirmadas: 0, esperan_cot: 0 }).confirmadas.ayuda, 'Sin confirmadas');
  assert.equal(listas.tarjetasSolicitudes({ ...resumen, esperan_cot: 0 }).confirmadas.ayuda, 'Todas con cotización');
  assert.equal(listas.pistaConfirmadasSolicitudes(1, 1), contadoresSolicitudes([{ estado: 'CONFIRMADA', cotizaciones: [] }], 1).hintConfirmadas);
  assert.equal(listas.pistaConfirmadasSolicitudes(0, 0), 'Sin confirmadas');
  assert.equal(listas.pistaConfirmadasSolicitudes(2, 0), 'Todas con cotización');
  assert.equal(listas.pistaTotalSolicitudes(4), '4 generaron cotización');
  assert.equal(listas.pistaTotalSolicitudes(null), '0 generaron cotización');
  // contadoresSolicitudes no cambia (usa las mismas frases).
  assert.equal(contadoresSolicitudes([{ estado: 'CONFIRMADA', cotizaciones: [] }], 350).hintTotal,
    `${listas.pistaTotalSolicitudes(0)} · se ven las 1 más recientes de 350`);
  // Sin resumen (cargando o con error): null, la franja pinta las barras grises o «—» (nunca 0).
  for (const nada of [null, undefined, 'x', 3, []]) assert.equal(listas.tarjetasSolicitudes(nada), null, String(nada));
  // Un número que falta o no sirve queda en null (la tarjeta dice «—»), no en 0.
  const incompleto = listas.tarjetasSolicitudes({ activas: 5, confirmadas: 'x', canceladas: -1 });
  assert.deepEqual([incompleto.activas.valor, incompleto.confirmadas.valor, incompleto.canceladas.valor, incompleto.total.valor],
    [5, null, null, null]);
  assert.equal(incompleto.activas.ayuda, 'Todas atendidas');
}

console.log('--- B4 T8 TEST 2: fechaVencida — la columna Vencimiento en rojo (la regla de la fila de antes, fuera del render) ---');
{
  // La fecha del API llega en UTC sin zona (comoUTC, ronda 2 de T7): vence cuando ese instante ya pasó.
  const ahora = Date.UTC(2026, 10, 6, 15, 0, 0);
  assert.equal(listas.fechaVencida('2026-11-06T14:59:59', ahora), true, 'sin zona: se lee como UTC');
  assert.equal(listas.fechaVencida('2026-11-06T15:00:01', ahora), false);
  assert.equal(listas.fechaVencida('2026-11-06T15:00:00Z', ahora), false, 'el mismo instante no es antes');
  assert.equal(listas.fechaVencida('2026-11-05 20:00:00', ahora), true, 'con espacio, como el backend');
  for (const nada of [null, undefined, '', 'x', 5]) assert.equal(listas.fechaVencida(nada, ahora), false, String(nada));
  // Sin `ahora`, la hora del sistema.
  assert.equal(listas.fechaVencida('2000-01-01T00:00:00'), true);
  assert.equal(listas.fechaVencida('2999-01-01T00:00:00'), false);
}

console.log('--- B4 T8 r1: el cableado de la lista de Solicitudes (A2, A3, m1, m2, m5, m7, m8, m9; D27) ---');
{
  const leer = (ruta) => readFileSync(new URL(`../src/app/dashboard/ventas/solicitud/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const lista = leer('solicitud-client.tsx');
  // m1: la tarjeta de las activas recibe el tono de tarjetasSolicitudes.
  assert.match(lista, /<TarjetaKpi kpi="sc_activas" [^>]*\btono=\{tarjetas\?\.activas\.tono\}/);
  // m2: la barra despacha por alCambiarBarra, que poda con accionModo y las opciones del modo NUEVO.
  assert.match(lista, /<BarraTabla\s+estado=\{estadoBarra\}\s+onEstado=\{alCambiarBarra\}/);
  assert.match(lista, /if \(accion\.tipo === 'modo'\) \{\s*const modo = String\(accion\.valor\);\s*despachar\(accionModo\(estado, modo, modo === 'kanban' \? OPCIONES_ESTADOS_TABLERO_SC : opcionesEstadosSolicitudes\)\);\s*\} else despachar\(accion\);/);
  // m5: la marca de la llegada sin filas (la Papelera y Kanban), puesta al día en el render, y la tabla y el total en
  // «cargando» mientras falte la página.
  assert.match(lista, /const sinFilasAhora = enPapelera \|\| modoEfectivo === 'kanban';/);
  assert.match(lista, /const llegadaAhora = llegadaDeListado\(llegada, listado\.crudo, sinFilasAhora\);\s*if \(llegadaAhora !== llegada\) setLlegada\(llegadaAhora\);/);
  assert.match(lista, /const sinPagina = !sinFilasAhora && llegadaAhora\.sinFilas && !listado\.error;/);
  assert.match(lista, /total=\{sinPagina \? null : listado\.total\}\s*cargando=\{listado\.cargandoInicial \|\| sinPagina\}/);
  assert.match(lista, /total: sinPagina \? null : listado\.total,\s*estadoTotal: estadoDelTotal\(\{\s*total: listado\.total, cargando: listado\.cargandoInicial \|\| sinPagina,/);
  // m7: «Con atraso» desde Soporte, la Papelera o Canceladas abre Activas. r2b (p5, ruling nuevo): también en Kanban, pero
  // la poda es con las opciones del modo que se ve (en Kanban, las del TABLERO): el filtro del tablero se queda y, al
  // volver a Lista, no se cae en Canceladas con atrasados (accionModo poda allí con las de Activas).
  assert.match(lista, /const VISTAS_SIN_ATRASO = \['soporte', 'papelera', 'canceladas'\];/);
  assert.match(lista, /const alFiltrarSemaforo = \(f: FiltroSemaforo\) => \{\s*if \(f !== 'todos' && VISTAS_SIN_ATRASO\.includes\(estado\.vista \?\? ''\)\) \{\s*despachar\(accionPestana\(estado, INICIAL_SC\.vista, modoEfectivo === 'kanban' \? OPCIONES_ESTADOS_TABLERO_SC : opcionesEstadosSolicitudes\)\);\s*\}\s*despachar\(\{ tipo: 'semaforo', valor: f === 'todos' \? null : f \}\);\s*\};/);
  {
    // El caso: Kanban, la vista 'canceladas' (se pasó a Kanban desde esa pestaña) y «Confirmada» en el filtro del tablero.
    const { estadoTablaInicial, reducirEstadoTabla, accionPestana, accionModo } = await import('../src/lib/tabla.js');
    const { opcionesEstadosSolicitudes, OPCIONES_ESTADOS_TABLERO_SC } = await import('../src/lib/kanban-ventas.js');
    const enKanban = estadoTablaInicial({ vista: 'canceladas', modo: 'kanban', estados: ['CONFIRMADA'] });
    // Lo que despacha alFiltrarSemaforo en Kanban: el salto a Activas con las opciones del tablero y el semáforo.
    const salto = reducirEstadoTabla(enKanban, accionPestana(enKanban, 'activas', OPCIONES_ESTADOS_TABLERO_SC));
    const conAtraso = reducirEstadoTabla(salto, { tipo: 'semaforo', valor: 'atrasados' });
    assert.equal(conAtraso.vista, 'activas', 'la vista pasa a Activas');
    assert.deepEqual(conAtraso.estados, ['CONFIRMADA'], 'el filtro del tablero se queda');
    assert.equal(conAtraso.modo, 'kanban');
    assert.equal(conAtraso.semaforo, 'atrasados');
    // Al volver a Lista (alCambiarBarra: accionModo con las opciones de la Lista), CONFIRMADA se poda: no está en Activas.
    const enLista = reducirEstadoTabla(conAtraso, accionModo(conAtraso, 'lista', opcionesEstadosSolicitudes));
    assert.equal(enLista.modo, 'lista');
    assert.equal(enLista.vista, 'activas', 'no se cae en Canceladas');
    assert.deepEqual(enLista.estados, [], 'CONFIRMADA se poda al volver a Lista');
    assert.equal(enLista.semaforo, 'atrasados');
    // Lo que hacía r1 (las opciones de la Lista también en Kanban): vaciaba el filtro del tablero.
    const r1 = accionPestana(enKanban, 'activas', opcionesEstadosSolicitudes);
    assert.deepEqual(reducirEstadoTabla(enKanban, r1).estados, [], 'con las opciones de Lista se habría vaciado el filtro del tablero');
  }
  // m8: el «vacío» de la lista se memoiza con la búsqueda y el de la Papelera es una constante del módulo.
  assert.match(lista, /const vacioLista = useMemo\(\(\) => \([\s\S]*?\), \[estado\.q\]\);/);
  assert.match(lista, /vacio=\{vacioLista\}/);
  assert.match(lista, /^const VACIO_PAPELERA = \(/m);
  assert.match(lista, /vacio=\{VACIO_PAPELERA\}/);
  // m9: «Restaurar» dice cuál.
  assert.ok(lista.includes('onClick={() => acciones?.restaurar(sc)} aria-label={`Restaurar ${sc.numero}`}'));
  // A3: «Cancelada el» de la Papelera sale oculta por defecto (R26; sigue en «Ajustar tabla»).
  assert.match(lista, /\{ id: 'cancelada', titulo: 'Cancelada el', ancho: \d+, ocultaPorDefecto: true,/);
  // A2: el esqueleto del Suspense arma la lista con sus MISMAS piezas (el contenedor, la franja, la cabecera, la barra y
  // las preferencias de la tabla), no una copia.
  const carga = leer('CargandoSolicitudes.tsx');
  assert.match(carga, /AccionesCabecera, COLUMNAS_TABLA_SC, CONTENEDOR_LISTA, ID_SC, INICIAL_SC, pestanasDeLaLista,\s*\} from '\.\/solicitud-client';/);
  assert.ok(carga.includes('<div className={CONTENEDOR_LISTA}>'), 'el contenedor de la lista');
  assert.ok(carga.includes("pasos={pasosDeLista(null, 'SC')}"), 'la franja con las cajas de la lista');
  assert.ok(carga.includes('const prefs = usePreferenciasTabla(ID_SC, COLUMNAS_TABLA_SC);'), 'las columnas que el usuario guardó');
  assert.ok(carga.includes('const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_SC);'), 'el estado inicial de la lista');
  assert.ok(lista.includes('<div className={CONTENEDOR_LISTA}>'), 'la lista usa el mismo contenedor');
  // B4 T9 r2 (p1): el esqueleto es INERTE pieza por pieza (antes no había aserción): mientras carga no se enfoca ni se toca
  // nada que vaya a desaparecer al llegar la lista.
  afirmarEsqueletoInerte(carga, 'Cargando las solicitudes…', 'CargandoSolicitudes');
}

/**
 * B4 T9 r2 (p1): un esqueleto del Suspense de una lista de Ventas (CargandoSolicitudes y CargandoCotizaciones) es inerte
 * pieza por pieza, sobre el código sin comentarios (un comentario que diga «inert» no cuenta): la franja, la cabecera (sus
 * botones, además, invisibles), las tarjetas y la tarjeta de la tabla; y el aviso de la carga va aparte, en un
 * role="status" sr-only (lo inerte no llega al lector de pantalla). Cuatro atributos inert, ni uno más ni uno menos.
 * @param {string} fuente
 * @param {string} textoEstado
 * @param {string} nombre
 */
function afirmarEsqueletoInerte(fuente, textoEstado, nombre) {
  const codigo = fuente.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  assert.match(codigo, /<div inert>\s*<BannerFlujo\b/, `${nombre}: la franja, inerte`);
  assert.match(codigo, /actions=\{<div inert className="invisible"><AccionesCabecera /, `${nombre}: la cabecera, inerte e invisible`);
  assert.match(codigo, /<div inert>\s*<FranjaKpis\b/, `${nombre}: las tarjetas, inertes`);
  assert.match(codigo, /<section inert className=\{TABLE\.tarjeta\}>\s*<BarraTabla\b/, `${nombre}: la barra y la tabla, inertes`);
  assert.ok(codigo.includes(`<p role="status" className="sr-only">${textoEstado}</p>`), `${nombre}: el aviso de la carga aparte`);
  // B4 T10 (el Minor de T9 r2): el aviso es el primer hijo DIRECTO del contenedor de la lista (que no es inerte), antes
  // de la cabecera: fuera de todo lo inerte. Si se mete en un <div inert> (o el contenedor se vuelve inerte), el lector de
  // pantalla no lo oye.
  const aviso = `<p role="status" className="sr-only">${textoEstado}</p>`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  assert.match(codigo, new RegExp(`<div className=\\{CONTENEDOR_LISTA\\}>\\s*${aviso}\\s*<PageHeader\\b`),
    `${nombre}: el aviso de la carga, hijo directo del contenedor, antes de la cabecera y fuera de lo inerte`);
  assert.equal((codigo.match(/\binert\b/g) ?? []).length, 4, `${nombre}: cuatro atributos inert`);
}

console.log('--- B4 T9 TEST 1: tarjetasCotizaciones — las 4 tarjetas de Cotizaciones con el resumen del servidor (RP19) ---');
{
  // RP19 (3): cot_activas ← activas, cot_confirmadas ← confirmadas, cot_monto_confirmado ← monto_confirmado y cot_total
  // ← total, con las ayudas de COT-LISTA (las de las StatCard de antes) armadas con los números del resumen.
  const resumen = {
    activas: 9, confirmadas: 3, con_pedido: 1, por_convertir: 2, rechazadas: 4, total: 16, monto_confirmado: 11000,
    sin_calc: 2, vencen_pronto: 3, sin_atender: 1,
  };
  assert.deepEqual(listas.tarjetasCotizaciones(resumen), {
    activas: { valor: 9, ayuda: '2 sin precio' },
    confirmadas: { valor: 3, ayuda: '1 con pedido de venta · 2 por convertir' },
    monto_confirmado: { valor: 11000, ayuda: '1 con pedido de venta vigente' },
    total: { valor: 16, ayuda: '4 rechazadas' },
  });
  const t = (cambios) => listas.tarjetasCotizaciones({ ...resumen, ...cambios });
  // Activas: «Todas calculadas» sin ninguna sin precio.
  assert.equal(t({ sin_calc: 0 }).activas.ayuda, 'Todas calculadas');
  assert.equal(t({ sin_calc: 'x' }).activas.ayuda, 'Todas calculadas', 'lo que no es un número cuenta como 0');
  // Confirmadas: «Sin confirmadas», «N con pedido · M por convertir» o «Todas con pedido de venta».
  assert.equal(t({ confirmadas: 0, con_pedido: 0, por_convertir: 0 }).confirmadas.ayuda, 'Sin confirmadas');
  assert.equal(t({ confirmadas: 2, con_pedido: 2, por_convertir: 0 }).confirmadas.ayuda, 'Todas con pedido de venta');
  assert.equal(t({ con_pedido: 0, por_convertir: 3 }).confirmadas.ayuda, '0 con pedido de venta · 3 por convertir');
  // El total: el singular de «rechazada».
  assert.equal(t({ rechazadas: 1 }).total.ayuda, '1 rechazada');
  assert.equal(t({ rechazadas: 0 }).total.ayuda, '0 rechazadas');
  // El monto: pesos enteros (el servidor lo manda como float: 11000.0); lo que no es un número, null («—»).
  assert.equal(t({ monto_confirmado: 1062523.4 }).monto_confirmado.valor, 1062523);
  assert.equal(t({ monto_confirmado: 0 }).monto_confirmado.valor, 0);
  for (const malo of ['11000', null, undefined, NaN, Infinity]) assert.equal(t({ monto_confirmado: malo }).monto_confirmado.valor, null, String(malo));
  // Sin resumen (cargando o con error): null, la franja pinta las barras grises o «—» (nunca 0).
  for (const nada of [null, undefined, 'x', 3, []]) assert.equal(listas.tarjetasCotizaciones(nada), null, String(nada));
  // Un conteo que falta o no sirve queda en null (la tarjeta dice «—»), no en 0.
  const incompleto = listas.tarjetasCotizaciones({ activas: 5, confirmadas: 'x', total: -1 });
  assert.deepEqual([incompleto.activas.valor, incompleto.confirmadas.valor, incompleto.monto_confirmado.valor, incompleto.total.valor],
    [5, null, null, null]);
  assert.equal(incompleto.confirmadas.ayuda, 'Sin confirmadas');
}

console.log('--- B4 T9 TEST 2 (r1, I2): la Entrega est. es un DÍA de calendario: diaDeNegocio, fechaNegocioVencida y fechaPorVencer ---');
{
  // fecha_entrega_estimada es una fecha de negocio (erp_ventas.py, la F3 del B3 y la cabecera de fechas-colombia.js): se
  // lee su día con los 10 primeros caracteres, sin pasarla a ninguna zona, y se compara con el día de HOY en Colombia
  // (diaColombia), como vencen_pronto con valida_hasta (RP89). r1 quita la lectura como instante UTC de r0, que corría la
  // medianoche al día anterior.
  const { fechaCorta, fechaSolo } = await import('../src/lib/fechas-colombia.js');
  const ENTREGA = '2026-11-10T00:00:00';   // lo que guarda el selector de fecha de la calculadora
  assert.equal(listas.diaDeNegocio(ENTREGA), '2026-11-10');
  assert.equal(fechaCorta(listas.diaDeNegocio(ENTREGA)), '10 nov 2026', 'la celda: el mismo día del detalle y del editor');
  assert.equal(fechaSolo(ENTREGA), '10 de noviembre de 2026', 'el title');
  for (const [valor, dia] of [['2026-11-10', '2026-11-10'], ['2026-11-10 00:00:00', '2026-11-10'], [' 2026-11-10T23:59:59 ', '2026-11-10'],
    ['2026-11-10T03:00:00Z', '2026-11-10'], ['2026-02-30T00:00:00', ''], ['10/11/2026', ''], ['', ''], [null, ''], [5, '']]) {
    assert.equal(listas.diaDeNegocio(valor), dia, String(valor));
  }
  // El día de hoy es el de Colombia: las 8 p. m. del 9 (la 1 a. m. UTC del 10) todavía es el 9.
  const nueveNoche = Date.UTC(2026, 10, 10, 1, 0, 0);
  assert.equal(listas.fechaNegocioVencida(ENTREGA, nueveNoche), false, 'a las 8 p. m. del 9 no está vencida');
  assert.equal(listas.fechaPorVencer(ENTREGA, 7, nueveNoche), true, 'y vence en 7 días o menos');
  const diezNoche = Date.UTC(2026, 10, 11, 4, 0, 0);   // las 11 p. m. del 10 en Colombia
  assert.equal(listas.fechaNegocioVencida(ENTREGA, diezNoche), false, 'el mismo día no está vencida');
  assert.equal(listas.fechaPorVencer(ENTREGA, 7, diezNoche), true, 'el mismo día, por vencer');
  const once = Date.UTC(2026, 10, 11, 15, 0, 0);
  assert.equal(listas.fechaNegocioVencida(ENTREGA, once), true, 'el 11 sí está vencida');
  assert.equal(listas.fechaPorVencer(ENTREGA, 7, once), false, 'vencida no es por vencer');
  // El plazo cuenta días de calendario, los dos bordes incluidos (hoy + 7), y es 7 por defecto.
  const tres = Date.UTC(2026, 10, 3, 15, 0, 0);
  const dos = Date.UTC(2026, 10, 2, 15, 0, 0);
  assert.equal(listas.fechaPorVencer(ENTREGA, 7, tres), true, 'justo 7 días');
  assert.equal(listas.fechaPorVencer(ENTREGA, 7, dos), false, '8 días ya no');
  assert.equal(listas.fechaPorVencer(ENTREGA, undefined, tres), true, '7 por defecto');
  assert.equal(listas.fechaPorVencer(ENTREGA, undefined, dos), false, 'por defecto, 8 días ya no');
  assert.equal(listas.fechaPorVencer(ENTREGA, 1, nueveNoche), true, 'mañana, con un plazo de 1');
  assert.equal(listas.fechaPorVencer('2026-12-31T00:00:00', 30, Date.UTC(2026, 11, 2, 15)), true, 'el plazo cruza el mes');
  for (const nada of [null, undefined, '', 'x', 5, '2026-02-30T00:00:00']) {
    assert.equal(listas.fechaPorVencer(nada, 7, once), false, String(nada));
    assert.equal(listas.fechaNegocioVencida(nada, once), false, String(nada));
  }
  // Sin `ahora`, el día de hoy del sistema.
  assert.equal(listas.fechaNegocioVencida('2000-01-01T00:00:00'), true);
  assert.equal(listas.fechaNegocioVencida('2999-01-01T00:00:00'), false);
  // Una fecha no es las dos cosas a la vez.
  for (const iso of ['2026-11-01T00:00:00', '2026-11-10T00:00:00', '2026-11-12T00:00:00', '2026-12-01T00:00:00']) {
    assert.ok(!(listas.fechaNegocioVencida(iso, once) && listas.fechaPorVencer(iso, 7, once)), iso);
  }
}

console.log('--- B4 T9 TEST 3 (r1, I1): marcaPedidoCotizacion y cotizacionSinPrecio — COT-LISTA en un solo lugar (tabla y tablero) ---');
{
  // La marca del pedido de una COT: «Pedido PVEN-…» (emerald) con un pedido vigente; «Pedido … cancelado» (rose) si todos
  // se cancelaron y el cliente no la volvió a confirmar (avisoCancelado, como el detalle); si no, null.
  const vigente = { id: 30, numero: 'PVEN-30', estado: 'EN_PROCESO' };
  const cancelado = { id: 31, numero: 'PVEN-31', estado: 'CANCELADO' };
  assert.deepEqual(listas.marcaPedidoCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [vigente] }), { texto: 'Pedido PVEN-30', tono: 'emerald' });
  assert.deepEqual(listas.marcaPedidoCotizacion({ estado: 'CONFIRMADA', pedidos_venta: [cancelado, vigente] }),
    { texto: 'Pedido PVEN-30', tono: 'emerald' }, 'con uno vigente manda el vigente');
  assert.deepEqual(listas.marcaPedidoCotizacion({ estado: 'BORRADOR', pedidos_venta: [cancelado] }),
    { texto: 'Pedido PVEN-31 cancelado', tono: 'rose' });
  assert.deepEqual(listas.marcaPedidoCotizacion({ estado: 'BORRADOR', pedidos_venta: [{ ...cancelado, numero: 'PVEN-29' }, cancelado] }),
    { texto: 'Pedido PVEN-31 cancelado', tono: 'rose' }, 'el último cancelado');
  assert.equal(listas.marcaPedidoCotizacion({ estado: 'CONFIRMADA', confirmacion_vigente: true, pedidos_venta: [cancelado] }), null,
    'el cliente la volvió a confirmar: sin la marca');
  assert.deepEqual(listas.marcaPedidoCotizacion({ estado: 'BORRADOR', pedidos_venta: [{ id: 31, estado: 'CANCELADO' }] }),
    { texto: 'Pedido cancelado', tono: 'rose' }, 'sin número, sin el espacio de más');
  for (const sin of [{ estado: 'BORRADOR', pedidos_venta: [] }, { estado: 'BORRADOR' }, null, undefined]) {
    assert.equal(listas.marcaPedidoCotizacion(sin), null, JSON.stringify(sin));
  }
  // «Sin precio»: el total no es mayor que 0 (o no viene), en cualquier estado (como la tabla de antes).
  for (const [total, esperado] of [[0, true], [null, true], [undefined, true], ['', true], ['x', true], [-5, true], [1, false], ['250000', false]]) {
    assert.equal(listas.cotizacionSinPrecio({ estado: 'RECHAZADA', total_cop: total }), esperado, String(total));
  }
  assert.equal(listas.cotizacionSinPrecio(null), true);
  // r2 (p2): el CHIP «Sin precio» también sale de aquí (texto y tono), para la columna Total, su title y el tablero.
  assert.deepEqual(listas.chipSinPrecio({ total_cop: 0 }), { texto: 'Sin precio', tono: 'amber' });
  assert.equal(listas.chipSinPrecio({ total_cop: 250000 }), null);
  for (const [total, esperado] of [[0, true], [null, true], ['x', true], [1, false]]) {
    assert.equal(listas.chipSinPrecio({ total_cop: total }) !== null, listas.cotizacionSinPrecio({ total_cop: total }), String(total));
    assert.equal(listas.chipSinPrecio({ total_cop: total }) !== null, esperado, String(total));
  }
  assert.notEqual(listas.chipSinPrecio({}), listas.chipSinPrecio({}), 'un objeto nuevo cada vez (nadie comparte uno mutable)');
}

console.log('--- B4 T9 TEST 4 (r1, m4): avisoSolicitudTrasRechazo — el rechazo dice lo mismo en el detalle y en el tablero ---');
{
  // B2 (test_rechazo_cotizacion_solicitud_activa): rechazar una COT que viene de una solicitud la deja activa. La frase
  // era del detalle (cotizacion/[id]); ahora es una sola y la usa también el ModalMotivo del tablero.
  assert.equal(listas.avisoSolicitudTrasRechazo({ sc_id: 5, sc_numero: 'SC-20260305' }),
    'La solicitud SC-20260305 seguirá activa y podrás crearle otra cotización.');
  assert.equal(listas.avisoSolicitudTrasRechazo({ sc_id: 5, sc_numero: '  ' }),
    'La solicitud de origen seguirá activa y podrás crearle otra cotización.', 'sin número, «de origen» (como el detalle)');
  assert.equal(listas.avisoSolicitudTrasRechazo({ sc_id: 5 }), 'La solicitud de origen seguirá activa y podrás crearle otra cotización.');
  for (const sinSC of [{ sc_id: null, sc_numero: 'SC-1' }, {}, null, undefined]) {
    assert.equal(listas.avisoSolicitudTrasRechazo(sinSC), null, JSON.stringify(sinSC));
  }
  const leerVentas = (r) => readFileSync(new URL(`../src/app/dashboard/ventas/${r}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // El detalle: la misma frase, de la constante, en la confirmación de «Marcar como Rechazada».
  const detalle = sinComentarios(leerVentas('cotizacion/[id]/page.tsx'));
  assert.match(detalle, /import \{[^}]*\bavisoSolicitudTrasRechazo\b[^}]*\} from '@\/lib\/listas-ventas';/);
  assert.ok(detalle.includes("mensaje: avisoSolicitudTrasRechazo(cotizacion) ?? 'La cotización queda como Rechazada.',"), 'el detalle');
  assert.ok(!detalle.includes('seguirá activa y podrás crearle otra cotización'), 'el detalle no la escribe a mano');
  // El tablero: con la COT de una SC, los efectos del ModalMotivo suman la frase.
  const lista = sinComentarios(leerVentas('cotizacion/cotizacion-client.tsx'));
  assert.match(lista, /efectos=\{\['La cotización pasa a Rechazada\.', avisoSolicitudTrasRechazo\(rechazando\.cot\), 'El motivo queda en la Actividad de la cotización\.'\]\s*\.filter\(\(e\): e is string => Boolean\(e\)\)\}/);
}

console.log('--- B4 T9: el cableado de la lista de Cotizaciones con el servidor (el patrón de T8; D27) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  // Solo el código (sin comentarios): un comentario puede citar lo que se fue.
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const lista = codigo.slice(codigo.indexOf('export default function CotizacionClient('));
  assert.ok(lista.length > 1000, 'se lee la lista');

  // Bloque 1 (R5, D40): el estado único y una sola llamada con los conteos y el resumen; nunca las 200 más recientes ni los
  // días de alerta de la Configuración (el atraso y los conteos son del servidor, R8).
  assert.match(codigo, /const ID_COT = 'ventas\.cotizaciones';/);
  assert.match(codigo, /const INICIAL_COT = \{ vista: 'activas', orden: 'atencion' \};/);
  assert.match(lista, /const \[estado, despachar, listo\] = useEstadoTabla\(ID_COT, INICIAL_COT\);/);
  assert.match(lista, /ruta: '\/ventas\/cotizaciones', estado, conConteos: true, conResumen: true, esperar: !listo, despachar,\s*extra: enKanban \? EXTRA_TABLERO : null,/);
  assert.match(codigo, /const EXTRA_TABLERO = \{ limit: 0 \};/);
  for (const viejo of ['limit=200', "'/ventas/config'", 'JSON.stringify(c)', 'pestanaCotizacion(', 'diasAlerta(', 'Date.now()', 'useVistaGuardada']) {
    assert.ok(!lista.includes(viejo), `la lista ya no usa ${viejo}`);
  }
  // m5 de T8: la llegada sin filas de Kanban deja la tabla y el total en «cargando» hasta que llega la página.
  assert.match(lista, /const llegadaAhora = llegadaDeListado\(llegada, listado\.crudo, enKanban\);\s*if \(llegadaAhora !== llegada\) setLlegada\(llegadaAhora\);/);
  assert.match(lista, /const sinPagina = !enKanban && llegadaAhora\.sinFilas && !listado\.error;/);
  assert.match(lista, /total=\{sinPagina \? null : listado\.total\}\s*cargando=\{listado\.cargandoInicial \|\| sinPagina\}/);
  assert.match(lista, /total: sinPagina \? null : listado\.total,\s*estadoTotal: estadoDelTotal\(\{\s*total: listado\.total, cargando: listado\.cargandoInicial \|\| sinPagina,/);
  // «Actualizar» recarga la tabla, el tablero y la franja.
  assert.match(lista, /const recargarLista = useCallback\(\(\) => \{\s*recargarListado\(\);\s*recargarTablero\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*\}, \[recargarListado, recargarTablero\]\);/);
  // r1 (A2): «Actualizar» es el de AccionesCabecera con recargarLista (ver el bloque 7, abajo).

  // Bloque 2 (H15, H17, m2 de T8): las 3 pestañas con los conteos del servidor (sin Análisis), el filtro con las opciones
  // de la pestaña (o del tablero en Kanban) y el conmutador con la poda de accionModo.
  assert.match(codigo, /\{ id: 'activas', etiqueta: 'Activas', conteo: conteos\?\.activas \?\? null \},\s*\{ id: 'confirmadas', etiqueta: 'Confirmadas', conteo: conteos\?\.confirmadas \?\? null \},\s*\{ id: 'rechazadas', etiqueta: 'Rechazadas', conteo: conteos\?\.rechazadas \?\? null \},\s*\];/);
  assert.ok(!/'Analisis'|'Análisis'/.test(lista), 'sin la pestaña Análisis');
  assert.match(lista, /<BarraTabla\s+estado=\{estado\}\s+onEstado=\{alCambiarBarra\}\s+pestanas=\{enKanban \? undefined : pestanas\}/);
  assert.match(lista, /opcionesEstados=\{enKanban \? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones\}/);
  assert.match(lista, /kanbanDisponible\n/);
  assert.match(lista, /if \(accion\.tipo === 'modo'\) \{\s*const modo = String\(accion\.valor\);\s*despachar\(accionModo\(estado, modo, modo === 'kanban' \? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones\)\);\s*\} else despachar\(accion\);/);
  // m8 de T8: el «vacío» memoizado (la búsqueda y la pestaña), con el enlace a Solicitudes en Activas.
  assert.match(lista, /const vacioLista = useMemo\(\(\) => \{[\s\S]*?Ir a Solicitudes para crear una COT[\s\S]*?\}, \[estado\.q, estado\.vista\]\);/);
  assert.match(lista, /vacio=\{vacioLista\}/);

  // Bloque 3 (R26, RP85, D41): la tabla estándar en el servidor con sus columnas; Anticipo y Entrega est. ocultas; «Ver»
  // siempre a la vista (sin opacity-0 ni group-hover) y el menú de la fila con «Abrir solicitud» y «Ver pedido».
  assert.match(lista, /<TablaEstandar\s+id=\{ID_COT\}\s+modo="servidor"\s+columnas=\{COLUMNAS_TABLA_COT\}/);
  assert.match(lista, /claseFila=\{claseDeFila\}/);
  assert.match(codigo, /const claseDeFila = \(cot: FilaCOT\) => \(cot\.resolucion === 'ATRASADO' \? `\$\{TABLE\.filaAlerta\} \$\{MARCA_ATRASO\}` : null\);/);
  const columnas = codigo.slice(codigo.indexOf('const COLUMNAS_TABLA_COT'), codigo.indexOf('\n];\n', codigo.indexOf('const COLUMNAS_TABLA_COT')));
  const ids = [...columnas.matchAll(/\{ id: '([a-z_]+)', titulo: '([^']+)', ancho: (\d+)/g)].map((m) => [m[1], m[2], Number(m[3])]);
  // R26 (banco): Cliente nace en 136 para que a 1024 px con el menú abierto quepan las columnas por defecto (RP85 daba 152).
  assert.deepEqual(ids, [['numero', 'COT / SC', 132], ['cliente', 'Cliente', 136], ['cotizador', 'Cotizador', 120], ['total', 'Total', 104],
    ['anticipo', 'Anticipo', 96], ['entrega', 'Entrega est.', 104], ['estado', 'Estado', 120], ['acciones', 'Acciones', 88]]);
  assert.match(columnas, /\{ id: 'numero', [^\n]*clave: true, fija: 'izquierda'/);
  assert.match(columnas, /\{ id: 'cliente', [^\n]*flexible: true/);
  assert.match(columnas, /\{ id: 'anticipo', [^\n]*ocultaPorDefecto: true/);
  assert.match(columnas, /\{ id: 'entrega', [^\n]*ocultaPorDefecto: true/);
  assert.match(columnas, /\{ id: 'estado', [^\n]*clave: true/);
  assert.match(columnas, /\{ id: 'acciones', [^\n]*clave: true, fija: 'derecha'/);
  // Banco (T9): el Cotizador y el Anticipo con la letra de las demás celdas (text-xs), y «-» sin cotizador.
  assert.match(columnas, /\{ id: 'cotizador', [^\n]*\n\s*celda: \(cot\) => <span className="block truncate text-xs[^"]*">\{cot\.cotizador \|\| '-'\}<\/span> \}/);
  assert.match(columnas, /\{ id: 'anticipo', [^\n]*\n[^\n]*\n\s*celda: \(cot\) => <span className="block truncate text-xs[^"]*">\{fCOP\(cot\.anticipo_cop\)\}<\/span> \}/);
  assert.equal((columnas.match(/ocultaPorDefecto: true/g) ?? []).length, 2, 'solo Anticipo y Entrega est. salen ocultas (R26)');
  const visibles = ids.filter(([id]) => !['anticipo', 'entrega'].includes(id)).reduce((s, [, , ancho]) => s + ancho, 0);
  assert.ok(visibles <= 704, `las columnas por defecto suman ${visibles} px: caben en los 704 de la caja a 1024 px`);
  const acciones = codigo.slice(codigo.indexOf('function CeldaAcciones('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaAcciones(')));
  assert.match(acciones, /aria-label=\{`Ver \$\{cot\.numero\}`\}/);
  assert.ok(!/opacity-0|group-hover/.test(acciones) && !codigo.includes('MoreVertical'), '«Ver» siempre visible; sin el ⋮ sin acción');
  assert.match(acciones, /\{ etiqueta: 'Abrir solicitud', [^\n]*oculto: !solicitud \}/);
  assert.match(acciones, /\{ etiqueta: 'Ver pedido', [^\n]*oculto: !enlacePedido \}/);
  assert.match(acciones, /<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{cot\.numero\}`\} \/>/);
  assert.match(acciones, /enlaceDocumento\('SC', cot\.sc_id, \{ returnTo: RUTA_LISTA_COTIZACIONES \}\)/);
  assert.match(acciones, /const pedido = pedidoVigente\(cot\);/);
  // COT-LISTA: «Pedido …» o «Pedido … cancelado» debajo del número. r1 (I1): con marcaPedidoCotizacion (listas-ventas.js,
  // TEST 3), la MISMA regla de la tarjeta del tablero; la pantalla ya no tiene una copia.
  const celdaNumero = codigo.slice(codigo.indexOf('function CeldaNumero('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaNumero(')));
  assert.match(celdaNumero, /const marca = marcaPedidoCotizacion\(cot\);/);
  assert.match(celdaNumero, /\{marca && <span className=\{`[^`]*\$\{TEXTO_MARCA\[marca\.tono\]\}`\}>\{marca\.texto\}<\/span>\}/);
  assert.match(codigo, /const TEXTO_MARCA: Record<'emerald' \| 'rose', string> = \{ emerald: 'text-emerald-700', rose: 'text-rose-600' \};/);
  assert.match(codigo, /const tituloNumero = \(cot: FilaCOT\) =>\s*\[cot\.numero, cot\.sc_numero \? `SC: \$\{cot\.sc_numero\}` : null, marcaPedidoCotizacion\(cot\)\?\.texto\]/);
  assert.ok(!/function marcaPedido\(|soloPedidosCancelados\(|situacionPedidoCotizacion\(/.test(codigo), 'sin la regla copiada en la pantalla');
  // «Sin precio» de la columna Total: r2 (p2) el MISMO chip del tablero (chipSinPrecio de listas-ventas.js), con su texto
  // y su tono, en la celda y en el title; la pantalla ya no escribe ni el texto ni el tono.
  const celdaTotal = codigo.slice(codigo.indexOf('function CeldaTotal('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaTotal(')));
  assert.match(celdaTotal, /const chip = chipSinPrecio\(cot\);/);
  assert.match(celdaTotal, /\{chip && <span className=\{`\$\{CHIP\} text-\[10px\] \$\{CLASE_CHIP\[chip\.tono\] \?\? CLASE_CHIP\.slate\}`\}>\{chip\.texto\}<\/span>\}/);
  assert.match(codigo, /titleCelda: \(cot\) => \[fCOP\(cot\.total_cop\), chipSinPrecio\(cot\)\?\.texto\]\.filter\(Boolean\)\.join\(' · '\)/);
  assert.ok(!codigo.includes("'Sin precio'") && !codigo.includes('>Sin precio<'), 'la pantalla no escribe «Sin precio»');
  // La Entrega est. con las reglas de la librería (antes isOverdue / isExpiringSoon en la pantalla). r1 (I2): como día de
  // calendario (diaDeNegocio y fechaSolo), con fechaNegocioVencida y fechaPorVencer; nunca fechaVencida (instantes).
  assert.match(codigo, /const vencida = fechaNegocioVencida\(cot\.fecha_entrega_estimada\);\s*const porVencer = !vencida && fechaPorVencer\(cot\.fecha_entrega_estimada\);/);
  assert.ok(codigo.includes("{fechaCorta(diaDeNegocio(cot.fecha_entrega_estimada)) || '-'}"), 'la celda: el día de calendario');
  assert.ok(codigo.includes("titleCelda: (cot) => fechaSolo(cot.fecha_entrega_estimada) || 'Sin fecha de entrega'"), 'el title: el mismo día');
  assert.ok(!/fechaVencida|fechaLarga/.test(codigo), 'ni fechaVencida ni fechaLarga con la fecha de entrega');
  assert.ok(!/isOverdue|isExpiringSoon/.test(codigo), 'sin las reglas de fecha en la pantalla');

  // Bloque 5 (RP19): las 4 tarjetas con el resumen de la misma llamada; las 3 primeras son vistas y el total no.
  assert.match(lista, /const tarjetas = tarjetasCotizaciones\(listado\.resumen\);/);
  assert.match(lista, /<TarjetaKpi kpi="cot_activas" valor=\{tarjetas\?\.activas\.valor \?\? null\} ayuda=\{tarjetas\?\.activas\.ayuda\}\s*activo=\{vistaActiva === 'activas'\} onClick=\{\(\) => elegirVista\('activas'\)\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="cot_confirmadas" valor=\{tarjetas\?\.confirmadas\.valor \?\? null\} ayuda=\{tarjetas\?\.confirmadas\.ayuda\}\s*activo=\{vistaActiva === 'confirmadas'\} onClick=\{\(\) => elegirVista\('confirmadas'\)\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="cot_monto_confirmado" valor=\{tarjetas\?\.monto_confirmado\.valor \?\? null\} ayuda=\{tarjetas\?\.monto_confirmado\.ayuda\}\s*activo=\{vistaActiva === 'confirmadas'\} onClick=\{\(\) => elegirVista\('confirmadas'\)\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="cot_total" valor=\{tarjetas\?\.total\.valor \?\? null\} ayuda=\{tarjetas\?\.total\.ayuda\} \/>/);
  assert.ok(!/StatCard|variant="gradient"/.test(codigo), 'sin StatCard ni la variante gradient');
  assert.match(lista, /despachar\(accionPestana\(estado, siguiente, opcionesEstadosCotizaciones\)\);\s*if \(enKanban\) despachar\(\{ tipo: 'modo', valor: 'lista' \}\);/);

  // Bloque 6 (D42, RP89, RP90): la franja con «Estás aquí» en Cotización, sin noResueltos, con los avisos del resumen; se
  // fue el aviso ámbar suelto.
  assert.match(lista, /<BannerFlujo\s+titulo="Flujo comercial"\s+idPreferencia=\{ID_COT\}/);
  assert.match(lista, /const pasosFlujo = useMemo\(\(\) => pasosDeLista\(flujo\.datos, 'COT'\), \[flujo\.datos\]\);/);
  assert.match(lista, /semaforo=\{\{ atrasados: atrasadosCOT, filtro: filtroSemaforo, onFiltrar: alFiltrarSemaforo \}\}/);
  // El botón «Con atraso» queda pulsado con el filtro del estado único (y «Ver todo» sin él).
  assert.match(lista, /const filtroSemaforo: FiltroSemaforo = estado\.semaforo === 'atrasados' \? 'atrasados' : 'todos';/);
  assert.match(lista, /const atrasadosCOT = pasosFlujo\.find\(\(p\) => p\.esEste\)\?\.atrasados \?\? null;/);
  assert.ok(!lista.includes('noResueltos'), 'sin la clave noResueltos');
  assert.match(lista, /const avisosFlujo = useMemo\(\(\) => avisosCotizaciones\(listado\.resumen\), \[listado\.resumen\]\);/);
  assert.match(lista, /avisos=\{avisosFlujo\}/);
  assert.ok(!/ATENCIÓN|ShieldAlert/.test(codigo), 'sin el aviso ámbar de antes');
  assert.match(lista, /subtitle="Precios y anticipo para el cliente; al confirmar se crea el pedido\."/);
  // «Con atraso» desde Rechazadas abre Activas, también en Kanban (r2b de T8), con la poda del modo que se ve.
  assert.match(codigo, /const VISTAS_SIN_ATRASO = \['rechazadas'\];/);
  assert.match(lista, /const alFiltrarSemaforo = \(f: FiltroSemaforo\) => \{\s*if \(f !== 'todos' && VISTAS_SIN_ATRASO\.includes\(estado\.vista \?\? ''\)\) \{\s*despachar\(accionPestana\(estado, INICIAL_COT\.vista, enKanban \? OPCIONES_ESTADOS_TABLERO_COT : opcionesEstadosCotizaciones\)\);\s*\}\s*despachar\(\{ tipo: 'semaforo', valor: f === 'todos' \? null : f \}\);\s*\};/);
  {
    const { estadoTablaInicial, reducirEstadoTabla, accionPestana, accionModo } = await import('../src/lib/tabla.js');
    const { opcionesEstadosCotizaciones, OPCIONES_ESTADOS_TABLERO_COT } = await import('../src/lib/kanban-ventas.js');
    // Kanban desde Rechazadas con «Rechazada» en el filtro del tablero, y «Con atraso».
    const enKanban = estadoTablaInicial({ vista: 'rechazadas', modo: 'kanban', estados: ['RECHAZADA'] });
    const salto = reducirEstadoTabla(enKanban, accionPestana(enKanban, 'activas', OPCIONES_ESTADOS_TABLERO_COT));
    const conAtraso = reducirEstadoTabla(salto, { tipo: 'semaforo', valor: 'atrasados' });
    assert.deepEqual([conAtraso.vista, conAtraso.modo, conAtraso.semaforo, conAtraso.estados], ['activas', 'kanban', 'atrasados', ['RECHAZADA']],
      'Activas, el filtro del tablero se queda');
    // Al volver a Lista (accionModo con las opciones de la Lista), RECHAZADA se poda: no está en Activas.
    const enLista = reducirEstadoTabla(conAtraso, accionModo(conAtraso, 'lista', opcionesEstadosCotizaciones));
    assert.deepEqual([enLista.vista, enLista.modo, enLista.semaforo, enLista.estados], ['activas', 'lista', 'atrasados', []]);
    // En Lista, de Rechazadas con «Rechazada» filtrada: Activas y sin ese filtro.
    const lista0 = estadoTablaInicial({ vista: 'rechazadas', estados: ['RECHAZADA'] });
    const enActivas = reducirEstadoTabla(lista0, accionPestana(lista0, 'activas', opcionesEstadosCotizaciones));
    assert.deepEqual([enActivas.vista, enActivas.estados], ['activas', []]);
  }

  // Bloque 7 (R13): «Ver análisis» al Hub enfocado en Cotizaciones, y el contenedor con pb-24 (el botón de la IA). r1 (A2):
  // los botones de la cabecera viven en AccionesCabecera, los mismos del esqueleto del Suspense.
  const cabecera = codigo.slice(codigo.indexOf('export function AccionesCabecera('), codigo.indexOf('\n}\n', codigo.indexOf('export function AccionesCabecera(')));
  assert.ok(cabecera.length > 100, 'AccionesCabecera exportada');
  assert.match(lista, /actions=\{<AccionesCabecera onActualizar=\{recargarLista\} actualizando=\{actualizando\} \/>\}/);
  assert.match(cabecera, /<button type="button" onClick=\{onActualizar\}[^>]*>\s*<RefreshCw [^>]*className=\{actualizando \? 'animate-spin' : ''\}\/> Actualizar/);
  assert.match(cabecera, /<Link href=\{enlaceVerAnalisis\('cot'\)\}/);
  assert.match(cabecera, /<ContenidoEnlace icon=\{BarChart3\}>Ver análisis<\/ContenidoEnlace>/);
  assert.match(codigo, /export const CONTENEDOR_LISTA = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-\[1600px\] mx-auto w-full min-w-0 gap-6';/);
  assert.ok(lista.includes('<div className={CONTENEDOR_LISTA}>'), 'la lista usa el contenedor');
  // Lo de los Bloques 1 a 3 que se queda: la redirección de ?id= y «Nueva desde SC».
  assert.match(lista, /router\.replace\(`\/dashboard\/ventas\/cotizacion\/\$\{numId\}`\)/);
  assert.match(cabecera, /<Link href="\/dashboard\/ventas\/solicitud" [^>]*>\s*<Plus [^>]*\/> Nueva desde SC/);
}

console.log('--- B4 T9 r1 (A2): el esqueleto del Suspense de Cotizaciones arma la lista con sus MISMAS piezas ---');
{
  const ruta = (r) => new URL(`../src/app/dashboard/ventas/cotizacion/${r}`, import.meta.url);
  assert.ok(existsSync(ruta('CargandoCotizaciones.tsx')), 'existe cotizacion/CargandoCotizaciones.tsx');
  const leerCot = (r) => readFileSync(ruta(r), 'utf8').replace(/\r\n/g, '\n');
  const carga = leerCot('CargandoCotizaciones.tsx');
  const pagina = leerCot('page.tsx');
  const lista = leerCot('cotizacion-client.tsx');
  // page.tsx: el fallback del Suspense es el esqueleto, no el «Cargando...» centrado en h-screen.
  assert.match(pagina, /import \{ CargandoCotizaciones \} from '\.\/CargandoCotizaciones';/);
  assert.ok(pagina.includes('<Suspense fallback={<CargandoCotizaciones />}>'), 'el fallback del Suspense');
  assert.ok(!pagina.includes('h-screen'), 'sin el «Cargando...» de toda la pantalla');
  // Las piezas son las de la lista (importadas, no copiadas): el contenedor, la cabecera, las pestañas, las columnas que
  // el usuario guardó, el estado inicial y la franja con «Estás aquí» en Cotización.
  assert.match(carga, /AccionesCabecera, COLUMNAS_TABLA_COT, CONTENEDOR_LISTA, ID_COT, INICIAL_COT, pestanasDeLaLista,\s*\} from '\.\/cotizacion-client';/);
  for (const nombre of ['ID_COT', 'INICIAL_COT', 'CONTENEDOR_LISTA', 'COLUMNAS_TABLA_COT']) {
    assert.match(lista, new RegExp(`\\nexport const ${nombre}\\b`), `${nombre} exportado`);
  }
  assert.match(lista, /\nexport function pestanasDeLaLista\(/);
  assert.match(lista, /\nexport function AccionesCabecera\(/);
  assert.ok(carga.includes('<div className={CONTENEDOR_LISTA}>'), 'el contenedor de la lista');
  assert.ok(carga.includes("pasos={pasosDeLista(null, 'COT')}"), 'la franja con las cajas de la lista');
  assert.ok(carga.includes('idPreferencia={ID_COT}'), 'el modo compacto de la franja de la lista');
  assert.ok(carga.includes('const prefs = usePreferenciasTabla(ID_COT, COLUMNAS_TABLA_COT);'), 'las columnas que el usuario guardó');
  assert.ok(carga.includes('const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_COT);'), 'el estado inicial de la lista');
  assert.ok(carga.includes('const PESTANAS_CARGANDO = pestanasDeLaLista(null);'), 'las pestañas, cargando');
  assert.ok(carga.includes('<AccionesCabecera onActualizar={nada} actualizando={false} />'), 'la cabecera mide lo mismo');
  assert.ok(carga.includes('subtitle="Precios y anticipo para el cliente; al confirmar se crea el pedido."'), 'el mismo subtítulo');
  // Las 4 tarjetas de la lista, cargando, con los mismos botones (la de las activas, activa: la vista inicial).
  assert.match(carga, /<TarjetaKpi kpi="cot_activas" valor=\{null\} activo onClick=\{nada\} \/>\s*<TarjetaKpi kpi="cot_confirmadas" valor=\{null\} onClick=\{nada\} \/>\s*<TarjetaKpi kpi="cot_monto_confirmado" valor=\{null\} onClick=\{nada\} \/>\s*<TarjetaKpi kpi="cot_total" valor=\{null\} \/>/);
  assert.ok(carga.includes('placeholder="Buscar por número, cliente, cotizador, solicitud, pedido o producto…"'), 'la misma búsqueda');
  assert.ok(lista.includes('placeholder="Buscar por número, cliente, cotizador, solicitud, pedido o producto…"'), 'la de la lista');
  // r2 (p1): todo inerte, atributo por atributo y sin contar los comentarios (antes se contaba el archivo con ellos).
  afirmarEsqueletoInerte(carga, 'Cargando las cotizaciones…', 'CargandoCotizaciones');
}

console.log('--- B4 T10 TEST 1: tarjetasPedidos — las 4 tarjetas de Pedidos con los kpis de /ventas/stats (RP19, D5) ---');
{
  // RP19 (2) y D5: las tarjetas de Pedidos leen `kpis` de GET /ventas/stats (no el resumen de H47 de la lista): así
  // «Saldo por cobrar» es el de R7 (Σ max(0, saldo)), el mismo del Hub. Las ayudas, las de H47: el total con los activos
  // (en curso) y los cancelados; el monto y el saldo sin cancelados ni devueltos; pendientes de compra, «Falta comprar».
  const kpis = {
    pven_total: 27, pven_en_curso: 15, pven_cancelados: 12, pven_pendiente_compra: 4, pven_monto_vendido: 4927538.4,
    pven_saldo_por_cobrar: 300000, pven_saldo_en_curso: 1, pven_anticipo: 2,
  };
  assert.deepEqual(listas.tarjetasPedidos(kpis), {
    total: { valor: 27, ayuda: '15 activos · 12 cancelados' },
    monto_vendido: { valor: 4927538, ayuda: 'Sin pedidos cancelados ni devueltos' },
    pendiente_compra: { valor: 4, ayuda: 'Falta comprar' },
    saldo_por_cobrar: { valor: 300000, ayuda: 'Sin pedidos cancelados ni devueltos' },
  });
  const t = (cambios) => listas.tarjetasPedidos({ ...kpis, ...cambios });
  assert.equal(t({ pven_cancelados: 0 }).total.ayuda, '15 activos', 'sin cancelados no se dicen');
  assert.equal(t({ pven_en_curso: 1, pven_cancelados: 1 }).total.ayuda, '1 activo · 1 cancelado', 'el singular');
  assert.equal(t({ pven_en_curso: null, pven_cancelados: 2 }).total.ayuda, '2 cancelados');
  assert.equal(t({ pven_en_curso: undefined, pven_cancelados: undefined }).total.ayuda, null, 'sin números, sin ayuda');
  // Montos en pesos enteros (el servidor los manda como float); lo que no es un número, null («—»), nunca un 0 inventado.
  assert.equal(t({ pven_saldo_por_cobrar: 0 }).saldo_por_cobrar.valor, 0);
  for (const malo of ['300000', null, undefined, NaN, Infinity]) {
    assert.equal(t({ pven_saldo_por_cobrar: malo }).saldo_por_cobrar.valor, null, String(malo));
    assert.equal(t({ pven_monto_vendido: malo }).monto_vendido.valor, null, String(malo));
  }
  for (const malo of [-1, 2.5, '4', null]) assert.equal(t({ pven_total: malo }).total.valor, null, String(malo));
  // Sin kpis (cargando o con error): null, la franja pinta las barras grises o «—».
  for (const nada of [null, undefined, 'x', 3, []]) assert.equal(listas.tarjetasPedidos(nada), null, String(nada));
}

console.log('--- B4 T10 TEST 2: alertaEntregaPedido — la Entrega est. del pedido es un DÍA de calendario (también a las 00:00) ---');
{
  // La lección de T9 r1 (I2): fecha_entrega_estimada es una fecha de negocio. Se pinta su día (diaDeNegocio) y «vencida»
  // y «por vencer» comparan con el día de hoy en Colombia (fechaNegocioVencida y fechaPorVencer, nunca fechaVencida). Un
  // pedido ya cerrado (Entregado, Facturado, Cancelado o Devuelto) no lleva alerta: su entrega ya no se espera.
  const ENTREGA = '2026-11-10T00:00:00';
  const nueveNoche = Date.UTC(2026, 10, 10, 1, 0, 0);   // las 8 p. m. del 9 en Colombia (la 1 a. m. UTC del 10)
  const diezNoche = Date.UTC(2026, 10, 11, 4, 0, 0);    // las 11 p. m. del 10
  const once = Date.UTC(2026, 10, 11, 15, 0, 0);
  const p = (estado, fecha = ENTREGA) => ({ estado, fecha_entrega_estimada: fecha });
  assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO'), nueveNoche), 'por_vencer', 'a las 8 p. m. del 9: por vencer, no vencida');
  assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO'), diezNoche), 'por_vencer', 'el mismo día: por vencer');
  assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO'), once), 'vencida', 'el 11: vencida');
  assert.equal(listas.alertaEntregaPedido(p('LISTO_ENTREGA', '2026-11-30T00:00:00'), once), null, 'lejos: nada');
  for (const cerrado of ['ENTREGADO', 'FACTURADO', 'CANCELADO', 'DEVUELTO_TOTAL']) {
    assert.equal(listas.alertaEntregaPedido(p(cerrado), once), null, cerrado);
    assert.equal(listas.alertaEntregaPedido(p(cerrado), nueveNoche), null, cerrado);
  }
  for (const sinFecha of [null, '', 'x', '2026-02-30T00:00:00']) assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO', sinFecha), once), null, String(sinFecha));
  for (const nada of [null, undefined, 'x']) assert.equal(listas.alertaEntregaPedido(nada, once), null, String(nada));
  // Es la misma regla de la Entrega est. de Cotizaciones (las dos funciones de la lib), no una copia.
  for (const ahora of [nueveNoche, diezNoche, once]) {
    const esperado = listas.fechaNegocioVencida(ENTREGA, ahora) ? 'vencida' : listas.fechaPorVencer(ENTREGA, 7, ahora) ? 'por_vencer' : null;
    assert.equal(listas.alertaEntregaPedido(p('PENDIENTE_COMPRA'), ahora), esperado);
  }
  // Sin `ahora`, el día de hoy del sistema.
  assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO', '2000-01-01T00:00:00')), 'vencida');
  assert.equal(listas.alertaEntregaPedido(p('EN_PROCESO', '2999-01-01T00:00:00')), null);
}

console.log('--- B4 T10: el cableado de la lista de Pedidos de venta con el servidor (el patrón de T8 y T9; D27) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/venta/venta-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  // Solo el código (sin comentarios): un comentario puede citar lo que se fue.
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const lista = codigo.slice(codigo.indexOf('export default function VentaClient('));
  assert.ok(lista.length > 1000, 'se lee la lista');

  // Bloque 1 (R5, D40, RP26): el estado único y una sola llamada con los conteos; nunca los 200 más recientes ni lo que
  // se contaba, filtraba o sumaba en el navegador.
  assert.match(codigo, /export const ID_PEDIDOS = 'ventas\.pedidos';/);
  assert.match(codigo, /export const INICIAL_PEDIDOS = \{ vista: 'todos', orden: 'atencion' \};/);
  assert.match(lista, /const \[estado, despachar, listo\] = useEstadoTabla\(ID_PEDIDOS, INICIAL_PEDIDOS\);/);
  assert.match(lista, /ruta: '\/ventas\/pedidos', estado, conConteos: true, esperar: !listo, despachar,\s*extra: enKanban \? EXTRA_TABLERO : null,/);
  assert.match(codigo, /const EXTRA_TABLERO = \{ limit: 0 \};/);
  for (const viejo of ['limit=200', 'kpisPedidos', 'hintTotalPedidos', 'opcionesFiltroEstado', 'grupoPedido(', 'coincideProducto',
    'useVistaGuardada', 'StatCard', "'Analisis'", 'filtered', 'setCurrentPage', 'MoreHorizontal', '<table']) {
    assert.ok(!codigo.includes(viejo), `la lista ya no usa ${viejo}`);
  }
  // m5 de T8: la llegada sin filas de Kanban deja la tabla y el total en «cargando» hasta que llega la página.
  assert.match(lista, /const llegadaAhora = llegadaDeListado\(llegada, listado\.crudo, enKanban\);\s*if \(llegadaAhora !== llegada\) setLlegada\(llegadaAhora\);/);
  assert.match(lista, /const sinPagina = !enKanban && llegadaAhora\.sinFilas && !listado\.error;/);
  assert.match(lista, /total=\{sinPagina \? null : listado\.total\}\s*cargando=\{listado\.cargandoInicial \|\| sinPagina\}/);
  assert.match(lista, /total: sinPagina \? null : listado\.total,\s*estadoTotal: estadoDelTotal\(\{\s*total: listado\.total, cargando: listado\.cargandoInicial \|\| sinPagina,/);
  // Las tarjetas (RP19 (2), D5): los kpis de /ventas/stats?periodo=30d, la llamada del Hub; 'cargando' hasta que llegan.
  assert.match(lista, /apiFetch\(`\/ventas\/stats\?periodo=\$\{PERIODO_KPI\}`, \{ signal: control\.signal \}\)/);
  assert.match(lista, /const cargandoStats = stats\?\.vuelta !== vueltaStats;\s*const estadoKpis = useEstadoKpi\(cargandoStats, cargandoStats \? null : \(stats\?\.error \?\? null\)\);/);
  assert.match(lista, /const tarjetas = tarjetasPedidos\(stats\?\.datos\?\.kpis \?\? null\);/);
  // «Actualizar» recarga la tabla, el tablero, la franja y las tarjetas; tras un cambio, lo que el cambio mueve.
  assert.match(lista, /const recargarLista = useCallback\(\(\) => \{\s*recargarListado\(\);\s*recargarTablero\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*setVueltaStats\(\(n\) => n \+ 1\);\s*\}, \[recargarListado, recargarTablero\]\);/);
  assert.match(lista, /const recargarTrasCambio = useCallback\(\(\) => \{\s*recargarListado\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*setVueltaStats\(\(n\) => n \+ 1\);\s*\}, \[recargarListado\]\);/);
  assert.match(lista, /actions=\{<AccionesCabecera onActualizar=\{recargarLista\} actualizando=\{actualizando\} \/>\}/);
  // RP21: ?tab= al montar, con window.location en el efecto, una sola vez, como un clic en la pestaña; después se quita.
  assert.match(lista, /const vista = leerEnlacePedidos\(window\.location\.search\);\s*if \(!vista\) return;\s*despachar\(accionPestana\(estado, vista, opcionesEstadosPedidos\)\);\s*router\.replace\(rutaSinParametro\(RUTA_LISTA_PEDIDOS, window\.location\.search, 'tab'\), \{ scroll: false \}\);/);
  assert.match(lista, /if \(enlaceLeido\.current\) return;\s*enlaceLeido\.current = true;/);
  // Lo de B1 que se queda: la redirección de ?id=.
  assert.match(lista, /router\.replace\(`\/dashboard\/ventas\/venta\/\$\{numId\}`\)/);

  // Bloque 2 (H15, H17, RP21, m2 de T8): las 7 pestañas (las vistas de T6B) con los conteos del servidor, sin Análisis;
  // el filtro con las opciones de la pestaña (o del tablero en Kanban) y el conmutador con la poda de accionModo.
  assert.match(codigo, /\{ id: 'todos', etiqueta: 'Todos', conteo: conteos\?\.todos \?\? null \},\s*\{ id: 'pend_compra', etiqueta: 'Pend\. Compra', conteo: conteos\?\.pend_compra \?\? null \},\s*\{ id: 'en_proceso', etiqueta: 'En Proceso', conteo: conteos\?\.en_proceso \?\? null \},\s*\{ id: 'listo_entrega', etiqueta: 'Listo Entrega', conteo: conteos\?\.listo_entrega \?\? null \},\s*\{ id: 'entregado', etiqueta: 'Entregado', conteo: conteos\?\.entregado \?\? null \},\s*\{ id: 'facturado', etiqueta: 'Facturado', conteo: conteos\?\.facturado \?\? null \},\s*\{ id: 'cancelado', etiqueta: 'Cancelado', conteo: conteos\?\.cancelado \?\? null \},\s*\];/);
  {
    // Las pestañas son las vistas de la lista que lee ?tab= (leerEnlacePedidos) y las columnas del tablero, más Todos.
    const { leerEnlacePedidos } = await import('../src/lib/flujo-ventas.js');
    const { COLUMNAS_PEDIDO } = await import('../src/lib/kanban-ventas.js');
    const ids = [...codigo.slice(codigo.indexOf('export function pestanasDeLaLista(')).matchAll(/\{ id: '([a-z_]+)', etiqueta/g)].slice(0, 7).map((m) => m[1]);
    assert.deepEqual(ids, ['todos', ...COLUMNAS_PEDIDO.map((c) => c.clave)]);
    for (const id of ids) assert.equal(leerEnlacePedidos(`?tab=${id}`), id, id);
  }
  // Los conteos de las pestañas son los de la MISMA llamada de la lista (con_conteos).
  assert.match(lista, /const pestanas = pestanasDeLaLista\(listado\.conteos as ConteosPedidos \| null\);/);
  assert.match(lista, /<BarraTabla\s+estado=\{estado\}\s+onEstado=\{alCambiarBarra\}\s+pestanas=\{enKanban \? undefined : pestanas\}/);
  assert.match(lista, /opcionesEstados=\{enKanban \? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesEstadosPedidos\}/);
  assert.match(lista, /kanbanDisponible\n/);
  assert.match(lista, /if \(accion\.tipo === 'modo'\) \{\s*const modo = String\(accion\.valor\);\s*despachar\(accionModo\(estado, modo, modo === 'kanban' \? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesEstadosPedidos\)\);\s*\} else despachar\(accion\);/);
  assert.match(lista, /const vacioLista = useMemo\(\(\) => \{[\s\S]*?Los pedidos se crean al convertir una cotización confirmada por el cliente\.[\s\S]*?\}, \[estado\.q\]\);/);
  assert.match(lista, /vacio=\{vacioLista\}/);

  // Bloque 3 (R26, RP85, D41): la tabla estándar en el servidor con sus columnas y la selección de B1; Anticipo y Entrega
  // est. ocultas.
  assert.match(lista, /<TablaEstandar\s+id=\{ID_PEDIDOS\}\s+modo="servidor"\s+columnas=\{COLUMNAS_TABLA_PEDIDOS\}/);
  assert.match(lista, /claseFila=\{claseDeFila\}/);
  assert.match(lista, /seleccion=\{seleccion\}\s+onSeleccion=\{alSeleccionar\}/);
  assert.match(codigo, /const claseDeFila = \(p: FilaPedido\) => \(p\.resolucion === 'ATRASADO' \? `\$\{TABLE\.filaAlerta\} \$\{MARCA_ATRASO\}` : null\);/);
  const columnas = codigo.slice(codigo.indexOf('export const COLUMNAS_TABLA_PEDIDOS'), codigo.indexOf('\n];\n', codigo.indexOf('export const COLUMNAS_TABLA_PEDIDOS')));
  const ids = [...columnas.matchAll(/\{ id: '([a-z_]+)', titulo: '([^']+)', ancho: (\d+)/g)].map((m) => [m[1], m[2], Number(m[3])]);
  assert.deepEqual(ids.map(([id, titulo]) => [id, titulo]), [['numero', 'Pedido / Origen'], ['cliente', 'Cliente'], ['total', 'Total'],
    ['anticipo', 'Anticipo'], ['saldo', 'Saldo'], ['entrega', 'Entrega est.'], ['estado', 'Estado'], ['acciones', 'Acciones']]);
  const ancho = Object.fromEntries(ids.map(([id, , a]) => [id, a]));
  assert.deepEqual([ancho.numero, ancho.total, ancho.anticipo, ancho.saldo, ancho.entrega, ancho.estado, ancho.acciones], [132, 112, 104, 104, 104, 128, 56]);
  assert.ok(ancho.cliente >= 120 && ancho.cliente <= 152, `Cliente entre 120 y 152 (RP85, R26): ${ancho.cliente}`);
  // R26 (banco de T10): a 1024 px con el menú abierto la caja de la tabla deja 704 px (con su barra vertical). Acciones
  // conserva los 56 del diseño (sin anchoMin la tabla la sube a ANCHO_MIN, 64) y Cliente nace en 132: con la casilla
  // (ANCHO_SELECCION) las columnas por defecto suman 704 y caben sin correr la tabla.
  assert.equal(ancho.cliente, 132, 'Cliente nace en 132 (medido en el banco)');
  assert.match(columnas, /\{ id: 'acciones', titulo: 'Acciones', ancho: 56, anchoMin: 56, /);
  const { ANCHO_SELECCION, ANCHO_MIN } = await import('../src/lib/tabla.js');
  assert.ok(ancho.acciones < ANCHO_MIN, 'sin su anchoMin, Acciones subiría al mínimo de la tabla');
  const visibles = ids.filter(([id]) => !['anticipo', 'entrega'].includes(id)).reduce((s, [, , a]) => s + a, ANCHO_SELECCION);
  assert.ok(visibles <= 704, `las columnas por defecto suman ${visibles} px: caben en los 704 de la caja a 1024 px`);
  assert.match(columnas, /\{ id: 'numero', [^\n]*clave: true, fija: 'izquierda'/);
  assert.match(columnas, /\{ id: 'cliente', [^\n]*flexible: true/);
  assert.match(columnas, /\{ id: 'anticipo', [^\n]*ocultaPorDefecto: true/);
  assert.match(columnas, /\{ id: 'entrega', [^\n]*ocultaPorDefecto: true/);
  assert.match(columnas, /\{ id: 'estado', [^\n]*clave: true/);
  assert.match(columnas, /\{ id: 'acciones', [^\n]*clave: true, fija: 'derecha'/);
  assert.equal((columnas.match(/ocultaPorDefecto: true/g) ?? []).length, 2, 'solo Anticipo y Entrega est. salen ocultas (R26)');
  // Saldo (H47) y su title con el MISMO dato del chip de la tarjeta (saldoVisiblePedido); «—» si no suma dinero.
  const celdaSaldo = codigo.slice(codigo.indexOf('function CeldaSaldo('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaSaldo(')));
  assert.match(celdaSaldo, /const saldo = saldoVisiblePedido\(p\);\s*if \(saldo === null\) return <span[^>]*>—<\/span>;/);
  assert.match(columnas, /titleCelda: \(p\) => \{ const s = saldoVisiblePedido\(p\); return s === null \?/);
  assert.ok(!codigo.includes('pedidoSumaDinero'), 'la regla del saldo es la de la lib, no una copia');
  // Entrega est.: día de calendario (diaDeNegocio, fechaSolo) y la alerta de la lib; nunca fechaVencida ni fechaLarga.
  const celdaEntrega = codigo.slice(codigo.indexOf('function CeldaEntrega('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaEntrega(')));
  assert.match(celdaEntrega, /const alerta = alertaEntregaPedido\(p\);/);
  assert.ok(celdaEntrega.includes("{fechaCorta(diaDeNegocio(p.fecha_entrega_estimada)) || '-'}"), 'la celda: el día de calendario');
  assert.match(celdaEntrega, /alerta === 'vencida' \? 'text-red-600' : alerta === 'por_vencer' \? 'text-amber-700' : 'text-slate-600'/);
  assert.ok(codigo.includes("titleCelda: (p) => fechaSolo(p.fecha_entrega_estimada) || 'Sin fecha de entrega'"), 'el title: el mismo día');
  assert.ok(!/fechaVencida|fechaLarga|fDate|toLocaleDateString/.test(codigo.slice(codigo.indexOf('const fCOP'))), 'sin leer la entrega como instante');
  // Estado: la insignia del tablero y los chips de la fila (chipsDocumentoVentas, m12 de T8) con su tono.
  const celdaEstado = codigo.slice(codigo.indexOf('function CeldaEstado('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaEstado(')));
  assert.match(celdaEstado, /const e = estadoDeTarjeta\('PVEN', p\.estado\);\s*const chips = chipsDocumentoVentas\(p, 'VEN'\);/);
  assert.match(celdaEstado, /\{chips\.map\(\(c\) => <span key=\{c\.texto\} className=\{`[^`]*\$\{CLASE_CHIP\[c\.tono\] \?\? CLASE_CHIP\.slate\}`\}>\{c\.texto\}<\/span>\)\}/);
  // Acciones (H44, R8): el menú único con «Ver detalle», «Crear PXP» (rol, pedidoAdmitePxp) y «Cancelar pedido» (N2, al
  // modal del detalle con ?accion=cancelar); su etiqueta dice el número.
  const acciones = codigo.slice(codigo.indexOf('function CeldaAcciones('), codigo.indexOf('\n}\n', codigo.indexOf('function CeldaAcciones(')));
  assert.match(acciones, /const puedePxp = Boolean\(acciones\?\.puedePxpRol\) && pedidoAdmitePxp\(p\);/);
  assert.match(acciones, /\{ etiqueta: 'Ver detalle', icono: FileCheck, onClick: \(\) => acciones\?\.abrir\(p\) \}/);
  assert.match(acciones, /\{ etiqueta: 'Crear PXP', [^\n]*oculto: !puedePxp,\s*deshabilitado: acciones\?\.creandoPxp === p\.id \}/);
  assert.match(acciones, /\{ etiqueta: 'Cancelar pedido', icono: X, peligro: true, onClick: \(\) => acciones\?\.ir\(`\/dashboard\/ventas\/venta\/\$\{p\.id\}\?accion=cancelar`\),\s*oculto: !transicionesPedido\(p\.estado\)\.includes\('CANCELADO'\) \}/);
  assert.match(acciones, /<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{p\.numero\}`\} \/>/);
  assert.match(lista, /const puedePxpRol = puedeCrearOrdenDePago\(getUsuarioActual\(\)\.role\);/);
  assert.match(lista, /apiFetch\(`\/ventas\/pedidos\/\$\{p\.id\}\/crear-pxp`, \{ method: 'POST', body: JSON\.stringify\(\{\}\) \}\);/);

  // Bloque 5 (RP19 (2), D5): las 4 tarjetas con los kpis; el total y Pendientes de compra son sus pestañas.
  assert.match(lista, /<TarjetaKpi kpi="pven_total" valor=\{tarjetas\?\.total\.valor \?\? null\} ayuda=\{tarjetas\?\.total\.ayuda \?\? undefined\}\s*activo=\{vistaActiva === 'todos'\} onClick=\{\(\) => elegirVista\('todos'\)\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="pven_monto_vendido" valor=\{tarjetas\?\.monto_vendido\.valor \?\? null\} ayuda=\{tarjetas\?\.monto_vendido\.ayuda \?\? undefined\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="pven_pendiente_compra" valor=\{tarjetas\?\.pendiente_compra\.valor \?\? null\} ayuda=\{tarjetas\?\.pendiente_compra\.ayuda \?\? undefined\}\s*activo=\{vistaActiva === 'pend_compra'\} onClick=\{\(\) => elegirVista\('pend_compra'\)\} \/>/);
  assert.match(lista, /<TarjetaKpi kpi="pven_saldo_por_cobrar" valor=\{tarjetas\?\.saldo_por_cobrar\.valor \?\? null\} ayuda=\{tarjetas\?\.saldo_por_cobrar\.ayuda \?\? undefined\}\s*variacion=\{\{ actual: tarjetas\?\.saldo_por_cobrar\.valor \?\? null, anterior: null, es_foto: true \}\} \/>/);
  assert.match(lista, /<FranjaKpis estado=\{estadoKpis\} titulo="Pedidos de venta">/);
  assert.match(lista, /despachar\(accionPestana\(estado, siguiente, opcionesEstadosPedidos\)\);\s*if \(enKanban\) despachar\(\{ tipo: 'modo', valor: 'lista' \}\);/);
  assert.match(lista, /const siguiente = enKanban \? vista : \(alternarSeleccion\(estado\.vista, vista\) \?\? INICIAL_PEDIDOS\.vista\);/);

  // Bloque 6 (D42, RP21, RP90): la franja con «Estás aquí» en Pedido de venta, Entregado y Facturado como pestañas y los
  // atrasados del paso PVEN; sin noResueltos.
  assert.match(lista, /<BannerFlujo\s+titulo="Flujo comercial"\s+idPreferencia=\{ID_PEDIDOS\}/);
  assert.match(lista, /const pasosFlujo = useMemo\(\(\) => pasosDePedidos\(flujo\.datos, vistaActiva\), \[flujo\.datos, vistaActiva\]\);/);
  assert.match(lista, /const atrasadosPVEN = pasosFlujo\.find\(\(p\) => p\.esEste\)\?\.atrasados \?\? null;/);
  assert.match(lista, /semaforo=\{\{ atrasados: atrasadosPVEN, filtro: filtroSemaforo, onFiltrar: alFiltrarSemaforo \}\}/);
  assert.match(lista, /onSeleccionarPaso=\{alSeleccionarPaso\}/);
  assert.match(lista, /const alSeleccionarPaso = \(clave: string\) => \{\s*const vista = vistaDePasoPedido\(clave\);\s*if \(vista\) elegirVista\(vista\);\s*\};/);
  assert.match(lista, /const filtroSemaforo: FiltroSemaforo = estado\.semaforo === 'atrasados' \? 'atrasados' : 'todos';/);
  assert.ok(!lista.includes('noResueltos'), 'sin la clave noResueltos');
  assert.match(codigo, /const VISTAS_SIN_ATRASO = \['entregado', 'facturado', 'cancelado'\];/);
  assert.match(lista, /const alFiltrarSemaforo = \(f: FiltroSemaforo\) => \{\s*if \(f !== 'todos' && VISTAS_SIN_ATRASO\.includes\(estado\.vista \?\? ''\)\) \{\s*despachar\(accionPestana\(estado, INICIAL_PEDIDOS\.vista, enKanban \? OPCIONES_ESTADOS_TABLERO_PEDIDO : opcionesEstadosPedidos\)\);\s*\}\s*despachar\(\{ tipo: 'semaforo', valor: f === 'todos' \? null : f \}\);\s*\};/);
  {
    const { estadoTablaInicial, reducirEstadoTabla, accionPestana, accionModo } = await import('../src/lib/tabla.js');
    const { opcionesEstadosPedidos, OPCIONES_ESTADOS_TABLERO_PEDIDO } = await import('../src/lib/kanban-ventas.js');
    const { pasosDePedidos, vistaDePasoPedido } = await import('../src/lib/flujo-ventas.js');
    // Kanban desde Cancelado con «Cancelado» en el filtro del tablero, y «Con atraso»: Todos, el filtro se queda.
    const enKanban = estadoTablaInicial({ vista: 'cancelado', modo: 'kanban', estados: ['CANCELADO'] });
    const salto = reducirEstadoTabla(enKanban, accionPestana(enKanban, 'todos', OPCIONES_ESTADOS_TABLERO_PEDIDO));
    const conAtraso = reducirEstadoTabla(salto, { tipo: 'semaforo', valor: 'atrasados' });
    assert.deepEqual([conAtraso.vista, conAtraso.modo, conAtraso.semaforo, conAtraso.estados], ['todos', 'kanban', 'atrasados', ['CANCELADO']]);
    // Al volver a Lista con las opciones de la Lista, CANCELADO se queda (Todos lo ofrece).
    const enLista = reducirEstadoTabla(conAtraso, accionModo(conAtraso, 'lista', opcionesEstadosPedidos));
    assert.deepEqual([enLista.vista, enLista.modo, enLista.estados], ['todos', 'lista', ['CANCELADO']]);
    // En Lista, de En Proceso con «En tránsito» filtrado, la caja Entregado abre Entregado y poda el filtro.
    const lista0 = estadoTablaInicial({ vista: 'en_proceso', estados: ['EN_TRANSITO'] });
    const vista = vistaDePasoPedido('ENTREGADO');
    const enEntregado = reducirEstadoTabla(lista0, accionPestana(lista0, vista, opcionesEstadosPedidos));
    assert.deepEqual([enEntregado.vista, enEntregado.estados], ['entregado', []]);
    // Y la franja marca esa caja.
    assert.equal(pasosDePedidos(null, enEntregado.vista).find((p) => p.clave === 'ENTREGADO').seleccionado, true);
  }

  // Bloque 7 (R13): «Ver análisis» al Hub enfocado en Pedidos, y el contenedor con pb-24 (el botón de la IA). Los botones
  // de la cabecera viven en AccionesCabecera, los mismos del esqueleto del Suspense.
  const cabecera = codigo.slice(codigo.indexOf('export function AccionesCabecera('), codigo.indexOf('\n}\n', codigo.indexOf('export function AccionesCabecera(')));
  assert.ok(cabecera.length > 100, 'AccionesCabecera exportada');
  assert.match(cabecera, /<button type="button" onClick=\{onActualizar\}[^>]*>\s*<RefreshCw [^>]*className=\{actualizando \? 'animate-spin' : ''\}\/> Actualizar/);
  assert.match(cabecera, /<Link href=\{enlaceVerAnalisis\('pven'\)\}/);
  assert.match(cabecera, /<ContenidoEnlace icon=\{BarChart3\}>Ver análisis<\/ContenidoEnlace>/);
  assert.match(codigo, /export const CONTENEDOR_LISTA = 'flex-1 flex flex-col px-4 xl:px-8 pt-6 pb-24 max-w-\[1600px\] mx-auto w-full min-w-0 gap-6';/);
  assert.ok(lista.includes('<div className={CONTENEDOR_LISTA}>'), 'la lista usa el contenedor');
  assert.match(lista, /subtitle="Pedidos confirmados por tus clientes"/);
  // Lo de los Bloques 1 a 3 que se queda: NewSupplierModal exportado (lo importa venta/[id]; F5 fija sus tildes).
  assert.match(codigo, /\nexport function NewSupplierModal\(/);
}

console.log('--- B4 T10: el esqueleto del Suspense de Pedidos arma la lista con sus MISMAS piezas ---');
{
  const ruta = (r) => new URL(`../src/app/dashboard/ventas/venta/${r}`, import.meta.url);
  assert.ok(existsSync(ruta('CargandoPedidos.tsx')), 'existe venta/CargandoPedidos.tsx');
  const leerVen = (r) => readFileSync(ruta(r), 'utf8').replace(/\r\n/g, '\n');
  const carga = leerVen('CargandoPedidos.tsx');
  const pagina = leerVen('page.tsx');
  const lista = leerVen('venta-client.tsx');
  // page.tsx: el fallback del Suspense es el esqueleto, no el «Cargando...» centrado en h-screen.
  assert.match(pagina, /import \{ CargandoPedidos \} from '\.\/CargandoPedidos';/);
  assert.ok(pagina.includes('<Suspense fallback={<CargandoPedidos />}>'), 'el fallback del Suspense');
  const paginaSinComentarios = pagina.replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  assert.ok(!paginaSinComentarios.includes('h-screen') && !paginaSinComentarios.includes('Cargando...'), 'sin el «Cargando...» de toda la pantalla');
  // Las piezas son las de la lista (importadas, no copiadas).
  assert.match(carga, /AccionesCabecera, COLUMNAS_TABLA_PEDIDOS, CONTENEDOR_LISTA, ID_PEDIDOS, INICIAL_PEDIDOS, pestanasDeLaLista,\s*\} from '\.\/venta-client';/);
  for (const nombre of ['ID_PEDIDOS', 'INICIAL_PEDIDOS', 'CONTENEDOR_LISTA', 'COLUMNAS_TABLA_PEDIDOS']) {
    assert.match(lista, new RegExp(`\\nexport const ${nombre}\\b`), `${nombre} exportado`);
  }
  assert.match(lista, /\nexport function pestanasDeLaLista\(/);
  assert.match(lista, /\nexport function AccionesCabecera\(/);
  assert.ok(carga.includes('<div className={CONTENEDOR_LISTA}>'), 'el contenedor de la lista');
  assert.ok(carga.includes('pasos={pasosDePedidos(null, INICIAL_PEDIDOS.vista)}'), 'la franja con las cajas de la lista');
  assert.ok(carga.includes('onSeleccionarPaso={nada}'), 'Entregado y Facturado como en la lista (botones)');
  assert.ok(carga.includes('idPreferencia={ID_PEDIDOS}'), 'el modo compacto de la franja de la lista');
  assert.ok(carga.includes('const prefs = usePreferenciasTabla(ID_PEDIDOS, COLUMNAS_TABLA_PEDIDOS);'), 'las columnas que el usuario guardó');
  assert.ok(carga.includes('const ESTADO_CARGANDO = estadoTablaInicial(INICIAL_PEDIDOS);'), 'el estado inicial de la lista');
  assert.ok(carga.includes('const PESTANAS_CARGANDO = pestanasDeLaLista(null);'), 'las pestañas, cargando');
  assert.ok(carga.includes('<AccionesCabecera onActualizar={nada} actualizando={false} />'), 'la cabecera mide lo mismo');
  assert.ok(carga.includes('subtitle="Pedidos confirmados por tus clientes"'), 'el mismo subtítulo');
  assert.ok(carga.includes('seleccion={SIN_FILAS}') && carga.includes('onSeleccion={nada}'), 'la casilla de la lista, para la misma geometría');
  // Las 4 tarjetas de la lista, cargando, con los mismos botones (la del total, activa: la vista inicial).
  assert.match(carga, /<TarjetaKpi kpi="pven_total" valor=\{null\} activo onClick=\{nada\} \/>\s*<TarjetaKpi kpi="pven_monto_vendido" valor=\{null\} \/>\s*<TarjetaKpi kpi="pven_pendiente_compra" valor=\{null\} onClick=\{nada\} \/>\s*<TarjetaKpi kpi="pven_saldo_por_cobrar" valor=\{null\} variacion=\{\{ actual: null, anterior: null, es_foto: true \}\} \/>/);
  const placeholder = 'placeholder="Buscar por número, cliente, asesor, solicitud, cotización o producto…"';
  assert.ok(carga.includes(placeholder) && lista.includes(placeholder), 'la misma búsqueda');
  // Todo inerte, atributo por atributo, con el aviso de la carga fuera de lo inerte.
  afirmarEsqueletoInerte(carga, 'Cargando los pedidos de venta…', 'CargandoPedidos');
}

console.log('--- B4 T10: el cableado del detalle del pedido (FLUJO-documentos 5, KPI-ventas 10, U24; RP87; D27) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/venta/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // La cadena de documentos (RP87: con doc), entre la barra de acciones y el panel dividido (fuera del @container de H37).
  assert.match(codigo, /<div className="[^"]*\bshrink-0\b[^"]*">\s*<CadenaDocumentos doc=\{pedido\} tipo="PVEN" \/>\s*<\/div>\s*<div className="flex-1 flex flex-row overflow-hidden">/);
  assert.match(codigo, /import \{ CadenaDocumentos, PasosFlujo \} from '@\/components\/flujo';/);
  // El Status Tracker: PASOS_PEDIDO y pasoPedido (Bloque 1) con pasosConProgreso; solo con stepIndex >= 0 (RP87); la línea
  // «Estado actual» y los avisos de cancelado y devuelto se quedan.
  assert.ok(codigo.includes('const stepIndex = pasoPedido(estadoActual);'));
  assert.ok(codigo.includes('const pasosPedido = pasosConProgreso(STEPS, stepIndex);'));
  // Banco de T10: a 1024 px las cinco etiquetas no caben en una línea: partirEtiquetas las parte (V5 del B2), y la barra
  // usa todo el ancho de la columna (py-6, sin el p-6 de la línea de antes): así ninguna palabra se corta por la mitad.
  assert.match(codigo, /\{stepIndex >= 0 && \(\s*<div className="bg-white py-6 border-b border-slate-100 mb-8">\s*<PasosFlujo variante="barra" pasos=\{pasosPedido\} etiqueta="Pasos del pedido" partirEtiquetas \/>/);
  assert.match(codigo, /\{stepIndex >= 0 && STEPS\[stepIndex\]\?\.key !== estadoActual && \(\s*<p [^>]*>Estado actual: \{estadoCfg\.label\}<\/p>/);
  assert.ok(codigo.includes('Este pedido fue devuelto totalmente.') && codigo.includes('Este pedido de venta fue cancelado.'));
  {
    // Cancelado y Devuelto (paso -1) no pintan la barra; los demás, con su paso actual.
    const { pasoPedido, PASOS_PEDIDO } = await import('../src/lib/estados-pedido.js');
    const { pasosConProgreso } = await import('../src/lib/flujo.js');
    assert.deepEqual([pasoPedido('CANCELADO'), pasoPedido('DEVUELTO_TOTAL')], [-1, -1]);
    assert.deepEqual(pasosConProgreso(PASOS_PEDIDO, pasoPedido('LISTO_ENTREGA')).map((p) => p.estado), ['hecho', 'hecho', 'actual', 'pendiente', 'pendiente']);
    assert.deepEqual(pasosConProgreso(PASOS_PEDIDO, pasoPedido('LISTO_ENTREGA')).map((p) => p.label), PASOS_PEDIDO.map((p) => p.label));
  }
  // El Resumen Financiero (KPI-ventas punto 10, U24): FranjaKpis con 3 TarjetaKpi en pesos, con los textos, casos y
  // colores de U24; los valores de resumenPagoPedido. El total, la barra, el aviso ámbar y la lista de pagos no cambian.
  const resumen = codigo.slice(codigo.indexOf('<FranjaKpis titulo="Resumen de pagos">'), codigo.indexOf('</FranjaKpis>'));
  assert.ok(resumen.length > 100, 'la franja del Resumen Financiero');
  assert.equal((resumen.match(/<TarjetaKpi\b/g) ?? []).length, 3, 'tres tarjetas');
  assert.match(resumen, /<TarjetaKpi etiqueta=\{`Anticipo requerido · \$\{formatoPct\(resumenPago\.anticipoPct\)\}`\} icono="Coins" color="indigo" formato="pesos"\s*valor=\{resumenPago\.requerido\} ayuda=\{resumenPago\.requerido === 0 \? 'No pide anticipo' : 'Del total del pedido'\} \/>/);
  assert.match(resumen, /<TarjetaKpi etiqueta="Pagado \(verificado\)" icono="CheckCircle2" color="emerald" formato="pesos"\s*valor=\{resumenPago\.pagado\} ayuda=\{resumenPago\.pctPagado === null \? 'Saldo sin datos' : `\$\{resumenPago\.pctPagado\}% del total`\} \/>/);
  assert.match(resumen, /<TarjetaKpi etiqueta=\{tercerRecuadro\.titulo\} icono=\{tercerRecuadro\.icono\} color=\{tercerRecuadro\.color\} tono=\{tercerRecuadro\.tono\}\s*formato="pesos" ayuda=\{tercerRecuadro\.ayuda\}/);
  assert.match(resumen, /valor=\{cancelado \? resumenPago\.saldo\s*: resumenPago\.caso === 'pendiente' \? resumenPago\.saldo\s*: resumenPago\.caso === 'a_favor' \? resumenPago\.saldoAFavor\s*: resumenPago\.caso === 'completo' \? 0 : null\} \/>/);
  const tercer = codigo.slice(codigo.indexOf('const TERCER_RECUADRO'), codigo.indexOf('};', codigo.indexOf('const TERCER_RECUADRO')));
  assert.match(tercer, /pendiente: \{ titulo: 'Saldo pendiente', color: 'rose', tono: 'alerta', [^}]*ayuda: 'Total menos lo pagado' \}/);
  assert.match(tercer, /completo: \{ titulo: 'Pagado completo', color: 'emerald', tono: 'bien', [^}]*ayuda: 'Sin saldo pendiente' \}/);
  assert.match(tercer, /a_favor: \{ titulo: 'Saldo a favor del cliente', color: 'amber', [^}]*ayuda: 'Pagó más que el total del pedido' \}/);
  assert.match(tercer, /desconocido: \{ titulo: 'Saldo pendiente', color: 'slate', [^}]*ayuda: 'Saldo sin datos' \}/);
  assert.ok(codigo.includes("const RECUADRO_CANCELADO = { ...TERCER_RECUADRO.desconocido, titulo: 'Sin cobrar (pedido cancelado)', ayuda: 'El pedido se canceló: no se cobra.' };"));
  assert.ok(codigo.includes('const tercerRecuadro = cancelado ? RECUADRO_CANCELADO : (TERCER_RECUADRO[resumenPago.caso] || TERCER_RECUADRO.desconocido);'));
  assert.ok(codigo.includes('const resumenPago = resumenPagoPedido(pedido);'));
  for (const sigue of ['{fCOP(resumenPago.total)}', 'Pagado {fCOP(resumenPago.pagado)} de {fCOP(resumenPago.total)} ({resumenPago.pctPagado}%)',
    'Anticipo pendiente: {fCOP(resumenPago.anticipoPendiente)}. El cliente todavía debe esta parte del anticipo.', 'const d = describirPago(p);',
    '<LineaEnlaceCliente enlace={pedido?.enlace_cliente} estado={estadoActual} />']) {
    assert.ok(codigo.includes(sigue), `se queda: ${sigue}`);
  }
  assert.ok(!/rounded-xl border border-indigo-200 bg-indigo-50 p-4|tercerRecuadro\.caja/.test(codigo), 'sin los recuadros hechos a mano');
  {
    // Los textos de U24 con las cuentas de resumenPagoPedido, en sus tres casos.
    const { resumenPagoPedido } = await import('../src/lib/resumen-pago.js');
    assert.equal(resumenPagoPedido({ total_cop: 1000, saldo_cop: 400, anticipo_pct: 60 }).caso, 'pendiente');
    assert.equal(resumenPagoPedido({ total_cop: 1000, saldo_cop: 0 }).caso, 'completo');
    assert.equal(resumenPagoPedido({ total_cop: 1000, saldo_cop: -200 }).caso, 'a_favor');
    assert.equal(resumenPagoPedido({ total_cop: 1000 }).caso, 'desconocido');
  }
  // El modal de cancelar: las tres frases salen de kanban-ventas.js (las mismas de los efectos del tablero); ninguna a mano.
  assert.match(codigo, /const avisoCotizacionCancelar = avisoCotizacionAlCancelarPedido\(pedido\);\s*const avisoSaldoCancelar = avisoSaldoAFavorAlCancelarPedido\(pedido\);\s*const avisoPxpCancelar = avisoPxpAlCancelarPedido\(pedido\);/);
  for (const v of ['avisoCotizacionCancelar', 'avisoSaldoCancelar', 'avisoPxpCancelar']) {
    assert.match(codigo, new RegExp(`\\{${v} && \\(\\s*<p className="[^"]*">\\{${v}\\}</p>\\s*\\)\\}`), v);
  }
  for (const aMano of ['volverá a Borrador para que puedas', 'saldo a favor de la cotización y pasa', 'También se cancelará la orden de pago', 'no se cancela y queda un aviso']) {
    assert.ok(!codigo.includes(aMano), `sin la frase a mano: ${aMano}`);
  }
  // La tabla de productos (banco de T10): los anchos por defecto caben en @xl (36rem, 576 px), desde donde se ve la tabla.
  const bloque3 = readFileSync(new URL('../src/app/dashboard/ventas/venta/[id]/detalle-bloque3.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const anchosProductos = [...bloque3.matchAll(/\{ id: '(producto|cantidad|unitario|iva|total)', titulo: [^\n]*?, ancho: (\d+)/g)].map((m) => [m[1], Number(m[2])]);
  assert.deepEqual(anchosProductos.map(([id]) => id), ['producto', 'cantidad', 'unitario', 'iva', 'total']);
  const sumaProductos = anchosProductos.reduce((s, [, a]) => s + a, 0);
  assert.ok(sumaProductos <= 576, `las columnas de productos suman ${sumaProductos} px: caben desde @xl (576)`);
  assert.match(bloque3, /\{ id: 'producto', titulo: 'Producto', ancho: \d+, flexible: true,/, 'Producto es la flexible');
  // Las columnas son estables (D40) y siguen a `discriminado` (el título «Total con IVA» o «Total»), con su único
  // usePreferenciasTabla.
  assert.match(bloque3, /const columnas = useMemo<ColumnaTabla<FilaProductoPedido>\[\]>\(\(\) => \[[\s\S]*?\], \[discriminado\]\);\s*const prefs = usePreferenciasTabla\('ventas\.pedido\.productos', columnas\);/);
}

console.log('OK test_listas_ventas.mjs');
