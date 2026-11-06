/**
 * Reglas compartidas por las listas de Ventas (Solicitudes, Cotizaciones, Pedidos) y el Hub. JS plano para probarlo
 * con node (frontend/tests/test_listas_ventas.mjs), como busqueda.js y pricing.js.
 *
 *  - N8: diasAlerta, los dias de alerta guardados en Configuracion.
 *  - COT-LISTA: pedidoVigente / soloPedidosCancelados / pestanaCotizacion de una cotizacion (con su `pedidos_venta`
 *    ligero de la lista o completo del detalle). H46: ultimoPedidoCancelado.
 *  - H47: resumenPedidos / kpisPedidos de la lista de pedidos (el dinero no suma cancelados ni devueltos).
 *  - N10: opcionesFiltroEstado del filtro de estado de la lista de pedidos.
 *  - H32 / N4 / N7 (Solicitudes): generoCotizacion / cotizacionesVigentes / contadoresSolicitudes / tasaConversionCotizacion
 *    de la lista, superaDiasAlerta (N8), resumenCancelacionSolicitudes, estadoEnPapelera y pasosParaCancelarSolicitud.
 *  - T11 (ronda visual): pistaActivasSolicitudes (tarjeta ACTIVAS, V7), posicionMenuFila (menú «⋮» de la fila, V2) y
 *    botonALaVista (ronda 1: el menú se cierra si su botón sale de la vista); recortesDeAncestros (revisión final: la
 *    parte pura de recortesDe de solicitud-client.tsx).
 */
import {
  ESTADOS_PEDIDO_CERRADOS, ESTADOS_PEDIDO_SIN_DINERO, grupoPedido, esCotizacionActiva, esPedidoVigente,
} from './estados-pedido.js';
import { comoUTC, esSoporte } from './hub-ventas.js';
import { redondearPeso, formatoPesos } from './pesos.js';
import { diaColombia, fechaSolo } from './fechas-colombia.js';
import { TEXTO_PAPELERA_SIN_FECHA } from './estados-solicitud.js';
import { normalizarTarifaIva, TARIFA_IVA_POR_DEFECTO } from './iva.js';

/**
 * Dias de alerta de `clave` (alerta_sc_dias, alerta_cot_dias, alerta_ven_dias) en la configuracion. Acepta la
 * respuesta cruda de GET /ventas/config ({status, data: {clave: {value}}}), el dict interno ({clave: {value}}) y lo
 * que guarda el Hub tras "Guardar" ({clave: '3'}). Sin un numero valido mayor que 0 devuelve `porDefecto`.
 * @param {any} cfg
 * @param {string} clave
 * @param {number} [porDefecto]
 * @returns {number}
 */
export function diasAlerta(cfg, clave, porDefecto = 2) {
  const fuente = cfg && typeof cfg.data === 'object' && cfg.data !== null ? cfg.data : cfg;
  const crudo = fuente?.[clave];
  const n = Number(typeof crudo === 'object' && crudo ? crudo.value : crudo);
  return Number.isFinite(n) && n > 0 ? n : porDefecto;
}

/**
 * B3 T16: el valor guardado de `clave` como texto (las tres formas de diasAlerta), o null si no esta. Solo claves
 * propias (una clave 'toString' no encuentra nada); un numero o un booleano pasan a texto, como los guarda admin_config.
 * @param {any} cfg
 * @param {string} clave
 * @returns {string | null}
 */
export function valorConfig(cfg, clave) {
  const fuente = cfg && typeof cfg.data === 'object' && cfg.data !== null ? cfg.data : cfg;
  if (!fuente || typeof fuente !== 'object' || !Object.hasOwn(fuente, clave)) return null;
  const crudo = fuente[clave];
  const valor = typeof crudo === 'object' && crudo !== null ? crudo.value : crudo;
  if (typeof valor === 'string') return valor;
  return typeof valor === 'number' || typeof valor === 'boolean' ? String(valor) : null;
}

/**
 * B3 T16: el entero de `clave` acotado a [minimo, maximo], como admin_config.entero_acotado/config_entero del backend:
 * un texto de digitos (con signo y espacios en los bordes) fuera de rango usa el limite; lo que no es un entero ('abc',
 * '2.5', '', un booleano) o no esta, `defecto`.
 * @param {any} cfg
 * @param {string} clave
 * @param {number} defecto
 * @param {number} minimo
 * @param {number} maximo
 * @returns {number}
 */
export function enteroConfig(cfg, clave, defecto, minimo, maximo) {
  const valor = valorConfig(cfg, clave);
  const texto = typeof valor === 'string' ? valor.trim() : '';
  if (!/^[+-]?\d+$/.test(texto)) return defecto;
  return Math.max(minimo, Math.min(maximo, Number(texto)));
}

/**
 * B3 T17 (IVA punto 13): la tarifa de IVA por defecto de Configuración (iva_tarifa_defecto, en cualquiera de las formas
 * de valorConfig), normalizada; '19' (R8, como el servidor) si no está o no es válida. Con ella arranca el Cotizador
 * Rápido.
 * @param {any} cfg
 * @returns {string}
 */
export function tarifaIvaDeConfig(cfg) {
  return normalizarTarifaIva(valorConfig(cfg, 'iva_tarifa_defecto')) ?? TARIFA_IVA_POR_DEFECTO;
}

/** B3 T7/T16 (U22-validez): dias_validez_cotizacion, de 1 a 60 y 5 por defecto (DIAS_VALIDEZ_COT_* del backend). */
export const DIAS_VALIDEZ_COTIZACION = Object.freeze({ defecto: 5, minimo: 1, maximo: 60 });

/**
 * B3 T16 r1: si GET /ventas/config llego de verdad (el sobre {status, data} con data como objeto). Un GET que fallo
 * (null en loadData) u otra cosa: false. Una admin_config vacia ({data: {}}, instalacion nueva) si cuenta: el backend
 * no la distingue del except de get_config, y cuerpoGuardarConfig igual manda solo lo que se cambio.
 * @param {unknown} respuesta
 * @returns {boolean}
 */
export function configLeida(respuesta) {
  if (!respuesta || typeof respuesta !== 'object') return false;
  const data = /** @type {any} */ (respuesta).data;
  return typeof data === 'object' && data !== null && !Array.isArray(data);
}

/**
 * B4 T7 r1 (m12): los valores de GET /ventas/config para el ConfigPanel del Hub. El sobre {status, data} se desenvuelve
 * (`cfg.data || cfg`, como hacía fusionarCargaHub); lo que no es un objeto da null y no reemplaza lo que hay en pantalla.
 * @param {unknown} cfg
 * @returns {Record<string, any> | null}
 */
export function configDeRespuesta(cfg) {
  if (!cfg || typeof cfg !== 'object') return null;
  const datos = /** @type {any} */ (cfg).data || cfg;
  return datos && typeof datos === 'object' ? datos : null;
}

/**
 * Revision final B3 (F2, M16): el porque de «Ajustar Tiempos» y «Configuracion» del Hub deshabilitados mientras
 * GET /ventas/config no llega (configLeida): ante un error de red pasajero, el boton gris dice que hacer.
 */
export const AVISO_CONFIG_SIN_LEER = 'No se pudo leer la configuración: pulsa Actualizar.';

/**
 * B3 T16 r1: el cuerpo de PATCH /ventas/config del «Guardar Configuracion» del Hub. Solo las claves cuyo valor cambio
 * frente a la foto `inicial` con que se abrio el panel (comparadas como texto; una clave nueva cuenta como cambio y
 * nunca se borra una que falte), para no pisar con un valor por defecto lo que nadie toco. null si la configuracion no
 * se ha leido de verdad (`cargada` distinto de true): no se puede guardar.
 * @param {Record<string, unknown> | null | undefined} inicial
 * @param {Record<string, unknown> | null | undefined} actual
 * @param {boolean | undefined} cargada
 * @returns {Record<string, unknown> | null}
 */
export function cuerpoGuardarConfig(inicial, actual, cargada) {
  if (cargada !== true || !actual || typeof actual !== 'object') return null;
  const base = inicial && typeof inicial === 'object' ? inicial : {};
  const cuerpo = {};
  for (const [clave, valor] of Object.entries(actual)) {
    if (!Object.hasOwn(base, clave) || String(base[clave]) !== String(valor)) cuerpo[clave] = valor;
  }
  return cuerpo;
}

const pedidosDe = (cot) => (Array.isArray(cot?.pedidos_venta) ? cot.pedidos_venta.filter((v) => v && typeof v === 'object') : []);

/**
 * B5: el pedido vigente (no CANCELADO) mas NUEVO de la cotizacion, o null; el mismo que elige el servidor
 * (_pven_vigente_de_cotizacion). El GET los trae por id, del mas viejo al mas nuevo.
 */
export function pedidoVigente(cot) {
  const vigentes = pedidosDe(cot).filter((v) => v.estado !== 'CANCELADO');
  return vigentes.length > 0 ? vigentes[vigentes.length - 1] : null;
}

/** La cotizacion tuvo pedidos y todos estan CANCELADO (se puede ajustar y reenviar: cuenta como activa). */
export function soloPedidosCancelados(cot) {
  const pedidos = pedidosDe(cot);
  return pedidos.length > 0 && pedidos.every((v) => v.estado === 'CANCELADO');
}

/** H46: el pedido CANCELADO mas reciente de la cotizacion (el GET los trae por id, del mas viejo al mas nuevo), o null. */
export function ultimoPedidoCancelado(cot) {
  const cancelados = pedidosDe(cot).filter((v) => v.estado === 'CANCELADO');
  return cancelados.length > 0 ? cancelados[cancelados.length - 1] : null;
}

/**
 * H46 / N1: que toca con el pedido de una cotizacion. `confirmacion_vigente` (GET de la COT y filas de la lista) es la
 * confirmacion del cliente sin usar (gate2_confirmed_at): la pone el enlace en cada confirmacion y la consume la
 * conversion; sin ella el servidor no convierte.
 *  - 'pedido_vigente': ya tiene un pedido que no esta cancelado.
 *  - 'crear_pedido': CONFIRMADA con la confirmacion del cliente vigente y sin pedido vigente. Incluye la re-confirmada
 *    por el cliente tras cancelar el pedido (flujo normal de H46: el pedido nuevo recibe el saldo a favor, R6).
 *  - 'reabrir': CONFIRMADA sin confirmacion vigente y sin pedido vigente: el servidor no la convierte (400). Con un
 *    pedido cancelado es el dato antiguo de antes de que la cancelacion devolviera sola la COT a Borrador; sin pedidos,
 *    una confirmacion anterior a Gate 2. Hay que reabrirla y enviarla de nuevo al cliente.
 *  - null: cualquier otro estado.
 * `cancelado` es el ultimo pedido cancelado cuando no hay vigente; `avisoCancelado` dice si mostrar el aviso "Pedido X
 * cancelado: ajusta y reenvia" (no tiene sentido si el cliente ya la confirmo otra vez).
 * @returns {{paso: 'pedido_vigente' | 'crear_pedido' | 'reabrir' | null, vigente: any, cancelado: any, avisoCancelado: boolean}}
 */
export function situacionPedidoCotizacion(cot) {
  const vigente = pedidoVigente(cot);
  const cancelado = vigente ? null : ultimoPedidoCancelado(cot);
  const confirmacion = !!cot?.confirmacion_vigente;
  let paso = null;
  if (vigente) paso = 'pedido_vigente';
  else if (cot?.estado === 'CONFIRMADA') paso = confirmacion ? 'crear_pedido' : 'reabrir';
  return { paso, vigente, cancelado, avisoCancelado: !!cancelado && !confirmacion };
}

/**
 * COT-LISTA: pestaña de la lista de Cotizaciones. Una CONFIRMADA que hay que reabrir (sin confirmacion vigente ni
 * pedido vigente) vuelve a 'Activas'; las demas confirmadas son 'Confirmadas': con pedido vigente o por convertir
 * (tambien la re-confirmada por el cliente tras cancelar su pedido).
 * @returns {'Activas' | 'Confirmadas' | 'Rechazadas'}
 */
export function pestanaCotizacion(cot) {
  if (cot?.estado === 'RECHAZADA') return 'Rechazadas';
  if (cot?.estado === 'CONFIRMADA' && situacionPedidoCotizacion(cot).paso !== 'reabrir') return 'Confirmadas';
  return 'Activas';
}

// ─── H47: resumen de la lista de pedidos ────────────────────────────────────────────────────────────

/**
 * Pedidos cuyo dinero no cuenta (ni vendido ni por cobrar). B4 T2 (RP14): la constante vive en estados-pedido.js y aquí
 * solo se reexporta (la usan pedidoSumaDinero y cifrasVentasDashboard con su nombre local).
 */
export { ESTADOS_PEDIDO_SIN_DINERO };

const esObjeto = (v) => v !== null && typeof v === 'object';

/** El pedido suma en los montos de la lista (no esta cancelado ni devuelto por completo). */
export function pedidoSumaDinero(p) {
  return esObjeto(p) && !ESTADOS_PEDIDO_SIN_DINERO.includes(p.estado);
}

/**
 * Resumen calculado en el navegador con la misma regla del servidor (si la respuesta no trae `resumen`): `total` y
 * `por_estado` cuentan todos los pedidos; monto, saldo y anticipo solo los que suman dinero, en pesos enteros. Las
 * lineas null o que no son objeto se ignoran.
 * @returns {{total: number, monto_cop: number, saldo_cop: number, anticipo_cop: number, por_estado: Record<string, number>}}
 */
export function resumenPedidos(pedidos) {
  const r = { total: 0, monto_cop: 0, saldo_cop: 0, anticipo_cop: 0, por_estado: {} };
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    if (!esObjeto(p)) continue;
    r.total += 1;
    r.por_estado[p.estado] = (r.por_estado[p.estado] || 0) + 1;
    if (!pedidoSumaDinero(p)) continue;
    r.monto_cop += Number(p.total_cop) || 0;
    r.saldo_cop += Number(p.saldo_cop) || 0;
    r.anticipo_cop += Number(p.anticipo_cop) || 0;
  }
  r.monto_cop = redondearPeso(r.monto_cop);
  r.saldo_cop = redondearPeso(r.saldo_cop);
  r.anticipo_cop = redondearPeso(r.anticipo_cop);
  return r;
}

/**
 * Cifras de las tarjetas de Pedidos de Venta: del resumen del servidor (todos los pedidos del filtro, sin el tope de
 * 200) o, si no vino, del navegador sobre los cargados. `activos` = total menos los cerrados (entregados, facturados,
 * cancelados y devueltos); `cargados` = cuantos trajo la lista.
 */
export function kpisPedidos(resumenServidor, pedidos) {
  const r = esObjeto(resumenServidor) ? resumenServidor : resumenPedidos(pedidos);
  const pe = esObjeto(r.por_estado) ? r.por_estado : {};
  const total = Number(r.total) || 0;
  const cerrados = ESTADOS_PEDIDO_CERRADOS.reduce((s, e) => s + (Number(pe[e]) || 0), 0);
  return {
    total,
    monto: Number(r.monto_cop) || 0,
    saldo: Number(r.saldo_cop) || 0,
    anticipo: Number(r.anticipo_cop) || 0,
    pCompra: Number(pe.PENDIENTE_COMPRA) || 0,
    // Los de la pestaña 'Cancelado' (cancelados y devueltos por completo).
    cancelados: Object.keys(pe).filter((e) => grupoPedido(e) === 'Cancelado').reduce((s, e) => s + (Number(pe[e]) || 0), 0),
    activos: Math.max(0, total - cerrados),
    cargados: Array.isArray(pedidos) ? pedidos.length : 0,
    porEstado: pe,
  };
}

/** Pista de la tarjeta 'Total Pedidos': '15 activos · 12 cancelados · se ven los 200 más recientes'. */
export function hintTotalPedidos(k) {
  return `${k.activos} activos`
    + (k.cancelados > 0 ? ` · ${k.cancelados} cancelados` : '')
    + (k.total > k.cargados ? ` · se ven los ${k.cargados} más recientes` : '');
}

/**
 * B1 (R8): la misma ruta sin el parametro `nombre` y con los demas intactos (p. ej. quitar ?accion=cancelar tras abrir
 * el modal de cancelacion, conservando return_to). `query` es lo que da useSearchParams() o su texto.
 * @returns {string}
 */
export function rutaSinParametro(ruta, query, nombre) {
  const q = new URLSearchParams(query ? query.toString() : '');
  q.delete(nombre);
  const resto = q.toString();
  return resto ? `${ruta}?${resto}` : ruta;
}

/**
 * A4 (H47): ventas, cartera pendiente y ticket promedio del Dashboard General con la regla de la lista de pedidos
 * (kpisPedidos): el resumen de GET /ventas/pedidos (todos los pedidos, no solo la pagina) o, si no vino,
 * resumenPedidos sobre los cargados. Ni las ventas ni la cartera suman pedidos cancelados o devueltos por completo; la
 * cartera es el saldo de cada pedido (lo que falta cobrar, abonos incluidos), no total - anticipo. El ticket reparte
 * las ventas entre los pedidos que suman dinero. Acepta la respuesta del API o la lista de pedidos.
 * @returns {{ventas: number, cartera: number, ticket: number}}
 */
export function cifrasVentasDashboard(respuesta) {
  const pedidos = Array.isArray(respuesta) ? respuesta : (Array.isArray(respuesta?.data) ? respuesta.data : []);
  const k = kpisPedidos(esObjeto(respuesta?.resumen) ? respuesta.resumen : null, pedidos);
  let conDinero = 0;
  for (const [estado, n] of Object.entries(k.porEstado)) {
    if (!ESTADOS_PEDIDO_SIN_DINERO.includes(estado)) conDinero += Number(n) || 0;
  }
  const ventas = redondearPeso(k.monto);
  return { ventas, cartera: redondearPeso(k.saldo), ticket: conDinero > 0 ? Math.round(ventas / conDinero) : 0 };
}

// ─── N10: filtro de estado de la lista de pedidos ────────────────────────────────────────────────────

const FILTRO_ESTADOS_BASE = Object.freeze(['PENDIENTE_COMPRA', 'PENDIENTE_PAGO', 'EN_PROCESO', 'EN_TRANSITO',
  'LISTO_ENTREGA', 'ENTREGADO', 'FACTURADO', 'CANCELADO']);

/**
 * Estados que ofrece 'Filtrar Estado': los habituales y, al final, cualquier otro que traigan los pedidos cargados
 * (p. ej. PENDIENTE_SALDO de fase4), sin repetir. La pantalla los muestra con su etiqueta (infoEstadoPedido).
 * @returns {string[]}
 */
export function opcionesFiltroEstado(pedidos) {
  const opciones = [...FILTRO_ESTADOS_BASE];
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    const e = esObjeto(p) && typeof p.estado === 'string' ? p.estado.trim() : '';
    if (e && !opciones.includes(e)) opciones.push(e);
  }
  return opciones;
}

// ─── H32 / N4 / N7: lista y detalle de Solicitudes ───────────────────────────────────────────────────

/** Tipo de las solicitudes que se cotizan (las de soporte o devolucion nunca generan cotizacion). */
const TIPO_SC_COTIZABLE = 'Cotizacion de Producto';

const cotizacionesDe = (sc) => (Array.isArray(sc?.cotizaciones) ? sc.cotizaciones.filter(esObjeto) : []);

/**
 * H32: la solicitud generó cotización = tiene al menos una con su sc_id, en cualquier estado (una rechazada también se
 * generó). La lista trae `cotizaciones: [{id, numero, estado}]` (versión ligera) y el detalle la completa.
 */
export function generoCotizacion(sc) {
  return cotizacionesDe(sc).length > 0;
}

/** Las cotizaciones de la solicitud que están en juego: todas menos las RECHAZADA (VENCIDA cuenta, decisión N4). */
export function cotizacionesVigentes(sc) {
  return cotizacionesDe(sc).filter((c) => esCotizacionActiva(c.estado));
}

/** Las cotizaciones RECHAZADA de la solicitud (N7: la solicitud sigue activa y se puede crear otra). */
export function cotizacionesRechazadas(sc) {
  return cotizacionesDe(sc).filter((c) => !esCotizacionActiva(c.estado));
}

/** H32: espera cotización = está CONFIRMADA (el cliente ya confirmó) y no tiene ninguna cotización en juego. */
export function esperaCotizacion(sc) {
  return sc?.estado === 'CONFIRMADA' && cotizacionesVigentes(sc).length === 0;
}

/**
 * H32: cifras de las tarjetas de la lista de Solicitudes. `totalServidor` es el total que informa el servidor (la lista
 * trae como mucho 200): si es mayor que lo cargado, la tarjeta Total dice cuántas se ven.
 * @param {any[] | null | undefined} solicitudes
 * @param {number | null} [totalServidor]
 * @returns {{total: number, totalConf: number, conCot: number, esperanCot: number, hintConfirmadas: string, hintTotal: string}}
 */
export function contadoresSolicitudes(solicitudes, totalServidor = null) {
  const lista = (Array.isArray(solicitudes) ? solicitudes : []).filter(esObjeto);
  const totalConf = lista.filter((s) => s.estado === 'CONFIRMADA').length;
  const conCot = lista.filter(generoCotizacion).length;
  const esperanCot = lista.filter(esperaCotizacion).length;
  // B4 T8: las frases son las de pistaConfirmadasSolicitudes y pistaTotalSolicitudes (las de las tarjetas del servidor).
  const hintConfirmadas = pistaConfirmadasSolicitudes(totalConf, esperanCot);
  const hayMas = Number.isFinite(totalServidor) && totalServidor > lista.length;
  const hintTotal = pistaTotalSolicitudes(conCot) + (hayMas ? ` · se ven las ${lista.length} más recientes de ${totalServidor}` : '');
  return { total: lista.length, totalConf, conCot, esperanCot, hintConfirmadas, hintTotal };
}

/**
 * H32 (decisión del usuario): la tasa de conversión se calcula solo con las solicitudes de tipo 'Cotizacion de Producto'
 * (sin tipo cuenta como tal): las de soporte, devolución o seguimiento nunca se cotizan y bajarían la tasa sin motivo.
 * @returns {{total: number, conCot: number, pct: number}} pct de 0 a 100 (sin redondear)
 */
export function tasaConversionCotizacion(solicitudes) {
  const lista = (Array.isArray(solicitudes) ? solicitudes : []).filter(esObjeto)
    .filter((s) => (s.tipo_solicitud || TIPO_SC_COTIZABLE) === TIPO_SC_COTIZABLE);
  const conCot = lista.filter(generoCotizacion).length;
  return { total: lista.length, conCot, pct: lista.length > 0 ? (conCot / lista.length) * 100 : 0 };
}

/**
 * N8: la fecha del API (UTC, con o sin 'Z') quedó hace más de `dias` días. Una fecha vacía o inválida no supera nada.
 * @param {string | null | undefined} iso
 * @param {number} dias
 * @param {number} [ahora]
 */
export function superaDiasAlerta(iso, dias, ahora = Date.now()) {
  if (!iso) return false;
  const t = new Date(comoUTC(iso)).getTime();
  return !Number.isNaN(t) && (ahora - t) / 86400000 > dias;
}

/**
 * B4 T8: la fecha del API (UTC, con o sin 'Z': comoUTC) ya pasó: la columna Vencimiento de la lista de Solicitudes la
 * pinta en rojo (la regla de la fila de antes, aquí para no llamar al reloj en el render). Lo que no es una fecha: false.
 * @param {unknown} iso
 * @param {number} [ahora]
 * @returns {boolean}
 */
export function fechaVencida(iso, ahora = Date.now()) {
  if (typeof iso !== 'string' || !iso.trim()) return false;
  const t = new Date(comoUTC(iso)).getTime();
  return !Number.isNaN(t) && t < ahora;
}

/** El inicio 'AAAA-MM-DD' de una fecha de negocio del API (con o sin la hora que le pone isoformat()). */
const INICIO_DIA_DE_NEGOCIO = /^\s*(\d{4}-\d{2}-\d{2})/;

/**
 * B4 T9 r1 (I2): el día de calendario 'AAAA-MM-DD' de una FECHA DE NEGOCIO del API (fecha_entrega_estimada:
 * '2026-11-10T00:00:00' -> '2026-11-10'): sus 10 primeros caracteres, sin pasarla a ninguna zona (la regla de la cabecera
 * de fechas-colombia.js, la F3 del B3 y erp_ventas.py: una fecha de negocio a las 00:00 no se corre de día). Un día que
 * no existe ('2026-02-30') o lo que no empieza con una fecha: ''.
 * @param {unknown} valor
 * @returns {string}
 */
export function diaDeNegocio(valor) {
  if (typeof valor !== 'string') return '';
  const m = INICIO_DIA_DE_NEGOCIO.exec(valor);
  return m && fechaSolo(m[1]) ? m[1] : '';
}

/** 'AAAA-MM-DD' + n días de calendario (en UTC, para que el día no cambie). */
function sumarDias(dia, n) {
  const [anio, mes, d] = dia.split('-').map(Number);
  return new Date(Date.UTC(anio, mes - 1, d + n)).toISOString().slice(0, 10);
}

/**
 * B4 T9 r1 (I2): la fecha de negocio ya pasó: su día (diaDeNegocio) es anterior al día de HOY en Colombia (diaColombia de
 * `ahora`). El mismo día todavía no está vencida. La columna Entrega est. la pinta en rojo (la regla de isOverdue de la
 * fila de antes, sin llamar al reloj en el render). Lo que no es una fecha: false. No se usa fechaVencida, que lee
 * instantes.
 * @param {unknown} valor
 * @param {number} [ahora]
 * @returns {boolean}
 */
export function fechaNegocioVencida(valor, ahora = Date.now()) {
  const dia = diaDeNegocio(valor);
  const hoy = diaColombia(ahora);
  return Boolean(dia && hoy) && dia < hoy;
}

/**
 * B4 T9 (r1, I2: ahora de calendario): la fecha de negocio no venció y su día está entre hoy y hoy + `dias` en Colombia,
 * los dos incluidos (7 por defecto; como vencen_pronto con valida_hasta, RP89). La columna Entrega est. la pinta en ámbar
 * (la regla de isExpiringSoon de la fila de antes). Lo que no es una fecha: false.
 * @param {unknown} valor
 * @param {number} [dias]
 * @param {number} [ahora]
 * @returns {boolean}
 */
export function fechaPorVencer(valor, dias = 7, ahora = Date.now()) {
  const dia = diaDeNegocio(valor);
  const hoy = diaColombia(ahora);
  if (!dia || !hoy) return false;
  return dia >= hoy && dia <= sumarDias(hoy, dias);
}

/**
 * B4 T9 r1 (I1, COT-LISTA en un solo lugar): la marca del pedido de una cotización, la de la columna COT / SC de la lista
 * y la de la tarjeta del tablero (tarjetaCotizacion):
 *  - {texto: 'Pedido PVEN-…', tono: 'emerald'} si tiene un pedido vigente (pedidoVigente);
 *  - {texto: 'Pedido PVEN-… cancelado', tono: 'rose'} si todos sus pedidos se cancelaron y el cliente no la volvió a
 *    confirmar (situacionPedidoCotizacion(cot).avisoCancelado, como su detalle), con el último cancelado;
 *  - null en otro caso.
 * @param {any} cot
 * @returns {{texto: string, tono: 'emerald' | 'rose'} | null}
 */
export function marcaPedidoCotizacion(cot) {
  const vigente = pedidoVigente(cot);
  if (vigente) return { texto: ['Pedido', vigente.numero].filter(Boolean).join(' '), tono: 'emerald' };
  if (soloPedidosCancelados(cot) && situacionPedidoCotizacion(cot).avisoCancelado) {
    return { texto: ['Pedido', ultimoPedidoCancelado(cot)?.numero, 'cancelado'].filter(Boolean).join(' '), tono: 'rose' };
  }
  return null;
}

/**
 * B4 T9 r1 (I1): «Sin precio»: el total de la cotización no es mayor que 0 (o no viene), en cualquier estado. La usan el
 * chip de la columna Total y el de la tarjeta del tablero.
 * @param {any} cot
 * @returns {boolean}
 */
export function cotizacionSinPrecio(cot) {
  return !(Number(cot?.total_cop) > 0);
}

/**
 * B4 T9 r2 (p2): el chip «Sin precio» en un solo lugar: {texto: 'Sin precio', tono: 'amber'} si cotizacionSinPrecio, o
 * null. Lo pintan la columna Total de la lista (con CLASE_CHIP[tono]) y la tarjeta del tablero (tarjetaCotizacion).
 * @param {any} cot
 * @returns {{texto: string, tono: 'amber'} | null}
 */
export function chipSinPrecio(cot) {
  return cotizacionSinPrecio(cot) ? { texto: 'Sin precio', tono: 'amber' } : null;
}

/**
 * B4 T9 r1 (m4; B2, test_rechazo_cotizacion_solicitud_activa): lo que pasa con la solicitud al rechazar una cotización
 * que viene de una: 'La solicitud SC-… seguirá activa y podrás crearle otra cotización.' ('de origen' sin número). Sin
 * solicitud, null. Una sola frase para la confirmación del detalle (cotizacion/[id]) y los efectos del ModalMotivo del
 * tablero.
 * @param {any} cot
 * @returns {string | null}
 */
export function avisoSolicitudTrasRechazo(cot) {
  if (!cot?.sc_id) return null;
  const numero = typeof cot.sc_numero === 'string' && cot.sc_numero.trim() ? cot.sc_numero.trim() : 'de origen';
  return `La solicitud ${numero} seguirá activa y podrás crearle otra cotización.`;
}

/**
 * T7 ronda 2: la pestaña de la lista de solicitudes en la que cae una fila. Cada solicitud cae en exactamente una, en
 * este orden: Soporte Técnico (por tipo o por su estado propio N/A_SOPORTE, también si se le corrigió el tipo en el
 * detalle) -> 'Soporte'; CONFIRMADA -> 'Confirmadas'; CANCELADA -> 'Canceladas'; lo demás (incluidos los estados
 * heredados, hasta que T12 los ajuste, y una fila sin estado) -> 'Activas'. null si no es una fila. Lo usan el filtro de
 * las 4 pestañas y sus contadores.
 * @param {any} sc
 * @returns {'Soporte' | 'Confirmadas' | 'Canceladas' | 'Activas' | null}
 */
export function pestanaDeSolicitud(sc) {
  if (!esObjeto(sc)) return null;
  if (esSoporte(sc)) return 'Soporte';
  if (sc.estado === 'CONFIRMADA') return 'Confirmadas';
  if (sc.estado === 'CANCELADA') return 'Canceladas';
  return 'Activas';
}

/**
 * T7 ronda 1 (C12): una solicitud "activa" de la lista = su pestaña es 'Activas' (no es Soporte ni está Confirmada o
 * Cancelada; los heredados cuentan). Un solo predicado para la pestaña, su contador, las vencidas y el diagnóstico de la
 * IA: la misma página no da dos números distintos. null -> false.
 * @param {any} sc
 * @returns {boolean}
 */
export function esSolicitudActiva(sc) {
  return pestanaDeSolicitud(sc) === 'Activas';
}

/** Un conteo valido (entero >= 0) o 0. */
const conteo = (n) => (Number.isFinite(n) && n > 0 ? Math.floor(n) : 0);

/**
 * T11 (V7): la pista de la tarjeta ACTIVAS de la lista de solicitudes. 'Sin atender' (Borrador sin cambios más de los
 * días de alerta, N8) y 'vencidas' (activas con la fecha de vencimiento pasada) miden cosas distintas a propósito; la
 * tarjeta dice las dos, con los mismos números del banner «ATENCIÓN REQUERIDA», para no decir «Todas atendidas»
 * mientras el banner avisa vencidas: '2 sin atender · 1 vencida', '1 vencida', 'Todas atendidas'.
 * @param {number} sinAtender
 * @param {number} vencidas
 * @returns {string}
 */
export function pistaActivasSolicitudes(sinAtender, vencidas) {
  const s = conteo(sinAtender);
  const v = conteo(vencidas);
  const partes = [];
  if (s > 0) partes.push(`${s} sin atender`);
  if (v > 0) partes.push(`${v} ${v === 1 ? 'vencida' : 'vencidas'}`);
  return partes.length > 0 ? partes.join(' · ') : 'Todas atendidas';
}

/**
 * H32 (B4 T8: sacada de contadoresSolicitudes, la misma frase): la ayuda de la tarjeta de las solicitudes confirmadas:
 * 'Sin confirmadas', 'N esperan cotización' o 'Todas con cotización'.
 * @param {number} confirmadas
 * @param {number} esperanCot
 * @returns {string}
 */
export function pistaConfirmadasSolicitudes(confirmadas, esperanCot) {
  const e = conteo(esperanCot);
  if (conteo(confirmadas) === 0) return 'Sin confirmadas';
  return e > 0 ? `${e} esperan cotización` : 'Todas con cotización';
}

/**
 * H32 (B4 T8: sacada de contadoresSolicitudes): la ayuda de la tarjeta del total de solicitudes, 'N generaron
 * cotización' (las que tienen al menos una COT, en cualquier estado).
 * @param {number} conCot
 * @returns {string}
 */
export function pistaTotalSolicitudes(conCot) {
  return `${conteo(conCot)} generaron cotización`;
}

/** Un conteo del servidor (entero >= 0) o null (la tarjeta dice «—»; nunca se inventa un 0). */
const conteoONulo = (n) => (typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : null);

/**
 * B4 T8 (KPI-ventas punto 7 con RP19 (3) y (4)): las 4 tarjetas de la lista de Solicitudes con el `resumen` de GET
 * /ventas/solicitudes?con_resumen=1 (todas las solicitudes, sin Soporte):
 *  - activas (sc_activas): resumen.activas, con pistaActivasSolicitudes(resumen.sin_atender, resumen.vencidas) (V7) y,
 *    r1 (m1, KPI-ventas punto 7), el tono 'alerta' si hay alguna sin atender o vencida ('normal' si no);
 *  - confirmadas (sc_confirmadas): resumen.confirmadas, con pistaConfirmadasSolicitudes(confirmadas, esperan_cot);
 *  - canceladas (sc_canceladas): resumen.canceladas, con 'Fuera del flujo';
 *  - total (sc_total): resumen.total, con pistaTotalSolicitudes(con_cot).
 * Sin resumen (cargando o con error), null. Un número que no viene queda en null.
 * @param {any} resumen
 * @returns {null | Record<'confirmadas' | 'canceladas' | 'total', {valor: number | null, ayuda: string}>
 *   & {activas: {valor: number | null, ayuda: string, tono: 'alerta' | 'normal'}}}
 */
export function tarjetasSolicitudes(resumen) {
  if (!esObjeto(resumen) || Array.isArray(resumen)) return null;
  return {
    activas: {
      valor: conteoONulo(resumen.activas),
      ayuda: pistaActivasSolicitudes(resumen.sin_atender, resumen.vencidas),
      tono: conteo(resumen.sin_atender) > 0 || conteo(resumen.vencidas) > 0 ? 'alerta' : 'normal',
    },
    confirmadas: { valor: conteoONulo(resumen.confirmadas), ayuda: pistaConfirmadasSolicitudes(resumen.confirmadas, resumen.esperan_cot) },
    canceladas: { valor: conteoONulo(resumen.canceladas), ayuda: 'Fuera del flujo' },
    total: { valor: conteoONulo(resumen.total), ayuda: pistaTotalSolicitudes(resumen.con_cot) },
  };
}

/** Un monto del servidor en pesos enteros (redondearPeso), o null si no es un número (la tarjeta dice «—»). */
const montoONulo = (v) => (typeof v === 'number' && Number.isFinite(v) ? redondearPeso(v) : null);

/**
 * COT-LISTA (B4 T9: la frase de la StatCard de antes, con los números del resumen): la ayuda de la tarjeta de las
 * cotizaciones confirmadas: 'Sin confirmadas', 'N con pedido de venta · M por convertir' o 'Todas con pedido de venta'.
 */
function pistaConfirmadasCotizaciones(confirmadas, conPedido, porConvertir) {
  if (conteo(confirmadas) === 0) return 'Sin confirmadas';
  return conteo(porConvertir) > 0
    ? `${conteo(conPedido)} con pedido de venta · ${conteo(porConvertir)} por convertir`
    : 'Todas con pedido de venta';
}

/**
 * B4 T9 (KPI-ventas punto 8 con RP19 (3) y (5)): las 4 tarjetas de la lista de Cotizaciones con el `resumen` de GET
 * /ventas/cotizaciones?con_resumen=1 (todas las cotizaciones de la lista, sin la búsqueda ni la vista):
 *  - activas (cot_activas): resumen.activas, con 'N sin precio' (sin_calc) o 'Todas calculadas';
 *  - confirmadas (cot_confirmadas): resumen.confirmadas, con 'N con pedido de venta · M por convertir' (con_pedido y
 *    por_convertir), 'Todas con pedido de venta' o 'Sin confirmadas';
 *  - monto_confirmado (cot_monto_confirmado): resumen.monto_confirmado en pesos enteros, con 'N con pedido de venta
 *    vigente';
 *  - total (cot_total): resumen.total, con 'N rechazadas' ('1 rechazada').
 * Las frases son las de las StatCard de COT-LISTA. Sin resumen (cargando o con error), null. Un número que no viene queda
 * en null (nunca un 0 inventado).
 * @param {any} resumen
 * @returns {null | Record<'activas' | 'confirmadas' | 'monto_confirmado' | 'total', {valor: number | null, ayuda: string}>}
 */
export function tarjetasCotizaciones(resumen) {
  if (!esObjeto(resumen) || Array.isArray(resumen)) return null;
  const sinPrecio = conteo(resumen.sin_calc);
  const rechazadas = conteo(resumen.rechazadas);
  return {
    activas: { valor: conteoONulo(resumen.activas), ayuda: sinPrecio > 0 ? `${sinPrecio} sin precio` : 'Todas calculadas' },
    confirmadas: {
      valor: conteoONulo(resumen.confirmadas),
      ayuda: pistaConfirmadasCotizaciones(resumen.confirmadas, resumen.con_pedido, resumen.por_convertir),
    },
    monto_confirmado: {
      valor: montoONulo(resumen.monto_confirmado), ayuda: `${conteo(resumen.con_pedido)} con pedido de venta vigente`,
    },
    total: { valor: conteoONulo(resumen.total), ayuda: `${rechazadas} ${rechazadas === 1 ? 'rechazada' : 'rechazadas'}` },
  };
}

// ─── B4 T10: la lista de Pedidos de venta ───────────────────────────────────────

/** La ayuda del total de pedidos (H47): '15 activos · 12 cancelados' ('1 activo'); sin ningún número, null. */
function pistaTotalPedidos(activos, cancelados) {
  const partes = [];
  if (activos !== null) partes.push(`${activos} ${activos === 1 ? 'activo' : 'activos'}`);
  if (cancelados !== null && cancelados > 0) partes.push(`${cancelados} ${cancelados === 1 ? 'cancelado' : 'cancelados'}`);
  return partes.length > 0 ? partes.join(' · ') : null;
}

/** H47: el dinero de los pedidos no suma los cancelados ni los devueltos por completo. */
const SIN_CANCELADOS_NI_DEVUELTOS = 'Sin pedidos cancelados ni devueltos';

/**
 * B4 T10 (KPI-ventas punto 9 con RP19 (2) y D5): las 4 tarjetas de la lista de Pedidos con los `kpis` de GET
 * /ventas/stats (todos los pedidos; no el resumen de H47 de la lista, que es para la suma de cada columna del tablero):
 *  - total (pven_total): kpis.pven_total, con 'N activos · M cancelados' (pven_en_curso y pven_cancelados, la pista de
 *    H47; los cancelados solo si hay);
 *  - monto_vendido (pven_monto_vendido): en pesos enteros, con 'Sin pedidos cancelados ni devueltos' (H47);
 *  - pendiente_compra (pven_pendiente_compra, la pestaña Pend. Compra): con 'Falta comprar';
 *  - saldo_por_cobrar (pven_saldo_por_cobrar, Σ max(0, saldo) de R7: el mismo del Hub): en pesos enteros, con la ayuda
 *    del monto.
 * Sin kpis (cargando o con error), null. Un número que no viene queda en null (nunca un 0 inventado).
 * @param {any} kpis
 * @returns {null | Record<'total' | 'monto_vendido' | 'pendiente_compra' | 'saldo_por_cobrar', {valor: number | null, ayuda: string | null}>}
 */
export function tarjetasPedidos(kpis) {
  if (!esObjeto(kpis) || Array.isArray(kpis)) return null;
  return {
    total: { valor: conteoONulo(kpis.pven_total), ayuda: pistaTotalPedidos(conteoONulo(kpis.pven_en_curso), conteoONulo(kpis.pven_cancelados)) },
    monto_vendido: { valor: montoONulo(kpis.pven_monto_vendido), ayuda: SIN_CANCELADOS_NI_DEVUELTOS },
    pendiente_compra: { valor: conteoONulo(kpis.pven_pendiente_compra), ayuda: 'Falta comprar' },
    saldo_por_cobrar: { valor: montoONulo(kpis.pven_saldo_por_cobrar), ayuda: SIN_CANCELADOS_NI_DEVUELTOS },
  };
}

/**
 * B4 T10 (H47): el saldo de un pedido como lo muestra la columna Saldo de la lista: null ('—') si el pedido no suma
 * dinero (Cancelado o Devuelto, pedidoSumaDinero); si no, el saldo en pesos enteros, aunque sea 0 o a favor (negativo).
 * Un saldo que falta vale 0, como en _ven_dict. Lo que no es un pedido: null.
 * @param {any} p
 * @returns {number | null}
 */
export function saldoVisiblePedido(p) {
  if (!pedidoSumaDinero(p)) return null;
  const n = Number(p.saldo_cop);
  return Number.isFinite(n) ? redondearPeso(n) : 0;
}

/**
 * B4 T10 (KANBAN-ventas-listas punto 5): el chip «Saldo $X» de la tarjeta del tablero de Pedidos, con el MISMO dato de la
 * columna Saldo de la tabla (saldoVisiblePedido): {texto: 'Saldo $400.000', tono: 'amber'} si queda algo por cobrar; si
 * no (saldo 0, a favor, o un pedido que no suma dinero), null. Un objeto nuevo en cada llamada.
 * @param {any} p
 * @returns {{texto: string, tono: 'amber'} | null}
 */
export function chipSaldoPedido(p) {
  const saldo = saldoVisiblePedido(p);
  return saldo !== null && saldo > 0 ? { texto: `Saldo ${formatoPesos(saldo)}`, tono: 'amber' } : null;
}

/**
 * B4 T10 (la lección de T9 r1, I2): la alerta de la Entrega est. de un pedido, con su DÍA de calendario: 'vencida' si
 * su día ya pasó en Colombia (fechaNegocioVencida), 'por_vencer' si cae entre hoy y hoy + 7 días (fechaPorVencer); si
 * no, null. Un pedido cerrado (ESTADOS_PEDIDO_CERRADOS: Entregado, Facturado, Cancelado o Devuelto) no lleva alerta: su
 * entrega ya no se espera. Lo que no es un pedido o no trae una fecha: null.
 * @param {any} p
 * @param {number} [ahora]
 * @returns {'vencida' | 'por_vencer' | null}
 */
export function alertaEntregaPedido(p, ahora = Date.now()) {
  if (!esObjeto(p) || ESTADOS_PEDIDO_CERRADOS.includes(p.estado)) return null;
  if (fechaNegocioVencida(p.fecha_entrega_estimada, ahora)) return 'vencida';
  return fechaPorVencer(p.fecha_entrega_estimada, 7, ahora) ? 'por_vencer' : null;
}

const SEPARACION_MENU_FILA = 4; // px entre el botón «⋮» y su menú
const MARGEN_MENU_FILA = 8; // px que el menú deja libres contra los bordes de la ventana

/**
 * T11 (V2): dónde abrir el menú «⋮» de una fila con position: fixed, para que el contenedor con overflow de la tabla no
 * lo corte. Se alinea al borde derecho del botón y se abre hacia abajo; si abajo no cabe y arriba hay más lugar, hacia
 * arriba. Nunca se sale de la ventana (margen de 8 px). Coordenadas de la ventana (getBoundingClientRect), en px
 * enteros.
 * @param {{top: number, bottom: number, right: number}} boton  el rectángulo del botón «⋮»
 * @param {{ancho: number, alto: number}} menu  el tamaño del menú
 * @param {{ancho: number, alto: number}} ventana  window.innerWidth / innerHeight
 * @returns {{top: number, left: number}}
 */
export function posicionMenuFila(boton, menu, ventana) {
  const abajo = boton.bottom + SEPARACION_MENU_FILA;
  const espacioAbajo = ventana.alto - MARGEN_MENU_FILA - abajo;
  const espacioArriba = boton.top - SEPARACION_MENU_FILA - MARGEN_MENU_FILA;
  const deseado = menu.alto <= espacioAbajo || espacioAbajo >= espacioArriba
    ? abajo
    : boton.top - SEPARACION_MENU_FILA - menu.alto;
  const dentro = (valor, maximo) => Math.min(Math.max(valor, MARGEN_MENU_FILA), Math.max(MARGEN_MENU_FILA, maximo));
  return {
    top: Math.round(dentro(deseado, ventana.alto - MARGEN_MENU_FILA - menu.alto)),
    left: Math.round(dentro(boton.right - menu.ancho, ventana.ancho - MARGEN_MENU_FILA - menu.ancho)),
  };
}

/**
 * T11 ronda 1 (5): si el botón «⋮» sigue a la vista: el centro de su rectángulo está dentro de cada recorte (la ventana y
 * los contenedores con overflow que lo contienen, todos en coordenadas de la ventana). Si al desplazar sale de la vista,
 * su menú (fixed) se cierra en vez de quedar flotando pegado al borde. Sin rectángulo: false; sin recortes: true.
 * @param {{top: number, bottom: number, left: number, right: number} | null | undefined} boton
 * @param {{top: number, bottom: number, left: number, right: number}[]} recortes
 * @returns {boolean}
 */
export function botonALaVista(boton, recortes) {
  if (!boton) return false;
  const x = (boton.left + boton.right) / 2;
  const y = (boton.top + boton.bottom) / 2;
  return (recortes || []).every((r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom);
}

/**
 * Revisión final (F11, M2): lo que recorta al botón «⋮» (la parte pura de recortesDe de solicitud-client.tsx): la ventana
 * ({top: 0, left: 0, right: ancho, bottom: alto}) y el rectángulo de cada ancestro cuyo overflow, en algún eje, no es
 * 'visible' (auto, hidden, scroll o clip: la tabla con overflow-x-auto, la tarjeta con overflow-hidden, el <main> que se
 * desplaza). Cada ancestro llega como {overflowX, overflowY, rect} (getComputedStyle y getBoundingClientRect); de rect
 * solo se toman top, left, right y bottom, y una entrada sin rect se ignora.
 * @param {{ancho: number, alto: number}} ventana
 * @param {({overflowX?: string, overflowY?: string, rect?: {top: number, left: number, right: number, bottom: number}} | null)[] | null | undefined} ancestros
 * @returns {{top: number, left: number, right: number, bottom: number}[]}
 */
export function recortesDeAncestros(ventana, ancestros) {
  const recortes = [{ top: 0, left: 0, right: ventana.ancho, bottom: ventana.alto }];
  for (const a of Array.isArray(ancestros) ? ancestros : []) {
    if (!a || !a.rect) continue;
    if (a.overflowX === 'visible' && a.overflowY === 'visible') continue;
    const { top, left, right, bottom } = a.rect;
    recortes.push({ top, left, right, bottom });
  }
  return recortes;
}

/**
 * N4: de las solicitudes marcadas para cancelar, cuáles se cancelan con POST /cancelar y cuáles se omiten (sin llamar al
 * servidor): las que ya están canceladas (ya están en la Papelera: cancelarlas otra vez solo repite el envío) y las de
 * Soporte Técnico (su ciclo es estado_soporte). Las filas null se ignoran.
 * @param {any[] | null | undefined} filas
 * @returns {{cancelables: any[], omitidas: {id: any, numero: string, motivo: string}[]}}
 */
export function repartirCancelacionSolicitudes(filas) {
  const cancelables = [];
  const omitidas = [];
  for (const sc of Array.isArray(filas) ? filas : []) {
    if (!esObjeto(sc)) continue;
    const motivo = sc.tipo_solicitud === 'Soporte Tecnico' || sc.estado === 'N/A_SOPORTE'
      ? 'es un ticket de soporte: se cierra desde su estado de soporte'
      : sc.estado === 'CANCELADA' ? 'ya está en la Papelera' : null;
    if (motivo) omitidas.push({ id: sc.id, numero: sc.numero || `#${sc.id}`, motivo });
    else cancelables.push(sc);
  }
  return { cancelables, omitidas };
}

/**
 * N4: resultado de cancelar varias solicitudes con POST /cancelar, una por una. `resultados`: [{numero, ok, error}];
 * `omitidas` (opcional, de repartirCancelacionSolicitudes) se nombran al final del mensaje y no cuentan como error.
 * Devuelve {exitosas, fallidas: [{numero, error, texto}], mensaje, tipo}: `mensaje` va al toast ('2 solicitudes
 * canceladas'; con fallos 'No se pudieron cancelar: SC-1, SC-2') y `fallidas[].texto` es el detalle del servidor para
 * mostrarlo completo (el 409 ya nombra la solicitud, sus documentos activos y qué hacer; ningún error queda en blanco).
 * @param {{numero?: string, ok: boolean, error?: string}[] | null | undefined} resultados
 * @param {{numero?: string, motivo?: string}[]} [omitidas]
 * @returns {{exitosas: number, fallidas: {numero: string, error: string, texto: string}[], mensaje: string, tipo: 'ok' | 'err'}}
 */
export function resumenCancelacionSolicitudes(resultados, omitidas = []) {
  const lista = (Array.isArray(resultados) ? resultados : []).filter(esObjeto);
  const exitosas = lista.filter((r) => r.ok).length;
  const fallidas = lista.filter((r) => !r.ok).map((r) => {
    const numero = String(r.numero || '').trim();
    const error = String(r.error || '').trim() || 'el servidor no dio detalle del error';
    return { numero, error, texto: numero && !error.includes(numero) ? `${numero}: ${error}` : error };
  });
  const canceladas = exitosas === 1 ? '1 solicitud cancelada' : `${exitosas} solicitudes canceladas`;
  const numeros = fallidas.map((f) => f.numero).filter(Boolean).join(', ');
  const noSePudo = fallidas.length === 1 ? 'No se pudo cancelar' : 'No se pudieron cancelar';
  const fallo = `${noSePudo}${numeros ? `: ${numeros}` : ' la solicitud'}`;
  let mensaje;
  if (fallidas.length === 0) mensaje = exitosas > 0 ? canceladas : 'No se canceló ninguna solicitud';
  else mensaje = exitosas > 0 ? `${canceladas}. ${fallo}` : fallo;
  const omitidasValidas = (Array.isArray(omitidas) ? omitidas : []).filter(esObjeto);
  if (omitidasValidas.length > 0) {
    const detalle = omitidasValidas.map((o) => `${o.numero || 'una solicitud'}: ${o.motivo || 'se omitió'}`).join('; ');
    mensaje += `. ${omitidasValidas.length === 1 ? 'Se omitió' : 'Se omitieron'} ${detalle}.`;
  }
  return { exitosas, fallidas, mensaje, tipo: fallidas.length === 0 && exitosas > 0 ? 'ok' : 'err' };
}

/**
 * N4: cómo se ve una solicitud en la Papelera. El servidor manda `tiene_documentos` y `dias_restantes`, que es null
 * cuando la purga no la va a borrar: porque tiene cotizaciones, pedidos o un lead vinculados, o (desde T2B) porque no
 * tiene `eliminada_at` (cancelada con la pastilla vieja). 'Eliminar permanentemente' sale de `tiene_documentos`, no de
 * `dias_restantes`:
 *  - con documentos se conserva y no se puede eliminar definitivamente;
 *  - sin documentos y sin `dias_restantes` no se elimina sola, pero un administrador la puede eliminar;
 *  - sin documentos y con `dias_restantes` hay cuenta regresiva ('20 días para poder eliminarla', urgente desde 5; B2.1
 *    T4 r1: no se borra sola al llegar a 0, se puede eliminar desde ese día);
 *  - B2.1 D2: con `dias_restantes` <= 0 ya venció (esVencidaEnPapelera) y no se borra al abrirla: TEXTO_PAPELERA_VENCIDA.
 * 'Se conserva' y 'Eliminar permanentemente' nunca van juntos (sin la fila, tampoco se ofrece eliminar).
 * @returns {{conservada: boolean, texto: string, nota: string, urgente: boolean, puedeEliminar: boolean}}
 */
export function estadoEnPapelera(sc) {
  if (!esObjeto(sc) || sc.tiene_documentos) {
    return { conservada: true, texto: 'Se conserva (tiene documentos vinculados)', nota: '', urgente: false, puedeEliminar: false };
  }
  const dias = sc.dias_restantes;
  if (dias === null || dias === undefined) {
    return { conservada: false, texto: TEXTO_PAPELERA_SIN_FECHA, nota: '', urgente: false, puedeEliminar: true };
  }
  if (esVencidaEnPapelera(sc)) {
    return { conservada: false, texto: TEXTO_PAPELERA_VENCIDA, nota: '', urgente: true, puedeEliminar: true };
  }
  return { conservada: false, texto: `${dias} ${dias === 1 ? 'día' : 'días'}`, nota: 'para poder eliminarla', urgente: dias <= 5, puedeEliminar: true };
}

/**
 * B2.1 D2 (decisión del usuario): la Papelera ya no se borra sola al abrirla; la vacía un administrador con «Vaciar las
 * vencidas» (POST /ventas/papelera/purgar). Lo que dice una fila vencida. B3 T18 (RP7): desde B3-T10 la revisión
 * automática también las purga (la tarea purga_papelera llama a purgar_papelera_vencida).
 * @type {string}
 */
export const TEXTO_PAPELERA_VENCIDA = 'Vencida: se borra cuando un administrador vacíe la Papelera o en la revisión automática';

/**
 * B2.1 D2: una fila de la Papelera que ya venció: sin documentos y con `dias_restantes` (número) en 0 o menos. Sin fecha
 * (null: `null <= 0` es true en JS) o con documentos nunca es vencida: la purga no la toca.
 * @returns {boolean}
 */
export function esVencidaEnPapelera(sc) {
  return esObjeto(sc) && !sc.tiene_documentos && typeof sc.dias_restantes === 'number' && sc.dias_restantes <= 0;
}

/**
 * B2.1 D2: cuántas filas vencidas trae la lista de la Papelera (la confirmación de «Vaciar las vencidas» lo dice).
 * @returns {number}
 */
export function contarVencidasEnPapelera(lista) {
  return Array.isArray(lista) ? lista.filter(esVencidaEnPapelera).length : 0;
}

const solicitudesVencidas = (n) => (n === 1 ? '1 solicitud vencida' : `${n} solicitudes vencidas`);

/**
 * B2.1 D2: la confirmación de «Vaciar las vencidas» con las vencidas contadas en la lista. Sin ninguna en la lista se
 * puede vaciar igual: la lista trae como mucho 200 filas, de la más reciente a la más vieja, y el servidor decide.
 * @param {number} n  contarVencidasEnPapelera(lista)
 * @returns {{titulo: string, mensaje: string, textoConfirmar: string, peligro: boolean}}
 */
export function confirmacionVaciarVencidas(n) {
  const regla = '(más de 30 días en la Papelera y sin documentos vinculados)';
  const mensaje = n > 0
    ? `En la lista hay ${solicitudesVencidas(n)} ${regla}. Se borrarán para siempre y no se pueden recuperar.`
    : `En la lista no hay solicitudes vencidas ${regla}. Si el servidor encuentra alguna, se borrará para siempre.`;
  return { titulo: 'Vaciar las vencidas', mensaje, textoConfirmar: 'Vaciar las vencidas', peligro: true };
}

/**
 * B2.1 D2: el aviso después de vaciar, con `purgadas` de la respuesta de POST /ventas/papelera/purgar.
 * @returns {string}
 */
export function textoPapeleraVaciada(purgadas) {
  const n = typeof purgadas === 'number' && Number.isFinite(purgadas) ? Math.trunc(purgadas) : 0;
  if (n <= 0) return 'No había solicitudes vencidas para borrar.';
  return n === 1 ? 'Se borró 1 solicitud vencida.' : `Se borraron ${solicitudesVencidas(n)}.`;
}

/**
 * N4: lo que hay que hacer antes de poder cancelar la solicitud (el servidor responde 409 con lo mismo): primero cancelar
 * sus pedidos de venta vigentes y luego rechazar sus cotizaciones activas (VENCIDA cuenta). Vacío si ya se puede cancelar.
 * @returns {{tipo: 'pedido' | 'cotizacion', id: number, numero: string, texto: string}[]}
 */
export function pasosParaCancelarSolicitud(sc) {
  const pedidos = (Array.isArray(sc?.pedidos_venta) ? sc.pedidos_venta : []).filter((v) => esObjeto(v) && esPedidoVigente(v.estado));
  return [
    ...pedidos.map((v) => ({ tipo: 'pedido', id: v.id, numero: v.numero, texto: `Cancela el pedido de venta ${v.numero}` })),
    ...cotizacionesVigentes(sc).map((c) => ({ tipo: 'cotizacion', id: c.id, numero: c.numero, texto: `Rechaza la cotización ${c.numero}` })),
  ];
}
