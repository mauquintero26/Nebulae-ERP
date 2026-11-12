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
  // 401 (SesionVencidaError de api.ts: status 401), 403, 404 y 500 no recargan.
  const sesionVencida = Object.assign(new Error('Tu sesión venció. Inicia sesión nuevamente para continuar.'),
    { name: 'SesionVencidaError', status: 401 });
  assert.equal(recargarTrasError(sesionVencida), false, 'SesionVencidaError');
  for (const status of [401, 403, 404, 500]) {
    assert.equal(recargarTrasError(errorDeRespuesta(status, {})), false, String(status));
  }
  // B4 T24 (F8, ruling del controlador; D27): el 422 también recarga, SIN mirar el detail. El 422 de transición del PATCH de estado
  // (_validar_transicion_pedido, erp_ventas.py) es el conflicto real del tablero de pedidos: recargar el origen y el destino no hace
  // daño y es más robusto que comparar textos. Cualquier 422 (también uno de validación de campos o sin detail).
  const transicion = errorDeRespuesta(422, { detail: 'No se puede pasar de ENTREGADO a EN_PROCESO.' });
  assert.equal(recargarTrasError(transicion), true, 'el 422 de transición');
  assert.equal(recargarTrasError(errorDeRespuesta(422, { detail: [{ type: 'missing', loc: ['body', 'motivo'], msg: 'Field required' }] })), true, 'un 422 de validación');
  assert.equal(recargarTrasError(errorDeRespuesta(422, {})), true, 'un 422 sin detail');
  assert.equal(recargarTrasError({ status: 422 }), true);
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

console.log('--- TEST 13 (revisión final B3, F2: M45): las frases por defecto de Starlette salen en español ---');
{
  // Un 405 (una ruta o un API_URL mal configurados) salía en inglés, también en la página pública del cliente.
  assert.equal(textoDeDetalle('Method Not Allowed', 405), 'El servidor respondió con un error (405). Intenta de nuevo.');
  const FRASES = [['Bad Request', 400], ['Unauthorized', 401], ['Method Not Allowed', 405], ['Not Acceptable', 406],
    ['Conflict', 409], ['Unsupported Media Type', 415], ['Unprocessable Entity', 422], ['Too Many Requests', 429],
    ['Bad Gateway', 502], ['Service Unavailable', 503], ['Gateway Timeout', 504]];
  for (const [frase, status] of FRASES) {
    assert.equal(textoDeDetalle(frase, status), `El servidor respondió con un error (${status}). Intenta de nuevo.`, frase);
    assert.equal(textoDeDetalle(` ${frase} `, status), `El servidor respondió con un error (${status}). Intenta de nuevo.`);
    assert.equal(errorDeRespuesta(status, { detail: frase }).message,
      `El servidor respondió con un error (${status}). Intenta de nuevo.`, `${frase} por errorDeRespuesta`);
  }
  // Sin status, el genérico.
  assert.equal(textoDeDetalle('Bad Gateway'), MENSAJE_GENERICO);
  // Las reglas de antes siguen primero: 'Not Found' con su frase y el 403 técnico como «sin permiso».
  assert.equal(textoDeDetalle('Not Found', 404), 'No se encontró el registro (404).');
  assert.equal(textoDeDetalle('Forbidden', 403), 'No tienes permiso para esta acción.');
  // Un texto del servidor en español, o una frase parecida pero no la de Starlette, queda como está.
  assert.equal(textoDeDetalle('La cotización cambió mientras la reenviabas.', 409), 'La cotización cambió mientras la reenviabas.');
  assert.equal(textoDeDetalle('conflict', 409), 'conflict', 'solo la frase exacta');
}

// ── B4 T23A r1 (I1, I2): avisoDeFuente — el aviso de una fuente de una pantalla que falló.
{
  const av = await import('../src/lib/avisos.js');
  const e403 = Object.assign(new Error("Rol 'BODEGA' (normalizado: 'BODEGA') no autorizado para esta operación. Roles requeridos: ADMIN, ASESOR"), { status: 403 });
  const e500 = Object.assign(new Error('Error del servidor'), { status: 500 });
  assert.equal(av.avisoDeFuente(null, 'No se pudo'), null);
  assert.equal(av.avisoDeFuente(undefined, 'No se pudo'), null);
  // 403: es un tema de permiso, sin «Reintentar» (volver a pedir no lo cambia) y nunca el 403 técnico de require_roles.
  assert.deepEqual(av.avisoDeFuente(e403, 'No se pudieron cargar los indicadores'), { tipo: 'permiso', texto: 'No tienes permiso para ver esto.', reintentar: false });
  // Cualquier otro error: la falla con el detalle del servidor y «Reintentar».
  // B4 T24 (F46, D27): el texto de una falla es textoAvisoFuente (con su punto final, como el Dashboard).
  assert.deepEqual(av.avisoDeFuente(e500, 'No se pudieron cargar los indicadores'), { tipo: 'carga', texto: 'No se pudieron cargar los indicadores: Error del servidor.', reintentar: true });
  assert.equal(av.avisoDeFuente(Object.assign(new Error('x'), { status: 401 }), 'F').reintentar, true);
  assert.equal(av.avisoDeFuente(Object.assign(new Error('x'), { status: 422 }), 'F').reintentar, true);
  assert.equal(av.avisoDeFuente(new Error('sin status'), 'F').tipo, 'carga');
  assert.equal(av.avisoDeFuente({ status: 403 }, 'F').tipo, 'permiso');
}

// B4 T23B r1 (I2): la regla del 403 en la franja, con una sola fuente (Seguimientos, Marketing y E-Commerce).
{
  const { motivoSinPermiso, estadoFranjaDeFuente, avisoDeFuente } = await import('../src/lib/avisos.js');
  const permiso = avisoDeFuente({ status: 403 }, 'F');
  const carga = avisoDeFuente(new Error('boom'), 'F');
  assert.equal(motivoSinPermiso(permiso), 'No tienes permiso para ver esto.');
  assert.equal(motivoSinPermiso(carga), null, 'una falla de carga no es de permiso');
  assert.equal(motivoSinPermiso(null), null);
  // Con un 403 la franja queda 'listo' («—» con el motivo); con otra falla o sin aviso, el estado que traía.
  assert.equal(estadoFranjaDeFuente(permiso, 'error'), 'listo');
  assert.equal(estadoFranjaDeFuente(permiso, 'cargando'), 'listo');
  assert.equal(estadoFranjaDeFuente(carga, 'error'), 'error');
  assert.equal(estadoFranjaDeFuente(null, 'cargando'), 'cargando');
  assert.equal(estadoFranjaDeFuente(null, 'actualizando'), 'actualizando');
}

// B4 T24 (FINAL-m37, FINAL-C5 y F106): ofreceReintentar — una carga que falló con un 403 nunca ofrece «Reintentar» (volver a pedir no
// cambia el permiso). Es la regla de TablaEstandar, las columnas del tablero, SelectorCatalogo y las cajas de error de las pantallas.
console.log('--- TEST T24-a: ofreceReintentar ---');
{
  const { ofreceReintentar, avisoDeFuente } = await import('../src/lib/avisos.js');
  assert.equal(typeof ofreceReintentar, 'function');
  assert.equal(ofreceReintentar(Object.assign(new Error('x'), { status: 403 })), false, '403');
  assert.equal(ofreceReintentar({ status: 403 }), false, '403 sin Error');
  assert.equal(ofreceReintentar(errorDeRespuesta(403, { detail: "Rol 'BODEGA' (normalizado: 'BODEGA') no autorizado para esta operación." })), false,
    'el 403 real de require_roles');
  for (const status of [400, 401, 404, 409, 422, 500, 502, undefined, null]) {
    assert.equal(ofreceReintentar(Object.assign(new Error('x'), { status })), true, String(status));
  }
  assert.equal(ofreceReintentar(new TypeError('Failed to fetch')), true, 'sin red');
  assert.equal(ofreceReintentar('texto'), true, 'un error que no es objeto');
  // Sin error no hay nada que reintentar.
  for (const nada of [null, undefined, false, 0, '']) assert.equal(ofreceReintentar(nada), false, String(nada));
  // La misma respuesta que avisoDeFuente(...).reintentar.
  for (const e of [{ status: 403 }, { status: 500 }, { status: 422 }, new Error('x'), errorDeRespuesta(403, {})]) {
    assert.equal(ofreceReintentar(e), avisoDeFuente(e, 'F').reintentar, JSON.stringify(e));
  }
  // r1 (m10, m34): la regla «403 → sin Reintentar» escrita UNA vez: avisoDeFuente la toma de ofreceReintentar.
  const { readFileSync } = await import('node:fs');
  const fuente = readFileSync(new URL('../src/lib/avisos.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const cuerpo = (nombre) => fuente.slice(fuente.indexOf(`export function ${nombre}(`), fuente.indexOf('\n}\n', fuente.indexOf(`export function ${nombre}(`)));
  assert.match(cuerpo('avisoDeFuente'), /ofreceReintentar\(error\)/, 'avisoDeFuente usa ofreceReintentar');
  assert.ok(!/403/.test(cuerpo('avisoDeFuente')), 'avisoDeFuente no repite el 403');
  assert.equal((fuente.match(/\.status (?:!|=)== 403/g) ?? []).length, 1, 'una sola comparación con el 403, en ofreceReintentar');
}

console.log('--- TEST T24-b (B4 T24 r1, m16): los comentarios que citan la regla de recarga incluyen el 422 (F8) ---');
{
  const { readFileSync } = await import('node:fs');
  const ARCHIVOS = ['app/dashboard/ventas/venta/venta-client.tsx', 'app/dashboard/crm/page.tsx', 'app/dashboard/compras/transito/page.tsx', 'app/dashboard/compras/recepciones/page.tsx', 'app/dashboard/inventario/ajustes/page.tsx', 'app/dashboard/compras/pedidos/[id]/page.tsx', 'app/dashboard/compras/pedidos/page.tsx', 'app/dashboard/compras/lista-compras/page.tsx', 'app/dashboard/compras/traslados/page.tsx', 'app/dashboard/inventario/entregas/page.tsx', 'app/dashboard/ventas/cotizacion/cotizacion-client.tsx'];
  for (const ruta of ARCHIVOS) {
    const f = readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8');
    // Las líneas que LISTAN la regla (400 y 409); un ejemplo suelto («un 409: el pedido cambió») no es la regla.
    const lineas = f.split(/\r?\n/).filter((l) => /^\s*(?:\/\/|\*)/.test(l) && /\b400\b/.test(l) && /\b409\b/.test(l) && /recarg/.test(l));
    // r2 (m13): cada archivo tiene al menos una (si se borra el comentario de la regla, la sonda falla; mata RR-m16-borrar).
    assert.ok(lineas.length >= 1, `${ruta}: el comentario de la regla`);
    for (const linea of lineas) {
      assert.match(linea, /\b422\b/, `${ruta}: ${linea.trim()}`);
      assert.ok(!/\b422\b[^.;]*\bno\b/.test(linea), `${ruta}: el 422 SÍ recarga: ${linea.trim()}`);
    }
  }
}

console.log('--- TEST T24-c (B4 T24, F46): un solo aviso de fuente — el texto, la regla y la pieza ---');
{
  const { readFileSync } = await import('node:fs');
  const av = await import('../src/lib/avisos.js');
  const kpis = await import('../src/lib/kpis.js');
  // textoAvisoFuente vive en avisos.js (kpis.js la reexporta: la misma función) y avisoDeFuente la usa.
  assert.equal(kpis.textoAvisoFuente, av.textoAvisoFuente);
  assert.equal(av.textoAvisoFuente(new Error('Intenta de nuevo.'), 'No se pudo'), 'No se pudo: Intenta de nuevo.', 'sin doble punto');
  assert.equal(av.avisoDeFuente(new Error('Intenta de nuevo.'), 'No se pudo').texto, 'No se pudo: Intenta de nuevo.');
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // La pieza: AvisoFuente (común), con un acento opcional, y AvisoDeError (error + texto de la falla → avisoDeFuente → AvisoFuente).
  const pieza = leer('components/ui/AvisoFuente.tsx');
  // B4 T24 f3 r1 (m36, D27, aditivo): AvisoDeError recibe `reintentando`: conserva el último error mientras se reintenta («Reintentando…»).
  assert.match(pieza, /export function AvisoDeError\(\{ error, fallo, onReintentar, acento, reintentando = false \}: \{/);
  assert.match(pieza, /const visto = error \?\? \(reintentando \? ultimo : null\);\s*const aviso = avisoDeFuente\(visto, fallo\);\s*return aviso \? <AvisoFuente aviso=\{aviso\} onReintentar=\{onReintentar\} acento=\{acento\} reintentando=\{error == null && reintentando\} \/> : null;/);
  assert.match(pieza, /\$\{FOCOS\[acento\]\}/);
  // AvisoReintentar (Inventario) delega en ella: con un 403, el aviso de permiso sin «Reintentar».
  const piezas = leer('app/dashboard/inventario/piezas-inventario.tsx');
  assert.match(piezas, /export function AvisoReintentar\(props: \{ error: unknown; fallo: string; onReintentar: \(\) => void; acento\?: AcentoFoco \}\) \{\s*return <AvisoDeError \{\.\.\.props\} \/>;\s*\}/);
  // El Dashboard usa la pieza común (sin su AvisoFuente local).
  const dash = leer('app/dashboard/page.tsx');
  assert.ok(!/function AvisoFuente\b/.test(dash), 'Dashboard: sin la copia local');
  assert.match(dash, /import \{ AvisoDeError \} from '@\/components\/ui\/AvisoFuente';/);
  assert.equal((dash.match(/<AvisoDeError error=\{(?:inventario|compras|ventas|clientes)\.error\} fallo="[^"]+" onReintentar=\{(?:inventario|compras|ventas|clientes)\.recargar\} acento="indigo" \/>/g) ?? []).length, 4);
  // Entregas lee el rol con useRolActual (sin su copia de suscribirRol).
  const entregas = leer('app/dashboard/inventario/entregas/page.tsx');
  assert.match(entregas, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/);
  assert.match(entregas, /const rol = useRolActual\(\);/);
  assert.ok(!/suscribirRol|useSyncExternalStore|getUsuarioActual/.test(entregas), 'Entregas: sin la copia del rol');
}

console.log('--- B4 T24 f2 r1 (m28): cambiarConRegla — la ruta de error del arrastre de los tableros, una sola, con la regla de recargarTrasError ---');
{
  const { cambiarConRegla } = await import('../src/lib/avisos.js');
  assert.equal(typeof cambiarConRegla, 'function', 'cambiarConRegla existe');
  const correr = async (resultado) => {
    let recargas = 0;
    let error = null;
    let valor;
    try {
      valor = await cambiarConRegla(async () => { if (resultado instanceof Error) throw resultado; return resultado; }, () => { recargas += 1; });
    } catch (e) { error = e; }
    return { recargas, error, valor };
  };
  // Bien: recarga una vez y no hay error.
  assert.deepEqual(await correr('ok'), { recargas: 1, error: null, valor: undefined });
  // 400, 409, 422 o la red cortada: recarga (el dato cambió o no se sabe) y el error sigue (el tablero deshace).
  for (const e of [errorDeRespuesta(400, { detail: 'x' }), errorDeRespuesta(409, { detail: 'x' }), errorDeRespuesta(422, { detail: 'x' }), new TypeError('Failed to fetch')]) {
    const r = await correr(e);
    assert.equal(r.recargas, 1, String(e.status));
    assert.equal(r.error, e, 'el mismo error sigue');
  }
  // 403 o 500: no recarga (nada cambió) y el error sigue.
  for (const e of [errorDeRespuesta(403, { detail: 'x' }), errorDeRespuesta(500, { detail: 'x' })]) {
    const r = await correr(e);
    assert.deepEqual([r.recargas, r.error], [0, e], String(e.status));
  }
}

console.log('✓ Todas las pruebas de avisos pasaron.');
