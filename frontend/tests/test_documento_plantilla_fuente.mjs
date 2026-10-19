/**
 * frontend/tests/test_documento_plantilla_fuente.mjs
 * B3 T12 (PLANTILLA puntos 6 y 8, C3, C7, R15): lee las fuentes con fs.
 * - DocumentoComercial.tsx imprime bien: 'print:hidden' (botones), '@page' sin tamaño fijo y 'print-color-adjust'.
 * - Todo components/documento: sin clases dark: (H1), sin 'truncate' (los nombres largos hacen break-words), sin
 *   next/image (un <img> simple), sin dangerouslySetInnerHTML (r1) y todo target="_blank" lleva rel
 *   'noopener noreferrer'.
 * - app/layout.tsx tiene lang="es" (C7). T15 agrega aquí las aserciones de app/confirmar/layout.tsx y app/pedido/layout.tsx.
 */

import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const DOCUMENTO = join(SRC, 'components', 'documento');
const leer = (...partes) => readFileSync(join(...partes), 'utf8');

/** Las etiquetas <a …> con target="_blank" que no llevan rel con noopener y noreferrer. */
export function enlacesSinRel(fuente) {
  const etiquetas = fuente.match(/<a\b[^<>]*?>/g) || [];
  const conBlank = etiquetas.filter((t) => /target=["'{]\s*["']?_blank/.test(t));
  const total = (fuente.match(/_blank/g) || []).length;
  assert.equal(conBlank.length, total, 'cada _blank debe estar en una etiqueta <a …> simple (sin > dentro)');
  return conBlank.filter((t) => !/rel=["']noopener noreferrer["']/.test(t));
}

console.log('--- TEST 1: autoprueba de enlacesSinRel ---');
{
  assert.equal(enlacesSinRel('<a href="x" target="_blank" rel="noopener noreferrer">x</a>').length, 0);
  assert.equal(enlacesSinRel('<a\n  href={u}\n  target="_blank"\n  rel="noopener noreferrer"\n>x</a>').length, 0);
  assert.equal(enlacesSinRel('<a href="x" target="_blank">x</a>').length, 1);
  assert.equal(enlacesSinRel('<a href="x" target="_blank" rel="noopener">x</a>').length, 1);
  assert.equal(enlacesSinRel('<a href="x">x</a>').length, 0);
}

console.log('--- TEST 2: DocumentoComercial.tsx imprime bien ---');
{
  const doc = leer(DOCUMENTO, 'DocumentoComercial.tsx');
  assert.ok(doc.includes('print:hidden'), "los botones llevan 'print:hidden'");
  assert.ok(doc.includes('@page'), '@page');
  assert.doesNotMatch(doc, /@page\s*\{[^}]*\bsize\s*:/, '@page sin tamaño fijo (Carta o A4)');
  assert.ok(doc.includes('print-color-adjust'), 'print-color-adjust: exact');
  assert.ok(doc.includes('window.print()'), "'Descargar o imprimir'");
  assert.ok(doc.includes("'use client'"));
}

console.log('--- TEST 3: components/documento sin dark:, truncate ni next/image; _blank con noopener noreferrer ---');
{
  const archivos = readdirSync(DOCUMENTO).filter((n) => /\.tsx?$/.test(n)).sort();
  for (const nombre of ['ContactoEmpresa.tsx', 'DocumentoComercial.tsx', 'EncabezadoMarca.tsx', 'index.ts']) {
    assert.ok(archivos.includes(nombre), `falta components/documento/${nombre}`);
  }
  for (const nombre of archivos) {
    const fuente = leer(DOCUMENTO, nombre);
    assert.doesNotMatch(fuente, /\bdark:/, `${nombre}: sin dark:`);
    assert.doesNotMatch(fuente, /\btruncate\b/, `${nombre}: sin truncate`);
    assert.doesNotMatch(fuente, /from\s+['"]next\/image['"]/, `${nombre}: <img> simple, no next/image`);
    assert.deepEqual(enlacesSinRel(fuente), [], `${nombre}: todo target="_blank" con rel="noopener noreferrer"`);
    assert.doesNotMatch(fuente, /nebulaekids|Nebulae/, `${nombre}: ni la URL de producción ni la marca Nebulae`);
    assert.doesNotMatch(fuente, /design-system/, `${nombre}: colores de la marca, no los tokens internos`);
    // r1 (menor 16): lo que escriben la empresa y el cliente se pinta siempre como texto (React lo escapa).
    assert.doesNotMatch(fuente, /dangerouslySetInnerHTML/, `${nombre}: sin dangerouslySetInnerHTML`);
  }
  assert.ok(leer(DOCUMENTO, 'DocumentoComercial.tsx').includes('target="_blank"'), 'el pie tiene enlaces externos');
}

console.log('--- TEST 4: app/layout.tsx con lang="es" (C7) ---');
{
  const layout = leer(SRC, 'app', 'layout.tsx');
  assert.match(layout, /<html\s[^>]*lang="es"/);
  assert.doesNotMatch(layout, /lang="en"/);
}

console.log('✓ Todas las pruebas de las fuentes de la plantilla pasaron.');
