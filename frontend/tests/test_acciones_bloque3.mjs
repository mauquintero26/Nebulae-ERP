/**
 * frontend/tests/test_acciones_bloque3.mjs
 * B3 T13 (RP22): la tabla única ACCIONES_BLOQUE3 de las acciones nuevas de la Actividad. El backend solo escribe la
 * `action`; la etiqueta, el ícono (lucide-react), las clases de color (los mapas de clases del Hub, cotizacion/[id] y
 * solicitud/[id]) y el hex (venta/[id] y los puntos de la línea de tiempo) salen de aquí. Los códigos los compara con
 * los del backend test_paridad_bloque3.py.
 */

import assert from 'node:assert/strict';
import * as lucide from 'lucide-react';
import { ACCIONES_BLOQUE3 } from '../src/lib/acciones-bloque3.js';

// La paleta de Tailwind de las clases que usa la tabla (el hex de cada clase de texto).
const HEX_TAILWIND = {
  'amber-600': '#d97706', 'slate-500': '#64748b', 'slate-600': '#475569', 'indigo-600': '#4f46e5',
  'green-600': '#16a34a', 'sky-600': '#0284c7', 'rose-500': '#f43f5e',
};

console.log('--- TEST 1: una entrada por cada acción nueva del Bloque 3 (RP22) ---');
{
  assert.deepEqual(Object.keys(ACCIONES_BLOQUE3).sort(), ['AVISO_ASESOR', 'CAMBIOS_CLIENTE', 'ENVIADO_AL_CLIENTE',
    'MENSAJE_CLIENTE', 'RECORDATORIO_ENVIADO', 'RECORDATORIO_FALLIDO', 'SC_CAMBIOS_CLIENTE', 'SEGUIMIENTO_AGOTADO',
    'SEGUIMIENTO_DETENIDO']);
  assert.ok(Object.isFrozen(ACCIONES_BLOQUE3));
  for (const [accion, a] of Object.entries(ACCIONES_BLOQUE3)) {
    assert.ok(Object.isFrozen(a), accion);
    assert.deepEqual(Object.keys(a).sort(), ['clases', 'etiqueta', 'hex', 'icono'], accion);
  }
}

console.log('--- TEST 2: las etiquetas del plan (y las dos que el plan no fija, en español) ---');
{
  const etiquetas = Object.fromEntries(Object.entries(ACCIONES_BLOQUE3).map(([k, a]) => [k, a.etiqueta]));
  assert.deepEqual(etiquetas, {
    CAMBIOS_CLIENTE: 'Cambios pedidos por el cliente',
    SC_CAMBIOS_CLIENTE: 'Cambios pedidos en la solicitud',
    AVISO_ASESOR: 'Aviso al asesor',
    ENVIADO_AL_CLIENTE: 'Enviado al cliente',
    MENSAJE_CLIENTE: 'Entrega del WhatsApp',
    RECORDATORIO_ENVIADO: 'Recordatorio automático',
    RECORDATORIO_FALLIDO: 'Recordatorio no enviado',
    SEGUIMIENTO_AGOTADO: 'Sin respuesta al recordatorio',
    SEGUIMIENTO_DETENIDO: 'Recordatorios detenidos',
  });
}

console.log('--- TEST 3: los íconos de lucide-react del plan ---');
{
  const iconos = {
    CAMBIOS_CLIENTE: lucide.MessageSquareWarning, SC_CAMBIOS_CLIENTE: lucide.MessageSquareWarning, AVISO_ASESOR: lucide.Bell,
    ENVIADO_AL_CLIENTE: lucide.Send, MENSAJE_CLIENTE: lucide.MessageCircle, RECORDATORIO_ENVIADO: lucide.BellRing,
    RECORDATORIO_FALLIDO: lucide.AlertTriangle, SEGUIMIENTO_AGOTADO: lucide.PhoneCall, SEGUIMIENTO_DETENIDO: lucide.BellOff,
  };
  for (const [accion, icono] of Object.entries(iconos)) {
    assert.ok(icono, `lucide-react exporta el ícono de ${accion}`);
    assert.equal(ACCIONES_BLOQUE3[accion].icono, icono, accion);
  }
}

console.log('--- TEST 4: clases de color y hex coherentes; los dos hex que fija el plan ---');
{
  const familias = {
    CAMBIOS_CLIENTE: 'amber', SC_CAMBIOS_CLIENTE: 'amber', AVISO_ASESOR: 'slate', ENVIADO_AL_CLIENTE: 'indigo',
    MENSAJE_CLIENTE: 'green', RECORDATORIO_ENVIADO: 'sky', RECORDATORIO_FALLIDO: 'amber', SEGUIMIENTO_AGOTADO: 'rose',
    SEGUIMIENTO_DETENIDO: 'slate',
  };
  for (const [accion, a] of Object.entries(ACCIONES_BLOQUE3)) {
    // Clases literales (Tailwind solo genera las que ve escritas): 'text-<color>-<tono> bg-<color>-<tono>'.
    const m = /^text-([a-z]+)-(\d{3}) bg-\1-(\d{2,3})$/.exec(a.clases);
    assert.ok(m, `${accion}: ${a.clases}`);
    assert.equal(m[1], familias[accion], accion);
    assert.equal(a.hex, HEX_TAILWIND[`${m[1]}-${m[2]}`], `${accion}: el hex es el de su clase de texto`);
  }
  assert.equal(ACCIONES_BLOQUE3.ENVIADO_AL_CLIENTE.hex, '#4f46e5');
  assert.equal(ACCIONES_BLOQUE3.MENSAJE_CLIENTE.hex, '#16a34a');
}

console.log('OK test_acciones_bloque3.mjs');
