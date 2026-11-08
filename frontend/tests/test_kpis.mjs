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
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  PERIODO_KPI, TEXTO_PERIODO, FORMATOS_KPI, COLORES_KPI, estadoKpi, variacionPct, textoVariacion, direccionVariacion,
  tonoVariacion, mejorDesde, formatoEntero, formatoDecimal, formatoValorKpi, tamanoValor, clasesFranja, textoContador,
  acentoDesdeClase, CATALOGO_KPI, etiquetaKpi, ICONOS_KPI,
  FRENTE_PERIODO, frenteDeComparado, mejorComoTexto, textoValorTarjeta, estadoContador, CARGA_INICIAL, avanzarCarga,
} from '../src/lib/kpis.js';
import { formatoPct } from '../src/lib/dinero-ventas.js';
import { PERIODOS, infoVariacion } from '../src/lib/analisis.js';
// B4 T14: las tarjetas del Hub de Compras por el espacio de nombres (su falta no tapa los demás rojos).
import * as kpisLib from '../src/lib/kpis.js';
import { conteosTraslado } from '../src/lib/estados-compras.js';

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
  // r2 (punto 1): la mitad se aleja del cero en los dos sentidos (ROUND_HALF_UP, como redondear_peso).
  assert.deepEqual(variacionPct(112.25, 100), { tipo: 'pct', pct: 12.3 });
  assert.deepEqual(variacionPct(87.75, 100), { tipo: 'pct', pct: -12.3 });
  assert.deepEqual(variacionPct(100.15, 100), { tipo: 'pct', pct: 0.2 });
  assert.deepEqual(variacionPct(99.85, 100), { tipo: 'pct', pct: -0.2 });
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

console.log('--- TEST 11 (T4A): lo que usan TarjetaKpi, Contador y useEstadoKpi ---');
{
  // textoValorTarjeta: el texto del valor, o null si es un elemento de React (la tarjeta lo pinta tal cual).
  assert.equal(textoValorTarjeta(4927538.46, 'pesos'), '$4.927.538');
  assert.equal(textoValorTarjeta(65.04, 'porcentaje'), '65 %');
  assert.equal(textoValorTarjeta(1452, 'entero'), '1.452', "'entero' es sinónimo de 'numero' (RP27)");
  assert.equal(textoValorTarjeta(1452), '1.452', 'un número sin formato va con los miles con punto');
  assert.equal(textoValorTarjeta('Contado 30 días'), 'Contado 30 días', 'un texto sin formato va tal cual');
  // StatCard (r1, punto 3): un entero va sin formato ('1.452', R7); un decimal o un texto, con 'texto' (tal cual).
  assert.equal(textoValorTarjeta(1452, undefined), '1.452', 'StatCard con un entero');
  assert.equal(textoValorTarjeta(12.5, 'texto'), '12.5', 'StatCard con un decimal: tal como lo pasa la pantalla');
  assert.equal(textoValorTarjeta('$1.062.523', 'texto'), '$1.062.523');
  assert.equal(textoValorTarjeta('...', 'texto'), '...');
  assert.equal(textoValorTarjeta(0, undefined), '0');
  const statCard = readFileSync(new URL('../src/components/ui/StatCard.tsx', import.meta.url), 'utf8');
  assert.ok(
    statCard.includes("formato={typeof value === 'number' && Number.isInteger(value) ? undefined : 'texto'}"),
    'StatCard pasa los enteros sin formato y lo demás como texto',
  );
  for (const vacio of [null, undefined]) {
    assert.equal(textoValorTarjeta(vacio, 'pesos'), '—');
    assert.equal(textoValorTarjeta(vacio), '—');
  }
  assert.equal(textoValorTarjeta({ type: 'span', props: {} }, 'pesos'), null, 'un elemento de React no se formatea');
  assert.equal(textoValorTarjeta([1, 2]), null);
  assert.equal(textoValorTarjeta(true), null);
  assert.throws(() => textoValorTarjeta(1, 'raro'), /desconocido/, 'un formato desconocido sigue siendo un error');

  // frenteDeComparado: el final del texto para lectores de pantalla de la variación (RP27 punto 6).
  assert.deepEqual(Object.keys(FRENTE_PERIODO).sort(), Object.keys(TEXTO_PERIODO).sort(), 'un texto por período de las tarjetas');
  assert.ok(Object.isFrozen(FRENTE_PERIODO));
  assert.equal(frenteDeComparado(), 'frente a los 30 días anteriores', 'por defecto, el de PERIODO_KPI');
  assert.equal(frenteDeComparado(TEXTO_PERIODO['30d'].comparado), 'frente a los 30 días anteriores');
  assert.equal(frenteDeComparado(TEXTO_PERIODO['7d'].comparado), 'frente a los 7 días anteriores');
  assert.equal(frenteDeComparado(TEXTO_PERIODO.mes.comparado), 'frente al mes pasado');
  assert.equal(frenteDeComparado('vs el trimestre'), 'frente al período anterior', 'un texto propio: el genérico');

  // mejorComoTexto: el inverso de mejorDesde (la tarjeta pasa su mejorSiSube a infoVariacion de lib/analisis.js).
  for (const m of [true, false, null]) assert.equal(mejorDesde(mejorComoTexto(m)), m, String(m));
  assert.equal(mejorComoTexto(true), 'sube');
  assert.equal(mejorComoTexto(false), 'baja');
  assert.equal(mejorComoTexto(undefined), 'neutro');

  // El texto sr-only de TarjetaKpi y su chip (RP27 puntos 1, 3 y 6), con la regla única de infoVariacion.
  const chip = (actual, anterior, mejorSiSube) =>
    infoVariacion({ valor: actual, anterior, mejor: mejorComoTexto(mejorSiSube) }, { frente: frenteDeComparado() });
  assert.deepEqual(chip(112.5, 100, true), {
    texto: '+12,5 %', tono: 'bien', flecha: 'sube', lector: 'Sube 12,5 % frente a los 30 días anteriores',
  });
  assert.deepEqual(chip(92, 100, true), { texto: `${MENOS}8 %`, tono: 'mal', flecha: 'baja', lector: 'Baja 8 % frente a los 30 días anteriores' });
  assert.equal(chip(110, 100, false).tono, 'mal', "subir en 'Saldo por cobrar' es rojo");
  assert.equal(chip(110, 100, null).tono, 'neutro', 'Comprado: en gris');
  assert.deepEqual([chip(5, 0, true).texto, chip(0, 0, true).texto], ['Nuevo', 'Sin cambio']);
  assert.equal(chip(5, null, true).texto, '—', 'sin período anterior no hay comparación');

  // estadoContador: un conteo null (o sin llegar) es «cargando», nunca 0 (TABLA-base: la pastilla gris).
  assert.equal(estadoContador(null), 'cargando');
  assert.equal(estadoContador(undefined), 'cargando');
  assert.equal(estadoContador(0), 'listo', 'el 0 es un número');
  assert.equal(estadoContador(12), 'listo');
  assert.equal(estadoContador(null, 'error'), 'error', 'el estado que se pasa manda');
  assert.equal(estadoContador(12, 'actualizando'), 'actualizando');
  assert.equal(textoContador(null, estadoContador(null)), '', 'mientras carga, Contador pinta la barra gris');

  // avanzarCarga: la marca de useEstadoKpi. «Ya cargó» solo después de una carga que de verdad pasó (loading en
  // true y luego en false): una pantalla que arranca con loading=false y carga después muestra la barra gris, no 0.
  assert.deepEqual(CARGA_INICIAL, { vioCarga: false, yaCargo: false });
  assert.ok(Object.isFrozen(CARGA_INICIAL));
  assert.equal(avanzarCarga(CARGA_INICIAL, false), CARGA_INICIAL, 'sin cambios devuelve la misma marca');
  const cargando = avanzarCarga(CARGA_INICIAL, true);
  assert.deepEqual(cargando, { vioCarga: true, yaCargo: false });
  assert.equal(avanzarCarga(cargando, true), cargando);
  const cargo = avanzarCarga(cargando, false);
  assert.deepEqual(cargo, { vioCarga: true, yaCargo: true });
  assert.equal(avanzarCarga(cargo, true), cargo);
  assert.equal(avanzarCarga(cargo, false), cargo);
  const secuencia = (cargas, error = null) => {
    let marca = CARGA_INICIAL;
    return cargas.map((loading) => {
      marca = avanzarCarga(marca, loading);
      return estadoKpi({ loading, yaCargo: marca.yaCargo, error });
    });
  };
  assert.deepEqual(secuencia([true, false, true, false]), ['cargando', 'listo', 'actualizando', 'listo']);
  assert.deepEqual(secuencia([false, true, false]), ['listo', 'cargando', 'listo'], 'arrancar en false no cuenta como carga');
  assert.deepEqual(secuencia([true, false], 'falló'), ['cargando', 'error']);

  // TarjetaKpi.tsx traduce cada nombre de ICONOS_KPI a su componente de lucide-react: ninguno falta en su mapa.
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8');
  const mapa = /const ICONOS[^=]*=\s*\{([^}]*)\}/.exec(fuente);
  assert.ok(mapa, 'TarjetaKpi.tsx tiene el mapa ICONOS');
  const nombres = mapa[1].split(',').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual([...nombres].sort(), [...ICONOS_KPI].sort(), 'el mapa de TarjetaKpi tiene exactamente los de ICONOS_KPI');

  // r1 (punto 4): el valor no se trunca nunca (se achica con tamanoValor o pasa a otra línea); la etiqueta y la ayuda
  // usan line-clamp-2 con su title.
  const lineas = fuente.split(/\r?\n/);
  assert.ok(!/\btruncate\b/.test(fuente), 'TarjetaKpi no usa truncate');
  const lineaValor = lineas.find((l) => l.includes('${tamanoValor(texto)}'));
  assert.ok(lineaValor && lineaValor.includes('break-words'), `el valor pasa a otra línea: ${lineaValor}`);
  const lineaEtiqueta = lineas.find((l) => l.includes('title={nombre}'));
  assert.ok(lineaEtiqueta && lineaEtiqueta.includes('line-clamp-2'), `la etiqueta: ${lineaEtiqueta}`);
  const lineaAyuda = lineas.find((l) => l.includes('${TONO_AYUDA[tono]}'));
  assert.ok(lineaAyuda && lineaAyuda.includes('line-clamp-2') && lineaAyuda.includes('title='), `la ayuda: ${lineaAyuda}`);
  const lineaError = lineas.find((l) => l.includes('>No se pudo cargar<'));
  assert.ok(lineaError && lineaError.includes('line-clamp-2') && lineaError.includes('title="No se pudo cargar"'), `el error: ${lineaError}`);
}

console.log('--- TEST 12 (T5C r1): TarjetaKpi con 4,5:1 y la foto «Hoy» (M6, M22 y M2) ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const lineas = fuente.split('\n');
  // El chip y las ayudas en tonos de 4,5:1 o más sobre el blanco y sobre el fondo de 'alerta' (emerald-700 5,37;
  // rose-700 6,06; slate-600 7,56), como ChipVariacion. Antes: emerald-600 3,67 y el «vs …» en slate-400 2,63.
  assert.ok(fuente.includes("const TONO_CHIP = { bien: 'text-emerald-700', mal: 'text-rose-700', neutro: 'text-slate-600' } as const;"), 'TONO_CHIP');
  assert.ok(fuente.includes("  normal: 'text-slate-500',\n  alerta: 'text-rose-700',\n  bien: 'text-emerald-700',\n"), 'TONO_AYUDA');
  const lineaVs = lineas.find((l) => l.includes('title={comparado}'));
  assert.ok(lineaVs && lineaVs.includes('text-slate-600') && !lineaVs.includes('text-slate-400'), `el «vs …»: ${lineaVs}`);
  const lineaError = lineas.find((l) => l.includes('>No se pudo cargar<'));
  assert.ok(lineaError && lineaError.includes('text-rose-700'), `el error: ${lineaError}`);
  assert.ok(!/text-(slate|gray)-(300|400)\b|text-(emerald|rose|red|green)-(400|500|600)\b/.test(fuente), 'ningún texto por debajo de 4,5:1');
  // RP27 punto 3: una foto (es_foto) dice «Hoy» con infoVariacion (y su lector), sin el «vs …» (no se compara).
  assert.ok(fuente.includes('es_foto?: boolean'), 'VariacionTarjeta acepta es_foto');
  assert.ok(fuente.includes('{ valor: variacion.actual, anterior: variacion.anterior, mejor: mejorComoTexto(mejorSiSube), es_foto: variacion.es_foto }'),
    'la tarjeta le pasa es_foto a infoVariacion');
  assert.ok(fuente.includes('{!variacion?.es_foto && ('), 'una foto no dice contra qué se compara');
  // Revisión de r1 (M4, X9 y X11): la foto sin el ícono Minus, y el lector oye el `lector` de infoVariacion.
  assert.ok(fuente.includes('variacion?.es_foto ? null : <Minus size={12} />'), 'una foto no lleva el guion');
  assert.ok(fuente.includes('<span className="sr-only">{info.lector}</span>'), 'el lector oye info.lector');
  const foto = infoVariacion({ valor: 1200000, anterior: null, mejor: mejorComoTexto(false), es_foto: true }, { frente: frenteDeComparado() });
  assert.deepEqual(foto, { texto: 'Hoy', tono: 'neutro', flecha: null, lector: 'Cifra de hoy, sin comparación' });
}

console.log('--- TEST 13 (B4 T7 r1b): el esqueleto de TarjetaKpi tiene la forma de lo cargado (CLS) ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const clases = (texto) => (texto ?? '').split(/\s+/).filter(Boolean);
  // El valor. Cargado: `block ${tamanoValor(texto)} … leading-tight … mt-0.5`. El esqueleto ocupa la misma caja: un
  // contenedor block con la letra (tamanoValor de un valor típico de su formato), leading-tight y mt-0.5, y adentro la
  // barra gris inline-block del alto del renglón (h-lh, arriba).
  const valorCargado = /cuerpoValor = \(\s*<span title=\{texto\} className=\{`([^`]*)`\}>/.exec(fuente)?.[1];
  assert.ok(valorCargado, 'el valor cargado');
  const esqueletoValor = /if \(cargando\) \{\s*([\s\S]*?)\n {2}\} else if \(texto !== null\) \{/.exec(fuente)?.[1] ?? '';
  assert.match(esqueletoValor, /const letra = tamanoValor\(MUESTRA_VALOR\[[^\]]+\] \?\? ''\);/, 'la letra del esqueleto sale de tamanoValor');
  const cajaEsqueleto = /<span aria-hidden="true" className=\{`block \$\{letra\} ([^`]*)`\}>/.exec(esqueletoValor)?.[1];
  assert.ok(cajaEsqueleto, 'el esqueleto del valor es un contenedor block con la letra');
  for (const c of ['leading-tight', 'mt-0.5']) {
    assert.ok(clases(valorCargado).includes(c) && clases(cajaEsqueleto).includes(c), `el esqueleto y el valor comparten ${c}`);
  }
  assert.ok(clases(valorCargado).includes('block') && clases(valorCargado).includes('${tamanoValor(texto)}'), 'el valor cargado: block y tamanoValor');
  assert.match(esqueletoValor, /<span className="inline-block h-lh w-24 rounded-md bg-slate-200 animate-pulse align-top" \/>/,
    'la barra gris, inline-block del alto del renglón y con el ancho de antes');
  assert.match(fuente, /const MUESTRA_VALOR: Record<string, string> = \{ pesos: '\$00\.000\.000' \};/);
  // La muestra de los pesos (millones) tiene la letra de un monto real de esa franja; sin muestra, la de siempre
  // (text-2xl con leading-tight y mt-0.5 son 32 px, lo mismo que la barra h-7 con mt-1 de antes).
  assert.equal(tamanoValor('$00.000.000'), tamanoValor('$48.123.456'));
  assert.equal(tamanoValor('$00.000.000'), 'text-xl');
  assert.equal(tamanoValor(''), 'text-2xl');
  // La línea de variación. El esqueleto es el mismo elemento (span), con el mismo display (flex), el mismo margen (mt-1)
  // y el alto de un renglón de text-xs (h-4): Chrome ya no lo cuenta como un nodo que se movió.
  const lineaCargada = /linea = \(\s*<span className=\{`([^`]*)`\}>/.exec(fuente)?.[1];
  const [, lineaEsqueleto, barraLinea] = /if \(cargando\) \{\s*(?:\/\/[^\n]*\n\s*)*linea = \(\s*<span aria-hidden="true" className="([^"]*)">\s*<span className="([^"]*)" \/>\s*<\/span>\s*\);/.exec(fuente) ?? [];
  assert.ok(lineaCargada && lineaEsqueleto, 'las dos líneas');
  for (const c of ['flex', 'mt-1', 'items-center', 'gap-1.5', 'min-w-0']) {
    assert.ok(clases(lineaCargada).includes(c) && clases(lineaEsqueleto).includes(c), `la línea: ${c} en las dos`);
  }
  assert.ok(clases(lineaEsqueleto).includes('h-4'), 'la línea del esqueleto mide un renglón de text-xs');
  // r1b (medida a 1536 px): el primer hijo también conserva su display. El de la línea cargada es el chip inline-flex
  // shrink-0; si la barra fuera block, Chrome contaría el chip como movido «0→378» al llegar los datos.
  const chipCargado = /<span aria-hidden="true" className=\{`(inline-flex items-center gap-0\.5 text-xs font-bold shrink-0) \$\{TONO_CHIP\[info\.tono\]\}`\}>/.exec(fuente)?.[1];
  assert.ok(chipCargado, 'el chip de la variación');
  for (const c of ['inline-flex', 'shrink-0']) {
    assert.ok(clases(chipCargado).includes(c) && clases(barraLinea).includes(c), `el primer hijo de la línea: ${c} en los dos`);
  }
  assert.ok(['h-3', 'w-32', 'rounded', 'bg-slate-200', 'animate-pulse'].every((c) => clases(barraLinea).includes(c)), 'la barra de la línea, la de antes');
  // Sin el esqueleto de antes.
  assert.ok(!fuente.includes('block h-7 w-24') && !fuente.includes('animate-pulse mt-2'), 'sin las barras de antes');
}

console.log('--- TEST 14 (B4 T8 r1, A1): una tarjeta pulsable y activa muestra el foco distinto de su anillo de «activa» ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const mapa = (nombre) => {
    const cuerpo = new RegExp(`const ${nombre}: Record<ColorKpi, string> = \\{([\\s\\S]*?)\\n\\};`).exec(fuente)?.[1] ?? '';
    return Object.fromEntries([...cuerpo.matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1], m[2].split(/\s+/)]));
  };
  const anillo = mapa('ANILLO');
  const foco = mapa('FOCO');
  const focoActiva = mapa('FOCO_ACTIVA');
  const colores = Object.keys(anillo);
  assert.ok(colores.length >= 10, 'los colores del anillo');
  assert.deepEqual(Object.keys(focoActiva).sort(), [...colores].sort(), 'FOCO_ACTIVA tiene un foco por cada color');
  for (const c of colores) {
    const anilloActiva = anillo[c].find((x) => /^ring-[a-z]+-\d+$/.test(x));
    // Con foco y activa: un anillo separado de la tarjeta (ring-offset-2) y de otro tono que el de «activa».
    assert.ok(focoActiva[c].includes('focus-visible:ring-offset-2'), `${c}: el foco de la activa va separado`);
    const tonoFoco = focoActiva[c].find((x) => /^focus-visible:ring-[a-z]+-\d+$/.test(x))?.replace('focus-visible:', '');
    assert.ok(tonoFoco && tonoFoco !== anilloActiva, `${c}: el foco de la activa no es el anillo ${anilloActiva}`);
    // Sin foco nada cambia: el anillo de «activa» y el foco de las demás son los de siempre.
    assert.ok(!anillo[c].some((x) => x.startsWith('focus-visible:')), `${c}: el anillo de activa no depende del foco`);
    assert.ok(foco[c].every((x) => x.startsWith('focus-visible:')) && !foco[c].includes('focus-visible:ring-offset-2'), `${c}: FOCO igual`);
    assert.ok(focoActiva[c].every((x) => x.startsWith('focus-visible:')), `${c}: FOCO_ACTIVA solo actúa con el foco`);
  }
  // El botón usa FOCO_ACTIVA solo cuando está activo.
  assert.match(fuente, /focus-visible:outline-none focus-visible:ring-2 \$\{activo \? FOCO_ACTIVA\[colorFinal\] : FOCO\[colorFinal\]\}/);
}

console.log('--- TEST 15 (B4 T8 r2, p1): activa y en alerta, un solo color de borde: el de ANILLO ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = /const ANILLO: Record<ColorKpi, string> = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? '';
  const ANILLO = Object.fromEntries([...cuerpo.matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1], m[2]]));
  const colores = Object.keys(ANILLO);
  assert.ok(colores.length >= 10, 'los colores del anillo');
  // Las clases de la tarjeta, evaluadas tal como están en el componente (el arreglo de `clases` y, si están, las
  // declaraciones de `borde` y `hover` que usa): sin depender del orden en que Tailwind emite las utilidades.
  const arreglo = /const clases = (\[[\s\S]*?\])\.join\(' '\);/.exec(fuente)?.[1];
  assert.ok(arreglo, 'el arreglo de las clases');
  const declaracion = (nombre) => new RegExp(`const ${nombre} = [^\\n]*;`).exec(fuente)?.[0] ?? `const ${nombre} = undefined;`;
  const componer = new Function('activo', 'tono', 'colorFinal', 'ANILLO',
    `${declaracion('borde')}\n${declaracion('hover')}\nreturn { clases: ${arreglo}.join(' '), hover };`);
  const esBorde = (x) => /^border-[a-z]+-\d+$/.test(x);
  for (const c of colores) {
    const anillo = ANILLO[c].split(/\s+/).filter(esBorde);
    assert.equal(anillo.length, 1, `${c}: ANILLO trae un borde`);
    for (const tono of ['normal', 'alerta', 'bien']) {
      for (const activo of [true, false]) {
        const { clases } = componer(activo, tono, c, ANILLO);
        const bordes = clases.split(/\s+/).filter(esBorde);
        assert.deepEqual(bordes, activo ? anillo : [tono === 'alerta' ? 'border-rose-200' : 'border-slate-200'],
          `${c}, ${tono}, ${activo ? 'activa' : 'no activa'}: un solo color de borde`);
        // La alerta se sigue viendo en el fondo (y en la ayuda en rosa, TONO_AYUDA), también activa.
        assert.ok(clases.split(/\s+/).includes(tono === 'alerta' ? 'bg-rose-50/40' : 'bg-white'), `${c}, ${tono}: el fondo`);
        assert.equal(clases.split(/\s+/).filter((x) => x.startsWith('ring-')).length, activo ? 2 : 0, `${c}: el anillo de activa`);
      }
    }
  }
  // Pulsable: el hover tampoco le cambia el borde a la activa (solo a las demás).
  assert.equal(componer(true, 'alerta', 'indigo', ANILLO).hover, '', 'activa: sin hover de borde');
  assert.equal(componer(false, 'alerta', 'indigo', ANILLO).hover, ' hover:border-slate-300', 'no activa: el hover de siempre');
  assert.match(fuente, /cursor-pointer transition-colors\$\{hover\} focus-visible:outline-none focus-visible:ring-2 /, 'el botón usa ese hover');
  assert.equal((fuente.match(/hover:border-slate-300/g) ?? []).length, 1, 'un solo hover de borde');
  assert.match(fuente, /alerta: 'text-rose-700',/, 'la ayuda en alerta sigue en rosa');
}

console.log('--- TEST 16 (B4 T14, KPI-compras punto 5): tarjetasHubCompras con lo de GET /compras/stats ---');
{
  const tarjetas = kpisLib.tarjetasHubCompras;
  assert.equal(typeof tarjetas, 'function', 'tarjetasHubCompras existe');
  const REGLA = 'Pedidos de compra con fecha de compra en el período, sin Borrador ni Cancelado.';
  const stats = {
    activos: 7, en_transito: 2, vencidos: 3, recibidos: 2, cumplimiento_pct: 22.2,
    flujo: { comprado_cop: { actual: 4927538, anterior: 4000000, variacion_pct: 23.2 }, pec_nuevos: { actual: 4, anterior: 3 } },
  };
  assert.deepEqual(tarjetas(stats), {
    activos: { valor: 7, ayuda: '3 con entrega vencida', tono: 'alerta' },
    en_transito: { valor: 2 },
    cumplimiento: { valor: 22.2, ayuda: '2 recibidos de 9' },
    comprado: { valor: 4927538, variacion: { actual: 4927538, anterior: 4000000 }, ayuda: REGLA },
  });
  const t0 = tarjetas({ ...stats, vencidos: 0, recibidos: 1, activos: 3 });
  assert.deepEqual(t0.activos, { valor: 3, ayuda: 'Todos en fecha', tono: 'normal' });
  assert.equal(t0.cumplimiento.ayuda, '1 recibido de 4');
  assert.equal(tarjetas({ ...stats, vencidos: 1234 }).activos.ayuda, '1.234 con entrega vencida');
  // Sin datos (todavía cargan o falló): null; un valor que no es un número no se vuelve 0.
  assert.equal(tarjetas(null), null);
  assert.equal(tarjetas('x'), null);
  // T14 r1 (m7): un número del servidor es numeroFinito (la política única): un texto numérico como '7' vale 7 (un Decimal
  // del API llega así); lo que no es un número queda en null.
  const raros = tarjetas({ activos: '7', en_transito: null, vencidos: undefined, recibidos: Number.NaN, cumplimiento_pct: 'x',
    flujo: { comprado_cop: { actual: '4927538', anterior: '' } } });
  assert.deepEqual(raros, {
    activos: { valor: 7, ayuda: null, tono: 'normal' },
    en_transito: { valor: null },
    cumplimiento: { valor: null, ayuda: null },
    comprado: { valor: 4927538, variacion: { actual: 4927538, anterior: null }, ayuda: REGLA },
  });
  assert.equal(tarjetas({ ...stats, vencidos: '2', recibidos: '1' }).activos.ayuda, '2 con entrega vencida');
  assert.equal(tarjetas({ ...stats, vencidos: '2', recibidos: '1' }).cumplimiento.ayuda, '1 recibido de 8');
  // numeroFinito, exportado (lo usan también estados-compras.js y la tarjeta del tablero).
  const numero = kpisLib.numeroFinito;
  assert.equal(typeof numero, 'function', 'numeroFinito exportado');
  for (const [v, esperado] of [[7, 7], ['7', 7], [' 35000 ', 35000], [-2.5, -2.5], ['', null], ['  ', null], ['x', null], [null, null],
    [undefined, null], [Number.NaN, null], [Infinity, null], [true, null], [{}, null]]) {
    assert.equal(numero(v), esperado, `numeroFinito(${String(v)})`);
  }
  // Sin pedidos emitidos ni recibidos, el cumplimiento no tiene base: sin ayuda (nunca «0 recibidos de 0»).
  assert.equal(tarjetas({ ...stats, activos: 0, recibidos: 0, cumplimiento_pct: null }).cumplimiento.ayuda, null);
  // El catálogo trae los nombres (CATALOGO_KPI, la única fuente) y «Comprado» es neutro (variación gris, R7).
  assert.equal(etiquetaKpi('comprado_periodo'), 'Comprado (30 días)');
  assert.equal(CATALOGO_KPI.comprado_periodo.mejorSiSube, null);
  assert.equal(CATALOGO_KPI.pec_activos.etiqueta, 'Pedidos de compra activos');
}

console.log('--- TEST 17 (B4 T15, KPI-compras punto 6): tarjetasPedidosCompra con lo de GET /compras/stats ---');
{
  const tarjetas = kpisLib.tarjetasPedidosCompra;
  assert.equal(typeof tarjetas, 'function', 'tarjetasPedidosCompra existe');
  const stats = { activos: 7, en_transito: 2, vencidos: 3, vigentes: 12, monto_cop: 4927538, recibidos: 5 };
  assert.deepEqual(tarjetas(stats), {
    activos: { valor: 7 },
    en_transito: { valor: 2 },
    vencidos: { valor: 3, tono: 'alerta' },
    monto: { valor: 4927538, ayuda: '12 pedidos vigentes' },
  });
  // Sin vencidos, la tarjeta no va en alerta; «1 pedido vigente» en singular; el punto de miles.
  assert.deepEqual(tarjetas({ ...stats, vencidos: 0 }).vencidos, { valor: 0, tono: 'normal' });
  assert.equal(tarjetas({ ...stats, vigentes: 1 }).monto.ayuda, '1 pedido vigente');
  assert.equal(tarjetas({ ...stats, vigentes: 1234 }).monto.ayuda, '1.234 pedidos vigentes');
  assert.equal(tarjetas({ ...stats, vigentes: 0 }).monto.ayuda, '0 pedidos vigentes');
  // Sin datos (todavía cargan o falló): null; lo que no es un número queda en null (Contador pinta la barra o «—»), nunca 0.
  assert.equal(tarjetas(null), null);
  assert.equal(tarjetas('x'), null);
  assert.equal(tarjetas([1, 2]), null);
  assert.deepEqual(tarjetas({ activos: '7', en_transito: null, vencidos: 'x', vigentes: undefined, monto_cop: '35000' }), {
    activos: { valor: 7 },
    en_transito: { valor: null },
    vencidos: { valor: null, tono: 'normal' },
    monto: { valor: 35000, ayuda: null },
  });
  // El monto que no llegó o no es un número queda en null («—» o la barra gris), nunca $0 (numeroFinito, la política única).
  for (const monto of [null, undefined, 'x', '', Number.NaN]) assert.equal(tarjetas({ ...stats, monto_cop: monto }).monto.valor, null, String(monto));
  // Los ids existen en el catálogo (la única fuente de nombres) y «Con entrega vencida» es mejor si baja.
  for (const id of ['pec_activos', 'pec_en_transito', 'pec_vencidos', 'pec_monto']) assert.ok(CATALOGO_KPI[id], id);
  assert.equal(CATALOGO_KPI.pec_vencidos.mejorSiSube, false);
  assert.equal(etiquetaKpi('pec_monto'), 'Monto en compras');
}

console.log('--- TEST 18 (B4 T16A, KPI-compras puntos 7 y 8): tarjetasTransito y tarjetasRecepciones con lo de GET /compras/stats ---');
{
  const transito = kpisLib.tarjetasTransito;
  assert.equal(typeof transito, 'function', 'tarjetasTransito existe');
  const stats = { activos: 9, vencidos: 3, monto_por_recibir_cop: 12500000, en_transito: 4 };
  // Tránsito: activos (con su ayuda), vencidos (en alerta), el avance promedio de la página (RP95) y el monto por recibir.
  assert.deepEqual(transito(stats, '2,5/4'), {
    activos: { valor: 9, ayuda: 'En seguimiento de entrega' },
    vencidos: { valor: 3, tono: 'alerta' },
    avance: { valor: '2,5/4', ayuda: 'Promedio de esta página' },
    monto_por_recibir: { valor: 12500000 },
  });
  assert.deepEqual(transito({ ...stats, vencidos: 0 }, null).vencidos, { valor: 0, tono: 'normal' });
  assert.equal(transito(stats, null).avance.valor, null, 'sin página todavía, la barra gris (nunca 0/-)');
  // Sin datos del servidor o con basura: null en cada número (Contador pinta la barra o «—»), nunca 0; el avance es de la página.
  for (const malo of [null, undefined, 'x', [1]]) {
    assert.deepEqual(transito(malo, '1/3'), {
      activos: { valor: null, ayuda: 'En seguimiento de entrega' }, vencidos: { valor: null, tono: 'normal' },
      avance: { valor: '1/3', ayuda: 'Promedio de esta página' }, monto_por_recibir: { valor: null },
    }, String(malo));
  }
  assert.deepEqual(transito({ activos: '5', vencidos: 'x', monto_por_recibir_cop: '35000' }, null).monto_por_recibir, { valor: 35000 });
  // Recepciones: por confirmar y confirmadas (del bloque recepciones) y los PEC en tránsito.
  const recepciones = kpisLib.tarjetasRecepciones;
  assert.equal(typeof recepciones, 'function', 'tarjetasRecepciones existe');
  assert.deepEqual(recepciones({ en_transito: 4, recepciones: { por_confirmar: 6, confirmadas: 21, canceladas: 1, total: 28 } }), {
    por_confirmar: { valor: 6 }, confirmadas: { valor: 21 }, en_transito: { valor: 4 },
  });
  assert.deepEqual(recepciones({ en_transito: 'x' }), { por_confirmar: { valor: null }, confirmadas: { valor: null }, en_transito: { valor: null } });
  assert.equal(recepciones(null), null);
  assert.equal(recepciones('x'), null);
  // La nota que reemplaza a la tarjeta «Regla de Separación» (KPI-compras punto 8).
  assert.equal(kpisLib.NOTA_RECEPCIONES, 'La recepción física suma stock; la recepción logística solo registra el evento.');
  for (const id of ['pec_activos', 'pec_vencidos', 'pec_avance', 'pec_monto_por_recibir', 'rec_por_confirmar', 'rec_confirmadas', 'pec_en_transito']) {
    assert.ok(CATALOGO_KPI[id], id);
  }
}

console.log('--- TEST 19 (B4 T16B, KPI-compras puntos 9 y 10): tarjetasLista (lista-compras/stats) y tarjetasTraslados (con_conteos) ---');
{
  const lista = kpisLib.tarjetasLista;
  assert.equal(typeof lista, 'function', 'tarjetasLista existe');
  // Lista de compras: pendientes, en pedido, recibidos y total, tal como los cuenta /compras/lista-compras/stats.
  assert.deepEqual(lista({ pendientes: 6, en_pedido: 4, recibidos: 12, total: 22 }), {
    pendientes: { valor: 6 }, en_pedido: { valor: 4 }, recibidos: { valor: 12 }, total: { valor: 22 },
  });
  assert.deepEqual(lista({ pendientes: 0, en_pedido: 0, recibidos: 0, total: 0 }).pendientes, { valor: 0 }, 'un 0 del servidor es 0');
  assert.deepEqual(lista({ pendientes: '5', en_pedido: 'x' }), {
    pendientes: { valor: 5 }, en_pedido: { valor: null }, recibidos: { valor: null }, total: { valor: null },
  }, 'lo que no es un número queda en null (barra gris o «—»), nunca 0');
  for (const malo of [null, undefined, 'x', [1]]) assert.equal(lista(malo), null, String(malo));

  // Traslados: los conteos por grupo (conteosTraslado: en proceso = DRAFT + READY), las bodegas y el total (todos).
  const tras = kpisLib.tarjetasTraslados;
  assert.equal(typeof tras, 'function', 'tarjetasTraslados existe');
  const porGrupo = conteosTraslado({ todos: 10, DRAFT: 2, READY: 3, DONE: 4, CANCELLED: 1 });
  assert.deepEqual(tras(porGrupo, 5), { en_proceso: { valor: 5 }, completados: { valor: 4 }, bodegas: { valor: 5 }, total: { valor: 10 } });
  assert.deepEqual(tras(conteosTraslado({ todos: 0, DRAFT: 0, READY: 0, DONE: 0, CANCELLED: 0 }), 0),
    { en_proceso: { valor: 0 }, completados: { valor: 0 }, bodegas: { valor: 0 }, total: { valor: 0 } }, 'un 0 del servidor es 0');
  // Sin conteos (cargando o con error) o con una clave que falta: null; las bodegas llegan por su cuenta.
  assert.deepEqual(tras(conteosTraslado(null), 3), { en_proceso: { valor: null }, completados: { valor: null }, bodegas: { valor: 3 }, total: { valor: null } });
  assert.deepEqual(tras(conteosTraslado({ todos: 7, DRAFT: 1, DONE: 2 }), null), { en_proceso: { valor: null }, completados: { valor: 2 }, bodegas: { valor: null }, total: { valor: 7 } });
  for (const malo of [null, undefined, 'x', [1], 4]) assert.equal(tras(malo, 1).en_proceso.valor, null, String(malo));
  for (const id of ['lista_pendientes', 'lista_en_pedido', 'lista_recibidos', 'lista_total', 'tras_en_proceso', 'tras_completados', 'tras_total', 'bodegas']) {
    assert.ok(CATALOGO_KPI[id], id);
  }
  assert.equal(etiquetaKpi('lista_pendientes'), 'Ítems por comprar');
  assert.equal(etiquetaKpi('tras_en_proceso'), 'Traslados en proceso');
}

console.log('--- TEST 20 (B4 T17, KPI-inventario punto 4 y TABLA-inventario punto 4): las tarjetas y las bodegas del Hub de Inventario ---');
{
  const tarjetas = kpisLib.tarjetasHubInventario;
  assert.equal(typeof tarjetas, 'function', 'tarjetasHubInventario existe');
  // `data` de GET /inventory/stats (T13: resumen_existencias + bodegas), sin parámetros: todo el inventario, por referencia.
  const stats = {
    skus_total: 6, unidades_fisicas: 26, unidades_reservadas: 4, unidades_disponibles: 22, unidades_en_transito: 4,
    valor_inventario_cop: 4927538, skus_sin_costo: 3, skus_agotados: 2, skus_bajo_minimo: 3, skus_abastecidos: 1,
    disponibilidad_pct: 84.6, bodegas: 2,
  };
  assert.deepEqual(tarjetas(stats), {
    valorizacion: { valor: 4927538, ayuda: '3 referencias sin costo' },
    skus: { valor: 6, ayuda: '26 unidades en bodega' },
    bajo_minimo: { valor: 3, ayuda: '2 agotados', tono: 'alerta' },
    disponibilidad: { valor: 84.6, ayuda: '4 comprometidas' },
  });
  // Singular, miles con punto y la ayuda de la valorización solo si hay referencias sin costo (> 0).
  const uno = tarjetas({ ...stats, skus_sin_costo: 1, unidades_fisicas: 1, skus_agotados: 1, unidades_reservadas: 1 });
  assert.equal(uno.valorizacion.ayuda, '1 referencia sin costo');
  assert.equal(uno.skus.ayuda, '1 unidad en bodega');
  assert.equal(uno.bajo_minimo.ayuda, '1 agotado');
  assert.equal(uno.disponibilidad.ayuda, '1 comprometida');
  assert.equal(tarjetas({ ...stats, unidades_fisicas: 12345, unidades_reservadas: 2.5 }).skus.ayuda, '12.345 unidades en bodega');
  assert.equal(tarjetas({ ...stats, unidades_reservadas: 2.5 }).disponibilidad.ayuda, '2,5 comprometidas', 'una cantidad con decimales no se redondea');
  assert.equal(tarjetas({ ...stats, skus_sin_costo: 0 }).valorizacion.ayuda, null, 'sin referencias sin costo, sin ayuda');
  // El tono: alerta si hay agotados O referencias bajo el mínimo; con las dos en 0, normal (y la ayuda dice 0 agotados).
  assert.deepEqual(tarjetas({ ...stats, skus_agotados: 0, skus_bajo_minimo: 0 }).bajo_minimo, { valor: 0, ayuda: '0 agotados', tono: 'normal' });
  assert.equal(tarjetas({ ...stats, skus_agotados: 1, skus_bajo_minimo: 0 }).bajo_minimo.tono, 'alerta', 'solo agotados');
  assert.equal(tarjetas({ ...stats, skus_agotados: 0, skus_bajo_minimo: 2 }).bajo_minimo.tono, 'alerta', 'solo bajo el mínimo');
  // Un Decimal del API llega como texto (numeroFinito); lo que no es un número queda en null (barra o «—»), nunca 0.
  assert.deepEqual(tarjetas({ skus_total: '6', valor_inventario_cop: null, skus_sin_costo: 'x', unidades_fisicas: undefined,
    skus_bajo_minimo: Number.NaN, skus_agotados: null, disponibilidad_pct: null, unidades_reservadas: '' }), {
    valorizacion: { valor: null, ayuda: null },
    skus: { valor: 6, ayuda: null },
    bajo_minimo: { valor: null, ayuda: null, tono: 'normal' },
    disponibilidad: { valor: null, ayuda: null },
  });
  for (const malo of [null, undefined, 'x', [1], 3]) assert.equal(tarjetas(malo), null, String(malo));
  // Los cuatro ids del catálogo (la ÚNICA fuente de nombres); «Bajo el mínimo» es la etiqueta de RP53.
  assert.equal(etiquetaKpi('inv_valorizacion'), 'Valor del inventario');
  assert.equal(etiquetaKpi('inv_skus'), 'Referencias (SKU)');
  assert.equal(etiquetaKpi('inv_bajo_minimo'), 'Bajo el mínimo');
  assert.equal(etiquetaKpi('inv_disponibilidad'), 'Disponibilidad');
  assert.equal(CATALOGO_KPI.inv_disponibilidad.formato, 'porcentaje');

  // R10: dónde se define el mínimo (reemplaza el modal «Umbral», que no guardaba nada).
  assert.equal(kpisLib.AYUDA_MINIMO_INVENTARIO,
    'Bajo el mínimo: lo disponible llegó al mínimo de la referencia. Ese mínimo es la «alerta de stock mínimo» de su publicación en E-Commerce; si no tiene, es 5.');

  // RP52 (d): la vista Almacenes agrupa por bodega las filas de GET /inventory/stock-tabla?por=bodega (hasta 200). Los
  // totales no cuentan las referencias con rastrear_inventario = false (R10).
  const almacenes = kpisLib.resumenAlmacenes;
  assert.equal(typeof almacenes, 'function', 'resumenAlmacenes existe');
  const filas = [
    { sku_id: 1, warehouse_id: 10, bodega: 'Bodega Norte', fisico: 10, valorizacion: 100, estado_stock: 'abastecido', rastrear_inventario: true },
    { sku_id: 1, warehouse_id: 20, bodega: 'Bodega Central', fisico: 3, valorizacion: 30, estado_stock: 'bajo_minimo', rastrear_inventario: true },
    { sku_id: 2, warehouse_id: 10, bodega: 'Bodega Norte', fisico: '2', valorizacion: null, estado_stock: 'bajo_minimo', rastrear_inventario: true },
    { sku_id: 3, warehouse_id: 10, bodega: 'Bodega Norte', fisico: 0, valorizacion: 0, estado_stock: 'agotado', rastrear_inventario: true },
    { sku_id: 7, warehouse_id: 10, bodega: 'Bodega Norte', fisico: 7, valorizacion: 70, estado_stock: 'abastecido', rastrear_inventario: false },
    { sku_id: 8, warehouse_id: 30, bodega: 'Ábside', fisico: 1, valorizacion: null, estado_stock: 'bajo_minimo', rastrear_inventario: true },
    { sku_id: 9, warehouse_id: null, bodega: null, fisico: 4, valorizacion: 4, estado_stock: 'bajo_minimo', rastrear_inventario: true },
  ];
  assert.deepEqual(almacenes(filas), [
    // Por nombre, en español (la tilde no la manda al final); sin costo en ninguna fila, el valor es null («—»).
    { warehouse_id: 30, bodega: 'Ábside', referencias: 1, fisico: 1, valor: null, sin_costo: 1, en_riesgo: 1 },
    { warehouse_id: 20, bodega: 'Bodega Central', referencias: 1, fisico: 3, valor: 30, sin_costo: 0, en_riesgo: 1 },
    // G (rastrear_inventario = false) no suma; un 0 de valorización es un costo (0), no «sin costo».
    { warehouse_id: 10, bodega: 'Bodega Norte', referencias: 3, fisico: 12, valor: 100, sin_costo: 1, en_riesgo: 2 },
  ], 'la fila sin bodega (por=sku) no es de ninguna');
  assert.deepEqual(almacenes([]), []);
  for (const malo of [null, undefined, 'x', 4]) assert.deepEqual(almacenes(malo), [], String(malo));
  assert.deepEqual(almacenes([null, 'x', { warehouse_id: 5, bodega: '', fisico: 'x', valorizacion: 'y', estado_stock: 'raro' }]), [
    { warehouse_id: 5, bodega: 'Sin nombre', referencias: 1, fisico: 0, valor: null, sin_costo: 1, en_riesgo: 0 },
  ], 'lo que no es una fila se salta; un número que no llega no suma');
  // Mismo nombre en dos bodegas: el orden lo desempata el id.
  assert.deepEqual(almacenes([
    { warehouse_id: 9, bodega: 'Norte', fisico: 1, valorizacion: 1, estado_stock: 'abastecido' },
    { warehouse_id: 4, bodega: 'Norte', fisico: 1, valorizacion: 1, estado_stock: 'abastecido' },
  ]).map((b) => b.warehouse_id), [4, 9]);
}

console.log('--- TEST 21 (B4 T18, KPI-inventario punto 5 y 6): las tarjetas de Stock y de Abastecimiento ---');
{
  // `data` de GET /inventory/stats (T13: resumen_existencias + bodegas). Los nombres son los de test_inventario_stats.py.
  const stats = {
    skus_total: 6, unidades_fisicas: 26, unidades_reservadas: 4, unidades_disponibles: 22, unidades_en_transito: 9,
    valor_inventario_cop: 4927538, skus_sin_costo: 3, skus_agotados: 2, skus_bajo_minimo: 3, skus_abastecidos: 1,
    disponibilidad_pct: 84.6, bodegas: 2,
  };
  const stock = kpisLib.tarjetasStock;
  assert.equal(typeof stock, 'function', 'tarjetasStock existe');
  assert.deepEqual(stock(stats), {
    fisico: { valor: 26, ayuda: 'Lo que hay físicamente en las bodegas.' },
    reservado: { valor: 4, ayuda: 'Reservas activas que no han vencido.' },
    disponible: { valor: 22, ayuda: 'Físico menos comprometido, nunca negativo.' },
    en_transito: { valor: 9, ayuda: 'Pedido al proveedor y aún sin recibir.' },
  });
  // Cada tarjeta lee SU clave (un mutante que cruce dos da otro número). Un 0 del servidor es 0; un Decimal en texto vale;
  // lo que no es un número queda en null (barra gris o «—»), nunca 0.
  assert.deepEqual(stock({ unidades_fisicas: 0, unidades_reservadas: '2,5x', unidades_disponibles: '7.5', unidades_en_transito: null }), {
    fisico: { valor: 0, ayuda: 'Lo que hay físicamente en las bodegas.' },
    reservado: { valor: null, ayuda: 'Reservas activas que no han vencido.' },
    disponible: { valor: 7.5, ayuda: 'Físico menos comprometido, nunca negativo.' },
    en_transito: { valor: null, ayuda: 'Pedido al proveedor y aún sin recibir.' },
  });
  for (const malo of [null, undefined, 'x', [1], 3]) assert.equal(stock(malo), null, String(malo));
  // Una clave que no llega queda en null (la barra o «—»), cada tarjeta por su cuenta: nunca 0.
  assert.deepEqual(['fisico', 'reservado', 'disponible', 'en_transito'].map((k) => stock({})[k].valor), [null, null, null, null]);
  assert.equal(stock({ unidades_disponibles: 0 }).disponible.valor, 0, 'un 0 del servidor es 0');
  // Los ids del catálogo (la ÚNICA fuente de nombres).
  assert.equal(etiquetaKpi('inv_fisico'), 'Unidades en bodega');
  assert.equal(etiquetaKpi('inv_reservado'), 'Unidades comprometidas');
  assert.equal(etiquetaKpi('inv_disponible'), 'Disponibles para vender');
  assert.equal(etiquetaKpi('inv_en_transito'), 'Unidades en tránsito');

  // Abastecimiento: tres tarjetas de /inventory/stats y pec_activos de /compras/stats (T12, RP94), cada una con su fuente.
  const abasto = kpisLib.tarjetasAbastecimiento;
  assert.equal(typeof abasto, 'function', 'tarjetasAbastecimiento existe');
  assert.deepEqual(abasto(stats, { pec_activos: 5, pec_total: 99, activos: 7 }), {
    agotados: { valor: 2, ayuda: 'Referencias con control de inventario sin disponible.' },
    bajo_minimo: { valor: 3, ayuda: 'Referencias con control de inventario que llegaron al mínimo.' },
    abastecidos: { valor: 1, ayuda: 'Referencias con control de inventario sobre el mínimo.' },
    pec_activos: { valor: 5, ayuda: 'Pedidos de compra en curso.' },
  }, 'pec_activos es la clave pec_activos (no pec_total ni activos)');
  // Las dos fuentes son independientes: si una falta (cargando o con error), solo SUS tarjetas quedan en null.
  assert.deepEqual(abasto(stats, null).pec_activos, { valor: null, ayuda: 'Pedidos de compra en curso.' });
  assert.equal(abasto(stats, null).agotados.valor, 2);
  assert.equal(abasto(null, { pec_activos: 5 }).pec_activos.valor, 5);
  assert.deepEqual(abasto(null, { pec_activos: 5 }).agotados, { valor: null, ayuda: 'Referencias con control de inventario sin disponible.' });
  assert.equal(abasto(null, null).bajo_minimo.valor, null);
  assert.equal(abasto(stats, { pec_activos: 0 }).pec_activos.valor, 0, 'un 0 del servidor es 0');
  assert.equal(abasto(stats, { pec_activos: 'x' }).pec_activos.valor, null);
  assert.equal(abasto({ skus_agotados: 0, skus_bajo_minimo: '4', skus_abastecidos: undefined }, {}).bajo_minimo.valor, 4);
  assert.equal(abasto({ skus_agotados: 0 }, {}).agotados.valor, 0);
  assert.equal(abasto({ skus_agotados: 0 }, {}).abastecidos.valor, null);
  for (const malo of ['x', [1], 3]) assert.equal(abasto(malo, malo).agotados.valor, null, String(malo));
  assert.equal(etiquetaKpi('inv_agotados'), 'Agotados');
  assert.equal(etiquetaKpi('inv_bajo_minimo'), 'Bajo el mínimo');
  assert.equal(etiquetaKpi('inv_abastecidos'), 'Bien abastecidos');
  assert.equal(etiquetaKpi('pec_activos'), 'Pedidos de compra activos');
}

console.log('--- TEST 22 (B4 T19; KPI-inventario punto 9, RP96): tarjetasAjustes y el total de Recepciones de Inventario ---');
{
  const aj = kpisLib.tarjetasAjustes;
  assert.equal(typeof aj, 'function', 'tarjetasAjustes existe');
  // aju_total, aju_entradas y aju_salidas son los TOTALES de tres consultas (limit=0); aju_neto = entradas − salidas, con signo.
  assert.deepEqual(aj({ todos: 12, entradas: 7, salidas: 4 }), {
    total: { valor: 12 }, entradas: { valor: 7 }, salidas: { valor: 4 },
    neto: { valor: 3, texto: '+3', ayuda: '7 entradas contra 4 salidas' },
  });
  assert.deepEqual(aj({ todos: 5, entradas: 1, salidas: 4 }).neto, { valor: -3, texto: '-3', ayuda: '1 entrada contra 4 salidas' });
  assert.deepEqual(aj({ todos: 5, entradas: 2, salidas: 2 }).neto, { valor: 0, texto: '0', ayuda: '2 entradas contra 2 salidas' });
  assert.deepEqual(aj({ todos: 1, entradas: 0, salidas: 1 }).neto, { valor: -1, texto: '-1', ayuda: '0 entradas contra 1 salida' });
  assert.equal(aj({ todos: 1100, entradas: 1100, salidas: 0 }).neto.texto, '+1.100', 'con punto de miles');
  // Sin uno de los dos totales no hay neto (null, no entradas − 0): la barra gris o «—».
  assert.deepEqual(aj({ todos: 5, entradas: 3 }).neto, { valor: null, texto: null, ayuda: null });
  assert.deepEqual(aj({ todos: 5, salidas: 3 }).neto, { valor: null, texto: null, ayuda: null });
  assert.deepEqual(aj({ todos: 5, entradas: '3', salidas: '1' }).neto.valor, 2, 'un número en texto vale');
  // Sin datos: null en todo, nunca 0.
  for (const malo of [null, undefined, 'x', 7, [1]]) {
    assert.deepEqual(aj(malo), { total: { valor: null }, entradas: { valor: null }, salidas: { valor: null }, neto: { valor: null, texto: null, ayuda: null } }, String(malo));
  }
  assert.deepEqual(aj({ todos: 'x', entradas: -1, salidas: NaN }).total, { valor: null });
  assert.equal(etiquetaKpi('aju_neto'), 'Diferencia neta');
  assert.equal(etiquetaKpi('aju_total'), 'Total de ajustes');
  // El total de Recepciones (rec_total): recepciones.total de /compras/stats, el mismo de la pestaña Todas.
  const tr = kpisLib.totalRecepciones;
  assert.equal(typeof tr, 'function', 'totalRecepciones existe');
  assert.equal(tr({ recepciones: { por_confirmar: 6, confirmadas: 21, canceladas: 1, total: 28 } }), 28);
  assert.equal(tr({ recepciones: { total: '9' } }), 9);
  assert.equal(tr({ recepciones: {} }), null);
  assert.equal(tr({}), null);
  assert.equal(tr(null), null);
  assert.equal(tr('x'), null);
  assert.equal(etiquetaKpi('rec_total'), 'Total de recepciones');
}

console.log('✓ lib/kpis.js: período, estado, variación, tono, formato, tamaño, franja, contador, acento, catálogo y lo de TarjetaKpi.');
