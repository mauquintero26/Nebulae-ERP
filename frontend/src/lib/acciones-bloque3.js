/**
 * Las acciones nuevas de la Actividad del Bloque 3, en UNA sola tabla (T13, RP22). El backend solo escribe la `action`
 * (sin mapa de acciones en textos_actividad.py); la etiqueta, el ícono, el color y el hex salen de aquí, y los importan
 * el Hub (T16), cotizacion/[id] (T17), solicitud/[id] (T18) y venta/[id] (T19). Prueba: frontend/tests/
 * test_acciones_bloque3.mjs; los códigos los compara con los del backend backend/tests/test_paridad_bloque3.py.
 *
 * Cada entrada: {etiqueta (filtro por tipo y leyenda), icono (componente de lucide-react), clases (las del círculo del
 * ícono en los mapas {icon, color} de cotizacion/[id] y solicitud/[id], escritas completas para que Tailwind las
 * genere), hex (los mapas de color de venta/[id] y los puntos de la línea de tiempo; el hex de la familia en la paleta
 * v3 del plan, parecido al tono oklch de Tailwind 4)}. Para un ACTIVITY_STYLE: {icon: a.icono, color: a.clases}. Para
 * buscar una entrada por la `action` que manda el servidor: accionBloque3(action), que solo ve claves propias.
 *
 * Etiquetas del plan (plan:2169 y 4293). Las de ENVIADO_AL_CLIENTE y MENSAJE_CLIENTE no las fija el plan (RP22):
 * 'Enviado al cliente' (el pedido se le envió por su enlace) y 'Entrega del WhatsApp' (llegó, lo leyó o no le llegó).
 * Ronda r1: CLIENTE_CAMBIADO (T5 r2, cambios_documento.ACCION_CLIENTE_CAMBIADO: cambiaron los datos del cliente de la
 * SC y los enlaces enviados antes ya no sirven) y RECORDATORIO_FALLIDO con una etiqueta neutral, porque agrupa también
 * recordatorios que pudieron haber salido (Chatwoot sin respuesta, error después de enviar).
 */

import {
  AlertTriangle, Bell, BellOff, BellRing, MessageCircle, MessageSquareWarning, PhoneCall, Send, UserPen,
} from 'lucide-react';

const accion = (etiqueta, icono, clases, hex) => Object.freeze({ etiqueta, icono, clases, hex });

export const ACCIONES_BLOQUE3 = Object.freeze({
  // T6 (H28-cambios): el cliente pidió cambios desde su enlace, y el aviso por correo al asesor.
  CAMBIOS_CLIENTE: accion('Cambios pedidos por el cliente', MessageSquareWarning, 'text-amber-600 bg-amber-50', '#d97706'),
  SC_CAMBIOS_CLIENTE: accion('Cambios pedidos en la solicitud', MessageSquareWarning, 'text-amber-600 bg-amber-50',
    '#d97706'),
  AVISO_ASESOR: accion('Aviso al asesor', Bell, 'text-slate-600 bg-slate-100', '#475569'),
  // T5 (r2): cambiaron los datos del cliente de la SC; los enlaces enviados antes ya no sirven.
  CLIENTE_CAMBIADO: accion('Cliente cambiado', UserPen, 'text-orange-600 bg-orange-50', '#ea580c'),
  // T7 (U23): el pedido se le envió al cliente. Color del plan: '#4f46e5'.
  ENVIADO_AL_CLIENTE: accion('Enviado al cliente', Send, 'text-indigo-600 bg-indigo-50', '#4f46e5'),
  // T8 (U16-entrega, R4): el WhatsApp le llegó, lo leyó o no le llegó. MessageCircle verde, '#16a34a'.
  MENSAJE_CLIENTE: accion('Entrega del WhatsApp', MessageCircle, 'text-green-600 bg-green-50', '#16a34a'),
  // T11 (U16-seguimiento): el recordatorio automático.
  RECORDATORIO_ENVIADO: accion('Recordatorio automático', BellRing, 'text-sky-600 bg-sky-50', '#0284c7'),
  RECORDATORIO_FALLIDO: accion('Problema con el recordatorio', AlertTriangle, 'text-amber-600 bg-amber-50', '#d97706'),
  SEGUIMIENTO_AGOTADO: accion('Sin respuesta al recordatorio', PhoneCall, 'text-rose-500 bg-rose-50', '#f43f5e'),
  SEGUIMIENTO_DETENIDO: accion('Recordatorios detenidos', BellOff, 'text-slate-500 bg-slate-50', '#64748b'),
});

/**
 * La entrada de ACCIONES_BLOQUE3 para una `action` de la Actividad, o null si no es una acción del Bloque 3 (también con
 * 'toString', 'constructor' u otra clave heredada de Object).
 * @param {unknown} action
 * @returns {typeof ACCIONES_BLOQUE3[keyof typeof ACCIONES_BLOQUE3] | null}
 */
export function accionBloque3(action) {
  return typeof action === 'string' && Object.hasOwn(ACCIONES_BLOQUE3, action) ? ACCIONES_BLOQUE3[action] : null;
}
