/**
 * Los tipos de components/flujo (Bloque 4, T5A; FLUJO-base punto 2).
 *  - Los del paso (PasoVista, EstadoPaso, TonoPaso, ClaveIcono y los de sus avisos y su detalle) son los JSDoc de
 *    lib/flujo.js, re-exportados: UNA sola definición para las librerías y las pantallas (si cambia allá, cambia aquí).
 *  - Los demás son los de las props de PasosFlujo, BannerFlujo, CadenaDocumentos y useResumenFlujo.
 */

import type { FiltroSemaforo, TonoAviso } from '@/lib/flujo';

export type {
  PasoVista, EstadoPaso, TonoPaso, ClaveIcono, TonoAviso, AvisoPaso, DetallePaso, FiltroSemaforo, OpcionSemaforo,
  EstadoResumen,
} from '@/lib/flujo';
export type { TipoCadena } from '@/lib/flujo-ventas';

/** 'banner': las cajas de la franja; 'barra': los círculos de los documentos y de las etapas; 'mini': los puntos de una celda. */
export type VarianteFlujo = 'banner' | 'barra' | 'mini';

/** En 'vertical' las flechas y los conectores apuntan hacia abajo. */
export type OrientacionFlujo = 'horizontal' | 'vertical';

/**
 * El semáforo de BannerFlujo (R6): los números de GET /ventas/flujo (o /compras/flujo) y el filtro del estado único de
 * la pantalla. noResueltos: sin la propiedad no se pinta «No resueltos (n)»; con null se pinta cargando.
 * r1 (M15b): cuando un conteo no viene (el endpoint no lo manda), se pasa `undefined`, no `null`: null es «todavía
 * carga» y, con la carga ya lista, dejaría la barra gris para siempre. Por eso no se usa `?? null` sobre un campo que el
 * servidor puede no mandar (Compras no manda no_resueltos); ver el uso para T7 y T14 en BannerFlujo.tsx. Un conteo
 * negativo cuenta como sin número (r1, M16). Si el filtro vale pero su botón no se pinta (no_resueltos sin
 * noResueltos), ningún botón queda presionado (M15a).
 */
export type SemaforoFranja = {
  atrasados: number | null;
  noResueltos?: number | null;
  filtro: FiltroSemaforo;
  onFiltrar: (filtro: FiltroSemaforo) => void;
};

/** Un aviso de la fila 1 de BannerFlujo, como chip; con onClick es un botón. */
export type AvisoFranja = { texto: string; tono: TonoAviso; onClick?: () => void };

/** El botón de ajuste de la franja (p. ej. 'Ajustar tiempos' de Ventas, solo para administradores). */
export type AccionAjustar = { label: string; onClick: () => void };

/**
 * Qué filas pinta BannerFlujo. Solo 'todo' (R1): flujo_posicion = «una sola franja, igual en todas las pantallas», así
 * que la rama 'semaforo' | 'diagrama' del diseño (la opción 2 de esa pregunta) no se implementa.
 */
export type PartesFranja = 'todo';

/** Un paso de res.data.pasos de GET /ventas/flujo o /compras/flujo (snake_case; lo convierte conteosDePasos). */
export type PasoDelServidor = {
  total?: number | null;
  atrasados?: number | null;
  mas_antiguo_dias?: number | null;
  por_estado?: Record<string, number> | null;
};

/**
 * res.data de GET /ventas/flujo (resumen_flujo_ventas) y de GET /compras/flujo («la misma forma»). Lo que el servidor
 * no manda queda undefined: al pasarlo a la franja se pasa `undefined`, no `null` (M15b).
 */
export type DatosFlujo = {
  pasos?: Record<string, PasoDelServidor | null> | null;
  semaforo?: { atrasados?: number | null; no_resueltos?: number | null } | null;
  /** {SC, COT, VEN} (Ventas): lo lee textoRegla. */
  dias_alerta?: Partial<Record<'SC' | 'COT' | 'VEN', number | string | null>> | number | null;
  /** RP12 (Ventas): {SC: n, COT: n}. */
  cambios_cliente?: Partial<Record<string, number>> | null;
  sin_respuesta?: Partial<Record<string, number>> | null;
  generado_at?: string | null;
  [clave: string]: unknown;
};

/** Lo que devuelve useResumenFlujo. */
export type ResumenFlujo<T = DatosFlujo> = {
  /** res.data de la última respuesta buena de esta ruta; null en la primera carga (las cajas pintan Contador). */
  datos: T | null;
  /** Hay una carga en camino (la primera o una recarga: en la recarga los datos anteriores siguen). */
  cargando: boolean;
  /** El error de la última carga (con .status y .detail de apiFetch), o null. Con error, `datos` es lo último bueno. */
  error: unknown;
  /** Pide otra vez (Reintentar, o después de un cambio hecho en la pantalla). */
  recargar: () => void;
};

/**
 * Lo que lee cadenaVentas de un documento (todo opcional: cada pantalla pasa su fila o su detalle tal cual).
 *  - SC: cotizaciones y pedidos_venta (las listas ligeras).
 *  - COT: sc_id y sc_numero, y pedidos_venta.
 *  - PVEN (o VEN): sc_id, sc_numero, cot_id, cot_numero y, si hay compra, pec_id y pec_numero.
 */
export type DocumentoCadena = {
  id?: unknown;
  numero?: unknown;
  estado?: unknown;
  cotizaciones?: unknown;
  pedidos_venta?: unknown;
  sc_id?: unknown;
  sc_numero?: unknown;
  cot_id?: unknown;
  cot_numero?: unknown;
  pec_id?: unknown;
  pec_numero?: unknown;
};
