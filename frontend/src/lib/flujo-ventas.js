/**
 * El flujo de Ventas, solo PRESENTACIÓN (Bloque 4, T3B: FLUJO-ventas-datos punto 4 y FLUJO-documentos punto 1; R8, C5,
 * RP2, RP12, RP21, RP67, RP74 y RP87). JS plano, sin React ni DOM, para probarlo con node
 * (frontend/tests/test_flujo_ventas.mjs). Imports relativos con extensión: node no resuelve '@/'.
 *
 * La regla de atraso, de resolución y de pasos NO vive aquí (C5, R8): los números del diagrama los cuenta el servidor
 * (resumen_flujo_ventas de core/resolucion_ventas.py, por GET /ventas/flujo) y su único espejo en el navegador es
 * hub-ventas.js (clasificar, columnaHub). Este módulo solo trae:
 *  - PASOS_FLUJO_VENTAS: los 5 pasos (las claves de PASOS_FLUJO_VENTAS del servidor) con sufijo, tono, icono, ruta y
 *    ayuda. Las rutas de Entregado y Facturado llevan la clave de la vista en ?tab= (RP21).
 *  - textoRegla(dias): la regla que se lee en la franja («más de N días», la frontera estricta de RP2).
 *  - conteosDesdeResumen(datos): la respuesta de /ventas/flujo en la forma de pasosConConteos (flujo.js), con los
 *    avisos de cambios del cliente y de recordatorios sin respuesta (RP12).
 *  - tabHubDePaso(clave): la vista del Hub de cada paso (RP21).
 *  - cadenaVentas(doc, tipo, opciones): la barra Solicitud → Cotización → Pedido de venta (→ Compra) del detalle de un
 *    documento y del panel rápido del Hub. Su ayudante contextoFlujo es interno: no se exporta (RP67).
 *  - PASOS_COTIZACION y pasoCotizacion(estado): los 3 pasos propios de la cotización (RP87).
 */

import { congelar, conteosDePasos } from './flujo.js';
import { esCotizacionActiva, esPedidoVigente, humanizarCodigo, infoEstadoPedido, tiene } from './estados-pedido.js';
import { infoEstadoSolicitud } from './estados-solicitud.js';
import { infoEstadoCotizacion } from './estados-cotizacion.js';
import { cantidadPositiva } from './hub-ventas.js';
import { enlaceDocumento } from './analisis.js';
import { formatoEntero } from './kpis.js';

/**
 * @typedef {import('./flujo.js').PasoVista} PasoVista
 * @typedef {import('./flujo.js').AvisoPaso} AvisoPaso
 * @typedef {import('./flujo.js').TonoPaso} TonoPaso
 * @typedef {import('./flujo.js').ClaveIcono} ClaveIcono
 * @typedef {'SC' | 'COT' | 'PVEN' | 'ENTREGADO' | 'FACTURADO'} ClavePasoVentas
 * @typedef {{clave: ClavePasoVentas, label: string, sufijo: string, tono: TonoPaso, icono: ClaveIcono, ruta: string,
 *   ayuda: string}} PasoFlujoVentas
 * @typedef {{total: number | null, atrasados: number | null, masAntiguoDias: number | null,
 *   porEstado: Record<string, number> | null, avisos: AvisoPaso[]}} ConteoVentas
 * @typedef {'sc' | 'cot' | 'ven'} VistaHubDePaso
 * @typedef {'SC' | 'COT' | 'PVEN' | 'VEN'} TipoCadena
 * @typedef {(estado: any) => (string | {label: string} | null | undefined)} EtiquetaDeEstado
 * @typedef {{sc?: EtiquetaDeEstado, cot?: EtiquetaDeEstado, pven?: EtiquetaDeEstado}} EtiquetasCadena
 * @typedef {{indice: number, canceladoEn?: number, etiqueta?: string, aviso?: AvisoPaso}} PasoCotizacion
 */

// ─── los pasos de la franja ─────────────────────────────────────────────────────

/**
 * Los 5 pasos del flujo de Ventas, en orden (las claves de PASOS_FLUJO_VENTAS de core/resolucion_ventas.py), con su
 * presentación. Inmutable.
 * @type {ReadonlyArray<Readonly<PasoFlujoVentas>>}
 */
export const PASOS_FLUJO_VENTAS = congelar([
  {
    clave: 'SC', label: 'Solicitud', sufijo: 'abiertas', tono: 'indigo', icono: 'solicitud',
    ruta: '/dashboard/ventas/solicitud',
    ayuda: 'Lo que pide el cliente. Avanza cuando el cliente confirma los productos y se crea la cotización.',
  },
  {
    clave: 'COT', label: 'Cotización', sufijo: 'abiertas', tono: 'amber', icono: 'cotizacion',
    ruta: '/dashboard/ventas/cotizacion',
    ayuda: 'Precios, IVA y anticipo. Avanza cuando el cliente confirma y se verifica el anticipo: ahí nace el pedido.',
  },
  {
    clave: 'PVEN', label: 'Pedido de venta', sufijo: 'en curso', tono: 'emerald', icono: 'pedido',
    ruta: '/dashboard/ventas/venta',
    ayuda: 'Compra, alistamiento y despacho. Avanza cuando el pedido sale de bodega.',
  },
  {
    clave: 'ENTREGADO', label: 'Entregado', sufijo: 'por facturar', tono: 'teal', icono: 'entrega',
    ruta: '/dashboard/ventas/venta?tab=entregado',
    ayuda: 'El cliente ya lo recibió. Falta marcarlo como facturado.',
  },
  {
    clave: 'FACTURADO', label: 'Facturado', sufijo: 'facturados', tono: 'purple', icono: 'factura',
    ruta: '/dashboard/ventas/venta?tab=facturado',
    ayuda: 'Pedido cerrado.',
  },
]);

const PASO_POR_CLAVE = congelar(Object.fromEntries(PASOS_FLUJO_VENTAS.map((p) => [p.clave, p])));

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// ─── la regla ───────────────────────────────────────────────────────────────────

/** Los días de alerta por defecto (DIAS_ALERTA_POR_DEFECTO y leer_dias_alerta del servidor). */
const DIAS_POR_DEFECTO = 2;

/** Los tipos de dias_alerta ({SC, COT, VEN}) y su nombre en la regla. */
const TIPOS_REGLA = congelar([['SC', 'Solicitud'], ['COT', 'Cotización'], ['VEN', 'Pedido']]);

/** Un entero de días (también en texto, como admin_config), o el valor por defecto. */
function diasDe(v) {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN;
  return Number.isInteger(n) ? n : DIAS_POR_DEFECTO;
}

const textoDias = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;

/**
 * La regla de atraso que se lee en la franja (dias_alerta de /ventas/flujo: {SC, COT, VEN}). «Más de N días» es la
 * frontera estricta de RP2 (más de días × 24 h sin movimiento):
 *  - si los tres son iguales: 'Con atraso: más de 2 días sin movimiento';
 *  - si no, N es el menor y se detalla: 'Con atraso: más de 2 días sin movimiento (Solicitud 2 · Cotización 3 · Pedido 2)'.
 * Sin dato, o con uno que no es un entero, ese tipo usa 2. Un número solo vale para los tres.
 * @param {Readonly<Partial<Record<'SC' | 'COT' | 'VEN', number | string | null>>> | number | null | undefined} dias
 * @returns {string}
 */
export function textoRegla(dias) {
  const valores = TIPOS_REGLA.map(([tipo]) => diasDe(esObjeto(dias) ? (tiene(dias, tipo) ? /** @type {any} */ (dias)[tipo] : null) : dias));
  const minimo = Math.min(...valores);
  const regla = `Con atraso: más de ${textoDias(minimo)} sin movimiento`;
  if (valores.every((v) => v === valores[0])) return regla;
  return `${regla} (${TIPOS_REGLA.map(([, nombre], i) => `${nombre} ${valores[i]}`).join(' · ')})`;
}

// ─── los conteos ────────────────────────────────────────────────────────────────

/** Los avisos de RP12 (cambios_cliente y sin_respuesta vienen arriba de `pasos`: {SC: n, COT: n}), en este orden. */
const AVISOS_DEL_RESUMEN = congelar([
  ['cambios_cliente', 'con cambios pedidos', 'ambar'],
  ['sin_respuesta', 'sin respuesta al recordatorio', 'rojo'],
]);

/** Los pasos que llevan esos avisos. */
const PASOS_CON_AVISOS = congelar(['SC', 'COT']);

/**
 * Los avisos de RP12 del paso `clave`; un conteo 0 (o que no es un número positivo) no pinta aviso.
 * @returns {AvisoPaso[]}
 */
function avisosDelPaso(datos, clave) {
  if (!esObjeto(datos) || !PASOS_CON_AVISOS.includes(clave)) return [];
  /** @type {AvisoPaso[]} */
  const avisos = [];
  for (const [campo, texto, tono] of AVISOS_DEL_RESUMEN) {
    const porTipo = datos[campo];
    const n = esObjeto(porTipo) && tiene(porTipo, clave) ? cantidadPositiva(porTipo[clave]) : null;
    if (n !== null) avisos.push({ texto: `${formatoEntero(n)} ${texto}`, tono: /** @type {AvisoPaso['tono']} */ (tono) });
  }
  return avisos;
}

/**
 * La respuesta de GET /ventas/flujo (res.data: {cambios_cliente, sin_respuesta, pasos, semaforo, dias_alerta,
 * generado_at}) en la forma que lee pasosConConteos: {clave: {total, atrasados, masAntiguoDias, porEstado, avisos}}
 * para las 5 claves de PASOS_FLUJO_VENTAS.
 *  - Los números son los de conteosDePasos de flujo.js (r1: la única conversión de los pasos del servidor); un paso
 *    que no viene queda todo en null.
 *  - avisos (RP12), solo en SC y COT: «N con cambios pedidos» (ámbar) y «N sin respuesta al recordatorio» (rojo),
 *    cuando vienen y son mayores que 0. Es lo único que agrega Ventas.
 *  - Tolera nulos: sin datos, todo en null y sin avisos.
 * @param {any} datos
 * @returns {Record<ClavePasoVentas, ConteoVentas>}
 */
export function conteosDesdeResumen(datos) {
  const pasos = esObjeto(datos) && esObjeto(datos.pasos) ? datos.pasos : {};
  // Las 5 claves de Ventas, en su orden; un paso que no vino va como null y conteosDePasos lo deja todo en null.
  const base = conteosDePasos({
    pasos: Object.fromEntries(PASOS_FLUJO_VENTAS.map(({ clave }) => [clave, tiene(pasos, clave) ? pasos[clave] : null])),
  });
  /** @type {any} */
  const conteos = {};
  for (const { clave } of PASOS_FLUJO_VENTAS) conteos[clave] = { ...base[clave], avisos: avisosDelPaso(datos, clave) };
  return conteos;
}

/** La vista del Hub (R6) de cada paso (RP21). */
const VISTA_DE_PASO = congelar({ SC: 'sc', COT: 'cot', PVEN: 'ven', ENTREGADO: 'ven', FACTURADO: 'ven' });

/**
 * La vista del Hub que se activa al tocar un paso (RP21): SC -> 'sc', COT -> 'cot'; PVEN, ENTREGADO y FACTURADO ->
 * 'ven'. Una clave desconocida da null (la pantalla la ignora).
 * @param {unknown} clave
 * @returns {VistaHubDePaso | null}
 */
export function tabHubDePaso(clave) {
  return typeof clave === 'string' && tiene(VISTA_DE_PASO, clave) ? /** @type {any} */ (VISTA_DE_PASO)[clave] : null;
}

// ─── la cadena de documentos (FLUJO-documentos) ─────────────────────────────────

/** RP74: VEN y PVEN son el mismo tipo (como _ALIAS_ENTIDAD de textos_actividad.py). */
const TIPO_CADENA = congelar({ SC: 'SC', COT: 'COT', PVEN: 'PVEN', VEN: 'PVEN' });

/** Las etiquetas de estado por defecto: las tablas únicas de cada documento (no se copia ninguna). */
const ETIQUETAS_POR_DEFECTO = congelar({ sc: infoEstadoSolicitud, cot: infoEstadoCotizacion, pven: infoEstadoPedido });

/**
 * Si el documento de cada caja está cancelado o rechazado (CANCELADA, RECHAZADA o CANCELADO). La caja Compra no está:
 * es un anexo del pedido, siempre 'neutro' (la fila del pedido no trae el estado de su compra).
 */
const CAIDO = congelar({
  SC: (e) => e === 'CANCELADA',
  COT: (e) => !esCotizacionActiva(e),
  PVEN: (e) => !esPedidoVigente(e),
});

/** « (+1 rechazada)», « (+2 cancelados)»: los caídos que tienen un reemplazo vigente. */
const REEMPLAZOS = congelar({ COT: ['rechazada', 'rechazadas'], PVEN: ['cancelado', 'cancelados'] });

/** El que tiene el id mayor (el más reciente) o, sin ids comparables, el último del arreglo. */
function masReciente(docs) {
  return docs.reduce((ultimo, d) => {
    if (!ultimo) return d;
    const [a, b] = [Number(ultimo.id), Number(d.id)];
    return Number.isFinite(a) && Number.isFinite(b) && b < a ? ultimo : d;
  }, null);
}

/**
 * El documento que se muestra de una lista (las cotizaciones o los pedidos de la SC, los pedidos de la COT): el más
 * reciente vigente o, si no hay, el último. `caidos` cuenta los no vigentes cuando sí hay uno vigente.
 */
function elegir(lista, esVigente) {
  const docs = (Array.isArray(lista) ? lista : []).filter(esObjeto);
  if (!docs.length) return null;
  const vigente = masReciente(docs.filter((d) => esVigente(d.estado)));
  return { doc: vigente ?? masReciente(docs), caidos: vigente ? docs.filter((d) => !esVigente(d.estado)).length : 0 };
}

/** {doc: {id, numero}} de un documento vinculado por id y número, o null si no tiene ninguno. */
function vinculado(id, numero) {
  const sinId = id === null || id === undefined || id === '';
  const sinNumero = numero === null || numero === undefined || numero === '';
  return sinId && sinNumero ? null : { doc: { id: sinId ? null : id, numero: sinNumero ? null : numero }, caidos: 0 };
}

/**
 * El contexto de la cadena de UN documento (ayudante interno de cadenaVentas, RP67): qué solicitud, cotización, pedido
 * y compra se muestran. Cada caja es {doc, caidos, propio?}, {neutro: texto} (no aplica: «Cotización directa»,
 * «Sin solicitud», «Sin cotización») o null (todavía no existe).
 *  - SC: la SC es el documento; la COT, la más reciente activa (esCotizacionActiva) o la última; el PVEN, el más
 *    reciente vigente (esPedidoVigente) de pedidos_venta o el último.
 *  - COT: la SC es {sc_id, sc_numero} (sin ella, «Cotización directa», el texto del spec); el PVEN sale de
 *    pedidos_venta.
 *  - PVEN: la SC {sc_id, sc_numero} y la COT {cot_id, cot_numero}. Sin SC: «Cotización directa» si tiene COT (es la
 *    misma cotización sin solicitud) o «Sin solicitud»; sin COT: «Sin cotización». No se usa «Pedido directo»: en el
 *    sistema es el pedido que EXIGE una cotización confirmada (B2.1 D3). Con pec_numero, la compra {pec_id,
 *    pec_numero}.
 */
function contextoFlujo(doc, tipo) {
  const propio = { doc, caidos: 0, propio: true };
  if (tipo === 'SC') {
    return { SC: propio, COT: elegir(doc.cotizaciones, esCotizacionActiva), PVEN: elegir(doc.pedidos_venta, esPedidoVigente) };
  }
  if (tipo === 'COT') {
    return {
      SC: vinculado(doc.sc_id, doc.sc_numero) ?? { neutro: 'Cotización directa' },
      COT: propio,
      PVEN: elegir(doc.pedidos_venta, esPedidoVigente),
    };
  }
  const cot = vinculado(doc.cot_id, doc.cot_numero);
  const pec = doc.pec_numero ? vinculado(doc.pec_id, doc.pec_numero) : null;
  return {
    SC: vinculado(doc.sc_id, doc.sc_numero) ?? { neutro: cot ? 'Cotización directa' : 'Sin solicitud' },
    COT: cot ?? { neutro: 'Sin cotización' },
    PVEN: propio,
    ...(pec ? { PEC: pec } : {}),
  };
}

/** El texto de la etiqueta de un estado: la función da un texto o un objeto con label; nunca el código crudo. */
function etiquetaDe(fn, estado) {
  const r = typeof fn === 'function' ? fn(estado) : null;
  if (typeof r === 'string') return r;
  if (esObjeto(r) && typeof r.label === 'string') return r.label;
  return humanizarCodigo(estado);
}

const conValor = (v) => v !== null && v !== undefined && v !== '';

/** Las cajas de la cadena, en orden, con lo que necesita cada una. */
const CAJAS = congelar([
  { clave: 'SC', label: PASO_POR_CLAVE.SC.label, etiqueta: 'sc', enlace: 'SC', falta: null },
  { clave: 'COT', label: PASO_POR_CLAVE.COT.label, etiqueta: 'cot', enlace: 'COT', falta: 'Sin cotización todavía' },
  { clave: 'PVEN', label: PASO_POR_CLAVE.PVEN.label, etiqueta: 'pven', enlace: 'PVEN', falta: 'Sin pedido todavía' },
  { clave: 'PEC', label: 'Compra', etiqueta: null, enlace: 'PEC', falta: null },
]);

/**
 * La barra del flujo de un documento (CadenaDocumentos, T5A; detalles de T8 a T11 y panel rápido del Hub): Solicitud →
 * Cotización → Pedido de venta y, si el pedido trae pec_numero, la caja «Compra» como ANEXO del pedido (r1, ruling del
 * controlador): siempre 'neutro', fuera de la progresión, con su número y su enlace.
 *  - tipo: 'SC', 'COT' o 'PVEN'; 'VEN' es lo mismo que 'PVEN' (RP74). Otro tipo es un error de programación (lanza
 *    Error). Sin documento: [].
 *  - etiquetas = {sc, cot, pven}: funciones que dan el texto de cada estado (un texto o un objeto con label, como
 *    infoEstadoSolicitud, infoEstadoCotizacion e infoEstadoPedido, que son las que se usan si no vienen).
 *  - rutaActual: la pantalla actual; los enlaces llevan ?return_to= con ella (el que leen los detalles con
 *    returnToSeguro). Sin ella, el enlace va sin return_to.
 * Cada caja: label; sublabel '{numero} · {etiqueta}' (solo el número si el estado no viene); href al detalle
 * (enlaceDocumento de analisis.js), salvo la del propio documento, que va sin href y con esEste. Estado:
 *  - la caja más avanzada que existe y no está cancelada, entre Solicitud, Cotización y Pedido: 'actual'; las
 *    anteriores, 'hecho';
 *  - las que no existen: 'pendiente', con 'Sin cotización todavía' o 'Sin pedido todavía';
 *  - un documento CANCELADA, RECHAZADA o CANCELADO sin reemplazo vigente: 'cancelado', con su etiqueta; si hay
 *    reemplazo, se muestra el vigente con ' (+1 rechazada)' o ' (+1 cancelado)';
 *  - la que no aplica (una COT o un pedido sin solicitud, un pedido sin cotización): 'neutro', con 'Cotización
 *    directa', 'Sin solicitud' o 'Sin cotización';
 *  - la caja Compra: 'neutro'.
 * @param {any} doc
 * @param {TipoCadena} tipo
 * @param {{etiquetas?: EtiquetasCadena, rutaActual?: string | null}} [opciones]
 * @returns {PasoVista[]}
 */
export function cadenaVentas(doc, tipo, { etiquetas = {}, rutaActual = null } = {}) {
  const t = typeof tipo === 'string' && tiene(TIPO_CADENA, tipo) ? TIPO_CADENA[/** @type {TipoCadena} */ (tipo)] : null;
  if (!t) throw new Error(`Tipo de documento desconocido para la cadena de Ventas: ${String(tipo)}`);
  if (!esObjeto(doc)) return [];
  const ctx = contextoFlujo(doc, t);
  const cajas = CAJAS.filter((c) => c.clave !== 'PEC' || ctx.PEC);
  const caido = (c) => Boolean(ctx[c.clave]?.doc) && CAIDO[c.clave](ctx[c.clave].doc.estado);
  // r1 (ruling del controlador): la progresión es SOLO Solicitud → Cotización → Pedido de venta; Compra es un anexo.
  let actual = -1;
  cajas.forEach((c, i) => { if (c.clave !== 'PEC' && ctx[c.clave]?.doc && !caido(c)) actual = i; });
  return cajas.map((c, i) => {
    const caja = ctx[c.clave];
    /** @type {PasoVista} */
    const vista = { clave: c.clave, label: c.label, estado: 'pendiente', esEste: Boolean(caja?.propio) };
    if (!caja) {
      if (c.falta) vista.sublabel = c.falta;
      return vista;
    }
    if (caja.neutro) {
      vista.estado = 'neutro';
      vista.sublabel = caja.neutro;
      return vista;
    }
    const { id, numero, estado } = caja.doc;
    const partes = [conValor(numero) ? String(numero) : null,
      c.etiqueta && conValor(estado) ? etiquetaDe(etiquetas?.[c.etiqueta] ?? ETIQUETAS_POR_DEFECTO[c.etiqueta], estado) : null]
      .filter(Boolean);
    let sublabel = partes.join(' · ');
    if (caja.caidos > 0) {
      const [uno, varios] = REEMPLAZOS[c.clave];
      sublabel += ` (+${caja.caidos} ${caja.caidos === 1 ? uno : varios})`;
    }
    if (sublabel) vista.sublabel = sublabel;
    if (c.clave === 'PEC') vista.estado = 'neutro';
    else vista.estado = caido(c) ? 'cancelado' : i === actual ? 'actual' : 'hecho';
    if (!caja.propio) {
      const href = enlaceDocumento(c.enlace, id, { returnTo: rutaActual });
      if (href) vista.href = href;
    }
    return vista;
  });
}

// ─── los pasos propios de la cotización (RP87) ──────────────────────────────────

/**
 * Los 3 pasos de la barra de la cotización (los textos del Status Tracker de hoy, con tildes). Inmutable.
 * @type {ReadonlyArray<Readonly<{clave: string, label: string}>>}
 */
export const PASOS_COTIZACION = congelar([
  { clave: 'BORRADOR', label: 'Borrador (valorizando)' },
  { clave: 'ENVIADA', label: 'Cotizado al cliente' },
  { clave: 'CONFIRMADA', label: 'Confirmado (venta)' },
]);

/**
 * El lugar de un estado de la cotización en PASOS_COTIZACION, en la forma que usa T11 (RP87):
 * `pasosConProgreso(PASOS_COTIZACION, p.indice, {canceladoEn: p.canceladoEn})`.
 *  - BORRADOR 0; ENVIADA y PENDIENTE_CONFIRMACION 1; CONFIRMADA 2;
 *  - RECHAZADA: canceladoEn 1, con la etiqueta 'Rechazada';
 *  - VENCIDA: 1, con el aviso ámbar 'Vencida';
 *  - un estado desconocido va al primer paso, como el stepper de hoy (la etiqueta del estado dice el real).
 * Los textos salen de infoEstadoCotizacion (estados-cotizacion.js).
 * @param {unknown} estado
 * @returns {PasoCotizacion}
 */
export function pasoCotizacion(estado) {
  switch (typeof estado === 'string' ? estado.trim() : estado) {
    case 'ENVIADA':
    case 'PENDIENTE_CONFIRMACION':
      return { indice: 1 };
    case 'CONFIRMADA':
      return { indice: 2 };
    case 'RECHAZADA':
      return { indice: 1, canceladoEn: 1, etiqueta: infoEstadoCotizacion('RECHAZADA').label };
    case 'VENCIDA':
      return { indice: 1, aviso: { texto: infoEstadoCotizacion('VENCIDA').label, tono: 'ambar' } };
    default:
      return { indice: 0 };
  }
}
