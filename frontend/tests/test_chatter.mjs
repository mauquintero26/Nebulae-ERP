/**
 * frontend/tests/test_chatter.mjs
 * U6+H22 + R1 (Bloque 2, T6B): un solo Chatter para SC, COT, PVEN y el panel del Hub. Reglas puras de
 * src/lib/chatter.js: tipos (con la Nota externa y su medio), rutas, validacion con los mismos mensajes del backend
 * (backend/app/core/chatter.py validar_nota), cuerpo del POST, lista, borrador y enlaces de correo/telefono.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { waUrl } from '../src/lib/whatsapp.js';
import {
  TIPOS_CHATTER, MAX_TEXTO_CHATTER, MAX_MEDIO_CHATTER, UMBRAL_CONTADOR_CHATTER, MEDIOS_SUGERIDOS,
  esEntradaChatter, tipoChatter, tituloEntradaChatter, rutaNotas, validarTextoChatter, validarNotaChatter,
  cuerpoNota, largoTexto, entradasChatter, agregarActividad, claveBorrador, claveBorradorVieja, parsearBorrador,
  asuntoDocumento, mailtoUrl, telUrl, motivoTelefono, motivoTipoDeshabilitado, mensajeNoGuardado, textoSinTelefono,
  ROLES_CONTACTO_CON_EL_CLIENTE, normalizarRol, puedeRegistrar,
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
  // Paridad con str(body.get('tipo') or 'NOTA').strip().upper() del backend (ronda 1, punto 6): solo un valor "falso"
  // (ausente, null, '', 0, false) es Nota interna; '   ', 7 o true son un tipo no válido.
  for (const sinTipo of [undefined, null, '', 0, false]) {
    assert.deepEqual(cuerpoNota(sinTipo, 'Hola'), { action: 'CHATTER', tipo: 'NOTA', description: 'Hola' },
      `sin tipo (${String(sinTipo)}): Nota interna`);
  }
  for (const malo of ['   ', 7, true, 'NOTA X']) {
    assert.throws(() => cuerpoNota(malo, 'Hola'), { message: TIPO_MALO }, `tipo ${JSON.stringify(malo)}`);
  }
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
  // Ronda 1, punto 3: un renglón de OTRO documento no se agrega (el composer cambió de documento durante el POST).
  assert.equal(agregarActividad(doc, { id: 9, action: 'CHATTER', entity_type: 'SC', entity_id: 8 }, 'SC'), doc);
  assert.equal(agregarActividad(doc, { id: 9, action: 'CHATTER', entity_id: '8' }), doc, 'id distinto aunque sea texto');
  assert.equal(agregarActividad(doc, { id: 9, action: 'CHATTER', entity_type: 'COT', entity_id: 7 }, 'SC'), doc,
    'misma id pero otro tipo de documento');
  assert.deepEqual(
    agregarActividad(doc, { id: 9, action: 'CHATTER', entity_type: 'SC', entity_id: '7' }, 'SC').actividades.map((a) => a.id),
    [1, 9], 'el mismo documento (id como texto)');
  assert.deepEqual(
    agregarActividad(doc, { id: 9, action: 'CHATTER', entity_type: 'COT', entity_id: 7 }).actividades.map((a) => a.id),
    [1, 9], 'sin tipoDoc no se compara el tipo');
}

console.log('--- TEST 10: borrador (clave y lectura tolerante) ---');
{
  // Ronda 1, punto 9: el borrador es de cada usuario (sessionStorage sobrevive a cerrar sesión en la misma pestaña).
  assert.equal(claveBorrador('SC', 7, 12), 'chatter-borrador:12:SC:7');
  assert.equal(claveBorrador('VEN', '30', 'ana@x.co'), 'chatter-borrador:ana@x.co:VEN:30');
  assert.equal(claveBorrador('COT', 4), 'chatter-borrador:anonimo:COT:4', 'sin usuario conocido');
  assert.equal(claveBorrador('COT', 4, ''), 'chatter-borrador:anonimo:COT:4');
  assert.notEqual(claveBorrador('SC', 7, 12), claveBorrador('SC', 7, 13));
  // La clave sin usuario (formato de la primera versión) solo se borra, nunca se lee.
  assert.equal(claveBorradorVieja('SC', 7), 'chatter-borrador:SC:7');
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
  assert.equal(mailtoUrl('ana@sin-punto', 'a', 'b'), null, 'la misma regla de correo que el backend (T5)');
  // Un correo con dos '@' no se usa; uno con '?' o '&' se codifica: no agrega destinatarios ni cambia el asunto.
  assert.equal(mailtoUrl('a@b.co?bcc=otro@x.co', 'a', 'b'), null);
  assert.equal(mailtoUrl('a?bcc=x&y@b.co', 'a', 'b'), 'mailto:a%3Fbcc%3Dx%26y@b.co?subject=a&body=b');
  assert.equal(telUrl('300 123 4567'), 'tel:+573001234567');
  assert.equal(telUrl('+57 300 123 4567'), 'tel:+573001234567');
  assert.equal(telUrl('+1 202 555 0143'), 'tel:+12025550143');
  assert.equal(telUrl(''), null);
  assert.equal(telUrl(null), null);
  // Ronda 1, punto 7: un teléfono incompleto no da enlace (mínimo 10 dígitos ya normalizado).
  for (const parcial of ['+57', '0', '123', '300 123 45']) assert.equal(telUrl(parcial), null, parcial);
}

console.log('--- TEST 12: tipos deshabilitados según los datos del cliente ---');
{
  const conTodo = { customer_phone: '3001234567', customer_email: 'ana@x.co' };
  for (const tipo of Object.keys(TIPOS_CHATTER)) assert.equal(motivoTipoDeshabilitado(tipo, conTodo), null, tipo);
  assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: '' }), 'El cliente no tiene teléfono registrado');
  assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: 'sin número' }),
    'El cliente no tiene teléfono registrado');
  for (const parcial of ['+57', '0', '123']) {
    assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: parcial }), 'El teléfono del cliente está incompleto',
      parcial);
    assert.equal(motivoTelefono(parcial), 'El teléfono del cliente está incompleto');
  }
  assert.equal(motivoTelefono(null), 'El cliente no tiene teléfono registrado');
  assert.equal(motivoTelefono('3001234567'), null);
  assert.equal(motivoTipoDeshabilitado('CORREO', { customer_email: '  ' }), 'El cliente no tiene correo registrado');
  assert.equal(motivoTipoDeshabilitado('CORREO', null), 'El cliente no tiene correo registrado');
  // Ronda 1, punto 8: un correo mal escrito no es lo mismo que no tener correo.
  assert.equal(motivoTipoDeshabilitado('CORREO', { customer_email: 'sin-arroba' }), 'El correo del cliente no es válido');
  assert.equal(motivoTipoDeshabilitado('CORREO', { customer_email: 'ana@sin-punto' }), 'El correo del cliente no es válido');
  // Una llamada o una nota externa se pueden registrar aunque falte el telefono (p. ej. desde otro numero).
  assert.equal(motivoTipoDeshabilitado('LLAMADA', {}), null);
  assert.equal(motivoTipoDeshabilitado('EXTERNA', {}), null);
  assert.equal(motivoTipoDeshabilitado('NOTA', null), null);
}

console.log('--- TEST 13: mensaje en línea cuando la nota no se guardó ---');
{
  assert.equal(mensajeNoGuardado(new Error('La nota es muy larga (máximo 2000 caracteres).')),
    'No se guardó: La nota es muy larga (máximo 2000 caracteres). Tu texto sigue aquí; intenta de nuevo.');
  // Ronda 1, punto 5: sin repetir «intenta de nuevo» cuando el mensaje ya lo dice.
  assert.equal(mensajeNoGuardado(new TypeError('Failed to fetch')),
    'No se guardó: No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo. Tu texto sigue aquí.');
  assert.equal(mensajeNoGuardado({}),
    'No se guardó: Ocurrió un error inesperado. Intenta de nuevo. Tu texto sigue aquí.');
  const conStatus = (status, mensaje) => Object.assign(new Error(mensaje), { status });
  assert.equal(mensajeNoGuardado(conStatus(403, 'Not enough permissions')),
    'No tienes permiso para dejar notas en este documento. Tu texto sigue aquí.');
  assert.equal(mensajeNoGuardado(conStatus(404, 'Solicitud no encontrada')), 'El documento ya no existe.');
  assert.equal(mensajeNoGuardado(conStatus(422, 'Escribe la nota antes de guardarla.')),
    'No se guardó: Escribe la nota antes de guardarla. Tu texto sigue aquí; intenta de nuevo.');
  for (const err of [new Error('x'), conStatus(500, 'y'), {}, new TypeError('Failed to fetch')]) {
    assert.ok((mensajeNoGuardado(err).match(/intenta de nuevo/gi) || []).length <= 1, String(err?.message));
  }
}

console.log('--- T11 calidad E6: textoSinTelefono, el mismo texto en las tres ventanas de envío (ChannelModal) ---');
{
  // Sin dígitos: 'sin teléfono'; con dígitos que no alcanzan (motivoTelefono): 'teléfono incompleto'.
  for (const tel of [null, undefined, '', '   ', 'sin número']) assert.equal(textoSinTelefono(tel), 'sin teléfono', String(tel));
  for (const tel of ['+57', '0', '123', '300 123 45']) assert.equal(textoSinTelefono(tel), 'teléfono incompleto', tel);
  // Con un teléfono que sirve no hay texto (la opción WhatsApp está habilitada).
  for (const tel of ['3001234567', '+57 300 123 4567', '+1 202 555 0143']) assert.equal(textoSinTelefono(tel), null, tel);
  // Los tres montajes (detalle de la SC, que no pasaba ninguno; detalle de la COT; y el Hub, ronda 1 punto 8) lo usan,
  // sin el texto armado a mano.
  const leer = (ruta) => readFileSync(new URL(`../src/app/dashboard/ventas/${ruta}`, import.meta.url), 'utf8');
  // B3 T19: y el pedido de venta («Enviar al cliente», U23 punto 7).
  for (const ruta of ['cotizacion/[id]/page.tsx', 'solicitud/[id]/page.tsx', 'page.tsx', 'venta/[id]/page.tsx']) {
    const fuente = leer(ruta);
    assert.ok(/<ChannelModal[\s\S]*?textoSinTelefono=\{textoSinTelefono\(/.test(fuente), `${ruta}: ChannelModal con textoSinTelefono(...)`);
    assert.ok(!fuente.includes("'teléfono incompleto' : 'sin teléfono'"), `${ruta}: sin el texto armado a mano`);
  }
  // B3 T17/T18/T19 (RP19, C27): en la COT, la SC y el PVEN, sobre telefono_whatsapp (el e164 que valida el servidor), no
  // sobre el teléfono escrito en el documento.
  for (const [ruta, doc] of [['cotizacion/[id]/page.tsx', 'cotizacion'], ['solicitud/[id]/page.tsx', 'solicitud'],
    ['venta/[id]/page.tsx', 'pedido']]) {
    const fuente = leer(ruta);
    assert.ok(fuente.includes(`customerHasPhone={!motivoTelefono(${doc}?.telefono_whatsapp)}`), `${ruta}: customerHasPhone`);
  }
  // El porqué: en la COT, sobre telefono_whatsapp (T17; el mismo cambio que la SC queda para la revisión final). En la SC
  // (T18 r1), telefono_whatsapp viene en null también con un teléfono incompleto: el texto mira el escrito si no hay e164,
  // así un '300123456' dice «teléfono incompleto» y no «sin teléfono».
  assert.ok(leer('cotizacion/[id]/page.tsx').includes('textoSinTelefono={textoSinTelefono(cotizacion?.telefono_whatsapp) ?? undefined}'));
  assert.ok(leer('solicitud/[id]/page.tsx').includes(
    'textoSinTelefono={textoSinTelefono(solicitud?.telefono_whatsapp ?? solicitud?.customer_phone) ?? undefined}'), 'SC: el porqué');
  // B3 T19 (nota del controlador tras T13-T18): el PVEN, como la SC.
  assert.ok(leer('venta/[id]/page.tsx').includes(
    'textoSinTelefono={textoSinTelefono(pedido?.telefono_whatsapp ?? pedido?.customer_phone) ?? undefined}'), 'PVEN: el porqué');
  assert.equal(textoSinTelefono(null ?? '300123456'), 'teléfono incompleto');
  // Es el mismo texto que armaban a mano antes, en todos los casos en que WhatsApp queda deshabilitado.
  for (const tel of [null, '', 'sin número', '+57', '0', '123', '300 123 45']) {
    assert.ok(motivoTelefono(tel), String(tel));
    assert.equal(waUrl(tel) ? 'teléfono incompleto' : 'sin teléfono', textoSinTelefono(tel), String(tel));
  }
  // Ronda 1 (9): el resumen de envío de la lista de solicitudes, sin un teléfono que sirva, dice por qué en vez del botón.
  const lista = leer('solicitud/solicitud-client.tsx');
  assert.ok(/waEnvio\s*\?[\s\S]*?:\s*<span[^>]*>\{motivoTelefono\(envio\.telefono\)\}/.test(lista),
    'sin waEnvio se muestra motivoTelefono(envio.telefono)');
}

console.log('--- T11 calidad F1: los contactos con el cliente solo los registran ADMIN y ASESOR (S7 en el frontend) ---');
{
  // Paridad con backend/app/core/chatter.py (ROLES_CONTACTO_CON_EL_CLIENTE y _REINICIAN_ATRASO) y con la normalización de
  // roles de backend/app/api/dependencies.py (_ROLE_LEGACY_MAP), leídas de los .py.
  const chatterPy = readFileSync(new URL('../../backend/app/core/chatter.py', import.meta.url), 'utf8');
  const roles = chatterPy.match(/^ROLES_CONTACTO_CON_EL_CLIENTE\s*=\s*frozenset\(\{([^}]*)\}\)/m);
  assert.ok(roles, 'core/chatter.py define ROLES_CONTACTO_CON_EL_CLIENTE = frozenset({...})');
  const rolesDelServidor = [...roles[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  assert.deepEqual([...ROLES_CONTACTO_CON_EL_CLIENTE].sort(), [...rolesDelServidor].sort());
  const reinician = chatterPy.match(/^_REINICIAN_ATRASO\s*=\s*\{([^}]*)\}/m);
  const contactos = [...reinician[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
  assert.equal(contactos.length, 4);
  const dependencias = readFileSync(new URL('../../backend/app/api/dependencies.py', import.meta.url), 'utf8');
  const mapa = dependencias.match(/^_ROLE_LEGACY_MAP[^=]*=\s*\{([\s\S]*?)^\}/m);
  assert.ok(mapa, 'dependencies.py define _ROLE_LEGACY_MAP');
  const legado = [...mapa[1].matchAll(/["']([^"']+)["']\s*:\s*["']([^"']+)["']/g)].map((m) => [m[1], m[2]]);
  assert.ok(legado.length >= 9, 'se leyó el mapa de roles');
  for (const [crudo, canonico] of legado) {
    for (const variante of [crudo, crudo.toUpperCase(), `  ${crudo} `]) {
      assert.equal(normalizarRol(variante), canonico, variante);
    }
  }
  assert.equal(normalizarRol('Otro_Rol'), 'OTRO_ROL');  // fuera del mapa: en mayúsculas, como normalize_role
  assert.equal(normalizarRol(null), '');

  // puedeRegistrar: la Nota interna cualquiera; los contactos solo ADMIN y ASESOR (también los nombres viejos).
  for (const rol of ['ADMIN', 'Admin', 'asesor', 'Vendedor', ' ASESOR ']) {
    for (const tipo of Object.keys(TIPOS_CHATTER)) assert.equal(puedeRegistrar(tipo, rol), true, `${tipo} ${rol}`);
  }
  for (const rol of ['COMPRAS', 'ERP', 'FINANZAS', 'BODEGA', 'CONSULTA', 'Mercadeo', 'OTRO', '']) {
    assert.equal(puedeRegistrar('NOTA', rol), true, rol);
    for (const tipo of contactos) assert.equal(puedeRegistrar(tipo, rol), false, `${tipo} ${rol}`);
  }
  assert.equal(puedeRegistrar('llamada', 'COMPRAS'), false);  // sin importar mayúsculas, como tipoChatter

  // motivoTipoDeshabilitado con el rol: COMPRAS ve las cuatro chips de contacto deshabilitadas con su motivo (antes que
  // el del teléfono); sin rol conocido no se deshabilita nada por rol (el servidor sigue siendo la guarda).
  const conTodo = { customer_phone: '3001234567', customer_email: 'ana@x.co' };
  const SOLO_ASESOR = 'Solo un asesor o un administrador registra contactos con el cliente.';
  for (const tipo of contactos) {
    assert.equal(motivoTipoDeshabilitado(tipo, conTodo, 'COMPRAS'), SOLO_ASESOR, tipo);
    assert.equal(motivoTipoDeshabilitado(tipo, {}, 'ERP'), SOLO_ASESOR, tipo);
    assert.equal(motivoTipoDeshabilitado(tipo, conTodo, 'ASESOR'), null, tipo);
    for (const desconocido of ['', null, undefined]) assert.equal(motivoTipoDeshabilitado(tipo, conTodo, desconocido), null, tipo);
  }
  assert.equal(motivoTipoDeshabilitado('NOTA', conTodo, 'COMPRAS'), null);
  assert.equal(motivoTipoDeshabilitado('WHATSAPP', { customer_phone: '' }, 'ADMIN'), 'El cliente no tiene teléfono registrado');

  // mensajeNoGuardado: un 403 con un detail legible del servidor lo muestra; sin detail (o con el texto técnico de
  // require_roles) queda el genérico.
  const conDetalle = (status, detail) => Object.assign(new Error(typeof detail === 'string' ? detail : 'x'), { status, detail });
  const DEL_SERVIDOR = 'Solo un asesor o un administrador puede registrar un contacto con el cliente (llamada, WhatsApp, '
    + 'correo o nota externa): deja una nota interna.';
  assert.equal(mensajeNoGuardado(conDetalle(403, DEL_SERVIDOR)), `No se guardó: ${DEL_SERVIDOR} Tu texto sigue aquí.`);
  const GENERICO = 'No tienes permiso para dejar notas en este documento. Tu texto sigue aquí.';
  assert.equal(mensajeNoGuardado(conDetalle(403, null)), GENERICO);
  assert.equal(mensajeNoGuardado(conDetalle(403, '   ')), GENERICO);
  assert.equal(mensajeNoGuardado(conDetalle(403, { codigo: 'X' })), GENERICO);
  assert.equal(mensajeNoGuardado(conDetalle(403, "Rol 'Finanzas' (normalizado: 'FINANZAS') no autorizado para esta "
    + 'operación. Roles requeridos: ADMIN, ASESOR, COMPRAS')), GENERICO);
  assert.equal(mensajeNoGuardado(conDetalle(403, 'Not authenticated')), GENERICO);
  // Revisión final (F2): el patrón del 403 técnico vive en avisos.js (esDetalle403Tecnico); chatter.js ya no tiene
  // su copia.
  const libChatter = readFileSync(new URL('../src/lib/chatter.js', import.meta.url), 'utf8');
  assert.ok(!/DETALLE_403_TECNICO\s*=/.test(libChatter), 'sin la copia del patrón en chatter.js');
  assert.ok(/import \{[^}]*\besDetalle403Tecnico\b[^}]*\} from '\.\/avisos\.js';/.test(libChatter), 'usa la de avisos.js');

  // El composer pasa el rol de la sesión (getUsuarioActual) a motivoTipoDeshabilitado en todos sus usos.
  const composer = readFileSync(new URL('../src/app/dashboard/ventas/chatter.tsx', import.meta.url), 'utf8');
  const usos = composer.match(/motivoTipoDeshabilitado\([^)]*\)/g) ?? [];
  assert.ok(usos.length >= 4 && usos.every((u) => /,\s*rol\)$/.test(u)), usos.join(' | '));
}

console.log('OK test_chatter.mjs');
