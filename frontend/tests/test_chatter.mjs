/**
 * frontend/tests/test_chatter.mjs
 * U6+H22 + R1 (Bloque 2, T6B): un solo Chatter para SC, COT, PVEN y el panel del Hub. Reglas puras de
 * src/lib/chatter.js: tipos (con la Nota externa y su medio), rutas, validacion con los mismos mensajes del backend
 * (backend/app/core/chatter.py validar_nota), cuerpo del POST, lista, borrador y enlaces de correo/telefono.
 */

import assert from 'node:assert/strict';
import {
  TIPOS_CHATTER, MAX_TEXTO_CHATTER, MAX_MEDIO_CHATTER, UMBRAL_CONTADOR_CHATTER, MEDIOS_SUGERIDOS,
  esEntradaChatter, tipoChatter, tituloEntradaChatter, rutaNotas, validarTextoChatter, validarNotaChatter,
  cuerpoNota, largoTexto, entradasChatter, agregarActividad, claveBorrador, parsearBorrador, asuntoDocumento,
  mailtoUrl, telUrl, motivoTipoDeshabilitado, mensajeNoGuardado,
} from '../src/lib/chatter.js';

const VACIA = 'Escribe la nota antes de guardarla.';
const LARGA = 'La nota es muy larga (máximo 2000 caracteres).';
const TIPO_MALO = 'Tipo de nota no válido.';
const MEDIO_LARGO = 'El medio es muy largo (máximo 60 caracteres).';

console.log('--- TEST 1: tipos del Chatter (cinco, con la Nota externa de R1) ---');
{
  assert.deepEqual(Object.keys(TIPOS_CHATTER), ['NOTA', 'LLAMADA', 'WHATSAPP', 'CORREO', 'EXTERNA'],
    'mismas claves y orden que TIPOS_CHATTER del backend');
  assert.deepEqual(TIPOS_CHATTER.NOTA, {
    chip: 'Nota interna', titulo: 'Nota interna', placeholder: 'Escribe una nota interna o un seguimiento…',
    boton: 'Guardar nota',
  });
  assert.deepEqual(TIPOS_CHATTER.LLAMADA, {
    chip: 'Llamada', titulo: 'Llamada con el cliente', placeholder: '¿Qué hablaste con el cliente?',
    boton: 'Guardar llamada',
  });
  assert.deepEqual(TIPOS_CHATTER.WHATSAPP, {
    chip: 'WhatsApp', titulo: 'WhatsApp al cliente', placeholder: 'Mensaje para el cliente…',
    boton: 'Abrir WhatsApp y guardar',
  });
  assert.deepEqual(TIPOS_CHATTER.CORREO, {
    chip: 'Correo', titulo: 'Correo al cliente', placeholder: 'Mensaje del correo…', boton: 'Abrir correo y guardar',
  });
  assert.deepEqual(TIPOS_CHATTER.EXTERNA, {
    chip: 'Nota externa', titulo: 'Nota externa (contacto con el cliente)',
    placeholder: '¿Qué hablaste con el cliente y por qué medio?', boton: 'Guardar nota externa',
  });
  assert.equal(MAX_TEXTO_CHATTER, 2000, 'MAX_TEXTO del backend');
  assert.equal(MAX_MEDIO_CHATTER, 60, 'MAX_MEDIO del backend');
  assert.equal(UMBRAL_CONTADOR_CHATTER, 1800);
  assert.deepEqual([...MEDIOS_SUGERIDOS], ['Visita', 'Reunión', 'Mensaje de texto', 'Otro']);
  // Tablas congeladas en profundidad: ninguna pantalla las puede cambiar por accidente.
  assert.throws(() => { TIPOS_CHATTER.NOTA.chip = 'x'; }, TypeError);
  assert.throws(() => { TIPOS_CHATTER.FAX = {}; }, TypeError);
  assert.throws(() => { MEDIOS_SUGERIDOS.push('x'); }, TypeError);
}

console.log('--- TEST 2: esEntradaChatter ---');
{
  assert.equal(esEntradaChatter({ action: 'CHATTER' }), true);
  assert.equal(esEntradaChatter({ action: 'NOTE_ADDED' }), true, "la nota 'Motivo del rechazo (Hub)' de N3");
  assert.equal(esEntradaChatter({ action: 'UPDATED' }), false, 'las ediciones del sistema no son notas');
  assert.equal(esEntradaChatter({ action: 'ESTADO_CHANGED' }), false);
  assert.equal(esEntradaChatter(null), false);
  assert.equal(esEntradaChatter(undefined), false);
  assert.equal(esEntradaChatter({}), false);
}

console.log('--- TEST 3: tipoChatter (las notas viejas sin tipo son Nota interna) ---');
{
  assert.equal(tipoChatter({ extra_data: { tipo: 'LLAMADA' } }), 'LLAMADA');
  assert.equal(tipoChatter({ extra_data: { tipo: 'EXTERNA' } }), 'EXTERNA');
  assert.equal(tipoChatter({ extra_data: { tipo: 'whatsapp' } }), 'WHATSAPP', 'sin importar mayúsculas');
  assert.equal(tipoChatter({ action: 'CHATTER' }), 'NOTA', 'sin extra_data');
  assert.equal(tipoChatter({ extra_data: null }), 'NOTA');
  assert.equal(tipoChatter({ extra_data: { tipo: 'FAX' } }), 'NOTA');
  assert.equal(tipoChatter({ extra_data: { tipo: 'constructor' } }), 'NOTA', 'nunca una clave del prototipo');
  assert.equal(tipoChatter({ extra_data: { tipo: 7 } }), 'NOTA');
  assert.equal(tipoChatter(null), 'NOTA');
}

console.log('--- TEST 4: tituloEntradaChatter (R1: Nota externa · {medio}) ---');
{
  assert.equal(tituloEntradaChatter({ action: 'CHATTER', extra_data: { tipo: 'EXTERNA', medio: 'Visita' } }),
    'Nota externa · Visita');
  assert.equal(tituloEntradaChatter({ action: 'CHATTER', extra_data: { tipo: 'EXTERNA', medio: '  Reunión ' } }),
    'Nota externa · Reunión');
  assert.equal(tituloEntradaChatter({ action: 'CHATTER', extra_data: { tipo: 'EXTERNA' } }),
    'Nota externa (contacto con el cliente)', 'sin medio, el título del tipo');
  assert.equal(tituloEntradaChatter({ action: 'CHATTER', extra_data: { tipo: 'EXTERNA', medio: '   ' } }),
    'Nota externa (contacto con el cliente)');
  assert.equal(tituloEntradaChatter({ action: 'CHATTER', extra_data: { tipo: 'LLAMADA', medio: 'Visita' } }),
    'Llamada con el cliente', 'el medio solo cuenta en la Nota externa');
  assert.equal(tituloEntradaChatter({ action: 'NOTE_ADDED', description: 'Motivo del rechazo (Hub): x' }),
    'Nota interna');
  assert.equal(tituloEntradaChatter(null), 'Nota interna');
}

console.log('--- TEST 5: rutaNotas ---');
{
  assert.equal(rutaNotas('SC', 7), '/ventas/solicitudes/7/actividad');
  assert.equal(rutaNotas('COT', 12), '/ventas/cotizaciones/12/actividad');
  assert.equal(rutaNotas('VEN', '30'), '/ventas/pedidos/30/actividad', 'un id que llega como texto');
  assert.throws(() => rutaNotas('XX', 1), Error);
  assert.throws(() => rutaNotas('', 1), Error);
  assert.throws(() => rutaNotas(undefined, 1), Error);
  // Sin un id valido no se arma una ruta a /undefined/actividad.
  for (const id of [undefined, null, '', 'abc', '1/../2', 0, -3, 1.5]) {
    assert.throws(() => rutaNotas('SC', id), Error, `id ${String(id)}`);
  }
}

console.log('--- TEST 6: validarTextoChatter (los mismos mensajes del backend) ---');
{
  assert.equal(validarTextoChatter('  '), VACIA);
  assert.equal(validarTextoChatter(''), VACIA);
  assert.equal(validarTextoChatter(null), VACIA);
  assert.equal(validarTextoChatter(123), VACIA, 'lo que no es texto cuenta como vacío (igual que el backend)');
  assert.equal(validarTextoChatter('x'.repeat(2001)), LARGA);
  assert.equal(validarTextoChatter(`  ${'x'.repeat(2000)}  `), null, 'se mide sin los espacios de los bordes');
  assert.equal(validarTextoChatter('Hola'), null);
  // Se cuenta en puntos de código, como len() de Python: 2000 emojis caben.
  assert.equal(largoTexto('😀'.repeat(2000)), 2000);
  assert.equal(validarTextoChatter('😀'.repeat(2000)), null);
  assert.equal(validarTextoChatter('😀'.repeat(2001)), LARGA);
  assert.equal(largoTexto(null), 0);
}

console.log('--- TEST 7: cuerpoNota (R1: el medio va al backend solo con la Nota externa) ---');
{
  assert.deepEqual(cuerpoNota('EXTERNA', ' Fui a la obra ', ' Visita '),
    { action: 'CHATTER', tipo: 'EXTERNA', description: 'Fui a la obra', medio: 'Visita' });
  assert.deepEqual(cuerpoNota('externa', 'Fui a la obra', 'Visita'),
    { action: 'CHATTER', tipo: 'EXTERNA', description: 'Fui a la obra', medio: 'Visita' }, 'tipo sin importar mayúsculas');
  assert.deepEqual(cuerpoNota('EXTERNA', 'Fui a la obra', '   '),
    { action: 'CHATTER', tipo: 'EXTERNA', description: 'Fui a la obra' }, 'medio vacío: no se manda');
  assert.deepEqual(cuerpoNota('EXTERNA', 'Fui a la obra'),
    { action: 'CHATTER', tipo: 'EXTERNA', description: 'Fui a la obra' });
  assert.deepEqual(cuerpoNota('EXTERNA', 'x', 'a'.repeat(60)),
    { action: 'CHATTER', tipo: 'EXTERNA', description: 'x', medio: 'a'.repeat(60) }, '60 caracteres caben');
  assert.throws(() => cuerpoNota('EXTERNA', 'x', 'a'.repeat(61)), { message: MEDIO_LARGO });
  assert.throws(() => cuerpoNota('EXTERNA', 'x', ` ${'a'.repeat(61)} `), { message: MEDIO_LARGO });
  // Con otros tipos el medio se ignora (tambien su largo), como validar_nota del backend.
  assert.deepEqual(cuerpoNota('NOTA', 'Hola', 'Visita'), { action: 'CHATTER', tipo: 'NOTA', description: 'Hola' });
  assert.deepEqual(cuerpoNota('LLAMADA', 'Llamé', 'a'.repeat(61)),
    { action: 'CHATTER', tipo: 'LLAMADA', description: 'Llamé' });
  assert.deepEqual(cuerpoNota(undefined, 'Hola'), { action: 'CHATTER', tipo: 'NOTA', description: 'Hola' },
    'sin tipo: Nota interna');
  // Mismo orden de validacion que el backend: el texto antes que el tipo y el medio.
  assert.throws(() => cuerpoNota('NOTA', '   '), { message: VACIA });
  assert.throws(() => cuerpoNota('FAX', '   '), { message: VACIA });
  assert.throws(() => cuerpoNota('NOTA', 'x'.repeat(2001)), { message: LARGA });
  assert.throws(() => cuerpoNota('FAX', 'Hola'), { message: TIPO_MALO });
  assert.throws(() => cuerpoNota('constructor', 'Hola'), { message: TIPO_MALO });
  // El body nunca lleva user_name: el autor lo pone el servidor.
  assert.ok(!('user_name' in cuerpoNota('NOTA', 'Hola')));
  // validarNotaChatter: el mismo mensaje, o null.
  assert.equal(validarNotaChatter('EXTERNA', 'x', 'a'.repeat(61)), MEDIO_LARGO);
  assert.equal(validarNotaChatter('NOTA', ' '), VACIA);
  assert.equal(validarNotaChatter('FAX', 'Hola'), TIPO_MALO);
  assert.equal(validarNotaChatter('EXTERNA', 'Hola', 'Visita'), null);
}

console.log('--- TEST 8: entradasChatter (solo notas; la más reciente primero; desempate por id) ---');
{
  const actividades = [
    { id: 1, action: 'CREATED', created_at: '2026-10-01T10:00:00Z' },
    { id: 2, action: 'CHATTER', created_at: '2026-10-01T11:00:00Z' },
    { id: 5, action: 'NOTE_ADDED', created_at: '2026-10-02T09:00:00' }, // sin zona: UTC
    { id: 3, action: 'CHATTER', created_at: '2026-10-02T09:00:00Z' },
    { id: 4, action: 'UPDATED', created_at: '2026-10-03T09:00:00Z' },
    { id: 6, action: 'CHATTER', created_at: '2026-10-01 11:00:00.000000' },
  ];
  const copia = structuredClone(actividades);
  assert.deepEqual(entradasChatter(actividades).map((a) => a.id), [5, 3, 6, 2]);
  assert.deepEqual(actividades, copia, 'no muta ni reordena la lista recibida');
  assert.deepEqual(entradasChatter(null), []);
  assert.deepEqual(entradasChatter([null, 'x', { action: 'CHATTER', id: 9 }]).map((a) => a.id), [9]);
  // Sin fecha valida van al final, desempatadas por id.
  assert.deepEqual(entradasChatter([
    { id: 1, action: 'CHATTER' }, { id: 2, action: 'CHATTER', created_at: '2026-10-01T10:00:00Z' },
    { id: 3, action: 'CHATTER', created_at: 'no es fecha' },
  ]).map((a) => a.id), [2, 3, 1]);
}

console.log('--- TEST 9: agregarActividad (sin mutar, al final y sin duplicar por id) ---');
{
  const doc = { id: 7, numero: 'SC-1', actividades: [{ id: 1, action: 'CREATED' }] };
  const copia = structuredClone(doc);
  const log = { id: 2, action: 'CHATTER', description: 'Hola' };
  const nuevo = agregarActividad(doc, log);
  assert.notEqual(nuevo, doc);
  assert.deepEqual(nuevo.actividades.map((a) => a.id), [1, 2]);
  assert.equal(nuevo.numero, 'SC-1');
  assert.deepEqual(doc, copia, 'no muta el documento');
  assert.notEqual(nuevo.actividades, doc.actividades);
  assert.equal(agregarActividad(nuevo, { ...log }).actividades.length, 2, 'no duplica el id');
  assert.equal(agregarActividad(null, log), null);
  assert.equal(agregarActividad(undefined, log), null);
  assert.deepEqual(agregarActividad({ id: 3 }, log).actividades, [log], 'sin actividades previas');
  assert.equal(agregarActividad(doc, null), doc, 'sin renglón no cambia nada');
}

console.log('--- TEST 10: borrador (clave y lectura tolerante) ---');
{
  assert.equal(claveBorrador('SC', 7), 'chatter-borrador:SC:7');
  assert.equal(claveBorrador('VEN', '30'), 'chatter-borrador:VEN:30');
  assert.deepEqual(parsearBorrador(JSON.stringify({ texto: 'Hola', tipo: 'EXTERNA', medio: 'Visita' })),
    { texto: 'Hola', tipo: 'EXTERNA', medio: 'Visita' });
  assert.deepEqual(parsearBorrador(null), { texto: '', tipo: 'NOTA', medio: '' });
  assert.deepEqual(parsearBorrador('no es json'), { texto: '', tipo: 'NOTA', medio: '' });
  assert.deepEqual(parsearBorrador('"solo texto"'), { texto: 'solo texto', tipo: 'NOTA', medio: '' });
  assert.deepEqual(parsearBorrador(JSON.stringify({ texto: 5, tipo: 'FAX', medio: [] })),
    { texto: '', tipo: 'NOTA', medio: '' });
}

console.log('--- TEST 11: asunto, mailto y tel ---');
{
  assert.equal(asuntoDocumento('SC', 'SC-20260001'), 'Solicitud SC-20260001');
  assert.equal(asuntoDocumento('COT', 'COT-20260002'), 'Cotización COT-20260002');
  assert.equal(asuntoDocumento('VEN', 'PVEN-20260003'), 'Pedido PVEN-20260003');
  assert.equal(asuntoDocumento('SC', null), 'Solicitud');
  assert.equal(mailtoUrl('ana@x.co', 'Cotización COT-1', 'Hola & adiós\nlínea 2'),
    'mailto:ana@x.co?subject=Cotizaci%C3%B3n%20COT-1&body=Hola%20%26%20adi%C3%B3s%0Al%C3%ADnea%202');
  assert.equal(mailtoUrl('  ana@x.co ', 'a', 'b'), 'mailto:ana@x.co?subject=a&body=b');
  assert.equal(mailtoUrl('', 'a', 'b'), null);
  assert.equal(mailtoUrl(null, 'a', 'b'), null);
  assert.equal(mailtoUrl('sin-arroba', 'a', 'b'), null);
  // Un correo con '?' o '&' no puede agregar destinatarios ni cambiar el asunto.
  assert.equal(mailtoUrl('a@b.co?bcc=otro@x.co', 'a', 'b'), 'mailto:a@b.co%3Fbcc%3Dotro@x.co?subject=a&body=b');
  assert.equal(telUrl('300 123 4567'), 'tel:+573001234567');
  assert.equal(telUrl('+57 300 123 4567'), 'tel:+573001234567');
  assert.equal(telUrl(''), null);
  assert.equal(telUrl(null), null);
}

console.log('--- TEST 12: tipos deshabilitados según los datos del cliente ---');
{
  const conTodo = { customer_phone: '3001234567', customer_email: 'ana@x.co' };
  for (const tipo of Object.keys(TIPOS_CHATTER)) assert.equal(motivoTipoDeshabilitado(tipo, conTodo), null, tipo);
  assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: '' }), 'El cliente no tiene teléfono registrado');
  assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: 'sin número' }),
    'El cliente no tiene teléfono registrado');
  assert.equal(motivoTipoDeshabilitado('CORREO', { customer_email: '  ' }), 'El cliente no tiene correo registrado');
  assert.equal(motivoTipoDeshabilitado('CORREO', null), 'El cliente no tiene correo registrado');
  // Una llamada o una nota externa se pueden registrar aunque falte el telefono (p. ej. desde otro numero).
  assert.equal(motivoTipoDeshabilitado('LLAMADA', {}), null);
  assert.equal(motivoTipoDeshabilitado('EXTERNA', {}), null);
  assert.equal(motivoTipoDeshabilitado('NOTA', null), null);
}

console.log('--- TEST 13: mensaje en línea cuando la nota no se guardó ---');
{
  assert.equal(mensajeNoGuardado(new Error('La nota es muy larga (máximo 2000 caracteres).')),
    'No se guardó: La nota es muy larga (máximo 2000 caracteres). Tu texto sigue aquí; intenta de nuevo.');
  assert.equal(mensajeNoGuardado(new TypeError('Failed to fetch')),
    'No se guardó: No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo. Tu texto sigue aquí; intenta de nuevo.');
  assert.equal(mensajeNoGuardado({}),
    'No se guardó: Ocurrió un error inesperado. Intenta de nuevo. Tu texto sigue aquí; intenta de nuevo.');
}

console.log('OK test_chatter.mjs');
