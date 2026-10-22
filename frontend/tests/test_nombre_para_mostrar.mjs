/**
 * frontend/tests/test_nombre_para_mostrar.mjs
 * B3 T20b (parte A, decisión del usuario en la revisión visual): el «Nombre para mostrar» de cada usuario, que llena
 * la Administración en Empleados y que el cliente ve en sus documentos (backend: app/core/nombre_para_mostrar.py y
 * PATCH /auth/users/{id}/nombre-para-mostrar, solo ADMIN).
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ETIQUETA_NOMBRE_PARA_MOSTRAR, AYUDA_NOMBRE_PARA_MOSTRAR, normalizarNombreParaMostrar, nombreParaMostrarCambio,
  cuerpoNombreParaMostrar, puedeEditarNombreParaMostrar,
} from '../src/lib/nombre-para-mostrar.js';

console.log('--- TEST 1: los textos exactos ---');
{
  assert.equal(ETIQUETA_NOMBRE_PARA_MOSTRAR, 'Nombre para mostrar');
  assert.equal(AYUDA_NOMBRE_PARA_MOSTRAR,
    'Así verá el cliente a su asesor en los documentos. Si lo dejas vacío, verá «Tu asesor».');
}

console.log('--- TEST 2: normalizar (los bordes fuera, los espacios de adentro juntos, como el servidor) ---');
{
  assert.equal(normalizarNombreParaMostrar('  Laura    Gómez '), 'Laura Gómez');
  assert.equal(normalizarNombreParaMostrar(' Laura\tGómez\n'), 'Laura Gómez');
  assert.equal(normalizarNombreParaMostrar('Laura Gómez'), 'Laura Gómez');
  for (const vacio of ['', '   ', null, undefined, 5, {}]) {
    assert.equal(normalizarNombreParaMostrar(vacio), '', String(vacio));
  }
}

console.log('--- TEST 3: si cambió (lo que se guardaría contra lo guardado) ---');
{
  assert.equal(nombreParaMostrarCambio(null, ''), false);
  assert.equal(nombreParaMostrarCambio(null, '   '), false);
  assert.equal(nombreParaMostrarCambio(undefined, ''), false);
  assert.equal(nombreParaMostrarCambio('Laura Gómez', '  Laura   Gómez '), false, 'solo espacios: no cambió');
  assert.equal(nombreParaMostrarCambio('Laura Gómez', 'Laura G.'), true);
  assert.equal(nombreParaMostrarCambio(null, 'Laura'), true);
  assert.equal(nombreParaMostrarCambio('Laura', ''), true, 'borrarlo es un cambio');
  assert.equal(nombreParaMostrarCambio('Laura', 'laura'), true, 'las mayúsculas sí cuentan: es lo que ve el cliente');
}

console.log('--- TEST 4: el cuerpo del PATCH (vacío viaja como null) ---');
{
  assert.deepEqual(cuerpoNombreParaMostrar('  Laura   Gómez '), { nombre_para_mostrar: 'Laura Gómez' });
  assert.deepEqual(cuerpoNombreParaMostrar('   '), { nombre_para_mostrar: null });
  assert.deepEqual(cuerpoNombreParaMostrar(null), { nombre_para_mostrar: null });
}

console.log('--- TEST 5: solo un ADMIN lo edita (espejo de normalize_role) ---');
{
  for (const rol of ['admin', 'Admin', ' ADMIN ']) assert.equal(puedeEditarNombreParaMostrar(rol), true, rol);
  for (const rol of ['asesor', 'Vendedor', 'finanzas', 'compras', '', null, undefined, 1]) {
    assert.equal(puedeEditarNombreParaMostrar(rol), false, String(rol));
  }
}

console.log('--- TEST 6: el campo de Empleados (componente nuevo; la página solo lo monta, R15) ---');
{
  const campo = readFileSync(new URL('../src/app/dashboard/admin/empleados/nombre-para-mostrar.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.ok(campo.includes("from '@/lib/nombre-para-mostrar'"), 'la lógica viene de la lib');
  for (const simbolo of ['ETIQUETA_NOMBRE_PARA_MOSTRAR', 'AYUDA_NOMBRE_PARA_MOSTRAR', 'nombreParaMostrarCambio(',
    'cuerpoNombreParaMostrar(', 'puedeEditarNombreParaMostrar(']) {
    assert.ok(campo.includes(simbolo), simbolo);
  }
  assert.ok(campo.includes('/nombre-para-mostrar`') && campo.includes("method: 'PATCH'"), 'el PATCH del servidor');
  assert.equal((campo.match(/<[a-z]+ [^>]*role="alert"/g) || []).length, 1, 'una sola región de errores');
  assert.ok(/<div role="alert"[^>]*>\{error \? <p [^>]*>\{error\}<\/p> : null\}<\/div>/.test(campo),
    'la región role="alert" siempre montada; solo cambia su contenido');
  assert.ok(/\{puedeEditar && \(/.test(campo) && campo.includes('>Guardar<'), '«Guardar» solo para un ADMIN');
  assert.ok(campo.includes('readOnly={!puedeEditar}'), 'sin ADMIN, el campo se ve pero no se edita');
  assert.ok(campo.includes('aria-describedby={ayudaId}'), 'la ayuda ligada al campo');
  assert.ok(campo.indexOf('useEffect(') > 0 && campo.indexOf("'user_role'") > campo.indexOf('useEffect('),
    'el rol se lee en el navegador, después de montar (sin desajuste de hidratación)');

  const pagina = readFileSync(new URL('../src/app/dashboard/admin/empleados/page.tsx', import.meta.url), 'utf8')
    .replace(/\r\n/g, '\n');
  assert.ok(pagina.includes("import { CampoNombreParaMostrar } from './nombre-para-mostrar';"), 'la página lo importa');
  assert.ok(/<CampoNombreParaMostrar usuario=\{selectedUser\}/.test(pagina), 'junto al usuario elegido');
}

console.log('OK test_nombre_para_mostrar');
