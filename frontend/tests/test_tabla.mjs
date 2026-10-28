/**
 * frontend/tests/test_tabla.mjs
 * Bloque 4, T3A (TABLA-base puntos 1 y 2, TABLA-api, R5, C3, RP8, RP54 y D23): la lógica pura de la tabla estándar
 * (lib/tabla.js). Columnas que se reconcilian con lo guardado, se mueven sin cruzar las fijas y se estiran dentro de su
 * mínimo y su máximo; orden, filtro y paginación del modo cliente; el estado único de la pantalla (reducirEstadoTabla:
 * todo cambio que no sea de página vuelve a la página 1) y los parámetros que se mandan al servidor (queryListado, con
 * q y estados en CSV, nunca search ni estado=) más la lectura de las cuatro formas de respuesta (normalizarRespuesta).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import {
  TAMANOS_PAGINA, VERSION_PREFS, ANCHO_MIN, ANCHO_MAX, ANCHO_POR_DEFECTO, MODOS_TABLA,
  reconciliarColumnas, fijasDe, moverColumna, indiceDestino, limitarAncho, offsetsFijas, alternarOrden,
  filtrarFilas, ordenarFilas, paginar, totalPaginas, rangoPaginas, paginaValida, textoRango,
  ESTADO_TABLA_INICIAL, estadoTablaInicial, reducirEstadoTabla, queryListado, normalizarRespuesta,
  esModoTabla, posicionMenu,
  CAMPOS_SESION_TABLA, claveSesionTabla, textoSesionTabla, leerSesionTabla, armarEstadoTabla, cambiosEstadoTabla,
  dependenciasTablero, parteDeColumnas, urlListado, crearCargaListado, aplicarLlegadaListado, estadoListado,
  listadoCliente,
  MAXIMO_ESTADOS, sesionVigente, escriturasDeAccion, guardarCambioColumnas, lanzarListado, esErrorDeOrden, rechazoPorAtender,
  ESPERA_PREFERENCIAS_MS, esperarPreferencias, listoConTope,
  UMBRAL_MOVER_COLUMNA, superaUmbralColumna, ANCHO_AJUSTE_CONTENIDO, RELLENO_CELDA, anchoAlContenido, ajustarAlAncho,
  ANCHO_SELECCION, geometriaTabla, destinoArrastre, bordeDeHueco, campoOrden, direccionOrden, accesoresDeOrden,
  vistaCuerpo, filasConGrupos, paginaCorregida, alternarSeleccion, estadoSeleccionPagina, alternarSeleccionPagina,
  firmaSeleccion, RETARDO_BUSQUEDA_MS, crearBusquedaConRetardo, sincronizarBusqueda, textoResultados, opcionesDeVista,
  accionPestana, alternarEstado, puedeDesplazar, estadoDeConteo,
} from '../src/lib/tabla.js';

const ids = (filas) => filas.map((f) => f.id);

console.log('--- TEST 1: constantes ---');
{
  assert.deepEqual(TAMANOS_PAGINA, [25, 50]);
  assert.ok(Object.isFrozen(TAMANOS_PAGINA));
  assert.equal(VERSION_PREFS, 1);
  assert.equal(ANCHO_MIN, 64);
  assert.equal(ANCHO_MAX, 640);
  assert.ok(ANCHO_POR_DEFECTO >= ANCHO_MIN && ANCHO_POR_DEFECTO <= ANCHO_MAX);
  assert.deepEqual(MODOS_TABLA, ['lista', 'kanban']);
}

const DEFINICION = [
  { id: 'sel', ancho: 40, anchoMin: 40, anchoMax: 40, clave: true, fija: 'izquierda' },
  { id: 'num', ancho: 120, clave: true, fija: 'izquierda' },
  { id: 'cli', ancho: 200 },
  { id: 'est', ancho: 140 },
  { id: 'monto', ancho: 120, ocultaPorDefecto: true },
  { id: 'acc', ancho: 56, anchoMin: 56, anchoMax: 56, fija: 'derecha' },
];
const POR_DEFECTO = {
  orden: ['sel', 'num', 'cli', 'est', 'monto', 'acc'],
  anchos: { sel: 40, num: 120, cli: 200, est: 140, monto: 120, acc: 56 },
  ocultas: ['monto'],
};
const guardado = (parcial) => ({ version: VERSION_PREFS, ...parcial });

console.log('--- TEST 2: reconciliarColumnas ---');
{
  assert.deepEqual(reconciliarColumnas(DEFINICION, null), POR_DEFECTO, 'sin nada guardado: lo por defecto');
  assert.deepEqual(reconciliarColumnas(DEFINICION, undefined), POR_DEFECTO);

  // Un id guardado que ya no existe se descarta (del orden, de los anchos y de las ocultas).
  const r1 = reconciliarColumnas(DEFINICION, guardado({
    orden: ['sel', 'num', 'viejo', 'est', 'cli', 'monto', 'acc'], anchos: { viejo: 300, cli: 250 }, ocultas: ['viejo'],
  }));
  assert.deepEqual(r1.orden, ['sel', 'num', 'est', 'cli', 'monto', 'acc']);
  assert.equal(r1.anchos.cli, 250);
  assert.ok(!('viejo' in r1.anchos));
  assert.deepEqual(r1.ocultas, [], 'monto estaba en lo guardado y no estaba oculta: se respeta');

  // Una columna nueva entra después de su vecina por defecto ('est' va después de 'cli').
  const r2 = reconciliarColumnas(DEFINICION, guardado({ orden: ['sel', 'num', 'monto', 'cli', 'acc'], ocultas: [] }));
  assert.deepEqual(r2.orden, ['sel', 'num', 'monto', 'cli', 'est', 'acc']);
  // Una nueva con ocultaPorDefecto entra oculta.
  const r3 = reconciliarColumnas(DEFINICION, guardado({ orden: ['sel', 'num', 'est', 'cli', 'acc'], ocultas: [] }));
  assert.deepEqual(r3.orden, ['sel', 'num', 'est', 'monto', 'cli', 'acc'], 'monto va después de est, su vecina, aunque est se movió');
  assert.deepEqual(r3.ocultas, ['monto']);
  // Dos nuevas seguidas conservan su orden por defecto.
  const r4 = reconciliarColumnas(DEFINICION, guardado({ orden: ['sel', 'num', 'cli', 'acc'] }));
  assert.deepEqual(r4.orden, ['sel', 'num', 'cli', 'est', 'monto', 'acc']);

  // Una columna clave en 'ocultas' vuelve a verse.
  const r5 = reconciliarColumnas(DEFINICION, guardado({ orden: POR_DEFECTO.orden, ocultas: ['num', 'cli', 'sel'] }));
  assert.deepEqual(r5.ocultas, ['cli']);

  // Un ancho de 9999 queda en anchoMax; uno de 10, en anchoMin; uno que no es número, en el de la definición.
  const r6 = reconciliarColumnas(DEFINICION, guardado({
    orden: POR_DEFECTO.orden, anchos: { cli: 9999, est: 10, num: 'ancho', sel: 300 },
  }));
  assert.equal(r6.anchos.cli, ANCHO_MAX);
  assert.equal(r6.anchos.est, ANCHO_MIN);
  assert.equal(r6.anchos.num, 120);
  assert.equal(r6.anchos.sel, 40, 'la casilla tiene mínimo y máximo de 40');

  // Otra versión (o ninguna) vuelve a lo por defecto.
  const otra = { version: VERSION_PREFS + 1, orden: ['cli', 'sel'], anchos: { cli: 500 }, ocultas: ['est'] };
  assert.deepEqual(reconciliarColumnas(DEFINICION, otra), POR_DEFECTO);
  assert.deepEqual(reconciliarColumnas(DEFINICION, { orden: ['cli'], anchos: { cli: 500 } }), POR_DEFECTO);

  // Las fijas quedan a los lados aunque lo guardado diga otra cosa.
  const r7 = reconciliarColumnas(DEFINICION, guardado({ orden: ['acc', 'cli', 'sel', 'num', 'est', 'monto'] }));
  assert.deepEqual(r7.orden, ['sel', 'num', 'cli', 'est', 'monto', 'acc']);

  // Una columna sin ancho toma ANCHO_POR_DEFECTO; los ids repetidos son un error de programación.
  assert.equal(reconciliarColumnas([{ id: 'x' }], null).anchos.x, ANCHO_POR_DEFECTO);
  assert.throws(() => reconciliarColumnas([{ id: 'x' }, { id: 'x' }], null), /repetid/);

  // No muta lo que recibe.
  const copia = structuredClone(DEFINICION);
  const g = guardado({ orden: ['cli', 'sel'], anchos: { cli: 9999 }, ocultas: ['num'] });
  const gCopia = structuredClone(g);
  reconciliarColumnas(DEFINICION, g);
  assert.deepEqual(DEFINICION, copia);
  assert.deepEqual(g, gCopia);
}

console.log('--- TEST 3: fijasDe y moverColumna ---');
{
  const fijas = fijasDe(DEFINICION);
  assert.deepEqual(fijas, { sel: 'izquierda', num: 'izquierda', acc: 'derecha' });
  const orden = ['sel', 'num', 'cli', 'est', 'acc'];
  const antes = [...orden];
  assert.deepEqual(moverColumna(orden, 'est', 0, fijas), ['sel', 'num', 'est', 'cli', 'acc'], "'est' al 0 queda después de 'num'");
  assert.deepEqual(moverColumna(orden, 'acc', 0, fijas), orden, "mover 'acc' (fija) no cambia nada");
  assert.deepEqual(moverColumna(orden, 'sel', 3, fijas), orden, 'una fija a la izquierda tampoco se mueve');
  assert.deepEqual(moverColumna(orden, 'cli', 4, fijas), ['sel', 'num', 'est', 'cli', 'acc'], "'cli' después de 'est'");
  assert.deepEqual(moverColumna(orden, 'cli', 99, fijas), ['sel', 'num', 'est', 'cli', 'acc'], 'no cruza la fija de la derecha');
  assert.deepEqual(moverColumna(orden, 'est', 2, fijas), ['sel', 'num', 'est', 'cli', 'acc']);
  assert.deepEqual(moverColumna(orden, 'cli', 2, fijas), orden, 'a su mismo lugar');
  assert.deepEqual(moverColumna(orden, 'cli', 3, fijas), orden, 'el hueco justo después de sí misma: tampoco cambia');
  assert.deepEqual(moverColumna(orden, 'nada', 1, fijas), orden, 'un id que no está no cambia nada');
  assert.deepEqual(moverColumna(orden, 'cli', Number.NaN, fijas), orden);
  assert.deepEqual(orden, antes, 'no muta el orden recibido');
  assert.deepEqual(moverColumna(['a', 'b', 'c'], 'c', 0), ['c', 'a', 'b'], 'sin fijas');
}

console.log('--- TEST 4: indiceDestino ---');
{
  const bordes = [[0, 100], [100, 250], [250, 400]];
  assert.equal(indiceDestino(bordes, 40), 0);
  assert.equal(indiceDestino(bordes, 180), 2);
  assert.equal(indiceDestino(bordes, 900), 3);
  assert.equal(indiceDestino(bordes, -5), 0);
  const rects = [{ left: 0, right: 100 }, { left: 100, right: 250 }, { left: 250, right: 400 }];
  assert.equal(indiceDestino(rects, 180), 2, 'acepta rectángulos como los de getBoundingClientRect');
  assert.equal(indiceDestino([], 10), 0);
}

console.log('--- TEST 5: limitarAncho y offsetsFijas ---');
{
  assert.equal(limitarAncho(9999, 64, 640), 640);
  assert.equal(limitarAncho(10, 64, 640), 64);
  assert.equal(limitarAncho(200.6, 64, 640), 201);
  assert.equal(limitarAncho(Number.NaN, 64, 640), 64);
  const fijas = { sel: 'izquierda', num: 'izquierda', acc: 'derecha' };
  const anchos = { sel: 40, num: 120, cli: 200, est: 140, acc: 56 };
  // A la izquierda acumula los anchos; a la derecha cuenta desde el final.
  assert.deepEqual(offsetsFijas(['sel', 'num', 'cli', 'est', 'acc'], anchos, fijas), { sel: 0, num: 40, acc: 0 });
  assert.deepEqual(offsetsFijas(['a', 'x', 'y'], { a: 10, x: 50, y: 30 }, { x: 'derecha', y: 'derecha' }), { y: 0, x: 30 });
}

console.log('--- TEST 6: alternarOrden ---');
{
  assert.equal(alternarOrden(null, 'cli'), 'cli');
  assert.equal(alternarOrden('cli', 'cli'), '-cli');
  assert.equal(alternarOrden('-cli', 'cli'), null, 'después de descendente vuelve al orden por defecto');
  assert.equal(alternarOrden('-monto', 'cli'), 'cli', 'otra columna empieza en ascendente');
  assert.equal(alternarOrden('', 'cli'), 'cli');
}

console.log('--- TEST 7: ordenarFilas (estable, nulos al final, es con números) ---');
{
  const filas = [
    { id: 1, n: 'Bravo' }, { id: 2, n: null }, { id: 3, n: 'Álvarez' }, { id: 4, n: 'Alba' }, { id: 5, n: '' },
  ];
  assert.deepEqual(ids(ordenarFilas(filas, 'n')), [4, 3, 1, 2, 5], "'Álvarez' cae entre 'Alba' y 'Bravo'; nulos al final");
  assert.deepEqual(ids(ordenarFilas(filas, '-n')), [1, 3, 4, 2, 5], 'en descendente los nulos también van al final');
  const grupos = [{ id: 1, g: 'b' }, { id: 2, g: 'a' }, { id: 3, g: 'B' }, { id: 4, g: 'a' }];
  assert.deepEqual(ids(ordenarFilas(grupos, 'g')), [2, 4, 1, 3], 'estable (y b = B)');
  assert.deepEqual(ids(ordenarFilas(grupos, '-g')), [1, 3, 2, 4], 'estable también en descendente');
  const docs = [{ id: 1, c: 'COT-10' }, { id: 2, c: 'COT-9' }, { id: 3, c: 'COT-2' }];
  assert.deepEqual(ordenarFilas(docs, 'c').map((f) => f.c), ['COT-2', 'COT-9', 'COT-10'], "'COT-10' va después de 'COT-9'");
  const montos = [{ id: 1, m: 100 }, { id: 2, m: 20 }, { id: 3, m: 3 }, { id: 4, m: Number.NaN }];
  assert.deepEqual(ids(ordenarFilas(montos, 'm')), [3, 2, 1, 4]);
  assert.deepEqual(ids(ordenarFilas(montos, '-m')), [1, 2, 3, 4]);
  // Un accesor por campo (modo cliente: valorOrden de la columna).
  const anidadas = [{ id: 1, cliente: { nombre: 'Zoe' } }, { id: 2, cliente: { nombre: 'Ana' } }];
  assert.deepEqual(ids(ordenarFilas(anidadas, 'cliente', { cliente: (f) => f.cliente.nombre })), [2, 1]);
  // Sin orden: la misma secuencia (una copia).
  const sin = ordenarFilas(filas, null);
  assert.deepEqual(ids(sin), [1, 2, 3, 4, 5]);
  assert.notEqual(sin, filas);
  assert.deepEqual(ids(filas), [1, 2, 3, 4, 5], 'no muta');
}

console.log('--- TEST 8: filtrarFilas (sin tildes ni mayúsculas) ---');
{
  const filas = [{ id: 1, n: 'Colchón Doble', c: 'Ana' }, { id: 2, n: 'Almohada', c: 'Bruno Peña', total: 1500 }];
  assert.deepEqual(ids(filtrarFilas(filas, 'colchon')), [1], "'colchon' encuentra 'Colchón'");
  assert.deepEqual(ids(filtrarFilas(filas, 'PENA')), [2]);
  assert.deepEqual(ids(filtrarFilas(filas, '  ')), [1, 2], 'vacío: todas');
  assert.deepEqual(ids(filtrarFilas(filas, 'colchon', ['c'])), [], 'solo en los campos pedidos');
  assert.deepEqual(ids(filtrarFilas(filas, 'colchon doble')), [1], 'cada palabra tiene que estar');
  assert.deepEqual(ids(filtrarFilas(filas, 'almohada ana')), [], 'las palabras tienen que estar en la MISMA fila');
  assert.deepEqual(ids(filtrarFilas(filas, 'ana', [(f) => f.c])), [1], 'acepta accesores');
  assert.deepEqual(ids(filtrarFilas(filas, '1500')), [2], 'los números también se buscan');
}

console.log('--- TEST 9: paginar, totalPaginas, rangoPaginas y paginaValida ---');
{
  const filas = Array.from({ length: 60 }, (_, i) => i + 1);
  assert.deepEqual(paginar(filas, 2, 25), filas.slice(25, 50));
  assert.deepEqual(paginar(filas, 3, 25), filas.slice(50, 60));
  assert.deepEqual(paginar(filas, 0, 25), filas.slice(0, 25), 'una página inválida es la 1');
  assert.equal(totalPaginas(134, 25), 6);
  assert.equal(totalPaginas(0, 25), 1);
  assert.deepEqual(rangoPaginas(7, 20), [5, 6, 7, 8, 9]);
  assert.deepEqual(rangoPaginas(1, 3), [1, 2, 3]);
  assert.deepEqual(rangoPaginas(20, 20), [16, 17, 18, 19, 20]);
  assert.deepEqual(rangoPaginas(1, 20), [1, 2, 3, 4, 5]);
  assert.deepEqual(rangoPaginas(3, 10, 3), [2, 3, 4]);
  assert.deepEqual(rangoPaginas(1, 0), []);
  assert.equal(paginaValida(9, 134, 25), 6, 'una página fuera de rango se corrige a la última');
  assert.equal(paginaValida(0, 134, 25), 1);
  assert.equal(paginaValida(3, 0, 25), 1);
  assert.equal(paginaValida('x', 134, 25), 1);
  assert.equal(paginaValida(4, 134, 25), 4);
}

console.log('--- TEST 10: textoRango ---');
{
  assert.equal(textoRango(3, 25, 134), 'Mostrando 51–75 de 134');
  assert.equal(textoRango(2, 25, 134), 'Mostrando 26–50 de 134');
  assert.equal(textoRango(6, 25, 134), 'Mostrando 126–134 de 134');
  assert.equal(textoRango(9, 25, 134), 'Mostrando 126–134 de 134', 'una página fuera de rango se corrige');
  assert.equal(textoRango(1, 25, 0), 'Sin resultados');
  assert.equal(textoRango(1, 25, 1234), 'Mostrando 1–25 de 1.234', 'miles con punto');
}

console.log('--- TEST 11: estadoTablaInicial ---');
{
  assert.deepEqual(ESTADO_TABLA_INICIAL, {
    vista: null, modo: 'lista', semaforo: null, paso: null, estados: [], q: '', orden: null, pagina: 1, tamano: 25,
  });
  assert.ok(Object.isFrozen(ESTADO_TABLA_INICIAL));
  assert.deepEqual(estadoTablaInicial({ vista: 'todos', modo: 'kanban', tamano: 50 }), {
    ...ESTADO_TABLA_INICIAL, estados: [], vista: 'todos', modo: 'kanban', tamano: 50,
  });
  // Lo que no vale se normaliza (sessionStorage viejo o una pantalla descuidada).
  assert.deepEqual(estadoTablaInicial({ modo: 'tablero', tamano: 30, pagina: -2, estados: 'A, B,,A', q: null }), {
    ...ESTADO_TABLA_INICIAL, estados: ['A', 'B'],
  });
  assert.ok(!Object.isFrozen(estadoTablaInicial()), 'una copia que se puede usar como estado');
}

console.log('--- TEST 12: reducirEstadoTabla (estado único de C3; todo cambio que no sea de página → página 1) ---');
{
  const base = Object.freeze(estadoTablaInicial({ vista: 'todos', pagina: 4 }));
  const r = (accion, estado = base) => reducirEstadoTabla(estado, accion);

  // Página 4 + cambio de búsqueda → página 1.
  assert.deepEqual(r({ tipo: 'q', valor: 'colchon' }), { ...base, q: 'colchon', pagina: 1 });
  assert.deepEqual(r({ tipo: 'busqueda', valor: 'colchon' }), { ...base, q: 'colchon', pagina: 1 }, "'busqueda' = 'q'");
  // Cambio de tamaño → página 1.
  assert.deepEqual(r({ tipo: 'tamano', valor: 50 }), { ...base, tamano: 50, pagina: 1 });
  // Semáforo, paso, modo, estados, vista y orden → página 1.
  assert.deepEqual(r({ tipo: 'semaforo', valor: 'atrasados' }), { ...base, semaforo: 'atrasados', pagina: 1 });
  assert.deepEqual(r({ tipo: 'paso', valor: 'COT' }), { ...base, paso: 'COT', pagina: 1 });
  assert.deepEqual(r({ tipo: 'modo', valor: 'kanban' }), { ...base, modo: 'kanban', pagina: 1 });
  assert.deepEqual(r({ tipo: 'estados', valor: ['ENVIADA', 'BORRADOR'] }), { ...base, estados: ['ENVIADA', 'BORRADOR'], pagina: 1 });
  assert.deepEqual(r({ tipo: 'vista', valor: 'cerrados' }), { ...base, vista: 'cerrados', pagina: 1 });
  assert.deepEqual(r({ tipo: 'orden', valor: '-monto' }), { ...base, orden: '-monto', pagina: 1 });
  // Cambio de página conserva lo demás.
  const conFiltros = Object.freeze(estadoTablaInicial({ vista: 'todos', q: 'x', estados: ['A'], semaforo: 'atrasados', pagina: 2 }));
  assert.deepEqual(r({ tipo: 'pagina', valor: 3 }, conFiltros), { ...conFiltros, pagina: 3 });
  assert.equal(r({ tipo: 'pagina', valor: 0 }, conFiltros).pagina, 1, 'una página inválida es la 1');
  // Lo que no cambia nada devuelve el MISMO estado (sin volver a la página 1 ni otra carga).
  assert.equal(r({ tipo: 'vista', valor: 'todos' }), base);
  assert.equal(r({ tipo: 'estados', valor: [] }), base);
  assert.equal(r({ tipo: 'pagina', valor: 4 }), base);
  assert.equal(r({ tipo: 'tamano', valor: 30 }), base, 'un tamaño que no está en TAMANOS_PAGINA queda en 25');
  // Varios a la vez (una tarjeta pulsable o una caja del flujo).
  assert.deepEqual(
    r({ tipo: 'cambiar', cambios: { vista: 'sc', semaforo: null, paso: 'SC' } }, conFiltros),
    { ...conFiltros, vista: 'sc', semaforo: null, paso: 'SC', pagina: 1 },
  );
  assert.deepEqual(r({ tipo: 'cambiar', cambios: { pagina: 2 } }), { ...base, pagina: 2 }, 'solo la página: se conserva');
  assert.deepEqual(r({ tipo: 'cambiar', cambios: { vista: 'sc', pagina: 3 } }), { ...base, vista: 'sc', pagina: 1 });
  // Limpiar los filtros (el chip «quitar filtro») conserva la pestaña, el modo, el orden y el tamaño.
  const lleno = Object.freeze({ ...conFiltros, paso: 'COT', orden: '-monto', modo: 'kanban', tamano: 50 });
  assert.deepEqual(r({ tipo: 'limpiarFiltros' }, lleno), {
    ...lleno, semaforo: null, paso: null, estados: [], q: '', pagina: 1,
  });
  // Los estados se normalizan: sin vacíos ni repetidos, también en CSV.
  assert.deepEqual(r({ tipo: 'estados', valor: ['B', 'A', 'A', ''] }).estados, ['B', 'A']);
  assert.deepEqual(r({ tipo: 'estados', valor: 'A,B' }).estados, ['A', 'B']);
  assert.equal(r({ tipo: 'modo', valor: 'tablero' }), base, "un modo que no es 'lista' ni 'kanban' queda en 'lista'");
  // Errores de programación.
  assert.throws(() => r({ tipo: 'kpi', valor: 'x' }), /desconocid/);
  assert.throws(() => r({ tipo: 'cambiar', cambios: { kpi: 'x' } }), /desconocid/);
  assert.throws(() => r(null), /desconocid/);
}

console.log('--- TEST 13: queryListado (RP8: q y estados en CSV; D23) ---');
{
  const estado = estadoTablaInicial({
    vista: 'todos', q: ' colchón ', estados: ['A', 'B'], orden: '-monto', pagina: 3, tamano: 25,
  });
  assert.equal(queryListado(estado), 'vista=todos&q=colch%C3%B3n&estados=A,B&orden=-monto&limit=25&offset=50');
  assert.equal(
    queryListado(estadoTablaInicial({ vista: 'todos', semaforo: 'atrasados', paso: 'COT' })),
    'vista=todos&semaforo=atrasados&paso=COT&limit=25&offset=0',
  );
  // Omite los vacíos del estado.
  assert.equal(queryListado(estadoTablaInicial()), 'limit=25&offset=0');
  assert.equal(queryListado(estadoTablaInicial({ tamano: 50, pagina: 2 })), 'limit=50&offset=50');
  // RP8: nunca search ni estado= (ni siquiera con varios estados).
  const q = queryListado(estado);
  assert.ok(!q.includes('search='));
  assert.ok(!/(^|&)estado=/.test(q));

  // D23, regla 1: las claves de extra pisan las del estado (en su mismo lugar) y todas pasan, aunque el estado no
  // las conozca (columna de T7, saldo de T19, con_conteos de T4C).
  assert.equal(
    queryListado(estadoTablaInicial({ estados: ['A'], q: 'x' }), { estados: ['X', 'Y'], limit: 10, offset: 20 }),
    'q=x&estados=X,Y&limit=10&offset=20',
  );
  assert.equal(
    queryListado(estadoTablaInicial({ vista: 'todos' }), { columna: 'Cancelado', saldo: 'pendiente', con_conteos: true }),
    'vista=todos&limit=25&offset=0&columna=Cancelado&saldo=pendiente&con_conteos=1',
  );
  assert.equal(queryListado(estadoTablaInicial(), { con_resumen: false }), 'limit=25&offset=0&con_resumen=0');
  // D23, regla 2: null, undefined y '' se omiten (también para quitar una clave del estado); 0 no es vacío.
  assert.equal(
    queryListado(estadoTablaInicial({ vista: 'todos', q: 'x' }), { q: null, vista: undefined, producto: '', limit: 0 }),
    'limit=0&offset=0',
    'limit=0 (columnas plegadas) se manda',
  );
  assert.equal(queryListado(estadoTablaInicial(), { bodega: '   ', x: Number.NaN }), 'limit=25&offset=0');
  // D23, regla 3: los arreglos van en CSV (vacío = se omite; sin elementos vacíos).
  assert.equal(
    queryListado(estadoTablaInicial(), { direction: ['IN', 'ADJUST_IN', '', null], estados: [] }),
    'limit=25&offset=0&direction=IN,ADJUST_IN',
  );
  // Los valores van codificados.
  assert.equal(queryListado(estadoTablaInicial({ q: 'a&b=c' })), 'q=a%26b%3Dc&limit=25&offset=0');
  // Sin estado: el inicial.
  assert.equal(queryListado(null), 'limit=25&offset=0');
  // Un objeto como valor es un error de programación.
  assert.throws(() => queryListado(estadoTablaInicial(), { filtro: { a: 1 } }), /filtro/);
}

console.log('--- TEST 14: normalizarRespuesta (las cuatro formas; RP54) ---');
{
  const a = { id: 1 };
  const b = { id: 2 };
  const lista = { status: 'success', total: 134, data: [a, b], conteos: { todos: 134 }, resumen: { monto: 5 } };
  const n1 = normalizarRespuesta(lista);
  assert.deepEqual(
    { filas: n1.filas, total: n1.total, conteos: n1.conteos, resumen: n1.resumen },
    { filas: [a, b], total: 134, conteos: { todos: 134 }, resumen: { monto: 5 } },
  );
  assert.equal(n1.crudo, lista, 'la respuesta tal cual, para las claves propias del endpoint');
  // Un arreglo plano.
  const n2 = normalizarRespuesta([a, b, a]);
  assert.deepEqual([n2.filas.length, n2.total, n2.conteos, n2.resumen], [3, 3, null, null]);
  // {data: {items, total_skus}}.
  const n3 = normalizarRespuesta({ status: 'success', data: { items: [a], total_skus: 40 } });
  assert.deepEqual([n3.filas, n3.total], [[a], 40]);
  // RP54: la del Kardex, {data: {total, limit, offset, items}}.
  const n4 = normalizarRespuesta({ status: 'success', data: { total: 812, limit: 50, offset: 0, items: [a, b] } });
  assert.deepEqual([n4.filas, n4.total], [[a, b], 812]);
  // Sin total: el largo de las filas.
  assert.equal(normalizarRespuesta({ data: [a] }).total, 1);
  assert.equal(normalizarRespuesta({ data: [a], total: '7' }).total, 1, 'un total que no es número no se inventa');
  // Nada útil: vacía, sin lanzar.
  for (const vacio of [null, undefined, '', 0, { status: 'success' }, { data: null }]) {
    const n = normalizarRespuesta(vacio);
    assert.deepEqual([n.filas, n.total, n.conteos, n.resumen], [[], 0, null, null], String(vacio));
  }
}

console.log('--- TEST 15 (T4A): esModoTabla (useVistaGuardada) y posicionMenu (MenuFila) ---');
{
  assert.equal(esModoTabla('lista'), true);
  assert.equal(esModoTabla('kanban'), true);
  for (const otro of ['tablero', 'Lista', '', null, undefined, 1, {}]) assert.equal(esModoTabla(otro), false, String(otro));

  // El menú se alinea al borde derecho del botón ⋯ y abre hacia abajo; si no cabe, hacia arriba (posición fija).
  const ventana = { ancho: 1000, alto: 800 };
  const menu = { ancho: 200, alto: 150 };
  const boton = (top, left) => ({ top, bottom: top + 30, left, right: left + 30 });
  assert.deepEqual(posicionMenu(boton(100, 600), menu, ventana), { top: 134, left: 430, haciaArriba: false, altoMaximo: 658 });
  assert.deepEqual(posicionMenu(boton(700, 600), menu, ventana), { top: 546, left: 430, haciaArriba: true, altoMaximo: 688 },
    'abre hacia arriba si no cabe abajo');
  // Justo cabe abajo: el borde cuenta.
  assert.equal(posicionMenu({ top: 600, bottom: 638, left: 600, right: 630 }, menu, ventana).haciaArriba, false);
  assert.equal(posicionMenu({ top: 600, bottom: 639, left: 600, right: 630 }, menu, ventana).haciaArriba, true);
  // Nunca se sale de la ventana por los lados (margen de 8 px).
  assert.equal(posicionMenu(boton(100, 10), menu, ventana).left, 8);
  assert.equal(posicionMenu(boton(100, 940), menu, ventana).left, 770, 'alineado al borde derecho del botón');
  assert.equal(posicionMenu({ top: 100, bottom: 130, left: 995, right: 1025 }, menu, ventana).left, 792);
  assert.equal(posicionMenu(boton(100, 600), { ancho: 1200, alto: 150 }, ventana).left, 8, 'más ancho que la ventana');
  // No cabe en ningún lado: va donde hay más espacio, con su alto máximo para desplazarse adentro.
  assert.deepEqual(posicionMenu(boton(300, 600), { ancho: 200, alto: 700 }, ventana), { top: 334, left: 430, haciaArriba: false, altoMaximo: 458 });
  assert.deepEqual(posicionMenu(boton(500, 600), { ancho: 200, alto: 700 }, ventana), { top: 8, left: 430, haciaArriba: true, altoMaximo: 488 });
  assert.deepEqual(posicionMenu(boton(385, 600), { ancho: 200, alto: 500 }, ventana), { top: 419, left: 430, haciaArriba: false, altoMaximo: 373 },
    'si empatan, abajo');
  // Acepta un DOMRect (o cualquier objeto con top, bottom y right).
  assert.equal(posicionMenu({ x: 600, y: 100, width: 30, height: 30, top: 100, bottom: 130, left: 600, right: 630 }, menu, ventana).top, 134);
  // T4A r1 (punto 5): en un menú recortado (altoMaximo), el ítem que recibe el foco se trae a la vista dentro del menú,
  // sin mover la página. Sin DOM en node: se fija sobre el fuente de MenuFila.tsx.
  const fuente = readFileSync(new URL('../src/components/ui/MenuFila.tsx', import.meta.url), 'utf8');
  assert.ok(fuente.includes("scrollIntoView({ block: 'nearest' })"), 'MenuFila trae el ítem a la vista');
  assert.ok(!/(destino|querySelector<HTMLElement>\(ITEM\)\?)\.focus\(/.test(fuente), 'ningún ítem se enfoca sin traerlo a la vista (pasa por enfocar)');
  // T4B r1 (punto 1): en un ítem deshabilitado, el porqué (titulo) es una segunda línea visible, sin truncar (teclado y
  // celular, donde no hay title); en uno habilitado sigue siendo solo el title.
  assert.match(fuente, /\{item\.deshabilitado && item\.titulo && \(/, 'el motivo se pinta solo en un ítem deshabilitado');
  const linea = /<span className="([^"]*text-\[11px\] text-slate-500[^"]*)">\{item\.titulo\}<\/span>/.exec(fuente);
  assert.ok(linea, 'la segunda línea: text-[11px] text-slate-500 con el titulo');
  assert.ok(!linea[1].includes('truncate') && linea[1].includes('whitespace-normal'), 'sin truncar');
  assert.ok(!/[\s"`]aria-disabled:opacity-50/.test(fuente) && /group-aria-disabled:opacity-50/.test(fuente),
    'lo apagado es el ícono y la etiqueta, no el motivo (que se lee completo)');
  // T4B r2 (punto 5): con el motivo en la segunda línea, el botón no lleva además el mismo texto en title (el lector de
  // pantalla lo diría dos veces); en un ítem habilitado, el title se conserva.
  assert.ok(fuente.includes('title={item.deshabilitado && item.titulo ? undefined : item.titulo}'), 'sin title repetido');
  assert.ok(!fuente.includes('title={item.titulo}'));
  // Con el foco (flechas) o el mouse encima cambia el fondo (slate-100, rose-50): ahí el motivo pasa a slate-600, para
  // conservar al menos 4,5:1 (slate-500 sobre slate-100 da 4,3:1).
  assert.ok(linea[1].includes('group-focus:text-slate-600') && linea[1].includes('group-hover:text-slate-600'),
    'el motivo conserva el contraste con el foco o el mouse encima');
}

// ─── T4C: los hooks de components/tabla (useEstadoTabla, usePreferenciasTabla, useListado y useListadoCliente) ───

const tic = () => new Promise((r) => setImmediate(r));

console.log('--- TEST 16 (T4C y r1, R4 y C2): lo de la sesión (tabla-sesion:{id}): pestaña, página, búsqueda, orden, semáforo, paso y estados ---');
{
  assert.deepEqual(CAMPOS_SESION_TABLA, ['vista', 'pagina', 'q', 'orden', 'semaforo', 'paso', 'estados']);
  assert.ok(Object.isFrozen(CAMPOS_SESION_TABLA));
  assert.equal(MAXIMO_ESTADOS, 20);
  assert.equal(claveSesionTabla('ventas.hub'), 'tabla-sesion:ventas.hub');
  const estado = estadoTablaInicial({
    vista: 'cot', modo: 'kanban', semaforo: 'vencidos', paso: 'cotizar', estados: ['A', 'B'], q: 'colchón', orden: '-monto',
    pagina: 4, tamano: 50,
  });
  const texto = textoSesionTabla(estado, 7);
  assert.deepEqual(JSON.parse(texto),
    { usuario: 7, vista: 'cot', pagina: 4, q: 'colchón', orden: '-monto', semaforo: 'vencidos', paso: 'cotizar', estados: ['A', 'B'] },
    'ni el modo ni el tamaño (son del usuario, R4)');
  assert.deepEqual(leerSesionTabla(texto, 7),
    { vista: 'cot', pagina: 4, q: 'colchón', orden: '-monto', semaforo: 'vencidos', paso: 'cotizar', estados: ['A', 'B'] });
  // sessionStorage sobrevive a cerrar la sesión y entrar con otra cuenta en la misma pestaña (como el borrador del
  // Chatter): la búsqueda y la página de un usuario no se le muestran a otro.
  assert.deepEqual(leerSesionTabla(texto, 8), {});
  assert.deepEqual(leerSesionTabla(texto, null), {});
  assert.deepEqual(leerSesionTabla(textoSesionTabla(estado), null), leerSesionTabla(texto, 7), 'sin usuario, para sin usuario');
  // Lo dañado o ajeno no rompe: no restaura nada.
  for (const malo of [null, undefined, '', '{', 'null', '[1]', '"x"', '7', 7, {}]) {
    assert.deepEqual(leerSesionTabla(/** @type {any} */ (malo), 7), {}, String(malo));
  }
  // Solo los campos de la sesión, normalizados como en estadoTablaInicial; lo demás se ignora.
  assert.deepEqual(
    leerSesionTabla(JSON.stringify({ usuario: 7, pagina: '3', q: 5, vista: '', estados: [' X ', 'X'], modo: 'kanban', tamano: 50, otro: 1 }), 7),
    { pagina: 3, q: '5', vista: null, estados: ['X'] },
  );
  assert.deepEqual(leerSesionTabla(JSON.stringify({ usuario: 7, pagina: -2, orden: 'cliente' }), 7), { pagina: 1, orden: 'cliente' });
  // r1, punto 2: 'estados' se valida (un arreglo de hasta 20 textos no vacíos, el máximo del servidor). Si no vale,
  // se descarta ese campo y los demás quedan.
  const veinte = Array.from({ length: 20 }, (_, i) => `E${i}`);
  assert.deepEqual(leerSesionTabla(JSON.stringify({ usuario: 7, pagina: 2, estados: veinte }), 7), { pagina: 2, estados: veinte });
  for (const malos of ['ENVIADA', 'A,B', [...veinte, 'E20'], ['A', ''], ['A', '  '], ['A', 5], ['A', null], { a: 1 }, null, 3]) {
    assert.deepEqual(leerSesionTabla(JSON.stringify({ usuario: 7, pagina: 2, q: 'cama', estados: malos }), 7), { pagina: 2, q: 'cama' },
      JSON.stringify(malos));
  }
  assert.deepEqual(leerSesionTabla(JSON.stringify({ usuario: 7, estados: [] }), 7), { estados: [] });
  // El caso del revisor (probar_sesion.mjs): estados=['ENVIADA'] → página 3 → volver del documento.
  let e = estadoTablaInicial({ vista: 'todos' });
  e = reducirEstadoTabla(e, { tipo: 'estados', valor: ['ENVIADA'] });
  e = reducirEstadoTabla(e, { tipo: 'pagina', valor: 3 });
  const vuelta = armarEstadoTabla({ vista: 'todos' }, { sesion: leerSesionTabla(textoSesionTabla(e, 7), 7) });
  assert.deepEqual({ vista: vuelta.vista, estados: vuelta.estados, pagina: vuelta.pagina }, { vista: 'todos', estados: ['ENVIADA'], pagina: 3 });
}

console.log('--- TEST 17 (T4C y r1, R5, C3 y RP26): armarEstadoTabla, cambiosEstadoTabla y dependenciasTablero (D39) ---');
{
  const inicial = { vista: 'todos', orden: 'atencion' };
  // La primera vez, lo de la pantalla. El CRM entra en Kanban (RP26, punto 4).
  assert.deepEqual(armarEstadoTabla(inicial, {}), estadoTablaInicial(inicial));
  assert.deepEqual(armarEstadoTabla(inicial), estadoTablaInicial(inicial));
  assert.equal(armarEstadoTabla({ modo: 'kanban' }, {}).modo, 'kanban');
  // Con todo: la sesión (con su filtro de estados) y las dos preferencias, SIN volver a la página 1 (es una restauración).
  const armado = armarEstadoTabla(inicial, {
    sesion: { vista: 'cot', pagina: 4, q: 'cama', estados: ['ENVIADA'] }, modo: 'kanban', tamano: 50,
  });
  assert.deepEqual(armado, {
    ...estadoTablaInicial(inicial), vista: 'cot', pagina: 4, q: 'cama', estados: ['ENVIADA'], modo: 'kanban', tamano: 50,
  });
  // Una preferencia guardada que no vale da la de la pantalla (no la de ESTADO_TABLA_INICIAL).
  const crm = { modo: 'kanban', tamano: 50 };
  const raro = armarEstadoTabla(crm, { modo: 'tablero', tamano: 75 });
  assert.deepEqual([raro.modo, raro.tamano], ['kanban', 50]);
  const sinPrefs = armarEstadoTabla(crm, { modo: undefined, tamano: undefined });
  assert.deepEqual([sinPrefs.modo, sinPrefs.tamano], ['kanban', 50]);
  // Sin sesión, los estados de la pantalla. Una sesión que no es un objeto no cuenta; la sesión no trae ni modo ni tamaño.
  assert.deepEqual(armarEstadoTabla({ estados: ['A'] }, {}).estados, ['A']);
  assert.deepEqual(armarEstadoTabla({ estados: ['A'] }, { sesion: { estados: [] } }).estados, [], 'lo de la sesión gana');
  assert.deepEqual(armarEstadoTabla(inicial, { sesion: /** @type {any} */ ('x') }), estadoTablaInicial(inicial));
  assert.deepEqual(armarEstadoTabla(inicial, { sesion: /** @type {any} */ ({ modo: 'kanban', tamano: 50 }) }), estadoTablaInicial(inicial));
  // No muta lo que recibe.
  const sesion = { vista: 'sc', pagina: 2, estados: ['X'] };
  armarEstadoTabla(inicial, { sesion });
  assert.deepEqual(sesion, { vista: 'sc', pagina: 2, estados: ['X'] });

  // Qué hay que escribir después de un cambio (cada campo tiene UN lugar: la sesión, el modo o el tamaño).
  const nada = { sesion: false, modo: false, tamano: false };
  assert.deepEqual(cambiosEstadoTabla(armado, armado), nada);
  const pagina = reducirEstadoTabla(armado, { tipo: 'pagina', valor: 5 });
  assert.deepEqual(cambiosEstadoTabla(armado, pagina), { ...nada, sesion: true });
  const estados = reducirEstadoTabla(armado, { tipo: 'estados', valor: ['A'] });
  assert.deepEqual(cambiosEstadoTabla(armado, estados), { ...nada, sesion: true });
  const estados2 = reducirEstadoTabla(estados, { tipo: 'estados', valor: ['B'] });
  assert.deepEqual(cambiosEstadoTabla(estados, estados2), { ...nada, sesion: true }, 'el filtro es de la sesión aunque ya estuviera en la página 1');
  assert.deepEqual(cambiosEstadoTabla(estados, reducirEstadoTabla(estados, { tipo: 'tamano', valor: 25 })), { ...nada, tamano: true });
  assert.deepEqual(cambiosEstadoTabla(armado, reducirEstadoTabla(armado, { tipo: 'modo', valor: 'lista' })),
    { ...nada, sesion: true, modo: true }, 'cambiar de modo también vuelve a la página 1');

  // Lo repartido (sesión y preferencias) vuelve a armar EXACTAMENTE el mismo estado.
  let e = estadoTablaInicial(inicial);
  const acciones = [
    { tipo: 'vista', valor: 'cot' }, { tipo: 'pagina', valor: 3 }, { tipo: 'busqueda', valor: 'cama doble' },
    { tipo: 'pagina', valor: 2 }, { tipo: 'estados', valor: ['ENVIADA', 'VENCIDA'] }, { tipo: 'pagina', valor: 6 },
    { tipo: 'tamano', valor: 50 }, { tipo: 'pagina', valor: 2 }, { tipo: 'modo', valor: 'kanban' },
    { tipo: 'cambiar', cambios: { semaforo: 'vencidos', paso: 'cotizar', pagina: 4 } }, { tipo: 'orden', valor: '-monto' },
    { tipo: 'pagina', valor: 7 }, { tipo: 'limpiarFiltros' },
  ];
  for (const a of acciones) {
    const s = reducirEstadoTabla(e, /** @type {any} */ (a));
    const rearmado = armarEstadoTabla(inicial, {
      sesion: leerSesionTabla(textoSesionTabla(s, 7), 7), modo: s.modo, tamano: s.tamano,
    });
    assert.deepEqual(rearmado, s, JSON.stringify(a));
    e = s;
  }

  // D39: el tablero (useTableroKanban, misma pantalla) recarga con la pestaña, los filtros y la búsqueda; no con la
  // página, el orden de la tabla, el modo ni el tamaño (que va como porColumna).
  const d = dependenciasTablero(armado);
  assert.deepEqual(d, ['cot', null, null, 'cama', 'ENVIADA']);
  for (const a of [{ tipo: 'pagina', valor: 2 }, { tipo: 'orden', valor: '-monto' }, { tipo: 'modo', valor: 'lista' }, { tipo: 'tamano', valor: 25 }]) {
    assert.deepEqual(dependenciasTablero(reducirEstadoTabla(armado, /** @type {any} */ (a))), d, a.tipo);
  }
  for (const a of [{ tipo: 'vista', valor: 'sc' }, { tipo: 'q', valor: 'mesa' }, { tipo: 'estados', valor: ['ENVIADA', 'X'] },
    { tipo: 'semaforo', valor: 'vencidos' }, { tipo: 'paso', valor: 'cotizar' }]) {
    assert.notDeepEqual(dependenciasTablero(reducirEstadoTabla(armado, /** @type {any} */ (a))), d, a.tipo);
  }
  assert.deepEqual(dependenciasTablero({ ...armado, q: '  cama ' }), d, 'los espacios de los bordes no recargan (queryListado los quita)');
  assert.deepEqual(dependenciasTablero(null), [null, null, null, '', '']);
}

console.log('--- TEST 18 (T4C, RP26 y D38): parteDeColumnas — solo la pieza que cambió, leída igual que la ve el usuario ---');
{
  // Lo que queda guardado después de escribirParte (el JSON borra las claves con undefined) y lo que ve el usuario.
  const aplicar = (guardado, parte) => JSON.parse(JSON.stringify({ ...(guardado ?? {}), ...parte }));
  const verTabla = (guardado) => {
    const r = reconciliarColumnas(DEFINICION, guardado);
    return { ...r, visibles: r.orden.filter((x) => !r.ocultas.includes(x)) };
  };
  const POR_DEFECTO = ['sel', 'num', 'cli', 'est', 'monto', 'acc'];

  // Anchos: solo la pieza {anchos}, con la versión; nada de orden ni ocultas.
  assert.deepEqual(parteDeColumnas(DEFINICION, {}, { tipo: 'anchos', anchos: { cli: 9999 } }), { version: VERSION_PREFS, anchos: { cli: 640 } });
  const conTamano = aplicar({ tamano: 50 }, parteDeColumnas(DEFINICION, { tamano: 50 }, { tipo: 'anchos', anchos: { cli: 300 } }));
  assert.deepEqual(conTamano, { tamano: 50, version: 1, anchos: { cli: 300 } }, 'el tamaño (de useEstadoTabla) se conserva');
  assert.equal(verTabla(conTamano).anchos.cli, 300);
  assert.equal(verTabla(conTamano).anchos.est, 140, 'una columna que nunca se estiró sigue su ancho por defecto');
  // Los anchos ya guardados se conservan (solo los de columnas de hoy: lo guardado no crece sin fin, 8 KB).
  assert.deepEqual(
    parteDeColumnas(DEFINICION, { version: 1, anchos: { cli: 250, vieja: 300 } }, { tipo: 'anchos', anchos: { est: 100, otra: 90 } }),
    { version: 1, anchos: { cli: 250, est: 100 } },
  );
  // Sin cambio visible, nada que escribir: el mismo ancho, uno fuera del tope que queda igual, un id que no existe o NaN.
  for (const anchos of [{ cli: 200 }, { sel: 10 }, { nada: 100 }, { cli: Number.NaN }, { cli: '300' }, {}]) {
    assert.equal(parteDeColumnas(DEFINICION, {}, { tipo: 'anchos', anchos: /** @type {any} */ (anchos) }), null, JSON.stringify(anchos));
  }
  assert.equal(parteDeColumnas(DEFINICION, { version: 1, anchos: { cli: 250 } }, { tipo: 'anchos', anchos: { cli: 250 } }), null);

  // Mover con nada guardado: 'monto' (oculta por defecto) sigue oculta. reconciliarColumnas lee 'ocultas' solo para las
  // columnas del 'orden' guardado, así que el orden va con las ocultas que ve el usuario.
  const p1 = parteDeColumnas(DEFINICION, {}, { tipo: 'mover', id: 'est', hueco: 2 });
  assert.deepEqual(p1, { version: 1, orden: ['sel', 'num', 'est', 'cli', 'monto', 'acc'], ocultas: ['monto'] });
  const g1 = aplicar({}, p1);
  assert.deepEqual(verTabla(g1).visibles, ['sel', 'num', 'est', 'cli', 'acc']);
  // Por qué: con solo el orden, 'monto' aparecería.
  assert.deepEqual(verTabla({ version: 1, orden: p1.orden }).ocultas, [], 'el contraejemplo: el orden solo destapa las ocultas');
  // Con todas las columnas ya en lo guardado, mover escribe solo el orden.
  assert.deepEqual(parteDeColumnas(DEFINICION, g1, { tipo: 'mover', id: 'cli', hueco: 2 }),
    { version: 1, orden: ['sel', 'num', 'cli', 'est', 'monto', 'acc'] });
  // El hueco es el de los encabezados VISIBLES (indiceDestino): una oculta en el medio no corre la columna.
  const g2 = { version: 1, orden: ['sel', 'num', 'cli', 'monto', 'est', 'acc'], ocultas: ['monto'] };
  const tras = (guardado, cambio) => verTabla(aplicar(guardado, parteDeColumnas(DEFINICION, guardado, cambio))).visibles;
  assert.deepEqual(tras(g2, { tipo: 'mover', id: 'est', hueco: 2 }), ['sel', 'num', 'est', 'cli', 'acc']);
  assert.deepEqual(tras(g2, { tipo: 'mover', id: 'cli', hueco: 4 }), ['sel', 'num', 'est', 'cli', 'acc']);
  assert.equal(parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'est', hueco: 5 }), null, 'después de la última no cruza la fija');
  assert.equal(parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'est', hueco: 4 }), null, 'donde ya estaba');
  // Las fijas no salen de su lado; una fija no se mueve.
  assert.deepEqual(tras(g2, { tipo: 'mover', id: 'est', hueco: 0 }), ['sel', 'num', 'est', 'cli', 'acc']);
  assert.equal(parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'acc', hueco: 2 }), null);
  assert.equal(parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'nada', hueco: 2 }), null);
  assert.equal(parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'est', hueco: Number.NaN }), null);

  // Desplazar (las flechas de 'Ajustar tabla'): un lugar en el orden completo, sin cruzar las fijas.
  const g3 = { version: 1, orden: POR_DEFECTO, ocultas: ['monto'] };
  assert.deepEqual(parteDeColumnas(DEFINICION, g3, { tipo: 'desplazar', id: 'est', paso: -1 }),
    { version: 1, orden: ['sel', 'num', 'est', 'cli', 'monto', 'acc'] });
  assert.deepEqual(parteDeColumnas(DEFINICION, g3, { tipo: 'desplazar', id: 'est', paso: 1 }),
    { version: 1, orden: ['sel', 'num', 'cli', 'monto', 'est', 'acc'] });
  for (const [id, paso] of [['cli', -1], ['monto', 1], ['sel', 1], ['est', 0]]) {
    assert.equal(parteDeColumnas(DEFINICION, g3, { tipo: 'desplazar', id, paso }), null, `${id} ${paso}`);
  }

  // Ocultar y mostrar: con nada guardado va con el orden (para que se lea); con todo conocido, solo las ocultas.
  assert.deepEqual(parteDeColumnas(DEFINICION, {}, { tipo: 'ocultar', id: 'cli' }),
    { version: 1, orden: POR_DEFECTO, ocultas: ['cli', 'monto'] });
  assert.deepEqual(verTabla(aplicar({}, parteDeColumnas(DEFINICION, {}, { tipo: 'ocultar', id: 'cli' }))).visibles,
    ['sel', 'num', 'est', 'acc']);
  assert.deepEqual(parteDeColumnas(DEFINICION, {}, { tipo: 'ocultar', id: 'monto', oculta: false }),
    { version: 1, orden: POR_DEFECTO, ocultas: [] });
  assert.deepEqual(parteDeColumnas(DEFINICION, g3, { tipo: 'ocultar', id: 'est' }), { version: 1, ocultas: ['est', 'monto'] });
  assert.deepEqual(parteDeColumnas(DEFINICION, g3, { tipo: 'ocultar', id: 'monto' }), { version: 1, ocultas: [] }, 'alterna');
  assert.equal(parteDeColumnas(DEFINICION, g3, { tipo: 'ocultar', id: 'num' }), null, 'una clave no se oculta');
  assert.equal(parteDeColumnas(DEFINICION, g3, { tipo: 'ocultar', id: 'cli', oculta: false }), null, 'ya se ve');
  assert.equal(parteDeColumnas(DEFINICION, g3, { tipo: 'ocultar', id: 'nada' }), null);
  // Nunca deja la tabla sin columnas.
  const sinClaves = [{ id: 'a' }, { id: 'b' }];
  assert.equal(parteDeColumnas(sinClaves, { version: 1, orden: ['a', 'b'], ocultas: ['a'] }, { tipo: 'ocultar', id: 'b' }), null);
  // Una columna nueva (de una versión futura de la pantalla) que lo guardado no conoce: el cambio la deja como se ve.
  const viejo = { version: 1, orden: ['sel', 'num', 'cli', 'est', 'acc'], ocultas: [] };
  const p4 = parteDeColumnas(DEFINICION, viejo, { tipo: 'ocultar', id: 'cli' });
  assert.deepEqual(p4, { version: 1, orden: POR_DEFECTO, ocultas: ['cli', 'monto'] });
  assert.deepEqual(verTabla(aplicar(viejo, p4)).visibles, ['sel', 'num', 'est', 'acc'], "'monto' sigue oculta");
  assert.deepEqual(verTabla(aplicar(viejo, parteDeColumnas(DEFINICION, viejo, { tipo: 'mover', id: 'est', hueco: 2 }))).visibles,
    ['sel', 'num', 'est', 'cli', 'acc']);

  // Lo de otra versión no revive con la de hoy: las piezas viejas que no cambian se borran; el tamaño queda.
  const otraVersion = { version: 0, orden: ['acc', 'cli'], anchos: { cli: 500 }, ocultas: ['est'], tamano: 50 };
  const p5 = parteDeColumnas(DEFINICION, otraVersion, { tipo: 'anchos', anchos: { est: 100 } });
  assert.deepEqual(p5, { version: 1, anchos: { est: 100 }, orden: undefined, ocultas: undefined });
  const g5 = aplicar(otraVersion, p5);
  assert.deepEqual(g5, { version: 1, anchos: { est: 100 }, tamano: 50 });
  assert.deepEqual([verTabla(g5).anchos.cli, verTabla(g5).visibles], [200, ['sel', 'num', 'cli', 'est', 'acc']]);
  assert.deepEqual(aplicar(otraVersion, parteDeColumnas(DEFINICION, otraVersion, { tipo: 'ocultar', id: 'cli' })),
    { version: 1, orden: POR_DEFECTO, ocultas: ['cli', 'monto'], tamano: 50 });

  // Restablecer: borra las tres piezas y conserva el tamaño; sin nada que borrar, no escribe.
  const g6 = { ...g3, anchos: { cli: 300 }, tamano: 50 };
  assert.deepEqual(parteDeColumnas(DEFINICION, g6, { tipo: 'restablecer' }),
    { version: 1, orden: undefined, anchos: undefined, ocultas: undefined });
  assert.deepEqual(aplicar(g6, parteDeColumnas(DEFINICION, g6, { tipo: 'restablecer' })), { version: 1, tamano: 50 });
  assert.equal(parteDeColumnas(DEFINICION, { tamano: 50 }, { tipo: 'restablecer' }), null);
  assert.equal(parteDeColumnas(DEFINICION, null, { tipo: 'restablecer' }), null);
  // Un cambio desconocido es un error de programación. No muta lo que recibe.
  assert.throws(() => parteDeColumnas(DEFINICION, {}, /** @type {any} */ ({ tipo: 'girar' })), /Cambio de columnas desconocido/);
  const copia = structuredClone(g2);
  parteDeColumnas(DEFINICION, g2, { tipo: 'mover', id: 'est', hueco: 2 });
  parteDeColumnas(DEFINICION, g2, { tipo: 'anchos', anchos: { est: 99 } });
  assert.deepEqual(g2, copia);
}

console.log('--- TEST 19 (T4C, RP8): urlListado — q y estados en CSV, con_conteos y con_resumen al final ---');
{
  const e = estadoTablaInicial({ vista: 'todos', q: ' colchón ', estados: ['ENVIADA', 'ACEPTADA'], orden: 'atencion', pagina: 2 });
  const url = urlListado('/ventas/hub/documentos', e, { conConteos: true, conResumen: true, extra: { semaforo: 'vencidos' } });
  assert.equal(url,
    '/ventas/hub/documentos?vista=todos&semaforo=vencidos&q=colch%C3%B3n&estados=ENVIADA,ACEPTADA&orden=atencion&limit=25&offset=25&con_conteos=1&con_resumen=1');
  // Sin pedirlos, no van (la respuesta de cada lista es la de hoy sin los parámetros nuevos).
  assert.equal(urlListado('/ventas/pedidos', estadoTablaInicial()), '/ventas/pedidos?limit=25&offset=0');
  assert.equal(urlListado('/ventas/pedidos', estadoTablaInicial(), { conConteos: false, conResumen: false }), '/ventas/pedidos?limit=25&offset=0');
  // Una ruta que ya trae su consulta sigue con '&'.
  assert.equal(urlListado('/inventario/stock?bodega=2', estadoTablaInicial({ tamano: 50, pagina: 3 })), '/inventario/stock?bodega=2&limit=50&offset=100');
  // RP8: nunca search ni estado=.
  for (const u of [url, urlListado('/ventas/solicitudes', estadoTablaInicial({ q: 'x', estados: ['A'] }), { extra: { columna: 'abiertas' } })]) {
    assert.ok(!/(^|[?&])(search|estado)=/.test(u), u);
  }
}

// pedir(url, signal) a mano; ignora el signal a propósito (resuelve igual), como un fetch que ya respondió.
const aMano = () => {
  const llamadas = [];
  const pedir = (url, signal) => new Promise((resolver, rechazar) => llamadas.push({ url, signal, resolver, rechazar }));
  return { llamadas, pedir };
};

console.log('--- TEST 20 (T4C y r1, D28): crearCargaListado — una carga lenta no pisa a la nueva ---');
{
  {
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    carga.cargar('/x?offset=0', 'k1');
    await tic();
    carga.cargar('/x?offset=25', 'k2', { ruta: '/x', orden: null });
    await tic();
    assert.deepEqual(llamadas.map((l) => l.url), ['/x?offset=0', '/x?offset=25']);
    assert.equal(llamadas[0].signal.aborted, true, 'la anterior se aborta (AbortController)');
    assert.equal(llamadas[1].signal.aborted, false);
    llamadas[1].resolver({ data: [{ id: 2 }], total: 30 });
    await tic();
    // La lenta llega después: se descarta antes de publicar (el turno ya no es el suyo).
    llamadas[0].resolver({ data: [{ id: 1 }], total: 30 });
    await tic();
    assert.deepEqual(llegadas, [{
      marca: 'k2', ok: true, respuesta: { data: [{ id: 2 }], total: 30 }, contexto: { ruta: '/x', orden: null }, repeticion: 0,
    }]);
    assert.equal(carga.turno(), 2);
  }
  {
    // El error de una vieja tampoco se publica; el de la vigente sí, con ok: false.
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    carga.cargar('/a', 'k1');
    await tic();
    carga.cargar('/b', 'k2');
    await tic();
    llamadas[0].rechazar(Object.assign(new Error('AbortError'), { name: 'AbortError' }));
    await tic();
    assert.deepEqual(llegadas, []);
    const error = Object.assign(new Error('No se puede ordenar por «x».'), { status: 422 });
    llamadas[1].rechazar(error);
    await tic();
    assert.deepEqual(llegadas, [{ marca: 'k2', ok: false, error, contexto: null, repeticion: 0 }]);
  }
  {
    // cancelar (el efecto se limpia: otra dependencia, activo = false o desmontaje) aborta y nada se publica.
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    carga.cargar('/a', 'k1');
    await tic();
    carga.cancelar();
    assert.equal(llamadas[0].signal.aborted, true);
    llamadas[0].resolver({ data: [] });
    await tic();
    assert.deepEqual(llegadas, []);
    carga.cancelar();
  }
  {
    // StrictMode monta, desmonta y vuelve a montar en el mismo tic: sale UNA sola petición y llega una vez.
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    carga.cargar('/a', 'k1');
    carga.cancelar();
    carga.cargar('/a', 'k1');
    await tic();
    assert.equal(llamadas.length, 1, 'la abortada antes de salir no se pide');
    llamadas[0].resolver({ data: [{ id: 1 }] });
    await tic();
    assert.deepEqual(llegadas.map((l) => [l.marca, l.ok, l.repeticion]), [['k1', true, 0]], 'y no cuenta como una vuelta');
  }
  {
    // Un pedir que lanza de inmediato es un error de la carga vigente, no una excepción del efecto.
    const llegadas = [];
    const error = new Error('sin red');
    const carga = crearCargaListado({ pedir: () => { throw error; }, alLlegar: (l) => llegadas.push(l) });
    assert.doesNotThrow(() => carga.cargar('/a', 'k1'));
    await tic();
    assert.deepEqual(llegadas, [{ marca: 'k1', ok: false, error, contexto: null, repeticion: 0 }]);
  }
  {
    // r1, punto 6b: volver a pedir una consulta que ya llegó (activo: false → true, o esperar: true → false) es una
    // vuelta: sube repeticion y avisa a los suscriptores (useSyncExternalStore), para que la tabla se vea recargando.
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    let avisos = 0;
    const quitar = carga.suscribir(() => { avisos += 1; });
    carga.cargar('/a', 'k1');
    await tic();
    llamadas[0].resolver({ data: [] });
    await tic();
    assert.deepEqual([carga.repeticion(), avisos], [0, 0]);
    carga.cancelar();
    carga.cargar('/a', 'k1');
    assert.deepEqual([carga.repeticion(), avisos], [1, 1]);
    await tic();
    llamadas[1].resolver({ data: [{ id: 1 }] });
    await tic();
    assert.equal(llegadas[1].repeticion, 1);
    // Otra consulta no es una vuelta; la misma otra vez sin que haya llegado, tampoco.
    carga.cargar('/b', 'k2');
    carga.cargar('/b', 'k2');
    assert.deepEqual([carga.repeticion(), avisos], [1, 1]);
    quitar();
    await tic();
    llamadas.at(-1).resolver({ data: [] });
    await tic();
    carga.cargar('/b', 'k2');
    assert.deepEqual([carga.repeticion(), avisos], [2, 1], 'sin suscriptores no se avisa a nadie');
  }
  {
    // r2, punto 3: el rechazo atendido vive en la carga (como las vueltas) y avisa a los suscriptores, para que la tabla
    // vuelva a pintarse; atender el mismo otra vez no avisa.
    const carga = crearCargaListado({ pedir: () => new Promise(() => {}), alLlegar: () => {} });
    let avisos = 0;
    carga.suscribir(() => { avisos += 1; });
    assert.equal(carga.atendido(), null);
    carga.atender(3);
    assert.deepEqual([carga.atendido(), avisos], [3, 1]);
    carga.atender(3);
    assert.deepEqual([carga.atendido(), avisos], [3, 1]);
    carga.atender(5);
    assert.deepEqual([carga.atendido(), avisos], [5, 2]);
  }
}

console.log('--- TEST 21 (T4C y r1, H6, RP35, esperar y vueltas): aplicarLlegadaListado, estadoListado y lanzarListado ---');
{
  const a = { id: 1 };
  const b = { id: 2 };
  const SIN_AVISO = { avisoOrden: null };
  // Antes de la primera respuesta no se inventa nada: total, conteos y resumen null y cargandoInicial.
  assert.deepEqual(estadoListado(null, { clave: 'k1' }), {
    filas: [], total: null, conteos: null, resumen: null, crudo: null, cargandoInicial: true, recargando: false, error: null, ...SIN_AVISO,
  });
  const respuesta = { status: 'success', total: 134, data: [a, b], conteos: { todos: 134 }, resumen: { monto: 5 } };
  const r1 = aplicarLlegadaListado(null, { marca: 'k1', ok: true, respuesta });
  assert.deepEqual(estadoListado(r1, { clave: 'k1' }), {
    filas: [a, b], total: 134, conteos: { todos: 134 }, resumen: { monto: 5 }, crudo: respuesta, cargandoInicial: false,
    recargando: false, error: null, ...SIN_AVISO,
  });
  // Otra página, búsqueda o filtro en camino: conserva las filas anteriores y avisa recargando.
  const recargando = estadoListado(r1, { clave: 'k2' });
  assert.deepEqual([recargando.filas, recargando.total, recargando.conteos, recargando.cargandoInicial, recargando.recargando],
    [[a, b], 134, { todos: 134 }, false, true]);
  // Falla: conserva lo último y trae el error (dentro de la tabla); mientras se reintenta, el error no se muestra.
  const error = Object.assign(new Error('Error del servidor (500)'), { status: 500 });
  const r2 = aplicarLlegadaListado(r1, { marca: 'k2', ok: false, error });
  const fallo = estadoListado(r2, { clave: 'k2' });
  assert.deepEqual([fallo.filas, fallo.total, fallo.error, fallo.recargando, fallo.cargandoInicial], [[a, b], 134, error, false, false]);
  const reintento = estadoListado(r2, { clave: 'k3' });
  assert.deepEqual([reintento.error, reintento.recargando], [null, true]);
  // La primera falla: sin filas, sin total y con el error; al reintentar, otra vez cargandoInicial (no hay qué mostrar).
  const r0 = aplicarLlegadaListado(null, { marca: 'k1', ok: false, error });
  assert.deepEqual(estadoListado(r0, { clave: 'k1' }), {
    filas: [], total: null, conteos: null, resumen: null, crudo: null, cargandoInicial: false, recargando: false, error, ...SIN_AVISO,
  });
  assert.equal(estadoListado(r0, { clave: 'k2' }).cargandoInicial, true);
  // Una respuesta buena después de un error lo borra; una sin conteos los deja en null.
  const r3 = aplicarLlegadaListado(r2, { marca: 'k3', ok: true, respuesta: { data: [b], total: 1 } });
  assert.deepEqual([estadoListado(r3, { clave: 'k3' }).error, estadoListado(r3, { clave: 'k3' }).conteos], [null, null]);
  // RP35: con activo = false no hay nada en camino y se conserva lo último.
  assert.deepEqual(estadoListado(r1, { clave: 'k9', activo: false }), estadoListado(r1, { clave: 'k1' }));
  assert.equal(estadoListado(null, { clave: 'k1', activo: false }).cargandoInicial, false);
  // No muta lo que recibe; cada llegada lleva su número.
  assert.deepEqual(r1.datos?.filas, [a, b]);
  assert.equal(r1.error, null);
  assert.deepEqual([r1.n, r2.n, r3.n], [1, 2, 3]);

  // r1, punto 5: con esperar (las preferencias todavía no están listas) no hay petición y la tabla se ve cargando, no
  // vacía: cargandoInicial sin datos, recargando con datos. activo = false gana (RP35 no cambia).
  assert.deepEqual([estadoListado(null, { clave: 'k1', esperar: true }).cargandoInicial, estadoListado(null, { clave: 'k1', esperar: true }).error],
    [true, null]);
  const conDatos = estadoListado(r2, { clave: 'k2', esperar: true });
  assert.deepEqual([conDatos.recargando, conDatos.cargandoInicial, conDatos.filas, conDatos.error], [true, false, [a, b], null]);
  assert.deepEqual(estadoListado(r1, { clave: 'k1', esperar: true, activo: false }), estadoListado(r1, { clave: 'k1' }));
  // r1, punto 6b: una vuelta en camino (la misma consulta pedida otra vez) se ve recargando y esconde el error anterior.
  const vuelta = estadoListado(r2, { clave: 'k2', repeticion: 1 });
  assert.deepEqual([vuelta.recargando, vuelta.error, vuelta.filas], [true, null, [a, b]]);
  const llegoLaVuelta = aplicarLlegadaListado(r2, { marca: 'k2', ok: true, respuesta: { data: [a], total: 1 }, repeticion: 1 });
  assert.deepEqual([estadoListado(llegoLaVuelta, { clave: 'k2', repeticion: 1 }).recargando, llegoLaVuelta.repeticion], [false, 1]);

  // lanzarListado (el cuerpo del efecto de useListado): con activo = false o esperar no pide; al dejar de esperar sale
  // UNA petición; la limpieza la aborta.
  const { llamadas, pedir } = aMano();
  const carga = crearCargaListado({ pedir, alLlegar: () => {} });
  assert.equal(lanzarListado(carga, { url: '/a', clave: 'k1', esperar: true }), undefined);
  assert.equal(lanzarListado(carga, { url: '/a', clave: 'k1', activo: false }), undefined);
  assert.equal(lanzarListado(carga, { url: '/a', clave: 'k1', activo: false, esperar: false }), undefined);
  await tic();
  assert.equal(llamadas.length, 0);
  const limpiar = lanzarListado(carga, { url: '/a', clave: 'k1', esperar: false, contexto: { ruta: '/a', orden: null } });
  await tic();
  assert.deepEqual(llamadas.map((l) => l.url), ['/a']);
  assert.equal(typeof limpiar, 'function');
  limpiar?.();
  assert.equal(llamadas[0].signal.aborted, true);

  // r2, punto 1: con otro usuario no se muestran las filas del anterior (scratchpad rev4c_r1/tools/duda2.mjs). El token
  // pasa de 7 a 8: la tabla de 8 queda en cargandoInicial, sin filas, total, conteos ni resumen de 7; si la petición de
  // 8 falla (403), queda el error sin filas.
  const url = '/ventas/hub/documentos?vista=todos&limit=25&offset=0&con_conteos=1';
  const ruta = '/ventas/hub/documentos';
  const de7 = aplicarLlegadaListado(null, {
    marca: `0|7|${url}`, ok: true, respuesta: { data: [{ id: 1, cliente: 'Cliente de 7' }], total: 1, conteos: { todos: 1 }, resumen: { monto: 9 } },
    contexto: { ruta, orden: null, usuario: 7 },
  });
  assert.equal(de7.usuario, 7);
  assert.deepEqual(estadoListado(de7, { clave: `0|7|${url}`, ruta, usuario: 7 }).filas, [{ id: 1, cliente: 'Cliente de 7' }]);
  const en8 = estadoListado(de7, { clave: `0|8|${url}`, ruta, usuario: 8 });
  assert.deepEqual(
    [en8.cargandoInicial, en8.recargando, en8.filas, en8.total, en8.conteos, en8.resumen, en8.crudo, en8.error],
    [true, false, [], null, null, null, null, null],
  );
  const prohibido = Object.assign(new Error('No tienes permiso'), { status: 403 });
  const fallo8 = aplicarLlegadaListado(de7, { marca: `0|8|${url}`, ok: false, error: prohibido, contexto: { ruta, orden: null, usuario: 8 } });
  assert.deepEqual([fallo8.datos, fallo8.usuario], [null, 8], 'no pasa las filas de 7 a 8, ni con un error');
  const visto8 = estadoListado(fallo8, { clave: `0|8|${url}`, ruta, usuario: 8 });
  assert.deepEqual([visto8.error, visto8.filas, visto8.total, visto8.cargandoInicial], [prohibido, [], null, false]);
  // Con el mismo usuario, un error sí conserva lo último que llegó bien (como siempre).
  const fallo7 = aplicarLlegadaListado(de7, { marca: `1|7|${url}`, ok: false, error: prohibido, contexto: { ruta, orden: null, usuario: 7 } });
  assert.equal(estadoListado(fallo7, { clave: `1|7|${url}`, ruta, usuario: 7 }).total, 1);
  // Un rechazo de orden de 7 tampoco pasa a 8.
  const e422 = Object.assign(new Error('No se puede ordenar por «cliente».'), { status: 422 });
  const rechazo7 = aplicarLlegadaListado(de7, { marca: `0|7|x`, ok: false, error: e422, contexto: { ruta, orden: 'cliente', usuario: 7 } });
  assert.equal(estadoListado(rechazo7, { clave: `0|8|y`, ruta, orden: 'cliente', usuario: 8 }).avisoOrden, null);
  assert.equal(rechazoPorAtender(rechazo7, { orden: 'cliente', atendido: null, usuario: 8 }), null, 'ni se atiende en la pantalla de 8');
  assert.equal(rechazoPorAtender(rechazo7, { orden: 'cliente', atendido: null, usuario: 7 }), rechazo7.n);
  assert.equal(aplicarLlegadaListado(rechazo7, { marca: '0|8|y', ok: true, respuesta: { data: [] }, contexto: { ruta, orden: null, usuario: 8 } }).rechazo, null);
}

console.log('--- TEST 22 (T4C): listadoCliente (useListadoCliente) — estados, búsqueda sin tildes, orden y página válida ---');
{
  const filas = [
    { id: 1, numero: 'COT-10', cliente: 'Bravo', estado: 'ENVIADA', monto: 300, etapa: 'x' },
    { id: 2, numero: 'COT-9', cliente: 'Álvarez', estado: 'ACEPTADA', monto: null, etapa: 'y' },
    { id: 3, numero: 'COT-11', cliente: 'Colchón Alba', estado: 'ENVIADA', monto: 100, etapa: 'y' },
  ];
  // Mientras la pantalla trae los datos (null): sin filas, total null y cargandoInicial.
  assert.deepEqual(listadoCliente(null, estadoTablaInicial()), { filas: [], total: null, todas: [], pagina: 1, cargandoInicial: true });
  assert.deepEqual(listadoCliente(undefined, estadoTablaInicial()).cargandoInicial, true);
  const todo = listadoCliente(filas, estadoTablaInicial());
  assert.deepEqual([ids(todo.filas), todo.total, todo.pagina, todo.cargandoInicial], [[1, 2, 3], 3, 1, false]);
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ estados: ['ENVIADA'], q: 'colchon' })).filas), [3]);
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ orden: 'numero' })).filas), [2, 1, 3]);
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ orden: '-monto' })).filas), [1, 3, 2], 'nulos al final');
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ orden: 'cliente' }), { orden: { cliente: (f) => f.cliente.split(' ').pop() } }).filas),
    [3, 2, 1], 'con el accesor de orden (valorOrden): Alba, Álvarez, Bravo');
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ estados: ['y'] }), { estadoDe: (f) => f.etapa }).filas), [2, 3]);
  assert.deepEqual(ids(listadoCliente(filas, estadoTablaInicial({ q: 'bravo' }), { busqueda: ['numero'] }).filas), []);
  const caros = listadoCliente(filas, estadoTablaInicial({ vista: 'caros' }), { filtro: (f, e) => e.vista !== 'caros' || (f.monto ?? 0) > 200 });
  assert.deepEqual([ids(caros.filas), caros.total], [[1], 1]);
  // Paginación: una página fuera de rango (por ejemplo, después de filtrar) salta a la última que existe.
  const muchas = Array.from({ length: 30 }, (_, i) => ({ id: i + 1, estado: 'A' }));
  const p2 = listadoCliente(muchas, estadoTablaInicial({ pagina: 2 }));
  assert.deepEqual([ids(p2.filas), p2.total, p2.pagina, p2.todas.length], [[26, 27, 28, 29, 30], 30, 2, 30]);
  const p9 = listadoCliente(muchas, estadoTablaInicial({ pagina: 9 }));
  assert.deepEqual([p9.pagina, ids(p9.filas)], [2, [26, 27, 28, 29, 30]]);
  assert.deepEqual(listadoCliente([], estadoTablaInicial({ pagina: 3 })), { filas: [], total: 0, todas: [], pagina: 1, cargandoInicial: false });
  // No muta lo que recibe.
  assert.deepEqual(ids(filas), [1, 2, 3]);
}

console.log('--- TEST 23 (T4C y r1, R4, RP8, RP26, RP35, D28 y D38): el fuente de los hooks de components/tabla ---');
{
  const leer = (archivo) => readFileSync(new URL(`../src/components/tabla/${archivo}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const estado = leer('useEstadoTabla.ts');
  const prefs = leer('usePreferenciasTabla.ts');
  const listado = leer('useListado.ts');
  const indice = leer('index.ts');
  // R4: ningún hook toca localStorage; sessionStorage solo en useEstadoTabla y con la clave de la sesión.
  for (const [nombre, fuente] of [['useEstadoTabla', estado], ['usePreferenciasTabla', prefs], ['useListado', listado], ['index', indice]]) {
    assert.ok(!fuente.includes('localStorage'), `${nombre} no toca localStorage`);
    assert.ok(!/preferenciasApp\(|\.escribirParte\(|\.escribir\(/.test(fuente), `${nombre} escribe solo con usePreferencia o usePreferenciaParte (D38)`);
  }
  assert.ok(!prefs.includes('sessionStorage') && !listado.includes('sessionStorage'));
  assert.ok(estado.includes('claveSesionTabla(') && estado.includes('useSyncExternalStore('), 'la sesión con su clave y sin desajuste de hidratación');
  // RP26: useEstadoTabla es el único dueño de vista:<id> (el modo) y escribe el tamaño en tabla:<id> con usePreferenciaParte.
  assert.match(estado, /usePreferencia<ModoTabla>\(`vista:\$\{id\}`, inicialFijo\.modo, \{ validar: esModoTabla \}\)/);
  assert.match(estado, /usePreferenciaParte<[A-Za-z]+>\(`tabla:\$\{id\}`/);
  assert.ok(estado.includes('guardarTabla({ tamano: escrituras.tamano })'), 'solo la pieza del tamaño');
  assert.ok(!estado.includes('useVistaGuardada'), 'sin el otro escritor de vista:');
  assert.ok(estado.includes('reducirEstadoTabla(') && estado.includes('armarEstadoTabla('));
  // r1, puntos 2, 3 y 4: los estados van con la sesión (sin canal aparte), lo local mira el usuario (sesionVigente) y
  // cada escritura va con el usuario con que se pintó la pantalla (escriturasDeAccion).
  assert.match(estado, /type Local = \{ id: string; usuario: number \| null; sesion: SesionTabla \};/);
  assert.ok(!/setFiltro|vigente\.estados|inicialFijo\.estados/.test(estado), 'sin canal aparte para los estados');
  assert.match(estado, /sesionVigente\(local, \{ id, usuario, texto: textoGuardado \}\)/);
  assert.match(estado, /escriturasDeAccion\(actual, siguiente, \{\s*usuarioRender: usuarioDelRender\.current, usuarioToken: usuarioDeLaSesion\(\),?\s*\}\)/);
  assert.match(estado, /if \(!escrituras\) return;/);
  // D38 y r1: usePreferenciasTabla escribe con usePreferenciaParte la pieza de actualizadorColumnas por medio de
  // guardarCambioColumnas (nada antes de listo y nada si el usuario del token ya no es el del render), sin el filtro
  // previo con el guardado del render (r1, 6a).
  assert.match(prefs, /usePreferenciaParte<[A-Za-z]+>\(`tabla:\$\{id\}`/);
  assert.ok(prefs.includes('reconciliarColumnas('));
  assert.match(prefs, /guardarCambioColumnas\(guardarParte, \{[\s\S]*?listo: ahora\.listo,[\s\S]*?usuarioRender: ahora\.usuario, usuarioToken: usuarioDeLaSesion\(\),[\s\S]*?\}\)/);
  assert.ok(!prefs.includes('parteDeColumnas('), 'sin el filtro previo con lo del render');
  // RP8 y D28: la URL con queryListado (urlListado), el signal hasta apiFetch y la carga vigente (crearCargaListado).
  assert.ok(listado.includes('urlListado(') && listado.includes('crearCargaListado('));
  assert.ok(listado.includes('apiFetch(url, { signal })'), 'apiFetch recibe el signal del AbortController');
  assert.match(listado, /useEffect\(\s*\(\) => lanzarListado\(carga, \{/, 'el efecto pide y su limpieza aborta (lanzarListado, StrictMode)');
  assert.ok(listado.includes('aplicarLlegadaListado(') && listado.includes('estadoListado('));
  assert.match(listado, /activo = true/, 'RP35: activo, true por defecto');
  assert.match(listado, /esperar = false/, 'r1, punto 5: esperar, false por defecto');
  assert.ok(listado.includes('useSyncExternalStore(carga.suscribir, carga.repeticion'), 'r1, 6b: las vueltas en la clave');
  // r1, punto 1, y r2, puntos 2 y 3: la vuelta al orden por defecto se despacha UNA vez, desde un useEffect (nunca en
  // el render), con la acción condicional restablecerOrden, y lo atendido queda en la carga (vuelve a pintar).
  const VUELTA = "despachar({ tipo: 'restablecerOrden', rechazado: rechazo.orden })";
  assert.equal(listado.split(VUELTA).length - 1, 1);
  assert.ok(!listado.includes("despachar({ tipo: 'orden', valor: null })"), 'ya no la vuelta sin condición');
  const efecto = /useEffect\(\(\) => \{([\s\S]*?)\n {2}\}, \[[^\]]*\]\);/g;
  const cuerpos = [...listado.matchAll(efecto)].map((m) => m[1]);
  assert.ok(cuerpos.some((c) => c.includes('rechazoPorAtender(') && c.includes('carga.atender(n);') && c.includes(VUELTA)),
    'el despacho y lo atendido están dentro de un useEffect');
  assert.ok(listado.includes('const atendido = useSyncExternalStore(carga.suscribir, carga.atendido, carga.atendido);'),
    'r2, punto 3: lo atendido vuelve a pintar (no es un ref)');
  assert.ok(!/atendido\.current|useRef</.test(listado), 'sin el ref de r1');
  // r2, punto 6: los cables del hook (mutantes M14, M15, M22 y M23 del revisor).
  assert.ok(listado.includes('const usuario = usuarioDeLaSesion();'), 'M14: el usuario del render');
  assert.ok(listado.includes("const clave = `${version}|${usuario ?? ''}|${url}`;"), 'M14: el usuario en la clave');
  assert.ok(listado.includes('contexto: { ruta, orden, usuario }'), 'r2, punto 1: la llegada sabe de qué usuario es');
  assert.ok(listado.includes('const restablece = Boolean(despachar);'), 'M15');
  assert.ok(listado.includes('estadoListado(resultado, { clave, activo, esperar, repeticion, ruta, orden, restablece, atendido, usuario })'),
    'M23: estadoListado recibe esperar (y lo demás)');
  assert.ok(estado.includes('setLocal({ id, usuario: usuarioDelRender.current, sesion: siguiente });'), 'M22');
  // r2, punto 4: el tope de espera de las preferencias, con su limpieza. Revisión de r2 (controlador): el tope es del
  // usuario del render (un cambio de cuenta vuelve a esperar) y solo se arma mientras los vínculos no están listos (sin
  // un render de más a los 4 s en las navegaciones dentro de la app).
  assert.ok(estado.includes('const vinculosListos = modoListo && tablaListo;'));
  assert.ok(estado.includes('const [vencidoPara, setVencidoPara] = useState<number | null | undefined>(undefined);'));
  assert.match(estado, /useEffect\(\(\) => \{\s*if \(vinculosListos\) return undefined;\s*return esperarPreferencias\(\{ alVencer: \(\) => setVencidoPara\(usuario\) \}\);\s*\}, \[usuario, vinculosListos\]\);/);
  assert.ok(estado.includes('return [estado, despachar, listoConTope(vinculosListos, vencidoPara === usuario)];'));
  // Revisión de r2 (mutante H2): rechazoPorAtender recibe el usuario; sin él (usuario = null por defecto) el hook nunca
  // despacha la vuelta y la tabla queda en esqueleto.
  assert.ok(cuerpos.some((c) => c.includes('rechazoPorAtender(resultado, { orden, atendido, usuario })')),
    'H2: rechazoPorAtender con el usuario, dentro del efecto');
  // r2, punto 5: la fórmula del tablero (D39) con listo.
  assert.ok(estado.includes("activo = listo && estado.modo === 'kanban'"));
  assert.ok(estado.includes('mientras !listo, la pantalla pinta el esqueleto de la vista'));
  // r2, punto 3: el estado que recibe useListado es el de useEstadoTabla.
  assert.ok(listado.includes('`estado` es el de useEstadoTabla, sin derivar'));
  assert.ok(!/search=|[?&]estado=/.test(listado));
  assert.ok(listado.includes('listadoCliente('));
  for (const exportado of ['useEstadoTabla', 'usePreferenciasTabla', 'useListado']) {
    assert.ok(indice.includes(`export * from './${exportado}';`), exportado);
  }
  // r1, 6d: un solo usePreferenciasTabla por id.
  for (const fuente of [prefs, indice]) assert.ok(fuente.includes('un solo usePreferenciasTabla por id en cada pantalla'));
  // r1, 6c: los accesores de useListadoCliente, estables.
  assert.ok(listado.includes('los accesores deben ser estables (una constante o useMemo)'));
}

console.log('--- TEST 24 (T4C r1, puntos 3 y 4): sesionVigente, escriturasDeAccion y guardarCambioColumnas ---');
{
  const id = 'ventas.hub';
  const texto7 = textoSesionTabla(estadoTablaInicial({ vista: 'cot', q: 'Pérez Cliente Reservado', estados: ['ENVIADA'] }), 7);
  const local = { id, usuario: 7, sesion: { vista: 'cot', q: 'Pérez Cliente Reservado', pagina: 2, estados: ['ENVIADA'] } };
  // Lo que cambió el usuario en este montaje vale para él y para esta pantalla.
  assert.equal(sesionVigente(local, { id, usuario: 7, texto: texto7 }), local.sesion);
  // Otra cuenta (el token pasó a 8 en otra pestaña): ni lo local ni lo guardado de 7; la pantalla arranca de inicial.
  assert.deepEqual(sesionVigente(local, { id, usuario: 8, texto: texto7 }), {});
  assert.deepEqual(sesionVigente(local, { id, usuario: null, texto: texto7 }), {});
  // Otra pantalla: lo guardado de esa (aquí, nada).
  assert.deepEqual(sesionVigente(local, { id: 'ventas.cot', usuario: 7, texto: null }), {});
  // Sin nada local: lo guardado, leído con el usuario de hoy.
  assert.deepEqual(sesionVigente(null, { id, usuario: 7, texto: texto7 }), leerSesionTabla(texto7, 7));
  assert.deepEqual(sesionVigente(null, { id, usuario: 8, texto: texto7 }), {});

  // Las escrituras de una acción, con el usuario del render.
  const actual = estadoTablaInicial({ vista: 'todos' });
  const pagina = reducirEstadoTabla(actual, { tipo: 'pagina', valor: 3 });
  const conPagina = escriturasDeAccion(actual, pagina, { usuarioRender: 7, usuarioToken: 7 });
  assert.deepEqual([conPagina?.modo, conPagina?.tamano], [null, null]);
  assert.deepEqual(JSON.parse(/** @type {string} */ (conPagina?.sesion)), JSON.parse(textoSesionTabla(pagina, 7)), 'firmada con el usuario del render');
  assert.deepEqual(escriturasDeAccion(actual, reducirEstadoTabla(actual, { tipo: 'tamano', valor: 50 }), { usuarioRender: 7, usuarioToken: 7 }),
    { sesion: null, modo: null, tamano: 50 });
  assert.deepEqual(escriturasDeAccion(actual, reducirEstadoTabla(actual, { tipo: 'modo', valor: 'kanban' }), { usuarioRender: 7, usuarioToken: 7 }),
    { sesion: null, modo: 'kanban', tamano: null });
  // El token ya es de otro: la acción (hecha sobre la pantalla del anterior) no se guarda en ningún lado.
  assert.equal(escriturasDeAccion(actual, pagina, { usuarioRender: 7, usuarioToken: 8 }), null);
  assert.equal(escriturasDeAccion(actual, pagina, { usuarioRender: 7, usuarioToken: null }), null);
  assert.ok(escriturasDeAccion(actual, pagina, { usuarioRender: null, usuarioToken: null }), 'sin usuario y sin token: el mismo');

  // guardarCambioColumnas: antes de listo, o con otro usuario en el token, no llama a guardarParte.
  const llamadas = [];
  const guardarParte = (entrada) => { llamadas.push(typeof entrada === 'function' ? entrada({ version: 1 }) : entrada); };
  const base = { definicion: DEFINICION, cambio: { tipo: 'anchos', anchos: { cli: 300 } }, sinGuardar: {} };
  assert.equal(guardarCambioColumnas(guardarParte, { ...base, listo: false, usuarioRender: 7, usuarioToken: 7 }), false);
  assert.equal(guardarCambioColumnas(guardarParte, { ...base, listo: true, usuarioRender: 7, usuarioToken: 8 }), false);
  assert.equal(llamadas.length, 0);
  assert.equal(guardarCambioColumnas(guardarParte, { ...base, listo: true, usuarioRender: 7, usuarioToken: 7 }), true);
  assert.deepEqual(llamadas, [{ version: 1, anchos: { cli: 300 } }]);
  // Un cambio que no cambia nada: guardarParte recibe {} (la librería no publica) y devuelve false.
  assert.equal(guardarCambioColumnas(guardarParte, { ...base, cambio: { tipo: 'ocultar', id: 'num' }, listo: true, usuarioRender: 7, usuarioToken: 7 }), false);
  assert.deepEqual(llamadas.at(-1), {});
  // Si guardarParte descarta el guardado (cambio de sesión que el hook no vio) y no llama al actualizador: false.
  assert.equal(guardarCambioColumnas(() => {}, { ...base, listo: true, usuarioRender: 7, usuarioToken: 7 }), false);
}

console.log('--- TEST 25 (T4C r1, punto 1): un orden que el servidor rechaza vuelve al orden por defecto ---');
{
  const a = { id: 1 };
  const b = { id: 2 };
  const ruta = '/ventas/pedidos';
  const e422 = Object.assign(new Error('No se puede ordenar por «cliente».'), { status: 422, detail: 'No se puede ordenar por «cliente».' });
  // esErrorDeOrden: solo un 422 con el texto de core/listados.py y con un orden puesto.
  assert.equal(esErrorDeOrden(e422, { orden: 'cliente' }), true);
  assert.equal(esErrorDeOrden(Object.assign(new Error('Error de validación'), { status: 422, detail: 'No se puede ordenar por «x».' }), { orden: 'x' }), true,
    'el texto puede venir solo en detail');
  assert.equal(esErrorDeOrden(Object.assign(new Error('El campo «estados» admite hasta 20 valores.'), { status: 422 }), { orden: 'cliente' }), false,
    'otro 422 es un error común');
  for (const orden of [null, undefined, '', '  ']) assert.equal(esErrorDeOrden(e422, { orden }), false, String(orden));
  assert.equal(esErrorDeOrden(Object.assign(new Error('No se puede ordenar por «cliente».'), { status: 500 }), { orden: 'cliente' }), false);
  assert.equal(esErrorDeOrden(null, { orden: 'cliente' }), false);
  assert.equal(esErrorDeOrden(e422, null), false);

  const r1 = aplicarLlegadaListado(null, { marca: 'k1', ok: true, respuesta: { data: [a], total: 1 }, contexto: { ruta, orden: null } });
  // Llega el 422 de orden: el aviso trae el mensaje; con despachar el error no se pinta, porque la vuelta al orden por
  // defecto ya va en camino (la tabla se ve recargando).
  const r2 = aplicarLlegadaListado(r1, { marca: 'k2', ok: false, error: e422, contexto: { ruta, orden: 'cliente' } });
  assert.deepEqual(r2.rechazo, { n: r2.n, texto: 'No se puede ordenar por «cliente».', ruta, orden: 'cliente' });
  const conDespacho = estadoListado(r2, { clave: 'k2', ruta, orden: 'cliente', restablece: true });
  assert.deepEqual([conDespacho.avisoOrden, conDespacho.error, conDespacho.recargando, conDespacho.filas],
    ['No se puede ordenar por «cliente».', null, true, [a]]);
  // Sin despachar, el hook solo expone el aviso (y el error queda).
  const sinDespacho = estadoListado(r2, { clave: 'k2', ruta, orden: 'cliente' });
  assert.deepEqual([sinDespacho.avisoOrden, sinDespacho.error, sinDespacho.recargando], ['No se puede ordenar por «cliente».', e422, false]);
  // Se despacha UNA vez por esa llegada.
  assert.equal(rechazoPorAtender(r2, { orden: 'cliente', atendido: null }), r2.n);
  assert.equal(rechazoPorAtender(r2, { orden: 'cliente', atendido: r2.n }), null, 'ya atendido');
  assert.equal(rechazoPorAtender(r2, { orden: '-monto', atendido: null }), null, 'el usuario ya eligió otro orden');
  assert.equal(rechazoPorAtender(r1, { orden: null, atendido: null }), null);
  assert.equal(rechazoPorAtender(null, { orden: 'cliente', atendido: null }), null);
  // La petición siguiente, sin orden, reemplaza el error con las filas, y el aviso sobrevive.
  const r3 = aplicarLlegadaListado(r2, { marca: 'k3', ok: true, respuesta: { data: [a, b], total: 2 }, contexto: { ruta, orden: null } });
  const vuelta = estadoListado(r3, { clave: 'k3', ruta, orden: null, restablece: true });
  assert.deepEqual([vuelta.filas, vuelta.error, vuelta.recargando, vuelta.avisoOrden], [[a, b], null, false, 'No se puede ordenar por «cliente».']);
  assert.equal(rechazoPorAtender(r3, { orden: null, atendido: r2.n }), null, 'no se vuelve a despachar');
  // Otra página con el orden por defecto: el aviso sigue.
  const r4 = aplicarLlegadaListado(r3, { marca: 'k4', ok: true, respuesta: { data: [b], total: 2 }, contexto: { ruta, orden: null } });
  assert.equal(estadoListado(r4, { clave: 'k4', ruta, orden: null }).avisoOrden, 'No se puede ordenar por «cliente».');
  // El usuario elige un orden no nulo: el aviso se va ya en el render, y la respuesta lo borra.
  assert.equal(estadoListado(r4, { clave: 'k5', ruta, orden: '-monto' }).avisoOrden, null);
  const r5 = aplicarLlegadaListado(r4, { marca: 'k5', ok: true, respuesta: { data: [b, a], total: 2 }, contexto: { ruta, orden: '-monto' } });
  assert.equal(r5.rechazo, null);
  assert.equal(estadoListado(r5, { clave: 'k6', ruta, orden: null }).avisoOrden, null, 'no vuelve si se quita el orden');
  // Otra ruta: el aviso se va.
  assert.equal(estadoListado(r4, { clave: 'k7', ruta: '/ventas/cotizaciones', orden: null }).avisoOrden, null);
  assert.equal(aplicarLlegadaListado(r4, { marca: 'k7', ok: true, respuesta: { data: [] }, contexto: { ruta: '/ventas/cotizaciones', orden: null } }).rechazo, null);
  // Si el orden por defecto (null) también da 422, es un error común: sin aviso nuevo, sin otra vuelta (no hay bucle).
  const nulo = aplicarLlegadaListado(null, { marca: 'k1', ok: false, error: e422, contexto: { ruta, orden: null } });
  assert.equal(nulo.rechazo, null);
  const nuloVisto = estadoListado(nulo, { clave: 'k1', ruta, orden: null, restablece: true });
  assert.deepEqual([nuloVisto.error, nuloVisto.avisoOrden, nuloVisto.recargando], [e422, null, false]);
  assert.equal(rechazoPorAtender(nulo, { orden: null, atendido: null }), null);
  const otraVez = aplicarLlegadaListado(r3, { marca: 'k8', ok: false, error: e422, contexto: { ruta, orden: null } });
  assert.equal(rechazoPorAtender(otraVez, { orden: null, atendido: r2.n }), null);
  assert.equal(estadoListado(otraVez, { clave: 'k8', ruta, orden: null, restablece: true }).error, e422);

  // r2, punto 2: la vuelta al orden por defecto es condicional (restablecerOrden). Solo quita el orden si sigue siendo el
  // rechazado, con la página en 1 como cualquier cambio; si no, devuelve el MISMO estado.
  const conCliente = estadoTablaInicial({ vista: 'todos', orden: 'cliente', pagina: 3 });
  const restablecido = reducirEstadoTabla(conCliente, { tipo: 'restablecerOrden', rechazado: 'cliente' });
  assert.deepEqual([restablecido.orden, restablecido.pagina, restablecido.vista], [null, 1, 'todos']);
  assert.equal(reducirEstadoTabla(conCliente, { tipo: 'restablecerOrden', rechazado: '-monto' }), conCliente, 'otro orden: el mismo estado');
  const sinOrden = estadoTablaInicial({ vista: 'todos' });
  assert.equal(reducirEstadoTabla(sinOrden, { tipo: 'restablecerOrden', rechazado: 'cliente' }), sinOrden);
  assert.equal(reducirEstadoTabla(sinOrden, /** @type {any} */ ({ tipo: 'restablecerOrden' })), sinOrden, 'sin rechazado, nada');
  // La carrera del revisor (rev4c_r1_conc, carrera-orden): llega el rechazo, el usuario elige '-monto' antes de los
  // efectos y después sale la vuelta: queda '-monto'.
  let carrera = conCliente;
  carrera = reducirEstadoTabla(carrera, { tipo: 'orden', valor: '-monto' });
  const tras = reducirEstadoTabla(carrera, { tipo: 'restablecerOrden', rechazado: 'cliente' });
  assert.equal(tras, carrera);
  assert.equal(tras.orden, '-monto');

  // r2, punto 3: un rechazo atendido que no cambió la consulta vuelve a mostrar el error (con Reintentar). Pasa con un
  // estado derivado (rev4c_r1_conc/out/derivado.mjs: estado.orden ?? 'atencion', y 'atencion' se rechaza): el
  // despacho no cambia el orden que ve useListado.
  const eAtencion = Object.assign(new Error('No se puede ordenar por «atencion».'), { status: 422 });
  const d1 = aplicarLlegadaListado(null, { marca: 'k1', ok: false, error: eAtencion, contexto: { ruta, orden: 'atencion' } });
  const antes = estadoListado(d1, { clave: 'k1', ruta, orden: 'atencion', restablece: true, atendido: null });
  assert.deepEqual([antes.cargandoInicial, antes.error], [true, null], 'antes de atender: la vuelta está por salir');
  const despues = estadoListado(d1, { clave: 'k1', ruta, orden: 'atencion', restablece: true, atendido: d1.n });
  assert.deepEqual([despues.cargandoInicial, despues.recargando, despues.error, despues.avisoOrden],
    [false, false, eAtencion, 'No se puede ordenar por «atencion».'], 'atendido sin cambio de consulta: se ve el error');
  assert.equal(rechazoPorAtender(d1, { orden: 'atencion', atendido: d1.n }), null, 'y no se despacha otra vez');
}

console.log('--- TEST 26 (T4C r2, punto 4): el tope de espera de las preferencias ---');
{
  assert.equal(ESPERA_PREFERENCIAS_MS, 4000);
  const reloj = (() => {
    let ahora = 0;
    let siguiente = 1;
    let tareas = [];
    return {
      setTimeout(fn, ms) { const id = siguiente++; tareas.push({ id, en: ahora + ms, fn }); return id; },
      clearTimeout(id) { tareas = tareas.filter((t) => t.id !== id); },
      avanzar(ms) {
        ahora += ms;
        for (const t of tareas.filter((x) => x.en <= ahora)) { tareas = tareas.filter((x) => x !== t); t.fn(); }
      },
      pendientes: () => tareas.length,
    };
  })();
  // Las preferencias se cuelgan (sin precarga): a los 4000 ms el tope vence UNA vez y la tabla carga igual.
  let vencido = false;
  let veces = 0;
  const limpiar = esperarPreferencias({ alVencer: () => { vencido = true; veces += 1; }, temporizador: reloj });
  reloj.avanzar(3999);
  assert.deepEqual([vencido, listoConTope(false, vencido)], [false, false]);
  reloj.avanzar(1);
  assert.deepEqual([vencido, listoConTope(false, vencido), veces], [true, true, 1]);
  reloj.avanzar(10000);
  assert.equal(veces, 1);
  limpiar();
  // Las preferencias llegan antes del tope: listo de inmediato, sin esperar los 4000 ms.
  assert.equal(listoConTope(true, false), true);
  // Al desmontar se limpia: el tope no vence después.
  let tarde = false;
  const quitar = esperarPreferencias({ alVencer: () => { tarde = true; }, temporizador: reloj, ms: 100 });
  quitar();
  reloj.avanzar(1000);
  assert.deepEqual([tarde, reloj.pendientes()], [false, 0]);
}

// ─── T4D: la lógica de los componentes de vista (TablaEstandar, BarraTabla, FiltroEstados, MenuAjustes y Paginacion) ───

/** Un reloj falso como el de TEST 26: setTimeout y clearTimeout que solo corren con avanzar(ms). */
const relojFalso = () => {
  let ahora = 0;
  let siguiente = 1;
  let tareas = [];
  return {
    setTimeout(fn, ms) { const id = siguiente++; tareas.push({ id, en: ahora + ms, fn }); return id; },
    clearTimeout(id) { tareas = tareas.filter((t) => t.id !== id); },
    avanzar(ms) {
      ahora += ms;
      for (const t of tareas.filter((x) => x.en <= ahora)) { tareas = tareas.filter((x) => x !== t); t.fn(); }
    },
    pendientes: () => tareas.length,
  };
};
const suma = (anchos) => Object.values(anchos).reduce((a, b) => a + b, 0);

console.log('--- TEST 27 (T4D): mover una columna pasa de 5 px; ancho al contenido y «Ajustar al ancho de la pantalla» ---');
{
  // Presionar el título y arrastrar MÁS de 5 px mueve la columna; hasta 5 px es un clic (ordena).
  assert.equal(UMBRAL_MOVER_COLUMNA, 5);
  assert.equal(superaUmbralColumna(3, 4), false, 'exactamente 5 px todavía es un clic');
  assert.equal(superaUmbralColumna(3, 4.1), true);
  assert.equal(superaUmbralColumna(-6, 0), true, 'en cualquier dirección');
  assert.equal(superaUmbralColumna(0, 0), false);
  assert.equal(superaUmbralColumna(Number.NaN, 9), false);

  // Doble clic en el borde: el texto más largo que se ve más el relleno de la celda, máximo 480 px.
  assert.equal(ANCHO_AJUSTE_CONTENIDO, 480);
  assert.equal(RELLENO_CELDA, 24);
  assert.equal(anchoAlContenido([100, 250.2, 80]), 275, 'el más largo, redondeado hacia arriba, más 24');
  assert.equal(anchoAlContenido([900]), 480, 'máximo 480');
  assert.equal(anchoAlContenido([900], { anchoMax: 300 }), 300, 'y nunca más que el máximo de la columna');
  assert.equal(anchoAlContenido([10]), ANCHO_MIN);
  assert.equal(anchoAlContenido([10], { anchoMin: 90 }), 90);
  assert.equal(anchoAlContenido([0]), ANCHO_MIN, 'una celda vacía cuenta');
  assert.equal(anchoAlContenido([800], { anchoMin: 500 }), 500, 'un mínimo de más de 480 manda');
  assert.equal(anchoAlContenido([100], {}, 10), 110, 'el relleno se puede cambiar');
  assert.equal(anchoAlContenido([]), null, 'sin medidas no hay nada que ajustar');
  assert.equal(anchoAlContenido([Number.NaN, -3, undefined]), null);

  // 'Ajustar al ancho de la pantalla': reparte en proporción para que las visibles sumen el ancho de la tabla; las de
  // ancho fijo (mínimo = máximo: la casilla, las acciones) no cambian; lo que sobra del redondeo va a las de mayor fracción.
  const visibles = ['sel', 'num', 'cli', 'est', 'acc'];
  const anchos = POR_DEFECTO.anchos;
  const angosto = ajustarAlAncho(DEFINICION, visibles, anchos, 456);
  assert.deepEqual(angosto, { sel: 40, num: 94, cli: 156, est: 110, acc: 56 });
  assert.equal(suma(angosto), 456, 'cabe justo: sin correr la tabla');
  const ancho = ajustarAlAncho(DEFINICION, visibles, anchos, 1000);
  assert.deepEqual(ancho, { sel: 40, num: 236, cli: 393, est: 275, acc: 56 }, 'también crece si sobra espacio');
  assert.equal(suma(ancho), 1000);
  // Las que llegan a su mínimo se quedan ahí y lo demás va a las otras.
  assert.deepEqual(ajustarAlAncho(DEFINICION, visibles, anchos, 300), { sel: 40, num: 64, cli: 76, est: 64, acc: 56 });
  // Si ni con los mínimos cabe, los mínimos (la tabla se corre); si ni con los máximos se llena, los máximos.
  assert.deepEqual(ajustarAlAncho(DEFINICION, visibles, anchos, 200), { sel: 40, num: 64, cli: 64, est: 64, acc: 56 });
  assert.deepEqual(ajustarAlAncho(DEFINICION, visibles, anchos, 5000), { sel: 40, num: 640, cli: 640, est: 640, acc: 56 });
  // Lo guardado cuenta (no lo por defecto), las ocultas no entran y un id que no está en la definición se ignora.
  assert.deepEqual(ajustarAlAncho(DEFINICION, ['num', 'zzz', 'cli'], { num: 100, cli: 300 }, 600), { num: 150, cli: 450 });
  assert.deepEqual(ajustarAlAncho(DEFINICION, ['cli'], {}, 300), { cli: 300 }, 'sin ancho guardado, el de la definición');
  for (const malo of [0, -10, null, undefined, Number.NaN]) assert.equal(ajustarAlAncho(DEFINICION, visibles, anchos, malo), null, String(malo));
  assert.equal(ajustarAlAncho(DEFINICION, [], anchos, 500), null);
  const anchosCopia = structuredClone(anchos);
  ajustarAlAncho(DEFINICION, visibles, anchos, 456);
  assert.deepEqual(anchos, anchosCopia, 'no muta lo que recibe');
}

console.log('--- TEST 28 (T4D): la geometría de la tabla (columna flexible, fijas y casilla) y el destino al arrastrar ---');
{
  const visibles = ['num', 'cli', 'est', 'acc'];
  const anchos = { num: 120, cli: 200, est: 140, acc: 56 };
  const fijas = { num: 'izquierda', acc: 'derecha' };
  assert.equal(ANCHO_SELECCION, 40);
  // La columna flexible toma lo que sobra del ancho de la tarjeta; las fijas de la izquierda empiezan después de la casilla.
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, flexibles: ['cli'], disponible: 700, anchoSeleccion: 40 }), {
    anchos: { num: 120, cli: 344, est: 140, acc: 56 }, total: 700, offsets: { num: 40, acc: 0 },
  });
  // Sin flexible, o si no sobra (la tabla se corre de lado), los anchos de siempre.
  const fijo = { anchos, total: 556, offsets: { num: 40, acc: 0 } };
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, disponible: 700, anchoSeleccion: 40 }), fijo);
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, flexibles: ['cli'], disponible: 500, anchoSeleccion: 40 }), fijo);
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, flexibles: ['cli'], disponible: null, anchoSeleccion: 40 }), fijo,
    'antes de medir, sin estirar');
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, flexibles: ['monto'], disponible: 700, anchoSeleccion: 40 }), fijo,
    'una flexible oculta no estira nada');
  // Dos flexibles se reparten lo que sobra (el píxel suelto va a la primera); los decimales del ancho no cuentan.
  assert.deepEqual(geometriaTabla({ visibles, anchos, fijas, flexibles: ['est', 'cli'], disponible: 701.6, anchoSeleccion: 40 }).anchos,
    { num: 120, cli: 273, est: 212, acc: 56 });
  // Sin casilla, las fijas de la izquierda empiezan en 0; una visible sin ancho toma ANCHO_POR_DEFECTO.
  assert.deepEqual(geometriaTabla({ visibles: ['num', 'x'], anchos: { num: 100 }, fijas: { num: 'izquierda' } }),
    { anchos: { num: 100, x: ANCHO_POR_DEFECTO }, total: 100 + ANCHO_POR_DEFECTO, offsets: { num: 0 } });
  const anchosCopia = structuredClone(anchos);
  geometriaTabla({ visibles, anchos, fijas, flexibles: ['cli'], disponible: 900 });
  assert.deepEqual(anchos, anchosCopia, 'no muta los anchos recibidos');

  // El hueco de los encabezados VISIBLES donde caería la columna (indiceDestino), sin cruzar las fijas, y si cambia algo.
  const orden = ['num', 'cli', 'est', 'monto', 'acc'];
  assert.deepEqual(destinoArrastre(orden, fijas, 'est', 0), { hueco: 1, cambia: true }, 'no pasa a la izquierda de num');
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', 1), { hueco: 1, cambia: false }, 'su mismo lugar');
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', 2), { hueco: 2, cambia: false }, 'justo después de sí misma');
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', 3), { hueco: 3, cambia: true });
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', 99), { hueco: 4, cambia: true }, 'no pasa a la derecha de acc');
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', 2.7), { hueco: 2, cambia: false });
  assert.deepEqual(destinoArrastre(orden, fijas, 'acc', 1), { hueco: 1, cambia: false }, 'una fija no se mueve');
  assert.deepEqual(destinoArrastre(orden, fijas, 'nada', 2), { hueco: 2, cambia: false });
  assert.deepEqual(destinoArrastre(orden, fijas, 'cli', Number.NaN), { hueco: null, cambia: false });
  // Dónde va la línea azul: el borde izquierdo del encabezado del hueco, o el derecho del último.
  const bordes = [[0, 100], [100, 250], [250, 400]];
  assert.deepEqual([0, 1, 2, 3, 7, -1].map((h) => bordeDeHueco(bordes, h)), [0, 100, 250, 400, 400, 0]);
  assert.equal(bordeDeHueco([{ left: 10, right: 60 }, { left: 60, right: 90 }], 1), 60, 'acepta rectángulos');
  assert.equal(bordeDeHueco([], 0), null);
  assert.equal(bordeDeHueco(bordes, Number.NaN), null);
}

console.log('--- TEST 29 (T4D): orden por columna, qué pinta el cuerpo, separadores de grupo y página que ya no existe ---');
{
  // ordenable: true ordena por el id; un texto es el campo del servidor; lo demás no ordena.
  assert.equal(campoOrden({ id: 'cli', ordenable: true }), 'cli');
  assert.equal(campoOrden({ id: 'monto', ordenable: 'total_cop' }), 'total_cop');
  for (const c of [{ id: 'x' }, { id: 'x', ordenable: false }, { id: 'x', ordenable: '  ' }, null]) assert.equal(campoOrden(c), null);
  assert.equal(direccionOrden('cli', 'cli'), 'asc');
  assert.equal(direccionOrden('-cli', 'cli'), 'desc');
  assert.equal(direccionOrden(null, 'cli'), null);
  assert.equal(direccionOrden('-monto', 'cli'), null);
  assert.equal(direccionOrden('cli', null), null);
  // Modo cliente: los accesores de useListadoCliente salen del valorOrden de cada columna, con su campo de orden.
  const porNombre = (f) => f.nombre;
  const porTotal = (f) => f.total;
  const accesores = accesoresDeOrden([
    { id: 'cli', ordenable: true, valorOrden: porNombre }, { id: 'monto', ordenable: 'total', valorOrden: porTotal },
    { id: 'est', ordenable: true }, { id: 'x', valorOrden: porNombre },
  ]);
  assert.deepEqual(Object.keys(accesores), ['cli', 'total']);
  assert.equal(accesores.cli, porNombre);
  const filasCliente = [{ id: 1, nombre: 'Bravo', total: 5 }, { id: 2, nombre: 'Álvarez', total: 9 }, { id: 3, nombre: 'Alba', total: 1 }];
  assert.deepEqual(ids(ordenarFilas(filasCliente, 'cli', accesores)), [3, 2, 1]);
  assert.deepEqual(ids(ordenarFilas(filasCliente, '-total', accesores)), [2, 1, 3]);

  // Lo que pinta el cuerpo: cargando (esqueleto) gana; después el error; después vacío o filas.
  const err = new Error('caído');
  assert.equal(vistaCuerpo({ cargando: true, error: err, filas: [1] }), 'esqueleto');
  assert.equal(vistaCuerpo({ cargando: false, error: err, filas: [1] }), 'error', 'con error no se pintan filas viejas');
  assert.equal(vistaCuerpo({ error: null, filas: [] }), 'vacio');
  assert.equal(vistaCuerpo({ filas: null }), 'vacio');
  assert.equal(vistaCuerpo({ filas: [1] }), 'filas');

  // Separadores: uno al empezar cada tramo de un mismo grupo, con cuántas filas tiene el tramo; una fila sin grupo no
  // pinta separador.
  const filas = [{ id: 1, g: 'A' }, { id: 2, g: 'A' }, { id: 3, g: 'B' }, { id: 4, g: null }, { id: 5, g: 'B' }];
  assert.deepEqual(filasConGrupos(filas, (f) => f.g), [
    { tipo: 'grupo', grupo: 'A', n: 2 }, { tipo: 'fila', fila: filas[0], indice: 0 }, { tipo: 'fila', fila: filas[1], indice: 1 },
    { tipo: 'grupo', grupo: 'B', n: 1 }, { tipo: 'fila', fila: filas[2], indice: 2 }, { tipo: 'fila', fila: filas[3], indice: 3 },
    { tipo: 'grupo', grupo: 'B', n: 1 }, { tipo: 'fila', fila: filas[4], indice: 4 },
  ]);
  assert.deepEqual(filasConGrupos(filas.slice(0, 2)), [
    { tipo: 'fila', fila: filas[0], indice: 0 }, { tipo: 'fila', fila: filas[1], indice: 1 },
  ], 'sin grupoFila, solo filas');
  assert.deepEqual(filasConGrupos(null, (f) => f.g), []);

  // Si un filtro deja menos páginas, salta a la última que existe; solo con el total ya llegado de ESA consulta.
  assert.equal(paginaCorregida({ pagina: 5, tamano: 25, total: 60 }), 3);
  assert.equal(paginaCorregida({ pagina: 3, tamano: 25, total: 0 }), 1);
  assert.equal(paginaCorregida({ pagina: 2, tamano: 25, total: 60 }), null, 'la página existe');
  assert.equal(paginaCorregida({ pagina: 1, tamano: 25, total: 0 }), null);
  assert.equal(paginaCorregida({ pagina: 5, tamano: 50, total: 60 }), 2);
  for (const espera of [{ cargando: true }, { recargando: true }, { error: err }, { total: null }]) {
    assert.equal(paginaCorregida({ pagina: 5, tamano: 25, total: 60, ...espera }), null, JSON.stringify(Object.keys(espera)));
  }
}

console.log('--- TEST 30 (T4D): la selección marca la página visible y se limpia con cualquier cambio de la lista ---');
{
  const sel = [1, 2];
  assert.deepEqual(alternarSeleccion(sel, 2), [1]);
  assert.deepEqual(alternarSeleccion(sel, 3), [1, 2, 3]);
  assert.deepEqual(sel, [1, 2], 'no muta');
  assert.equal(estadoSeleccionPagina([1, 2, 9], [1, 2, 3]), 'algunas');
  assert.equal(estadoSeleccionPagina([1, 2, 3, 9], [1, 2, 3]), 'todas');
  assert.equal(estadoSeleccionPagina([9], [1, 2]), 'ninguna');
  assert.equal(estadoSeleccionPagina([1], []), 'ninguna', 'una página sin filas seleccionables');
  // La casilla del encabezado: marca solo las de la página (conserva las otras); si ya estaban todas, las quita.
  assert.deepEqual(alternarSeleccionPagina([9, 1], [1, 2, 3]), [9, 1, 2, 3]);
  assert.deepEqual(alternarSeleccionPagina([9, 1, 2, 3], [1, 2, 3]), [9]);
  assert.deepEqual(alternarSeleccionPagina([], []), []);
  // La firma de la lista: cambia con la página, la pestaña, la búsqueda, el filtro, el orden, el tamaño y el modo.
  const base = estadoTablaInicial({ vista: 'todos', estados: ['A'] });
  assert.equal(firmaSeleccion(base), firmaSeleccion({ ...base, estados: ['A'] }), 'el mismo estado, la misma firma');
  const cambios = [
    { tipo: 'pagina', valor: 2 }, { tipo: 'vista', valor: 'sc' }, { tipo: 'q', valor: 'x' }, { tipo: 'estados', valor: ['B'] },
    { tipo: 'orden', valor: 'cli' }, { tipo: 'tamano', valor: 50 }, { tipo: 'modo', valor: 'kanban' },
    { tipo: 'semaforo', valor: 'atrasados' }, { tipo: 'paso', valor: 'COT' },
  ];
  for (const accion of cambios) {
    assert.notEqual(firmaSeleccion(reducirEstadoTabla(base, accion)), firmaSeleccion(base), accion.tipo);
  }
}

console.log('--- TEST 31 (T4D): búsqueda con retardo de 300 ms, «N resultados», pestañas con su filtro y flechas de «Ajustar tabla» ---');
{
  assert.equal(RETARDO_BUSQUEDA_MS, 300);
  const reloj = relojFalso();
  const llamadas = [];
  const b = crearBusquedaConRetardo({ alBuscar: (t) => llamadas.push(t), temporizador: reloj });
  b.escribir('a');
  reloj.avanzar(200);
  b.escribir('ab');
  reloj.avanzar(299);
  assert.deepEqual(llamadas, [], 'cada tecla vuelve a esperar 300 ms');
  reloj.avanzar(1);
  assert.deepEqual(llamadas, ['ab'], 'una sola búsqueda, con lo último');
  reloj.avanzar(1000);
  assert.deepEqual(llamadas, ['ab']);
  b.escribir('abc');
  b.ya('abcd');
  assert.deepEqual(llamadas, ['ab', 'abcd'], 'Enter busca de inmediato');
  reloj.avanzar(1000);
  assert.deepEqual(llamadas, ['ab', 'abcd'], 'y lo que esperaba ya no sale');
  b.escribir('x');
  b.cancelar();
  reloj.avanzar(1000);
  assert.deepEqual([llamadas.length, reloj.pendientes()], [2, 0], 'cancelar (al desmontar) no deja nada en espera');
  b.ya('');
  assert.deepEqual(llamadas.at(-1), '', 'la X limpia de inmediato');
  const b300 = crearBusquedaConRetardo({ alBuscar: (t) => llamadas.push(t), temporizador: reloj });
  b300.escribir('y');
  reloj.avanzar(RETARDO_BUSQUEDA_MS);
  assert.equal(llamadas.at(-1), 'y', 'por defecto, 300 ms');

  // La caja de búsqueda y el estado: el eco de lo que la caja mandó no pisa lo que se sigue escribiendo; un cambio de
  // afuera (limpiar filtros, volver de un documento) sí reemplaza el texto.
  const local = { texto: 'abc', visto: '', enviado: 'ab' };
  assert.deepEqual(sincronizarBusqueda(local, 'ab'), { texto: 'abc', visto: 'ab', enviado: null });
  assert.deepEqual(sincronizarBusqueda({ texto: 'abc', visto: 'ab', enviado: null }, ''), { texto: '', visto: '', enviado: null });
  assert.deepEqual(sincronizarBusqueda({ texto: '', visto: '', enviado: 'ab' }, 'pérez'), { texto: 'pérez', visto: 'pérez', enviado: null });
  assert.equal(sincronizarBusqueda(local, ''), local, 'sin cambio de q, el mismo objeto');

  // 'N resultados': null mientras carga (Contador pinta la barra gris, nunca 0).
  assert.equal(textoResultados(null), null);
  assert.equal(textoResultados(undefined), null);
  assert.equal(textoResultados(Number.NaN), null);
  assert.equal(textoResultados(-1), null);
  assert.equal(textoResultados(0), 'Sin resultados');
  assert.equal(textoResultados(1), '1 resultado');
  assert.equal(textoResultados(2), '2 resultados');
  assert.equal(textoResultados(1452), '1.452 resultados');
  // El Contador de cada pestaña (y de 'N resultados'): sin número, la barra gris (o '—' si los conteos fallaron); con
  // número, atenuado mientras se actualiza. Nunca 0 mientras carga.
  assert.equal(estadoDeConteo(null), 'cargando');
  assert.equal(estadoDeConteo(undefined, 'listo'), 'cargando', 'un conteo que no llegó no es 0');
  assert.equal(estadoDeConteo(null, 'actualizando'), 'cargando');
  assert.equal(estadoDeConteo(null, 'error'), 'error');
  assert.equal(estadoDeConteo(12), 'listo');
  assert.equal(estadoDeConteo(12, 'actualizando'), 'actualizando');
  assert.equal(estadoDeConteo(12, 'cargando'), 'actualizando', 'el número anterior, atenuado');
  assert.equal(estadoDeConteo(12, 'error'), 'listo', 'si la recarga falla, queda el último número');
  assert.equal(estadoDeConteo(0), 'listo');

  // Las opciones del filtro de estados van por pestaña; al cambiar de pestaña, los estados que la otra no tiene se quitan.
  const OPS = [{ valor: 'A', etiqueta: 'Asignada' }, { valor: 'B', etiqueta: 'Borrador' }];
  const porVista = (v) => (v === 'sc' ? [OPS[0]] : v === 'nada' ? null : OPS);
  assert.equal(opcionesDeVista(OPS, 'x'), OPS);
  assert.deepEqual(opcionesDeVista(porVista, 'sc'), [OPS[0]]);
  assert.deepEqual(opcionesDeVista(porVista, 'nada'), []);
  assert.deepEqual(opcionesDeVista(undefined, 'x'), []);
  const conEstados = estadoTablaInicial({ vista: 'todos', estados: ['A', 'B'], pagina: 3 });
  const aSc = accionPestana(conEstados, 'sc', porVista);
  assert.deepEqual(aSc, { tipo: 'cambiar', cambios: { vista: 'sc', estados: ['A'] } });
  assert.deepEqual(reducirEstadoTabla(conEstados, aSc), { ...conEstados, vista: 'sc', estados: ['A'], pagina: 1 });
  assert.deepEqual(accionPestana(conEstados, 'cot', porVista), { tipo: 'vista', valor: 'cot' }, 'los dos siguen valiendo');
  assert.deepEqual(accionPestana(conEstados, 'sc', undefined), { tipo: 'vista', valor: 'sc' }, 'sin opciones no se toca el filtro');
  assert.deepEqual(accionPestana(estadoTablaInicial({}), 'sc', porVista), { tipo: 'vista', valor: 'sc' });
  // Una casilla del filtro: alterna y deja los estados en el orden de las opciones (la misma URL para el mismo filtro).
  assert.deepEqual(alternarEstado(['B'], 'A', OPS), ['A', 'B']);
  assert.deepEqual(alternarEstado(['A', 'B'], 'A', OPS), ['B']);
  assert.deepEqual(alternarEstado(['Z', 'A'], 'B', OPS), ['A', 'B'], 'lo que no es una opción se descarta');

  // Las flechas de 'Ajustar tabla' (sin arrastre): no cruzan las fijas, que tampoco se mueven.
  const fijas = fijasDe(DEFINICION);
  const orden = POR_DEFECTO.orden;
  assert.equal(puedeDesplazar(orden, fijas, 'cli', -1), false, 'num está fija a la izquierda');
  assert.equal(puedeDesplazar(orden, fijas, 'cli', 1), true);
  assert.equal(puedeDesplazar(orden, fijas, 'monto', 1), false, 'acc está fija a la derecha');
  assert.equal(puedeDesplazar(orden, fijas, 'monto', -1), true);
  assert.equal(puedeDesplazar(orden, fijas, 'acc', -1), false);
  assert.equal(puedeDesplazar(orden, fijas, 'sel', 1), false);
  assert.equal(puedeDesplazar(orden, fijas, 'nada', 1), false);
  assert.equal(puedeDesplazar(orden, fijas, 'est', 0), false);
}

console.log('--- TEST 32 (T4D): el fuente de los componentes de vista de components/tabla y el token TABLE (sin DOM en node) ---');
{
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Sin comentarios (/* … */, {/* … */} y las líneas //): lo que se busca es el código, no lo que dicen los comentarios.
  const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const NOMBRES = ['TablaEstandar', 'BarraTabla', 'FiltroEstados', 'MenuAjustes', 'Paginacion', 'Esqueleto'];
  const fuentes = Object.fromEntries(NOMBRES.map((n) => [n, leer(`components/tabla/${n}.tsx`)]));
  const indice = leer('components/tabla/index.ts');
  const ds = leer('lib/design-system.ts');
  for (const [nombre, fuente] of Object.entries(fuentes)) {
    const c = codigo(fuente);
    assert.ok(fuente.startsWith("'use client';"), `${nombre}: «use client»`);
    assert.match(fuente, new RegExp(`export function ${nombre}\\b`), `${nombre}: exporta el componente`);
    assert.ok(indice.includes(`export * from './${nombre}';`), `index.ts exporta ${nombre}`);
    assert.ok(!/\bdark:/.test(fuente), `${nombre}: sin dark:`);
    assert.ok(!/(^|[^\w.$])(?:(?:window|globalThis)\??\.)?(?:alert|confirm|prompt)\s*\(/m.test(c), `${nombre}: sin alert, confirm ni prompt`);
    assert.ok(!/localStorage|sessionStorage/.test(c), `${nombre}: no toca el almacenamiento (R4: eso es de preferencias.js y useEstadoTabla)`);
    // D40: una sola instancia de usePreferenciasTabla por id, la de la pantalla; los componentes la reciben por props.
    assert.ok(!/usePreferenciasTabla\(|usePreferencia(Parte)?\(|preferenciasApp\(/.test(c), `${nombre}: no crea otro vínculo de preferencias (D40)`);
  }
  // C1 y R27: ConmutadorVista y MenuFila son los de components/ui; no hay copias en components/tabla.
  for (const n of ['ConmutadorVista', 'MenuFila']) {
    assert.ok(!existsSync(new URL(`../src/components/tabla/${n}.tsx`, import.meta.url)), `sin components/tabla/${n}.tsx`);
  }

  // TablaEstandar: el token TABLE de design-system.ts, la lógica de lib/tabla.js y las dos props de D40.
  const tabla = fuentes.TablaEstandar;
  const t = codigo(tabla);
  assert.match(tabla, /import \{ TABLE \} from '@\/lib\/design-system';/);
  assert.match(fuentes.Esqueleto, /import \{ TABLE \} from '@\/lib\/design-system';/);
  const bloqueTabla = /export const TABLE = \{([\s\S]*?)\n\};/.exec(ds);
  assert.ok(bloqueTabla, 'design-system.ts tiene el token TABLE');
  const claves = new Set([...bloqueTabla[1].matchAll(/^\s+([A-Za-z]+):/gm)].map((m) => m[1]));
  for (const fuente of [tabla, fuentes.Esqueleto]) {
    for (const [, clave] of fuente.matchAll(/TABLE\.([A-Za-z]+)/g)) assert.ok(claves.has(clave), `TABLE.${clave} existe en design-system.ts`);
  }
  const clase = (clave) => new RegExp(`^\\s+${clave}:\\s+'([^']*)'`, 'm').exec(bloqueTabla[1])?.[1] ?? '';
  assert.ok(clase('tabla').includes('table-fixed'), 'table-layout: fixed');
  assert.ok(clase('caja').includes('overflow-auto') && clase('caja').includes('max-h-[calc(100vh-180px)]'), 'su propia barra, hasta el alto de la pantalla');
  assert.ok(clase('encabezado').includes('sticky') && clase('encabezado').includes('top-0') && clase('encabezado').includes('bg-slate-50'), 'el encabezado queda quieto y opaco');
  assert.ok(clase('celdaFija').includes('sticky') && clase('celdaFija').includes('bg-inherit'), 'las fijas, sticky con el fondo de la fila');
  assert.ok(clase('celda').includes('tabular-nums') && clase('contenido').includes('truncate'), 'números alineados y texto truncado');
  assert.ok(clase('tarjetaCompleta').includes('fixed inset-4 z-40'), 'pantalla completa');
  assert.ok(clase('aviso').includes('bg-amber-50'), 'D40: el aviso del orden es ámbar, no un error');
  assert.ok(clase('esqueleto').includes('animate-pulse') && clase('esqueleto').includes('bg-slate-200'), 'renglones grises que se mueven');
  assert.ok(clase('asa').includes('w-2') && clase('asa').includes('cursor-col-resize'), 'el asa de 8 px');
  assert.ok(clase('linea').includes('bg-blue-500'), 'la línea azul de destino');
  for (const n of ['geometriaTabla', 'superaUmbralColumna', 'indiceDestino', 'destinoArrastre', 'bordeDeHueco', 'anchoAlContenido',
    'limitarAncho', 'alternarOrden', 'campoOrden', 'direccionOrden', 'vistaCuerpo', 'filasConGrupos', 'paginaCorregida',
    'firmaSeleccion', 'estadoSeleccionPagina', 'alternarSeleccionPagina', 'alternarSeleccion', 'reconciliarColumnas',
    'velocidadAutodesplazamiento', 'textoDeError']) {
    assert.match(t, new RegExp(`\\b${n}\\(`), `TablaEstandar usa ${n}`);
  }
  assert.ok(t.includes('<colgroup>') && t.includes("style={{ width: geometria.total, minWidth: '100%' }}"), '<colgroup> y ancho = suma (mínimo 100%)');
  // D40: las dos props nuevas.
  assert.match(tabla, /preferencias: PreferenciasTabla;/, 'D40: preferencias, el resultado del usePreferenciasTabla de la pantalla');
  assert.match(tabla, /aviso\?: string \| null;/, 'D40: aviso');
  assert.match(t, /\{aviso \? \(\s*<div role="status" className=\{TABLE\.aviso\}>/, 'el aviso va sobre la tabla, como status (no alert)');
  assert.ok(t.indexOf('TABLE.aviso') < t.indexOf('<table'), 'el aviso no tapa las filas: va antes de la tabla');
  // «Ajustar al ancho»: la tabla publica su ancho en el ref de la pantalla y MenuAjustes lo lee al hacer clic.
  assert.match(t, /anchoRef\.current = disponible === null \? null : Math\.max\(0, disponible - anchoSeleccion\);/);
  assert.match(t, /new ResizeObserver\(\(\) => setDisponible\(el\.clientWidth\)\)/, 'el ancho del contenedor, con ResizeObserver');
  // El arrastre (H1, como el tablero común de T4B): captura después del umbral, document en captura con el pointerId,
  // cancelar si el nodo salió del DOM, Esc, y limpieza al desmontar.
  assert.match(t, /setPointerCapture\(pointerId\)/);
  const MANEJADOR = { pointermove: 'alMover', pointerup: 'alSoltar', pointercancel: 'alCancelar', lostpointercapture: 'alCancelar' };
  for (const [evento, manejador] of Object.entries(MANEJADOR)) {
    const cuenta = (verbo) => t.split(`document.${verbo}('${evento}', ${manejador}, true)`).length - 1;
    assert.equal(cuenta('addEventListener'), 2, `estirar y mover escuchan ${evento} en document, en captura`);
    assert.equal(cuenta('removeEventListener'), 2, `y lo quitan (${evento})`);
  }
  assert.equal((t.match(/if \(ev\.pointerId !== pointerId\) return;/g) ?? []).length, 6,
    'cada manejador de puntero (3 de estirar y 3 de mover) mira su pointerId');
  assert.match(t, /const conectado = el\.isConnected;/, 'al soltar, si el asa salió del DOM no se guarda');
  assert.match(t, /iniciado && el\.isConnected \? destino : null/, 'al soltar, si el título salió del DOM no se mueve');
  assert.match(t, /if \(!el\.isConnected\) \{\s*limpiar\(\);/, 'el bucle del arrastre cancela si el título salió del DOM');
  assert.match(t, /ev\.key !== 'Escape'/, 'Esc cancela');
  assert.match(t, /useEffect\(\(\) => \{\s*const gesto = terminar;\s*return \(\) => gesto\.current\?\.\(\);\s*\}, \[\]\);/, 'se limpia al desmontar');
  // D38: el ancho se guarda al soltar, no en cada movimiento (durante el arrastre va al <col> por ref).
  const moverAsa = /const alMover = \(ev: PointerEvent\) => \{([\s\S]*?)\n {4}\};/.exec(t);
  assert.ok(moverAsa && moverAsa[1].includes('pintar(ancho)') && !moverAsa[1].includes('guardarAncho'), 'mover el asa solo pinta');
  assert.match(t, /if \(conectado\) preferencias\.guardarAncho\(col\.id, ancho\);/, 'se guarda en pointerup');
  assert.match(t, /c\.style\.width = `\$\{px\}px`/, 'el ancho va al <col> por ref');
  assert.match(t, /if \(px !== null\) preferencias\.guardarAncho\(col\.id, px\);/, 'el doble clic guarda el ancho al contenido');
  assert.match(t, /preferencias\.mover\(col\.id, elegido\.hueco\)/, 'mover usa el hueco de los encabezados visibles');
  // D35: sin preferencias listas, sin asas ni arrastre.
  assert.match(t, /const ajustable = Boolean\(preferencias\?\.listo\);/);
  // Orden, estados, selección y textos exactos.
  assert.match(t, /aria-sort=\{campo \? \(direccion \? ARIA_ORDEN\[direccion\] : 'none'\) : undefined\}/);
  assert.match(t, /lista\.onEstado\(\{ tipo: 'orden', valor: alternarOrden\(lista\.estado\.orden, campo\) \}\)/);
  assert.match(t, /onEstado\?\.\(\{ tipo: 'pagina', valor: corregida \}\)/, 'si un filtro deja menos páginas, a la última');
  assert.match(t, /if \(haySeleccion\) onSeleccion\?\.\(\[\]\);/, 'la selección se limpia al cambiar la lista');
  assert.match(t, /<Esqueleto columnas=\{nColumnas\} \/>/);
  assert.match(fuentes.Esqueleto, /filas = 8/, '8 renglones');
  for (const texto of ["'No se pudo cargar la lista'", 'Reintentar', 'Cargando…', 'Seleccionar las filas de esta página',
    'aria-label="Actualizando la lista"', '<Paginacion']) {
    assert.ok(t.includes(texto), `TablaEstandar: ${texto}`);
  }

  // BarraTabla: el estado único, la búsqueda con retardo, Contador, el conmutador de components/ui y la pantalla completa.
  const barra = codigo(fuentes.BarraTabla);
  for (const n of ['crearBusquedaConRetardo', 'sincronizarBusqueda', 'accionPestana', 'opcionesDeVista', 'textoResultados',
    'estadoDeConteo', 'pestanaConTecla']) {
    assert.match(barra, new RegExp(`\\b${n}\\(`), `BarraTabla usa ${n}`);
  }
  assert.match(barra, /import \{ ConmutadorVista \} from '@\/components\/ui\/ConmutadorVista';/, 'C1: el conmutador de components/ui');
  assert.match(barra, /<ConmutadorVista\s+modo=\{estado\.modo\}\s+onCambiar=\{\(modo\) => onEstado\(\{ tipo: 'modo', valor: modo \}\)\}/);
  assert.match(barra, /<Contador valor=\{p\.conteo\} estado=\{estadoDeConteo\(p\.conteo, estadoConteos\)\} \/>/, 'C13: el conteo de cada pestaña');
  assert.match(barra, /<MenuAjustes columnas=\{columnas\} preferencias=\{preferencias\} anchoRef=\{anchoRef\} \/>/, 'D40: el mismo resultado y el mismo ref');
  assert.match(barra, /columnas && preferencias && estado\.modo !== 'kanban' &&/, '«Ajustar tabla» solo en Lista');
  assert.match(barra, /<FiltroEstados\b/);
  assert.match(barra, /onEstado\(\{ tipo: 'estados', valor: estados \}\)/);
  assert.match(barra, /e\.key === 'Escape' && !e\.defaultPrevented\) onPantallaCompleta\(false\)/, 'Esc sale de la pantalla completa');
  assert.match(barra, /e\.key !== 'Enter'/, 'Enter busca de inmediato');
  assert.match(barra, /setBusqueda\(\(b\) => \(\{ \.\.\.b, texto \}\)\);\s*retardo\(\)\.escribir\(texto\);/, 'cada tecla espera 300 ms (no despacha)');
  assert.ok(!/onChange=\{[^}]*onEstado\(/.test(barra), 'la caja no despacha en cada tecla');
  assert.match(barra, /retardo\(\)\.ya\(''\)/, 'la X limpia de inmediato');
  assert.match(barra, /useEffect\(\(\) => \{\s*const busquedas = retardoRef;\s*return \(\) => busquedas\.current\?\.cancelar\(\);\s*\}, \[\]\);/,
    'al desmontar no queda una búsqueda en espera');
  for (const texto of ['Maximize2', 'Pantalla completa', 'Limpiar la búsqueda', 'resultados', 'role="tablist"']) {
    assert.ok(barra.includes(texto), `BarraTabla: ${texto}`);
  }
  // FiltroEstados: casillas con la etiqueta legible, contador en el botón y 'Limpiar'.
  const filtro = codigo(fuentes.FiltroEstados);
  assert.match(filtro, /onCambiar\(alternarEstado\(seleccion, o\.valor, opciones\)\)/);
  assert.match(filtro, /onClick=\{\(\) => onCambiar\(\[\]\)\}/);
  for (const texto of ['type="checkbox"', '{o.etiqueta}', '<Contador', 'Limpiar', "e.key !== 'Escape'"]) assert.ok(filtro.includes(texto), `FiltroEstados: ${texto}`);
  // MenuAjustes: columnas (las clave, bloqueadas), flechas, 'Ajustar al ancho de la pantalla' y 'Restablecer columnas'.
  const menu = codigo(fuentes.MenuAjustes);
  for (const texto of ['SlidersHorizontal', 'Ajustar tabla', 'Ajustar al ancho de la pantalla', 'Restablecer columnas',
    'Esta columna siempre se ve', 'Cargando tus columnas…', 'preferencias.desplazar(id, paso)', 'preferencias.ocultar(id, !oculta)',
    'preferencias.restablecer()', 'preferencias.guardarAnchos(nuevos)', 'anchoRef?.current ?? null', 'disabled={!listo || bloqueada}']) {
    assert.ok(menu.includes(texto), `MenuAjustes: ${texto}`);
  }
  assert.match(menu, /\bajustarAlAncho\(/);
  assert.match(menu, /puedeDesplazar\(orden, fijas, id, -1\)/);
  assert.match(menu, /puedeDesplazar\(orden, fijas, id, 1\)/);
  // Paginacion: 'Mostrando 26–50 de 134', 25/50 y « ‹ 1 2 3 4 5 › ».
  const paginacion = codigo(fuentes.Paginacion);
  for (const n of ['textoRango', 'rangoPaginas', 'totalPaginas', 'paginaValida']) assert.match(paginacion, new RegExp(`\\b${n}\\(`));
  assert.ok(paginacion.includes('TAMANOS_PAGINA.map('));
  for (const signo of ['>«<', '>‹<', '>›<', '>»<']) assert.ok(paginacion.includes(signo), `Paginacion: ${signo}`);
  assert.match(paginacion, /aria-current=\{n === actual \? 'page' : undefined\}/);

  // design-system.ts (RP5): sin KPI_CARD; KPI_COLOR_MAP se queda, con su comentario, porque lo importa AlertasBadge.tsx.
  assert.ok(!ds.includes('KPI_CARD'), 'sin KPI_CARD');
  assert.match(ds, /\/\/ Lo usa components\/AlertasBadge\.tsx \(B2\)\.\nexport const KPI_COLOR_MAP: Record<KpiColor,/);
  assert.match(ds, /export type KpiColor = /);
  assert.match(leer('components/AlertasBadge.tsx'), /import \{ KPI_COLOR_MAP \} from '@\/lib\/design-system';/, 'AlertasBadge sigue igual');
}

console.log('✓ lib/tabla.js: columnas, modo cliente, estado único, parámetros de lista, respuestas, modo de vista y menú de fila.');
console.log('✓ T4C: sesión, estado armado, partes de columnas, URL de la lista, carga vigente, estado de la lista y modo cliente.');
console.log('✓ T4C r1: orden rechazado, estados en la sesión, escrituras del usuario del render, esperar y vueltas.');
console.log('✓ T4C r2: sin filas de otra cuenta, vuelta al orden condicional y atendida, tope de espera y cables vigilados.');
console.log('✓ T4D: umbral, ancho al contenido, ajustar al ancho, geometría, destino, orden, cuerpo, grupos, selección, barra y el fuente de los componentes.');
