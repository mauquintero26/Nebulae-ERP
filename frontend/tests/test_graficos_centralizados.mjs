/**
 * frontend/tests/test_graficos_centralizados.mjs
 * Bloque 4, T3A (ANALISIS-base, R2 y R13): prueba guardián.
 * 1) R13: 'chart.js' y 'react-chartjs-2' (también sus subrutas, como 'chart.js/auto') solo se importan en
 *    src/components/analisis/. Recorre todo src/ y falla con archivo:línea fuera de la lista blanca:
 *    - siempre: ventas/proyecciones, compras/proyecciones y src/app_mocks_backup;
 *    - hasta T5C, que los borra: ventas/components/AnalisisVentas.tsx y compras/components/AnalisisCompras.tsx;
 *    - hasta T22: finanzas/resumen.
 * 2) R2: ningún archivo de src/app contiene '/ventas/ai-chat' (el endpoint no existe; los asistentes quedan «En
 *    construcción»), salvo la lista blanca temporal: ventas/page.tsx hasta T7 y compras/pedidos/page.tsx hasta T15
 *    (src/app_mocks_backup no está dentro de src/app y tampoco se revisa).
 * Cada tarea que deja de necesitar una entrada temporal la BORRA de su lista en el mismo commit (una por línea). Una
 * entrada que ya no se usa no hace fallar la prueba: se lista al final para que se borre.
 * Detecta import … from '…', import '…', import('…') y require('…'); un comentario que escriba esa forma también cuenta
 * (recorrido simple a propósito). Autoprueba del patrón al inicio.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');

// R13: dónde viven los gráficos.
const CARPETA_GRAFICOS = 'src/components/analisis/';
// Lista blanca de R13, una entrada por línea (un directorio termina en '/').
const PERMITIDOS_GRAFICOS = [
  'src/app/dashboard/ventas/proyecciones/', // siempre
  'src/app/dashboard/compras/proyecciones/', // siempre
  'src/app_mocks_backup/', // siempre
  'src/app/dashboard/ventas/components/AnalisisVentas.tsx', // hasta T5C (lo borra)
  'src/app/dashboard/compras/components/AnalisisCompras.tsx', // hasta T5C (lo borra)
  'src/app/dashboard/finanzas/resumen/', // hasta T22
];
// R2: lista blanca temporal de '/ventas/ai-chat' dentro de src/app.
const PERMITIDOS_AI_CHAT = [
  'src/app/dashboard/ventas/page.tsx', // hasta T7
  'src/app/dashboard/compras/pedidos/page.tsx', // hasta T15
];

// import … from 'chart.js' | import 'chart.js' | import('chart.js') | require('chart.js'), con comillas simples, dobles
// o invertidas, y la subruta opcional ('chart.js/auto'). No detecta 'chart.jsx' ni 'mi-chart.js'.
const PATRON_GRAFICOS = /(?:\bfrom\s*|\bimport\s*\(\s*|\brequire\s*\(\s*|\bimport\s+)(['"`])(react-chartjs-2|chart\.js)(?:\/[^'"`]*)?\1/g;
const AI_CHAT = '/ventas/ai-chat';

/** [{linea, modulo}] de cada import de los gráficos en `texto`. */
export function importsDeGraficos(texto) {
  const hallazgos = [];
  for (const m of texto.matchAll(PATRON_GRAFICOS)) {
    hallazgos.push({ linea: texto.slice(0, m.index).split('\n').length, modulo: m[2] });
  }
  return hallazgos;
}

/** Las líneas (desde 1) de `texto` que contienen '/ventas/ai-chat'. */
export function lineasAiChat(texto) {
  return texto.split('\n').flatMap((l, i) => (l.includes(AI_CHAT) ? [i + 1] : []));
}

const permitido = (ruta, lista) => lista.some((p) => (p.endsWith('/') ? ruta.startsWith(p) : ruta === p));

function archivos(dir) {
  const salida = [];
  const recorrer = (ruta) => {
    if (statSync(ruta).isDirectory()) {
      for (const nombre of readdirSync(ruta).sort()) {
        if (nombre === 'node_modules' || nombre.startsWith('.')) continue;
        recorrer(join(ruta, nombre));
      }
    } else if (/\.(tsx?|jsx?|mjs|cjs)$/.test(ruta)) {
      salida.push(ruta);
    }
  };
  recorrer(dir);
  return salida;
}

const rel = (ruta) => relative(RAIZ, ruta).replace(/\\/g, '/');

console.log('--- Autoprueba de los patrones ---');
{
  const muestras = [
    "import { Line } from 'react-chartjs-2';",
    'import {\n  Chart as ChartJS,\n  CategoryScale,\n} from "chart.js";',
    "import 'chart.js/auto';",
    "const m = await import('react-chartjs-2');",
    'const c = require(`chart.js`);',
    "import Chart from 'chart.js/auto'",
  ];
  for (const m of muestras) assert.equal(importsDeGraficos(m).length, 1, m);
  assert.deepEqual(importsDeGraficos(muestras[1]), [{ linea: 4, modulo: 'chart.js' }], 'la línea del from');
  for (const no of ["import x from 'chart.jsx';", "import y from 'mi-chart.js';", "import z from './chart.js';",
    "const t = 'chart.js';", "import { Bar } from '@/components/analisis';"]) {
    assert.deepEqual(importsDeGraficos(no), [], no);
  }
  assert.deepEqual(lineasAiChat("a\nawait apiFetch('/ventas/ai-chat', {})\nb"), [2]);
  assert.deepEqual(lineasAiChat("apiFetch('/ventas/analisis')"), []);
  // Con una lista propia (no las de arriba, que se van vaciando): un directorio termina en '/'; un archivo, exacto.
  const lista = ['src/app/x/', 'src/app/y/Pagina.tsx'];
  assert.ok(permitido('src/app/x/z/w.tsx', lista));
  assert.ok(permitido('src/app/y/Pagina.tsx', lista));
  assert.ok(!permitido('src/app/xy.tsx', lista), 'un directorio no cubre un nombre que solo empieza igual');
  assert.ok(!permitido('src/app/y/Otra.tsx', lista));
}

console.log('--- R13: chart.js y react-chartjs-2 solo en components/analisis ---');
{
  const src = join(RAIZ, 'src');
  assert.ok(existsSync(src), 'falta frontend/src');
  const todos = archivos(src);
  assert.ok(todos.length > 100, 'la guardia no puede quedar vacía en silencio');
  const fuera = [];
  const usados = new Set();
  for (const ruta of todos) {
    const r = rel(ruta);
    const hallazgos = importsDeGraficos(readFileSync(ruta, 'utf8'));
    if (!hallazgos.length || r.startsWith(CARPETA_GRAFICOS)) continue;
    const entrada = PERMITIDOS_GRAFICOS.find((p) => permitido(r, [p]));
    if (entrada) { usados.add(entrada); continue; }
    for (const h of hallazgos) fuera.push(`${r}:${h.linea}  ${h.modulo}`);
  }
  assert.deepEqual(fuera, [], `importa gráficos fuera de ${CARPETA_GRAFICOS} (usa los componentes de Análisis):\n  ${fuera.join('\n  ')}`);
  const sinUso = PERMITIDOS_GRAFICOS.filter((p) => !usados.has(p));
  console.log(`  ${todos.length} archivos revisados` + (sinUso.length ? `; lista blanca sin uso (bórrala): ${sinUso.join(', ')}` : ''));
}

console.log("--- R2: '/ventas/ai-chat' no aparece en src/app ---");
{
  const app = join(RAIZ, 'src', 'app');
  const todos = archivos(app);
  assert.ok(todos.length > 50, 'la guardia no puede quedar vacía en silencio');
  const fuera = [];
  const usados = new Set();
  for (const ruta of todos) {
    const r = rel(ruta);
    const lineas = lineasAiChat(readFileSync(ruta, 'utf8'));
    if (!lineas.length) continue;
    if (permitido(r, PERMITIDOS_AI_CHAT)) { usados.add(r); continue; }
    for (const l of lineas) fuera.push(`${r}:${l}`);
  }
  assert.deepEqual(fuera, [], `llama a ${AI_CHAT}, que no existe (el asistente queda «En construcción», R2):\n  ${fuera.join('\n  ')}`);
  const sinUso = PERMITIDOS_AI_CHAT.filter((p) => !usados.has(p));
  console.log(`  ${todos.length} archivos revisados` + (sinUso.length ? `; lista blanca sin uso (bórrala): ${sinUso.join(', ')}` : ''));
}

console.log('✓ Los gráficos se importan solo en components/analisis y nadie llama a /ventas/ai-chat (con sus listas blancas).');
