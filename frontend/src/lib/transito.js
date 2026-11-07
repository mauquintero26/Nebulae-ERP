/**
 * El tablero de Mercancía en tránsito (Bloque 4, T3C: KANBAN-logistica punto 1; R11, RP76). JS plano, sin React ni DOM,
 * para probarlo con node (frontend/tests/test_transito.mjs). Lo usa compras/transito/page.tsx (T16A) con el tablero
 * común en modo cliente (la vista completa, hasta 200 PEC).
 *
 *  - columnasDeEtapas: una columna por etapa de GET /compras/tracking-config, uniendo el envío por casillero y el
 *    directo en orden (RP76).
 *  - etapaActual / columnaTransito: cada pedido está en la primera etapa que le falta completar (currentStageOf de la
 *    pantalla).
 *  - reglaSoltarTransito: solo hacia la etapa siguiente del mismo pedido, y eso completa la etapa actual (= «Completar»,
 *    PATCH /compras/pedidos/{id}/tracking, que queda en la Actividad; transito_arrastrar_completa). Iniciar una etapa
 *    se hace con el botón de la tarjeta.
 */

import { congelar, humanizarCodigo } from './estados-pedido.js';
import { definirColumnas } from './kanban.js';
// B4 T16A: el día de una fecha de negocio y la tarjeta de un PEC, el día de hoy y los números con su formato.
import { diaPec, tarjetaPec } from './estados-compras.js';
import { diaColombia } from './fechas-colombia.js';
import { formatoDecimal, formatoEntero } from './kpis.js';

/**
 * @typedef {import('./kanban.js').ResultadoSoltar} ResultadoSoltar
 * @typedef {{key?: string, label?: string, active?: boolean, alert_confirm_days?: number | null,
 *   alert_overdue_days?: number | null}} EtapaConfig
 * @typedef {{casillero?: EtapaConfig[], directo?: EtapaConfig[]}} ConfigTracking
 * @typedef {{stage?: string, label?: string, status?: string}} EtapaPec
 * @typedef {{clave: string, titulo: string, cerrada: boolean}} ColumnaTransito
 */

/** Los tipos de envío, en el orden en que se unen sus etapas (el casillero es el más largo). */
const TIPOS_ENVIO = congelar(['casillero', 'directo']);

const ENLACE_RECEPCIONES = congelar({ texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' });

const esObjeto = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const textoLleno = (v) => typeof v === 'string' && v.trim() !== '';

/** El label de una etapa con la flecha bonita: 'Proveedor -> Casillero' -> 'Proveedor → Casillero'. */
const conFlecha = (label) => label.trim().replace(/\s*->\s*/g, ' → ');

/** La configuración de la respuesta ({status, data}) o tal cual. */
function configDe(config) {
  if (esObjeto(config) && esObjeto(config.data) && !Array.isArray(config.casillero) && !Array.isArray(config.directo)) {
    return config.data;
  }
  return esObjeto(config) ? config : {};
}

/** Las etapas activas de un tipo de envío ({key, label}), sin claves vacías ni repetidas. */
function etapasActivas(lista) {
  const vistas = new Set();
  const salida = [];
  for (const s of Array.isArray(lista) ? lista : []) {
    if (!esObjeto(s) || !textoLleno(s.key) || s.active === false || vistas.has(s.key)) continue;
    vistas.add(s.key);
    salida.push({ key: s.key, label: textoLleno(s.label) ? s.label : humanizarCodigo(s.key) });
  }
  return salida;
}

/**
 * Las columnas del tablero de tránsito a partir de GET /compras/tracking-config ({casillero: [...], directo: [...]}, o
 * la respuesta {status, data}), con la forma de kanban.js ({clave, titulo, cerrada: false}):
 *  - las etapas activas de cada tipo de envío, unidas por `key`: se recorre el casillero y cada etapa del directo que
 *    falta entra justo antes de la siguiente etapa que comparten (RP76); si no comparten ninguna más adelante, al final.
 *    Con la configuración por defecto: PENDIENTE_DESPACHO, PROVEEDOR_CASILLERO, CASILLERO_BODEGA, PROVEEDOR_BODEGA y
 *    RECIBIDO;
 *  - titulo = el label de la primera configuración que tiene la etapa, con '→' en vez de '->';
 *  - con `pedidos`, la etapa actual de un PEC viejo que ya no está en la configuración suma su columna al final (con
 *    el label de su etapa), para que el pedido se siga viendo.
 * Sin ninguna etapa devuelve [] (la pantalla avisa). Inmutable.
 * @param {ConfigTracking | {data?: ConfigTracking} | null | undefined} config
 * @param {{pedidos?: ReadonlyArray<any>}} [opciones]
 * @returns {ReadonlyArray<Readonly<ColumnaTransito>>}
 */
export function columnasDeEtapas(config, { pedidos = [] } = {}) {
  const cfg = configDe(config);
  /** @type {{key: string, label: string}[]} */
  const orden = [];
  for (const tipo of TIPOS_ENVIO) {
    let pendientes = [];
    for (const etapa of etapasActivas(cfg[tipo])) {
      const i = orden.findIndex((e) => e.key === etapa.key);
      if (i < 0) {
        pendientes.push(etapa);
      } else if (pendientes.length) {
        orden.splice(i, 0, ...pendientes);
        pendientes = [];
      }
    }
    orden.push(...pendientes);
  }
  for (const p of Array.isArray(pedidos) ? pedidos : []) {
    const actual = etapaActual(p);
    if (actual && textoLleno(actual.stage) && !orden.some((e) => e.key === actual.stage)) {
      orden.push({ key: actual.stage, label: textoLleno(actual.label) ? actual.label : humanizarCodigo(actual.stage) });
    }
  }
  if (!orden.length) return congelar([]);
  return /** @type {any} */ (definirColumnas(orden.map((e) => ({ clave: e.key, titulo: conFlecha(e.label), cerrada: false }))));
}

/** Las etapas de un PEC (tracking_stages) que son objetos con su `stage`. */
function etapasDe(pec) {
  return (Array.isArray(pec?.tracking_stages) ? pec.tracking_stages : []).filter((s) => esObjeto(s));
}

/**
 * La etapa que le falta completar al pedido: la primera de pec.tracking_stages con status distinto de COMPLETADO, o
 * null si ya completó todas (o no tiene).
 * @param {any} pec
 * @returns {EtapaPec | null}
 */
export function etapaActual(pec) {
  return etapasDe(pec).find((s) => s.status !== 'COMPLETADO') ?? null;
}

/**
 * La columna del pedido en el tablero: el `stage` de su etapa actual, o null si ya completó todas.
 * @param {any} pec
 * @returns {string | null}
 */
export function columnaTransito(pec) {
  const actual = etapaActual(pec);
  return actual && textoLleno(actual.stage) ? actual.stage : null;
}

/** El título de la etapa `clave`: el de la columna, el de la etapa del pedido o la clave humanizada. */
function tituloEtapa(clave, pec, columnas) {
  const columna = Array.isArray(columnas) ? columnas.find((c) => c?.clave === clave) : null;
  if (columna && textoLleno(columna.titulo)) return columna.titulo;
  const etapa = etapasDe(pec).find((s) => s.stage === clave);
  if (etapa && textoLleno(etapa.label)) return conFlecha(etapa.label);
  return humanizarCodigo(clave);
}

/**
 * Qué pasa al soltar un PEC de la columna `origen` en `destino` (claves de etapa), con la forma de kanban.js. Mira las
 * etapas del propio pedido (las de su tipo de envío):
 *  - la misma columna: ninguno;
 *  - si ya está en la etapa final (Recibido) o completó todas: bloqueado 'Ya llegó: confírmalo en Recepciones.', con
 *    el enlace a Recepciones;
 *  - una etapa que no está en su envío: bloqueado 'Este pedido va por envío {directo|casillero}: no pasa por «X».';
 *  - la etapa siguiente: {tipo: 'cambio', estado: 'COMPLETADO', cuerpo: {stage: <la actual>}} (completa la actual);
 *  - una más adelante: bloqueado 'Las etapas se completan en orden: primero «<la siguiente>».';
 *  - una anterior: bloqueado 'Una etapa completada no se deshace desde aquí.'
 * Los títulos salen de `columnas` (las de columnasDeEtapas), si llegan. Un envío sin tipo_envio es por casillero, como
 * en el servidor.
 * @param {any} pec
 * @param {string} origen
 * @param {string} destino
 * @param {{columnas?: ReadonlyArray<{clave: string, titulo: string}>}} [opciones]
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarTransito(pec, origen, destino, { columnas } = {}) {
  if (origen === destino) return { tipo: 'ninguno' };
  const ruta = etapasDe(pec).map((s) => s.stage).filter(textoLleno);
  const actual = etapaActual(pec);
  const iActual = actual ? ruta.indexOf(actual.stage) : -1;
  if (iActual < 0 || iActual === ruta.length - 1) {
    return { tipo: 'bloqueado', motivo: 'Ya llegó: confírmalo en Recepciones.', enlace: ENLACE_RECEPCIONES };
  }
  const iDestino = ruta.indexOf(destino);
  if (iDestino < 0) {
    const envio = pec?.tipo_envio === 'directo' ? 'directo' : 'casillero';
    return { tipo: 'bloqueado', motivo: `Este pedido va por envío ${envio}: no pasa por «${tituloEtapa(destino, pec, columnas)}».` };
  }
  if (iDestino === iActual + 1) return { tipo: 'cambio', estado: 'COMPLETADO', cuerpo: { stage: ruta[iActual] } };
  if (iDestino > iActual + 1) {
    return { tipo: 'bloqueado', motivo: `Las etapas se completan en orden: primero «${tituloEtapa(ruta[iActual + 1], pec, columnas)}».` };
  }
  if (iDestino === iActual) return { tipo: 'ninguno' };
  return { tipo: 'bloqueado', motivo: 'Una etapa completada no se deshace desde aquí.' };
}

// ─── La pantalla de Tránsito (B4 T16A: TABLA-compras punto 8, KANBAN-logistica punto 2, KPI-compras punto 7) ────────

/**
 * El botón de la fila y de la tarjeta sobre la etapa que le falta completar al pedido (etapaActual): «Iniciar» la pone en
 * curso (EN_PROCESO) y «Completar» la completa (COMPLETADO). Es el mismo PATCH /compras/pedidos/{id}/tracking que el
 * arrastre a la etapa siguiente (reglaSoltarTransito). Sin etapa por hacer (todas completadas o sin etapas), o con una
 * etapa cancelada, null.
 * @param {any} pec
 * @returns {{stage: string, status: 'EN_PROCESO' | 'COMPLETADO', texto: 'Iniciar' | 'Completar'} | null}
 */
export function accionEtapaTransito(pec) {
  const actual = etapaActual(pec);
  if (!actual || !textoLleno(actual.stage) || actual.status === 'CANCELADO') return null;
  return actual.status === 'EN_PROCESO'
    ? { stage: actual.stage, status: 'COMPLETADO', texto: 'Completar' }
    : { stage: actual.stage, status: 'EN_PROCESO', texto: 'Iniciar' };
}

/**
 * Las etapas completadas de un pedido sobre las que tiene, para «n de m» de la columna Progreso. Sin etapas: 'Sin etapas'.
 * @param {any} pec
 * @returns {{hechas: number, total: number, texto: string}}
 */
export function avanceTransito(pec) {
  const etapas = etapasDe(pec);
  const hechas = etapas.filter((s) => s.status === 'COMPLETADO').length;
  return { hechas, total: etapas.length, texto: etapas.length ? `${hechas} de ${etapas.length}` : 'Sin etapas' };
}

/**
 * La tarjeta «Avance promedio» (pec_avance): el promedio de etapas completadas sobre el promedio de etapas, de las filas
 * dadas (la página que se ve, RP95), con coma decimal: '1,5/4'. Sin filas (o lo que no es un arreglo): null.
 * @param {ReadonlyArray<any> | null | undefined} filas
 * @returns {string | null}
 */
export function avancePromedioTransito(filas) {
  if (!Array.isArray(filas) || filas.length === 0) return null;
  let hechas = 0;
  let total = 0;
  for (const p of filas) {
    const a = avanceTransito(p);
    hechas += a.hechas;
    total += a.total;
  }
  const promedio = Math.round((hechas / filas.length) * 10) / 10;
  const etapas = Math.round(total / filas.length);
  return `${formatoDecimal(promedio)}/${etapas > 0 ? formatoEntero(etapas) : '—'}`;
}

const MS_DIA = 24 * 60 * 60 * 1000;
/** Los días de calendario de `desde` a `hasta` ('AAAA-MM-DD'): sin zonas ni horas de verano. */
function diasEntre(desde, hasta) {
  const ms = (dia) => { const [a, m, d] = dia.split('-').map(Number); return Date.UTC(a, m - 1, d); };
  return Math.round((ms(hasta) - ms(desde)) / MS_DIA);
}
const enDias = (n) => `${formatoEntero(n)} ${n === 1 ? 'día' : 'días'}`;

/**
 * Cuánto falta (o cuánto pasó) de la entrega estimada, para la tabla y la tarjeta (resolución 5: un día de calendario,
 * el que se guarda, diaPec, contra `hoy`, por defecto el de Colombia). «Vencido» lo manda el servidor (`is_overdue`, RP40):
 *  - vencido por el servidor y el día ya pasó: 'Vencido hace N días';
 *  - después de hoy: 'Entrega en N días'; hoy: 'Entrega hoy' (una entrega guardada hoy a las 00:00 no está vencida);
 *  - antes de hoy sin la marca del servidor (por ejemplo, un pedido que ya llegó a bodega): 'Debía llegar hace N días',
 *    sin alarma.
 * Sin fecha o con algo que no es un día: null.
 * @param {any} pec
 * @param {string} [hoy]  'AAAA-MM-DD'
 * @returns {string | null}
 */
export function textoEntregaTransito(pec, hoy = diaColombia()) {
  const dia = diaPec(pec?.fecha_entrega_estimada);
  const base = diaPec(hoy);
  if (!dia || !base) return null;
  const dias = diasEntre(base, dia);
  if (dias < 0) return pec?.is_overdue === true ? `Vencido hace ${enDias(-dias)}` : `Debía llegar hace ${enDias(-dias)}`;
  return dias === 0 ? 'Entrega hoy' : `Entrega en ${enDias(dias)}`;
}

/**
 * La tarjeta de un PEC en el tablero de etapas (la forma de DatosTarjetaKanban): la de tarjetaPec (número, proveedor,
 * PVEN, monto, estado y el chip «Vencido» del servidor) más el tipo de envío en un chip ('Directo', o 'Casillero': sin
 * tipo es por casillero, como el servidor), el tiempo de textoEntregaTransito y, de acción principal, el «Iniciar» o
 * «Completar» de la etapa actual (accionEtapaTransito; la pantalla le pone el onClick). Sin etapa por hacer, sin botón.
 * @param {any} pec
 * @param {{hoy?: string}} [opciones]
 * @returns {ReturnType<typeof tarjetaPec> & {accionPrincipal: {texto: string, tono: string} | null}}
 */
export function tarjetaTransito(pec, { hoy } = {}) {
  const base = tarjetaPec(pec);
  const accion = accionEtapaTransito(pec);
  return {
    ...base,
    chips: [...base.chips, { texto: pec?.tipo_envio === 'directo' ? 'Directo' : 'Casillero', tono: 'slate' }],
    tiempo: textoEntregaTransito(pec, hoy) ?? base.tiempo,
    accionPrincipal: accion ? { texto: accion.texto, tono: accion.status === 'COMPLETADO' ? 'emerald' : 'slate' } : null,
  };
}
