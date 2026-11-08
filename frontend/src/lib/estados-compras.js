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
 * Recepciones (ESTADOS_RECEPCION, GRUPOS_RECEPCION, grupoRecepcion, COLUMNAS_RECEPCION), ítems de la lista de compras
 * (ESTADOS_ITEM_LISTA, COLUMNAS_LISTA; DESCARTADO no se muestra), traslados (ESTADOS_TRASLADO, COLUMNAS_TRASLADO,
 * GRUPOS_OPERACION, grupoOperacion) y estado del stock (ESTADOS_STOCK, COLUMNAS_STOCK; RP53).
 *
 * Las columnas tienen la forma de columna de kanban.js ({clave, titulo, tono, estados, cerrada}; T3A las valida con
 * definirColumnas); `tono` es un color de Tailwind (como COLUMNAS_HUB). Todo es inmutable.
 */

// congelar: mutar estas tablas lanza TypeError (una sola función en todo el frontend; no se copia).
import { congelar, humanizarCodigo, tiene } from './estados-pedido.js';
import { diaColombia, fechaCorta, fechaSolo, instante } from './fechas-colombia.js';
// B4 T14: la consulta de cada columna del tablero de Compras (consultaColumnaPec) sale de la misma queryListado.
import { queryListado } from './tabla.js';
// B4 T14 r1: la regla de la columna con filtro (m4, la misma de Ventas), el número del servidor (m7) y la regla de
// recarga y el texto de los errores (m15).
import { estadosDeColumnaLista } from './kanban.js';
import { numeroFinito } from './kpis.js';
import { recargarTrasError, textoDeError } from './avisos.js';

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
 * principal (el primero) y el título de la columna; estadosDeColumnaPec la convierte en la columna entera. Inmutable.
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
 * como se guarda: sus 10 primeros caracteres, sin pasarla a Colombia, como esPecVencido. Un día que no existe o lo que
 * no empieza con una fecha: ''.
 * @param {unknown} valor
 * @returns {string}
 */
export function diaPec(valor) {
  if (typeof valor !== 'string') return '';
  const dia = valor.trim().slice(0, 10);
  return FECHA_DE_CALENDARIO.test(dia) && fechaSolo(dia) ? dia : '';
}

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
export function tarjetaPedidoCompra(p) {
  const tarjeta = tarjetaPec(p);
  const enBodega = columnaPec(p?.estado) === 'en_bodega';
  const chips = p?.estado === 'PARCIALMENTE_RECIBIDA' ? [...tarjeta.chips, { texto: 'Falta por recibir', tono: 'amber' }] : tarjeta.chips;
  return { ...tarjeta, chips, accionPrincipal: enBodega ? { ...ACCION_RECEPCIONAR } : null };
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
  const semaforo = estado?.semaforo;
  if (semaforo === 'vencidos' || semaforo === 'atrasados') return { titulo: 'Ningún pedido de compra con la entrega vencida.', ayuda: null };
  if (Array.isArray(estado?.estados) && estado.estados.length > 0) {
    return { titulo: 'Ningún pedido de compra con esos estados. Ajusta el filtro.', ayuda: null };
  }
  const q = typeof estado?.q === 'string' ? estado.q.trim() : '';
  if (q) return { titulo: `Sin resultados para «${q}»`, ayuda: 'Ajusta la búsqueda o el filtro de estados.' };
  return { titulo: 'No hay pedidos de compra en esta vista', ayuda: ayuda ?? null };
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
 * B4 T14 r1 (I1, m10, m15): lo que hace la pantalla después de cancelar en serie (cancelarPecsEnSerie), para que la
 * página solo lo ejecute:
 *  - fuera: las claves que salen de la selección (lo cancelado y lo omitido); lo que falló sigue marcado;
 *  - pendientes: los PEC que fallaron (se quedan en la ventana del motivo para reintentar con lo escrito);
 *  - recargar: la lista, la franja, las tarjetas y del tablero el origen y el destino, si se canceló algo o si una falla
 *    lo pide (recargarTrasError: un 409, un 400 o la red; un 422 no);
 *  - recargarVentas (I1): si se canceló algo, los pedidos de venta del panel de consolidación (los vinculados vuelven a
 *    Pendiente de compra);
 *  - recargarDetalle (m10): si una falla pide recargar, el detalle del panel abierto también;
 *  - mensajeOk: el aviso de lo cancelado (con los omitidos solo si no hubo fallas: con fallas quedan en la ventana);
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
 * La tarjeta de una recepción en el tablero solo para ver (la forma de DatosTarjetaKanban): el número (sin él, ENINV-id),
 * el proveedor (o 'Sin proveedor'), el PEC de origen (o 'Entrada manual'), la insignia del estado, el chip «Retraso N
 * días» (dias_retraso de _gr_dict, solo si es mayor que 0), la bodega y el día (fecha de recepción o de creación) y, en
 * «Por contar», la acción «Contar y confirmar» hacia el conteo.
 * @param {any} r
 * @returns {{numero: string, tipo: 'ENINV', titulo: string, subtitulo: string, monto: null, estado: Readonly<InfoEstado>,
 *   chips: {texto: string, tono: string}[], tiempo: string, atrasada: boolean,
 *   accionPrincipal: {texto: string, href: string, tono: string} | null}}
 */
export function tarjetaRecepcion(r) {
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
    accionPrincipal: porContar && r?.id != null
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
