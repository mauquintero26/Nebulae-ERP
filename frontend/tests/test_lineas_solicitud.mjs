/**
 * frontend/tests/test_lineas_solicitud.mjs
 * U7+U8+H12+H13 con la regla de cantidad de H25 (choque C2): la librería única de las líneas de producto de la
 * solicitud (formulario de creación y editor del detalle).
 */

import assert from 'node:assert/strict';
import {
  lineaDesdeCatalogo, lineaTextoLibre, agregarLinea, resolverTextoEscrito, lineasParaEnviar, nombreLinea,
  quitarLinea, cantidadValida, cambiarCantidad, resultadosSirven, resolverConBusqueda, textoAvisoLinea,
  avisoProductosGuardados, lineasAlGuardar, ESTADOS_CON_CONFIRMACION,
} from '../src/lib/lineas-solicitud.js';

const copiaProfunda = (v) => JSON.parse(JSON.stringify(v));

console.log('--- TEST 1: lineaDesdeCatalogo (con un solo argumento y con {creado}) ---');
{
  assert.deepEqual(lineaDesdeCatalogo({ id: 7, name: 'Brocha 2"' }),
    { product_name: 'Brocha 2"', qty: 1, unit_price_cop: 0, sku_id: 7, _nuevo: false });
  assert.deepEqual(lineaDesdeCatalogo({ id: 8, product_name: 'Rodillo 9in', name: 'otro' }, { creado: true }),
    { product_name: 'Rodillo 9in', qty: 1, unit_price_cop: 0, sku_id: 8, _nuevo: true });
  assert.equal(lineaDesdeCatalogo({ id: 9, name: 'X' }, { creado: false })._nuevo, false);
  assert.equal(lineaDesdeCatalogo({ id: 9, name: 'X' }, {})._nuevo, false);
  assert.equal(lineaDesdeCatalogo({ name: 'Sin id' }).sku_id, null);
}

console.log('--- TEST 2: lineaTextoLibre ---');
{
  assert.deepEqual(lineaTextoLibre('  Cinta de enmascarar DEMO  '),
    { product_name: 'Cinta de enmascarar DEMO', qty: 1, unit_price_cop: 0, sku_id: null });
}

console.log('--- TEST 3: agregarLinea (fusión por sku y por texto libre normalizado, sin mutar) ---');
{
  const base = [lineaDesdeCatalogo({ id: 1, name: 'Pintura' }), lineaTextoLibre('Brocha 1/2"')];
  const antes = copiaProfunda(base);

  let r = agregarLinea(base, lineaDesdeCatalogo({ id: 2, name: 'Lija' }));
  assert.equal(r.lineas.length, 3);
  assert.equal(r.indice, 2);
  assert.equal(r.fusionada, false);
  assert.equal(r.lineas[2].product_name, 'Lija');

  r = agregarLinea(base, lineaDesdeCatalogo({ id: 1, name: 'Pintura' }));
  assert.equal(r.lineas.length, 2);
  assert.equal(r.indice, 0);
  assert.equal(r.fusionada, true);
  assert.equal(r.lineas[0].qty, 2, '1 + 1');

  // texto libre con el mismo nombre normalizado (mayúsculas, tildes y espacios)
  r = agregarLinea(base, lineaTextoLibre('  brocha   1/2" '));
  assert.deepEqual([r.lineas.length, r.indice, r.fusionada, r.lineas[1].qty], [2, 1, true, 2]);
  r = agregarLinea([lineaTextoLibre('Brocha eléctrica')], lineaTextoLibre('BROCHA ELECTRICA'));
  assert.equal(r.fusionada, true);

  // un texto libre frente a una línea del catálogo con el mismo nombre NO se fusiona
  r = agregarLinea(base, lineaTextoLibre('Pintura'));
  assert.deepEqual([r.lineas.length, r.fusionada], [3, false]);
  // ni una línea del catálogo frente a un texto libre con su nombre
  r = agregarLinea(base, lineaDesdeCatalogo({ id: 5, name: 'Brocha 1/2"' }));
  assert.deepEqual([r.lineas.length, r.fusionada], [3, false]);

  // una cantidad que se está escribiendo ('') cuenta como 1 al sumar
  r = agregarLinea([{ ...base[0], qty: '' }], lineaDesdeCatalogo({ id: 1, name: 'Pintura' }));
  assert.equal(r.lineas[0].qty, 2);
  r = agregarLinea([{ ...base[0], qty: 3 }], { ...lineaDesdeCatalogo({ id: 1, name: 'Pintura' }), qty: 2 });
  assert.equal(r.lineas[0].qty, 5);

  // nunca muta la entrada
  assert.deepEqual(base, antes);
  // lista vacía o ausente
  r = agregarLinea(undefined, lineaTextoLibre('Algo'));
  assert.deepEqual([r.lineas.length, r.indice, r.fusionada], [1, 0, false]);

  // una línea en blanco (sin nombre y sin sku) no se agrega: indice -1 y una copia de la lista
  for (const blanca of [lineaTextoLibre('   '), { product_name: '', qty: 1, sku_id: null }, {}, null]) {
    r = agregarLinea(base, blanca);
    assert.deepEqual([r.lineas, r.indice, r.fusionada], [base, -1, false], JSON.stringify(blanca));
    assert.notEqual(r.lineas, base, 'arreglo nuevo');
  }
  // con sku sí se agrega aunque no traiga nombre (el catálogo la identifica)
  r = agregarLinea(base, { product_name: '', qty: 1, sku_id: 9 });
  assert.deepEqual([r.lineas.length, r.indice, r.fusionada], [3, 2, false]);
  assert.deepEqual(base, antes);
}

console.log('--- TEST 4: cantidadValida (entero >= 1) ---');
{
  const casos = [['0', 1], [-3, 1], ['', 1], ['abc', 1], ['2.7', 2], [2.7, 2], [5, 5], ['7', 7], [null, 1], [undefined, 1],
    [0.5, 1], [Infinity, 1], [NaN, 1]];
  for (const [v, esperado] of casos) assert.equal(cantidadValida(v), esperado, String(v));
}

console.log('--- TEST 5: cambiarCantidad (acepta \'\' mientras se escribe; no muta) ---');
{
  const lineas = [lineaTextoLibre('A'), lineaTextoLibre('B')];
  const antes = copiaProfunda(lineas);
  let r = cambiarCantidad(lineas, 0, '');
  assert.equal(r[0].qty, '', 'se puede borrar el número para escribir otro');
  assert.notEqual(r, lineas);
  assert.deepEqual(lineas, antes, 'no muta');
  r = cambiarCantidad(r, 0, '5');
  assert.equal(r[0].qty, 5, "'5' tras borrar es 5, no 15 (H25)");
  for (const [v, esperado] of [['0', 1], [-3, 1], ['abc', 1], ['2.7', 2], [12, 12]]) {
    assert.equal(cambiarCantidad(lineas, 1, v)[1].qty, esperado, String(v));
  }
  assert.equal(cambiarCantidad(lineas, 1, '4')[0], lineas[0], 'las otras líneas no cambian');
  assert.deepEqual(cambiarCantidad(lineas, 9, '4'), lineas, 'índice fuera de rango: igual');
}

console.log('--- TEST 6: quitarLinea ---');
{
  const lineas = [lineaTextoLibre('A'), lineaTextoLibre('B'), lineaTextoLibre('C')];
  const antes = copiaProfunda(lineas);
  assert.deepEqual(quitarLinea(lineas, 1).map((l) => l.product_name), ['A', 'C']);
  assert.deepEqual(lineas, antes, 'no muta');
  assert.deepEqual(quitarLinea(lineas, 5).map((l) => l.product_name), ['A', 'B', 'C']);
}

console.log('--- TEST 7: lineasParaEnviar ---');
{
  const lineas = [
    { ...lineaDesdeCatalogo({ id: 1, name: 'Pintura' }, { creado: true }), qty: '' },
    { ...lineaTextoLibre('Brocha'), qty: '3', _tmp: 'x', notas: 'conservar' },
  ];
  const antes = copiaProfunda(lineas);

  let r = lineasParaEnviar(lineas, '');
  assert.deepEqual(r, [
    { product_name: 'Pintura', qty: 1, unit_price_cop: 0, sku_id: 1 },
    { product_name: 'Brocha', qty: 3, unit_price_cop: 0, sku_id: null, notas: 'conservar' },
  ], 'sin claves "_" y con cantidades válidas');
  assert.deepEqual(lineas, antes, 'no muta');

  // lo escrito sin "+ Agregar" también se guarda, junto a las líneas que ya había (regresión de getExtras)
  r = lineasParaEnviar(lineas, '  Cinta de enmascarar ');
  assert.equal(r.length, 3);
  assert.deepEqual(r[2], { product_name: 'Cinta de enmascarar', qty: 1, unit_price_cop: 0, sku_id: null });
  // un pendiente de solo espacios se ignora
  assert.equal(lineasParaEnviar(lineas, '   ').length, 2);
  assert.equal(lineasParaEnviar(lineas).length, 2);
  // las líneas sin nombre y sin sku no viajan; una con sku sí
  r = lineasParaEnviar([...lineas, { product_name: '  ', qty: 2, sku_id: null }, { _nuevo: true }, null,
    { product_name: '', qty: '4', sku_id: 9 }], '');
  assert.deepEqual(r.map((l) => [l.product_name, l.qty, l.sku_id]), [['Pintura', 1, 1], ['Brocha', 3, null], ['', 4, 9]]);
  // un pendiente igual a un texto libre que ya está se suma a esa línea (misma regla que agregarLinea)
  r = lineasParaEnviar(lineas, 'BROCHA');
  assert.deepEqual([r.length, r[1].qty], [2, 4]);
  // sin líneas: solo el pendiente
  assert.deepEqual(lineasParaEnviar([], 'Algo'), [{ product_name: 'Algo', qty: 1, unit_price_cop: 0, sku_id: null }]);
  assert.deepEqual(lineasParaEnviar(null, ''), []);
}

console.log('--- TEST 8: resolverTextoEscrito ---');
{
  const resultados = [
    { id: 1, name: 'Brocha Eléctrica Grande' },
    { id: 2, product_name: 'Brocha Eléctrica' },
    { id: 3, nombre: 'Rodillo' },
  ];
  assert.equal(resolverTextoEscrito('  brocha   electrica ', resultados), resultados[1], 'exacto sin tildes ni mayúsculas');
  assert.equal(resolverTextoEscrito('RODILLO', resultados), resultados[2]);
  assert.equal(resolverTextoEscrito('brocha', resultados), null, 'parcial');
  assert.equal(resolverTextoEscrito('', resultados), null);
  assert.equal(resolverTextoEscrito('Rodillo', null), null);
}

console.log('--- TEST 9: nombreLinea ---');
{
  assert.equal(nombreLinea({ product_name: '  Pintura  ' }), 'Pintura');
  assert.equal(nombreLinea({ nombre: 'Lija' }), 'Lija');
  assert.equal(nombreLinea({ name: 'Brocha' }), 'Brocha');
  assert.equal(nombreLinea({ product_name: '  ', name: 'Brocha' }), 'Brocha');
  assert.equal(nombreLinea({}), '');
  assert.equal(nombreLinea(null), '');
}

console.log('--- TEST 10 (T7 ronda 1, A4): resultadosSirven — Enter antes de que vuelva la búsqueda ---');
{
  // Sirven solo si son del MISMO texto (recortado) y no hay temporizador ni petición en curso.
  assert.equal(resultadosSirven('Rodillo 9in', 'Rodillo 9in', false), true);
  assert.equal(resultadosSirven('  Rodillo 9in ', 'Rodillo 9in', false), true);
  // Se escribió de corrido y se pulsó Enter: los resultados son de un texto anterior (o no hay).
  assert.equal(resultadosSirven('Rodillo 9in', 'Rodi', false), false);
  assert.equal(resultadosSirven('Rodillo 9in', '', false), false);
  assert.equal(resultadosSirven('Rodillo 9in', null, false), false);
  // El temporizador todavía no dispara (o la petición no ha vuelto): hay que buscar en el acto.
  assert.equal(resultadosSirven('Rodillo 9in', 'Rodillo 9in', true), false);
  // Sin texto no hay nada que resolver.
  assert.equal(resultadosSirven('   ', '   ', false), false);
}

console.log('--- TEST 11 (T7 ronda 1, A4): resolverConBusqueda — busca en el acto y resuelve contra esa respuesta ---');
{
  const catalogo = [{ id: 3, product_name: 'Rodillo antigoteo 9in' }, { id: 4, product_name: 'Rodillo antigoteo 9in azul' }];
  const pedidas = [];
  const buscar = async (q) => { pedidas.push(q); return { status: 'success', data: catalogo }; };
  // Coincidencia exacta (sin tildes, mayúsculas ni espacios de más): se vincula al catálogo.
  let r = await resolverConBusqueda('  rodillo ANTIGOTEO 9in ', buscar);
  assert.deepEqual(r, { coincidencia: catalogo[0], comprobado: true });
  assert.deepEqual(pedidas, ['rodillo ANTIGOTEO 9in'], 'busca el texto recortado');
  // Sin coincidencia exacta: texto libre, pero comprobado (el aviso de siempre: «no está en el catálogo»).
  r = await resolverConBusqueda('Rodillo', buscar);
  assert.deepEqual(r, { coincidencia: null, comprobado: true });
  // La respuesta también puede venir como arreglo; una respuesta rara no rompe.
  r = await resolverConBusqueda('Rodillo antigoteo 9in azul', async () => catalogo);
  assert.deepEqual(r, { coincidencia: catalogo[1], comprobado: true });
  r = await resolverConBusqueda('Rodillo', async () => ({ data: null }));
  assert.deepEqual(r, { coincidencia: null, comprobado: true });
  // La búsqueda falla (red caída, 500): texto libre SIN comprobar (el aviso lo dice; no afirma que no esté).
  r = await resolverConBusqueda('Rodillo antigoteo 9in', async () => { throw new Error('Failed to fetch'); });
  assert.deepEqual(r, { coincidencia: null, comprobado: false });
  r = await resolverConBusqueda('Rodillo antigoteo 9in', () => { throw new Error('síncrono'); });
  assert.deepEqual(r, { coincidencia: null, comprobado: false });
}

console.log('--- TEST 12 (T8B, H25): textoAvisoLinea — el mismo aviso en el formulario de nueva SC y en el editor del detalle ---');
{
  // Los textos son los de T7 (formulario de nueva solicitud), tal cual: el editor del detalle muestra los mismos.
  const nueva = (linea) => agregarLinea([], linea);
  assert.equal(textoAvisoLinea(nueva(lineaDesdeCatalogo({ id: 8, name: 'Rodillo 9in' }, { creado: true })), 'creado'),
    'Se creó «Rodillo 9in» en el catálogo y se agregó a la solicitud. Queda marcado para completar marca, categoría y precio después.');
  assert.equal(textoAvisoLinea(nueva(lineaDesdeCatalogo({ id: 8, name: 'Rodillo 9in' })), 'existente'),
    '«Rodillo 9in» ya estaba en el catálogo: se agregó.');
  assert.equal(textoAvisoLinea(nueva(lineaTextoLibre('Cinta DEMO')), 'texto'),
    'Se agregó «Cinta DEMO» como texto libre (no está en el catálogo).');
  assert.equal(textoAvisoLinea(nueva(lineaTextoLibre('Cinta DEMO')), 'texto-sin-comprobar'),
    'Se agregó «Cinta DEMO» como texto libre (no se pudo comprobar el catálogo).');
  // Elegido del catálogo sin sumarse a otra línea: sin texto (solo se resalta la línea).
  assert.equal(textoAvisoLinea(nueva(lineaDesdeCatalogo({ id: 8, name: 'Rodillo 9in' })), 'catalogo'), '');
  // Sumado a una línea que ya estaba: lo dice con la cantidad nueva, venga de donde venga.
  const base = [{ product_name: 'Brocha 2"', qty: 2, sku_id: 7 }];
  for (const origen of ['catalogo', 'creado', 'existente', 'texto']) {
    const r = agregarLinea(base, { ...lineaDesdeCatalogo({ id: 7, name: 'Brocha 2"' }), qty: 3 });
    assert.equal(textoAvisoLinea(r, origen), '«Brocha 2"» ya estaba en la lista: ahora son 5.', origen);
  }
  // Nada que decir: una línea en blanco (indice -1), sin resultado o un origen desconocido.
  assert.equal(textoAvisoLinea(agregarLinea(base, lineaTextoLibre('   ')), 'texto'), '');
  assert.equal(textoAvisoLinea(null, 'texto'), '');
  assert.equal(textoAvisoLinea(nueva(lineaTextoLibre('X')), 'otro'), '');
}

console.log('--- TEST 13 (T8B, ruling 1; r2, punto 2): lineasAlGuardar — lo que manda «Guardar productos» del editor ---');
{
  // guardar() del editor usa lineasAlGuardar(borrador, nombre ? lineaEscrita() : null): la línea pendiente la arma el
  // editor (elegida del catálogo con la cantidad escrita); la función la suma a una igual (agregarLinea, ronda 1) y
  // aplica lineasParaEnviar (sin claves '_', cantidades válidas).
  const borrador = [{ product_name: 'Brocha 2"', qty: '', sku_id: 7, unit_price_cop: 0, _nuevo: false }];
  const antes = copiaProfunda(borrador);
  const pendiente = { product_name: 'Rodillo 9in', qty: cantidadValida('3'), sku_id: 12, unit_price_cop: 0, _nuevo: true };
  assert.deepEqual(lineasAlGuardar(borrador, pendiente), [
    { product_name: 'Brocha 2"', qty: 1, sku_id: 7, unit_price_cop: 0 },
    { product_name: 'Rodillo 9in', qty: 3, sku_id: 12, unit_price_cop: 0 },
  ]);
  assert.deepEqual(borrador, antes, 'no muta el borrador');
  // Sin línea pendiente: solo el borrador, normalizado.
  assert.deepEqual(lineasAlGuardar(borrador, null), [{ product_name: 'Brocha 2"', qty: 1, sku_id: 7, unit_price_cop: 0 }]);
  assert.deepEqual(lineasAlGuardar(borrador), [{ product_name: 'Brocha 2"', qty: 1, sku_id: 7, unit_price_cop: 0 }]);
  // Como texto pendiente (lineasParaEnviar(borrador, nombre)) perdería el SKU y la cantidad: por eso no se usa así.
  assert.deepEqual(lineasParaEnviar(borrador, 'Rodillo 9in').at(-1),
    { product_name: 'Rodillo 9in', qty: 1, unit_price_cop: 0, sku_id: null });
  // Ronda 1 (punto 3): la línea pendiente igual a una que ya está (×2 + ×3) queda en una sola línea ×5, con su SKU.
  const conRodillo = [...borrador, { product_name: 'Rodillo 9in', qty: 2, sku_id: 12, unit_price_cop: 0 }];
  assert.deepEqual(lineasAlGuardar(conRodillo, { ...pendiente, _nuevo: false }), [
    { product_name: 'Brocha 2"', qty: 1, sku_id: 7, unit_price_cop: 0 },
    { product_name: 'Rodillo 9in', qty: 5, sku_id: 12, unit_price_cop: 0 },
  ]);
  // Lo mismo con un texto libre igual a otro (sin tildes ni mayúsculas).
  assert.deepEqual(lineasAlGuardar([lineaTextoLibre('Cinta DEMO')], { ...lineaTextoLibre('cinta demo'), qty: 2 }),
    [{ product_name: 'Cinta DEMO', qty: 3, unit_price_cop: 0, sku_id: null }]);
  // Sin borrador (lista vacía o ausente) y una línea pendiente en blanco.
  assert.deepEqual(lineasAlGuardar(undefined, { ...lineaTextoLibre('Lija'), qty: '' }),
    [{ product_name: 'Lija', qty: 1, unit_price_cop: 0, sku_id: null }]);
  assert.deepEqual(lineasAlGuardar(borrador, lineaTextoLibre('   ')), [{ product_name: 'Brocha 2"', qty: 1, sku_id: 7, unit_price_cop: 0 }]);
}

console.log('--- TEST 13b (T8B r2, punto 4): ESTADOS_CON_CONFIRMACION — una sola fuente ---');
{
  // Los estados en que cambiar los productos anula la confirmación del cliente (el aviso del editor y el de guardar).
  assert.deepEqual([...ESTADOS_CON_CONFIRMACION], ['PENDIENTE_CONFIRMACION', 'CONFIRMADA']);
  assert.ok(Object.isFrozen(ESTADOS_CON_CONFIRMACION));
}

console.log('--- TEST 14 (T8B r1, punto 8): avisoProductosGuardados — el aviso después de «Guardar productos» ---');
{
  const ANULADA = 'Productos guardados. Como cambiaron, la confirmación del cliente quedó anulada: envíale la solicitud de nuevo.';
  // Desde Pendiente por confirmación o Confirmada, si el estado cambió: la confirmación quedó anulada.
  for (const antes of ['PENDIENTE_CONFIRMACION', 'CONFIRMADA']) {
    for (const despues of ['ASIGNADA', 'BORRADOR']) {
      assert.deepEqual(avisoProductosGuardados(antes, despues), { texto: ANULADA, tono: 'info' }, `${antes} -> ${despues}`);
    }
    // Los mismos productos (o solo vinculados al catálogo): el estado no cambia.
    assert.deepEqual(avisoProductosGuardados(antes, antes), { texto: 'Productos guardados.', tono: 'ok' });
  }
  // En otros estados no había confirmación que anular.
  assert.deepEqual(avisoProductosGuardados('ASIGNADA', 'ASIGNADA'), { texto: 'Productos guardados.', tono: 'ok' });
  assert.deepEqual(avisoProductosGuardados('BORRADOR', 'ASIGNADA'), { texto: 'Productos guardados.', tono: 'ok' });
  // Sin el estado nuevo (la respuesta no trajo la solicitud): no se afirma que se anuló.
  assert.deepEqual(avisoProductosGuardados('CONFIRMADA', undefined), { texto: 'Productos guardados.', tono: 'ok' });
  assert.deepEqual(avisoProductosGuardados(null, null), { texto: 'Productos guardados.', tono: 'ok' });
}

console.log('OK test_lineas_solicitud');
