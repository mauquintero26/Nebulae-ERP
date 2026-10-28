/**
 * frontend/tests/test_analisis.mjs
 * Bloque 4, T3A (ANALISIS-base punto 1, R4, R7, R13, C12, RP27, RP73 y RP74): las piezas puras de las pestañas
 * Análisis (lib/analisis.js). Períodos con los mismos textos de error del servidor (core/periodos.py), la consulta,
 * la variación con la regla única de RP27 (sobre lib/kpis.js, tonos 'bien'/'mal'/'neutro'), el formato (lib/kpis.js
 * más 'dias' y 'unidades'), los ejes cortos, las fechas de las cubetas sin Intl, los colores (una sola tabla
 * HEX_CLASE_TAILWIND, con el rojo de «Perdido»), los enlaces a cada documento (VEN = PVEN) y la lectura del contrato
 * de core/analisis.py sin rellenar cifras. Sin preferencias (R4): esos casos están en test_preferencias.mjs.
 */

import assert from 'node:assert/strict';
import {
  PERIODOS, PERIODO_POR_DEFECTO, TOPS, FOCOS_VENTAS, MAX_DIAS, ERRORES_PERIODO, validarPeriodo, errorPeriodo,
  consultaAnalisis, infoVariacion, formatearValor, pesosCorto, etiquetaFecha, PALETA, GRIS_OTROS, COLOR_ANTERIOR, POSITIVO,
  NEGATIVO, colorSegmento, HEX_CLASE_TAILWIND, hexDeClaseTailwind, enlaceDocumento, normalizarAnalisis, resumenAccesible,
} from '../src/lib/analisis.js';
import { variacionPct, direccionVariacion, tonoVariacion, mejorDesde } from '../src/lib/kpis.js';

const MENOS = '−';
const HOY = '2026-10-28';

console.log('--- TEST 1: constantes (períodos, tops y focos de R13) ---');
{
  assert.deepEqual(PERIODOS, [
    { clave: '7d', etiqueta: '7 días' }, { clave: '30d', etiqueta: '30 días' }, { clave: '90d', etiqueta: '90 días' },
    { clave: 'mes', etiqueta: 'Este mes' }, { clave: '12m', etiqueta: '12 meses' }, { clave: 'personalizado', etiqueta: 'Personalizado' },
  ]);
  assert.deepEqual(PERIODO_POR_DEFECTO, { clave: '30d' });
  assert.deepEqual(TOPS, [5, 10, 25]);
  assert.deepEqual(FOCOS_VENTAS, [
    { clave: 'hub', etiqueta: 'Todo' }, { clave: 'sc', etiqueta: 'Solicitudes' }, { clave: 'cot', etiqueta: 'Cotizaciones' },
    { clave: 'pven', etiqueta: 'Pedidos' },
  ]);
  assert.equal(MAX_DIAS, 731);
  for (const c of [PERIODOS, PERIODO_POR_DEFECTO, TOPS, FOCOS_VENTAS, ERRORES_PERIODO]) assert.ok(Object.isFrozen(c));
}

console.log('--- TEST 2: validarPeriodo y errorPeriodo (los seis textos del servidor) ---');
{
  // Los textos exactos de backend/app/core/periodos.py (ERRORES).
  assert.deepEqual(ERRORES_PERIODO, {
    periodo: 'Período no válido.',
    sin_fechas: 'Elige la fecha inicial y la final.',
    formato: 'Las fechas deben tener el formato AAAA-MM-DD.',
    orden: 'La fecha inicial debe ser anterior o igual a la final.',
    futuro: 'La fecha final no puede ser posterior a hoy.',
    largo: 'El período no puede ser mayor a 2 años.',
  });
  const p = (desde, hasta) => ({ clave: 'personalizado', desde, hasta });
  const casos = [
    [p(undefined, undefined), ERRORES_PERIODO.sin_fechas, 'personalizado sin fechas'],
    [p('2026-09-01', '  '), ERRORES_PERIODO.sin_fechas, 'una fecha vacía'],
    [p('2026-9-1', '2026-09-30'), ERRORES_PERIODO.formato, 'formato'],
    [p('2026-02-30', '2026-03-01'), ERRORES_PERIODO.formato, 'una fecha que no existe'],
    [p('2026-09-30', '2026-09-01'), ERRORES_PERIODO.orden, 'desde mayor que hasta'],
    [p('2026-10-01', '2026-10-29'), ERRORES_PERIODO.futuro, 'fecha futura'],
    [p('2024-08-20', '2026-10-28'), ERRORES_PERIODO.largo, '800 días'],
    [p('2024-10-27', '2026-10-28'), ERRORES_PERIODO.largo, '732 días'],
    [{ clave: 'semana' }, ERRORES_PERIODO.periodo, 'una clave que no existe'],
    [null, ERRORES_PERIODO.periodo, 'nada'],
  ];
  for (const [periodo, error, nombre] of casos) {
    assert.equal(errorPeriodo(periodo, HOY), error, nombre);
    assert.equal(validarPeriodo(periodo, HOY), null, nombre);
  }
  const bueno = p('2026-09-01', '2026-09-30');
  assert.equal(validarPeriodo(bueno, HOY), bueno, 'uno válido sale igual');
  const dosAnios = p('2024-10-28', '2026-10-28');
  assert.equal(validarPeriodo(dosAnios, HOY), dosAnios, '731 días sí');
  assert.equal(validarPeriodo(p('2026-10-28', '2026-10-28'), HOY)?.clave, 'personalizado', 'hoy sí');
  const siete = { clave: '7d' };
  assert.equal(validarPeriodo(siete, HOY), siete, "'7d' sale igual");
  assert.equal(validarPeriodo('7d', HOY), '7d', 'también como texto');
  assert.equal(validarPeriodo({ clave: '30d', desde: 'basura' }, HOY)?.clave, '30d', 'las fechas solo cuentan en personalizado');
  assert.equal(errorPeriodo({ clave: 'mes' }), null, 'sin hoy: el día de Colombia');
}

console.log('--- TEST 3: consultaAnalisis ---');
{
  assert.equal(
    consultaAnalisis({ clave: 'personalizado', desde: '2026-09-01', hasta: '2026-09-30' }, 10, { foco: 'sc', producto: '' }),
    'periodo=personalizado&desde=2026-09-01&hasta=2026-09-30&top=10&foco=sc',
  );
  assert.equal(consultaAnalisis({ clave: '30d' }, 5, { foco: 'hub' }), 'periodo=30d&top=5&foco=hub');
  assert.equal(consultaAnalisis({ clave: '7d', desde: '2026-09-01' }, 25), 'periodo=7d&top=25', 'desde y hasta solo en personalizado');
  assert.equal(consultaAnalisis('mes', 5, { bodega: 3, producto: null, foco: undefined }), 'periodo=mes&top=5&bodega=3');
  assert.equal(consultaAnalisis(PERIODO_POR_DEFECTO, null), 'periodo=30d');
  assert.equal(consultaAnalisis({ clave: '30d' }, 5, { producto: 'colchón doble' }), 'periodo=30d&top=5&producto=colch%C3%B3n%20doble');
}

console.log('--- TEST 4: infoVariacion (RP27: {valor, anterior, mejor, es_foto}, tonos bien/mal/neutro) ---');
{
  const iv = (kpi) => { const r = infoVariacion(kpi); return { texto: r.texto, tono: r.tono, flecha: r.flecha }; };
  assert.deepEqual(iv({ valor: 112.5, anterior: 100, mejor: 'sube' }), { texto: '+12,5 %', tono: 'bien', flecha: 'sube' });
  assert.deepEqual(iv({ valor: 97, anterior: 100, mejor: 'baja' }), { texto: `${MENOS}3 %`, tono: 'bien', flecha: 'baja' });
  assert.deepEqual(iv({ valor: 108, anterior: 100, mejor: 'baja' }), { texto: '+8 %', tono: 'mal', flecha: 'sube' });
  assert.deepEqual(iv({ valor: 90, anterior: 100, mejor: 'sube' }), { texto: `${MENOS}10 %`, tono: 'mal', flecha: 'baja' });
  assert.deepEqual(iv({ valor: 150, anterior: 100, mejor: 'neutro' }), { texto: '+50 %', tono: 'neutro', flecha: 'sube' });
  assert.deepEqual(iv({ valor: 100, anterior: 100, mejor: 'sube' }), { texto: 'Sin cambio', tono: 'neutro', flecha: null });
  assert.deepEqual(iv({ valor: 0, anterior: 0, mejor: 'sube' }), { texto: 'Sin cambio', tono: 'neutro', flecha: null },
    'anterior 0 y actual 0');
  assert.deepEqual(iv({ valor: 5, anterior: 0, mejor: 'sube' }), { texto: 'Nuevo', tono: 'bien', flecha: 'sube' }, 'anterior 0 y actual 5');
  assert.deepEqual(iv({ valor: 5, anterior: 0, mejor: 'baja' }).tono, 'mal');
  assert.deepEqual(iv({ valor: -5, anterior: 0, mejor: 'sube' }), { texto: 'Nuevo', tono: 'mal', flecha: 'baja' },
    'el caso unificado (el mismo de test_kpis.mjs)');
  // r1 (punto 3): una sola regla de dirección y de tono: la tarjeta (lib/kpis.js) y Análisis dan lo mismo.
  for (const kpi of [{ valor: -5, anterior: 0, mejor: 'sube' }, { valor: 5, anterior: 0, mejor: 'baja' },
    { valor: 112.5, anterior: 100, mejor: 'sube' }, { valor: 97, anterior: 100, mejor: 'baja' }, { valor: 0, anterior: 0, mejor: 'sube' },
    { valor: -5, anterior: 0, mejor: 'neutro' }]) {
    const v = variacionPct(kpi.valor, kpi.anterior);
    const r = infoVariacion(kpi);
    assert.deepEqual([r.flecha, r.tono], [direccionVariacion(v), tonoVariacion(v, mejorDesde(kpi.mejor))], JSON.stringify(kpi));
  }
  assert.deepEqual(iv({ valor: 5, anterior: null, mejor: 'sube' }), { texto: '—', tono: 'neutro', flecha: null }, 'anterior null');
  assert.deepEqual(iv({ valor: null, anterior: 100, mejor: 'sube' }), { texto: '—', tono: 'neutro', flecha: null });
  assert.deepEqual(iv({ valor: 5, anterior: 3, mejor: 'sube', es_foto: true }), { texto: 'Hoy', tono: 'neutro', flecha: null });
  assert.deepEqual(iv(null), { texto: '—', tono: 'neutro', flecha: null });
  // No lee variacion_pct: None no distingue «Nuevo» de «sin comparación».
  assert.equal(infoVariacion({ valor: 5, anterior: 0, mejor: 'sube', variacion_pct: null }).texto, 'Nuevo');
  // El texto para lectores de pantalla.
  assert.equal(infoVariacion({ valor: 112.5, anterior: 100, mejor: 'sube' }).lector, 'Sube 12,5 % frente al período anterior');
  assert.equal(infoVariacion({ valor: 97, anterior: 100, mejor: 'sube' }, { frente: 'frente a los 30 días anteriores' }).lector,
    'Baja 3 % frente a los 30 días anteriores');
  assert.equal(infoVariacion({ valor: 1, anterior: 1 }).lector, 'Sin cambio frente al período anterior');
  assert.ok(infoVariacion({ valor: 1, es_foto: true }).lector.length > 0);
}

console.log('--- TEST 5: formatearValor (lib/kpis.js más dias y unidades) ---');
{
  assert.equal(formatearValor(4927538.46, 'pesos'), '$4.927.538');
  assert.equal(formatearValor(45.24, 'porcentaje'), '45,2 %');
  assert.equal(formatearValor(null, 'pesos'), '—');
  assert.equal(formatearValor(1234, 'entero'), '1.234');
  assert.equal(formatearValor(1234, 'numero'), '1.234');
  assert.equal(formatearValor(3.46, 'dias'), '3,5 días');
  assert.equal(formatearValor(1, 'dias'), '1 día');
  assert.equal(formatearValor(0, 'dias'), '0 días');
  assert.equal(formatearValor(1234, 'unidades'), '1.234 u.');
  assert.equal(formatearValor(undefined, 'dias'), '—');
  assert.equal(formatearValor(null, 'unidades'), '—');
  assert.equal(formatearValor('x', 'dias'), '—', 'nunca inventa un número');
}

console.log('--- TEST 6: pesosCorto (solo para los ejes) ---');
{
  assert.equal(pesosCorto(4927538), '$4,9 M');
  assert.equal(pesosCorto(12000000), '$12 M');
  assert.equal(pesosCorto(450000), '$450 mil');
  assert.equal(pesosCorto(900), '$900');
  assert.equal(pesosCorto(-2500000), '-$2,5 M');
  assert.equal(pesosCorto(0), '$0');
  assert.equal(pesosCorto(4500), '$4,5 mil');
  assert.equal(pesosCorto(999960), '$1 M', 'no sale «1.000 mil»');
  assert.equal(pesosCorto(1500000000), '$1,5 mil M');
  assert.equal(pesosCorto(null), '—');
}

console.log('--- TEST 7: etiquetaFecha (tabla propia de meses, sin zona horaria) ---');
{
  assert.equal(etiquetaFecha('2026-09-04', 'dia'), '4 sept');
  assert.equal(etiquetaFecha('2026-09-01', 'semana'), 'Sem. 1 sept');
  assert.equal(etiquetaFecha('2026-09-01', 'mes'), 'sept 2026');
  assert.equal(etiquetaFecha('2026-12-31', 'dia'), '31 dic', 'un 31 de diciembre no se corre de día');
  assert.equal(etiquetaFecha('2026-12-31', 'mes'), 'dic 2026');
  assert.equal(etiquetaFecha('2027-01-01', 'semana'), 'Sem. 1 ene');
  assert.equal(etiquetaFecha('2026-05-09T23:30:00Z', 'dia'), '9 may', 'se lee por partes, sin pasar a otra zona');
  assert.equal(etiquetaFecha('nada', 'dia'), 'nada');
  assert.equal(etiquetaFecha(null, 'dia'), '');
}

console.log('--- TEST 8: colores (PALETA, GRIS_OTROS, colorSegmento y HEX_CLASE_TAILWIND de RP73) ---');
{
  assert.deepEqual(PALETA, ['#4f46e5', '#0d9488', '#f59e0b', '#0ea5e9', '#8b5cf6', '#e11d48', '#65a30d', '#64748b']);
  assert.deepEqual([GRIS_OTROS, COLOR_ANTERIOR, POSITIVO, NEGATIVO], ['#cbd5e1', '#94a3b8', '#059669', '#e11d48']);
  // Recorre la PALETA en orden (y vuelve a empezar); '_otros' y los «Sin …» van en gris; el color propio gana.
  for (let i = 0; i < 10; i += 1) assert.equal(colorSegmento(i, { clave: `c${i}` }), PALETA[i % 8], `segmento ${i}`);
  assert.equal(colorSegmento(2, { clave: '_otros', etiqueta: 'Otros' }), GRIS_OTROS);
  assert.equal(colorSegmento(1, { clave: 'nada', etiqueta: 'Sin categoría' }), GRIS_OTROS);
  assert.equal(colorSegmento(0, { clave: 'x', color: '#123456' }), '#123456');
  assert.equal(colorSegmento(0, { clave: 'x', color: 'bg-red-500' }), '#ef4444', 'una clase de Tailwind pasa a hex');
  assert.equal(colorSegmento(3), PALETA[3]);
  // Una sola tabla: las 12 clases de crm/page.tsx con sus fondos -50, más el rojo.
  assert.equal(Object.keys(HEX_CLASE_TAILWIND).length, 26);
  assert.equal(HEX_CLASE_TAILWIND['bg-blue-500'], '#3b82f6');
  assert.equal(HEX_CLASE_TAILWIND['bg-red-500'], '#ef4444');
  assert.equal(HEX_CLASE_TAILWIND['bg-red-50'], '#fef2f2');
  assert.equal(HEX_CLASE_TAILWIND['bg-emerald-50'], '#f0fdf4', 'tal como está hoy en el CRM');
  assert.ok(Object.isFrozen(HEX_CLASE_TAILWIND));
  for (const color of ['blue', 'cyan', 'indigo', 'emerald', 'amber', 'rose', 'purple', 'slate', 'green', 'teal', 'orange', 'pink', 'red']) {
    assert.match(HEX_CLASE_TAILWIND[`bg-${color}-500`], /^#[0-9a-f]{6}$/, color);
    assert.match(HEX_CLASE_TAILWIND[`bg-${color}-50`], /^#[0-9a-f]{6}$/, `${color}-50`);
  }
  assert.equal(hexDeClaseTailwind('bg-blue-500'), '#3b82f6');
  assert.equal(hexDeClaseTailwind('bg-fucsia-500'), '#94a3b8', 'una clase desconocida');
  assert.equal(hexDeClaseTailwind(null), '#94a3b8');
}

console.log('--- TEST 9: enlaceDocumento (los 7 tipos; VEN = PVEN, RP74) ---');
{
  assert.equal(enlaceDocumento('SC', 5), '/dashboard/ventas/solicitud/5');
  assert.equal(enlaceDocumento('COT', 6), '/dashboard/ventas/cotizacion/6');
  assert.equal(enlaceDocumento('PVEN', 7), '/dashboard/ventas/venta/7');
  assert.equal(enlaceDocumento('VEN', 7), '/dashboard/ventas/venta/7', "'VEN' es el mismo tipo que 'PVEN'");
  assert.equal(enlaceDocumento('PEC', 8), '/dashboard/compras/pedidos?id=8');
  assert.equal(enlaceDocumento('ENINV', 9), '/dashboard/compras/recepciones/9');
  assert.equal(enlaceDocumento('GASTO', 10), '/dashboard/finanzas/gastos');
  assert.equal(enlaceDocumento('KARDEX', 11), '/dashboard/inventario/kardex');
  assert.equal(enlaceDocumento('XYZ', 1), null, 'un tipo desconocido');
  assert.equal(enlaceDocumento(null, 1), null);
  assert.equal(enlaceDocumento('SC', null), null, 'un documento sin id');
  assert.equal(enlaceDocumento('sc', 5), '/dashboard/ventas/solicitud/5');
  // Con return_to (D22: el bloqueo «Ábrela para enviar.» vuelve a la lista).
  assert.equal(enlaceDocumento('SC', 5, { returnTo: '/dashboard/ventas/solicitudes' }),
    '/dashboard/ventas/solicitud/5?return_to=%2Fdashboard%2Fventas%2Fsolicitudes');
  assert.equal(enlaceDocumento('PEC', 8, { returnTo: '/dashboard/compras' }), '/dashboard/compras/pedidos?id=8&return_to=%2Fdashboard%2Fcompras');
}

console.log('--- TEST 10: normalizarAnalisis (completa con null o [], nunca rellena cifras) ---');
{
  const vacio = normalizarAnalisis(null);
  assert.deepEqual(vacio, {
    periodo: null, kpis: [], linea: null, donas: [], barras: null, movimientos: null, ranking: null,
    filtros: { foco: null, top: null, producto: null, bodega: null }, avisos: [], generado_en: null,
  });
  const r = normalizarAnalisis({
    status: 'success',
    data: {
      periodo: { clave: '30d', etiqueta: '30 días' },
      kpis: [{ clave: 'vendido', etiqueta: 'Vendido', formato: 'pesos' }, { clave: 'n', valor: 0, anterior: 3, mejor: 'sube' }],
      linea: { titulo: 'Ventas', series: [{ clave: 'actual', valores: [1, null] }] },
      donas: [{ clave: 'd', titulo: 'Por canal' }],
      movimientos: { titulo: 'Recientes' },
      filtros: { foco: 'sc' },
      avisos: ['Sin IVA', 3],
    },
  });
  assert.equal(r.kpis[0].valor, null, 'un kpi sin valor queda en null, no en 0');
  assert.equal(r.kpis[0].anterior, null);
  assert.equal(r.kpis[0].es_foto, false);
  assert.equal(r.kpis[1].valor, 0, 'un 0 de verdad se conserva');
  assert.equal(r.periodo.desde, null);
  assert.deepEqual(r.linea.fechas, []);
  assert.deepEqual(r.linea.series[0].valores, [1, null]);
  assert.equal(r.linea.total, null);
  assert.deepEqual(r.donas[0].segmentos, []);
  assert.equal(r.donas[0].total, null);
  assert.deepEqual(r.movimientos.filas, []);
  assert.equal(r.barras, null);
  assert.equal(r.ranking, null);
  assert.deepEqual(r.filtros, { foco: 'sc', top: null, producto: null, bodega: null });
  assert.deepEqual(r.avisos, ['Sin IVA'], 'solo textos');
  // También acepta el bloque data suelto.
  assert.equal(normalizarAnalisis({ kpis: [{ clave: 'a', valor: 3 }] }).kpis[0].valor, 3);
}

console.log('--- TEST 11: resumenAccesible ---');
{
  assert.equal(
    resumenAccesible({ titulo: 'Ventas en el tiempo', formato: 'pesos', total: 4927538, total_anterior: 4380034.67 }),
    'Ventas en el tiempo: total $4.927.538, subió 12,5 % frente al período anterior',
  );
  assert.equal(
    resumenAccesible({ titulo: 'Pedidos', formato: 'entero', total: 90, total_anterior: 100 }),
    'Pedidos: total 90, bajó 10 % frente al período anterior',
  );
  assert.equal(resumenAccesible({ titulo: 'Pedidos', formato: 'entero', total: 5, total_anterior: 5 }),
    'Pedidos: total 5, sin cambio frente al período anterior');
  assert.equal(resumenAccesible({ titulo: 'Pedidos', formato: 'entero', total: 5, total_anterior: null }), 'Pedidos: total 5');
  assert.equal(resumenAccesible({ titulo: 'Pedidos', formato: 'entero', total: null, total_anterior: 3 }), 'Pedidos: total —');
  assert.equal(resumenAccesible(null), '');
}

console.log('✓ lib/analisis.js: períodos, consulta, variación, formato, ejes, fechas, colores, enlaces y contrato.');
