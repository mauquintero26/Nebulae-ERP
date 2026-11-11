/**
 * Las columnas, las pestañas y las reglas del tablero de Entregas (Bloque 4, T3C: KANBAN-logistica punto 3; R15, C19,
 * RP22). JS plano, sin React ni DOM, para probarlo con node (frontend/tests/test_entregas.mjs). Lo usa
 * inventario/entregas/page.tsx (T19): las pestañas son estas columnas y el tablero va en modo servidor, una consulta por
 * columna a GET /ventas/pedidos con sus `estados` (CSV) y su `saldo` (pendiente | pagado; T6B).
 *
 *  - Esperando mercancía: todo lo que no está listo, despachado, cancelado ni devuelto (columnaEntrega da 'esperando'):
 *    los operativos fuera del paso 2 (PENDIENTE_COMPRA, EN_PROCESO, EN_TRANSITO y PENDIENTE_PAGO) y los heredados de la
 *    tienda y de fase 4 (PAGADO, BORRADOR, PENDIENTE_ANTICIPO, CONFIRMADO y PARCIALMENTE_DISPONIBLE). T3C r1: un pedido
 *    web PAGADO (webhooks.py) se sigue viendo y despachando.
 *  - Listo pero falta saldo / Listo para despachar: el paso 2 sin PARCIALMENTE_ENTREGADO (LISTO_ENTREGA, DISPONIBLE,
 *    PENDIENTE_SALDO y LISTO_PARA_ENTREGA), con saldo=pendiente (saldo_cop > 0) o saldo=pagado (saldo_cop ≤ 0).
 *  - Despachados (plegada): ENTREGADO, PARCIALMENTE_ENTREGADO y FACTURADO.
 * CANCELADO y DEVUELTO_TOTAL no están en ninguna (C19). Mueven tarjetas ADMIN, ASESOR y BODEGA (R15), y Bodega solo
 * despacha (update_pedido le acepta solo el paso a ENTREGADO, con la bodega de salida); los demás roles solo ven.
 */

import { congelar, ESTADOS_PEDIDO, ESTADOS_PEDIDO_SIN_DINERO, infoEstadoPedido, pasoPedido, transicionesPedido } from './estados-pedido.js';
import { definirColumnas, estadosDeColumnaLista, TEXTO_SOLO_VER } from './kanban.js';
import { estadoDeTarjeta, motivoTransicionPedido } from './kanban-ventas.js';
// B4 T24 f2 (F27): la ruta de Entregas, la única (a donde vuelve el pedido abierto desde un bloqueo).
import { RUTA_ENTREGAS } from './hub-ventas.js';
import { alertaEntregaPedido } from './listas-ventas.js';
import { formatoPesos, redondearPeso } from './pesos.js';
import { normalizarRol } from './chatter.js';
// B4 T24 f2 r1 (m17): quién despacha vive una sola vez en roles.js; aquí se reexporta con su nombre de hoy (f3, avisado).
import { puedeDespachar } from './roles.js';
import { enlaceDocumento } from './analisis.js';
import { queryListado } from './tabla.js';
import { numeroFinito } from './kpis.js';
import { waUrl } from './whatsapp.js';
import { textoDiaCorto } from './fechas-colombia.js';

/**
 * @typedef {import('./kanban.js').ResultadoSoltar} ResultadoSoltar
 * @typedef {'esperando' | 'falta_saldo' | 'listo' | 'despachado'} ClaveColumnaEntrega
 * @typedef {'pendiente' | 'pagado'} FiltroSaldo
 * @typedef {{clave: ClaveColumnaEntrega, titulo: string, tono: string, estados: ReadonlyArray<string>,
 *   saldo: FiltroSaldo | null, cerrada: boolean}} ColumnaEntrega
 */


const PASO_LISTO = congelar(['LISTO_ENTREGA', 'DISPONIBLE', 'PENDIENTE_SALDO', 'LISTO_PARA_ENTREGA']);
const DESPACHADOS = congelar(['ENTREGADO', 'PARCIALMENTE_ENTREGADO', 'FACTURADO']);

/**
 * Las cuatro columnas de Entregas (también sus pestañas; títulos de R15), cada una con los estados y el saldo con que
 * se pide al servidor (RP22). Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaEntrega>>}
 */
export const COLUMNAS_ENTREGA = /** @type {any} */ (definirColumnas([
  // B4 T24 r2 (C8): sky, el color de BASE (el tablero lo pinta: CLAVES_TONOS_KANBAN).
  { clave: 'esperando', titulo: 'Esperando mercancía', tono: 'sky',
    estados: Object.keys(ESTADOS_PEDIDO).filter((e) => columnaEntrega({ estado: e }) === 'esperando'), saldo: null },
  { clave: 'falta_saldo', titulo: 'Listo pero falta saldo', tono: 'amber', estados: [...PASO_LISTO], saldo: 'pendiente' },
  { clave: 'listo', titulo: 'Listo para despachar', tono: 'emerald', estados: [...PASO_LISTO], saldo: 'pagado' },
  { clave: 'despachado', titulo: 'Despachados', tono: 'slate', estados: [...DESPACHADOS], saldo: null, cerrada: true },
]));

const CLAVES_ENTREGA = congelar(COLUMNAS_ENTREGA.map((c) => c.clave));

/** El saldo del pedido en pesos (saldo_cop; el API puede mandarlo como texto); sin él, 0. */
function saldoDe(p) {
  const n = Number(p?.saldo_cop);
  return Number.isFinite(n) ? n : 0;
}

/**
 * La columna de Entregas de un pedido, en este orden (RP22):
 *  - CANCELADO o DEVUELTO_TOTAL -> null (no se muestran);
 *  - ENTREGADO, PARCIALMENTE_ENTREGADO o FACTURADO -> 'despachado' (antes que el paso 2: entregado en parte es paso 2);
 *  - paso 2 de estados-pedido -> 'falta_saldo' si saldo_cop > 0, o 'listo' si no (un crédito a favor no frena);
 *  - el resto -> 'esperando'.
 * Sirve para ubicar una tarjeta que cambió de estado (la que pasó a LISTO_ENTREGA queda en la que le toca por su saldo).
 * Es la misma regla de los `estados` de COLUMNAS_ENTREGA: lo que una columna le pide al servidor es lo que esta función
 * pone en ella.
 * @param {any} p
 * @returns {ClaveColumnaEntrega | null}
 */
export function columnaEntrega(p) {
  if (!p || typeof p !== 'object') return null;
  const estado = p.estado;
  if (ESTADOS_PEDIDO_SIN_DINERO.includes(estado)) return null;
  if (DESPACHADOS.includes(estado)) return 'despachado';
  if (pasoPedido(estado) === 2) return saldoDe(p) > 0 ? 'falta_saldo' : 'listo';
  return 'esperando';
}

const BODEGA_SOLO_DESPACHA = 'Bodega solo puede marcar el pedido como despachado.';

/** B4 T24 f2 r1 (m17): quién despacha desde Entregas (R15): ADMIN, ASESOR y BODEGA; la regla única es la de roles.js. */
export { puedeDespachar };

/**
 * Qué pasa al soltar un pedido de la columna `origen` en `destino` (claves de COLUMNAS_ENTREGA), con la forma de
 * kanban.js:
 *  - la misma columna: ninguno;
 *  - un rol que no es ADMIN, ASESOR ni BODEGA (normalizarRol; también sin rol): bloqueado 'Este tablero es solo para
 *    ver.' (TEXTO_SOLO_VER de kanban.js);
 *  - salir de Despachados: bloqueado con motivoTransicionPedido (N2);
 *  - → Despachados: acción 'despachar' (la pantalla abre el Drawer con la bodega de salida) solo desde «Listo para
 *    despachar»; desde «Listo pero falta saldo», bloqueado 'Falta cobrar el saldo de $X antes de despachar.'
 *    (formatoPesos); desde «Esperando mercancía», bloqueado 'La mercancía todavía no está lista para entrega.';
 *  - con el rol BODEGA, cualquier otro movimiento: bloqueado 'Bodega solo puede marcar el pedido como despachado.' (RP22);
 *  - → «Listo …» desde «Esperando mercancía»: cambio a LISTO_ENTREGA si transicionesPedido lo permite (la tarjeta queda
 *    en la columna que le toca por su saldo);
 *  - entre las dos «Listo» (las separa el saldo) o de vuelta a «Esperando mercancía»: bloqueado, con el enlace al pedido.
 * La columna de partida es la del pedido (columnaEntrega) y, si no tiene, `origen`.
 * @param {any} pedido
 * @param {string} origen
 * @param {string} destino
 * @param {{rol?: string | null}} [opciones]  el rol del usuario (getUsuarioActual().role); sin él, solo se ve
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarEntrega(pedido, origen, destino, { rol = null } = {}) {
  if (!CLAVES_ENTREGA.includes(/** @type {any} */ (destino))) {
    throw new Error(`Columna del tablero de entregas desconocida: ${String(destino)}`);
  }
  if (origen === destino) return { tipo: 'ninguno' };
  const estado = pedido?.estado;
  const desde = columnaEntrega(pedido) ?? origen;
  if (desde === destino) return { tipo: 'ninguno' };
  const rolNormal = normalizarRol(rol);
  // Los roles que mueven tarjetas en Entregas (R15): los que despachan (puedeDespachar); los demás solo ven el tablero.
  if (!puedeDespachar(rol)) return { tipo: 'bloqueado', motivo: TEXTO_SOLO_VER };
  const motivoN2 = (hacia) => motivoTransicionPedido(estado, hacia) ?? 'Un pedido despachado no vuelve atrás desde Entregas.';
  if (desde === 'despachado') {
    return { tipo: 'bloqueado', motivo: motivoN2(destino === 'esperando' ? 'EN_PROCESO' : 'LISTO_ENTREGA') };
  }
  if (destino === 'despachado') {
    if (desde === 'falta_saldo') {
      return { tipo: 'bloqueado', motivo: `Falta cobrar el saldo de ${formatoPesos(saldoDe(pedido))} antes de despachar.` };
    }
    if (desde !== 'listo') return { tipo: 'bloqueado', motivo: 'La mercancía todavía no está lista para entrega.' };
    // r2 (I3): la MISMA regla de la fila y del Drawer.
    return puedeDespacharPedido(pedido, rol)
      ? { tipo: 'accion', accion: 'despachar' } : { tipo: 'bloqueado', motivo: motivoN2('ENTREGADO') };
  }
  if (rolNormal === 'BODEGA') return { tipo: 'bloqueado', motivo: BODEGA_SOLO_DESPACHA };
  if (desde === 'esperando') {
    return transicionesPedido(estado).includes('LISTO_ENTREGA')
      ? { tipo: 'cambio', estado: 'LISTO_ENTREGA' } : { tipo: 'bloqueado', motivo: motivoN2('LISTO_ENTREGA') };
  }
  const href = enlaceDocumento('PVEN', pedido?.id, { returnTo: RUTA_ENTREGAS });
  const motivo = destino === 'esperando'
    ? 'Un pedido listo para entrega vuelve atrás desde el pedido, no desde Entregas.'
    : 'La columna la decide el saldo: el cobro se registra en el pedido.';
  return href ? { tipo: 'bloqueado', motivo, enlace: { texto: 'Abrir pedido', href } } : { tipo: 'bloqueado', motivo };
}

// ─── B4 T19: Inventario › Entregas (TABLA-inventario punto 10, KANBAN-logistica puntos 4 y 5, KPI-inventario punto 8; R5, R12, R15;
// RP22, RP23; C19): las consultas de la tabla y del tablero, los conteos de las pestañas, las tarjetas, el despacho y los textos ─

const objeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoLimpio = (v) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

/** La pestaña de trabajo de Entregas (la que abre la pantalla y a la que cae una sesión con una pestaña que ya no existe). */
export const VISTA_DE_TRABAJO_ENTREGA = 'listo';

/** La columna (pestaña) de una vista del estado; una que no existe cae en la de trabajo. */
function columnaDeLaVista(vista) {
  const clave = typeof vista === 'string' && CLAVES_ENTREGA.includes(/** @type {any} */ (vista)) ? vista : VISTA_DE_TRABAJO_ENTREGA;
  return /** @type {Readonly<ColumnaEntrega>} */ (COLUMNAS_ENTREGA.find((c) => c.clave === clave));
}

/**
 * Lo que la TABLA de Entregas le suma a la consulta de useListado (`extra`): las pestañas son las columnas del tablero (C19), así que
 * cada una pide al servidor los `estados` y el `saldo` de SU columna (GET /ventas/pedidos, T6B). `vista` va en null (el servidor no
 * tiene una vista 'listo': daría 422), y el semáforo y el paso de una sesión restaurada tampoco se mandan: Entregas no los tiene.
 * El filtro de «Filtrar estado» se cruza con los de la pestaña; un filtro que la pestaña no tiene gana (lo que se pide es lo que
 * FiltroEstados muestra, como en Traslados). CANCELADO y DEVUELTO_TOTAL no están en ninguna columna: nunca salen sin pedirlos.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @returns {{vista: null, semaforo: null, paso: null, estados: string[], saldo: FiltroSaldo | null}}
 */
export function consultaEntregas(estado) {
  const columna = columnaDeLaVista(estado?.vista);
  const elegidos = Array.isArray(estado?.estados) ? estado.estados : [];
  const cruce = elegidos.filter((e) => columna.estados.includes(e));
  const estados = elegidos.length === 0 ? [...columna.estados] : cruce.length > 0 ? cruce : [...elegidos];
  return { vista: null, semaforo: null, paso: null, estados, saldo: columna.saldo };
}

/**
 * La consulta de una columna del tablero de Entregas en modo servidor (R11, C4, D39): los estados de la columna cruzados con el
 * filtro de la pantalla (estadosDeColumnaLista), su saldo, la búsqueda del MISMO estado, y el orden, el límite y el desplazamiento
 * de la columna (limit=0 en la plegada, lo da useTableroKanban). La pestaña NO viaja: el tablero trae las cuatro columnas. Sin
 * ningún estado en común, null (la columna queda vacía sin pedir nada). La respuesta trae el `resumen` de H47 de la columna.
 * @param {import('./tabla.js').EstadoTabla} estado
 * @param {{estados?: ReadonlyArray<string>, saldo?: FiltroSaldo | null} | null | undefined} columna
 * @param {{orden: string | null, limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaEntrega(estado, columna, { orden, limit, offset }) {
  const estados = estadosDeColumnaLista(columna, estado?.estados);
  if (estados.length === 0) return null;
  return queryListado(estado, { vista: null, semaforo: null, paso: null, estados, saldo: columna?.saldo ?? null, orden, limit, offset });
}

/**
 * El conteo de una pestaña: los estados y el saldo de su columna, con la BÚSQUEDA del estado (R5; no sus estados ni su pestaña) y con limit=0 (el servidor devuelve solo el total). La tarjeta Despachados usa este MISMO número (R12, I1 de T18).
 * @param {{estados: ReadonlyArray<string>, saldo?: FiltroSaldo | null}} columna
 * @param {{q?: string} | null | undefined} estado
 * @returns {string}
 */
export function consultaConteoEntrega(columna, estado) {
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  return queryListado(null, {
    vista: null, semaforo: null, paso: null, q: q || null, estados: [...columna.estados], orden: null, limit: 0, offset: 0,
    saldo: columna.saldo ?? null,
  });
}

/**
 * Las pestañas de Entregas = las columnas del tablero (R15, C19), con los conteos de consultaConteoEntrega ({esperando,
 * falta_saldo, listo, despachado}); lo que no llega (o no es un número) queda en null: la barra gris, nunca 0. «Listo pero
 * falta saldo» va en ámbar si hay alguno.
 * @param {any} conteos
 * @returns {{id: string, etiqueta: string, conteo: number | null, alerta: boolean}[]}
 */
export function pestanasEntrega(conteos) {
  const c = objeto(conteos) ? conteos : {};
  return COLUMNAS_ENTREGA.map((col) => {
    const conteo = numeroFinito(c[col.clave]);
    return { id: col.clave, etiqueta: col.titulo, conteo, alerta: col.clave === 'falta_saldo' && (conteo ?? 0) > 0 };
  });
}

/**
 * Lo que pintan las 3 tarjetas de Entregas (KPI-inventario punto 8): «Pedidos en curso» (pven_en_curso) y «Saldo antes de
 * despachar» (pven_saldo_en_curso) de `data.kpis` de GET /ventas/stats, y «Pedidos despachados» = el conteo de la pestaña
 * Despachados (el MISMO número que ve la pestaña: ENTREGADO + PARCIALMENTE_ENTREGADO + FACTURADO, RP22). Cada número pasa por
 * numeroFinito: lo que falta es null (la barra gris o «—»), nunca 0. Solo la tercera equivale a una vista: las otras dos son
 * informativas.
 * @param {any} kpis
 * @param {any} conteos  los de pestanasEntrega
 * @returns {{en_curso: {valor: number | null}, saldo: {valor: number | null}, despachados: {valor: number | null}}}
 */
export function tarjetasEntregas(kpis, conteos) {
  const k = objeto(kpis) ? kpis : {};
  const c = objeto(conteos) ? conteos : {};
  return {
    en_curso: { valor: numeroFinito(k.pven_en_curso) },
    saldo: { valor: numeroFinito(k.pven_saldo_en_curso) },
    despachados: { valor: numeroFinito(c.despachado) },
  };
}

/** La nota bajo las tarjetas de Entregas; reemplaza la tarjeta de «Protocolo 60/40», que era un párrafo (KPI-inventario punto 8). */
export const NOTA_ENTREGAS = 'Si la mercancía llegó y falta el saldo, contacta al cliente antes de generar la guía.';

/** El saldo de un pedido en pesos (saldo_cop; el API puede mandarlo como texto), también el de uno a favor (negativo). */
export function saldoEntrega(p) {
  return saldoDe(p);
}

/**
 * El cobro de un pedido, para la columna «Cobro» de la tabla y el Drawer: «Cobro pendiente» con saldo, «Pagado» sin él (un
 * crédito a favor no frena el despacho).
 * @param {any} p
 * @returns {{label: string, clases: {bg: string, text: string, border: string}}}
 */
export function infoCobroEntrega(p) {
  return saldoDe(p) > 0
    ? { label: 'Cobro pendiente', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } }
    : { label: 'Pagado', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } };
}

/**
 * La entrega estimada del pedido ('20 nov 2026'; sin fecha, '—'). Es una FECHA DE NEGOCIO ('2026-11-20T00:00:00'): se toma su día
 * (diaDeNegocio) y no se pasa a otra zona, o saldría un día antes (B4 T9 r1 I2). La usan la tarjeta y la columna «Entrega est.».
 * B4 T24 (FINAL-m29): antes textoEntregaEstimada, el mismo nombre que la de lib/documento-comercial.js con otro contrato.
 * @param {any} p
 * @returns {string}
 */
export function textoEntregaTablero(p) {
  return textoDiaCorto(p?.fecha_entrega_estimada);
}

/**
 * La tarjeta del tablero de Entregas (KANBAN-logistica punto 4): el PVEN, el cliente, los ítems, el total, el estado y el chip
 * «Saldo $X» (o «Pagado»). El recordatorio por WhatsApp va en el menú ⋯ de la tarjeta (recordatorioSaldo), no aquí.
 * @param {any} p
 * @returns {import('./kanban-ventas.js').TarjetaVentas}
 */
export function tarjetaEntrega(p) {
  const n = Array.isArray(p?.productos) ? p.productos.length : 0;
  const saldo = saldoDe(p);
  const entrega = textoEntregaTablero(p);
  return {
    numero: String(p?.numero ?? p?.id ?? ''),
    tipo: 'PVEN',
    titulo: textoLimpio(p?.customer_name) ?? 'Cliente sin nombre',
    subtitulo: n === 0 ? 'Sin ítems' : `${n} ${n === 1 ? 'ítem' : 'ítems'}`,
    monto: numeroFinito(p?.total_cop),
    estado: estadoDeTarjeta('PVEN', p?.estado),
    chips: [saldo > 0
      ? { texto: `Saldo ${formatoPesos(redondearPeso(saldo))}`, tono: 'amber' }
      : { texto: 'Pagado', tono: 'emerald' }],
    tiempo: entrega !== '—' ? `Entrega ${entrega}` : null,
    atrasada: alertaEntregaPedido(p) === 'vencida',
    accionPrincipal: null,
  };
}

/**
 * El recordatorio de saldo por WhatsApp (Bloque 1, H5: lib/whatsapp.js): {url, texto} con el teléfono del pedido
 * (telefono_whatsapp y, si no, customer_phone: los nombres de _ven_dict). null si no hay saldo por cobrar o el pedido no tiene
 * teléfono (no se muestra la acción).
 * @param {any} p
 * @returns {{url: string, texto: string} | null}
 */
export function recordatorioSaldo(p) {
  const saldo = saldoDe(p);
  if (saldo <= 0) return null;
  const texto = `Hola ${textoLimpio(p?.customer_name) ?? ''}! Tu pedido ${p?.numero ?? ''} ya llegó a bodega Nebulae 🎉. Para proceder con el despacho nacional, puedes cancelar el saldo restante de ${formatoPesos(redondearPeso(saldo))}.`;
  const url = waUrl(textoLimpio(p?.telefono_whatsapp) ?? p?.customer_phone, texto);
  return url ? { url, texto } : null;
}

/**
 * Lo que va debajo del título de una columna del tablero: la suma de H47 de su consulta (`resumen` de GET /ventas/pedidos).
 * «Listo pero falta saldo» suma el SALDO («Saldo $1.250.000»); las demás, el monto. Sin un número, null.
 * @param {string} clave
 * @param {unknown} resumen
 * @returns {string | null}
 */
export function resumenColumnaEntrega(clave, resumen) {
  if (!objeto(resumen)) return null;
  const r = /** @type {any} */ (resumen);
  const valor = clave === 'falta_saldo' ? r.saldo_cop : r.monto_cop;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return null;
  const texto = formatoPesos(redondearPeso(valor));
  return clave === 'falta_saldo' ? `Saldo ${texto}` : texto;
}

const AYUDA_BUSQUEDA_ENTREGAS = 'Ajusta la búsqueda o el filtro de estados.';

/**
 * Lo que dice la tabla de Entregas cuando no hay filas: el filtro de estados, la búsqueda o la pestaña (qué la deja vacía).
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioEntregas(estado) {
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ningún pedido con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: AYUDA_BUSQUEDA_ENTREGAS };
  const clave = columnaDeLaVista(estado?.vista).clave;
  if (clave === 'esperando') return { titulo: 'No hay pedidos esperando mercancía', ayuda: null };
  if (clave === 'falta_saldo') return { titulo: 'No hay pedidos con saldo por cobrar', ayuda: 'Aquí esperan los pedidos listos a los que les falta cobrar el saldo.' };
  if (clave === 'despachado') return { titulo: 'Aún no hay pedidos despachados', ayuda: null };
  return { titulo: 'No hay pedidos listos para despachar', ayuda: 'Un pedido pasa aquí cuando la mercancía llegó y el saldo está cobrado.' };
}

const OPCIONES_DE_LA_PESTANA = congelar(Object.fromEntries(COLUMNAS_ENTREGA.map((c) => [c.clave,
  congelar(c.estados.map((e) => congelar({ valor: e, etiqueta: infoEstadoPedido(e).label })))])));

/**
 * «Filtrar estado» de la tabla de Entregas: los estados de la pestaña `vista`; una que no existe, los de la pestaña de trabajo.
 * La misma referencia para la misma vista. Inmutable.
 * @param {unknown} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosEntrega(vista) {
  return OPCIONES_DE_LA_PESTANA[columnaDeLaVista(vista).clave];
}

/**
 * «Filtrar estado» del tablero de Entregas: una opción por estado principal de columna. Las dos columnas «Listo» comparten el
 * suyo (LISTO_ENTREGA): marcarlo muestra las dos enteras. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_ENTREGA = congelar([
  congelar({ valor: 'PENDIENTE_COMPRA', etiqueta: 'Esperando mercancía' }),
  congelar({ valor: 'LISTO_ENTREGA', etiqueta: 'Listo para entrega' }),
  congelar({ valor: 'ENTREGADO', etiqueta: 'Despachados' }),
]);

// ─── el despacho (RP23): Bodega manda lo mínimo; ADMIN y ASESOR, lo de hoy sin fecha_entrega ─────────────────────────────

/** ¿El despacho exige elegir la bodega? Siempre con Bodega (RP23); con ADMIN y ASESOR, solo si el pedido tiene líneas de catálogo. */
export function bodegaObligatoria(pedido, rol) {
  if (normalizarRol(rol) === 'BODEGA') return true;
  return Array.isArray(pedido?.productos) && pedido.productos.some((p) => Boolean(p?.sku_id));
}

const MENSAJE_FALTA_BODEGA = 'Selecciona la bodega de despacho antes de continuar';

/** El aviso de que falta elegir la bodega (null si no hace falta o ya está elegida). */
export function mensajeFaltaBodega(pedido, { rol, warehouseId }) {
  const elegida = String(warehouseId ?? '').trim() !== '';
  return bodegaObligatoria(pedido, rol) && !elegida ? MENSAJE_FALTA_BODEGA : null;
}

/**
 * El cuerpo del PATCH /ventas/pedidos/{id} del despacho (RP23, con el ajuste de la verificación):
 *  - BODEGA: EXACTAMENTE {estado: 'ENTREGADO', warehouse_id} (otra clave da 403 «Bodega solo puede marcar el pedido como
 *    despachado.»; el autor sale de la sesión);
 *  - ADMIN y ASESOR: lo de hoy sin `fecha_entrega` (no se guarda): {estado, warehouse_id (si se eligió), notas}, con la misma nota
 *    de siempre ('Despachado desde mesa de entregas' o la anterior con «| Despachado el …»).
 * @param {any} pedido
 * @param {{rol?: string | null, warehouseId?: string | number | null, hoy?: string}} opciones  `hoy`: el día en texto (pruebas)
 * @returns {{estado: 'ENTREGADO', warehouse_id?: number, notas?: string}}
 */
export function cuerpoDespacho(pedido, { rol, warehouseId, hoy = new Date().toLocaleDateString() } = {}) {
  const n = Number.parseInt(String(warehouseId ?? ''), 10);
  const bodega = Number.isFinite(n) ? n : undefined;
  if (normalizarRol(rol) === 'BODEGA') return { estado: 'ENTREGADO', warehouse_id: /** @type {any} */ (bodega) };
  const cuerpo = /** @type {{estado: 'ENTREGADO', warehouse_id?: number, notas?: string}} */ ({ estado: 'ENTREGADO' });
  if (bodega !== undefined) cuerpo.warehouse_id = bodega;
  cuerpo.notas = pedido?.notas ? `${pedido.notas} | Despachado el ${hoy}` : 'Despachado desde mesa de entregas';
  return cuerpo;
}

/**
 * Lo que pregunta confirmar() de useAvisos antes de despachar (RP23: ya no window.confirm): con saldo por cobrar, la alerta de
 * cobro con el monto real (ya no «40 %»); sin él, la confirmación normal. Las dos dicen el cliente y la bodega de salida.
 * @param {any} pedido
 * @param {string | null | undefined} nombreBodega
 * @returns {{titulo: string, mensaje: string, efectos: string[], textoConfirmar: string, peligro: boolean}}
 */
export function confirmacionDespacho(pedido, nombreBodega) {
  const saldo = saldoDe(pedido);
  const numero = textoLimpio(pedido?.numero) ?? 'el pedido';
  const efectos = [`Cliente: ${textoLimpio(pedido?.customer_name) ?? 'Sin nombre'}`];
  if (textoLimpio(nombreBodega)) efectos.push(`Bodega de salida: ${textoLimpio(nombreBodega)}`);
  if (saldo > 0) {
    return {
      titulo: 'Alerta de cobro',
      mensaje: `El pedido ${numero} tiene un saldo pendiente de ${formatoPesos(redondearPeso(saldo))}. ¿Autorizas la salida de bodega antes de verificar el pago?`,
      efectos, textoConfirmar: 'Despachar con saldo pendiente', peligro: true,
    };
  }
  return {
    titulo: `Despachar ${numero}`,
    mensaje: 'El pedido pasa a Entregado y, si tiene productos de catálogo, se descuenta su stock de la bodega elegida.',
    efectos, textoConfirmar: 'Despachar', peligro: false,
  };
}

/**
 * La ÚNICA regla de «se puede despachar este pedido» (la fila, el Drawer y el tablero: reglaSoltarEntrega la llama; B4 T19 r2, I3):
 * el rol despacha (ADMIN, ASESOR, BODEGA) y el pedido está en «Listo para despachar» o es un PARCIALMENTE_ENTREGADO que se termina de
 * entregar (como en BASE), SIN saldo por cobrar (el brief: «despachar solo desde Listo para despachar»; con saldo, primero se cobra); y
 * transicionesPedido deja pasar a ENTREGADO. Nunca desde «Esperando mercancía» ni «Listo pero falta saldo», ni un pedido ya
 * despachado, cancelado o devuelto.
 * @param {any} pedido
 * @param {string | null | undefined} rol
 * @returns {boolean}
 */
export function puedeDespacharPedido(pedido, rol) {
  if (!pedido || typeof pedido !== 'object' || !puedeDespachar(rol)) return false;
  const sePuede = columnaEntrega(pedido) === 'listo' || (pedido.estado === 'PARCIALMENTE_ENTREGADO' && saldoDe(pedido) <= 0);
  return sePuede && transicionesPedido(pedido.estado).includes('ENTREGADO');
}

/**
 * «Marcar Saldo Cobrado» (PATCH saldo_cop): solo ADMIN y ASESOR; el servidor le responde 403 a Bodega y a los demás (RP23). B4 T24
 * (FINAL-m31): es esAdminOAsesor de lib/roles.js, la una sola copia de las reglas de rol (reexportada con su nombre de siempre).
 */
export { esAdminOAsesor as puedeCobrarSaldo } from './roles.js';

/** La pestaña que abre una tarjeta de Entregas (la única pulsable es la de Despachados); las demás son informativas: null. */
export function vistaDeTarjetaEntrega(kpi) {
  return kpi === 'ent_despachados' ? 'despachado' : null;
}
