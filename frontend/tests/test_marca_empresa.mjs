/**
 * frontend/tests/test_marca_empresa.mjs
 * B3 T12 (MARCA punto 5, C1, RP19, RP21): lib/marca-empresa.js.
 * - normalizarMarca acepta {status, data} o el perfil directo (perfil_publico de backend/app/core/empresa.py), rellena
 *   lo que falte y cambia un color inválido por el de la referencia.
 * - cargarMarcaEmpresa: GET {apiUrl}/publico/empresa SIN Authorization ni credenciales; nunca lanza (MARCA_VACIA).
 * - validarCampoEmpresa: espejo de empresa.validar_cambios con sus mismos textos (los casos de
 *   backend/tests/test_empresa_marca.py::test_validar_cambios_reglas_y_mensajes). T13 compara los dos lados (RP21).
 * - cambiosDelFormulario, validarArchivoLogo, urlLogo.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  COLORES_POR_DEFECTO, MARCA_VACIA, CAMPOS_EMPRESA, normalizarMarca, cargarMarcaEmpresa, urlLogo, validarCampoEmpresa,
  cambiosDelFormulario, validarArchivoLogo, correoValido, inicialesMarca,
} from '../src/lib/marca-empresa.js';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');

const MENSAJE_WHATSAPP = 'WhatsApp no válido: escribe el celular de 10 dígitos o el número completo con su indicativo '
  + '(por ejemplo +57 300 123 4567).';
const MENSAJE_URL = 'La página web debe empezar por http:// o https://.';
const MENSAJE_NIT = 'NIT no válido: usa solo números, puntos y guion (por ejemplo 900.123.456-7).';
const MENSAJE_TELEFONO = 'Teléfono no válido: escribe entre 7 y 15 dígitos.';
const MENSAJE_COLOR = 'Color no válido: usa el formato #RRGGBB.';

// El perfil que devuelve GET /api/v1/publico/empresa (empresa.perfil_publico), configurado.
const PERFIL = {
  nombre_comercial: 'DEMO Ferretería', razon_social: 'DEMO S.A.S.', nit: '900.123.456-7', direccion: 'Calle DEMO 1',
  ciudad: 'Bogotá', telefono: '(601) 234-5678', whatsapp: '3001234567', correo: 'ventas@example.com',
  sitio_web: 'https://example.com', colores: { principal: '#7c3aed', secundario: '#E11D48', acento: '#c2410c' },
  logo_url: '/publico/empresa/logo?v=abc123def456', configurada: true,
};

console.log('--- TEST 1: COLORES_POR_DEFECTO, MARCA_VACIA y normalizarMarca ---');
{
  assert.deepEqual(COLORES_POR_DEFECTO, { principal: '#7C3AED', secundario: '#E11D48', acento: '#C2410C' });
  assert.ok(Object.isFrozen(COLORES_POR_DEFECTO) && Object.isFrozen(MARCA_VACIA) && Object.isFrozen(MARCA_VACIA.colores));
  const vacia = normalizarMarca({});
  assert.deepEqual(vacia.colores, COLORES_POR_DEFECTO, 'colores por defecto');
  assert.equal(vacia.logo_url, null, 'logo null');
  assert.equal(vacia.configurada, false);
  assert.deepEqual(vacia, MARCA_VACIA);
  for (const raro of [null, undefined, 'x', 42, [], { status: 'success', data: null }]) {
    assert.deepEqual(normalizarMarca(raro), MARCA_VACIA, `normalizarMarca(${JSON.stringify(raro)})`);
  }

  const directa = normalizarMarca(PERFIL);
  const envuelta = normalizarMarca({ status: 'success', data: PERFIL });
  assert.deepEqual(directa, envuelta, 'acepta {status, data} o el dict directo');
  assert.equal(directa.nombre_comercial, 'DEMO Ferretería');
  assert.deepEqual(directa.colores, { principal: '#7C3AED', secundario: '#E11D48', acento: '#C2410C' }, 'en mayúsculas');
  assert.equal(directa.logo_url, '/publico/empresa/logo?v=abc123def456');
  assert.equal(directa.configurada, true);
  assert.deepEqual(Object.keys(directa).sort(), Object.keys(MARCA_VACIA).sort(), 'solo la lista blanca');

  const mala = normalizarMarca({ nombre_comercial: '  DEMO  ', telefono: 3001234567, terminos: 'NO',
    colores: { principal: 'red', secundario: '#12345', acento: '#00ff00' }, logo_url: 'javascript:alert(1)' });
  assert.equal(mala.nombre_comercial, 'DEMO');
  assert.equal(mala.telefono, '', 'lo que no es texto queda vacío');
  assert.equal('terminos' in mala, false, 'nunca términos ni otra clave');
  assert.deepEqual(mala.colores, { principal: '#7C3AED', secundario: '#E11D48', acento: '#00FF00' });
  assert.equal(mala.logo_url, null, 'un logo que no es una ruta, http(s) o data:image se descarta');
  assert.equal(mala.configurada, true, 'configurada = hay nombre comercial (como leer_perfil)');

  // La forma plana de GET /empresa (leer_perfil) y de la vista previa de Configuración: color_principal, etc.
  const plana = normalizarMarca({ nombre_comercial: 'DEMO', color_principal: '#111111', color_acento: 'x' });
  assert.deepEqual(plana.colores, { principal: '#111111', secundario: '#E11D48', acento: '#C2410C' });
  assert.equal(normalizarMarca({ logo_url: 'data:image/png;base64,iVBORw0KGgo=' }).logo_url,
    'data:image/png;base64,iVBORw0KGgo=', 'la vista previa de un logo sin guardar');
  assert.equal(normalizarMarca({ logo_url: 'data:image/svg+xml;base64,PHN2Zz4=' }).logo_url, null, 'SVG no');

  assert.equal(inicialesMarca('DEMO Ferretería del Centro'), 'DF');
  assert.equal(inicialesMarca('  ñandú  '), 'Ñ');
  assert.equal(inicialesMarca(''), '');
}

console.log('--- TEST 2: cargarMarcaEmpresa sin Authorization y sin lanzar ---');
{
  const llamadas = [];
  const fetchFalso = async (url, init) => {
    llamadas.push({ url, init });
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: PERFIL }) };
  };
  const marca = await cargarMarcaEmpresa('http://localhost:8030/api/v1/', fetchFalso);
  assert.equal(llamadas.length, 1);
  assert.equal(llamadas[0].url, 'http://localhost:8030/api/v1/publico/empresa');
  const init = llamadas[0].init || {};
  const encabezados = Object.keys(init.headers || {}).map((k) => k.toLowerCase());
  assert.ok(!encabezados.includes('authorization'), 'sin Authorization');
  assert.equal(init.credentials, 'omit', 'sin credenciales (cookies)');
  assert.equal(init.referrerPolicy, 'no-referrer', 'la URL con el token no viaja en el Referer');
  assert.deepEqual(marca, normalizarMarca(PERFIL));

  const casos = [
    async () => { throw new TypeError('Failed to fetch'); },
    async () => ({ ok: false, status: 500, json: async () => ({ status: 'error' }) }),
    async () => ({ ok: true, status: 200, json: async () => { throw new SyntaxError('no es JSON'); } }),
    () => { throw new Error('síncrono'); },
    'no es una función',
  ];
  for (const f of casos) {
    assert.deepEqual(await cargarMarcaEmpresa('http://x/api/v1', f), MARCA_VACIA, 'nunca lanza: MARCA_VACIA');
  }
}

console.log('--- TEST 3: validarCampoEmpresa da los mismos valores y textos que empresa.validar_cambios ---');
{
  const validos = [
    ['nombre_comercial', '  DEMO  ', 'DEMO'],
    ['nombre_comercial', '', ''],
    ['nombre_comercial', null, ''],
    ['nit', '900.123.456-7', '900.123.456-7'],
    ['telefono', '(601) 234-5678', '(601) 234-5678'],
    ['telefono', '+57 601 234 5678', '+57 601 234 5678'],
    ['whatsapp', '300 123 4567', '300 123 4567'],
    ['whatsapp', '+57 300 123 4567', '+57 300 123 4567'],
    ['whatsapp', '+1 415 555 2671', '+1 415 555 2671'],
    ['correo', ' Ventas@Example.com ', 'Ventas@Example.com'],
    ['sitio_web', 'example.com', 'https://example.com'],
    ['sitio_web', 'www.example.com/tienda', 'https://www.example.com/tienda'],
    ['sitio_web', 'example.com:8080/x', 'https://example.com:8080/x'],
    ['sitio_web', 'HTTP://example.com', 'HTTP://example.com'],
    ['sitio_web', 'https://[::1]:8080/x', 'https://[::1]:8080/x'],
    ['color_principal', '#abcdef', '#ABCDEF'],
    ['terminos_cotizacion', 'Línea 1\nLínea 2', 'Línea 1\nLínea 2'],
    ['instrucciones_pago', 'Banco:\tX\r\nCuenta\x00 123', 'Banco:\tX\nCuenta 123'],
    ['mensaje_pie', 'Gracias\npor tu compra', 'Gracias\npor tu compra'],
    ['nombre_comercial', 'DEMO\tFerretería\r\nCentro', 'DEMO Ferretería Centro'],
    ['razon_social', 'Demo\n\nS.A.S.\t', 'Demo S.A.S.'],
    ['direccion', 'Calle 1\n# 2-3', 'Calle 1 # 2-3'],
    ['ciudad', 'Bogotá\x00 D.C.', 'Bogotá  D.C.'],
    ['whatsapp', '300 123\n4567', '300 123 4567'],
    ['ciudad', '\u00a0Bogotá\u3000', 'Bogotá'],
    ['nombre_comercial', 'x'.repeat(120), 'x'.repeat(120)],
    // Bordes verificados contra el backend (Python 3.14): el máximo cuenta code points; strip() de Python (sin \ufeff,
    // con \x85); urlparse con IPv6, IPvFuture y zona; un puerto sin esquema.
    ['nombre_comercial', '😀'.repeat(120), '😀'.repeat(120)],
    ['correo', 'a@b.c\ufeff', 'a@b.c\ufeff'],
    ['instrucciones_pago', '\x85 hola \x85', 'hola'],
    ['sitio_web', 'https://[v1.x]/', 'https://[v1.x]/'],
    ['sitio_web', 'https://[fe80::1%25eth0]/', 'https://[fe80::1%25eth0]/'],
    ['sitio_web', 'https://[::ffff:1.2.3.4]/', 'https://[::ffff:1.2.3.4]/'],
    ['sitio_web', 'https://u@[::1]:80/', 'https://u@[::1]:80/'],
    ['sitio_web', 'localhost:3000', 'https://localhost:3000'],
    ['nit', '900 123 456', '900 123 456'],
  ];
  for (const [campo, valor, esperado] of validos) {
    assert.deepEqual(validarCampoEmpresa(campo, valor), { valor: esperado, error: null }, `${campo}: ${JSON.stringify(valor)}`);
  }

  const malos = [
    ['logo', 'data:image/png;base64,xx', 'Campo desconocido: logo.'],
    ['puede_editar', true, 'Campo desconocido: puede_editar.'],
    ['nombre_comercial', 'x'.repeat(121), 'Nombre comercial: máximo 120 caracteres.'],
    ['instrucciones_pago', 'x'.repeat(1001), 'Datos para pagar: máximo 1000 caracteres.'],
    ['nit', 'ABC', MENSAJE_NIT],
    ['nit', '9', MENSAJE_NIT],
    ['telefono', '12345', MENSAJE_TELEFONO],
    ['telefono', '300-ABC-1234', MENSAJE_TELEFONO],
    ['telefono', '1234567890123456', MENSAJE_TELEFONO],
    ['whatsapp', '300123456', MENSAJE_WHATSAPP],
    ['whatsapp', '+57 300 123 4567 8', MENSAJE_WHATSAPP],
    ['whatsapp', 'Cel: 300 123 4567', MENSAJE_WHATSAPP],
    ['whatsapp', '300 123 4567 ext 12', MENSAJE_WHATSAPP],
    ['whatsapp', '0300 123 4567', MENSAJE_WHATSAPP],
    ['correo', 'x', 'Correo de la empresa no válido.'],
    ['correo', 'a@b', 'Correo de la empresa no válido.'],
    ['correo', 'a b@example.com', 'Correo de la empresa no válido.'],
    ['sitio_web', 'javascript:alert(1)', MENSAJE_URL],
    ['sitio_web', 'JavaScript:alert(1)', MENSAJE_URL],
    ['sitio_web', 'data:text/html,x', MENSAJE_URL],
    ['sitio_web', 'ftp://example.com', MENSAJE_URL],
    ['sitio_web', 'https://exa mple.com', MENSAJE_URL],
    ['sitio_web', 'https://', MENSAJE_URL],
    ['sitio_web', 'https://[abc', MENSAJE_URL],
    ['sitio_web', 'example.com]', MENSAJE_URL],
    ['sitio_web', 'https://[1.2.3.4]/', MENSAJE_URL],
    ['sitio_web', 'https://x[::1]/', MENSAJE_URL],
    ['sitio_web', 'https://exa\u2100mple.com', MENSAJE_URL],
    ['sitio_web', 'https://ex\uff0fample.com', MENSAJE_URL],
    ['sitio_web', 'https://[1::2::3]/', MENSAJE_URL],
    ['sitio_web', 'https://[::1]x/', MENSAJE_URL],
    ['sitio_web', 'https://[]/', MENSAJE_URL],
    ['sitio_web', 'https://[V1.x]/', MENSAJE_URL],
    ['sitio_web', 'example.com:abc', MENSAJE_URL],
    ['nombre_comercial', '😀'.repeat(121), 'Nombre comercial: máximo 120 caracteres.'],
    ['color_acento', 'red;', MENSAJE_COLOR],
    ['color_acento', '#12345', MENSAJE_COLOR],
    ['color_acento', 'rgb(10, 20, 30)', MENSAJE_COLOR],
    ['sitio_web', 'a'.repeat(196) + '.com', 'Página web: máximo 200 caracteres.'],
    ['nombre_comercial', ['lista'], 'Nombre comercial: debe ser un texto.'],
  ];
  for (const [campo, valor, mensaje] of malos) {
    assert.deepEqual(validarCampoEmpresa(campo, valor), { valor: null, error: mensaje }, `${campo}: ${JSON.stringify(valor)}`);
  }

  // C1: sitio_web sin esquema recibe https://.
  assert.equal(validarCampoEmpresa('sitio_web', 'example.com').valor, 'https://example.com');
  // El correo es el de clientes.correo_valido (RP4, RP21).
  assert.equal(correoValido(' a@b.co '), true);
  assert.equal(correoValido('a@@b.co'), false);
  assert.equal(correoValido(null), false);
  // Los campos del formulario, con su etiqueta y máximo (el orden de empresa.CAMPOS).
  assert.deepEqual(Object.keys(CAMPOS_EMPRESA), ['nombre_comercial', 'razon_social', 'nit', 'direccion', 'ciudad',
    'telefono', 'whatsapp', 'correo', 'sitio_web', 'color_principal', 'color_secundario', 'color_acento',
    'terminos_cotizacion', 'terminos_pedido', 'instrucciones_pago', 'mensaje_pie']);
  assert.deepEqual(CAMPOS_EMPRESA.sitio_web, { etiqueta: 'Página web', maximo: 200, largo: false });
  assert.deepEqual(CAMPOS_EMPRESA.mensaje_pie, { etiqueta: 'Mensaje de pie', maximo: 200, largo: true });
}

console.log('--- TEST 4: cambiosDelFormulario ---');
{
  const original = { nombre_comercial: 'DEMO', nit: '900.123.456-7', correo: '', sitio_web: 'https://example.com',
    puede_editar: true, logo_url: '/x' };
  assert.deepEqual(cambiosDelFormulario(original, { ...original }), {}, 'sin cambios');
  assert.deepEqual(cambiosDelFormulario(original, { ...original, nombre_comercial: '  DEMO ' }), {}, 'se compara con trim');
  assert.deepEqual(
    cambiosDelFormulario(original, { ...original, nombre_comercial: ' DEMO 2 ', correo: 'v@example.com', nit: '' }),
    { nombre_comercial: 'DEMO 2', correo: 'v@example.com', nit: '' },
    'solo los campos cambiados (vaciar uno también es un cambio)',
  );
  assert.deepEqual(cambiosDelFormulario(original, { ...original, puede_editar: false, logo_url: '/y' }), {},
    'solo los campos de la empresa');
  assert.deepEqual(cambiosDelFormulario({}, { ciudad: 'Bogotá' }), { ciudad: 'Bogotá' });
  assert.deepEqual(cambiosDelFormulario(null, undefined), {});
}

console.log('--- TEST 5: validarArchivoLogo ---');
{
  assert.equal(validarArchivoLogo({ type: 'image/png', size: 120 * 1024 }), null);
  assert.equal(validarArchivoLogo({ type: 'image/jpeg', size: 300 * 1024 }), null, '300 KB justos');
  assert.equal(validarArchivoLogo({ type: 'image/webp', size: 1 }), null);
  assert.equal(validarArchivoLogo({ type: 'image/svg+xml', size: 1000 }), 'El logo debe ser una imagen PNG, JPG o WebP.');
  assert.equal(validarArchivoLogo({ type: 'image/gif', size: 1000 }), 'El logo debe ser una imagen PNG, JPG o WebP.');
  assert.equal(validarArchivoLogo({ type: 'image/png', size: 400 * 1024 }), 'El logo pesa 400 KB; el máximo es 300 KB.');
  assert.equal(validarArchivoLogo({ type: 'image/png', size: 300 * 1024 + 1 }), 'El logo pesa 301 KB; el máximo es 300 KB.');
  assert.equal(validarArchivoLogo(null), 'El logo debe ser una imagen PNG, JPG o WebP.');
}

console.log('--- TEST 6: urlLogo ---');
{
  assert.equal(urlLogo(normalizarMarca(PERFIL), 'http://localhost:8030/api/v1'),
    'http://localhost:8030/api/v1/publico/empresa/logo?v=abc123def456');
  assert.equal(urlLogo(PERFIL, 'http://localhost:8030/api/v1/'),
    'http://localhost:8030/api/v1/publico/empresa/logo?v=abc123def456', 'sin doble barra');
  assert.equal(urlLogo(MARCA_VACIA, 'http://x/api/v1'), null, 'sin logo');
  assert.equal(urlLogo({ logo_url: 'https://cdn.example.com/l.png' }, 'http://x'), 'https://cdn.example.com/l.png');
  assert.equal(urlLogo({ logo_url: '//evil.example/l.png' }, 'http://x'), null);
  assert.equal(urlLogo(null, 'http://x'), null);
}

console.log('--- TEST 7: sin apiFetch ni URL de producción escrita a mano ---');
{
  const fuente = readFileSync(join(SRC, 'lib', 'marca-empresa.js'), 'utf8');
  assert.doesNotMatch(fuente, /from '\.\/api|apiFetch\s*\(|nebulaekids|['"]Authorization['"]/,
    'sin apiFetch, sin la URL fija y sin el encabezado de sesión');
}

console.log('✓ Todas las pruebas de la marca de la empresa pasaron.');
