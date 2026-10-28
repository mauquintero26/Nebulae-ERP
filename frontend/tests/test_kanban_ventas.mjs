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
 *    acepta returnTo (cruce C5) y estadoDeTarjeta se exporta.
 */

import assert from 'node:assert/strict';
import {
  COLUMNAS_HUB, reglaSoltarHub, tarjetaHub, estadoDeTarjeta, chipsDocumentoVentas, confirmacionReiniciarSolicitud,
  motivoTransicionPedido, COLUMNAS_PEDIDO, reglaSoltarPedido, COLUMNAS_COT, reglaSoltarCotizacion, COLUMNAS_SC,
  reglaSoltarSC,
} from '../src/lib/kanban-ventas.js';
import { columnaHub, accionSiguienteDocumento, RUTA_HUB_VENTAS } from '../src/lib/hub-ventas.js';
import { ESTADOS_PEDIDO, transicionesPedido, infoEstadoPedido } from '../src/lib/estados-pedido.js';
import { ESTADOS_SC } from '../src/lib/estados-solicitud.js';
import { ESTADOS_COTIZACION } from '../src/lib/estados-cotizacion.js';
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

console.log('OK test_kanban_ventas');
