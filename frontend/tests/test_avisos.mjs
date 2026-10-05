/**
 * frontend/tests/test_avisos.mjs
 * H49 + C3/R10 (Bloque 2, T1A): textos de error legibles para los avisos del sistema.
 * - textoDeDetalle: string tal cual; arreglo de errores de validacion (pydantic) traducido con ETIQUETAS_CAMPO;
 *   {mensaje}/{message}/{detail}; vacio -> 'El servidor respondió con un error (N)...'; 'Not Found' e
 *   'Internal Server Error' en español; el texto viejo '1 validation error: ...' nunca se muestra crudo.
 * - errorDeRespuesta(status, body): Error con message legible, .status y .detail (el 409 ANULA_CONFIRMACION de la
 *   calculadora se detecta con err.status y err.detail.codigo). Usa body.errores (el 400 de validacion de main.py).
 * - textoDeError: sin conexion, '[object Object]', 'Error: ' repetido, prefijo sin repetir.
 * - duracionAviso y agregarAviso (maximo 3, sin duplicados).
 */

import assert from 'node:assert/strict';
import {
  MENSAJE_SIN_CONEXION, MENSAJE_GENERICO, ETIQUETAS_CAMPO,
  textoDeDetalle, textoDeError, duracionAviso, agregarAviso, errorDeRespuesta,
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
  assert.equal(
    textoDeDetalle([{ type: 'greater_than_equal', loc: ['body', 'productos', 0, 'cantidad'], msg: 'x', ctx: { ge: 1 } }], 400),
    'cantidad: debe ser mayor que 1.', 'sin etiqueta usa el ultimo string de loc');
  assert.equal(
    textoDeDetalle([corto('razon'), { type: 'missing', loc: ['body', 'monto'], msg: 'Field required' }], 400),
    'Motivo: debe tener al menos 5 caracteres. Falta el dato «Monto».', 'dos errores se unen con un espacio');
  assert.equal(
    textoDeDetalle([{ type: 'int_parsing', loc: ['body', 'email'], msg: 'Input should be a valid integer' }], 400),
    'Correo: Input should be a valid integer', 'un type desconocido usa msg');
  assert.equal(
    textoDeDetalle([{ type: 'value_error', loc: ['body', 'tipo'], msg: 'Value error, tipo debe ser uno de: ANTICIPO' }], 400),
    'tipo: tipo debe ser uno de: ANTICIPO', "el 'Value error, ' de pydantic no se muestra");
  // C3/R10: lista sin loc -> los msg unidos con un espacio.
  assert.equal(textoDeDetalle([{ msg: 'a' }, { msg: 'b' }], 400), 'a b');
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

console.log('✓ Todas las pruebas de avisos pasaron.');
