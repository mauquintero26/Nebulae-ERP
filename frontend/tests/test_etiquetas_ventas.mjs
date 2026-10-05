/**
 * frontend/tests/test_etiquetas_ventas.mjs
 * H7+H41: los tipos de solicitud y las modalidades de pago se guardan SIN tilde (son la clave: se comparan y se
 * mandan al servidor) pero se MUESTRAN con tilde. Bloque 2 (H10, aprobado por el usuario; T6A): los textos son
 * 'Cotización de producto', 'Soporte técnico', 'Devolución de producto', 'Crédito 30 días' y
 * '60/40 (60% de anticipo y 40% al entregar)'. Un solo helper para todas las pantallas (lista, detalle, Hub, PVEN y
 * la Actividad).
 */

import assert from 'node:assert/strict';
import { etiquetaTipoSolicitud, etiquetaModalidad, etiquetaValorCambio } from '../src/lib/etiquetas-ventas.js';

console.log('--- TEST 1: los tipos de solicitud se muestran con tilde (H10: minúscula después de la primera palabra) ---');
{
  assert.equal(etiquetaTipoSolicitud('Cotizacion de Producto'), 'Cotización de producto');
  assert.equal(etiquetaTipoSolicitud('Devolucion de Producto'), 'Devolución de producto');
  assert.equal(etiquetaTipoSolicitud('Soporte Tecnico'), 'Soporte técnico');
  assert.equal(etiquetaTipoSolicitud('Programar Entrega'), 'Programar entrega');
  assert.equal(etiquetaTipoSolicitud('Nuevo Lead'), 'Nuevo lead');
  assert.equal(etiquetaTipoSolicitud('Seguimiento'), 'Seguimiento');
}

console.log('--- TEST 2: los tipos que no se conocen quedan como están ---');
{
  for (const t of ['Otro tipo nuevo', 'constructor', 'toString']) {
    assert.equal(etiquetaTipoSolicitud(t), t);
  }
  assert.equal(etiquetaTipoSolicitud(null), '');
  assert.equal(etiquetaTipoSolicitud(undefined), '');
  assert.equal(etiquetaTipoSolicitud(''), '');
}

console.log('--- TEST 3: las modalidades de crédito se muestran como \'Crédito N días\' ---');
{
  assert.equal(etiquetaModalidad('Credito 30 dias'), 'Crédito 30 días');
  assert.equal(etiquetaModalidad('Credito 60 dias'), 'Crédito 60 días');
  // Variantes que llegan de la agenda, el chat y la orden de compra.
  assert.equal(etiquetaModalidad('Credito 30 Dias'), 'Crédito 30 días');
  assert.equal(etiquetaModalidad('Crédito 60 Días'), 'Crédito 60 días');
  assert.equal(etiquetaModalidad('Credito 30d'), 'Crédito 30 días');
  assert.equal(etiquetaModalidad('Credito 60d'), 'Crédito 60 días');
  // Misma regla que el anticipo del backend (R2: todo lo que empiece por 'Cr' o diga 'credito' es crédito, 0%).
  assert.equal(etiquetaModalidad('cr. 90 dias'), 'Crédito 90 días');
  assert.equal(etiquetaModalidad('CRÉDITO'), 'Crédito');
  assert.equal(etiquetaModalidad('Descreditos'), 'Crédito');
}

console.log('--- TEST 4: 60/40, contado y otro; lo desconocido queda como está ---');
{
  assert.equal(etiquetaModalidad('60/40 (60% anticipo - 40% pendiente)'), '60/40 (60% de anticipo y 40% al entregar)');
  assert.equal(etiquetaModalidad('Contado'), 'Contado');
  assert.equal(etiquetaModalidad('  CONTADO '), 'Contado');
  assert.equal(etiquetaModalidad('Otro'), 'Otro');
  assert.equal(etiquetaModalidad('otro'), 'Otro');
  for (const m of ['Adelanto 50%', 'Contra entrega', 'Medias', 'Contado contra entrega']) {
    assert.equal(etiquetaModalidad(m), m);
  }
  assert.equal(etiquetaModalidad(null), '');
  assert.equal(etiquetaModalidad(undefined), '');
  assert.equal(etiquetaModalidad(''), '');
}

console.log('--- TEST 5: es idempotente (lo que ya está etiquetado no cambia) ---');
{
  assert.equal(etiquetaTipoSolicitud('Cotización de producto'), 'Cotización de producto');
  assert.equal(etiquetaModalidad('Crédito 30 días'), 'Crédito 30 días');
  assert.equal(etiquetaModalidad('60/40 (60% de anticipo y 40% al entregar)'), '60/40 (60% de anticipo y 40% al entregar)');
}

console.log('--- TEST 6: el detalle de la Actividad (extra_data.cambios) muestra tipo y modalidad con tilde ---');
{
  // Renglones ya guardados: el backend los dejo con el valor sin tilde y no se reescriben.
  assert.equal(etiquetaValorCambio('tipo_solicitud', 'Cotizacion de Producto'), 'Cotización de producto');
  assert.equal(etiquetaValorCambio('tipo_solicitud', 'Soporte Tecnico'), 'Soporte técnico');
  assert.equal(etiquetaValorCambio('modalidad_pago', 'Credito 30 dias'), 'Crédito 30 días');
  assert.equal(etiquetaValorCambio('modalidad_pago', 'Contado'), 'Contado');
  // Otros campos pasan sin tocar, aunque el texto parezca un tipo ('Notas' lo escribio una persona).
  assert.equal(etiquetaValorCambio('notas', 'Cotizacion de Producto'), 'Cotizacion de Producto');
  assert.equal(etiquetaValorCambio('advisor_name', 'Credito 30 dias'), 'Credito 30 dias');
  assert.equal(etiquetaValorCambio(undefined, 'Credito 30 dias'), 'Credito 30 dias');
  // Un valor vacio sigue vacio (la pantalla pone '—' en los campos sueltos).
  assert.equal(etiquetaValorCambio('tipo_solicitud', null), null);
  assert.equal(etiquetaValorCambio('modalidad_pago', undefined), undefined);
}

console.log('OK test_etiquetas_ventas');
