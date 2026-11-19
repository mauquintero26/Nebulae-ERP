/**
 * Las reglas de rol de las pantallas (revisión final del Bloque 3, F2: M12 y M52). Una sola copia, sobre normalizarRol
 * (lib/chatter.js), el espejo de normalize_role de backend/app/api/dependencies.py: el nombre viejo ('Admin',
 * 'Vendedor', 'Finanzas'…) por su canónico y cualquier otro en mayúsculas, sin los espacios de los bordes. Así un botón
 * no termina en un 403 ni un asesor válido se queda fuera de un selector. JS plano para probarlo con node
 * (frontend/tests/test_roles.mjs).
 *
 * Las reexportan con sus nombres de siempre: flujo.tsx (esAsesorElegible, esAdministrador y puedeCrearOrdenDePago),
 * seguimiento.js (esAdminOAsesor), nombre-para-mostrar.js (puedeEditarNombreParaMostrar) y dinero-ventas.js
 * (puedeGestionarCotizacion). La seguridad real es el require_roles del servidor.
 */

import { normalizarRol } from './chatter.js';

/**
 * Solo la Administración (ROLE_ADMIN): la Papelera, la configuración del Hub, el nombre para mostrar.
 * @param {unknown} rol
 * @returns {boolean}
 */
export function esAdmin(rol) {
  return normalizarRol(rol) === 'ADMIN';
}

/**
 * La Administración y el asesor (require_roles(ROLE_ADMIN, ROLE_ASESOR)): enviar, cotizar, los recordatorios, el
 * WhatsApp automático y quién sale en el selector de asesores.
 * @param {unknown} rol
 * @returns {boolean}
 */
export function esAdminOAsesor(rol) {
  const r = normalizarRol(rol);
  return r === 'ADMIN' || r === 'ASESOR';
}

/**
 * B4 T24 r1 (m33): la Administración y Compras (require_roles(ROLE_ADMIN, ROLE_COMPRAS)): los pedidos de compra (PATCH, DELETE y
 * /tracking) y la Agenda de proveedores (POST, PATCH y DELETE). Una sola copia de la lista para accesoCompras y accesoProveedores.
 * @param {unknown} rol
 * @returns {boolean}
 */
export function esAdminOCompras(rol) {
  const r = normalizarRol(rol);
  return r === 'ADMIN' || r === 'COMPRAS';
}

/**
 * La orden de pago (PXP) de un pedido (POST /ventas/pedidos/{id}/crear-pxp): la Administración, Finanzas y el asesor.
 * Las condiciones del pedido van en pedidoAdmitePxp (dinero-ventas.js).
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeCrearOrdenDePago(rol) {
  const r = normalizarRol(rol);
  return r === 'ADMIN' || r === 'FINANZAS' || r === 'ASESOR';
}

/**
 * B4 T24 f2 (duda 3 de f1): quién puede hacer la acción principal de la tarjeta de un pedido de venta (claveAccionSiguientePVEN de
 * hub-ventas.js) en la pantalla a la que lleva, con el require_roles real (backend/app/api/v1, leído en solo lectura):
 *  - 'facturar' (el detalle: PATCH /ventas/pedidos/{id} a FACTURADO, update_pedido de erp_ventas.py): ADMIN y ASESOR (BODEGA
 *    solo pone ENTREGADO);
 *  - 'cobrar' (el detalle: POST /ventas/pedidos/{id}/crear-pxp, crear_pxp): ADMIN, FINANZAS y ASESOR (puedeCrearOrdenDePago);
 *  - 'comprar' («Gestionar compra», en Compras: POST /compras/pedidos, create_pec de erp_compras.py): ADMIN y COMPRAS;
 *  - 'despachar' (en Entregas: PATCH /ventas/pedidos/{id} a ENTREGADO con la bodega): ADMIN, ASESOR y BODEGA;
 *  - 'ver' («Ver pedido»: GET /ventas/pedidos/{id}): todos los roles del ERP.
 * Otra clave, o un rol vacío: false. Los nombres viejos cuentan como el canónico (normalizarRol).
 * @param {unknown} clave
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeAccionPedido(clave, rol) {
  const r = normalizarRol(rol);
  if (r === '') return false;
  if (clave === 'facturar') return esAdminOAsesor(rol);
  if (clave === 'cobrar') return puedeCrearOrdenDePago(rol);
  if (clave === 'comprar') return esAdminOCompras(rol);
  if (clave === 'despachar') return esAdminOAsesor(rol) || r === 'BODEGA';
  return clave === 'ver';
}

/**
 * B4 T24 f2 r1 (m17): quién despacha (PATCH /ventas/pedidos/{id} a ENTREGADO con la bodega, desde Entregas): ADMIN, ASESOR y BODEGA.
 * La regla ÚNICA: la de puedeAccionPedido('despachar'), la tarjeta de Pedidos, el panel rápido del Hub y Entregas (entregas.js la
 * reexporta con este nombre; no importa entregas.js, que sería circular).
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeDespachar(rol) {
  return puedeAccionPedido('despachar', rol);
}

/**
 * B4 T24 f2 r1 (m19 + m37): las notas de un documento de Ventas (el compositor del Chatter del Hub: POST
 * /ventas/solicitudes|cotizaciones|pedidos/{id}/actividad de erp_ventas.py, leído en solo lectura): ADMIN, ASESOR y COMPRAS. Con un
 * rol vacío (todavía se lee, después de montar), nada listo ni ofrecido. Un objeto nuevo en cada llamada.
 * @param {unknown} rol
 * @returns {{listo: boolean, anotar: boolean}}
 */
export function accesoNotasVentas(rol) {
  if (normalizarRol(rol) === '') return { listo: false, anotar: false };
  return { listo: true, anotar: esAdminOAsesor(rol) || esAdminOCompras(rol) };
}

/** B4 T24 f2 r1 (duda 2 + m15): las ramas de la próxima acción de la SC y de la COT que CAMBIAN algo (ADMIN y ASESOR). */
const ACCIONES_SC = ['agregar_productos', 'asignar', 'enviar_confirmacion', 'cotizar', 'reiniciar_o_cotizar'];
const ACCIONES_COT = ['completar_precios', 'enviar_al_cliente', 'crear_pedido'];
/** Las que solo abren lo que se ve (GET): todos los roles del ERP. */
const VER_SC = ['ver_ticket', 'ver_pedido', 'ver_cotizacion', 'esperando', 'ver_solicitud'];
const VER_COT = ['esperando', 'ver_pedido'];

/**
 * B4 T24 f2 r1 (duda 2 + m15 + m16): quién puede hacer la acción principal de la tarjeta (o de la columna Acción) de un documento,
 * con la clave de claveAccionSiguienteDocumento (hub-ventas.js) y el require_roles real (backend/app/api/v1/erp_ventas.py, leído en
 * solo lectura; test_roles lo vigila):
 *  - SC: «Agregar productos» y «Asignar asesor» (PATCH /solicitudes/{id}), «Enviar para confirmación» (POST
 *    /solicitudes/{id}/enviar-confirmacion), «Cotizar →» (POST /cotizaciones) y «Reiniciar o cotizar» (el PATCH o POST
 *    /solicitudes/{id}/cotizar-sin-confirmacion): ADMIN y ASESOR;
 *  - COT: «Completar precios» (PATCH /cotizaciones/{id}), «Enviar al cliente» (POST /cotizaciones/{id}/enviar-confirmacion) y «Crear
 *    pedido» (POST /cotizaciones/{id}/confirmar): ADMIN y ASESOR;
 *  - abrir lo que se ve («Ver ticket», «Ver pedido», «Ver cotización», «Ver solicitud» y los «Esperando…»): todos los roles;
 *  - VEN o PVEN: puedeAccionPedido (la duda 3).
 * Otra clave, otro tipo o un rol vacío: false.
 * @param {unknown} tipo
 * @param {unknown} clave
 * @param {unknown} rol
 * @returns {boolean}
 */
export function puedeAccionDocumento(tipo, clave, rol) {
  if (normalizarRol(rol) === '' || typeof clave !== 'string') return false;
  if (tipo === 'VEN' || tipo === 'PVEN') return puedeAccionPedido(clave, rol);
  const [acciones, ver] = tipo === 'SC' ? [ACCIONES_SC, VER_SC] : tipo === 'COT' ? [ACCIONES_COT, VER_COT] : [[], []];
  if (acciones.includes(clave)) return esAdminOAsesor(rol);
  return ver.includes(clave);
}

/**
 * B4 T23A r1 (I1, I2, m15): lo que cada rol puede pedir y hacer en E-Commerce, de la lista EXACTA de require_roles de cada
 * endpoint de backend/app/api/v1/ecommerce.py (la seguridad real es la del servidor; esto evita pedir lo que da un 403 fijo):
 *  - indicadores (GET /stats) y carritos (GET /carritos): ADMIN y ASESOR;
 *  - pedidos (GET /pedidos): ADMIN, ASESOR, FINANZAS y BODEGA;
 *  - editarCatalogo (POST, PATCH y DELETE del catálogo): solo ADMIN (GET /catalogo no tiene guardia de rol: B4 T24, F104, sin campo).
 * `listo` es false con un rol vacío o que no es texto (la hidratación: el rol se lee después de montar): entonces nada se
 * pide ni se ofrece. Un objeto nuevo en cada llamada.
 * @param {unknown} rol
 * @returns {{listo: boolean, indicadores: boolean, carritos: boolean, pedidos: boolean, editarCatalogo: boolean, pagosConfig: boolean}}
 */
export function accesoTienda(rol) {
  const r = normalizarRol(rol);
  if (r === '') return { listo: false, indicadores: false, carritos: false, pedidos: false, editarCatalogo: false, pagosConfig: false };
  const adminOAsesor = esAdminOAsesor(rol);
  return {
    listo: true,
    indicadores: adminOAsesor,
    carritos: adminOAsesor,
    pedidos: adminOAsesor || r === 'FINANZAS' || r === 'BODEGA',
    editarCatalogo: esAdmin(rol),
    // B4 T24 (FINAL-m21): GET y PATCH /ecommerce/pagos/config y /envios/config, solo ADMIN (la pestaña Pagos).
    pagosConfig: esAdmin(rol),
  };
}

/** I1 e I2 (r1): el motivo de lo que solo hace la Administración (POST, PATCH y DELETE del catálogo son de ADMIN). */
export const TITULO_SOLO_ADMIN_CATALOGO = 'Solo la Administración edita el catálogo';
/** B4.1 (A1-f): el motivo de una fila SKU de la rama heredada (editable_en_tienda false): el servidor da 404 en su PATCH y DELETE. */
export const TEXTO_FILA_DEL_ERP_TIENDA = 'Viene del catálogo del ERP: no se edita desde la tienda.';

/**
 * B4.1 (A1-f): si la fila del catálogo de la tienda se puede editar desde ahí (publicar, editar, eliminar) y, si no, por qué.
 * Primero la fila: con `editable_en_tienda === false` (una fila del ERP: GET /ecommerce/catalogo la marca así) no se edita, tenga
 * el rol que tenga, y el motivo es TEXTO_FILA_DEL_ERP_TIENDA (H26: «Del ERP» y su motivo dicen lo mismo). Después el permiso:
 * sin él, TITULO_SOLO_ADMIN_CATALOGO. Sin la llave (un servidor viejo) se trata como editable, como hasta hoy.
 * @param {{ editable_en_tienda?: boolean } | null | undefined} p la fila del catálogo
 * @param {boolean} puedeEditar accesoTienda(rol).editarCatalogo
 * @returns {{ editable: boolean, motivo: string | null }}
 */
export function edicionFilaCatalogo(p, puedeEditar) {
  if (p?.editable_en_tienda === false) return { editable: false, motivo: TEXTO_FILA_DEL_ERP_TIENDA };
  if (puedeEditar !== true) return { editable: false, motivo: TITULO_SOLO_ADMIN_CATALOGO };
  return { editable: true, motivo: null };
}

/**
 * B4 T23B: lo que cada rol puede pedir en Seguimientos del CRM, de la lista EXACTA de require_roles de cada endpoint
 * (backend/app/api/v1/crm.py): GET /crm/leads es de ADMIN y ASESOR (GET /crm/pipeline-stages es de todos los roles del ERP, pero
 * sin leads la pantalla no tiene qué mostrar). `listo` es false con un rol vacío o que no es texto (la hidratación): nada se pide.
 * @param {unknown} rol
 * @returns {{listo: boolean, leads: boolean}}
 */
export function accesoSeguimientos(rol) {
  if (normalizarRol(rol) === '') return { listo: false, leads: false };
  return { listo: true, leads: esAdminOAsesor(rol) };
}

/**
 * B4 T23B: lo que cada rol puede pedir y hacer en Marketing y en Campañas (backend/app/api/v1/marketing.py): /stats, /campanas, sus
 * leads, lanzar, pausar y sincronizar con el CRM son de ADMIN y ASESOR (`ver`); borrar una campaña (DELETE /campanas/{id}) es solo de
 * ADMIN. `listo` es false con un rol vacío o que no es texto: nada se pide.
 * @param {unknown} rol
 * @returns {{listo: boolean, ver: boolean, eliminarCampana: boolean}}
 */
export function accesoMarketing(rol) {
  if (normalizarRol(rol) === '') return { listo: false, ver: false, eliminarCampana: false };
  return { listo: true, ver: esAdminOAsesor(rol), eliminarCampana: esAdmin(rol) };
}

/**
 * B4 T23B: lo que cada rol puede pedir en la columna de contexto del Asistente omnicanal (backend/app/api/v1/chat.py:
 * /search-customers, /customer-context, /create-customer-request y /ai-copilot-suggest: ADMIN y ASESOR). `listo` es false con un rol
 * vacío o que no es texto: nada se pide.
 * @param {unknown} rol
 * @returns {{listo: boolean, contexto: boolean}}
 */
export function accesoAsistente(rol) {
  if (normalizarRol(rol) === '') return { listo: false, contexto: false };
  return { listo: true, contexto: esAdminOAsesor(rol) };
}

/** B4 T24: true si el rol (normalizado) es uno de `roles`. */
const esUnoDe = (rol, ...roles) => roles.includes(normalizarRol(rol));

/**
 * B4 T24 (FINAL-C5): Finanzas › Control de Gastos (backend/app/api/v1/finance.py): GET y POST /finance/expenses son de ADMIN y FINANZAS
 * (`gastos`: la lista, los conteos de categorías, el tablero y «Añadir Gasto»). `listo` es false con un rol vacío o que no es texto
 * (la hidratación): nada se pide.
 * @param {unknown} rol
 * @returns {{listo: boolean, gastos: boolean}}
 */
export function accesoFinanzas(rol) {
  if (normalizarRol(rol) === '') return { listo: false, gastos: false };
  return { listo: true, gastos: esUnoDe(rol, 'ADMIN', 'FINANZAS') };
}

/**
 * B4 T24 (FINAL-m37 y F96): el CRM (backend/app/api/v1/crm.py). De ADMIN y ASESOR: `leads` (GET /leads; con el MISMO require_roles, el
 * Análisis, GET /analisis, y mover un lead: PATCH /leads/{id}/stage, PATCH /leads/{id} y /v2, y pasar a solicitud, cotización o pedido;
 * r1, m32) y `crear` (POST /leads). Solo de ADMIN: `warmup` (GET /warmup), `borrar` (DELETE /leads/{id}) y `config` (GET y PUT
 * /pipeline-stages/…/config, «Configurar CRM»). `listo` es false con un rol vacío o que no es texto: nada se pide.
 * @param {unknown} rol
 * @returns {{listo: boolean, leads: boolean, crear: boolean, warmup: boolean, borrar: boolean, config: boolean}}
 */
export function accesoCrm(rol) {
  if (normalizarRol(rol) === '') return { listo: false, leads: false, crear: false, warmup: false, borrar: false, config: false };
  const adminOAsesor = esAdminOAsesor(rol);
  const admin = esAdmin(rol);
  return { listo: true, leads: adminOAsesor, crear: adminOAsesor, warmup: admin, borrar: admin, config: admin };
}

/**
 * B4 T24 (FINAL-m23): el Copilot del Dashboard (backend/app/api/v1/chat.py: POST /chat/copilot/query es de ADMIN, ASESOR y FINANZAS).
 * @param {unknown} rol
 * @returns {{listo: boolean, consultar: boolean}}
 */
export function accesoCopilot(rol) {
  if (normalizarRol(rol) === '') return { listo: false, consultar: false };
  return { listo: true, consultar: esUnoDe(rol, 'ADMIN', 'ASESOR', 'FINANZAS') };
}

/**
 * B4 T24 (FINAL-m37) y r1 (m30): lo que ve un rol sin GET /crm/leads (ADMIN y ASESOR) en el CRM y en Seguimientos: neutro,
 * sin «Reintentar».
 */
export const TEXTO_SIN_LEADS = 'Tu rol no ve los leads del CRM.';

/** B4 T24: el motivo de un tablero que el rol no puede mover (soloLectura de TableroKanban): no se arrastra ni se ofrece «Mover a…». */
export const TEXTO_TABLERO_SOLO_VER = 'Tu rol solo puede ver este tablero.';

/**
 * B4 T24 (FINAL-m31 y FINAL-m38): quién mueve las tarjetas de los tableros de Ventas (el Hub, Solicitudes, Cotizaciones y Pedidos de
 * venta), con el require_roles del PATCH de destino (backend/app/api/v1/erp_ventas.py): PATCH /solicitudes/{id} y /cotizaciones/{id},
 * ADMIN y ASESOR; PATCH /pedidos/{id}, ADMIN, ASESOR y BODEGA, pero BODEGA solo a ENTREGADO con la bodega (con otro estado, 403): ese
 * despacho es de Entregas, y en estos tableros BODEGA solo ve. Las listas son de todos los roles del ERP. `soloLectura` es el motivo
 * para TableroKanban (null si mueve). Con un rol vacío (la hidratación), nada listo y soloLectura null (r1, m9: sin el aviso mientras se
 * lee el rol); r2 (m2, m10): mientras !listo las pantallas pintan EsqueletoTablero en lugar del tablero (sin tarjetas ni acciones).
 * @param {unknown} rol
 * @returns {{listo: boolean, mover: boolean, soloLectura: string | null}}
 */
export function accesoTableroVentas(rol) {
  if (normalizarRol(rol) === '') return { listo: false, mover: false, soloLectura: null };
  const mover = esAdminOAsesor(rol);
  return { listo: true, mover, soloLectura: mover ? null : TEXTO_TABLERO_SOLO_VER };
}

/**
 * B4 T24 (FINAL-m10, FINAL-m31 y FINAL-m38): lo que cada rol puede hacer con los pedidos de compra (backend/app/api/v1/erp_compras.py):
 * `cambiarPec` (PATCH y DELETE /pedidos/{id}: emitir, cancelar, eliminar, editar, el arrastre del tablero y la barra masiva; con la
 * MISMA lista, r1 m7: POST /pedidos «Nuevo PEC» y «Crear PEC Consolidado», POST /pedidos/{id}/recepcionar y PUT
 * /tracking-config) y `tracking` (PATCH /pedidos/{id}/tracking: las etapas de Tránsito), los dos de ADMIN y COMPRAS
 * (esAdminOCompras). GET /pedidos es de todos los roles del ERP. `soloLectura` es el motivo para los tableros de PEC (null si
 * los mueve). Con un rol vacío, nada listo y soloLectura null (r1, m9); mientras !listo las pantallas pintan EsqueletoTablero (r2, m2
 * y m10).
 * @param {unknown} rol
 * @returns {{listo: boolean, cambiarPec: boolean, tracking: boolean, soloLectura: string | null}}
 */
export function accesoCompras(rol) {
  if (normalizarRol(rol) === '') return { listo: false, cambiarPec: false, tracking: false, soloLectura: null };
  const puede = esAdminOCompras(rol);
  return { listo: true, cambiarPec: puede, tracking: puede, soloLectura: puede ? null : TEXTO_TABLERO_SOLO_VER };
}

/**
 * B4 T24 (F108): la Agenda de proveedores (backend/app/api/v1/erp_compras.py): POST, PATCH y DELETE /compras/proveedores (Nuevo, Editar
 * y Eliminar proveedor) son de ADMIN y COMPRAS (esAdminOCompras); el GET, de todos.
 * @param {unknown} rol
 * @returns {{listo: boolean, editar: boolean}}
 */
export function accesoProveedores(rol) {
  if (normalizarRol(rol) === '') return { listo: false, editar: false };
  return { listo: true, editar: esAdminOCompras(rol) };
}

/**
 * B4 T24 f4 r1 (I1): la Agenda de clientes (backend/app/api/v1/crm.py, solo lectura): POST /customers (:212), PUT /customers/{id}
 * (:234), DELETE /customers/{id} (:285), POST /customers/{id}/solicitudes (:1191) y POST /events (:1866) son de ADMIN y ASESOR; el GET,
 * de todos. «Cotizar» lleva a POST /ventas/cotizaciones (erp_ventas.py), también de ADMIN y ASESOR. `editar` = esAdminOAsesor.
 * @param {unknown} rol
 * @returns {{listo: boolean, editar: boolean}}
 */
export function accesoClientes(rol) {
  if (normalizarRol(rol) === '') return { listo: false, editar: false };
  return { listo: true, editar: esAdminOAsesor(rol) };
}

/** B4 T24 f3 (FINAL-C4-f, ruling 5): lo que ve quien no cuenta una recepción por confirmar (COMPRAS y los demás roles). */
export const TEXTO_CONTEO_SOLO_VER = 'El conteo y la confirmación los hace Bodega.';
/**
 * B4 T24 f3 (FINAL-C4-f, ruling 5; r1, m1 + m19 + m34 + m46, el ruling corrige el texto): una recepción heredada (sin GRL: no tiene
 * PATCH por línea) a quien no la puede cerrar. La cierra la Administración: COMPRAS no confirma (confirmar_recepcion es de ADMIN y
 * BODEGA) y BODEGA no tiene el PATCH en lote (de ADMIN y COMPRAS).
 */
export const TEXTO_RECEPCION_HEREDADA = 'Esta recepción es anterior al conteo por línea; la cierra la Administración.';
/** B4 T24 f3 r1 (C1): BODEGA, con una recepción sin bodega receptora (no la puede elegir: el PATCH de la recepción es de ADMIN y COMPRAS). */
export const TEXTO_FALTA_BODEGA = 'Falta la bodega receptora: la asigna Compras o la Administración.';
/** B4 T24 f3 r1 (C1): quien sí la elige (ADMIN y COMPRAS), con una recepción sin bodega receptora. */
export const TEXTO_ASIGNA_BODEGA = 'Asigna la bodega receptora para que Bodega pueda confirmar.';

/**
 * B4 T24 f3 (FINAL-C4-f, ruling 5): el conteo de una recepción (backend/app/api/v1/erp_compras.py, leído en solo lectura; test_roles lo
 * vigila). BODEGA cuenta con el PATCH por línea (`contar`: PATCH /recepciones/{id}/lineas/{grl_id}, de ADMIN, COMPRAS y BODEGA) y
 * confirma (`confirmar`: POST /recepciones/{id}/confirmar, de ADMIN y BODEGA); COMPRAS ve el conteo en solo lectura (el ruling, aunque el
 * PATCH por línea lo admita); ADMIN ve todo. `contarHeredada`: una recepción sin GRL solo se cuenta con el PATCH en lote (ADMIN y
 * COMPRAS) y después se confirma: solo ADMIN tiene los dos. `bodega` (la bodega receptora: el mismo PATCH /recepciones/{id}) y
 * `recepcionar` (POST /pedidos/{id}/recepcionar): ADMIN y COMPRAS. Con un rol vacío (la hidratación), nada listo ni ofrecido.
 * @param {unknown} rol
 * @returns {{listo: boolean, contar: boolean, confirmar: boolean, contarHeredada: boolean, bodega: boolean, recepcionar: boolean}}
 */
export function accesoRecepciones(rol) {
  if (normalizarRol(rol) === '') return { listo: false, contar: false, confirmar: false, contarHeredada: false, bodega: false, recepcionar: false };
  const adminOBodega = esUnoDe(rol, 'ADMIN', 'BODEGA');
  return {
    listo: true, contar: adminOBodega, confirmar: adminOBodega, contarHeredada: esAdmin(rol), bodega: esAdminOCompras(rol),
    recepcionar: esAdminOCompras(rol),
  };
}

/**
 * B4 T24 f3 (FINAL-C4-f): lo que ofrece el detalle del conteo de una recepción (recepciones/[id]): `contar` («Guardar Borrador» y los
 * campos editables), `validar` («Cerrar y Validar Conteo») y `texto` (el motivo de solo lectura, o null). Una recepción que no está por
 * confirmar, o con el rol todavía vacío, no ofrece nada (la pantalla dice su estado). Una heredada (sin GRL) solo la cuenta y la cierra
 * quien tiene `contarHeredada` (ADMIN); a los demás, TEXTO_RECEPCION_HEREDADA, sin botones que den 403. Si el rol ni cuenta ni confirma,
 * TEXTO_CONTEO_SOLO_VER.
 * r1 (C1): `sinBodega` (la recepción no tiene warehouse_id: confirmar_recepcion responde 400 «Debe seleccionar una bodega antes de
 * confirmar.»). Quien no elige la bodega (BODEGA) guarda el conteo pero no valida, con TEXTO_FALTA_BODEGA; COMPRAS, que la elige con el
 * select del detalle, lee TEXTO_ASIGNA_BODEGA; ADMIN tiene el select y valida (no cambia).
 * @param {{porConfirmar: boolean, heredada: boolean, sinBodega?: boolean, rol: unknown}} entrada
 * @returns {{contar: boolean, validar: boolean, texto: string | null}}
 */
export function accionesConteo({ porConfirmar, heredada, sinBodega = false, rol }) {
  const acceso = accesoRecepciones(rol);
  if (!acceso.listo || !porConfirmar) return { contar: false, validar: false, texto: null };
  if (heredada) {
    return acceso.contarHeredada ? { contar: true, validar: true, texto: null } : { contar: false, validar: false, texto: TEXTO_RECEPCION_HEREDADA };
  }
  if (!acceso.contar && !acceso.confirmar) {
    return { contar: false, validar: false, texto: sinBodega && acceso.bodega ? TEXTO_ASIGNA_BODEGA : TEXTO_CONTEO_SOLO_VER };
  }
  if (sinBodega && !acceso.bodega) return { contar: acceso.contar, validar: false, texto: TEXTO_FALTA_BODEGA };
  return { contar: acceso.contar, validar: acceso.confirmar, texto: null };
}

/**
 * B4 T24 f3 r1 (C1 y la heredada, m19): «Confirmar» de una recepción FUERA del detalle (la fila, el menú y el Drawer de Compras ›
 * Recepciones, la acción del tablero y el enlace de Inventario › Recepciones), con la MISMA regla que el detalle (accionesConteo). Fuera
 * del detalle no hay select de bodega: sin bodega receptora nadie confirma (tampoco ADMIN), con TEXTO_ASIGNA_BODEGA si el rol la elige.
 * `texto` es el motivo cuando no se ofrece (o null).
 * @param {{porConfirmar: boolean, heredada: boolean, sinBodega: boolean, rol: unknown}} entrada
 * @returns {{confirmar: boolean, texto: string | null}}
 */
export function confirmarRecepcion({ porConfirmar, heredada, sinBodega, rol }) {
  const conteo = accionesConteo({ porConfirmar, heredada, sinBodega, rol });
  // r2 (m14): heredada y sin bodega: manda el texto de la heredada (la cierra la Administración), también para ADMIN fuera del detalle.
  if (sinBodega && conteo.validar) return { confirmar: false, texto: heredada ? TEXTO_RECEPCION_HEREDADA : TEXTO_ASIGNA_BODEGA };
  return { confirmar: conteo.validar, texto: conteo.texto };
}

/**
 * B4 T24 f3 r2 (m1): el ítem «Confirmar» del menú de una recepción. Se OCULTA si no está por confirmar, si el rol no confirma o si es una
 * heredada que el rol no cierra (A-bis); apagado con su motivo queda solo para lo que el rol sí podría confirmar pero le falta la bodega
 * receptora (C1).
 * @param {{porConfirmar: boolean, heredada: boolean, sinBodega: boolean, rol: unknown}} entrada
 * @returns {{oculto: boolean, deshabilitado: boolean, titulo: string | null}}
 */
export function itemConfirmarMenu(entrada) {
  const c = confirmarRecepcion(entrada);
  if (!entrada.porConfirmar || !accesoRecepciones(entrada.rol).confirmar || (entrada.heredada && !c.confirmar)) {
    return { oculto: true, deshabilitado: false, titulo: null };
  }
  return { oculto: false, deshabilitado: !c.confirmar, titulo: c.confirmar ? null : c.texto };
}
