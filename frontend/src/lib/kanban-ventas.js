/**
 * Las reglas puras de los tableros de Ventas (Bloque 4, T3C: KANBAN-hub-ventas punto 1 y KANBAN-ventas-listas punto 4;
 * C4, C7, C14, C15, R11; RP14, RP16, RP17, RP18, RP67, RP74, D4, D11, D22 y D25). JS plano, sin React ni DOM, para
 * probarlo con node (frontend/tests/test_kanban_ventas.mjs). Lo usan las pantallas del Hub (T7), Solicitudes (T8),
 * Cotizaciones (T9), Pedidos de venta (T10) y los pedidos web (T23A), con TableroKanban (T4B).
 *
 *  - Hub: COLUMNAS_HUB (las de T9, con las claves que da columnaHub de hub-ventas.js), reglaSoltarHub y tarjetaHub. La
 *    tarjeta lee la fila del servidor (resolucion, dias_sin_mov, seguimiento_estado y cambios_cliente, C14): no hay
 *    mapaSeguimiento ni chip «Soporte» (las SC de Soporte no llegan al Hub, R8).
 *  - chipsDocumentoVentas (RP18, D4): los chips de una fila de Ventas, máximo 3; los usan tarjetaHub y las tarjetas de
 *    Solicitudes y Cotizaciones.
 *  - confirmacionReiniciarSolicitud (RP17): el texto de «Reiniciar solicitud» (antes en línea en solicitud/[id]/page.tsx
 *    y en solicitud-client.tsx), para confirmar() de useAvisos.
 *  - B4 T7, lo que comparten la tabla y el tablero del Hub: opcionesEstadosHub (el filtro de estados agrupado por tipo,
 *    con TIPO:ESTADO) y chipsResolucionHub (la columna Resolución: el chip corto y, debajo, los de chipsDocumentoVentas).
 *  - Listas: motivoTransicionPedido (los textos de N2 sin el número), COLUMNAS_PEDIDO / reglaSoltarPedido,
 *    COLUMNAS_COT / reglaSoltarCotizacion y COLUMNAS_SC / reglaSoltarSC.
 *  - C15(a): en el Hub y en Cotizaciones, sacar una COT de «Esperando al cliente» o de «Confirmada» queda bloqueado con
 *    «Ábrela para re-cotizar; te pedirá la razón.» (el 409 ANULA_CONFIRMACION del Bloque 2 pide la razón); RECHAZADA →
 *    Borrador sí se permite.
 *  - RP16 / D11: las listas no envían. reglaSoltarSC y reglaSoltarCotizacion dan la acción 'enviar' solo con
 *    {puedeEnviar: true}; sin ella, «Ábrela para enviar.» con el enlace al documento (D22: enlaceDocumento con
 *    return_to a la lista). El Hub conserva su envío (abrirEnvioHub → confirmarEnvioHub).
 *  - T3C r1: ningún tablero ofrece enviar una COT que enviar_cotizacion_para_confirmacion rechaza con 400: una VENCIDA
 *    («Primero pásala a Borrador para retomarla.») o una sin productos o sin total («Calcula los precios antes de
 *    enviarla.», el criterio de «Completar precios» de accionSiguienteCOT). Tampoco ofrece cancelar una SC con una
 *    cotización activa o un pedido vigente (N4, el 409 de POST /cancelar; pasosParaCancelarSolicitud de listas-ventas.js
 *    y, en el Hub, scConCot): «No se puede cancelar: tiene una cotización o un pedido vigente.».
 *
 * Los resultados tienen la forma de lib/kanban.js: {tipo: 'ninguno'} | {tipo: 'bloqueado', motivo, enlace?} |
 * {tipo: 'cambio', estado} | {tipo: 'accion', accion}. Las acciones que la pantalla resuelve: 'enviar', 'cancelar',
 * 'reiniciar', 'rechazar' y 'facturar'. Una columna de destino que no es del tablero, o un tipo de documento que no
 * es SC, COT, VEN o PVEN, es un error de programación (lanza Error).
 *
 * Importa ACCIONES_BLOQUE3 (lib/acciones-bloque3.js) solo por su etiqueta (RP18); ese módulo trae los íconos de
 * lucide-react, pero aquí no se pinta nada.
 */

import { definirColumnas } from './kanban.js';
import {
  congelar, ESTADOS_PEDIDO, PASOS_PEDIDO, TRANSICIONES_PEDIDO_PATCH, grupoPedido, transicionesPedido, esPedidoVigente,
  infoEstadoPedido, tiene, ESTADOS_PEDIDO_OPERATIVOS, ESTADOS_PEDIDO_CERRADOS,
} from './estados-pedido.js';
import {
  RUTA_HUB_VENTAS, esSoporte, motivoNoCancelable, tieneProductos, accionSiguienteCOT, accionSiguienteDocumento, diasDesde,
  textoAntiguedad, ETIQUETA_GRUPO,
} from './hub-ventas.js';
import {
  ESTADOS_SC, PASOS_SC, ESTADOS_SC_HEREDADOS, ESTADOS_SC_CON_CONFIRMACION, infoEstadoSolicitud, puedeReiniciar,
} from './estados-solicitud.js';
import { ESTADOS_COTIZACION, infoEstadoCotizacion } from './estados-cotizacion.js';
import {
  pedidoVigente, cotizacionesVigentes, pasosParaCancelarSolicitud, marcaPedidoCotizacion, chipSinPrecio,
} from './listas-ventas.js';
import {
  avisoCambiosCliente, etiquetaChipCambios, RUTA_LISTA_SOLICITUDES, RUTA_LISTA_COTIZACIONES,
} from './cambios-cliente.js';
import { ACCIONES_BLOQUE3 } from './acciones-bloque3.js';
import { enlaceDocumento } from './analisis.js';
import { etiquetaTipoSolicitud } from './etiquetas-ventas.js';
import { redondearPeso } from './pesos.js';
import { queryListado } from './tabla.js';

/**
 * @typedef {import('./kanban.js').ResultadoSoltar} ResultadoSoltar
 * @typedef {import('./kanban.js').EnlaceBloqueo} EnlaceBloqueo
 * @typedef {'No Resuelto' | 'En Gestión' | 'Acción Tomada' | 'Cancelado'} ClaveColumnaHub
 * @typedef {{clave: ClaveColumnaHub, titulo: string, tono: string, cerrada: boolean}} ColumnaHub
 * @typedef {'pend_compra' | 'en_proceso' | 'listo_entrega' | 'entregado' | 'facturado' | 'cancelado'} ClaveColumnaPedido
 * @typedef {{clave: ClaveColumnaPedido, titulo: string, tono: string, estados: ReadonlyArray<string>, cerrada: boolean,
 *   estadoDestino: string | null}} ColumnaPedido
 * @typedef {'borrador' | 'esperando' | 'confirmada' | 'vencida' | 'rechazada'} ClaveColumnaCot
 * @typedef {{clave: ClaveColumnaCot, titulo: string, tono: string, estados: ReadonlyArray<string>, cerrada: boolean}} ColumnaCot
 * @typedef {'nueva' | 'asignada' | 'pendiente' | 'confirmada' | 'cancelada'} ClaveColumnaSc
 * @typedef {{clave: ClaveColumnaSc, titulo: string, tono: string, estados: ReadonlyArray<string>, cerrada: boolean,
 *   ayuda?: string}} ColumnaSc
 * @typedef {'rose' | 'amber' | 'emerald'} TonoChip
 *   B4 T9 r1 (I1): emerald es el de «Pedido PVEN-…» de la tarjeta de Cotizaciones (CLASE_CHIP ya lo tiene).
 * @typedef {{texto: string, tono: TonoChip}} ChipTarjeta
 * @typedef {{bg: string, text: string, border: string}} ClasesEstado
 * @typedef {{color: string, bg: string, border: string}} ColoresEstado
 * @typedef {{label: string, clases: ClasesEstado | null, colores: ColoresEstado | null}} EstadoTarjeta
 *   COT y pedido traen `clases` (Tailwind, de estados-cotizacion.js y estados-pedido.js); la SC trae `colores` (los hex
 *   de ESTADOS_SC). El otro va en null.
 * @typedef {{texto: string, href: string | null, tono: string}} AccionTarjeta
 * @typedef {'SC' | 'COT' | 'PVEN'} TipoTarjeta
 * @typedef {{numero: string, tipo: TipoTarjeta, titulo: string, subtitulo: string, monto: number | null,
 *   estado: EstadoTarjeta, tiempo: string, atrasada: boolean, chips: ChipTarjeta[], accionPrincipal: AccionTarjeta | null}} TarjetaVentas
 * @typedef {{titulo: string, mensaje: string, textoConfirmar: string, peligro: boolean}} ConfirmacionReiniciar
 * @typedef {{puedeEnviar?: boolean, returnTo?: string}} OpcionesSoltarLista
 */

/** El máximo de chips de una tarjeta (TarjetaKanban, T4B). */
const MAX_CHIPS = 3;

// ─── textos ─────────────────────────────────────────────────────────────────────

const TEXTO = congelar({
  RE_COTIZAR: 'Ábrela para re-cotizar; te pedirá la razón.',
  ABRELA_ENVIAR: 'Ábrela para enviar.',
  ABRELA_CAMBIAR: 'Ábrela para cambiar su estado.',
  NO_REINICIAR: 'No se puede reiniciar: tiene una cotización o un pedido vigente.',
  NO_CANCELAR: 'No se puede cancelar: tiene una cotización o un pedido vigente.',
  SOLO_REINICIABLE: 'Solo se reinicia una solicitud pendiente por confirmación o confirmada.',
  PAPELERA: 'Una solicitud cancelada se restaura desde la Papelera.',
  SC_SOLO_CLIENTE: 'Solo el cliente confirma la solicitud con su enlace.',
  SC_ACCION_TOMADA: 'La solicitud queda Confirmada solo cuando el cliente confirma con su enlace.',
  COT_SOLO_CLIENTE: 'Solo el cliente confirma la cotización con su enlace.',
  YA_PENDIENTE: 'Ya está pendiente de confirmación del cliente.',
  YA_CONFIRMO: 'El cliente ya la confirmó.',
  ASIGNA_ASESOR: 'Primero asígnale un asesor.',
  AGREGA_PRODUCTOS: 'Agrégale productos antes de enviarla.',
  COT_ACTIVA: 'Tiene una cotización activa: no se puede reiniciar.',
  QUEDA_ASIGNADA: 'Al reiniciarla queda en Asignada porque tiene asesor.',
  QUEDA_NUEVA: 'Al reiniciarla queda en Nueva porque no tiene asesor.',
  QUITA_ASESOR: 'Para dejarla en Nueva quítale el asesor desde la solicitud.',
  ASIGNA_DESDE_SC: 'Asígnale un asesor desde la solicitud.',
  RETOMALA_HUB: 'Primero retómala: suéltala en No resuelto.',
  PASALA_BORRADOR: 'Primero pásala a Borrador para retomarla.',
  CALCULA_PRECIOS: 'Calcula los precios antes de enviarla.',
  ENTREGAS: 'Se despacha desde Entregas: ahí eliges la bodega y se descuenta el inventario.',
});

const ENLACE_ENTREGAS = congelar({ texto: 'Ir a Entregas', href: '/dashboard/inventario/entregas' });
const TEXTO_ENLACE = congelar({ SC: 'Abrir solicitud', COT: 'Abrir cotización', PVEN: 'Abrir pedido' });

// ─── piezas comunes ─────────────────────────────────────────────────────────────

/** @returns {ResultadoSoltar} */
const ninguno = () => ({ tipo: 'ninguno' });
/** @returns {ResultadoSoltar} */
const accion = (nombre) => ({ tipo: 'accion', accion: nombre });
/** @returns {ResultadoSoltar} */
const cambio = (estado) => ({ tipo: 'cambio', estado });

/**
 * Un bloqueo con su enlace, si lo hay (sin enlace la clave no va: kanban.js exige texto y href llenos).
 * @param {string} motivo
 * @param {EnlaceBloqueo | null | undefined} [enlace]
 * @returns {ResultadoSoltar}
 */
const bloqueado = (motivo, enlace) => (enlace ? { tipo: 'bloqueado', motivo, enlace } : { tipo: 'bloqueado', motivo });

/**
 * El enlace «Abrir solicitud / cotización / pedido» al documento con ?return_to= (D22), o null si no tiene id.
 * @param {'SC' | 'COT' | 'PVEN'} tipo
 * @param {unknown} id
 * @param {string | null | undefined} returnTo
 * @returns {EnlaceBloqueo | null}
 */
function enlaceAbrir(tipo, id, returnTo) {
  const href = enlaceDocumento(tipo, id, { returnTo: returnTo || null });
  return href ? { texto: TEXTO_ENLACE[tipo], href } : null;
}

/** Un fragmento de motivoNoCancelable ('ya fue entregado') como oración: 'Ya fue entregado.' */
function oracion(texto) {
  const t = String(texto ?? '').trim();
  const frase = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(frase) ? frase : `${frase}.`;
}

/** Los tipos de documento; 'PVEN' es el mismo que 'VEN' (RP74, _ALIAS_ENTIDAD del backend). */
const TIPO_DOCUMENTO = congelar({ SC: 'SC', COT: 'COT', VEN: 'VEN', PVEN: 'VEN' });

/** 'SC', 'COT' o 'VEN'; otro tipo es un error de programación. */
function tipoDocumento(tipo) {
  if (typeof tipo === 'string' && tiene(TIPO_DOCUMENTO, tipo)) return TIPO_DOCUMENTO[tipo];
  throw new Error(`Tipo de documento no válido: ${JSON.stringify(tipo ?? null)}`);
}

/**
 * B4 T7 r1 (m7d): la sigla del tipo que ve el usuario: 'SC', 'COT' o 'PVEN' (las filas del Hub traen 'VEN', RP74). La
 * única: la usan la tarjeta del tablero (tarjetaHub) y la tabla del Hub. Otro valor queda como está.
 * @template {string} T
 * @param {T} tipo
 * @returns {T | 'PVEN'}
 */
export function siglaDeTipo(tipo) {
  return tipo === 'VEN' ? 'PVEN' : tipo;
}

/** Lanza Error si `destino` no es una de las claves del tablero. */
function exigirDestino(claves, destino, tablero) {
  if (!claves.includes(destino)) throw new Error(`Columna del tablero ${tablero} desconocida: ${String(destino)}`);
}

/** La familia de color de una clase de Tailwind ('bg-orange-100' -> 'orange'). */
const familia = (clase) => /^bg-([a-z]+)-\d+$/.exec(String(clase ?? ''))?.[1] ?? 'slate';

/** El pedido vigente de una cotización, con el texto del bloqueo y el enlace al pedido. */
function bloqueoPorPedido(cot, returnTo) {
  const pedido = pedidoVigente(cot);
  if (!pedido) return null;
  const numero = typeof pedido.numero === 'string' && pedido.numero.trim() ? pedido.numero.trim() : null;
  const texto = numero
    ? `Tiene el pedido ${numero} activo: para cambiarla, cancela primero el pedido.`
    : 'Tiene un pedido activo: para cambiarla, cancela primero el pedido.';
  return bloqueado(texto, enlaceAbrir('PVEN', pedido.id, returnTo));
}

/**
 * Lo que puedeReiniciar necesita de una fila de SC (RP16): sus cotizaciones activas (cotizacionesVigentes: todas
 * menos las RECHAZADA) y sus pedidos vigentes (pedidos_venta de la fila, RP15, sin los CANCELADO).
 */
function documentosDeSC(sc) {
  const pedidos = Array.isArray(sc?.pedidos_venta) ? sc.pedidos_venta : [];
  return {
    cotizacionesActivas: cotizacionesVigentes(sc),
    pedidosVigentes: pedidos.filter((v) => v && typeof v === 'object' && esPedidoVigente(v.estado)),
  };
}

const SC_CONFIRMADAS = congelar(['CONFIRMADA', ...ESTADOS_SC_HEREDADOS]);

/**
 * T3C r1: la COT no tiene nada que el cliente pueda confirmar, y enviar_cotizacion_para_confirmacion responde 400: no
 * trae productos (la lista vacía o ausente, `not cot.productos`) o su total da «Completar precios» en la columna Acción
 * (accionSiguienteCOT: total_cop ≤ 0 o que no es un número). Para BORRADOR y la antigua ENVIADA.
 */
function sinPrecios(cot) {
  return !Array.isArray(cot?.productos) || cot.productos.length === 0
    || accionSiguienteCOT(cot)?.texto === 'Completar precios';
}

/**
 * T3C r1: lo que pasa al querer enviar una COT desde un tablero (Hub → En gestión, lista → Esperando al cliente), o
 * null si se puede enviar: una VENCIDA se pasa primero a Borrador y una sin precios se calcula primero, con el enlace a
 * la cotización. Vale con o sin puedeEnviar.
 */
function bloqueoAlEnviarCot(cot, enlace) {
  if (cot?.estado === 'VENCIDA') return bloqueado(TEXTO.PASALA_BORRADOR, enlace);
  if (sinPrecios(cot)) return bloqueado(TEXTO.CALCULA_PRECIOS, enlace);
  return null;
}

// ─── Pedidos: motivo de N2 ──────────────────────────────────────────────────────

/** Los estados a los que un PATCH puede llevar un pedido (ESTADOS_VEN_DESTINOS del backend). */
const DESTINOS_PEDIDO = congelar([...new Set(Object.values(TRANSICIONES_PEDIDO_PATCH).flat())]);

const etiquetaPedido = (e) => infoEstadoPedido(e).label;

/**
 * Por qué un pedido no puede pasar de `desde` a `hacia` por PATCH, con los textos de N2 sin el número
 * (_validar_transicion_pedido de backend/app/api/v1/erp_ventas.py, en su mismo orden), o null si el servidor lo acepta
 * (o es el mismo estado):
 *  - `hacia` no se pone por PATCH: '«X» no es un estado válido para un Pedido de Venta.';
 *  - desde CANCELADO: 'El pedido está cancelado y no se puede reabrir.';
 *  - desde FACTURADO: 'El pedido ya está facturado; su estado no se puede cambiar.';
 *  - desde un estado sin salida (DEVUELTO_TOTAL): 'El pedido está devuelto; su estado no se puede cambiar.';
 *  - hacia FACTURADO: 'Solo un pedido entregado se puede marcar como Facturado.';
 *  - el resto: 'Un pedido entregado solo puede pasar a Facturado.' (las salidas permitidas, en orden alfabético).
 * @param {unknown} desde
 * @param {unknown} hacia
 * @returns {string | null}
 */
export function motivoTransicionPedido(desde, hacia) {
  if (hacia === null || hacia === undefined || hacia === desde) return null;
  if (typeof hacia !== 'string' || !DESTINOS_PEDIDO.includes(hacia)) {
    return `«${etiquetaPedido(hacia)}» no es un estado válido para un Pedido de Venta.`;
  }
  const permitidos = transicionesPedido(desde);
  if (permitidos.includes(hacia)) return null;
  if (desde === 'CANCELADO') return 'El pedido está cancelado y no se puede reabrir.';
  if (desde === 'FACTURADO') return 'El pedido ya está facturado; su estado no se puede cambiar.';
  if (!permitidos.length) return `El pedido está ${etiquetaPedido(desde).toLowerCase()}; su estado no se puede cambiar.`;
  if (hacia === 'FACTURADO') return 'Solo un pedido entregado se puede marcar como Facturado.';
  const salidas = permitidos.map(etiquetaPedido).sort().join(' o ');
  return `Un pedido ${etiquetaPedido(desde).toLowerCase()} solo puede pasar a ${salidas}.`;
}

/** El cambio a `estado` si el servidor lo acepta; si no, bloqueado con el motivo de N2. */
function cambioDePedido(estado, hacia) {
  if (transicionesPedido(estado).includes(hacia)) return cambio(hacia);
  return bloqueado(motivoTransicionPedido(estado, hacia) ?? TEXTO.ABRELA_CAMBIAR);
}

// ─── Hub ────────────────────────────────────────────────────────────────────────

/**
 * Las columnas del tablero del Hub (las de T9 del Bloque 1; C7): sus claves son las que da columnaHub de
 * hub-ventas.js (T2), con DEVUELTO_TOTAL → Cancelado. Cancelado sale plegada. Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaHub>>}
 */
export const COLUMNAS_HUB = /** @type {any} */ (definirColumnas([
  { clave: 'No Resuelto', titulo: 'No resuelto', tono: 'rose' },
  { clave: 'En Gestión', titulo: 'En gestión', tono: 'amber' },
  { clave: 'Acción Tomada', titulo: 'Acción tomada', tono: 'emerald' },
  { clave: 'Cancelado', titulo: 'Cancelado', tono: 'slate', cerrada: true },
]));

const CLAVES_HUB = congelar(COLUMNAS_HUB.map((c) => c.clave));

/** El estado del pedido al que lleva cada columna abierta del Hub. */
const DESTINO_HUB_VEN = congelar({ 'No Resuelto': 'PENDIENTE_COMPRA', 'En Gestión': 'EN_PROCESO', 'Acción Tomada': 'LISTO_ENTREGA' });

function reglaHubSC(sc, destino, scConCot) {
  const estado = sc?.estado;
  const enlace = enlaceAbrir('SC', sc?.id, RUTA_HUB_VENTAS);
  if (esSoporte(sc)) return bloqueado(oracion(motivoNoCancelable({ ...sc, tipo: 'SC' })));
  if (destino === 'Cancelado') {
    const motivo = motivoNoCancelable({ ...sc, tipo: 'SC' });
    if (motivo) return bloqueado(oracion(motivo));
    // T3C r1 (punto 3): N4, como el 409 del servidor; en el Hub cuenta también scConCot (la fila puede no traer sus documentos).
    if (scConCot?.has(sc?.id) || pasosParaCancelarSolicitud(sc).length > 0) return bloqueado(TEXTO.NO_CANCELAR, enlace);
    return accion('cancelar');
  }
  if (estado === 'CANCELADA') return bloqueado(TEXTO.PAPELERA);
  if (destino === 'Acción Tomada') return bloqueado(TEXTO.SC_ACCION_TOMADA);
  if (destino === 'En Gestión') {
    if (estado === 'BORRADOR') return bloqueado(TEXTO.ASIGNA_ASESOR, enlace);
    if (estado === 'ASIGNADA') return tieneProductos(sc?.productos) ? accion('enviar') : bloqueado(TEXTO.AGREGA_PRODUCTOS, enlace);
    if (estado === 'PENDIENTE_CONFIRMACION') return bloqueado(TEXTO.YA_PENDIENTE);
    if (SC_CONFIRMADAS.includes(estado)) return bloqueado(TEXTO.YA_CONFIRMO);
    return bloqueado(TEXTO.ABRELA_ENVIAR, enlace);
  }
  // → No resuelto: reiniciar (con la confirmación de U15, confirmacionReiniciarSolicitud).
  if (scConCot?.has(sc?.id)) return bloqueado(TEXTO.COT_ACTIVA);
  if (!ESTADOS_SC_CON_CONFIRMACION.includes(estado)) return bloqueado(TEXTO.SOLO_REINICIABLE);
  if (!puedeReiniciar(sc, documentosDeSC(sc))) return bloqueado(TEXTO.NO_REINICIAR, enlace);
  return accion('reiniciar');
}

function reglaHubCOT(cot, destino) {
  const estado = cot?.estado;
  const enlace = enlaceAbrir('COT', cot?.id, RUTA_HUB_VENTAS);
  const porPedido = bloqueoPorPedido(cot, RUTA_HUB_VENTAS);
  if (porPedido) return porPedido;
  if (destino === 'Cancelado') {
    const motivo = motivoNoCancelable({ ...cot, tipo: 'COT' });
    return motivo ? bloqueado(oracion(motivo)) : accion('cancelar');
  }
  if (destino === 'Acción Tomada') return bloqueado(TEXTO.COT_SOLO_CLIENTE);
  if (destino === 'En Gestión') {
    if (estado === 'BORRADOR' || estado === 'VENCIDA' || estado === 'ENVIADA') return bloqueoAlEnviarCot(cot, enlace) ?? accion('enviar');
    if (estado === 'PENDIENTE_CONFIRMACION') return bloqueado(TEXTO.YA_PENDIENTE);
    if (estado === 'CONFIRMADA') return bloqueado(TEXTO.YA_CONFIRMO);
    if (estado === 'RECHAZADA') return bloqueado(TEXTO.RETOMALA_HUB);
    return bloqueado(TEXTO.ABRELA_ENVIAR, enlace);
  }
  // → No resuelto: retomar a Borrador; sacarla de «Esperando» o de «Confirmada» pide la razón (C15(a)).
  if (estado === 'PENDIENTE_CONFIRMACION' || estado === 'CONFIRMADA') return bloqueado(TEXTO.RE_COTIZAR, enlace);
  if (estado === 'RECHAZADA' || estado === 'ENVIADA' || estado === 'VENCIDA') return cambio('BORRADOR');
  if (estado === 'BORRADOR') return ninguno();
  return bloqueado(TEXTO.ABRELA_CAMBIAR, enlace);
}

function reglaHubVEN(ven, destino) {
  if (destino === 'Cancelado') {
    const motivo = motivoNoCancelable({ ...ven, tipo: 'VEN' });
    return motivo ? bloqueado(oracion(motivo)) : accion('cancelar');
  }
  return cambioDePedido(ven?.estado, DESTINO_HUB_VEN[destino]);
}

/**
 * Qué pasa al soltar una fila del Hub (SC, COT o VEN/PVEN, con su `tipo`) de la columna `origen` en `destino` (claves
 * de COLUMNAS_HUB), con la matriz de «comportamiento» de KANBAN-hub-ventas y C15(a):
 *  - la misma columna: ninguno.
 *  - SC: → Cancelado, 'cancelar' (o el motivo de N3; r1: con una cotización activa de scConCot o un documento vigente
 *    en la fila, bloqueado «No se puede cancelar: …»); → En gestión, 'enviar' si está Asignada y con productos (si no,
 *    el bloqueo de cada caso, con el enlace a la solicitud cuando hay que hacer algo en ella); → No resuelto,
 *    'reiniciar' si está Pendiente por confirmación o Confirmada y puedeReiniciar (bloqueado con una cotización activa
 *    de scConCot o con los documentos de la fila, D22); → Acción tomada, siempre bloqueado; cancelada: la Papelera.
 *  - COT: con un pedido vigente en la fila, todo bloqueado; → Cancelado, 'cancelar' (N3: queda Rechazada); → En
 *    gestión, 'enviar' desde Borrador o Enviada con productos y total (r1: una Vencida o una sin precios queda
 *    bloqueada, como en el servidor); → No resuelto, cambio a BORRADOR desde Rechazada, Enviada o
 *    Vencida, y bloqueado «Ábrela para re-cotizar; te pedirá la razón.» desde Pendiente o Confirmada (C15(a)); →
 *    Acción tomada, bloqueado (lo confirma el cliente).
 *  - VEN: No resuelto = PENDIENTE_COMPRA, En gestión = EN_PROCESO y Acción tomada = LISTO_ENTREGA, si transicionesPedido
 *    lo permite (si no, el motivo de N2); → Cancelado, 'cancelar' o el motivo de N3.
 * La acción 'enviar' la resuelve la pantalla con su envío (abrirEnvioHub, D11). scConCot = ids de SC con documentos
 * activos (el mismo de columnaHub).
 * @param {any} fila
 * @param {string} origen
 * @param {string} destino
 * @param {{scConCot?: Set<number>}} [opciones]
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarHub(fila, origen, destino, { scConCot } = {}) {
  exigirDestino(CLAVES_HUB, destino, 'del Hub');
  const tipo = tipoDocumento(fila?.tipo);
  if (origen === destino) return ninguno();
  if (tipo === 'SC') return reglaHubSC(fila, destino, scConCot);
  if (tipo === 'COT') return reglaHubCOT(fila, destino);
  return reglaHubVEN(fila, destino);
}

// ─── chips y tarjeta ────────────────────────────────────────────────────────────

/**
 * B4 T7 r1 (m7c): los días enteros de un conteo del servidor (dias_sin_mov): un número, o un texto con un número, finito
 * y no negativo, hacia abajo. Si no, null. La única lectura de los días de textoAtrasado y chipsResolucionHub.
 * @param {unknown} valor
 * @returns {number | null}
 */
function diasEnteros(valor) {
  const n = typeof valor === 'number' || (typeof valor === 'string' && valor.trim() !== '') ? Number(valor) : NaN;
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** 'Atrasado 4 días', 'Atrasado 1 día'; sin un número válido, 'Atrasado'. */
function textoAtrasado(dias) {
  const d = diasEnteros(dias);
  if (d === null) return 'Atrasado';
  return `Atrasado ${d} ${d === 1 ? 'día' : 'días'}`;
}

/**
 * Los chips de una fila de Ventas, de la fila del servidor (RP18, C14), en este orden y como máximo 3:
 *  - 'Atrasado N días' (rose) si fila.resolucion === 'ATRASADO', con N = fila.dias_sin_mov;
 *  - 'Sin respuesta al recordatorio' (amber; la etiqueta de ACCIONES_BLOQUE3.SEGUIMIENTO_AGOTADO) si
 *    fila.seguimiento_estado === 'AGOTADO';
 *  - en una SC o una COT, el de cambios del cliente de etiquetaChipCambios ('Cambios pedidos' en amber o 'Ya no la
 *    necesita' en rose; D4: no «Pidió cambios»), con la vigencia de cambios-cliente.js.
 * No recalcula el atraso (R8) y no hay chip «Soporte». `tipo` es 'SC', 'COT', 'VEN' o 'PVEN'; sin él, fila.tipo.
 * @param {any} fila
 * @param {string} [tipo]
 * @returns {ChipTarjeta[]}
 */
export function chipsDocumentoVentas(fila, tipo = fila?.tipo) {
  const { atraso, recordatorio, cambios } = chipsDeLaFila(fila, tipo);
  return /** @type {ChipTarjeta[]} */ ([atraso, recordatorio, cambios].filter(Boolean)).slice(0, MAX_CHIPS);
}

/**
 * Los tres chips de la fila por separado (null si no va): los arma chipsDocumentoVentas en su orden y, B4 T9 r2 (p3),
 * tarjetaCotizacion en el suyo (el de los cambios del cliente antes que «Sin precio», para que el tope no lo saque).
 * @param {any} fila
 * @param {string} [tipo]
 * @returns {{atraso: ChipTarjeta | null, recordatorio: ChipTarjeta | null, cambios: ChipTarjeta | null}}
 */
function chipsDeLaFila(fila, tipo) {
  const atraso = fila?.resolucion === 'ATRASADO' ? { texto: textoAtrasado(fila?.dias_sin_mov), tono: /** @type {TonoChip} */ ('rose') } : null;
  const recordatorio = fila?.seguimiento_estado === 'AGOTADO'
    ? { texto: ACCIONES_BLOQUE3.SEGUIMIENTO_AGOTADO.etiqueta, tono: /** @type {TonoChip} */ ('amber') } : null;
  /** @type {ChipTarjeta | null} */
  let cambios = null;
  if (tipo === 'SC' || tipo === 'COT') {
    const etiqueta = etiquetaChipCambios(fila, tipo);
    if (etiqueta) cambios = { texto: etiqueta, tono: avisoCambiosCliente(fila, tipo)?.tono === 'rosa' ? 'rose' : 'amber' };
  }
  return { atraso, recordatorio, cambios };
}

/** Un monto del API en pesos enteros, o null si no viene un número. */
function montoDe(v) {
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() !== '')) return null;
  const n = Number(v);
  return Number.isFinite(n) ? redondearPeso(n) : null;
}

/**
 * La insignia de estado de una tarjeta de Ventas (T3C r1: exportada para las tarjetas de T8, T9 y T10): {label, clases,
 * colores} de estados-solicitud.js (SC: los hex en `colores`), estados-cotizacion.js o estados-pedido.js (COT y pedido:
 * las clases de Tailwind en `clases`). 'PVEN' es el mismo tipo que 'VEN'; otro tipo lanza Error. Un código desconocido
 * sale humanizado y en gris, como en las tablas de estados.
 * @param {'SC' | 'COT' | 'VEN' | 'PVEN'} tipo
 * @param {unknown} estado
 * @returns {EstadoTarjeta}
 */
export function estadoDeTarjeta(tipo, estado) {
  const t = tipoDocumento(tipo);
  if (t === 'SC') {
    const info = infoEstadoSolicitud(estado);
    return { label: info.label, clases: null, colores: { color: info.color, bg: info.bg, border: info.border } };
  }
  const info = t === 'COT' ? infoEstadoCotizacion(estado) : infoEstadoPedido(estado);
  return { label: info.label, clases: info.clases, colores: null };
}

/**
 * Las props de TarjetaKanban (T4B) para una fila de GET /ventas/hub/documentos (R6). Lee la fila: no recibe
 * {atrasado, dias, seguimiento} ni un mapa de seguimiento (C14).
 *  - numero; tipo ('SC', 'COT' o 'PVEN': VEN y PVEN dan la misma tarjeta, RP74);
 *  - titulo = el cliente (customer_name, o 'Cliente General'); subtitulo = el asesor (H4: advisor_name, cotizador o
 *    asesor.nombre; 'Sin asignar');
 *  - monto = total_cop en pesos enteros (null en una SC);
 *  - estado = {label, clases, colores} de estados-solicitud, estados-cotizacion o estados-pedido;
 *  - tiempo = la antigüedad de R5 ('hoy', 'hace N días') con dias_creado del servidor, o desde created_at;
 *  - atrasada = fila.resolucion === 'ATRASADO'; chips = chipsDocumentoVentas;
 *  - accionPrincipal = accionSiguienteDocumento de hub-ventas.js (D25: {texto, href, tono}; su href puede ser null, como
 *    «Esperando al cliente»), con return_to de `returnTo` (cruce C5: por defecto el Hub; T8 manda la ruta de su lista).
 * Un tipo que no es SC, COT, VEN o PVEN lanza Error.
 * @param {any} fila
 * @param {{ahora?: number, returnTo?: string}} [opciones]  `ahora`: el instante para la antigüedad cuando no viene
 *   dias_creado (pruebas)
 * @returns {TarjetaVentas}
 */
export function tarjetaHub(fila, { ahora = Date.now(), returnTo } = {}) {
  const tipo = tipoDocumento(fila?.tipo);
  const cliente = String(fila?.customer_name || fila?.cliente?.nombre || '').trim();
  const asesor = String(fila?.advisor_name || fila?.cotizador || fila?.asesor?.nombre || '').trim();
  const dias = typeof fila?.dias_creado === 'number' && Number.isFinite(fila.dias_creado)
    ? fila.dias_creado : diasDesde(fila?.created_at, ahora);
  return {
    numero: String(fila?.numero ?? fila?.id ?? ''),
    tipo: siglaDeTipo(tipo),
    titulo: cliente || 'Cliente General',
    subtitulo: asesor || 'Sin asignar',
    monto: tipo === 'SC' ? null : montoDe(fila?.total_cop),
    estado: estadoDeTarjeta(tipo, fila?.estado),
    tiempo: textoAntiguedad(dias),
    atrasada: fila?.resolucion === 'ATRASADO',
    chips: chipsDocumentoVentas(fila, tipo),
    accionPrincipal: accionSiguienteDocumento(fila, { returnTo }),
  };
}

/**
 * RP17: la confirmación de «Reiniciar solicitud» para confirmar() de useAvisos (T7, T8 y T11): vuelve a Asignada si
 * tiene asesor (advisor_user_id) y a Nueva si no. Sirve con la fila de la lista y con el documento del detalle.
 * @param {any} sc
 * @returns {ConfirmacionReiniciar}
 */
export function confirmacionReiniciarSolicitud(sc) {
  const destino = infoEstadoSolicitud(sc?.advisor_user_id ? 'ASIGNADA' : 'BORRADOR').label;
  return {
    titulo: 'Reiniciar solicitud',
    mensaje: `La solicitud vuelve a ${destino}: se anula el enlace que se le envió al cliente y su confirmación, y habrá que enviársela de nuevo.`,
    textoConfirmar: 'Reiniciar solicitud',
    peligro: true,
  };
}

// ─── B4 T7: lo que comparten la tabla y el tablero del Hub ──────────────────────

/** El grupo de cada tipo en el filtro de estados del Hub (TABLA-hub-ventas punto 5). */
const GRUPO_ESTADOS_HUB = congelar([
  // SC: los 4 pasos (Nueva, Asignada, Pendiente por confirmación y Confirmada) y Cancelada; Soporte no entra al Hub (R8).
  { tipo: 'SC', nombre: 'Solicitud', estados: [...PASOS_SC.map((p) => p.clave), 'CANCELADA'], info: infoEstadoSolicitud },
  { tipo: 'COT', nombre: 'Cotización', estados: Object.keys(ESTADOS_COTIZACION), info: infoEstadoCotizacion },
  // Pedido: los operativos y los cerrados (los de las pestañas de la lista de pedidos, sin los heredados de la tienda).
  { tipo: 'VEN', nombre: 'Pedido', estados: [...ESTADOS_PEDIDO_OPERATIVOS, ...ESTADOS_PEDIDO_CERRADOS], info: infoEstadoPedido },
]);

/** Las opciones de un grupo: {valor: 'TIPO:ESTADO', etiqueta: 'Grupo · Etiqueta'}. */
const opcionesDeGrupo = (g) => g.estados.map((e) => congelar({ valor: `${g.tipo}:${e}`, etiqueta: `${g.nombre} · ${g.info(e).label}` }));

const OPCIONES_HUB_POR_VISTA = congelar({
  sc: congelar(opcionesDeGrupo(GRUPO_ESTADOS_HUB[0])),
  cot: congelar(opcionesDeGrupo(GRUPO_ESTADOS_HUB[1])),
  ven: congelar(opcionesDeGrupo(GRUPO_ESTADOS_HUB[2])),
});
const OPCIONES_HUB_TODAS = congelar([...OPCIONES_HUB_POR_VISTA.sc, ...OPCIONES_HUB_POR_VISTA.cot, ...OPCIONES_HUB_POR_VISTA.ven]);

/**
 * Las opciones del filtro de estados del Hub (FiltroEstados de BarraTabla, `opcionesEstados`), agrupadas por tipo: el
 * valor es el par TIPO:ESTADO de `estados=` de GET /ventas/hub/documentos ('SC:ASIGNADA', 'VEN:EN_PROCESO') y la
 * etiqueta lleva el grupo delante ('Solicitud · Asignada', 'Cotización · Borrador', 'Pedido · En proceso'), con el
 * nombre de la tabla única de cada tipo (estados-solicitud.js, estados-cotizacion.js y estados-pedido.js; RP4). Las
 * pestañas 'sc', 'cot' y 'ven' traen solo su grupo; las demás (todos, no_resueltos, acciones_tomadas) y una vista
 * desconocida, los tres (20 en total: caben en MAXIMO_ESTADOS). Inmutables y la misma referencia en cada llamada.
 * @param {string | null | undefined} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosHub(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_HUB_POR_VISTA, vista) ? OPCIONES_HUB_POR_VISTA[vista] : OPCIONES_HUB_TODAS;
}

/** El chip de cada resolución en la columna Resolución (los nombres de los separadores, RP67: «Sin resolver»). */
const CHIP_RESOLUCION = congelar({
  NO_RESUELTO: { texto: ETIQUETA_GRUPO.NO_RESUELTO, tono: 'amber' },
  ACCION_TOMADA: { texto: ETIQUETA_GRUPO.ACCION_TOMADA, tono: 'emerald' },
  CERRADO: { texto: 'Cerrado', tono: 'slate' },
});

/**
 * La columna Resolución de la tabla del Hub (R6, TABLA-hub-ventas punto 6; RP18, D4), de la fila del servidor (no
 * recalcula el atraso, R8):
 *  - principal: el chip de `fila.resolucion`, corto para la columna de 104 px: 'Atrasado +N d' (rose; N =
 *    fila.dias_sin_mov, con el detalle 'Atrasado: N días sin movimiento' en `titulo`; sin un número, 'Atrasado'),
 *    'Sin resolver' (amber), 'Acción tomada' (emerald) o 'Cerrado' (slate); sin resolución, null.
 *  - extras: debajo, los chips de chipsDocumentoVentas sin el de atraso (ya es el principal): «Sin respuesta al
 *    recordatorio» y el de los cambios del cliente («Cambios pedidos» o «Ya no la necesita»).
 * @param {any} fila
 * @returns {{principal: {texto: string, tono: string, titulo: string} | null, extras: ChipTarjeta[]}}
 */
export function chipsResolucionHub(fila) {
  const resolucion = fila?.resolucion;
  const chips = fila && typeof fila === 'object' ? chipsDocumentoVentas(fila) : [];
  if (resolucion === 'ATRASADO') {
    const dias = diasEnteros(fila?.dias_sin_mov);
    const principal = dias === null
      ? { texto: 'Atrasado', tono: 'rose', titulo: 'Atrasado' }
      : { texto: `Atrasado +${dias} d`, tono: 'rose', titulo: `Atrasado: ${dias} ${dias === 1 ? 'día' : 'días'} sin movimiento` };
    return { principal, extras: chips.slice(1) };
  }
  const chip = typeof resolucion === 'string' && tiene(CHIP_RESOLUCION, resolucion) ? CHIP_RESOLUCION[resolucion] : null;
  return { principal: chip ? { ...chip, titulo: chip.texto } : null, extras: chips };
}

// ─── Pedidos de venta ───────────────────────────────────────────────────────────

/** La clave de cada grupo de grupoPedido: la `vista` de GET /ventas/pedidos (VISTA_DE_GRUPO del backend). */
const CLAVE_GRUPO_PEDIDO = congelar({
  'Pend. Compra': 'pend_compra', 'En Proceso': 'en_proceso', 'Listo Entrega': 'listo_entrega', Entregado: 'entregado',
  Facturado: 'facturado', Cancelado: 'cancelado',
});

/** El estado al que se mueve un pedido soltado en cada columna (Entregado se hace en Entregas). */
const DESTINO_COLUMNA_PEDIDO = congelar({
  pend_compra: 'PENDIENTE_COMPRA', en_proceso: 'EN_PROCESO', listo_entrega: 'LISTO_ENTREGA', entregado: null,
  facturado: 'FACTURADO', cancelado: 'CANCELADO',
});

const GRUPOS_PEDIDO = congelar([
  ...PASOS_PEDIDO.map((p) => ({ grupo: p.label, estadoClave: p.key })),
  { grupo: 'Cancelado', estadoClave: 'CANCELADO' },
]);

/**
 * El tablero de Pedidos de venta (y de los pedidos web): una columna por grupo de grupoPedido, en el orden de
 * PASOS_PEDIDO, más Cancelado. La clave es la vista de GET /ventas/pedidos; el título y el tono, los del estado clave
 * en ESTADOS_PEDIDO; `estados`, todos los códigos de ese grupo (PENDIENTE_PAGO va con Pendiente de compra, EN_TRANSITO
 * con En proceso y DEVUELTO_TOTAL con Cancelado); `estadoDestino`, el estado al que se mueve un pedido soltado ahí.
 * Facturado y Cancelado salen plegadas. Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaPedido>>}
 */
export const COLUMNAS_PEDIDO = /** @type {any} */ (definirColumnas(GRUPOS_PEDIDO.map(({ grupo, estadoClave }) => {
  const clave = CLAVE_GRUPO_PEDIDO[grupo];
  const info = ESTADOS_PEDIDO[estadoClave];
  return {
    clave,
    titulo: info.label,
    tono: familia(info.clases.bg),
    estados: Object.keys(ESTADOS_PEDIDO).filter((e) => grupoPedido(e) === grupo),
    cerrada: clave === 'facturado' || clave === 'cancelado',
    estadoDestino: DESTINO_COLUMNA_PEDIDO[clave],
  };
})));

const CLAVES_PEDIDO = congelar(COLUMNAS_PEDIDO.map((c) => c.clave));

/**
 * Qué pasa al soltar un pedido de la columna `origen` en `destino` (claves de COLUMNAS_PEDIDO):
 *  - → Entregado: bloqueado 'Se despacha desde Entregas: …', con el enlace 'Ir a Entregas' (si el pedido podría pasar a
 *    Entregado; si no, el motivo de N2);
 *  - → Cancelado: acción 'cancelar' (la pantalla pide el motivo), si transicionesPedido lo permite;
 *  - → Facturado: acción 'facturar' (la pantalla confirma), solo desde ENTREGADO;
 *  - → una de las tres primeras: cambio al estado de la columna, si transicionesPedido lo permite;
 *  - en cualquier otro caso, bloqueado con motivoTransicionPedido.
 * @param {any} pedido
 * @param {string} origen
 * @param {string} destino
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarPedido(pedido, origen, destino) {
  exigirDestino(CLAVES_PEDIDO, destino, 'de pedidos');
  if (origen === destino) return ninguno();
  const estado = pedido?.estado;
  if (destino === 'entregado') {
    return transicionesPedido(estado).includes('ENTREGADO')
      ? bloqueado(TEXTO.ENTREGAS, ENLACE_ENTREGAS)
      : bloqueado(motivoTransicionPedido(estado, 'ENTREGADO') ?? TEXTO.ABRELA_CAMBIAR);
  }
  if (destino === 'cancelado') {
    return transicionesPedido(estado).includes('CANCELADO')
      ? accion('cancelar') : bloqueado(motivoTransicionPedido(estado, 'CANCELADO') ?? TEXTO.ABRELA_CAMBIAR);
  }
  if (destino === 'facturado') {
    return estado === 'ENTREGADO' ? accion('facturar') : bloqueado(motivoTransicionPedido(estado, 'FACTURADO') ?? TEXTO.ABRELA_CAMBIAR);
  }
  return cambioDePedido(estado, /** @type {string} */ (DESTINO_COLUMNA_PEDIDO[destino]));
}

// ─── Cotizaciones ───────────────────────────────────────────────────────────────

/** Una columna de Cotizaciones con el título de su estado (o el que se le da) y el tono de su pastilla. */
function columnaCot(clave, estados, titulo = infoEstadoCotizacion(estados[0]).label, cerrada = false) {
  return { clave, titulo, tono: familia(infoEstadoCotizacion(estados[0]).clases.bg), estados, cerrada };
}

/**
 * El tablero de Cotizaciones: Borrador · Esperando al cliente (PENDIENTE_CONFIRMACION y la antigua ENVIADA) ·
 * Confirmada · Vencida · Rechazada (plegada). Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaCot>>}
 */
export const COLUMNAS_COT = /** @type {any} */ (definirColumnas([
  columnaCot('borrador', ['BORRADOR']),
  columnaCot('esperando', ['PENDIENTE_CONFIRMACION', 'ENVIADA'], 'Esperando al cliente'),
  columnaCot('confirmada', ['CONFIRMADA']),
  columnaCot('vencida', ['VENCIDA']),
  columnaCot('rechazada', ['RECHAZADA'], undefined, true),
]));

const CLAVES_COT = congelar(COLUMNAS_COT.map((c) => c.clave));

/**
 * Qué pasa al soltar una cotización de la columna `origen` en `destino` (claves de COLUMNAS_COT):
 *  - con un pedido vigente (pedidoVigente de listas-ventas.js): todo bloqueado 'Tiene el pedido PVEN-… activo: …';
 *  - → Confirmada: bloqueado (la confirma el cliente con su enlace);
 *  - → Esperando al cliente: desde Borrador con productos y total, la acción 'enviar' solo con {puedeEnviar: true}; sin
 *    ella, bloqueado 'Ábrela para enviar.' con el enlace (RP16, D11, D22). Desde Vencida o sin precios, bloqueado con o
 *    sin puedeEnviar (r1: el servidor no la envía). Desde Rechazada o Confirmada, bloqueado;
 *  - → Borrador o Vencida desde Pendiente o Confirmada: bloqueado «Ábrela para re-cotizar; te pedirá la razón.»
 *    (C15(a): reemplaza la acción 'confirmar');
 *  - → Borrador: cambio desde Enviada, Vencida o Rechazada; → Vencida: cambio desde Borrador o Enviada;
 *  - → Rechazada: acción 'rechazar' (la pantalla pide el motivo).
 * Los enlaces llevan ?return_to= de `returnTo` (por defecto la lista de Cotizaciones).
 * @param {any} cot
 * @param {string} origen
 * @param {string} destino
 * @param {OpcionesSoltarLista} [opciones]
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarCotizacion(cot, origen, destino, { puedeEnviar = false, returnTo = RUTA_LISTA_COTIZACIONES } = {}) {
  exigirDestino(CLAVES_COT, destino, 'de cotizaciones');
  if (origen === destino) return ninguno();
  const estado = cot?.estado;
  const enlace = enlaceAbrir('COT', cot?.id, returnTo);
  const porPedido = bloqueoPorPedido(cot, returnTo);
  if (porPedido) return porPedido;
  if (destino === 'confirmada') return bloqueado(TEXTO.COT_SOLO_CLIENTE);
  if (destino === 'rechazada') return accion('rechazar');
  if (destino === 'esperando') {
    // La antigua ENVIADA ya está en esta columna; si llegara de otra, pasa por las mismas guardas que en el Hub.
    if (estado === 'BORRADOR' || estado === 'VENCIDA' || estado === 'ENVIADA') {
      return bloqueoAlEnviarCot(cot, enlace) ?? (puedeEnviar ? accion('enviar') : bloqueado(TEXTO.ABRELA_ENVIAR, enlace));
    }
    if (estado === 'RECHAZADA') return bloqueado(TEXTO.PASALA_BORRADOR);
    if (estado === 'CONFIRMADA') return bloqueado(TEXTO.YA_CONFIRMO);
    if (estado === 'PENDIENTE_CONFIRMACION') return ninguno();
    return bloqueado(TEXTO.ABRELA_ENVIAR, enlace);
  }
  // → Borrador o Vencida
  if (estado === 'PENDIENTE_CONFIRMACION' || estado === 'CONFIRMADA') return bloqueado(TEXTO.RE_COTIZAR, enlace);
  if (destino === 'borrador') {
    if (estado === 'ENVIADA' || estado === 'VENCIDA' || estado === 'RECHAZADA') return cambio('BORRADOR');
    if (estado === 'BORRADOR') return ninguno();
  } else {
    if (estado === 'BORRADOR' || estado === 'ENVIADA') return cambio('VENCIDA');
    if (estado === 'RECHAZADA') return bloqueado(TEXTO.PASALA_BORRADOR);
    if (estado === 'VENCIDA') return ninguno();
  }
  return bloqueado(TEXTO.ABRELA_CAMBIAR, enlace);
}

// ─── Solicitudes ────────────────────────────────────────────────────────────────

/** La clave de cada paso de PASOS_SC en el tablero. */
const CLAVE_PASO_SC = congelar({ BORRADOR: 'nueva', ASIGNADA: 'asignada', PENDIENTE_CONFIRMACION: 'pendiente', CONFIRMADA: 'confirmada' });
/** El tono de cada columna: la familia de Tailwind de los hex de ESTADOS_SC (#64748b slate, #0e7490 cyan, …). */
const TONO_SC = congelar({ BORRADOR: 'slate', ASIGNADA: 'cyan', PENDIENTE_CONFIRMACION: 'amber', CONFIRMADA: 'emerald', CANCELADA: 'red' });

/**
 * El tablero de Solicitudes, con PASOS_SC de estados-solicitud.js: Nueva (BORRADOR) · Asignada · Pendiente por
 * confirmación · Confirmada (CONFIRMADA y los heredados COTIZADA, EN_ESPERA_CONFIRMACION, RECHAZADA y VENCIDA) ·
 * Cancelada (plegada). 'N/A_SOPORTE' queda fuera: los tickets de Soporte se ven en su pestaña. Cada paso lleva la
 * `ayuda` de PASOS_SC (qué falta para avanzar). Inmutable.
 * @type {ReadonlyArray<Readonly<ColumnaSc>>}
 */
export const COLUMNAS_SC = /** @type {any} */ (definirColumnas([
  ...PASOS_SC.map((p) => ({
    clave: CLAVE_PASO_SC[p.clave],
    titulo: p.label,
    tono: TONO_SC[p.clave],
    estados: p.clave === 'CONFIRMADA' ? [...SC_CONFIRMADAS] : [p.clave],
    ayuda: p.ayuda,
  })),
  { clave: 'cancelada', titulo: ESTADOS_SC.CANCELADA.label, tono: TONO_SC.CANCELADA, estados: ['CANCELADA'], cerrada: true },
]));

const CLAVES_SC = congelar(COLUMNAS_SC.map((c) => c.clave));

/**
 * Qué pasa al soltar una solicitud de la columna `origen` en `destino` (claves de COLUMNAS_SC). Las solicitudes avanzan
 * solas (U15): el tablero solo deja enviar, reiniciar y cancelar.
 *  - desde Cancelada: bloqueado 'Una solicitud cancelada se restaura desde la Papelera.';
 *  - → Confirmada: bloqueado (la confirma el cliente con su enlace);
 *  - → Pendiente por confirmación: desde Asignada con productos, la acción 'enviar' solo con {puedeEnviar: true}; sin
 *    ella, bloqueado 'Ábrela para enviar.' con el enlace (RP16, D11, D22). Desde Nueva, sin productos o desde
 *    Confirmada, bloqueado;
 *  - → Nueva o Asignada desde Pendiente o Confirmada: acción 'reiniciar' (la pantalla confirma con
 *    confirmacionReiniciarSolicitud) solo si puedeReiniciar con las cotizaciones y los pedidos_venta de la fila (si no,
 *    D22), y solo en la columna donde va a quedar (Asignada con asesor, Nueva sin él);
 *  - entre Nueva y Asignada: bloqueado (el asesor se pone o se quita en la solicitud);
 *  - → Cancelada: acción 'cancelar' (la pantalla pide el motivo); con una cotización activa o un pedido vigente en la fila
 *    (pasosParaCancelarSolicitud, N4), bloqueado 'No se puede cancelar: tiene una cotización o un pedido vigente.' con
 *    el enlace (T3C r1).
 * Los enlaces llevan ?return_to= de `returnTo` (por defecto la lista de Solicitudes).
 * @param {any} sc
 * @param {string} origen
 * @param {string} destino
 * @param {OpcionesSoltarLista} [opciones]
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarSC(sc, origen, destino, { puedeEnviar = false, returnTo = RUTA_LISTA_SOLICITUDES } = {}) {
  exigirDestino(CLAVES_SC, destino, 'de solicitudes');
  if (origen === destino) return ninguno();
  const estado = sc?.estado;
  const enlace = enlaceAbrir('SC', sc?.id, returnTo);
  if (estado === 'CANCELADA') return bloqueado(TEXTO.PAPELERA);
  if (esSoporte(sc)) return bloqueado(oracion(motivoNoCancelable({ ...sc, tipo: 'SC' })));
  if (destino === 'confirmada') return bloqueado(TEXTO.SC_SOLO_CLIENTE);
  if (destino === 'cancelada') {
    // T3C r1 (punto 3): N4, como el 409 del servidor.
    return pasosParaCancelarSolicitud(sc).length > 0 ? bloqueado(TEXTO.NO_CANCELAR, enlace) : accion('cancelar');
  }
  if (destino === 'pendiente') {
    if (estado === 'BORRADOR') return bloqueado(TEXTO.ASIGNA_ASESOR, enlace);
    if (estado === 'ASIGNADA') {
      if (!tieneProductos(sc?.productos)) return bloqueado(TEXTO.AGREGA_PRODUCTOS, enlace);
      return puedeEnviar ? accion('enviar') : bloqueado(TEXTO.ABRELA_ENVIAR, enlace);
    }
    if (estado === 'PENDIENTE_CONFIRMACION') return ninguno();
    if (SC_CONFIRMADAS.includes(estado)) return bloqueado(TEXTO.YA_CONFIRMO);
    return bloqueado(TEXTO.ABRELA_ENVIAR, enlace);
  }
  // → Nueva o Asignada
  if (ESTADOS_SC_CON_CONFIRMACION.includes(estado)) {
    if (!puedeReiniciar(sc, documentosDeSC(sc))) return bloqueado(TEXTO.NO_REINICIAR, enlace);
    const queda = sc?.advisor_user_id ? 'asignada' : 'nueva';
    if (destino === queda) return accion('reiniciar');
    return bloqueado(queda === 'asignada' ? TEXTO.QUEDA_ASIGNADA : TEXTO.QUEDA_NUEVA);
  }
  if (destino === 'nueva' && estado === 'ASIGNADA') return bloqueado(TEXTO.QUITA_ASESOR, enlace);
  if (destino === 'asignada' && estado === 'BORRADOR') return bloqueado(TEXTO.ASIGNA_DESDE_SC, enlace);
  return bloqueado(TEXTO.SOLO_REINICIABLE);
}

// ─── B4 T8: lo que comparten la tabla y el tablero de la lista de Solicitudes ───

/** Una opción del filtro de estados con la etiqueta única de la SC (estados-solicitud.js). */
const opcionSC = (estado) => congelar({ valor: estado, etiqueta: infoEstadoSolicitud(estado).label });

const SIN_OPCIONES = congelar([]);

/** Los estados de cada pestaña (vista de GET /ventas/solicitudes) que el filtro ofrece. */
const OPCIONES_SC_POR_VISTA = congelar({
  activas: congelar(['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION'].map(opcionSC)),
  confirmadas: congelar([opcionSC('CONFIRMADA')]),
  canceladas: congelar([opcionSC('CANCELADA')]),
});

/**
 * B4 T8 (TABLA-listas-ventas punto 5, H15): las opciones del filtro de estados (FiltroEstados de BarraTabla) de la
 * pestaña `vista` de Solicitudes, con los nombres de estados-solicitud.js: Activas → Nueva, Asignada y Pendiente por
 * confirmación; Confirmadas → Confirmada; Canceladas → Cancelada. Soporte, la Papelera y cualquier otra vista no tienen
 * filtro ([]). Los heredados (COTIZADA, …) no se ofrecen, como en el Hub (opcionesEstadosHub). Inmutables y la misma
 * referencia en cada llamada.
 * @param {string | null | undefined} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosSolicitudes(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_SC_POR_VISTA, vista) ? OPCIONES_SC_POR_VISTA[vista] : SIN_OPCIONES;
}

/**
 * B4 T8: las opciones del filtro de estados en el tablero de Solicitudes (vista=todas_sin_soporte): el estado de cada
 * columna de COLUMNAS_SC (Nueva, Asignada, Pendiente por confirmación, Confirmada y Cancelada), en su orden. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_SC = congelar(COLUMNAS_SC.map((c) => opcionSC(c.estados[0])));

/**
 * B4 T8 (KANBAN-ventas-listas punto 7, R5): los estados que pide una columna del tablero de una lista: los de la columna
 * cruzados con el filtro de estados de la pantalla (estado.estados), en el orden de la columna; sin filtro, los de la
 * columna. Sin ninguno en común, [] (la pantalla no pide esa columna). Una copia nueva.
 * r1 (m3): si el filtro trae el estado principal de la columna (el primero: la opción de esa columna en
 * OPCIONES_ESTADOS_TABLERO_SC), la columna entera, también los heredados (Confirmada junta CONFIRMADA y los estados
 * anteriores): marcar «Confirmada» en el filtro del tablero muestra lo mismo que la columna sin filtro.
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {ReadonlyArray<string> | null | undefined} filtro
 * @returns {string[]}
 */
export function estadosDeColumnaLista(columna, filtro) {
  const propios = Array.isArray(columna?.estados) ? columna.estados : [];
  if (!Array.isArray(filtro) || filtro.length === 0) return [...propios];
  if (propios.length > 0 && filtro.includes(propios[0])) return [...propios];
  return propios.filter((e) => filtro.includes(e));
}

/**
 * B4 T8 (R5): la vista con la que pide cada columna del tablero de Solicitudes (todas, sin Soporte), no la pestaña.
 * @type {'todas_sin_soporte'}
 */
export const VISTA_TABLERO_SC = 'todas_sin_soporte';

/**
 * B4 T8 r1 (m10; R5, R11, C4, D39): la consulta de una columna del tablero de Solicitudes en modo servidor (la query de
 * GET /ventas/solicitudes, con queryListado): vista=VISTA_TABLERO_SC, los estados de la columna cruzados con el filtro
 * de la pantalla (estadosDeColumnaLista), la búsqueda y el semáforo del MISMO estado, y el orden, el límite y el
 * desplazamiento de la columna (los da useTableroKanban: limit=0 en la plegada). Sin ningún estado en común, null (la
 * columna queda vacía sin pedir nada). T9 y T10 copian este patrón.
 * @param {import('./tabla.js').EstadoTabla} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {{orden: string | null, limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaSC(estado, columna, { orden, limit, offset }) {
  const estados = estadosDeColumnaLista(columna, estado?.estados);
  if (estados.length === 0) return null;
  return queryListado(estado, { vista: VISTA_TABLERO_SC, estados, orden, limit, offset });
}

/**
 * B4 T8 (KANBAN-ventas-listas punto 7; RP15, RP18, D4, D37 y el cruce C5): la tarjeta del tablero de Solicitudes. Es
 * la de tarjetaHub (número, cliente, estado, antigüedad, atraso, chipsDocumentoVentas y accionSiguienteDocumento) con el
 * return_to de la lista (`returnTo`, por defecto RUTA_LISTA_SOLICITUDES) y el subtítulo «asesor · tipo de solicitud»
 * (etiquetaTipoSolicitud; sin tipo, Cotización de producto, como la lista). La fila es una SC aunque no traiga `tipo`.
 * @param {any} fila
 * @param {{ahora?: number, returnTo?: string}} [opciones]
 * @returns {TarjetaVentas}
 */
export function tarjetaSolicitud(fila, { ahora, returnTo = RUTA_LISTA_SOLICITUDES } = {}) {
  const tarjeta = tarjetaHub({ ...fila, tipo: 'SC' }, { ahora, returnTo });
  const tipoSolicitud = etiquetaTipoSolicitud(fila?.tipo_solicitud || 'Cotizacion de Producto');
  return { ...tarjeta, subtitulo: `${tarjeta.subtitulo} · ${tipoSolicitud}` };
}

/**
 * B4 T8 (RP16): si se ofrece «Reiniciar» en el menú ⋯ de una fila de Solicitudes, con la misma regla del tablero
 * (reglaSoltarSC): puedeReiniciar con las cotizaciones activas y los pedidos_venta vigentes de la fila (T6B). Una fila
 * que no es un objeto: false.
 * @param {any} sc
 * @returns {boolean}
 */
export function puedeReiniciarSC(sc) {
  if (!sc || typeof sc !== 'object') return false;
  return puedeReiniciar(sc, documentosDeSC(sc));
}

// ─── B4 T9: lo que comparten la tabla y el tablero de la lista de Cotizaciones ──

/** Una opción del filtro de estados con la etiqueta única de la COT (estados-cotizacion.js, RP4). */
const opcionCOT = (estado) => congelar({ valor: estado, etiqueta: infoEstadoCotizacion(estado).label });

/**
 * Los estados de cada pestaña (vista de GET /ventas/cotizaciones) que el filtro ofrece: los que pueden caer en ella.
 * Activas (f_cot_activa) es todo menos Rechazada y las Confirmadas con pedido o con la confirmación del cliente vigente,
 * así que también trae la antigua ENVIADA y la CONFIRMADA con el pedido caído (COT-LISTA).
 */
const OPCIONES_COT_POR_VISTA = congelar({
  activas: congelar(['BORRADOR', 'ENVIADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA', 'VENCIDA'].map(opcionCOT)),
  confirmadas: congelar([opcionCOT('CONFIRMADA')]),
  rechazadas: congelar([opcionCOT('RECHAZADA')]),
});

/**
 * B4 T9 (TABLA-listas-ventas punto 6, H15): las opciones del filtro de estados (FiltroEstados de BarraTabla) de la
 * pestaña `vista` de Cotizaciones, con los nombres de estados-cotizacion.js: Activas → Borrador, Enviada al cliente,
 * Esperando confirmación del cliente, Confirmada (la del pedido caído) y Vencida; Confirmadas → Confirmada; Rechazadas →
 * Rechazada. Cualquier otra vista no tiene filtro ([]). Inmutables y la misma referencia en cada llamada.
 * @param {string | null | undefined} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosCotizaciones(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_COT_POR_VISTA, vista) ? OPCIONES_COT_POR_VISTA[vista] : SIN_OPCIONES;
}

/**
 * B4 T9: las opciones del filtro de estados en el tablero de Cotizaciones (vista=todas): el estado principal de cada
 * columna de COLUMNAS_COT con el título de la columna (Borrador, Esperando al cliente, Confirmada, Vencida y Rechazada),
 * en su orden. Con estadosDeColumnaLista, la de «Esperando al cliente» trae también la antigua ENVIADA. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_COT = congelar(COLUMNAS_COT.map((c) => congelar({ valor: c.estados[0], etiqueta: c.titulo })));

/**
 * B4 T9 (R5): la vista con la que pide cada columna del tablero de Cotizaciones (todas), no la pestaña.
 * @type {'todas'}
 */
export const VISTA_TABLERO_COT = 'todas';

/**
 * B4 T9 (R5, R11, C4, D39; el patrón de consultaColumnaSC): la consulta de una columna del tablero de Cotizaciones en
 * modo servidor (la query de GET /ventas/cotizaciones, con queryListado): vista=VISTA_TABLERO_COT, los estados de la
 * columna cruzados con el filtro de la pantalla (estadosDeColumnaLista), la búsqueda y el semáforo del MISMO estado, y el
 * orden, el límite y el desplazamiento de la columna (limit=0 en la plegada, lo da useTableroKanban). Sin ningún estado en
 * común, null (la columna queda vacía sin pedir nada).
 * @param {import('./tabla.js').EstadoTabla} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {{orden: string | null, limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaCOT(estado, columna, { orden, limit, offset }) {
  const estados = estadosDeColumnaLista(columna, estado?.estados);
  if (estados.length === 0) return null;
  return queryListado(estado, { vista: VISTA_TABLERO_COT, estados, orden, limit, offset });
}

/**
 * B4 T9 (KANBAN-ventas-listas punto 6; RP18, D4, D37 y el cruce C5): la tarjeta del tablero de Cotizaciones. Es la de
 * tarjetaHub (número, cliente, el cotizador, el total, el estado de estados-cotizacion.js, la antigüedad, el atraso,
 * chipsDocumentoVentas y accionSiguienteDocumento) con el return_to de la lista (`returnTo`, por defecto
 * RUTA_LISTA_COTIZACIONES). La fila es una COT aunque no traiga `tipo`.
 * r1 (I1; punto 6 de KANBAN-ventas-listas): los chips de la COT, con la MISMA regla de la tabla (listas-ventas.js). r2
 * (p3, corrige el orden de I1.2: el tope nunca saca la señal del cliente), en este orden y como mucho MAX_CHIPS:
 *  1. el del pedido («Pedido PVEN-…» emerald, o «Pedido … cancelado» rose: marcaPedidoCotizacion, COT-LISTA);
 *  2. el de los cambios del cliente de B3-T18 («Cambios pedidos» o «Ya no la necesita», el de chipsDocumentoVentas);
 *  3. «Sin precio» (chipSinPrecio, el mismo de la columna Total);
 *  4. el resto de chipsDocumentoVentas: el atraso y el recordatorio.
 * tarjetaHub no cambia: las tarjetas del Hub no los llevan.
 * @param {any} fila
 * @param {{ahora?: number, returnTo?: string}} [opciones]
 * @returns {TarjetaVentas}
 */
export function tarjetaCotizacion(fila, { ahora, returnTo = RUTA_LISTA_COTIZACIONES } = {}) {
  const cot = { ...fila, tipo: 'COT' };
  const tarjeta = tarjetaHub(cot, { ahora, returnTo });
  const { atraso, recordatorio, cambios } = chipsDeLaFila(cot, 'COT');
  const chips = /** @type {ChipTarjeta[]} */ ([marcaPedidoCotizacion(cot), cambios, chipSinPrecio(cot), atraso, recordatorio].filter(Boolean));
  return { ...tarjeta, chips: chips.slice(0, MAX_CHIPS) };
}
