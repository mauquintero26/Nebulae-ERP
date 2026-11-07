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
// T15 r1 (I1): cancelarConMotivo de las dos páginas se ejecuta de verdad (transpilado), con dobles de lo que toca.
import { createRequire } from 'node:module';

const tsLib = createRequire(import.meta.url)('typescript');

/**
 * T15 r1 (I1): la función `async function cancelarConMotivo(…) {…}` de una página (el fuente), transpilada a JS y lista
 * para ejecutarse con un entorno de dobles (cada nombre que usa la función: la cancelación en curso, el tablero, las
 * recargas…). Así la prueba mira lo que HACE, no cómo está escrita.
 */
function cancelarConMotivoDe(fuente) {
  const inicio = fuente.indexOf('async function cancelarConMotivo(');
  assert.ok(inicio >= 0, 'la página tiene cancelarConMotivo');
  const abre = fuente.indexOf('{', fuente.indexOf(')', inicio));
  let nivel = 0;
  let fin = -1;
  for (let j = abre; j < fuente.length; j += 1) {
    if (fuente[j] === '{') nivel += 1;
    else if (fuente[j] === '}') { nivel -= 1; if (nivel === 0) { fin = j; break; } }
  }
  assert.ok(fin > abre, 'cancelarConMotivo cierra');
  const js = tsLib.transpileModule(`(${fuente.slice(inicio, fin + 1)})`, { compilerOptions: { target: tsLib.ScriptTarget.ES2020 } })
    .outputText.replace(/^"use strict";\s*/, '').trim().replace(/;$/, '');
  return (entorno) => new Function('entorno', `with (entorno) { return ${js}; }`)(entorno);
}

/** Corre cancelarConMotivo de `fuente` con un PEC y las `columnas` del tablero; devuelve lo que llamó y el error. */
async function correrCancelar(fuente, { columnas, desdePanel, falla }) {
  const llamadas = [];
  const pec = { id: 7, numero: 'PEC-7', estado: 'EMITIDO' };
  const entorno = {
    cancelacion: { pecs: [pec], omitidos: [], columnas, desdePanel },
    autorActual: () => 'Prueba',
    cancelarPecsEnSerie: ec.cancelarPecsEnSerie,
    despuesDeCancelarPec: ec.despuesDeCancelarPec,
    _apiFetch: async () => {
      if (falla) throw Object.assign(new Error('PEC-7 tiene 1 recepción(es) en bodega: no se puede cancelar.'), { status: 409 });
      return {};
    },
    setSeleccion: () => {},
    tablero: { recargar: (...a) => llamadas.push(a.length ? `tablero ${a[0].join(',')}` : 'tablero entero') },
    recargarTrasCambio: () => llamadas.push('lista'),
    setVueltaVentas: () => llamadas.push('ventas'),
    avisar: () => {},
    closePecPanel: () => llamadas.push('cerrar panel'),
    setSelectedPec: () => llamadas.push('cerrar panel'),
    setVueltaDetalle: () => llamadas.push('detalle'),
    setCancelacion: () => {},
  };
  let error = null;
  try { await cancelarConMotivoDe(fuente)(entorno)('El proveedor cerró'); } catch (err) { error = err; }
  return { llamadas, error };
}

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

console.log('--- TEST 25 (B4 T15, KANBAN-compras punto 6): tarjetaPedidoCompra, la tarjeta del tablero de Pedidos de compra ---');
{
  assert.equal(typeof ec.tarjetaPedidoCompra, 'function', 'tarjetaPedidoCompra existe');
  const base = {
    id: 1, numero: 'PEC-1', estado: 'EMITIDO', supplier_name: 'ACME', ven_numero: 'PVEN-9', total_cop: 1000,
    fecha_entrega_estimada: '2026-11-03T00:00:00', is_overdue: true,
  };
  // Lo de tarjetaPec (T14: número, proveedor, PVEN, monto, estado, «Entrega …» y el «Vencido» del servidor) y, fuera de
  // la bodega, sin acción principal.
  assert.deepEqual(ec.tarjetaPedidoCompra(base), { ...ec.tarjetaPec(base), accionPrincipal: null });
  // En bodega (la columna de trabajo de la bodega): «Recepcionar» lleva a Recepciones, donde se elige el PEC que llegó.
  const recepcionar = { texto: 'Recepcionar', href: '/dashboard/compras/recepciones', tono: 'teal' };
  const llego = ec.tarjetaPedidoCompra({ ...base, estado: 'RECIBIDO', is_overdue: false });
  assert.deepEqual(llego.chips, []);
  assert.deepEqual(llego.accionPrincipal, recepcionar);
  // Recibido en parte: además, el chip «Falta por recibir».
  const parcial = ec.tarjetaPedidoCompra({ ...base, estado: 'PARCIALMENTE_RECIBIDA', is_overdue: false });
  assert.deepEqual(parcial.chips, [{ texto: 'Falta por recibir', tono: 'amber' }]);
  assert.deepEqual(parcial.accionPrincipal, recepcionar);
  assert.equal(parcial.estado.label, 'Recibido en parte');
  // El chip «Vencido» sigue siendo el del servidor (nunca se recalcula) y va primero.
  const raro = ec.tarjetaPedidoCompra({ ...base, estado: 'PARCIALMENTE_RECIBIDA', is_overdue: true });
  assert.deepEqual(raro.chips.map((c) => c.texto), ['Vencido', 'Falta por recibir']);
  // Recibido, cancelado, borrador o en tránsito: sin «Recepcionar».
  for (const estado of ['RECIBIDA', 'COMPLETADO', 'CANCELADO', 'BORRADOR', 'EN_TRANSITO', 'ALGO_NUEVO']) {
    assert.equal(ec.tarjetaPedidoCompra({ ...base, estado }).accionPrincipal, null, estado);
  }
  assert.deepEqual(ec.tarjetaPedidoCompra(null), { ...ec.tarjetaPec(null), accionPrincipal: null });
  // Aditivo: la tarjeta del Hub (tarjetaPec) no cambia: sin acción principal ni el chip nuevo.
  const hub = ec.tarjetaPec({ ...base, estado: 'PARCIALMENTE_RECIBIDA', is_overdue: false });
  assert.ok(!('accionPrincipal' in hub));
  assert.deepEqual(hub.chips, []);
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
  // T15 r1 (I1, D27): la recarga del tablero y de la lista tras cancelar se prueba por comportamiento en TEST 28 (antes
  // esta línea fijaba el texto `if (columnas) tablero.recargar([...columnas]); recargarTrasCambio();`).
  assert.match(hub, /if \(r\.recargar\) \{[\s\S]{0,500}recargarTrasCambio\(\);/);
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
  // T15 r1 (m3, m11; D27): las columnas viven en compras/columnas-pec.tsx, compartidas con Pedidos de compra; la misma
  // protección de m13, ahora en ese archivo, y el Hub las arma con su celda de Acciones y su clase de fila.
  const columnasPecFuente = readFileSync(new URL('../src/app/dashboard/compras/columnas-pec.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(columnasPecFuente, /titleCelda: \(p\) => \(p\.fecha_compra \? textoInstante\(p\.fecha_compra\)\s*: p\.created_at \? 'Fecha de creación \(sin fecha de compra\)' : 'Sin fecha de compra'\)/,
    'm13: el title dice «Fecha de creación» solo cuando falta la fecha de compra');
  assert.match(hub, /const COLUMNAS_TABLA_HUB = columnasPec<FilaPec>\(\(p\) => <CeldaAcciones p=\{p\} \/>\);/);
  assert.match(hub, /claseFila=\{claseDeFilaPec\}/);
  assert.ok(!/function CeldaNumero|const MARCA_VENCIDO|id: 'proveedor'/.test(hub), 'el Hub ya no tiene su copia de las columnas');
  assert.ok(!/estado: ?'RECIBIDO'/.test(hub) && !/estado: ?'EN_TRANSITO'/.test(hub), 'ningún PATCH a mano a tránsito o recibido');
  assert.match(hub, /transicionesPec\(/, 'el panel y el menú solo ofrecen lo que acepta el servidor');
  // T15 r1 (m4, m14): con el PEC cancelado, el panel no pinta la barra del seguimiento (seguimientoCerrado).
  assert.match(hub, /\{seguimientoCerrado\(detail\.estado\) \? \([\s\S]{0,200}\{TEXTO_SEGUIMIENTO_CERRADO\}[\s\S]{0,160}<PasosFlujo variante="barra"/);
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

console.log('--- TEST 26 (B4 T15): Pedidos de compra (compras/pedidos/page.tsx) cablea las piezas y el servidor ---');
{
  const pag = readFileSync(new URL('../src/app/dashboard/compras/pedidos/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/@ts-nocheck/.test(pag), 'la página se tipa');
  // Carga del servidor (R5, C3, C4, D39, D40): el estado único, la lista con sus conteos, el tablero, la franja y las tarjetas.
  assert.match(pag, /const ID_PEDIDOS = 'compras\.pedidos';/);
  assert.match(pag, /const INICIAL_PEDIDOS = \{ vista: 'vigentes', orden: 'atencion' \};/, 'Todos = vigentes (RP21) y lo vencido primero (R8)');
  assert.match(pag, /useEstadoTabla\(ID_PEDIDOS, INICIAL_PEDIDOS\)/);
  // T15 r1 (m10 b): las llamadas, sin fijar el formato de la línea (un cambio sin efecto no las rompe).
  const llamadaListado = /useListado<FilaPec>\(\{([\s\S]*?)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/ruta: '\/compras\/pedidos'/, /conConteos: true/, /esperar: !listo/, /\bdespachar\b/, /extra: enKanban \? EXTRA_TABLERO : extraDeLaLista/]) {
    assert.match(llamadaListado, parte, `useListado lleva ${parte}`);
  }
  assert.match(pag, /const EXTRA_TABLERO = \{ limit: 0 \};/, 'en Kanban la lista va sin filas (D39)');
  assert.match(pag, /extraDeLaLista = useMemo\(\(\) => \(\{ orden: estado\.orden \|\| 'atencion' \}\)/,
    'R8: sin orden (el tercer clic en un título) sigue lo vencido primero');
  assert.match(pag, /consultaColumnaPec\(estado, columna, \{ orden, limit, offset \}\)/, 'la consulta de cada columna es la de la lib');
  const llamadaTablero = /useTableroKanban<FilaPec>\(\{([\s\S]*?)\n {2}\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/pantalla: ID_PEDIDOS/, /modo: 'servidor'/, /columnas: COLUMNAS_PEC/, /activo: listo && enKanban\b/]) {
    assert.match(llamadaTablero, parte, `useTableroKanban lleva ${parte}`);
  }
  assert.match(pag, /useResumenFlujo<DatosFlujo>\('\/compras\/flujo', recargaFlujo\)/);
  assert.match(pag, /`\/compras\/stats\?periodo=\$\{PERIODO_KPI\}`/);
  assert.ok(!/['"`]\/compras\/stats['"`]/.test(pag), 'ya no se pide /compras/stats sin período');
  assert.ok(!/compras\/pedidos\?limit=200/.test(pag), 'ya no se cargan los 200 más recientes');
  // La tabla (TABLA-compras punto 7; R26, D41): la estándar en el servidor, con sus 5 pestañas y la clave por id.
  assert.match(pag, /<TablaEstandar\s+id=\{ID_PEDIDOS\}\s+modo="servidor"/);
  for (const [id, etiqueta] of [['vigentes', 'Todos'], ['activos', 'Activos'], ['en_transito', 'En tránsito'], ['recibidos', 'Recibidos'],
    ['cancelados', 'Cancelados']]) {
    assert.match(pag, new RegExp(`\\{ id: '${id}', etiqueta: '${etiqueta}', conteo: conteos\\?\\.${id} \\?\\? null`), `pestaña ${etiqueta}`);
  }
  assert.ok(!/En Tr[aá]nsito'|'Analisis'|JSON\.stringify\(r\)/.test(pag), 'sin «En Tránsito», sin la pestaña Análisis ni la búsqueda en el navegador');
  // T15 r1 (m3, m11; D27): las columnas viven en columnas-pec.tsx (compartidas con el Hub); la misma protección de R26 ahí.
  const colPec = readFileSync(new URL('../src/app/dashboard/compras/columnas-pec.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const id of ['comprador', 'compra', 'limite']) {
    assert.match(colPec, new RegExp(`\\{ id: '${id}', titulo: '[^']+', ancho: \\d+, ocultaPorDefecto: true`), `R26: ${id} oculta por defecto`);
  }
  assert.ok(!/id: 'total'/.test(colPec) && !/id: 'total'/.test(pag), 'sin la columna Total, que repetía el Monto');
  // R26 (704 px a 1024): los anchos de las 7 visibles, en columnas-pec.tsx.
  const anchoDe = (id) => Number(new RegExp(`\\{ id: '${id}', titulo: '[^']+', ancho: (\\d+)`).exec(colPec)?.[1]);
  assert.equal(40 + ['numero', 'proveedor', 'monto', 'entrega', 'estado', 'acciones'].map(anchoDe).reduce((a, b) => a + b, 0), 704,
    'R26: la casilla y las 6 visibles suman 704 px');
  assert.match(pag, /const COLUMNAS_TABLA_PEDIDOS = columnasPec<FilaPec>\(\(p\) => <CeldaAcciones p=\{p\} \/>\);/);
  assert.match(pag, /claseFila=\{claseDeFilaPec\}/);
  assert.ok(!/function CeldaNumero|const MARCA_VENCIDO|id: 'proveedor'/.test(pag), 'Pedidos ya no tiene su copia de las columnas');
  // El menú de fila (MenuFila) ofrece solo lo que acepta update_pec (R9, C15c): Emitir desde Borrador y cancelar con motivo.
  assert.match(pag, /etiqueta: 'Marcar Emitido'[\s\S]{0,300}oculto: !transicionesPec\(p\.estado\)\.includes\('EMITIDO'\)/);
  assert.match(pag, /etiqueta: 'Cancelar PEC'[\s\S]{0,200}oculto: !transicionesPec\(p\.estado\)\.includes\('CANCELADO'\)/);
  assert.match(pag, /etiqueta: 'Eliminar definitivamente'[\s\S]{0,200}oculto: etapaPec\(p\.estado\) !== 'cancelado'/);
  assert.match(pag, /<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{p\.numero\}`\} \/>/);
  // El tablero (KANBAN-compras punto 6): las reglas de R9, la tarjeta con «Recepcionar» y D39.
  assert.match(pag, /regla=\{reglaSoltarPec\}/);
  assert.match(pag, /tarjetaDe=\{tarjetaPedidoCompra\}/);
  assert.match(pag, /tablero\.recargar\(\[\.\.\.columnas\]\)/, 'D39: tras la acción, solo el origen y el destino');
  assert.match(pag, /catch \(err\) \{\s*if \(recargarTrasError\(err\)\) recargarTrasCambio\(\);\s*throw err;\s*\}/,
    'el tablero relanza el error del PATCH para deshacer y avisar');
  // Cancelar (panel, menú, tablero y masiva) con un solo ModalMotivo, en serie y sin tragar errores (R9, RP30, RP93).
  assert.match(pag, /<ModalMotivo[\s\S]{0,400}efectos=\{\[\.\.\.EFECTOS_CANCELAR_PEC\]\}/);
  assert.match(pag, /estado: 'CANCELADO', motivo/, 'el PATCH lleva el motivo');
  assert.match(pag, /const resultados = await cancelarPecsEnSerie\(pecs, \(p\) => _apiFetch\(/);
  assert.match(pag, /const r = despuesDeCancelarPec\(pecs, resultados, omitidos\);/);
  assert.match(pag, /if \(r\.recargarVentas\) setVueltaVentas\(\(n\) => n \+ 1\);/, 'lección I1 de T14: los PVEN vuelven a pedirse');
  assert.match(pag, /setCancelacion\(\{ \.\.\.cancelacion, pecs: r\.pendientes, omitidos: \[\] \}\);\s*throw r\.error;/);
  assert.ok(!/\.catch\(\(\) ?=> ?\{\}\)/.test(pag), 'ningún error se traga');
  assert.ok(!/estado: ?'RECIBIDO'/.test(pag) && !/estado: ?'EN_TRANSITO'/.test(pag), 'ningún PATCH a mano a tránsito o recibido');
  assert.ok(!/Object\.entries\(PEC_ESTADOS\)|PEC_ESTADOS/.test(pag), 'el botón Estado ya no ofrece todos los estados');
  assert.match(pag, /const transiciones = transicionesPec\(detail\?\.estado\);/);
  // «Eliminar definitivamente» con confirmar de useAvisos (RP30), en el panel y en el menú.
  assert.equal((pag.match(/await confirmar\(\{/g) ?? []).length >= 3, true, 'el panel, el menú de fila y el casillero');
  // Las tarjetas (KPI-compras punto 6; R12, RP92): las cuatro de /compras/stats, pulsables como sus vistas.
  for (const kpi of ['pec_activos', 'pec_en_transito', 'pec_vencidos', 'pec_monto']) assert.match(pag, new RegExp(`kpi="${kpi}"`));
  assert.match(pag, /const tarjetas = tarjetasPedidosCompra\(stats\?\.datos \?\? null\);/);
  assert.match(pag, /kpi="pec_vencidos"[\s\S]{0,300}onClick=\{alternarVencidos\}/, 'RP92: la tarjeta de vencidos abre semaforo=vencidos');
  assert.match(pag, /accionVistaEnLista\(estado, siguiente, opcionesEstadosPec\)/);
  // La franja (FLUJO-compras punto 6; RP21, RP40, RP46, D42): «Estás aquí» en Pedido de compra, sin «No resueltos».
  assert.match(pag, /titulo="Flujo de compras"/);
  assert.match(pag, /regla=\{textoReglaCompras\(\)\}/);
  assert.match(pag, /pasos=\{pasosPedidosCompra\(flujo\.datos, vistaActiva\)\}/);
  assert.match(pag, /avisos=\{avisosFlujoCompras\(flujo\.datos\)\}/);
  assert.match(pag, /vistaDePasoPedidosCompra\(clave\)/);
  assert.match(pag, /const OPCIONES_SEMAFORO = \{ vistaTodos: INICIAL_PEDIDOS\.vista \};/);
  assert.match(pag, /accionSemaforoCompras\(estado, f, enKanban \? OPCIONES_ESTADOS_TABLERO_PEC : opcionesEstadosPec, OPCIONES_SEMAFORO\)/);
  assert.ok(!/noResueltos/.test(pag), 'Compras no pasa noResueltos');
  assert.match(pag, /subtitle="Pedidos a proveedores y su seguimiento\."/);
  assert.ok(!/Pipeline:|PEC con entrega vencida — Revisa el tracking/.test(pag), 'sin el subtítulo con códigos ni el aviso naranja suelto');
  // RP21: ?tab= al montar con la guarda de window (y se quita de la URL, conservando ?id); ?id sigue abriendo el panel.
  assert.match(pag, /const vista = leerEnlacePedidosCompra\(window\.location\.search\);/);
  assert.match(pag, /router\.replace\(rutaSinParametro\(RUTA_PEDIDOS, window\.location\.search, 'tab'\), \{ scroll: false \}\)/);
  assert.match(pag, /const idParam = searchParams\.get\('id'\);/);
  // El panel del PEC (puntos de T15): la barra del tracking es PasosFlujo y las tarjetas dicen el estado en palabras.
  assert.match(pag, /<PasosFlujo variante="barra" pasos=\{pasosDeTracking\(stages\)\}/);
  assert.match(pag, /etiquetaEtapaTracking\(status\)/);
  // T15 r1 (m2, m6, m13; D27): la tarjeta de cada etapa pinta UNA regla (avisoTarjetaEtapa: el aviso del servidor, rojo o
  // neutro, o los días a la ETA) y la guía vigente; antes esta línea pedía `const dias = textoDiasEtapa(sd.eta);`.
  assert.match(pag, /const aviso = cerrado \? null : avisoTarjetaEtapa\(sd\);/);
  assert.ok(!/textoDiasEtapa\(sd\.eta\)|sd\.alert\.nivel|bg-blue-50 border border-blue-200 rounded-lg/.test(pag), 'sin la segunda regla ni el aviso «ok» en azul');
  assert.match(pag, /\{sd\.tracking_number && <span>Guía: <strong[^>]*>\{sd\.tracking_number\}<\/strong><\/span>\}/, 'm13: la guía vigente');
  // T15 r1 (m4, m14): con el PEC cancelado el TrackingPanel es de solo lectura (seguimientoCerrado, la regla del detalle).
  assert.match(pag, /const cerrado = seguimientoCerrado\(pec\.estado\);/);
  assert.match(pag, /\{cerrado \? \([\s\S]{0,200}\{TEXTO_SEGUIMIENTO_CERRADO\}[\s\S]{0,120}\) : \([\s\S]{0,120}<PasosFlujo variante="barra" pasos=\{pasosDeTracking\(stages\)\}/);
  assert.match(pag, /const isEditing = !cerrado && editStage === sd\.stage;/);
  assert.match(pag, /\{!cerrado && \(\s*<button onClick=\{\(\)=>openEdit\(sd\)\}/, 'sin editar las etapas de un cancelado');
  assert.ok(!/stageColor|diasTexto|Math\.ceil\(\(new Date/.test(pag), 'sin la barra a mano ni la cuenta de días con el reloj local');
  assert.match(pag, /fecha_entrega_estimada: infoForm\.fecha_entrega_estimada \|\| null/, '«Editar información» manda null en blanco, como el alta');
  assert.ok(!/updated_by: ?localStorage/.test(pag), 'updated_by = autorActual() (sin sesión se omite)');
  // Análisis (R2, R13): sin la pestaña ni el chat; el botón «Ver análisis» abre el del Hub.
  assert.ok(!/\/ventas\/ai-chat|handleAskAI|aiQuestion|aiResponse|analyticsRange|chartType/.test(pag));
  assert.match(pag, /href=\{ENLACE_VER_ANALISIS_COMPRAS\}/);
  assert.match(pag, /Ver análisis/);
  assert.ok(!/En construcci/.test(pag), 'R2: el aviso vive solo en AsistenteEnConstruccion.tsx');
  // Se fueron los estados y los arreglos en memoria de antes (C4, C10).
  assert.ok(!/getKanbanCol|handleDrop|handleDragStart|kpiCards|colorMap|filteredData|groupedByMonth|menuPos/.test(pag));
  // B1 a B3 que se conservan (D27): el alta (con los PVEN pendientes), el seguimiento editable, la recepción desde el PEC,
  // los enlaces a los PVEN y la configuración de las etapas.
  assert.match(pag, /apiFetch\('\/ventas\/pedidos\?limit=200'\)/);
  assert.match(pag, /<NuevoPecModal/);
  assert.match(pag, /'\/compras\/pedidos\/' \+ pec\.id \+ '\/tracking'/);
  assert.match(pag, /`\/compras\/pedidos\/\$\{pec\.id\}\/recepcionar`/);
  assert.match(pag, /href=\{`\/dashboard\/ventas\/venta\?id=\$\{v\.id\}`\}/);
  assert.match(pag, /<TrackingConfigModal/);
}

console.log('--- TEST 27 (B4 T15): el detalle de un PEC (compras/pedidos/[id]/page.tsx): etapas reales y nada que no guarde ---');
{
  const det = readFileSync(new URL('../src/app/dashboard/compras/pedidos/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/STAGE_NODES|ESTADO_LABELS/.test(det), 'sin la barra fija de 4 nodos ni otra tabla de etiquetas (C10)');
  assert.match(det, /<PasosFlujo variante="barra" pasos=\{pasosDeTracking\(stages\)\}/, '3 etapas si es directo, 4 por casillero');
  assert.match(det, /const completedCount = stages\.filter\(\(s\) => s\?\.status === 'COMPLETADO'\)\.length;/);
  // T15 r1 (m4, m14; D27): la misma regla de los paneles (antes `etapaPec(estadoActual) === 'cancelado'` aquí).
  assert.match(det, /const cancelado = seguimientoCerrado\(estadoActual\);/, 'cancelado: sin barra ni «Avanzar etapa»');
  assert.match(det, /\{TEXTO_SEGUIMIENTO_CERRADO\}/);
  assert.match(det, /infoEstadoPec\(estadoActual\)/);
  assert.match(det, /<TablaEstandar id="compras\.pec\.productos" modo="simple"/);
  assert.match(det, /<TablaEstandar id="compras\.pec\.actividades" modo="simple"/);
  // H13: ningún campo ni botón que no guarde.
  assert.ok(!/<input|<textarea|defaultValue=/.test(det), 'los campos que no guardan son texto de solo lectura');
  assert.ok(!/Guardar Cambios|Rastrear en web|Registra una incidencia/.test(det));
  assert.match(det, /href=\{`\/dashboard\/compras\/pedidos\?id=\$\{pedido\.id\}`\}/, 'editar se hace en el panel de Pedidos de compra');
  // RP30: sin diálogos nativos; el error del seguimiento se muestra con su texto.
  assert.match(det, /avisarError\(err, 'No se pudo actualizar el seguimiento'\)/);
  // B1 a B3 que se conservan: avanzar la etapa (PATCH /tracking) y el enlace a la recepción.
  assert.match(det, /`\/compras\/pedidos\/\$\{pedido\.id\}\/tracking`/);
  assert.match(det, /`\/dashboard\/compras\/recepciones\/\$\{ultimaRecepcion\.id\}`/);
}

console.log('--- TEST 28 (B4 T15 r1, I1): cancelar recarga el tablero también desde el panel (Hub y Pedidos), por comportamiento ---');
{
  const paginas = [
    ['Pedidos de compra', readFileSync(new URL('../src/app/dashboard/compras/pedidos/page.tsx', import.meta.url), 'utf8')],
    ['Hub de Compras', readFileSync(new URL('../src/app/dashboard/compras/page.tsx', import.meta.url), 'utf8')],
  ];
  for (const [nombre, fuente] of paginas) {
    // Desde el panel (sin columnas: el panel se abre también con un clic en una tarjeta del tablero): el tablero ENTERO,
    // la lista, la franja y las tarjetas, los PVEN (I1 de T14) y se cierra el panel.
    const panel = await correrCancelar(fuente, { columnas: null, desdePanel: true });
    assert.equal(panel.error, null, `${nombre}: sin error`);
    assert.deepEqual(panel.llamadas, ['tablero entero', 'lista', 'ventas', 'cerrar panel'], `${nombre}: desde el panel`);
    // Desde una tarjeta del tablero: solo su origen y su destino (D39).
    const tarjeta = await correrCancelar(fuente, { columnas: ['emitido', 'cancelado'], desdePanel: false });
    assert.deepEqual(tarjeta.llamadas, ['tablero emitido,cancelado', 'lista', 'ventas'], `${nombre}: desde la tarjeta`);
    // Con un 409 desde el panel: también se recarga el tablero entero (y el detalle), y el error sigue para el modal.
    const conflicto = await correrCancelar(fuente, { columnas: null, desdePanel: true, falla: true });
    assert.equal(conflicto.error?.status, 409, `${nombre}: relanza el 409`);
    assert.deepEqual(conflicto.llamadas, ['tablero entero', 'lista', 'detalle'], `${nombre}: el 409 desde el panel`);
  }
}

console.log('\nOK: test_estados_compras.mjs');
