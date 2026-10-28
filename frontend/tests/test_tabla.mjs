/**
 * frontend/tests/test_tabla.mjs
 * Bloque 4, T3A (TABLA-base puntos 1 y 2, TABLA-api, R5, C3, RP8, RP54 y D23): la lógica pura de la tabla estándar
 * (lib/tabla.js). Columnas que se reconcilian con lo guardado, se mueven sin cruzar las fijas y se estiran dentro de su
 * mínimo y su máximo; orden, filtro y paginación del modo cliente; el estado único de la pantalla (reducirEstadoTabla:
 * todo cambio que no sea de página vuelve a la página 1) y los parámetros que se mandan al servidor (queryListado, con
 * q y estados en CSV, nunca search ni estado=) más la lectura de las cuatro formas de respuesta (normalizarRespuesta).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  TAMANOS_PAGINA, VERSION_PREFS, ANCHO_MIN, ANCHO_MAX, ANCHO_POR_DEFECTO, MODOS_TABLA,
  reconciliarColumnas, fijasDe, moverColumna, indiceDestino, limitarAncho, offsetsFijas, alternarOrden,
  filtrarFilas, ordenarFilas, paginar, totalPaginas, rangoPaginas, paginaValida, textoRango,
  ESTADO_TABLA_INICIAL, estadoTablaInicial, reducirEstadoTabla, queryListado, normalizarRespuesta,
  esModoTabla, posicionMenu,
  CAMPOS_SESION_TABLA, claveSesionTabla, textoSesionTabla, leerSesionTabla, armarEstadoTabla, cambiosEstadoTabla,
  dependenciasTablero, parteDeColumnas, urlListado, crearCargaListado, aplicarLlegadaListado, estadoListado,
  listadoCliente,
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

console.log('--- TEST 16 (T4C, R4 y C2): lo de la sesión (tabla-sesion:{id}): pestaña, página, búsqueda, orden, semáforo y paso ---');
{
  assert.deepEqual(CAMPOS_SESION_TABLA, ['vista', 'pagina', 'q', 'orden', 'semaforo', 'paso']);
  assert.ok(Object.isFrozen(CAMPOS_SESION_TABLA));
  assert.equal(claveSesionTabla('ventas.hub'), 'tabla-sesion:ventas.hub');
  const estado = estadoTablaInicial({
    vista: 'cot', modo: 'kanban', semaforo: 'vencidos', paso: 'cotizar', estados: ['A', 'B'], q: 'colchón', orden: '-monto',
    pagina: 4, tamano: 50,
  });
  const texto = textoSesionTabla(estado, 7);
  assert.deepEqual(JSON.parse(texto),
    { usuario: 7, vista: 'cot', pagina: 4, q: 'colchón', orden: '-monto', semaforo: 'vencidos', paso: 'cotizar' },
    'ni el modo ni el tamaño (son del usuario, R4) ni el filtro de estados');
  assert.deepEqual(leerSesionTabla(texto, 7),
    { vista: 'cot', pagina: 4, q: 'colchón', orden: '-monto', semaforo: 'vencidos', paso: 'cotizar' });
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
    leerSesionTabla(JSON.stringify({ usuario: 7, pagina: '3', q: 5, vista: '', estados: ['X'], modo: 'kanban', tamano: 50, otro: 1 }), 7),
    { pagina: 3, q: '5', vista: null },
  );
  assert.deepEqual(leerSesionTabla(JSON.stringify({ usuario: 7, pagina: -2, orden: 'cliente' }), 7), { pagina: 1, orden: 'cliente' });
}

console.log('--- TEST 17 (T4C, R5, C3 y RP26): armarEstadoTabla, cambiosEstadoTabla y dependenciasTablero (D39) ---');
{
  const inicial = { vista: 'todos', orden: 'atencion' };
  // La primera vez, lo de la pantalla. El CRM entra en Kanban (RP26, punto 4).
  assert.deepEqual(armarEstadoTabla(inicial, {}), estadoTablaInicial(inicial));
  assert.deepEqual(armarEstadoTabla(inicial), estadoTablaInicial(inicial));
  assert.equal(armarEstadoTabla({ modo: 'kanban' }, {}).modo, 'kanban');
  // Con todo: la sesión, el filtro de estados y las dos preferencias, SIN volver a la página 1 (es una restauración).
  const armado = armarEstadoTabla(inicial, {
    sesion: { vista: 'cot', pagina: 4, q: 'cama' }, estados: ['ENVIADA'], modo: 'kanban', tamano: 50,
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
  // Sin filtro: el de la pantalla. Una sesión que no es un objeto no cuenta; la sesión no trae ni modo ni tamaño.
  assert.deepEqual(armarEstadoTabla({ estados: ['A'] }, {}).estados, ['A']);
  assert.deepEqual(armarEstadoTabla(inicial, { sesion: /** @type {any} */ ('x') }), estadoTablaInicial(inicial));
  assert.deepEqual(armarEstadoTabla(inicial, { sesion: /** @type {any} */ ({ modo: 'kanban', tamano: 50, estados: ['Z'] }) }),
    estadoTablaInicial(inicial));
  // No muta lo que recibe.
  const sesion = { vista: 'sc', pagina: 2 };
  armarEstadoTabla(inicial, { sesion, estados: ['X'] });
  assert.deepEqual(sesion, { vista: 'sc', pagina: 2 });

  // Qué hay que escribir después de un cambio (cada campo tiene UN lugar).
  const nada = { sesion: false, estados: false, modo: false, tamano: false };
  assert.deepEqual(cambiosEstadoTabla(armado, armado), nada);
  const pagina = reducirEstadoTabla(armado, { tipo: 'pagina', valor: 5 });
  assert.deepEqual(cambiosEstadoTabla(armado, pagina), { ...nada, sesion: true });
  const estados = reducirEstadoTabla(armado, { tipo: 'estados', valor: ['A'] });
  assert.deepEqual(cambiosEstadoTabla(armado, estados), { ...nada, sesion: true, estados: true }, 'vuelve a la página 1');
  const estados2 = reducirEstadoTabla(estados, { tipo: 'estados', valor: ['B'] });
  assert.deepEqual(cambiosEstadoTabla(estados, estados2), { ...nada, estados: true }, 'ya estaba en la página 1');
  assert.deepEqual(cambiosEstadoTabla(estados, reducirEstadoTabla(estados, { tipo: 'tamano', valor: 25 })), { ...nada, tamano: true });
  assert.deepEqual(cambiosEstadoTabla(armado, reducirEstadoTabla(armado, { tipo: 'modo', valor: 'lista' })),
    { ...nada, sesion: true, modo: true }, 'cambiar de modo también vuelve a la página 1');

  // Lo repartido (sesión, filtro y preferencias) vuelve a armar EXACTAMENTE el mismo estado.
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
      sesion: leerSesionTabla(textoSesionTabla(s, 7), 7), estados: s.estados, modo: s.modo, tamano: s.tamano,
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

console.log('--- TEST 20 (T4C, D28): crearCargaListado — una carga lenta no pisa a la nueva ---');
{
  // pedir(url, signal) a mano; ignora el signal a propósito (resuelve igual), como un fetch que ya respondió.
  const aMano = () => {
    const llamadas = [];
    const pedir = (url, signal) => new Promise((resolver, rechazar) => llamadas.push({ url, signal, resolver, rechazar }));
    return { llamadas, pedir };
  };
  {
    const { llamadas, pedir } = aMano();
    const llegadas = [];
    const carga = crearCargaListado({ pedir, alLlegar: (l) => llegadas.push(l) });
    carga.cargar('/x?offset=0', 'k1');
    await tic();
    carga.cargar('/x?offset=25', 'k2');
    await tic();
    assert.deepEqual(llamadas.map((l) => l.url), ['/x?offset=0', '/x?offset=25']);
    assert.equal(llamadas[0].signal.aborted, true, 'la anterior se aborta (AbortController)');
    assert.equal(llamadas[1].signal.aborted, false);
    llamadas[1].resolver({ data: [{ id: 2 }], total: 30 });
    await tic();
    // La lenta llega después: se descarta antes de publicar (el turno ya no es el suyo).
    llamadas[0].resolver({ data: [{ id: 1 }], total: 30 });
    await tic();
    assert.deepEqual(llegadas, [{ marca: 'k2', ok: true, respuesta: { data: [{ id: 2 }], total: 30 } }]);
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
    assert.deepEqual(llegadas, [{ marca: 'k2', ok: false, error }]);
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
    assert.deepEqual(llegadas.map((l) => [l.marca, l.ok]), [['k1', true]]);
  }
  {
    // Un pedir que lanza de inmediato es un error de la carga vigente, no una excepción del efecto.
    const llegadas = [];
    const error = new Error('sin red');
    const carga = crearCargaListado({ pedir: () => { throw error; }, alLlegar: (l) => llegadas.push(l) });
    assert.doesNotThrow(() => carga.cargar('/a', 'k1'));
    await tic();
    assert.deepEqual(llegadas, [{ marca: 'k1', ok: false, error }]);
  }
}

console.log('--- TEST 21 (T4C, H6 y RP35): aplicarLlegadaListado y estadoListado ---');
{
  const a = { id: 1 };
  const b = { id: 2 };
  // Antes de la primera respuesta no se inventa nada: total, conteos y resumen null y cargandoInicial.
  assert.deepEqual(estadoListado(null, { clave: 'k1' }),
    { filas: [], total: null, conteos: null, resumen: null, crudo: null, cargandoInicial: true, recargando: false, error: null });
  const respuesta = { status: 'success', total: 134, data: [a, b], conteos: { todos: 134 }, resumen: { monto: 5 } };
  const r1 = aplicarLlegadaListado(null, { marca: 'k1', ok: true, respuesta });
  assert.deepEqual(estadoListado(r1, { clave: 'k1' }), {
    filas: [a, b], total: 134, conteos: { todos: 134 }, resumen: { monto: 5 }, crudo: respuesta, cargandoInicial: false,
    recargando: false, error: null,
  });
  // Otra página, búsqueda o filtro en camino: conserva las filas anteriores y avisa recargando.
  const recargando = estadoListado(r1, { clave: 'k2' });
  assert.deepEqual([recargando.filas, recargando.total, recargando.conteos, recargando.cargandoInicial, recargando.recargando],
    [[a, b], 134, { todos: 134 }, false, true]);
  // Falla: conserva lo último y trae el error (dentro de la tabla); mientras se reintenta, el error no se muestra.
  const error = Object.assign(new Error('No se puede ordenar por «x».'), { status: 422 });
  const r2 = aplicarLlegadaListado(r1, { marca: 'k2', ok: false, error });
  const fallo = estadoListado(r2, { clave: 'k2' });
  assert.deepEqual([fallo.filas, fallo.total, fallo.error, fallo.recargando, fallo.cargandoInicial], [[a, b], 134, error, false, false]);
  const reintento = estadoListado(r2, { clave: 'k3' });
  assert.deepEqual([reintento.error, reintento.recargando], [null, true]);
  // La primera falla: sin filas, sin total y con el error; al reintentar, otra vez cargandoInicial (no hay qué mostrar).
  const r0 = aplicarLlegadaListado(null, { marca: 'k1', ok: false, error });
  assert.deepEqual(estadoListado(r0, { clave: 'k1' }),
    { filas: [], total: null, conteos: null, resumen: null, crudo: null, cargandoInicial: false, recargando: false, error });
  assert.equal(estadoListado(r0, { clave: 'k2' }).cargandoInicial, true);
  // Una respuesta buena después de un error lo borra; una sin conteos los deja en null.
  const r3 = aplicarLlegadaListado(r2, { marca: 'k3', ok: true, respuesta: { data: [b], total: 1 } });
  assert.deepEqual([estadoListado(r3, { clave: 'k3' }).error, estadoListado(r3, { clave: 'k3' }).conteos], [null, null]);
  // RP35: con activo = false no hay nada en camino y se conserva lo último.
  assert.deepEqual(estadoListado(r1, { clave: 'k9', activo: false }), estadoListado(r1, { clave: 'k1' }));
  assert.equal(estadoListado(null, { clave: 'k1', activo: false }).cargandoInicial, false);
  // No muta lo que recibe.
  assert.deepEqual(r1.datos?.filas, [a, b]);
  assert.equal(r1.error, null);
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

console.log('--- TEST 23 (T4C, R4, RP8, RP26, RP35, D28 y D38): el fuente de los hooks de components/tabla ---');
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
  assert.ok(estado.includes('guardarTabla({ tamano: siguiente.tamano })'), 'solo la pieza del tamaño');
  assert.ok(!estado.includes('useVistaGuardada'), 'sin el otro escritor de vista:');
  assert.ok(estado.includes('reducirEstadoTabla(') && estado.includes('armarEstadoTabla(') && estado.includes('cambiosEstadoTabla('));
  // D38: usePreferenciasTabla escribe con usePreferenciaParte la pieza de parteDeColumnas, y nada antes de listo.
  assert.match(prefs, /usePreferenciaParte<[A-Za-z]+>\(`tabla:\$\{id\}`/);
  assert.ok(prefs.includes('reconciliarColumnas(') && prefs.includes('parteDeColumnas('));
  assert.match(prefs, /if \(!ahora\.listo\) return false;/, 'nada se escribe antes de listo');
  // RP8 y D28: la URL con queryListado (urlListado), el signal hasta apiFetch y la carga vigente (crearCargaListado).
  assert.ok(listado.includes('urlListado(') && listado.includes('crearCargaListado('));
  assert.ok(listado.includes('apiFetch(url, { signal })'), 'apiFetch recibe el signal del AbortController');
  assert.match(listado, /carga\.cargar\(url, clave\);\s*return \(\) => carga\.cancelar\(\);/, 'el efecto aborta al limpiarse (StrictMode, otra consulta)');
  assert.ok(listado.includes('aplicarLlegadaListado(') && listado.includes('estadoListado('));
  assert.match(listado, /activo = true/, 'RP35: activo, true por defecto');
  assert.ok(!/search=|[?&]estado=/.test(listado));
  assert.ok(listado.includes('listadoCliente('));
  for (const exportado of ['useEstadoTabla', 'usePreferenciasTabla', 'useListado']) {
    assert.ok(indice.includes(`export * from './${exportado}';`), exportado);
  }
}

console.log('✓ lib/tabla.js: columnas, modo cliente, estado único, parámetros de lista, respuestas, modo de vista y menú de fila.');
console.log('✓ T4C: sesión, estado armado, partes de columnas, URL de la lista, carga vigente, estado de la lista y modo cliente.');
