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
 * Recepciones (ESTADOS_RECEPCION, GRUPOS_RECEPCION, grupoRecepcion, COLUMNAS_RECEPCION), ítems de la lista de compras
 * (ESTADOS_ITEM_LISTA, COLUMNAS_LISTA; DESCARTADO no se muestra), traslados (ESTADOS_TRASLADO, COLUMNAS_TRASLADO,
 * GRUPOS_OPERACION, grupoOperacion) y estado del stock (ESTADOS_STOCK, COLUMNAS_STOCK; RP53).
 *
 * Las columnas tienen la forma de columna de kanban.js ({clave, titulo, tono, estados, cerrada}; T3A las valida con
 * definirColumnas); `tono` es un color de Tailwind (como COLUMNAS_HUB). Todo es inmutable.
 */

// congelar: mutar estas tablas lanza TypeError (una sola función en todo el frontend; no se copia).
import { congelar, humanizarCodigo, tiene } from './estados-pedido.js';
import { diaColombia, fechaSolo } from './fechas-colombia.js';

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
  const fecha = p?.fecha_entrega_estimada;
  if (typeof fecha !== 'string') return false;
  const dia = fecha.trim().slice(0, 10);
  if (!FECHA_DE_CALENDARIO.test(dia) || !fechaSolo(dia)) return false;
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
const ENLACE_RECEPCIONES = congelar({ texto: 'Ir a Recepciones', href: '/dashboard/compras/recepciones' });

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
  switch (destino) {
    case 'emitido':
      return destinos.includes('EMITIDO')
        ? { tipo: 'cambio', estado: 'EMITIDO' }
        : { tipo: 'bloqueado', motivo: 'Solo un pedido en Borrador se puede marcar como Emitido.' };
    case 'cancelado':
      return destinos.includes('CANCELADO')
        ? { tipo: 'accion', accion: 'cancelar' }
        : { tipo: 'bloqueado', motivo: 'Ya llegó a bodega: su estado lo lleva la recepción.' };
    case 'en_transito':
      return { tipo: 'bloqueado', motivo: 'El tránsito se marca al iniciar el seguimiento del envío.', enlace: ENLACE_TRANSITO };
    case 'en_bodega':
    case 'recibido':
      return { tipo: 'bloqueado', motivo: 'Lo marca la recepción en bodega.', enlace: ENLACE_RECEPCIONES };
    default: // 'borrador'
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
