/**
 * frontend/tests/test_graficos_centralizados.mjs
 * Bloque 4, T3A (ANALISIS-base, R2 y R13): prueba guardián.
 * 1) R13: 'chart.js' y 'react-chartjs-2' (también sus subrutas, como 'chart.js/auto') solo se importan en
 *    src/components/analisis/. Recorre todo src/ y falla con archivo:línea fuera de la lista blanca:
 *    - siempre: ventas/proyecciones, compras/proyecciones y src/app_mocks_backup;
 *    - hasta T22: finanzas/resumen.
 *    (T5C borró los dos Análisis muertos, ventas/components/AnalisisVentas.tsx y compras/components/AnalisisCompras.tsx,
 *    y sus dos entradas.)
 * 2) R2: ningún archivo de src/app contiene '/ventas/ai-chat' (el endpoint no existe; los asistentes quedan «En
 *    construcción»), salvo la lista blanca temporal: ventas/page.tsx hasta T7 y compras/pedidos/page.tsx hasta T15
 *    (src/app_mocks_backup no está dentro de src/app y tampoco se revisa).
 * 3) T5B: dentro de components/analisis, solo registro.ts (chart.js y el único ChartJS.register) y GraficoLinea,
 *    GraficoDona y GraficoBarras (react-chartjs-2 y los tipos de chart.js, con registrarGraficos() al cargarse) importan
 *    los gráficos; las piezas de T5C (PanelAnalisis y las demás) usan esos componentes.
 * 4) T5C (R13 y D43 M6): chart.js solo entra en el chunk de la pestaña. Siguiendo los imports ESTÁTICOS (sin import type
 *    ni import('…'); T5C r1: leídos con el compilador de TypeScript, ts.preProcessFile y el árbol, también require()), nada de lo que alcanzan components/analisis/index.ts ni PanelAnalisisPerezoso.tsx importa chart.js
 *    o react-chartjs-2 (PanelAnalisisPerezoso carga PanelAnalisis con import('./PanelAnalisis'), un chunk aparte); y
 *    fuera de components/analisis nadie importa estático PanelAnalisis, los gráficos ni registro.ts (las pantallas
 *    importan PanelAnalisisPerezoso o el índice).
 * Cada tarea que deja de necesitar una entrada temporal la BORRA de su lista en el mismo commit (una por línea). Una
 * entrada que ya no se usa no hace fallar la prueba: se lista al final para que se borre.
 * Detecta import … from '…', import '…', import('…') y require('…'); un comentario que escriba esa forma también cuenta
 * (recorrido simple a propósito). Autoprueba del patrón al inicio.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
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

console.log('--- T5B: dentro de components/analisis, solo registro.ts y los tres gráficos importan chart.js ---');
{
  // PanelAnalisis, useAnalisis, FilaKpis y lo demás de T5C usan estas piezas, no Chart.js directo; y ChartJS.register
  // vive solo en registro.ts (una sola vez por página).
  const carpeta = join(RAIZ, CARPETA_GRAFICOS);
  const IMPORTAN = ['registro.ts', 'GraficoLinea.tsx', 'GraficoDona.tsx', 'GraficoBarras.tsx'];
  assert.ok(existsSync(carpeta), `falta ${CARPETA_GRAFICOS}`);
  const todos = archivos(carpeta).map((ruta) => ({ ruta, nombre: rel(ruta).slice(CARPETA_GRAFICOS.length), texto: readFileSync(ruta, 'utf8') }));
  for (const nombre of IMPORTAN) assert.ok(todos.some((a) => a.nombre === nombre), `falta ${CARPETA_GRAFICOS}${nombre}`);
  const otros = todos.filter((a) => !IMPORTAN.includes(a.nombre) && importsDeGraficos(a.texto).length).map((a) => a.nombre);
  assert.deepEqual(otros, [], `importan chart.js o react-chartjs-2 sin ser un gráfico: ${otros.join(', ')}`);
  const registran = todos.filter((a) => /\.register\(/.test(a.texto)).map((a) => a.nombre);
  assert.deepEqual(registran, ['registro.ts'], 'ChartJS.register solo en registro.ts');
  const registro = todos.find((a) => a.nombre === 'registro.ts');
  assert.deepEqual(importsDeGraficos(registro.texto).map((h) => h.modulo), ['chart.js'], 'registro.ts no pinta: solo chart.js');
  for (const nombre of IMPORTAN.slice(1)) {
    const { texto } = todos.find((a) => a.nombre === nombre);
    assert.deepEqual([...new Set(importsDeGraficos(texto).map((h) => h.modulo))].sort(), ['chart.js', 'react-chartjs-2'], `${nombre}: el componente y sus tipos`);
    assert.match(texto, /^import type \{[^}]*\} from 'chart\.js';$/m, `${nombre}: de chart.js solo tipos (lo registra registro.ts)`);
    assert.match(texto, /^registrarGraficos\(\);$/m, `${nombre}: llama a registrarGraficos() al cargarse`);
  }
  console.log(`  ${todos.length} archivos en ${CARPETA_GRAFICOS}; importan gráficos: ${IMPORTAN.join(', ')}`);
}

console.log('--- T5C: chart.js solo entra en el chunk de la pestaña (PanelAnalisisPerezoso) ---');
{
  const src = join(RAIZ, 'src');
  const carpeta = join(RAIZ, CARPETA_GRAFICOS);
  const EXTENSIONES = ['', '.ts', '.tsx', '.js', '.mjs', '/index.ts', '/index.tsx', '/index.js'];
  /** El archivo de src al que apunta `spec` desde `desde` ('@/…', './…' o '../…'), o null (un paquete o nada). */
  const resolver = (desde, spec) => {
    let base;
    if (spec.startsWith('@/')) base = join(src, spec.slice(2));
    else if (spec.startsWith('./') || spec.startsWith('../')) base = join(dirname(desde), spec);
    else return null;
    for (const e of EXTENSIONES) {
      const r = base + e;
      if (existsSync(r) && statSync(r).isFile()) return r;
    }
    return null;
  };
  // T5C r1 (M18): los imports se leen con el compilador de TypeScript, no con un patrón por línea (que no veía dos
  // imports en una línea ni require()). ts.preProcessFile da los módulos que nombra el archivo, sin los de comentarios y
  // cadenas; en el typescript instalado (5.9) no trae isTypeOnly, así que cada uno se clasifica con el árbol
  // (createSourceFile) y las dos listas tienen que coincidir:
  //  - import type / export type, o un import o export con todos sus nombres 'type': solo tipos (se borran al compilar);
  //  - import('…'): otro chunk (no cuenta);
  //  - lo demás (import … from, import '…', export … from, require('…')): estático, va en el mismo chunk.
  const ts = createRequire(import.meta.url)('typescript');
  const todosTipo = (elementos) => elementos.length > 0 && elementos.every((e) => e.isTypeOnly);
  // Revisión de T5C r1 (M5): cada archivo se lee con el ScriptKind de su extensión (un .ts con <T>(x) => … no es JSX).
  const kindDe = (nombre) => (/\.tsx$/.test(nombre) ? ts.ScriptKind.TSX : /\.ts$/.test(nombre) ? ts.ScriptKind.TS
    : /\.jsx$/.test(nombre) ? ts.ScriptKind.JSX : /\.[cm]?js$/.test(nombre) ? ts.ScriptKind.JS : ts.ScriptKind.TSX);
  const estaticos = (texto, nombre = 'muestra.tsx') => {
    const arbol = ts.createSourceFile(nombre, texto, ts.ScriptTarget.Latest, true, kindDe(nombre));
    const valor = [];
    const otros = [];
    const visitar = (n) => {
      if (ts.isImportDeclaration(n) && ts.isStringLiteral(n.moduleSpecifier)) {
        const c = n.importClause;
        const tipo = Boolean(c && (c.isTypeOnly || (!c.name && c.namedBindings && ts.isNamedImports(c.namedBindings)
          && todosTipo(c.namedBindings.elements))));
        (tipo ? otros : valor).push(n.moduleSpecifier.text);
      } else if (ts.isExportDeclaration(n) && n.moduleSpecifier && ts.isStringLiteral(n.moduleSpecifier)) {
        const tipo = n.isTypeOnly || Boolean(n.exportClause && ts.isNamedExports(n.exportClause) && todosTipo(n.exportClause.elements));
        (tipo ? otros : valor).push(n.moduleSpecifier.text);
      } else if (ts.isImportEqualsDeclaration(n) && ts.isExternalModuleReference(n.moduleReference)
        && ts.isStringLiteral(n.moduleReference.expression)) {
        (n.isTypeOnly ? otros : valor).push(n.moduleReference.expression.text);
      } else if (ts.isCallExpression(n) && n.arguments.length === 1 && ts.isStringLiteralLike(n.arguments[0])) {
        if (n.expression.kind === ts.SyntaxKind.ImportKeyword) otros.push(n.arguments[0].text);
        else if (ts.isIdentifier(n.expression) && n.expression.text === 'require') valor.push(n.arguments[0].text);
      }
      ts.forEachChild(n, visitar);
    };
    visitar(arbol);
    // El árbol manda. preProcessFile solo controla que el árbol no se salte nada de lo que él nombra (tiene huecos
    // conocidos: export * as, una regex con comilla; por eso no se exige que nombre todo lo que ve el árbol).
    const vistosArbol = new Set([...valor, ...otros]);
    const sinVer = ts.preProcessFile(texto, true, true).importedFiles.map((f) => f.fileName).filter((f) => !vistosArbol.has(f));
    assert.deepEqual(sinVer, [], `${nombre}: el árbol ve todo lo que nombra preProcessFile`);
    return valor;
  };
  // Autoprueba: dos imports en una línea (el punto ciego del patrón de antes), require, tipos, import() y comentarios.
  assert.deepEqual(estaticos([
    "import { A } from './A'; import { G } from './GraficoLinea';", "import type { B } from './B';", "export { C } from './C';",
    "export type { D } from './D';", "import {\n  E,\n  F,\n} from '@/lib/e';", "import './g.css';", "export * from './H';",
    "const P = dynamic(() => import('./P'));", "export function f() { return 'x'; }", "import x, { type Y } from 'chart.js';",
    "import { type T } from './T';", "export { type U } from './U';", "const r = require('./R');",
    "// import z from './comentado';", "const s = \"import w from './cadena'\";",
  ].join('\n')), ['./A', './GraficoLinea', './C', '@/lib/e', './g.css', './H', 'chart.js', './R']);
  // Revisión de T5C r1 (M5): los bordes donde preProcessFile no nombra todo (export * as, una regex con comilla antes de
  // un import(), import x = require) y un .ts con una flecha genérica, que leído como TSX perdía los nodos siguientes.
  assert.deepEqual(estaticos("export * as ns from './NS';\nimport q = require('./Q');", 'a.ts'), ['./NS', './Q']);
  assert.deepEqual(estaticos("const f = <T>(x: T) => x;\nconst re = /'/;\nconst P = import('./P2');\nimport { Z } from './Z';", 'b.ts'), ['./Z']);
  const GRAFICOS = /^(react-chartjs-2|chart\.js)(\/|$)/;
  /** Los archivos de src que alcanza `entrada` por imports estáticos, y los imports de los gráficos que encuentra. */
  const alcanzables = (entrada) => {
    const vistos = new Set();
    const pila = [entrada];
    const graficos = [];
    while (pila.length) {
      const ruta = pila.pop();
      if (vistos.has(ruta)) continue;
      vistos.add(ruta);
      for (const spec of estaticos(readFileSync(ruta, 'utf8'), rel(ruta))) {
        if (GRAFICOS.test(spec)) {
          graficos.push(`${rel(ruta)} → ${spec}`);
          continue;
        }
        const destino = resolver(ruta, spec);
        if (destino && /\.(tsx?|jsx?|mjs)$/.test(destino)) pila.push(destino);
      }
    }
    return { archivos: [...vistos].map(rel), graficos };
  };
  const PROHIBIDOS = ['PanelAnalisis.tsx', 'registro.ts', 'GraficoLinea.tsx', 'GraficoDona.tsx', 'GraficoBarras.tsx']
    .map((n) => `${CARPETA_GRAFICOS}${n}`);
  // El recorrido de verdad encuentra chart.js desde PanelAnalisis (si no, la prueba no vería nada).
  const desdePanel = alcanzables(join(carpeta, 'PanelAnalisis.tsx'));
  assert.ok(desdePanel.graficos.length >= 4 && desdePanel.archivos.includes(`${CARPETA_GRAFICOS}registro.ts`),
    'el recorrido llega a chart.js desde PanelAnalisis');
  for (const entrada of ['index.ts', 'PanelAnalisisPerezoso.tsx']) {
    const { archivos: alcanzados, graficos } = alcanzables(join(carpeta, entrada));
    assert.deepEqual(graficos, [], `${entrada} alcanza chart.js por imports estáticos (iría en el chunk de la pantalla):\n  ${graficos.join('\n  ')}`);
    const malos = alcanzados.filter((a) => PROHIBIDOS.includes(a));
    assert.deepEqual(malos, [], `${entrada} alcanza ${malos.join(', ')} por imports estáticos`);
    console.log(`  ${entrada}: ${alcanzados.length} archivos alcanzables, ninguno con chart.js`);
  }
  const perezoso = readFileSync(join(carpeta, 'PanelAnalisisPerezoso.tsx'), 'utf8');
  assert.match(perezoso, /import\('\.\/PanelAnalisis'\)/, 'PanelAnalisisPerezoso carga PanelAnalisis con import()');
  // Fuera de components/analisis nadie importa estático el panel, los gráficos ni registro.ts.
  const fuera = [];
  for (const ruta of archivos(src)) {
    const r = rel(ruta);
    if (r.startsWith(CARPETA_GRAFICOS) || r.startsWith('src/app_mocks_backup/')) continue;
    for (const spec of estaticos(readFileSync(ruta, 'utf8'), rel(ruta))) {
      const destino = resolver(ruta, spec);
      if (destino && PROHIBIDOS.includes(rel(destino))) fuera.push(`${r} → ${spec}`);
    }
  }
  assert.deepEqual(fuera, [], `importan el panel o los gráficos directo (usa PanelAnalisisPerezoso):\n  ${fuera.join('\n  ')}`);
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
