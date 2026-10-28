/**
 * frontend/tests/test_analisis.mjs
 * Bloque 4, T3A (ANALISIS-base punto 1, R4, R7, R13, C12, RP27, RP73 y RP74): las piezas puras de las pestañas
 * Análisis (lib/analisis.js). Períodos con los mismos textos de error del servidor (core/periodos.py), la consulta,
 * la variación con la regla única de RP27 (sobre lib/kpis.js, tonos 'bien'/'mal'/'neutro'), el formato (lib/kpis.js
 * más 'dias' y 'unidades'), los ejes cortos, las fechas de las cubetas sin Intl, los colores (una sola tabla
 * HEX_CLASE_TAILWIND, con el rojo de «Perdido»), los enlaces a cada documento (VEN = PVEN) y la lectura del contrato
 * de core/analisis.py sin rellenar cifras. Sin preferencias (R4): esos casos están en test_preferencias.mjs.
 * T5B (TEST 12 en adelante): la lógica pura de las piezas de components/analisis (el color del módulo y de las series,
 * los ejes, «Sin datos en este período», el resumen de la dona y las barras, el ranking, los movimientos y la grilla de
 * container queries) y el fuente de los ocho archivos (sin DOM en node), al estilo de test_tabla.mjs.
 */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import * as analisis from '../src/lib/analisis.js';
import {
  PERIODOS, PERIODO_POR_DEFECTO, TOPS, FOCOS_VENTAS, MAX_DIAS, ERRORES_PERIODO, validarPeriodo, errorPeriodo,
  consultaAnalisis, infoVariacion, formatearValor, pesosCorto, etiquetaFecha, PALETA, GRIS_OTROS, COLOR_ANTERIOR, POSITIVO,
  NEGATIVO, colorSegmento, HEX_CLASE_TAILWIND, hexDeClaseTailwind, enlaceDocumento, normalizarAnalisis, resumenAccesible,
} from '../src/lib/analisis.js';
import { variacionPct, direccionVariacion, tonoVariacion, mejorDesde, clasesFranja } from '../src/lib/kpis.js';

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
  // Una sola tabla: las 12 clases de crm/page.tsx con sus fondos -50, más el rojo (26, T3A), y los -600 de los 9
  // AccentColor de components/ui/colors.ts (T5B: el color del módulo en los gráficos, TEST 12).
  assert.equal(Object.keys(HEX_CLASE_TAILWIND).length, 35);
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

// ─── T5B: la lógica pura de las piezas de components/analisis ───────────────────────
// (Las funciones nuevas se leen del espacio de nombres: antes de existir, su bloque falla con «no es una función».)

/** El contraste WCAG de dos '#rrggbb'. */
function contraste(a, b) {
  const lum = (hex) => {
    const [r, g, b2] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b2;
  };
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

console.log('--- TEST 12 (T5B): el color del módulo y de las series (colorDeAcento, conAlfa, coloresSeries) ---');
{
  const { colorDeAcento, conAlfa, coloresSeries } = analisis;
  // Los -600 de los 9 AccentColor, en la tabla única (RP73), con los hex de Tailwind de hoy (los de ACCENTS.buttonBg).
  const SEISCIENTOS = {
    amber: '#d97706', rose: '#e11d48', orange: '#ea580c', indigo: '#4f46e5', purple: '#9333ea', emerald: '#059669',
    blue: '#2563eb', teal: '#0d9488', red: '#dc2626',
  };
  for (const [color, hex] of Object.entries(SEISCIENTOS)) {
    assert.equal(HEX_CLASE_TAILWIND[`bg-${color}-600`], hex, `bg-${color}-600`);
    assert.equal(colorDeAcento(color), hex, `colorDeAcento('${color}')`);
    // Una línea de 2 px sobre blanco: al menos 3:1 (WCAG 1.4.11). Con los -500, amber, emerald, teal y orange no llegan.
    assert.ok(contraste(hex, '#ffffff') >= 3, `${color}-600 contra el blanco: ${contraste(hex, '#ffffff').toFixed(2)}`);
  }
  assert.ok(contraste(HEX_CLASE_TAILWIND['bg-amber-500'], '#ffffff') < 3, 'por eso no se usan los -500');
  assert.equal(colorDeAcento(undefined), PALETA[0], 'sin acento, el primero de la PALETA (el índigo de Ventas)');
  assert.equal(colorDeAcento('fucsia'), PALETA[0]);
  assert.equal(colorDeAcento(' amber '), '#d97706');
  assert.equal(colorDeAcento(null), PALETA[0]);
  // conAlfa: el degradado del área (Chart.js no lee clases de Tailwind).
  assert.equal(conAlfa('#4f46e5', 0.25), 'rgba(79, 70, 229, 0.25)');
  assert.equal(conAlfa('#FFF', 0), 'rgba(255, 255, 255, 0)', 'tres cifras y mayúsculas');
  assert.equal(conAlfa('#4f46e5', 2), 'rgba(79, 70, 229, 1)', 'el alfa se limita a 0..1');
  assert.equal(conAlfa('rojo', 0.5), 'rojo', 'lo que no es un hex sale tal cual');
  // coloresSeries: anterior gris; tono positivo/negativo con POSITIVO/NEGATIVO; la primera principal con el módulo y las
  // demás con colorSegmento (su color propio o la PALETA en orden).
  const MOD = '#d97706';
  assert.deepEqual(coloresSeries([{ clave: 'actual', es_anterior: false }, { clave: 'anterior', es_anterior: true }], MOD), [MOD, COLOR_ANTERIOR]);
  assert.deepEqual(coloresSeries([{ clave: 'e', tono: 'positivo' }, { clave: 's', tono: 'negativo' }], MOD), [POSITIVO, NEGATIVO]);
  assert.deepEqual(coloresSeries([{ clave: 'a', tono: 'neutro' }, { clave: 'b' }, { clave: 'c' }], MOD), [MOD, PALETA[1], PALETA[2]]);
  assert.deepEqual(coloresSeries([{ clave: 'a', color: '#123456' }, { clave: 'b' }], MOD), ['#123456', PALETA[1]], 'el color propio gana');
  assert.deepEqual(coloresSeries([{ clave: 'ant', es_anterior: true }, { clave: 'a' }, { clave: 'b' }], MOD), [COLOR_ANTERIOR, MOD, PALETA[1]],
    'la anterior no cuenta como principal');
  assert.deepEqual(coloresSeries([{ clave: 'a' }]), [PALETA[0]], 'sin color de módulo');
  assert.deepEqual(coloresSeries(null, MOD), []);
  assert.deepEqual(coloresSeries([null, { clave: 'b' }], MOD), [MOD, PALETA[1]], 'una serie rota no rompe');
}

console.log('--- TEST 13 (T5B): las barras y los ejes (valoresConSigno, etiquetaEje, recortarEtiqueta, altoGraficoBarras) ---');
{
  const { valoresConSigno, etiquetaEje, recortarEtiqueta, altoGraficoBarras } = analisis;
  // El tono 'negativo' dibuja la barra hacia abajo (como el flujo de caja de la referencia); los demás, tal cual.
  assert.deepEqual(valoresConSigno({ tono: 'negativo', valores: [5, -3, null, 0, '7'] }), [-5, -3, null, 0, -7]);
  assert.ok(Object.is(valoresConSigno({ tono: 'negativo', valores: [0] })[0], 0), 'sin −0');
  assert.deepEqual(valoresConSigno({ tono: 'positivo', valores: [5, '7', 'x', undefined] }), [5, 7, null, null]);
  assert.deepEqual(valoresConSigno({ valores: [-2, 3] }), [-2, 3], 'neutro o sin tono: tal cual');
  assert.deepEqual(valoresConSigno(null), []);
  // El eje Y: pesosCorto para pesos; '45 %'; los demás con a lo sumo 1 decimal y los miles con punto.
  assert.equal(etiquetaEje(4927538, 'pesos'), '$4,9 M');
  assert.equal(etiquetaEje(-2500000, 'pesos'), '-$2,5 M');
  assert.equal(etiquetaEje(45, 'porcentaje'), '45 %');
  assert.equal(etiquetaEje(12.5, 'porcentaje'), '12,5 %');
  assert.equal(etiquetaEje(1234, 'entero'), '1.234');
  assert.equal(etiquetaEje(1234, 'unidades'), '1.234', 'sin la «u.» en el eje');
  assert.equal(etiquetaEje(2.5, 'dias'), '2,5');
  assert.equal(etiquetaEje('12', null), '12', 'sin formato: número');
  assert.equal(etiquetaEje('x', 'pesos'), '—');
  // Las etiquetas largas de las categorías se recortan en el eje (el tooltip y la tabla llevan la completa).
  assert.equal(recortarEtiqueta('Juan Pérez', 18), 'Juan Pérez');
  const larga = recortarEtiqueta('Distribuidora Nacional de Colchones', 18);
  assert.equal(larga, 'Distribuidora Nac…');
  assert.equal(Array.from(larga).length, 18);
  assert.equal(recortarEtiqueta('Distribuidora Nacional de Colchones'), 'Distribuidora Nac…', 'por defecto, 18');
  assert.equal(recortarEtiqueta('Muebles y   ', 10), 'Muebles y', 'sin espacios al final');
  assert.equal(recortarEtiqueta('Distribuidora Nacional', 15), 'Distribuidora…', 'sin el espacio antes del …');
  assert.equal(recortarEtiqueta(null), '');
  assert.equal(recortarEtiqueta(1234), '1234');
  // El alto: 256 px con las fechas; con las categorías, 32 px por barra más 48, entre 160 y 480.
  assert.equal(altoGraficoBarras('fechas', 30), 256);
  assert.equal(altoGraficoBarras('categorias', 1), 160);
  assert.equal(altoGraficoBarras('categorias', 9), 336);
  assert.equal(altoGraficoBarras('categorias', 25), 480);
  assert.equal(altoGraficoBarras(null, 5), 256);
}

console.log('--- TEST 14 (T5B): bloqueSinDatos («Sin datos en este período»; la dona y las barras no se dibujan vacías) ---');
{
  const { bloqueSinDatos } = analisis;
  for (const tipo of ['linea', 'dona', 'barras', 'movimientos', 'ranking']) {
    assert.equal(bloqueSinDatos(tipo, null), true, `${tipo} null`);
    assert.equal(bloqueSinDatos(tipo, {}), true, `${tipo} vacío`);
  }
  const fechas = ['2026-10-01', '2026-10-02'];
  assert.equal(bloqueSinDatos('linea', { fechas: [], series: [{ valores: [] }] }), true, 'sin fechas');
  assert.equal(bloqueSinDatos('linea', { fechas, series: [{ valores: [0, 0], es_anterior: false }, { valores: [5, 2], es_anterior: true }] }), true,
    'el período no tiene datos aunque el anterior sí');
  assert.equal(bloqueSinDatos('linea', { fechas, series: [{ valores: [0, 3], es_anterior: false }] }), false);
  assert.equal(bloqueSinDatos('linea', { fechas, series: [{ valores: [null, '4'] }] }), false, 'un número en texto cuenta');
  assert.equal(bloqueSinDatos('dona', { segmentos: [] }), true);
  assert.equal(bloqueSinDatos('dona', { segmentos: [{ valor: 0 }, { valor: null }] }), true);
  assert.equal(bloqueSinDatos('dona', { segmentos: [{ valor: 3 }] }), false);
  assert.equal(bloqueSinDatos('barras', { etiquetas: [], series: [{ valores: [1] }] }), true);
  assert.equal(bloqueSinDatos('barras', { etiquetas: ['a'], series: [{ valores: [0, null] }] }), true);
  assert.equal(bloqueSinDatos('barras', { etiquetas: ['a'], series: [{ valores: [-2] }] }), false, 'un negativo es un dato');
  assert.equal(bloqueSinDatos('movimientos', { filas: [] }), true);
  assert.equal(bloqueSinDatos('movimientos', { filas: [{ titulo: 'x' }] }), false);
  assert.equal(bloqueSinDatos('ranking', { filas: [{ nombre: 'x', valor: 0 }] }), false, 'una fila en 0 sigue siendo una fila');
  assert.throws(() => bloqueSinDatos('torta', {}), /Bloque de Análisis desconocido/);
}

console.log('--- TEST 15 (T5B): resumenAccesible de la dona y de las barras (el aria-label de cada <canvas role="img">) ---');
{
  const dona = {
    clave: 'canal', titulo: 'Ventas por canal', formato: 'pesos', total: 1000000,
    segmentos: [{ clave: 'WEB', etiqueta: 'Tienda web', valor: 600000, pct: 60 }, { clave: '_otros', etiqueta: 'Otros', valor: 400000, pct: 40 }],
  };
  assert.equal(resumenAccesible(dona), 'Ventas por canal: total $1.000.000. Tienda web 60 %, Otros 40 %');
  assert.equal(resumenAccesible({ ...dona, segmentos: [] }), 'Ventas por canal: sin datos en este período');
  assert.equal(resumenAccesible({ ...dona, titulo: null, segmentos: [{ etiqueta: 'A', valor: 1, pct: 12.34 }] }),
    'Distribución: total $1.000.000. A 12,3 %');
  const barras = {
    titulo: 'Entradas y salidas', formato: 'unidades', eje: 'fechas', etiquetas: ['2026-10-01', '2026-10-02'], apiladas: false,
    series: [{ clave: 'e', etiqueta: 'Entradas', valores: [3, 4], tono: 'positivo' }, { clave: 's', etiqueta: 'Salidas', valores: [2, null], tono: 'negativo' }],
  };
  assert.equal(resumenAccesible(barras), 'Entradas y salidas: Entradas, total 7 u.; Salidas, total 2 u.');
  assert.equal(resumenAccesible({ ...barras, series: [{ etiqueta: 'Entradas', valores: [0, 0] }] }), 'Entradas y salidas: sin datos en este período');
  assert.equal(resumenAccesible({ titulo: 'Por asesor', formato: 'pesos', eje: 'categorias', etiquetas: ['Ana'], series: [{ valores: [1500] }] }),
    'Por asesor: Serie, total $1.500');
  // La línea sigue igual (TEST 11).
  assert.equal(resumenAccesible({ titulo: 'Pedidos', formato: 'entero', fechas: [], series: [], total: 90, total_anterior: 100 }),
    'Pedidos: total 90, bajó 10 % frente al período anterior');
}

console.log('--- TEST 16 (T5B): el ranking y los movimientos (proporcionesRanking, montoMovimiento, iconoMovimiento) ---');
{
  const { proporcionesRanking, montoMovimiento, ICONOS_MOVIMIENTO, ICONO_MOVIMIENTO_POR_DEFECTO, iconoMovimiento, MAX_MOVIMIENTOS,
    tamanoCentroDona } = analisis;
  // La barra proporcional del ranking: % del mayor valor, con 1 decimal.
  assert.deepEqual(proporcionesRanking([{ valor: 200 }, { valor: 100 }, { valor: 50 }]), [100, 50, 25]);
  assert.deepEqual(proporcionesRanking([{ valor: 3 }, { valor: 1 }]), [100, 33.3]);
  assert.deepEqual(proporcionesRanking([{ valor: '40' }, { valor: -20 }, { valor: 'x' }]), [100, 50, 0], 'texto, negativo (por su tamaño) y basura');
  assert.deepEqual(proporcionesRanking([{ valor: 0 }, { valor: null }]), [0, 0], 'todo en 0: sin barras');
  assert.deepEqual(proporcionesRanking([]), []);
  assert.deepEqual(proporcionesRanking(null), []);
  // El monto de un movimiento: con signo ('+' o '-', el de formatoPesos) y su tono; sin signo, tal cual.
  assert.deepEqual(montoMovimiento({ monto: 1500000, formato: 'pesos', signo: '+' }), { texto: '+$1.500.000', tono: 'positivo' });
  assert.deepEqual(montoMovimiento({ monto: 1500000, formato: 'pesos', signo: '-' }), { texto: '-$1.500.000', tono: 'negativo' });
  assert.deepEqual(montoMovimiento({ monto: -1500000, formato: 'pesos', signo: '-' }), { texto: '-$1.500.000', tono: 'negativo' }, 'sin doble signo');
  assert.deepEqual(montoMovimiento({ monto: -1500000, formato: 'pesos', signo: '+' }), { texto: '+$1.500.000', tono: 'positivo' });
  assert.deepEqual(montoMovimiento({ monto: 5, formato: 'unidades', signo: '-' }), { texto: '-5 u.', tono: 'negativo' });
  assert.deepEqual(montoMovimiento({ monto: 5, formato: 'unidades', signo: null }), { texto: '5 u.', tono: 'neutro' });
  assert.deepEqual(montoMovimiento({ monto: 1234 }), { texto: '$1.234', tono: 'neutro' }, 'pesos por defecto');
  assert.deepEqual(montoMovimiento({ monto: null, signo: '+' }), { texto: '—', tono: 'neutro' }, 'nunca inventa un monto');
  assert.deepEqual(montoMovimiento({ monto: 'x', signo: '-' }), { texto: '—', tono: 'neutro' });
  assert.deepEqual(montoMovimiento(null), { texto: '—', tono: 'neutro' });
  // El ícono por tipo: primero tipo, después doc_tipo, sin importar mayúsculas ni tildes; si no, el de por defecto.
  assert.equal(iconoMovimiento({ tipo: 'PVEN' }), 'ShoppingBag');
  assert.equal(iconoMovimiento({ tipo: 'pago', doc_tipo: 'PVEN' }), 'Wallet');
  assert.equal(iconoMovimiento({ tipo: 'raro', doc_tipo: 'PEC' }), 'ShoppingCart');
  assert.equal(iconoMovimiento({ tipo: 'Devolución' }), 'Undo2');
  assert.equal(iconoMovimiento({ tipo: ' sc ' }), 'ClipboardList');
  assert.equal(iconoMovimiento({}), ICONO_MOVIMIENTO_POR_DEFECTO);
  assert.equal(iconoMovimiento(null), 'Circle');
  assert.ok(Object.isFrozen(ICONOS_MOVIMIENTO));
  const lucide = createRequire(import.meta.url)('lucide-react');
  const nombres = [...new Set([...Object.values(ICONOS_MOVIMIENTO), ICONO_MOVIMIENTO_POR_DEFECTO])];
  assert.deepEqual(nombres.filter((n) => !lucide[n]), [], 'cada ícono existe en el lucide-react instalado');
  for (const tipo of ['SC', 'COT', 'PVEN', 'VEN', 'PAGO', 'PEC', 'ENINV', 'GASTO', 'KARDEX', 'LEAD']) {
    assert.ok(Object.prototype.hasOwnProperty.call(ICONOS_MOVIMIENTO, tipo), `ícono para ${tipo}`);
  }
  assert.equal(MAX_MOVIMIENTOS, 8, 'hasta 8 filas');
  // El total en el hueco de la dona: la letra se achica con el largo, en UNA línea. Medido en Chromium con el CSS real
  // (hueco de 120 px en la dona de 176 px): '$123.456.789' en text-base pasaba a dos líneas y se salía del hueco.
  assert.equal(tamanoCentroDona('$900'), 'text-xl');
  assert.equal(tamanoCentroDona('$900.000'), 'text-xl');
  assert.equal(tamanoCentroDona('$4.927.538'), 'text-lg');
  assert.equal(tamanoCentroDona('$123.456.789'), 'text-sm');
  assert.equal(tamanoCentroDona('$1.234.567.890'), 'text-xs');
  assert.equal(tamanoCentroDona('$98.765.432.109'), 'text-xs');
  assert.equal(tamanoCentroDona(null), 'text-xl');
}

console.log('--- TEST 17 (T5B): GRILLA_ANALISIS (container queries de Tailwind v4, ANALISIS-base punto 3) ---');
{
  const { GRILLA_ANALISIS } = analisis;
  assert.deepEqual({ ...GRILLA_ANALISIS }, {
    raiz: '@container',
    filas: 'flex flex-col gap-4',
    // Fila 2: la línea a todo el ancho hasta @5xl y desde ahí 6/12, con la dona (3/12) y los movimientos (3/12); entre
    // @2xl y @5xl la dona y los movimientos van lado a lado debajo de la línea.
    fila2: 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @5xl:grid-cols-12',
    linea: 'min-w-0 @2xl:col-span-2 @5xl:col-span-6',
    dona: 'min-w-0 @5xl:col-span-3',
    movimientos: 'min-w-0 @5xl:col-span-3',
    // Fila 3: el ranking (5/12) y las barras (7/12) lado a lado desde @5xl.
    fila3: 'grid grid-cols-1 gap-4 @5xl:grid-cols-12',
    ranking: 'min-w-0 @5xl:col-span-5',
    barras: 'min-w-0 @5xl:col-span-7',
  });
  assert.ok(Object.isFrozen(GRILLA_ANALISIS));
  // Fila 1 (KPIs): la de FranjaKpis (clasesFranja de lib/kpis.js, R12), para que el esqueleto y la franja coincidan.
  assert.equal(clasesFranja(4), 'grid-cols-1 @sm:grid-cols-2 @4xl:grid-cols-4');
}

console.log('--- TEST 18 (T5B): el fuente de las ocho piezas de components/analisis (sin DOM en node) ---');
{
  const leer = (nombre) => readFileSync(new URL(`../src/components/analisis/${nombre}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Sin comentarios (/* … */, {/* … */} y las líneas //): se mira el código, no lo que dicen los comentarios.
  const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const PIEZAS = {
    'registro.ts': 'registrarGraficos', 'GraficoLinea.tsx': 'GraficoLinea', 'GraficoDona.tsx': 'GraficoDona',
    'GraficoBarras.tsx': 'GraficoBarras', 'ListaMovimientos.tsx': 'ListaMovimientos', 'RankingTop.tsx': 'RankingTop',
    'ChipVariacion.tsx': 'ChipVariacion', 'EsqueletoAnalisis.tsx': 'EsqueletoAnalisis',
  };
  const fuentes = Object.fromEntries(Object.keys(PIEZAS).map((n) => [n, leer(n)]));
  const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
  for (const [archivo, exportado] of Object.entries(PIEZAS)) {
    const fuente = fuentes[archivo];
    const c = codigo(fuente);
    assert.ok(fuente.startsWith("'use client';"), `${archivo}: «use client»`);
    assert.match(fuente, new RegExp(`export function ${exportado}\\b`), `${archivo}: exporta ${exportado}`);
    assert.ok(!/\bdark:/.test(fuente), `${archivo}: sin dark:`);
    assert.ok(!/(^|[^\w.$])(?:(?:window|globalThis)\??\.)?(?:alert|confirm|prompt)\s*\(/m.test(c), `${archivo}: sin alert, confirm ni prompt`);
    assert.ok(!/localStorage|sessionStorage|usePreferencia|preferenciasApp|apiFetch|\bfetch\(/.test(c),
      `${archivo}: pieza de presentación (el período, el top y los datos son de PanelAnalisis, T5C)`);
    assert.ok(!/outline-none/.test(c), `${archivo}: nunca outline-none`);
    // Lo que puede tomar el foco usa el outline de focus-visible.
    if (/<button\b|<Link\b/.test(c)) assert.ok(c.includes(FOCO), `${archivo}: foco visible con outline`);
    // Un texto recortado lleva su title en la misma etiqueta.
    for (const linea of c.split('\n').filter((l) => /className=[^>]*\btruncate\b/.test(l))) {
      assert.ok(/\btitle=/.test(linea), `${archivo}: truncate sin title: ${linea.trim()}`);
    }
    // Sin colores de texto por debajo de 4,5:1 sobre fondos claros (slate-600 o más oscuro; -700 en los tonos).
    assert.ok(!/text-(slate|gray)-(300|400|500)\b|text-(emerald|rose|red|amber|green)-(400|500|600)\b/.test(c), `${archivo}: contraste`);
  }

  // registro.ts: el único ChartJS.register, una sola vez por página, con prefers-reduced-motion y sin tocar los tooltips
  // globales (las pantallas viejas de la lista blanca comparten Chart.js).
  const registro = codigo(fuentes['registro.ts']);
  assert.match(registro, /ChartJS\.register\(CategoryScale, LinearScale, PointElement, LineElement, BarElement, ArcElement, Filler, Tooltip, Legend\);/);
  for (const [archivo, fuente] of Object.entries(fuentes)) {
    const veces = (codigo(fuente).match(/\.register\(/g) ?? []).length;
    assert.equal(veces, archivo === 'registro.ts' ? 1 : 0, `${archivo}: ChartJS.register solo en registro.ts`);
  }
  assert.match(registro, /if \(global\[MARCA\]\) return;\s*global\[MARCA\] = true;/, 'la marca en globalThis: StrictMode y la recarga en caliente no registran otra vez');
  assert.ok(registro.indexOf('global[MARCA] = true;') < registro.indexOf('ChartJS.register('), 'la marca va antes de registrar');
  assert.match(registro, /export const ANIMACION_MS = 400;/);
  assert.match(registro, /const ms = reducido \? 0 : ANIMACION_MS;/);
  assert.match(registro, /'\(prefers-reduced-motion: reduce\)'/);
  assert.match(registro, /aplicarMovimiento\(consulta\.matches\);\s*consulta\.addEventListener\?\.\('change', \(evento\) => aplicarMovimiento\(evento\.matches\)\);/,
    'y sigue al usuario si cambia la preferencia');
  assert.match(registro, /activa\.duration = ms;/, 'también la animación al pasar el mouse');
  assert.match(registro, /ChartJS\.defaults\.font\.family = fuenteDeLaApp\(\);/);
  assert.ok(!/defaults\.plugins/.test(registro), 'no cambia los tooltips ni la leyenda globales');

  // Los tres gráficos: react-chartjs-2, registrarGraficos() al cargar el módulo, <canvas role="img"> con aria-label =
  // resumenAccesible y su tabla sr-only, 'Sin datos en este período' y los tooltips con formatearValor.
  const GRAFICOS = { 'GraficoLinea.tsx': ['Line', 'linea'], 'GraficoDona.tsx': ['Doughnut', 'dona'], 'GraficoBarras.tsx': ['Bar', 'barras'] };
  for (const [archivo, [componente, bloque]] of Object.entries(GRAFICOS)) {
    const fuente = fuentes[archivo];
    const c = codigo(fuente);
    assert.match(fuente, new RegExp(`import \\{ ${componente} \\} from 'react-chartjs-2';`), `${archivo}: <${componente}>`);
    assert.match(fuente, /import \{ ESTILO_TOOLTIP, registrarGraficos \} from '\.\/registro';\n\nregistrarGraficos\(\);\n/, `${archivo}: registra al cargarse`);
    assert.match(c, new RegExp(`<${componente} data=\\{datos\\} options=\\{opciones\\} role="img" aria-label=\\{resumenAccesible\\(`), `${archivo}: canvas role=img`);
    // La tabla para lectores de pantalla, dentro de una caja sr-only: con sr-only en la <table> misma, la tabla se
    // ensancha con su contenido (no obedece width:1px ni overflow:hidden) y la página se desplazaba de lado (medido).
    assert.match(c, /<div className="sr-only">\s*<table>\s*<caption>\{titulo\}<\/caption>/, `${archivo}: la tabla para lectores de pantalla`);
    assert.ok(!/<table className=/.test(c), `${archivo}: la <table> sin clases (la recorta su caja)`);
    assert.match(c, new RegExp(`bloqueSinDatos\\('${bloque}', ${bloque}\\)`), `${archivo}: sin datos`);
    assert.ok(c.includes('Sin datos en este período'), `${archivo}: el texto exacto`);
    assert.ok(c.includes('...ESTILO_TOOLTIP') && /label: \(item\) => `[^`]*formatearValor\(/.test(c), `${archivo}: tooltips con formatearValor`);
    assert.match(c, /legend: \{ display: false \}/, `${archivo}: la leyenda es HTML`);
    assert.match(c, /maintainAspectRatio: false/, `${archivo}: alto fijo`);
    assert.match(c, new RegExp(`if \\(!${bloque}\\) return null;`), `${archivo}: sin el bloque, nada`);
  }
  const linea = codigo(fuentes['GraficoLinea.tsx']);
  for (const texto of ['pointRadius: 0,', 'pointHoverRadius: 4,', "borderDash: s.anterior ? [6, 4] : [],", "fill: s.area ? 'origin' : false,",
    'maxTicksLimit: 8,', 'etiquetaFecha(fechas[Number(valor)], gran)', 'etiquetaEje(valor, formato)', 'createLinearGradient(',
    'colorDeAcento(acento)', 'coloresSeries(crudas, colorModulo)', 'h-64', "mode: 'index', intersect: false",
    '<ChipVariacion kpi={{ valor: linea.total, anterior: linea.total_anterior, mejor }} frente={frente} />', '${tamanoValor(total)}']) {
    assert.ok(linea.includes(texto), `GraficoLinea: ${texto}`);
  }
  const dona = codigo(fuentes['GraficoDona.tsx']);
  for (const texto of ["cutout: '72%',", 'pointer-events-none absolute inset-0', '>Total<', '${tamanoCentroDona(total)} whitespace-nowrap',
    'todas.length > 1 &&', 'aria-pressed={presionada}', 'colorSegmento(i, s)', "etiquetar('dona', String(s.clave ?? ''), original)",
    "formatearValor(s.pct, 'porcentaje')", 'alCambiarModo?.(clave);', 'h-44 w-44',
    // La leyenda: la etiqueta con min-w-0 y al menos 6rem; si no cabe, el valor y el % bajan (flex-wrap), nunca «Col…».
    'flex min-w-0 flex-wrap items-center', 'min-w-0 flex-1 basis-24 truncate', 'inline-flex min-w-0 max-w-full']) {
    assert.ok(dona.includes(texto), `GraficoDona: ${texto}`);
  }
  assert.ok(!/overflow-/.test(dona), 'GraficoDona: nada recorta el foco de las píldoras');
  const barras = codigo(fuentes['GraficoBarras.tsx']);
  for (const texto of ["indexAxis: horizontal ? 'y' : 'x',", "const horizontal = barras?.eje === 'categorias';", 'valoresConSigno(s)',
    'stacked: apiladas,', 'altoGraficoBarras(barras.eje, etiquetas.length)', 'recortarEtiqueta(etiquetas[Number(valor)])',
    "etiquetar('barras', String(s.clave ?? ''), original)", "etiquetar('barras', texto, texto)", 'series[item.datasetIndex]?.valores[item.dataIndex]',
    'coloresSeries(crudas, colorModulo)', 'style={{ height: alto }}']) {
    assert.ok(barras.includes(texto), `GraficoBarras: ${texto}`);
  }
  assert.equal((barras.match(/stacked: apiladas,/g) ?? []).length, 2, 'GraficoBarras: apila en los dos ejes');

  // ListaMovimientos: hasta 8, la fecha de hace() (RP60, sin un formato nuevo), el monto y el ícono de lib/analisis.js.
  const movs = codigo(fuentes['ListaMovimientos.tsx']);
  for (const texto of ['movimientos.filas.slice(0, MAX_MOVIMIENTOS)', 'hace(fila.fecha, ahora)', 'fechaHoraLarga(fila.fecha)',
    'montoMovimiento(fila)', 'ICONOS[iconoMovimiento(fila)] ?? Circle', 'enlaceDocumento(fila.doc_tipo, fila.doc_id)',
    'onClick={() => alAbrir(fila)}', '<Link href={href}', "bloqueSinDatos('movimientos', movimientos)", 'Sin datos en este período',
    '{relativa && (', '<ul className="@container', '@xs:',
    // Los contenedores flex de los textos recortados llevan min-w-0 (si no, el título empuja el monto fuera de la fila).
    '<span className="block min-w-0 flex-1 @xs:flex', '<span className="block min-w-0 @xs:flex-1">', 'flex flex-wrap items-baseline justify-between']) {
    assert.ok(movs.includes(texto), `ListaMovimientos: ${texto}`);
  }
  assert.match(fuentes['ListaMovimientos.tsx'], /import \{ fechaHoraLarga, hace \} from '@\/lib\/fechas-colombia';/);
  assert.ok(!/'ayer'|hace \d+ h'|toLocale|Intl\./.test(movs), 'ListaMovimientos: no arma su propia fecha relativa');
  assert.ok(!/overflow-/.test(movs), 'ListaMovimientos: nada recorta el foco de las filas');
  const mapa = /const ICONOS: Record<string, LucideIcon> = \{([^}]*)\};/.exec(fuentes['ListaMovimientos.tsx']);
  assert.ok(mapa, 'ListaMovimientos tiene el mapa ICONOS');
  const enMapa = mapa[1].split(',').map((s) => s.trim()).filter(Boolean).sort();
  const esperados = [...new Set([...Object.values(analisis.ICONOS_MOVIMIENTO), analisis.ICONO_MOVIMIENTO_POR_DEFECTO])].sort();
  assert.deepEqual(enMapa, esperados, 'el mapa de ListaMovimientos tiene exactamente los de ICONOS_MOVIMIENTO y el de por defecto');

  // RankingTop: las píldoras Top 5/10/25, las primeras `top` filas, la barra proporcional y las medallas.
  const ranking = codigo(fuentes['RankingTop.tsx']);
  for (const texto of ['TOPS.map((t) =>', 'aria-pressed={t === top}', 'Top {t}', 'onClick={() => alCambiarTop(t)}',
    'ranking.filas.slice(0, top)', 'proporcionesRanking(filas)', 'style={{ width: `${anchos[i]}%` }}', "bloqueSinDatos('ranking', ranking)",
    "etiquetar('ranking', crudo, crudo)", 'Sin datos en este período', '{alCambiarTop && (',
    'flex min-w-0 flex-wrap items-baseline justify-between', 'min-w-0 flex-1 basis-24 truncate', 'ml-auto shrink-0 whitespace-nowrap']) {
    assert.ok(ranking.includes(texto), `RankingTop: ${texto}`);
  }
  for (const n of [1, 2, 3]) assert.match(ranking, new RegExp(`\\n  ${n}: \\{ clases: '`), `RankingTop: medalla ${n}`);
  assert.equal((ranking.match(/overflow-/g) ?? []).length, 1, 'RankingTop: solo la pista de la barra (aria-hidden, sin controles) recorta');
  assert.match(ranking, /<span aria-hidden="true" className="[^"]*overflow-hidden/);

  // ChipVariacion: la regla única de RP27 (infoVariacion), lo visible con aria-hidden y el lector de pantalla.
  const chip = codigo(fuentes['ChipVariacion.tsx']);
  for (const texto of ['infoVariacion(kpi,', '<span className="sr-only">{info.lector}</span>', '<span aria-hidden="true"',
    "bien: 'bg-emerald-50 text-emerald-700',", "mal: 'bg-rose-50 text-rose-700',", "neutro: 'bg-slate-100 text-slate-600',",
    "info.flecha === 'sube'", "info.flecha === 'baja'", '{info.texto}']) {
    assert.ok(chip.includes(texto), `ChipVariacion: ${texto}`);
  }
  assert.ok(!/bueno|malo/.test(chip), 'ChipVariacion: un solo vocabulario de tono (bien, mal, neutro)');

  // EsqueletoAnalisis: la misma grilla (GRILLA_ANALISIS y clasesFranja) con bloques grises; nunca ceros.
  const esqueleto = codigo(fuentes['EsqueletoAnalisis.tsx']);
  for (const clave of Object.keys(analisis.GRILLA_ANALISIS)) {
    assert.ok(esqueleto.includes(`GRILLA_ANALISIS.${clave}`), `EsqueletoAnalisis usa GRILLA_ANALISIS.${clave}`);
  }
  for (const texto of ['clasesFranja(n)', 'role="status" aria-busy="true"', 'Cargando el análisis…', 'motion-safe:animate-pulse', 'h-64', 'h-44 w-44']) {
    assert.ok(esqueleto.includes(texto), `EsqueletoAnalisis: ${texto}`);
  }
  assert.ok(!/[^:]animate-pulse/.test(esqueleto.replace(/motion-safe:animate-pulse/g, '')), 'el pulso solo con motion-safe');
  assert.ok(!/>\s*0\s*</.test(esqueleto), 'nunca ceros');
  // Las ocho piezas existen (index.ts, PanelAnalisis y los demás son de T5C).
  for (const archivo of Object.keys(PIEZAS)) assert.ok(existsSync(new URL(`../src/components/analisis/${archivo}`, import.meta.url)), archivo);
}

console.log('✓ lib/analisis.js: períodos, consulta, variación, formato, ejes, fechas, colores, enlaces y contrato.');
console.log('✓ T5B: lógica y fuente de las piezas de components/analisis.');
