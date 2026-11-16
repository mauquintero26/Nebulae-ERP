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
import { existsSync, readFileSync } from 'node:fs';
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
  // B4 T24 (F26): el respaldo es un parámetro (aditivo; por defecto 'indigo'): los tableros piden 'slate'.
  assert.equal(acentoDesdeClase('bg-cyan-500', 'slate'), 'slate');
  assert.equal(acentoDesdeClase('bg-green-100', 'slate'), 'slate');
  assert.equal(acentoDesdeClase('bg-orange-100', 'slate'), 'orange');
  assert.equal(acentoDesdeClase(undefined, 'slate'), 'slate');
  // r2 (C8): y el conjunto de colores admitidos (aditivo; por defecto COLORES_KPI): el tablero pasa las claves de TONOS.
  const tonos = ['green', 'cyan', 'violet', 'sky', 'slate'];
  assert.equal(acentoDesdeClase('bg-green-100', 'slate', tonos), 'green');
  assert.equal(acentoDesdeClase('bg-cyan-500', 'slate', tonos), 'cyan');
  assert.equal(acentoDesdeClase('bg-stone-100', 'slate', tonos), 'slate', 'lo que el tablero no pinta');
  assert.equal(acentoDesdeClase('bg-cyan-500'), 'indigo', 'sin conjunto: COLORES_KPI, como siempre');
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

console.log('--- TEST 14 (B4 T8 r1, A1; B4 T24, FINAL-m25): una tarjeta pulsable y activa muestra el foco distinto de su anillo de «activa» ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/TarjetaKpi.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const ds = readFileSync(new URL('../src/lib/design-system.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = /const ANILLO: Record<ColorKpi, string> = \{([\s\S]*?)\n\};/.exec(fuente)?.[1] ?? '';
  const anillo = Object.fromEntries([...cuerpo.matchAll(/(\w+): '([^']*)'/g)].map((m) => [m[1], m[2].split(/\s+/)]));
  const focos = Object.fromEntries([.../export const FOCOS = \{([\s\S]*?)\n\} as const;/.exec(ds)[1].matchAll(/^\s+(\w+):\s+'([^']*)',$/gm)]
    .map((m) => [m[1], m[2].split(/\s+/)]));
  const colores = Object.keys(anillo);
  assert.ok(colores.length >= 10, 'los colores del anillo');
  // B4 T24 (FINAL-m25, D27): el foco es el token común FOCOS[color] (outline -700 separado 2 px), activa o no. Ya no hay mapas
  // FOCO (ring -300 de ≈2:1) ni FOCO_ACTIVA en la tarjeta.
  assert.ok(!/const FOCO(_ACTIVA)?: Record/.test(fuente), 'sin los mapas de foco propios');
  for (const c of colores) {
    assert.ok(focos[c], `${c}: FOCOS tiene el color`);
    const tonoAnillo = anillo[c].find((x) => /^ring-[a-z]+-\d+$/.test(x))?.replace('ring-', '');
    const tonoFoco = focos[c].find((x) => /^focus-visible:outline-(?!offset)[a-z]+-\d+$/.test(x))?.replace('focus-visible:outline-', '');
    // Con foco y activa: un outline separado de la tarjeta (por fuera del anillo) y de otro tono que el de «activa».
    assert.ok(focos[c].includes('focus-visible:outline-offset-2'), `${c}: el foco va separado`);
    assert.ok(tonoFoco && tonoFoco !== tonoAnillo && tonoFoco.endsWith('-700'), `${c}: el foco (${tonoFoco}) no es el anillo ${tonoAnillo}`);
    // Sin foco nada cambia: el anillo de «activa» no depende del foco, y el token solo pinta con el foco (outline-2).
    assert.ok(!anillo[c].some((x) => x.startsWith('focus-visible:')), `${c}: el anillo de activa no depende del foco`);
    assert.ok(focos[c].filter((x) => !x.startsWith('focus-visible:')).every((x) => /^outline-[a-z]+-\d+$/.test(x)), `${c}: sin foco, solo el color`);
  }
  // El botón usa el token, igual activo o no.
  assert.match(fuente, /cursor-pointer transition-colors\$\{hover\} \$\{FOCOS\[colorFinal\]\}`\}/);
  assert.match(fuente, /import \{ FOCOS \} from '@\/lib\/design-system';/);
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
  assert.match(fuente, /cursor-pointer transition-colors\$\{hover\} \$\{FOCOS\[colorFinal\]\}/, 'el botón usa ese hover (B4 T24, D27: con el foco común)');
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

console.log('--- TEST 17-f4 (B4 T24 f4, F60): las tarjetas del Hub y de Pedidos de compra cuadran con las pestañas cuando hay una búsqueda ---');
{
  const { datosTarjetasCompras, tarjetasHubCompras, tarjetasPedidosCompra } = kpisLib;
  // /compras/stats es de TODOS los PEC (sin la búsqueda); el resumen y los conteos de GET /compras/pedidos (con_resumen, con_conteos)
  // llevan la búsqueda: las cifras que abren una pestaña salen de ahí. Comprado (del período, flujo) sigue saliendo de /stats.
  const stats = { activos: 7, en_transito: 3, en_bodega: 1, vencidos: 2, recibidos: 9, cumplimiento_pct: 56, monto_cop: 9000000, vigentes: 20,
    flujo: { comprado_cop: { actual: 5000000, anterior: 4000000 } } };
  const resumen = { capital_cop: 1200000, activos: 2, en_transito: 1, en_bodega: 0, vencidos: 1, recibidos: 3, cumplimiento_pct: 60 };
  const conteos = { vigentes: 4, activos: 2, vencidos: 1 };
  const d = datosTarjetasCompras(stats, resumen, conteos);
  assert.deepEqual([d.activos, d.en_transito, d.vencidos, d.recibidos, d.cumplimiento_pct, d.monto_cop, d.vigentes], [2, 1, 1, 3, 60, 1200000, 4],
    'con la búsqueda: el resumen y los conteos de la MISMA llamada de la lista');
  assert.deepEqual(d.flujo, stats.flujo, 'Comprado (30 días) sigue con /stats');
  const hub = tarjetasHubCompras(d);
  assert.equal(hub.activos.valor, conteos.activos, '«Pedidos de compra activos» = el número de la pestaña Activos');
  assert.equal(hub.activos.ayuda, '1 con entrega vencida');
  assert.equal(hub.comprado.valor, 5000000);
  const ped = tarjetasPedidosCompra(d);
  assert.deepEqual([ped.activos.valor, ped.vencidos.valor, ped.monto.valor, ped.monto.ayuda], [2, 1, 1200000, '4 pedidos vigentes']);
  // Sin el resumen todavía (la lista no llegó) o sin /stats, no hay tarjetas (cargan o dicen «—»): nunca las de otra consulta.
  assert.equal(datosTarjetasCompras(stats, null, conteos), null);
  assert.equal(datosTarjetasCompras(null, resumen, conteos), null);
  assert.equal(datosTarjetasCompras(stats, resumen, null).vigentes, null, 'sin conteos, sin «N vigentes»');
  // El cableado: la lista pide el resumen en la MISMA llamada y las tarjetas lo usan; el estado espera al resumen.
  for (const [ruta, fn] of [['compras/page.tsx', 'tarjetasHubCompras'], ['compras/pedidos/page.tsx', 'tarjetasPedidosCompra']]) {
    const f = readFileSync(new URL(`../src/app/dashboard/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.match(f, /ruta: '\/compras\/pedidos', estado, conConteos: true, conResumen: true, esperar: !listo, despachar,/, `${ruta}: conResumen`);
    assert.ok(f.includes('const datosTarjetas = datosTarjetasCompras(stats.datos, listado.resumen, conteos);'), `${ruta}: las tarjetas con el resumen`);
    assert.ok(f.includes('const cargandoStats = stats.cargando || (datosTarjetas === null && stats.datos !== null && listado.error == null);'), `${ruta}: cargando hasta el resumen`);
    assert.ok(f.includes('const estadoKpis = useEstadoKpi(cargandoStats, stats.error ?? listado.error);'), `${ruta}: el error de cualquiera de las dos`);
    assert.ok(f.includes(`const tarjetas = ${fn}(datosTarjetas);`), `${ruta}: ${fn}`);
  }
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
    disponible: { valor: 22, ayuda: 'Por bodega: físico menos comprometido, nunca negativo; luego se suma.' }, // B4 T24 f3 (FINAL-m15, D27)
    en_transito: { valor: 9, ayuda: 'Pedido al proveedor y aún sin recibir.' },
  });
  // Cada tarjeta lee SU clave (un mutante que cruce dos da otro número). Un 0 del servidor es 0; un Decimal en texto vale;
  // lo que no es un número queda en null (barra gris o «—»), nunca 0.
  assert.deepEqual(stock({ unidades_fisicas: 0, unidades_reservadas: '2,5x', unidades_disponibles: '7.5', unidades_en_transito: null }), {
    fisico: { valor: 0, ayuda: 'Lo que hay físicamente en las bodegas.' },
    reservado: { valor: null, ayuda: 'Reservas activas que no han vencido.' },
    disponible: { valor: 7.5, ayuda: 'Por bodega: físico menos comprometido, nunca negativo; luego se suma.' }, // B4 T24 f3 (FINAL-m15, D27)
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

console.log('--- TEST 23 (B4 T19 r1, I3): una recarga conserva el último valor (actualizando), solo la primera carga va en cargando ---');
{
  const l = kpisLib.lecturaDeCarga;
  assert.equal(typeof l, 'function', 'lecturaDeCarga existe');
  // Antes de la primera respuesta: sin datos y cargando.
  assert.deepEqual(l(null, 0), { datos: null, cargando: true });
  // Llegó la vuelta 0: datos y listo.
  assert.deepEqual(l({ vuelta: 0, datos: { n: 5 }, error: null }, 0), { datos: { n: 5 }, cargando: false });
  // Se pidió la vuelta 1 (Actualizar, despachar, crear): se CONSERVA el último valor mientras llega (nunca null -> «—»).
  assert.deepEqual(l({ vuelta: 0, datos: { n: 5 }, error: null }, 1), { datos: { n: 5 }, cargando: true });
  // Un error de la última vuelta no deja datos viejos (la tarjeta dice «—» y Reintentar).
  assert.deepEqual(l({ vuelta: 1, datos: null, error: new Error('x') }, 1), { datos: null, cargando: false });
  // Recargando tras un error: sin datos que conservar.
  assert.deepEqual(l({ vuelta: 1, datos: null, error: new Error('x') }, 2), { datos: null, cargando: true });
  // Con el estado de la tarjeta: la recarga es 'actualizando', la primera 'cargando'.
  assert.equal(kpisLib.estadoKpi({ loading: true, yaCargo: true }), 'actualizando');
  assert.equal(kpisLib.estadoKpi({ loading: true, yaCargo: false }), 'cargando');
}

console.log('--- TEST 24 (B4 T22, KPI-otros punto 1; R7, R12, RP104 a y b): las tarjetas del Dashboard General ---');
{
  for (const n of ['PERIODOS_DASHBOARD', 'periodoDashboard', 'tarjetasVitalesDashboard', 'tarjetasInventarioDashboard', 'radarOperativo']) {
    assert.ok(n in kpisLib, `lib/kpis.js exporta ${n}`);
  }
  // El selector: Semana ('7d'), 30 días ('30d') y Mes ('mes'); sin «Hoy»; cada clave tiene su texto «vs …» en TEXTO_PERIODO.
  assert.deepEqual(kpisLib.PERIODOS_DASHBOARD.map((p) => [p.clave, p.etiqueta]), [['7d', 'Semana'], ['30d', '30 días'], ['mes', 'Mes']]);
  assert.ok(Object.isFrozen(kpisLib.PERIODOS_DASHBOARD) && kpisLib.PERIODOS_DASHBOARD.every((p) => Object.isFrozen(p)));
  for (const p of kpisLib.PERIODOS_DASHBOARD) assert.ok(p.clave in TEXTO_PERIODO, `${p.clave} tiene su texto de comparación`);
  // El período por defecto es PERIODO_KPI; lo que el Dashboard no ofrece (hoy, 90d, basura) vuelve a él.
  assert.deepEqual(['7d', '30d', 'mes'].map(kpisLib.periodoDashboard), ['7d', '30d', 'mes']);
  for (const malo of ['Hoy', 'hoy', '90d', '12m', '', null, undefined, 7, {}]) assert.equal(kpisLib.periodoDashboard(malo), PERIODO_KPI, String(malo));

  // Los cuatro vitales: vendido y ticket del bloque `flujo` de /ventas/stats (con su anterior para la variación), el saldo de
  // kpis.pven_saldo_por_cobrar y los clientes. NUNCA pven_monto_vendido / pven_con_dinero (RP104 a).
  const ventas = {
    kpis: { pven_saldo_por_cobrar: 1250000, pven_monto_vendido: 999, pven_con_dinero: 3, pven_pendiente_compra: 3 },
    flujo: {
      vendido_cop: { actual: 9000000, anterior: 8000000, variacion_pct: 12.5 },
      ticket_promedio_cop: { actual: 450000, anterior: null, variacion_pct: null },
    },
  };
  const v = kpisLib.tarjetasVitalesDashboard(ventas, 321);
  assert.deepEqual(v.vendido, { valor: 9000000, variacion: { actual: 9000000, anterior: 8000000 } });
  assert.deepEqual(v.ticket, { valor: 450000, variacion: { actual: 450000, anterior: null } });
  assert.deepEqual(v.saldo, { valor: 1250000 });
  assert.deepEqual(v.clientes, { valor: 321 });
  // Un número en texto (Numeric) vale; un cero REAL se queda en 0 (no es «sin dato»).
  const ceros = kpisLib.tarjetasVitalesDashboard({ kpis: { pven_saldo_por_cobrar: '0' }, flujo: { vendido_cop: { actual: 0, anterior: 0 }, ticket_promedio_cop: { actual: 0, anterior: 0 } } }, 0);
  assert.deepEqual([ceros.vendido.valor, ceros.ticket.valor, ceros.saldo.valor, ceros.clientes.valor], [0, 0, 0, 0]);
  // Cada fuente falla sola: sin /ventas/stats, el dinero queda en null («—» o la barra, nunca 0) y los clientes siguen; y al revés.
  for (const sinVentas of [null, undefined, {}, [], 'x']) {
    const s = kpisLib.tarjetasVitalesDashboard(sinVentas, 5);
    assert.deepEqual([s.vendido.valor, s.ticket.valor, s.saldo.valor, s.clientes.valor], [null, null, null, 5], String(sinVentas));
    assert.deepEqual(s.vendido.variacion, { actual: null, anterior: null });
  }
  const sinClientes = kpisLib.tarjetasVitalesDashboard(ventas, null);
  assert.equal(sinClientes.clientes.valor, null);
  assert.equal(sinClientes.vendido.valor, 9000000);

  // La fila del inventario: las unidades de /inventory/stats tal cual (sin existencias inventadas: lo que falta es null, nunca
  // un 0 ni un físico − comprometido calculado) y «N pedidos de compra activos» de /compras/stats (pec_activos).
  const inv = { unidades_fisicas: 1200, unidades_reservadas: 200, unidades_disponibles: 1000, unidades_en_transito: 340 };
  const i = kpisLib.tarjetasInventarioDashboard(inv, { pec_activos: 7 });
  assert.deepEqual(i.fisico, { valor: 1200 });
  assert.deepEqual(i.reservado, { valor: 200 });
  assert.deepEqual(i.disponible, { valor: 1000 });
  assert.deepEqual(i.en_transito, { valor: 340, ayuda: '7 pedidos de compra activos' });
  assert.equal(kpisLib.tarjetasInventarioDashboard(inv, { pec_activos: 1 }).en_transito.ayuda, '1 pedido de compra activo');
  assert.equal(kpisLib.tarjetasInventarioDashboard(inv, { pec_activos: 0 }).en_transito.ayuda, '0 pedidos de compra activos');
  assert.equal(kpisLib.tarjetasInventarioDashboard(inv, null).en_transito.ayuda, null, 'sin /compras/stats, sin ayuda (y el número sigue)');
  assert.equal(kpisLib.tarjetasInventarioDashboard(inv, null).en_transito.valor, 340);
  assert.equal(kpisLib.tarjetasInventarioDashboard(inv, { pec_activos: 'x' }).en_transito.ayuda, null);
  for (const sinInv of [null, undefined, {}, []]) {
    const s = kpisLib.tarjetasInventarioDashboard(sinInv, { pec_activos: 7 });
    assert.deepEqual([s.fisico.valor, s.reservado.valor, s.disponible.valor, s.en_transito.valor], [null, null, null, null], String(sinInv));
  }
  const parcial = kpisLib.tarjetasInventarioDashboard({ unidades_fisicas: 50, unidades_reservadas: 10 }, null);
  assert.equal(parcial.disponible.valor, null, 'el disponible no se calcula: es el del servidor');

  // El radar: pedidos pendientes de compra de /ventas/stats (el mismo número de la pestaña del Hub). Sin dato, ni alerta ni «todo bien».
  assert.deepEqual(kpisLib.radarOperativo(ventas), { tipo: 'alerta', n: 3 });
  assert.deepEqual(kpisLib.radarOperativo({ kpis: { pven_pendiente_compra: 0 } }), { tipo: 'ok' });
  for (const sin of [null, undefined, {}, { kpis: {} }, { kpis: { pven_pendiente_compra: null } }, { kpis: { pven_pendiente_compra: 'x' } }]) {
    assert.equal(kpisLib.radarOperativo(sin), null, JSON.stringify(sin));
  }
}

console.log('--- TEST 25 (B4 T22, KPI-otros punto 1 y FLUJO-ventas-pantallas E; R7, R12, RP104): el cableado del Dashboard General ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // Las tarjetas leen los mismos endpoints que los Hubs, con el período elegido en ventas y compras.
  assert.ok(fuente.includes('useFuente<DatosEndpoint>(`/ventas/stats?periodo=${periodo}`, periodo)'));
  assert.ok(fuente.includes('useFuente<DatosEndpoint>(`/compras/stats?periodo=${periodo}`, periodo)'));
  assert.ok(fuente.includes("useFuente<DatosEndpoint>('/inventory/stats')"));
  assert.ok(fuente.includes("useFuente<unknown[]>('/crm/customers')"), 'se conserva /crm/customers para contar clientes');
  // Sin los números de antes: ni la lista de 50 pedidos para el dinero, ni las existencias inventadas, ni el resumen de stock.
  assert.doesNotMatch(fuente, /cifrasVentasDashboard|stock-summary|stock_vendible_fisico|Math\.max\(0, fisico|salesList\.length \* 4|toLocaleString\(\)/);
  assert.doesNotMatch(fuente, /metrics\.|setMetrics|ESPERANDO_MERCANCIA|'COTIZADA'/);
  // El dinero sale de lib/kpis.js (vendido y ticket del bloque flujo), no de una cuenta propia.
  assert.ok(fuente.includes('tarjetasVitalesDashboard(ventas.datos, Array.isArray(clientes.datos) ? clientes.datos.length : null)'));
  assert.ok(fuente.includes('tarjetasInventarioDashboard(inventario.datos, compras.datos)'));
  assert.ok(fuente.includes('radarOperativo(ventas.datos)'));
  // El selector: Semana, 30 días y Mes de PERIODOS_DASHBOARD; sin «Hoy» ni un timeRange que no hacía nada.
  assert.ok(fuente.includes('PERIODOS_DASHBOARD.map((p) => ('));
  assert.ok(fuente.includes('aria-pressed={periodo === p.clave}'));
  assert.doesNotMatch(fuente, /'Hoy'|timeRange|setTimeRange/);
  // El rótulo y el «vs …» de las tarjetas de dinero siguen al período (cambia el % al pasar de Semana a Mes).
  assert.ok(fuente.includes("etiqueta={etiquetaKpi('vendido_periodo', periodoDatos)} textoPeriodo={textoPeriodo}"));
  assert.ok(fuente.includes("etiqueta={etiquetaKpi('ticket_promedio', periodoDatos)} textoPeriodo={textoPeriodo}"));
  assert.ok(fuente.includes('const periodoDatos = periodoVisto(ventas.marca, periodo);'), 'el rótulo sale del período de los datos que se ven (m3)');
  assert.ok(fuente.includes('const textoPeriodo = TEXTO_PERIODO[periodoDatos].comparado;'));
  // R12: ninguna tarjeta del Dashboard es pulsable (ningún número equivale a una vista del Hub): sin onClick ni anillo.
  for (const bloque of fuente.match(/<TarjetaKpi\b[\s\S]*?\/>/g) ?? []) assert.doesNotMatch(bloque, /onClick|activo=/, bloque.slice(0, 40));
  assert.equal((fuente.match(/<TarjetaKpi\b/g) ?? []).length, 8, 'cuatro de inventario y cuatro vitales');
  assert.equal((fuente.match(/<FranjaKpis\b/g) ?? []).length, 2);
  assert.ok(fuente.includes('<TarjetaKpi kpi="clientes_total" estado={estadoClientes}'), 'los clientes tienen su propio estado');
  // Mientras recargan: lecturaDeCarga conserva lo último (actualizando) y NO se vacía antes de pedir; un error no deja datos viejos.
  assert.ok(fuente.includes('...lecturaDeFuente(llego, clave)'));
  assert.ok(fuente.includes('datos: datosDeRespuesta(r) as T'), 'una respuesta sin data es un error (I1 M3)');
  assert.doesNotMatch(fuente, /setLlego\(null\)/);
  assert.ok(fuente.includes('setLlego({ vuelta: clave, datos: null, error: err, marca })'));
  assert.ok(fuente.includes('useEstadoKpi(ventas.cargando, ventas.error)') && fuente.includes('useEstadoKpi(inventario.cargando, inventario.error)'));
  // Cada fuente que falla lo dice con «Reintentar» (nunca 0 ni un vacío falso).
  // B4 T24 (F46, D27): con la pieza común (AvisoDeError: avisoDeFuente y AvisoFuente; un 403 sin «Reintentar»).
  for (const f of ['inventario', 'compras', 'ventas', 'clientes']) {
    assert.match(fuente, new RegExp(`<AvisoDeError error=\\{${f}\\.error\\} fallo="[^"]+" onReintentar=\\{${f}\\.recargar\\} acento="indigo" />`), `aviso de ${f}`);
  }
  // El embudo: PasosFlujo vertical con /ventas/flujo y los enlaces al Hub; su error con «Reintentar».
  assert.ok(fuente.includes("useResumenFlujo('/ventas/flujo', 0)"));
  assert.ok(fuente.includes('<PasosFlujo variante="banner" orientacion="vertical"'));
  assert.ok(fuente.includes('pasosEmbudoDashboard(flujo.datos)'));
  assert.ok(fuente.includes('estadoConteos={franjaEmbudo.estadoConteos}'));
  assert.match(fuente, /avisoEmbudo\.visible && \([\s\S]{0,500}onClick=\{\(\) => \{ if \(avisoEmbudo\.puedeReintentar\) flujo\.recargar\(\); \}\}/);
  assert.ok(fuente.includes('avisoEmbudoDashboard({ cargando: flujo.cargando, error: flujo.error, huboError: huboErrorEmbudo })'));
  assert.ok(fuente.includes('{avisoEmbudo.texto}') && fuente.includes('{avisoEmbudo.boton}'));
  // Los «Ver todos»: el embudo al Hub de Ventas, las Recientes de ventas a la lista de Pedidos y las de compras como estaban.
  assert.ok(fuente.includes('<Link href="/dashboard/ventas" className="text-xs font-bold text-purple-700'));
  assert.ok(fuente.includes('<Link href="/dashboard/ventas/venta" className="text-xs font-bold text-indigo-600'));
  assert.ok(fuente.includes('<Link href="/dashboard/compras/pedidos" className="text-xs font-bold text-teal-600'));
  assert.doesNotMatch(fuente, /\/dashboard\/ventas\/pedidos/, 'esa ruta no existe');
  // m1, m8 y m19: el radar dice lo que cuenta y lleva a la pestaña que tiene su número.
  assert.ok(fuente.includes('{textoRadar(radar.n)}') && fuente.includes('<Link href={RUTA_RADAR}'));
  assert.doesNotMatch(fuente, /a la espera de la mercancía|Ver Tránsito Compras/);
  // m6: el aviso de una fuente caída sale de textoAvisoFuente (un solo punto).
  // I1 (M1, M4b, M10, m6): el aviso se pinta SOLO con error, la fuente devuelve el error de la lectura y el embudo lo muestra.
  // B4 T24 (F46, D27): AvisoDeError se pinta solo con error y su texto es textoAvisoFuente (vía avisoDeFuente; test_avisos.mjs).
  assert.ok(!/function AvisoFuente\b/.test(fuente), 'sin la copia local');
  assert.ok(fuente.includes('return { ...lecturaDeFuente(llego, clave), recargar };'), 'useFuente devuelve el error de la lectura');
  assert.ok(fuente.includes('{avisoEmbudo.visible && ('));
  assert.ok(fuente.includes('fallo="No se pudieron contar los clientes"'), 'F46 (D27): la prop de AvisoDeError');
  // m10: las «Recientes» dicen la etiqueta del estado, no el código.
  assert.ok(fuente.includes('{infoEstadoPec(pec.estado).label}') && fuente.includes('{infoEstadoPedido(ven.estado).label}'));
  assert.doesNotMatch(fuente, /\{(pec|ven)\.estado\}/);
  // Lo que no se toca: el Copilot y lo que piden las «Recientes» (que sí dicen la etiqueta del estado: m10). (B4 T24 f4, F103 (c).)
  assert.ok(fuente.includes("apiFetch('/chat/copilot/query'"));
  assert.ok(fuente.includes("apiFetch('/ventas/pedidos')") && fuente.includes("apiFetch('/compras/pedidos')"));
  assert.ok(fuente.includes('recientes.pecsActivos.map(') && fuente.includes('recientes.pedidosRecientes.map('));
  // Sin diálogos nativos (R14, C20).
  assert.doesNotMatch(fuente, /\b(alert|confirm|prompt)\s*\(/);
  // Medidas del banco (R26, R23): la raíz no se encoge dentro del <main> flex (shrink-0: su relleno de abajo es el que deja libre la
  // esquina del botón de la IA, 96 px) y Actualizar con el selector bajan de renglón en lugar de correr la página a 768 px.
  assert.ok(fuente.includes('className="w-full shrink-0 bg-slate-50 min-h-screen pb-24 '), 'la raíz: shrink-0 y pb-24');
  assert.ok(fuente.includes('<div className="flex flex-wrap items-center gap-3">\n            <button\n              onClick={loadDashboardData}'), 'el encabezado envuelve');
}

console.log('--- TEST 26 (B4 T22 r1; I1, m3, m6, m11, m13): las rutas de error y de período del Dashboard, en funciones puras ---');
{
  for (const n of ['datosDeRespuesta', 'lecturaDeFuente', 'periodoVisto', 'textoAvisoFuente', 'textoRadar', 'RUTA_RADAR']) {
    assert.ok(n in kpisLib, `lib/kpis.js exporta ${n}`);
  }
  // I1 (M3): una respuesta sin `data` (o con algo que no es un objeto) es un ERROR, no un «listo» vacío.
  assert.deepEqual(kpisLib.datosDeRespuesta({ status: 'success', data: { a: 1 } }), { a: 1 });
  // /crm/customers manda una LISTA en data: es válida (los clientes se cuentan); solo null, texto o número no.
  assert.deepEqual(kpisLib.datosDeRespuesta({ data: [1, 2] }), [1, 2]);
  assert.deepEqual(kpisLib.datosDeRespuesta({ data: [] }), []);
  for (const mala of [null, undefined, {}, { data: null }, { data: 'x' }, { data: 7 }, 'x', []]) {
    assert.throws(() => kpisLib.datosDeRespuesta(mala), /El servidor no devolvió datos\./, JSON.stringify(mala));
  }
  // I1 (M4): el error de la vuelta vigente se ve; el de una vuelta vieja no; y un error no deja datos viejos.
  const falla = new Error('Error del servidor');
  assert.deepEqual(kpisLib.lecturaDeFuente(null, 'a'), { datos: null, cargando: true, error: null, marca: null });
  assert.deepEqual(kpisLib.lecturaDeFuente({ vuelta: 'a', datos: { n: 1 }, error: null, marca: '30d' }, 'a'), { datos: { n: 1 }, cargando: false, error: null, marca: '30d' });
  // B4 T24 f4 (F7; D27): sin datos no hay marca (antes '30d'): el rótulo es el del período elegido, no el de una carga que falló.
  assert.deepEqual(kpisLib.lecturaDeFuente({ vuelta: 'a', datos: null, error: falla, marca: '30d' }, 'a'), { datos: null, cargando: false, error: falla, marca: null });
  const reintento = kpisLib.lecturaDeFuente({ vuelta: 'a', datos: null, error: falla, marca: '30d' }, 'b');
  assert.equal(reintento.error, null, 'mientras se reintenta, el error anterior no se muestra');
  assert.equal(reintento.cargando, true);
  // m3 y m11: al pedir otro período se CONSERVA lo último con SU marca (cargando = actualizando).
  const conservado = kpisLib.lecturaDeFuente({ vuelta: 'a', datos: { n: 1 }, error: null, marca: '30d' }, 'b');
  assert.deepEqual(conservado, { datos: { n: 1 }, cargando: true, error: null, marca: '30d' });

  // m3 y m11: el rótulo y el «vs …» salen del período de los datos que se ven; sin datos todavía, del elegido.
  assert.equal(kpisLib.periodoVisto('30d', '7d'), '30d', 'el número viejo sigue con su rótulo');
  assert.equal(kpisLib.periodoVisto('mes', '7d'), 'mes');
  assert.equal(kpisLib.periodoVisto(null, '7d'), '7d');
  assert.equal(kpisLib.periodoVisto(undefined, 'mes'), 'mes');
  assert.equal(kpisLib.etiquetaKpi('vendido_periodo', kpisLib.periodoVisto('30d', '7d')), 'Vendido (30 días)');
  assert.equal(TEXTO_PERIODO[kpisLib.periodoVisto('30d', 'mes')].comparado, 'vs 30 días antes');

  // m6: el aviso de una fuente caída no agrega un segundo punto.
  assert.equal(kpisLib.textoAvisoFuente(null, 'No se pudieron cargar las existencias'), null);
  assert.equal(kpisLib.textoAvisoFuente(undefined, 'x'), null);
  assert.equal(kpisLib.textoAvisoFuente(new Error('Error del servidor'), 'No se pudieron cargar las existencias'), 'No se pudieron cargar las existencias: Error del servidor.');
  assert.equal(kpisLib.textoAvisoFuente(new Error('Intenta de nuevo.'), 'No se pudieron cargar las existencias'), 'No se pudieron cargar las existencias: Intenta de nuevo.');
  assert.doesNotMatch(kpisLib.textoAvisoFuente(new Error('El servidor no devolvió datos.'), 'No se pudo contar'), /\.\./);

  // m1, m8 y m19: el radar dice lo que su número cuenta (la pestaña «Pend. Compra» de Pedidos de venta) y lleva a ella.
  assert.equal(kpisLib.textoRadar(7), 'Hay 7 pedidos de venta en «Pend. Compra».');
  assert.equal(kpisLib.textoRadar(1), 'Hay 1 pedido de venta en «Pend. Compra».');
  assert.equal(kpisLib.textoRadar(1200), 'Hay 1.200 pedidos de venta en «Pend. Compra».');
  assert.equal(kpisLib.RUTA_RADAR, '/dashboard/ventas/venta?tab=pend_compra');
  assert.doesNotMatch(kpisLib.textoRadar(3), /mercanc/i);

  // m13: la fila de inventario sale de tarjetasStock (la misma lectura de /inventory/stats que Stock), sin volver a leer los campos.
  const fuente = readFileSync(new URL('../src/lib/kpis.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const cuerpo = fuente.slice(fuente.indexOf('export function tarjetasInventarioDashboard'), fuente.indexOf('export function radarOperativo'));
  assert.ok(cuerpo.includes('tarjetasStock(datosInventario)'));
  assert.doesNotMatch(cuerpo, /unidades_(fisicas|reservadas|disponibles|en_transito)/);
  assert.doesNotMatch(fuente, /const objetoPlano = /, 'un solo predicado de objeto (datosDe)');
}

console.log('--- TEST 26-f4 (B4 T24 f4: F7, F102 y F103): la marca solo con datos; las anclas del Dashboard y de Gastos; los comentarios ---');
{
  const falla = new Error('Error del servidor');
  // F7: /ventas/stats falló para 30 días y se elige Semana: la tarjeta dice «Vendido (7 días)», no «(30 días)» sobre la carga de 7.
  const fallo30 = kpisLib.lecturaDeFuente({ vuelta: '30d:1', datos: null, error: falla, marca: '30d' }, '7d:1');
  assert.equal(fallo30.marca, null, 'reintentando con otro período, sin datos: sin marca');
  assert.equal(kpisLib.periodoVisto(fallo30.marca, '7d'), '7d');
  assert.equal(kpisLib.etiquetaKpi('vendido_periodo', kpisLib.periodoVisto(fallo30.marca, '7d')), 'Vendido (7 días)');
  // Con datos, la marca de los datos que se ven (m3 y m11 siguen).
  assert.equal(kpisLib.lecturaDeFuente({ vuelta: 'a', datos: { n: 1 }, error: null, marca: '30d' }, 'b').marca, '30d');
  // lecturaLeadsCampana sigue sabiendo de QUÉ campaña es un error (la marca cruda de lo que llegó, no la de la lectura).
  const errCampana = kpisLib.lecturaLeadsCampana({ vuelta: '5:0', marca: '5', datos: null, error: falla }, '5:0', '5', true);
  assert.deepEqual([errCampana.error, errCampana.estado, errCampana.cargando], [falla, 'error', false], 'el error de la campaña elegida se ve');
  const otra = kpisLib.lecturaLeadsCampana({ vuelta: '4:0', marca: '4', datos: null, error: falla }, '5:0', '5', true);
  assert.deepEqual([otra.error, otra.estado], [null, 'cargando'], 'el de otra campaña no');

  const dash = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  // F102 W3: el then de useFuente guarda la marca con los datos.
  assert.ok(dash.includes('.then((r: unknown) => setLlego({ vuelta: clave, datos: datosDeRespuesta(r) as T, error: null, marca }))'));
  // F102 W2: el «Reintentar» del radar, en la rama de ventas.error, llama a ventas.recargar.
  assert.match(dash, /\{ventas\.error \? \(\s*<button type="button" onClick=\{ventas\.recargar\}\s+className=\{`ml-2 rounded font-bold underline hover:text-white \$\{FOCOS\.blanco\}`\}>\s*Reintentar\s*<\/button>\s*\) : null\}/);
  // F102 W1b/W1c (con F46: la pieza común): el botón completo, type=button, con onReintentar y el texto «Reintentar» dentro.
  const aviso = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(aviso, /\{aviso\.reintentar && \(\s*<button ref=\{refBoton\} type="button" onClick=\{reintentando \? undefined : onReintentar\}[^>]*>\s*\{reintentando \? 'Reintentando…' : 'Reintentar'\}\s*<\/button>\s*\)\}/);
  // F103 (a): el comentario del radar nombra la pestaña de donde sale el número.
  assert.ok(!dash.includes('el mismo número de la pestaña del Hub de Ventas'), 'F103 (a): sin el comentario viejo');
  assert.ok(dash.includes('la pestaña «Pend. Compra» de Pedidos de venta'), 'F103 (a)');
  // F103 (c): el comentario de TEST 25 (arriba) ya no dice que «Recientes» no se toca.
  const esta = readFileSync(new URL(import.meta.url), 'utf8');
  assert.ok(!esta.includes(['// Lo que no se toca: el Copilot', 'y las listas «Recientes».'].join(' ')), 'F103 (c)');
  // F103 (d): el comentario de los conteos de Gastos menciona el tipo.
  const gastos = readFileSync(new URL('../src/app/dashboard/finanzas/gastos/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(gastos.includes('// Los conteos por categoría ({categoría: n}, con la búsqueda y el tipo, sin la categoría)'), 'F103 (d)');
  // F102 W4 y W5 van en TEST 50 de test_tabla.mjs; F103 (b), en el comentario de TEST 49 de test_tabla.mjs.
}

console.log('--- TEST 27 (B4 T23A, KPI-otros punto 5; R7, R12, RP102): las tarjetas de la tienda y su comparación ---');
{
  // GET /ecommerce/stats (T20), `data`: revenue_today, revenue_ayer, web_orders_today, web_orders_ayer, revenue_month,
  // revenue_mes_anterior, web_orders_month, web_orders_mes_anterior, carritos_abandonados_count, carritos_abandonados_valor,
  // productos_publicados. Hoy contra ayer y el mes contra el mismo tramo del mes pasado (en hora de Colombia, del servidor).
  const stats = {
    revenue_today: 1200000, revenue_ayer: 1000000, web_orders_today: 3, web_orders_ayer: 2,
    revenue_month: 8500000, revenue_mes_anterior: 10000000, web_orders_month: 21, web_orders_mes_anterior: 25,
    carritos_abandonados_count: 4, carritos_abandonados_valor: 640000, productos_publicados: 58,
  };
  const t = kpisLib.tarjetasTienda(stats);
  assert.deepEqual(t.web_ventas_hoy, {
    valor: 1200000, variacion: { actual: 1200000, anterior: 1000000 }, textoPeriodo: 'vs ayer', ayuda: '3 pedidos web',
  });
  assert.deepEqual(t.web_ventas_mes, {
    valor: 8500000, variacion: { actual: 8500000, anterior: 10000000 }, textoPeriodo: 'vs mes pasado', ayuda: '21 pedidos PWEB',
  });
  assert.deepEqual(t.carritos_abandonados, { valor: 4, tono: 'alerta', ayuda: '$640.000 sin cerrar' });
  assert.deepEqual(t.productos_publicados, { valor: 58 });
  assert.equal(kpisLib.TEXTO_COMPARACION_TIENDA.hoy, 'vs ayer');
  assert.equal(kpisLib.TEXTO_COMPARACION_TIENDA.mes, TEXTO_PERIODO.mes.comparado, '«vs mes pasado» es el de la clave mes');
  assert.ok(Object.isFrozen(kpisLib.TEXTO_COMPARACION_TIENDA));
  // El % lo calcula la tarjeta con variacionPct (la regla única): +20 % hoy y −15 % el mes.
  assert.equal(textoVariacion(variacionPct(t.web_ventas_hoy.variacion.actual, t.web_ventas_hoy.variacion.anterior)), '+20 %');
  assert.equal(textoVariacion(variacionPct(t.web_ventas_mes.variacion.actual, t.web_ventas_mes.variacion.anterior)), `${MENOS}15 %`);
  // Los carritos solo alertan si hay alguno (> 0); con 0 no hay alerta y la ayuda dice 0.
  assert.deepEqual(kpisLib.tarjetasTienda({ ...stats, carritos_abandonados_count: 0, carritos_abandonados_valor: 0 }).carritos_abandonados, { valor: 0, tono: 'normal', ayuda: '$0 sin cerrar' });
  // r1 (m1): la ayuda es el DINERO sin cerrar (la tarjeta ya dice cuántos); sin ese valor, null: nunca «$0» inventado.
  for (const v of [undefined, null, 'x', NaN]) assert.deepEqual(kpisLib.tarjetasTienda({ ...stats, carritos_abandonados_valor: v }).carritos_abandonados, { valor: 4, tono: 'alerta', ayuda: null }, String(v));
  assert.equal(kpisLib.tarjetasTienda({ ...stats, carritos_abandonados_count: 1 }).carritos_abandonados.tono, 'alerta');
  // Singular y miles.
  assert.equal(kpisLib.tarjetasTienda({ ...stats, web_orders_today: 1 }).web_ventas_hoy.ayuda, '1 pedido web');
  assert.equal(kpisLib.tarjetasTienda({ ...stats, web_orders_month: 1 }).web_ventas_mes.ayuda, '1 pedido PWEB');
  assert.equal(kpisLib.tarjetasTienda({ ...stats, web_orders_month: 1200 }).web_ventas_mes.ayuda, '1.200 pedidos PWEB');
  // Un servidor sin la comparación (anterior ausente o no numérico): sin variación, y el valor sigue.
  for (const anterior of [undefined, null, 'x', NaN]) {
    const sin = kpisLib.tarjetasTienda({ ...stats, revenue_ayer: anterior, revenue_mes_anterior: anterior });
    assert.equal(sin.web_ventas_hoy.variacion, null, String(anterior));
    assert.equal(sin.web_ventas_mes.variacion, null, String(anterior));
    assert.equal(sin.web_ventas_hoy.valor, 1200000);
  }
  // Un anterior de 0 sí compara (la tarjeta lo dice «Nuevo»): el 0 es un número, no «no hay».
  assert.deepEqual(kpisLib.tarjetasTienda({ ...stats, revenue_ayer: 0 }).web_ventas_hoy.variacion, { actual: 1200000, anterior: 0 });
  // Cargando o con error no hay datos: ningún número se inventa (ni 0): valor null, sin ayuda, sin variación ni alerta.
  const vacia = {
    web_ventas_hoy: { valor: null, variacion: null, textoPeriodo: 'vs ayer', ayuda: null },
    web_ventas_mes: { valor: null, variacion: null, textoPeriodo: 'vs mes pasado', ayuda: null },
    carritos_abandonados: { valor: null, tono: 'normal', ayuda: null },
    productos_publicados: { valor: null },
  };
  for (const nada of [null, undefined, {}, [], 'x', 7]) assert.deepEqual(kpisLib.tarjetasTienda(nada), vacia, JSON.stringify(nada));
  // Un campo que no es número no se vuelve 0.
  assert.equal(kpisLib.tarjetasTienda({ ...stats, revenue_today: 'abc' }).web_ventas_hoy.valor, null);
  assert.equal(kpisLib.tarjetasTienda({ ...stats, productos_publicados: undefined }).productos_publicados.valor, null);
  // Los nombres son los de CATALOGO_KPI (la única fuente): la pantalla pinta TarjetaKpi kpi="web_ventas_hoy", etc.
  for (const id of ['web_ventas_hoy', 'web_ventas_mes', 'carritos_abandonados', 'productos_publicados']) assert.ok(id in CATALOGO_KPI, id);
  assert.equal(CATALOGO_KPI.carritos_abandonados.mejorSiSube, false);
  // r1 (m16): GET /ecommerce/carritos trae como mucho 50 (LIMIT 50 del servidor): si la tarjeta cuenta más, la caja lo dice.
  assert.equal(kpisLib.textoLimiteCarritos(120, 50), 'Los 50 más recientes de 120');
  assert.equal(kpisLib.textoLimiteCarritos(1200, 50), 'Los 50 más recientes de 1.200');
  assert.equal(kpisLib.textoLimiteCarritos(51, 50), 'Los 50 más recientes de 51');
  for (const [total, llegaron] of [[50, 50], [4, 4], [3, 5], [null, 5], [undefined, 5], [120, null], [120, undefined], ['x', 5], [120, 0], [NaN, 5]]) {
    assert.equal(kpisLib.textoLimiteCarritos(total, llegaron), null, `${total}, ${llegaron}`);
  }
  // El texto para lectores de pantalla de «vs ayer» (antes salía el genérico «frente al período anterior»).
  assert.equal(frenteDeComparado('vs ayer'), 'frente a ayer');
  assert.equal(frenteDeComparado(kpisLib.TEXTO_COMPARACION_TIENDA.mes), 'frente al mes pasado');
  assert.equal(frenteDeComparado('vs el trimestre'), 'frente al período anterior', 'un texto propio: el genérico');
}

console.log('--- TEST 28 (B4 T23A): el cableado de las tarjetas de la tienda en ecommerce/page.tsx (R12, C13) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/ecommerce/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const codigo = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
  // Las cuatro tarjetas por su nombre del catálogo, con la comparación del servidor; ninguna es botón (ninguna equivale a una vista).
  assert.match(codigo, /<TarjetaKpi kpi="web_ventas_hoy" valor=\{tarjetas\.web_ventas_hoy\.valor\} variacion=\{tarjetas\.web_ventas_hoy\.variacion\} textoPeriodo=\{tarjetas\.web_ventas_hoy\.textoPeriodo\} ayuda=\{sinPermisoStats \?\? tarjetas\.web_ventas_hoy\.ayuda \?\? undefined\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="web_ventas_mes" valor=\{tarjetas\.web_ventas_mes\.valor\} variacion=\{tarjetas\.web_ventas_mes\.variacion\} textoPeriodo=\{tarjetas\.web_ventas_mes\.textoPeriodo\} ayuda=\{sinPermisoStats \?\? tarjetas\.web_ventas_mes\.ayuda \?\? undefined\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="carritos_abandonados" valor=\{tarjetas\.carritos_abandonados\.valor\} tono=\{tarjetas\.carritos_abandonados\.tono\} ayuda=\{sinPermisoStats \?\? tarjetas\.carritos_abandonados\.ayuda \?\? undefined\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="productos_publicados" valor=\{tarjetas\.productos_publicados\.valor\} ayuda=\{sinPermisoStats \?\? undefined\} \/>/);
  assert.ok(!/<TarjetaKpi[^>]*onClick/.test(codigo), 'ninguna tarjeta de la tienda es botón');
  // De dónde salen: GET /ecommerce/stats con su turno; mientras recarga se conserva el valor ('actualizando'); un error se dice.
  assert.match(codigo, /apiFetch\('\/ecommerce\/stats', \{ signal: control\.signal \}\)\s*\.then\(\(r: \{ data\?: Record<string, unknown> \} \| null\) => setStats\(\{ vuelta: vueltaStats, datos: r\?\.data \?\? null, error: null \}\)\)\s*\.catch\(\(err: unknown\) => \{ if \(!control\.signal\.aborted\) setStats\(\{ vuelta: vueltaStats, datos: null, error: err \}\); \}\);/);
  // r1 (m5): la lectura es la de lecturaDeFuente (lib/kpis.js), con el error de la vuelta vigente, no rehecha en línea.
  assert.match(codigo, /const \{ datos: datosStats, cargando: cargandoStats, error: errorStats \} = lecturaDeFuente\(stats, vueltaStats\);/);
  assert.ok(!/lecturaDeCarga\(/.test(codigo), 'sin la lectura rehecha en línea');
  assert.match(codigo, /const avisoStats = avisoDeFuente\(errorStats, 'No se pudieron cargar los indicadores de la tienda'\);/);
  assert.match(codigo, /const estadoStats = useEstadoKpi\(cargandoStats, errorStats\);/);
  assert.match(codigo, /const tarjetas = tarjetasTienda\(datosStats\);/);
  // Con error, lo dice (avisoDeFuente: el detail del servidor y «Reintentar» solo si reintentar sirve; un 403 es de permiso, sin «Reintentar»).
  assert.match(codigo, /\{avisoStats && <AvisoFuente aviso=\{avisoStats\} onReintentar=\{\(\) => setVueltaStats\(\(n\) => n \+ 1\)\} \/>\}/);
  // Lo que cambia las cifras recarga las tarjetas: un pedido movido (cancelarlo resta ventas) y un producto publicado, ocultado,
  // eliminado o guardado (productos_publicados); «Actualizar» recarga todo.
  assert.match(codigo, /const recargarTrasCambio = useCallback\(\(\) => \{\s*recargarPedidos\(\);\s*setVueltaStats\(\(n\) => n \+ 1\);\s*\}, \[recargarPedidos\]\);/);
  assert.match(codigo, /const recargarTrasCatalogo = useCallback\(\(\) => \{\s*recargarCatalogo\(\);\s*setVueltaStats\(\(n\) => n \+ 1\);\s*\}, \[recargarCatalogo\]\);/);
  assert.match(codigo, /<ProductModal product=\{editProduct \|\| null\} onSave=\{recargarTrasCatalogo\}/);
  assert.match(codigo, /const recargarTodo = useCallback\(\(\) => \{\s*setVueltaStats\(\(n\) => n \+ 1\);\s*setVueltaCarritos\(\(n\) => n \+ 1\);\s*recargarPedidos\(\);\s*recargarTablero\(\);\s*recargarCatalogo\(\);\s*\}/);
  assert.match(codigo, /onClick=\{recargarTodo\}/);
  // Los carritos: lo mismo (primera carga en esqueleto, error con Reintentar, vacío y filas por faseDeLista).
  assert.match(codigo, /const faseCarritos = faseDeLista\(\{ cargandoInicial: cargandoCarritos && carritos === null, error: errorCarritos, filas: carritos \}\);/);
  assert.match(codigo, /\{faseCaja === 'error' && avisoCarritos && \(\s*<AvisoFuente aviso=\{avisoCarritos\} onReintentar=\{\(\) => setVueltaCarritos\(\(n\) => n \+ 1\)\} \/>/);
  assert.match(codigo, /<Contador valor=\{carritos === null \? null : carritos\.length\} estado=\{estadoCaja\} \/>/); // F104 (D27): estadoCaja = estadoCarritos con el rol ya leído
  // Se fueron el StatCard, el '...' del cargando, los números armados con || 0 y los catch mudos.
  assert.ok(!/StatCard/.test(codigo), 'sin StatCard');
  assert.ok(!/'\.\.\.'/.test(codigo), "sin el '...' del cargando");
  assert.ok(!/stats\.(revenue|web_orders|carritos|productos)/.test(codigo), 'ningún número se arma con || 0 en el navegador');
  // r1 (I1, I2): lo que el rol no puede leer no se pide ni se pinta (accesoTienda: la lista exacta de require_roles de cada endpoint).
  assert.match(codigo, /const acceso = accesoTienda\(rol\);/);
  assert.match(codigo, /if \(!acceso\.indicadores\) return;\s*const control = new AbortController\(\);\s*apiFetch\('\/ecommerce\/stats'/);
  assert.match(codigo, /\}, \[vueltaStats, acceso\.indicadores\]\);/);
  assert.match(codigo, /if \(!panelActivo \|\| !acceso\.carritos\) return;\s*const control = new AbortController\(\);\s*apiFetch\('\/ecommerce\/carritos\?estado=ABANDONADO'/);
  // B4 T24 (F104, D27): también mientras el rol no se conoce (la franja en cargando y la caja en esqueleto).
  assert.match(codigo, /\{\(acceso\.indicadores \|\| !acceso\.listo\) && \(\s*<>/);
  assert.match(codigo, /\{\(acceso\.carritos \|\| !acceso\.listo\) && \(\s*<div className="order-2/);
  assert.match(codigo, /const actualizando = \(acceso\.indicadores && cargandoStats\) \|\| /);
  // 403 que llega igual: «—» con el motivo de permiso y sin «Reintentar».
  assert.match(codigo, /const sinPermisoStats = motivoSinPermiso\(avisoStats\);/);
  assert.match(codigo, /import \{ AvisoFuente \} from '@\/components\/ui\/AvisoFuente';/);
  assert.match(codigo, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/);
  assert.ok(!/function AvisoFuente|suscribirRol|useSyncExternalStore/.test(codigo), 'sin la copia local del aviso ni del rol');
  assert.match(codigo, /<FranjaKpis estado=\{acceso\.listo \? estadoFranjaDeFuente\(avisoStats, estadoStats\) : 'cargando'\} titulo="Indicadores de la tienda">/); // F104 (D27)
  assert.ok(!/AvisoReintentar/.test(codigo), 'ningún Reintentar fijo');
  // m16: «Los 50 más recientes de N».
  assert.match(codigo, /const textoLimite = textoLimiteCarritos\(datosStats\?\.carritos_abandonados_count, carritos === null \? null : carritos\.length\);/);
  assert.match(codigo, /\{textoLimite && <p /);
  // m10: solo las cargas de la tienda (la pestaña Pagos, con sus .catch(() => {}), está fuera de alcance).
  const cargasTienda = codigo.slice(codigo.indexOf('const [vueltaStats'), codigo.indexOf('const [estadoPedidos'));
  assert.ok(cargasTienda.length > 500 && !/catch \{\}|\.catch\(\(\) => \{\}\)/.test(cargasTienda), 'ninguna carga de la tienda se traga su error');
  assert.ok(!/catPublicados|catBajoStock/.test(codigo), 'los publicados salen del servidor, no de la página del catálogo');
}

console.log('--- TEST 29 (B4 T23B, KPI-otros puntos 3, 4 y 6; RP70): las tarjetas de Marketing, de una campaña, de la ficha del cliente y del proveedor, y la tarjeta del Asistente ---');
{
  const k = await import('../src/lib/kpis.js');
  const kv = await import('../src/lib/kpis-ventas.js');

  // — Marketing: GET /marketing/stats (marketing.py marketing_stats), con los textos de RP70: «(45,2 %)» y «Retorno: 45,2 %».
  const STATS = {
    campanas_activas: 3, campanas_total: 12, leads_total: 250, leads_convertidos: 113, ventas_atribuidas_cop: 12500000,
    presupuesto_total_cop: 8600000, roi_pct: 45.3, tasa_conversion_pct: 45.2, posts_hoy: 1, posts_total: 17, flujos_activos: 4,
  };
  const m = k.tarjetasMarketing(STATS);
  assert.deepEqual(m, {
    camp_activas: { valor: 3, ayuda: '12 campañas en total' },
    leads_capturados: { valor: 250, ayuda: '113 convertidos (45,2 %)' },
    ventas_atribuidas: { valor: 12500000, ayuda: 'Retorno: 45,3 %' },
    flujos_activos: { valor: 4, ayuda: '17 posts publicados' },
  });
  // Singulares y un ROI negativo con su signo.
  const uno = k.tarjetasMarketing({ ...STATS, campanas_total: 1, leads_convertidos: 1, posts_total: 1, roi_pct: -12.5 });
  assert.equal(uno.camp_activas.ayuda, '1 campaña en total');
  assert.equal(uno.leads_capturados.ayuda, '1 convertido (45,2 %)');
  assert.equal(uno.flujos_activos.ayuda, '1 post publicado');
  assert.equal(uno.ventas_atribuidas.ayuda, 'Retorno: -12,5 %');
  // Sin presupuesto el servidor manda roi 0 (no hay retorno que medir): nunca un «Retorno: 0 %» falso.
  assert.equal(k.tarjetasMarketing({ ...STATS, presupuesto_total_cop: 0, roi_pct: 0 }).ventas_atribuidas.ayuda, 'Retorno: sin presupuesto');
  // Un 0 real se queda en 0; lo que no llega es null (la barra gris o «—»), nunca 0.
  assert.equal(k.tarjetasMarketing({ ...STATS, campanas_activas: 0 }).camp_activas.valor, 0);
  const vacio = { camp_activas: { valor: null, ayuda: null }, leads_capturados: { valor: null, ayuda: null }, ventas_atribuidas: { valor: null, ayuda: null }, flujos_activos: { valor: null, ayuda: null } };
  assert.deepEqual(k.tarjetasMarketing(null), vacio);
  assert.deepEqual(k.tarjetasMarketing({}), vacio);
  assert.deepEqual(k.tarjetasMarketing([1]), vacio);
  assert.equal(k.tarjetasMarketing({ ...STATS, tasa_conversion_pct: null }).leads_capturados.ayuda, '113 convertidos', 'sin la tasa, solo los convertidos');
  assert.equal(k.tarjetasMarketing({ ...STATS, leads_convertidos: 'x' }).leads_capturados.ayuda, null);

  // — Una campaña: la fila de GET /marketing/campanas (leads_count, presupuesto_cop) y TODOS sus leads (GET /campanas/{id}/leads no tiene
  // límite). r1 (m19): «Ventas atribuidas» tiene UNA definición, la de Marketing y la de la columna «Venta»: la suma de venta_atribuida_cop
  // de los leads (de cualquier estado: un lead CONTACTADO con venta cuenta), no solo los CONVERTIDO de la fila.
  const CAMP = { id: 5, nombre: 'Black Friday', leads_count: 4, ventas_cop: 3000000, presupuesto_cop: 2000000 };
  const LEADS = [
    { id: 1, estado: 'CONVERTIDO', venta_atribuida_cop: 1000000 }, { id: 2, estado: 'NUEVO', venta_atribuida_cop: 0 },
    { id: 3, estado: 'CONVERTIDO', venta_atribuida_cop: 2000000 }, { id: 4, estado: 'CONTACTADO', venta_atribuida_cop: 500000 },
  ];
  const c = k.tarjetasCampana(CAMP, LEADS);
  assert.deepEqual(c, {
    leads_capturados: { valor: 4 },
    leads_convertidos: { valor: 2 },
    ventas_atribuidas: { valor: 3500000, ayuda: 'Suma de la venta atribuida de sus leads' },
    roi: { valor: 75, texto: '+75 %', tono: 'bien', ayuda: null },
  });
  // El retorno es ventas / presupuesto - 100: positivo «+», negativo con el menos tipográfico (R7), 0 sin signo; alerta si es negativo.
  const conVentas = (n) => [{ id: 1, estado: 'CONVERTIDO', venta_atribuida_cop: n }];
  assert.deepEqual(k.tarjetasCampana(CAMP, conVentas(1000000)).roi, { valor: -50, texto: '−50 %', tono: 'alerta', ayuda: null });
  assert.deepEqual(k.tarjetasCampana(CAMP, conVentas(2000000)).roi, { valor: 0, texto: '0 %', tono: 'normal', ayuda: null });
  assert.equal(k.tarjetasCampana({ ...CAMP, presupuesto_cop: 3000000 }, conVentas(3450000)).roi.texto, '+15 %');
  assert.equal(k.tarjetasCampana(CAMP, conVentas(2600000)).roi.texto, '+30 %');
  assert.equal(k.formatoPorcentajeConSigno(45.25), '+45,3 %');
  assert.equal(k.formatoPorcentajeConSigno(-8), '−8 %');
  assert.equal(k.formatoPorcentajeConSigno(null), null);
  assert.equal(k.formatoPorcentajeConSigno(0.04), '0 %', 'lo que redondea a cero no lleva signo (B29)');
  assert.equal(k.formatoPorcentajeConSigno(-0.04), '0 %');
  // Sin presupuesto no hay retorno: «—» con su motivo, nunca «+NaN%» ni «0 %». Con presupuesto pero sin ventas que contar, sin motivo.
  assert.deepEqual(k.tarjetasCampana({ ...CAMP, presupuesto_cop: 0 }, LEADS).roi, { valor: null, texto: null, tono: 'normal', ayuda: 'Sin presupuesto' });
  assert.deepEqual(k.tarjetasCampana({ ...CAMP, presupuesto_cop: null }, LEADS).roi.ayuda, 'Sin presupuesto');
  assert.deepEqual(k.tarjetasCampana({ presupuesto_cop: 1000 }, null).roi, { valor: null, texto: null, tono: 'normal', ayuda: null }, 'sin leads todavía: ni retorno ni motivo');
  // Mientras los leads cargan (null): ni convertidos ni ventas se inventan (barra gris); los capturados salen de la fila de la campaña.
  const sinLeads = k.tarjetasCampana(CAMP, null);
  assert.equal(sinLeads.leads_convertidos.valor, null);
  assert.equal(sinLeads.ventas_atribuidas.valor, null);
  assert.equal(sinLeads.leads_capturados.valor, 4);
  // Con los leads a la vista, los capturados son los que se ven (agregar uno actualiza el número sin recargar la lista).
  assert.equal(k.tarjetasCampana(CAMP, [...LEADS, { id: 9, estado: 'NUEVO' }]).leads_capturados.valor, 5);
  assert.equal(k.tarjetasCampana(CAMP, []).leads_convertidos.valor, 0, 'una campaña sin leads: ceros de verdad');
  assert.equal(k.tarjetasCampana(CAMP, []).ventas_atribuidas.valor, 0);
  assert.deepEqual(k.tarjetasCampana(null, null).leads_capturados, { valor: null });

  // — La ficha del cliente de la Agenda: resumenFichaCliente (kpis-ventas.js) con los ids del catálogo (RP70: cli_cot_abiertas).
  const PERFIL = {
    resumen_financiero: { total_comprado_cop: 1500000, total_pagado_cop: 600000, saldo_pendiente_cop: 900000, saldo_a_favor_cop: 0 },
    pedidos: [{ estado: 'EN_PROCESO' }, { estado: 'CANCELADO' }, { estado: 'ENTREGADO' }],
    cotizaciones: [{ estado: 'BORRADOR' }, { estado: 'CONFIRMADA' }, { estado: 'ENVIADA' }, { estado: 'VENCIDA' }, { estado: 'RECHAZADA' }],
    solicitudes: [{ estado: 'ASIGNADA' }, { estado: 'CONFIRMADA' }],
  };
  const f = k.tarjetasFichaCliente(kv.resumenFichaCliente(PERFIL));
  assert.deepEqual(f, {
    pven_saldo_por_cobrar: { valor: 900000, tono: 'alerta', ayuda: 'Cobro pendiente antes del despacho' },
    cli_total_comprado: { valor: 1500000, ayuda: '2 pedidos' },
    cli_total_pagado: { valor: 600000, ayuda: 'Pagos confirmados, menos devoluciones' },
    cli_cot_abiertas: { valor: 3, ayuda: '1 solicitud activa' },
  });
  // Saldo en 0: tono bien y «Al día con pagos». Un pedido: «1 pedido».
  const alDia = k.tarjetasFichaCliente(kv.resumenFichaCliente({ ...PERFIL, resumen_financiero: { ...PERFIL.resumen_financiero, saldo_pendiente_cop: 0 }, pedidos: [{ estado: 'ENTREGADO' }] }));
  assert.deepEqual(alDia.pven_saldo_por_cobrar, { valor: 0, tono: 'bien', ayuda: 'Al día con pagos' });
  assert.equal(alDia.cli_total_comprado.ayuda, '1 pedido');
  // BODEGA y COMPRAS (resumen_financiero null): «—» con el motivo, y los conteos (que sí llegan) siguen.
  const sinPermiso = k.tarjetasFichaCliente(kv.resumenFichaCliente({ ...PERFIL, resumen_financiero: null }));
  assert.deepEqual(sinPermiso.pven_saldo_por_cobrar, { valor: null, tono: 'normal', ayuda: 'Sin permiso para ver montos' });
  assert.deepEqual(sinPermiso.cli_total_comprado, { valor: null, ayuda: 'Sin permiso para ver montos' });
  assert.deepEqual(sinPermiso.cli_total_pagado, { valor: null, ayuda: 'Sin permiso para ver montos' });
  assert.equal(sinPermiso.cli_cot_abiertas.valor, 3);
  // Mientras el perfil no llega (null): nada de ceros.
  assert.deepEqual(k.tarjetasFichaCliente(null), {
    pven_saldo_por_cobrar: { valor: null, tono: 'normal', ayuda: null },
    cli_total_comprado: { valor: null, ayuda: null },
    cli_total_pagado: { valor: null, ayuda: null },
    cli_cot_abiertas: { valor: null, ayuda: null },
  });

  // — La ficha del proveedor: lo que el servidor SÍ manda (GET /compras/proveedores: payment_terms) y el total de GET /compras/pedidos?supplier_id=.
  assert.deepEqual(k.tarjetasFichaProveedor({ payment_terms: '30 días' }, 7), {
    prov_condiciones_pago: { valor: '30 días' },
    prov_pedidos_compra: { valor: 7 },
  });
  assert.deepEqual(k.tarjetasFichaProveedor({ payment_terms: '  ' }, 0), { prov_condiciones_pago: { valor: null }, prov_pedidos_compra: { valor: 0 } }, 'sin condiciones, «—»: nunca «Contado» inventado');
  assert.deepEqual(k.tarjetasFichaProveedor(null, null), { prov_condiciones_pago: { valor: null }, prov_pedidos_compra: { valor: null } });

  // — La tarjeta oscura del Asistente: los nombres del catálogo (RP70) y formatoPesos, sin el .split(',')[0] de formatCOP.
  const rev = { total_spent_cop: 4927538, total_orders_count: 6, active_orders_count: 2, avg_ticket_cop: 821256.33, segmento: 'Cliente Frecuente' };
  assert.deepEqual(k.fichaRevenueAsistente(rev), {
    total: { etiqueta: 'Total comprado', texto: '$4.927.538' },
    mini: [
      { etiqueta: 'Total de pedidos', texto: '6', ayuda: null },
      // B4 T24 f4 (B49-f; D27): sin la ayuda «Incluye los facturados». B49-b dejó active_orders_count = pven_en_curso.
      { etiqueta: 'Pedidos en curso', texto: '2', ayuda: null },
      { etiqueta: 'Ticket promedio', texto: '$821.256', ayuda: null },
    ],
  });
  assert.ok(k.fichaRevenueAsistente(rev).mini.every((x) => x.ayuda === null || !/factur/i.test(x.ayuda)), 'B49-f: ninguna ayuda habla de facturados');
  {
    // El contrato del servidor (solo lectura): chat.py da active_orders_count = rv.f_pven_en_curso y total_orders_count = pven_total.
    const chat = readFileSync(new URL('../../backend/app/api/v1/chat.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
    assert.ok(chat.includes('"active_orders_count": pven_en_curso,'), 'B49-b: active_orders_count = pven_en_curso');
    assert.ok(chat.includes('"total_orders_count": pven_total,'), 'B49-b: total_orders_count = pven_total');
    assert.ok(chat.includes('rv.f_pven_en_curso(SaleOrder)'), 'la regla de rv');
  }
  assert.equal(k.fichaRevenueAsistente(rev).total.etiqueta, k.CATALOGO_KPI.cli_total_comprado.etiqueta);
  assert.deepEqual(k.fichaRevenueAsistente(rev).mini.slice(0, 2).map((x) => x.etiqueta), [k.CATALOGO_KPI.pven_total.etiqueta, k.CATALOGO_KPI.pven_en_curso.etiqueta]);
  const sin = k.fichaRevenueAsistente({});
  assert.equal(sin.total.texto, '—');
  assert.deepEqual(sin.mini.map((x) => x.texto), ['—', '—', '—'], 'lo que no llega es «—», nunca $0');
  assert.equal(k.fichaRevenueAsistente(null).total.texto, '—');
  assert.equal(k.fichaRevenueAsistente({ ...rev, total_spent_cop: 0, total_orders_count: 0, active_orders_count: 0, avg_ticket_cop: 0 }).mini[2].texto, '$0', 'un cero real se dice');
}

// ── B4 T23B: el cableado de las cinco pantallas (KPI-otros 2, 3, 4 y 6; TABLA-otros 6; H13; R12, C13; RP7, RP30, RP55, RP66, RP70) ──
const paginaT23B = (ruta) => {
  const fuente = readFileSync(new URL(`../src/app/dashboard/${ruta}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  return fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
};

console.log('--- TEST 30 (B4 T23B): las piezas comunes: AvisoFuente y useRolActual (el rol se lee después de montar) ---');
{
  const fuente = readFileSync(new URL('../src/components/ui/AvisoFuente.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const index = readFileSync(new URL('../src/components/ui/index.ts', import.meta.url), 'utf8');
  assert.ok(!/AvisoFuente|useRolActual/.test(index), 'components/ui/index.ts vuelve a como estaba (R18): se importa directo');
  for (const ruta of ['crm/calendario/page.tsx', 'marketing/page.tsx', 'marketing/campanas/page.tsx', 'agenda/page.tsx', 'asistente_omnicanal/page.tsx', 'ecommerce/page.tsx']) {
    const pagina = readFileSync(new URL(`../src/app/dashboard/${ruta}`, import.meta.url), 'utf8');
    assert.ok(/import \{ AvisoFuente \} from '@\/components\/ui\/AvisoFuente';/.test(pagina), `${ruta} importa AvisoFuente directo`);
    assert.ok(!/AvisoFuente[^;]*from '@\/components\/ui';|useRolActual[^;]*from '@\/components\/ui';/.test(pagina), `${ruta} no los importa del barril`);
  }
  const hook = readFileSync(new URL('../src/components/ui/useRolActual.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(!/useRolActual/.test(fuente), 'AvisoFuente.tsx ya no lleva el hook');
  // El rol: useSyncExternalStore con '' en el servidor y en la hidratación; nunca en el inicializador de useState.
  assert.match(hook, /return useSyncExternalStore\(suscribirRol, \(\) => localStorage\.getItem\('user_role'\) \|\| '', \(\) => ''\);/);
  assert.ok(!/useState\([^)]*localStorage/.test(hook), 'el rol no se lee en el inicializador de useState');
  // El aviso: un 403 es de permiso (sin «Reintentar»); una falla lleva «Reintentar» solo si aviso.reintentar.
  // B4 T24 f3 r1 (m36, D27): mientras se reintenta, el mismo botón sin onClick y con aria-disabled («Reintentando…»).
  // r2 (m36, D27): el botón lleva su ref con limpieza (alSoltarBoton: el foco nunca queda en el <body>).
  assert.match(fuente, /\{aviso\.reintentar && \(\s*<button ref=\{refBoton\} type="button" onClick=\{reintentando \? undefined : onReintentar\} aria-disabled=\{reintentando \|\| undefined\}/);
  assert.match(fuente, /const permiso = aviso\.tipo === 'permiso';/);
  assert.match(fuente, /role=\{permiso \? 'status' : 'alert'\}/);
  // r1 (m36, D27): el texto es {reintentando ? 'Reintentando…' : 'Reintentar'} (un solo botón).
  assert.equal((fuente.match(/\{reintentando \? 'Reintentando…' : 'Reintentar'\}/g) ?? []).length, 1, 'un solo botón «Reintentar», el de aviso.reintentar');
}

console.log('--- TEST 31 (B4 T23B, KPI-otros punto 2; RP7, R12, C13): Seguimientos del CRM ---');
{
  const codigo = paginaT23B('crm/calendario/page.tsx');
  // RP7: lee `data` (datosDeSeguimiento) con la carga de la pantalla y sin el apiFetch local que pedía .json() de un cuerpo ya leído.
  assert.match(codigo, /apiFetch\('\/crm\/leads\?limit=1000', \{ signal: control\.signal \}\),\s*apiFetch\('\/crm\/pipeline-stages', \{ signal: control\.signal \}\),/);
  assert.match(codigo, /\.then\(\(\[l, s\]\) => setCargado\(\{ vuelta, datos: datosDeSeguimiento\(l, s\), error: null \}\)\)/);
  assert.match(codigo, /\.catch\(\(err: unknown\) => \{ if \(!control\.signal\.aborted\) setCargado\(\{ vuelta, datos: null, error: err \}\); \}\);/);
  assert.ok(!/_apiFetch|\.json\(\)|\.catch\(\(\) => \[\]\)|\bl\?\.leads|\bs\?\.stages/.test(codigo), 'sin el apiFetch local, el .json() ni los catch mudos');
  assert.match(codigo, /const \{ datos, cargando, error \} = lecturaDeFuente\(cargado, vuelta\);/);
  assert.match(codigo, /const estadoKpi = useEstadoKpi\(cargando, error\);/);
  assert.match(codigo, /const leads = datos\?\.leads \?\? null;/);   // P1: sin datos NO es una lista vacía
  assert.match(codigo, /const reintentar = \(\) => setVuelta\(\(n\) => n \+ 1\);/);   // P5: «Reintentar» vuelve a pedir
  assert.match(codigo, /<RefreshCw size=\{15\} className=\{acceso\.leads && cargando \? 'animate-spin' : ''\} \/> Actualizar/);   // m7: sin acceso no gira
  // El rol: lo que no puede leer no se pide (accesoSeguimientos) y se dice sin «Reintentar».
  assert.match(codigo, /const acceso = accesoSeguimientos\(rol\);/);
  assert.match(codigo, /const rol = useRolActual\(\);/);
  assert.match(codigo, /if \(!acceso\.leads\) return;\s*const control = new AbortController\(\);/);
  assert.match(codigo, /\}, \[vuelta, acceso\.leads\]\);/);
  assert.match(codigo, /\{acceso\.listo && !acceso\.leads \? \(/);
  assert.match(codigo, /\{aviso && <AvisoFuente aviso=\{aviso\} onReintentar=\{reintentar\} \/>\}/);
  // Las tarjetas: las 3 primeras etapas con el color de su clase (acento de tarjetasSeguimientos) y el total; pulsables, el número de su vista.
  assert.match(codigo, /const tarjetas = tarjetasSeguimientos\(leads, stages, filtro\);/);
  assert.match(codigo, /tarjetas\.etapas\.map\(\(e\) => \(\s*<TarjetaKpi key=\{e\.clave\} etiqueta=\{e\.nombre\} icono="Circle" color=\{e\.acento\} valor=\{e\.valor\} activo=\{e\.activa\}\s*onClick=\{\(\) => setActiveStage\(e\.activa \? 'all' : e\.clave\)\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="leads_total" valor=\{tarjetas\?\.total\.valor \?\? null\} ayuda=\{tarjetas\?\.total\.ayuda \?\? sinPermiso \?\? undefined\}\s*activo=\{tarjetas\?\.total\.activa\} onClick=\{\(\) => setActiveStage\('all'\)\} \/>/);
  // Un 403 que llega igual: «—» con el motivo de permiso en la tarjeta y sin «Reintentar».
  assert.match(codigo, /const sinPermiso = motivoSinPermiso\(aviso\);/);
  assert.match(codigo, /<FranjaKpis estado=\{estadoFranjaDeFuente\(aviso, estadoKpi\)\}/);
  assert.ok(!/StatCard|variant="gradient"|backgroundColor: s\.color|stage\.color|s\.color \|\|/.test(codigo), 'sin StatCard ni el color-clase como CSS');
  // Una sola vista: la búsqueda, las pastillas, los grupos y las tarjetas usan filtrarSeguimiento (no JSON.stringify ni un filter propio).
  assert.match(codigo, /const filtrados = filtrarSeguimiento\(leads, stages, filtro\);/);
  assert.match(codigo, /const grupos = gruposDeSeguimiento\(leads, stages, filtro\);/);
  assert.ok(!/JSON\.stringify|leads\.filter\(|filtered\.filter\(/.test(codigo), 'sin la búsqueda por JSON.stringify ni filtros propios');
  // Los campos que SÍ manda el servidor (fichaDeLeadSeguimiento), no customer_name, lead_value, customer_phone ni customer_email.
  assert.match(codigo, /const f = fichaDeLeadSeguimiento\(lead\);/);
  assert.ok(!/customer_name|lead_value|customer_phone|customer_email|daysInStage|timeAgo|PIPELINE_/.test(codigo), 'sin los campos que el servidor no manda');
  // El vacío y la carga: nunca un vacío falso (textoVacioLeads, y el esqueleto mientras llega).
  assert.match(codigo, /textoVacioLeads\(\{ q: search, etapa: activeStage \}\)/);
  assert.match(codigo, /const vista = vistaSeguimiento\(leads, aviso, filtrados\);/);
  assert.match(codigo, /\{vista === 'esqueleto' \? \(\s*<div className="flex justify-center py-20" role="status" aria-label="Cargando leads">/);
  assert.match(codigo, /\) : vista === 'aviso' \? null : vista === 'vacio' \? \(/);
  // P2, P3, P4 y P6: las pastillas (sin Perdido y con la búsqueda), el esqueleto de 4 tarjetas y los atrasados de TODOS los leads.
  assert.match(codigo, /\{etapasDeSeguimiento\(stages\)\.map\(\(s: any\) => \(/);
  assert.match(codigo, /filtrarSeguimiento\(leads, stages, \{ q: search, etapa \}\)\.length\);/);
  assert.match(codigo, /: cargando && \[0, 1, 2\]\.map\(\(i\) => <TarjetaKpi key=\{i\} etiqueta="Etapa" icono="Circle" valor=\{null\} \/>\)\}/);
  assert.match(codigo, /const urgentes = tarjetasSeguimientos\(leads, stages, \{\}\)\?\.total\.urgentes \?\? 0;/);
  // m9: el aviso dice que cuenta TODOS los leads (la tarjeta cuenta los de la búsqueda); m15: la nota no promete una búsqueda en el servidor.
  assert.match(codigo, /De todos los leads, \{urgentes === 1 \? '1 lleva' : `\$\{formatoEntero\(urgentes\)\} llevan`\} 7 días o más sin actividad/);
  assert.match(codigo, /nota=\{textoLimite \? `\$\{textoLimite\}\. La búsqueda solo filtra los cargados: para ver todos usa el Kanban\.` : undefined\}/);
  // Más de los 1.000 que trae el servidor: lo dice la franja.
  assert.match(codigo, /const textoLimite = textoLimiteCarritos\(datos\?\.total, leads === null \? null : leads\.length\);/);
}

console.log('--- TEST 32 (B4 T23B, KPI-otros punto 4; RP55, RP70): la portada de Marketing ---');
{
  const codigo = paginaT23B('marketing/page.tsx');
  assert.match(codigo, /apiFetch\('\/marketing\/stats', \{ signal: control\.signal \}\)\s*\.then\(\(r: unknown\) => setCargado\(\{ vuelta, datos: datosDeRespuesta\(r\), error: null \}\)\)/);
  assert.match(codigo, /if \(!acceso\.ver\) return;\s*const control = new AbortController\(\);/);
  assert.match(codigo, /const acceso = accesoMarketing\(useRolActual\(\)\);/);
  assert.match(codigo, /const \{ datos, cargando, error \} = lecturaDeFuente\(cargado, vuelta\);/);
  assert.match(codigo, /const estado = useEstadoKpi\(cargando, error\);/);
  assert.match(codigo, /const t = tarjetasMarketing\(datos\);/);
  for (const id of ['camp_activas', 'leads_capturados', 'ventas_atribuidas', 'flujos_activos']) {
    assert.match(codigo, new RegExp(`<TarjetaKpi kpi="${id}" valor=\\{t\\.${id}\\.valor\\} ayuda=\\{t\\.${id}\\.ayuda \\?\\? sinPermiso\\} />`), id);
  }
  // Un 403 que llega igual: «—» con el motivo de permiso en cada tarjeta y sin «Reintentar».
  assert.match(codigo, /const sinPermiso = motivoSinPermiso\(aviso\) \?\? undefined;/);
  assert.match(codigo, /<FranjaKpis estado=\{estadoFranjaDeFuente\(aviso, estado\)\} titulo="Indicadores de Marketing">/);
  assert.match(codigo, /const reintentar = \(\) => setVuelta\(\(n\) => n \+ 1\);/);   // P7: «Reintentar» vuelve a pedir
  assert.match(codigo, /\{aviso && <AvisoFuente aviso=\{aviso\} onReintentar=\{reintentar\} \/>\}/);
  // Sin el '...' del cargando, la grilla fija de 4, el gradient, el .catch mudo ni StatCard; los porcentajes los da formatoValorKpi (en la lib).
  assert.ok(!/'\.\.\.'|grid-cols-4 gap-4|variant="gradient"|StatCard|\.catch\(\(\) => \{\}\)|stats\.[a-z_]+ \?\? 0|fCOP/.test(codigo), 'sin el «...», la grilla fija ni los números armados con ?? 0');
  // RP55: «Visitantes & Leads» ya no se ofrece (la pantalla no se edita, R14) y los textos llevan tilde.
  assert.ok(!/visitantes|Visitantes/.test(codigo), 'Marketing no enlaza a Visitantes');
  assert.ok(!/Campanas|Automatizacion|Disena|analitica|campanas multicanal|codigo de descuento/.test(codigo), 'los textos de la portada llevan tilde');
  assert.match(codigo, /lg:grid-cols-3/);
}

console.log('--- TEST 33 (B4 T23B, KPI-otros punto 4 y TABLA-otros punto 6; R11, R26, RP30): Campañas ---');
{
  const codigo = paginaT23B('marketing/campanas/page.tsx');
  // RP30: sin el confirm() nativo.
  assert.ok(!/(^|[^\w.$])(window\.)?confirm\s*\(/.test(codigo), 'sin confirm() nativo');
  assert.match(codigo, /await confirmar\(\{ titulo: 'Eliminar campaña', mensaje: '¿Eliminar esta campaña\? [^']*', textoConfirmar: 'Eliminar campaña', peligro: true \}\)/);
  // El rol: lo que no puede leer no se pide; borrar es solo de ADMIN.
  assert.match(codigo, /const acceso = accesoMarketing\(useRolActual\(\)\);/);
  assert.match(codigo, /const verCampanas = acceso\.ver;\s*const loadCampanas = useCallback\(async \(\) => \{\s*if \(!verCampanas\) return;/);
  assert.match(codigo, /const pideLeads = verCampanas && Boolean\(selected\?\.id\) && \(activeTab === 'leads' \|\| activeTab === 'metricas'\);/);
  assert.match(codigo, /disabled=\{!acceso\.eliminarCampana\}/);
  assert.match(codigo, /Solo la Administración elimina campañas/);
  assert.match(codigo, /if \(acceso\.listo && !acceso\.ver\) \{/);
  // Los leads de la campaña: UNA tabla estándar 'marketing.leads' en modo cliente, sin tablero (R11) y sin <table> a mano.
  assert.match(codigo, /const ID_LEADS = 'marketing\.leads';/);
  assert.match(codigo, /<TablaEstandar<LeadCampana> id=\{ID_LEADS\} modo="cliente" columnas=\{COLUMNAS_LEADS\} preferencias=\{prefsLeads\} anchoRef=\{anchoLeadsRef\}/);
  assert.match(codigo, /const prefsLeads = usePreferenciasTabla\(ID_LEADS, COLUMNAS_LEADS\);/);
  assert.match(codigo, /const \[estadoTabla, despacharTabla, listoTabla\] = useEstadoTabla\(ID_LEADS\);/);
  assert.match(codigo, /const tablaLeads = useListadoCliente<LeadCampana>\(leads, estadoTabla, ACCESORES_LEADS\);/);
  assert.match(codigo, /const cargandoTabla = !listoTabla \|\| \(tablaLeads\.cargandoInicial && !errorLeads\);/);
  assert.equal((codigo.match(/cargando: cargandoTabla|cargando=\{cargandoTabla\}/g) ?? []).length, 2, 'el cargando de la tabla se escribe una vez');
  assert.equal((codigo.match(/recargando: lectura\.recargando|recargando=\{lectura\.recargando\}/g) ?? []).length, 2);
  assert.match(codigo, /error=\{errorLeads\} onReintentar=\{recargarLeads\}/);
  assert.match(codigo, /<BarraTabla estado=\{estadoTabla\} onEstado=\{despacharTabla\}/);
  assert.ok(!/<table|<thead|kanbanDisponible|TableroKanban/.test(codigo), 'sin <table> a mano ni tablero (R11)');
  // El estado se dice con su etiqueta (humanizarCodigo), nunca el código crudo; elegir otra campaña limpia la tabla.
  assert.match(codigo, /humanizarCodigo\(l\.estado\)/);
  assert.match(codigo, /const elegirCampana = \(c: any\) => \{ setSelected\(c\); despacharTabla\(\{ tipo: 'limpiarFiltros' \}\); \};/);
  // Los leads de la campaña elegida: lo que llegó de otra no se ve (marca), y el error se dice con «Reintentar».
  assert.match(codigo, /const lectura = lecturaLeadsCampana\(leadsCargados, claveLeads, String\(selected\?\.id \?\? ''\), pideLeads\);/);
  assert.match(codigo, /const \{ leads, error: errorLeads \} = lectura;/);
  assert.match(codigo, /const recargarLeads = useCallback\(\(\) => setVueltaLeads\(\(n\) => n \+ 1\), \[\]\);/);   // P8
  assert.match(codigo, /\{!loading && !errorCampanas && filtered\.length===0 &&/);   // P9: un error no dice «Sin campañas»
  assert.match(codigo, /const OPCIONES_ESTADO_LEAD = ESTADOS_LEAD\.map\(\(valor\) => \(\{ valor, etiqueta: humanizarCodigo\(valor\) \}\)\);/);   // m10: una sola fuente
  assert.ok(!/etiqueta: 'Nuevo'|etiqueta: 'Contactado'/.test(codigo), 'las etiquetas del estado salen de humanizarCodigo');
  assert.match(codigo, /\n\s*Pasar al CRM\n/);
  assert.ok(!/Sync CRM/.test(codigo), 'sin el inglés');
  // m11: las fechas de las campañas son días de calendario y su estado lleva etiqueta.
  // B4 T24 (FINAL-m30, D27): textoDiaCorto de fechas-colombia.js (el día corto o '—').
  assert.match(codigo, /const fDate = \(d: unknown\) => textoDiaCorto\(d\);/);
  assert.ok(!/toLocaleDateString/.test(codigo));
  assert.match(codigo, /\{humanizarCodigo\(c\.estado\)\}/);
  assert.match(codigo, /\{humanizarCodigo\(selected\.estado\)\}/);
  assert.match(codigo, /\{avisoLeads && <AvisoFuente aviso=\{avisoLeads\} onReintentar=\{recargarLeads\} \/>\}/);
  assert.ok(!/const \[leads, setLeads\]|loadLeads|\.catch\(\(\) => \{\}\)|catch \{\}/.test(codigo), 'sin los leads sueltos de la campaña anterior ni los catch mudos');
  // Las Métricas: la franja estándar con los ids del catálogo; el ROI con su tono (bien si es positivo, alerta si es negativo).
  assert.match(codigo, /const tarjetasMetricas = tarjetasCampana\(selected, leads\);/);
  assert.match(codigo, /<TarjetaKpi kpi="leads_capturados" valor=\{tarjetasMetricas\.leads_capturados\.valor\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="leads_convertidos" valor=\{tarjetasMetricas\.leads_convertidos\.valor\} estado=\{lectura\.estado\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="ventas_atribuidas" valor=\{tarjetasMetricas\.ventas_atribuidas\.valor\} ayuda=\{tarjetasMetricas\.ventas_atribuidas\.ayuda\} estado=\{lectura\.estado\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="roi" formato="texto" valor=\{tarjetasMetricas\.roi\.texto\} tono=\{tarjetasMetricas\.roi\.tono\} ayuda=\{tarjetasMetricas\.roi\.ayuda \?\? undefined\} estado=\{lectura\.estado\} \/>/);
  assert.ok(!/StatCard|\+\$\{|toFixed\(0\)|Intl\.NumberFormat/.test(codigo), 'sin StatCard, el «+» fijo del ROI ni el formato de dinero propio');
  assert.match(codigo, /const fCOP = \(v: number\) => formatoPesos\(v \|\| 0\);/);
  // El botón flotante de la IA no tapa la última fila de la tabla de leads: el panel baja 96 px de más (medido en el banco a 1024 x 600).
  // B4 T24 (F44-a, D27): la reserva es el token RESERVA_BOTON_IA (pb-24).
  // B4 T24 f4 (Campañas a 375; D27): en el teléfono la página entera se desplaza (el detalle ya no queda con 0 px de alto); desde md,
  // el panel se desplaza solo, como antes. La reserva sigue en el mismo contenedor.
  assert.match(codigo, /<div className=\{`flex-1 md:overflow-y-auto p-6 \$\{RESERVA_BOTON_IA\}`\}>/);
  // m1 (B4 T24 f4, F111; D27): la barra del presupuesto sale de barraPresupuesto (kpis.js, con sus casos): la MISMA cifra que la
  // tarjeta y el ROI, «—» y gris mientras carga, con error o sin dato (nunca «$0» ni un ancho 0 como si fuera un dato).
  assert.match(codigo, /const barra = barraPresupuesto\(lectura\.estado, tarjetasMetricas\.ventas_atribuidas\.valor, selected\?\.presupuesto_cop\);/);
  assert.match(codigo, /<span className="text-sm font-black text-emerald-600">\{barra\.texto\}<\/span>/);
  assert.match(codigo, /\{barra\.gris \? <div className=\{`h-3 w-full rounded-full bg-slate-200 \$\{lectura\.estado === 'cargando' \? 'animate-pulse' : ''\}`\} aria-hidden="true" \/> : <div className="bg-emerald-500 h-3 rounded-full" style=\{\{width:`\$\{barra\.ancho\}%`\}\}\/>\}/);
  assert.ok(!/ventas_atribuidas\.valor \?\? 0/.test(codigo), 'sin el «?? 0» que pintaba $0 con un error');
  assert.ok(!/selected\.ventas_cop/.test(codigo.replace(/c\.ventas_cop/g, '')), 'ninguna cifra de ventas de la pestaña sale de la fila');
  // m7: el filtro de estado de la lista dice la etiqueta, no el código.
  assert.match(codigo, /<option key=\{e\} value=\{e\}>\{humanizarCodigo\(e\)\}<\/option>/);
}

console.log('--- TEST 34 (B4 T23B, KPI-otros punto 3; H13, RP66, RP70): la Agenda: la ficha del cliente, la del proveedor y los enlaces ---');
{
  const codigo = paginaT23B('agenda/page.tsx');
  // La ficha del cliente con las claves REALES de profile-360 (resumenFichaCliente) y con los ids del catálogo.
  assert.match(codigo, /const tarjetasCliente = tarjetasFichaCliente\(customer360 \? resumenFichaCliente\(customer360\) : null\);/);
  for (const id of ['pven_saldo_por_cobrar', 'cli_total_comprado', 'cli_total_pagado', 'cli_cot_abiertas']) {
    assert.match(codigo, new RegExp(`<TarjetaKpi kpi="${id}" \\{\\.\\.\\.tarjetasCliente\\.${id}\\} />`), id);
  }
  assert.match(codigo, /<FranjaKpis estado=\{estadoFicha\} titulo="Indicadores del cliente">/);
  assert.ok(!/customer360\?\.(financials|quotations|saldo_pendiente_cop|ltv)|Total Comprado \(LTV\)|Saldo por Cobrar|Cotizaciones Vivas/.test(codigo), 'sin las claves que el servidor no manda ni los nombres viejos');
  // El perfil es de UN cliente (lo del anterior no se ve) y su error se dice con «Reintentar».
  assert.match(codigo, /const perfilDelCliente = perfil !== null && perfil\.id === clienteActual \? perfil : null;/);
  assert.match(codigo, /const estadoFicha = estadoFichaCliente\(clienteActual, perfilDelCliente\);/);
  // m5: la línea fija de los proveedores que faltan sale de textoProveedoresCortados (no de un toast).
  assert.match(codigo, /const \[totalProveedores, setTotalProveedores\] = useState<number \| null>\(null\);/);
  assert.match(codigo, /setTotalProveedores\(numeroFinito\(res\?\.total\)\);/);
  assert.match(codigo, /const textoCortados = textoProveedoresCortados\(totalProveedores, suppliers\.length\);/);
  assert.match(codigo, /\{textoCortados && <p className="[^"]*">\{textoCortados\}<\/p>\}/);
  assert.ok(!/toast\.error\(`Se muestran|faltan/.test(codigo), 'sin el toast ni la variable que guardaba el total');
  assert.match(codigo, /\{avisoPerfil && <AvisoFuente aviso=\{avisoPerfil\} onReintentar=\{\(\) => fetchProfile\(selectedClient\.realId\)\} \/>\}/);
  assert.match(codigo, /const json = await apiFetch\(`\/crm\/customers\/\$\{realId\}\/profile-360`\);/);
  assert.match(codigo, /const fetchProfile = async \(realId: number\) => \{\s*vigenteCliente\.current = realId;\s*try \{/);   // B8: se marca ANTES de pedir
  assert.match(codigo, /setPerfil\(\(previo\) => siguientePerfil\(previo, realId, vigenteCliente\.current, \{ datos: datosDeRespuesta\(json\) \}\)\);/);
  assert.match(codigo, /setPerfil\(\(previo\) => siguientePerfil\(previo, realId, vigenteCliente\.current, \{ error: e \}\)\);/);
  assert.match(codigo, /\} else \{\s*vigenteCliente\.current = null;\s*setPerfil\(null\);/);
  assert.ok(!/console\.error\('Error perfil 360'/.test(codigo), 'el error del perfil no se traga');
  // La ficha del proveedor: lo que el servidor manda (payment_terms) y el total de sus pedidos de compra; sin «Contado» inventado.
  assert.match(codigo, /const tarjetasProveedor = tarjetasFichaProveedor\(selectedSupplier, supplierPecsTotal\);/);
  assert.match(codigo, /<TarjetaKpi kpi="prov_condiciones_pago" valor=\{tarjetasProveedor\.prov_condiciones_pago\.valor\} \/>/);
  assert.match(codigo, /<TarjetaKpi kpi="prov_pedidos_compra" valor=\{tarjetasProveedor\.prov_pedidos_compra\.valor\}\s*estado=\{pecs\.estado\} \/>/);
  assert.match(codigo, /const pecs = estadoPedidosProveedor\(supplierPecsError, supplierPecsTotal, supplierPecs\);/);
  assert.match(codigo, /\{pecs\.texto \?\? ''\}/);
  assert.match(codigo, /const \{ items, total \} = pedidosDeProveedor\(await apiFetch/);
  assert.match(codigo, /setSupplierPecs\(items\);\s*setSupplierPecsTotal\(total\);/);
  assert.equal((codigo.match(/if \(!esRespuestaVigente\(sup\.id, vigenteProveedor\.current\)\) return;/g) ?? []).length, 2, 'una respuesta vieja del proveedor se descarta, en el éxito y en el error');
  assert.match(codigo, /const openSupplier = async \(sup: any\) => \{\s*vigenteProveedor\.current = sup\.id;/);   // B9
  assert.match(codigo, /if \(!esRespuestaVigente\(sup\.id, vigenteProveedor\.current\)\) return;\s*setSupplierPecs\(\[\]\);\s*setSupplierPecsError\(e\);/);   // B10
  assert.ok(!/Array\.isArray\(res\?\.data\) \? res\.data : \[\]/.test(codigo), 'una respuesta sin lista no es «0 pedidos»');
  assert.ok(!/Moneda Habitual|Tiempo Entrega Estimado|Pedidos PEC Emitidos|supplierPecs\.length\} ordenes|selectedSupplier\.condiciones_pago \|\| 'Contado'\}/.test(codigo), 'sin las tarjetas viejas del proveedor');
  assert.match(codigo, /setSuppliers\(Array\.isArray\(list\) \? list\.map\(proveedorDeServidor\)\.filter\(Boolean\) : \[\]\);/);
  assert.match(codigo, /apiFetch\('\/compras\/proveedores\?limit=200'\)/);
  assert.match(codigo, /\{sup\.condiciones_pago \|\| 'Sin condiciones'\}/);
  assert.ok(!/\{sup\.moneda_default \|\| 'COP'\}|\{sup\.condiciones_pago \|\| 'Contado'\}/.test(codigo), 'la fila no inventa la moneda ni «Contado»');
  assert.match(codigo, /\{infoEstadoPec\(pec\.estado\)\.label\}/);
  // La fecha de cada pedido de compra es fecha_compra (_pec_dict no manda fecha_pedido), un día de calendario (fechaCorta), no un instante.
  assert.match(codigo, /Fecha: \{pec\.fecha_compra \? fechaCorta\(pec\.fecha_compra\) : '-'\}/);
  assert.ok(!/fecha_pedido/.test(codigo), 'sin la clave que el servidor no manda');
  assert.match(codigo, /apiFetch\(`\/compras\/pedidos\?supplier_id=\$\{sup\.id\}&limit=200`\)/);
  // H13 (RP66): los dos enlaces del Historial Comercial a rutas que existen.
  assert.match(codigo, /<Link href="\/dashboard\/ventas\/solicitud" className="[^"]*">Ver SC →<\/Link>/);
  assert.match(codigo, /<Link href="\/dashboard\/ventas\/venta" className="[^"]*">Ver Pedido →<\/Link>/);
  assert.ok(!/\/dashboard\/ventas\/solicitudes|\/dashboard\/ventas\/pedidos/.test(codigo), 'sin las rutas que no existen');
  // Las rutas a las que apuntan existen en el árbol.
  for (const ruta of ['ventas/solicitud/page.tsx', 'ventas/venta/page.tsx']) {
    assert.ok(existsSync(new URL(`../src/app/dashboard/${ruta}`, import.meta.url)), `${ruta} existe`);
  }
}

console.log('--- TEST 35 (B4 T23B, KPI-otros punto 6; H13, RP70): el Asistente omnicanal ---');
{
  const codigo = paginaT23B('asistente_omnicanal/page.tsx');
  // Los nombres y el formato del catálogo: la tarjeta oscura sale de fichaRevenueAsistente (formatoPesos), sin formatCOP ni el split de la coma.
  assert.match(codigo, /const ficha = fichaRevenueAsistente\(contextData\?\.revenue\);/);
  assert.match(codigo, /\{ficha\.total\.etiqueta\}/);
  assert.match(codigo, /\{ficha\.mini\[0\]\.texto\}/);
  assert.match(codigo, /\{ficha\.mini\[2\]\.etiqueta\}/);
  assert.ok(!/formatCOP|\.split\(','\)|Revenue Total|Total Pedidos|Ticket Promedio|>Activos</.test(codigo), 'sin los nombres ni el formato viejos');
  // H13: el estado de cada pedido sale de infoEstadoPedido (sin EN_BODEGA ni DISPONIBLE_ENTREGA), también en la pestaña de cerrados.
  assert.match(codigo, /import \{ clasesDeEstadoPedido \} from '@\/lib\/estados-pedido';/);   // m33: la etiqueta sale de la lib (con su caso)
  assert.ok(!/infoEstadoPedido|const clasesDeEstado =/.test(codigo), 'sin la copia local de la etiqueta');
  assert.ok(!/STATUS_BADGES|EN_BODEGA|DISPONIBLE_ENTREGA/.test(codigo), 'sin STATUS_BADGES ni los estados que no existen');
  assert.match(codigo, /const badge = clasesDeEstadoPedido\(ord\.estado\);/);
  assert.ok(!/>\s*Entregado\s*<\/span>/.test(codigo), 'los cerrados dicen su estado real, no un «Entregado» fijo');
  assert.equal((codigo.match(/clasesDeEstadoPedido\(ord\.estado\)/g) ?? []).length, 3, 'las dos pestañas de pedidos usan clasesDeEstadoPedido');
  assert.equal((codigo.match(/formatoPesos\(ord\.total_cop\)/g) ?? []).length, 2);
  // Se conserva lo de B1 a B3: los tipos y la modalidad (SolicitudTipoYDetalle), el selector de cliente y la creación de la SC.
  assert.match(codigo, /import \{ SolicitudTipoYDetalle, type SolicitudTipoYDetalleHandle \} from '\.\.\/ventas\/solicitud\/solicitud-client';/);
  assert.match(codigo, /import \{ SelectorClienteSC \} from '\.\.\/ventas\/solicitud\/selector-cliente';/);
  assert.match(codigo, /<SolicitudTipoYDetalle/);
  assert.match(codigo, /apiFetch\('\/ventas\/solicitudes'/);
  // El rol: la columna de contexto solo pide lo que el rol puede leer; un error se dice con «Reintentar» (un 403, sin él).
  assert.match(codigo, /const acceso = accesoAsistente\(useRolActual\(\)\);/);
  assert.match(codigo, /if \(!acceso\.contexto \|\| !searchQuery \|\| searchQuery\.trim\(\)\.length < 2\) \{/);
  assert.match(codigo, /\{acceso\.listo && !acceso\.contexto \? \(/);
  assert.match(codigo, /Tu rol no ve el contexto del cliente\./);
  assert.match(codigo, /setErrorContexto\(\{ error: err, pedido: customerIdentifier \}\);/);
  // m8 y m14: sin permiso no se pide el contexto (tampoco desde el mensaje de Chatwoot, montado una sola vez: el acceso va por un ref).
  assert.match(codigo, /const accesoRef = useRef\(false\);\s*useEffect\(\(\) => \{ accesoRef\.current = acceso\.contexto; \}, \[acceso\.contexto\]\);/);   // B22
  assert.match(codigo, /setContextData\(null\);\s*setErrorContexto\(\{ error: err, pedido: customerIdentifier \}\);/);   // B24
  assert.match(codigo, /const loadCustomerContext = async \(customerIdentifier: \{[^}]*\}\) => \{\s*if \(!accesoRef\.current\) return;/);
  // m8: un error de la carga no deja «Sin cliente seleccionado» debajo del aviso (vistaContexto).
  assert.match(codigo, /const vista = vistaContexto\(loadingContext, errorContexto\?\.error, contextData, acceso\.listo && !acceso\.contexto\);/);
  assert.match(codigo, /\{vista === 'error' && avisoContexto && \(/);
  assert.match(codigo, /\{vista === 'cargando' \? \(/);
  assert.match(codigo, /\) : vista === 'contexto' \? \(/);
  assert.match(codigo, /\) : vista === 'vacio' \? \(/);
  // P19 (m35): el error de la búsqueda se guarda y se dice.
  assert.match(codigo, /setSearchResults\(\[\]\);\s*setErrorBusqueda\(err\);/);
  assert.match(codigo, /<p role="alert" className="[^"]*">\{textoDeError\(errorBusqueda, 'No se pudo buscar clientes'\)\}<\/p>/);
  // m9: la ayuda de «Pedidos en curso», si la trae, se pinta (B4 T24 f4, B49-f: hoy no trae ninguna; chat.py ya es canónico).
  assert.match(codigo, /\{ficha\.mini\[1\]\.ayuda && <div className="text-\[9px\] leading-tight text-slate-400">\{ficha\.mini\[1\]\.ayuda\}<\/div>\}/);
  assert.match(codigo, /const avisoContexto = errorContexto \? avisoDeFuente\(errorContexto\.error, 'No se pudo cargar el perfil del cliente'\) : null;/);
  assert.match(codigo, /<AvisoFuente aviso=\{avisoContexto\} onReintentar=\{\(\) => loadCustomerContext\(errorContexto!\.pedido\)\} \/>/);
}

console.log('--- TEST 36 (B4 T23B): ninguna de las cinco pantallas trae diálogos nativos, y Marketing ya no enlaza a Visitantes (RP30, RP55) ---');
{
  const guarda = readFileSync(new URL('./test_sin_dialogos_nativos.mjs', import.meta.url), 'utf8');
  for (const ruta of ['crm/calendario/page.tsx', 'agenda/page.tsx', 'marketing/page.tsx', 'marketing/campanas/page.tsx', 'asistente_omnicanal/page.tsx']) {
    assert.ok(guarda.includes(`'src/app/dashboard/${ruta}'`), `${ruta} está en las RAICES de la guarda`);
    assert.ok(!/(^|[^\w.$])(window\.)?(alert|confirm|prompt)\s*\(/.test(paginaT23B(ruta)), `${ruta}: sin alert(), confirm() ni prompt()`);
  }
  // La excepción HASTA_T23B de TEST 46 (test_tabla.mjs) se fue: Marketing cuenta como cualquier pantalla.
  assert.ok(!readFileSync(new URL('./test_tabla.mjs', import.meta.url), 'utf8').includes('HASTA_T23B'), 'sin la excepción HASTA_T23B');
}

console.log('--- TEST 37 (B4 T23B r1; I2, m6, m12, m31): las rutas de carga y de error en funciones puras: leads de la campaña, perfil, pedidos del proveedor y contexto ---');
{
  const k = await import('../src/lib/kpis.js');
  const L = [{ id: 1 }];
  const llego = (clave, marca, datos, error = null) => ({ vuelta: clave, marca, datos, error });

  // lecturaLeadsCampana(cargados, clave, marcaElegida, pide): lo de OTRA campaña no se ve y la recién elegida está 'cargando' (m6).
  const a = k.lecturaLeadsCampana(llego('5:0', '5', L), '5:0', '5', true);
  assert.deepEqual(a, { leads: L, cargando: false, recargando: false, error: null, estado: 'listo' });
  // Se eligió la campaña 6: llegó lo de la 5. Ni sus leads ni 'actualizando': la barra gris de la primera carga.
  const b = k.lecturaLeadsCampana(llego('5:0', '5', L), '6:0', '6', true);
  assert.deepEqual(b, { leads: null, cargando: true, recargando: false, error: null, estado: 'cargando' });
  // La misma campaña que se vuelve a pedir: se conserva lo que se veía, atenuado.
  const c = k.lecturaLeadsCampana(llego('5:0', '5', L), '5:1', '5', true);
  assert.deepEqual(c, { leads: L, cargando: true, recargando: true, error: null, estado: 'actualizando' });
  // Lo que llegó es de otra campaña aunque la vuelta coincida: sigue sin verse y sigue 'cargando' (mata el mutante de la revisión).
  assert.deepEqual(k.lecturaLeadsCampana(llego('6:0', '5', L), '6:0', '6', true), { leads: null, cargando: true, recargando: false, error: null, estado: 'cargando' });
  // Un error de ESA campaña se dice; el de otra no.
  const e = new Error('x');
  assert.deepEqual(k.lecturaLeadsCampana(llego('5:0', '5', null, e), '5:0', '5', true), { leads: null, cargando: false, recargando: false, error: e, estado: 'error' });
  assert.equal(k.lecturaLeadsCampana(llego('5:0', '5', null, e), '6:0', '6', true).error, null, 'el error de otra campaña no se ve');
  // Sin pedir (otra pestaña) y sin nada que cargar: no hay carga en camino.
  assert.deepEqual(k.lecturaLeadsCampana(null, '5:0', '5', false), { leads: null, cargando: false, recargando: false, error: null, estado: 'listo' });
  assert.equal(k.lecturaLeadsCampana(null, '5:0', '5', true).estado, 'cargando');

  // esRespuestaVigente y siguientePerfil(previo, id, vigente, resultado): una respuesta vieja no pisa la del cliente que se ve (m12).
  assert.equal(k.esRespuestaVigente(3, 3), true);
  assert.equal(k.esRespuestaVigente(3, 4), false);
  assert.equal(k.esRespuestaVigente(3, null), false);
  const previoB = { id: 4, datos: { x: 'B' }, error: null };
  assert.equal(k.siguientePerfil(previoB, 3, 4, { datos: { x: 'A' } }), previoB, 'A llega tarde, después de B: se descarta');
  assert.equal(k.siguientePerfil(null, 3, 4, { error: new Error('x') }), null, 'ni un error viejo');
  assert.deepEqual(k.siguientePerfil(null, 4, 4, { datos: { x: 'B' } }), { id: 4, datos: { x: 'B' }, error: null });
  // Un error del mismo cliente conserva lo que ya se veía (con su aviso); uno sin datos previos queda sin datos; el de otro cliente no cuenta.
  const err = new Error('boom');
  assert.deepEqual(k.siguientePerfil(previoB, 4, 4, { error: err }), { id: 4, datos: { x: 'B' }, error: err });
  assert.deepEqual(k.siguientePerfil(null, 4, 4, { error: err }), { id: 4, datos: null, error: err });
  assert.deepEqual(k.siguientePerfil({ id: 3, datos: { x: 'A' }, error: null }, 4, 4, { error: err }), { id: 4, datos: null, error: err });

  // pedidosDeProveedor(res): lanza si no llega una lista (nada de convertir un error en «0»); el total nunca es menor que lo llegado.
  assert.deepEqual(k.pedidosDeProveedor({ status: 'success', total: 230, data: [{ id: 1 }, { id: 2 }] }), { items: [{ id: 1 }, { id: 2 }], total: 230 });
  assert.deepEqual(k.pedidosDeProveedor({ data: [{ id: 1 }, { id: 2 }], total: 1 }), { items: [{ id: 1 }, { id: 2 }], total: 2 });
  assert.deepEqual(k.pedidosDeProveedor({ data: [] }), { items: [], total: 0 });
  for (const mala of [null, undefined, {}, { data: null }, { data: 'x' }, { data: { a: 1 } }, 7]) {
    assert.throws(() => k.pedidosDeProveedor(mala), /El servidor no devolvió datos\./, JSON.stringify(mala));
  }

  // estadoPedidosProveedor(error, total, items): el estado de la tarjeta «Pedidos de compra» y el texto de la lista.
  assert.deepEqual(k.estadoPedidosProveedor(null, null, []), { estado: 'cargando', texto: 'Cargando pedidos de compra…' });
  assert.deepEqual(k.estadoPedidosProveedor(new Error('x'), null, []), { estado: 'error', texto: 'No se pudieron cargar los pedidos de compra.' });
  assert.deepEqual(k.estadoPedidosProveedor(null, 0, []), { estado: 'listo', texto: 'No hay pedidos de compra emitidos aún a este proveedor.' });
  assert.deepEqual(k.estadoPedidosProveedor(null, 230, [{ id: 1 }]), { estado: 'listo', texto: null }, 'el total manda aunque llegó menos');
  assert.equal(k.estadoPedidosProveedor(null, 3, []).texto, null, 'con pedidos en el total, nunca «No hay pedidos»');

  // vistaContexto(cargando, error, contexto): el error no deja «Sin cliente seleccionado» debajo del aviso (m8).
  assert.equal(k.vistaContexto(true, null, null), 'cargando');
  assert.equal(k.vistaContexto(true, new Error('x'), null), 'cargando');
  assert.equal(k.vistaContexto(false, new Error('x'), null), 'error');
  assert.equal(k.vistaContexto(false, null, { customer: {} }), 'contexto');
  assert.equal(k.vistaContexto(false, null, null), 'vacio');
  assert.equal(k.vistaContexto(false, new Error('x'), { customer: {} }), 'contexto', 'con un contexto a la vista, un error viejo no lo tapa');
  // m4: un rol que no ve el contexto no ve «Sin cliente seleccionado» (ni nada que ofrezca buscar).
  assert.equal(k.vistaContexto(false, null, null, true), 'sin-permiso');
  assert.equal(k.vistaContexto(true, null, null, true), 'sin-permiso');
  assert.equal(k.vistaContexto(false, null, null, false), 'vacio');

  // m11 (B17): el error de OTRA campaña no se ve aunque la vuelta coincida; la lectura sigue 'cargando'.
  const eOtra = new Error('otra');
  assert.deepEqual(k.lecturaLeadsCampana(llego('6:0', '5', null, eOtra), '6:0', '6', true), { leads: null, cargando: true, recargando: false, error: null, estado: 'cargando' });

  // m6: el estado de la ficha del cliente de la Agenda (estadoFichaCliente).
  assert.equal(k.estadoFichaCliente(7, null), 'cargando');
  assert.equal(k.estadoFichaCliente(7, { datos: null, error: new Error('x') }), 'error');
  assert.equal(k.estadoFichaCliente(7, { datos: { a: 1 }, error: new Error('x') }), 'listo', 'un error con datos previos deja la ficha con su aviso');
  assert.equal(k.estadoFichaCliente(7, { datos: { a: 1 }, error: null }), 'listo');
  assert.equal(k.estadoFichaCliente(null, null), 'listo', 'sin cliente abierto no hay nada que cargar');

  // m5 y m10: la línea fija de los proveedores que faltan (el servidor da 200 como máximo y ordena por nombre).
  assert.equal(k.textoProveedoresCortados(1234, 200), 'Se muestran los primeros 200 de 1.234 (por nombre)');
  assert.equal(k.textoProveedoresCortados(230, 200), 'Se muestran los primeros 200 de 230 (por nombre)');
  assert.equal(k.textoProveedoresCortados(200, 200), null, 'llegaron todos');
  assert.equal(k.textoProveedoresCortados(50, 200), null);
  assert.equal(k.textoProveedoresCortados(undefined, 200), null, 'sin total no se inventa');
  assert.equal(k.textoProveedoresCortados('x', 3), null);
  assert.equal(k.textoProveedoresCortados(5, 0), null, 'sin filas no hay lista que cortar');
}

console.log('--- TEST T24 (B4 T24, FINAL-m21): fuenteGuardable — un formulario cargado de una fuente se guarda solo con lo que llegó ---');
{
  const { fuenteGuardable, lecturaDeFuente } = kpisLib;
  assert.equal(typeof fuenteGuardable, 'function');
  const llego = (datos, error = null, vuelta = 1) => lecturaDeFuente({ vuelta, datos, error }, 1);
  // Llegó: se guarda (también una configuración vacía que mandó el servidor).
  assert.equal(fuenteGuardable(llego({ envio_local: { enabled: true, tarifa: 9000 }, zonas: [] })), true);
  assert.equal(fuenteGuardable(llego({})), true, 'un objeto vacío del servidor también es lo guardado');
  // Cargando (nada llegó, o llegó de otra vuelta): no se guarda (los valores por defecto del estado NO son los de la tienda).
  assert.equal(fuenteGuardable(lecturaDeFuente(null, 1)), false, 'todavía no llegó');
  assert.equal(fuenteGuardable(llego({ a: 1 }, null, 0)), false, 'llegó la de otra vuelta: recargando');
  // Falló: no se guarda (con «Guardar Envíos» se pisaría todo el JSON, también las zonas).
  assert.equal(fuenteGuardable(llego(null, Object.assign(new Error('x'), { status: 500 }))), false, 'error');
  assert.equal(fuenteGuardable(llego(null, { status: 403 })), false, '403');
  // Con un error de la vuelta vigente no se guarda aunque haya datos (una regla, no la forma de lo que arma la pantalla).
  assert.equal(fuenteGuardable(llego({ envio_local: { tarifa: 1 } }, new Error('x'))), false, 'datos con error');
  // Sin datos y sin error (el servidor no mandó data): tampoco.
  assert.equal(fuenteGuardable(llego(null)), false, 'sin datos');
  assert.equal(fuenteGuardable(null), false);
  assert.equal(fuenteGuardable(undefined), false);
}

console.log('--- TEST T24-e (B4 T24 r1, m11): cuerpoConfigPagos — un secreto vacío no borra el guardado ni se reenvían los *_masked ---');
{
  const { cuerpoConfigPagos, SECRETOS_PAGOS } = kpisLib;
  // update_payment_config (ecommerce.py) MEZCLA el cuerpo de cada pasarela sobre lo guardado: un secret_key '' lo borraría, y un
  // *_masked se guardaría como un dato. El GET no devuelve los secretos (los quita y manda *_masked).
  // B4 T24 f4 (m6; D27): el webhook_secret también es un secreto (abajo, TEST T24-f4b).
  assert.deepEqual(SECRETOS_PAGOS, { stripe: ['secret_key', 'webhook_secret'], mercadopago: ['access_token'] });
  const leido = {
    stripe: { enabled: true, publishable_key: 'pk_1', secret_key: '', secret_key_masked: '****1234', webhook_secret: 'whsec_9' },
    mercadopago: { enabled: false, public_key: 'APP_1', access_token: '   ', access_token_masked: '****9876' },
    otro: { x: 1 },
  };
  assert.deepEqual(cuerpoConfigPagos(leido), {
    stripe: { enabled: true, publishable_key: 'pk_1', webhook_secret: 'whsec_9' },
    mercadopago: { enabled: false, public_key: 'APP_1' },
  }, 'vacío = no cambiar; sin *_masked ni pasarelas que el servidor no conoce');
  // Un secreto nuevo, escrito, sí va.
  assert.deepEqual(cuerpoConfigPagos({ stripe: { secret_key: 'sk_nuevo' } }), { stripe: { secret_key: 'sk_nuevo' } });
  assert.deepEqual(cuerpoConfigPagos(null), {});
  assert.notEqual(cuerpoConfigPagos(leido).stripe, leido.stripe, 'no muta lo leído');
  // La pantalla manda ese cuerpo y muestra el enmascarado como marcador del campo vacío.
  const pantalla = readFileSync(new URL('../src/app/dashboard/ecommerce/page.tsx', import.meta.url), 'utf8');
  assert.ok(pantalla.includes("body:JSON.stringify(cuerpoConfigPagos(payConfig))"), 'Guardar Pagos manda cuerpoConfigPagos');
  assert.ok(!pantalla.includes('JSON.stringify(payConfig)'), 'nunca el estado crudo');
  assert.ok(pantalla.includes("placeholder={payConfig[gw.key]?.[`${field.k}_masked`] || field.ph}"), 'el enmascarado como marcador');
}

console.log('--- TEST T24-f4b (B4 T24 f4; m6 del backend r2, m4 y m11 de r3): el Webhook Secret de Stripe también es un secreto ---');
{
  const { cuerpoConfigPagos, SECRETOS_PAGOS, AYUDA_SECRETOS_PAGOS } = kpisLib;
  // GET /ecommerce/pagos/config ya no trae webhook_secret sino webhook_secret_masked (m6): el campo llega vacío, y vacío = no cambiar.
  assert.deepEqual(SECRETOS_PAGOS, { stripe: ['secret_key', 'webhook_secret'], mercadopago: ['access_token'] });
  const leido = {
    stripe: { enabled: true, publishable_key: 'pk_1', secret_key: '', secret_key_masked: '****1234', webhook_secret: '',
      webhook_secret_masked: '****abcd' },
    mercadopago: { enabled: true, public_key: 'APP_1', access_token: '', access_token_masked: '****9876' },
  };
  assert.deepEqual(cuerpoConfigPagos(leido), {
    stripe: { enabled: true, publishable_key: 'pk_1' },
    mercadopago: { enabled: true, public_key: 'APP_1' },
  }, 'los tres secretos vacíos no se mandan, ni sus *_masked');
  assert.deepEqual(cuerpoConfigPagos({ stripe: { webhook_secret: '   ' } }), { stripe: {} }, 'un webhook_secret en blanco tampoco');
  assert.deepEqual(cuerpoConfigPagos({ stripe: { webhook_secret: 'whsec_nuevo' } }), { stripe: { webhook_secret: 'whsec_nuevo' } }, 'uno nuevo sí');
  // El servidor (solo lectura) enmascara los tres y un vacío, null o máscara no cambia (ecommerce.py, _SECRETOS_DE_PAGO).
  const eco = readFileSync(new URL('../../backend/app/api/v1/ecommerce.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.ok(eco.includes('webhook_secret_masked'), 'm6: el GET manda webhook_secret_masked');
  assert.ok(eco.includes('_SECRETOS_DE_PAGO'), 'la lista del servidor');
  // La pantalla: el marcador del Webhook Secret es el *_masked (el patrón de m11 de f1, genérico por campo) y la ayuda lo explica.
  const pantalla = readFileSync(new URL('../src/app/dashboard/ecommerce/page.tsx', import.meta.url), 'utf8');
  assert.ok(pantalla.includes("{k:'webhook_secret',l:'Webhook Secret',ph:'whsec_...',pw:true}"), 'el campo es de contraseña');
  assert.ok(pantalla.includes("placeholder={payConfig[gw.key]?.[`${field.k}_masked`] || field.ph}"), 'el marcador del campo es su *_masked');
  assert.match(AYUDA_SECRETOS_PAGOS, /vacío/);
  assert.match(AYUDA_SECRETOS_PAGOS, /escribe el nuevo/);
  assert.match(AYUDA_SECRETOS_PAGOS, /Desactivar el proveedor tampoco lo borra/);
  assert.ok(pantalla.includes('<p className="text-xs text-slate-500">{AYUDA_SECRETOS_PAGOS}</p>'), 'la ayuda en la pestaña Pagos');
  assert.match(pantalla, /import \{[^}]*\bAYUDA_SECRETOS_PAGOS\b[^}]*\} from '@\/lib\/kpis';/);
}

console.log('--- TEST T24-f4c (B4 T24 f4; C1 del backend r3): Sitio Web solo usa las claves que GET /ecommerce/web-builder/config sigue trayendo ---');
{
  // Backend r3 (C1): el GET solo trae CLAVES_CONSTRUCTOR_SITIO y el PATCH ignora el resto. Sitio Web lee y escribe solo esas.
  const eco = readFileSync(new URL('../../backend/app/api/v1/ecommerce.py', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const m = eco.match(/^CLAVES_CONSTRUCTOR_SITIO = \(([^)]*)\)$/m);
  assert.ok(m, 'CLAVES_CONSTRUCTOR_SITIO en ecommerce.py');
  const claves = new Set([...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]));
  assert.deepEqual([...claves], ['theme', 'hero', 'featured_section', 'contact', 'blog']);
  const sitio = readFileSync(new URL('../src/app/dashboard/sitio-web/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const usadas = new Set([
    ...[...sitio.matchAll(/\bconfig\.([a-z_]+)/g)].map((x) => x[1]),
    ...[...sitio.matchAll(/updateSection\('([a-z_]+)'/g)].map((x) => x[1]),
    ...[...sitio.matchAll(/\{ k: '([a-z_]+)', l: /g)].map((x) => x[1]),
  ]);
  assert.ok(usadas.size >= 4, `Sitio Web usa sus secciones: ${[...usadas]}`);
  for (const k of usadas) assert.ok(claves.has(k), `Sitio Web usa «${k}», que el GET ya no trae`);
  // La pantalla sigue leyendo d.data del GET y mandando el config al PATCH (las claves de fuera las ignora el servidor).
  assert.ok(sitio.includes("apiFetch('/ecommerce/web-builder/config').then(d => { setConfig(d.data || {});"));
  assert.ok(sitio.includes("await apiFetch('/ecommerce/web-builder/config', { method: 'PATCH', body: JSON.stringify(config) });"));
}

console.log('--- TEST T24-b (B4 T24, FINAL-m23): el Copilot del Dashboard, solo para quien lo puede consultar, sin emojis y con el 403 dicho ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const c = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // accesoCopilot (lib/roles.js, casos en test_roles.mjs) con useRolActual: el Copilot solo para ADMIN, ASESOR y FINANZAS.
  assert.match(c, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/);
  assert.match(c, /import \{ accesoCopilot \} from '@\/lib\/roles';/);
  assert.match(c, /const rol = useRolActual\(\);\s*const accesoIa = accesoCopilot\(rol\);/);
  assert.match(c, /\{accesoIa\.consultar && \(\s*<div className="bg-gradient-to-r from-purple-950/);
  assert.match(c, /if \(!q \|\| !accesoIa\.consultar\) return;/, 'tampoco se consulta por Enter sin permiso');
  // Sin emojis en los botones de consulta rápida.
  const rapidas = c.slice(c.indexOf('Consultas rápidas'), c.indexOf('].map((sug, idx)'));
  assert.ok(rapidas.length > 0);
  assert.ok(!/\p{Extended_Pictographic}/u.test(rapidas), 'sin emojis');
  for (const t of ["label: 'Estado de inventario'", "label: 'Compras en tránsito'", "label: 'Cartera pendiente'", "label: 'Resumen de clientes'"]) assert.ok(rapidas.includes(t), t);
  // El error dice la causa real (avisoDeFuente: un 403 es de permiso; lo demás, el detalle del servidor), no «Revisa la conectividad».
  assert.ok(!c.includes('Revisa la conectividad del backend'), 'sin la causa falsa');
  assert.match(c, /answer: avisoDeFuente\(err, 'No se pudo consultar el copiloto'\)!\.texto,/);
}

console.log('--- TEST T24-c (B4 T24, F108): la Agenda ofrece Nuevo, Editar y Eliminar proveedor solo a ADMIN y COMPRAS ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/agenda/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const c = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // accesoProveedores (lib/roles.js; casos en test_roles.mjs) con useRolActual.
  assert.match(c, /import \{[^}]*\baccesoProveedores\b[^}]*\} from '@\/lib\/roles';/);
  assert.match(c, /import \{ useRolActual \} from '@\/components\/ui\/useRolActual';/);
  assert.match(c, /const accesoProv = accesoProveedores\(useRolActual\(\)\);/);
  // Los cuatro botones (Nuevo, Eliminar de la tarjeta, Editar y Eliminar del detalle), dentro de accesoProv.editar.
  assert.match(c, /\{accesoProv\.editar && \(\s*<button\s+onClick=\{openNewSupplier\}/);
  assert.match(c, /\{accesoProv\.editar && \(\s*<button\s+onClick=\{\(e\) => \{\s*e\.stopPropagation\(\);\s*setDeleteConfirmSupplier\(sup\);/);
  assert.match(c, /\{accesoProv\.editar && \(\s*<>\s*<button\s+onClick=\{\(\) => openEditSupplier\(selectedSupplier\)\}/);
  assert.equal((c.match(/setDeleteConfirmSupplier\((sup|selectedSupplier)\)/g) ?? []).length, 2, 'los dos «Eliminar Proveedor»');
  // r1 (C3): las CINCO entradas: cada onClick={openNewSupplier} (el encabezado y el vacío) va dentro de accesoProv.editar.
  const nuevos = [...c.matchAll(/onClick=\{openNewSupplier\}/g)];
  assert.equal(nuevos.length, 2, 'el encabezado y el vacío');
  for (const m of nuevos) assert.match(c.slice(Math.max(0, m.index - 120), m.index), /\{accesoProv\.editar && \(\s*<button\s+$/, 'dentro de accesoProv.editar');
  // Sin permiso, el vacío dice solo «Sin proveedores registrados» (sin invitar a crear).
  assert.match(c, /\{accesoProv\.editar && <p className="text-xs text-slate-500 mt-1 mb-6">Crea el primer proveedor para gestionar compras y pedidos PEC\.<\/p>\}/);
}

console.log('--- TEST T24-f4d (B4 T24 f4: FINAL-m20, F113 y F114): la Agenda no vuelve un error de carga un vacío falso ---');
{
  const { vistaListaAgenda, textoProveedoresCortados } = kpisLib;
  // FINAL-m20: la regla, pura. Un error sin filas es 'error' (el aviso, nunca «Sin proveedores registrados» ni «+ Registrar»).
  assert.equal(vistaListaAgenda({ cargando: true, error: null, cantidad: 0 }), 'cargando');
  assert.equal(vistaListaAgenda({ cargando: false, error: null, cantidad: 0 }), 'vacio', 'un vacío de verdad');
  assert.equal(vistaListaAgenda({ cargando: false, error: null, cantidad: 3 }), 'lista');
  assert.equal(vistaListaAgenda({ cargando: false, error: new Error('500'), cantidad: 0 }), 'error', 'un 500 o la red no son un vacío');
  assert.equal(vistaListaAgenda({ cargando: true, error: new Error('500'), cantidad: 0 }), 'error', 'mientras se reintenta, el aviso sigue (con «Reintentando…»)');
  assert.equal(vistaListaAgenda({ cargando: false, error: new Error('500'), cantidad: 2 }), 'lista', 'con filas de antes, la lista sigue y el aviso va encima');
  assert.equal(vistaListaAgenda({ cargando: true, error: null, cantidad: 2 }), 'cargando');
  // F114: el separador de miles de textoProveedoresCortados (mata N4: sin formatoEntero).
  assert.equal(textoProveedoresCortados(5000, 1200), 'Se muestran los primeros 1.200 de 5.000 (por nombre)');
  const fuente = readFileSync(new URL('../src/app/dashboard/agenda/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const c = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  // El cableado: los dos catch GUARDAN el error (antes, un console.error mudo) y lo limpian al llegar bien.
  const proveedores = c.slice(c.indexOf('const fetchSuppliers = async'), c.indexOf('const openSupplier = async'));
  assert.match(proveedores, /setErrorProveedores\(null\);/);
  assert.match(proveedores, /\} catch \(e\) \{\s*setErrorProveedores\(e\);/);
  assert.ok(!/console\.error\('Error cargando proveedores'/.test(c), 'el error de proveedores no se traga');
  const clientes = c.slice(c.indexOf('const fetchCustomers = async'), c.indexOf('const fetchProfile = async'));
  assert.match(clientes, /setErrorClientes\(null\);/);
  assert.match(clientes, /\} catch \(e\) \{\s*setErrorClientes\(e\);/);
  assert.ok(!/console\.error\('Error cargando clientes'/.test(c), 'el error de clientes no se traga');
  // El aviso común (avisoDeFuente: un 403 sin «Reintentar») y la vista de la lib.
  assert.match(c, /const avisoProveedores = avisoDeFuente\(errorProveedores, 'No se pudieron cargar los proveedores'\);/);
  assert.match(c, /const avisoClientes = avisoDeFuente\(errorClientes, 'No se pudieron cargar los clientes'\);/);
  assert.match(c, /const vistaProveedores = vistaListaAgenda\(\{ cargando: loadingSuppliers, error: errorProveedores, cantidad: suppliers\.length \}\);/);
  assert.match(c, /\{avisoProveedores && <div className="mb-4"><AvisoFuente aviso=\{avisoProveedores\} onReintentar=\{fetchSuppliers\} reintentando=\{loadingSuppliers\} \/><\/div>\}/);
  assert.match(c, /\{avisoClientes && <div className="mb-4"><AvisoFuente aviso=\{avisoClientes\} onReintentar=\{fetchCustomers\} \/><\/div>\}/);
  assert.ok(c.indexOf('{avisoClientes && ') < c.indexOf('{filteredCustomers.map(client =>'), 'el aviso de clientes va sobre la cuadrícula');
  // El vacío «Sin proveedores registrados» solo en la rama 'vacio' (con la búsqueda que no encuentra nada, también).
  const rama = c.slice(c.indexOf("{vistaProveedores === 'cargando' ? ("), c.indexOf('<h3 className="font-black text-slate-800 text-lg">Sin proveedores registrados</h3>'));
  assert.match(rama, /^\{vistaProveedores === 'cargando' \? \([\s\S]*\) : vistaProveedores === 'error' \? null : filteredSuppliers\.length === 0 \? \(/);
  // F113: el orden de lo que va sobre la lista: la línea de los cortados, el aviso y después la lista (o su vacío).
  const iCortados = c.indexOf('{textoCortados && ');
  const iAviso = c.indexOf('{avisoProveedores && <div className="mb-4"><AvisoFuente');
  const iLista = c.indexOf("{vistaProveedores === 'cargando' ? (");
  assert.ok(iCortados > 0 && iAviso > iCortados && iLista > iAviso, `F113: cortados (${iCortados}) < aviso (${iAviso}) < lista (${iLista})`);
}

console.log('--- TEST T24-f4e (B4 T24 f4: F111, FINAL-m24, Campañas a 375 y F112): la barra del presupuesto, el modal, el teléfono y el Asistente ---');
{
  const { barraPresupuesto } = kpisLib;
  // F111: la barra, pura. Mientras carga: «—» y gris (con pulso); con error o sin dato: «— / $presupuesto» y gris (nunca «$0»).
  assert.deepEqual(barraPresupuesto('cargando', null, 1000000), { texto: '—', ancho: 0, gris: true });
  assert.deepEqual(barraPresupuesto('cargando', 400000, 1000000), { texto: '—', ancho: 0, gris: true }, 'lo de otra campaña no se ve');
  assert.deepEqual(barraPresupuesto('error', null, 1000000), { texto: '— / $1.000.000', ancho: 0, gris: true }, 'GET …/leads falló: sin $0');
  assert.deepEqual(barraPresupuesto('listo', null, 1000000), { texto: '— / $1.000.000', ancho: 0, gris: true }, 'valor null: «—»');
  assert.deepEqual(barraPresupuesto('listo', 400000, 1000000), { texto: '$400.000 / $1.000.000', ancho: 40, gris: false });
  assert.deepEqual(barraPresupuesto('actualizando', 400000, 1000000), { texto: '$400.000 / $1.000.000', ancho: 40, gris: false }, 'la recarga conserva lo último');
  assert.deepEqual(barraPresupuesto('listo', 0, 1000000), { texto: '$0 / $1.000.000', ancho: 0, gris: false }, 'un cero real se dice');
  assert.equal(barraPresupuesto('listo', 2500000, 1000000).ancho, 100, 'tope 100 %');
  assert.equal(barraPresupuesto('listo', -5, 1000000).ancho, 0, 'nunca negativo');
  assert.deepEqual(barraPresupuesto('listo', 400000, 0), { texto: '$400.000 / $0', ancho: 0, gris: false }, 'sin presupuesto, sin dividir por cero');

  const camp = paginaT23B('marketing/campanas/page.tsx');
  // FINAL-m24: el select «Estado» del modal con la etiqueta (humanizarCodigo), el tipo con su etiqueta con tilde y «¡Campaña lanzada!».
  assert.equal((camp.match(/\{Object\.keys\(ESTADO_COLORS\)\.map\(e=><option key=\{e\} value=\{e\}>\{humanizarCodigo\(e\)\}<\/option>\)\}/g) ?? []).length, 2,
    'el filtro de la lista y el modal');
  assert.ok(!/<option key=\{e\}>\{e\}<\/option>|<option key=\{t\}>\{t\}<\/option>/.test(camp), 'sin códigos crudos');
  assert.match(camp, /\{TIPOS_CAMPANA\.map\(t=><option key=\{t\} value=\{t\}>\{ETIQUETA_TIPO_CAMPANA\[t\] \?\? humanizarCodigo\(t\)\}<\/option>\)\}/);
  assert.match(camp, /FISICA: 'Física'/);
  assert.match(camp, /\['Tipo', ETIQUETA_TIPO_CAMPANA\[selected\.tipo\] \?\? humanizarCodigo\(selected\.tipo\)\]/);
  assert.ok(camp.includes("showToast('¡Campaña lanzada!')"), 'con «¡»');
  assert.ok(!camp.includes("showToast('Campaña lanzada!')"));

  // Campañas a 375 (f1 r2, duda 1): la raíz se desplaza en el teléfono; desde md, el panel (como antes).
  const campCrudo = readFileSync(new URL('../src/app/dashboard/marketing/campanas/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  assert.match(campCrudo, /<div className="w-full h-full bg-slate-50 flex flex-col overflow-y-auto md:overflow-hidden">\s*<Toast/);
  assert.match(campCrudo, /<div className="flex flex-col md:flex-row md:flex-1 md:min-h-0 md:overflow-hidden">\s*\{\/\* COLUMNA IZQUIERDA/);
  assert.match(campCrudo, /<div className="w-full md:w-72 shrink-0 bg-white border-b md:border-b-0 md:border-r border-slate-200 flex flex-col max-h-80 md:max-h-none">/);
  assert.match(campCrudo, /<div className="flex-1 min-h-0 overflow-y-auto">/);
  assert.match(campCrudo, /<div className="flex-1 flex flex-col md:overflow-hidden">\s*\{\/\* Campaña Header \*\/\}/);
  assert.ok(!/<div className="flex-1 flex overflow-hidden">/.test(campCrudo), 'sin la fila que dejaba el detalle en 0 px');

  // F112: «Sin cliente seleccionado» sale UNA vez, y solo en la rama 'vacio' de vistaContexto (mata V7).
  const asis = paginaT23B('asistente_omnicanal/page.tsx');
  assert.equal((asis.match(/Sin cliente seleccionado/g) ?? []).length, 1, 'una sola vez en lo que se pinta');
  const iVacio = asis.indexOf(") : vista === 'vacio' ? (");
  const iTexto = asis.indexOf('Sin cliente seleccionado');
  const iFin = asis.indexOf(') : null}', iVacio);
  assert.ok(iVacio > 0 && iTexto > iVacio && (iFin < 0 || iTexto < iFin), `dentro de la rama 'vacio' (${iVacio} < ${iTexto})`);
  assert.ok(!asis.slice(asis.indexOf("{vista === 'cargando' ? ("), iVacio).includes('Sin cliente seleccionado'), 'ni en cargando ni en contexto');
}

console.log('--- TEST T24-f4a (B4 T24 f4, A4): la Agenda guarda el proveedor con peticionGuardarProveedor (PATCH al editar, las claves del servidor) ---');
{
  const fuente = readFileSync(new URL('../src/app/dashboard/agenda/page.tsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const c = fuente.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const guardar = c.slice(c.indexOf('const handleSaveSupplier = async'), c.indexOf('const handleConfirmDeleteSupplier = async'));
  assert.ok(guardar.length > 0, 'handleSaveSupplier existe');
  assert.match(guardar, /const editar = supplierModal === 'EDIT' && selectedSupplier\?\.id \? selectedSupplier\.id : null;/);
  assert.match(guardar, /const \{ ruta, opciones \} = peticionGuardarProveedor\(supplierForm, editar\);/);
  assert.match(guardar, /const res = await apiFetch\(ruta, opciones\);/);
  // Lo que vuelve el PATCH (_supplier_dict, con name, contact_name…) se lee con proveedorDeServidor antes de mostrarlo.
  assert.match(guardar, /setSelectedSupplier\(proveedorDeServidor\(res\?\.data\) \?\? \{ \.\.\.selectedSupplier, \.\.\.supplierForm \}\);/);
  assert.ok(!/method: 'PUT'|JSON\.stringify\(supplierForm\)/.test(c), 'ni PUT ni las claves de la pantalla en el cuerpo');
  assert.match(c, /import \{[^}]*\bpeticionGuardarProveedor\b[^}]*\} from '@\/lib\/datos-cliente';/);
}

console.log('--- TEST T24-d (B4 T24: F3 y F4): etiquetaKpi con tiene() y el comentario del redondeo ---');
{
  const fuente = readFileSync(new URL('../src/lib/kpis.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const etiqueta = fuente.slice(fuente.indexOf('export function etiquetaKpi('), fuente.indexOf('\n}\n', fuente.indexOf('export function etiquetaKpi(')));
  assert.ok(!etiqueta.includes('hasOwnProperty.call(CATALOGO_KPI'), 'F3: el catálogo con tiene()');
  assert.match(etiqueta, /const definicion = tiene\(CATALOGO_KPI, id\) \? CATALOGO_KPI\[id\] : null;/);
  const unId = Object.keys(kpisLib.CATALOGO_KPI)[0];
  assert.equal(typeof kpisLib.etiquetaKpi(unId), 'string', 'un id del catálogo sigue dando su etiqueta');
  assert.throws(() => kpisLib.etiquetaKpi('toString'), /Indicador desconocido/, 'un nombre del prototipo no es un indicador');
  // F4: el redondeo de la mitad se aleja del cero en los dos signos (no «hacia arriba»).
  assert.ok(!fuente.includes('redondea la mitad hacia arriba'), 'F4 (a)');
  assert.equal((fuente.match(/la mitad se aleja del cero \(ROUND_HALF_UP\)/g) ?? []).length, 2);
  // F4 (b): ninguna línea de JSDoc del diff de 896b7b3 pasa de 120 caracteres.
  const prefs = readFileSync(new URL('../src/lib/preferencias.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  for (const linea of [fuente.split('\n').find((l) => l.includes('alejándose del cero en los dos sentidos')),
    prefs.split('\n').find((l) => l.includes('(no toca el almacén ni hay PUT).'))]) {
    assert.ok(linea && [...linea].length <= 120, `${[...(linea ?? '')].length}: ${linea}`);
  }
}

console.log('✓ lib/kpis.js: período, estado, variación, tono, formato, tamaño, franja, contador, acento, catálogo y lo de TarjetaKpi.');
