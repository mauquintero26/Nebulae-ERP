/**
 * frontend/tests/test_tema_claro.mjs
 * H1: la app siempre en modo claro, aunque el sistema operativo este en modo oscuro.
 * - globals.css no tiene el bloque de prefers-color-scheme: dark, declara color-scheme: only light y define la
 *   variante dark de Tailwind v4 por clase (@custom-variant dark), para que una clase dark: futura no siga al sistema.
 * - app/layout.tsx publica viewport.colorScheme 'only light' (<meta name="color-scheme">, antes de cargar el CSS).
 * - Ningun .ts/.tsx de src/ (salvo app_mocks_backup, que no se usa) usa clases dark:.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

console.log('--- TEST 1: globals.css siempre en esquema claro ---');
{
  const css = readFileSync(join(SRC, 'app', 'globals.css'), 'utf8');
  assert.doesNotMatch(css, /prefers-color-scheme:\s*dark/, 'sin el bloque oscuro de create-next-app');
  assert.match(css, /color-scheme:\s*only light/, 'los controles nativos se dibujan claros');
  assert.ok(css.includes('@custom-variant dark'), 'la variante dark: solo aplica con la clase .dark');
  assert.match(css, /--background:\s*#ffffff/);
  assert.match(css, /--foreground:\s*#171717/);
}

console.log("--- TEST 2: layout.tsx declara viewport colorScheme 'only light' ---");
{
  const layout = readFileSync(join(SRC, 'app', 'layout.tsx'), 'utf8');
  assert.match(layout, /export const viewport\s*:\s*Viewport\s*=\s*\{[^}]*colorScheme:\s*["']only light["']/);
}

console.log('--- TEST 3: ningun .ts/.tsx de src/ usa clases dark: ---');
{
  const conDark = [];
  const recorrer = (dir) => {
    for (const nombre of readdirSync(dir)) {
      const ruta = join(dir, nombre);
      if (statSync(ruta).isDirectory()) {
        if (nombre !== 'app_mocks_backup') recorrer(ruta);
      } else if (/\.tsx?$/.test(nombre) && /\bdark:/.test(readFileSync(ruta, 'utf8'))) {
        conDark.push(relative(SRC, ruta));
      }
    }
  };
  recorrer(SRC);
  assert.deepEqual(conDark, [], `archivos con dark: ${conDark.join(', ')}`);
}

console.log('✓ Todas las pruebas del tema claro pasaron.');
