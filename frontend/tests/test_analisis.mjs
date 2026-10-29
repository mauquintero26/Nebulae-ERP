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
  // T5B r1 (M15): COLOR_ANTERIOR pasa de slate-400 (#94a3b8, 2,56:1) a slate-500 (#64748b, 4,76:1); sigue punteado.
  assert.deepEqual([GRIS_OTROS, COLOR_ANTERIOR, POSITIVO, NEGATIVO], ['#cbd5e1', '#64748b', '#059669', '#e11d48']);
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
  // T5B r1 (M14, M15, M11 y M21): coloresSeries ya no pasa por colorSegmento (la regla de la dona). Anterior en
  // COLOR_ANTERIOR; tono positivo/negativo con POSITIVO/NEGATIVO; '_otros' en GRIS_OTROS (el único gris); la primera
  // principal con el módulo; las demás con su color propio o PALETA_SERIES en orden, saltando los colores iguales o muy
  // cercanos (distanciaColor < DISTANCIA_MINIMA_COLOR) al módulo, a POSITIVO y a NEGATIVO.
  const { PALETA_SERIES, distanciaColor, DISTANCIA_MINIMA_COLOR } = analisis;
  assert.deepEqual(PALETA_SERIES, ['#4f46e5', '#0284c7', '#d97706', '#a21caf', '#4d7c0f', '#9d174d']);
  assert.ok(Object.isFrozen(PALETA_SERIES));
  assert.equal(DISTANCIA_MINIMA_COLOR, 25);
  // distanciaColor: ΔE (CIE76, en Lab) entre dos '#rrggbb'.
  assert.equal(distanciaColor('#4f46e5', '#4f46e5'), 0);
  assert.ok(distanciaColor('#d97706', '#f59e0b') < 25, 'amber-600 y amber-500 se confunden');
  assert.ok(distanciaColor('#0d9488', '#059669') < 25, 'teal-600 y emerald-600 se confunden');
  assert.ok(distanciaColor('#4f46e5', '#9333ea') < 25, 'indigo-600 y purple-600 se confunden');
  assert.ok(distanciaColor('#4f46e5', '#0284c7') > 25);
  assert.ok(Math.abs(distanciaColor('#ffffff', '#000000') - 100) < 0.01, 'blanco a negro: 100');
  assert.equal(distanciaColor('rojo', '#000000'), Infinity, 'lo que no es un hex nunca está cerca');
  // Cada color que puede salir de coloresSeries llega a 3:1 sobre el blanco (líneas de 2 px y barras, WCAG 1.4.11), y los
  // de PALETA_SERIES se distinguen entre sí y de POSITIVO y NEGATIVO.
  for (const hex of [...PALETA_SERIES, COLOR_ANTERIOR, POSITIVO, NEGATIVO, ...Object.values(SEISCIENTOS)]) {
    assert.ok(contraste(hex, '#ffffff') >= 3, `${hex} contra el blanco: ${contraste(hex, '#ffffff').toFixed(2)}`);
  }
  for (let i = 0; i < PALETA_SERIES.length; i += 1) {
    for (const otro of [...PALETA_SERIES.slice(i + 1), POSITIVO, NEGATIVO]) {
      assert.ok(distanciaColor(PALETA_SERIES[i], otro) >= 25, `${PALETA_SERIES[i]} y ${otro} se distinguen`);
    }
  }
  const MOD = '#d97706';
  assert.deepEqual(coloresSeries([{ clave: 'actual', es_anterior: false }, { clave: 'anterior', es_anterior: true }], MOD), [MOD, COLOR_ANTERIOR]);
  assert.deepEqual(coloresSeries([{ clave: 'e', tono: 'positivo' }, { clave: 's', tono: 'negativo' }], MOD), [POSITIVO, NEGATIVO]);
  assert.deepEqual(coloresSeries([{ clave: 'a', tono: 'neutro' }, { clave: 'b' }, { clave: 'c' }], MOD), [MOD, '#4f46e5', '#0284c7'],
    'con amber, el amber-600 de la PALETA_SERIES se salta');
  assert.deepEqual(coloresSeries([{ clave: 'a', color: '#123456' }, { clave: 'b' }], MOD), ['#123456', '#4f46e5'], 'el color propio gana');
  assert.deepEqual(coloresSeries([{ clave: 'a' }, { clave: 'b', color: 'bg-red-500' }], MOD), [MOD, '#ef4444'], 'una clase de Tailwind pasa a hex');
  assert.deepEqual(coloresSeries([{ clave: 'ant', es_anterior: true }, { clave: 'a' }, { clave: 'b' }], MOD), [COLOR_ANTERIOR, MOD, '#4f46e5'],
    'la anterior no cuenta como principal');
  assert.deepEqual(coloresSeries([{ clave: 'a' }]), [PALETA[0]], 'sin color de módulo, el índigo de Ventas');
  assert.deepEqual(coloresSeries([{ clave: 'a' }, { clave: 'b' }]), ['#4f46e5', '#0284c7'], 'con el índigo por defecto, la 2.ª en sky-600');
  assert.deepEqual(coloresSeries(null, MOD), []);
  assert.deepEqual(coloresSeries([null, { clave: 'b' }], MOD), [MOD, '#4f46e5'], 'una serie rota no rompe');
  // M14: «Sin cotización» ya no sale en gris (1,48:1), ni en primer ni en segundo lugar; el gris queda solo para '_otros'.
  assert.deepEqual(coloresSeries([{ clave: 'con', etiqueta: 'Con cotización' }, { clave: 'sin', etiqueta: 'Sin cotización' }], '#4f46e5'),
    ['#4f46e5', '#0284c7']);
  assert.deepEqual(coloresSeries([{ clave: 'sin', etiqueta: 'Sin fecha prometida' }, { clave: 'a', etiqueta: 'A tiempo' }], '#4f46e5'),
    ['#4f46e5', '#0284c7']);
  assert.deepEqual(coloresSeries([{ clave: 'a' }, { clave: '_otros', etiqueta: 'Otros' }], '#4f46e5'), ['#4f46e5', GRIS_OTROS]);
  // M11 y M21: un caso por acento. Cinco series principales, más una positiva y una negativa: ninguna k ≥ 1 repite ni se
  // parece al módulo, a POSITIVO ni a NEGATIVO, y todas se distinguen entre sí.
  const CINCO = [{ clave: 'a' }, { clave: 'b' }, { clave: 'c' }, { clave: 'd' }, { clave: 'e' }, { clave: 'p', tono: 'positivo' }, { clave: 'n', tono: 'negativo' }];
  const ESPERADO = {
    teal: ['#0d9488', '#4f46e5', '#0284c7', '#d97706', '#a21caf', POSITIVO, NEGATIVO],
    emerald: ['#059669', '#4f46e5', '#0284c7', '#d97706', '#a21caf', POSITIVO, NEGATIVO],
    rose: ['#e11d48', '#4f46e5', '#0284c7', '#d97706', '#a21caf', POSITIVO, NEGATIVO],
    amber: ['#d97706', '#4f46e5', '#0284c7', '#a21caf', '#4d7c0f', POSITIVO, NEGATIVO],
  };
  for (const [acento, esperado] of Object.entries(ESPERADO)) {
    const colores = coloresSeries(CINCO, colorDeAcento(acento));
    assert.deepEqual(colores, esperado, `acento ${acento}`);
    const resto = colores.slice(1, 5);
    for (const c of resto) {
      for (const evitar of [colores[0], POSITIVO, NEGATIVO]) assert.ok(distanciaColor(c, evitar) >= 25, `${acento}: ${c} frente a ${evitar}`);
    }
    for (let i = 0; i < resto.length; i += 1) for (const otro of resto.slice(i + 1)) assert.ok(distanciaColor(resto[i], otro) >= 25, `${acento}: ${resto[i]} y ${otro}`);
  }
  // Con acento purple (cerca del índigo) o blue, el índigo se salta.
  assert.deepEqual(coloresSeries([{ clave: 'a' }, { clave: 'b' }], colorDeAcento('purple')), ['#9333ea', '#0284c7']);
  assert.deepEqual(coloresSeries([{ clave: 'a' }, { clave: 'b' }], colorDeAcento('blue')), ['#2563eb', '#0284c7']);
}

console.log('--- TEST 13 (T5B): las barras y los ejes (valoresConSigno, etiquetaEje, recortarEtiqueta, altoGraficoBarras) ---');
{
  const { valoresConSigno, etiquetaEje, recortarEtiqueta, altoGraficoBarras } = analisis;
  // El tono 'negativo' dibuja la barra hacia abajo (como el flujo de caja de la referencia); los demás, tal cual.
  assert.deepEqual(valoresConSigno({ tono: 'negativo', valores: [5, -3, null, 0, '7'] }), [-5, -3, null, 0, -7]);
  assert.ok(Object.is(valoresConSigno({ tono: 'negativo', valores: [0] })[0], 0), 'sin −0');
  // T5B r1 (M20): nunca −0, con cualquier tono (rellenar del servidor manda −0.0 en una cubeta vacía de salidas).
  for (const tono of ['negativo', 'positivo', 'neutro', undefined]) {
    const r = valoresConSigno({ tono, valores: [-0, '-0', 0] });
    assert.ok(r.every((v) => Object.is(v, 0)), `tono ${tono}: ${r.map((v) => (Object.is(v, -0) ? '-0' : v)).join(', ')}`);
  }
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
  assert.equal(etiquetaEje('x', 'porcentaje'), '—');
  // T5B r1 (M5, RP75): el porcentaje del eje sale de formatoValorKpi (lib/kpis.js), no de una segunda copia de la regla.
  const fuenteLib = readFileSync(new URL('../src/lib/analisis.js', import.meta.url), 'utf8');
  const cuerpoEje = /export function etiquetaEje\(valor, formato\) \{([\s\S]*?)\n\}/.exec(fuenteLib)?.[1] ?? '';
  assert.match(cuerpoEje, /if \(formato === 'porcentaje'\) return formatoValorKpi\(valor, 'porcentaje'\);/);
  assert.ok(!cuerpoEje.includes(' %`'), 'sin armar el % a mano');
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
  // T5B r1 (M18, ruling del punto 2): con tono 'negativo' el resumen lee el valor DIBUJADO (−|v|), el mismo del eje, del
  // tooltip y de la tabla, mande el servidor magnitudes (Inventario) o valores con signo (Finanzas).
  assert.equal(resumenAccesible(barras), 'Entradas y salidas: Entradas, total 7 u.; Salidas, total -2 u.');
  assert.equal(resumenAccesible({ ...barras, series: [barras.series[0], { ...barras.series[1], valores: [-2, null] }] }),
    'Entradas y salidas: Entradas, total 7 u.; Salidas, total -2 u.', 'con signo da lo mismo que con magnitudes');
  assert.equal(resumenAccesible({
    titulo: 'Flujo de caja', formato: 'pesos', eje: 'fechas', etiquetas: ['2026-10-01', '2026-10-02'],
    series: [{ etiqueta: 'Entradas', valores: [1000, 500], tono: 'positivo' }, { etiqueta: 'Salidas', valores: [-300, -100], tono: 'negativo' }],
  }), 'Flujo de caja: Entradas, total $1.500; Salidas, total -$400');
  assert.equal(resumenAccesible({ ...barras, series: [{ etiqueta: 'Entradas', valores: [0, 0] }] }), 'Entradas y salidas: sin datos en este período');
  assert.equal(resumenAccesible({ titulo: 'Por asesor', formato: 'pesos', eje: 'categorias', etiquetas: ['Ana'], series: [{ valores: [1500] }] }),
    'Por asesor: Serie, total $1.500');
  // T5B r1 (M17): «total» solo con formatos que se suman (pesos, entero, numero y unidades); con porcentaje o días, el rango.
  const cumplimiento = { titulo: 'Cumplimiento', formato: 'porcentaje', eje: 'fechas', etiquetas: ['a', 'b', 'c'], series: [{ etiqueta: 'A tiempo', valores: [70, 90, 80] }] };
  assert.equal(resumenAccesible(cumplimiento), 'Cumplimiento: A tiempo, de 70 % a 90 %');
  assert.equal(resumenAccesible({ ...cumplimiento, series: [{ etiqueta: 'A tiempo', valores: [80, null, 80] }] }), 'Cumplimiento: A tiempo, 80 %');
  assert.equal(resumenAccesible({ ...cumplimiento, formato: 'dias', series: [{ etiqueta: 'Promedio', valores: [2, 5.5] }] }),
    'Cumplimiento: Promedio, de 2 días a 5,5 días');
  assert.equal(resumenAccesible({ ...cumplimiento, formato: 'numero', series: [{ etiqueta: 'Pedidos', valores: [2, 3] }] }),
    'Cumplimiento: Pedidos, total 5');
  // Revisión de r1: 'entero' (el de «Solicitudes por asesor» y el que se usa sin formato) se suma.
  assert.equal(resumenAccesible({ titulo: 'Por asesor', formato: 'entero', eje: 'categorias', etiquetas: ['Ana', 'Beto'],
    series: [{ etiqueta: 'Pedidos', valores: [2, 3] }] }), 'Por asesor: Pedidos, total 5');
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
  // T5B r1 (M22): un negativo queda sin barra (Math.max(0, n)); antes crecía con |n| y el último puesto podía tener la
  // barra más larga.
  assert.deepEqual(proporcionesRanking([{ valor: '40' }, { valor: -20 }, { valor: 'x' }]), [100, 0, 0], 'texto, negativo sin barra y basura');
  assert.deepEqual(proporcionesRanking([{ valor: 500 }, { valor: 100 }, { valor: -800 }]), [100, 20, 0]);
  assert.deepEqual(proporcionesRanking([{ valor: -5 }, { valor: -10 }, { valor: -20 }]), [0, 0, 0], 'todos negativos: sin barras');
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
  // T5B r1 (M23): una magnitud que formatea a 0 da '$0' (o '0 u.') en tono neutro, con cualquier signo: ni '+$0' en verde
  // ni un '$0' rojo sin su menos.
  assert.deepEqual(montoMovimiento({ monto: 0, formato: 'pesos', signo: '+' }), { texto: '$0', tono: 'neutro' });
  assert.deepEqual(montoMovimiento({ monto: 0.4, formato: 'pesos', signo: '-' }), { texto: '$0', tono: 'neutro' });
  // Revisión de r1 (controlador): el negativo se arma desde la magnitud, igual que el '+'; en x,5 no queda '$0' rojo ni
  // un redondeo distinto según el signo.
  assert.deepEqual(montoMovimiento({ monto: 0.5, formato: 'pesos', signo: '-' }), { texto: '-$1', tono: 'negativo' });
  assert.deepEqual(montoMovimiento({ monto: 2.5, formato: 'pesos', signo: '-' }), { texto: '-$3', tono: 'negativo' });
  assert.deepEqual(montoMovimiento({ monto: 2.5, formato: 'pesos', signo: '+' }), { texto: '+$3', tono: 'positivo' });
  assert.deepEqual(montoMovimiento({ monto: 0.5, formato: 'unidades', signo: '-' }), { texto: '-1 u.', tono: 'negativo' });
  assert.deepEqual(montoMovimiento({ monto: -0.3, formato: 'pesos', signo: null }), { texto: '$0', tono: 'neutro' });
  assert.deepEqual(montoMovimiento({ monto: 0, formato: 'unidades', signo: '-' }), { texto: '0 u.', tono: 'neutro' });
  assert.deepEqual(montoMovimiento({ monto: 0.6, formato: 'pesos', signo: '-' }), { texto: '-$1', tono: 'negativo' }, 'un peso sí lleva signo');
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
    // T5C: la raíz es un @container con nombre (analisis): la regla de los movimientos (abajo) estiliza los <li>, cuyo
    // contenedor más cercano es el <ul @container> de ListaMovimientos; con el nombre mide el ancho del panel.
    raiz: '@container/analisis',
    filas: 'flex flex-col gap-4',
    // Fila 2: la línea a todo el ancho hasta @5xl y desde ahí 6/12, con la dona (3/12) y los movimientos (3/12); entre
    // @2xl y @5xl la dona y los movimientos van lado a lado debajo de la línea.
    // T5C (D43, M10, la opción de items-start): desde @2xl, donde los movimientos van al lado de otra tarjeta, la fila
    // va con items-start y se ven las primeras MOVIMIENTOS_AL_LADO filas (medido: 8 filas en 272 px miden 873 px contra
    // los 367 de la línea; con 4, unos 467, como la dona). En una sola columna se ven todas.
    fila2: 'grid grid-cols-1 gap-4 @2xl:grid-cols-2 @2xl:items-start @5xl:grid-cols-12',
    linea: 'min-w-0 @2xl:col-span-2 @5xl:col-span-6',
    dona: 'min-w-0 @5xl:col-span-3',
    movimientos: 'min-w-0 @5xl:col-span-3 @2xl/analisis:[&_li:nth-child(n+5)]:hidden',
    // Fila 3: el ranking (5/12) y las barras (7/12) lado a lado desde @5xl.
    fila3: 'grid grid-cols-1 gap-4 @5xl:grid-cols-12',
    ranking: 'min-w-0 @5xl:col-span-5',
    barras: 'min-w-0 @5xl:col-span-7',
  });
  assert.ok(Object.isFrozen(GRILLA_ANALISIS));
  assert.equal(analisis.MOVIMIENTOS_AL_LADO, 4);
  assert.ok(GRILLA_ANALISIS.movimientos.includes(`[&_li:nth-child(n+${analisis.MOVIMIENTOS_AL_LADO + 1})]:hidden`), 'la clase y la constante dicen lo mismo');
  assert.ok(analisis.MOVIMIENTOS_AL_LADO < analisis.MAX_MOVIMIENTOS);
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
  // T5B r1 (M1): globales solo la fuente y la animación (las pide el diseño); el color de los ejes va en cada gráfico.
  assert.ok(!/defaults\s*(\.|\[\s*['"`])\s*(color|plugins)\b/.test(registro), 'no cambia el color, los tooltips ni la leyenda globales');
  assert.match(registro, /export const COLOR_EJES = '#475569';/);

  // Los tres gráficos: react-chartjs-2, registrarGraficos() al cargar el módulo, <canvas role="img"> con aria-label =
  // resumenAccesible y su tabla sr-only, 'Sin datos en este período' y los tooltips con formatearValor.
  const GRAFICOS = { 'GraficoLinea.tsx': ['Line', 'linea'], 'GraficoDona.tsx': ['Doughnut', 'dona'], 'GraficoBarras.tsx': ['Bar', 'barras'] };
  for (const [archivo, [componente, bloque]] of Object.entries(GRAFICOS)) {
    const fuente = fuentes[archivo];
    const c = codigo(fuente);
    assert.match(fuente, new RegExp(`import \\{ ${componente} \\} from 'react-chartjs-2';`), `${archivo}: <${componente}>`);
    assert.match(fuente, /import \{ (COLOR_EJES, )?ESTILO_TOOLTIP, registrarGraficos \} from '\.\/registro';\n\nregistrarGraficos\(\);\n/, `${archivo}: registra al cargarse`);
    assert.match(c, new RegExp(`<${componente} data=\\{datos\\} options=\\{opciones\\} role="img" aria-label=\\{resumenAccesible\\(`), `${archivo}: canvas role=img`);
    // La tabla para lectores de pantalla, dentro de una caja sr-only: con sr-only en la <table> misma, la tabla se
    // ensancha con su contenido (no obedece width:1px ni overflow:hidden) y la página se desplazaba de lado (medido).
    // T5B r1 (M9): el caption no repite el título (ya es el nombre de la región, el h3 y el inicio del aria-label).
    assert.match(c, /<div className="sr-only">\s*<table>\s*<caption>Datos del gráfico<\/caption>/, `${archivo}: la tabla para lectores de pantalla`);
    assert.ok(!c.includes('<caption>{titulo}</caption>'), `${archivo}: el caption sin el título`);
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
    '<ChipVariacion kpi={{ valor: linea.total, anterior: linea.total_anterior, mejor }} frente={frente} />', '${tamanoValor(total)}',
    // T5B r1 (M16): el flujo de datos, con los textos exactos (la tabla en la misma fecha que el eje y el resumen con frente).
    '<th scope="row">{etiquetaFecha(fecha, gran)}</th>', '<td key={`${s.etiqueta}-${j}`}>{formatearValor(s.valores[i], formato)}</td>',
    'resumenAccesible(linea, frente ? { frente } : {})', 'data: s.valores,',
    // El «mejor» por defecto del chip es el documentado ('sube'); T5C lo pasa por módulo (M19, nota del controlador).
    "export function GraficoLinea({ linea, granularidad, acento, mejor = 'sube', frente }: PropsGraficoLinea)",
    // T5B r1 (M9): con el gráfico dibujado, el total y el chip del encabezado van con aria-hidden (ya los dice el aria-label
    // del canvas); sin datos no hay canvas y los dos se leen.
    '<p aria-hidden={sinDatos ? undefined : true} title={total}']) {
    assert.ok(linea.includes(texto), `GraficoLinea: ${texto}`);
  }
  // Revisión de r1 (controlador): el chip va con aria-hidden solo si el aria-label del canvas ya dice la variación
  // (hay comparación); con «—» (sin período anterior) el lector lo lee. Y el chip está DENTRO de ese span.
  assert.ok(linea.includes('const chipOculto = !sinDatos && variacionPct(linea.total, linea.total_anterior) !== null;'));
  assert.match(linea, /<span aria-hidden=\{chipOculto \? true : undefined\} className="shrink-0">\s*<ChipVariacion /);
  // T5B r1 (M1): el texto de los ejes en las opciones de cada escala (COLOR_EJES), no en ChartJS.defaults.color.
  assert.equal((linea.match(/color: COLOR_EJES,/g) ?? []).length, 2, 'GraficoLinea: color de las marcas en x y en y');
  const dona = codigo(fuentes['GraficoDona.tsx']);
  for (const texto of ["cutout: '72%',", 'pointer-events-none absolute inset-0', '>Total<', '${tamanoCentroDona(total)} whitespace-nowrap',
    'todas.length > 1 &&', 'aria-pressed={presionada}', 'colorSegmento(i, s)', "etiquetar('dona', String(s.clave ?? ''), original)",
    "formatearValor(s.pct, 'porcentaje')", 'alCambiarModo?.(clave);', 'h-44 w-44',
    // La leyenda: la etiqueta con min-w-0 y al menos 6rem; si no cabe, el valor y el % bajan (flex-wrap), nunca «Col…».
    'flex min-w-0 flex-wrap items-center', 'min-w-0 flex-1 basis-24 truncate', 'inline-flex min-w-0 max-w-full',
    // T5B r1 (M16): el modo controlado gana; la tabla con la etiqueta (ya pasada por etiquetar) y el valor del segmento.
    'const activa = modo ?? elegida;', '<th scope="row">{s.etiqueta}</th>', '<td>{formatearValor(s.valor, formato)}</td>',
    "<td>{formatearValor(s.pct, 'porcentaje')}</td>", 'resumenAccesible({ ...dona, segmentos })']) {
    assert.ok(dona.includes(texto), `GraficoDona: ${texto}`);
  }
  // El estado de la dona elegida vive DENTRO del componente (uno por instancia), no en el módulo.
  const inicioDona = dona.indexOf('export function GraficoDona(');
  const estadoDona = dona.indexOf('const [elegida, setElegida] = useState<string | null>(null);');
  assert.ok(inicioDona >= 0 && estadoDona > inicioDona, 'GraficoDona: useState dentro de la función');
  assert.equal((dona.match(/\buseState\b/g) ?? []).length, 2, 'GraficoDona: el import y un solo useState');
  assert.ok(!/overflow-/.test(dona), 'GraficoDona: nada recorta el foco de las píldoras');
  const barras = codigo(fuentes['GraficoBarras.tsx']);
  for (const texto of ["indexAxis: horizontal ? 'y' : 'x',", "const horizontal = barras?.eje === 'categorias';", 'valoresConSigno(s)',
    'stacked: apiladas,', 'altoGraficoBarras(barras.eje, etiquetas.length)', 'recortarEtiqueta(etiquetas[Number(valor)])',
    "etiquetar('barras', String(s.clave ?? ''), original)", "etiquetar('barras', texto, texto)",
    'coloresSeries(crudas, colorModulo)', 'style={{ height: alto }}',
    // T5B r1 (M16 y M18): lo dibujado (tono 'negativo' hacia abajo) es lo que leen el tooltip, la tabla y el resumen.
    'data: s.dibujados,', 'formatearValor(series[item.datasetIndex]?.dibujados[item.dataIndex], formato)',
    '<td key={`${s.etiqueta}-${j}`}>{formatearValor(s.dibujados[i], formato)}</td>', 'resumenAccesible({ ...barras, series })',
    'tono: s.tono,']) {
    assert.ok(barras.includes(texto), `GraficoBarras: ${texto}`);
  }
  assert.ok(!/formatearValor\(s\.valores\[|\.valores\[item\.dataIndex\]|item\.raw/.test(barras), 'GraficoBarras: ningún canal lee el valor sin dibujar');
  assert.ok((barras.match(/color: COLOR_EJES,/g) ?? []).length >= 1 && /ticks: \{\s*color: COLOR_EJES,/.test(barras),
    'GraficoBarras: color de las marcas en las dos escalas');
  assert.equal((barras.match(/ticks: \{/g) ?? []).length, (barras.match(/ticks: \{\s*color: COLOR_EJES,/g) ?? []).length,
    'GraficoBarras: cada ticks lleva COLOR_EJES');
  assert.equal((barras.match(/stacked: apiladas,/g) ?? []).length, 2, 'GraficoBarras: apila en los dos ejes');

  // ListaMovimientos: hasta 8, la fecha de hace() (RP60, sin un formato nuevo), el monto y el ícono de lib/analisis.js.
  const movs = codigo(fuentes['ListaMovimientos.tsx']);
  for (const texto of ['movimientos.filas.slice(0, MAX_MOVIMIENTOS)', 'hace(fila.fecha, ahora)', 'fechaHoraLarga(fila.fecha)',
    'montoMovimiento(fila)', 'ICONOS[iconoMovimiento(fila)] ?? Circle', 'enlaceDocumento(fila.doc_tipo, fila.doc_id)',
    'onClick={() => alAbrir(fila)}', '<Link href={href}', "bloqueSinDatos('movimientos', movimientos)", 'Sin datos en este período',
    '{relativa && (', '<ul className="@container', '@xs:',
    // Los contenedores flex de los textos recortados llevan min-w-0 (si no, el título empuja el monto fuera de la fila).
    '<span className="block min-w-0 flex-1 @xs:flex', '<span className="block min-w-0 @xs:flex-1">', 'flex flex-wrap items-baseline justify-between',
    // T5B r1 (M16): el monto que se pinta es el de montoMovimiento (con su signo), con su tono.
    '{monto.texto}', '${TONO_MONTO[monto.tono]}']) {
    assert.ok(movs.includes(texto), `ListaMovimientos: ${texto}`);
  }
  assert.ok(!/formatearValor\(|formatoPesos\(/.test(movs), 'ListaMovimientos: el monto solo sale de montoMovimiento');
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
    'ranking.filas.slice(0, top)', 'proporcionesRanking(filas)', "bloqueSinDatos('ranking', ranking)",
    // T5B r1 (M8): la barra con el -600 del acento (colorDeAcento), el mismo criterio de 3:1 de la línea.
    'const barra = colorDeAcento(acento);', 'style={{ width: `${anchos[i]}%`, backgroundColor: barra }}',
    "etiquetar('ranking', crudo, crudo)", 'Sin datos en este período', '{alCambiarTop && (',
    'flex min-w-0 flex-wrap items-baseline justify-between', 'min-w-0 flex-1 basis-24 truncate', 'ml-auto shrink-0 whitespace-nowrap']) {
    assert.ok(ranking.includes(texto), `RankingTop: ${texto}`);
  }
  assert.ok(!/bg-[a-z]+-500/.test(ranking), 'RankingTop: sin los -500 (amber 2,15:1, teal 2,49:1)');
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
  for (const texto of ['clasesFranja(n)', '<div role="status" className={GRILLA_ANALISIS.raiz}>', 'Cargando el análisis…', 'motion-safe:animate-pulse', 'h-64', 'h-44 w-44']) {
    assert.ok(esqueleto.includes(texto), `EsqueletoAnalisis: ${texto}`);
  }
  // T5B r1 (M12): sin aria-busy en el status (retiene su anuncio); el aria-busy va en el contenedor que se actualiza (T5C).
  assert.ok(!esqueleto.includes('aria-busy'), 'EsqueletoAnalisis: sin aria-busy');
  assert.ok(!/[^:]animate-pulse/.test(esqueleto.replace(/motion-safe:animate-pulse/g, '')), 'el pulso solo con motion-safe');
  assert.ok(!/>\s*0\s*</.test(esqueleto), 'nunca ceros');
  // Las ocho piezas existen (index.ts, PanelAnalisis y los demás son de T5C).
  for (const archivo of Object.keys(PIEZAS)) assert.ok(existsSync(new URL(`../src/components/analisis/${archivo}`, import.meta.url)), archivo);
}

console.log('--- TEST 19 (T5B r1, M16): registro.ts de verdad (transpilado), con el Chart.js instalado y un matchMedia falso ---');
{
  // Se transpila registro.ts con el typescript instalado y se evalúa DOS veces (como una recarga en caliente del módulo),
  // con tres llamadas a registrarGraficos(): registra una sola vez, deja un solo oyente de prefers-reduced-motion y no
  // toca defaults.color ni defaults.plugins (los comparten las pantallas viejas de la lista blanca).
  const ts = createRequire(import.meta.url)('typescript');
  const fuente = readFileSync(new URL('../src/components/analisis/registro.ts', import.meta.url), 'utf8');
  const js = ts.transpileModule(fuente, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  const urlChart = import.meta.resolve('chart.js');
  assert.match(js, /from ['"]chart\.js['"]/);
  const conChart = js.replace(/from ['"]chart\.js['"]/, `from '${urlChart}'`);
  const { Chart, Tooltip, Legend, Filler } = await import(urlChart);
  const colorAntes = Chart.defaults.color;
  // Revisión de r1 (controlador): una foto profunda de Chart.defaults (las hojas; las funciones por su nombre) antes de
  // registrar. Después solo pueden cambiar la fuente y la animación: ni el color de los ejes por otra vía
  // (defaults.scale.ticks.color), ni borderColor, ni font.size. Lo que agrega el registro (claves nuevas) no cuenta.
  const fotoDefaults = (raiz) => {
    const hojas = new Map();
    const vistos = new WeakSet();
    const recorrer = (obj, ruta, profundidad) => {
      if (obj === null || typeof obj !== 'object' || vistos.has(obj) || profundidad > 8) return;
      vistos.add(obj);
      for (const clave of Object.keys(obj)) {
        let valor;
        try { valor = obj[clave]; } catch { continue; }
        const r = ruta ? `${ruta}.${clave}` : clave;
        if (typeof valor === 'function') hojas.set(r, `fn:${valor.name}`);
        else if (valor === null || typeof valor !== 'object') hojas.set(r, valor);
        else recorrer(valor, r, profundidad + 1);
      }
    };
    recorrer(raiz, '', 0);
    return hojas;
  };
  const fotoAntes = fotoDefaults(Chart.defaults);
  const oyentes = [];
  let consultas = 0;
  const previos = { window: globalThis.window, document: globalThis.document };
  globalThis.window = {
    matchMedia: (q) => {
      consultas += 1;
      assert.equal(q, '(prefers-reduced-motion: reduce)');
      return { matches: true, addEventListener: (tipo, fn) => oyentes.push([tipo, fn]) };
    },
    getComputedStyle: () => ({ fontFamily: 'Arial, Helvetica, sans-serif' }),
  };
  globalThis.document = { body: {} };
  try {
    const evaluar = (n) => import(`data:text/javascript;charset=utf-8,${encodeURIComponent(`${conChart}\n// evaluación ${n}`)}`);
    const m1 = await evaluar(1);
    m1.registrarGraficos();
    m1.registrarGraficos();
    const m2 = await evaluar(2);
    m2.registrarGraficos();
    assert.deepEqual([consultas, oyentes.length, oyentes[0]?.[0]], [1, 1, 'change'], 'un solo oyente con 2 evaluaciones y 3 llamadas');
    assert.deepEqual(Object.keys(Chart.registry.elements.items).sort(), ['arc', 'bar', 'line', 'point']);
    assert.deepEqual(Object.keys(Chart.registry.scales.items).sort(), ['category', 'linear']);
    assert.deepEqual(Object.keys(Chart.registry.plugins.items).sort(), ['filler', 'legend', 'tooltip']);
    assert.deepEqual([Chart.defaults.animation.duration, Chart.defaults.transitions.active.animation.duration], [0, 0], 'pide menos movimiento');
    oyentes[0][1]({ matches: false });
    assert.deepEqual([Chart.defaults.animation.duration, Chart.defaults.transitions.active.animation.duration], [400, 400], 'cambia la preferencia');
    oyentes[0][1]({ matches: true });
    assert.equal(Chart.defaults.animation.duration, 0);
    assert.equal(Chart.defaults.font.family, 'Arial, Helvetica, sans-serif', 'la fuente de la app');
    assert.equal(Chart.defaults.color, colorAntes, 'el color global sigue el de Chart.js (M1)');
    const PERMITIDOS = new Set(['font.family', 'animation.duration', 'transitions.active.animation.duration']);
    const fotoDespues = fotoDefaults(Chart.defaults);
    const cambiados = [...fotoAntes].filter(([clave, valor]) => !PERMITIDOS.has(clave) && fotoDespues.has(clave)
      && !Object.is(fotoDespues.get(clave), valor)).map(([clave]) => clave);
    assert.ok(fotoAntes.size > 50, 'la foto de Chart.defaults tiene sus hojas');
    assert.deepEqual(cambiados, [], 'registro.ts solo cambia la fuente y la animación globales');
    // Los tooltips, la leyenda y el relleno globales quedan con los valores que trae cada plugin de Chart.js (también
    // ante un defaults['plugins'] con corchetes, que la guarda del fuente no ve).
    for (const plugin of [Tooltip, Legend, Filler]) {
      const registrado = Chart.defaults.plugins[plugin.id];
      for (const [clave, valor] of Object.entries(plugin.defaults)) {
        if (valor === null || typeof valor !== 'object') assert.equal(registrado[clave], valor, `defaults.plugins.${plugin.id}.${clave}`);
      }
    }
    assert.equal(Chart.defaults.plugins.tooltip.callbacks.label, Tooltip.defaults.callbacks.label, 'el label global de Chart.js');
    assert.deepEqual([m1.ANIMACION_MS, m1.COLOR_EJES], [400, '#475569']);
  } finally {
    globalThis.window = previos.window;
    globalThis.document = previos.document;
  }
}

console.log('--- TEST 20 (T5C): la lógica del panel (preferencias, foco, producto, carga, errores y textos) ---');
{
  const {
    MODULOS_ANALISIS, clavePreferenciaAnalisis, PREFERENCIA_ANALISIS_POR_DEFECTO, leerPreferenciaAnalisis, resolverFoco,
    PRODUCTO_MINIMO, ESPERA_PRODUCTO_MS, productoConsulta, parametrosAnalisis, aplicarLlegadaAnalisis, estadoAnalisis,
    MENSAJE_SIN_PERMISO_ANALISIS, MENSAJE_ERROR_ANALISIS, errorAnalisis, siguienteErrorVisto, textoComparado,
    borradorPersonalizado, tarjetaKpiAnalisis, ICONO_KPI_POR_FORMATO, mejorDeLinea, textoActualizado, ASISTENTE_POR_DEFECTO,
  } = analisis;
  const { claveValida } = await import('../src/lib/preferencias.js');
  const { ICONOS_KPI } = await import('../src/lib/kpis.js');
  const { crearCargaListado } = await import('../src/lib/tabla.js');

  // RP69: un módulo por Hub; 'ventas-sc', 'ventas-cot' y 'ventas-pven' se descartan (el foco va en analisis:ventas).
  assert.deepEqual(MODULOS_ANALISIS, ['ventas', 'compras', 'inventario', 'crm', 'finanzas']);
  assert.ok(Object.isFrozen(MODULOS_ANALISIS));
  for (const m of MODULOS_ANALISIS) {
    assert.equal(clavePreferenciaAnalisis(m), `analisis:${m}`);
    assert.ok(claveValida(clavePreferenciaAnalisis(m)), `la clave de ${m} pasa la regex del servidor`);
  }
  for (const malo of ['ventas-sc', 'ventas-pven', 'Ventas', '', null, undefined]) {
    assert.throws(() => clavePreferenciaAnalisis(malo), /Módulo de Análisis desconocido/, String(malo));
  }

  // R4: período, top y foco en analisis:<modulo>; lo guardado se lee pieza por pieza (una pieza mala no tumba las demás).
  assert.deepEqual(PREFERENCIA_ANALISIS_POR_DEFECTO, { periodo: { clave: '30d' }, top: 5, foco: null });
  assert.ok(Object.isFrozen(PREFERENCIA_ANALISIS_POR_DEFECTO) && Object.isFrozen(PREFERENCIA_ANALISIS_POR_DEFECTO.periodo));
  const POR_DEFECTO = { periodo: { clave: '30d' }, top: 5, foco: null };
  for (const raro of [undefined, null, '{malo', 42, [1, 2], true, {}]) {
    assert.deepEqual(leerPreferenciaAnalisis(raro, { hoy: HOY }), POR_DEFECTO, `vacío o dañado: ${JSON.stringify(raro)}`);
  }
  assert.deepEqual(leerPreferenciaAnalisis({ periodo: { clave: '90d' }, top: 10 }, { hoy: HOY }), { periodo: { clave: '90d' }, top: 10, foco: null });
  assert.deepEqual(leerPreferenciaAnalisis({ periodo: '7d', top: 25 }, { hoy: HOY }).periodo, { clave: '7d' }, 'la clave sola');
  assert.deepEqual(leerPreferenciaAnalisis({ periodo: { clave: '7d', desde: '2026-01-01', hasta: '2026-01-02' } }, { hoy: HOY }).periodo,
    { clave: '7d' }, 'las fechas solo cuentan en personalizado');
  const valido = { clave: 'personalizado', desde: '2026-09-01', hasta: '2026-09-30', otra: 'x' };
  assert.deepEqual(leerPreferenciaAnalisis({ periodo: valido }, { hoy: HOY }).periodo,
    { clave: 'personalizado', desde: '2026-09-01', hasta: '2026-09-30' }, 'un personalizado válido, sin claves de más');
  assert.equal(valido.otra, 'x', 'no muta lo guardado');
  for (const malo of [{ clave: 'personalizado', desde: '2026-10-01', hasta: '2026-11-30' }, { clave: 'personalizado' },
    { clave: 'personalizado', desde: '2026-09-30', hasta: '2026-09-01' }, { clave: '15d' }, 'semana']) {
    assert.deepEqual(leerPreferenciaAnalisis({ periodo: malo, top: 10 }, { hoy: HOY }), { periodo: { clave: '30d' }, top: 10, foco: null },
      `período que ya no vale: ${JSON.stringify(malo)}`);
  }
  for (const malo of [7, '10', 0, null, 5.5]) assert.equal(leerPreferenciaAnalisis({ top: malo }, { hoy: HOY }).top, 5, `top ${malo}`);
  assert.equal(leerPreferenciaAnalisis({ foco: 'cot' }, { focos: FOCOS_VENTAS, hoy: HOY }).foco, 'cot');
  assert.equal(leerPreferenciaAnalisis({ foco: 'xx' }, { focos: FOCOS_VENTAS, hoy: HOY }).foco, 'hub', 'un foco que no existe: el primero');
  assert.equal(leerPreferenciaAnalisis({}, { focos: FOCOS_VENTAS, hoy: HOY }).foco, 'hub');
  assert.equal(leerPreferenciaAnalisis({ foco: 'cot' }, { hoy: HOY }).foco, null, 'sin focos no hay foco');
  const leida = leerPreferenciaAnalisis(undefined, { hoy: HOY });
  assert.ok(!Object.isFrozen(leida.periodo) && leida.periodo !== PERIODO_POR_DEFECTO, 'una copia, no la constante');

  // R13: el foco de la URL («Ver análisis» de las listas) gana sobre el guardado; si no vale, el guardado; si no, el primero.
  assert.equal(resolverFoco(FOCOS_VENTAS, 'sc', 'cot'), 'sc');
  assert.equal(resolverFoco(FOCOS_VENTAS, 'xx', 'cot'), 'cot');
  assert.equal(resolverFoco(FOCOS_VENTAS, null, 'pven'), 'pven');
  assert.equal(resolverFoco(FOCOS_VENTAS, undefined, 'xx'), 'hub');
  assert.equal(resolverFoco(FOCOS_VENTAS, 'SC', null), 'hub', 'la clave exacta');
  for (const sin of [null, undefined, []]) assert.equal(resolverFoco(sin, 'sc', 'cot'), null);

  // RP69: el campo Producto manda producto= solo con 2 caracteres o más (T6C da 422 con menos), 400 ms después.
  assert.deepEqual([PRODUCTO_MINIMO, ESPERA_PRODUCTO_MS], [2, 400]);
  for (const corto of ['', 'a', '  a  ', 'ñ', null, undefined, '   ']) assert.equal(productoConsulta(corto), null, JSON.stringify(corto));
  assert.equal(productoConsulta('ab'), 'ab');
  assert.equal(productoConsulta('  cuna  '), 'cuna');
  assert.equal(productoConsulta('😀a'), '😀a', 'cuenta letras, no unidades de UTF-16');
  assert.equal(productoConsulta('😀'), null);
  assert.deepEqual(parametrosAnalisis({ bodega: '3' }, { foco: 'sc', producto: 'cu' }), { bodega: '3', foco: 'sc', producto: 'cu' });
  assert.deepEqual(parametrosAnalisis(undefined, { foco: null, producto: 'c' }), {});
  assert.deepEqual(parametrosAnalisis({ foco: 'hub', producto: 'viejo' }, { foco: 'cot', producto: '' }), { foco: 'cot' },
    'el foco y el producto del panel ganan sobre params');
  assert.equal(consultaAnalisis({ clave: '30d' }, 5, parametrosAnalisis({ bodega: 2 }, { foco: 'pven', producto: ' cuna ' })),
    'periodo=30d&top=5&bodega=2&foco=pven&producto=cuna');
  assert.equal(consultaAnalisis({ clave: '7d' }, 10, parametrosAnalisis({}, { foco: null, producto: 'c' })), 'periodo=7d&top=10');

  // La carga (useAnalisis): la llegada de crearCargaListado con su ContextoListado {ruta: el ámbito, usuario}; un error
  // conserva lo último bueno del MISMO ámbito y del MISMO usuario (como useResumenFlujo, T5A r1); otro ámbito u otra
  // cuenta no se muestran.
  const R = (data) => ({ status: 'success', data });
  const ctx = { ruta: '/ventas/analisis|hub', usuario: 7 };
  const llegadaBuena = { marca: 'k1', ok: true, respuesta: R({ kpis: [{ clave: 'v', valor: 5 }] }), contexto: ctx, repeticion: 0 };
  const r1 = aplicarLlegadaAnalisis(null, llegadaBuena);
  assert.deepEqual(r1, { clave: 'k1', ambito: ctx.ruta, usuario: 7, repeticion: 0, datos: normalizarAnalisis(llegadaBuena.respuesta), error: null });
  assert.equal(r1.datos.kpis[0].anterior, null, 'normalizado: nunca rellena cifras');
  const sinData = aplicarLlegadaAnalisis(r1, { marca: 'k2', ok: true, respuesta: { status: 'success' }, contexto: ctx, repeticion: 0 });
  assert.equal(sinData.datos, r1.datos, 'una respuesta sin data conserva lo último bueno');
  assert.equal(sinData.error.message, 'La respuesta del análisis no trae datos.');
  const caida = Object.assign(new Error('Failed to fetch'), { status: undefined });
  const r2 = aplicarLlegadaAnalisis(r1, { marca: 'k2', ok: false, error: caida, contexto: ctx, repeticion: 0 });
  assert.deepEqual([r2.clave, r2.datos, r2.error], ['k2', r1.datos, caida], 'el error conserva lo último bueno');
  assert.equal(aplicarLlegadaAnalisis(r1, { marca: 'k2', ok: false, contexto: { ...ctx, usuario: 8 }, repeticion: 0 }).datos, null, 'otra cuenta');
  assert.equal(aplicarLlegadaAnalisis(r1, { marca: 'k2', ok: false, contexto: { ...ctx, ruta: '/ventas/analisis|sc' }, repeticion: 0 }).datos,
    null, 'otro ámbito (otro foco)');
  assert.equal(aplicarLlegadaAnalisis(null, { marca: 'k', ok: false, contexto: ctx }).error.message, 'No se pudo cargar el análisis.');
  assert.deepEqual(r1.datos.kpis[0].valor, 5, 'aplicar no muta el previo');

  const consulta = (clave, extra = {}) => ({ clave, ambito: ctx.ruta, usuario: 7, repeticion: 0, ...extra });
  assert.deepEqual(estadoAnalisis(null, consulta('k1')), { datos: null, cargando: true, error: null }, 'antes de la primera respuesta');
  assert.deepEqual(estadoAnalisis(r1, consulta('k1')), { datos: r1.datos, cargando: false, error: null });
  assert.deepEqual(estadoAnalisis(r1, consulta('k9')), { datos: r1.datos, cargando: true, error: null },
    'otro período: los datos anteriores siguen (atenuados) mientras llega');
  assert.deepEqual(estadoAnalisis(r1, consulta('k1', { usuario: 8 })), { datos: null, cargando: true, error: null }, 'otra cuenta: nada');
  assert.deepEqual(estadoAnalisis(r1, consulta('k1', { ambito: '/ventas/analisis|sc' })), { datos: null, cargando: true, error: null },
    'otro foco: el esqueleto, no los datos del foco anterior');
  assert.deepEqual(estadoAnalisis(r1, consulta('k1', { repeticion: 1 })), { datos: r1.datos, cargando: true, error: null }, 'una vuelta');
  assert.deepEqual(estadoAnalisis(r2, consulta('k2')), { datos: r1.datos, cargando: false, error: caida });
  assert.deepEqual(estadoAnalisis(r2, consulta('k3')), { datos: r1.datos, cargando: true, error: null }, 'reintentando: sin el error');

  // De punta a punta con crearCargaListado (el turno de useListado): si cambias el período varias veces, solo cuenta el
  // último, aunque la respuesta vieja llegue después.
  {
    const pendientes = [];
    let resultado = null;
    const carga = crearCargaListado({
      pedir: (url, signal) => new Promise((resolver) => pendientes.push({ url, signal, resolver })),
      alLlegar: (llegada) => { resultado = aplicarLlegadaAnalisis(resultado, llegada); },
    });
    carga.cargar('/ventas/analisis?periodo=7d&top=5', 'a', ctx);
    await Promise.resolve();
    carga.cargar('/ventas/analisis?periodo=90d&top=5', 'b', ctx);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(pendientes.map((p) => [p.url, p.signal.aborted]),
      [['/ventas/analisis?periodo=7d&top=5', true], ['/ventas/analisis?periodo=90d&top=5', false]], 'la anterior se cancela');
    pendientes[1].resolver(R({ kpis: [{ clave: 'v', valor: 90 }] }));
    pendientes[0].resolver(R({ kpis: [{ clave: 'v', valor: 7 }] }));
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual([resultado.clave, resultado.datos.kpis[0].valor], ['b', 90], 'la vieja no pisa a la nueva');
  }

  // Errores: el 403 se distingue (apiFetch lanza con .status, Bloque 2).
  assert.equal(MENSAJE_SIN_PERMISO_ANALISIS, 'No tienes permiso para ver este análisis.');
  assert.equal(MENSAJE_ERROR_ANALISIS, 'No pudimos cargar el análisis. Revisa tu conexión y vuelve a intentarlo.');
  assert.equal(errorAnalisis(null), null);
  assert.deepEqual(errorAnalisis(Object.assign(new Error('Forbidden'), { status: 403 })),
    { tipo: 'permiso', texto: MENSAJE_SIN_PERMISO_ANALISIS, reintentar: false });
  for (const e of [Object.assign(new Error('x'), { status: 500 }), new TypeError('Failed to fetch'), Object.assign(new Error('Sesión'), { status: 401 }),
    new Error('La respuesta del análisis no trae datos.'), Object.assign(new Error(''), { status: 422 })]) {
    assert.deepEqual(errorAnalisis(e), { tipo: 'carga', texto: MENSAJE_ERROR_ANALISIS, reintentar: true }, e.message);
  }
  assert.deepEqual(errorAnalisis(Object.assign(new Error('El ranking solo puede mostrar 5, 10 o 25.'), { status: 422 })),
    { tipo: 'validacion', texto: 'El ranking solo puede mostrar 5, 10 o 25.', reintentar: false }, 'el 422 trae el texto del servidor');
  // Lo que se ve: mientras carga (el reintento) se conserva el error que se vio; al terminar, el de la última llegada.
  const visto = errorAnalisis(Object.assign(new Error('x'), { status: 500 }));
  assert.equal(siguienteErrorVisto(visto, { cargando: true, error: null }), visto, 'reintentando: el mismo aviso');
  assert.equal(siguienteErrorVisto(null, { cargando: true, error: null }), null);
  assert.equal(siguienteErrorVisto(visto, { cargando: false, error: null }), null, 'salió bien');
  assert.equal(siguienteErrorVisto(visto, { cargando: false, error: new TypeError('Failed to fetch') }), visto, 'el mismo texto: la misma identidad');
  assert.deepEqual(siguienteErrorVisto(visto, { cargando: false, error: Object.assign(new Error('x'), { status: 403 }) }),
    errorAnalisis({ status: 403 }));

  // 'Comparado con 5 ago – 3 sept' (periodo.comparado del servidor: 'vs 5 ago – 3 sept').
  assert.equal(textoComparado({ comparado: 'vs 5 ago – 3 sept' }), 'Comparado con 5 ago – 3 sept');
  assert.equal(textoComparado({ comparado: '28 sept – 27 oct' }), 'Comparado con 28 sept – 27 oct');
  for (const nada of [null, undefined, {}, { comparado: '' }, { comparado: '  ' }, { comparado: 5 }]) assert.equal(textoComparado(nada), null);
  // El borrador de Personalizado: las fechas aplicadas o, si no, las del período que se ve.
  assert.deepEqual(borradorPersonalizado({ clave: 'personalizado', desde: '2026-09-01', hasta: '2026-09-30' }, { desde: '2026-01-01', hasta: '2026-01-31' }),
    { desde: '2026-09-01', hasta: '2026-09-30' });
  assert.deepEqual(borradorPersonalizado({ clave: '30d' }, { desde: '2026-09-29', hasta: '2026-10-28' }), { desde: '2026-09-29', hasta: '2026-10-28' });
  assert.deepEqual(borradorPersonalizado({ clave: '30d' }, null), { desde: '', hasta: '' });
  assert.deepEqual(borradorPersonalizado(null, { desde: '2026-09-29T00:00:00Z', hasta: 5 }), { desde: '', hasta: '' }, 'solo AAAA-MM-DD');

  // FilaKpis = TarjetaKpi con variación (C12, RP27): cada kpi del contrato a las props de la tarjeta.
  const vendido = { clave: 'vendido_periodo', etiqueta: 'Vendido (30 días)', valor: 4927538, anterior: 4380034, variacion_pct: 12.5,
    formato: 'pesos', mejor: 'sube', es_foto: false, ayuda: 'Pedidos creados en el período, sin cancelados ni devueltos.' };
  assert.deepEqual(tarjetaKpiAnalisis(vendido), {
    clave: 'vendido_periodo', kpi: 'vendido_periodo', etiqueta: 'Vendido (30 días)', formato: 'pesos', valor: 4927538, icono: null,
    variacion: { actual: 4927538, anterior: 4380034, mejorSiSube: true }, ayuda: vendido.ayuda, titulo: null,
  }, 'un id del catálogo trae el ícono y el color de CATALOGO_KPI; la etiqueta es la del servidor');
  const nuevos = tarjetaKpiAnalisis({ clave: 'pedidos_nuevos', etiqueta: 'Pedidos', valor: '12', anterior: 0, formato: 'entero', mejor: 'baja' });
  assert.deepEqual([nuevos.kpi, nuevos.icono, nuevos.formato, nuevos.valor, nuevos.variacion],
    [null, 'Activity', 'entero', '12', { actual: 12, anterior: 0, mejorSiSube: false }]);
  const dias = tarjetaKpiAnalisis({ clave: 'dias_entrega', etiqueta: 'Días de entrega', valor: 3.46, anterior: 2, formato: 'dias', mejor: 'baja' });
  assert.deepEqual([dias.formato, dias.valor, dias.icono, dias.variacion], ['texto', '3,5 días', 'Clock', { actual: 3.46, anterior: 2, mejorSiSube: false }]);
  assert.deepEqual(tarjetaKpiAnalisis({ clave: 'u', valor: 1234, formato: 'unidades', mejor: 'sube' }).valor, '1.234 u.');
  assert.equal(tarjetaKpiAnalisis({ clave: 'u', valor: null, formato: 'dias' }).valor, null, 'sin valor: null (la tarjeta pinta «—»), no «null días»');
  assert.equal(tarjetaKpiAnalisis({ clave: 'u', formato: 'pesos' }).valor, null, 'nunca 0');
  assert.equal(tarjetaKpiAnalisis({ clave: 'u', valor: { x: 1 }, formato: 'pesos' }).valor, null);
  const saldo = tarjetaKpiAnalisis({ clave: 'pven_saldo_por_cobrar', etiqueta: 'Saldo por cobrar', valor: 1200000, anterior: null, formato: 'pesos',
    mejor: 'baja', es_foto: true, ayuda: 'Lo que deben los pedidos vigentes.' });
  assert.deepEqual([saldo.variacion, saldo.ayuda, saldo.titulo], [null, 'Cifra de hoy, sin comparación', 'Lo que deben los pedidos vigentes.'],
    'una foto: sin variación, lo dice debajo y su ayuda va en el title');
  assert.deepEqual(tarjetaKpiAnalisis({ clave: 'x', valor: 5, anterior: null, formato: 'entero', mejor: 'sube' }).variacion,
    { actual: 5, anterior: null, mejorSiSube: true }, 'sin anterior la tarjeta dice «—» (RP27)');
  assert.equal(tarjetaKpiAnalisis({ clave: 'x', valor: 5, anterior: 4, mejor: 'neutro' }).variacion.mejorSiSube, null);
  assert.equal(tarjetaKpiAnalisis({ clave: 'x', valor: 5, anterior: 4 }).variacion.mejorSiSube, null, 'sin mejor: gris (nunca un verde inventado)');
  for (const [f, esperado] of [['numero', 'entero'], ['porcentaje', 'porcentaje'], [null, 'entero'], ['raro', 'entero'], ['texto', 'texto']]) {
    assert.equal(tarjetaKpiAnalisis({ clave: 'x', valor: 1, formato: f }).formato, esperado, String(f));
  }
  assert.deepEqual([tarjetaKpiAnalisis({ valor: 1 }).etiqueta, tarjetaKpiAnalisis({ clave: 'abc', valor: 1 }).etiqueta], ['Indicador', 'abc']);
  assert.deepEqual({ ...ICONO_KPI_POR_FORMATO },
    { pesos: 'DollarSign', entero: 'Activity', porcentaje: 'PieChart', dias: 'Clock', unidades: 'Package', texto: 'Activity' });
  for (const icono of Object.values(ICONO_KPI_POR_FORMATO)) assert.ok(ICONOS_KPI.includes(icono), `${icono} está en ICONOS_KPI`);
  assert.equal(tarjetaKpiAnalisis(null).valor, null);

  // M19 (D43): el «mejor» de la línea es el del kpi de la misma cifra; la pantalla puede fijarlo.
  const kpis = [
    { clave: 'a', formato: 'pesos', valor: 900, mejor: 'neutro' }, { clave: 'b', formato: 'pesos', valor: 4927538, mejor: 'baja' },
    { clave: 'c', formato: 'entero', valor: 4927538, mejor: 'neutro' },
  ];
  assert.equal(mejorDeLinea({ formato: 'pesos', total: 4927538 }, kpis), 'baja', 'el mismo formato y el mismo total');
  assert.equal(mejorDeLinea({ formato: 'entero', total: 3 }, kpis), 'neutro', 'un solo kpi con ese formato');
  assert.equal(mejorDeLinea({ total: 4927538 }, kpis), 'neutro', 'sin formato es entero');
  assert.equal(mejorDeLinea({ formato: 'pesos', total: 1 }, kpis), 'sube', 'ambiguo: el de por defecto');
  assert.equal(mejorDeLinea({ formato: 'pesos', total: 900 }, kpis, 'baja'), 'baja', 'la pantalla lo fija');
  assert.equal(mejorDeLinea({ formato: 'pesos', total: 900 }, kpis, 'raro'), 'neutro', 'uno que no vale se ignora');
  assert.equal(mejorDeLinea(null, kpis), 'sube');
  assert.equal(mejorDeLinea({ formato: 'pesos', total: 4927538 }, [{ formato: 'pesos', valor: 4927538, mejor: 'x' }]), 'sube');

  // 'Actualizado hace 2 minutos' (generado_en, ISO con Z; hace() de lib/fechas-colombia.js, RP60).
  const T = Date.parse('2026-10-28T15:02:30Z');
  assert.equal(textoActualizado('2026-10-28T15:00:00Z', T), 'Actualizado hace 2 minutos');
  assert.equal(textoActualizado('2026-10-28T15:02:00Z', T), 'Actualizado hace un momento');
  for (const nada of [null, undefined, '', 'ayer']) assert.equal(textoActualizado(nada, T), '');

  // R2 y RP69: sin la prop asistente, {titulo: 'Asistente con IA', ejemplos: []}.
  assert.deepEqual(ASISTENTE_POR_DEFECTO, { titulo: 'Asistente con IA', ejemplos: [] });
  assert.ok(Object.isFrozen(ASISTENTE_POR_DEFECTO));
}

console.log('--- TEST 21 (T5C): el fuente de las siete piezas del panel (sin DOM en node) ---');
{
  const leer = (nombre) => readFileSync(new URL(`../src/components/analisis/${nombre}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = (texto) => texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const PIEZAS = {
    'PanelAnalisis.tsx': /export function PanelAnalisis\(/, 'PanelAnalisisPerezoso.tsx': /export const PanelAnalisisPerezoso = dynamic</,
    'useAnalisis.ts': /export function useAnalisis\(/, 'SelectorPeriodo.tsx': /export function SelectorPeriodo\(/,
    'FilaKpis.tsx': /export function FilaKpis\(/, 'AsistenteEnConstruccion.tsx': /export function AsistenteEnConstruccion\(/,
  };
  const fuentes = Object.fromEntries(Object.keys(PIEZAS).map((n) => [n, leer(n)]));
  const FOCO = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-700';
  for (const [archivo, exporta] of Object.entries(PIEZAS)) {
    const fuente = fuentes[archivo];
    const c = codigo(fuente);
    assert.ok(fuente.startsWith("'use client';"), `${archivo}: «use client»`);
    assert.match(fuente, exporta, `${archivo}: exporta su pieza`);
    assert.ok(!/\bdark:/.test(fuente), `${archivo}: sin dark:`);
    assert.ok(!/(^|[^\w.$])(?:(?:window|globalThis)\??\.)?(?:alert|confirm|prompt)\s*\(/m.test(c), `${archivo}: sin alert, confirm ni prompt`);
    assert.ok(!/outline-none/.test(c), `${archivo}: nunca outline-none`);
    assert.ok(!/localStorage|sessionStorage|preferenciasApp|\bfetch\(/.test(c), `${archivo}: nada de almacenamiento ni fetch directo (R4)`);
    assert.equal(/\bapiFetch\(/.test(c), archivo === 'useAnalisis.ts', `${archivo}: solo useAnalisis pide los datos`);
    assert.equal(/usePreferencia/.test(c), archivo === 'PanelAnalisis.tsx', `${archivo}: solo PanelAnalisis recuerda (analisis:<modulo>)`);
    assert.ok(!c.includes('/ventas/ai-chat'), `${archivo}: R2, ningún endpoint de IA`);
    // Lo que toma el foco usa el outline de focus-visible (los controles deshabilitados del asistente no lo toman).
    if (archivo !== 'AsistenteEnConstruccion.tsx' && /<button\b|<Link\b|<input\b|<select\b/.test(c)) assert.ok(c.includes(FOCO), `${archivo}: foco visible`);
    for (const linea of c.split('\n').filter((l) => /className=[^>]*\btruncate\b/.test(l))) {
      assert.ok(/\btitle=/.test(linea), `${archivo}: truncate sin title: ${linea.trim()}`);
    }
    assert.ok(!/text-(slate|gray)-(300|400|500)\b|text-(emerald|rose|red|amber|green)-(400|500|600)\b/.test(c), `${archivo}: contraste`);
  }

  // AsistenteEnConstruccion (R2): la tarjeta sin respuestas, sin endpoints y sin temporizadores; el ÚNICO aviso de IA.
  const asistente = codigo(fuentes['AsistenteEnConstruccion.tsx']);
  for (const texto of ['En construcción', 'El asistente con IA llega en el Bloque 5: responderá con los datos reales de esta pantalla.',
    'bg-amber-100', 'text-amber-800', '{titulo}', 'preguntas.map((pregunta, i) =>', '<input', 'type="text"']) {
    assert.ok(asistente.includes(texto), `AsistenteEnConstruccion: ${texto}`);
  }
  assert.equal((asistente.match(/^\s*disabled$/gm) ?? []).length, 2, 'los chips y la caja, deshabilitados');
  assert.ok(!/useState|useEffect|setTimeout|setInterval|apiFetch|fetch\(|onClick|onChange|onSubmit|onKeyDown|async\b|await\b/.test(asistente),
    'AsistenteEnConstruccion: sin estado, sin temporizadores, sin endpoints y sin respuestas');
  assert.ok(!/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(fuentes['AsistenteEnConstruccion.tsx']), 'sin emojis');
  for (const [archivo, fuente] of Object.entries(fuentes)) {
    if (archivo === 'AsistenteEnConstruccion.tsx') continue;
    assert.ok(!/En construcción|llega en el Bloque 5/.test(fuente), `${archivo}: el aviso de IA vive solo en AsistenteEnConstruccion`);
  }

  // PanelAnalisisPerezoso (R13, D43 M6): PanelAnalisis en su propio chunk, con el esqueleto mientras llega.
  const perezoso = codigo(fuentes['PanelAnalisisPerezoso.tsx']);
  for (const texto of ["import dynamic from 'next/dynamic';", "import type { PropsPanelAnalisis } from './PanelAnalisis';",
    "() => import('./PanelAnalisis').then((m) => m.PanelAnalisis),", '{ ssr: false, loading: () => <EsqueletoAnalisis /> },']) {
    assert.ok(perezoso.includes(texto), `PanelAnalisisPerezoso: ${texto}`);
  }
  assert.ok(!/^import (?!type\b)[^;]*from '\.\/(PanelAnalisis|Grafico\w+|registro)';/m.test(perezoso), 'PanelAnalisisPerezoso: sin import estático del panel ni de los gráficos');

  // index.ts (D43 M6): sin PanelAnalisis, los gráficos ni registro.ts (solo tipos del panel).
  const indice = leer('index.ts');
  for (const linea of indice.split('\n').filter((l) => /^export /.test(l))) {
    assert.ok(!/from '\.\/(Grafico\w+|registro)'/.test(linea), `index.ts no reexporta los gráficos: ${linea}`);
    if (/from '\.\/PanelAnalisis'/.test(linea)) assert.match(linea, /^export type \{/, `index.ts: de PanelAnalisis solo tipos: ${linea}`);
  }
  for (const nombre of ['PanelAnalisisPerezoso', 'useAnalisis', 'SelectorPeriodo', 'FilaKpis', 'AsistenteEnConstruccion']) {
    assert.match(indice, new RegExp(`^export \\{ ${nombre} \\} from '\\./${nombre}';$`, 'm'), `index.ts exporta ${nombre}`);
  }

  // useAnalisis: la pauta de useListado y useResumenFlujo (turno, signal, usuario del token y repetición).
  const hook = codigo(fuentes['useAnalisis.ts']);
  for (const texto of ["import { crearCargaListado } from '@/lib/tabla';", "import { usuarioDeLaSesion } from '@/components/tabla/usuarioDeLaSesion';",
    'apiFetch(url, { signal })', 'const consulta = consultaAnalisis(periodo, top, extra ?? {});',
    'alLlegar: (llegada) => setResultado((previo) => aplicarLlegadaAnalisis(previo, llegada)),',
    'useSyncExternalStore(carga.suscribir, carga.repeticion, carga.repeticion)', 'const usuario = usuarioDeLaSesion();',
    "const clave = `${version}|${usuario ?? ''}|${url}`;", 'if (esperar) return undefined;', 'carga.cargar(url, clave, { ruta: ambitoFinal, usuario });',
    'return () => carga.cancelar();', 'estadoAnalisis(resultado, { clave, ambito: ambitoFinal, usuario, repeticion })',
    'const cargando = visto.cargando || esperar;', 'aviso: errorAnalisis(error),', 'cargandoInicial: cargando && !datos,',
    'recargando: cargando && Boolean(datos),', 'const recargar = useCallback(() => setVersion((v) => v + 1), []);']) {
    assert.ok(hook.includes(texto), `useAnalisis: ${texto}`);
  }

  // SelectorPeriodo: píldoras (o un select en anchos chicos), Personalizado con el error del servidor en línea.
  const selector = codigo(fuentes['SelectorPeriodo.tsx']);
  for (const texto of ['PERIODOS.map((p) =>', 'aria-pressed={p.clave === elegido}', 'hidden min-w-0 flex-wrap gap-1.5 @xl:flex', 'min-w-0 @xl:hidden',
    '<select', '<label htmlFor={idSelect} className="sr-only">Período</label>', 'const texto = errorPeriodo(periodo, hoy);', 'if (!texto) alAplicar(periodo);',
    '<form noValidate onSubmit={aplicar}', 'role="alert"', 'Aplicar', 'borradorPersonalizado(periodo, periodoDatos)', "elegido === 'personalizado' &&",
    'aria-invalid={conError}', 'aria-describedby={descrito}', "{comparado ?? ''}", 'if (clave !== periodo.clave) alCambiar({ clave });']) {
    assert.ok(selector.includes(texto), `SelectorPeriodo: ${texto}`);
  }
  assert.equal((selector.match(/type="date"/g) ?? []).length, 2, 'SelectorPeriodo: Desde y Hasta');
  assert.equal((selector.match(/max=\{hoy\}/g) ?? []).length, 2, 'SelectorPeriodo: a lo sumo hoy');

  // FilaKpis (C12, D43 M2): TarjetaKpi con variación dentro de FranjaKpis, sin una grilla propia.
  const fila = codigo(fuentes['FilaKpis.tsx']);
  for (const texto of ["import { FranjaKpis, TarjetaKpi } from '@/components/ui/TarjetaKpi';", '<FranjaKpis estado={estado}', 'const t = tarjetaKpiAnalisis(k);',
    'variacion={t.variacion}', 'formato={t.formato}', 'valor={t.valor}', 'etiqueta={t.etiqueta}', 'textoPeriodo={comparado || SIN_COMPARADO}',
    'ayuda={t.ayuda ?? undefined}', 'titulo={t.titulo ?? undefined}', '<FranjaKpis estado="cargando"']) {
    assert.ok(fila.includes(texto), `FilaKpis: ${texto}`);
  }
  assert.ok(!/grid-cols|clasesFranja|\bgrid\b/.test(fila), 'FilaKpis: la grilla es la de FranjaKpis (D43, M2)');

  // PanelAnalisis: preferencias por partes, el tope de espera, el foco, el producto, la carga y la grilla.
  const panel = codigo(fuentes['PanelAnalisis.tsx']);
  for (const texto of ['usePreferenciaParte(clavePreferenciaAnalisis(modulo), PREFERENCIA_ANALISIS_POR_DEFECTO)',
    'leerPreferenciaAnalisis(guardado, { focos })', 'esperarPreferencias({ alVencer: () => setVencidoPara(usuario) })',
    'const listo = listoConTope(prefsListas, vencidoPara === usuario);', 'if (prefsListas) return undefined;',
    'resolverFoco(focos, usarInicial ? focoInicial : null, prefs.foco)', 'productoConsulta(producto)), ESPERA_PRODUCTO_MS)',
    'parametrosAnalisis(params, { foco, producto: busquedaProducto ? productoAplicado : null })', "ambito: `${endpoint}|${foco ?? ''}`,",
    'esperar: !listo,', 'periodo: prefs.periodo,', 'top: prefs.top,', 'siguienteErrorVisto(errorVisto, { cargando: analisis.cargando, error: analisis.error })',
    'aria-busy={analisis.cargando}', 'mejor={mejorDeLinea(datos.linea, datos.kpis, mejorLinea)}', '<FilaKpis kpis={datos.kpis} comparado={datos.periodo?.comparado} acento={acento} />',
    '<EsqueletoAnalisis barra={false} />', 'asistente ?? ASISTENTE_POR_DEFECTO', '<AsistenteEnConstruccion titulo={elAsistente.titulo} ejemplos={elAsistente.ejemplos} />',
    'alCambiarTop={elegirTop}', 'modo={modoDona} alCambiarModo={setModoDona}', 'alAbrir={alAbrirMovimiento}', 'aria-pressed={f.clave === foco}',
    "{reintentando ? 'Reintentando…' : 'Reintentar'}", 'aria-disabled={reintentando || undefined}', 'regionRef.current?.focus({ preventScroll: true })',
    'textoComparado(datos.periodo)', 'textoActualizado(datos.generado_en)', "atenuar ? 'opacity-60' : ''", 'granularidad={granularidad}',
    'pointer-events-none absolute', 'aria-describedby={productoCorto ? idAyudaProducto : undefined}']) {
    assert.ok(panel.includes(texto), `PanelAnalisis: ${texto}`);
  }
  // D38: cada cambio escribe SOLO su pieza, desde un manejador (nunca al montar ni en un efecto: D35).
  const escrituras = [...panel.matchAll(/guardarParte\(([^)]*)\)/g)].map((m) => m[1]);
  assert.deepEqual(escrituras, ['{ foco: clave }', '{ periodo }', '{ top }'], 'una pieza por escritura');
  for (const bloque of panel.split('useEffect(').slice(1)) {
    const cuerpo = bloque.slice(0, bloque.indexOf('}, ['));
    assert.ok(!cuerpo.includes('guardarParte'), 'ningún efecto escribe preferencias (D35)');
  }
  assert.equal((panel.match(/aria-busy=/g) ?? []).length, 1, 'aria-busy solo en la región que se actualiza (D43, M12)');
  for (const clave of Object.keys(analisis.GRILLA_ANALISIS)) assert.ok(panel.includes(`G.${clave}`), `PanelAnalisis usa GRILLA_ANALISIS.${clave}`);
  // Todos los hooks van antes del return temprano de !listo (se llaman en cada render).
  const retorno = panel.indexOf('if (!listo) {');
  assert.ok(retorno > 0 && !/\buse[A-Z]\w*\(/.test(panel.slice(retorno)), 'ningún hook después del return temprano');
}

console.log('✓ lib/analisis.js: períodos, consulta, variación, formato, ejes, fechas, colores, enlaces y contrato.');
console.log('✓ T5B: lógica y fuente de las piezas de components/analisis.');
console.log('✓ T5C: la lógica y el fuente del panel (preferencias, foco, producto, carga, errores, textos y piezas).');
