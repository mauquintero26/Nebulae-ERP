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
  // B4 T24 f3 r1 (F59 d): la función sale del árbol de TypeScript (createSourceFile), no de contar llaves: una llave dentro de una
  // cadena o de un comentario ya no la corta.
  const arbol = tsLib.createSourceFile('pagina.tsx', fuente, tsLib.ScriptTarget.Latest, true, tsLib.ScriptKind.TSX);
  let nodo = null;
  const buscar = (n) => {
    if (nodo) return;
    if (tsLib.isFunctionDeclaration(n) && n.name?.text === 'cancelarConMotivo') { nodo = n; return; }
    tsLib.forEachChild(n, buscar);
  };
  buscar(arbol);
  assert.ok(nodo, 'la página tiene cancelarConMotivo');
  const inicio = nodo.getStart(arbol);
  const fin = nodo.getEnd() - 1;
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
  // B4 T24 f3 (FINAL-m36, D27): el motivo depende de la etapa del PEC (desvío frente al brief de T2 en la parte de Recepciones, que
  // amarraba BORRADOR al enlace de Recepciones: su selector no lista borradores). Solo lo que ya va en camino manda a Recepciones.
  for (const destino of ['en_bodega', 'recibido']) {
    assert.deepEqual(regla('EN_TRANSITO', destino), { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: RECEPCIONES }, `EN_TRANSITO → ${destino}`);
    assert.deepEqual(regla('PENDIENTE_ENTREGA', destino), { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: RECEPCIONES });
    assert.deepEqual(regla('BORRADOR', destino), { tipo: 'bloqueado', motivo: 'Primero emítelo: arrástralo a Emitido.' }, `BORRADOR → ${destino}`);
    for (const e of ['EMITIDO', 'ENVIADO']) {
      assert.deepEqual(regla(e, destino), { tipo: 'bloqueado', motivo: 'Primero sigue el envío en Mercancía en tránsito.', enlace: TRANSITO }, `${e} → ${destino}`);
    }
  }
  assert.deepEqual(regla('BORRADOR', 'en_transito'), { tipo: 'bloqueado', motivo: 'Primero emítelo: arrástralo a Emitido.' }, 'BORRADOR → En tránsito');
  for (const e of ['RECIBIDO', 'PARCIALMENTE_RECIBIDA', 'RECIBIDA', 'COMPLETADO']) {
    for (const destino of ['en_transito', 'borrador']) {
      if (columnaPec(e) === destino) continue;
      assert.deepEqual(regla(e, destino), { tipo: 'bloqueado', motivo: 'Ya llegó a bodega: su estado lo lleva la recepción.' }, `${e} → ${destino}`);
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
  // B4 T24 f3 (FINAL-m36, D27): RECIBIDA ya llegó a bodega (su motivo, arriba); los emitidos y en tránsito no vuelven a Borrador.
  for (const e of ['EMITIDO', 'EN_TRANSITO']) {
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
  // B4 T24 (FINAL-m30, D27): diaPec es diaDeNegocio de fechas-colombia.js (la misma función): aquí no queda ninguna extracción del día.
  assert.equal((fuente.match(/\.slice\(0, 10\)/g) ?? []).length, 0, 'la extracción del día vive en fechas-colombia.js');
  assert.match(fuente, /import \{[^}]*\bdiaDeNegocio as diaPec\b[^}]*\} from '\.\/fechas-colombia\.js';/);
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
  // Todos mal con un 422: nada sale de la selección y ningún aviso de éxito. B4 T24 (F8, D27): un 422 también pide recargar (la lista y el
  // detalle; recargarTrasError lo cuenta sin mirar el detail); los PVEN no, porque no se canceló nada.
  const malos = [pecs[0], pecs[2]].map((p) => ({ id: p.id, numero: p.numero, ok: false, error: textoDeError(invalido), err: invalido }));
  const todosMal = ec.despuesDeCancelarPec([pecs[0], pecs[2]], malos, []);
  assert.deepEqual(todosMal.fuera, []);
  assert.deepEqual(todosMal.pendientes, [pecs[0], pecs[2]]);
  assert.deepEqual([todosMal.recargar, todosMal.recargarVentas, todosMal.recargarDetalle, todosMal.mensajeOk], [true, false, true, null]);
  // Un 500 sigue sin recargar (el dato no cambió).
  const errorServidor = Object.assign(new Error('boom'), { status: 500 });
  const con500 = ec.despuesDeCancelarPec([pecs[0]], [{ id: 1, numero: 'PEC-1', ok: false, error: 'boom', err: errorServidor }], []);
  assert.deepEqual([con500.recargar, con500.recargarDetalle], [false, false]);
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
  // B4 T24 f3 (F57, D27): con la vuelta de la carga ({vuelta, filas, error}); la protección (el catch guarda, el éxito limpia) sigue.
  assert.match(hub, /\.catch\(\(err: unknown\) => \{ if \(vigente\) setVentas\(\(v\) => \(\{ vuelta: vueltaVentas, filas: v\.filas, error: err \}\)\); \}\)/,
    'el catch de /ventas/pedidos guarda el error');
  assert.match(hub, /if \(vigente\) setVentas\(\{ vuelta: vueltaVentas, filas: Array\.isArray\(r\)[^\n]*, error: null \}\); \}\)/,
    'un éxito limpia el error');
  // T14 r1 (m11, m12, m13): foco de la barra masiva, nombres del panel, «Pago y logística» y el respaldo de F. compra.
  // B4 T24 (FINAL-m25, D27): el foco blanco común de design-system.ts (FOCOS.blanco: outline-white separado 2 px).
  assert.match(hub, /const FOCO_OSCURO = FOCOS\.blanco;/);
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
  // B4 T24 f3 (F64, D27): deletePec pasa a despuesDeEliminarPec (un 404 cierra el panel; la regla única, recarga): quedan saveInfo y changeEstado.
  assert.equal((pag.match(/onToast\(e,'error'\);\s*(?:\/\/[^\n]*\n\s*)?if \(recargarTrasError\(e\)\) \{ onUpdate\(\); loadFull\(\); \}/g) ?? []).length, 2,
    'saveInfo y changeEstado');
  assert.match(pag, /const despues = despuesDeEliminarPec\(e\);\s*if \(despues === 'cerrar'\) \{ onUpdate\(\); onClose\(\); \}\s*else if \(despues === 'recargar'\) \{ onUpdate\(\); loadFull\(\); \}/,
    'deletePec');
  // B4 T24 f3 r1 (F59 b, D27): el catch vacío con o sin parámetro (`catch (e) {}` también).
  assert.ok(!/catch\s*(?:\([^)]*\))?\s*\{\s*\}|catch\s*(?:\([^)]*\))?\s*\{ setProdSearchResults\(\[\]\); \}/.test(pag), 'ningún error mudo');
  assert.equal((pag.match(/avisarError\(err, 'No se pudo buscar el (?:casillero|proveedor|producto)'\)/g) ?? []).length, 4, 'las cuatro búsquedas');
  // El menú de fila (MenuFila) ofrece solo lo que acepta update_pec (R9, C15c): Emitir desde Borrador y cancelar con motivo.
  // B4 T24 (FINAL-m10, D27): además, solo con el rol que hace el PATCH y el DELETE (accesoPec.cambiarPec; r1, m35: la celda lo recibe por el contexto como cambiarPec).
  assert.match(pag, /etiqueta: 'Marcar Emitido'[\s\S]{0,300}oculto: !cambiarPec \|\| !transicionesPec\(p\.estado\)\.includes\('EMITIDO'\)/);
  assert.match(pag, /etiqueta: 'Cancelar PEC'[\s\S]{0,200}oculto: !cambiarPec \|\| !transicionesPec\(p\.estado\)\.includes\('CANCELADO'\)/);
  assert.match(pag, /etiqueta: 'Eliminar definitivamente'[\s\S]{0,200}oculto: !cambiarPec \|\| etapaPec\(p\.estado\) !== 'cancelado'/);
  assert.match(pag, /<MenuFila items=\{items\} etiqueta=\{`Acciones de \$\{p\.numero\}`\} \/>/);
  // El tablero (KANBAN-compras punto 6): las reglas de R9, la tarjeta con «Recepcionar» y D39.
  assert.match(pag, /regla=\{reglaSoltarPec\}/);
  // B4 T24 f3 r1 (m20, D27): la tarjeta con {recepcionar} del rol (tarjetaDePec); lo fija el bloque de r1.
  assert.match(pag, /tarjetaDe=\{tarjetaDePec\}/);
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
  // B4 T24 (FINAL-m10, D27): sin el rol del PATCH, ninguna transición a mano.
  assert.match(pag, /const transiciones = accesoPec\.cambiarPec \? transicionesPec\(detail\?\.estado\) : \[\];/);
  // «Eliminar definitivamente» con confirmar de useAvisos (RP30), en el panel y en el menú.
  assert.equal((pag.match(/await confirmar\(\{/g) ?? []).length >= 3, true, 'el panel, el menú de fila y el casillero');
  // Las tarjetas (KPI-compras punto 6; R12, RP92): las cuatro de /compras/stats, pulsables como sus vistas.
  for (const kpi of ['pec_activos', 'pec_en_transito', 'pec_vencidos', 'pec_monto']) assert.match(pag, new RegExp(`kpi="${kpi}"`));
  // B4 T24 f3 (F45, D27): los datos de useResumen (stats.datos; null mientras carga la primera vez o con error).
  assert.match(pag, /const tarjetas = tarjetasPedidosCompra\(stats\.datos\);/);
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
  // B4 T24 f3 r1 (F59 c, D27): la llamada, no la línea exacta.
  assert.match(pag, /const cerrado = seguimientoCerrado\(\s*pec\.estado\s*\)/);
  assert.match(pag, /\{cerrado \? \([\s\S]{0,200}\{TEXTO_SEGUIMIENTO_CERRADO\}[\s\S]{0,120}\) : \([\s\S]{0,120}<PasosFlujo variante="barra" pasos=\{pasosDeTracking\(stages\)\}/);
  // B4 T24 r1 (m2, D27): y solo con el rol del PATCH /tracking (puedeEditar).
  {
    const editando = /const isEditing = ([^;\n]+);/.exec(pag)?.[1] ?? '';
    for (const parte of [/!cerrado\b/, /\bpuedeEditar\b/, /editStage === sd\.stage/]) assert.match(editando, parte, `isEditing lleva ${parte}`);
  }
  assert.match(pag, /\{!cerrado && puedeEditar && \(\s*<button onClick=\{\(\)=>openEdit\(sd\)\}/, 'sin editar las etapas de un cancelado');
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
  // B4 T24 f3 (F72, D27): el tope es TOPE_TABLERO_COMPRAS (el del aviso), sin una constante local repetida.
  assert.ok(!/const TOPE_TABLERO = 200;/.test(pag), 'sin la constante local');
  assert.match(pag, /const EXTRA_TABLERO = \{ orden: 'reciente', limit: TOPE_TABLERO_COMPRAS, offset: 0 \};/, 'C4: hasta 200 pedidos, de la primera página');
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
  // Y1, Y2 y Y3 (r3). B4 T24 f3 r1 (F66, D27): la foto de la lista activa la toma soltarPendientes en el primer render que la ve; sobran
  // el ref filasAhora y su useLayoutEffect.
  assert.ok(!/filasAhora|useLayoutEffect\(/.test(pag.replace(/\/\/[^\n]*/g, '')), 'sin el ref de la foto ni su useLayoutEffect');
  assert.match(pag, /const terminarCambio = useCallback\(\(id: number\) => setEnCurso\(\(l\) => terminarPendiente\(l, id\)\), \[\]\);/, 'Y1: terminarCambio deja la foto sin tomar (transito.js)');
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
  // B4 T24 f3 (F45, D27): los datos de useResumen (stats.datos; null mientras carga la primera vez o con error).
  assert.match(pag, /tarjetasTransito\(stats\.datos, avance\)/);
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
  // B4 T24 f3 r1 (F65, D27): el «Reintentar» del tracking-config atado a su onClick (antes pasaba con cualquier aparición).
  assert.match(pag, /<button type="button" onClick=\{\(\) => setVueltaConfig\(\(n\) => n \+ 1\)\}[^>]*>Reintentar<\/button>/, 'si falla tracking-config, el tablero ofrece Reintentar');
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
  for (const parte of [/ruta: '\/compras\/recepciones'/, /(?:^|[,{]\s*)estado\s*,/, /conConteos: true/, /esperar: !listo/, /\bdespachar\b/, /extra: enKanban \? EXTRA_TABLERO_RECEPCION : null/]) {
    assert.match(llamada, parte, `useListado lleva ${parte}`);
  }
  // B4 T24 f3 r1 (F77, D27): el extra del tablero es el de la lib (EXTRA_TABLERO_RECEPCION, el mismo de Inventario).
  assert.deepEqual({ ...ec.EXTRA_TABLERO_RECEPCION }, { limit: 0 }, 'en Kanban la lista va sin filas (D39)');
  assert.ok(!/const EXTRA_TABLERO = /.test(pag), 'sin la copia local');
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
  // B4 T24 f3 (FINAL-C4-f, D27): la tarjeta sale de tarjetaRecepcion con `contar` del rol (tarjetaDeRecepcion; el bloque de C4-f la fija).
  assert.match(tab, /tarjetaDe=\{tarjetaDeRecepcion\}/);
  assert.match(tab, /onAbrir=\{abrir\}/, 'el clic abre el Drawer, como la fila');
  assert.ok(!/regla=|onCambio=|onAccion=/.test(tab), 'sin regla: no se arrastra');
  // La tabla (R26, D41): estándar en el servidor; toda la fila abre el Drawer; las vistas reales de RP41 y D6.
  assert.match(pag, /<TablaEstandar\s+id=\{ID_RECEPCIONES\}\s+modo="servidor"/);
  assert.match(pag, /onFila=\{abrir\}/, 'toda la fila abre el Drawer');
  // B4 T24 f3 r1 (F77, D27): las pestañas son pestanasRecepcion de la lib (las de Inventario): se comprueban ahí, con conteos.
  assert.deepEqual(ec.pestanasRecepcion({ por_confirmar: 2, confirmadas: 5, canceladas: 0, todas: 7 }).map((p) => [p.id, p.etiqueta, p.conteo]),
    [['por_confirmar', 'Por confirmar', 2], ['confirmadas', 'Confirmadas', 5], ['canceladas', 'Canceladas', 0], ['todas', 'Todas', 7]], 'las pestañas');
  assert.deepEqual(ec.pestanasRecepcion(null).map((p) => p.conteo), [null, null, null, null], 'mientras cargan, la barra gris (nunca 0)');
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
  // r2 (m1, D27): el ítem «Confirmar» del menú sale de itemConfirmarMenu (oculto si no está por confirmar; casos en test_roles).
  assert.match(pag, /oculto: menu\.oculto,/, 'Confirmar solo en una recepción por confirmar (BORRADOR), no en logísticas ni canceladas');
  assert.match(pag, /avisarError\(err, `No se pudo confirmar \$\{numeroRecepcion\(r\)\}`\);\s*if \(recargarTrasError\(err\)\) recargarTodo\(\);/, 'un error se dice y, con la regla única, se recarga');
  // El Drawer conserva «Confirmar Entrada Física y Actualizar Stock» y suma «Abrir conteo».
  assert.match(pag, /Confirmar Entrada Física y Actualizar Stock/);
  assert.match(pag, /<ClipboardList size=\{14\} aria-hidden="true" \/> Abrir conteo/);
  // Las tarjetas (KPI-compras punto 8) y la nota; la franja (FLUJO-compras punto 9) sin semáforo.
  for (const kpi of ['rec_por_confirmar', 'rec_confirmadas', 'pec_en_transito']) assert.match(pag, new RegExp(`<TarjetaKpi kpi="${kpi}"`), kpi);
  assert.match(pag, /<FranjaKpis estado=\{estadoKpis\} titulo="Recepciones" idFoco="franja-recepciones-compras" nota=\{NOTA_RECEPCIONES\}>/); // f4 (D27: idFoco)
  // B4 T24 f3 (F45, D27): los datos de useResumen (stats.datos; null mientras carga la primera vez o con error).
  assert.match(pag, /tarjetasRecepciones\(stats\.datos\)/);
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

console.log('--- TEST 33-b (B4 T24 r1, m15): la recarga silenciosa del conteo de una recepción no pisa lo escrito ---');
{
  const { recargaReponeLineas } = await import('../src/lib/estados-compras.js');
  // La carga completa (al abrir) siempre llena las líneas; la silenciosa, solo si ya no está por confirmar (otro la confirmó o la canceló).
  assert.equal(recargaReponeLineas({ silencioso: false, recepcion: { estado: 'BORRADOR' } }), true, 'al abrir');
  assert.equal(recargaReponeLineas({ recepcion: { estado: 'BORRADOR' } }), true, 'por defecto, completa');
  assert.equal(recargaReponeLineas({ silencioso: true, recepcion: { estado: 'BORRADOR' } }), false, 'en BORRADOR, lo escrito queda');
  assert.equal(recargaReponeLineas({ silencioso: true, recepcion: { estado: ' BORRADOR ' } }), false);
  for (const estado of ['CONFIRMADA', 'CONFIRMADA_CON_DIFERENCIAS', 'CANCELADA']) {
    assert.equal(recargaReponeLineas({ silencioso: true, recepcion: { estado } }), true, `${estado}: cambió en otro lado`);
  }
  assert.equal(recargaReponeLineas({ silencioso: true, recepcion: null }), true, 'sin datos: lo del servidor');
  const cont = readFileSync(new URL('../src/app/dashboard/compras/recepciones/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(cont, /const loadRecepcion = useCallback\(async \(\{ silencioso = false \}: \{ silencioso\?: boolean \} = \{\}\) => \{/);
  assert.match(cont, /if \(!silencioso\) \{ setLoading\(true\); setLoadError\(''\); \}/, 'la silenciosa no muestra el spinner');
  assert.match(cont, /if \(recargaReponeLineas\(\{ silencioso, recepcion: d \}\)\) \{\s*setItems\(/);
  assert.match(cont, /if \(!silencioso\) setLoadError\(err\.message \|\| 'No se pudo cargar la recepción'\);\s*else avisarError\(err, 'No se pudo recargar la recepción'\);/);
  assert.match(cont, /if \(!silencioso\) setLoading\(false\);\s*\}, \[params\.id, avisarError\]\);/);
  // Guardar el conteo (lo primero que hace validar) también recarga en silencio: el spinner vaciaba las observaciones antes de validar.
  // B4 T24 f3 (FINAL-C4-f, D27): el guardado es el PATCH por línea (o el lote, en una heredada); la recarga silenciosa va después de los dos.
  // B4 T24 f3 r1 (m22, D27): la serie del PATCH por línea vive en la lib (guardarConteoEnSerie, ejecutada en el bloque de r1).
  assert.match(cont, /const serie = await guardarConteoEnSerie\(peticiones,[\s\S]*?\n\s*await loadRecepcion\(\{ silencioso: true \}\);\s*return true;/);
}

console.log('--- TEST 33 (B4 T16A, TABLA-compras punto 12; RP30): el conteo de una recepción (recepciones/[id]/page.tsx) en modo simple y sin diálogos nativos ---');
{
  const cont = readFileSync(new URL('../src/app/dashboard/compras/recepciones/[id]/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = cont.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/^\s*\/\/.*$/gm, '');
  // Los 3 diálogos nativos de B1 a B3 (bodega, guardar el conteo y validar) pasaron a useAvisos con el mismo texto.
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(codigo), 'sin diálogos nativos');
  // B4 T24 f3 (FINAL-C4-f, D27): también `avisar`, para el aviso de la lib (una cantidad que no es un entero ≥ 0) antes de mandar.
  assert.match(cont, /const \{ avisar, avisarError \} = useAvisos\(\);/);
  for (const texto of ['Error al asignar la bodega', 'Error al guardar el conteo', 'Error al validar la recepción']) {
    assert.match(cont, new RegExp(`avisarError\\(err, '${texto}'\\)`), texto);
  }
  assert.match(cont, /avisarError\(err, 'No se pudieron cargar las bodegas'\)/, 'la lista de bodegas ya no se traga el error');
  assert.ok(!/\.catch\(\(\) => \{\}\)/.test(cont) && !/\.catch\(\(\) => (\[\]|null)\)/.test(cont), 'ningún error se traga');
  // r1 (m15): validar con un error que pide recargar (también un 422, F8) recarga EN SILENCIO: sin el spinner de página (que desmonta el
  // conteo y vacía las «Observaciones Físicas») y sin volver a llenar las líneas mientras siga en BORRADOR (recargaReponeLineas).
  assert.match(cont, /if \(recargarTrasError\(err\)\) await loadRecepcion\(\{ silencioso: true \}\);/, 'validar: un 409 o un 422 recarga en silencio');
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
  // B4 T24 f3 (FINAL-C4-f, D27): la cantidad se lee con la lib, sin truncar (antes parseInt); la lib la valida antes de mandar.
  assert.match(cont, /onChange=\{\(e\) => control\?\.actualizar\(l\.idx, leerCantidadConteo\(e\.target\.value\)\)\}/, 'y escribe en la línea de esa fila');
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
  // B4 T24 f3 (F45, D27): /compras/lista-compras/stats con el cargador compartido (useResumen).
  assert.match(pag, /const stats = useResumen\('\/compras\/lista-compras\/stats', vueltaStats\);/);
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
  // B4 T24 f3 (F45, D27): los datos de useResumen (stats.datos; null mientras carga la primera vez o con error).
  assert.match(pag, /tarjetasLista\(stats\.datos\)/);
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
  assert.match(col, /export function columnasTraslado<T extends FilaColumnasTraslado>\(celdaAcciones: \(t: T\) => ReactNode, anchoAcciones = 80\)/, 'la celda de Acciones es de cada pantalla (T19 r1: y su ancho, 80 por defecto)');
  assert.match(col, /id: 'acciones', titulo: 'Acciones', ancho: anchoAcciones,/, 'el ancho de Acciones es el parametro');
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
  // B4 T24 f3 r1 (F77, D27): la ruta es RUTA_CONTEOS_TRASLADOS de la lib (la misma de Inventario).
  assert.equal(ec.RUTA_CONTEOS_TRASLADOS, '/inventory/operations?operation_type=TRANSFER&limit=0&con_conteos=1', 'las tarjetas cuentan TODOS los traslados: sin búsqueda ni filtros, sin filas');
  assert.match(pag, /apiFetch\(RUTA_CONTEOS_TRASLADOS, \{ signal: control\.signal \}\)/);
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
  // B4 T24 f3 r1 (F77, D27): las pestañas son pestanasTraslado de la lib (las de Inventario).
  for (const [id, etiqueta, campo] of [['en_proceso', 'En proceso', 'en_proceso'], ['completadas', 'Completados', 'completadas'], ['canceladas', 'Cancelados', 'canceladas'], ['todos', 'Todos', 'todos']]) {
    assert.deepEqual(ec.pestanasTraslado({ [campo]: 3 }).find((p) => p.id === id)?.etiqueta, etiqueta, `pestaña ${etiqueta}`);
  }
  assert.match(readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8'), /const c = conteosTraslado\(conteos\);/, 'las pestañas leen conteosTraslado');
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
  // B4 T24 f3 (F74-f, D27): por el parámetro exacto de F74-b (?id=), no por q= (que también busca en notas, documento y guía).
  // B4 T24 f3 r1 (F69, D27): el efecto bajó a la lib (abrirEnlaceTraslado), con la misma ruta y la misma llegada.
  const fuenteEc = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(fuenteEc, /\?operation_type=TRANSFER&id=\$\{id\}&limit=5`/, 'el traslado se pide por su id exacto, con a lo sumo 5 filas');
  assert.ok(!/q=\$\{encodeURIComponent\(numeroTraslado/.test(pag), 'sin la búsqueda por texto');
  assert.match(fuenteEc, /llegadaEnlaceTraslado\(id, normalizarRespuesta\(r\)\.filas\)/, 'abre solo la fila cuyo número es exacto (m13)');
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
  // El ref solo se marca cuando el traslado llegó (en la llegada), nunca antes del fetch. B4 T24 f3 r1 (F69, D27): el efecto es
  // abrirEnlaceTraslado de la lib; su doble montaje se EJECUTA en el bloque de r1 (antes, solo el orden en el fuente).
  const efecto = /const idAbierto = useRef[^\n]*\n([\s\S]*?)\}\), \[idDeLaUrl, avisar, avisarError\]\);/.exec(pag)?.[1] ?? '';
  assert.match(efecto, /useEffect\(\(\) => abrirEnlaceTraslado\(\{\s*marca: idAbierto, idDeLaUrl, pedir: apiFetch,/);
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
  // B4 T24 f3 (F70, D27): se cierra solo si salió bien Y solo la ventana de ese ítem (otra abierta mientras tanto conserva lo escrito).
  assert.match(guardar, /if \(await cambiarItem\([\s\S]*'No se pudo actualizar el proveedor'\)\) setEditando\(\(e\) => \(e\?\.id === it\.id \? null : e\)\);/, 'm6: se cierra solo si salió bien');
  // F70: «Guardar proveedor» carga mientras va su PATCH y no admite un segundo clic (dos PATCH, dos avisos, dos recargas).
  assert.match(lis, /<Button color="purple" icon=\{Package\} loading=\{ocupadoId === editando\.id\} disabled=\{ocupadoId != null\} onClick=\{guardarProveedor\}>Guardar proveedor<\/Button>/);
  // F70: el catch de cambiarItem devuelve false (la ventana no se cierra con un error).
  assert.match(lis, /if \(recargarTrasError\(err\)\) recargarTodo\(\);\s*return false;/, 'un error: false');
  // B4 T24 f3 r1 (F71, D27): textoSeleccionLista vive en la lib con sus casos (1/1, 3/2, 2/1 y 1/0, en el bloque de r1).
  assert.match(lis, /textoSeleccionLista\(seleccion\.length, itemsSeleccionados\.length\)/);
  assert.match(lis, /itemsSeleccionados\.length/, 'm12: la barra usa los seleccionables de verdad');
  assert.match(lis, /item\.fecha\b|it\.fecha\b/);
  assert.ok(!/fecha_creacion/.test(lis), 'I1: la Lista lee `fecha`');
}

console.log('--- TEST 42 (B4 T18; TABLA-inventario 5 a 8, KANBAN-resto; RP47 a RP49, RP53, RP54): lo puro de Stock, Abastecimiento, Kardex y Productos ---');
{
  const { humanizarCodigo } = await import('../src/lib/estados-pedido.js');
  const { etiquetaTarifaCatalogo } = await import('../src/lib/iva.js');
  const clavesDe = (cols) => cols.map((c) => c.clave);
  const NOMBRES = ['TEXTO_SOLO_VER_STOCK', 'TEXTO_SOLO_VER_KARDEX', 'TEXTO_SOLO_VER_PRODUCTOS', 'VISTAS_STOCK', 'VISTAS_ABASTECIMIENTO',
    'pestanasExistencias', 'consultaColumnaStock', 'tarjetaExistencia', 'DIRECCIONES_KARDEX', 'infoDireccionKardex',
    'COLUMNAS_KARDEX', 'extraKardex', 'direccionesDeColumnaKardex', 'consultaColumnaKardex', 'numeroMovimiento', 'tarjetaMovimiento',
    'textoFechaMovimiento', 'textoVacioKardex', 'MAX_COLUMNAS_PRODUCTOS', 'columnasProductos', 'extraProductos',
    'consultaColumnaProducto', 'precioDeProducto', 'costoDeProducto', 'tarjetaProducto', 'textoVacioProductos',
    'pedirEnlaceProducto', 'llegadaEnlaceProducto'];
  for (const n of NOMBRES) assert.ok(ec[n] !== undefined, `${n} existe`);

  // ── los textos de los tableros solo para ver (R11): el de Kardex es el de RP54, palabra por palabra ──
  assert.equal(ec.TEXTO_SOLO_VER_KARDEX, 'Este tablero es para ver: los movimientos en cuarentena o sin dirección solo salen en la lista.');
  assert.equal(ec.TEXTO_SOLO_VER_STOCK, 'Este tablero es para ver: el nivel de stock sale de las existencias de cada bodega y no se cambia arrastrando tarjetas.');
  assert.equal(ec.TEXTO_SOLO_VER_PRODUCTOS, 'Este tablero es para ver: la categoría de un producto se cambia en su ficha.');

  // ── Stock y Abastecimiento: las pestañas son el estado del stock (RP53), no `vista` del servidor ──
  assert.deepEqual(ec.VISTAS_STOCK, {
    todos: {}, agotado: { estado_stock: 'agotado' }, bajo_minimo: { estado_stock: 'bajo_minimo' }, abastecido: { estado_stock: 'abastecido' },
  });
  assert.deepEqual(Object.keys(ec.VISTAS_ABASTECIMIENTO), ['agotado', 'bajo_minimo', 'abastecido'], 'RP53: sin «Todos»');
  assert.ok(Object.isFrozen(ec.VISTAS_STOCK) && Object.isFrozen(ec.VISTAS_ABASTECIMIENTO));
  const conteos = { todos: 9, agotados: 2, bajo_minimo: 3, abastecidos: 4, con_fisico: 7 };
  assert.deepEqual(ec.pestanasExistencias(conteos), [
    { id: 'todos', etiqueta: 'Todos', conteo: 9, alerta: false },
    { id: 'agotado', etiqueta: 'Agotado', conteo: 2, alerta: true },
    { id: 'bajo_minimo', etiqueta: 'Bajo el mínimo', conteo: 3, alerta: true },
    { id: 'abastecido', etiqueta: 'Bien abastecido', conteo: 4, alerta: false },
  ], 'cada pestaña lee SU conteo (agotados, no agotado)');
  assert.deepEqual(ec.pestanasExistencias(conteos, { conTodos: false }).map((p) => p.id), ['agotado', 'bajo_minimo', 'abastecido']);
  assert.deepEqual(ec.pestanasExistencias(null).map((p) => p.conteo), [null, null, null, null], 'cargando: null (la barra gris), nunca 0');
  assert.deepEqual(ec.pestanasExistencias({ agotados: 0, bajo_minimo: 0 }).map((p) => [p.conteo, p.alerta]),
    [[null, false], [0, false], [0, false], [null, false]], 'un 0 del servidor es 0 y no alerta');
  assert.equal(ec.pestanasExistencias({ agotados: '5' })[1].conteo, 5);
  assert.equal(ec.pestanasExistencias('x')[0].conteo, null);

  // La alerta de agotados de Abastecimiento: cuatro estados, que ocupan el mismo alto (la alerta no empuja la página al llegar).
  assert.equal(typeof ec.estadoAlertaAgotados, 'function', 'estadoAlertaAgotados existe');
  for (const [kpi, agotados, esperado] of [
    ['cargando', null, 'cargando'], ['cargando', 3, 'cargando'], ['error', 3, 'sin_dato'], ['error', null, 'sin_dato'],
    ['listo', null, 'sin_dato'], ['listo', 'x', 'sin_dato'], ['listo', undefined, 'sin_dato'], ['listo', 0, 'ninguno'], ['listo', '0', 'ninguno'],
    ['listo', 2, 'hay'], ['listo', '4', 'hay'], ['actualizando', 2, 'hay'], ['actualizando', 0, 'ninguno'], ['actualizando', null, 'sin_dato'],
  ]) assert.equal(ec.estadoAlertaAgotados(kpi, agotados), esperado, `${kpi} · ${agotados} -> ${esperado}`);

  const estadoStock = estadoTablaInicial({ q: 'oso', tamano: 50, pagina: 3, orden: '-disponible', vista: 'agotado', estados: ['x'] });
  const bajo = COLUMNAS_STOCK[1];
  assert.equal(ec.consultaColumnaStock(estadoStock, bajo, { por: 'sku', categoria_id: '7' }, { limit: 25, offset: 0 }),
    'q=oso&orden=-disponible&limit=25&offset=0&por=sku&categoria_id=7&estado_stock=bajo_minimo',
    'sin vista ni estados (stock-tabla no los tiene), el estado de la columna, la búsqueda y el orden del MISMO estado, y limit y offset de la columna');
  assert.equal(ec.consultaColumnaStock(estadoTablaInicial({}), COLUMNAS_STOCK[0], { por: 'sku' }, { limit: 0, offset: 0 }),
    'limit=0&offset=0&por=sku&estado_stock=agotado', 'una plegada pide limit=0 (stock-tabla lo acepta)');
  assert.equal(ec.consultaColumnaStock(estadoStock, COLUMNAS_STOCK[2], null, { limit: 25, offset: 25 }),
    'q=oso&orden=-disponible&limit=25&offset=25&estado_stock=abastecido');
  for (const mala of [null, undefined, {}, { estados: [] }, { estados: ['otro'] }, { estados: ['toString'] }]) {
    assert.equal(ec.consultaColumnaStock(estadoStock, mala, {}, { limit: 25, offset: 0 }), null, JSON.stringify(mala));
  }
  assert.ok(!/sin_movimiento|reciente|vista|estados=/.test(ec.consultaColumnaStock(estadoStock, bajo, {}, { limit: 25, offset: 0 })),
    'stock-tabla da 422 con un orden de tiempo');

  // m24: «Reservado» = hay unidades en bodega y nada disponible (todo comprometido); sin unidades no es reservado.
  assert.equal(typeof ec.existenciaReservada, 'function', 'existenciaReservada existe');
  for (const [f, esperado] of [[{ fisico: 5, disponible: 0 }, true], [{ fisico: '5', disponible: '0' }, true], [{ fisico: 0, disponible: 0 }, false],
    [{ fisico: 5, disponible: 2 }, false], [{ fisico: 5, disponible: null }, false], [{ fisico: null, disponible: 0 }, false], [{}, false], [null, false]]) {
    assert.equal(ec.existenciaReservada(f), esperado, JSON.stringify(f));
  }

  const existencia = {
    sku_id: 1, sku: 'NEB-001', producto: 'Oso', categoria: 'Peluches', bodega: null, warehouse_id: null, fisico: 10, reservado: 4,
    disponible: 6, cuarentena: 0, en_transito: 5, precio: 12000, costo: 8000, valorizacion: 80000, minimo: 8,
    estado_stock: 'bajo_minimo', rastrear_inventario: true,
  };
  assert.deepEqual(ec.tarjetaExistencia(existencia), {
    numero: 'NEB-001', tipo: null, titulo: 'Oso', subtitulo: 'Peluches', monto: null,
    estado: { label: 'Bajo el mínimo', clases: ESTADOS_STOCK.bajo_minimo.clases },
    chips: [{ texto: 'Disponible 6', tono: 'amber' }, { texto: 'Físico 10', tono: 'slate' }, { texto: 'En tránsito 5', tono: 'blue' }],
    tiempo: 'Reservado 4', atrasada: false, accionPrincipal: null,
  });
  const sinTransito = ec.tarjetaExistencia({ ...existencia, en_transito: 0, estado_stock: 'agotado', disponible: 0, bodega: 'Bodega Norte', reservado: 0 });
  assert.deepEqual(sinTransito.chips, [{ texto: 'Disponible 0', tono: 'rose' }, { texto: 'Físico 10', tono: 'slate' }, { texto: 'Mínimo 8', tono: 'slate' }]);
  assert.equal(sinTransito.subtitulo, 'Peluches · Bodega Norte');
  assert.equal(sinTransito.tiempo, null, 'sin reservas, sin línea');
  assert.equal(sinTransito.estado.label, 'Agotado');
  assert.equal(ec.tarjetaExistencia({ ...existencia, estado_stock: 'abastecido' }).chips[0].tono, 'emerald');
  assert.equal(ec.tarjetaExistencia({ ...existencia, rastrear_inventario: false }).tiempo, 'Sin control de inventario');
  const rara = ec.tarjetaExistencia({ sku: 'X', estado_stock: 'raro', fisico: '2,5x', disponible: null });
  assert.equal(rara.titulo, 'Sin nombre');
  assert.equal(rara.estado, null, 'un estado desconocido no inventa insignia');
  assert.deepEqual(rara.chips.slice(0, 2), [{ texto: 'Disponible —', tono: 'slate' }, { texto: 'Físico —', tono: 'slate' }]);
  assert.equal(ec.tarjetaExistencia({ sku: 'X', disponible: 2.5, fisico: 3 }).chips[0].texto, 'Disponible 2,5', 'sin redondear');

  // ── Kardex: direcciones, columnas Entradas · Salidas (RP54) y la consulta de cada columna ──
  assert.deepEqual(Object.keys(ec.DIRECCIONES_KARDEX),
    ['IN', 'OUT', 'TRANSFER_IN', 'TRANSFER_OUT', 'ADJUST_IN', 'ADJUST_OUT', 'QUARANTINE', 'SCRAP', 'RETURN_IN']);
  assert.deepEqual(Object.entries(ec.DIRECCIONES_KARDEX).map(([k, v]) => [k, v.label, v.signo]), [
    ['IN', 'Entrada', '+'], ['OUT', 'Salida', '-'], ['TRANSFER_IN', 'Traslado (entra)', '+'], ['TRANSFER_OUT', 'Traslado (sale)', '-'],
    ['ADJUST_IN', 'Ajuste (entrada)', '+'], ['ADJUST_OUT', 'Ajuste (salida)', '-'], ['QUARANTINE', 'Cuarentena', ''],
    ['SCRAP', 'Pérdida o destrucción', '-'], ['RETURN_IN', 'Devolución de cliente', '+'],
  ]);
  assert.ok(Object.isFrozen(ec.DIRECCIONES_KARDEX) && Object.isFrozen(ec.DIRECCIONES_KARDEX.IN));
  assert.equal(ec.infoDireccionKardex('IN'), ec.DIRECCIONES_KARDEX.IN);
  assert.deepEqual([ec.infoDireccionKardex(null).label, ec.infoDireccionKardex('').label, ec.infoDireccionKardex(null).signo], ['Sin dirección', 'Sin dirección', '']);
  assert.equal(ec.infoDireccionKardex('PERDIDA_RARA').label, humanizarCodigo('PERDIDA_RARA'), 'una desconocida sale humanizada, nunca el código');
  assert.equal(ec.infoDireccionKardex('toString').label, humanizarCodigo('toString'), 'una clave del prototipo no es una dirección');
  assert.deepEqual(ec.COLUMNAS_KARDEX.map((c) => [c.clave, c.titulo, c.tono, c.cerrada, c.estados]), [
    ['entradas', 'Entradas', 'emerald', false, ['IN', 'ADJUST_IN', 'TRANSFER_IN']],
    ['salidas', 'Salidas', 'rose', false, ['OUT', 'ADJUST_OUT', 'TRANSFER_OUT']],
  ]);
  assert.doesNotThrow(() => kanbanLib.definirColumnas(ec.COLUMNAS_KARDEX));
  const [entradas, salidas] = ec.COLUMNAS_KARDEX;
  const todos = { skuId: 12, bodega: '2', propietario: '', direccion: '', desde: '2026-10-01', hasta: '' };
  assert.deepEqual(ec.extraKardex({ skuId: 12, bodega: '2', propietario: 'MAU', direccion: 'IN', desde: '2026-10-01', hasta: '2026-10-31' }), {
    sku_id: 12, warehouse_id: '2', owner: 'MAU', direction: 'IN', start_date: '2026-10-01', end_date: '2026-10-31',
  });
  assert.deepEqual(ec.extraKardex({ skuId: null, bodega: '', propietario: '', direccion: '', desde: '', hasta: '' }),
    { sku_id: null, warehouse_id: null, owner: null, direction: null, start_date: null, end_date: null }, 'vacío = no se manda');
  assert.deepEqual(ec.extraKardex(null), { sku_id: null, warehouse_id: null, owner: null, direction: null, start_date: null, end_date: null });
  assert.deepEqual(ec.direccionesDeColumnaKardex(entradas, ''), ['IN', 'ADJUST_IN', 'TRANSFER_IN']);
  assert.deepEqual(ec.direccionesDeColumnaKardex(entradas, null), ['IN', 'ADJUST_IN', 'TRANSFER_IN']);
  assert.deepEqual(ec.direccionesDeColumnaKardex(entradas, 'IN'), ['IN']);
  assert.deepEqual(ec.direccionesDeColumnaKardex(entradas, 'in'), ['IN'], 'el servidor las lee en mayúsculas');
  assert.deepEqual(ec.direccionesDeColumnaKardex(salidas, 'IN'), [], 'la dirección elegida deja vacía la otra columna');
  assert.deepEqual(ec.direccionesDeColumnaKardex(salidas, 'TRANSFER_OUT'), ['TRANSFER_OUT']);
  for (const d of ['QUARANTINE', 'SCRAP', 'RETURN_IN']) {
    assert.deepEqual([ec.direccionesDeColumnaKardex(entradas, d), ec.direccionesDeColumnaKardex(salidas, d)], [[], []], `${d} solo sale en la lista`);
  }
  assert.deepEqual(ec.direccionesDeColumnaKardex(null, ''), []);
  assert.deepEqual(ec.direccionesDeColumnaKardex({}, ''), []);
  const estadoKardex = estadoTablaInicial({ q: 'x', tamano: 50, pagina: 4, orden: '-fecha', vista: 'a', estados: ['b'] });
  assert.equal(ec.consultaColumnaKardex(estadoKardex, entradas, todos, { limit: 25, offset: 0 }),
    'limit=25&offset=0&sku_id=12&warehouse_id=2&direction=IN,ADJUST_IN,TRANSFER_IN&start_date=2026-10-01',
    'direction en CSV; sin q, orden, vista ni estados (el Kardex no los tiene)');
  assert.equal(ec.consultaColumnaKardex(estadoKardex, salidas, { ...todos, direccion: 'OUT', hasta: '2026-10-31' }, { limit: 25, offset: 25 }),
    'limit=25&offset=25&sku_id=12&warehouse_id=2&direction=OUT&start_date=2026-10-01&end_date=2026-10-31');
  assert.equal(ec.consultaColumnaKardex(estadoKardex, salidas, { ...todos, direccion: 'IN' }, { limit: 25, offset: 0 }), null, 'sin direcciones en común, no se pide');
  assert.equal(ec.consultaColumnaKardex(estadoKardex, entradas, { ...todos, direccion: 'QUARANTINE' }, { limit: 25, offset: 0 }), null);
  assert.match(ec.consultaColumnaKardex(estadoKardex, entradas, todos, { limit: 0, offset: 0 }), /^limit=1&/,
    'el Kardex pide limit >= 1: una columna plegada pide 1 en lugar de 0 (con 0 daría 400)');
  assert.match(ec.consultaColumnaKardex(estadoKardex, entradas, todos, { limit: 50, offset: 100 }), /^limit=50&offset=100&/);

  // El movimiento y su tarjeta: la forma de GET /inventory/kardex (KardexMovementItem).
  const movimiento = {
    id: 41, operation_id: 9, operation_type: 'RECEIPT', source_document_type: 'ENINV', source_document_numero: 'ENINV-5',
    sku_id: 1, sku: 'NEB-001', product_name: 'Oso', quantity: '3.0000', direction: 'IN', owner: 'NEBULAE', warehouse_id: 2,
    warehouse_name: 'Bodega Norte', unit_cost_cop: '8000.00', created_at: '2026-10-04T03:00:00', created_by: 'ana', idempotency_key: 'k',
  };
  assert.equal(ec.numeroMovimiento(movimiento), 'ENINV-5');
  assert.equal(ec.numeroMovimiento({ ...movimiento, source_document_numero: '  ' }), 'Recepción n.º 9', 'm14: la etiqueta del tipo, nunca RECEIPT');
  for (const [tipo, etiqueta] of [['DELIVERY', 'Entrega'], ['TRANSFER', 'Traslado'], ['PHYSICAL_INVENTORY', 'Inventario físico'], ['ADJUSTMENT', 'Ajuste'],
    ['LOGISTIC_EVENT', 'Evento logístico'], ['SCRAP', 'Pérdida o destrucción']]) assert.equal(ec.etiquetaOperacion(tipo), etiqueta, tipo);
  assert.equal(ec.etiquetaOperacion('OTRA_COSA'), humanizarCodigo('OTRA_COSA'), 'un tipo desconocido sale humanizado');
  assert.equal(ec.etiquetaOperacion('toString'), humanizarCodigo('toString'), 'una clave del prototipo no es un tipo');
  assert.equal(ec.numeroMovimiento({ operation_type: 'PHYSICAL_INVENTORY', operation_id: 3 }), 'Inventario físico n.º 3');
  assert.deepEqual(['NEBULAE', 'nebulae', 'MAU', null, '', 'XYZ'].map((o) => ec.etiquetaPropietario(o)), ['Nebulae', 'Nebulae', 'Mau', 'Nebulae', 'Nebulae', humanizarCodigo('XYZ')]);
  assert.equal(ec.numeroMovimiento({ id: 3, operation_type: null, operation_id: null }), 'Movimiento n.º 3');
  assert.deepEqual(ec.textoFechaMovimiento('2026-10-04T03:00:00'), { dia: '3 oct 2026', hora: '10:00 p. m.' }, 'm13: la hora de fechas-colombia.js; sin zona = UTC; el día y la hora son de Colombia');
  assert.deepEqual(ec.textoFechaMovimiento('2026-10-04T15:05:00Z'), { dia: '4 oct 2026', hora: '10:05 a. m.' });
  assert.deepEqual(ec.textoFechaMovimiento(null), { dia: '—', hora: '' });
  assert.deepEqual(ec.textoFechaMovimiento('no es fecha'), { dia: '—', hora: '' });
  assert.deepEqual(ec.tarjetaMovimiento(movimiento), {
    numero: 'ENINV-5', tipo: null, titulo: 'Oso', subtitulo: 'NEB-001 · Bodega Norte', monto: null,
    estado: { label: 'Entrada', clases: ec.DIRECCIONES_KARDEX.IN.clases },
    chips: [{ texto: '+3', tono: 'emerald' }, { texto: 'Nebulae', tono: 'slate' }],
    tiempo: '3 oct 2026 · 10:00 p. m.', atrasada: false, accionPrincipal: null,
  });
  const salida = ec.tarjetaMovimiento({ ...movimiento, direction: 'ADJUST_OUT', quantity: 2.5, owner: 'MAU', product_name: null, warehouse_name: null });
  assert.deepEqual(salida.chips, [{ texto: '-2,5', tono: 'rose' }, { texto: 'Mau', tono: 'slate' }]);
  assert.equal(salida.titulo, 'NEB-001');
  assert.equal(salida.subtitulo, 'NEB-001');
  assert.equal(ec.tarjetaMovimiento({ ...movimiento, direction: null }).chips[0].tono, 'amber', 'sin dirección no hay signo');
  assert.equal(ec.tarjetaMovimiento({ ...movimiento, owner: null }).chips[1].texto, 'Nebulae', 'sin propietario, Nebulae (como la tabla de hoy)');
  assert.equal(ec.tarjetaMovimiento({ ...movimiento, sku: null, product_name: null }).titulo, 'SKU #1');
  assert.deepEqual(ec.textoVacioKardex(true), { titulo: 'Ningún movimiento coincide con esos filtros.', ayuda: 'Quita algún filtro o amplía las fechas.' });
  assert.deepEqual(ec.textoVacioKardex(false), {
    titulo: 'Todavía no hay movimientos en el Kardex.', ayuda: 'Se registran al recibir, despachar, trasladar o ajustar inventario.',
  });

  // ── Productos: columnas por categoría (máximo 12), consulta de cada columna y tarjeta ──
  assert.equal(ec.MAX_COLUMNAS_PRODUCTOS, 12);
  const tres = ec.columnasProductos([{ id: 5, name: 'Peluches' }, { id: 2, name: 'Ábaco' }, { id: 9, name: 'Muñecas' }]);
  assert.deepEqual(tres.columnas.map((c) => [c.clave, c.titulo, c.estados, c.cerrada]),
    [['cat-2', 'Ábaco', ['2'], false], ['cat-9', 'Muñecas', ['9'], false], ['cat-5', 'Peluches', ['5'], false]], 'por nombre, en español');
  assert.deepEqual([tres.masCategorias, tres.aviso], [0, null]);
  assert.doesNotThrow(() => kanbanLib.definirColumnas(tres.columnas));
  const quince = ec.columnasProductos(Array.from({ length: 15 }, (_, i) => ({ id: i + 1, name: `Cat ${String(i + 1).padStart(2, '0')}` })));
  assert.equal(quince.columnas.length, 12);
  assert.deepEqual(clavesDe(quince.columnas).slice(0, 2), ['cat-1', 'cat-2']);
  assert.deepEqual([quince.masCategorias, quince.aviso], [3, '3 categorías más: usa la lista']);
  assert.doesNotThrow(() => kanbanLib.definirColumnas(quince.columnas));
  assert.equal(new Set(quince.columnas.map((c) => c.clave)).size, 12);
  const trece = ec.columnasProductos(Array.from({ length: 13 }, (_, i) => ({ id: i + 1, name: `C${String(i + 1).padStart(2, '0')}` })));
  assert.deepEqual([trece.columnas.length, trece.masCategorias, trece.aviso], [12, 1, '1 categoría más: usa la lista']);
  assert.equal(ec.columnasProductos(Array.from({ length: 12 }, (_, i) => ({ id: i + 1, name: `C${i}` }))).aviso, null, 'justo 12: sin aviso');
  assert.equal(ec.columnasProductos(quince.columnas.map(() => ({ id: 1, name: 'Igual' }))).columnas.length, 1, 'un id repetido es una sola columna');
  const sucias = ec.columnasProductos([null, 'x', { name: 'Sin id' }, { id: 'abc', name: 'Texto' }, { id: 4, name: '  ' }, { id: 6, name: 'Bien' }]);
  assert.deepEqual(sucias.columnas.map((c) => [c.clave, c.titulo]), [['cat-6', 'Bien'], ['cat-4', 'Sin nombre']]);
  for (const mala of [null, undefined, 'x', {}, 4]) assert.deepEqual(ec.columnasProductos(mala), { columnas: [], masCategorias: 0, aviso: null }, String(mala));
  assert.ok(new Set(quince.columnas.map((c) => c.tono)).size > 1, 'los tonos van variando');

  assert.deepEqual(ec.extraProductos({ revision: true, sinTarifa: true, categoria: '7' }), { necesita_revision: true, sin_tarifa_iva: true, category_id: '7' }, 'm4: la categoría de la barra va como category_id');
  assert.deepEqual(ec.extraProductos({ revision: false, sinTarifa: false, categoria: '  ' }), { necesita_revision: null, sin_tarifa_iva: null, category_id: null },
    'apagado = no se manda (sin_tarifa_iva=false pediría los que SÍ tienen tarifa)');
  assert.deepEqual(ec.extraProductos(null), { necesita_revision: null, sin_tarifa_iva: null, category_id: null });
  // m4: con una categoría elegida en la barra, la lista manda category_id y el tablero solo pide la columna de esa categoría.
  const colOtra = ec.columnasProductos([{ id: 8, name: 'Otra' }]).columnas[0];
  assert.equal(ec.consultaColumnaProducto(estadoTablaInicial({}), colOtra, { categoria: '7' }, { limit: 25, offset: 0 }), null, 'otra columna: vacía sin pedir');
  assert.equal(ec.consultaColumnaProducto(estadoTablaInicial({}), ec.columnasProductos([{ id: 7, name: 'Peluches' }]).columnas[0], { categoria: '7' }, { limit: 25, offset: 0 }),
    'limit=25&offset=0&category_id=7', 'la misma columna: pide, con UN category_id');
  assert.equal(ec.consultaColumnaProducto(estadoTablaInicial({}), colOtra, { categoria: '' }, { limit: 25, offset: 0 }), 'limit=25&offset=0&category_id=8', 'sin categoría elegida: todas');
  assert.deepEqual(ec.textoVacioProductos({ categoria: 'Peluches' }), { titulo: 'Ningún producto en la categoría «Peluches».', ayuda: 'Quita el filtro de categoría para ver las demás.' });
  assert.deepEqual(ec.textoVacioProductos({ q: 'oso', categoria: 'Peluches' }), {
    titulo: 'Ningún producto coincide con «oso» en la categoría «Peluches».', ayuda: 'Quita los filtros de revisión, de IVA o de categoría para ver más.',
  });
  assert.equal(ec.textoVacioProductos({ revision: true, categoria: 'Peluches' }).titulo, 'Ningún producto requiere revisión en la categoría «Peluches».');
  assert.equal(ec.textoVacioProductos({ sinTarifa: true, categoria: 'Peluches' }).titulo, 'Ningún producto sin tarifa de IVA en la categoría «Peluches».');
  const estadoProd = estadoTablaInicial({ q: 'oso', orden: '-nombre', tamano: 50, pagina: 3, vista: 'x', estados: ['y'] });
  const colPeluches = ec.columnasProductos([{ id: 7, name: 'Peluches' }]).columnas[0];
  assert.equal(ec.consultaColumnaProducto(estadoProd, colPeluches, { revision: true, sinTarifa: false }, { limit: 25, offset: 0 }),
    'q=oso&orden=-nombre&limit=25&offset=0&necesita_revision=1&category_id=7',
    'RP47: siempre limit y offset; q (no search); la categoría de la columna; sin vista ni estados');
  assert.equal(ec.consultaColumnaProducto(estadoTablaInicial({}), colPeluches, null, { limit: 0, offset: 0 }),
    'limit=0&offset=0&category_id=7', 'una plegada pide limit=0 con offset=0 (sin offset, /products devuelve todo)');
  assert.equal(ec.consultaColumnaProducto(estadoTablaInicial({}), colPeluches, { revision: true, sinTarifa: true }, { limit: 25, offset: 50 }),
    'limit=25&offset=50&necesita_revision=1&sin_tarifa_iva=1&category_id=7');
  for (const mala of [null, undefined, {}, { estados: [] }, { estados: ['abc'] }, { estados: ['0'] }, { estados: ['-3'] }]) {
    assert.equal(ec.consultaColumnaProducto(estadoProd, mala, {}, { limit: 25, offset: 0 }), null, JSON.stringify(mala));
  }
  assert.ok(!/sin_movimiento|reciente/.test(ec.consultaColumnaProducto(estadoProd, colPeluches, {}, { limit: 25, offset: 0 })), '/products da 422 con un orden de tiempo');

  // precio_venta y costo son claves NUEVAS de /products (RP91): el costo $0 de quick-create es «sin costo», como en existencias.
  assert.equal(ec.precioDeProducto({ precio_venta: 12000 }), 12000);
  assert.equal(ec.precioDeProducto({ precio_venta: '12000.00' }), 12000);
  assert.equal(ec.precioDeProducto({ sale_price: 5000 }), null, 'sale_price no es una clave de /products');
  for (const sin of [{}, null, { precio_venta: null }, { precio_venta: 0 }, { precio_venta: 'x' }]) assert.equal(ec.precioDeProducto(sin), null, JSON.stringify(sin));
  assert.equal(ec.costoDeProducto({ costo: 8000 }), 8000);
  assert.equal(ec.costoDeProducto({ costo: '8000.00' }), 8000);
  for (const sin of [{}, null, { costo: null }, { costo: 0 }, { costo: '0.00' }, { costo: -5 }, { cost_price: 9 }]) assert.equal(ec.costoDeProducto(sin), null, JSON.stringify(sin));

  const producto = {
    id: 3, name: 'Oso', type: 'Fisico', tarifa_iva: '19', necesita_revision: true, is_active: true, brand_id: 1, category_id: 7,
    category: { id: 7, name: 'Peluches' }, skus: [{ id: 1, sku: 'NEB-001' }, { id: 2, sku: 'NEB-002' }], precio_venta: 12000, costo: 0, publicado: true,
  };
  assert.deepEqual(ec.tarjetaProducto(producto), {
    numero: 'NEB-001', tipo: null, titulo: 'Oso', subtitulo: 'Peluches', monto: null,
    estado: { label: 'Activo', clases: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' } },
    chips: [{ texto: 'Requiere revisión', tono: 'amber' }, { texto: etiquetaTarifaCatalogo('19'), tono: 'slate' }, { texto: 'Publicado', tono: 'emerald' }],
    tiempo: 'Precio $12.000 · Costo —', atrasada: false, accionPrincipal: null,
  });
  const sinTarifa = ec.tarjetaProducto({ ...producto, tarifa_iva: null, necesita_revision: false, publicado: false, is_active: false, skus: [], costo: 8000, category: null });
  assert.deepEqual(sinTarifa.chips, [{ texto: etiquetaTarifaCatalogo(null), tono: 'amber' }], 'sin tarifa, ámbar (como el Badge de hoy)');
  assert.equal(sinTarifa.numero, 'PRD-3');
  assert.equal(sinTarifa.subtitulo, null);
  assert.deepEqual(sinTarifa.estado, { label: 'Inactivo', clases: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' } });
  assert.equal(sinTarifa.tiempo, 'Precio $12.000 · Costo $8.000');
  assert.equal(ec.tarjetaProducto({ id: 1, name: null }).titulo, 'Sin nombre');
  assert.equal(ec.tarjetaProducto({ id: 1, precio_venta: null }).tiempo, 'Precio — · Costo —');
  assert.deepEqual(ec.textoVacioProductos({ q: 'oso' }), { titulo: 'Ningún producto coincide con «oso».', ayuda: 'Busca por el nombre, la descripción o el código del SKU.' });
  assert.equal(ec.textoVacioProductos({ q: 'oso', revision: true }).ayuda, 'Quita los filtros de revisión o de IVA para ver más.');
  assert.equal(ec.textoVacioProductos({ revision: true }).titulo, 'Ningún producto requiere revisión.');
  assert.equal(ec.textoVacioProductos({ sinTarifa: true }).titulo, 'Todos los productos tienen tarifa de IVA.');
  assert.equal(ec.textoVacioProductos({ revision: true, sinTarifa: true }).titulo, 'Ningún producto requiere revisión y está sin tarifa de IVA.');
  assert.deepEqual(ec.textoVacioProductos({}), { titulo: 'Sin productos. Crea el primero.', ayuda: 'Usa «Nuevo Producto» para crear el primero.' });
  assert.equal(ec.textoVacioProductos(null).titulo, 'Sin productos. Crea el primero.');

  // RP49: el enlace ?id= pide /products?id=N (la marca se pone cuando la respuesta LLEGÓ); ?sku= lo usa Abastecimiento, porque
  // stock-tabla no trae el id del producto.
  assert.deepEqual(ec.pedirEnlaceProducto(null, '5', null), { marca: 'id:5', ruta: '/products?id=5', id: 5, sku: null });
  assert.equal(ec.pedirEnlaceProducto('id:5', '5', null), null, 'ya atendido: no vuelve a pedir');
  assert.deepEqual(ec.pedirEnlaceProducto('id:4', '5', null)?.marca, 'id:5', 'otro id sí');
  for (const mal of ['abc', '0', '-1', '5x', '', ' ', '1.5']) assert.equal(ec.pedirEnlaceProducto(null, mal, null), null, mal);
  assert.equal(ec.pedirEnlaceProducto(null, null, null), null);
  assert.equal(ec.pedirEnlaceProducto(null, undefined, undefined), null);
  assert.deepEqual(ec.pedirEnlaceProducto(null, null, 'NEB 001/x'), {
    // B4 T24 f3 (B40-f, D27): el parámetro exacto de B40-b (?sku=), no q=.
    marca: 'sku:NEB 001/x', ruta: '/products?sku=NEB%20001%2Fx&limit=50&offset=0', id: null, sku: 'NEB 001/x',
  });
  assert.equal(ec.pedirEnlaceProducto('sku:NEB-001', null, 'NEB-001'), null);
  assert.equal(ec.pedirEnlaceProducto(null, null, '   '), null);
  assert.equal(ec.pedirEnlaceProducto(null, '5', 'NEB-001').marca, 'id:5', 'el id gana');
  assert.equal(ec.pedirEnlaceProducto(null, 'abc', 'NEB-001').marca, 'sku:NEB-001', 'un id malo no tapa un SKU bueno');
  const porId = ec.pedirEnlaceProducto(null, '3', null);
  assert.deepEqual(ec.llegadaEnlaceProducto(porId, [{ id: 9 }, producto]), { marca: 'id:3', abrir: producto, avisar: false, texto: null });
  assert.deepEqual(ec.llegadaEnlaceProducto(porId, [{ id: 9 }]), { marca: 'id:3', abrir: null, avisar: true, texto: 'No se encontró el producto #3.' });
  assert.deepEqual(ec.llegadaEnlaceProducto(porId, null), { marca: 'id:3', abrir: null, avisar: true, texto: 'No se encontró el producto #3.' });
  const porSku = ec.pedirEnlaceProducto(null, null, 'neb-002');
  assert.equal(ec.llegadaEnlaceProducto(porSku, [{ id: 8, skus: [{ sku: 'NEB-0020' }] }, producto]).abrir, producto, 'el SKU EXACTO (sin mayúsculas), no el que lo contiene');
  assert.deepEqual(ec.llegadaEnlaceProducto(porSku, [{ id: 8, skus: [{ sku: 'NEB-0020' }] }, { id: 7 }, null]), {
    marca: 'sku:neb-002', abrir: null, avisar: true, texto: 'No se encontró un producto con el SKU «neb-002».',
  });
}

// ── B4 T18: ayudas de las pruebas del cableado de Stock, Abastecimiento, Kardex y Productos ──
const leerFuente = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** Que el fuente traiga ESE texto exacto (una condición, una prop, una llamada). */
const trae = (fuente, texto, mensaje) => assert.ok(fuente.includes(texto), mensaje ?? `falta: ${texto}`);
/** Que el fuente NO traiga ese texto. */
const noTrae = (fuente, texto, mensaje) => assert.ok(!fuente.includes(texto), mensaje ?? `sobra: ${texto}`);
/** El bloque `{…}` que empieza en la primera llave después de `desde` (con la llave de cierre que le corresponde), o ''. */
function bloqueDesde(fuente, desde) {
  const inicio = fuente.indexOf(desde);
  if (inicio < 0) return '';
  const abre = fuente.indexOf('{', inicio + desde.length - 1);
  let nivel = 0;
  for (let j = abre; j < fuente.length; j += 1) {
    if (fuente[j] === '{') nivel += 1;
    else if (fuente[j] === '}') { nivel -= 1; if (nivel === 0) return fuente.slice(abre, j + 1); }
  }
  return '';
}
/** El texto de una etiqueta JSX con las props en varias líneas: desde `desde` hasta el primer `/>` solo en su línea. */
function etiquetaJsx(fuente, desde) {
  const inicio = fuente.indexOf(desde);
  if (inicio < 0) return '';
  const fin = /\n\s*\/>/.exec(fuente.slice(inicio));
  return fuente.slice(inicio, fin ? inicio + fin.index + fin[0].length : undefined);
}
/**
 * La función `cargar: async (columna, {…}) => {…}` del tablero de una pantalla (el fuente), transpilada a JS y lista para
 * ejecutarse con un entorno de dobles (estado, filtros, apiFetch…): la prueba mira lo que HACE, no cómo está escrita.
 */
function cargarDe(fuente) {
  const marca = 'cargar: async (';
  const inicio = fuente.indexOf(marca);
  assert.ok(inicio >= 0, 'el tablero trae cargar');
  const cuerpo = bloqueDesde(fuente, fuente.slice(inicio, fuente.indexOf('=> {', inicio) + 4));
  assert.ok(cuerpo.length > 2, 'cargar cierra');
  const flecha = fuente.slice(inicio + 'cargar: '.length, fuente.indexOf('=> {', inicio) + 3);
  const js = tsLib.transpileModule(`(${flecha} ${cuerpo})`, { compilerOptions: { target: tsLib.ScriptTarget.ES2020 } })
    .outputText.replace(/^"use strict";\s*/, '').trim().replace(/;$/, '');
  return (entorno) => new Function('entorno', `with (entorno) { return ${js}; }`)(entorno);
}
/** Las columnas de una tabla (un arreglo `const COLUMNAS…: ColumnaTabla<…>[] = [ … ];`): por cada una, su id y si se ordena. */
function columnasDe(fuente, nombre) {
  const inicio = fuente.indexOf(`const ${nombre}: ColumnaTabla<`);
  assert.ok(inicio >= 0, `${nombre} existe`);
  const arreglo = fuente.slice(fuente.indexOf('= [', inicio), fuente.indexOf('\n];', inicio));
  return arreglo.split(/\n {2}\{ id: '/).slice(1).map((trozo) => ({
    id: trozo.slice(0, trozo.indexOf("'")),
    ordenable: /ordenable: (true|'[a-z_]+')/.exec(trozo)?.[1] ?? null,
    oculta: /ocultaPorDefecto: true/.test(trozo),
    flexible: /flexible: true/.test(trozo),
  }));
}
/** El fuente sin sus comentarios (los de arriba cuentan lo que había antes y lo nombran). */
const sinComentarios = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
/** Lo que ninguna de las cuatro pantallas puede tener: errores tragados, diálogos nativos, datos de relleno. */
function sinDefectos(nombre, original, { sinAny = true } = {}) {
  // Sin los comentarios (los de arriba cuentan lo que había antes y lo nombran).
  const fuente = sinComentarios(original);
  assert.ok(!/\.catch\(\s*\(\s*\)\s*=>\s*(\[\s*\]|\{\s*\}|\(\s*\{\s*\}\s*\)|null)\s*\)/.test(fuente), `${nombre}: ningún error tragado como vacío`);
  assert.ok(!/\.catch\(\s*\(\s*_?\w*\s*\)\s*=>\s*(\[\s*\]|\{\s*\})\s*\)/.test(fuente), `${nombre}: ningún catch con un vacío`);
  assert.ok(!/(^|[^\w.$])(window\.)?(alert|confirm|prompt)\s*\(/.test(fuente), `${nombre}: sin diálogos nativos`);
  assert.ok(!/@ts-nocheck/.test(fuente), `${nombre}: tipada`);
  // La ficha de Productos (B1 a B3) trae sus `any` de siempre: ahí no se exige.
  if (sinAny) assert.ok(!/\bany\[\]|: any\b/.test(fuente), `${nombre}: sin any`);
}

console.log('--- TEST 43 (B4 T18, TABLA-inventario 5 y 6; KPI-inventario 5 y 6; KANBAN-resto): Stock y Abastecimiento cablean las piezas, el servidor, las tarjetas y el tablero ---');
{
  const stock = leerFuente('app/dashboard/inventario/stock/page.tsx');
  const abasto = leerFuente('app/dashboard/inventario/abastecimiento/page.tsx');
  const piezas = leerFuente('app/dashboard/inventario/piezas-inventario.tsx');
  const WHITELIST_STOCK_TABLA = ['sku', 'producto', 'categoria', 'fisico', 'reservado', 'disponible', 'transito', 'precio', 'valorizacion'];

  for (const [nombre, f, ID, INICIAL, vistas, tarjeta] of [
    ['Stock', stock, 'ID_STOCK', 'INICIAL_STOCK', 'VISTAS_STOCK', 'tarjetasStock'],
    ['Abastecimiento', abasto, 'ID_ABASTECIMIENTO', 'INICIAL_ABASTECIMIENTO', 'VISTAS_ABASTECIMIENTO', 'tarjetasAbastecimiento'],
  ]) {
    sinDefectos(nombre, f);
    // R5 y D40: UN estado, la carga espera las preferencias (esqueleto, nunca «vacío») y en Kanban no pide la lista.
    trae(f, `const [estado, despachar, listo] = useEstadoTabla(${ID}, ${INICIAL});`, `${nombre}: el estado único`);
    trae(f, 'ruta: RUTA_STOCK, estado, conConteos: true, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,', `${nombre}: useListado`);
    trae(f, "const RUTA_STOCK = '/inventory/stock-tabla';", `${nombre}: stock-tabla (no /products)`);
    assert.ok(!/apiFetch\(\s*['"`]\/products/.test(f), `${nombre}: ya no lee /products (RP47)`);
    trae(f, "const FIJOS_" + (nombre === 'Stock' ? 'STOCK' : 'ABASTECIMIENTO') + " = { por: 'sku' };", `${nombre}: una fila por referencia`);
    trae(f, 'categoria_id: categoria || null }), [categoria]);', `${nombre}: la categoría va al servidor`);
    trae(f, `extraPorVista(estado, ${vistas}, fijos`, `${nombre}: la pestaña se traduce a estado_stock (stock-tabla no tiene vista)`);
    trae(f, 'const enKanban = estado.modo === \'kanban\';', `${nombre}: el modo es del estado`);
    // La tabla: estados de carga, error y reintento SIEMPRE conectados (nunca un vacío falso).
    const tabla = etiquetaJsx(f, '<TablaEstandar');
    for (const p of ['modo="servidor"', 'cargando={listado.cargandoInicial}', 'recargando={listado.recargando}', 'error={listado.error}',
      'onReintentar={listado.recargar}', 'aviso={listado.avisoOrden}', 'filas={listado.filas}', 'total={listado.total}', 'estado={estado}',
      'onEstado={despachar}', 'claveFila={claveDeFilaExistencia}', 'claseFila={claseDeFilaExistencia}', 'onFila={abrir}', 'vacio={vacio}',
      'preferencias={prefs}', 'anchoRef={anchoTablaRef}']) trae(tabla, p, `${nombre}: TablaEstandar ${p}`);
    trae(f, '{!enKanban && (\n              <TablaEstandar', `${nombre}: la tabla solo en Lista`);
    trae(f, 'const estadoConteos = useEstadoKpi(listado.cargandoInicial || listado.recargando, listado.error);', `${nombre}: los conteos de las pestañas`);
    // La barra: pestañas (ocultas en Kanban), conmutador, ajustes, pantalla completa, total.
    const barra = etiquetaJsx(f, '<BarraTabla');
    for (const p of ['pestanas={enKanban ? undefined : pestanas}', 'estadoConteos={estadoConteos}', 'kanbanDisponible', 'onEstado={despachar}',
      'pantallaCompleta={enKanban ? undefined : { completa, alternar }}', '{...totalDeLaBarra}', 'color="indigo"']) trae(barra, p, `${nombre}: BarraTabla ${p}`);
    trae(f, 'const totalDeLaBarra = enKanban ? {} : {', `${nombre}: «N resultados» solo en Lista`);
    trae(f, 'estadoTotal: estadoDelTotal({ total: listado.total, cargando: listado.cargandoInicial, recargando: listado.recargando, error: listado.error }),', `${nombre}: estadoTotal`);
    // El tablero solo para ver, en modo servidor, sin regla ni manejadores de cambio.
    const hook = bloqueDesde(f, 'useTableroKanban<FilaExistencia>(');
    for (const p of [`pantalla: ${ID}`, "modo: 'servidor'", 'columnas: COLUMNAS_STOCK', 'idDe: claveDeFilaExistencia', 'activo: listo && enKanban',
      'porColumna: estado.tamano', 'dependencias: [...dependenciasTablero(estado), categoria]']) trae(hook, p, `${nombre}: tablero ${p}`);
    const tablero = etiquetaJsx(f, '<TableroKanban');
    for (const p of ['tablero={tablero}', 'soloLectura={TEXTO_SOLO_VER_STOCK}', 'tarjetaDe={tarjetaExistencia}', 'onAbrir={abrir}']) trae(tablero, p, `${nombre}: TableroKanban ${p}`);
    for (const p of ['regla=', 'onCambio=', 'onAccion=', 'accionesTarjeta=']) noTrae(tablero, p, `${nombre}: el tablero es solo para ver (${p})`);
    trae(f, '{enKanban ? (\n', `${nombre}: el tablero solo en Kanban`);
    // La carga de cada columna se EJECUTA con dobles: la URL, la señal, la forma de la respuesta, la columna sin consulta y el
    // orden del hook ('sin_movimiento'), que stock-tabla rechaza con 422, NO se manda.
    {
      const llamadas = [];
      const entorno = {
        estado: estadoTablaInicial({ q: 'oso', tamano: 50, orden: '-disponible' }), fijos: { por: 'sku', categoria_id: '7' },
        RUTA_STOCK: '/inventory/stock-tabla', consultaColumnaStock: ec.consultaColumnaStock, normalizarRespuesta: (await import('../src/lib/tabla.js')).normalizarRespuesta,
        apiFetch: async (url, opciones) => { llamadas.push([url, opciones]); return { status: 'success', total: 7, data: [{ sku_id: 1 }] }; },
      };
      const cargar = cargarDe(f)(entorno);
      const respuesta = await cargar(COLUMNAS_STOCK[1], { offset: 25, limit: 25, orden: 'sin_movimiento', signal: 'SIGNAL' });
      assert.deepEqual(llamadas, [[
        '/inventory/stock-tabla?q=oso&orden=-disponible&limit=25&offset=25&por=sku&categoria_id=7&estado_stock=bajo_minimo', { signal: 'SIGNAL' },
      ]], `${nombre}: la URL de la columna y la señal`);
      assert.deepEqual([respuesta.filas, respuesta.total], [[{ sku_id: 1 }], 7], `${nombre}: la respuesta normalizada`);
      llamadas.length = 0;
      assert.deepEqual(await cargar({ estados: ['otro'] }, { offset: 0, limit: 25, signal: 'S' }), { filas: [], total: 0 });
      assert.equal(llamadas.length, 0, `${nombre}: una columna sin consulta no pide nada`);
    }
    // Tarjetas (R12): de /inventory/stats, sin respaldo local; cargando = null (nunca 0); con error, «—».
    // B4 T24 f3 (F45, D27): el cargador es useResumen (el compartido); su comportamiento (llega, falla, recarga, 403) lo prueban los
    // casos de la lib del bloque «B4 T24 f3 (F45, segunda mitad)». Aquí queda el cableado.
    trae(f, "const stats = useResumen('/inventory/stats', vueltaStats);", `${nombre}: /inventory/stats con el hook`);
    noTrae(f, 'setStats(', `${nombre}: sin la copia del cargador`);
    trae(f, 'const cargandoStats = stats.cargando;', `${nombre}: cargando mientras la vuelta no llegó`);
    trae(f, 'const estadoKpis = useEstadoKpi(cargandoStats, stats.error);', `${nombre}: el estado de las tarjetas lleva el error`);
    trae(f, '<FranjaKpis estado={estadoKpis}', `${nombre}: la franja lleva el estado`);
    trae(f, 'nota={AYUDA_MINIMO_INVENTARIO}', `${nombre}: la nota del mínimo (R10)`);
    trae(f, `import { AYUDA_MINIMO_INVENTARIO,`, `${nombre}: importa la nota`);
    trae(f, `${tarjeta}(`, `${nombre}: ${tarjeta}`);
    // Los selectores y el «Actualizar»: todo se vuelve a pedir.
    trae(f, "const { catalogo: categorias, recargar: recargarCategorias } = useCatalogo('/categories');", `${nombre}: las categorías con error y Reintentar`);
    trae(f, 'catalogo={categorias} valor={categoria}', `${nombre}: el selector de categoría`);
    trae(f, 'onCambiar={cambiarCategoria} onReintentar={recargarCategorias}', `${nombre}: Reintentar vuelve a pedir`);
    const recargar = /const recargarTodo = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/.exec(f)?.[1] ?? '';
    for (const llamada of ['recargarListado();', 'recargarTablero();', 'recargarCategorias();', 'setVueltaStats((n) => n + 1);']) trae(recargar, llamada, `${nombre}: «Actualizar» ${llamada}`);
    trae(f, 'const { recargar: recargarListado } = listado;', `${nombre}: recarga la lista`);
    trae(f, 'const { recargar: recargarTablero } = tablero;', `${nombre}: recarga el tablero`);
    trae(f, '<button type="button" onClick={recargarTodo}', `${nombre}: el botón Actualizar`);
    // Un cambio de categoría vuelve a la página 1 en el mismo evento (un solo pedido).
    // B4 T24 f4 (F39; D27): la categoría es un filtro del estado único ({tipo: 'filtro'} vuelve a la página 1 y se guarda con la sesión).
    trae(f, "despachar({ tipo: 'filtro', clave: 'categoria', valor });", `${nombre}: la categoría vuelve a la página 1`);
    noTrae(f, 'setCategoria(', `${nombre}: sin el useState de la categoría`);
    // El vacío memoizado dice qué lo deja vacío; la pantalla completa se cierra al pasar a Kanban.
    trae(f, 'const texto = textoVacioExistencias({ q: estado.q, vista: estado.vista, categoria: nombreCategoria, sinBodega: true });', `${nombre}: el vacío (UNA sola función, la del Hub: m20)`);
    trae(f, '}, [estado.q, estado.vista, nombreCategoria]);', `${nombre}: el vacío memoizado con lo que lo deja vacío`);
    trae(f, 'useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);', `${nombre}: sale de la pantalla completa`);
    trae(f, 'const { capa, claseTarjeta, refTarjeta, completa, alternar, salir } = usePantallaCompleta();', `${nombre}: desestructurado (react-hooks/refs)`);
    trae(f, '{detalle && <DetalleExistencia f={detalle} onCerrar={() => setDetalle(null)}', `${nombre}: el detalle`);
    // R26: solo se ordena por lo que stock-tabla acepta (el orden desconocido es un 422).
    const cols = columnasDe(f, nombre === 'Stock' ? 'COLUMNAS_TABLA_STOCK' : 'COLUMNAS_TABLA_ABASTECIMIENTO');
    for (const c of cols) {
      if (c.ordenable === null) continue;
      assert.ok(c.ordenable === 'true' && WHITELIST_STOCK_TABLA.includes(c.id), `${nombre}: ${c.id} no se ordena en stock-tabla`);
    }
    assert.equal(cols.filter((c) => c.flexible).length, 1, `${nombre}: UNA columna flexible`);
    for (const id of ['estado']) assert.equal(cols.find((c) => c.id === id)?.ordenable, null, `${nombre}: ${id} no se ordena`);
    assert.ok(cols.find((c) => c.id === 'categoria')?.oculta, `${nombre}: Categoría oculta por defecto (R26)`);
    // Cada tarjeta nombra SU clave (un cruce daría otro número) y ninguna escribe 0 ni «?».
    assert.ok(!/(valor|datos|conteo|total)[\w.?]*\s*(\?\?|\|\|)\s*0\b|'\?'/.test(f), `${nombre}: nunca 0 ni «?» de relleno en una cifra`);
    trae(f, '<section ref={refTarjeta} className={claseTarjeta}>', `${nombre}: la tarjeta de pantalla completa`);
    trae(f, 'const prefs = usePreferenciasTabla(', `${nombre}: UNA instancia de preferencias`);
    assert.equal(f.split('usePreferenciasTabla(').length - 1, 1, `${nombre}: usePreferenciasTabla una sola vez (D40)`);
    trae(f, 'CONTENEDOR', `${nombre}: el contenedor con pb-24`);
  }

  // Stock: 4 tarjetas, cada una con su clave; ninguna es botón.
  for (const [kpi, clave] of [['inv_fisico', 'fisico'], ['inv_reservado', 'reservado'], ['inv_disponible', 'disponible'], ['inv_en_transito', 'en_transito']]) {
    trae(stock, `<TarjetaKpi kpi="${kpi}" valor={tarjetas?.${clave}.valor ?? null} ayuda={tarjetas?.${clave}.ayuda} />`, `Stock: ${kpi} lee ${clave}`);
  }
  assert.ok(!(/<FranjaKpis[\s\S]*?<\/FranjaKpis>/.exec(stock)?.[0] ?? '').includes('onClick'), 'Stock: las tarjetas no son botones');
  trae(stock, "const INICIAL_STOCK = { vista: 'todos' };", 'Stock: arranca en Todos');
  trae(stock, 'const pestanas = pestanasExistencias(conteos);', 'Stock: las 4 pestañas');
  trae(stock, 'const tarjetas = tarjetasStock(stats.datos);', 'Stock: tarjetasStock'); // B4 T24 f3 (F45, D27)
  assert.deepEqual(columnasDe(stock, 'COLUMNAS_TABLA_STOCK').map((c) => c.id), ['sku', 'producto', 'categoria', 'fisico', 'reservado', 'disponible', 'transito', 'precio', 'estado']);
  assert.deepEqual(columnasDe(stock, 'COLUMNAS_TABLA_STOCK').filter((c) => c.oculta).map((c) => c.id), ['categoria', 'precio'], 'Stock: ocultas por defecto (R26, medido a 1024 px)');

  // Abastecimiento: pestañas RP53 (sin «Todos»), tarjetas pulsables que abren SU pestaña, pec_activos de /compras/stats con su
  // propio estado (si falla, «—» solo esa), la alerta con el número real, «Ver producto» por SKU.
  trae(abasto, "const INICIAL_ABASTECIMIENTO = { vista: 'agotado' };", 'Abastecimiento: arranca en Agotado');
  trae(abasto, "extraPorVista(estado, VISTAS_ABASTECIMIENTO, fijos, 'agotado')", 'Abastecimiento: la pestaña por defecto es Agotado');
  trae(abasto, 'const pestanas = pestanasExistencias(conteos, { conTodos: false });', 'Abastecimiento: sin «Todos» (RP53)');
  trae(abasto, 'const tarjetas = tarjetasAbastecimiento(stats.datos, compras.datos);', 'Abastecimiento: cada tarjeta con su fuente'); // F45 (D27)
  // T18 r1 (I1): las tres tarjetas de /inventory/stats son INFORMATIVAS (como inv_bajo_minimo del Hub, RP52 b): su número cuenta
  // referencias con control de inventario y la pestaña cuenta filas (33 contra 36), así que no equivalen a una vista (R12).
  for (const [kpi, clave] of [['inv_agotados', 'agotados'], ['inv_bajo_minimo', 'bajo_minimo'], ['inv_abastecidos', 'abastecidos']]) {
    trae(abasto, `<TarjetaKpi kpi="${kpi}" valor={tarjetas.${clave}.valor} ayuda={tarjetas.${clave}.ayuda} />`, `Abastecimiento: ${kpi} informativa`);
  }
  const franja = /<FranjaKpis[\s\S]*?<\/FranjaKpis>/.exec(abasto)?.[0] ?? '';
  assert.equal((franja.match(/<TarjetaKpi\b/g) ?? []).length, 4, 'Abastecimiento: cuatro tarjetas');
  for (const boton of ['onClick', 'activo=', 'elegirVista', 'aria-pressed']) assert.ok(!franja.includes(boton), `Abastecimiento: ninguna tarjeta es botón (${boton})`);
  for (const boton of ['vistaActiva', 'elegirVista', 'accionVistaEnLista']) noTrae(abasto, boton, `Abastecimiento: ya no hay ${boton}`);
  trae(abasto, 'Solo cuenta las referencias con control de inventario.', 'Abastecimiento: la alerta dice qué cuenta');
  // m11: cuando una fuente falla, lo dice y ofrece «Reintentar» (solo esa fuente).
  // B4 T24 f3 (F45, D27): «Reintentar» vuelve a pedir solo esa fuente con el hook (stats.recargar / compras.recargar).
  // r3 (C2, D27): montado siempre, con reintentando y el destino del foco (m36).
  trae(abasto, '<AvisoReintentar error={stats.error} fallo="No se pudieron cargar los indicadores de existencias" onReintentar={stats.recargar} reintentando={stats.cargando} destinoFoco="franja-abastecimiento" />', 'Abastecimiento: stats caído, con Reintentar');
  trae(abasto, '<AvisoReintentar error={compras.error} fallo="No se pudieron cargar los pedidos de compra activos" onReintentar={compras.recargar} reintentando={compras.cargando} destinoFoco="franja-abastecimiento" />', 'Abastecimiento: compras caído, con Reintentar');
  // B4 T24 f3 (F92, D27): un solo «Reintentar» para /inventory/stats (el del aviso bajo las tarjetas); la alerta «sin dato» remite a él.
  noTrae(abasto, "onClick={() => setVueltaStats((n) => n + 1)} className={`rounded font-bold underline ${FOCOS.indigo}`}>Reintentar</button>", 'Abastecimiento: la alerta «sin dato» ya no repite Reintentar');
  noTrae(abasto, 'Las tarjetas dicen cuál indicador falló.', 'Abastecimiento: la alerta no repite el aviso');
  // r1 (m11, m21, m37; D27): el aviso va SOBRE las tarjetas, y con los indicadores bien no se le culpa (textoAlertaSinDato).
  trae(abasto, "<p className=\"mt-1 text-xs font-semibold text-slate-600\">{textoAlertaSinDato(estadoKpis === 'error')}</p>", 'Abastecimiento: la alerta remite al aviso');
  trae(stock, '<AvisoReintentar error={stats.error} fallo="No se pudieron cargar las tarjetas de existencias" onReintentar={stats.recargar} reintentando={stats.cargando} destinoFoco="franja-stock" />', 'Stock: stats caído, con Reintentar'); // r3 (C2, D27)
  // m24: la insignia «Reservado» de BASE vuelve a la fila de Stock (hay unidades en bodega y nada disponible).
  trae(stock, 'celda: (f) => <CeldaEstadoExistencia f={f} /> },', 'Stock: el estado lleva «Reservado»');
  trae(stock, "existenciaReservada(f) ? ' · Reservado: hay unidades en bodega, todas comprometidas' : ''", 'Stock: el title dice Reservado');
  trae(piezas, '{existenciaReservada(f) && <span className={`${CHIP} border-amber-200 bg-amber-100 text-[10px] text-amber-800`}>Reservado</span>}', 'piezas: la insignia Reservado, solo si existenciaReservada');
  // B4 T24 (F46, D27): AvisoReintentar delega en la pieza común (AvisoDeError → AvisoFuente; casos en test_avisos.mjs).
  trae(piezas, 'return <AvisoDeError {...props} />;', 'piezas: AvisoReintentar delega en la pieza común');
  trae(abasto, '<TarjetaKpi kpi="pec_activos" valor={tarjetas.pec_activos.valor} ayuda={tarjetas.pec_activos.ayuda} estado={estadoCompras} />', 'Abastecimiento: pec_activos con su estado y sin botón');
  // B4 T24 f3 (F45, D27): /compras/stats con el mismo hook (su comportamiento, en los casos de la lib).
  trae(abasto, "const compras = useResumen('/compras/stats', vueltaCompras);", 'Abastecimiento: /compras/stats (RP94)');
  noTrae(abasto, 'setCompras(', 'Abastecimiento: sin la copia del cargador');
  trae(abasto, 'const cargandoCompras = compras.cargando;', 'Abastecimiento: cargando compras');
  trae(abasto, 'const estadoCompras = useEstadoKpi(cargandoCompras, compras.error);', 'Abastecimiento: el estado de pec_activos lleva el error');
  trae(abasto, 'setVueltaCompras((n) => n + 1);', 'Abastecimiento: «Actualizar» vuelve a pedir compras');
  trae(abasto, "const agotados = tarjetas.agotados.valor;", 'Abastecimiento: el número de la alerta es el de /inventory/stats');
  trae(abasto, 'const alerta = estadoAlertaAgotados(estadoKpis, agotados);', 'Abastecimiento: la alerta sale de su regla (estadoAlertaAgotados)');
  for (const estadoAlerta of ['cargando', 'sin_dato', 'ninguno']) trae(abasto, `{alerta === '${estadoAlerta}' && (`, `Abastecimiento: la alerta ${estadoAlerta}`);
  trae(abasto, "{alerta === 'hay' && agotados !== null && (", 'Abastecimiento: la alerta roja solo con agotados');
  assert.equal(abasto.split('min-h-[4.1rem]').length - 1, 4, 'Abastecimiento: los cuatro estados de la alerta ocupan el mismo alto (CLS)');
  assert.equal(abasto.split('className="min-h-[4.1rem] border-b border-slate-200 bg-slate-100 px-6 py-3">').length - 1, 2, 'Abastecimiento: cargando y sin dato, grises');
  trae(abasto, 'className="min-h-[4.1rem] border-b border-emerald-200 bg-emerald-50 px-6 py-3">', 'Abastecimiento: sin agotados, con su alto y sin esconderse');
  trae(abasto, 'className="min-h-[4.1rem] bg-red-50 border-b border-red-200 px-6 py-3 flex flex-wrap items-start gap-4 z-20">', 'Abastecimiento: la alerta roja, con su alto');
  // El contenedor de cada pantalla NO es un flex en columna: dentro de <main> (overflow-y-auto) encogería el SubNav a 21 px.
  for (const [nombre, f] of [['Stock', stock], ['Abastecimiento', abasto], ['Kardex', leerFuente('app/dashboard/inventario/kardex/page.tsx')],
    ['Productos', leerFuente('app/dashboard/inventario/productos/page.tsx')]]) {
    trae(f, '<div className="w-full bg-slate-50 min-h-full animate-in fade-in">', `${nombre}: el contenedor de la página`);
  }
  trae(abasto, 'href={`/dashboard/inventario/productos?sku=${encodeURIComponent(f.sku)}`}', 'Abastecimiento: «Ver producto» por SKU (stock-tabla no trae el id del producto)');
  trae(abasto, "{f.estado_stock !== 'abastecido' && (", 'Abastecimiento: «Crear PEC» solo si falta stock');
  trae(abasto, 'aria-label={`Crear un pedido de compra para ${f.sku}`}', 'Abastecimiento: acciones con aria-label');
  trae(abasto, 'aria-label={`Ver el producto de ${f.sku}`}', 'Abastecimiento: acciones con aria-label');
  noTrae(abasto, 'opacity-0 group-hover', 'Abastecimiento: las acciones no se esconden hasta el hover (teclado)');
  noTrae(abasto, 'variant="gradient"', 'Abastecimiento: sin gradiente (KPI-inventario punto 6)');
  assert.deepEqual(columnasDe(abasto, 'COLUMNAS_TABLA_ABASTECIMIENTO').map((c) => c.id), ['sku', 'producto', 'categoria', 'disponible', 'minimo', 'transito', 'estado', 'acciones']);
  assert.equal(columnasDe(abasto, 'COLUMNAS_TABLA_ABASTECIMIENTO').find((c) => c.id === 'minimo')?.ordenable, null, 'el mínimo no se ordena en stock-tabla');

  // piezas-inventario.tsx: el catálogo conserva el error y el selector lo dice con «Reintentar».
  // r2 (F81, D27): la carga del catálogo con su vuelta va en la lib (llegadaCatalogo, falloCatalogo, lecturaCatalogo; bloque de r2).
  trae(piezas, ".catch((err: unknown) => { if (!control.signal.aborted) setCatalogo((c) => falloCatalogo(c, err, vuelta)); });", 'useCatalogo: el error se conserva');
  trae(piezas, 'setCatalogo((c) => llegadaCatalogo(c, r, vuelta));', 'useCatalogo: llega bien');
  trae(piezas, '}, [ruta, vuelta]);', 'useCatalogo: se vuelve a pedir con la vuelta');
  trae(piezas, 'const recargar = useCallback(() => setVuelta((n) => n + 1), []);', 'useCatalogo: recargar sube la vuelta');
  trae(piezas, 'if (catalogo.error && !catalogo.filas) {', 'SelectorCatalogo: la rama del error');
  trae(piezas, 'role="alert"', 'SelectorCatalogo: el error se anuncia');
  trae(piezas, '{textoDeError(catalogo.error, fallo)}', 'SelectorCatalogo: el detalle del servidor tal cual');
  // r1 (F81, D27): «Reintentar» da señal mientras pide (aria-disabled, «Reintentando…»).
  trae(piezas, '<button type="button" onClick={catalogo.cargando ? undefined : onReintentar} aria-disabled={catalogo.cargando || undefined} className={`rounded font-bold underline ${FOCOS[acento]}`}>{catalogo.cargando ? \'Reintentando…\' : \'Reintentar\'}</button>', 'SelectorCatalogo: «Reintentar» vuelve a pedir');
  trae(piezas, 'disabled={!catalogo.filas}', 'SelectorCatalogo: deshabilitado mientras carga');
  trae(piezas, '<option value="">{catalogo.filas ? todas : cargando}</option>', 'SelectorCatalogo: «Cargando…» mientras carga');
  // B4 T24 (F44-a, D27): la reserva es el token RESERVA_BOTON_IA (pb-24) de design-system.ts.
  trae(piezas, "export const CONTENEDOR = `flex-1 flex flex-col px-4 xl:px-8 pt-6 ${RESERVA_BOTON_IA} max-w-[1600px] mx-auto w-full min-w-0 gap-6`;", 'el contenedor deja libre la esquina del botón de la IA (pb-24)');
  trae(piezas, "['Costo', numeroFinito(f.costo) !== null && Number(f.costo) > 0 ? pesos(f.costo) : 'Sin costo registrado'],", 'el detalle: un costo 0 es «sin costo» (RP91)');
  // B4 T24 (FINAL-m25, D27): FOCOS es el común de design-system.ts (outline-offset-2: se ve también sobre fondos oscuros).
  trae(piezas, "import { FOCOS, RESERVA_BOTON_IA, TABLE, type AcentoFoco } from '@/lib/design-system';", 'el foco visible es el común (r1, m25: el import, no el export; F44-a, D27: con la reserva)');
  sinDefectos('piezas-inventario', piezas);
  // T18 r1 (m10, m21): el Hub de T17 IMPORTA las piezas de aquí y ya no las copia.
  const hub = leerFuente('app/dashboard/inventario/page.tsx');
  assert.equal(hub.split("} from './piezas-inventario';").length - 1, 2, 'el Hub importa de piezas-inventario.tsx (los valores y los tipos)');
  trae(hub, 'claseDeFilaExistencia as claseDeFilaStock, claveDeFilaExistencia as claveDeFilaStock', 'el Hub usa la clave y la clase de la fuente única');
  for (const copia of ['function CeldaProducto', 'function CeldaEstadoStock', 'function SelectorCatalogo', 'function DetalleExistencia', 'const infoStock', 'const pesos', 'const CONTENEDOR']) noTrae(hub, copia, `el Hub ya no copia ${copia}`);
  assert.ok(!/textoVacioStock/.test(sinComentarios(stock + abasto)) && !('textoVacioStock' in ec), 'textoVacioStock no existe: el vacío es textoVacioExistencias');
}

console.log('--- TEST 44 (B4 T18, TABLA-inventario punto 8; KANBAN-resto; RP54): el Kardex cablea las piezas, UN pedido por cambio de filtro, los errores y el tablero ---');
{
  const k = leerFuente('app/dashboard/inventario/kardex/page.tsx');
  sinDefectos('Kardex', k);
  const { normalizarRespuesta } = await import('../src/lib/tabla.js');
  // R5 y D40: UN estado; la carga espera las preferencias y en Kanban no pide la lista. El Kardex no tiene q, conteos ni orden.
  trae(k, 'const [estado, despachar, listo] = useEstadoTabla(ID_KARDEX, INICIAL_KARDEX);', 'el estado único');
  trae(k, 'ruta: RUTA_KARDEX, estado, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,', 'useListado');
  trae(k, "const RUTA_KARDEX = '/inventory/kardex';", 'la ruta');
  noTrae(k, 'conConteos', 'el Kardex no tiene conteos');
  trae(k, 'const extraLista = useMemo(() => ({ ...extraKardex(filtros), q: null, orden: null }), [filtros]);', 'los filtros al servidor, sin q ni orden');
  // La doble carga (el bug de hoy): el filtro y la página cambian EN EL MISMO evento, por UN solo camino.
  // B4 T24 f4 (F39; D27): el filtro y la página cambian en el mismo evento por la acción {tipo: 'filtro'} del estado único.
  trae(k, 'for (const accion of accionesDeFiltros(cambio)) despachar(accion);', 'cambiarFiltros cambia el filtro y la página a la vez');
  assert.equal(k.split('accionesDeFiltros(').length - 1, 1, 'solo cambiarFiltros escribe los filtros');
  assert.ok(!/setPage|useState\(0\)|pageSize/.test(k), 'ya no hay una página aparte del estado único');
  assert.equal(k.split('useEffect(').length - 1, 2, 'dos efectos: la búsqueda del SKU y salir de la pantalla completa (ninguno pide la lista)');
  for (const filtro of ['bodega', 'direccion', 'propietario', 'desde', 'hasta']) {
    trae(k, `cambiarFiltros({ ${filtro}`, `el filtro ${filtro} pasa por cambiarFiltros`);
  }
  // B4 T24 f4 (F39; D27): con la etiqueta del SKU, que vuelve con la sesión.
  trae(k, 'cambiarFiltros({ skuId: o.id, skuEtiqueta: etiqueta });', 'elegir un SKU');
  trae(k, "if (filtros.skuId !== null) cambiarFiltros({ skuId: null, skuEtiqueta: '' });", 'escribir de nuevo suelta el SKU (una sola vez)');
  trae(k, 'cambiarFiltros(SIN_FILTROS);', 'quitar los filtros');
  // La búsqueda del SKU: con su error dicho, sin resultados viejos y limpia al salir.
  trae(k, ".catch((err: unknown) => { if (!control.signal.aborted) setSkuBusqueda({ texto: skuTexto, filas: [], error: err }); });", 'la búsqueda del SKU dice su error');
  trae(k, 'return () => { clearTimeout(pausa); control.abort(); };', 'la búsqueda se limpia');
  trae(k, 'const resultadosSku = buscarSku && skuBusqueda?.texto === skuTexto ? skuBusqueda : null;', 'nunca resultados de otro texto');
  trae(k, "{textoDeError(resultadosSku.error, 'No se pudo buscar el producto')}", 'el detalle del servidor tal cual');
  // B4 T24 f3 (F88, D27): antes del error, «Buscando…» mientras la respuesta no llega; el error sigue viéndose en lugar de la lista.
  trae(k, ') : resultadosSku.error ? (', 'el error se ve en lugar de la lista');
  trae(k, "useCatalogo('/inventory/warehouses')", 'las bodegas con su error y Reintentar');
  trae(k, 'onReintentar={recargarBodegas}', 'Reintentar vuelve a pedir las bodegas');
  // La tabla y la barra.
  const tabla = etiquetaJsx(k, '<TablaEstandar');
  for (const p of ['modo="servidor"', 'cargando={listado.cargandoInicial}', 'recargando={listado.recargando}', 'error={listado.error}', 'onReintentar={listado.recargar}',
    'aviso={listado.avisoOrden}', 'filas={listado.filas}', 'total={listado.total}', 'estado={estado}', 'onEstado={despachar}', 'onFila={abrir}', 'vacio={vacio}',
    'preferencias={prefs}', 'anchoRef={anchoTablaRef}']) trae(tabla, p, `TablaEstandar ${p}`);
  trae(k, '{!enKanban && (\n              <TablaEstandar', 'la tabla solo en Lista');
  const barra = etiquetaJsx(k, '<BarraTabla');
  for (const p of ['buscar={false}', 'kanbanDisponible', 'pantallaCompleta={enKanban ? undefined : { completa, alternar }}', '{...totalDeLaBarra}']) trae(barra, p, `BarraTabla ${p}`);
  noTrae(barra, 'pestanas=', 'el Kardex no tiene pestañas');
  trae(k, 'const totalDeLaBarra = enKanban ? {} : {', '«N resultados» solo en Lista');
  // El orden: el servidor ordena siempre por fecha y NO acepta `orden`: ninguna columna lo promete.
  const cols = columnasDe(k, 'COLUMNAS_TABLA_KARDEX');
  assert.deepEqual(cols.map((c) => c.id), ['fecha', 'direccion', 'producto', 'bodega', 'cantidad', 'propietario', 'documento', 'costo', 'usuario']);
  assert.deepEqual(cols.filter((c) => c.ordenable !== null), [], 'get_kardex no tiene `orden`: ningún título ordena');
  // m1: la barra DICE el orden fijo.
  trae(k, "const TEXTO_ORDEN_KARDEX = 'Del más reciente al más antiguo';", 'el texto del orden fijo');
  trae(k, 'Orden: {TEXTO_ORDEN_KARDEX}', 'la barra dice el orden');
  // m14: sin códigos crudos en la celda, la tarjeta ni el detalle (el propietario y el tipo de operación llevan su etiqueta).
  assert.ok(!/m\.owner \|\| 'NEBULAE'/.test(k) && k.split('etiquetaPropietario(m.owner)').length - 1 === 3, 'el propietario con su etiqueta (celda, title y detalle)');
  assert.deepEqual(cols.filter((c) => c.oculta).map((c) => c.id), ['costo', 'usuario'], 'ocultas por defecto (R26, medido a 1024 px)');
  assert.equal(cols.filter((c) => c.flexible).length, 1);
  // El día y la hora son de Colombia (created_at es UTC sin zona), no del navegador.
  assert.ok(!/toLocale/.test(k), 'sin toLocaleString (el navegador leería el UTC sin zona 5 horas corrido)');
  trae(k, 'textoFechaMovimiento(m.created_at)', 'la fecha de Colombia');
  // Las direcciones del filtro son TODAS las del Kardex, y las columnas del tablero salen de la lib.
  // B4 T24 f3 (F88, D27): el orden sale de la lib (Object.keys(DIRECCIONES_KARDEX)): cada dirección, sin repetir sus claves a mano.
  trae(k, 'const ORDEN_DIRECCIONES = Object.keys(DIRECCIONES_KARDEX);', 'el filtro ofrece cada dirección');
  trae(k, 'DIRECCIONES_KARDEX[d].label', 'la etiqueta de cada dirección');
  // El tablero solo para ver, en modo servidor.
  const hook = bloqueDesde(k, 'useTableroKanban<Movimiento>(');
  for (const p of ['pantalla: ID_KARDEX', "modo: 'servidor'", 'columnas: COLUMNAS_KARDEX', 'activo: listo && enKanban', 'porColumna: estado.tamano', 'dependencias,']) trae(hook, p, `tablero ${p}`);
  trae(k, 'const dependencias = [filtros.skuId, filtros.bodega, filtros.propietario, filtros.direccion, filtros.desde, filtros.hasta];', 'el tablero recarga con CADA filtro');
  const tablero = etiquetaJsx(k, '<TableroKanban');
  for (const p of ['tablero={tablero}', 'soloLectura={TEXTO_SOLO_VER_KARDEX}', 'tarjetaDe={tarjetaMovimiento}', 'onAbrir={abrir}']) trae(tablero, p, `TableroKanban ${p}`);
  for (const p of ['regla=', 'onCambio=', 'onAccion=', 'accionesTarjeta=']) noTrae(tablero, p, `el tablero es solo para ver (${p})`);
  trae(k, 'const direccionSoloLista = filtros.direccion !== \'\' && COLUMNAS_KARDEX.every((c) => direccionesDeColumnaKardex(c, filtros.direccion).length === 0);', 'avisa cuando el filtro de dirección deja vacío el tablero');
  // La carga de cada columna se EJECUTA con dobles.
  {
    const llamadas = [];
    const entorno = {
      estado: estadoTablaInicial({ q: 'x', tamano: 50, pagina: 3, orden: '-fecha' }), RUTA_KARDEX: '/inventory/kardex',
      filtros: { skuId: 12, bodega: '', propietario: '', direccion: '', desde: '', hasta: '' },
      consultaColumnaKardex: ec.consultaColumnaKardex, normalizarRespuesta,
      apiFetch: async (url, opciones) => { llamadas.push([url, opciones]); return { status: 'success', data: { total: 40, limit: 25, offset: 0, items: [{ id: 1 }] } }; },
    };
    const cargar = cargarDe(k)(entorno);
    const respuesta = await cargar(ec.COLUMNAS_KARDEX[0], { offset: 25, limit: 25, orden: 'sin_movimiento', signal: 'SIGNAL' });
    assert.deepEqual(llamadas, [['/inventory/kardex?limit=25&offset=25&sku_id=12&direction=IN,ADJUST_IN,TRANSFER_IN', { signal: 'SIGNAL' }]], 'la URL de la columna y la señal');
    assert.deepEqual([respuesta.filas, respuesta.total], [[{ id: 1 }], 40], 'la respuesta {data: {items, total}} (RP54)');
    llamadas.length = 0;
    await cargar(ec.COLUMNAS_KARDEX[1], { offset: 0, limit: 0, signal: 'S' });
    assert.match(llamadas[0][0], /^\/inventory\/kardex\?limit=1&/, 'una plegada pide limit=1 (get_kardex tiene limit >= 1)');
    llamadas.length = 0;
    const filtrado = cargarDe(k)({ ...entorno, filtros: { ...entorno.filtros, direccion: 'QUARANTINE' } });
    assert.deepEqual(await filtrado(ec.COLUMNAS_KARDEX[0], { offset: 0, limit: 25, signal: 'S' }), { filas: [], total: 0 });
    assert.equal(llamadas.length, 0, 'una dirección que no es de la columna no pide nada');
  }
  trae(k, 'const recargarTodo = useCallback(() => {\n    recargarListado();\n    recargarTablero();\n    recargarBodegas();\n  }, [recargarListado, recargarTablero, recargarBodegas]);', '«Actualizar» vuelve a pedir la lista, el tablero y las bodegas');
  trae(k, '<button type="button" onClick={recargarTodo}', 'el botón Actualizar');
  trae(k, 'const texto = textoVacioKardex(hayFiltros);', 'el vacío dice qué lo deja vacío');
  trae(k, '}, [hayFiltros]);', 'el vacío memoizado');
  trae(k, 'useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);', 'sale de la pantalla completa');
  assert.equal(k.split('usePreferenciasTabla(').length - 1, 1, 'usePreferenciasTabla una sola vez (D40)');
  trae(k, '{detalle && <DetalleMovimiento m={detalle} onCerrar={() => setDetalle(null)} />}', 'el detalle');
  trae(k, 'CONTENEDOR', 'el contenedor con pb-24');
}

console.log('--- TEST 45 (B4 T18, TABLA-inventario punto 7; KANBAN-resto; RP47 a RP49): Productos cablea las piezas, el servidor, los filtros de B3-T8, el enlace y el tablero por categoría ---');
{
  const p = leerFuente('app/dashboard/inventario/productos/page.tsx');
  // (El envoltorio apiFetch de la ficha, de B1 a B3, lee el cuerpo de un error con .json().catch(() => ({})): no traga el error.)
  sinDefectos('Productos', p.replace(/async function apiFetch[\s\S]*?\n}\n/, ''), { sinAny: false });
  const { normalizarRespuesta } = await import('../src/lib/tabla.js');
  // RP47: el buscador filtra (q, no search), la página es del estado y /products recibe SIEMPRE limit y offset.
  trae(p, 'const [estado, despachar, listo] = useEstadoTabla(ID_PRODUCTOS, INICIAL_PRODUCTOS);', 'el estado único');
  trae(p, "ruta: '/products', estado, esperar: !listo, despachar, activo: !enKanban, extra: extraLista,", 'useListado sobre /products');
  trae(p, 'const extraLista = useMemo(() => ({ ...extraProductos(filtros), vista: null }), [filtros]);', 'los filtros de la barra al servidor');
  assert.ok(!/params\.set\('search'|limit=100|setProducts|setTotal/.test(sinComentarios(p)), 'ya no hay búsqueda en el navegador ni limit=100');
  assert.ok(!/\.filter\(\s*sinTarifaIva\s*\)/.test(sinComentarios(p)), 'RP48: «Sin tarifa de IVA» ya no filtra en el navegador');
  // B3-T8 (RP48): los dos filtros siguen, como filtros de la barra, y cada cambio vuelve a la página 1 en el mismo evento.
  trae(p, 'aria-pressed={filtros.revision} onClick={() => cambiarFiltros({ revision: !filtros.revision })}', 'Requiere revisión');
  trae(p, 'aria-pressed={filtros.sinTarifa} onClick={() => cambiarFiltros({ sinTarifa: !filtros.sinTarifa })}', 'Sin tarifa de IVA');
  assert.match(p, /Requiere revisión\s*<\/button>/);
  assert.match(p, /Sin tarifa de IVA\s*<\/button>/);
  // B4 T24 f4 (F39; D27): por la acción {tipo: 'filtro'} del estado único (el filtro y la página, en el mismo evento).
  trae(p, 'for (const accion of accionesDeFiltros(cambio)) despachar(accion);', 'cambiarFiltros cambia el filtro y la página a la vez');
  assert.equal(p.split('accionesDeFiltros(').length - 1, 1, 'solo cambiarFiltros escribe los filtros');
  // Lo de B3-T8 en la ficha se conserva: el selector de IVA, el guardado y la insignia de la tabla.
  trae(p, 'id="producto-tarifa-iva"', 'B3-T8: el selector de IVA de la ficha');
  trae(p, '{TARIFAS_IVA.map(t => <option key={t.codigo} value={t.codigo}>{t.etiqueta}</option>)}', 'B3-T8: las tarifas');
  trae(p, 'tarifa_iva: form.tarifa_iva || null,', 'B3-T8: el guardado de la tarifa');
  trae(p, "tarifa_iva: normalizarTarifaIva(p.tarifa_iva) ?? '',", 'B3-T8: la ficha lee la tarifa');
  trae(p, "<Badge tone={sinTarifaIva(p) ? 'warning' : 'neutral'}>{etiquetaTarifaCatalogo(p.tarifa_iva)}</Badge>", 'B3-T8: la insignia de la tarifa en la tabla');
  trae(p, "{p.necesita_revision && <Badge tone=\"warning\">Requiere revisión</Badge>}", 'B3-T8: la insignia de la revisión en la tabla');
  trae(p, 'avisarError(err, \'No se pudo guardar el producto\');', 'B3-T8: el 422 de la tarifa se dice');
  // Guardar vuelve a pedir lo que se ve (la lista y el tablero), no solo la lista.
  const guardar = bloqueDesde(p, 'async function saveProduct(');
  trae(guardar, 'recargarTodo();', 'guardar recarga');
  const recargar = /const recargarTodo = useCallback\(\(\) => \{([\s\S]*?)\n  \}, \[/.exec(p)?.[1] ?? '';
  for (const llamada of ['recargarListado();', 'recargarTablero();', 'recargarCategorias();', 'recargarMarcas();', 'recargarBodegas();']) trae(recargar, llamada, `recargarTodo ${llamada}`);
  trae(p, 'const { recargar: recargarListado } = listado;', 'recarga la lista');
  trae(p, 'const { recargar: recargarTablero } = tablero;', 'recarga el tablero');
  // Los catálogos con su error (antes, tres .catch(() => {})).
  trae(p, "useCatalogo('/categories')", 'categorías');
  trae(p, "useCatalogo('/brands')", 'marcas');
  trae(p, "useCatalogo('/inventory/warehouses')", 'bodegas');
  for (const [catalogo, fallo, recargarX] of [['categorias', 'las categorías', 'recargarCategorias'], ['marcas', 'las marcas', 'recargarMarcas'], ['bodegas', 'las bodegas', 'recargarBodegas']]) {
    trae(p, `<AvisoCatalogo catalogo={${catalogo}} fallo="No se pudieron cargar ${fallo}" onReintentar={${recargarX}} />`, `${catalogo}: el aviso con Reintentar`);
  }
  trae(p, 'if (!catalogo.error || catalogo.filas) return null;', 'AvisoCatalogo solo con error y sin datos');
  trae(p, '<button type="button" onClick={onReintentar} className={`rounded font-bold underline ${FOCOS.purple}`}>Reintentar</button>', 'AvisoCatalogo: «Reintentar» vuelve a pedir');
  trae(p, '{textoDeError(catalogo.error, fallo)}.{\' \'}', 'AvisoCatalogo dice el detalle del servidor');
  // La tabla y la barra.
  const tabla = etiquetaJsx(p, '<TablaEstandar');
  for (const q of ['modo="servidor"', 'cargando={listado.cargandoInicial}', 'recargando={listado.recargando}', 'error={listado.error}', 'onReintentar={listado.recargar}',
    'aviso={listado.avisoOrden}', 'filas={listado.filas}', 'total={listado.total}', 'estado={estado}', 'onEstado={despachar}', 'onFila={openEdit}', 'vacio={vacio}',
    'preferencias={prefs}', 'anchoRef={anchoTablaRef}']) trae(tabla, q, `TablaEstandar ${q}`);
  trae(p, '{!enKanban && (\n                <TablaEstandar', 'la tabla solo en Lista');
  const barra = etiquetaJsx(p, '<BarraTabla');
  for (const q of ['kanbanDisponible', 'pantallaCompleta={enKanban ? undefined : { completa, alternar }}', '{...totalDeLaBarra}', 'onEstado={despachar}']) trae(barra, q, `BarraTabla ${q}`);
  trae(p, 'const totalDeLaBarra = enKanban ? {} : {', '«N resultados» solo en Lista');
  trae(p, 'const texto = textoVacioProductos({ q: estado.q, revision: filtros.revision, sinTarifa: filtros.sinTarifa, categoria: nombreCategoria });', 'el vacío');
  trae(p, '}, [estado.q, filtros.revision, filtros.sinTarifa, nombreCategoria]);', 'el vacío memoizado con lo que lo deja vacío');
  // m4: la barra tiene el selector de categoría (category_id al servidor, página 1) para poder seguir el aviso «N categorías más».
  trae(p, 'type FiltrosProductos = { revision: boolean; sinTarifa: boolean; categoria: string };', 'la categoría es un filtro de la barra');
  trae(p, "const SIN_FILTROS: FiltrosProductos = { revision: false, sinTarifa: false, categoria: '' };", 'sin categoría al empezar');
  trae(p, 'onCambiar={(categoria) => cambiarFiltros({ categoria })} onReintentar={recargarCategorias} icono={Layers} acento="purple" />', 'el selector de categoría de la barra, con Reintentar');
  trae(p, 'catalogo={categorias} valor={filtros.categoria}', 'el selector lee el catálogo y el filtro');
  // m23 (regresión de la ficha): abre con las claves REALES de /products, no con las viejas (sale_price, cost_price, is_published).
  trae(p, "sale_price: p.precio_venta ?? '', cost_price: p.costo ?? '',", 'la ficha abre con el precio y el costo reales');
  trae(p, "is_published: p.publicado ?? false,", 'la ficha abre con publicado');
  trae(p, 'setIsPublished(p.publicado ?? false);', 'el interruptor de E-Commerce abre con publicado');
  assert.ok(!/p\.sale_price|p\.cost_price|p\.is_published/.test(sinComentarios(p)), 'ninguna lectura de las claves viejas de /products');
  trae(p, 'title="Catálogo de Productos"', 'el título con tilde');
  trae(p, 'useEffect(() => { if (enKanban) salir(); }, [enKanban, salir]);', 'sale de la pantalla completa');
  assert.equal(p.split('usePreferenciasTabla(').length - 1, 1, 'usePreferenciasTabla una sola vez (D40)');
  // /products solo ordena por nombre, creado y tipo; Precio, Costo y Publicado son el dato del SKU (precio_venta, costo, publicado).
  const cols = columnasDe(p, 'COLUMNAS_TABLA_PRODUCTOS');
  assert.deepEqual(cols.map((c) => [c.id, c.ordenable]), [['producto', "'nombre'"], ['tipo', 'true'], ['categoria', null], ['precio', null], ['costo', null], ['publicado', null], ['activo', null]]);
  assert.deepEqual(cols.filter((c) => c.oculta).map((c) => c.id), ['categoria'], 'ocultas por defecto (R26, medido a 1024 px)');
  assert.equal(cols.filter((c) => c.flexible).length, 1);
  trae(p, 'precioDeProducto(p)', 'Precio: precio_venta del SKU');
  trae(p, 'costoDeProducto(p)', 'Costo: costo del SKU, 0 es sin costo (RP91)');
  trae(p, 'p.publicado', 'E-Commerce: publicado');
  assert.ok(!/p\.sale_price|p\.cost_price|p\.is_published/.test(p.slice(0, p.indexOf('function openEdit'))), 'la tabla no lee sale_price, cost_price ni is_published (/products no los trae)');
  // RP49: el enlace ?id= (y ?sku=) pide el producto al servidor; la marca se pone cuando la respuesta LLEGÓ.
  // B4 T24 f3 (B40-f, D27): el error del enlace queda en errorEnlace (AvisoDeError con «Reintentar») y la vuelta del reintento va en las deps.
  // B4 T24 f3 r1 (m18, D27): el efecto vive en la lib (abrirEnlaceProducto: la marca cuando llegó, alError con el error o null) y la carga
  // se lee con estadoReintento; los dos se EJECUTAN en el bloque de r1. Aquí, el cableado.
  const efecto = /const enlaceAtendido = useRef[^\n]*\n([\s\S]*?)\}\), \[idDeLaUrl, skuDeLaUrl, avisar, vueltaEnlace\]\);/.exec(p)?.[1] ?? '';
  assert.match(efecto, /useEffect\(\(\) => abrirEnlaceProducto\(\{\s*marca: enlaceAtendido, idDeLaUrl, skuDeLaUrl, pedir: _apiFetch,/);
  assert.match(efecto, /alError: \(error\) => setEnlace\(\{ vuelta: vueltaEnlace, error \}\),/);
  trae(p, 'const cargaEnlace = estadoReintento(enlace, vueltaEnlace);');
  trae(p, '<AvisoDeError error={cargaEnlace.error} fallo="No se pudo abrir el producto del enlace" acento="purple" reintentando={cargaEnlace.reintentando}', 'el error del enlace, a la vista');
  // f4 (m3 = m9 de f3 r3; D27): y un 403 o el «no existe» llevan el foco a la lista (destinoFoco).
  trae(p, 'onReintentar={() => setVueltaEnlace((n) => n + 1)} destinoFoco="productos-lista" />', 'Reintentar vuelve a pedir (la marca sigue libre); r3: el éxito lleva el foco al título de la ficha');
  trae(p, "if (searchParams.get('id') || searchParams.get('sku')) router.replace(pathname);", 'cerrar la ficha limpia el enlace (id y sku)');
  // El tablero solo para ver, por categoría (12 como máximo, con su aviso), en modo servidor.
  const hook = bloqueDesde(p, 'useTableroKanban<Producto>(');
  for (const q of ['pantalla: ID_PRODUCTOS', "modo: 'servidor'", 'columnas: columnasTablero', 'activo: listo && enKanban && categorias.filas !== null', 'porColumna: estado.tamano',
    'dependencias: [...dependenciasTablero(estado), filtros.revision, filtros.sinTarifa, filtros.categoria]']) trae(hook, q, `tablero ${q}`);
  // r1 (F93, D27): con la categoría elegida (solo su columna); lo fija el bloque de r1.
  trae(p, '() => columnasProductos(categorias.filas, undefined, { elegida: filtros.categoria }), [categorias.filas, filtros.categoria]);', 'las columnas salen de /categories (máximo 12)');
  const tablero = etiquetaJsx(p, '<TableroKanban');
  for (const q of ['tablero={tablero}', 'soloLectura={TEXTO_SOLO_VER_PRODUCTOS}', 'tarjetaDe={tarjetaProducto}', 'onAbrir={openEdit}', 'aviso={avisoCategorias']) trae(tablero, q, `TableroKanban ${q}`);
  for (const q of ['regla=', 'onCambio=', 'onAccion=', 'accionesTarjeta=']) noTrae(tablero, q, `el tablero es solo para ver (${q})`);
  // Sin categorías no hay columnas: se dice (cargando, con error y «Reintentar», o vacío), nunca un tablero vacío falso.
  trae(p, 'categorias.filas === null ? (\n                categorias.error ? (', 'cargando o con error');
  trae(p, "{textoDeError(categorias.error, 'No se pudieron cargar las categorías')}", 'el error de las categorías en el tablero');
  trae(p, '<button type="button" onClick={recargarCategorias}', '«Reintentar» las categorías');
  trae(p, ') : columnasTablero.length === 0 ? (', 'sin categorías');
  // La carga de cada columna se EJECUTA con dobles.
  {
    const llamadas = [];
    const columna = ec.columnasProductos([{ id: 7, name: 'Peluches' }]).columnas[0];
    const entorno = {
      estado: estadoTablaInicial({ q: 'oso', tamano: 50, orden: '-nombre' }), filtros: { revision: true, sinTarifa: false },
      consultaColumnaProducto: ec.consultaColumnaProducto, normalizarRespuesta,
      _apiFetch: async (url, opciones) => { llamadas.push([url, opciones]); return { status: 'success', total: 3, data: [{ id: 5 }] }; },
    };
    const cargar = cargarDe(p)(entorno);
    const respuesta = await cargar(columna, { offset: 25, limit: 25, orden: 'sin_movimiento', signal: 'SIGNAL' });
    assert.deepEqual(llamadas, [['/products?q=oso&orden=-nombre&limit=25&offset=25&necesita_revision=1&category_id=7', { signal: 'SIGNAL' }]], 'la URL de la columna y la señal');
    assert.deepEqual([respuesta.filas, respuesta.total], [[{ id: 5 }], 3], 'la respuesta paginada de /products');
    llamadas.length = 0;
    assert.deepEqual(await cargar({ estados: ['abc'] }, { offset: 0, limit: 25, signal: 'S' }), { filas: [], total: 0 });
    assert.equal(llamadas.length, 0, 'una columna sin consulta no pide nada');
    await cargar(columna, { offset: 0, limit: 0, signal: 'S' });
    assert.match(llamadas[0][0], /limit=0&offset=0&/, 'una plegada pide limit=0 con offset=0 (sin offset, /products devuelve todo)');
  }
  trae(p, 'CONTENEDOR', 'el contenedor con pb-24');
}

console.log('--- TEST 46 (B4 T19; TABLA-inventario punto 11, KANBAN-resto, KPI-inventario punto 9; RP96): lo puro de Ajustes ---');
{
  const aju = (id, direccion, extra = {}) => ({
    id, operation_type: 'ADJUSTMENT', status: 'DONE', source_warehouse_id: null, dest_warehouse_id: 3, notas: 'Conteo fisico',
    fecha: '2026-11-03T15:30:00Z', movements: direccion === undefined ? [] : [{ id: 1, sku_id: 9, quantity: 4, direction: direccion }], ...extra,
  });
  // La dirección de un ajuste es la de su PRIMER movimiento, con los grupos del Kardex (RP96): entrada = IN, ADJUST_IN y TRANSFER_IN;
  // salida = OUT, ADJUST_OUT y TRANSFER_OUT. Cualquier otra, o sin movimientos, no es ninguna de las dos.
  for (const d of ['IN', 'ADJUST_IN', 'TRANSFER_IN']) assert.equal(ec.direccionDeAjuste(aju(1, d)), 'entrada', d);
  for (const d of ['OUT', 'ADJUST_OUT', 'TRANSFER_OUT']) assert.equal(ec.direccionDeAjuste(aju(1, d)), 'salida', d);
  for (const d of ['QUARANTINE', 'SCRAP', 'RETURN_IN', null, '']) assert.equal(ec.direccionDeAjuste(aju(1, d)), null, String(d));
  assert.equal(ec.direccionDeAjuste(aju(1)), null, 'sin movimientos');
  assert.equal(ec.direccionDeAjuste({ movements: [{ direction: 'ADJUST_OUT' }, { direction: 'IN' }] }), 'salida', 'solo cuenta el primero');
  assert.equal(ec.direccionDeAjuste(null), null);
  // Los grupos son los del Kardex (una sola fuente): las columnas del tablero de Ajustes salen de COLUMNAS_KARDEX.
  assert.deepEqual(ec.COLUMNAS_AJUSTE.map((c) => [c.clave, c.titulo, c.cerrada]), [['entrada', 'Entradas', false], ['salida', 'Salidas', false]]);
  assert.deepEqual(ec.GRUPOS_AJUSTE, { entrada: [...ec.COLUMNAS_KARDEX[0].estados], salida: [...ec.COLUMNAS_KARDEX[1].estados] });
  assert.ok(Object.isFrozen(ec.COLUMNAS_AJUSTE) && Object.isFrozen(ec.GRUPOS_AJUSTE));
  // El número (AJU-0012 como _numero_operacion del servidor), la fecha real, la bodega, la cantidad y el producto.
  assert.equal(ec.numeroAjuste({ id: 12 }), 'AJU-0012');
  assert.equal(ec.numeroAjuste({ id: 12345 }), 'AJU-12345');
  assert.equal(ec.textoFechaAjuste(aju(1, 'IN')), '3 nov 2026');
  assert.equal(ec.textoFechaAjuste(aju(1, 'IN', { fecha: null })), '—');
  assert.equal(ec.textoFechaAjuste(aju(1, 'IN', { fecha: '2026-11-04T03:00:00Z' })), '3 nov 2026', 'el día de Colombia, no el UTC');
  assert.equal(ec.bodegaDeAjuste(aju(1, 'IN')), 3);
  assert.equal(ec.bodegaDeAjuste(aju(1, 'OUT', { dest_warehouse_id: null, source_warehouse_id: 8 })), 8);
  assert.equal(ec.bodegaDeAjuste(aju(1, 'OUT', { dest_warehouse_id: null })), null);
  assert.equal(ec.cantidadDeAjuste(aju(1, 'IN')), 4);
  assert.equal(ec.cantidadDeAjuste(aju(1)), null, 'sin movimientos: —, no 0');
  assert.equal(ec.cantidadDeAjuste({ movements: [{ quantity: '2.5' }] }), 2.5);
  assert.equal(ec.skuDeAjuste(aju(1, 'IN')), 'SKU #9');
  assert.equal(ec.skuDeAjuste(aju(1)), '—');
  assert.equal(ec.motivoDeAjuste(aju(1, 'IN')), 'Conteo fisico');
  assert.equal(ec.motivoDeAjuste(aju(1, 'IN', { notas: '  ' })), '—');
  // La insignia de la dirección: Entrada (verde), Salida (roja); sin dirección, gris, nunca el código.
  assert.deepEqual(ec.infoDireccionAjuste('entrada').label, 'Entrada');
  assert.deepEqual(ec.infoDireccionAjuste('salida').label, 'Salida');
  assert.equal(ec.infoDireccionAjuste('entrada').signo, '+');
  assert.equal(ec.infoDireccionAjuste('salida').signo, '-');
  assert.equal(ec.infoDireccionAjuste(null).label, 'Sin dirección');
  assert.notEqual(ec.infoDireccionAjuste('entrada').clases, ec.infoDireccionAjuste('salida').clases);

  // Las vistas (pestañas): Todos · Entradas · Salidas, con el parámetro `direccion` del servidor. `vista` va en null (el endpoint no la tiene).
  const e = (parcial = {}) => estadoTablaInicial({ vista: 'todos', ...parcial });
  assert.deepEqual(ec.consultaAjustes(e()), { operation_type: 'ADJUSTMENT', vista: null, semaforo: null, paso: null, estados: null, status: null, direccion: null });
  assert.equal(ec.consultaAjustes(e({ vista: 'entradas' })).direccion, 'entrada');
  assert.equal(ec.consultaAjustes(e({ vista: 'salidas' })).direccion, 'salida');
  assert.equal(ec.consultaAjustes(e({ vista: 'otra' })).direccion, null, 'una pestaña que no existe: Todos');
  assert.equal(ec.consultaAjustes(e({ vista: 'entradas', estados: ['DONE'] })).estados, null, 'Ajustes no filtra por estado');
  // El tablero en modo servidor: una consulta por columna con SU dirección, la búsqueda del MISMO estado y los más recientes primero.
  assert.equal(ec.consultaColumnaAjuste(e({ q: 'merma' }), ec.COLUMNAS_AJUSTE[1], { limit: 25, offset: 0 }),
    'q=merma&orden=-fecha&limit=25&offset=0&operation_type=ADJUSTMENT&direccion=salida');
  assert.equal(ec.consultaColumnaAjuste(e({ vista: 'entradas' }), ec.COLUMNAS_AJUSTE[0], { limit: 0, offset: 0 }),
    'orden=-fecha&limit=0&offset=0&operation_type=ADJUSTMENT&direccion=entrada', 'la pestaña no viaja; la plegada pide limit=0');
  // Los totales de las tres cifras (pestañas y tarjetas): limit=0 y la dirección, sin búsqueda (RP96).
  assert.deepEqual(ec.consultasTotalesAjuste(''), {
    todos: 'limit=0&offset=0&operation_type=ADJUSTMENT',
    entradas: 'limit=0&offset=0&operation_type=ADJUSTMENT&direccion=entrada',
    salidas: 'limit=0&offset=0&operation_type=ADJUSTMENT&direccion=salida',
  });
  // Las pestañas y las tarjetas salen de los MISMOS totales (I1 de T18).
  const totales = { todos: 12, entradas: 7, salidas: 4 };
  assert.deepEqual(ec.pestanasAjustes(totales).map((p) => [p.id, p.etiqueta, p.conteo]), [['todos', 'Todos', 12], ['entradas', 'Entradas', 7], ['salidas', 'Salidas', 4]]);
  assert.deepEqual(ec.pestanasAjustes(null).map((p) => p.conteo), [null, null, null]);
  assert.deepEqual(ec.pestanasAjustes({ todos: 'x', entradas: 2 }).map((p) => p.conteo), [null, 2, null]);
  // Los vacíos dicen qué los deja vacíos.
  assert.equal(ec.textoVacioAjustes({ vista: 'todos', q: 'zz' }).titulo, 'Sin resultados para «zz»');
  assert.equal(ec.textoVacioAjustes({ vista: 'entradas', q: '' }).titulo, 'No hay ajustes de entrada');
  assert.equal(ec.textoVacioAjustes({ vista: 'salidas', q: '' }).titulo, 'No hay ajustes de salida');
  assert.equal(ec.textoVacioAjustes({ vista: 'todos', q: '' }).titulo, 'Sin ajustes registrados');
  // La tarjeta del tablero: número, producto, bodega, la dirección, la cantidad con signo y la fecha real.
  const t = ec.tarjetaAjuste(aju(12, 'ADJUST_OUT'), [{ id: 3, name: 'Bodega Norte' }]);
  assert.deepEqual([t.numero, t.tipo, t.titulo, t.subtitulo, t.tiempo, t.monto, t.accionPrincipal], ['AJU-0012', 'AJU', 'SKU #9', 'Bodega Norte', '3 nov 2026', null, null]);
  assert.equal(t.estado.label, 'Salida');
  assert.deepEqual(t.chips, [{ texto: '-4 unidades', tono: 'rose' }, { texto: 'Conteo fisico', tono: 'slate' }]);
  assert.deepEqual(ec.tarjetaAjuste(aju(1, 'IN', { movements: [{ sku_id: 9, quantity: 1, direction: 'IN' }], notas: null }), null).chips, [{ texto: '+1 unidad', tono: 'emerald' }]);
  assert.equal(ec.tarjetaAjuste(aju(1, 'IN'), null).subtitulo, 'Bodega #3');
}

console.log('--- TEST 47 (B4 T19): Recepciones, Traslados y Ajustes de Inventario cablean las columnas compartidas, el servidor, las tarjetas y el tablero solo para ver ---');
{
  /** La etiqueta <TarjetaKpi kpi="id" …/> con sus líneas (hasta el primer `/>`). */
  const tarjetaKpi = (f, id) => { const i = f.indexOf(`<TarjetaKpi kpi="${id}"`); assert.ok(i >= 0, id); return f.slice(i, f.indexOf('/>', i) + 2); };
  const rec = leerFuente('app/dashboard/inventario/recepciones/page.tsx');
  const tra = leerFuente('app/dashboard/inventario/traslados/page.tsx');
  const aju = leerFuente('app/dashboard/inventario/ajustes/page.tsx');
  for (const [nombre, f] of [['Recepciones', rec], ['Traslados', tra], ['Ajustes', aju]]) {
    sinDefectos(nombre, f);
    trae(f, 'useEstadoTabla(', `${nombre}: el estado único`);
    trae(f, 'esperar: !listo', `${nombre}: espera las preferencias (esqueleto, nunca vacío)`);
    for (const err of ({ Recepciones: ['errorStats', 'errorBodegas'], Traslados: ['errorTotales', 'errorBodegas'], Ajustes: ['errorTotales'] })[nombre]) {
      trae(f, `<AvisoReintentar error={${err}}`, `${nombre}: la fuente que falla dice SU error con Reintentar (${err}; el uso, no el import)`);
    }
    assert.ok(!/\? null : \(?\w+\?\.(datos|kpis|conteos|totales)/.test(sinComentarios(f)), `${nombre}: una recarga no borra el último valor (I3)`);
    // B4 T24 f3 (F45, D27): Recepciones lee sus tarjetas con useResumen, que también conserva el último valor al recargar (estadoResumen).
    assert.ok(f.includes('lecturaDeCarga(') || f.includes('const { datos: datosStats, cargando: cargandoStats, error: errorStats } = stats;'),
      `${nombre}: lee el último valor con lecturaDeCarga o con useResumen`);
    assert.ok(!/cargando\w* \? null : (?!\(?\w+\?\.error)/.test(sinComentarios(f)), `${nombre}: ningún valor se pone en null mientras recarga`);
    trae(f, 'etiqueta={`Acciones de ${', `${nombre}: las acciones llevan el número en su nombre`);
    assert.ok(/soloLectura=\{TEXTO_SOLO_VER\}/.test(f), `${nombre}: tablero solo para ver`);
    for (const q of ['regla=', 'onCambio=', 'onAccion=']) noTrae(etiquetaJsx(f, '<TableroKanban'), q, `${nombre}: el tablero no mueve (${q})`);
    assert.ok(/const vacio = useMemo\(/.test(f), `${nombre}: el vacío memoizado`);
  }
  // Recepciones: las columnas compartidas y las vistas reales; nada de 'CONFIRMADA'; tarjetas del mismo /compras/stats.
  trae(rec, "from '../../compras/columnas-recepcion'", 'Recepciones importa las columnas de Compras');
  trae(rec, 'columnasRecepcion<FilaRecepcion>(', 'Recepciones arma las columnas compartidas');
  noTrae(sinComentarios(rec), 'CONFIRMADA', 'Recepciones ya no pregunta por un estado que no existe');
  trae(rec, '/compras/stats?periodo=${PERIODO_KPI}', 'Recepciones: los mismos números que Compras');
  // I4: cada tarjeta pulsable abre SU pestaña: el onClick y el anillo piden el mismo id de tarjeta (el mapa tarjeta -> pestaña es de lib y está probado).
  for (const k of ['rec_por_confirmar', 'rec_confirmadas', 'rec_total']) {
    trae(tarjetaKpi(rec, k), `onClick={() => elegirVista('${k}')}`, `${k} abre su pestaña`);
    trae(tarjetaKpi(rec, k), `activo={vistaActiva === vistaDeTarjetaRecepcion('${k}')}`, `${k} se marca con SU pestaña`);
  }
  trae(rec, 'pestanasRecepcion(conteos)', 'Recepciones importa las pestañas compartidas');
  // r2 (m6, m18): el enlace al PEC de origen, en el menú de la fila y en el Drawer.
  trae(rec, "router.push(`/dashboard/compras/pedidos?id=${r.pec_id}`)", 'el menú abre el PEC');
  trae(rec, "{ etiqueta: 'Abrir el pedido de compra', icono: Package, onClick: () => acciones?.abrirPec(r), oculto: !r.pec_id }", 'el ítem del menú sale solo con pec_id');
  trae(rec, '<Link href={`/dashboard/compras/pedidos?id=${selectedItem.pec_id}`}', 'el Drawer enlaza al PEC');
  noTrae(sinComentarios(rec), 'pestanasDeRecepciones', 'sin la copia local de las pestañas');
  noTrae(tarjetaKpi(rec, 'bodegas'), 'onClick=', 'Bodegas es informativa');
  trae(rec, 'despachar(accionVistaEnLista(estado, siguiente, opcionesEstadosRecepcion))', 'las tarjetas despachan al estado único');
  // Traslados: columnas y bodegas compartidas, la fecha real, tarjetas de los conteos del servidor.
  trae(tra, 'columnasTraslado<FilaTraslado>(', 'Traslados arma las columnas compartidas');
  for (const k of ['tras_en_proceso', 'tras_completados', 'tras_total']) {
    trae(tarjetaKpi(tra, k), `onClick={() => elegirVista('${k}')}`, `${k} abre su pestaña`);
    trae(tarjetaKpi(tra, k), `activo={vistaActiva === vistaDeTarjetaTraslado('${k}')}`, `${k} se marca con SU pestaña`);
  }
  trae(tra, 'pestanasTraslado(listado.conteos)', 'Traslados importa las pestañas compartidas');
  noTrae(sinComentarios(tra), 'pestanasDeTraslados', 'sin la copia local de las pestañas');
  noTrae(sinComentarios(tra), 'const RUTA_CONTEOS =', 'sin la copia local de la ruta de conteos');
  trae(tra, 'gestionar', 'Traslados conserva el enlace a Compras en la fila');
  trae(tra, '<BodegasTraslado.Provider value={bodegas}>', 'Traslados envuelve la tabla en el Provider');
  trae(tra, 'fechaLarga(selected.fecha)', 'Traslados: la fecha real en el Drawer');
  noTrae(sinComentarios(tra), 'created_at', 'Traslados ya no lee created_at (no existe en la operación)');
  trae(tra, 'tarjetasTraslados(conteosTraslado(conteosTotales)', 'Traslados: tarjetas de los conteos');
  noTrae(tarjetaKpi(tra, 'bodegas'), 'onClick=', 'Bodegas es informativa');
  // Ajustes: la dirección del servidor, los totales de las pestañas = tarjetas, sin alert(), fecha real.
  trae(aju, 'consultaAjustes(estado)', 'Ajustes: la pestaña viaja como direccion');
  trae(aju, 'consultasTotalesAjuste(qTotales)', 'Ajustes: totales con limit=0 y la búsqueda');
  for (const k of ['aju_total', 'aju_entradas', 'aju_salidas']) {
    trae(tarjetaKpi(aju, k), `onClick={() => elegirVista('${k}')}`, `${k} abre su pestaña`);
    trae(tarjetaKpi(aju, k), `activo={vistaActiva === vistaDeTarjetaAjuste('${k}')}`, `${k} se marca con SU pestaña`);
  }
  trae(aju, 'MOTIVOS_AJUSTE.map(', 'Ajustes: los motivos con tildes salen de lib');
  trae(aju, 'pestanasAjustes(totales)', 'Ajustes: las pestañas salen de los mismos totales');
  trae(aju, 'tarjetasAjustes(totales)', 'Ajustes: las tarjetas salen de los mismos totales');
  noTrae(tarjetaKpi(aju, 'aju_neto'), 'onClick=', 'la diferencia neta es informativa');
  noTrae(sinComentarios(aju), 'variant="gradient"', 'Ajustes: sin gradient');
  trae(aju, "avisar('Selecciona un producto de la lista', { tono: 'error' })", 'Ajustes: el alert pasó a avisar');
  trae(aju, "avisarError(err, 'No se pudo registrar el ajuste')", 'Ajustes: el error del servidor tal cual');
  trae(aju, 'if (recargarTrasError(err)) recargarTodo();', 'Ajustes: tras un error se recarga lo que se ve');
  trae(aju, 'fechaLarga(selected.fecha)', 'Ajustes: la fecha real en el Drawer');
  // La carga del tablero de Ajustes se EJECUTA con dobles: la URL lleva su dirección y la señal.
  {
    const llamadas = [];
    const { normalizarRespuesta } = await import('../src/lib/tabla.js');
    const cargar = cargarDe(aju)({
      estado: estadoTablaInicial({ q: 'merma' }), consultaColumnaAjuste: ec.consultaColumnaAjuste, normalizarRespuesta, RUTA_OPERACIONES: '/inventory/operations',
      apiFetch: async (url, o) => { llamadas.push([url, o]); return { status: 'success', total: 2, data: [{ id: 1 }] }; },
    });
    const r = await cargar(ec.COLUMNAS_AJUSTE[1], { offset: 0, limit: 25, signal: 'S' });
    assert.deepEqual(llamadas, [['/inventory/operations?q=merma&orden=-fecha&limit=25&offset=0&operation_type=ADJUSTMENT&direccion=salida', { signal: 'S' }]]);
    assert.deepEqual([r.filas, r.total], [[{ id: 1 }], 2]);
  }
}

console.log('--- TEST 48 (B4 T19; KANBAN-logistica 4, KPI-inventario 8; R15, RP22, RP23): Entregas cablea las pestañas = columnas, el tablero con rol, el despacho y las tarjetas ---');
{
  const e = leerFuente('app/dashboard/inventario/entregas/page.tsx');
  sinDefectos('Entregas', e);
  // Sin diálogos nativos: el despacho confirma con useAvisos y los fallos se dicen y recargan.
  trae(e, 'await confirmar(confirmacionDespacho(pedido, nombreBodega))', 'el despacho confirma con useAvisos');
  trae(e, 'if (!(await confirmar(', 'sin confirmación no se despacha');
  trae(e, 'JSON.stringify(cuerpoDespacho(pedido, { rol, warehouseId }))', 'el cuerpo del PATCH sale de cuerpoDespacho (RP23)');
  noTrae(sinComentarios(e), 'fecha_entrega:', 'ya no manda fecha_entrega');
  trae(e, "avisarError(err, 'No se pudo despachar el pedido');\n      // La regla única (recargarTrasError): con un 400, un 409, un 422 (F8) o sin respuesta se recarga lo que se ve; un 404 o un 500, no.\n      if (recargarTrasError(err)) recargarTodo();", 'si el despacho falla: se avisa y se recarga (recargarTrasError)');
  trae(e, 'recargarTodo(desdeTablero ? [desdeTablero.origen, desdeTablero.destino] : undefined);', 'tras despachar: la fila, origen, destino y tarjetas (D39)');
  // «Registrar cobro de saldo»: su PATCH no se toca.
  trae(e, "saldo_cop: 0,\n          notas: pedido.notas ? `${pedido.notas} | Saldo 40% cobrado y verificado` : 'Saldo 40% verificado',", 'Registrar cobro de saldo: el PATCH de siempre');
  // Pestañas = columnas, los mismos conteos que la tarjeta Despachados.
  trae(e, 'pestanasEntrega(conteos)', 'las pestañas salen de los conteos');
  trae(e, 'tarjetasEntregas(kpisStats, conteos)', 'la tarjeta Despachados lee los MISMOS conteos que las pestañas');
  trae(e, 'pestanasEntrega(conteos)', 'las pestañas leen los mismos conteos');
  // r2 (I1): las anclas de TEST 47 también en Entregas (los mutantes M7 de página, M7b, M9 y M9b mueren aquí).
  trae(e, "const vista = vistaDeTarjetaEntrega('ent_despachados') ?? INICIAL_ENTREGAS.vista;", 'elegirDespachados abre la pestaña de lib');
  trae(e.slice(e.indexOf('<TarjetaKpi kpi="ent_despachados"'), e.indexOf('/>', e.indexOf('<TarjetaKpi kpi="ent_despachados"'))), "activo={vistaActiva === vistaDeTarjetaEntrega('ent_despachados')}", 'el anillo es el de SU pestaña');
  for (const err of ['errorConteos', 'errorStats']) trae(e, `<AvisoReintentar error={${err}}`, `la fuente que falla dice SU error con Reintentar (${err})`);
  trae(e, 'lecturaDeCarga(', 'Entregas lee el último valor con lecturaDeCarga');
  // B4 T24 f3 (F45, D27): las tarjetas pasan a useResumen (conserva lo último al recargar); los conteos siguen con lecturaDeCarga.
  assert.equal(e.split('lecturaDeCarga(').length - 1, 1, 'los conteos');
  trae(e, "const stats = useResumen<{ kpis?: unknown }>('/ventas/stats', vueltaStats);", 'las tarjetas, con el cargador compartido');
  assert.ok(!/cargando\w* \? null : (?!\(?\w+\?\.error)/.test(sinComentarios(e)), 'Entregas: ningún valor se pone en null mientras recarga');
  assert.ok(/const errorConteos = cargandoConteos \? null : \(cargadosConteos\?\.error \?\? null\);/.test(e), 'el error de los conteos sale de su fuente');
  assert.ok(/const \{ cargando: cargandoStats, error: errorStats \} = stats;/.test(e), 'el error de las tarjetas sale de su fuente'); // F45 (D27)
  // r2 (m6): las regresiones repuestas y el WhatsApp visible llevan su prueba.
  trae(e, '{p.customer_phone && <span', 'el teléfono bajo el cliente (m24)');
  trae(e, "accionPrincipal: r ? { texto: 'Recordar el saldo por WhatsApp', onClick: () => abrirWhatsApp(r.url)", 'el botón de WhatsApp visible en la tarjeta (m2)');
  trae(e, 'aria-label={`Recordar el saldo de ${numero} por WhatsApp`}', 'el botón de WhatsApp en la fila');
  trae(e, 'puedeDespacharPedido(selected, rol) && (', 'el Drawer ofrece despachar solo con la regla única');
  trae(e, 'consultaConteoEntrega(columna, { q: qConteos })', 'los conteos siguen la búsqueda (m1)');
  // m3, m10, m17: UNA regla para despachar (la fila, el Drawer y su selector de bodega); m6: cobrar el saldo solo ADMIN y ASESOR; m14: el rol tras montar.
  trae(e, 'puedeDespacharPedido(p, acciones.rol)', 'la fila usa la regla única');
  // B4 T24 r2 (m15 c, D27): y el cierre del Drawer (cierreExterno={!puedeDespacharPedido(selected, rol)}).
  assert.equal(e.split('puedeDespacharPedido(selected, rol)').length - 1, 3, 'el botón, el selector y el cierre del Drawer usan la regla única');
  // B4 T24 f3 (F95, D27): el motivo del saldo lo ven todos ({tieneSaldo && (…{textoFaltaSaldo(selected)}…)}); el botón, solo quien cobra.
  trae(e, '{tieneSaldo && (', 'el motivo del saldo, a todos');
  trae(e, '{textoFaltaSaldo(selected)}', 'el texto del tablero');
  trae(e, '{puedeCobrarSaldo(rol) && (\n                      <Button size="sm" color="emerald" loading={updating} onClick={() => handleRegistrarCobroSaldo(selected)}>', 'Marcar Saldo Cobrado solo a quien el servidor se lo permite');
  noTrae(e, 'El cliente debe cancelar el saldo antes del despacho.', 'sin el texto que solo veían ADMIN y ASESOR');
  // B4 T24 (F46, D27): con useRolActual (la pieza común; '' en el servidor y en la hidratación).
  trae(e, 'const rol = useRolActual();', 'el rol se lee después de montar');
  noTrae(sinComentarios(e), 'useState(() => getUsuarioActual()', 'el rol no se lee en el inicializador');
  trae(e, 'if (recargarTrasError(err)) { setVueltaConteos((n) => n + 1); setVueltaStats((n) => n + 1); }', 'si el PATCH del tablero falla: solo pestañas y tarjetas (D39)');
  trae(e, 'textoEntregaTablero(p)', 'la entrega estimada es una fecha de negocio');
  noTrae(sinComentarios(e), 'slice(0, 10)', 'sin el ISO crudo');
  trae(e, 'extra: extraDeLaLista', 'la tabla pide estados + saldo de la pestaña');
  const t = (id) => { const i = e.indexOf(`<TarjetaKpi kpi="${id}"`); assert.ok(i >= 0, id); return e.slice(i, e.indexOf('/>', i) + 2); };
  noTrae(t('pven_en_curso'), 'onClick=', 'pven_en_curso es informativa');
  noTrae(t('ent_saldo'), 'onClick=', 'ent_saldo es informativa');
  trae(t('ent_despachados'), 'onClick={elegirDespachados}', 'ent_despachados abre su pestaña');
  trae(e, 'nota={NOTA_ENTREGAS}', 'la nota reemplaza Protocolo 60/40');
  noTrae(sinComentarios(e), 'Protocolo 60/40', 'sin la tarjeta de párrafo');
  noTrae(sinComentarios(e), 'variant="gradient"', 'sin gradient');
  // El tablero: modo servidor, regla con el rol, onCambio / onAccion.
  trae(e, 'reglaSoltarEntrega(p, o, d, { rol })', 'la regla recibe el rol');
  const tab = etiquetaJsx(e, '<TableroKanban');
  for (const q of ['regla={reglaDelTablero}', 'onCambio={cambiarDesdeTablero}', 'onAccion={accionDesdeTablero}']) trae(tab, q, `TableroKanban ${q}`);
  trae(e, "modo: 'servidor'", 'tablero en modo servidor');
  // El nombre de campo real: nada de las claves viejas que el servidor no manda.
  for (const viejo of ['cliente_telefono', 'cliente_nombre', 'direccion_envio', 'shipping_address', 'COMPLETADO']) noTrae(sinComentarios(e), viejo, `no lee ${viejo}`);
  // La carga del tablero se EJECUTA: la URL lleva los estados y el saldo de la columna; la pestaña no viaja.
  {
    const llamadas = [];
    const { normalizarRespuesta } = await import('../src/lib/tabla.js');
    const ent = await import('../src/lib/entregas.js');
    const cargar = cargarDe(e)({
      estado: estadoTablaInicial({ vista: 'listo', q: 'oso' }), consultaColumnaEntrega: ent.consultaColumnaEntrega, normalizarRespuesta,
      RUTA_PEDIDOS: '/ventas/pedidos',
      apiFetch: async (url, o) => { llamadas.push([url, o]); return { status: 'success', total: 1, data: [{ id: 3 }] }; },
    });
    const r = await cargar(ent.COLUMNAS_ENTREGA[1], { offset: 0, limit: 25, orden: 'atencion', signal: 'S' });
    assert.deepEqual(llamadas, [['/ventas/pedidos?q=oso&estados=LISTO_ENTREGA,DISPONIBLE,PENDIENTE_SALDO,LISTO_PARA_ENTREGA&orden=atencion&limit=25&offset=0&saldo=pendiente', { signal: 'S' }]]);
    assert.deepEqual([r.filas, r.total], [[{ id: 3 }], 1]);
  }
}

console.log('--- TEST 49 (B4 T19 r1): la tarjeta que abre cada pestaña, las pestañas compartidas, el movimiento de menor id y los textos ---');
{
  // I4: el mapa tarjeta -> pestaña de cada pantalla es de lib y se prueba entero (un mutante que cambie un destino muere aquí).
  assert.deepEqual(['rec_por_confirmar', 'rec_confirmadas', 'rec_total', 'bodegas'].map(ec.vistaDeTarjetaRecepcion), ['por_confirmar', 'confirmadas', 'todas', null]);
  assert.deepEqual(['tras_en_proceso', 'tras_completados', 'tras_total', 'bodegas'].map(ec.vistaDeTarjetaTraslado), ['en_proceso', 'completadas', 'todos', null]);
  assert.deepEqual(['aju_total', 'aju_entradas', 'aju_salidas', 'aju_neto'].map(ec.vistaDeTarjetaAjuste), ['todos', 'entradas', 'salidas', null]);
  // Cada vista que abre una tarjeta existe como pestaña de su pantalla, y la pestaña y la tarjeta leen el mismo conteo.
  const claves = (pestanas) => pestanas.map((p) => p.id);
  for (const k of ['rec_por_confirmar', 'rec_confirmadas', 'rec_total']) assert.ok(claves(ec.pestanasRecepcion(null)).includes(ec.vistaDeTarjetaRecepcion(k)), k);
  for (const k of ['tras_en_proceso', 'tras_completados', 'tras_total']) assert.ok(claves(ec.pestanasTraslado(null)).includes(ec.vistaDeTarjetaTraslado(k)), k);
  for (const k of ['aju_total', 'aju_entradas', 'aju_salidas']) assert.ok(claves(ec.pestanasAjustes(null)).includes(ec.vistaDeTarjetaAjuste(k)), k);
  // m16: las pestañas viven en lib (Inventario las importa): los ids, las etiquetas y el ámbar de Por confirmar (RP41, D6).
  assert.deepEqual(ec.pestanasRecepcion({ por_confirmar: 3, confirmadas: 20, canceladas: 1, todas: 24 }).map((p) => [p.id, p.etiqueta, p.conteo, p.alerta ?? false]), [
    ['por_confirmar', 'Por confirmar', 3, true], ['confirmadas', 'Confirmadas', 20, false], ['canceladas', 'Canceladas', 1, false], ['todas', 'Todas', 24, false]]);
  assert.deepEqual(ec.pestanasRecepcion(null).map((p) => p.conteo), [null, null, null, null]);
  assert.deepEqual(ec.pestanasTraslado({ todos: 9, DRAFT: 1, READY: 2, DONE: 5, CANCELLED: 1 }).map((p) => [p.id, p.etiqueta, p.conteo]), [
    ['en_proceso', 'En proceso', 3], ['completadas', 'Completados', 5], ['canceladas', 'Cancelados', 1], ['todos', 'Todos', 9]]);
  assert.equal(ec.columnaDeTraslado({ status: 'DONE' }), 'DONE');
  assert.equal(ec.fechaDeTraslado({ fecha: '2026-11-03T15:00:00Z' }), '2026-11-03T15:00:00Z');
  assert.equal(ec.RUTA_CONTEOS_TRASLADOS, '/inventory/operations?operation_type=TRANSFER&limit=0&con_conteos=1');
  assert.deepEqual(ec.EXTRA_TABLERO_RECEPCION, { limit: 0 });
  // m20: la dirección sale del movimiento de MENOR id (_primera_direccion del backend), no del primero del arreglo.
  const ajuste = { movements: [{ id: 9, sku_id: 2, quantity: 1, direction: 'IN' }, { id: 4, sku_id: 7, quantity: 6, direction: 'ADJUST_OUT' }] };
  assert.equal(ec.direccionDeAjuste(ajuste), 'salida');
  assert.equal(ec.cantidadDeAjuste(ajuste), 6);
  assert.equal(ec.skuDeAjuste(ajuste), 'SKU #7');
  assert.equal(ec.direccionDeAjuste({ movements: [{ direction: 'OUT' }, { direction: 'IN' }] }), 'salida', 'sin ids: el primero');
  // Los totales de las pestañas de Ajustes siguen la búsqueda (m1, m13, m22).
  assert.deepEqual(ec.consultasTotalesAjuste(' merma '), {
    todos: 'q=merma&limit=0&offset=0&operation_type=ADJUSTMENT',
    entradas: 'q=merma&limit=0&offset=0&operation_type=ADJUSTMENT&direccion=entrada',
    salidas: 'q=merma&limit=0&offset=0&operation_type=ADJUSTMENT&direccion=salida',
  });
  assert.equal(ec.consultasTotalesAjuste('').todos, 'limit=0&offset=0&operation_type=ADJUSTMENT');
  // m15: textos en singular y con tildes.
  assert.equal(ec.textoDiasRetraso(1), '1 día');
  assert.equal(ec.textoDiasRetraso(3), '3 días');
  assert.deepEqual(ec.MOTIVOS_AJUSTE, ['Conteo físico', 'Merma', 'Sobrante', 'Corrección de error', 'Daño en bodega', 'Vencimiento', 'Otro']);
}

console.log('--- B4 T24 (FINAL-m27): textoVencidosPec, la alerta de la pestaña con su número ---');
{
  assert.equal(ec.textoVencidosPec(3), 'Hay 3 vencidos');
  assert.equal(ec.textoVencidosPec(1), 'Hay 1 vencido');
  assert.equal(ec.textoVencidosPec(1200), 'Hay 1.200 vencidos', 'con punto de miles');
  for (const nada of [0, -1, null, undefined, NaN, '3']) assert.equal(ec.textoVencidosPec(nada), false, String(nada));
}

console.log('--- B4 T24 (FINAL-m10, FINAL-m31 y FINAL-m38): los tableros y las acciones de los PEC solo con ADMIN y COMPRAS ---');
{
  const { accesoCompras, TEXTO_TABLERO_SOLO_VER } = await import('../src/lib/roles.js');
  // Un caso por rol (PATCH y DELETE /compras/pedidos y PATCH /tracking: ADMIN y COMPRAS).
  for (const rol of ['ADMIN', 'COMPRAS', 'compras', ' Admin ']) {
    const a = accesoCompras(rol);
    assert.deepEqual([a.cambiarPec, a.tracking, a.soloLectura], [true, true, null], rol);
  }
  for (const rol of ['ASESOR', 'FINANZAS', 'BODEGA', 'CONSULTA', 'INVENTADO']) {
    const a = accesoCompras(rol);
    assert.deepEqual([a.cambiarPec, a.tracking, a.soloLectura], [false, false, TEXTO_TABLERO_SOLO_VER], String(rol));
  }
  // r1 (m9 b): mientras se lee el rol, sin el aviso (soloLectura null) y sin cambiar nada.
  for (const rol of ['', null]) {
    const a = accesoCompras(rol);
    assert.deepEqual([a.cambiarPec, a.tracking, a.soloLectura], [false, false, null], String(rol));
  }
  const sin = (f) => f.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const hub = sin(leerFuente('app/dashboard/compras/page.tsx'));
  const pedidos = sin(leerFuente('app/dashboard/compras/pedidos/page.tsx'));
  const transito = sin(leerFuente('app/dashboard/compras/transito/page.tsx'));
  for (const [nombre, c] of [['Hub', hub], ['Pedidos', pedidos], ['Tránsito', transito]]) {
    assert.match(c, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/, `${nombre}: useRolActual`);
    assert.match(c, /import \{[^}]*\baccesoCompras\b[^}]*\} from '@\/lib\/roles';/, `${nombre}: accesoCompras`);
    assert.match(c, /const accesoPec = accesoCompras\(useRolActual\(\)\);/, `${nombre}: el acceso de la pantalla`);
    assert.match(c, /<TableroKanban\s[^>]*soloLectura=\{accesoPec\.soloLectura\}/, `${nombre}: el tablero, solo para ver sin permiso`);
  }
  // m10: «Cambiar Estado» / «Estado», «Cancelar PEC» y «Marcar Emitido» salen de transicionesPec SOLO con cambiarPec (los dos paneles).
  for (const [nombre, c] of [['Hub', hub], ['Pedidos', pedidos]]) {
    assert.match(c, /const transiciones = accesoPec\.cambiarPec \? transicionesPec\(detail\?\.estado\) : \[\];/, `${nombre}: el panel`);
    assert.match(c, /\{seleccion\.length > 0 && (?:!enAnalisis && )?!enKanban && accesoPec\.cambiarPec && \(/, `${nombre}: la barra masiva`);
    assert.match(c, /oculto: !cambiarPec \|\| !transicionesPec\(p\.estado\)\.includes\('CANCELADO'\) \}/, `${nombre}: «Cancelar PEC» de la fila`);
    // r1 (m35): la celda de acciones recibe el permiso por el contexto (como Tránsito con puedeAvanzar), sin leer el rol por fila.
    const celda = c.slice(c.indexOf('function CeldaAcciones('), c.indexOf('\n}\n', c.indexOf('function CeldaAcciones(')));
    assert.ok(!celda.includes('useRolActual'), `${nombre}: la celda no lee el rol`);
    assert.match(celda, /const acciones = useContext\(AccionesFila\);\s*const cambiarPec = acciones\?\.cambiarPec \?\? false;/, `${nombre}: el permiso del contexto`);
    assert.match(c, /cambiarPec: boolean;/, `${nombre}: el tipo del contexto`);
    assert.match(c, /cambiarPec: accesoPec\.cambiarPec,/, `${nombre}: la página lo pasa`);
    assert.equal((c.match(/accesoCompras\(useRolActual\(\)\)/g) ?? []).length, 2, `${nombre}: el panel y la página, no cada fila`);
  }
  assert.match(pedidos, /oculto: !cambiarPec \|\| !transicionesPec\(p\.estado\)\.includes\('EMITIDO'\) \}/, '«Marcar Emitido» de la fila');
  assert.match(pedidos, /oculto: !cambiarPec \|\| etapaPec\(p\.estado\) !== 'cancelado' \}/, '«Eliminar definitivamente» de la fila');
  // r1 (m2, m7): el resto de las escrituras del PEC solo con el rol de su require_roles (erp_compras.py: PATCH /pedidos/{id}/tracking,
  // PATCH /pedidos/{id}, POST /pedidos/{id}/recepcionar, PUT /tracking-config/{tipo} y POST /pedidos, todos de ADMIN y COMPRAS).
  assert.match(pedidos, /function TrackingPanel\(\{pec, onUpdate, onToast, puedeEditar\}: \{pec:any; onUpdate:\(\)=>void; onToast:AvisoPantalla; puedeEditar: boolean\}\)/);
  {
    // B4 T24 f4 (m2 de f3 r2 = m17; D27): la línea exacta se relaja a sus partes (el patrón de TEST 26): reformatearla no rompe la prueba.
    const editando = /const isEditing = ([^;\n]+);/.exec(pedidos)?.[1] ?? '';
    assert.ok(editando.length > 0, 'isEditing existe');
    for (const parte of [/!cerrado\b/, /\bpuedeEditar\b/, /editStage === sd\.stage/]) assert.match(editando, parte, `sin permiso, la tarjeta no se edita: ${parte}`);
    assert.ok(!/\|\|/.test(editando), 'isEditing exige las tres (sin un «o»)');
  }
  assert.match(pedidos, /\{!cerrado && puedeEditar && \(\s*<button onClick=\{\(\)=>openEdit\(sd\)\}/, 'el lápiz de la etapa');
  assert.match(pedidos, /<TrackingPanel pec=\{detail\|\|pec\} puedeEditar=\{accesoPec\.tracking\}/);
  assert.match(pedidos, /\{accesoPec\.cambiarPec && \(\s*<button onClick=\{\(\)=>setShowConfig\(true\)\} title="Configurar etapas, alertas y casilleros"/, 'Configurar etapas (PUT /tracking-config)');
  // B4 T24 f3 (FINAL-m12, D27): «Ver recepción» (abrir) para todos; «Hacer recepción» (crear: POST /recepcionar) con cambiarPec.
  assert.match(pedidos, /\{\(avisoRecepcion\.accion\.tipo === 'abrir' \|\| accesoPec\.cambiarPec\) && \(\s*<button onClick=\{goToRecepcion\}/, '«Hacer recepción» (POST /recepcionar); «Ver recepción» para todos');
  assert.match(pedidos, /\{!infoEdit \? \(accesoPec\.cambiarPec && \(\s*<button onClick=\{openInfoEdit\}/, '«Editar» la información (PATCH /pedidos/{id})');
  assert.match(pedidos, /\{accesoPec\.cambiarPec && <Button color="purple" icon=\{Plus\} onClick=\{\(\)=>setShowNuevoPec\(true\)\}>Nuevo PEC<\/Button>\}/, '«Nuevo PEC» (POST /pedidos)');
  // r1 (D27, C2): la selección vigente (seleccionVigente) en lugar de la vieja.
  assert.match(hub, /\{vigente\.ids\.length > 0 && accesoPec\.cambiarPec && \(/, '«Crear PEC Consolidado» (POST /pedidos)');
  assert.match(pedidos, /\{accesoPec\.cambiarPec && etapaPec\(detail\?\.estado\) === 'cancelado' && \(/, '«Eliminar definitivamente» del panel');
  // Tránsito: «Iniciar» y «Completar» de la fila (el mismo PATCH /tracking) solo con tracking.
  assert.match(transito, /puedeAvanzar: accesoPec\.tracking/);
  assert.match(transito, /if \(!accion \|\| !acciones\?\.puedeAvanzar\) return <span className="text-xs text-slate-400">—<\/span>;/);
  // r1 (C1): en el Kanban, la acción principal de la tarjeta («Iniciar»/«Completar», el mismo PATCH /tracking) también solo con tracking.
  assert.match(transito, /accionPrincipal: accesoPec\.tracking && tarjeta\.accionPrincipal && accion\n\s*\? \{ \.\.\.tarjeta\.accionPrincipal, onClick: \(\) => \{ void avanzar\(p, accion\); \} \}\n\s*: null,/);
  assert.match(transito, /\}, \[avanzar, pendiente, accesoPec\.tracking\]\);/);
}

console.log('--- B4 T24 r2 (m6, m7): «Avanzar etapa logística» del detalle y el enlace «Nuevo PEC» del Hub, solo con su rol ---');
{
  // erp_compras.py:1276-1278: PATCH /pedidos/{id}/tracking es de ADMIN y COMPRAS (accesoCompras.tracking, casos en test_roles.mjs);
  // POST /pedidos también (cambiarPec).
  const det = readFileSync(new URL('../src/app/dashboard/compras/pedidos/[id]/page.tsx', import.meta.url), 'utf8');
  assert.match(det, /import \{ accesoCompras \} from '@\/lib\/roles';/);
  assert.match(det, /const accesoPec = accesoCompras\(useRolActual\(\)\);/);
  assert.match(det, /\{!isNew && !cancelado && accesoPec\.tracking && completedCount < stages\.length && \(\s*<Button size="sm" color="blue" icon=\{Truck\} loading=\{advancing\} onClick=\{avanzarTracking\}>Avanzar etapa logística<\/Button>/);
  const hub = readFileSync(new URL('../src/app/dashboard/compras/page.tsx', import.meta.url), 'utf8');
  assert.match(hub, /\{accesoPec\.cambiarPec && \(\s*<Link href="\/dashboard\/compras\/pedidos"[^>]*>\s*<ContenidoEnlace icon=\{Plus\}>Nuevo PEC<\/ContenidoEnlace>/);
}

console.log('--- B4 T24 r2 (m2, m10): los tableros de PEC, el esqueleto mientras se lee el rol (accesoPec.listo false) ---');
{
  for (const ruta of ['app/dashboard/compras/page.tsx', 'app/dashboard/compras/pedidos/page.tsx', 'app/dashboard/compras/transito/page.tsx']) {
    const f = readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8');
    assert.match(f, /!accesoPec\.listo \? <EsqueletoTablero \/> : <TableroKanban/, `${ruta}: el esqueleto con el rol vacío`);
    assert.match(f, /import \{[^}]*\bEsqueletoTablero\b[^}]*\} from '@\/components\/ui';/, `${ruta}: la pieza común`);
  }
}

console.log('--- B4 T24 f3 (FINAL-C4-f): el conteo con el PATCH por línea, validado en la lib; los botones y el tablero por rol ---');
{
  const { leerCantidadConteo, errorCantidadConteo, esConteoHeredado, peticionesConteo, MAX_CANTIDAD_CONTEO, tarjetaRecepcion } = ec;
  for (const [nombre, f] of Object.entries({ leerCantidadConteo, errorCantidadConteo, esConteoHeredado, peticionesConteo })) {
    assert.equal(typeof f, 'function', `${nombre} existe`);
  }
  // El tope de update_grl (m16 del backend r1): Numeric(10, 2) de la columna.
  assert.equal(MAX_CANTIDAD_CONTEO, 99999999);
  // Lo escrito, sin truncar: «2.5» ya no pasa como 2 en silencio; vacío es «nada contado» (0).
  for (const [texto, n] of [['', 0], ['  ', 0], [null, 0], [undefined, 0], ['3', 3], [' 7 ', 7], ['2.5', 2.5], ['-1', -1], ['0', 0]]) {
    assert.equal(leerCantidadConteo(texto), n, JSON.stringify(texto));
  }
  // La validación en la lib antes de mandar: un entero de 0 a 99.999.999 (el servidor da 422 con 2.5).
  for (const bueno of [0, 3, 99999999]) assert.equal(errorCantidadConteo(bueno, 'Tornillo'), null, String(bueno));
  const aviso = 'La cantidad recibida de «Tornillo» debe ser un número entero entre 0 y 99.999.999.';
  for (const malo of [2.5, -1, 100000000, NaN, Infinity, '3', null, undefined]) assert.equal(errorCantidadConteo(malo, 'Tornillo'), aviso, String(malo));
  // Heredada: alguna línea sin grl_id (sin PATCH por línea).
  assert.equal(esConteoHeredado([{ grl_id: 1 }, { grl_id: 2 }]), false);
  assert.equal(esConteoHeredado([{ grl_id: 1 }, {}]), true);
  assert.equal(esConteoHeredado([{ grl_id: null }]), true);
  assert.equal(esConteoHeredado([]), false, 'sin líneas no es heredada');
  assert.equal(esConteoHeredado(null), false);
  // Una petición por línea cambiada frente al servidor; el cuerpo deja la línea como el lote (rechazadas y cuarentena en 0).
  const servidor = [
    { grl_id: 1, qty_recibida: 5, qty_rechazada: 0, qty_cuarentena: 0 },
    { grl_id: 2, qty_recibida: null, qty_rechazada: 0, qty_cuarentena: 0 },
    { grl_id: 3, qty_recibida: 4, qty_rechazada: 1, qty_cuarentena: 0 },
    { grl_id: 4, qty_recibida: 7, qty_rechazada: 0, qty_cuarentena: 0 },
    { grl_id: 5, qty_recibida: 2, qty_rechazada: 0, qty_cuarentena: 3 },
  ];
  const locales = [
    { grl_id: 1, nombre: 'A', qty_recibida: 5 },
    { grl_id: 2, nombre: 'B', qty_recibida: 0 },
    { grl_id: 3, nombre: 'C', qty_recibida: 4 },
    { grl_id: 4, nombre: 'D', qty_recibida: 9 },
    { grl_id: 5, nombre: 'E', qty_recibida: 2 },
    { grl_id: 6, nombre: 'F', qty_recibida: 1 },
  ];
  const cuerpo = (n) => ({ quantity_received: n, quantity_rejected: 0, quantity_quarantine: 0 });
  assert.deepEqual(peticionesConteo(servidor, locales), {
    error: null,
    peticiones: [
      { grl_id: 2, cuerpo: cuerpo(0) }, // sin contar en el servidor: va con su 0 explícito (la confirmación exige un número)
      { grl_id: 3, cuerpo: cuerpo(4) }, // las rechazadas no están en 0: el lote las ponía en 0
      { grl_id: 4, cuerpo: cuerpo(9) }, // cambió
      { grl_id: 5, cuerpo: cuerpo(2) }, // la cuarentena no está en 0
      { grl_id: 6, cuerpo: cuerpo(1) }, // el servidor no la trae
    ],
  });
  assert.deepEqual(peticionesConteo(servidor, locales.slice(0, 1)), { error: null, peticiones: [] }, 'igual al servidor: ninguna');
  assert.deepEqual(peticionesConteo(null, null), { error: null, peticiones: [] });
  // Una cantidad que no vale: su aviso y NINGUNA petición, aunque otras líneas sí cambien (nada se manda a medias).
  assert.deepEqual(peticionesConteo(servidor, [{ grl_id: 4, nombre: 'D', qty_recibida: 9 }, { grl_id: 1, nombre: ' Tornillo ', qty_recibida: 2.5 }]),
    { error: aviso, peticiones: [] });
  assert.equal(peticionesConteo(servidor, [{ grl_id: 1, qty_recibida: -3 }]).error,
    'La cantidad recibida de «la línea» debe ser un número entero entre 0 y 99.999.999.', 'sin nombre');
  // Las líneas sin grl_id (una heredada) no van, pero se validan igual.
  assert.deepEqual(peticionesConteo([], [{ nombre: 'X', qty_recibida: 3 }]), { error: null, peticiones: [] });
  assert.match(peticionesConteo([], [{ nombre: 'X', qty_recibida: 1.5 }]).error ?? '', /«X»/);
  // El tablero: quien no cuenta no ve «Contar y confirmar» (la tarjeta queda en «Abrir»); sin opciones, como siempre.
  const rec = { id: 7, estado: 'BORRADOR' };
  assert.equal(tarjetaRecepcion(rec).accionPrincipal?.texto, 'Contar y confirmar', 'sin opciones, como antes');
  assert.equal(tarjetaRecepcion(rec, { contar: true }).accionPrincipal?.texto, 'Contar y confirmar');
  assert.equal(tarjetaRecepcion(rec, { contar: false }).accionPrincipal, null, 'quien no cuenta');
  assert.equal(tarjetaRecepcion({ id: 7, estado: 'COMPLETADA' }, { contar: true }).accionPrincipal, null);

  // El cableado del detalle (recepciones/[id]): el rol después de montar, el PATCH por línea, el lote solo en la heredada y los botones.
  const cont = leerFuente('app/dashboard/compras/recepciones/[id]/page.tsx');
  trae(cont, "import { accesoRecepciones, accionesConteo } from '@/lib/roles';");
  trae(cont, 'const rol = useRolActual();');
  trae(cont, 'const heredada = esConteoHeredado(items);');
  // r1 (D27): accionesConteo recibe también sinBodega (C1); lo fija el bloque de r1.
  assert.match(cont, /const conteo = accionesConteo\(\{ porConfirmar: isEditable, heredada, [^}]*rol \}\);/);
  assert.match(cont, /if \(!data\?\.id \|\| !conteo\.contar\) return false;\s*const \{ error, peticiones \} = peticionesConteo\(data\.productos, items\);\s*if \(error\) \{ avisar\(error, \{ tono: 'error' \}\); return false; \}/,
    'la lib valida antes de mandar y el aviso es suyo');
  // r1 (m22, D27): la serie (y su corte en la primera que falla) está en guardarConteoEnSerie; la página le pasa el PATCH por línea.
  assert.match(cont, /\(p\) => apiFetch\(`\/compras\/recepciones\/\$\{data\.id\}\/lineas\/\$\{p\.grl_id\}`, \{ method: 'PATCH', body: JSON\.stringify\(p\.cuerpo\) \}\)\);/,
    'una petición por línea, en serie (si una falla, el resto no sale)');
  const ramaHeredada = cont.indexOf('if (heredada) {');
  const lote = cont.indexOf('body: JSON.stringify({ productos: items.map');
  assert.ok(ramaHeredada >= 0 && lote > ramaHeredada && lote < cont.indexOf('} else {', ramaHeredada), 'el PATCH en lote, solo en la rama heredada (ADMIN)');
  assert.equal((cont.match(/productos: items\.map/g) ?? []).length, 1, 'un solo PATCH en lote');
  assert.match(cont, /avisarError\(err, 'Error al guardar el conteo'\);\s*if \(recargarTrasError\(err\)\) await loadRecepcion\(\{ silencioso: true \}\);\s*return false;/,
    'si una falla: se avisa con el texto del servidor (también su 422) y, con la regla única, se recarga');
  assert.match(cont, /async function validateConteo\(\) \{\s*if \(!data\?\.id \|\| !conteo\.validar\) return;/);
  assert.match(cont, /\{conteo\.contar && \(\s*<Button variant="secondary" icon=\{Save\}[^>]*>\s*Guardar Borrador/);
  assert.match(cont, /\{conteo\.validar && \(\s*<Button color="teal" icon=\{PackageCheck\}[^>]*>\s*Cerrar y Validar Conteo/);
  assert.match(cont, /\{conteo\.texto && <span role="status"[^>]*>\{conteo\.texto\}<\/span>\}/, 'COMPRAS (o una heredada): el texto de solo lectura');
  assert.match(cont, /editable: conteo\.contar, actualizar: updateReceived \}\), \[conteo\.contar, updateReceived\]\)/, 'los campos, editables solo para quien cuenta');
  trae(cont, 'const puedeBodega = isEditable && accesoRecepciones(rol).bodega;', 'la bodega receptora: el PATCH de la recepción (ADMIN y COMPRAS)');
  assert.match(cont, /\{puedeBodega \? \(\s*<select/);
  trae(cont, 'disabled={!conteo.validar}', 'las notas van con la confirmación');
  assert.ok(!/parseInt\(/.test(cont), 'sin parseInt: «2.5» no se trunca en silencio');

  // Compras › Recepciones: «Confirmar» (fila, menú y Drawer) solo con confirmar; «Recepcionar PEC» con recepcionar; la tarjeta del tablero.
  const pag = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  // r1 (D27): «Confirmar» de la fila, el Drawer y el tablero salen de confirmarRecepcion (C1 y la heredada); lo fija el bloque de r1.
  trae(pag, 'const accesoRec = accesoRecepciones(rol);');
  trae(pag, 'oculto: menu.oculto,'); // r2 (m1, D27): el ítem del menú sale de itemConfirmarMenu
  noTrae(pag, 'puedeConfirmar', 'r3 (m6, D27): sin el código muerto; el menú y la fila salen de itemConfirmarMenu y confirmarRecepcion');
  assert.match(pag, /\{accesoRec\.recepcionar && \(\s*<Button size="sm" color="teal" icon=\{Plus\}/);
  trae(etiquetaJsx(pag, '<TableroKanban'), 'tarjetaDe={tarjetaDeRecepcion}');
  // Inventario › Recepciones: «Contar y confirmar en Compras» solo a quien cuenta; la misma tarjeta.
  const inv = leerFuente('app/dashboard/inventario/recepciones/page.tsx');
  // r1 (D27): Inventario sigue la regla de confirmarRecepcion; lo fija el bloque de r1.
  trae(etiquetaJsx(inv, '<TableroKanban'), 'tarjetaDe={tarjetaDeRecepcion}');
}

console.log('--- B4 T24 f3 (FINAL-C7-f): consolidar varios PVEN en un PEC manda ven_ids en el alta, sin un PATCH /ventas/pedidos por PVEN ---');
{
  const { vinculoPvenDelPec } = ec;
  assert.equal(typeof vinculoPvenDelPec, 'function', 'vinculoPvenDelPec existe');
  // Todos los elegidos en ven_ids; ven_id y ven_numero, solo del primero (VARCHAR(20): antes los números unidos por comas).
  assert.deepEqual(vinculoPvenDelPec([{ id: 9, numero: ' PVEN-20260009 ' }, { id: 4, numero: 'PVEN-20260004' }, { id: 7, numero: 'PVEN-7' }]),
    { ven_id: 9, ven_ids: [9, 4, 7], ven_numero: 'PVEN-20260009' });
  assert.deepEqual(vinculoPvenDelPec([{ id: 3, numero: 'PVEN-3' }]), { ven_id: 3, ven_ids: [3], ven_numero: 'PVEN-3' }, 'uno solo también va en ven_ids');
  assert.deepEqual(vinculoPvenDelPec([{ id: 3, numero: '  ' }]), { ven_id: 3, ven_ids: [3], ven_numero: null }, 'un número en blanco no vale');
  for (const vacio of [[], null, undefined, [{ numero: 'PVEN-1' }]]) {
    assert.deepEqual(vinculoPvenDelPec(vacio), { ven_id: null, ven_numero: null }, `sin PVEN: ${JSON.stringify(vacio)}`);
  }
  // El cableado: el alta de Pedidos (NuevoPecModal) y del Hub (handleConvertPvens) llevan el vínculo de la lib; no queda ningún PATCH
  // /ventas/pedidos ni el aviso «No se pudieron vincular» (V20 del registro cambia); el 409 se dice y recarga con la regla única.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  const hub = leerFuente('app/dashboard/compras/page.tsx');
  for (const [nombre, f] of [['Pedidos', ped], ['Hub', hub]]) {
    assert.ok(!/\/ventas\/pedidos\//.test(sinComentarios(f)), `${nombre}: sin PATCH /ventas/pedidos/{id} en el alta`);
    assert.ok(!/No se pudieron vincular/.test(f), `${nombre}: sin el aviso de los PVEN sin vincular`);
    assert.ok(!/ven_numero: selected\.map|\.join\(', '\),\s*productos/.test(f), `${nombre}: ven_numero ya no une números`);
  }
  // r1 (D27): ven_ids sale de la selección vigente (C2); lo fija el bloque de r1.
  assert.match(ped, /\.\.\.vinculoPvenDelPec\(vigente\.pvens\),/, 'NuevoPecModal: ven_ids, ven_id y ven_numero de la lib');
  assert.match(ped, /await apiFetch\('\/compras\/pedidos',\{method:'POST',body:JSON\.stringify\(payload\)\}\);\s*onToast\('PEC creado exitosamente','ok'\);/);
  assert.match(ped, /onToast\(e, 'error'\);\s*if \(recargarTrasError\(e\)\) onCreated\(\);/, 'NuevoPecModal: el 409 con su texto y la recarga');
  assert.match(hub, /body: JSON\.stringify\(\{\s*\.\.\.vinculoPvenDelPec\(selected\),\s*productos,/, 'el Hub: el vínculo de la lib');
  assert.match(hub, /const handleConvertPvens = async \(\) => \{[\s\S]*?\} catch \(e\) \{\s*onToast\(e, 'error'\);\s*if \(recargarTrasError\(e\)\) onUpdate\(\);\s*\}/,
    'el Hub: el 409 con su texto y la recarga');
}

console.log('--- B4 T24 f3 (A3-f): el Kardex manda Desde y Hasta como el día de Colombia que elige el usuario, y ninguna ayuda dice «UTC» ---');
{
  // El borde del ledger: un movimiento del 7 nov a las 21:00 de Colombia (02:00 UTC del 8). Con «Desde 7 nov» y «Hasta 7 nov» la
  // pantalla manda exactamente esos días (sin pasarlos a UTC); el servidor (A3-b) los compara con las 00:00 de Colombia.
  assert.deepEqual(ec.extraKardex({ desde: '2026-11-07', hasta: '2026-11-07' }),
    { sku_id: null, warehouse_id: null, owner: null, direction: null, start_date: '2026-11-07', end_date: '2026-11-07' });
  assert.equal(ec.extraKardex({ desde: '2026-12-31', hasta: '2027-01-01' }).end_date, '2027-01-01', 'el día tal cual, también en el cambio de año');
  // El contrato de A3-b (backend/app/api/v1/erp_inventario.py, solo lectura): >= inicio(D) y < inicio(D+1), las 00:00 de Colombia.
  const inv = readFileSync(new URL('../../backend/app/api/v1/erp_inventario.py', import.meta.url), 'utf8');
  assert.match(inv, /InventoryMovement\.created_at >= _inicio_del_dia_co\(start_date\)/);
  assert.match(inv, /InventoryMovement\.created_at < _inicio_del_dia_co\(end_date \+ datetime\.timedelta\(days=1\)\)/);
  // Ninguna ayuda dice «UTC»: ni el JSDoc de extraKardex ni lo que se ve en el Kardex (title, aria-label, textos).
  const lib = leerFuente('lib/estados-compras.js');
  const jsdoc = lib.slice(lib.lastIndexOf('/**', lib.indexOf('export function extraKardex(')), lib.indexOf('export function extraKardex('));
  assert.ok(!/UTC/.test(jsdoc), 'el JSDoc de extraKardex ya no dice que los bordes son días UTC');
  assert.match(jsdoc, /el día de Colombia/);
  const k = leerFuente('app/dashboard/inventario/kardex/page.tsx');
  assert.ok(!/UTC/.test(sinComentarios(k).replace(/\{\/\*[\s\S]*?\*\/\}/g, '')), 'el Kardex no dice «UTC» en lo que se ve');
}

console.log('--- B4 T24 f3 (el anillo recortado, duda 1 y m8 de f1 r3): «Completar» de Tránsito y «Confirmar» de Recepciones caben con su anillo ---');
{
  // Tránsito: la columna Acción pasa de 96 a 112 px («Completar», 85 px, no cabía en 72 útiles); las visibles siguen en la caja de 704.
  const tr = leerFuente('app/dashboard/compras/transito/page.tsx');
  trae(tr, "{ id: 'accion', titulo: 'Acción', ancho: 112, clave: true, fija: 'derecha', alinear: 'centro', celda: (p) => <CeldaAccion p={p} /> },");
  assert.equal(anchoVisible(tr, 'const COLUMNAS_TABLA_TRANSITO'), 672, 'R26: 120 + 124 + 104 + 104 + 108 + 112');
  // Recepciones: la columna no se ensancha (696 + 20 pasaría de 704): la carga de «Confirmar» no ensancha el botón; el spinner va encima del
  // texto, que se oculta sin dejar de ocupar su lugar (sin carga, la celda cabe en sus 132 px útiles).
  const rec = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  trae(rec, '{confirmando && <RefreshCw size={12} aria-hidden="true" className="absolute inset-0 m-auto animate-spin" />}');
  trae(rec, "<span className={confirmando ? 'invisible' : undefined}>Confirmar</span>");
  assert.match(rec, /className=\{`relative inline-flex items-center gap-1 rounded-lg border border-teal-700/, 'el spinner se ubica sobre el botón');
  assert.equal(anchoVisible(leerFuente('app/dashboard/compras/columnas-recepcion.tsx'), 'export function columnasRecepcion'), 696, 'Recepciones: sin ensanchar');
}

console.log('--- B4 T24 f3 (F57, F54): el Hub de Compras — «Reintentar» de los PVEN da señal mientras carga; los textos del panel con GC:12 ---');
{
  const hub = leerFuente('app/dashboard/compras/page.tsx');
  // F57: la lista de consolidación con la vuelta de su carga, como stats; mientras va el reintento, «Cargando…» y el botón apagado.
  // r1 (m31, m36, D27): la carga se lee con estadoReintento (lib, ejecutada en el bloque de r1) y el botón conserva el foco (aria-disabled).
  trae(hub, 'const cargandoVentas = estadoReintento(ventas, vueltaVentas).cargando;');
  trae(hub, 'cargandoVentas={cargandoVentas}');
  trae(hub, "<button type=\"button\" onClick={cargandoVentas ? undefined : onReintentarVentas} aria-disabled={cargandoVentas || undefined} aria-busy={cargandoVentas}");
  trae(hub, "{cargandoVentas ? 'Cargando…' : 'Reintentar'}");
  // F54: «Información», «Transportadora», «Cant.» y la etiqueta del estado (infoEstadoPedido), nunca el código.
  for (const viejo of ["l:'Info PEC'", "['Carrier',", '>Qty<', '>PEND. COMPRA<']) noTrae(hub, viejo, `sin ${viejo}`);
  trae(hub, "l:'Información'");
  trae(hub, "['Transportadora',");
  trae(hub, '<th className="px-4 py-3 text-center">Cant.</th>');
  trae(hub, "{infoEstadoPedido('PENDIENTE_COMPRA').label}");
}

console.log('--- B4 T24 f3 (FINAL-m4, ruling 7): Compras › Historial no fabrica respuestas de IA: su pestaña Análisis es AsistenteEnConstruccion ---');
{
  const h = leerFuente('app/dashboard/compras/historial/page.tsx');
  trae(h, "import { AsistenteEnConstruccion } from '@/components/analisis';");
  trae(h, "{activeTab === 'Analisis' && (\n            <div className=\"p-6\">\n              <AsistenteEnConstruccion titulo=\"Asistente de compras\"");
  // Sin el análisis ni el chat simulados (R2): ni su estado, ni sus funciones, ni sus textos fijos.
  for (const viejo of ['setAiAnalysis', 'setAiChat', 'handleAIAnalysis', 'sendAIChat', "role:'ia'", 'Con base en los datos actuales', 'ANÁLISIS DE HISTORIAL',
    'Nebulae Analytics', 'Generar Análisis', 'Consultar al Asistente']) {
    noTrae(h, viejo, `sin ${viejo}`);
  }
}

console.log('--- B4 T24 f3 (FINAL-m12, F64, FINAL-m13, F62): el panel de un PEC — la recepción del resto, el 404 al eliminar, el seguimiento y sus textos ---');
{
  const { avisoRecepcionPec, despuesDeEliminarPec } = ec;
  assert.equal(typeof avisoRecepcionPec, 'function', 'avisoRecepcionPec existe');
  // FINAL-m12: en bodega sin recepción por confirmar, «Hacer recepción» crea la del resto; nunca abre una ya confirmada.
  const confirmada = { id: 5, numero: 'ENINV-5', estado: 'COMPLETADA' };
  const borrador = { id: 8, numero: 'ENINV-8', estado: 'BORRADOR' };
  assert.deepEqual(avisoRecepcionPec({ estado: 'PARCIALMENTE_RECIBIDA', recepciones: [confirmada] }), {
    titulo: 'Mercancía recibida en parte', texto: 'Falta por recibir: inicia la recepción de lo que falta.', accion: { tipo: 'crear', texto: 'Hacer recepción' },
  }, 'parcial con la recepción confirmada: crea la del resto');
  assert.deepEqual(avisoRecepcionPec({ estado: 'PARCIALMENTE_RECIBIDA', recepciones: [confirmada, borrador] }).accion, { tipo: 'abrir', id: 8, texto: 'Ver recepción' },
    'con una por confirmar, la abre');
  assert.deepEqual(avisoRecepcionPec({ estado: 'RECIBIDO', recepciones: [] }), {
    titulo: 'Mercancía recibida en bodega, pendiente de recepción', texto: 'Inicia el conteo físico de este pedido.', accion: { tipo: 'crear', texto: 'Hacer recepción' },
  });
  assert.equal(avisoRecepcionPec({ estado: 'RECIBIDO', recepciones: [borrador] }).texto, 'Recepción ENINV-8 en curso.');
  // Recibido (RECIBIDA) con recepciones: «Ver recepción» abre la última (el camino de vuelta desde el PEC, como antes).
  assert.deepEqual(avisoRecepcionPec({ estado: 'RECIBIDA', recepciones: [confirmada] }).accion, { tipo: 'abrir', id: 5, texto: 'Ver recepción' });
  for (const pec of [{ estado: 'RECIBIDA', recepciones: [] }, { estado: 'EMITIDO' }, { estado: 'EN_TRANSITO', recepciones: [borrador] }, null]) {
    assert.equal(avisoRecepcionPec(pec), null, JSON.stringify(pec));
  }
  // El tablero muestra el PEC parcial en «En bodega»: el panel también lo avisa (la misma columna).
  assert.equal(ec.columnaPec('PARCIALMENTE_RECIBIDA'), 'en_bodega');
  // F64: un 404 al eliminar (ya lo borró otro) cierra el panel; la regla única recarga; un 500, nada.
  assert.equal(despuesDeEliminarPec({ status: 404 }), 'cerrar');
  for (const status of [400, 409, 422, undefined]) assert.equal(despuesDeEliminarPec({ status }), 'recargar', String(status));
  assert.equal(despuesDeEliminarPec({ status: 500 }), null);
  assert.equal(despuesDeEliminarPec({ status: 403 }), null);
  // El cableado del panel.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  // r1 (m20, D27): el aviso recibe {recepcionar} del rol; lo fija el bloque de r1.
  trae(ped, 'const avisoRecepcion = avisoRecepcionPec(detail, { recepcionar: accesoPec.cambiarPec });');
  trae(ped, '{avisoRecepcion && (');
  trae(ped, "if (accion.tipo === 'abrir') { router.push(`/dashboard/compras/recepciones/${accion.id}`); return; }");
  trae(ped, 'router.push(`/dashboard/compras/recepciones/${(r?.data ?? r)?.id}`);');
  noTrae(ped, "['RECIBIDO','RECIBIDA'].includes(detail?.estado)", 'sin la lista que dejaba fuera a PARCIALMENTE_RECIBIDA');
  // FINAL-m13: el PATCH /tracking del panel recarga con la regla única.
  const etapa = ped.slice(ped.indexOf('async function updateStage('), ped.indexOf('const [infoEdit, setInfoEdit]'));
  assert.match(etapa, /\} catch \(e\) \{[\s\S]*?onToast\(e, 'error'\);\s*if \(recargarTrasError\(e\)\) onUpdate\(\);\s*\}/, 'updateStage: la regla única');
  // F62: los textos con tildes y la etiqueta del estado de pedido (los valores guardados, como 'Credito 30 dias', no cambian).
  for (const viejo of ['Numero de Guia', 'Historial de guias', 'Tipo de Envio', 'Entrega Estimada (dias)', 'Sin PVEN en estado Pendiente Compra', '<strong>Pendiente Compra</strong>']) {
    noTrae(ped, viejo, `sin «${viejo}»`);
  }
  for (const nuevo of ['Número de guía / tracking', 'Historial de guías:', 'Tipo de envío', 'Entrega estimada (días)', 'Sin PVEN pendientes de compra',
    "<strong>{infoEstadoPedido('PENDIENTE_COMPRA').label}</strong>"]) {
    trae(ped, nuevo);
  }
}

console.log('--- B4 T24 f3 (F79, F82, F85, F86, F87-f, F78): el Hub de Inventario — el pie de la bodega, los textos, Almacenes, las categorías padre y el encabezado ---');
{
  const { textoPieBodega, marcarCategoriasPadre, ESTADOS_STOCK, TOPE_TABLERO_COMPRAS } = ec;
  // F79: singular y plural; sin riesgo, la etiqueta de ESTADOS_STOCK; con la consulta recortada, no afirma de lo que no cargó.
  assert.deepEqual(textoPieBodega(1), { texto: '1 bajo el mínimo o agotada', alerta: true });
  assert.deepEqual(textoPieBodega(3), { texto: '3 bajo el mínimo o agotadas', alerta: true });
  assert.deepEqual(textoPieBodega(1200, { recortado: true }), { texto: '1.200 bajo el mínimo o agotadas', alerta: true });
  // r1 (m41, D27): una bodega sin alertas dice «Sin alertas» (no «Bien abastecido», la etiqueta de una referencia, en masculino).
  assert.deepEqual(textoPieBodega(0), { texto: 'Sin alertas', alerta: false });
  assert.deepEqual(textoPieBodega(0, { recortado: true }), { texto: `Sin alertas en las ${TOPE_TABLERO_COMPRAS} cargadas`, alerta: false });
  assert.equal(textoPieBodega(null).texto, 'Sin alertas');
  // F87-f: las padre, marcadas (sin mutar); null sigue null.
  const cats = [{ id: 1, name: 'Hogar', parent_id: null }, { id: 2, name: 'Cocina', parent_id: 1 }, { id: 3, name: 'Juguetes', parent_id: null }];
  assert.deepEqual(marcarCategoriasPadre(cats).map((c) => c.name), ['Hogar (categoría padre)', 'Cocina', 'Juguetes']);
  assert.equal(cats[0].name, 'Hogar', 'no muta lo que recibe');
  assert.equal(marcarCategoriasPadre(null), null);
  // F85: el vacío nunca muestra el id crudo; sin el nombre, «la bodega elegida».
  const { textoVacioExistencias } = await import('../src/lib/tabla.js');
  assert.equal(textoVacioExistencias({ bodega: true }).titulo, 'Ninguna existencia en la bodega elegida.');
  assert.equal(textoVacioExistencias({ categoria: true, bodega: 'Central' }).titulo, 'Ninguna existencia en la bodega «Central» y en la categoría elegida.');
  // El cableado del Hub.
  const hub = leerFuente('app/dashboard/inventario/page.tsx');
  trae(hub, '{textoPieBodega(b.en_riesgo, { recortado: recortado }).texto}', 'F79: el pie con su regla');
  trae(hub, 'const recortado = (listado.total ?? 0) > TOPE_TABLERO_COMPRAS;');
  noTrae(hub, "'Bien abastecida'", 'F79: sin la etiqueta local');
  // r1 (m24, D27): el mismo texto, ahora con AvisoDeError (un 403 no ofrece «Reintentar»).
  trae(hub, '<AvisoDeError error={listado.error} fallo="No se pudieron cargar las existencias por bodega" onReintentar={listado.recargar} acento="indigo" />', 'F82 a');
  trae(hub, '<h2 className="sr-only">Existencias por bodega</h2>', 'F82 b');
  noTrae(hub, '`#${filtros.bodega}`', 'F85: sin el id crudo');
  noTrae(hub, '`#${filtros.categoria}`', 'F85');
  trae(hub, 'warehouse_id: null, limit: TOPE_TABLERO_COMPRAS', 'F86: Almacenes muestra todas las bodegas');
  trae(hub, 'catalogo={categoriasMarcadas} valor={filtros.categoria}', 'F87-f: el selector con las padre marcadas');
  trae(hub, '<div className="flex flex-wrap items-center gap-3">', 'F78: los botones se parten');
  trae(hub, '<div className="flex flex-wrap items-center gap-2">\n                <h1 className="text-3xl font-black text-slate-900 tracking-tight break-words">HUB de Inventario</h1>', 'F78: el título');
}

console.log('--- B4 T24 f3 (F88, F90, F91): el Kardex — el autocompletar como combobox, el título del detalle y las opciones del propietario ---');
{
  const k = leerFuente('app/dashboard/inventario/kardex/page.tsx');
  // F88: la semántica de combobox, «Buscando…», Esc y al perder el foco, y las flechas.
  trae(k, 'role="combobox" aria-expanded={listaSkuAbierta} aria-controls="kardex-sku-opciones" aria-autocomplete="list"');
  trae(k, '<div ref={refListaSku} id="kardex-sku-opciones" role="listbox" aria-label="Productos que coinciden"');
  trae(k, '<p role="status" className="px-3 py-2 text-xs text-slate-600">Buscando…</p>', 'mientras la respuesta no llega');
  // r1 (D27, C3): las teclas y el cierre pasan a la lib (teclaComboboxSku, cierraComboboxAlSalir); aria-selected sigue a la opción con el
  // foco. Lo fija el bloque de r1.
  trae(k, "role=\"option\" aria-selected={i === indiceSku} onClick={() => elegirSku(o)}");
  trae(k, 'if (cierraComboboxAlSalir(e.currentTarget.contains(e.relatedTarget as Node | null), { sinDestino: e.relatedTarget == null, ratonSobreLista: ratonSobreLista.current })) setSkuCerrado(true);', 'al salir del campo y de la lista, se cierra (r2, m5: con el null de Safari y el ratón sobre la lista, D27)');
  trae(k, '<div className="relative" onKeyDown={teclaSku} onBlur={saleDelSku}>');
  trae(k, 'setSkuCerrado(false);', 'escribir la abre otra vez');
  // F90: el título fijo; el número en el subtítulo.
  trae(k, '<Modal title="Detalle del movimiento" subtitle={[numeroMovimiento(m), m.sku, m.product_name].filter(Boolean).join(\' · \')}');
  noTrae(k, 'title={`Movimiento ${numeroMovimiento(m)}`}', 'sin «Movimiento Movimiento n.º 3»');
  // F91: las opciones del propietario con etiquetaPropietario.
  trae(k, "{['NEBULAE', 'MAU'].map((o) => <option key={o} value={o}>{etiquetaPropietario(o)}</option>)}");
  noTrae(k, '<option value="NEBULAE">Nebulae</option>', 'sin el texto escrito a mano');
}

console.log('--- B4 T24 f3 (B40-f, F74-f, F73): los enlaces ?sku= y ?id= piden por su parámetro exacto; ?id=063 no repite ---');
{
  // B40-f: el SKU exacto de B40-b (GET /products?sku=); F74-f: el id exacto de F74-b (GET /inventory/operations?id=), los dos leídos en solo lectura.
  assert.equal(ec.pedirEnlaceProducto(null, null, 'NEB-1').ruta, '/products?sku=NEB-1&limit=50&offset=0');
  const catalogo = readFileSync(new URL('../../backend/app/api/v1/catalog.py', import.meta.url), 'utf8');
  assert.ok(catalogo.slice(catalogo.indexOf('def list_products('), catalogo.indexOf('def list_products(') + 400).includes('sku: Optional[str] = None,'), 'B40-b: /products acepta ?sku=');
  const inv = readFileSync(new URL('../../backend/app/api/v1/inventory.py', import.meta.url), 'utf8');
  assert.ok(inv.includes('MENSAJE_ID_OPERACION = "El id de la operación debe ser un número entero positivo."'), 'F74-b: /inventory/operations acepta ?id=');
  // F73: la marca es String(id): ?id=063 y ?id=63 son el mismo traslado (no se repiten la consulta ni el aviso).
  assert.equal(ec.pedirEnlaceTraslado('63', '063'), null, '?id=063 ya atendido como 63');
  assert.equal(ec.pedirEnlaceTraslado(null, '063'), 63);
  assert.equal(ec.pedirEnlaceTraslado(ec.llegadaEnlaceTraslado(63, []).marca, '0063'), null);
  // r1 (F69, D27): el efecto bajó a la lib (abrirEnlaceTraslado): ahí se lee llegada.avisar; la página pasa el aviso con su tono.
  trae(readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8'), 'if (llegada.avisar) avisar(`No se encontró el traslado ${numeroTraslado({ id })}.`);', 'la lib lee llegada.avisar');
  trae(leerFuente('app/dashboard/compras/traslados/page.tsx'), "avisar: (texto) => avisar(texto, { tono: 'info' }),");
}

console.log('--- B4 T24 f3 (F56, F55, F89, F94, FINAL-m16, FINAL-m17, F72, FINAL-m15): comentarios, textos y una constante ---');
{
  const lib = leerFuente('lib/estados-compras.js');
  noTrae(lib, 'estadosDeColumnaPec', 'F56: sin la función que ya no existe');
  trae(lib, 'estadosDeColumnaLista (kanban.js) la convierte en la columna entera', 'F56');
  noTrae(lib, 'con fallas quedan en la ventana);', 'F55: el JSDoc ya no dice lo que la página no hace');
  trae(leerFuente('app/dashboard/inventario/piezas-inventario.tsx'), 'la fuente ÚNICA de las piezas de las cinco pantallas de existencias', 'F89');
  trae(leerFuente('app/dashboard/inventario/traslados/page.tsx'), 'Todas se ven por defecto (696 px).', 'F94');
  // FINAL-m16: la barra de submódulos con tildes.
  trae(leerFuente('app/dashboard/compras/comp-nav.ts'), "{ name: 'Mercancía en tránsito', path: '/dashboard/compras/transito' },");
  // FINAL-m17: el title de Retraso con el singular de la celda (textoDiasRetraso).
  assert.equal(`${ec.textoDiasRetraso(1)} de retraso`, '1 día de retraso');
  assert.equal(`${ec.textoDiasRetraso(4)} de retraso`, '4 días de retraso');
  trae(leerFuente('app/dashboard/compras/columnas-recepcion.tsx'), '`${textoDiasRetraso(retrasoDeRecepcion(r))} de retraso`');
  // F72: Tránsito usa TOPE_TABLERO_COMPRAS (el del aviso).
  trae(leerFuente('app/dashboard/compras/transito/page.tsx'), "limit: TOPE_TABLERO_COMPRAS, offset: 0 };");
  // FINAL-m15: la ayuda del disponible con la regla de R10 (por bodega y luego la suma), también en el banner de Stock.
  const kpisLib = await import('../src/lib/kpis.js');
  assert.equal(kpisLib.tarjetasStock({ unidades_disponibles: 3 }).disponible.ayuda, 'Por bodega: físico menos comprometido, nunca negativo; luego se suma.');
  trae(leerFuente('app/dashboard/inventario/stock/page.tsx'), 'El <strong>Disponible</strong> se calcula por bodega:', 'el banner con la misma regla');
}

console.log('--- B4 T24 f3 r1 (C1 y la heredada): «Confirmar» con la regla del detalle en todas las pantallas; la bodega receptora al crear la recepción ---');
{
  const { datosConfirmacion, bodegaRecepcion, cuerpoRecepcionarPec } = ec;
  for (const [nombre, f] of Object.entries({ datosConfirmacion, bodegaRecepcion, cuerpoRecepcionarPec })) assert.equal(typeof f, 'function', `${nombre} existe`);
  // Lo que confirmarRecepcion necesita de una fila (la MISMA regla en la fila, el menú, el Drawer, el tablero y el enlace de Inventario).
  assert.deepEqual(datosConfirmacion({ estado: 'BORRADOR', warehouse_id: 3, productos: [{ grl_id: 1 }] }), { porConfirmar: true, heredada: false, sinBodega: false });
  assert.deepEqual(datosConfirmacion({ estado: 'BORRADOR', warehouse_id: null, productos: [{ grl_id: 1 }] }), { porConfirmar: true, heredada: false, sinBodega: true });
  assert.deepEqual(datosConfirmacion({ estado: 'BORRADOR', productos: [{ grl_id: 1 }, { sku_id: 4 }] }), { porConfirmar: true, heredada: true, sinBodega: true });
  assert.deepEqual(datosConfirmacion({ estado: 'COMPLETADA', warehouse_id: 2, productos: [] }), { porConfirmar: false, heredada: false, sinBodega: false });
  assert.deepEqual(datosConfirmacion(null), { porConfirmar: false, heredada: false, sinBodega: true });
  // La bodega que va al crear: lo elegido; sin tocar el select, la única si hay una sola; si no, '' (opcional: la del PEC).
  assert.equal(bodegaRecepcion(null, [{ id: 4, name: 'Central' }]), '4', 'una sola: preseleccionada');
  assert.equal(bodegaRecepcion(null, [{ id: 4 }, { id: 5 }]), '', 'varias: ninguna');
  assert.equal(bodegaRecepcion(null, []), '');
  assert.equal(bodegaRecepcion(null, null), '', 'mientras carga');
  assert.equal(bodegaRecepcion('', [{ id: 4 }]), '', 'el usuario eligió «la del pedido»');
  assert.equal(bodegaRecepcion('5', [{ id: 4 }]), '5');
  assert.equal(bodegaRecepcion(undefined, [{ id: null }, { id: 9 }]), '9', 'sin id no cuenta');
  // El cuerpo de POST /pedidos/{id}/recepcionar: warehouse_id solo con una bodega elegida.
  assert.deepEqual(cuerpoRecepcionarPec({ creadoPor: 'Ana', notas: 'Mesa', bodega: '4' }), { created_by: 'Ana', force_full: false, notas: 'Mesa', warehouse_id: 4 });
  assert.deepEqual(cuerpoRecepcionarPec({ creadoPor: 'Ana', bodega: '' }), { created_by: 'Ana', force_full: false });
  for (const malo of ['0', '-2', '2.5', 'x', null, undefined]) {
    assert.equal('warehouse_id' in cuerpoRecepcionarPec({ creadoPor: '', bodega: malo }), false, String(malo));
  }
  // El servidor ya acepta body.warehouse_id (leído en solo lectura).
  const esquemas = readFileSync(new URL('../../backend/app/api/v1/schemas_compras.py', import.meta.url), 'utf8');
  assert.match(esquemas, /class CrearRecepcionDesdePecBody\(BaseModel\):\s*warehouse_id: Optional\[int\] = None/);
  assert.match(readFileSync(new URL('../../backend/app/api/v1/erp_compras.py', import.meta.url), 'utf8'), /wid = body\.warehouse_id or p\.warehouse_id/);

  // El cableado. El detalle: sinBodega en accionesConteo.
  const cont = leerFuente('app/dashboard/compras/recepciones/[id]/page.tsx');
  trae(cont, 'const conteo = accionesConteo({ porConfirmar: isEditable, heredada, sinBodega: !data?.warehouse_id, rol });');
  // Compras › Recepciones: la fila, el menú (apagado con su motivo si el rol confirma pero la recepción no), el Drawer y el tablero.
  const pag = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  trae(pag, "import { accesoRecepciones, confirmarRecepcion, itemConfirmarMenu } from '@/lib/roles';"); // r2 (m1, D27)
  trae(pag, 'const confirmacion = useCallback((r: FilaRecepcion) => confirmarRecepcion({ ...datosConfirmacion(r), rol }), [rol]);');
  assert.match(pag, /\{confirmacion\.confirmar && \(\s*<button type="button" onClick=\{\(\) => acciones\?\.confirmar\(r\)\}/, 'la fila');
  trae(pag, 'deshabilitado: menu.deshabilitado || acciones?.confirmandoId != null,', 'el menú'); // r2 (m1, D27): itemConfirmarMenu
  trae(pag, "titulo: menu.titulo ?? (acciones?.confirmandoId != null ? 'Hay otra confirmación en camino.' : undefined) },", 'el menú dice por qué');
  assert.match(pag, /\{confirmacion\(selectedItem\)\.confirmar \? \(\s*<Button color="teal" icon=\{Check\}/, 'el Drawer');
  assert.match(pag, /\) : confirmacion\(selectedItem\)\.texto && \(\s*<p role="status"[^>]*>\{confirmacion\(selectedItem\)\.texto\}<\/p>/, 'el Drawer: su motivo (m42)');
  trae(pag, 'tarjetaRecepcion(r, { contar: confirmacion(r).confirmar, motivo: confirmacion(r).texto }), [confirmacion])', 'el tablero');
  // «Recepcionar PEC»: la bodega receptora antes de crear (y su cuerpo).
  trae(pag, "import { SelectorBodegaRecepcion, useBodegasRecepcion } from '../bodega-recepcion';");
  trae(pag, 'const bodegas = useBodegasRecepcion(showPecModal);');
  trae(pag, '<SelectorBodegaRecepcion id="bodega-recepcionar-pec" bodegas={bodegas} elegida={bodegaElegida} onElegir={setBodegaElegida}');
  assert.match(pag, /body: JSON\.stringify\(cuerpoRecepcionarPec\(\{\s*creadoPor: user, notas: 'Recepción generada en Mesa de Entrada', bodega: bodegaRecepcion\(bodegaElegida, bodegas\.filas\),\s*\}\)\),/);
  // Inventario › Recepciones: la misma regla en el tablero y en el enlace del Drawer, con su motivo.
  const inv = leerFuente('app/dashboard/inventario/recepciones/page.tsx');
  trae(inv, 'const confirmacion = useCallback((r: FilaRecepcion) => confirmarRecepcion({ ...datosConfirmacion(r), rol }), [rol]);');
  trae(inv, "{confirmacion(selectedItem).confirmar ? 'Contar y confirmar en Compras' : 'Abrir en Compras'}");
  trae(inv, 'tarjetaRecepcion(r, { contar: confirmacion(r).confirmar, motivo: confirmacion(r).texto }), [confirmacion])');
  assert.match(inv, /\{confirmacion\(selectedItem\)\.texto && \(\s*<p role="status"/);
  // «Hacer recepción» del panel del PEC (ADMIN y COMPRAS): la bodega antes de crear; el hook antes del return temprano.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  trae(ped, "const creaRecepcion = avisoRecepcionPec(detail)?.accion.tipo === 'crear' && accesoPec.cambiarPec;");
  assert.ok(ped.indexOf('const bodegas = useBodegasRecepcion(creaRecepcion);') < ped.indexOf('  if (!pec) return null;\n  // C10'), 'el hook va antes del return');
  trae(ped, 'body: JSON.stringify(cuerpoRecepcionarPec({ creadoPor: user, bodega: bodegaRecepcion(bodegaElegida, bodegas.filas) })),');
  assert.match(ped, /\{creaRecepcion && \(\s*<SelectorBodegaRecepcion id="bodega-hacer-recepcion"/);
  // La pieza: el select es opcional, la del pedido por defecto, y un 403 no ofrece «Reintentar».
  const pieza = leerFuente('app/dashboard/compras/bodega-recepcion.tsx');
  trae(pieza, 'const valor = bodegaRecepcion(elegida, bodegas.filas);');
  trae(pieza, "'Sin elegir (la del pedido, si tiene)'"); // r2 (m3, D27)
  trae(pieza, '{ofreceReintentar(bodegas.error) && (');
}

console.log('--- B4 T24 f3 r1 (C2): después del 409, la selección de PVEN deja solo los que siguen pendientes de compra y avisa cuál quitó ---');
{
  const { seleccionVigente, avisoSeleccionQuitada } = ec;
  assert.equal(typeof seleccionVigente, 'function', 'seleccionVigente existe');
  assert.equal(typeof avisoSeleccionQuitada, 'function', 'avisoSeleccionQuitada existe');
  const pvens = [
    { id: 1, numero: 'PVEN-1', estado: 'PENDIENTE_COMPRA' },
    { id: 2, numero: 'PVEN-2', estado: 'EN_PROCESO' }, // otro usuario lo consolidó (el 409)
    { id: 3, numero: 'PVEN-3', estado: ' PENDIENTE_COMPRA ' },
    { id: 4, numero: 'PVEN-4', estado: 'CANCELADO' },
  ];
  // En el orden de la selección; la lista recargada manda.
  assert.deepEqual(seleccionVigente(new Set([3, 2, 1]), pvens), { ids: [3, 1], pvens: [pvens[2], pvens[0]], quitados: ['PVEN-2'] });
  assert.deepEqual(seleccionVigente([4, 9], pvens), { ids: [], pvens: [], quitados: ['PVEN-4', 'PVEN #9'] }, 'el que ya no viene: «PVEN #id»');
  assert.deepEqual(seleccionVigente(new Set(), pvens), { ids: [], pvens: [], quitados: [] });
  assert.deepEqual(seleccionVigente(null, null), { ids: [], pvens: [], quitados: [] });
  assert.deepEqual(seleccionVigente([1], [{ id: 1, estado: 'PENDIENTE_COMPRA' }]).ids, [1]);
  // ven_ids sale de la selección vigente: el PVEN oculto ya no viaja (cada «Crear» repetía el 409).
  assert.deepEqual(ec.vinculoPvenDelPec(seleccionVigente(new Set([2, 1, 3]), pvens).pvens), { ven_id: 1, ven_ids: [1, 3], ven_numero: 'PVEN-1' });
  assert.equal(avisoSeleccionQuitada([]), null);
  assert.equal(avisoSeleccionQuitada(null), null);
  assert.equal(avisoSeleccionQuitada(['PVEN-2']), 'PVEN-2 ya no está pendiente de compra: se quitó de la selección.');
  assert.equal(avisoSeleccionQuitada(['PVEN-2', 'PVEN #9']), 'PVEN-2, PVEN #9 ya no están pendientes de compra: se quitaron de la selección.');

  // NuevoPecModal: el contador, el pie y ven_ids salen de la selección vigente; el aviso de los quitados.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  trae(ped, 'const vigente = seleccionVigente(poda.seleccion ?? selectedPvens, pedidosVenta);'); // r2 (m4, D27): con la poda
  trae(ped, '...vinculoPvenDelPec(vigente.pvens),');
  trae(ped, '{vigente.ids.length} PVEN seleccionado(s)');
  trae(ped, '<span className="font-bold">{vigente.ids.length}</span> PVEN asociado(s)');
  assert.match(ped, /\{avisoQuitados && <p role="status"[^>]*>\{avisoQuitados\}<\/p>\}/);
  assert.ok(!/selectedPvens\.size/.test(ped), 'Pedidos: nada cuenta la selección vieja');
  // El Hub: lo mismo, un solo envío a la vez (loading/disabled) y la selección vacía tras un alta buena.
  const hub = leerFuente('app/dashboard/compras/page.tsx');
  trae(hub, 'const vigente = seleccionVigente(poda.seleccion ?? selectedPvens, pedidosVenta);'); // r2 (m4, D27): con la poda
  trae(hub, 'const selected: FilaVenta[] = vigente.pvens;');
  assert.match(hub, /if \(consolidando\) return;\s*if \(!vigente\.ids\.length\)/, 'un segundo clic no manda otra vez');
  assert.match(hub, /creado con ' \+ selected\.length \+ ' PVEN\(s\) consolidados'\);\s*setSelectedPvens\(new Set\(\)\);\s*setQuitadosPvens\(\[\]\);[^\n]*\s*onUpdate\(\);/, 'tras el alta, la selección vacía (r3, m4: y sin el aviso viejo)');
  assert.match(hub, /\} finally \{\s*setConsolidando\(false\);\s*\}/);
  assert.match(hub, /<button type="button" onClick=\{handleConvertPvens\} disabled=\{consolidando\} aria-busy=\{consolidando\}/);
  trae(hub, "{consolidando ? 'Creando PEC…' : 'Crear PEC Consolidado'}");
  assert.match(hub, /\{avisoQuitados && <p role="status"[^>]*>\{avisoQuitados\}<\/p>\}/);
  assert.ok(!/selectedPvens\.size/.test(hub), 'el Hub: nada cuenta la selección vieja');
}

console.log('--- B4 T24 f3 r1 (C3, m31): el SKU del Kardex se elige con el ratón y con el teclado; las teclas y el cierre en la lib ---');
{
  const { teclaComboboxSku, cierraComboboxAlSalir } = ec;
  assert.equal(typeof teclaComboboxSku, 'function', 'teclaComboboxSku existe');
  assert.equal(typeof cierraComboboxAlSalir, 'function', 'cierraComboboxAlSalir existe');
  const t = (tecla, abierta, indice, total) => teclaComboboxSku({ tecla, abierta, indice, total });
  // Esc: abierta, la cierra y el foco vuelve al campo (también desde una opción: antes caía en <body>); cerrada, no le toca.
  assert.deepEqual(t('Escape', true, 2, 3), { abierta: false, foco: -1 });
  assert.deepEqual(t('Escape', true, -1, 3), { abierta: false, foco: -1 });
  assert.equal(t('Escape', false, -1, 0), null);
  // ↓: cerrada, la abre (el foco sigue en el campo); abierta, baja una (de la última no pasa); sin opciones, nada.
  assert.deepEqual(t('ArrowDown', false, -1, 0), { abierta: true, foco: -1 });
  assert.deepEqual(t('ArrowDown', true, -1, 3), { abierta: true, foco: 0 });
  assert.deepEqual(t('ArrowDown', true, 0, 3), { abierta: true, foco: 1 });
  assert.deepEqual(t('ArrowDown', true, 2, 3), { abierta: true, foco: 2 });
  assert.equal(t('ArrowDown', true, -1, 0), null);
  // ↑: desde la primera vuelve al campo (antes se quedaba en ella); desde el campo, nada.
  assert.deepEqual(t('ArrowUp', true, 0, 3), { abierta: true, foco: -1 });
  assert.deepEqual(t('ArrowUp', true, 2, 3), { abierta: true, foco: 1 });
  assert.equal(t('ArrowUp', true, -1, 3), null);
  assert.equal(t('ArrowUp', false, -1, 0), null);
  for (const otra of ['Enter', 'a', 'Tab', ' ']) assert.equal(t(otra, true, 0, 3), null, `${otra}: no le toca (Enter lo atiende la opción)`);
  // Al salir: se cierra si el foco va fuera (o a ninguna parte: relatedTarget null); no si va a algo de adentro.
  assert.equal(cierraComboboxAlSalir(false), true);
  assert.equal(cierraComboboxAlSalir(true), false);

  // El cableado: el mousedown en la lista no saca el foco del campo (Safari y Firefox de macOS no enfocan el botón: el blur llegaba con
  // relatedTarget null y desmontaba la lista antes del clic); tras Esc y tras elegir, el foco vuelve al campo.
  const k = leerFuente('app/dashboard/inventario/kardex/page.tsx');
  assert.match(k, /role="listbox" aria-label="Productos que coinciden"[^]{0,240}?onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/, 'el ratón elige');
  trae(k, 'const r = teclaComboboxSku({ tecla: e.key, abierta: listaSkuAbierta, indice: opciones.indexOf(document.activeElement as HTMLElement), total: opciones.length });');
  trae(k, 'if (r.foco < 0) refCampoSku.current?.focus(); else opciones[r.foco]?.focus();');
  trae(k, 'setSkuCerrado(!r.abierta);', '↓ con la lista cerrada la abre');
  assert.match(k, /cambiarFiltros\(\{ skuId: o\.id, skuEtiqueta: etiqueta \}\);\s*refCampoSku\.current\?\.focus\(\);/, 'al elegir, el foco vuelve al campo');
  // B4 T24 f4 (m3 de f3 r2): al elegir con el ratón la lista se desmonta (sin onPointerLeave): el ref se reinicia al elegir.
  assert.match(k, /const elegirSku = \(o: OpcionSku\) => \{[\s\S]{0,400}ratonSobreLista\.current = false;[\s\S]{0,200}cambiarFiltros\(\{ skuId: o\.id/);
  trae(k, '<input ref={refCampoSku} type="search" aria-label="Producto o SKU"');
  trae(k, 'onFocus={() => setIndiceSku(i)} onBlur={() => setIndiceSku(-1)}', 'aria-selected sigue a la opción con el foco');
  // «Buscando…», el error y «Ningún producto…» fuera del listbox (que solo admite option o group).
  const lista = k.slice(k.indexOf('role="listbox"'), k.indexOf('</div>', k.indexOf('role="listbox"')));
  assert.ok(!/role="status"|role="alert"|Ningún producto/.test(lista), 'el listbox solo tiene opciones');
  assert.match(k, /<p role="status"[^>]*>Ningún producto coincide con «\{skuTexto\.trim\(\)\}»\.<\/p>/);
}

console.log('--- B4 T24 f3 r1 (F59, F61, F65, F76): la cobertura — la fila vencida del PEC, avanzar y confirmar ejecutados, la hora del Kardex ---');
{
  // F61: columnas-pec.tsx — la clase de la fila vencida, el title «· Vencido» de Entrega est., el chip y las tres columnas clave.
  const colPec = leerFuente('app/dashboard/compras/columnas-pec.tsx');
  trae(colPec, 'export const claseDeFilaPec = (p: FilaColumnasPec) => (p.is_overdue ? `${TABLE.filaAlerta} ${MARCA_VENCIDO}` : null);');
  trae(colPec, "titleCelda: (p) => `${textoDia(p.fecha_entrega_estimada)}${p.is_overdue ? ' · Vencido' : ''}`, celda: (p) => <CeldaEntrega p={p} /> },");
  trae(colPec, "titleCelda: (p) => [p.numero, p.ven_numero, p.is_overdue ? 'Vencido' : null].filter(Boolean).join(' · '),");
  assert.match(colPec, /\{p\.is_overdue && <span className=\{`\$\{CHIP\} text-\[10px\] \$\{CLASE_CHIP\.rose\}`\}>Vencido<\/span>\}/, 'el chip Vencido');
  assert.match(colPec, /\{ id: 'numero', titulo: 'PEC \/ PVEN', ancho: 132, clave: true, fija: 'izquierda'/);
  assert.match(colPec, /\{ id: 'estado', titulo: 'Estado', ancho: 120, clave: true,/);
  assert.match(colPec, /\{ id: 'acciones', titulo: 'Acciones', ancho: 80, clave: true, fija: 'derecha', celda: celdaAcciones \}/);

  // F65: avanzar de Tránsito, ejecutado (no un regex): un 409 recarga, un 500 no, y un segundo clic no manda otro PATCH.
  const tra = leerFuente('app/dashboard/compras/transito/page.tsx');
  const correrAvanzar = async ({ falla, pendiente = false, status = 'COMPLETADO' }) => {
    const llamadas = [];
    const entorno = {
      pendienteRef: { current: () => Boolean(pendiente) },
      iniciarCambio: () => llamadas.push('inicia'),
      aplicarEtapa: async (p, stage, st) => {
        llamadas.push(`PATCH ${p.id} ${stage} ${st}`);
        if (falla) throw Object.assign(new Error('no'), { status: falla });
      },
      avisar: (texto) => llamadas.push(`ok: ${texto}`),
      avisarError: () => llamadas.push('error'),
      recargarTrasError: (err) => err.status === 409,
      recargarTodo: () => llamadas.push('recargar'),
      terminarCambio: () => llamadas.push('termina'),
      descartarCambio: () => llamadas.push('descarta'),
    };
    await funcionEjecutable(tra, 'async (p: FilaTransito, accion: { stage: string; status: string }) =>')(entorno)({ id: 4, numero: 'PEC-4' }, { stage: 'X', status });
    return llamadas;
  };
  assert.deepEqual(await correrAvanzar({}), ['inicia', 'PATCH 4 X COMPLETADO', 'ok: PEC-4: etapa completada', 'recargar', 'termina']);
  assert.deepEqual(await correrAvanzar({ status: 'EN_PROCESO' }), ['inicia', 'PATCH 4 X EN_PROCESO', 'ok: PEC-4: etapa iniciada', 'recargar', 'termina']);
  assert.deepEqual(await correrAvanzar({ falla: 409 }), ['inicia', 'PATCH 4 X COMPLETADO', 'error', 'recargar', 'termina'], 'un 409 recarga');
  assert.deepEqual(await correrAvanzar({ falla: 500 }), ['inicia', 'PATCH 4 X COMPLETADO', 'error', 'descarta'], 'un 500 no recarga');
  assert.deepEqual(await correrAvanzar({ pendiente: true }), [], 'con un cambio en camino, nada');

  // F65: handleConfirmarRecepcion de Compras › Recepciones, ejecutado: el POST con su clave, la carga por fila y la regla única.
  const rec = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  const correrConfirmar = async ({ falla }) => {
    const llamadas = [];
    const entorno = {
      setConfirmandoId: (id) => llamadas.push(`cargando ${id}`),
      localStorage: { getItem: () => 'Ana' },
      crypto: { randomUUID: () => 'clave-1' },
      apiFetch: async (ruta, op) => {
        llamadas.push(`${op.method} ${ruta} ${JSON.parse(op.body).idempotency_key}`);
        if (falla) throw Object.assign(new Error('no'), { status: falla });
      },
      avisar: () => llamadas.push('ok'),
      avisarError: (err, texto) => llamadas.push(`error: ${texto}`),
      setSelectedItem: (v) => llamadas.push(`drawer ${v}`),
      recargarTodo: () => llamadas.push('recargar'),
      recargarTrasError: (err) => [400, 409, 422].includes(err.status),
      numeroRecepcion: (r) => `ENINV-${r.id}`,
      JSON,
    };
    await funcionEjecutable(rec, 'async (r: FilaRecepcion) =>')(entorno)({ id: 8 });
    return llamadas;
  };
  assert.deepEqual(await correrConfirmar({}), ['cargando 8', 'POST /compras/recepciones/8/confirmar clave-1', 'ok', 'drawer null', 'recargar', 'cargando null']);
  assert.deepEqual(await correrConfirmar({ falla: 400 }), ['cargando 8', 'POST /compras/recepciones/8/confirmar clave-1', 'error: No se pudo confirmar ENINV-8', 'recargar', 'cargando null'], 'un 400 (sin bodega) recarga');
  assert.deepEqual(await correrConfirmar({ falla: 500 }), ['cargando 8', 'POST /compras/recepciones/8/confirmar clave-1', 'error: No se pudo confirmar ENINV-8', 'cargando null'], 'un 500 no');

  // F76: la hora de un movimiento del Kardex es horaCO (la fuente única de m13): nada de un Intl.DateTimeFormat propio.
  const fuenteEc = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = fuenteEc.slice(fuenteEc.indexOf('export function textoFechaMovimiento('), fuenteEc.indexOf('\n}\n', fuenteEc.indexOf('export function textoFechaMovimiento(')));
  assert.match(cuerpo, /hora: horaCO\(fecha\)/, 'textoFechaMovimiento usa horaCO');
  assert.ok(!/Intl\.DateTimeFormat|timeZone/.test(sinComentarios(fuenteEc)), 'estados-compras.js no arma fechas con su propia zona');
}

console.log('--- B4 T24 f3 r1 (F71, F77, F69): la Lista y Traslados — la selección y la fecha en la lib, las copias fuera, el ?id= con doble montaje ---');
{
  const { textoSeleccionLista, fechaItemLista, abrirEnlaceTraslado } = ec;
  for (const [nombre, f] of Object.entries({ textoSeleccionLista, fechaItemLista, abrirEnlaceTraslado })) assert.equal(typeof f, 'function', `${nombre} existe`);
  // F71: los casos que nunca se habían visto.
  assert.equal(textoSeleccionLista(1, 1), '1 seleccionado');
  assert.equal(textoSeleccionLista(3, 2), '3 seleccionados; 2 se pueden pedir');
  assert.equal(textoSeleccionLista(2, 1), '2 seleccionados; 1 se puede pedir');
  assert.equal(textoSeleccionLista(1, 0), '1 seleccionado; 0 se pueden pedir');
  assert.equal(textoSeleccionLista(4, 4), '4 seleccionados');
  assert.equal(fechaItemLista({ fecha: '2026-11-07T10:00:00' }), '2026-11-07T10:00:00', 'I1: la Lista lee `fecha`');
  assert.equal(fechaItemLista({ fecha_creacion: 'x' }), null);
  assert.equal(fechaItemLista(null), null);
  const lis = leerFuente('app/dashboard/compras/lista-compras/page.tsx');
  trae(lis, 'fechaMovimiento: fechaItemLista,');
  noTrae(sinComentarios(lis), 'const textoSeleccion =', 'sin la copia local');
  noTrae(sinComentarios(lis), 'const fechaDeItem =', 'sin la copia local');

  // F77: Compras › Recepciones y Traslados importan de la lib lo que Inventario ya usa (RP41).
  const rec = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  trae(rec, 'const pestanas: PestanaTabla[] = pestanasRecepcion(conteos);');
  trae(rec, 'extra: enKanban ? EXTRA_TABLERO_RECEPCION : null,');
  noTrae(sinComentarios(rec), 'pestanasDeRecepciones', 'sin la copia local de las pestañas');
  const tra = leerFuente('app/dashboard/compras/traslados/page.tsx');
  trae(tra, 'const pestanas: PestanaTabla[] = pestanasTraslado(listado.conteos);');
  trae(tra, 'apiFetch(RUTA_CONTEOS_TRASLADOS, { signal: control.signal })');
  for (const copia of ['pestanasDeTraslados', 'const RUTA_CONTEOS =', 'const columnaDeTraslado =', 'const fechaDeTraslado =']) noTrae(sinComentarios(tra), copia, `sin ${copia}`);
  assert.match(tra, /columnaDe: columnaDeTraslado,\s*fechaMovimiento: fechaDeTraslado,/, 'el tablero con las de la lib');

  // F69: el efecto del ?id= ejecutado con un apiFetch falso que RESPETA el signal: montar, limpiar (el doble montaje de React) y volver
  // a montar pide otra vez y abre UNA vez; con la marca puesta, un tercer montaje no pide. Antes sobrevivían la marca en la limpieza
  // (V1) y en el catch del abort (V2).
  const montar = (marca, idDeLaUrl, registro, filas = [{ id: 63, status: 'DONE' }]) => abrirEnlaceTraslado({
    marca, idDeLaUrl,
    pedir: (ruta, { signal }) => {
      registro.push(`GET ${ruta}`);
      return new Promise((resolver, rechazar) => {
        const t = setTimeout(() => resolver({ status: 'success', data: filas }), 5);
        signal.addEventListener('abort', () => { clearTimeout(t); rechazar(Object.assign(new Error('abortada'), { name: 'AbortError' })); });
      });
    },
    abrir: (fila) => registro.push(`abrir ${fila.id}`),
    avisar: (texto) => registro.push(`aviso ${texto}`),
    avisarError: () => registro.push('error'),
  });
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const marca = { current: null };
  const registro = [];
  const limpiar1 = montar(marca, '63', registro);
  limpiar1(); // el doble montaje: la primera se aborta
  assert.equal(marca.current, null, 'abortada: la marca queda libre');
  const limpiar2 = montar(marca, '63', registro);
  await espera(20);
  assert.deepEqual(registro, ['GET /inventory/operations?operation_type=TRANSFER&id=63&limit=5', 'GET /inventory/operations?operation_type=TRANSFER&id=63&limit=5', 'abrir 63'],
    'el segundo montaje vuelve a pedir y abre una sola vez; el abort no avisa ni marca');
  assert.equal(marca.current, '63', 'la marca, cuando llegó');
  limpiar2();
  montar(marca, '063', registro);
  await espera(10);
  assert.equal(registro.length, 3, 'ya atendido (también ?id=063): no pide otra vez');
  // No existe: avisa UNA vez y marca.
  const otra = { current: null };
  const r2 = [];
  montar(otra, '64', r2, []);
  await espera(20);
  assert.deepEqual(r2, ['GET /inventory/operations?operation_type=TRANSFER&id=64&limit=5', 'aviso No se encontró el traslado TRL-0064.']);
  assert.equal(otra.current, '64');
  // Un error de verdad (no un abort) se avisa y deja la marca libre.
  const libre = { current: null };
  const r3 = [];
  abrirEnlaceTraslado({ marca: libre, idDeLaUrl: '7', pedir: async () => { throw Object.assign(new Error('caído'), { status: 500 }); }, abrir: () => {}, avisar: () => {}, avisarError: () => r3.push('error') });
  await espera(5);
  assert.deepEqual(r3, ['error']);
  assert.equal(libre.current, null);
  assert.equal(typeof montar({ current: null }, 'x', []), 'function', 'sin id válido: una limpieza que no hace nada');
}

console.log('--- B4 T24 f3 r1 (m2, m3, m4, m5, m10, m11, m15, m16, m20, m24, m39, m41): comentarios fieles, textos y roles en Compras e Inventario ---');
{
  const fuenteEc = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // m4: el tope de m16 sale de la columna del modelo (Numeric(p, s) de GoodsReceiptLine.quantity_received), no de un literal.
  const modelo = readFileSync(new URL('../../backend/app/models/fase1b.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const clase = modelo.slice(modelo.indexOf('class GoodsReceiptLine(Base):'), modelo.indexOf('class GoodsReceiptLineAllocation(Base):'));
  const [, p, s] = /quantity_received\s*=\s*Column\(Numeric\((\d+),\s*(\d+)\)/.exec(clase) ?? [];
  assert.ok(p && s, 'la columna del modelo');
  assert.equal(ec.MAX_CANTIDAD_CONTEO, 10 ** (Number(p) - Number(s)) - 1, 'MAX_CANTIDAD_CONTEO = 10^(p-s) - 1 de la columna');
  assert.match(readFileSync(new URL('../../backend/app/api/v1/erp_compras.py', import.meta.url), 'utf8'),
    /_TIPO_CANTIDAD_GRL = GoodsReceiptLine\.__table__\.c\.quantity_received\.type\s*MAX_CANTIDAD_LINEA = 10 \*\* \(_TIPO_CANTIDAD_GRL\.precision - _TIPO_CANTIDAD_GRL\.scale\) - 1/,
    'el servidor deriva MAX_CANTIDAD_LINEA de la misma columna');
  // m2 / m28: el JSDoc de confirmacionDespacho ya no dice que el servidor bloquea por saldo; m5: el de la llegada del enlace de Productos.
  const entregas = readFileSync(new URL('../src/lib/entregas.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!entregas.includes('el servidor tiene la misma regla desde FINAL-m35'), 'm2: sin el comentario falso');
  assert.match(entregas, /el servidor NO bloquea por saldo/);
  assert.ok(!fuenteEc.includes('`q` también encuentra los que lo contienen'), 'm5: sin el contrato viejo');
  assert.match(fuenteEc, /filtra por el SKU EXACTO distinguiendo mayúsculas/);
  // m3: el JSDoc de TEXTO_SEGUIMIENTO_CERRADO va pegado a su export.
  const flujoFuente = readFileSync(new URL('../src/lib/flujo-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(flujoFuente, /\/\*\* El texto de un seguimiento cerrado \(el panel de la lista, el del Hub y el detalle dicen lo mismo\)\. \*\/\nexport const TEXTO_SEGUIMIENTO_CERRADO = /);
  assert.ok(!/\*\/\n\/\*\* B4 T24 f3 \(m21 del backend r1\)/.test(flujoFuente), 'sin dos JSDoc seguidos');
  // m10: el comentario de Historial no coincide con la búsqueda de RP99 («en construcci»).
  const historial = leerFuente('app/dashboard/compras/historial/page.tsx');
  assert.equal((historial.slice(0, 600).match(/en construcci/gi) ?? []).length, 0, 'm10: la cabecera no lleva «en construcci»');
  // m11 / m21 / m37: el aviso de /inventory/stats va SOBRE las tarjetas; con los indicadores bien, no se le culpa.
  assert.equal(ec.textoAlertaSinDato(true), 'El aviso sobre las tarjetas dice qué falló.');
  assert.equal(ec.textoAlertaSinDato(false), 'El servidor no dio el número de agotados.');
  const abasto = leerFuente('app/dashboard/inventario/abastecimiento/page.tsx');
  assert.ok(abasto.indexOf('<AvisoReintentar error={stats.error}') < abasto.indexOf('<FranjaKpis'), 'el aviso de stats va antes (sobre) la franja');
  // m15: un PEC ya recibido soltado en «En bodega» no lleva a Recepciones (su selector no lo lista).
  for (const estado of ['RECIBIDA', 'COMPLETADO']) {
    assert.deepEqual(ec.reglaSoltarPec({ id: 1, estado }, ec.columnaPec(estado), 'en_bodega'), { tipo: 'bloqueado', motivo: 'Ya llegó a bodega: su estado lo lleva la recepción.' }, estado);
  }
  assert.equal(ec.reglaSoltarPec({ id: 1, estado: 'RECIBIDO' }, 'en_bodega', 'recibido').enlace?.href, '/dashboard/compras/recepciones', 'en bodega → recibido sigue con su enlace');
  // m16: sin el catálogo, «la categoría elegida» (nunca «#7») en Stock, Abastecimiento y Productos.
  for (const ruta of ['app/dashboard/inventario/stock/page.tsx', 'app/dashboard/inventario/abastecimiento/page.tsx', 'app/dashboard/inventario/productos/page.tsx']) {
    const f = leerFuente(ruta);
    assert.ok(!/\?\? `#\$\{/.test(f), `${ruta}: sin el id crudo`);
    assert.match(f, /\?\.name \?\? true\) : null;/, `${ruta}: true sin el catálogo`);
  }
  assert.equal(ec.textoVacioProductos({ categoria: true }).titulo, 'Ningún producto en la categoría elegida.');
  assert.equal(ec.textoVacioProductos({ q: 'tenis', categoria: true }).titulo, 'Ningún producto coincide con «tenis» en la categoría elegida.');
  assert.equal(ec.textoVacioProductos({ categoria: 'Calzado' }).titulo, 'Ningún producto en la categoría «Calzado».', 'con nombre, como antes');
  // m20: «Recepcionar» de la tarjeta y el aviso del panel solo empujan a quien recepciona (ADMIN y COMPRAS).
  const enBodega = { id: 3, estado: 'RECIBIDO' };
  assert.equal(ec.tarjetaPedidoCompra(enBodega).accionPrincipal?.texto, 'Recepcionar', 'sin opciones, como antes');
  assert.equal(ec.tarjetaPedidoCompra(enBodega, { recepcionar: true }).accionPrincipal?.texto, 'Recepcionar');
  assert.equal(ec.tarjetaPedidoCompra(enBodega, { recepcionar: false }).accionPrincipal, null, 'sin permiso, la tarjeta queda en «Abrir»');
  const parcial = { id: 3, estado: 'PARCIALMENTE_RECIBIDA', recepciones: [] };
  assert.equal(ec.avisoRecepcionPec(parcial).texto, 'Falta por recibir: inicia la recepción de lo que falta.', 'como antes');
  assert.equal(ec.avisoRecepcionPec(parcial, { recepcionar: false }).texto, 'Falta recibir el resto: la recepción la abre Compras.');
  assert.equal(ec.avisoRecepcionPec(enBodega, { recepcionar: false }).texto, 'Falta la recepción: la abre Compras.');
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  trae(ped, 'const tarjetaDePec = useCallback((p: FilaPec) => tarjetaPedidoCompra(p, { recepcionar: accesoPec.cambiarPec }), [accesoPec.cambiarPec]);');
  trae(ped, 'tarjetaDe={tarjetaDePec}');
  // m24: el error de Almacenes con AvisoDeError (sin el «Reintentar» fijo).
  const hub = leerFuente('app/dashboard/inventario/page.tsx');
  assert.ok(!/onClick=\{listado\.recargar\}[\s\S]{0,300}Reintentar/.test(hub), 'sin el botón fijo');
  // m39: «Editar proveedor» no se cierra mientras guarda.
  const lis = leerFuente('app/dashboard/compras/lista-compras/page.tsx');
  trae(lis, '<Modal cierreExterno={false} bloquearCierre={ocupadoId === editando.id} title="Editar proveedor"');
  trae(lis, '<Button variant="secondary" disabled={ocupadoId === editando.id} onClick={() => setEditando(null)}>Cancelar</Button>');
  // m41 (la bodega): «Sin alertas», no «Bien abastecido».
  assert.equal(ec.textoPieBodega(0).texto, 'Sin alertas');
}

console.log('--- B4 T24 f3 r1 (m6, m18, m22, m25, m31, m36, m40, m43): Nuevo Casillero en la pila, el pie frente a la IA, el foco al reintentar y las cargas en la lib ---');
{
  const { estadoReintento, guardarConteoEnSerie, textoFalloConteo, abrirEnlaceProducto } = ec;
  for (const [nombre, f] of Object.entries({ estadoReintento, guardarConteoEnSerie, textoFalloConteo, abrirEnlaceProducto })) assert.equal(typeof f, 'function', `${nombre} existe`);
  // m18 / m31: la lectura de una carga con vuelta (los PVEN del Hub y el enlace de Productos).
  const e403 = Object.assign(new Error('Sin permiso'), { status: 403 });
  const e500 = Object.assign(new Error('Caído'), { status: 500 });
  assert.deepEqual(estadoReintento({ vuelta: -1, error: null }, 0), { cargando: true, error: null, reintentando: false, ofrecer: false }, 'la primera carga');
  assert.deepEqual(estadoReintento({ vuelta: 0, error: null }, 0), { cargando: false, error: null, reintentando: false, ofrecer: false }, 'llegó');
  assert.deepEqual(estadoReintento({ vuelta: 0, error: e500 }, 0), { cargando: false, error: e500, reintentando: false, ofrecer: true }, 'falló: «Reintentar»');
  assert.deepEqual(estadoReintento({ vuelta: 0, error: e500 }, 1), { cargando: true, error: e500, reintentando: true, ofrecer: true }, 'reintentando: el error se conserva (el aviso sigue montado)');
  assert.equal(estadoReintento({ vuelta: 0, error: e403 }, 0).ofrecer, false, 'un 403 no ofrece «Reintentar»');
  assert.equal(estadoReintento(null, 0).cargando, true);
  // m22: la serie del PATCH por línea se detiene en la primera que falla; el aviso nombra la línea y dice cuántas quedaron guardadas.
  const enviadas = [];
  const serie = await guardarConteoEnSerie([{ grl_id: 1, cuerpo: 'a' }, { grl_id: 2, cuerpo: 'b' }, { grl_id: 3, cuerpo: 'c' }], async (p) => {
    enviadas.push(p.grl_id);
    if (p.grl_id === 2) throw e500;
  });
  assert.deepEqual(enviadas, [1, 2], 'la tercera no sale');
  assert.deepEqual(serie, { guardadas: 1, fallo: { grl_id: 2, error: e500 } });
  assert.deepEqual(await guardarConteoEnSerie([{ grl_id: 1, cuerpo: 'a' }], async () => {}), { guardadas: 1, fallo: null });
  assert.deepEqual(await guardarConteoEnSerie(null, async () => {}), { guardadas: 0, fallo: null });
  assert.equal(textoFalloConteo('Tornillo', 1), 'No se pudo guardar la línea «Tornillo»; la anterior quedó guardada');
  assert.equal(textoFalloConteo(' Tenis ', 3), 'No se pudo guardar la línea «Tenis»; las 3 anteriores quedaron guardadas');
  assert.equal(textoFalloConteo(null, 0), 'No se pudo guardar una línea');
  const cont = leerFuente('app/dashboard/compras/recepciones/[id]/page.tsx');
  assert.match(cont, /avisarError\(serie\.fallo\.error, textoFalloConteo\(nombre, serie\.guardadas\)\);\s*if \(recargarTrasError\(serie\.fallo\.error\)\) await loadRecepcion\(\{ silencioso: true \}\);\s*return false;/,
    'avisa la línea y recarga solo con la regla única (400, 409, 422 o la red)');
  // m18 (B40-f): el efecto del enlace de Productos, ejecutado: un abort no marca ni avisa; al llegar, alError(null) y abre; si falla, alError.
  const espera = (ms) => new Promise((r) => setTimeout(r, ms));
  const montarProducto = (marca, sku, registro, { filas = [{ id: 9, skus: [{ sku: 'ABC' }] }], falla = null } = {}) => abrirEnlaceProducto({
    marca, idDeLaUrl: null, skuDeLaUrl: sku,
    pedir: (ruta, { signal }) => {
      registro.push(`GET ${ruta}`);
      return new Promise((resolver, rechazar) => {
        const t = setTimeout(() => (falla ? rechazar(falla) : resolver({ status: 'success', data: filas })), 5);
        signal.addEventListener('abort', () => { clearTimeout(t); rechazar(Object.assign(new Error('abortada'), { name: 'AbortError' })); });
      });
    },
    abrir: (p) => registro.push(`abrir ${p.id}`),
    avisar: (texto) => registro.push(`aviso ${texto}`),
    alError: (err) => registro.push(`error ${err === null ? 'null' : err.status}`),
  });
  const marcaP = { current: null };
  const rp = [];
  montarProducto(marcaP, 'ABC', rp)();
  assert.equal(marcaP.current, null, 'abortada: la marca queda libre');
  montarProducto(marcaP, 'ABC', rp);
  await espera(20);
  assert.equal(rp.filter((x) => x.startsWith('GET')).length, 2, 'el segundo montaje vuelve a pedir');
  assert.deepEqual(rp.slice(2), ['error null', 'abrir 9'], 'al llegar: el error se limpia y abre (una vez)');
  const libreP = { current: null };
  const rf = [];
  montarProducto(libreP, 'ABC', rf, { falla: e500 });
  await espera(20);
  assert.deepEqual(rf.slice(1), ['error 500'], 'si falla: alError con el error');
  assert.equal(libreP.current, null, 'y la marca libre (Reintentar vuelve a pedir)');
  // B4 T24 f4 (m10 de f3 r2 = m25, X26): el «no encontrado» (filas []) se avisa, y la marca queda puesta (no vuelve a pedir).
  const nadaP = { current: null };
  const rn = [];
  montarProducto(nadaP, 'ZZZ', rn, { filas: [] });
  await espera(20);
  assert.deepEqual(rn.slice(1), ['error null', 'aviso No se encontró un producto con el SKU «ZZZ».'], 'no encontrado: se avisa (X26)');
  assert.equal(nadaP.current, 'sku:ZZZ');
  // B4 T24 f4 (m12 de f3 r2): si el enlace ya no está en la URL (o ya se atendió), no hay nada que pedir: se cierra la vuelta con
  // alError(null), y «Reintentando…» no se queda pegado (ni el aviso de un enlace que ya no está a la vista).
  const sinEnlace = [];
  abrirEnlaceProducto({ marca: { current: null }, idDeLaUrl: null, skuDeLaUrl: null, pedir: () => { sinEnlace.push('GET'); return Promise.resolve({}); },
    abrir: () => sinEnlace.push('abrir'), avisar: () => sinEnlace.push('aviso'), alError: (e) => sinEnlace.push(`error ${e === null ? 'null' : 'x'}`) })();
  assert.deepEqual(sinEnlace, ['error null'], 'sin ?id= ni ?sku=: cierra la vuelta, sin pedir');
  const yaAtendido = [];
  abrirEnlaceProducto({ marca: { current: 'sku:ABC' }, idDeLaUrl: null, skuDeLaUrl: 'ABC', pedir: () => { yaAtendido.push('GET'); return Promise.resolve({}); },
    abrir: () => {}, avisar: () => {}, alError: (e) => yaAtendido.push(`error ${e === null ? 'null' : 'x'}`) })();
  assert.deepEqual(yaAtendido, ['error null'], 'el mismo enlace ya atendido: no vuelve a pedir');
  {
    // Con la vuelta cerrada, estadoReintento ya no dice «reintentando».
    const { estadoReintento } = ec;
    assert.equal(estadoReintento({ vuelta: 1, error: e500 }, 2).reintentando, true, 'pidiendo otra vez');
    assert.deepEqual(estadoReintento({ vuelta: 2, error: null }, 2), { cargando: false, error: null, reintentando: false, ofrecer: false }, 'la vuelta cerrada');
  }
  // m10 (X27): Productos avisa el «no encontrado» en tono 'info'.
  trae(leerFuente('app/dashboard/inventario/productos/page.tsx'), "avisar: (texto) => avisar(texto, { tono: 'info' }),", 'el aviso del enlace, informativo');
  // m10 (X28 a X30): el Esc del autocompletar del Kardex no saca de la pantalla completa: preventDefault y stopPropagation.
  assert.match(leerFuente('app/dashboard/inventario/kardex/page.tsx'), /if \(!r\) return;\s*e\.preventDefault\(\);\s*if \(e\.key === 'Escape'\) e\.stopPropagation\(\);/,
    'teclaSku: preventDefault y, con Esc, stopPropagation');
  // m25: en la primera carga, el panel de PVEN del Hub dice «Cargando…», nunca el vacío falso.
  const hub = leerFuente('app/dashboard/compras/page.tsx');
  assert.match(hub, /\) : filteredPvens\.length === 0 && cargandoVentas \? \(\s*\/\* r1 \(m25\)[^*]*\*\/\s*<p role="status"[^>]*>Cargando pedidos de venta…<\/p>/);
  // m36: el aviso de /stats sigue montado mientras se reintenta y el botón conserva el foco («Reintentando…», aria-disabled).
  const pieza = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8');
  // B4 T24 f4 (m8 de f3 r3; D27): el último se guarda con su cuenta.
  assert.match(pieza, /if \(error != null && \(error !== ultimo \|\| cuenta !== cuentaDelUltimo\)\) \{\s*setUltimo\(error\);/);
  assert.ok(!/[^-]disabled=\{reintentando/.test(pieza), 'aria-disabled, no disabled (el foco no se pierde)');
  assert.match(pieza, /aria-disabled=\{reintentando \|\| undefined\}/);

  // m6 = m27 = m38: «Nuevo Casillero» es un Modal de la pila (encima de la ventana; «alta» sobre el alta de un PEC), con la regla de F40.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  const nuevo = ped.slice(ped.indexOf('function NewCasilleroModal('), ped.indexOf('function TrackingConfigModal('));
  assert.match(nuevo, /<Modal cierreExterno=\{false\} bloquearCierre=\{saving\} capa=\{capa\} title="Nuevo Casillero" subtitle="Punto de recepción \/ forwarder"/);
  assert.match(nuevo, /<button type="submit" form="form-nuevo-casillero" disabled=\{saving\}/, 'el botón del pie envía el formulario');
  assert.match(nuevo, /<form id="form-nuevo-casillero" onSubmit=\{save\}/);
  trae(ped, '<NewCasilleroModal capa="alta"', 'desde el alta de un PEC (z-[80]), en la capa alta');
  assert.match(readFileSync(new URL('../src/components/ui/Modal.tsx', import.meta.url), 'utf8'), /capa\?: 'base' \| 'encima' \| 'alta';/);
  // m40: la ventana de seguimiento — FOCOS en su pie, sus pestañas, el tipo de envío y «Nuevo Casillero»; la papelera con su nombre; tildes.
  const ventana = ped.slice(ped.indexOf('function TrackingConfigModal('), ped.indexOf('function TrackingPanel('));
  assert.ok((ventana.match(/\$\{FOCOS\.purple\}/g) ?? []).length >= 6, 'el foco con el token en los botones de la ventana');
  trae(ventana, 'aria-label={`Eliminar el casillero ${c.name}`}');
  for (const sinTilde of ['Configuracion de etapas guardada', 'identificador unico', 'Key (unica)', "'Sin direccion'"]) noTrae(ped, sinTilde, `sin «${sinTilde}»`);
  for (const sinTilde of ['Punto de recepcion / forwarder', '>Direccion<', '>Punto de Recepcion<', '>Telefono<', '>Pais<']) noTrae(nuevo, sinTilde, `sin «${sinTilde}»`);
  // m43: el pie de todo Drawer y el de la ventana de seguimiento reservan el área del botón de la IA a la derecha.
  const ds = readFileSync(new URL('../src/lib/design-system.ts', import.meta.url), 'utf8');
  assert.match(ds, /export const RESERVA_BOTON_IA_PIE = 'pr-24';/);
  const drawer = readFileSync(new URL('../src/components/ui/Drawer.tsx', import.meta.url), 'utf8');
  assert.match(drawer, /<div className=\{`p-6 \$\{RESERVA_BOTON_IA_PIE\} border-t border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-3 \[&>:not\(:first-child\)\]:ml-auto`\}>/); // r3 (m11, D27); f4 (m4 = m6 de f3 r3, D27)
  assert.match(ventana, /maxWidth="3xl" onClose=\{onClose\} reservaBotonIa/);
}

console.log('--- B4 T24 f3 r1 (m14 = m23, m41): Almacenes no sigue un filtro de bodega que no aplica; las mismas etiquetas en el Hub y en Pedidos ---');
{
  const { filtrosAplicadosHub } = ec;
  assert.equal(typeof filtrosAplicadosHub, 'function', 'filtrosAplicadosHub existe');
  assert.deepEqual(filtrosAplicadosHub({ verAlmacenes: false, bodega: '2', categoria: '' }), { mostrarBodega: true, bodegaAplica: true, hayFiltros: true });
  assert.deepEqual(filtrosAplicadosHub({ verAlmacenes: true, bodega: '2', categoria: '' }), { mostrarBodega: false, bodegaAplica: false, hayFiltros: false },
    'en Almacenes la bodega no aplica: ni el selector ni «Quitar filtros» por ella');
  assert.deepEqual(filtrosAplicadosHub({ verAlmacenes: true, bodega: '2', categoria: '7' }), { mostrarBodega: false, bodegaAplica: false, hayFiltros: true });
  assert.deepEqual(filtrosAplicadosHub({ verAlmacenes: false, bodega: '', categoria: '' }), { mostrarBodega: true, bodegaAplica: false, hayFiltros: false });
  const hub = leerFuente('app/dashboard/inventario/page.tsx');
  trae(hub, 'const aplicados = filtrosAplicadosHub({ verAlmacenes, bodega: filtros.bodega, categoria: filtros.categoria });');
  trae(hub, 'const bodegaDelVacio = aplicados.bodegaAplica ? nombreBodega : null;');
  assert.match(hub, /\{aplicados\.mostrarBodega \? \(\s*<SelectorCatalogo etiqueta="Bodega"[\s\S]*?\) : \(\s*<span[^>]*>En Almacenes se ven todas las bodegas<\/span>/);
  trae(hub, "onClick={() => cambiarFiltros(verAlmacenes ? { categoria: '' } : SIN_FILTROS)}");
  // m41: «Transportadora» e «Información» también en Pedidos (como en el Hub, F54); «Pendiente de compra» con su etiqueta en el Hub.
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  for (const viejo of ['Carrier:', '>Carrier<', "['Carrier',", "l:'Info'}"]) noTrae(ped, viejo, `Pedidos sin ${viejo}`);
  trae(ped, "['Transportadora',detail?.carrier||'-']");
  trae(ped, "{k:'info',l:'Información'}");
  const hubCompras = leerFuente('app/dashboard/compras/page.tsx');
  noTrae(hubCompras, 'estado Pendiente Compra', 'el Hub sin «Pendiente Compra»');
  assert.equal((hubCompras.match(/\{infoEstadoPedido\('PENDIENTE_COMPRA'\)\.label\}/g) ?? []).length >= 3, true, 'la etiqueta del estado en el panel');
}

console.log('--- B4 T24 f3 r1 (F93): el Kanban de Productos con una categoría elegida muestra solo su columna, aunque esté fuera de las 12 ---');
{
  const cats = Array.from({ length: 14 }, (_, i) => ({ id: i + 1, name: `Cat ${String(i + 1).padStart(2, '0')}` }));
  const todas = ec.columnasProductos(cats);
  assert.equal(todas.columnas.length, 12, 'sin elegida: las 12 de siempre');
  assert.equal(todas.masCategorias, 2);
  // La 14 queda fuera de las 12: antes, elegirla dejaba 12 columnas vacías (consultaColumnaProducto da null en todas).
  assert.ok(!todas.columnas.some((c) => c.estados[0] === '14'), 'la 14 no está entre las 12');
  const sola = ec.columnasProductos(cats, undefined, { elegida: '14' });
  assert.deepEqual(sola.columnas.map((c) => [c.clave, c.titulo, c.estados]), [['cat-14', 'Cat 14', ['14']]], 'solo su columna');
  assert.equal(sola.masCategorias, 0);
  assert.equal(sola.aviso, null);
  assert.notEqual(ec.consultaColumnaProducto(null, sola.columnas[0], { categoria: '14' }, { limit: 25, offset: 0 }), null, 'y su columna pide productos');
  assert.equal(ec.columnasProductos(cats, undefined, { elegida: '3' }).columnas.length, 1, 'también una de las 12');
  assert.equal(ec.columnasProductos(cats, undefined, { elegida: '99' }).columnas.length, 12, 'una que no está en el catálogo: como antes');
  assert.equal(ec.columnasProductos(cats, undefined, { elegida: '' }).columnas.length, 12);
  assert.equal(ec.columnasProductos(cats, undefined, {}).columnas.length, 12);
}

console.log('--- B4 T24 f3 r1 (F81): los catálogos de Inventario — una forma inesperada es un error, el error con filas viejas se dice, «Reintentar» da señal ---');
{
  const { filasDeCatalogo } = ec;
  assert.equal(typeof filasDeCatalogo, 'function', 'filasDeCatalogo existe');
  assert.deepEqual(filasDeCatalogo({ status: 'success', data: [{ id: 1, name: 'Central' }] }), { filas: [{ id: 1, name: 'Central' }], error: null });
  assert.deepEqual(filasDeCatalogo([{ id: 2, name: 'Norte' }]), { filas: [{ id: 2, name: 'Norte' }], error: null });
  assert.deepEqual(filasDeCatalogo({ status: 'success', data: [] }), { filas: [], error: null }, 'una lista vacía de verdad');
  for (const rara of [null, {}, { data: { items: 'x' } }, 'texto', { data: null }]) {
    const r = filasDeCatalogo(rara);
    assert.equal(r.filas, null, `${JSON.stringify(rara)}: sin filas falsas`);
    assert.match(String(r.error?.message), /no trae la lista/, `${JSON.stringify(rara)}: es un error`);
  }
  // La pieza nueva (aviso-catalogo.tsx): el error con filas viejas, junto al select (sin filas lo dice SelectorCatalogo), con «Reintentar»
  // que da señal; el Hub la pone junto a sus dos selectores.
  const aviso = leerFuente('app/dashboard/inventario/aviso-catalogo.tsx');
  trae(aviso, 'if (catalogo.error == null || !catalogo.filas) return null;');
  // r2 (m20, D27): el rol y el texto salen de avisoDeFuente (la regla de AvisoFuente: sin doble punto; un 403 es de permiso).
  trae(aviso, "<span role={aviso.tipo === 'permiso' ? 'status' : 'alert'}");
  trae(aviso, '{aviso.texto}');
  trae(aviso, '{aviso.reintentar && (', 'un 403 no ofrece «Reintentar»');
  trae(aviso, "{catalogo.cargando ? 'Reintentando…' : 'Reintentar'}");
  const piezas = leerFuente('app/dashboard/inventario/piezas-inventario.tsx');
  trae(piezas, "{catalogo.cargando ? 'Reintentando…' : 'Reintentar'}", 'SelectorCatalogo sin filas: también da señal');
  trae(leerFuente('app/dashboard/inventario/page.tsx'), '<AvisoCatalogoViejo catalogo={bodegas} fallo="No se pudieron actualizar las bodegas" onReintentar={reintentarCatalogos} />');
  const hub = leerFuente('app/dashboard/inventario/page.tsx');
  // B4 T24 f4 (m5 de f3 r2; D27): el Hub usa la vuelta de la lib (llegadaCatalogo con filasDeCatalogo; lecturaCatalogo con `cargando`
  // mientras no llega la de esta vuelta), sin su copia literal.
  trae(hub, 'fijar((c) => llegadaCatalogo(c, r, vueltaCatalogos))');
  assert.ok(!/const lista = \(r: \{ data\?: unknown \} \| null\) =>/.test(hub), 'sin la lectura que convertía todo en []');
  assert.match(hub, /lecturaCatalogo\(cargaBodegas, vueltaCatalogos\)/);
  {
    const { llegadaCatalogo, lecturaCatalogo } = await import('../src/lib/estados-compras.js');
    assert.equal(lecturaCatalogo(llegadaCatalogo(null, { data: [{ id: 1 }] }, 2), 3).cargando, true, 'de otra vuelta: cargando');
    assert.equal(lecturaCatalogo(llegadaCatalogo(null, { x: 1 }, 3), 3).error instanceof Error, true, 'una forma inesperada es un error');
  }
}

console.log('--- B4 T24 f3 r2 (F81 en el hook, m36 completo, m20): la vuelta de los catálogos en la lib y el foco nunca en el <body> ---');
{
  const { CARGA_CATALOGO_VACIA, llegadaCatalogo, falloCatalogo, lecturaCatalogo } = ec;
  for (const [n, f] of Object.entries({ llegadaCatalogo, falloCatalogo, lecturaCatalogo })) assert.equal(typeof f, 'function', `${n} existe`);
  // F81: la carga de un catálogo con su vuelta (useCatalogo y el Hub; así llega a Stock, Abastecimiento, Productos y el Kardex).
  assert.deepEqual({ ...CARGA_CATALOGO_VACIA }, { vuelta: -1, filas: null, error: null });
  assert.deepEqual(lecturaCatalogo(CARGA_CATALOGO_VACIA, 0), { filas: null, error: null, cargando: true }, 'la primera carga');
  const bien = llegadaCatalogo(CARGA_CATALOGO_VACIA, { data: [{ id: 1, name: 'Calzado' }] }, 0);
  assert.deepEqual(lecturaCatalogo(bien, 0), { filas: [{ id: 1, name: 'Calzado' }], error: null, cargando: false });
  assert.equal(lecturaCatalogo(bien, 1).cargando, true, '«Reintentar» o «Actualizar»: cargando, con lo último a la vista');
  const e500 = Object.assign(new Error('Caído'), { status: 500 });
  const fallo = falloCatalogo(bien, e500, 1);
  assert.deepEqual(lecturaCatalogo(fallo, 1), { filas: [{ id: 1, name: 'Calzado' }], error: e500, cargando: false }, 'el error conserva lo último bueno');
  const rara = llegadaCatalogo(bien, { data: 'x' }, 2);
  assert.deepEqual(rara.filas, [{ id: 1, name: 'Calzado' }], 'una forma inesperada no borra lo último');
  assert.match(String(rara.error?.message), /no trae la lista/);
  const piezas = leerFuente('app/dashboard/inventario/piezas-inventario.tsx');
  trae(piezas, 'return { catalogo: lecturaCatalogo(carga, vuelta), recargar };', 'useCatalogo lee la carga con la lib');
  for (const pantalla of ['stock', 'abastecimiento', 'productos', 'kardex']) {
    const f = leerFuente(`app/dashboard/inventario/${pantalla}/page.tsx`);
    assert.match(f, /<AvisoCatalogoViejo catalogo=\{\w+\} fallo="No se pudieron actualizar las (?:categorías|bodegas)" onReintentar=\{\w+\}/, `${pantalla}: el error con filas viejas, junto al selector`);
  }
  // m20: aviso-catalogo.tsx usa la regla de AvisoFuente (avisoDeFuente): sin doble punto y un 403 sin «Reintentar».
  const av = await import('../src/lib/avisos.js');
  assert.equal(av.avisoDeFuente(new Error('Servidor caído.'), 'No se pudieron actualizar las bodegas').texto, 'No se pudieron actualizar las bodegas: Servidor caído.', 'sin doble punto');
  assert.ok(!/textoDeError|ofreceReintentar/.test(leerFuente('app/dashboard/inventario/aviso-catalogo.tsx').replace(/\/\/[^\n]*/g, '')), 'no reimplementa la regla');

  // m36 (ruling): adónde va el foco cuando cambia el aviso de una fuente que se reintenta — mientras, éxito, otro error y 403.
  const { focoTrasReintento } = av;
  assert.equal(typeof focoTrasReintento, 'function', 'focoTrasReintento existe');
  assert.equal(focoTrasReintento({ teniaFoco: true, hayBoton: true }), 'boton', 'mientras reintenta («Reintentando…») o con otro error: se queda en el botón');
  assert.equal(focoTrasReintento({ teniaFoco: true, hayBoton: false }), 'destino', 'salió bien (el aviso se va) o un 403 (sin botón): al destino VISIBLE (r3, D27)');
  assert.equal(focoTrasReintento({ teniaFoco: false, hayBoton: false }), null, 'si el botón no tenía el foco, nada');
  assert.equal(focoTrasReintento({ teniaFoco: false, hayBoton: true }), null);
  // El cableado: AvisoDeError con regionFoco (aditivo) vive en una región tabindex=-1 montada siempre, y el botón avisa al irse.
  const pieza = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(pieza, /return \(\) => alSoltarBoton\(document\.activeElement === nodo\);/, 'el ref con limpieza mira si el botón tenía el foco');
  // B4 T24 f4 (m2 + m10 de f3 r3; D27): el destino se busca por su id (destinoFoco → getElementById), no por el texto del aria-label.
  assert.match(pieza, /focoTrasReintento\(\{ teniaFoco, hayBoton: ultimoHayBoton\.current \}\) === 'destino' && document\.activeElement === document\.body && destinoFoco\)/); // r3 (C, D27)
  assert.ok(!/sr-only|Sin avisos/.test(pieza), 'r3 (C): sin la región sr-only ni su texto'); // D27
  assert.match(pieza, /alSoltarBoton=\{destinoFoco \? alSoltarBoton : undefined\}/, 'solo con destinoFoco (aditivo)');
  for (const ruta of ['app/dashboard/compras/page.tsx', 'app/dashboard/compras/pedidos/page.tsx', 'app/dashboard/compras/transito/page.tsx',
    'app/dashboard/compras/recepciones/page.tsx', 'app/dashboard/compras/lista-compras/page.tsx', 'app/dashboard/inventario/page.tsx']) {
    const f = leerFuente(ruta);
    assert.match(f, /<AvisoDeError error=\{stats\.error\}[^\n]*reintentando=\{stats\.cargando\} destinoFoco="[^"]+" \/>/, `${ruta}: el aviso de /stats con su destino`); // r3 (D27)
    assert.ok(!/stats\.cargando\) && \(\s*<AvisoDeError/.test(f), `${ruta}: montado siempre (si se desmonta, la región se va con él)`);
  }
  trae(piezas, 'export function AvisoReintentar(props: React.ComponentProps<typeof AvisoDeError>) {', 'AvisoReintentar acepta el mismo contrato');
}

console.log('--- B4 T24 f3 r2 (m1, m2, m3, m4, m5, m8, m11, m14, m16, m19, m21, m23, m28): el menú, la tarjeta, la bodega, la poda, el combobox y las ventanas ---');
{
  const roles = await import('../src/lib/roles.js');
  const { itemConfirmarMenu } = roles;
  assert.equal(typeof itemConfirmarMenu, 'function', 'itemConfirmarMenu existe');
  const menu = (heredada, sinBodega, rol, porConfirmar = true) => itemConfirmarMenu({ porConfirmar, heredada, sinBodega, rol });
  const oculto = { oculto: true, deshabilitado: false, titulo: null };
  // m1: en una heredada que el rol no cierra, el ítem se OCULTA (A-bis); apagado con su motivo, solo sin bodega (C1).
  assert.deepEqual(menu(true, false, 'BODEGA'), oculto, 'BODEGA, heredada: oculto');
  assert.deepEqual(menu(true, true, 'BODEGA'), oculto, 'BODEGA, heredada sin bodega: oculto');
  assert.deepEqual(menu(true, true, 'ADMIN'), oculto, 'ADMIN, heredada sin bodega: oculto (m14: manda la heredada)');
  assert.deepEqual(menu(true, false, 'ADMIN'), { oculto: false, deshabilitado: false, titulo: null }, 'ADMIN cierra la heredada');
  assert.deepEqual(menu(false, true, 'BODEGA'), { oculto: false, deshabilitado: true, titulo: roles.TEXTO_FALTA_BODEGA }, 'sin bodega: apagado con su motivo');
  assert.deepEqual(menu(false, true, 'ADMIN'), { oculto: false, deshabilitado: true, titulo: roles.TEXTO_ASIGNA_BODEGA });
  assert.deepEqual(menu(false, false, 'COMPRAS'), oculto, 'el rol no confirma');
  assert.deepEqual(menu(false, false, 'BODEGA', false), oculto, 'no está por confirmar');
  assert.deepEqual(menu(false, false, 'BODEGA'), { oculto: false, deshabilitado: false, titulo: null });
  // m14: heredada y sin bodega, fuera del detalle: el texto de la heredada, también para ADMIN.
  assert.equal(roles.confirmarRecepcion({ porConfirmar: true, heredada: true, sinBodega: true, rol: 'ADMIN' }).texto, roles.TEXTO_RECEPCION_HEREDADA);
  // m2: la tarjeta sin «Contar y confirmar» lleva el motivo (aditivo).
  const r = { id: 7, estado: 'BORRADOR' };
  // B4 T24 f4 (m16 de f3 r2; D27): el motivo ya no es un chip (truncate a 10 px cortaba la mitad de 60 a 80 caracteres): va en una
  // línea de la tarjeta que hace salto (`nota`, aditiva en TarjetaKanban).
  const conMotivo = ec.tarjetaRecepcion(r, { contar: false, motivo: roles.TEXTO_RECEPCION_HEREDADA });
  assert.deepEqual([conMotivo.chips, conMotivo.nota], [[], roles.TEXTO_RECEPCION_HEREDADA], 'el motivo entero, en la nota');
  assert.equal(ec.tarjetaRecepcion(r, { contar: true, motivo: 'x' }).nota, null, 'con la acción, sin el motivo');
  assert.deepEqual([ec.tarjetaRecepcion(r, { contar: false }).chips, ec.tarjetaRecepcion(r, { contar: false }).nota], [[], null], 'sin motivo, como antes');
  {
    const kanban = readFileSync(new URL('../src/components/ui/Kanban.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(kanban, /nota\?: string \| null;/, 'la nota, aditiva en DatosTarjetaKanban');
    assert.match(kanban, /\{nota && <p className="mt-2 whitespace-normal break-words text-\[11px\] font-semibold leading-snug text-slate-600">\{nota\}<\/p>\}/,
      'una línea que hace salto (sin truncate)');
  }
  // m4 = m7: la poda de la selección guardada.
  const pvens = [{ id: 1, numero: 'PVEN-1', estado: 'PENDIENTE_COMPRA' }, { id: 2, numero: 'PVEN-2', estado: 'EN_PROCESO' }];
  const poda = ec.podarSeleccion(new Set([1, 2]), pvens);
  assert.deepEqual([...poda.seleccion], [1], 'la selección guardada queda sin el quitado');
  assert.deepEqual(poda.quitados, ['PVEN-2']);
  assert.deepEqual(ec.podarSeleccion(new Set([1]), pvens), { seleccion: null, quitados: [] }, 'nada que podar: no cambia (sin bucle)');
  // Si el quitado vuelve a PENDIENTE_COMPRA, ya no está marcado.
  assert.deepEqual(ec.seleccionVigente(poda.seleccion, [...pvens.slice(0, 1), { id: 2, numero: 'PVEN-2', estado: 'PENDIENTE_COMPRA' }]).ids, [1]);
  for (const ruta of ['app/dashboard/compras/pedidos/page.tsx', 'app/dashboard/compras/page.tsx']) {
    trae(leerFuente(ruta), 'if (poda.seleccion) { setSelectedPvens(poda.seleccion); setQuitadosPvens(poda.quitados); }', `${ruta}: poda la selección guardada`);
  }
  // m5 = m15: la decisión de cierre del combobox, entera en la lib.
  const { cierraComboboxAlSalir } = ec;
  assert.equal(cierraComboboxAlSalir(true), false, 'hacia adentro: no cierra');
  assert.equal(cierraComboboxAlSalir(false), true, 'hacia afuera: cierra');
  assert.equal(cierraComboboxAlSalir(false, { sinDestino: true, ratonSobreLista: true }), false, 'Safari: un clic en una opción (blur sin destino, el ratón sobre la lista)');
  assert.equal(cierraComboboxAlSalir(false, { sinDestino: true, ratonSobreLista: false }), true, 'un clic en la página: cierra');
  assert.equal(cierraComboboxAlSalir(false, { sinDestino: false, ratonSobreLista: true }), true, 'Tab hacia otro control: cierra');
  // m8: textoAlertaSinDato no queda entre un JSDoc y su export; m28: una sola rama para la foto sin tomar.
  const fuenteEc = readFileSync(new URL('../src/lib/estados-compras.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(fuenteEc, /\/\*\* La columna del tablero de Traslados \(su estado\) y el día en que se hizo \(la fecha real\)\. \*\/\nexport const columnaDeTraslado = /);
  const transito = readFileSync(new URL('../src/lib/transito.js', import.meta.url), 'utf8');
  assert.ok(!/if \(e\.fin\.filas === SIN_FOTO\)/.test(transito), 'm28: sin la rama duplicada');
  // m3 y m16: la bodega — la opción vacía, los botones apagados mientras cargan y el reinicio al cambiar de PEC o al reabrir.
  trae(leerFuente('app/dashboard/compras/bodega-recepcion.tsx'), "'Sin elegir (la del pedido, si tiene)'");
  const rec = leerFuente('app/dashboard/compras/recepciones/page.tsx');
  trae(rec, 'disabled={creatingFromPec !== null || bodegas.cargando}', 'm3: «Recepcionar» apagado mientras cargan las bodegas');
  trae(rec, 'onClick={() => { setBodegaElegida(null); setShowPecModal(true); }}', 'm16: al reabrir, sin la elegida de antes');
  const ped = leerFuente('app/dashboard/compras/pedidos/page.tsx');
  trae(ped, 'disabled={goingToRecepcion || (creaRecepcion && bodegas.cargando)}', 'm3: «Hacer recepción» apagado mientras cargan');
  trae(ped, "useEffect(()=>{setDetail(pec);setTab('tracking');setBodegaElegida(null);},[pec?.id]);", 'm16: al cambiar de PEC');
  // m21: «Nuevo Casillero» ya no se abre solo; el vacío ofrece el botón.
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bogotá', resultados: [], elegido: null }), true);
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bogotá', resultados: null, elegido: null }), false, 'la búsqueda no terminó');
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bogotá', resultados: [{ id: 1 }], elegido: null }), false);
  assert.equal(ec.ofrecerCrearCasillero({ texto: ' ', resultados: [], elegido: null }), false);
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bogotá', resultados: [], elegido: { id: 1 } }), false);
  assert.ok(!/if \(arr\.length === 0\) setShowNewCasillero\(true\);/.test(ped), 'm21: no se abre solo');
  // B4 T24 f4 (m7 de f3 r2 = m20): la guarda REAL («terminó la búsqueda de ESTE texto») pasa a la lib: con `buscado` (el último texto
  // buscado) distinto del que hay en la caja, no se ofrece (escribir la primera letra, antes de buscar, no ofrece «Crear casillero»).
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bo', buscado: 'B', resultados: [], elegido: null }), false, 'se escribió más: la búsqueda de ESTE texto no terminó');
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'B', buscado: '', resultados: [], elegido: null }), false, 'la primera letra, antes de buscar');
  assert.equal(ec.ofrecerCrearCasillero({ texto: 'Bogotá', buscado: 'Bogotá', resultados: [], elegido: null }), true, 'buscó este texto y no hay');
  assert.ok(ped.includes('ofrecerCrearCasillero({ texto: casilleroSearch, buscado: casilleroBuscado, resultados: casilleroResults, elegido: selectedCasillero })'),
    'la página pasa el texto y lo buscado tal cual (la guarda vive en la lib)');
  assert.match(ped, /ofrecerCrearCasillero\(\{[^}]*\}\) && \(\s*<p role="status"[^>]*>Ningún casillero coincide\.\{' '\}\s*<button type="button" onClick=\{\(\)=>setShowNewCasillero\(true\)\}/);
  // m19: el pie del Drawer baja sus botones antes de la reserva (flex-wrap); m23: la reserva del pie de Modal, con su prueba.
  assert.match(readFileSync(new URL('../src/components/ui/Drawer.tsx', import.meta.url), 'utf8'), /\$\{RESERVA_BOTON_IA_PIE\} border-t border-slate-200 bg-slate-50 flex flex-wrap/);
  const modal = readFileSync(new URL('../src/components/ui/Modal.tsx', import.meta.url), 'utf8');
  assert.match(modal, /<div className=\{`px-6 py-4 \$\{reservaBotonIa \? RESERVA_BOTON_IA_PIE : ''\} border-t/, 'm23: el pie de Modal con la reserva');
  assert.match(modal, /reservaBotonIa = false,/, 'm23: aditivo (por defecto, sin la reserva)');
  // m11: el bloque FINAL-m10 también mira las partes por separado (como TEST 26).
  const hub = leerFuente('app/dashboard/compras/page.tsx');
  const boton = hub.slice(hub.indexOf('{vigente.ids.length > 0 && accesoPec.cambiarPec && ('), hub.indexOf('Crear PEC Consolidado'));
  for (const parte of ['vigente.ids.length > 0', 'accesoPec.cambiarPec', 'onClick={handleConvertPvens}']) assert.ok(boton.includes(parte), `m11: ${parte}`);
}

console.log('--- B4 T24 f3 r2 (m36, el banco): un solo contrato de reintentando; el enlace de Productos deja el foco en el título de la ficha ---');
{
  const pieza = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8');
  assert.match(pieza, /<AvisoFuente aviso=\{aviso\} onReintentar=\{onReintentar\} acento=\{acento\} reintentando=\{reintentando\}/,
    'reintentando llega tal cual (estadoReintento conserva el error mientras reintenta: con «error == null &&» el botón no decía «Reintentando…»)');
  const p = leerFuente('app/dashboard/inventario/productos/page.tsx');
  trae(p, '<h1 id="ficha-producto-titulo" tabIndex={-1}');
  trae(p, "abrir: (p) => { openEdit(p); requestAnimationFrame(() => document.getElementById('ficha-producto-titulo')?.focus()); },",
    'el enlace abre la ficha (la lista y su aviso se van): el foco va a su título');
}

console.log('--- B4 T24 f3 r3 (C1 = C3, C2 = C4, C, m4, m6, m9, m11): el aviso no vuelve tras un reintento bueno; m36 en las pantallas de m17; el foco a la franja ---');
{
  const av = await import('../src/lib/avisos.js');
  const { avisoVisible, focoTrasReintento } = av;
  assert.equal(typeof avisoVisible, 'function', 'avisoVisible existe');
  const e500 = Object.assign(new Error('Caído'), { status: 500 });
  const e403 = Object.assign(new Error('Sin permiso'), { status: 403 });
  // C1: los cinco casos del ruling.
  assert.deepEqual(avisoVisible({ error: e500, ultimo: e500, reintentando: true }), { visto: e500, olvidar: false }, 'el error conservado mientras se reintenta (estadoReintento)');
  assert.deepEqual(avisoVisible({ error: null, ultimo: e500, reintentando: true }), { visto: e500, olvidar: false }, 'error null mientras se reintenta (useResumen), con un último');
  assert.deepEqual(avisoVisible({ error: null, ultimo: e500, reintentando: false }), { visto: null, olvidar: true }, 'un éxito OLVIDA el último');
  assert.deepEqual(avisoVisible({ error: null, ultimo: null, reintentando: true }), { visto: null, olvidar: false }, 'una recarga normal sin último: nada');
  assert.deepEqual(avisoVisible({ error: null, ultimo: null, reintentando: false }), { visto: null, olvidar: false });
  assert.deepEqual(avisoVisible({ error: e403, ultimo: null, reintentando: false }), { visto: e403, olvidar: false }, 'un 403: su aviso (de permiso, sin «Reintentar»)');
  assert.equal(av.avisoDeFuente(e403, 'x')?.reintentar, false);
  // B4 T24 f4 (m8 de f3 r3): el último es de UNA cuenta. Si la sesión pasa a otra (otra pestaña, el re-ingreso), mientras carga la nueva
  // no se pinta el error de la anterior (ni su aviso de permiso), y se olvida.
  assert.deepEqual(avisoVisible({ error: null, ultimo: e403, reintentando: true, cuenta: 8, cuentaDelUltimo: 7 }), { visto: null, olvidar: true },
    'otra cuenta cargando: nada de la anterior');
  assert.deepEqual(avisoVisible({ error: null, ultimo: e500, reintentando: true, cuenta: 7, cuentaDelUltimo: 7 }), { visto: e500, olvidar: false },
    'la misma cuenta reintentando: el último sigue');
  assert.deepEqual(avisoVisible({ error: e500, ultimo: e403, reintentando: false, cuenta: 8, cuentaDelUltimo: 7 }), { visto: e500, olvidar: false },
    'un error de la cuenta nueva sí se ve');
  assert.deepEqual(avisoVisible({ error: null, ultimo: e500, reintentando: true }), { visto: e500, olvidar: false }, 'sin cuentas (aditivo): como antes');
  {
    const piezaCuenta = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(piezaCuenta, /const cuenta = usuarioDeLaSesion\(\);/);
    assert.match(piezaCuenta, /avisoVisible\(\{ error, ultimo, reintentando, cuenta, cuentaDelUltimo \}\)/);
    assert.match(piezaCuenta, /if \(error != null && \(error !== ultimo \|\| cuenta !== cuentaDelUltimo\)\) \{\s*setUltimo\(error\);\s*setCuentaDelUltimo\(cuenta\);\s*\}/);
  }
  // La secuencia de la regresión: falla, reintento bueno, «Actualizar» (otra carga sin error): ningún aviso falso.
  let ultimo = null;
  const paso = (error, reintentando) => {
    const { visto, olvidar } = avisoVisible({ error, ultimo, reintentando });
    if (error != null) ultimo = error; else if (olvidar) ultimo = null;
    return visto;
  };
  assert.equal(paso(e500, false), e500, 'falla');
  assert.equal(paso(null, true), e500, 'Reintentar: «Reintentando…» con el último');
  assert.equal(paso(null, false), null, 'salió bien: nada');
  assert.equal(paso(null, true), null, '«Actualizar» después: NO vuelve el error viejo (era la regresión de r2)');
  const pieza = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(pieza, /else if \(olvidar\) setUltimo\(null\);/, 'AvisoDeError limpia el último');
  // C (ruling de la duda 4): el destino del foco es VISIBLE — la franja de tarjetas (tabindex=-1). B4 T24 f4 (m2 + m10 de f3 r3; D27):
  // buscada por su id (idFoco de FranjaKpis ↔ destinoFoco de AvisoDeError), no por el texto de su aria-label.
  assert.equal(focoTrasReintento({ teniaFoco: true, hayBoton: false }), 'destino');
  assert.match(pieza, /document\.getElementById\(destinoFoco\)\?\.focus\(\);/);
  assert.ok(!/querySelector<HTMLElement>\(`section\[aria-label|regionFoco/.test(pieza), 'sin la búsqueda por el texto ni el nombre viejo');
  assert.ok(!/sr-only|Sin avisos|aria-label=\{aviso/.test(pieza), 'sin la región sr-only ni el aria-label sobre un div sin rol');
  // B4 T24 f4 (m5 = m7 de f3 r3; D27): la franja, como destino, con el token de foco neutro (focus-visible), fuera del orden de Tab.
  const franjaKpi = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(franjaKpi, /<section id=\{idFoco\} aria-label=\{titulo\} aria-busy=\{estado === 'cargando'\} className=\{`@container rounded-2xl \$\{FOCOS\.slate\}`\} tabIndex=\{-1\}>/);
  assert.match(franjaKpi, /children, estado = 'listo', nota, titulo = 'Indicadores', idFoco,/);
  // m2 + m10 (mueren M3 y M4): en CADA pantalla, cada destinoFoco es el idFoco de una franja del MISMO archivo (y los ids no se repiten).
  const PANTALLAS_DESTINO = ['compras/page.tsx', 'compras/pedidos/page.tsx', 'compras/transito/page.tsx', 'compras/recepciones/page.tsx',
    'compras/lista-compras/page.tsx', 'inventario/page.tsx', 'inventario/stock/page.tsx', 'inventario/abastecimiento/page.tsx',
    'inventario/entregas/page.tsx', 'inventario/recepciones/page.tsx', 'inventario/productos/page.tsx'];
  const idsVistos = new Set();
  for (const ruta of PANTALLAS_DESTINO) {
    const f = leerFuente(`app/dashboard/${ruta}`);
    const destinos = [...f.matchAll(/destinoFoco="([^"]+)"/g)].map((m) => m[1]);
    const ids = [...f.matchAll(/(?:idFoco|id)="(franja-[^"]+|productos-[^"]+)"/g)].map((m) => m[1]);
    assert.ok(destinos.length >= 1, `${ruta}: el aviso tiene destino`);
    for (const d of destinos) assert.ok(ids.includes(d), `${ruta}: «${d}» es el id de un destino del mismo archivo (${ids})`);
    for (const id of new Set(ids)) { assert.ok(!idsVistos.has(id), `«${id}» no se repite entre pantallas`); idsVistos.add(id); }
    assert.ok(!/regionFoco/.test(f), `${ruta}: sin el nombre viejo`);
  }
  // C2 = C4: las pantallas de m17, montadas como el Hub, con SU franja como destino.
  for (const [ruta, id, reintentando] of [['stock', 'franja-stock', 'stats.cargando'], ['abastecimiento', 'franja-abastecimiento', 'stats.cargando'],
    ['entregas', 'franja-entregas', 'stats.cargando'], ['recepciones', 'franja-entradas', 'cargandoStats']]) {
    const f = leerFuente(`app/dashboard/inventario/${ruta}/page.tsx`);
    assert.ok(f.includes(`reintentando={${reintentando}} destinoFoco="${id}" />`), `${ruta}: el aviso con reintentando y su destino`);
    assert.match(f, new RegExp(`<FranjaKpis[^>]*idFoco="${id}"`), `${ruta}: la franja «${id}» existe`);
    // B4 T24 f4 (m1 de f3 r3; mueren M1 y M2): el aviso de /stats montado SIEMPRE: sin una condición delante.
    assert.ok(!/&& \(\s*<AvisoReintentar error=\{(?:stats\.error|errorStats|compras\.error)\}[^\n]*destinoFoco=/.test(f), `${ruta}: montado siempre`);
    for (const vieja of ["{estadoKpis === 'error' && (", "{estadoCompras === 'error' && (", '{errorStats != null && (', '{stats.error != null && (']) {
      assert.ok(!f.includes(`${vieja}\n        <AvisoReintentar`) && !new RegExp(`${vieja.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*<AvisoReintentar`).test(f), `${ruta}: sin «${vieja}» delante del aviso`);
    }
  }
  // B4 T24 f4 (m3 = m9 de f3 r3): Productos tiene un destino visible para el aviso del enlace (el 403 y el «no existe» tras un reintento).
  const prod = leerFuente('app/dashboard/inventario/productos/page.tsx');
  assert.ok(prod.includes('<section ref={refTarjeta} className={`${claseTarjeta} ${FOCOS.slate}`} id="productos-lista" tabIndex={-1} aria-label="Productos">'));
  assert.match(prod, /<AvisoDeError error=\{cargaEnlace\.error\} fallo="No se pudo abrir el producto del enlace" acento="purple" reintentando=\{cargaEnlace\.reintentando\}\s+onReintentar=\{\(\) => setVueltaEnlace\(\(n\) => n \+ 1\)\} destinoFoco="productos-lista" \/>/);
  // y los comentarios viejos («el foco va a su región») dicen lo de ahora: a la franja (o a la lista, en Productos).
  for (const ruta of PANTALLAS_DESTINO) assert.ok(!leerFuente(`app/dashboard/${ruta}`).includes('el foco va a su región'), `${ruta}: el comentario al día`);
  // m6: sin el código muerto. m9: el comentario de Tránsito al día. m4: el aviso de los quitados se reinicia. m11: el botón que baja, a la derecha.
  noTrae(leerFuente('app/dashboard/compras/recepciones/page.tsx'), 'const porConfirmar = esRecepcionPorConfirmar(r);');
  trae(leerFuente('app/dashboard/compras/transito/page.tsx'), 'terminarPendiente deja la foto SIN TOMAR');
  trae(leerFuente('app/dashboard/compras/page.tsx'), "setSelectedPvens(new Set()); setQuitadosPvens([]); }, [pec && pec.id]);");
  // B4 T24 f4 (m4 = m6 de f3 r3; D27): la regla del pie, solo para pies de dos o más elementos (uno solo no se mueve a la derecha).
  // Lo equivalente del ruling: ml-auto en cada hijo que no es el primero (un pie de uno no se mueve; el del centro de tres no se pega
  // al primero; lo que baja solo va a la derecha). Medido en el banco a 375 y a 1024.
  const pie = readFileSync(new URL('../src/components/ui/Drawer.tsx', import.meta.url), 'utf8');
  assert.match(pie, /flex flex-wrap items-center justify-between gap-3 \[&>:not\(:first-child\)\]:ml-auto`\}>/);
  assert.ok(!/\[&>:last-child\]:ml-auto/.test(pie), 'sin la regla que movía también un pie de un solo elemento');
}

console.log('\nOK: test_estados_compras.mjs');
