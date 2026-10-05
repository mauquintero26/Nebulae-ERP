/**
 * frontend/tests/test_copiar.mjs
 * H30 (Bloque 2, T6B): 'Copiar enlace' nunca falla en silencio. copiarTexto intenta el portapapeles, luego copiar la
 * selección del input, y si las dos fallan responde 'manual' (la pantalla deja el enlace seleccionado y muestra el
 * aviso ámbar). Con objetos falsos, sin navegador.
 */

import assert from 'node:assert/strict';
import { copiarTexto } from '../src/lib/copiar.js';

const LINK = 'https://erp.example/confirmar/abc123';

/** Portapapeles falso que resuelve o rechaza y recuerda con qué lo llamaron. */
function portapapeles(ok) {
  const llamadas = [];
  return {
    llamadas,
    writeText: (t) => {
      llamadas.push(t);
      return ok ? Promise.resolve() : Promise.reject(new Error('NotAllowedError'));
    },
  };
}
/** copiarSeleccion falso que devuelve `valor` (o lanza) y cuenta sus llamadas. */
function seleccion(valor) {
  const f = () => {
    f.veces += 1;
    if (valor instanceof Error) throw valor;
    return valor;
  };
  f.veces = 0;
  return f;
}

console.log('--- CASO 1: portapapeles que resuelve -> copiado, sin tocar la selección ---');
{
  const p = portapapeles(true);
  const s = seleccion(true);
  assert.equal(await copiarTexto(LINK, { portapapeles: p, copiarSeleccion: s }), 'copiado');
  assert.deepEqual(p.llamadas, [LINK], 'writeText recibió el enlace');
  assert.equal(s.veces, 0, 'copiarSeleccion no se llamó');
}

console.log('--- CASO 2: portapapeles que rechaza + selección que copia -> copiado ---');
{
  const p = portapapeles(false);
  const s = seleccion(true);
  assert.equal(await copiarTexto(LINK, { portapapeles: p, copiarSeleccion: s }), 'copiado');
  assert.equal(s.veces, 1);
}

console.log('--- CASO 3: sin portapapeles (HTTP con IP) + selección que copia -> copiado ---');
{
  assert.equal(await copiarTexto(LINK, { portapapeles: undefined, copiarSeleccion: seleccion(true) }), 'copiado');
  assert.equal(await copiarTexto(LINK, { portapapeles: null, copiarSeleccion: seleccion(true) }), 'copiado');
  assert.equal(await copiarTexto(LINK, { portapapeles: {}, copiarSeleccion: seleccion(true) }), 'copiado',
    'un portapapeles sin writeText');
}

console.log('--- CASO 4: portapapeles que rechaza + selección que no copia -> manual ---');
{
  assert.equal(await copiarTexto(LINK, { portapapeles: portapapeles(false), copiarSeleccion: seleccion(false) }),
    'manual');
}

console.log('--- CASO 5: copiarSeleccion que lanza -> manual ---');
{
  assert.equal(await copiarTexto(LINK, { copiarSeleccion: seleccion(new Error('SecurityError')) }), 'manual');
  // Un writeText que lanza de forma síncrona tampoco rompe nada.
  const lanza = { writeText: () => { throw new Error('sin permiso'); } };
  assert.equal(await copiarTexto(LINK, { portapapeles: lanza, copiarSeleccion: seleccion(false) }), 'manual');
}

console.log('--- CASO 6: sin opciones -> manual ---');
{
  assert.equal(await copiarTexto(LINK), 'manual');
  assert.equal(await copiarTexto(LINK, {}), 'manual');
}

console.log('OK test_copiar.mjs');
