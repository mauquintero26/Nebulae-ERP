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
// B4 T14: lo nuevo del Hub de Compras por el espacio de nombres, para que la falta de una función no tape los demás rojos.
import * as ec from '../src/lib/estados-compras.js';
import { estadoTablaInicial } from '../src/lib/tabla.js';
// T14 r1: la regla de la columna con filtro (kanban.js) y los textos de error (avisos.js).
import * as kanbanLib from '../src/lib/kanban.js';
import { textoDeError } from '../src/lib/avisos.js';

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
  // T14 r1 (m6): el día de entrega sale de diaPec en los dos lados (la celda y la regla de vencido), sin repetir la regla.
  assert.match(fuente, /export function esPecVencido\(p, hoy = diaColombia\(\)\) \{\s*const dia = diaPec\(p\?\.fecha_entrega_estimada\);/);
  assert.equal((fuente.match(/\.slice\(0, 10\)/g) ?? []).length, 1, 'la extracción del día, una sola vez (en diaPec)');
  // T14 r1 (m7): el número del servidor es numeroFinito de kpis.js (una sola política), sin copia local.
  assert.match(fuente, /import \{[^}]*\bnumeroFinito\b[^}]*\} from '\.\/kpis\.js'/);
  assert.match(fuente, /monto: numeroFinito\(p\?\.total_cop\),/);
  assert.ok(!/const montoDe\b/.test(fuente), 'sin montoDe');
}

console.log('--- TEST 16 (B4 T14): VISTAS_PEC, el espejo de las vistas de /compras/pedidos (core/estados_compras.py) ---');
{
  const V = ec.VISTAS_PEC;
  assert.ok(V, 'VISTAS_PEC existe');
  assert.deepEqual(Object.keys(V), ['todos', 'vigentes', 'activos', 'borradores', 'pedidos', 'en_transito', 'en_bodega',
    'recibidos', 'cancelados', 'no_resueltos', 'acciones_tomadas', 'transito_logistica']);
  assert.deepEqual(V.todos, GRUPOS_PEC.vigentes, "R9: 'todos' son los vigentes");
  assert.deepEqual(V.vigentes, GRUPOS_PEC.vigentes);
  assert.deepEqual(V.activos, GRUPOS_PEC.activos);
  assert.deepEqual(V.no_resueltos, GRUPOS_PEC.activos, '«No resueltos» = activos');
  assert.deepEqual(V.borradores, ['BORRADOR']);
  assert.deepEqual(V.pedidos, ['BORRADOR', 'EMITIDO', 'ENVIADO']);
  assert.deepEqual(V.en_transito, ['EN_TRANSITO', 'PENDIENTE_ENTREGA']);
  assert.deepEqual(V.en_bodega, ['RECIBIDO', 'PARCIALMENTE_RECIBIDA'], 'la pestaña de recepciones es en_bodega');
  assert.deepEqual(V.recibidos, ['RECIBIDA', 'COMPLETADO']);
  assert.deepEqual(V.cancelados, ['CANCELADO']);
  assert.deepEqual(V.acciones_tomadas, ['RECIBIDA', 'COMPLETADO', 'CANCELADO'], '«Acciones tomadas» = recibido + cancelado');
  assert.deepEqual(V.transito_logistica, ['EMITIDO', 'ENVIADO', 'EN_TRANSITO', 'PENDIENTE_ENTREGA', 'RECIBIDO', 'PARCIALMENTE_RECIBIDA']);
  assert.throws(() => { V.nueva = []; }, TypeError);
  assert.throws(() => { V.todos.push('X'); }, TypeError);
}

console.log('--- TEST 17 (B4 T14): las opciones de «Filtrar estado» por pestaña y por columna del tablero ---');
{
  assert.equal(typeof ec.opcionesEstadosPec, 'function', 'opcionesEstadosPec existe');
  assert.deepEqual(ec.opcionesEstadosPec('en_transito'), [
    { valor: 'EN_TRANSITO', etiqueta: 'En tránsito' }, { valor: 'PENDIENTE_ENTREGA', etiqueta: 'Pendiente de entrega' }]);
  assert.deepEqual(ec.opcionesEstadosPec('acciones_tomadas').map((o) => o.valor), ['RECIBIDA', 'COMPLETADO', 'CANCELADO']);
  assert.deepEqual(ec.opcionesEstadosPec('todos').map((o) => o.valor), GRUPOS_PEC.vigentes, 'todos: sin Cancelado');
  // Sin vista, o una que no existe: los 10 estados, con su etiqueta de R9 y en el orden de las etapas.
  assert.deepEqual(ec.opcionesEstadosPec(null), ETIQUETAS_PEC.map(([valor, etiqueta]) => ({ valor, etiqueta })));
  assert.deepEqual(ec.opcionesEstadosPec('rara'), ec.opcionesEstadosPec(undefined));
  // La misma referencia para la misma vista (BarraTabla y accionPestana la llaman en cada render).
  assert.equal(ec.opcionesEstadosPec('pedidos'), ec.opcionesEstadosPec('pedidos'));
  assert.throws(() => { ec.opcionesEstadosPec('pedidos').push({}); }, TypeError);
  // El tablero: una opción por columna (su estado principal y el título de la columna, como el de Pedidos de venta).
  assert.deepEqual(ec.OPCIONES_ESTADOS_TABLERO_PEC, [
    { valor: 'BORRADOR', etiqueta: 'Borrador' }, { valor: 'EMITIDO', etiqueta: 'Emitido' },
    { valor: 'EN_TRANSITO', etiqueta: 'En tránsito' }, { valor: 'RECIBIDO', etiqueta: 'En bodega' },
    { valor: 'RECIBIDA', etiqueta: 'Recibido' }, { valor: 'CANCELADO', etiqueta: 'Cancelado' }]);
  assert.throws(() => { ec.OPCIONES_ESTADOS_TABLERO_PEC.push({}); }, TypeError);
}

console.log('--- TEST 18 (B4 T14): la consulta de cada columna del tablero del Hub en modo servidor (R11, C4, D39) ---');
{
  const [borrador, emitido, , enBodega, , cancelado] = COLUMNAS_PEC;
  // T14 r1 (m4, m14): la regla es estadosDeColumnaLista de kanban.js (la misma de Ventas); estados-compras.js no tiene copia.
  const deColumna = /** @type {any} */ (kanbanLib).estadosDeColumnaLista;
  assert.equal(typeof deColumna, 'function', 'estadosDeColumnaLista está en kanban.js');
  assert.equal(/** @type {any} */ (ec).estadosDeColumnaPec, undefined, 'sin la copia estadosDeColumnaPec');
  // Sin filtro, los de la columna; con su estado principal, la columna entera; si no, el cruce; sin cruce, [].
  assert.deepEqual(deColumna(emitido, []), ['EMITIDO', 'ENVIADO']);
  assert.deepEqual(deColumna(emitido, null), ['EMITIDO', 'ENVIADO']);
  assert.deepEqual(deColumna(emitido, ['EMITIDO']), ['EMITIDO', 'ENVIADO']);
  assert.deepEqual(deColumna(emitido, ['ENVIADO', 'BORRADOR']), ['ENVIADO']);
  assert.deepEqual(deColumna(enBodega, ['EMITIDO']), []);
  assert.equal(typeof ec.consultaColumnaPec, 'function', 'consultaColumnaPec existe');
  const estado = estadoTablaInicial({
    vista: 'en_transito', modo: 'kanban', semaforo: 'vencidos', paso: 'PEC', q: '  ana ', estados: ['EMITIDO'],
    orden: 'monto', pagina: 3,
  });
  // Sin vista (todos los PEC: Cancelado también trae sus pedidos) ni paso; la búsqueda, el semáforo y el filtro de estados
  // del MISMO estado; el orden, el límite y el desplazamiento de la columna.
  assert.equal(ec.consultaColumnaPec(estado, emitido, { orden: 'atencion', limit: 25, offset: 0 }),
    'semaforo=vencidos&q=ana&estados=EMITIDO,ENVIADO&orden=atencion&limit=25&offset=0');
  assert.equal(ec.consultaColumnaPec(estado, borrador, { orden: 'atencion', limit: 25, offset: 0 }), null, 'sin cruce: no se pide');
  const sinFiltro = estadoTablaInicial({ vista: 'todos', modo: 'kanban' });
  assert.equal(ec.consultaColumnaPec(sinFiltro, cancelado, { orden: 'reciente', limit: 0, offset: 0 }),
    'estados=CANCELADO&orden=reciente&limit=0&offset=0', 'una plegada pide limit=0, y Cancelado no lleva la vista vigentes');
  assert.equal(ec.consultaColumnaPec(sinFiltro, emitido, { orden: 'atencion', limit: 50, offset: 50 }),
    'estados=EMITIDO,ENVIADO&orden=atencion&limit=50&offset=50');
}

console.log('--- TEST 19 (B4 T14): vistaPuedeVencer y diaPec (RP40: el día tal como se guarda) ---');
{
  assert.equal(typeof ec.vistaPuedeVencer, 'function', 'vistaPuedeVencer existe');
  for (const v of ['todos', 'vigentes', 'activos', 'pedidos', 'en_transito', 'no_resueltos', 'transito_logistica', null, undefined, 'rara']) {
    assert.equal(ec.vistaPuedeVencer(v), true, String(v));
  }
  for (const v of ['borradores', 'en_bodega', 'recibidos', 'cancelados', 'acciones_tomadas']) {
    assert.equal(ec.vistaPuedeVencer(v), false, v);
  }
  assert.equal(typeof ec.diaPec, 'function', 'diaPec existe');
  assert.equal(ec.diaPec('2026-11-05T00:00:00'), '2026-11-05');
  assert.equal(ec.diaPec('2026-11-05T23:30:00Z'), '2026-11-05', 'sin pasarlo a Colombia');
  assert.equal(ec.diaPec(' 2026-11-05 '), '2026-11-05');
  for (const raro of ['2026-02-30', 'basura', '', null, undefined, 20261105]) assert.equal(ec.diaPec(raro), '', String(raro));
}

console.log('--- TEST 20 (B4 T14): tarjetaPec, la tarjeta del tablero del Hub (el «Vencido» lo manda el servidor) ---');
{
  assert.equal(typeof ec.tarjetaPec, 'function', 'tarjetaPec existe');
  assert.deepEqual(ec.tarjetaPec({
    id: 7, numero: 'PEC-20260007', supplier_name: 'Textiles del Norte', ven_numero: 'PVEN-20260001', total_cop: 120000,
    estado: 'EMITIDO', is_overdue: true, fecha_entrega_estimada: '2026-11-01T00:00:00',
  }), {
    numero: 'PEC-20260007', tipo: 'PEC', titulo: 'Textiles del Norte', subtitulo: 'PVEN-20260001', monto: 120000,
    estado: infoEstadoPec('EMITIDO'), chips: [{ texto: 'Vencido', tono: 'rose' }], tiempo: 'Entrega 1 nov 2026', atrasada: true,
  });
  // Sin proveedor, sin fecha ni monto, a tiempo y con un estado heredado (humanizado, nunca «Borrador»).
  const raro = ec.tarjetaPec({ id: 8, numero: 'PEC-8', estado: 'CONFIRMADA', supplier_name: '  ', ven_numero: '', is_overdue: false });
  assert.deepEqual(raro, {
    numero: 'PEC-8', tipo: 'PEC', titulo: 'Sin proveedor', subtitulo: null, monto: null, estado: infoEstadoPec('CONFIRMADA'),
    chips: [], tiempo: null, atrasada: false,
  });
  assert.equal(raro.estado.label, 'Confirmada');
  // is_overdue es la regla del servidor: la tarjeta no la recalcula (una RECIBIDA con la fecha vieja no es vencida).
  assert.equal(ec.tarjetaPec({ numero: 'PEC-9', estado: 'RECIBIDA', fecha_entrega_estimada: '2020-01-01T00:00:00' }).atrasada, false);
  assert.equal(ec.tarjetaPec({ numero: 'PEC-9', estado: 'EMITIDO', fecha_entrega_estimada: '2020-01-01T00:00:00', is_overdue: false }).atrasada,
    false, 'si el servidor dice que no está vencido, la tarjeta tampoco');
  assert.equal(ec.tarjetaPec({ numero: 'PEC-9', estado: 'EMITIDO', total_cop: '35000' }).monto, 35000);
  assert.equal(ec.tarjetaPec({ numero: 'PEC-9', estado: 'EMITIDO', total_cop: 'x' }).monto, null);
}

console.log('--- TEST 21 (B4 T14): la cancelación masiva del Hub (R9: solo lo que el servidor deja cancelar; en serie) ---');
{
  assert.equal(typeof ec.repartirCancelacionPec, 'function', 'repartirCancelacionPec existe');
  const filas = [
    { id: 1, numero: 'PEC-1', estado: 'BORRADOR' }, { id: 2, numero: 'PEC-2', estado: 'EN_TRANSITO' },
    { id: 3, numero: 'PEC-3', estado: 'CANCELADO' }, { id: 4, numero: 'PEC-4', estado: 'PARCIALMENTE_RECIBIDA' },
    null, { id: 5, numero: '', estado: 'RECIBIDA' }, { id: 6, numero: 'PEC-6', estado: 'CONFIRMADA' },
  ];
  const { cancelables, omitidos } = ec.repartirCancelacionPec(filas);
  assert.deepEqual(cancelables.map((f) => f.id), [1, 2, 6], 'un desconocido cuenta como emitido: se puede cancelar');
  assert.deepEqual(omitidos, [
    { id: 3, numero: 'PEC-3', motivo: 'ya está cancelado' },
    { id: 4, numero: 'PEC-4', motivo: 'ya llegó a bodega: su estado lo lleva la recepción' },
    { id: 5, numero: '#5', motivo: 'ya llegó a bodega: su estado lo lleva la recepción' },
  ]);
  assert.deepEqual(ec.repartirCancelacionPec(null), { cancelables: [], omitidos: [] });

  assert.equal(typeof ec.resumenCancelacionPec, 'function', 'resumenCancelacionPec existe');
  const r1 = ec.resumenCancelacionPec([{ numero: 'PEC-1', ok: true }, { numero: 'PEC-2', ok: true }]);
  assert.deepEqual(r1, { exitosos: 2, fallidos: [], mensaje: '2 pedidos de compra cancelados', tipo: 'ok' });
  assert.equal(ec.resumenCancelacionPec([{ numero: 'PEC-1', ok: true }]).mensaje, '1 pedido de compra cancelado');
  const r2 = ec.resumenCancelacionPec([
    { numero: 'PEC-1', ok: true },
    { numero: 'PEC-2', ok: false, error: 'PEC-2 tiene 1 recepción(es) en bodega: no se puede cancelar.' },
    { numero: 'PEC-6', ok: false, error: '  ' },
  ], [{ numero: 'PEC-3', motivo: 'ya está cancelado' }]);
  assert.deepEqual(r2.fallidos, [
    { numero: 'PEC-2', error: 'PEC-2 tiene 1 recepción(es) en bodega: no se puede cancelar.',
      texto: 'PEC-2 tiene 1 recepción(es) en bodega: no se puede cancelar.' },
    { numero: 'PEC-6', error: 'el servidor no dio detalle del error', texto: 'PEC-6: el servidor no dio detalle del error' },
  ]);
  assert.equal(r2.mensaje, '1 pedido de compra cancelado. No se pudieron cancelar: PEC-2, PEC-6. Se omitió PEC-3: ya está cancelado.');
  assert.equal(r2.tipo, 'err');
  const r3 = ec.resumenCancelacionPec([{ numero: 'PEC-2', ok: false, error: 'Sin conexión' }]);
  assert.equal(r3.mensaje, 'No se pudo cancelar: PEC-2');
  assert.equal(ec.resumenCancelacionPec([], [{ numero: 'PEC-3', motivo: 'ya está cancelado' }]).mensaje,
    'No se canceló ningún pedido de compra. Se omitió PEC-3: ya está cancelado.');
}

console.log('--- TEST 22 (B4 T14): los separadores por mes cuando la tabla va por fecha de compra ---');
{
  assert.equal(typeof ec.ordenPorFechaDeCompra, 'function', 'ordenPorFechaDeCompra existe');
  assert.equal(ec.ordenPorFechaDeCompra('compra'), true);
  assert.equal(ec.ordenPorFechaDeCompra('-compra'), true);
  for (const o of ['atencion', 'reciente', 'entrega', '', null, undefined]) assert.equal(ec.ordenPorFechaDeCompra(o), false, String(o));
  assert.equal(typeof ec.grupoMesPec, 'function', 'grupoMesPec existe');
  // fecha_compra es un instante (UTC sin zona): su mes es el de Colombia. Es el campo con que ordena el servidor
  // ('compra' = fecha_compra, los nulos al final): sin ella, «Sin fecha de compra» (el último tramo), no created_at.
  assert.equal(ec.grupoMesPec({ fecha_compra: '2026-11-01T03:00:00', created_at: '2026-11-01T03:00:00' }), '2026-10');
  assert.equal(ec.grupoMesPec({ fecha_compra: '2026-11-15T12:00:00Z' }), '2026-11');
  assert.equal(ec.grupoMesPec({ fecha_compra: '2026-12-05' }), '2026-12', 'un día de calendario no se corre');
  assert.equal(ec.grupoMesPec({ fecha_compra: null, created_at: '2026-11-15T12:00:00' }), 'sin_fecha');
  assert.equal(ec.grupoMesPec({ fecha_compra: 'basura' }), 'sin_fecha');
  assert.equal(ec.grupoMesPec(null), 'sin_fecha');
  assert.equal(typeof ec.tituloMesPec, 'function', 'tituloMesPec existe');
  assert.equal(ec.tituloMesPec('2026-11'), 'Noviembre de 2026');
  assert.equal(ec.tituloMesPec('2027-01'), 'Enero de 2027');
  assert.equal(ec.tituloMesPec('2026-12'), 'Diciembre de 2026');
  assert.equal(ec.tituloMesPec('2026-00'), 'Sin fecha de compra');
  assert.equal(ec.tituloMesPec('sin_fecha'), 'Sin fecha de compra');
  assert.equal(ec.tituloMesPec('2026-13'), 'Sin fecha de compra');
}

console.log('--- TEST 24 (B4 T14 r1: I1, m10, m15): cancelar en serie y lo que hace la pantalla después ---');
{
  assert.equal(typeof ec.cancelarPecsEnSerie, 'function', 'cancelarPecsEnSerie existe');
  assert.equal(typeof ec.despuesDeCancelarPec, 'function', 'despuesDeCancelarPec existe');
  const pecs = [{ id: 1, numero: 'PEC-1', estado: 'EMITIDO' }, { id: 2, numero: 'PEC-2', estado: 'EN_TRANSITO' },
    { id: 3, numero: 'PEC-3', estado: 'BORRADOR' }];
  const conflicto = Object.assign(new Error('PEC-2 tiene 1 recepción(es) en bodega: no se puede cancelar.'), { status: 409 });
  const invalido = Object.assign(new Error('Indica el motivo de la cancelación (mínimo 5 caracteres).'), { status: 422 });
  // En serie (R9): nunca dos PATCH en vuelo, en el orden de la lista; cada falla guarda el MISMO error y su texto.
  let enVuelo = 0;
  let maximo = 0;
  const orden = [];
  const resultados = await ec.cancelarPecsEnSerie(pecs, async (p) => {
    enVuelo += 1;
    maximo = Math.max(maximo, enVuelo);
    orden.push(p.id);
    await new Promise((r) => setTimeout(r, 5));
    enVuelo -= 1;
    if (p.id === 2) throw conflicto;
    if (p.id === 3) throw invalido;
  });
  assert.equal(maximo, 1, 'nunca dos en vuelo');
  assert.deepEqual(orden, [1, 2, 3]);
  assert.deepEqual(resultados.map((r) => [r.id, r.numero, r.ok]), [[1, 'PEC-1', true], [2, 'PEC-2', false], [3, 'PEC-3', false]]);
  assert.equal(resultados[1].err, conflicto, 'el mismo error');
  assert.equal(resultados[1].error, textoDeError(conflicto));
  assert.equal(resultados[2].error, textoDeError(invalido));
  assert.deepEqual(await ec.cancelarPecsEnSerie(null, async () => {}), []);

  const omitidos = [{ id: 9, numero: 'PEC-9', motivo: 'ya está cancelado' }];
  const ok = (p) => ({ id: p.id, numero: p.numero, ok: true });
  // Todos bien: salen de la selección (también los omitidos), sin pendientes ni error; se recargan la lista y los pedidos
  // de venta del panel de consolidación (I1: sus PVEN vuelven a Pendiente de compra).
  assert.deepEqual(ec.despuesDeCancelarPec(pecs, pecs.map(ok), omitidos), {
    fuera: ['1', '2', '3', '9'], pendientes: [], recargar: true, recargarVentas: true, recargarDetalle: false,
    mensajeOk: '3 pedidos de compra cancelados. Se omitió PEC-9: ya está cancelado.', error: null,
  });
  // Mezcla: el 409 pide recargar (recargarTrasError); quedan los que fallaron, con una línea por PEC en el error.
  const mezcla = ec.despuesDeCancelarPec(pecs, resultados, omitidos);
  assert.deepEqual(mezcla.fuera, ['1', '9']);
  assert.deepEqual(mezcla.pendientes, [pecs[1], pecs[2]]);
  assert.deepEqual([mezcla.recargar, mezcla.recargarVentas, mezcla.recargarDetalle], [true, true, true]);
  assert.equal(mezcla.mensajeOk, '1 pedido de compra cancelado');
  assert.ok(mezcla.error instanceof Error);
  assert.equal(mezcla.error.message, `${textoDeError(conflicto)}\nPEC-3: ${textoDeError(invalido)}`);
  // Todos mal con un 422: nada sale de la selección, no se recarga (el dato no cambió), ningún aviso de éxito.
  const malos = [pecs[0], pecs[2]].map((p) => ({ id: p.id, numero: p.numero, ok: false, error: textoDeError(invalido), err: invalido }));
  const todosMal = ec.despuesDeCancelarPec([pecs[0], pecs[2]], malos, []);
  assert.deepEqual(todosMal.fuera, []);
  assert.deepEqual(todosMal.pendientes, [pecs[0], pecs[2]]);
  assert.deepEqual([todosMal.recargar, todosMal.recargarVentas, todosMal.recargarDetalle, todosMal.mensajeOk], [false, false, false, null]);
  assert.equal(todosMal.error.message, `PEC-1: ${textoDeError(invalido)}\nPEC-3: ${textoDeError(invalido)}`);
  // Uno solo con el 409: se relanza el MISMO error (el modal muestra el detail del servidor) y se recarga, también el
  // detalle del panel abierto (m10); los PVEN no, porque no se canceló nada.
  const uno = ec.despuesDeCancelarPec([pecs[1]], [resultados[1]], []);
  assert.equal(uno.error, conflicto);
  assert.deepEqual([uno.recargar, uno.recargarVentas, uno.recargarDetalle, uno.mensajeOk], [true, false, true, null]);
  assert.deepEqual(uno.pendientes, [pecs[1]]);
  // Uno solo sin el objeto del error: un Error con su texto (nunca resuelve en silencio).
  const sinErr = ec.despuesDeCancelarPec([pecs[0]], [{ id: 1, numero: 'PEC-1', ok: false, error: 'Sin conexión' }], []);
  assert.ok(sinErr.error instanceof Error);
  assert.equal(sinErr.error.message, 'PEC-1: Sin conexión');
}

console.log('--- TEST 23 (B4 T14): el Hub de Compras (compras/page.tsx) cablea las piezas y el servidor ---');
{
  const hub = readFileSync(new URL('../src/app/dashboard/compras/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/@ts-nocheck/.test(hub), 'la página se tipa');
  // Carga del servidor (R5, C3, C4, D39, D40): la lista, el tablero, la franja y las tarjetas.
  assert.match(hub, /useEstadoTabla\(ID_HUB, INICIAL_HUB\)/);
  assert.match(hub, /const ID_HUB = 'compras\.hub';/);
  assert.match(hub, /const INICIAL_HUB = \{ vista: 'todos', orden: 'atencion' \};/, 'R8: lo vencido primero');
  assert.match(hub, /ruta: '\/compras\/pedidos', estado, conConteos: true, esperar: !listo, despachar, activo: !enAnalisis,/);
  assert.match(hub, /const EXTRA_TABLERO = \{ limit: 0 \};/, 'en Kanban la lista va sin filas');
  assert.match(hub, /extra: enKanban \? EXTRA_TABLERO : extraDeLaLista/);
  assert.match(hub, /const extraDeLaLista = useMemo\(\(\) => \(\{ orden: estado\.orden \|\| 'atencion' \}\), \[estado\.orden\]\);/,
    'R8: sin orden (el tercer clic en un título) sigue lo vencido primero, no el created_at del servidor');
  assert.match(hub, /consultaColumnaPec\(estado, columna, \{ orden, limit, offset \}\)/, 'la consulta de cada columna es la de la lib');
  assert.match(hub, /activo: listo && enKanban && !enAnalisis,/);
  assert.match(hub, /useResumenFlujo<DatosFlujo>\('\/compras\/flujo', recargaFlujo\)/);
  assert.match(hub, /`\/compras\/stats\?periodo=\$\{PERIODO_KPI\}`/);
  assert.ok(!/['"`]\/compras\/stats['"`]/.test(hub), 'ya no se pide /compras/stats sin período');
  // Tablero: las reglas de R9 y el cancelar con motivo (C15c).
  assert.match(hub, /regla=\{reglaSoltarPec\}/);
  assert.match(hub, /tarjetaDe=\{tarjetaPec\}/);
  assert.match(hub, /tablero\.recargar\(\[\.\.\.columnas\]\)/, 'D39: tras la acción, solo el origen y el destino');
  assert.match(hub, /<ModalMotivo[\s\S]{0,400}efectos=\{\[\.\.\.EFECTOS_CANCELAR_PEC\]\}/);
  assert.match(hub, /estado: 'CANCELADO', motivo/, 'el PATCH lleva el motivo');
  // T14 r1 (m15): la página solo ejecuta lo que deciden cancelarPecsEnSerie y despuesDeCancelarPec.
  assert.match(hub, /const resultados = await cancelarPecsEnSerie\(pecs, \(p\) => _apiFetch\(/);
  assert.match(hub, /const r = despuesDeCancelarPec\(pecs, resultados, omitidos\);/);
  assert.match(hub, /if \(r\.recargar\) \{\s*if \(columnas\) tablero\.recargar\(\[\.\.\.columnas\]\);\s*recargarTrasCambio\(\);\s*\}/);
  assert.match(hub, /if \(r\.recargarVentas\) setVueltaVentas\(\(n\) => n \+ 1\);/, 'I1: los PVEN del panel se vuelven a pedir');
  assert.match(hub, /if \(desdePanel && r\.recargarDetalle\) setVueltaDetalle\(\(n\) => n \+ 1\);/, 'm10: y el detalle del panel');
  assert.match(hub, /\}, \[pec && pec\.id, vueltaDetalle\]\);/, 'el panel relee su detalle con vueltaDetalle');
  assert.match(hub, /setCancelacion\(\{ \.\.\.cancelacion, pecs: r\.pendientes, omitidos: \[\] \}\);\s*throw r\.error;/);
  assert.match(hub, /catch \(err\) \{\s*if \(recargarTrasError\(err\)\) recargarTrasCambio\(\);\s*throw err;\s*\}/,
    'el tablero relanza el error del PATCH para deshacer y avisar');
  // T14 r1 (m1): las cajas y «Con atraso» con las opciones de la Lista (accionPestana adentro).
  assert.match(hub, /accionPasoHubCompras\(estado, clave, opcionesEstadosPec\)/);
  assert.match(hub, /accionSemaforoCompras\(estado, f, enKanban \? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec\)/);
  // T14 r1 (m9): si fallan los pedidos de venta del panel, se dice (no «No hay PVEN…») y se puede reintentar.
  assert.ok(!/\.catch\(\(\) => \[\]\)/.test(hub), 'el error de /ventas/pedidos no se traga');
  assert.match(hub, /No se pudieron cargar los pedidos de venta\./);
  assert.match(hub, /errorVentas=\{ventas\.error\}/);
  // Cierre T14 (re-revisión r1): el panel decide con el error, el catch lo guarda y un éxito lo limpia.
  assert.match(hub, /\{errorVentas \? \(/, 'el panel muestra el error cuando lo hay');
  assert.match(hub, /\.catch\(\(err: unknown\) => \{ if \(vigente\) setVentas\(\(v\) => \(\{ filas: v\.filas, error: err \}\)\); \}\)/,
    'el catch de /ventas/pedidos guarda el error');
  assert.match(hub, /if \(vigente\) setVentas\(\{ filas: Array\.isArray\(r\)[^\n]*, error: null \}\); \}\)/,
    'un éxito limpia el error');
  // T14 r1 (m11, m12, m13): foco de la barra masiva, nombres del panel, «Pago y logística» y el respaldo de F. compra.
  assert.match(hub, /const FOCO_OSCURO = '[^']*focus-visible:outline-white';/);
  assert.equal((hub.match(/\$\{FOCO_OSCURO\}/g) ?? []).length, 2, 'los dos botones de la barra masiva');
  assert.match(hub, /aria-label=\{`Acciones de \$\{/);
  assert.match(hub, /aria-label="Cerrar el panel"/);
  assert.match(hub, /Pago y logística/);
  assert.ok(!/Pago & Logistica/.test(hub));
  assert.match(hub, /titleCelda: \(p\) => \(p\.fecha_compra \? textoInstante\(p\.fecha_compra\)\s*: p\.created_at \? 'Fecha de creación \(sin fecha de compra\)' : 'Sin fecha de compra'\)/,
    'm13: el title dice «Fecha de creación» solo cuando falta la fecha de compra');
  assert.ok(!/estado: ?'RECIBIDO'/.test(hub) && !/estado: ?'EN_TRANSITO'/.test(hub), 'ningún PATCH a mano a tránsito o recibido');
  assert.match(hub, /transicionesPec\(/, 'el panel y el menú solo ofrecen lo que acepta el servidor');
  // Franja (D42, RP46): sin «No resueltos» y con el aviso de recepciones; sin «Ajustar tiempos» (R9).
  assert.match(hub, /titulo="Flujo de compras"/);
  assert.match(hub, /regla=\{textoReglaCompras\(\)\}/);
  assert.match(hub, /avisos=\{avisosFlujoCompras\(flujo\.datos\)\}/);
  assert.ok(!/noResueltos/.test(hub), 'Compras no pasa noResueltos');
  assert.ok(!/Ajustar [Tt]iempos/.test(hub) && !/pecAlertDias|showConfig/.test(hub), 'se fue «Ajustar tiempos»');
  // Análisis (R2, R13, RP69): la pestaña estándar con el asistente de hoy; sin chat simulado.
  assert.match(hub, /<PanelAnalisisPerezoso[\s\S]{0,300}modulo="compras"[\s\S]{0,200}endpoint="\/compras\/analisis"[\s\S]{0,200}acento="purple"/);
  assert.match(hub, /titulo: 'Nebulae AI · Analista de Compras & Suministros'/);
  assert.ok(!/setTimeout\(/.test(hub), 'sin el chat simulado');
  assert.ok(!/aiChatHistory|handleAiQuestion|donutMode|topSuppliersLimit/.test(hub));
  assert.ok(!/En construcci/.test(hub), 'R2: el aviso vive solo en AsistenteEnConstruccion.tsx');
  // Se fueron las tablas y los arreglos en memoria de antes (C4) y los estados locales (C10).
  assert.ok(!/PEC_ESTADOS|getKanbanCol|handleDrop|kpiCards|colorMap|filteredData|compras\/pedidos\?limit=200/.test(hub));
  // B1 a B3 que se conservan (D27): el panel de consolidación de PVEN lee los pedidos de venta y crea el PEC consolidado.
  assert.match(hub, /\/ventas\/pedidos\?limit=200/);
  assert.match(hub, /Crear PEC Consolidado/);
  assert.match(hub, /Consolidado de PVEN: /);
}

console.log('\nOK: test_estados_compras.mjs');
