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
  esSCConCotizacionTemprana, TIPOS_NOTA_REINICIAN_ATRASO, notaReiniciaAtraso, desdeElHub, fusionarCargaHub,
  cantidadPositiva, textoAtrasados, conDetalleDelEnvio,
  RUTA_HUB_VENTAS, ESTADOS_CERRADOS, clasificar, esAtrasado, columnaHub, accionSiguienteCOT, accionSiguientePVEN,
  accionSiguienteDocumento, ETIQUETA_GRUPO, tituloGrupo,
} from '../src/lib/hub-ventas.js';
import { destinoVolver, etiquetaVolver } from '../src/lib/detalle-layout.js';
import { ESTADOS_PEDIDO, ESTADOS_PEDIDO_CERRADOS, pasoPedido } from '../src/lib/estados-pedido.js';
import { ESTADOS_COTIZACION } from '../src/lib/estados-cotizacion.js';
import { pedidoVigente } from '../src/lib/listas-ventas.js';
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
  // T11 calidad (E3): cada destino lleva ?return_to= del Hub (su botón de volver dice «Volver al Hub de Ventas»).
  const DEL_HUB = '?return_to=%2Fdashboard%2Fventas';

  const enviar = accionSiguienteSC(sc('ASIGNADA'), vacio);
  assert.equal(enviar.label, 'Enviar para confirmación');
  assert.equal(enviar.href, '/dashboard/ventas/solicitud/5' + DEL_HUB);
  assert.equal(typeof enviar.tono, 'string');

  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [] }), vacio).label, 'Agregar productos');
  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [{ product_name: '  ' }] }), vacio).label, 'Agregar productos');
  assert.equal(accionSiguienteSC(sc('ASIGNADA', { productos: [] }), vacio).href, '/dashboard/ventas/solicitud/5' + DEL_HUB);
  assert.equal(accionSiguienteSC(sc('BORRADOR'), vacio).label, 'Asignar asesor');
  assert.equal(accionSiguienteSC(sc('PENDIENTE_CONFIRMACION'), vacio).label, 'Esperando cliente');
  // R19 (T9B): se cotiza solo con la confirmación del cliente vigente (confirmacion_vigente de _sc_dict, T2A)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), vacio).label, 'Cotizar →');
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), vacio).href, '/dashboard/ventas/solicitud/5' + DEL_HUB);
  // R19 (enmienda del controlador, T9B r1): sin la confirmación vigente (false, sin la llave o cualquier otro valor) no
  // se cotiza ni se envía (el servidor solo envía una Asignada o reenvía una Pendiente por confirmación): el detalle ofrece «Reiniciar solicitud» o «Cotizar sin
  // esperar confirmación», y el Hub abre la solicitud con 'Reiniciar o cotizar'
  const retomar = { label: 'Reiniciar o cotizar', href: '/dashboard/ventas/solicitud/5' + DEL_HUB, tono: 'slate' };
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
  assert.equal(verCot.href, '/dashboard/ventas/cotizacion/9' + DEL_HUB);
  assert.equal(accionSiguienteSC(sc('COTIZADA'), { cotizaciones: [{ id: 3, estado: 'BORRADOR' }], pedidos: [] }).label, 'Ver cotización');
  // la mas reciente de las vigentes; una rechazada no cuenta
  assert.equal(accionSiguienteSC(sc('COTIZADA'), {
    cotizaciones: [{ id: 3, estado: 'BORRADOR' }, { id: 7, estado: 'ENVIADA' }, { id: 8, estado: 'RECHAZADA' }], pedidos: [],
  }).href, '/dashboard/ventas/cotizacion/7' + DEL_HUB);
  // choque H3/N4: una COT VENCIDA cuenta como activa (esCotizacionActiva)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA'), { cotizaciones: [{ id: 4, estado: 'VENCIDA' }], pedidos: [] }).label, 'Ver cotización');
  // solo rechazadas: se puede cotizar otra vez (con la confirmación del cliente vigente, R19)
  assert.equal(accionSiguienteSC(sc('CONFIRMADA', { confirmacion_vigente: true }), { cotizaciones: [{ id: 4, estado: 'RECHAZADA' }], pedidos: [] }).label, 'Cotizar →');

  const verPed = accionSiguienteSC(sc('CONFIRMADA'), { cotizaciones: [{ id: 9, estado: 'CONFIRMADA' }], pedidos: [{ id: 4, estado: 'EN_PROCESO' }] });
  assert.equal(verPed.label, 'Ver pedido');
  assert.equal(verPed.href, '/dashboard/ventas/venta/4' + DEL_HUB);
  assert.equal(accionSiguienteSC(sc('COTIZADA'), {
    cotizaciones: [{ id: 9, estado: 'BORRADOR' }], pedidos: [{ id: 4, estado: 'CANCELADO' }],
  }).label, 'Ver cotización');

  assert.equal(accionSiguienteSC(sc('CANCELADA'), vacio), null);
  const ticket = accionSiguienteSC(sc('ASIGNADA', { tipo_solicitud: 'Soporte Tecnico' }), vacio);
  assert.equal(ticket.label, 'Ver ticket');
  assert.equal(ticket.href, '/dashboard/ventas/solicitud/5' + DEL_HUB);
  assert.equal(accionSiguienteSC(sc('N/A_SOPORTE'), vacio).label, 'Ver ticket');
  assert.equal(accionSiguienteSC(sc('RECHAZADA'), vacio).label, 'Ver solicitud');
  // sin contexto no rompe
  assert.equal(accionSiguienteSC(sc('ASIGNADA')).label, 'Enviar para confirmación');
  // ninguna ruta pasa por /solicitud?id= (redirige)
  for (const e of ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA', 'RECHAZADA']) {
    assert.ok(!accionSiguienteSC(sc(e), vacio).href.includes('?id='), e);
  }
}

console.log('--- T11 calidad E2+E3: los destinos del Hub llevan return_to del Hub (desdeElHub) ---');
{
  assert.equal(desdeElHub('/dashboard/ventas/cotizacion/12'), '/dashboard/ventas/cotizacion/12?return_to=%2Fdashboard%2Fventas');
  // El detalle lo acepta (returnToSeguro) y su botón dice «Volver al Hub de Ventas».
  const ret = new URLSearchParams(desdeElHub('/dashboard/ventas/venta/3').split('?')[1]).get('return_to');
  assert.equal(destinoVolver(ret, '/dashboard/ventas/venta'), '/dashboard/ventas');
  assert.equal(etiquetaVolver(destinoVolver(ret, '/dashboard/ventas/venta')), 'Volver al Hub de Ventas');
  // E2: la «Próxima Acción» de la COT en el Hub ya no usa la ruta vieja /cotizacion?id= (redirige y pierde el volver).
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8');
  assert.ok(!hub.includes('/dashboard/ventas/cotizacion?id='), 'el Hub no enlaza /dashboard/ventas/cotizacion?id=');
  assert.ok(hub.includes('desdeElHub(`/dashboard/ventas/cotizacion/${row.id}`)'), 'Aprobar Venta usa desdeElHub');
  // E4: «Actualizar» no pasa su evento a loadData y un GET fallido ya no se convierte en una lista vacía.
  assert.ok(!hub.includes('onClick={loadData}'), 'Actualizar llama loadData() sin el evento');
  assert.ok(!/\.catch\(\(\)\s*=>\s*\[\]\)/.test(hub), 'loadData no cambia un GET fallido por []');
  // E1 y E5 (lista de solicitudes): el WhatsApp del envío con waUrl y el Análisis agrupado por el día UTC -> local.
  const lista = readFileSync(new URL('../src/app/dashboard/ventas/solicitud/solicitud-client.tsx', import.meta.url), 'utf8');
  assert.ok(!lista.includes('wa.me/57'), 'sin wa.me/57 armado a mano (duplicaba el 57)');
  assert.ok(!lista.includes('new Date(s.fecha_solicitud)'), 'la fecha de la SC pasa por comoUTC');
}

console.log('--- T11 calidad, ronda 1 (7): fusionarCargaHub, la recarga del Hub sin perder lo que había ---');
{
  const SIN_PREVIOS = 'No se pudieron cargar las listas. Pulsa Actualizar para intentarlo de nuevo.';
  const CON_PREVIOS = 'No se pudieron actualizar las listas; se muestran los datos anteriores.';
  const SIN_CONFIG = 'No se pudo cargar la configuración de alertas.';
  const sc1 = { id: 1, created_at: '2026-10-01T10:00:00' };
  const cot1 = { id: 2, created_at: '2026-10-03T10:00:00' };
  const ven1 = { id: 3, created_at: '2026-10-02T10:00:00' };
  const cfg = { data: { alerta_sc_dias: '3' } };

  // Todo bien: las listas nuevas (con su tipo), todas juntas de la más nueva a la más vieja, la config y sin aviso.
  const ok = fusionarCargaHub(null, { sc: { data: [sc1] }, cot: [cot1], ven: { items: [ven1] }, cfg });
  assert.deepEqual(ok.listas, { sc: [{ ...sc1, tipo: 'SC' }], cot: [{ ...cot1, tipo: 'COT' }], ven: [{ ...ven1, tipo: 'VEN' }] });
  assert.deepEqual(ok.todas.map((x) => x.tipo), ['COT', 'VEN', 'SC']);
  assert.deepEqual(ok.cfg, { alerta_sc_dias: '3' });
  assert.equal(ok.aviso, null);

  // Primera carga y falla una lista (null = GET fallido): esa queda vacía y el aviso pide reintentar.
  const primera = fusionarCargaHub(null, { sc: null, cot: [cot1], ven: [ven1], cfg });
  assert.deepEqual(primera.listas.sc, []);
  assert.equal(primera.aviso, SIN_PREVIOS);

  // Con datos previos: la lista que falla conserva la anterior, la que llega la reemplaza, y un solo aviso aunque
  // fallen varias (y la config).
  const previas = ok.listas;
  const cot2 = { id: 9, created_at: '2026-10-05T10:00:00' };
  const varias = fusionarCargaHub(previas, { sc: null, cot: [cot2], ven: null, cfg: null });
  assert.deepEqual(varias.listas, { sc: previas.sc, cot: [{ ...cot2, tipo: 'COT' }], ven: previas.ven });
  assert.deepEqual(varias.todas.map((x) => x.id), [9, 3, 1]);
  assert.equal(varias.cfg, null);  // config nula: se conserva la que hay en pantalla
  assert.equal(varias.aviso, CON_PREVIOS);

  // Solo falla la config.
  const soloCfg = fusionarCargaHub(previas, { sc: [sc1], cot: [cot1], ven: [ven1], cfg: null });
  assert.equal(soloCfg.cfg, null);
  assert.equal(soloCfg.aviso, SIN_CONFIG);

  // Datos previos vacíos (la carga anterior no trajo nada): sigue siendo «no se pudieron cargar».
  assert.equal(fusionarCargaHub({ sc: [], cot: [], ven: [] }, { sc: null, cot: null, ven: null, cfg }).aviso, SIN_PREVIOS);
  // Una config que no es un objeto no reemplaza la de pantalla (y no es un fallo).
  assert.equal(fusionarCargaHub(previas, { sc: [], cot: [], ven: [], cfg: 'x' }).cfg, null);
  // No muta lo que recibe.
  assert.deepEqual(previas.sc, [{ ...sc1, tipo: 'SC' }]);

  // En el Hub queda solo la llamada (con el aviso de la función, sin armar el texto allí).
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8');
  assert.ok(hub.includes('fusionarCargaHub('), 'loadData usa fusionarCargaHub');
  assert.ok(!hub.includes('No se pudieron actualizar las listas (se muestran'), 'sin el texto viejo en el Hub');
}

console.log('--- Revisión final (F4): en el Hub, la última carga gana ---');
{
  // La recarga silenciosa de una nota del panel y la de «Actualizar» se pueden cruzar: la más lenta ya no pinta ni
  // deja ultimaCarga (la base de fusionarCargaHub) con datos viejos. Mismo contador cargaRef de la COT y el PVEN.
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const inicio = hub.indexOf('const loadData = useCallback(');
  assert.ok(inicio > 0, 'loadData encontrado');
  const bloque = hub.slice(inicio, hub.indexOf('},[avisar]);', inicio));
  // El contador va dentro del bloque de E4, junto a ultimaCarga (R14: solo se toca ese bloque del Hub).
  const antes = hub.slice(hub.indexOf('const ultimaCarga = React.useRef'), inicio);
  assert.ok(/const cargaRef = React\.useRef\(0\);/.test(antes), 'cargaRef junto a ultimaCarga');
  const toma = bloque.indexOf('const miCarga = ++cargaRef.current;');
  const pide = bloque.indexOf('await Promise.all(');
  const guarda = bloque.search(/if\s*\(\s*miCarga\s*!==\s*cargaRef\.current\s*\)\s*return;/);
  const fusiona = bloque.indexOf('fusionarCargaHub(');
  assert.ok(toma > 0 && toma < pide, 'toma su número antes de pedir');
  assert.ok(guarda > pide && guarda < fusiona, 'una carga vieja sale antes de fusionar, pintar o tocar ultimaCarga');
  assert.ok(/finally\s*\{\s*if\s*\(\s*miCarga\s*===\s*cargaRef\.current\s*\)\s*setLoading\(false\);\s*\}/.test(bloque),
    'solo la última apaga el spinner');
  assert.ok(/catch\s*\(err:any\)\s*\{\s*if\s*\(\s*miCarga\s*===\s*cargaRef\.current\s*\)\s*setToast\(/.test(bloque),
    'el error de una carga vieja tampoco se muestra');
}

console.log('--- H3 TEST 12: esNoResuelto / esAccionTomada ---');
{
  assert.equal(esNoResuelto({ tipo: 'SC', estado: 'ASIGNADA' }, new Set()), true);
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set()), true);
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set([1])), false);
  assert.equal(esNoResuelto({ tipo: 'SC', estado: 'COTIZADA' }, new Set()), false);
  assert.equal(esAccionTomada({ tipo: 'SC', estado: 'COTIZADA' }, new Set()), true);
  // B4 T2 (P1 del plan, D19): una COT CONFIRMADA sin pedido vigente ya no es acción tomada (cot_confirmada_sin_pedido =
  // «Como pendiente, y como atrasada si pasan los días de alerta»). Es la única excepción de D19 a «con dos argumentos,
  // lo mismo que hoy».
  assert.equal(esAccionTomada({ tipo: 'COT', estado: 'CONFIRMADA' }, new Set()), false);
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

console.log('--- B3 T18 r1: cantidadPositiva, la lectura de una cuenta de GET /ventas/alertas/resumen ---');
{
  // Una sola regla para las pastillas del menú (textoAtrasados y pastillasCambiosCliente de lib/cambios-cliente.js).
  assert.equal(cantidadPositiva(3), 3);
  assert.equal(cantidadPositiva('4'), 4, 'el número puede llegar como texto');
  for (const n of [0, -2, null, undefined, '', '  ', 'x', NaN, Infinity, true, [], {}]) {
    assert.equal(cantidadPositiva(n), null, String(n));
  }
  // textoAtrasados la usa: los mismos casos de siempre.
  assert.equal(textoAtrasados('3'), '3 atrasados');
  assert.equal(textoAtrasados(Infinity), '');
  const fuente = readFileSync(new URL('../src/lib/hub-ventas.js', import.meta.url), 'utf8');
  const cuerpo = fuente.slice(fuente.indexOf('export function textoAtrasados('), fuente.indexOf('export function desdeElHub('));
  assert.ok(cuerpo.includes('cantidadPositiva(n)') && !cuerpo.includes('Number.isFinite'), 'textoAtrasados usa cantidadPositiva');
}

console.log('--- Revisión final B3 (F2, M47): la nota ámbar del nombre sin contacto en la ventana de envío del Hub ---');
{
  // El detalle (GET …/{id}) se guarda solo si la ventana sigue abierta para ESE documento.
  const abierta = { tipo: 'SC', id: '12', numero: 'SC-12', telefono: '', correo: null };
  const detalle = { id: 12, nombre_cambio_sin_contacto: true };
  assert.deepEqual(conDetalleDelEnvio(abierta, 'SC', '12', detalle), { ...abierta, detalle });
  assert.deepEqual(conDetalleDelEnvio(abierta, 'SC', 12, detalle), { ...abierta, detalle }, 'el id como número o texto');
  assert.equal(conDetalleDelEnvio(abierta, 'COT', '12', detalle), abierta, 'otro tipo con el mismo id: no');
  assert.equal(conDetalleDelEnvio(abierta, 'SC', '13', detalle), abierta, 'otro documento: no');
  assert.equal(conDetalleDelEnvio(null, 'SC', '12', detalle), null, 'la ventana ya se cerró');
  assert.deepEqual(conDetalleDelEnvio(abierta, 'SC', '12', undefined), { ...abierta, detalle: null }, 'sin data');
  assert.deepEqual(abierta, { tipo: 'SC', id: '12', numero: 'SC-12', telefono: '', correo: null }, 'no muta la ventana');

  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(hub.includes("import { AvisoNombreSinContacto } from './aviso-nombre-sin-contacto';"), 'el Hub importa la nota');
  const abrir = hub.slice(hub.indexOf('function abrirEnvioHub('), hub.indexOf('async function confirmarEnvioHub('));
  assert.ok(abrir.includes("apiFetch(`/ventas/${tipo === 'COT' ? 'cotizaciones' : 'solicitudes'}/${id}`)"),
    'abrirEnvioHub pide el detalle del documento');
  assert.ok(abrir.includes('setEnvioHub(e => conDetalleDelEnvio(e, tipo, id, d?.data))'), 'con la guarda del documento');
  assert.ok(/\.catch\(/.test(abrir), 'si el GET falla, la ventana queda sin la nota (no bloquea el envío)');
  const modal = hub.slice(hub.indexOf('{envioHub && (\n        <ChannelModal'), hub.indexOf('{hubEnlace && ('));
  assert.ok(modal.includes('aviso={<AvisoNombreSinContacto documento={envioHub.detalle} />}'), 'el ChannelModal la recibe');
}

console.log('--- Revisión final B3 (F3, M3): tras el 409 de la bandera, el Hub cierra la ventana del canal y recarga ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const confirmar = hub.slice(hub.indexOf('async function confirmarEnvioHub('), hub.indexOf('// KPIs con contexto'));
  const captura = confirmar.slice(confirmar.indexOf('}catch(err:any){'), confirmar.indexOf('setEnviandoHub(false);'));
  assert.ok(captura.length > 0 && captura.includes('setToast('), 'se encontró el catch de confirmarEnvioHub');
  // Con el 409 («Ya se le envió al cliente…»: otro asesor o pestaña la envió): la ventana se cierra y el tablero se
  // recarga en silencio (la tarjeta sigue en su columna vieja hasta recargar y cada «Enviar» repetiría el 409).
  const en409 = captura.match(/if\s*\(\s*err\?\.status === 409\s*\)\s*\{([\s\S]*?)\n\s*\}\n/);
  assert.ok(en409, 'el catch distingue el 409');
  assert.ok(en409[1].includes('setEnvioHub(null);'), '409: cierra la ventana del envío');
  assert.ok(en409[1].includes('setCanalHub(null);'), '409: olvida el canal elegido');
  assert.ok(en409[1].includes('loadData({silencioso: true});'), '409: recarga el tablero en silencio');
  // El toast con el mensaje del servidor sigue saliendo, con 409 o con cualquier otro error.
  assert.ok(captura.indexOf("setToast({msg: 'No se pudo enviar para confirmación: '") > captura.indexOf('setEnvioHub(null);'),
    'el toast sale para todos los errores');
}

// ─── B4 T2: la regla única de atraso (espejo de backend/app/core/resolucion_ventas.py; R8, C5, C7, RP2, D19, D20) ────

console.log('--- B4 T2 TEST 1: ESTADOS_NO_RESOLUCION son los 8 de alertas_resumen (sin EN_GESTION) y ESTADOS_CERRADOS ---');
{
  assert.deepEqual([...ESTADOS_NO_RESOLUCION].sort(), ['ASIGNADA', 'BORRADOR', 'ENVIADA', 'EN_PROCESO', 'EN_TRANSITO',
    'PENDIENTE_COMPRA', 'PENDIENTE_CONFIRMACION', 'PENDIENTE_PAGO']);
  assert.ok(!ESTADOS_NO_RESOLUCION.includes('EN_GESTION'), 'RP2: EN_GESTION sale');
  assert.ok(Object.isFrozen(ESTADOS_NO_RESOLUCION));
  assert.deepEqual(JSON.parse(JSON.stringify(ESTADOS_CERRADOS)), {
    SC: ['CANCELADA'], COT: ['RECHAZADA'], VEN: [...ESTADOS_PEDIDO_CERRADOS],
  });
  assert.throws(() => { ESTADOS_CERRADOS.VEN.push('X'); }, TypeError);
  // EN_GESTION ya no es «no resuelto» (C2: ningún documento tiene ese estado; su etiqueta sigue en estados-pedido.js)
  assert.equal(esNoResuelto({ tipo: 'COT', estado: 'EN_GESTION' }, new Set()), false);
}

const AHORA_B4 = Date.UTC(2026, 9, 28, 12, 0, 0);
const HORA = 3600 * 1000;
const DIAS_B4 = { SC: 2, COT: 3, VEN: 4 };
/** La fecha como la manda el API: UTC sin zona ('2026-10-26T12:00:00'). */
const sinZona = (ms) => new Date(ms).toISOString().replace(/\.000Z$/, '');
/** Una fila con `horas` sin movimiento (null = sin fechas). */
const filaB4 = (tipo, estado, horas, extra = {}) => ({
  tipo, id: 1, estado,
  ...(horas === null ? { updated_at: null, created_at: null } : { updated_at: sinZona(AHORA_B4 - horas * HORA), created_at: sinZona(AHORA_B4 - 9999 * HORA) }),
  ...extra,
});

console.log('--- B4 T2 TEST 2: clasificar, la tabla de RP2 en orden (frontera estricta, Soporte solo en SC) ---');
{
  const M = 1 / 60;   // un minuto en horas
  const [scLim, cotLim, venLim] = [48, 72, 96];
  const SOPORTE = { tipo_solicitud: 'Soporte Tecnico' };
  const CONF = { confirmacion_vigente: true };
  // [tipo, estado, horas, extra de la fila, ctx, esperado]: la misma matriz que test_clasificar_matriz (T1C)
  const casos = [
    ['SC', 'BORRADOR', 0, {}, {}, 'NO_RESUELTO'],
    ['SC', 'BORRADOR', scLim, {}, {}, 'NO_RESUELTO'],          // exactamente días×24 h no
    ['SC', 'BORRADOR', scLim + M, {}, {}, 'ATRASADO'],          // un minuto más, sí
    ['SC', 'ASIGNADA', 100, {}, {}, 'ATRASADO'],
    ['SC', 'ASIGNADA', 10, {}, {}, 'NO_RESUELTO'],
    ['SC', 'PENDIENTE_CONFIRMACION', 100, {}, { scConCotActiva: true }, 'ACCION_TOMADA'],
    ['SC', 'CONFIRMADA', 100, CONF, {}, 'ATRASADO'],
    ['SC', 'CONFIRMADA', 100, {}, {}, 'NO_RESUELTO'],
    ['SC', 'CONFIRMADA', 10, CONF, {}, 'NO_RESUELTO'],
    ['SC', 'CONFIRMADA', 100, CONF, { scConCotActiva: true }, 'ACCION_TOMADA'],
    ['SC', 'CANCELADA', 100, {}, {}, 'CERRADO'],
    ['SC', 'CANCELADA', 100, {}, { scConCotActiva: true }, 'CERRADO'],
    ['SC', 'BORRADOR', 100, SOPORTE, {}, null],
    ['SC', 'N/A_SOPORTE', 100, {}, {}, null],
    ['COT', 'BORRADOR', 100, SOPORTE, {}, 'ATRASADO'],         // Soporte solo en SC (T1C r1)
    ['COT', 'N/A_SOPORTE', 100, {}, {}, 'ACCION_TOMADA'],
    ['VEN', 'EN_PROCESO', 200, SOPORTE, {}, 'ATRASADO'],
    ['VEN', 'N/A_SOPORTE', 200, SOPORTE, {}, 'ACCION_TOMADA'],
    ['SC', 'COTIZADA', 100, {}, {}, 'ACCION_TOMADA'],
    ['COT', 'BORRADOR', cotLim, {}, {}, 'NO_RESUELTO'],
    ['COT', 'BORRADOR', cotLim + M, {}, {}, 'ATRASADO'],
    ['COT', 'ENVIADA', 100, {}, {}, 'ATRASADO'],
    ['COT', 'PENDIENTE_CONFIRMACION', 1, {}, {}, 'NO_RESUELTO'],
    ['COT', 'CONFIRMADA', 100, CONF, {}, 'ATRASADO'],
    ['COT', 'CONFIRMADA', 1, CONF, {}, 'NO_RESUELTO'],
    ['COT', 'CONFIRMADA', 100, {}, {}, 'NO_RESUELTO'],
    ['COT', 'CONFIRMADA', 100, CONF, { cotConPedidoVigente: true }, 'ACCION_TOMADA'],
    ['COT', 'RECHAZADA', 100, {}, {}, 'CERRADO'],
    ['COT', 'VENCIDA', 1000, {}, {}, 'NO_RESUELTO'],
    ['COT', 'VENCIDA', 1000, CONF, {}, 'NO_RESUELTO'],
    ['COT', 'EN_GESTION', 1000, {}, {}, 'ACCION_TOMADA'],
    ['VEN', 'PENDIENTE_COMPRA', venLim, {}, {}, 'NO_RESUELTO'],
    ['VEN', 'PENDIENTE_COMPRA', venLim + M, {}, {}, 'ATRASADO'],
    ['VEN', 'EN_PROCESO', 200, {}, { scConCotActiva: true }, 'ATRASADO'],
    ['VEN', 'EN_TRANSITO', 200, {}, {}, 'ATRASADO'],
    ['VEN', 'PENDIENTE_PAGO', 200, {}, {}, 'ATRASADO'],
    ['VEN', 'LISTO_ENTREGA', 200, {}, {}, 'ACCION_TOMADA'],
    ['VEN', 'PENDIENTE_ANTICIPO', 200, {}, {}, 'ACCION_TOMADA'],
    ['VEN', 'ENTREGADO', 200, {}, {}, 'CERRADO'],
    ['VEN', 'FACTURADO', 200, {}, {}, 'CERRADO'],
    ['VEN', 'CANCELADO', 200, {}, {}, 'CERRADO'],
    ['VEN', 'DEVUELTO_TOTAL', 200, {}, {}, 'CERRADO'],
    ['PVEN', 'EN_PROCESO', 200, {}, {}, 'ATRASADO'],
    ['SC', 'BORRADOR', null, {}, {}, 'NO_RESUELTO'],          // sin fecha no supera nada
  ];
  for (const [tipo, estado, horas, extra, ctx, esperado] of casos) {
    const fila = filaB4(tipo, estado, horas, extra);
    const etiqueta = JSON.stringify([tipo, estado, horas, extra, ctx]);
    assert.equal(clasificar(fila, { dias: DIAS_B4, ahora: AHORA_B4, ...ctx }), esperado, etiqueta);
    assert.equal(esAtrasado(fila, { dias: DIAS_B4, ahora: AHORA_B4, ...ctx }), esperado === 'ATRASADO', etiqueta);
  }
  // los días también pueden ser un número; `ahora` también un Date; la fecha con 'Z' se lee igual
  assert.equal(clasificar(filaB4('SC', 'BORRADOR', 48), { dias: 2, ahora: AHORA_B4 }), 'NO_RESUELTO');
  assert.equal(clasificar(filaB4('SC', 'BORRADOR', 48 + M), { dias: 2, ahora: new Date(AHORA_B4) }), 'ATRASADO');
  assert.equal(clasificar({ tipo: 'SC', estado: 'BORRADOR', updated_at: `${sinZona(AHORA_B4 - 49 * HORA)}Z` }, { dias: 2, ahora: AHORA_B4 }), 'ATRASADO');
  // el tiempo sale de updated_at y, si no hay, de created_at (RP2: comoUTC(updated_at || created_at))
  assert.equal(clasificar({ tipo: 'SC', estado: 'BORRADOR', updated_at: null, created_at: sinZona(AHORA_B4 - 49 * HORA) },
    { dias: 2, ahora: AHORA_B4 }), 'ATRASADO');
  assert.equal(clasificar({ tipo: 'SC', estado: 'BORRADOR', updated_at: sinZona(AHORA_B4 - HORA), created_at: sinZona(AHORA_B4 - 99 * HORA) },
    { dias: 2, ahora: AHORA_B4 }), 'NO_RESUELTO');
  // la fecha sin zona es UTC (no hora local): 47 h en UTC no son 52 h
  assert.equal(clasificar({ tipo: 'SC', estado: 'BORRADOR', updated_at: '2026-10-26T13:00:00' }, { dias: 2, ahora: AHORA_B4 }), 'NO_RESUELTO');
  // una fecha inválida no supera nada
  assert.equal(clasificar({ tipo: 'COT', estado: 'BORRADOR', updated_at: 'basura' }, { dias: 0, ahora: AHORA_B4 }), 'NO_RESUELTO');
  // confirmacion_vigente: solo true cuenta (como R19 en accionSiguienteSC)
  assert.equal(clasificar(filaB4('COT', 'CONFIRMADA', 100, { confirmacion_vigente: 'true' }), { dias: DIAS_B4, ahora: AHORA_B4 }), 'NO_RESUELTO');
  // un tipo que no es SC, COT, VEN ni PVEN es un error de programación (ValueError en Python)
  for (const tipo of [undefined, null, 'XYZ', 'sc']) {
    assert.throws(() => clasificar({ tipo, estado: 'BORRADOR' }, { dias: 2, ahora: AHORA_B4 }), /Tipo de documento no válido/, String(tipo));
  }
}

console.log('--- B4 T2 TEST 3: esNoResuelto / esAccionTomada con el tercer argumento = la regla nueva (RP81) ---');
{
  const con = (cotConPedidoVigente) => ({ cotConPedidoVigente });
  // COT CONFIRMADA: sin pedido vigente es «sin resolver»; con él, acción tomada
  assert.equal(esNoResuelto({ tipo: 'COT', id: 1, estado: 'CONFIRMADA' }, new Set(), con(false)), true);
  assert.equal(esAccionTomada({ tipo: 'COT', id: 1, estado: 'CONFIRMADA' }, new Set(), con(false)), false);
  assert.equal(esNoResuelto({ tipo: 'COT', id: 1, estado: 'CONFIRMADA' }, new Set(), con(true)), false);
  assert.equal(esAccionTomada({ tipo: 'COT', id: 1, estado: 'CONFIRMADA' }, new Set(), con(true)), true);
  assert.equal(esNoResuelto({ tipo: 'COT', id: 1, estado: 'VENCIDA' }, new Set(), {}), true, 'VENCIDA: sin resolver');
  // la SC con documentos activos (scConCot) es acción tomada; sin ellos, CONFIRMADA es sin resolver
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }, new Set([1]), {}), true);
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, new Set(), {}), true);
  // los cerrados cuentan en acción tomada (C7: la vista acciones_tomadas = acción tomada + cerrados), DEVUELTO_TOTAL incluido
  for (const [tipo, estado] of [['SC', 'CANCELADA'], ['COT', 'RECHAZADA'], ['VEN', 'ENTREGADO'], ['VEN', 'DEVUELTO_TOTAL']]) {
    assert.equal(esAccionTomada({ tipo, id: 1, estado }, new Set(), {}), true, estado);
    assert.equal(esNoResuelto({ tipo, id: 1, estado }, new Set(), {}), false, estado);
  }
  // Soporte queda fuera del semáforo: ni una ni otra
  assert.equal(esNoResuelto({ tipo: 'SC', id: 1, estado: 'BORRADOR', tipo_solicitud: 'Soporte Tecnico' }, new Set(), {}), false);
  assert.equal(esAccionTomada({ tipo: 'SC', id: 1, estado: 'BORRADOR', tipo_solicitud: 'Soporte Tecnico' }, new Set(), {}), false);
  // con el tercer argumento son exactamente los rangos de clasificar (no dependen de los días ni de la hora)
  const estados = [...new Set([...Object.keys(ESTADOS_SC), ...Object.keys(ESTADOS_COTIZACION), ...Object.keys(ESTADOS_PEDIDO)])];
  for (const tipo of ['SC', 'COT', 'VEN']) {
    for (const estado of estados) {
      for (const [scConCot, pedido] of [[new Set([1]), true], [new Set(), false]]) {
        const fila = filaB4(tipo, estado, 500, { confirmacion_vigente: true });
        const r = clasificar(fila, { dias: DIAS_B4, ahora: AHORA_B4, scConCotActiva: tipo === 'SC' && scConCot.has(1), cotConPedidoVigente: pedido });
        assert.equal(esNoResuelto(fila, scConCot, con(pedido)), r === 'ATRASADO' || r === 'NO_RESUELTO', `${tipo} ${estado}`);
        assert.equal(esAccionTomada(fila, scConCot, con(pedido)), r === 'ACCION_TOMADA' || r === 'CERRADO', `${tipo} ${estado}`);
      }
    }
  }
}

console.log('--- B4 T2 TEST 4 (D19): sin el tercer argumento, lo de c2c9f9f con las dos excepciones ratificadas (P1 y RP2) ---');
{
  // Copia literal de esNoResuelto / esAccionTomada de c2c9f9f (Bloque 1, T9 y T9B), con la lista de no resolución que
  // se le pase: la de 9 estados de c2c9f9f, o la de 8 de RP2 (sin EN_GESTION).
  const NO_RES_B1 = ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'EN_GESTION', 'ENVIADA', 'PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO'];
  const NO_RES_RP2 = NO_RES_B1.filter((e) => e !== 'EN_GESTION');
  const ACC_B1 = ['CONFIRMADA', 'COTIZADA', 'EN_ESPERA_CONFIRMACION', 'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO', 'CANCELADO', 'CANCELADA', 'RECHAZADA'];
  const scConf = (row) => row?.tipo === 'SC' && row?.estado === 'CONFIRMADA';
  const temprana = (lista, row, s) => row?.tipo === 'SC' && lista.includes(row?.estado) && !!s?.has(row.id);
  const noResB1 = (lista, row, s) => (scConf(row) ? !s?.has(row.id) : temprana(lista, row, s) ? false : lista.includes(row?.estado));
  const accB1 = (lista, row, s) => (scConf(row) ? !!s?.has(row.id) : temprana(lista, row, s) ? true : ACC_B1.includes(row?.estado));
  const estados = [...new Set([...Object.keys(ESTADOS_SC), ...Object.keys(ESTADOS_COTIZACION), ...Object.keys(ESTADOS_PEDIDO), 'EN_GESTION'])];
  for (const tipo of ['SC', 'COT', 'VEN', undefined]) {
    for (const estado of estados) {
      for (const s of [new Set([1]), new Set(), undefined]) {
        const fila = { tipo, id: 1, estado };
        const nombre = `${tipo} ${estado} ${s ? s.size : 'sin set'}`;
        // Excepción 2 (RP2, cruce C2): EN_GESTION ya no es «no resuelto», tampoco para esSCConCotizacionTemprana.
        const lista = estado === 'EN_GESTION' ? NO_RES_RP2 : NO_RES_B1;
        assert.equal(esNoResuelto(fila, s), noResB1(lista, fila, s), nombre);
        if (tipo === 'COT' && estado === 'CONFIRMADA') {
          assert.equal(esAccionTomada(fila, s), false, `${nombre}: P1 (D19)`);   // excepción 1
        } else {
          assert.equal(esAccionTomada(fila, s), accB1(lista, fila, s), nombre);
        }
      }
    }
  }
  // EN_GESTION, en concreto: ni «no resuelto» ni acción tomada, con o sin cotización (en c2c9f9f, la SC con cotización
  // era temprana y contaba como acción tomada)
  for (const tipo of ['SC', 'COT', 'VEN']) {
    for (const s of [new Set([1]), new Set()]) {
      assert.equal(esNoResuelto({ tipo, id: 1, estado: 'EN_GESTION' }, s), false, `${tipo} EN_GESTION ${s.size}`);
      assert.equal(esAccionTomada({ tipo, id: 1, estado: 'EN_GESTION' }, s), false, `${tipo} EN_GESTION ${s.size}`);
    }
  }
  assert.equal(esSCConCotizacionTemprana({ tipo: 'SC', id: 1, estado: 'EN_GESTION' }, new Set([1])), false);
  assert.equal(accB1(NO_RES_B1, { tipo: 'SC', id: 1, estado: 'EN_GESTION' }, new Set([1])), true, 'así era en c2c9f9f');
  // null como tercer argumento cuenta como «no llegó»
  assert.equal(esAccionTomada({ tipo: 'VEN', estado: 'DEVUELTO_TOTAL' }, new Set(), null), false, 'como hoy');
  assert.equal(esAccionTomada({ tipo: 'VEN', estado: 'DEVUELTO_TOTAL' }, new Set(), {}), true, 'regla nueva: cerrado');
}

console.log('--- B4 T2 TEST 5: columnaHub = getKanbanCol del Bloque 1 (T9) con DEVUELTO_TOTAL → Cancelado (C7, D20) ---');
{
  // Copia literal de getKanbanCol (ventas/page.tsx, c2c9f9f), que T7 reemplaza por columnaHub.
  const NO_RES_B1 = ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'EN_GESTION', 'ENVIADA', 'PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO'];
  const getKanbanColB1 = (item, scConCot) => {
    if (item.tipo === 'SC' && item.estado === 'CONFIRMADA' && !scConCot.has(item.id)) return 'No Resuelto';
    if (item?.tipo === 'SC' && NO_RES_B1.includes(item?.estado) && !!scConCot?.has(item.id)) return 'Acción Tomada';
    const e = item.estado || '';
    if (['CANCELADO', 'CANCELADA', 'RECHAZADA'].includes(e)) return 'Cancelado';
    if (['ENTREGADO', 'FACTURADO', 'CONFIRMADA', 'LISTO_ENTREGA'].includes(e)) return 'Acción Tomada';
    if (['EN_PROCESO', 'ENVIADA', 'EN_TRANSITO'].includes(e)) return 'En Gestión';
    return 'No Resuelto';
  };
  const casos = [   // los de test_columna_hub_conserva_las_columnas_del_bloque_1 (T1C)
    ['SC', 'CONFIRMADA', false, 'No Resuelto'], ['SC', 'CONFIRMADA', true, 'Acción Tomada'],
    ['SC', 'PENDIENTE_CONFIRMACION', true, 'Acción Tomada'], ['SC', 'BORRADOR', false, 'No Resuelto'],
    ['SC', 'ASIGNADA', false, 'No Resuelto'], ['SC', 'CANCELADA', false, 'Cancelado'],
    ['COT', 'RECHAZADA', false, 'Cancelado'], ['COT', 'ENVIADA', false, 'En Gestión'],
    ['COT', 'CONFIRMADA', false, 'Acción Tomada'], ['COT', 'BORRADOR', false, 'No Resuelto'],
    ['COT', 'VENCIDA', false, 'No Resuelto'], ['VEN', 'CANCELADO', false, 'Cancelado'],
    ['VEN', 'DEVUELTO_TOTAL', false, 'Cancelado'], ['VEN', 'ENTREGADO', false, 'Acción Tomada'],
    ['VEN', 'FACTURADO', false, 'Acción Tomada'], ['VEN', 'LISTO_ENTREGA', false, 'Acción Tomada'],
    ['VEN', 'EN_PROCESO', false, 'En Gestión'], ['VEN', 'EN_TRANSITO', false, 'En Gestión'],
    ['VEN', 'PENDIENTE_COMPRA', false, 'No Resuelto'], ['PVEN', 'DEVUELTO_TOTAL', false, 'Cancelado'],
  ];
  for (const [tipo, estado, conCot, esperado] of casos) {
    assert.equal(columnaHub({ tipo, id: 1, estado }, { scConCot: new Set(conCot ? [1] : []) }), esperado, `${tipo} ${estado} ${conCot}`);
  }
  // todas las combinaciones: igual que getKanbanCol, salvo DEVUELTO_TOTAL (hoy caía en «No Resuelto») y una SC en
  // EN_GESTION con cotización (RP2: EN_GESTION ya no es «no resuelto»; ninguna SC tiene ese estado)
  const estados = [...new Set([...Object.keys(ESTADOS_SC), ...Object.keys(ESTADOS_COTIZACION), ...Object.keys(ESTADOS_PEDIDO), 'EN_GESTION', 'ALGO_NUEVO'])];
  for (const tipo of ['SC', 'COT', 'VEN']) {
    for (const estado of estados) {
      for (const s of [new Set([1]), new Set()]) {
        const fila = { tipo, id: 1, estado };
        let esperado = getKanbanColB1(fila, s);
        if (estado === 'DEVUELTO_TOTAL') esperado = 'Cancelado';
        if (tipo === 'SC' && estado === 'EN_GESTION' && s.size) esperado = 'No Resuelto';
        assert.equal(columnaHub(fila, { scConCot: s }), esperado, `${tipo} ${estado} ${s.size}`);
        // D20: 'PVEN' es el mismo tipo que 'VEN'
        if (tipo === 'VEN') assert.equal(columnaHub({ ...fila, tipo: 'PVEN' }, { scConCot: s }), columnaHub(fila, { scConCot: s }), `PVEN ${estado}`);
      }
    }
  }
  // el id de otro tipo no cuenta como SC con cotización; sin scConCot no rompe
  assert.equal(columnaHub({ tipo: 'COT', id: 1, estado: 'BORRADOR' }, { scConCot: new Set([1]) }), 'No Resuelto');
  assert.equal(columnaHub({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }), 'No Resuelto');
  assert.equal(columnaHub({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, {}), 'No Resuelto');
  assert.throws(() => columnaHub({ tipo: 'XYZ', estado: 'BORRADOR' }), /Tipo de documento no válido/);
}

const DEL_HUB_B4 = `?return_to=${encodeURIComponent(RUTA_HUB_VENTAS)}`;

console.log('--- B4 T2 TEST 6: accionSiguienteCOT (R26, RP15: {texto, href, tono}) ---');
{
  const cot = (estado, extra = {}) => ({ tipo: 'COT', id: 12, estado, total_cop: 500000, pedidos_venta: [], ...extra });
  const enCot = `/dashboard/ventas/cotizacion/12${DEL_HUB_B4}`;
  for (const estado of ['BORRADOR', 'VENCIDA', 'ENVIADA']) {
    assert.deepEqual(accionSiguienteCOT(cot(estado)), { texto: 'Enviar al cliente', href: enCot, tono: 'indigo' }, estado);
    assert.deepEqual(accionSiguienteCOT(cot(estado, { total_cop: '1500' })), { texto: 'Enviar al cliente', href: enCot, tono: 'indigo' }, estado);
    for (const total of [0, -5, '0', null, undefined, 'abc']) {
      assert.deepEqual(accionSiguienteCOT(cot(estado, { total_cop: total })), { texto: 'Completar precios', href: enCot, tono: 'amber' },
        `${estado} ${total}`);
    }
  }
  assert.deepEqual(accionSiguienteCOT(cot('PENDIENTE_CONFIRMACION')), { texto: 'Esperando al cliente', href: null, tono: 'blue' });
  assert.deepEqual(accionSiguienteCOT(cot('CONFIRMADA')), { texto: 'Crear pedido', href: enCot, tono: 'emerald' });
  assert.deepEqual(accionSiguienteCOT(cot('CONFIRMADA', { pedidos_venta: [{ id: 3, estado: 'CANCELADO' }] })),
    { texto: 'Crear pedido', href: enCot, tono: 'emerald' }, 'un pedido cancelado no cuenta (H46)');
  const conPedido = cot('CONFIRMADA', { pedidos_venta: [{ id: 3, estado: 'CANCELADO' }, { id: 4, estado: 'EN_PROCESO' }, { id: 6, estado: 'PENDIENTE_COMPRA' }] });
  assert.deepEqual(accionSiguienteCOT(conPedido), { texto: 'Ver pedido', href: `/dashboard/ventas/venta/6${DEL_HUB_B4}`, tono: 'emerald' });
  assert.equal(pedidoVigente(conPedido).id, 6, 'el mismo pedido vigente que pedidoVigente de listas-ventas.js');
  assert.equal(accionSiguienteCOT(cot('RECHAZADA')), null);
  assert.equal(accionSiguienteCOT(cot('ALGO_NUEVO')), null);
  assert.equal(accionSiguienteCOT(null), null);
  // solo navegan: ninguna cambia estado
  for (const estado of Object.keys(ESTADOS_COTIZACION)) {
    const a = accionSiguienteCOT(cot(estado));
    if (a) assert.deepEqual(Object.keys(a).sort(), ['href', 'texto', 'tono'], estado);
  }
}

console.log('--- B4 T2 TEST 7: accionSiguientePVEN (R26, RP15: el orden del pedido) ---');
{
  const p = (estado, saldo = 0) => ({ tipo: 'VEN', id: 8, estado, saldo_cop: saldo });
  const enPedido = `/dashboard/ventas/venta/8${DEL_HUB_B4}`;
  for (const e of ['CANCELADO', 'DEVUELTO_TOTAL', 'FACTURADO']) assert.equal(accionSiguientePVEN(p(e, 500)), null, e);
  // ENTREGADO y PARCIALMENTE_ENTREGADO (paso 2) dan «Facturar» antes de mirar el paso
  assert.equal(pasoPedido('PARCIALMENTE_ENTREGADO'), 2);
  for (const e of ['ENTREGADO', 'PARCIALMENTE_ENTREGADO']) {
    for (const saldo of [0, 500]) assert.deepEqual(accionSiguientePVEN(p(e, saldo)), { texto: 'Facturar', href: enPedido, tono: 'emerald' }, `${e} ${saldo}`);
  }
  for (const e of ['PENDIENTE_COMPRA', 'PENDIENTE_PAGO']) {
    assert.deepEqual(accionSiguientePVEN(p(e)), { texto: 'Gestionar compra', href: `/dashboard/compras${DEL_HUB_B4}`, tono: 'amber' }, e);
  }
  for (const e of ['EN_PROCESO', 'EN_TRANSITO']) {
    assert.deepEqual(accionSiguientePVEN(p(e, 500)), { texto: 'Ver pedido', href: enPedido, tono: 'slate' }, e);
  }
  // paso 2 (listo para entrega): con saldo, cobrar; sin saldo, despachar en Entregas
  for (const e of ['LISTO_ENTREGA', 'DISPONIBLE', 'PENDIENTE_SALDO', 'LISTO_PARA_ENTREGA']) {
    assert.equal(pasoPedido(e), 2, e);
    assert.deepEqual(accionSiguientePVEN(p(e, 120000)), { texto: 'Cobrar saldo', href: enPedido, tono: 'amber' }, e);
    assert.deepEqual(accionSiguientePVEN(p(e, '120000')), { texto: 'Cobrar saldo', href: enPedido, tono: 'amber' }, e);
    for (const saldo of [0, -1, null, undefined]) {
      assert.deepEqual(accionSiguientePVEN(p(e, saldo)), { texto: 'Despachar', href: `/dashboard/inventario/entregas${DEL_HUB_B4}`, tono: 'indigo' },
        `${e} ${saldo}`);
    }
  }
  // el resto (pasos 0 y 1 de fase4 y de la tienda, y un desconocido): «Ver pedido»
  for (const e of ['PAGADO', 'BORRADOR', 'CONFIRMADO', 'PENDIENTE_ANTICIPO', 'PARCIALMENTE_DISPONIBLE', 'ALGO_NUEVO']) {
    assert.deepEqual(accionSiguientePVEN(p(e, 500)), { texto: 'Ver pedido', href: enPedido, tono: 'slate' }, e);
  }
  assert.equal(accionSiguientePVEN(null), null);
  for (const e of Object.keys(ESTADOS_PEDIDO)) {
    const a = accionSiguientePVEN(p(e, 500));
    if (a) assert.ok(a.href.startsWith('/dashboard/') && a.href.endsWith(DEL_HUB_B4), e);
  }
}

console.log('--- B4 T2 TEST 8: accionSiguienteDocumento (RP15) con returnTo (cruce C5 de la verificación) ---');
{
  // SC: accionSiguienteSC con las cotizaciones y los pedidos de la fila, con label → texto
  const sc = { tipo: 'SC', id: 5, estado: 'CONFIRMADA', productos: [{ product_name: 'Cuna' }],
    cotizaciones: [{ id: 9, estado: 'CONFIRMADA' }], pedidos_venta: [{ id: 4, estado: 'EN_PROCESO' }] };
  assert.deepEqual(accionSiguienteDocumento(sc), { texto: 'Ver pedido', href: `/dashboard/ventas/venta/4${DEL_HUB_B4}`, tono: 'emerald' });
  const deSC = accionSiguienteSC(sc, { cotizaciones: sc.cotizaciones, pedidos: sc.pedidos_venta });
  assert.deepEqual(accionSiguienteDocumento(sc), { texto: deSC.label, href: deSC.href, tono: deSC.tono });
  assert.deepEqual(accionSiguienteDocumento({ ...sc, pedidos_venta: undefined }),
    { texto: 'Ver cotización', href: `/dashboard/ventas/cotizacion/9${DEL_HUB_B4}`, tono: 'indigo' });
  assert.equal(accionSiguienteDocumento({ tipo: 'SC', id: 5, estado: 'CANCELADA' }), null);
  // COT y PVEN (también con tipo 'PVEN')
  const cot = { tipo: 'COT', id: 12, estado: 'PENDIENTE_CONFIRMACION' };
  assert.deepEqual(accionSiguienteDocumento(cot), accionSiguienteCOT(cot));
  const ven = { tipo: 'VEN', id: 8, estado: 'EN_PROCESO' };
  assert.deepEqual(accionSiguienteDocumento(ven), accionSiguientePVEN(ven));
  assert.deepEqual(accionSiguienteDocumento({ ...ven, tipo: 'PVEN' }), accionSiguientePVEN(ven));
  assert.equal(accionSiguienteDocumento({ tipo: 'XYZ', id: 1, estado: 'BORRADOR' }), null);
  assert.equal(accionSiguienteDocumento(null), null);
  // una sola forma en la columna Acción
  for (const fila of [sc, cot, ven, { tipo: 'SC', id: 2, estado: 'ASIGNADA', productos: [] }]) {
    assert.deepEqual(Object.keys(accionSiguienteDocumento(fila)).sort(), ['href', 'texto', 'tono'], fila.tipo);
  }
  // C5: returnTo (por defecto RUTA_HUB_VENTAS); la lista de Solicitudes (T8) pasa la suya
  const LISTA = '/dashboard/ventas/solicitud';
  const DE_LA_LISTA = `?return_to=${encodeURIComponent(LISTA)}`;
  assert.equal(accionSiguienteDocumento(sc, { returnTo: LISTA }).href, `/dashboard/ventas/venta/4${DE_LA_LISTA}`);
  assert.equal(accionSiguienteDocumento({ tipo: 'SC', id: 5, estado: 'BORRADOR', productos: [] }, { returnTo: LISTA }).href,
    `/dashboard/ventas/solicitud/5${DE_LA_LISTA}`);
  assert.equal(accionSiguienteDocumento({ tipo: 'COT', id: 12, estado: 'BORRADOR', total_cop: 5 }, { returnTo: LISTA }).href,
    `/dashboard/ventas/cotizacion/12${DE_LA_LISTA}`);
  assert.equal(accionSiguienteDocumento({ tipo: 'VEN', id: 8, estado: 'PENDIENTE_COMPRA' }, { returnTo: LISTA }).href,
    `/dashboard/compras${DE_LA_LISTA}`);
  assert.equal(accionSiguienteDocumento(cot, { returnTo: LISTA }).href, null, 'un href null sigue siendo null');
  assert.equal(accionSiguienteDocumento(sc, {}).href, `/dashboard/ventas/venta/4${DEL_HUB_B4}`, 'por defecto, el Hub');
  // accionSiguienteSC también recibe returnTo (en su contexto); sin él, el Hub como siempre
  assert.equal(accionSiguienteSC({ tipo: 'SC', id: 5, estado: 'ASIGNADA', productos: [{ product_name: 'Cuna' }] },
    { cotizaciones: [], pedidos: [], returnTo: LISTA }).href, `/dashboard/ventas/solicitud/5${DE_LA_LISTA}`);
  assert.equal(accionSiguienteSC({ tipo: 'SC', id: 5, estado: 'ASIGNADA', productos: [{ product_name: 'Cuna' }] }).href,
    `/dashboard/ventas/solicitud/5${DEL_HUB_B4}`);
  assert.equal(desdeElHub('/dashboard/ventas/venta/3'), `/dashboard/ventas/venta/3${DEL_HUB_B4}`, 'desdeElHub no cambia');
}

console.log('--- B4 T2 TEST 9: ETIQUETA_GRUPO y tituloGrupo (RP67: «Sin resolver · n» solo en separadores) ---');
{
  assert.deepEqual({ ...ETIQUETA_GRUPO }, {
    ATRASADO: 'Atrasados', NO_RESUELTO: 'Sin resolver', ACCION_TOMADA: 'Acción tomada', CERRADO: 'Cerrados',
  });
  assert.ok(Object.isFrozen(ETIQUETA_GRUPO));
  assert.equal(tituloGrupo('ATRASADO', 3), 'Atrasados · 3');
  assert.equal(tituloGrupo('NO_RESUELTO', 5), 'Sin resolver · 5');
  assert.equal(tituloGrupo('ACCION_TOMADA', 40), 'Acción tomada · 40');
  assert.equal(tituloGrupo('CERRADO', 12), 'Cerrados · 12');
  assert.equal(tituloGrupo('ATRASADO', 0), 'Atrasados · 0');
  assert.equal(tituloGrupo('ATRASADO', '7'), 'Atrasados · 7');
  for (const n of [null, undefined, -1, NaN, 'x']) assert.equal(tituloGrupo('CERRADO', n), 'Cerrados · 0', String(n));
}

console.log('OK test_hub_ventas.mjs');
