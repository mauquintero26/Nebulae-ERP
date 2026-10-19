/**
 * frontend/tests/test_avisos.mjs
 * H49 + C3/R10 (Bloque 2, T1A): textos de error legibles para los avisos del sistema.
 * - textoDeDetalle: string tal cual; arreglo de errores de validacion (pydantic) traducido con ETIQUETAS_CAMPO;
 *   {mensaje}/{message}/{detail}; vacio -> 'El servidor respondió con un error (N)...'; 'Not Found' e
 *   'Internal Server Error' en español; el texto viejo '1 validation error: ...' nunca se muestra crudo.
 * - errorDeRespuesta(status, body): Error con message legible, .status y .detail (el 409 ANULA_CONFIRMACION de la
 *   calculadora se detecta con err.status y err.detail.codigo). Usa body.errores (el 400 de validacion de main.py).
 * - textoDeError: sin conexion, '[object Object]', 'Error: ' repetido, prefijo sin repetir.
 * - duracionAviso, agregarAviso (maximo 3, sin duplicados) y normalizarTono ('err' -> error, desconocido -> info).
 */

import assert from 'node:assert/strict';
import {
  MENSAJE_SIN_CONEXION, MENSAJE_GENERICO, ETIQUETAS_CAMPO,
  textoDeDetalle, textoDeError, duracionAviso, agregarAviso, errorDeRespuesta, normalizarTono, recargarTrasError,
  esErrorDeValidacion,
} from '../src/lib/avisos.js';

const DATOS_INVALIDOS = 'Los datos enviados no son válidos. Revisa el formulario e intenta de nuevo.';
const corto = (campo, min = 5) => ({
  type: 'string_too_short', loc: ['body', campo], msg: `String should have at least ${min} characters`,
  ctx: { min_length: min },
});

console.log('--- TEST 1: constantes ---');
{
  assert.equal(MENSAJE_SIN_CONEXION, 'No se pudo conectar con el servidor. Revisa tu conexión e intenta de nuevo.');
  assert.equal(MENSAJE_GENERICO, 'Ocurrió un error inesperado. Intenta de nuevo.');
  assert.deepEqual(ETIQUETAS_CAMPO, {
    razon: 'Motivo', motivo: 'Motivo', cancellation_reason: 'Motivo de la cancelación', referencia: 'Referencia',
    monto: 'Monto', metodo_pago: 'Método de pago', fecha_pago: 'Fecha del pago', customer_name: 'Cliente',
    first_name: 'Nombre', name: 'Nombre', email: 'Correo', phone: 'Teléfono',
  });
}

console.log('--- TEST 2: textoDeDetalle con texto ---');
{
  const texto = 'No se puede cancelar: la solicitud tiene la cotización COT-1 activa.';
  assert.equal(textoDeDetalle(texto, 409), texto, 'un string se devuelve tal cual');
  assert.equal(textoDeDetalle({ message: 'x' }), 'x');
  assert.equal(textoDeDetalle({ detail: 'y' }, 400), 'y');
  assert.equal(textoDeDetalle({ mensaje: 'x' }), 'x', 'R10: un objeto con mensaje devuelve ese texto');
  assert.equal(textoDeDetalle({ codigo: 'ANULA_CONFIRMACION', mensaje: 'm', cambios: ['Total'] }, 409), 'm');
}

console.log('--- TEST 3: textoDeDetalle con la lista de errores de validacion ---');
{
  assert.equal(textoDeDetalle([corto('razon')], 422), 'Motivo: debe tener al menos 5 caracteres.');
  assert.equal(textoDeDetalle([{ type: 'missing', loc: ['body', 'referencia'], msg: 'Field required' }], 422),
    'Falta el dato «Referencia».');
  assert.equal(
    textoDeDetalle([{ type: 'string_too_long', loc: ['body', 'phone'], msg: 'x', ctx: { max_length: 20 } }], 400),
    'Teléfono: máximo 20 caracteres.');
  assert.equal(
    textoDeDetalle([{ type: 'greater_than', loc: ['body', 'monto'], msg: 'x', ctx: { gt: 0 } }], 400),
    'Monto: debe ser mayor que 0.');
  // Ruling de la ronda 1: 'mayor o igual a' (el 'mayor que' literal de H49 era falso con ge).
  assert.equal(
    textoDeDetalle([{ type: 'greater_than_equal', loc: ['body', 'productos', 0, 'cantidad'], msg: 'x', ctx: { ge: 1 } }], 400),
    'cantidad: debe ser mayor o igual a 1.', 'sin etiqueta usa el ultimo string de loc');
  assert.equal(
    textoDeDetalle([{ type: 'less_than', loc: ['body', 'monto'], msg: 'x', ctx: { lt: 100 } }], 400),
    'Monto: debe ser menor que 100.');
  assert.equal(
    textoDeDetalle([{ type: 'less_than_equal', loc: ['body', 'monto'], msg: 'x', ctx: { le: 365 } }], 400),
    'Monto: debe ser menor o igual a 365.');
  assert.equal(
    textoDeDetalle([corto('razon'), { type: 'missing', loc: ['body', 'monto'], msg: 'Field required' }], 400),
    'Motivo: debe tener al menos 5 caracteres. Falta el dato «Monto».', 'dos errores se unen con un espacio');
  assert.equal(
    textoDeDetalle([{ type: 'int_parsing', loc: ['body', 'monto'], msg: 'Input should be a valid integer' }], 400),
    'Monto: debe ser un número.');
  assert.equal(
    textoDeDetalle([{ type: 'float_parsing', loc: ['body', 'monto'], msg: 'Input should be a valid number' }], 400),
    'Monto: debe ser un número.');
  assert.equal(
    textoDeDetalle([{ type: 'literal_error', loc: ['body', 'metodo_pago'], msg: "Input should be 'A' or 'B'" }], 400),
    'Método de pago: valor no permitido.');
  assert.equal(
    textoDeDetalle([{ type: 'enum', loc: ['query', 'estado'], msg: "Input should be 'X'" }], 400),
    'estado: valor no permitido.');
  assert.equal(
    textoDeDetalle([{ type: 'string_type', loc: ['body', 'email'], msg: 'Input should be a valid string' }], 400),
    'Correo: Input should be a valid string', 'un type desconocido usa msg');
  assert.equal(
    textoDeDetalle([{ type: 'value_error', loc: ['body', 'tipo'], msg: 'Value error, tipo debe ser uno de: ANTICIPO' }], 400),
    'Tipo debe ser uno de: ANTICIPO', "sin 'Value error, ' y sin repetir el campo cuando msg ya empieza por el");
  assert.equal(
    textoDeDetalle([{ type: 'value_error', loc: ['body', 'motivo'], msg: 'Value error, motivo vacío' }], 400),
    'Motivo vacío', 'tampoco se repite cuando msg empieza por el nombre crudo de un campo con etiqueta');
  // Raices de loc: solas no son un campo.
  assert.equal(textoDeDetalle([{ type: 'missing', loc: ['body'], msg: 'Field required' }], 400), 'Falta un dato obligatorio.');
  assert.equal(
    textoDeDetalle([{ type: 'json_invalid', loc: ['body', 7], msg: 'JSON decode error', ctx: { error: 'Expecting value' } }], 400),
    DATOS_INVALIDOS, 'JSON malformado -> la frase generica');
  // Un nombre de campo que coincide con una propiedad de Object.prototype no toma la funcion del prototipo.
  assert.equal(textoDeDetalle([{ type: 'missing', loc: ['body', 'constructor'], msg: 'Field required' }], 400),
    'Falta el dato «constructor».');
  assert.equal(textoDeDetalle([{ type: 'missing', loc: ['body', 'toString'], msg: 'Field required' }], 400),
    'Falta el dato «toString».');
  // ctx que no es numero: no se arma la frase con el limite, se usa msg.
  assert.equal(
    textoDeDetalle([{ type: 'string_too_short', loc: ['body', 'razon'], msg: 'muy corto', ctx: { min_length: '5' } }], 400),
    'Motivo: muy corto');
  assert.equal(
    textoDeDetalle([{ type: 'greater_than', loc: ['body', 'monto'], msg: 'Input should be greater than 0', ctx: {} }], 400),
    'Monto: Input should be greater than 0');
  // C3/R10: lista sin loc -> los msg unidos con un espacio.
  assert.equal(textoDeDetalle([{ msg: 'a' }, { msg: 'b' }], 400), 'a b');
}

console.log('--- TEST 3b: normalizarTono ---');
{
  const avisos = [];
  const warnOriginal = console.warn;
  console.warn = (...args) => { avisos.push(args.join(' ')); };
  try {
    assert.equal(normalizarTono(undefined), 'ok', 'sin tono: ok');
    assert.equal(normalizarTono('ok'), 'ok');
    assert.equal(normalizarTono('error'), 'error');
    assert.equal(normalizarTono('info'), 'info');
    assert.equal(normalizarTono('err'), 'error', "'err' (adaptador de solicitud-client) es error");
    assert.equal(avisos.length, 0, 'los tonos conocidos no avisan');
    assert.equal(normalizarTono('exito'), 'info', 'uno desconocido cae en info, no en el verde de exito');
    assert.equal(avisos.length, 1);
    assert.ok(avisos[0].includes('exito'), 'el console.warn dice el valor recibido');
  } finally {
    console.warn = warnOriginal;
  }
}

console.log('--- TEST 4: textoDeDetalle sin detalle y textos tecnicos del servidor ---');
{
  const vacio = textoDeDetalle(undefined, 500);
  assert.ok(vacio.includes('(500)'), vacio);
  assert.equal(vacio, 'El servidor respondió con un error (500). Intenta de nuevo.');
  assert.equal(textoDeDetalle('', 502), 'El servidor respondió con un error (502). Intenta de nuevo.');
  assert.equal(textoDeDetalle([], 503), 'El servidor respondió con un error (503). Intenta de nuevo.');
  assert.equal(textoDeDetalle('Internal Server Error', 500), 'El servidor respondió con un error (500). Intenta de nuevo.');
  assert.equal(textoDeDetalle('Not Found', 404), 'No se encontró el registro (404).');
  const viejo = "1 validation error:\n  {'type': 'string_too_short', 'loc': ('body', 'razon'), 'input': 'Qzw'}\n\n  File \"erp_ventas.py\", line 2935";
  assert.equal(textoDeDetalle(viejo, 400), DATOS_INVALIDOS, 'el formato viejo nunca se muestra crudo');
  assert.equal(textoDeDetalle('2 validation errors:\n ...', 400), DATOS_INVALIDOS);
}

console.log('--- TEST 5: errorDeRespuesta (C3/R10) ---');
{
  let err = errorDeRespuesta(409, { detail: 'No se puede: tiene un pedido activo.' });
  assert.ok(err instanceof Error);
  assert.equal(err.message, 'No se puede: tiene un pedido activo.');
  assert.equal(err.status, 409);
  assert.equal(err.detail, 'No se puede: tiene un pedido activo.');

  err = errorDeRespuesta(409, { detail: { codigo: 'ANULA_CONFIRMACION', mensaje: 'm', cambios: ['Total'] } });
  assert.equal(err.message, 'm');
  assert.equal(err.status, 409);
  assert.equal(err.detail.codigo, 'ANULA_CONFIRMACION', 'la calculadora detecta el 409 con .detail.codigo');

  err = errorDeRespuesta(422, { detail: [{ msg: 'a' }, { msg: 'b' }] });
  assert.equal(err.message, 'a b');
  assert.equal(err.status, 422);

  err = errorDeRespuesta(500, {});
  assert.ok(err.message.includes('(500)'), err.message);
  assert.equal(err.status, 500);
  assert.equal(err.detail, null, 'sin detail queda null');

  err = errorDeRespuesta(500, { status: 'error', message: 'Internal Server Error' });
  assert.equal(err.message, 'El servidor respondió con un error (500). Intenta de nuevo.');
  assert.equal(errorDeRespuesta(404, { detail: 'Not Found' }).message, 'No se encontró el registro (404).');
  assert.equal(errorDeRespuesta(400, { status: 'error', message: 'Solo texto' }).message, 'Solo texto');
  assert.equal(errorDeRespuesta(500, null).message, 'El servidor respondió con un error (500). Intenta de nuevo.');

  // El 400 de validacion de backend/main.py: el texto sale de `errores`, no de la frase generica.
  err = errorDeRespuesta(400, {
    status: 'error', message: DATOS_INVALIDOS,
    errores: [{ type: 'string_too_short', loc: ['body', 'razon'], msg: 'String should have at least 5 characters', ctx: { min_length: 5 } }],
  });
  assert.equal(err.message, 'Motivo: debe tener al menos 5 caracteres.');
  assert.equal(err.status, 400);
  assert.equal(err.detail, null);
  assert.equal(errorDeRespuesta(400, { status: 'error', message: DATOS_INVALIDOS, errores: [] }).message, DATOS_INVALIDOS);

  // Un backend viejo que todavia manda str(exc): nunca el texto crudo.
  err = errorDeRespuesta(400, { status: 'error', message: "1 validation error:\n  {'type': 'missing', 'input': 'x'}" });
  assert.equal(err.message, DATOS_INVALIDOS);
}

console.log('--- TEST 6: textoDeError ---');
{
  assert.equal(textoDeError(new Error('Failed to fetch')), MENSAJE_SIN_CONEXION);
  assert.equal(textoDeError(new TypeError('NetworkError when attempting to fetch resource.')), MENSAJE_SIN_CONEXION);
  assert.equal(textoDeError(new TypeError('Load failed')), MENSAJE_SIN_CONEXION);
  assert.equal(textoDeError(new Error('[object Object]')), MENSAJE_GENERICO);
  assert.equal(textoDeError(new Error('')), MENSAJE_GENERICO);
  assert.equal(textoDeError(new Error('Error: algo'), 'No se pudo X'), 'No se pudo X: algo');
  assert.equal(textoDeError(new Error('Error: Error: algo')), 'algo', "nunca 'Error: Error: …'");
  assert.equal(textoDeError(new Error('No se pudo X: algo'), 'No se pudo X'), 'No se pudo X: algo', 'prefijo sin repetir');
  assert.equal(textoDeError('texto'), 'texto');
  assert.equal(textoDeError(null), MENSAJE_GENERICO);
  assert.equal(textoDeError(undefined), MENSAJE_GENERICO);
  assert.equal(textoDeError({ message: { a: 1 } }), MENSAJE_GENERICO);
  assert.equal(textoDeError(new TypeError('Failed to fetch'), 'No se pudieron guardar los cambios'),
    'No se pudieron guardar los cambios: ' + MENSAJE_SIN_CONEXION);
  assert.equal(textoDeError(errorDeRespuesta(400, { detail: [corto('razon')] }), 'No se pudo cancelar'),
    'No se pudo cancelar: Motivo: debe tener al menos 5 caracteres.');
  assert.equal(textoDeError(new Error('1 validation error:\n {...}')), DATOS_INVALIDOS);
  // Pantallas con fetch propio que hacen throw new Error(data.detail || data.message) ante el 500 global.
  assert.equal(textoDeError(new Error('Internal Server Error')), 'El servidor respondió con un error (500). Intenta de nuevo.');
}

console.log('--- TEST 7: duracionAviso ---');
{
  assert.equal(duracionAviso('ok', 'x'), 4000);
  assert.equal(duracionAviso('info', 'x'.repeat(400)), 4000);
  assert.equal(duracionAviso('error', 'x'), 7000);
  assert.equal(duracionAviso('error', 'x'.repeat(150)), 9000);
  assert.equal(duracionAviso('error', 'x'.repeat(400)), 15000);
  assert.equal(duracionAviso('error', undefined), 7000);
}

console.log('--- TEST 8: agregarAviso ---');
{
  let lista = [];
  for (let i = 1; i <= 4; i++) lista = agregarAviso(lista, { id: i, texto: `aviso ${i}`, tono: 'ok' });
  assert.deepEqual(lista.map((a) => a.id), [2, 3, 4], 'el cuarto aviso deja 3 (los ultimos)');

  const antes = lista;
  lista = agregarAviso(lista, { id: 5, texto: 'aviso 2', tono: 'ok' });
  assert.deepEqual(lista.map((a) => a.id), [3, 4, 5], 'un texto y tono repetidos no duplican y quedan al final');
  assert.equal(lista.filter((a) => a.texto === 'aviso 2').length, 1);
  assert.deepEqual(antes.map((a) => a.id), [2, 3, 4], 'no modifica la lista recibida');

  lista = agregarAviso(lista, { id: 6, texto: 'aviso 3', tono: 'error' });
  assert.deepEqual(lista.map((a) => a.id), [4, 5, 6], 'mismo texto con otro tono es otro aviso');
  assert.equal(agregarAviso([{ id: 1, texto: 'a', tono: 'ok' }], { id: 2, texto: 'b', tono: 'ok' }, 1).length, 1);
}

console.log('--- TEST 9: recargarTrasError (B2-T9A ronda 1: una sola regla para SC, COT y PVEN) ---');
{
  // 400 / 409: el documento cambio en otra pantalla; sin status: la red se corto y la operacion pudo hacerse igual.
  for (const status of [400, 409]) {
    assert.equal(recargarTrasError(errorDeRespuesta(status, { detail: 'Cambió en otra pantalla' })), true, String(status));
  }
  assert.equal(recargarTrasError(errorDeRespuesta(409, { detail: { codigo: 'ANULA_CONFIRMACION', estado: 'CONFIRMADA' } })), true);
  assert.equal(recargarTrasError(new TypeError('Failed to fetch')), true, 'error de red sin status');
  assert.equal(recargarTrasError(null), true);
  assert.equal(recargarTrasError(undefined), true);
  // 401 (SesionVencidaError de api.ts: status 401), 403, 404, 422 y 500 no recargan.
  const sesionVencida = Object.assign(new Error('Tu sesión venció. Inicia sesión nuevamente para continuar.'),
    { name: 'SesionVencidaError', status: 401 });
  assert.equal(recargarTrasError(sesionVencida), false, 'SesionVencidaError');
  for (const status of [401, 403, 404, 422, 500]) {
    assert.equal(recargarTrasError(errorDeRespuesta(status, {})), false, String(status));
  }
}

console.log('--- TEST 10 (revisión final, F2): el 403 técnico de require_roles se traduce ---');
{
  const { MENSAJE_SIN_PERMISO, esDetalle403Tecnico } = await import('../src/lib/avisos.js');
  assert.equal(MENSAJE_SIN_PERMISO, 'No tienes permiso para esta acción.');
  const ROL = "Rol 'Finanzas' (normalizado: 'FINANZAS') no autorizado para esta operación. Roles requeridos: ADMIN, ASESOR";
  assert.equal(textoDeDetalle(ROL, 403), MENSAJE_SIN_PERMISO);
  const err = errorDeRespuesta(403, { detail: ROL });
  assert.equal(err.message, MENSAJE_SIN_PERMISO);
  assert.equal(err.detail, ROL, 'el detail crudo se conserva (el Chatter decide con él)');
  assert.equal(textoDeError(err, 'No se pudo guardar'), `No se pudo guardar: ${MENSAJE_SIN_PERMISO}`);
  // Los 403 en inglés de FastAPI son el mismo caso técnico.
  for (const texto of ['Not authenticated', 'Not enough permissions', 'Forbidden']) {
    assert.equal(textoDeDetalle(texto, 403), MENSAJE_SIN_PERMISO, texto);
  }
  // Solo ese patrón: un 403 con otro texto legible se queda como está.
  const LEGIBLE = 'Solo un asesor o un administrador puede registrar un contacto con el cliente: deja una nota interna.';
  assert.equal(textoDeDetalle(LEGIBLE, 403), LEGIBLE);
  assert.equal(errorDeRespuesta(403, { detail: LEGIBLE }).message, LEGIBLE);
  // Y solo con el 403: con otro status el texto no se adivina.
  assert.equal(textoDeDetalle(ROL, 400), ROL);
  assert.equal(esDetalle403Tecnico(ROL), true);
  assert.equal(esDetalle403Tecnico(`  ${ROL}`), true, 'con espacios delante');
  for (const v of [LEGIBLE, '', null, undefined, 403, { detail: ROL }]) assert.equal(esDetalle403Tecnico(v), false, String(v));
}

console.log('--- TEST 11 (revisión final, B10): el 500 de /crm/products/search se ve en línea, sin «no está en el catálogo» ---');
{
  const { readFileSync } = await import('node:fs');
  const err = errorDeRespuesta(500, { detail: 'No se pudo buscar en el catálogo. Intenta de nuevo.' });
  assert.equal(textoDeError(err, 'No se pudo buscar'), 'No se pudo buscar en el catálogo. Intenta de nuevo.');
  const buscador = readFileSync(new URL('../src/app/dashboard/ventas/solicitud/buscador-producto.tsx', import.meta.url), 'utf8');
  // El error de la búsqueda va a errorBusqueda (role="alert") y el aviso «no está en el catálogo» exige que no lo haya.
  assert.ok(buscador.includes("catch (err) { error = textoDeError(err, 'No se pudo buscar'); }"), 'el catch arma el error');
  assert.ok(buscador.includes('setErrorBusqueda(error)') && buscador.includes('setOpen(!error); setSearched(!error);'));
  assert.ok(buscador.includes('{open && searched && !errorBusqueda && results.length === 0 && escrito.length > 2 && ('));
}

console.log('--- TEST 12 (B3 T16 r1): esErrorDeValidacion, el 422 se muestra en línea y no como aviso ---');
{
  assert.equal(esErrorDeValidacion(errorDeRespuesta(422, { detail: 'Los recordatorios deben ser entre 1 y 5.' })), true);
  for (const status of [400, 403, 404, 409, 500]) {
    assert.equal(esErrorDeValidacion(errorDeRespuesta(status, { detail: 'x' })), false, String(status));
  }
  for (const nada of [new Error('Failed to fetch'), null, undefined, 'x', { status: '422' }]) {
    assert.equal(esErrorDeValidacion(nada), false, String(nada));
  }
}

console.log('✓ Todas las pruebas de avisos pasaron.');
