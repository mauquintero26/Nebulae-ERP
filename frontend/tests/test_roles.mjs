/**
 * frontend/tests/test_roles.mjs
 * Revisión final B3 (F2, M12 y M52): lib/roles.js, las reglas de rol de las pantallas sobre normalizarRol (lib/chatter.js,
 * espejo de normalize_role de backend/app/api/dependencies.py): esAdmin, esAdminOAsesor y puedeCrearOrdenDePago.
 * flujo.tsx, seguimiento.js, nombre-para-mostrar.js y dinero-ventas.js las reexportan con sus nombres de siempre, y el
 * ConfigPanel del Hub usa esAdmin: nadie duplica la regla.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { esAdmin, esAdminOAsesor, puedeCrearOrdenDePago } from '../src/lib/roles.js';
import { esAdminOAsesor as esAdminOAsesorDeSeguimiento } from '../src/lib/seguimiento.js';
import { puedeEditarNombreParaMostrar } from '../src/lib/nombre-para-mostrar.js';
import { puedeGestionarCotizacion } from '../src/lib/dinero-ventas.js';

// Los nombres viejos (Admin, Vendedor, ERP, Finanzas, Mercadeo) y los canónicos, sin importar mayúsculas ni los bordes.
const RAROS = ['', '   ', null, undefined, 1, {}, ['admin']];

console.log('--- TEST 1: esAdmin (solo la Administración) ---');
{
  for (const rol of ['admin', 'Admin', 'ADMIN', ' admin ', '\tAdmin\n']) assert.equal(esAdmin(rol), true, rol);
  for (const rol of ['asesor', 'Vendedor', 'finanzas', 'compras', 'ERP', 'bodega', 'consulta', 'mercadeo', 'administrador',
    ...RAROS]) {
    assert.equal(esAdmin(rol), false, String(rol));
  }
}

console.log('--- TEST 2: esAdminOAsesor (la Administración y el asesor; Vendedor es el nombre viejo del asesor) ---');
{
  for (const rol of ['admin', 'Admin', 'ADMIN', 'asesor', 'Asesor', 'ASESOR', 'vendedor', 'Vendedor', ' vendedor ']) {
    assert.equal(esAdminOAsesor(rol), true, rol);
  }
  for (const rol of ['finanzas', 'compras', 'ERP', 'bodega', 'consulta', 'mercadeo', 'contador', ...RAROS]) {
    assert.equal(esAdminOAsesor(rol), false, String(rol));
  }
}

console.log('--- TEST 3: puedeCrearOrdenDePago (Administración, Finanzas y el asesor) ---');
{
  for (const rol of ['admin', 'Admin', 'finanzas', 'Finanzas', 'FINANZAS', 'asesor', 'ASESOR', 'vendedor', 'Vendedor ']) {
    assert.equal(puedeCrearOrdenDePago(rol), true, rol);
  }
  for (const rol of ['compras', 'ERP', 'bodega', 'consulta', 'mercadeo', ...RAROS]) {
    assert.equal(puedeCrearOrdenDePago(rol), false, String(rol));
  }
}

console.log('--- TEST 4: las libs reexportan la MISMA función (no una copia) ---');
{
  assert.equal(esAdminOAsesorDeSeguimiento, esAdminOAsesor, 'seguimiento.js');
  assert.equal(puedeEditarNombreParaMostrar, esAdmin, 'nombre-para-mostrar.js');
  assert.equal(puedeGestionarCotizacion, esAdminOAsesor, 'dinero-ventas.js');
}

console.log('--- TEST 5: la fuente: una sola regla sobre normalizarRol ---');
{
  const leer = (ruta) => readFileSync(new URL(`../src/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Sin los comentarios ({/* */}, /* */ y //): un comentario puede nombrar un rol.
  const codigo = (fuente) => fuente.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  const roles = leer('lib/roles.js');
  assert.ok(roles.includes("import { normalizarRol } from './chatter.js';"), 'roles.js se apoya en normalizarRol');
  const flujo = leer('app/dashboard/ventas/flujo.tsx');
  assert.ok(/export \{[^}]*\besAdminOAsesor as esAsesorElegible\b[^}]*\} from '@\/lib\/roles';/.test(flujo),
    'flujo.tsx: esAsesorElegible es esAdminOAsesor');
  assert.ok(/export \{[^}]*\besAdmin as esAdministrador\b[^}]*\} from '@\/lib\/roles';/.test(flujo),
    'flujo.tsx: esAdministrador es esAdmin');
  assert.ok(/export \{[^}]*\bpuedeCrearOrdenDePago\b[^}]*\} from '@\/lib\/roles';/.test(flujo), 'flujo.tsx: la orden de pago');
  assert.ok(/export \{ esAdminOAsesor \} from '\.\/roles\.js';/.test(leer('lib/seguimiento.js')), 'seguimiento.js');
  assert.ok(/export \{ esAdmin as puedeEditarNombreParaMostrar \} from '\.\/roles\.js';/.test(leer('lib/nombre-para-mostrar.js')),
    'nombre-para-mostrar.js');
  assert.ok(/export \{ esAdminOAsesor as puedeGestionarCotizacion \} from '\.\/roles\.js';/.test(leer('lib/dinero-ventas.js')),
    'dinero-ventas.js');
  const hub = leer('app/dashboard/ventas/page.tsx');
  assert.ok(hub.includes('const soloLectura = !esAdmin(getUsuarioActual().role);'), 'el ConfigPanel del Hub usa esAdmin');
  for (const ruta of ['app/dashboard/ventas/flujo.tsx', 'app/dashboard/ventas/page.tsx', 'lib/seguimiento.js',
    'lib/nombre-para-mostrar.js', 'lib/dinero-ventas.js', 'lib/envio-whatsapp.js']) {
    assert.doesNotMatch(codigo(leer(ruta)), /['"](admin|asesor|vendedor|finanzas)['"]/i, `${ruta}: sin un rol escrito a mano`);
  }
}

console.log('OK test_roles.mjs');
