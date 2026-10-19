/**
 * frontend/tests/test_documento_plantilla_fuente.mjs
 * B3 T12 (PLANTILLA puntos 6 y 8, C3, C7, R15): lee las fuentes con fs.
 * - DocumentoComercial.tsx imprime bien: 'print:hidden' (botones), '@page' sin tamaño fijo y 'print-color-adjust'.
 * - Todo components/documento: sin clases dark: (H1), sin 'truncate' (los nombres largos hacen break-words), sin
 *   next/image (un <img> simple), sin dangerouslySetInnerHTML (r1) y todo target="_blank" lleva rel
 *   'noopener noreferrer'.
 * - app/layout.tsx tiene lang="es" (C7). T15 agrega aquí las aserciones de app/confirmar/layout.tsx y app/pedido/layout.tsx.
 * - B3 T15: los layouts públicos sin indexar y sin Referer (C7); las páginas de app/confirmar y app/pedido usan
 *   pedirPublico con API_URL de lib/api.ts (nunca apiFetch ni una URL escrita a mano), una sola llamada en /confirmar
 *   (C26), DocumentoComercial (C3), las mismas reglas de components/documento (sin dark:, truncate, next/image ni
 *   dangerouslySetInnerHTML; _blank con noopener noreferrer) y un solo h1 por página (nivelTitulo).
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
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
  // T15 r1 (menor 12, opción A): sin margen de página, Chrome y Edge no imprimen el encabezado ni el pie con la URL
  // (que lleva el token). El margen pasa a padding de la hoja, repetido en cada página (box-decoration-break: clone).
  assert.match(doc, /@page\s*\{\s*margin:\s*0;?\s*\}/, '@page { margin: 0 }');
  assert.match(doc, /\.documento-comercial-pagina\s*\{[^}]*padding:\s*12mm/, 'los 12 mm pasan a padding de la hoja');
  assert.match(doc, /\.documento-comercial-pagina\s*\{[^}]*box-decoration-break:\s*clone/, 'en cada página impresa');
  assert.ok(doc.includes('className="documento-comercial-pagina @container w-full"'), 'la clase en la raíz');
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

// ─── B3 T15: las páginas públicas del cliente (/confirmar y /pedido) ─────────────────────────────────────────────

const APP = join(SRC, 'app');
/** Los .ts/.tsx de una carpeta de src/app, recursivo: [ruta relativa a src/app con '/', fuente]. */
function fuentesDe(...partes) {
  const salida = [];
  const recorrer = (dir) => {
    for (const entrada of readdirSync(dir, { withFileTypes: true })) {
      const ruta = join(dir, entrada.name);
      if (entrada.isDirectory()) recorrer(ruta);
      else if (/\.tsx?$/.test(entrada.name)) {
        salida.push([ruta.slice(APP.length + 1).replace(/\\/g, '/'), readFileSync(ruta, 'utf8')]);
      }
    }
  };
  recorrer(join(APP, ...partes));
  return salida;
}

console.log('--- TEST 5 (T15): app/confirmar/layout.tsx y app/pedido/layout.tsx: sin indexar y sin Referer (C7) ---');
{
  for (const [carpeta, titulo] of [['confirmar', 'Documento'], ['pedido', 'Tu pedido']]) {
    const layout = leer(APP, carpeta, 'layout.tsx');
    assert.ok(layout.includes("referrer: 'no-referrer'"), `${carpeta}: referrer: 'no-referrer'`);
    assert.ok(layout.includes('index: false'), `${carpeta}: robots index: false`);
    assert.ok(layout.includes('follow: false'), `${carpeta}: robots follow: false`);
    assert.ok(layout.includes(`title: '${titulo}'`), `${carpeta}: title '${titulo}' (la pestaña la fija la página)`);
    // T15 r1 (menor 10): Next junta la metadata por capas; sin esto heredaría la description de la raíz (la marca del
    // ERP) en la página del cliente.
    assert.ok(layout.includes('description: null'), `${carpeta}: description: null`);
    assert.ok(layout.includes(`LayoutProps<'/${carpeta}'>`), `${carpeta}: LayoutProps<'/${carpeta}'> de Next 16`);
    assert.doesNotMatch(layout, /'use client'/, `${carpeta}: componente de servidor (exporta metadata)`);
  }
  // C7: un solo layout para /confirmar (no confirmar/[token]/layout.tsx).
  assert.ok(!existsSync(join(APP, 'confirmar', '[token]', 'layout.tsx')), 'sin confirmar/[token]/layout.tsx');
}

console.log('--- TEST 6 (T15): las páginas públicas usan pedirPublico (nunca apiFetch) y solo librerías probadas ---');
{
  const publicas = [...fuentesDe('confirmar'), ...fuentesDe('pedido')];
  const nombres = publicas.map(([ruta]) => ruta);
  for (const archivo of ['confirmar/layout.tsx', 'confirmar/[token]/page.tsx', 'confirmar/[token]/vista-solicitud.tsx',
    'confirmar/[token]/vista-cotizacion.tsx', 'confirmar/[token]/aviso-enlace.tsx', 'confirmar/[token]/panel-cambios.tsx',
    'pedido/layout.tsx', 'pedido/[token]/page.tsx']) {
    assert.ok(nombres.includes(archivo), `falta app/${archivo}`);
  }
  for (const [ruta, fuente] of publicas) {
    assert.doesNotMatch(fuente, /\bapiFetch\b/, `${ruta}: sin apiFetch (mandaría el token del personal y llevaría a /login)`);
    assert.doesNotMatch(fuente, /(^|[^\w.])fetch\s*\(/, `${ruta}: sin fetch a mano (pedirPublico)`);
    assert.doesNotMatch(fuente, /['"]Authorization['"]/, `${ruta}: sin el encabezado de sesión`);
    assert.doesNotMatch(fuente, /nebulaekids|Nebulae|https?:\/\/localhost/, `${ruta}: sin URL escrita a mano ni la marca Nebulae`);
    assert.doesNotMatch(fuente, /\.slice\(\s*0\s*,\s*16\s*\)/, `${ruta}: la clave de idempotencia nunca repite el token`);
    assert.doesNotMatch(fuente, /\bdark:/, `${ruta}: sin dark:`);
    assert.doesNotMatch(fuente, /\btruncate\b/, `${ruta}: sin truncate`);
    assert.doesNotMatch(fuente, /from\s+['"]next\/image['"]/, `${ruta}: sin next/image`);
    assert.doesNotMatch(fuente, /dangerouslySetInnerHTML/, `${ruta}: lo que escribe el cliente va como texto`);
    assert.doesNotMatch(fuente, /design-system/, `${ruta}: colores de la marca, no los tokens internos (R15)`);
    assert.doesNotMatch(fuente, /publico\.ts|documento-cliente|DocumentoFactura|components\/publico/,
      `${ruta}: sin los helpers ni el componente duplicados (C3, C5, R10)`);
    assert.deepEqual(enlacesSinRel(fuente), [], `${ruta}: todo target="_blank" con rel="noopener noreferrer"`);
    const api = fuente.match(/import\s*\{([^}]*)\}\s*from\s*'@\/lib\/api'/);
    if (api) {
      assert.deepEqual(api[1].split(',').map((s) => s.trim()).filter(Boolean), ['API_URL'], `${ruta}: de lib/api solo API_URL`);
    }
  }
  const pagina = leer(APP, 'confirmar', '[token]', 'page.tsx');
  assert.match(pagina, /import\s*\{\s*API_URL\s*\}\s*from\s*'@\/lib\/api'/, 'la URL del API sale de lib/api.ts');
  assert.ok(pagina.includes('pedirPublico(API_URL'), 'pedirPublico con API_URL');
  // C26: una sola llamada al cargar; la empresa viene en la respuesta.
  assert.equal((pagina.match(/'\/confirmar\/ver'/g) || []).length, 1, "una sola llamada a '/confirmar/ver'");
  assert.doesNotMatch(pagina, /cargarMarcaEmpresa|\/publico\/empresa/, 'sin pedir la marca aparte (C26)');
  assert.ok(pagina.includes("'/confirmar/confirmar'") && pagina.includes("'/confirmar/pedir-cambios'"));
  assert.ok(pagina.includes("claveIdempotencia('confirmar')") && pagina.includes("claveIdempotencia('cambios')"),
    'una Idempotency-Key nueva por intento, sin el token');
  assert.ok(pagina.includes("'use client'"));

  const pedido = leer(APP, 'pedido', '[token]', 'page.tsx');
  assert.match(pedido, /import\s*\{\s*API_URL\s*\}\s*from\s*'@\/lib\/api'/);
  assert.ok(pedido.includes("pedirPublico(API_URL, '/pedido-cliente/ver'"), 'el pedido con pedirPublico');
  assert.doesNotMatch(pedido, /\/confirmar\/confirmar|pedir-cambios|claveIdempotencia/,
    'el pedido es de solo consulta: sin confirmar ni pedir cambios');
  assert.ok(pedido.includes('function ResumenPagosCliente') && pedido.includes('resumenPagosCliente('),
    'ResumenPagosCliente local lee pago y totales con la librería (R24)');
  // C3: DocumentoComercial es el único que pinta el documento.
  assert.ok(leer(APP, 'confirmar', '[token]', 'vista-solicitud.tsx').includes('variante="degradado"'));
  assert.ok(leer(APP, 'confirmar', '[token]', 'vista-cotizacion.tsx').includes('variante="acento"'));
  for (const archivo of [['confirmar', '[token]', 'vista-solicitud.tsx'], ['confirmar', '[token]', 'vista-cotizacion.tsx'],
    ['pedido', '[token]', 'page.tsx']]) {
    assert.ok(leer(APP, ...archivo).includes('<DocumentoComercial'), `${archivo.join('/')}: DocumentoComercial (C3)`);
  }
  for (const ruta of [['lib', 'publico.ts'], ['lib', 'documento-cliente.js'], ['components', 'publico']]) {
    assert.ok(!existsSync(join(SRC, ...ruta)), `no se crea src/${ruta.join('/')} (C5, R10)`);
  }
}

console.log('--- TEST 7 (T15): un solo h1 por página: nivelTitulo en DocumentoComercial (nota del controlador de T14) ---');
{
  const doc = leer(DOCUMENTO, 'DocumentoComercial.tsx');
  assert.match(doc, /nivelTitulo\?: 1 \| 2/, 'la prop nivelTitulo (1 por defecto)');
  assert.doesNotMatch(doc, /<h1\b/, 'el título del documento sale de nivelTitulo, no de un <h1> fijo');
  // La vista previa de Configuración (T14) y la hoja bajo un aviso de la página pública usan un h2.
  assert.ok(leer(APP, 'dashboard', 'admin', 'configuracion', 'documentos-form.tsx').includes('nivelTitulo={2}'));
  assert.ok(leer(APP, 'confirmar', '[token]', 'aviso-enlace.tsx').includes('<h1'), 'el aviso lleva el h1 de la página');
}

console.log('--- TEST 8 (T15 r1): nada queda colgado, el foco no se pierde y la tarjeta sin hoja imprime limpio ---');
{
  const pagina = leer(APP, 'confirmar', '[token]', 'page.tsx');
  // Menor 7: setEnviando(null) siempre, aunque algo lance.
  assert.equal((pagina.match(/finally\s*\{\s*setEnviando\(null\);?\s*\}/g) || []).length, 2,
    'confirmar() y pedirCambios() con try/finally');
  // Menor 11: después de una acción el foco va al h1 del aviso (o a la página); al cerrar el panel, a 'Pedir cambios'.
  const aviso = leer(APP, 'confirmar', '[token]', 'aviso-enlace.tsx');
  assert.match(aviso, /<h1[^>]*tabIndex=\{-1\}/, 'el h1 del aviso puede recibir el foco');
  assert.ok(aviso.includes('.focus()'), 'y lo recibe');
  assert.match(pagina, /<main[^>]*tabIndex=\{-1\}/, 'la página puede recibir el foco (la hoja tras «Reintentar»)');
  assert.ok(pagina.includes('enfocarPedirCambios'), 'Volver devuelve el foco a «Pedir cambios»');
  assert.ok(leer(APP, 'confirmar', '[token]', 'vista-solicitud.tsx').includes('.focus()'));
  // Menor 13: 'Reintentar' y el contacto de la tarjeta no se imprimen.
  assert.match(aviso, /<button[^>]*print:hidden[^>]*>[\s\S]*?Reintentar/, "'Reintentar' con print:hidden");
  assert.match(aviso, /<div className="print:hidden">\s*<ContactoEmpresa/, 'el contacto con print:hidden');
}

console.log('✓ Todas las pruebas de las fuentes de la plantilla pasaron.');
