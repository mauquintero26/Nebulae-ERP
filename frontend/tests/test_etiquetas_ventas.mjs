/**
 * frontend/tests/test_etiquetas_ventas.mjs
 * H7+H41: los tipos de solicitud y las modalidades de pago se guardan SIN tilde (son la clave: se comparan y se
 * mandan al servidor) pero se MUESTRAN con tilde: 'Cotización de Producto', 'Crédito 30 días'.
 */

import assert from 'node:assert/strict';
import { etiquetaTipoSolicitud, etiquetaModalidad, etiquetaValorCambio } from '../src/lib/etiquetas-ventas.js';

console.log('--- TEST 1: los tipos de solicitud se muestran con tilde ---');
{
  assert.equal(etiquetaTipoSolicitud('Cotizacion de Producto'), 'Cotización de Producto');
  assert.equal(etiquetaTipoSolicitud('Devolucion de Producto'), 'Devolución de Producto');
  assert.equal(etiquetaTipoSolicitud('Soporte Tecnico'), 'Soporte Técnico');
}

console.log('--- TEST 2: los tipos que no llevan tilde, o que no se conocen, quedan como estan ---');
{
  for (const t of ['Seguimiento', 'Programar Entrega', 'Nuevo Lead', 'Otro tipo nuevo']) {
    assert.equal(etiquetaTipoSolicitud(t), t);
  }
  assert.equal(etiquetaTipoSolicitud(null), '');
  assert.equal(etiquetaTipoSolicitud(undefined), '');
  assert.equal(etiquetaTipoSolicitud(''), '');
}

console.log('--- TEST 3: las modalidades de pago se muestran con tilde ---');
{
  assert.equal(etiquetaModalidad('Credito 30 dias'), 'Crédito 30 días');
  assert.equal(etiquetaModalidad('Credito 60 dias'), 'Crédito 60 días');
  // Variantes que llegan de la agenda, el chat y la orden de compra.
  assert.equal(etiquetaModalidad('Credito 30 Dias'), 'Crédito 30 Días');
  assert.equal(etiquetaModalidad('Credito 30d'), 'Crédito 30d');
  assert.equal(etiquetaModalidad('Credito 60d'), 'Crédito 60d');
}

console.log('--- TEST 4: las modalidades sin tilde, o que no se conocen, quedan como estan ---');
{
  for (const m of ['Contado', 'Otro', '60/40 (60% anticipo - 40% pendiente)', 'Adelanto 50%', 'Contra entrega']) {
    assert.equal(etiquetaModalidad(m), m);
  }
  assert.equal(etiquetaModalidad(null), '');
  assert.equal(etiquetaModalidad(undefined), '');
  // Una palabra que SOLO contiene 'dias' o 'credito' no se toca (palabra completa).
  assert.equal(etiquetaModalidad('Medias'), 'Medias');
  assert.equal(etiquetaModalidad('Descreditos'), 'Descreditos');
}

console.log('--- TEST 5: es idempotente (lo que ya lleva tilde no cambia) ---');
{
  assert.equal(etiquetaTipoSolicitud('Cotización de Producto'), 'Cotización de Producto');
  assert.equal(etiquetaModalidad('Crédito 30 días'), 'Crédito 30 días');
}

console.log('--- TEST 6: el detalle de la Actividad (extra_data.cambios) muestra tipo y modalidad con tilde ---');
{
  // Renglones ya guardados: el backend los dejo con el valor sin tilde y no se reescriben.
  assert.equal(etiquetaValorCambio('tipo_solicitud', 'Cotizacion de Producto'), 'Cotización de Producto');
  assert.equal(etiquetaValorCambio('tipo_solicitud', 'Soporte Tecnico'), 'Soporte Técnico');
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
