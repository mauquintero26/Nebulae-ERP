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

/**
 * Evento storage de SessionKeeper: el token que otra pestana guardo sirve para cerrar la ventana de re-ingreso y
 * reintentar las peticiones pendientes solo si es un JWT no vencido de la MISMA cuenta (mismo sub). Con otra
 * cuenta, un token vencido, borrado o basura, la ventana sigue abierta.
 */
export function tokenSirveParaReintentar(nuevoToken, subSesion, ahoraMs) {
  if (subSesion === null || subSesion === undefined) return false;
  const payload = leerPayload(nuevoToken);
  const estado = estadoSesion(payload, ahoraMs, 0);
  if (estado === 'vencida' || estado === 'sin-token') return false;
  if (payload.sub === undefined || payload.sub === null) return false;
  return String(payload.sub) === String(subSesion);
}

/**
 * Usuario de la respuesta de GET /auth/me ({status, data: usuario} o el usuario plano), o null si no trae un usuario
 * con id o email. No basta con status: apiFetch le agrega status 200 a cualquier JSON. AuthGuard trata el null como
 * sesion vencida.
 */
export function usuarioDeMe(data) {
  if (!data || typeof data !== 'object') return null;
  const usuario = data.data !== undefined ? data.data : data;
  if (!usuario || typeof usuario !== 'object') return null;
  return usuario.id != null || usuario.email ? usuario : null;
}
