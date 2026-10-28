/**
 * frontend/tests/test_tabla.mjs
 * Bloque 4, T3A (TABLA-base puntos 1 y 2, TABLA-api, R5, C3, RP8, RP54 y D23): la lógica pura de la tabla estándar
 * (lib/tabla.js). Columnas que se reconcilian con lo guardado, se mueven sin cruzar las fijas y se estiran dentro de su
 * mínimo y su máximo; orden, filtro y paginación del modo cliente; el estado único de la pantalla (reducirEstadoTabla:
 * todo cambio que no sea de página vuelve a la página 1) y los parámetros que se mandan al servidor (queryListado, con
 * q y estados en CSV, nunca search ni estado=) más la lectura de las cuatro formas de respuesta (normalizarRespuesta).
 */

import assert from 'node:assert/strict';
import {
  TAMANOS_PAGINA, VERSION_PREFS, ANCHO_MIN, ANCHO_MAX, ANCHO_POR_DEFECTO, MODOS_TABLA,
  reconciliarColumnas, fijasDe, moverColumna, indiceDestino, limitarAncho, offsetsFijas, alternarOrden,
  filtrarFilas, ordenarFilas, paginar, totalPaginas, rangoPaginas, paginaValida, textoRango,
  ESTADO_TABLA_INICIAL, estadoTablaInicial, reducirEstadoTabla, queryListado, normalizarRespuesta,
  esModoTabla, posicionMenu,
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
}

console.log('✓ lib/tabla.js: columnas, modo cliente, estado único, parámetros de lista, respuestas, modo de vista y menú de fila.');
