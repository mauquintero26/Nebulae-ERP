/**
 * frontend/tests/test_sin_dialogos_nativos.mjs
 * H49 (Bloque 2, T1B; choque C4): prueba guardián. En las RAICES (abajo) no puede quedar ningún alert(), confirm() ni
 * prompt() nativo del navegador: los avisos y las confirmaciones van por useAvisos() (avisar, avisarError, confirmar)
 * de @/components/ui, y las páginas del cliente muestran sus mensajes en la misma página.
 * - B3 T12 (RP14): una lista de raíces, cada una un directorio o un archivo. Una raíz que todavía no existe (la crea
 *   una tarea posterior) no hace fallar la prueba. T14 agrega 'src/app/dashboard/inventario/productos' en una línea,
 *   en el mismo commit en que quita sus dos alert() (decisión del controlador, punto 2).
 * - Recorre cada raíz (**\/*.{ts,tsx,js}) sin comentarios y falla con archivo:línea.
 * - Los comentarios /* … *\/ (también los {/* … *\/} de JSX) se cambian por la misma cantidad de saltos de línea, para
 *   que la línea reportada sea la real. Un // se quita solo si no va precedido de ':' y no está dentro de comillas o
 *   backticks (recorrido simple que lleva el estado de la cadena).
 * - Detecta la llamada suelta y con window. / window?. / globalThis. / self. delante, y también window['alert'](.
 * - Autoprueba del patrón: detecta window.confirm( y " alert(" (también después de un `https://…`), window.prompt(,
 *   window?.confirm( y globalThis.alert(, y no detecta confirmar(, setAlertDias(, chatPrompt( ni handleConfirmarVenta(.
 * - Limitaciones conocidas (aceptadas: el recorrido es simple a propósito):
 *   · un // dentro del texto de JSX (p. ej. <p>a // b</p>) se toma como comentario hasta el fin de la línea, así que
 *     una llamada escrita después de él en esa misma línea no se vería;
 *   · un apóstrofo o una comilla suelta en texto de JSX abre una "cadena" hasta el fin de la línea: lo que sigue se
 *     sigue revisando (no esconde llamadas), solo que un // en ese resto de línea ya no se quita;
 *   · no sigue alias (const f = window.alert; f()).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..');
// Una raíz por línea (relativa a frontend/): un directorio o un archivo.
const RAICES = [
  'src/app/dashboard/ventas',
  'src/app/dashboard/admin/configuracion',
  'src/app/dashboard/inventario/productos',
  'src/app/dashboard/cotiza',
  'src/components/documento',
  'src/components/AlertasBadge.tsx',
  'src/components/PastillaCambiosCliente.tsx', // B3 T18: la segunda pastilla de AlertasBadge
  'src/app/confirmar',
  'src/app/pedido',
];

// alert( / confirm( / prompt(, sueltos o con window. / window?. / globalThis. / self. delante, que no sean parte de
// otro nombre (confirmar(, setAlertDias(, chatPrompt() ni un método de otro objeto (x.confirm(); y la forma con
// corchetes window['alert']( (también window?.['alert'](). El grupo 2 es la llamada (para el mensaje).
const PATRON =
  /(^|[^\w.$])((?:(?:window|globalThis|self)\??\.)?(?:alert|confirm|prompt)\s*\(|(?:window|globalThis|self)(?:\?\.)?\[\s*(['"`])(?:alert|confirm|prompt)\3\s*\]\s*\()/g;

// Después de estos caracteres, un '/' abre una expresión regular (/…/) y no es una división. Sin '<' ni '>': en JSX
// son el '</' de una etiqueta de cierre o el texto que sigue a una etiqueta.
const ANTES_DE_REGEX = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', ';', '+', '-', '*', '%', '~', '^']);

/**
 * El texto sin comentarios, con la misma cantidad de líneas.
 * Estados: código, cadena '…' o "…" (termina en su comilla o en el salto de línea), plantilla `…` (con ${…} anidados,
 * que vuelven a ser código) y expresión regular /…/ (para que una comilla dentro de ella no abra una cadena).
 */
export function sinComentarios(texto) {
  let salida = '';
  // Pila de contextos: 'codigo' (con su profundidad de llaves si está dentro de un ${…}) o 'plantilla'.
  const pila = [{ tipo: 'codigo', llaves: 0 }];
  let previo = ''; // último carácter significativo del código (para distinguir regex de división)
  let i = 0;
  while (i < texto.length) {
    const c = texto[i];
    const sig = texto[i + 1];
    const tope = pila[pila.length - 1];

    if (tope.tipo === 'plantilla') {
      if (c === '\\') {
        salida += c + (sig ?? '');
        i += 2;
      } else if (c === '`') {
        salida += c;
        pila.pop();
        previo = '`';
        i += 1;
      } else if (c === '$' && sig === '{') {
        salida += '${';
        pila.push({ tipo: 'codigo', llaves: 0 });
        previo = '{';
        i += 2;
      } else {
        salida += c;
        i += 1;
      }
      continue;
    }

    // Código.
    if (c === '/' && sig === '*') {
      const fin = texto.indexOf('*/', i + 2);
      const comentario = fin === -1 ? texto.slice(i) : texto.slice(i, fin + 2);
      salida += '\n'.repeat((comentario.match(/\n/g) || []).length);
      i += comentario.length;
      continue;
    }
    if (c === '/' && sig === '/' && texto[i - 1] !== ':') {
      while (i < texto.length && texto[i] !== '\n') i += 1;
      continue;
    }
    if (c === '/' && ANTES_DE_REGEX.has(previo)) {
      // Expresión regular: hasta la '/' de cierre (fuera de [...]) o el fin de la línea.
      let j = i + 1;
      let enClase = false;
      while (j < texto.length && texto[j] !== '\n') {
        const r = texto[j];
        if (r === '\\') {
          j += 2;
          continue;
        }
        if (r === '[') enClase = true;
        else if (r === ']') enClase = false;
        else if (r === '/' && !enClase) break;
        j += 1;
      }
      salida += texto.slice(i, j + 1);
      previo = '/';
      i = j + 1;
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < texto.length && texto[j] !== c && texto[j] !== '\n') {
        j += texto[j] === '\\' ? 2 : 1;
      }
      const cierre = texto[j] === c ? j + 1 : j;
      salida += texto.slice(i, cierre);
      previo = c;
      i = cierre;
      continue;
    }
    if (c === '`') {
      salida += c;
      pila.push({ tipo: 'plantilla' });
      i += 1;
      continue;
    }
    if (c === '{') tope.llaves += 1;
    if (c === '}') {
      if (tope.llaves === 0 && pila.length > 1) {
        // Cierra el ${…}: se vuelve a la plantilla.
        salida += c;
        pila.pop();
        i += 1;
        continue;
      }
      tope.llaves -= 1;
    }
    salida += c;
    if (!/\s/.test(c)) previo = /[\w$]/.test(c) ? 'x' : c;
    i += 1;
  }
  return salida;
}

/** Llamadas nativas encontradas en un texto: [{ linea, codigo }]. */
export function llamadasNativas(texto) {
  const limpio = sinComentarios(texto);
  const encontradas = [];
  for (const m of limpio.matchAll(PATRON)) {
    const posicion = m.index + m[1].length;
    const linea = limpio.slice(0, posicion).split('\n').length;
    encontradas.push({ linea, codigo: m[2].replace(/\s+/g, '') });
  }
  return encontradas;
}

console.log('--- TEST 1: autoprueba del patrón ---');
{
  const detecta = (texto) => llamadasNativas(texto).length > 0;
  for (const texto of [
    'window.confirm("¿Seguro?")',
    ' alert("x")',
    'const u = `https://x.y/${a}`; alert(1)',
    'if (!confirm(`¿Eliminar ${n}?`)) return;',
    'const r = prompt ("Motivo")',
    "const s = 'a//b'; alert(1)",
    'const t = `x ${a ? `//y` : "b"} z`; window.alert(1)',
    'onClick={() => alert(1)}',
    'window.prompt("x")',
    'window?.confirm("x")',
    'globalThis.alert(1)',
    'self.confirm("x")',
    "window['alert'](1)",
    'window?.["confirm"]("x")',
  ]) {
    assert.ok(detecta(texto), `debía detectar: ${texto}`);
  }
  assert.deepEqual(llamadasNativas('x;\nwindow?.confirm ("x")'), [{ linea: 2, codigo: 'window?.confirm(' }]);
  for (const texto of [
    'if (!(await confirmar({ titulo: "x" }))) return;',
    'setAlertDias(3)',
    'chatPrompt(texto)',
    'handleConfirmarVenta()',
    'avisar("Pedido creado")',
    'objeto.confirm(1)',
    'const s = "x"; // alert(1)',
    '/* confirm( */ const a = 1;',
    '{/* window.alert(\n  "x") */}',
    "const re = /['\"]/g; // alert(1)",
    'const confirmarVenta = () => {};',
    'x?.confirm(1)',
    'miwindow.confirm(1)',
    'window2.alert(1)',
    "ventana['alert'](1)",
    'window.confirmar(1)',
  ]) {
    assert.ok(!detecta(texto), `no debía detectar: ${texto}`);
  }
  // Los comentarios de varias líneas conservan la numeración: la llamada sigue en su línea real.
  assert.deepEqual(llamadasNativas('a\n/* x\n y */\n{/* z\n w */}\nalert(1)'), [{ linea: 6, codigo: 'alert(' }]);
  assert.equal(sinComentarios('a\n/* x\n y */b').split('\n').length, 3);
  // Un // detrás de ':' (URL) no es comentario.
  assert.ok(detecta('fetch("x"); const u = http://x; confirm(1)'));
}

console.log('--- TEST 2: ningún archivo de las raíces usa alert/confirm/prompt nativos ---');
{
  const hallazgos = [];
  const revisados = [];
  const revisar = (ruta) => {
    if (statSync(ruta).isDirectory()) {
      for (const nombre of readdirSync(ruta).sort()) revisar(join(ruta, nombre));
    } else if (/\.(tsx?|js)$/.test(ruta)) {
      revisados.push(ruta);
      for (const { linea, codigo } of llamadasNativas(readFileSync(ruta, 'utf8'))) {
        hallazgos.push(`${relative(RAIZ, ruta).replace(/\\/g, '/')}:${linea}  ${codigo}`);
      }
    }
  };
  const existentes = RAICES.filter((r) => existsSync(join(RAIZ, r)));
  // La guardia no puede quedar vacía en silencio: Ventas siempre existe.
  assert.ok(existentes.includes('src/app/dashboard/ventas'), 'falta src/app/dashboard/ventas');
  for (const r of existentes) revisar(join(RAIZ, r));
  assert.ok(revisados.length > 0, 'no se revisó ningún archivo');
  assert.deepEqual(
    hallazgos,
    [],
    `${hallazgos.length} diálogo(s) nativo(s); usa useAvisos() (avisar, avisarError, confirmar):\n  ${hallazgos.join('\n  ')}`,
  );
  const faltan = RAICES.filter((r) => !existentes.includes(r));
  console.log(`  ${revisados.length} archivos en ${existentes.length} de ${RAICES.length} raíces`
    + (faltan.length ? ` (aún no existen: ${faltan.join(', ')})` : ''));
}

console.log('✓ Las raíces revisadas no usan alert/confirm/prompt nativos.');
