/**
 * frontend/tests/test_kanban_ventas.mjs
 * Bloque 4, T3C (KANBAN-hub-ventas punto 1 y KANBAN-ventas-listas punto 4; C4, C7, C14, C15, R11; RP14, RP16, RP17,
 * RP18, RP67, RP74, D4, D11, D22 y D25): las reglas puras de los tableros de Ventas (lib/kanban-ventas.js).
 *  - Hub: COLUMNAS_HUB (las de T9 con las claves de columnaHub), reglaSoltarHub (la matriz de «comportamiento» con
 *    C15(a): sacar una COT de «Esperando» o de «Confirmada» queda bloqueado) y tarjetaHub, que lee la fila del servidor
 *    (resolucion, dias_sin_mov, seguimiento_estado y cambios_cliente; sin mapaSeguimiento ni chip «Soporte»).
 *  - chipsDocumentoVentas (RP18, D4): «Atrasado N días», «Sin respuesta al recordatorio» y «Cambios pedidos», máximo 3.
 *  - confirmacionReiniciarSolicitud (RP17): el texto de «Reiniciar solicitud» de solicitud/[id]/page.tsx.
 *  - Listas: motivoTransicionPedido (los textos de N2 sin el número), COLUMNAS_PEDIDO / reglaSoltarPedido,
 *    COLUMNAS_COT / reglaSoltarCotizacion y COLUMNAS_SC / reglaSoltarSC (RP16: sin puedeEnviar no se envía; D22).
 *  - Ronda r1 (fixes-3C-r1): una COT vencida o sin precios no se ofrece para enviar (el servidor da 400), tarjetaHub
 *    acepta returnTo (cruce C5) y estadoDeTarjeta se exporta. Punto 3 (decisión del controlador, opción A): una SC con
 *    una cotización activa o un pedido vigente no se ofrece para cancelar (N4: el servidor da 409).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COLUMNAS_HUB, reglaSoltarHub, tarjetaHub, estadoDeTarjeta, chipsDocumentoVentas, confirmacionReiniciarSolicitud,
  motivoTransicionPedido, COLUMNAS_PEDIDO, reglaSoltarPedido, COLUMNAS_COT, reglaSoltarCotizacion, COLUMNAS_SC,
  reglaSoltarSC,
} from '../src/lib/kanban-ventas.js';
// B4 T7: lo nuevo por el espacio de nombres, para que su falta no tape los demás rojos.
import * as kv from '../src/lib/kanban-ventas.js';
import { columnaHub, accionSiguienteDocumento, RUTA_HUB_VENTAS } from '../src/lib/hub-ventas.js';
import { ESTADOS_PEDIDO, transicionesPedido, infoEstadoPedido, grupoPedido } from '../src/lib/estados-pedido.js';
import { ESTADOS_SC, infoEstadoSolicitud } from '../src/lib/estados-solicitud.js';
import { ESTADOS_COTIZACION, infoEstadoCotizacion } from '../src/lib/estados-cotizacion.js';
import { MAXIMO_ESTADOS, estadoTablaInicial, queryListado } from '../src/lib/tabla.js';
import { ACCIONES_BLOQUE3 } from '../src/lib/acciones-bloque3.js';
import { RUTA_LISTA_SOLICITUDES, RUTA_LISTA_COTIZACIONES } from '../src/lib/cambios-cliente.js';
import { enlaceDocumento } from '../src/lib/analisis.js';
import { mapaDestinos, agruparEnColumnas, SIN_COLUMNA } from '../src/lib/kanban.js';

const CON_PRODUCTOS = [{ product_name: 'Cuna' }];
/** Una COT con algo que el cliente pueda confirmar: líneas y total (enviar_cotizacion_para_confirmacion da 400 sin ellos). */
const CON_PRECIO = { productos: CON_PRODUCTOS, total_cop: 250000 };
const CALCULA = 'Calcula los precios antes de enviarla.';
const PASALA_BORRADOR = 'Primero pásala a Borrador para retomarla.';
const bloqueado = (motivo, enlace) => (enlace ? { tipo: 'bloqueado', motivo, enlace } : { tipo: 'bloqueado', motivo });
const abrir = (tipo, id, returnTo) => ({
  texto: tipo === 'SC' ? 'Abrir solicitud' : tipo === 'COT' ? 'Abrir cotización' : 'Abrir pedido',
  href: enlaceDocumento(tipo, id, { returnTo }),
});
const RE_COTIZAR = 'Ábrela para re-cotizar; te pedirá la razón.';
const ABRELA_ENVIAR = 'Ábrela para enviar.';
const NO_REINICIAR = 'No se puede reiniciar: tiene una cotización o un pedido vigente.';
const NO_CANCELAR = 'No se puede cancelar: tiene una cotización o un pedido vigente.';
/** Los documentos de una SC: con uno vigente no se cancela (N4); con solo los caídos, sí. */
const CON_COT_BORRADOR = { cotizaciones: [{ id: 1, numero: 'COT-1', estado: 'BORRADOR' }] };
const CON_PVEN_EN_PROCESO = { pedidos_venta: [{ id: 2, numero: 'PVEN-2', estado: 'EN_PROCESO' }] };
const SOLO_CAIDOS = {
  cotizaciones: [{ id: 1, numero: 'COT-1', estado: 'RECHAZADA' }], pedidos_venta: [{ id: 2, numero: 'PVEN-2', estado: 'CANCELADO' }],
};

// ─── Hub ────────────────────────────────────────────────────────────────────────

console.log('--- TEST 1: COLUMNAS_HUB son las de T9 y cubren todo lo que da columnaHub ---');
{
  assert.deepEqual(COLUMNAS_HUB.map((c) => [c.clave, c.titulo, c.tono, c.cerrada]), [
    ['No Resuelto', 'No resuelto', 'rose', false],
    ['En Gestión', 'En gestión', 'amber', false],
    ['Acción Tomada', 'Acción tomada', 'emerald', false],
    ['Cancelado', 'Cancelado', 'slate', true],
  ]);
  assert.ok(Object.isFrozen(COLUMNAS_HUB) && Object.isFrozen(COLUMNAS_HUB[0]));
  const claves = new Set(COLUMNAS_HUB.map((c) => c.clave));
  const estados = [...Object.keys(ESTADOS_SC), ...Object.keys(ESTADOS_COTIZACION), ...Object.keys(ESTADOS_PEDIDO), 'RARO'];
  for (const tipo of ['SC', 'COT', 'VEN', 'PVEN']) {
    for (const estado of estados) {
      for (const scConCot of [new Set(), new Set([1])]) {
        assert.ok(claves.has(columnaHub({ tipo, id: 1, estado }, { scConCot })), `${tipo} ${estado}`);
      }
    }
  }
  // Los casos de C7 (columnaHub vive en hub-ventas.js, T2; aquí solo se comprueba con las claves del tablero).
  assert.equal(columnaHub({ tipo: 'VEN', estado: 'DEVUELTO_TOTAL' }), 'Cancelado');
  assert.equal(columnaHub({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, { scConCot: new Set() }), 'No Resuelto');
  assert.equal(columnaHub({ tipo: 'SC', id: 1, estado: 'CONFIRMADA' }, { scConCot: new Set([1]) }), 'Acción Tomada');
}

/** reglaSoltarHub desde la columna en la que el servidor pone la fila (columnaHub). */
const hub = (fila, destino, scConCot = new Set()) => reglaSoltarHub(fila, columnaHub(fila, { scConCot }), destino, { scConCot });

console.log('--- TEST 2: reglaSoltarHub — solicitudes ---');
{
  const sc = (estado, extra = {}) => ({ tipo: 'SC', id: 7, numero: 'SC-7', estado, ...extra });
  const enlace = abrir('SC', 7, RUTA_HUB_VENTAS);
  // → En gestión
  assert.deepEqual(hub(sc('ASIGNADA', { productos: CON_PRODUCTOS }), 'En Gestión'), { tipo: 'accion', accion: 'enviar' },
    'el Hub conserva su envío (D11)');
  assert.deepEqual(hub(sc('ASIGNADA', { productos: [] }), 'En Gestión'), bloqueado('Agrégale productos antes de enviarla.', enlace));
  assert.deepEqual(hub(sc('BORRADOR'), 'En Gestión'), bloqueado('Primero asígnale un asesor.', enlace));
  assert.deepEqual(hub(sc('PENDIENTE_CONFIRMACION'), 'En Gestión'), bloqueado('Ya está pendiente de confirmación del cliente.'));
  assert.deepEqual(hub(sc('CONFIRMADA'), 'En Gestión'), bloqueado('El cliente ya la confirmó.'));
  assert.deepEqual(hub(sc('COTIZADA'), 'En Gestión'), bloqueado('El cliente ya la confirmó.'), 'un heredado cuenta como Confirmada');
  assert.deepEqual(hub(sc('CANCELADA'), 'En Gestión'), bloqueado('Una solicitud cancelada se restaura desde la Papelera.'));
  // → No resuelto
  assert.deepEqual(hub(sc('CANCELADA'), 'No Resuelto'), bloqueado('Una solicitud cancelada se restaura desde la Papelera.'));
  assert.deepEqual(hub(sc('PENDIENTE_CONFIRMACION'), 'No Resuelto', new Set([7])),
    bloqueado('Tiene una cotización activa: no se puede reiniciar.'));
  assert.deepEqual(hub(sc('CONFIRMADA'), 'No Resuelto', new Set([7])), bloqueado('Tiene una cotización activa: no se puede reiniciar.'));
  // Una SC pendiente o confirmada sin documentos ya está en «No resuelto» (columnaHub): soltarla ahí no hace nada.
  assert.deepEqual(hub(sc('PENDIENTE_CONFIRMACION'), 'No Resuelto'), { tipo: 'ninguno' });
  // La regla en sí (desde otra columna): sin documentos se reinicia; con un pedido vigente en la fila, D22.
  assert.deepEqual(reglaSoltarHub(sc('CONFIRMADA'), 'Acción Tomada', 'No Resuelto', { scConCot: new Set() }),
    { tipo: 'accion', accion: 'reiniciar' });
  assert.deepEqual(reglaSoltarHub(sc('PENDIENTE_CONFIRMACION'), 'Acción Tomada', 'No Resuelto'), { tipo: 'accion', accion: 'reiniciar' },
    'sin opciones, scConCot vacío');
  assert.deepEqual(
    reglaSoltarHub(sc('CONFIRMADA', { pedidos_venta: [{ id: 3, estado: 'EN_PROCESO' }] }), 'Acción Tomada', 'No Resuelto'),
    bloqueado(NO_REINICIAR, enlace));
  assert.deepEqual(hub(sc('RECHAZADA'), 'No Resuelto'),
    bloqueado('Solo se reinicia una solicitud pendiente por confirmación o confirmada.'), 'heredado en Cancelado');
  // → Acción tomada: siempre bloqueado
  for (const estado of ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA']) {
    assert.deepEqual(hub(sc(estado, { productos: CON_PRODUCTOS }), 'Acción Tomada'),
      bloqueado('La solicitud queda Confirmada solo cuando el cliente confirma con su enlace.'), estado);
  }
  // → Cancelado
  assert.deepEqual(hub(sc('ASIGNADA'), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.deepEqual(hub(sc('CONFIRMADA'), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' });
  // r1 (punto 3): con una cotización activa o un pedido vigente no se ofrece cancelar (N4: pasosParaCancelarSolicitud).
  assert.deepEqual(hub(sc('CONFIRMADA', CON_COT_BORRADOR), 'Cancelado'), bloqueado(NO_CANCELAR, enlace), 'una COT en Borrador');
  assert.deepEqual(hub(sc('CONFIRMADA', CON_PVEN_EN_PROCESO), 'Cancelado'), bloqueado(NO_CANCELAR, enlace), 'un PVEN en proceso');
  assert.deepEqual(hub(sc('CONFIRMADA', SOLO_CAIDOS), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' }, 'solo documentos caídos');
  assert.deepEqual(hub(sc('ASIGNADA'), 'Cancelado', new Set([7])), bloqueado(NO_CANCELAR, enlace),
    'en el Hub también cuenta scConCot (la fila puede no traer sus documentos)');
  assert.deepEqual(hub(sc('ASIGNADA', SOLO_CAIDOS), 'Cancelado', new Set([8])), { tipo: 'accion', accion: 'cancelar' },
    'scConCot de otra SC no cuenta');
  // Soporte no llega al Hub (R8); si llegara, queda quieta con el motivo de N3.
  assert.deepEqual(hub(sc('N/A_SOPORTE'), 'Cancelado'), bloqueado('Es un ticket de soporte: se cierra desde su estado de soporte.'));
  assert.deepEqual(hub(sc('ASIGNADA', { tipo_solicitud: 'Soporte Tecnico', productos: CON_PRODUCTOS }), 'En Gestión'),
    bloqueado('Es un ticket de soporte: se cierra desde su estado de soporte.'));
  // La misma columna
  assert.deepEqual(hub(sc('ASIGNADA'), 'No Resuelto'), { tipo: 'ninguno' });
}

console.log('--- TEST 3: reglaSoltarHub — cotizaciones (C15(a)) ---');
{
  const cot = (estado, extra = {}) => ({ tipo: 'COT', id: 9, numero: 'COT-9', estado, ...extra });
  const enlace = abrir('COT', 9, RUTA_HUB_VENTAS);
  // → En gestión
  assert.deepEqual(hub(cot('BORRADOR', CON_PRECIO), 'En Gestión'), { tipo: 'accion', accion: 'enviar' });
  // r1 (fixes-3C-r1, punto 2): lo que enviar_cotizacion_para_confirmacion rechaza con 400 ya no se ofrece.
  assert.deepEqual(hub(cot('VENCIDA', CON_PRECIO), 'En Gestión'), bloqueado(PASALA_BORRADOR, enlace));
  assert.deepEqual(hub(cot('BORRADOR', { total_cop: 250000, productos: [] }), 'En Gestión'), bloqueado(CALCULA, enlace), 'sin productos');
  assert.deepEqual(hub(cot('BORRADOR', { total_cop: 250000 }), 'En Gestión'), bloqueado(CALCULA, enlace), 'sin la lista de productos');
  assert.deepEqual(hub(cot('BORRADOR', { ...CON_PRECIO, total_cop: 0 }), 'En Gestión'), bloqueado(CALCULA, enlace), 'total en 0');
  assert.deepEqual(hub(cot('BORRADOR', { ...CON_PRECIO, total_cop: null }), 'En Gestión'), bloqueado(CALCULA, enlace), 'sin total');
  assert.deepEqual(reglaSoltarHub(cot('ENVIADA', { productos: CON_PRODUCTOS, total_cop: 0 }), 'No Resuelto', 'En Gestión'),
    bloqueado(CALCULA, enlace), 'la ENVIADA antigua también');
  assert.deepEqual(reglaSoltarHub(cot('ENVIADA', CON_PRECIO), 'No Resuelto', 'En Gestión'), { tipo: 'accion', accion: 'enviar' });
  assert.deepEqual(hub(cot('PENDIENTE_CONFIRMACION'), 'En Gestión'), bloqueado('Ya está pendiente de confirmación del cliente.'));
  assert.deepEqual(hub(cot('CONFIRMADA'), 'En Gestión'), bloqueado('El cliente ya la confirmó.'));
  assert.deepEqual(hub(cot('RECHAZADA'), 'En Gestión'), bloqueado('Primero retómala: suéltala en No resuelto.'));
  assert.deepEqual(hub(cot('ENVIADA'), 'En Gestión'), { tipo: 'ninguno' }, 'ENVIADA ya está en En gestión');
  // → No resuelto: C15(a) (ya no envía ni pide solo confirmar)
  assert.deepEqual(hub(cot('CONFIRMADA'), 'No Resuelto'), bloqueado(RE_COTIZAR, enlace));
  assert.deepEqual(reglaSoltarHub(cot('PENDIENTE_CONFIRMACION'), 'En Gestión', 'No Resuelto'), bloqueado(RE_COTIZAR, enlace),
    'la regla bloquea también la pendiente (en el tablero ya está en No resuelto)');
  assert.deepEqual(hub(cot('RECHAZADA'), 'No Resuelto'), { tipo: 'cambio', estado: 'BORRADOR' }, 'retomar (N7 da 409 si hay otra)');
  assert.deepEqual(hub(cot('ENVIADA'), 'No Resuelto'), { tipo: 'cambio', estado: 'BORRADOR' });
  // → Acción tomada
  for (const estado of ['BORRADOR', 'ENVIADA', 'PENDIENTE_CONFIRMACION', 'VENCIDA', 'RECHAZADA']) {
    assert.deepEqual(hub(cot(estado), 'Acción Tomada'), bloqueado('Solo el cliente confirma la cotización con su enlace.'), estado);
  }
  // → Cancelado (N3: queda Rechazada con el motivo)
  assert.deepEqual(hub(cot('BORRADOR'), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.deepEqual(hub(cot('CONFIRMADA'), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' });
  // Con el pedido vigente en la fila, nada se mueve (el mismo bloqueo que en Cotizaciones).
  const conPedido = cot('CONFIRMADA', { pedidos_venta: [{ id: 4, numero: 'PVEN-4', estado: 'EN_PROCESO' }] });
  assert.deepEqual(hub(conPedido, 'Cancelado'),
    bloqueado('Tiene el pedido PVEN-4 activo: para cambiarla, cancela primero el pedido.', abrir('PVEN', 4, RUTA_HUB_VENTAS)));
}

console.log('--- TEST 4: reglaSoltarHub — pedidos (N2) y PVEN = VEN (RP74) ---');
{
  const ven = (estado, tipo = 'VEN') => ({ tipo, id: 5, numero: 'PVEN-5', estado });
  assert.deepEqual(hub(ven('EN_PROCESO'), 'Acción Tomada'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  assert.deepEqual(hub(ven('PENDIENTE_COMPRA'), 'En Gestión'), { tipo: 'cambio', estado: 'EN_PROCESO' });
  assert.deepEqual(hub(ven('LISTO_ENTREGA'), 'No Resuelto'), { tipo: 'cambio', estado: 'PENDIENTE_COMPRA' });
  assert.deepEqual(hub(ven('EN_TRANSITO'), 'Acción Tomada'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  assert.deepEqual(hub(ven('ENTREGADO'), 'En Gestión'), bloqueado('Un pedido entregado solo puede pasar a Facturado.'));
  assert.deepEqual(hub(ven('FACTURADO'), 'No Resuelto'), bloqueado('El pedido ya está facturado; su estado no se puede cambiar.'));
  assert.deepEqual(hub(ven('CANCELADO'), 'No Resuelto'), bloqueado('El pedido está cancelado y no se puede reabrir.'));
  assert.deepEqual(hub(ven('DEVUELTO_TOTAL'), 'En Gestión'), bloqueado('El pedido está devuelto; su estado no se puede cambiar.'));
  assert.deepEqual(hub(ven('EN_PROCESO'), 'Cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.deepEqual(hub(ven('ENTREGADO'), 'Cancelado'), bloqueado('Ya fue entregado.'), 'motivoNoCancelable de N3');
  assert.deepEqual(hub(ven('PARCIALMENTE_ENTREGADO'), 'Cancelado'),
    bloqueado('Está entregado parcialmente y ya no se puede cancelar.'));
  // PVEN da lo mismo que VEN (también el motivo de N3, que solo mira 'VEN').
  for (const estado of Object.keys(ESTADOS_PEDIDO)) {
    for (const destino of COLUMNAS_HUB.map((c) => c.clave)) {
      assert.deepEqual(hub(ven(estado, 'PVEN'), destino), hub(ven(estado), destino), `${estado} → ${destino}`);
    }
  }
  assert.throws(() => reglaSoltarHub(ven('EN_PROCESO'), 'En Gestión', 'Entregado'), /desconocida/);
  assert.throws(() => reglaSoltarHub({ tipo: 'XX', estado: 'A' }, 'No Resuelto', 'Cancelado'), /Tipo de documento/);
}

console.log('--- TEST 5: cada resultado del Hub tiene la forma de kanban.js (mapaDestinos no lanza) ---');
{
  const estados = [...Object.keys(ESTADOS_SC), ...Object.keys(ESTADOS_COTIZACION), ...Object.keys(ESTADOS_PEDIDO)];
  for (const tipo of ['SC', 'COT', 'VEN']) {
    for (const estado of estados) {
      const fila = { tipo, id: 1, numero: 'X-1', estado, productos: CON_PRODUCTOS };
      const origen = columnaHub(fila);
      const mapa = mapaDestinos(fila, origen, COLUMNAS_HUB, (f, o, d) => reglaSoltarHub(f, o, d));
      assert.equal(mapa[origen].permitido, false);
    }
  }
}

// ─── chips y tarjeta ────────────────────────────────────────────────────────────

console.log('--- TEST 6: chipsDocumentoVentas (RP18, D4): de la fila, en orden y máximo 3 ---');
{
  const AGOTADO = ACCIONES_BLOQUE3.SEGUIMIENTO_AGOTADO.etiqueta;
  assert.equal(AGOTADO, 'Sin respuesta al recordatorio');
  const sc = {
    tipo: 'SC', estado: 'ASIGNADA', resolucion: 'ATRASADO', dias_sin_mov: 4, seguimiento_estado: 'AGOTADO',
    cambios_cliente: { tipo: 'CAMBIOS', at: '2026-10-20T10:00:00Z', comentario: 'Otro color' },
  };
  assert.deepEqual(chipsDocumentoVentas(sc, 'SC'), [
    { texto: 'Atrasado 4 días', tono: 'rose' },
    { texto: AGOTADO, tono: 'amber' },
    { texto: 'Cambios pedidos', tono: 'amber' },
  ]);
  assert.deepEqual(chipsDocumentoVentas(sc), chipsDocumentoVentas(sc, 'SC'), 'sin tipo usa fila.tipo');
  assert.ok(chipsDocumentoVentas(sc).length <= 3);
  // Solo lo que dice la fila: la resolución del servidor, no un cálculo de días.
  assert.deepEqual(chipsDocumentoVentas({ estado: 'ASIGNADA', resolucion: 'NO_RESUELTO', dias_sin_mov: 30 }, 'SC'), []);
  assert.deepEqual(chipsDocumentoVentas({ resolucion: 'ATRASADO', dias_sin_mov: 1 }, 'VEN'), [{ texto: 'Atrasado 1 día', tono: 'rose' }]);
  assert.deepEqual(chipsDocumentoVentas({ resolucion: 'ATRASADO' }, 'VEN'), [{ texto: 'Atrasado', tono: 'rose' }]);
  assert.deepEqual(chipsDocumentoVentas({ seguimiento_estado: 'DETENIDO' }, 'COT'), [], 'DETENIDO no tiene chip');
  // «Ya no la necesita» en rosa; en una COT solo mientras está en Borrador (la vigencia de cambios-cliente.js).
  const cot = { estado: 'BORRADOR', cambios_cliente: { tipo: 'NO_LA_NECESITA', at: '2026-10-20T10:00:00Z' } };
  assert.deepEqual(chipsDocumentoVentas(cot, 'COT'), [{ texto: 'Ya no la necesita', tono: 'rose' }]);
  assert.deepEqual(chipsDocumentoVentas({ ...cot, estado: 'PENDIENTE_CONFIRMACION' }, 'COT'), []);
  // Un pedido no tiene chip de cambios (etiquetaChipCambios es de SC y COT); PVEN = VEN.
  assert.deepEqual(chipsDocumentoVentas({ ...cot, estado: 'BORRADOR' }, 'PVEN'), []);
  // Nunca «Soporte» (R8) ni «Pidió cambios» (D4).
  const todos = chipsDocumentoVentas({ ...sc, tipo_solicitud: 'Soporte Tecnico' }, 'SC').map((c) => c.texto);
  assert.ok(!todos.includes('Soporte') && !todos.includes('Pidió cambios'));
}

console.log('--- TEST 7: tarjetaHub lee la fila (C14, D25, RP74) ---');
{
  const AHORA = Date.UTC(2026, 9, 28, 12);
  const sc = {
    tipo: 'SC', id: 7, numero: 'SC-7', estado: 'ASIGNADA', customer_name: 'Ana Ruiz', advisor_name: 'Laura',
    productos: CON_PRODUCTOS, cotizaciones: [], pedidos_venta: [], dias_creado: 3, resolucion: 'ATRASADO', dias_sin_mov: 3,
    seguimiento_estado: 'AGOTADO',
  };
  const t = tarjetaHub(sc);
  assert.equal(t.numero, 'SC-7');
  assert.equal(t.tipo, 'SC');
  assert.equal(t.titulo, 'Ana Ruiz');
  assert.equal(t.subtitulo, 'Laura');
  assert.equal(t.monto, null, 'una solicitud no tiene monto');
  assert.deepEqual(t.estado, { label: 'Asignada', clases: null, colores: { color: '#0e7490', bg: '#ecfeff', border: '#a5f3fc' } });
  assert.equal(t.tiempo, 'hace 3 días');
  assert.equal(t.atrasada, true);
  assert.deepEqual(t.chips.map((c) => c.texto), ['Atrasado 3 días', 'Sin respuesta al recordatorio']);
  assert.deepEqual(t.accionPrincipal, accionSiguienteDocumento(sc), 'D25: la de T2, sin traducir');
  assert.deepEqual(t.accionPrincipal, { texto: 'Enviar para confirmación', href: '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fventas', tono: 'indigo' });
  // r1 (punto 4, cruce C5): returnTo llega a accionSiguienteDocumento (T8 manda la ruta de su lista).
  const desdeLista = tarjetaHub(sc, { returnTo: RUTA_LISTA_SOLICITUDES });
  assert.deepEqual(desdeLista.accionPrincipal, accionSiguienteDocumento(sc, { returnTo: RUTA_LISTA_SOLICITUDES }));
  assert.equal(desdeLista.accionPrincipal.href, '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fventas%2Fsolicitud');
  assert.deepEqual({ ...desdeLista, accionPrincipal: null }, { ...t, accionPrincipal: null }, 'returnTo solo cambia la acción');

  const cot = { tipo: 'COT', id: 9, numero: 'COT-9', estado: 'PENDIENTE_CONFIRMACION', customer_name: 'Ana', cotizador: 'Pedro',
    total_cop: 1062523.4, created_at: '2026-10-28T11:00:00' };
  const tc = tarjetaHub(cot, { ahora: AHORA });
  assert.equal(tc.subtitulo, 'Pedro', 'el asesor de la COT es su cotizador (H4)');
  assert.equal(tc.monto, 1062523, 'pesos enteros');
  assert.deepEqual(tc.estado, { label: ESTADOS_COTIZACION.PENDIENTE_CONFIRMACION.label, clases: ESTADOS_COTIZACION.PENDIENTE_CONFIRMACION.clases, colores: null });
  assert.equal(tc.tiempo, 'hoy', 'sin dias_creado, la antigüedad desde created_at (UTC)');
  assert.equal(tc.atrasada, false);
  assert.deepEqual(tc.chips, []);
  assert.deepEqual(tc.accionPrincipal, { texto: 'Esperando al cliente', href: null, tono: 'blue' });

  const ven = { tipo: 'VEN', id: 5, numero: 'PVEN-5', estado: 'LISTO_ENTREGA', customer_name: '', saldo_cop: 0, total_cop: 0,
    dias_creado: 1 };
  const tv = tarjetaHub(ven);
  assert.equal(tv.tipo, 'PVEN', 'la insignia del pedido dice PVEN');
  assert.equal(tv.titulo, 'Cliente General');
  assert.equal(tv.subtitulo, 'Sin asignar');
  assert.equal(tv.monto, 0);
  assert.equal(tv.tiempo, 'hace 1 día');
  assert.deepEqual(tv.estado, { label: 'Listo para entrega', clases: infoEstadoPedido('LISTO_ENTREGA').clases, colores: null });
  assert.equal(tv.accionPrincipal.texto, 'Despachar');
  assert.deepEqual(tarjetaHub({ ...ven, tipo: 'PVEN' }), tv, 'PVEN da la misma tarjeta que VEN (RP74)');
  // Nunca un chip «Soporte»: el Hub no trae Soporte (R8).
  assert.ok(!tarjetaHub({ ...sc, tipo_solicitud: 'Soporte Tecnico' }).chips.some((c) => c.texto === 'Soporte'));
  assert.throws(() => tarjetaHub({ tipo: 'XX', id: 1 }), /Tipo de documento/);
}

console.log('--- TEST 7b: estadoDeTarjeta se exporta (r1, punto 4) ---');
{
  assert.deepEqual(estadoDeTarjeta('SC', 'PENDIENTE_CONFIRMACION'), { label: 'Pendiente por confirmación', clases: null,
    colores: { color: '#b45309', bg: '#fffbeb', border: '#fde68a' } });
  assert.deepEqual(estadoDeTarjeta('COT', 'VENCIDA'), { label: 'Vencida', clases: ESTADOS_COTIZACION.VENCIDA.clases, colores: null });
  assert.deepEqual(estadoDeTarjeta('PVEN', 'EN_PROCESO'), estadoDeTarjeta('VEN', 'EN_PROCESO'), 'PVEN = VEN');
  assert.deepEqual(estadoDeTarjeta('VEN', 'EN_PROCESO'), { label: 'En proceso', clases: infoEstadoPedido('EN_PROCESO').clases, colores: null });
  assert.equal(estadoDeTarjeta('COT', 'ALGO_NUEVO').label, 'Algo nuevo', 'un código desconocido sale humanizado');
  assert.deepEqual(estadoDeTarjeta('SC', 'ASIGNADA'), tarjetaHub({ tipo: 'SC', id: 1, estado: 'ASIGNADA' }).estado, 'la misma de tarjetaHub');
  assert.throws(() => estadoDeTarjeta('XX', 'A'), /Tipo de documento/);
}

console.log('--- TEST 8: confirmacionReiniciarSolicitud (RP17) ---');
{
  const texto = (destino) => `La solicitud vuelve a ${destino}: se anula el enlace que se le envió al cliente y su confirmación, y habrá que enviársela de nuevo.`;
  assert.deepEqual(confirmacionReiniciarSolicitud({ advisor_user_id: 4 }), {
    titulo: 'Reiniciar solicitud', mensaje: texto('Asignada'), textoConfirmar: 'Reiniciar solicitud', peligro: true,
  });
  assert.equal(confirmacionReiniciarSolicitud({ advisor_user_id: null, advisor_name: 'Laura' }).mensaje, texto('Nueva'),
    'el destino lo da advisor_user_id, como en el detalle');
  assert.equal(confirmacionReiniciarSolicitud(null).mensaje, texto('Nueva'));
}

// ─── Pedidos ────────────────────────────────────────────────────────────────────

console.log('--- TEST 9: motivoTransicionPedido = los textos de N2 sin el número ---');
{
  assert.equal(motivoTransicionPedido('CANCELADO', 'EN_PROCESO'), 'El pedido está cancelado y no se puede reabrir.');
  assert.equal(motivoTransicionPedido('FACTURADO', 'ENTREGADO'), 'El pedido ya está facturado; su estado no se puede cambiar.');
  assert.equal(motivoTransicionPedido('ENTREGADO', 'PENDIENTE_COMPRA'), 'Un pedido entregado solo puede pasar a Facturado.');
  assert.equal(motivoTransicionPedido('ENTREGADO', 'CANCELADO'), 'Un pedido entregado solo puede pasar a Facturado.');
  assert.equal(motivoTransicionPedido('EN_PROCESO', 'FACTURADO'), 'Solo un pedido entregado se puede marcar como Facturado.');
  assert.equal(motivoTransicionPedido('DEVUELTO_TOTAL', 'EN_PROCESO'), 'El pedido está devuelto; su estado no se puede cambiar.');
  assert.equal(motivoTransicionPedido('PARCIALMENTE_ENTREGADO', 'LISTO_ENTREGA'),
    'Un pedido entregado parcialmente solo puede pasar a Entregado.');
  assert.equal(motivoTransicionPedido('EN_PROCESO', 'PAGADO'), '«Pagado» no es un estado válido para un Pedido de Venta.');
  // Se recorre toda la tabla: null si y solo si el servidor acepta el cambio (o es el mismo estado).
  const codigos = [...Object.keys(ESTADOS_PEDIDO), 'ALGO_RARO'];
  for (const desde of codigos) {
    for (const hacia of Object.keys(ESTADOS_PEDIDO)) {
      const motivo = motivoTransicionPedido(desde, hacia);
      if (desde === hacia || transicionesPedido(desde).includes(hacia)) assert.equal(motivo, null, `${desde} → ${hacia}`);
      else assert.ok(typeof motivo === 'string' && motivo.endsWith('.') && !/\d/.test(motivo), `${desde} → ${hacia}: ${motivo}`);
    }
  }
}

console.log('--- TEST 10: COLUMNAS_PEDIDO: una por grupo y cada estado en una sola ---');
{
  assert.deepEqual(COLUMNAS_PEDIDO.map((c) => [c.clave, c.titulo, c.cerrada, c.estadoDestino]), [
    ['pend_compra', 'Pendiente de compra', false, 'PENDIENTE_COMPRA'],
    ['en_proceso', 'En proceso', false, 'EN_PROCESO'],
    ['listo_entrega', 'Listo para entrega', false, 'LISTO_ENTREGA'],
    ['entregado', 'Entregado', false, null],
    ['facturado', 'Facturado', true, 'FACTURADO'],
    ['cancelado', 'Cancelado', true, 'CANCELADO'],
  ]);
  const codigos = Object.keys(ESTADOS_PEDIDO);
  assert.equal(codigos.length, 18);
  for (const e of codigos) {
    assert.equal(COLUMNAS_PEDIDO.filter((c) => c.estados.includes(e)).length, 1, e);
  }
  const de = (e) => COLUMNAS_PEDIDO.find((c) => c.estados.includes(e)).clave;
  assert.equal(de('PENDIENTE_PAGO'), 'pend_compra');
  assert.equal(de('EN_TRANSITO'), 'en_proceso');
  assert.equal(de('DEVUELTO_TOTAL'), 'cancelado');
  assert.deepEqual(agruparEnColumnas(codigos.map((estado) => ({ estado })), COLUMNAS_PEDIDO)[SIN_COLUMNA], []);
  assert.deepEqual(COLUMNAS_PEDIDO.map((c) => c.tono), ['orange', 'purple', 'teal', 'emerald', 'green', 'red'],
    'el color de ESTADOS_PEDIDO del estado clave');
}

console.log('--- TEST 11: reglaSoltarPedido ---');
{
  const p = (estado) => ({ id: 5, estado });
  const col = (e) => COLUMNAS_PEDIDO.find((c) => c.estados.includes(e)).clave;
  const soltar = (estado, destino) => reglaSoltarPedido(p(estado), col(estado), destino);
  const ENTREGAS = bloqueado('Se despacha desde Entregas: ahí eliges la bodega y se descuenta el inventario.',
    { texto: 'Ir a Entregas', href: '/dashboard/inventario/entregas' });
  assert.deepEqual(soltar('EN_PROCESO', 'listo_entrega'), { tipo: 'cambio', estado: 'LISTO_ENTREGA' });
  assert.deepEqual(soltar('PENDIENTE_COMPRA', 'en_proceso'), { tipo: 'cambio', estado: 'EN_PROCESO' });
  assert.deepEqual(soltar('LISTO_ENTREGA', 'pend_compra'), { tipo: 'cambio', estado: 'PENDIENTE_COMPRA' }, 'libre entre los 3 primeros');
  assert.deepEqual(soltar('ENTREGADO', 'pend_compra'), bloqueado('Un pedido entregado solo puede pasar a Facturado.'));
  assert.deepEqual(soltar('ENTREGADO', 'facturado'), { tipo: 'accion', accion: 'facturar' });
  assert.deepEqual(soltar('EN_PROCESO', 'facturado'), bloqueado('Solo un pedido entregado se puede marcar como Facturado.'));
  for (const destino of COLUMNAS_PEDIDO.map((c) => c.clave).filter((c) => c !== 'cancelado')) {
    assert.deepEqual(soltar('CANCELADO', destino), bloqueado('El pedido está cancelado y no se puede reabrir.'), destino);
  }
  assert.deepEqual(soltar('EN_PROCESO', 'entregado'), ENTREGAS);
  assert.deepEqual(soltar('LISTO_ENTREGA', 'entregado'), ENTREGAS);
  assert.deepEqual(soltar('LISTO_ENTREGA', 'cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.deepEqual(soltar('FACTURADO', 'cancelado'), bloqueado('El pedido ya está facturado; su estado no se puede cambiar.'));
  assert.deepEqual(soltar('DEVUELTO_TOTAL', 'en_proceso'), bloqueado('El pedido está devuelto; su estado no se puede cambiar.'));
  assert.deepEqual(soltar('EN_PROCESO', 'en_proceso'), { tipo: 'ninguno' });
  assert.throws(() => reglaSoltarPedido(p('EN_PROCESO'), 'en_proceso', 'No Resuelto'), /desconocida/);
  for (const e of Object.keys(ESTADOS_PEDIDO)) {
    mapaDestinos(p(e), col(e), COLUMNAS_PEDIDO, reglaSoltarPedido); // la forma de kanban.js
  }
}

// ─── Cotizaciones ───────────────────────────────────────────────────────────────

console.log('--- TEST 12: COLUMNAS_COT ---');
{
  assert.deepEqual(COLUMNAS_COT.map((c) => [c.clave, c.titulo, c.estados, c.cerrada]), [
    ['borrador', 'Borrador', ['BORRADOR'], false],
    ['esperando', 'Esperando al cliente', ['PENDIENTE_CONFIRMACION', 'ENVIADA'], false],
    ['confirmada', 'Confirmada', ['CONFIRMADA'], false],
    ['vencida', 'Vencida', ['VENCIDA'], false],
    ['rechazada', 'Rechazada', ['RECHAZADA'], true],
  ]);
  for (const e of Object.keys(ESTADOS_COTIZACION)) {
    assert.equal(COLUMNAS_COT.filter((c) => c.estados.includes(e)).length, 1, e);
  }
}

console.log('--- TEST 13: reglaSoltarCotizacion (C15(a), RP16, D11, D22) ---');
{
  const cot = (estado, extra = {}) => ({ id: 9, numero: 'COT-9', estado, ...extra });
  const col = (e) => COLUMNAS_COT.find((c) => c.estados.includes(e)).clave;
  const soltar = (estado, destino, opciones, extra) => reglaSoltarCotizacion(cot(estado, extra), col(estado), destino, opciones);
  const enlace = abrir('COT', 9, RUTA_LISTA_COTIZACIONES);
  // Con un pedido vigente, todo bloqueado.
  const pedidos = [{ id: 2, numero: 'PVEN-2', estado: 'CANCELADO' }, { id: 4, numero: 'PVEN-4', estado: 'EN_PROCESO' }];
  for (const destino of COLUMNAS_COT.map((c) => c.clave).filter((c) => c !== 'confirmada')) {
    assert.deepEqual(soltar('CONFIRMADA', destino, {}, { pedidos_venta: pedidos }),
      bloqueado('Tiene el pedido PVEN-4 activo: para cambiarla, cancela primero el pedido.', abrir('PVEN', 4, RUTA_LISTA_COTIZACIONES)), destino);
  }
  // Enviar: solo con puedeEnviar (RP16); sin él, «Ábrela para enviar.» con el enlace de D22.
  assert.deepEqual(soltar('BORRADOR', 'esperando', { puedeEnviar: true }, CON_PRECIO), { tipo: 'accion', accion: 'enviar' });
  assert.deepEqual(soltar('BORRADOR', 'esperando', {}, CON_PRECIO), bloqueado(ABRELA_ENVIAR, enlace));
  // r1 (punto 2): «VENCIDA → Esperando» queda tachado (el servidor no la envía); sin precios no se ofrece, con o sin puedeEnviar.
  for (const puedeEnviar of [true, false]) {
    assert.deepEqual(soltar('VENCIDA', 'esperando', { puedeEnviar }, CON_PRECIO), bloqueado(PASALA_BORRADOR, enlace), `VENCIDA ${puedeEnviar}`);
    assert.deepEqual(soltar('BORRADOR', 'esperando', { puedeEnviar }), bloqueado(CALCULA, enlace), `sin productos ni total ${puedeEnviar}`);
    assert.deepEqual(soltar('BORRADOR', 'esperando', { puedeEnviar }, { ...CON_PRECIO, productos: [] }), bloqueado(CALCULA, enlace));
    assert.deepEqual(soltar('BORRADOR', 'esperando', { puedeEnviar }, { ...CON_PRECIO, total_cop: -5 }), bloqueado(CALCULA, enlace));
  }
  assert.deepEqual(reglaSoltarCotizacion(cot('ENVIADA', { total_cop: 0, productos: CON_PRODUCTOS }), 'borrador', 'esperando', { puedeEnviar: true }),
    bloqueado(CALCULA, enlace), 'la ENVIADA antigua también');
  assert.deepEqual(soltar('BORRADOR', 'esperando', { returnTo: '/dashboard/ventas' }, CON_PRECIO), bloqueado(ABRELA_ENVIAR, abrir('COT', 9, '/dashboard/ventas')),
    'el return_to de la pantalla que llama');
  assert.deepEqual(soltar('RECHAZADA', 'esperando', { puedeEnviar: true }), bloqueado('Primero pásala a Borrador para retomarla.'));
  assert.deepEqual(soltar('CONFIRMADA', 'esperando', { puedeEnviar: true }), bloqueado('El cliente ya la confirmó.'));
  // C15(a): sacarla de «Esperando» o de «Confirmada» hacia Borrador o Vencida.
  for (const estado of ['PENDIENTE_CONFIRMACION', 'CONFIRMADA']) {
    for (const destino of ['borrador', 'vencida']) {
      assert.deepEqual(soltar(estado, destino, { puedeEnviar: true }), bloqueado(RE_COTIZAR, enlace), `${estado} → ${destino}`);
    }
  }
  // Cambios sueltos
  assert.deepEqual(soltar('RECHAZADA', 'borrador'), { tipo: 'cambio', estado: 'BORRADOR' });
  assert.deepEqual(soltar('VENCIDA', 'borrador'), { tipo: 'cambio', estado: 'BORRADOR' });
  assert.deepEqual(soltar('ENVIADA', 'borrador'), { tipo: 'cambio', estado: 'BORRADOR' });
  assert.deepEqual(soltar('BORRADOR', 'vencida'), { tipo: 'cambio', estado: 'VENCIDA' });
  assert.deepEqual(soltar('ENVIADA', 'vencida'), { tipo: 'cambio', estado: 'VENCIDA' });
  assert.deepEqual(soltar('RECHAZADA', 'vencida'), bloqueado('Primero pásala a Borrador para retomarla.'));
  // → Confirmada: siempre bloqueado; → Rechazada: rechazar.
  for (const estado of Object.keys(ESTADOS_COTIZACION).filter((e) => e !== 'CONFIRMADA')) {
    assert.deepEqual(soltar(estado, 'confirmada', { puedeEnviar: true }), bloqueado('Solo el cliente confirma la cotización con su enlace.'), estado);
  }
  assert.deepEqual(soltar('BORRADOR', 'rechazada'), { tipo: 'accion', accion: 'rechazar' });
  assert.deepEqual(soltar('PENDIENTE_CONFIRMACION', 'rechazada'), { tipo: 'accion', accion: 'rechazar' });
  // Nunca la acción 'confirmar' (C15(a) la reemplaza).
  for (const estado of Object.keys(ESTADOS_COTIZACION)) {
    for (const destino of COLUMNAS_COT.map((c) => c.clave)) {
      for (const puedeEnviar of [false, true]) {
        const r = soltar(estado, destino, { puedeEnviar });
        assert.ok(!(r.tipo === 'accion' && r.accion === 'confirmar'), `${estado} → ${destino}`);
        if (!puedeEnviar) assert.ok(!(r.tipo === 'accion' && r.accion === 'enviar'), `sin puedeEnviar no se envía: ${estado} → ${destino}`);
      }
    }
    mapaDestinos(cot(estado), col(estado), COLUMNAS_COT, reglaSoltarCotizacion);
  }
  assert.throws(() => reglaSoltarCotizacion(cot('BORRADOR'), 'borrador', 'Cancelado'), /desconocida/);
}

// ─── Solicitudes ────────────────────────────────────────────────────────────────

console.log('--- TEST 14: COLUMNAS_SC (sin Soporte) ---');
{
  assert.deepEqual(COLUMNAS_SC.map((c) => [c.clave, c.titulo, c.cerrada]), [
    ['nueva', 'Nueva', false],
    ['asignada', 'Asignada', false],
    ['pendiente', 'Pendiente por confirmación', false],
    ['confirmada', 'Confirmada', false],
    ['cancelada', 'Cancelada', true],
  ]);
  assert.deepEqual(COLUMNAS_SC[3].estados, ['CONFIRMADA', 'COTIZADA', 'EN_ESPERA_CONFIRMACION', 'RECHAZADA', 'VENCIDA']);
  for (const e of Object.keys(ESTADOS_SC)) {
    assert.equal(COLUMNAS_SC.filter((c) => c.estados.includes(e)).length, e === 'N/A_SOPORTE' ? 0 : 1, e);
  }
}

console.log('--- TEST 15: reglaSoltarSC (RP16, D11, D22) ---');
{
  const sc = (estado, extra = {}) => ({ id: 7, numero: 'SC-7', estado, ...extra });
  const col = (e) => COLUMNAS_SC.find((c) => c.estados.includes(e)).clave;
  const soltar = (fila, destino, opciones) => reglaSoltarSC(fila, col(fila.estado), destino, opciones);
  const enlace = abrir('SC', 7, RUTA_LISTA_SOLICITUDES);
  // → Pendiente: enviar solo con puedeEnviar.
  assert.deepEqual(soltar(sc('ASIGNADA', { productos: CON_PRODUCTOS }), 'pendiente', { puedeEnviar: true }), { tipo: 'accion', accion: 'enviar' });
  assert.deepEqual(soltar(sc('ASIGNADA', { productos: CON_PRODUCTOS }), 'pendiente'), bloqueado(ABRELA_ENVIAR, enlace));
  assert.equal(enlace.href, '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fventas%2Fsolicitud', 'D22: enlaceDocumento con return_to');
  assert.deepEqual(soltar(sc('ASIGNADA', { productos: [] }), 'pendiente', { puedeEnviar: true }),
    bloqueado('Agrégale productos antes de enviarla.', enlace));
  assert.deepEqual(soltar(sc('BORRADOR', { productos: CON_PRODUCTOS }), 'pendiente', { puedeEnviar: true }),
    bloqueado('Primero asígnale un asesor.', enlace));
  assert.deepEqual(soltar(sc('CONFIRMADA'), 'pendiente', { puedeEnviar: true }), bloqueado('El cliente ya la confirmó.'));
  // → Nueva o Asignada desde Pendiente o Confirmada: reiniciar, solo en la columna donde queda.
  assert.deepEqual(soltar(sc('PENDIENTE_CONFIRMACION', { advisor_user_id: 3 }), 'asignada'), { tipo: 'accion', accion: 'reiniciar' });
  assert.deepEqual(soltar(sc('PENDIENTE_CONFIRMACION', { advisor_user_id: 3 }), 'nueva'),
    bloqueado('Al reiniciarla queda en Asignada porque tiene asesor.'));
  assert.deepEqual(soltar(sc('CONFIRMADA', { advisor_user_id: null }), 'nueva'), { tipo: 'accion', accion: 'reiniciar' });
  assert.deepEqual(soltar(sc('CONFIRMADA', { advisor_user_id: null }), 'asignada'),
    bloqueado('Al reiniciarla queda en Nueva porque no tiene asesor.'));
  // puedeReiniciar con las cotizaciones y los pedidos_venta de la fila (RP16, RP15); si no, D22.
  const conCot = sc('CONFIRMADA', { advisor_user_id: 3, cotizaciones: [{ id: 1, estado: 'VENCIDA' }] });
  assert.deepEqual(soltar(conCot, 'asignada'), bloqueado(NO_REINICIAR, enlace), 'una COT vencida cuenta como activa');
  assert.deepEqual(soltar(conCot, 'nueva'), bloqueado(NO_REINICIAR, enlace));
  const conPedido = sc('CONFIRMADA', { advisor_user_id: 3, pedidos_venta: [{ id: 4, estado: 'EN_PROCESO' }] });
  assert.deepEqual(soltar(conPedido, 'asignada'), bloqueado(NO_REINICIAR, enlace));
  const soloCanceladas = sc('CONFIRMADA', { advisor_user_id: 3, cotizaciones: [{ id: 1, estado: 'RECHAZADA' }],
    pedidos_venta: [{ id: 4, estado: 'CANCELADO' }] });
  assert.deepEqual(soltar(soloCanceladas, 'asignada'), { tipo: 'accion', accion: 'reiniciar' });
  assert.deepEqual(soltar(sc('COTIZADA'), 'nueva'), bloqueado('Solo se reinicia una solicitud pendiente por confirmación o confirmada.'),
    'un heredado no se reinicia');
  // Entre Nueva y Asignada no hay cambio suelto.
  assert.deepEqual(soltar(sc('ASIGNADA', { advisor_user_id: 3 }), 'nueva'),
    bloqueado('Para dejarla en Nueva quítale el asesor desde la solicitud.', enlace));
  assert.deepEqual(soltar(sc('BORRADOR'), 'asignada'), bloqueado('Asígnale un asesor desde la solicitud.', enlace));
  // → Cancelada: cancelar. Desde Cancelada: la Papelera.
  assert.deepEqual(soltar(sc('ASIGNADA'), 'cancelada'), { tipo: 'accion', accion: 'cancelar' });
  // r1 (punto 3): con una cotización activa o un pedido vigente no se ofrece cancelar (N4).
  assert.deepEqual(soltar(sc('CONFIRMADA', CON_COT_BORRADOR), 'cancelada'), bloqueado(NO_CANCELAR, enlace), 'una COT en Borrador');
  assert.deepEqual(soltar(sc('ASIGNADA', CON_PVEN_EN_PROCESO), 'cancelada'), bloqueado(NO_CANCELAR, enlace), 'un PVEN en proceso');
  assert.deepEqual(soltar(sc('CONFIRMADA', SOLO_CAIDOS), 'cancelada'), { tipo: 'accion', accion: 'cancelar' }, 'solo documentos caídos');
  assert.deepEqual(soltar(sc('CONFIRMADA', CON_COT_BORRADOR), 'cancelada', { returnTo: '/dashboard/ventas' }),
    bloqueado(NO_CANCELAR, abrir('SC', 7, '/dashboard/ventas')), 'el return_to de la pantalla que llama');
  for (const destino of ['nueva', 'asignada', 'pendiente', 'confirmada']) {
    assert.deepEqual(soltar(sc('CANCELADA'), destino), bloqueado('Una solicitud cancelada se restaura desde la Papelera.'), destino);
  }
  // → Confirmada: siempre bloqueado.
  for (const estado of ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION']) {
    assert.deepEqual(soltar(sc(estado, { productos: CON_PRODUCTOS }), 'confirmada', { puedeEnviar: true }),
      bloqueado('Solo el cliente confirma la solicitud con su enlace.'), estado);
  }
  // Sin puedeEnviar ningún soltar envía; todo tiene la forma de kanban.js.
  for (const estado of Object.keys(ESTADOS_SC).filter((e) => e !== 'N/A_SOPORTE')) {
    for (const destino of COLUMNAS_SC.map((c) => c.clave)) {
      const r = soltar(sc(estado, { productos: CON_PRODUCTOS, advisor_user_id: 3 }), destino);
      assert.ok(!(r.tipo === 'accion' && r.accion === 'enviar'), `${estado} → ${destino}`);
    }
    mapaDestinos(sc(estado), col(estado), COLUMNAS_SC, reglaSoltarSC);
  }
  // Sin id no hay enlace (el bloqueo sigue).
  assert.deepEqual(reglaSoltarSC({ estado: 'BORRADOR' }, 'nueva', 'pendiente'), bloqueado('Primero asígnale un asesor.'));
  assert.throws(() => reglaSoltarSC(sc('BORRADOR'), 'nueva', 'No Resuelto'), /desconocida/);
}

console.log('--- B4 T7 TEST A: opcionesEstadosHub — el filtro de estados del Hub, agrupado por tipo (TABLA-hub-ventas 5) ---');
{
  const todas = kv.opcionesEstadosHub('todos');
  // Solicitud, Cotización y Pedido, en ese orden, con TIPO:ESTADO (el formato de estados= de /ventas/hub/documentos).
  assert.deepEqual(todas.map((o) => o.valor), [
    'SC:BORRADOR', 'SC:ASIGNADA', 'SC:PENDIENTE_CONFIRMACION', 'SC:CONFIRMADA', 'SC:CANCELADA',
    'COT:BORRADOR', 'COT:ENVIADA', 'COT:PENDIENTE_CONFIRMACION', 'COT:CONFIRMADA', 'COT:RECHAZADA', 'COT:VENCIDA',
    'VEN:PENDIENTE_COMPRA', 'VEN:PENDIENTE_PAGO', 'VEN:EN_PROCESO', 'VEN:EN_TRANSITO', 'VEN:LISTO_ENTREGA',
    'VEN:ENTREGADO', 'VEN:FACTURADO', 'VEN:CANCELADO', 'VEN:DEVUELTO_TOTAL',
  ]);
  // Caben todas juntas en el filtro (MAXIMO_ESTADOS de lib/tabla.js, el tope de 20 del servidor).
  assert.ok(todas.length <= MAXIMO_ESTADOS);
  // La etiqueta lleva el grupo delante y el nombre legible de la tabla única de su tipo (nunca el código crudo).
  const GRUPO = { SC: 'Solicitud', COT: 'Cotización', VEN: 'Pedido' };
  const INFO = { SC: infoEstadoSolicitud, COT: infoEstadoCotizacion, VEN: infoEstadoPedido };
  for (const o of todas) {
    const [tipo, estado] = o.valor.split(':');
    assert.equal(o.etiqueta, `${GRUPO[tipo]} · ${INFO[tipo](estado).label}`, o.valor);
    assert.ok(!o.etiqueta.includes('_'), `${o.valor}: sin el código crudo`);
  }
  assert.equal(todas[0].etiqueta, 'Solicitud · Nueva');
  assert.equal(todas[7].etiqueta, 'Cotización · Esperando confirmación del cliente');
  assert.equal(todas[19].etiqueta, 'Pedido · Devuelto');
  // Cada estado existe en su tipo (el servidor da 422 con uno que no).
  for (const o of todas) {
    const [tipo, estado] = o.valor.split(':');
    const tabla = tipo === 'SC' ? ESTADOS_SC : tipo === 'COT' ? ESTADOS_COTIZACION : ESTADOS_PEDIDO;
    assert.ok(Object.hasOwn(tabla, estado), o.valor);
  }
  // Las pestañas de un tipo traen solo su grupo; las demás (y una vista desconocida), los tres.
  for (const [vista, prefijo] of [['sc', 'SC:'], ['cot', 'COT:'], ['ven', 'VEN:']]) {
    assert.deepEqual(kv.opcionesEstadosHub(vista), todas.filter((o) => o.valor.startsWith(prefijo)), vista);
  }
  for (const vista of ['todos', 'no_resueltos', 'acciones_tomadas', null, undefined, 'algo']) {
    assert.deepEqual(kv.opcionesEstadosHub(vista), todas, String(vista));
  }
  // Inmutables y la misma referencia en cada llamada (BarraTabla la llama en cada render).
  assert.ok(Object.isFrozen(todas) && todas.every((o) => Object.isFrozen(o)));
  assert.equal(kv.opcionesEstadosHub('sc'), kv.opcionesEstadosHub('sc'));
  assert.equal(kv.opcionesEstadosHub('todos'), kv.opcionesEstadosHub('no_resueltos'));
}

console.log('--- B4 T7 TEST B: chipsResolucionHub — la columna Resolución del Hub (R6, RP18, D4) ---');
{
  const r = (fila) => kv.chipsResolucionHub(fila);
  // El chip corto de la resolución del servidor (no recalcula el atraso, R8): cabe en la columna de 104 px.
  assert.deepEqual(r({ tipo: 'SC', resolucion: 'ATRASADO', dias_sin_mov: 4 }).principal,
    { texto: 'Atrasado +4 d', tono: 'rose', titulo: 'Atrasado: 4 días sin movimiento' });
  assert.equal(r({ tipo: 'COT', resolucion: 'ATRASADO', dias_sin_mov: 1 }).principal.titulo, 'Atrasado: 1 día sin movimiento');
  assert.equal(r({ tipo: 'VEN', resolucion: 'ATRASADO', dias_sin_mov: 3.9 }).principal.texto, 'Atrasado +3 d');
  assert.equal(r({ tipo: 'VEN', resolucion: 'ATRASADO', dias_sin_mov: '6' }).principal.texto, 'Atrasado +6 d');
  for (const d of [null, undefined, -1, 'x', NaN, '']) {
    assert.deepEqual(r({ tipo: 'VEN', resolucion: 'ATRASADO', dias_sin_mov: d }).principal,
      { texto: 'Atrasado', tono: 'rose', titulo: 'Atrasado' }, String(d));
  }
  // Los demás grupos con el nombre de los separadores (RP67: «Sin resolver», no «Pendiente»).
  assert.deepEqual(r({ tipo: 'SC', resolucion: 'NO_RESUELTO', dias_sin_mov: 30 }).principal,
    { texto: 'Sin resolver', tono: 'amber', titulo: 'Sin resolver' });
  assert.deepEqual(r({ tipo: 'VEN', resolucion: 'ACCION_TOMADA' }).principal, { texto: 'Acción tomada', tono: 'emerald', titulo: 'Acción tomada' });
  assert.deepEqual(r({ tipo: 'VEN', resolucion: 'CERRADO' }).principal, { texto: 'Cerrado', tono: 'slate', titulo: 'Cerrado' });
  for (const resolucion of [null, undefined, 'OTRO']) assert.equal(r({ tipo: 'SC', resolucion }).principal, null, String(resolucion));
  // Debajo, los chips de chipsDocumentoVentas sin el de atraso (ya es el principal): recordatorio y cambios del cliente.
  const sc = {
    tipo: 'SC', estado: 'ASIGNADA', resolucion: 'ATRASADO', dias_sin_mov: 4, seguimiento_estado: 'AGOTADO',
    cambios_cliente: { tipo: 'CAMBIOS', at: '2026-10-20T10:00:00Z', comentario: 'Otro color' },
  };
  assert.deepEqual(r(sc).extras, [
    { texto: ACCIONES_BLOQUE3.SEGUIMIENTO_AGOTADO.etiqueta, tono: 'amber' }, { texto: 'Cambios pedidos', tono: 'amber' },
  ]);
  assert.deepEqual(r(sc).extras, chipsDocumentoVentas(sc).slice(1));
  const sinAtraso = { ...sc, resolucion: 'NO_RESUELTO' };
  assert.deepEqual(r(sinAtraso).extras, chipsDocumentoVentas(sinAtraso));
  assert.deepEqual(r({ tipo: 'VEN', resolucion: 'ATRASADO', dias_sin_mov: 2 }).extras, []);
  assert.deepEqual(r(null), { principal: null, extras: [] });
}

console.log('--- B4 T7 r1 TEST C (m7c y m7d): una sola lectura de los días y una sola sigla de tipo ---');
{
  // m7d: la sigla que ve el usuario (VEN y PVEN son el mismo tipo, RP74). La usan la tarjeta del tablero y la tabla.
  assert.equal(kv.siglaDeTipo('VEN'), 'PVEN');
  assert.equal(kv.siglaDeTipo('PVEN'), 'PVEN');
  assert.equal(kv.siglaDeTipo('SC'), 'SC');
  assert.equal(kv.siglaDeTipo('COT'), 'COT');
  assert.equal(tarjetaHub({ tipo: 'VEN', id: 1, numero: 'PVEN-1', estado: 'EN_PROCESO' }).tipo, kv.siglaDeTipo('VEN'));
  const fuente = readFileSync(new URL('../src/lib/kanban-ventas.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(fuente, /tipo: siglaDeTipo\(tipo\),/, 'tarjetaHub usa siglaDeTipo');
  assert.equal((fuente.match(/=== 'VEN' \? 'PVEN'/g) ?? []).length, 1, "tipo === 'VEN' ? 'PVEN' solo en siglaDeTipo");
  assert.match(fuente, /export function siglaDeTipo\(tipo\) \{\s*return tipo === 'VEN' \? 'PVEN' : tipo;\s*\}/);
  // m7c: textoAtrasado y chipsResolucionHub leen dias_sin_mov con el mismo diasEnteros (los mismos casos de antes).
  assert.match(fuente, /^function diasEnteros\(valor\) \{/m);
  const textoAtrasado = /function textoAtrasado\(dias\) \{([\s\S]*?)\n\}/.exec(fuente)?.[1] ?? '';
  const resolucion = /export function chipsResolucionHub\(fila\) \{([\s\S]*?)\n\}/.exec(fuente)?.[1] ?? '';
  assert.match(textoAtrasado, /const d = diasEnteros\(dias\);/);
  assert.match(resolucion, /const dias = diasEnteros\(fila\?\.dias_sin_mov\);/);
  for (const cuerpo of [textoAtrasado, resolucion]) assert.ok(!/Math\.floor|Number\(/.test(cuerpo), 'sin otra lectura de los días');
  for (const [d, texto] of [[4, 'Atrasado 4 días'], [1, 'Atrasado 1 día'], ['3', 'Atrasado 3 días'], [2.9, 'Atrasado 2 días'],
    [-1, 'Atrasado'], ['', 'Atrasado'], [null, 'Atrasado'], ['x', 'Atrasado']]) {
    assert.equal(chipsDocumentoVentas({ tipo: 'VEN', resolucion: 'ATRASADO', dias_sin_mov: d })[0].texto, texto, String(d));
  }
}

console.log('--- B4 T8 TEST D: opcionesEstadosSolicitudes — el filtro de estados de cada pestaña de Solicitudes ---');
{
  // TABLA-listas-ventas punto 5 (H15): casillas con los nombres de estados-solicitud.js y solo los estados de la
  // pestaña (las vistas de GET /ventas/solicitudes). Soporte y la Papelera no tienen filtro de estados.
  const etiquetas = (vista) => kv.opcionesEstadosSolicitudes(vista).map((o) => [o.valor, o.etiqueta]);
  assert.deepEqual(etiquetas('activas'), [['BORRADOR', 'Nueva'], ['ASIGNADA', 'Asignada'],
    ['PENDIENTE_CONFIRMACION', 'Pendiente por confirmación']]);
  assert.deepEqual(etiquetas('confirmadas'), [['CONFIRMADA', 'Confirmada']]);
  assert.deepEqual(etiquetas('canceladas'), [['CANCELADA', 'Cancelada']]);
  for (const vista of ['soporte', 'papelera', 'todas', null, undefined, 'otra']) {
    assert.deepEqual(kv.opcionesEstadosSolicitudes(vista), [], String(vista));
  }
  // Las etiquetas son las de la tabla única (nunca el código crudo).
  for (const vista of ['activas', 'confirmadas', 'canceladas']) {
    for (const o of kv.opcionesEstadosSolicitudes(vista)) assert.equal(o.etiqueta, infoEstadoSolicitud(o.valor).label);
  }
  // El tablero (vista=todas_sin_soporte): un estado por columna, en el orden de COLUMNAS_SC.
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_SC.map((o) => o.valor),
    ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA', 'CANCELADA']);
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_SC.map((o) => o.valor), COLUMNAS_SC.map((c) => c.estados[0]));
  for (const o of kv.OPCIONES_ESTADOS_TABLERO_SC) assert.equal(o.etiqueta, infoEstadoSolicitud(o.valor).label);
  // Inmutables y la misma referencia en cada llamada (BarraTabla la llama en cada render).
  assert.equal(kv.opcionesEstadosSolicitudes('activas'), kv.opcionesEstadosSolicitudes('activas'));
  assert.equal(kv.opcionesEstadosSolicitudes('papelera'), kv.opcionesEstadosSolicitudes('soporte'));
  assert.ok(Object.isFrozen(kv.opcionesEstadosSolicitudes('activas')) && Object.isFrozen(kv.OPCIONES_ESTADOS_TABLERO_SC));
  assert.ok(Object.isFrozen(kv.opcionesEstadosSolicitudes('activas')[0]));
}

console.log('--- B4 T8 TEST E: estadosDeColumnaLista — los estados de una columna del tablero con el filtro de la pantalla ---');
{
  // KANBAN-ventas-listas punto 7 y R5: el tablero lee el MISMO estado que la tabla. Cada columna pide sus estados,
  // cruzados con los del filtro (en el orden de la columna); sin filtro, los de la columna.
  const confirmada = COLUMNAS_SC.find((c) => c.clave === 'confirmada');
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, []), [...confirmada.estados]);
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, null), [...confirmada.estados]);
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, undefined), [...confirmada.estados]);
  // r1 (m3): la opción de una columna en el filtro del tablero (su estado principal, OPCIONES_ESTADOS_TABLERO_SC) vale
  // TODA la columna: «Confirmada» trae también los heredados que la columna muestra sin filtro.
  assert.ok(confirmada.estados.length > 1, 'la columna Confirmada junta CONFIRMADA y los heredados');
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, ['CONFIRMADA']), [...confirmada.estados]);
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, ['VENCIDA', 'CONFIRMADA', 'ASIGNADA']), [...confirmada.estados],
    'con el principal, la columna entera, en su orden');
  assert.notEqual(kv.estadosDeColumnaLista(confirmada, ['CONFIRMADA']), confirmada.estados, 'con el principal, también una copia nueva');
  // Sin el principal, el cruce estado por estado (un filtro de la tabla que trae un heredado).
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, ['VENCIDA', 'ASIGNADA', 'COTIZADA']), ['COTIZADA', 'VENCIDA'], 'el orden de la columna');
  for (const c of COLUMNAS_SC) assert.deepEqual(kv.estadosDeColumnaLista(c, [c.estados[0]]), [...c.estados], c.clave);
  // Sin ninguno en común: [] (la pantalla no pide esa columna: queda vacía).
  assert.deepEqual(kv.estadosDeColumnaLista(confirmada, ['ASIGNADA']), []);
  assert.deepEqual(kv.estadosDeColumnaLista({ clave: 'x' }, ['ASIGNADA']), [], 'una columna sin estados');
  assert.deepEqual(kv.estadosDeColumnaLista(null, []), []);
  // Una copia: no se puede tocar la columna inmutable desde afuera.
  const copia = kv.estadosDeColumnaLista(confirmada, []);
  assert.notEqual(copia, confirmada.estados);
}

console.log('--- B4 T8 r1 TEST H (m10): consultaColumnaSC — la consulta de cada columna del tablero de Solicitudes ---');
{
  const estado = estadoTablaInicial({ vista: 'activas', q: ' cuna ', semaforo: 'atrasados', estados: [], orden: 'cliente', pagina: 3, tamano: 50 });
  const asignada = COLUMNAS_SC.find((c) => c.clave === 'asignada');
  const confirmada = COLUMNAS_SC.find((c) => c.clave === 'confirmada');
  const params = (q) => Object.fromEntries(new URLSearchParams(q));
  // R5: vista=todas_sin_soporte (no la pestaña), los estados de la columna, la búsqueda y el semáforo del estado, y el
  // orden, el límite y el desplazamiento de la columna (no la página ni el orden de la tabla).
  assert.equal(kv.VISTA_TABLERO_SC, 'todas_sin_soporte');
  const q = kv.consultaColumnaSC(estado, asignada, { orden: 'atencion', limit: 50, offset: 0 });
  assert.deepEqual(params(q), { vista: 'todas_sin_soporte', semaforo: 'atrasados', q: 'cuna', estados: 'ASIGNADA', orden: 'atencion', limit: '50', offset: '0' });
  assert.equal(q, queryListado(estado, { vista: 'todas_sin_soporte', estados: ['ASIGNADA'], orden: 'atencion', limit: 50, offset: 0 }));
  // La plegada: limit=0 (solo el total).
  assert.equal(params(kv.consultaColumnaSC(estado, confirmada, { orden: 'reciente', limit: 0, offset: 0 })).limit, '0');
  assert.equal(params(kv.consultaColumnaSC(estado, confirmada, { orden: 'reciente', limit: 0, offset: 0 })).estados, confirmada.estados.join(','));
  // Con el filtro de la pantalla: el cruce; sin nada en común, null (la columna no se pide y queda vacía).
  const filtrado = { ...estado, estados: ['ASIGNADA', 'BORRADOR'] };
  assert.equal(params(kv.consultaColumnaSC(filtrado, asignada, { orden: 'atencion', limit: 25, offset: 25 })).estados, 'ASIGNADA');
  assert.equal(kv.consultaColumnaSC(filtrado, confirmada, { orden: 'atencion', limit: 25, offset: 0 }), null);
  // Sin semáforo ni búsqueda no van (queryListado omite lo vacío).
  const limpio = params(kv.consultaColumnaSC(estadoTablaInicial({ vista: 'soporte' }), asignada, { orden: 'atencion', limit: 25, offset: 0 }));
  assert.equal(limpio.vista, 'todas_sin_soporte');
  assert.ok(!('semaforo' in limpio) && !('q' in limpio) && !('paso' in limpio));

  // El cableado de la pantalla (D27, como las de B1 a B3): el tablero pide con consultaColumnaSC; la lista, en Kanban y en
  // la Papelera, va sin filas (limit=0); y una acción desde una tarjeta recarga solo su origen y su destino (D39).
  const pantalla = readFileSync(new URL('../src/app/dashboard/ventas/solicitud/solicitud-client.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(pantalla, /const consulta = consultaColumnaSC\(estado, columna, \{ orden, limit, offset \}\);\s*if \(consulta === null\) return \{ filas: \[\], total: 0 \};\s*return normalizarRespuesta\(await apiFetch\(`\/ventas\/solicitudes\?\$\{consulta\}`, \{ signal \}\)\);/);
  assert.match(pantalla, /extra: enPapelera \? EXTRA_PAPELERA : modoEfectivo === 'kanban' \? EXTRA_TABLERO : null,/);
  assert.match(pantalla, /const EXTRA_TABLERO = \{ limit: 0 \};/);
  assert.match(pantalla, /tablero\.recargar\(\[origen, destino\]\)/);
  // Las dos acciones de una tarjeta llevan su origen y su destino hasta el final (la cancelación pasa por el modal).
  assert.match(pantalla, /if \(resultado\.accion === 'cancelar'\) deleteItem\(sc\.id, \[origen, destino\]\);/);
  assert.match(pantalla, /else if \(resultado\.accion === 'reiniciar'\) void reiniciarSC\(sc, \[origen, destino\]\);/);
  assert.match(pantalla, /if\(cancelColumnas\) recargarTrasTarjeta\(cancelColumnas\);\s*else recargarLista\(\);/);
  assert.match(pantalla, /if\(columnas\) recargarTrasTarjeta\(columnas\);\s*else recargarLista\(\);/);
  assert.match(pantalla, /setCancelColumnas\(columnas\);setShowCancelModal\(true\);/);
  assert.match(pantalla, /setCancelOmitidas\(\[\]\);setCancelColumnas\(null\);\n/, 'cerrar la ventana olvida la tarjeta');
}

console.log('--- B4 T8 TEST F: tarjetaSolicitud — la tarjeta del tablero de Solicitudes ---');
{
  // KANBAN-ventas-listas punto 7, RP15, RP18, D4, D37 y el cruce C5: la de tarjetaHub con la lista de Solicitudes como
  // return_to, y el subtítulo con el asesor y el tipo de solicitud.
  const sc = {
    tipo: 'SC', id: 7, numero: 'SC-7', estado: 'ASIGNADA', customer_name: 'Ana Ruiz', advisor_name: 'Laura',
    productos: CON_PRODUCTOS, cotizaciones: [], pedidos_venta: [], dias_creado: 3, resolucion: 'ATRASADO', dias_sin_mov: 3,
    seguimiento_estado: 'AGOTADO',
  };
  const base = tarjetaHub(sc, { returnTo: RUTA_LISTA_SOLICITUDES });
  const t = kv.tarjetaSolicitud(sc);
  assert.deepEqual({ ...t, subtitulo: null }, { ...base, subtitulo: null }, 'lo demás es la tarjeta del Hub');
  assert.equal(t.subtitulo, 'Laura · Cotización de producto', 'sin tipo, Cotización de producto (como la lista)');
  assert.equal(t.accionPrincipal.href, '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fventas%2Fsolicitud');
  assert.deepEqual(t.chips.map((c) => c.texto), ['Atrasado 3 días', 'Sin respuesta al recordatorio']);
  assert.equal(kv.tarjetaSolicitud({ ...sc, tipo_solicitud: 'Devolucion de Producto' }).subtitulo, 'Laura · Devolución de producto');
  assert.equal(kv.tarjetaSolicitud({ ...sc, advisor_name: '  ' }).subtitulo, 'Sin asignar · Cotización de producto');
  // Con otra ruta de regreso (la que pase la pantalla) y sin `tipo` en la fila (es una SC).
  const sinTipo = { ...sc };
  delete sinTipo.tipo;
  assert.deepEqual(kv.tarjetaSolicitud(sinTipo), t);
  assert.equal(kv.tarjetaSolicitud(sc, { returnTo: RUTA_HUB_VENTAS }).accionPrincipal.href,
    '/dashboard/ventas/solicitud/7?return_to=%2Fdashboard%2Fventas');
}

console.log('--- B4 T8 TEST G: puedeReiniciarSC — «Reiniciar» del menú de la fila con la misma regla del tablero (RP16) ---');
{
  // El menú ⋯ de la lista ofrece «Reiniciar» con los pedidos_venta de la fila (T6B), igual que reglaSoltarSC: antes
  // pasaba pedidosVigentes: [] (la lista no los traía).
  const pendiente = { tipo: 'SC', id: 3, estado: 'PENDIENTE_CONFIRMACION', advisor_user_id: 4, cotizaciones: [], pedidos_venta: [] };
  assert.equal(kv.puedeReiniciarSC(pendiente), true);
  assert.equal(kv.puedeReiniciarSC({ ...pendiente, estado: 'CONFIRMADA' }), true);
  assert.equal(kv.puedeReiniciarSC({ ...pendiente, pedidos_venta: [{ id: 9, estado: 'EN_PROCESO' }] }), false, 'pedido vigente');
  assert.equal(kv.puedeReiniciarSC({ ...pendiente, pedidos_venta: [{ id: 9, estado: 'CANCELADO' }] }), true, 'pedido cancelado');
  assert.equal(kv.puedeReiniciarSC({ ...pendiente, cotizaciones: [{ id: 2, estado: 'BORRADOR' }] }), false, 'COT activa');
  assert.equal(kv.puedeReiniciarSC({ ...pendiente, cotizaciones: [{ id: 2, estado: 'RECHAZADA' }] }), true, 'COT rechazada');
  for (const estado of ['BORRADOR', 'ASIGNADA', 'CANCELADA']) assert.equal(kv.puedeReiniciarSC({ ...pendiente, estado }), false, estado);
  assert.equal(kv.puedeReiniciarSC(null), false);
  // La misma respuesta que el tablero: «reiniciar» en la columna donde queda, o el bloqueo «No se puede reiniciar».
  for (const fila of [pendiente, { ...pendiente, pedidos_venta: [{ id: 9, estado: 'EN_PROCESO' }] },
    { ...pendiente, estado: 'CONFIRMADA', cotizaciones: [{ id: 2, estado: 'ENVIADA' }] }]) {
    const origen = fila.estado === 'CONFIRMADA' ? 'confirmada' : 'pendiente';
    const r = reglaSoltarSC(fila, origen, 'asignada');
    assert.equal(r.tipo === 'accion' && r.accion === 'reiniciar', kv.puedeReiniciarSC(fila), JSON.stringify(fila));
  }
}

console.log('--- B4 T9 TEST I: opcionesEstadosCotizaciones — el filtro de estados de cada pestaña de Cotizaciones ---');
{
  // TABLA-listas-ventas punto 6 (H15): casillas con los nombres de estados-cotizacion.js (RP4) y solo los estados que
  // caen en la pestaña (las vistas de GET /ventas/cotizaciones). Activas = todo lo que no es Rechazada ni Confirmada con
  // pedido o con la confirmación vigente (f_cot_activa): también la antigua ENVIADA y la CONFIRMADA con el pedido caído.
  const etiquetas = (vista) => kv.opcionesEstadosCotizaciones(vista).map((o) => [o.valor, o.etiqueta]);
  assert.deepEqual(etiquetas('activas'), [['BORRADOR', 'Borrador'], ['ENVIADA', 'Enviada al cliente'],
    ['PENDIENTE_CONFIRMACION', 'Esperando confirmación del cliente'], ['CONFIRMADA', 'Confirmada'], ['VENCIDA', 'Vencida']]);
  assert.deepEqual(etiquetas('confirmadas'), [['CONFIRMADA', 'Confirmada']]);
  assert.deepEqual(etiquetas('rechazadas'), [['RECHAZADA', 'Rechazada']]);
  for (const vista of ['todas', null, undefined, 'otra', 'constructor']) {
    assert.deepEqual(kv.opcionesEstadosCotizaciones(vista), [], String(vista));
  }
  for (const vista of ['activas', 'confirmadas', 'rechazadas']) {
    for (const o of kv.opcionesEstadosCotizaciones(vista)) assert.equal(o.etiqueta, infoEstadoCotizacion(o.valor).label);
  }
  // Entre las tres pestañas están los 6 estados, y RECHAZADA solo en la suya.
  const todas = ['activas', 'confirmadas', 'rechazadas'].flatMap((v) => kv.opcionesEstadosCotizaciones(v).map((o) => o.valor));
  assert.deepEqual([...new Set(todas)].sort(), Object.keys(ESTADOS_COTIZACION).sort());
  // El tablero (vista=todas): la opción de cada columna es su estado principal con el TÍTULO de la columna (la de
  // «Esperando al cliente» trae también la antigua ENVIADA: estadosDeColumnaLista, m3 de T8).
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_COT.map((o) => [o.valor, o.etiqueta]), [['BORRADOR', 'Borrador'],
    ['PENDIENTE_CONFIRMACION', 'Esperando al cliente'], ['CONFIRMADA', 'Confirmada'], ['VENCIDA', 'Vencida'],
    ['RECHAZADA', 'Rechazada']]);
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_COT.map((o) => o.valor), COLUMNAS_COT.map((c) => c.estados[0]));
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_COT.map((o) => o.etiqueta), COLUMNAS_COT.map((c) => c.titulo));
  // Inmutables y la misma referencia en cada llamada (BarraTabla la llama en cada render).
  assert.equal(kv.opcionesEstadosCotizaciones('activas'), kv.opcionesEstadosCotizaciones('activas'));
  assert.equal(kv.opcionesEstadosCotizaciones('todas'), kv.opcionesEstadosCotizaciones(null));
  assert.ok(Object.isFrozen(kv.opcionesEstadosCotizaciones('activas')) && Object.isFrozen(kv.OPCIONES_ESTADOS_TABLERO_COT));
  assert.ok(Object.isFrozen(kv.opcionesEstadosCotizaciones('activas')[0]) && Object.isFrozen(kv.OPCIONES_ESTADOS_TABLERO_COT[1]));
}

console.log('--- B4 T9 TEST J: consultaColumnaCOT — la consulta de cada columna del tablero de Cotizaciones ---');
{
  const estado = estadoTablaInicial({ vista: 'rechazadas', q: ' cuna ', semaforo: 'atrasados', estados: [], orden: 'cliente', pagina: 3, tamano: 50 });
  const borrador = COLUMNAS_COT.find((c) => c.clave === 'borrador');
  const esperando = COLUMNAS_COT.find((c) => c.clave === 'esperando');
  const params = (q) => Object.fromEntries(new URLSearchParams(q));
  // R5 (el patrón de consultaColumnaSC): vista=todas (no la pestaña), los estados de la columna, la búsqueda y el
  // semáforo del estado, y el orden, el límite y el desplazamiento de la columna (no la página ni el orden de la tabla).
  assert.equal(kv.VISTA_TABLERO_COT, 'todas');
  const q = kv.consultaColumnaCOT(estado, borrador, { orden: 'atencion', limit: 50, offset: 0 });
  assert.deepEqual(params(q), { vista: 'todas', semaforo: 'atrasados', q: 'cuna', estados: 'BORRADOR', orden: 'atencion', limit: '50', offset: '0' });
  assert.equal(q, queryListado(estado, { vista: 'todas', estados: ['BORRADOR'], orden: 'atencion', limit: 50, offset: 0 }));
  // «Esperando al cliente» pide PENDIENTE_CONFIRMACION y la antigua ENVIADA; la plegada (Rechazada), limit=0.
  assert.equal(params(kv.consultaColumnaCOT(estado, esperando, { orden: 'atencion', limit: 25, offset: 25 })).estados, 'PENDIENTE_CONFIRMACION,ENVIADA');
  const rechazada = COLUMNAS_COT.find((c) => c.clave === 'rechazada');
  assert.equal(params(kv.consultaColumnaCOT(estado, rechazada, { orden: 'reciente', limit: 0, offset: 0 })).limit, '0');
  // Con el filtro de la pantalla: el cruce (la opción de la columna vale toda la columna); sin nada en común, null.
  const filtrado = { ...estado, estados: ['PENDIENTE_CONFIRMACION', 'VENCIDA'] };
  assert.equal(params(kv.consultaColumnaCOT(filtrado, esperando, { orden: 'atencion', limit: 25, offset: 0 })).estados, 'PENDIENTE_CONFIRMACION,ENVIADA');
  assert.equal(params(kv.consultaColumnaCOT({ ...estado, estados: ['ENVIADA'] }, esperando, { orden: 'atencion', limit: 25, offset: 0 })).estados, 'ENVIADA');
  assert.equal(kv.consultaColumnaCOT(filtrado, borrador, { orden: 'atencion', limit: 25, offset: 0 }), null);
  // Sin semáforo ni búsqueda no van (queryListado omite lo vacío).
  const limpio = params(kv.consultaColumnaCOT(estadoTablaInicial({ vista: 'activas' }), borrador, { orden: 'atencion', limit: 25, offset: 0 }));
  assert.equal(limpio.vista, 'todas');
  assert.ok(!('semaforo' in limpio) && !('q' in limpio) && !('paso' in limpio));
  // r1 (m2): el paso. consultaColumnaCOT hace con él lo mismo que consultaColumnaSC de T8: no lo neutraliza, queryListado
  // lo pasa tal cual. Hoy no pesa: la lista nunca pone paso (no tiene cajas que filtren; las suyas navegan) y GET
  // /ventas/cotizaciones no lo lee. Si se quisiera neutralizar, sería en las dos.
  const conPaso = estadoTablaInicial({ vista: 'activas', paso: 'COT' });
  assert.equal(conPaso.paso, 'COT', 'el estado trae el paso');
  const paramsCOT = params(kv.consultaColumnaCOT(conPaso, borrador, { orden: 'atencion', limit: 25, offset: 0 }));
  const paramsSC = params(kv.consultaColumnaSC(conPaso, COLUMNAS_SC[0], { orden: 'atencion', limit: 25, offset: 0 }));
  assert.equal(paramsCOT.paso, 'COT', 'el paso viaja');
  assert.equal(paramsCOT.paso, paramsSC.paso, 'igual que en Solicitudes');
  // consultaColumnaSC no cambia (la de Solicitudes sigue con todas_sin_soporte).
  assert.equal(params(kv.consultaColumnaSC(estado, COLUMNAS_SC[0], { orden: 'atencion', limit: 25, offset: 0 })).vista, 'todas_sin_soporte');
}

console.log('--- B4 T9 TEST K: tarjetaCotizacion — la tarjeta del tablero de Cotizaciones ---');
{
  // KANBAN-ventas-listas punto 6, RP18, D4, D37 y el cruce C5: la de tarjetaHub con la lista de Cotizaciones como
  // return_to (la acción principal y su enlace vuelven a la lista), y la fila es una COT aunque no traiga `tipo`.
  const cot = {
    tipo: 'COT', id: 12, numero: 'COT-12', estado: 'CONFIRMADA', customer_name: 'Ana Ruiz', cotizador: 'Laura',
    total_cop: 250000.4, productos: CON_PRODUCTOS, pedidos_venta: [{ id: 30, numero: 'PVEN-30', estado: 'EN_PROCESO' }],
    dias_creado: 2, resolucion: 'ATRASADO', dias_sin_mov: 4, seguimiento_estado: 'AGOTADO',
  };
  const t = kv.tarjetaCotizacion(cot);
  const base = tarjetaHub(cot, { returnTo: RUTA_LISTA_COTIZACIONES });
  // r1 (I1): lo demás es la tarjeta del Hub; los chips llevan delante los de la COT (punto 6 de KANBAN-ventas-listas).
  assert.deepEqual({ ...t, chips: null }, { ...base, chips: null }, 'lo demás es la tarjeta del Hub');
  assert.equal(t.tipo, 'COT');
  assert.equal(t.subtitulo, 'Laura', 'el cotizador');
  assert.equal(t.monto, 250000);
  assert.deepEqual(t.estado, estadoDeTarjeta('COT', 'CONFIRMADA'));
  assert.deepEqual(t.accionPrincipal, { texto: 'Ver pedido', href: '/dashboard/ventas/venta/30?return_to=%2Fdashboard%2Fventas%2Fcotizacion', tono: 'emerald' });
  assert.equal(kv.tarjetaCotizacion({ ...cot, estado: 'BORRADOR', pedidos_venta: [] }).accionPrincipal.href,
    '/dashboard/ventas/cotizacion/12?return_to=%2Fdashboard%2Fventas%2Fcotizacion');
  const sinTipo = { ...cot };
  delete sinTipo.tipo;
  assert.deepEqual(kv.tarjetaCotizacion(sinTipo), t);
  assert.equal(kv.tarjetaCotizacion(cot, { returnTo: RUTA_HUB_VENTAS }).accionPrincipal.href,
    '/dashboard/ventas/venta/30?return_to=%2Fdashboard%2Fventas');

  // r1 (I1), los chips de la COT: primero el del pedido («Pedido PVEN-…» emerald o «Pedido … cancelado» rose, COT-LISTA);
  // r2 (p3), después el de los cambios del cliente, «Sin precio» (amber) si el total no es mayor que 0, y después el resto
  // de chipsDocumentoVentas (el atraso y el recordatorio); como mucho 3.
  // (1) CONFIRMADA con un PVEN vigente: «Pedido PVEN-30» delante del atraso y del recordatorio.
  assert.deepEqual(t.chips, [{ texto: 'Pedido PVEN-30', tono: 'emerald' }, { texto: 'Atrasado 4 días', tono: 'rose' },
    { texto: 'Sin respuesta al recordatorio', tono: 'amber' }]);
  assert.deepEqual(kv.tarjetaCotizacion({ ...cot, resolucion: 'ACCION_TOMADA', seguimiento_estado: null }).chips,
    [{ texto: 'Pedido PVEN-30', tono: 'emerald' }], 'solo el del pedido');
  // (2) BORRADOR con total 0 y un pedido cancelado (y el cliente no la volvió a confirmar): la marca rosa y «Sin precio».
  const caida = { tipo: 'COT', id: 13, numero: 'COT-13', estado: 'BORRADOR', total_cop: 0, productos: [],
    pedidos_venta: [{ id: 31, numero: 'PVEN-31', estado: 'CANCELADO' }], dias_creado: 1, resolucion: 'NO_RESUELTO' };
  assert.deepEqual(kv.tarjetaCotizacion(caida).chips,
    [{ texto: 'Pedido PVEN-31 cancelado', tono: 'rose' }, { texto: 'Sin precio', tono: 'amber' }]);
  assert.deepEqual(kv.tarjetaCotizacion({ ...caida, confirmacion_vigente: true, estado: 'CONFIRMADA' }).chips.map((c) => c.texto),
    ['Sin precio'], 'la re-confirmada no lleva la marca rosa (COT-LISTA, como la tabla)');
  // (3) Más chips que el tope. r2 (p3, corrige el orden de I1.2): el tope NUNCA saca el chip de los cambios del cliente
  // (B3-T18, una señal del cliente que antes siempre se veía): va segundo, después del pedido. Una COT re-cotizada
  // (BORRADOR con su PVEN vigente), atrasada, sin respuesta al recordatorio y con «Ya no la necesita»: el pedido, los
  // cambios del cliente y uno más (el atraso).
  const recotizada = { tipo: 'COT', id: 14, numero: 'COT-14', estado: 'BORRADOR', total_cop: 90000, productos: CON_PRODUCTOS,
    pedidos_venta: [{ id: 32, numero: 'PVEN-32', estado: 'EN_PROCESO' }], dias_creado: 3, resolucion: 'ATRASADO', dias_sin_mov: 5,
    seguimiento_estado: 'AGOTADO', cambios_cliente: { tipo: 'NO_LA_NECESITA', at: '2026-11-01T10:00:00', comentario: null } };
  assert.equal(chipsDocumentoVentas(recotizada, 'COT').length, 3, 'chipsDocumentoVentas solo ya llena el tope');
  assert.deepEqual(kv.tarjetaCotizacion(recotizada).chips, [{ texto: 'Pedido PVEN-32', tono: 'emerald' },
    { texto: 'Ya no la necesita', tono: 'rose' }, { texto: 'Atrasado 5 días', tono: 'rose' }]);
  // Con «Sin precio» también: el pedido, los cambios y «Sin precio»; el atraso y el recordatorio no caben.
  const llena = { ...caida, resolucion: 'ATRASADO', dias_sin_mov: 6, seguimiento_estado: 'AGOTADO',
    cambios_cliente: { tipo: 'CAMBIOS', at: '2026-11-01T10:00:00', comentario: 'Otro color' } };
  assert.deepEqual(kv.tarjetaCotizacion(llena).chips.map((c) => c.texto), ['Pedido PVEN-31 cancelado', 'Cambios pedidos', 'Sin precio']);
  // Sin el pedido, los cambios del cliente van primero.
  assert.deepEqual(kv.tarjetaCotizacion({ ...llena, pedidos_venta: [] }).chips.map((c) => c.texto), ['Cambios pedidos', 'Sin precio', 'Atrasado 6 días']);
  // La regla es la de la tabla (listas-ventas.js), no una copia: el pedido, los cambios del cliente (de
  // chipsDocumentoVentas), «Sin precio» (chipSinPrecio) y el resto de chipsDocumentoVentas, con el tope.
  const { marcaPedidoCotizacion, chipSinPrecio } = await import('../src/lib/listas-ventas.js');
  const esCambios = (c) => c.texto === 'Cambios pedidos' || c.texto === 'Ya no la necesita';
  // Las filas de GET /ventas/cotizaciones no traen `tipo`: los cambios del cliente salen igual (se leen como de una COT).
  const sinElTipo = (fila) => { const f = { ...fila }; delete f.tipo; return f; };
  for (const fila of [cot, caida, llena, recotizada, { ...caida, pedidos_venta: [] }, { ...recotizada, cambios_cliente: null },
    sinElTipo(llena), sinElTipo(recotizada)]) {
    const deLaFila = chipsDocumentoVentas(fila, 'COT');
    const esperado = [marcaPedidoCotizacion(fila), ...deLaFila.filter(esCambios), chipSinPrecio(fila), ...deLaFila.filter((c) => !esCambios(c))]
      .filter(Boolean).slice(0, 3);
    assert.deepEqual(kv.tarjetaCotizacion(fila).chips, esperado, fila.numero);
    // El de los cambios del cliente, si la fila lo trae, siempre está.
    if (deLaFila.some(esCambios)) assert.ok(kv.tarjetaCotizacion(fila).chips.some(esCambios), `${fila.numero}: los cambios del cliente se ven`);
  }
  // r2 (p2): «Sin precio» sale de un solo lugar, chipSinPrecio (listas-ventas.js); la lib del tablero no tiene su copia.
  const codigoKv = readFileSync(new URL('../src/lib/kanban-ventas.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const desdeTarjeta = codigoKv.indexOf('export function tarjetaCotizacion(');
  assert.ok(desdeTarjeta >= 0);
  assert.ok(codigoKv.slice(desdeTarjeta, codigoKv.indexOf('\n}\n', desdeTarjeta)).includes('chipSinPrecio(cot)'), 'la tarjeta usa chipSinPrecio');
  assert.ok(!codigoKv.includes('Sin precio'), 'kanban-ventas.js sin su propio «Sin precio»');
  // Sin la COT, tarjetaHub queda igual: las tarjetas del Hub no llevan estos chips.
  assert.deepEqual(tarjetaHub(caida).chips, chipsDocumentoVentas(caida, 'COT'));
  // El tono emerald existe en los chips del tablero (CLASE_CHIP de components/ui/Kanban.tsx).
  const kanban = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8');
  assert.match(kanban, /emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',/);
}

console.log('--- B4 T9 TEST L: el cableado del tablero de Cotizaciones (C15, RP16, D11, D39; D27) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/cotizacion/cotizacion-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const lista = codigo.slice(codigo.indexOf('export default function CotizacionClient('));
  // El tablero en modo servidor con el MISMO id y estado (RP26, D39): consultaColumnaCOT y el orden de cada columna.
  assert.match(lista, /pantalla: ID_COT,\s*modo: 'servidor',\s*columnas: COLUMNAS_COT,\s*activo: listo && enKanban,\s*porColumna: estado\.tamano,\s*dependencias: dependenciasTablero\(estado\),\s*ordenDe: \(c\) => \(c\.cerrada \? 'reciente' : 'atencion'\),/);
  assert.match(lista, /const consulta = consultaColumnaCOT\(estado, columna, \{ orden, limit, offset \}\);\s*if \(consulta === null\) return \{ filas: \[\], total: 0 \};\s*return normalizarRespuesta\(await apiFetch\(`\/ventas\/cotizaciones\?\$\{consulta\}`, \{ signal \}\)\);/);
  // D11 (RP16): la regla sin puedeEnviar (soltar en «Esperando al cliente» da «Ábrela para enviar.»); la lista no arma
  // otro ChannelModal ni otro POST de envío.
  assert.match(lista, /<TableroKanban\s+tablero=\{tablero\}\s+regla=\{reglaSoltarCotizacion\}\s+tarjetaDe=\{tarjetaDeCOT\}\s+onAbrir=\{abrirCotizacion\}\s+onCambio=\{cambiarDesdeTablero\}\s+onAccion=\{accionDesdeTablero\}/);
  assert.ok(!codigo.includes('puedeEnviar') && !lista.includes('<ChannelModal') && !lista.includes('enviar-confirmacion'), 'sin envío desde la lista');
  const conRegla = reglaSoltarCotizacion({ id: 4, estado: 'BORRADOR', ...CON_PRECIO }, 'borrador', 'esperando');
  assert.equal(conRegla.tipo, 'bloqueado');
  assert.equal(conRegla.motivo, 'Ábrela para enviar.');
  assert.equal(reglaSoltarCotizacion({ id: 4, estado: 'PENDIENTE_CONFIRMACION' }, 'esperando', 'borrador').motivo,
    'Ábrela para re-cotizar; te pedirá la razón.', 'C15(a)');
  assert.match(codigo, /const tarjetaDeCOT = \(cot: FilaCOT\) => tarjetaCotizacion\(cot\);/);
  // 'cambio': el PATCH del estado con el autor; el tablero recarga su origen y su destino, aquí las tarjetas y la franja.
  assert.match(lista, /async function cambiarDesdeTablero\(cot: FilaCOT, resultado: \{ estado: string \}\) \{\s*await apiFetch\(`\/ventas\/cotizaciones\/\$\{cot\.id\}`, \{\s*method: 'PATCH', body: JSON\.stringify\(\{ estado: resultado\.estado, updated_by: autorActual\(\) \}\),\s*\}\);\s*recargarListado\(\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*\}/);
  // 'rechazar': ModalMotivo → PATCH RECHAZADA y la nota «Motivo del rechazo: …» en la Actividad (N3); al terminar, del
  // tablero solo su origen y su destino (D39).
  assert.match(lista, /if \(resultado\.accion === 'rechazar'\) setRechazando\(\{ cot, columnas: \[origen, destino\] \}\);/);
  const rechazar = lista.slice(lista.indexOf('async function rechazarConMotivo('), lista.indexOf('\n  }\n', lista.indexOf('async function rechazarConMotivo(')));
  const patch = rechazar.indexOf("JSON.stringify({ estado: 'RECHAZADA', updated_by: autor })");
  const nota = rechazar.indexOf("JSON.stringify({ action: 'NOTE_ADDED', description: `Motivo del rechazo: ${motivo}`, user_name: autor })");
  assert.ok(patch > 0 && nota > patch, 'primero el PATCH, después la nota');
  assert.ok(rechazar.lastIndexOf('tablero.recargar([...columnas]);') > nota, 'y la recarga del origen y el destino');
  assert.match(rechazar, /\}\s*recargarListado\(\);\s*tablero\.recargar\(\[\.\.\.columnas\]\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*$/);
  // r1 (m1): si el PATCH falla, la regla única recargarTrasError (lib/avisos.js) decide si se recargan la lista, el origen
  // y el destino del tablero y la franja; el error sigue (throw) para que ModalMotivo lo muestre y conserve lo escrito.
  assert.match(rechazar, /try \{\s*await apiFetch\(`\/ventas\/cotizaciones\/\$\{cot\.id\}`, \{ method: 'PATCH', body: JSON\.stringify\(\{ estado: 'RECHAZADA', updated_by: autor \}\) \}\);\s*\} catch \(err\) \{\s*if \(recargarTrasError\(err\)\) \{\s*recargarListado\(\);\s*tablero\.recargar\(\[\.\.\.columnas\]\);\s*setRecargaFlujo\(\(n\) => n \+ 1\);\s*\}\s*throw err;\s*\}/);
  assert.match(fuente, /import \{ recargarTrasError, textoDeError \} from '@\/lib\/avisos';/);
  {
    // La regla: un 400, un 409 o la red cortada recargan; un 422 o un 500 no.
    const { recargarTrasError } = await import('../src/lib/avisos.js');
    assert.deepEqual([400, 409, undefined, 422, 500].map((status) => recargarTrasError({ status })), [true, true, true, false, false]);
  }
  assert.match(lista, /<ModalMotivo\s+titulo=\{`Rechazar \$\{rechazando\.cot\.numero\}`\}[\s\S]*?onConfirmar=\{rechazarConMotivo\}\s+onCerrar=\{\(\) => setRechazando\(null\)\}/);
  // Al pasar a Kanban se sale de la pantalla completa; la barra no la ofrece en Kanban.
  assert.match(lista, /useEffect\(\(\) => \{ if \(enKanban\) salir\(\); \}, \[enKanban, salir\]\);/);
  assert.match(lista, /pantallaCompleta=\{enKanban \? undefined : \{ completa, alternar \}\}/);
}

// ─── B4 T10: Pedidos de venta ───────────────────────────────────────────────────

console.log('--- B4 T10 TEST M: opcionesEstadosPedidos — el filtro de estados de cada pestaña de Pedidos ---');
{
  // TABLA-listas-ventas punto 7 (H15): casillas con los nombres de estados-pedido.js (RP4) y solo los estados de la
  // pestaña (las vistas de GET /ventas/pedidos): los operativos y los cerrados, como el grupo Pedido del Hub; los
  // heredados de fase4 y de la tienda no se ofrecen. Todos los ofrece todos.
  const etiquetas = (vista) => kv.opcionesEstadosPedidos(vista).map((o) => [o.valor, o.etiqueta]);
  assert.deepEqual(etiquetas('todos'), [['PENDIENTE_COMPRA', 'Pendiente de compra'], ['PENDIENTE_PAGO', 'Pendiente de pago'],
    ['EN_PROCESO', 'En proceso'], ['EN_TRANSITO', 'En tránsito'], ['LISTO_ENTREGA', 'Listo para entrega'], ['ENTREGADO', 'Entregado'],
    ['FACTURADO', 'Facturado'], ['CANCELADO', 'Cancelado'], ['DEVUELTO_TOTAL', 'Devuelto']]);
  assert.deepEqual(etiquetas('pend_compra'), [['PENDIENTE_COMPRA', 'Pendiente de compra'], ['PENDIENTE_PAGO', 'Pendiente de pago']]);
  assert.deepEqual(etiquetas('en_proceso'), [['EN_PROCESO', 'En proceso'], ['EN_TRANSITO', 'En tránsito']]);
  assert.deepEqual(etiquetas('listo_entrega'), [['LISTO_ENTREGA', 'Listo para entrega']]);
  assert.deepEqual(etiquetas('entregado'), [['ENTREGADO', 'Entregado']]);
  assert.deepEqual(etiquetas('facturado'), [['FACTURADO', 'Facturado']]);
  assert.deepEqual(etiquetas('cancelado'), [['CANCELADO', 'Cancelado'], ['DEVUELTO_TOTAL', 'Devuelto']]);
  for (const vista of ['en_curso', null, undefined, 'otra', 'constructor']) assert.deepEqual(kv.opcionesEstadosPedidos(vista), [], String(vista));
  // Cada pestaña ofrece solo estados de su columna (las vistas son las columnas del tablero) y Todos, la unión.
  for (const c of COLUMNAS_PEDIDO) {
    for (const o of kv.opcionesEstadosPedidos(c.clave)) assert.ok(c.estados.includes(o.valor), `${c.clave}: ${o.valor}`);
  }
  const deLasPestanas = COLUMNAS_PEDIDO.flatMap((c) => kv.opcionesEstadosPedidos(c.clave).map((o) => o.valor));
  assert.deepEqual(deLasPestanas, kv.opcionesEstadosPedidos('todos').map((o) => o.valor), 'Todos = la unión, en el orden de las columnas');
  for (const o of kv.opcionesEstadosPedidos('todos')) assert.equal(o.etiqueta, infoEstadoPedido(o.valor).label);
  // El tablero (vista=todos): la opción de cada columna es su estado principal con el TÍTULO de la columna (vale toda la
  // columna, heredados incluidos: estadosDeColumnaLista).
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_PEDIDO.map((o) => [o.valor, o.etiqueta]), [['PENDIENTE_COMPRA', 'Pendiente de compra'],
    ['EN_PROCESO', 'En proceso'], ['LISTO_ENTREGA', 'Listo para entrega'], ['ENTREGADO', 'Entregado'], ['FACTURADO', 'Facturado'],
    ['CANCELADO', 'Cancelado']]);
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_PEDIDO.map((o) => o.valor), COLUMNAS_PEDIDO.map((c) => c.estados[0]));
  assert.deepEqual(kv.OPCIONES_ESTADOS_TABLERO_PEDIDO.map((o) => o.etiqueta), COLUMNAS_PEDIDO.map((c) => c.titulo));
  // Inmutables y la misma referencia en cada llamada (BarraTabla la llama en cada render).
  assert.equal(kv.opcionesEstadosPedidos('todos'), kv.opcionesEstadosPedidos('todos'));
  assert.equal(kv.opcionesEstadosPedidos('x'), kv.opcionesEstadosPedidos(null));
  assert.ok(Object.isFrozen(kv.opcionesEstadosPedidos('todos')) && Object.isFrozen(kv.OPCIONES_ESTADOS_TABLERO_PEDIDO));
  assert.ok(Object.isFrozen(kv.opcionesEstadosPedidos('cancelado')[1]) && Object.isFrozen(kv.OPCIONES_ESTADOS_TABLERO_PEDIDO[0]));
  // Las de Solicitudes y Cotizaciones no cambian.
  assert.deepEqual(kv.opcionesEstadosCotizaciones('rechazadas').map((o) => o.valor), ['RECHAZADA']);
  assert.deepEqual(kv.opcionesEstadosSolicitudes('canceladas').map((o) => o.valor), ['CANCELADA']);
  // r1 (m5): los estados heredados vuelven al filtro (B1: «y, al final, cualquier otro que traigan los pedidos»): los de
  // resumen.por_estado de la MISMA respuesta de /ventas/pedidos que no están en la lista base y cuyo grupo (grupoPedido)
  // es el de la pestaña; en Todos, los de cualquier grupo. Con la etiqueta de infoEstadoPedido, en el orden de
  // ESTADOS_PEDIDO, después de los de siempre. Uno sin grupo (desconocido) no entra: el servidor rechaza filtrar por él
  // (_estados_de_lista: 422 «El estado «x» no existe en VEN.»). Un conteo que no es un número positivo, tampoco.
  const porEstado = { EN_PROCESO: 3, DISPONIBLE: 4, PARCIALMENTE_DISPONIBLE: 1, PAGADO: 2, ESTADO_RARO: 1, BORRADOR: 0 };
  const con = (vista, pe = porEstado) => kv.opcionesEstadosPedidos(vista, pe).map((o) => [o.valor, o.etiqueta]);
  assert.deepEqual(con('en_proceso'), [['EN_PROCESO', 'En proceso'], ['EN_TRANSITO', 'En tránsito'], ['PAGADO', 'Pagado'],
    ['PARCIALMENTE_DISPONIBLE', 'Parcialmente disponible']]);
  assert.deepEqual(con('listo_entrega'), [['LISTO_ENTREGA', 'Listo para entrega'], ['DISPONIBLE', 'Disponible']]);
  assert.deepEqual(con('todos').slice(0, 9), etiquetas('todos'), 'primero los de siempre');
  assert.deepEqual(con('todos').slice(9), [['PAGADO', 'Pagado'], ['PARCIALMENTE_DISPONIBLE', 'Parcialmente disponible'], ['DISPONIBLE', 'Disponible']]);
  assert.deepEqual(con('cancelado', { DEVUELTO_TOTAL: 2, CANCELADO: 1 }), etiquetas('cancelado'), 'los de la base no se repiten');
  assert.deepEqual(con('pend_compra', { BORRADOR: 1, CONFIRMADO: 2, PAGADO: 5 }).slice(2), [['BORRADOR', 'Borrador'], ['CONFIRMADO', 'Confirmado']],
    'solo los de su grupo');
  // Sin heredados de la pestaña, la misma referencia de siempre (BarraTabla la llama en cada render).
  assert.equal(kv.opcionesEstadosPedidos('facturado', porEstado), kv.opcionesEstadosPedidos('facturado'));
  assert.equal(kv.opcionesEstadosPedidos('facturado', { FACTURADO: 4 }), kv.opcionesEstadosPedidos('facturado'));
  for (const nada of [null, undefined, [], 'PAGADO', 5, { PAGADO: 'dos' }, { PAGADO: -1 }, { PAGADO: 0 }]) {
    assert.equal(kv.opcionesEstadosPedidos('en_proceso', nada), kv.opcionesEstadosPedidos('en_proceso'), JSON.stringify(nada));
  }
  assert.deepEqual(kv.opcionesEstadosPedidos('otra', porEstado), [], 'otra vista: nada');
  assert.ok(!kv.opcionesEstadosPedidos('todos', porEstado).some((o) => o.valor === 'ESTADO_RARO'), 'el desconocido no');
  assert.ok(Object.isFrozen(kv.opcionesEstadosPedidos('en_proceso', porEstado)) && Object.isFrozen(kv.opcionesEstadosPedidos('en_proceso', porEstado)[2]));
  // Los 18 estados que conoce el servidor (ETIQUETAS_ESTADO['VEN']) son los de ESTADOS_PEDIDO y todos tienen grupo.
  assert.equal(Object.keys(ESTADOS_PEDIDO).length, 18);
  for (const e of Object.keys(ESTADOS_PEDIDO)) assert.ok(grupoPedido(e), e);

  // r2 (p1): el servidor calcula por_estado DESPUÉS del filtro de estados (filtrar_por_estados corre antes de
  // _resumen_pedidos): con «Pagado» marcado, la respuesta trae solo {PAGADO}. Leído directo, los demás heredados salían
  // del panel y nunca se podían combinar dos. porEstadoVisto conserva la unión de lo visto mientras no cambien la vista,
  // la búsqueda ni el semáforo; una respuesta sin filtro de estados es la completa y reemplaza lo anterior.
  const enProceso = estadoTablaInicial({ vista: 'en_proceso' });
  const completo = { EN_PROCESO: 3, EN_TRANSITO: 1, PAGADO: 2, PARCIALMENTE_DISPONIBLE: 1 };
  const valores = (pe) => kv.opcionesEstadosPedidos('en_proceso', pe).map((o) => o.valor);
  const visto0 = kv.porEstadoVisto(null, enProceso, completo);
  assert.deepEqual(valores(visto0.porEstado), ['EN_PROCESO', 'EN_TRANSITO', 'PAGADO', 'PARCIALMENTE_DISPONIBLE']);
  const conPagado = estadoTablaInicial({ vista: 'en_proceso', estados: ['PAGADO'] });
  const filtrado = { PAGADO: 2 }; // lo que manda el servidor con estados=PAGADO
  assert.deepEqual(valores(filtrado), ['EN_PROCESO', 'EN_TRANSITO', 'PAGADO'], 'leído directo, «Parcialmente disponible» se iba');
  const visto1 = kv.porEstadoVisto(visto0, conPagado, filtrado);
  assert.deepEqual(valores(visto1.porEstado), ['EN_PROCESO', 'EN_TRANSITO', 'PAGADO', 'PARCIALMENTE_DISPONIBLE'], 'los dos heredados siguen');
  assert.equal(visto1, visto0, 'nada nuevo: la misma referencia (la pantalla no vuelve a pintar)');
  // Se pueden combinar: con los dos marcados siguen los dos.
  const conDos = estadoTablaInicial({ vista: 'en_proceso', estados: ['PAGADO', 'PARCIALMENTE_DISPONIBLE'] });
  assert.deepEqual(valores(kv.porEstadoVisto(visto1, conDos, { PAGADO: 2, PARCIALMENTE_DISPONIBLE: 1 }).porEstado), valores(completo));
  // Llegando con un filtro de la sesión (sin haber visto la completa), cada respuesta filtrada suma lo suyo.
  const desdeFiltro = kv.porEstadoVisto(null, conPagado, { PAGADO: 2 });
  const sumado = kv.porEstadoVisto(desdeFiltro, conDos, { PAGADO: 2, PARCIALMENTE_DISPONIBLE: 1 });
  assert.deepEqual(Object.keys(sumado.porEstado).sort(), ['PAGADO', 'PARCIALMENTE_DISPONIBLE']);
  assert.notEqual(sumado, desdeFiltro, 'con algo nuevo, otro objeto');
  // Una respuesta sin filtro de estados es la completa: reemplaza (lo que ya no está, se va).
  const sinPagado = kv.porEstadoVisto(visto1, enProceso, { EN_PROCESO: 4, EN_TRANSITO: 1, PARCIALMENTE_DISPONIBLE: 1 });
  assert.deepEqual(valores(sinPagado.porEstado), ['EN_PROCESO', 'EN_TRANSITO', 'PARCIALMENTE_DISPONIBLE']);
  assert.equal(kv.porEstadoVisto(visto0, enProceso, { ...completo }), visto0, 'la completa con lo mismo: la misma referencia');
  // Otra vista, otra búsqueda u otro semáforo: empieza de nuevo, aunque la respuesta venga filtrada.
  for (const otro of [{ vista: 'todos', estados: ['PAGADO'] }, { vista: 'en_proceso', q: 'ana', estados: ['PAGADO'] },
    { vista: 'en_proceso', semaforo: 'atrasados', estados: ['PAGADO'] }]) {
    assert.deepEqual(Object.keys(kv.porEstadoVisto(visto1, estadoTablaInicial(otro), { PAGADO: 2 }).porEstado), ['PAGADO'], JSON.stringify(otro));
  }
  // La página, el orden y el filtro de estados no cambian lo visto.
  assert.equal(kv.porEstadoVisto(visto0, estadoTablaInicial({ vista: 'en_proceso', pagina: 3, orden: 'reciente', estados: ['EN_PROCESO'] }), { EN_PROCESO: 3 }), visto0);
  // Sin respuesta vigente (cargando, recargando o con error): lo de la misma clave; de otra clave, nada todavía.
  assert.equal(kv.porEstadoVisto(visto1, conPagado, null), visto1);
  assert.equal(kv.porEstadoVisto(null, enProceso, null), null);
  assert.equal(kv.porEstadoVisto(visto1, estadoTablaInicial({ vista: 'todos' }), null).porEstado, null);
  // Los conteos que no son positivos no cuentan; inmutable.
  assert.deepEqual(Object.keys(kv.porEstadoVisto(null, enProceso, { EN_PROCESO: 3, PAGADO: 0, DISPONIBLE: 'x' }).porEstado), ['EN_PROCESO']);
  assert.ok(Object.isFrozen(visto0) && Object.isFrozen(visto0.porEstado));
}

console.log('--- B4 T10 TEST N: consultaColumnaPedido — la consulta de cada columna del tablero de Pedidos ---');
{
  const estado = estadoTablaInicial({ vista: 'cancelado', q: ' cuna ', semaforo: 'atrasados', estados: [], orden: 'cliente', pagina: 3, tamano: 50 });
  const col = (clave) => COLUMNAS_PEDIDO.find((c) => c.clave === clave);
  const params = (q) => Object.fromEntries(new URLSearchParams(q));
  // R5 y RP8 (el patrón de consultaColumnaSC y consultaColumnaCOT): vista=todos (no la pestaña), los estados de la columna
  // en CSV como `estados` (nunca `estado=` ni `search=`), la búsqueda (q) y el semáforo del estado, y el orden, el límite y
  // el desplazamiento de la columna (no la página ni el orden de la tabla).
  assert.equal(kv.VISTA_TABLERO_PEDIDO, 'todos');
  const q = kv.consultaColumnaPedido(estado, col('en_proceso'), { orden: 'atencion', limit: 50, offset: 0 });
  assert.deepEqual(params(q), { vista: 'todos', semaforo: 'atrasados', q: 'cuna', estados: 'EN_PROCESO,EN_TRANSITO,PAGADO,PARCIALMENTE_DISPONIBLE', orden: 'atencion', limit: '50', offset: '0' });
  assert.equal(q, queryListado(estado, { vista: 'todos', estados: [...col('en_proceso').estados], orden: 'atencion', limit: 50, offset: 0 }));
  assert.ok(!/(^|&)estado=|(^|&)search=/.test(q), 'RP8: ni estado= ni search=');
  // Pendiente de compra pide sus 5 estados (PENDIENTE_PAGO y los heredados); la plegada (Cancelado), limit=0.
  assert.equal(params(kv.consultaColumnaPedido(estado, col('pend_compra'), { orden: 'atencion', limit: 25, offset: 25 })).estados,
    'PENDIENTE_COMPRA,PENDIENTE_PAGO,BORRADOR,PENDIENTE_ANTICIPO,CONFIRMADO');
  assert.equal(params(kv.consultaColumnaPedido(estado, col('cancelado'), { orden: 'reciente', limit: 0, offset: 0 })).limit, '0');
  assert.equal(params(kv.consultaColumnaPedido(estado, col('cancelado'), { orden: 'reciente', limit: 0, offset: 0 })).estados, 'CANCELADO,DEVUELTO_TOTAL');
  for (const c of COLUMNAS_PEDIDO) assert.ok(c.estados.length <= MAXIMO_ESTADOS, `${c.clave}: caben en estados=`);
  // Con el filtro de la pantalla: el cruce (la opción de la columna vale toda la columna); sin nada en común, null.
  const filtrado = { ...estado, estados: ['EN_PROCESO', 'CANCELADO'] };
  assert.equal(params(kv.consultaColumnaPedido(filtrado, col('en_proceso'), { orden: 'atencion', limit: 25, offset: 0 })).estados,
    'EN_PROCESO,EN_TRANSITO,PAGADO,PARCIALMENTE_DISPONIBLE');
  assert.equal(params(kv.consultaColumnaPedido({ ...estado, estados: ['EN_TRANSITO'] }, col('en_proceso'), { orden: 'atencion', limit: 25, offset: 0 })).estados, 'EN_TRANSITO');
  assert.equal(kv.consultaColumnaPedido(filtrado, col('listo_entrega'), { orden: 'atencion', limit: 25, offset: 0 }), null);
  // Sin semáforo ni búsqueda no van (queryListado omite lo vacío).
  const limpio = params(kv.consultaColumnaPedido(estadoTablaInicial({ vista: 'todos' }), col('entregado'), { orden: 'atencion', limit: 25, offset: 0 }));
  assert.deepEqual([limpio.vista, limpio.estados], ['todos', 'ENTREGADO']);
  assert.ok(!('semaforo' in limpio) && !('q' in limpio));
  // Las de Solicitudes y Cotizaciones no cambian.
  assert.equal(params(kv.consultaColumnaCOT(estado, COLUMNAS_COT[0], { orden: 'atencion', limit: 25, offset: 0 })).vista, 'todas');
  assert.equal(params(kv.consultaColumnaSC(estado, COLUMNAS_SC[0], { orden: 'atencion', limit: 25, offset: 0 })).vista, 'todas_sin_soporte');
}

console.log('--- B4 T10 TEST O: tarjetaPedido — la tarjeta del tablero de Pedidos (y el chip del saldo de la tabla) ---');
{
  // KANBAN-ventas-listas punto 5 (D37, cruce C5): la de tarjetaHub (número, cliente, el total, el estado de
  // estados-pedido.js, la antigüedad de dias_creado, el atraso y accionSiguienteDocumento) con el return_to de la lista
  // de Pedidos; el subtítulo «SC-… · COT-…»; y los chips: «Saldo $X» (chipSaldoPedido, el mismo dato de la columna Saldo:
  // saldoVisiblePedido) y después el atraso y el recordatorio de chipsDocumentoVentas. La fila es un pedido aunque no
  // traiga `tipo` (las de GET /ventas/pedidos traen 'VEN').
  const { chipSaldoPedido, saldoVisiblePedido } = await import('../src/lib/listas-ventas.js');
  const pven = {
    tipo: 'VEN', id: 40, numero: 'PVEN-40', estado: 'LISTO_ENTREGA', customer_name: 'Ana Ruiz', advisor_name: 'Laura',
    sc_numero: 'SC-3', cot_numero: 'COT-21', total_cop: 1000000.4, saldo_cop: 400000, dias_creado: 3,
    resolucion: 'ATRASADO', dias_sin_mov: 4, seguimiento_estado: 'AGOTADO',
  };
  const t = kv.tarjetaPedido(pven);
  const base = tarjetaHub(pven, { returnTo: kv.RUTA_LISTA_PEDIDOS });
  assert.equal(kv.RUTA_LISTA_PEDIDOS, '/dashboard/ventas/venta');
  assert.deepEqual({ ...t, subtitulo: null, chips: null }, { ...base, subtitulo: null, chips: null }, 'lo demás es la tarjeta del Hub');
  assert.equal(t.tipo, 'PVEN');
  assert.equal(t.titulo, 'Ana Ruiz');
  assert.equal(t.subtitulo, 'SC-3 · COT-21', 'el origen');
  assert.equal(t.monto, 1000000);
  assert.deepEqual(t.estado, estadoDeTarjeta('PVEN', 'LISTO_ENTREGA'));
  assert.equal(t.estado.label, infoEstadoPedido('LISTO_ENTREGA').label);
  assert.equal(t.tiempo, 'hace 3 días');
  assert.equal(t.atrasada, true);
  assert.deepEqual(t.accionPrincipal, { texto: 'Cobrar saldo', href: '/dashboard/ventas/venta/40?return_to=%2Fdashboard%2Fventas%2Fventa', tono: 'amber' });
  assert.deepEqual(t.chips, [{ texto: 'Saldo $400.000', tono: 'amber' }, { texto: 'Atrasado 4 días', tono: 'rose' },
    { texto: 'Sin respuesta al recordatorio', tono: 'amber' }]);
  const sinTipo = { ...pven };
  delete sinTipo.tipo;
  assert.deepEqual(kv.tarjetaPedido(sinTipo), t, 'sin tipo, lo mismo');
  assert.equal(kv.tarjetaPedido(pven, { returnTo: RUTA_HUB_VENTAS }).accionPrincipal.href, '/dashboard/ventas/venta/40?return_to=%2Fdashboard%2Fventas');
  // El subtítulo: solo lo que hay; sin SC ni COT, el de la tarjeta del Hub (el asesor).
  assert.equal(kv.tarjetaPedido({ ...pven, sc_numero: null }).subtitulo, 'COT-21');
  assert.equal(kv.tarjetaPedido({ ...pven, sc_numero: '  ', cot_numero: '' }).subtitulo, 'Laura');
  assert.equal(kv.tarjetaPedido({ ...pven, sc_numero: null, cot_numero: null, advisor_name: null }).subtitulo, 'Sin asignar');
  // El saldo: solo si el pedido suma dinero (no Cancelado ni Devuelto, H47) y queda algo por cobrar, en pesos enteros.
  assert.deepEqual(kv.tarjetaPedido({ ...pven, resolucion: 'NO_RESUELTO', seguimiento_estado: null }).chips, [{ texto: 'Saldo $400.000', tono: 'amber' }]);
  for (const sinSaldo of [{ saldo_cop: 0 }, { saldo_cop: -5000 }, { saldo_cop: 0.4 }, { saldo_cop: null }, { saldo_cop: 'x' },
    { estado: 'CANCELADO' }, { estado: 'DEVUELTO_TOTAL' }]) {
    const fila = { ...pven, resolucion: 'NO_RESUELTO', seguimiento_estado: null, ...sinSaldo };
    assert.deepEqual(kv.tarjetaPedido(fila).chips, [], JSON.stringify(sinSaldo));
    assert.equal(chipSaldoPedido(fila), null, JSON.stringify(sinSaldo));
  }
  assert.deepEqual(chipSaldoPedido({ estado: 'ENTREGADO', saldo_cop: '1062523.4' }), { texto: 'Saldo $1.062.523', tono: 'amber' });
  // La columna Saldo: el mismo dato (null = '—' en un pedido que no suma dinero; el número, aunque sea 0 o a favor).
  assert.equal(saldoVisiblePedido({ estado: 'EN_PROCESO', saldo_cop: 400000.4 }), 400000);
  assert.equal(saldoVisiblePedido({ estado: 'EN_PROCESO', saldo_cop: 0 }), 0);
  assert.equal(saldoVisiblePedido({ estado: 'EN_PROCESO', saldo_cop: -2000 }), -2000);
  assert.equal(saldoVisiblePedido({ estado: 'CANCELADO', saldo_cop: 400000 }), null);
  assert.equal(saldoVisiblePedido({ estado: 'DEVUELTO_TOTAL', saldo_cop: 400000 }), null);
  assert.equal(saldoVisiblePedido({ estado: 'EN_PROCESO', saldo_cop: null }), 0, 'sin saldo, 0 (como _ven_dict)');
  for (const nada of [null, undefined, 'x']) assert.equal(saldoVisiblePedido(nada), null, String(nada));
  for (const fila of [pven, { ...pven, saldo_cop: 0 }, { ...pven, estado: 'CANCELADO' }, { ...pven, saldo_cop: -1 }]) {
    const chip = chipSaldoPedido(fila);
    const saldo = saldoVisiblePedido(fila);
    assert.equal(chip !== null, saldo !== null && saldo > 0, `${fila.estado} ${fila.saldo_cop}: el chip sale con la regla de la columna`);
  }
  // Con el tope de 3 (MAX_CHIPS), el del saldo va primero; un pedido no tiene chip de cambios del cliente.
  const conCambios = { ...pven, cambios_cliente: { tipo: 'CAMBIOS', at: '2026-11-01T10:00:00', comentario: 'x' } };
  assert.deepEqual(kv.tarjetaPedido(conCambios).chips, t.chips);
  // tarjetaHub, tarjetaSolicitud y tarjetaCotizacion no cambian: el Hub no lleva el chip del saldo.
  assert.deepEqual(tarjetaHub(pven).chips, chipsDocumentoVentas(pven, 'VEN'));
  // Cada tipo de pedido da su tarjeta sin lanzar (las 18 claves de ESTADOS_PEDIDO).
  for (const e of Object.keys(ESTADOS_PEDIDO)) assert.equal(kv.tarjetaPedido({ ...pven, estado: e }).estado.label, infoEstadoPedido(e).label, e);
}

console.log('--- B4 T10 TEST P: las acciones del tablero de Pedidos — mover dentro de En proceso, suma por columna, facturar y cancelar ---');
{
  // accionesTarjeta (KANBAN-ventas-listas punto 5): «Marcar En tránsito» y «Marcar En proceso» cambian de estado sin salir
  // de la columna En proceso, solo si transicionesPedido lo permite.
  const acciones = (estado) => kv.accionesTarjetaPedido({ id: 5, estado }).map((a) => [a.etiqueta, a.estado]);
  assert.deepEqual(acciones('EN_PROCESO'), [['Marcar En tránsito', 'EN_TRANSITO']]);
  assert.deepEqual(acciones('EN_TRANSITO'), [['Marcar En proceso', 'EN_PROCESO']]);
  assert.deepEqual(acciones('PAGADO'), [['Marcar En tránsito', 'EN_TRANSITO'], ['Marcar En proceso', 'EN_PROCESO']], 'los heredados de la columna');
  const enProceso = COLUMNAS_PEDIDO.find((c) => c.clave === 'en_proceso');
  for (const e of Object.keys(ESTADOS_PEDIDO)) {
    for (const a of kv.accionesTarjetaPedido({ id: 5, estado: e })) {
      assert.ok(enProceso.estados.includes(e), `${e}: solo en la columna En proceso`);
      assert.ok(enProceso.estados.includes(a.estado), `${e} → ${a.estado}: no sale de la columna`);
      assert.ok(transicionesPedido(e).includes(a.estado), `${e} → ${a.estado}: lo acepta el servidor`);
      assert.notEqual(a.estado, e);
    }
    if (!enProceso.estados.includes(e)) assert.deepEqual(kv.accionesTarjetaPedido({ estado: e }), [], e);
  }
  for (const nada of [null, undefined, {}, { estado: 'ALGO' }]) assert.deepEqual(kv.accionesTarjetaPedido(nada), [], JSON.stringify(nada));
  // Una copia nueva cada vez (la pantalla le pone su onClick).
  assert.notEqual(kv.accionesTarjetaPedido({ estado: 'EN_PROCESO' })[0], kv.accionesTarjetaPedido({ estado: 'EN_PROCESO' })[0]);

  // resumenColumna (C9): la suma de H47 de la columna (resumen.monto_cop de su consulta) debajo del título, salvo en
  // Cancelado (no suma dinero).
  assert.equal(kv.resumenColumnaPedido('en_proceso', { monto_cop: 4927538.4, saldo_cop: 1, anticipo_cop: 2, por_estado: {} }), '$4.927.538');
  assert.equal(kv.resumenColumnaPedido('facturado', { monto_cop: 0 }), '$0');
  assert.equal(kv.resumenColumnaPedido('cancelado', { monto_cop: 500000 }), null);
  for (const nada of [null, undefined, {}, { monto_cop: '500' }, { monto_cop: NaN }, [], 'x']) {
    assert.equal(kv.resumenColumnaPedido('en_proceso', nada), null, JSON.stringify(nada));
  }

  // facturar (N2): la confirmación de confirmar() de useAvisos, la del panel rápido del Hub.
  assert.deepEqual(kv.confirmacionFacturarPedido({ numero: 'PVEN-40' }), {
    titulo: 'Marcar PVEN-40 como Facturado', mensaje: 'Después de esto el estado del pedido ya no se puede cambiar.',
    textoConfirmar: 'Marcar como Facturado',
  });
  assert.equal(kv.confirmacionFacturarPedido({ numero: '  ' }).titulo, 'Marcar como Facturado');
  assert.equal(kv.confirmacionFacturarPedido(null).titulo, 'Marcar como Facturado');
  const hub = readFileSync(new URL('../src/app/dashboard/ventas/page.tsx', import.meta.url), 'utf8');
  assert.ok(hub.includes(`mensaje: '${kv.confirmacionFacturarPedido({}).mensaje}'`), 'el mismo texto del panel rápido del Hub');

  // cancelar (H45, H46): los efectos del ModalMotivo. Las frases del modal del detalle salen de aquí (una sola fuente):
  // la cotización que vuelve a Borrador, el saldo a favor y la orden de pago. El detalle trae `pagos` y `pxps`; la fila
  // de la lista no, así que ahí el saldo a favor sale de lo pagado (total − saldo) y la orden de pago se dice con «si».
  const BORRADOR = 'La cotización COT-21 volverá a Borrador para que puedas ajustarla, reenviarla al cliente y crear otro pedido.';
  const SALDO = 'El dinero ya pagado queda como saldo a favor de la cotización y pasa al pedido nuevo si la vuelves a convertir.';
  // r1 (m2): en la fila, total − saldo cuenta también los AJUSTE_AUTORIZADO y los CONVERSION_COTIZACION viejos (el detalle
  // y el servidor no): la frase va en condicional, como la de la PXP, y así nunca afirma un saldo a favor que no hay.
  const SALDO_FILA = 'Si el pedido tiene pagos verificados, ese dinero queda como saldo a favor de la cotización y pasa al pedido nuevo.';
  assert.equal(kv.EFECTO_CANCELAR_PEDIDO, 'El pedido queda Cancelado y no se puede reabrir.');
  const fila = { id: 40, numero: 'PVEN-40', estado: 'EN_PROCESO', cot_numero: 'COT-21', total_cop: 1000000, saldo_cop: 400000, pxp_id: 7, pxp_numero: 'PXP-7' };
  assert.deepEqual(kv.efectosCancelarPedido(fila), [kv.EFECTO_CANCELAR_PEDIDO, BORRADOR, SALDO_FILA, 'Si la orden de pago PXP-7 sigue pendiente, también se cancela.']);
  assert.equal(kv.avisoSaldoAFavorAlCancelarPedido(fila), SALDO_FILA, 'la fila: en condicional');
  assert.notEqual(kv.avisoSaldoAFavorAlCancelarPedido(fila), SALDO, 'la fila no afirma lo del detalle');
  assert.deepEqual(kv.efectosCancelarPedido({ ...fila, cot_numero: null, pxp_id: null, pxp_numero: null }), [kv.EFECTO_CANCELAR_PEDIDO]);
  assert.deepEqual(kv.efectosCancelarPedido({ ...fila, saldo_cop: 1000000, pxp_numero: null }), [kv.EFECTO_CANCELAR_PEDIDO, BORRADOR], 'nada pagado');
  assert.equal(kv.avisoSaldoAFavorAlCancelarPedido({ ...fila, cot_numero: '' }), null, 'sin cotización no hay a dónde pasarlo');
  // El detalle (con pagos y pxps): lo de hoy, con saldoAFavorAlCancelar y la PXP vigente (pxpsDelPedido).
  const detalle = {
    ...fila, pagos: [{ id: 1, estado: 'CONFIRMADO', tipo: 'ANTICIPO', monto: 600000, metodo_pago: 'TRANSFERENCIA' }],
    pxps: [{ id: 6, numero: 'PXP-6', estado: 'CANCELADA' }, { id: 7, numero: 'PXP-7', estado: 'PENDIENTE', monto_pendiente: 400000 }],
  };
  assert.equal(kv.avisoCotizacionAlCancelarPedido(detalle), BORRADOR);
  assert.equal(kv.avisoSaldoAFavorAlCancelarPedido(detalle), SALDO);
  assert.equal(kv.avisoPxpAlCancelarPedido(detalle), 'También se cancelará la orden de pago PXP-7 (pendiente $400.000).');
  assert.equal(kv.avisoPxpAlCancelarPedido({ ...detalle, pxps: [{ id: 7, numero: 'PXP-7', estado: 'PAGADA', monto_pendiente: 0 }] }),
    'La orden de pago PXP-7 está pagada: no se cancela y queda un aviso para revisar la devolución o el saldo a favor del cliente.');
  assert.equal(kv.avisoPxpAlCancelarPedido({ ...detalle, pxps: [{ id: 6, numero: 'PXP-6', estado: 'CANCELADA' }] }), null, 'sin PXP vigente');
  assert.equal(kv.avisoPxpAlCancelarPedido({ ...detalle, pxps: [] }), null, 'el detalle sin PXP (aunque la fila traiga pxp_numero)');
  assert.equal(kv.avisoSaldoAFavorAlCancelarPedido({ ...detalle, pagos: [] }), null, 'el detalle: sin pagos verificados no hay saldo a favor');
  assert.equal(kv.avisoSaldoAFavorAlCancelarPedido({ ...detalle, pagos: [{ id: 1, estado: 'PENDIENTE', tipo: 'ANTICIPO', monto: 9 }] }), null);
  assert.equal(kv.avisoCotizacionAlCancelarPedido({ cot_numero: '  ' }), null);
  for (const nada of [null, undefined, {}]) {
    assert.deepEqual(kv.efectosCancelarPedido(nada), [kv.EFECTO_CANCELAR_PEDIDO], JSON.stringify(nada));
  }
  // El detalle usa las mismas funciones (no escribe las frases a mano): ver test_listas_ventas, el cableado del detalle.
}

console.log('--- B4 T10 TEST Q: el cableado del tablero de Pedidos (C9, C15, R11, RP8, RP26, D39; D27) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ventas/venta/venta-client.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const lista = codigo.slice(codigo.indexOf('export default function VentaClient('));
  // El tablero en modo servidor con el MISMO id y estado (RP26, D39): consultaColumnaPedido y el orden de cada columna.
  assert.match(lista, /pantalla: ID_PEDIDOS,\s*modo: 'servidor',\s*columnas: COLUMNAS_PEDIDO,\s*activo: listo && enKanban,\s*porColumna: estado\.tamano,\s*dependencias: dependenciasTablero\(estado\),\s*ordenDe: \(c\) => \(c\.cerrada \? 'reciente' : 'atencion'\),/);
  assert.match(lista, /const consulta = consultaColumnaPedido\(estado, columna, \{ orden, limit, offset \}\);\s*if \(consulta === null\) return \{ filas: \[\], total: 0 \};\s*return normalizarRespuesta\(await apiFetch\(`\/ventas\/pedidos\?\$\{consulta\}`, \{ signal \}\)\);/);
  // RP8: ni estado= en CSV ni search= en ninguna consulta de la lista.
  assert.ok(!/[?&]estado=|search=/.test(codigo), 'RP8');
  assert.match(lista, /<TableroKanban\s+tablero=\{tablero\}\s+regla=\{reglaSoltarPedido\}\s+tarjetaDe=\{tarjetaDePedido\}\s+onAbrir=\{abrirPedido\}\s+onCambio=\{cambiarDesdeTablero\}\s+onAccion=\{accionDesdeTablero\}\s+accionesTarjeta=\{accionesTarjeta\}\s+resumenColumna=\{resumenColumna\}/);
  assert.match(codigo, /const tarjetaDePedido = \(p: FilaPedido\) => tarjetaPedido\(p\);/);
  // C9: la suma de cada columna es el resumen de H47 de su consulta (resumenColumnaPedido; Cancelado no).
  assert.match(lista, /\(clave: string, d: DatosColumnaKanban<FilaPedido>\) => resumenColumnaPedido\(clave, d\.resumen\)/);
  // 'cambio': el PATCH del estado con el autor; el tablero recarga su origen y su destino, aquí lo demás. r1 (m4): si el
  // PATCH falla, también se recarga lo demás con la regla de recargarTrasError (un 409: el pedido cambió en otro lado) y
  // el error sigue (el tablero deshace y recarga su origen y su destino, D39: aquí no se llama a tablero.recargar).
  assert.match(lista, /async function cambiarDesdeTablero\(p: FilaPedido, resultado: \{ estado: string \}\) \{\s*try \{\s*await apiFetch\(`\/ventas\/pedidos\/\$\{p\.id\}`, \{\s*method: 'PATCH', body: JSON\.stringify\(\{ estado: resultado\.estado, updated_by: autorActual\(\) \}\),\s*\}\);\s*\} catch \(err\) \{\s*if \(recargarTrasError\(err\)\) recargarTrasCambio\(\);\s*throw err;\s*\}\s*recargarTrasCambio\(\);\s*\}/);
  {
    const cambiar = lista.slice(lista.indexOf('async function cambiarDesdeTablero('), lista.indexOf('\n  }\n', lista.indexOf('async function cambiarDesdeTablero(')));
    assert.ok(cambiar.length > 100 && !cambiar.includes('tablero.recargar'), 'el arrastre no recarga el tablero a mano (lo hace deshacer)');
  }
  // 'facturar' (N2): confirmar() con confirmacionFacturarPedido → PATCH FACTURADO; 'cancelar': ModalMotivo.
  assert.match(lista, /if \(resultado\.accion === 'cancelar'\) setCancelando\(\{ pedido: p, columnas: \[origen, destino\] \}\);\s*else if \(resultado\.accion === 'facturar'\) void facturarDesdeTablero\(p, \[origen, destino\]\);/);
  const facturar = lista.slice(lista.indexOf('async function facturarDesdeTablero('), lista.indexOf('\n  }\n', lista.indexOf('async function facturarDesdeTablero(')));
  assert.match(facturar, /if \(!\(await confirmar\(confirmacionFacturarPedido\(p\)\)\)\) return;/);
  assert.ok(facturar.indexOf('confirmar(') < facturar.indexOf("estado: 'FACTURADO'"), 'primero confirma');
  assert.match(facturar, /if \(!recargarTrasError\(err\)\) return;\s*\}\s*tablero\.recargar\(\[\.\.\.columnas\]\);\s*recargarTrasCambio\(\);\s*$/);
  // 'cancelar' (N2, H45, H46): PATCH CANCELADO con el motivo; si falla, recargarTrasError y el error sigue (ModalMotivo lo
  // muestra y conserva lo escrito); al terminar, solo el origen y el destino del tablero (D39).
  const cancelar = lista.slice(lista.indexOf('async function cancelarConMotivo('), lista.indexOf('\n  }\n', lista.indexOf('async function cancelarConMotivo(')));
  assert.match(cancelar, /JSON\.stringify\(\{ estado: 'CANCELADO', cancellation_reason: motivo, cancellation_authorized_by: autor, updated_by: autor \}\)/);
  assert.match(cancelar, /\} catch \(err\) \{\s*if \(recargarTrasError\(err\)\) \{\s*tablero\.recargar\(\[\.\.\.columnas\]\);\s*recargarTrasCambio\(\);\s*\}\s*throw err;\s*\}/);
  assert.match(cancelar, /tablero\.recargar\(\[\.\.\.columnas\]\);\s*recargarTrasCambio\(\);\s*$/);
  assert.match(lista, /<ModalMotivo\s+titulo=\{`Cancelar \$\{cancelando\.pedido\.numero\}`\}\s+efectos=\{efectosCancelarPedido\(cancelando\.pedido\)\}[\s\S]*?onConfirmar=\{cancelarConMotivo\}\s+onCerrar=\{\(\) => setCancelando\(null\)\}/);
  // accionesTarjeta: accionesTarjetaPedido; al terminar, la columna En proceso y lo que mueve el cambio.
  assert.match(lista, /accionesTarjetaPedido\(p\)\.map\(\(a\) => \(\{\s*etiqueta: a\.etiqueta, [^\n]*onClick: \(\) => \{ void marcarDesdeTablero\(p, a\.estado\); \},/);
  const marcar = lista.slice(lista.indexOf('const marcarDesdeTablero'), lista.indexOf('\n  }, [', lista.indexOf('const marcarDesdeTablero')));
  assert.match(marcar, /JSON\.stringify\(\{ estado: nuevo, updated_by: autorActual\(\) \}\)/);
  assert.match(marcar, /if \(!recargarTrasError\(err\)\) return;\s*\}\s*recargarTablero\(\['en_proceso'\]\);\s*recargarTrasCambio\(\);\s*$/);
  // La regla del tablero (T3C) da 'facturar' y 'cancelar', las dos que maneja la pantalla, y bloquea Entregado.
  assert.deepEqual(reglaSoltarPedido({ id: 1, estado: 'ENTREGADO' }, 'entregado', 'facturado'), { tipo: 'accion', accion: 'facturar' });
  assert.deepEqual(reglaSoltarPedido({ id: 1, estado: 'EN_PROCESO' }, 'en_proceso', 'cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.equal(reglaSoltarPedido({ id: 1, estado: 'EN_PROCESO' }, 'en_proceso', 'entregado').tipo, 'bloqueado');
  // Nunca confirm(), alert() ni prompt() (test_sin_dialogos_nativos los vigila también).
  assert.ok(!/\b(confirm|alert|prompt)\(/.test(codigo.replace(/confirmar\(/g, '')), 'sin diálogos nativos');
  // Al pasar a Kanban se sale de la pantalla completa; la barra no la ofrece en Kanban.
  assert.match(lista, /useEffect\(\(\) => \{ if \(enKanban\) salir\(\); \}, \[enKanban, salir\]\);/);
  assert.match(lista, /pantallaCompleta=\{enKanban \? undefined : \{ completa, alternar \}\}/);
}

console.log('OK test_kanban_ventas');
