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
  // B4 T7 (D27) y r1 (m10 y m13): la tabla estándar del Hub tiene la columna del asesor del documento (su id, su título
  // y su campo de orden del servidor): no es un rol. La excepción vale SOLO en page.tsx y quita SOLO ese literal exacto,
  // una vez; en los otros cinco archivos la guarda queda como en 372f71c, y cualquier otro 'asesor' o 'admin' de
  // page.tsx la sigue haciendo fallar.
  const PAGINA_HUB = 'app/dashboard/ventas/page.tsx';
  const COLUMNA_ASESOR = "{ id: 'asesor', titulo: 'Asesor', ancho: 120, ordenable: 'asesor',";
  assert.equal(hub.split(COLUMNA_ASESOR).length - 1, 1, 'la columna del asesor del Hub, una sola vez');
  const sinColumnaAsesor = (ruta, fuente) => (ruta === PAGINA_HUB ? fuente.replace(COLUMNA_ASESOR, '{') : fuente);
  // Y el Hub decide «Ajustar tiempos» con la misma regla (RP34).
  assert.ok(hub.includes('const accionAjustar = esAdmin(getUsuarioActual().role)'), '«Ajustar tiempos» usa esAdmin');
  for (const ruta of ['app/dashboard/ventas/flujo.tsx', PAGINA_HUB, 'lib/seguimiento.js',
    'lib/nombre-para-mostrar.js', 'lib/dinero-ventas.js', 'lib/envio-whatsapp.js']) {
    assert.doesNotMatch(sinColumnaAsesor(ruta, codigo(leer(ruta))), /['"](admin|asesor|vendedor|finanzas)['"]/i, `${ruta}: sin un rol escrito a mano`);
  }
  // La excepción no tapa un rol de verdad: ni en page.tsx (otro literal) ni en los otros archivos (ni el mismo).
  assert.match(sinColumnaAsesor(PAGINA_HUB, "if (rol === 'asesor') x();"), /['"]asesor['"]/i);
  assert.match(sinColumnaAsesor(PAGINA_HUB, `${COLUMNA_ASESOR} celda: x }, { id: 'admin', titulo: 'Admin' }`), /['"]admin['"]/i);
  assert.match(sinColumnaAsesor(PAGINA_HUB, `${COLUMNA_ASESOR} x }, ${COLUMNA_ASESOR} y }`), /['"]asesor['"]/i, 'solo una vez');
  assert.match(sinColumnaAsesor('lib/seguimiento.js', COLUMNA_ASESOR), /['"]asesor['"]/i, 'solo en page.tsx');
}

// ── B4 T23A r1 (I1, I2, m15): accesoTienda(rol): lo que cada rol puede pedir y hacer en E-Commerce, de la lista EXACTA de
// require_roles de cada endpoint de backend/app/api/v1/ecommerce.py (stats y carritos: ADMIN y ASESOR; pedidos: ADMIN, ASESOR,
// FINANZAS y BODEGA; GET del catálogo: sin guardia de rol; POST, PATCH y DELETE del catálogo: solo ADMIN).
console.log('--- T23A r1: accesoTienda ---');
{
  const roles = await import('../src/lib/roles.js');
  // B4 T24 (FINAL-m21, D27): con pagosConfig (la pestaña Pagos, solo ADMIN), aditivo.
  const sin = { listo: true, indicadores: false, carritos: false, pedidos: false, catalogo: true, editarCatalogo: false, pagosConfig: false };
  assert.deepEqual(roles.accesoTienda('ADMIN'), { ...sin, indicadores: true, carritos: true, pedidos: true, editarCatalogo: true, pagosConfig: true });
  assert.deepEqual(roles.accesoTienda('ASESOR'), { ...sin, indicadores: true, carritos: true, pedidos: true });
  assert.deepEqual(roles.accesoTienda('FINANZAS'), { ...sin, pedidos: true });
  assert.deepEqual(roles.accesoTienda('BODEGA'), { ...sin, pedidos: true });
  assert.deepEqual(roles.accesoTienda('COMPRAS'), sin);
  assert.deepEqual(roles.accesoTienda('CONSULTA'), sin);
  // Los nombres viejos y los espacios (normalize_role): Vendedor es ASESOR, Admin es ADMIN.
  assert.deepEqual(roles.accesoTienda('Vendedor'), roles.accesoTienda('ASESOR'));
  assert.deepEqual(roles.accesoTienda(' Admin '), roles.accesoTienda('ADMIN'));
  // Durante la hidratación (rol vacío o que no es texto): nada listo y nada se pide.
  for (const nada of ['', '   ', null, undefined, 7]) {
    assert.deepEqual(roles.accesoTienda(nada), { listo: false, indicadores: false, carritos: false, pedidos: false, catalogo: false, editarCatalogo: false, pagosConfig: false }, String(nada));
  }
  // Un rol desconocido está listo pero sin nada de lo restringido.
  assert.deepEqual(roles.accesoTienda('INVENTADO'), sin);
  // Inmutable: un objeto nuevo en cada llamada no compartido.
  assert.notEqual(roles.accesoTienda('ADMIN'), roles.accesoTienda('ADMIN'));
}

// ── B4 T23B: lo que cada rol puede pedir en Seguimientos, Marketing y el Asistente omnicanal, de la lista EXACTA de require_roles de
// cada endpoint: GET /crm/leads (crm.py:1378: ADMIN y ASESOR), todo /marketing/* (marketing.py: ADMIN y ASESOR, salvo el DELETE de
// una campaña: solo ADMIN) y /chat/search-customers, /customer-context, /create-customer-request y /ai-copilot-suggest (chat.py: ADMIN
// y ASESOR). Rol vacío (hidratación) o que no es texto: nada listo y nada se pide.
console.log('--- T23B: accesoSeguimientos, accesoMarketing y accesoAsistente ---');
{
  const roles = await import('../src/lib/roles.js');
  const nadie = ['', '   ', null, undefined, 7];
  // Seguimientos
  assert.deepEqual(roles.accesoSeguimientos('ADMIN'), { listo: true, leads: true });
  assert.deepEqual(roles.accesoSeguimientos('ASESOR'), { listo: true, leads: true });
  for (const r of ['FINANZAS', 'BODEGA', 'COMPRAS', 'CONSULTA', 'INVENTADO']) assert.deepEqual(roles.accesoSeguimientos(r), { listo: true, leads: false }, r);
  assert.deepEqual(roles.accesoSeguimientos('Vendedor'), roles.accesoSeguimientos('ASESOR'));
  for (const r of nadie) assert.deepEqual(roles.accesoSeguimientos(r), { listo: false, leads: false }, String(r));
  // Marketing
  assert.deepEqual(roles.accesoMarketing('ADMIN'), { listo: true, ver: true, eliminarCampana: true });
  assert.deepEqual(roles.accesoMarketing('ASESOR'), { listo: true, ver: true, eliminarCampana: false });
  for (const r of ['FINANZAS', 'BODEGA', 'COMPRAS', 'CONSULTA', 'INVENTADO']) assert.deepEqual(roles.accesoMarketing(r), { listo: true, ver: false, eliminarCampana: false }, r);
  assert.deepEqual(roles.accesoMarketing(' Admin '), roles.accesoMarketing('ADMIN'));
  for (const r of nadie) assert.deepEqual(roles.accesoMarketing(r), { listo: false, ver: false, eliminarCampana: false }, String(r));
  // Asistente omnicanal
  assert.deepEqual(roles.accesoAsistente('ADMIN'), { listo: true, contexto: true });
  assert.deepEqual(roles.accesoAsistente('ASESOR'), { listo: true, contexto: true });
  for (const r of ['FINANZAS', 'BODEGA', 'COMPRAS', 'CONSULTA', 'INVENTADO']) assert.deepEqual(roles.accesoAsistente(r), { listo: true, contexto: false }, r);
  for (const r of nadie) assert.deepEqual(roles.accesoAsistente(r), { listo: false, contexto: false }, String(r));
  assert.notEqual(roles.accesoMarketing('ADMIN'), roles.accesoMarketing('ADMIN'));
}

// ── B4 T24 (paquete f1: FINAL-C5, FINAL-m37 + F96, FINAL-m21, FINAL-m23, FINAL-m31, FINAL-m38, FINAL-m10 y F108): un acceso por pantalla,
// de la lista EXACTA de require_roles de cada endpoint (comprobada en backend/app en el carril, solo lectura). Rol vacío (hidratación) o
// que no es texto: nada listo y nada se pide ni se ofrece; un rol desconocido está listo pero sin nada de lo restringido.
const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'BODEGA', 'COMPRAS', 'CONSULTA', 'INVENTADO'];
const NADIE = ['', '   ', null, undefined, 7];
console.log('--- T24 (FINAL-C5): accesoFinanzas ---');
{
  const roles = await import('../src/lib/roles.js');
  // finance.py: GET y POST /finance/expenses (y /analisis, /dashboard…) son de ADMIN y FINANZAS.
  for (const r of TODOS) assert.deepEqual(roles.accesoFinanzas(r), { listo: true, gastos: r === 'ADMIN' || r === 'FINANZAS' }, r);
  assert.deepEqual(roles.accesoFinanzas('Finanzas'), roles.accesoFinanzas('FINANZAS'), 'el nombre viejo');
  assert.deepEqual(roles.accesoFinanzas(' admin '), roles.accesoFinanzas('ADMIN'));
  for (const r of NADIE) assert.deepEqual(roles.accesoFinanzas(r), { listo: false, gastos: false }, String(r));
  assert.notEqual(roles.accesoFinanzas('ADMIN'), roles.accesoFinanzas('ADMIN'), 'un objeto nuevo');
}

console.log('--- T24 (FINAL-m37 y F96): accesoCrm ---');
{
  const roles = await import('../src/lib/roles.js');
  // crm.py: GET /leads, GET /analisis, POST /leads y PATCH /leads/{id}/stage (y /v2, to-solicitud…): ADMIN y ASESOR; GET /warmup,
  // DELETE /leads/{id} y GET/PUT /pipeline-stages/…/config: solo ADMIN.
  const nada = { listo: true, leads: false, analisis: false, crear: false, mover: false, warmup: false, borrar: false, config: false };
  assert.deepEqual(roles.accesoCrm('ADMIN'), { listo: true, leads: true, analisis: true, crear: true, mover: true, warmup: true, borrar: true, config: true });
  assert.deepEqual(roles.accesoCrm('ASESOR'), { ...nada, leads: true, analisis: true, crear: true, mover: true });
  assert.deepEqual(roles.accesoCrm('Vendedor'), roles.accesoCrm('ASESOR'), 'el nombre viejo del asesor');
  for (const r of ['FINANZAS', 'BODEGA', 'COMPRAS', 'CONSULTA', 'INVENTADO']) assert.deepEqual(roles.accesoCrm(r), nada, r);
  for (const r of NADIE) {
    assert.deepEqual(roles.accesoCrm(r), { ...nada, listo: false }, String(r));
  }
}

console.log('--- T24 (FINAL-m21): accesoTienda.pagosConfig ---');
{
  const roles = await import('../src/lib/roles.js');
  // ecommerce.py: GET y PATCH /pagos/config y /envios/config son solo de ADMIN. Aditivo: lo demás de accesoTienda no cambia (T23A).
  for (const r of TODOS) assert.equal(roles.accesoTienda(r).pagosConfig, r === 'ADMIN', r);
  for (const r of NADIE) assert.equal(roles.accesoTienda(r).pagosConfig, false, String(r));
  assert.equal(roles.accesoTienda(' Admin ').pagosConfig, true);
}

console.log('--- T24 (FINAL-m23): accesoCopilot ---');
{
  const roles = await import('../src/lib/roles.js');
  // chat.py: POST /chat/copilot/query es de ADMIN, ASESOR y FINANZAS.
  for (const r of TODOS) assert.deepEqual(roles.accesoCopilot(r), { listo: true, consultar: ['ADMIN', 'ASESOR', 'FINANZAS'].includes(r) }, r);
  assert.deepEqual(roles.accesoCopilot('Vendedor'), { listo: true, consultar: true });
  for (const r of NADIE) assert.deepEqual(roles.accesoCopilot(r), { listo: false, consultar: false }, String(r));
}

console.log('--- T24 (FINAL-m31 y FINAL-m38): accesoTableroVentas ---');
{
  const roles = await import('../src/lib/roles.js');
  // erp_ventas.py: PATCH /solicitudes/{id} y /cotizaciones/{id}: ADMIN y ASESOR; PATCH /pedidos/{id}: ADMIN, ASESOR y BODEGA, pero BODEGA
  // solo a ENTREGADO con la bodega (403 con otro estado): ese despacho es de Entregas; en los tableros de Ventas BODEGA solo ve.
  const texto = roles.TEXTO_TABLERO_SOLO_VER;
  assert.equal(texto, 'Tu rol solo puede ver este tablero');
  for (const r of TODOS) {
    const mueve = r === 'ADMIN' || r === 'ASESOR';
    assert.deepEqual(roles.accesoTableroVentas(r), { listo: true, mover: mueve, soloLectura: mueve ? null : texto }, r);
  }
  assert.deepEqual(roles.accesoTableroVentas('Vendedor'), roles.accesoTableroVentas('ASESOR'));
  // Mientras se lee el rol: nada listo y el tablero, solo para ver (nunca se ofrece mover a quien quizá no puede).
  for (const r of NADIE) assert.deepEqual(roles.accesoTableroVentas(r), { listo: false, mover: false, soloLectura: texto }, String(r));
}

console.log('--- T24 (FINAL-m10, FINAL-m31 y FINAL-m38): accesoCompras ---');
{
  const roles = await import('../src/lib/roles.js');
  // erp_compras.py: PATCH y DELETE /pedidos/{id} (cambiarPec: emitir, cancelar, eliminar, el arrastre) y PATCH /pedidos/{id}/tracking
  // (tracking: las etapas de Tránsito): ADMIN y COMPRAS. GET /pedidos es de todos los roles del ERP.
  const texto = roles.TEXTO_TABLERO_SOLO_VER;
  for (const r of TODOS) {
    const puede = r === 'ADMIN' || r === 'COMPRAS';
    assert.deepEqual(roles.accesoCompras(r), { listo: true, cambiarPec: puede, tracking: puede, soloLectura: puede ? null : texto }, r);
  }
  assert.deepEqual(roles.accesoCompras(' compras '), roles.accesoCompras('COMPRAS'));
  for (const r of NADIE) assert.deepEqual(roles.accesoCompras(r), { listo: false, cambiarPec: false, tracking: false, soloLectura: texto }, String(r));
}

console.log('--- T24 (F108): accesoProveedores ---');
{
  const roles = await import('../src/lib/roles.js');
  // erp_compras.py: POST, PATCH y DELETE /compras/proveedores son de ADMIN y COMPRAS (el GET, de todos).
  for (const r of TODOS) assert.deepEqual(roles.accesoProveedores(r), { listo: true, editar: r === 'ADMIN' || r === 'COMPRAS' }, r);
  for (const r of NADIE) assert.deepEqual(roles.accesoProveedores(r), { listo: false, editar: false }, String(r));
}

console.log('--- T24 (FINAL-m31): puedeCobrarSaldo es esAdminOAsesor (una sola copia de la regla) ---');
{
  const roles = await import('../src/lib/roles.js');
  const entregas = await import('../src/lib/entregas.js');
  assert.equal(entregas.puedeCobrarSaldo, roles.esAdminOAsesor, 'entregas.js reexporta la MISMA función');
}

console.log('OK test_roles.mjs');
