/**
 * frontend/tests/test_datos_cliente.mjs
 * H21: corregir el teléfono, el correo, la dirección y la ciudad del cliente desde la solicitud. Las reglas y los
 * textos son los del backend (erp_ventas._normalizar_contacto y app/core/clientes.py, T5).
 */

import assert from 'node:assert/strict';
import {
  CAMPOS_CONTACTO, cambiosDeContacto, validarContacto, avisoCorreccionContacto, formularioDeEdicion, camposEditadosDeSolicitud,
  itemDeTimelineCliente, TITULOS_DE_RESPALDO,
} from '../src/lib/datos-cliente.js';

console.log('--- TEST 1: CAMPOS_CONTACTO (orden del formulario, límites del backend) ---');
{
  assert.deepEqual(CAMPOS_CONTACTO.map((c) => [c.clave, c.etiqueta, c.max, c.soloConFicha]), [
    ['customer_phone', 'Teléfono', 50, false],
    ['customer_email', 'Correo', 150, false],
    ['customer_address', 'Dirección', 255, false],
    ['customer_city', 'Ciudad', 100, true],
  ]);
  assert.ok(Object.isFrozen(CAMPOS_CONTACTO) && Object.isFrozen(CAMPOS_CONTACTO[0]));
}

const original = {
  customer_phone: '3000000000', customer_email: 'ana.vieja@test.com', customer_address: 'Calle 1', customer_city: 'Cali',
};

console.log('--- TEST 2: sin cambios -> {} ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original }, { tieneFicha: true }), {});
  // null y '' son lo mismo (sin dato)
  assert.deepEqual(cambiosDeContacto({ customer_phone: null }, { customer_phone: '' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto({}, { customer_address: '   ' }, { tieneFicha: true }), {});
  // una clave que no está en el formulario no se toca
  assert.deepEqual(cambiosDeContacto(original, { customer_phone: '3000000000' }, { tieneFicha: true }), {});
}

console.log('--- TEST 3: recorta espacios y solo devuelve lo que cambió ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: ' 3001112233 ' }, { tieneFicha: true }),
    { customer_phone: '3001112233' });
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: ' 3000000000 ' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_address: 'Calle 2 # 3-4' }),
    { customer_address: 'Calle 2 # 3-4' });
}

console.log('--- TEST 4: el mismo correo con otras mayúsculas no cuenta como cambio ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: ' Ana.Vieja@TEST.com ' }, { tieneFicha: true }), {});
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: ' Ana.Nueva@Test.com ' }, { tieneFicha: true }),
    { customer_email: 'ana.nueva@test.com' });
}

console.log('--- TEST 5: la ciudad solo entra si la solicitud tiene ficha ---');
{
  const form = { ...original, customer_city: 'Medellín' };
  assert.deepEqual(cambiosDeContacto(original, form, { tieneFicha: false }), {});
  assert.deepEqual(cambiosDeContacto(original, form), {});
  assert.deepEqual(cambiosDeContacto(original, form, { tieneFicha: true }), { customer_city: 'Medellín' });
}

console.log('--- TEST 6: borrar un dato es un cambio ---');
{
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_phone: '' }, { tieneFicha: true }),
    { customer_phone: '' });
  assert.deepEqual(cambiosDeContacto(original, { ...original, customer_email: '  ' }), { customer_email: '' });
}

console.log('--- TEST 7: validarContacto con los textos del backend ---');
{
  assert.equal(validarContacto({ customer_email: 'sin-arroba' }), 'El correo «sin-arroba» no es válido.');
  assert.equal(validarContacto({ customer_email: ' a b@c.co ' }), 'El correo «a b@c.co» no es válido.');
  assert.equal(validarContacto({ customer_phone: '12' }), 'El teléfono debe tener al menos 7 dígitos.');
  // solo cuentan los dígitos: '+57 (30) 1-1' tiene 6
  assert.equal(validarContacto({ customer_phone: '+57 (30) 1-1' }), 'El teléfono debe tener al menos 7 dígitos.');
  assert.equal(validarContacto({ customer_phone: '+57 (30) 1-12' }), null);
  // los 4 límites (T5): primero el largo, después el formato
  assert.equal(validarContacto({ customer_email: 'x'.repeat(151) }), 'El correo no puede tener más de 150 caracteres.');
  assert.equal(validarContacto({ customer_phone: '3'.repeat(51) }), 'El teléfono no puede tener más de 50 caracteres.');
  assert.equal(validarContacto({ customer_address: 'a'.repeat(256) }), 'La dirección es muy larga (máximo 255 caracteres).');
  assert.equal(validarContacto({ customer_city: 'c'.repeat(101) }), 'La ciudad es muy larga (máximo 100 caracteres).');
  // en el límite exacto pasa (medido sin los espacios de los bordes)
  assert.equal(validarContacto({ customer_address: ` ${'a'.repeat(255)} ` }), null);
  assert.equal(validarContacto({ customer_city: 'c'.repeat(100) }), null);
  assert.equal(validarContacto({ customer_email: `${'x'.repeat(142)}@test.co` }), null);
  assert.equal(validarContacto({ customer_phone: '3'.repeat(50) }), null);
  // un dato que no es texto
  assert.equal(validarContacto({ customer_phone: 3001112233 }), 'El dato «Teléfono» debe ser un texto.');
  // válidos
  assert.equal(validarContacto({ customer_email: ' Ana@Test.com ', customer_phone: '+57 300 111 2233' }), null);
  assert.equal(validarContacto({ customer_phone: '', customer_email: '', customer_address: '', customer_city: '' }), null,
    'borrar un dato es válido');
  assert.equal(validarContacto({}), null);
  assert.equal(validarContacto(null), null);
  // el orden es el del backend: teléfono, correo, dirección, ciudad
  assert.equal(validarContacto({ customer_email: 'mal', customer_phone: '12' }), 'El teléfono debe tener al menos 7 dígitos.');
  // otras claves se ignoran
  assert.equal(validarContacto({ customer_name: '', updated_by: 'x' }), null);
}

console.log('--- TEST 8 (T8B, R18 y rulings 2 y 5): avisoCorreccionContacto — el aviso después de PATCH /cliente ---');
{
  const SC = 'SC-20260800';
  // Las claves exactas de la respuesta de T5 (Fix report de la ronda 2).
  const base = {
    status: 'success', data: { numero: SC }, ficha_actualizada: true, documentos_actualizados: [],
    documentos_de_otro_cliente: [], confirmacion_anulada: false, estado_cambiado: false, enlaces_anulados: [],
    sin_cambios: false,
  };
  const A = 'Datos corregidos. Como cambió el correo o el teléfono del cliente, su confirmación quedó anulada: envíale la solicitud de nuevo.';
  const COT = 'Datos corregidos. Se anuló el enlace de la cotización COT-20260486 enviado al dato anterior: pásala a Borrador y envíala de nuevo.';
  const B = 'Datos corregidos. Se anuló el enlace que se había enviado al dato anterior: usa «Reenviar enlace de confirmación».';
  const CONFIRMACION = 'Datos corregidos. La confirmación anterior del cliente ya no vale; la cotización activa sigue igual.';
  const NORMAL = 'Datos del cliente corregidos.';

  // 1. La solicitud cambió de estado (volvió a Asignada o a Nueva): gana sobre los enlaces anulados.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true, enlaces_anulados: [SC] }),
    { texto: A, tono: 'info' });
  // T8B r1 (punto 7): si además se anuló el enlace de una cotización, el texto A lo completa (una o varias).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: [SC, 'COT-20260486'] }), {
    texto: `${A} Se anuló también el enlace de la cotización COT-20260486: pásala a Borrador y envíala de nuevo.`, tono: 'info',
  });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: [SC, 'COT-1', 'COT-2'] }), {
    texto: `${A} Se anularon también los enlaces de las cotizaciones COT-1 y COT-2: pásalas a Borrador y envíalas de nuevo.`,
    tono: 'info',
  });
  // … y los documentos de otro cliente siguen al final.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    enlaces_anulados: ['COT-9'], documentos_de_otro_cliente: ['PVEN-7'] }), {
    texto: `${A} Se anuló también el enlace de la cotización COT-9: pásala a Borrador y envíala de nuevo. No se cambió PVEN-7 porque es de otro cliente.`,
    tono: 'info',
  });
  // 2. Se anuló el enlace de una cotización: gana sobre el de la solicitud.
  assert.deepEqual(avisoCorreccionContacto({ ...base, enlaces_anulados: ['COT-20260486'] }), { texto: COT, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC, 'COT-20260486'] }),
    { texto: COT, tono: 'info' });
  // Varias cotizaciones (raro): en plural.
  assert.deepEqual(avisoCorreccionContacto({ ...base, enlaces_anulados: ['COT-1', 'COT-2'] }), {
    texto: 'Datos corregidos. Se anularon los enlaces de las cotizaciones COT-1 y COT-2 enviados al dato anterior: pásalas a Borrador y envíalas de nuevo.',
    tono: 'info',
  });
  // 3. Se anuló el enlace de la solicitud (sin cambio de estado).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC] }), { texto: B, tono: 'info' });
  // T8B r1 (punto 6): los enlaces se clasifican por el número (COT-…). Sin conocer el número de la solicitud, la SC no
  // pasa por cotización.
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, enlaces_anulados: [SC] }), { texto: B, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, data: {}, confirmacion_anulada: true, enlaces_anulados: [SC] }),
    { texto: B, tono: 'info' });
  const { data: _sinData, ...sinData } = base;
  assert.deepEqual(avisoCorreccionContacto({ ...sinData, confirmacion_anulada: true, enlaces_anulados: [SC] }), { texto: B, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...sinData, enlaces_anulados: ['COT-20260486'] }), { texto: COT, tono: 'info' });
  // 4. La confirmación anterior ya no vale (Confirmada con una cotización activa: el estado no cambia).
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true }), { texto: CONFIRMACION, tono: 'info' });
  // 5. Lo normal (solo la dirección o la ciudad, o una solicitud Asignada).
  assert.deepEqual(avisoCorreccionContacto(base), { texto: NORMAL, tono: 'ok' });
  assert.deepEqual(avisoCorreccionContacto({ status: 'success', data: { numero: SC } }), { texto: NORMAL, tono: 'ok' },
    'sin las claves nuevas: el aviso normal');

  // Ruling 5: los documentos de otro cliente que no se tocaron se dicen al final (uno o varios).
  assert.deepEqual(avisoCorreccionContacto({ ...base, documentos_de_otro_cliente: ['COT-5'] }),
    { texto: `${NORMAL} No se cambió COT-5 porque es de otro cliente.`, tono: 'info' });
  assert.deepEqual(avisoCorreccionContacto({ ...base, confirmacion_anulada: true, estado_cambiado: true,
    documentos_de_otro_cliente: ['COT-5', 'PVEN-7'] }),
  { texto: `${A} No se cambiaron COT-5 y PVEN-7 porque son de otro cliente.`, tono: 'info' });

  // Sin cambios: nada que avisar, salvo los documentos de otro cliente.
  assert.equal(avisoCorreccionContacto({ ...base, sin_cambios: true }), null);
  assert.deepEqual(avisoCorreccionContacto({ ...base, sin_cambios: true, documentos_de_otro_cliente: ['COT-5', 'COT-6', 'PVEN-7'] }),
    { texto: 'No se cambiaron COT-5, COT-6 y PVEN-7 porque son de otro cliente.', tono: 'info' });
  // Sin respuesta.
  assert.equal(avisoCorreccionContacto(null), null);
  assert.equal(avisoCorreccionContacto(undefined), null);
}

console.log('--- TEST 9 (T8B r2, punto 1): formularioDeEdicion y camposEditadosDeSolicitud — solo viaja lo que se editó ---');
{
  // La SC tal como estaba al abrir «Editar» (baseEdicion): sin asesor, tipo y modalidad sin valor guardado.
  const base = {
    advisor_name: null, advisor_user_id: null, tipo_solicitud: null, modalidad_pago: null, notas: 'Llamar antes',
    fecha_vencimiento: '2026-11-03', customer_phone: '3000000000', customer_email: null, customer_address: 'Calle 1',
    customer_city: 'Cali',
  };
  // Lo que muestra el formulario, con los valores por defecto de siempre.
  assert.deepEqual(formularioDeEdicion(base), {
    advisor_name: '', advisor_user_id: '', tipo_solicitud: 'Cotizacion de Producto', modalidad_pago: 'Contado',
    notas: 'Llamar antes', fecha_vencimiento: '2026-11-03', customer_phone: '3000000000', customer_email: '',
    customer_address: 'Calle 1', customer_city: 'Cali',
  });
  const form = formularioDeEdicion(base);

  // Nada cambió → {} (tampoco los valores por defecto que el formulario puso donde no había nada).
  assert.deepEqual(camposEditadosDeSolicitud(base, form), {});
  // Solo las notas.
  assert.deepEqual(camposEditadosDeSolicitud(base, { ...form, notas: 'Llamar después de las 3' }), { notas: 'Llamar después de las 3' });
  assert.deepEqual(camposEditadosDeSolicitud(base, { ...form, notas: '' }), { notas: '' }, 'borrar las notas también es un cambio');
  // Asesor asignado afuera («Asignarme» con el formulario abierto): la base y el formulario siguen sin asesor → no viaja,
  // así «Guardar» no deshace la asignación que llegó con la recarga silenciosa.
  assert.deepEqual(camposEditadosDeSolicitud(base, form), {});
  // Asesor cambiado en el formulario: viajan los dos campos.
  assert.deepEqual(camposEditadosDeSolicitud(base, { ...form, advisor_user_id: 7, advisor_name: 'ana@nebulae.co' }),
    { advisor_user_id: 7, advisor_name: 'ana@nebulae.co' });
  const conAsesor = { ...base, advisor_user_id: 7, advisor_name: 'ana@nebulae.co' };
  assert.deepEqual(camposEditadosDeSolicitud(conAsesor, formularioDeEdicion(conAsesor)), {});
  assert.deepEqual(camposEditadosDeSolicitud(conAsesor, { ...formularioDeEdicion(conAsesor), advisor_user_id: 9, advisor_name: 'luis@nebulae.co' }),
    { advisor_user_id: 9, advisor_name: 'luis@nebulae.co' });
  // Quitar el asesor ('' en el select) también viaja: '' frente a null es lo mismo solo cuando no cambió.
  assert.deepEqual(camposEditadosDeSolicitud(conAsesor, { ...formularioDeEdicion(conAsesor), advisor_user_id: '' }),
    { advisor_user_id: '', advisor_name: 'ana@nebulae.co' });
  // El mismo asesor como texto (el valor de un select) no es un cambio.
  assert.deepEqual(camposEditadosDeSolicitud(conAsesor, { ...formularioDeEdicion(conAsesor), advisor_user_id: '7' }), {});
  // Tipo y modalidad.
  assert.deepEqual(camposEditadosDeSolicitud(base, { ...form, tipo_solicitud: 'Seguimiento', modalidad_pago: 'Credito 30 dias' }),
    { tipo_solicitud: 'Seguimiento', modalidad_pago: 'Credito 30 dias' });
  // Los datos de contacto y la fecha no son de esta función (van por PATCH /cliente y fechaEditadaParaGuardar).
  assert.deepEqual(camposEditadosDeSolicitud(base, { ...form, customer_phone: '3001112233', fecha_vencimiento: '2026-12-01' }), {});
  // Una clave que no está en el formulario no se toca; sin base ni formulario, nada.
  const { notas: _sinNotas, ...formSinNotas } = form;
  assert.deepEqual(camposEditadosDeSolicitud(base, formSinNotas), {});
  assert.deepEqual(camposEditadosDeSolicitud(null, null), {});
}

console.log('--- TEST 10 (T10, H21 punto 7): itemDeTimelineCliente — el Timeline Unificado de la Agenda con los nombres reales del 360 ---');
{
  // Renglones tal como los arma get_customer_360_profile (crm.py): type, status_label y created_at. Los de siempre llevan
  // created_at sin 'Z' (UTC sin zona); el de la corrección (customer_update, T5) ya lleva 'Z'.
  const SOLICITUD = {
    type: 'customer_request', id: 12, numero: 'SC-20260800', status: 'CONFIRMADA', status_label: 'Solicitud SC-20260800',
    estado_label: 'CONFIRMADA', color: 'indigo', created_at: '2026-10-04T14:03:11.123456',
    description: 'Solicitud de cliente SC-20260800 (Confirmada)',
  };
  const CORRECCION = {
    type: 'customer_update', id: 41, status: 'UPDATED', status_label: 'Datos del cliente actualizados', color: 'purple',
    created_at: '2026-10-04T14:05:00.654321Z',
    description: 'Datos de contacto corregidos desde la solicitud SC-20260800: Teléfono, Correo',
    user_name: 'asesor@nebulae.co',
    cambios: [
      { campo: 'phone', etiqueta: 'Teléfono', antes: '3000000000', despues: '3001112233' },
      { campo: 'email', etiqueta: 'Correo', antes: 'ana.vieja@test.com', despues: 'ana.nueva@test.com' },
    ],
  };
  const CREADO = {
    type: 'created', id: 3, status: 'CREATED', status_label: 'Cliente creado', color: 'purple', created_at: null,
    total: 0, lines_count: 0, description: 'Ficha del cliente registrada en el sistema.',
  };

  // Lee type, status_label y created_at (antes la pantalla leía event_type, title y date, que ya no llegan).
  const s = itemDeTimelineCliente(SOLICITUD);
  assert.equal(s.tipo, 'customer_request');
  assert.equal(s.titulo, 'Solicitud SC-20260800');
  assert.deepEqual([s.autor, s.cambios], [null, []], 'un renglón normal no trae autor ni cambios');
  // La fecha sin zona se lee como UTC (comoUTC), no como hora local corrida 5 h en Colombia.
  assert.equal(s.fecha, '2026-10-04T14:03:11.123456Z');
  assert.equal(new Date(s.fecha).toISOString(), '2026-10-04T14:03:11.123Z');

  // La corrección del cliente: título del backend, fecha con 'Z' intacta, autor y el detalle antes → después.
  const c = itemDeTimelineCliente(CORRECCION);
  assert.equal(c.tipo, 'customer_update');
  assert.equal(c.titulo, 'Datos del cliente actualizados');
  assert.equal(c.fecha, '2026-10-04T14:05:00.654321Z');
  assert.equal(c.autor, 'asesor@nebulae.co');
  assert.deepEqual(c.cambios, CORRECCION.cambios);

  // BODEGA y COMPRAS reciben cambios = [] (el antes → después trae el contacto): no hay nada de contacto que pintar;
  // el autor y la descripción (solo etiquetas y número de la SC) siguen ahí.
  const sinContacto = itemDeTimelineCliente({ ...CORRECCION, cambios: [] });
  assert.deepEqual(sinContacto.cambios, []);
  assert.equal(sinContacto.autor, 'asesor@nebulae.co');
  // cambios ausente o que no es una lista → [] (nunca rompe el renglón).
  for (const raro of [undefined, null, 'x', 5, { campo: 'phone' }]) {
    assert.deepEqual(itemDeTimelineCliente({ ...CORRECCION, cambios: raro }).cambios, []);
  }

  // H14: «Cliente creado» no tiene fecha; no se inventa una (antes salía «Hoy»).
  const creado = itemDeTimelineCliente(CREADO);
  assert.equal(creado.titulo, 'Cliente creado');
  assert.equal(creado.fecha, null);
  for (const vacio of ['', '   ', undefined]) {
    assert.equal(itemDeTimelineCliente({ ...CREADO, created_at: vacio }).fecha, null);
  }
  // Un texto que no es una fecha tampoco sale como «Invalid Date».
  assert.equal(itemDeTimelineCliente({ ...SOLICITUD, created_at: 'no es fecha' }).fecha, null);
  // Una fecha de calendario (sin hora) o con zona se deja igual.
  assert.equal(itemDeTimelineCliente({ ...SOLICITUD, created_at: '2026-10-04' }).fecha, '2026-10-04');
  assert.equal(itemDeTimelineCliente({ ...SOLICITUD, created_at: '2026-10-04T09:00:00-05:00' }).fecha, '2026-10-04T09:00:00-05:00');

  // Los nombres viejos siguen valiendo de respaldo (event_type, title, date)…
  const viejo = itemDeTimelineCliente({ event_type: 'calendar_event', title: 'Reunión de seguimiento', date: '2026-10-03 09:30:00' });
  assert.deepEqual([viejo.tipo, viejo.titulo, viejo.fecha], ['calendar_event', 'Reunión de seguimiento', '2026-10-03T09:30:00Z']);
  // …pero los del backend ganan cuando vienen los dos.
  const ambos = itemDeTimelineCliente({
    type: 'payment', event_type: 'otro', status_label: 'Anticipo', title: 'viejo',
    created_at: '2026-10-04T10:00:00', date: '2026-01-01T00:00:00',
  });
  assert.deepEqual([ambos.tipo, ambos.titulo, ambos.fecha], ['payment', 'Anticipo', '2026-10-04T10:00:00Z']);
  // Un texto vacío o solo espacios cuenta como ausente: pasa al siguiente nombre.
  assert.equal(itemDeTimelineCliente({ type: 'quotation', status_label: '  ', title: 'Cotización COT-1' }).titulo, 'Cotización COT-1');
  assert.equal(itemDeTimelineCliente({ type: 'quotation', status_label: 'Cotización COT-2', user_name: '   ' }).autor, null);

  // Sin título de ningún tipo: el título de respaldo en español de cada uno de los 11 tipos que arma el 360 (nunca el
  // código crudo ni un título vacío)…
  const RESPALDO = {
    customer_request: 'Solicitud', quotation: 'Cotización', sale_order: 'Pedido', sale_order_legacy: 'Pedido anterior',
    payment: 'Pago', delivery: 'Entrega', return: 'Devolución', agenda_activity: 'Actividad de agenda',
    calendar_event: 'Evento de calendario', customer_update: 'Datos del cliente actualizados', created: 'Cliente creado',
  };
  assert.deepEqual(TITULOS_DE_RESPALDO, RESPALDO);
  assert.ok(Object.isFrozen(TITULOS_DE_RESPALDO), 'el mapa es inmutable');
  for (const [tipo, titulo] of Object.entries(RESPALDO)) {
    assert.equal(itemDeTimelineCliente({ type: tipo }).titulo, titulo);
    assert.equal(itemDeTimelineCliente({ type: tipo, status_label: null, title: '  ' }).titulo, titulo);
    assert.equal(itemDeTimelineCliente({ event_type: tipo }).titulo, titulo, 'también con el nombre viejo del tipo');
    assert.equal(itemDeTimelineCliente({ type: tipo, status_label: 'Del servidor' }).titulo, 'Del servidor',
      'el título del servidor gana sobre el de respaldo');
  }
  // …y solo un tipo desconocido se humaniza; sin tipo, «Evento». Una clave del prototipo no es un tipo conocido.
  assert.equal(itemDeTimelineCliente({ type: 'tipo_nuevo' }).titulo, 'Tipo nuevo');
  assert.equal(itemDeTimelineCliente({ type: 'constructor' }).titulo, 'Constructor');
  assert.equal(itemDeTimelineCliente({ description: 'algo' }).titulo, 'Evento');
  assert.equal(itemDeTimelineCliente({}).titulo, 'Evento');
  // Una entrada que no es un objeto no rompe la pantalla.
  for (const nada of [null, undefined, 'texto', 7]) {
    assert.deepEqual(itemDeTimelineCliente(nada), { tipo: '', titulo: 'Evento', fecha: null, autor: null, cambios: [] });
  }
}

console.log('OK test_datos_cliente');
