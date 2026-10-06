/**
 * frontend/tests/test_estados_solicitud.mjs
 * U15: la solicitud cuenta solo su historia (Nueva, Asignada, Pendiente por confirmación, Confirmada; Cancelada aparte).
 * U11: cotizar sin la confirmación del cliente (puedeCotizarSinConfirmacion).
 * U18+H31: resumen de la cancelación (resumenCancelacion).
 * Espejo de backend/app/core/textos_actividad.py: backend/tests/test_estados_solicitud.py comprueba la paridad.
 */

import assert from 'node:assert/strict';
import {
  ESTADOS_SC, PASOS_SC, ESTADOS_SC_SIN_CONFIRMAR, MOTIVO_SIN_CONFIRMACION_MIN, MOTIVO_SIN_CONFIRMACION_MAX,
  infoEstadoSolicitud, pasoSolicitud, puedeReiniciar, puedeCotizarSinConfirmacion, resumenCancelacion,
  motivoDeCancelacion, TEXTO_PAPELERA_SIN_FECHA, ESTADOS_SC_HEREDADOS,
} from '../src/lib/estados-solicitud.js';

const VIVOS = {
  BORRADOR: 'Nueva',
  ASIGNADA: 'Asignada',
  PENDIENTE_CONFIRMACION: 'Pendiente por confirmación',
  CONFIRMADA: 'Confirmada',
  CANCELADA: 'Cancelada',
  'N/A_SOPORTE': 'Soporte',
};
const HEREDADOS = {
  COTIZADA: 'Cotizada',
  EN_ESPERA_CONFIRMACION: 'En espera de confirmación',
  RECHAZADA: 'Rechazada',
  VENCIDA: 'Vencida',
};

console.log('--- TEST 1: etiquetas de los 6 estados vivos y de los 4 heredados, sin códigos ---');
{
  for (const [codigo, etiqueta] of Object.entries({ ...VIVOS, ...HEREDADOS })) {
    assert.equal(ESTADOS_SC[codigo]?.label, etiqueta, codigo);
    assert.equal(infoEstadoSolicitud(codigo).label, etiqueta, codigo);
    assert.ok(!etiqueta.includes('_'), codigo);
    assert.notEqual(etiqueta, codigo);
  }
  assert.deepEqual(Object.keys(ESTADOS_SC).sort(), Object.keys({ ...VIVOS, ...HEREDADOS }).sort());
  // Cada entrada conserva la forma que leen el Hub, EstadoBadge y el detalle: {label, color, bg, border}.
  for (const [codigo, info] of Object.entries(ESTADOS_SC)) {
    assert.deepEqual(Object.keys(info).sort(), ['bg', 'border', 'color', 'label'], codigo);
    for (const v of Object.values(info)) assert.equal(typeof v, 'string', codigo);
  }
}

console.log('--- TEST 2: un estado desconocido sale humanizado y en gris (nunca el código crudo) ---');
{
  const info = infoEstadoSolicitud('ALGO_NUEVO');
  assert.equal(info.label, 'Algo nuevo');
  assert.deepEqual({ color: info.color, bg: info.bg, border: info.border },
    { color: '#64748b', bg: '#f1f5f9', border: '#e2e8f0' });
  assert.equal(infoEstadoSolicitud(null).label, '');
  assert.equal(infoEstadoSolicitud(undefined).label, '');
  // Una clave del prototipo de Object no es un estado.
  assert.equal(infoEstadoSolicitud('constructor').label, 'Constructor');
  assert.equal(infoEstadoSolicitud('BORRADOR'), ESTADOS_SC.BORRADOR);
}

console.log('--- TEST 3: pasoSolicitud ---');
{
  const esperado = {
    BORRADOR: 0, ASIGNADA: 1, PENDIENTE_CONFIRMACION: 2, CONFIRMADA: 3,
    // heredados: la solicitud ya pasó por la confirmación (solo historial)
    COTIZADA: 3, EN_ESPERA_CONFIRMACION: 3, RECHAZADA: 3, VENCIDA: 3,
    // sin pasos
    CANCELADA: -1, 'N/A_SOPORTE': -1,
  };
  for (const [e, paso] of Object.entries(esperado)) assert.equal(pasoSolicitud(e), paso, e);
  // Un estado ajeno o vacío no muestra pasos (la etiqueta dice el estado real).
  assert.equal(pasoSolicitud('ENTREGADO'), -1);
  assert.equal(pasoSolicitud(null), -1);
  assert.equal(pasoSolicitud('constructor'), -1);
}

console.log('--- TEST 4: PASOS_SC: los 4 pasos en orden, con su ayuda ---');
{
  assert.deepEqual(PASOS_SC.map((p) => p.clave), ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION', 'CONFIRMADA']);
  assert.deepEqual(PASOS_SC.map((p) => p.label), ['Nueva', 'Asignada', 'Pendiente por confirmación', 'Confirmada']);
  for (const p of PASOS_SC) assert.equal(p.label, ESTADOS_SC[p.clave].label);
  assert.deepEqual(PASOS_SC.map((p) => p.ayuda), [
    'Pasa a Asignada cuando se le asigna un asesor.',
    'Pasa a Pendiente por confirmación cuando se le envía al cliente.',
    'Pasa a Confirmada cuando el cliente abre el enlace y confirma.',
    'El cliente confirmó: el siguiente paso es la cotización.',
  ]);
  PASOS_SC.forEach((p, i) => assert.equal(pasoSolicitud(p.clave), i));
}

console.log('--- TEST 5: estados sin confirmar ---');
{
  assert.deepEqual([...ESTADOS_SC_SIN_CONFIRMAR], ['BORRADOR', 'ASIGNADA', 'PENDIENTE_CONFIRMACION']);
}

console.log('--- TEST 5b (T7 ronda 1, C12): estados heredados (la dona los suma aparte) ---');
{
  assert.deepEqual([...ESTADOS_SC_HEREDADOS], Object.keys(HEREDADOS));
  assert.ok(Object.isFrozen(ESTADOS_SC_HEREDADOS));
  assert.throws(() => { ESTADOS_SC_HEREDADOS.push('BORRADOR'); }, TypeError);
  // Son justamente los que pasoSolicitud pone en el último paso sin estar entre los pasos.
  for (const e of ESTADOS_SC_HEREDADOS) assert.equal(pasoSolicitud(e), PASOS_SC.length - 1, e);
}

console.log('--- TEST 6: las tablas están congeladas en profundidad ---');
{
  for (const t of [ESTADOS_SC, ESTADOS_SC.BORRADOR, PASOS_SC, PASOS_SC[0], ESTADOS_SC_SIN_CONFIRMAR]) {
    assert.ok(Object.isFrozen(t));
  }
  assert.throws(() => { ESTADOS_SC.BORRADOR.label = 'Borrador'; }, TypeError);
  assert.throws(() => { ESTADOS_SC.NUEVO = { label: 'x' }; }, TypeError);
  assert.throws(() => { PASOS_SC.push({ clave: 'X' }); }, TypeError);
  assert.throws(() => { ESTADOS_SC_SIN_CONFIRMAR.push('CONFIRMADA'); }, TypeError);
  assert.ok(Object.isFrozen(infoEstadoSolicitud('ALGO_NUEVO')));
  assert.equal(ESTADOS_SC.BORRADOR.label, 'Nueva');
}

console.log('--- TEST 7: puedeReiniciar ---');
{
  const sin = { cotizacionesActivas: [], pedidosVigentes: [] };
  assert.equal(puedeReiniciar({ estado: 'PENDIENTE_CONFIRMACION' }, sin), true);
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }, sin), true);
  // con documentos activos: arreglo o número (H9 del preflight)
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }, { cotizacionesActivas: [{ id: 1 }], pedidosVigentes: [] }), false);
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }, { cotizacionesActivas: 1, pedidosVigentes: 0 }), false);
  assert.equal(puedeReiniciar({ estado: 'PENDIENTE_CONFIRMACION' }, { cotizacionesActivas: [], pedidosVigentes: [{ id: 9 }] }), false);
  assert.equal(puedeReiniciar({ estado: 'PENDIENTE_CONFIRMACION' }, { cotizacionesActivas: 0, pedidosVigentes: 2 }), false);
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }, { cotizacionesActivas: 0, pedidosVigentes: 0 }), true);
  // ausentes = 0 (la lista no trae pedidos)
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }, { cotizacionesActivas: [] }), true);
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA' }), true);
  // nunca en Cancelada, ni donde reiniciar no cambia nada, ni en heredados o Soporte
  for (const e of ['CANCELADA', 'BORRADOR', 'ASIGNADA', 'COTIZADA', 'N/A_SOPORTE', 'ALGO']) {
    assert.equal(puedeReiniciar({ estado: e }, sin), false, e);
  }
  // un ticket de Soporte Técnico no se reinicia, aunque su estado sea de los que sí
  assert.equal(puedeReiniciar({ estado: 'PENDIENTE_CONFIRMACION', tipo_solicitud: 'Soporte Tecnico' }, sin), false);
  assert.equal(puedeReiniciar({ estado: 'CONFIRMADA', tipo_solicitud: 'Soporte Tecnico' }, sin), false);
  assert.equal(puedeReiniciar(null, sin), false);
  assert.equal(puedeReiniciar(undefined), false);
}

console.log('--- TEST 8: cotizar sin confirmación (U11) ---');
{
  assert.equal(MOTIVO_SIN_CONFIRMACION_MIN, 10);
  // T8A ronda 1: el tope del motivo sale de aquí (una sola fuente; paridad con erp_ventas en test_estados_solicitud.py)
  assert.equal(MOTIVO_SIN_CONFIRMACION_MAX, 500);
  const base = { estado: 'ASIGNADA', advisor_user_id: 5, advisor_name: 'asesor@test',
    tipo_solicitud: 'Cotizacion de Producto', confirmacion_vigente: false };
  const ok = { cotizacionesActivas: [], pedidosVigentes: [], tieneProductos: true };
  const puede = (cambios, opciones = ok) => puedeCotizarSinConfirmacion({ ...base, ...cambios }, opciones);

  assert.equal(puede({}), true, 'ASIGNADA con asesor y productos');
  assert.equal(puede({ estado: 'PENDIENTE_CONFIRMACION' }), true);
  assert.equal(puede({ estado: 'BORRADOR' }), false, 'Nueva');
  // "hay asesor" = advisor_user_id (el servidor responde 400 sin él aunque haya nombre)
  assert.equal(puede({ advisor_user_id: null }), false);
  assert.equal(puede({ advisor_user_id: undefined }), false);
  // documentos activos: arreglo o número
  assert.equal(puede({}, { ...ok, cotizacionesActivas: [{ id: 3 }] }), false, 'con COT activa');
  assert.equal(puede({}, { ...ok, cotizacionesActivas: 1 }), false);
  assert.equal(puede({}, { ...ok, pedidosVigentes: [{ id: 4 }] }), false, 'con PVEN vigente');
  assert.equal(puede({}, { ...ok, pedidosVigentes: 1 }), false);
  assert.equal(puede({}, { tieneProductos: true }), true, 'documentos ausentes = 0');
  // productos
  assert.equal(puede({}, { ...ok, tieneProductos: false }), false, 'sin productos');
  assert.equal(puede({}, { cotizacionesActivas: 0, pedidosVigentes: 0 }), false, 'tieneProductos ausente');
  // Confirmada: solo si su confirmación ya no vale
  assert.equal(puede({ estado: 'CONFIRMADA', confirmacion_vigente: true }), false, 'CONFIRMADA vigente');
  assert.equal(puede({ estado: 'CONFIRMADA', confirmacion_vigente: false }), true, 'CONFIRMADA no vigente');
  assert.equal(puede({ estado: 'CONFIRMADA', confirmacion_vigente: undefined }), false, 'sin el dato no se ofrece');
  // Soporte, Cancelada, heredados
  assert.equal(puede({ tipo_solicitud: 'Soporte Tecnico' }), false, 'Soporte');
  assert.equal(puede({ estado: 'N/A_SOPORTE' }), false);
  assert.equal(puede({ estado: 'CANCELADA' }), false);
  assert.equal(puede({ estado: 'COTIZADA' }), false);
  assert.equal(puedeCotizarSinConfirmacion(null, ok), false);
  assert.equal(puedeCotizarSinConfirmacion(undefined), false);
}

console.log('--- TEST 9: resumen de la cancelación (U18+H31) ---');
{
  const cancelacion = (id, cambios = {}) => ({
    id, action: 'CANCELLED', description: 'Cancelada: El cliente compró en otro lado',
    old_estado: 'PENDIENTE_CONFIRMACION', new_estado: 'CANCELADA', user_name: 'asesor@test',
    created_at: '2026-10-04T15:30:00Z', extra_data: { motivo: 'El cliente compró en otro lado', cambios: [] }, ...cambios,
  });
  const otro = { id: 50, action: 'CREATED', description: 'Solicitud creada', user_name: 'x', created_at: '2026-10-01T10:00:00Z' };

  // a) con razón y renglón CANCELLED: motivo, por y fecha
  let r = resumenCancelacion(
    { estado: 'CANCELADA', razon_cancelacion: 'El cliente compró en otro lado', eliminada_at: '2026-10-04T15:30:01Z',
      se_conserva_en_papelera: false, purga_programada: '2026-11-03T15:30:01Z' },
    [otro, cancelacion(51)]);
  assert.equal(r.motivo, 'El cliente compró en otro lado');
  assert.equal(r.por, 'asesor@test');
  assert.equal(r.fecha, '2026-10-04T15:30:00Z');
  assert.equal(r.seConserva, false);
  assert.equal(r.purga, '2026-11-03T15:30:01Z');
  assert.equal(r.papelera, 'Se eliminará definitivamente el 03/11/2026 si no la restauras desde la Papelera');

  // b) sin razón: extra_data.motivo del último CANCELLED (T2B)
  r = resumenCancelacion({ razon_cancelacion: null }, [cancelacion(60, { extra_data: { motivo: 'Precio alto' } })]);
  assert.equal(r.motivo, 'Precio alto');

  // c) renglón viejo sin extra_data: el texto después de 'Cancelada: '
  r = resumenCancelacion({ razon_cancelacion: '   ' }, [cancelacion(61, { extra_data: null, description: 'Cancelada: Ya no lo necesita' })]);
  assert.equal(r.motivo, 'Ya no lo necesita');

  // d) SC vieja que solo tiene el motivo en las notas (antes de la limpieza de T12); la última marca gana
  r = resumenCancelacion({ notas: 'Entrega en obra\n[CANCELADA] Razón: Cliente desistió', razon_cancelacion: null }, []);
  assert.equal(r.motivo, 'Cliente desistió');
  r = resumenCancelacion({ notas: 'Nota\n[CANCELADA] Razón: Primera vez\n[CANCELADA] Razón: Segunda vez' }, null);
  assert.equal(r.motivo, 'Segunda vez');
  // la descripción que no empieza por 'Cancelada: ' no inventa nada y se sigue a las notas
  r = resumenCancelacion({ notas: '[CANCELADA] Razón: De las notas' },
    [cancelacion(62, { extra_data: {}, description: 'Solicitud cancelada' })]);
  assert.equal(r.motivo, 'De las notas');

  // e) sin nada: no se inventa un motivo
  r = resumenCancelacion({ estado: 'CANCELADA', notas: 'Entrega en obra' }, []);
  assert.equal(r.motivo, 'No se registró el motivo');

  // f) sin renglón CANCELLED: la fecha sale de eliminada_at y no hay autor
  r = resumenCancelacion({ razon_cancelacion: 'X', eliminada_at: '2026-09-01T12:00:00Z' }, [otro]);
  assert.equal(r.por, null);
  assert.equal(r.fecha, '2026-09-01T12:00:00Z');
  r = resumenCancelacion({ razon_cancelacion: 'X' }, undefined);
  assert.equal(r.fecha, null);

  // g) cancelada, restaurada y cancelada otra vez: el último renglón (por id, aunque llegue en otro orden)
  const primera = cancelacion(70, { user_name: 'primero', created_at: '2026-09-01T10:00:00Z', extra_data: { motivo: 'Uno' } });
  const segunda = cancelacion(90, { user_name: 'segundo', created_at: '2026-09-20T10:00:00Z', extra_data: { motivo: 'Dos' } });
  r = resumenCancelacion({}, [segunda, otro, primera]);
  assert.deepEqual([r.motivo, r.por, r.fecha], ['Dos', 'segundo', '2026-09-20T10:00:00Z']);

  // h) un CANCELLED de Cancelada a Cancelada (enviar a la papelera, Bloque 1) no es la cancelación
  const papeleraVieja = cancelacion(95, { old_estado: 'CANCELADA', user_name: 'papelera', created_at: '2026-09-25T10:00:00Z',
    extra_data: null, description: 'Cancelada: Enviada a papelera por asesor' });
  r = resumenCancelacion({}, [primera, segunda, papeleraVieja]);
  assert.deepEqual([r.motivo, r.por, r.fecha], ['Dos', 'segundo', '2026-09-20T10:00:00Z']);
  r = resumenCancelacion({}, [papeleraVieja]);
  assert.deepEqual([r.motivo, r.por], ['Enviada a papelera por asesor', 'papelera'], 'si es el único, se usa');

  // i) Papelera: los campos solo vienen con la SC CANCELADA y purga_programada puede ser null (T2B)
  r = resumenCancelacion({ razon_cancelacion: 'X' }, []);
  assert.deepEqual([r.seConserva, r.purga, r.papelera], [null, null, null], 'ausentes');
  r = resumenCancelacion({ se_conserva_en_papelera: true, purga_programada: null }, []);
  assert.deepEqual([r.seConserva, r.purga], [true, null]);
  assert.equal(r.papelera, 'Se conserva en la Papelera como historial (tiene documentos vinculados)');
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: null }, []);
  assert.equal(r.papelera, 'No se elimina automáticamente: no tiene fecha de envío a la Papelera');
  // la fecha de purga se muestra en hora de Colombia (03:00 UTC del 5 = 22:00 del 4 en Bogotá)
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: '2026-11-05T03:00:00Z' }, []);
  assert.equal(r.papelera, 'Se eliminará definitivamente el 04/11/2026 si no la restauras desde la Papelera');
  // una fecha sin zona (formato viejo del API) se lee como UTC
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: '2026-11-05T03:00:00' }, []);
  assert.equal(r.papelera, 'Se eliminará definitivamente el 04/11/2026 si no la restauras desde la Papelera');
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: '2026-11-05 03:00:00.123456' }, []);
  assert.equal(r.papelera, 'Se eliminará definitivamente el 04/11/2026 si no la restauras desde la Papelera');
  // una fecha de calendario (sin hora) es ese mismo día: no se corre a la víspera por la zona
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: '2026-11-03' }, []);
  assert.equal(r.papelera, 'Se eliminará definitivamente el 03/11/2026 si no la restauras desde la Papelera');
  // una fecha inválida no se muestra (cae al texto sin purga)
  r = resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: 'no es fecha' }, []);
  assert.equal(r.papelera, 'No se elimina automáticamente: no tiene fecha de envío a la Papelera');

  // j) entradas vacías
  r = resumenCancelacion(null, null);
  assert.deepEqual(r, { motivo: 'No se registró el motivo', por: null, fecha: null, seConserva: null, purga: null, papelera: null });
}

console.log('--- TEST 10 (T7 ronda 1): motivoDeCancelacion, el único lector del motivo para la lista y la Papelera ---');
{
  // Sin motivo: '' (quien lo muestra pone 'Sin motivo registrado'); nunca se inventa uno.
  for (const vacio of [{}, null, undefined, { razon_cancelacion: '', notas: '' }, { razon_cancelacion: null, notas: null }]) {
    assert.equal(motivoDeCancelacion(vacio), '', `vacío: ${JSON.stringify(vacio)}`);
  }
  // razon_cancelacion recortada, y gana sobre las notas.
  assert.equal(motivoDeCancelacion({ razon_cancelacion: '  Ya no lo necesita  ' }), 'Ya no lo necesita');
  assert.equal(motivoDeCancelacion({ razon_cancelacion: 'Compró en otro lado', notas: '[CANCELADA] Razón: Otra' }), 'Compró en otro lado');
  // razon en blanco: la marca de las notas viejas (hasta la limpieza de T12).
  assert.equal(motivoDeCancelacion({ razon_cancelacion: '   ', notas: 'Entrega en obra\n[CANCELADA] Razón: Ya no lo necesita' }), 'Ya no lo necesita');
  // Varias marcas (cancelada, restaurada y vuelta a cancelar): la última.
  assert.equal(motivoDeCancelacion({ notas: '[CANCELADA] Razón: Primera\nnota\n[CANCELADA] Razón: Segunda' }), 'Segunda');
  // La última marca vacía no borra la anterior.
  assert.equal(motivoDeCancelacion({ notas: '[CANCELADA] Razón: Primera\n[CANCELADA] Razón:   ' }), 'Primera');
  assert.equal(motivoDeCancelacion({ notas: '[CANCELADA] Razón:' }), '');
  // Notas null o que no son texto, y una razón que no es texto: no rompen y no inventan.
  assert.equal(motivoDeCancelacion({ razon_cancelacion: 'Motivo', notas: null }), 'Motivo');
  assert.equal(motivoDeCancelacion({ notas: 123 }), '');
  assert.equal(motivoDeCancelacion({ razon_cancelacion: 42, notas: '[CANCELADA] Razón: De las notas' }), 'De las notas');
  assert.equal(motivoDeCancelacion({ razon_cancelacion: { texto: 'x' } }), '');
  // Un 'Motivo:' cualquiera (p. ej. la nota de una devolución) no es el motivo de la cancelación.
  assert.equal(motivoDeCancelacion({ notas: 'DEVOLUCION VEN:PVEN-1 PEC: MOTIVO:Producto incorrecto' }), '');
  // resumenCancelacion sigue igual: razón -> renglón CANCELLED -> notas -> 'No se registró el motivo'.
  const renglon = [{ id: 1, action: 'CANCELLED', old_estado: 'ASIGNADA', description: 'Cancelada: Del renglón', user_name: 'a@b' }];
  assert.equal(resumenCancelacion({ notas: '[CANCELADA] Razón: De las notas' }, renglon).motivo, 'Del renglón');
  assert.equal(resumenCancelacion({ notas: '[CANCELADA] Razón: De las notas' }, []).motivo, 'De las notas');
  assert.equal(resumenCancelacion({ razon_cancelacion: ' La razón ', notas: '[CANCELADA] Razón: De las notas' }, renglon).motivo, 'La razón');
  assert.equal(resumenCancelacion({}, []).motivo, 'No se registró el motivo');
  // El texto oficial de una SC sin fecha de envío a la Papelera es uno solo (lo importa listas-ventas.js).
  assert.equal(TEXTO_PAPELERA_SIN_FECHA, 'No se elimina automáticamente: no tiene fecha de envío a la Papelera');
  assert.equal(resumenCancelacion({ se_conserva_en_papelera: false, purga_programada: null }, []).papelera, TEXTO_PAPELERA_SIN_FECHA);
}

console.log('OK test_estados_solicitud');
