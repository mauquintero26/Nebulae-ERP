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
import { estadoTablaInicial, queryListado } from '../src/lib/tabla.js';
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

console.log('--- TEST 29 (B4 T15 r1, m8): textoVacioPec, el «vacío» de la tabla dice qué filtro lo causa ---');
{
  assert.equal(typeof ec.textoVacioPec, 'function', 'textoVacioPec existe');
  const AYUDA = 'Los pedidos de compra se crean con «Nuevo PEC».';
  const vacio = (parcial) => ec.textoVacioPec(estadoTablaInicial(parcial), AYUDA);
  // Con «Con atraso» (la tarjeta de vencidos o la franja): no hay vencidos, una buena noticia; nada de «crea un PEC».
  const vencidos = { titulo: 'Ningún pedido de compra con la entrega vencida.', ayuda: null };
  assert.deepEqual(vacio({ semaforo: 'vencidos' }), vencidos);
  assert.deepEqual(vacio({ semaforo: 'atrasados' }), vencidos, 'su sinónimo');
  assert.deepEqual(vacio({ semaforo: 'vencidos', estados: ['EMITIDO'], q: 'acme' }), vencidos, 'el semáforo primero');
  // Con un filtro de estados.
  const filtrado = { titulo: 'Ningún pedido de compra con esos estados. Ajusta el filtro.', ayuda: null };
  assert.deepEqual(vacio({ estados: ['RECIBIDA'] }), filtrado);
  assert.deepEqual(vacio({ estados: ['RECIBIDA'], q: 'acme' }), filtrado);
  // Si no, el de antes: la búsqueda, o la pantalla vacía con la ayuda de cada pantalla.
  assert.deepEqual(vacio({ q: '  acme ' }), { titulo: 'Sin resultados para «acme»', ayuda: 'Ajusta la búsqueda o el filtro de estados.' });
  assert.deepEqual(vacio({}), { titulo: 'No hay pedidos de compra en esta vista', ayuda: AYUDA });
  assert.deepEqual(vacio({ semaforo: 'todos' }), { titulo: 'No hay pedidos de compra en esta vista', ayuda: AYUDA }, "'todos' es sin filtro");
  assert.deepEqual(ec.textoVacioPec(null, AYUDA), { titulo: 'No hay pedidos de compra en esta vista', ayuda: AYUDA });
  assert.deepEqual(ec.textoVacioPec({}), { titulo: 'No hay pedidos de compra en esta vista', ayuda: null }, 'sin ayuda, null');
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
  // T15 r1 (m8): el «vacío» dice qué filtro lo causa (textoVacioPec), y se recalcula con el semáforo y los estados.
  assert.match(hub, /textoVacioPec\(\{ q: estado\.q, semaforo: estado\.semaforo, estados: estado\.estados \}/);
  assert.match(hub, /\}, \[estado\.q, estado\.semaforo, estado\.estados\]\);/);
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
  for (const parte of [/ruta: '\/compras\/pedidos'/, /(?:^|[,{]\s*)estado\s*,/, /conConteos: true/, /esperar: !listo/, /\bdespachar\b/, /extra: enKanban \? EXTRA_TABLERO : extraDeLaLista/]) {
    assert.match(llamadaListado, parte, `useListado lleva ${parte}`);
  }
  assert.match(pag, /const EXTRA_TABLERO = \{ limit: 0 \};/, 'en Kanban la lista va sin filas (D39)');
  assert.match(pag, /extraDeLaLista = useMemo\(\(\) => \(\{ orden: estado\.orden \|\| 'atencion' \}\), \[estado\.orden\]\);/,
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
  // T15 r1 (m8): el «vacío» dice qué filtro lo causa (textoVacioPec), y se recalcula con el semáforo y los estados.
  assert.match(pag, /textoVacioPec\(\{ q: estado\.q, semaforo: estado\.semaforo, estados: estado\.estados \}/);
  assert.match(pag, /\}, \[estado\.q, estado\.semaforo, estado\.estados\]\);/);
  // T15 r1 (m7): los textos visibles con tildes y el chip del alta con la etiqueta del estado (nunca un código).
  assert.ok(!/Metodo Pago|Modalidad Pago|'Numero'|Ver Recepcion|Hacer Recepcion|Via Casillero|>Logistica<|Informacion del PEC|PEND\. COMPRA|Mercancia recibida|conteo fisico/.test(pag),
    'sin los textos sin tilde ni el chip con código');
  for (const texto of ['Método de pago', "'Número'", 'Ver recepción', 'Hacer recepción', 'Vía casillero', '>Logística<', 'Información del PEC']) {
    assert.ok(pag.includes(texto), texto);
  }
  assert.match(pag, /\{infoEstadoPedido\('PENDIENTE_COMPRA'\)\.label\}/);
  // T15 r1 (m9): guardar la información y eliminar desde el panel aplican recargarTrasError; ningún `catch {}` mudo.
  assert.equal((pag.match(/onToast\(e,'error'\);\s*(?:\/\/[^\n]*\n\s*)?if \(recargarTrasError\(e\)\) \{ onUpdate\(\); loadFull\(\); \}/g) ?? []).length, 3,
    'saveInfo, deletePec y changeEstado');
  assert.ok(!/catch \{\s*\}|catch \{ setProdSearchResults\(\[\]\); \}/.test(pag), 'ningún error mudo');
  assert.equal((pag.match(/avisarError\(err, 'No se pudo buscar el (?:casillero|proveedor|producto)'\)/g) ?? []).length, 4, 'las cuatro búsquedas');
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
  // T15 r1 (m9): con un 409 o un 404, el detalle se vuelve a pedir.
  assert.match(det, /if \(recargarTrasError\(err\)\) await loadPedido\(\);/);
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

console.log('--- TEST 30 (B4 T16A, TABLA-compras punto 9, KANBAN-logistica punto 5; RP41, D6): Recepciones, vistas, filtro y tablero solo para ver ---');
{
  // Las vistas de GET /compras/recepciones (espejo de las claves de GRUPOS_RECEPCION más 'todas').
  assert.deepEqual(Object.keys(ec.VISTAS_RECEPCION ?? {}), ['por_confirmar', 'confirmadas', 'canceladas', 'todas']);
  assert.deepEqual(ec.VISTAS_RECEPCION.por_confirmar, ['BORRADOR']);
  assert.deepEqual(ec.VISTAS_RECEPCION.confirmadas, ['COMPLETADA', 'COMPLETADA_LOGISTICA']);
  assert.deepEqual(ec.VISTAS_RECEPCION.canceladas, ['CANCELADA']);
  assert.deepEqual(ec.VISTAS_RECEPCION.todas, ['BORRADOR', 'COMPLETADA', 'COMPLETADA_LOGISTICA', 'CANCELADA']);
  for (const [vista, estados] of Object.entries(GRUPOS_RECEPCION)) assert.deepEqual(ec.VISTAS_RECEPCION[vista], estados, `${vista} es el grupo`);
  assert.throws(() => { ec.VISTAS_RECEPCION.otra = []; }, TypeError, 'inmutable');

  // La insignia de un estado: la de ESTADOS_RECEPCION; uno desconocido sale humanizado en gris, nunca el código crudo.
  assert.equal(typeof ec.infoEstadoRecepcion, 'function', 'infoEstadoRecepcion existe');
  assert.equal(ec.infoEstadoRecepcion('BORRADOR').label, 'Por contar');
  assert.equal(ec.infoEstadoRecepcion(' COMPLETADA_LOGISTICA ').label, 'Solo registro logístico');
  assert.equal(ec.infoEstadoRecepcion('ALGO_NUEVO').label, 'Algo nuevo');
  assert.match(ec.infoEstadoRecepcion('ALGO_NUEVO').clases.bg, /gray/);

  // «Filtrar estado»: los estados de la pestaña con su etiqueta; sin pestaña (o 'todas', o una rara), los 4. La misma referencia.
  assert.deepEqual(ec.opcionesEstadosRecepcion('confirmadas'),
    [{ valor: 'COMPLETADA', etiqueta: 'Recibida' }, { valor: 'COMPLETADA_LOGISTICA', etiqueta: 'Solo registro logístico' }]);
  assert.deepEqual(ec.opcionesEstadosRecepcion('por_confirmar'), [{ valor: 'BORRADOR', etiqueta: 'Por contar' }]);
  for (const v of ['todas', null, undefined, 'rara', 'toString']) {
    assert.deepEqual(ec.opcionesEstadosRecepcion(v).map((o) => o.valor), ['BORRADOR', 'COMPLETADA', 'COMPLETADA_LOGISTICA', 'CANCELADA'], String(v));
  }
  assert.equal(ec.opcionesEstadosRecepcion('confirmadas'), ec.opcionesEstadosRecepcion('confirmadas'));
  // En el tablero: una opción por columna, con su estado principal y el título de la columna.
  assert.deepEqual(ec.OPCIONES_ESTADOS_TABLERO_RECEPCION,
    [{ valor: 'BORRADOR', etiqueta: 'Por contar' }, { valor: 'COMPLETADA', etiqueta: 'Confirmadas' }, { valor: 'CANCELADA', etiqueta: 'Canceladas' }]);

  // La consulta de una columna del tablero en modo servidor: sin vista ni paso ni semáforo (Recepciones no tiene), los
  // estados de la columna cruzados con el filtro, la búsqueda del MISMO estado, el orden, el límite y el desplazamiento.
  assert.equal(typeof ec.consultaColumnaRecepcion, 'function', 'consultaColumnaRecepcion existe');
  const [porContar, confirmadas, canceladas] = COLUMNAS_RECEPCION;
  const estado = estadoTablaInicial({ vista: 'confirmadas', modo: 'kanban', semaforo: 'vencidos', paso: 'PEC', q: ' acme ', estados: ['COMPLETADA'], pagina: 4 });
  assert.equal(ec.consultaColumnaRecepcion(estado, confirmadas, { orden: 'reciente', limit: 25, offset: 0 }),
    'q=acme&estados=COMPLETADA,COMPLETADA_LOGISTICA&orden=reciente&limit=25&offset=0', 'su estado principal pide la columna entera');
  assert.equal(ec.consultaColumnaRecepcion(estado, porContar, { orden: 'sin_movimiento', limit: 25, offset: 0 }), null, 'sin cruce: no se pide');
  const sinFiltro = estadoTablaInicial({ vista: 'todas', modo: 'kanban' });
  assert.equal(ec.consultaColumnaRecepcion(sinFiltro, canceladas, { orden: 'reciente', limit: 0, offset: 0 }),
    'estados=CANCELADA&orden=reciente&limit=0&offset=0', 'una plegada pide limit=0 y no lleva la vista');
  assert.equal(ec.consultaColumnaRecepcion(sinFiltro, porContar, { orden: 'sin_movimiento', limit: 50, offset: 50 }),
    'estados=BORRADOR&orden=sin_movimiento&limit=50&offset=50');
  // Cada columna del tablero es un grupo de recepción (la clave de grupoRecepcion).
  for (const c of COLUMNAS_RECEPCION) assert.ok(c.estados.every((e) => grupoRecepcion(e) === c.clave), c.clave);

  // La tarjeta del tablero solo para ver: el ENINV, la bodega y la fecha, el chip «Retraso N días» (dias_retraso de _gr_dict) y,
  // en «Por contar», «Contar y confirmar» hacia el conteo.
  assert.equal(typeof ec.tarjetaRecepcion, 'function', 'tarjetaRecepcion existe');
  const rec = { id: 7, numero: 'ENINV-7', pec_id: 3, pec_numero: 'PEC-3', supplier_name: 'Acme', warehouse_name: 'Bodega A',
    estado: 'BORRADOR', fecha_recepcion: '2026-11-05T15:00:00', dias_retraso: 2 };
  const t = ec.tarjetaRecepcion(rec);
  assert.equal(t.numero, 'ENINV-7');
  assert.equal(t.tipo, 'ENINV');
  assert.equal(t.titulo, 'Acme');
  assert.equal(t.subtitulo, 'PEC-3');
  assert.equal(t.monto, null);
  assert.equal(t.estado.label, 'Por contar');
  assert.deepEqual(t.chips, [{ texto: 'Retraso 2 días', tono: 'rose' }]);
  assert.equal(t.tiempo, 'Bodega A · 5 nov 2026');
  assert.equal(t.atrasada, true);
  assert.deepEqual(t.accionPrincipal, { texto: 'Contar y confirmar', href: '/dashboard/compras/recepciones/7', tono: 'teal' });
  assert.equal(ec.tarjetaRecepcion({ ...rec, dias_retraso: 1 }).chips[0].texto, 'Retraso 1 día');
  // Confirmada, cancelada, sin retraso (0 o null), sin PEC, sin proveedor ni bodega: lo mínimo, sin código crudo.
  const hecha = ec.tarjetaRecepcion({ ...rec, estado: 'COMPLETADA', dias_retraso: 0 });
  assert.equal(hecha.accionPrincipal, null);
  assert.deepEqual(hecha.chips, []);
  assert.equal(hecha.atrasada, false);
  assert.equal(ec.tarjetaRecepcion({ ...rec, estado: 'CANCELADA', dias_retraso: null }).accionPrincipal, null);
  const manual = ec.tarjetaRecepcion({ id: 9, estado: 'BORRADOR', created_at: '2026-11-04T10:00:00' });
  assert.equal(manual.numero, 'ENINV-9', 'sin número: ENINV-id');
  assert.equal(manual.titulo, 'Sin proveedor');
  assert.equal(manual.subtitulo, 'Entrada manual');
  assert.equal(manual.tiempo, 'Sin bodega · 4 nov 2026');

  // El «vacío» de la tabla dice qué lo causa.
  assert.equal(typeof ec.textoVacioRecepciones, 'function', 'textoVacioRecepciones existe');
  const vacio = (parcial) => ec.textoVacioRecepciones(estadoTablaInicial(parcial));
  assert.deepEqual(vacio({ estados: ['CANCELADA'], q: 'x' }), { titulo: 'Ninguna recepción con esos estados. Ajusta el filtro.', ayuda: null });
  assert.deepEqual(vacio({ q: ' acme ' }), { titulo: 'Sin resultados para «acme»', ayuda: 'Ajusta la búsqueda o el filtro de estados.' });
  assert.deepEqual(vacio({ vista: 'por_confirmar' }), { titulo: 'No hay recepciones por confirmar', ayuda: 'Las nuevas aparecen aquí hasta que se cuentan y se confirman.' });
  assert.deepEqual(vacio({ vista: 'confirmadas' }), { titulo: 'Aún no hay recepciones confirmadas', ayuda: null });
  assert.deepEqual(vacio({ vista: 'canceladas' }), { titulo: 'No hay recepciones canceladas', ayuda: null });
  assert.deepEqual(vacio({ vista: 'todas' }), { titulo: 'No hay recepciones en esta vista', ayuda: 'Usa «Recepcionar PEC» para iniciar la entrada física de un pedido.' });
  assert.deepEqual(ec.textoVacioRecepciones(null).titulo, 'No hay recepciones en esta vista');
}

/** El cuerpo de la función `cabecera … { … }` del fuente de una página (llaves balanceadas), transpilado a JS para ejecutarlo con dobles. */
function funcionEjecutable(fuente, cabecera) {
  const inicio = fuente.indexOf(cabecera);
  assert.ok(inicio >= 0, `la página tiene ${cabecera}`);
  const abre = fuente.indexOf('{', fuente.indexOf(')', inicio));
  let nivel = 0;
  let fin = -1;
  for (let j = abre; j < fuente.length; j += 1) {
    if (fuente[j] === '{') nivel += 1;
    else if (fuente[j] === '}') { nivel -= 1; if (nivel === 0) { fin = j; break; } }
  }
  assert.ok(fin > abre, `${cabecera} cierra`);
  const js = tsLib.transpileModule(`(${fuente.slice(inicio, fin + 1)})`, { compilerOptions: { target: tsLib.ScriptTarget.ES2020 } })
    .outputText.replace(/^"use strict";\s*/, '').trim().replace(/;$/, '');
  return (entorno) => new Function('entorno', `with (entorno) { return ${js}; }`)(entorno);
}

/** La suma de los anchos de las columnas visibles por defecto de un arreglo de columnas escrito en el fuente (R26). */
function anchoVisible(fuente, nombre) {
  const inicio = fuente.indexOf(nombre);
  assert.ok(inicio >= 0, `${nombre} existe`);
  const fin = fuente.slice(inicio).search(/\n\s*\];/);
  const cuerpo = fuente.slice(inicio, inicio + fin);
  const columnas = cuerpo.split(/\n\s*\{ id: '/).slice(1);
  assert.ok(columnas.length > 0, 'columnas');
  return columnas.filter((c) => !/ocultaPorDefecto: true/.test(c.split('\n')[0] + (c.split('\n')[1] ?? '')))
    .reduce((suma, c) => suma + Number(/ancho: (\d+)/.exec(c)?.[1] ?? 0), 0);
}

console.log('--- TEST 31 (B4 T16A): Tránsito (compras/transito/page.tsx) cablea las piezas, el tablero de etapas y el servidor ---');
{
  const pag = readFileSync(new URL('../src/app/dashboard/compras/transito/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/@ts-nocheck/.test(pag), 'la página se tipa');
  // Carga del servidor (R5, C3, C4, D39, D40): el estado único, la tabla en el servidor y el tablero con la vista completa.
  assert.match(pag, /const ID_TRANSITO = 'compras\.transito';/);
  assert.match(pag, /const INICIAL_TRANSITO = \{ vista: 'transito_logistica', orden: 'atencion' \};/, 'la vista de T12 y lo vencido primero (R8)');
  assert.match(pag, /useEstadoTabla\(ID_TRANSITO, INICIAL_TRANSITO\)/);
  const lista = /const lista = useListado<FilaTransito>\(\{([\s\S]*?)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/ruta: '\/compras\/pedidos'/, /(?:^|[,{]\s*)estado\s*,/, /esperar: !listo/, /\bdespachar\b/, /activo: !enKanban/, /extra: extraDeLaLista/]) {
    assert.match(lista, parte, `la tabla lleva ${parte}`);
  }
  assert.match(pag, /extraDeLaLista = useMemo\(\(\) => \(\{ orden: estado\.orden \|\| 'atencion' \}\), \[estado\.orden\]\);/,
    'R8: sin orden (el tercer clic en un título) sigue lo vencido primero');
  const completa = /const completa = useListado<FilaTransito>\(\{([\s\S]*?)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/ruta: '\/compras\/pedidos'/, /(?:^|[,{]\s*)estado\s*,/, /esperar: !listo/, /activo: enKanban/, /extra: EXTRA_TABLERO/]) {
    assert.match(completa, parte, `el tablero pide la vista completa con ${parte}`);
  }
  assert.match(pag, /const TOPE_TABLERO = 200;/);
  assert.match(pag, /const EXTRA_TABLERO = \{ orden: 'reciente', limit: TOPE_TABLERO, offset: 0 \};/, 'C4: hasta 200 pedidos, de la primera página');
  assert.match(pag, /apiFetch\('\/compras\/tracking-config', \{ signal: control\.signal \}\)/, 'GET /compras/tracking-config al cargar');
  assert.match(pag, /useResumenFlujo<DatosFlujo>\('\/compras\/flujo', recargaFlujo\)/);
  assert.match(pag, /`\/compras\/stats\?periodo=\$\{PERIODO_KPI\}`/);
  assert.ok(!/compras\/pedidos\?limit=200/.test(pag) && !/ESTADOS_EXCLUIDOS_TRANSITO/.test(pag), 'ya no se cargan 200 y se filtran en el navegador');
  assert.ok(!/\.catch\(\(\) => (\[\]|\{\}|null)\)/.test(pag) && !/catch \{ *set/.test(pag), 'ningún error se traga');
  assert.ok(!/days_until_delivery|\.is_overdue\)\.length|pedidos\.filter/.test(pag), 'ni los vencidos ni los promedios se calculan sobre arreglos del navegador');
  // La tabla (TABLA-compras punto 8; R26, D41): estándar en el servidor, 25 o 50, las columnas del diseño y la acción.
  assert.match(pag, /<TablaEstandar\s+id=\{ID_TRANSITO\}\s+modo="servidor"/);
  for (const [id, titulo] of [['pedido', 'Pedido de compra'], ['cliente', 'Cliente / PVEN'], ['tipo', 'Tipo'], ['etapa', 'Etapa actual'],
    ['progreso', 'Progreso'], ['entrega', 'Entrega est.'], ['monto', 'Monto'], ['accion', 'Acción']]) {
    assert.match(pag, new RegExp(`\\{ id: '${id}', titulo: '${titulo}'`), `columna ${titulo}`);
  }
  assert.match(pag, /id: 'pedido', titulo: 'Pedido de compra', ancho: \d+, clave: true, fija: 'izquierda', flexible: true/, 'el pedido es la clave, fija y flexible');
  assert.match(pag, /id: 'accion', titulo: 'Acción', ancho: \d+, clave: true, fija: 'derecha'/, 'la acción, fija a la derecha');
  assert.match(pag, /<PasosFlujo variante="mini" pasos=\{pasosDeTracking\(p\.tracking_stages\)\}/, 'Progreso: un punto por etapa (pasosDeTracking)');
  assert.match(pag, /avanceTransito\(p\)\.texto/, 'y «n de m»');
  assert.match(pag, /etiquetaEtapaTracking\(etapa\.status\)/, 'Etapa actual usa etiquetaEtapaTracking');
  assert.match(pag, /const aviso = avisoTarjetaEtapa\(etapa\);/, 'm5 y m7 (RP28): el aviso de la etapa es la regla única de flujo-compras.js, no una copia');
  assert.ok(!/alert\?\.nivel/.test(pag), 'y la página no rearma el nivel a mano');
  assert.match(pag, /conFlecha\(e\.label \|\| humanizarCodigo\(e\.stage \|\| ''\)\)/, 'sin label, la clave humanizada (nunca el código crudo)');
  assert.match(pag, /return e \? tituloDeEtapa\(e\) : infoEstadoPec\(p\.estado\)\.label; \}/, 'm2: sin etapa por hacer, el title dice el estado con su etiqueta, no el código');
  // I3 (r2): el pendiente se decide con la lista ACTIVA y se suelta con soltarPendientes (la inactiva cambia de referencia siempre).
  assert.match(pag, /const filasActivas = enKanban \? completa\.filas : lista\.filas;/);
  assert.match(pag, /const recargandoActiva = enKanban \? completa\.recargando : lista\.recargando;/);
  assert.match(pag, /soltarPendientes\(enCurso, \{ filas: filasActivas, recargando: recargandoActiva, modo \}\);\s*if \(sueltos !== enCurso\) setEnCurso\(sueltos\);/);
  assert.match(pag, /const modo = enKanban \? 'kanban' : 'lista';/);
  // Y1, Y2 y Y3 (r3): la foto es de la lista activa y su modo, y se actualiza sin esperar un efecto pasivo (m5).
  assert.match(pag, /const filasAhora = useRef<\{ filas: unknown; modo: string \}>\(\{ filas: filasActivas, modo \}\);/, 'Y3: una sola foto, la de la lista activa');
  assert.match(pag, /useLayoutEffect\(\(\) => \{ filasAhora\.current = \{ filas: filasActivas, modo \}; \}, \[filasActivas, modo\]\);/, 'Y2 y m5: la foto se actualiza dentro del commit (useLayoutEffect), no en un efecto pasivo');
  assert.match(pag, /const ahora = filasAhora\.current;\s*setEnCurso\(\(l\) => terminarPendiente\(l, id, ahora\.filas, ahora\.modo\)\);/, 'Y1: terminarCambio guarda la foto de la activa con terminarPendiente (transito.js)');
  assert.ok(!/lista\.filas, completa\.filas|\{ lista: lista/.test(pag), 'Y3: sin la foto de las dos listas');
  assert.match(pag, /useEffect\(\(\) => \{ pendienteRef\.current = pendiente; \}, \[pendiente\]\);/, 'X3: el guardián de los segundos clics lee el pendiente de ahora');
  assert.match(pag, /const CLASE_ENTREGA: Record<string, string> = \{ vencido: 'text-rose-700', pronto: 'text-amber-700', normal: 'text-slate-500' \};/, 'X2: el ámbar de «pronto»');
  assert.match(pag, /CLASE_ENTREGA\[tonoEntregaTransito\(p\)\]/, 'X2: la celda pinta el tono de la lib');
  assert.match(pag, /import \{[^}]*CeldaEstado[^}]*CeldaMonto[^}]*\} from '\.\.\/columnas-pec';/, 'm6: las celdas de columnas-pec, no copias');
  assert.match(pag, /claseFila=\{claseDeFilaPec\}/, 'D41: la fila vencida en el tono opaco filaAlerta');
  assert.match(pag, /acciones\?\.pendiente\(p\.id\)/, 'cada fila carga por su cuenta (I3)');
  assert.match(pag, /aria-label=\{`\$\{accion\.texto\} la etapa actual de \$\{p\.numero\}`\}/, 'el botón lleva el número en su aria-label');
  // R26 (704 px a 1024): las visibles caben.
  const visibles = anchoVisible(pag, 'const COLUMNAS_TABLA_TRANSITO');
  assert.ok(visibles > 0 && visibles <= 704, `R26: las columnas visibles suman ${visibles} px (caja de 704)`);
  assert.match(pag, /id: 'cliente'[^\n]*ocultaPorDefecto: true/);
  assert.match(pag, /id: 'tipo'[^\n]*ocultaPorDefecto: true/);
  // «Solo vencidos» = semaforo=vencidos: UNA sola función para el botón, la tarjeta y la franja (R5, RP92).
  assert.match(pag, /const alFiltrarSemaforo = \(f: FiltroSemaforo\) => despachar\(accionSemaforoCompras\(estado, f, opcionesEstadosPec\)\);/);
  assert.match(pag, /const alternarVencidos = \(\) => alFiltrarSemaforo\(filtroSemaforo === 'atrasados' \? 'todos' : 'atrasados'\);/);
  assert.match(pag, /onClick=\{alternarVencidos\} aria-pressed=\{filtroSemaforo === 'atrasados'\}|aria-pressed=\{filtroSemaforo === 'atrasados'\}/, 'el botón «Solo vencidos»');
  assert.match(pag, /<TarjetaKpi kpi="pec_vencidos"[^>]*onClick=\{alternarVencidos\}/, 'la tarjeta pec_vencidos es el mismo filtro');
  assert.match(pag, /onFiltrar: alFiltrarSemaforo/, 'y «Con atraso» de la franja');
  assert.match(pag, /filtroSemaforoCompras\(estado\)/, 'el filtro sale del estado único');
  // La franja (FLUJO-compras punto 8): «Estás aquí» en En tránsito, sin «No resueltos» y con el aviso de recepciones.
  assert.match(pag, /pasos=\{pasosPantallaCompras\(flujo\.datos, 'TRANSITO'\)\}/);
  assert.match(pag, /avisos=\{avisosFlujoCompras\(flujo\.datos\)\}/);
  assert.ok(!/noResueltos/.test(pag), 'Compras no tiene «No resueltos»');
  assert.ok(!/ALERTA DE RETRASO/.test(pag), 'el aviso rojo pasó a la franja');
  // Las tarjetas (KPI-compras punto 7): las de /compras/stats y el avance de la página (RP95); nunca 0 mientras cargan.
  for (const kpi of ['pec_activos', 'pec_vencidos', 'pec_avance', 'pec_monto_por_recibir']) assert.match(pag, new RegExp(`<TarjetaKpi kpi="${kpi}"`), kpi);
  assert.match(pag, /tarjetasTransito\(stats\?\.datos \?\? null, avance\)/);
  assert.match(pag, /avancePromedioTransito\(filasVisibles\)/, 'el avance es de las filas que se ven');
  assert.match(pag, /const estadoAvance = errorLista \? 'error' : filasVisibles === null \? 'cargando' : 'listo';/, 'm8: el avance tiene su propio estado, no hereda el de /compras/stats');
  // El tablero (KANBAN-logistica punto 2; R11, C4): modo cliente con las etapas de la configuración y la regla de soltar.
  const tablero = /useTableroKanban<FilaTransito>\(\{([\s\S]*?)\n {2}\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/pantalla: ID_TRANSITO/, /modo: 'cliente'/, /columnas: columnasTablero/, /activo: listo && enKanban\b/, /items: itemsTablero/,
    /columnaDe: columnaTransito/, /porColumna: estado\.tamano/]) {
    assert.match(tablero, parte, `useTableroKanban lleva ${parte}`);
  }
  assert.match(pag, /columnasDeEtapas\(config\?\.datos \?\? null, \{ pedidos: completa\.filas \}\)/, 'las columnas salen de tracking-config y de los pedidos');
  assert.match(pag, /completa\.cargandoInicial \|\| cargandoConfig \|\| \(completa\.error != null && completa\.filas\.length === 0\) \? null : completa\.filas/, 'mientras cargan, o con error y sin datos, items null (nunca un tablero vacío; I2)');
  assert.match(pag, /const errorTablero = enKanban && completa\.error != null;/, 'I2: el error del tablero se dice');
  assert.match(pag, /\{errorTablero && \(\s*<p role="alert">\s*\{textoDeError\(completa\.error,[^]*?onClick=\{completa\.recargar\}[^]*?Reintentar/, 'I2: con role=alert, textoDeError y Reintentar (completa.recargar)');
  assert.match(pag, /tarjetaTransito\(p, \{ pendiente: pendiente\(p\.id\) \}\)/, 'I3: la tarjeta pendiente no ofrece el botón');
  assert.match(pag, /if \(pendienteRef\.current\(p\.id\)\) return;/, 'I3: un segundo clic no manda otro PATCH');
  assert.match(pag, /reglaSoltarTransito\(p, origen, destino, \{ columnas: columnasTablero \}\)/);
  assert.match(pag, /regla=\{reglaTablero\}/);
  assert.match(pag, /onCambio=\{cambiarDesdeTablero\}/);
  assert.match(pag, /avisoTope200\(completa\.total, 'pedidos'\)/, 'el aviso de los 200 sale de la frase única (solo si total > 200)');
  assert.match(pag, /Reintentar/, 'si falla tracking-config, el tablero ofrece Reintentar');
  // Los diálogos nativos no existen (RP30) y el PATCH es el de /tracking.
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(pag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'sin diálogos nativos');
  assert.match(pag, /apiFetch\(`\/compras\/pedidos\/\$\{p\.id\}\/tracking`, \{\s*method: 'PATCH', body: JSON\.stringify\(\{ stage, status, user_name: autorActual\(\) \}\)/);
  assert.match(pag, /avisarError\(err, `No se pudo actualizar \$\{p\.numero\}`\)/, 'updateTracking ya no se traga el error');
  assert.match(pag, /recargar = recargarTrasError\(err\);\s*\}\s*if \(recargar\) \{\s*recargarTodo\(\);\s*terminarCambio\(p\.id\);\s*\} else descartarCambio\(p\.id\);/, 'el botón: con la regla única, un 409 recarga (y queda pendiente hasta la recarga) y un 500 no (y no queda pendiente)');

  // Lo que HACE arrastrar (cambiarDesdeTablero): completa la etapa que manda la regla; si falla, recarga con la regla única
  // recargarTrasError y relanza el error para que el tablero devuelva la tarjeta y avise.
  const correr = async ({ cuerpo, falla, pendiente = false }) => {
    const llamadas = [];
    const entorno = {
      aplicarEtapa: async (p, stage, status) => {
        llamadas.push(`PATCH ${p.id} ${stage} ${status}`);
        if (falla) throw Object.assign(new Error('La etapa ya estaba completada.'), { status: falla });
      },
      recargarTrasError: (err) => err.status === 409,
      recargarTodo: () => llamadas.push('recargar'),
      pendienteRef: { current: () => Boolean(pendiente) },
      iniciarCambio: () => llamadas.push('inicia'),
      terminarCambio: () => llamadas.push('termina'),
      descartarCambio: () => llamadas.push('descarta'),
    };
    let error = null;
    try { await funcionEjecutable(pag, 'async function cambiarDesdeTablero(')(entorno)({ id: 4 }, { cuerpo }); } catch (err) { error = err; }
    return { llamadas, error };
  };
  assert.deepEqual((await correr({ cuerpo: { stage: 'PROVEEDOR_CASILLERO' } })).llamadas, ['inicia', 'PATCH 4 PROVEEDOR_CASILLERO COMPLETADO', 'recargar', 'termina'], 'completa la etapa, recarga y queda pendiente hasta la recarga');
  const conflicto = await correr({ cuerpo: { stage: 'X' }, falla: 409 });
  assert.deepEqual(conflicto.llamadas, ['inicia', 'PATCH 4 X COMPLETADO', 'recargar', 'termina'], 'un 409 recarga');
  assert.equal(conflicto.error?.status, 409, 'y el error sigue (el tablero devuelve la tarjeta y avisa)');
  const otro = await correr({ cuerpo: { stage: 'X' }, falla: 500 });
  assert.deepEqual(otro.llamadas, ['inicia', 'PATCH 4 X COMPLETADO', 'descarta'], 'un 500 no recarga y no deja la tarjeta pendiente para siempre');
  assert.equal(otro.error?.status, 500);
  const sinEtapa = await correr({ cuerpo: undefined });
  assert.deepEqual(sinEtapa.llamadas, [], 'sin etapa no se manda nada');
  assert.ok(sinEtapa.error instanceof Error);
  // I3: con un cambio ya en camino sobre ese pedido, soltar otra vez no manda otro PATCH.
  const doble = await correr({ cuerpo: { stage: 'X' }, pendiente: true });
  assert.deepEqual(doble.llamadas, [], 'ya hay un cambio en camino: ningún PATCH');
  assert.match(doble.error?.message ?? '', /ya tiene un cambio de etapa en camino/);
}

console.log('--- TEST 32 (B4 T16A): Recepciones (compras/recepciones/page.tsx) y columnas-recepcion.tsx cablean las piezas y el servidor ---');
{
  const colRec = readFileSync(new URL('../src/app/dashboard/compras/columnas-recepcion.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const pag = readFileSync(new URL('../src/app/dashboard/compras/recepciones/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/@ts-nocheck/.test(pag), 'la página se tipa');
  // columnas-recepcion.tsx (T19 la importa): no es una ruta, no depende de ninguna page.tsx y exporta lo que las pantallas arman.
  assert.ok(!/export default/.test(colRec) && !/from '\.{1,2}\/[^']*page'/.test(colRec) && !/'use client'/.test(colRec), 'no es una ruta ni importa una page');
  for (const nombre of ['columnasRecepcion', 'titulosDeOrdenRecepcion', 'CeldaEstadoRecepcion', 'CeldaRetraso', 'CeldaStock']) {
    assert.match(colRec, new RegExp(`export (?:function|const) ${nombre}\\b`), `exporta ${nombre}`);
  }
  assert.match(colRec, /export function columnasRecepcion<T extends FilaColumnasRecepcion>\(celdaAcciones: \(r: T\) => ReactNode\)/, 'la celda de Acciones es de cada pantalla');
  for (const [id, titulo] of [['numero', 'Recepción #'], ['pec', 'PEC origen'], ['proveedor', 'Proveedor'], ['bodega', 'Bodega'], ['fecha', 'Fecha'],
    ['items', 'Ítems'], ['estado', 'Estado'], ['retraso', 'Retraso'], ['stock', 'Stock'], ['acciones', 'Acciones']]) {
    assert.match(colRec, new RegExp(`\\{ id: '${id}', titulo: '${titulo}'`), `columna ${titulo}`);
  }
  assert.match(colRec, /id: 'retraso'[^\n]*ocultaPorDefecto: true/, 'la columna Retraso va oculta por defecto');
  assert.match(colRec, /id: 'numero'[^\n]*clave: true, fija: 'izquierda'/);
  assert.match(colRec, /id: 'proveedor'[^\n]*flexible: true/, 'una sola flexible: el proveedor');
  assert.equal((colRec.match(/flexible: true/g) ?? []).length, 1);
  assert.match(colRec, /id: 'acciones'[^\n]*fija: 'derecha'/);
  const visibles = anchoVisible(colRec, 'export function columnasRecepcion');
  assert.ok(visibles > 0 && visibles <= 704, `R26: las columnas visibles suman ${visibles} px (caja de 704)`);
  assert.match(colRec, /export { numeroRecepcion, pecDeRecepcion, proveedorDeRecepcion, esRecepcionPorConfirmar };/, 'por confirmar es la regla de la lib (grupoRecepcion, R9), no un estado inventado');
  assert.ok(!/'PENDIENTE'/.test(colRec) && !/'PENDIENTE'/.test(pag), 'PENDIENTE no existe como estado de recepción');

  // Carga del servidor (R5, C3, C4, D39, D40).
  assert.match(pag, /const ID_RECEPCIONES = 'compras\.recepciones';/);
  assert.match(pag, /const INICIAL_RECEPCIONES = \{ vista: 'por_confirmar' \};/);
  assert.match(pag, /useEstadoTabla\(ID_RECEPCIONES, INICIAL_RECEPCIONES\)/);
  const llamada = /useListado<FilaRecepcion>\(\{([\s\S]*?)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/ruta: '\/compras\/recepciones'/, /(?:^|[,{]\s*)estado\s*,/, /conConteos: true/, /esperar: !listo/, /\bdespachar\b/, /extra: enKanban \? EXTRA_TABLERO : null/]) {
    assert.match(llamada, parte, `useListado lleva ${parte}`);
  }
  assert.match(pag, /const EXTRA_TABLERO = \{ limit: 0 \};/, 'en Kanban la lista va sin filas (D39)');
  assert.match(pag, /consultaColumnaRecepcion\(estado, columna, \{ orden, limit, offset \}\)/, 'la consulta de cada columna es la de la lib');
  const tablero = /useTableroKanban<FilaRecepcion>\(\{([\s\S]*?)\n {2}\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/pantalla: ID_RECEPCIONES/, /modo: 'servidor'/, /columnas: COLUMNAS_RECEPCION/, /activo: listo && enKanban\b/, /porColumna: estado\.tamano/,
    /dependencias: dependenciasTablero\(estado\)/]) {
    assert.match(tablero, parte, `useTableroKanban lleva ${parte}`);
  }
  assert.match(pag, /useResumenFlujo<DatosFlujo>\('\/compras\/flujo', recargaFlujo\)/);
  assert.match(pag, /`\/compras\/stats\?periodo=\$\{PERIODO_KPI\}`/);
  assert.ok(!/compras\/(?:recepciones|pedidos)\?limit=100/.test(pag) && !/\.catch\(\(\) => (\[\]|\{\}|null)\)/.test(pag), 'ya no se cargan 100 ni se traga un error');
  // El tablero solo para ver (KANBAN-logistica punto 5): soloLectura con su motivo, sin regla ni onCambio.
  const tab = /<TableroKanban([\s\S]*?)\/>/.exec(pag)?.[1] ?? '';
  assert.match(pag, /const TEXTO_SOLO_VER = 'Este tablero es para ver: las recepciones se confirman contando la mercancía\.';/);
  assert.match(tab, /soloLectura=\{TEXTO_SOLO_VER\}/);
  assert.match(tab, /tarjetaDe=\{tarjetaRecepcion\}/);
  assert.match(tab, /onAbrir=\{abrir\}/, 'el clic abre el Drawer, como la fila');
  assert.ok(!/regla=|onCambio=|onAccion=/.test(tab), 'sin regla: no se arrastra');
  // La tabla (R26, D41): estándar en el servidor; toda la fila abre el Drawer; las vistas reales de RP41 y D6.
  assert.match(pag, /<TablaEstandar\s+id=\{ID_RECEPCIONES\}\s+modo="servidor"/);
  assert.match(pag, /onFila=\{abrir\}/, 'toda la fila abre el Drawer');
  for (const [id, etiqueta] of [['por_confirmar', 'Por confirmar'], ['confirmadas', 'Confirmadas'], ['canceladas', 'Canceladas'], ['todas', 'Todas']]) {
    assert.match(pag, new RegExp(`\\{ id: '${id}', etiqueta: '${etiqueta}', conteo: conteos\\?\\.${id} \\?\\? null`), `pestaña ${etiqueta}`);
  }
  const codigo = pag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/'Pendientes'|'Completadas'|Regla de Separación|Mesa de Recepci[oó]n Activa|r\.estado === 'PENDIENTE'|!r\.stock_actualizado|row\.stock_actualizado/.test(codigo),
    'sin las pestañas viejas, el estado que no existe ni la tarjeta/aviso de antes');
  assert.match(pag, /opcionesEstados=\{enKanban \? OPCIONES_ESTADOS_TABLERO_RECEPCION : opcionesEstadosRecepcion\}/);
  // «Abrir conteo» y Confirmar por fila: cada botón carga por su cuenta (confirmandoId) y se bloquea solo mientras otra confirmación va en camino.
  assert.ok(!/\bconfirming\b/.test(pag), 'confirming (uno para todos) pasó a confirmandoId');
  assert.match(pag, /const confirmando = acciones\?\.confirmandoId === r\.id;/, 'solo el botón de esa fila carga');
  assert.match(pag, /disabled=\{acciones\?\.confirmandoId != null\}/, 'y los demás esperan');
  assert.match(pag, /setConfirmandoId\(r\.id\);[\s\S]*finally \{\s*setConfirmandoId\(null\);\s*\}/, 'confirmandoId se pone y se quita siempre');
  assert.match(pag, /aria-label=\{`Abrir el conteo de \$\{numero\}`\}/);
  assert.match(pag, /aria-label=\{`Confirmar la recepción \$\{numero\}`\}/);
  assert.match(pag, /href=\{`\/dashboard\/compras\/recepciones\/\$\{r\.id\}`\}/, '«Abrir conteo» va a /compras/recepciones/[id]');
  assert.match(pag, /oculto: !porConfirmar/, 'Confirmar solo en una recepción por confirmar (BORRADOR), no en logísticas ni canceladas');
  assert.match(pag, /avisarError\(err, `No se pudo confirmar \$\{numeroRecepcion\(r\)\}`\);\s*if \(recargarTrasError\(err\)\) recargarTodo\(\);/, 'un error se dice y, con la regla única, se recarga');
  // El Drawer conserva «Confirmar Entrada Física y Actualizar Stock» y suma «Abrir conteo».
  assert.match(pag, /Confirmar Entrada Física y Actualizar Stock/);
  assert.match(pag, /<ClipboardList size=\{14\} aria-hidden="true" \/> Abrir conteo/);
  // Las tarjetas (KPI-compras punto 8) y la nota; la franja (FLUJO-compras punto 9) sin semáforo.
  for (const kpi of ['rec_por_confirmar', 'rec_confirmadas', 'pec_en_transito']) assert.match(pag, new RegExp(`<TarjetaKpi kpi="${kpi}"`), kpi);
  assert.match(pag, /<FranjaKpis estado=\{estadoKpis\} titulo="Recepciones" nota=\{NOTA_RECEPCIONES\}>/);
  assert.match(pag, /tarjetasRecepciones\(stats\?\.datos \?\? null\)/);
  assert.match(pag, /activo=\{vistaActiva === 'por_confirmar'\} onClick=\{\(\) => elegirVista\('por_confirmar'\)\}/);
  assert.match(pag, /activo=\{vistaActiva === 'confirmadas'\} onClick=\{\(\) => elegirVista\('confirmadas'\)\}/);
  assert.match(pag, /pasos=\{pasosPantallaCompras\(flujo\.datos, 'RECEPCION'\)\}/);
  assert.match(pag, /avisos=\{avisosFlujoCompras\(flujo\.datos\)\}/, 'RP46: «N recepciones por confirmar»');
  assert.ok(!/semaforo=\{|noResueltos/.test(pag), 'Recepciones no tiene semáforo ni «No resueltos»');
  // El selector de PEC: los estados recepcionables, pedidos al abrir, con su error a la vista y Reintentar (nunca [] en silencio).
  assert.match(pag, /const ESTADOS_RECEPCIONABLES = 'EN_TRANSITO,PENDIENTE_ENTREGA,RECIBIDO,PARCIALMENTE_RECIBIDA';/);
  assert.match(pag, /if \(!showPecModal\) return undefined;/, 'el selector pide los pedidos al abrirse');
  assert.match(pag, /pecs\?\.error != null/);
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(pag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')), 'sin diálogos nativos');
}

console.log('--- TEST 33 (B4 T16A, TABLA-compras punto 12; RP30): el conteo de una recepción (recepciones/[id]/page.tsx) en modo simple y sin diálogos nativos ---');
{
  const cont = readFileSync(new URL('../src/app/dashboard/compras/recepciones/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = cont.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  // Los 3 diálogos nativos de B1 a B3 (bodega, guardar el conteo y validar) pasaron a useAvisos con el mismo texto.
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(codigo), 'sin diálogos nativos');
  assert.match(cont, /const \{ avisarError \} = useAvisos\(\);/);
  for (const texto of ['Error al asignar la bodega', 'Error al guardar el conteo', 'Error al validar la recepción']) {
    assert.match(cont, new RegExp(`avisarError\\(err, '${texto}'\\)`), texto);
  }
  assert.match(cont, /avisarError\(err, 'No se pudieron cargar las bodegas'\)/, 'la lista de bodegas ya no se traga el error');
  assert.ok(!/\.catch\(\(\) => \{\}\)/.test(cont) && !/\.catch\(\(\) => (\[\]|null)\)/.test(cont), 'ningún error se traga');
  assert.match(cont, /if \(recargarTrasError\(err\)\) await loadRecepcion\(\);/, 'validar: un 409 recarga lo que se ve');
  // La tabla (modo simple, D40): una instancia de preferencias, una tabla y los campos de conteo siguen editables.
  assert.match(cont, /const prefsConteo = usePreferenciasTabla\('compras\.recepcion\.conteo', COLUMNAS_CONTEO\);/);
  assert.match(cont, /<TablaEstandar id="compras\.recepcion\.conteo" modo="simple" columnas=\{COLUMNAS_CONTEO\} preferencias=\{prefsConteo\}/);
  assert.ok(!/<table\b/.test(cont), 'la tabla a mano se fue');
  for (const [id, titulo] of [['producto', 'Producto (Referencia PEC)'], ['esperada', 'Cant. Esperada'], ['recibida', 'Cant. Recibida'], ['diferencia', 'Diferencia'],
    ['observaciones', 'Observaciones Físicas']]) {
    assert.match(cont, new RegExp(`\\{ id: '${id}', titulo: '${titulo.replace(/[().]/g, '\\$&')}'`), `columna ${titulo}`);
  }
  assert.match(cont, /const isEditable = data\?\.estado === 'BORRADOR';/, 'solo un BORRADOR se cuenta');
  assert.match(cont, /if \(!isEditable\) return;\s*setItems\(prev => prev\.map\(\(it, i\) => \(i === idx \? \{ \.\.\.it, qty_recibida: val \} : it\)\)\);/, 'el conteo sigue editable solo en BORRADOR');
  assert.equal((cont.match(/disabled=\{!control\?\.editable\}/g) ?? []).length, 2, 'los dos campos (cantidad y observaciones) se apagan cuando no es editable');
  assert.match(cont, /onChange=\{\(e\) => control\?\.actualizar\(l\.idx, parseInt\(e\.target\.value\) \|\| 0\)\}/, 'y escribe en la línea de esa fila');
  assert.match(cont, /aria-label=\{`Cantidad recibida de \$\{l\.nombre\}`\}/);
  // Lo de B1 a B3 sigue: guardar el borrador, cerrar y validar (guarda antes de confirmar), la bodega y el exceso.
  for (const texto of ['Guardar Borrador', 'Cerrar y Validar Conteo', 'Bodega Receptora', 'Alerta de Discrepancia en Conteo Físico']) assert.ok(cont.includes(texto), texto);
  assert.match(cont, /const saved = await guardarConteo\(\);\s*if \(!saved\) \{ setConfirming\(false\); return; \}/, 'cerrar y validar guarda primero');
  assert.match(cont, /allow_excess: allowExcess/);
  assert.match(cont, /\/compras\/recepciones\/\$\{data\.id\}\/confirmar/);
  // La guardia de diálogos nativos incluye las pantallas de T16A (RP30), en el mismo commit.
  const guardia = readFileSync(new URL('./test_sin_dialogos_nativos.mjs', import.meta.url), 'utf8');
  for (const ruta of ['recepciones/[id]/page.tsx', 'transito/page.tsx', 'recepciones/page.tsx', 'columnas-recepcion.tsx']) {
    assert.ok(guardia.includes(`'src/app/dashboard/compras/${ruta}'`), `RAICES lleva ${ruta}`);
  }
}

console.log('--- TEST 34 (B4 T16A r1, m13): la lógica de una recepción vive en un solo lugar (estados-compras.js) ---');
{
  for (const f of ['numeroRecepcion', 'pecDeRecepcion', 'proveedorDeRecepcion', 'esRecepcionPorConfirmar']) assert.equal(typeof ec[f], 'function', f);
  assert.equal(ec.numeroRecepcion({ id: 9 }), 'ENINV-9');
  assert.equal(ec.numeroRecepcion({ id: 9, numero: '  ' }), 'ENINV-9', 'un número en blanco no vale');
  assert.equal(ec.numeroRecepcion({ id: 9, numero: ' ENINV-1 ' }), 'ENINV-1');
  assert.equal(ec.pecDeRecepcion({ pec_numero: 'PEC-3' }), 'PEC-3');
  assert.equal(ec.pecDeRecepcion({ pec_id: 4 }), 'PEC-4');
  assert.equal(ec.pecDeRecepcion({}), 'Entrada manual');
  assert.equal(typeof ec.esEntradaManual, 'function', 'esEntradaManual existe');
  assert.equal(ec.esEntradaManual({}), true);
  assert.equal(ec.esEntradaManual({ pec_numero: '  ' }), true, 'un número en blanco no vale');
  assert.equal(ec.esEntradaManual({ pec_numero: 'PEC-3' }), false);
  assert.equal(ec.esEntradaManual({ pec_id: 4 }), false, 'con id de PEC no es manual');
  for (const r of [{}, { pec_id: 4 }, { pec_numero: 'PEC-3' }, { pec_numero: ' ' }]) {
    assert.equal(ec.esEntradaManual(r), ec.pecDeRecepcion(r) === 'Entrada manual', 'coherente con pecDeRecepcion');
  }
  assert.equal(ec.proveedorDeRecepcion({ supplier_name: 'Acme' }), 'Acme');
  assert.equal(ec.proveedorDeRecepcion({ proveedor_nombre: 'Beta' }), 'Beta');
  assert.equal(ec.proveedorDeRecepcion({ supplier_name: '  ' }), 'Sin proveedor');
  assert.equal(ec.esRecepcionPorConfirmar({ estado: 'BORRADOR' }), true);
  assert.equal(ec.esRecepcionPorConfirmar({ estado: ' BORRADOR ' }), true);
  for (const e of ['COMPLETADA', 'COMPLETADA_LOGISTICA', 'CANCELADA', 'PENDIENTE', null, undefined]) assert.equal(ec.esRecepcionPorConfirmar({ estado: e }), false, String(e));
  // La tabla, el Drawer y el tablero dicen lo mismo del mismo campo.
  const r = { id: 7, numero: ' ', supplier_name: ' ', estado: 'BORRADOR' };
  const t = ec.tarjetaRecepcion(r);
  assert.equal(t.numero, ec.numeroRecepcion(r));
  assert.equal(t.titulo, ec.proveedorDeRecepcion(r));
  assert.equal(t.subtitulo, ec.pecDeRecepcion(r));
  assert.equal(t.accionPrincipal !== null, ec.esRecepcionPorConfirmar(r));
  // columnas-recepcion.tsx no repite la lógica: usa las de la lib.
  const col = readFileSync(new URL('../src/app/dashboard/compras/columnas-recepcion.tsx', import.meta.url), 'utf8');
  assert.match(col, /numeroRecepcion, pecDeRecepcion, proveedorDeRecepcion, esRecepcionPorConfirmar/);
  assert.ok(!/grupoRecepcion\(/.test(col) && !/`ENINV-\$\{/.test(col), 'sin la regla copiada');
}

console.log('--- TEST 35 (B4 T16A r1): Recepciones busca por producto; el selector pide primero lo que llegó (m15) ---');
{
  const pag = readFileSync(new URL('../src/app/dashboard/compras/recepciones/page.tsx', import.meta.url), 'utf8');
  assert.match(pag, /placeholder="Buscar por recepción, PEC, proveedor, bodega o producto…"/, 'I1: la búsqueda por producto vuelve (la hace el servidor)');
  assert.match(pag, /orden=-estado&limit=200/, 'm15: primero Recibido en parte y Llegó a bodega, luego lo que espera entrega');
  assert.ok(!/orden=atencion/.test(pag));
}

console.log('--- TEST 36 (B4 T16A r1): Drawer (m4, m10, m14), tildes (m11), comentarios y autor (m9, m16) ---');
{
  const pag = readFileSync(new URL('../src/app/dashboard/compras/recepciones/page.tsx', import.meta.url), 'utf8');
  const cont = readFileSync(new URL('../src/app/dashboard/compras/recepciones/[id]/page.tsx', import.meta.url), 'utf8');
  const tr = readFileSync(new URL('../src/app/dashboard/compras/transito/page.tsx', import.meta.url), 'utf8');
  assert.match(pag, /destino: 'CLIENTE', qty: 1, cantidad_recibida: 1 \}/, 'm4: la línea de respaldo del Drawer, como en BASE');
  assert.ok(!/qty_recibida: 1/.test(pag), 'm4: sin qty_recibida en la línea de respaldo');
  assert.match(pag, /<CeldaEstadoRecepcion r=\{selectedItem\} \/>/, 'm10 y m14: la insignia del Drawer usa el tono de su estado (una CANCELADA no sale en verde)');
  assert.ok(!/Badge tone=\{esRecepcionPorConfirmar/.test(pag));
  assert.ok(!pag.includes('Bodega Principal Barranquilla'), 'm10: sin la bodega inventada');
  for (const texto of ['Mesa de Recepción', 'Recepción generada en Mesa de Entrada', 'Confirmado en mesa de recepción Nebulae']) assert.ok(pag.includes(texto), `m11: ${texto}`);
  for (const viejo of ["'Mesa de Recepcion'", 'Recepcion generada', 'mesa de recepcion Nebulae']) assert.ok(!pag.includes(viejo), `m11: sin «${viejo}»`);
  assert.ok(cont.includes('Finanzas bloqueará el pago') && cont.includes('Mercancía Recibida Satisfactoriamente'), 'm4 y m10: tildes del conteo');
  assert.ok(!cont.includes('bloqueara') && !cont.includes('Mercancia'));
  for (const viejo of ['Inspeccion y Calidad', 'Optimo (Sin danos', 'Recepcion no editable', 'Item de Compra', 'Conteo Fisico']) assert.ok(!cont.includes(viejo), `m11: sin «${viejo}»`);
  assert.ok(cont.includes('Inspección y Calidad') && cont.includes('Óptimo (Sin daños visibles)'));
  const colRec = readFileSync(new URL('../src/app/dashboard/compras/columnas-recepcion.tsx', import.meta.url), 'utf8');
  assert.ok(colRec.includes("(esEntradaManual(r) ? 'Manual' : pecDeRecepcion(r))"), 'm6 y m7: «Entrada manual» no cabe en 92 px (medido: 99 contra 68): la tabla dice Manual, decidido por el dato');
  assert.ok(!colRec.includes("=== 'Entrada manual'"), 'm3: no se compara el texto');
  assert.ok(colRec.includes('titleCelda: (r) => pecDeRecepcion(r),'), 'm3: el title sigue diciendo «Entrada manual» (texto largo)');
  assert.ok(colRec.includes('{pecCorto(r)}</span>'), 'la celda pinta la forma corta');
  assert.ok(!/un 404 o un 409/.test(pag + tr + cont), 'm9: los comentarios dicen la regla real de recargarTrasError');
  assert.match(tr, /Sin nombre cae al correo del usuario/, 'm16: el comentario de autorActual dice lo que hace');
  assert.ok(!/el servidor usa el correo/.test(tr));
}

console.log('--- TEST 37 (B4 T16B, TABLA-compras punto 10, KANBAN-logistica punto 5; KPI-compras punto 9): Lista de compras, vistas, consulta y tablero solo para ver ---');
{
  // Las vistas (pestañas) son las claves de los conteos del servidor: todos, PENDIENTE, EN_PEDIDO y RECIBIDO.
  assert.deepEqual(Object.keys(ec.VISTAS_LISTA ?? {}), ['todos', 'PENDIENTE', 'EN_PEDIDO', 'RECIBIDO']);
  assert.deepEqual(ec.VISTAS_LISTA.todos, ['PENDIENTE', 'EN_PEDIDO', 'RECIBIDO'], 'DESCARTADO no se muestra');
  for (const e of ['PENDIENTE', 'EN_PEDIDO', 'RECIBIDO']) assert.deepEqual(ec.VISTAS_LISTA[e], [e]);
  assert.throws(() => { ec.VISTAS_LISTA.otra = []; }, TypeError, 'inmutable');

  // La insignia: la de ESTADOS_ITEM_LISTA; un desconocido (DESCARTADO) sale humanizado en gris.
  assert.equal(ec.infoEstadoItemLista('EN_PEDIDO').label, 'En pedido');
  assert.equal(ec.infoEstadoItemLista(' PENDIENTE ').label, 'Pendiente');
  assert.equal(ec.infoEstadoItemLista('DESCARTADO').label, 'Descartado');
  assert.match(ec.infoEstadoItemLista('DESCARTADO').clases.bg, /gray/);

  // «Filtrar estado»: los de la pestaña; sin pestaña o una rara, los 3. En el tablero, una opción por columna.
  assert.deepEqual(ec.opcionesEstadosLista('EN_PEDIDO'), [{ valor: 'EN_PEDIDO', etiqueta: 'En pedido' }]);
  for (const v of ['todos', null, undefined, 'rara', 'toString']) {
    assert.deepEqual(ec.opcionesEstadosLista(v).map((o) => o.valor), ['PENDIENTE', 'EN_PEDIDO', 'RECIBIDO'], String(v));
  }
  assert.equal(ec.opcionesEstadosLista('RECIBIDO'), ec.opcionesEstadosLista('RECIBIDO'), 'la misma referencia');
  assert.deepEqual(ec.OPCIONES_ESTADOS_TABLERO_LISTA,
    [{ valor: 'PENDIENTE', etiqueta: 'Pendiente' }, { valor: 'EN_PEDIDO', etiqueta: 'En pedido' }, { valor: 'RECIBIDO', etiqueta: 'Recibido' }]);

  // La consulta de la TABLA (extra de useListado): sin vista (el servidor no la tiene), los estados de la pestaña cruzados con
  // el filtro, y el proveedor y las fechas de los filtros extra. «Todos» sin filtro no manda estados (el servidor excluye DESCARTADO).
  const consulta = (parcial, filtros) => ec.consultaLista(estadoTablaInicial(parcial), filtros);
  assert.deepEqual(consulta({ vista: 'todos' }), { vista: null, estados: null, proveedor: null, fecha_desde: null, fecha_hasta: null });
  assert.deepEqual(consulta({ vista: 'PENDIENTE' }).estados, ['PENDIENTE']);
  assert.deepEqual(consulta({ vista: 'todos', estados: ['RECIBIDO', 'PENDIENTE'] }).estados, ['RECIBIDO', 'PENDIENTE'], 'el filtro en Todos');
  assert.deepEqual(consulta({ vista: 'todos' }, { proveedor: ' Acme ', desde: '2026-11-01', hasta: '2026-11-07' }),
    { vista: null, estados: null, proveedor: 'Acme', fecha_desde: '2026-11-01', fecha_hasta: '2026-11-07' });
  assert.deepEqual(consulta({ vista: 'RECIBIDO' }, { proveedor: '   ', desde: '', hasta: null }),
    { vista: null, estados: ['RECIBIDO'], proveedor: null, fecha_desde: null, fecha_hasta: null }, 'lo vacío se omite');
  // Una pestaña restaurada de otra sesión que no existe es «Todos». Un filtro que la pestaña no tiene (no se puede armar desde
  // la barra: accionPestana lo poda): gana el filtro, para que lo que se pide sea lo que FiltroEstados muestra.
  assert.equal(consulta({ vista: 'rara' }).estados, null);
  assert.deepEqual(consulta({ vista: 'PENDIENTE', estados: ['RECIBIDO'] }).estados, ['RECIBIDO']);
  // La URL que arma queryListado con eso: el orden de la tabla, la página y los filtros, sin vista=.
  assert.equal(queryListado(estadoTablaInicial({ vista: 'EN_PEDIDO', q: 'cable', orden: '-fecha', pagina: 2 }),
    ec.consultaLista(estadoTablaInicial({ vista: 'EN_PEDIDO', q: 'cable', orden: '-fecha', pagina: 2 }), { proveedor: 'Acme' })),
  'q=cable&estados=EN_PEDIDO&orden=-fecha&limit=25&offset=25&proveedor=Acme');

  // La consulta del TABLERO (modo cliente): sin vista, los 200 más recientes, el filtro de estados y los filtros extra.
  const tablero = (parcial, filtros) => ec.consultaTableroLista(estadoTablaInicial(parcial), filtros);
  assert.deepEqual(tablero({ modo: 'kanban', vista: 'PENDIENTE', orden: '-producto', pagina: 3, tamano: 50 }),
    { vista: null, estados: null, proveedor: null, fecha_desde: null, fecha_hasta: null, orden: '-fecha', limit: 200, offset: 0 },
    'la pestaña y el orden de la tabla no cuentan: el tablero trae las tres columnas');
  assert.deepEqual(tablero({ modo: 'kanban', estados: ['PENDIENTE'] }, { proveedor: 'Acme' }).estados, ['PENDIENTE']);
  assert.equal(tablero({ modo: 'kanban' }, { proveedor: 'Acme' }).proveedor, 'Acme');

  // Cada estado de la Lista está en una sola columna y DESCARTADO en ninguna.
  for (const e of Object.keys(ESTADOS_ITEM_LISTA)) assert.equal(COLUMNAS_LISTA.filter((c) => c.estados.includes(e)).length, 1, e);
  assert.equal(COLUMNAS_LISTA.filter((c) => c.estados.includes('DESCARTADO')).length, 0);

  // Solo se seleccionan los ítems PENDIENTE (TABLA-compras punto 10).
  assert.equal(ec.esItemSeleccionable({ estado: 'PENDIENTE' }), true);
  for (const e of ['EN_PEDIDO', 'RECIBIDO', 'DESCARTADO', undefined, null]) assert.equal(ec.esItemSeleccionable({ estado: e }), false, String(e));
  assert.equal(ec.esItemSeleccionable(null), false);

  // «Ver»: el clic abre el PEC vinculado y, sin PEC, el PVEN; sin ninguno, nada.
  assert.equal(ec.destinoItemLista({ pec_id: 4, pven_id: 9 }), '/dashboard/compras/pedidos?id=4');
  assert.equal(ec.destinoItemLista({ pec_id: null, pven_id: 9 }), '/dashboard/ventas/venta?id=9');
  assert.equal(ec.destinoItemLista({}), null);
  assert.equal(ec.destinoItemLista(null), null);

  // La tarjeta del tablero solo para ver.
  const it = { id: 5, producto: 'Cable USB-C', cantidad: 3, pven_id: 9, pven_numero: 'PVEN-20262799', proveedor: 'Acme', pec_id: 4,
    pec_numero: 'PEC-12', estado: 'EN_PEDIDO', fecha: '2026-11-05T15:00:00Z' };
  assert.deepEqual(ec.tarjetaItemLista(it), {
    numero: 'PVEN-20262799', tipo: 'PVEN', titulo: 'Cable USB-C', subtitulo: '3 uds · Acme', monto: null,
    estado: ec.infoEstadoItemLista('EN_PEDIDO'), chips: [{ texto: 'PEC-12', tono: 'purple' }], tiempo: '5 nov 2026', atrasada: false,
    accionPrincipal: { texto: 'Ver pedido de compra', href: '/dashboard/compras/pedidos?id=4', tono: 'purple' },
  });
  const pend = ec.tarjetaItemLista({ id: 6, producto: 'Mouse', cantidad: 1, pven_id: 9, pven_numero: 'PVEN-1', estado: 'PENDIENTE' });
  assert.equal(pend.subtitulo, '1 ud · Sin proveedor');
  assert.deepEqual(pend.chips, []);
  assert.equal(pend.tiempo, null);
  assert.deepEqual(pend.accionPrincipal, { texto: 'Ver pedido de venta', href: '/dashboard/ventas/venta?id=9', tono: 'emerald' });
  const suelto = ec.tarjetaItemLista({ id: 7, producto: '  ', cantidad: 'x', estado: 'RECIBIDO' });
  assert.equal(suelto.numero, 'Ítem 7', 'sin PVEN ni PEC: Ítem id');
  assert.equal(suelto.tipo, null);
  assert.equal(suelto.titulo, 'Producto sin nombre');
  assert.equal(suelto.subtitulo, 'Sin proveedor');
  assert.equal(suelto.accionPrincipal, null);

  // El «vacío» de la tabla dice qué lo causa (el filtro, la búsqueda, el proveedor o las fechas, la pestaña).
  const vacio = (parcial, filtros) => ec.textoVacioLista(estadoTablaInicial(parcial), filtros);
  assert.deepEqual(vacio({ estados: ['RECIBIDO'], q: 'x' }), { titulo: 'Ningún ítem con esos estados. Ajusta el filtro.', ayuda: null });
  assert.deepEqual(vacio({ q: ' cable ' }), { titulo: 'Sin resultados para «cable»', ayuda: 'Ajusta la búsqueda, el proveedor, las fechas o el filtro de estados.' });
  assert.deepEqual(vacio({}, { proveedor: 'Acme' }), { titulo: 'Sin resultados con esos filtros', ayuda: 'Ajusta la búsqueda, el proveedor, las fechas o el filtro de estados.' });
  assert.deepEqual(vacio({}, { desde: '2026-11-01' }).titulo, 'Sin resultados con esos filtros');
  assert.deepEqual(vacio({ vista: 'PENDIENTE' }), { titulo: 'No hay ítems pendientes de compra', ayuda: 'Los productos llegan desde los pedidos de venta en «Pendiente de compra».' });
  assert.deepEqual(vacio({ vista: 'EN_PEDIDO' }), { titulo: 'No hay ítems en pedido', ayuda: null });
  assert.deepEqual(vacio({ vista: 'RECIBIDO' }), { titulo: 'Aún no hay ítems recibidos', ayuda: null });
  assert.deepEqual(vacio({ vista: 'todos' }), { titulo: 'No hay productos en la lista', ayuda: 'Los productos se agregan desde los pedidos de venta en «Pendiente de compra».' });
  assert.equal(ec.textoVacioLista(null).titulo, 'No hay productos en la lista');
}

console.log('--- TEST 38 (B4 T16B, TABLA-compras punto 11, KANBAN-logistica punto 5; KPI-compras punto 10): Traslados, vistas, consulta, columnas y tablero solo para ver ---');
{
  // Las pestañas son los grupos de operación (R9) y «todos»: En proceso (DRAFT y READY), Completados y Cancelados.
  assert.deepEqual(Object.keys(ec.VISTAS_TRASLADO ?? {}), ['en_proceso', 'completadas', 'canceladas', 'todos']);
  for (const [grupo, estados] of Object.entries(GRUPOS_OPERACION)) assert.deepEqual(ec.VISTAS_TRASLADO[grupo], estados, `${grupo} es el grupo`);
  assert.deepEqual(ec.VISTAS_TRASLADO.todos, ['DRAFT', 'READY', 'DONE', 'CANCELLED']);
  assert.throws(() => { ec.VISTAS_TRASLADO.otra = []; }, TypeError, 'inmutable');

  // Los conteos del servidor ({todos, DRAFT, READY, DONE, CANCELLED}) por pestaña; lo que no llega queda en null (la barra gris).
  assert.deepEqual(ec.conteosTraslado({ todos: 9, DRAFT: 2, READY: 3, DONE: 3, CANCELLED: 1 }),
    { en_proceso: 5, completadas: 3, canceladas: 1, todos: 9 });
  assert.deepEqual(ec.conteosTraslado({ todos: 4, DRAFT: 0, READY: 1, DONE: 3, CANCELLED: 0 }).en_proceso, 1);
  assert.deepEqual(ec.conteosTraslado({ todos: 4, DRAFT: 2, DONE: 2 }), { en_proceso: null, completadas: 2, canceladas: null, todos: 4 });
  assert.deepEqual(ec.conteosTraslado({ todos: 4, DRAFT: '2', READY: '1', DONE: 'x' }), { en_proceso: 3, completadas: null, canceladas: null, todos: 4 });
  for (const malo of [null, undefined, 'x', [1]]) assert.deepEqual(ec.conteosTraslado(malo), { en_proceso: null, completadas: null, canceladas: null, todos: null }, String(malo));

  // La insignia (ESTADOS_TRASLADO) y el filtro de estados.
  assert.equal(ec.infoEstadoTraslado('DONE').label, 'Hecho');
  assert.equal(ec.infoEstadoTraslado(' READY ').label, 'Listo');
  assert.equal(ec.infoEstadoTraslado('ALGO').label, 'Algo');
  assert.deepEqual(ec.opcionesEstadosTraslado('en_proceso'), [{ valor: 'DRAFT', etiqueta: 'Borrador' }, { valor: 'READY', etiqueta: 'Listo' }]);
  for (const v of ['todos', null, undefined, 'rara', 'toString']) {
    assert.deepEqual(ec.opcionesEstadosTraslado(v).map((o) => o.valor), ['DRAFT', 'READY', 'DONE', 'CANCELLED'], String(v));
  }
  assert.equal(ec.opcionesEstadosTraslado('canceladas'), ec.opcionesEstadosTraslado('canceladas'));
  assert.deepEqual(ec.OPCIONES_ESTADOS_TABLERO_TRASLADO,
    [{ valor: 'DRAFT', etiqueta: 'Borrador' }, { valor: 'READY', etiqueta: 'Listo' }, { valor: 'DONE', etiqueta: 'Hecho' }, { valor: 'CANCELLED', etiqueta: 'Cancelado' }]);

  // La consulta de la TABLA: solo traslados (operation_type), sin vista ni estados (el servidor usa status), los estados de la
  // pestaña cruzados con el filtro. «Todos» sin filtro no manda status.
  const consulta = (parcial) => ec.consultaTraslados(estadoTablaInicial(parcial));
  assert.deepEqual(consulta({ vista: 'todos' }), { operation_type: 'TRANSFER', vista: null, estados: null, status: null });
  assert.deepEqual(consulta({ vista: 'en_proceso' }), { operation_type: 'TRANSFER', vista: null, estados: null, status: ['DRAFT', 'READY'] });
  assert.deepEqual(consulta({ vista: 'completadas' }).status, ['DONE']);
  assert.deepEqual(consulta({ vista: 'todos', estados: ['DONE'] }).status, ['DONE']);
  assert.deepEqual(consulta({ vista: 'en_proceso', estados: ['READY'] }).status, ['READY']);
  assert.deepEqual(consulta({ vista: 'en_proceso', estados: ['DONE'] }).status, ['DONE'], 'gana el filtro (la barra lo poda al cambiar de pestaña)');
  assert.equal(consulta({ vista: 'rara' }).status, null);
  const estadoT = estadoTablaInicial({ vista: 'en_proceso', q: 'TRL-0012', orden: 'fecha', pagina: 3, tamano: 50 });
  assert.equal(queryListado(estadoT, ec.consultaTraslados(estadoT)),
    'q=TRL-0012&orden=fecha&limit=50&offset=100&operation_type=TRANSFER&status=DRAFT,READY');

  // El TABLERO (modo cliente): todos los traslados que dejan la búsqueda y el filtro, los 200 más recientes.
  const tab = ec.consultaTableroTraslados(estadoTablaInicial({ modo: 'kanban', vista: 'completadas', orden: 'status', pagina: 2, estados: ['DONE'] }));
  assert.deepEqual(tab, { operation_type: 'TRANSFER', vista: null, estados: null, status: ['DONE'], orden: '-fecha', limit: 200, offset: 0 });
  assert.equal(ec.consultaTableroTraslados(estadoTablaInicial({ modo: 'kanban', vista: 'completadas' })).status, null, 'la pestaña no cuenta en el tablero');

  // Cada estado de traslado está en una sola columna y cada columna del tablero tiene su estado.
  for (const e of Object.keys(ESTADOS_TRASLADO)) assert.equal(COLUMNAS_TRASLADO.filter((c) => c.estados.includes(e)).length, 1, e);

  // Número, productos, fecha y bodegas de una fila.
  assert.equal(ec.numeroTraslado({ id: 12 }), 'TRL-0012');
  assert.equal(ec.numeroTraslado({ id: 12345 }), 'TRL-12345');
  const t = { id: 12, status: 'READY', source_warehouse_id: 1, dest_warehouse_id: 2, fecha: '2026-11-05T15:00:00Z',
    movements: [{ direction: 'TRANSFER_OUT', sku_id: 7, quantity: 2 }, { direction: 'TRANSFER_IN', sku_id: 7, quantity: 2 },
      { direction: 'TRANSFER_OUT', sku_id: 8, quantity: 1 }, { direction: 'TRANSFER_IN', sku_id: 8, quantity: 1 }] };
  assert.equal(ec.productosDeTraslado(t), 2, 'los productos son las salidas (el Drawer los lista igual)');
  assert.equal(ec.productosDeTraslado({ id: 1 }), 0);
  assert.equal(ec.productosDeTraslado({ movements: [{ sku_id: 1 }, { sku_id: 2 }] }), 2, 'sin dirección cuenta cada movimiento');
  assert.equal(ec.textoFechaTraslado(t), '5 nov 2026');
  assert.equal(ec.textoFechaTraslado({ id: 1 }), '—', 'sin movimientos no hay fecha');
  assert.equal(ec.textoFechaTraslado({ fecha: '2026-11-08T02:00:00Z' }), '7 nov 2026', 'un instante: el día de Colombia');
  const bodegas = [{ id: 1, name: 'Bodega A' }, { id: 2, name: 'Bodega B' }];
  assert.equal(ec.nombreBodega(bodegas, 1), 'Bodega A');
  assert.equal(ec.nombreBodega(bodegas, 9), 'Bodega #9');
  assert.equal(ec.nombreBodega(bodegas, null), '—');
  assert.equal(ec.nombreBodega(null, 1), 'Bodega #1');

  // La tarjeta del tablero solo para ver.
  assert.deepEqual(ec.tarjetaTraslado(t, bodegas), {
    numero: 'TRL-0012', tipo: 'TRL', titulo: 'Bodega A → Bodega B', subtitulo: '2 productos', monto: null,
    estado: ec.infoEstadoTraslado('READY'), chips: [], tiempo: '5 nov 2026', atrasada: false, accionPrincipal: null,
  });
  assert.equal(ec.tarjetaTraslado({ id: 3, status: 'DONE', movements: [{ direction: 'TRANSFER_OUT' }] }, []).subtitulo, '1 producto');
  assert.deepEqual(ec.tarjetaTraslado({ id: 3, status: 'DRAFT', tracking_number: 'ABC1' }, bodegas).chips, [{ texto: 'Guía ABC1', tono: 'slate' }]);
  assert.equal(ec.tarjetaTraslado({ id: 3, status: 'DRAFT' }, bodegas).tiempo, null);

  // El «vacío» de la tabla.
  const vacio = (parcial) => ec.textoVacioTraslados(estadoTablaInicial(parcial));
  assert.deepEqual(vacio({ estados: ['DONE'] }), { titulo: 'Ningún traslado con esos estados. Ajusta el filtro.', ayuda: null });
  assert.deepEqual(vacio({ q: ' bodega ' }), { titulo: 'Sin resultados para «bodega»', ayuda: 'Ajusta la búsqueda o el filtro de estados.' });
  assert.deepEqual(vacio({ vista: 'en_proceso' }), { titulo: 'No hay traslados en proceso', ayuda: 'Crea un traslado para mover mercancía entre bodegas.' });
  assert.deepEqual(vacio({ vista: 'completadas' }), { titulo: 'Aún no hay traslados completados', ayuda: null });
  assert.deepEqual(vacio({ vista: 'canceladas' }), { titulo: 'No hay traslados cancelados', ayuda: null });
  assert.deepEqual(vacio({ vista: 'todos' }), { titulo: 'Sin traslados internos registrados', ayuda: 'Crea un traslado para mover mercancía entre bodegas.' });
  assert.equal(ec.textoVacioTraslados(null).titulo, 'Sin traslados internos registrados');
}

console.log('--- TEST 39 (B4 T16B): la Lista de compras (compras/lista-compras/page.tsx) cablea las piezas, la tabla, el tablero solo para ver y el servidor ---');
{
  const pag = readFileSync(new URL('../src/app/dashboard/compras/lista-compras/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = pag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/@ts-nocheck/.test(pag), 'la página se tipa');
  // Carga del servidor (R5, C3, C4, D39, D40): un estado, la tabla en el servidor y los filtros extra en la consulta.
  assert.match(pag, /const ID_LISTA = 'compras\.lista';/);
  assert.match(pag, /const INICIAL_LISTA = \{ vista: 'PENDIENTE' \};/, 'la pestaña de trabajo sigue siendo Pendiente');
  assert.match(pag, /useEstadoTabla\(ID_LISTA, INICIAL_LISTA\)/);
  const tabla = /useListado<ItemLista>\(\{\s*ruta: '\/compras\/lista-compras', estado, conConteos: true([^}]*)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/esperar: !listo/, /\bdespachar\b/, /activo: !enKanban/, /extra: extraDeLaLista/]) assert.match(tabla, parte, `la tabla lleva ${parte}`);
  assert.match(pag, /const extraDeLaLista = useMemo\(\(\) => consultaLista\(estado, filtros\), \[estado, filtros\]\);/, 'la pestaña viaja como estados y los filtros extra con ella');
  const completa = /useListado<ItemLista>\(\{\s*ruta: '\/compras\/lista-compras', estado, esperar: !listo, activo: enKanban, extra: extraDelTablero,?\s*\}\);/.exec(pag);
  assert.ok(completa, 'el tablero pide su propia consulta, activa solo en Kanban');
  assert.match(pag, /const extraDelTablero = useMemo\(\(\) => consultaTableroLista\(estado, filtros\), \[estado, filtros\]\);/);
  assert.match(pag, /useResumenFlujo<DatosFlujo>\('\/compras\/flujo', recargaFlujo\)/);
  assert.match(pag, /apiFetch\('\/compras\/lista-compras\/stats', \{ signal: control\.signal \}\)/);
  // Nada se traga: ya no hay .catch que vacíe el error ni la carga de 200 en el navegador.
  assert.ok(!/\.catch\(\(\) => (\[\]|\{\}|null|\(\{[^)]*\}\))\)/.test(codigo) && !/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(codigo), 'sin .catch que traga el error');
  assert.ok(!/limit: '200'|new URLSearchParams/.test(codigo), 'ya no se pide limit=200 desde el navegador para la tabla');
  // Los filtros extra (TABLA-compras punto 10): el proveedor con 300 ms y las fechas; cada cambio vuelve a la página 1 y limpia la selección.
  const cambiar = /const cambiarFiltros = useCallback\(([\s\S]*?)\[despachar\]\);/.exec(pag)?.[1] ?? '';
  assert.match(cambiar, /setFiltros\(\(f\) => \(\{ \.\.\.f, \.\.\.cambio \}\)\);/);
  assert.match(cambiar, /setSeleccion\(\[\]\);/, 'limpia la selección');
  assert.match(cambiar, /despachar\(\{ tipo: 'pagina', valor: 1 \}\);/, 'vuelve a la página 1');
  assert.match(pag, /setTimeout\(\(\) => cambiarFiltros\(\{ proveedor: proveedorTexto\.trim\(\) \}\), 300\);/, 'el proveedor espera 300 ms (la búsqueda de la barra ya espera 300 ms)');
  assert.match(pag, /cambiarFiltros\(\{ desde: e\.target\.value \}\)/);
  assert.match(pag, /cambiarFiltros\(\{ hasta: e\.target\.value \}\)/);
  assert.match(pag, /filtros=\{\(\s*<>/, 'proveedor y fechas son filtros extra de BarraTabla');
  // La tabla estándar: pestañas del servidor, selección solo PENDIENTE y las columnas (R26: la casilla de 40 y las visibles caben en 704).
  assert.match(pag, /<TablaEstandar\s+id=\{ID_LISTA\}\s+modo="servidor"/);
  assert.match(pag, /seleccionable=\{esItemSeleccionable\}/, 'solo se seleccionan los PENDIENTE');
  assert.match(pag, /opcionesEstados=\{enKanban \? OPCIONES_ESTADOS_TABLERO_LISTA : opcionesEstadosLista\}/);
  for (const [id, etiqueta] of [['todos', 'Todos'], ['PENDIENTE', 'Pendiente'], ['EN_PEDIDO', 'En pedido'], ['RECIBIDO', 'Recibido']]) {
    assert.match(pag, new RegExp(`\\{ id: '${id}', etiqueta: '${etiqueta}', conteo: conteos\\?\\.${id} \\?\\? null`), `pestaña ${etiqueta}`);
  }
  const visibles = anchoVisible(pag, 'const COLUMNAS_TABLA_LISTA');
  assert.ok(visibles > 0 && visibles + 40 <= 734, `R26: las columnas visibles suman ${visibles} px más la casilla de 40 (caja de 734 a 1024 con el menú abierto)`);
  assert.equal((pag.match(/flexible: true/g) ?? []).length, 1, 'una sola columna flexible');
  assert.match(pag, /id: 'fecha'[^\n]*ocultaPorDefecto: true/, 'Fecha va oculta por defecto');
  assert.match(pag, /aria-label=\{`Acciones de \$\{it\.producto\}`\}|etiqueta=\{`Acciones de \$\{it\.producto\}`\}/, 'las acciones llevan el producto en su nombre');
  // El tablero solo para ver (KANBAN-logistica punto 5): modo cliente, soloLectura con su motivo, sin regla ni onCambio.
  const tablero = /useTableroKanban<ItemLista>\(\{([\s\S]*?)\n {2}\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/pantalla: ID_LISTA/, /modo: 'cliente'/, /columnas: COLUMNAS_LISTA/, /activo: listo && enKanban\b/, /porColumna: estado\.tamano/, /items: itemsTablero/, /columnaDe: columnaDeItem/]) {
    assert.match(tablero, parte, `useTableroKanban lleva ${parte}`);
  }
  const tab = /<TableroKanban([\s\S]*?)\/>/.exec(pag)?.[1] ?? '';
  assert.match(pag, /const TEXTO_SOLO_VER = 'Este tablero es para ver: pasa a En pedido al crear el pedido de compra y a Recibido con la recepción\.';/);
  assert.match(tab, /soloLectura=\{TEXTO_SOLO_VER\}/);
  assert.match(tab, /tarjetaDe=\{tarjetaItemLista\}/);
  assert.match(tab, /onAbrir=\{abrirItem\}/, 'el clic abre el PEC o el PVEN');
  assert.ok(!/regla=|onCambio=|onAccion=/.test(tab), 'sin regla: no se arrastra');
  assert.match(pag, /const destino = destinoItemLista\(it\);\s*if \(destino\) router\.push\(destino\);/);
  // El aviso de los 200 (RP95): el tope es el de la consulta, el aviso sale solo si el total lo pasa y el error del tablero se dice con Reintentar.
  assert.match(pag, /avisoTope200\(completa\.total, 'ítems'\)/, 'el aviso de los 200 sale de la frase única');
  assert.match(pag, /completa\.error != null && completa\.filas\.length === 0\) \? null : completa\.filas/, 'con error y sin datos, el tablero no pinta el vacío');
  assert.match(pag, /onClick=\{completa\.recargar\}[^>]*>Reintentar/);
  // Las tarjetas (KPI-compras punto 9): las 4 de /lista-compras/stats, cada una abre su pestaña.
  for (const [kpi, vista] of [['lista_pendientes', 'PENDIENTE'], ['lista_en_pedido', 'EN_PEDIDO'], ['lista_recibidos', 'RECIBIDO'], ['lista_total', 'todos']]) {
    assert.match(pag, new RegExp(`<TarjetaKpi kpi="${kpi}"[^>]*\\n?[^>]*activo=\\{vistaActiva === '${vista}'\\} onClick=\\{\\(\\) => elegirVista\\('${vista}'\\)\\}`), kpi);
  }
  assert.match(pag, /tarjetasLista\(stats\?\.datos \?\? null\)/);
  assert.match(pag, /despachar\(accionVistaEnLista\(estado, siguiente, opcionesEstadosLista\)\)/, 'como un clic en la pestaña (D41)');
  // La franja (FLUJO-compras punto 10): «Estás aquí» en Lista de compras, sin semáforo ni «No resueltos».
  assert.match(pag, /pasos=\{pasosPantallaCompras\(flujo\.datos, 'LISTA'\)\}/);
  assert.ok(!/semaforo=\{|noResueltos/.test(pag), 'la Lista no tiene semáforo ni «No resueltos»');
  // R2 y R13: fuera la IA simulada y su pestaña; queda «Ver análisis» hacia el Hub.
  assert.ok(!/aiChat|aiAnalysis|aiLoading|aiInput|sendAIChat|handleAIAnalysis|Nebulae Analytics|activeTab|'Analisis'|Generar Análisis/.test(codigo), 'sin la IA simulada ni la pestaña Análisis');
  assert.ok(!/ai-chat/.test(pag));
  assert.match(pag, /<Link href=\{ENLACE_VER_ANALISIS_COMPRAS\}[\s\S]*?Ver análisis<\/ContenidoEnlace>/);
  // Nada nativo (RP30) y lo conservado de B1 a B3.
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(codigo.replace(/\bconfirmar\(/g, 'x(')), 'sin diálogos nativos');
  assert.match(pag, /await confirmar\(\{ titulo: 'Eliminar ítem'/, 'eliminar pide confirmación con useAvisos');
  for (const texto of ["method: 'PATCH', body: JSON.stringify({ estado: 'RECIBIDO' })", "method: 'DELETE'", "estado: 'EN_PEDIDO', pec_id: pecObj.id, pec_numero: pecObj.numero", "apiFetch('/compras/pedidos', {",
    "/compras/proveedores/search?q=", '`Desde Lista de Compras - ', 'Crear Pedido de Compra con seleccionados']) {
    assert.ok(pag.includes(texto), `se conserva: ${texto}`);
  }
  assert.match(pag, /catch \(err\) \{ sinVincular\.push\(/, 'el vínculo ítem a ítem ya no se traga el error');
  assert.match(pag, /avisarError\(err, fallo\);\s*\/\/[^\n]*\n\s*if \(recargarTrasError\(err\)\) recargarTodo\(\);/, 'un cambio que falla se dice y, con la regla única (400, 409 o sin respuesta), se recarga lo que se ve');
  assert.match(pag, /avisarError\(err, 'No se pudo crear el pedido de compra'\);\s*if \(recargarTrasError\(err\)\) recargarTodo\(\);/);
}

console.log('--- TEST 40 (B4 T16B): Traslados (compras/traslados/page.tsx) y columnas-traslado.tsx cablean las piezas, la tabla, el tablero solo para ver y el servidor ---');
{
  const col = readFileSync(new URL('../src/app/dashboard/compras/columnas-traslado.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const pag = readFileSync(new URL('../src/app/dashboard/compras/traslados/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = pag.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  assert.ok(!/@ts-nocheck/.test(pag), 'la página se tipa');
  // columnas-traslado.tsx (T19 la importa): no es una ruta, no depende de ninguna page.tsx y exporta lo que las pantallas arman.
  assert.ok(!/export default/.test(col) && !/from '\.{1,2}\/[^']*page'/.test(col), 'no es una ruta ni importa una page');
  for (const nombre of ['columnasTraslado', 'titulosDeOrdenTraslado', 'CeldaEstadoTraslado', 'CeldaBodega', 'BodegasTraslado']) {
    assert.match(col, new RegExp(`export (?:function|const) ${nombre}\\b`), `exporta ${nombre}`);
  }
  assert.match(col, /export function columnasTraslado<T extends FilaColumnasTraslado>\(celdaAcciones: \(t: T\) => ReactNode\)/, 'la celda de Acciones es de cada pantalla');
  for (const [id, titulo] of [['numero', 'Traslado #'], ['origen', 'Origen'], ['destino', 'Destino'], ['productos', 'Productos'], ['fecha', 'Fecha'], ['estado', 'Estado'], ['acciones', 'Acciones']]) {
    assert.match(col, new RegExp(`\\{ id: '${id}', titulo: '${titulo}'`), `columna ${titulo}`);
  }
  assert.match(col, /id: 'numero'[^\n]*clave: true, fija: 'izquierda'/);
  assert.match(col, /id: 'origen'[^\n]*flexible: true/, 'una sola flexible: el origen');
  assert.equal((col.match(/flexible: true/g) ?? []).length, 1);
  assert.match(col, /id: 'acciones'[^\n]*fija: 'derecha'/);
  assert.ok(!/ocultaPorDefecto/.test(col), 'las 7 columnas caben a 1024 px: ninguna va oculta');
  const visibles = anchoVisible(col, 'export function columnasTraslado');
  assert.ok(visibles > 0 && visibles <= 734, `R26: las columnas visibles suman ${visibles} px (caja de 734 a 1024 con el menú abierto, sin casilla de selección)`);
  // Las celdas de bodega leen el contexto (las columnas son una constante y no pueden depender de las bodegas, que llegan después).
  assert.match(col, /nombreBodega\(useContext\(BodegasTraslado\), id\)/);
  // La fecha es la REAL (el instante `fecha` de T13), no un created_at que la operación nunca tuvo.
  assert.match(col, /textoFechaTraslado\(t\)/);
  assert.ok(!/created_at/.test(col + codigo), 'la operación no tiene created_at: la fecha es `fecha`');

  // Carga del servidor (R5, C3, C4, D39, D40).
  assert.match(pag, /const ID_TRASLADOS = 'compras\.traslados';/);
  assert.match(pag, /const INICIAL_TRASLADOS = \{ vista: 'en_proceso' \};/, 'la pestaña de trabajo sigue siendo En proceso');
  assert.match(pag, /useEstadoTabla\(ID_TRASLADOS, INICIAL_TRASLADOS\)/);
  const tabla = /useListado<FilaTraslado>\(\{\s*ruta: RUTA_OPERACIONES, estado, conConteos: true([^}]*)\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/esperar: !listo/, /\bdespachar\b/, /activo: !enKanban/, /extra: extraDeLaLista/]) assert.match(tabla, parte, `la tabla lleva ${parte}`);
  assert.match(pag, /const extraDeLaLista = useMemo\(\(\) => consultaTraslados\(estado\), \[estado\]\);/, 'la pestaña viaja como status y solo traslados');
  assert.match(pag, /useListado<FilaTraslado>\(\{\s*ruta: RUTA_OPERACIONES, estado, esperar: !listo, activo: enKanban, extra: extraDelTablero,?\s*\}\);/, 'el tablero pide su propia consulta, activa solo en Kanban');
  assert.match(pag, /const extraDelTablero = useMemo\(\(\) => consultaTableroTraslados\(estado\), \[estado\]\);/);
  assert.match(pag, /const RUTA_OPERACIONES = '\/inventory\/operations';/);
  assert.match(pag, /`\$\{RUTA_OPERACIONES\}\?operation_type=TRANSFER&limit=0&con_conteos=1`/, 'las tarjetas cuentan TODOS los traslados: sin búsqueda ni filtros, sin filas');
  assert.ok(!/limit=100/.test(codigo), 'ya no se cargan 100 y se pagina en el navegador');
  assert.ok(!/\.catch\(\(\) => (\[\]|\{\}|null)\)/.test(codigo) && !/\.catch\(\(\)\s*=>\s*\{\s*\}\)/.test(codigo) && !/catch \{ setTraslados/.test(codigo), 'sin .catch que traga el error');
  // Las bodegas: su error se dice con Reintentar (los nombres salen como «Bodega #N»), no se traga en silencio.
  assert.match(pag, /apiFetch\('\/inventory\/warehouses', \{ signal: control\.signal \}\)/);
  assert.match(pag, /errorBodegas != null && \(/);
  assert.match(pag, /Los nombres salen como «Bodega #N»\./);
  assert.match(pag, /<BodegasTraslado\.Provider value=\{bodegas\}>/);
  // La tabla: estándar en el servidor, toda la fila abre el Drawer; las pestañas de los grupos de operación (R9) con los conteos del servidor.
  assert.match(pag, /<TablaEstandar\s+id=\{ID_TRASLADOS\}\s+modo="servidor"/);
  assert.match(pag, /onFila=\{abrir\}/, 'toda la fila abre el Drawer');
  for (const [id, etiqueta, campo] of [['en_proceso', 'En proceso', 'en_proceso'], ['completadas', 'Completados', 'completadas'], ['canceladas', 'Cancelados', 'canceladas'], ['todos', 'Todos', 'todos']]) {
    assert.match(pag, new RegExp(`\\{ id: '${id}', etiqueta: '${etiqueta}', conteo: c\\.${campo} \\}`), `pestaña ${etiqueta}`);
  }
  assert.match(pag, /const c = conteosTraslado\(conteos\);/);
  assert.match(pag, /opcionesEstados=\{enKanban \? OPCIONES_ESTADOS_TABLERO_TRASLADO : opcionesEstadosTraslado\}/);
  // «Ver detalle» y el ⋯ ya hacen algo: un MenuFila con «Ver detalle», que abre el Drawer.
  assert.match(pag, /\{ etiqueta: 'Ver detalle', icono: Eye, onClick: \(\) => acciones\?\.abrir\(t\) \}/);
  assert.match(pag, /<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{numeroTraslado\(t\)\}`\} \/>/);
  assert.ok(!/MoreVertical|Ver Detalle/.test(codigo), 'sin el botón «Ver Detalle» ni el ⋮ que no tenían onClick');
  // El tablero solo para ver (KANBAN-logistica punto 5): modo cliente, soloLectura con su motivo, sin regla ni onCambio.
  const tablero = /useTableroKanban<FilaTraslado>\(\{([\s\S]*?)\n {2}\}\);/.exec(pag)?.[1] ?? '';
  for (const parte of [/pantalla: ID_TRASLADOS/, /modo: 'cliente'/, /columnas: COLUMNAS_TRASLADO/, /activo: listo && enKanban\b/, /porColumna: estado\.tamano/, /items: itemsTablero/, /columnaDe: columnaDeTraslado/]) {
    assert.match(tablero, parte, `useTableroKanban lleva ${parte}`);
  }
  const tab = /<TableroKanban([\s\S]*?)\/>/.exec(pag)?.[1] ?? '';
  assert.match(pag, /const TEXTO_SOLO_VER = 'Este tablero es para ver: los traslados no cambian de estado desde aquí\.';/);
  assert.match(tab, /soloLectura=\{TEXTO_SOLO_VER\}/);
  assert.match(tab, /tarjetaDe=\{tarjetaDe\}/);
  assert.match(tab, /onAbrir=\{abrir\}/, 'el clic abre el Drawer, como la fila');
  assert.ok(!/regla=|onCambio=|onAccion=/.test(tab), 'sin regla: no se arrastra');
  assert.match(pag, /tarjetaTraslado\(t, bodegas\)/);
  // El aviso de los 200 (RP95) y el error del tablero con Reintentar.
  assert.match(pag, /avisoTope200\(completa\.total, 'traslados'\)/, 'el aviso de los 200 sale de la frase única');
  assert.match(pag, /completa\.error != null && completa\.filas\.length === 0\) \? null : completa\.filas/, 'con error y sin datos, el tablero no pinta el vacío');
  assert.match(pag, /onClick=\{completa\.recargar\}[^>]*>Reintentar/);
  // Las tarjetas (KPI-compras punto 10): tras_* y bodegas, con los conteos de todos los traslados.
  for (const [kpi, vista] of [['tras_en_proceso', 'en_proceso'], ['tras_completados', 'completadas'], ['tras_total', 'todos']]) {
    assert.match(pag, new RegExp(`<TarjetaKpi kpi="${kpi}"[^>]*\\n?[^>]*activo=\\{vistaActiva === '${vista}'\\} onClick=\\{\\(\\) => elegirVista\\('${vista}'\\)\\}`), kpi);
  }
  assert.match(pag, /<TarjetaKpi kpi="bodegas" valor=\{tarjetas\.bodegas\.valor\} estado=\{estadoBodegas\} \/>/, 'Bodegas es informativa y toma su propio estado');
  assert.match(pag, /tarjetasTraslados\(conteosTraslado\(totales\?\.conteos \?\? null\), bodegas \? bodegas\.length : null\)/);
  assert.match(pag, /despachar\(accionVistaEnLista\(estado, siguiente, opcionesEstadosTraslado\)\)/, 'como un clic en la pestaña (D41)');
  // El enlace ?id= del HUB de Inventario: el traslado se pide al servidor por su número.
  assert.match(pag, /q=\$\{encodeURIComponent\(numeroTraslado\(\{ id \}\)\)\}&limit=5`/, 'el traslado se pide por su número, con a lo sumo 5 filas');
  assert.match(pag, /llegadaEnlaceTraslado\(id, normalizarRespuesta\(r\)\.filas\)/, 'abre solo la fila cuyo número es exacto (m13)');
  assert.match(pag, /if \(searchParams\.get\('id'\)\) router\.replace\(pathname\)/, 'al cerrar el Drawer se quita ?id=');
  // R2 y R13: fuera la IA simulada y su pestaña; queda «Ver análisis» hacia el Hub.
  assert.ok(!/aiChat|aiAnalysis|aiLoading|aiInput|sendAIChat|handleAIAnalysis|Nebulae Analytics|activeTab|'Analisis'|Generar Análisis/.test(codigo), 'sin la IA simulada ni la pestaña Análisis');
  assert.ok(!/ai-chat/.test(pag));
  assert.match(pag, /<Link href=\{ENLACE_VER_ANALISIS_COMPRAS\}[\s\S]*?Ver análisis<\/ContenidoEnlace>/);
  // Nada nativo (RP30) y lo conservado de B1 a B3: crear un traslado con sus avisos.
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(codigo.replace(/\bconfirmar\(/g, 'x(')), 'sin diálogos nativos');
  assert.match(pag, /avisar\('Selecciona bodega origen y destino', \{ tono: 'error' \}\)/);
  assert.match(pag, /avisar\('Agrega al menos un producto', \{ tono: 'error' \}\)/);
  assert.match(pag, /avisarError\(err, 'No se pudo crear el traslado'\);\s*\/\/[^\n]*\n\s*if \(recargarTrasError\(err\)\) recargarTodo\(\);/, 'si crear falla se dice y, con la regla única, se recarga');
  for (const texto of ["operation_type: 'TRANSFER'", 'source_warehouse_id: parseInt(form.origen_id, 10)', 'dest_warehouse_id: parseInt(form.destino_id, 10)',
    "movements: form.productos.map((p) => ({ sku_id: p.sku_id, quantity: Number(p.qty) }))", "'/crm/products/search?q='", 'Nuevo Traslado']) {
    assert.ok(pag.includes(texto), `se conserva: ${texto}`);
  }
}

console.log('--- TEST 41 (B4 T16B r1): fecha del ítem, aviso de los 200, enlace ?id= de Traslados, textos ---');
{
  // I1 a I4: el ítem de la Lista trae `fecha` (no fecha_creacion): una fila con `fecha` y sin `fecha_creacion` da su día.
  assert.equal(ec.tarjetaItemLista({ id: 1, producto: 'x', cantidad: 1, estado: 'PENDIENTE', fecha: '2026-11-05T15:00:00' }).tiempo, '5 nov 2026');
  assert.equal(ec.tarjetaItemLista({ id: 1, producto: 'x', cantidad: 1, estado: 'PENDIENTE', fecha_creacion: '2026-11-05T15:00:00' }).tiempo, null, 'fecha_creacion no existe');

  // m5: UNA frase para el tope de 200 del tablero en modo cliente.
  assert.equal(ec.avisoTope200(230, 'ítems'), 'Se muestran los 200 más recientes de 230 ítems. Busca o filtra para ver el resto.');
  assert.equal(ec.avisoTope200(1234, 'pedidos'), 'Se muestran los 200 más recientes de 1.234 pedidos. Busca o filtra para ver el resto.');
  assert.equal(ec.avisoTope200(200, 'traslados'), null, 'con 200 no hay aviso');
  assert.equal(ec.avisoTope200(null, 'traslados'), null);
  assert.equal(ec.avisoTope200('x', 'traslados'), null);

  // m11: «1 producto», «2 productos».
  assert.equal(ec.textoProductos(1), '1 producto');
  assert.equal(ec.textoProductos(2), '2 productos');
  assert.equal(ec.textoProductos(0), '0 productos');

  // I3, I5, m10, m13: el enlace ?id=. Se abre solo la fila cuyo número es EXACTAMENTE el pedido.
  assert.equal(ec.filaDelEnlaceTraslado([{ id: 123 }, { id: 12 }], 12)?.id, 12);
  assert.equal(ec.filaDelEnlaceTraslado([{ id: 123 }], 12), null, 'TRL-0012 no es TRL-0123');
  assert.equal(ec.filaDelEnlaceTraslado([{ id: 12345 }], 1234), null, 'TRL-1234 no es TRL-12345');
  assert.equal(ec.filaDelEnlaceTraslado(null, 12), null);
  // Pedir: un id válido que todavía no se atendió; abortado (la marca sigue null) → vuelve a pedir; ya atendido → no repite.
  assert.equal(ec.pedirEnlaceTraslado(null, '63'), 63);
  assert.equal(ec.pedirEnlaceTraslado(null, null), null);
  for (const malo of ['x', '0', '-3', '1.5', '']) assert.equal(ec.pedirEnlaceTraslado(null, malo), null, malo);
  assert.equal(ec.pedirEnlaceTraslado('63', '63'), null, 'llegó: no repite');
  assert.equal(ec.pedirEnlaceTraslado('63', '64'), 64, 'otro id: pide');
  // Llegada: abre la exacta y marca; si no existe avisa UNA vez (la marca queda puesta, no repite).
  const a = ec.llegadaEnlaceTraslado(63, [{ id: 630 }, { id: 63 }]);
  assert.deepEqual([a.marca, a.abrir?.id, a.avisar], ['63', 63, false]);
  const b = ec.llegadaEnlaceTraslado(63, [{ id: 630 }]);
  assert.deepEqual([b.marca, b.abrir, b.avisar], ['63', null, true]);
  assert.equal(ec.pedirEnlaceTraslado(b.marca, '63'), null, 'no existe: ya avisó, no vuelve a pedir ni a avisar');

  const pag = readFileSync(new URL('../src/app/dashboard/compras/traslados/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const lis = readFileSync(new URL('../src/app/dashboard/compras/lista-compras/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const tra = readFileSync(new URL('../src/app/dashboard/compras/transito/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const col = readFileSync(new URL('../src/app/dashboard/compras/columnas-traslado.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // El ref solo se marca cuando el traslado llegó (en la llegada), nunca antes del fetch.
  const efecto = /const idAbierto = useRef[^\n]*\n([\s\S]*?)\}, \[idDeLaUrl, avisar, avisarError\]\);/.exec(pag)?.[1] ?? '';
  assert.match(efecto, /pedirEnlaceTraslado\(idAbierto\.current, idDeLaUrl\)/);
  assert.match(efecto, /llegadaEnlaceTraslado\(id, normalizarRespuesta\(r\)\.filas/);
  assert.match(efecto, /\.then\(/);
  const antes = efecto.slice(0, efecto.indexOf('.then('));
  assert.ok(!/idAbierto\.current =/.test(antes), 'la marca no se pone antes del fetch');
  assert.match(efecto, /idAbierto\.current = llegada\.marca;/);
  // m5, m11, m12, m14, m6, m7, m2: fuente.
  for (const [nombre, f] of [['lista', lis], ['traslados', pag], ['tránsito', tra]]) {
    assert.match(f, /avisoTope200\(/, `${nombre} usa la frase única`);
    assert.ok(!/Se muestran los 200 más recientes de/.test(f), `${nombre} no la escribe a mano`);
  }
  assert.ok(!/por_proveedor|Pendientes por Proveedor/.test(lis), 'sin el bloque muerto «Pendientes por proveedor»');
  assert.ok(!/producto\(s\)/.test(col), 'm11: el title de Productos conjuga');
  assert.ok(!/Tracking<\/p>/.test(pag) && /Guía<\/p>/.test(pag), 'm11: «Guía», no «Tracking»');
  assert.match(pag, /claseFila=\{claseFila\}/);
  assert.match(pag, /selected\?\.id === t\.id \? TABLE\.filaInfo : null/, 'm14: la fila del Drawer abierto queda marcada (token opaco)');
  assert.match(lis, /aria-expanded=\{verFechas \|\| hayFechas\}/, 'm7');
  assert.match(lis, /const guardarProveedor = async \(\) => \{[\s\S]*?\n  \};/);
  const guardar = /const guardarProveedor = async \(\) => \{([\s\S]*?)\n  \};/.exec(lis)?.[1] ?? '';
  assert.ok(!/setEditando\(null\);\s*await cambiarItem/.test(guardar), 'm6: no se cierra antes de que el PATCH salga bien');
  assert.match(guardar, /if \(await cambiarItem\([\s\S]*'No se pudo actualizar el proveedor'\)\) setEditando\(null\);/, 'm6: se cierra solo si salió bien');
  assert.match(lis, /'pueden'/, 'm12: dice cuántos entran');
  assert.match(lis, /\(pedibles === elegidos\s*\?/, 'm12: solo calla cuando todos los elegidos se pueden pedir');
  assert.match(lis, /textoSeleccion\(seleccion\.length, itemsSeleccionados\.length\)/);
  assert.match(lis, /itemsSeleccionados\.length/, 'm12: la barra usa los seleccionables de verdad');
  assert.match(lis, /item\.fecha\b|it\.fecha\b/);
  assert.ok(!/fecha_creacion/.test(lis), 'I1: la Lista lee `fecha`');
}

console.log('\nOK: test_estados_compras.mjs');
