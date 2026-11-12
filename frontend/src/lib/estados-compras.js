/**
 * Estados, etapas, columnas y reglas de los documentos de Compras (Bloque 4, T2; R9, C10): UN solo lugar en el frontend,
 * espejo de backend/app/core/estados_compras.py (T1C). JS plano, sin React ni DOM, para probarlo con node
 * (frontend/tests/test_estados_compras.mjs). Imports relativos con extensión: node y la prueba de paridad de Python no
 * resuelven '@/'. No se crean estados-pec.js ni grupos-estado.js (R27).
 *
 * Los NOMBRES salen de backend/app/core/textos_actividad.py (ETIQUETAS_ESTADO['PEC'] y ['ENINV']); las etapas, grupos,
 * transiciones y pasos, de estados_compras.py; las claves del estado del stock, de core/existencias.py. Si cambias algo,
 * cambia los dos lados: backend/tests/test_paridad_estados_compras.py comprueba que coincidan.
 *
 * Pedido de compra (PEC):
 *  - ESTADOS_PEC / infoEstadoPec: etiqueta y clases (las que hoy usa compras/pedidos); un desconocido, humanizado en gris.
 *  - ETAPAS_PEC / etapaPec: un estado desconocido (los heredados del módulo de logística, como CONFIRMADA) cuenta como
 *    'emitido'. GRUPOS_PEC: activos, vigentes y vencibles.
 *  - esPecVencido(p, hoy) (RP40): emitido o en tránsito con el día de entrega tal como se guarda (los 10 primeros
 *    caracteres, sin pasarlo a Colombia) anterior a hoy en Colombia; sin días de tolerancia.
 *  - TRANSICIONES_PEC_PATCH / ESTADOS_PEC_MANUALES / transicionesPec: lo que se cambia a mano (el servidor, update_pec de
 *    T12, es la autoridad). EFECTOS_CANCELAR_PEC (RP93): lo que pasa al cancelar.
 *  - COLUMNAS_PEC / columnaPec / reglaSoltarPec: el tablero del Hub de Compras y de Pedidos de compra (una columna por
 *    etapa; Recibido y Cancelado plegadas). pasoFlujoPec: el paso del diagrama del flujo de Compras.
 *  - B4 T14 (las listas del Hub y de Pedidos de compra): VISTAS_PEC (espejo de las vistas de T12), opcionesEstadosPec y
 *    OPCIONES_ESTADOS_TABLERO_PEC (el filtro de estados), consultaColumnaPec (el tablero en modo servidor, con
 *    estadosDeColumnaLista de kanban.js), vistaPuedeVencer, diaPec (el día de una fecha de negocio), tarjetaPec,
 *    repartirCancelacionPec, resumenCancelacionPec, cancelarPecsEnSerie y despuesDeCancelarPec (cancelar con motivo,
 *    T14 r1) y ordenPorFechaDeCompra, grupoMesPec y tituloMesPec (los separadores).
 * B4 T16B (Lista de compras y Traslados): VISTAS_LISTA, infoEstadoItemLista, opcionesEstadosLista, consultaLista y
 * consultaTableroLista (la tabla pagina en el servidor y el tablero es de modo cliente, hasta 200), esItemSeleccionable,
 * destinoItemLista, tarjetaItemLista y textoVacioLista; VISTAS_TRASLADO (los grupos de operación), conteosTraslado,
 * infoEstadoTraslado, opcionesEstadosTraslado, consultaTraslados, consultaTableroTraslados, numeroTraslado,
 * productosDeTraslado, textoFechaTraslado (la fecha REAL: un instante), nombreBodega, tarjetaTraslado y textoVacioTraslados.
 * Recepciones (ESTADOS_RECEPCION, GRUPOS_RECEPCION, grupoRecepcion, COLUMNAS_RECEPCION), ítems de la lista de compras
 * (ESTADOS_ITEM_LISTA, COLUMNAS_LISTA; DESCARTADO no se muestra), traslados (ESTADOS_TRASLADO, COLUMNAS_TRASLADO,
 * GRUPOS_OPERACION, grupoOperacion) y estado del stock (ESTADOS_STOCK, COLUMNAS_STOCK; RP53).
 *
 * Las columnas tienen la forma de columna de kanban.js ({clave, titulo, tono, estados, cerrada}; T3A las valida con
 * definirColumnas); `tono` es un color de Tailwind (como COLUMNAS_HUB). Todo es inmutable.
 */

// congelar: mutar estas tablas lanza TypeError (una sola función en todo el frontend; no se copia).
import { congelar, humanizarCodigo, tiene } from './estados-pedido.js';
import { diaColombia, diaDeNegocio as diaPec, fechaCorta, fechaSolo, horaCO, instante } from './fechas-colombia.js';
// B4 T14: la consulta de cada columna del tablero de Compras (consultaColumnaPec) sale de la misma queryListado.
import { normalizarRespuesta, queryListado, recortarColumnas } from './tabla.js';
// B4 T14 r1: la regla de la columna con filtro (m4, la misma de Ventas), el número del servidor (m7) y la regla de
// recarga y el texto de los errores (m15).
import { estadosDeColumnaLista } from './kanban.js';
import { formatoDecimal, formatoEntero, numeroFinito } from './kpis.js';
import { ofreceReintentar, recargarTrasError, textoDeError } from './avisos.js';
// B4 T18 (Productos): el precio en pesos enteros y la etiqueta y la regla de la tarifa de IVA, de sus dueños.
import { formatoPesos } from './pesos.js';
import { etiquetaTarifaCatalogo, sinTarifaIva } from './iva.js';

/**
 * @typedef {{ bg: string, text: string, border: string }} ClasesEstado
 * @typedef {{ label: string, clases: ClasesEstado }} InfoEstado
 * @typedef {{ clave: string, titulo: string, tono: string, estados: ReadonlyArray<string>, cerrada: boolean }} Columna
 * @typedef {{tipo: 'ninguno'} | {tipo: 'bloqueado', motivo: string, enlace?: {texto: string, href: string}}
 *   | {tipo: 'cambio', estado: string} | {tipo: 'accion', accion: string}} ResultadoSoltar
 */

/** Las clases de un código que no está en la tabla (el mismo gris de infoEstadoPedido). */
const GRIS = congelar({ bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });

/**
 * La entrada de `tabla` para `e`, o una humanizada en gris (nunca el código crudo). El código se recorta antes de
 * buscarlo, como etiqueta_estado de Python (' BORRADOR' -> 'Borrador').
 */
function infoDe(tabla, e) {
  const codigo = typeof e === 'string' ? e.trim() : e;
  if (typeof codigo === 'string' && tiene(tabla, codigo)) return tabla[codigo];
  return congelar({ label: humanizarCodigo(e), clases: { ...GRIS } });
}

/** {clave, titulo, tono, estados, cerrada}: la forma de columna de kanban.js. */
const columna = (clave, titulo, tono, estados, cerrada = false) => ({ clave, titulo, tono, estados: [...estados], cerrada });

// ─── Pedido de compra: estados y etapas ─────────────────────────────────────────

/**
 * Los 10 estados del PEC (R9), en el orden de las etapas, con la etiqueta de ETIQUETAS_ESTADO['PEC'] y las clases que
 * hoy usa compras/pedidos (PEC_ESTADOS de page.tsx). Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstado>>>}
 */
export const ESTADOS_PEC = congelar({
  BORRADOR: { label: 'Borrador', clases: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' } },
  EMITIDO: { label: 'Emitido', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  ENVIADO: { label: 'Enviado al proveedor', clases: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' } },
  EN_TRANSITO: { label: 'En tránsito', clases: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-200' } },
  PENDIENTE_ENTREGA: { label: 'Pendiente de entrega', clases: { bg: 'bg-orange-100', text: 'text-orange-800', border: 'border-orange-200' } },
  RECIBIDO: { label: 'Llegó a bodega', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } },
  PARCIALMENTE_RECIBIDA: { label: 'Recibido en parte', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  RECIBIDA: { label: 'Recibido', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } },
  COMPLETADO: { label: 'Completado', clases: { bg: 'bg-green-100', text: 'text-green-800', border: 'border-green-200' } },
  CANCELADO: { label: 'Cancelado', clases: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' } },
});

/**
 * Etiqueta y clases de un estado del PEC; un desconocido sale humanizado y en gris (ya no como «Borrador»).
 * @param {unknown} e
 * @returns {Readonly<InfoEstado>}
 */
export function infoEstadoPec(e) {
  return infoDe(ESTADOS_PEC, e);
}

/**
 * Etapa -> estados del PEC (R9): borrador, emitido, en_transito, en_bodega (llegó o se recibió en parte: falta confirmar
 * o recibir el resto), recibido (recepción confirmada en bodega) y cancelado. Inmutable.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const ETAPAS_PEC = congelar({
  borrador: ['BORRADOR'],
  emitido: ['EMITIDO', 'ENVIADO'],
  en_transito: ['EN_TRANSITO', 'PENDIENTE_ENTREGA'],
  en_bodega: ['RECIBIDO', 'PARCIALMENTE_RECIBIDA'],
  recibido: ['RECIBIDA', 'COMPLETADO'],
  cancelado: ['CANCELADO'],
});

/** La etapa de un estado desconocido (R9). */
const ETAPA_POR_DEFECTO = 'emitido';

const ETAPA_DE_ESTADO = congelar(Object.fromEntries(
  Object.entries(ETAPAS_PEC).flatMap(([etapa, estados]) => estados.map((e) => [e, etapa])),
));

/**
 * La etapa de un estado del PEC; un estado desconocido (o que no es un texto) cuenta como 'emitido'.
 * @param {unknown} estado
 * @returns {string}
 */
export function etapaPec(estado) {
  return typeof estado === 'string' && tiene(ETAPA_DE_ESTADO, estado) ? ETAPA_DE_ESTADO[estado] : ETAPA_POR_DEFECTO;
}

const estadosDe = (...etapas) => etapas.flatMap((etapa) => ETAPAS_PEC[etapa]);

/**
 * Grupos de estados (R9): activos = emitido + en_transito + en_bodega; vigentes = todo menos cancelado; vencibles =
 * emitido + en_transito (los únicos que pueden estar vencidos). Inmutable.
 * @type {Readonly<Record<'activos' | 'vigentes' | 'vencibles', ReadonlyArray<string>>>}
 */
export const GRUPOS_PEC = congelar({
  activos: estadosDe('emitido', 'en_transito', 'en_bodega'),
  vigentes: estadosDe('borrador', 'emitido', 'en_transito', 'en_bodega', 'recibido'),
  vencibles: estadosDe('emitido', 'en_transito'),
});

const FECHA_DE_CALENDARIO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * R9 y RP40: el PEC está vencido si está emitido o en tránsito (etapaPec; un desconocido cuenta como emitido) y su día
 * de entrega (fecha_entrega_estimada tal como se guarda: sus 10 primeros caracteres, sin pasarla a Colombia) es
 * anterior a `hoy`. Sin fecha no vence; en bodega, recibido, borrador o cancelado nunca vence. Una entrega guardada hoy
 * a las 00:00 no está vencida hoy. Es la regla de es_vencido (estados_compras.py).
 * T2 r1: un día que no existe en el calendario ('2026-02-30', 'basura') no vence (se valida con fechaSolo de
 * fechas-colombia.js). es_vencido de Python no se toca: su dato real es el DateTime del ORM, así que nunca recibe una
 * fecha imposible.
 * @param {{estado?: string, fecha_entrega_estimada?: string | null} | null | undefined} p
 * @param {string} [hoy]  'AAAA-MM-DD' (por defecto, diaColombia())
 * @returns {boolean}
 */
export function esPecVencido(p, hoy = diaColombia()) {
  const dia = diaPec(p?.fecha_entrega_estimada);
  if (!dia) return false;
  const etapa = etapaPec(p?.estado);
  return (etapa === 'emitido' || etapa === 'en_transito') && dia < hoy;
}

// ─── Pedido de compra: cambios a mano ───────────────────────────────────────────

/**
 * Lo único que se pone a mano en un PEC: emitir un borrador o cancelar (con motivo). Espejo de ESTADOS_PEC_MANUALES.
 * EN_TRANSITO lo pone el seguimiento del envío y los de recepción, la recepción en bodega. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_PEC_MANUALES = congelar(['EMITIDO', 'CANCELADO']);

const SOLO_CANCELAR = congelar(['CANCELADO']);

/**
 * Desde qué estado se puede ir a cuál a mano (espejo de TRANSICIONES_PEC_PATCH del backend, que es la autoridad: la
 * pantalla solo ofrece lo que update_pec va a aceptar). Cancelar en tránsito se permite mientras no tenga recepciones
 * (el servidor responde 409 si las tiene). Inmutable.
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const TRANSICIONES_PEC_PATCH = congelar({
  BORRADOR: ['EMITIDO', 'CANCELADO'],
  EMITIDO: SOLO_CANCELAR,
  ENVIADO: SOLO_CANCELAR,
  EN_TRANSITO: SOLO_CANCELAR,
  PENDIENTE_ENTREGA: SOLO_CANCELAR,
  RECIBIDO: [],
  PARCIALMENTE_RECIBIDA: [],
  RECIBIDA: [],
  COMPLETADO: [],
  CANCELADO: [],
});

/**
 * A qué estados se puede pasar desde `e` a mano. Un estado desconocido (o que no es un texto) se trata como EMITIDO:
 * solo cancelar (destinos_pec_permitidos).
 * @param {unknown} e
 * @returns {ReadonlyArray<string>}
 */
export function transicionesPec(e) {
  return typeof e === 'string' && tiene(TRANSICIONES_PEC_PATCH, e) ? TRANSICIONES_PEC_PATCH[e] : TRANSICIONES_PEC_PATCH.EMITIDO;
}

/**
 * RP93: lo que pasa al cancelar un PEC (lo que ya hace _desvincular_pec_cancelado en el servidor), para la ventana del
 * motivo de T14 y T15. Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const EFECTOS_CANCELAR_PEC = congelar([
  'Los pedidos de venta vinculados vuelven a Pendiente de compra.',
  'Los productos vuelven a la Lista de compras.',
]);

// ─── Pedido de compra: tablero ──────────────────────────────────────────────────

/**
 * El tablero del Hub de Compras y de Pedidos de compra (R9): Borrador · Emitido · En tránsito · En bodega · Recibido
 * (plegada) · Cancelado (plegada). Una columna por etapa: la clave es la etapa y los estados, los de ETAPAS_PEC.
 * Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_PEC = congelar([
  columna('borrador', 'Borrador', 'slate', ETAPAS_PEC.borrador),
  columna('emitido', 'Emitido', 'amber', ETAPAS_PEC.emitido),
  columna('en_transito', 'En tránsito', 'indigo', ETAPAS_PEC.en_transito),
  columna('en_bodega', 'En bodega', 'teal', ETAPAS_PEC.en_bodega),
  columna('recibido', 'Recibido', 'emerald', ETAPAS_PEC.recibido, true),
  columna('cancelado', 'Cancelado', 'rose', ETAPAS_PEC.cancelado, true),
]);

const CLAVES_COLUMNA_PEC = congelar(COLUMNAS_PEC.map((c) => c.clave));

/**
 * La columna (clave) de un estado del PEC. Un desconocido va a 'emitido', como su etapa: ninguno queda sin columna.
 * RECIBIDA va a Recibido y PARCIALMENTE_RECIBIDA a En bodega (antes caían en Borrador).
 * @param {unknown} e
 * @returns {string}
 */
export function columnaPec(e) {
  const c = COLUMNAS_PEC.find((col) => col.estados.includes(/** @type {string} */ (e)));
  return c ? c.clave : ETAPA_POR_DEFECTO;
}

const ENLACE_TRANSITO = congelar({ texto: 'Ir a Mercancía en tránsito', href: '/dashboard/compras/transito' });
/** B4 T24 f3 (FINAL-m36): los motivos que dependen de la etapa del PEC al soltarlo (reglaSoltarPec). */
const TEXTO_EMITIR_PRIMERO = 'Primero emítelo: arrástralo a Emitido.';
const TEXTO_YA_EN_BODEGA = 'Ya llegó a bodega: su estado lo lleva la recepción.';
/** B4 T24 f2 (F27): el enlace «Ir a Recepciones» de los bloqueos, el único (transito.js lo importa). */
export const ENLACE_RECEPCIONES = congelar({ texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' });

/**
 * Qué pasa al soltar un PEC de la columna `origen` en la columna `destino` (claves de COLUMNAS_PEC), con la forma de
 * resultado de kanban.js. Las mismas reglas que update_pec (R9):
 *  - la misma columna: ninguno;
 *  - desde Cancelado: bloqueado 'Está cancelado y no se puede reabrir.';
 *  - → Emitido: cambio a EMITIDO solo desde BORRADOR (si no, bloqueado);
 *  - → Cancelado: acción 'cancelar' (la pantalla pide el motivo) si transicionesPec lo permite; desde la bodega o
 *    recibido, bloqueado;
 *  - → En tránsito: bloqueado, con el enlace a Mercancía en tránsito (lo marca el seguimiento del envío);
 *  - → En bodega o Recibido: bloqueado, con el enlace a Recepciones (lo marca la recepción en bodega);
 *  - → Borrador: bloqueado 'Un pedido emitido no vuelve a Borrador.'
 * B4 T24 f3 (FINAL-m36): el motivo depende de dónde está el PEC (su etapa), porque la pantalla a la que manda tiene que mostrarlo:
 *  - un Borrador hacia En tránsito, En bodega o Recibido: 'Primero emítelo: arrástralo a Emitido.' (sin enlace: Tránsito y el selector
 *    de Recepciones no lo listan);
 *  - un Emitido (o Enviado) hacia En bodega o Recibido: 'Primero sigue el envío en Mercancía en tránsito.', con su enlace;
 *  - uno que ya llegó a bodega (o se recibió) hacia En tránsito o Borrador: 'Ya llegó a bodega: su estado lo lleva la recepción.'
 *    (como hacia Cancelado).
 * Una columna que no existe es un error de programación (lanza Error).
 * @param {{estado?: string} | null | undefined} pec
 * @param {string} origen
 * @param {string} destino
 * @returns {ResultadoSoltar}
 */
export function reglaSoltarPec(pec, origen, destino) {
  if (!CLAVES_COLUMNA_PEC.includes(destino)) throw new Error(`Columna del tablero de compras desconocida: ${String(destino)}`);
  if (origen === destino) return { tipo: 'ninguno' };
  const estado = pec?.estado;
  if (etapaPec(estado) === 'cancelado') return { tipo: 'bloqueado', motivo: 'Está cancelado y no se puede reabrir.' };
  const destinos = transicionesPec(estado);
  const etapa = etapaPec(estado);
  const yaEnBodega = etapa === 'en_bodega' || etapa === 'recibido';
  switch (destino) {
    case 'emitido':
      return destinos.includes('EMITIDO')
        ? { tipo: 'cambio', estado: 'EMITIDO' }
        : { tipo: 'bloqueado', motivo: 'Solo un pedido en Borrador se puede marcar como Emitido.' };
    case 'cancelado':
      return destinos.includes('CANCELADO')
        ? { tipo: 'accion', accion: 'cancelar' }
        : { tipo: 'bloqueado', motivo: TEXTO_YA_EN_BODEGA };
    case 'en_transito':
      if (etapa === 'borrador') return { tipo: 'bloqueado', motivo: TEXTO_EMITIR_PRIMERO };
      if (yaEnBodega) return { tipo: 'bloqueado', motivo: TEXTO_YA_EN_BODEGA };
      return { tipo: 'bloqueado', motivo: 'El tránsito se marca al iniciar el seguimiento del envío.', enlace: ENLACE_TRANSITO };
    case 'en_bodega':
    case 'recibido':
      if (etapa === 'borrador') return { tipo: 'bloqueado', motivo: TEXTO_EMITIR_PRIMERO };
      if (etapa === 'emitido') return { tipo: 'bloqueado', motivo: 'Primero sigue el envío en Mercancía en tránsito.', enlace: ENLACE_TRANSITO };
      // r1 (m15): un PEC ya recibido soltado en «En bodega» no lleva a Recepciones (su selector «Recepcionar PEC» no lo lista).
      if (etapa === 'recibido') return { tipo: 'bloqueado', motivo: TEXTO_YA_EN_BODEGA };
      return { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: ENLACE_RECEPCIONES };
    default: // 'borrador'
      if (yaEnBodega) return { tipo: 'bloqueado', motivo: TEXTO_YA_EN_BODEGA };
      return { tipo: 'bloqueado', motivo: 'Un pedido emitido no vuelve a Borrador.' };
  }
}

// ─── Pedido de compra: el flujo de Compras ──────────────────────────────────────

const PASO_DE_ETAPA = congelar({
  borrador: 'PEC', emitido: 'PEC', en_transito: 'TRANSITO', en_bodega: 'RECEPCION', recibido: 'RECIBIDO', cancelado: null,
});

/**
 * El paso del diagrama del flujo de Compras de un PEC (paso_flujo_pec): 'PEC' (borrador y emitido), 'TRANSITO',
 * 'RECEPCION' (en bodega) o 'RECIBIDO'; null si está cancelado. 'LISTA' son los ítems de la lista de compras, no un PEC.
 * @param {unknown} estado
 * @returns {'PEC' | 'TRANSITO' | 'RECEPCION' | 'RECIBIDO' | null}
 */
export function pasoFlujoPec(estado) {
  return PASO_DE_ETAPA[etapaPec(estado)];
}

// ─── Pedido de compra: las listas del Hub y de Pedidos de compra (B4 T14) ───────

/**
 * B4 T14: las vistas de GET /compras/pedidos (espejo de VISTAS_PEC de core/estados_compras.py, T12): vista -> estados.
 * 'todos' son los vigentes (R9: sin cancelados), 'no_resueltos' los activos y 'acciones_tomadas' lo recibido más lo
 * cancelado; 'en_bodega' es la pestaña «Recepciones» del Hub. Inmutable. (test_paridad_estados_compras.py todavía no la
 * compara con Python: es del carril de backend.)
 * @type {Readonly<Record<string, ReadonlyArray<string>>>}
 */
export const VISTAS_PEC = congelar({
  todos: GRUPOS_PEC.vigentes,
  vigentes: GRUPOS_PEC.vigentes,
  activos: GRUPOS_PEC.activos,
  borradores: estadosDe('borrador'),
  pedidos: estadosDe('borrador', 'emitido'),
  en_transito: estadosDe('en_transito'),
  en_bodega: estadosDe('en_bodega'),
  recibidos: estadosDe('recibido'),
  cancelados: estadosDe('cancelado'),
  no_resueltos: GRUPOS_PEC.activos,
  acciones_tomadas: estadosDe('recibido', 'cancelado'),
  transito_logistica: estadosDe('emitido', 'en_transito', 'en_bodega'),
});

/** {valor, etiqueta} de cada estado del PEC, en el orden de las etapas (la etiqueta de R9). */
const OPCION_DE_ESTADO = congelar(Object.fromEntries(
  Object.entries(ESTADOS_PEC).map(([valor, info]) => [valor, { valor, etiqueta: info.label }]),
));
const TODAS_LAS_OPCIONES = congelar(Object.values(OPCION_DE_ESTADO));
const OPCIONES_DE_VISTA = congelar(Object.fromEntries(
  Object.entries(VISTAS_PEC).map(([vista, estados]) => [vista, estados.map((e) => OPCION_DE_ESTADO[e])]),
));

/**
 * B4 T14: las opciones de «Filtrar estado» (FiltroEstados de BarraTabla) de la pestaña `vista`: los estados de esa
 * vista con su etiqueta; sin vista, o una que no existe, los 10. La misma referencia para la misma vista (la barra y
 * accionPestana la llaman en cada render). Inmutable.
 * @param {unknown} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosPec(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_DE_VISTA, vista) ? OPCIONES_DE_VISTA[vista] : TODAS_LAS_OPCIONES;
}

/**
 * B4 T14: «Filtrar estado» en el tablero (como el de Pedidos de venta, T10): una opción por columna, con su estado
 * principal (el primero) y el título de la columna; estadosDeColumnaLista (kanban.js) la convierte en la columna entera. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_PEC = congelar(COLUMNAS_PEC.map((c) => ({ valor: c.estados[0], etiqueta: c.titulo })));

/**
 * B4 T14 (R11, C4, D39): la consulta de una columna del tablero del Hub de Compras en modo servidor (la query de GET
 * /compras/pedidos, con queryListado): SIN vista (todos los PEC: la vista 'todos' son los vigentes y dejaría vacía la
 * columna Cancelado) ni paso (el endpoint no lo tiene), los estados de la columna cruzados con el filtro de la pantalla
 * (estadosDeColumnaLista de kanban.js, la misma regla de Ventas: con el estado principal de la columna,
 * OPCIONES_ESTADOS_TABLERO_PEC, la columna entera), la búsqueda y el semáforo del MISMO estado, y el orden, el límite y
 * el desplazamiento de la columna (el límite 0 de una plegada lo pone el hook). Sin estados en común, null: la columna
 * queda vacía sin pedir.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {{orden?: string | null, limit?: number, offset?: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaPec(estado, columna, { orden, limit, offset }) {
  const estados = estadosDeColumnaLista(columna, estado?.estados);
  if (estados.length === 0) return null;
  return queryListado(estado, { vista: null, paso: null, estados, orden, limit, offset });
}

/**
 * B4 T14: la vista tiene algún estado que puede estar vencido (emitido o en tránsito). En bodega, recibidos,
 * cancelados, borradores y acciones tomadas nunca: ahí «Con atraso» daría una tabla vacía sin razón a la vista. Sin
 * vista, o una que no existe, true (todos los PEC).
 * @param {unknown} vista
 * @returns {boolean}
 */
export function vistaPuedeVencer(vista) {
  if (typeof vista !== 'string' || !tiene(VISTAS_PEC, vista)) return true;
  return VISTAS_PEC[vista].some((e) => GRUPOS_PEC.vencibles.includes(e));
}

/**
 * B4 T14 (RP40, resolución 4 de T14): el día de una fecha de negocio del PEC (fecha_entrega_estimada, fecha_alerta) tal
 * como se guarda, sin pasarla a Colombia, como esPecVencido. B4 T24 (FINAL-m30): es diaDeNegocio de fechas-colombia.js
 * (la misma función), con su nombre de siempre.
 */
export { diaPec };

/** Un texto con algo, sin los espacios de los bordes; si no, null. */
const textoLimpio = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
const esObjeto = (v) => v !== null && typeof v === 'object';

/**
 * B4 T14 (KANBAN-compras punto 7): la tarjeta de un PEC en el tablero (la forma de DatosTarjetaKanban de
 * components/ui/Kanban.tsx): el número, el proveedor (o 'Sin proveedor'), el PVEN de origen, el total, el estado con su
 * etiqueta (infoEstadoPec: un heredado sale humanizado, nunca «Borrador»), la entrega estimada (su día, diaPec) y el chip
 * «Vencido». Vencido es is_overdue del servidor (T12: emitido o en tránsito con la entrega pasada, RP40): aquí no se
 * recalcula.
 * @param {any} p
 * @returns {{numero: string, tipo: 'PEC', titulo: string, subtitulo: string | null, monto: number | null,
 *   estado: Readonly<InfoEstado>, chips: {texto: string, tono: string}[], tiempo: string | null, atrasada: boolean}}
 */
export function tarjetaPec(p) {
  const dia = diaPec(p?.fecha_entrega_estimada);
  const vencido = p?.is_overdue === true;
  return {
    numero: String(p?.numero ?? ''),
    tipo: 'PEC',
    titulo: textoLimpio(p?.supplier_name) ?? 'Sin proveedor',
    subtitulo: textoLimpio(p?.ven_numero),
    monto: numeroFinito(p?.total_cop),
    estado: infoEstadoPec(p?.estado),
    chips: vencido ? [{ texto: 'Vencido', tono: 'rose' }] : [],
    tiempo: dia ? `Entrega ${fechaCorta(dia)}` : null,
    atrasada: vencido,
  };
}

/** B4 T15: la acción de las tarjetas de la columna En bodega: Recepciones, donde se elige el PEC que llegó. */
const ACCION_RECEPCIONAR = congelar({ texto: 'Recepcionar', href: '/dashboard/compras/recepciones', tono: 'teal' });

/**
 * B4 T15 (KANBAN-compras punto 6): la tarjeta del tablero de Pedidos de compra: la de tarjetaPec (T14, la del Hub, que
 * no cambia) más, en la columna En bodega (columnaPec), la acción principal «Recepcionar» (a Recepciones) y, si se
 * recibió en parte (PARCIALMENTE_RECIBIDA), el chip «Falta por recibir» después del «Vencido» del servidor. En las demás
 * columnas, sin acción principal.
 * @param {any} p
 * @returns {ReturnType<typeof tarjetaPec> & {accionPrincipal: {texto: string, href: string, tono: string} | null}}
 */
export function tarjetaPedidoCompra(p, { recepcionar = true } = {}) {
  const tarjeta = tarjetaPec(p);
  const enBodega = columnaPec(p?.estado) === 'en_bodega';
  const chips = p?.estado === 'PARCIALMENTE_RECIBIDA' ? [...tarjeta.chips, { texto: 'Falta por recibir', tono: 'amber' }] : tarjeta.chips;
  // r1 (m20, aditivo): «Recepcionar» (POST /pedidos/{id}/recepcionar: ADMIN y COMPRAS) solo a quien recepciona; sin permiso, la tarjeta
  // queda en «Abrir» (el panel), como tarjetaRecepcion con {contar}.
  return { ...tarjeta, chips, accionPrincipal: enBodega && recepcionar ? { ...ACCION_RECEPCIONAR } : null };
}

/**
 * B4 T15 r1 (m8): lo que dice la tabla de pedidos de compra cuando no hay filas, según lo que la deja vacía (el Hub y
 * Pedidos de compra):
 *  - con «Con atraso» (semaforo vencidos o su sinónimo atrasados): 'Ningún pedido de compra con la entrega vencida.';
 *  - con un filtro de estados: 'Ningún pedido de compra con esos estados. Ajusta el filtro.';
 *  - con una búsqueda: 'Sin resultados para «q»' y 'Ajusta la búsqueda o el filtro de estados.';
 *  - si no: 'No hay pedidos de compra en esta vista' y la `ayuda` de la pantalla (o null).
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @param {string | null} [ayuda]
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioPec(estado, ayuda = null) {
  if (esSemaforoVencidos(estado?.semaforo)) return { titulo: 'Ningún pedido de compra con la entrega vencida.', ayuda: null };
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ningún pedido de compra con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: 'Ajusta la búsqueda o el filtro de estados.' };
  return { titulo: 'No hay pedidos de compra en esta vista', ayuda: ayuda ?? null };
}

/**
 * B4 T24 f3 r1 (F63): el semáforo «vencidos» del estado único, o su sinónimo «atrasados» (el FiltroSemaforo de la franja). Lo usan
 * textoVacioPec y filtroSemaforoCompras (flujo-compras.js): un solo sitio para el sinónimo.
 * @param {unknown} semaforo
 * @returns {boolean}
 */
export function esSemaforoVencidos(semaforo) {
  return semaforo === 'vencidos' || semaforo === 'atrasados';
}

/**
 * B4 T14 (R9, C15c): de los PEC marcados para cancelar, cuáles se mandan (los que transicionesPec deja cancelar) y
 * cuáles se omiten sin llamar al servidor, con su motivo: los cancelados y los que ya llegaron a bodega o se recibieron
 * (su estado lo lleva la recepción). Las filas que no son objetos se ignoran.
 * @param {any[] | null | undefined} filas
 * @returns {{cancelables: any[], omitidos: {id: unknown, numero: string, motivo: string}[]}}
 */
export function repartirCancelacionPec(filas) {
  const cancelables = [];
  const omitidos = [];
  for (const p of Array.isArray(filas) ? filas : []) {
    if (!esObjeto(p)) continue;
    if (transicionesPec(p.estado).includes('CANCELADO')) {
      cancelables.push(p);
      continue;
    }
    const motivo = etapaPec(p.estado) === 'cancelado' ? 'ya está cancelado' : 'ya llegó a bodega: su estado lo lleva la recepción';
    omitidos.push({ id: p.id, numero: textoLimpio(p.numero) ?? `#${String(p.id)}`, motivo });
  }
  return { cancelables, omitidos };
}

/**
 * B4 T14: el resultado de cancelar varios PEC en serie con un mismo motivo. `resultados`: [{numero, ok, error}];
 * `omitidos` (de repartirCancelacionPec) se nombran al final y no cuentan como error. `mensaje` va al aviso ('2 pedidos
 * de compra cancelados'; con fallos 'No se pudieron cancelar: PEC-1, PEC-2') y `fallidos[].texto` es el mensaje del
 * servidor de cada uno, con su número delante si no lo trae (ningún error queda en blanco).
 * @param {{numero?: string, ok: boolean, error?: string}[] | null | undefined} resultados
 * @param {{numero?: string, motivo?: string}[]} [omitidos]
 * @returns {{exitosos: number, fallidos: {numero: string, error: string, texto: string}[], mensaje: string, tipo: 'ok' | 'err'}}
 */
export function resumenCancelacionPec(resultados, omitidos = []) {
  const lista = (Array.isArray(resultados) ? resultados : []).filter(esObjeto);
  const exitosos = lista.filter((r) => r.ok).length;
  const fallidos = lista.filter((r) => !r.ok).map((r) => {
    const numero = String(r.numero || '').trim();
    const error = String(r.error || '').trim() || 'el servidor no dio detalle del error';
    return { numero, error, texto: numero && !error.includes(numero) ? `${numero}: ${error}` : error };
  });
  const cancelados = exitosos === 1 ? '1 pedido de compra cancelado' : `${exitosos} pedidos de compra cancelados`;
  const numeros = fallidos.map((f) => f.numero).filter(Boolean).join(', ');
  const noSePudo = fallidos.length === 1 ? 'No se pudo cancelar' : 'No se pudieron cancelar';
  const fallo = `${noSePudo}${numeros ? `: ${numeros}` : ' el pedido de compra'}`;
  let mensaje;
  if (fallidos.length === 0) mensaje = exitosos > 0 ? cancelados : 'No se canceló ningún pedido de compra';
  else mensaje = exitosos > 0 ? `${cancelados}. ${fallo}` : fallo;
  const validos = (Array.isArray(omitidos) ? omitidos : []).filter(esObjeto);
  if (validos.length > 0) {
    const detalle = validos.map((o) => `${o.numero || 'un pedido de compra'}: ${o.motivo || 'se omitió'}`).join('; ');
    mensaje += `. ${validos.length === 1 ? 'Se omitió' : 'Se omitieron'} ${detalle}.`;
  }
  return { exitosos, fallidos, mensaje, tipo: fallidos.length === 0 && exitosos > 0 ? 'ok' : 'err' };
}

/**
 * B4 T14 r1 (m15; R9: «la masiva va en serie»): cancela los PEC UNO POR UNO con `cancelarUno(pec)` (el PATCH de la
 * pantalla, que lleva el motivo): espera cada uno antes del siguiente (nunca dos en vuelo) y en el orden de la lista. No
 * corta en una falla: cada resultado dice {id, numero, ok} y, si falló, el error tal cual (`err`, para relanzarlo) y su
 * texto (`error`, textoDeError). Lo que no es un arreglo da [].
 * @param {any[] | null | undefined} pecs
 * @param {(pec: any) => Promise<unknown>} cancelarUno
 * @returns {Promise<{id: unknown, numero: string, ok: boolean, error?: string, err?: unknown}[]>}
 */
export async function cancelarPecsEnSerie(pecs, cancelarUno) {
  const resultados = [];
  for (const p of Array.isArray(pecs) ? pecs : []) {
    try {
      await cancelarUno(p);
      resultados.push({ id: p?.id, numero: p?.numero, ok: true });
    } catch (err) {
      resultados.push({ id: p?.id, numero: p?.numero, ok: false, error: textoDeError(err), err });
    }
  }
  return resultados;
}

/**
 * B4 T24 (FINAL-m27): la alerta de la pestaña que esconde los vencidos («No resueltos» del Hub, «Activos» de Pedidos de
 * compra): «Hay N vencidos» (con su número, que la pestaña no muestra), o false sin vencidos.
 * @param {unknown} vencidos
 * @returns {string | false}
 */
export function textoVencidosPec(vencidos) {
  if (typeof vencidos !== 'number' || !Number.isFinite(vencidos) || vencidos <= 0) return false;
  return `Hay ${formatoEntero(vencidos)} ${vencidos === 1 ? 'vencido' : 'vencidos'}`;
}

/**
 * B4 T14 r1 (I1, m10, m15): lo que hace la pantalla después de cancelar en serie (cancelarPecsEnSerie), para que la
 * página solo lo ejecute:
 *  - fuera: las claves que salen de la selección (lo cancelado y lo omitido); lo que falló sigue marcado;
 *  - pendientes: los PEC que fallaron (se quedan en la ventana del motivo para reintentar con lo escrito);
 *  - recargar: la lista, la franja, las tarjetas y del tablero el origen y el destino, si se canceló algo o si una falla
 *    lo pide (recargarTrasError: un 409, un 400, un 422 (B4 T24, F8) o la red; un 500 no);
 *  - recargarVentas (I1): si se canceló algo, los pedidos de venta del panel de consolidación (los vinculados vuelven a
 *    Pendiente de compra);
 *  - recargarDetalle (m10): si una falla pide recargar, el detalle del panel abierto también;
 *  - mensajeOk: el aviso de lo cancelado (con los omitidos solo si no hubo fallas; B4 T24 f3, F55: con fallas, los omitidos no van en el
 *    aviso y la página no los deja en la ventana: allí quedan solo los pendientes, para reintentar con lo escrito);
 *  - error: null si nada falló; con un solo PEC, el MISMO error (el modal muestra el detail del servidor); con varios,
 *    un Error con una línea por PEC (resumenCancelacionPec). Nunca se resuelve en silencio con una falla.
 * @param {any[] | null | undefined} pecs
 * @param {{id: unknown, numero?: string, ok: boolean, error?: string, err?: unknown}[] | null | undefined} resultados
 * @param {{id: unknown, numero?: string, motivo?: string}[]} [omitidos]
 * @returns {{fuera: string[], pendientes: any[], recargar: boolean, recargarVentas: boolean, recargarDetalle: boolean,
 *   mensajeOk: string | null, error: unknown}}
 */
export function despuesDeCancelarPec(pecs, resultados, omitidos = []) {
  const lista = (Array.isArray(resultados) ? resultados : []).filter(esObjeto);
  const omitidosValidos = (Array.isArray(omitidos) ? omitidos : []).filter(esObjeto);
  const cancelados = lista.filter((r) => r.ok);
  const fallidos = lista.filter((r) => !r.ok);
  const idsFallidos = new Set(fallidos.map((r) => r.id));
  const recargarDetalle = fallidos.some((r) => recargarTrasError(r.err));
  let error = null;
  if (fallidos.length > 0) {
    const resumen = resumenCancelacionPec(fallidos, []);
    error = lista.length === 1 && fallidos[0].err instanceof Error
      ? fallidos[0].err
      : new Error(resumen.fallidos.map((f) => f.texto).join('\n'));
  }
  return {
    fuera: [...cancelados, ...omitidosValidos].map((r) => String(r.id)),
    pendientes: (Array.isArray(pecs) ? pecs : []).filter((p) => esObjeto(p) && idsFallidos.has(p.id)),
    recargar: cancelados.length > 0 || recargarDetalle,
    recargarVentas: cancelados.length > 0,
    recargarDetalle,
    mensajeOk: cancelados.length > 0 ? resumenCancelacionPec(cancelados, fallidos.length === 0 ? omitidosValidos : []).mensaje : null,
    error,
  };
}

/**
 * B4 T14 (TABLA-compras punto 6: «'Agrupar mes' pasa a separadores por mes cuando el orden es por fecha de compra»): la
 * tabla va ordenada por la fecha de compra ('compra' o '-compra', el campo de _ordenes_pec de T12).
 * @param {unknown} orden
 * @returns {boolean}
 */
export function ordenPorFechaDeCompra(orden) {
  return orden === 'compra' || orden === '-compra';
}

/** La clave del tramo de los PEC sin fecha de compra (van al final: el servidor ordena con los nulos al final). */
const SIN_FECHA_DE_COMPRA = 'sin_fecha';
const MESES = congelar(['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre',
  'Noviembre', 'Diciembre']);

/**
 * B4 T14: el mes ('AAAA-MM') de la fecha de compra de un PEC, la clave de su separador (grupoFila de TablaEstandar).
 * fecha_compra es un instante (create_pec la pone con la hora): su mes es el de Colombia; un 'AAAA-MM-DD' no se corre.
 * Es el MISMO campo con que ordena el servidor ('compra' = fecha_compra, los nulos al final), así que sin ella el PEC va
 * en el tramo 'sin_fecha' (el último), no en el mes de created_at.
 * @param {any} p
 * @returns {string}
 */
export function grupoMesPec(p) {
  const valor = p?.fecha_compra;
  if (typeof valor !== 'string') return SIN_FECHA_DE_COMPRA;
  const texto = valor.trim();
  const calendario = FECHA_DE_CALENDARIO.test(texto) && fechaSolo(texto) ? texto : '';
  const momento = calendario ? null : instante(texto);
  const dia = calendario || (momento ? diaColombia(momento) : '');
  return dia ? dia.slice(0, 7) : SIN_FECHA_DE_COMPRA;
}

/**
 * B4 T14: el título del separador de un mes: 'Noviembre de 2026'; el tramo sin fecha (o una clave que no es un mes),
 * 'Sin fecha de compra'.
 * @param {unknown} clave
 * @returns {string}
 */
export function tituloMesPec(clave) {
  const m = typeof clave === 'string' ? /^(\d{4})-(\d{2})$/.exec(clave) : null;
  const mes = m ? Number(m[2]) : 0;
  return m && mes >= 1 && mes <= 12 ? `${MESES[mes - 1]} de ${m[1]}` : 'Sin fecha de compra';
}

// ─── Recepciones (GoodsReceipt) ─────────────────────────────────────────────────

/**
 * Los estados de una recepción, con la etiqueta de ETIQUETAS_ESTADO['ENINV']. Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstado>>>}
 */
export const ESTADOS_RECEPCION = congelar({
  BORRADOR: { label: 'Por contar', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  COMPLETADA: { label: 'Recibida', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } },
  COMPLETADA_LOGISTICA: { label: 'Solo registro logístico', clases: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-200' } },
  CANCELADA: { label: 'Cancelada', clases: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' } },
});

/**
 * Grupos de recepción (R9; las vistas de list_recepciones, RP41): por confirmar, confirmadas y canceladas. Inmutable.
 * @type {Readonly<Record<'por_confirmar' | 'confirmadas' | 'canceladas', ReadonlyArray<string>>>}
 */
export const GRUPOS_RECEPCION = congelar({
  por_confirmar: ['BORRADOR'],
  confirmadas: ['COMPLETADA', 'COMPLETADA_LOGISTICA'],
  canceladas: ['CANCELADA'],
});

/** El grupo de `estado` en `grupos`, o null. */
function grupoDe(grupos, estado) {
  for (const [grupo, estados] of Object.entries(grupos)) {
    if (estados.includes(estado)) return grupo;
  }
  return null;
}

/**
 * 'por_confirmar', 'confirmadas' o 'canceladas' para el estado de una recepción; null si no está (grupo_recepcion).
 * @param {unknown} estado
 * @returns {'por_confirmar' | 'confirmadas' | 'canceladas' | null}
 */
export function grupoRecepcion(estado) {
  return /** @type {any} */ (grupoDe(GRUPOS_RECEPCION, estado));
}

/**
 * El tablero solo para ver de Recepciones: una columna por grupo, con la clave de grupoRecepcion. La de trabajo se
 * titula «Por contar» (spec KANBAN-logistica 5, con su acción «Contar y confirmar»); Confirmadas y Canceladas, como las
 * pestañas (RP41, D6), van plegadas. Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_RECEPCION = congelar([
  columna('por_confirmar', 'Por contar', 'amber', GRUPOS_RECEPCION.por_confirmar),
  columna('confirmadas', 'Confirmadas', 'emerald', GRUPOS_RECEPCION.confirmadas, true),
  columna('canceladas', 'Canceladas', 'rose', GRUPOS_RECEPCION.canceladas, true),
]);

// ─── Recepciones: la lista y el tablero solo para ver (B4 T16A: TABLA-compras punto 9, KANBAN-logistica punto 5) ────

/**
 * Las vistas de GET /compras/recepciones (RP41): las claves de GRUPOS_RECEPCION y 'todas' (los cuatro estados). Las
 * pestañas Por confirmar · Confirmadas · Canceladas · Todas. Inmutable.
 * @type {Readonly<Record<'por_confirmar' | 'confirmadas' | 'canceladas' | 'todas', ReadonlyArray<string>>>}
 */
export const VISTAS_RECEPCION = congelar({
  ...GRUPOS_RECEPCION,
  todas: Object.values(GRUPOS_RECEPCION).flat(),
});

/**
 * La insignia de un estado de recepción (ESTADOS_RECEPCION); uno desconocido sale humanizado en gris, nunca el código.
 * @param {unknown} e
 * @returns {Readonly<InfoEstado>}
 */
export function infoEstadoRecepcion(e) {
  return infoDe(ESTADOS_RECEPCION, e);
}

const OPCION_DE_RECEPCION = congelar(Object.fromEntries(
  Object.entries(ESTADOS_RECEPCION).map(([valor, info]) => [valor, { valor, etiqueta: info.label }]),
));
const OPCIONES_DE_VISTA_RECEPCION = congelar(Object.fromEntries(
  Object.entries(VISTAS_RECEPCION).map(([vista, estados]) => [vista, congelar(estados.map((e) => OPCION_DE_RECEPCION[e]))]),
));

/**
 * «Filtrar estado» de la lista de Recepciones: los estados de la pestaña `vista` con su etiqueta; sin pestaña, o una que
 * no existe, los 4. La misma referencia para la misma vista. Inmutable.
 * @param {unknown} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosRecepcion(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_DE_VISTA_RECEPCION, vista)
    ? OPCIONES_DE_VISTA_RECEPCION[vista]
    : OPCIONES_DE_VISTA_RECEPCION.todas;
}

/**
 * «Filtrar estado» en el tablero de Recepciones: una opción por columna, con su estado principal y el título de la
 * columna (estadosDeColumnaLista la convierte en la columna entera). Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_RECEPCION = congelar(COLUMNAS_RECEPCION.map((c) => ({ valor: c.estados[0], etiqueta: c.titulo })));

/**
 * La consulta de una columna del tablero de Recepciones en modo servidor (la query de GET /compras/recepciones): SIN vista,
 * paso ni semáforo (Recepciones no tiene), los estados de la columna cruzados con el filtro de la pantalla
 * (estadosDeColumnaLista), la búsqueda del MISMO estado, y el orden, el límite y el desplazamiento de la columna (el
 * límite 0 de una plegada lo pone el hook). Sin estados en común, null: la columna queda vacía sin pedir.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {{orden?: string | null, limit?: number, offset?: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaRecepcion(estado, columna, { orden, limit, offset }) {
  const estados = estadosDeColumnaLista(columna, estado?.estados);
  if (estados.length === 0) return null;
  return queryListado(estado, { vista: null, semaforo: null, paso: null, estados, orden, limit, offset });
}

/** El número de la recepción (en blanco no vale); sin él, ENINV-id. Una sola regla para la tabla, el Drawer y el tablero. */
export function numeroRecepcion(r) {
  return textoLimpio(r?.numero) ?? `ENINV-${r?.id ?? ''}`;
}
/** Una entrada manual: sin número de PEC y sin id de PEC (decide el DATO, no el texto que se muestra). */
export function esEntradaManual(r) {
  return textoLimpio(r?.pec_numero) === null && !r?.pec_id;
}
/** El PEC de origen: su número, PEC-id, o 'Entrada manual' (una entrada sin pedido de compra). */
export function pecDeRecepcion(r) {
  return textoLimpio(r?.pec_numero) ?? (r?.pec_id ? `PEC-${r.pec_id}` : 'Entrada manual');
}
/** El proveedor de la recepción; sin él, 'Sin proveedor'. */
export function proveedorDeRecepcion(r) {
  return textoLimpio(r?.supplier_name) ?? textoLimpio(r?.proveedor_nombre) ?? 'Sin proveedor';
}
/** Una recepción por confirmar (BORRADOR): la única que se cuenta y se confirma (grupoRecepcion, R9). */
export function esRecepcionPorConfirmar(r) {
  return grupoRecepcion(typeof r?.estado === 'string' ? r.estado.trim() : r?.estado) === 'por_confirmar';
}

/**
 * B4 T24 r1 (m15): si una recarga del conteo vuelve a llenar las líneas con lo del servidor. La completa (al abrir), sí; la silenciosa
 * (tras guardar el conteo, o tras un error que pide recargar: recargarTrasError, también un 422), solo si la recepción ya no está por
 * confirmar (otro la confirmó o la canceló). Mientras siga en BORRADOR, las líneas y las «Observaciones Físicas» escritas (que no se
 * guardan) quedan como están.
 * @param {{silencioso?: boolean, recepcion: unknown}} entrada
 * @returns {boolean}
 */
export function recargaReponeLineas({ silencioso = false, recepcion }) {
  return !silencioso || !esRecepcionPorConfirmar(recepcion);
}

/**
 * B4 T24 f3 (F79): el pie de la tarjeta de una bodega en la vista Almacenes del Hub de Inventario. Con referencias en riesgo, cuántas
 * (singular y plural); sin ninguna, la etiqueta de ESTADOS_STOCK.abastecido (RP53: sin variantes locales), salvo que la consulta se
 * haya recortado (`recortado`: más de TOPE_TABLERO_COMPRAS filas): ahí no se afirma nada de lo que no se cargó.
 * @param {unknown} enRiesgo
 * @param {{recortado?: boolean}} [opciones]
 * @returns {{texto: string, alerta: boolean}}
 */
export function textoPieBodega(enRiesgo, { recortado = false } = {}) {
  const n = numeroFinito(enRiesgo) ?? 0;
  if (n > 0) return { texto: `${formatoEntero(n)} bajo el mínimo o ${n === 1 ? 'agotada' : 'agotadas'}`, alerta: true };
  if (recortado) return { texto: `Sin alertas en las ${TOPE_TABLERO_COMPRAS} cargadas`, alerta: false };
  // r1 (m41): una bodega no está «Bien abastecido» (la etiqueta de una referencia): «Sin alertas», como la variante recortada.
  return { texto: 'Sin alertas', alerta: false };
}

/**
 * B4 T24 f3 r1 (m14 = m23, F86 completo): qué filtros de la barra del Hub de Inventario aplican en la vista que se ve. En Almacenes la
 * consulta no lleva la bodega (F86: se ven todas), así que el selector «Bodega» no se muestra (se dice que ahí se ven todas), el vacío
 * no la nombra y «Quitar filtros» solo cuenta la categoría.
 * @param {{verAlmacenes: boolean, bodega: string, categoria: string}} entrada
 * @returns {{mostrarBodega: boolean, bodegaAplica: boolean, hayFiltros: boolean}}
 */
export function filtrosAplicadosHub({ verAlmacenes, bodega, categoria }) {
  const bodegaAplica = !verAlmacenes && Boolean(bodega);
  return { mostrarBodega: !verAlmacenes, bodegaAplica, hayFiltros: bodegaAplica || Boolean(categoria) };
}

/**
 * B4 T24 f3 (F87-f): las categorías del selector del Hub de Inventario (GET /categories, ya ordenado por nombre en el servidor, F87-b),
 * con las que son padre de otra marcadas «X (categoría padre)»: el filtro es por la categoría exacta del producto (P25 decide si
 * incluye las hijas), así que elegir una padre puede dejar la tabla vacía. No muta lo que recibe; null sigue null.
 * @template {{id?: unknown, name?: unknown, parent_id?: unknown}} C
 * @param {ReadonlyArray<C> | null | undefined} categorias
 * @returns {C[] | null}
 */
export function marcarCategoriasPadre(categorias) {
  if (!Array.isArray(categorias)) return null;
  const padres = new Set(categorias.map((c) => c?.parent_id).filter((id) => id != null).map(String));
  return categorias.map((c) => (c && padres.has(String(c.id)) ? { ...c, name: `${c.name} (categoría padre)` } : c));
}

/**
 * B4 T24 f3 (FINAL-m12): el aviso de la recepción en el panel de un PEC (Compras › Pedidos) y adónde lleva su botón:
 *  - en bodega (columnaPec 'en_bodega': RECIBIDO o PARCIALMENTE_RECIBIDA, lo mismo que el tablero muestra con «Recepcionar»): si hay
 *    una recepción por confirmar (BORRADOR, esRecepcionPorConfirmar), «Ver recepción» la abre; si no, «Hacer recepción» crea la del
 *    resto (POST /pedidos/{id}/recepcionar): nunca abre una recepción ya confirmada;
 *  - recibido (RECIBIDA o COMPLETADO) con recepciones: «Ver recepción» abre la última (como hoy: el camino de vuelta desde el PEC);
 *  - otro estado: null (sin aviso).
 * `accion.tipo` es 'abrir' (con el id) o 'crear'.
 * @param {any} pec
 * @returns {{titulo: string, texto: string, accion: {tipo: 'abrir', id: number, texto: string} | {tipo: 'crear', texto: string}} | null}
 */
export function avisoRecepcionPec(pec, { recepcionar = true } = {}) {
  const columna = columnaPec(pec?.estado);
  const recepciones = Array.isArray(pec?.recepciones) ? pec.recepciones.filter((r) => r?.id != null) : [];
  if (columna === 'en_bodega') {
    const porConfirmar = [...recepciones].reverse().find((r) => esRecepcionPorConfirmar(r));
    if (porConfirmar) {
      return { titulo: 'Mercancía recibida en bodega', texto: `Recepción ${numeroRecepcion(porConfirmar)} en curso.`,
        accion: { tipo: 'abrir', id: porConfirmar.id, texto: 'Ver recepción' } };
    }
    const parcial = String(pec?.estado ?? '').trim() === 'PARCIALMENTE_RECIBIDA';
    // r1 (m20, aditivo): sin el permiso de recepcionar (ADMIN y COMPRAS), un texto informativo, sin empujar a una acción que no tiene.
    const texto = !recepcionar
      ? (parcial ? 'Falta recibir el resto: la recepción la abre Compras.' : 'Falta la recepción: la abre Compras.')
      : parcial ? 'Falta por recibir: inicia la recepción de lo que falta.' : 'Inicia el conteo físico de este pedido.';
    return {
      titulo: parcial ? 'Mercancía recibida en parte' : 'Mercancía recibida en bodega, pendiente de recepción',
      texto,
      accion: { tipo: 'crear', texto: 'Hacer recepción' },
    };
  }
  if (columna === 'recibido' && recepciones.length > 0) {
    const ultima = recepciones[recepciones.length - 1];
    return { titulo: 'Mercancía recibida en bodega', texto: `Recepción ${numeroRecepcion(ultima)}.`,
      accion: { tipo: 'abrir', id: ultima.id, texto: 'Ver recepción' } };
  }
  return null;
}

/**
 * B4 T24 f3 (F64): después de un DELETE de PEC que falló, qué hace el panel: un 404 (el PEC ya no existe: lo borró otro) cierra el
 * panel y recarga la lista; con la regla única (recargarTrasError: 400, 409, 422 o la red) se recarga lo que se ve; lo demás, nada.
 * @param {unknown} err
 * @returns {'cerrar' | 'recargar' | null}
 */
export function despuesDeEliminarPec(err) {
  if (/** @type {{status?: unknown}} */ (err)?.status === 404) return 'cerrar';
  return recargarTrasError(err) ? 'recargar' : null;
}

/**
 * B4 T24 f3 (FINAL-C7-f): el vínculo de los PVEN en el alta de un PEC (POST /compras/pedidos; create_pec con FINAL-C7-b): `ven_ids`
 * con TODOS los elegidos (el servidor los vincula en el mismo commit y responde 409 en español si alguno no está en PENDIENTE_COMPRA o
 * ya tiene PEC), `ven_id` = el primero (como hoy) y `ven_numero` solo el del primero (la columna es VARCHAR(20): una lista unida por
 * comas no cabe). Sin PVEN: ven_id y ven_numero en null, sin ven_ids. Antes el alta mandaba solo el primero y un PATCH
 * /ventas/pedidos/{id} por cada otro, que COMPRAS no tiene (403): esos PVEN quedaban sin PEC.
 * @param {unknown} pvens
 * @returns {{ven_id: number | null, ven_numero: string | null, ven_ids?: number[]}}
 */
export function vinculoPvenDelPec(pvens) {
  const lista = (Array.isArray(pvens) ? pvens : []).filter((p) => p?.id != null);
  if (lista.length === 0) return { ven_id: null, ven_numero: null };
  return { ven_id: lista[0].id, ven_ids: lista.map((p) => p.id), ven_numero: textoLimpio(lista[0].numero) };
}

/**
 * B4 T24 f3 r1 (m18, m31, m25, m36): la lectura de una carga con vuelta ({vuelta, error} de la última que llegó; `vuelta` es la que se
 * acaba de pedir): `cargando` mientras no llega la de esta vuelta; `error` el de la última que llegó (se conserva mientras se reintenta,
 * para que el aviso siga montado y el foco no caiga al <body>); `reintentando` si hay un error y otra vuelta en camino; `ofrecer` si
 * «Reintentar» sirve (un 403 no). La usan los PVEN del panel del Hub (F57) y el enlace de Productos (B40-f).
 * @param {{vuelta: number, error: unknown} | null | undefined} carga
 * @param {number} vuelta
 * @returns {{cargando: boolean, error: unknown, reintentando: boolean, ofrecer: boolean}}
 */
export function estadoReintento(carga, vuelta) {
  const cargando = carga?.vuelta !== vuelta;
  const error = carga?.error ?? null;
  return { cargando, error, reintentando: cargando && error != null, ofrecer: error != null && ofreceReintentar(error) };
}

/**
 * B4 T24 f3 r1 (m22): el conteo por línea, en serie (PATCH /compras/recepciones/{id}/lineas/{grl_id}): manda una petición tras otra y se
 * DETIENE en la primera que falla (las que siguen no salen). Devuelve cuántas quedaron guardadas y, si una falló, cuál y su error, para
 * que el aviso diga qué línea falló y que las anteriores ya se guardaron.
 * @param {ReadonlyArray<{grl_id: unknown, cuerpo: unknown}>} peticiones
 * @param {(p: {grl_id: unknown, cuerpo: unknown}) => Promise<unknown>} enviar
 * @returns {Promise<{guardadas: number, fallo: {grl_id: unknown, error: unknown} | null}>}
 */
export async function guardarConteoEnSerie(peticiones, enviar) {
  let guardadas = 0;
  for (const p of Array.isArray(peticiones) ? peticiones : []) {
    try {
      await enviar(p);
    } catch (error) {
      return { guardadas, fallo: { grl_id: p.grl_id, error } };
    }
    guardadas += 1;
  }
  return { guardadas, fallo: null };
}

/**
 * B4 T24 f3 r1 (m22): el texto con que se avisa un conteo que falló a medias: la línea que falló y, si antes se guardaron otras, que ya
 * quedaron guardadas (el detalle del servidor lo añade textoDeError).
 * @param {string | null | undefined} nombre
 * @param {number} guardadas
 * @returns {string}
 */
export function textoFalloConteo(nombre, guardadas) {
  const linea = textoLimpio(nombre) ? `la línea «${textoLimpio(nombre)}»` : 'una línea';
  const antes = guardadas > 0 ? `; ${guardadas === 1 ? 'la anterior quedó guardada' : `las ${guardadas} anteriores quedaron guardadas`}` : '';
  return `No se pudo guardar ${linea}${antes}`;
}

/**
 * B4 T24 f3 r1 (m18, B40-f): el efecto del enlace ?id= / ?sku= de Inventario › Productos, en la lib: pide el producto si
 * pedirEnlaceProducto lo manda; la marca (`marca.current`) se pone SOLO cuando la respuesta llegó (un montaje abortado deja la marca
 * libre). Al llegar: `alError(null)` y abre el producto o avisa que no está; si falla (no un abort): `alError(err)` (la página lo
 * muestra con «Reintentar»). Devuelve la limpieza (aborta).
 * @param {{marca: {current: string | null}, idDeLaUrl: string | null, skuDeLaUrl: string | null,
 *   pedir: (ruta: string, op: {signal: AbortSignal}) => Promise<unknown>, abrir: (fila: any) => void, avisar: (texto: string) => void,
 *   alError: (err: unknown) => void}} entrada
 * @returns {() => void}
 */
export function abrirEnlaceProducto({ marca, idDeLaUrl, skuDeLaUrl, pedir, abrir, avisar, alError }) {
  const pedido = pedirEnlaceProducto(marca.current, idDeLaUrl, skuDeLaUrl);
  if (pedido === null) return () => {};
  const control = new AbortController();
  pedir(pedido.ruta, { signal: control.signal })
    .then((r) => {
      if (control.signal.aborted) return;
      const llegada = llegadaEnlaceProducto(pedido, normalizarRespuesta(r).filas);
      marca.current = llegada.marca;
      alError(null);
      if (llegada.abrir) abrir(llegada.abrir);
      else avisar(llegada.texto ?? 'No se encontró el producto.');
    })
    .catch((err) => { if (!control.signal.aborted) alError(err); });
  return () => control.abort();
}

/**
 * B4 T24 f3 r1 (C2): la selección de PVEN que sigue valiendo para el alta de un PEC (NuevoPecModal y «Crear PEC Consolidado» del Hub).
 * Después de un 409 (otro usuario consolidó o canceló uno de los elegidos), la recarga lo saca de la lista (que solo muestra los
 * PENDIENTE_COMPRA) pero seguía en la selección, en el contador y en ven_ids: cada «Crear» repetía el mismo 409. Quedan solo los ids
 * que siguen en PENDIENTE_COMPRA en `pedidosVenta`, en el orden de la selección (`ids` y sus `pvens`); `quitados` son los números de
 * los demás (o «PVEN #id» si ya no vienen), para avisar cuál se quitó.
 * @param {Iterable<number> | null | undefined} seleccion
 * @param {unknown} pedidosVenta
 * @returns {{ids: number[], pvens: any[], quitados: string[]}}
 */
export function seleccionVigente(seleccion, pedidosVenta) {
  const porId = new Map((Array.isArray(pedidosVenta) ? pedidosVenta : []).filter((p) => p?.id != null).map((p) => [p.id, p]));
  /** @type {{ids: number[], pvens: any[], quitados: string[]}} */
  const vigente = { ids: [], pvens: [], quitados: [] };
  for (const id of seleccion ?? []) {
    const p = porId.get(id);
    if (p && String(p.estado ?? '').trim() === 'PENDIENTE_COMPRA') { vigente.ids.push(id); vigente.pvens.push(p); }
    else vigente.quitados.push(textoLimpio(p?.numero) ?? `PVEN #${id}`);
  }
  return vigente;
}

/**
 * B4 T24 f3 r1 (C2): el aviso de los PVEN que seleccionVigente quitó (ya no están pendientes de compra), o null.
 * @param {string[]} quitados
 * @returns {string | null}
 */
export function avisoSeleccionQuitada(quitados) {
  if (!Array.isArray(quitados) || quitados.length === 0) return null;
  return quitados.length === 1
    ? `${quitados[0]} ya no está pendiente de compra: se quitó de la selección.`
    : `${quitados.join(', ')} ya no están pendientes de compra: se quitaron de la selección.`;
}

/**
 * B4 T24 f3 (FINAL-C4-f; m16 del backend r1): el tope de una cantidad del conteo por línea. update_grl acepta un entero de 0 a
 * 99.999.999 (sale de Numeric(10, 2) de la columna); 2.5 da 422.
 */
export const MAX_CANTIDAD_CONTEO = 99999999;

/**
 * B4 T24 f3 (FINAL-C4-f): la cantidad recibida que se escribe en el conteo, leída SIN truncar (antes parseInt: «2.5» pasaba como 2 en
 * silencio). Vacío, 0 (el campo vacío es «nada contado»); lo demás, Number tal cual (errorCantidadConteo lo valida antes de mandar).
 * @param {unknown} texto
 * @returns {number}
 */
export function leerCantidadConteo(texto) {
  const t = String(texto ?? '').trim();
  return t === '' ? 0 : Number(t);
}

/**
 * B4 T24 f3 (FINAL-C4-f): el aviso en español de una cantidad del conteo que el servidor no acepta (un entero de 0 a 99.999.999), o
 * null si vale.
 * @param {unknown} n
 * @param {string} nombre
 * @returns {string | null}
 */
export function errorCantidadConteo(n, nombre) {
  if (typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= MAX_CANTIDAD_CONTEO) return null;
  return `La cantidad recibida de «${nombre}» debe ser un número entero entre 0 y 99.999.999.`;
}

/**
 * B4 T24 f3 (FINAL-C4-f, ruling 5): una recepción heredada, sin GRL: alguna de sus líneas no trae grl_id, así que el PATCH por línea
 * no la alcanza.
 * @param {unknown} lineas
 * @returns {boolean}
 */
export function esConteoHeredado(lineas) {
  return Array.isArray(lineas) && lineas.some((l) => l?.grl_id == null);
}

/**
 * B4 T24 f3 r1 (C1 y la heredada, m19): lo que confirmarRecepcion (roles.js) necesita de una fila de GET /compras/recepciones (o del
 * detalle), con la MISMA regla en todas las pantallas: si está por confirmar, si es heredada (esConteoHeredado de sus productos, que
 * _gr_dict trae con grl_id) y si le falta la bodega receptora (sin warehouse_id).
 * @param {any} r
 * @returns {{porConfirmar: boolean, heredada: boolean, sinBodega: boolean}}
 */
export function datosConfirmacion(r) {
  return { porConfirmar: esRecepcionPorConfirmar(r), heredada: esConteoHeredado(r?.productos), sinBodega: r?.warehouse_id == null || r.warehouse_id === '' };
}

/**
 * B4 T24 f3 r1 (C1, la raíz): la bodega receptora que va al crear una recepción («Recepcionar PEC» y «Hacer recepción»; el servidor ya
 * acepta body.warehouse_id). `elegida` es lo que el usuario eligió (null: no tocó el select). Sin elegir, se preselecciona la única
 * bodega si hay una sola (GET /inventory/warehouses no tiene «activa»: todas lo son); si hay varias o ninguna, '' (opcional: el PEC
 * puede traer la suya).
 * @param {string | null | undefined} elegida
 * @param {unknown} bodegas
 * @returns {string}
 */
export function bodegaRecepcion(elegida, bodegas) {
  if (elegida != null) return String(elegida);
  const lista = Array.isArray(bodegas) ? bodegas.filter((b) => b?.id != null) : [];
  return lista.length === 1 ? String(lista[0].id) : '';
}

/**
 * B4 T24 f3 r1 (C1, la raíz): el cuerpo de POST /compras/pedidos/{id}/recepcionar. `warehouse_id` solo con una bodega elegida (un
 * entero positivo); sin ella, el servidor usa la del PEC.
 * @param {{creadoPor: string, notas?: string, bodega?: string}} entrada
 * @returns {{created_by: string, force_full: false, notas?: string, warehouse_id?: number}}
 */
export function cuerpoRecepcionarPec({ creadoPor, notas, bodega }) {
  /** @type {{created_by: string, force_full: false, notas?: string, warehouse_id?: number}} */
  const cuerpo = { created_by: creadoPor, force_full: false };
  if (notas) cuerpo.notas = notas;
  const id = Number(bodega);
  if (bodega !== '' && bodega != null && Number.isInteger(id) && id > 0) cuerpo.warehouse_id = id;
  return cuerpo;
}

/**
 * B4 T24 f3 (FINAL-C4-f, ruling 5): el conteo con el PATCH por línea (PATCH /compras/recepciones/{id}/lineas/{grl_id}, que BODEGA
 * tiene): una petición por línea cambiada frente a lo que dice el servidor (`servidor`: d.productos, que update_grl regenera desde C4-b).
 * El cuerpo deja la línea como la dejaba el PATCH en lote: la recibida (un entero) y rechazadas y cuarentena en 0 (el lote las ponía en 0
 * si no venían). Cambiada: la recibida es otra (una del servidor sin contar, null, cuenta aunque la de la pantalla sea 0: el lote la
 * dejaba en 0 explícito y la confirmación exige un número), o rechazadas o cuarentena no están en 0. Las líneas sin grl_id (una
 * heredada) no van. Antes de mandar nada se valida cada cantidad: con la primera que no vale, {error} con su aviso y ninguna petición.
 * @param {unknown} servidor
 * @param {unknown} locales
 * @returns {{error: string | null, peticiones: {grl_id: number, cuerpo: {quantity_received: number, quantity_rejected: 0, quantity_quarantine: 0}}[]}}
 */
export function peticionesConteo(servidor, locales) {
  const previas = new Map((Array.isArray(servidor) ? servidor : []).map((p) => [p?.grl_id, p]));
  const peticiones = [];
  for (const l of Array.isArray(locales) ? locales : []) {
    const n = l?.qty_recibida ?? 0;
    const error = errorCantidadConteo(n, textoLimpio(l?.nombre) ?? 'la línea');
    if (error) return { error, peticiones: [] };
    if (l?.grl_id == null) continue;
    const p = previas.get(l.grl_id);
    const igual = p != null && p.qty_recibida != null && Number(p.qty_recibida) === n
      && !(Number(p.qty_rechazada) > 0) && !(Number(p.qty_cuarentena) > 0);
    if (!igual) peticiones.push({ grl_id: l.grl_id, cuerpo: { quantity_received: n, quantity_rejected: 0, quantity_quarantine: 0 } });
  }
  return { error: null, peticiones };
}

/**
 * La tarjeta de una recepción en el tablero solo para ver (la forma de DatosTarjetaKanban): el número (sin él, ENINV-id),
 * el proveedor (o 'Sin proveedor'), el PEC de origen (o 'Entrada manual'), la insignia del estado, el chip «Retraso N
 * días» (dias_retraso de _gr_dict, solo si es mayor que 0), la bodega y el día (fecha de recepción o de creación) y, en
 * «Por contar», la acción «Contar y confirmar» hacia el conteo. B4 T24 f3 (FINAL-C4-f): con `{contar: false}` (aditivo: el rol no
 * cuenta, accesoRecepciones), sin esa acción; la tarjeta queda en «Abrir» (el Drawer, con «Abrir conteo»).
 * @param {any} r
 * @param {{contar?: boolean}} [opciones]
 * @returns {{numero: string, tipo: 'ENINV', titulo: string, subtitulo: string, monto: null, estado: Readonly<InfoEstado>,
 *   chips: {texto: string, tono: string}[], tiempo: string, atrasada: boolean,
 *   accionPrincipal: {texto: string, href: string, tono: string} | null}}
 */
export function tarjetaRecepcion(r, { contar = true } = {}) {
  const retraso = numeroFinito(r?.dias_retraso);
  const atrasada = retraso !== null && retraso > 0;
  const dia = fechaCorta(r?.fecha_recepcion || r?.created_at);
  const bodega = textoLimpio(r?.warehouse_name) ?? 'Sin bodega';
  const porContar = esRecepcionPorConfirmar(r);
  return {
    numero: numeroRecepcion(r),
    tipo: 'ENINV',
    titulo: proveedorDeRecepcion(r),
    subtitulo: pecDeRecepcion(r),
    monto: null,
    estado: infoEstadoRecepcion(r?.estado),
    chips: atrasada ? [{ texto: `Retraso ${retraso} ${retraso === 1 ? 'día' : 'días'}`, tono: 'rose' }] : [],
    tiempo: dia ? `${bodega} · ${dia}` : bodega,
    atrasada,
    accionPrincipal: porContar && contar && r?.id != null
      ? { texto: 'Contar y confirmar', href: `/dashboard/compras/recepciones/${r.id}`, tono: 'teal' }
      : null,
  };
}

/**
 * Lo que dice la tabla de Recepciones cuando no hay filas, según lo que la deja vacía: un filtro de estados, una
 * búsqueda o la pestaña (por confirmar, confirmadas, canceladas o cualquier otra).
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioRecepciones(estado) {
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ninguna recepción con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: 'Ajusta la búsqueda o el filtro de estados.' };
  if (estado?.vista === 'por_confirmar') {
    return { titulo: 'No hay recepciones por confirmar', ayuda: 'Las nuevas aparecen aquí hasta que se cuentan y se confirman.' };
  }
  if (estado?.vista === 'confirmadas') return { titulo: 'Aún no hay recepciones confirmadas', ayuda: null };
  if (estado?.vista === 'canceladas') return { titulo: 'No hay recepciones canceladas', ayuda: null };
  return { titulo: 'No hay recepciones en esta vista', ayuda: 'Usa «Recepcionar PEC» para iniciar la entrada física de un pedido.' };
}

// ─── Ítems de la lista de compras ───────────────────────────────────────────────

/**
 * Los estados de un ítem de la lista de compras que se muestran (ESTADOS_ITEM_LISTA del backend). DESCARTADO (el ítem de
 * un pedido de venta cancelado) no se muestra: no está aquí. Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstado>>>}
 */
export const ESTADOS_ITEM_LISTA = congelar({
  PENDIENTE: { label: 'Pendiente', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  EN_PEDIDO: { label: 'En pedido', clases: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' } },
  RECIBIDO: { label: 'Recibido', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } },
});

/**
 * El tablero solo para ver de la Lista de compras: una columna por estado (la clave es el estado). Recibido, plegada.
 * Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_LISTA = congelar([
  columna('PENDIENTE', 'Pendiente', 'amber', ['PENDIENTE']),
  columna('EN_PEDIDO', 'En pedido', 'blue', ['EN_PEDIDO']),
  columna('RECIBIDO', 'Recibido', 'emerald', ['RECIBIDO'], true),
]);

// ─── Traslados y operaciones de inventario ──────────────────────────────────────

/**
 * Los estados de un traslado (InventoryOperation). Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstado>>>}
 */
export const ESTADOS_TRASLADO = congelar({
  DRAFT: { label: 'Borrador', clases: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-200' } },
  READY: { label: 'Listo', clases: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-200' } },
  DONE: { label: 'Hecho', clases: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-200' } },
  CANCELLED: { label: 'Cancelado', clases: { bg: 'bg-red-100', text: 'text-red-700', border: 'border-red-200' } },
});

/**
 * El tablero solo para ver de Traslados: una columna por estado (la clave es el estado). Hecho y Cancelado, plegadas.
 * Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_TRASLADO = congelar([
  columna('DRAFT', 'Borrador', 'slate', ['DRAFT']),
  columna('READY', 'Listo', 'blue', ['READY']),
  columna('DONE', 'Hecho', 'emerald', ['DONE'], true),
  columna('CANCELLED', 'Cancelado', 'rose', ['CANCELLED'], true),
]);

/**
 * Grupos de una operación de inventario (R9): en proceso, completadas y canceladas. Inmutable.
 * @type {Readonly<Record<'en_proceso' | 'completadas' | 'canceladas', ReadonlyArray<string>>>}
 */
export const GRUPOS_OPERACION = congelar({
  en_proceso: ['DRAFT', 'READY'],
  completadas: ['DONE'],
  canceladas: ['CANCELLED'],
});

/**
 * 'en_proceso', 'completadas' o 'canceladas' para el estado de una operación de inventario; null si no está
 * (grupo_operacion).
 * @param {unknown} estado
 * @returns {'en_proceso' | 'completadas' | 'canceladas' | null}
 */
export function grupoOperacion(estado) {
  return /** @type {any} */ (grupoDe(GRUPOS_OPERACION, estado));
}

// ─── La Lista de compras: la lista y el tablero solo para ver (B4 T16B: TABLA-compras punto 10, KANBAN-logistica punto 5) ────

/**
 * Los estados que pide una lista con pestañas (Lista de compras y Traslados) al servidor: los de la pestaña cruzados con el
 * filtro de «Filtrar estado»; sin filtro, los de la pestaña (o ninguno si es «todos»: el servidor ya excluye lo que no se
 * muestra). Un filtro que la pestaña no tiene no se puede armar desde la barra (accionPestana lo poda); si llega de una
 * sesión restaurada, gana el filtro, para que lo que se pide sea lo que FiltroEstados muestra.
 * @param {ReadonlyArray<string> | undefined} deLaVista  los estados de la pestaña; undefined si no existe (cuenta como «todos»)
 * @param {boolean} esTodos
 * @param {ReadonlyArray<string> | null | undefined} filtro
 * @returns {string[] | null}
 */
function estadosDeLaConsulta(deLaVista, esTodos, filtro) {
  const elegidos = Array.isArray(filtro) ? filtro : [];
  if (elegidos.length === 0) return esTodos || !deLaVista ? null : [...deLaVista];
  const cruce = deLaVista ? elegidos.filter((e) => deLaVista.includes(e)) : [];
  return cruce.length > 0 ? cruce : [...elegidos];
}

/**
 * Las vistas (pestañas) de la Lista de compras: las claves de los conteos de GET /compras/lista-compras (todos y cada
 * estado que se muestra). DESCARTADO no está. Inmutable.
 * @type {Readonly<Record<'todos' | 'PENDIENTE' | 'EN_PEDIDO' | 'RECIBIDO', ReadonlyArray<string>>>}
 */
export const VISTAS_LISTA = congelar({
  todos: Object.keys(ESTADOS_ITEM_LISTA),
  ...Object.fromEntries(Object.keys(ESTADOS_ITEM_LISTA).map((e) => [e, [e]])),
});

/**
 * La insignia de un estado de la Lista de compras (ESTADOS_ITEM_LISTA); uno desconocido sale humanizado en gris.
 * @param {unknown} e
 * @returns {Readonly<InfoEstado>}
 */
export function infoEstadoItemLista(e) {
  return infoDe(ESTADOS_ITEM_LISTA, e);
}

const OPCION_DE_ITEM_LISTA = congelar(Object.fromEntries(
  Object.entries(ESTADOS_ITEM_LISTA).map(([valor, info]) => [valor, { valor, etiqueta: info.label }]),
));
const OPCIONES_DE_VISTA_LISTA = congelar(Object.fromEntries(
  Object.entries(VISTAS_LISTA).map(([vista, estados]) => [vista, congelar(estados.map((e) => OPCION_DE_ITEM_LISTA[e]))]),
));

/**
 * «Filtrar estado» de la Lista de compras: los estados de la pestaña `vista`; sin pestaña, o una que no existe, los 3. La
 * misma referencia para la misma vista. Inmutable.
 * @param {unknown} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosLista(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_DE_VISTA_LISTA, vista) ? OPCIONES_DE_VISTA_LISTA[vista] : OPCIONES_DE_VISTA_LISTA.todos;
}

/**
 * «Filtrar estado» en el tablero de la Lista de compras: una opción por columna. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_LISTA = congelar(COLUMNAS_LISTA.map((c) => ({ valor: c.estados[0], etiqueta: c.titulo })));

/** El texto de un filtro extra, recortado; en blanco, null (queryListado lo omite). */
const filtroDeTexto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
/** Los filtros extra de la Lista de compras que no son del estado de la tabla: proveedor y rango de fechas (días de calendario). */
function filtrosExtraLista(filtros) {
  return {
    proveedor: filtroDeTexto(filtros?.proveedor),
    fecha_desde: filtroDeTexto(filtros?.desde),
    fecha_hasta: filtroDeTexto(filtros?.hasta),
  };
}

/**
 * Lo que la TABLA de la Lista de compras le suma a la consulta de useListado (`extra`): GET /compras/lista-compras no tiene
 * `vista`, así que la pestaña viaja como `estados` (cruzada con el filtro, estadosDeLaConsulta), más el proveedor y las
 * fechas de los filtros extra de la barra. Las claves en null no se mandan.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{proveedor?: string | null, desde?: string | null, hasta?: string | null} | null} [filtros]
 * @returns {{vista: null, estados: string[] | null, proveedor: string | null, fecha_desde: string | null, fecha_hasta: string | null}}
 */
export function consultaLista(estado, filtros = null) {
  const vista = typeof estado?.vista === 'string' && tiene(VISTAS_LISTA, estado.vista) ? estado.vista : 'todos';
  return { vista: null, estados: estadosDeLaConsulta(VISTAS_LISTA[vista], vista === 'todos', estado?.estados), ...filtrosExtraLista(filtros) };
}

/** El tope del tablero en modo cliente (C4, RP95): los 200 más recientes. */
export const TOPE_TABLERO_COMPRAS = 200;

/**
 * Lo que el TABLERO de la Lista de compras (modo cliente) le suma a la consulta: los 200 más recientes de la primera página,
 * sin pestaña (el tablero trae las tres columnas), con el filtro de estados, el proveedor y las fechas.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{proveedor?: string | null, desde?: string | null, hasta?: string | null} | null} [filtros]
 */
export function consultaTableroLista(estado, filtros = null) {
  const elegidos = Array.isArray(estado?.estados) && estado.estados.length > 0 ? [...estado.estados] : null;
  return { vista: null, estados: elegidos, ...filtrosExtraLista(filtros), orden: '-fecha', limit: TOPE_TABLERO_COMPRAS, offset: 0 };
}

/** Solo los ítems PENDIENTE se seleccionan para armar un pedido de compra (TABLA-compras punto 10). */
export function esItemSeleccionable(it) {
  return it?.estado === 'PENDIENTE';
}

/**
 * A dónde lleva un ítem de la Lista (el clic de su tarjeta): el PEC vinculado y, sin PEC, el PVEN; sin ninguno, null.
 * @param {any} it
 * @returns {string | null}
 */
export function destinoItemLista(it) {
  if (it?.pec_id) return `/dashboard/compras/pedidos?id=${it.pec_id}`;
  if (it?.pven_id) return `/dashboard/ventas/venta?id=${it.pven_id}`;
  return null;
}

/** '3 uds' o '1 ud'. */
const textoUnidades = (n) => {
  const cantidad = numeroFinito(n);
  return cantidad === null ? null : `${cantidad} ${cantidad === 1 ? 'ud' : 'uds'}`;
};

/**
 * La tarjeta de un ítem en el tablero solo para ver: el PVEN (o el PEC; sin ninguno, «Ítem id»), el producto, la cantidad y
 * el proveedor, la insignia del estado, el PEC vinculado como chip, el día en que se agregó y, si hay a dónde ir, el enlace
 * al pedido de compra o al de venta.
 * @param {any} it
 */
export function tarjetaItemLista(it) {
  const pven = textoLimpio(it?.pven_numero);
  const pec = textoLimpio(it?.pec_numero);
  const destino = destinoItemLista(it);
  const aPec = Boolean(it?.pec_id);
  return {
    numero: pven ?? pec ?? `Ítem ${it?.id ?? ''}`.trim(),
    tipo: pven ? 'PVEN' : pec ? 'PEC' : null,
    titulo: textoLimpio(it?.producto) ?? 'Producto sin nombre',
    subtitulo: [textoUnidades(it?.cantidad), textoLimpio(it?.proveedor) ?? 'Sin proveedor'].filter(Boolean).join(' · '),
    monto: null,
    estado: infoEstadoItemLista(it?.estado),
    chips: pec ? [{ texto: pec, tono: 'purple' }] : [],
    tiempo: fechaCorta(it?.fecha) || null,
    atrasada: false,
    accionPrincipal: destino
      ? { texto: aPec ? 'Ver pedido de compra' : 'Ver pedido de venta', href: destino, tono: aPec ? 'purple' : 'emerald' }
      : null,
  };
}

/** Lo que dice la lista cuando no hay filas: depende de qué la deja vacía (filtro, búsqueda, proveedor o fechas, pestaña). */
const AYUDA_FILTROS_LISTA = 'Ajusta la búsqueda, el proveedor, las fechas o el filtro de estados.';
/**
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @param {{proveedor?: string | null, desde?: string | null, hasta?: string | null} | null} [filtros]
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioLista(estado, filtros = null) {
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ningún ítem con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: AYUDA_FILTROS_LISTA };
  const extra = filtrosExtraLista(filtros);
  if (extra.proveedor || extra.fecha_desde || extra.fecha_hasta) return { titulo: 'Sin resultados con esos filtros', ayuda: AYUDA_FILTROS_LISTA };
  if (estado?.vista === 'PENDIENTE') {
    return { titulo: 'No hay ítems pendientes de compra', ayuda: 'Los productos llegan desde los pedidos de venta en «Pendiente de compra».' };
  }
  if (estado?.vista === 'EN_PEDIDO') return { titulo: 'No hay ítems en pedido', ayuda: null };
  if (estado?.vista === 'RECIBIDO') return { titulo: 'Aún no hay ítems recibidos', ayuda: null };
  return { titulo: 'No hay productos en la lista', ayuda: 'Los productos se agregan desde los pedidos de venta en «Pendiente de compra».' };
}

// ─── Traslados: la lista y el tablero solo para ver (B4 T16B: TABLA-compras punto 11, KANBAN-logistica punto 5) ────

/**
 * Las vistas (pestañas) de Traslados: los grupos de operación (R9: en proceso, completadas y canceladas) y «todos». Inmutable.
 * @type {Readonly<Record<'en_proceso' | 'completadas' | 'canceladas' | 'todos', ReadonlyArray<string>>>}
 */
export const VISTAS_TRASLADO = congelar({
  ...GRUPOS_OPERACION,
  todos: Object.values(GRUPOS_OPERACION).flat(),
});

/**
 * Los conteos de cada pestaña de Traslados con los de GET /inventory/operations?con_conteos=1 ({todos, DRAFT, READY, DONE,
 * CANCELLED}); lo que no llega (o no es un número) queda en null: la barra gris, nunca 0.
 * @param {any} conteos
 * @returns {{en_proceso: number | null, completadas: number | null, canceladas: number | null, todos: number | null}}
 */
export function conteosTraslado(conteos) {
  const c = conteos !== null && typeof conteos === 'object' && !Array.isArray(conteos) ? conteos : {};
  const suma = (estados) => {
    const partes = estados.map((e) => numeroFinito(c[e]));
    return partes.every((p) => p !== null) ? partes.reduce((a, b) => a + b, 0) : null;
  };
  return {
    en_proceso: suma(GRUPOS_OPERACION.en_proceso),
    completadas: suma(GRUPOS_OPERACION.completadas),
    canceladas: suma(GRUPOS_OPERACION.canceladas),
    todos: numeroFinito(c.todos),
  };
}

/**
 * La insignia de un estado de traslado (ESTADOS_TRASLADO); uno desconocido sale humanizado en gris.
 * @param {unknown} e
 * @returns {Readonly<InfoEstado>}
 */
export function infoEstadoTraslado(e) {
  return infoDe(ESTADOS_TRASLADO, e);
}

const OPCION_DE_TRASLADO = congelar(Object.fromEntries(
  Object.entries(ESTADOS_TRASLADO).map(([valor, info]) => [valor, { valor, etiqueta: info.label }]),
));
const OPCIONES_DE_VISTA_TRASLADO = congelar(Object.fromEntries(
  Object.entries(VISTAS_TRASLADO).map(([vista, estados]) => [vista, congelar(estados.map((e) => OPCION_DE_TRASLADO[e]))]),
));

/**
 * «Filtrar estado» de Traslados: los estados de la pestaña `vista`; sin pestaña, o una que no existe, los 4. La misma
 * referencia para la misma vista. Inmutable.
 * @param {unknown} vista
 * @returns {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export function opcionesEstadosTraslado(vista) {
  return typeof vista === 'string' && tiene(OPCIONES_DE_VISTA_TRASLADO, vista) ? OPCIONES_DE_VISTA_TRASLADO[vista] : OPCIONES_DE_VISTA_TRASLADO.todos;
}

/**
 * «Filtrar estado» en el tablero de Traslados: una opción por columna. Inmutable.
 * @type {ReadonlyArray<Readonly<{valor: string, etiqueta: string}>>}
 */
export const OPCIONES_ESTADOS_TABLERO_TRASLADO = congelar(COLUMNAS_TRASLADO.map((c) => ({ valor: c.estados[0], etiqueta: c.titulo })));

/**
 * Lo que la TABLA de Traslados le suma a la consulta de useListado (`extra`): solo traslados (operation_type) y, como
 * GET /inventory/operations filtra con `status` (no con `estados` ni `vista`), la pestaña cruzada con el filtro.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @returns {{operation_type: 'TRANSFER', vista: null, estados: null, status: string[] | null}}
 */
export function consultaTraslados(estado) {
  const vista = typeof estado?.vista === 'string' && tiene(VISTAS_TRASLADO, estado.vista) ? estado.vista : 'todos';
  return { operation_type: 'TRANSFER', vista: null, estados: null, status: estadosDeLaConsulta(VISTAS_TRASLADO[vista], vista === 'todos', estado?.estados) };
}

/**
 * Lo que el TABLERO de Traslados (modo cliente) le suma a la consulta: los 200 más recientes de la primera página, sin
 * pestaña (el tablero trae las cuatro columnas) y con el filtro de estados.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 */
export function consultaTableroTraslados(estado) {
  const elegidos = Array.isArray(estado?.estados) && estado.estados.length > 0 ? [...estado.estados] : null;
  return { operation_type: 'TRANSFER', vista: null, estados: null, status: elegidos, orden: '-fecha', limit: TOPE_TABLERO_COMPRAS, offset: 0 };
}

/** TRL-0012: el número de un traslado (el id con al menos 4 cifras, como _numero_operacion del servidor). */
export function numeroTraslado(t) {
  return `TRL-${String(t?.id ?? '').padStart(4, '0')}`;
}

/** Los productos de un traslado: sus salidas (cada producto tiene su salida y su entrada); sin dirección, cada movimiento. */
export function productosDeTraslado(t) {
  const movimientos = Array.isArray(t?.movements) ? t.movements : [];
  return movimientos.filter((m) => m?.direction !== 'TRANSFER_IN').length;
}

/** La fecha REAL del traslado (`fecha`: el primer movimiento, un instante): su día en Colombia; sin movimientos, '—'. */
export function textoFechaTraslado(t) {
  return fechaCorta(t?.fecha) || '—';
}

/** El nombre de una bodega; sin id, '—'; si la lista no la trae, 'Bodega #id'. */
export function nombreBodega(bodegas, id) {
  if (!id) return '—';
  const bodega = Array.isArray(bodegas) ? bodegas.find((b) => b?.id === id) : null;
  return textoLimpio(bodega?.name) ?? `Bodega #${id}`;
}

/**
 * La tarjeta de un traslado en el tablero solo para ver: el número, origen → destino, cuántos productos, la insignia del
 * estado, la guía si la tiene y la fecha real.
 * @param {any} t
 * @param {ReadonlyArray<{id: number, name?: string | null}> | null | undefined} bodegas
 */
export function tarjetaTraslado(t, bodegas) {
  const n = productosDeTraslado(t);
  const guia = textoLimpio(t?.tracking_number);
  return {
    numero: numeroTraslado(t),
    tipo: 'TRL',
    titulo: `${nombreBodega(bodegas, t?.source_warehouse_id)} → ${nombreBodega(bodegas, t?.dest_warehouse_id)}`,
    subtitulo: textoProductos(n),
    monto: null,
    estado: infoEstadoTraslado(t?.status),
    chips: guia ? [{ texto: `Guía ${guia}`, tono: 'slate' }] : [],
    tiempo: fechaCorta(t?.fecha) || null,
    atrasada: false,
    accionPrincipal: null,
  };
}

/**
 * Lo que dice la tabla de Traslados cuando no hay filas.
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioTraslados(estado) {
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ningún traslado con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: 'Ajusta la búsqueda o el filtro de estados.' };
  if (estado?.vista === 'en_proceso') return { titulo: 'No hay traslados en proceso', ayuda: 'Crea un traslado para mover mercancía entre bodegas.' };
  if (estado?.vista === 'completadas') return { titulo: 'Aún no hay traslados completados', ayuda: null };
  if (estado?.vista === 'canceladas') return { titulo: 'No hay traslados cancelados', ayuda: null };
  return { titulo: 'Sin traslados internos registrados', ayuda: 'Crea un traslado para mover mercancía entre bodegas.' };
}

// ─── T16B r1: aviso de los 200, textos y el enlace ?id= de Traslados ────────────────

/**
 * m5: la frase única del tablero en modo cliente cuando la consulta (de a lo sumo 200 filas) tiene más (RP95). null si no hay más
 * de 200 o el total no es un número.
 * @param {unknown} total
 * @param {string} nombre  lo que se cuenta, en plural ('ítems', 'pedidos', 'traslados')
 * @returns {string | null}
 */
export function avisoTope200(total, nombre) {
  const n = numeroFinito(total);
  if (n === null || n <= TOPE_TABLERO_COMPRAS) return null;
  return `Se muestran los ${TOPE_TABLERO_COMPRAS} más recientes de ${formatoEntero(n)} ${nombre}. Busca o filtra para ver el resto.`;
}

/** '1 producto', '2 productos' (la tabla, la tarjeta y el Drawer dicen lo mismo). */
export function textoProductos(n) {
  return `${n} ${n === 1 ? 'producto' : 'productos'}`;
}

/**
 * m13: de la respuesta de `q=TRL-0012` (que también encuentra notas y documentos) la fila cuyo número es EXACTAMENTE el pedido.
 * @param {ReadonlyArray<any> | null | undefined} filas
 * @param {number} id
 */
export function filaDelEnlaceTraslado(filas, id) {
  const pedido = numeroTraslado({ id });
  return (Array.isArray(filas) ? filas : []).find((t) => numeroTraslado(t) === pedido) ?? null;
}

/**
 * I3 e I5: ¿hay que pedir el traslado del ?id=? `marca` es el id ya atendido (la respuesta llegó), no el que se pidió: un fetch
 * abortado deja la marca como estaba y el siguiente render vuelve a pedir. Devuelve el id (entero positivo) o null.
 * @param {string | null} marca
 * @param {string | null | undefined} idDeLaUrl
 * @returns {number | null}
 */
export function pedirEnlaceTraslado(marca, idDeLaUrl) {
  if (typeof idDeLaUrl !== 'string' || !/^\d+$/.test(idDeLaUrl)) return null;
  const id = Number(idDeLaUrl);
  // B4 T24 f3 (F73): la marca es String(id) (llegadaEnlaceTraslado): se compara con el id leído, no con el texto crudo (?id=063).
  if (!Number.isInteger(id) || id <= 0 || marca === String(id)) return null;
  return id;
}

/**
 * Llegó la respuesta del traslado `id`: abre la fila exacta; si no existe avisa UNA vez. En los dos casos la marca queda en ese id
 * (no se vuelve a pedir ni a avisar).
 * @param {number} id
 * @param {ReadonlyArray<any> | null | undefined} filas
 * @returns {{marca: string, abrir: any | null, avisar: boolean}}
 */
export function llegadaEnlaceTraslado(id, filas) {
  const abrir = filaDelEnlaceTraslado(filas, id);
  return { marca: String(id), abrir, avisar: abrir === null };
}

/**
 * B4 T24 f3 r1 (F69, la Recomendación: el efecto baja a la lib, junto con F73 y F74-f): el enlace ?id= de Compras › Traslados. Pide el
 * traslado por su id exacto (F74-b) si pedirEnlaceTraslado lo manda; la marca (`marca.current`) se pone SOLO cuando la respuesta llegó
 * (llegadaEnlaceTraslado), nunca antes del fetch ni al limpiar: un montaje abortado (el doble montaje de React) deja la marca como
 * estaba y el siguiente vuelve a pedir. Devuelve la limpieza (aborta). `pedir` es apiFetch (con `signal`).
 * @param {{marca: {current: string | null}, idDeLaUrl: string | null | undefined, pedir: (ruta: string, op: {signal: AbortSignal}) => Promise<unknown>,
 *   abrir: (fila: any) => void, avisar: (texto: string) => void, avisarError: (err: unknown) => void}} entrada
 * @returns {() => void}
 */
export function abrirEnlaceTraslado({ marca, idDeLaUrl, pedir, abrir, avisar, avisarError }) {
  const id = pedirEnlaceTraslado(marca.current, idDeLaUrl);
  if (id === null) return () => {};
  const control = new AbortController();
  pedir(`/inventory/operations?operation_type=TRANSFER&id=${id}&limit=5`, { signal: control.signal })
    .then((r) => {
      if (control.signal.aborted) return;
      const llegada = llegadaEnlaceTraslado(id, normalizarRespuesta(r).filas);
      marca.current = llegada.marca;
      if (llegada.abrir) abrir(llegada.abrir);
      if (llegada.avisar) avisar(`No se encontró el traslado ${numeroTraslado({ id })}.`);
    })
    .catch((err) => { if (!control.signal.aborted) avisarError(err); });
  return () => control.abort();
}

// ─── Estado del stock (RP53) ────────────────────────────────────────────────────

/**
 * El estado del stock de una referencia (las claves de ESTADOS_STOCK de core/existencias.py), con su etiqueta, su tono
 * (el de Badge, components/ui/colors.ts) y sus clases. Lo usan Stock y Abastecimiento (T17, T18). Inmutable.
 * @type {Readonly<Record<'agotado' | 'bajo_minimo' | 'abastecido', Readonly<{label: string, tono: string, clases: ClasesEstado}>>>}
 */
export const ESTADOS_STOCK = congelar({
  agotado: { label: 'Agotado', tono: 'danger', clases: { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' } },
  bajo_minimo: { label: 'Bajo el mínimo', tono: 'warning', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  abastecido: { label: 'Bien abastecido', tono: 'success', clases: { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' } },
});

/**
 * El tablero solo para ver de Stock y Abastecimiento (R11): Agotado · Bajo el mínimo · Bien abastecido, con la columna
 * estado_stock de cada fila. Nada plegado. Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_STOCK = congelar([
  columna('agotado', ESTADOS_STOCK.agotado.label, 'rose', ['agotado']),
  columna('bajo_minimo', ESTADOS_STOCK.bajo_minimo.label, 'amber', ['bajo_minimo']),
  columna('abastecido', ESTADOS_STOCK.abastecido.label, 'emerald', ['abastecido']),
]);

// ─── B4 T18: Stock, Abastecimiento, Kardex y Productos (TABLA-inventario 5 a 8, KANBAN-resto; R10, R11, RP47 a RP49, RP53, RP54) ───

/** R11: el motivo del tablero solo para ver de Stock y de Abastecimiento. */
export const TEXTO_SOLO_VER_STOCK = 'Este tablero es para ver: el nivel de stock sale de las existencias de cada bodega y no se cambia arrastrando tarjetas.';
/** RP54: el motivo del tablero del Kardex, palabra por palabra. */
export const TEXTO_SOLO_VER_KARDEX = 'Este tablero es para ver: los movimientos en cuarentena o sin dirección solo salen en la lista.';
/** R11: el motivo del tablero de Productos. */
export const TEXTO_SOLO_VER_PRODUCTOS = 'Este tablero es para ver: la categoría de un producto se cambia en su ficha.';

/**
 * Las pestañas de Stock y su parámetro de GET /inventory/stock-tabla, que no tiene `vista` (extraPorVista de tabla.js): el
 * estado del stock (RP53). «Todos» no filtra. Inmutable.
 * @type {Readonly<Record<'todos' | 'agotado' | 'bajo_minimo' | 'abastecido', Readonly<Record<string, unknown>>>>}
 */
export const VISTAS_STOCK = congelar({
  todos: {},
  agotado: { estado_stock: 'agotado' },
  bajo_minimo: { estado_stock: 'bajo_minimo' },
  abastecido: { estado_stock: 'abastecido' },
});

/** Las pestañas de Abastecimiento (RP53): las de Stock sin «Todos». Inmutable. */
export const VISTAS_ABASTECIMIENTO = congelar({
  agotado: VISTAS_STOCK.agotado,
  bajo_minimo: VISTAS_STOCK.bajo_minimo,
  abastecido: VISTAS_STOCK.abastecido,
});

const objetoPlano = (v) => (esObjeto(v) && !Array.isArray(v) ? v : null);

/**
 * La alerta de agotados de Abastecimiento: qué dice según el estado de las tarjetas (estadoKpi de /inventory/stats) y el número
 * de agotados. 'cargando' mientras llegan; 'sin_dato' si fallaron (aunque haya un número viejo: no se afirma nada) o no trajeron
 * el número; 'hay' con más de 0 y 'ninguno' con 0. Los cuatro estados ocupan el MISMO alto en la pantalla: la alerta no empuja la
 * página al llegar (CLS).
 * @param {unknown} estadoKpi
 * @param {unknown} agotados
 * @returns {'cargando' | 'sin_dato' | 'hay' | 'ninguno'}
 */
export function estadoAlertaAgotados(estadoKpi, agotados) {
  if (estadoKpi === 'cargando') return 'cargando';
  const n = numeroFinito(agotados);
  if (estadoKpi === 'error' || n === null) return 'sin_dato';
  return n > 0 ? 'hay' : 'ninguno';
}

/**
 * Las pestañas de Stock (con «Todos») y de Abastecimiento (`conTodos: false`) con los `conteos` de stock-tabla
 * (con_conteos=1: todos, agotados, bajo_minimo, abastecidos). Cada una lee SU conteo; el que no llega (cargando o con
 * error) queda en null (la barra gris, nunca 0). Agotado y Bajo el mínimo van en alerta si hay alguna.
 * @param {unknown} conteos
 * @param {{conTodos?: boolean}} [opciones]
 * @returns {{id: string, etiqueta: string, conteo: number | null, alerta: boolean}[]}
 */
export function pestanasExistencias(conteos, { conTodos = true } = {}) {
  const c = objetoPlano(conteos) ?? {};
  const pestana = (id, etiqueta, clave, alertar) => {
    const conteo = numeroFinito(c[clave]);
    return { id, etiqueta, conteo, alerta: alertar && (conteo ?? 0) > 0 };
  };
  return [
    ...(conTodos ? [pestana('todos', 'Todos', 'todos', false)] : []),
    pestana('agotado', ESTADOS_STOCK.agotado.label, 'agotados', true),
    pestana('bajo_minimo', ESTADOS_STOCK.bajo_minimo.label, 'bajo_minimo', true),
    pestana('abastecido', ESTADOS_STOCK.abastecido.label, 'abastecidos', false),
  ];
}

/**
 * La consulta de una columna del tablero de Stock y de Abastecimiento en modo servidor (la query de GET
 * /inventory/stock-tabla): el estado de la columna (estado_stock), la búsqueda y el orden del MISMO estado, `fijos` (por=sku,
 * la categoría…) y el límite y el desplazamiento de la columna (el 0 de una plegada lo pone el hook). Sin vista ni estados
 * (stock-tabla no los tiene). NO recibe el `orden` del hook ('sin_movimiento' o 'reciente'): stock-tabla responde 422 a un
 * orden de tiempo. Una columna que no es un estado del stock, null.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {Record<string, unknown> | null | undefined} fijos
 * @param {{limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaStock(estado, columna, fijos, { limit, offset }) {
  const clave = columna?.estados?.[0];
  if (typeof clave !== 'string' || !tiene(ESTADOS_STOCK, clave)) return null;
  return queryListado(estado, {
    ...(objetoPlano(fijos) ?? {}),
    vista: null, semaforo: null, paso: null, estados: null,
    estado_stock: clave, limit, offset,
  });
}

/**
 * BASE mostraba «Reservado» (T18 r1, m24): una existencia con unidades en bodega y NADA disponible, porque todo está comprometido.
 * Su estado de stock es «agotado»; esta marca dice que no es lo mismo que una referencia sin unidades.
 * @param {any} f
 * @returns {boolean}
 */
export function existenciaReservada(f) {
  const fisico = numeroFinito(f?.fisico);
  const disponible = numeroFinito(f?.disponible);
  return fisico !== null && fisico > 0 && disponible === 0;
}

const TONO_CHIP_STOCK = congelar({ agotado: 'rose', bajo_minimo: 'amber', abastecido: 'emerald' });

/**
 * La tarjeta de una existencia (una fila de stock-tabla) en el tablero solo para ver: el SKU, el producto, la categoría (y
 * la bodega si la fila es por bodega), la insignia del estado (ESTADOS_STOCK), Disponible · Físico · En tránsito (o el
 * mínimo si nada viene en camino) y las reservas. Una referencia sin control de inventario lo dice.
 * @param {any} f
 */
export function tarjetaExistencia(f) {
  const estado = typeof f?.estado_stock === 'string' && tiene(ESTADOS_STOCK, f.estado_stock) ? f.estado_stock : null;
  const transito = numeroFinito(f?.en_transito);
  const reservado = numeroFinito(f?.reservado);
  const tercero = transito !== null && transito > 0
    ? { texto: `En tránsito ${formatoDecimal(transito)}`, tono: 'blue' }
    : { texto: `Mínimo ${formatoDecimal(f?.minimo)}`, tono: 'slate' };
  return {
    numero: textoLimpio(f?.sku) ?? `SKU #${f?.sku_id ?? ''}`,
    tipo: null,
    titulo: textoLimpio(f?.producto) ?? 'Sin nombre',
    subtitulo: [textoLimpio(f?.categoria), textoLimpio(f?.bodega)].filter(Boolean).join(' · ') || null,
    monto: null,
    estado: estado ? { label: ESTADOS_STOCK[estado].label, clases: ESTADOS_STOCK[estado].clases } : null,
    chips: [
      { texto: `Disponible ${formatoDecimal(f?.disponible)}`, tono: estado ? TONO_CHIP_STOCK[estado] : 'slate' },
      { texto: `Físico ${formatoDecimal(f?.fisico)}`, tono: 'slate' },
      tercero,
    ],
    tiempo: f?.rastrear_inventario === false
      ? 'Sin control de inventario'
      : reservado !== null && reservado > 0 ? `Reservado ${formatoDecimal(reservado)}` : null,
    atrasada: false,
    accionPrincipal: null,
  };
}

// ─── Kardex ───

const CLASES_VERDE = { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' };
const CLASES_ROJO = { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' };
const CLASES_AZUL = { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' };
const CLASES_AMBAR = { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' };
const CLASES_MORADO = { bg: 'bg-purple-50', text: 'text-purple-700', border: 'border-purple-200' };

/**
 * Las direcciones de un movimiento del Kardex (las que escribe el sistema: DIRECCIONES_KARDEX de analisis_inventario.py),
 * con su etiqueta, su signo ('+' entra, '-' sale, '' ninguno) y sus clases. La distinción de color entre IN/OUT normales
 * y los ajustes es a propósito (ámbar = un ajuste manual). Inmutable.
 * @type {Readonly<Record<string, Readonly<{label: string, signo: '+' | '-' | '', clases: ClasesEstado}>>>}
 */
export const DIRECCIONES_KARDEX = congelar({
  IN: { label: 'Entrada', signo: '+', clases: CLASES_VERDE },
  OUT: { label: 'Salida', signo: '-', clases: CLASES_ROJO },
  TRANSFER_IN: { label: 'Traslado (entra)', signo: '+', clases: CLASES_AZUL },
  TRANSFER_OUT: { label: 'Traslado (sale)', signo: '-', clases: CLASES_AZUL },
  ADJUST_IN: { label: 'Ajuste (entrada)', signo: '+', clases: CLASES_AMBAR },
  ADJUST_OUT: { label: 'Ajuste (salida)', signo: '-', clases: CLASES_AMBAR },
  QUARANTINE: { label: 'Cuarentena', signo: '', clases: CLASES_MORADO },
  SCRAP: { label: 'Pérdida o destrucción', signo: '-', clases: CLASES_ROJO },
  RETURN_IN: { label: 'Devolución de cliente', signo: '+', clases: CLASES_VERDE },
});

const SIN_DIRECCION = congelar({ label: 'Sin dirección', signo: '', clases: { ...GRIS } });

/**
 * La etiqueta, el signo y las clases de la dirección de un movimiento. Sin dirección (un movimiento puede no tenerla),
 * «Sin dirección»; una desconocida sale humanizada en gris, nunca el código.
 * @param {unknown} d
 * @returns {Readonly<{label: string, signo: '+' | '-' | '', clases: ClasesEstado}>}
 */
export function infoDireccionKardex(d) {
  const codigo = typeof d === 'string' ? d.trim() : '';
  if (codigo === '') return SIN_DIRECCION;
  if (tiene(DIRECCIONES_KARDEX, codigo)) return DIRECCIONES_KARDEX[codigo];
  return congelar({ label: humanizarCodigo(codigo), signo: '', clases: { ...GRIS } });
}

/**
 * El tablero solo para ver del Kardex (R11, RP54): Entradas = IN, ADJUST_IN, TRANSFER_IN · Salidas = OUT, ADJUST_OUT,
 * TRANSFER_OUT. La cuarentena, la pérdida, la devolución y los movimientos sin dirección solo salen en la lista.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_KARDEX = congelar([
  columna('entradas', 'Entradas', 'emerald', ['IN', 'ADJUST_IN', 'TRANSFER_IN']),
  columna('salidas', 'Salidas', 'rose', ['OUT', 'ADJUST_OUT', 'TRANSFER_OUT']),
]);

/**
 * B4 T24 f3 r1 (C3, m31): las teclas del autocompletar del SKU del Kardex (role combobox). `indice` es la opción con el foco (-1: el
 * campo) y `total` las opciones que hay. Devuelve si la lista queda abierta y adónde va el foco (-1: el campo; si no, esa opción), o
 * null si la tecla no le toca:
 *  - Esc con la lista abierta la cierra y el foco vuelve al campo (antes, con el foco en una opción, caía en <body>);
 *  - ↓ con la lista cerrada la abre (el foco sigue en el campo); abierta, baja una opción (de la última no pasa);
 *  - ↑ desde la primera opción vuelve al campo; desde el campo no hace nada.
 * Al elegir (Enter o clic) el foco vuelve al campo (la página). El clic con el ratón no cierra la lista antes de elegir: la lista
 * evita el mousedown (Safari y Firefox de macOS no enfocan el botón al hacer clic y el blur llegaba con relatedTarget null).
 * @param {{tecla: string, abierta: boolean, indice: number, total: number}} entrada
 * @returns {{abierta: boolean, foco: number} | null}
 */
export function teclaComboboxSku({ tecla, abierta, indice, total }) {
  if (tecla === 'Escape') return abierta ? { abierta: false, foco: -1 } : null;
  if (tecla === 'ArrowDown') {
    if (!abierta) return { abierta: true, foco: -1 };
    return total > 0 ? { abierta: true, foco: Math.min(Math.max(indice, -1) + 1, total - 1) } : null;
  }
  if (tecla === 'ArrowUp') return abierta && indice >= 0 ? { abierta: true, foco: indice - 1 } : null;
  return null;
}

/**
 * B4 T24 f3 r1 (C3): al salir del autocompletar (el blur del contenedor), se cierra la lista si el foco no va a algo de adentro (fuera,
 * o null: un clic en la página). Un clic en la lista no saca el foco del campo (la lista evita el mousedown), así que no llega aquí.
 * @param {boolean} focoVaDentro
 * @returns {boolean}
 */
export function cierraComboboxAlSalir(focoVaDentro) {
  return !focoVaDentro;
}

/**
 * Los filtros extra de la barra del Kardex como parámetros de GET /inventory/kardex (sku_id, warehouse_id, owner,
 * direction, start_date y end_date). Lo vacío no se manda. B4 T24 f3 (A3-f): Desde y Hasta van tal como los elige el usuario
 * (AAAA-MM-DD, el día de Colombia): desde A3-b, get_kardex los compara con las 00:00 de Colombia (_inicio_del_dia_co), el mismo
 * día que muestra la tabla.
 * @param {{skuId?: number | null, bodega?: string, propietario?: string, direccion?: string, desde?: string, hasta?: string} | null | undefined} filtros
 * @returns {Record<string, unknown>}
 */
export function extraKardex(filtros) {
  const f = objetoPlano(filtros) ?? {};
  return {
    sku_id: f.skuId ? f.skuId : null,
    warehouse_id: f.bodega || null,
    owner: f.propietario || null,
    direction: f.direccion || null,
    start_date: f.desde || null,
    end_date: f.hasta || null,
  };
}

/**
 * Las direcciones que pide una columna del tablero: las suyas, o solo la que eligió el filtro «Dirección» si es una de
 * ellas (el servidor las lee en mayúsculas); vacío si la dirección elegida no es de la columna (la columna queda vacía sin
 * pedir).
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {unknown} elegida
 * @returns {string[]}
 */
export function direccionesDeColumnaKardex(columna, elegida) {
  const propias = Array.isArray(columna?.estados) ? columna.estados : [];
  const d = typeof elegida === 'string' ? elegida.trim().toUpperCase() : '';
  return d === '' ? [...propias] : propias.filter((x) => x === d);
}

/**
 * La consulta de una columna del tablero del Kardex en modo servidor: sus direcciones en CSV (direction) cruzadas con el filtro
 * de la barra, más los demás filtros. Sin q, orden, vista ni estados (el Kardex no los tiene; ordena siempre por fecha). Su
 * `limit` es de 1 como mínimo: get_kardex tiene limit >= 1, y una columna plegada (limit 0) daría 400 (el manejador global). Sin direcciones en común,
 * null: la columna queda vacía sin pedir.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {Parameters<typeof extraKardex>[0]} filtros
 * @param {{limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaKardex(estado, columna, filtros, { limit, offset }) {
  const direcciones = direccionesDeColumnaKardex(columna, filtros?.direccion);
  if (direcciones.length === 0) return null;
  return queryListado(estado, {
    ...extraKardex(filtros),
    vista: null, semaforo: null, paso: null, q: null, estados: null, orden: null,
    direction: direcciones, limit: Math.max(1, Number(limit) || 1), offset,
  });
}

/**
 * Los tipos de operación de un movimiento (OPERATION_TYPES de models/inventory.py y las que escribe el sistema), con su etiqueta
 * en español (T18 r1, m14: nunca «RECEIPT»). Inmutable.
 */
export const ETIQUETAS_OPERACION = congelar({
  RECEIPT: 'Recepción', DELIVERY: 'Entrega', TRANSFER: 'Traslado', PHYSICAL_INVENTORY: 'Inventario físico', ADJUSTMENT: 'Ajuste',
  LOGISTIC_EVENT: 'Evento logístico', SCRAP: 'Pérdida o destrucción',
});
/** La etiqueta de un tipo de operación; uno desconocido sale humanizado, nunca el código. */
export function etiquetaOperacion(tipo) {
  const t = textoLimpio(tipo);
  return t !== null && tiene(ETIQUETAS_OPERACION, t) ? ETIQUETAS_OPERACION[t] : humanizarCodigo(t);
}
/** El propietario de un movimiento: «Nebulae», «Mau» (como el filtro) o, sin dato, «Nebulae» (como la tabla de hoy). */
export function etiquetaPropietario(owner) {
  const o = textoLimpio(owner)?.toUpperCase() ?? 'NEBULAE';
  return o === 'NEBULAE' ? 'Nebulae' : o === 'MAU' ? 'Mau' : humanizarCodigo(o);
}

/** El número de un movimiento: su documento de origen, o «Recepción n.º 9» (la etiqueta del tipo y la operación), o «Movimiento n.º id». */
export function numeroMovimiento(m) {
  const documento = textoLimpio(m?.source_document_numero);
  if (documento) return documento;
  const tipo = textoLimpio(m?.operation_type);
  if (tipo && m?.operation_id !== null && m?.operation_id !== undefined) return `${etiquetaOperacion(tipo)} n.º ${m.operation_id}`;
  return `Movimiento n.º ${m?.id ?? ''}`;
}

/**
 * El día y la hora de un movimiento (created_at: un instante UTC sin zona) en Colombia: {dia: '3 oct 2026', hora: '10:00 p. m.'} (horaCO, la regla única de fechas-colombia.js);
 * lo que no se puede leer, {dia: '—', hora: ''}.
 * @param {unknown} iso
 * @returns {{dia: string, hora: string}}
 */
export function textoFechaMovimiento(iso) {
  const fecha = instante(iso);
  if (!fecha) return { dia: '—', hora: '' };
  return { dia: fechaCorta(fecha), hora: horaCO(fecha) };
}

/**
 * La tarjeta de un movimiento en el tablero solo para ver: el documento de origen, el producto, el SKU y la bodega, la
 * insignia de la dirección, la cantidad con su signo, el propietario y el día y la hora.
 * @param {any} m
 */
export function tarjetaMovimiento(m) {
  const info = infoDireccionKardex(m?.direction);
  const cantidad = numeroFinito(m?.quantity);
  const sku = textoLimpio(m?.sku);
  const fecha = textoFechaMovimiento(m?.created_at);
  return {
    numero: numeroMovimiento(m),
    tipo: null,
    titulo: textoLimpio(m?.product_name) ?? sku ?? `SKU #${m?.sku_id ?? ''}`,
    subtitulo: [sku, textoLimpio(m?.warehouse_name)].filter(Boolean).join(' · ') || null,
    monto: null,
    estado: { label: info.label, clases: info.clases },
    chips: [
      { texto: cantidad === null ? '—' : `${info.signo}${formatoDecimal(Math.abs(cantidad))}`, tono: info.signo === '+' ? 'emerald' : info.signo === '-' ? 'rose' : 'amber' },
      { texto: etiquetaPropietario(m?.owner), tono: 'slate' },
    ],
    tiempo: fecha.hora ? `${fecha.dia} · ${fecha.hora}` : null,
    atrasada: false,
    accionPrincipal: null,
  };
}

/**
 * Lo que dice la tabla del Kardex cuando no hay filas: con filtros (el SKU, la bodega, el propietario, la dirección o las
 * fechas) o sin ninguno.
 * @param {boolean} hayFiltros
 * @returns {{titulo: string, ayuda: string}}
 */
export function textoVacioKardex(hayFiltros) {
  return hayFiltros
    ? { titulo: 'Ningún movimiento coincide con esos filtros.', ayuda: 'Quita algún filtro o amplía las fechas.' }
    : { titulo: 'Todavía no hay movimientos en el Kardex.', ayuda: 'Se registran al recibir, despachar, trasladar o ajustar inventario.' };
}

// ─── Productos ───

/** R11: el tablero de Productos tiene a lo sumo 12 columnas; el resto de las categorías se ve en la lista. */
export const MAX_COLUMNAS_PRODUCTOS = 12;
const TONOS_PRODUCTOS = congelar(['indigo', 'emerald', 'amber', 'sky', 'rose', 'purple', 'teal', 'orange', 'blue', 'lime', 'pink', 'cyan']);

/**
 * Las columnas del tablero de Productos: una por categoría de GET /categories, por nombre (en español), a lo sumo `max`.
 * `masCategorias` cuenta las que no caben y `aviso` es «N categorías más: usa la lista» (null si caben todas). Una fila sin
 * un id entero positivo, o con un id repetido, no es una columna; sin nombre, «Sin nombre».
 * @param {unknown} categorias
 * @param {number} [max]
 * @returns {{columnas: Columna[], masCategorias: number, aviso: string | null}}
 */
export function columnasProductos(categorias, max = MAX_COLUMNAS_PRODUCTOS) {
  const vistas = new Set();
  const lista = [];
  for (const c of Array.isArray(categorias) ? categorias : []) {
    if (!esObjeto(c) || !Number.isInteger(c.id) || c.id <= 0 || vistas.has(c.id)) continue;
    vistas.add(c.id);
    lista.push({ id: c.id, nombre: textoLimpio(c.name) ?? 'Sin nombre' });
  }
  lista.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es') || a.id - b.id);
  const { visibles, mas, aviso } = recortarColumnas(lista, max);
  return {
    columnas: visibles.map((c, i) => columna(`cat-${c.id}`, c.nombre, TONOS_PRODUCTOS[i % TONOS_PRODUCTOS.length], [String(c.id)])),
    masCategorias: mas,
    aviso,
  };
}

/**
 * Los filtros extra de la barra de Productos (B3-T8, RP48; T18 r1, m4) como parámetros de GET /products: necesita_revision,
 * sin_tarifa_iva y category_id (la categoría elegida, el id como texto). Apagado = no se manda (sin_tarifa_iva=false pediría
 * los que SÍ tienen tarifa).
 * @param {{revision?: boolean, sinTarifa?: boolean, categoria?: string} | null | undefined} filtros
 * @returns {{necesita_revision: true | null, sin_tarifa_iva: true | null, category_id: string | null}}
 */
export function extraProductos(filtros) {
  const f = objetoPlano(filtros) ?? {};
  return { necesita_revision: f.revision ? true : null, sin_tarifa_iva: f.sinTarifa ? true : null, category_id: textoLimpio(f.categoria) };
}

/**
 * La consulta de una columna del tablero de Productos en modo servidor (la query de GET /products): la categoría de la
 * columna, la búsqueda (q) y el orden del MISMO estado, los filtros de la barra, y SIEMPRE limit y offset (sin offset,
 * /products devuelve todo: RP47). Sin vista ni estados. NO recibe el `orden` del hook ('sin_movimiento' o 'reciente'):
 * /products responde 422 a un orden de tiempo. Una columna que no es una categoría, null.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {Parameters<typeof extraProductos>[0]} filtros
 * @param {{limit: number, offset: number}} consulta
 * @returns {string | null}
 */
export function consultaColumnaProducto(estado, columna, filtros, { limit, offset }) {
  const clave = columna?.estados?.[0];
  if (typeof clave !== 'string' || !/^[1-9]\d*$/.test(clave)) return null;
  // Con una categoría elegida en la barra, solo su columna trae productos: las demás quedan vacías sin pedir.
  const elegida = textoLimpio(objetoPlano(filtros)?.categoria);
  if (elegida !== null && elegida !== clave) return null;
  return queryListado(estado, {
    ...extraProductos(filtros),
    vista: null, semaforo: null, paso: null, estados: null,
    category_id: Number(clave), limit, offset,
  });
}

/** El precio de venta de un producto (precio_venta de GET /products: el menor de sus SKU); sin precio, null. */
export function precioDeProducto(p) {
  const n = numeroFinito(p?.precio_venta);
  return n !== null && n > 0 ? n : null;
}

/** El costo de un producto (costo de GET /products); 0 (el de quick-create) o menor es «sin costo», como en existencias (RP91). */
export function costoDeProducto(p) {
  const n = numeroFinito(p?.costo);
  return n !== null && n > 0 ? n : null;
}

const CLASES_ACTIVO = congelar({ bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' });
const CLASES_INACTIVO = congelar({ bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' });

/**
 * La tarjeta de un producto en el tablero solo para ver: el primer SKU (o PRD-id), el nombre, la categoría, la insignia
 * Activo o Inactivo, la revisión pendiente, la tarifa de IVA (ámbar si no tiene), si está publicado, y el precio y el costo.
 * @param {any} p
 */
export function tarjetaProducto(p) {
  const primerSku = Array.isArray(p?.skus) ? textoLimpio(p.skus[0]?.sku) : null;
  const precio = precioDeProducto(p);
  const costo = costoDeProducto(p);
  return {
    numero: primerSku ?? `PRD-${p?.id ?? ''}`,
    tipo: null,
    titulo: textoLimpio(p?.name) ?? 'Sin nombre',
    subtitulo: textoLimpio(p?.category?.name),
    monto: null,
    estado: p?.is_active === false ? { label: 'Inactivo', clases: CLASES_INACTIVO } : { label: 'Activo', clases: CLASES_ACTIVO },
    chips: [
      ...(p?.necesita_revision ? [{ texto: 'Requiere revisión', tono: 'amber' }] : []),
      { texto: etiquetaTarifaCatalogo(p?.tarifa_iva), tono: sinTarifaIva(p) ? 'amber' : 'slate' },
      ...(p?.publicado ? [{ texto: 'Publicado', tono: 'emerald' }] : []),
    ],
    tiempo: `Precio ${precio === null ? '—' : formatoPesos(precio)} · Costo ${costo === null ? '—' : formatoPesos(costo)}`,
    atrasada: false,
    accionPrincipal: null,
  };
}

/**
 * Lo que dice la tabla de Productos cuando no hay filas: la búsqueda, los filtros de la barra (revisión, IVA) o nada.
 * @param {{q?: string | null, revision?: boolean, sinTarifa?: boolean, categoria?: string | true | null} | null | undefined} filtro
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioProductos(filtro) {
  const f = objetoPlano(filtro) ?? {};
  const q = textoLimpio(f.q);
  // r1 (m16, aditivo): `true` = hay una categoría elegida pero el catálogo no llegó (nunca el id crudo «#7»).
  const categoria = f.categoria === true ? true : textoLimpio(f.categoria);
  const donde = categoria === true ? ' en la categoría elegida' : categoria ? ` en la categoría «${categoria}»` : '';
  const quita = categoria ? 'Quita los filtros de revisión, de IVA o de categoría para ver más.' : 'Quita los filtros de revisión o de IVA para ver más.';
  if (q) {
    return {
      titulo: `Ningún producto coincide con «${q}»${donde}.`,
      ayuda: f.revision || f.sinTarifa || categoria ? quita : 'Busca por el nombre, la descripción o el código del SKU.',
    };
  }
  if (f.revision && f.sinTarifa) return { titulo: `Ningún producto requiere revisión y está sin tarifa de IVA${donde}.`, ayuda: quita };
  if (f.revision) return { titulo: `Ningún producto requiere revisión${donde}.`, ayuda: categoria ? quita : null };
  if (f.sinTarifa) return { titulo: categoria ? `Ningún producto sin tarifa de IVA${donde}.` : 'Todos los productos tienen tarifa de IVA.', ayuda: categoria ? quita : null };
  if (categoria) return { titulo: `Ningún producto${donde}.`, ayuda: 'Quita el filtro de categoría para ver las demás.' };
  return { titulo: 'Sin productos. Crea el primero.', ayuda: 'Usa «Nuevo Producto» para crear el primero.' };
}

/**
 * RP49: ¿hay que pedir el producto del enlace? `?id=` pide /products?id=N y `?sku=` (el de Abastecimiento: stock-tabla no
 * trae el id del producto) pide /products?sku=SKU (B4 T24 f3, B40-f: el parámetro exacto de B40-b; antes q=, que con un código corto
 * presente en más de 50 productos dejaba fuera el buscado). `marca` es lo ya atendido (la respuesta llegó), no lo que se pidió: un fetch
 * abortado deja la marca como estaba y el siguiente render vuelve a pedir. El id gana; uno que no es un entero positivo no
 * tapa un SKU bueno. Sin nada que pedir, null.
 * @param {string | null} marca
 * @param {string | null | undefined} idDeLaUrl
 * @param {string | null | undefined} skuDeLaUrl
 * @returns {{marca: string, ruta: string, id: number | null, sku: string | null} | null}
 */
export function pedirEnlaceProducto(marca, idDeLaUrl, skuDeLaUrl) {
  if (typeof idDeLaUrl === 'string' && /^[1-9]\d*$/.test(idDeLaUrl)) {
    const nueva = `id:${idDeLaUrl}`;
    return marca === nueva ? null : { marca: nueva, ruta: `/products?id=${idDeLaUrl}`, id: Number(idDeLaUrl), sku: null };
  }
  const sku = typeof skuDeLaUrl === 'string' ? skuDeLaUrl.trim() : '';
  if (sku === '') return null;
  const nueva = `sku:${sku}`;
  return marca === nueva ? null : { marca: nueva, ruta: `/products?sku=${encodeURIComponent(sku)}&limit=50&offset=0`, id: null, sku };
}

/**
 * Llegó la respuesta del enlace: abre el producto exacto (por su id, o el que tiene ese SKU). r1 (m5, m28): desde B40-f la consulta
 * es /products?sku=, y el servidor (B40-b, catalog.py) filtra por el SKU EXACTO distinguiendo mayúsculas: un ?sku= con otras
 * mayúsculas da «No se encontró». La comparación sin mayúsculas de aquí ya solo es un respaldo. Si no está, avisa UNA vez. En los dos
 * casos la marca queda en lo pedido (no se vuelve a pedir ni a avisar).
 * @param {{marca: string, id: number | null, sku: string | null}} pedido
 * @param {ReadonlyArray<any> | null | undefined} filas
 * @returns {{marca: string, abrir: any | null, avisar: boolean, texto: string | null}}
 */
export function llegadaEnlaceProducto(pedido, filas) {
  const lista = (Array.isArray(filas) ? filas : []).filter(esObjeto);
  const buscado = (pedido.sku ?? '').toUpperCase();
  const abrir = (pedido.id !== null
    ? lista.find((p) => p.id === pedido.id)
    : lista.find((p) => Array.isArray(p.skus) && p.skus.some((s) => typeof s?.sku === 'string' && s.sku.trim().toUpperCase() === buscado))) ?? null;
  return {
    marca: pedido.marca,
    abrir,
    avisar: abrir === null,
    texto: abrir !== null ? null
      : pedido.id !== null ? `No se encontró el producto #${pedido.id}.` : `No se encontró un producto con el SKU «${pedido.sku}».`,
  };
}

// ─── Ajustes de Inventario: la tabla, el tablero solo para ver y las tarjetas (B4 T19: TABLA-inventario punto 11, KANBAN-resto, KPI-inventario punto 9; RP96) ────

/**
 * Los grupos de dirección de un ajuste (RP96): los MISMOS del Kardex (una sola fuente, COLUMNAS_KARDEX): entrada = IN, ADJUST_IN y
 * TRANSFER_IN; salida = OUT, ADJUST_OUT y TRANSFER_OUT. Inmutable.
 * @type {Readonly<{entrada: ReadonlyArray<string>, salida: ReadonlyArray<string>}>}
 */
export const GRUPOS_AJUSTE = congelar({ entrada: [...COLUMNAS_KARDEX[0].estados], salida: [...COLUMNAS_KARDEX[1].estados] });

/**
 * El tablero solo para ver de Ajustes (R11): Entradas · Salidas. La clave de cada columna es la `direccion` que el servidor
 * entiende (entrada | salida); no tiene estados que mover. Inmutable.
 * @type {ReadonlyArray<Readonly<Columna>>}
 */
export const COLUMNAS_AJUSTE = congelar([
  columna('entrada', 'Entradas', 'emerald', ['entrada']),
  columna('salida', 'Salidas', 'rose', ['salida']),
]);

/**
 * El PRIMER movimiento de una operación: el de menor id (_primera_direccion del backend, ORDER BY id ASC; la relación no garantiza
 * el orden del arreglo). Sin ids, el primero del arreglo; sin movimientos, null.
 * @param {any} a
 * @returns {any}
 */
export function primerMovimiento(a) {
  const movs = Array.isArray(a?.movements) ? a.movements.filter((m) => m && typeof m === 'object') : [];
  if (movs.length === 0) return null;
  return movs.reduce((menor, m) => (typeof m.id === 'number' && (typeof menor.id !== 'number' || m.id < menor.id) ? m : menor), movs[0]);
}

/**
 * La dirección de un ajuste, 'entrada' o 'salida': la de su PRIMER movimiento según GRUPOS_AJUSTE (igual que el filtro `direccion`
 * de GET /inventory/operations, RP96). Sin movimientos o con otra dirección (cuarentena, pérdida, devolución), null.
 * @param {any} a
 * @returns {'entrada' | 'salida' | null}
 */
export function direccionDeAjuste(a) {
  const d = typeof primerMovimiento(a)?.direction === 'string' ? primerMovimiento(a).direction : '';
  if (GRUPOS_AJUSTE.entrada.includes(d)) return 'entrada';
  if (GRUPOS_AJUSTE.salida.includes(d)) return 'salida';
  return null;
}

const INFO_DIRECCION_AJUSTE = congelar({
  entrada: congelar({ label: 'Entrada', signo: '+', clases: CLASES_VERDE }),
  salida: congelar({ label: 'Salida', signo: '-', clases: CLASES_ROJO }),
});
const SIN_DIRECCION_AJUSTE = congelar({ label: 'Sin dirección', signo: '', clases: { ...GRIS } });

/**
 * La etiqueta, el signo y las clases de la dirección de un ajuste ('entrada' o 'salida'); sin ella, «Sin dirección» en gris.
 * @param {unknown} direccion
 * @returns {Readonly<{label: string, signo: '+' | '-' | '', clases: ClasesEstado}>}
 */
export function infoDireccionAjuste(direccion) {
  return typeof direccion === 'string' && tiene(INFO_DIRECCION_AJUSTE, direccion) ? INFO_DIRECCION_AJUSTE[direccion] : SIN_DIRECCION_AJUSTE;
}

/** AJU-0012: el número de un ajuste (el id con al menos 4 cifras, como _numero_operacion del servidor). */
export function numeroAjuste(a) {
  return `AJU-${String(a?.id ?? '').padStart(4, '0')}`;
}

/** La fecha REAL del ajuste (`fecha`: el primer movimiento, un instante): su día en Colombia; sin movimientos, '—'. */
export function textoFechaAjuste(a) {
  return fechaCorta(a?.fecha) || '—';
}

/** La bodega del ajuste: la de destino y, si no, la de origen; sin ninguna, null. */
export function bodegaDeAjuste(a) {
  return a?.dest_warehouse_id ?? a?.source_warehouse_id ?? null;
}

/** La cantidad del primer movimiento del ajuste; sin movimientos o sin número, null (la celda dice «—», nunca 0). */
export function cantidadDeAjuste(a) {
  return numeroFinito(primerMovimiento(a)?.quantity);
}

/** El producto del ajuste: «SKU #9» (la operación no trae el nombre, solo el id del SKU); sin movimientos, '—'. */
export function skuDeAjuste(a) {
  const primero = primerMovimiento(a);
  return primero?.sku_id === null || primero?.sku_id === undefined ? '—' : `SKU #${primero.sku_id}`;
}

/** El motivo del ajuste (sus notas); sin ellas, '—'. */
export function motivoDeAjuste(a) {
  return textoLimpio(a?.notas) ?? '—';
}

/**
 * Las vistas (pestañas) de Ajustes y el valor de `direccion` que pide cada una al servidor (RP96). Inmutable.
 * @type {Readonly<Record<'todos' | 'entradas' | 'salidas', 'entrada' | 'salida' | null>>}
 */
export const VISTAS_AJUSTE = congelar({ todos: null, entradas: 'entrada', salidas: 'salida' });

/**
 * Lo que la TABLA de Ajustes le suma a la consulta de useListado (`extra`): solo ajustes (operation_type) y la pestaña como
 * `direccion`. `vista` va en null (GET /inventory/operations no la tiene) y Ajustes no filtra por estado ni por semáforo.
 * @param {import('./tabla.js').EstadoTabla | null | undefined} estado
 * @returns {{operation_type: 'ADJUSTMENT', vista: null, semaforo: null, paso: null, estados: null, status: null, direccion: string | null}}
 */
export function consultaAjustes(estado) {
  const vista = typeof estado?.vista === 'string' && tiene(VISTAS_AJUSTE, estado.vista) ? estado.vista : 'todos';
  return { operation_type: 'ADJUSTMENT', vista: null, semaforo: null, paso: null, estados: null, status: null, direccion: VISTAS_AJUSTE[vista] };
}

/**
 * La consulta de una columna del tablero de Ajustes en modo servidor: la `direccion` de la columna, la búsqueda del MISMO estado,
 * los más recientes primero y el límite y el desplazamiento de la columna (limit=0 en la plegada). La pestaña no viaja.
 * @param {import('./tabla.js').EstadoTabla} estado
 * @param {{estados?: ReadonlyArray<string>} | null | undefined} columna
 * @param {{limit: number, offset: number}} consulta
 * @returns {string}
 */
export function consultaColumnaAjuste(estado, columna, { limit, offset }) {
  return queryListado(estado, {
    operation_type: 'ADJUSTMENT', vista: null, semaforo: null, paso: null, estados: null, orden: '-fecha',
    direccion: columna?.estados?.[0] ?? null, limit, offset,
  });
}

const consultaTotalAjustes = (q, direccion) => queryListado(null, {
  vista: null, semaforo: null, paso: null, q: q || null, estados: null, orden: null, limit: 0, offset: 0, operation_type: 'ADJUSTMENT', direccion,
});

/**
 * Las tres consultas de los totales (limit=0: solo el total) de las pestañas y las tarjetas (RP96): todos los ajustes, los de
 * entrada y los de salida, con la BÚSQUEDA `q` (R5; sin pestaña ni estados).
 * @param {string | null | undefined} q
 * @returns {{todos: string, entradas: string, salidas: string}}
 */
export function consultasTotalesAjuste(q) {
  const texto = typeof q === 'string' ? q.trim() : '';
  return { todos: consultaTotalAjustes(texto, null), entradas: consultaTotalAjustes(texto, 'entrada'), salidas: consultaTotalAjustes(texto, 'salida') };
}

/**
 * Las pestañas de Ajustes con los totales de CONSULTAS_TOTALES_AJUSTE ({todos, entradas, salidas}); lo que no llega queda en null
 * (la barra gris, nunca 0). Las tarjetas aju_* leen esos mismos totales.
 * @param {any} totales
 * @returns {{id: string, etiqueta: string, conteo: number | null}[]}
 */
export function pestanasAjustes(totales) {
  const t = objetoPlano(totales) ?? {};
  return [
    { id: 'todos', etiqueta: 'Todos', conteo: numeroFinito(t.todos) },
    { id: 'entradas', etiqueta: 'Entradas', conteo: numeroFinito(t.entradas) },
    { id: 'salidas', etiqueta: 'Salidas', conteo: numeroFinito(t.salidas) },
  ];
}

/**
 * Lo que dice la tabla de Ajustes cuando no hay filas: la búsqueda o la pestaña.
 * @param {Partial<import('./tabla.js').EstadoTabla> | null | undefined} estado
 * @returns {{titulo: string, ayuda: string | null}}
 */
export function textoVacioAjustes(estado) {
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: 'Ajusta la búsqueda.' };
  if (estado?.vista === 'entradas') return { titulo: 'No hay ajustes de entrada', ayuda: null };
  if (estado?.vista === 'salidas') return { titulo: 'No hay ajustes de salida', ayuda: null };
  return { titulo: 'Sin ajustes registrados', ayuda: 'Los ajustes corrigen diferencias de stock detectadas en un conteo físico.' };
}

/**
 * La tarjeta de un ajuste en el tablero solo para ver: el número, el producto, la bodega, la dirección, la cantidad con su signo,
 * el motivo y la fecha real.
 * @param {any} a
 * @param {ReadonlyArray<{id: number, name?: string | null}> | null | undefined} bodegas
 */
export function tarjetaAjuste(a, bodegas) {
  const info = infoDireccionAjuste(direccionDeAjuste(a));
  const n = cantidadDeAjuste(a);
  const motivo = textoLimpio(a?.notas);
  const fecha = textoFechaAjuste(a);
  return {
    numero: numeroAjuste(a),
    tipo: 'AJU',
    titulo: skuDeAjuste(a),
    subtitulo: nombreBodega(bodegas, bodegaDeAjuste(a)),
    monto: null,
    estado: { label: info.label, clases: info.clases },
    chips: [
      { texto: n === null ? '—' : `${info.signo}${formatoDecimal(Math.abs(n))} ${Math.abs(n) === 1 ? 'unidad' : 'unidades'}`, tono: info.signo === '+' ? 'emerald' : info.signo === '-' ? 'rose' : 'slate' },
      ...(motivo ? [{ texto: motivo, tono: 'slate' }] : []),
    ],
    tiempo: fecha === '—' ? null : fecha,
    atrasada: false,
    accionPrincipal: null,
  };
}

/** La pestaña que abre cada tarjeta de Recepciones (null: informativa). */
export function vistaDeTarjetaRecepcion(kpi) {
  return ({ rec_por_confirmar: 'por_confirmar', rec_confirmadas: 'confirmadas', rec_total: 'todas' })[kpi] ?? null;
}
/** La pestaña que abre cada tarjeta de Traslados (null: informativa). */
export function vistaDeTarjetaTraslado(kpi) {
  return ({ tras_en_proceso: 'en_proceso', tras_completados: 'completadas', tras_total: 'todos' })[kpi] ?? null;
}
/** La pestaña que abre cada tarjeta de Ajustes (null: informativa). */
export function vistaDeTarjetaAjuste(kpi) {
  return ({ aju_total: 'todos', aju_entradas: 'entradas', aju_salidas: 'salidas' })[kpi] ?? null;
}

/**
 * Las pestañas de Recepciones (RP41, D6; Compras e Inventario las comparten): Por confirmar · Confirmadas · Canceladas · Todas con los
 * conteos de con_conteos ({por_confirmar, confirmadas, canceladas, todas}); null mientras cargan (la barra gris, nunca 0). Por
 * confirmar va en ámbar si hay alguna.
 * @param {any} conteos
 */
export function pestanasRecepcion(conteos) {
  const c = objetoPlano(conteos) ?? {};
  const n = (k) => numeroFinito(c[k]);
  return [
    { id: 'por_confirmar', etiqueta: 'Por confirmar', conteo: n('por_confirmar'), alerta: (n('por_confirmar') ?? 0) > 0 },
    { id: 'confirmadas', etiqueta: 'Confirmadas', conteo: n('confirmadas') },
    { id: 'canceladas', etiqueta: 'Canceladas', conteo: n('canceladas') },
    { id: 'todas', etiqueta: 'Todas', conteo: n('todas') },
  ];
}
/** D39: en Kanban la lista de Recepciones va sin filas (limit=0); los conteos siguen al día y las filas las piden las columnas. */
export const EXTRA_TABLERO_RECEPCION = congelar({ limit: 0 });

/**
 * Las pestañas de Traslados (En proceso · Completados · Cancelados · Todos) con los conteos de GET /inventory/operations?con_conteos=1.
 * @param {any} conteos
 */
export function pestanasTraslado(conteos) {
  const c = conteosTraslado(conteos);
  return [
    { id: 'en_proceso', etiqueta: 'En proceso', conteo: c.en_proceso },
    { id: 'completadas', etiqueta: 'Completados', conteo: c.completadas },
    { id: 'canceladas', etiqueta: 'Cancelados', conteo: c.canceladas },
    { id: 'todos', etiqueta: 'Todos', conteo: c.todos },
  ];
}
/** Los conteos de TODOS los traslados (sin búsqueda ni filtros) para las tarjetas: solo el total y los conteos, sin filas. */
export const RUTA_CONTEOS_TRASLADOS = '/inventory/operations?operation_type=TRANSFER&limit=0&con_conteos=1';
/** La columna del tablero de Traslados (su estado) y el día en que se hizo (la fecha real). */
/**
 * B4 T24 f3 r1 (m11, m21, m37): lo que dice la alerta «No se pudo verificar el stock crítico» de Abastecimiento. Si /inventory/stats
 * falló, remite al aviso con «Reintentar», que va SOBRE las tarjetas (antes decía «bajo»); si respondió pero sin un número de agotados,
 * no culpa a un aviso que no existe.
 * @param {boolean} fallaronLosIndicadores
 * @returns {string}
 */
export function textoAlertaSinDato(fallaronLosIndicadores) {
  return fallaronLosIndicadores ? 'El aviso sobre las tarjetas dice qué falló.' : 'El servidor no dio el número de agotados.';
}

export const columnaDeTraslado = (t) => t?.status;
export const fechaDeTraslado = (t) => t?.fecha;

/**
 * B4 T24 f3 r1 (F71): lo que dice la barra de la selección de la Lista de compras (m12 de T16B): los mismos ítems que usará «Crear
 * Pedido de Compra»; si hay seleccionados que no entran (ya en pedido o recibidos), lo dice.
 * @param {number} elegidos
 * @param {number} pedibles
 * @returns {string}
 */
export function textoSeleccionLista(elegidos, pedibles) {
  const base = `${elegidos} ${elegidos === 1 ? 'seleccionado' : 'seleccionados'}`;
  return pedibles === elegidos ? base : `${base}; ${pedibles} se ${pedibles === 1 ? 'puede' : 'pueden'} pedir`;
}

/**
 * B4 T24 f3 r1 (F71): el día en que se movió un ítem de la Lista de compras para el tablero (fechaMovimiento: su `fecha`, I1 de T16B).
 * @param {any} it
 * @returns {string | null}
 */
export const fechaItemLista = (it) => it?.fecha ?? null;

/** '1 día', '3 días'. */
export function textoDiasRetraso(n) {
  return `${n} ${n === 1 ? 'día' : 'días'}`;
}

/** Los motivos de un ajuste (el formulario, la columna Motivo y las tarjetas). */
export const MOTIVOS_AJUSTE = congelar(['Conteo físico', 'Merma', 'Sobrante', 'Corrección de error', 'Daño en bodega', 'Vencimiento', 'Otro']);
