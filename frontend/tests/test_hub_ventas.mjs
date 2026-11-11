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
  esSCConCotizacionTemprana, TIPOS_NOTA_REINICIAN_ATRASO, notaReiniciaAtraso, desdeElHub,
  cantidadPositiva, textoAtrasados, conDetalleDelEnvio,
  RUTA_HUB_VENTAS, ESTADOS_CERRADOS, clasificar, esAtrasado, columnaHub, accionSiguienteCOT, accionSiguientePVEN,
  accionSiguienteDocumento, ETIQUETA_GRUPO, tituloGrupo,
} from '../src/lib/hub-ventas.js';
// B4 T7: lo nuevo por el espacio de nombres, para que su falta no tape los demás rojos.
import * as hv from '../src/lib/hub-ventas.js';
import { destinoVolver, etiquetaVolver } from '../src/lib/detalle-layout.js';
import { ESTADOS_PEDIDO, ESTADOS_PEDIDO_CERRADOS, pasoPedido, esCotizacionActiva } from '../src/lib/estados-pedido.js';
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
  // B4 T7 (D27, RP15): la columna Acción usa accionSiguienteDocumento (hub-ventas.js), que lleva a la COT con el
  // return_to del Hub (desdeElHub): la protección de «Aprobar Venta» pasó a la librería.
  // B4 T24 f2 r1 (duda 2 + m15, D27): la Acción sale de accionDeLaFilaHub, que es accionSiguienteDocumento con el rol (sin permiso,
  // «Abrir»; su caso, en test_kanban_ventas).
  assert.ok(hub.includes("const accion = accionDeLaFilaHub(fila, { rol: acciones?.rol ?? '' });"), 'la Acción del Hub sale de accionDeLaFilaHub');
  for (const estado of ['BORRADOR', 'ENVIADA', 'VENCIDA']) {
    for (const total_cop of [0, 250000]) {
      assert.equal(accionSiguienteDocumento({ tipo: 'COT', id: 12, estado, total_cop }).href,
        desdeElHub('/dashboard/ventas/cotizacion/12'), `${estado} ${total_cop}: a la COT con el return_to del Hub`);
    }
  }
  assert.equal(accionSiguienteDocumento({ tipo: 'COT', id: 12, estado: 'CONFIRMADA' }).href, desdeElHub('/dashboard/ventas/cotizacion/12'));
  // E4: «Actualizar» no pasa su evento a loadData y un GET fallido ya no se convierte en una lista vacía.
  assert.ok(!hub.includes('onClick={loadData}'), 'Actualizar llama loadData() sin el evento');
  assert.ok(!/\.catch\(\(\)\s*=>\s*\[\]\)/.test(hub), 'loadData no cambia un GET fallido por []');
  // E1 y E5 (lista de solicitudes): el WhatsApp del envío con waUrl y el Análisis agrupado por el día UTC -> local.
  const lista = readFileSync(new URL('../src/app/dashboard/ventas/solicitud/solicitud-client.tsx', import.meta.url), 'utf8');
  assert.ok(!lista.includes('wa.me/57'), 'sin wa.me/57 armado a mano (duplicaba el 57)');
  assert.ok(!lista.includes('new Date(s.fecha_solicitud)'), 'la fecha de la SC pasa por comoUTC');
}

console.log('--- B4 T7 (RP86 y D28): la recarga del Hub sin perder lo que había y la última carga gana, con useListado ---');
{
  // T11 (E4, ronda 1) y la revisión final F4 protegían una carga de tres listas en memoria (fusionarCargaHub y
  // cargaRef). En B4 T7 el Hub carga con useListado, que aborta la consulta anterior y descarta la respuesta de una que
  // ya no es la vigente antes de tocar el estado (D28, crearCargaListado; lo prueba test_tabla.mjs) y conserva lo último
  // bueno cuando una recarga falla. fusionarCargaHub y AVISOS_CARGA_HUB se borran (RP86).
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal(typeof hv.fusionarCargaHub, 'undefined', 'RP86: fusionarCargaHub ya no existe');
  assert.equal(typeof hv.AVISOS_CARGA_HUB, 'undefined', 'RP86: AVISOS_CARGA_HUB ya no existe');
  // B4 T24 f2 (FINAL-m8, D27): con extra (limit=0 en Kanban, EXTRA_TABLERO).
  assert.match(hub, /const listado = useListado<FilaHub>\(\{\s*ruta: '\/ventas\/hub\/documentos', estado, conConteos: true, esperar: !listo, despachar, activo: !enAnalisis,\s*extra: enKanban \? EXTRA_TABLERO : null,\s*\}\);/,
    'la tabla carga con useListado (RP35, RP68, D40)');
  assert.ok(!/\b(cargaRef|ultimaCarga|fusionarCargaHub)\b/.test(hub), 'sin la carga en memoria de antes');
  const uso = readFileSync(new URL('../src/components/tabla/useListado.ts', import.meta.url), 'utf8');
  assert.ok(uso.includes('crearCargaListado({'), 'useListado: la carga que aborta la anterior y descarta las viejas (D28)');
  // Las tarjetas y la configuración, que siguen con su GET propio, tampoco pintan una respuesta vieja.
  // B4 T24 f2 (F45, D27): las tarjetas cargan con useResumen (components/ui), que aborta la anterior y descarta las viejas con la
  // MISMA carga de useListado (crearCargaListado; sus casos, en test_flujo.mjs «B4 T24 f2 (F45)»).
  assert.match(hub, /const stats = useResumen<StatsHub>\(`\/ventas\/stats\?periodo=\$\{PERIODO_KPI\}`, vueltaStats\);/, 'stats: con el hook');
  const usoResumen = readFileSync(new URL('../src/components/ui/useResumen.ts', import.meta.url), 'utf8');
  assert.ok(usoResumen.includes('crearCargaListado({') && usoResumen.includes('return () => carga.cancelar();'), 'stats: aborta la anterior');
  const cfg = hub.slice(hub.indexOf("apiFetch('/ventas/config')"), hub.indexOf('}, [vueltaConfig, avisar]);'));
  assert.match(cfg, /\.then\(\(cfg: unknown\) => \{\s*if \(!vigente\) return;/, 'config: una respuesta vieja no pinta');
  assert.match(cfg, /\.catch\(\(err: unknown\) => \{\s*if \(!vigente\) return;/, 'config: el error de una vieja no avisa');
  assert.ok(cfg.includes('return () => { vigente = false; };'), 'config: la última gana');
  // E4: si la configuración falla, un aviso con el texto de siempre, y la de pantalla sigue (solo se pisa con una buena).
  assert.ok(cfg.includes("avisar('No se pudo cargar la configuración de alertas.', { tono: 'error' });"), 'config: el aviso');
  // B4 T7 r1 (m12): el desenvolvimiento va en configDeRespuesta (lib/listas-ventas.js, con sus casos en test_listas_ventas).
  assert.match(cfg, /const datos = configDeRespuesta\(cfg\);\s*if \(datos\) setAlertDias\(datos\);/, 'config: solo con una respuesta buena');
}

console.log('--- B4 T7 (R6, C4, R2, RP6): el Hub ya no tiene arreglos en memoria ni llamadas viejas ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Sin los comentarios ({/* */}, /* */ y //): lo que se mira es el código.
  const codigo = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  for (const nombre of ['allData', 'filteredData', 'noResueltosList', 'atrasadosList', 'accionesTomadasList', 'scAtrasadas',
    'cotAtrasadas', 'venAtrasadas', 'isDocAtrasado', 'getKanbanCol', 'handleDragStart', 'handleDrop', 'kpiCards',
    'totalFacturadoCOP', 'colorMap', 'handleAskAI', 'analytics', 'analyticsRange', 'analyticsTopN', 'analyticsProduct',
    'aiQuestion', 'aiResponse', 'aiLoading', 'loadAnalytics', 'mapaSeguimiento', 'resumenVentasLocal', 'PREDICADOS_KPI_HUB']) {
    assert.ok(!new RegExp(`\\b${nombre}\\b`).test(codigo), `sin ${nombre}`);
  }
  for (const viejo of ['limit=200', '/ventas/analytics', '/ventas/ai-chat', '/ventas/alertas', '/ventas/solicitudes?', '/ventas/cotizaciones?', '/ventas/pedidos?']) {
    assert.ok(!codigo.includes(viejo), `sin ${viejo}`);
  }
  // C4: la tabla y el tablero piden al servidor con el mismo estado; el tablero, con columna=<clave> (RP10, D39).
  assert.ok(codigo.includes("modo: 'servidor',") && codigo.includes('queryListado(estado, { columna: columna.clave, orden, limit, offset })'),
    'el tablero en modo servidor con el estado único');
  assert.ok(codigo.includes("ordenDe: (c) => (c.cerrada ? 'reciente' : 'atencion'),"), 'D39: atención en las abiertas y reciente en Cancelado');
  // R6: las tarjetas de /ventas/stats?periodo=30d, sin respaldo local; RP70: los nombres del catálogo.
  for (const kpi of ['vendido_periodo', 'pven_saldo_por_cobrar', 'ticket_promedio', 'cot_conversion']) {
    assert.ok(codigo.includes(`<TarjetaKpi kpi="${kpi}"`), `la tarjeta ${kpi}`);
  }
  assert.ok(!/<TarjetaKpi[^>]*\betiqueta=/.test(codigo), 'RP70: sin etiquetas escritas en la página');
  assert.ok(!/<TarjetaKpi[^>]*\bonClick=/.test(codigo), 'R6: las tarjetas del Hub no son pulsables');
  // RP35: la pestaña Análisis no es una vista de la tabla.
  assert.ok(!/vista:\s*'analisis'|valor:\s*'analisis'/.test(codigo), 'nunca vista=analisis');
  // Sin emojis en el código (pestañas, botones y avisos).
  assert.ok(!/\p{Extended_Pictographic}/u.test(codigo.replace(/[✓→↑↓×·—…]/g, '')), 'sin emojis');
}

console.log('--- B4 T7 r1 (A3): Análisis es la 7.ª pestaña de la barra (pestanaAparte), sin el selector aparte ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // El selector «Documentos / Análisis» se borró: ni su tablist ni sus pestañas ni su teclado.
  for (const viejo of ['SECCIONES_HUB', 'Apartados del Hub', 'teclaSecciones', 'botonesSeccion', 'idSecciones', 'role="tablist"', 'role="tabpanel"', 'TABS_BAR']) {
    assert.ok(!codigo.includes(viejo), `sin ${viejo}`);
  }
  // La barra lleva la aparte y la página la conecta con su estado (RP35: nunca vista=analisis).
  assert.match(codigo, /<BarraTabla[\s\S]*?pestanaAparte=\{\{ id: 'analisis', etiqueta: 'Análisis', activa: enAnalisis, onCambiar: alCambiarAparte \}\}/);
  assert.match(codigo, /const alCambiarAparte = useCallback\(\(activa: boolean\) => \{\s*if \(activa !== enAnalisis\) cambiarSeccion\(activa \? 'analisis' : 'documentos'\);\s*\}, \[enAnalisis, cambiarSeccion\]\);/);
  assert.match(codigo, /activo: !enAnalisis,/, 'useListado sigue apagado en Análisis');
  // Con Análisis, la barra queda en su lugar y debajo va el panel, en lugar de la tabla o el tablero.
  const barra = codigo.indexOf('<BarraTabla');
  const panel = codigo.indexOf('<PanelAnalisisPerezoso');
  assert.ok(barra > 0 && panel > barra, 'el panel va debajo de la barra');
  assert.match(codigo, /\{!enAnalisis && estado\.modo === 'lista' && \(\s*<AccionesFila\.Provider/, 'la tabla, solo en Documentos');
  assert.match(codigo, /\{enAnalisis \? \(\s*<PanelAnalisisPerezoso[\s\S]*?\/>\s*\) : estado\.modo === 'kanban' \? \(\s*(?:\/\/[^\n]*\n\s*)?!accesoTablero\.listo \? <EsqueletoTablero \/> : <TableroKanban/, 'el panel, en lugar del tablero (r2, m2, D27: el esqueleto con el rol vacío)');
  // D-7: ?tab=analisis abre en Análisis y volver a Documentos limpia la URL con router.replace. B4 T24 (FINAL-C3, D27): la
  // sección arranca en Documentos y el useLayoutEffect de montaje la pasa a Análisis con la URL ya nueva (después del commit).
  assert.match(codigo, /useState<SeccionHub>\('documentos'\)/);
  assert.match(codigo, /if \(inicio\.seccion\) setSeccion\(inicio\.seccion\);/);
  assert.match(codigo, /if \(s === 'documentos' && leerEnlaceHub\(window\.location\.search\)\.analisis\) router\.replace\(RUTA_HUB_VENTAS\);/);
  // D-9: tocar un paso o el semáforo vuelve a Documentos.
  assert.equal((codigo.match(/if \(enAnalisis\) cambiarSeccion\('documentos'\);/g) ?? []).length, 2);
  // B4 T7 r2 (I-r1): al entrar directo en Análisis no hay conteos y nada carga (RP35). Las 6 pestañas de vista dan
  // conteo null (no 0) y estadoConteos sale de useListado, así que BarraTabla, con la aparte activa, no pinta sus
  // pastillas (estadoPastillaPestana de lib/tabla.js, TEST 42 de test_tabla.mjs).
  for (const id of ['todos', 'no_resueltos', 'sc', 'cot', 'ven', 'acciones_tomadas']) {
    assert.ok(codigo.includes(`conteo: conteos?.pestanas?.${id} ?? null`), `I-r1: ${id} sin conteo da null`);
  }
  assert.match(codigo, /const estadoConteos = useEstadoKpi\(listado\.cargandoInicial \|\| listado\.recargando, listado\.error\);/);
  assert.match(codigo, /pestanas=\{pestanas\}\s*pestanaAparte=\{\{ id: 'analisis', etiqueta: 'Análisis', activa: enAnalisis, onCambiar: alCambiarAparte \}\}\s*estadoConteos=\{estadoConteos\}/);
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
  // B4 T7 (D27): el corte termina en el cierre de la función (antes, en el comentario de las tarjetas que se borraron).
  const inicioEnvio = hub.indexOf('async function confirmarEnvioHub(');
  const confirmar = hub.slice(inicioEnvio, hub.indexOf('\n  }\n', inicioEnvio));
  assert.ok(inicioEnvio > 0 && confirmar.includes('setEnviandoHub(false);'), 'se encontró confirmarEnvioHub entera');
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

console.log('--- B4 T24 f2 (duda 3 de f1): claveAccionSiguientePVEN — qué acción da accionSiguientePVEN, sin el texto de la interfaz ---');
{
  assert.equal(typeof hv.claveAccionSiguientePVEN, 'function');
  const p = (estado, saldo = 0) => ({ tipo: 'VEN', id: 8, estado, saldo_cop: saldo });
  const TEXTO = { facturar: 'Facturar', comprar: 'Gestionar compra', ver: 'Ver pedido', cobrar: 'Cobrar saldo', despachar: 'Despachar' };
  // La misma rama de accionSiguientePVEN, en todos los estados que conoce el servidor, con y sin saldo, y en uno desconocido.
  for (const estado of [...Object.keys(ESTADOS_PEDIDO), 'ALGO_NUEVO', null]) {
    for (const saldo of [0, 500]) {
      const clave = hv.claveAccionSiguientePVEN(p(estado, saldo));
      const accion = accionSiguientePVEN(p(estado, saldo));
      assert.equal(clave === null ? null : TEXTO[clave], accion?.texto ?? null, `${estado} ${saldo}`);
    }
  }
  assert.equal(hv.claveAccionSiguientePVEN(p('LISTO_ENTREGA', 500)), 'cobrar');
  assert.equal(hv.claveAccionSiguientePVEN(p('LISTO_ENTREGA', 0)), 'despachar');
  for (const nada of [null, undefined, 'PVEN-1', 5]) assert.equal(hv.claveAccionSiguientePVEN(nada), null, String(nada));
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

console.log('--- B4 T7 TEST 1: scConCotDeFilas — las SC con una cotización activa, de las filas cargadas (RP36) ---');
{
  const filas = [
    { tipo: 'SC', id: 1, cotizaciones: [{ id: 10, numero: 'COT-10', estado: 'BORRADOR' }] },
    { tipo: 'SC', id: 2, cotizaciones: [{ id: 11, numero: 'COT-11', estado: 'RECHAZADA' }] },
    { tipo: 'SC', id: 3, cotizaciones: [{ id: 12, estado: 'RECHAZADA' }, { id: 13, estado: 'VENCIDA' }] },
    { tipo: 'SC', id: 4 },
    { tipo: 'SC', id: 5, cotizaciones: null },
    { tipo: 'SC', id: 8, cotizaciones: [null, { estado: 'PENDIENTE_CONFIRMACION' }] },
    // Las COT y los pedidos no cuentan aunque traigan una lista con ese nombre (los ids de SC, COT y PVEN coinciden).
    { tipo: 'COT', id: 6, cotizaciones: [{ id: 14, estado: 'BORRADOR' }] },
    { tipo: 'VEN', id: 7, cotizaciones: [{ id: 15, estado: 'BORRADOR' }] },
    null,
    undefined,
  ];
  const conCot = hv.scConCotDeFilas(filas);
  assert.ok(conCot instanceof Set, 'un Set, como el scConCot de reglaSoltarHub');
  assert.deepEqual([...conCot].sort((a, b) => a - b), [1, 3, 8]);
  // La misma regla de esCotizacionActiva (VENCIDA cuenta como activa, choque H3), estado por estado.
  for (const estado of Object.keys(ESTADOS_COTIZACION)) {
    assert.equal(hv.scConCotDeFilas([{ tipo: 'SC', id: 9, cotizaciones: [{ estado }] }]).has(9), esCotizacionActiva(estado), estado);
  }
  // La misma SC en la tabla y en el tablero cuenta una vez; nada da un Set vacío.
  assert.equal(hv.scConCotDeFilas([filas[0], { ...filas[0] }]).size, 1);
  for (const nada of [undefined, null, [], 'x']) assert.equal(hv.scConCotDeFilas(nada).size, 0, String(nada));
  assert.deepEqual(filas[0].cotizaciones, [{ id: 10, numero: 'COT-10', estado: 'BORRADOR' }], 'no muta las filas');
}

console.log('--- B4 T7 TEST 2: ordenEsAtencion y textoOrdenHub (R6: «Orden: Monto ↓ · Atención primero») ---');
{
  // Sin orden o con 'atencion' la tabla va en el orden del semáforo (con separadores y sin el chip).
  for (const o of [null, undefined, '', 'atencion']) assert.equal(hv.ordenEsAtencion(o), true, String(o));
  for (const o of ['monto', '-monto', 'numero', 'reciente', 'sin_movimiento', '-atencion']) assert.equal(hv.ordenEsAtencion(o), false, o);
  const titulos = { monto: 'Monto', numero: 'Número', cliente: 'Cliente', estado: 'Estado' };
  assert.equal(hv.textoOrdenHub('monto', titulos), 'Orden: Monto ↑');
  assert.equal(hv.textoOrdenHub('-monto', titulos), 'Orden: Monto ↓');
  assert.equal(hv.textoOrdenHub('-numero', titulos), 'Orden: Número ↓');
  assert.equal(hv.textoOrdenHub('estado', titulos), 'Orden: Estado ↑');
  for (const o of [null, undefined, '', 'atencion']) assert.equal(hv.textoOrdenHub(o, titulos), null, String(o));
  // Un campo sin título sale humanizado (nunca el código crudo); sin títulos también.
  assert.equal(hv.textoOrdenHub('-dias_creado', titulos), 'Orden: Dias creado ↓');
  assert.equal(hv.textoOrdenHub('monto'), 'Orden: Monto ↑');
  assert.equal(hv.textoOrdenHub('cliente', { cliente: '' }), 'Orden: Cliente ↑', 'un título vacío no cuenta');
}

console.log('--- B4 T7 r1 TEST 3 (I1, m11 y m4): focoEnlaceTras, filaDelHub y la flecha de un orden inverso ---');
{
  // I1: el foco del enlace (?foco=) es el focoInicial de la pestaña Análisis hasta que el usuario elige un foco o vuelve
  // a los documentos (donde la URL se limpia); después, null: la pestaña abre en lo guardado (analisis:ventas).
  assert.equal(hv.focoEnlaceTras('cot', { tipo: 'elegir' }), null);
  assert.equal(hv.focoEnlaceTras('cot', { tipo: 'documentos' }), null);
  assert.equal(hv.focoEnlaceTras('cot', { tipo: 'analisis' }), 'cot', 'abrir Análisis no lo cambia');
  assert.equal(hv.focoEnlaceTras('cot', null), 'cot');
  assert.equal(hv.focoEnlaceTras(null, { tipo: 'analisis' }), null);
  assert.equal(hv.focoEnlaceTras(undefined, {}), null);
  // El caso de la revisión: ?tab=analisis&foco=cot, elige «Todo», va a Documentos y vuelve a Análisis.
  let foco = 'cot';
  for (const tipo of ['elegir', 'documentos', 'analisis']) foco = hv.focoEnlaceTras(foco, { tipo });
  assert.equal(foco, null, 'abre en lo que eligió el usuario, no en Cotizaciones');
  // Sin elegir nada: ir a Documentos también lo suelta.
  assert.equal(hv.focoEnlaceTras(hv.focoEnlaceTras('cot', { tipo: 'documentos' }), { tipo: 'analisis' }), null);

  // m11: la fila de una clave entre las cargadas y, como último recurso, el documento del panel rápido si es ese (el
  // pedido que salió de la página por un filtro se sigue pudiendo cancelar desde el panel, como en 372f71c).
  const filas = [{ tipo: 'SC', id: 1 }, { tipo: 'VEN', id: 7, estado: 'EN_PROCESO' }];
  const panel = { tipo: 'VEN', id: 9, estado: 'PENDIENTE_COMPRA' };
  assert.equal(hv.filaDelHub(filas, 'VEN|7', panel), filas[1]);
  assert.equal(hv.filaDelHub(filas, 'VEN|9', panel), panel, 'el del panel');
  assert.equal(hv.filaDelHub(filas, 'SC|9', panel), undefined, 'otro tipo con el mismo id, no');
  assert.equal(hv.filaDelHub(filas, 'VEN|7', { tipo: 'VEN', id: 7, estado: 'X' }), filas[1], 'la cargada gana');
  assert.equal(hv.filaDelHub(null, 'VEN|9', panel), panel);
  assert.equal(hv.filaDelHub(filas, 'VEN|9', null), undefined);
  assert.equal(hv.filaDelHub(filas, 'VEN|9'), undefined);

  // m4: en una columna de orden inverso la flecha dice lo que ve el usuario: «Antigüedad ↑» (la más nueva primero) es
  // -creado y «Antigüedad ↓» es creado.
  const titulos = { creado: 'Antigüedad', monto: 'Monto' };
  assert.equal(hv.textoOrdenHub('-creado', titulos, { inversos: ['creado'] }), 'Orden: Antigüedad ↑');
  assert.equal(hv.textoOrdenHub('creado', titulos, { inversos: ['creado'] }), 'Orden: Antigüedad ↓');
  assert.equal(hv.textoOrdenHub('-monto', titulos, { inversos: ['creado'] }), 'Orden: Monto ↓', 'las demás, como siempre');
  assert.equal(hv.textoOrdenHub('creado', titulos), 'Orden: Antigüedad ↑', 'sin inversos, como siempre');
  assert.equal(hv.textoOrdenHub('creado', titulos, { inversos: null }), 'Orden: Antigüedad ↑');
}

console.log('--- B4 T7 r1 (B): el foco del enlace, la fila de último recurso, los tonos de fila y la fuente única ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = hub.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // m1 (R2): el texto «En construcción» vive solo en AsistenteEnConstruccion.tsx, tampoco en los comentarios de la página.
  assert.ok(!hub.includes('En construcci'), 'm1: sin «En construcción» en page.tsx');
  // I1: el foco del enlace en un estado propio, suelto al elegir un foco y al volver a los documentos. B4 T24 (FINAL-C3, D27):
  // arranca en null y lo pone el useLayoutEffect de montaje con la URL nueva.
  assert.match(codigo, /const \[focoEnlace, setFocoEnlace\] = useState<string \| null>\(null\);/);
  assert.match(codigo, /if \(inicio\.foco\) setFocoEnlace\(inicio\.foco\);/);
  assert.match(codigo, /if \(s === 'documentos'\) setFocoEnlace\(\(f\) => focoEnlaceTras\(f, \{ tipo: 'documentos' \}\)\);/);
  assert.match(codigo,
    /const alCambiarFoco = useCallback\(\(foco: string\) => \{\s*setFocoEnlace\(\(f\) => focoEnlaceTras\(f, \{ tipo: 'elegir' \}\)\);\s*router\.replace\(`\$\{RUTA_HUB_VENTAS\}\?tab=analisis&foco=\$\{foco\}`\);\s*\}, \[router\]\);/);
  assert.match(codigo, /focoInicial=\{focoEnlace\}\s*alCambiarFoco=\{alCambiarFoco\}/);
  assert.ok(!codigo.includes('focoInicial={enlace.foco}'), 'sin la foto del montaje');
  // m11: filaPorId con el panel rápido como último recurso.
  assert.match(codigo, /const filaPorId = useCallback\(\(idStr: string\) => filaDelHub\(filasCargadas, idStr, quickDetailDoc\), \[filasCargadas, quickDetailDoc\]\);/);
  // m3 y m14 (D41): no resueltas con el tono opaco filaAviso; las atrasadas con filaAlerta y la marca rosa a la izquierda
  // (una sombra en la primera celda, que no es un tinte y no rompe la casilla fija).
  assert.match(codigo, /const MARCA_ATRASO = '\[&>td:first-child\]:shadow-\[inset_3px_0_0_var\(--color-rose-500\)\]';/);
  assert.match(codigo,
    /const claseDeFila = \(f: FilaHub\) => \(f\.resolucion === 'ATRASADO' \? `\$\{TABLE\.filaAlerta\} \$\{MARCA_ATRASO\}`\s*: f\.resolucion === 'NO_RESUELTO' \? TABLE\.filaAviso : null\);/);
  // m4 y m8: Antigüedad se ordena (orden inverso: ↑ manda -creado) y sin dato pinta «—» en gris; la de una atrasada, en
  // rojo y negrita (372f71c).
  assert.match(codigo, /\{ id: 'antiguedad', titulo: 'Antigüedad', ancho: 96, ordenable: 'creado', ordenInverso: true,/);
  assert.match(codigo, /const dias = Number\.isFinite\(fila\.dias_creado\) \? Math\.floor\(fila\.dias_creado as number\) : null;/);
  assert.match(codigo, /if \(dias === null\) return <span className="text-xs text-slate-400">—<\/span>;/);
  assert.match(codigo, /fila\.resolucion === 'ATRASADO' \? 'font-bold text-rose-600' : undefined/);
  assert.ok(!codigo.includes('Number(f.dias_creado) || 0'), 'm8: sin «hoy» para un dato que falta');
  // m6: el valor del contexto es estable. B4 T24 f2 (m8 de la revisión r0 de f1, D27): con `mover`, que solo cambia con el rol.
  assert.match(codigo,
    // B4 T24 f2 r1 (duda 2 + m15, D27): el contexto lleva también el rol (la columna Acción).
    /const accionesFila = useMemo<AccionesFilaHub>\(\s*\(\) => \(\{ abrir: openDocDetail, actividad: setActRow, cancelar: abrirCancelacion, mover: accesoTablero\.mover, rol \}\),\s*\[openDocDetail, abrirCancelacion, accesoTablero\.mover, rol\],\s*\);/);
  // m7: fuente única. (a) los chips con CLASE_CHIP de components/ui/Kanban.tsx; (b) los títulos del orden con
  // campoOrden y solo de las columnas que se ordenan (y las de orden inverso, aparte); (d) una sola sigla de tipo.
  assert.ok(!codigo.includes('CHIP_TONO'), 'm7a: sin CHIP_TONO');
  const kanban = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8');
  assert.match(kanban, /^export const CLASE_CHIP: Record<string, string> = \{/m, 'm7a: Kanban.tsx exporta CLASE_CHIP');
  assert.match(codigo, /\bCLASE_CHIP,\s*\} from '@\/components\/ui';/, 'm7a: la página la toma de components/ui');
  assert.equal((codigo.match(/CLASE_CHIP\[[^\]]+\] \?\? CLASE_CHIP\.slate/g) ?? []).length, 2, 'm7a: los dos chips de Resolución');
  assert.match(codigo,
    /const TITULOS_ORDEN_HUB: Record<string, string> = Object\.fromEntries\(\s*COLUMNAS_TABLA_HUB\.flatMap\(\(c\) => \{ const campo = campoOrden\(c\); return campo \? \[\[campo, c\.titulo\]\] : \[\]; \}\),\s*\);/);
  assert.match(codigo, /const INVERSOS_ORDEN_HUB = COLUMNAS_TABLA_HUB\.filter\(\(c\) => c\.ordenInverso\)\.map\(\(c\) => campoOrden\(c\)\);/);
  assert.match(codigo, /textoOrdenHub\(estado\.orden, TITULOS_ORDEN_HUB, \{ inversos: INVERSOS_ORDEN_HUB \}\)/);
  assert.ok(!/=== 'VEN' \? 'PVEN'/.test(codigo), "m7d: sin otro t === 'VEN' ? 'PVEN'");
  assert.match(codigo, /\{siglaDeTipo\(f\.tipo\)\}/);
  // m9: (a) la acción sin enlace no parece pulsable; (b) un solo tamaño de letra en cada chip.
  assert.match(codigo, /const TONO_ACCION_QUIETO: Record<string, string> = Object\.fromEntries\(/);
  assert.match(codigo, /<span title=\{accion\.texto\} className=\{`\$\{BASE_ACCION\} cursor-default \$\{TONO_ACCION_QUIETO\[clave\] \?\? TONO_ACCION_QUIETO\.slate\}`\}>/);
  assert.ok(!/text-\[1\dpx\][^`'"]*text-\[1\dpx\]/.test(codigo.match(/const CHIP = '[^']*'/)?.[0] ?? ''), 'm9b');
  assert.ok(!/const CHIP = '[^']*text-\[/.test(codigo), 'm9b: la base del chip no lleva tamaño de letra');
  assert.match(codigo, /className=\{`\$\{CHIP\} text-\[11px\] \$\{clases\}`\}/, 'm9b: la insignia, en 11 px');
  assert.equal((codigo.match(/`\$\{CHIP\} text-\[10px\] \$\{CLASE_CHIP/g) ?? []).length, 2, 'm9b: los chips de Resolución, en 10 px');
}

console.log('--- B4 T7 r1b (duda 3): el contenedor del Hub reserva el lugar del botón flotante de la IA ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // El botón de GlobalAIChat (fixed bottom-6 right-6 w-14 h-14) ocupa los 80 px de abajo de la ventana. Con pb-24
  // (96 px) en el contenedor del Hub, con la página al fondo, el pie de la tabla, el tablero y el panel de Análisis
  // quedan por encima. En la pantalla completa sigue el pr-20 del pie (D41).
  // B4 T24 f2 (F44-a, D27): con el token RESERVA_BOTON_IA (pb-24) de design-system.ts.
  assert.ok(hub.includes('<div className={`flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`}>'));
  assert.ok(readFileSync(new URL('../src/lib/design-system.ts', import.meta.url), 'utf8').includes("export const RESERVA_BOTON_IA = 'pb-24';"), 'el token es pb-24');
  assert.ok(!hub.includes('px-4 xl:px-8 py-6 max-w-[1600px]'), 'sin el py-6 de antes');
  const ia = readFileSync(new URL('../src/components/GlobalAIChat.tsx', import.meta.url), 'utf8');
  assert.ok(ia.includes('fixed bottom-6 right-6 w-14 h-14'), 'el botón mide lo que la reserva supone (24 + 56 = 80 px < 96)');
  const tabla = readFileSync(new URL('../src/lib/design-system.ts', import.meta.url), 'utf8');
  assert.ok(tabla.includes('[&_[data-pie-tabla]]:pr-20'), 'en la pantalla completa, el pr-20 del pie (D41)');
}

console.log('--- B4 T24 f2 (F50, F53): el «vacío» del Hub memoizado y su confirmación de Facturado la de Pedidos ---');
{
  const sinComentarios = (t) => t.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const hub = sinComentarios(readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8'));
  // F50 (D41): el vacío se memoiza con la búsqueda (como la lista de SC, m8 de T8 r1): un JSX nuevo en cada render anulaba el memo de
  // CuerpoTabla y repintaba todas las filas.
  assert.match(hub, /const vacioHub = useMemo\(\(\) => \([\s\S]*?\), \[estado\.q\]\);/);
  assert.match(hub, /vacio=\{vacioHub\}/);
  assert.ok(!/vacio=\{\(/.test(hub), 'sin el JSX en línea');
  // F53: el panel rápido confirma Facturado con confirmacionFacturarPedido (kanban-ventas.js), la MISMA del tablero de Pedidos.
  assert.match(hub, /import \{[^}]*\bconfirmacionFacturarPedido\b[^}]*\} from '@\/lib\/kanban-ventas';/);
  assert.match(hub, /if \(await confirmar\(confirmacionFacturarPedido\(doc\)\)\) cambiarEstadoPedido\(doc, 'FACTURADO'\);/);
  assert.ok(!hub.includes("titulo: `Marcar ${doc.numero} como Facturado`"), 'sin el texto escrito a mano');
}

console.log('--- B4 T24 f2 (m8 de la revisión r0 de f1): el Hub ofrece cancelar y cambiar de estado solo a quien puede (require_roles) ---');
{
  // opcionesPanelPedido: lo que el panel rápido ofrece con el permiso del rol. PATCH /ventas/pedidos/{id} (estado, Facturado y
  // Cancelado) es de ADMIN y ASESOR (accesoTableroVentas.mover; BODEGA solo pone ENTREGADO con la bodega, desde Entregas). Sin
  // permiso queda «Despachar en Entregas» (un enlace: Entregas decide) y nada que mande un PATCH.
  assert.equal(typeof hv.opcionesPanelPedido, 'function', 'opcionesPanelPedido existe');
  for (const estado of [...Object.keys(ESTADOS_PEDIDO), 'ALGO_NUEVO']) {
    assert.deepEqual(hv.opcionesPanelPedido(estado, true), opcionesEstadoPVEN(estado), `${estado}: con permiso, lo de siempre`);
    const sin = hv.opcionesPanelPedido(estado, false);
    assert.deepEqual(sin, { mover: [], despachar: opcionesEstadoPVEN(estado).despachar, cancelar: false, facturar: false }, `${estado}: sin permiso`);
    // r1 (m13 + m37, D27): con el tercer parámetro (si el rol despacha: puedeAccionPedido('despachar')), el enlace solo para quien
    // despacha; sin él (aditivo), como antes.
    assert.deepEqual(hv.opcionesPanelPedido(estado, false, true), sin, `${estado}: BODEGA conserva el enlace`);
    assert.deepEqual(hv.opcionesPanelPedido(estado, false, false), { mover: [], despachar: false, cancelar: false, facturar: false }, `${estado}: FINANZAS, COMPRAS y CONSULTA`);
    assert.deepEqual(hv.opcionesPanelPedido(estado, true, true), opcionesEstadoPVEN(estado), `${estado}: ADMIN y ASESOR`);
  }
  // Por rol, con las piezas de la pantalla: el panel de un pedido listo para entrega.
  const { accesoTableroVentas, puedeAccionPedido } = await import('../src/lib/roles.js');
  const panel = (rol) => hv.opcionesPanelPedido('LISTO_ENTREGA', accesoTableroVentas(rol).mover, puedeAccionPedido('despachar', rol));
  assert.equal(panel('BODEGA').despachar, true, 'BODEGA: «Despachar en Entregas →»');
  for (const rol of ['FINANZAS', 'COMPRAS', 'CONSULTA']) assert.deepEqual(panel(rol), { mover: [], despachar: false, cancelar: false, facturar: false }, rol);
  assert.deepEqual(panel('ASESOR'), opcionesEstadoPVEN('LISTO_ENTREGA'));
  const sinComentarios = (t) => t.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const hub = sinComentarios(readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8'));
  // La fila: «Cancelar documento» (POST /solicitudes/{id}/cancelar y PATCH de COT y PVEN: ADMIN y ASESOR) solo con mover.
  // r1 (duda 2 + m15, D27): el contexto suma el rol (la columna Acción); `mover` sigue.
  assert.match(hub, /type AccionesFilaHub = \{\s*abrir: \(f: FilaHub\) => void; actividad: \(f: FilaHub\) => void; cancelar: \(ids: string\[\]\) => void; mover: boolean; rol: string;\s*\};/);
  assert.match(hub, /oculto: !acciones\?\.mover \|\| Boolean\(motivoNoCancelable\(fila\)\) \}/);
  assert.match(hub, /\(\) => \(\{ abrir: openDocDetail, actividad: setActRow, cancelar: abrirCancelacion, mover: accesoTablero\.mover, rol \}\),\s*\[openDocDetail, abrirCancelacion, accesoTablero\.mover, rol\],/);
  // Sin permiso, sin casillas (la barra masiva ya no sale: FINAL-m38).
  assert.match(hub, /seleccion=\{accesoTablero\.mover \? seleccion : undefined\}\s*onSeleccion=\{accesoTablero\.mover \? alSeleccionar : undefined\}/);
  // El panel rápido: los botones de estado, Facturado y Cancelar salen de opcionesPanelPedido con el permiso.
  // r1 (m13 + m37, D27): con quién despacha; sin nada que el rol pueda hacer, la sección no se pinta.
  assert.match(hub, /const op = opcionesPanelPedido\(quickDetailDoc\.estado, accesoTablero\.mover, puedeAccionPedido\('despachar', rol\)\);\s*if \(!accesoTablero\.mover && !op\.despachar\) return null;/);
  assert.ok(!/opcionesEstadoPVEN\(quickDetailDoc\.estado\)/.test(hub), 'el panel ya no ofrece lo que el rol no puede');
}

console.log('--- B4 T24 f2 (FINAL-m8, FINAL-m9, FINAL-m28): el Hub en Kanban sin la página de la tabla, el error del tablero y una sola insignia ---');
{
  const sinComentarios = (t) => t.replace(/\r\n/g, '\n').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const hub = sinComentarios(readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8'));
  // FINAL-m8: en Kanban la tabla no pide filas (limit=0, EXTRA_TABLERO, como Solicitudes, Cotizaciones y Pedidos): las pestañas y el
  // total siguen llegando (con_conteos) y scConCot ya trae las tarjetas del tablero (RP36). Al volver a Lista, mientras la última
  // respuesta sea la de Kanban, la tabla está cargando y el total en 'cargando' (llegadaDeListado): nunca «No hay documentos».
  assert.match(hub, /^const EXTRA_TABLERO = \{ limit: 0 \};$/m);
  assert.match(hub, /const enKanban = estado\.modo === 'kanban';/);
  assert.match(hub, /activo: !enAnalisis,\s*extra: enKanban \? EXTRA_TABLERO : null,\s*\}\);/);
  assert.match(hub, /const \[llegada, setLlegada\] = useState\(\(\) => llegadaDeListado\(null, null, false\)\);\s*const llegadaAhora = llegadaDeListado\(llegada, listado\.crudo, enKanban\);\s*if \(llegadaAhora !== llegada\) setLlegada\(llegadaAhora\);\s*const sinPagina = !enKanban && llegadaAhora\.sinFilas && !listado\.error;/);
  assert.match(hub, /total=\{sinPagina \? null : listado\.total\}\s*cargando=\{listado\.cargandoInicial \|\| sinPagina\}/, 'la tabla');
  assert.match(hub, /total=\{sinPagina \? null : listado\.total\}\s*estadoTotal=\{estadoDelTotal\(\{\s*total: listado\.total, cargando: listado\.cargandoInicial \|\| sinPagina, recargando: listado\.recargando, error: listado\.error,\s*\}\)\}/, 'la barra');
  // FINAL-m9: si el PATCH de un cambio desde el tablero falla, el Hub y Cotizaciones aplican la regla única recargarTrasError (las
  // pestañas y la franja, no el tablero: D39) y el error sigue para que el tablero deshaga. Como Pedidos desde T10 r1 (m4).
  assert.match(hub, /import \{[^}]*\brecargarTrasError\b[^}]*\} from '@\/lib\/avisos';/);
  assert.match(hub, /async function cambiarDesdeTablero\(fila: FilaHub, resultado: \{ estado: string \}\) \{\s*const ruta = fila\.tipo === 'SC' \? 'solicitudes' : fila\.tipo === 'COT' \? 'cotizaciones' : 'pedidos';\s*try \{\s*await apiFetch\(`\/ventas\/\$\{ruta\}\/\$\{fila\.id\}`, \{\s*method: 'PATCH', body: JSON\.stringify\(\{ estado: resultado\.estado, updated_by: autorActual\(\) \}\),\s*\}\);\s*\} catch \(err\) \{\s*if \(recargarTrasError\(err\)\) \{ recargarListado\(\); setRecargaFlujo\(\(n\) => n \+ 1\); \}\s*throw err;\s*\}\s*recargarListado\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*\}/);
  const cot = sinComentarios(readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8'));
  assert.match(cot, /async function cambiarDesdeTablero\(cot: FilaCOT, resultado: \{ estado: string \}\) \{\s*try \{\s*await apiFetch\(`\/ventas\/cotizaciones\/\$\{cot\.id\}`, \{\s*method: 'PATCH', body: JSON\.stringify\(\{ estado: resultado\.estado, updated_by: autorActual\(\) \}\),\s*\}\);\s*\} catch \(err\) \{\s*if \(recargarTrasError\(err\)\) \{ recargarListado\(\); setRecargaFlujo\(\(n\) => n \+ 1\); \}\s*throw err;\s*\}\s*recargarListado\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*\}/);
  for (const [nombre, codigo] of [['Hub', hub], ['Cotizaciones', cot]]) {
    const cambiar = codigo.slice(codigo.indexOf('async function cambiarDesdeTablero('), codigo.indexOf('\n  }\n', codigo.indexOf('async function cambiarDesdeTablero(')));
    assert.ok(cambiar.length > 100 && !/tablero\.recargar|recargarTablero/.test(cambiar), `${nombre}: el arrastre no recarga el tablero a mano (D39: lo hace deshacer)`);
  }
  // La regla (F8): un 409 (otra cotización activa, N7), un 400, un 422 o la red cortada recargan; un 500 o un 403, no.
  const { recargarTrasError } = await import('../src/lib/avisos.js');
  for (const s of [400, 409, 422]) assert.equal(recargarTrasError(Object.assign(new Error('x'), { status: s })), true, String(s));
  for (const s of [403, 500]) assert.equal(recargarTrasError(Object.assign(new Error('x'), { status: s })), false, String(s));
  // FINAL-m28: el panel rápido pinta el estado con la MISMA InsigniaEstado de la tabla (estadoDeTarjeta de lib/kanban-ventas.js, la
  // fuente única: GC:11), sin un mapa de colores propio ni otra búsqueda de la etiqueta.
  assert.ok(!/\bgetEstadoClass\b|\betiquetaEstado\b/.test(hub), 'sin getEstadoClass ni etiquetaEstado');
  assert.ok(!/\b(?:BORRADOR|EN_TRANSITO|LISTO_ENTREGA|FACTURADO|CANCELADO|CONFIRMADA|RECHAZADA|PENDIENTE_COMPRA)\s*:\s*['"`]bg-/.test(hub), 'sin un mapa local de estados a clases');
  assert.ok(!/ESTADOS as ESTADOS_COT|import \{ ESTADOS_SC \}/.test(hub), 'sin las tablas de las listas para la etiqueta');
  // r1 (C3, D27): el h2 lleva el id del título del Drawer (aria-labelledby).
  assert.match(hub, /<h2 id="drawer-panel-rapido-titulo" className="text-lg font-black text-slate-900">\{quickDetailDoc\.numero\}<\/h2>\s*<InsigniaEstado tipo=\{quickDetailDoc\.tipo\} estado=\{quickDetailDoc\.estado\} \/>/);
  assert.match(hub, /Este pedido está \{estadoDeTarjeta\('VEN', quickDetailDoc\.estado\)\.label\}; su estado ya no se cambia desde aquí\./);
  // La insignia es la de la tabla: estadoDeTarjeta, con las clases de la tabla del tipo (o los hex de la SC).
  assert.match(hub, /function InsigniaEstado\(\{ tipo, estado \}: \{ tipo: FilaHub\['tipo'\]; estado: unknown \}\) \{\s*const e = estadoDeTarjeta\(tipo, estado\);/);
  const { estadoDeTarjeta } = await import('../src/lib/kanban-ventas.js');
  assert.equal(estadoDeTarjeta('VEN', 'EN_TRANSITO').clases.bg, 'bg-sky-100', 'VEN EN_TRANSITO: sky, en la tabla y en el panel');
  assert.equal(estadoDeTarjeta('COT', 'VENCIDA').label, 'Vencida');
  assert.equal(estadoDeTarjeta('VEN', 'LISTO_PARA_ENTREGA').label, 'Listo para entrega');
}

console.log('--- B4 T24 (FINAL-C3): los tres Hubs leen el enlace DESPUÉS del commit (useLayoutEffect de montaje), nunca en el render ---');
{
  // Next 16 cambia la URL de una navegación con <Link> en el useInsertionEffect de HistoryUpdater (app-router.js): el render
  // de la página nueva (el inicializador de useState) todavía ve la URL de la ANTERIOR; un useLayoutEffect del mismo commit
  // ya ve la nueva. Esta guarda fija ese orden: cada lectura de window.location.search de los tres Hubs va dentro de un
  // useLayoutEffect, un useEffect o un manejador (useCallback), nunca en el cuerpo del render, en useState, useMemo ni useRef.
  const sinComentarios = (t) => t.replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  /** Los nombres de las llamadas que envuelven la posición `i`, de adentro hacia afuera (los paréntesis sin cerrar). */
  const llamadasQueEnvuelven = (codigo, i) => {
    const cadena = [];
    let abiertos = 0;
    for (let k = i - 1; k >= 0; k--) {
      const c = codigo[k];
      if (c === ')') abiertos++;
      else if (c === '(') {
        if (abiertos > 0) { abiertos--; continue; }
        const m = /([A-Za-z_$][\w$]*)\s*(?:<[^()]*>)?\s*$/.exec(codigo.slice(Math.max(0, k - 80), k));
        cadena.push(m ? m[1] : '(');
      }
    }
    return cadena;
  };
  const HOOK_DESPUES = ['useLayoutEffect', 'useEffect', 'useCallback'];
  const HOOK_EN_RENDER = ['useState', 'useMemo', 'useRef', 'useSyncExternalStore'];
  /** Las lecturas de la URL de una pantalla, cada una con el primer hook que la envuelve (o null: en el cuerpo del render). */
  const lecturas = (codigo) => [...codigo.matchAll(/window\.location\.search/g)].map((m) => {
    const hook = llamadasQueEnvuelven(codigo, m.index).find((n) => /^use[A-Z]/.test(n)) ?? null;
    return hook;
  });
  // La guarda sí distingue: el patrón viejo (el inicializador de useState) y una lectura en el render fallan.
  assert.deepEqual(lecturas("function P() {\n  const [enlace] = useState(() => leerEnlaceHub(typeof window === 'undefined' ? '' : window.location.search));\n}"), ['useState']);
  assert.deepEqual(lecturas('function P() {\n  const x = leerEnlaceHub(window.location.search);\n  return x;\n}'), [null]);
  assert.deepEqual(lecturas('function P() {\n  useLayoutEffect(() => {\n    if (leer(window.location.search).analisis) setA(true);\n  }, []);\n}'), ['useLayoutEffect']);
  const PANTALLAS = {
    ventas: { ruta: '../src/app/dashboard/ventas/page.tsx', lector: 'inicioDelEnlaceHub' },
    compras: { ruta: '../src/app/dashboard/compras/page.tsx', lector: 'leerEnlaceHubCompras' },
    inventario: { ruta: '../src/app/dashboard/inventario/page.tsx', lector: 'leerEnlaceHubCompras' },
  };
  for (const [nombre, { ruta, lector }] of Object.entries(PANTALLAS)) {
    const codigo = sinComentarios(readFileSync(new URL(ruta, import.meta.url), 'utf8'));
    const hooks = lecturas(codigo);
    assert.ok(hooks.length >= 2, `${nombre}: lee la URL al montar y al volver a los documentos`);
    for (const hook of hooks) {
      assert.ok(HOOK_DESPUES.includes(hook) && !HOOK_EN_RENDER.includes(hook), `${nombre}: lectura de la URL dentro de ${hook} (debe ser después del commit)`);
    }
    // La lectura del montaje: un useLayoutEffect (antes de pintar: no se ve un cuadro con la sección equivocada).
    const montaje = codigo.match(/useLayoutEffect\(\(\) => \{[\s\S]*?\n {2}\}, \[[^\]]*\]\);/g)?.find((b) => b.includes(`${lector}(window.location.search)`));
    assert.ok(montaje, `${nombre}: el enlace se lee en un useLayoutEffect`);
    assert.ok(!/useState(?:<[^>]*>)?\(\(\) => leerEnlace/.test(codigo), `${nombre}: sin el inicializador de useState que leía la URL anterior`);
    assert.match(codigo, /import React, \{[^}]*\buseLayoutEffect\b[^}]*\} from 'react';/, `${nombre}: importa useLayoutEffect`);
  }
  // Ventas: la sección, el foco y el paso arrancan vacíos y los pone el montaje, una sola vez (StrictMode no lo repite).
  const hub = sinComentarios(readFileSync(new URL(PANTALLAS.ventas.ruta, import.meta.url), 'utf8'));
  assert.match(hub, /const \[seccion, setSeccion\] = useState<SeccionHub>\('documentos'\);/);
  assert.match(hub, /const \[focoEnlace, setFocoEnlace\] = useState<string \| null>\(null\);/);
  assert.match(hub,
    /const enlaceLeido = useRef\(false\);\s*useLayoutEffect\(\(\) => \{\s*if \(enlaceLeido\.current\) return;\s*enlaceLeido\.current = true;\s*const inicio = inicioDelEnlaceHub\(window\.location\.search\);\s*if \(inicio\.seccion\) setSeccion\(inicio\.seccion\);\s*if \(inicio\.foco\) setFocoEnlace\(inicio\.foco\);\s*if \(!inicio\.paso\) return;\s*despachar\(\{ tipo: 'paso', valor: inicio\.paso \}\);\s*if \(inicio\.vista\) despachar\(accionPestana\(estado, inicio\.vista, opcionesEstadosHub\)\);\s*\}, \[estado, despachar\]\);/);
  assert.ok(!/pasoDelEnlace|\benlace\.(paso|foco|analisis)\b/.test(hub), 'sin la foto del enlace tomada en el render');
  // Compras e Inventario: Análisis arranca apagado y lo enciende el montaje si la URL NUEVA lo pide (al revés de antes: la
  // URL vieja con ?tab=analisis, por ejemplo la del Hub de Ventas, ya no abre su Análisis desde el menú lateral).
  for (const nombre of ['compras', 'inventario']) {
    const codigo = sinComentarios(readFileSync(new URL(PANTALLAS[nombre].ruta, import.meta.url), 'utf8'));
    assert.match(codigo, /const \[enAnalisis, setEnAnalisis\] = useState\(false\);/, nombre);
    assert.match(codigo, /useLayoutEffect\(\(\) => \{\s*if \(leerEnlaceHubCompras\(window\.location\.search\)\.analisis\) setEnAnalisis\(true\);\s*\}, \[\]\);/, nombre);
  }
}

console.log('--- B4 T24 f2 r1 (C3): el panel rápido del Hub es un Drawer (título, foco de ida y vuelta, Esc, la trampa de Tab y data-capa) ---');
{
  const crudo = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const hub = crudo.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // El Drawer trae role="dialog", aria-modal, data-capa y useCierreVentana (el foco entra al abrir y vuelve al cerrar, Esc, el clic en
  // el fondo y Tab atrapado): T24-e y T24-e2 de test_tabla. Su ancho de 600 px y la reserva del botón de la IA son props aditivas.
  assert.match(hub, /\{quickDetailDoc && \(\s*<Drawer idTitulo="drawer-panel-rapido-titulo" maxWidth="600" reservaBotonIA onClose=\{\(\) => setQuickDetailDoc\(null\)\} header=\{\(/);
  assert.ok(!/fixed top-0 bottom-0 right-0/.test(hub), 'sin el panel lateral armado a mano');
  assert.ok(!/backdrop-blur-xs z-40/.test(hub), 'sin su fondo a mano');
  assert.equal((hub.match(/setQuickDetailDoc\(null\)/g) ?? []).length, 1, 'un solo cierre: el del Drawer (su X con aria-label, Esc y el fondo)');
  // Sin campos que escribir (F40 de f1 r2): no lleva cierreExterno={false} ni bloquearCierre.
  const panel = hub.slice(hub.indexOf('<Drawer idTitulo="drawer-panel-rapido-titulo"'), hub.indexOf('</Drawer>', hub.indexOf('<Drawer idTitulo="drawer-panel-rapido-titulo"')));
  assert.ok(panel.length > 1000, 'el panel entero');
  assert.ok(!/<(?:input|textarea|select)\b|ComposerChatter/.test(panel), 'el panel no tiene campos (si los tuviera, F40: cierreExterno={false} y bloquearCierre)');
  // Cada control del panel lleva el token de foco (FOCO), no el anillo del navegador.
  const controles = (panel.match(/<(?:button|Link)\b/g) ?? []).length;
  assert.ok(controles >= 5, `los controles del panel (${controles})`);
  assert.equal((panel.match(/\$\{FOCO\}/g) ?? []).length, controles, 'cada botón y enlace del panel con ${FOCO}');
  assert.match(hub, /import \{[^}]*\bFOCO\b[^}]*\} from '@\/lib\/design-system';/);
}

console.log('--- B4 T24 f2 r1 (duda 2 + m15): claveAccionSiguienteSC, claveAccionSiguienteCOT y claveAccionSiguienteDocumento, sin el texto ---');
{
  for (const n of ['claveAccionSiguienteSC', 'claveAccionSiguienteCOT', 'claveAccionSiguienteDocumento']) assert.equal(typeof hv[n], 'function', `${n} existe`);
  // La MISMA rama de accionSiguienteSC y accionSiguienteCOT (una sola decisión), con la clave que puedeAccionDocumento (lib/roles.js)
  // cruza con el require_roles de su endpoint.
  const TEXTO_SC = {
    ver_ticket: 'Ver ticket', ver_pedido: 'Ver pedido', ver_cotizacion: 'Ver cotización', agregar_productos: 'Agregar productos',
    cotizar: 'Cotizar →', reiniciar_o_cotizar: 'Reiniciar o cotizar', esperando: 'Esperando cliente',
    enviar_confirmacion: 'Enviar para confirmación', asignar: 'Asignar asesor', ver_solicitud: 'Ver solicitud',
  };
  const sc = (estado, extra = {}) => ({ tipo: 'SC', id: 4, estado, tipo_solicitud: 'Cotizacion de Producto',
    productos: [{ product_name: 'Tenis' }], cotizaciones: [], pedidos_venta: [], ...extra });
  const ctx = (f) => ({ cotizaciones: f.cotizaciones, pedidos: f.pedidos_venta });
  const CASOS_SC = [
    [sc('BORRADOR', { tipo_solicitud: 'Soporte Tecnico' }), 'ver_ticket'], [sc('CANCELADA'), null],
    [sc('CONFIRMADA', { pedidos_venta: [{ id: 3, estado: 'EN_PROCESO' }] }), 'ver_pedido'],
    [sc('CONFIRMADA', { cotizaciones: [{ id: 5, estado: 'BORRADOR' }] }), 'ver_cotizacion'],
    [sc('ASIGNADA', { productos: [] }), 'agregar_productos'], [sc('CONFIRMADA', { confirmacion_vigente: true }), 'cotizar'],
    [sc('CONFIRMADA'), 'reiniciar_o_cotizar'], [sc('PENDIENTE_CONFIRMACION'), 'esperando'], [sc('ASIGNADA'), 'enviar_confirmacion'],
    [sc('BORRADOR'), 'asignar'], [sc('COTIZADA'), 'ver_solicitud'],
  ];
  for (const [fila, clave] of CASOS_SC) {
    assert.equal(hv.claveAccionSiguienteSC(fila, ctx(fila)), clave, `${fila.estado} → ${clave}`);
    assert.equal(hv.claveAccionSiguienteDocumento(fila), clave, `la fila SC ${fila.estado}`);
  }
  // Toda la matriz: la clave dice el mismo texto que la acción (estados × productos × confirmación × soporte × documentos).
  for (const estado of [...Object.keys(ESTADOS_SC), 'ALGO_NUEVO', null]) {
    for (const extra of [{}, { productos: [] }, { confirmacion_vigente: true }, { tipo_solicitud: 'Soporte Tecnico' },
      { cotizaciones: [{ id: 5, estado: 'RECHAZADA' }] }, { cotizaciones: [{ id: 5, estado: 'VENCIDA' }] },
      { pedidos_venta: [{ id: 3, estado: 'CANCELADO' }] }, { pedidos_venta: [{ id: 3, estado: 'ENTREGADO' }] }]) {
      const fila = sc(estado, extra);
      const clave = hv.claveAccionSiguienteSC(fila, ctx(fila));
      assert.equal(clave === null ? null : TEXTO_SC[clave], hv.accionSiguienteSC(fila, ctx(fila))?.label ?? null, `${estado} ${JSON.stringify(extra)}`);
    }
  }
  const TEXTO_COT = {
    completar_precios: 'Completar precios', enviar_al_cliente: 'Enviar al cliente', esperando: 'Esperando al cliente',
    ver_pedido: 'Ver pedido', crear_pedido: 'Crear pedido',
  };
  const cot = (estado, extra = {}) => ({ tipo: 'COT', id: 6, estado, total_cop: 1000, pedidos_venta: [], ...extra });
  const CASOS_COT = [
    [cot('BORRADOR'), 'enviar_al_cliente'], [cot('BORRADOR', { total_cop: 0 }), 'completar_precios'], [cot('VENCIDA'), 'enviar_al_cliente'],
    [cot('ENVIADA', { total_cop: null }), 'completar_precios'], [cot('PENDIENTE_CONFIRMACION'), 'esperando'],
    [cot('CONFIRMADA', { pedidos_venta: [{ id: 2, estado: 'EN_PROCESO' }] }), 'ver_pedido'], [cot('CONFIRMADA'), 'crear_pedido'],
    [cot('RECHAZADA'), null],
  ];
  for (const [fila, clave] of CASOS_COT) {
    assert.equal(hv.claveAccionSiguienteCOT(fila), clave, `${fila.estado} → ${clave}`);
    assert.equal(hv.claveAccionSiguienteDocumento(fila), clave, `la fila COT ${fila.estado}`);
  }
  for (const estado of [...Object.keys(ESTADOS_COTIZACION), 'ALGO_NUEVO', null]) {
    for (const extra of [{}, { total_cop: 0 }, { pedidos_venta: [{ id: 2, estado: 'EN_PROCESO' }] }, { pedidos_venta: [{ id: 2, estado: 'CANCELADO' }] }]) {
      const fila = cot(estado, extra);
      const clave = hv.claveAccionSiguienteCOT(fila);
      assert.equal(clave === null ? null : TEXTO_COT[clave], hv.accionSiguienteCOT(fila)?.texto ?? null, `${estado} ${JSON.stringify(extra)}`);
    }
  }
  // Un pedido: la clave de siempre (claveAccionSiguientePVEN), con VEN y con PVEN; otra cosa: null.
  assert.equal(hv.claveAccionSiguienteDocumento({ tipo: 'VEN', id: 1, estado: 'ENTREGADO' }), 'facturar');
  assert.equal(hv.claveAccionSiguienteDocumento({ tipo: 'PVEN', id: 1, estado: 'PENDIENTE_COMPRA' }), 'comprar');
  for (const nada of [null, undefined, 'SC-1', { tipo: 'OTRO', estado: 'BORRADOR' }, {}]) assert.equal(hv.claveAccionSiguienteDocumento(nada), null, JSON.stringify(nada));
  for (const nada of [null, undefined, 3]) {
    assert.equal(hv.claveAccionSiguienteSC(nada), null, String(nada));
    assert.equal(hv.claveAccionSiguienteCOT(nada), null, String(nada));
  }
}

console.log('--- B4 T24 f2 r1 (m18, m19 + m37): el Hub lee el rol después de montar y no ofrece lo que da 403 ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // m18: nada de getUsuarioActual().role en el render; useRolActual (después de montar) en el Hub, el ConfigPanel y el panel de notas.
  assert.ok(!/getUsuarioActual\(\)\.role/.test(hub), 'sin getUsuarioActual().role');
  assert.match(hub, /const soloLectura = !esAdmin\(useRolActual\(\)\);/, 'el ConfigPanel');
  assert.match(hub, /const accionAjustar = esAdmin\(rol\)/, '«Ajustar tiempos»');
  // m19: «Nueva Solicitud» (POST /solicitudes: ADMIN y ASESOR) solo con mover.
  assert.match(hub, /\{accesoTablero\.mover && \(\s*<Link href="\/dashboard\/ventas\/solicitud\?new=1" aria-label="Nueva solicitud"/);
  // m19 + m37: el compositor de notas (POST …/actividad: ADMIN, ASESOR y COMPRAS) con accesoNotasVentas, sin una lista propia.
  assert.match(hub, /const notas = accesoNotasVentas\(useRolActual\(\)\);/);
  assert.match(hub, /\{detail\?\.id && notas\.anotar && \(\s*<div className="pb-5 border-b border-slate-100">\s*<ComposerChatter compacto/);
  assert.match(hub, /import \{[^}]*\baccesoNotasVentas\b[^}]*\} from '@\/lib\/roles';/);
  assert.match(hub, /import \{[^}]*\bpuedeAccionPedido\b[^}]*\} from '@\/lib\/roles';/);
}

console.log('OK test_hub_ventas.mjs');
