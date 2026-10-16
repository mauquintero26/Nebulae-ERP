/**
 * frontend/tests/test_b21_decisiones.mjs
 * B2.1 (decisiones del usuario en la revisión del Bloque 2), Tarea 4: el frontend de D1, D2, D4 y D6.
 * - D1: /register ya no tiene formulario (las cuentas las crea un administrador del ERP, con un enlace a «Iniciar
 *   sesión») y el login ya no enlaza a /register. register() de lib/api.ts se borró: nadie la usaba (la pantalla de
 *   Empleados llama a /auth/register con apiFetch y la sesión del administrador).
 * - D2: la Papelera ya no se borra sola. La fila vencida (dias_restantes <= 0) lo dice (TEXTO_PAPELERA_VENCIDA), el
 *   administrador ve «Vaciar las vencidas» (confirmar() con las vencidas de la lista, POST /ventas/papelera/purgar,
 *   aviso y recarga) y los textos ya no prometen el borrado automático a los 30 días.
 * - D4: urlWebSocket(ruta) deriva la URL del WebSocket de API_URL. El asistente flotante y el panel IA de la solicitud
 *   usan el servidor configurado, sin URLs de producción ni localhost:5000 escritos a mano.
 * - D6: el 409 MOTIVO_NUEVO al retomar una cotización (pideMotivoNuevo) abre la ventana del motivo de «Cotizar sin
 *   confirmación» (VentanaMotivoSinConfirmacion, compartida con el detalle de la SC) y reintenta el mismo PATCH con
 *   motivo_sin_confirmacion.
 */

import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import {
  estadoEnPapelera, esVencidaEnPapelera, contarVencidasEnPapelera, confirmacionVaciarVencidas, textoPapeleraVaciada,
  TEXTO_PAPELERA_VENCIDA,
} from '../src/lib/listas-ventas.js';
import { pideMotivoNuevo } from '../src/lib/estados-solicitud.js';

// Con los saltos de línea normalizados (el checkout de Windows deja CRLF en algunos archivos).
const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
/** El código sin comentarios // ni /* … *\/ (también {/* … *\/} de JSX), para que una nota no cuente como uso. */
const sinComentarios = (fuente) => fuente.replace(/\{?\/\*[\s\S]*?\*\/\}?/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
/** El cuerpo de la función que empieza en `marca`: desde su primera llave hasta la que la cierra. */
function cuerpoDe(fuente, marca) {
  const inicio = fuente.indexOf(marca);
  assert.ok(inicio >= 0, `no se encontró ${marca}`);
  const abre = fuente.indexOf('{', fuente.indexOf(')', inicio));
  let nivel = 0;
  for (let i = abre; i < fuente.length; i++) {
    if (fuente[i] === '{') nivel++;
    else if (fuente[i] === '}' && --nivel === 0) return fuente.slice(inicio, i + 1);
  }
  assert.fail(`no se encontró el final de ${marca}`);
}
const veces = (fuente, texto) => fuente.split(texto).length - 1;

console.log('--- D4 TEST 1: urlWebSocket deriva el WebSocket de la URL del API ---');
{
  const { urlWebSocket, API_URL } = await import('../src/lib/api.ts?caso=d4');
  assert.equal(urlWebSocket('/ws/chat/global', 'https://api.x.com/api/v1'), 'wss://api.x.com/ws/chat/global');
  assert.equal(urlWebSocket('/ws/chat/global', 'http://localhost:8020/api/v1'), 'ws://localhost:8020/ws/chat/global');
  // Barra final, la ruta sin barra inicial y espacios en los bordes de la variable de entorno.
  assert.equal(urlWebSocket('/ws/chat/global', 'https://api.x.com/api/v1/'), 'wss://api.x.com/ws/chat/global');
  assert.equal(urlWebSocket('ws/chat/global', 'http://localhost:8020/api/v1'), 'ws://localhost:8020/ws/chat/global');
  assert.equal(urlWebSocket('/ws/chat/global', '  https://api.x.com/api/v1  '), 'wss://api.x.com/ws/chat/global');
  // Sin /api/v1 al final: el servidor del WebSocket es el mismo y su ruta cuelga de lo que haya (la raíz o el prefijo
  // de un proxy). Con prefijo y /api/v1, se quita solo /api/v1.
  assert.equal(urlWebSocket('/ws/chat/global', 'http://localhost:8020'), 'ws://localhost:8020/ws/chat/global');
  assert.equal(urlWebSocket('/ws/chat/global', 'https://erp.x.com/backend'), 'wss://erp.x.com/backend/ws/chat/global');
  assert.equal(urlWebSocket('/ws/chat/global', 'https://erp.x.com/backend/api/v1'), 'wss://erp.x.com/backend/ws/chat/global');
  // Sin query ni fragmento de la base.
  assert.equal(urlWebSocket('/ws/chat/global', 'https://api.x.com/api/v1?x=1#y'), 'wss://api.x.com/ws/chat/global');
  // B2.1 T4 r1: la query de la ruta se conserva tal cual (antes el «?» quedaba como %3F dentro del pathname); la de la
  // base no.
  assert.equal(urlWebSocket('/ws/chat/global?token=abc', 'https://api.x.com/api/v1'), 'wss://api.x.com/ws/chat/global?token=abc');
  assert.equal(urlWebSocket('/ws/chat/global?token=abc', 'https://api.x.com/api/v1?x=1#y'), 'wss://api.x.com/ws/chat/global?token=abc');
  assert.equal(urlWebSocket('ws/chat/global?a=1&b=2', 'http://localhost:8020/api/v1/'), 'ws://localhost:8020/ws/chat/global?a=1&b=2');
  // Una base relativa (un proxy en el mismo dominio) se resuelve contra la página: https -> wss.
  definirVentana('https://erp.x.com/dashboard/ventas');
  assert.equal(urlWebSocket('/ws/chat/global', '/api/v1'), 'wss://erp.x.com/ws/chat/global');
  definirVentana('http://localhost:5100/dashboard');
  assert.equal(urlWebSocket('/ws/chat/global', '/api/v1'), 'ws://localhost:5100/ws/chat/global');
  delete globalThis.window;
  // Por defecto usa API_URL.
  assert.equal(urlWebSocket('/ws/chat/global'), urlWebSocket('/ws/chat/global', API_URL));
}

console.log('--- D4 TEST 2: con NEXT_PUBLIC_API_URL de pruebas, el WebSocket va al servidor de pruebas ---');
{
  const antes = process.env.NEXT_PUBLIC_API_URL;
  process.env.NEXT_PUBLIC_API_URL = 'http://localhost:8020/api/v1';
  const conEnv = await import('../src/lib/api.ts?caso=d4-env');
  assert.equal(conEnv.API_URL, 'http://localhost:8020/api/v1');
  assert.equal(conEnv.urlWebSocket('/ws/chat/global'), 'ws://localhost:8020/ws/chat/global');
  if (antes === undefined) delete process.env.NEXT_PUBLIC_API_URL; else process.env.NEXT_PUBLIC_API_URL = antes;
}

console.log('--- D4 TEST 3: el asistente flotante y el panel IA usan el servidor configurado ---');
{
  const chatCrudo = leer('components/GlobalAIChat.tsx');
  const chat = sinComentarios(chatCrudo);
  assert.ok(!chatCrudo.includes('api.nebulaekids.com'), 'GlobalAIChat sin la URL de producción escrita a mano');
  assert.ok(!chatCrudo.includes('localhost:5000'), 'GlobalAIChat sin localhost:5000');
  assert.ok(!chat.includes('process.env.NEXT_PUBLIC_API_URL'), 'GlobalAIChat toma el servidor de lib/api.ts');
  assert.match(chat, /import \{[^}]*\burlWebSocket\b[^}]*\} from '@\/lib\/api';/);
  assert.match(chat, /import \{[^}]*\bAPI_URL\b[^}]*\} from '@\/lib\/api';/);
  assert.match(chat, /new WebSocket\(urlWebSocket\('\/ws\/chat\/global'\)\)/);
  assert.match(chat, /fetch\(`\$\{API_URL\}\/chat\/message`/, 'el respaldo REST usa API_URL');
  assert.ok(!/servidor de producci[oó]n/i.test(chat), 'el saludo ya no dice que está conectado a producción');

  const scCrudo = leer('app/dashboard/ventas/solicitud/[id]/page.tsx');
  const sc = sinComentarios(scCrudo);
  assert.ok(!scCrudo.includes('api.nebulaekids.com'), 'el detalle de la SC sin la URL de producción escrita a mano');
  assert.match(sc, /<IAPanelSC sc=\{solicitud\} apiBase=\{API_URL\} \/>/);
  assert.match(sc, /import \{[^}]*\bAPI_URL\b[^}]*\} from '@\/lib\/api';/);
}

console.log('--- D1 TEST 1: /register sin formulario y el login sin enlace a /register ---');
{
  const registro = sinComentarios(leer('app/register/page.tsx'));
  assert.ok(!/<form\b/.test(registro), '/register sin <form>');
  assert.ok(!/<input\b/.test(registro), '/register sin campos');
  assert.ok(!/\bregister\(/.test(registro), '/register no llama a register()');
  assert.ok(!registro.includes("from '@/lib/api'"), '/register no importa nada del API');
  assert.ok(registro.includes('Las cuentas las crea un administrador del ERP'), 'el texto de D1');
  assert.match(registro, /<Link\s+href="\/login"[^>]*>[\s\S]*?Iniciar sesión[\s\S]*?<\/Link>/, 'enlace a «Iniciar sesión»');

  const login = sinComentarios(leer('app/login/page.tsx'));
  assert.ok(!login.includes('/register'), 'el login no enlaza a /register');
  assert.ok(login.includes('href="/forgot-password"'), 'el enlace de la contraseña olvidada sigue');

  const api = sinComentarios(leer('lib/api.ts'));
  assert.ok(!/export async function register\(/.test(api), 'register() se borró de lib/api.ts');
  assert.ok(!api.includes('/auth/register'), 'lib/api.ts ya no llama a /auth/register');
  // La pantalla de Empleados (la única que crea cuentas) no cambia: apiFetch con la sesión del administrador.
  assert.ok(leer('app/dashboard/admin/empleados/page.tsx').includes("apiFetch('/auth/register'"));
}

console.log('--- D2 TEST 1: la fila vencida de la Papelera (dias_restantes <= 0) ---');
{
  assert.equal(TEXTO_PAPELERA_VENCIDA, 'Vencida: se borra cuando un administrador vacíe la Papelera');
  for (const dias of [0, -1, -12]) {
    assert.deepEqual(estadoEnPapelera({ dias_restantes: dias, tiene_documentos: false }), {
      conservada: false, texto: TEXTO_PAPELERA_VENCIDA, nota: '', urgente: true, puedeEliminar: true,
    }, `dias_restantes ${dias}`);
  }
  // Lo demás no cambia: con documentos se conserva, la cuenta regresiva sigue y sin fecha no hay cuenta.
  assert.equal(estadoEnPapelera({ dias_restantes: 0, tiene_documentos: true }).texto, 'Se conserva (tiene documentos vinculados)');
  assert.equal(estadoEnPapelera({ dias_restantes: 1, tiene_documentos: false }).texto, '1 día');
  assert.equal(estadoEnPapelera({ dias_restantes: 1, tiene_documentos: false }).nota, 'para poder eliminarla');
  assert.equal(estadoEnPapelera({ dias_restantes: null, tiene_documentos: false }).urgente, false);
}

console.log('--- D2 TEST 2: esVencidaEnPapelera y contarVencidasEnPapelera ---');
{
  assert.equal(esVencidaEnPapelera({ dias_restantes: 0, tiene_documentos: false }), true);
  assert.equal(esVencidaEnPapelera({ dias_restantes: -2 }), true);
  // null <= 0 es true en JS: sin fecha (o con documentos) nunca es vencida.
  for (const sc of [{ dias_restantes: null }, {}, { dias_restantes: undefined }, { dias_restantes: 1 },
    { dias_restantes: 0, tiene_documentos: true }, { dias_restantes: '0' }, null, undefined, 'SC-1']) {
    assert.equal(esVencidaEnPapelera(sc), false, JSON.stringify(sc));
  }
  const lista = [
    { id: 1, dias_restantes: 0, tiene_documentos: false },
    { id: 2, dias_restantes: 3, tiene_documentos: false },
    { id: 3, dias_restantes: null, tiene_documentos: true },
    { id: 4, dias_restantes: 0, tiene_documentos: false },
    { id: 5, dias_restantes: null, tiene_documentos: false },
    null,
  ];
  assert.equal(contarVencidasEnPapelera(lista), 2);
  assert.equal(contarVencidasEnPapelera([]), 0);
  assert.equal(contarVencidasEnPapelera(null), 0);
  assert.equal(contarVencidasEnPapelera(undefined), 0);
}

console.log('--- D2 TEST 3: la confirmación y el aviso de «Vaciar las vencidas» ---');
{
  const dos = confirmacionVaciarVencidas(2);
  assert.equal(dos.titulo, 'Vaciar las vencidas');
  assert.equal(dos.textoConfirmar, 'Vaciar las vencidas');
  assert.equal(dos.peligro, true);
  assert.ok(dos.mensaje.includes('2 solicitudes vencidas'), dos.mensaje);
  assert.ok(dos.mensaje.includes('para siempre'), 'dice que no se puede deshacer');
  assert.ok(confirmacionVaciarVencidas(1).mensaje.includes('1 solicitud vencida'), 'singular');
  assert.ok(!confirmacionVaciarVencidas(1).mensaje.includes('1 solicitudes'), 'sin «1 solicitudes»');
  // Sin vencidas en la lista (la lista trae como mucho 200, de la más reciente a la más vieja): el servidor decide.
  const ninguna = confirmacionVaciarVencidas(0);
  assert.ok(ninguna.mensaje.includes('no hay solicitudes vencidas'), ninguna.mensaje);
  assert.equal(ninguna.peligro, true);

  assert.equal(textoPapeleraVaciada(0), 'No había solicitudes vencidas para borrar.');
  assert.equal(textoPapeleraVaciada(1), 'Se borró 1 solicitud vencida.');
  assert.equal(textoPapeleraVaciada(3), 'Se borraron 3 solicitudes vencidas.');
  for (const raro of [null, undefined, 'x', -1, Number.NaN]) {
    assert.equal(textoPapeleraVaciada(raro), 'No había solicitudes vencidas para borrar.', String(raro));
  }
}

console.log('--- D2 TEST 4: el botón «Vaciar las vencidas» (solo ADMIN) en la Papelera ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.equal(veces(lista, 'Vaciar las vencidas'), 1, 'un solo botón');
  // El botón está dentro de la guarda del administrador (la misma de «Eliminar permanentemente»).
  assert.match(lista, /\{esAdministrador\(getUsuarioActual\(\)\.role\)&&\(?<button[^>]*onClick=\{vaciarVencidas\}[^>]*>[\s\S]{0,300}?Vaciar las vencidas[\s\S]{0,40}?<\/button>\)?\}/);
  assert.match(lista, /<button[^>]*onClick=\{vaciarVencidas\}[^>]*disabled=\{vaciandoPapelera\}/, 'deshabilitado mientras vacía');

  const vaciar = cuerpoDe(lista, 'async function vaciarVencidas(');
  const pide = vaciar.indexOf('confirmar(confirmacionVaciarVencidas(contarVencidasEnPapelera(papelera)))');
  const post = vaciar.indexOf("apiFetch('/ventas/papelera/purgar',{method:'POST'})");
  assert.ok(pide > 0, 'confirmar() con las vencidas contadas en la lista');
  assert.ok(post > pide, 'POST /ventas/papelera/purgar después de confirmar');
  assert.ok(/avisar\(textoPapeleraVaciada\(/.test(vaciar), 'avisa cuántas borró');
  assert.ok(vaciar.indexOf('await loadPapelera()') > post, 'recarga la Papelera');
  // B2.1 (revisión final, Minor 2): y la lista, para que «Canceladas» y los contadores de las pestañas no sigan
  // mostrando las purgadas (como restaurarSC).
  assert.ok(vaciar.indexOf('await load();') > vaciar.indexOf('await loadPapelera()'), 'recarga también la lista');
  assert.ok(/avisarError\(err,'No se pudo vaciar la Papelera'\)/.test(vaciar), 'el error sale como aviso');
  assert.ok(!/\b(?:alert|confirm|prompt)\(/.test(vaciar), 'sin diálogos nativos');
}

console.log('--- D2 TEST 5: los textos ya no dicen que la Papelera se borra sola ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.ok(!/se eliminan a los 30 días/i.test(lista), 'cabecera y estado vacío sin «se eliminan a los 30 días»');
  assert.ok(!lista.includes('antes de su eliminación permanente'), 'el análisis sin el borrado automático');
  assert.ok(!lista.includes('almacenan automáticamente'), 'el análisis sin el borrado automático');
  assert.ok((lista.match(/un administrador vacía las vencidas/gi) ?? []).length >= 3, 'cabecera, estado vacío y análisis');
  const hub = leer('app/dashboard/ventas/page.tsx');
  assert.ok(!hub.includes("'La solicitud se cancela y pasa a la papelera (30 días)'"), 'el Hub sin «(30 días)»');
  assert.ok(hub.includes("SC: 'La solicitud se cancela y pasa a la Papelera: se puede eliminar definitivamente después de 30 días si no se restaura',"));
  // Ninguna fila promete un borrado automático (B2.1 T4 r1): la cuenta regresiva es para poder eliminarla y la que no
  // tiene fecha «no vence».
  assert.equal(estadoEnPapelera({ dias_restantes: 20, tiene_documentos: false }).nota, 'para poder eliminarla');
  assert.ok(!/autom[aá]tic/i.test(estadoEnPapelera({ dias_restantes: null, tiene_documentos: false }).texto));
}

console.log('--- D2 TEST 6 (r1): la cabecera de la Papelera es el título y la regla va en una línea de ayuda ---');
{
  const lista = sinComentarios(leer('app/dashboard/ventas/solicitud/solicitud-client.tsx'));
  assert.match(lista, /<p className="[^"]*\buppercase\b[^"]*">Solicitudes en Papelera<\/p>/, 'el título, solo');
  const ayuda = lista.match(/<p className=\{PAGE_HEADER\.subtitle\}>([^<]*)<\/p>/);
  assert.ok(ayuda, 'la línea de ayuda debajo, con el token PAGE_HEADER.subtitle del design-system');
  assert.ok(ayuda[1].includes('se pueden eliminar definitivamente después de 30 días si no se restauran'), ayuda[1]);
  assert.ok(ayuda[1].includes('un administrador vacía las vencidas'), ayuda[1]);
  assert.ok(lista.indexOf('>Solicitudes en Papelera</p>') < lista.indexOf('<p className={PAGE_HEADER.subtitle}>'), 'debajo del título');
  assert.match(lista, /import \{[^}]*\bPAGE_HEADER\b[^}]*\} from '@\/lib\/design-system';/);
  // El token no pone mayúsculas.
  const token = leer('lib/design-system.ts').match(/subtitle:\s*'([^']*)'/);
  assert.ok(token && !/\buppercase\b/.test(token[1]), 'PAGE_HEADER.subtitle sin uppercase');
}

console.log('--- D6 TEST 1: pideMotivoNuevo reconoce el 409 MOTIVO_NUEVO ---');
{
  const mensaje = 'La solicitud se canceló y se restauró después de esta cotización: escribe un motivo nuevo para retomarla sin la confirmación del cliente.';
  assert.equal(pideMotivoNuevo({ status: 409, detail: { codigo: 'MOTIVO_NUEVO', mensaje } }), true);
  for (const err of [
    { status: 409, detail: { codigo: 'ANULA_CONFIRMACION' } },
    { status: 422, detail: { codigo: 'MOTIVO_NUEVO' } },
    { status: 409, detail: 'MOTIVO_NUEVO' },
    { status: 409, detail: null },
    { status: 409 },
    { detail: { codigo: 'MOTIVO_NUEVO' } },
    new Error('x'), null, undefined, 'MOTIVO_NUEVO',
  ]) {
    assert.equal(pideMotivoNuevo(err), false, JSON.stringify(err));
  }
}

console.log('--- D6 TEST 2: la ventana del motivo es una sola (VentanaMotivoSinConfirmacion) ---');
{
  const ruta = '../src/app/dashboard/ventas/motivo-sin-confirmacion.tsx';
  assert.ok(existsSync(new URL(ruta, import.meta.url)), 'la ventana compartida existe');
  const ventana = sinComentarios(leer('app/dashboard/ventas/motivo-sin-confirmacion.tsx'));
  assert.match(ventana, /export function VentanaMotivoSinConfirmacion\(/);
  // El mismo criterio y los mismos límites que el servidor (S5): motivo limpio, contador y error en línea.
  assert.ok(ventana.includes('largoTexto(motivoLimpio(motivo))'), 'el contador cuenta el motivo limpio');
  assert.ok(ventana.includes('errorMotivoSinConfirmacion(motivo)'), 'el error del motivo es el del servidor');
  assert.ok(ventana.includes('MOTIVO_SIN_CONFIRMACION_MIN') && ventana.includes('MOTIVO_SIN_CONFIRMACION_MAX'));
  assert.ok(!ventana.includes('maxLength='), 'sin maxLength (cuenta UTF-16 crudo, con los invisibles)');
  assert.ok(ventana.includes('disabled={!!errorMotivo}'), 'el botón se bloquea con el error del motivo');
  // Mientras guarda no se cierra: ni la X, ni el botón de cancelar, ni onClose.
  assert.ok(ventana.includes('bloquearCierre={guardando}'));
  assert.ok(ventana.includes('onClose={() => { if (!guardando) onCerrar(); }}'));
  assert.match(ventana, /<Button variant="secondary" disabled=\{guardando\} onClick=\{onCerrar\}>/);
  assert.ok(ventana.includes('readOnly={guardando}'));
  assert.ok(/role="alert"[^>]*>\{error\}/.test(ventana), 'el error del servidor se ve dentro de la ventana');

  const sc = sinComentarios(leer('app/dashboard/ventas/solicitud/[id]/page.tsx'));
  assert.equal(veces(sc, '<VentanaMotivoSinConfirmacion'), 1, 'la SC usa la ventana compartida');
  assert.ok(!sc.includes('<textarea\n              id="motivo-sin-confirmacion"'), 'sin la copia de la ventana en la SC');
  assert.match(sc, /<VentanaMotivoSinConfirmacion[\s\S]*?onConfirmar=\{cotizarSinConfirmacion\}/);
  assert.match(sc, /<VentanaMotivoSinConfirmacion[\s\S]*?guardando=\{cotizandoSinConf\}/);
}

console.log('--- D6 TEST 3: el detalle de la COT abre la ventana con el 409 MOTIVO_NUEVO y reintenta el PATCH ---');
{
  const cot = sinComentarios(leer('app/dashboard/ventas/cotizacion/[id]/page.tsx'));
  assert.equal(veces(cot, '<VentanaMotivoSinConfirmacion'), 1, 'la COT usa la ventana compartida');
  assert.match(cot, /import \{ VentanaMotivoSinConfirmacion \} from '\.\.\/\.\.\/motivo-sin-confirmacion';/);

  const cambiar = cuerpoDe(cot, 'async function changeEstado(');
  assert.ok(/const cuerpo = \{ estado: newEstado, updated_by: currentUser \};/.test(cambiar), 'el cuerpo del PATCH');
  assert.ok(cambiar.includes('body: JSON.stringify(cuerpo)'));
  // Con el 409 MOTIVO_NUEVO (y el usuario todavía en la página) se abre la ventana con ese cuerpo y no se avisa error.
  const abre = cambiar.search(/if \(pideMotivoNuevo\(err\) && vivo\.current\) \{\s*abrirMotivoNuevo\(cuerpo, err\);\s*return;\s*\}/);
  assert.ok(abre > 0, 'el 409 MOTIVO_NUEVO abre la ventana');
  assert.ok(abre < cambiar.indexOf("avisarError(err, 'No se pudo cambiar el estado')"), 'antes del aviso de error');

  const reintento = cuerpoDe(cot, 'async function retomarConMotivoNuevo(');
  assert.ok(reintento.includes('errorMotivoSinConfirmacion(motivoNuevo)'), 'valida el motivo antes de mandarlo');
  assert.ok(reintento.includes('body: JSON.stringify({ ...motivoNuevoPendiente.cuerpo, motivo_sin_confirmacion: motivoNuevo.trim() })'),
    'el mismo cuerpo del PATCH más motivo_sin_confirmacion');
  assert.ok(reintento.includes("method: 'PATCH'"));
  assert.ok(/if \(!vivo\.current\)/.test(reintento), 'si el usuario ya salió, avisa con un enlace');
  assert.ok(reintento.includes('setMotivoNuevoError(textoDeError(err))'), 'el error del reintento se ve en la ventana');

  assert.match(cot, /<VentanaMotivoSinConfirmacion[\s\S]*?guardando=\{guardandoMotivoNuevo\}/);
  assert.match(cot, /<VentanaMotivoSinConfirmacion[\s\S]*?onConfirmar=\{retomarConMotivoNuevo\}/);
  assert.match(cot, /<VentanaMotivoSinConfirmacion[\s\S]*?error=\{motivoNuevoError\}/);
}

console.log('OK test_b21_decisiones');

function definirVentana(href) {
  Object.defineProperty(globalThis, 'window', { value: { location: { href } }, configurable: true, writable: true });
}
