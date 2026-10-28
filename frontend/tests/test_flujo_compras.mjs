/**
 * frontend/tests/test_flujo_compras.mjs
 * B4 T3B (FLUJO-compras punto 4; R9, RP21, RP28): la presentación del flujo de Compras en
 * frontend/src/lib/flujo-compras.js. El atraso de un PEC es esPecVencido de estados-compras.js (T2), sin tolerancia;
 * esPecAtrasado y etapaFlujoPec no se crean (RP28, RP93: manda pasoFlujoPec).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  PASOS_FLUJO_COMPRAS, ETIQUETA_ETAPA_TRACKING, etiquetaEtapaTracking, pasosDeTracking, textoReglaCompras,
  esPecVencido, pasoFlujoPec,
} from '../src/lib/flujo-compras.js';
import * as estadosCompras from '../src/lib/estados-compras.js';
// r1: conteosDePasos por el espacio de nombres, para que su falta no tape los demás rojos.
import * as flujo from '../src/lib/flujo.js';
import { pasosConConteos } from '../src/lib/flujo.js';
import { fechaLarga } from '../src/lib/fechas-colombia.js';

const estados = (pasos) => pasos.map((p) => p.estado);

/** Una etapa como la guarda el servidor (create_pec y update_tracking de erp_compras.py, con su `alert`). */
const etapa = (stage, label, status, extra = {}) => ({
  stage, label, status, timestamp: null, eta: null, carrier: null, tracking_number: null, tracking_history: [],
  alert: null, ...extra,
});

const DIRECTO = [
  etapa('PENDIENTE_DESPACHO', 'Pendiente Despacho Proveedor', 'COMPLETADO', { timestamp: '2026-10-05T14:00:00' }),
  etapa('PROVEEDOR_BODEGA', 'Proveedor -> Bodega Nebulae', 'EN_PROCESO', { timestamp: '2026-10-06T15:00:00', eta: '2026-11-03' }),
  etapa('RECIBIDO', 'Recibido', 'PENDIENTE'),
];
const CASILLERO = [
  etapa('PENDIENTE_DESPACHO', 'Pendiente Despacho Proveedor', 'COMPLETADO', { timestamp: '2026-10-05T14:00:00' }),
  etapa('PROVEEDOR_CASILLERO', 'Proveedor -> Casillero', 'EN_PROCESO', { eta: '2026-10-20' }),
  etapa('CASILLERO_BODEGA', 'Casillero -> Bodega Nebulae', 'PENDIENTE'),
  etapa('RECIBIDO', 'Recibido', 'PENDIENTE'),
];

console.log('--- TEST 1: PASOS_FLUJO_COMPRAS — 5 pasos, congelado, con ayuda, íconos y rutas (RP21) ---');
{
  assert.deepEqual(PASOS_FLUJO_COMPRAS.map((p) => p.clave), ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO'],
    'las claves de PASOS_FLUJO_COMPRAS de estados_compras.py');
  assert.deepEqual(PASOS_FLUJO_COMPRAS.map((p) => [p.label, p.sufijo, p.icono, p.ruta]), [
    ['Lista de compras', 'por comprar', 'lista', '/dashboard/compras/lista-compras'],
    ['Pedido de compra', 'sin despachar', 'compra', '/dashboard/compras/pedidos'],
    ['En tránsito', 'en camino', 'transito', '/dashboard/compras/transito'],
    ['Recepción en bodega', 'por confirmar', 'recepcion', '/dashboard/compras/recepciones'],
    ['Recibido', 'recibidos', 'recibido', '/dashboard/compras/pedidos?tab=recibidos'],
  ]);
  for (const p of PASOS_FLUJO_COMPRAS) {
    assert.ok(typeof p.ayuda === 'string' && p.ayuda.endsWith('.') && p.ayuda.length > 10, `${p.clave} trae su ayuda`);
    assert.ok(['indigo', 'amber', 'emerald', 'teal', 'purple'].includes(p.tono), `${p.clave}: un tono de la franja`);
  }
  // r1: R9 pone también PARCIALMENTE_RECIBIDA en la etapa de la recepción.
  assert.equal(PASOS_FLUJO_COMPRAS[3].ayuda,
    'Llegó a bodega, toda o en parte, y falta confirmarla. Avanza cuando se confirma la recepción.');
  assert.ok(Object.isFrozen(PASOS_FLUJO_COMPRAS) && PASOS_FLUJO_COMPRAS.every((p) => Object.isFrozen(p)));
  assert.throws(() => { /** @type {any} */ (PASOS_FLUJO_COMPRAS)[4].ruta = '/otra'; }, TypeError);
}

console.log('--- TEST 2: ETIQUETA_ETAPA_TRACKING y etiquetaEtapaTracking (RP28: CANCELADO «Cancelada») ---');
{
  assert.deepEqual({ ...ETIQUETA_ETAPA_TRACKING }, {
    PENDIENTE: 'Pendiente', EN_PROCESO: 'En curso', COMPLETADO: 'Completada', CANCELADO: 'Cancelada',
  });
  assert.throws(() => { /** @type {any} */ (ETIQUETA_ETAPA_TRACKING).PENDIENTE = 'x'; }, TypeError);
  assert.equal(etiquetaEtapaTracking('EN_PROCESO'), 'En curso');
  assert.equal(etiquetaEtapaTracking('CANCELADO'), 'Cancelada');
  assert.equal(etiquetaEtapaTracking('ALGO_NUEVO'), 'Algo nuevo', 'un desconocido sale humanizado');
  assert.equal(etiquetaEtapaTracking('toString'), 'Tostring', 'una clave del prototipo no es una etiqueta');
  assert.equal(etiquetaEtapaTracking(null), '');
}

console.log('--- TEST 3: pasosDeTracking con 3 etapas (directo) y con 4 (casillero) ---');
{
  const directo = pasosDeTracking(DIRECTO);
  assert.deepEqual(estados(directo), ['hecho', 'actual', 'pendiente']);
  assert.deepEqual(directo.map((p) => p.clave), ['PENDIENTE_DESPACHO', 'PROVEEDOR_BODEGA', 'RECIBIDO']);
  assert.deepEqual(directo.map((p) => p.label), ['Pendiente Despacho Proveedor', 'Proveedor -> Bodega Nebulae', 'Recibido']);
  const casillero = pasosDeTracking(CASILLERO);
  assert.deepEqual(estados(casillero), ['hecho', 'actual', 'pendiente', 'pendiente']);
  assert.equal(casillero.length, 4);
}

console.log('--- TEST 4: pasosDeTracking — vacío, orden del arreglo y CANCELADO ---');
{
  assert.deepEqual(pasosDeTracking([]), []);
  assert.deepEqual(pasosDeTracking(/** @type {any} */ (null)), []);
  assert.deepEqual(pasosDeTracking(/** @type {any} */ ({ stage: 'X' })), []);
  // Los nombres no siguen ningún orden conocido: manda el arreglo.
  const raros = pasosDeTracking([
    etapa('ZETA', 'Zeta', 'COMPLETADO'), etapa('ALFA', 'Alfa', 'COMPLETADO'), etapa('MEDIO', 'Medio', 'EN_PROCESO'),
  ]);
  assert.deepEqual(raros.map((p) => p.clave), ['ZETA', 'ALFA', 'MEDIO']);
  assert.deepEqual(estados(raros), ['hecho', 'hecho', 'actual']);
  // RP28: una etapa CANCELADO queda 'cancelado'; un estado desconocido, 'pendiente'.
  assert.deepEqual(estados(pasosDeTracking([etapa('A', 'A', 'CANCELADO'), etapa('B', 'B', 'RARO')])), ['cancelado', 'pendiente']);
  // Sin label se humaniza la clave; sin clave, una propia por posición.
  const sinNombre = pasosDeTracking(/** @type {any} */ ([{ stage: 'CASILLERO_BODEGA', status: 'PENDIENTE' }, { status: 'PENDIENTE' }, null, 'basura', 7]));
  assert.deepEqual(sinNombre.map((p) => [p.clave, p.label]), [['CASILLERO_BODEGA', 'Casillero bodega'], ['etapa_2', 'Etapa 2']]);
}

console.log('--- TEST 5: pasosDeTracking — sublabel con la fecha de la etapa o «llega {eta}» ---');
{
  const [hecha, enCurso, pendiente] = pasosDeTracking(DIRECTO);
  assert.equal(hecha.sublabel, fechaLarga('2026-10-05T14:00:00'));
  assert.equal(hecha.sublabel, '5 de octubre de 2026');
  assert.equal(enCurso.sublabel, 'llega 3 de noviembre de 2026', 'la ETA de calendario no se corre de día');
  assert.equal(pendiente.sublabel, undefined);
  // Pendiente con ETA; en curso sin ETA (la fecha en que empezó); un ETA ilegible no se muestra.
  const [conEta, sinEta, ilegible] = pasosDeTracking([
    etapa('A', 'A', 'PENDIENTE', { eta: '2026-12-01' }),
    etapa('B', 'B', 'EN_PROCESO', { timestamp: '2026-10-06T03:00:00' }),
    etapa('C', 'C', 'PENDIENTE', { eta: 'pronto' }),
  ]);
  assert.equal(conEta.sublabel, 'llega 1 de diciembre de 2026');
  const [completadaConEta] = pasosDeTracking([
    etapa('A', 'A', 'COMPLETADO', { timestamp: '2026-10-05T14:00:00', eta: '2026-10-04' }),
  ]);
  assert.equal(completadaConEta.sublabel, '5 de octubre de 2026', 'completada: la fecha en que se completó, no la ETA');
  assert.equal(sinEta.sublabel, '5 de octubre de 2026', 'el instante sin zona es UTC: en Colombia todavía es el 5');
  assert.equal(ilegible.sublabel, undefined);
}

console.log('--- TEST 6: pasosDeTracking — el aviso rojo solo con nivel «atrasado» (RP28) ---');
{
  const [atrasada, enPlazo, sinAlerta] = pasosDeTracking([
    etapa('A', 'A', 'EN_PROCESO', { alert: { nivel: 'atrasado', mensaje: 'Entrega atrasada por 3 dia(s) (ETA 01/10/2026)', dias_restantes: -3 } }),
    etapa('B', 'B', 'PENDIENTE', { alert: { nivel: 'ok', mensaje: '4 dia(s) para confirmar esta etapa', dias_restantes: 4 } }),
    etapa('C', 'C', 'PENDIENTE'),
  ]);
  assert.deepEqual(atrasada.avisos, [{ texto: 'Entrega atrasada por 3 dia(s) (ETA 01/10/2026)', tono: 'rojo' }]);
  assert.deepEqual(enPlazo.avisos, [{ texto: '4 dia(s) para confirmar esta etapa', tono: 'gris' }], 'en plazo: texto neutro');
  assert.ok(!enPlazo.avisos?.some((a) => a.tono === 'rojo'));
  assert.deepEqual(sinAlerta.avisos, []);
  // Una alerta sin mensaje no pinta nada.
  assert.deepEqual(pasosDeTracking([etapa('D', 'D', 'PENDIENTE', { alert: { nivel: 'atrasado' } })])[0].avisos, []);
}

console.log('--- TEST 6b (r1): una etapa CANCELADO no lleva avisos ni «llega …» (_stage_alert también la calcula) ---');
{
  const [conFecha, sinFecha] = pasosDeTracking([
    etapa('A', 'A', 'CANCELADO', {
      timestamp: '2026-10-06T15:00:00', eta: '2026-10-01',
      alert: { nivel: 'atrasado', mensaje: 'Entrega atrasada por 27 dia(s) (ETA 01/10/2026)', dias_restantes: -27 },
    }),
    etapa('B', 'B', 'CANCELADO', { eta: '2026-10-01', alert: { nivel: 'ok', mensaje: '2 dia(s) para confirmar esta etapa' } }),
  ]);
  assert.equal(conFecha.estado, 'cancelado');
  assert.deepEqual(conFecha.avisos, [], 'sin el aviso rojo');
  assert.equal(conFecha.sublabel, '6 de octubre de 2026', 'la fecha del cambio, no «llega …»');
  assert.equal(sinFecha.estado, 'cancelado');
  assert.deepEqual(sinFecha.avisos, []);
  assert.equal(sinFecha.sublabel, undefined);
}

console.log('--- TEST 6c (r1): los conteos de /compras/flujo pasan por conteosDePasos de flujo.js ---');
{
  // «La misma forma que el de Ventas»: pasos.{total, atrasados, mas_antiguo_dias, por_estado} (T12).
  const datos = {
    pasos: {
      LISTA: { total: 7, atrasados: null, mas_antiguo_dias: 3, por_estado: { PENDIENTE: 7 } },
      PEC: { total: 4, atrasados: 1, mas_antiguo_dias: 20, por_estado: { BORRADOR: 1, EMITIDO: 3 } },
      TRANSITO: { total: 2, atrasados: 2, mas_antiguo_dias: 9, por_estado: { EN_TRANSITO: 2 } },
    },
    semaforo: { atrasados: 3, no_resueltos: 6 },
  };
  const pasos = pasosConConteos(PASOS_FLUJO_COMPRAS, /** @type {any} */ (flujo).conteosDePasos(datos), { actual: 'PEC' });
  assert.deepEqual(pasos.map((p) => [p.clave, p.total, p.atrasados, p.masAntiguoDias]), [
    ['LISTA', 7, null, 3], ['PEC', 4, 1, 20], ['TRANSITO', 2, 2, 9], ['RECEPCION', null, null, null], ['RECIBIDO', null, null, null],
  ]);
  assert.equal(pasos[1].esEste, true);
}

console.log('--- TEST 7: textoReglaCompras() sin parámetro (RP28, R9: sin tolerancia) ---');
{
  assert.equal(textoReglaCompras.length, 0);
  assert.equal(textoReglaCompras(), 'Con atraso: ya pasó la fecha de entrega estimada');
}

console.log('--- TEST 8: esPecVencido y pasoFlujoPec son los de estados-compras.js (T2), no copias ---');
{
  assert.equal(esPecVencido, estadosCompras.esPecVencido);
  assert.equal(pasoFlujoPec, estadosCompras.pasoFlujoPec);
  // Los casos del diseño de esPecAtrasado, ahora con esPecVencido (RP28).
  const hoy = '2026-10-28';
  assert.equal(esPecVencido({ estado: 'RECIBIDA', fecha_entrega_estimada: '2026-10-01' }, hoy), false, 'recibido nunca vence');
  assert.equal(esPecVencido({ estado: 'EN_TRANSITO', fecha_entrega_estimada: '2026-10-01' }, hoy), true);
  assert.equal(esPecVencido({ estado: 'EN_TRANSITO', fecha_entrega_estimada: null }, hoy), false, 'sin fecha no vence');
  assert.deepEqual(['BORRADOR', 'EN_TRANSITO', 'PARCIALMENTE_RECIBIDA', 'COMPLETADO', 'CANCELADO'].map(pasoFlujoPec),
    ['PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO', null]);
  // Cada paso de un PEC es una clave de PASOS_FLUJO_COMPRAS.
  const claves = PASOS_FLUJO_COMPRAS.map((p) => p.clave);
  for (const e of Object.keys(estadosCompras.ESTADOS_PEC)) {
    const paso = pasoFlujoPec(e);
    assert.ok(paso === null || claves.includes(paso), e);
  }
}

console.log('--- TEST 9: JS puro, sin almacenamiento y sin esPecAtrasado ni etapaFlujoPec ---');
{
  const fuente = readFileSync(new URL('../src/lib/flujo-compras.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]react/.test(fuente), 'no importa React');
  assert.ok(!/\b(window|document)\./.test(fuente), 'no usa el DOM');
  assert.ok(!/localStorage|sessionStorage/.test(fuente), 'no toca el almacenamiento');
  assert.ok(!/esPecAtrasado|etapaFlujoPec/.test(fuente), 'RP28/RP93: no se crean');
  assert.ok(!/function\s+\w+\s*\([^)]*tolerancia/i.test(fuente), 'R9: ninguna función recibe días de tolerancia');
  assert.ok(!/function congelar\(/.test(fuente), 'congelar no se copia');
}

console.log('\nOK: test_flujo_compras.mjs');
