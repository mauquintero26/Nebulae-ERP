/**
 * frontend/tests/test_kpis.mjs
 * Bloque 4, T3A (KPI-base punto 1, KPI-otros, R7, R12, C12, C13, RP27, RP70, RP75 y D26): lib/kpis.js es la dueña
 * del formato y de la variación de los indicadores (lib/analisis.js la importa). Formato de R7: montos completos
 * ('$4.927.538'), porcentaje '45,2 %', variación '+12,5 %', '−8 %', 'Nuevo' o 'Sin cambio'; un solo vocabulario de
 * tono ('bien', 'mal', 'neutro'); 'entero' es sinónimo de 'numero'; formatoEntero con la agrupación a mano de
 * formatoPesos (sin toLocaleString). CATALOGO_KPI es la única fuente de nombres, con cot_conversion, los prov_* y
 * cli_cot_abiertas, y sus íconos existen en el lucide-react instalado.
 * formatoPct de lib/dinero-ventas.js ('12,5%') NO cambia: lo prueba test_dinero_ventas.mjs (RP75).
 */

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import {
  PERIODO_KPI, TEXTO_PERIODO, FORMATOS_KPI, COLORES_KPI, estadoKpi, variacionPct, textoVariacion, direccionVariacion,
  tonoVariacion, mejorDesde, formatoEntero, formatoDecimal, formatoValorKpi, tamanoValor, clasesFranja, textoContador,
  acentoDesdeClase, CATALOGO_KPI, etiquetaKpi, ICONOS_KPI,
} from '../src/lib/kpis.js';
import { formatoPct } from '../src/lib/dinero-ventas.js';
import { PERIODOS } from '../src/lib/analisis.js';

const MENOS = '−';

console.log('--- TEST 1: período de las tarjetas ---');
{
  assert.equal(PERIODO_KPI, '30d');
  assert.deepEqual(TEXTO_PERIODO, {
    '30d': { etiqueta: '30 días', comparado: 'vs 30 días antes' },
    '7d': { etiqueta: '7 días', comparado: 'vs 7 días antes' },
    mes: { etiqueta: 'este mes', comparado: 'vs mes pasado' },
  });
  assert.ok(Object.isFrozen(TEXTO_PERIODO) && Object.isFrozen(TEXTO_PERIODO['30d']));
}

console.log('--- TEST 2: estadoKpi (C13: un solo vocabulario) ---');
{
  assert.equal(estadoKpi({ loading: true, yaCargo: false, error: null }), 'cargando');
  assert.equal(estadoKpi({ loading: true, yaCargo: true, error: null }), 'actualizando');
  assert.equal(estadoKpi({ loading: false, yaCargo: true, error: 'falló' }), 'error');
  assert.equal(estadoKpi({ loading: true, yaCargo: true, error: 'falló' }), 'actualizando', 'mientras carga no es error');
  assert.equal(estadoKpi({ loading: false, yaCargo: true, error: null }), 'listo');
  assert.equal(estadoKpi({}), 'listo');
}

console.log('--- TEST 3: variacionPct ---');
{
  assert.deepEqual(variacionPct(110, 100), { tipo: 'pct', pct: 10 });
  assert.deepEqual(variacionPct(90, 100), { tipo: 'pct', pct: -10 });
  assert.deepEqual(variacionPct(1, 3), { tipo: 'pct', pct: -66.7 });
  assert.deepEqual(variacionPct(112.5, 100), { tipo: 'pct', pct: 12.5 });
  assert.deepEqual(variacionPct(-50, -100), { tipo: 'pct', pct: 50 }, 'se divide por el valor absoluto');
  assert.deepEqual(variacionPct(100, 100), { tipo: 'pct', pct: 0 });
  assert.ok(!Object.is(variacionPct(1000, 1000.0001).pct, -0), 'sin −0');
  // r1 (punto 3): «Nuevo» lleva el signo del valor actual; la dirección sale SOLO de aquí.
  assert.deepEqual(variacionPct(5, 0), { tipo: 'nuevo', signo: 1 });
  assert.deepEqual(variacionPct(-5, 0), { tipo: 'nuevo', signo: -1 }, 'RP27: anterior 0 y actual distinto de 0');
  assert.deepEqual(variacionPct(0, 0), { tipo: 'igual' });
  assert.equal(variacionPct('x', 1), null);
  assert.equal(variacionPct(1, null), null);
  assert.equal(variacionPct(null, 1), null);
  assert.equal(variacionPct(Number.POSITIVE_INFINITY, 1), null);
  assert.deepEqual(variacionPct('110', '100'), { tipo: 'pct', pct: 10 }, 'un número en texto (Decimal del API) vale');
}

console.log('--- TEST 4: textoVariacion (R7, RP27) ---');
{
  assert.equal(textoVariacion({ tipo: 'pct', pct: 12.5 }), '+12,5 %');
  assert.equal(textoVariacion(variacionPct(110, 100)), '+10 %');
  assert.equal(textoVariacion({ tipo: 'pct', pct: -8 }), `${MENOS}8 %`, 'el menos tipográfico');
  assert.equal(textoVariacion(variacionPct(1, 3)), `${MENOS}66,7 %`);
  assert.equal(textoVariacion({ tipo: 'pct', pct: 1234.5 }), '+1.234,5 %');
  assert.equal(textoVariacion({ tipo: 'nuevo' }), 'Nuevo');
  assert.equal(textoVariacion({ tipo: 'igual' }), 'Sin cambio');
  assert.equal(textoVariacion({ tipo: 'pct', pct: 0 }), 'Sin cambio');
  assert.equal(textoVariacion(null), '—');
  assert.equal(direccionVariacion({ tipo: 'pct', pct: 3 }), 'sube');
  assert.equal(direccionVariacion({ tipo: 'pct', pct: -3 }), 'baja');
  assert.equal(direccionVariacion({ tipo: 'nuevo', signo: 1 }), 'sube');
  assert.equal(direccionVariacion({ tipo: 'nuevo', signo: -1 }), 'baja');
  // El caso unificado (el mismo de test_analisis.mjs): −5 contra 0 con mejor 'sube'.
  const nuevoNegativo = variacionPct(-5, 0);
  assert.deepEqual(
    [textoVariacion(nuevoNegativo), direccionVariacion(nuevoNegativo), tonoVariacion(nuevoNegativo, mejorDesde('sube'))],
    ['Nuevo', 'baja', 'mal'],
  );
  assert.equal(direccionVariacion({ tipo: 'igual' }), null);
  assert.equal(direccionVariacion(null), null);
}

console.log('--- TEST 5: tonoVariacion y mejorDesde (un solo vocabulario: bien, mal, neutro) ---');
{
  const sube = variacionPct(110, 100);
  const baja = variacionPct(90, 100);
  assert.equal(tonoVariacion(sube, false), 'mal', 'sube con mejorSiSube=false');
  assert.equal(tonoVariacion(sube, true), 'bien');
  assert.equal(tonoVariacion(baja, false), 'bien');
  assert.equal(tonoVariacion(baja, true), 'mal');
  assert.equal(tonoVariacion(sube, null), 'neutro', 'con null siempre neutro');
  assert.equal(tonoVariacion(variacionPct(5, 0), true), 'bien');
  assert.equal(tonoVariacion(variacionPct(-5, 0), true), 'mal');
  assert.equal(tonoVariacion({ tipo: 'igual' }, true), 'neutro');
  assert.equal(tonoVariacion(null, true), 'neutro');
  assert.equal(mejorDesde('sube'), true);
  assert.equal(mejorDesde('baja'), false);
  assert.equal(mejorDesde('neutro'), null);
  assert.equal(mejorDesde('otra'), null);
}

console.log('--- TEST 6: formatoEntero (RP75), formatoDecimal y formatoValorKpi (R7, RP27) ---');
{
  assert.equal(formatoEntero(1234), '1.234', 'agrupa también los números de 4 cifras');
  assert.equal(formatoEntero(1234567), '1.234.567');
  assert.equal(formatoEntero(0), '0');
  assert.equal(formatoEntero(-1500), '-1.500');
  assert.equal(formatoEntero(3.6), '4');
  assert.equal(formatoEntero(-0.4), '0', 'sin -0');
  assert.equal(formatoEntero(null), '—');
  assert.equal(formatoEntero('abc'), '—');
  assert.equal(formatoDecimal(3.46), '3,5');
  assert.equal(formatoDecimal(12), '12');
  assert.equal(formatoDecimal(1234.56), '1.234,6');

  assert.deepEqual(FORMATOS_KPI, ['pesos', 'numero', 'porcentaje', 'texto']);
  assert.equal(formatoValorKpi(4927538.46, 'pesos'), '$4.927.538');
  assert.equal(formatoValorKpi(-5000, 'pesos'), '-$5.000');
  assert.equal(formatoValorKpi('1062523', 'pesos'), '$1.062.523');
  assert.equal(formatoValorKpi(1452, 'numero'), '1.452');
  assert.equal(formatoValorKpi(1452, 'entero'), '1.452', "RP27: 'entero' = 'numero'");
  assert.equal(formatoValorKpi(65.04, 'porcentaje'), '65 %');
  assert.equal(formatoValorKpi(12.5, 'porcentaje'), '12,5 %');
  assert.equal(formatoValorKpi(45.24, 'porcentaje'), '45,2 %');
  assert.equal(formatoValorKpi(-3, 'porcentaje'), '-3 %');
  assert.equal(formatoValorKpi(-0.01, 'porcentaje'), '0 %');
  assert.equal(formatoValorKpi('Contado 30 días', 'texto'), 'Contado 30 días');
  assert.equal(formatoValorKpi(0, 'pesos'), '$0', 'el 0 es un número, no un vacío');
  for (const vacio of [null, undefined, '', Number.NaN]) {
    for (const formato of ['pesos', 'numero', 'porcentaje', 'texto', 'entero']) {
      assert.equal(formatoValorKpi(vacio, formato), '—', `${String(vacio)} en ${formato}`);
    }
  }
  assert.equal(formatoValorKpi('abc', 'pesos'), '—', 'nunca inventa un número');
  assert.throws(() => formatoValorKpi(1, 'moneda'), /[Ff]ormato.*moneda/);
  // formatoPct del Bloque 2 (anticipos y Resumen Financiero) sigue igual: es otro formato (RP75).
  assert.equal(formatoPct(12.5), '12,5%');
}

console.log('--- TEST 7: tamanoValor y clasesFranja ---');
{
  assert.equal(tamanoValor('$4.927.53'), 'text-2xl', '9 caracteres');
  assert.equal(tamanoValor('$4.927.538'), 'text-xl', '10 caracteres');
  assert.equal(tamanoValor('$123.456.78'), 'text-xl', '11');
  assert.equal(tamanoValor('$123.456.789'), 'text-xl', '12');
  assert.equal(tamanoValor('$1.234.567.89'), 'text-lg', '13');
  assert.equal(tamanoValor(null), 'text-2xl');
  assert.ok(clasesFranja(4).includes('@4xl:grid-cols-4'));
  assert.equal(clasesFranja(2), 'grid-cols-1 @sm:grid-cols-2');
  assert.equal(clasesFranja(3), 'grid-cols-1 @2xl:grid-cols-3');
  assert.equal(clasesFranja(5), 'grid-cols-1 @sm:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5');
  assert.ok(clasesFranja(6).endsWith('@3xl:grid-cols-3 @6xl:grid-cols-6'));
  assert.equal(clasesFranja(1), 'grid-cols-1');
  assert.equal(clasesFranja(9), clasesFranja(6));
  assert.equal(clasesFranja(0), clasesFranja(1));
}

console.log('--- TEST 8: textoContador (C13) ---');
{
  assert.equal(textoContador(5, 'cargando'), '', 'mientras carga el componente pinta la barra');
  assert.equal(textoContador(5, 'error'), '—');
  assert.equal(textoContador(5, 'listo'), '5');
  assert.equal(textoContador(1234, 'actualizando'), '1.234');
  assert.equal(textoContador(null, 'listo'), '—');
}

console.log('--- TEST 9: acentoDesdeClase (KPI-otros) ---');
{
  assert.equal(acentoDesdeClase('bg-blue-500'), 'blue');
  assert.equal(acentoDesdeClase('#123456'), 'indigo');
  assert.equal(acentoDesdeClase('bg-emerald-500'), 'emerald');
  assert.equal(acentoDesdeClase('bg-red-500'), 'red', 'la etapa «Perdido» del CRM');
  assert.equal(acentoDesdeClase('bg-slate-500'), 'slate');
  assert.equal(acentoDesdeClase('bg-cyan-500'), 'indigo', 'un color que no es de la paleta');
  assert.equal(acentoDesdeClase(' text-rose-600 '), 'rose');
  assert.equal(acentoDesdeClase(null), 'indigo');
  assert.equal(acentoDesdeClase('amber'), 'amber', 'un acento ya resuelto se queda');
  assert.deepEqual(COLORES_KPI, ['amber', 'rose', 'orange', 'indigo', 'purple', 'emerald', 'blue', 'teal', 'red', 'slate']);
}

console.log('--- TEST 10: CATALOGO_KPI, etiquetaKpi e ICONOS_KPI ---');
{
  assert.ok(Object.isFrozen(CATALOGO_KPI) && Object.isFrozen(CATALOGO_KPI.sc_activas));
  const entradas = Object.entries(CATALOGO_KPI);
  const etiquetas = entradas.map(([, k]) => k.etiqueta);
  assert.equal(new Set(etiquetas).size, etiquetas.length, 'etiquetas únicas');
  for (const [id, k] of entradas) {
    assert.match(id, /^[a-z][a-z0-9_]*$/, id);
    assert.ok(ICONOS_KPI.includes(k.icono), `${id}: ${k.icono} no está en ICONOS_KPI`);
    assert.ok(FORMATOS_KPI.includes(k.formato), `${id}: formato desconocido ${k.formato}`);
    assert.ok(COLORES_KPI.includes(k.color), `${id}: color ${k.color}`);
    assert.ok([true, false, null].includes(k.mejorSiSube), `${id}: mejorSiSube`);
    for (const sinTilde of ['Transito', 'Analisis', 'Minimo', 'Categoria', 'Campanas', 'Items', 'Ultim']) {
      assert.ok(!k.etiqueta.includes(sinTilde), `${id}: «${k.etiqueta}» sin tilde`);
    }
  }
  // R12: cot_conversion; RP70: ticket_promedio y cot_conversion con el período.
  assert.deepEqual(CATALOGO_KPI.cot_conversion, {
    etiqueta: 'Cotizaciones que terminan en pedido ({periodo})', formato: 'porcentaje', icono: 'TrendingUp', color: 'emerald',
    mejorSiSube: true,
  });
  assert.equal(CATALOGO_KPI.ticket_promedio.etiqueta, 'Ticket promedio ({periodo})');
  assert.equal(CATALOGO_KPI.pven_saldo_por_cobrar.mejorSiSube, false);
  assert.equal(CATALOGO_KPI.comprado_periodo.mejorSiSube, null, 'Comprado: su % va en gris');
  assert.equal(CATALOGO_KPI.sc_activas.mejorSiSube, true, 'por defecto, subir es mejor');
  // RP70 y D26: los del proveedor y del cliente de la Agenda.
  const nuevos = {
    prov_condiciones_pago: ['Condiciones de pago', 'texto', 'CreditCard'],
    prov_moneda: ['Moneda', 'texto', 'Coins'],
    prov_tiempo_entrega: ['Tiempo de entrega', 'texto', 'Clock'],
    prov_pedidos_compra: ['Pedidos de compra', 'numero', 'ShoppingCart'],
  };
  for (const [id, [etiqueta, formato, icono]] of Object.entries(nuevos)) {
    assert.deepEqual(CATALOGO_KPI[id], { etiqueta, formato, icono, color: 'slate', mejorSiSube: null }, `${id}: tono neutro`);
  }
  assert.equal(CATALOGO_KPI.cli_cot_abiertas.etiqueta, 'Cotizaciones abiertas');
  assert.equal(CATALOGO_KPI.cli_cot_abiertas.formato, 'numero');
  assert.notEqual(CATALOGO_KPI.cli_cot_abiertas.etiqueta, CATALOGO_KPI.cot_activas.etiqueta, 'otra regla, otro nombre');
  // Los textos del catálogo que usa el Asistente (RP70).
  assert.equal(CATALOGO_KPI.cli_total_comprado.etiqueta, 'Total comprado');
  assert.equal(CATALOGO_KPI.pven_total.etiqueta, 'Total de pedidos');
  assert.equal(CATALOGO_KPI.pven_en_curso.etiqueta, 'Pedidos en curso');

  // etiquetaKpi reemplaza '{periodo}'.
  assert.equal(etiquetaKpi('vendido_periodo'), 'Vendido (30 días)');
  assert.equal(etiquetaKpi('vendido_periodo', '7d'), 'Vendido (7 días)');
  assert.equal(etiquetaKpi('ticket_promedio', 'mes'), 'Ticket promedio (este mes)');
  assert.equal(etiquetaKpi('cot_conversion'), 'Cotizaciones que terminan en pedido (30 días)');
  assert.equal(etiquetaKpi('comprado_periodo', '90 días'), 'Comprado (90 días)', 'un texto propio de período se usa tal cual');
  // r1 (punto 4c): una clave de período de Análisis usa su texto de PERIODOS, nunca la clave cruda.
  assert.equal(etiquetaKpi('vendido_periodo', '90d'), 'Vendido (90 días)');
  assert.equal(etiquetaKpi('vendido_periodo', '12m'), 'Vendido (12 meses)');
  for (const p of PERIODOS) {
    const esperado = ['7d', '30d', 'mes'].includes(p.clave) ? null : `Vendido (${p.etiqueta})`;
    if (esperado) assert.equal(etiquetaKpi('vendido_periodo', p.clave), esperado, p.clave);
    assert.ok(!etiquetaKpi('vendido_periodo', p.clave).includes(`(${p.clave})`), `${p.clave}: no sale la clave cruda`);
  }
  assert.equal(etiquetaKpi('prov_moneda'), 'Moneda');
  assert.equal(etiquetaKpi('cli_cot_abiertas'), 'Cotizaciones abiertas');
  assert.throws(() => etiquetaKpi('no_existe'), /no_existe/);

  // ICONOS_KPI: sin repetidos, con el 'Circle' de las etapas del CRM (KPI-otros), y todos existen en el lucide-react
  // instalado (D26).
  assert.ok(Object.isFrozen(ICONOS_KPI));
  assert.equal(new Set(ICONOS_KPI).size, ICONOS_KPI.length);
  assert.ok(ICONOS_KPI.includes('Circle'));
  const lucide = createRequire(import.meta.url)('lucide-react');
  const faltan = ICONOS_KPI.filter((nombre) => !lucide[nombre]);
  assert.deepEqual(faltan, [], `íconos que no trae lucide-react: ${faltan.join(', ')}`);
}

console.log('✓ lib/kpis.js: período, estado, variación, tono, formato, tamaño, franja, contador, acento y catálogo.');
