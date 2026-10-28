/**
 * Estados de la Cotización (Bloque 4, T2; KANBAN-ventas-listas, RP4): UNA sola fuente de nombres y colores para las
 * piezas nuevas del bloque (tableros, BannerFlujo, CadenaDocumentos). JS plano, sin React ni DOM, para probarlo con node
 * (frontend/tests/test_estados_cotizacion.mjs). Imports relativos con extensión: node y la prueba de paridad de Python
 * no resuelven '@/'.
 *
 * Espejo de backend/app/core/textos_actividad.py (ETIQUETAS_ESTADO['COT']: los nombres) y de ESTADOS_COT_MANUALES de
 * backend/app/api/v1/erp_ventas.py. Si cambias una etiqueta, cambia las dos: backend/tests/
 * test_estados_cotizacion_paridad.py comprueba que coincidan.
 *
 * RP4: la forma es {codigo: {label, clases}} (la del spec). El ESTADOS hex de cotizacion-client.tsx ({label, color, bg,
 * border}) NO se reemplaza aquí: T9 solo toma `label` de esta tabla.
 */

// congelar: mutar estas tablas lanza TypeError (una sola función en todo el frontend; no se copia).
import { congelar, humanizarCodigo, tiene } from './estados-pedido.js';

/**
 * @typedef {{ bg: string, text: string, border: string }} ClasesEstado
 * @typedef {{ label: string, clases: ClasesEstado }} InfoEstadoCotizacion
 */

/** Las clases de un código que no está en la tabla (el mismo gris de infoEstadoPedido). */
const GRIS = congelar({ bg: 'bg-gray-100', text: 'text-gray-700', border: 'border-gray-200' });

/**
 * Los 6 estados de la cotización, en el orden de ETIQUETAS_ESTADO['COT'], con su etiqueta única y sus clases de
 * Tailwind (los mismos tonos de la pastilla de cotizacion-client.tsx; literales completas para que Tailwind las
 * encuentre). Inmutable.
 * @type {Readonly<Record<string, Readonly<InfoEstadoCotizacion>>>}
 */
export const ESTADOS_COTIZACION = congelar({
  BORRADOR: { label: 'Borrador', clases: { bg: 'bg-slate-100', text: 'text-slate-600', border: 'border-slate-200' } },
  ENVIADA: { label: 'Enviada al cliente', clases: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-200' } },
  PENDIENTE_CONFIRMACION: {
    label: 'Esperando confirmación del cliente',
    clases: { bg: 'bg-blue-50', text: 'text-blue-700', border: 'border-blue-200' },
  },
  CONFIRMADA: { label: 'Confirmada', clases: { bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200' } },
  RECHAZADA: { label: 'Rechazada', clases: { bg: 'bg-red-50', text: 'text-red-800', border: 'border-red-200' } },
  VENCIDA: { label: 'Vencida', clases: { bg: 'bg-violet-50', text: 'text-violet-600', border: 'border-violet-200' } },
});

/**
 * Lo único que se pone a mano por PATCH en una cotización (PATCH /ventas/cotizaciones/{id}): espejo de
 * ESTADOS_COT_MANUALES de erp_ventas.py. Los demás los pone el flujo (ENVIADA, el envío que genera el enlace; el
 * cliente confirma con su enlace). Inmutable.
 * @type {ReadonlyArray<string>}
 */
export const ESTADOS_COT_MANUALES = congelar(['BORRADOR', 'RECHAZADA', 'VENCIDA']);

/**
 * Etiqueta y clases de un estado de la cotización. Un código desconocido sale humanizado ('ALGO_NUEVO' -> 'Algo
 * nuevo') y en gris: nunca el código crudo. Inmutable.
 * @param {unknown} e
 * @returns {Readonly<InfoEstadoCotizacion>}
 */
export function infoEstadoCotizacion(e) {
  if (typeof e === 'string' && tiene(ESTADOS_COTIZACION, e)) return ESTADOS_COTIZACION[e];
  return congelar({ label: humanizarCodigo(e), clases: { ...GRIS } });
}
