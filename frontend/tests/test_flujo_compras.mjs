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
import { diaColombia, fechaLarga } from '../src/lib/fechas-colombia.js';
// B4 T14: lo del Hub de Compras por el espacio de nombres (su falta no tapa los demás rojos).
import * as fc from '../src/lib/flujo-compras.js';
import { accionPestana, estadoTablaInicial } from '../src/lib/tabla.js';

const estados = (pasos) => pasos.map((p) => p.estado);

/**
 * T15 r1 (m10 a): corre `fn` con el reloj fijo en `iso` (Date sin argumentos y Date.now() dan ese instante) y deja el
 * Date de verdad al salir, también si `fn` falla.
 */
function conRelojFijo(iso, fn) {
  const DateReal = globalThis.Date;
  const fijo = DateReal.parse(iso);
  class DateFijo extends DateReal {
    constructor(...args) { super(...(args.length ? args : [fijo])); }
    static now() { return fijo; }
  }
  globalThis.Date = DateFijo;
  try { fn(); } finally { globalThis.Date = DateReal; }
}

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

console.log('--- TEST 10 (T5A): los puntos de la variante mini (Progreso de Tránsito) dicen el estado como ETIQUETA_ETAPA_TRACKING ---');
{
  // tituloPunto (lib/flujo.js) dice el estado de la etapa con las mismas palabras que el resto de Compras, en minúscula.
  const CORRESPONDE = { hecho: 'COMPLETADO', actual: 'EN_PROCESO', pendiente: 'PENDIENTE', cancelado: 'CANCELADO' };
  for (const [estado, deTracking] of Object.entries(CORRESPONDE)) {
    assert.equal(/** @type {any} */ (flujo).tituloPunto({ clave: 'x', label: 'X', estado }, 0, 1),
      `Etapa 1 de 1: X, ${ETIQUETA_ETAPA_TRACKING[deTracking].toLowerCase()}`, estado);
  }
  // Con las etapas reales de un envío por casillero (pasosDeTracking): la fecha o la llegada van detrás de ' · '.
  const pasos = pasosDeTracking(CASILLERO);
  const titulos = pasos.map((p, i) => /** @type {any} */ (flujo).tituloPunto(p, i, pasos.length));
  assert.deepEqual(titulos, [
    `Etapa 1 de 4: Pendiente Despacho Proveedor, completada · ${fechaLarga('2026-10-05T14:00:00')}`,
    `Etapa 2 de 4: Proveedor -> Casillero, en curso · llega ${fechaLarga('2026-10-20')}`,
    'Etapa 3 de 4: Casillero -> Bodega Nebulae, pendiente',
    'Etapa 4 de 4: Recibido, pendiente',
  ]);
  // Una etapa atrasada suma su aviso (rojo) al title.
  const atrasada = pasosDeTracking([etapa('ADUANA', 'Aduana', 'EN_PROCESO', { alert: { nivel: 'atrasado', mensaje: 'Atrasada 2 día(s)' } })]);
  assert.equal(/** @type {any} */ (flujo).tituloPunto(atrasada[0], 1, 4), 'Etapa 2 de 4: Aduana, en curso · Atrasada 2 día(s)');
}

/** La respuesta de GET /compras/flujo (T12, Firmas finales). */
const FLUJO = {
  pasos: {
    LISTA: { total: 4, atrasados: null, mas_antiguo_dias: 3, por_estado: { PENDIENTE: 4 } },
    PEC: { total: 5, atrasados: 2, mas_antiguo_dias: 9, por_estado: { BORRADOR: 1, EMITIDO: 4 } },
    TRANSITO: { total: 3, atrasados: 1, mas_antiguo_dias: 6, por_estado: { EN_TRANSITO: 3 } },
    RECEPCION: { total: 2, atrasados: null, mas_antiguo_dias: 2, por_estado: { RECIBIDO: 2 }, recepciones_por_confirmar: 3 },
    RECIBIDO: { total: 9, atrasados: null, mas_antiguo_dias: null, por_estado: { RECIBIDA: 9 } },
  },
  semaforo: { atrasados: 3, no_resueltos: null }, criterio_atraso: 'fecha_entrega', generado_at: '2026-11-07T15:00:00Z',
};

console.log('--- TEST 11 (B4 T14): pasosHubCompras, la franja del Hub (los conteos del servidor; Lista y Recepción son enlaces) ---');
{
  assert.equal(typeof fc.pasosHubCompras, 'function', 'pasosHubCompras existe');
  const pasos = fc.pasosHubCompras(FLUJO, estadoTablaInicial({ vista: 'pedidos' }));
  assert.deepEqual(pasos.map((p) => p.clave), ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO']);
  assert.deepEqual(pasos.map((p) => p.total), [4, 5, 3, 2, 9]);
  assert.deepEqual(pasos.map((p) => p.atrasados), [null, 2, 1, null, null]);
  assert.deepEqual(pasos.map((p) => p.href ?? null), ['/dashboard/compras/lista-compras', null, null, '/dashboard/compras/recepciones', null]);
  assert.deepEqual(pasos.map((p) => p.seleccionado), [false, true, false, false, false], 'la pestaña Pedidos de compra marca su caja');
  assert.ok(pasos.every((p) => !p.esEste && p.estado === 'neutro'), 'el Hub no es la pantalla de un paso');
  // Es pasosConConteos con conteosDePasos (D36), más los enlaces: lo demás de cada caja, igual.
  const base = pasosConConteos(PASOS_FLUJO_COMPRAS, flujo.conteosDePasos(FLUJO), { seleccionado: 'PEC' });
  assert.deepEqual(pasos.map((p) => Object.fromEntries(Object.entries(p).filter(([campo]) => campo !== 'href'))), base);
  // Sin datos (cargando): los números en null (Contador pinta la barra gris), nunca 0.
  assert.ok(fc.pasosHubCompras(null, estadoTablaInicial({})).every((p) => p.total === null && p.atrasados === null));
  // En Kanban ninguna caja queda marcada (las pestañas no se ven: la caja abre su pestaña en Lista).
  assert.ok(fc.pasosHubCompras(FLUJO, estadoTablaInicial({ vista: 'pedidos', modo: 'kanban' })).every((p) => !p.seleccionado));
}

console.log('--- TEST 12 (B4 T14): pasoHubComprasDe y accionPasoHubCompras: tocar una caja filtra la tabla (R5, C3) ---');
{
  assert.equal(typeof fc.pasoHubComprasDe, 'function', 'pasoHubComprasDe existe');
  const de = (parcial) => fc.pasoHubComprasDe(estadoTablaInicial(parcial));
  assert.equal(de({ vista: 'pedidos' }), 'PEC');
  assert.equal(de({ vista: 'en_transito', estados: ['EN_TRANSITO'] }), 'TRANSITO');
  assert.equal(de({ vista: 'acciones_tomadas', estados: ['COMPLETADO', 'RECIBIDA'] }), 'RECIBIDO', 'Recibido = la pestaña y su etapa');
  assert.equal(de({ vista: 'acciones_tomadas' }), null);
  assert.equal(de({ vista: 'acciones_tomadas', estados: ['RECIBIDA'] }), null);
  assert.equal(de({ vista: 'todos' }), null);
  assert.equal(de({ vista: 'pedidos', modo: 'kanban' }), null);

  assert.equal(typeof fc.accionPasoHubCompras, 'function', 'accionPasoHubCompras existe');
  // T14 r1 (m1; D41, D42): la vista cambia con accionPestana (con las opciones de la Lista), como T7; solo la caja Recibido
  // agrega los estados de su etapa (el endpoint no acepta `paso`). No toca el semáforo.
  const opciones = estadosCompras.opcionesEstadosPec;
  const accion = (parcial, clave) => fc.accionPasoHubCompras(estadoTablaInicial(parcial), clave, opciones);
  assert.equal(accion({ vista: 'todos' }, 'LISTA'), null, 'Lista de compras es un enlace');
  assert.equal(accion({ vista: 'todos' }, 'RECEPCION'), null, 'Recepción en bodega es un enlace');
  assert.equal(accion({ vista: 'todos' }, 'OTRO'), null);
  // Un filtro que vale en la pestaña nueva se conserva (EMITIDO en Pedidos de compra); uno que no, se poda.
  assert.deepEqual(accion({ vista: 'todos', estados: ['EMITIDO'] }, 'PEC'), { tipo: 'vista', valor: 'pedidos' });
  assert.deepEqual(accion({ vista: 'todos', estados: ['EN_TRANSITO', 'EMITIDO'] }, 'PEC'),
    { tipo: 'cambiar', cambios: { vista: 'pedidos', estados: ['EMITIDO'] } });
  assert.deepEqual(accion({ vista: 'todos' }, 'TRANSITO'), { tipo: 'vista', valor: 'en_transito' });
  for (const [parcial, clave, vista] of [[{ vista: 'todos', estados: ['EMITIDO'] }, 'PEC', 'pedidos'],
    [{ vista: 'no_resueltos', estados: ['RECIBIDO', 'EN_TRANSITO'] }, 'TRANSITO', 'en_transito']]) {
    const e = estadoTablaInicial(parcial);
    assert.deepEqual(fc.accionPasoHubCompras(e, clave, opciones), accionPestana(e, vista, opciones), `${clave}: la de accionPestana`);
  }
  assert.deepEqual(accion({ vista: 'todos' }, 'RECIBIDO'),
    { tipo: 'cambiar', cambios: { vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'] } });
  assert.deepEqual(accion({ vista: 'todos', semaforo: 'vencidos' }, 'RECIBIDO'),
    { tipo: 'cambiar', cambios: { vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'], semaforo: null } },
    'cierre T14: Recibido apaga «Con atraso» (sus estados nunca vencen; si no, la tabla queda vacía)');
  assert.deepEqual(accion({ vista: 'pedidos', modo: 'kanban', semaforo: 'vencidos' }, 'RECIBIDO'),
    { tipo: 'cambiar', cambios: { vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'], semaforo: null, modo: 'lista' } },
    'también desde Kanban');
  assert.deepEqual(accion({ vista: 'todos', semaforo: 'vencidos' }, 'PEC'), { tipo: 'vista', valor: 'pedidos' });
  // Tocar la caja marcada vuelve a Todos (R6) con accionPestana; Recibido suelta además los estados de su etapa.
  assert.deepEqual(accion({ vista: 'pedidos', estados: ['EMITIDO'] }, 'PEC'), { tipo: 'vista', valor: 'todos' });
  assert.deepEqual(accion({ vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'] }, 'RECIBIDO'),
    { tipo: 'cambiar', cambios: { vista: 'todos', estados: [] } });
  // En Kanban abre su pestaña en Lista (como las tarjetas de T10), con la poda de la Lista.
  assert.deepEqual(accion({ vista: 'pedidos', modo: 'kanban' }, 'TRANSITO'), { tipo: 'cambiar', cambios: { vista: 'en_transito', modo: 'lista' } });
  assert.deepEqual(accion({ vista: 'pedidos', modo: 'kanban', estados: ['EMITIDO'] }, 'TRANSITO'),
    { tipo: 'cambiar', cambios: { vista: 'en_transito', estados: [], modo: 'lista' } });
  assert.deepEqual(accion({ vista: 'pedidos', modo: 'kanban' }, 'RECIBIDO'),
    { tipo: 'cambiar', cambios: { vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'], modo: 'lista' } });
}

console.log('--- TEST 13 (B4 T14): accionSemaforoCompras, «Con atraso» = semaforo=vencidos en el servidor (RP40) ---');
{
  assert.equal(typeof fc.accionSemaforoCompras, 'function', 'accionSemaforoCompras existe');
  // T14 r1 (m1): «Con atraso» no cambia de pestaña ni poda el filtro (como T7); solo si la vista activa no puede tener
  // atrasos (en bodega, acciones tomadas) pasa a Todos con accionPestana (como T10) y pone el semáforo.
  const opciones = estadosCompras.opcionesEstadosPec;
  const accion = (parcial, f) => fc.accionSemaforoCompras(estadoTablaInicial(parcial), f, opciones);
  assert.deepEqual(accion({ vista: 'pedidos', semaforo: 'vencidos' }, 'todos'), { tipo: 'semaforo', valor: null });
  assert.deepEqual(accion({ vista: 'pedidos' }, 'atrasados'), { tipo: 'semaforo', valor: 'vencidos' });
  assert.deepEqual(accion({ vista: 'todos', estados: ['BORRADOR', 'EMITIDO'] }, 'atrasados'), { tipo: 'semaforo', valor: 'vencidos' });
  assert.deepEqual(accion({ vista: 'en_bodega' }, 'atrasados'), { tipo: 'cambiar', cambios: { vista: 'todos', semaforo: 'vencidos' } });
  // Cierre T14 (re-revisión r1): en Lista, la poda usa las opciones de Todos que pueden vencer (T8 r2b: no caer en
  // una tabla vacía); la caja Recibido pone RECIBIDA y COMPLETADO, que nunca vencen.
  assert.deepEqual(accion({ vista: 'acciones_tomadas', estados: ['RECIBIDA', 'COMPLETADO'] }, 'atrasados'),
    { tipo: 'cambiar', cambios: { vista: 'todos', estados: [], semaforo: 'vencidos' } }, 'poda lo que nunca vence');
  assert.deepEqual(accion({ vista: 'en_bodega', estados: ['RECIBIDO'] }, 'atrasados'),
    { tipo: 'cambiar', cambios: { vista: 'todos', estados: [], semaforo: 'vencidos' } });
  // En Kanban se poda con las opciones del tablero (T8 r2b): el filtro del tablero se queda.
  const tablero = [{ valor: 'RECIBIDA', etiqueta: 'Recibido' }, { valor: 'EMITIDO', etiqueta: 'Emitido' }];
  assert.deepEqual(fc.accionSemaforoCompras(estadoTablaInicial({ vista: 'acciones_tomadas', modo: 'kanban', estados: ['RECIBIDA'] }),
    'atrasados', tablero), { tipo: 'cambiar', cambios: { vista: 'todos', semaforo: 'vencidos' } }, 'en Kanban el filtro del tablero se queda');
  // Sin opciones (la barra sin filtro), el filtro no se toca.
  assert.deepEqual(fc.accionSemaforoCompras(estadoTablaInicial({ vista: 'en_bodega', estados: ['RECIBIDO'] }), 'atrasados', null),
    { tipo: 'cambiar', cambios: { vista: 'todos', semaforo: 'vencidos' } });
  assert.deepEqual(accion({ vista: 'acciones_tomadas', estados: ['CANCELADO'] }, 'atrasados'),
    { tipo: 'cambiar', cambios: { vista: 'todos', estados: [], semaforo: 'vencidos' } }, 'y poda lo que no');
  // El filtro de la franja: 'vencidos' del estado es 'atrasados' para BannerFlujo.
  assert.equal(typeof fc.filtroSemaforoCompras, 'function', 'filtroSemaforoCompras existe');
  assert.equal(fc.filtroSemaforoCompras(estadoTablaInicial({ semaforo: 'vencidos' })), 'atrasados');
  assert.equal(fc.filtroSemaforoCompras(estadoTablaInicial({ semaforo: 'atrasados' })), 'atrasados');
  assert.equal(fc.filtroSemaforoCompras(estadoTablaInicial({})), 'todos');
}

console.log('--- TEST 14 (B4 T14): avisosFlujoCompras (RP46) y leerEnlaceHubCompras (?tab=analisis, R13) ---');
{
  assert.equal(typeof fc.avisosFlujoCompras, 'function', 'avisosFlujoCompras existe');
  assert.deepEqual(fc.avisosFlujoCompras(FLUJO), [{ texto: '3 recepciones por confirmar', tono: 'ambar' }]);
  const con = (n) => fc.avisosFlujoCompras({ pasos: { RECEPCION: { recepciones_por_confirmar: n } } });
  assert.deepEqual(con(1), [{ texto: '1 recepción por confirmar', tono: 'ambar' }]);
  assert.deepEqual(con(1234), [{ texto: '1.234 recepciones por confirmar', tono: 'ambar' }]);
  // B4 T24 f3 (F58, D27): un texto numérico ('3') también cuenta, como en las tarjetas (numeroFinito); lo que no es un número, no.
  assert.deepEqual(con('3'), [{ texto: '3 recepciones por confirmar', tono: 'ambar' }], "'3' del servidor");
  for (const n of [0, -2, null, undefined, 'tres', Number.NaN]) assert.deepEqual(con(n), [], String(n));
  assert.deepEqual(fc.avisosFlujoCompras(null), []);
  assert.deepEqual(fc.avisosFlujoCompras({ pasos: {} }), []);
  assert.equal(typeof fc.leerEnlaceHubCompras, 'function', 'leerEnlaceHubCompras existe');
  assert.deepEqual(fc.leerEnlaceHubCompras('?tab=analisis'), { analisis: true });
  assert.deepEqual(fc.leerEnlaceHubCompras('?x=1&tab=analisis'), { analisis: true });
  for (const s of ['', '?tab=documentos', '?tab=Analisis2', null, undefined]) assert.deepEqual(fc.leerEnlaceHubCompras(s), { analisis: false }, String(s));
  assert.equal(fc.RUTA_HUB_COMPRAS, '/dashboard/compras');
}

console.log('--- TEST 15 (B4 T15): la franja de Pedidos de compra, con «Estás aquí» en Pedido de compra (RP21, D42) ---');
{
  assert.equal(typeof fc.pasosPedidosCompra, 'function', 'pasosPedidosCompra existe');
  const sinHref = (pasos) => pasos.map((p) => Object.fromEntries(Object.entries(p).filter(([campo]) => campo !== 'href')));
  const pasos = fc.pasosPedidosCompra(FLUJO, 'vigentes');
  assert.deepEqual(pasos.map((p) => p.clave), ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO']);
  assert.deepEqual(pasos.map((p) => p.total), [4, 5, 3, 2, 9], 'los conteos de /compras/flujo (conteosDePasos)');
  assert.deepEqual(pasos.map((p) => p.atrasados), [null, 2, 1, null, null]);
  assert.deepEqual(pasos.map((p) => p.esEste), [false, true, false, false, false], 'Estás aquí: Pedido de compra');
  assert.equal(pasos[1].estado, 'actual');
  // La caja de la pantalla no lleva href (D42); Lista de compras y Recepción en bodega son enlaces; En tránsito y Recibido
  // están en esta misma página (RP21): sin href, la pantalla los despacha como pestaña.
  assert.deepEqual(pasos.map((p) => p.href ?? null), ['/dashboard/compras/lista-compras', null, null, '/dashboard/compras/recepciones', null]);
  assert.ok(pasos.every((p) => !p.seleccionado), 'en Todos ninguna caja queda marcada');
  assert.deepEqual(sinHref(pasos), sinHref(pasosConConteos(PASOS_FLUJO_COMPRAS, flujo.conteosDePasos(FLUJO), { actual: 'PEC' })),
    'es pasosConConteos con conteosDePasos (D36) y actual PEC, más los enlaces');
  // La pestaña de En tránsito o Recibido marca su caja; en Kanban (sin vista) ninguna.
  assert.deepEqual(fc.pasosPedidosCompra(FLUJO, 'en_transito').map((p) => p.seleccionado), [false, false, true, false, false]);
  assert.deepEqual(fc.pasosPedidosCompra(FLUJO, 'recibidos').map((p) => p.seleccionado), [false, false, false, false, true]);
  assert.ok(fc.pasosPedidosCompra(FLUJO, 'activos').every((p) => !p.seleccionado));
  assert.ok(fc.pasosPedidosCompra(FLUJO, null).every((p) => !p.seleccionado));
  // Sin datos (cargando): los números en null (Contador pinta la barra gris), nunca 0; la caja de la pantalla, igual.
  const cargando = fc.pasosPedidosCompra(null, 'vigentes');
  assert.ok(cargando.every((p) => p.total === null && p.atrasados === null));
  assert.equal(cargando[1].esEste, true);

  assert.equal(typeof fc.vistaDePasoPedidosCompra, 'function', 'vistaDePasoPedidosCompra existe');
  assert.equal(fc.vistaDePasoPedidosCompra('TRANSITO'), 'en_transito');
  assert.equal(fc.vistaDePasoPedidosCompra('RECIBIDO'), 'recibidos');
  for (const c of ['PEC', 'LISTA', 'RECEPCION', 'OTRO', '', null, undefined, 'toString', 3]) {
    assert.equal(fc.vistaDePasoPedidosCompra(c), null, String(c));
  }

  // RP21: ?tab= con la clave de la vista del servidor (vigentes para Todos); un valor desconocido se ignora.
  assert.equal(typeof fc.leerEnlacePedidosCompra, 'function', 'leerEnlacePedidosCompra existe');
  for (const v of ['vigentes', 'activos', 'en_transito', 'recibidos', 'cancelados']) assert.equal(fc.leerEnlacePedidosCompra(`?tab=${v}`), v);
  assert.equal(fc.leerEnlacePedidosCompra('?id=8&tab=recibidos'), 'recibidos', 'convive con el enlace profundo ?id');
  assert.equal(fc.leerEnlacePedidosCompra('tab=%20recibidos%20'), 'recibidos', 'sin los espacios de los bordes');
  for (const s of ['', '?tab=todos', '?tab=Recibidos', '?tab=analisis', '?tab=en_bodega', '?tab=toString', '?id=8', null, undefined, 5]) {
    assert.equal(fc.leerEnlacePedidosCompra(s), null, String(s));
  }
  // La caja Recibido de las otras franjas (PASOS_FLUJO_COMPRAS, RP21) abre esta lista en su pestaña: la misma clave.
  const recibido = PASOS_FLUJO_COMPRAS.find((p) => p.clave === 'RECIBIDO');
  assert.equal(fc.leerEnlacePedidosCompra(recibido.ruta.slice(recibido.ruta.indexOf('?'))), 'recibidos');

  // R13: «Ver análisis» abre la pestaña Análisis del Hub de Compras (la lee leerEnlaceHubCompras).
  assert.equal(fc.ENLACE_VER_ANALISIS_COMPRAS, '/dashboard/compras?tab=analisis');
  assert.ok(fc.ENLACE_VER_ANALISIS_COMPRAS.startsWith(`${fc.RUTA_HUB_COMPRAS}?`));
  assert.deepEqual(fc.leerEnlaceHubCompras(fc.ENLACE_VER_ANALISIS_COMPRAS.slice(fc.RUTA_HUB_COMPRAS.length)), { analisis: true });
}

console.log('--- TEST 16 (B4 T15): «Con atraso» en Pedidos de compra vuelve a SU pestaña Todos (vigentes; aditivo) ---');
{
  const opciones = estadosCompras.opcionesEstadosPec;
  const conVista = (parcial, f, op = opciones) => fc.accionSemaforoCompras(estadoTablaInicial(parcial), f, op, { vistaTodos: 'vigentes' });
  assert.deepEqual(conVista({ vista: 'vigentes', semaforo: 'vencidos' }, 'todos'), { tipo: 'semaforo', valor: null });
  assert.deepEqual(conVista({ vista: 'vigentes' }, 'atrasados'), { tipo: 'semaforo', valor: 'vencidos' });
  assert.deepEqual(conVista({ vista: 'activos', estados: ['EMITIDO'] }, 'atrasados'), { tipo: 'semaforo', valor: 'vencidos' });
  assert.deepEqual(conVista({ vista: 'en_transito' }, 'atrasados'), { tipo: 'semaforo', valor: 'vencidos' });
  // Recibidos y Cancelados nunca vencen: pasan a la pestaña Todos de esta lista ('vigentes', no 'todos') con la poda de lo
  // que no vence (T8 r2b), en la misma acción.
  assert.deepEqual(conVista({ vista: 'recibidos' }, 'atrasados'), { tipo: 'cambiar', cambios: { vista: 'vigentes', semaforo: 'vencidos' } });
  assert.deepEqual(conVista({ vista: 'recibidos', estados: ['RECIBIDA'] }, 'atrasados'),
    { tipo: 'cambiar', cambios: { vista: 'vigentes', estados: [], semaforo: 'vencidos' } });
  assert.deepEqual(conVista({ vista: 'cancelados', estados: ['CANCELADO'] }, 'atrasados'),
    { tipo: 'cambiar', cambios: { vista: 'vigentes', estados: [], semaforo: 'vencidos' } });
  const tablero = [{ valor: 'RECIBIDA', etiqueta: 'Recibido' }, { valor: 'EMITIDO', etiqueta: 'Emitido' }];
  assert.deepEqual(conVista({ vista: 'recibidos', modo: 'kanban', estados: ['RECIBIDA'] }, 'atrasados', tablero),
    { tipo: 'cambiar', cambios: { vista: 'vigentes', semaforo: 'vencidos' } }, 'en Kanban el filtro del tablero se queda');
  // Aditivo: sin la opción (el Hub) y con una vista que no es un texto, lo de siempre ('todos').
  for (const extra of [undefined, {}, { vistaTodos: '' }, { vistaTodos: 5 }, null]) {
    assert.deepEqual(fc.accionSemaforoCompras(estadoTablaInicial({ vista: 'en_bodega' }), 'atrasados', opciones, extra),
      { tipo: 'cambiar', cambios: { vista: 'todos', semaforo: 'vencidos' } }, JSON.stringify(extra));
  }
}

console.log('--- TEST 17 (B4 T15): textoDiasEtapa, los días que faltan para la ETA de una etapa (un día de calendario) ---');
{
  assert.equal(typeof fc.textoDiasEtapa, 'function', 'textoDiasEtapa existe');
  const HOY = '2026-11-07';
  assert.deepEqual(fc.textoDiasEtapa('2026-11-10', HOY), { texto: '3 días restantes', tono: 'azul' });
  assert.deepEqual(fc.textoDiasEtapa('2026-11-08', HOY), { texto: '1 día restante', tono: 'azul' });
  assert.deepEqual(fc.textoDiasEtapa('2026-11-07', HOY), { texto: 'Vence hoy', tono: 'ambar' });
  assert.deepEqual(fc.textoDiasEtapa('2026-11-06', HOY), { texto: '1 día de atraso', tono: 'rojo' });
  assert.deepEqual(fc.textoDiasEtapa('2026-10-28', HOY), { texto: '10 días de atraso', tono: 'rojo' });
  // El día tal como se guarda (los 10 primeros caracteres, diaPec; RP40): una ETA con hora no se corre de día.
  assert.deepEqual(fc.textoDiasEtapa('2026-11-07T00:00:00', HOY), { texto: 'Vence hoy', tono: 'ambar' });
  assert.deepEqual(fc.textoDiasEtapa('2026-11-08T03:00:00Z', HOY), { texto: '1 día restante', tono: 'azul' });
  // Cruza meses y años por el calendario (sin horas de verano ni zonas).
  assert.deepEqual(fc.textoDiasEtapa('2027-01-02', '2026-12-30'), { texto: '3 días restantes', tono: 'azul' });
  assert.deepEqual(fc.textoDiasEtapa('2026-03-01', '2026-02-28'), { texto: '1 día restante', tono: 'azul' });
  // Sin ETA, o una que no es un día, o un hoy que no lo es: null (no se pinta nada).
  for (const eta of [null, undefined, '', 'basura', '2026-02-30', 5]) assert.equal(fc.textoDiasEtapa(eta, HOY), null, String(eta));
  assert.equal(fc.textoDiasEtapa('2026-11-10', ''), null);
  assert.equal(fc.textoDiasEtapa('2026-11-10', 'ayer'), null);
  // Sin hoy, el de Colombia (diaColombia): el mismo resultado que pasándolo.
  const manana = new Date(Date.now() + 36 * 3600 * 1000).toISOString().slice(0, 10);
  assert.deepEqual(fc.textoDiasEtapa(manana), fc.textoDiasEtapa(manana, diaColombia()));
  // T15 r1 (m10 a): con un reloj fijo a las 2026-11-08T02:00:00Z, que son las 21:00 del 07/11 en Colombia, «hoy» es el 07
  // (el día UTC ya sería el 08): un valor por defecto con el día UTC falla aquí a cualquier hora en que corra la prueba.
  conRelojFijo('2026-11-08T02:00:00Z', () => {
    assert.deepEqual(fc.textoDiasEtapa('2026-11-07'), { texto: 'Vence hoy', tono: 'ambar' }, 'el día de Colombia, no el UTC');
    assert.deepEqual(fc.textoDiasEtapa('2026-11-08'), { texto: '1 día restante', tono: 'azul' });
    assert.deepEqual(fc.textoDiasEtapa('2026-11-06'), { texto: '1 día de atraso', tono: 'rojo' });
  });
}

console.log('--- TEST 18 (B4 T15 r1, m4 y m14): el seguimiento de un PEC cancelado es de solo lectura (una sola regla) ---');
{
  assert.equal(typeof fc.seguimientoCerrado, 'function', 'seguimientoCerrado existe');
  assert.equal(fc.seguimientoCerrado('CANCELADO'), true);
  for (const e of ['BORRADOR', 'EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA', 'RECIBIDO', 'PARCIALMENTE_RECIBIDA',
    'RECIBIDA', 'COMPLETADO', 'ALGO_NUEVO', '', null, undefined]) {
    assert.equal(fc.seguimientoCerrado(e), false, String(e));
  }
  // Es la etapa de estados-compras.js (no otra lista de estados).
  for (const e of Object.keys(estadosCompras.ESTADOS_PEC)) {
    assert.equal(fc.seguimientoCerrado(e), estadosCompras.etapaPec(e) === 'cancelado', e);
  }
  assert.equal(fc.TEXTO_SEGUIMIENTO_CERRADO, 'Pedido de compra cancelado: su envío ya no se sigue.');
}

console.log('--- TEST 19 (B4 T15 r1, m2 y m6): avisoTarjetaEtapa, UNA regla para la tarjeta de cada etapa del envío ---');
{
  assert.equal(typeof fc.avisoTarjetaEtapa, 'function', 'avisoTarjetaEtapa existe');
  const HOY = '2026-11-07';
  const aviso = (extra) => fc.avisoTarjetaEtapa(etapa('PROVEEDOR_BODEGA', 'Proveedor -> Bodega', 'EN_PROCESO', extra), HOY);
  // Con el aviso del servidor, ese y solo ese: rojo si va atrasada; con 'ok', neutro (gris, como la barra: RP28, D36).
  assert.deepEqual(aviso({ eta: '2026-11-05', alert: { nivel: 'atrasado', mensaje: 'Entrega atrasada por 2 día(s)', dias_restantes: -2 } }),
    { texto: 'Entrega atrasada por 2 día(s)', tono: 'rojo', fuente: 'servidor' });
  assert.deepEqual(aviso({ eta: '2026-11-05', alert: { nivel: 'ok', mensaje: 'ETA 05/11/2026 · 0 día(s) para confirmación atrasada', dias_restantes: 0 } }),
    { texto: 'ETA 05/11/2026 · 0 día(s) para confirmación atrasada', tono: 'gris', fuente: 'servidor' },
    'el ejemplo de m6: ya no sale al lado «2 días de atraso»');
  assert.deepEqual(aviso({ eta: '2026-11-10', alert: { nivel: 'ok', mensaje: '  ' } }),
    { texto: '3 días restantes', tono: 'azul', fuente: 'dias' }, 'un aviso sin mensaje cuenta como sin aviso');
  // Sin aviso del servidor, los días que faltan para la ETA (textoDiasEtapa, el día de calendario de Colombia).
  assert.deepEqual(aviso({ eta: '2026-11-10' }), { texto: '3 días restantes', tono: 'azul', fuente: 'dias' });
  assert.deepEqual(aviso({ eta: '2026-11-07' }), { texto: 'Vence hoy', tono: 'ambar', fuente: 'dias' });
  assert.deepEqual(aviso({ eta: '2026-11-01' }), { texto: '6 días de atraso', tono: 'rojo', fuente: 'dias' });
  assert.equal(aviso({ eta: null }), null, 'sin aviso ni ETA, nada');
  // Una etapa completada o cancelada no lleva aviso (como la barra, r1 de T3B).
  for (const status of ['COMPLETADO', 'CANCELADO']) {
    assert.equal(fc.avisoTarjetaEtapa(etapa('X', 'X', status, { eta: '2026-11-01', alert: { nivel: 'atrasado', mensaje: 'Atrasada' } }), HOY), null, status);
  }
  for (const raro of [null, undefined, 5, 'x']) assert.equal(fc.avisoTarjetaEtapa(raro, HOY), null, String(raro));
  // El valor por defecto de hoy es el día de Colombia (reloj fijo, m10 a).
  conRelojFijo('2026-11-08T02:00:00Z', () => {
    assert.deepEqual(fc.avisoTarjetaEtapa(etapa('X', 'X', 'EN_PROCESO', { eta: '2026-11-07' })), { texto: 'Vence hoy', tono: 'ambar', fuente: 'dias' });
  });
}

console.log('--- TEST 20 (B4 T16A, FLUJO-compras puntos 8 y 9): la franja de Tránsito y la de Recepciones, con «Estás aquí» en la suya ---');
{
  assert.equal(typeof fc.pasosPantallaCompras, 'function', 'pasosPantallaCompras existe');
  const sinHref = (pasos) => pasos.map((p) => Object.fromEntries(Object.entries(p).filter(([campo]) => campo !== 'href')));
  const HREFS = ['/dashboard/compras/lista-compras', '/dashboard/compras/pedidos', '/dashboard/compras/transito',
    '/dashboard/compras/recepciones', '/dashboard/compras/pedidos?tab=recibidos'];
  for (const [actual, i] of [['TRANSITO', 2], ['RECEPCION', 3]]) {
    const pasos = fc.pasosPantallaCompras(FLUJO, actual);
    assert.deepEqual(pasos.map((p) => p.clave), ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO'], actual);
    assert.deepEqual(pasos.map((p) => p.total), [4, 5, 3, 2, 9], `${actual}: los conteos de /compras/flujo`);
    assert.deepEqual(pasos.map((p) => p.esEste), [0, 1, 2, 3, 4].map((k) => k === i), `${actual}: Estás aquí en su caja`);
    assert.equal(pasos[i].estado, 'actual');
    // Las demás cajas son enlaces a su pantalla; la de esta pantalla no lleva href (D42); Recibido abre la pestaña de Pedidos.
    assert.deepEqual(pasos.map((p) => p.href ?? null), HREFS.map((h, k) => (k === i ? null : h)), `${actual}: enlaces`);
    assert.deepEqual(sinHref(pasos), sinHref(pasosConConteos(PASOS_FLUJO_COMPRAS, flujo.conteosDePasos(FLUJO), { actual })),
      `${actual}: es pasosConConteos con conteosDePasos (D36)`);
  }
  // Sin datos (cargando): los números en null (la barra gris), nunca 0; la caja de la pantalla, igual.
  const cargando = fc.pasosPantallaCompras(null, 'TRANSITO');
  assert.ok(cargando.every((p) => p.total === null && p.atrasados === null));
  assert.equal(cargando[2].esEste, true);
}

console.log('--- TEST 21 (B4 T16B, FLUJO-compras punto 10): la franja de la Lista de compras, con «Estás aquí» en Lista de compras ---');
{
  const sinHref = (pasos) => pasos.map((p) => Object.fromEntries(Object.entries(p).filter(([campo]) => campo !== 'href')));
  const pasos = fc.pasosPantallaCompras(FLUJO, 'LISTA');
  assert.deepEqual(pasos.map((p) => p.clave), ['LISTA', 'PEC', 'TRANSITO', 'RECEPCION', 'RECIBIDO']);
  assert.deepEqual(pasos.map((p) => p.esEste), [true, false, false, false, false], 'Estás aquí en la primera caja');
  assert.equal(pasos[0].estado, 'actual');
  assert.equal(pasos[0].href ?? null, null, 'la caja de esta pantalla no lleva href (D42)');
  assert.deepEqual(pasos.slice(1).map((p) => p.href), ['/dashboard/compras/pedidos', '/dashboard/compras/transito',
    '/dashboard/compras/recepciones', '/dashboard/compras/pedidos?tab=recibidos']);
  assert.deepEqual(pasos.map((p) => p.total), [4, 5, 3, 2, 9], 'los conteos de /compras/flujo');
  assert.deepEqual(sinHref(pasos), sinHref(pasosConConteos(PASOS_FLUJO_COMPRAS, flujo.conteosDePasos(FLUJO), { actual: 'LISTA' })));
  // Sin datos (cargando): la barra gris, nunca 0.
  const cargando = fc.pasosPantallaCompras(null, 'LISTA');
  assert.ok(cargando.every((p) => p.total === null && p.atrasados === null));
  assert.equal(cargando[0].esEste, true);
}

console.log('--- B4 T24 f3 (m21 del backend r1): los días de alerta de la configuración del seguimiento, con el rango del servidor antes de mandar ---');
{
  assert.equal(typeof fc.errorDiasEtapas, 'function', 'errorDiasEtapas existe');
  // La paridad con el servidor (backend/app/api/v1/erp_compras.py, solo lectura): el tope y el texto del 422.
  const compras = readFileSync(new URL('../../backend/app/api/v1/erp_compras.py', import.meta.url), 'utf8');
  assert.equal(Number(compras.match(/^_MAX_DIAS_ALERTA = (\d+)$/m)?.[1]), fc.MAX_DIAS_ALERTA_ETAPA, 'el tope, el del servidor');
  assert.equal(compras.match(/^ETAPA_DIAS_INVALIDOS = "([^"]+)"$/m)?.[1], fc.TEXTO_DIAS_ETAPA_INVALIDOS, 'el texto, el del 422');
  const T = fc.TEXTO_DIAS_ETAPA_INVALIDOS;
  // Valen: vacíos (null o ausentes) y un número entre 0 y 36500 (el servidor acepta también un decimal).
  assert.equal(fc.errorDiasEtapas([{ alert_confirm_days: 2, alert_overdue_days: 1 }, { alert_confirm_days: null }, {}]), null);
  assert.equal(fc.errorDiasEtapas([{ alert_confirm_days: 0, alert_overdue_days: 36500 }]), null, 'los bordes');
  assert.equal(fc.errorDiasEtapas([{ alert_overdue_days: 1.5 }]), null, 'un decimal también lo acepta el servidor');
  assert.equal(fc.errorDiasEtapas([]), null);
  assert.equal(fc.errorDiasEtapas(null), null);
  // No valen: fuera del rango, un texto o algo que no es un número finito; la primera da el texto del servidor.
  for (const malo of [-1, 36501, Number.NaN, Infinity, '3', true]) {
    assert.equal(fc.errorDiasEtapas([{ alert_confirm_days: 2 }, { alert_overdue_days: malo }]), T, String(malo));
    assert.equal(fc.errorDiasEtapas([{ alert_confirm_days: malo }]), T, `confirmación ${String(malo)}`);
  }
  // El cableado: la ventana valida antes del PUT y, si el servidor dice que no (su 422), muestra su texto sin cerrarse ni perder lo escrito.
  const ped = readFileSync(new URL('../src/app/dashboard/compras/pedidos/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const guardar = ped.slice(ped.indexOf('const saveStages = async () => {'), ped.indexOf('const { confirmar } = useAvisos();'));
  assert.match(guardar, /const errorDias = errorDiasEtapas\(stages\);\s*if \(errorDias\) \{ onToast\(errorDias, 'error'\); return; \}\s*setSaving\(true\);/);
  assert.match(guardar, /\} catch \(e\) \{ onToast\(e, 'error'\); \}/, 'el 422: su texto (textoDeError), sin cerrar la ventana');
  assert.ok(!/onClose\(\)|setStages\(/.test(guardar), 'guardar no cierra la ventana ni toca lo escrito');
}

console.log('--- B4 T24 f3 r1 (F63): una sola regla de tono para la tarjeta de etapa y un solo sinónimo de «vencidos» ---');
{
  assert.equal(typeof estadosCompras.esSemaforoVencidos, 'function', 'esSemaforoVencidos existe');
  assert.equal(estadosCompras.esSemaforoVencidos('vencidos'), true);
  assert.equal(estadosCompras.esSemaforoVencidos('atrasados'), true, 'el sinónimo de la franja');
  for (const otro of ['todos', null, undefined, '', 'VENCIDOS']) assert.equal(estadosCompras.esSemaforoVencidos(otro), false, String(otro));
  // Las dos que lo usan dicen lo mismo con los dos nombres.
  for (const semaforo of ['vencidos', 'atrasados']) {
    assert.equal(fc.filtroSemaforoCompras({ semaforo }), 'atrasados');
    assert.equal(estadosCompras.textoVacioPec({ semaforo }).titulo, 'Ningún pedido de compra con la entrega vencida.');
  }
  assert.equal(fc.filtroSemaforoCompras({ semaforo: 'todos' }), 'todos');
  // El tono de la tarjeta de etapa sale de la MISMA regla que los avisos de la barra (RP28: rojo solo con «atrasado»).
  for (const [nivel, tono] of [['atrasado', 'rojo'], ['ok', 'gris'], [undefined, 'gris']]) {
    const stage = { stage: 'X', status: 'EN_PROCESO', alert: { mensaje: 'Va tarde', nivel } };
    assert.deepEqual(fc.avisoTarjetaEtapa(stage, '2026-11-07'), { texto: 'Va tarde', tono, fuente: 'servidor' }, String(nivel));
    assert.deepEqual(fc.pasosDeTracking([stage])[0].avisos, [{ texto: 'Va tarde', tono }], `la barra: ${nivel}`);
  }
  // En el fuente: avisoTarjetaEtapa llama a avisosDeEtapa; textoVacioPec y filtroSemaforoCompras, a esSemaforoVencidos.
  const flujoFuente = readFileSync(new URL('../src/lib/flujo-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const tarjeta = flujoFuente.slice(flujoFuente.indexOf('export function avisoTarjetaEtapa('), flujoFuente.indexOf('\n}\n', flujoFuente.indexOf('export function avisoTarjetaEtapa(')));
  assert.match(tarjeta, /const \[delServidor\] = avisosDeEtapa\(stage\);/);
  assert.ok(!/alert\?\.nivel === 'atrasado'/.test(tarjeta), 'sin la copia de la regla de tono');
  assert.match(flujoFuente, /return esSemaforoVencidos\(estado\?\.semaforo\) \? 'atrasados' : 'todos';/);
  const ecFuente = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(ecFuente, /export function textoVacioPec\(estado, ayuda = null\) \{\s*if \(esSemaforoVencidos\(estado\?\.semaforo\)\)/);
}

console.log('\nOK: test_flujo_compras.mjs');
