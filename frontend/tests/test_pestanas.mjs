/**
 * frontend/tests/test_pestanas.mjs
 * Revisión final B3 (F2, M15): lib/pestanas.js, el patrón WAI-ARIA de pestañas de Configuración General: solo la
 * pestaña activa está en el orden del Tab (tabIndex 0; las demás -1) y las flechas, Inicio y Fin cambian de pestaña.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pestanaConTecla } from '../src/lib/pestanas.js';

const IDS = ['empresa', 'diseno', 'localizacion', 'api'];

console.log('--- TEST 1: las flechas (las cuatro: la lista va en fila en el celular y en columna desde md) ---');
{
  for (const tecla of ['ArrowRight', 'ArrowDown']) {
    assert.equal(pestanaConTecla(IDS, 'empresa', tecla), 'diseno', tecla);
    assert.equal(pestanaConTecla(IDS, 'api', tecla), 'empresa', `${tecla}: da la vuelta`);
  }
  for (const tecla of ['ArrowLeft', 'ArrowUp']) {
    assert.equal(pestanaConTecla(IDS, 'diseno', tecla), 'empresa', tecla);
    assert.equal(pestanaConTecla(IDS, 'empresa', tecla), 'api', `${tecla}: da la vuelta`);
  }
}

console.log('--- TEST 2: Inicio y Fin; las demás teclas no cambian nada ---');
{
  assert.equal(pestanaConTecla(IDS, 'localizacion', 'Home'), 'empresa');
  assert.equal(pestanaConTecla(IDS, 'diseno', 'End'), 'api');
  for (const tecla of ['Enter', ' ', 'Tab', 'a', '', undefined]) {
    assert.equal(pestanaConTecla(IDS, 'diseno', tecla), null, String(tecla));
  }
}

console.log('--- TEST 3: datos raros no rompen ---');
{
  assert.equal(pestanaConTecla(IDS, 'otra', 'ArrowRight'), 'empresa', 'sin activa: la primera');
  assert.equal(pestanaConTecla(IDS, 'otra', 'ArrowLeft'), 'api', 'sin activa: la última');
  assert.equal(pestanaConTecla(['solo'], 'solo', 'ArrowRight'), 'solo');
  for (const raro of [[], null, undefined, 'empresa']) assert.equal(pestanaConTecla(raro, 'empresa', 'ArrowRight'), null);
}

console.log('--- TEST 4: Configuración General usa la lib (tabIndex que se mueve y teclado) ---');
{
  const pagina = readFileSync(new URL('../src/app/dashboard/admin/configuracion/page.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.ok(pagina.includes("import { pestanaConTecla } from '@/lib/pestanas';"), 'la regla viene de la lib');
  assert.ok(pagina.includes('tabIndex={activeTab === tab.id ? 0 : -1}'), 'solo la activa en el orden del Tab');
  assert.ok(pagina.includes('onKeyDown={alTeclear}'), 'las teclas en cada pestaña');
  assert.ok(pagina.includes("const siguiente = pestanaConTecla(TABS.map(t => t.id), activeTab, e.key);"));
  assert.ok(pagina.includes('document.getElementById(`tab-${siguiente}`)?.focus();'), 'el foco va a la pestaña nueva');
  assert.ok(pagina.includes('e.preventDefault();'), 'la flecha no desplaza la página');
  // El resto del patrón de r1 sigue: role tab, aria-selected y aria-controls.
  assert.ok(pagina.includes('role="tab"') && pagina.includes('aria-selected={activeTab === tab.id}'));
}

console.log('OK test_pestanas.mjs');
