/**
 * Reglas puras de la sesion (H23). JS sin dependencias para probarlo con node (tests/test_session.mjs).
 *
 * La sesion dura 24 h desde la ultima renovacion (el backend pone exp e iat en el token). Se renueva sola, como
 * maximo cada RENOVAR_TRAS_MS, pero solo si el usuario la uso (clic, tecla, rueda o toque) despues de emitirse el
 * token: las consultas automaticas no cuentan como uso. Los tokens viejos sin iat se renuevan con el primer uso.
 */

export const RENOVAR_TRAS_MS = 10 * 60 * 1000;

/**
 * Payload (parte central) de un JWT, o null si el token no es valido. No verifica la firma: solo sirve para que
 * el navegador sepa cuando vence y cuando se emitio; quien decide es el servidor.
 */
export function leerPayload(token) {
  if (typeof token !== 'string') return null;
  const partes = token.split('.');
  if (partes.length !== 3 || !partes[1]) return null;
  try {
    let base64 = partes[1].replace(/-/g, '+').replace(/_/g, '/');
    base64 += '='.repeat((4 - (base64.length % 4)) % 4);
    const binario = atob(base64);
    const bytes = Uint8Array.from(binario, (c) => c.charCodeAt(0));
    const payload = JSON.parse(new TextDecoder().decode(bytes));
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : null;
  } catch {
    return null;
  }
}

/**
 * 'sin-token' | 'vencida' | 'renovar' | 'vigente'.
 * - 'sin-token': no hay payload o no trae exp.
 * - 'vencida': exp ya paso (exp*1000 <= ahora).
 * - 'renovar': el token tiene RENOVAR_TRAS_MS o mas (o no trae iat) y hubo uso real despues de emitirse.
 * - 'vigente': en otro caso (incluido un token viejo sin uso posterior: no se renueva solo).
 */
export function estadoSesion(payload, ahoraMs, ultimaActividadMs) {
  if (!payload || typeof payload.exp !== 'number') return 'sin-token';
  if (payload.exp * 1000 <= ahoraMs) return 'vencida';
  const emitidoMs = typeof payload.iat === 'number' ? payload.iat * 1000 : null;
  const tocaRenovar = emitidoMs === null || ahoraMs - emitidoMs >= RENOVAR_TRAS_MS;
  const usoDespues = Number(ultimaActividadMs) > (emitidoMs ?? 0);
  return tocaRenovar && usoDespues ? 'renovar' : 'vigente';
}
