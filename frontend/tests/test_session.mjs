/**
 * frontend/tests/test_session.mjs
 * H23: reglas puras de la sesion (src/lib/session.js).
 * - leerPayload decodifica la parte central del JWT (base64url, con '-' y '_' y sin relleno) y devuelve null con basura.
 * - estadoSesion: 'sin-token' sin payload o sin exp; 'vencida' si exp ya paso; 'renovar' solo si el token tiene
 *   10 minutos o mas (o no trae iat) Y hubo uso real despues de emitirse; 'vigente' en otro caso.
 */

import assert from 'node:assert/strict';
import { leerPayload, estadoSesion, RENOVAR_TRAS_MS } from '../src/lib/session.js';

const base64url = (texto) => Buffer.from(texto, 'utf8').toString('base64')
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const tokenCon = (payload) => `${base64url('{"alg":"HS256","typ":"JWT"}')}.${base64url(JSON.stringify(payload))}.firma`;

const AHORA = Date.UTC(2026, 9, 4, 15, 0, 0);
const seg = (ms) => Math.floor(ms / 1000);
const MIN = 60 * 1000;

console.log('--- TEST 1: RENOVAR_TRAS_MS son 10 minutos ---');
{
  assert.equal(RENOVAR_TRAS_MS, 10 * 60 * 1000);
}

console.log("--- TEST 2: leerPayload decodifica base64url con '-' y '_' (sin relleno) ---");
{
  // '>>>' y '???' en JSON producen '+' y '/' en base64 normal: en base64url salen '-' y '_'.
  const payload = { sub: '42', role: 'Admin', exp: 1791127606, iat: 1791041206, nota: '>>>???>>' };
  const token = tokenCon(payload);
  const centro = token.split('.')[1];
  assert.ok(centro.includes('-') && centro.includes('_'), `el caso debe ejercer '-' y '_': ${centro}`);
  assert.ok(centro.length % 4 !== 0, 'el caso debe necesitar relleno');
  assert.deepEqual(leerPayload(token), payload);
}

console.log('--- TEST 3: leerPayload decodifica texto con tildes (UTF-8) ---');
{
  const payload = { sub: '7', role: 'Señor Asesor', exp: 1, iat: 0 };
  assert.deepEqual(leerPayload(tokenCon(payload)), payload);
}

console.log('--- TEST 4: leerPayload devuelve null con basura ---');
{
  assert.equal(leerPayload(null), null);
  assert.equal(leerPayload(undefined), null);
  assert.equal(leerPayload(''), null);
  assert.equal(leerPayload('basura'), null);
  assert.equal(leerPayload('a.b.c'), null);
  assert.equal(leerPayload('a.%%%%.c'), null);
  assert.equal(leerPayload(`x.${base64url('no es json')}.y`), null);
  assert.equal(leerPayload(`x.${base64url('123')}.y`), null, 'un JSON que no es objeto no es un payload');
  assert.equal(leerPayload(`x.${base64url('null')}.y`), null);
  assert.equal(leerPayload(12345), null);
}

console.log("--- TEST 5: estadoSesion con payload null o sin exp da 'sin-token' ---");
{
  assert.equal(estadoSesion(null, AHORA, AHORA), 'sin-token');
  assert.equal(estadoSesion({ sub: '1' }, AHORA, AHORA), 'sin-token');
  assert.equal(estadoSesion({ sub: '1', exp: 'mañana' }, AHORA, AHORA), 'sin-token');
}

console.log("--- TEST 6: exp pasado (o justo ahora) da 'vencida' ---");
{
  assert.equal(estadoSesion({ exp: seg(AHORA - MIN), iat: seg(AHORA - 25 * 60 * MIN) }, AHORA, AHORA), 'vencida');
  assert.equal(estadoSesion({ exp: seg(AHORA) }, AHORA, AHORA), 'vencida', 'exp*1000 <= ahora');
  assert.equal(estadoSesion({ exp: seg(AHORA - MIN) }, AHORA, 0), 'vencida', 'AuthGuard la llama con actividad 0');
}

console.log("--- TEST 7: iat de hace 5 min con actividad da 'vigente' ---");
{
  const iat = AHORA - 5 * MIN;
  assert.equal(estadoSesion({ exp: seg(iat + 1440 * MIN), iat: seg(iat) }, AHORA, AHORA - MIN), 'vigente');
}

console.log("--- TEST 8: iat de hace 11 min SIN actividad posterior da 'vigente' (no se renueva sola) ---");
{
  const iat = AHORA - 11 * MIN;
  const payload = { exp: seg(iat + 1440 * MIN), iat: seg(iat) };
  assert.equal(estadoSesion(payload, AHORA, iat - MIN), 'vigente', 'el ultimo uso fue antes de emitirse el token');
  assert.equal(estadoSesion(payload, AHORA, iat), 'vigente', 'usar justo al emitirse no cuenta como uso posterior');
  assert.equal(estadoSesion(payload, AHORA, 0), 'vigente');
}

console.log("--- TEST 9: iat de hace 11 min CON actividad posterior da 'renovar' ---");
{
  const iat = AHORA - 11 * MIN;
  assert.equal(estadoSesion({ exp: seg(iat + 1440 * MIN), iat: seg(iat) }, AHORA, AHORA - 2 * MIN), 'renovar');
  // Justo en el limite de 10 minutos ya toca renovar (>=).
  const iat10 = AHORA - 10 * MIN;
  assert.equal(estadoSesion({ exp: seg(iat10 + 1440 * MIN), iat: seg(iat10) }, AHORA, AHORA), 'renovar');
}

console.log("--- TEST 10: sin iat (tokens viejos de 30/60 min) y con actividad da 'renovar' ---");
{
  assert.equal(estadoSesion({ exp: seg(AHORA + 20 * MIN) }, AHORA, AHORA - 1000), 'renovar');
  assert.equal(estadoSesion({ exp: seg(AHORA + 20 * MIN) }, AHORA, 0), 'vigente', 'sin actividad no se renueva');
}

console.log('✓ Todas las pruebas de session.js pasaron.');
