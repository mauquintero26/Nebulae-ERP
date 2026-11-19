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
  // B4 T24 f2 r1 (m18, D27): con el rol leído después de montar (useRolActual), no getUsuarioActual().role en el render.
  assert.ok(hub.includes('const soloLectura = !esAdmin(useRolActual());'), 'el ConfigPanel del Hub usa esAdmin');
  // B4 T7 (D27) y r1 (m10 y m13): la tabla estándar del Hub tiene la columna del asesor del documento (su id, su título
  // y su campo de orden del servidor): no es un rol. La excepción vale SOLO en page.tsx y quita SOLO ese literal exacto,
  // una vez; en los otros cinco archivos la guarda queda como en 372f71c, y cualquier otro 'asesor' o 'admin' de
  // page.tsx la sigue haciendo fallar.
  const PAGINA_HUB = 'app/dashboard/ventas/page.tsx';
  const COLUMNA_ASESOR = "{ id: 'asesor', titulo: 'Asesor', ancho: 120, ordenable: 'asesor',";
  assert.equal(hub.split(COLUMNA_ASESOR).length - 1, 1, 'la columna del asesor del Hub, una sola vez');
  const sinColumnaAsesor = (ruta, fuente) => (ruta === PAGINA_HUB ? fuente.replace(COLUMNA_ASESOR, '{') : fuente);
  // Y el Hub decide «Ajustar tiempos» con la misma regla (RP34).
  assert.ok(hub.includes('const accionAjustar = esAdmin(rol)'), '«Ajustar tiempos» usa esAdmin (m18, D27: con el rol de useRolActual)');
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
  // B4 T24 (F104, D27): sin `catalogo` (GET /catalogo no tiene guardia de rol y ninguna pantalla lo leía).
  const sin = { listo: true, indicadores: false, carritos: false, pedidos: false, editarCatalogo: false, pagosConfig: false };
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
    assert.deepEqual(roles.accesoTienda(nada), { listo: false, indicadores: false, carritos: false, pedidos: false, editarCatalogo: false, pagosConfig: false }, String(nada));
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
  // DELETE /leads/{id} y GET/PUT /pipeline-stages/…/config: solo ADMIN. r1 (m32): el Análisis y mover tienen el MISMO require_roles que
  // GET /leads, así que `leads` los cubre (sin campos que ninguna pantalla lee).
  const nada = { listo: true, leads: false, crear: false, warmup: false, borrar: false, config: false };
  assert.deepEqual(roles.accesoCrm('ADMIN'), { listo: true, leads: true, crear: true, warmup: true, borrar: true, config: true });
  assert.deepEqual(roles.accesoCrm('ASESOR'), { ...nada, leads: true, crear: true });
  assert.ok(!('analisis' in roles.accesoCrm('ADMIN')) && !('mover' in roles.accesoCrm('ADMIN')), 'm32: sin analisis ni mover');
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
  assert.equal(texto, 'Tu rol solo puede ver este tablero.', 'r1 (m37): con punto final');
  for (const r of TODOS) {
    const mueve = r === 'ADMIN' || r === 'ASESOR';
    assert.deepEqual(roles.accesoTableroVentas(r), { listo: true, mover: mueve, soloLectura: mueve ? null : texto }, r);
  }
  assert.deepEqual(roles.accesoTableroVentas('Vendedor'), roles.accesoTableroVentas('ASESOR'));
  // r1 (m9 b): mientras se lee el rol (la hidratación), nada listo, nada se mueve y SIN el aviso «Tu rol solo puede ver este tablero»:
  // soloLectura es null (con rol vacío no se sabe todavía si puede).
  for (const r of NADIE) assert.deepEqual(roles.accesoTableroVentas(r), { listo: false, mover: false, soloLectura: null }, String(r));
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
  // r1 (m9 b): con rol vacío, soloLectura null (sin el aviso mientras se lee el rol).
  for (const r of NADIE) assert.deepEqual(roles.accesoCompras(r), { listo: false, cambiarPec: false, tracking: false, soloLectura: null }, String(r));
}

console.log('--- T24 (F108): accesoProveedores ---');
{
  const roles = await import('../src/lib/roles.js');
  // erp_compras.py: POST, PATCH y DELETE /compras/proveedores son de ADMIN y COMPRAS (el GET, de todos).
  for (const r of TODOS) assert.deepEqual(roles.accesoProveedores(r), { listo: true, editar: r === 'ADMIN' || r === 'COMPRAS' }, r);
  for (const r of NADIE) assert.deepEqual(roles.accesoProveedores(r), { listo: false, editar: false }, String(r));
}

console.log('--- T24 f4 r1 (I1): accesoClientes — la Agenda de clientes escribe solo con ADMIN y ASESOR ---');
{
  const roles = await import('../src/lib/roles.js');
  // crm.py: POST, PUT y DELETE /customers, POST /customers/{id}/solicitudes y POST /events son de ADMIN y ASESOR (el GET, de todos);
  // «Cotizar» lleva a POST /ventas/cotizaciones (erp_ventas.py), también de ADMIN y ASESOR.
  for (const r of TODOS) assert.deepEqual(roles.accesoClientes(r), { listo: true, editar: r === 'ADMIN' || r === 'ASESOR' }, r);
  for (const r of NADIE) assert.deepEqual(roles.accesoClientes(r), { listo: false, editar: false }, String(r));
  assert.deepEqual(roles.accesoClientes(' asesor '), { listo: true, editar: true }, 'normaliza el rol');
  const { readFileSync } = await import('node:fs');
  const crm = readFileSync(new URL('../../backend/app/api/v1/crm.py', import.meta.url), 'utf8');
  for (const firma of ['def create_customer(', 'def update_customer(', 'def delete_customer(', 'def create_customer_solicitud(', 'def create_event(']) {
    const linea = crm.split('\n').find((l) => l.startsWith(firma));
    assert.ok(linea && linea.includes('require_roles(*ROLE_ADMIN, *ROLE_ASESOR)'), `crm.py ${firma} es de ADMIN y ASESOR`);
  }
}

console.log('--- T24 r1 (m33): esAdminOCompras, una sola lista para Compras, y `listo` de una sola manera ---');
{
  const roles = await import('../src/lib/roles.js');
  for (const r of TODOS) assert.equal(roles.esAdminOCompras(r), r === 'ADMIN' || r === 'COMPRAS', r);
  assert.equal(roles.esAdminOCompras(' compras '), true);
  for (const r of NADIE) assert.equal(roles.esAdminOCompras(r), false, String(r));
  const { readFileSync } = await import('node:fs');
  const fuente = readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.equal((fuente.match(/'COMPRAS'/g) ?? []).length, 1, 'la lista ADMIN y COMPRAS, una sola vez (en esAdminOCompras)');
  assert.match(fuente, /export function accesoCompras\(rol\) \{\s*if \(normalizarRol\(rol\) === ''\) return/);
  assert.match(fuente, /export function accesoProveedores\(rol\) \{\s*if \(normalizarRol\(rol\) === ''\) return/);
  // Cada accesoX: `listo` con el return temprano del rol vacío (como accesoTienda); ninguno lo calcula en línea.
  const accesos = [...fuente.matchAll(/export function (acceso\w+)\(rol\) \{\s*([^\n]*)/g)];
  assert.ok(accesos.length >= 10, 'los accesoX');
  for (const [, nombre, primera] of accesos) {
    assert.ok(/^(?:const r = normalizarRol\(rol\);|if \(normalizarRol\(rol\) === ''\) return)/.test(primera), `${nombre}: ${primera}`);
  }
  assert.ok(!/listo: normalizarRol\(rol\) !== ''|const listo = normalizarRol/.test(fuente), 'sin `listo` en línea');
}

console.log('--- T24 (FINAL-m31): puedeCobrarSaldo es esAdminOAsesor (una sola copia de la regla) ---');
{
  const roles = await import('../src/lib/roles.js');
  const entregas = await import('../src/lib/entregas.js');
  assert.equal(entregas.puedeCobrarSaldo, roles.esAdminOAsesor, 'entregas.js reexporta la MISMA función');
}

console.log('--- B4 T24 f2 (duda 3 de f1): puedeAccionPedido — quién hace la acción principal de la tarjeta de un pedido, con el require_roles real ---');
{
  const { puedeAccionPedido } = await import('../src/lib/roles.js');
  assert.equal(typeof puedeAccionPedido, 'function', 'puedeAccionPedido existe');
  // backend/app/api/v1 (solo lectura): facturar = PATCH /ventas/pedidos/{id} a FACTURADO (ADMIN y ASESOR; BODEGA solo a ENTREGADO);
  // cobrar = POST /ventas/pedidos/{id}/crear-pxp (ADMIN, FINANZAS y ASESOR); comprar = POST /compras/pedidos (ADMIN y COMPRAS);
  // despachar = PATCH a ENTREGADO con la bodega, en Entregas (ADMIN, ASESOR y BODEGA); ver = GET (todos los roles del ERP).
  const ESPERADO = {
    facturar: ['ADMIN', 'ASESOR'],
    cobrar: ['ADMIN', 'FINANZAS', 'ASESOR'],
    comprar: ['ADMIN', 'COMPRAS'],
    despachar: ['ADMIN', 'ASESOR', 'BODEGA'],
    ver: ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'],
  };
  const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'];
  for (const [clave, roles] of Object.entries(ESPERADO)) {
    for (const rol of TODOS) assert.equal(puedeAccionPedido(clave, rol), roles.includes(rol), `${clave} ${rol}`);
    // Los nombres viejos y los bordes, como normalizarRol (Vendedor = ASESOR, Finanzas = FINANZAS).
    assert.equal(puedeAccionPedido(clave, ' vendedor '), roles.includes('ASESOR'), `${clave} Vendedor`);
  }
  for (const rol of RAROS) assert.equal(puedeAccionPedido('ver', rol), false, `ver con ${JSON.stringify(rol)}`);
  for (const clave of [null, undefined, '', 'otra', 'constructor']) assert.equal(puedeAccionPedido(clave, 'ADMIN'), false, String(clave));
}

console.log('--- B4 T24 f2 r1 (duda 2 + m15 + m16): puedeAccionDocumento — quién hace la acción principal de una tarjeta, con el require_roles real ---');
{
  const { puedeAccionDocumento, puedeAccionPedido } = await import('../src/lib/roles.js');
  assert.equal(typeof puedeAccionDocumento, 'function', 'puedeAccionDocumento existe');
  const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'];
  // backend/app/api/v1/erp_ventas.py (solo lectura, y lo vigila el final del bloque): las acciones de la SC y de la COT son de ADMIN
  // y ASESOR; abrir (GET, ver o esperar) es de todos los roles del ERP.
  const ESPERADO = {
    SC: {
      agregar_productos: ['ADMIN', 'ASESOR'], asignar: ['ADMIN', 'ASESOR'], enviar_confirmacion: ['ADMIN', 'ASESOR'], cotizar: ['ADMIN', 'ASESOR'],
      reiniciar_o_cotizar: ['ADMIN', 'ASESOR'], ver_ticket: TODOS, ver_pedido: TODOS, ver_cotizacion: TODOS, esperando: TODOS, ver_solicitud: TODOS,
    },
    COT: {
      completar_precios: ['ADMIN', 'ASESOR'], enviar_al_cliente: ['ADMIN', 'ASESOR'], crear_pedido: ['ADMIN', 'ASESOR'],
      esperando: TODOS, ver_pedido: TODOS,
    },
  };
  for (const [tipo, claves] of Object.entries(ESPERADO)) {
    for (const [clave, roles] of Object.entries(claves)) {
      for (const rol of TODOS) assert.equal(puedeAccionDocumento(tipo, clave, rol), roles.includes(rol), `${tipo} ${clave} ${rol}`);
      assert.equal(puedeAccionDocumento(tipo, clave, ' vendedor '), roles.includes('ASESOR'), `${tipo} ${clave} Vendedor`);
      for (const rol of RAROS) assert.equal(puedeAccionDocumento(tipo, clave, rol), false, `${tipo} ${clave} ${JSON.stringify(rol)}`);
    }
  }
  // Un pedido: la regla de la duda 3 (puedeAccionPedido), con VEN y con PVEN. ASESOR no gestiona la compra (create_pec: ADMIN y COMPRAS).
  for (const clave of ['facturar', 'cobrar', 'comprar', 'despachar', 'ver']) {
    for (const rol of TODOS) {
      assert.equal(puedeAccionDocumento('VEN', clave, rol), puedeAccionPedido(clave, rol), `VEN ${clave} ${rol}`);
      assert.equal(puedeAccionDocumento('PVEN', clave, rol), puedeAccionPedido(clave, rol), `PVEN ${clave} ${rol}`);
    }
  }
  assert.equal(puedeAccionDocumento('VEN', 'comprar', 'ASESOR'), false, 'm16: ASESOR no gestiona la compra');
  // Una clave de otro tipo, un tipo desconocido o una clave rara: false.
  for (const [tipo, clave] of [['SC', 'facturar'], ['COT', 'cotizar'], ['VEN', 'asignar'], ['OTRO', 'ver'], [null, 'ver'], ['SC', null], ['COT', 'constructor']]) {
    assert.equal(puedeAccionDocumento(tipo, clave, 'ADMIN'), false, `${tipo} ${clave}`);
  }
  // El require_roles real de cada endpoint de esas acciones (backend/app, solo lectura): si cambia, esta prueba lo dice.
  const ventas = readFileSync(new URL('../../backend/app/api/v1/erp_ventas.py', import.meta.url), 'utf8');
  for (const [metodo, rutaApi] of [['patch', '/solicitudes/{sc_id}'], ['post', '/solicitudes/{sc_id}/enviar-confirmacion'],
    ['post', '/solicitudes/{sc_id}/cotizar-sin-confirmacion'], ['post', '/cotizaciones'], ['patch', '/cotizaciones/{cot_id}'],
    ['post', '/cotizaciones/{cot_id}/enviar-confirmacion'], ['post', '/cotizaciones/{cot_id}/confirmar']]) {
    const i = ventas.indexOf(`@router.${metodo}("${rutaApi}"`);
    assert.ok(i >= 0, `${metodo} ${rutaApi} existe`);
    const roles = ventas.slice(i, i + 600).match(/require_roles\(([^)]*)\)/)?.[1];
    assert.equal(roles, '*ROLE_ADMIN, *ROLE_ASESOR', `${metodo} ${rutaApi}: ADMIN y ASESOR`);
  }
  // r2 (m2): también el de las claves de pedido, que se aplican SIEMPRE desde r1 (m16): «comprar» (create_pec de erp_compras.py: ADMIN
  // y COMPRAS), «cobrar» (crear-pxp: ADMIN, FINANZAS y ASESOR) y «facturar»/«despachar» (PATCH /pedidos/{ven_id}: ADMIN, ASESOR y BODEGA,
  // BODEGA solo a ENTREGADO, que es lo que hace «despachar»).
  const compras = readFileSync(new URL('../../backend/app/api/v1/erp_compras.py', import.meta.url), 'utf8');
  for (const [fuente, metodo, rutaApi, esperado, clave] of [
    [compras, 'post', '/pedidos', '*ROLE_ADMIN, *ROLE_COMPRAS', 'comprar'],
    [ventas, 'post', '/pedidos/{ven_id}/crear-pxp', '*ROLE_ADMIN, *ROLE_FINANZAS, *ROLE_ASESOR', 'cobrar'],
    [ventas, 'patch', '/pedidos/{ven_id}', '*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_BODEGA', 'facturar y despachar'],
  ]) {
    const i = fuente.indexOf(`@router.${metodo}("${rutaApi}"`);
    assert.ok(i >= 0, `${metodo} ${rutaApi} existe`);
    assert.equal(fuente.slice(i, i + 600).match(/require_roles\(([^)]*)\)/)?.[1], esperado, `${metodo} ${rutaApi} (${clave})`);
  }
  const permitidos = (clave) => ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'].filter((r) => puedeAccionDocumento('VEN', clave, r));
  assert.deepEqual(permitidos('comprar'), ['ADMIN', 'COMPRAS'], 'la regla de «comprar» es la de create_pec');
  assert.deepEqual(permitidos('cobrar'), ['ADMIN', 'ASESOR', 'FINANZAS'], 'la de «cobrar», la de crear-pxp');
  assert.deepEqual(permitidos('despachar'), ['ADMIN', 'ASESOR', 'BODEGA'], 'la de «despachar», la del PATCH a ENTREGADO');
  assert.deepEqual(permitidos('facturar'), ['ADMIN', 'ASESOR'], 'la de «facturar», la del PATCH sin BODEGA');
}

console.log('--- B4 T24 f2 r1 (m17, m19 + m37): puedeDespachar (una sola copia) y accesoNotasVentas, con el require_roles real ---');
{
  const roles = await import('../src/lib/roles.js');
  const ent = await import('../src/lib/entregas.js');
  const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'];
  // m17: quién despacha vive en roles.js (la de la duda 3); entregas.js la reexporta con su nombre de hoy (aditivo; f3 avisado).
  assert.equal(typeof roles.puedeDespachar, 'function', 'puedeDespachar en roles.js');
  for (const rol of TODOS) {
    assert.equal(roles.puedeDespachar(rol), ['ADMIN', 'ASESOR', 'BODEGA'].includes(rol), rol);
    assert.equal(roles.puedeDespachar(rol), roles.puedeAccionPedido('despachar', rol), `${rol}: la misma regla de la tarjeta`);
  }
  for (const rol of RAROS) assert.equal(roles.puedeDespachar(rol), false, JSON.stringify(rol));
  assert.equal(ent.puedeDespachar, roles.puedeDespachar, 'entregas.js reexporta la MISMA función');
  const entregas = readFileSync(new URL('../src/lib/entregas.js', import.meta.url), 'utf8');
  assert.ok(!/\[\s*'ADMIN',\s*'ASESOR',\s*'BODEGA'\s*\]/.test(entregas), 'sin la lista de roles escrita a mano en entregas.js');
  assert.match(entregas, /export \{ puedeDespachar \};/);
  assert.ok(!/from '\.\/entregas\.js'/.test(readFileSync(new URL('../src/lib/roles.js', import.meta.url), 'utf8')), 'roles.js no importa entregas.js (sería circular)');
  // m19 + m37: las notas de un documento de Ventas (POST /solicitudes|cotizaciones|pedidos/{id}/actividad): ADMIN, ASESOR y COMPRAS.
  assert.equal(typeof roles.accesoNotasVentas, 'function', 'accesoNotasVentas existe');
  for (const rol of TODOS) {
    assert.deepEqual(roles.accesoNotasVentas(rol), { listo: true, anotar: ['ADMIN', 'ASESOR', 'COMPRAS'].includes(rol) }, rol);
  }
  for (const rol of RAROS) assert.deepEqual(roles.accesoNotasVentas(rol), { listo: false, anotar: false }, JSON.stringify(rol));
  const ventas = readFileSync(new URL('../../backend/app/api/v1/erp_ventas.py', import.meta.url), 'utf8');
  for (const rutaApi of ['/solicitudes/{sc_id}/actividad', '/cotizaciones/{cot_id}/actividad', '/pedidos/{ven_id}/actividad']) {
    const i = ventas.indexOf(`@router.post("${rutaApi}"`);
    assert.ok(i >= 0, rutaApi);
    assert.equal(ventas.slice(i, i + 400).match(/require_roles\(([^)]*)\)/)?.[1], '*ROLE_ADMIN, *ROLE_ASESOR, *ROLE_COMPRAS', rutaApi);
  }
}

console.log('--- B4 T24 f3 (FINAL-C4-f): accesoRecepciones, el conteo de una recepción con el require_roles real ---');
{
  const roles = await import('../src/lib/roles.js');
  const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'];
  assert.equal(typeof roles.accesoRecepciones, 'function', 'accesoRecepciones existe');
  // El ruling 5: BODEGA cuenta (PATCH por línea) y confirma; COMPRAS ve el conteo en solo lectura; ADMIN ve todo. La bodega receptora
  // (PATCH /recepciones/{id}) y recepcionar un PEC son de ADMIN y COMPRAS; el conteo de una recepción heredada (sin GRL: el PATCH en
  // lote y después la confirmación), solo de ADMIN, el único con los dos permisos.
  for (const r of TODOS) {
    assert.deepEqual(roles.accesoRecepciones(r), {
      listo: true,
      contar: r === 'ADMIN' || r === 'BODEGA',
      confirmar: r === 'ADMIN' || r === 'BODEGA',
      contarHeredada: r === 'ADMIN',
      bodega: r === 'ADMIN' || r === 'COMPRAS',
      recepcionar: r === 'ADMIN' || r === 'COMPRAS',
    }, r);
  }
  assert.deepEqual(roles.accesoRecepciones(' bodega '), roles.accesoRecepciones('BODEGA'));
  for (const r of RAROS) {
    assert.deepEqual(roles.accesoRecepciones(r),
      { listo: false, contar: false, confirmar: false, contarHeredada: false, bodega: false, recepcionar: false }, JSON.stringify(r));
  }
  assert.equal(roles.TEXTO_CONTEO_SOLO_VER, 'El conteo y la confirmación los hace Bodega.');
  // r1 (D27): el texto de la heredada lo corrige el ruling de r1 (la cierra la Administración); lo fija el bloque de r1.
  // El require_roles real (backend/app/api/v1/erp_compras.py, solo lectura): si cambia, esta prueba lo dice.
  const compras = readFileSync(new URL('../../backend/app/api/v1/erp_compras.py', import.meta.url), 'utf8');
  const rolesDe = (decorador) => {
    const i = compras.indexOf(decorador);
    assert.ok(i >= 0, decorador);
    return compras.slice(i, i + 500).match(/require_roles\(([^)]*)\)/)?.[1];
  };
  assert.equal(rolesDe('@router.patch("/recepciones/{eninv_id}/lineas/{grl_id}")'), '*ROLE_ADMIN, *ROLE_COMPRAS, *ROLE_BODEGA', 'update_grl');
  assert.equal(rolesDe('@router.post("/recepciones/{eninv_id}/confirmar")'), '*ROLE_ADMIN, *ROLE_BODEGA', 'confirmar_recepcion');
  assert.equal(rolesDe('@router.patch("/recepciones/{eninv_id}")'), '*ROLE_ADMIN, *ROLE_COMPRAS', 'update_recepcion (el lote y la bodega)');
  assert.equal(rolesDe('@router.post("/pedidos/{pec_id}/recepcionar")'), '*ROLE_ADMIN, *ROLE_COMPRAS', 'recepcionar un PEC');
  // accionesConteo: lo que ofrece el detalle del conteo (recepciones/[id]), por rol, estado y si la recepción es heredada (sin GRL).
  const { accionesConteo } = roles;
  assert.equal(typeof accionesConteo, 'function', 'accionesConteo existe');
  const nada = { contar: false, validar: false, texto: null };
  for (const r of TODOS) {
    // Una recepción que ya no está por confirmar no ofrece nada (la pantalla dice «Recepción no editable en este estado»).
    assert.deepEqual(accionesConteo({ porConfirmar: false, heredada: false, rol: r }), nada, `${r}: no por confirmar`);
    assert.deepEqual(accionesConteo({ porConfirmar: false, heredada: true, rol: r }), nada, `${r}: no por confirmar, heredada`);
    const cuenta = r === 'ADMIN' || r === 'BODEGA';
    assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: false, rol: r }),
      cuenta ? { contar: true, validar: true, texto: null } : { contar: false, validar: false, texto: roles.TEXTO_CONTEO_SOLO_VER }, `${r}: por confirmar`);
    assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: true, rol: r }),
      r === 'ADMIN' ? { contar: true, validar: true, texto: null } : { contar: false, validar: false, texto: roles.TEXTO_RECEPCION_HEREDADA }, `${r}: heredada`);
  }
  // Mientras se lee el rol, nada (ni el texto): no se sabe todavía qué puede.
  for (const r of RAROS) assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: false, rol: r }), nada, JSON.stringify(r));
}

console.log('--- B4 T24 f3 r1 (C1 y la heredada): sin bodega receptora, BODEGA cuenta pero no valida; la heredada la cierra la Administración ---');
{
  const roles = await import('../src/lib/roles.js');
  const { accionesConteo, confirmarRecepcion } = roles;
  const TODOS = ['ADMIN', 'ASESOR', 'FINANZAS', 'COMPRAS', 'BODEGA', 'CONSULTA'];
  assert.equal(typeof confirmarRecepcion, 'function', 'confirmarRecepcion existe');
  // El ruling de r1 corrige el texto del ruling 5: COMPRAS no confirma y BODEGA no tiene el lote; la cierra la Administración.
  assert.equal(roles.TEXTO_RECEPCION_HEREDADA, 'Esta recepción es anterior al conteo por línea; la cierra la Administración.');
  assert.equal(roles.TEXTO_FALTA_BODEGA, 'Falta la bodega receptora: la asigna Compras o la Administración.');
  assert.equal(roles.TEXTO_ASIGNA_BODEGA, 'Asigna la bodega receptora para que Bodega pueda confirmar.');
  const nada = { contar: false, validar: false, texto: null };
  // El detalle (accionesConteo) con sinBodega, rol por rol.
  const detalleSinBodega = {
    ADMIN: { contar: true, validar: true, texto: null }, // tiene el select de la bodega en el mismo detalle
    BODEGA: { contar: true, validar: false, texto: roles.TEXTO_FALTA_BODEGA }, // guarda el conteo; no valida
    COMPRAS: { contar: false, validar: false, texto: roles.TEXTO_ASIGNA_BODEGA }, // junto al select que ya tiene
    ASESOR: { contar: false, validar: false, texto: roles.TEXTO_CONTEO_SOLO_VER },
    FINANZAS: { contar: false, validar: false, texto: roles.TEXTO_CONTEO_SOLO_VER },
    CONSULTA: { contar: false, validar: false, texto: roles.TEXTO_CONTEO_SOLO_VER },
  };
  for (const r of TODOS) {
    assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: false, sinBodega: true, rol: r }), detalleSinBodega[r], `${r}: sin bodega`);
    // Con bodega, como antes de r1 (sinBodega por defecto es false).
    assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: false, sinBodega: false, rol: r }),
      accionesConteo({ porConfirmar: true, heredada: false, rol: r }), `${r}: sinBodega por defecto`);
    // La heredada manda sobre la bodega: solo ADMIN; a los demás (BODEGA y COMPRAS incluidos), el texto corregido.
    for (const sinBodega of [false, true]) {
      assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: true, sinBodega, rol: r }),
        r === 'ADMIN' ? { contar: true, validar: true, texto: null } : { contar: false, validar: false, texto: roles.TEXTO_RECEPCION_HEREDADA },
        `${r}: heredada, sinBodega ${sinBodega}`);
      assert.deepEqual(accionesConteo({ porConfirmar: false, heredada: false, sinBodega, rol: r }), nada, `${r}: no por confirmar`);
    }
  }
  for (const r of RAROS) assert.deepEqual(accionesConteo({ porConfirmar: true, heredada: false, sinBodega: true, rol: r }), nada, JSON.stringify(r));

  // Fuera del detalle (la fila, el menú, el Drawer, el tablero y el enlace de Inventario): nadie confirma sin bodega (no hay select).
  const fuera = (heredada, sinBodega, rol) => confirmarRecepcion({ porConfirmar: true, heredada, sinBodega, rol });
  for (const r of TODOS) {
    const confirma = r === 'ADMIN' || r === 'BODEGA';
    assert.deepEqual(fuera(false, false, r), confirma ? { confirmar: true, texto: null } : { confirmar: false, texto: roles.TEXTO_CONTEO_SOLO_VER }, `${r}: con bodega`);
    assert.deepEqual(fuera(false, true, r), {
      confirmar: false,
      texto: r === 'ADMIN' || r === 'COMPRAS' ? roles.TEXTO_ASIGNA_BODEGA : r === 'BODEGA' ? roles.TEXTO_FALTA_BODEGA : roles.TEXTO_CONTEO_SOLO_VER,
    }, `${r}: sin bodega`);
    // La heredada: solo ADMIN, y con bodega; BODEGA ya no la confirma desde la lista (lo que el detalle le escondía).
    assert.deepEqual(fuera(true, false, r), r === 'ADMIN' ? { confirmar: true, texto: null } : { confirmar: false, texto: roles.TEXTO_RECEPCION_HEREDADA }, `${r}: heredada`);
    // r2 (m14, D27): heredada y sin bodega: manda el texto de la heredada (la cierra la Administración), también para ADMIN.
    assert.deepEqual(fuera(true, true, r), { confirmar: false, texto: roles.TEXTO_RECEPCION_HEREDADA }, `${r}: heredada sin bodega`);
    assert.deepEqual(confirmarRecepcion({ porConfirmar: false, heredada: false, sinBodega: false, rol: r }), { confirmar: false, texto: null }, `${r}: confirmada`);
  }
  for (const r of RAROS) assert.deepEqual(fuera(false, false, r), { confirmar: false, texto: null }, JSON.stringify(r));
}

console.log('--- B4.1 T9 (A1-f): edicionFilaCatalogo — una fila SKU de la rama heredada no se edita desde la tienda ---');
{
  const { edicionFilaCatalogo, TITULO_SOLO_ADMIN_CATALOGO, TEXTO_FILA_DEL_ERP_TIENDA } = await import('../src/lib/roles.js');
  assert.equal(TITULO_SOLO_ADMIN_CATALOGO, 'Solo la Administración edita el catálogo');
  assert.equal(TEXTO_FILA_DEL_ERP_TIENDA, 'Viene del catálogo del ERP: no se edita desde la tienda.');
  assert.deepEqual(edicionFilaCatalogo({ id: 4, editable_en_tienda: true }, true), { editable: true, motivo: null });
  assert.deepEqual(edicionFilaCatalogo({ id: -9, editable_en_tienda: false }, true), { editable: false, motivo: TEXTO_FILA_DEL_ERP_TIENDA });
  assert.deepEqual(edicionFilaCatalogo({ id: 4, editable_en_tienda: true }, false), { editable: false, motivo: TITULO_SOLO_ADMIN_CATALOGO });
  assert.deepEqual(edicionFilaCatalogo({ id: 4 }, true), { editable: true, motivo: null }, 'sin la llave (servidor viejo): como hoy');
  // H26: la etiqueta «Del ERP» y su motivo dicen lo mismo, también para un rol sin permiso.
  assert.deepEqual(edicionFilaCatalogo({ id: -9, editable_en_tienda: false }, false), { editable: false, motivo: TEXTO_FILA_DEL_ERP_TIENDA });
  assert.deepEqual(edicionFilaCatalogo(null, true), { editable: true, motivo: null });
}

console.log('OK test_roles.mjs');
