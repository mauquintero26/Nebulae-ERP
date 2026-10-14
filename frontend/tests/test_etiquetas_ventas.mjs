/**
 * frontend/tests/test_etiquetas_ventas.mjs
 * H7+H41: los tipos de solicitud y las modalidades de pago se guardan SIN tilde (son la clave: se comparan y se
 * mandan al servidor) pero se MUESTRAN con tilde. Bloque 2 (H10, aprobado por el usuario; T6A): los textos son
 * 'Cotización de producto', 'Soporte técnico', 'Devolución de producto', 'Crédito 30 días' y
 * '60/40 (60% de anticipo y 40% al entregar)'. Un solo helper para todas las pantallas (lista, detalle, Hub, PVEN y
 * la Actividad).
 */

import assert from 'node:assert/strict';
import {
  etiquetaTipoSolicitud, etiquetaModalidad, etiquetaValorCambio, claveModalidad, esModalidadCredito,
  etiquetaModalidadCorta,
} from '../src/lib/etiquetas-ventas.js';

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
  // Formas cortas conocidas del plazo.
  assert.equal(etiquetaModalidad('cr. 90 dias'), 'Crédito 90 días');
  assert.equal(etiquetaModalidad('CRÉDITO'), 'Crédito');
  assert.equal(etiquetaModalidad('Cred 45'), 'Crédito 45 días');
  // Caracteres de ancho completo (NFKD, como el backend).
  assert.equal(etiquetaModalidad('Ｃｒｅｄｉｔｏ 30 dias'), 'Crédito 30 días');
}

console.log('--- TEST 3b: un crédito con otra forma no inventa un plazo: solo se ponen las tildes ---');
{
  assert.equal(etiquetaModalidad('Credito 2 cuotas'), 'Crédito 2 cuotas');
  assert.equal(etiquetaModalidad('Credito 50% anticipo y saldo a 30 dias'), 'Crédito 50% anticipo y saldo a 30 días');
  assert.equal(etiquetaModalidad('Credito 30-60-90 dias'), 'Crédito 30-60-90 días');
  assert.equal(etiquetaModalidad('Pago a credito, 30 dias'), 'Pago a crédito, 30 días');
  assert.equal(etiquetaModalidad('CREDITO 2 CUOTAS'), 'CRÉDITO 2 CUOTAS', 'respeta las mayúsculas');
  // 'Cruce de cuentas' empieza por 'cr': el backend lo cobra al 0% (R2, esModalidadCredito), pero la etiqueta no
  // lo llama crédito (no tiene la forma de un plazo).
  assert.equal(etiquetaModalidad('Cruce de cuentas'), 'Cruce de cuentas');
  // Las palabras que solo contienen 'credito' o 'dias' no se tocan (palabra completa, como en el Bloque 1).
  assert.equal(etiquetaModalidad('Descreditos'), 'Descreditos');
  assert.equal(etiquetaModalidad('Medias'), 'Medias');
}

console.log('--- TEST 3c: claveModalidad y esModalidadCredito (el predicado único de crédito, R2) ---');
{
  assert.equal(claveModalidad('  Ｃｒéｄｉｔｏ 30 Días '), 'credito 30 dias');
  assert.equal(claveModalidad(null), '');
  assert.equal(claveModalidad(undefined), '');
  for (const v of ['Credito 30 dias', 'CRÉDITO', 'cr. 90 dias', 'Ｃｒｅｄｉｔｏ', 'Cruce de cuentas', 'Pago a credito']) {
    assert.equal(esModalidadCredito(v), true, v);
  }
  for (const v of ['Contado', '60/40 (60% anticipo - 40% pendiente)', 'Otro', '', '   ', null, undefined, 'Medias']) {
    assert.equal(esModalidadCredito(v), false, String(v));
  }
}

console.log('--- TEST 4: 60/40, contado y otro; lo desconocido queda como está ---');
{
  assert.equal(etiquetaModalidad('60/40 (60% anticipo - 40% pendiente)'), '60/40 (60% de anticipo y 40% al entregar)');
  assert.equal(etiquetaModalidad('Contado'), 'Contado');
  assert.equal(etiquetaModalidad('  CONTADO '), 'Contado');
  assert.equal(etiquetaModalidad('Otro'), 'Otro');
  assert.equal(etiquetaModalidad('otro'), 'Otro');
  for (const m of ['Adelanto 50%', 'Contra entrega', 'Contado contra entrega']) {
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

console.log('--- T11 (V9): etiquetaModalidadCorta, la modalidad sin la explicación entre paréntesis ---');
{
  // Para textos que ya van entre paréntesis ('Anticipo requerido (60% · 60/40)'): sin paréntesis dentro de paréntesis.
  assert.equal(etiquetaModalidadCorta('60/40 (60% anticipo - 40% pendiente)'), '60/40');
  assert.equal(etiquetaModalidadCorta('60/40 (60% de anticipo y 40% al entregar)'), '60/40');
  // Las demás son iguales a etiquetaModalidad (ya son cortas).
  for (const v of ['Contado', 'Credito 30 dias', 'Credito 60d', 'Otro', 'Contra entrega', 'Cruce de cuentas', '']) {
    assert.equal(etiquetaModalidadCorta(v), etiquetaModalidad(v), v);
  }
  assert.equal(etiquetaModalidadCorta(null), '');
  assert.equal(etiquetaModalidadCorta(undefined), '');
}

console.log('OK test_etiquetas_ventas');
