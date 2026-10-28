/**
 * frontend/tests/test_estados_compras.mjs
 * B4 T2 (R9, C10; KANBAN-compras, KANBAN-logistica, KPI-compras, FLUJO-compras, TABLA-compras; RP40, RP53, RP67, RP93):
 * estados, etapas, columnas y reglas de los documentos de Compras en frontend/src/lib/estados-compras.js, espejo de
 * backend/app/core/estados_compras.py. La paridad con Python la comprueba backend/tests/test_paridad_estados_compras.py.
 * Reemplaza test_estados_pec.mjs y test_grupos_estado.mjs del diseño (R27).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ESTADOS_PEC, infoEstadoPec, ETAPAS_PEC, etapaPec, GRUPOS_PEC, esPecVencido,
  TRANSICIONES_PEC_PATCH, ESTADOS_PEC_MANUALES, transicionesPec, COLUMNAS_PEC, columnaPec, reglaSoltarPec,
  EFECTOS_CANCELAR_PEC, pasoFlujoPec,
  ESTADOS_RECEPCION, GRUPOS_RECEPCION, COLUMNAS_RECEPCION, grupoRecepcion,
  ESTADOS_ITEM_LISTA, COLUMNAS_LISTA,
  ESTADOS_TRASLADO, COLUMNAS_TRASLADO, GRUPOS_OPERACION, grupoOperacion,
  ESTADOS_STOCK, COLUMNAS_STOCK,
} from '../src/lib/estados-compras.js';
import { diaColombia } from '../src/lib/fechas-colombia.js';

// R9 / ETIQUETAS_ESTADO['PEC'] (textos_actividad.py, T1C), en el orden de las etapas.
const ETIQUETAS_PEC = [
  ['BORRADOR', 'Borrador'],
  ['EMITIDO', 'Emitido'],
  ['ENVIADO', 'Enviado al proveedor'],
  ['EN_TRANSITO', 'En tránsito'],
  ['PENDIENTE_ENTREGA', 'Pendiente de entrega'],
  ['RECIBIDO', 'Llegó a bodega'],
  ['PARCIALMENTE_RECIBIDA', 'Recibido en parte'],
  ['RECIBIDA', 'Recibido'],
  ['COMPLETADO', 'Completado'],
  ['CANCELADO', 'Cancelado'],
];
const CLAVES_COLUMNA = ['cerrada', 'clave', 'estados', 'titulo', 'tono'];
const RAROS = ['CONFIRMADA', 'ENVIADA', 'ALGO_NUEVO', '', null, undefined, 5];

/** Cada estado de `estados` cae en exactamente una columna, y ninguna columna trae un estado que no está en la lista. */
function cadaEstadoEnUnaColumna(columnas, estados, nombre) {
  for (const e of estados) {
    const donde = columnas.filter((c) => c.estados.includes(e)).map((c) => c.clave);
    assert.equal(donde.length, 1, `${nombre}: ${e} está en ${JSON.stringify(donde)}`);
  }
  const todos = columnas.flatMap((c) => c.estados);
  assert.deepEqual([...todos].sort(), [...estados].sort(), `${nombre}: las columnas traen exactamente esos estados`);
}

/** La forma de columna de kanban.js (T3A la valida con definirColumnas): {clave, titulo, tono, estados, cerrada}. */
function formaDeColumnas(columnas, nombre) {
  assert.ok(Object.isFrozen(columnas), `${nombre} congelada`);
  const claves = columnas.map((c) => c.clave);
  assert.equal(new Set(claves).size, claves.length, `${nombre}: claves repetidas`);
  for (const c of columnas) {
    assert.deepEqual(Object.keys(c).sort(), CLAVES_COLUMNA, `${nombre}.${c.clave}`);
    assert.equal(typeof c.clave, 'string');
    assert.ok(c.titulo && typeof c.titulo === 'string', `${nombre}.${c.clave}: título`);
    assert.match(c.tono, /^[a-z]+$/, `${nombre}.${c.clave}: tono`);
    assert.ok(Array.isArray(c.estados) && c.estados.length > 0, `${nombre}.${c.clave}: estados`);
    assert.equal(typeof c.cerrada, 'boolean', `${nombre}.${c.clave}: cerrada`);
    assert.ok(Object.isFrozen(c) && Object.isFrozen(c.estados), `${nombre}.${c.clave} congelada`);
  }
}

function clasesCompletas(tabla, nombre) {
  for (const [e, info] of Object.entries(tabla)) {
    assert.match(info.clases.bg, /^bg-[a-z]+-\d+$/, `${nombre}.${e}`);
    assert.match(info.clases.text, /^text-[a-z]+-\d+$/, `${nombre}.${e}`);
    assert.match(info.clases.border, /^border-[a-z]+-\d+$/, `${nombre}.${e}`);
  }
}

console.log('--- TEST 1: ESTADOS_PEC con las etiquetas de R9 (RP67: «Recibido en parte») ---');
{
  assert.deepEqual(Object.keys(ESTADOS_PEC), ETIQUETAS_PEC.map(([e]) => e));
  for (const [e, etiqueta] of ETIQUETAS_PEC) {
    assert.equal(ESTADOS_PEC[e].label, etiqueta, e);
    assert.equal(infoEstadoPec(e), ESTADOS_PEC[e], e);
  }
  assert.equal(infoEstadoPec('PARCIALMENTE_RECIBIDA').label, 'Recibido en parte');
  clasesCompletas(ESTADOS_PEC, 'ESTADOS_PEC');
  // las clases que hoy usa compras/pedidos (PEC_ESTADOS de page.tsx)
  assert.deepEqual(ESTADOS_PEC.EMITIDO.clases, { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' });
  assert.deepEqual(ESTADOS_PEC.CANCELADO.clases, { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' });
  // un estado desconocido sale humanizado y en gris, nunca crudo ni como «Borrador»
  assert.equal(infoEstadoPec('ALGO_NUEVO').label, 'Algo nuevo');
  assert.equal(infoEstadoPec('CONFIRMADA').label, 'Confirmada');
  assert.deepEqual(infoEstadoPec('ALGO_NUEVO').clases, { bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });
  assert.equal(infoEstadoPec(null).label, '');
  assert.equal(infoEstadoPec('constructor').label, 'Constructor');
  // T2 r1: el código se recorta antes de buscarlo (como etiqueta_estado de Python)
  assert.equal(infoEstadoPec(' BORRADOR'), ESTADOS_PEC.BORRADOR);
  assert.equal(infoEstadoPec('EN_TRANSITO '), ESTADOS_PEC.EN_TRANSITO);
  assert.equal(infoEstadoPec(' PENDIENTE_CONFIRMACION').label, 'Pendiente confirmacion');
}

console.log('--- TEST 2: ETAPAS_PEC y etapaPec (un desconocido cuenta como emitido) ---');
{
  assert.deepEqual(JSON.parse(JSON.stringify(ETAPAS_PEC)), {
    borrador: ['BORRADOR'],
    emitido: ['EMITIDO', 'ENVIADO'],
    en_transito: ['EN_TRANSITO', 'PENDIENTE_ENTREGA'],
    en_bodega: ['RECIBIDO', 'PARCIALMENTE_RECIBIDA'],
    recibido: ['RECIBIDA', 'COMPLETADO'],
    cancelado: ['CANCELADO'],
  });
  for (const [etapa, estados] of Object.entries(ETAPAS_PEC)) {
    for (const e of estados) assert.equal(etapaPec(e), etapa, e);
  }
  for (const raro of RAROS) assert.equal(etapaPec(raro), 'emitido', String(raro));
}

console.log('--- TEST 3: GRUPOS_PEC (activos, vigentes, vencibles) ---');
{
  assert.deepEqual([...GRUPOS_PEC.activos], ['EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA', 'RECIBIDO', 'PARCIALMENTE_RECIBIDA']);
  assert.deepEqual([...GRUPOS_PEC.vigentes], ETIQUETAS_PEC.map(([e]) => e).filter((e) => e !== 'CANCELADO'));
  assert.deepEqual([...GRUPOS_PEC.vencibles], ['EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA']);
  assert.deepEqual(Object.keys(GRUPOS_PEC), ['activos', 'vigentes', 'vencibles']);
}

console.log('--- TEST 4: COLUMNAS_PEC y columnaPec: cada estado en una sola columna ---');
{
  formaDeColumnas(COLUMNAS_PEC, 'COLUMNAS_PEC');
  assert.deepEqual(COLUMNAS_PEC.map((c) => c.titulo), ['Borrador', 'Emitido', 'En tránsito', 'En bodega', 'Recibido', 'Cancelado']);
  assert.deepEqual(COLUMNAS_PEC.map((c) => c.clave), Object.keys(ETAPAS_PEC), 'una columna por etapa');
  assert.deepEqual(COLUMNAS_PEC.filter((c) => c.cerrada).map((c) => c.clave), ['recibido', 'cancelado'], 'Recibido y Cancelado plegadas');
  for (const c of COLUMNAS_PEC) assert.deepEqual([...c.estados], [...ETAPAS_PEC[c.clave]], c.clave);
  cadaEstadoEnUnaColumna(COLUMNAS_PEC, ETIQUETAS_PEC.map(([e]) => e), 'COLUMNAS_PEC');
  for (const [e] of ETIQUETAS_PEC) assert.equal(columnaPec(e), etapaPec(e), e);
  // TABLA-compras / KPI-compras: RECIBIDA ya no cae en Borrador
  assert.equal(columnaPec('RECIBIDA'), 'recibido');
  assert.equal(columnaPec('PARCIALMENTE_RECIBIDA'), 'en_bodega');
  assert.equal(columnaPec('RECIBIDO'), 'en_bodega');
  for (const raro of RAROS) assert.equal(columnaPec(raro), 'emitido', String(raro));
}

console.log('--- TEST 5: transiciones a mano (espejo de TRANSICIONES_PEC_PATCH) ---');
{
  assert.deepEqual([...ESTADOS_PEC_MANUALES], ['EMITIDO', 'CANCELADO']);
  assert.deepEqual(JSON.parse(JSON.stringify(TRANSICIONES_PEC_PATCH)), {
    BORRADOR: ['EMITIDO', 'CANCELADO'],
    EMITIDO: ['CANCELADO'],
    ENVIADO: ['CANCELADO'],
    EN_TRANSITO: ['CANCELADO'],
    PENDIENTE_ENTREGA: ['CANCELADO'],
    RECIBIDO: [],
    PARCIALMENTE_RECIBIDA: [],
    RECIBIDA: [],
    COMPLETADO: [],
    CANCELADO: [],
  });
  assert.deepEqual([...transicionesPec('BORRADOR')], ['EMITIDO', 'CANCELADO']);
  assert.deepEqual([...transicionesPec('RECIBIDA')], []);
  // un desconocido se trata como EMITIDO: solo cancelar
  for (const raro of RAROS) assert.deepEqual([...transicionesPec(raro)], ['CANCELADO'], String(raro));
  // EMITIDO solo desde BORRADOR
  assert.deepEqual(Object.keys(TRANSICIONES_PEC_PATCH).filter((e) => TRANSICIONES_PEC_PATCH[e].includes('EMITIDO')), ['BORRADOR']);
}

console.log('--- TEST 6: reglaSoltarPec (la forma de resultado de kanban.js) ---');
{
  const pec = (estado) => ({ id: 7, numero: 'PEC-7', estado });
  const regla = (estado, destino) => reglaSoltarPec(pec(estado), columnaPec(estado), destino);
  const RECEPCIONES = { texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' };
  const TRANSITO = { texto: 'Ir a Mercancía en tránsito', href: '/dashboard/compras/transito' };

  assert.deepEqual(regla('BORRADOR', 'emitido'), { tipo: 'cambio', estado: 'EMITIDO' });
  assert.deepEqual(regla('EMITIDO', 'en_transito'), {
    tipo: 'bloqueado', motivo: 'El tránsito se marca al iniciar el seguimiento del envío.', enlace: TRANSITO,
  });
  for (const destino of ['en_bodega', 'recibido']) {
    for (const origen of ['BORRADOR', 'EMITIDO', 'EN_TRANSITO']) {
      assert.deepEqual(regla(origen, destino), { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: RECEPCIONES },
        `${origen} → ${destino}`);
    }
  }
  assert.deepEqual(regla('RECIBIDO', 'recibido'), { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: RECEPCIONES });
  // cancelar: acción (la pantalla pide el motivo) solo si transicionesPec lo permite
  for (const e of ['BORRADOR', 'EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA']) {
    assert.deepEqual(regla(e, 'cancelado'), { tipo: 'accion', accion: 'cancelar' }, e);
  }
  for (const e of ['RECIBIDO', 'PARCIALMENTE_RECIBIDA', 'RECIBIDA', 'COMPLETADO']) {
    const r = regla(e, 'cancelado');
    assert.equal(r.tipo, 'bloqueado', e);
    assert.equal(r.motivo, 'Ya llegó a bodega: su estado lo lleva la recepción.', e);
  }
  // desde Cancelado nada se reabre
  for (const destino of ['borrador', 'emitido', 'en_transito', 'en_bodega', 'recibido']) {
    const r = regla('CANCELADO', destino);
    assert.equal(r.tipo, 'bloqueado', destino);
    assert.match(r.motivo, /no se puede reabrir/, destino);
    assert.equal(r.motivo, 'Está cancelado y no se puede reabrir.');
  }
  // → Emitido solo desde Borrador; → Borrador nunca
  for (const e of ['EN_TRANSITO', 'RECIBIDO', 'RECIBIDA']) {
    assert.deepEqual(regla(e, 'emitido'), { tipo: 'bloqueado', motivo: 'Solo un pedido en Borrador se puede marcar como Emitido.' }, e);
  }
  for (const e of ['EMITIDO', 'EN_TRANSITO', 'RECIBIDA']) {
    assert.deepEqual(regla(e, 'borrador'), { tipo: 'bloqueado', motivo: 'Un pedido emitido no vuelve a Borrador.' }, e);
  }
  // un estado desconocido se trata como emitido: se puede cancelar, no emitir
  assert.deepEqual(regla('CONFIRMADA', 'cancelado'), { tipo: 'accion', accion: 'cancelar' });
  assert.equal(regla('CONFIRMADA', 'emitido').tipo, 'ninguno', 'el desconocido ya está en la columna Emitido');
  // misma columna: ninguno
  for (const c of COLUMNAS_PEC) assert.deepEqual(reglaSoltarPec(pec(c.estados[0]), c.clave, c.clave), { tipo: 'ninguno' }, c.clave);
  // todo resultado tiene una de las cuatro formas; una columna que no existe es un error de programación
  for (const [e] of ETIQUETAS_PEC) {
    for (const c of COLUMNAS_PEC) assert.ok(['ninguno', 'bloqueado', 'cambio', 'accion'].includes(regla(e, c.clave).tipo), `${e} → ${c.clave}`);
  }
  assert.throws(() => reglaSoltarPec(pec('BORRADOR'), 'borrador', 'otra'), /columna/i);
}

console.log('--- TEST 7: EFECTOS_CANCELAR_PEC (RP93) ---');
{
  assert.deepEqual([...EFECTOS_CANCELAR_PEC], [
    'Los pedidos de venta vinculados vuelven a Pendiente de compra.',
    'Los productos vuelven a la Lista de compras.',
  ]);
  assert.throws(() => { EFECTOS_CANCELAR_PEC.push('x'); }, TypeError);
}

console.log('--- TEST 8: esPecVencido (R9, RP40): emitido o en tránsito con el día de entrega antes de hoy ---');
{
  const HOY = '2026-10-28';
  const p = (estado, fecha) => ({ estado, fecha_entrega_estimada: fecha });
  assert.equal(esPecVencido(p('EN_TRANSITO', null), HOY), false, 'sin fecha no vence');
  assert.equal(esPecVencido(p('EN_TRANSITO', undefined), HOY), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', ''), HOY), false);
  assert.equal(esPecVencido(p('RECIBIDA', '2026-10-01T00:00:00'), HOY), false, 'recibido nunca vence');
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-10-01T00:00:00'), HOY), true, 'en tránsito vencido');
  assert.equal(esPecVencido(p('EMITIDO', '2026-10-27T23:59:59'), HOY), true, 'ayer');
  assert.equal(esPecVencido(p('PENDIENTE_ENTREGA', '2026-10-27'), HOY), true, 'fecha de calendario');
  // RP40: el borde: una entrega guardada hoy a las 00:00 (sin pasarla a Colombia) no está vencida hoy
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-10-28T00:00:00'), HOY), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-10-28T00:00:00Z'), HOY), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-10-28T23:00:00'), HOY), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-11-01T00:00:00'), HOY), false, 'futuro');
  // solo emitido y en tránsito; en bodega, recibido, borrador y cancelado nunca
  for (const e of ['BORRADOR', 'RECIBIDO', 'PARCIALMENTE_RECIBIDA', 'RECIBIDA', 'COMPLETADO', 'CANCELADO']) {
    assert.equal(esPecVencido(p(e, '2020-01-01T00:00:00'), HOY), false, e);
  }
  for (const e of ['EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA', 'CONFIRMADA']) {
    assert.equal(esPecVencido(p(e, '2020-01-01T00:00:00'), HOY), true, `${e} (el desconocido cuenta como emitido)`);
  }
  // sin pedido o con una fecha que no es fecha: no vence
  assert.equal(esPecVencido(null, HOY), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', 'basura'), HOY), false);
  // T2 r1: un día que no existe en el calendario no vence (aunque como texto sea «anterior» a hoy)
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-02-30T00:00:00'), '2026-03-01'), false);
  assert.equal(esPecVencido(p('EMITIDO', '2026-13-01'), '2027-01-01'), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', '2026-02-28T00:00:00'), '2026-03-01'), true, 'el día anterior sí existe');
  // por defecto, hoy = diaColombia()
  assert.equal(esPecVencido(p('EN_TRANSITO', '2020-01-01T00:00:00')), true);
  assert.equal(esPecVencido(p('EN_TRANSITO', '2999-01-01T00:00:00')), false);
  assert.equal(esPecVencido(p('EN_TRANSITO', `${diaColombia()}T00:00:00`)), false, 'hoy en Colombia no está vencido');
}

console.log('--- TEST 9: pasoFlujoPec (FLUJO-compras) ---');
{
  const esperado = { BORRADOR: 'PEC', EMITIDO: 'PEC', ENVIADO: 'PEC', EN_TRANSITO: 'TRANSITO', PENDIENTE_ENTREGA: 'TRANSITO',
    RECIBIDO: 'RECEPCION', PARCIALMENTE_RECIBIDA: 'RECEPCION', RECIBIDA: 'RECIBIDO', COMPLETADO: 'RECIBIDO', CANCELADO: null };
  for (const [e, paso] of Object.entries(esperado)) assert.equal(pasoFlujoPec(e), paso, e);
  for (const raro of RAROS) assert.equal(pasoFlujoPec(raro), 'PEC', String(raro));
}

console.log('--- TEST 10: recepciones (ESTADOS_RECEPCION = ETIQUETAS_ESTADO["ENINV"], GRUPOS_RECEPCION, columnas) ---');
{
  assert.deepEqual(Object.fromEntries(Object.entries(ESTADOS_RECEPCION).map(([e, i]) => [e, i.label])), {
    BORRADOR: 'Por contar', COMPLETADA: 'Recibida', COMPLETADA_LOGISTICA: 'Solo registro logístico', CANCELADA: 'Cancelada',
  });
  clasesCompletas(ESTADOS_RECEPCION, 'ESTADOS_RECEPCION');
  assert.deepEqual(JSON.parse(JSON.stringify(GRUPOS_RECEPCION)), {
    por_confirmar: ['BORRADOR'], confirmadas: ['COMPLETADA', 'COMPLETADA_LOGISTICA'], canceladas: ['CANCELADA'],
  });
  assert.equal(grupoRecepcion('BORRADOR'), 'por_confirmar');
  assert.equal(grupoRecepcion('COMPLETADA_LOGISTICA'), 'confirmadas');
  assert.equal(grupoRecepcion('CANCELADA'), 'canceladas');
  for (const raro of ['PENDIENTE', 'CONFIRMADA', '', null, undefined]) assert.equal(grupoRecepcion(raro), null, String(raro));
  formaDeColumnas(COLUMNAS_RECEPCION, 'COLUMNAS_RECEPCION');
  // T2 r1: la columna de trabajo se llama «Por contar» (spec KANBAN-logistica 5, con su «Contar y confirmar»); las otras,
  // como las pestañas (RP41/D6). Las claves son las de GRUPOS_RECEPCION.
  assert.deepEqual(COLUMNAS_RECEPCION.map((c) => [c.clave, c.titulo]), [
    ['por_confirmar', 'Por contar'], ['confirmadas', 'Confirmadas'], ['canceladas', 'Canceladas'],
  ]);
  cadaEstadoEnUnaColumna(COLUMNAS_RECEPCION, Object.keys(ESTADOS_RECEPCION), 'COLUMNAS_RECEPCION');
  for (const e of Object.keys(ESTADOS_RECEPCION)) {
    assert.equal(COLUMNAS_RECEPCION.find((c) => c.estados.includes(e)).clave, grupoRecepcion(e), e);
  }
  assert.equal(COLUMNAS_RECEPCION[0].cerrada, false, 'Por contar es la columna de trabajo');
}

console.log('--- TEST 11: ítems de la lista de compras (DESCARTADO no se muestra) ---');
{
  assert.deepEqual(Object.fromEntries(Object.entries(ESTADOS_ITEM_LISTA).map(([e, i]) => [e, i.label])), {
    PENDIENTE: 'Pendiente', EN_PEDIDO: 'En pedido', RECIBIDO: 'Recibido',
  });
  assert.ok(!Object.hasOwn(ESTADOS_ITEM_LISTA, 'DESCARTADO'));
  clasesCompletas(ESTADOS_ITEM_LISTA, 'ESTADOS_ITEM_LISTA');
  formaDeColumnas(COLUMNAS_LISTA, 'COLUMNAS_LISTA');
  assert.deepEqual(COLUMNAS_LISTA.map((c) => c.titulo), ['Pendiente', 'En pedido', 'Recibido']);
  cadaEstadoEnUnaColumna(COLUMNAS_LISTA, Object.keys(ESTADOS_ITEM_LISTA), 'COLUMNAS_LISTA');
  assert.ok(!COLUMNAS_LISTA.some((c) => c.estados.includes('DESCARTADO')), 'DESCARTADO no tiene columna');
}

console.log('--- TEST 12: traslados (ESTADOS_TRASLADO, COLUMNAS_TRASLADO y grupoOperacion) ---');
{
  assert.deepEqual(Object.fromEntries(Object.entries(ESTADOS_TRASLADO).map(([e, i]) => [e, i.label])), {
    DRAFT: 'Borrador', READY: 'Listo', DONE: 'Hecho', CANCELLED: 'Cancelado',
  });
  clasesCompletas(ESTADOS_TRASLADO, 'ESTADOS_TRASLADO');
  formaDeColumnas(COLUMNAS_TRASLADO, 'COLUMNAS_TRASLADO');
  assert.deepEqual(COLUMNAS_TRASLADO.map((c) => c.titulo), ['Borrador', 'Listo', 'Hecho', 'Cancelado']);
  cadaEstadoEnUnaColumna(COLUMNAS_TRASLADO, Object.keys(ESTADOS_TRASLADO), 'COLUMNAS_TRASLADO');
  assert.deepEqual(JSON.parse(JSON.stringify(GRUPOS_OPERACION)), {
    en_proceso: ['DRAFT', 'READY'], completadas: ['DONE'], canceladas: ['CANCELLED'],
  });
  assert.equal(grupoOperacion('DRAFT'), 'en_proceso');
  assert.equal(grupoOperacion('READY'), 'en_proceso');
  assert.equal(grupoOperacion('DONE'), 'completadas');
  assert.equal(grupoOperacion('CANCELLED'), 'canceladas');
  for (const raro of ['DONE ', 'done', '', null, undefined]) assert.equal(grupoOperacion(raro), null, String(raro));
}

console.log('--- TEST 13: estado del stock (RP53): ESTADOS_STOCK y COLUMNAS_STOCK ---');
{
  assert.deepEqual(Object.keys(ESTADOS_STOCK), ['agotado', 'bajo_minimo', 'abastecido'], 'las claves de core/existencias.py');
  assert.deepEqual(Object.fromEntries(Object.entries(ESTADOS_STOCK).map(([e, i]) => [e, i.label])), {
    agotado: 'Agotado', bajo_minimo: 'Bajo el mínimo', abastecido: 'Bien abastecido',
  });
  // cada uno con su tono (el de Badge: components/ui/colors.ts)
  assert.deepEqual(Object.fromEntries(Object.entries(ESTADOS_STOCK).map(([e, i]) => [e, i.tono])), {
    agotado: 'danger', bajo_minimo: 'warning', abastecido: 'success',
  });
  clasesCompletas(ESTADOS_STOCK, 'ESTADOS_STOCK');
  formaDeColumnas(COLUMNAS_STOCK, 'COLUMNAS_STOCK');
  assert.deepEqual(COLUMNAS_STOCK.map((c) => [c.clave, c.titulo]), [
    ['agotado', 'Agotado'], ['bajo_minimo', 'Bajo el mínimo'], ['abastecido', 'Bien abastecido'],
  ]);
  cadaEstadoEnUnaColumna(COLUMNAS_STOCK, Object.keys(ESTADOS_STOCK), 'COLUMNAS_STOCK');
  assert.ok(COLUMNAS_STOCK.every((c) => !c.cerrada), 'tablero solo para ver: nada plegado');
}

console.log('--- TEST 14: todo es inmutable ---');
{
  assert.throws(() => { ESTADOS_PEC.NUEVO = {}; }, TypeError);
  assert.throws(() => { ESTADOS_PEC.BORRADOR.label = 'x'; }, TypeError);
  assert.throws(() => { ESTADOS_PEC.BORRADOR.clases.bg = 'x'; }, TypeError);
  assert.throws(() => { ETAPAS_PEC.emitido.push('X'); }, TypeError);
  assert.throws(() => { GRUPOS_PEC.activos.push('X'); }, TypeError);
  assert.throws(() => { TRANSICIONES_PEC_PATCH.RECIBIDA.push('CANCELADO'); }, TypeError);
  assert.throws(() => { transicionesPec('ALGO').push('EMITIDO'); }, TypeError);
  assert.throws(() => { COLUMNAS_PEC.push({}); }, TypeError);
  assert.throws(() => { COLUMNAS_PEC[0].estados.push('X'); }, TypeError);
  assert.throws(() => { infoEstadoPec('ALGO').clases.bg = 'x'; }, TypeError);
  assert.throws(() => { ESTADOS_STOCK.agotado.tono = 'x'; }, TypeError);
  assert.equal(ESTADOS_PEC.BORRADOR.label, 'Borrador');
}

console.log('--- TEST 15: JS puro (sin React ni DOM) y congelar importado, no copiado ---');
{
  const fuente = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8');
  assert.ok(!/from ['"]react/.test(fuente), 'no importa React');
  assert.ok(!/\b(window|document)\./.test(fuente), 'no usa el DOM');
  assert.ok(/import \{[^}]*\bcongelar\b[^}]*\} from '\.\/estados-pedido\.js'/.test(fuente), 'congelar sale de estados-pedido.js');
  assert.ok(!/function congelar\(/.test(fuente), 'congelar no se copia');
  assert.ok(!/esPecAtrasado/.test(fuente), 'RP28/RP93: no se crea esPecAtrasado');
}

console.log('\nOK: test_estados_compras.mjs');
